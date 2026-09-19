// ---------------------------------------------------------------------------
// ai.js — natural-language placement for the $DEVMODE69xxx map editor.
//
// The client sends a free-text prompt plus grounding context (an anchor
// point, a handful of nearby placements, and the exact catalog of valid
// asset keys); this module turns that into a chat completion against
// OpenRouter (https://openrouter.ai — one API, many providers, and a real
// free tier) and parses the reply into a strict list of
// { catalogKey, dx, dz, ry } placements relative to the anchor.
//
// OPENROUTER_API_KEY must be set in the environment (or .env, same loader
// as tools/voiceover-gen.mjs) — this module returns a clear "not configured"
// error rather than throwing when it's missing, so a deploy without the key
// just disables the AI panel instead of crashing the server.
//
// OPENROUTER_MODELS optionally overrides the fallback chain (comma-separated
// OpenRouter model ids, tried in order until one answers). The default list
// is free-tier models as of when this was written — OpenRouter's free
// lineup changes over time, so if every model in it 404s, set
// OPENROUTER_MODELS yourself rather than waiting for a code update.
// ---------------------------------------------------------------------------

// Verified against OpenRouter's live /api/v1/models list (2026-09-19) —
// text->text, no vision needed, largest/most capable free-tier ones first.
// That list moves fast; if every one of these starts 404ing, re-check it
// rather than guessing new ids.
const DEFAULT_MODELS = [
  "deepseek/deepseek-v4-flash-0731:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
];

function models(env) {
  const raw = (env.OPENROUTER_MODELS || "").trim();
  if (!raw) return DEFAULT_MODELS;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function systemPrompt(catalog) {
  const list = catalog.map((c) => `${c.key} — ${c.label} (${c.w}m x ${c.d}m)`).join("\n");
  return `You place buildings in a small top-down city-builder tool. You get an
anchor point (where the person is looking) and a short list of what's
already nearby, in meters, +x is east and +z is south. Reply with ONLY a
JSON array (no prose, no markdown fences), each entry:
{"catalogKey": "<one of the keys below>", "dx": <meters east of anchor>, "dz": <meters south of anchor>, "ry": <radians, 0 = facing +z>}
Place things at a sensible scale for their footprint, don't overlap existing
nearby items or each other, and keep every dx/dz within 60 meters of the
anchor. Use ONLY these catalog keys, exactly as spelled:
${list}
If the request is unclear or asks for something not in the list, make the
closest reasonable substitution rather than refusing. Never invent a key.`;
}

async function callModel(model, apiKey, messages, signal) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://grand-theft-bayou-c2l.pages.dev",
      "X-Title": "Grand Theft Bayou map editor",
    },
    body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 800 }),
    signal,
  });
  if (!res.ok) throw new Error(`${model}: HTTP ${res.status}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${model}: empty response`);
  return text;
}

// Models occasionally wrap JSON in prose or a markdown fence despite the
// instruction not to — pull out the first top-level [...] rather than
// trusting the whole reply to be clean JSON.
function extractJsonArray(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON array in reply");
  return JSON.parse(text.slice(start, end + 1));
}

export async function placeWithAI({ prompt, anchor, nearby, catalog }, env) {
  const apiKey = (env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) return { ok: false, error: "OPENROUTER_API_KEY is not set on the server" };
  if (!prompt || typeof prompt !== "string") return { ok: false, error: "missing prompt" };
  if (!Array.isArray(catalog) || !catalog.length) return { ok: false, error: "missing catalog" };

  const validKeys = new Set(catalog.map((c) => c.key));
  const nearbyLine = Array.isArray(nearby) && nearby.length
    ? nearby.map((n) => `${n.catalogKey} at (${Math.round(n.dx)}, ${Math.round(n.dz)})`).join("; ")
    : "nothing placed nearby yet";
  const messages = [
    { role: "system", content: systemPrompt(catalog) },
    { role: "user", content: `Anchor: (0, 0). Nearby already placed: ${nearbyLine}.\nRequest: ${prompt}` },
  ];

  const chain = models(env);
  const errors = [];
  for (const model of chain) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      let text;
      try {
        text = await callModel(model, apiKey, messages, controller.signal);
      } finally {
        clearTimeout(timeout);
      }
      const parsed = extractJsonArray(text);
      const placements = parsed
        .filter((p) => p && validKeys.has(p.catalogKey) && Number.isFinite(p.dx) && Number.isFinite(p.dz))
        .slice(0, 24)
        .map((p) => ({
          catalogKey: p.catalogKey,
          x: anchor.x + clamp(p.dx, -60, 60),
          z: anchor.z + clamp(p.dz, -60, 60),
          ry: Number.isFinite(p.ry) ? p.ry : 0,
        }));
      if (!placements.length) throw new Error("reply had no valid placements");
      return { ok: true, placements, model };
    } catch (err) {
      errors.push(`${model}: ${err.message || err}`);
    }
  }
  return { ok: false, error: `every model failed — ${errors.join(" | ")}` };
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
