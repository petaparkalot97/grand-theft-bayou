// ---------------------------------------------------------------------------
// lakeshore.js — Lakeshore Marsh, the stilt-village at the south-west end of
// the Lakeshore Causeway (TASK-084). Composed in composer.js's six stages from
// townkit.js, with a swamp-tourism profile: bait shops and airboat rides along
// the causeway, a lake of boardwalk streets lined with houses on piles, and a
// dirt track north into the cypress marsh to the fishing camps.
//
//   1 road          the causeway (it runs WEST from US-167, so side +1 is north)
//   2 buildings     the gateway motel/gas/diner, then bait shops and tour offices
//   3 side streets  four boardwalks south over the lake with stilt houses either
//                   side; Gator Road north into the marsh with camps along it
//   4 open areas    the lake, a tour landing with airboats, marsh pools
//   5 vegetation    bald cypress, thick in the marsh, thinner along the shore
//   6 landmark      the Bayou Lodge at the end of Gator Road
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { createComposer } from "./composer.js";

const CW_Z = 750;
const CW_X0 = -6, CW_X1 = -1050, CW_LEN = CW_X0 - CW_X1;
const S = (x) => CW_X0 - x;                       // world x -> distance along the causeway (westward)
const CORE = { x0: -1000, x1: -400, z0: 640, z1: 1100 };
const LAKE = { x0: -960, x1: -520, z0: 800, z1: 1090 };

const SHOPS = ["BAIT & TACKLE", "AIRBOAT TOURS", "GATOR GIFTS", "CRAWFISH BOIL", "ICE & BEER", "BOUDIN SHACK", "SWAMP TOURS", "FISH FRY"];

export function buildLakeshore(R) {
  const { ctx, kit } = R;
  const { scene } = ctx;
  const C = createComposer(ctx, {
    name: "LakeshoreMarsh",
    bounds: { x0: -1150, x1: -380, z0: 380, z1: 1150 },
    zones: { core: CORE, wild: { x0: -1100, x1: -400, z0: 420, z1: 1100 } },
    seed: 44102,
  });
  R.composers.push(C);
  const { houses, shops, areas, props } = kit;

  // ---- 1 road
  C.road("Lakeshore Causeway", [[CW_X0, CW_Z], [CW_X1, CW_Z]], { width: 12, lampEvery: 36, y: 0.024 });

  const BOARDWALKS = [["Heron Walk", -600], ["Egret Walk", -690], ["Pelican Walk", -780], ["Ibis Walk", -870]];
  const WALK_END = 1010;
  const plank = new THREE.MeshStandardMaterial({ color: 0x6a5a48, roughness: 0.95, name: "weathered wood plank boardwalk" });
  for (const [n, x] of BOARDWALKS) C.site(n, { x0: x - 4, x1: x + 4, z0: CW_Z + 7.6, z1: WALK_END });
  C.site("Gator Road", { x0: -700 - 4, x1: -700 + 4, z0: 560, z1: CW_Z - 7.6 });
  C.site("landing", { x0: -740, x1: -660, z0: 520, z1: 556 });
  C.site("lodge", { x0: -718, x1: -682, z0: 484, z1: 516 });

  // ---- 2 buildings
  const gateway = [
    shops.motel({ name: "BAYOU VIEW MOTEL" }),
    shops.gasStop({ name: "LAKESHORE GAS", band: 0x1f6a3a, sign: "#1f6a3a" }),
    shops.diner({ name: "GATOR GRILL" }),
    shops.gasStop({ name: "BAIT 'N' GO", band: 0xd4a028, sign: "#7a5a12" }),
  ];
  C.frontage("Lakeshore Causeway", {
    label: "gateway", setback: 15, spacing: 30, footprint: { w: 26, d: 14 }, startAt: S(-392), endAt: CW_LEN - S(-520),
    build: (slot) => gateway[(slot.index + (slot.side > 0 ? 2 : 0)) % gateway.length](slot),
  });
  const bait = shops.strip({ names: SHOPS, bgs: ["#1f4a3a", "#7a5a12", "#1f4a7a", "#5a2a2a"] });
  const cabins = houses.mixed(["cabin", "stilt", "cottage"], [2, 2, 1]);
  C.frontage("Lakeshore Causeway", {
    label: "bait shops", setback: 13, spacing: 14, footprint: { w: 12, d: 13 }, startAt: S(-520), endAt: CW_LEN - S(-940),
    build: (slot) => (slot.side > 0 || kit.hash(slot.x, slot.z, 50) < 0.6 ? bait(slot) : cabins(slot)),
  });

  // ---- 3 side streets
  const walkOpts = { width: 6, sidewalk: 0, stage: "sideStreets", centreLine: false, material: plank, y: 0.05 };
  for (const [n, x] of BOARDWALKS) C.road(n, [[x, CW_Z + 4], [x, WALK_END]], { ...walkOpts, lampEvery: 30 });
  C.road("Gator Road", [[-700, CW_Z - 4], [-700, 560]], { width: 6, sidewalk: 0, stage: "sideStreets", centreLine: false, material: () => kit.mat(0x8a6a44, "packed dirt", 1), lampEvery: 60, y: 0.021 });
  const stilts = houses.mixed(["stilt", "stilt", "cabin"], [4, 4, 1]);
  for (const [n] of BOARDWALKS) C.frontage(n, { stage: "sideStreets", setback: 12.5, spacing: 13, footprint: { w: 11, d: 14 }, startAt: 8, endAt: 10, label: n + " houses", build: stilts });
  C.frontage("Gator Road", { stage: "sideStreets", setback: 10, spacing: 22, footprint: { w: 14, d: 12 }, startAt: 10, endAt: 6, label: "camps", build: houses.mixed(["cabin", "stilt", "trailer"], [3, 2, 1]) });

  // ---- 4 open areas
  C.cluster("marsh ground", () => C.plane(700, 400, kit.mat(0x2c3f2a, "marsh mud", 1), -750, 0.012, 600));
  const lakeWater = new THREE.MeshPhysicalMaterial({ color: 0x0a1c1c, roughness: 0.16, transparent: true, opacity: 0.74, envMapIntensity: 0.4, name: "lake water" });
  lakeWater.userData.gtbRealized = true;
  // the lake, in strips between the boardwalks: the walkways stay road cells, and
  // the shore blockers (composer.water) never cross one
  const edges = [LAKE.x0, ...BOARDWALKS.map(([, x]) => x).sort((a, b) => a - b).flatMap((x) => [x - 4, x + 4]), LAKE.x1];
  for (let i = 0; i < edges.length; i += 2) if (edges[i + 1] - edges[i] > 6) C.water({ x0: edges[i], x1: edges[i + 1], z0: LAKE.z0, z1: LAKE.z1 }, lakeWater, { shoreEvery: 4 });
  C.openArea("landing", { color: "#4f5a3e", build: (r, c) => {
    const g = new THREE.Group(); scene.add(g);
    C.plane(c.w, c.d, C.tiled(ctx.surface("dirt", 512).material(1), c.w, c.d, 8), c.x, 0.021, c.z);
    props.pier(g, c.x, r.z0 + 6, c.x, r.z0 - 22, 5);
    props.airboat(g, c.x - 12, r.z0 - 4, 0.3); props.airboat(g, c.x + 13, r.z0 - 6, -0.2);
    props.boat(g, c.x + 8, r.z0 - 16, 0.1, 0.9);
    ctx.makeBarrel && ctx.makeBarrel(c.x - 24, r.z1 - 3);
    ctx.addLitSpot({ x: c.x, y: 6, z: r.z1 - 4, warm: 0xffd6a0, power: 120, range: 28, pole: true });
    C.plane(50, 40, kit.mat(0x0d1f1c, "marsh water", 0.2, { transparent: true, opacity: 0.8 }), c.x, 0.03, r.z0 - 22);
    R.pois.push({ x: c.x, z: c.z, r: 12, label: "Swamp Tour Landing" });
  } });

  // ---- 5 vegetation: cypress
  const cypress = props.cypressShape();
  const veg = (rect, spacing) => C.vegetation(rect, {
    spacing, jitter: spacing * 0.35, clearance: 3.5, shape: cypress,
    trunk: kit.mat(0x4a3d30, "cypress trunk bark", 0.95),
    foliage: kit.mat(0x2a4a30, "cypress leaves foliage", 0.9),
  });
  veg({ x0: -1100, x1: -400, z0: 424, z1: 738 }, 9);          // the marsh, north of the causeway
  veg({ x0: -1100, x1: -400, z0: 764, z1: 800 }, 12);
  veg({ x0: -1100, x1: -960, z0: 800, z1: 1100 }, 10);         // the far shore
  veg({ x0: -520, x1: -400, z0: 800, z1: 1100 }, 10);
  veg({ x0: -960, x1: -520, z0: 1092, z1: 1100 }, 10);

  // ---- 6 landmark
  C.landmark("lodge", (r, c) => {
    houses.farmhouse({ x: c.x, z: 506, rot: 0, index: 0, s: 0, x0: 0 });
    R.pois.push({ x: c.x, z: 522, r: 10, label: "Bayou Lodge" });
  });
  C.cluster("marsh", () => {
    const g = new THREE.Group(); scene.add(g);
    for (let i = 0; i < 46; i++) {
      const x = -1080 + kit.hash(i, 1, 61) * 660, z = 430 + kit.hash(i, 2, 62) * 300;
      if (Math.abs(x + 700) < 14 && z > 500) continue;                 // keep Gator Road dry
      props.pool(g, x, z, 14 + kit.hash(i, 3, 63) * 34, 10 + kit.hash(i, 4, 64) * 24);
    }
  });
  C.cluster("billboards", () => {
    ctx.makeBillboard && ctx.makeBillboard(-404, CW_Z - 16, Math.PI / 2, "LAKESHORE", "Swamp tours · Fresh bait · No refunds", "WATCH FOR GATORS");
    props.poleLine(-392, CW_Z + 6.8, -1040, CW_Z + 6.8, 48, [-600, -690, -780, -870]);
  });

  R.lanes.push(
    { name: "causeway-west", points: [[-6, 746], [-1050, 746]], cruise: [14, 22] },
    { name: "causeway-east", points: [[-1050, 754], [-6, 754]], cruise: [14, 22] },
  );
  R.minimap.roads.push({ points: [[-6, CW_Z], [-1050, CW_Z]], width: 12, color: "#cfcab8" });
  R.pois.push(...C.pois);
  const m = C.minimap;
  R.minimap.roads.push(...m.roads.filter((r) => r.points[0][0] !== CW_X0));
  R.minimap.buildings.push(...m.buildings);
  R.minimap.areas.push(...m.areas);
  R.minimap.water.push(...m.water);
  return C;
}
