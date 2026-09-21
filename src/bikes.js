// ---------------------------------------------------------------------------
// bikes.js — the two-wheelers: a sport motorbike and a Vespa-style scooter.
//
// Built from primitives, like the people (the asset packs have no bikes). Both
// face +Z with the tyres on the ground, ready for vehicles.js
// normalizeVehicleModel(); their definitions ("motorbike", "scooter") carry the
// handling, and main.js keeps the rider on show and leans the frame into turns.
// Material names follow graphics.js's rules (paint / rubber / chrome / leather),
// so realize() dresses them like the cars.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const PAINTS = [0xd0342a, 0x1f5fbf, 0xf2c230, 0x1d1d1f, 0x2e9d52, 0xf2f0ea, 0xff6a1a, 0x7a3fbf];
const SCOOTER_PAINTS = [0x7fd0c8, 0xf4c7c3, 0xf2e6b8, 0xd0342a, 0xa9c8e8, 0x3a3a3a, 0xc8e6a0];

function mesh(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  g.add(m);
  return m;
}
function std(name, color, extra = {}) {
  return new THREE.MeshStandardMaterial({ name, color, roughness: 0.5, ...extra });
}
function glow(color, k = 2.2) {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });
  m.userData.gtbRealized = true;
  return m;
}
function wheel(g, z, r, tube, y, rubber, hub) {
  mesh(g, new THREE.TorusGeometry(r, tube, 10, 22), rubber, 0, y, z, 0, Math.PI / 2, 0);
  mesh(g, new THREE.CylinderGeometry(r - tube * 0.6, r - tube * 0.6, 0.06, 16), hub, 0, y, z, 0, 0, Math.PI / 2);
}

/** A sport bike, ~2.1 m long, seat ~0.9 m up. */
export function buildMotorbike(color = PAINTS[(Math.random() * PAINTS.length) | 0]) {
  const g = new THREE.Group();
  const paint = std("motorbike paint", color, { metalness: 0.45, roughness: 0.28 });
  const frame = std("black frame metal", 0x1b1c1f, { metalness: 0.5, roughness: 0.45 });
  const rubber = std("tire rubber", 0x141414, { roughness: 0.95 });
  const chrome = std("chrome exhaust", 0xd8dadd, { metalness: 1, roughness: 0.16 });
  const leather = std("seat leather", 0x161616, { roughness: 0.62 });
  wheel(g, 0.74, 0.31, 0.09, 0.4, rubber, chrome);
  wheel(g, -0.72, 0.32, 0.1, 0.41, rubber, chrome);
  mesh(g, new THREE.BoxGeometry(0.3, 0.32, 0.46), frame, 0, 0.52, 0);                 // engine
  mesh(g, new THREE.BoxGeometry(0.12, 0.12, 1.2), frame, 0, 0.66, -0.02, -0.18);      // spine
  mesh(g, new THREE.BoxGeometry(0.38, 0.26, 0.52), paint, 0, 0.92, 0.18);            // tank
  mesh(g, new THREE.BoxGeometry(0.42, 0.34, 0.34), paint, 0, 0.98, 0.6, -0.4);       // fairing
  mesh(g, new THREE.BoxGeometry(0.3, 0.09, 0.56), leather, 0, 0.9, -0.22);           // seat
  mesh(g, new THREE.BoxGeometry(0.26, 0.14, 0.34), paint, 0, 0.92, -0.58, 0.25);     // tail
  mesh(g, new THREE.BoxGeometry(0.16, 0.06, 0.03), glow(0xff2020), 0, 0.95, -0.76);  // tail light
  mesh(g, new THREE.CircleGeometry(0.09, 14), glow(0xfff4d8, 2.6), 0, 1.02, 0.79, -0.4);   // headlight
  for (const s of [-1, 1]) {
    mesh(g, new THREE.CylinderGeometry(0.03, 0.03, 0.78, 8), chrome, s * 0.11, 0.78, 0.66, -0.35);   // forks
  }
  mesh(g, new THREE.CylinderGeometry(0.022, 0.022, 0.66, 8), frame, 0, 1.12, 0.46, 0, 0, Math.PI / 2);   // bars
  mesh(g, new THREE.CylinderGeometry(0.06, 0.07, 0.62, 10), chrome, 0.19, 0.44, -0.42, Math.PI / 2 - 0.12);  // exhaust
  return g;
}

/** A stretched procedural limousine for the high-end OrleaRouge traffic pool. */
export function buildLimo(color = 0x171b28) {
  const g = new THREE.Group();
  const paint = std("limo paint", color, { metalness: 0.5, roughness: 0.24 });
  const glass = std("limo tinted glass", 0x101a2b, { metalness: 0.35, roughness: 0.18 });
  const chrome = std("limo chrome", 0xd4af37, { metalness: 0.9, roughness: 0.2 });
  mesh(g, new THREE.BoxGeometry(1.9, 0.75, 6.0), paint, 0, 0.72, 0);
  mesh(g, new THREE.BoxGeometry(1.65, 0.58, 2.8), glass, 0, 1.32, 0.45);
  mesh(g, new THREE.BoxGeometry(1.7, 0.08, 5.5), chrome, 0, 0.98, 0);
  for (const z of [-2.05, -0.65, 0.75, 2.05]) {
    wheel(g, z, 0.29, 0.08, 0.36, std("limo tire", 0x111111), chrome);
  }
  mesh(g, new THREE.BoxGeometry(0.16, 0.12, 0.08), glow(0xfff4d8), 0, 1.0, 3.03);
  mesh(g, new THREE.BoxGeometry(0.18, 0.1, 0.08), glow(0xff2020), 0, 0.95, -3.03);
  return g;
}

/** A simple upright push bike. It deliberately shares the procedural bike
 * materials, but leaves the rider's legs visible for the pedal mechanic. */
export function buildPushBike(color = 0x2e9d52) {
  const g = new THREE.Group();
  const paint = std("push bike frame", color, { metalness: 0.25, roughness: 0.4 });
  const rubber = std("push bike tire", 0x141414, { roughness: 0.95 });
  const chrome = std("push bike chrome", 0xbfc4c8, { metalness: 0.8, roughness: 0.2 });
  wheel(g, 0.68, 0.34, 0.045, 0.38, rubber, chrome);
  wheel(g, -0.68, 0.34, 0.045, 0.38, rubber, chrome);
  mesh(g, new THREE.CylinderGeometry(0.035, 0.035, 1.05, 8), paint, 0, 0.72, 0, 0, 0, Math.PI / 2);
  mesh(g, new THREE.CylinderGeometry(0.035, 0.035, 0.85, 8), paint, 0, 0.62, 0.2, 0, 0.2, Math.PI / 2);
  mesh(g, new THREE.BoxGeometry(0.18, 0.06, 0.36), std("bike seat", 0x171717), 0, 0.86, -0.18);
  mesh(g, new THREE.CylinderGeometry(0.025, 0.025, 0.6, 8), chrome, 0, 1.03, 0.57, 0.15);
  mesh(g, new THREE.BoxGeometry(0.52, 0.04, 0.04), chrome, 0, 1.22, 0.5);
  return g;
}

/** A Vespa-style scooter, ~1.8 m long, seat ~0.78 m up. */
export function buildScooter(color = SCOOTER_PAINTS[(Math.random() * SCOOTER_PAINTS.length) | 0]) {
  const g = new THREE.Group();
  const paint = std("scooter paint", color, { metalness: 0.3, roughness: 0.32 });
  const rubber = std("tire rubber", 0x141414, { roughness: 0.95 });
  const chrome = std("chrome trim", 0xd8dadd, { metalness: 1, roughness: 0.18 });
  const leather = std("seat leather", 0x3a2a20, { roughness: 0.62 });
  wheel(g, 0.56, 0.21, 0.075, 0.28, rubber, chrome);
  wheel(g, -0.56, 0.21, 0.08, 0.28, rubber, chrome);
  mesh(g, new THREE.BoxGeometry(0.34, 0.07, 0.62), paint, 0, 0.3, 0.06);              // floorboard
  mesh(g, new THREE.BoxGeometry(0.44, 0.72, 0.07), paint, 0, 0.7, 0.4, 0.18);         // leg shield
  mesh(g, new THREE.BoxGeometry(0.3, 0.16, 0.34), paint, 0, 0.42, 0.56, 0.1);         // front mudguard
  const body = mesh(g, new THREE.SphereGeometry(0.34, 16, 12), paint, 0, 0.5, -0.32);    // the rounded rump
  body.scale.set(0.75, 0.62, 1.15);
  mesh(g, new THREE.BoxGeometry(0.3, 0.09, 0.5), leather, 0, 0.78, -0.26);            // seat
  mesh(g, new THREE.CylinderGeometry(0.035, 0.035, 0.62, 8), chrome, 0, 0.86, 0.46, 0.18);   // steering column
  mesh(g, new THREE.BoxGeometry(0.58, 0.05, 0.07), chrome, 0, 1.13, 0.4);             // handlebar
  mesh(g, new THREE.CylinderGeometry(0.08, 0.08, 0.06, 14), glow(0xfff4d8, 2.4), 0, 1.13, 0.47, Math.PI / 2);  // headlight
  mesh(g, new THREE.BoxGeometry(0.14, 0.05, 0.03), glow(0xff2020), 0, 0.62, -0.72);   // tail light
  return g;
}
