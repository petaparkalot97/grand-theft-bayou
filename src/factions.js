// ---------------------------------------------------------------------------
// factions.js — Redneck vs Hoodrat territorial warfare.
//
// Rednecks and Hoodrats hold their own territory and ignore each other inside it,
// but in border/crossover zones, a Redneck and a Hoodrat that spot each other
// engage in turf battles without requiring player intervention.
// ---------------------------------------------------------------------------

const SIGHT_RANGE = 22;
const SIGHT_RANGE_SQ = SIGHT_RANGE * SIGHT_RANGE;

/**
 * @param {object} o
 * @param {object} o.npcs        the NPC system instance from createNpcSystem
 * @param {object} o.spawnZones   spawnZones instance (optional, uses isBorder check)
 */
export function createFactionWar({ npcs, spawnZones = null } = {}) {
  let timer = Math.random() * 0.3;

  function update(dt, living) {
    if (!living || !living.length) return;
    timer -= dt;
    if (timer > 0) return;
    timer = 0.35 + Math.random() * 0.1;

    // Filter candidate gang members who are alive and not fleeing/dead
    const candidates = [];
    for (let i = 0; i < living.length; i++) {
      const e = living[i];
      if (!e || e.dead || e.state === "dead" || e.state === "flee") continue;
      if (e.type === "redneck" || e.type === "hoodrat") {
        candidates.push(e);
      }
    }

    if (candidates.length < 2) return;

    for (let i = 0; i < candidates.length; i++) {
      const a = candidates[i];

      // Respect MAX_HOSTILE budget
      if (npcs.hostileCount >= 7) break;

      // If a is already fighting a living rival or engaged in active combat, skip initiating a new fight
      if (a.state === "hostile" && a.rivalTarget && !a.rivalTarget.dead && a.rivalTarget.state !== "dead") {
        continue;
      }

      const aPos = a.spr.position;
      const aInBorder = spawnZones ? spawnZones.isBorder(aPos.x, aPos.z) : !!a.border;

      for (let j = i + 1; j < candidates.length; j++) {
        const b = candidates[j];

        if (a.type === b.type) continue; // Same faction: ignore
        if (b.state === "hostile" && b.rivalTarget && !b.rivalTarget.dead && b.rivalTarget.state !== "dead") {
          continue;
        }

        const bPos = b.spr.position;
        const distSq = (aPos.x - bPos.x) ** 2 + (aPos.z - bPos.z) ** 2;

        if (distSq > SIGHT_RANGE_SQ) continue; // Out of sight range

        const bInBorder = spawnZones ? spawnZones.isBorder(bPos.x, bPos.z) : !!b.border;

        // At least one NPC must be standing in a border zone
        if (!aInBorder && !bInBorder) continue;

        // Both spot each other and fight!
        const aOk = npcs.becomeHostile(a, b);
        if (aOk) {
          npcs.becomeHostile(b, a);
          // Noise of shouting/confrontation alerts nearby bystanders
          npcs.noise((aPos.x + bPos.x) * 0.5, (aPos.z + bPos.z) * 0.5, 18);
        }
        break; // a engaged a rival
      }
    }
  }

  return {
    update,
  };
}
