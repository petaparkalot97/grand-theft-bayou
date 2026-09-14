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
  KESEME: { referenceId: "TODO-keseme", label: "Keseme Nadia" },
  CHIMI: { referenceId: "TODO-chimi", label: "Chimi" },
  DIXON: { referenceId: "TODO-dixon", label: "Dixon" },
  GR33DO: { referenceId: "TODO-gr33do", label: "Gr33do" },
  MALLY: { referenceId: "TODO-mally", label: "Mally" },
  BUBBA: { referenceId: "TODO-bubba", label: "Bubba" },
  MERCER: { referenceId: "TODO-mercer", label: "Sheriff Mercer" },
  AMARA: { referenceId: "TODO-amara", label: "Dr. Amara Veaux" },
  EMIKO: { referenceId: "TODO-emiko", label: "Emiko" },
  SOLANGE: { referenceId: "TODO-solange", label: "Solange" },
};

// Shared voice for minor/one-off speakers (GPS, radio hosts, THIEF, etc.)
// that don't warrant their own cast entry.
export const DEFAULT_VOICE = { referenceId: "TODO-narrator", label: "Narrator (fallback)" };

/** Normalizes a speaker tag (e.g. "KESEME (V.O.)" -> "KESEME") and looks up its voice. */
export function resolveVoice(who) {
  const key = String(who || "").replace(/\s*\(V\.O\.\)\s*$/i, "").trim().toUpperCase();
  return VOICE_CAST[key] || DEFAULT_VOICE;
}
