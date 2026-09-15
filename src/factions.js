// ---------------------------------------------------------------------------
// factions.js — Redneck vs Hoodrat territorial warfare.
//
// Rednecks and Hoodrats hold their own territory and ignore each other inside it,
// but in border/crossover zones, a Redneck and a Hoodrat that spot each other
// engage in turf battles without requiring player intervention.
//
// Fights only start near the player (nobody sees one across the parish, and a
// far fight would hold hostile slots), and they never take the last slots of
// MAX_HOSTILE: those stay free for NPCs the player provokes.
// ---------------------------------------------------------------------------

import { MAX_HOSTILE } from "./npc.js";

const SIGHT_RANGE = 22;
const SIGHT_RANGE_SQ = SIGHT_RANGE * SIGHT_RANGE;
const WATCH_RANGE = 60;       // just past npc.js's NEAR level of detail
const PLAYER_SLOTS = 2;       // hostile slots turf fights leave for the player

/**
 * @param {object} o
 * @param {object} o.npcs        the NPC system instance from createNpcSystem
 * @param {object} o.spawnZones  spawnZones instance (its isBorder check); without it, `e.border`
 */
export function createFactionWar({ npcs, spawnZones = null } = {}) {
  let timer = Math.random() * 0.3;
  const candidates = [];

  const inBorder = (e) => spawnZones
    ? spawnZones.isBorder(e.spr.position.x, e.spr.position.z) : !!e.border;

  /** `living`: NPC records; `player`: {x, z}, or null to ignore distance (unit tests). */
  function update(dt, living, player = null) {
    timer -= dt;
    if (timer > 0 || !living || !living.length) return;
    timer = 0.35 + Math.random() * 0.1;

    // calm gang members only: anyone already hostile (at a rival or at the player) keeps at it
    candidates.length = 0;
    for (const e of living) {
      if (e.dead || e.state === "dead" || e.state === "flee" || e.state === "hostile") continue;
      if (e.type !== "redneck" && e.type !== "hoodrat") continue;
      if (player && Math.hypot(e.spr.position.x - player.x, e.spr.position.z - player.z) > WATCH_RANGE) continue;
      candidates.push(e);
    }

    for (let i = 0; i < candidates.length; i++) {
      if (npcs.hostileCount + 2 > MAX_HOSTILE - PLAYER_SLOTS) break;
      const a = candidates[i];
      if (a.state === "hostile") continue;      // paired up earlier this tick
      const ap = a.spr.position;
      let aBorder = null;                       // looked up only once someone's in sight

      for (let j = i + 1; j < candidates.length; j++) {
        const b = candidates[j];
        if (b.type === a.type || b.state === "hostile") continue;
        const bp = b.spr.position;
        if ((ap.x - bp.x) ** 2 + (ap.z - bp.z) ** 2 > SIGHT_RANGE_SQ) continue;
        if (aBorder === null) aBorder = inBorder(a);
        if (!aBorder && !inBorder(b)) continue;   // at least one of them is on contested ground

        npcs.becomeHostile(a, b);
        npcs.becomeHostile(b, a);
        // the shouting sends bystanders running
        npcs.noise((ap.x + bp.x) * 0.5, (ap.z + bp.z) * 0.5, 18);
        break;
      }
    }
  }

  return { update };
}
