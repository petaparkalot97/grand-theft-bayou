// ---------------------------------------------------------------------------
// reddust.js — Red Dust, the badlands mining town at the north-west end of
// Red Dust Pass (TASK-084). Composed in composer.js's six stages from
// townkit.js, with a dusty, sun-bleached profile: a main street of false-front
// stores and a saloon, a quarry, a derrick field, red-rock mesas, and a road
// west to the ranches and the radio tower on the summit.
//
//   1 road          Red Dust Pass (dirt, runs WEST); the ridge road north from
//                   its end; Canyon / Saloon / Church Streets north and Ranch /
//                   Well Streets south; Derrick Road across the top
//   2 buildings     the gateway (6/12 outpost, motel, diner), then Main Street
//                   both sides, then homesteads with barns further west
//   3 side streets  bleached houses, trailers and cabins on the side streets
//   4 open areas    the quarry, the cemetery, the water tower lot, red ground
//   5 vegetation    scrub, thin
//   6 landmarks     the ruined schoolhouse, the church, the quarry watchtower
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { createComposer } from "./composer.js";
import { makeChurch } from "./church.js";
import { placeCityBuilding, placeOilDerrick, placeTruck } from "./landmarks.js";

const PASS_Z = -600;
const X0 = -6, X1 = -1050, LEN = X0 - X1;
const S = (x) => X0 - x;                         // world x -> distance along the pass (westward)
const CORE = { x0: -880, x1: -400, z0: -800, z1: -480 };

const OLD_WEST = ["SALOON", "GENERAL STORE", "ASSAY OFFICE", "SHERIFF", "LIVERY & FEED", "HOTEL", "BARBER & BATHS", "DRUG STORE", "GUNSMITH", "UNDERTAKER"];

export function buildRedDust(R) {
  const { ctx, kit } = R;
  const { scene } = ctx;
  const C = createComposer(ctx, {
    name: "RedDust",
    bounds: { x0: -1150, x1: -380, z0: -1100, z1: -380 },
    zones: { core: CORE, wild: { x0: -1100, x1: -400, z0: -1050, z1: -420 } },
    seed: 55193,
  });
  R.composers.push(C);
  const { houses, shops, areas, props } = kit;
  const dirt = () => kit.mat(0x9a6a44, "packed dirt", 1);

  // ---- 1 road: dirt all the way, like the pass always was
  C.road("Red Dust Pass", [[X0, PASS_Z], [X1, PASS_Z]], { width: 9, sidewalk: 0, centreLine: false, material: dirt, lampEvery: 40, y: 0.024 });
  C.road("Ridge Road", [[X1, PASS_Z], [X1, -850]], { width: 9, sidewalk: 0, centreLine: false, material: dirt, y: 0.024 });

  const NORTH = [["Canyon Street", -560, -716], ["Saloon Street", -680, -700], ["Church Street", -780, -716]];
  const SOUTH = [["Ranch Road", -600, -480], ["Well Street", -720, -484], ["Tumble Street", -820, -500]];
  for (const [n, x, zEnd] of NORTH) C.site(n, { x0: x - 4.5, x1: x + 4.5, z0: zEnd - 2, z1: PASS_Z - 4.6 });
  for (const [n, x, zEnd] of SOUTH) C.site(n, { x0: x - 4.5, x1: x + 4.5, z0: PASS_Z + 4.6, z1: zEnd + 2 });
  C.site("Derrick Road", { x0: -840, x1: -556, z0: -775, z1: -765 });
  C.site("schoolhouse", { x0: -578, x1: -542, z0: -744, z1: -718 });
  C.site("church", { x0: -796, x1: -764, z0: -744, z1: -718 });
  C.site("quarry", { x0: -1040, x1: -905, z0: -820, z1: -716 });
  C.site("cemetery", { x0: -900, x1: -830, z0: -690, z1: -630 });
  C.site("water tower", { x0: -650, x1: -632, z0: -574, z1: -556 });
  C.site("watchtower", { x0: -952, x1: -930, z0: -706, z1: -684 });
  C.site("popeyes", { x0: -654, x1: -630, z0: -634, z1: -606 });
  C.site("happy hogs", { x0: -790, x1: -762, z0: -594, z1: -574 });

  // ---- 2 buildings
  const gateway = [
    shops.motel({ name: "RED DUST MOTEL" }),
    shops.brandGas("6twelve"),
    shops.diner({ name: "TUMBLEWEED DINER" }),
    shops.brandGas("gng"),
  ];
  kit.withSiding(kit.palettes.weathered, () => {
    C.frontage("Red Dust Pass", {
      label: "gateway", setback: 17.5, spacing: 30, footprint: { w: 26, d: 22 }, startAt: S(-392), endAt: LEN - S(-500),
      build: (slot) => gateway[(slot.index + (slot.side > 0 ? 2 : 0)) % gateway.length](slot),
    });
    const main = kit.shops.brickBlock({ names: OLD_WEST, bgs: ["#4a2a1a", "#2a3a2a", "#4a3a1a", "#3a2a3a"] }), strip = shops.strip({ names: OLD_WEST, bgs: ["#4a2a1a", "#2a3a2a", "#4a3a1a"] });
    C.frontage("Red Dust Pass", {
      label: "Main Street", setback: 13, spacing: 14, footprint: { w: 12, d: 13 }, startAt: S(-500), endAt: LEN - S(-830),
      build: (slot) => (kit.hash(slot.x, slot.z, 70) < 0.4 ? main(slot) : strip(slot)),
    });
    // homesteads to the west: a farmhouse with a barn behind, well apart
    const ranch = houses.mixed(["farmhouse", "farmhouse", "cabin"], [2, 2, 1]), barn = shops.barn();
    C.frontage("Red Dust Pass", {
      label: "homesteads", setback: 20, spacing: 48, footprint: { w: 16, d: 24 }, startAt: S(-830), endAt: LEN - S(-1030),
      build: (slot) => {
        const ok = ranch(slot);
        if (ok && kit.hash(slot.x, slot.z, 71) < 0.6) { const [bx, bz] = kit.at(slot, 15, -14); barn({ ...slot, x: bx, z: bz }); }   // the barn stands behind and to one side
        return ok;
      },
    });
    C.frontage("Ridge Road", { label: "ridge ranches", setback: 18, spacing: 60, footprint: { w: 16, d: 22 }, startAt: 30, endAt: 20, build: ranch });

    // ---- 3 side streets
    const side = { width: 7, sidewalk: 0, centreLine: false, material: dirt, stage: "sideStreets", y: 0.022 };
    for (const [n, x, zEnd] of NORTH) C.road(n, [[x, PASS_Z - 4], [x, zEnd]], side);
    for (const [n, x, zEnd] of SOUTH) C.road(n, [[x, PASS_Z + 4], [x, zEnd]], side);
    C.road("Derrick Road", [[-840, -770], [-556, -770]], { ...side, width: 6 });
    const folk = houses.mixed(["shotgun", "trailer", "cabin", "bungalow", "cottage"], [2, 3, 2, 2, 1]);
    const hood = { stage: "sideStreets", setback: 11, spacing: 14, footprint: { w: 11, d: 13 } };
    for (const [n] of [...NORTH, ...SOUTH]) C.frontage(n, { ...hood, startAt: 8, endAt: 8, label: n + " houses", build: folk });
  });

  // ---- 4 open areas
  // the whole badlands floor: red dust instead of black grass
  C.cluster("red ground", () => C.plane(690, 620, kit.mat(0x7a4a30, "red dust ground", 1), -750, 0.012, -740));
  C.openArea("quarry", { color: "#6e3f28", build: areas.quarry(C) });
  C.openArea("cemetery", { color: "#8a6a4a", build: areas.cemetery(C) });
  C.openArea("water tower", { color: "#6e3f28", build: (r, c) => ctx.makeWaterTower && ctx.makeWaterTower(c.x, c.z, "RED DUST", ["POP. 190 AND FALLING"], "DRY SINCE '09") });

  // ---- 5 vegetation: scrub
  C.vegetation({ x0: -1100, x1: -400, z0: -1050, z1: -420 }, {
    spacing: 22, jitter: 8, clearance: 4, shape: props.scrubShape(),
    trunk: kit.mat(0x5a4a3a, "scrub trunk bark", 0.95),
    foliage: kit.mat(0x6a6a3a, "scrub dry leaves foliage", 0.95),
  });

  // ---- 6 landmarks
  C.landmark("schoolhouse", (r, c) => {
    placeCityBuilding(ctx, "school", c.x, -731, 0);
    R.addOccluder(c.x, -731, 24, 18, 9);
    R.pois.push({ x: c.x, z: -712, r: 12, label: "Ruined Schoolhouse" });
  });
  C.landmark("popeyes", (r, c) => {
    kit.shops.popeyes()({ x: -642, z: -618, rot: 0, index: 0, side: 1 });
    R.pois.push({ x: -642, z: -598, r: 8, label: "Popeyes" });
  });
  C.landmark("happy hogs", (r, c) => {
    kit.shops.club("hogs")({ x: -776, z: -584, rot: Math.PI, index: 0, side: -1 });
    R.pois.push({ x: -776, z: -598, r: 8, label: "HAPPY HOGS" });
  });
  C.landmark("church", (r, c) => {
    makeChurch(ctx, { x: c.x, z: -726, rot: 0, length: 14, name: "Red Dust Chapel" });
    R.pois.push({ x: c.x, z: -712, r: 8, label: "Red Dust Chapel" });
  });
  C.landmark("watchtower", (r, c) => {
    placeCityBuilding(ctx, "tower", c.x, c.z, -Math.PI / 4);
    R.addOccluder(c.x, c.z, 20, 20, 40);
    R.pois.push({ x: c.x, z: c.z + 14, r: 10, label: "Quarry Watchtower" });
  });
  C.cluster("derricks", () => {
    for (const [x, z, rot] of [[-820, -790, 0.3], [-760, -792, -0.2], [-700, -788, 0.4], [-640, -792, 0], [-590, -786, -0.3]]) placeOilDerrick(ctx, x, z, rot);
  });
  C.cluster("trucks", () => {
    placeTruck(ctx, "truck", -975, -700, Math.PI / 2); placeTruck(ctx, "van", -700, -590, Math.PI);
  });
  C.cluster("mesas", () => {
    const g = new THREE.Group(); scene.add(g);
    for (const [x, z, w, d, h] of [[-460, -900, 60, 40, 34], [-560, -960, 46, 34, 28], [-1010, -1010, 70, 46, 40], [-880, -960, 50, 36, 30], [-470, -470, 44, 32, 24], [-1080, -520, 56, 40, 30], [-980, -900, 38, 28, 22]]) props.mesa(g, x, z, w, d, h);
    // the summit radio tower
    const towerMat = kit.mat(0xd6402a, "radio tower painted steel", 0.35, { metalness: 0.8 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 3.5, 45, 4), towerMat);
    tower.position.set(-1020, 22.5, -950); tower.castShadow = true; g.add(tower);
    ctx.addLitSpot({ x: -1020, y: 44, z: -950, warm: 0xff1122, power: 250, range: 50 });
    ctx.addBlocker(-1020, -950, 4);
    R.addOccluder(-1020, -950, 8, 8, 45);
    R.pois.push({ x: -1020, z: -950, r: 15, label: "Cypress Summit Radio" });
  });
  C.cluster("billboards", () => {
    ctx.makeBillboard && ctx.makeBillboard(-404, PASS_Z - 14, Math.PI / 2, "RED DUST", "Gateway to nothing in particular", "TURN BACK");
    props.poleLine(-392, PASS_Z + 5.4, -1040, PASS_Z + 5.4, 50, [-600, -720, -820]);
  });

  // the diagonal canyon trail is a bare plane in the old build; it keeps its lanes
  const trail = new THREE.Mesh(new THREE.PlaneGeometry(720, 10), dirt());
  trail.rotation.x = -Math.PI / 2; trail.rotation.z = -0.32; trail.position.set(-725, 0.02, -725); trail.receiveShadow = true;
  scene.add(trail);

  R.lanes.push(
    { name: "red-dust-pass-w", points: [[-6, -597], [-1047, -597]], cruise: [12, 18] },
    { name: "red-dust-pass-e", points: [[-1053, -603], [-6, -603]], cruise: [12, 18] },
    { name: "red-dust-pass-s", points: [[-1047, -597], [-1047, -850]], cruise: [12, 18] },
    { name: "red-dust-pass-n", points: [[-1053, -850], [-1053, -603]], cruise: [12, 18] },
    { name: "red-dust-west", points: [[-400, -600], [-1050, -850]], cruise: [10, 16] },
    { name: "red-dust-east", points: [[-1050, -850], [-400, -600]], cruise: [10, 16] },
  );
  R.minimap.roads.push({ points: [[-6, PASS_Z], [-1050, PASS_Z], [-1050, -850]], width: 9, color: "#cfcab8" }, { points: [[-400, -600], [-1050, -850]], width: 9, color: "#8a5a3a" });
  R.pois.push(...C.pois);
  const m = C.minimap;
  R.minimap.roads.push(...m.roads.filter((r) => r.points[0][0] !== X0));
  R.minimap.buildings.push(...m.buildings);
  R.minimap.areas.push(...m.areas);
  R.minimap.water.push(...m.water);
  return C;
}
