// ---------------------------------------------------------------------------
// landmarks.js — Procedural & model set-dressing kit for world expansion.
//
// Provides reusable asset integration and procedural set dressing:
//   1. Decorative Fences (Fence Pack variety: brick posts, iron rails, corner piers)
//   2. Office Clutter (abandoned_office_space pack: desks, swivel chairs, laptops, bins, planters)
//   3. City Building Variants (the 10 GLB building types from assets/city/models/textured)
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";

/** 10 City Building GLB model filenames and fallback specs */
export const CITY_BUILDING_TYPES = {
  cottage: { file: "sunbeam-cottage.glb", w: 12, h: 6, d: 10, color: 0xefe4cf, label: "Sunbeam Cottage" },
  apartments: { file: "meadow-apartments.glb", w: 16, h: 14, d: 12, color: 0xc9d6e3, label: "Meadow Apartments" },
  school: { file: "willowbrook-school.glb", w: 24, h: 9, d: 18, color: 0xb7c99a, label: "Willowbrook School" },
  cafe: { file: "cornerleaf-cafe.glb", w: 14, h: 7, d: 12, color: 0xe6b0a0, label: "Cornerleaf Cafe" },
  market: { file: "freshfield-market.glb", w: 20, h: 8, d: 16, color: 0xd9c7a0, label: "Freshfield Market" },
  hospital: { file: "harborlight-hospital.glb", w: 28, h: 16, d: 22, color: 0xd8d6cf, label: "Harborlight Hospital" },
  offices: { file: "sageworks-offices.glb", w: 22, h: 20, d: 18, color: 0x9cc7b4, label: "Sageworks Offices" },
  garage: { file: "mossline-garage.glb", w: 16, h: 7, d: 14, color: 0x8a8f96, label: "Mossline Garage" },
  fire_station: { file: "ember-fire-station.glb", w: 18, h: 10, d: 15, color: 0xd98e73, label: "Ember Fire Station" },
  tower: { file: "cloudline-tower.glb", w: 20, h: 36, d: 20, color: 0x8fb3d9, label: "Cloudline Tower" },
};

function stdMat(color, roughness = 0.7, name = "building mat", extra = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness, name, ...extra });
  m.userData.gtbRealized = true;
  return m;
}

// Cached by URL (matches main.js's loadGLB) — without this, every one of this
// file's ~9 call sites re-fetches and re-parses the same FBX from scratch on
// every placement (every gas station, every 6twelve, every office building's
// clutter, ...). Callers reposition/rescale the result and add it straight to
// their own group without cloning first, so the cache must hand back a fresh
// clone per call — returning the raw cached object would let two placements
// fight over one mesh (an Object3D has exactly one parent; the second
// .add(fbx) would silently steal it from the first).
const _fbxCache = new Map();   // url -> Promise<THREE.Group|null> (the template; never mutated or added to a scene)
// These packs ship painted backdrop cards — "Background", "Trees_Background" —
// hundreds of metres wide and hung 13-17 m up so the pack looks good on its own.
// main.js's loadFbxScene() has always dropped them (SITE_CLUTTER); this loader
// never did, so every gas station and 6twelve outpost placed out in the state
// brought a grey ceiling with it, over Tusouxroe among others. Only the backdrop
// family is culled here — the full SITE_CLUTTER list would eat the Fence Pack.
const BACKDROP_RE = /^(background|backdrop|skybox|sky_?dome|trees_background)/i;
function isBackdrop(o) {
  if (BACKDROP_RE.test(o.name || "")) return true;
  for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
    if (m && BACKDROP_RE.test(m.name || "")) return true;
  }
  return false;
}

/**
 * A shop pack is authored as a whole scene: the building, and around it the
 * pack's own ground, sidewalks, grass, trees, power lines and painted backdrop,
 * at scene scale. Placing one unfiltered drops a 475 x 324 m sidewalk and a
 * "Ground" mesh 18 m up over whatever town it landed in — which is what had
 * happened to Tusouxroe North. `SITE_CLUTTER` is main.js's list, plus the
 * packs' overhead cables; pass it whenever the pack is a scene rather than a
 * prop. Props (the Fence Pack, the office clutter) must NOT use it — it would
 * eat the fences.
 */
export const SITE_CLUTTER =
  /ground|asphalt|parking|road|street|sidewalk|pavement|terrain|grass|bush|plant|tree|curb|soil|sand|dirt|cable/i;

// These shop packs (6twelve, Gas_station, Tacos, BurgerPiz) were authored on
// someone else's machine and every material still points at ITS absolute
// Windows path for its texture — e.g. "C:\Users\srkak\Music\pasto\...\
// Plastic_04.jpg". FBXLoader already has its own workaround for exactly this
// (it strips a Windows-absolute reference down to the filename and resolves
// it against the FBX's own directory *before* a LoadingManager ever sees
// the URL — a manager-level check for "C:\" never fires), so what actually
// reaches this loader is "<fbx's own folder>/Plastic_04.jpg". That's still
// wrong: every one of these packs keeps its real textures one level down,
// in its own Textures/ folder, not beside the FBX — so it 404s and the
// material loads with no map and renders flat white. Redirect by filename
// into this pack's Textures/ folder instead; main.js's own FBX loader
// already patches an unrelated pair of packs (Designersoup cars, Trailer
// Park characters) the same way, this loader just never had a
// LoadingManager at all before now.
// Two more ways these packs are wrong, both of which 404/403 on every single
// load and leave the mesh flat white:
//
//  1. The FBX names a texture with the wrong EXTENSION. 6twelve asks for
//     Food_shelf_04.jpg, ice_cream_popsicles.jpg and Parking_lot.jpg; all three
//     are .png on disk. Aliased here rather than converted, because all three
//     carry an alpha channel a JPEG would throw away. Add to this map if another
//     pack turns out to have the same problem — the key is the filename the FBX
//     asks for, lowercased.
//  2. A material has an EMPTY texture filename, so FBXLoader resolves it to the
//     FBX's own directory and requests a folder. That is the
//     "assets/models/tacos/Tacos/Models/ 403" in the console. There is nothing
//     to fetch, so hand it a 1x1 transparent pixel inline and make no request
//     at all.
const TEXTURE_ALIASES = {
  "food_shelf_04.jpg": "Food_shelf_04.png",
  "ice_cream_popsicles.jpg": "ice_cream_popsicles.png",
  "parking_lot.jpg": "Parking_lot.png",
};
const BLANK_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function packTextureRoot(fbxUrl) {
  const dir = fbxUrl.slice(0, fbxUrl.lastIndexOf("/") + 1);
  // Tacos/BurgerPiz keep the FBX in its own Models/ folder, with Textures/ a
  // sibling of Models/, not a child of it; gas station/6twelve have no
  // Models/ folder, so Textures/ sits right next to the FBX.
  return /\/models\/$/i.test(dir) ? dir.slice(0, dir.lastIndexOf("/", dir.length - 2) + 1) : dir;
}
function loadFBX(url, cullRe) {
  if (!_fbxCache.has(url)) {
    const textureRoot = packTextureRoot(url);
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((u) => {
      // Already-resolved sources, never touched. This line matters far more than
      // it looks: FBXLoader hands EMBEDDED textures to the manager as `blob:`
      // URLs, and those have no file extension. An allow-list that only
      // recognises image extensions therefore blanks every embedded texture in
      // every pack — which is exactly what happened the first time this
      // modifier was inverted, and it turned the shop packs white.
      if (/^(blob:|data:|https?:)/i.test(u)) return u;
      // The model file itself, and anything already resolving into the pack's
      // real Textures/ folder.
      if (/\.(fbx|glb|gltf|dae|bin|fbm)$/i.test(u) || u.includes("/Textures/")) return u;
      const asked = u.split(/[\\/]/).pop();
      // No filename, or one with no extension at all: a broken reference.
      // three's FBXLoader.loadTexture() declares `let fileName;` and uses it
      // without ever assigning it when a texture node has no image child, so it
      // resolves nothing against the model's own folder and requests the FOLDER
      // — the "assets/models/tacos/Tacos/Models/ 403" on every load. There is
      // nothing to fetch; hand back a 1x1 pixel and make no request.
      if (!asked || !/\.[a-z0-9]+$/i.test(asked)) return BLANK_PIXEL;
      // A real image filename that is simply in the wrong place: these packs
      // keep their textures one level down in Textures/, not beside the model.
      if (/\.(jpe?g|png|tga|bmp|exr|tif?f|webp)$/i.test(asked)) {
        return `${textureRoot}Textures/${TEXTURE_ALIASES[asked.toLowerCase()] || asked}`;
      }
      // Anything else (.dds, .uasset, formats three cannot load anyway) goes
      // through exactly as the pack asked for it rather than being guessed at.
      return u;
    });
    const loader = new FBXLoader(manager);
    _fbxCache.set(url, new Promise((r) => loader.load(url, r, undefined, (e) => { console.warn("FBX load failed", url, e); r(null); })));
  }
  return _fbxCache.get(url).then((template) => {
    if (!template) return null;
    const copy = template.clone(true);
    const doomed = [];
    copy.traverse((o) => {
      if (!o.isMesh) return;
      if (isBackdrop(o)) { doomed.push(o); return; }
      if (!cullRe) return;
      // By material only when EVERY material is scenery: the 6twelve store and
      // the gas station's shop are single meshes that include a strip of their
      // own "Asphalt", and matching any one material deleted the building.
      const mats = (Array.isArray(o.material) ? o.material : [o.material]).filter(Boolean);
      if (cullRe.test(o.name || "") || (mats.length && mats.every((m) => cullRe.test(m.name || "")))) doomed.push(o);
    });
    for (const m of doomed) m.parent && m.parent.remove(m);
    return copy;
  });
}

/**
 * Keeps the shop, drops the rest of the pack's demo neighbourhood. The packs
 * surround their shop with other buildings that no name list can catch —
 * BurgerPiz ships four houses called "Building".."Building003" 70-190 m out,
 * Tacos about sixty "buildings_NN" around a taco stand, the gas station a
 * block of trees and bushes — and the model used to be centred on all of it,
 * so those houses landed across whatever roads were near the shop. Their flat
 * grey roofs, 9.8 m up, are what sat between the camera and the player in
 * Tusouxroe North.
 *
 * The site is the `anchor` meshes' footprint grown by `margin` metres. A mesh
 * stays if its centre is on the site and it isn't much bigger than the site
 * (a 76 m row of lamp posts can have its centre there too). Call it after
 * scaling, before centring.
 *
 * Returns the height of the shop's own floor (null if no anchor was found).
 * Stand the model on that, not on its lowest mesh: the gas station hides a
 * pump part 4.8 m under its forecourt, and lifting by the lowest mesh floated
 * the whole station that far off the ground (18 m while its bushes were in).
 */
function trimToSite(model, anchorRe, margin) {
  model.updateMatrixWorld(true);
  const box = (o) => {
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    return o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
  };
  const site = new THREE.Box3();
  model.traverse((o) => { if (o.isMesh && anchorRe.test(o.name || "")) site.union(box(o)); });
  if (site.isEmpty()) return null;     // a pack laid out differently: leave it whole
  const floor = site.min.y;
  site.expandByVector(new THREE.Vector3(margin, 0, margin));
  const w = (site.max.x - site.min.x) * 1.25, d = (site.max.z - site.min.z) * 1.25;
  const doomed = [];
  const c = new THREE.Vector3();
  model.traverse((o) => {
    if (!o.isMesh) return;
    const b = box(o);
    b.getCenter(c);
    const onSite = c.x >= site.min.x && c.x <= site.max.x && c.z >= site.min.z && c.z <= site.max.z;
    if (!onSite || b.max.x - b.min.x > w || b.max.z - b.min.z > d) doomed.push(o);
  });
  for (const o of doomed) o.parent && o.parent.remove(o);
  return floor;
}

// A mesh's .material can be a single Material or an array of them (common on
// multi-material FBX imports) — arrays have no .userData, so setting it
// directly throws. Marks every material on the mesh as already-authored so
// the scene-wide PBR pass (realize()) leaves it alone.
function markRealized(o) {
  if (!o.material) return;
  for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
    if (m) m.userData.gtbRealized = true;
  }
}

/**
 * Builds a decorative multi-part fence line using Fence Pack assets.
 */
export function makeDecorativeFence(ctx, x1, z1, x2, z2, opts = {}) {
  const { scene, addBlocker } = ctx;
  const g = new THREE.Group();

  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.sqrt(dx * dx + dz * dz);
  if (len < 0.5) return g;

  const angle = Math.atan2(dx, dz);
  g.position.set(x1, 0, z1);
  g.rotation.y = angle;

  const spacing = 3.5;
  const count = Math.max(1, Math.floor(len / spacing));
  const step = len / count;

  loadFBX('./assets/models/fences/Fence Pack/Fence.fbx').then(fbx => {
    if (!fbx) return;
    const box = new THREE.Box3().setFromObject(fbx);
    const sz = box.getSize(new THREE.Vector3());
    const scale = step / Math.max(0.1, sz.z, sz.x);
    fbx.scale.setScalar(scale);

    for (let i = 0; i < count; i++) {
      const pz = i * step + (step / 2);
      const piece = fbx.clone(true);
      piece.position.set(0, 0, pz);
      // Fences might need rotation depending on FBX orientation
      piece.rotation.y = Math.PI / 2;
      g.add(piece);
    }
  });

  scene.add(g);
  return g;
}

/**
 * Procedural office furniture + FBX clutter from abandoned_office_space.
 */
export function placeOfficeClutter(ctx, x, z, ry = 0) {
  const { scene, addBlocker } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;

  const woodMat = stdMat(0x6a4a3a, 0.8, "desk wood");
  const metalMat = stdMat(0x3a3d40, 0.5, "desk frame", { metalness: 0.7 });
  const chairMat = stdMat(0x22252a, 0.9, "office chair");
  
  // Executive Desk
  const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 1.2), woodMat);
  desk.position.set(0, 0.75, 0);
  desk.castShadow = desk.receiveShadow = true;
  g.add(desk);

  // Legs
  for (const [lx, lz] of [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.75, 0.08), metalMat);
    leg.position.set(lx, 0.375, lz);
    leg.castShadow = true;
    g.add(leg);
  }

  // Swivel Chair
  const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.55), chairMat);
  chairSeat.position.set(0, 0.45, 0.8);
  g.add(chairSeat);

  const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.08), chairMat);
  chairBack.position.set(0, 0.75, 1.05);
  g.add(chairBack);

  const chairStem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.4, 8), metalMat);
  chairStem.position.set(0, 0.2, 0.8);
  g.add(chairStem);

  // Load abandoned_office_space clutter
  loadFBX('./assets/models/office/Content/meshes/laptop.FBX').then(fbx => {
    if (!fbx) return;
    const box = new THREE.Box3().setFromObject(fbx);
    const sz = box.getSize(new THREE.Vector3());
    fbx.scale.setScalar(0.4 / Math.max(0.01, sz.x));
    fbx.position.set(-0.3, 0.81, 0.1);
    g.add(fbx);
  });

  loadFBX('./assets/models/office/Content/meshes/bin.FBX').then(fbx => {
    if (!fbx) return;
    const box = new THREE.Box3().setFromObject(fbx);
    const sz = box.getSize(new THREE.Vector3());
    fbx.scale.setScalar(0.4 / Math.max(0.01, sz.y));
    fbx.position.set(1.1, 0.0, 0.3);
    g.add(fbx);
  });

  loadFBX('./assets/models/office/Content/meshes/flower_pot.FBX').then(fbx => {
    if (!fbx) return;
    const box = new THREE.Box3().setFromObject(fbx);
    const sz = box.getSize(new THREE.Vector3());
    fbx.scale.setScalar(0.7 / Math.max(0.01, sz.y));
    fbx.position.set(-1.1, 0.0, -0.4);
    g.add(fbx);
  });

  scene.add(g);
  if (ctx && ctx.props) ctx.props.push(g);
  if (addBlocker) addBlocker(x, z, 1.5);
  return g;
}

const CAR_FILES = {
  beatall: "docLorean", // fallback if names don't exactly match
  doclorean: "docLorean",
  landyroamer: "Landyroamer",
  toyoyo: "Toyoyo Highlight",
  tristar: "Tristar Racer"
};

// main.js installs this: it turns a parked DeLorean into a real, drivable (hovering) vehicle.
// Only the DeLorean is taken over — every other parked car here is scenery.
let parkVehicleHook = null;
export function setParkVehicleHook(fn) { parkVehicleHook = fn; }

export function placeParkedCar(ctx, carType, x, z, ry = 0) {
  const { scene, addBlocker, loadDsCar } = ctx;
  if (carType === "doclorean" && parkVehicleHook && loadDsCar) {
    loadDsCar("docLorean").then((obj) => { if (obj) parkVehicleHook(obj.clone(true), x, z, ry); });
    return null;
  }
  if (!loadDsCar) return;
  const name = CAR_FILES[carType] || "docLorean";
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  loadDsCar(name).then((obj) => {
    if (!obj) return;
    const model = obj.clone(true);
    model.position.set(0, 0, 0);
    g.add(model);
  });
  scene.add(g);
  if (ctx.props) ctx.props.push(g);
  if (addBlocker) addBlocker(x, z, 2.5); // block driving through it
  return g;
}

const TRUCK_FILES = {
  pickup: ["Pick_Up_1.fbx", "Pick_Up_1_128x128_Color.png"],
  truck: ["Truck_1.fbx", "Truck_1_128x128_Color.png"],
  van: ["Van_1.fbx", "Van_1_128x128_Color.png"],
  car_b: ["Car_1_B.fbx", "Car_1_B_128x128_Color.png"],
  car_r: ["Car_1_R.fbx", "Car_1_R_128x128_Color.png"],
  car_y: ["Car_1_Y.fbx", "Car_1_Y_128x128_Color.png"]
};

export function placeTruck(ctx, type, x, z, ry = 0) {
  const { scene, addBlocker, loadVehicle } = ctx;
  if (!loadVehicle) return;
  const files = TRUCK_FILES[type] || TRUCK_FILES.pickup;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  loadVehicle(files[0], files[1]).then((obj) => {
    if (!obj) return;
    const model = obj.clone(true);
    model.position.set(0, 0, 0);
    g.add(model);
  });
  scene.add(g);
  if (ctx.props) ctx.props.push(g);
  if (addBlocker) addBlocker(x, z, 2.8);
  return g;
}

export function placeShopGLB(ctx, file, x, z, ry = 0, w = 15, h = 10, d = 15) {
  const { scene, addBlocker } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  
  if (ctx.loadGLB) {
    ctx.loadGLB(file).then((glb) => {
      if (glb) {
        const model = glb.clone(true);
        let b = new THREE.Box3().setFromObject(model);
        const sz = b.getSize(new THREE.Vector3());
        
        const scale = Math.min(w / Math.max(0.1, sz.x), h / Math.max(0.1, sz.y), d / Math.max(0.1, sz.z));
        model.scale.setScalar(scale);
        
        b.setFromObject(model);
        const center = b.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -b.min.y, -center.z);
        
        model.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            markRealized(o);
          }
        });
        
        g.add(model);
      }
    });
  }
  
  scene.add(g);
  if (ctx.props) ctx.props.push(g);
  if (addBlocker) addBlocker(x, z, Math.max(w, d) / 2);
}

/**
 * Places any model by URL, GLB/GLTF or FBX, sight unseen — the map editor's
 * bulk R2 asset library (hundreds of packs pulled from a folder never meant
 * for this game, with no curated size/scale metadata for any of them) uses
 * this instead of a bespoke placeXxx() per model. Centres the model at its
 * own footprint and sits it on the ground the same way every curated
 * placement above does; unlike placeShopGLB() it does NOT force-fit a target
 * box, since that would just as happily crush an actual building down to
 * clutter size — it trusts the pack's authored scale and only steps in for
 * the pathological cases (a pack modelled in centimetres reading as a 1000 m
 * building, or a prop sitting at a 0.001 scale), which a fixed target box
 * can't tell apart from a real 1000 m stadium anyway. FBX packs get the same
 * Textures/-folder redirect as the curated shop packs (loadFBX already does
 * this for any URL, not just the four it was written for); GLB/GLTF need no
 * redirect since their textures are either embedded or resolve relative to
 * their own URL.
 */
export function placeR2Model(ctx, url, x, z, ry = 0) {
  const { scene, addBlocker } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;

  const isGlbLike = /\.(glb|gltf)$/i.test(url);
  const load = isGlbLike && ctx.loadGLB ? ctx.loadGLB(url) : loadFBX(url, null);
  load.then((template) => {
    if (!template) return;
    const model = template.clone(true);
    let box = new THREE.Box3().setFromObject(model);
    let size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.z, 0.001);
    if (maxDim > 60 || maxDim < 0.1) {
      model.scale.setScalar(6 / maxDim);
      box = new THREE.Box3().setFromObject(model);
    }
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);
    model.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; markRealized(o); }
    });
    g.add(model);
  });

  scene.add(g);
  if (ctx.props) ctx.props.push(g);
  if (addBlocker) addBlocker(x, z, 4);
  return g;
}

export function placeGasStation(ctx, x, z, ry = 0) {
  const { scene, addBlocker } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  
  loadFBX('./assets/models/gasstation/Gas_station.fbx', SITE_CLUTTER).then((fbx) => {
    if (fbx) {
      const model = fbx.clone(true);
      model.scale.setScalar(0.015);
      // the canopy, the station's store 38 m behind it, and the restrooms
      const floor = trimToSite(model, /^(The_ceiling|6twelve|Bathrooms)$/, 5);

      let b = new THREE.Box3().setFromObject(model);
      const center = b.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -(floor ?? b.min.y), -center.z);

      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          markRealized(o);
        }
      });
      g.add(model);
    }
  });
  scene.add(g);
  if (ctx.props) ctx.props.push(g);
  if (addBlocker) addBlocker(x, z, 14);
}

export function placeSixTwelve(ctx, x, z, ry = 0) {
  const { scene, addBlocker } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  
  loadFBX('./assets/models/sixtwelve/6twelve.fbx', SITE_CLUTTER).then((fbx) => {
    if (fbx) {
      const model = fbx.clone(true);
      model.scale.setScalar(0.015);
      const floor = trimToSite(model, /^6twelve$/, 5);

      let b = new THREE.Box3().setFromObject(model);
      const center = b.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -(floor ?? b.min.y), -center.z);

      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          markRealized(o);
        }
      });
      g.add(model);
    }
  });
  scene.add(g);
  if (ctx.props) ctx.props.push(g);
  if (addBlocker) addBlocker(x, z, 12);
}



/**
 * Builds a structured building corresponding to one of the 10 city GLB variants.
 */
export function placeCityBuilding(ctx, typeKey, x, z, ry = 0) {
  const spec = CITY_BUILDING_TYPES[typeKey] || CITY_BUILDING_TYPES.offices;
  const { scene, addBlocker, addLitSpot } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;

  const mainMat = stdMat(spec.color, 0.8, spec.label);
  const trimMat = stdMat(0xf2eee4, 0.7, "building trim");
  const glassMat = stdMat(0x1e2b37, 0.3, "building glass", { metalness: 0.4 });
  const roofMat = stdMat(0x3a3d40, 0.9, "roof concrete");

  if (ctx.loadGLB && spec.file) {
    // These packs ship painted backdrop cards — "Background", "Trees_Background" —
    // 474 x 320 m planes that the pack puts at y 13-17. Dropped on load: they hung
    // over Tusouxroe and Chatboro as a grey ceiling with the town underneath it.
    ctx.loadGLB(`./assets/city/models/textured/${spec.file}`, /background|backdrop|skybox/i).then((glb) => {
      if (glb) {
        // Clone the scene and add it to our group
        const model = glb.clone(true);
        // Correct orientation if needed. Some packs face +Z, some face +X. We assume +Z is front.
        // The procedural boxes assumed +Z is front. Let's trust the GLB or adjust if necessary.
        let b = new THREE.Box3().setFromObject(model);
        const sz = b.getSize(new THREE.Vector3());

        // Scale to fit the intended bounds
        const sx = spec.w / Math.max(0.1, sz.x);
        const sy = spec.h / Math.max(0.1, sz.y);
        const sdz = spec.d / Math.max(0.1, sz.z);
        const scale = Math.min(sx, sy, sdz);
        model.scale.setScalar(scale);

        // Recenter to ensure it pivots at the bottom center
        b.setFromObject(model);
        const center = b.getCenter(new THREE.Vector3());
        model.position.set(-center.x, -b.min.y, -center.z);

        // Ensure shadows and materials are prepared. markRealized() is the
        // actual fix for the "white hospital buildings" bug: these GLBs come
        // pre-textured, but nothing tagged their materials gtbRealized, so
        // the scene-wide realize() pass (graphics.js) treated them as
        // un-authored — reclassified them by material name and overwrote
        // roughness/metalness/color, which is what washed them out white.
        // A blanket `if (false && ...)` disabled every GLB building instead
        // of fixing that; this restores real models with the actual fix.
        model.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
            markRealized(o);
          }
        });

        g.add(model);
      }
    });
  } else {
    // Main structure box (Fallback)
    const mainBox = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), mainMat);
    mainBox.position.set(0, spec.h / 2, 0);
    mainBox.castShadow = mainBox.receiveShadow = true;
    g.add(mainBox);

    // Roof cap
    const roofCap = new THREE.Mesh(new THREE.BoxGeometry(spec.w + 0.4, 0.4, spec.d + 0.4), roofMat);
    roofCap.position.set(0, spec.h + 0.2, 0);
    g.add(roofCap);

    // Windows grid
    const floors = Math.max(1, Math.floor(spec.h / 3.2));
    for (let f = 0; f < floors; f++) {
      const wy = 1.8 + f * 3.2;
      const windowCols = Math.max(2, Math.floor(spec.w / 3.5));
      for (let c = 0; c < windowCols; c++) {
        const wx = -spec.w / 2 + 1.8 + c * ((spec.w - 3.6) / Math.max(1, windowCols - 1));
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.6, 0.1), glassMat);
        win.position.set(wx, wy, spec.d / 2 + 0.02);
        g.add(win);
      }
    }

    // Entrance door & canopy
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.4, 0.1), trimMat);
    door.position.set(0, 1.2, spec.d / 2 + 0.03);
    g.add(door);

    const canopy = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.2, 1.4), trimMat);
    canopy.position.set(0, 2.5, spec.d / 2 + 0.7);
    g.add(canopy);
  }

  scene.add(g);
  if (ctx && ctx.props) ctx.props.push(g);

  if (addBlocker) {
    // Collision follows the footprint: circles the size of the short side laid
    // along the long one, plus one in each corner (half the largest side once left
    // diagonal gaps to walk through). One circle of half the DIAGONAL covered the
    // corners but reached metres past every wall — 6.8 m in front of Harborlight
    // Hospital's doors, which walled its entrance (and the gun counters, services.js)
    // off behind an invisible wall.
    const long = Math.max(spec.w, spec.d) / 2, short = Math.min(spec.w, spec.d) / 2;
    const alongX = spec.w >= spec.d;
    const put = (a, b, r) => {                  // a: along the long side, b: across it (local)
      const lx = alongX ? a : b, lz = alongX ? b : a;
      addBlocker(x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry), r);
    };
    const n = Math.max(1, Math.ceil((long - short) / short) + 1);
    for (let i = 0; i < n; i++) put(n === 1 ? 0 : -(long - short) + (2 * (long - short) * i) / (n - 1), 0, short);
    for (const [sa, sb] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) put(sa * (long - short * 0.5), sb * short * 0.5, short * 0.5);
  }
  if (addLitSpot) {
    addLitSpot({ x, y: 3.5, z: z + spec.d / 2 + 1.2, warm: 0xffd9a0, power: 80, range: 18 });
  }

  return g;
}

/**
 * Places rich street clutter (dumpsters, trash bins, pallets, oil drums, benches, fire hydrants).
 */
export function placeStreetClutter(ctx, x, z, ry = 0) {
  const { scene, addBlocker } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;

  const greenMat = stdMat(0x2d5a37, 0.7, "dumpster green");
  const metalMat = stdMat(0x3a3f45, 0.5, "dark metal", { metalness: 0.7 });
  const woodMat = stdMat(0x7a5a3a, 0.9, "pallet wood");
  const rustMat = stdMat(0xa54a2a, 0.8, "rusty barrel", { metalness: 0.4 });
  const yellowMat = stdMat(0xd9ab2a, 0.6, "hydrant yellow");
  const benchMat = stdMat(0x4a3222, 0.85, "park bench wood");

  // Dumpster
  const dumpster = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.4, 1.4), greenMat);
  dumpster.position.set(0, 0.7, 0);
  dumpster.castShadow = dumpster.receiveShadow = true;
  g.add(dumpster);

  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.1, 1.5), metalMat);
  lid.position.set(0, 1.45, 0);
  lid.rotation.x = -0.15;
  g.add(lid);

  // Stack of wooden pallets beside dumpster
  for (let i = 0; i < 3; i++) {
    const pallet = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 1.2), woodMat);
    pallet.position.set(1.8, 0.07 + i * 0.14, 0.2);
    pallet.rotation.y = i * 0.1;
    pallet.castShadow = true;
    g.add(pallet);
  }

  // Steel oil drums / barrels
  for (const [bx, bz, rot] of [[-1.8, 0.3, 0], [-1.8, -0.4, 0.2]]) {
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 12), rustMat);
    drum.position.set(bx, 0.55, bz);
    drum.rotation.z = rot;
    drum.castShadow = true;
    g.add(drum);
  }

  // Fire Hydrant
  const hydrant = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.75, 10), yellowMat);
  hydrant.position.set(2.8, 0.375, -0.8);
  hydrant.castShadow = true;
  g.add(hydrant);

  // Street bench
  const benchSeat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.5), benchMat);
  benchSeat.position.set(0, 0.45, -1.8);
  g.add(benchSeat);
  const benchBack = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 0.08), benchMat);
  benchBack.position.set(0, 0.7, -2.05);
  g.add(benchBack);
  for (const legsX of [-0.75, 0.75]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.5), metalMat);
    leg.position.set(legsX, 0.225, -1.8);
    g.add(leg);
  }

  scene.add(g);
  if (ctx && ctx.props) ctx.props.push(g);
  if (addBlocker) addBlocker(x, z, 2.2);
  return g;
}

/**
 * Places maritime cargo stacks (shipping containers, cargo crates, crane base) for docks/ports.
 */
export function placeMaritimeCargo(ctx, x, z, ry = 0) {
  const { scene, addBlocker } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;

  const colors = [0xa83232, 0x2a5ca8, 0xd4a028, 0x2e7d32, 0x4a4f55];
  const woodMat = stdMat(0x8a6a4a, 0.85, "cargo crate wood");
  const steelMat = stdMat(0x3a3f45, 0.5, "crane steel", { metalness: 0.8 });

  // Stack of 4 shipping containers
  const containerSpecs = [
    { x: 0, z: 0, y: 1.4, col: colors[0], ry: 0 },
    { x: 0, z: 0, y: 4.2, col: colors[1], ry: 0 },
    { x: 3.2, z: 1.0, y: 1.4, col: colors[2], ry: 0.1 },
    { x: -3.2, z: -0.5, y: 1.4, col: colors[3], ry: -0.05 },
    { x: -3.2, z: -0.5, y: 4.2, col: colors[4], ry: -0.05 },
  ];

  for (const c of containerSpecs) {
    const mat = stdMat(c.col, 0.6, "container metal", { metalness: 0.4 });
    const cont = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.8, 6.2), mat);
    cont.position.set(c.x, c.y, c.z);
    cont.rotation.y = c.ry;
    cont.castShadow = cont.receiveShadow = true;
    g.add(cont);
  }

  // Wooden cargo crates stacked nearby
  for (const [cx, cz, cy, size] of [[1.8, -4.0, 0.6, 1.2], [3.2, -4.2, 0.6, 1.0], [2.4, -4.1, 1.7, 1.0]]) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), woodMat);
    crate.position.set(cx, cy, cz);
    crate.castShadow = crate.receiveShadow = true;
    g.add(crate);
  }

  scene.add(g);
  if (ctx && ctx.props) ctx.props.push(g);
  if (addBlocker) addBlocker(x, z, 5.0);
  return g;
}

/**
 * Places an industrial oil derrick pumpjack for badlands and industrial mining zones.
 */
export function placeOilDerrick(ctx, x, z, ry = 0) {
  const { scene, addBlocker, addLitSpot } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;

  const steelMat = stdMat(0x2b2e33, 0.4, "pumpjack steel", { metalness: 0.8 });
  const yellowMat = stdMat(0xd99a2a, 0.6, "safety paint");

  // Base platform
  const base = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.6, 12.0), steelMat);
  base.position.set(0, 0.3, 0);
  base.castShadow = base.receiveShadow = true;
  g.add(base);

  // Tower frame (A-frame legs)
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7.5, 0.3), steelMat);
    leg.position.set(side * 1.6, 4.0, 0);
    leg.rotation.z = -side * 0.2;
    leg.castShadow = true;
    g.add(leg);
  }

  // Walking beam / horsehead
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 9.0), steelMat);
  beam.position.set(0, 7.8, -0.5);
  beam.rotation.x = 0.12;
  beam.castShadow = true;
  g.add(beam);

  const horseHead = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 1.2), yellowMat);
  horseHead.position.set(0, 7.2, 4.2);
  g.add(horseHead);

  // Counterweight wheel
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.4, 16), steelMat);
  wheel.position.set(0, 3.2, -4.5);
  wheel.rotation.z = Math.PI / 2;
  g.add(wheel);

  scene.add(g);
  if (ctx && ctx.props) ctx.props.push(g);
  if (addBlocker) addBlocker(x, z, 5.5);
  if (addLitSpot) addLitSpot({ x, y: 8.5, z, warm: 0xffaa44, power: 120, range: 30 });
  return g;
}

/**
 * Places a Highway Billboard ad or sign.
 */
export function placeBillboard(ctx, x, z, ry = 0, title = "BAYOU MOTEL") {
  const { scene, addBlocker, addLitSpot } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;

  const poleMat = stdMat(0x3a3d40, 0.5, "billboard pole", { metalness: 0.7 });
  const boardMat = stdMat(0x1a2636, 0.6, "billboard face");
  const frameMat = stdMat(0xd9a028, 0.7, "billboard trim");

  // Twin support steel poles
  for (const px of [-3.2, 3.2]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 12.0, 12), poleMat);
    pole.position.set(px, 6.0, 0);
    pole.castShadow = true;
    g.add(pole);
  }

  // Billboard sign face
  const face = new THREE.Mesh(new THREE.BoxGeometry(10.0, 4.5, 0.4), boardMat);
  face.position.set(0, 10.5, 0);
  face.castShadow = face.receiveShadow = true;
  g.add(face);

  const trim = new THREE.Mesh(new THREE.BoxGeometry(10.4, 4.9, 0.2), frameMat);
  trim.position.set(0, 10.5, -0.15);
  g.add(trim);

  scene.add(g);
  if (ctx && ctx.props) ctx.props.push(g);
  if (addBlocker) addBlocker(x, z, 2.0);
  if (addLitSpot) addLitSpot({ x, y: 13.0, z: z + 0.8, warm: 0xffffff, power: 90, range: 22 });
  return g;
}

/**
 * Places a bayou stilt hut with wooden deck boardwalk and lanterns for swamp marsh regions.
 */
export function placeBayouStiltHut(ctx, x, z, ry = 0) {
  const { scene, addBlocker, addLitSpot } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;

  const woodMat = stdMat(0x5c4228, 0.9, "weathered wood");
  const tinMat = stdMat(0x4a5055, 0.6, "tin roof", { metalness: 0.5 });
  const lanternMat = stdMat(0x2a2010, 0.4, "lantern", { emissive: 0xffaa44, emissiveIntensity: 0.8 });

  // Wooden stilts / piles
  for (const px of [-3.0, 3.0]) {
    for (const pz of [-3.0, 3.0]) {
      const stilt = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 3.5, 8), woodMat);
      stilt.position.set(px, 1.75, pz);
      stilt.castShadow = true;
      g.add(stilt);
    }
  }

  // Main shack body
  const shack = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.2, 6.4), woodMat);
  shack.position.set(0, 5.1, 0);
  shack.castShadow = shack.receiveShadow = true;
  g.add(shack);

  // Tin roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(5.2, 2.2, 4), tinMat);
  roof.position.set(0, 7.8, 0);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  g.add(roof);

  // Front porch deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.3, 3.0), woodMat);
  deck.position.set(0, 3.5, 4.2);
  g.add(deck);

  // Hanging lantern
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.25), lanternMat);
  lantern.position.set(0, 4.8, 5.2);
  g.add(lantern);

  scene.add(g);
  if (ctx && ctx.props) ctx.props.push(g);
  if (addBlocker) addBlocker(x, z, 4.0);
  if (addLitSpot) addLitSpot({ x, y: 4.8, z: z + 5.2, warm: 0xffaa44, power: 85, range: 20 });
  return g;
}

export function placeGunShop(ctx, x, z, ry = 0) {
  placeCityBuilding(ctx, "garage", x, z, ry);
  // the counter: a ring in front of the shop (services.js — walk up, F, buy)
  if (ctx.addService) {
    const reach = CITY_BUILDING_TYPES.garage.d / 2 + 1.6;
    ctx.addService({ kind: "gun", name: "Bayou Arsenal", x: x + Math.sin(ry) * reach, z: z + Math.cos(ry) * reach, face: ry });
  }
  const dx = Math.sin(ry) * -8;
  const dz = Math.cos(ry) * -8;
  placeBillboard(ctx, x + dx, z + dz, ry, "BAYOU ARSENAL - GUNS & AMMO");
}
export function placeTacos(ctx, x, z, ry = 0) {
  const { scene, addBlocker } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  loadFBX('./assets/models/tacos/Tacos/Models/Tacos.fbx', SITE_CLUTTER).then((fbx) => {
    if (fbx) {
      const model = fbx.clone(true);
      model.scale.setScalar(0.012);
      // the stand and its grills, tables and chairs; the pack's OXXO next door is scenery
      const floor = trimToSite(model, /^Taco_stand$/, 4);
      let b = new THREE.Box3().setFromObject(model);
      const center = b.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -(floor ?? b.min.y), -center.z);
      model.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; markRealized(o); } });
      g.add(model);
    }
  });
  scene.add(g);
  if (addBlocker) addBlocker(x, z, 3.5);     // the stand's 7 x 4 m, not the 14 m block it used to bring
}

export function placeBurgerPiz(ctx, x, z, ry = 0) {
  const { scene, addBlocker } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  loadFBX('./assets/models/burgerpiz/BurgerPiz/Models/BurgerPiz.fbx', SITE_CLUTTER).then((fbx) => {
    if (fbx) {
      const model = fbx.clone(true);
      model.scale.setScalar(0.012);
      const floor = trimToSite(model, /^BurgerPiz$/, 5);
      let b = new THREE.Box3().setFromObject(model);
      const center = b.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -(floor ?? b.min.y), -center.z);
      model.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; markRealized(o); } });
      g.add(model);
    }
  });
  scene.add(g);
  if (addBlocker) addBlocker(x, z, 14);
}

/**
 * A Popeyes-style storefront — procedural, not a model pack, same as the
 * fast-food building main.js builds inline for the highway strip. This is a
 * simplified stand-in for the map editor's catalog (no shared canvas-drawn
 * sign texture or the strip's own parked-car spawn list — those are that
 * scene's own furniture, not something a generic ctx placement needs).
 */
export function placePopeyes(ctx, x, z, ry = 0) {
  const { scene, addBlocker, addLitSpot } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;

  const wallMat = stdMat(0xe8681c, 0.85, "popeyes wall");
  const trimMat = stdMat(0x8f2016, 0.8, "popeyes trim");
  const roofMat = stdMat(0x2f241c, 0.9, "popeyes roof");
  const signMat = stdMat(0x1e1e1e, 0.6, "popeyes sign", { emissive: 0xff8a2c, emissiveIntensity: 1.0 });

  const box = new THREE.Mesh(new THREE.BoxGeometry(11, 5, 9), wallMat);
  box.position.y = 2.5; box.castShadow = box.receiveShadow = true;
  const band = new THREE.Mesh(new THREE.BoxGeometry(11.3, 1.1, 9.3), trimMat);
  band.position.y = 4.6;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.5, 9.6), roofMat);
  roof.position.y = 5.3;

  // pylon sign, taller than the roofline so it reads from the road
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 20, 10), stdMat(0x1e1e1e, 0.6, "pole"));
  pole.position.set(9, 10, 7);
  const board = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 0.6), signMat);
  board.position.set(9, 19, 7);
  board.castShadow = true;

  const wsign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.6), signMat);
  wsign.position.set(0, 3.2, 4.55);

  g.add(box, band, roof, pole, board, wsign);
  scene.add(g);
  if (ctx.props) ctx.props.push(g);
  for (const [bx, bz] of [[0, 4.5], [0, -4.5], [5.5, 0], [-5.5, 0], [0, 0]]) {
    const wx = x + bx * Math.cos(ry) - bz * Math.sin(ry);
    const wz = z + bx * Math.sin(ry) + bz * Math.cos(ry);
    if (addBlocker) addBlocker(wx, wz, 2.6);
  }
  if (addLitSpot) addLitSpot({ x, y: 19, z, warm: 0xff8a2c, power: 100, range: 26 });
}

/**
 * A single street lamp from the shared urban kit (the same model the
 * highway's spaced streetlamps use) — placeable on its own for gaps the
 * procedural spacing doesn't reach. Left to `ctx.loadGLB`'s own `realize()`
 * pass for materials, same as `placeCityBuilding`, rather than force-applying
 * main.js's shared "urban" texture atlas (that's a private module texture,
 * not something a generic ctx placement can reach).
 */
export function placeStreetLamp(ctx, x, z, ry = 0) {
  const { scene, addBlocker, addLitSpot } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;

  if (ctx.loadGLB) {
    ctx.loadGLB("./assets/models/urban/Streetlamp/streetlamp_01.gltf").then((glb) => {
      if (!glb) return;
      const model = glb.clone(true);
      model.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; markRealized(o); } });
      g.add(model);
    });
  }
  scene.add(g);
  if (ctx.props) ctx.props.push(g);
  if (addBlocker) addBlocker(x, z, 0.6);
  if (addLitSpot) addLitSpot({ x, y: 5.5, z, warm: 0xffdca0, power: 70, range: 16 });
}
