// ---------------------------------------------------------------------------
// oysterbay.js — Oyster Bay, the coastal town at the south-east end of the
// Oyster Highway (TASK-084). Composed in composer.js's six stages, the way
// Lafourchette is, from townkit.js's procedural buildings:
//
//   1 road          Oyster Highway becomes Front Street through town; every side
//                   street, lot and landmark is planned as a site first
//   2 buildings     the gateway strip (motel, diner, gas), then Front Street's
//                   shopfronts and brick blocks, then the quiet east end
//   3 side streets  Cypress / Hospital / Magnolia / School Roads north; Shell,
//                   Pelican, Oak and Bay Streets and Harbor Road south, joined by
//                   Water Street; houses along all of them, shops down to the docks
//   4 open areas    water tower, town green, parking, cemetery, the bay itself
//   5 vegetation    pines on whatever is left
//   6 landmark      Oyster Bay Medical, the high school, the church, the harbor
//
// `R` is stateWorld.js's shared environment: { ctx, kit, lanes, pois, minimap,
// composers, addOccluder }.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { createComposer } from "./composer.js";
import { makeChurch } from "./church.js";
import { placeCityBuilding, placeBurgerPiz, placeGunShop } from "./landmarks.js";

const HWY_Z = 600;
const HWY_X0 = -6, HWY_X1 = 1050, HWY_LEN = HWY_X1 - HWY_X0;
const S = (x) => x - HWY_X0;                       // world x -> distance along the highway
const CORE = { x0: 400, x1: 1100, z0: 440, z1: 900 };
const BAY_Z = 905;

const SHOPS = ["OYSTER BAR", "MAMA'S KITCHEN", "LEVEE HARDWARE", "BAYOU BAIT", "BOUDIN & SONS", "TACKLE & ICE", "GULF LIQUOR",
  "PAWN & LOAN", "FISH MARKET", "SEAFOOD BOIL", "BARBER SHOP", "BEAUTY SALON", "FEED & SEED", "DRUG STORE", "LAUNDRY", "SHRIMP & GRITS"];
const DOCK_SHOPS = ["SHRIMP SHACK", "BAIT & TACKLE", "FISH MARKET", "ICE HOUSE", "MARINA SUPPLY", "BOAT REPAIR", "OYSTER BAR", "CRAB BOIL"];

export function buildOysterBay(R) {
  const { ctx, kit } = R;
  const { scene } = ctx;
  const C = createComposer(ctx, {
    name: "OysterBay",
    bounds: { x0: 380, x1: 1150, z0: 380, z1: 1150 },
    zones: { core: CORE, wild: { x0: 400, x1: 1100, z0: 420, z1: 1100 } },
    seed: 12345,
  });
  R.composers.push(C);
  const { houses, shops, areas, props } = kit;

  // ---- 1 road: Front Street, and the plan for everything after it
  C.road("Oyster Highway", [[HWY_X0, HWY_Z], [HWY_X1, HWY_Z]], { width: 10, lampEvery: 36, y: 0.024 });

  const NORTH = [["Cypress Street", 470, 470], ["Hospital Road", 555, 512], ["Magnolia Street", 760, 478], ["School Road", 850, 512], ["Delta Street", 805, 424]];
  const SOUTH = [["Shell Street", 470, 800], ["Pelican Street", 560, 800], ["Harbor Road", 720, 885], ["Oak Street", 880, 800], ["Bay Street", 980, 800]];
  const WATER_Z = 800;
  for (const [n, x, zEnd] of NORTH) C.site(n, { x0: x - 5.5, x1: x + 5.5, z0: zEnd - 2, z1: HWY_Z - 5.6 });
  for (const [n, x, zEnd] of SOUTH) C.site(n, { x0: x - (n === "Harbor Road" ? 6 : 5.5), x1: x + (n === "Harbor Road" ? 6 : 5.5), z0: HWY_Z + 5.6, z1: zEnd + 2 });
  C.site("hospital", { x0: 539, x1: 571, z0: 486, z1: 509 });
  C.site("school", { x0: 836, x1: 864, z0: 486, z1: 509 });
  C.site("church", { x0: 743, x1: 777, z0: 438, z1: 476 });
  C.site("steamboat", { x0: 570, x1: 640, z0: 906, z1: 940 });
  C.site("float den", { x0: 596, x1: 656, z0: 812, z1: 866 });
  C.site("water tower", { x0: 505, x1: 525, z0: 566, z1: 586 });
  C.site("green", { x0: 608, x1: 664, z0: 556, z1: 592 });
  C.site("burgerpiz", { x0: 674, x1: 708, z0: 574, z1: 592 });
  C.site("parking", { x0: 590, x1: 630, z0: 608, z1: 632 });
  C.site("spray", { x0: 643, x1: 657, z0: 607, z1: 626 });
  C.site("popeyes", { x0: 767, x1: 796, z0: 566, z1: 594 });
  C.site("billy jeans", { x0: 662, x1: 690, z0: 607, z1: 628 });
  C.site("cemetery", { x0: 900, x1: 1010, z0: 470, z1: 566 });
  C.site("harbor", { x0: 690, x1: 750, z0: 888, z1: 940 });

  // ---- 2 buildings
  // the gateway: the first things you meet coming in from the interstate side
  const gateway = [
    shops.motel({ name: "BAYOU BREEZE MOTEL" }),
    shops.brandGas("6twelve"),
    shops.diner({ name: "PELICAN DINER" }),
    shops.brandGas("gng"),
  ];
  C.frontage("Oyster Highway", {
    label: "gateway", setback: 17.5, spacing: 30, footprint: { w: 26, d: 22 }, startAt: S(392), endAt: HWY_LEN - S(500),
    build: (slot) => gateway[(slot.index + (slot.side > 0 ? 2 : 0)) % gateway.length](slot),
  });
  // Front Street: brick blocks and storefronts, both sides
  const block = shops.brickBlock({ names: SHOPS }), strip = shops.strip({ names: SHOPS }), gallery = R.la.gallery();
  C.frontage("Oyster Highway", {
    label: "Front Street", setback: 13, spacing: 14, footprint: { w: 12, d: 13 }, startAt: S(500), endAt: HWY_LEN - S(890),
    build: (slot) => { const r = kit.hash(slot.x, slot.z, 30); return r < 0.32 ? gallery(slot) : r < 0.6 ? block(slot) : strip(slot); },   // French Quarter galleries, brick blocks, storefronts
  });
  // the quiet east end: a few shops among the houses
  const eastHouse = houses.mixed(["bungalow", "cottage", "shotgun"]);
  C.frontage("Oyster Highway", {
    label: "east end", setback: 13, spacing: 15, footprint: { w: 13, d: 13 }, startAt: S(890), endAt: HWY_LEN - S(1044),
    build: (slot) => (kit.hash(slot.x, slot.z, 31) < 0.3 ? strip(slot) : eastHouse(slot)),
  });

  // ---- 3 side streets
  const roadOpts = { width: 7, stage: "sideStreets", lampEvery: 40, y: 0.021 };
  for (const [n, x, zEnd] of NORTH) C.road(n, [[x, HWY_Z - 4], [x, zEnd]], roadOpts);
  for (const [n, x, zEnd] of SOUTH) C.road(n, [[x, HWY_Z + 4], [x, zEnd]], n === "Harbor Road" ? { ...roadOpts, width: 9 } : roadOpts);
  C.road("Water Street", [[470, WATER_Z], [980, WATER_Z]], { ...roadOpts, lampEvery: 44 });

  const north = houses.mixed(["bungalow", "cottage", "bungalow", "farmhouse"]);
  const south = houses.mixed(["shotgun", "bungalow", "cottage", "shotgun"]);
  const hood = { stage: "sideStreets", setback: 11.5, spacing: 13, footprint: { w: 11, d: 13 } };
  for (const [n] of NORTH) C.frontage(n, { ...hood, startAt: 8, endAt: 4, label: n + " houses", build: north });
  for (const [n] of SOUTH) {
    if (n === "Harbor Road") continue;
    C.frontage(n, { ...hood, startAt: 8, endAt: 8, label: n + " houses", build: south });
  }
  // Water Street: the south side only — the north side backs onto the yards above
  C.frontage("Water Street", { ...hood, sides: [1], startAt: 8, endAt: 4, label: "Water Street houses", build: houses.mixed(["stilt", "shotgun", "cottage"], [2, 2, 1]) });
  // Harbor Road: shops and sheds all the way to the docks
  const dockShop = shops.strip({ names: DOCK_SHOPS, bgs: ["#1f4a7a", "#1f6a3a", "#7a1f12"] });
  C.frontage("Harbor Road", { stage: "sideStreets", setback: 12.5, spacing: 15, footprint: { w: 13, d: 12 }, startAt: 8, endAt: 281 - 192, label: "Harbor Road shops", build: dockShop });
  C.frontage("Harbor Road", { stage: "sideStreets", setback: 16, spacing: 24, footprint: { w: 22, d: 16 }, startAt: 202, endAt: 6, label: "Harbor Road sheds", build: shops.warehouse({ tone: 0x9a9f94, w: 18, d: 12, h: 5.5 }) });

  // ---- 4 open areas
  // a lawn under the whole town, so the ground between the buildings isn't the map's black
  C.cluster("lawn", () => C.plane(718, 470, kit.mat(0x4a6a3a, "town lawn", 1), 751, 0.012, 667));
  C.openArea("water tower", { color: "#4f5a3e", build: (r, c) => ctx.makeWaterTower && ctx.makeWaterTower(c.x, c.z, "OYSTER BAY", ["HOME OF THE SHRIMP FEST"], "SHRIMP IS OVERRATED") });
  C.openArea("green", { color: "#3f6b34", build: areas.green(C) });
  C.openArea("parking", { color: "#55544e", build: areas.lot(C, { cars: 5 }) });
  C.openArea("cemetery", { color: "#8a8a82", build: areas.cemetery(C) });
  const swamp = new THREE.MeshPhysicalMaterial({ color: 0x0a1c22, roughness: 0.18, metalness: 0, transparent: true, opacity: 0.7, envMapIntensity: 0.4, name: "bay water" });
  swamp.userData.gtbRealized = true;
  // the bay, with a gap (no shore blockers) where the steamboat lies, so the gangway can be walked
  C.water({ x0: 400, x1: 574, z0: BAY_Z, z1: 1140 }, swamp);
  C.water({ x0: 646, x1: 712, z0: BAY_Z, z1: 1140 }, swamp);
  C.cluster("steamboat water", () => C.plane(72, 235, swamp, 610, 0.035, 1022));
  C.water({ x0: 728, x1: 1140, z0: BAY_Z, z1: 1140 }, swamp);

  // ---- 5 vegetation
  C.vegetation({ x0: 392, x1: 1110, z0: 424, z1: 895 }, {
    spacing: 11, jitter: 4, clearance: 3.5,
    trunk: ctx.surface("dirt", 512).material(2, { color: 0xc9b49a, envMapIntensity: 0.7 }),
    foliage: ctx.surface("grass", 512).material(3, { color: 0xb9d69a, envMapIntensity: 0.8 }),
  });

  // ---- 6 landmarks
  C.landmark("hospital", (r, c) => {
    placeCityBuilding(ctx, "hospital", c.x, 500, 0);
    R.addOccluder(c.x, 500, 28, 22, 16);
    R.pois.push({ x: c.x, z: 516, r: 12, label: "Oyster Bay Medical" });
    if (ctx.addService) ctx.addService({ kind: "hospital", name: "Oyster Bay Medical", x: c.x, z: 512 + 1.6, face: 0 });
  });
  C.landmark("school", (r, c) => {
    placeCityBuilding(ctx, "school", c.x, 500, 0);
    R.addOccluder(c.x, 500, 24, 18, 9);
    R.pois.push({ x: c.x, z: 516, r: 14, label: "Oyster Bay High" });
  });
  C.landmark("church", (r, c) => {
    // a three-spired cathedral at the head of Magnolia Street, and the square it looks across
    R.la.cathedral({ x: c.x, z: 456, rot: 0, index: 0, side: 1 }, { name: "St. Louis Cathedral" });
    R.pois.push({ x: c.x, z: 482, r: 10, label: "Our Lady of the Bay" });
  });
  C.landmark("steamboat", (r, c) => {
    const g = new THREE.Group(); scene.add(g);
    R.la.steamboat(g, 605, 930, { name: "BELLE OF THE BAYOU" });
    props.pier(g, 590, 900, 590, 924, 5);                        // the gangway, from the shore to the boat
    for (const x of [582, 598, 614, 630]) kit.cyl(g, 0.3, 1.2, kit.mat(0x2a2a2a, "steel post", 0.6), x, 0.6, 907, 8);
    ctx.addLitSpot({ x: 605, y: 8, z: 926, warm: 0xffe0b0, power: 220, range: 40 });
    R.pois.push({ x: 590, z: 906, r: 10, label: "Steamboat Belle of the Bayou" });
  });
  C.landmark("float den", (r, c) => {
    // the krewe's den: a warehouse, and the floats parked out in the yard in purple, green and gold
    const g = new THREE.Group(); scene.add(g);
    kit.shops.warehouse({ tone: 0x8a6a9a, w: 22, d: 12, h: 8 })({ x: 626, z: 858, rot: Math.PI, index: 0, side: -1 });    // its doors face the yard (north)
    C.plane(56, 44, kit.mat(0x54575a, "yard hardstanding", 0.95), 626, 0.02, 838);
    [["gator", 606, 830, 0.1], ["crown", 638, 826, -0.05], ["mask", 606, 846, 0.05], ["fleur", 640, 844, 0]].forEach(([k, x, z, ry]) => R.la.float(g, x, z, ry, k));
    const board = new THREE.Group(); board.position.set(626, 0, 852.4); board.rotation.y = Math.PI; g.add(board);
    kit.box(board, 11, 1.6, 0.3, kit.mat(0x0c0c10, "sign board back", 0.7), 0, 8.4, 0);
    kit.sign(board, 10.6, 1.4, "KREWE OF ORPHEUS BAY · FLOAT DEN", 0, 8.4, 0.16, "#ffd27a", "#3a1a5a");
    R.pois.push({ x: 626, z: 826, r: 10, label: "Mardi Gras float den" });
  });
  C.cluster("jackson square", () => {
    // the general on his horse in the middle of the green, and the café that only sells beignets
    const g = new THREE.Group(); scene.add(g);
    R.la.statue(g, 636, 574);
    R.la.cafe({ x: 636, z: 582, rot: 0, index: 0, side: 1 });
    R.pois.push({ x: 636, z: 580, r: 12, label: "Oyster Square" });
  });
  C.landmark("spray", (r, c) => {
    ctx.buildPayNSpray && ctx.buildPayNSpray(c.x, 619, Math.PI, "Oyster Bay Pay 'n' Spray");
    R.pois.push({ x: c.x, z: 604, r: 6, label: "Oyster Bay Pay 'n' Spray" });
  });
  C.landmark("popeyes", (r, c) => {
    kit.shops.popeyes()({ x: 778, z: 581, rot: 0, index: 0, side: 1 });
    R.pois.push({ x: 778, z: 604, r: 8, label: "Popeyes" });
  });
  C.landmark("billy jeans", (r, c) => {
    kit.shops.club("billy")({ x: 676, z: 618, rot: Math.PI, index: 0, side: 1 });
    R.pois.push({ x: 676, z: 604, r: 8, label: "BILLY JEANS" });
  });
  C.landmark("burgerpiz", (r, c) => {
    placeBurgerPiz(ctx, c.x, 584, 0);
    R.pois.push({ x: c.x, z: 606, r: 10, label: "BurgerPiz" });
  });
  C.landmark("harbor", (r, c) => {
    const g = new THREE.Group(); scene.add(g);
    const apron = kit.mat(0x8a8a84, "concrete slab apron", 0.95);
    C.plane(28, 22, apron, 720, 0.023, 898);
    props.pier(g, 720, 908, 720, 962, 7);
    props.pier(g, 723.5, 926, 742, 926, 3);          // finger piers off the main one
    props.pier(g, 716.5, 940, 698, 940, 3);
    props.boat(g, 736, 930, 0.05, 1.1); props.boat(g, 704, 944, -0.08, 1); props.boat(g, 738, 950, 0.1, 0.9);
    kit.shops.warehouse({ tone: 0xa8a49a, w: 16, d: 10, h: 5 })({ x: 720, z: 894, rot: Math.PI, index: 0 });
    ctx.addLitSpot({ x: 720, y: 6, z: 912, warm: 0xffd6a0, power: 120, range: 28, pole: true });
    R.pois.push({ x: 720, z: 915, r: 10, label: "Oyster Bay Docks" }, { x: 720, z: 945, r: 8, label: "Oyster Bay Docks" });
  });
  C.cluster("welcome", () => ctx.makeBillboard && ctx.makeBillboard(406, 585, -Math.PI / 2, "OYSTER BAY", "pop. 3,208 · Home of the Shrimp Fest", "WELCOME (TO THE END)"));
  C.cluster("power", () => { props.poleLine(392, 594, 1040, 594, 48, [470, 555, 760, 850]); });

  // gun shop on Front Street's north side (Bayou Arsenal), between the green and Magnolia
  // — placed last so it takes a slot the frontage left free
  C.cluster("arsenal", () => {
    if (C.isFree({ x0: 716, x1: 744, z0: 578, z1: 594 })) {
      placeGunShop(ctx, 730, 585, 0);
      C.claim({ x0: 716, x1: 744, z0: 578, z1: 594 });
      R.pois.push({ x: 730, z: 606, r: 8, label: "Bayou Arsenal" });
    }
  });

  R.lanes.push(
    { name: "oyster-hwy-east", points: [[-6, 596], [1050, 596]], cruise: [12, 18] },
    { name: "oyster-hwy-west", points: [[1050, 604], [-6, 604]], cruise: [12, 18] },
  );
  R.minimap.roads.push({ points: [[-6, HWY_Z], [1050, HWY_Z]], width: 10, color: "#cfcab8" });
  R.pois.push(...C.pois);
  const m = C.minimap;
  R.minimap.roads.push(...m.roads.filter((r) => r.points[0][0] !== HWY_X0));
  R.minimap.buildings.push(...m.buildings);
  R.minimap.areas.push(...m.areas);
  R.minimap.water.push(...m.water);
  return C;
}
