// ---------------------------------------------------------------------------
// voiceover-gen.mjs — generates cutscene voice-over lines via the Fish Audio
// TTS API and writes assets/audio/voice/manifest.json for cinema.js to load
// at runtime.
//
// Scans src/*.js for dialogue lines (`c.say("WHO", "text")` and the local
// `say(c, "WHO", "text")` helper some scene files define), looks up each
// speaker's voice in src/voiceCast.js, and synthesizes any line that isn't
// already cached on disk (skip is the default; --force regenerates).
// Lines whose speaker still has a "TODO" placeholder reference_id are
// skipped with a warning rather than failing the run. A failed synthesis is
// reported as FAILED, never silently swapped for a different voice/model.
//
// Requires FISH_AUDIO_API_KEY in .env (gitignored, not committed).
// Run: npm run voiceover
//   --force            regenerate every line, even ones already cached on disk
//   --character=WHO     only lines spoken by WHO (case-insensitive, e.g. --character=KESEME)
//   --line=SUBSTRING     only lines whose text contains SUBSTRING (case-insensitive)
//   --dry-run            print what would be generated/skipped; no API calls, no writes
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

// Matches c.say("WHO", "text" [, seconds] [, "VOICE_WHO"]) and
// say(c, "WHO", "text" [, seconds] [, "VOICE_WHO"]), with either quote
// style, tolerating escaped quotes inside the strings. The optional 4th
// arg (a string) is a voice-cast override — see cinema.js's say() — used
// when a character's on-screen name should stay the same but their voice
// needs to differ (e.g. before/after a story event).
const STR = (n) => `(['"])((?:\\\\.|(?!\\${n}).)*)\\${n}`;
const SAY_RE_DIRECT = new RegExp(`\\bc\\.say\\(\\s*${STR(1)}\\s*,\\s*${STR(3)}(?:\\s*,\\s*[^,()'"]*)?(?:\\s*,\\s*${STR(5)})?\\s*\\)`, "g");
const SAY_RE_HELPER = new RegExp(`\\bsay\\(c,\\s*${STR(1)}\\s*,\\s*${STR(3)}(?:\\s*,\\s*[^,()'"]*)?(?:\\s*,\\s*${STR(5)})?\\s*\\)`, "g");

function extractLines() {
  const lines = new Map(); // "VOICE_WHO::text" -> { who, text, voiceWho }
  for (const file of readdirSync(SRC_DIR)) {
    if (!file.endsWith(".js")) continue;
    const src = readFileSync(path.join(SRC_DIR, file), "utf8");
    for (const re of [SAY_RE_DIRECT, SAY_RE_HELPER]) {
      for (const m of src.matchAll(re)) {
        const who = unescape(m[2]);
        const text = unescape(m[4]);
        const voiceWho = m[6] ? unescape(m[6]) : who;
        if (!who || !text) continue;
        lines.set(`${voiceWho}::${text}`, { who, text, voiceWho });
      }
    }
  }
  return [...lines.values()];
}

function slug(who) {
  return who.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "line";
}

function fileNameFor(who, text, referenceId = "") {
  const hash = createHash("sha1").update(`${who}::${text}::${referenceId}`).digest("hex").slice(0, 10);
  return `${slug(who)}-${hash}.mp3`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY_DELAYS_MS = [500, 1500, 3000]; // 3 attempts total, increasing backoff

async function synthesizeOnce(text, referenceId) {
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
  const audio = Buffer.from(await res.arrayBuffer());
  if (audio.length === 0) throw new Error("Fish Audio returned an empty body");
  return audio;
}

// Never falls back to a different model/voice on failure — a failed line is
// reported FAILED, not silently replaced, so voices stay consistent per character.
async function synthesize(text, referenceId) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await synthesizeOnce(text, referenceId);
    } catch (err) {
      lastErr = err;
      if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  throw lastErr;
}

function parseArgs(argv) {
  const opts = { force: false, character: null, line: null, dryRun: false };
  for (const arg of argv) {
    if (arg === "--force") opts.force = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("--character=")) opts.character = arg.slice("--character=".length).toUpperCase();
    else if (arg.startsWith("--line=")) opts.line = arg.slice("--line=".length).toLowerCase();
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (!API_KEY) {
    console.error("FISH_AUDIO_API_KEY is not set (checked .env and the environment). Aborting.");
    process.exitCode = 1;
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = existsSync(MANIFEST_PATH) ? JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) : {};

  let dialogueLines = extractLines();
  if (opts.character) {
    dialogueLines = dialogueLines.filter(
      (l) => l.who.toUpperCase() === opts.character || l.voiceWho.toUpperCase() === opts.character
    );
  }
  if (opts.line) dialogueLines = dialogueLines.filter((l) => l.text.toLowerCase().includes(opts.line));

  const skippedVoices = new Set();
  const failedLines = [];
  let generated = 0, cached = 0, failed = 0;

  for (const { who, text, voiceWho } of dialogueLines) {
    const voice = resolveVoice(voiceWho);
    const key = `${voiceWho}::${text}`;
    const displayWho = voiceWho === who ? who : `${who} as ${voiceWho}`;
    const label = `[${displayWho}] "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}"`;
    if (voice.referenceId.startsWith("TODO")) {
      skippedVoices.add(`${voiceWho} (${voice.label})`);
      continue;
    }

    const fileName = fileNameFor(voiceWho, text, voice.referenceId);
    const filePath = path.join(OUT_DIR, fileName);
    const alreadyCached = existsSync(filePath);

    if (alreadyCached && !opts.force) {
      manifest[key] = fileName;
      cached++;
      continue;
    }

    if (opts.dryRun) {
      console.log(`${alreadyCached ? "[FORCE]" : "[GEN]  "} ${label}`);
      continue;
    }

    try {
      const audio = await synthesize(text, voice.referenceId);
      writeFileSync(filePath, audio);
      manifest[key] = fileName;
      generated++;
      console.log(`generated: ${label}`);
    } catch (err) {
      failed++;
      failedLines.push({ who, text, reason: err.message });
      console.error(`failed: ${label} — ${err.message}`);
    }
  }

  if (!opts.dryRun) writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

  console.log("");
  console.log("====================================");
  console.log(opts.dryRun ? "VOICEOVER DRY RUN COMPLETE" : "VOICEOVER GENERATION COMPLETE");
  console.log("====================================");
  console.log(`Generated: ${generated}`);
  console.log(`Cached:    ${cached}`);
  console.log(`Failed:    ${failed}`);
  console.log(`Total:     ${dialogueLines.length}`);
  if (failedLines.length) {
    console.log("");
    console.log("Failed lines:");
    for (const f of failedLines) console.log(`  [${f.who}] "${f.text.slice(0, 60)}" — ${f.reason}`);
  }
  if (skippedVoices.size) {
    console.log("");
    console.log(`Skipped (no voice cast yet in src/voiceCast.js): ${[...skippedVoices].sort().join(", ")}`);
  }
  if (failed > 0) process.exitCode = 1;
}

main();
