// ---------------------------------------------------------------------------
// tusouxroeNorth.js — North Tusouxroe Commercial & Civic District.
//
// Expands the world map north from z = −136 up to NORTH_MIN_Z (−440).
// Follows the composer.js 6-stage lifecycle for intentional world composition:
//
//   1 road          North US-167 Highway, Tusouxroe Boulevard arterial (z = -260),
//                   Civic Center Way (west), Industrial Drive (east).
//   2 buildings     Commercial frontage: Harborlight Hospital, Freshfield Market,
//                   Mossline Garage, Cornerleaf Cafe along the main avenues.
//   3 side streets  Civic & Corporate Hub: Ember Fire Station, Willowbrook School,
//                   Sageworks Offices, Meadow Apartments.
//   3b the strip    THE CROWN STRIP: four mega-venues along North Ave 2 either
//                   side of US-167 (walk-in interiors — see below).
//   4 open areas    Hospital plaza, Supermarket parking lot, Fire Station yard,
//                   School athletic field, and parking aprons.
//   5 vegetation    Pines & cypress trees clustering naturally along boundaries.
//   6 landmark      Cloudline Tower at (x = -6, z = -400) closing the north view.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { createComposer } from "./composer.js";
import { CITY_BUILDING_TYPES, placeCityBuilding, makeDecorativeFence, placeOfficeClutter, placeStreetClutter, placeBillboard, placeParkedCar, placeGunShop, placeTacos, placeBurgerPiz, placeSixTwelve, placeGasStation } from "./landmarks.js";
import { neonSignTexture, neonSignMaterial, aspectOf } from "./neonsign.js";

// ---------------------------------------------------------------------------
// THE CROWN STRIP — North Tusouxroe's casino and nightlife row.
//
// Four mega-venues front North Ave 2 (z = -320), two each side, between US-167 on
// the west and Industrial Drive on the east. Each is the merge of a pair of the
// row's old smaller venues:
//
//   BAYOU GOLD   (Pelican Crown Casino + Bayou Gold)      one large casino
//   BILLY JEANS  (Gator's Fortune + Honeysuckle)          lounge, stage, glove
//   DISCO GATORS (The Brass Alligator + Midnight Special) one mega-nightclub
//   HAPPY HOGS   (Le Bon Temps + The Honeydripper)        the strip club
//
// The gateway arch over US-167 at z = -310 faces south, so the strip announces
// itself to anyone driving up out of Chatboro.
//
// Every venue is **walkable**: the entrance is a real opening in the collision
// ring, and standing inside lifts the roof (slab, header, canopy, fascia and the
// name sign) and drops the outer walls to knee height — nightlife.js's cutaway,
// at four times the footprint. Venues are data (`CROWN_VENUES`) and `buildVenue()`
// is one builder over a fixture table, so a fifth venue is a new entry, not a new
// function.
//
// Batching: the venue groups stay in the scene, and only the meshes the cutaway
// moves carry `userData.noBatch` (merge.js honours it per mesh), so the parish
// sweep still merges the interiors — 738 district meshes collapse to 76 in 50
// batches — while all 56 moving meshes survive it. Mark any new animated mesh the
// same way.
//
// Two things main.js still has to wire, both one-liners, are recorded on TASK-070:
// the F key (`interact()`) and the radar (`blips()`).
// ---------------------------------------------------------------------------
const CROWN_AVE_Z = -320;      // North Ave 2 — the avenue the strip fronts
const CROWN_HALF = 6.1;        // its half-width including both sidewalks (9 m road + 1.6 m kerbs)

/**
 * THE CROWN STRIP — four mega-venues.
 *
 * The row used to be fourteen small halls. It is now four large ones, each the
 * merge of a pair of the old venues (the human's call, 2026-09-22):
 *
 *   BAYOU GOLD   = Pelican Crown Casino + Bayou Gold       → one mega-casino
 *   BILLY JEANS  = Gator's Fortune + Honeysuckle           → lounge with a stage
 *   DISCO GATORS = The Brass Alligator + Midnight Special  → one mega-nightclub
 *   HAPPY HOGS   = Le Bon Temps + The Honeydripper         → the strip club
 *
 * A venue is *data*: dimensions, palette, sign, interior theme, exterior props
 * and a `layout` list of fixtures. `buildVenue()` reads that data and one table of
 * fixture builders places it, so the next venue is a new entry here rather than
 * another several-hundred-line function.
 *
 * `side` is which terrace it fronts: -1 is the far (north) side of the avenue, +1
 * the near side, so every front looks across the traffic at the others. `x` slots
 * keep clear of US-167 (x = -6), Civic Center Way (x = -110), Industrial Drive
 * (x = 110) and the two landmarks that already straddle North Ave 2. Depth is the
 * tight axis here: North Ave 2 (z = -320) to North Ave 3 (z = -380) leaves about
 * 47 m for `fore + d`, so the halls grow along the avenue instead.
 */
const CROWN_VENUES = [
  {
    id: "bayou-gold", name: "BAYOU GOLD", kind: "casino", interior: "casino",
    side: -1, x: -60, w: 56, d: 30, h: 14, fore: 14, door: 9, cars: 10,
    neon: 0xffd23a, ink: "#ffe066",
    theme: { wall: 0x14161f, trim: 0xd4af37, interior: 0x2a1430, accent: 0xffd23a, felt: 0x12613f },
    sign: { h: 3.2, sub: "CASINO" },
    blurb: "Two floors of it, and the house always wins, cher.",
    layout: [
      { fixture: "slotBank", n: 9, x: -16, z: -11, rot: 0 },
      { fixture: "slotBank", n: 9, x: 12, z: -11, rot: 0 },
      { fixture: "gamingTable", x: -14, z: -1, n: 3, dx: 5 },
      { fixture: "gamingTable", x: 12, z: -1, n: 3, dx: 5 },
      { fixture: "bar", x: 23, z: -4, rot: Math.PI / 2, len: 14 },
      { fixture: "partition", x: 6, z: -7, rot: Math.PI / 2, len: 12 },
      { fixture: "backRoom", x: 19, z: -10, w: 12, d: 7 },
      { fixture: "vip", x: -22, z: 8, w: 10, d: 8 },
      { fixture: "seating", x: -8, z: 9, n: 3, dx: 6 },
      { fixture: "chandelier", x: -14, z: 0 },
      { fixture: "chandelier", x: 12, z: 0 },
    ],
  },
  {
    id: "billy-jeans", name: "BILLY JEANS", kind: "lounge", interior: "lounge",
    side: 1, x: -60, w: 56, d: 30, h: 13, fore: 14, door: 8, cars: 6,
    neon: 0x9ad6ff, ink: "#dff2ff",
    theme: { wall: 0x141a24, trim: 0xcfd8e6, interior: 0x1a2330, accent: 0x9ad6ff, felt: 0x12613f },
    sign: { h: 3.0, sub: "LOUNGE & STAGE" },
    blurb: "Bar, stage, pool table, and a glove that will not quit.",
    props: ["glove"],
    layout: [
      { fixture: "stage", x: -16, z: -10, w: 12, d: 5 },
      { fixture: "bar", x: 16, z: -12, rot: 0, len: 16 },
      { fixture: "poolTable", x: 16, z: 2, n: 2, dx: 5 },
      { fixture: "seating", x: -6, z: 5, n: 3, dx: 6 },
      { fixture: "seating", x: -20, z: 7, n: 2, dx: 6 },
      { fixture: "partition", x: -6, z: -3, rot: 0, len: 16 },
      { fixture: "backRoom", x: 20, z: 9, w: 12, d: 8 },
      { fixture: "chandelier", x: 0, z: 4 },
      { fixture: "chandelier", x: -12, z: -3 },
    ],
  },
  {
    id: "disco-gators", name: "DISCO GATORS", kind: "club", interior: "disco",
    side: -1, x: 62, w: 52, d: 28, h: 15, fore: 12, door: 10, cars: 6,
    neon: 0xb14bff, ink: "#e0a8ff",
    theme: { wall: 0x160f22, trim: 0xff4fb3, interior: 0x120a18, accent: 0x2ee6d6, felt: 0x12613f },
    sign: { h: 3.4, sub: "NIGHTCLUB" },
    blurb: "Purple light, a teal floor, and one very large disco ball.",
    props: ["disco"],
    layout: [
      { fixture: "danceFloor", x: 0, z: 1, w: 18, d: 12 },
      { fixture: "djBooth", x: 0, z: -11, w: 10, d: 3 },
      { fixture: "bar", x: -18, z: -3, rot: Math.PI / 2, len: 16 },
      { fixture: "bar", x: 18, z: 6, rot: Math.PI / 2, len: 12 },
      { fixture: "vip", x: 18, z: -8, w: 12, d: 8 },
      { fixture: "stage", x: -18, z: 7, w: 12, d: 5 },
      { fixture: "discoBall", x: 0, z: -6, n: 3 },
      { fixture: "discoBall", x: 0, z: 6, n: 3 },
      { fixture: "chandelier", x: 0, z: 1 },
    ],
  },
  {
    id: "happy-hogs", name: "HAPPY HOGS", kind: "club", interior: "stripclub",
    side: 1, x: 62, w: 48, d: 26, h: 13, fore: 12, door: 8, cars: 6,
    neon: 0xff4fb3, ink: "#ff8ad0",
    theme: { wall: 0x1c0f1a, trim: 0xff4fb3, interior: 0x1a0a14, accent: 0xff4fb3, felt: 0x8a0f3c },
    sign: { h: 3.0, sub: "SHOW BAR" },
    blurb: "The finest hams on the Gulf Coast.",
    props: ["pig"],
    layout: [
      { fixture: "stage", x: -6, z: -9, w: 14, d: 6, poles: 3 },
      { fixture: "bar", x: 17, z: -5, rot: Math.PI / 2, len: 14 },
      { fixture: "seating", x: 4, z: 6, n: 3, dx: 7 },
      { fixture: "vip", x: -18, z: 7, w: 10, d: 7 },
      { fixture: "backRoom", x: 17, z: 7, w: 12, d: 7 },
      { fixture: "chandelier", x: -6, z: 2 },
    ],
  },
];

/**
 * Every venue resolved to world space — pure maths, so zoneAt() and the pine
 * pass can read it without buildSet() having run. A front faces the avenue, so
 * `rot` is 0 on the north terrace and π on the near one (models face local +z).
 */
const CROWN = CROWN_VENUES.map((v) => {
  // `k` keeps the hall spec shape the QA audit and zoneAt() already read
  const k = { w: v.w, d: v.d, h: v.h, fore: v.fore, door: v.door, cars: v.cars };
  const cz = CROWN_AVE_Z + v.side * (CROWN_HALF + k.fore + k.d / 2);
  const facadeZ = cz - v.side * (k.d / 2);          // the wall the door is cut into
  const hall = { x0: v.x - k.w / 2, x1: v.x + k.w / 2, z0: cz - k.d / 2, z1: cz + k.d / 2 };
  const fore = {
    x0: v.x - k.w / 2 - 5, x1: v.x + k.w / 2 + 5,
    z0: v.side < 0 ? facadeZ : facadeZ - k.fore,
    z1: v.side < 0 ? facadeZ + k.fore : facadeZ,
  };
  return { ...v, k, cz, facadeZ, rot: v.side < 0 ? 0 : Math.PI, hall, fore,
           entranceZ: facadeZ - v.side * 3 };
});
const CROWN_RECT = {                                   // the whole district
  x0: Math.min(...CROWN.map((c) => Math.min(c.hall.x0, c.fore.x0))) - 4,
  x1: Math.max(...CROWN.map((c) => Math.max(c.hall.x1, c.fore.x1))) + 4,
  z0: Math.min(...CROWN.map((c) => Math.min(c.hall.z0, c.fore.z0))) - 4,
  z1: Math.max(...CROWN.map((c) => Math.max(c.hall.z1, c.fore.z1))) + 4,
};
const inCrownRect = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
const CROWN_GATE = { x: -6, z: CROWN_AVE_Z + 10, span: 13 };   // the arch over US-167

/**
 * The row, as data: what `report()`-style QA reads and what the walk-in-interiors
 * follow-up builds against (`hall` is the shell to put a floor plan in, `fore`
 * the forecourt, `facadeZ` the wall the door is cut into).
 */
export const CROWN_STRIP = Object.freeze({
  name: "The Crown Strip",
  avenue: Object.freeze({ name: "North Ave 2", z: CROWN_AVE_Z, half: CROWN_HALF }),
  gate: Object.freeze(CROWN_GATE),
  rect: Object.freeze(CROWN_RECT),
  venues: CROWN,
});

// Geometry and materials are shared across all fourteen venues so the parish
// batch sweep can merge them into a handful of draws (same signature = same batch).
let _crownGeo = null, _crownMat = null;
function crownGeo() {
  if (_crownGeo) return _crownGeo;
  const cache = new Map();
  const box = (w, h, d) => {
    const key = `${w}|${h}|${d}`;
    if (!cache.has(key)) cache.set(key, new THREE.BoxGeometry(w, h, d));
    return cache.get(key);
  };
  const cyl = (r, h) => {
    const key = `c|${r}|${h}`;
    if (!cache.has(key)) cache.set(key, new THREE.CylinderGeometry(r, r, h, 10));
    return cache.get(key);
  };
  const sph = (r) => {
    const key = `s|${r}`;
    if (!cache.has(key)) cache.set(key, new THREE.SphereGeometry(r, 12, 8));
    return cache.get(key);
  };
  /**
   * A wall box whose pivot is at its own base, not its centre: translating the
   * geometry up by h/2 means `mesh.scale.y` shrinks the wall down from the floor,
   * which is how the interior cutaway opens a mega-venue up (nightlife.js's trick).
   */
  const wall = (w, h, d) => {
    const key = `w|${w}|${h}|${d}`;
    if (!cache.has(key)) {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(0, h / 2, 0);
      cache.set(key, g);
    }
    return cache.get(key);
  };
  const plane = (w, d) => {
    const key = `p|${w}|${d}`;
    if (!cache.has(key)) cache.set(key, new THREE.PlaneGeometry(w, d));
    return cache.get(key);
  };
  const torus = (r, t) => {
    const key = `t|${r}|${t}`;
    if (!cache.has(key)) cache.set(key, new THREE.TorusGeometry(r, t, 8, 24));
    return cache.get(key);
  };
  const cone = (r, h) => {
    const key = `k|${r}|${h}`;
    if (!cache.has(key)) cache.set(key, new THREE.ConeGeometry(r, h, 12));
    return cache.get(key);
  };
  return (_crownGeo = { box, cyl, sph, wall, plane, torus, cone });
}
function crownMat() {
  if (_crownMat) return _crownMat;
  const std = (name, color, extra = {}) => {
    const m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.72, ...extra });
    m.userData.gtbRealized = true;
    return m;
  };
  const flat = (name, color) => {
    const m = new THREE.MeshBasicMaterial({ name, color });
    m.userData.gtbRealized = true;
    return m;
  };
  // Memoised factories: four mega-venues each want their own palette, and a
  // fixture repeated a dozen times inside one venue must not make a dozen
  // materials (draw calls, and merge.js's signature count).
  const memo = new Map();
  const of = (name, color, extra = {}) => {
    const key = `${name}|${color}|${JSON.stringify(extra)}`;
    let m = memo.get(key);
    if (!m) memo.set(key, (m = std(name, color, extra)));
    return m;
  };
  const emis = (name, color, intensity = 1.1) =>
    of(name, color, { emissive: color, emissiveIntensity: intensity, roughness: 0.45 });
  const glow = (name, color) => {
    const key = `flat|${name}|${color}`;
    let m = memo.get(key);
    if (!m) memo.set(key, (m = flat(name, color)));
    return m;
  };
  return (_crownMat = {
    std, flat, of, emis, glow,
    chrome: std("crown chrome", 0xe8e8ee, { metalness: 1, roughness: 0.12 }),
    // shared, venue-agnostic pieces; anything palette-specific goes through of/emis/glow
    stone:  std("crown hall", 0x14161f),
    trim:   std("crown trim", 0x2a2f3d, { metalness: 0.35, roughness: 0.4 }),
    gold:   std("crown gold", 0xd4af37, { metalness: 0.85, roughness: 0.28 }),
    glass:  std("crown glass", 0x0a1826, { metalness: 0.6, roughness: 0.15 }),
    lot:    std("crown lot", 0x3b3d44, { roughness: 0.9 }),
    stripe: flat("crown lot stripe", 0xd9cf9a),
    tyre:   std("crown tyre", 0x141414, { roughness: 0.98 }),
    carMats: [0x8a1f2b, 0x1f2f4a, 0x2f2f33, 0xd8d2c4, 0x3f5a3a]
      .map((c) => std("crown car", c, { metalness: 0.45, roughness: 0.35 })),
  });
}

/**
 * A neon sign face, fitted to the surface it will fill. `w` / `h` are the face's
 * physical metres; the canvas is built at that ratio (no stretching) and the
 * font is measured and shrunk to fit (no clipping). Returns null without a DOM,
 * which is what the headless build tests get — the caller falls back to a flat
 * colour so buildSet() still runs there.
 */
function crownSignTexture(text, ink, { vertical = false, bg = "#080a12", w = 24, h = 2.9 } = {}) {
  return neonSignTexture({ text, ink, bg, vertical, aspect: aspectOf(w, h) });
}
function crownSignMat(text, ink, opt) {
  return neonSignMaterial({ ...opt, text, ink, kind: "basic", name: `crown sign: ${text}` });
}

/** Local (hall) space to world. `rot` is only ever 0 or π, so this is a sign flip. */
const crownToWorld = (v, lx, lz) => v.rot === 0
  ? { x: v.x + lx, z: v.cz + lz }
  : { x: v.x - lx, z: v.cz - lz };

/** World to local (hall) space — the inverse, for "is the player inside?". */
const crownToLocal = (v, x, z) => v.rot === 0
  ? { x: x - v.x, z: z - v.cz }
  : { x: v.x - x, z: v.cz - z };

export const NORTH_MIN_Z = -440;
const BOUNDS = { x0: -240, x1: 240, z0: -440, z1: -134 };
const CORE = { x0: -180, x1: 180, z0: -410, z1: -140 };
const WILD = { x0: -235, x1: 235, z0: -435, z1: -135 };

export function createTusouxroeNorth(ctx) {
  const { scene, surface, addBlocker, addLitSpot } = ctx;
  const C = createComposer(ctx, {
    name: "TusouxroeNorth",
    bounds: BOUNDS,
    zones: { core: CORE, wild: WILD },
    seed: 90210,
  });

  const ROAD_X = -6;
  const BLVD_Z = -260;
  const WEST_STREET_X = -110;
  const EAST_STREET_X = 110;

  // the named buildings' footprints: the radar draws them, and the filler grid keeps off them
  const LANDMARK_FOOTPRINTS = [
    { x0: -79, x1: -51, z0: BLVD_Z + 11, z1: BLVD_Z + 33 }, // Hospital
    { x0: 50, x1: 70, z0: BLVD_Z + 12, z1: BLVD_Z + 28 },   // Market
    { x0: -53, x1: -37, z0: -187, z1: -173 },              // Garage
    { x0: 38, x1: 52, z0: -186, z1: -174 },               // Cafe
    { x0: WEST_STREET_X - 27, x1: WEST_STREET_X - 9, z0: -217, z1: -203 }, // Fire Station
    { x0: WEST_STREET_X - 34, x1: WEST_STREET_X - 10, z0: -329, z1: -311 }, // School
    { x0: EAST_STREET_X + 9, x1: EAST_STREET_X + 31, z0: -219, z1: -201 }, // Offices
    { x0: EAST_STREET_X + 10, x1: EAST_STREET_X + 26, z0: -326, z1: -314 }, // Apartments
    { x0: ROAD_X - 10, x1: ROAD_X + 10, z0: -410, z1: -390 }, // Cloudline Tower
  ];

  const occluders = [];
  const pois = [];
  const props = [];
  ctx.props = props;

  // The Crown Strip's enterable venues, and the frame state for their cutaway.
  const crownRecs = [];                 // { v, g, roof, walls, sign, fixed, inside }
  let crownPrompt = null;               // the venue whose entrance the player is standing at
  let crownPromptEl = null;             // its DOM chip, made once in buildCrownStrip()
  const WALL_DROP = 0.22;               // walls cut to this fraction while the player is inside

  function addOccluder(x, z, w, d, h = 18) {
    occluders.push({
      minX: x - w / 2, maxX: x + w / 2,
      minY: 0, maxY: h,
      minZ: z - d / 2, maxZ: z + d / 2,
    });
  }

  // ==================== THE CROWN STRIP: BUILD ====================
  /**
   * Four mega-venues down North Ave 2, each with a lit forecourt, one main sign,
   * a gateway arch on US-167 — and an interior you can walk into.
   *
   * These are the strip's first enterable buildings, so every venue group goes
   * into `props`: main.js already excludes `tusouxroeNorth.props` from
   * `batchStatic`, and a cutaway that lifts a roof and scales walls cannot be
   * baked into a static batch. The technique is nightlife.js's, at four times the
   * footprint (see the cutaway in `update()`).
   */
  function buildCrownStrip() {
    const G = crownGeo(), M = crownMat();

    // the prompt chip, as nightlife.js and casinos.js each make their own
    if (typeof document !== "undefined" && !crownPromptEl) {
      const css = document.createElement("style");
      css.textContent = `#crownPrompt { position: fixed; left: 50%; bottom: 200px; transform: translateX(-50%); z-index: 22;
        background: rgba(8,10,18,.9); color: #f4f1ea; font: 600 15px/1.35 system-ui, sans-serif; padding: 8px 16px;
        border-radius: 8px; border: 1px solid #ffd23a; pointer-events: none; }
        #crownPrompt b { color: #ffd23a; }
        body.letterbox #crownPrompt { display: none; }`;
      document.head.appendChild(css);
      crownPromptEl = document.createElement("div");
      crownPromptEl.id = "crownPrompt";
      crownPromptEl.hidden = true;
      document.body.appendChild(crownPromptEl);
    }

    const addMesh = (parent, geo, mat, x, y, z, { cast = false, receive = true, rx = 0, ry = 0, rz = 0 } = {}) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (rx || ry || rz) m.rotation.set(rx, ry, rz);
      m.castShadow = cast; m.receiveShadow = receive;
      parent.add(m);
      return m;
    };

    /** A six-piece silhouette for a lot, not a vehicle: nothing here ever moves. */
    function parkedCar(g, x, z, rot, i) {
      const c = new THREE.Group();
      c.position.set(x, 0, z); c.rotation.y = rot;
      addMesh(c, G.box(1.9, 0.62, 4.3), M.carMats[i % M.carMats.length], 0, 0.62, 0, { cast: true });
      addMesh(c, G.box(1.62, 0.52, 2.1), M.glass, 0, 1.16, -0.25, { cast: true });
      for (const [wx, wz] of [[-0.98, 1.42], [0.98, 1.42], [-0.98, -1.42], [0.98, -1.42]]) {
        addMesh(c, G.cyl(0.34, 0.24), M.tyre, wx, 0.34, wz, { rz: Math.PI / 2 });
      }
      g.add(c);
    }

    // ---- fixtures: a venue's interior is a data list of these ----------------
    // Every builder funnels through `b.add` (a mesh in the venue group) and
    // `b.block` (a collision circle in world space), so collision cannot drift
    // away from the geometry the way a hand-maintained second list would.
    const FIXTURES = {
      partition(b, s) {
        const rot = s.rot ? 1 : 0, len = s.len ?? 8, h = 3.2, t = 0.32;
        b.add(G.box(rot ? t : len, h, rot ? len : t), b.M.of("crown partition", b.v.theme.trim), s.x, h / 2, s.z);
        const n = Math.max(2, Math.round(len / 2.2));
        for (let i = 0; i <= n; i++) {
          const o = (i / n - 0.5) * len;
          b.block(rot ? s.x : s.x + o, rot ? s.z + o : s.z, 0.5);
        }
      },
      slotBank(b, s) {
        const n = s.n ?? 6;
        const body = b.M.of("crown slot body", b.v.theme.interior);
        const lit = b.M.emis("crown slot screen", b.v.theme.accent, 0.9);
        for (let i = 0; i < n; i++) {
          const x = s.x + (i - (n - 1) / 2) * 2.1;
          b.add(G.box(1.0, 1.75, 0.8), body, x, 0.94, s.z);
          b.add(G.box(0.62, 0.4, 0.1), lit, x, 1.34, s.z + 0.45);
          b.block(x, s.z, 0.7);
        }
      },
      gamingTable(b, s) {
        const n = s.n ?? 2, dx = s.dx ?? 5;
        for (let i = 0; i < n; i++) {
          const x = s.x + (i - (n - 1) / 2) * dx;
          b.add(G.cyl(2.1, 0.45), b.M.of("crown table felt", b.v.theme.felt, { roughness: 0.55 }), x, 0.28, s.z);
          b.add(G.torus(2.1, 0.1), b.M.of("crown table rim", b.v.theme.trim, { metalness: 0.8, roughness: 0.25 }), x, 0.52, s.z, { rx: Math.PI / 2 });
          b.add(G.sph(0.3), b.M.emis("crown table lamp", b.v.theme.accent, 1.2), x, 1.5, s.z);
          b.block(x, s.z, 2.1);
          b.lit(x, 2.6, s.z, 26, 12);
        }
      },
      bar(b, s) {
        const rot = s.rot ? 1 : 0, len = s.len ?? 12;
        b.add(G.box(rot ? 1.1 : len, 1.1, rot ? len : 1.1), b.M.of("crown bar wood", 0x3a2418), s.x, 0.55, s.z);
        b.add(G.box(rot ? 1.3 : len + 0.2, 0.08, rot ? len + 0.2 : 1.3), b.M.of("crown bar top", b.v.theme.trim, { metalness: 0.6, roughness: 0.3 }), s.x, 1.14, s.z);
        const bottle = b.M.glow(`crown bottle ${b.v.id}`, b.v.theme.accent);
        const n = Math.max(3, Math.round(len / 1.4));
        for (let i = 0; i < n; i++) {
          const o = (i / (n - 1) - 0.5) * (len - 1.5);
          b.add(G.cyl(0.08, 0.36), bottle, rot ? s.x - 0.95 : s.x + o, 1.45, rot ? s.z + o : s.z - 0.95);
        }
        const bl = Math.max(2, Math.round(len / 2.2));
        for (let i = 0; i <= bl; i++) {
          const o = (i / bl - 0.5) * len;
          b.block(rot ? s.x : s.x + o, rot ? s.z + o : s.z, 0.85);
        }
      },
      stage(b, s) {
        const w = s.w ?? 10, d = s.d ?? 5;
        b.add(G.box(w, 0.6, d), b.M.of("crown stage", b.v.theme.interior, { roughness: 0.25 }), s.x, 0.3, s.z);
        b.add(G.box(w + 0.1, 0.1, 0.1), b.M.emis("crown stage edge", b.v.theme.accent, 1.2), s.x, 0.62, s.z + d / 2 - 0.05);
        b.add(G.box(w * 0.55, 5.4, 0.2), b.M.glow("crown stage back", b.v.theme.accent), s.x, 2.8, s.z - d / 2 - 0.12);
        if (s.poles) {
          for (let i = 0; i < s.poles; i++) {
            const x = s.x + (i - (s.poles - 1) / 2) * (w / (s.poles + 1));
            b.add(G.cyl(0.05, b.H - 0.8), b.M.chrome, x, 0.6 + (b.H - 0.8) / 2, s.z);
          }
        }
        for (let i = 0; i <= 2; i++) b.block(s.x + (i - 1) * (w / 2), s.z, 0.9);
        b.lit(s.x, 4.2, s.z, 70, 16);
      },
      danceFloor(b, s) {
        const w = s.w ?? 16, d = s.d ?? 12;
        b.add(G.plane(w, d), b.M.emis("crown dance floor", b.v.theme.accent, 0.5), s.x, 0.05, s.z, { rx: -Math.PI / 2 });
        for (let i = 1; i < 4; i++) {
          b.add(G.box(w, 0.04, 0.16), b.M.glow("crown floor line", b.v.theme.trim), s.x, 0.08, s.z - d / 2 + (i * d) / 4);
          b.add(G.box(0.16, 0.04, d), b.M.glow("crown floor line", b.v.theme.trim), s.x - w / 2 + (i * w) / 4, 0.08, s.z);
        }
        b.lit(s.x, 2.2, s.z, 55, 20);
      },
      djBooth(b, s) {
        const w = s.w ?? 10, d = s.d ?? 3;
        b.add(G.box(w, 1.2, d), b.M.of("crown dj booth", b.v.theme.interior), s.x, 0.6, s.z);
        b.add(G.box(w * 0.6, 2.6, 0.3), b.M.glow("crown dj screen", b.v.theme.accent), s.x, 2.6, s.z - d / 2 - 0.12);
        for (const sx of [-1, 1]) b.add(G.box(1.2, 2.4, 1.2), b.M.of("crown speaker", 0x111111), s.x + sx * (w / 2 + 1), 1.2, s.z);
        for (let i = 0; i <= 2; i++) b.block(s.x + (i - 1) * (w / 2), s.z, 0.8);
        b.lit(s.x, 3.4, s.z, 40, 12);
      },
      vip(b, s) {
        const w = s.w ?? 10, d = s.d ?? 8;
        const velvet = b.M.of("crown velvet", b.v.theme.felt, { roughness: 0.9 });
        b.add(G.box(w, 0.4, d), b.M.of("crown vip deck", b.v.theme.interior, { roughness: 0.6 }), s.x, 0.2, s.z);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          b.add(G.box(1.6, 0.5, 1.0), velvet, s.x + sx * (w / 2 - 1.8), 0.65, s.z + sz * (d / 2 - 1.2));
          b.add(G.box(0.3, 1.0, 1.0), velvet, s.x + sx * (w / 2 - 1.8), 1.1, s.z + sz * (d / 2 - 1.2));
        }
        b.add(G.cyl(0.06, 0.9), b.M.of("crown gold post", b.v.theme.trim, { metalness: 0.8 }), s.x - w / 2, 0.45, s.z);
        b.block(s.x, s.z, Math.min(w, d) / 2 - 0.4);
        b.lit(s.x, 3.2, s.z, 45, 12);
      },
      seating(b, s) {
        const n = s.n ?? 3, dx = s.dx ?? 6;
        for (let i = 0; i < n; i++) {
          const x = s.x + (i - (n - 1) / 2) * dx;
          b.add(G.cyl(0.9, 0.9), b.M.of("crown table", b.v.theme.interior), x, 0.45, s.z);
          for (const sx of [-1, 0, 1]) b.add(G.cyl(0.28, 0.9), b.M.of("crown stool", b.v.theme.trim), x + sx * 1.4, 0.45, s.z + 1.3);
          b.block(x, s.z, 1.2);
        }
      },
      poolTable(b, s) {
        const n = s.n ?? 2, dx = s.dx ?? 5;
        for (let i = 0; i < n; i++) {
          const x = s.x + (i - (n - 1) / 2) * dx;
          b.add(G.box(1.4, 0.25, 2.6), b.M.of("crown pool body", 0x3a2418), x, 0.85, s.z);
          b.add(G.box(1.2, 0.08, 2.4), b.M.of("crown pool felt", b.v.theme.felt, { roughness: 0.5 }), x, 1.0, s.z);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(G.cyl(0.1, 0.85), b.M.of("crown pool leg", 0x3a2418), x + sx * 0.55, 0.42, s.z + sz * 1.1);
          b.add(G.sph(0.22), b.M.emis("crown pool light", b.v.theme.accent, 1.2), x, 2.0, s.z);
          b.block(x, s.z, 1.6);
        }
      },
      backRoom(b, s) {
        const w = s.w ?? 12, d = s.d ?? 7;
        const mat = b.M.of("crown partition", b.v.theme.trim);
        b.add(G.box(w, 3.2, 0.32), mat, s.x, 1.6, s.z - d / 2);
        b.add(G.box(0.32, 3.2, d), mat, s.x - w / 2, 1.6, s.z);
        b.add(G.box(w * 0.5, 3.2, 0.32), mat, s.x + w / 4, 1.6, s.z + d / 2);
        b.add(G.box(w, 0.1, d), b.M.of("crown backroom floor", b.v.theme.interior, { roughness: 0.9 }), s.x, 0.06, s.z);
        for (let i = 0; i <= 4; i++) b.block(s.x - w / 2 + (i * w) / 4, s.z - d / 2, 0.5);
        for (let i = 0; i <= 3; i++) b.block(s.x - w / 2 + (i * w) / 3, s.z + d / 2, 0.5);
        b.lit(s.x, 2.6, s.z, 30, 10);
      },
      chandelier(b, s) {
        b.add(G.sph(0.55), b.M.emis("crown chandelier", b.v.theme.accent, 1.4), s.x, b.H - 1.4, s.z);
        b.add(G.cyl(0.04, 1.2), b.M.of("crown chain", 0x222222), s.x, b.H - 0.7, s.z);
        b.lit(s.x, b.H - 1.4, s.z, 50, 14);
      },
      discoBall(b, s) {
        const n = s.n ?? 3;
        for (let i = 0; i < n; i++) {
          const x = s.x + (i - (n - 1) / 2) * 4;
          const r = 0.45 + (i % 2) * 0.2;
          b.add(G.sph(r), b.M.chrome, x, b.H - 1.6 - (i % 2) * 0.6, s.z);
          b.add(G.cyl(0.03, 0.9), b.M.of("crown chain", 0x222222), x, b.H - 0.8, s.z);
        }
        b.lit(s.x, b.H - 2, s.z, 40, 16);
      },
    };

    // ---- exterior landmarks: one per venue that earns one --------------------
    const PROPS = {
      /** BILLY JEANS: a very large white performance glove, on the facade. */
      glove(b) {
        const white = b.M.of("crown glove white", 0xf4f7ff,
          { roughness: 0.22, metalness: 0.12, emissive: 0xffffff, emissiveIntensity: 0.35 });
        const seam = b.M.emis("crown glove seam", 0xffffff, 0.9);
        const gg = new THREE.Group();
        gg.position.set(-b.W / 2 + 11, b.H + 6.4, b.FZ - 1.0);
        gg.rotation.set(0, -0.35, 0.16);
        b.g.add(gg);
        const put = (geo, mat, x, y, z, rx = 0) => addMesh(gg, geo, mat, x, y, z, { rx, cast: true });
        put(G.box(5.2, 5.6, 2.3), white, 0, 0, 0);                       // palm
        [-1.75, -0.6, 0.55, 1.7].forEach((x, i) =>                        // four fingers
          put(G.box(1.15, 3.5 - i * 0.35, 2.0), white, x, 4.3 - i * 0.18, 0.1, -0.12 - i * 0.02));
        put(G.box(1.3, 3.1, 1.9), white, -3.2, 1.5, 0.1, 0.55);           // thumb
        put(G.box(5.6, 1.5, 2.7), b.M.of("crown glove cuff", 0x1a1a1a), 0, -3.5, 0);
        put(G.box(5.9, 0.4, 3.0), b.M.of("crown glove gold", b.v.theme.trim, { metalness: 0.9, roughness: 0.2 }), 0, -2.7, 0);
        for (let ix = -2; ix <= 2; ix++) for (let iy = -2; iy <= 1; iy++)  // sequins
          put(G.sph(0.16), seam, ix, iy * 0.9 + 0.2, 1.25);
        for (const sx of [-1, 1]) put(G.box(0.35, 3.4, 0.35), b.M.of("crown glove mount", 0x2a2f3d, { metalness: 0.6 }), sx * 2.2, -6.1, 0);
        const p = crownToWorld(b.v, -b.W / 2 + 11, b.FZ - 0.6);
        addLitSpot({ x: p.x, y: b.H + 6.4, z: p.z, warm: 0xffffff, power: 95, range: 26, fx: false });
      },
      /** HAPPY HOGS: a pig's head over the door, in a bow tie and a neon halo. */
      pig(b) {
        const pink = b.M.of("crown pig pink", 0xff8fb0, { roughness: 0.5, emissive: 0xff4f7a, emissiveIntensity: 0.3 });
        const dark = b.M.of("crown pig dark", 0x5a2030);
        const pg = new THREE.Group();
        pg.position.set(0, b.H + 5.6, b.FZ - 0.8);
        b.g.add(pg);
        const put = (geo, mat, x, y, z, rx = 0, ry = 0) => addMesh(pg, geo, mat, x, y, z, { rx, ry, cast: true });
        put(G.sph(3.4), pink, 0, 0, 0);
        put(G.cyl(1.7, 1.4), pink, 0, -0.7, 3.1, Math.PI / 2);
        put(G.cyl(0.3, 0.2), dark, -0.6, -0.7, 3.85, Math.PI / 2);
        put(G.cyl(0.3, 0.2), dark, 0.6, -0.7, 3.85, Math.PI / 2);
        put(G.cone(1.3, 2.2), pink, -2.4, 2.6, 0, 0, 0.4);
        put(G.cone(1.3, 2.2), pink, 2.4, 2.6, 0, 0, -0.4);
        put(G.sph(0.42), dark, -1.2, 0.9, 2.9);
        put(G.sph(0.42), dark, 1.2, 0.9, 2.9);
        put(G.box(2.4, 0.9, 0.5), b.M.emis("crown pig bowtie", b.v.theme.accent, 1.2), 0, -2.6, 2.7);
        put(G.torus(3.9, 0.2), b.M.emis("crown pig ring", b.v.theme.accent, 1.1), 0, 0, -0.6);
        const p = crownToWorld(b.v, 0, b.FZ - 0.6);
        addLitSpot({ x: p.x, y: b.H + 5.6, z: p.z, warm: 0xff4fb3, power: 85, range: 24, fx: false });
      },
      /** DISCO GATORS: a roof ball, balls along the canopy, neon up the piers. */
      disco(b) {
        addMesh(b.g, G.sph(2.6), b.M.chrome, 0, b.H + 3.6, b.FZ - 4, { cast: true });
        addMesh(b.g, G.cyl(0.1, 3.0), b.M.of("crown chain", 0x222222), 0, b.H + 1.3, b.FZ - 4);
        for (let i = -3; i <= 3; i++) addMesh(b.g, G.sph(0.55), b.M.chrome, i * 3.2, 5.4, b.FZ + 4.6, { cast: true });
        for (const s of [-1, 1]) {
          addMesh(b.g, G.box(0.35, b.H * 0.7, 0.35), b.M.emis("crown neon tube", b.v.theme.accent, 1.3), s * (b.W / 2 - 1.2), b.H * 0.4, b.FZ + 0.12);
          addMesh(b.g, G.box(0.35, b.H * 0.7, 0.35), b.M.emis("crown neon tube 2", b.v.theme.trim, 1.2), s * (b.W / 2 - 2.6), b.H * 0.35, b.FZ + 0.12);
        }
        const p = crownToWorld(b.v, 0, b.FZ + 1.0);
        addLitSpot({ x: p.x, y: 6.0, z: p.z, warm: b.v.theme.accent, power: 80, range: 26, fx: false });
      },
    };

    function buildVenue(v) {
      // NB: `v.fore` is the derived forecourt *rect*; the depth in metres is on
      // `v.k` (see the note in the CROWN mapping above). Same for door/cars.
      const W = v.k.w, D = v.k.d, H = v.k.h, fore = v.k.fore, cars = v.k.cars;
      const FZ = D / 2, gap = v.k.door, T = 0.5;
      const g = new THREE.Group();
      g.position.set(v.x, 0, v.cz);
      g.rotation.y = v.rot;
      scene.add(g);
      // NOTE: the venue group stays a normal scene root so the parish batch sweep
      // still merges its interiors and forecourts. Only the meshes the cutaway
      // moves — the roof group and the outer walls — carry `userData.noBatch`,
      // which merge.js honours per mesh. Mark any future animated mesh the same
      // way; a mesh without it is a meshes-into-the-batch, roof-will-not-lift bug.

      const rec = { v, g, roof: null, walls: [], sign: [], fixed: [], inside: false };
      const wallMat = M.of("crown wall " + v.id, v.theme.wall);
      const trimMat = M.of("crown trim " + v.id, v.theme.trim, { metalness: 0.5, roughness: 0.35 });
      const walls = [];
      const add = (geo, mat, x, y, z, opt = {}) => {
        const m = addMesh(g, geo, mat, x, y, z, opt);
        if (opt.wall) { walls.push(m); m.userData.noBatch = true; }
        return m;
      };

      // ---- shell: back and sides, floor-pivoted so the cutaway drops them ----
      add(G.wall(W, H, T), wallMat, 0, 0, -FZ + T / 2, { cast: true, wall: true });
      add(G.wall(T, H, D), wallMat, -(W / 2 - T / 2), 0, 0, { cast: true, wall: true });
      add(G.wall(T, H, D), wallMat, (W / 2 - T / 2), 0, 0, { cast: true, wall: true });

      // ---- front: stone either side of one entrance, with glazed shopfronts ----
      const sideW = (W - gap) / 2;
      for (const s of [-1, 1]) {
        add(G.wall(sideW, H, T), wallMat, s * (gap + sideW) / 2, 0, FZ - T / 2, { cast: true, wall: true });
        add(G.wall(sideW - 2.4, 4.2, 0.16), M.glass, s * (gap + sideW) / 2, 0.9, FZ + 0.06, { wall: true });
      }

      // ---- the roof group: slab, door header, canopy, fascia and the one sign.
      //      It lifts with the roof, so everything over the entrance is hidden
      //      while you are inside and between the camera and the floor.
      const roof = new THREE.Group();
      g.add(roof);
      rec.roof = roof;
      const head = 5.0;
      const rh = (geo, mat, x, y, z, opt) => {
        const m = addMesh(roof, geo, mat, x, y, z, opt);
        m.userData.noBatch = true;     // it lifts: keep it out of the static batch
        return m;
      };
      rh(G.box(W + 0.9, 0.6, D + 0.9), trimMat, 0, H + 0.3, 0, { cast: true });
      rh(G.box(gap, H - head, T), wallMat, 0, head, FZ - T / 2, { cast: true });
      rh(G.box(gap + 6, 0.5, 4.2), trimMat, 0, head + 0.9, FZ + 2.1, { cast: true });
      rh(G.box(gap + 6, 1.0, 0.3), M.emis("crown fascia " + v.id, v.theme.accent, 1.15), 0, head + 0.5, FZ + 4.1);
      rh(G.box(gap + 6.4, 0.4, 0.4), trimMat, 0, head - 0.15, FZ + 4.1);
      rec.sign.push(rh(G.box(W * 0.72, v.sign.h, 0.3),
        crownSignMat(v.name, v.ink, { w: W * 0.72, h: v.sign.h }), 0, H + 2.1, FZ - 0.2));
      if (v.sign.sub) {
        const sw = W * 0.34;
        rec.sign.push(rh(G.box(sw, 1.1, 0.22), crownSignMat(v.sign.sub, v.ink, { w: sw, h: 1.1 }), 0, H - 0.6, FZ + 0.05));
      }

      // ---- interior: the floor, then the venue's own fixture list ----
      add(G.box(W - 0.8, 0.12, D - 0.8),
        M.of("crown carpet " + v.id, v.theme.interior, { roughness: 0.95 }), 0, 0.06, 0);
      const b = {
        v, g, G, M, W, D, H, FZ, add,
        block: (lx, lz, r) => { const p = crownToWorld(v, lx, lz); addBlocker(p.x, p.z, r); },
        lit: (lx, y, lz, power, range) => {
          const p = crownToWorld(v, lx, lz);
          addLitSpot({ x: p.x, y, z: p.z, warm: v.theme.accent, power, range, fx: false });
        },
      };
      for (const s of v.layout) { const f = FIXTURES[s.fixture]; if (f) f(b, s); }
      for (const p of v.props || []) { const f = PROPS[p]; if (f) f(b); }

      // ---- forecourt: apron, painted bays, parked cars, valet kerbs ----
      const fz = FZ + fore / 2;
      add(G.box(W + 12, 0.06, fore), M.lot, 0, 0.035, fz);
      // The valet row is split either side of the entrance, never across it: an
      // enterable building needs an unbroken path from the kerb to the door.
      const aisle = gap / 2 + 2.4, pitch = 3.0, perSide = Math.max(1, Math.floor(cars / 2));
      const carX = [];
      for (let i = 0; i < perSide; i++) for (const s of [-1, 1]) carX.push(s * (aisle + 1.6 + i * pitch));
      for (const x of carX) add(G.box(0.16, 0.02, 5.0), M.stripe, x, 0.09, FZ + 3.4);
      carX.forEach((x, i) => parkedCar(g, x, FZ + 3.4, i % 2 ? 0.02 : -0.02, i));
      for (const s of [-1, 1]) add(G.cyl(0.18, 1.1), M.gold, s * (W / 2 + 3.2), 0.55, FZ + 1.4, { cast: true });

      // ---- collision: the shell, with the entrance left OPEN so you can walk in.
      //      Circles are spaced so they touch; the front row skips the doorway, and
      //      the door posts stop a car without stopping a person. ----
      const step = 2.4;
      for (let lx = -W / 2; lx <= W / 2 + 0.01; lx += step) {
        let p = crownToWorld(v, lx, -FZ + T / 2);
        addBlocker(p.x, p.z, 1.2);
        if (Math.abs(lx) > gap / 2 + 0.2) {
          p = crownToWorld(v, lx, FZ - T / 2);
          addBlocker(p.x, p.z, 1.2);
        }
      }
      for (let lz = -FZ; lz <= FZ + 0.01; lz += step) {
        for (const s of [-1, 1]) {
          const p = crownToWorld(v, s * (W / 2 - T / 2), lz);
          addBlocker(p.x, p.z, 1.2);
        }
      }
      for (const s of [-1, 1]) {
        const p = crownToWorld(v, s * (gap / 2 + 0.25), FZ - 0.2);
        addBlocker(p.x, p.z, 0.5);
      }
      for (const x of carX) {
        const p = crownToWorld(v, x, FZ + 3.4);
        addBlocker(p.x, p.z, 2.6);
      }
      addOccluder(v.x, v.cz, W, D, H);

      pois.push({ x: v.x, z: v.entranceZ, r: 10, label: v.name });
      pois.push({ x: v.x, z: (v.facadeZ + v.entranceZ) / 2, r: 12 });
      C.minimap.buildings.push(v.hall);

      // ---- light: neon spill on the pavement and under the canopy (fx:false = a
      //      pool light with no beam, so it reads as a lit sign and not a street
      //      lamp), an avenue lamp off the forecourt, and interior spill so the
      //      floor stays lit once the roof lifts. One pole per venue, not a grid:
      //      a grid drops poles inside whatever else the block holds. ----
      const ep = crownToWorld(v, 0, FZ + 1.5);
      addLitSpot({ x: ep.x, y: 6.6, z: ep.z, warm: v.neon, power: 110, range: 32, fx: false });
      addLitSpot({ x: v.x, y: 4.6, z: v.facadeZ - v.side * 0.8, warm: v.theme.accent, power: 55, range: 20, fx: false });
      addLitSpot({ x: v.x, y: 7.5, z: CROWN_AVE_Z + v.side * 7.6, warm: 0xffd6a0, power: 115, range: 28, pole: true });
      for (let i = -1; i <= 1; i++) {
        const p = crownToWorld(v, i * W * 0.28, -D * 0.15);
        addLitSpot({ x: p.x, y: H - 2.2, z: p.z, warm: v.theme.accent, power: 60, range: 22, fx: false });
      }

      rec.walls = walls;
      crownRecs.push(rec);
    }

    // ---- the gate: over US-167, facing south, so the strip announces itself to
    //      anyone driving north out of Chatboro ----
    {
      const gz = CROWN_GATE.z, px = CROWN_GATE.span, gx = CROWN_GATE.x;
      const g = new THREE.Group();
      g.position.set(gx, 0, gz);
      scene.add(g);
      for (const s of [-1, 1]) {
        addMesh(g, G.box(1.7, 9.4, 1.7), M.stone, s * px, 4.7, 0, { cast: true });
        addMesh(g, G.box(2.1, 0.5, 2.1), M.gold, s * px, 9.55, 0, { cast: true });
        addBlocker(ROAD_X + s * px, gz, 1.5);
        addLitSpot({ x: gx + s * px, y: 5.5, z: gz + 1.6, warm: 0xffb31a, power: 70, range: 20, pole: true });
      }
      addMesh(g, G.box(px * 2 + 1.7, 1.9, 0.5), M.trim, 0, 10.6, 0, { cast: true });
      for (const s of [-1, 1]) addMesh(g, G.box(px * 2 - 2, 1.4, 0.18),
        crownSignMat("CROWN STRIP", "#ffcf4a", { w: px * 2 - 2, h: 1.4 }), 0, 10.6, s * 0.36);
      addLitSpot({ x: gx, y: 10.4, z: gz, warm: 0xffb31a, power: 55, range: 26, fx: false });
    }

    for (const v of CROWN) buildVenue(v);
  }

  function buildSet() {
    // ================= STAGE 1: ROAD NETWORK =================
    // (composer.road takes the points array directly; an options object builds nothing)
    // main.js paves US-167 as one plane down the whole map, so this stretch only
    // adds the sidewalks, the centre line and the road grid over it (paved: false).
    C.road("North US-167", [[ROAD_X, -136], [ROAD_X, -420]], { width: 10, paved: false });
    C.road("Tusouxroe Blvd", [[-190, BLVD_Z], [190, BLVD_Z]], { width: 11 }); // -260
    C.road("Civic Center Way", [[WEST_STREET_X, -420], [WEST_STREET_X, -160]], { width: 9 });
    C.road("Industrial Drive", [[EAST_STREET_X, -420], [EAST_STREET_X, -160]], { width: 9 });
    C.road("North Ave 1", [[-190, -200], [190, -200]], { width: 9 });
    C.road("North Ave 2", [[-190, -320], [190, -320]], { width: 9 });
    C.road("North Ave 3", [[-190, -380], [190, -380]], { width: 9 });

    // Road PBR Meshes are now generated by C.road

    // Street Lamps along North US-167 & Tusouxroe Blvd
    for (let z = -150; z >= -410; z -= 24) {
      addLitSpot({ x: ROAD_X + 6.5, y: 4.5, z, warm: 0xffd9a0, power: 95, range: 24, pole: true });
    }
    for (let x = -170; x <= 170; x += 30) {
      if (Math.abs(x - ROAD_X) < 12) continue;
      addLitSpot({ x, y: 4.5, z: BLVD_Z + 6, warm: 0xffe0b0, power: 90, range: 22, pole: true });
    }

    // ================= STAGE 2: FRONTAGE BUILDINGS =================
      // 1. Harborlight Hospital (West Commercial Frontage)
      placeCityBuilding(ctx, "hospital", -65, BLVD_Z + 22, Math.PI);
      // the doors face the boulevard (services.js: walk up, F, full health)
      if (ctx.addService) ctx.addService({ kind: "hospital", name: "Harborlight Hospital", x: -65, z: BLVD_Z + 22 - 11 - 1.8, face: Math.PI });
      addOccluder(-65, BLVD_Z + 22, 28, 22, 16);
      pois.push({ x: -65, z: BLVD_Z + 22, r: 12, label: "Harborlight Hospital" });

      // 2. Freshfield Market (East Commercial Frontage)
      placeCityBuilding(ctx, "market", 60, BLVD_Z + 20, Math.PI);
      addOccluder(60, BLVD_Z + 20, 20, 16, 8);
      pois.push({ x: 60, z: BLVD_Z + 20, r: 10, label: "Freshfield Market" });

      // 3. Mossline Garage & Auto Repair (Southwest Corridor)
      placeCityBuilding(ctx, "garage", -45, -180, 0);
      addOccluder(-45, -180, 16, 14, 7);
      pois.push({ x: -45, z: -180, r: 8, label: "Mossline Garage" });

      // 4. Cornerleaf Cafe (Southeast Corridor)
      placeCityBuilding(ctx, "cafe", 45, -180, 0);
      addOccluder(45, -180, 14, 12, 7);
      pois.push({ x: 45, z: -180, r: 8, label: "Cornerleaf Cafe" });

    // ================= STAGE 3: CIVIC & CORPORATE HUB =================
      // 1. Ember Fire Station (Civic Center Way North)
      placeCityBuilding(ctx, "fire_station", WEST_STREET_X - 18, -210, Math.PI / 2);
      addOccluder(WEST_STREET_X - 18, -210, 18, 15, 10);
      makeDecorativeFence(ctx, WEST_STREET_X - 30, -222, WEST_STREET_X - 6, -222);
      pois.push({ x: WEST_STREET_X - 18, z: -210, r: 9, label: "Fire Station" });

      // 2. Willowbrook School & Campus (Civic Center Way South)
      placeCityBuilding(ctx, "school", WEST_STREET_X - 22, -320, Math.PI / 2);
      addOccluder(WEST_STREET_X - 22, -320, 24, 18, 9);
      makeDecorativeFence(ctx, WEST_STREET_X - 38, -335, WEST_STREET_X - 6, -335);
      pois.push({ x: WEST_STREET_X - 22, z: -320, r: 12, label: "Willowbrook School" });

      // 3. Sageworks Offices & Clutter (Industrial Drive North)
      placeCityBuilding(ctx, "offices", EAST_STREET_X + 20, -210, -Math.PI / 2);
      addOccluder(EAST_STREET_X + 20, -210, 22, 18, 20);
      placeOfficeClutter(ctx, EAST_STREET_X + 10, -200, 0);
      pois.push({ x: EAST_STREET_X + 20, z: -210, r: 11, label: "Sageworks Offices" });

      // 4. Meadow Apartments (Industrial Drive South)
      placeCityBuilding(ctx, "apartments", EAST_STREET_X + 18, -320, -Math.PI / 2);
      addOccluder(EAST_STREET_X + 18, -320, 16, 12, 14);
      pois.push({ x: EAST_STREET_X + 18, z: -320, r: 10, label: "Meadow Apartments" });

      // Gun Shop
      placeGunShop(ctx, EAST_STREET_X + 20, -270, -Math.PI / 2);
      pois.push({ x: EAST_STREET_X + 20, z: -270, r: 12, label: "Bayou Arsenal" });

      // 5. Sunbeam Cottages (Residential Pocket)
      placeCityBuilding(ctx, "cottage", -145, -260, 0);
      placeCityBuilding(ctx, "cottage", 145, -260, Math.PI);
      addOccluder(-145, -260, 12, 10, 6);
      addOccluder(145, -260, 12, 10, 6);
      pois.push({ x: -145, z: -260, r: 6 }, { x: 145, z: -260, r: 6 });

      // Market & Hospital Parking Aprons
      const parkMat = new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.85 });
      parkMat.userData.gtbRealized = true;

      const mLot = new THREE.Mesh(new THREE.PlaneGeometry(36, 28), parkMat);
      mLot.rotation.x = -Math.PI / 2;
      mLot.position.set(60, 0.018, BLVD_Z - 8);
      mLot.receiveShadow = true;
      scene.add(mLot);

      const hLot = new THREE.Mesh(new THREE.PlaneGeometry(42, 32), parkMat);
      hLot.rotation.x = -Math.PI / 2;
      hLot.position.set(-65, 0.018, BLVD_Z - 10);
      hLot.receiveShadow = true;
      scene.add(hLot);

      // Fill grid manually to guarantee dense placement. A shop only goes down
      // where its REAL footprint clears every road and every filler already
      // placed: the pack shops are 32-62 m sites, not the 16 m this grid was
      // drawn for, and on the old rows (z -210 and -315, 10 m and 5 m off North
      // Ave 1 and 2) their roofs and canopies lay across the avenues. The rows
      // now run down the middle of the blocks.
      const customShops = [          // w along x, d along z at rot 0, metres
        { place: placeTacos, w: 8, d: 5 },
        { place: placeBurgerPiz, w: 32, d: 49 },
        { place: placeSixTwelve, w: 48, d: 52 },
        { place: placeGasStation, w: 46, d: 63 },
        { place: placeGunShop, w: 16, d: 18 },
      ];
      const roads = [
        { x0: ROAD_X - 5, x1: ROAD_X + 5, z0: -420, z1: -136 },
        { x0: -190, x1: 190, z0: BLVD_Z - 5.5, z1: BLVD_Z + 5.5 },
        ...[-200, -320, -380].map((rz) => ({ x0: -190, x1: 190, z0: rz - 4.5, z1: rz + 4.5 })),
        ...[WEST_STREET_X, EAST_STREET_X].map((rx) => ({ x0: rx - 4.5, x1: rx + 4.5, z0: -420, z1: -160 })),
      ];
      const placed = [
        ...LANDMARK_FOOTPRINTS,
        ...CROWN.flatMap((c) => [c.hall, c.fore]),   // the Crown Strip keeps its own ground
        { x0: EAST_STREET_X + 13, x1: EAST_STREET_X + 31, z0: -278, z1: -262 },   // gun shop + its billboard
        { x0: -151, x1: -139, z0: -265, z1: -255 }, { x0: 139, x1: 151, z0: -265, z1: -255 },   // cottages
        { x0: 42, x1: 78, z0: BLVD_Z - 22, z1: BLVD_Z + 6 },     // market lot
        { x0: -86, x1: -44, z0: BLVD_Z - 26, z1: BLVD_Z + 6 },   // hospital lot
      ];
      const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
      const footprint = (x, z, w, d, rot) => {
        const [hw, hd] = rot ? [d / 2, w / 2] : [w / 2, d / 2];
        return { x0: x - hw, x1: x + hw, z0: z - hd, z1: z + hd };
      };
      const fits = (f) => {
        const m = { x0: f.x0 - 1, x1: f.x1 + 1, z0: f.z0 - 1, z1: f.z1 + 1 };   // a metre of kerb
        return !roads.some((r) => overlaps(m, r)) && !placed.some((p) => overlaps(m, p));
      };
      for (const z of [-230, -290, -350]) {
        for (let x = -200; x <= 200; x += 30) {
          // Skip if too close to main roads (North US-167 / Tusouxroe Blvd)
          if (Math.abs(x - ROAD_X) < 18) continue;
          if (Math.abs(z - BLVD_Z) < 22) continue;
          
          // Skip if too close to manual landmarks
          if (Math.hypot(x - (-65), z - (BLVD_Z + 22)) < 30) continue;
          if (Math.hypot(x - (60), z - (BLVD_Z + 20)) < 30) continue;
          if (Math.hypot(x - (-45), z - (-180)) < 25) continue;
          if (Math.hypot(x - (45), z - (-180)) < 25) continue;

          // Skip if falling on Civic Center Way or Industrial Drive
          if (Math.abs(x - WEST_STREET_X) < 14) continue;
          if (Math.abs(x - EAST_STREET_X) < 14) continue;

          const rots = (Math.random() > 0.5) ? [0, Math.PI / 2] : [Math.PI / 2, 0];

          if (Math.random() < 0.6) {
            // Place a high-quality 3D asset shop, turned whichever way fits
            const shop = customShops[Math.floor(Math.random() * customShops.length)];
            const rot = rots.find((r) => fits(footprint(x, z, shop.w, shop.d, r)));
            if (rot !== undefined) {
              const f = footprint(x, z, shop.w, shop.d, rot);
              shop.place(ctx, x, z, rot);
              placed.push(f);
              C.minimap.buildings.push(f);
              continue;
            }
          }
          // Place a procedural fallback building (also where the shop didn't fit)
          const types = ["apartments", "offices", "garage", "cafe"];
          const kind = types[Math.floor(Math.random() * types.length)];
          const spec = CITY_BUILDING_TYPES[kind];
          const f = footprint(x, z, spec.w, spec.d, rots[0]);
          if (!fits(f)) continue;
          placeCityBuilding(ctx, kind, x, z, rots[0]);
          addOccluder(x, z, f.x1 - f.x0, f.z1 - f.z0, spec.h);
          placed.push(f);
          C.minimap.buildings.push(f);
        }
      }

      // Parked cars in Market lot
      placeParkedCar(ctx, "beatall", 55, BLVD_Z - 12, Math.PI / 2);
      placeParkedCar(ctx, "doclorean", 65, BLVD_Z - 4, -Math.PI / 2);
      placeParkedCar(ctx, "toyoyo", 60, BLVD_Z - 20, Math.PI / 2);

      // Parked cars in Hospital lot
      placeParkedCar(ctx, "landyroamer", -60, BLVD_Z - 15, -Math.PI / 2);
      placeParkedCar(ctx, "tristar", -70, BLVD_Z - 5, Math.PI / 2);

      // Street Clutter & Billboards throughout commercial zones
      placeBillboard(ctx, ROAD_X - 16, -200, Math.PI / 2, "NORTH BAYOU PLAZA");
      placeBillboard(ctx, ROAD_X + 16, -340, -Math.PI / 2, "CALYPSO DOCKS HIGHWAY");

      placeStreetClutter(ctx, WEST_STREET_X - 6, -180, 0);
      placeStreetClutter(ctx, EAST_STREET_X + 6, -180, Math.PI);
      placeStreetClutter(ctx, 60, BLVD_Z - 20, Math.PI / 2);
      placeStreetClutter(ctx, -65, BLVD_Z - 22, -Math.PI / 2);

      // ================= STAGE 3b: THE CROWN STRIP =================
      // Casinos and nightlife on North Ave 2 — see the note at the top of the file.
      buildCrownStrip();

    // ================= STAGE 5: VEGETATION =================
      // Natural tree clusters framing the district boundaries
      const pineGeo = new THREE.ConeGeometry(2.2, 7.5, 5);
      const pineMat = new THREE.MeshStandardMaterial({ color: 0x2d4a2b, roughness: 0.9 });
      pineMat.userData.gtbRealized = true;

      const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 2.5, 5);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.95 });
      trunkMat.userData.gtbRealized = true;

      for (let i = 0; i < 90; i++) {
        const side = i % 2 ? -1 : 1;
        const tx = side * (135 + Math.random() * 80);
        const tz = -140 - Math.random() * 280;
        if (inCrownRect(CROWN_RECT, tx, tz)) continue;   // the Crown Strip keeps its own ground
        
        const g = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1.25;
        const top = new THREE.Mesh(pineGeo, pineMat);
        top.position.y = 5.0;
        top.castShadow = true;
        g.add(trunk, top);
        g.position.set(tx, 0, tz);
        scene.add(g);
        if (addBlocker) addBlocker(tx, tz, 1.2);
      }

    // ================= STAGE 6: LANDMARK ANCHOR =================
      // Cloudline Tower closes the northern view up US-167!
      placeCityBuilding(ctx, "tower", ROAD_X, -400, 0);
      addOccluder(ROAD_X, -400, 20, 20, 36);
      pois.push({ x: ROAD_X, z: -400, r: 14, label: "Cloudline Tower" });

      // Landmark plaza surround & decorative fences
      makeDecorativeFence(ctx, ROAD_X - 18, -388, ROAD_X + 18, -388);
      placeOfficeClutter(ctx, ROAD_X, -384, 0);
  }

  return {
    bounds: BOUNDS,
    occluders,
    pois,
    props,
    crown: CROWN_STRIP,          // the casino/nightlife row, as data (see CROWN_STRIP)

    /** The venue the player is standing in, or null (QA, and future interiors). */
    get insideVenue() { return crownRecs.find((r) => r.inside)?.v.name ?? null; },

    /**
     * QA: the cutaway's state, per venue. `roofVisible:false` and a `wallScale`
     * near 0.22 is the open, walk-in state; `true` / `1` is a sealed building.
     */
    get crownDebug() {
      return crownRecs.map((r) => ({
        name: r.v.name,
        inside: r.inside,
        roofVisible: r.roof ? r.roof.visible : null,
        wallScale: r.walls.length ? r.walls.reduce((m, w) => Math.max(m, w.scale.y), 0) : null,
      }));
    },

    /**
     * Radar badges, one per venue door. `minimap.js` already has `casino` and
     * `club` badge kinds; main.js's blip loop has to call this for it to appear
     * (see the integration note on TASK-070).
     */
    blips() {
      return CROWN.map((v) => {
        const p = crownToWorld(v, 0, v.d / 2 + 2);
        return { kind: v.kind === "casino" ? "casino" : "club", x: p.x, z: p.z };
      });
    },

    /** F pressed: a line about the venue you are standing at the door of, or false. */
    interact() {
      if (!crownPrompt) return false;
      if (ctx.flashObjective) ctx.flashObjective(`${crownPrompt.v.name} — ${crownPrompt.v.blurb}`);
      return true;
    },

    /**
     * Distance culling, as East Bank and West Parish already had it. Without this
     * the composer's clusters were never hidden: 7,313 meshes drew from anywhere on
     * the map, at every camera, forever. Then the Crown Strip's cutaway.
     *
     * Standing inside a mega-venue lifts its roof group — the slab, the door
     * header, the canopy, the fascia and its one name sign — and drops the outer
     * walls to knee height, which is nightlife.js's technique for a club, at four
     * times the footprint. Nothing else toggles per frame: interior light is baked
     * into `litSpots` at build time, so no light is ever created or hidden here
     * (AGENT_PROTOCOL §6 forbids exactly that).
     */
    update(dt, playerPos) {
      C.update(dt, ctx.camera ? ctx.camera.position : playerPos);
      if (!playerPos) return;

      crownPrompt = null;
      for (const r of crownRecs) {
        const v = r.v;
        const l = crownToLocal(v, playerPos.x, playerPos.z);
        const isIn = Math.abs(l.x) < v.w / 2 - 0.4 && Math.abs(l.z) < v.d / 2 - 0.4;
        r.inside = isIn;
        r.roof.visible = !isIn;
        for (const m of r.walls) m.scale.y += ((isIn ? WALL_DROP : 1) - m.scale.y) * Math.min(1, dt * 7);
        for (const m of r.fixed) m.visible = !isIn;
        // at the door, on the street side: offer the venue's line (F)
        if (!isIn && Math.abs(l.x) < v.door / 2 + 1.6 && Math.abs(l.z - v.d / 2) < 5) crownPrompt = r;
      }
      if (crownPromptEl) {
        crownPromptEl.hidden = !crownPrompt;
        if (crownPrompt) crownPromptEl.innerHTML = `<b>F</b> · ${crownPrompt.v.name} — ${crownPrompt.v.blurb}`;
      }
    },

    lanes: [
      { name: "northbound-ext", points: [[ROAD_X + 2.4, -136], [ROAD_X + 2.4, -400]], cruise: [14, 20] },
      { name: "southbound-ext", points: [[ROAD_X - 2.4, -400], [ROAD_X - 2.4, -136]], cruise: [14, 20] },
      { name: "blvd-eastbound", points: [[-180, BLVD_Z - 2.4], [180, BLVD_Z - 2.4]], cruise: [12, 18] },
      { name: "blvd-westbound", points: [[180, BLVD_Z + 2.4], [-180, BLVD_Z + 2.4]], cruise: [12, 18] },
    ],
    zoneAt(x, z) {
      if (x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1) return null;
      // The Crown Strip first: "building" over a hall means nobody spawns inside a
      // casino (spawnzones.js has no mix for it), "entertainment" over the
      // forecourts and the avenue is the parish's nightlife crowd.
      if (inCrownRect(CROWN_RECT, x, z)) {
        for (const c of CROWN) if (inCrownRect(c.hall, x, z)) return "building";
        return "entertainment";
      }
      if (Math.abs(z - BLVD_Z) < 25) return "corporate";
      if (Math.abs(x - WEST_STREET_X) < 35 || Math.abs(x - EAST_STREET_X) < 35) return "industrial";
      if (Math.hypot(x - ROAD_X, z - (-400)) < 40) return "urban";
      return "forest";
    },
    get minimap() {
      return {
        roads: [
          { points: [[ROAD_X, -136], [ROAD_X, -410]], width: 10, color: "#cfcab8" },
          { points: [[-180, BLVD_Z], [180, BLVD_Z]], width: 10, color: "#cfcab8" },
          { points: [[WEST_STREET_X, -380], [WEST_STREET_X, -160]], width: 8 },
          { points: [[EAST_STREET_X, -380], [EAST_STREET_X, -160]], width: 8 },
          ...C.minimap.roads
        ],
        buildings: [...LANDMARK_FOOTPRINTS, ...C.minimap.buildings],
        areas: [
          ...C.minimap.areas,
          { x0: CORE.x0, x1: CORE.x1, z0: CORE.z0, z1: CORE.z1, color: "#2d332d" },
          { ...CROWN_RECT, color: "#3a2440" },          // the Crown Strip reads as its own block
        ],
        water: C.minimap.water,
      };
    },
    buildSet,
  };
}
