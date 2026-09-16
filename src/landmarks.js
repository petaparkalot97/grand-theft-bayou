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

let _fbxLoader = null;
function loadFBX(url) {
  if (!_fbxLoader) _fbxLoader = new FBXLoader();
  return new Promise(r => _fbxLoader.load(url, r, undefined, e => { console.warn("FBX load failed", url, e); r(null); }));
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
  beatall: "Beatall.fbx",
  doclorean: "docLorean.fbx",
  landyroamer: "Landyroamer.fbx",
  toyoyo: "Toyoyo Highlight.fbx",
  tristar: "Tristar Racer.fbx"
};

export function placeParkedCar(ctx, carType, x, z, ry = 0) {
  const { scene, addBlocker } = ctx;
  const file = CAR_FILES[carType] || "Beatall.fbx";
  
  loadFBX(`./assets/models/cars/${file}`).then(fbx => {
    if (!fbx) return;
    const model = fbx.clone(true);
    
    // Scale down cars as they might be too big
    model.scale.setScalar(0.015);
    
    // Position
    model.position.set(x, 0, z);
    model.rotation.y = ry;
    
    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.material) o.material.userData.gtbRealized = true;
      }
    });
    
    scene.add(model);
    if (ctx.props) ctx.props.push(model);
  });
  
  if (addBlocker) addBlocker(x, z, 2.5);
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
            if (o.material) o.material.userData.gtbRealized = true;
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

export function placeGasStation(ctx, x, z, ry = 0) {
  const { scene, addBlocker } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  
  loadFBX('./assets/models/gasstation/Gas_station.fbx').then((fbx) => {
    if (fbx) {
      const model = fbx.clone(true);
      model.scale.setScalar(0.015);
      
      let b = new THREE.Box3().setFromObject(model);
      const center = b.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -b.min.y, -center.z);
      
      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          if (o.material) o.material.userData.gtbRealized = true;
        }
      });
      g.add(model);
    }
  });
  scene.add(g);
  if (ctx.props) ctx.props.push(g);
  if (addBlocker) addBlocker(x, z, 12);
}

export function placeSixTwelve(ctx, x, z, ry = 0) {
  const { scene, addBlocker } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  
  loadFBX('./assets/models/sixtwelve/6twelve.fbx').then((fbx) => {
    if (fbx) {
      const model = fbx.clone(true);
      model.scale.setScalar(0.015);
      
      let b = new THREE.Box3().setFromObject(model);
      const center = b.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -b.min.y, -center.z);
      
      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          if (o.material) o.material.userData.gtbRealized = true;
        }
      });
      g.add(model);
    }
  });
  scene.add(g);
  if (ctx.props) ctx.props.push(g);
  if (addBlocker) addBlocker(x, z, 10);
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
    ctx.loadGLB(`./assets/city/models/textured/${spec.file}`).then((glb) => {
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
        
        // Ensure shadows and materials are prepared
        model.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
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
  if (ctx.props) ctx.props.push(g);

  if (addBlocker) {
    addBlocker(x, z, Math.max(spec.w, spec.d) / 2);
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
  if (ctx.props) ctx.props.push(g);
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
  if (ctx.props) ctx.props.push(g);
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
  if (ctx.props) ctx.props.push(g);
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
  if (ctx.props) ctx.props.push(g);
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
  if (ctx.props) ctx.props.push(g);
  if (addBlocker) addBlocker(x, z, 4.0);
  if (addLitSpot) addLitSpot({ x, y: 4.8, z: z + 5.2, warm: 0xffaa44, power: 85, range: 20 });
  return g;
}

