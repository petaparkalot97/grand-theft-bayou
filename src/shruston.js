// ---------------------------------------------------------------------------
// shruston.js — SHRUSTON, the north-west. Shreveport and Ruston, one city.
//
// Shreveport is Louisiana's third city, sitting on the Texas line: casinos on
// the water, a downtown of brick and neon, and a country-music hall that put
// Hank Williams and Elvis on the radio. Ruston, an hour east on I-20, is a
// college town — Louisiana Tech, and Grambling State a few miles further on.
// Put them together and you get what this district is: the north's answer to
// OrleaRouge. Students, tourists, gamblers and a lot of brass.
//
//   DOWNTOWN      Texas Avenue and Line Avenue, brick blocks and shopfronts
//   LAKE CADDO     the water, west of town — Caddo Lake straddles the Texas
//                  line in real life, which is where the East Texas of this
//                  place comes from
//   CASINO ROW     on the Caddo shore: two resorts, lit all night
//   THE CAMPUSES   Bayou Tech north-east of downtown, Grambleton State
//                  north-west with its stadium across the road. The band is
//                  the reason half the tourists come
//   LEGENDS WALK   the landmark. A colonnade of bronzes of Louisiana's own —
//                  musicians, inventors, organisers, a coach — and a walk of
//                  brass stars for the ones still working
//   THE FAIRGROUNDS a rodeo arena off I-20, which is the most East Texas
//                  thing a Louisiana town can own
//
// Laid out by composer.js in its six stages, in TOWN-LOCAL coordinates from
// DISTRICTS.shruston. Built with townkit.js so the brick, the signs and the
// houses are the same ones the rest of the state uses. See districts.js.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { createComposer } from "./composer.js";
import { createTownKit } from "./townkit.js";
import { DISTRICTS } from "./districts.js";
import { placeCityBuilding, placeParkedCar, placeBillboard, placeTruck, makeDecorativeFence } from "./landmarks.js";

const TOWN = DISTRICTS.shruston;
const wx = (x) => TOWN.x + x;
const wz = (z) => TOWN.z + z;
const wr = (r) => ({ x0: wx(r.x0), x1: wx(r.x1), z0: wz(r.z0), z1: wz(r.z1) });
const wp = (pts) => pts.map(([x, z]) => [wx(x), wz(z)]);

// ---- the plot: 260 x 610 m, the second-largest district after the metro ----
const BOUNDS = { x0: -130, x1: 130, z0: -300, z1: 310 };
const CORE = { x0: -124, x1: 124, z0: -294, z1: 304 };

// I-20 comes through at world z -600 — the Red Dust Pass, which stateWorld.js
// already surfaces from x -6 all the way to -1050. Shruston only claims it.
const I20_Z = 180;
const LAKE = { x0: -128, x1: -62, z0: -170, z1: 30 };

const TEXAS_Z = 40, MILAM_Z = -20, HAYRIDE_Z = 110, GRAMBLETON_Z = -230;
const LINE_X = 10, MARKET_X = 72, CADDO_X = -50, TECH_X = 104;

/** Downtown, for spawnzones: a city of 231,400 does not draw a village mix. */
const DOWNTOWN_ZONE = { x0: -20, x1: 128, z0: -40, z1: 130 };
const inLocal = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

const STREETS = [
  { name: "Texas Avenue", points: [[-52, TEXAS_Z], [128, TEXAS_Z]], width: 11, lampEvery: 34 },
  { name: "Milam Street", points: [[-52, MILAM_Z], [120, MILAM_Z]], width: 9, lampEvery: 38 },
  { name: "Line Avenue", points: [[LINE_X, -286], [LINE_X, 172]], width: 10, lampEvery: 36 },
  { name: "Market Street", points: [[MARKET_X, -130], [MARKET_X, 172]], width: 9, lampEvery: 40 },
  { name: "Caddo Drive", points: [[CADDO_X, -176], [CADDO_X, 172]], width: 9, lampEvery: 38 },
  { name: "Tech Drive", points: [[TECH_X, -290], [TECH_X, -66]], width: 9, lampEvery: 40 },
  { name: "Grambleton Road", points: [[-112, GRAMBLETON_Z], [60, GRAMBLETON_Z]], width: 9, lampEvery: 38 },
  { name: "Hayride Row", points: [[-20, HAYRIDE_Z], [112, HAYRIDE_Z]], width: 8, lampEvery: 34 },
];

// ---------------------------------------------------------------------------
// THE LEGENDS. Real people from Louisiana, named and credited — which is the
// only respectful way to do it.
//
// Keep every `note` under about 32 characters. townkit's signMat shrinks text
// to a 22px floor and then draws it anyway, so a longer line does not get
// smaller, it gets its ends cut off — and a plaque nobody can read is the one
// thing this walk cannot have. Bronzes for those
// whose work is finished; brass stars in the paving for the ones still at it,
// the way a walk of fame does.
//
// `prop` picks what the figure is holding, built in statue() below.
// ---------------------------------------------------------------------------
const BRONZES = [
  { name: "LOUIS ARMSTRONG", note: "NEW ORLEANS — THE TRUMPET", prop: "trumpet" },
  { name: "MAHALIA JACKSON", note: "QUEEN OF GOSPEL", prop: "sing" },
  { name: "HUDDIE LEDBETTER", note: "LEAD BELLY · MOORINGSPORT", prop: "guitar" },
  { name: "CLIFTON CHENIER", note: "OPELOUSAS — KING OF ZYDECO", prop: "accordion" },
  { name: "FATS DOMINO", note: "THE NINTH WARD — THE PIANO", prop: "piano" },
  { name: "NORBERT RILLIEUX", note: "ENGINEER · SUGAR, 1843", prop: "plans" },
  { name: "HOMER PLESSY", note: "TOOK HIS SEAT, 1892", prop: "coat" },
  { name: "A. P. TUREAUD", note: "ATTORNEY · THE SCHOOL CASES", prop: "case" },
  { name: "LEAH CHASE", note: "QUEEN OF CREOLE CUISINE", prop: "pot" },
  { name: "ERNEST J. GAINES", note: "OSCAR, LA · THE NOVELS", prop: "book" },
  { name: "BILL RUSSELL", note: "MONROE, LA · ELEVEN RINGS", prop: "ball" },
  { name: "ORETHA CASTLE HALEY", note: "C.O.R.E. · SHE ORGANISED IT", prop: "raised" },
  { name: "EDDIE ROBINSON", note: "GRAMBLETON · 408 WINS", prop: "whistle" },
];
const STARS = [
  ["LIL WAYNE", "HOLLYGROVE"], ["MASTER P", "CALLIOPE"], ["JUVENILE", "MAGNOLIA"],
  ["KEVIN GATES", "BATON ROUGE"], ["HURRICANE CHRIS", "SHREVEPORT"], ["BOOSIE", "BATON ROUGE"],
  ["FRANK OCEAN", "NEW ORLEANS"], ["JON BATISTE", "KENNER"], ["TROMBONE SHORTY", "TREME"],
  ["BIG FREEDIA", "NEW ORLEANS"], ["LUCINDA WILLIAMS", "LAKE CHARLES"], ["TIM McGRAW", "START, LA"],
];

export function createShruston(ctx) {
  const { scene } = ctx;
  const kit = createTownKit(ctx);
  const { mat, box, cyl, sign, block, group, hash, houses, shops, areas, props } = kit;
  const C = createComposer(ctx, {
    name: "Shruston",
    bounds: wr(BOUNDS),
    zones: { core: wr(CORE), wild: wr(BOUNDS) },
    seed: 51104,
  });
  let announced = false, walked = false;

  // ------------------------------------------------------------ the bronzes
  const bronze = mat(0x7d5c2a, "statue bronze metal", 0.42, { metalness: 0.75 });
  const granite = mat(0x6e6a66, "granite plinth stone", 0.85);
  const brass = mat(0xb08d3a, "brass star metal", 0.35, { metalness: 0.8 });

  /**
   * One figure on a plinth, with a plaque saying who it is and why. Deliberately
   * a stylised bronze rather than a likeness: these are real people, and a
   * low-poly attempt at a face would read as a caricature of them. Silhouette
   * and what they are holding does the work, which is how public sculpture
   * mostly works anyway.
   */
  function statue(g, x, z, ry, { name, note, prop }) {
    const s = new THREE.Group();
    s.position.set(x, 0, z);
    s.rotation.y = ry;
    g.add(s);
    box(s, 2.0, 0.28, 2.0, granite, 0, 0.14, 0);          // step
    box(s, 1.5, 1.5, 1.5, granite, 0, 1.03, 0);           // plinth
    const y0 = 1.78;
    for (const sx of [-0.19, 0.19]) cyl(s, 0.13, 1.5, bronze, sx, y0 + 0.75, 0, 8);
    box(s, 0.86, 1.25, 0.52, bronze, 0, y0 + 2.12, 0);    // torso
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), bronze);
    head.position.set(0, y0 + 3.02, 0);
    head.castShadow = true;
    s.add(head);
    const arm = (side, lift, fwd) => {
      const a = cyl(s, 0.1, 1.15, bronze, side * 0.53, y0 + 2.2, fwd, 8);
      a.rotation.z = -side * lift;
      a.rotation.x = -fwd * 0.9;
      return a;
    };
    // what they are holding is the whole characterisation
    if (prop === "trumpet") {
      arm(-1, 0.9, 0.3); arm(1, 0.9, 0.3);
      const t = cyl(s, 0.06, 0.8, bronze, 0.04, y0 + 3.0, 0.5, 8);
      t.rotation.x = Math.PI / 2.4;
      const bell = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.34, 10), bronze);
      bell.position.set(0.06, y0 + 3.3, 0.78);
      bell.rotation.x = Math.PI / 2.4;
      s.add(bell);
    } else if (prop === "guitar") {
      arm(-1, 0.55, 0.45); arm(1, 0.35, 0.35);
      box(s, 0.52, 0.86, 0.16, bronze, -0.12, y0 + 1.9, 0.36).rotation.z = 0.35;
      box(s, 0.12, 0.92, 0.09, bronze, 0.34, y0 + 2.52, 0.34).rotation.z = 0.35;
    } else if (prop === "accordion") {
      arm(-1, 0.7, 0.5); arm(1, 0.7, 0.5);
      box(s, 0.62, 0.5, 0.34, bronze, 0, y0 + 2.1, 0.46);
      for (const o of [-0.2, 0.2]) box(s, 0.12, 0.54, 0.38, bronze, o, y0 + 2.1, 0.46);
    } else if (prop === "piano") {
      arm(-1, 0.95, 0.65); arm(1, 0.95, 0.65);
      box(s, 1.7, 0.22, 0.72, bronze, 0, y0 + 1.5, 0.82);
      for (const o of [-0.7, 0.7]) cyl(s, 0.06, 1.5, bronze, o, y0 + 0.75, 0.82, 6);
    } else if (prop === "plans") {
      arm(-1, 0.75, 0.55); arm(1, 0.5, 0.3);
      box(s, 0.72, 0.5, 0.05, bronze, -0.1, y0 + 2.08, 0.48).rotation.x = -0.5;
    } else if (prop === "case") {
      arm(-1, 0.12, 0); arm(1, 0.12, 0);
      box(s, 0.42, 0.32, 0.14, bronze, 0.62, y0 + 1.5, 0.06);
    } else if (prop === "pot") {
      arm(-1, 0.7, 0.5); arm(1, 0.7, 0.5);
      cyl(s, 0.32, 0.3, bronze, 0, y0 + 2.0, 0.52, 12);
    } else if (prop === "book") {
      arm(-1, 0.5, 0.35); arm(1, 0.2, 0.05);
      box(s, 0.34, 0.1, 0.26, bronze, -0.4, y0 + 1.96, 0.3);
    } else if (prop === "ball") {
      arm(-1, 0.35, 0.2); arm(1, 0.6, 0.4);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), bronze);
      b.position.set(0.52, y0 + 2.2, 0.36);
      b.castShadow = true;
      s.add(b);
    } else if (prop === "raised") {
      arm(-1, 0.25, 0.1);
      const a = cyl(s, 0.1, 1.2, bronze, 0.5, y0 + 2.75, 0, 8);
      a.rotation.z = -0.35;
      box(s, 0.2, 0.2, 0.2, bronze, 0.74, y0 + 3.4, 0);
    } else if (prop === "whistle") {
      arm(-1, 0.3, 0.2); arm(1, 0.85, 0.55);
      box(s, 0.3, 0.38, 0.05, bronze, 0.5, y0 + 2.1, 0.42);   // clipboard
      box(s, 0.5, 0.06, 0.06, bronze, 0, y0 + 2.9, 0.22);     // whistle cord
    } else if (prop === "sing") {
      const a1 = cyl(s, 0.1, 1.2, bronze, -0.52, y0 + 2.6, 0.1, 8); a1.rotation.z = 0.7;
      const a2 = cyl(s, 0.1, 1.2, bronze, 0.52, y0 + 2.6, 0.1, 8); a2.rotation.z = -0.7;
    } else {
      arm(-1, 0.15, 0.05); arm(1, 0.15, 0.05);
      box(s, 1.0, 1.4, 0.62, bronze, 0, y0 + 2.05, -0.06);    // a long coat
    }
    // the plaque: who, and what they did
    box(s, 1.24, 0.44, 0.07, mat(0x2a241c, "plaque back", 0.7), 0, 0.95, 0.79);
    sign(s, 1.16, 0.2, name, 0, 1.04, 0.83, "#f0e2b8", "#2a241c");
    sign(s, 1.16, 0.15, note, 0, 0.85, 0.83, "#c9bda0", "#2a241c");
    ctx.addBlocker(x, z, 1.25);
  }

  /** A brass star set in the paving, for the ones still working. */
  function star(g, x, z, name, where) {
    const st = new THREE.Group();
    st.position.set(x, 0, z);
    g.add(st);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.06, 5), brass);
    disc.position.y = 0.045;
    disc.receiveShadow = true;
    st.add(disc);
    const plate = box(st, 1.3, 0.02, 0.34, mat(0x241f18, "star plate", 0.6), 0, 0.08, 0);
    plate.rotation.x = 0;
    sign(st, 1.26, 0.3, name, 0, 0.095, 0, "#f4e6bc", "#241f18");
    sign(st, 1.0, 0.16, where, 0, 0.095, 0.4, "#b8a888", "#241f18");
  }

  const lanes = [
    { name: "Texas Ave eastbound", points: wp([[-46, TEXAS_Z + 2.6], [124, TEXAS_Z + 2.6]]), cruise: [9, 14] },
    { name: "Texas Ave westbound", points: wp([[124, TEXAS_Z - 2.6], [-46, TEXAS_Z - 2.6]]), cruise: [9, 14] },
    { name: "Line Ave northbound", points: wp([[LINE_X - 2.4, 168], [LINE_X - 2.4, -282]]), cruise: [10, 15] },
    { name: "Line Ave southbound", points: wp([[LINE_X + 2.4, -282], [LINE_X + 2.4, 168]]), cruise: [10, 15] },
    { name: "Caddo Dr northbound", points: wp([[CADDO_X - 2.2, 168], [CADDO_X - 2.2, -172]]), cruise: [8, 13] },
    { name: "Market St southbound", points: wp([[MARKET_X + 2.2, -126], [MARKET_X + 2.2, 168]]), cruise: [8, 12] },
    { name: "Grambleton Rd eastbound", points: wp([[-108, GRAMBLETON_Z + 2.2], [56, GRAMBLETON_Z + 2.2]]), cruise: [8, 12] },
  ];

  function buildSet() {
    // ---- 1 road: I-20, then the grid -----------------------------------
    // stateWorld.js surfaces the Red Dust Pass from x -6 to -1050 at y 0.024;
    // Shruston claims the corridor so nothing is built or planted on it, and
    // paves nothing itself.
    C.road("Interstate 20", wp([[-128, I20_Z], [128, I20_Z]]), { width: 9, paved: false, sidewalk: 0, lampEvery: 44 });
    for (const st of STREETS) {
      C.road(st.name, wp(st.points), { width: st.width, lampEvery: st.lampEvery || 0, y: 0.021 });
    }

    // Every rect below is clear of those corridors — composer.report().siteOverlaps
    // stays 0 or one of them is wrong.
    C.site("Lake Caddo", wr(LAKE));
    C.site("casino row", wr({ x0: -40, x1: 2, z0: -150, z1: -44 }));
    C.site("Legends Walk", wr({ x0: 20, x1: 64, z0: 52, z1: 100 }));
    C.site("Hayride Auditorium", wr({ x0: 84, x1: 124, z0: 50, z1: 100 }));
    C.site("Bayou Tech", wr({ x0: 20, x1: 92, z0: -286, z1: -244 }));
    C.site("Grambleton State", wr({ x0: -124, x1: -62, z0: -286, z1: -244 }));
    C.site("Grambleton stadium", wr({ x0: -124, x1: -62, z0: -216, z1: -176 }));
    C.site("fairgrounds", wr({ x0: -120, x1: -56, z0: 208, z1: 300 }));
    C.site("civic lot", wr({ x0: 22, x1: 62, z0: -8, z1: 24 }));

    // ---- 2 buildings: Texas Avenue, the downtown spine -----------------
    const DOWNTOWN_NAMES = ["STRAND", "RED RIVER OUTFITTERS", "SHRUSTON SAVINGS", "HOTEL CADDO", "PETE HARRIS CAFE", "TEXAS AVE RECORDS", "LOUISIANA HAYRIDE", "BOSSIER PAWN"];
    C.frontage("Texas Avenue", {
      setback: 16, spacing: 24, footprint: { w: 18, d: 16 }, startAt: 16, endAt: 12,
      label: "Texas Avenue", build: shops.brickBlock({ names: DOWNTOWN_NAMES }),
    });

    // ---- 3 side streets: the rest of the city --------------------------
    const blk = { stage: "sideStreets" };
    const SHOP_NAMES = ["TIGER DRUGS", "BAYOU TECH BOOKS", "LA HWY BBQ", "CRAWFISH & CO", "GRAMBLETON GRILL", "PAWN & PISTOL", "HAIR & NAILS", "EL PASO TACOS"];
    C.frontage("Line Avenue", { ...blk, setback: 15, spacing: 22, footprint: { w: 17, d: 15 }, startAt: 40, endAt: 20, label: "Line Avenue", build: shops.brickBlock({ names: DOWNTOWN_NAMES }) });
    C.frontage("Milam Street", { ...blk, setback: 14, spacing: 20, footprint: { w: 15, d: 14 }, startAt: 12, endAt: 10, label: "Milam Street", build: shops.strip({ names: SHOP_NAMES }) });
    C.frontage("Market Street", { ...blk, setback: 14, spacing: 20, footprint: { w: 15, d: 14 }, startAt: 14, endAt: 12, label: "Market Street", build: shops.strip({ names: SHOP_NAMES }) });
    C.frontage("Hayride Row", { ...blk, setback: 13, spacing: 19, footprint: { w: 14, d: 13 }, startAt: 10, endAt: 10, label: "Hayride Row", build: shops.strip({ names: ["HAYRIDE BAR", "THE TWELVE STRING", "ZYDECO ROOM", "NEON MOON", "TEXAS TWO-STEP", "BLUE LIGHT LOUNGE", "SATCHMO'S", "GUMBO SHACK"] }) });
    // the lakefront road, and the student side of town
    C.frontage("Caddo Drive", { ...blk, setback: 14, spacing: 20, footprint: { w: 15, d: 14 }, startAt: 16, endAt: 14, label: "Caddo Drive", build: shops.strip({ names: ["LAKESIDE PO-BOYS", "CADDO BAIT", "MOTEL 12", "THE LANDING", "CATFISH KING", "PIROGUE RENTAL"] }) });
    C.frontage("Tech Drive", { ...blk, setback: 13, spacing: 17, footprint: { w: 13, d: 12 }, startAt: 12, endAt: 10, label: "Tech Drive", build: houses.mixed(["bungalow", "cottage", "shotgun"]) });
    C.frontage("Grambleton Road", { ...blk, setback: 13, spacing: 17, footprint: { w: 13, d: 12 }, startAt: 14, endAt: 12, label: "Grambleton Road", build: houses.mixed(["shotgun", "bungalow", "cottage"]) });

    // ---- 4 open areas ---------------------------------------------------
    // Caddo, not a mirror: the lake reads as water at dusk without turning into
    // a sheet of white sky at noon (the same 0.2 roughness eastbank.js settled on).
    const caddo = new THREE.MeshPhysicalMaterial({
      color: 0x123028, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.68,
      envMapIntensity: 0.35, name: "Lake Caddo water",
    });
    caddo.userData.gtbRealized = true;
    C.openArea("Lake Caddo", { color: "#12332c", zoneName: "water", build: (r, c) => {
      C.plane(c.w, c.d, caddo, c.x, 0.035, c.z);
      // shore, all four sides, 4 m apart: a 5 m gap stops a car and not a walker
      for (let z = r.z0; z <= r.z1; z += 4) { ctx.addBlocker(r.x1, z, 1.8); }
      for (let x = r.x0; x <= r.x1; x += 4) { ctx.addBlocker(x, r.z0, 1.8); ctx.addBlocker(x, r.z1, 1.8); }
      const gp = new THREE.Group();
      scene.add(gp);
      props.pier(gp, r.x1 - 1, c.z - 30, r.x1 - 18, c.z - 30, 3.5);
      props.boat(gp, r.x1 - 22, c.z - 26, 0.4, 1.1);
      props.boat(gp, r.x1 - 26, c.z + 12, -0.8, 0.9);
    } });

    C.openArea("casino row", { color: "#4a3a5a", zoneName: "entertainment", build: (r, c) => {
      C.plane(c.w, c.d, C.tiled(ctx.roadMaterial(), c.w, c.d, 9), c.x, 0.02, c.z);
      const g = new THREE.Group();
      scene.add(g);
      const wall = mat(0x1d2230, "casino wall panel", 0.5);
      const glass = mat(0x2b3c52, "casino glass", 0.18, { metalness: 0.5 });
      const gold = mat(0xd8b24a, "casino gold trim", 0.35, { metalness: 0.7 });
      const RESORTS = [
        { n: "HORSESHOE BEND", sub: "CASINO · HOTEL", z: r.z0 + 26, h: 26, tint: 0xd8b24a },
        { n: "EL DORADO", sub: "RESORT & SPA", z: r.z1 - 26, h: 21, tint: 0x9ad6ff },
      ];
      for (const v of RESORTS) {
        box(g, 30, v.h, 26, wall, c.x, v.h / 2, v.z);
        for (let i = 1; i * 4 < v.h - 2; i++) box(g, 30.3, 2.2, 26.3, glass, c.x, i * 4, v.z);
        box(g, 32, 1.2, 28, gold, c.x, v.h + 0.6, v.z);
        // the sign, facing the road (east)
        box(g, 0.4, 5.2, 16, mat(0x14181f, "sign board back", 0.7), c.x + 15.4, v.h - 4, v.z);
        sign(g, 14, 3.4, v.n, c.x + 15.7, v.h - 3.2, v.z, "#fff4d8", "#14181f");
        sign(g, 10, 1.4, v.sub, c.x + 15.7, v.h - 5.9, v.z, "#ffd98a", "#14181f");
        // porte-cochere on the street side
        box(g, 9, 0.5, 14, gold, c.x + 17, 5.4, v.z);
        for (const dz of [-5.6, 5.6]) cyl(g, 0.45, 5.4, gold, c.x + 20.6, 2.7, v.z + dz, 10);
        block({ x: c.x, z: v.z, rot: 0 }, 30, 26);
        ctx.addLitSpot({ x: c.x + 19, y: 7, z: v.z, warm: 0xffd070, power: 220, range: 40 });
        C.pois.push({ x: c.x + 21, z: v.z, r: 8, label: v.n });
      }
      for (const dz of [-38, 0, 38]) placeParkedCar(ctx, ["tristar", "doclorean", "landyroamer"][(dz + 38) / 38], r.x1 - 5, c.z + dz, Math.PI);
    } });

    C.openArea("Bayou Tech", { color: "#4a5a3a", zoneName: "campus", build: (r, c) => {
      const lawn = mat(0x63914d, "campus lawn", 1);
      C.plane(c.w, c.d, lawn, c.x, 0.02, c.z);
      const g = new THREE.Group();
      scene.add(g);
      const brick = mat(0x8e4a3a, "university brick wall", 0.95);
      const stone = mat(0xd9d2c4, "university stone trim", 0.85);
      // a hall each end and the main building between, facing the road (+z)
      for (const [bx, w, h] of [[-24, 22, 11], [24, 22, 11]]) {
        box(g, w, h, 16, brick, c.x + bx, h / 2, c.z);
        box(g, w + 1, 0.8, 17, stone, c.x + bx, h + 0.4, c.z);
        block({ x: c.x + bx, z: c.z, rot: 0 }, w, 16);
      }
      box(g, 26, 15, 18, brick, c.x, 7.5, c.z);
      box(g, 27, 0.9, 19, stone, c.x, 15.4, c.z);
      // the cupola: every engineering school has one
      box(g, 7, 6, 7, stone, c.x, 18.6, c.z);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(3.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x3f6f5a, "verdigris copper dome", 0.55, { metalness: 0.5 }));
      dome.position.set(c.x, 21.5, c.z);
      dome.castShadow = true;
      g.add(dome);
      block({ x: c.x, z: c.z, rot: 0 }, 26, 18);
      sign(g, 14, 1.5, "BAYOU TECH UNIVERSITY", c.x, 3.4, c.z + 9.2, "#f6ecd0", "#5a2a20");
      for (const bx of [-30, 30]) ctx.addLitSpot({ x: c.x + bx, y: 6, z: c.z + 14, warm: 0xffe6b8, power: 120, range: 26, pole: true });
      C.pois.push({ x: c.x, z: c.z + 16, r: 10, label: "Bayou Tech University" });
    } });

    C.openArea("Grambleton State", { color: "#4a5a3a", zoneName: "campus", build: (r, c) => {
      C.plane(c.w, c.d, mat(0x63914d, "campus lawn", 1), c.x, 0.02, c.z);
      const g = new THREE.Group();
      scene.add(g);
      const brick = mat(0x9a7a3a, "university brick wall", 0.95);
      const stone = mat(0xe4dccc, "university stone trim", 0.85);
      box(g, 34, 13, 18, brick, c.x, 6.5, c.z);
      box(g, 35, 0.9, 19, stone, c.x, 13.4, c.z);
      // a portico of six columns on the road side
      box(g, 22, 1.4, 6, stone, c.x, 12.2, c.z + 11);
      for (let i = 0; i < 6; i++) cyl(g, 0.58, 11.4, stone, c.x - 9 + i * 3.6, 5.7, c.z + 11.2, 12);
      block({ x: c.x, z: c.z, rot: 0 }, 34, 18);
      sign(g, 18, 1.8, "GRAMBLETON STATE", c.x, 14.6, c.z + 9.6, "#f4e08a", "#1e1a12");
      sign(g, 14, 1.1, "HOME OF THE WORLD FAMED BAND", c.x, 3.2, c.z + 9.3, "#f4e08a", "#1e1a12");
      for (const bx of [-18, 18]) ctx.addLitSpot({ x: c.x + bx, y: 6, z: c.z + 15, warm: 0xffe6b8, power: 120, range: 26, pole: true });
      C.pois.push({ x: c.x, z: c.z + 16, r: 10, label: "Grambleton State University" });
    } });

    C.openArea("Grambleton stadium", { color: "#3f6b34", build: (r, c) => {
      C.plane(c.w, c.d, mat(0x4d7a3c, "stadium turf grass", 1), c.x, 0.02, c.z);
      const g = new THREE.Group();
      scene.add(g);
      // the field, its stripes, and a stand down each side
      const turf = mat(0x2f6b2c, "playing field grass", 1);
      C.plane(c.w - 18, c.d - 14, turf, c.x, 0.026, c.z);
      const paint = mat(0xe8e4d8, "field line paint", 0.7);
      paint.userData.gtbRealized = true;
      for (let i = -3; i <= 3; i++) C.plane(0.3, c.d - 16, paint, c.x + i * 7, 0.032, c.z);
      const concrete = mat(0x9a958c, "stand concrete", 0.9);
      for (const s of [-1, 1]) {
        for (let k = 0; k < 5; k++) box(g, c.w - 20, 0.5, 1.5, concrete, c.x, 1 + k * 1.1, c.z + s * (c.d / 2 - 4 - k * 1.4));
        ctx.addBlocker(c.x - 8, c.z + s * (c.d / 2 - 5), 4);
        ctx.addBlocker(c.x + 8, c.z + s * (c.d / 2 - 5), 4);
      }
      for (const [bx, bz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const px = c.x + bx * (c.w / 2 - 3), pz = c.z + bz * (c.d / 2 - 3);
        cyl(g, 0.4, 18, mat(0x3a3d40, "floodlight mast steel", 0.6), px, 9, pz, 8);
        ctx.addLitSpot({ x: px, y: 18, z: pz, warm: 0xf4f8ff, power: 260, range: 52 });
        ctx.addBlocker(px, pz, 0.8);
      }
      sign(g, 16, 1.8, "ROBINSON FIELD", c.x, 7.5, c.z - c.d / 2 + 1, "#f4e08a", "#1e1a12");
      C.pois.push({ x: c.x, z: c.z, r: 12, label: "Robinson Field" });
    } });

    C.openArea("Hayride Auditorium", { color: "#5a4a3a", zoneName: "entertainment", build: (r, c) => {
      C.plane(c.w, c.d, C.tiled(ctx.surface("concrete", 512).material(1, { color: 0xbfb8aa }), c.w, c.d, 6), c.x, 0.02, c.z);
      const g = new THREE.Group();
      scene.add(g);
      // art deco: a stepped block, fluted piers and a marquee over the doors
      const skin = mat(0xd6c9a8, "auditorium limestone", 0.82);
      const trim = mat(0xb08d3a, "auditorium brass trim", 0.4, { metalness: 0.65 });
      box(g, 34, 15, 26, skin, c.x, 7.5, c.z);
      box(g, 22, 5, 20, skin, c.x, 17.2, c.z - 1);
      for (let i = 0; i < 7; i++) box(g, 1.2, 14, 1.2, trim, c.x - 15 + i * 5, 7, c.z + 13.1);
      box(g, 26, 1.6, 4.4, trim, c.x, 6.6, c.z + 15);              // marquee
      sign(g, 22, 2.4, "LOUISIANA HAYRIDE", c.x, 8.6, c.z + 13.4, "#fff4d8", "#7a1f12");
      sign(g, 20, 1.2, "LIVE ON THE RADIO", c.x, 5.6, c.z + 17.2, "#ffe0a0", "#1e1a12");
      block({ x: c.x, z: c.z, rot: 0 }, 34, 26);
      for (const bx of [-13, 13]) ctx.addLitSpot({ x: c.x + bx, y: 6.5, z: c.z + 17, warm: 0xffd070, power: 160, range: 30 });
      C.pois.push({ x: c.x, z: c.z + 19, r: 9, label: "Louisiana Hayride Auditorium" });
    } });

    C.openArea("fairgrounds", { color: "#6b5a3a", zoneName: "rural", build: (r, c) => {
      const dirt = ctx.surface("dirt", 512).material(1, { color: 0xb09472 });
      C.plane(c.w, c.d, C.tiled(dirt, c.w, c.d, 8), c.x, 0.021, c.z);
      const g = new THREE.Group();
      scene.add(g);
      // a rodeo arena: an oval of rail, chutes at one end, a stand on the road side
      const rail = mat(0x8a6a44, "arena rail timber", 0.95);
      const R = Math.min(c.w, c.d) / 2 - 7;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
        const px = c.x + Math.sin(a) * R * 1.25, pz = c.z + Math.cos(a) * R;
        cyl(g, 0.14, 1.7, rail, px, 0.85, pz, 6);
        box(g, 2.6, 0.12, 0.1, rail, px, 1.35, pz, a);
        box(g, 2.6, 0.12, 0.1, rail, px, 0.75, pz, a);
        ctx.addBlocker(px, pz, 0.7);
      }
      for (let i = 0; i < 4; i++) {
        box(g, 2.4, 2.2, 0.12, rail, c.x - 4 + i * 2.6, 1.1, c.z - R + 1);
        box(g, 0.12, 2.2, 2.2, rail, c.x - 5.2 + i * 2.6, 1.1, c.z - R + 2.2);
      }
      const stand = mat(0x9a958c, "stand concrete", 0.9);
      for (let k = 0; k < 4; k++) box(g, 22, 0.5, 1.4, stand, c.x, 1 + k * 1.1, c.z + R + 3 + k * 1.3);
      ctx.addBlocker(c.x, c.z + R + 5, 8);
      placeTruck(ctx, "pickup", r.x0 + 8, r.z1 - 8, 0.6);
      placeTruck(ctx, "truck", r.x0 + 18, r.z1 - 9, -0.3);
      sign(g, 16, 2, "SHRUSTON RODEO", c.x, 4.4, c.z + R + 9, "#fff0c8", "#5a2a12");
      for (const bx of [-1, 1]) ctx.addLitSpot({ x: c.x + bx * 18, y: 12, z: c.z, warm: 0xffe0b0, power: 180, range: 40, pole: true });
      C.pois.push({ x: c.x, z: c.z + R + 6, r: 10, label: "Shruston Rodeo Grounds" });
    } });

    C.openArea("civic lot", { color: "#55544e", build: areas.lot(C, { cars: 5 }) });

    placeBillboard(ctx, wx(-6), wz(I20_Z - 16), 0, "SHRUSTON", "POP. 231,400", "TEXAS IS THAT WAY. STAY ANYWAY.");
    placeBillboard(ctx, wx(120), wz(TEXAS_Z + 22), -Math.PI / 2, "GRAMBLETON HOMECOMING", "THE BAND TAKES THE FIELD AT HALFTIME", "GET THERE EARLY");

    // ---- 5 vegetation ---------------------------------------------------
    C.vegetation(wr(BOUNDS), {
      spacing: 12, jitter: 3.5, clearance: 5,
      trunk: ctx.surface("dirt", 512).material(2, { color: 0xc0ab92, envMapIntensity: 0.7 }),
      foliage: ctx.surface("grass", 512).material(3, { color: 0xa9c88c, envMapIntensity: 0.8 }),
    });

    // ---- 6 landmark: LEGENDS WALK --------------------------------------
    C.landmark("Legends Walk", (r, c) => {
      const g = new THREE.Group();
      scene.add(g);
      const pave = ctx.surface("concrete", 512).material(1, { color: 0xc4bdae });
      C.plane(c.w, c.d, C.tiled(pave, c.w, c.d, 6), c.x, 0.023, c.z);
      const stone = mat(0xd6cfbe, "colonnade limestone", 0.8);
      // a colonnade down each long side, with the bronzes between the columns
      for (const s of [-1, 1]) {
        const px = c.x + s * (c.w / 2 - 2.4);
        box(g, 2.6, 0.7, c.d - 4, stone, px, 0.35, c.z);
        box(g, 3.2, 1.1, c.d - 3, stone, px, 9.4, c.z);
        for (let i = 0; i < 6; i++) {
          const pz = c.z - (c.d - 14) / 2 + i * (c.d - 14) / 5;
          cyl(g, 0.52, 8.6, stone, px, 4.9, pz, 12);
          ctx.addBlocker(px, pz, 0.8);
        }
      }
      // the bronzes: two facing rows down the walk, looking in at each other
      const n = BRONZES.length, perSide = Math.ceil(n / 2);
      BRONZES.forEach((who, i) => {
        const s = i < perSide ? -1 : 1, k = i < perSide ? i : i - perSide;
        const x = c.x + s * (c.w / 2 - 7.5);
        const z = c.z - (c.d - 16) / 2 + k * (c.d - 16) / Math.max(1, perSide - 1);
        statue(g, x, z, s < 0 ? Math.PI / 2 : -Math.PI / 2, who);
      });
      // and the stars, down the centre line
      STARS.forEach(([name, where], i) => {
        const z = c.z - (c.d - 10) / 2 + i * (c.d - 10) / (STARS.length - 1);
        star(g, c.x, z, name, where);
      });
      // the gate, on the Texas Avenue end
      box(g, c.w, 1.6, 2.2, stone, c.x, 10.6, c.z - c.d / 2 + 1);
      sign(g, c.w - 8, 2.2, "LEGENDS OF LOUISIANA", c.x, 10.6, c.z - c.d / 2 + 2.25, "#f0e2b8", "#2f2a20");
      for (const s of [-1, 1]) ctx.addLitSpot({ x: c.x + s * (c.w / 2 - 3), y: 9, z: c.z, warm: 0xffe6b8, power: 150, range: 30 });
      C.pois.push({ x: c.x, z: c.z, r: 10, label: "Legends Walk" });
      C.pois.push({ x: c.x, z: c.z - c.d / 2 - 4, r: 6, label: "Legends Walk gate" });
    });
  }

  return {
    BOUNDS: wr(BOUNDS), CORE: wr(CORE), LAKE: wr(LAKE), lanes,
    composer: C,
    buildSet,
    zoneAt(x, z) {
      const zone = C.zoneAt(x, z);
      if (zone !== "town") return zone;
      return inLocal(DOWNTOWN_ZONE, x - TOWN.x, z - TOWN.z) ? "urban" : zone;
    },
    report: () => C.report(),
    get pois() { return C.pois; },
    get props() { return C.props; },
    get minimap() { return C.minimap; },
    get zoneRects() { return C.zoneRects; },
    get drawn() { return C.drawn; },
    get legends() { return { bronzes: BRONZES.length, stars: STARS.length }; },
    update(dt, playerPos) {
      const b = wr(BOUNDS);
      const quiet = !(ctx.storyBusy && ctx.storyBusy());
      const inside = playerPos.x > b.x0 && playerPos.x < b.x1 && playerPos.z > b.z0 && playerPos.z < b.z1;
      if (!announced && quiet && inside) {
        announced = true;
        ctx.flashObjective("SHRUSTON · pop. 231,400. Two universities, four casinos, and the Texas line close enough to smell.");
      }
      if (announced && quiet && !walked
          && Math.hypot(playerPos.x - wx(42), playerPos.z - wz(76)) < 30) {
        walked = true;
        ctx.flashObjective("LEGENDS WALK — every one of them came out of this state.");
      }
      C.update(dt, ctx.camera ? ctx.camera.position : playerPos);
    },
  };
}
