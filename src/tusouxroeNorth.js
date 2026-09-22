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
//   3b the strip    THE CROWN STRIP: five casinos and nine bars and clubs along
//                   North Ave 2 either side of US-167 (exteriors — see below).
//   4 open areas    Hospital plaza, Supermarket parking lot, Fire Station yard,
//                   School athletic field, and parking aprons.
//   5 vegetation    Pines & cypress trees clustering naturally along boundaries.
//   6 landmark      Cloudline Tower at (x = -6, z = -400) closing the north view.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { createComposer } from "./composer.js";
import { CITY_BUILDING_TYPES, placeCityBuilding, makeDecorativeFence, placeOfficeClutter, placeStreetClutter, placeBillboard, placeParkedCar, placeGunShop, placeTacos, placeBurgerPiz, placeSixTwelve, placeGasStation } from "./landmarks.js";

// ---------------------------------------------------------------------------
// THE CROWN STRIP — North Tusouxroe's casino and nightlife row.
//
// Five casinos and nine bars and clubs, fronting North Ave 2 (z = -320) on both
// sides, either side of US-167. The gateway arch over US-167 at z = -310 faces
// south, so the strip announces itself to anyone driving up out of Chatboro.
//
// Exteriors for now (the human's call, 2026-09-22): every venue is a dressed,
// lit facade with an open doorway you can see through — carpet, slot bank,
// chandelier, bar — and a queue barrier across the door. The follow-up that
// makes these walk-in should install a floor plan inside the shell, not re-cut a
// sealed one, so `CROWN` carries each hall's world rect, facade line and
// forecourt. The technique for the interiors already exists in nightlife.js:
// lift the roof, drop the walls to knee height, hand the floor to a counter loop.
//
// Nothing here moves, so the strip is added straight to the scene rather than
// into a composer cluster: main.js's `moving` set excludes the district cluster
// groups from the parish-wide batchStatic sweep, and fourteen venues is far too
// many meshes to leave drawing one at a time (see the AGENT_LOG note).
// ---------------------------------------------------------------------------
const CROWN_AVE_Z = -320;      // North Ave 2 — the avenue the strip fronts
const CROWN_HALF = 6.1;        // its half-width including both sidewalks (9 m road + 1.6 m kerbs)

/** Hall sizes in metres, `fore` = forecourt depth, front on local +z. */
const CROWN_KINDS = {
  casino: { w: 26, d: 20, h: 11.0, fore: 14, cars: 4, door: 5.0 },
  club:   { w: 15, d: 16, h:  9.5, fore:  9, cars: 0, door: 4.0 },
  bar:    { w: 12, d: 13, h:  7.5, fore:  8, cars: 0, door: 3.5 },
};

/**
 * The row. `side` is which terrace it sits on — -1 is the far (north) side of the
 * avenue, +1 the near side, so every front looks across the traffic at the other.
 * `x` slots keep clear of US-167 (x = -6), Civic Center Way (x = -110) and
 * Industrial Drive (x = 110) and their kerbs.
 */
const CROWN_VENUES = [
  { name: "PELICAN CROWN CASINO", kind: "casino", side: -1, x: -40,  neon: 0xffb31a, ink: "#ffcf4a" },
  { name: "BAYOU GOLD",           kind: "casino", side: -1, x: -84,  neon: 0xffd23a, ink: "#ffe066" },
  // x = -176, not -144: Willowbrook School stands across x -144..-120 and its
  // own footprint already straddles North Ave 2 (a pre-existing layout bug in
  // this district, logged for its owner). The west terrace splits around it.
  { name: "MOONLIGHT CASINO",     kind: "casino", side: -1, x: -176, neon: 0x7aa7ff, ink: "#9dbcff" },
  { name: "NEON BAYOU",           kind: "club",   side: -1, x: 26,   neon: 0xff2e93, ink: "#ff5cb8" },
  { name: "CLUB SAPPHIRE",        kind: "club",   side: -1, x: 78,   neon: 0x4d7dff, ink: "#7aa7ff" },
  { name: "LE BON TEMPS",         kind: "club",   side: -1, x: 132,  neon: 0x20d9a8, ink: "#5cf0d0" },
  { name: "THE HONEYDRIPPER",     kind: "club",   side: -1, x: 158,  neon: 0xb28cff, ink: "#c9aaff" },
  { name: "GATOR'S FORTUNE",      kind: "casino", side:  1, x: -84,  neon: 0x3affc2, ink: "#7affd8" },
  { name: "THE VELVET MAGNOLIA",  kind: "casino", side:  1, x: -176, neon: 0xff4fb3, ink: "#ff7ac8" },
  { name: "HONEYSUCKLE",          kind: "bar",    side:  1, x: -40,  neon: 0xffb31a, ink: "#ffcf4a" },
  { name: "THE BRASS ALLIGATOR",  kind: "bar",    side:  1, x: 26,   neon: 0x2ee6d6, ink: "#5cf0e2" },
  { name: "MIDNIGHT SPECIAL",     kind: "club",   side:  1, x: 78,   neon: 0xff8a2e, ink: "#ffab5c" },
  { name: "THE PELICAN ROOM",     kind: "bar",    side:  1, x: 132,  neon: 0xffd23a, ink: "#ffe066" },
  { name: "THE STILT",            kind: "bar",    side:  1, x: 158,  neon: 0x9b5de5, ink: "#b98cf0" },
];

/**
 * Every venue resolved to world space — pure maths, so zoneAt() and the pine
 * pass can read it without buildSet() having run. A front faces the avenue, so
 * `rot` is 0 on the north terrace and π on the near one (models face local +z).
 */
const CROWN = CROWN_VENUES.map((v) => {
  const k = CROWN_KINDS[v.kind];
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
  return (_crownGeo = { box, cyl, sph });
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
  return (_crownMat = {
    std, flat,
    stone:  std("crown hall", 0x14161f),
    deep:   std("crown hall deep", 0x0d0f16),
    trim:   std("crown trim", 0x2a2f3d, { metalness: 0.35, roughness: 0.4 }),
    gold:   std("crown gold", 0xd4af37, { metalness: 0.85, roughness: 0.28 }),
    glass:  std("crown glass", 0x0a1826, { metalness: 0.6, roughness: 0.15 }),
    carpet: std("crown carpet", 0x2a1430, { roughness: 0.95 }),
    lot:    std("crown lot", 0x3b3d44, { roughness: 0.9 }),
    stripe: flat("crown lot stripe", 0xd9cf9a),
    felt:   std("crown felt", 0x12613f, { roughness: 0.55 }),
    tyre:   std("crown tyre", 0x141414, { roughness: 0.98 }),
    rope:   std("crown rope", 0x9c1f3c, { roughness: 0.85 }),
    carMats: [0x8a1f2b, 0x1f2f4a, 0x2f2f33, 0xd8d2c4, 0x3f5a3a]
      .map((c) => std("crown car", c, { metalness: 0.45, roughness: 0.35 })),
  });
}

/**
 * A neon sign face. Returns null without a DOM, which is what the headless build
 * test (test_buildset.mjs, plain node) gets — the caller falls back to a flat
 * colour so buildSet() still runs there.
 */
function crownSignTexture(text, ink, { vertical = false, bg = "#080a12" } = {}) {
  if (typeof document === "undefined") return null;
  const w = vertical ? 256 : 1024, h = vertical ? 1024 : 256;
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const x = c.getContext("2d");
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.textAlign = "center"; x.textBaseline = "middle";
  x.fillStyle = ink;
  x.shadowColor = ink; x.shadowBlur = 30;
  if (vertical) {
    x.font = `900 ${text.length > 9 ? 60 : 76}px Arial Black, Arial, sans-serif`;
    const chars = [...text];
    const step = Math.min(96, (h - 80) / chars.length);
    chars.forEach((ch, i) => x.fillText(ch, w / 2, 44 + step * (i + 0.5)));
  } else {
    x.font = `900 ${text.length > 15 ? 100 : 124}px Arial Black, Arial, sans-serif`;
    x.fillText(text, w / 2, h / 2 + 6);
  }
  x.shadowBlur = 0;
  x.lineWidth = 8; x.strokeStyle = ink; x.strokeRect(14, 14, w - 28, h - 28);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function crownSignMat(text, ink, opt) {
  const tex = crownSignTexture(text, ink, opt);
  const m = tex ? new THREE.MeshBasicMaterial({ map: tex }) : new THREE.MeshBasicMaterial({ color: ink });
  m.name = `crown sign: ${text}`;   // named so a QA pass can find and count them
  m.userData.gtbRealized = true;
  return m;
}

/** Local (hall) space to world. `rot` is only ever 0 or π, so this is a sign flip. */
const crownToWorld = (v, lx, lz) => v.rot === 0
  ? { x: v.x + lx, z: v.cz + lz }
  : { x: v.x - lx, z: v.cz - lz };

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

  function addOccluder(x, z, w, d, h = 18) {
    occluders.push({
      minX: x - w / 2, maxX: x + w / 2,
      minY: 0, maxY: h,
      minZ: z - d / 2, maxZ: z + d / 2,
    });
  }

  // ==================== THE CROWN STRIP: BUILD ====================
  /**
   * Five casinos and nine bars and clubs down North Ave 2, with a lit forecourt
   * each, a queue barrier across every door, and a gateway arch on US-167.
   * Added straight to the scene (never to `props`), so the sweep in main.js can
   * merge it — see the note at the top of this file.
   */
  function buildCrownStrip() {
    const G = crownGeo(), M = crownMat();

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

    function buildVenue(v) {
      const k = v.k, W = k.w, D = k.d, H = k.h, FZ = D / 2;
      const g = new THREE.Group();
      g.position.set(v.x, 0, v.cz);
      g.rotation.y = v.rot;
      scene.add(g);

      // ---- shell: back and sides ----
      addMesh(g, G.box(W, H, 0.4), M.stone, 0, H / 2, -FZ + 0.2, { cast: true });
      addMesh(g, G.box(0.4, H, D), M.stone, -W / 2 + 0.2, H / 2, 0, { cast: true });
      addMesh(g, G.box(0.4, H, D), M.stone, W / 2 - 0.2, H / 2, 0, { cast: true });

      // ---- front: stone either side of a doorway you can see through ----
      const gap = k.door, head = Math.min(4.4, H - 2), sideW = (W - gap) / 2;
      for (const s of [-1, 1]) {
        addMesh(g, G.box(sideW, H, 0.4), M.stone, s * (gap + sideW) / 2, H / 2, FZ - 0.2, { cast: true });
        addMesh(g, G.box(sideW - 2.2, head - 0.6, 0.14), M.glass, s * (gap + sideW) / 2, (head - 0.6) / 2 + 0.3, FZ + 0.05);
      }
      addMesh(g, G.box(gap, H - head, 0.4), M.stone, 0, head + (H - head) / 2, FZ - 0.2, { cast: true });

      // ---- roof, canopy, the neon fascia over the door ----
      addMesh(g, G.box(W + 0.7, 0.5, D + 0.7), M.trim, 0, H + 0.25, 0, { cast: true });
      addMesh(g, G.box(W + 2.6, 0.45, 3.4), M.trim, 0, head + 1.5, FZ + 1.5, { cast: true });
      addMesh(g, G.box(W + 2.6, 0.9, 0.3), M.std("crown fascia", v.neon, { emissive: v.neon, emissiveIntensity: 1.1, roughness: 0.45 }),
        0, head + 1.05, FZ + 3.15);
      addMesh(g, G.box(W + 0.4, 0.35, 0.35), M.gold, 0, head + 0.15, FZ + 3.15);

      // ---- the name, on the roof; a blade too where the front is narrow ----
      addMesh(g, G.box(W - 2, v.kind === "casino" ? 2.9 : 2.1, 0.28), crownSignMat(v.name, v.ink), 0, H + 1.85, FZ - 0.6);
      if (k.door < 4.5) {
        addMesh(g, G.box(0.3, 4.6, 1.15), crownSignMat(v.name, v.ink, { vertical: true }),
          -W / 2 - 0.75, Math.max(3.1, H - 3.2), FZ - 1.0, { cast: true });
      }

      // ---- inside, seen through the door: carpet, the machine bank, the bar ----
      addMesh(g, G.box(W - 0.9, 0.12, D - 0.9), M.carpet, 0, 0.06, 0);
      const bank = v.kind === "casino" ? 6 : 3;
      const bankMat = M.std("crown slot bank", v.neon, { emissive: v.neon, emissiveIntensity: 0.9 });
      for (let i = 0; i < bank; i++) {
        const bx = (i - (bank - 1) / 2) * 2.1;
        addMesh(g, G.box(1.0, 1.75, 0.8), M.deep, bx, 0.94, -FZ + 1.6, { cast: true });
        addMesh(g, G.box(0.62, 0.4, 0.1), bankMat, bx, 1.34, -FZ + 2.05);
      }
      if (v.kind !== "casino") addMesh(g, G.box(W - 5, 0.35, 1.1), M.felt, 0, 1.1, FZ - 3.2, { cast: true });
      addMesh(g, G.sph(0.5),
        M.std("crown chandelier", v.neon, { emissive: v.neon, emissiveIntensity: 1.4 }), 0, H - 1.1, 0);

      // ---- forecourt: apron, valet kerb, painted bays, parked cars ----
      const fz = FZ + k.fore / 2;
      addMesh(g, G.box(W + 10, 0.06, k.fore), M.lot, 0, 0.035, fz);
      if (k.cars > 0) {          // painted bays only where there are cars to park in them
        for (let i = 0; i <= 4; i++) addMesh(g, G.box(0.16, 0.02, 4.6), M.stripe, (i - 2) * 2.4, 0.09, FZ + 2.9);
      }
      for (let i = -1; i <= 1; i++) addMesh(g, G.cyl(0.16, 1.0), M.gold, i * (W / 2 + 2.4), 0.5, FZ + 1.1, { cast: true });
      for (let i = 0; i < k.cars; i++) parkedCar(g, (i - (k.cars - 1) / 2) * 2.4, FZ + 2.9, i % 2 ? 0.02 : -0.02, i);

      // ---- the door: a queue barrier. The row is dressed, not open for trade yet ----
      for (const s of [-1, 1]) addMesh(g, G.cyl(0.09, 0.95), M.gold, s * (gap / 2 + 0.35), 0.48, FZ + 1.0, { cast: true });
      addMesh(g, G.box(gap + 0.9, 0.09, 0.09), M.rope, 0, 0.92, FZ + 1.0);

      // ---- collision, camera occluder, crowd, minimap ----
      const step = 2.6;
      for (let lx = -W / 2; lx <= W / 2 + 0.01; lx += step) {
        for (const lz of [FZ - 0.2, -FZ + 0.2]) {
          const p = crownToWorld(v, lx, lz);
          addBlocker(p.x, p.z, 1.3);
        }
      }
      for (let lz = -FZ; lz <= FZ + 0.01; lz += step) {
        for (const lx of [-W / 2 + 0.2, W / 2 - 0.2]) {
          const p = crownToWorld(v, lx, lz);
          addBlocker(p.x, p.z, 1.3);
        }
      }
      addOccluder(v.x, v.cz, W, D, H);
      for (let i = 0; i < k.cars; i++) {
        const p = crownToWorld(v, (i - (k.cars - 1) / 2) * 2.4, FZ + 2.9);
        addBlocker(p.x, p.z, 2.4);
      }

      pois.push({ x: v.x, z: v.entranceZ, r: 6, label: v.name });
      if (k.cars > 0) pois.push({ x: v.x, z: (v.facadeZ + v.entranceZ) / 2, r: 8 });
      C.minimap.buildings.push(v.hall);

      // ---- light: neon spill on the pavement (fx:false = a real pool light with
      //      no beam, so it reads as a lit sign rather than a street lamp), plus
      //      one true lamp per pair of venues ----
      addLitSpot({ x: v.x, y: 5.2, z: v.entranceZ, warm: v.neon, power: 62, range: 22, fx: false });
      addLitSpot({ x: v.x, y: 4.6, z: v.facadeZ - v.side * 0.8, warm: v.neon, power: 40, range: 16, fx: false });
    }

    // the avenue, lit venue by venue rather than on a grid: one pole on the kerb
    // outside each forecourt. A grid would drop lamps inside whatever else the
    // block holds — Willowbrook School is on the avenue's west end.
    for (const v of CROWN) {
      addLitSpot({ x: v.x, y: 7, z: CROWN_AVE_Z + v.side * 7.6, warm: 0xffd6a0, power: 105, range: 26, pole: true });
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
      for (const s of [-1, 1]) addMesh(g, G.box(px * 2 - 2, 1.4, 0.18), crownSignMat("CROWN STRIP", "#ffcf4a"), 0, 10.6, s * 0.36);
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

    /**
     * Distance culling, as East Bank and West Parish already had it. Without this
     * the composer's clusters were never hidden: 7,313 meshes drew from anywhere on
     * the map, at every camera, forever.
     */
    update(dt, playerPos) {
      C.update(dt, ctx.camera ? ctx.camera.position : playerPos);
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
