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
//   entertainment the Crown Strip           casino/nightclub patrons and staff; no hogs
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
  // OrleaRouge is the state's neon crime capital: nightlife regulars, escorts,
  // street crews, and ordinary bar traffic share the same blocks. Keep everyone
  // civilian by default; NPC aggression still only starts after provocation.
  urban: { hoodrat: 0.28, prostitute: 0.15, gayman: 0.09, lesbian: 0.09,
           thug: 0.14, tuxedo: 0.12, highendescort: 0.1, redneck: 0.03 },
  town: { hoodrat: 0.56, redneck: 0.23, hobo: 0.13, gayman: 0.04, lesbian: 0.04 },
  commercial: { hoodrat: 0.32, redneck: 0.44, prostitute: 0.18, gayman: 0.03, lesbian: 0.03 },
  border_strip: { hoodrat: 0.36, redneck: 0.46, prostitute: 0.18, border: true },
  border_market: { hoodrat: 0.42, redneck: 0.43, prostitute: 0.15, border: true },
  residential: { redneck: 0.60, hoodrat: 0.08, hobo: 0.32 },
  market_row: { hoodrat: 0.25, redneck: 0.75 },
  rural: { redneck: 0.6, hoodrat: 0.15, hog: 0.25 },
  forest: { hog: 0.5, redneck: 0.5 },
  highway: null,
  water: null,
  // New Zones
  industrial: { dockworker: 0.6, mechanic: 0.2, thug: 0.1, prostitute: 0.1 },
  corporate: { suit: 0.8, tourist: 0.1, hoodrat: 0.1 },
  resort: { tourist: 0.6, suit: 0.2, redneck: 0.1, prostitute: 0.1 },
  // The Crown Strip (tusouxroeNorth.js): five casinos and nine bars and clubs
  // down North Ave 2, so the crowd is whoever a casino row draws — patrons in
  // jackets, tourists off the highway, escorts working the doors, and street
  // crews. Still civilian until provoked, exactly like OrleaRouge's blocks.
  entertainment: { tuxedo: 0.2, tourist: 0.16, hoodrat: 0.16, highendescort: 0.12, prostitute: 0.12,
                   gayman: 0.08, lesbian: 0.08, suit: 0.08 }
});
export const HOG_CAP = 4;

// ---------------------------------------------------------------------------
// ZOMBIE_DENSITY — how eagerly the zombie-mode horde fills each zone
// (TASK-078/079 wave; consumed by main.js's updateZombiePopulation — see the
// Integration notes there). One multiplier per zone name in ZONE_MIX, 1 = the
// TASK-077 baseline spawn rate, 0 = zombies never spawn there.
//
// The shape mirrors WANDER above: a parallel per-zone table next to the one
// it mirrors. Reasoning per zone:
//
//   entertainment 1.6  the Crown Strip — dense crowds, nightlife, "high-risk
//                      outbreak" is the whole fantasy; the Strip pays for
//                      being the signature location
//   urban         1.5  OrleaRouge — the same logic, the city that never sleeps
//                      now literally doesn't
//   commercial    1.2  the US-167 strip frontage — shops, some crowds
//   industrial    1.2  docks and yards: plenty of cover, few witnesses
//   border_strip  1.1  the Chatboro crossroads — where everyone passes
//   border_market 1.1  the Saturday market and its edges
//   market_row    1.0  East Bank's market row — ordinary street density
//   town          0.9  Tusouxroe — spread out, slower to fall
//   residential   0.8  trailer park and junkyard patches — people kept to
//                      themselves out here; the horde is thinner
//   corporate     0.8  glass and plazas — sparse foot traffic even at the best
//                      of times
//   resort        0.7  tourists fled; those left make stories, not hordes
//   rural         0.4  cane fields and Bayou Noir — the outbreak is a city
//                      thing; out here you meet one, not fifteen
//   forest        0.3  the pines — almost nothing; the woods should feel
//                      empty and watchful, not crawling
//   highway       0    MUTUALLY REQUIRED (main.js spawns nothing here; a
//                      zombie shuffling down the carriageway is a bug, not
//                      atmosphere — same rule as the civilians' null mix)
//   water         0    the bayou causeway — same rule; nothing stands in the
//                      water
// ---------------------------------------------------------------------------
export const ZOMBIE_DENSITY = Object.freeze({
  entertainment: 1.6,
  urban: 1.5,
  commercial: 1.2,
  industrial: 1.2,
  border_strip: 1.1,
  border_market: 1.1,
  market_row: 1.0,
  town: 0.9,
  residential: 0.8,
  corporate: 0.8,
  resort: 0.7,
  rural: 0.4,
  forest: 0.3,
  highway: 0,
  water: 0,
});

const DEFAULT_ZOMBIE_DENSITY = 0.5;   // unknown zone: sparse, never dense

/**
 * The zombie density multiplier at a world position. Safe to call anywhere —
 * a zone with no table entry falls back to the sparse default rather than
 * `undefined` silently multiplying into NaN. The main.js integration is a
 * one-liner: multiply updateZombiePopulation's respawn cooldown (or its
 * per-attempt accept rate) by this.
 * @param {number} x
 * @param {number} z
 * @returns {number} 0 (never spawns) … 1 (baseline) … >1 (denser)
 */
export function zombieDensityAt(x, z, zoneAtFn = null) {
  const zone = zoneAtFn ? zoneAtFn(x, z) : null;
  if (zone == null) return DEFAULT_ZOMBIE_DENSITY;
  const d = ZOMBIE_DENSITY[zone];
  return d == null ? DEFAULT_ZOMBIE_DENSITY : d;
}

/**
 * Convenience wrapper so main.js's updateZombiePopulation stays one line:
 * accepts the spawn-system object spawnzones.createSpawnZones() returns and
 * reads zones through its own zoneAt (respects extraZone and OrleaRouge).
 * @param {{ zoneAt: Function }} spawnZones
 * @param {number} x
 * @param {number} z
 */
export function zombieDensityAtSpawn(spawnZones, x, z) {
  return zombieDensityAt(x, z, spawnZones && spawnZones.zoneAt);
}

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
  resort:       { r: 0.8,  speed: 0.8 },
  entertainment:{ r: 0.5,  speed: 1.2 }        // the Strip: short trips between doors
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
    pick(focus, living, { minDist = 65, maxDist = 105, forZombie = false } = {}) {
      let hogs = 0;
      for (const e of living) if (!e.dead && e.type === "hog") hogs++;

      let x, z;
      if (!forZombie && Math.abs(focus.x - ROAD_X) < 60) {
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
      
      if (forZombie && zone !== "building" && zone !== "water" && zone !== "highway") {
        kind = "zombie";
      }

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
