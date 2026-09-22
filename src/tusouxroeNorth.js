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
// The interior kit: the fixtures and exterior props a venue is assembled from, and
// the geometry/material caches they share. A venue is a data list below; the
// furniture lives in interiors.js so the next venue (or the next district) is an
// entry there, not another few hundred lines here.
import { FIXTURES, PROPS, makeGeoCache, makeKit, instanced } from "./interiors.js";

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
    // 56 × 30 m. The floor plan is a casino's: a spine from the door to the
    // vault, machine banks either side of it, the pit behind, the VIP deck and
    // the lounge off the entrance. Everything below leaves a lane; the QA build
    // test flood-fills the blockers from the door to prove it.
    layout: [
      // grand entrance: carpet up the spine, lounge to one side, cage to the other
      { fixture: "runner", x: 0, z: 9, w: 9, d: 10 },
      { fixture: "cashier", x: 17, z: 11, w: 10, d: 2.6 },
      { fixture: "lounge", x: -18, z: 11, n: 1, dx: 10 },
      // four banks of slots, facing across the spine in two rows each side
      { fixture: "slotBank", x: -15, z: 4, n: 8, pitch: 2.2 },
      { fixture: "slotBank", x: -15, z: -1, n: 8, pitch: 2.2 },
      { fixture: "slotBank", x: 15, z: 4, n: 8, pitch: 2.2 },
      { fixture: "slotBank", x: 15, z: -1, n: 8, pitch: 2.2 },
      // the pit: two roulette wheels, a row of blackjack tables behind them
      { fixture: "roulette", x: -21, z: -8 },
      { fixture: "roulette", x: -13, z: -8 },
      { fixture: "cardTable", x: -19, z: -13, w: 3.2 },
      { fixture: "cardTable", x: -13, z: -13, w: 3.2 },
      // high rollers, the long bar, and the back of the house
      { fixture: "vipDeck", x: 18, z: -4, w: 14, d: 6 },
      { fixture: "barBig", x: 17, z: -11, len: 12 },
      { fixture: "desk", x: -7, z: -12.5, n: 2, dx: 5 },
      { fixture: "vault", x: 0, z: -14 },
      // structure, and the neon name over the vault end
      { fixture: "columns", x: 0, z: 0, n: 2, dx: 16, dz: 22 },
      { fixture: "chandelier", x: 0, z: 7 },
      { fixture: "chandelier", x: 0, z: -4 },
      { fixture: "neonBrand", x: 0, y: 11, z: -14.4, w: 20, text: "BAYOU GOLD" },
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
    // The same 56 × 30 m shell as the casino next door, and nothing like it
    // inside: a long bar down one wall, booths and pool tables, and a stage the
    // whole room faces. Backstage and the office are behind it.
    layout: [
      { fixture: "runner", x: 0, z: 9, w: 8, d: 10 },
      // the bar: one long counter down the left wall, stools on the room side
      { fixture: "barBig", x: -16, z: -2, len: 16 },
      // booths on the near left, pool tables on the near right
      { fixture: "booths", x: -16, z: 5, n: 3, dx: 5 },
      { fixture: "poolTable", x: 16, z: 6, n: 2, dx: 6 },
      { fixture: "lounge", x: -19, z: 11, n: 1, dx: 10 },
      // the stage end: deck, cans, PA stacks flanking it
      { fixture: "stage", x: 14, z: -11, w: 14, d: 6, rise: 0.8 },
      { fixture: "speakers", x: 5, z: -9, n: 2, dx: 3 },
      // back of house: dressing room, office, and pictures over it
      { fixture: "dressingRoom", x: -16, z: -11, w: 11, d: 5 },
      { fixture: "desk", x: -6, z: -12.5, n: 2, dx: 5 },
      { fixture: "decorWall", x: -6, y: 8.4, z: -14.4, n: 4, dx: 4 },
      { fixture: "columns", x: 0, z: 0, n: 2, dx: 18, dz: 14 },
      { fixture: "chandelier", x: 0, z: 6 },
      { fixture: "neonBrand", x: 14, y: 10.2, z: -14.4, w: 16, text: "BILLY JEANS" },
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
    // The biggest room on the strip, and the one built to be seen from inside:
    // a lighting deck for a floor, the DJ at the back of it, bars down both
    // walls, the VIP deck behind one and the stage behind the other.
    layout: [
      // in past the rope line, onto the floor
      { fixture: "runner", x: 0, z: 10.5, w: 10, d: 7 },
      { fixture: "rail", x: 0, z: 7, n: 5, dx: 4 },
      { fixture: "danceFloor", x: 0, z: 0, w: 20, d: 13 },
      // the DJ end: booth, screens, PA stacks either side, mirror balls over it
      { fixture: "djBooth", x: 0, z: -11, w: 12, d: 3 },
      { fixture: "speakers", x: 0, z: -13, n: 2, dx: 18 },
      // two long bars, VIP, and the live stage
      { fixture: "barBig", x: -20, z: 4, rot: 1, len: 14 },
      { fixture: "barBig", x: 20, z: 2, rot: 1, len: 14 },
      { fixture: "vipDeck", x: -16, z: -10, w: 13, d: 7 },
      { fixture: "stage", x: 19, z: -12, w: 12, d: 5, rise: 0.9 },
      { fixture: "lounge", x: -15, z: 8, n: 1, dx: 10 },
      // structure and the mirror balls (emissive panel lighting, not real lights)
      { fixture: "columns", x: 0, z: 0, n: 2, dx: 26 },
      { fixture: "columns", x: 0, z: -8, n: 2, dx: 20 },
      { fixture: "discoBall", x: 0, z: 0, n: 3, dx: 5 },
      { fixture: "discoBall", x: 0, z: -7, n: 2, dx: 6 },
      { fixture: "neonBrand", x: 0, y: 12.5, z: -13.6, w: 20, text: "DISCO GATORS" },
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
    // A working show room rather than a generic club: the stage is the room, the
    // bars sit either side of it, private rooms and the dressing room are behind.
    layout: [
      { fixture: "runner", x: 0, z: 10, w: 8, d: 7 },
      // the main stage, with its poles and the rail along the front of it
      { fixture: "stage", x: -6, z: -9, w: 14, d: 5, poles: 3, rise: 0.7 },
      { fixture: "rail", x: -6, z: -5, n: 4, dx: 4 },
      // audience: a lounge on the floor, booths on the wings
      { fixture: "lounge", x: 0, z: 3, n: 1, dx: 10 },
      { fixture: "booths", x: -16, z: 10, n: 2, dx: 5 },
      { fixture: "booths", x: 16, z: 8, n: 2, dx: 5 },
      // two bars, private rooms and backstage
      { fixture: "barBig", x: -20, z: 1, rot: 1, len: 12 },
      { fixture: "barBig", x: 18, z: 0, rot: 1, len: 12 },
      { fixture: "privateRoom", x: -17, z: -10, w: 8, d: 5, name: "CHAMPAGNE" },
      { fixture: "dressingRoom", x: 13, z: -10, w: 14, d: 5 },
      { fixture: "columns", x: 0, z: 0, n: 2, dx: 28 },
      { fixture: "discoBall", x: 0, z: -2, n: 2, dx: 6 },
      { fixture: "neonBrand", x: -6, y: 10.6, z: -12.6, w: 18, text: "HAPPY HOGS" },
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

// Geometry and materials come from the shared kit (src/interiors.js) so the
// district and the furniture inside it cannot drift apart — one cache, one
// implementation — plus the few pieces only a street needs: asphalt, kerbs,
// tyres and car paint. Per-venue palettes go through the kit's memoised of/emis/
// glow factories, so four mega-venues do not mean four hundred materials.
let _crownGeo = null, _crownMat = null;
function crownGeo() {
  return (_crownGeo ??= makeGeoCache());
}
function crownMat() {
  if (_crownMat) return _crownMat;
  const kit = makeKit();
  const { std, flat } = kit;
  return (_crownMat = {
    ...kit,
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
  let crownPrompt = null;               // { v, text } — the venue you are at, and the line F prints
  let crownPromptEl = null;             // its DOM chip, made once in buildCrownStrip()
  const WALL_DROP = 0.22;               // walls cut to this fraction while the player is inside
  const STATION_REACH = 3.4;            // how close counts as "at" a game, a bar, a stage

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
    // The builders themselves are the shared interior kit (src/interiors.js,
    // imported at the top); this district only says *which* and *where*. Every
    // builder funnels through `b.add` (a mesh in the venue group) and `b.block`
    // (a collision circle in world space), so collision cannot drift away from the
    // geometry the way a hand-maintained second list would.

    // ---- exterior landmarks: one per venue that earns one --------------------
    // Also the shared kit (below, via `v.props`): a glove, a pig's head and a roof
    // mirror ball hang off a facade the same way wherever that facade stands.

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

      const rec = { v, g, roof: null, walls: [], sign: [], fixed: [], stations: [], inside: false };
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
      /**
       * The kit's interface (interiors.js): the hall's dimensions, the shared
       * caches, and the four things a fixture is allowed to do — place a mesh, a
       * collision circle, a pooled light, or a spot the player can walk up to and
       * press F at. Everything a fixture gets is scoped to this venue, so a
       * builder in the kit cannot reach outside the hall it was handed.
       */
      const b = {
        v, g, G, M, W, D, H, FZ, add,
        inst: (geo, mat, list, opt) => instanced(g, geo, mat, list, opt),
        // the kit names its materials venue-agnostically ("slot body"); the
        // district prefixes them ("crown slot body") so every strip material is
        // recognisable in a dump — the memo still shares one across all four
        // halls when the colour matches, which is the point of the prefix
        m: (name, color, extra) => M.of(`crown ${name}`, color, extra),
        e: (name, color, intensity) => M.emis(`crown ${name}`, color, intensity),
        gl: (name, color) => M.glow(`crown ${name}`, color),
        sign: (text, ink, o) => add(G.box(o.w, o.h, 0.16), crownSignMat(text, ink, { w: o.w, h: o.h }),
          o.x, o.y, o.z, { ry: o.ry || 0 }),
        block: (lx, lz, r) => { const p = crownToWorld(v, lx, lz); addBlocker(p.x, p.z, r); },
        lit: (lx, y, lz, power, range) => {
          const p = crownToWorld(v, lx, lz);
          addLitSpot({ x: p.x, y, z: p.z, warm: v.theme.accent, power, range, fx: false });
        },
        station: (lx, lz, kind, label) => {
          const p = crownToWorld(v, lx, lz);
          rec.stations.push({ kind, label, x: p.x, z: p.z });
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
     * QA: every interior interaction point, in world space — the games, the cage,
     * the bars, the stages. The build test flood-fills each one from the door, so
     * a furniture change that seals a lane fails there rather than in the browser.
     */
    get crownStations() {
      return crownRecs.flatMap((r) => r.stations.map((s) => ({ venue: r.v.name, kind: s.kind, x: s.x, z: s.z })));
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

    /**
     * F pressed: the venue's line at the door, or the name of whatever you are
     * standing at inside — a game, the cage, the bar, the stage. The existing
     * objective channel, so no new framework: `crownPrompt` is only ever set while
     * the prompt chip is up, which is the same rule the door already used.
     */
    interact() {
      if (!crownPrompt) return false;
      if (ctx.flashObjective) ctx.flashObjective(crownPrompt.text);
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
      let near = null, nearD = STATION_REACH;
      for (const r of crownRecs) {
        const v = r.v;
        const l = crownToLocal(v, playerPos.x, playerPos.z);
        const isIn = Math.abs(l.x) < v.w / 2 - 0.4 && Math.abs(l.z) < v.d / 2 - 0.4;
        r.inside = isIn;
        r.roof.visible = !isIn;
        for (const m of r.walls) m.scale.y += ((isIn ? WALL_DROP : 1) - m.scale.y) * Math.min(1, dt * 7);
        for (const m of r.fixed) m.visible = !isIn;
        if (isIn) {
          // inside: the nearest thing worth walking up to (the games, the cage,
          // the bar, the stage) wins over the door line
          for (const st of r.stations) {
            const d = Math.hypot(playerPos.x - st.x, playerPos.z - st.z);
            if (d < nearD) { nearD = d; near = { v, text: st.label }; }
          }
        } else if (Math.abs(l.x) < v.door / 2 + 1.6 && Math.abs(l.z - v.d / 2) < 5) {
          crownPrompt = { v, text: `${v.name} — ${v.blurb}` };
        }
      }
      if (near) crownPrompt = near;
      if (crownPromptEl) {
        crownPromptEl.hidden = !crownPrompt;
        if (crownPrompt) crownPromptEl.innerHTML = `<b>F</b> · ${crownPrompt.text}`;
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
