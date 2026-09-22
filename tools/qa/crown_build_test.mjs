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
const context2d = {
  fillStyle: "", font: "", textAlign: "", textBaseline: "", shadowColor: "",
  shadowBlur: 0, lineWidth: 0, strokeStyle: "",
  fillRect() {}, fillText() {}, strokeRect() {}, measureText: () => ({ width: 10 }),
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
  class Q { setFromEuler() { return this; } setFromAxisAngle() { return this; } }
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
      this.castShadow = false; this.receiveShadow = false; this.renderOrder = 0;
    }
    add(...os) { for (const o of os) { if (!o) continue; o.parent = this; this.children.push(o); } return this; }
    remove(o) { const i = this.children.indexOf(o); if (i >= 0) { this.children.splice(i, 1); o.parent = null; } return this; }
    traverse(cb) { cb(this); for (const c of this.children) c.traverse(cb); }
    updateMatrix() { this.matrix.__t.copy(this.position); return this; }
    updateMatrixWorld() { this.matrix.updateMatrix(); this.matrixWorld.__t.copy(this.position); return this; }
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
  }
  const geo = (type) => class extends Geo { constructor(...a) { super(); this.type = type; this.parameters = { args: a }; } };
  class Col {
    constructor(hex) { this.hex = hex >>> 0; }
    getHexString() { return this.hex.toString(16).padStart(6, "0"); }
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
  }
  class CanvasTexture { constructor(c) { this.image = c; this.repeat = new V(1, 1); this.offset = new V(); } }

  return {
    Vector2: V, Vector3: V, Matrix4: M4, Quaternion: Q, Euler: E, Box3, Sphere, Material,
    Object3D: Obj3D, Group: class extends Obj3D {}, Mesh, InstancedMesh,
    BoxGeometry: geo("BoxGeometry"), CylinderGeometry: geo("CylinderGeometry"),
    SphereGeometry: geo("SphereGeometry"), ConeGeometry: geo("ConeGeometry"),
    PlaneGeometry: geo("PlaneGeometry"), TorusGeometry: geo("TorusGeometry"),
    MeshStandardMaterial: Material, MeshBasicMaterial: Material,
    CanvasTexture, SRGBColorSpace: "srgb",
    MathUtils: { smoothstep: (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }, lerp: (a, b, t) => a + (b - a) * t },
  };
}

// ------------------------------------------------------------------ the sandbox
const calls = { blockers: 0, litSpots: 0, services: 0 };
const scene = { children: [], add(...os) { for (const o of os) if (o) scene.children.push(o); } };

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
  placeStreetClutter() {}, placeBillboard() {}, placeParkedCar() {},
  placeGunShop() {}, placeTacos() {}, placeBurgerPiz() {}, placeSixTwelve() {}, placeGasStation() {},
};
vm.createContext(sandbox);

const strip = (file) => `"use strict";\n` + fs.readFileSync(path.join(SRC, file), "utf8")
  .replace(/export /g, "")
  .replace(/import[\s\S]*?from\s*['"].*?['"];/g, "");

for (const f of ["composer.js", "tusouxroeNorth.js"]) {
  try { vm.runInContext(strip(f), sandbox, { filename: f }); }
  catch (e) { console.error(`load ${f}: ${e.stack || e}`); process.exit(1); }
}

const mockCtx = {
  scene,
  camera: { position: { x: 0, y: 0, z: 0 } },
  surface: () => ({ material: () => ({ userData: {} }) }),
  roadMaterial: () => ({ userData: {} }),
  addBlocker: () => { calls.blockers++; },
  addLitSpot: () => { calls.litSpots++; },
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
check("no mesh has a NaN or unset transform",
  crowned.every((m) => [m.position.x, m.position.y, m.position.z, m.rotation.x, m.rotation.y, m.rotation.z].every(Number.isFinite)));
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

console.log(`\n${failures ? failures + " FAILED" : "all checks passed"}.\n`);
process.exit(failures ? 1 : 0);
