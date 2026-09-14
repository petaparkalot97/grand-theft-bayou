// ---------------------------------------------------------------------------
// voiceCast.js — per-speaker Fish Audio voice mapping for cutscene dialogue.
//
// tools/voiceover-gen.mjs reads this to know which Fish Audio voice
// (`reference_id`) to use for each `c.say("WHO", ...)` speaker tag. Fill in
// the real reference_id values from your Fish Audio account (a stock voice
// or one you cloned) — entries still starting with "TODO" are skipped with
// a warning instead of generating audio, so it's safe to run the pipeline
// before every voice is cast.
//
// Speaker tags with no entry here (one-off radio/PA lines, etc.) fall back
// to DEFAULT_VOICE.
// ---------------------------------------------------------------------------

export const VOICE_CAST = {
  KESEME: { referenceId: "001262690f2a4eea84aa764cc536df24", label: "Keseme Nadia" },
  CHIMI: { referenceId: "48f40b307b964870b6154b437acc239c", label: "Chimi" },
  DIXON: { referenceId: "d67524ad1936410896ad120583cb1117", label: "Dixon" },
  GR33DO: { referenceId: "98e364e9a41c465a9d4fdafc267f84ea", label: "Gr33do" },
  MALLY: { referenceId: "d67524ad1936410896ad120583cb1117", label: "Mally" },
  BUBBA: { referenceId: "98e364e9a41c465a9d4fdafc267f84ea", label: "Bubba" },
  MERCER: { referenceId: "d67524ad1936410896ad120583cb1117", label: "Sheriff Mercer" },
  AMARA: { referenceId: "001262690f2a4eea84aa764cc536df24", label: "Dr. Amara Veaux" },
  EMIKO: { referenceId: "001262690f2a4eea84aa764cc536df24", label: "Emiko" },
  SOLANGE: { referenceId: "fb52b0c3c8a44e41b234da575d009d4c", label: "Solange" },
};

// Shared voice for minor/one-off speakers (GPS, radio hosts, THIEF, etc.)
// that don't warrant their own cast entry.
export const DEFAULT_VOICE = { referenceId: "d67524ad1936410896ad120583cb1117", label: "Narrator (fallback)" };

/** Normalizes a speaker tag (e.g. "KESEME (V.O.)" -> "KESEME") and looks up its voice. */
export function resolveVoice(who) {
  const key = String(who || "").replace(/\s*\(V\.O\.\)\s*$/i, "").trim().toUpperCase();
  return VOICE_CAST[key] || DEFAULT_VOICE;
}
