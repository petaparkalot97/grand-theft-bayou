// ---------------------------------------------------------------------------
// charsoufre.js — CHARSOUFRE, the south-west. Lake Charles and Sulphur.
//
// Two neighbouring towns on the coast road with opposite personalities, which
// is the whole point of building them as one district: you cross the middle of
// it and the place changes character under you.
//
//   EAST — LAKE CHARLES        the lake, two casino resorts on its shore, a
//                              festival ground, Ryan Street downtown, and the
//                              Charpentier district of Victorian houses that
//                              ships' carpenters built by eye
//   WEST — SULPHUR             the works. Tank farm, flare, pipe racks: the
//                              Frasch process pulled sulphur up out of the
//                              ground here with superheated water and made the
//                              town. A heritage museum, a waterpark and ball
//                              fields, because a company town is still a town
//   SOUTH-EAST                 the Creole Nature Trail head: boardwalk out into
//                              the marsh, alligators, and the birds
//
// I-10 (stateWorld.js's Lakeshore Causeway, world z 750) runs straight through
// the middle. Everything is TOWN-LOCAL from DISTRICTS.charsoufre — local (0, 0)
// is the causeway at the seam between the two towns. Built with townkit.js.
//
// THE NAME is a portmanteau in the pattern of the others (OrleaRouge,
// Tusouxroe, Shruston): Charles + soufre, which is French for sulphur. It is
// one string in districts.js and a handful of signs here if it should change.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { createComposer } from "./composer.js";
import { createTownKit } from "./townkit.js";
import { DISTRICTS } from "./districts.js";
import { placeParkedCar, placeTruck, placeBillboard, makeDecorativeFence } from "./landmarks.js";

const TOWN = DISTRICTS.charsoufre;
const wx = (x) => TOWN.x + x;
const wz = (z) => TOWN.z + z;
const wr = (r) => ({ x0: wx(r.x0), x1: wx(r.x1), z0: wz(r.z0), z1: wz(r.z1) });
const wp = (pts) => pts.map(([x, z]) => [wx(x), wz(z)]);

// ---- the plot: 260 x 300 m. A town and its neighbour, not a city. ----
const BOUNDS = { x0: -130, x1: 130, z0: -150, z1: 150 };
const CORE = { x0: -124, x1: 124, z0: -144, z1: 144 };
// South of the causeway, not across it. The lake used to span z -96..60, which
// put I-10 through the middle of the water: one site overlap, and the only way
// to keep it would have been a bridge on a highway this district does not own.
// The real Lake Charles is south-west of its downtown anyway, and the casinos
// look out over it from the north, which is exactly where they are now.
const LAKE = { x0: 84, x1: 128, z0: -140, z1: -16 };

const I10_Z = 0;                 // the Lakeshore Causeway, world z 750
const RUTH_X = -78, RYAN_X = 16;
const NAPOLEON_Z = -60, MINES_Z = 70, BROAD_Z = 84;
/** West of here is Sulphur, east of it is Lake Charles. */
const SEAM_X = -54;

const STREETS = [
  // Sulphur, west of the seam. Ruth Street and Napoleon Street are the real
  // ones; Sulphur Mines Road is what the works road would have been called.
  { name: "Ruth Street", points: [[RUTH_X, -140], [RUTH_X, 140]], width: 9, lampEvery: 38 },
  { name: "Napoleon Street", points: [[-126, NAPOLEON_Z], [SEAM_X - 4, NAPOLEON_Z]], width: 8, lampEvery: 36 },
  { name: "Sulphur Mines Road", points: [[-126, MINES_Z], [SEAM_X - 4, MINES_Z]], width: 8, lampEvery: 40 },
  // Lake Charles, east of it. There was a Lakeshore Drive here at x 32 and it
  // had to go: its corridor (25.9..38.1) sat exactly inside Ryan Street's own
  // frontage band, so every slot on Ryan's lake side was rejected for landing
  // on a road. A town of this size has five streets, not six.
  { name: "Ryan Street", points: [[RYAN_X, -140], [RYAN_X, 140]], width: 10, lampEvery: 34 },
  { name: "Broad Street", points: [[4, BROAD_Z], [128, BROAD_Z]], width: 9, lampEvery: 38 },
];

export function createCharsoufre(ctx) {
  const { scene } = ctx;
  const kit = createTownKit(ctx);
  const { mat, box, cyl, gable, sign, block, houses, shops, areas, props } = kit;
  const C = createComposer(ctx, {
    name: "Charsoufre",
    bounds: wr(BOUNDS),
    zones: { core: wr(CORE), wild: wr(BOUNDS) },
    seed: 70119,
  });
  let announced = false, crossed = false;

  const lanes = [
    { name: "Ryan St northbound", points: wp([[RYAN_X - 2.4, 136], [RYAN_X - 2.4, -136]]), cruise: [8, 13] },
    { name: "Ryan St southbound", points: wp([[RYAN_X + 2.4, -136], [RYAN_X + 2.4, 136]]), cruise: [8, 13] },
    { name: "Ruth St northbound", points: wp([[RUTH_X - 2.2, 136], [RUTH_X - 2.2, -136]]), cruise: [8, 12] },
    { name: "Ruth St southbound", points: wp([[RUTH_X + 2.2, -136], [RUTH_X + 2.2, 136]]), cruise: [8, 12] },
    { name: "Broad St eastbound", points: wp([[8, BROAD_Z + 2.2], [124, BROAD_Z + 2.2]]), cruise: [8, 12] },
  ];

  function buildSet() {
    // ---- 1 road -----------------------------------------------------------
    // lakeshore.js surfaces the causeway from x -6 to -1050 at y 0.024, so this
    // only claims the corridor.
    C.road("Interstate 10", wp([[-128, I10_Z], [128, I10_Z]]), { width: 12, paved: false, sidewalk: 0, lampEvery: 40 });
    for (const st of STREETS) {
      C.road(st.name, wp(st.points), { width: st.width, lampEvery: st.lampEvery || 0, y: 0.021 });
    }

    C.site("Lake Chareaux", wr(LAKE));
    C.site("casino row", wr({ x0: 40, x1: 76, z0: -100, z1: -24 }));
    C.site("festival grounds", wr({ x0: 40, x1: 76, z0: 16, z1: 60 }));
    // The real Charpentier District is west of Ryan Street, which is where this
    // one is: between Ryan's frontage band and the seam.
    C.site("Charpentier", wr({ x0: -46, x1: -14, z0: -96, z1: -42 }));
    C.site("sulphur works", wr({ x0: -126, x1: -88, z0: -130, z1: -70 }));
    C.site("Frasch museum", wr({ x0: -70, x1: -42, z0: -130, z1: -100 }));
    C.site("SPAR waterpark", wr({ x0: -126, x1: -88, z0: 14, z1: 44 }));
    C.site("ball fields", wr({ x0: -126, x1: -88, z0: 96, z1: 140 }));
    C.site("nature trail", wr({ x0: 40, x1: 76, z0: 100, z1: 144 }));

    // ---- 2 buildings: Ryan Street, downtown Lake Charles ------------------
    C.frontage("Ryan Street", {
      // setback 14 with a 12 m depth puts the bands at x -4..8 and 24..36, either
      // side of the 9.4..22.6 corridor, so both sides of the street build.
      setback: 14, spacing: 20, footprint: { w: 16, d: 12 }, startAt: 16, endAt: 14,
      label: "Ryan Street",
      build: shops.brickBlock({ names: ["CALCASIEU BANK", "HOTEL CHARLESTON", "THE PALACE", "PUJO ST CAFE", "SEAFOOD & OYSTER", "RYAN ST DRUGS", "LAFITTE OUTFITTERS", "BOUDIN KING"] }),
    });

    // ---- 3 side streets ----------------------------------------------------
    const blk = { stage: "sideStreets" };
    C.frontage("Broad Street", { ...blk, setback: 14, spacing: 19, footprint: { w: 14, d: 13 }, startAt: 12, endAt: 10, label: "Broad Street", build: shops.strip({ names: ["GULF COAST TACKLE", "CAJUN GRILL", "SNO-BALL STAND", "CONTRABAND LIQUOR", "STEAMBOAT BILL'S", "CREOLE MEAT MARKET", "SHRIMP BOAT", "CRAB SHACK"] }) });
    // Sulphur: houses on Ruth and Napoleon, industry on the works road
    C.frontage("Ruth Street", { ...blk, setback: 13, spacing: 17, footprint: { w: 13, d: 12 }, startAt: 12, endAt: 12, label: "Ruth Street", build: houses.mixed(["bungalow", "cottage", "shotgun", "trailer"]) });
    C.frontage("Napoleon Street", { ...blk, setback: 13, spacing: 17, footprint: { w: 13, d: 12 }, startAt: 10, endAt: 10, label: "Napoleon Street", build: houses.mixed(["bungalow", "shotgun", "cottage"]) });
    C.frontage("Sulphur Mines Road", { ...blk, sides: [1, -1], setback: 15, spacing: 26, footprint: { w: 24, d: 18 }, startAt: 10, endAt: 10, label: "Sulphur Mines Road", build: shops.warehouse({ tone: 0x9a958c, w: 22, d: 16, h: 7 }) });

    // ---- 4 open areas ------------------------------------------------------
    const lakeWater = new THREE.MeshPhysicalMaterial({
      color: 0x123a3c, roughness: 0.22, metalness: 0, transparent: true, opacity: 0.7,
      envMapIntensity: 0.35, name: "Lake Chareaux water",
    });
    lakeWater.userData.gtbRealized = true;
    C.openArea("Lake Chareaux", { color: "#123a3c", zoneName: "water", build: (r, c) => {
      C.plane(c.w, c.d, lakeWater, c.x, 0.035, c.z);
      // the west shore is the town's; the other three are the map's edge of it
      for (let z = r.z0; z <= r.z1; z += 4) ctx.addBlocker(r.x0, z, 1.8);
      for (let x = r.x0; x <= r.x1; x += 4) { ctx.addBlocker(x, r.z0, 1.8); ctx.addBlocker(x, r.z1, 1.8); }
      const g = new THREE.Group();
      scene.add(g);
      props.pier(g, r.x0 + 1, c.z + 20, r.x0 + 20, c.z + 20, 4);
      props.boat(g, r.x0 + 24, c.z + 16, 0.5, 1.2);
      props.boat(g, r.x0 + 15, c.z - 34, -0.6, 1.0);
    } });

    C.openArea("casino row", { color: "#4a3a5a", zoneName: "entertainment", build: (r, c) => {
      C.plane(c.w, c.d, C.tiled(ctx.roadMaterial(), c.w, c.d, 9), c.x, 0.02, c.z);
      const g = new THREE.Group();
      scene.add(g);
      const wall = mat(0x1a2030, "casino wall panel", 0.5);
      const glass = mat(0x2b3c52, "casino glass", 0.18, { metalness: 0.5 });
      const gold = mat(0xd8b24a, "casino gold trim", 0.35, { metalness: 0.7 });
      // Two resorts facing the lake, the way L'Auberge and the Golden Nugget do
      const RESORTS = [
        { n: "LE CHANCEUX", sub: "CASINO RESORT", z: r.z0 + 20, h: 24 },
        { n: "GOLDEN GATOR", sub: "HOTEL · SPA · BUFFET", z: r.z1 - 20, h: 19 },
      ];
      for (const v of RESORTS) {
        box(g, 24, v.h, 26, wall, c.x, v.h / 2, v.z);
        for (let i = 1; i * 4 < v.h - 2; i++) box(g, 24.3, 2.2, 26.3, glass, c.x, i * 4, v.z);
        box(g, 26, 1.2, 28, gold, c.x, v.h + 0.6, v.z);
        box(g, 0.4, 5, 15, mat(0x14181f, "sign board back", 0.7), c.x + 12.4, v.h - 4, v.z);
        sign(g, 13, 3.2, v.n, c.x + 12.7, v.h - 3.3, v.z, "#fff4d8", "#14181f");
        sign(g, 10, 1.3, v.sub, c.x + 12.7, v.h - 5.8, v.z, "#ffd98a", "#14181f");
        block({ x: c.x, z: v.z, rot: 0 }, 24, 26);
        ctx.addLitSpot({ x: c.x + 15, y: 7, z: v.z, warm: 0xffd070, power: 210, range: 38 });
        C.pois.push({ x: c.x - 14, z: v.z, r: 8, label: v.n });
      }
      for (const dz of [-24, 0, 24]) placeParkedCar(ctx, ["tristar", "toyoyo", "doclorean"][(dz + 24) / 24], r.x0 + 5, c.z + dz, 0);
    } });

    // Contraband Days: Lake Charles throws a pirate festival every May, which is
    // as Louisiana as it gets. Out of season it is a field with the rigging up.
    C.openArea("festival grounds", { color: "#5a6b3a", zoneName: "entertainment", build: (r, c) => {
      C.plane(c.w, c.d, mat(0x6d8a4c, "festival field grass", 1), c.x, 0.02, c.z);
      const g = new THREE.Group();
      scene.add(g);
      const canvas = [0xc0392b, 0x2e86c1, 0xf1c40f, 0x27ae60, 0xe67e22].map((h) => mat(h, "canvas awning", 0.9));
      const post = mat(0x7a5a3a, "tent post timber", 0.95);
      let i = 0;
      for (let z = r.z0 + 8; z < r.z1 - 5; z += 12) {
        for (let x = r.x0 + 7; x < r.x1 - 5; x += 11) {
          const t = box(g, 7, 0.14, 6, canvas[i++ % canvas.length], x, 3.1, z);
          t.rotation.x = 0.04;
          for (const [ox, oz] of [[-3.2, -2.6], [3.2, -2.6], [-3.2, 2.6], [3.2, 2.6]]) cyl(g, 0.1, 3.1, post, x + ox, 1.55, z + oz, 6);
          ctx.addBlocker(x, z, 2.2);
        }
      }
      // a mast and rigging: the festival's pirate ship stays up all year
      cyl(g, 0.34, 16, post, r.x1 - 6, 8, r.z0 + 6, 10);
      box(g, 8, 0.16, 0.5, post, r.x1 - 6, 12.5, r.z0 + 6);
      box(g, 6, 4.4, 0.1, mat(0xe8e2d2, "canvas sail", 0.95), r.x1 - 6, 9.4, r.z0 + 6.3);
      ctx.addBlocker(r.x1 - 6, r.z0 + 6, 1.1);
      sign(g, 14, 1.8, "CONTRABAND DAYS", c.x, 4.6, r.z0 + 1.5, "#fff0c8", "#7a1f12");
      ctx.addLitSpot({ x: c.x, y: 8, z: c.z, warm: 0xffc48a, power: 150, range: 32, pole: true });
      C.pois.push({ x: c.x, z: c.z, r: 10, label: "Contraband Days grounds" });
    } });

    // The works. Sulphur is named for what came out of the ground here, and the
    // Frasch process — superheated water down, molten sulphur up — is why it
    // could be got at at all.
    // No zoneName here: areas.tankFarm claims the whole rect as BUILDING, and
    // composer.zoneAt returns "building" before it ever reaches zoneRects, so a
    // name on this area would be dead. The Sulphur side gets its character from
    // zoneAt() below instead, which is truer anyway — it is not one yard, it is
    // the half of town that works for a living.
    C.openArea("sulphur works", { color: "#6b6440", build: (r, c) => {
      areas.tankFarm(C, { tanks: 6 })(r, c);
      const g = new THREE.Group();
      scene.add(g);
      const steel = mat(0x8a8f96, "works steel frame", 0.6, { metalness: 0.5 });
      const pipe = mat(0xb9a03a, "sulphur yellow pipe", 0.7);
      // a pipe rack along the road edge, and the flare stack behind it
      for (let x = r.x0 + 4; x < r.x1 - 2; x += 6) {
        cyl(g, 0.16, 5, steel, x, 2.5, r.z1 - 3, 6);
        ctx.addBlocker(x, r.z1 - 3, 0.5);
      }
      for (const y of [4.2, 4.8]) box(g, r.x1 - r.x0 - 8, 0.34, 0.34, pipe, c.x, y, r.z1 - 3);
      const stack = cyl(g, 0.9, 26, steel, r.x0 + 7, 13, r.z0 + 7, 12);
      ctx.addBlocker(r.x0 + 7, r.z0 + 7, 1.4);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.4, 10), mat(0xff7a2a, "flare flame", 0.4, { emissive: 0xff6a18, emissiveIntensity: 1.6 }));
      flame.material.userData.gtbRealized = true;
      flame.position.set(r.x0 + 7, 27.6, r.z0 + 7);
      g.add(flame);
      ctx.addLitSpot({ x: r.x0 + 7, y: 27, z: r.z0 + 7, warm: 0xff8a3a, power: 240, range: 50 });
      sign(g, 14, 1.6, "CHARSOUFRE SULPHUR WORKS", c.x, 5.6, r.z1 - 1, "#1e1a12", "#c9a83a");
      C.pois.push({ x: c.x, z: r.z1 + 4, r: 9, label: "Charsoufre Sulphur Works" });
    } });

    C.openArea("Frasch museum", { color: "#5a5448", build: (r, c) => {
      C.plane(c.w, c.d, C.tiled(ctx.surface("concrete", 512).material(1, { color: 0xbfb8aa }), c.w, c.d, 6), c.x, 0.02, c.z);
      const g = new THREE.Group();
      scene.add(g);
      const brick = mat(0x9a6a52, "museum brick wall", 0.92);
      const stone = mat(0xdad3c4, "museum stone trim", 0.85);
      box(g, 22, 8.5, 14, brick, c.x, 4.25, c.z);
      box(g, 23, 0.7, 15, stone, c.x, 8.8, c.z);
      box(g, 9, 1, 3.4, stone, c.x, 8, c.z + 8);
      for (const ox of [-3.2, 3.2]) cyl(g, 0.42, 7.6, stone, c.x + ox, 3.8, c.z + 8.2, 12);
      block({ x: c.x, z: c.z, rot: 0 }, 22, 14);
      sign(g, 18, 1.6, "FRASCH HERITAGE MUSEUM", c.x, 6.6, c.z + 7.2, "#f6ecd0", "#4a3020");
      sign(g, 14, 1, "HOT WATER DOWN, SULPHUR UP", c.x, 2.4, c.z + 7.1, "#e8dcb8", "#2a2018");
      // the exhibit out front: a length of the original pipe on blocks
      const pipe = mat(0x8a7a3a, "exhibit pipe steel", 0.75, { metalness: 0.4 });
      const p = cyl(g, 0.6, 12, pipe, c.x, 1.3, c.z - 9, 14);
      p.rotation.z = Math.PI / 2;
      for (const ox of [-4, 4]) box(g, 1.6, 0.8, 1.6, mat(0x6e6a66, "exhibit plinth stone", 0.9), c.x + ox, 0.4, c.z - 9);
      ctx.addBlocker(c.x, c.z - 9, 2);
      ctx.addLitSpot({ x: c.x, y: 6, z: c.z + 10, warm: 0xffe6b8, power: 120, range: 24, pole: true });
      C.pois.push({ x: c.x, z: c.z + 11, r: 7, label: "Frasch Heritage Museum" });
    } });

    C.openArea("SPAR waterpark", { color: "#2a6a7a", zoneName: "residential", build: (r, c) => {
      C.plane(c.w, c.d, C.tiled(ctx.surface("concrete", 512).material(1, { color: 0xc9c3b4 }), c.w, c.d, 6), c.x, 0.021, c.z);
      const g = new THREE.Group();
      scene.add(g);
      props.pool(g, c.x - 7, c.z, 18, 12);
      props.pool(g, c.x + 11, c.z - 7, 9, 8);
      // two flumes coming off a tower into the big pool
      const tower = mat(0xd9d2c4, "flume tower concrete", 0.9);
      cyl(g, 1.2, 11, tower, c.x + 12, 5.5, c.z + 8, 10);
      ctx.addBlocker(c.x + 12, c.z + 8, 1.6);
      for (const [s, col] of [[-1, 0x2ea3c9], [1, 0xf2b134]]) {
        const f = cyl(g, 0.7, 20, mat(col, "water flume plastic", 0.4), c.x + 12 + s * 5, 5.4, c.z + 2, 10);
        f.rotation.z = s * 0.5;
        f.rotation.x = 0.55;
      }
      makeDecorativeFence(ctx, r.x0 + 1, r.z0 + 1, r.x1 - 1, r.z0 + 1);
      makeDecorativeFence(ctx, r.x0 + 1, r.z1 - 1, r.x1 - 1, r.z1 - 1);
      sign(g, 12, 1.6, "SPAR WATERPARK", c.x, 3.4, r.z0 + 2.2, "#fff4d8", "#1f6a8a");
      ctx.addLitSpot({ x: c.x, y: 8, z: c.z, warm: 0xbfe4ff, power: 140, range: 30, pole: true });
      C.pois.push({ x: c.x, z: r.z0 + 5, r: 8, label: "SPAR Waterpark" });
    } });

    C.openArea("ball fields", { color: "#3f6b34", zoneName: "residential", build: (r, c) => {
      C.plane(c.w, c.d, mat(0x6d8a4c, "ball field grass", 1), c.x, 0.02, c.z);
      const g = new THREE.Group();
      scene.add(g);
      const dirt = ctx.surface("dirt", 512).material(1);
      for (const oz of [-0.25, 0.25]) {
        const inf = C.plane(12, 12, C.tiled(dirt, 12, 12, 4), c.x, 0.026, c.z + oz * c.d);
        inf.rotation.z = Math.PI / 4;
      }
      const chain = mat(0x8a8f96, "backstop chain steel", 0.6, { metalness: 0.5 });
      for (const oz of [-0.25, 0.25]) {
        box(g, 14, 4, 0.16, chain, c.x, 2, c.z + oz * c.d - 9);
        ctx.addBlocker(c.x, c.z + oz * c.d - 9, 4);
      }
      for (const x of [r.x0 + 3, r.x1 - 3]) ctx.addLitSpot({ x, y: 12, z: c.z, warm: 0xf4f8ff, power: 180, range: 36, pole: true });
    } });

    // The Creole Nature Trail: the road south stops and a boardwalk goes on.
    C.openArea("nature trail", { color: "#2f4a38", zoneName: "forest", build: (r, c) => {
      C.plane(c.w, c.d, mat(0x2f4a38, "marsh water", 0.3, { transparent: true, opacity: 0.8 }), c.x, 0.026, c.z);
      const g = new THREE.Group();
      scene.add(g);
      props.pier(g, c.x, r.z0 + 1, c.x, r.z1 - 3, 3.4);          // the boardwalk out
      props.pier(g, c.x, r.z1 - 14, r.x1 - 3, r.z1 - 14, 3);      // and the spur to the blind
      // the viewing blind at the end
      const plank = mat(0x6a5a48, "weathered wood plank boardwalk", 0.95);
      box(g, 6, 2.6, 5, plank, r.x1 - 5, 1.9, r.z1 - 14);
      box(g, 6.6, 0.2, 5.6, plank, r.x1 - 5, 3.3, r.z1 - 14);
      ctx.addBlocker(r.x1 - 5, r.z1 - 14, 3);
      // an alligator on the bank, and a rookery post with birds on it
      const gator = mat(0x3a4a32, "alligator hide", 0.9);
      const gx = c.x - 9, gz = r.z0 + 12;
      box(g, 3.4, 0.5, 0.9, gator, gx, 0.3, gz, 0.4);
      box(g, 1.3, 0.42, 0.7, gator, gx + 1.9, 0.34, gz + 0.8, 0.4);
      for (const s of [-1, 1]) box(g, 0.8, 0.2, 0.28, gator, gx - 0.4, 0.22, gz + s * 0.6, 0.4);
      const post = mat(0x7a6a52, "cypress knee wood", 0.95);
      const bird = mat(0xf0efe8, "egret feather", 0.85);
      for (const [bx, bz, h] of [[c.x + 12, r.z0 + 20, 3.2], [c.x + 16, r.z0 + 26, 2.6], [c.x - 14, r.z1 - 26, 3.6]]) {
        cyl(g, 0.22, h, post, bx, h / 2, bz, 7);
        box(g, 0.34, 0.62, 0.22, bird, bx, h + 0.35, bz);
        box(g, 0.2, 0.2, 0.42, bird, bx, h + 0.62, bz + 0.16);
        ctx.addBlocker(bx, bz, 0.4);
      }
      sign(g, 13, 1.6, "CREOLE NATURE TRAIL", c.x, 3.4, r.z0 + 2.4, "#eaf4dc", "#24402c");
      C.pois.push({ x: c.x, z: r.z0 + 6, r: 8, label: "Creole Nature Trail head" });
    } });

    placeBillboard(ctx, wx(-4), wz(I10_Z - 18), 0, "CHARSOUFRE", "LAKE CHARLES · SULPHUR", "TWO TOWNS, ONE EXIT");
    placeBillboard(ctx, wx(60), wz(-118), 0, "LE CHANCEUX", "LOOSEST SLOTS ON THE GULF", "THEY ALL SAY THAT");
    placeTruck(ctx, "truck", wx(-96), wz(-64), Math.PI / 2);

    // ---- 5 vegetation -----------------------------------------------------
    C.vegetation(wr(BOUNDS), {
      spacing: 12, jitter: 3.5, clearance: 4.5,
      shape: props.cypressShape(),
      trunk: mat(0x4a3d30, "cypress trunk bark", 0.95),
      foliage: mat(0x2a4a30, "cypress leaves foliage", 0.9),
    });

    // ---- 6 landmark: the Charpentier district -----------------------------
    // Ships' carpenters built Lake Charles's Victorian quarter by eye, without
    // architects, which is why no two houses in it match. The grandest one
    // closes the view down Ryan Street.
    C.landmark("Charpentier", (r, c) => {
      const g = new THREE.Group();
      scene.add(g);
      C.plane(c.w, c.d, mat(0x63914d, "district lawn", 1), c.x, 0.02, c.z);
      const walk = ctx.surface("concrete", 512).material(1, { color: 0xc4bdae });
      C.plane(3, c.d - 4, C.tiled(walk, 3, c.d - 4, 5), c.x, 0.027, c.z);

      /** A Queen Anne: asymmetric, a corner turret, a porch all the way round. */
      function queenAnne(x, z, ry, body, trimHex, roofHex, turret) {
        const h = new THREE.Group();
        h.position.set(x, 0, z);
        h.rotation.y = ry;
        g.add(h);
        const wall = mat(body, "painted wood siding", 0.86);
        const trim = mat(trimHex, "painted trim", 0.8);
        const roof = mat(roofHex, "shingle roof", 0.8);
        box(h, 11, 7.4, 9, wall, 0, 3.7, 0);
        gable(h, 11.6, 3.2, 9.4, roof, 0, 7.4, 0, Math.PI / 2);
        box(h, 4.6, 3.4, 3.6, wall, -3.2, 9.1, 0);                // a dormer, off-centre
        gable(h, 5, 1.7, 3.9, roof, -3.2, 10.8, 0, Math.PI / 2);
        // the wraparound porch
        box(h, 13.4, 0.3, 3.2, trim, 0, 0.72, 5.5);
        box(h, 3.2, 0.3, 11, trim, 6.5, 0.72, 0);
        box(h, 13.8, 0.16, 3.6, roof, 0, 3.5, 5.6);
        box(h, 3.6, 0.16, 11.4, roof, 6.6, 3.5, 0);
        for (let i = 0; i < 5; i++) cyl(h, 0.13, 2.8, trim, -6 + i * 3, 2.1, 6.9, 8);
        for (let i = 0; i < 4; i++) cyl(h, 0.13, 2.8, trim, 7.9, 2.1, -4.5 + i * 3, 8);
        // windows, a door, and gingerbread under the eaves
        for (const [wxp, wyp] of [[-3.4, 2.4], [0, 2.4], [-3.4, 5.6], [0, 5.6], [3.4, 5.6]]) {
          box(h, 1.2, 1.9, 0.1, kit.windowMat(kit.hash(x + wxp, z + wyp, 3)), wxp, wyp, 4.56);
        }
        box(h, 1.3, 2.4, 0.12, mat(0x5a3020, "wood door", 0.7), 3.6, 1.9, 4.58);
        for (let i = 0; i < 9; i++) box(h, 0.5, 0.5, 0.12, trim, -5.6 + i * 1.4, 7.1, 4.62);
        if (turret) {
          cyl(h, 2.5, 11, wall, -6.6, 5.5, 4.2, 12);
          const cone = new THREE.Mesh(new THREE.ConeGeometry(3, 4.6, 12), roof);
          cone.position.set(-6.6, 13.3, 4.2);
          cone.castShadow = true;
          h.add(cone);
          for (let i = 0; i < 4; i++) box(h, 0.9, 1.5, 0.1, kit.windowMat(0.5), -6.6 + (i - 1.5) * 1.1, 7.4, 6.6);
        }
        block({ x, z, rot: ry }, 13, 11);
      }

      // The grand one at the head of the walk, then three more down it,
      // alternating sides. Spaced off the site's own depth: four hand-placed
      // offsets had two of them 4 m apart and sharing a porch.
      const HOUSES = [
        [0xe8dcc4, 0xf7f3e8, 0x6a4a3a, true],
        [0xc8d6c0, 0xf4f1e6, 0x4a5058, false],
        [0xd9c2c4, 0xf7f3e8, 0x5a4a52, true],
        [0xcfd6e2, 0xf4f1e6, 0x55504a, false],
      ];
      HOUSES.forEach(([body, trimHex, roofHex, turret], i) => {
        const z = r.z0 + c.d * (0.14 + i * 0.24);
        const s = i % 2 === 0 ? -1 : 1;
        queenAnne(c.x + s * 9, z, i % 2 === 0 ? 0.08 : -0.08, body, trimHex, roofHex, turret);
      });
      for (const [fx, fz] of [[c.x - 13, r.z0 + 20], [c.x + 13, r.z0 + 32]]) kit.picketFence(g, fx, fz, fx, fz + 12);
      sign(g, 12, 1.5, "CHARPENTIER DISTRICT", c.x, 3.2, r.z0 + 2.4, "#3a2a1c", "#e8dcc4");
      for (const oz of [0.25, 0.75]) ctx.addLitSpot({ x: c.x + 6, y: 5.4, z: r.z0 + c.d * oz, warm: 0xffd6a0, power: 100, range: 22, pole: true });
      C.pois.push({ x: c.x, z: c.z, r: 9, label: "Charpentier District" });
    });
  }

  return {
    BOUNDS: wr(BOUNDS), CORE: wr(CORE), LAKE: wr(LAKE), lanes,
    composer: C,
    buildSet,
    zoneAt(x, z) {
      const zone = C.zoneAt(x, z);
      // The composer hands back one "town" for its whole core. This district is
      // two towns, so the seam decides: the works and the housing that serves it
      // to the west, the tourist half to the east.
      if (zone !== "town") return zone;
      return x < wx(SEAM_X) ? "industrial" : "urban";
    },
    report: () => C.report(),
    get pois() { return C.pois; },
    get props() { return C.props; },
    get minimap() { return C.minimap; },
    get zoneRects() { return C.zoneRects; },
    get drawn() { return C.drawn; },
    update(dt, playerPos) {
      const b = wr(BOUNDS);
      const quiet = !(ctx.storyBusy && ctx.storyBusy());
      const inside = playerPos.x > b.x0 && playerPos.x < b.x1 && playerPos.z > b.z0 && playerPos.z < b.z1;
      if (!announced && quiet && inside) {
        announced = true;
        ctx.flashObjective("CHARSOUFRE · Lake Charles side and Sulphur side. Casinos east, the works west, and the marsh below both.");
      }
      // the seam: the character of the place changes at Ryan Street
      if (announced && quiet && !crossed && inside && playerPos.x < wx(SEAM_X)) {
        crossed = true;
        ctx.flashObjective("SULPHUR — they pulled this whole town up out of the ground with hot water.");
      }
      C.update(dt, ctx.camera ? ctx.camera.position : playerPos);
    },
  };
}
