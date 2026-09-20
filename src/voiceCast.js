// ---------------------------------------------------------------------------
// voiceCast.js — per-speaker Fish Audio voice mapping for cutscenes & dialogue.
//
//   - KESEME NADIA               : 98655a12fa944e26b274c535e5e03842
//   - PETAPARKALOT                : f1b549768da341069e84d25c5b354d50
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
  // Keseme pre-surgery, in missionClinic.js only: she's still presenting
  // male at this point in the story (the mission *is* her transition).
  // Used via c.say("KESEME", text, undefined, "KESEME_PRE_TRANSITION") so
  // the on-screen name stays "KESEME" while the voice differs. Once she's
  // out of surgery (mid-mission), her lines switch back to plain "KESEME".
  KESEME_PRE_TRANSITION: { referenceId: "674a8582a44a49688cef160a56ffff6f", label: "Keseme Nadia (pre-transition)" },
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
  SYNC: { referenceId: "d269c1a386044cb183bbf7e4a02eb919", label: "Sync" },
  UNCLE: { referenceId: "f212cebdad124957908119daa634037c", label: "Uncle Scunter" },

  // Pedestrian barks (bump/fight one-liners) — src/pedestrianChatter.js,
  // human-provided Fish Audio voices, 2026-09-19. Fixed-look archetypes (flat
  // 2D sprite atlases: redneck/dockworker/mechanic/suit/tourist — no gender
  // variance) get one voice each. The 3D-rig archetypes that spawn either sex
  // at random (hoodrat/hobo/thug — characters.js randomHoodrat/randomHobo)
  // get a _M and _F voice, picked at runtime by the NPC's own rolled sex
  // (spr.female). Prostitute is always female (randomProstitute). See
  // pedestrianVoiceWho() below for the lookup. Hogs are non-verbal — no entry.
  REDNECK: { referenceId: "fee420f4813d4318bfea84f8f6cac53f", label: "Redneck pedestrian ('redneck')" },
  DOCKWORKER: { referenceId: "1444a58d66a44522b37a220991eeaa92", label: "Dockworker ('Halpin')" },
  MECHANIC: { referenceId: "78eda55526de4a1aa02d5f1ff5b0112b", label: "Mechanic ('gangster')" },
  SUIT: { referenceId: "2096c0a564a84411aaf66ac5c529276b", label: "Suit ('The gangster')" },
  // Fish Audio's own tag says this voice is Female, despite being filed under
  // the human's "male" list — flagged and kept here per their call (2026-09-19).
  TOURIST: { referenceId: "8ecf92e817ef45e081c45da1919352fc", label: "Tourist ('Rednex')" },
  // Frenchmen Street regulars (pedestrianChatter.js gayman / lesbian). Stand-ins from
  // the street pool until they get voices of their own.
  GAYMAN: { referenceId: "54e995c017564b558940e09ba3572d76", label: "Gay man pedestrian (street fallback voice)" },
  LESBIAN: { referenceId: "f1b549768da341069e84d25c5b354d50", label: "Lesbian pedestrian (stand-in voice)" },
  PROSTITUTE: { referenceId: "dd45c68688f34c3bac818c5b30acf927", label: "Prostitute ('sexy slut')" },
  HOODRAT_M: { referenceId: "2096c0a564a84411aaf66ac5c529276b", label: "Hoodrat, male ('The gangster')" },
  HOODRAT_F: { referenceId: "8b72b4a3a27a4d89821ca6e556984ec3", label: "Hoodrat, female ('SluT')" },
  HOBO_M: { referenceId: "1444a58d66a44522b37a220991eeaa92", label: "Hobo, male ('Halpin')" },
  HOBO_F: { referenceId: "55a1a59b8b444e5296bf074bf1d9bc8f", label: "Hobo, female ('Black')" },
  THUG_M: { referenceId: "78eda55526de4a1aa02d5f1ff5b0112b", label: "Thug, male ('gangster')" },
  THUG_F: { referenceId: "ae1ddccb96a144e399daa1aaac37b8d5", label: "Thug, female ('Slut')" },
};

/** Which VOICE_CAST key a pedestrian bark should use, or null for the
 * non-verbal types (hogs only grunt — see pedestrianChatter.js). */
export function pedestrianVoiceWho(type, female) {
  const t = String(type || "").toUpperCase();
  if (t === "HOG") return null;
  if (t === "HOODRAT" || t === "HOBO" || t === "THUG") return `${t}_${female ? "F" : "M"}`;
  return t;
}

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
