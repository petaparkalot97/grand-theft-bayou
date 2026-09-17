// ---------------------------------------------------------------------------
// eastbank.js — Lafourchette, the east bank. The map grows east from x = 136
// to EAST_MAX_X.
//
// South Tusouxroe's street keeps going past the condo billboard as Lafourche
// Road, into a small bayou town built by composer.js in its six stages:
//
//   1 road          Lafourche Road. The side streets, the lots and the church
//                   are planned as sites first, so nothing else takes them.
//   2 buildings     storefronts facing Lafourche Road, both sides
//   3 side streets  Levee Street, Pelican Street and Boudin Row run south, Cane
//                   Street crosses them, shotgun houses line all three
//   4 open areas    the water tower lot, a parking lot, the Saturday market, a
//                   ball field, and the bayou band carried east from the causeway
//   5 vegetation    pines fill the east strip wherever nothing was built
//   6 landmark      St. Jude of the Levee closes the view down Lafourche Road
//
// Culling, spawn zones and the minimap shapes come from the composer. The
// traffic lanes stay inside the district, clear of Act One's South Tusouxroe set.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { createComposer } from "./composer.js";
import { makeChurch } from "./church.js";
import { makeDecorativeFence, placeOfficeClutter, placeCityBuilding, placeParkedCar } from "./landmarks.js";

export const EAST_MAX_X = 380;
const CORE = { x0: 121, x1: 376, z0: -134, z1: 60 };            // streets and buildings: a "town" zone
const WILD = { x0: 138, x1: 378, z0: -134, z1: 380 };           // what the pines may fill
const BAYOU = { x0: 138, x1: EAST_MAX_X + 30, z0: 136, z1: 192 }; // the causeway's water, continued east
const MAIN_Z = -106;                                             // South Tusouxroe's street line
const ROAD_END_X = 352;
const SIDE_STREETS = [["Levee Street", 176], ["Pelican Street", 236], ["Boudin Row", 300]];
const SIDE_END_Z = 48;
const CROSS_Z = -20;

/**
 * @param {object} ctx from main.js: scene, camera, surface, roadMaterial, addBlocker,
 *   addLitSpot, flashObjective, shopParts, makeShed, makeFence, makeBarrel, makePallet,
 *   makeWaterTower, placeGlbLandmark
 */
export function createEastBank(ctx) {
  const { scene } = ctx;
  const C = createComposer(ctx, {
    name: "Lafourchette",
    bounds: { x0: 121, x1: EAST_MAX_X, z0: -136, z1: 382 },
    zones: { core: CORE, wild: WILD },
    seed: 70301,
  });
  const parts = ctx.shopParts || [];
  let announced = false;

  const std = (hex, rough, label, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, name: label, ...extra });
  function box(w, h, d, mat, x, y, z, ry = 0, parent = scene) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  /** World position of a point given in a building's local frame (front = local +z). */
  const local = (slot, lx, lz) => [slot.x + Math.cos(slot.rot) * lx + Math.sin(slot.rot) * lz, slot.z - Math.sin(slot.rot) * lx + Math.cos(slot.rot) * lz];

  const STORE_VARIANTS = [0, 2, 4, 6, 7, 3, 5, 1];
  const STORE_TYPES = ["market", "offices", "cafe", "garage", "fire_station", "school"];
  function storefront(slot) {
    const part = parts.length ? parts[STORE_VARIANTS[slot.index % STORE_VARIANTS.length] % parts.length] : null;
    if (ctx.placeGlbLandmark(part, slot.x, slot.z, slot.rot, 14, "Lafourchette storefront", 0xffd9a0)) {
      for (const [lx, lz] of [[-4.5, -4], [4.5, -4], [-4.5, 3], [4.5, 3]]) ctx.addBlocker(...local(slot, lx, lz), 3.2);
      return true;
    }
    const bType = STORE_TYPES[slot.index % STORE_TYPES.length];
    placeCityBuilding(ctx, bType, slot.x, slot.z, slot.rot);
    return true;
  }

  const SIDING = [0xd9c7a0, 0x9cc7b4, 0xe6b0a0, 0xc9d6e3, 0xefe4cf, 0xd98e73, 0xb7c99a];
  const trim = std(0xf2efe6, 0.8, "painted wood");
  const tin = std(0x4a4f55, 0.6, "metal roof", { metalness: 0.4 });
  const doorWood = std(0x5a3a28, 0.7, "wood door");
  const lamp = new THREE.MeshStandardMaterial({ color: 0x2a2418, emissive: 0xffc070, emissiveIntensity: 0.7, roughness: 0.4, name: "lit window" });
  lamp.userData.gtbRealized = true;
  const sidingMats = SIDING.map((c) => std(c, 0.85, "painted wood siding"));
  /** A shotgun house: narrow, deep, raised on piers, a porch on the street. */
  function shotgunHouse(slot) {
    const g = new THREE.Group();
    g.position.set(slot.x, 0, slot.z);
    g.rotation.y = slot.rot;
    const wall = sidingMats[(slot.index * 3 + Math.round(slot.s)) % sidingMats.length];
    box(5.6, 3.4, 9, wall, 0, 2.4, -0.8, 0, g);
    for (const s of [-1, 1]) {
      const r = box(3.5, 0.18, 9.8, tin, s * 1.42, 4.75, -0.8, 0, g);
      r.rotation.z = -s * 0.62;
    }
    box(5.6, 1.5, 0.12, wall, 0, 4.4, 3.64, 0, g);                  // gable end over the porch
    box(5.8, 0.25, 2.1, trim, 0, 0.62, 4.7, 0, g);                  // porch deck
    box(6.1, 0.14, 2.4, tin, 0, 3.55, 4.7, 0, g);                   // porch roof
    for (const px of [-2.7, 2.7]) box(0.18, 2.9, 0.18, trim, px, 2.1, 5.7, 0, g);
    box(1.1, 2.1, 0.08, doorWood, -1.3, 1.85, 3.74, 0, g);
    box(1.3, 1.4, 0.08, (slot.index % 3) ? lamp : trim, 1.3, 2.5, 3.74, 0, g);
    box(1.4, 0.3, 0.8, trim, -1.3, 0.25, 6.1, 0, g);                // steps
    scene.add(g);
    for (const lz of [-3, 1.8]) ctx.addBlocker(...local(slot, 0, lz), 3);
    return true;
  }

  const lanes = [
    { name: "Lafourche Rd eastbound", points: [[128, MAIN_Z + 2], [ROAD_END_X - 4, MAIN_Z + 2]], cruise: [9, 14] },
    { name: "Lafourche Rd westbound", points: [[ROAD_END_X - 4, MAIN_Z - 2], [128, MAIN_Z - 2]], cruise: [9, 14] },
  ];

  function buildSet() {
    // ---- 1 road: Lafourche Road, and the plan for everything after it
    C.road("Lafourche Road", [[121.5, MAIN_Z], [ROAD_END_X, MAIN_Z]], { width: 8, lampEvery: 32, y: 0.024 });
    for (const [, x] of SIDE_STREETS) C.site("street " + x, { x0: x - 5.5, x1: x + 5.5, z0: MAIN_Z + 5.6, z1: SIDE_END_Z + 2 });
    C.site("Cane Street", { x0: SIDE_STREETS[0][1], x1: SIDE_STREETS[2][1], z0: CROSS_Z - 5.5, z1: CROSS_Z + 5.5 });
    C.site("water tower", { x0: 130, x1: 148, z0: MAIN_Z + 7, z1: MAIN_Z + 25 });
    C.site("parking", { x0: 192, x1: 220, z0: MAIN_Z + 7, z1: MAIN_Z + 31 });
    C.site("market", { x0: 316, x1: 348, z0: MAIN_Z + 7, z1: MAIN_Z + 33 });
    C.site("ball field", { x0: 254, x1: 282, z0: -6, z1: 42 });
    C.site("St. Jude", { x0: ROAD_END_X + 2, x1: 376, z0: MAIN_Z - 12, z1: MAIN_Z + 12 });

    // ---- 2 buildings: storefronts facing Lafourche Road
    C.frontage("Lafourche Road", { setback: 13, spacing: 19, footprint: { w: 15, d: 14 }, startAt: 10, endAt: 2, label: "storefronts", build: storefront });

    // ---- 3 side streets, and the houses along them
    for (const [streetName, x] of SIDE_STREETS) {
      C.road(streetName, [[x, MAIN_Z + 4], [x, SIDE_END_Z]], { width: 7, stage: "sideStreets", lampEvery: 36, y: 0.021 });
    }
    C.road("Cane Street", [[SIDE_STREETS[0][1], CROSS_Z], [SIDE_STREETS[2][1], CROSS_Z]], { width: 7, stage: "sideStreets", y: 0.02 });
    for (const [streetName] of SIDE_STREETS) {
      C.frontage(streetName, { stage: "sideStreets", setback: 11.5, spacing: 13, footprint: { w: 8, d: 11 }, startAt: 8, label: streetName + " houses", build: shotgunHouse });
    }

    // ---- 4 open areas
    C.openArea("water tower", { color: "#4f5a3e", build: (r, c) => {
      ctx.makeWaterTower(c.x, c.z + 2, "LAFOURCHETTE", ["EST. 1791", "HOME OF THE BOUDIN FESTIVAL"], "LEVEE BOARD TOOK THE MONEY");
    } });
    C.openArea("parking", { color: "#55544e", build: (r, c) => {
      C.plane(c.w, c.d, C.tiled(ctx.roadMaterial(), c.w, c.d, 9), c.x, 0.02, c.z);
      const line = std(0xe8e4d8, 0.7, "road paint");
      line.userData.gtbRealized = true;
      for (let x = r.x0 + 2; x <= r.x1 - 2; x += 3.2) {
        C.plane(0.14, 5, line, x, 0.03, r.z0 + 4);
        C.plane(0.14, 5, line, x, 0.03, r.z1 - 4);
      }
      placeOfficeClutter(ctx, r.x0 + 4, r.z0 + 5);
      ctx.addLitSpot({ x: c.x, y: 8.5, z: c.z, warm: 0xffbf74, power: 150, range: 30, pole: true });
      placeParkedCar(ctx, "beatall", r.x0 + 5, r.z0 + 4, 0);
      placeParkedCar(ctx, "doclorean", r.x0 + 11.4, r.z0 + 4, 0);
      placeParkedCar(ctx, "landyroamer", r.x0 + 17.8, r.z0 + 4, 0);
      placeParkedCar(ctx, "tristar", r.x0 + 8.2, r.z1 - 4, Math.PI);
      placeParkedCar(ctx, "toyoyo", r.x0 + 21, r.z1 - 4, Math.PI);
    } });
    C.openArea("market", { color: "#6b5a44", zoneName: "market_row", build: (r, c) => {
      const dirt = ctx.surface("dirt", 512).material(1);
      C.plane(c.w, c.d, C.tiled(dirt, c.w, c.d, 8), c.x, 0.021, c.z);
      makeDecorativeFence(ctx, r.x0 + 1, r.z0 + 1, r.x1 - 1, r.z0 + 1);
      const canvas = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xe67e22, 0x8e44ad].map((h) => std(h, 0.9, "canvas awning"));
      const table = std(0x7a5a3a, 0.9, "wood table");
      let i = 0;
      for (const z of [r.z0 + 7, r.z0 + 17]) {
        for (let x = r.x0 + 6; x < r.x1 - 3; x += 10) {
          box(4, 0.12, 3, canvas[i++ % canvas.length], x, 2.6, z);
          for (const [ox, oz] of [[-1.9, -1.4], [1.9, -1.4], [-1.9, 1.4], [1.9, 1.4]]) box(0.1, 2.6, 0.1, trim, x + ox, 1.3, z + oz);
          box(3.2, 0.9, 1.1, table, x, 0.45, z - 0.6);
          ctx.addBlocker(x, z, 1.8);
        }
      }
      ctx.makeBarrel(r.x1 - 2, r.z1 - 2); ctx.makeBarrel(r.x1 - 3.2, r.z1 - 2.4);
      ctx.makePallet(r.x0 + 2.5, r.z1 - 2.5, 0.3);
      ctx.addLitSpot({ x: c.x, y: 6, z: c.z, warm: 0xffc48a, power: 120, range: 26, pole: true });
    } });
    C.openArea("ball field", { color: "#3f6b34", build: (r, c) => {
      const grass = ctx.surface("grass", 512).material(1, { color: 0x9fcf86 });
      C.plane(c.w, c.d, C.tiled(grass, c.w, c.d, 6), c.x, 0.02, c.z);
      const infield = C.plane(15, 15, C.tiled(ctx.surface("dirt", 512).material(1), 15, 15, 5), c.x, 0.024, r.z0 + 12);
      infield.rotation.z = Math.PI / 4;
      const base = std(0xf4f1ea, 0.8, "base");
      for (const [bx, bz] of [[0, 1.5], [7.4, 9], [0, 16.5], [-7.4, 9]]) box(0.5, 0.08, 0.5, base, c.x + bx, 0.06, r.z0 + bz);
      ctx.makeFence(r.x0 + 1, r.z0 + 0.5, r.x1 - 1, r.z0 + 0.5);                // backstop side, toward Cane Street
      ctx.makeFence(r.x0 + 0.5, r.z0 + 1, r.x0 + 0.5, r.z1 - 1);
      ctx.makeFence(r.x1 - 0.5, r.z0 + 1, r.x1 - 0.5, r.z1 - 1);
      const bench = std(0x8a8f96, 0.5, "aluminium bleacher", { metalness: 0.6 });
      for (let k = 0; k < 3; k++) box(9, 0.3, 1, bench, c.x, 0.5 + k * 0.6, r.z1 - 2.5 - k * 1);
      ctx.addBlocker(c.x - 3, r.z1 - 3.5, 2.5); ctx.addBlocker(c.x + 3, r.z1 - 3.5, 2.5);
      for (const x of [r.x0 + 2, r.x1 - 2]) ctx.addLitSpot({ x, y: 10, z: r.z0 + 4, warm: 0xf4f8ff, power: 160, range: 34, pole: true });
    } });
    const swamp = new THREE.MeshPhysicalMaterial({
      color: 0x07120f, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.92,
      clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 0.9, name: "swamp water",
    });
    swamp.userData.gtbRealized = true;
    C.water(BAYOU, swamp);

    // ---- 5 vegetation: pines on whatever is left
    C.vegetation(WILD, {
      spacing: 8.5, jitter: 3, clearance: 3,
      trunk: ctx.surface("dirt", 512).material(2, { color: 0xc9b49a, envMapIntensity: 0.7 }),
      foliage: ctx.surface("grass", 512).material(3, { color: 0xb9d69a, envMapIntensity: 0.8 }),
    });

    // ---- 6 landmark: St. Jude of the Levee, at the end of Lafourche Road, facing down it (west)
    C.landmark("St. Jude", (r) => {
      // built by church.js (Buildings.glb has no church): the steeple over the doors, facing west down Lafourche Road
      const z = MAIN_Z, front = ROAD_END_X + 5;                                   // nave from x 357 back to 374
      const concrete = ctx.surface("concrete", 512).material(1, { color: 0xc9c3b8 });
      C.plane(8, 14, C.tiled(concrete, 8, 14, 5), ROAD_END_X + 2, 0.023, z);      // the apron where the road ends
      makeChurch(ctx, { x: front, z, rot: -Math.PI / 2, length: r.x1 - 2 - front, name: "St. Jude of the Levee" });
      ctx.addLitSpot({ x: ROAD_END_X - 2, y: 7, z: z + 7, warm: 0xfff0c8, power: 150, range: 30, pole: true });
    });
  }

  return {
    EAST_MAX_X, CORE, WILD, BAYOU, lanes,
    composer: C,
    buildSet,
    zoneAt: (x, z) => C.zoneAt(x, z),
    report: () => C.report(),
    get pois() { return C.pois; },
    get props() { return C.props; },
    get minimap() { return C.minimap; },
    get drawn() { return C.drawn; },
    update(dt, playerPos) {
      if (!announced && playerPos.x > 140 && playerPos.z < 70) {
        announced = true;
        ctx.flashObjective("LAFOURCHETTE · pop. 1,140. Boudin, Friday bingo, and a levee nobody paid for.");
      }
      C.update(dt, ctx.camera ? ctx.camera.position : playerPos);
    },
  };
}
