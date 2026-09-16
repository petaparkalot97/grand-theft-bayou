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
  urban: { hoodrat: 0.8, redneck: 0.1, prostitute: 0.1 },
  town: { hoodrat: 0.7, redneck: 0.3 },
  commercial: { hoodrat: 0.40, redneck: 0.50, prostitute: 0.1 },
  border_strip: { hoodrat: 0.45, redneck: 0.45, prostitute: 0.1, border: true },
  border_market: { hoodrat: 0.5, redneck: 0.5, border: true },
  residential: { redneck: 0.82, hoodrat: 0.08, prostitute: 0.1 },
  market_row: { hoodrat: 0.25, redneck: 0.75 },
  rural: { redneck: 0.6, hoodrat: 0.15, hog: 0.25 },
  forest: { hog: 0.5, redneck: 0.5 },
  highway: null,
  water: null,
  // New Zones
  industrial: { dockworker: 0.6, mechanic: 0.2, thug: 0.1, prostitute: 0.1 },
  corporate: { suit: 0.8, tourist: 0.1, hoodrat: 0.1 },
  resort: { tourist: 0.6, suit: 0.2, redneck: 0.1, prostitute: 0.1 }
});
export const HOG_CAP = 4;

// How NPCs cover ground, per zone: `r` scales the radius they wander around
// their hangout (multiplied into the POI's own radius), `speed` scales their
// stroll. Downtown blocks are tight and busy — short trips, quick steps —
// while the parish spreads out: nobody hurries, and a trip is a long one.
export const WANDER = Object.freeze({
  urban:        { r: 0.55, speed: 1.25 },
  town:         { r: 0.8,  speed: 1.1 },
  commercial:   { r: 0.9,  speed: 1.05 },
  border_strip: { r: 0.85, speed: 1.05 },
  border_market:{ r: 0.85, speed: 1.05 },
  residential:  { r: 1.0,  speed: 1.0 },
  market_row:   { r: 0.45, speed: 0.9 },
  rural:        { r: 1.6,  speed: 0.85 },
  forest:       { r: 1.6,  speed: 0.85 },
  highway:      null,
  water:        null,
  // New Zones
  industrial:   { r: 0.6,  speed: 1.0 },
  corporate:    { r: 0.4,  speed: 1.3 },
  resort:       { r: 0.8,  speed: 0.8 }
});
const DEFAULT_WANDER = { r: 1, speed: 1 };

/**
 * @param {object} o
 * @param {object} o.MAP         { minX, maxX, minZ, maxZ }
 * @param {number} o.ROAD_X, o.ROAD_HALF, o.LOT_X
 * @param {Function} o.getOrlea  () => orlearouge module or null
 * @param {Array}  o.residential [{ x, z, r }] patches of homes
 * @param {Function} o.extraZone (x, z) => zone name or null, checked first
 * @param {number} o.coreMinX    the original map's west edge: town / city zones stop here
 * @param {Array}  o.gatherPois  [{ x, z, r }] crowd sinks (Market Row's square): a
 *   sample that lands near one is pulled onto it, so small busy places actually fill
 */
export function createSpawnZones({ MAP, ROAD_X, ROAD_HALF, LOT_X, getOrlea, residential = [], extraZone = null, coreMinX = -Infinity, gatherPois = [], worldTime = null }) {
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
    if (Math.abs(x - ROAD_X) < LOT_X + 14) {
      if (z >= -40 && z <= 40) return "border_strip";
      return "commercial";
    }
    if (x >= 115 && x <= 180 && z >= -30 && z <= 50) return "border_market";
    return "forest";
  }

  function isBorder(x, z) {
    const zName = zoneAt(x, z);
    const mix = ZONE_MIX[zName];
    return !!(mix && mix.border);
  }

  function pickKind(zone, hogsAlive) {
    const mix = ZONE_MIX[zone];
    if (!mix) return null;
    let r = Math.random(), kind = null;
    for (const [k, w] of Object.entries(mix)) {
      if (k === "border") continue;
      if (r < w) { kind = k; break; }
      r -= w;
    }
    kind = kind || Object.keys(mix).find(k => k !== "border");
    if (kind === "hog" && hogsAlive >= HOG_CAP) kind = mix.redneck ? "redneck" : null;
    return kind;
  }

  return {
    zoneAt,
    isBorder,

    /**
     * A spawn { x, z, kind, zone, border } near `focus` (out of sight, between minDist
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
      } else {
        // crowd sinks: the Saturday market, and places like it, are too small
        // for the spawn ring to hit on its own — pull nearby samples onto them
        for (const p of gatherPois) {
          if (Math.hypot(p.x - x, p.z - z) < 55 + (p.r || 0)) {
            const a = Math.random() * Math.PI * 2, rr = Math.random() * (p.r || 5) * 0.8;
            x = p.x + Math.cos(a) * rr;
            z = p.z + Math.sin(a) * rr;
            break;
          }
        }
      }
      const zone = zoneAt(x, z);
      let kind = pickKind(zone, hogs);
      if (kind === "hoodrat" && worldTime && (worldTime.isNight() || worldTime.dusk >= 0.6) && Math.random() < 0.35) {
        if (["urban", "commercial", "border_strip", "border_market", "town"].includes(zone)) {
          kind = "prostitute";
        }
      }
      const border = isBorder(x, z);
      // the wander profile rides along so npc.js doesn't re-derive the zone
      const w = WANDER[zone] || DEFAULT_WANDER;
      return kind ? { x, z, kind, zone, border, wanderR: w.r, wanderSpeed: w.speed } : null;
    },
  };
}
