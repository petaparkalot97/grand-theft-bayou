import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { loadAtlas, AnimatedSprite } from "./sprite.js";
import {
  GFX, TIERS, autoTier, nextTier, initRenderer, createEnvironment,
  createComposer, createGovernor, realize, surface, MIST,
} from "./graphics.js";
import { addLamp, createHeadlights, createWetRoads, updateFx } from "./fx.js";
import { BlockerGrid } from "./spatial.js";
import { createSoundtrack } from "./music.js";
import { batchStatic } from "./merge.js";
import { createNpcSystem } from "./npc.js";
import { createCameraController } from "./camera.js";
import { createTraffic } from "./traffic.js";
import { randomHoodrat } from "./characters.js";

// ---------------------------------------------------------------- config
// North Louisiana, US-167: Chatham (south) -> Monroe strip (middle) -> Ruston (north).
const WORLD = 136;           // half-size of the map
const CAN_GOAL = 4;
const ROAD_X = -6;           // the highway runs N/S along this line
const ROAD_HALF = 5;         // half road width
const LOT_X = 24;            // how far off the centre line a lot's building sits
const TRUCK_Z = -116;
const SPAWN_Z = 130;         // bottom of the map
const SIGN_Z = 126;          // Louisiana sign, just north (in front) of the spawn

// Every business lines the highway. [type, side(+1 = player's RIGHT / -1 = LEFT), z].
// Player spawns at the sign facing NORTH, so +1 is east (their right).
const LANDMARKS = [
  ["burgerpiz",  -1, 126],   // immediate LEFT of spawn
  ["gasstation", +1, 108],   // gas station — player's RIGHT, just past the sign
  ["sixtwelve",  -1, 100],   // 6twelve — player's LEFT
  ["popeyes",    +1,  84],
  ["popeyes",    -1,  78],
  ["burgerpiz",  +1,  56],
  ["popeyes",    -1,  52],
  ["taco",       -1,  28],
  ["popeyes",    +1,  30],
  ["popeyes",    +1,   6],
  ["popeyes",    -1, -14],
  ["popeyes",    +1, -34],
  ["popeyes",    -1, -54],
  ["popeyes",    +1, -74],
  ["popeyes",    -1, -94],
];
const landmarkPos = (side, z) => [ROAD_X + side * LOT_X, z];

const KEEPOUT = [
  ...LANDMARKS.map(([, side, z]) => {
    const [x, lz] = landmarkPos(side, z);
    return { x, z: lz, r: 22 };
  }),
  { x: -46, z: 112, r: 22 },   // trailer park
  { x: 46, z: 92, r: 22 },     // junkyard
  { x: 30, z: 70, r: 10 },     // shack
];
function inKeepout(x, z) {
  if (Math.abs(x - ROAD_X) < ROAD_HALF + 4) return true;         // road corridor
  if (Math.abs(x - ROAD_X) < LOT_X + 14) return true;            // the whole strip frontage
  if (Math.hypot(x - ROAD_X, z - SPAWN_Z) < 24) return true;     // clear the spawn + sign
  if (z < -50) return true;                                      // Ruston
  return KEEPOUT.some((k) => Math.hypot(x - k.x, z - k.z) < k.r);
}

const overlay = document.getElementById("overlay");
const loadNote = document.getElementById("loadNote");
const startBtn = document.getElementById("startBtn");
const hpFill = document.getElementById("hpFill");
const spFill = document.getElementById("spFill");
const cansEl = document.getElementById("cans");
const objEl = document.getElementById("objective");
const crosshair = document.getElementById("crosshair");

// ---------------------------------------------------------------- renderer / scene
GFX.tier = autoTier();

const renderer = new THREE.WebGLRenderer({
  antialias: false,          // SMAA in the composer does this properly
  powerPreference: "high-performance",
  stencil: false,
});
renderer.setSize(innerWidth, innerHeight);
initRenderer(renderer);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// Aerial perspective. Keep it thin — the whole point of the PBR pass is that
// you can see surface detail down the strip.
scene.fog = new THREE.FogExp2(0x24353f, 0.0072);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.3, 420);
const CAM_OFFSET = new THREE.Vector3(0, 15, 15);

// Physical sky baked to a PMREM probe — this replaces the old flat ambient and
// is what makes every metal, glass and wet surface in the scene read correctly.
// Elevation just under the horizon = deep blue "blue hour" night that still
// carries enough light to read a surface, rather than pitch black.
const env = createEnvironment(scene, renderer, {
  elevation: -1.8, azimuth: 196, turbidity: 4.5, rayleigh: 3.4,
  environmentIntensity: 2.4, backgroundIntensity: 1.0,
});

const composer = await createComposer(renderer, scene, camera);

// Wet asphalt with a mirror pass under the road, and the player's headlights.
// Both live in fx.js; the wet shader is attached to the roads once they exist.
const wetRoads = createWetRoads(renderer, scene, camera);
wetRoads.setQuality(GFX.preset.reflect, GFX.preset.reflectEvery);
const headlights = createHeadlights(scene);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.resize();
  wetRoads.resize();
});

// ---------------------------------------------------------------- lights
// The IBL probe carries the ambient term now, so these are just the two key
// lights: hard moonlight, and a very low warm bounce off the ground haze.
scene.add(new THREE.HemisphereLight(0x4a6a8c, 0x2a2c1c, 0.85));
const moon = new THREE.DirectionalLight(0xc8d8ff, 2.8);
moon.position.set(-40, 60, -20);
moon.castShadow = true;
moon.shadow.mapSize.set(GFX.preset.shadow, GFX.preset.shadow);
const s = 70;
moon.shadow.camera.left = -s; moon.shadow.camera.right = s;
moon.shadow.camera.top = s; moon.shadow.camera.bottom = -s;
moon.shadow.camera.near = 1;
moon.shadow.camera.far = 220;
moon.shadow.bias = -0.0006;
moon.shadow.normalBias = 0.035;
moon.shadow.radius = 3;
scene.add(moon);
scene.add(moon.target);

// ---------------------------------------------------------------- helpers
/** Let the browser paint before the next block of synchronous work. */
const paint = () =>
  new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

const loadManager = new THREE.LoadingManager();
// Two packs reference textures that aren't where their FBX says: the
// Designersoup cars point one folder above their .fbm directory, and the
// Trailer Park characters carry an absolute path from the author's machine.
// Both sets of materials are replaced with the right textures after loading,
// so redirect those requests instead of letting them 404 into the console.
const BLANK_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
loadManager.setURLModifier((url) => {
  if (/(^|\/)C:\/Users\//i.test(url)) return BLANK_PNG;
  if (/\/cars\/387359c5580f06c08c266126b3b46db47e48ba44\.png$/.test(url)) {
    return "./assets/models/cars/docLorean.fbm/387359c5580f06c08c266126b3b46db47e48ba44.png";
  }
  return url;
});
const gltfLoader = new GLTFLoader(loadManager);
const fbxLoader = new FBXLoader(loadManager);
const texLoader = new THREE.TextureLoader(loadManager);
const rng = mulberry32(20240901);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = (lo, hi) => lo + (hi - lo) * rng();

// ---------------------------------------------------------------- ground + water
// Bayou floor: the same hand-mixed swamp palette as before, but at 4x the
// resolution and run through the PBR deriver so it gets real relief.
function groundTexture() {
  const S = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.fillStyle = "#2e3d24"; x.fillRect(0, 0, S, S);
  const cols = ["#37481f", "#283a2a", "#3d3016", "#22331c", "#45532b", "#1a2a16", "#4e5a33"];
  for (let i = 0; i < 7000; i++) {
    x.fillStyle = cols[(Math.random() * cols.length) | 0];
    x.globalAlpha = 0.1 + Math.random() * 0.22;
    const r = 1 + Math.random() * 13;
    x.beginPath();
    x.ellipse(Math.random() * S, Math.random() * S, r, r * (0.4 + Math.random()), Math.random() * 6, 0, 7);
    x.fill();
  }
  // blades / litter, so the surface has fine detail to catch the moonlight
  x.lineWidth = 1;
  for (let i = 0; i < 4000; i++) {
    const px = Math.random() * S, py = Math.random() * S, a = Math.random() * 6, len = 2 + Math.random() * 6;
    x.strokeStyle = cols[(Math.random() * cols.length) | 0];
    x.globalAlpha = 0.25 + Math.random() * 0.45;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
    x.stroke();
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 30);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = GFX.maxAniso;
  return t;
}

let ground;
function buildGround() {
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD * 2.4, WORLD * 2.4, 1, 1),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  scene.add(ground);
  realize(ground, { hint: "grass ground", shadows: false });
  ground.receiveShadow = true;
  // The derived maps inherit the albedo's repeat, which is what we want here,
  // but the relief needs dialling back at this tiling or it reads as gravel.
  ground.material.normalScale.set(0.6, 0.6);
}

// Standing bayou water. A true mirror finish reflects the whole sky probe and
// reads as pale sand from a high camera, so this is deliberately a duller,
// wind-rippled surface: dark body, broad specular, a tight clearcoat on top.
const waterMat = new THREE.MeshPhysicalMaterial({
  color: 0x07120f, roughness: 0.22, metalness: 0.0,
  transparent: true, opacity: 0.9,
  envMapIntensity: 0.9, clearcoat: 1, clearcoatRoughness: 0.16,
});
waterMat.userData.gtbRealized = true;
const waterPatches = [];
for (let i = 0; i < 9; i++) {
  const w = rand(10, 26), d = rand(10, 26);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 6, 6), waterMat);
  p.rotation.x = -Math.PI / 2;
  p.position.set(rand(-WORLD + 15, WORLD - 15), 0.04, rand(-WORLD + 15, WORLD - 15));
  p.receiveShadow = true;
  scene.add(p);
  waterPatches.push(p);
  p.userData.base = p.geometry.attributes.position.array.slice();
}

// ---------------------------------------------------------------- light pool
// A US-167 strip at night is defined by its lighting: sodium pole lights over
// every parking lot, spaced streetlamps down the shoulder. Lighting all ~30 of
// them at once would blow the forward renderer's per-object light budget, so
// instead a small pool of real lights is recycled onto whichever spots are
// nearest the camera. Anything further away still reads, via emissive bulbs.
const litSpots = [];
const lightPool = [];
function initLightPool(n = 8) {
  for (let i = 0; i < n; i++) {
    const l = new THREE.PointLight(0xffc27a, 0, 40, 2);
    scene.add(l);
    lightPool.push(l);
  }
}
// Every static light in the level goes through the pool too. Each PointLight in
// the scene is evaluated for every lit pixel on screen, so ~20 always-on lights
// were the single biggest shading cost; pooled, only the nearest 8 are real.
// `group`: position is local to a builder's group (converted to world here).
function poolLight(color, power, range, x, y, z, group) {
  const p = new THREE.Vector3(x, y, z);
  if (group) {
    group.updateMatrixWorld(true);
    p.applyMatrix4(group.matrixWorld);
  }
  litSpots.push({ x: p.x, y: p.y, z: p.z, warm: color, power, range, fx: false });
}

let poolTimer = 0;
function updateLightPool(dt, focus) {
  poolTimer -= dt;
  if (poolTimer > 0 || !litSpots.length) return;
  poolTimer = 0.25;                       // 4 Hz is plenty for this
  for (const sp of litSpots) {
    sp.d = (sp.x - focus.x) ** 2 + (sp.z - focus.z) ** 2;
  }
  litSpots.sort((a, b) => a.d - b.d);
  for (let i = 0; i < lightPool.length; i++) {
    const l = lightPool[i];
    const sp = litSpots[i];
    // Parked at zero intensity rather than hidden: toggling .visible changes
    // the scene's light count, which recompiles every lit shader mid-frame.
    if (!sp || sp.d > 90 * 90) { l.intensity = 0; continue; }
    l.position.set(sp.x, sp.y, sp.z);
    l.color.setHex(sp.warm);
    l.distance = sp.range;
    // fade the outermost lights in rather than popping them on
    l.intensity = sp.power * THREE.MathUtils.smoothstep(90 * 90 - sp.d, 0, 30 * 30);
  }
}

// ---------------------------------------------------------------- collision registry
const blockers = [];   // { x, z, r }  circular obstacles
// Spatial index over `blockers`: movers only test what is near them.
const blockerGrid = new BlockerGrid(8);
function addBlocker(x, z, r) {
  const b = { x, z, r };
  blockers.push(b);
  blockerGrid.addStatic(b);
  return b;
}

// ---------------------------------------------------------------- trees (wall of swamp)
function buildTrees() {
  // more sides now that they're lit properly — 5-sided trunks silhouette badly
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 3.4, 10);
  const foliageGeo = new THREE.ConeGeometry(1.9, 4.6, 12);
  // colour multiplies the generated albedo, so these stay near-white and let
  // the "dirt" / "grass" palettes do the work
  const trunkMat = surface("dirt", 512).material(2, { color: 0xc9b49a, envMapIntensity: 0.7 });
  const foliageMat = surface("grass", 512).material(3, { color: 0xb9d69a, envMapIntensity: 0.8 });
  trunkMat.normalScale.set(2.2, 2.2);
  foliageMat.normalScale.set(1.6, 1.6);
  const N = 460;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
  const foliage = new THREE.InstancedMesh(foliageGeo, foliageMat, N);
  trunks.castShadow = foliage.castShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < N; i++) {
    let x, z, ring = i < N * 0.45;
    if (ring) {
      const a = rng() * Math.PI * 2;
      const rad = WORLD - rand(0, 16);
      x = Math.cos(a) * rad; z = Math.sin(a) * rad;
    } else {
      x = rand(-WORLD + 10, WORLD - 10);
      // bias the scatter toward the southern swamp
      z = rng() < 0.7 ? rand(20, WORLD - 10) : rand(-WORLD + 10, WORLD - 10);
      if (Math.hypot(x, z - 100) < 12) continue;   // clear the spawn
    }
    if (inKeepout(x, z)) continue;      // keep landmarks / road / city clear
    const h = rand(0.8, 1.5);
    sc.set(h, h, h);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6);
    m.compose(new THREE.Vector3(x, 1.7 * h, z), q, sc);
    trunks.setMatrixAt(n, m);
    m.compose(new THREE.Vector3(x, 4.6 * h, z), q, sc);
    foliage.setMatrixAt(n, m);
    addBlocker(x, z, 0.7 * h);
    n++;
  }
  trunks.count = foliage.count = n;
  scene.add(trunks, foliage);
}

// ---------------------------------------------------------------- kit loading
const urbanTex = {};
function loadUrbanTextures() {
  const a = texLoader.load("./assets/models/urban/textures/demo_texture_512x512_albedo_psified.png");
  a.colorSpace = THREE.SRGBColorSpace; a.flipY = false;
  urbanTex.albedo = a;
}
loadUrbanTextures();

const kitCache = new Map();
function loadKit(path) {
  if (kitCache.has(path)) return kitCache.get(path);
  const p = new Promise((res) => {
    gltfLoader.load(
      `./assets/models/urban/${path}`,
      (g) => {
        g.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            o.material = new THREE.MeshStandardMaterial({ map: urbanTex.albedo, roughness: 0.9 });
          }
        });
        // urban kit = roads, kerbs, pillars, pavement — all masonry
        realize(g.scene, { hint: "concrete masonry " + path });
        res(g.scene);
      },
      undefined,
      () => res(null)
    );
  });
  kitCache.set(path, p);
  return p;
}

function placeKit(scene3, x, z, rotY = 0, scale = 1) {
  if (!scene3) return null;
  const o = scene3.clone(true);
  o.position.set(x, 0, z);
  o.rotation.y = rotY;
  o.scale.setScalar(scale);
  scene.add(o);
  return o;
}

// ---------------------------------------------------------------- vehicles
function loadVehicle(file, texFile) {
  return new Promise((res) => {
    const tex = texLoader.load(`./assets/models/vehicles/${texFile}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    fbxLoader.load(
      `./assets/models/vehicles/${file}`,
      (obj) => {
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const scl = 3.4 / Math.max(size.x, size.y, size.z); // normalise to ~car length
        obj.scale.setScalar(scl);
        obj.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            o.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.2 });
          }
        });
        // clearcoat car paint + chrome + glass, picked per submesh name
        realize(obj, { hint: "vehicle carpaint" });
        const box2 = new THREE.Box3().setFromObject(obj);
        obj.position.y = -box2.min.y;
        res(obj);
      },
      undefined,
      () => res(fallbackCar(tex))
    );
  });
}
function fallbackCar(tex) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 4.4),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  body.position.y = 0.75; body.castShadow = true;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 2),
    new THREE.MeshStandardMaterial({ color: 0x222222 }));
  cab.position.set(0, 1.5, -0.2); cab.castShadow = true;
  g.add(body, cab);
  return g;
}

// --- generic GLB loader (keeps embedded materials, just tweaks them) ---
// cullRe: drop interior clutter / scenery meshes we don't need (perf)
const glbCache = new Map();
function loadGLB(path, cullRe, keepRe) {
  const key = path + (cullRe ? "|c" + cullRe.source : "") + (keepRe ? "|k" + keepRe.source : "");
  if (glbCache.has(key)) return glbCache.get(key);
  const p = new Promise((res) => {
    gltfLoader.load(path, (g) => {
      const doomed = [];
      g.scene.traverse((o) => {
        if (o.isMesh) {
          const nm = o.name || "";
          if (keepRe && !keepRe.test(nm)) { doomed.push(o); return; }
          if (cullRe && cullRe.test(nm)) { doomed.push(o); return; }
          o.castShadow = true; o.receiveShadow = true;
          if (o.material) {
            o.material.roughness = 0.85;
            o.material.metalness = 0.0;
            if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
          }
        }
      });
      doomed.forEach((m) => m.parent && m.parent.remove(m));
      // GLBs keep their authored materials; realize() only adds what's missing
      // (normal / ORM / envMapIntensity) and reclassifies glass + metal trim.
      realize(g.scene, { hint: path });
      res(g.scene);
    }, undefined, (e) => { console.warn("GLB fail", path, e); res(null); });
  });
  glbCache.set(key, p);
  return p;
}
const CLUTTER = /armchair|chair|shelf|basket|terminal|cash_register|air.?condition|ceiling|urinary|light_fixture|napkin|cup|plate|tray|bottle|sauce|salt|oil|flour|dough|roller|grater|cutter|tongs|ladle|bowl|book|paper|mug|candle/i;

// --- Designersoup low-poly cars (FBX + shared texture in a .fbm folder) ---
function loadDsCar(name) {
  return new Promise((res) => {
    const tex = texLoader.load(
      `./assets/models/cars/${name}.fbm/387359c5580f06c08c266126b3b46db47e48ba44.png`);
    tex.colorSpace = THREE.SRGBColorSpace;
    fbxLoader.load(`./assets/models/cars/${encodeURIComponent(name)}.fbx`, (obj) => {
      const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
      obj.scale.setScalar(4.2 / Math.max(size.x, size.y, size.z));
      obj.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          o.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.25 });
        }
      });
      realize(obj, { hint: "vehicle carpaint " + name });
      const b = new THREE.Box3().setFromObject(obj);
      obj.position.y = -b.min.y;
      res(obj);
    }, undefined, () => res(fallbackCar(null)));
  });
}

// --- generic FBX-with-sidecar-textures loader (6twelve gas station, etc.) ---
// cullRe drops scene-dressing meshes (ground / parking lot / backdrop) so the
// building isn't shrunk to nothing when its footprint is normalised.
function loadFbxScene(fbxPath, texDir, targetSize, cullRe) {
  return new Promise((res) => {
    fbxLoader.setResourcePath(texDir);
    fbxLoader.load(fbxPath, (obj) => {
      if (cullRe) {
        const doomed = [];
        obj.traverse((o) => {
          if (o.isMesh && (cullRe.test(o.name || "") ||
              (Array.isArray(o.material) ? o.material : [o.material]).some((m) => m && cullRe.test(m.name || ""))))
            doomed.push(o);
        });
        doomed.forEach((m) => m.parent && m.parent.remove(m));
      }
      const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
      if (targetSize) obj.scale.setScalar(targetSize / Math.max(size.x, size.z));
      obj.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          const apply = (mat) => {
            if (!mat) return;
            if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
            mat.roughness = mat.roughness ?? 0.85; mat.metalness = 0.05;
            if (/sign|emiss|light|neon|logo|lottery|price/i.test(mat.name || "")) {
              mat.emissive = new THREE.Color(0xffe9c0);
              mat.emissiveIntensity = 0.7;
              if (mat.map) mat.emissiveMap = mat.map;
            }
          };
          Array.isArray(o.material) ? o.material.forEach(apply) : apply(o.material);
        }
      });
      realize(obj, { hint: fbxPath, emissiveBoost: 1.15 });
      const b = new THREE.Box3().setFromObject(obj);
      obj.position.y = -b.min.y;
      fbxLoader.setResourcePath("");
      res(obj);
    }, undefined, (e) => { console.warn("FBX fail", fbxPath, e); fbxLoader.setResourcePath(""); res(null); });
  });
}
const SITE_CLUTTER = /ground|asphalt|parking|road|street|sidewalk|pavement|background|backdrop|terrain|grass|bush|plant|tree|fence|curb|soil|sand|dirt/i;
const loadSixtwelve = () =>
  loadFbxScene("./assets/models/sixtwelve/6twelve.fbx", "./assets/models/sixtwelve/Textures/", 22, SITE_CLUTTER);
const loadGasStation = () =>
  loadFbxScene("./assets/models/gasstation/Gas_station.fbx", "./assets/models/gasstation/Textures/", 24, SITE_CLUTTER);

// --- shack / shed / junk decor from the "Shacks Shanties Sheds" texture pack ---
const shackTex = {};
function shackTexture(file, rep = [1, 1]) {
  const t = texLoader.load(`./assets/models/shacks/${file}`);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = GFX.maxAniso;   // was NearestFilter for the PSX look
  t.repeat.set(rep[0], rep[1]);
  return t;
}
function initShackTex() {
  shackTex.corr = shackTexture("Shed_Corrugated_Texture.png", [3, 2]);
  shackTex.plate = shackTexture("Shed_Plate_Texture.png", [2, 2]);
  shackTex.barrel = shackTexture("Barrel-Texture.png");
  shackTex.pallet = shackTexture("Pallet-Texture.png");
  shackTex.fence = shackTexture("Chainlink-Fence.png", [4, 1]);
  shackTex.barricade = shackTexture("Concrete_Barricade_Texture.png");
  shackTex.concrete = shackTexture("Concrete_Floor_Texture.png", [4, 4]);
}

function makeShed(x, z, ry = 0, w = 7, d = 5) {
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = ry;
  const wallMat = new THREE.MeshStandardMaterial({ map: shackTex.corr, roughness: 1 });
  const roofMat = new THREE.MeshStandardMaterial({ map: shackTex.plate, roughness: 1, metalness: 0.2 });
  const h = 3.2;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  walls.position.y = h / 2; walls.castShadow = true; walls.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.25, d + 0.6), roofMat);
  roof.position.y = h + 0.1; roof.rotation.z = 0.06;
  g.add(walls, roof);
  scene.add(g);
  addBlocker(x, z, Math.max(w, d) * 0.5);
  return g;
}
function makeBarrel(x, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 10),
    new THREE.MeshStandardMaterial({ map: shackTex.barrel, roughness: 0.8, metalness: 0.3 }));
  m.position.set(x, 0.6, z); m.rotation.y = Math.random() * 3; m.castShadow = true;
  scene.add(m);
  addBlocker(x, z, 0.6);
}
function makePallet(x, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 1.6),
    new THREE.MeshStandardMaterial({ map: shackTex.pallet, roughness: 1 }));
  m.position.set(x, 0.13, z); m.rotation.y = ry;
  scene.add(m);
}
function makeFence(x1, z1, x2, z2) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.2),
    new THREE.MeshStandardMaterial({
      map: shackTex.fence, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1,
    }));
  m.material.map = m.material.map.clone();
  m.material.map.repeat.set(len / 2.5, 1);
  m.material.map.needsUpdate = true;
  m.position.set((x1 + x2) / 2, 1.1, (z1 + z2) / 2);
  m.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  scene.add(m);
}

// ---------------------------------------------------------------- gas cans
const cans = [];
function makeCan(x, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.75, 0.32),
    new THREE.MeshStandardMaterial({ color: 0xe23a1e, roughness: 0.5, emissive: 0xd23010, emissiveIntensity: 0.9 })
  );
  body.castShadow = true;
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x333333 }));
  spout.position.set(0.22, 0.5, 0); spout.rotation.z = 0.5;
  g.add(body, spout);
  g.position.set(x, 0.55, z);
  g.userData = { taken: false, baseY: 0.55 };
  scene.add(g);
  cans.push(g);
}

// ---------------------------------------------------------------- Popeyes (everywhere)
function signTexture() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const x = c.getContext("2d");
  x.fillStyle = "#f47216"; x.fillRect(0, 0, 1024, 512);
  x.strokeStyle = "#ffffff"; x.lineWidth = 22;
  x.strokeRect(28, 28, 968, 456);
  x.fillStyle = "#ffffff";
  x.textAlign = "center"; x.textBaseline = "middle";
  x.font = "bold 210px Trebuchet MS, Arial Black, sans-serif";
  x.fillText("POPEYES", 512, 210);
  x.fillStyle = "#7a1f12";
  x.font = "bold 76px Trebuchet MS, Arial";
  x.fillText("LOUISIANA KITCHEN", 512, 380);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const popeyesSign = signTexture();
const signMat = () => new THREE.MeshStandardMaterial({
  map: popeyesSign, emissive: 0xff8a2c, emissiveIntensity: 1.0, emissiveMap: popeyesSign,
});
// Real aggregate asphalt: 2K albedo + derived normal/ORM, so headlights and
// moonlight actually skid across the grain instead of hitting a flat slab.
let asphalt, asphaltMat;
function buildAsphalt() {
  asphalt = surface("asphalt", 1024);
  asphaltMat = asphalt.material(6, { envMapIntensity: 0.9 });
  asphaltMat.normalScale.set(1.9, 1.9);
}

// Painted stalls, drawn over the same aggregate so the derived relief lines up.
function carParkTexture() {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d");
  x.drawImage(asphalt.map.image, 0, 0, S, S);
  x.lineCap = "butt";
  for (let i = S * 0.125; i < S; i += S * 0.1875) {
    // worn paint: several jittered passes rather than one clean stroke
    for (let p = 0; p < 5; p++) {
      x.strokeStyle = `rgba(201,196,176,${0.16 + Math.random() * 0.2})`;
      x.lineWidth = 14 + Math.random() * 5;
      x.beginPath();
      x.moveTo(i + (Math.random() - 0.5) * 5, S * 0.08);
      x.lineTo(i + (Math.random() - 0.5) * 5, S * 0.92);
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = GFX.maxAniso;
  return t;
}
let parkTex;

function makePopeyes(x, z, rot = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8681c, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x8f2016, roughness: 0.8 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(11, 5, 9), wallMat);
  box.position.y = 2.5; box.castShadow = true; box.receiveShadow = true;
  const band = new THREE.Mesh(new THREE.BoxGeometry(11.3, 1.1, 9.3), trimMat);
  band.position.y = 4.6;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.5, 9.6),
    new THREE.MeshStandardMaterial({ color: 0x2f241c }));
  roof.position.y = 5.3;

  // ---- giant pylon sign, taller than any tree ----
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 20, 10),
    new THREE.MeshStandardMaterial({ color: 0x1e1e1e }));
  pole.position.set(9, 10, 7);
  const board = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 0.6), signMat());
  board.position.set(9, 19, 7);
  board.castShadow = true;
  const board2 = board.clone();        // double-sided readability
  board2.rotation.y = Math.PI;
  board.add(board2);
  // a glowing bulb strip on the pylon instead of a real light (light budget)
  const glowBar = new THREE.Mesh(new THREE.BoxGeometry(12.4, 6.4, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.16 }));
  glowBar.position.set(9, 19, 7);

  // ---- rooftop sign ----
  const roofSign = new THREE.Mesh(new THREE.BoxGeometry(9, 2.6, 0.5), signMat());
  roofSign.position.set(0, 7.2, 0);
  const roofSignB = roofSign.clone(); roofSignB.rotation.y = Math.PI; roofSign.add(roofSignB);

  // ---- wall sign over the door ----
  const wsign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.6), signMat());
  wsign.position.set(0, 3.2, 4.55);

  // ---- car park out front (toward +z, faces the road once placed) ----
  const park = new THREE.Mesh(new THREE.PlaneGeometry(20, 13), asphaltMat.clone());
  park.material.map = parkTex;
  park.rotation.x = -Math.PI / 2;
  park.position.set(0, 0.04, 11.5);
  park.receiveShadow = true;
  g.add(box, band, roof, pole, board, glowBar, roofSign, wsign, park);
  scene.add(g);

  // a couple of cars parked out front
  parkedCarSpots.push({ x, z, rot });

  // collision: building footprint + pole
  for (const [bx, bz] of [[0, 4.5], [0, -4.5], [5.5, 0], [-5.5, 0], [0, 0]]) {
    const wx = x + bx * Math.cos(rot) - bz * Math.sin(rot);
    const wz = z + bx * Math.sin(rot) + bz * Math.cos(rot);
    addBlocker(wx, wz, 2.6);
  }
  return g;
}
const parkedCarSpots = [];

// Popeyes buckets — grab for a health boost
const buckets = [];
function makeBucket(x, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.26, 0.62, 14),
    new THREE.MeshStandardMaterial({ color: 0xf3f1e6, roughness: 0.6, emissive: 0x2a1200, emissiveIntensity: 0.6 })
  );
  body.position.y = 0.31; body.castShadow = true;
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 14),
    new THREE.MeshStandardMaterial({ color: 0xd23b1e }));
  stripe.position.y = 0.31;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.08, 14),
    new THREE.MeshStandardMaterial({ color: 0xd23b1e }));
  lid.position.y = 0.64;
  g.add(body, stripe, lid);
  g.position.set(x, 0.35, z);
  g.userData = { taken: false, baseY: 0.35 };
  scene.add(g);
  buckets.push(g);
}

// ---------------------------------------------------------------- muzzle flash / tracer
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });
const tracers = [];
const tracerPool = [];
function spawnTracer(from, to) {
  let line = tracerPool.pop();
  if (!line) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    line = new THREE.Line(geo, tracerMat.clone());
    line.frustumCulled = false;
  }
  const p = line.geometry.attributes.position;
  p.setXYZ(0, from.x, from.y, from.z);
  p.setXYZ(1, to.x, to.y, to.z);
  p.needsUpdate = true;
  line.userData.life = 0.09;
  scene.add(line);
  tracers.push(line);
}

// ---------------------------------------------------------------- game state
const state = {
  running: false, over: false,
  hp: 100, sp: 100, cans: 0, cash: 0,
  fireCd: 0, hurtCd: 0, dusk: 0,
  veh: null,          // vehicle the player is driving, or null (on foot)
  heat: 0,            // crime heat -> wanted stars
  wanted: 0,
  crimeCd: 0,         // time since last crime (heat holds while > 0)
  bustCd: 0,          // seconds a sheriff has been on top of you
};
const vehicles = [];   // every drivable car
const sheriffs = [];   // active police units
const cashEl = document.getElementById("cash");
const starsEl = document.getElementById("stars");
const vehIndic = document.getElementById("vehIndic");
const music = document.getElementById("music");
// Soundtrack: every audio file in assets/music/ (see the README there), shuffled.
const soundtrackReady = createSoundtrack(music, { fallback: "./assets/audio/theme.mp3" });
document.getElementById("mute").onclick = () => toggleMute();
function toggleMute() {
  music.muted = !music.muted;
  document.getElementById("mute").textContent = music.muted ? "♪̶" : "♪";
}

function registerVehicle(obj, r = 1.8, opts = {}) {
  if (!obj) return null;
  const v = {
    obj, heading: obj.rotation.y, speed: 0, hp: opts.hp || 40,
    sheriff: !!opts.sheriff, blocker: { x: obj.position.x, z: obj.position.z, r },
    r, wob: 0,
  };
  if (!opts.sheriff) {
    blockers.push(v.blocker);
    blockerGrid.addDynamic(v.blocker);   // its x/z move with the car
  }
  vehicles.push(v);
  return v;
}

function crime(amount) {
  state.heat += amount;
  state.crimeCd = 6;
}
const keys = new Set();
addEventListener("keydown", (e) => {
  if (e.repeat) { keys.add(e.code); return; }
  keys.add(e.code);
  if (e.code === "KeyF") { enterExitVehicle(); tryInteract(); }
  if (e.code === "KeyM") toggleMute();
  if (e.code === "KeyN") soundtrackReady.then((s) => s.next());
  // [ / ] step the graphics tier down / up; once you touch it, the auto
  // governor stops overriding your choice.
  if (e.code === "BracketLeft" || e.code === "BracketRight") {
    GFX.adaptive = false;
    nextTier(e.code === "BracketRight" ? 1 : -1);
    applyTier();
    flashGfx(`graphics: ${TIERS[GFX.tier].name}`);
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"].includes(e.code)) e.preventDefault();
});
addEventListener("keyup", (e) => keys.delete(e.code));

// Mouse: the first click captures the pointer (camera.js), after which the mouse
// looks around and left click shoots. Esc releases. Right-drag still orbits
// while the pointer is free, but is no longer required.
renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
const camCtl = createCameraController({
  camera, dom: renderer.domElement, canCapture: () => state.running && !state.over,
});
renderer.domElement.addEventListener("mousedown", (e) => {
  if (state.running && e.button === 0) fire();
});

// ---------------------------------------------------------------- player
let player, playerObj;
const playerPos = new THREE.Vector3(ROAD_X, 0, SPAWN_Z);
let playerFacing = new THREE.Vector3(0, 0, -1);   // last movement direction
// scratch vectors, so movement doesn't allocate every frame
const _mv = new THREE.Vector3(), _step = new THREE.Vector3(), _aim = new THREE.Vector3();
let attackTimer = 0;

// ---------------------------------------------------------------- enemies
// Bayou trouble: Feral Hogs, Rednecks, Hoodrats.
const enemies = [];
const atlases = {};   // name -> loaded atlas
const kills = { hog: 0, redneck: 0, hoodrat: 0 };
const EMOJI = { hog: "🐗", redneck: "🧢", hoodrat: "🎧" };

const ENEMY_TYPES = {
  // player uses the 'redneck' sheet untinted; the Redneck ENEMY gets a hard red
  // recolour so he never reads as the player. Hoodrat is the 'oldman' sheet, cool.
  redneck: { label: "Redneck", kind: "sprite", atlas: "redneck", tint: 0xd6402a,
             h: 2.0, hp: 5, speed: 3.9, aggro: 22, melee: 1.9, dmg: 11, atkGap: 1.1 },
  // Hoodrats are 3D actors now (src/characters.js) — red and blue crews, both
  // sexes. They satisfy the same interface as an AnimatedSprite, so nothing in
  // updateEnemy() has to care which they are.
  hoodrat: { label: "Hoodrat", kind: "actor", tint: 0x6d95d6,
             h: 1.92, hp: 4, speed: 4.7, aggro: 24, melee: 1.8, dmg: 8, atkGap: 0.85 },
  hog:     { label: "Feral Hog", kind: "hog", tint: 0x000000,
             h: 1.0, hp: 6, speed: 2.3, aggro: 18, melee: 1.7, dmg: 20, atkGap: 1.6 },
};

function buildHog() {
  const g = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: 0x3b2f28, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x241c18, roughness: 1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, 0.95), hide);
  body.position.y = 0.95; body.castShadow = true;
  const rump = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 1.05), hide);
  rump.position.set(-0.7, 1.0, 0); rump.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), hide);
  head.position.set(1.0, 0.8, 0); head.castShadow = true;
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.5), dark);
  snout.position.set(1.45, 0.7, 0);
  const tuskGeo = new THREE.ConeGeometry(0.07, 0.35, 5);
  const tuskMat = new THREE.MeshStandardMaterial({ color: 0xe8e0cc });
  const t1 = new THREE.Mesh(tuskGeo, tuskMat); t1.position.set(1.5, 0.6, 0.18); t1.rotation.z = -0.5;
  const t2 = t1.clone(); t2.position.z = -0.18;
  const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
  const legs = [];
  for (const [lx, lz] of [[0.6, 0.34], [0.6, -0.34], [-0.7, 0.36], [-0.7, -0.36]]) {
    const l = new THREE.Mesh(legGeo, dark);
    l.position.set(lx, 0.35, lz); l.castShadow = true;
    legs.push(l); g.add(l);
  }
  g.add(body, rump, head, snout, t1, t2);
  g.userData.legs = legs;
  return g;
}

// Home turf NPCs hang around: every lot on the strip, the trailer park, the
// junkyard, the shack, Ruston's main street and the shoulders in between.
const NPC_POIS = [
  ...LANDMARKS.map(([, side, z]) => ({ x: ROAD_X + side * (LOT_X - 11), z, r: 9 })),
  { x: -48, z: 116, r: 16 }, { x: 48, z: 100, r: 12 }, { x: 34, z: 88, r: 6 },
  ...[-60, -40, -20, 0, 20, 40].map((x) => ({ x, z: -78, r: 8 })),
];
for (let z = WORLD - 16; z > -WORLD + 16; z -= 24) {
  NPC_POIS.push({ x: ROAD_X + (z % 48 ? 9 : -9), z, r: 6 });
}
const npcs = createNpcSystem({ pois: NPC_POIS, resolveCollision, hitPlayer, bounds: WORLD });
const npcEnv = { player: playerPos, driving: false, others: enemies };

function spawnEnemy(typeName, x, z) {
  const T = ENEMY_TYPES[typeName];
  let view;
  if (T.kind === "hog") {
    view = buildHog();
  } else if (T.kind === "actor") {
    view = randomHoodrat(rng, T.h);
  } else {
    view = new AnimatedSprite(atlases[T.atlas], T.h);
    view.setTint(T.tint);
  }
  view.position.set(x, 0, z);
  scene.add(view);
  const rec = {
    type: typeName, T, spr: view, hp: T.hp, t: rand(0, 3),
    atkCd: 0, dead: false, fade: 1, charge: 0, chargeCd: 0,
  };
  npcs.init(rec);
  enemies.push(rec);
}

// ---------------------------------------------------------------- truck (escape)
let truck, truckMarker;
let traffic = null;   // ambient cars (traffic.js), created once the car models load

// Things a traffic car should stop for, gathered into one reused array.
const _obstacles = [];
function trafficObstacles() {
  _obstacles.length = 0;
  _obstacles.push(playerPos);
  for (const s of sheriffs) if (!s.dead) _obstacles.push(s.obj.position);
  for (const e of enemies) {
    if (!e.dead && Math.abs(e.spr.position.x - ROAD_X) < ROAD_HALF + 3) _obstacles.push(e.spr.position);
  }
  for (const v of vehicles) {
    if (!v.traffic && !v.sheriff && v !== state.veh && Math.abs(v.obj.position.x - ROAD_X) < ROAD_HALF) {
      _obstacles.push(v.obj.position);
    }
  }
  return _obstacles;
}
const truckPos = new THREE.Vector3(-6, 0, TRUCK_Z);

// ---------------------------------------------------------------- build the level
async function buildLevel() {
  // ---- Route 9: one long asphalt highway, swamp in the south, city in the north
  const roadMat = asphalt.material(1, { envMapIntensity: 0.9 });
  roadMat.normalScale.set(2.1, 2.1);
  for (const t of [roadMat.map, roadMat.normalMap, roadMat.roughnessMap]) {
    if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, (WORLD * 2 + 40) / 5); }
  }
  const road = new THREE.Mesh(new THREE.PlaneGeometry(10, WORLD * 2 + 40), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(ROAD_X, 0.02, -10);
  road.receiveShadow = true;
  scene.add(road);
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0xd9c14a, roughness: 0.62, metalness: 0, envMapIntensity: 1.1,
  });
  lineMat.userData.gtbRealized = true;
  for (let z = WORLD; z > TRUCK_Z; z -= 6) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 2.4), lineMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(ROAD_X, 0.05, z);
    scene.add(dash);
  }

  loadNote.textContent = "loading the kit…";
  const [wall, doorway, windowW, roofC, lamp, stop] = await Promise.all([
    loadKit("Wall/wall_01.gltf"), loadKit("Wall/Doorway/wall_doorway_01.gltf"),
    loadKit("Wall/Window/wall_window_01.gltf"), loadKit("Roof/Concrete/roof_concrete_01.gltf"),
    loadKit("Streetlamp/streetlamp_01.gltf"), loadKit("stopsign.gltf"),
  ]);

  initShackTex();

  // ================= CHATHAM (south) — the Louisiana line, trailer park =======
  // "Bienvenue en Louisiane" straddles the road at the very bottom; you spawn
  // just past it, nose pointed north up US-167.
  // player's RIGHT shoulder, just before the gas station, facing oncoming traffic
  makeWelcomeSign(ROAD_X + ROAD_HALF + 3.5, SIGN_Z, -0.35);
  makeWaterTower(-58, SPAWN_Z - 2, "CHATHAM");
  makeTrailerPark(-48, 116);
  makeJunkyard(48, 100);
  buildShack(wall, doorway, windowW, roofC, 34, 88, 0.15);

  // ================= THE HIGHWAY STRIP — every business lines the road =========
  const [tacoGLB, burgerGLB] = await Promise.all([
    loadGLB("./assets/models/tacos/Tacos.glb", null,
      /Taco|Grill|Shelf_S|Table|Meat|Tortilla|Board|Sauce|Onion|shepherd|Napkin|Plates|Sal|Oil/i),
    loadGLB("./assets/models/burgerpiz/BurgerPiz.glb", null, /BurgerPiz/i),
  ]);
  for (const [type, side, z] of LANDMARKS) {
    const [bx] = landmarkPos(side, z);
    const rot = -side * Math.PI / 2;         // front (+z local) faces the road
    roadApron(side, z, 20);                  // asphalt linking lot -> highway
    if (type === "popeyes") makePopeyes(bx, z, rot);
    else if (type === "sixtwelve") makeSixtwelve(bx, z, rot);
    else if (type === "gasstation")
      makeGasStation(bx, z, rot, { name: "GAS·N·GEAUX", wall: 0xdedac9, trim: 0x2b6fb0, bg: "#f2efe2", band: "#c62b23", ink: "#1d4e8c" });
    else if (type === "burgerpiz")
      placeGlbLandmark(burgerGLB, bx, z, rot, 26, "BurgerPiz", 0xff5a3c)
        || makePizzeria(bx, z, rot);
    else if (type === "taco")
      placeGlbLandmark(tacoGLB, bx, z, rot, 14, "Tacos", 0xffd27a, -Math.PI)
        || makePizzeria(bx, z, rot);
    // every lot gets a parking-lot pole light out front
    litSpots.push({ x: bx - side * 9, y: 8.5, z: z + 9, warm: 0xffbf74, power: 170, range: 30, pole: true });
  }

  // streetlamps + one warm glow for the whole strip
  for (let z = SPAWN_Z; z > -100; z -= 22) {
    const L = placeKit(lamp, ROAD_X + ROAD_HALF + 1.5, z, 0, 0.6);
    if (L) addBlocker(ROAD_X + ROAD_HALF + 1.5, z, 0.4);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe6b0 }));
    bulb.position.set(ROAD_X + ROAD_HALF + 1.5, 4.4, z);
    scene.add(bulb);
    litSpots.push({ x: ROAD_X + ROAD_HALF + 1.5, y: 4.3, z, warm: 0xffd9a0, power: 90, range: 22 });
  }
  for (const lz of [78, 24, -30, -84]) poolLight(0xffcf8a, 90, 70, ROAD_X, 11, lz);
  // a few torches + shrooms only right around the spawn so it reads "bayou"
  makeTorch(ROAD_X - ROAD_HALF - 1.5, SPAWN_Z - 3, true);
  makeTorch(ROAD_X + ROAD_HALF + 1.5, SPAWN_Z - 10, true);
  makeTorch(ROAD_X - ROAD_HALF - 1.5, SPAWN_Z - 20, true);
  for (let i = 0; i < 10; i++) {
    const x = rand(-WORLD + 24, WORLD - 24), z = rand(60, WORLD - 24);
    if (!inKeepout(x, z)) makeShroom(x, z);
  }
  if (stop) placeKit(stop, ROAD_X - ROAD_HALF - 1, SPAWN_Z - 24, 0, 1.2);
  makeWaterTower(64, 2, "MONROE");

  // ================= RUSTON (north) — small-town shopfronts =================
  const buildings = await loadGLB("./assets/models/buildings/Buildings.glb");
  if (buildings) {
    const parts = buildings.children.filter((c) => c.name && /Building/i.test(c.name));
    // two facing rows of low shopfronts along a main street
    for (const side of [-1, 1]) {
      let bx = -70;
      parts.forEach((src, i) => {
        if (!src) return;
        const b = src.clone(true);
        const sz = new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3());
        const s = (10 + (i % 3) * 3) / Math.max(sz.x, sz.z || 1);   // keep them small-town
        b.scale.setScalar(s);
        const w = sz.x * s;
        bx += w * 0.6 + 3;
        b.position.set(bx, 0, -78 + side * 16);
        b.rotation.y = side < 0 ? 0 : Math.PI;
        const gb = new THREE.Box3().setFromObject(b);
        b.position.y = -gb.min.y;
        scene.add(b);
        addBlocker(b.position.x, b.position.z, Math.max(sz.x, sz.z) * s * 0.4);
      });
    }
  }
  // plain asphalt lot around the truck (no dense-city street kit — off theme)
  const lotMat = asphaltMat.clone();
  lotMat.color.setHex(0xb9b9c2);
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(70, 44), lotMat);
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(ROAD_X, 0.015, -98);
  lot.receiveShadow = true;
  scene.add(lot);
  makeWaterTower(52, -92, "RUSTON");

  // ================= VEHICLES =================
  loadNote.textContent = "towing in the cars…";
  const [carR, carB, van, pickup, truckMesh, doclorean, beetle, landy] = await Promise.all([
    loadVehicle("Car_1_R.fbx", "Car_1_R_128x128_Color.png"),
    loadVehicle("Car_1_B.fbx", "Car_1_B_128x128_Color.png"),
    loadVehicle("Van_1.fbx", "Van_1_128x128_Color.png"),
    loadVehicle("Pick_Up_1.fbx", "Pick_Up_1_128x128_Color.png"),
    loadVehicle("Truck_1.fbx", "Truck_1_128x128_Color.png"),
    loadDsCar("docLorean"), loadDsCar("Beatall"), loadDsCar("Landyroamer"),
  ]);

  // wrecks scattered on the shoulders down the highway
  placeWreck(carR, ROAD_X + ROAD_HALF + 2, 88, 0.4);
  placeWreck(carB, ROAD_X - ROAD_HALF - 3, 44, 2.1);
  placeWreck(van, ROAD_X + ROAD_HALF + 3, 6, -0.7);
  placeWreck(pickup, ROAD_X - ROAD_HALF - 4, -34, 1.2);
  placeWreck(beetle, ROAD_X + ROAD_HALF + 2, -66, 0.9);
  placeWreck(landy, ROAD_X - ROAD_HALF - 3, 122, 2.6);   // by the spawn
  // the DeLorean, abandoned at the 6twelve pumps
  const gasSpot = landmarkPos(1, 100);
  if (doclorean) placeParked(doclorean, gasSpot[0] - 8, gasSpot[1] + 4, 1.1);

  const parkCars = [carR, carB, van, pickup, beetle, landy].filter(Boolean);
  parkedCarSpots.forEach((s, i) => {
    const side = Math.sign(s.x - ROAD_X) || 1;
    for (let k = 0; k < 3; k++) {
      const src = parkCars[(i * 3 + k) % parkCars.length];
      if (!src) continue;
      // nose-in bays in the lot between the building and the road
      const px = ROAD_X + side * (9 + (k % 2) * 4.5);
      const pz = s.z - 5 + k * 4.5 + rand(-0.6, 0.6);
      placeParked(src.clone(true), px, pz, side * Math.PI / 2 + rand(-0.08, 0.08));
    }
  });

  // sheriff cruiser prototype (tinted pickup) for the wanted system
  if (pickup) {
    sheriffProto = pickup.clone(true);
    sheriffProto.traverse((o) => {
      if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 });
    });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x1133aa }));
    bar.position.set(0, 2.0, 0);
    sheriffProto.add(bar);
  }

  // ---- ambient traffic: both lanes of US-167 ----
  traffic = createTraffic({
    scene, registerVehicle,
    models: [carR, carB, van, pickup, beetle, landy],
    lanes: [
      { name: "northbound", points: [[ROAD_X + 2.4, WORLD - 2], [ROAD_X + 2.4, -WORLD + 2]], cruise: [12, 19] },
      { name: "southbound", points: [[ROAD_X - 2.4, -WORLD + 2], [ROAD_X - 2.4, WORLD - 2]], cruise: [12, 19] },
    ],
    perLane: 4,
  });

  // ---- the escape truck ----
  truck = truckMesh || fallbackCar(null);
  truck.position.copy(truckPos);
  truck.rotation.y = Math.PI / 2;
  scene.add(truck);
  addBlocker(truckPos.x, truckPos.z, 2.4);
  truckMarker = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 4),
    new THREE.MeshBasicMaterial({ color: 0x7ee87e }));
  truckMarker.position.set(truckPos.x, 5.5, truckPos.z);
  scene.add(truckMarker);
  poolLight(0x7ee87e, 26, 34, truckPos.x, 4, truckPos.z);

  // ================= PICKUPS ================= (spread down the highway)
  makeCan(...landmarkPos(1, 100), true);        // at the 6twelve pumps
  makeCan(...landmarkPos(-1, 50), true);        // Tony's Pizza lot
  makeCan(30, 66, true);                        // by a shack
  makeCan(...landmarkPos(1, -40), true);        // a Popeyes lot down south
  makeCan(ROAD_X - 2, -100, true);              // near the truck

  const be = ROAD_X + ROAD_HALF + 8;
  for (const [bx, bz] of [[be, 96], [-be, 62], [be, 30], [-be, 0], [be, -28],
                          [-be, -58], [be, -88], [-be, 118], [30, 74], [-34, 44]]) {
    makeBucket(bx, bz);
  }

  // ================= ENEMIES =================  Rednecks, Hoodrats, Feral Hogs
  // seed a starting mob down the whole highway...
  for (let z = SPAWN_Z - 4; z > -110; z -= 8) {
    const t = ENEMY_KINDS[(Math.random() * 3) | 0];
    const side = Math.random() < 0.5 ? -1 : 1;
    spawnEnemy(t, ROAD_X + side * rand(9, 26), z + rand(-3, 3));
  }
}
// ...and top it back up forever, out of sight of the player.
const ENEMY_KINDS = ["hog", "redneck", "hoodrat"];
const ENEMY_CAP = 40;         // living enemies to maintain
let enemyRespawnCd = 0;
function updateEnemyPopulation(dt) {
  let alive = 0;
  for (const e of enemies) if (!e.dead) alive++;
  enemyRespawnCd -= dt;
  if (enemyRespawnCd > 0 || alive >= ENEMY_CAP) return;
  enemyRespawnCd = alive < ENEMY_CAP * 0.5 ? 0.6 : 2.0;

  // spawn just off the road, ahead of and behind the player, past view distance
  const ahead = Math.random() < 0.62;
  const zoff = (ahead ? -1 : 1) * rand(65, 105);
  const side = Math.random() < 0.5 ? -1 : 1;
  let x = ROAD_X + side * rand(10, 30);
  let z = THREE.MathUtils.clamp(playerPos.z + zoff, -WORLD + 12, WORLD - 12);
  spawnEnemy(ENEMY_KINDS[(Math.random() * 3) | 0], x, z);

  // cull enemies that wandered absurdly far, then compact the list
  for (const e of enemies) {
    if (!e.dead && Math.hypot(e.spr.position.x - playerPos.x, e.spr.position.z - playerPos.z) > 160) {
      npcs.release(e);
      scene.remove(e.spr); e.dead = "gone";
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].dead === "gone") enemies.splice(i, 1);
  }
}

// ---- an asphalt apron linking a lot to the highway shoulder ----
function roadApron(side, z, depth) {
  const inner = ROAD_X + side * (ROAD_HALF - 0.3);
  const outer = ROAD_X + side * (LOT_X + 4);
  const p = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.abs(outer - inner), depth),
    asphaltMat
  );
  p.rotation.x = -Math.PI / 2;
  p.position.set((inner + outer) / 2, 0.02, z);
  p.receiveShadow = true;
  scene.add(p);
}

// ---- 6twelve gas station (stylised — the 960-node FBX was too heavy) ----
function gasSign(name, bg, band, ink) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = bg; x.fillRect(0, 0, 512, 256);
  x.fillStyle = band; x.fillRect(0, 0, 512, 40); x.fillRect(0, 216, 512, 40);
  x.fillStyle = ink;
  x.textAlign = "center"; x.textBaseline = "middle";
  x.font = `bold ${name.length > 7 ? 96 : 150}px Arial Black, sans-serif`;
  x.fillText(name, 256, 132);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveIntensity: 0.55, emissiveMap: t });
}

const makeSixtwelve = (x, z, rot = 0) => makeGasStation(x, z, rot);
function makeGasStation(x, z, rot = 0, o = {}) {
  const name = o.name || "6twelve";
  const sign = () => gasSign(name, o.bg || "#f6f2e8", o.band || "#1a7a3c", o.ink || "#e23b2e");
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = rot;
  const white = new THREE.MeshStandardMaterial({ color: o.wall || 0xe9e6dc, roughness: 0.8 });
  const red = new THREE.MeshStandardMaterial({ color: o.trim || 0xd0342a, roughness: 0.7 });

  // shop
  const shop = new THREE.Mesh(new THREE.BoxGeometry(12, 4.6, 7), white);
  shop.position.set(0, 2.3, -4); shop.castShadow = true; shop.receiveShadow = true;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.8, 7.2), red);
  stripe.position.set(0, 4.2, -4);
  const wsign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), sign());
  wsign.position.set(0, 3, -0.4);

  // canopy over the pumps (toward the road, +z)
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(16, 0.7, 12), white);
  canopy.position.set(0, 6, 6); canopy.castShadow = true;
  const cstripe = new THREE.Mesh(new THREE.BoxGeometry(16.2, 0.4, 12.2), red);
  cstripe.position.set(0, 6.5, 6);
  for (const [px, pz] of [[-6.5, 1], [6.5, 1], [-6.5, 11], [6.5, 11]]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 6), white);
    col.position.set(px, 3, pz); col.castShadow = true; g.add(col);
    addBlocker(x + px * Math.cos(rot) - pz * Math.sin(rot),
               z + px * Math.sin(rot) + pz * Math.cos(rot), 0.5);
  }
  poolLight(0xfff4d8, 60, 30, 0, 5.4, 6, g);

  // pump islands
  for (const px of [-3.5, 3.5]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 4),
      new THREE.MeshStandardMaterial({ color: 0x555 }));
    base.position.set(px, 0.2, 6);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 1.1), red);
    pump.position.set(px, 1.3, 6); pump.castShadow = true;
    g.add(base, pump);
  }

  // tall pylon sign toward the road
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 16),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
  pole.position.set(7, 8, 13);
  const pylon = new THREE.Mesh(new THREE.BoxGeometry(6, 3.4, 0.5), sign());
  pylon.position.set(7, 15, 13);
  const pylonB = pylon.clone(); pylonB.rotation.y = Math.PI; pylon.add(pylonB);
  poolLight(0xffe6b0, 24, 26, 7, 14, 13, g);

  g.add(shop, stripe, wsign, canopy, cstripe, pole, pylon);
  scene.add(g);
  parkedCarSpots.push({ x, z, rot });
  for (const [bx, bz] of [[0, -4], [5.5, -4], [-5.5, -4]]) {
    addBlocker(x + bx * Math.cos(rot) - bz * Math.sin(rot),
               z + bx * Math.sin(rot) + bz * Math.cos(rot), 2.4);
  }
}

// place a GLB/FBX scene as a roadside landmark, recentred on (x,z).
// rotOffset corrects models whose "front" isn't local +z.  returns true on success.
function placeGlbLandmark(src, x, z, rot, target, label, glow, rotOffset = 0) {
  if (!src) return false;
  const inner = new THREE.Group();
  inner.add(src.clone(true));
  inner.rotation.y = rotOffset;
  let b = new THREE.Box3().setFromObject(inner);
  const sz = b.getSize(new THREE.Vector3());
  const s = target / Math.max(sz.x, sz.z, 1);
  inner.scale.setScalar(s);
  b = new THREE.Box3().setFromObject(inner);
  const c = b.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -b.min.y, -c.z);   // recentre footprint on origin
  const o = new THREE.Group();
  o.add(inner);
  o.position.set(x, 0, z);
  o.rotation.y = rot;
  scene.add(o);
  addBlocker(x, z, 5);
  poolLight(glow || 0xffe0b0, 40, 30, x, 6, z);
  parkedCarSpots.push({ x, z, rot });
  return true;
}


// ---- a fenced junkyard: sheds, barrels, pallets, wrecks-to-be ----
function makeJunkyard(cx, cz) {
  const dirt = new THREE.Mesh(new THREE.PlaneGeometry(34, 34),
    new THREE.MeshStandardMaterial({ map: shackTex.concrete, roughness: 1 }));
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(cx, 0.02, cz);
  dirt.receiveShadow = true;
  scene.add(dirt);
  makeShed(cx - 8, cz - 8, 0.2, 9, 6);
  makeShed(cx + 9, cz + 6, -1.5, 6, 5);
  for (const [dx, dz] of [[-6, 6], [-4, 8], [-6, 9], [8, -7], [10, -6], [2, 10]]) makeBarrel(cx + dx, cz + dz);
  makePallet(cx + 4, cz + 4, 0.3);
  makePallet(cx + 5, cz + 5, 1.1);
  makePallet(cx - 10, cz + 2, -0.4);
  // chainlink perimeter with a gap toward the road
  makeFence(cx - 17, cz - 17, cx + 17, cz - 17);
  makeFence(cx + 17, cz - 17, cx + 17, cz + 17);
  makeFence(cx - 17, cz + 17, cx + 17, cz + 17);
  makeFence(cx - 17, cz - 17, cx - 17, cz + 4);
}

// ---- a Chatham trailer park: mobile homes + the pedestrians ----
function makeTrailerPark(cx, cz) {
  const gravel = new THREE.Mesh(new THREE.PlaneGeometry(46, 40),
    new THREE.MeshStandardMaterial({ color: 0x4a453a, roughness: 1 }));
  gravel.rotation.x = -Math.PI / 2;
  gravel.position.set(cx, 0.02, cz);
  gravel.receiveShadow = true;
  scene.add(gravel);

  const skirt = new THREE.MeshStandardMaterial({ color: 0x6b6f74, roughness: 1 });
  const colors = [0xbfae86, 0x9fb0a3, 0xc7b8b0, 0xa8a29a, 0xb9a999, 0x8f9aa5];
  let i = 0;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const tx = cx - 15 + col * 15 + rand(-1, 1);
      const tz = cz - 9 + row * 18 + rand(-1, 1);
      const g = new THREE.Group();
      g.position.set(tx, 0, tz);
      g.rotation.y = (row ? 0.06 : -0.03) + rand(-0.05, 0.05);
      const body = new THREE.Mesh(new THREE.BoxGeometry(9, 3, 3.6),
        new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.9 }));
      body.position.y = 1.9; body.castShadow = true; body.receiveShadow = true;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.4, 4),
        new THREE.MeshStandardMaterial({ color: 0x4c4f53 }));
      roof.position.y = 3.5;
      const base = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.9, 3.4), skirt);
      base.position.y = 0.45;
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x3a2f26 }));
      door.position.set(-2, 1.4, 1.85);
      for (const wx of [1, 3]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 0.1),
          new THREE.MeshStandardMaterial({ color: 0x243b45 }));
        win.position.set(wx, 2.1, 1.85); g.add(win);
      }
      g.add(body, roof, base, door);
      scene.add(g);
      addBlocker(tx, tz, 3.2);
      i++;
    }
  }
  // a tool shed + junk between the trailers
  makeShed(cx + 14, cz - 12, -0.4, 5, 4);
  makeBarrel(cx - 18, cz - 6);
  makeBarrel(cx - 17, cz - 4);
  makePallet(cx + 12, cz + 8, 0.5);

  loadPed("Character_Male", cx - 12, cz + 2);
  loadPed("Character_Female", cx + 2, cz - 4);
  loadPed("Character_Male_01", cx + 10, cz + 6);
  loadPed("Character_Female_01", cx - 4, cz + 10);
}

// stylised Tony's Pizza (the 100 MB scene GLB was too heavy to ship)
function makePizzeria(x, z, rot = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  const brick = new THREE.MeshStandardMaterial({ color: 0x8a3b2a, roughness: 0.9 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8), brick);
  box.position.y = 2.5; box.castShadow = true; box.receiveShadow = true;
  const awn = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.5, 3),
    new THREE.MeshStandardMaterial({ color: 0x1f7a3d }));
  awn.position.set(0, 4.1, 4.4);
  // green/white/red bands
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.5, 0.2),
      new THREE.MeshStandardMaterial({ color: [0x1f7a3d, 0xf4f4f4, 0xc0392b][i] }));
    band.position.set(0, 0.6 + i * 0.5, 4.05);
    g.add(band);
  }
  const sign = makeNeonSign("TONY'S PIZZA", "#e8402c", "#f4e6c8");
  const board = new THREE.Mesh(new THREE.BoxGeometry(9, 3, 0.4), sign);
  board.position.set(0, 6.6, 0.2);
  const b2 = board.clone(); b2.rotation.y = Math.PI; board.add(b2);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 14),
    new THREE.MeshStandardMaterial({ color: 0x222 }));
  pole.position.set(6.5, 7, 5);
  const pyl = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.6, 0.4), sign);
  pyl.position.set(6.5, 13, 5);
  poolLight(0xff5a3c, 20, 26, 3, 6, 4, g);
  g.add(box, awn, board, pole, pyl);
  scene.add(g);
  parkedCarSpots.push({ x, z, rot });
  for (const [bx, bz] of [[0, 4], [0, -4], [5, 0], [-5, 0]]) {
    const wx = x + bx * Math.cos(rot) - bz * Math.sin(rot);
    const wz = z + bx * Math.sin(rot) + bz * Math.cos(rot);
    addBlocker(wx, wz, 2.4);
  }
}

function makeNeonSign(text, ink, bg) {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 320;
  const x = c.getContext("2d");
  x.fillStyle = bg; x.fillRect(0, 0, 1024, 320);
  x.strokeStyle = ink; x.lineWidth = 16; x.strokeRect(20, 20, 984, 280);
  x.fillStyle = ink;
  x.textAlign = "center"; x.textBaseline = "middle";
  x.font = "bold 150px Trebuchet MS, Arial Black, sans-serif";
  x.fillText(text, 512, 170);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, emissive: 0xff6644, emissiveIntensity: 0.9, emissiveMap: t });
}

// ---- roadside decor ----
const shrooms = [], torches = [];
function makeShroom(x, z) {
  const spr = new AnimatedSprite(atlases.shroom, 0.9 + Math.random() * 0.7);
  spr.blob.visible = false;
  spr.material.color.setHex(0x9fe8c8);
  spr.play("glow", { fps: 6 });
  spr.position.set(x, 0, z);
  scene.add(spr);
  shrooms.push(spr);
  addBlocker(x, z, 0.4);
}
function makeTorch(x, z, withLight) {
  const spr = new AnimatedSprite(atlases.torch, 3.0);
  spr.blob.visible = false;
  spr.play("burn", { fps: 10 });
  spr.position.set(x, 0, z);
  scene.add(spr);
  torches.push(spr);
  addBlocker(x, z, 0.3);
  if (withLight) poolLight(0xff9a3c, 22, 18, x, 2.6, z);
}

// ---- the "Bienvenue en Louisiane" sign — planted on the shoulder, angled to the road ----
function makeWelcomeSign(x, z, ry = 0) {
  const c = document.createElement("canvas");
  c.width = 768; c.height = 420;
  const g = c.getContext("2d");
  g.fillStyle = "#1f5d3a"; g.fillRect(0, 0, 768, 420);
  g.strokeStyle = "#f4f1e4"; g.lineWidth = 14; g.strokeRect(26, 26, 716, 368);
  g.fillStyle = "#f4f1e4"; g.textAlign = "center";
  g.font = "italic 48px Georgia, serif"; g.fillText("Bienvenue en", 384, 116);
  g.font = "bold 108px Georgia, serif"; g.fillText("LOUISIANE", 384, 228);
  g.font = "italic 32px Georgia, serif";
  g.fillText("Laissez les bons temps rouler !", 384, 320);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;

  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = ry;
  // BoxGeometry already textures front + back — one panel, no z-fighting clone
  const panel = new THREE.Mesh(new THREE.BoxGeometry(7, 3.8, 0.35),
    new THREE.MeshStandardMaterial({ map: tex, emissive: 0x0e3320, emissiveIntensity: 0.3, emissiveMap: tex }));
  panel.position.y = 4; panel.castShadow = true;
  grp.add(panel);
  for (const px of [-3, 3]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }));
    post.position.set(px, 2.2, 0); post.castShadow = true;
    grp.add(post);
  }
  addBlocker(x, z, 2);
  poolLight(0xcfeecb, 16, 20, x, 5, z);
  scene.add(grp);
}

// ---- water tower with the town name (CHATHAM / MONROE / RUSTON) ----
function makeWaterTower(x, z, name) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#c9cdd0"; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#26333f"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = "bold 90px Arial Black, sans-serif";
  g.fillText(name, 256, 138);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  const metal = new THREE.MeshStandardMaterial({ color: 0xb7bdc0, roughness: 0.7, metalness: 0.3 });
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 5, 16), [
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), metal, metal,
  ]);
  tank.position.y = 20; tank.castShadow = true;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(4.7, 2.4, 16), metal);
  cap.position.y = 23.6;
  const bowl = new THREE.Mesh(new THREE.ConeGeometry(4.5, 3, 16), metal);
  bowl.position.y = 16.4; bowl.rotation.x = Math.PI;
  grp.add(tank, cap, bowl);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 16), metal);
    leg.position.set(Math.cos(a) * 3.4, 8, Math.sin(a) * 3.4);
    leg.rotation.z = Math.cos(a) * 0.12; leg.rotation.x = -Math.sin(a) * 0.12;
    leg.castShadow = true;
    grp.add(leg);
  }
  scene.add(grp);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    addBlocker(x + Math.cos(a) * 3.4, z + Math.sin(a) * 3.4, 0.8);
  }
}

// ---- pedestrians from the Trailer Park character pack (static, they just stand) ----
const peds = [];
function loadPed(name, x, z) {
  const tex = texLoader.load(`./assets/models/trailerpark/chars/${name}.png`);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
  fbxLoader.load(`./assets/models/trailerpark/chars/${name}.fbx`, (obj) => {
    const sz = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    obj.scale.setScalar(1.9 / (sz.y || 1.9));
    obj.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }); }
    });
    const b = new THREE.Box3().setFromObject(obj);
    obj.position.set(x, -b.min.y, z);
    obj.rotation.y = Math.random() * 6;
    scene.add(obj);
    peds.push(obj);
    addBlocker(x, z, 0.5);
  }, undefined, () => {});
}

function buildShack(wall, doorway, windowW, roofC, cx, cz, rot) {
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  g.rotation.y = rot;
  scene.add(g);
  const put = (src, px, pz, ry) => {
    if (!src) return;
    const o = src.clone(true);
    o.position.set(px, 0, pz); o.rotation.y = ry;
    g.add(o);
  };
  const W = 4;
  put(doorway, 0, W / 2, 0);
  put(windowW, -W / 2, 0, Math.PI / 2);
  put(windowW, W / 2, 0, Math.PI / 2);
  put(wall, 0, -W / 2, 0);
  if (roofC) { const r = roofC.clone(true); r.position.y = 3.0; r.scale.set(1.3, 1, 1.3); g.add(r); }
  // approximate collision as a ring of blockers
  addBlocker(cx, cz + 2, 1.4);
  addBlocker(cx, cz - 2, 1.4);
  addBlocker(cx + 2, cz, 1.4);
  addBlocker(cx - 2, cz, 1.4);
}

function placeWreck(obj, x, z, rot) {
  if (!obj) return null;
  obj.position.set(x, 0, z);
  obj.rotation.y = rot;
  scene.add(obj);
  return registerVehicle(obj, 2.0, { hp: 34 });   // every wreck still runs
}
function placeParked(obj, x, z, rot) {
  if (!obj) return null;
  obj.position.set(x, 0, z);
  obj.rotation.y = rot;
  scene.add(obj);
  return registerVehicle(obj, 1.9, { hp: 34 });
}

// ---------------------------------------------------------------- interactions
function tryInteract() {
  if (!state.running) return;
  // near truck?
  if (playerPos.distanceTo(truckPos) < 4.5) {
    if (state.cans >= CAN_GOAL) return win();
    flashObjective(`The tank is dry — need ${CAN_GOAL - state.cans} more can(s).`);
  }
}

// ---------------------------------------------------------------- combat
const _tmpV = new THREE.Vector3();
function fire() {
  if (state.fireCd > 0 || state.over) return;
  state.fireCd = state.veh ? 0.3 : 0.42;
  crime(0.12);
  const origin = _tmpV.copy(playerPos).setY(state.veh ? 1.4 : 1.2);

  if (!state.veh) { attackTimer = 0.42; player.play("attack", { fps: 12, loop: false, force: true }); }

  // Aim assist: hostile NPCs and cruisers first; a bystander is only hit if
  // the camera is pointed right at them. Used to snap to whoever was nearest.
  _aim.set(-Math.sin(camCtl.yaw), 0, -Math.cos(camCtl.yaw));
  let best = null, bestScore = Infinity, bestKind = null;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.spr.position.x - playerPos.x, dz = e.spr.position.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d > 30 || d < 1e-3) continue;
    const facing = (dx * _aim.x + dz * _aim.z) / d;       // 1 = dead ahead
    const hostile = e.state === "hostile";
    if (!hostile && facing < 0.93) continue;
    if (hostile && facing < -0.2 && d > 6) continue;
    const score = d * (hostile ? 0.6 : 1) * (1.6 - facing);
    if (score < bestScore) { bestScore = score; best = e; bestKind = "enemy"; }
  }
  for (const s of sheriffs) {
    if (s.dead) continue;
    const d = s.obj.position.distanceTo(playerPos);
    if (d < 30 && d * 0.6 < bestScore) { bestScore = d * 0.6; best = s; bestKind = "sheriff"; }
  }
  npcs.noise(playerPos.x, playerPos.z, 26);     // gunfire carries

  let target;
  if (bestKind === "enemy") target = best.spr.position.clone().setY(best.type === "hog" ? 0.8 : 1.1);
  else if (bestKind === "sheriff") target = best.obj.position.clone().setY(1.1);
  else target = origin.clone().addScaledVector(_aim, 24);
  spawnTracer(origin, target);
  muzzleFlash(origin, target);

  if (bestKind === "enemy") {
    best.hp -= 2;
    npcs.provoke(best);
    if (best.type !== "hog") { best.spr.play("hurt", { loop: false, force: true }); best.t = 0; }
    else best.spr.position.addScaledVector(best.spr.position.clone().sub(playerPos).setY(0).normalize(), 0.4);
    if (best.hp <= 0) { killEnemy(best); if (best.type !== "hog") crime(1.2); }
  } else if (bestKind === "sheriff") {
    crime(0.4);
    damageVehicle(best, 4);
  }
}

// Created up front at zero intensity. Adding a light mid-game changes the light
// count, which recompiles every lit shader: a visible hitch on the first shot,
// on every wrecked car and on every cruiser that spawned with its own beacon.
const muzzleLight = new THREE.PointLight(0xffd070, 0, 12, 2);
const wreckLight = new THREE.PointLight(0xff6a1e, 0, 16, 2);
const beaconLights = [new THREE.PointLight(0x3366ff, 0, 18, 2), new THREE.PointLight(0xff2233, 0, 18, 2)];
scene.add(muzzleLight, wreckLight, ...beaconLights);
function muzzleFlash(from) {
  muzzleLight.position.copy(from);
  muzzleLight.intensity = 30;
}

function killEnemy(e) {
  npcs.release(e);
  npcs.noise(e.spr.position.x, e.spr.position.z, 30);
  e.dead = true;
  e.state = "dead";
  e.t = 0;
  kills[e.type] = (kills[e.type] || 0) + 1;
  if (e.type !== "hog") e.spr.play("death", { fps: 9, loop: false, force: true });
  flashObjective(`${e.T.label} down.  ${EMOJI.hog} ${kills.hog}   ${EMOJI.redneck} ${kills.redneck}   ${EMOJI.hoodrat} ${kills.hoodrat}`);
  checkHeatUp();
}

// ---------------------------------------------------------------- HUD
function syncHUD() {
  hpFill.style.width = Math.max(0, state.hp) + "%";
  spFill.style.width = Math.max(0, state.sp) + "%";
  cansEl.innerHTML = `${state.cans} <small>/ ${CAN_GOAL}</small>`;
  cashEl.textContent = "$" + state.cash.toLocaleString();
  let s = "";
  if (copsActive()) for (let i = 0; i < 5; i++) s += `<span class="${i < state.wanted ? "on" : "off"}">★</span>`;
  starsEl.innerHTML = s;
  if (state.veh) {
    vehIndic.hidden = false;
    vehIndic.textContent = state.veh.sheriff
      ? `⚡ SHERIFF CRUISER — ${Math.round(Math.abs(state.veh.speed) * 3)} mph`
      : `${Math.round(Math.abs(state.veh.speed) * 3)} mph   ·   F to get out`;
  } else {
    vehIndic.hidden = true;
  }
}
let objTimer = 0;
function flashObjective(txt) {
  objEl.textContent = txt;
  objTimer = 2.5;
}
function hurtFlash() {
  document.body.classList.remove("flash");
  void document.body.offsetWidth;
  document.body.classList.add("flash");
}

// ---------------------------------------------------------------- win / lose
function endScreen(title, body, btn) {
  state.running = false;
  state.over = true;
  crosshair.style.display = "none";
  camCtl.release();
  overlay.classList.remove("hidden");
  overlay.style.background = "radial-gradient(ellipse at center, rgba(8,16,10,.82), rgba(3,5,4,.97))";
  overlay.innerHTML = `<h1 class="end">${title}</h1><p>${body}</p><button id="againBtn">${btn}</button>`;
  document.getElementById("againBtn").onclick = () => location.reload();
}
function scoreLine() {
  return `Cash $${state.cash.toLocaleString()} &nbsp;·&nbsp; ${EMOJI.hog}${kills.hog}
    ${EMOJI.redneck}${kills.redneck} ${EMOJI.hoodrat}${kills.hoodrat}
    &nbsp;·&nbsp; ${state.wanted}★ at the line`;
}
function win() {
  endScreen("left the parish",
    `The truck catches on the third try and you point it north out of Terrebonne
     as the sun comes up over the cypress. Somebody still owes somebody money, but
     that's a sequel problem.<br><br>${scoreLine()}`,
    "Run it back");
}
function lose() {
  endScreen('<span style="color:#b8202a;font-style:italic">WASTED</span>',
    `The swamp took you back. ${state.cans}/${CAN_GOAL} gas cans, and the truck's
     still sitting up past the city line with the keys in it.<br><br>${scoreLine()}`,
    "Respawn");
}
function busted() {
  endScreen('<span style="color:#2e6fff;font-style:italic">BUSTED</span>',
    `Terrebonne Parish Sheriff's Office would like a word. Bail is more than you've
     got.<br><br>${scoreLine()}`,
    "Make bail");
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let idleAcc = 0;

// ---- dev diagnostics: F3 toggles a frame-time readout (hidden by default) ----
// CPU-side timings only; the GPU works asynchronously, so "render" is the cost of
// submitting the frame, and a slow GPU shows up as a low fps with small numbers.
const perf = {
  fps: 0, frameMs: 0, worstMs: 0, simMs: 0, aiMs: 0, renderMs: 0,
  calls: 0, tris: 0, _frames: 0, _acc: 0, _worst: 0, _sim: 0, _ai: 0, _render: 0,
};
renderer.info.autoReset = false;          // count draw calls across every pass
const perfEl = document.createElement("div");
perfEl.id = "perf";
perfEl.hidden = true;
perfEl.style.cssText = "position:fixed;top:120px;right:16px;z-index:30;pointer-events:none;" +
  "font:12px/1.5 Consolas,monospace;color:#cfe8bf;background:rgba(0,0,0,.6);" +
  "padding:8px 10px;border-radius:6px;white-space:pre";
document.body.appendChild(perfEl);
addEventListener("keydown", (e) => {
  if (e.code === "F3") { e.preventDefault(); perfEl.hidden = !perfEl.hidden; }
});
function samplePerf(frameMs) {
  perf._frames++;
  perf._acc += frameMs;
  perf._worst = Math.max(perf._worst, frameMs);
  if (perf._acc < 500) return;
  const n = perf._frames;
  perf.fps = Math.round((n * 1000) / perf._acc);
  perf.frameMs = +(perf._acc / n).toFixed(1);
  perf.worstMs = +perf._worst.toFixed(1);
  perf.simMs = +(perf._sim / n).toFixed(2);
  perf.aiMs = +(perf._ai / n).toFixed(2);
  perf.renderMs = +(perf._render / n).toFixed(2);
  perf._frames = perf._acc = perf._worst = perf._sim = perf._ai = perf._render = 0;
  if (!perfEl.hidden) {
    perfEl.textContent =
      `${perf.fps} fps   ${perf.frameMs} ms (worst ${perf.worstMs})\n` +
      `sim ${perf.simMs} ms   ai ${perf.aiMs} ms\n` +
      `render submit ${perf.renderMs} ms\n` +
      `draw calls ${perf.calls}   tris ${(perf.tris / 1000).toFixed(0)}k\n` +
      `npcs ${enemies.length}   vehicles ${vehicles.length}`;
  }
}
let lastFrameStamp = performance.now();

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  const frameMs = now - lastFrameStamp;
  lastFrameStamp = now;
  // Clamp only real stalls (tab switches, load hitches). Everything under
  // 100 ms is simulated in full, in fixed steps below, so gameplay speed no
  // longer drops when the frame rate does.
  const dt = Math.min(clock.getDelta(), 0.1);

  // The menu / end-screen overlay is opaque, so driving the full post chain and
  // a 3072px shadow map behind it is pure waste — and on a software GL context
  // it is what makes the level appear to load slowly. Tick it at ~2.5 fps
  // instead: slow enough to cost nothing, often enough that shaders are already
  // compiled and there is no hitch on Start.
  if (!state.running) {
    idleAcc += dt;
    if (idleAcc < 0.4) return;
    idleAcc = 0;
  }

  if (state.running && !state.over) {
    const t0 = performance.now();
    // fixed-size steps: collision and AI stay stable at any frame rate
    for (let left = dt; left > 1e-4 && !state.over; left -= 1 / 30) {
      simulate(Math.min(left, 1 / 30));
    }
    camCtl.update(dt, playerPos, state.veh, blockerGrid);
    perf._sim += performance.now() - t0;
  }

  // tracers fade
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.userData.life -= dt;
    t.material.opacity = Math.max(0, t.userData.life / 0.09) * 0.9;
    if (t.userData.life <= 0) { scene.remove(t); tracers.splice(i, 1); tracerPool.push(t); }
  }
  if (muzzleLight) muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 240);

  // water ripple
  const time = clock.elapsedTime;
  for (const p of waterPatches) {
    const pos = p.geometry.attributes.position;
    const base = p.userData.base;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1];
      pos.setZ(i, Math.sin(bx * 0.6 + time * 1.6) * 0.06 + Math.cos(by * 0.7 + time) * 0.05);
    }
    pos.needsUpdate = true;
  }

  for (const c of cans) {
    if (c.userData.taken) continue;
    c.rotation.y += dt * 1.4;
    c.position.y = c.userData.baseY + Math.sin(time * 2 + c.position.x) * 0.12;
  }
  if (truckMarker) {
    truckMarker.rotation.y += dt * 2;
    truckMarker.position.y = 5.2 + Math.sin(time * 3) * 0.25;
  }
  for (const s of shrooms) s.update(dt, camera);
  for (const t of torches) t.update(dt, camera);
  updateLightPool(dt, camera.position);

  // ---- atmosphere: drifting mist, lamp beams, headlights, sense of speed ----
  MIST.x = time;
  updateFx(dt);
  headlights.update(dt, state.veh);
  const rush = state.veh ? THREE.MathUtils.smoothstep(Math.abs(state.veh.speed), 12, 30) : 0;
  const fov = THREE.MathUtils.damp(camera.fov, 52 + rush * 8, 3, dt);
  if (Math.abs(fov - camera.fov) > 1e-3) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  composer.grade.uniforms.uBlur.value = rush;

  const r0 = performance.now();
  renderer.info.reset();
  wetRoads.render();
  composer.render(dt);
  perf.calls = renderer.info.render.calls;
  perf.tris = renderer.info.render.triangles;
  perf._render += performance.now() - r0;
  if (state.running) samplePerf(frameMs);
  governor(dt);
}

// Steps the quality tier down if this machine can't hold the 4K buffer.
const governor = createGovernor((tier) => {
  applyTier();
  flashGfx(`graphics auto-set to ${TIERS[tier].name}`);
});

function applyTier() {
  moon.shadow.mapSize.set(GFX.preset.shadow, GFX.preset.shadow);
  if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; }
  composer.resize();
  if (composer.bloom) composer.bloom.enabled = GFX.preset.bloom;
  if (composer.gtao) composer.gtao.enabled = GFX.preset.ao;
  if (composer.smaa) composer.smaa.enabled = GFX.preset.smaa;
  wetRoads.setQuality(GFX.preset.reflect, GFX.preset.reflectEvery);
  updateGfxLabel();
}

const gfxLabel = document.getElementById("gfxLabel");
let gfxFlash = 0;
function updateGfxLabel() {
  if (!gfxLabel) return;
  const [w, h] = composer.renderScale;
  gfxLabel.textContent = `${TIERS[GFX.tier].name} · ${w}×${h}`;
}
function flashGfx(msg) {
  if (!gfxLabel) return;
  gfxLabel.textContent = msg;
  clearTimeout(gfxFlash);
  gfxFlash = setTimeout(updateGfxLabel, 2200);
}

let lastElev = -1.8;
function simulate(dt) {
  state.fireCd = Math.max(0, state.fireCd - dt);
  state.hurtCd = Math.max(0, state.hurtCd - dt);
  state.dusk = Math.min(1, state.dusk + dt * 0.0016);
  if (objTimer > 0) { objTimer -= dt; if (objTimer <= 0) objEl.textContent = defaultObjective(); }

  // Night deepens: the sun sinks further below the horizon, which drains the
  // blue out of the sky probe, so the whole scene's ambient goes with it.
  const f = 1 - state.dusk * 0.4;
  moon.intensity = 2.8 * f;
  scene.fog.density = 0.0072 + state.dusk * 0.004;
  MIST.y = 0.04 + state.dusk * 0.025;   // the mist thickens as the night goes on
  const elev = -1.8 - state.dusk * 4.2;
  // re-baking the PMREM probe is expensive — only when it would actually show
  if (Math.abs(elev - lastElev) > 0.4) {
    lastElev = elev;
    env.setElevation(elev);
    env.setIntensity(2.4 * f, 1.0 * f);
  }

  // ---- camera orbit (Q/E), secondary to mouse look ----
  const orbit = (keys.has("KeyE") || keys.has("ArrowRight") ? 1 : 0)
              - (keys.has("KeyQ") || keys.has("ArrowLeft") ? 1 : 0);
  if (orbit) camCtl.addYaw(orbit * dt * 2.0);

  if (state.veh) drivingUpdate(dt);
  else onFootUpdate(dt);

  // keep the moon's shadow box over the player
  moon.position.set(playerPos.x - 40, 60, playerPos.z - 20);
  moon.target.position.set(playerPos.x, 0, playerPos.z);
  moon.target.updateMatrixWorld();

  // ---- wanted level (only once the Sheriff is paying attention) ----
  if (copsActive()) {
    state.crimeCd = Math.max(0, state.crimeCd - dt);
    if (state.crimeCd <= 0) state.heat = Math.max(0, state.heat - dt * (state.veh ? 0.3 : 0.16));
    const w = Math.min(5, Math.max(1, Math.floor(state.heat / 1.4)));
    if (w !== state.wanted) { state.wanted = w; syncHUD(); }
    updateSheriffs(dt);
  }

  // ---- cans ----
  for (const c of cans) {
    if (c.userData.taken) continue;
    if (playerPos.distanceTo(c.position) < 1.5) {
      c.userData.taken = true;
      c.visible = false;
      state.cans = Math.min(CAN_GOAL, state.cans + 1);
      syncHUD();
      flashObjective(state.cans >= CAN_GOAL
        ? "Tank's full — get to the truck on the road!"
        : `Gas can! ${state.cans}/${CAN_GOAL}. Keep looking.`);
    }
  }

  // ---- Popeyes buckets (health) ----
  for (const b of buckets) {
    if (b.userData.taken) continue;
    b.rotation.y += dt * 1.6;
    b.position.y = b.userData.baseY + Math.sin(clock.elapsedTime * 2 + b.position.z) * 0.1;
    if (state.hp < 100 && playerPos.distanceTo(b.position) < 1.5) {
      b.userData.taken = true;
      b.visible = false;
      state.hp = Math.min(100, state.hp + 28);
      syncHUD();
      flashObjective("Popeyes. That's a spicy heal. +28 HP");
    }
  }

  // ---- truck proximity / auto win ----
  if (state.cans >= CAN_GOAL && playerPos.distanceTo(truckPos) < 4.2) win();

  // ---- enemies ----
  const a0 = performance.now();
  updateEnemyPopulation(dt);
  npcEnv.driving = !!state.veh;
  npcs.beginFrame(dt);
  for (const e of enemies) {
    if (e.dead === "gone") continue;
    // false = paused or off-beat for its distance: skip the animation as well
    if (updateEnemy(e, dt) && e.spr.update) e.spr.update(dt, camera);
  }
  perf._ai += performance.now() - a0;

  // ---- ambient traffic ----
  if (traffic) traffic.update(dt, playerPos, trafficObstacles(), state.veh);

  if (state.hp <= 0) lose();
  syncHUD();
}

function defaultObjective() {
  if (copsActive() && state.wanted >= 1) return "Lose the Sheriff.";
  return state.cans >= CAN_GOAL
    ? "Get to the truck past the Ruston line."
    : `Jack a ride · rob gas cans: ${state.cans}/${CAN_GOAL}`;
}

function hitPlayer(dmg) {
  state.hp -= dmg;
  state.hurtCd = 0.4;
  hurtFlash();
  if (!state.veh) { player.play("hurt", { loop: false, force: true }); attackTimer = 0.3; }
}

// ============================================================ ON FOOT
function onFootUpdate(dt) {
  const inX = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  const inZ = (keys.has("KeyS") ? 1 : 0) - (keys.has("KeyW") ? 1 : 0);
  const yaw = camCtl.yaw;
  const cos = Math.cos(yaw), sin = Math.sin(yaw);
  const mv = _mv.set(inX * cos - inZ * sin, 0, inX * sin + inZ * cos);
  const moving = mv.lengthSq() > 0;
  const sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
  let speed = 6.5;
  if (sprint && state.sp > 1 && moving) { speed = 11; state.sp -= dt * 26; }
  else state.sp = Math.min(100, state.sp + dt * 14);

  if (moving) {
    mv.normalize();
    if (inX !== 0) player.setFlip(inX);
    playerFacing.copy(mv);
    const next = _step.copy(playerPos).addScaledVector(mv, speed * dt);
    resolveCollision(playerPos, next, 0.6);
  }
  playerPos.x = THREE.MathUtils.clamp(playerPos.x, -WORLD + 4, WORLD - 4);
  playerPos.z = THREE.MathUtils.clamp(playerPos.z, -WORLD + 4, WORLD - 4);
  player.position.copy(playerPos);
  player.visible = true;

  attackTimer = Math.max(0, attackTimer - dt);
  if (attackTimer <= 0) player.play(moving ? "walk" : "idle", { fps: moving ? 10 : 5 });
  player.update(dt, camera);
}

// ============================================================ DRIVING
const _fwd = new THREE.Vector3();
const _next = new THREE.Vector3();
function drivingUpdate(dt) {
  const v = state.veh;
  const inX = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  const inZ = (keys.has("KeyS") ? 1 : 0) - (keys.has("KeyW") ? 1 : 0);
  const throttle = -inZ;                       // W = forward
  const brake = keys.has("ShiftLeft") || keys.has("ShiftRight");

  const accel = 26, maxF = 30, maxR = 11;
  v.speed += throttle * accel * dt;
  if (brake) v.speed *= (1 - Math.min(1, dt * 3.5));
  v.speed *= (1 - dt * 0.9);                   // drag
  v.speed = THREE.MathUtils.clamp(v.speed, -maxR, maxF);
  if (Math.abs(v.speed) < 0.05) v.speed = 0;

  const grip = brake ? 2.6 : 1.7;
  v.heading -= inX * grip * dt * Math.sign(v.speed || 1) * Math.min(1, Math.abs(v.speed) / 7);

  _fwd.set(Math.sin(v.heading), 0, Math.cos(v.heading));
  const next = _next.copy(v.obj.position).addScaledVector(_fwd, v.speed * dt);

  // collide with world blockers (excluding own)
  const bumped = blockerGrid.resolve(next, v.r, next, v.blocker);
  if (bumped) v.speed *= 0.45;
  next.x = THREE.MathUtils.clamp(next.x, -WORLD + 3, WORLD - 3);
  next.z = THREE.MathUtils.clamp(next.z, -WORLD + 3, WORLD - 3);
  v.obj.position.copy(next);
  v.blocker.x = next.x; v.blocker.z = next.z;

  // body roll / bob
  v.wob += dt * (6 + Math.abs(v.speed) * 0.4);
  v.obj.rotation.y = v.heading;
  v.obj.rotation.z = -inX * Math.min(0.12, Math.abs(v.speed) / 60) + Math.sin(v.wob) * 0.01;

  // roadkill
  if (Math.abs(v.speed) > 7) {
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.spr.position.distanceTo(next) < 2.4) {
        e.hp -= 5;
        npcs.provoke(e);
        e.spr.position.addScaledVector(_fwd, 1.2);
        v.speed *= 0.82;
        if (e.hp <= 0) { killEnemy(e); if (e.type !== "hog") crime(1.1); }
      }
    }
  }

  // player rides along
  playerPos.copy(next);
  player.position.copy(next);
  player.visible = false;

  syncHUD();
}

function nearestVehicle(pos, maxD) {
  let best = null, bd = maxD;
  for (const v of vehicles) {
    if (v === state.veh || v.dead) continue;
    const d = v.obj.position.distanceTo(pos);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function enterExitVehicle() {
  if (!state.running) return;
  if (state.veh) {
    // step out
    const v = state.veh;
    state.veh = null;
    v.speed = 0;
    const side = _fwd.set(Math.cos(v.heading), 0, -Math.sin(v.heading)).multiplyScalar(2.4);
    playerPos.copy(v.obj.position).add(side);
    player.position.copy(playerPos);
    player.visible = true;
    flashObjective("On foot.");
    return;
  }
  const v = nearestVehicle(playerPos, 4.2);
  if (v) {
    state.veh = v;
    if (v.sheriff) { crime(0.8); flashObjective("You jacked a Sheriff cruiser. Bold."); }
    else flashObjective("Jacked it. Floor it.");
  } else {
    flashObjective("Nothing to jack here.");
  }
}

// ============================================================ SHERIFF
let sheriffProto = null;
function spawnSheriff() {
  if (!sheriffProto) return;
  const car = sheriffProto.clone(true);
  const ang = Math.random() * Math.PI * 2;
  car.position.set(playerPos.x + Math.cos(ang) * 55, 0, playerPos.z + Math.sin(ang) * 55);
  car.position.x = THREE.MathUtils.clamp(car.position.x, -WORLD + 6, WORLD - 6);
  car.position.z = THREE.MathUtils.clamp(car.position.z, -WORLD + 6, WORLD - 6);
  car.rotation.y = ang;
  scene.add(car);
  const v = registerVehicle(car, 2.0, { sheriff: true, hp: 32 });
  sheriffs.push(v);
}
// The Sheriff only shows up after you've put down a dozen Rednecks/Hoodrats.
const HEAT_KILLS = 12;
function copsActive() { return (kills.redneck + kills.hoodrat) >= HEAT_KILLS; }
function checkHeatUp() {
  if (!state._copsAnnounced && copsActive()) {
    state._copsAnnounced = true;
    state.heat = 2.2;                 // start at ~2 stars, not an instant 5
    state.wanted = 2;
    flashObjective("⚡ You made the Parish most-wanted list. Sheriff inbound.");
    syncHUD();
  }
}
function updateSheriffs(dt) {
  const want = Math.max(0, state.wanted - 1);
  if (sheriffs.filter((s) => !s.dead).length < want && sheriffProto) spawnSheriff();

  let onTop = false;
  const flash = Math.sin(clock.elapsedTime * 12) > 0 ? 0x3366ff : 0xff2233;
  let lit = 0;
  for (const s of sheriffs) {
    if (s.dead) continue;
    // the two persistent beacon lights ride the first two cruisers
    if (lit < beaconLights.length) {
      const b = beaconLights[lit++];
      b.position.copy(s.obj.position).setY(2.4);
      b.color.setHex(flash);
      b.intensity = 20;
    }
    const to = _tmpV.copy(playerPos).sub(s.obj.position); to.y = 0;
    const d = to.length();
    to.normalize();
    const desired = Math.atan2(to.x, to.z);
    let dh = desired - s.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    s.heading += THREE.MathUtils.clamp(dh, -2.4 * dt, 2.4 * dt);
    const spd = d > 6 ? 22 : 8;
    s.speed = THREE.MathUtils.lerp(s.speed, spd, dt * 1.5);
    _fwd.set(Math.sin(s.heading), 0, Math.cos(s.heading));
    const nx = s.obj.position.x + _fwd.x * s.speed * dt;
    const nz = s.obj.position.z + _fwd.z * s.speed * dt;
    s.obj.position.set(THREE.MathUtils.clamp(nx, -WORLD + 4, WORLD - 4), 0,
                       THREE.MathUtils.clamp(nz, -WORLD + 4, WORLD - 4));
    s.blocker.x = s.obj.position.x; s.blocker.z = s.obj.position.z;
    s.obj.rotation.y = s.heading;

    if (d < 4) {
      onTop = true;
      if (!state.veh) hitPlayer(dt * 14);           // beat down on foot
      else state.veh.speed *= (1 - dt * 1.5);       // ram / pit
    }
  }
  for (; lit < beaconLights.length; lit++) beaconLights[lit].intensity = 0;
  state.bustCd = onTop ? state.bustCd + dt : Math.max(0, state.bustCd - dt * 0.6);
  if (state.bustCd > 3 && !state.veh) return busted();
}

function damageVehicle(v, amount) {
  v.hp -= amount;
  if (v.hp <= 0) {
    v.dead = true;
    // burn + remove after a beat
    wreckLight.position.copy(v.obj.position).setY(1.5);
    wreckLight.intensity = 30;
    setTimeout(() => { wreckLight.intensity = 0; scene.remove(v.obj); }, 1400);
    const bi = blockers.indexOf(v.blocker);
    if (bi >= 0) blockers.splice(bi, 1);
    blockerGrid.remove(v.blocker);
    // it used to stay in `vehicles`, so F could "enter" the invisible wreck
    const vi = vehicles.indexOf(v);
    if (vi >= 0) vehicles.splice(vi, 1);
    const si = sheriffs.indexOf(v);
    if (si >= 0) sheriffs.splice(si, 1);
    if (v.sheriff) { state.cash += 250; crime(0.6); flashObjective("Cruiser wrecked. +$250"); syncHUD(); }
    if (state.veh === v) state.veh = null;
  }
}

function updateEnemy(e, dt) {
  const p = e.spr.position;
  const T = e.T;

  if (e.dead) {
    e.t += dt;
    if (e.type === "hog") {
      e.spr.rotation.z = Math.min(Math.PI / 2, e.spr.rotation.z + dt * 4); // topple
      e.fade -= dt * 0.35;
      e.spr.scale.setScalar(Math.max(0.01, e.fade));
      if (e.fade <= 0) { scene.remove(e.spr); e.dead = "gone"; }
    } else if (e.spr.finished) {
      e.fade -= dt * 0.4;
      e.spr.material.opacity = Math.max(0, e.fade);
      e.spr.blob.material.opacity = Math.max(0, e.fade * 0.3);
      if (e.fade <= 0) { scene.remove(e.spr); e.dead = "gone"; }
    }
    return true;                 // keep playing the death animation
  }

  // behaviour, level of detail and movement live in npc.js
  return npcs.update(e, dt, npcEnv);
}

// slide-along-obstacle collision: mutate `current` toward `next`
function resolveCollision(current, next, radius) {
  blockerGrid.resolve(next, radius, current, null);
}

// ---------------------------------------------------------------- boot
async function boot() {
  loadNote.textContent = "loading sprites…";
  const [rn, om, sh, to] = await Promise.all([
    loadAtlas("redneck"), loadAtlas("oldman"), loadAtlas("shroom"), loadAtlas("torch"),
  ]);
  atlases.redneck = rn;
  atlases.oldman = om;
  atlases.shroom = sh;
  atlases.torch = to;

  player = new AnimatedSprite(rn, 1.95);
  player.position.copy(playerPos);
  scene.add(player);

  // Generating the world's PBR surfaces is a few seconds of synchronous canvas
  // work. It used to run at module top level, which froze the page on
  // "loading assets…" with no feedback and looked like the game had hung.
  // Staged here instead, with a paint between each step.
  loadNote.textContent = "pouring the asphalt…";
  await paint();
  buildAsphalt();
  parkTex = carParkTexture();

  loadNote.textContent = "laying the bayou floor…";
  await paint();
  buildGround();

  loadNote.textContent = "planting the swamp…";
  await paint();
  buildTrees();

  loadNote.textContent = "building the parish…";
  await paint();
  await buildLevel();

  // Final sweep: the hand-built landmarks (Popeyes, trailers, water towers,
  // sheds) are plain coloured boxes straight out of the builders. Everything
  // already upgraded carries a gtbRealized tag and is skipped, and shadow flags
  // are left exactly as each builder set them.
  initLightPool();
  // shafts, pools and halos under every lamp (and poles for the lot lights) —
  // before the sweep below, so the new poles get a proper steel surface
  for (const sp of litSpots) if (sp.fx !== false) addLamp(scene, sp);

  loadNote.textContent = "resurfacing the parish…";
  await new Promise((r) => setTimeout(r, 0));   // let the loading text paint
  realize(scene, { shadows: false });
  wetRoads.collect(scene);

  // Merge everything that never moves, per material and 48 m chunk. Anything
  // that moves or animates is excluded by its top-level object.
  loadNote.textContent = "batching the parish…";
  await paint();
  const moving = new Set([
    player, truckMarker, ...vehicles.map((v) => v.obj), ...enemies.map((e) => e.spr),
    ...cans, ...buckets, ...waterPatches, ...shrooms, ...torches, ...peds,
  ]);
  const batch = batchStatic(scene, { exclude: (root) => moving.has(root) });
  console.info(`[gfx] static batching: ${batch.meshes} meshes -> ${batch.meshes - batch.removed} (${batch.batches} batches)`);
  updateGfxLabel();

  camera.position.copy(playerPos.clone().add(CAM_OFFSET));
  camera.lookAt(playerPos);
  syncHUD();

  window.__game = { scene, camera, state, enemies, cans, buckets, kills, vehicles, sheriffs,
    gfxStats: GFX.stats, MIST, wetRoads, headlights, npcs, camCtl,
    get traffic() { return traffic; },
    get player() { return player; }, truck, blockers, blockerGrid, renderer, perf,
    get soundtrack() { return soundtrackReady; } };
  loadNote.textContent = "ready.";
  startBtn.disabled = false;
  startBtn.onclick = () => {
    overlay.classList.add("hidden");
    crosshair.style.display = "block";
    state.running = true;
    clock.start();
    music.volume = 0.55;
    soundtrackReady.then((s) => s.play());
    flashObjective("Click the game to look around with the mouse · Esc releases it");
  };
}

startBtn.disabled = true;
tick();
boot().catch((err) => {
  console.error(err);
  loadNote.textContent = "load error: " + err.message;
});

// space to fire (kept out of the Set-based handler for clean edge trigger)
addEventListener("keydown", (e) => {
  if (e.code === "Space" && state.running) { e.preventDefault(); fire(); }
});
