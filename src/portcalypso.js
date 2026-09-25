// ---------------------------------------------------------------------------
// portcalypso.js — Port Calypso, the container port at the north-east end of
// the Port Highway (TASK-084). Composed in composer.js's six stages from
// townkit.js, like Oyster Bay (oysterbay.js), with a working-port profile:
//
//   1 road          Port Highway; Dockside Drive, Terminal Road and Quay Road
//                   north to the waterfront; Cargo Way and Harbor Drive across;
//                   Union Street and Workers' Lane for the dockworkers' housing
//   2 buildings     the trucker's gateway (motel, diner, gas), then warehouses,
//                   depots and freight offices along the highway
//   3 side streets  warehouse rows down Dockside / Terminal / Quay; the
//                   dockworkers' houses and trailers on Workers' Lane and Union St
//   4 open areas    two container yards, a tank farm, the terminal lot, a small
//                   green, the quay apron with its cranes, and Port Bay itself
//                   with a container ship alongside
//   5 vegetation    scrub pines on whatever is left, south and east
//   6 landmarks     the Port Authority tower and HQ, the fire station, the
//                   supply depot, the lighthouse at the end of the jetty
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { createComposer } from "./composer.js";
import { placeCityBuilding } from "./landmarks.js";

const HWY_Z = -600;
const HWY_X0 = -6, HWY_X1 = 1050, HWY_LEN = HWY_X1 - HWY_X0;
const S = (x) => x - HWY_X0;
const CORE = { x0: 400, x1: 1100, z0: -960, z1: -420 };
const QUAY_Z = -948;
const BAY_Z = -962;

const OFFICES = ["HARBOR MASTER", "FREIGHT CO.", "CUSTOMS", "STEVEDORES UNION", "DIESEL & TIRE", "PORT SUPPLY", "MARINE INSURANCE", "TRUCK REPAIR"];
const CORNER = ["BAR & GRILL", "WORKERS' CLUB", "LOAN & PAWN", "CHECK CASHING", "LIQUOR", "LAUNDRY", "BARBER", "PO BOXES"];

export function buildPortCalypso(R) {
  const { ctx, kit } = R;
  const { scene } = ctx;
  const C = createComposer(ctx, {
    name: "PortCalypso",
    bounds: { x0: 380, x1: 1150, z0: -1150, z1: -380 },
    zones: { core: CORE, wild: { x0: 400, x1: 1100, z0: -1100, z1: -420 } },
    seed: 88412,
  });
  R.composers.push(C);
  const { houses, shops, areas, props } = kit;

  // ---- 1 road
  C.road("Port Highway", [[HWY_X0, HWY_Z], [HWY_X1, HWY_Z]], { width: 12, lampEvery: 36, y: 0.024 });

  const NS = [                                  // [name, x, zFrom (highway side), zTo, width]
    ["Dockside Drive", 750, -420, QUAY_Z + 18, 10],
    ["Terminal Road", 600, HWY_Z - 4, -800, 8],
    ["Quay Road", 900, HWY_Z - 4, QUAY_Z + 18, 8],
    ["Union Street", 520, HWY_Z + 4, -506, 7],
  ];
  const EW = [["Cargo Way", -800, 560, 1000, 8], ["Harbor Drive", QUAY_Z + 18, 640, 1040, 8], ["Workers' Lane", -500, 440, 700, 7]];
  // sites for what comes later (Dockside crosses the highway, so it is planned in two halves)
  C.site("Dockside south", { x0: 744, x1: 756, z0: HWY_Z + 7.6, z1: -420 });
  C.site("Dockside north", { x0: 744, x1: 756, z0: QUAY_Z + 16, z1: HWY_Z - 7.6 });
  C.site("Terminal Road", { x0: 595, x1: 605, z0: -806, z1: HWY_Z - 7.6 });
  C.site("Quay Road", { x0: 895, x1: 905, z0: QUAY_Z + 16, z1: HWY_Z - 7.6 });
  C.site("Union Street", { x0: 515, x1: 525, z0: HWY_Z + 7.6, z1: -506 });
  C.site("Yard A", { x0: 610, x1: 738, z0: -790, z1: -652 });
  C.site("Yard B", { x0: 912, x1: 1040, z0: -790, z1: -652 });
  C.site("Yard C", { x0: 912, x1: 1040, z0: -920, z1: -812 });
  C.site("tanks", { x0: 612, x1: 738, z0: -922, z1: -812 });
  C.site("terminal lot", { x0: 764, x1: 800, z0: -900, z1: -820 });
  C.site("port hq", { x0: 808, x1: 884, z0: -760, z1: -676 });
  C.site("authority", { x0: 812, x1: 880, z0: -900, z1: -830 });
  C.site("fire station", { x0: 862, x1: 898, z0: -592, z1: -566 });
  C.site("supply", { x0: 596, x1: 630, z0: -592, z1: -566 });
  C.site("spray", { x0: 943, x1: 957, z0: -628, z1: -609 });
  C.site("popeyes", { x0: 638, x1: 664, z0: -592, z1: -566 });
  C.site("happy hogs", { x0: 770, x1: 800, z0: -634, z1: -608 });
  C.site("green", { x0: 690, x1: 736, z0: -590, z1: -536 });
  C.site("quay", { x0: 640, x1: 1040, z0: BAY_Z + 2, z1: QUAY_Z + 12 });
  C.site("lighthouse", { x0: 1042, x1: 1124, z0: -960, z1: -944 });

  // ---- 2 buildings
  const gateway = [
    shops.motel({ name: "TRUCKERS REST MOTEL" }),
    shops.brandGas("6twelve"),
    shops.diner({ name: "SALTY DOG DINER" }),
    shops.brandGas("gng"),
  ];
  C.frontage("Port Highway", {
    label: "gateway", setback: 17.5, spacing: 30, footprint: { w: 26, d: 22 }, startAt: S(392), endAt: HWY_LEN - S(500),
    build: (slot) => gateway[(slot.index + (slot.side > 0 ? 2 : 0)) % gateway.length](slot),
  });
  const sheds = [
    shops.warehouse({ tone: 0x8a8f96, w: 22, d: 16, h: 6.5 }), shops.warehouse({ tone: 0xa8a49a, w: 20, d: 14, h: 6 }),
    shops.warehouse({ tone: 0x7a8a96, w: 24, d: 16, h: 7 }), shops.warehouse({ tone: 0x9a8f84, w: 18, d: 14, h: 5.5 }),
  ];
  const office = shops.strip({ names: OFFICES, bgs: ["#1f4a7a", "#2a3a4a", "#5a2a2a"] });
  const industrial = (slot) => (kit.hash(slot.x, slot.z, 40) < 0.2 ? office(slot) : sheds[Math.floor(kit.hash(slot.x, slot.z, 41) * sheds.length)](slot));
  C.frontage("Port Highway", {
    label: "port strip", setback: 17, spacing: 27, footprint: { w: 25, d: 17 }, startAt: S(500), endAt: HWY_LEN - S(1040), build: industrial,
  });

  // ---- 3 side streets
  const roadOpts = { stage: "sideStreets", lampEvery: 40, y: 0.021 };
  for (const [n, x, z0, z1, w] of NS) C.road(n, [[x, z0], [x, z1]], { ...roadOpts, width: w });
  for (const [n, z, x0, x1, w] of EW) C.road(n, [[x0, z], [x1, z]], { ...roadOpts, width: w, lampEvery: 44 });
  // warehouse rows down the working streets (the yards and the tank farm hold their ground)
  for (const [n, len, start, end] of [["Dockside Drive", 0, 0, 0], ["Terminal Road", 0, 8, 6], ["Quay Road", 0, 8, 6]]) {
    C.frontage(n, { stage: "sideStreets", setback: 15.5, spacing: 25, footprint: { w: 23, d: 16 }, startAt: start, endAt: end, label: n + " sheds", build: industrial });
  }
  // the dockworkers' housing
  const flats = houses.mixed(["shotgun", "trailer", "cottage", "shotgun"], [3, 2, 2, 1]);
  const hood = { stage: "sideStreets", setback: 11.5, spacing: 13, footprint: { w: 11, d: 13 } };
  C.frontage("Workers' Lane", { ...hood, startAt: 8, endAt: 8, label: "Workers' Lane houses", build: flats });
  C.frontage("Union Street", { ...hood, startAt: 8, endAt: 6, label: "Union Street houses", build: flats });
  const corner = shops.strip({ names: CORNER, bgs: ["#5a2a2a", "#2a4a3a", "#1f4a7a"] });
  C.frontage("Port Highway", { stage: "sideStreets", sides: [1], setback: 13, spacing: 14, footprint: { w: 12, d: 13 }, startAt: S(668), endAt: HWY_LEN - S(690), label: "corner shops", build: corner });

  // ---- 4 open areas
  // the whole port is hardstanding, not grass
  C.cluster("hardstanding", () => C.plane(700, 530, kit.mat(0x54575a, "harbour hardstanding", 0.95), 750, 0.012, -695));
  C.openArea("Yard A", { color: "#59636b", build: areas.containerYard(C, { seed: 3 }) });
  C.openArea("Yard B", { color: "#59636b", build: areas.containerYard(C, { seed: 7, fill: 0.7 }) });
  C.openArea("Yard C", { color: "#59636b", build: areas.containerYard(C, { seed: 11, fill: 0.9 }) });
  C.openArea("tanks", { color: "#6a6a62", build: areas.tankFarm(C, { tanks: 6 }) });
  C.openArea("terminal lot", { color: "#55544e", build: areas.lot(C, { cars: 4 }) });
  C.openArea("green", { color: "#3f6b34", build: areas.green(C) });
  C.openArea("quay", { color: "#59636b", build: (r, c) => {
    const g = new THREE.Group(); scene.add(g);
    C.plane(c.w, c.d, kit.mat(0x8a8a84, "concrete slab quay", 0.95), c.x, 0.022, c.z);
    for (let x = r.x0 + 40; x < r.x1 - 30; x += 90) props.crane(g, x, QUAY_Z - 4, Math.PI);
    ctx.makeBarrel && [[660, QUAY_Z + 4], [664, QUAY_Z + 5], [1020, QUAY_Z + 4]].forEach(([x, z]) => ctx.makeBarrel(x, z));
    for (let x = r.x0 + 20; x < r.x1; x += 40) ctx.addLitSpot({ x, y: 9, z: QUAY_Z + 6, warm: 0xfff0c0, power: 120, range: 30, pole: true });
    // bollards and a low kerb at the water's edge
    const kerb = kit.mat(0x6a6a64, "concrete kerb", 0.95);
    kit.box(g, c.w, 0.5, 0.8, kerb, c.x, 0.25, r.z0 + 0.6);
  } });
  const water = new THREE.MeshPhysicalMaterial({ color: 0x0a1c26, roughness: 0.18, transparent: true, opacity: 0.72, envMapIntensity: 0.4, name: "bay water" });
  water.userData.gtbRealized = true;
  C.water({ x0: 600, x1: 1145, z0: -1145, z1: BAY_Z }, water);

  // ---- 5 vegetation: none — the port is hardstanding end to end

  // ---- 6 landmarks
  C.landmark("authority", (r, c) => {
    placeCityBuilding(ctx, "tower", c.x, -866, Math.PI);
    R.addOccluder(c.x, -866, 20, 20, 40);
    R.pois.push({ x: c.x, z: -846, r: 15, label: "Port Authority Tower" });
    props.pier(scene, c.x - 30, -905, c.x + 30, -905, 3);
  });
  C.landmark("port hq", (r, c) => {
    placeCityBuilding(ctx, "offices", c.x, c.z, Math.PI / 2);
    R.addOccluder(c.x, c.z, 22, 18, 20);
    R.pois.push({ x: c.x, z: c.z + 12, r: 12, label: "Port Terminal HQ" });
  });
  C.landmark("fire station", (r, c) => {
    placeCityBuilding(ctx, "fire_station", c.x, c.z, Math.PI);
    R.addOccluder(c.x, c.z, 18, 15, 10);
    R.pois.push({ x: c.x, z: c.z - 12, r: 10, label: "Port Fire Station" });
  });
  C.landmark("spray", (r, c) => {
    ctx.buildPayNSpray && ctx.buildPayNSpray(c.x, -621, 0, "Port Calypso Pay 'n' Spray");
    R.pois.push({ x: c.x, z: -604, r: 6, label: "Port Calypso Pay 'n' Spray" });
  });
  C.landmark("popeyes", (r, c) => {
    kit.shops.popeyes()({ x: 651, z: -581, rot: Math.PI, index: 0, side: 1 });
    R.pois.push({ x: 651, z: -604, r: 8, label: "Popeyes" });
  });
  C.landmark("happy hogs", (r, c) => {
    kit.shops.club("hogs")({ x: 785, z: -620, rot: 0, index: 0, side: -1 });
    R.pois.push({ x: 785, z: -604, r: 8, label: "HAPPY HOGS" });
  });
  C.landmark("supply", (r, c) => {
    placeCityBuilding(ctx, "market", c.x, c.z, Math.PI);
    R.addOccluder(c.x, c.z, 20, 16, 8);
    R.pois.push({ x: c.x, z: c.z - 12, r: 10, label: "Dockside Supply Co." });
  });
  C.landmark("lighthouse", (r, c) => {
    const g = new THREE.Group(); scene.add(g);
    C.plane(c.w, 12, kit.mat(0x8a8a84, "concrete slab jetty", 0.95), c.x, 0.023, c.z);
    const towerMat = kit.mat(0xdedac9, "lighthouse whitewashed wall", 0.4);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 4.2, 28, 12), towerMat);
    tower.position.set(1110, 14, -952); tower.castShadow = true; g.add(tower);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 5, 12), kit.mat(0xb0281c, "lighthouse painted band", 0.5));
    stripe.position.set(1110, 12, -952); g.add(stripe);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffaa }));
    beacon.position.set(1110, 28.5, -952); g.add(beacon);
    ctx.addLitSpot({ x: 1110, y: 28, z: -952, warm: 0xffffaa, power: 300, range: 60 });
    ctx.addBlocker(1110, -952, 4.5);
    R.addOccluder(1110, -952, 9, 9, 30);
    R.pois.push({ x: 1090, z: -952, r: 16, label: "Calypso Lighthouse" });
  });
  // a container ship alongside, and a second waiting out in the bay
  C.cluster("ships", () => { props.ship(scene, 860, -975, 130, 20); props.ship(scene, 1010, -1060, 110, 18); });
  C.cluster("billboards", () => {
    ctx.makeBillboard && ctx.makeBillboard(404, HWY_Z - 17, -Math.PI / 2, "PORT CALYPSO", "Gateway to the Gulf · Jobs? Ask at the Union Hall", "OR DON'T");
    ctx.makeBillboard && ctx.makeBillboard(1030, HWY_Z + 17, Math.PI / 2, "EXPRESS FREIGHT WAY", "Cargo moves. So should you.");
    props.poleLine(392, HWY_Z + 6.8, 1040, HWY_Z + 6.8, 48, [520, 750]);
  });

  R.lanes.push(
    { name: "port-hwy-east", points: [[-6, -596], [1050, -596]], cruise: [14, 22] },
    { name: "port-hwy-west", points: [[1050, -604], [-6, -604]], cruise: [14, 22] },
    { name: "dockside-north", points: [[754, -420], [754, QUAY_Z + 18]], cruise: [12, 18] },
    { name: "dockside-south", points: [[746, QUAY_Z + 18], [746, -420]], cruise: [12, 18] },
  );
  R.minimap.roads.push({ points: [[-6, HWY_Z], [1050, HWY_Z]], width: 12, color: "#cfcab8" });
  R.pois.push(...C.pois, { x: 700, z: -800, r: 20, label: "Container Yard Hangout" }, { x: 950, z: -650, r: 15, label: "East Docks Meetup" });
  const m = C.minimap;
  R.minimap.roads.push(...m.roads.filter((r) => r.points[0][0] !== HWY_X0));
  R.minimap.buildings.push(...m.buildings);
  R.minimap.areas.push(...m.areas);
  R.minimap.water.push(...m.water);
  return C;
}
