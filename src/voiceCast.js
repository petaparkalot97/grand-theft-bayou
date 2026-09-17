// ---------------------------------------------------------------------------
// voiceCast.js — per-speaker Fish Audio voice mapping for cutscenes & dialogue.
//
//   - KESEM NADIA & PETAPARKALOT : f1b549768da341069e84d25c5b354d50
//   - CHIMI                     : 9bfcd2342af343dc92e659628aaafcd7
//   - DIXON                     : 7e6821ce331e4394a59736f12fdb4cd1
//   - GREEDO                    : 0bb73a55b11e4d7eb41336be61c5abf3
//   - RADIO HOST                : 1f7da7179c324f3e8b3603094cd12cbd
//   - POLICE RADIO / PURSUIT    : 504f3f5d6567435aad64c130fb448c2f
//   - STREET NPCs               : pool of 8 Fish Audio model IDs
// ---------------------------------------------------------------------------

export const VOICE_CAST = {
  // Keseme is canonically female (playerCharacters/prologue CAST sex:"f").
  // Was generated with the male street-voice she used to share with Peta;
  // re-recorded with her own female Fish Audio voice (human-provided,
  // 2026-09-17: https://fish.audio/m/98655a12fa944e26b274c535e5e03842/).
  // Regenerate her lines with: npm run voiceover -- --force --character=KESEME
  // (the cache is keyed by voice id, so only her ~104 lines regenerate; the
  // old male takes stay on disk but drop out of manifest.json)
  KESEME: { referenceId: "98655a12fa944e26b274c535e5e03842", label: "Keseme Nadia" },
  KESEM: { referenceId: "98655a12fa944e26b274c535e5e03842", label: "Keseme Nadia" },
  NADIA: { referenceId: "98655a12fa944e26b274c535e5e03842", label: "Keseme Nadia" },
  PETA: { referenceId: "f1b549768da341069e84d25c5b354d50", label: "Petaparkalot" },
  PETAPARKALOT: { referenceId: "f1b549768da341069e84d25c5b354d50", label: "Petaparkalot" },

  CHIMI: { referenceId: "9bfcd2342af343dc92e659628aaafcd7", label: "Chimi" },

  DIXON: { referenceId: "7e6821ce331e4394a59736f12fdb4cd1", label: "Dixon" },

  GR33DO: { referenceId: "0bb73a55b11e4d7eb41336be61c5abf3", label: "Greedo" },
  GREEDO: { referenceId: "0bb73a55b11e4d7eb41336be61c5abf3", label: "Greedo" },

  RADIO: { referenceId: "1f7da7179c324f3e8b3603094cd12cbd", label: "Radio Host" },
  RADIO_HOST: { referenceId: "1f7da7179c324f3e8b3603094cd12cbd", label: "Radio Host" },
  "RADIO HOST": { referenceId: "1f7da7179c324f3e8b3603094cd12cbd", label: "Radio Host" },
  "SECOND HOST": { referenceId: "1f7da7179c324f3e8b3603094cd12cbd", label: "Radio Host" },
  HOST: { referenceId: "1f7da7179c324f3e8b3603094cd12cbd", label: "Radio Host" },

  POLICE: { referenceId: "504f3f5d6567435aad64c130fb448c2f", label: "Police Radio" },
  POLICE_RADIO: { referenceId: "504f3f5d6567435aad64c130fb448c2f", label: "Police Radio" },
  DISPATCH: { referenceId: "504f3f5d6567435aad64c130fb448c2f", label: "Police Radio" },
  MERCER: { referenceId: "504f3f5d6567435aad64c130fb448c2f", label: "Sheriff Mercer / Police Radio" },
  LOUDSPEAKER: { referenceId: "504f3f5d6567435aad64c130fb448c2f", label: "Police Radio" },
  COP: { referenceId: "504f3f5d6567435aad64c130fb448c2f", label: "Police Radio" },

  MALLY: { referenceId: "7e6821ce331e4394a59736f12fdb4cd1", label: "Mally" },
  BUBBA: { referenceId: "0bb73a55b11e4d7eb41336be61c5abf3", label: "Bubba" },
  AMARA: { referenceId: "f1b549768da341069e84d25c5b354d50", label: "Dr. Amara Veaux" },
  EMIKO: { referenceId: "f1b549768da341069e84d25c5b354d50", label: "Emiko" },
  SOLANGE: { referenceId: "f1b549768da341069e84d25c5b354d50", label: "Solange" },

  // Act One part C (welcomeback.js / nolantis.js)
  BELLEFONTAINE: { referenceId: "1f7da7179c324f3e8b3603094cd12cbd", label: "Governor Gus Bellefontaine" },
  GOVERNOR: { referenceId: "1f7da7179c324f3e8b3603094cd12cbd", label: "Governor Gus Bellefontaine" },
  EXECUTIVE: { referenceId: "54e995c017564b558940e09ba3572d76", label: "Corporate executive" },
  VOICE: { referenceId: "504f3f5d6567435aad64c130fb448c2f", label: "Unknown caller (distorted)" },

  // Sync's campaign (syncCampaign.js)
  SYNC: { referenceId: "43f6dcf7d39f4b90bed118f8355c0f73", label: "Sync" },
  UNCLE: { referenceId: "7eaed20411484921bc031de079a44712", label: "Uncle Roscoe (phone)" },
};

export const STREET_NPC_VOICE_IDS = [
  "54e995c017564b558940e09ba3572d76",
  "7eaed20411484921bc031de079a44712",
  "43f6dcf7d39f4b90bed118f8355c0f73",
  "f3d40c731a48406685f60703f789a758",
  "119fb68dbeef4f519189705f0a3461f4",
  "21606ca3d28e48d09217cbdcda0d75f2",
  "cce0e63f4ea54349b209be6ef35d6922",
  "6a6e507ba6cd46e7aa03c7acf0eafc47",
];

export const POLICE_RADIO_VOICE_ID = "504f3f5d6567435aad64c130fb448c2f";

export const DEFAULT_VOICE = { referenceId: "54e995c017564b558940e09ba3572d76", label: "Street NPC Fallback" };

export function getRandomStreetNpcVoiceId(seed = Math.random()) {
  const index = Math.floor(seed * STREET_NPC_VOICE_IDS.length);
  return STREET_NPC_VOICE_IDS[index % STREET_NPC_VOICE_IDS.length];
}

/** Normalizes a speaker tag and looks up its Fish Audio voice. */
export function resolveVoice(who) {
  const key = String(who || "").replace(/\s*\(V\.O\.\)\s*$/i, "").trim().toUpperCase();
  if (VOICE_CAST[key]) return VOICE_CAST[key];
  if (key.includes("POLICE") || key.includes("COP") || key.includes("DISPATCH") || key.includes("LOUDSPEAKER")) {
    return { referenceId: POLICE_RADIO_VOICE_ID, label: "Police Radio" };
  }
  if (key.includes("RADIO") || key.includes("HOST")) {
    return VOICE_CAST.RADIO_HOST;
  }
  const refId = getRandomStreetNpcVoiceId();
  return { referenceId: refId, label: `Street NPC Voice (${refId.slice(0, 6)})` };
}
