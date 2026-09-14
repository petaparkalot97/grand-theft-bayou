// ---------------------------------------------------------------------------
// landmarks.js — Procedural & model set-dressing kit for world expansion.
//
// Provides reusable asset integration and procedural set dressing:
//   1. Decorative Fences (Fence Pack variety: brick posts, iron rails, corner piers)
//   2. Office Clutter (abandoned_office_space pack: desks, swivel chairs, laptops, bins, planters)
//   3. City Building Variants (the 10 GLB building types from assets/city/models/textured)
// ---------------------------------------------------------------------------

import * as THREE from "three";

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

/**
 * Builds a decorative multi-part fence line (reusing Fence Pack layout with posts, caps, and rails).
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

  const brickMat = stdMat(0x8a4a3a, 0.85, "brick pier");
  const stoneMat = stdMat(0xc9c3b8, 0.75, "stone cap");
  const ironMat = stdMat(0x1c1f22, 0.5, "iron rail", { metalness: 0.6 });

  const postSpacing = 3.5;
  const postCount = Math.max(2, Math.floor(len / postSpacing) + 1);
  const step = len / (postCount - 1);

  for (let i = 0; i < postCount; i++) {
    const pz = i * step;
    // Brick / stone pier post
    const pier = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.3, 0.45), brickMat);
    pier.position.set(0, 0.65, pz);
    pier.castShadow = pier.receiveShadow = true;
    g.add(pier);

    // Stone cap on top
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, 0.55), stoneMat);
    cap.position.set(0, 1.36, pz);
    cap.castShadow = true;
    g.add(cap);

    if (addBlocker) {
      const bx = x1 + (dx / len) * pz;
      const bz = z1 + (dz / len) * pz;
      addBlocker(bx, bz, 0.4);
    }
  }

  // Interconnecting rails & balusters
  for (let i = 0; i < postCount - 1; i++) {
    const zStart = i * step + 0.22;
    const zEnd = (i + 1) * step - 0.22;
    const span = zEnd - zStart;
    const zMid = (zStart + zEnd) / 2;

    // Top & bottom horizontal bars
    for (const ry of [0.35, 1.05]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, span), ironMat);
      bar.position.set(0, ry, zMid);
      bar.castShadow = true;
      g.add(bar);
    }

    // Vertical railing bars (balusters)
    const pickets = Math.max(2, Math.floor(span / 0.35));
    const pStep = span / (pickets + 1);
    for (let p = 1; p <= pickets; p++) {
      const picket = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.75, 0.04), ironMat);
      picket.position.set(0, 0.7, zStart + p * pStep);
      picket.castShadow = true;
      g.add(picket);
    }
  }

  scene.add(g);
  return g;
}

/**
 * Builds office space clutter (desks, chairs, laptops, trash bins, planters).
 */
export function placeOfficeClutter(ctx, x, z, ry = 0) {
  const { scene, addBlocker } = ctx;
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = ry;

  const woodMat = stdMat(0x6a4a3a, 0.8, "desk wood");
  const metalMat = stdMat(0x3a3d40, 0.5, "desk frame", { metalness: 0.7 });
  const chairMat = stdMat(0x22252a, 0.9, "office chair");
  const plantMat = stdMat(0x3a6b34, 0.85, "office plant");
  const potMat = stdMat(0xd9c7a0, 0.7, "terracotta pot");

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

  // Laptop on desk
  const laptopBase = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.25), metalMat);
  laptopBase.position.set(-0.3, 0.81, 0.1);
  g.add(laptopBase);

  const laptopScreen = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.22, 0.02), metalMat);
  laptopScreen.position.set(-0.3, 0.92, -0.02);
  laptopScreen.rotation.x = -0.2;
  g.add(laptopScreen);

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

  // Trash Bin beside desk
  const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.4, 12), metalMat);
  bin.position.set(1.1, 0.2, 0.3);
  g.add(bin);

  // Potted Flower / Plant
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.45, 12), potMat);
  pot.position.set(-1.1, 0.225, -0.4);
  g.add(pot);

  const foliage = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35), plantMat);
  foliage.position.set(-1.1, 0.6, -0.4);
  g.add(foliage);

  scene.add(g);
  if (addBlocker) addBlocker(x, z, 1.5);
  return g;
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

  // Main structure box
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

  scene.add(g);

  if (addBlocker) {
    addBlocker(x, z, Math.max(spec.w, spec.d) / 2);
  }
  if (addLitSpot) {
    addLitSpot({ x, y: 3.5, z: z + spec.d / 2 + 1.2, warm: 0xffd9a0, power: 80, range: 18 });
  }

  return g;
}
