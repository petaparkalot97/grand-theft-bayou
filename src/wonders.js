// ---------------------------------------------------------------------------
// wonders.js — four Louisiana set pieces off Delta Road, in the east wilderness
// band (human request, 2026-09-26: "creating new locations on the map ...
// iconic Louisiana spots"). Composed with composer.js like the towns are, from
// townkit.js / louisianakit.js, each reached by a short spur off Delta Road:
//
//   Belle Plantation      an Oak Alley: two rows of live oaks a quarter of a
//                         kilometre long, leading to a white-columned Greek
//                         Revival big house; parterre gardens, a pond and gazebo,
//                         the sugar kettles, a gift shop and a lot
//   Hot Bayou Pepper Works  Avery Island's idea: tilled pepper fields, the
//                         brick factory with its stack, a giant red sauce bottle,
//                         a barrel house, and a tasting room that sells the cure
//   Pelican Petrochemical  River Road's refinery: distillation columns, spheres,
//                         pipe racks, a flare that never goes out, a tank farm
//   Bayou State Penitentiary & Prison Rodeo   Angola's walls and towers, and
//                         the Sunday rodeo in the arena across the road. In
//                         zombie mode the walls are a safehouse.
//
// Their ground is registered in districts.js KEEPOUTS so Delta Road's farmsteads,
// its forest and the wilderness band's pines keep out of it.
//
// `R` is stateWorld.js's shared environment: { ctx, kit, la, lanes, pois, minimap,
// composers, addOccluder, regions }.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { createComposer } from "./composer.js";
import { placeGunShop } from "./landmarks.js";

const BOUNDS = { x0: 440, x1: 1060, z0: -340, z1: 380 };

/** The four spurs off Delta Road. corridors.js hands them to Delta's composer as junctions, so its grid knows them as road. */
export const SPURS = [
  { name: "Plantation Lane", points: [[753, -260], [604, -260]], width: 7 },
  { name: "River Road", points: [[808, -40], [1040, -40]], width: 8 },
  { name: "Pepper Lane", points: [[808, 150], [912, 150]], width: 7 },
  { name: "Rodeo Road", points: [[802, 300], [710, 300]], width: 7 },
];

export function buildWonders(R) {
  const { ctx, kit } = R;
  const { scene, addBlocker } = ctx;
  const { mat, box, cyl, gable, sign, at, group, block, hash, pick } = kit;
  const C = createComposer(ctx, { name: "Wonders", bounds: BOUNDS, zones: { wild: BOUNDS }, seed: 20260926 });
  R.composers.push(C);

  // ------------------------------------------------------------ shared materials and helpers
  const gravel = () => mat(0xb0a284, "gravel drive road", 1);
  const concrete = () => mat(0x8f918c, "concrete slab apron", 0.95);
  const steel = () => mat(0x6d747a, "structural steel pipe", 0.5, { metalness: 0.35 });
  const tin = () => mat(0x8f979c, "corrugated tin roof sheet", 0.6);
  const emissive = (hex, name) => { const m = new THREE.MeshBasicMaterial({ color: hex, name }); m.userData.gtbRealized = true; return m; };
  const place = (x, z, rot) => { const g = group({ x, z, rot }); scene.add(g); return g; };
  const disc = (parent, r, material, x, y, z, seg = 32) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, seg), material);
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; parent.add(m); return m;
  };
  /** A hip roof: a four-sided pyramid, `w` x `d` at the eaves, `h` tall, sitting on y. */
  const hip = (g, w, d, h, material, x, y, z) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(1, h, 4, 1).rotateY(Math.PI / 4), material);
    m.scale.set(w / Math.SQRT2, 1, d / Math.SQRT2); m.position.set(x, y + h / 2, z); m.castShadow = true; g.add(m); return m;
  };
  /** A round pipe between two points at height y (axis-aligned runs). */
  const pipe = (g, x0, z0, x1, z1, y, r, material) => {
    const along = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, along, 8), material);
    m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    m.rotation.set(Math.abs(x1 - x0) > Math.abs(z1 - z0) ? 0 : Math.PI / 2, 0, Math.abs(x1 - x0) > Math.abs(z1 - z0) ? Math.PI / 2 : 0);
    m.castShadow = true; g.add(m); return m;
  };
  /** A two-sided roadside board on two posts, facing `rot` (and back). */
  function roadSign(x, z, rot, title, sub, bg = "#1f4a2a", ink = "#fff4d8") {
    const g = place(x, z, rot);
    for (const px of [-2.4, 2.4]) box(g, 0.18, 3.4, 0.18, mat(0x5a4a3a, "wood post", 0.9), px, 1.7, 0);
    box(g, 5.6, 2.3, 0.16, mat(0x1a1a1a, "sign board back", 0.7), 0, 3.6, 0);
    for (const flip of [0, Math.PI]) {
      const s = new THREE.Group(); s.rotation.y = flip; g.add(s);
      sign(s, 5.3, 1.15, title, 0, 4.05, 0.09, ink, bg);
      sign(s, 5.3, 0.8, sub, 0, 3.0, 0.09, "#ffd27a", "#15151a");
    }
    for (const px of [-2.4, 2.4]) { const [wx, wz] = at({ x, z, rot }, px, 0); addBlocker(wx, wz, 0.35); }
  }
  /** A chain-link fence with razor wire between two points, circles of collision along it. */
  function fence(g, x0, z0, x1, z1, { h = 3.2, wall = false, every = 4 } = {}) {
    const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if (wall) {
      box(g, 0.7, h, len, mat(0xa9a79c, "concrete wall block", 0.95), mx, h / 2, mz, a);
    } else {
      const post = mat(0x55595c, "steel post", 0.6), wire = mat(0x7d8286, "chain link steel", 0.5);
      box(g, 0.05, h, len, wire, mx, h / 2, mz, a);
      const n = Math.max(1, Math.round(len / 5));
      for (let i = 0; i <= n; i++) box(g, 0.14, h + 0.4, 0.14, post, x0 + (x1 - x0) * i / n, (h + 0.4) / 2, z0 + (z1 - z0) * i / n);
    }
    box(g, 0.1, 0.5, len, mat(0x2a2c2e, "razor wire steel", 0.4), mx, h + 0.35, mz, a);      // razor wire along the top
    const n = Math.max(1, Math.round(len / every));
    for (let i = 0; i <= n; i++) addBlocker(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n, every * 0.36 + 0.4);
  }
  /** Fence with a gap: [x0,z0]-[x1,z1] on an axis, opening from `g0` to `g1` (along the run). */
  function fenceWithGap(g, x0, z0, x1, z1, g0, g1, opts) {
    const alongX = z0 === z1;
    if (alongX) { fence(g, x0, z0, g0, z1, opts); fence(g, g1, z0, x1, z1, opts); }
    else { fence(g, x0, z0, x1, g0, opts); fence(g, x0, g1, x1, z1, opts); }
  }

  // ================================================================ 1 roads: the four spurs
  const spur = (name, points, width, extra = {}) => C.road(name, points, { width, sidewalk: 0, centreLine: false, ...extra });
  const [lane, river, pepper, rodeo] = SPURS;
  spur(lane.name, lane.points, lane.width, { material: gravel, y: 0.026 });
  spur(river.name, river.points, river.width, { centreLine: true, lampEvery: 40, y: 0.024 });
  spur(pepper.name, pepper.points, pepper.width, { material: gravel, y: 0.026 });
  spur(rodeo.name, rodeo.points, rodeo.width, { lampEvery: 40, y: 0.024 });

  // ================================================================ 2 sites
  C.site("plantation", { x0: 470, x1: 598, z0: -312, z1: -208 });
  C.site("plantation lot", { x0: 606, x1: 640, z0: -304, z1: -286 });
  C.site("plantation store", { x0: 606, x1: 640, z0: -236, z1: -216 });
  C.site("pepper works", { x0: 918, x1: 1044, z0: 100, z1: 204 });
  C.site("pepper field N", { x0: 812, x1: 912, z0: 100, z1: 144 });
  C.site("pepper field S", { x0: 812, x1: 912, z0: 156, z1: 200 });
  C.site("refinery", { x0: 826, x1: 1044, z0: -232, z1: -52 });
  C.site("tank farm", { x0: 930, x1: 1040, z0: -26, z1: 42 });
  C.site("prison", { x0: 544, x1: 704, z0: 236, z1: 366 });
  C.site("armory", { x0: 766, x1: 800, z0: 312, z1: 334 });
  C.site("rodeo arena", { x0: 712, x1: 790, z0: 236, z1: 292 });
  C.site("rodeo lot", { x0: 712, x1: 762, z0: 310, z1: 352 });
  C.claim({ x0: 606, x1: 750, z0: -282, z1: -266 });            // the oak rows either side of the lane
  C.claim({ x0: 606, x1: 750, z0: -254, z1: -238 });

  // ================================================================ 3 open areas
  C.openArea("plantation lot", { color: "#6d6a5e", build: kit.areas.lot(C, { cars: 5 }) });
  C.openArea("tank farm", { color: "#5a5d58", build: kit.areas.tankFarm(C, { tanks: 6 }) });
  C.openArea("rodeo lot", { color: "#6d6a5e", build: kit.areas.lot(C, { cars: 5 }) });

  // ---- pepper fields: tilled rows of low plants, pods red and orange and green
  function pepperField(rect) {
    const c = { x: (rect.x0 + rect.x1) / 2, z: (rect.z0 + rect.z1) / 2 };
    C.plane(rect.x1 - rect.x0, rect.z1 - rect.z0, mat(0x4a3826, "tilled soil dirt", 1), c.x, 0.024, c.z);
    const plants = [];
    for (let z = rect.z0 + 3; z < rect.z1 - 2; z += 2.6) for (let x = rect.x0 + 2; x < rect.x1 - 1; x += 1.4) plants.push([x + (hash(x, z, 1) - 0.5) * 0.3, z, 0.8 + hash(x, z, 2) * 0.5]);
    const bush = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 6, 5), mat(0x3f7a30, "pepper plant foliage", 0.9), plants.length);
    const pods = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 5, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, name: "pepper pod plant" }), plants.length * 2);
    pods.material.userData.gtbRealized = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    const tones = [0xd41f16, 0xe0361a, 0xf08a1c, 0x86b62e, 0xc81a12];
    plants.forEach(([x, z, k], i) => {
      bush.setMatrixAt(i, m.compose(p.set(x, 0.42 * k, z), q, s.set(k, 0.85 * k, k)));
      for (let j = 0; j < 2; j++) {
        const a = (hash(x, z, 3 + j) * 6.283), rr = 0.42 * k;
        pods.setMatrixAt(i * 2 + j, m.compose(p.set(x + Math.cos(a) * rr, (0.55 + hash(x, z, 5 + j) * 0.3) * k, z + Math.sin(a) * rr), q, s.set(1, 1.7, 1)));
        pods.setColorAt(i * 2 + j, col.setHex(pick(tones, hash(x + j, z, 7))));
      }
    });
    for (const im of [bush, pods]) { im.computeBoundingSphere(); im.castShadow = false; scene.add(im); }
    // the scarecrow in the middle: a cross of sticks, a sack head, a straw hat
    const sc = new THREE.Group(); sc.position.set(c.x, 0, c.z); scene.add(sc);
    const wood = mat(0x5a4a3a, "wood post", 0.9);
    box(sc, 0.12, 2.2, 0.12, wood, 0, 1.1, 0); box(sc, 1.7, 0.1, 0.1, wood, 0, 1.75, 0);
    box(sc, 0.7, 0.9, 0.3, mat(0x6a7a9a, "old shirt cloth", 1), 0, 1.45, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(0xc9b48a, "burlap sack cloth", 1)); head.position.set(0, 2.05, 0); sc.add(head);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.3, 10), mat(0xd6b25a, "straw hat", 1)); hat.position.set(0, 2.32, 0); sc.add(hat);
  }
  C.openArea("pepper field N", { color: "#5a3a26", zoneName: "rural", build: (r) => pepperField(r) });
  C.openArea("pepper field S", { color: "#5a3a26", zoneName: "rural", build: (r) => pepperField(r) });

  // ================================================================ 4 landmarks
  // ---- Belle Plantation ---------------------------------------------------------
  C.cluster("plantation lawn", () => C.plane(286, 100, mat(0x4a6a3a, "plantation lawn grass", 1), 613, 0.012, -260));
  C.landmark("plantation", (r, c) => {
    const HX = 548, HZ = -260;                                     // the big house, its front gallery facing east down the alley
    const g = place(HX, HZ, Math.PI / 2), slot = { x: HX, z: HZ, rot: Math.PI / 2 };
    const brick = mat(0xa4573a, "red brick wall", 0.9), plaster = mat(0xecdcae, "pale plaster wall", 0.85);
    const white = mat(0xf6f3ea, "white column plaster", 0.7), slate = mat(0x3f4a52, "slate roof sheet", 0.7);
    const shutter = mat(0x2f5a3a, "green shutter wood", 0.85), door = mat(0x4a2e1e, "dark wood door", 0.8);
    const W = 24, D = 14, GX = W / 2 + 2.3, GZ = D / 2 + 2.3;
    box(g, W + 2, 3, D + 2, brick, 0, 1.5, 0);                     // the raised brick ground floor
    box(g, W, 5.2, D, plaster, 0, 5.6, 0);                         // main floor
    box(g, W, 4.6, D, plaster, 0, 10.5, 0);                        // upper floor
    box(g, W + 5, 0.4, D + 5, white, 0, 3.2, 0);                   // the gallery floor, and the upper gallery's
    box(g, W + 5, 0.36, D + 5, white, 0, 8.4, 0);
    for (let i = 0; i < 9; i++) for (const s of [-1, 1]) cyl(g, 0.5, 9.9, white, -GX + (2 * GX / 8) * i, 8.2, s * GZ, 12);   // the colonnade: front and back rows...
    for (const s of [-1, 1]) for (const z of [-GZ / 2, GZ / 2 - 1.2]) cyl(g, 0.5, 9.9, white, s * GX, 8.2, z, 12);             // ...and the sides
    for (const s of [-1, 1]) for (let i = 0; i < 9; i++) box(g, 2 * GX / 8 - 0.4, 0.08, 0.06, white, -GX + (2 * GX / 8) * i + GX / 8, 9.2, s * GZ);   // the upper gallery's rail
    hip(g, W + 6.4, D + 6.4, 5.4, slate, 0, 13.1, 0);
    for (const x of [-6.5, 0, 6.5]) {                              // dormers on the front slope
      box(g, 2.2, 2.2, 1.6, plaster, x, 14.5, 5);
      gable(g, 2.7, 1.2, 1.9, slate, x, 15.6, 5.5, 0);
      box(g, 1.1, 1.4, 0.08, kit.windowMat(hash(x, 4, 11)), x, 14.5, 5.42);
    }
    box(g, 3.4, 2.4, 3.4, plaster, 0, 19.3, 0); hip(g, 4.4, 4.4, 1.6, slate, 0, 20.5, 0);   // the belvedere
    for (const sx of [-8, 8]) box(g, 1.5, 6, 1.5, brick, sx, 17.2, -1.5);                  // chimneys
    // the facade: five windows a floor with shutters, the door in the middle, a transom over it
    for (const [y, row] of [[5.9, 0], [10.7, 1]]) for (const x of [-9, -4.5, 0, 4.5, 9]) {
      if (x === 0 && row === 0) continue;
      box(g, 1.3, 2.8, 0.12, kit.windowMat(hash(x, y, 12)), x, y, D / 2 + 0.03);
      for (const s of [-1, 1]) box(g, 0.5, 2.8, 0.1, shutter, x + s * 1.0, y, D / 2 + 0.04);
    }
    box(g, 2.2, 3.8, 0.16, door, 0, 5.3, D / 2 + 0.05); box(g, 2.2, 0.8, 0.12, kit.windowMat(0.1), 0, 7.6, D / 2 + 0.05);
    box(g, 2.6, 0.2, 0.3, white, 0, 3.6 + 4.4, D / 2 + 0.1);
    for (const s of [-1, 1]) for (const z of [-3.5, 3.5]) { box(g, 1.3, 2.8, 0.12, kit.windowMat(hash(z, s, 13)), s * (W / 2 + 0.03), 5.9, z, Math.PI / 2); box(g, 1.3, 2.8, 0.12, kit.windowMat(hash(z, s, 14)), s * (W / 2 + 0.03), 10.7, z, Math.PI / 2); }
    for (let i = 0; i < 5; i++) box(g, 6.4, (i + 1) * 0.64, 0.9, white, 0, (i + 1) * 0.32, GZ + 0.5 + (4 - i) * 0.9);   // the front steps
    block(slot, W + 4, D + 5);
    // the drive: a gravel forecourt in front of the steps, running out to the lane
    C.plane(34, 7, gravel(), 587, 0.026, HZ);
    disc(scene, 11, gravel(), 580, 0.027, HZ, 40);
    for (const z of [HZ - 5, HZ + 5]) ctx.addLitSpot({ x: 572, y: 5.5, z, warm: 0xffe2b0, power: 240, range: 40, pole: true });

    // parterre gardens to the north: clipped hedges in a cross, a fountain at the middle
    const hedge = mat(0x2f5a2a, "boxwood hedge foliage", 0.9);
    for (const z of [-292, -298, -304]) box(scene, 66, 0.8, 0.8, hedge, 545, 0.4, z);
    for (const x of [515, 545, 575]) box(scene, 0.8, 0.8, 24, hedge, x, 0.4, -297);
    for (const [x, z] of [[515, -292], [575, -292], [515, -304], [575, -304]]) { const b = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), hedge); b.position.set(x, 0.9, z); b.scale.y = 1.2; b.castShadow = true; scene.add(b); }
    const stoneM = mat(0xc4c0b4, "stone fountain concrete", 0.85);
    cyl(scene, 2.4, 0.7, stoneM, 545, 0.35, -297, 18); cyl(scene, 0.35, 2.2, stoneM, 545, 1.5, -297, 8); cyl(scene, 1.1, 0.25, stoneM, 545, 2.5, -297, 12);
    addBlocker(545, -297, 2.6);
    // the pond to the south, and a gazebo on its shore
    const pondM = new THREE.MeshPhysicalMaterial({ color: 0x1a3a30, roughness: 0.15, transparent: true, opacity: 0.75, name: "pond water" }); pondM.userData.gtbRealized = true;
    const pond = disc(scene, 9, pondM, 552, 0.034, -224, 32); pond.scale.set(1.5, 1, 1);
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; addBlocker(552 + Math.cos(a) * 13.5, -224 + Math.sin(a) * 9.2, 1.8); }
    const gz = new THREE.Group(); gz.position.set(520, 0, -228); scene.add(gz);
    cyl(gz, 2.6, 0.3, white, 0, 0.15, 0, 16);
    for (let i = 0; i < 8; i++) cyl(gz, 0.1, 3.2, white, Math.cos(i / 8 * 6.283) * 2.3, 1.9, Math.sin(i / 8 * 6.283) * 2.3, 6);
    const gr = new THREE.Mesh(new THREE.ConeGeometry(3, 1.6, 8), slate); gr.position.y = 4.1; gr.castShadow = true; gz.add(gr);
    addBlocker(520, -228, 2.8);
    // the sugar kettles, iron cauldrons in a row, with the interpretive sign
    const iron = mat(0x25282a, "cast iron kettle steel", 0.5, { metalness: 0.3 });
    for (let i = 0; i < 5; i++) {
      const k = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), iron);
      k.position.set(496 + i * 3.2, 1.15, -212); k.scale.y = 0.9; k.castShadow = true; scene.add(k); addBlocker(496 + i * 3.2, -212, 1.3);
    }
    // the carriage house and a couple of the oaks that came before the alley did
    kit.shops.barn()({ x: 500, z: -300, rot: 0, index: 0, side: 1 });
    R.la.liveOaks(scene, [[488, -240, 1.2], [590, -232, 1.0], [592, -292, 1.1], [478, -276, 1.0]], { moss: 34 });
    R.pois.push({ x: HX + 20, z: HZ, r: 14, label: "Belle Plantation" });
  });
  C.cluster("plantation alley", () => {
    // the alley: fourteen live oaks, seven a side, forming the arch to the house
    const list = [];
    for (let i = 0; i < 7; i++) for (const s of [-1, 1]) list.push([735 - i * 20, -260 + s * 10.5, 1.15]);
    R.la.liveOaks(scene, list, { moss: 30 });
    roadSign(747, -273, -Math.PI / 2, "BELLE PLANTATION", "TOURS ON THE HOUR · GHOST TOURS AFTER DARK", "#26472c");
    // lamps down the lane, lit at night
    for (let x = 720; x >= 620; x -= 50) ctx.addLitSpot({ x, y: 4.3, z: -260, warm: 0xffd9a0, power: 90, range: 22 });
    R.pois.push({ x: 700, z: -260, r: 10, label: "Oak Alley" });
  });
  C.landmark("plantation store", (r, c) => {
    kit.shops.strip({ names: ["PLANTATION STORE & CAFÉ", "PRALINES & PECANS"], bgs: ["#26472c", "#5a1a1a"] })({ x: 623, z: -226, rot: Math.PI, index: 0, side: 1 });
    R.pois.push({ x: 623, z: -246, r: 8, label: "Plantation Store" });
  });

  // ---- Hot Bayou Pepper Works ------------------------------------------------------
  C.landmark("pepper works", (r, c) => {
    C.plane(126, 104, gravel(), c.x, 0.022, c.z);
    // the factory: brick hall, tin roof along its length, stack, loading doors, the name across the front
    const F = { x: 995, z: 150, rot: -Math.PI / 2 };                // its front (local +z) faces west, down the lane
    const g = place(F.x, F.z, F.rot);
    const brick = mat(0x8a3a2a, "red brick wall", 0.9), trim = mat(0xf2efe6, "white trim plaster", 0.8);
    box(g, 34, 8, 15, brick, 0, 4, 0);
    gable(g, 16.5, 3.6, 35, tin(), 0, 8, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++) box(g, 3.2, 3.6, 0.14, mat(0x2a2f36, "roll door steel", 0.6), -11 + i * 7.4, 1.8, 7.6);
    for (let i = 0; i < 6; i++) box(g, 1.4, 1.6, 0.12, kit.windowMat(hash(i, 3, 21)), -13 + i * 5.2, 6.1, 7.55);
    box(g, 30, 0.35, 0.3, trim, 0, 7.6, 7.7);
    sign(g, 22, 2.6, "HOT BAYOU PEPPER SAUCE CO.", 0, 9.4, 7.8, "#fff4d8", "#a01f14", "#f4c542");
    sign(g, 11, 1.1, "EST. 1868 · THE ORIGINAL RECIPE", 0, 7.0, 7.8, "#3a1206", "#f2e2b8");
    cyl(g, 1.3, 20, mat(0x7a3428, "brick chimney stack", 0.9), -13, 10, -4.5, 12);
    cyl(g, 1.42, 1.2, mat(0xd8d4c8, "chimney band plaster", 0.8), -13, 19.3, -4.5, 12);
    block(F, 35, 16);
    // the bottle: a red tank shaped like the product, with a label you can read from the lane
    const bx = 950, bz = 117, B = place(bx, bz, -Math.PI / 2);
    const redM = mat(0xb3261e, "red sauce tank steel", 0.4, { metalness: 0.2 });
    cyl(B, 3.5, 11, redM, 0, 5.5, 0, 20);
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 3.5, 4, 20), redM); shoulder.position.y = 13; shoulder.castShadow = true; B.add(shoulder);
    cyl(B, 1.35, 3.2, redM, 0, 16.6, 0, 16);
    cyl(B, 1.6, 1.3, mat(0x2e7d32, "green cap steel", 0.5), 0, 18.9, 0, 16);
    box(B, 3.4, 0.22, 3.4, concrete(), 0, 0.11, 0);
    sign(B, 5.6, 2.4, "HOT BAYOU", 0, 7.6, 3.6, "#3a1206", "#f2e2b8", "#a01f14");
    sign(B, 5.6, 1.5, "PEPPER SAUCE", 0, 5.4, 3.6, "#a01f14", "#f2e2b8", "#3a1206");
    addBlocker(bx, bz, 3.8);
    ctx.addLitSpot({ x: bx - 6, y: 6, z: bz, warm: 0xffe0c0, power: 170, range: 32, pole: true });
    // the barrel house: white-oak barrels ageing three years under a tin roof
    const barrelG = new THREE.CylinderGeometry(0.42, 0.42, 0.95, 10);
    const barrels = new THREE.InstancedMesh(barrelG, mat(0x6a4a2a, "oak barrel wood", 0.9), 90);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(); let n = 0;
    for (let row = 0; row < 3; row++) for (let i = 0; i < 15; i++) for (let k = 0; k < 2; k++) if (n < 90) barrels.setMatrixAt(n++, m.compose(p.set(952 + i * 1.05, 0.48 + k * 0.95, 177 + row * 1.15), q, s1));
    barrels.computeBoundingSphere(); scene.add(barrels);
    gable(scene, 9, 2.6, 18, tin(), 960, 3.6, 179, Math.PI / 2);
    for (const px of [952, 960, 968]) for (const pz of [175, 183]) cyl(scene, 0.12, 3.6, mat(0x5a4a3a, "wood post", 0.9), px, 1.8, pz, 6);
    for (let i = 0; i < 7; i++) addBlocker(952 + i * 2.4, 179, 2.1);
    // the tasting room: a porch, a counter, and the sign that says FREE SAMPLES
    const T = { x: 936, z: 126, rot: 0 }, t = place(T.x, T.z, T.rot);
    box(t, 12, 4, 8, mat(0xe9d9a6, "cream plaster wall", 0.85), 0, 2, 0);
    gable(t, 9.5, 2.4, 13, tin(), 0, 4, 0, Math.PI / 2);
    box(t, 12, 0.25, 3, mat(0x7a5a3a, "porch wood board", 0.9), 0, 0.15, 5.6);
    for (const px of [-5.5, 5.5]) cyl(t, 0.14, 3.6, mat(0x5a4a3a, "wood post", 0.9), px, 1.9, 6.9, 6);
    box(t, 12, 0.3, 3.4, tin(), 0, 3.7, 5.5);
    sign(t, 8.5, 1.3, "TASTING ROOM · FREE SAMPLES", 0, 3.3, 7.25, "#fff4d8", "#a01f14", "#f4c542");
    box(t, 1.4, 2.2, 0.12, mat(0x4a2e1e, "dark wood door", 0.8), 0, 1.2, 4.05);
    block(T, 12, 8);
    ctx.addService && ctx.addService({ kind: "food", name: "Hot Bayou Tasting Bar", x: 936, z: 133.6, face: Math.PI, extra: { dish: "The tasting flight: three sauces, a biscuit, a glass of milk" } });
    R.pois.push({ x: 936, z: 138, r: 8, label: "Hot Bayou Tasting Room" }, { x: 970, z: 150, r: 12, label: "Hot Bayou Pepper Works" });
  });
  C.cluster("pepper sign", () => roadSign(813, 140, -Math.PI / 2, "HOT BAYOU PEPPER WORKS", "TOURS · TASTING · GIFT SHOP · 2 MI", "#a01f14"));

  // ---- Pelican Petrochemical -----------------------------------------------------
  C.landmark("refinery", (r, c) => {
    const g = new THREE.Group(); scene.add(g);
    C.plane(212, 170, mat(0x55554f, "plant gravel yard", 0.98), c.x, 0.021, c.z);
    // the fence: gate at the west end of the road side
    fenceWithGap(g, 828, -56, 1042, -56, 848, 864, { h: 3 });
    fence(g, 1042, -56, 1042, -230, { h: 3 }); fence(g, 1042, -230, 828, -230, { h: 3 }); fence(g, 828, -230, 828, -56, { h: 3 });
    roadSign(845, -46, Math.PI, "PELICAN PETROCHEMICAL", "SAFETY FIRST · 0 DAYS SINCE LAST INCIDENT", "#0d3a66");
    // the gatehouse and the office
    kit.shops.warehouse({ tone: 0xd4d0c4, w: 20, d: 11, h: 5 })({ x: 880, z: -70, rot: 0, index: 0, side: 1 });
    kit.shops.warehouse({ tone: 0xb8bcc0, w: 26, d: 12, h: 6 })({ x: 1000, z: -70, rot: 0, index: 1, side: 1 });
    // the pipe rack across the yard, and the run north to the columns
    const rackM = mat(0x4a4f55, "rack steel post", 0.6);
    for (let x = 860; x <= 1030; x += 8) { box(g, 0.5, 6.4, 0.5, rackM, x, 3.2, -168); box(g, 0.4, 0.4, 3, rackM, x, 6.4, -168); }
    for (const [dz, y, rad, col] of [[-1, 5.6, 0.3, 0x6a7a86], [0, 6.1, 0.42, 0xb04a30], [1, 6.6, 0.26, 0x3a6a3a]]) pipe(g, 860, -168 + dz, 1030, -168 + dz, y, rad, mat(col, "process pipe steel", 0.5, { metalness: 0.35 }));
    for (let z = -160; z <= -90; z += 8) { box(g, 0.5, 6.4, 0.5, rackM, 868, 3.2, z); box(g, 3, 0.4, 0.4, rackM, 868, 6.4, z); }
    for (const [dx, y, rad] of [[-1, 5.6, 0.3], [1, 6.4, 0.34]]) pipe(g, 868 + dx, -168, 868 + dx, -88, y, rad, steel());
    // distillation columns: ringed shells, platforms, ladder cages, a beacon on the crown
    for (const [x, z, h, rad] of [[905, -120, 28, 1.8], [925, -128, 22, 1.5], [948, -114, 32, 2.0]]) {
      const shell = mat(0xa8adb0, "column steel shell", 0.45, { metalness: 0.4 });
      cyl(g, rad, h, shell, x, h / 2, z, 16);
      for (let y = 5; y < h - 2; y += 6) cyl(g, rad + 0.55, 0.25, mat(0x3a3f44, "grating steel", 0.6), x, y, z, 16);
      box(g, 0.14, h, 0.9, mat(0x2a2f34, "ladder cage steel", 0.6), x + rad + 0.1, h / 2, z);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(rad, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), shell); dome.position.set(x, h, z); g.add(dome);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), emissive(0xff2a1a, "aviation beacon")); beacon.position.set(x, h + rad + 0.4, z); g.add(beacon);
      addBlocker(x, z, rad + 0.8);
    }
    // a heater and its stack, spheres on legs, bullet tanks, a cooling tower
    box(g, 9, 6, 9, mat(0x6b5a4a, "furnace brick wall", 0.9), 985, 3, -100); cyl(g, 1.1, 16, mat(0x55504a, "furnace stack steel", 0.6), 985, 8, -100, 12); addBlocker(985, -100, 5.2);
    for (const [x, z] of [[1000, -138], [1024, -122]]) {
      const sp = new THREE.Mesh(new THREE.SphereGeometry(5.4, 20, 14), mat(0xdedbd0, "storage tank steel sheet", 0.5, { metalness: 0.25 })); sp.position.set(x, 8.6, z); sp.castShadow = true; g.add(sp);
      for (let i = 0; i < 6; i++) cyl(g, 0.28, 6, rackM, x + Math.cos(i / 6 * 6.283) * 4.2, 3, z + Math.sin(i / 6 * 6.283) * 4.2, 6);
      addBlocker(x, z, 6);
    }
    for (const x of [860, 884, 908]) {
      const b = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 11, 6, 14), mat(0xcfd0cb, "storage tank steel sheet", 0.5, { metalness: 0.25 })); b.position.set(x + 4, 3.2, -208); b.rotation.set(Math.PI / 2, 0, 0); b.castShadow = true; g.add(b);
      for (const dz of [-3, 3]) box(g, 0.6, 1.2, 0.6, rackM, x + 4, 0.6, -208 + dz);
      addBlocker(x + 4, -208, 2.6); addBlocker(x + 4, -212, 2.6); addBlocker(x + 4, -204, 2.6);
    }
    box(g, 16, 9, 8, mat(0x9a9c94, "cooling tower concrete", 0.95), 1010, 4.5, -190);
    cyl(g, 2.6, 0.5, mat(0x2a2d30, "fan ring steel", 0.5), 1005, 9.3, -190, 16); cyl(g, 2.6, 0.5, mat(0x2a2d30, "fan ring steel", 0.5), 1015, 9.3, -190, 16);
    addBlocker(1005, -190, 5); addBlocker(1015, -190, 5);
    // the flare: a thin stack with a flame that never goes out
    const FX = 1028, FZ = -220;
    cyl(g, 0.55, 46, mat(0x6a6f74, "flare stack steel", 0.5, { metalness: 0.3 }), FX, 23, FZ, 8);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.4, 9), emissive(0xff7a1a, "flare flame")); flame.position.set(FX, 48.2, FZ); g.add(flame);
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.8, 8), emissive(0xffe08a, "flare flame core")); core.position.set(FX, 47.6, FZ); g.add(core);
    addBlocker(FX, FZ, 1.4);
    ctx.addLitSpot({ x: FX, y: 44, z: FZ, warm: 0xff8a3a, power: 900, range: 95 });
    for (const [x, z] of [[880, -60], [960, -150], [1010, -100]]) ctx.addLitSpot({ x, y: 8, z, warm: 0xfff0d0, power: 190, range: 36, pole: true });
    R.pois.push({ x: 856, z: -44, r: 12, label: "Pelican Petrochemical" }, { x: 960, z: -140, r: 16, label: "Pelican Petrochemical" });
  });
  C.cluster("river road extras", () => {
    kit.props.poleLine(808, -46.5, 1036, -46.5, 46, [850]);
  });

  // ---- Bayou State Penitentiary & Prison Rodeo -------------------------------------
  // (east of OrleaRouge's last avenue, x 520: the city's grid ends there)
  C.landmark("prison", (r, c) => {
    const g = new THREE.Group(); scene.add(g);
    C.plane(150, 130, gravel(), 623, 0.022, 300);
    const X0 = 548, X1 = 698, Z0 = 240, Z1 = 362;                   // the wall line, inside the site
    fence(g, X0, Z0, X1, Z0, { wall: true, h: 4.6, every: 3.4 });
    fence(g, X0, Z1, X1, Z1, { wall: true, h: 4.6, every: 3.4 });
    fence(g, X0, Z0, X0, Z1, { wall: true, h: 4.6, every: 3.4 });
    fenceWithGap(g, X1, Z0, X1, Z1, 291, 309, { wall: true, h: 4.6, every: 3.4 });          // the main gate faces the road, east
    // guard towers at the four corners
    const towerM = mat(0x8a8a82, "tower concrete wall", 0.9), glassM = mat(0x1e2b37, "window glass", 0.3);
    for (const [x, z] of [[X0 + 1, Z0 + 1], [X1 - 1, Z0 + 1], [X0 + 1, Z1 - 1], [X1 - 1, Z1 - 1]]) {
      for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) cyl(g, 0.22, 9, towerM, x + ox, 4.5, z + oz, 6);
      box(g, 4.2, 2.6, 4.2, towerM, x, 10.3, z); box(g, 4.3, 1.1, 4.3, glassM, x, 10.5, z);
      box(g, 5.2, 0.35, 5.2, mat(0x33383c, "tower roof sheet", 0.6), x, 11.8, z);
      addBlocker(x, z, 2.4);
      ctx.addLitSpot({ x, y: 9.5, z, warm: 0xfff0d0, power: 320, range: 52 });
    }
    // the main gate: two gatehouses, a lintel across, the sign, the sliding gate drawn aside
    const gx = X1;
    C.plane(14, 22, gravel(), 705, 0.026, 300);                  // the forecourt, out to the end of Rodeo Road
    for (const gz of [284, 316]) { box(g, 5.4, 5.5, 5.4, mat(0xa8a598, "gatehouse concrete wall", 0.9), gx - 1, 2.75, gz); box(g, 5.6, 0.4, 5.6, mat(0x33383c, "tower roof sheet", 0.6), gx - 1, 5.7, gz); addBlocker(gx - 1, gz, 3.2); }
    box(g, 1.2, 1.4, 44, mat(0xa8a598, "gate lintel concrete wall", 0.9), gx, 7, 300);
    const gateSign = new THREE.Group(); gateSign.position.set(gx + 0.7, 0, 300); gateSign.rotation.y = Math.PI / 2; g.add(gateSign);
    sign(gateSign, 16, 1.5, "BAYOU STATE PENITENTIARY", 0, 7.4, 0.02, "#f4eedd", "#26313a", "#c8b46a");
    sign(gateSign, 16, 0.75, "EST. 1880 · \"THE FARM\" · VISITORS CHECK IN HERE", 0, 6.2, 0.02, "#ffd27a", "#15181c");
    box(g, 0.3, 3.2, 8, mat(0x55595c, "gate steel", 0.6), gx - 0.5, 1.6, 320.5);                 // the gate, slid open
    // cell blocks: long concrete ranges with slit windows
    const blocks = [[588, 262, 66, 11], [588, 338, 66, 11], [664, 340, 30, 10]];
    const slitPos = [];
    for (const [bx, bz, w, d] of blocks) {
      box(g, w, 8.5, d, mat(0xb3ac98, "cell block concrete wall", 0.95), bx, 4.25, bz);
      box(g, w + 0.8, 0.5, d + 0.8, mat(0x6a6a64, "cell block roof concrete", 0.9), bx, 8.75, bz);
      for (const sz of [-1, 1]) for (let x = bx - w / 2 + 2; x < bx + w / 2 - 1; x += 3) for (const y of [2.6, 6]) slitPos.push([x, y, bz + sz * (d / 2 + 0.03)]);
      block({ x: bx, z: bz, rot: 0 }, w, d);
    }
    const slits = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 1.1, 0.08), mat(0x14181c, "cell window glass", 0.3), slitPos.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    slitPos.forEach(([x, y, z], i) => slits.setMatrixAt(i, m.compose(p.set(x, y, z), q, s1)));
    slits.computeBoundingSphere(); g.add(slits);
    // the chapel, the kitchen, the yard: a basketball court, a water tower
    kit.shops.church({ name: "Bayou State Chapel" })({ x: 654, z: 259, rot: 0, index: 0, side: 1 });
    kit.shops.warehouse({ tone: 0xa8a49a, w: 22, d: 12, h: 5.5 })({ x: 630, z: 351, rot: Math.PI, index: 0, side: 1 });
    C.plane(15, 8.4, mat(0x2f5a3a, "court surface asphalt", 0.9), 650, 0.03, 300);
    for (const cx of [642.4, 657.6]) { box(g, 0.1, 3.05, 0.1, mat(0x55595c, "steel post", 0.6), cx, 1.5, 300); box(g, 0.1, 1.1, 1.7, mat(0xe8e8e0, "backboard plaster", 0.6), cx, 3.1, 300); }
    ctx.makeWaterTower && ctx.makeWaterTower(562, 300, "BAYOU STATE", ["THE FARM"], null);
    R.pois.push({ x: 712, z: 300, r: 14, label: "Bayou State Penitentiary" });
    // the whole compound is a fortress in zombie mode
    ctx.addSafehouse && ctx.addSafehouse(623, 300, 82, "Bayou State Penitentiary");
  });
  C.landmark("armory", (r, c) => {
    placeGunShop(ctx, c.x, c.z, Math.PI);
    R.pois.push({ x: c.x, z: c.z - 12, r: 8, label: "Warden's Surplus" });
  });
  C.landmark("rodeo arena", (r, c) => {
    const CX = 748, CZ = 272, RAD = 18;
    // the ring: posts and two rails, a gap on the west where the chutes are
    const wood = mat(0x7a5a3a, "wood fence board", 0.9), post = mat(0x5a4a3a, "wood post", 0.9);
    const dirt = mat(0xb09468, "arena dirt", 1);
    const g = new THREE.Group(); scene.add(g);
    disc(g, RAD, dirt, CX, 0.03, CZ, 40);
    const N = 26;
    for (let i = 0; i < N; i++) {
      const a0 = i / N * 6.283, a1 = (i + 1) / N * 6.283;
      if (a0 > 2.9 && a0 < 3.4) continue;                            // the gap: chutes
      const x0 = CX + Math.cos(a0) * RAD, z0 = CZ + Math.sin(a0) * RAD, x1 = CX + Math.cos(a1) * RAD, z1 = CZ + Math.sin(a1) * RAD;
      cyl(g, 0.14, 2, post, x0, 1, z0, 6);
      const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
      for (const y of [0.9, 1.6]) box(g, 0.1, 0.22, len, wood, (x0 + x1) / 2, y, (z0 + z1) / 2, ang);
      addBlocker(x0, z0, 0.9);
    }
    // the bucking chutes
    for (let i = 0; i < 3; i++) { box(g, 3.2, 1.7, 2.4, wood, CX - RAD - 2.2, 0.85, CZ - 3.6 + i * 3.6); addBlocker(CX - RAD - 2.2, CZ - 3.6 + i * 3.6, 1.7); }
    // bleachers along the north side: six rows up, and the sign across the back
    for (let i = 0; i < 6; i++) box(g, 58, 0.5, 1.3, mat(0xaeb2b4, "bleacher steel sheet", 0.6, { metalness: 0.3 }), CX, 0.55 * (i + 1), 250 - 1.3 * i);
    for (let x = CX - 28; x <= CX + 28; x += 8) box(g, 0.3, 3.4, 0.3, steel(), x, 1.7, 243);
    for (let x = CX - 28; x <= CX + 28; x += 4) addBlocker(x, 246, 2.4);
    sign(g, 26, 2.6, "BAYOU STATE PRISON RODEO", CX, 5.4, 241.2, "#fff4d8", "#5a1a12", "#f4c542");
    sign(g, 26, 1.3, "EVERY SUNDAY IN OCTOBER · PROCEEDS TO THE WARDEN'S FISHING TRIP", CX, 3.6, 241.2, "#ffd27a", "#15151a");
    // the announcer's stand on stilts, at the east end
    const AX = CX + 24;
    for (const [ox, oz] of [[-1.6, -1.2], [1.6, -1.2], [-1.6, 1.2], [1.6, 1.2]]) cyl(g, 0.16, 3.4, post, AX + ox, 1.7, CZ + oz, 6);
    box(g, 4.6, 2.6, 3.4, mat(0xd8d2c0, "announcer booth plaster", 0.85), AX, 4.7, CZ); gable(g, 5.4, 1.4, 3.9, tin(), AX, 6, CZ, Math.PI / 2);
    box(g, 0.1, 1.2, 3, kit.windowMat(0.1), AX - 2.4, 4.9, CZ);
    addBlocker(AX, CZ, 2.6);
    // three bulls in the ring, one white
    const bull = (x, z, ry, tone) => {
      const b = new THREE.Group(); b.position.set(x, 0, z); b.rotation.y = ry; g.add(b);
      const hide = mat(tone, "bull hide leather", 0.9), horn = mat(0xe6dfc8, "bull horn plaster", 0.6);
      box(b, 1.1, 1.1, 2.4, hide, 0, 1.25, 0); box(b, 0.9, 0.5, 0.9, hide, 0, 1.95, 0.5); box(b, 0.7, 0.75, 0.9, hide, 0, 1.4, 1.5);
      for (const [lx, lz] of [[-0.35, -0.9], [0.35, -0.9], [-0.35, 0.9], [0.35, 0.9]]) box(b, 0.24, 0.85, 0.24, hide, lx, 0.42, lz);
      for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.7, 6), horn); h.position.set(s * 0.45, 1.65, 1.7); h.rotation.z = -s * 1.2; b.add(h); }
      addBlocker(x, z, 1.3);
    };
    bull(CX + 6, CZ - 4, 0.6, 0x2a1e18); bull(CX - 6, CZ + 7, -2.2, 0xe8e0d0); bull(CX + 10, CZ + 10, 2.4, 0x5a3a24);
    // light towers at the corners
    for (const [x, z] of [[CX - 32, 248], [CX + 32, 248], [CX - 32, 290], [CX + 32, 290]]) { cyl(g, 0.22, 12, steel(), x, 6, z, 6); addBlocker(x, z, 0.6); ctx.addLitSpot({ x, y: 12, z, warm: 0xfff2d8, power: 380, range: 60, pole: true }); }
    R.pois.push({ x: CX, z: CZ + 24, r: 14, label: "Prison Rodeo" });
  });
  C.cluster("rodeo sign", () => roadSign(795, 318, -Math.PI / 2, "PRISON RODEO & PENITENTIARY", "SUNDAYS IN OCTOBER · NO REFUNDS · NO ESCAPES", "#5a1a12"));

  // ================================================================ 5 report
  R.regions.push({ C, rect: BOUNDS, zone: "town", outside: "rural" });
  R.pois.push(...C.pois);
  const m = C.minimap;
  R.minimap.roads.push(...m.roads);
  R.minimap.buildings.push(...m.buildings);
  R.minimap.areas.push(...m.areas);
  R.minimap.water.push(...m.water);
  return C;
}
