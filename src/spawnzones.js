// ---------------------------------------------------------------------------
// spawnzones.js — spawn NPC types based on world context.
//
// Every candidate spawn point is classified into a zone, and the zone decides
// what (if anything) appears there:
//
//   urban        OrleaRouge streets         people, at hangouts; no hogs
//   town         Tusouxroe (north)          people; no hogs
//   commercial   the US-167 strip frontage  people; no hogs
//   residential  trailer park, junkyard     mostly rednecks; no hogs
//   rural        Bayou Noir, cane fields    rednecks, the odd hog along the fields
//   forest       the pines                  an occasional hog, the odd redneck
//   highway      any carriageway            nobody stands on the highway
//   water        the bayou causeway         nobody lives there
//
// Hogs are also capped (HOG_CAP alive at once), so the woods feel wild without
// the parish filling up with them. Regions can override the classification
// (`extraZone`, e.g. westparish.js for Parish Highway 9 and the rural west).
// ---------------------------------------------------------------------------

export const ZONE_MIX = Object.freeze({
  urban: { hoodrat: 0.7, redneck: 0.3 },
  town: { hoodrat: 0.6, redneck: 0.4 },
  commercial: { hoodrat: 0.45, redneck: 0.55 },
  residential: { redneck: 0.75, hoodrat: 0.25 },
  rural: { redneck: 0.6, hoodrat: 0.15, hog: 0.25 },
  forest: { hog: 0.5, redneck: 0.5 },
  highway: null,
  water: null,
});
export const HOG_CAP = 4;

/**
 * @param {object} o
 * @param {object} o.MAP         { minX, maxX, minZ, maxZ }
 * @param {number} o.ROAD_X, o.ROAD_HALF, o.LOT_X
 * @param {Function} o.getOrlea  () => orlearouge module or null
 * @param {Array}  o.residential [{ x, z, r }] patches of homes
 * @param {Function} o.extraZone (x, z) => zone name or null, checked first
 * @param {number} o.coreMinX    the original map's west edge: town / city zones stop here
 */
export function createSpawnZones({ MAP, ROAD_X, ROAD_HALF, LOT_X, getOrlea, residential = [], extraZone = null, coreMinX = -Infinity }) {
  const rand = (lo, hi) => lo + (hi - lo) * Math.random();

  function zoneAt(x, z) {
    const extra = extraZone && extraZone(x, z);
    if (extra) return extra;
    const orlea = getOrlea();
    if (orlea && x >= coreMinX && orlea.inCity(x, z)) return "urban";
    if (z > 136 && z < 196) return "water";
    if (Math.abs(x - ROAD_X) < ROAD_HALF + 4) return "highway";
    if (z < -50 && x >= coreMinX) return "town";
    for (const r of residential) if (Math.hypot(x - r.x, z - r.z) < r.r) return "residential";
    if (Math.abs(x - ROAD_X) < LOT_X + 14) return "commercial";
    return "forest";
  }

  function pickKind(zone, hogsAlive) {
    const mix = ZONE_MIX[zone];
    if (!mix) return null;
    let r = Math.random(), kind = null;
    for (const [k, w] of Object.entries(mix)) {
      if (r < w) { kind = k; break; }
      r -= w;
    }
    kind = kind || Object.keys(mix)[0];
    if (kind === "hog" && hogsAlive >= HOG_CAP) kind = mix.redneck ? "redneck" : null;
    return kind;
  }

  return {
    zoneAt,

    /**
     * A spawn { x, z, kind, zone } near `focus` (out of sight, between minDist
     * and maxDist), or null if this attempt landed somewhere nobody should
     * appear. `living`: current NPC records.
     */
    pick(focus, living, { minDist = 65, maxDist = 105 } = {}) {
      let hogs = 0;
      for (const e of living) if (!e.dead && e.type === "hog") hogs++;

      let x, z;
      if (Math.abs(focus.x - ROAD_X) < 60) {
        // along US-167: ahead of / behind the player, roadside most of the time
        const sign = Math.random() < 0.62 ? -1 : 1;
        z = focus.z + sign * rand(minDist, maxDist);
        const side = Math.random() < 0.5 ? -1 : 1;
        x = ROAD_X + side * (Math.random() < 0.7 ? rand(10, 30) : rand(LOT_X + 16, 118));
      } else {
        // out in the parish: anywhere around the player
        const a = Math.random() * Math.PI * 2, d = rand(minDist, maxDist);
        x = focus.x + Math.cos(a) * d;
        z = focus.z + Math.sin(a) * d;
      }
      x = Math.min(MAP.maxX - 8, Math.max(MAP.minX + 8, x));
      z = Math.min(MAP.maxZ - 12, Math.max(MAP.minZ + 12, z));

      const orlea = getOrlea();
      if (orlea && x >= coreMinX && orlea.inCity(x, z)) {
        // city: people at a hangout rather than inside a building
        const spots = orlea.pois.filter((p) => {
          const d = Math.hypot(p.x - focus.x, p.z - focus.z);
          return d > minDist * 0.9 && d < maxDist * 1.05;
        });
        if (!spots.length) return null;
        const p = spots[(Math.random() * spots.length) | 0];
        x = p.x + rand(-p.r, p.r);
        z = p.z + rand(-p.r, p.r);
      }
      const zone = zoneAt(x, z);
      const kind = pickKind(zone, hogs);
      return kind ? { x, z, kind, zone } : null;
    },
  };
}
