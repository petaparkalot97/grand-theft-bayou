// ---------------------------------------------------------------------------
// voiceover-gen.mjs — generates cutscene voice-over lines via the Fish Audio
// TTS API and writes assets/audio/voice/manifest.json for cinema.js to load
// at runtime.
//
// Scans src/*.js for dialogue lines (`c.say("WHO", "text")` and the local
// `say(c, "WHO", "text")` helper some scene files define), looks up each
// speaker's voice in src/voiceCast.js, and synthesizes any line that isn't
// already cached on disk. Lines whose speaker still has a "TODO" placeholder
// reference_id are skipped with a warning rather than failing the run.
//
// Requires FISH_AUDIO_API_KEY in .env (gitignored, not committed).
// Run: npm run voiceover
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { resolveVoice } from "../src/voiceCast.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC_DIR = path.join(ROOT, "src");
const OUT_DIR = path.join(ROOT, "assets", "audio", "voice");
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");
const FISH_TTS_URL = "https://api.fish.audio/v1/tts";

function loadDotEnv() {
  const envPath = path.join(ROOT, ".env");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (m && !m[1].startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...loadDotEnv(), ...process.env };
const API_KEY = env.FISH_AUDIO_API_KEY;
const MODEL = env.FISH_AUDIO_MODEL || "s2.1-pro-free";

function unescape(s) {
  return s.replace(/\\(.)/g, "$1");
}

// Matches c.say("WHO", "text" [, seconds]) and say(c, "WHO", "text" [, seconds]),
// with either quote style, tolerating escaped quotes inside the strings.
const STR = (n) => `(['"])((?:\\\\.|(?!\\${n}).)*)\\${n}`;
const SAY_RE_DIRECT = new RegExp(`\\bc\\.say\\(\\s*${STR(1)}\\s*,\\s*${STR(3)}`, "g");
const SAY_RE_HELPER = new RegExp(`\\bsay\\(c,\\s*${STR(1)}\\s*,\\s*${STR(3)}`, "g");

function extractLines() {
  const lines = new Map(); // "WHO::text" -> { who, text }
  for (const file of readdirSync(SRC_DIR)) {
    if (!file.endsWith(".js")) continue;
    const src = readFileSync(path.join(SRC_DIR, file), "utf8");
    for (const re of [SAY_RE_DIRECT, SAY_RE_HELPER]) {
      for (const m of src.matchAll(re)) {
        const who = unescape(m[2]);
        const text = unescape(m[4]);
        if (!who || !text) continue;
        lines.set(`${who}::${text}`, { who, text });
      }
    }
  }
  return [...lines.values()];
}

function slug(who) {
  return who.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "line";
}

function fileNameFor(who, text) {
  const hash = createHash("sha1").update(`${who}::${text}`).digest("hex").slice(0, 10);
  return `${slug(who)}-${hash}.mp3`;
}

async function synthesize(text, referenceId) {
  const res = await fetch(FISH_TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      model: MODEL,
    },
    body: JSON.stringify({ text, reference_id: referenceId, format: "mp3" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Fish Audio ${res.status}: ${body.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  if (!API_KEY) {
    console.error("FISH_AUDIO_API_KEY is not set (checked .env and the environment). Aborting.");
    process.exitCode = 1;
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) : {};

  const dialogueLines = extractLines();
  const skippedVoices = new Set();
  let generated = 0, cached = 0, failed = 0;

  for (const { who, text } of dialogueLines) {
    const voice = resolveVoice(who);
    const key = `${who}::${text}`;
    if (voice.referenceId.startsWith("TODO")) {
      skippedVoices.add(`${who} (${voice.label})`);
      continue;
    }

    const fileName = fileNameFor(who, text);
    const filePath = path.join(OUT_DIR, fileName);
    if (existsSync(filePath)) {
      manifest[key] = fileName;
      cached++;
      continue;
    }

    try {
      const audio = await synthesize(text, voice.referenceId);
      writeFileSync(filePath, audio);
      manifest[key] = fileName;
      generated++;
      console.log(`generated: [${who}] "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}"`);
    } catch (err) {
      failed++;
      console.error(`failed: [${who}] "${text.slice(0, 60)}" — ${err.message}`);
    }
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

  console.log("");
  console.log(`voiceover: ${generated} generated, ${cached} already cached, ${failed} failed.`);
  if (skippedVoices.size) {
    console.log(`skipped (no voice cast yet in src/voiceCast.js): ${[...skippedVoices].sort().join(", ")}`);
  }
}

main();
