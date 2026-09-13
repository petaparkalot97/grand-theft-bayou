// ---------------------------------------------------------------------------
// potholes.js — Tusouxroe's roads, as maintained by the redevelopment initiative.
//
// A fixed number of potholes per street, placed with a seeded RNG so they are
// in the same place every load, never overlapping. Each street is one
// InstancedMesh of pothole decals (random size and rotation per instance) plus
// one of standing water for the holes that hold rain: two draw calls per street.
//
// hitTest() lets the driving code jolt the car when a wheel drops into one.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { deriveMaps } from "./graphics.js";

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// An irregular blob outline: a circle wobbled by a few sines.
function blobPath(x, cx, cy, r, seed, lumps = 7) {
  x.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const k = 1 + 0.16 * Math.sin(a * 3 + seed) + 0.09 * Math.sin(a * lumps + seed * 2.3) + 0.05 * Math.sin(a * 11 + seed * 0.7);
    const px = cx + Math.cos(a) * r * k, py = cy + Math.sin(a) * r * k;
    if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
  }
  x.closePath();
}

function potholeTexture() {
  const S = 256, c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d");
  // broken asphalt rim: a lighter, cracked ring around the hole
  blobPath(x, S / 2, S / 2, S * 0.46, 1.7, 9);
  x.fillStyle = "rgba(92,88,82,0.9)";
  x.fill();
  // the hole itself: dark, deeper toward the middle
  blobPath(x, S / 2, S / 2, S * 0.38, 4.1);
  const g = x.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.4);
  g.addColorStop(0, "#0b0a09");
  g.addColorStop(0.7, "#191714");
  g.addColorStop(1, "#2c2925");
  x.fillStyle = g;
  x.fill();
  // loose gravel in the bottom
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * S * 0.34;
    const v = 40 + Math.random() * 70;
    x.fillStyle = `rgba(${v},${v - 4},${v - 9},${0.35 + Math.random() * 0.5})`;
    x.beginPath();
    x.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, 0.8 + Math.random() * 2.4, 0, 7);
    x.fill();
  }
  // cracks running out from the rim
  x.strokeStyle = "rgba(18,16,14,0.8)";
  x.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    let a = Math.random() * Math.PI * 2, r = S * 0.36;
    x.beginPath();
    x.moveTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
    for (let s = 0; s < 4; s++) {
      a += (Math.random() - 0.5) * 0.5;
      r += 6 + Math.random() * 8;
      x.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
    }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function puddleAlpha() {
  const S = 128, c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d");
  x.fillStyle = "#000";
  x.fillRect(0, 0, S, S);
  blobPath(x, S / 2, S / 2, S * 0.36, 2.9, 6);
  const g = x.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.42);
  g.addColorStop(0, "#fff");
  g.addColorStop(1, "#000");
  x.fillStyle = g;
  x.fill();
  return new THREE.CanvasTexture(c);
}

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene
 * @param {Array} o.streets   [{ name, x0, x1, z0, z1, y }] — axis-aligned road areas
 * @param {number} o.perStreet  potholes per street (default 40)
 * @param {number} o.seed
 */
export function createPotholes({ scene, streets, perStreet = 40, seed = 1337 }) {
  const rnd = mulberry(seed);
  const list = [];

  const holeTex = potholeTexture();
  const holeMat = new THREE.MeshStandardMaterial({
    name: "pothole", map: holeTex, transparent: true, depthWrite: false,
    roughness: 0.95, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const maps = deriveMaps(holeTex, { strength: 3.2, detail: 0.8, tiles: 1, rough: 0.95, roughVar: 0.25 });
  if (maps) {
    holeMat.normalMap = maps.normal;
    holeMat.normalScale = new THREE.Vector2(2, 2);
    holeMat.roughnessMap = maps.orm;
  }
  holeMat.userData.gtbRealized = true;

  const waterMat = new THREE.MeshPhysicalMaterial({
    name: "puddle water", color: 0x0a1216, roughness: 0.04, metalness: 0,
    clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.4,
    transparent: true, alphaMap: puddleAlpha(), depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  waterMat.userData.gtbRealized = true;

  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const pos = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const meshes = [];

  for (const s of streets) {
    const placed = [];
    for (let tries = 0; placed.length < perStreet && tries < perStreet * 80; tries++) {
      const r = 0.35 + rnd() * rnd() * 0.8;                 // mostly small, a few craters
      const w = s.x1 - s.x0, d = s.z1 - s.z0;
      if (w < 2 * r || d < 2 * r) continue;
      const x = s.x0 + r + rnd() * (w - 2 * r);
      const z = s.z0 + r + rnd() * (d - 2 * r);
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + 0.5)) continue;
      placed.push({ x, z, r, y: s.y != null ? s.y : 0.045, rot: rnd() * Math.PI * 2, wet: rnd() < 0.4, street: s.name });
    }
    if (!placed.length) continue;

    const holes = new THREE.InstancedMesh(geo, holeMat, placed.length);
    placed.forEach((h, i) => {
      q.setFromAxisAngle(up, h.rot);
      sc.set(h.r * 2.4, 1, h.r * 2.1);
      pos.set(h.x, h.y, h.z);
      holes.setMatrixAt(i, m.compose(pos, q, sc));
    });
    holes.receiveShadow = true;
    holes.renderOrder = 1;
    holes.computeBoundingSphere();
    holes.name = "potholes:" + s.name;
    scene.add(holes);
    meshes.push(holes);

    const wet = placed.filter((h) => h.wet);
    if (wet.length) {
      const water = new THREE.InstancedMesh(geo, waterMat, wet.length);
      wet.forEach((h, i) => {
        q.setFromAxisAngle(up, h.rot + 0.6);
        sc.set(h.r * 1.7, 1, h.r * 1.5);
        pos.set(h.x, h.y + 0.004, h.z);
        water.setMatrixAt(i, m.compose(pos, q, sc));
      });
      water.renderOrder = 2;
      water.computeBoundingSphere();
      water.name = "pothole water:" + s.name;
      scene.add(water);
      meshes.push(water);
    }
    list.push(...placed);
  }

  return {
    list,
    meshes,
    /** Counts per street name, for QA. */
    get counts() {
      const out = {};
      for (const h of list) out[h.street] = (out[h.street] || 0) + 1;
      return out;
    },
    /**
     * How far a wheel circle at (x, z) of `radius` sits into a pothole.
     * Returns { depth: 0..1, hole } for the deepest overlap, or null.
     */
    hitTest(x, z, radius) {
      let best = null, depth = 0;
      for (let i = 0; i < list.length; i++) {
        const h = list[i];
        const dx = h.x - x, dz = h.z - z, reach = h.r + radius;
        if (dx > reach || dx < -reach || dz > reach || dz < -reach) continue;
        const k = 1 - Math.hypot(dx, dz) / reach;
        if (k <= 0) continue;
        const d = k * Math.min(1, 0.45 + h.r);            // bigger holes hit harder
        if (d > depth) { depth = d; best = h; }
      }
      return best ? { depth, hole: best } : null;
    },
  };
}
