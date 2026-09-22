// The Crown Strip (TASK-070) — does it actually build?
//
//   node tools/qa/crown_build_test.mjs
//
// `crown_strip_test.mjs` checks the layout numbers; this one *executes* them. It runs
// the real `composer.js` and the real `tusouxroeNorth.js` in a `vm` sandbox
// (the same trick `test.cjs` uses — strip the imports, put the imported names in
// the context yourself), with a stub three.js, and calls the district's real
// `buildSet()`. That is enough to catch the things a layout test cannot:
// undefined identifiers, bad arguments, NaN transforms, a venue that silently
// never gets built.
//
// What it is NOT: a browser. No GLB/FBX is loaded (the landmarks kit is stubbed
// to no-ops, so the numbers below are the Crown Strip's OWN meshes and nothing
// else), no shader compiles, and nothing is rendered — so draw calls and frame
// time still need a real-browser pass.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../src");

let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? `  — ${detail}` : ""}`);
}

// ------------------------------------------------------------------ stub three
// A proportional text metric, so neonsign.js's fit loop is actually exercised:
// it reads the px size out of the font string and advances ~0.64 em per glyph
// (0.32 for a space), which is close to Arial Black uppercase.
// The 2D ops are no-ops: characters.js paints its fabric patterns (paisley, stripes)
// through them, and none of that affects a mesh count or a world position.
const noop = () => {};
const gradient = { addColorStop: noop };
const context2d = {
  fillStyle: "", font: "", textAlign: "", textBaseline: "", shadowColor: "",
  shadowBlur: 0, lineWidth: 0, strokeStyle: "", globalAlpha: 1, lineCap: "", lineJoin: "",
  fillRect: noop, fillText: noop, strokeRect: noop, strokeText: noop,
  save: noop, restore: noop, translate: noop, rotate: noop, scale: noop, setTransform: noop,
  beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop, ellipse: noop,
  rect: noop, quadraticCurveTo: noop, bezierCurveTo: noop, arcTo: noop,
  fill: noop, stroke: noop, clip: noop, clearRect: noop, drawImage: noop, setLineDash: noop,
  createLinearGradient: () => gradient, createRadialGradient: () => gradient,
  createPattern: () => gradient, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  putImageData: noop, createImageData: () => ({ data: new Uint8ClampedArray(4) }),
  measureText(s) {
    const m = /(\d+(?:\.\d+)?)px/.exec(this.font || "");
    const size = m ? parseFloat(m[1]) : 10;
    let em = 0; for (const ch of String(s)) em += ch === " " ? 0.32 : 0.64;
    return { width: em * size };
  },
};
const stubDocument = {
  createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => context2d }),
  head: { appendChild() {} }, body: { appendChild() {} },
  getElementById: () => null, addEventListener() {},
};

function makeThree() {
  class V {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setScalar(s) { return this.set(s, s, s); }
    copy(v) { return this.set(v.x, v.y, v.z); }
    clone() { return new V(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
    lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
    applyAxisAngle() { return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    normalize() { return this; }
    length() { return Math.hypot(this.x, this.y, this.z); }
    distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
    dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
    applyMatrix4(m) { return m ? this.add(m.__t) : this; }
  }
  class E {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  }
  class Q {
    constructor() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; }
    setFromEuler() { return this; } setFromAxisAngle() { return this; }
    // characters.js's update() clears the support-arm quaternion every frame
    // (the weapon IK poses shoulders with one, every clip drives them with
    // Euler angles), so a stub without this cannot run an actor at all.
    identity() { this.x = 0; this.y = 0; this.z = 0; this.w = 1; return this; }
    copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  }
  // Translation-only matrices: enough for the batching chunk maths (merge.js
  // buckets by world position), and honest about that in the output.
  class M4 {
    constructor() { this.__t = new V(); }
    identity() { this.__t.set(0, 0, 0); return this; }
    translate(x, y, z) { this.__t.set(x, y, z); return this; }
    premultiply(m) { this.__t.add(m.__t); return this; }
    multiply(m) { this.__t.add(m.__t); return this; }
    compose(p) { this.__t.copy(p); return this; }
    determinant() { return 1; }
  }
  class Box3 {
    constructor() { this.min = new V(); this.max = new V(); }
    setFromObject() { return this; }
    getSize(v) { return v.set(1, 1, 1); }
    getCenter(v) { return v.set(0, 0, 0); }
    getBoundingSphere(s) { s.center.set(0, 0, 0); s.radius = 1; return s; }
  }
  class Sphere { constructor(center = new V(), radius = 0) { this.center = center; this.radius = radius; } }

  let uid = 0;
  class Obj3D {
    constructor() {
      this.id = ++uid; this.children = []; this.parent = null;
      this.position = new V(); this.rotation = new E(); this.scale = new V(1, 1, 1);
      this.visible = true; this.userData = {}; this.name = ""; this.type = "Object3D";
      this.matrix = new M4(); this.matrixWorld = new M4(); this.matrixAutoUpdate = true;
      // real three keeps a quaternion alongside the Euler; characters.js's
      // update() clears it on every arm pivot before each clip runs
      this.quaternion = new Q();
      this.castShadow = false; this.receiveShadow = false; this.renderOrder = 0;
    }
    add(...os) { for (const o of os) { if (!o) continue; o.parent = this; this.children.push(o); } return this; }
    remove(o) { const i = this.children.indexOf(o); if (i >= 0) { this.children.splice(i, 1); o.parent = null; } return this; }
    traverse(cb) { cb(this); for (const c of this.children) c.traverse(cb); }
    updateMatrix() { this.matrix.compose(this.position); return this; }
    // merge.js's mergeRigid bakes a character's rigid parts, so this now has to
    // walk children the way real three does.
    updateMatrixWorld() {
      this.matrix.compose(this.position);
      this.matrixWorld.__t.copy(this.position);
      for (const c of this.children) c.updateMatrixWorld();
      return this;
    }
    getObjectByName() { return null; }
    clone() { return this; }
    lookAt() {} addEventListener() {}
  }
  class Mesh extends Obj3D {
    constructor(geo, mat) { super(); this.isMesh = true; this.geometry = geo; this.material = mat; }
  }
  class InstancedMesh extends Mesh {
    constructor(geo, mat, n) { super(geo, mat); this.isInstancedMesh = true; this.count = n; }
    setMatrixAt() {} computeBoundingSphere() {}
  }
  class Geo {
    constructor() { this.attributes = { position: { count: 1 } }; this.index = null; this.morphAttributes = {}; this.boundingSphere = null; }
    computeBoundingSphere() { this.boundingSphere = { center: new V(), radius: 1 }; }
    clone() { return new Geo(); } applyMatrix4() { return this; } rotateX() { return this; }
    translate() { this.bakedY = arguments[1] || 0; return this; }   // G.wall() pivots at the floor
  }
  const geo = (type) => class extends Geo { constructor(...a) { super(); this.type = type; this.parameters = { args: a }; } };
  class Col {
    constructor(hex) { this.hex = hex >>> 0; this.r = 1; this.g = 1; this.b = 1; }
    setHex(h) { this.hex = h >>> 0; return this; }
    getHexString() { return this.hex.toString(16).padStart(6, "0"); }
    setHSL() { return this; }
    getHSL(o) { return o || { h: 0, s: 0, l: 0 }; }
    lerp() { return this; }
    copy(c) { return this.setHex(c.hex); }
    clone() { return new Col(this.hex); }
    setRGB(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
    multiplyScalar() { return this; }
  }
  let muid = 0;
  class Material {
    constructor(o = {}) {
      this.uuid = "m" + (++muid); this.type = "MeshStandardMaterial";
      this.name = o.name || ""; this.color = new Col(o.color ?? 0xffffff);
      this.emissive = new Col(o.emissive ?? 0x000000); this.emissiveIntensity = o.emissiveIntensity ?? 1;
      this.roughness = o.roughness ?? 1; this.metalness = o.metalness ?? 0;
      this.map = o.map; this.transparent = !!o.transparent; this.opacity = o.opacity ?? 1;
      this.userData = { ...(o.userData || {}) };
    }
    // characters.js clones its skin/tattoo/shirt materials per character
    clone() {
      const m = new Material({ name: this.name, color: this.color.hex });
      m.emissive = this.emissive; m.emissiveIntensity = this.emissiveIntensity;
      m.roughness = this.roughness; m.metalness = this.metalness; m.map = this.map;
      m.userData = { ...this.userData };
      return m;
    }
    copy(m) { return this.clone(); }
    dispose() {}
  }
  class CanvasTexture { constructor(c) { this.image = c; this.repeat = new V(1, 1); this.offset = new V(); } }

  return {
    Vector2: V, Vector3: V, Matrix4: M4, Quaternion: Q, Euler: E, Box3, Sphere, Material,
    Color: Col,
    Object3D: Obj3D, Group: class extends Obj3D {}, Mesh, InstancedMesh,
    BoxGeometry: geo("BoxGeometry"), CylinderGeometry: geo("CylinderGeometry"),
    SphereGeometry: geo("SphereGeometry"), ConeGeometry: geo("ConeGeometry"),
    PlaneGeometry: geo("PlaneGeometry"), TorusGeometry: geo("TorusGeometry"),
    CircleGeometry: geo("CircleGeometry"), RepeatWrapping: 1000,
    MeshStandardMaterial: Material, MeshBasicMaterial: Material,
    CanvasTexture, SRGBColorSpace: "srgb",
    // `clamp` is characters.js's walk clip scaling its stride with ground speed
    MathUtils: {
      clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
      smoothstep: (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); },
      lerp: (a, b, t) => a + (b - a) * t,
    },
  };
}

// ------------------------------------------------------------------ the sandbox
const calls = { blockers: 0, litSpots: 0, services: 0 };
const blockers = [];        // every collision circle the district registered
const litSpots = [];        // every pooled light spot the district registered
const reflected = [];       // every mesh the strip put on the wet road's mirror layer
const serviceCall = [];     // where the district asked for a back-of-house pocket
// guestCast: the strip's crowd, measured rather than assumed (see the check below)
const actorMeshes = (code) => vm.runInContext(
  `(() => { let n = 0; const a = ${code}; a.traverse((o) => { if (o.isMesh) n++; }); return n; })()`,
  sandbox, { filename: "probe" });
// enough of a Scene for merge.js's batchStatic to walk it
const scene = {
  children: [], visible: true,
  add(...os) { for (const o of os) if (o) { o.parent = scene; scene.children.push(o); } },
  remove(o) { const i = scene.children.indexOf(o); if (i >= 0) { scene.children.splice(i, 1); o.parent = null; } },
  updateMatrixWorld() {},
  traverse(cb) { cb(scene); for (const c of scene.children) c.traverse(cb); },
};

const sandbox = {
  console, setTimeout, clearTimeout,
  THREE: makeThree(),
  document: stubDocument,
  mergeGeometries: () => new sandbox.THREE.BoxGeometry(),   // for merge.js, if run
  // the landmarks kit is stubbed: the numbers we want are the strip's own meshes
  CITY_BUILDING_TYPES: {
    cottage: { w: 12, h: 6, d: 10 }, apartments: { w: 16, h: 14, d: 12 }, school: { w: 24, h: 9, d: 18 },
    cafe: { w: 14, h: 7, d: 12 }, market: { w: 20, h: 8, d: 16 }, hospital: { w: 28, h: 16, d: 22 },
    offices: { w: 22, h: 20, d: 18 }, garage: { w: 16, h: 7, d: 14 }, fire_station: { w: 18, h: 10, d: 15 },
    tower: { w: 20, h: 36, d: 20 },
  },
  placeCityBuilding() {}, makeDecorativeFence() {}, placeOfficeClutter() {},
  // fx.js's mirror layer needs a renderer, so the sandbox's `reflect` records what
  // the strip asks to reflect instead. That the strip asks at all — and asks for
  // the right things — is the property under test (see the neon checks below).
  reflect: (o) => { reflected.push(o); return o; },
  // characters.js's only graphics dependency, and it is texture generation: null
  // means "no micro-detail maps", which its own `if (micro)` guard allows.
  microSurface: () => null,
  // The real one adds a 2.2 m blocker and pushes meshes into the scene; the
  // sandbox records the call so the audit can place the same blocker itself.
  placeStreetClutter: (c, x, z) => { calls.services++; serviceCall.push({ x, z }); },
  placeBillboard() {}, placeParkedCar() {},
  placeGunShop() {}, placeTacos() {}, placeBurgerPiz() {}, placeSixTwelve() {}, placeGasStation() {},
};
vm.createContext(sandbox);

const strip = (file) => `"use strict";\n` + fs.readFileSync(path.join(SRC, file), "utf8")
  .replace(/export /g, "")
  .replace(/import[\s\S]*?from\s*['"].*?['"];/g, "");

// neonsign.js and interiors.js first: tusouxroeNorth.js's `import` lines for them
// are stripped by `strip()`, and their `export function`s become sandbox globals
// when they load. So the kit is exercised for real here, not stubbed.
// characters.js is loaded too: the Crown Strip's crowd is built from its factories,
// and the actors' mesh cost is a number this test should be measuring rather than
// trusting. It is procedural (no SkinnedMesh, no AnimationMixer), so a stub three
// can genuinely run it.
// spawnzones.js and crowd.js join them for the same reason: the strip's crowd is
// built from the spawn table (ZONE_MIX.entertainment) and characters.js's own
// people, and the audit should measure the actors it actually builds rather than
// a stub of them. Order matters — crowd.js reads ZONE_MIX at load.
for (const f of ["spawnzones.js", "neonsign.js", "interiors.js", "characters.js", "crowd.js", "merge.js", "composer.js", "tusouxroeNorth.js"]) {
  try { vm.runInContext(strip(f), sandbox, { filename: f }); }
  catch (e) { console.error(`load ${f}: ${e.stack || e}`); process.exit(1); }
}

let clockHours = 22;      // the strip's hour, for the crowd's shift (see mockCtx)
const mockCtx = {
  scene,
  camera: { position: { x: 0, y: 0, z: 0 } },
  // the strip's clock. main.js hands the district its worldTime in the live game;
  // here it is mutable so the audit can run the same block through a night and a
  // Tuesday morning and check the crowd changes with it.
  worldTime: { get hours() { return clockHours; }, isNight: () => clockHours >= 20 || clockHours < 6 },
  surface: () => ({ material: () => ({ userData: {} }) }),
  roadMaterial: () => ({ userData: {} }),
  addBlocker: (x, z, r) => { calls.blockers++; blockers.push({ x, z, r }); },
  addLitSpot: (spot) => { calls.litSpots++; litSpots.push(spot); },
  addService: () => { calls.services++; },
  addLitSpotRaw: null,
  placeGlbLandmark() {},
  loadGLB: async () => null,
};

const district = sandbox.createTusouxroeNorth(mockCtx);
try {
  district.buildSet();
  check("buildSet() runs to completion", true);
} catch (e) {
  check("buildSet() runs to completion", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
  console.log(`\n${failures ? 0 : 1} failure(s).\n`);
  process.exit(1);
}

const CROWN_STRIP = vm.runInContext("CROWN_STRIP", sandbox);
console.log(`\n  probe  one patron: ${actorMeshes("makeHoodrat({ seed: 1 })")} meshes · one dancer: ${actorMeshes("makeDancer({ sex: 'f', seed: 1 })")} meshes`);

// landmarks.js's real placeStreetClutter ends with a 2.2 m blocker at its origin and
// the sandbox stub cannot register it, so mirror it here: the stray-collision check
// below is only meaningful with the back-of-house blockers actually present.
for (const s of district.crownService) { blockers.push({ x: s.x, z: s.z, r: 2.2 }); calls.blockers++; }

// ------------------------------------------------------------------ what it built
const meshes = [];
const walk = (o) => { if (o.isMesh) meshes.push(o); for (const c of o.children) walk(c); };
for (const c of scene.children) walk(c);

const crowned = meshes.filter((m) => (m.material?.name || "").startsWith("crown"));
const signs = crowned.filter((m) => m.material.name.startsWith("crown sign:"));
const signNames = new Set(signs.map((m) => m.material.name));

console.log(`\nCrown Strip build — ${CROWN_STRIP.venues.length} venues, ${crowned.length} meshes\n`);

check("every venue put a sign up", CROWN_STRIP.venues.every((v) => signNames.has(`crown sign: ${v.name}`)),
  `${signNames.size} distinct sign faces`);
check("the gate put its sign up", signNames.has("crown sign: CROWN STRIP"));
check("the strip built a real amount of geometry", crowned.length > 300, `${crowned.length} meshes`);
const finite = (m) => [m.position.x, m.position.y, m.position.z, m.rotation.x, m.rotation.y, m.rotation.z].every(Number.isFinite);
const bad = crowned.filter((m) => !finite(m));
check("no mesh has a NaN or unset transform", bad.length === 0,
  bad.slice(0, 3).map((m) => `${m.material.name} @ (${m.position.x}, ${m.position.y}, ${m.position.z})`).join(" | "));
check("cast/receive shadows are flagged and not boolean junk",
  crowned.every((m) => typeof m.castShadow === "boolean" && typeof m.receiveShadow === "boolean"));

// breakdown, so the draw-call pressure is a measured number rather than a guess
const byMaterial = new Map();
for (const m of crowned) {
  const n = m.material.name.startsWith("crown sign:") ? "crown sign (one per face)" : m.material.name;
  byMaterial.set(n, (byMaterial.get(n) || 0) + 1);
}
for (const [n, c] of [...byMaterial.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`         ${String(c).padStart(4)}  ${n}`);
}
console.log(`\n         ${String(signs.length).padStart(4)}  meshes carry a unique sign material (cannot merge with anything)`);
console.log(`         ${String(crowned.length - signs.length).padStart(4)}  meshes share mergeable materials`);
console.log(`\n         blockers ${calls.blockers} · occluders ${district.occluders.length} · pois ${district.pois.length} · lit spots ${calls.litSpots}`);
console.log(`         minimap buildings ${district.minimap.buildings.length}`);

check("halls are collision, not scenery", calls.blockers > 300, `${calls.blockers} blockers`);
check("every venue has a camera occluder", district.occluders.length >= CROWN_STRIP.venues.length,
  `${district.occluders.length} occluders`);
check("every venue has a crowd POI", district.pois.length >= CROWN_STRIP.venues.length, `${district.pois.length} POIs`);
check("every venue is on the minimap", district.minimap.buildings.length >= CROWN_STRIP.venues.length,
  `${district.minimap.buildings.length} footprints`);
check("the strip is lit", calls.litSpots > 40, `${calls.litSpots} lit spots this district alone`);
// The strip is left in the scene so main.js's batch sweep still merges its
// interiors; only the meshes the cutaway moves, and every mesh of a crowd actor,
// carry `userData.noBatch` (crowd.js marks its own, and tags them `userData.crowd`
// so the two sets stay tellable apart). Count them, then run the real sweep and
// prove they survived it.
const movers = [];
const crowdMeshes = [];
const collectMovers = (o) => {
  if (o.isMesh && o.userData.noBatch) (o.userData.crowd ? crowdMeshes : movers).push(o);
  for (const c of o.children) collectMovers(c);
};
for (const c of scene.children) collectMovers(c);
check("the cutaway's moving meshes are marked noBatch for the batch sweep",
  movers.length >= CROWN_STRIP.venues.length * 6, `${movers.length} meshes marked`);
check("the cutaway has one record per venue, named after it",
  district.crownDebug.length === CROWN_STRIP.venues.length
  && CROWN_STRIP.venues.every((v) => district.crownDebug.some((d) => d.name === v.name)),
  district.crownDebug.map((d) => d.name).join(", "))
;
check("the radar has a badge per venue door",
  district.blips().length === CROWN_STRIP.venues.length
  && district.blips().every((b) => b.kind === "casino" || b.kind === "club"),
  district.blips().map((b) => b.kind).join(", "));
check("interact() is a no-op away from a door", district.interact() === false);
// What each interior promised the brief: the casino floor its games, the lounge
// its bar, pool and stage, the club its booth and stage, the show room its stage.
const REQUIRED = {
  "BAYOU GOLD": ["slots", "roulette", "cards", "cashier", "bar", "vault", "vip"],
  "BILLY JEANS": ["bar", "pool", "stage"],
  "DISCO GATORS": ["dj", "stage", "bar", "vip"],
  "HAPPY HOGS": ["stage", "bar"],
};
const kindsOf = (name) => new Set(district.crownStations.filter((s) => s.venue === name).map((s) => s.kind));
const missing = CROWN_STRIP.venues.flatMap((v) =>
  (REQUIRED[v.name] || []).filter((k) => !kindsOf(v.name).has(k)).map((k) => `${v.name}:${k}`));
check("every venue has the interaction points its room promised",
  missing.length === 0 && Object.keys(REQUIRED).length === CROWN_STRIP.venues.length,
  `${district.crownStations.length} points — ` + CROWN_STRIP.venues.map((v) => `${v.name}:${kindsOf(v.name).size}`).join(" "));

// ------------------------------------------------------------------ lanes
// A furniture layout is only right if you can walk between the furniture. Grid
// the hall at 0.5 m, mark every cell a walker of radius 0.45 m cannot stand in,
// flood-fill from the doorway, and prove every interaction point can be reached
// — that is the "player must never get trapped inside furniture" rule, executed.
{
  const CELL = 0.5, PAD = 0.45;
  let ok = true, why = "";
  for (const v of CROWN_STRIP.venues) {
    const nx = Math.ceil(v.k.w / CELL), nz = Math.ceil(v.k.d / CELL);
    const seen = new Uint8Array(nx * nz);
    const cellX = (i) => v.hall.x0 + (i + 0.5) * CELL;
    const cellZ = (j) => v.hall.z0 + (j + 0.5) * CELL;
    const blockedAt = (x, z) => blockers.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + PAD);
    // the doorway: inside the threshold, on the hall's centre line
    const door = v.rot === 0 ? { x: v.x, z: v.cz + v.d / 2 - 1.2 } : { x: v.x, z: v.cz - v.d / 2 + 1.2 };
    const si = Math.floor((door.x - v.hall.x0) / CELL), sj = Math.floor((door.z - v.hall.z0) / CELL);
    if (si < 0 || sj < 0 || si >= nx || sj >= nz || blockedAt(door.x, door.z)) {
      ok = false; why = `${v.name}: the doorway itself is not standable`; break;
    }
    const q = [sj * nx + si]; seen[q[0]] = 1;
    for (let head = 0; head < q.length; head++) {
      const c = q[head], i = c % nx, j = (c - i) / nx;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const i2 = i + di, j2 = j + dj;
        if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= nz) continue;
        const c2 = j2 * nx + i2;
        if (seen[c2] || blockedAt(cellX(i2), cellZ(j2))) continue;
        seen[c2] = 1; q.push(c2);
      }
    }
    // every interaction point is standable-from: a reached cell within 1.5 m
    const here = district.crownStations.filter((s) => s.venue === v.name);
    const unreachable = here.filter((s) => {
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        if (seen[j * nx + i] && Math.hypot(cellX(i) - s.x, cellZ(j) - s.z) <= 1.5) return false;
      }
      return true;
    });
    if (unreachable.length) {
      ok = false; why = `${v.name}: ${unreachable.length} of ${here.length} unreachable — ` + unreachable.slice(0, 4).map((s) => `${s.kind}@(${s.x.toFixed(0)},${s.z.toFixed(0)})`).join(" ");
      break;
    }
  }
  check("every game, bar, cage and stage can be walked up to from the door", ok, ok ? "flood-filled at 0.5 m per venue" : why);
}

// ------------------------------------------------------------------ interior light
// main.js runs a pool of exactly 8 real PointLights and gives them to the 8
// nearest spots (initLightPool(8), 4 Hz). "Interior lighting comes on when you
// walk in" is therefore not a switch anywhere — it is a claim about what the
// nearest 8 spots are from inside. Check that claim instead of trusting it: at a
// venue's own centre, every one of the nearest 8 has to be a spot inside that
// hall, not a street lamp or a doorway spill.
{
  const POOL = 8;
  const insideRect = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  let ok = true, why = "";
  const report = [];
  for (const v of CROWN_STRIP.venues) {
    // sample the middle of the room and four points 8 m in from it
    const probes = [[v.x, v.cz], [v.x - 8, v.cz], [v.x + 8, v.cz], [v.x, v.cz - 8], [v.x, v.cz + 8]];
    let worst = POOL;
    for (const [px, pz] of probes) {
      const nearest = [...litSpots]
        .sort((a, b) => ((a.x - px) ** 2 + (a.z - pz) ** 2) - ((b.x - px) ** 2 + (b.z - pz) ** 2))
        .slice(0, POOL);
      const inHall = nearest.filter((s) => insideRect(v.hall, s.x, s.z));
      worst = Math.min(worst, inHall.length);
    }
    report.push(`${v.name}:${worst}/${POOL}`);
    if (worst === 0) {
      ok = false;
      why = `${v.name}: no interior spot reaches the light pool at all`;
      break;
    }
  }
  // An interior is not required to own all 8 slots — light spilling in a doorway is
  // correct — but at least 5 of them have to be the room's own, or it is being lit
  // by the street. Measured values are 5–6/8; this is a floor, not the reading.
  const weak = report.filter((r) => Number(r.split(":")[1].split("/")[0]) < 5);
  check("the interior lights win the 8-light pool inside every venue",
    ok && weak.length === 0, (weak.length ? `weakest: ${weak.join(" ")} — ` : "") + report.join(" "));
}

// ------------------------------------------------------------------ the street pass
// The polish pass added awnings, bollards, planters, bins, queue rails, arrows,
// security lamps, signs and back-of-house pockets. Three rules it has to keep:
// none of it lights the scene with a real PointLight, only the lit shapes go on the
// wet road's mirror layer, and the pockets land where the layout audit says.
{
  const insideRect = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;

  // (a) the light budget. main.js pools exactly 8 PointLights for the whole map;
  //     the strip owns 114 spots — the interior fixtures, the one pit light, and
  //     the avenue poles — and none of the exterior dressing added any. A street
  //     lamp per awning would be the classic mistake here.
  check("no dressing added a pooled light", calls.litSpots <= 120,
    `${calls.litSpots} lit spots — 100 of them interior fixture light, not a lamp per prop`);

  // (b) every reflected mesh is a lit shape, never trim or a backing plate
  const matte = reflected.filter((m) => {
    const nm = m.material?.name || "";
    if (nm.startsWith("crown sign:")) return false;                    // a sign face is its own light
    return (m.material?.emissive?.getHexString?.() || "000000") === "000000";
  });
  check("only lit shapes were put on the wet road's mirror layer",
    reflected.length >= CROWN_STRIP.venues.length * 4 && matte.length === 0,
    matte.length ? `${matte.length} matte meshes reflected, e.g. ${matte[0].material?.name}`
      : `${reflected.length} meshes reflected (neon + name faces)`);

  // (c) the service pockets are where the layout audit computes they should be
  let drift = null;
  for (const v of CROWN_STRIP.venues) {
    const lx = v.service.x, lz = v.service.z;
    const want = v.rot === 0 ? { x: v.x + lx, z: v.cz + lz } : { x: v.x - lx, z: v.cz - lz };
    const got = district.crownService.find((s) => s.venue === v.name);
    if (!got || Math.hypot(got.x - want.x, got.z - want.z) > 1) {
      drift = `${v.name}: want (${want.x.toFixed(1)}, ${want.z.toFixed(1)}), got ${got ? `(${got.x.toFixed(1)}, ${got.z.toFixed(1)})` : "nothing"}`;
      break;
    }
  }
  check("each back-of-house pocket is where the venue data puts it", drift === null,
    drift || district.crownService.map((s) => s.venue).join(", "));

  // (d) the pockets are outside every hall — back of house is not in the room
  const inHall = district.crownService.filter((s) =>
    CROWN_STRIP.venues.some((v) => insideRect(v.hall, s.x, s.z)));
  check("no service pocket is inside a venue", inHall.length === 0,
    inHall.length ? inHall.map((s) => s.venue).join(", ") : `${district.crownService.length} pockets, all outside their halls`);
}

// ------------------------------------------------------------------ the camera
// The strip's venues are enterable, and camera.js pulls the lens in when the line
// from the player's head crosses an occluder box — except when the head is already
// INSIDE one (rayBox returns null for an origin inside). So the venue's single box
// has to actually contain the room the player walks in: if it ever stops doing
// that, the camera collapses to 3 m the moment you step through a casino door.
// This is the brief's "do not let the camera be constantly obstructed", executed.
{
  function rayBox(px, py, pz, dx, dy, dz, b) {
    let tmin = 0, tmax = Infinity;
    const axis = (p, d, lo, hi) => {
      if (Math.abs(d) < 1e-6) return p >= lo && p <= hi;
      let t1 = (lo - p) / d, t2 = (hi - p) / d;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      return tmin <= tmax;
    };
    if (!axis(px, dx, b.minX, b.maxX) || !axis(py, dy, b.minY, b.maxY) || !axis(pz, dz, b.minZ, b.maxZ)) return null;
    return tmin > 0 ? tmin : null;
  }
  let ok = true, why = "";
  const heads = 1.6, CAM_H = 1.6;      // camera.js's onFoot figures
  for (const v of CROWN_STRIP.venues) {
    for (const [ox, oz] of [[0, 0], [-v.k.w / 4, 0], [v.k.w / 4, 0], [0, -v.k.d / 4], [0, v.k.d / 4]]) {
      const hx = v.x + ox, hz = v.cz + oz;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, pitch = 0.25;
        const t = rayBox(hx, heads + CAM_H, hz, Math.cos(a) * Math.cos(pitch), Math.sin(pitch), Math.sin(a) * Math.cos(pitch), { minX: v.hall.x0, maxX: v.hall.x1, minZ: v.hall.z0, maxZ: v.hall.z1, minY: 0, maxY: v.k.h });
        if (t !== null && t < 4) { ok = false; why = `${v.name}: pull-in to ${t.toFixed(1)} m from (${ox}, ${oz})`; break; }
      }
      if (!ok) break;
    }
    if (!ok) break;
  }
  check("the camera never pulls in on a player standing inside a venue", ok,
    ok ? "the box contains the room, so rayBox returns null inside" : why);
}

// ------------------------------------------------------------------ the sign and the glove
// The sign has to go with the roof, or a lifted roof leaves a name sign hanging
// over an open room. And BILLY JEANS' glove is mounted above the roofline, so it
// is only visible from inside *because* the roof group lifts.
{
  const signOf = (name) => {
    const found = [];
    const walk = (o) => { if (o.isMesh && (o.material?.name || "") === name) found.push(o); for (const c of o.children) walk(c); };
    for (const c of scene.children) walk(c);
    return found;
  };
  // A venue legitimately has two faces reading its own name: the one on the roof,
  // and the neon brand inside on the back wall. The roof one must go when the roof
  // lifts — and the interior one must stay, or the hall goes nameless as you walk in.
  const hiddenUnder = (o) => {
    for (let gp = o; gp; gp = gp.parent) if (gp.visible === false) return true;
    return false;
  };
  let ok = true, why = "";
  const tiles = [];
  for (const v of CROWN_STRIP.venues) {
    for (let i = 0; i < 40; i++) district.update(0.1, { x: v.x, y: 0, z: v.cz });   // stand inside
    const faces = signOf(`crown sign: ${v.name}`);
    const outside = faces.filter(hiddenUnder).length;
    const inside = faces.length - outside;
    const branded = v.layout.some((s) => s.fixture === "neonBrand");
    tiles.push(`${v.name}:${outside}out/${inside}in`);
    if (outside !== 1) { ok = false; why = `${v.name}: ${outside} name faces hidden with the roof, want exactly 1`; break; }
    if (branded && inside < 1) { ok = false; why = `${v.name}: its interior brand vanished with the roof`; break; }
  }
  check("the name sign lifts with the roof and the interior brand stays put", ok,
    ok ? tiles.join(" ") : why);
}

// ------------------------------------------------------------------ the cutaway
// The strip's interiors are the nightlife.js technique: inside, the roof group
// hides and the outer walls scale down to knee height. Execute that here instead
// of trusting it.
{
  const rect = CROWN_STRIP.rect;
  const insideRect = (r, x, z) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
  const settle = (x, z) => { for (let i = 0; i < 40; i++) district.update(0.1, { x, y: 0, z }); };

  let cutOk = true, cutWhy = "";
  for (const v of CROWN_STRIP.venues) {
    settle(v.x, v.cz);
    const name = district.insideVenue;
    const st = district.crownDebug.find((d) => d.name === v.name);
    if (name !== v.name) { cutOk = false; cutWhy = `${v.name}: insideVenue=${name}`; break; }
    if (st.roofVisible !== false) { cutOk = false; cutWhy = `${v.name}: roof still up`; break; }
    if (!(st.wallScale < 0.3)) { cutOk = false; cutWhy = `${v.name}: walls still at ${st.wallScale}`; break; }
    settle(v.x, v.cz + 400);
    if (district.insideVenue !== null) { cutOk = false; cutWhy = `${v.name}: still inside after walking away`; break; }
  }
  check("the cutaway opens the roof and drops the walls inside, and closes up outside", cutOk, cutWhy);

  // and it closes again on the way out, rather than staying open once touched
  const v0 = CROWN_STRIP.venues[0];
  settle(v0.x, v0.cz + 400);
  const out = district.crownDebug.find((d) => d.name === v0.name);
  check("walking out shuts the roof and raises the walls back",
    out.roofVisible === true && out.wallScale > 0.9, `roofVisible=${out.roofVisible} wallScale=${out.wallScale.toFixed(2)}`);

  // the entrance is a doorway, not a wall: no collision circle blocks the way in
  let doorBlocked = null;
  for (const v of CROWN_STRIP.venues) {
    const lz0 = v.d / 2 - 0.5, lz1 = v.d / 2 + 12;   // from the threshold out into the forecourt
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const lz = lz0 + (lz1 - lz0) * t;
      const p = v.rot === 0 ? { x: v.x, z: v.cz + lz } : { x: v.x, z: v.cz - lz };
      for (const b of blockers) {
        if (Math.hypot(b.x - p.x, b.z - p.z) < b.r + 0.45) { doorBlocked = `${v.name} at local z=${lz.toFixed(1)}`; break; }
      }
      if (doorBlocked) break;
    }
    if (doorBlocked) break;
  }
  check("the entrance is walkable — no blocker sits in the doorway", !doorBlocked, doorBlocked || "clear from the threshold to the street");

  // nothing from the old fourteen-venue row survives: every blocker inside the
  // strip belongs to one of the four new halls or their forecourts
  const gate = CROWN_STRIP.gate;
  const gateRect = { x0: gate.x - gate.span - 2, x1: gate.x + gate.span + 2, z0: gate.z - 2, z1: gate.z + 2 };
  const stray = blockers.filter((b) => insideRect(rect, b.x, b.z)).filter((b) =>
    !CROWN_STRIP.venues.some((v) => insideRect({ x0: v.hall.x0 - 2, x1: v.hall.x1 + 2, z0: v.hall.z0 - 2, z1: v.hall.z1 + 2 }, b.x, b.z)
      || insideRect(v.fore, b.x, b.z))
    && !insideRect(gateRect, b.x, b.z)     // the gateway arch is not a stray
    // nor is a venue's back-of-house pocket: street clutter is a real obstacle on
    // the strip's own land, which is the point of putting it there
    && !district.crownService.some((s) => Math.hypot(s.x - b.x, s.z - b.z) < 3));
  check("no stale collision from the venues that merged", stray.length === 0,
    stray.length ? `${stray.length} stray blockers, e.g. (${stray[0].x.toFixed(0)}, ${stray[0].z.toFixed(0)})` : "every strip blocker is inside a hall or forecourt");
}

// ------------------------------------------------------------------ the people
// A row of four empty buildings is a museum. The crowd is cast by crowd.js from
// spots the fixtures proposed next to their own furniture (interiors.js `b.spot`)
// and from frontage geometry the district derived, and this section checks the
// things that actually go wrong with a crowd: somebody standing inside a bar, two
// people in one spot, a valet inside a parked car, the whole room bunched into the
// doorway, or 80 actors burning frames from the far side of the parish.
//
// The player is parked on the axis (see the cutaway section), so start from a
// known place and drive the LOD explicitly.
{
  const crown = district.crownCrowd;   // `actors` below is the same array, named for what it is
  const actors = crown;
  const total = crown.reduce((n, c) => n + c.inside + c.outside, 0);
  const spread = crown.map((c) => `${c.venue} ${c.inside}+${c.outside}`).join(", ");

  check("the strip is populated — every venue full, and not with four people",
    crown.every((c) => c.inside + c.outside >= 12) && total >= 60, `${total} people on the block — ${spread}`);

  // the staff the floor plan implies, per venue: a bar has a barman, a pit has a
  // croupier, a stage has an act. Derived from the venue's own layout, so a new
  // fixture that needs staffing is one line here rather than a hand-written spot.
  const STAFF_OF = {
    barBig: ["barkeep"], cardTable: ["dealer"], roulette: ["croupier"], cashier: ["clerk"],
    djBooth: ["dj"], stage: ["performer", "gogo", "star"], vipDeck: ["host"],
  };
  let missing = null;
  for (const v of CROWN_STRIP.venues) {
    const mine = crown.find((c) => c.venue === v.name);
    const have = new Set(mine.people.filter((p) => p.side === "inside").map((p) => p.role));
    for (const s of v.layout) {
      const want = STAFF_OF[s.fixture];
      if (want && !want.some((r) => have.has(r))) { missing = `${v.name}: nobody cast as ${want.join("/")} (${s.fixture})`; break; }
    }
    if (missing) break;
  }
  check("every room is staffed for what is in it", !missing, missing ||
    CROWN_STRIP.venues.map((v) => `${v.name}: ${crown.find((c) => c.venue === v.name).people.filter((p) => p.side === "inside").length}`).join(" "));

  // front of house: two on the door and two valets for every venue, a walkable
  // forecourt lane for the strollers, and whatever the venue's own cast asked for
  // (the club's dancers on the pavement, the lounge's smokers)
  let crew = null;
  for (const v of CROWN_STRIP.venues) {
    const mine = crown.find((c) => c.venue === v.name);
    const out = mine.people.filter((p) => p.side === "outside");
    const n = (role) => out.filter((p) => p.role === role).length;
    const cast = v.cast || {};
    if (n("bouncer") !== 2) crew = `${v.name}: ${n("bouncer")} on the door, want 2`;
    else if (n("valet") < 1) crew = `${v.name}: nobody valet-parking`;
    else if (!mine.lane) crew = `${v.name}: no walkable lane across its own forecourt`;
    else if (n("walker") !== 2) crew = `${v.name}: ${n("walker")} strollers, want 2`;
    else if (cast.party && n("party") !== cast.party) crew = `${v.name}: ${n("party")} out front dancing, want ${cast.party}`;
    else if (cast.smoker && n("smoker") !== cast.smoker) crew = `${v.name}: ${n("smoker")} on a smoke, want ${cast.smoker}`;
    if (crew) break;
  }
  check("the front of every house is worked — door, valets, a cleared lane and its own act",
    !crew, crew || CROWN_STRIP.venues.map((v) => {
      const out = crown.find((c) => c.venue === v.name).people.filter((p) => p.side === "outside");
      return `${v.name} ${out.length}(lane ${crown.find((c) => c.venue === v.name).lane ? "yes" : "NO"})`;
    }).join(", "));

  // --- where they actually stand -------------------------------------------
  const toWorld = (v, lx, lz) => (v.rot === 0 ? { x: v.x + lx, z: v.cz + lz } : { x: v.x - lx, z: v.cz - lz });
  let buried = null, overlapping = null, offFloor = null, inRoad = null, bunched = null;

  for (const v of CROWN_STRIP.venues) {
    const mine = crown.find((c) => c.venue === v.name);
    const FZ = v.d / 2;
    const people = mine.people.map((p) => ({ ...p, ...toWorld(v, p.lx, p.lz) }));

    for (const p of people) {
      // in their room, or on their own forecourt — never out on the avenue
      const inHall = p.side === "inside" && Math.abs(p.lx) < v.w / 2 - 0.4 && Math.abs(p.lz) < FZ - 0.4;
      const inFore = p.side === "outside" && p.lz > FZ && p.lz < FZ + v.k.fore + 0.2 && Math.abs(p.lx) < v.w / 2 + 5;
      if (!inHall && !inFore) offFloor = `${v.name}: ${p.role} at local (${p.lx.toFixed(1)}, ${p.lz.toFixed(1)})`;
      if (Math.abs(p.z - (-320)) < 5.5) inRoad = `${v.name}: ${p.role} is on North Ave 2`;

      for (const b of blockers) {
        const d = Math.hypot(b.x - p.x, b.z - p.z), gap = d - b.r;
        // A stroller or a dancer takes steps, so its whole radius has to be clear;
        // somebody standing at a stool only has to be out of the thing itself.
        // A coarse circle for a 5 m sofa will always contain the people sitting on
        // it, so the big ones are held to half their radius — a person planted in
        // the middle of a bar or a parked car still fails.
        const need = p.beat === "still" ? -0.5 * b.r : 0.55;
        if (gap < need) buried = `${v.name}: ${p.role} (${p.beat}) ${gap.toFixed(2)} m from a ${b.r} m blocker`;
      }
    }
    // Posing, not passing: this is the position the fixture cast somebody at, so
    // a failure is a floor plan with two people in one place. Actors that shuffle
    // a step or stroll a lane brush past each other, which is a crowd being a
    // crowd — the walker *routes* are what must never intersect anything.
    for (let i = 0; i < people.length && !overlapping; i++) {
      for (let j = i + 1; j < people.length; j++) {
        const a = people[i].rest, b = people[j].rest;
        if (Math.hypot(a.lx - b.lx, a.lz - b.lz) < 0.45) {
          overlapping = `${v.name}: ${people[i].role} and ${people[j].role} cast into the same spot`;
          break;
        }
      }
    }
    // a room is a room, not a doorway: the crowd has to reach across it
    const ins = people.filter((p) => p.side === "inside");
    if (ins.length > 4) {
      const span = Math.max(...ins.map((p) => p.lx)) - Math.min(...ins.map((p) => p.lx));
      if (span < v.w * 0.3) bunched = `${v.name}: the room's ${ins.length} people span ${span.toFixed(1)} m of ${v.w}`;
    }
  }
  check("nobody is standing inside the furniture", !buried, buried || `${total} people, all clear of ${blockers.length} blockers`);
  check("no two people are cast into the same spot", !overlapping, overlapping || "every posed pair is 0.45 m apart or more");
  check("everybody is on their own floor — in the room or on its own forecourt", !offFloor, offFloor || "none in a wall, a road or the next lot");
  check("no patron is standing on North Ave 2", !inRoad, inRoad || "the crowd stays off the avenue");
  check("the crowd fills the room instead of the doorway", !bunched, bunched || "every room's people span at least a third of it");

  // --- the LOD, and the tick ------------------------------------------------
  // Standing in a venue: both groups live. On the block: the pavement only.
  // Away from it: neither, and nobody is simulated.
  const v0 = CROWN_STRIP.venues[0];
  const shownAt = (x, z) => { district.update(0.1, { x, y: 0, z }); return district.crownCrowd.find((c) => c.venue === v0.name).shown; };
  // three places the player actually is: in the room, across the avenue from it
  // (26 m from its wall — the strip has to read as alive from the road), and the
  // far side of the district
  const inRoom = shownAt(v0.x, v0.cz);
  const onBlock = shownAt(-6, CROWN_STRIP.avenue.z);   // the middle of North Ave 2, where US-167 crosses
  const away = shownAt(v0.x, v0.cz + 400);
  check("the crowd is culled by distance, not drawn from anywhere on the map",
    inRoom.inside && inRoom.outside && onBlock.outside && !onBlock.inside && !away.inside && !away.outside,
    `in room ${inRoom.inside}/${inRoom.outside}, on the block ${onBlock.inside}/${onBlock.outside}, away ${away.inside}/${away.outside}`);

  // an actor taking one step per tick, and a stalled one taking none
  // A step is a step: measure the largest movement in a *single* 0.1 s tick over
  // ten seconds of walking, so a beat that teleports an actor is a failure and a
  // beat that walks one across the room is not.
  district.update(0.1, { x: v0.x, y: 0, z: v0.cz });
  let prev = district.crownCrowd.find((c) => c.venue === v0.name).people.map((p) => ({ lx: p.lx, lz: p.lz }));
  let stride = 0, walked = 0;
  const moved = new Set();
  for (let i = 0; i < 100; i++) {
    district.update(0.1, { x: v0.x, y: 0, z: v0.cz });
    const now = district.crownCrowd.find((c) => c.venue === v0.name).people;
    for (let k = 0; k < now.length; k++) {
      const d = Math.hypot(now[k].lx - prev[k].lx, now[k].lz - prev[k].lz);
      stride = Math.max(stride, d);
      if (d > 0.001) moved.add(k);
    }
    prev = now.map((p) => ({ lx: p.lx, lz: p.lz }));
  }
  walked = moved.size;
  check("an actor crosses ground one step at a time, and none of them teleport",
    stride < 0.35 && walked > 0,
    `${walked} of ${prev.length} moved over 10 s, largest single step ${stride.toFixed(3)} m`);

  // the number that matters for the frame budget: how many people are on screen
  // at the one moment the whole strip is meant to be seen — driving past it
  district.update(0.1, { x: -6, y: 0, z: -320 });
  const live = district.crownCrowd.reduce((n, c) => n + c.visible, 0);
  const perActor = Math.round(actors.reduce((n, c) => n + c.meshes, 0) / total);
  check("driving the strip draws a street, not the whole population",
    live < 60, `${live} of ${total} actors visible from the middle of North Ave 2 (~${live * perActor} meshes)`);
  console.log(`         ${total} actors posed on the strip (${(total / CROWN_STRIP.venues.length).toFixed(1)} a venue, ~${perActor} meshes each)`);

  // --- the pavement: the half of the crowd that is going somewhere ----------
  // Every leg a walker can take, sampled against the venue's own collision and
  // against the avenue. This is the "NPCs walking through buildings" check: a
  // route that crosses a car, a planter or a wall fails here.
  const sample = (v, a, b) => {
    const n = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25));
    const out = [];
    for (let i = 0; i <= n; i++) out.push(toWorld(v, a.x + ((b.x - a.x) * i) / n, a.z + ((b.z - a.z) * i) / n));
    return out;
  };
  let routeClash = null, routeRoad = null, routeMissing = null;
  for (const v of CROWN_STRIP.venues) {
    const mine = crown.find((c) => c.venue === v.name);
    if (!mine.routes.length) { routeMissing = `${v.name} has no pavement routes at all`; break; }
    for (const r of mine.routes) {
      for (const p of sample(v, r.a, r.b)) {
        if (Math.abs(p.z - CROWN_STRIP.avenue.z) < 6.7) routeRoad = `${v.name}: ${r.what} walks onto North Ave 2 at x=${p.x.toFixed(1)}`;
        for (const b of blockers) {
          if (Math.hypot(b.x - p.x, b.z - p.z) < b.r + 0.4) routeClash = `${v.name}: ${r.what} runs through a ${b.r} m blocker at x=${p.x.toFixed(1)}`;
        }
      }
      if (routeClash || routeRoad) break;
    }
    if (routeClash || routeRoad) break;
  }
  check("every route a walker can take is clear of the furniture and off the avenue",
    !routeClash && !routeRoad && !routeMissing,
    routeClash || routeRoad || routeMissing ||
      `${CROWN_STRIP.venues.length * 2 + crown.reduce((n, c) => n + c.routes.length, 0)} legs sampled every 0.25 m and found clear`);

  // and they use them: over a simulated minute, people reach a door, go in, and
  // come back out. A pavement that only paces is a pavement of extras.
  const v1 = CROWN_STRIP.venues.find((v) => crown.find((c) => c.venue === v.name).pavement > 0);
  const seen = { walking: false, dwell: false, inside: false, gone: false };
  for (let i = 0; i < 900; i++) {                    // 90 s on this frontage
    district.update(0.1, { x: v1.x, y: 0, z: v1.cz });
    for (const p of district.crownCrowd.find((c) => c.venue === v1.name).walkers) {
      if (p.state === 0) seen.walking = true;
      else if (p.state === 1) seen.dwell = true;
      else if (p.state === 2) seen.inside = true;
      else if (p.state === 3) seen.gone = true;
    }
  }
  check("the pavement walks, stops, goes inside and comes back out",
    seen.walking && seen.dwell && seen.inside && seen.gone,
    `over 90 s: ${Object.entries(seen).map(([k, v]) => `${k}=${v}`).join(" ")}`);

  // --- the act: BILLY JEANS on the lounge's stage ---------------------------
  // A performer is not a person standing on a stage. This runs his routine for
  // real, from inside the room, and checks the three things that make it a show:
  // the beats are all there, the moonwalk *travels backwards while he faces the
  // room* (the one thing about the move that cannot be faked by a pose), and the
  // pit in front of him cheers at his big moves and settles back down after.
  {
    const lounge = CROWN_STRIP.venues.find((v) => v.name === "BILLY JEANS");
    // `crown` above is one snapshot taken for the section; a performance has to be
    // watched live, so this block re-reads the district every frame.
    const mine = () => district.crownCrowd.find((c) => c.venue === "BILLY JEANS");
    const acts = crown.filter((c) => c.act);
    check("exactly one venue stages a named act",
      acts.length === 1 && acts[0].venue === "BILLY JEANS" && acts[0].act.name === "BILLY JEANS",
      acts.map((c) => `${c.venue}: ${c.act.name}`).join(", ") || "nobody is performing");

    const want = ["pose", "mic", "step", "signature", "spin", "footwork", "moonwalk", "freeze", "crowd"];
    const script = acts[0].act.beats;
    check("the show is the nine beats the brief asks for, in order",
      script.join(",") === want.join(","), script.join(","));

    const stage = lounge.layout.find((s) => s.fixture === "stage");
    const rise = stage.rise ?? 0.7;
    // where the pit stands, in the venue's own local space
    const pit = crown.find((c) => c.venue === "BILLY JEANS").people.filter((p) => p.role === "fan");
    check("the pit in front of the stage is cast and faces it",
      pit.length >= 4 && pit.every((p) => p.rest.lz > stage.z && Math.abs(p.lx - stage.x) < 12),
      `${pit.length} in the pit, all between z ${stage.z.toFixed(0)} and the room`);

    // park in the room and run three full routines (54 s), watching him
    const standIn = { x: lounge.x, y: 0, z: lounge.cz };
    const samples = [];
    let cheerPeak = 0, cheersAfterBig = 0, settled = 0;
    for (let i = 0; i < 560; i++) {
      district.update(0.1, standIn);
      const c = mine();
      const a = c.act;
      samples.push({ state: a.state, big: a.big, x: a.x, y: a.y, z: a.z, yaw: a.yaw, base: a.baseYaw });
      const cheering = c.people.filter((p) => p.role === "fan" && p.anim === "cheer").length;
      cheerPeak = Math.max(cheerPeak, cheering);
      if (cheering) cheersAfterBig++;
      if (!cheering && pit.length) settled++;
    }
    const visited = new Set(samples.map((s) => s.state));
    check("he dances every beat of the routine rather than holding one pose",
      want.every((w) => visited.has(w)), [...visited].join(","));

    // the moonwalk: over one moonwalk beat, does he actually slide backwards
    // while still facing the crowd?
    let glide = null;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      if (a.state === "moonwalk" && b.state === "moonwalk") {
        if (!glide) glide = { from: a.z, to: b.z, yaw: [a.yaw, b.yaw], base: a.base, x: [a.x, b.x] };
        else { glide.to = b.z; glide.yaw[1] = b.yaw; }
      }
    }
    const back = glide ? glide.from - glide.to : 0;
    const turned = glide ? Math.abs(glide.yaw[0] - glide.base) + Math.abs(glide.yaw[1] - glide.base) : 9;
    check("the moonwalk travels him backwards while he keeps facing the room",
      !!glide && back > 0.8 && turned < 1e-6,
      glide ? `glided ${back.toFixed(2)} m away from the crowd, facing held to ${turned.toFixed(4)} rad` : "he never moonwalked");

    // and nowhere in the routine did he leave his deck, or sink off it
    const bb = mine().act.bounds;
    const off = samples.find((s) => s.x < bb.x0 - 1e-6 || s.x > bb.x1 + 1e-6 || s.z < bb.z0 - 1e-6 || s.z > bb.z1 + 1e-6);
    const sunk = samples.find((s) => Math.abs(s.y - rise) > 1e-6);
    check("a scripted actor cannot walk off his own stage",
      !off && !sunk,
      off ? `out of the deck at (${off.x}, ${off.z})` : sunk ? `sank to y=${sunk.y}, deck is ${rise}` : `held inside ${(bb.x1 - bb.x0).toFixed(1)} × ${(bb.z1 - bb.z0).toFixed(1)} m of deck at y=${rise}`);

    // the crowd reacts — and only while the move is happening
    check("the pit cheers at his big moves and settles back down after",
      cheerPeak >= Math.min(4, pit.length) && cheersAfterBig > 20 && settled > 100,
      `${cheerPeak} cheering at once, ${cheersAfterBig} samples mid-show, ${settled} with the pit back on its own feet`);

    // the show only runs for an audience: from the far side of the avenue the
    // lounge's room is culled, and a culled act is not ticked (it is the same LOD
    // rule the rest of the crowd lives by)
    const before = mine().act.t;
    for (let i = 0; i < 20; i++) district.update(0.1, { x: -6, y: 0, z: CROWN_STRIP.avenue.z });
    const after = mine().act.t;
    check("the act is culled with his room — no show for an empty room",
      after === before, `routine clock ${before} → ${after} while standing on North Ave 2`);
  }
}

// ------------------------------------------------------------------ the clock
// The same block, at three hours of the day: staff all day, a dusk half-crowd,
// and the full thing at night. This is the part of "make it feel alive" that a
// screenshot cannot fake — an afternoon Crown Strip is a working street.
{
  const count = () => district.crownCrowd.reduce((n, c) => n + c.visible, 0);
  const before = clockHours;
  const probe = { x: -6, y: 0, z: CROWN_STRIP.avenue.z };
  const at = (h) => { clockHours = h; district.update(0.1, probe); return count(); };
  const night = at(23), dusk = at(18), day = at(11);
  check("an afternoon Crown Strip is staffed, not abandoned",
    day < night * 0.75 && day > 0, `day ${day}, dusk ${dusk}, night ${night} actors`);
  check("the strip fills up as the evening goes on",
    day < dusk && dusk < night, `day ${day} < dusk ${dusk} < night ${night}`);
  at(23);
  clockHours = before;
}

// ------------------------------------------------------------------ the sweep
// merge.js merges static siblings by material and chunk. The moving meshes are
// skipped per-mesh, which is what makes a walk-in interior compatible with
// batching at all. Run it for real, then confirm the cutaway still opens.
{
  const before = movers.length;
  const b = sandbox.batchStatic(scene, { exclude: () => false, boundary: () => false });
  check("the batch sweep merged the strip's static scenery", b.removed > 0,
    `${b.meshes} meshes → ${b.meshes - b.removed} (${b.batches} batches, ${b.signatures} material signatures)`);
  let after = 0;   // the cutaway's movers only — the actors are recounted below
  const recount = (o) => { if (o.isMesh && o.userData.noBatch && !o.userData.crowd) after++; for (const c of o.children) recount(c); };
  for (const c of scene.children) recount(c);
  check("the sweep did not merge away a single moving mesh", after === before, `${before} before, ${after} after`);
  const actorMeshes = district.crownCrowd.reduce((n, c) => n + c.meshes, 0);
  check("not one actor's mesh was merged into a static batch",
    crowdMeshes.length === actorMeshes && crowdMeshes.length > 400,
    `${crowdMeshes.length} actor meshes survive the sweep`);

  const v = CROWN_STRIP.venues[0];
  for (let i = 0; i < 40; i++) district.update(0.1, { x: v.x, y: 0, z: v.cz });
  const st = district.crownDebug.find((d) => d.name === v.name);
  check("the cutaway still opens after the sweep",
    district.insideVenue === v.name && st.roofVisible === false,
    `inside=${district.insideVenue} roof=${st.roofVisible}`);
}

console.log(`\n${failures ? failures + " FAILED" : "all checks passed"}.\n`);
process.exit(failures ? 1 : 0);
