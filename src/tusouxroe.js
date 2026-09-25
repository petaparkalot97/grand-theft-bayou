// ---------------------------------------------------------------------------
// tusouxroe.js — TUSOUXROE, the metropolis of north-east Bayou Dixie.
//
// Monroe, West Monroe and Bastrop, combined into one metro area. The three are
// really one place: Monroe and West Monroe are twin cities facing each other
// across the Ouachita River, and Bastrop sits up the road to the north. That
// river split is the defining fact about the shape of Monroe, so it is the
// defining fact about the shape of this district:
//
//   EAST BANK    downtown Tusouxroe. The grid, the mid-rises, the courthouse,
//                the hospital. Where the money is.
//   THE RIVER    the Tusoux, running north to south down the middle, widening
//                into Lake Tusoux at the south end. Two bridges, no more — you
//                cross at Louisville or at Cypress or you go around.
//   WEST BANK    West Tusouxroe. Trenton Street, cottages, a garage, a school.
//                Smaller, older, and it knows it.
//   BASTROUX     the satellite town at the north end, past the second bridge.
//                Its own main street and water tower, with twelve blocks of
//                nothing between it and the city.
//
// Laid out by composer.js in its six stages (road → buildings → side streets →
// open areas → vegetation → landmark), so the place reads as designed.
//
// SOUTH TUSOUXROE IS NOT BUILT HERE. Mama's house, the basketball court and
// Keseme's street belong to actone.js, and they are the reason this district
// exists at all. Their footprint is reserved as a composer site() before
// anything else is placed, so the city grows around the story instead of over
// it.
//
// Every number below is TOWN-LOCAL, measured from DISTRICTS.tusouxroe — the
// same frame actone.js uses, so the two line up automatically and the whole
// metro moves by editing districts.js. See the rules at the top of that file.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { createComposer } from "./composer.js";
import { DISTRICTS } from "./districts.js";
import { placeCityBuilding, placeParkedCar, placeOfficeClutter, placeStreetClutter, placeBillboard, makeDecorativeFence } from "./landmarks.js";

const TOWN = DISTRICTS.tusouxroe;
const wx = (x) => TOWN.x + x;
const wz = (z) => TOWN.z + z;
const wr = (r) => ({ x0: wx(r.x0), x1: wx(r.x1), z0: wz(r.z0), z1: wz(r.z1) });
const wp = (pts) => pts.map(([x, z]) => [wx(x), wz(z)]);

// ---- the plot ----
const BOUNDS = { x0: -130, x1: 172, z0: -572, z1: -12 };
const CORE = { x0: -124, x1: 168, z0: -560, z1: -30 };   // "town" for spawnzones.js
/** actone.js's set: street z -106 from x 29 east to 128, the house at (100,-93), the court at (84,-119). */
const ACT_ONE = { x0: 18, x1: 130, z0: -139, z1: -75 };

// ---- the water ----
// The Tusoux runs the length of the district and opens into a lake at the south
// end, which is how it stops without stopping: a river that simply ran off the
// edge of the map read as a canal with the ends sawn off, and a river crossing
// the Port Highway would have wanted a third bridge that nothing in the story
// ever uses. Cheniere Lake sits in that exact spot beside the real Monroe, so
// the map gets a lake.
const RIVER_W = { x0: -8, x1: 14 };
const LOUISVILLE_Z = -230, CYPRESS_Z = -360;
/** Gaps in the water where the two bridges cross, so the banks stop blocking there too. */
const RIVER_SEGS = [[-572, -371], [-349, -241], [-219, -126]];
const LAKE = { x0: -62, x1: 14, z0: -126, z1: -58 };

// ---- the street plan ----
const ARTERIAL_X = 150;       // Industrial Drive: Port Highway to Bastroux, the through route
const DESIARD_Z = -170;       // downtown's own main street, east bank only
const NATCHEZ_Z = -300;
const BASTROUX_Z = -500;
const RIVERSIDE_X = 40;       // the east bank, one block back from the levee
const GRAND_X = 95;           // downtown's spine
const TRENTON_X = -50;        // West Tusouxroe's main street
const TRENTON_Z0 = -140;      // its south end, which stops short of the lake shore at z -126
const STREET_Z = -106;        // actone.js's street, which this district joins to the grid

// Who is on the street where. The composer hands back one "town" for its whole
// core, which is the right answer for a village and the wrong one for a
// metropolis: downtown wants the suits-and-tourists mix that OrleaRouge gets,
// and the west bank is houses. Everything else — the roads, the water, the
// named areas, Bastroux — keeps what the composer said.
const DOWNTOWN_ZONE = { x0: 20, x1: 170, z0: -400, z1: -150 };
const WESTBANK_ZONE = { x0: -128, x1: -10, z0: -450, z1: -130 };
const inLocal = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

/**
 * The whole street grid, as data, and ALL of it paved in stage 1 — not in stage
 * 3, where side streets normally go.
 *
 * The reason is the Industrial Drive frontage, which goes up in stage 2. With
 * the cross streets still unbuilt at that point, the frontage filled the
 * corners, and Desiard, Louisville, Natchez and Cypress were then laid straight
 * through the fronts of sixteen shops — 225 grid cells of building paved over.
 *
 * Reserving each corridor with site() first was the obvious fix and the wrong
 * one: in a GRID every street crosses another, so every corridor overlaps its
 * neighbours and the composer warns on all of it. Laying the roads first costs
 * nothing instead — road over road is not a conflict, and a frontage simply
 * rejects a slot that a street already occupies. The frontages stay in stages 2
 * and 3, which is where the ordering actually means something.
 */
const STREETS = [
  { name: "Louisville Avenue", points: [[-122, LOUISVILLE_Z], [168, LOUISVILLE_Z]], width: 11, lampEvery: 38 },
  { name: "Cypress Street", points: [[-122, CYPRESS_Z], [168, CYPRESS_Z]], width: 10, lampEvery: 38 },
  { name: "Desiard Street", points: [[22, DESIARD_Z], [168, DESIARD_Z]], width: 10, lampEvery: 36 },
  { name: "Riverside Drive", points: [[RIVERSIDE_X, -150], [RIVERSIDE_X, -462]], width: 9, lampEvery: 42 },
  // Natchez Row starts east of the levee park, not at the water
  { name: "Natchez Row", points: [[34, NATCHEZ_Z], [142, NATCHEZ_Z]], width: 8, lampEvery: 40 },
  { name: "Grand Street", points: [[GRAND_X, -152], [GRAND_X, -398]], width: 9, lampEvery: 40 },
  { name: "Trenton Street", points: [[TRENTON_X, TRENTON_Z0], [TRENTON_X, -438]], width: 9, lampEvery: 42 },
  // ...and out to x 158, so it meets Industrial Drive instead of stopping 8 m
  // short of it in a field
  { name: "Bastroux Main", points: [[22, BASTROUX_Z], [158, BASTROUX_Z]], width: 9, lampEvery: 38 },
  // Mama's street, joined to the grid. actone.js lays the street itself from
  // x 29 east to 128; this is the twenty metres from its east end to the
  // arterial, which is what makes her neighbourhood part of a city instead of a
  // set standing on its own in a field.
  { name: "Nadia Street", points: [[131, STREET_Z], [152, STREET_Z]], width: 7, sidewalk: 1.4, centreLine: false },
];

export function createTusouxroe(ctx) {
  const { scene } = ctx;
  const C = createComposer(ctx, {
    name: "Tusouxroe",
    bounds: wr(BOUNDS),
    zones: { core: wr(CORE), wild: wr(BOUNDS) },
    seed: 32512,
  });
  let announced = false, bastrouxSeen = false;

  const std = (hex, rough, label, extra = {}) =>
    new THREE.MeshStandardMaterial({ color: hex, roughness: rough, name: label, ...extra });

  function box(w, h, d, mat, x, y, z, ry = 0, parent = scene) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // -------------------------------------------------------------------------
  // A downtown needs windows. Forty copies of Cloudline Tower is a business
  // park, not a city, so the mid-rises that fill the grid are procedural: one
  // canvas holding a single floor of window bays, tiled up and across the box.
  // Cached by (floors, bays), so the whole downtown shares a handful of
  // textures instead of carrying one each.
  // -------------------------------------------------------------------------
  const facadeCache = new Map();
  function facadeTexture(floors, bays) {
    const key = floors + "x" + bays;
    if (facadeCache.has(key)) return facadeCache.get(key);
    const S = 128;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d");
    g.fillStyle = "#b9b3a6";                       // the wall
    g.fillRect(0, 0, S, S);
    g.fillStyle = "#a39c8e";                       // a spandrel band under each floor
    g.fillRect(0, S - 14, S, 14);
    const pad = S * 0.16, ww = S - pad * 2, wh = S * 0.52;
    g.fillStyle = "#26313b";                       // glass
    g.fillRect(pad, S * 0.22, ww, wh);
    g.fillStyle = "#6f7b85";                       // a mullion or two
    for (let i = 1; i < 3; i++) g.fillRect(pad + (ww / 3) * i - 1, S * 0.22, 2, wh);
    g.fillStyle = "rgba(255,255,255,0.16)";        // a sill catching the light
    g.fillRect(pad, S * 0.22 + wh - 3, ww, 3);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(bays, floors);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    facadeCache.set(key, t);
    return t;
  }

  const BRICK = [0x9e8570, 0xb0a08c, 0x8f7f72, 0xa8a094, 0xc0b5a2, 0x7f8a8f];
  const roofMat = std(0x45484a, 0.95, "roof gravel");
  const parapetMat = std(0xa9a296, 0.85, "parapet");
  const storeMat = std(0x2a343c, 0.35, "shopfront glass", { metalness: 0.45 });
  const baseMat = std(0x6e6459, 0.8, "shopfront base");
  /**
   * A mid-rise: shopfront at street level, tiled window bays above, a parapet on
   * top. `slot.rot` already faces it at its road, so the shopfront goes on the
   * building's local +z.
   */
  function midRise(slot, { w, d, floors }) {
    const h = 3.6 + floors * 3.3;
    const bays = Math.max(2, Math.round(w / 3.4));
    const wall = std(BRICK[(slot.index * 5 + floors) % BRICK.length], 0.82, "mid-rise facade",
      { map: facadeTexture(floors, bays) });
    const g = new THREE.Group();
    g.position.set(slot.x, 0, slot.z);
    g.rotation.y = slot.rot;
    box(w, h - 3.6, d, wall, 0, 3.6 + (h - 3.6) / 2, 0, 0, g);
    box(w + 0.5, 0.9, d + 0.5, parapetMat, 0, h + 0.15, 0, 0, g);
    box(w - 1.2, 0.3, d - 1.2, roofMat, 0, h + 0.6, 0, 0, g);
    box(w, 3.6, d, baseMat, 0, 1.8, 0, 0, g);
    box(w - 1.4, 2.5, 0.2, storeMat, 0, 2.1, d / 2 + 0.02, 0, g);          // the glass on the street
    box(w, 0.35, 1.2, parapetMat, 0, 3.7, d / 2 + 0.4, 0, g);              // a canopy over the door
    scene.add(g);
    // Two blockers set in from the middle, not one the size of the footprint:
    // a single circle rounds the building off and lets you walk the corners.
    const hw = w / 2 - 1, hd = d / 2 - 1;
    const c = Math.cos(slot.rot), s = Math.sin(slot.rot);
    for (const lx of [-hw / 2, hw / 2]) {
      ctx.addBlocker(slot.x + c * lx, slot.z - s * lx, Math.max(hd, 3.4));
    }
    return true;
  }

  // The downtown mix, in the order the grid gets filled. The GLB landmarks carry
  // the recognisable silhouettes; the procedural mid-rises are the infill
  // between them, which is the ratio a real downtown has.
  const DOWNTOWN = ["mid6", "offices", "mid4", "tower", "mid5", "apartments", "mid8", "mid3", "offices", "mid5"];
  function downtown(slot) {
    const pick = DOWNTOWN[slot.index % DOWNTOWN.length];
    if (pick.startsWith("mid")) return midRise(slot, { w: 16, d: 15, floors: +pick.slice(3) });
    placeCityBuilding(ctx, pick, slot.x, slot.z, slot.rot);
    return true;
  }

  const MAIN_STREET = ["market", "cafe", "mid3", "garage", "mid4", "offices", "cafe", "mid3"];
  function mainStreet(slot) {
    const pick = MAIN_STREET[slot.index % MAIN_STREET.length];
    if (pick.startsWith("mid")) return midRise(slot, { w: 14, d: 13, floors: +pick.slice(3) });
    placeCityBuilding(ctx, pick, slot.x, slot.z, slot.rot);
    return true;
  }

  const WEST_BANK = ["cottage", "cottage", "garage", "cottage", "cafe", "cottage", "market", "cottage", "school", "cottage"];
  function westBank(slot) {
    placeCityBuilding(ctx, WEST_BANK[slot.index % WEST_BANK.length], slot.x, slot.z, slot.rot);
    return true;
  }

  const BASTROUX = ["cottage", "market", "cottage", "cafe", "cottage", "garage", "cottage", "fire_station"];
  function bastroux(slot) {
    placeCityBuilding(ctx, BASTROUX[slot.index % BASTROUX.length], slot.x, slot.z, slot.rot);
    return true;
  }

  // -------------------------------------------------------------------------
  // The river, the lake and the two bridges.
  // -------------------------------------------------------------------------
  // Silt-brown, like the Mississippi already is down in OrleaRouge — the
  // Ouachita carries the same load. Not a mirror: at low roughness the whole sky
  // landed in it and the river read as a strip of white sheet metal.
  const water = new THREE.MeshStandardMaterial({
    color: 0x5a4a32, roughness: 0.34, metalness: 0.02, envMapIntensity: 0.4, name: "Tusoux river water",
  });
  water.userData.gtbRealized = true;

  /**
   * Bank blockers down both sides of a stretch of water.
   *
   * composer.water() cannot do this job. It blocks a rect's z0 and z1 edges,
   * which for a river running north–south walls off the ENDS — the two bridge
   * gaps — and leaves both banks wide open to drive straight into. So the river
   * lays its own surface and its own banks.
   */
  // 4 m apart, never wider. A blocker of r 1.8 against a player of r 0.6 seals a
  // 4 m gap with 0.4 m to spare and a 5 m gap not at all, so the lake at 5 m
  // spacing was a car-proof shore you could stroll straight through.
  const SHORE_STEP = 4;
  function waterStretch(rect, shores = ["x0", "x1"]) {
    const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
    C.plane(w, d, water, wx(rect.x0 + w / 2), 0.035, wz(rect.z0 + d / 2));
    for (const e of shores) {
      if (e === "x0" || e === "x1") {
        for (let z = rect.z0; z <= rect.z1; z += SHORE_STEP) ctx.addBlocker(wx(rect[e]), wz(z), 1.8);
      } else {
        for (let x = rect.x0; x <= rect.x1; x += SHORE_STEP) ctx.addBlocker(wx(x), wz(rect[e]), 1.8);
      }
    }
    C.minimap.water.push(wr(rect));
  }

  const deckMat = std(0x8e8b84, 0.92, "concrete bridge deck");
  const railMat = std(0x1c1f22, 0.5, "bridge railing", { metalness: 0.6 });
  const pileMat = std(0x6f6c66, 0.95, "bridge piling");
  /** An east–west span across the river: deck, parapets with blockers, pilings, lamps. */
  function bridge(z, { roadW, name }) {
    const half = roadW / 2 + 2.6;
    const x0 = RIVER_W.x0 - 13, x1 = RIVER_W.x1 + 13;    // land both ends, so there is no seam at the bank
    const len = x1 - x0, xc = (x0 + x1) / 2;
    box(len, 0.24, half * 2, deckMat, wx(xc), 0.0, wz(z));
    for (const side of [-1, 1]) {
      const pz = z + side * (half - 0.2);
      box(len, 0.95, 0.4, parapetMat, wx(xc), 0.6, wz(pz));
      box(len, 0.09, 0.09, railMat, wx(xc), 1.22, wz(pz));
      for (let x = x0; x <= x1; x += 3) ctx.addBlocker(wx(x), wz(pz), 0.45);
      for (let x = x0 + 2; x < x1; x += 6) box(0.07, 0.5, 0.07, railMat, wx(x), 0.95, wz(pz));
    }
    // pilings in pairs, and a cross beam you can see from the water
    for (let x = x0 + 5; x < x1; x += 9) {
      for (const side of [-1, 1]) box(0.9, 3.2, 0.9, pileMat, wx(x), -1.5, wz(z + side * (half - 1.1)));
      box(0.5, 0.3, half * 2 - 0.6, pileMat, wx(x), -0.22, wz(z));
    }
    for (const x of [RIVER_W.x0 + 2, RIVER_W.x1 - 2]) {
      ctx.addLitSpot({ x: wx(x), y: 6.5, z: wz(z + half - 0.2), warm: 0xffd9a0, power: 100, range: 26, pole: true });
    }
    C.pois.push({ x: wx(xc), z: wz(z), r: 6, label: name });
  }

  // -------------------------------------------------------------------------
  // Traffic. Lanes stay on the arterials and inside the district, and nothing
  // runs down Keseme's street — actone.js parks its own cast there.
  // -------------------------------------------------------------------------
  const lanes = [
    { name: "Industrial Dr northbound", points: wp([[ARTERIAL_X - 2.4, -20], [ARTERIAL_X - 2.4, -504]]), cruise: [10, 15] },
    { name: "Industrial Dr southbound", points: wp([[ARTERIAL_X + 2.4, -504], [ARTERIAL_X + 2.4, -20]]), cruise: [10, 15] },
    { name: "Louisville Ave eastbound", points: wp([[-118, LOUISVILLE_Z + 2.6], [164, LOUISVILLE_Z + 2.6]]), cruise: [9, 14] },
    { name: "Louisville Ave westbound", points: wp([[164, LOUISVILLE_Z - 2.6], [-118, LOUISVILLE_Z - 2.6]]), cruise: [9, 14] },
    { name: "Desiard St eastbound", points: wp([[26, DESIARD_Z + 2.4], [164, DESIARD_Z + 2.4]]), cruise: [8, 12] },
    { name: "Desiard St westbound", points: wp([[164, DESIARD_Z - 2.4], [26, DESIARD_Z - 2.4]]), cruise: [8, 12] },
    { name: "Cypress St eastbound", points: wp([[-118, CYPRESS_Z + 2.4], [164, CYPRESS_Z + 2.4]]), cruise: [9, 13] },
    { name: "Grand St southbound", points: wp([[GRAND_X + 2.2, -396], [GRAND_X + 2.2, -154]]), cruise: [8, 12] },
    { name: "Trenton St northbound", points: wp([[TRENTON_X - 2.2, TRENTON_Z0 - 2], [TRENTON_X - 2.2, -436]]), cruise: [8, 12] },
  ];

  function buildSet() {
    // ---- 1 road: the arterial, and the plan for everything after it -------
    // Industrial Drive is the through route: off the Port Highway at the south
    // end, up the east bank past downtown, and on to Bastroux. Everything else
    // hangs off it.
    // ...and up to z -508, far enough to meet Bastroux Main rather than ending
    // thirty metres short of the town it exists to reach.
    C.road("Industrial Drive", wp([[ARTERIAL_X, -16], [ARTERIAL_X, -508]]), { width: 10, lampEvery: 40, y: 0.024 });
    for (const st of STREETS) {
      C.road(st.name, wp(st.points), {
        width: st.width, lampEvery: st.lampEvery || 0, y: 0.021,
        sidewalk: st.sidewalk == null ? 1.6 : st.sidewalk,
        ...(st.centreLine === false ? { centreLine: false } : {}),
      });
    }

    // Reserved before a single building is placed: Keseme's street, the court,
    // the Nadia house and the lot the night ride happens in. The composer will
    // not put anything inside a site(), so South Tusouxroe cannot be built over
    // no matter what else changes up here. Its east edge stops at x 130, which
    // is where actone.js's own content stops — far enough back that Nadia
    // Street, the stub that joins her street to the arterial, is not inside it.
    C.site("South Tusouxroe (Act One)", wr(ACT_ONE));
    // The river, in the same three pieces the water comes in. The two bridge
    // crossings need no site of their own: Louisville Avenue and Cypress Street
    // are already laid across them, and a road holds its ground exactly as a
    // site does.
    for (const [z0, z1] of RIVER_SEGS) C.site(`river ${z0}`, wr({ x0: RIVER_W.x0 - 1, x1: RIVER_W.x1 + 1, z0, z1 }));
    C.site("Lake Tusoux", wr(LAKE));
    // Every rect below is set clear of the road corridors above, which are now
    // already on the grid — a site that overlaps one is a warning at load and a
    // road paved through a park at runtime.
    C.site("courthouse", wr({ x0: 50, x1: 86, z0: -292, z1: -242 }));
    C.site("riverfront park", wr({ x0: 17, x1: 32, z0: -294, z1: -238 }));
    C.site("hospital block", wr({ x0: 108, x1: 142, z0: -400, z1: -372 }));
    C.site("civic parking", wr({ x0: 58, x1: 86, z0: -200, z1: -180 }));
    C.site("Bastroux yard", wr({ x0: 104, x1: 134, z0: -540, z1: -514 }));
    C.site("ball field", wr({ x0: -116, x1: -84, z0: -206, z1: -158 }));

    // ---- 2 buildings: the frontage on the arterial ------------------------
    C.frontage("Industrial Drive", {
      setback: 15, spacing: 26, footprint: { w: 18, d: 18 }, startAt: 150, endAt: 60,
      label: "Industrial Drive frontage", build: mainStreet,
    });

    // ---- 3 side streets: what fronts them (the streets themselves went in
    //      with stage 1, see STREETS above) -------------------------------
    // downtown: the dense blocks, between Desiard and Cypress on the east bank
    const blk = { stage: "sideStreets" };
    C.frontage("Desiard Street", { ...blk, setback: 15, spacing: 22, footprint: { w: 17, d: 16 }, startAt: 14, endAt: 12, label: "Desiard blocks", build: downtown });
    C.frontage("Grand Street", { ...blk, setback: 15, spacing: 22, footprint: { w: 17, d: 16 }, startAt: 16, endAt: 14, label: "Grand St blocks", build: downtown });
    C.frontage("Louisville Avenue", { ...blk, setback: 16, spacing: 24, footprint: { w: 18, d: 16 }, startAt: 150, endAt: 10, label: "Louisville blocks", build: downtown });
    C.frontage("Natchez Row", { ...blk, setback: 13, spacing: 20, footprint: { w: 15, d: 14 }, startAt: 12, endAt: 10, label: "Natchez Row", build: mainStreet });
    C.frontage("Cypress Street", { ...blk, setback: 15, spacing: 24, footprint: { w: 17, d: 15 }, startAt: 140, endAt: 12, label: "Cypress blocks", build: mainStreet });
    C.frontage("Riverside Drive", { ...blk, sides: [-1], setback: 14, spacing: 22, footprint: { w: 16, d: 15 }, startAt: 14, endAt: 14, label: "Riverside blocks", build: downtown });
    // the west bank: lower, older, cottages and a school
    C.frontage("Trenton Street", { ...blk, setback: 14, spacing: 18, footprint: { w: 14, d: 13 }, startAt: 12, endAt: 10, label: "West Tusouxroe", build: westBank });
    C.frontage("Bastroux Main", { ...blk, setback: 14, spacing: 19, footprint: { w: 15, d: 13 }, startAt: 10, endAt: 8, label: "Bastroux", build: bastroux });

    // ---- 4 open areas: the water first, then the planned gaps ------------
    // The river only needs its two banks: each segment's ends are either the next
    // segment, a bridge approach on dry land, or the lake.
    for (const [z0, z1] of RIVER_SEGS) waterStretch({ ...RIVER_W, z0, z1 });
    // The lake needs three shores and most of a fourth. Its north edge is the
    // river mouth for the 22 m the river is wide; the rest of that edge is bank
    // like any other, and without it you could drive in from the top.
    waterStretch(LAKE, ["x0", "x1", "z1"]);
    for (let x = LAKE.x0; x <= RIVER_W.x0 - 2; x += SHORE_STEP) ctx.addBlocker(wx(x), wz(LAKE.z0), 1.8);
    bridge(LOUISVILLE_Z, { roadW: 11, name: "Louisville Avenue Bridge" });
    bridge(CYPRESS_Z, { roadW: 10, name: "Cypress Street Bridge" });

    C.openArea("riverfront park", { color: "#3f6b34", zoneName: "riverfront", build: (r, c) => {
      const grass = ctx.surface("grass", 512).material(1, { color: 0x8fbf78 });
      C.plane(c.w, c.d, C.tiled(grass, c.w, c.d, 7), c.x, 0.02, c.z);
      // the levee walk, with a bench every so often facing the water
      const walk = ctx.surface("concrete", 512).material(1, { color: 0xb8b2a8 });
      C.plane(2.6, c.d - 6, C.tiled(walk, 2.6, c.d - 6, 5), r.x1 - 3, 0.026, c.z);
      const bench = std(0x6b5a44, 0.85, "park bench");
      for (let z = r.z0 + 14; z < r.z1 - 8; z += 26) {
        box(0.6, 0.12, 1.8, bench, r.x1 - 5.4, 0.5, z);
        box(0.12, 0.5, 1.8, bench, r.x1 - 5.7, 0.78, z);
        ctx.addLitSpot({ x: r.x1 - 3, y: 5, z: z + 13, warm: 0xffd9a0, power: 70, range: 18, pole: true });
      }
      makeDecorativeFence(ctx, r.x0 + 1, r.z0 + 2, r.x0 + 1, r.z1 - 2);
    } });

    C.openArea("hospital block", { color: "#55544e", build: (r, c) => {
      placeCityBuilding(ctx, "hospital", c.x, c.z, Math.PI);
      C.plane(c.w, 10, C.tiled(ctx.roadMaterial(), c.w, 10, 8), c.x, 0.02, r.z1 - 5);
      placeParkedCar(ctx, "beatall", r.x0 + 6, r.z1 - 5, 0);
      placeParkedCar(ctx, "tristar", r.x0 + 13, r.z1 - 5, 0);
      ctx.addLitSpot({ x: c.x, y: 9, z: r.z1 - 5, warm: 0xf4f8ff, power: 170, range: 34, pole: true });
      C.pois.push({ x: c.x, z: r.z1 - 8, r: 8, label: "Tusouxroe General" });
    } });

    C.openArea("civic parking", { color: "#55544e", build: (r, c) => {
      C.plane(c.w, c.d, C.tiled(ctx.roadMaterial(), c.w, c.d, 9), c.x, 0.02, c.z);
      const line = std(0xe8e4d8, 0.7, "road paint");
      line.userData.gtbRealized = true;
      for (let x = r.x0 + 2.4; x <= r.x1 - 2.4; x += 3.2) {
        C.plane(0.14, 5, line, x, 0.03, r.z0 + 3.6);
        C.plane(0.14, 5, line, x, 0.03, r.z1 - 3.6);
      }
      placeParkedCar(ctx, "doclorean", r.x0 + 5, r.z0 + 3.6, 0);
      placeParkedCar(ctx, "landyroamer", r.x0 + 11.4, r.z0 + 3.6, 0);
      placeParkedCar(ctx, "toyoyo", r.x0 + 8.2, r.z1 - 3.6, Math.PI);
      placeOfficeClutter(ctx, r.x1 - 4, r.z0 + 4);
      ctx.addLitSpot({ x: c.x, y: 8.5, z: c.z, warm: 0xffbf74, power: 150, range: 30, pole: true });
    } });

    C.openArea("Bastroux yard", { color: "#4f5a3e", zoneName: "bastroux_yard", build: (r, c) => {
      const dirt = ctx.surface("dirt", 512).material(1);
      C.plane(c.w, c.d, C.tiled(dirt, c.w, c.d, 7), c.x, 0.021, c.z);
      if (ctx.makeWaterTower) ctx.makeWaterTower(c.x, c.z, "BASTROUX", ["EST. 1846", "PAPER MILL PRIDE"], "THE MILL CLOSED IN 89");
      makeDecorativeFence(ctx, r.x0 + 1, r.z1 - 1, r.x1 - 1, r.z1 - 1);
      if (ctx.makeBarrel) { ctx.makeBarrel(r.x0 + 3, r.z0 + 3); ctx.makeBarrel(r.x0 + 4.4, r.z0 + 3.6); }
      ctx.addLitSpot({ x: c.x, y: 7, z: c.z + 6, warm: 0xffc48a, power: 110, range: 24, pole: true });
    } });

    C.openArea("ball field", { color: "#3f6b34", build: (r, c) => {
      const grass = ctx.surface("grass", 512).material(1, { color: 0x9fcf86 });
      C.plane(c.w, c.d, C.tiled(grass, c.w, c.d, 6), c.x, 0.02, c.z);
      const infield = C.plane(14, 14, C.tiled(ctx.surface("dirt", 512).material(1), 14, 14, 5), c.x, 0.024, r.z0 + 12);
      infield.rotation.z = Math.PI / 4;
      if (ctx.makeFence) {
        ctx.makeFence(r.x0 + 1, r.z0 + 0.5, r.x1 - 1, r.z0 + 0.5);
        ctx.makeFence(r.x0 + 0.5, r.z0 + 1, r.x0 + 0.5, r.z1 - 1);
      }
      const bleacher = std(0x8a8f96, 0.5, "aluminium bleacher", { metalness: 0.6 });
      for (let k = 0; k < 3; k++) box(9, 0.3, 1, bleacher, c.x, 0.5 + k * 0.6, r.z1 - 3 - k);
      ctx.addBlocker(c.x - 3, r.z1 - 4, 2.5); ctx.addBlocker(c.x + 3, r.z1 - 4, 2.5);
      for (const x of [r.x0 + 2, r.x1 - 2]) ctx.addLitSpot({ x, y: 10, z: r.z0 + 4, warm: 0xf4f8ff, power: 160, range: 34, pole: true });
    } });

    placeBillboard(ctx, wx(ARTERIAL_X - 16), wz(-40), Math.PI / 2, "TUSOUXROE", "POP. 48,200", "COTTON, PAPER, AND POLITICS");
    placeStreetClutter(ctx, wx(GRAND_X + 8), wz(LOUISVILLE_Z + 9), 0);
    placeStreetClutter(ctx, wx(RIVERSIDE_X + 8), wz(NATCHEZ_Z - 9), Math.PI);

    // ---- 5 vegetation: pines on whatever the city did not take ----------
    C.vegetation(wr(BOUNDS), {
      // 9.5 m spacing with 3.5 m clearance put 890 pines in — half of them in the
      // gaps between downtown blocks, so downtown read as woodland with a
      // courthouse in it. A 5 m clearance needs a genuine 10 m of nothing, which
      // is the open land between the city and Bastroux and not a side yard.
      spacing: 12, jitter: 3.5, clearance: 5,
      trunk: ctx.surface("dirt", 512).material(2, { color: 0xc0ab92, envMapIntensity: 0.7 }),
      foliage: ctx.surface("grass", 512).material(3, { color: 0xa9c88c, envMapIntensity: 0.8 }),
    });

    // ---- 6 landmark: the courthouse, closing the view up Riverside -------
    C.landmark("courthouse", (r, c) => {
      const stone = std(0xd6cfbe, 0.78, "courthouse limestone");
      const trim = std(0xe8e2d2, 0.7, "courthouse trim");
      const g = new THREE.Group();
      g.position.set(c.x, 0, c.z);
      // the block, the attic storey, and the clock tower over the entrance
      box(34, 13, 26, stone, 0, 6.5, 0, 0, g);
      box(36, 1.2, 28, trim, 0, 13.6, 0, 0, g);
      box(12, 9, 12, stone, 0, 18.5, -1, 0, g);
      box(13.4, 0.8, 13.4, trim, 0, 23.3, -1, 0, g);
      box(8, 5, 8, stone, 0, 26.2, -1, 0, g);
      const clock = std(0xf4f1e6, 0.5, "clock face", { emissive: 0xfff0c0, emissiveIntensity: 0.35 });
      clock.userData.gtbRealized = true;
      for (const [cx, cz, ry] of [[0, 4.05, 0], [0, -6.05, 0], [4.05, -1, Math.PI / 2], [-4.05, -1, Math.PI / 2]]) {
        box(3.2, 3.2, 0.12, clock, cx, 26.6, cz, ry, g);
      }
      // the portico, on the avenue side (local +z, facing south down Riverside)
      box(18, 0.9, 6, trim, 0, 0.45, 15.5, 0, g);
      for (let i = 0; i < 6; i++) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 11, 12), trim);
        col.position.set(-7.5 + i * 3, 6.4, 15.6);
        col.castShadow = col.receiveShadow = true;
        g.add(col);
      }
      box(20, 1.6, 7, trim, 0, 12.6, 15.5, 0, g);
      scene.add(g);
      const steps = ctx.surface("concrete", 512).material(1, { color: 0xc4bdb0 });
      C.plane(38, 9, C.tiled(steps, 38, 9, 5), c.x, 0.023, c.z + 20);
      for (const [bx, bz] of [[-11, 0], [11, 0], [0, -9], [0, 9]]) ctx.addBlocker(c.x + bx, c.z + bz, 7);
      for (const bx of [-9, 9]) ctx.addLitSpot({ x: c.x + bx, y: 6, z: c.z + 19, warm: 0xfff0c8, power: 150, range: 28, pole: true });
      C.pois.push({ x: c.x, z: c.z + 22, r: 9, label: "Ouachita Parish Courthouse" });
    });
  }

  return {
    BOUNDS: wr(BOUNDS), CORE: wr(CORE), ACT_ONE: wr(ACT_ONE), lanes,
    composer: C,
    buildSet,
    zoneAt(x, z) {
      const zone = C.zoneAt(x, z);
      if (zone !== "town") return zone;
      const lx = x - TOWN.x, lz = z - TOWN.z;
      if (inLocal(DOWNTOWN_ZONE, lx, lz)) return "urban";
      if (inLocal(WESTBANK_ZONE, lx, lz)) return "residential";
      return zone;
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
      if (!announced && quiet && playerPos.x > b.x0 && playerPos.x < b.x1 && playerPos.z < wz(-40) && playerPos.z > b.z0) {
        announced = true;
        ctx.flashObjective("TUSOUXROE · pop. 48,200. Paper mill money on one bank, everybody else on the other.");
      }
      if (announced && quiet && !bastrouxSeen && playerPos.z < wz(-470)) {
        bastrouxSeen = true;
        ctx.flashObjective("BASTROUX · pop. 9,600. Past the second bridge, and it may as well be another state.");
      }
      C.update(dt, ctx.camera ? ctx.camera.position : playerPos);
    },
  };
}
