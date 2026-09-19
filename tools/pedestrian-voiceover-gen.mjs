// ---------------------------------------------------------------------------
// pedestrian-voiceover-gen.mjs — generates pedestrian bark audio (bump/fight
// one-liners) via the Fish Audio TTS API and writes into the same
// assets/audio/voice/manifest.json tools/voiceover-gen.mjs uses for cutscene
// dialogue. cinema.js's playVoiceLine() reads that one manifest regardless
// of which generator produced an entry.
//
// Unlike voiceover-gen.mjs (which regex-scans src/*.js for c.say() calls),
// this reads its lines straight from src/pedestrianChatter.js's
// allVoiceLines() — pedestrian barks are data, not scripted dialogue calls —
// and resolves each one's voice via src/voiceCast.js (VOICE_CAST keys
// REDNECK, HOODRAT_M/_F, etc. — see pedestrianVoiceWho()).
//
// Requires FISH_AUDIO_API_KEY in .env (gitignored, not committed). See
// docs/VOICE_GENERATION.md for the shared background (free vs. paid model,
// the content-hashed filename scheme, troubleshooting).
//
// Run: node tools/pedestrian-voiceover-gen.mjs
//   --force              regenerate every line, even ones already cached on disk
//   --character=WHO       only lines for voice key WHO (case-insensitive, e.g. --character=REDNECK)
//   --dry-run             print what would be generated/skipped; no API calls, no writes
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { resolveVoice } from "../src/voiceCast.js";
import { allVoiceLines } from "../src/pedestrianChatter.js";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
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
// reported FAILED, not silently replaced, so voices stay consistent per archetype.
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
  const opts = { force: false, character: null, dryRun: false };
  for (const arg of argv) {
    if (arg === "--force") opts.force = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("--character=")) opts.character = arg.slice("--character=".length).toUpperCase();
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

  let lines = allVoiceLines();
  if (opts.character) lines = lines.filter((l) => l.voiceWho.toUpperCase() === opts.character);

  const skippedVoices = new Set();
  const failedLines = [];
  let generated = 0, cached = 0, failed = 0;

  for (const { voiceWho, text } of lines) {
    const voice = resolveVoice(voiceWho);
    const key = `${voiceWho}::${text}`;
    const label = `[${voiceWho}] "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}"`;
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
      failedLines.push({ voiceWho, text, reason: err.message });
      console.error(`failed: ${label} — ${err.message}`);
    }
  }

  if (!opts.dryRun) writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");

  console.log("");
  console.log("====================================");
  console.log(opts.dryRun ? "PEDESTRIAN VOICEOVER DRY RUN COMPLETE" : "PEDESTRIAN VOICEOVER GENERATION COMPLETE");
  console.log("====================================");
  console.log(`Generated: ${generated}`);
  console.log(`Cached:    ${cached}`);
  console.log(`Failed:    ${failed}`);
  console.log(`Total:     ${lines.length}`);
  if (failedLines.length) {
    console.log("");
    console.log("Failed lines:");
    for (const f of failedLines) console.log(`  [${f.voiceWho}] "${f.text.slice(0, 60)}" — ${f.reason}`);
  }
  if (skippedVoices.size) {
    console.log("");
    console.log(`Skipped (no voice cast yet in src/voiceCast.js): ${[...skippedVoices].sort().join(", ")}`);
  }
  if (failed > 0) process.exitCode = 1;
}

main();
