// ---------------------------------------------------------------------------
// roadside.js — the long roads between the districts (TASK-084).
//
// US-167 runs the whole 2.4 km of the map, and the four connector highways run
// a kilometre each from it to Oyster Bay, Port Calypso, Red Dust and the
// Lakeshore. All of it was a bare road through black. This builds each stretch
// as a composer district of its own: the road is registered (so nothing lands on
// it and the spawn classifier knows it), then farmsteads, roadside stops,
// trailers, churches and billboards line it at country spacing (about half the
// slots are left empty on purpose), pole lines follow it, and a forest thickens
// behind. The mix comes from the profile: farmland north, bayou south, scrub
// toward Red Dust, freight toward the port.
//
//   buildRoadside(R, { name, seed, bounds, road, profile, junctions, ... })
// ---------------------------------------------------------------------------

import { createComposer } from "./composer.js";

const NAMES = ["PRODUCE", "FIREWORKS", "ANTIQUES & JUNK", "BOILED PEANUTS", "LIVE BAIT", "USED TIRES", "HUNTING SUPPLY", "PECANS", "SNOWBALLS", "FEED & SEED"];

/** The catalogue of roadside things a profile can weight. Each takes a composer slot. */
function catalogue(kit, ctx) {
  const { houses, shops } = kit;
  const barn = shops.barn();
  const stand = shops.strip({ names: NAMES, bgs: ["#7a1f12", "#1f4a7a", "#1f6a3a", "#7a5a12"] });
  const tire = shops.strip({ names: ["TIRES & LUBE", "AUTO PARTS", "TRANSMISSION", "BODY SHOP"], bgs: ["#2a2a2a", "#7a1f12"] });
  const motel = shops.motel({ name: "ROADSIDE MOTEL" }), diner = shops.diner({ name: "MAMA JEAN'S" });
  const gas = [shops.gasStop({ name: "GAS & GO", band: 0xc0392b, sign: "#c0392b" }), shops.gasStop({ name: "PIT STOP", band: 0x1f6a3a, sign: "#1f6a3a" }), shops.gasStop({ name: "FUEL 24", band: 0x1f4a7a, sign: "#1f4a7a" })];
  const church = shops.church({ name: "Roadside Chapel" });
  const shed = shops.warehouse({ tone: 0x8a8f96, w: 20, d: 14, h: 5.5 });
  return {
    farm: (slot) => {
      const ok = houses.farmhouse(slot);
      if (kit.hash(slot.x, slot.z, 81) < 0.7) { const [bx, bz] = kit.at(slot, kit.hash(slot.x, slot.z, 82) < 0.5 ? 16 : -16, -12); barn({ ...slot, x: bx, z: bz }); }
      return ok;
    },
    bungalow: houses.bungalow, cottage: houses.cottage, trailer: houses.trailer, cabin: houses.cabin, stilt: houses.stilt, shotgun: houses.shotgun,
    stand, tire, motel, diner, church, shed,
    gas: (slot) => gas[Math.floor(kit.hash(slot.x, slot.z, 83) * gas.length)](slot),
  };
}

/**
 * @param {object} R stateWorld's shared environment
 * @param {object} o
 * @param {string} o.name
 * @param {number} o.seed
 * @param {{x0,x1,z0,z1}} o.bounds     the composer grid: the road, its frontage and the forest
 * @param {{name, points, width, dirt?}} o.road   axis-aligned; registered with paved: false (the road already exists), or laid as a dirt track with `dirt: true`
 * @param {Array} o.junctions          [{ name, points, width }] side roads to register so they stay clear
 * @param {Array} o.avoid              [{ at, r }]  coordinate along the road to keep clear of (junctions)
 * @param {object} o.profile
 *   .mix        [[weight, kind]] of catalogue kinds
 *   .density    0..1 chance a slot is built
 *   .setback, .spacing, .footprint    frontage geometry
 *   .forced     [{ at, side, kind }]  a stop that must be built near coordinate `at` on `side`
 *   .forest     { spacing, shape?, trunk, foliage }
 *   .billboards [{ at, side (+1: east / south, world), ry, headline, sub, graffiti }]
 *   .zone       spawn zone for open ground (default "rural")
 */
export function buildRoadside(R, { name, seed, bounds, road, junctions = [], avoid = [], profile, poles = true }) {
  const { ctx, kit } = R;
  const C = createComposer(ctx, { name, bounds, zones: { wild: bounds }, seed });
  R.composers.push(C);
  const kinds = catalogue(kit, ctx);
  const [[ax, az], [bx, bz]] = [road.points[0], road.points[road.points.length - 1]];
  const alongX = az === bz;
  const coord = (slot) => (alongX ? slot.x : slot.z);
  const total = profile.mix.reduce((a, [w]) => a + w, 0);

  // a dirt track is laid here (its own surface); the highways already have theirs
  const dirtRoad = road.dirt ? { paved: true, material: () => kit.mat(0x9a7448, "packed dirt", 1), y: 0.022 } : { paved: false };
  C.road(road.name, road.points, { width: road.width, sidewalk: 0, centreLine: false, ...dirtRoad });
  for (const j of junctions) C.road(j.name, j.points, { width: j.width, sidewalk: 0, centreLine: false, paved: false });

  const near = (slot, at, r) => Math.abs(coord(slot) - at) < r;
  C.frontage(road.name, {
    label: name, setback: profile.setback ?? 22, spacing: profile.spacing ?? 40, footprint: profile.footprint ?? { w: 30, d: 26 },
    startAt: profile.startAt ?? 20, endAt: profile.endAt ?? 20,
    build: (slot) => {
      if (avoid.some((a) => near(slot, a.at, a.r))) return false;
      for (const f of profile.forced || []) if (slot.side === f.side && near(slot, f.at, (profile.spacing ?? 40) / 2)) return kinds[f.kind](slot);
      if (kit.hash(slot.x, slot.z, 90) > profile.density) return false;
      let r = kit.hash(slot.x, slot.z, 91) * total, pick = profile.mix[profile.mix.length - 1][1];
      for (const [w, k] of profile.mix) { if ((r -= w) < 0) { pick = k; break; } }
      return kinds[pick](slot);
    },
  });

  // billboards and the pole line first, so the forest grows around them
  const off = road.width / 2 + 9;
  C.cluster("roadside props", () => {
    for (const b of profile.billboards || []) {
      const x = alongX ? b.at : ax + b.side * off, z = alongX ? az + b.side * off : b.at;
      ctx.makeBillboard && ctx.makeBillboard(x, z, b.ry ?? 0, b.headline, b.sub || "", b.graffiti);
    }
    if (poles) {
      const o = (alongX ? az : ax) + road.width / 2 + 2.2;
      const pa = alongX ? [ax, o] : [o, az], pb = alongX ? [bx, o] : [o, bz];
      kit.props.poleLine(pa[0], pa[1], pb[0], pb[1], 50, avoid.map((a) => a.at));
    }
  });
  for (const b of profile.billboards || []) {
    const x = alongX ? b.at : ax + b.side * off, z = alongX ? az + b.side * off : b.at;
    C.claim({ x0: x - 7, x1: x + 7, z0: z - 4, z1: z + 4 });
  }

  if (profile.forest) {
    C.vegetation(bounds, {
      spacing: profile.forest.spacing ?? 11, jitter: 4, clearance: 3.5, shape: profile.forest.shape || null,
      trunk: profile.forest.trunk, foliage: profile.forest.foliage,
    });
  }

  // first in line: where a track's bounds overlap a town's, the track's road cells must still read as road
  R.regions.unshift({ C, rect: bounds, zone: profile.zone || "rural", outside: "rural", wildAs: "rural" });
  const m = C.minimap;
  R.minimap.buildings.push(...m.buildings);
  R.pois.push(...C.pois);
  return C;
}
