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

// Who will fight whom on sight. Rednecks and Hoodrats have always been the
// pair; klansmen (klan.js) are the third, and the asymmetry is the point —
// Hoodrats square up to them, Rednecks do not, because in this parish those are
// the same people with the hoods off. A klansman only exists during a set
// piece, so this costs nothing the rest of the time.
const ENEMIES_OF = {
  redneck: new Set(["hoodrat"]),
  hoodrat: new Set(["redneck", "klansman"]),
  klansman: new Set(["hoodrat"]),
};
const FIGHTERS = new Set(Object.keys(ENEMIES_OF));

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
  const engaged = [];       // klansmen already fighting: targetable, never instigators

  const inBorder = (e) => spawnZones
    ? spawnZones.isBorder(e.spr.position.x, e.spr.position.z) : !!e.border;

  /** `living`: NPC records; `player`: {x, z}, or null to ignore distance (unit tests). */
  function update(dt, living, player = null) {
    timer -= dt;
    if (timer > 0 || !living || !living.length) return;
    timer = 0.35 + Math.random() * 0.1;

    // calm gang members only: anyone already hostile (at a rival or at the player) keeps at it
    candidates.length = 0;
    engaged.length = 0;
    for (const e of living) {
      if (e.dead || e.state === "dead" || e.state === "flee") continue;
      if (!FIGHTERS.has(e.type)) continue;
      if (player && Math.hypot(e.spr.position.x - player.x, e.spr.position.z - player.z) > WATCH_RANGE) continue;
      if (e.state === "hostile") {
        // A klansman is hostile from the moment he is called out — the set
        // piece provokes the whole mob at the player. Left out of the pairing
        // entirely he would be unfightable by anyone else, and a Hoodrat
        // standing by while a night ride happens is the one thing this
        // shouldn't do. So he stays available as a target, never as an
        // instigator; everyone else still drops out once they are busy.
        if (e.type === "klansman") engaged.push(e);
        continue;
      }
      candidates.push(e);
    }

    for (let i = 0; i < candidates.length; i++) {
      if (npcs.hostileCount + 2 > MAX_HOSTILE - PLAYER_SLOTS) break;
      const a = candidates[i];
      if (a.state === "hostile") continue;      // paired up earlier this tick
      const ap = a.spr.position;
      let aBorder = null;                       // looked up only once someone's in sight

      // his own kind first, then anyone already swinging at someone else
      const pool = ENEMIES_OF[a.type].has("klansman") ? engaged : null;
      const reach = candidates.length + (pool ? pool.length : 0);
      for (let j = i + 1; j < reach; j++) {
        const b = j < candidates.length ? candidates[j] : pool[j - candidates.length];
        if (!b || b === a || !ENEMIES_OF[a.type].has(b.type)) continue;
        if (b.state === "hostile" && b.type !== "klansman") continue;
        const bp = b.spr.position;
        if ((ap.x - bp.x) ** 2 + (ap.z - bp.z) ** 2 > SIGHT_RANGE_SQ) continue;
        // A klansman is not part of the turf map — he is wherever a set piece
        // put him — so the contested-ground gate does not apply to him.
        if (a.type !== "klansman" && b.type !== "klansman") {
          if (aBorder === null) aBorder = inBorder(a);
          if (!aBorder && !inBorder(b)) continue;   // at least one of them is on contested ground
        }

        npcs.becomeHostile(a, b);
        // Point b back at a, except for a klansman who is already swinging at
        // the player: becomeHostile fills in a missing rivalTarget, which for
        // him is null, so it would quietly drag him off Keseme and onto the
        // Hoodrat. He keeps his target and simply has two problems.
        if (!(b.type === "klansman" && b.state === "hostile")) npcs.becomeHostile(b, a);
        // the shouting sends bystanders running
        npcs.noise((ap.x + bp.x) * 0.5, (ap.z + bp.z) * 0.5, 18);
        break;
      }
    }
  }

  return { update };
}
