// ---------------------------------------------------------------------------
// nolantis.js — ACT ONE, continued: NIRBAYOU NOLANTIS (TASK-017 part B).
//
// From the script: the elevator beyond the crown-and-waves door drops past
// rock, submerged ruins and glass waterways full of fish, clears the rock, and
// below lies Nirbayou Nolantis, a hidden metropolis beneath the Gulf. Dr. Amara
// Veaux and the Civic Guardians meet them at the arrival terminal. The tour is
// played: walk four stops with Amara (housing, the health garden, the public
// kitchen and farm, the public ledger), then enter the archive for "The Truth".
// Afterwards the elevator takes you back up to OrleaRouge.
//
// The city is a sealed cavern set built well west of the map (NOLANTIS), like
// the flood tunnel: everything lives under one root group that is kept out of
// static batching and only drawn when the camera is near. main.js lets the
// player walk here (outside MAP) while `inside` is true.
// ---------------------------------------------------------------------------

import * as THREE from "three";

export const NOLANTIS = Object.freeze({ x: -720, z: 110 });
const R = 150;                                   // cavern floor radius
const DOME = 155;
const SHAFT = { x: 0, z: -112 };                  // local; the elevator shaft
const CEIL = Math.sqrt(DOME * DOME - SHAFT.z * SHAFT.z);   // where the shaft meets the dome (~107 m)
const TOP_Y = CEIL + 80;                          // the elevator starts up here
const TERMINAL = { x: 0, z: -96 };                // where you step out
const STOPS = [
  { id: "housing", x: -62, z: -12, r: 9, label: "the housing terraces" },
  { id: "clinic", x: 62, z: -12, r: 9, label: "the health garden" },
  { id: "kitchen", x: -50, z: 52, r: 9, label: "the public kitchen and farm" },
  { id: "budget", x: 46, z: 54, r: 9, label: "the public ledger" },
];
const ARCHIVE = { x: 0, z: 124, r: 20, door: { x: 0, z: 100 } };
// Part C: the observation platform, looking over the city (clear of the monorail pillars and gardens)
const OVERLOOK = { x: -12, z: -70, face: { x: 0, z: 12 } };
const W = (lx, lz) => ({ x: NOLANTIS.x + lx, z: NOLANTIS.z + lz });

function basic(color, opts = {}) {
  const m = new THREE.MeshBasicMaterial({ color, ...opts });
  m.userData.gtbRealized = true;
  return m;
}
function std(name, color, opts = {}) {
  return new THREE.MeshStandardMaterial({ name, color, roughness: 0.7, ...opts });
}
function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {object} ctx from main.js: scene, camera, cine, state, playerPos, MAP,
 *   makeHoodrat(opts), makeCastMember(who), addBlocker(x, z, r),
 *   poolLight(color, power, range, x, y, z), surface(kind, size),
 *   flashObjective(text), getPlayer(), setObjective(text|null),
 *   setCameraYaw(yaw), exitVehicle(), teleport(x, z, heading),
 *   setPopulation(on), getMapCanvas() (the radar's base map, or null),
 *   returnTo { x, z, heading }, startNext() (optional: Part C)
 */
export function createNolantis(ctx) {
  const { scene, cine, state } = ctx;
  const root = new THREE.Group();
  root.name = "nolantis";
  root.position.set(NOLANTIS.x, 0, NOLANTIS.z);
  root.visible = false;
  const props = [root];

  let phase = "idle";        // idle | descent | arrival | tour | archive | truth | done | left
  let stop = 0;
  let talk = Promise.resolve();
  const cast = {};
  const extras = [];         // citizens, children, guardians
  const movers = [];
  const animated = [];       // (dt, t) => void, only run while the city is drawn
  let elevator = null, fish = null, board = null, holo = null, crownLayer = null;
  const elev = { y: TOP_Y, from: TOP_Y, to: TOP_Y, t: 0, dur: 0, resolve: null };
  let visTimer = 0;

  // ---------------------------------------------------------------- helpers
  function mesh(geo, mat, x, y, z, { cast: c = true, parent = root } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = c;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const block = (lx, lz, r) => ctx.addBlocker(NOLANTIS.x + lx, NOLANTIS.z + lz, r);
  function dialogue(fn) {
    talk = talk.then(() => cine.scene(fn)).catch((e) => console.error(e));
    return talk;
  }
  function place(a, lx, y, lz, faceLx, faceLz) {
    const p = W(lx, lz);
    a.visible = true;
    a.baseY = y;
    a.position.set(p.x, y, p.z);
    if (a._last) a._last.copy(a.position);
    if (faceLx != null) a._yaw = Math.atan2(faceLx - lx, faceLz - lz);
  }
  function moveTo(a, lx, lz, speed) {
    const p = W(lx, lz);
    return new Promise((resolve) => {
      const i = movers.findIndex((m) => m.obj === a);
      if (i >= 0) { movers[i].resolve(); movers.splice(i, 1); }
      movers.push({ obj: a, x: p.x, z: p.z, speed, resolve });
    });
  }
  function moveElevator(to, seconds) {
    return new Promise((resolve) => {
      if (elev.resolve) elev.resolve();
      Object.assign(elev, { from: elev.y, to, t: 0, dur: Math.max(0.01, seconds), resolve });
    });
  }
  /** A world-space camera position relative to the elevator car, for shots. */
  const atCar = (dx, dy, dz) => [NOLANTIS.x + SHAFT.x + dx, elev.y + dy, NOLANTIS.z + SHAFT.z + dz];
  const L = (lx, y, lz) => [NOLANTIS.x + lx, y, NOLANTIS.z + lz];

  // ---------------------------------------------------------------- the city
  function buildSet() {
    scene.add(root);           // everything below hangs off this group (kept out of static batching)
    // floor and walkways
    const floorMat = ctx.surface("concrete", 1024).material(20, { color: 0xe6ddc8 });
    const floor = mesh(new THREE.CircleGeometry(R, 72), floorMat, 0, 0.01, 0, { cast: false });
    floor.rotation.x = -Math.PI / 2;
    const path = std("pale stone walkway", 0xf4efe2);
    for (const [ri, ro] of [[28, 34], [62, 66]]) {
      const ring = mesh(new THREE.RingGeometry(ri, ro, 72), path, 0, 0.03, 0, { cast: false });
      ring.rotation.x = -Math.PI / 2;
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const spoke = mesh(new THREE.PlaneGeometry(4, 32), path, Math.cos(a) * 48, 0.025, Math.sin(a) * 48, { cast: false });
      spoke.rotation.x = -Math.PI / 2;
      spoke.rotation.z = -a + Math.PI / 2;
    }

    // the cavern: a dome of dark rock, an artificial sun
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(DOME, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ name: "cavern rock", color: 0x22393c, emissive: 0x0b2427, emissiveIntensity: 0.7, roughness: 1, side: THREE.BackSide }),
    );
    dome.material.userData.gtbRealized = true;
    root.add(dome);
    mesh(new THREE.SphereGeometry(10, 24, 16), basic(new THREE.Color(0xfff2c8).multiplyScalar(3)), 0, DOME - 20, 0, { cast: false });
    const halo = mesh(new THREE.SphereGeometry(22, 24, 16), basic(0xffe6a0, { transparent: true, opacity: 0.12, depthWrite: false }), 0, DOME - 20, 0, { cast: false });
    halo.renderOrder = 2;
    for (const [lx, lz] of [[0, 0], [-60, -10], [60, -10], [-50, 55], [46, 56], [0, -96], [0, 100], [0, 40]]) {
      ctx.poolLight(0xfff0d0, 90, 70, NOLANTIS.x + lx, 26, NOLANTIS.z + lz);
    }
    // the rim is the edge of the world
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      block(Math.cos(a) * (R - 3), Math.sin(a) * (R - 3), 3.5);
    }

    buildShaft();
    buildTerminal();
    buildTowers();
    buildGardens();
    buildTransit();
    buildStops();
    buildArchive();
    buildPlaza();
    buildOverlook();
    return props;
  }

  function buildOverlook() {
    // a railed lookout: a pale deck, glass panes on the city side, benches behind, a plaque
    const O = OVERLOOK, ang = Math.atan2(O.face.x - O.x, O.face.z - O.z);
    const disc = mesh(new THREE.CircleGeometry(5.5, 40), std("observation deck", 0xe9e2d0), O.x, 0.05, O.z, { cast: false });
    disc.rotation.x = -Math.PI / 2;
    const glass = new THREE.MeshPhysicalMaterial({ name: "lookout glass", color: 0xbfe8ff, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false });
    glass.userData.gtbRealized = true;
    const brass = std("lookout rail", 0xd4a93a, { metalness: 0.8, roughness: 0.3 });
    for (let i = -4; i <= 4; i++) {
      const a = ang + i * 0.3, x = O.x + Math.sin(a) * 5.2, z = O.z + Math.cos(a) * 5.2;
      const pane = mesh(new THREE.PlaneGeometry(1.6, 1), glass, x, 0.6, z, { cast: false });
      pane.rotation.y = a;
      const top = mesh(new THREE.BoxGeometry(1.6, 0.06, 0.08), brass, x, 1.12, z, { cast: false });
      top.rotation.y = a;
      block(x, z, 0.8);
    }
    const bench = std("lookout bench", 0x8a6a4a);
    for (const s of [-1, 1]) {
      const b = mesh(new THREE.BoxGeometry(1.8, 0.45, 0.5), bench,
        O.x - Math.sin(ang) * 3 + Math.cos(ang) * s * 1.6, 0.23, O.z - Math.cos(ang) * 3 - Math.sin(ang) * s * 1.6);
      b.rotation.y = ang;
    }
    const plaque = canvasTexture(1024, 160, (g, w, h) => {
      g.fillStyle = "#0f2f33"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#e9d8a6"; g.font = "bold 76px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("OBSERVATION PLATFORM", w / 2, h / 2 + 4);
    });
    const sp = mesh(new THREE.PlaneGeometry(4, 0.62), basic(0xffffff, { map: plaque }), O.x - Math.sin(ang) * 5.4, 1.6, O.z - Math.cos(ang) * 5.4, { cast: false });
    sp.rotation.y = ang + Math.PI;               // readable from the terminal side, where you walk up
  }

  function buildShaft() {
    // No pooled light reaches up here (the pool picks lights by x/z), so the shaft
    // lights itself: faintly glowing rock and a lamp ring every few metres.
    const rock = new THREE.MeshStandardMaterial({ name: "shaft rock", color: 0x4a423a, emissive: 0x2a211a, emissiveIntensity: 1, roughness: 1, side: THREE.BackSide });
    rock.userData.gtbRealized = true;
    const rockBoth = rock.clone();
    rockBoth.side = THREE.DoubleSide;
    rockBoth.userData.gtbRealized = true;
    const seg = (y0, y1, mat, r = 9) => mesh(new THREE.CylinderGeometry(r, r, y1 - y0, 28, 1, true), mat, SHAFT.x, (y0 + y1) / 2, SHAFT.z, { cast: false });
    seg(CEIL, CEIL + 12, rock);
    seg(CEIL + 42, TOP_Y + 12, rock);
    const cap = mesh(new THREE.CircleGeometry(9, 28), rockBoth, SHAFT.x, TOP_Y + 12, SHAFT.z, { cast: false });
    cap.rotation.x = Math.PI / 2;
    const lamp = basic(new THREE.Color(0xffd89a).multiplyScalar(2.2));
    for (let y = CEIL + 3; y < TOP_Y + 10; y += 9) {
      if (y > CEIL + 12 && y < CEIL + 42) continue;          // the glass band has the water's glow
      const ring = mesh(new THREE.TorusGeometry(8.7, 0.14, 6, 48), lamp, SHAFT.x, y, SHAFT.z, { cast: false });
      ring.rotation.x = Math.PI / 2;
    }
    // submerged ruins: broken columns set into the shaft wall
    const marble = new THREE.MeshStandardMaterial({ name: "ruined marble column", color: 0xcfc6b2, emissive: 0x4a4436, emissiveIntensity: 0.8, roughness: 0.8 });
    marble.userData.gtbRealized = true;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, h = 4 + (i % 3) * 2;
      const col = mesh(new THREE.CylinderGeometry(0.7, 0.8, h, 12), marble, SHAFT.x + Math.cos(a) * 8.2, CEIL + 52 + (i % 2) * 6, SHAFT.z + Math.sin(a) * 8.2);
      col.rotation.z = (i % 2 ? 0.25 : -0.18);
    }
    // the glass waterway band, with fish circling outside it
    const glass = new THREE.MeshPhysicalMaterial({ name: "elevator glass", color: 0xbfe8ff, transparent: true, opacity: 0.18, roughness: 0.05, transmission: 0, side: THREE.DoubleSide, depthWrite: false });
    glass.userData.gtbRealized = true;
    seg(CEIL + 12, CEIL + 42, glass);
    // the water glows faintly, and rock closes the band in, so the surface sky never shows through
    seg(CEIL + 12, CEIL + 42, basic(0x1b7f9e, { transparent: true, opacity: 0.55, side: THREE.BackSide, depthWrite: false }), 22);
    seg(CEIL + 12, CEIL + 42, rock, 26);
    for (const y of [CEIL + 12, CEIL + 42]) {
      const band = mesh(new THREE.RingGeometry(9, 26, 40), rockBoth, SHAFT.x, y, SHAFT.z, { cast: false });
      band.rotation.x = Math.PI / 2;
    }
    const fishGeo = new THREE.BoxGeometry(0.9, 0.35, 0.18);
    fish = new THREE.InstancedMesh(fishGeo, basic(0xf2c14e), 70);
    const fishState = Array.from({ length: 70 }, (_, i) => ({ r: 11 + (i * 7919) % 10, y: CEIL + 14 + ((i * 104729) % 26), a: (i / 70) * Math.PI * 2, s: 0.25 + ((i * 31) % 10) / 25 }));
    const fm = new THREE.Matrix4(), fq = new THREE.Quaternion(), fs = new THREE.Vector3(1, 1, 1), fv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    root.add(fish);
    animated.push((dt) => {
      fishState.forEach((f, i) => {
        f.a += f.s * dt;
        fv.set(SHAFT.x + Math.cos(f.a) * f.r, f.y + Math.sin(f.a * 3) * 0.4, SHAFT.z + Math.sin(f.a) * f.r);
        fq.setFromAxisAngle(up, -f.a);
        fish.setMatrixAt(i, fm.compose(fv, fq, fs));
      });
      fish.instanceMatrix.needsUpdate = true;
    });
    // below the rock: guide rails down to the terminal
    const steel = std("elevator rail", 0xd8dde2, { metalness: 0.8, roughness: 0.3 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      mesh(new THREE.CylinderGeometry(0.25, 0.25, CEIL, 8), steel, SHAFT.x + Math.cos(a) * 5, CEIL / 2, SHAFT.z + Math.sin(a) * 5);
    }
    // the car
    elevator = new THREE.Group();
    elevator.position.set(SHAFT.x, TOP_Y, SHAFT.z);
    root.add(elevator);
    const frame = std("elevator frame", 0xd4a93a, { metalness: 0.9, roughness: 0.3 });
    mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.35, 32), frame, 0, 0, 0, { parent: elevator });
    mesh(new THREE.CylinderGeometry(4.2, 4.2, 0.2, 32), frame, 0, 3.6, 0, { parent: elevator });
    mesh(new THREE.CylinderGeometry(4.05, 4.05, 3.4, 32, 1, true), glass, 0, 1.9, 0, { parent: elevator, cast: false });
  }

  function buildTerminal() {
    // an open shell canopy over the platform; the Civic Guardians wait under it
    const shell = new THREE.MeshStandardMaterial({ name: "pearl shell canopy", color: 0xf6f1e6, roughness: 0.35, side: THREE.DoubleSide });
    shell.userData.gtbRealized = true;
    const canopy = mesh(new THREE.SphereGeometry(14, 40, 16, 0, Math.PI * 2, 0, 1.0), shell, SHAFT.x, -4, SHAFT.z + 8, { cast: true });
    canopy.scale.set(1, 0.75, 1);
    const plat = std("terminal platform", 0xd9d2c0);
    const p = mesh(new THREE.CylinderGeometry(11, 11, 0.3, 40), plat, SHAFT.x, 0.15, SHAFT.z + 6, { cast: false });
    p.receiveShadow = true;
    const sign = canvasTexture(1024, 160, (g, w, h) => {
      g.fillStyle = "#0f2f33"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#e9d8a6"; g.font = "bold 76px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("ARRIVALS · SURFACE LINE", w / 2, h / 2 + 4);
    });
    // low on the canopy's south rim, facing the city (behind the camera when the tour starts)
    mesh(new THREE.PlaneGeometry(11, 1.7), basic(0xffffff, { map: sign }), SHAFT.x, 3.2, SHAFT.z + 8 + 14.4, { cast: false });
  }

  function buildTowers() {
    const pearls = [0xf3ead8, 0xd8ece6, 0xf2d9d0, 0xdfe3f2, 0xeadcf0, 0xe8f0d6];
    const windows = canvasTexture(128, 256, (g, w, h) => {
      g.fillStyle = "#1c2b30"; g.fillRect(0, 0, w, h);
      for (let y = 8; y < h; y += 24) {
        g.fillStyle = y % 48 ? "#ffe7b0" : "#bfe8ff";
        g.fillRect(0, y, w, 8);
      }
    });
    windows.wrapS = windows.wrapT = THREE.RepeatWrapping;
    const angles = [-62, -38, -12, 14, 40, 64, 116, 140, 166, 192, 218, 242];
    angles.forEach((deg, i) => {
      const a = (deg * Math.PI) / 180, rad = i % 2 ? 124 : 106;
      const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      const h = 36 + ((i * 37) % 44), base = 7 + (i % 3) * 2;
      // a shell profile: swelling, pinched, flaring to a lip
      const pts = [];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12;
        pts.push(new THREE.Vector2(base * (0.55 + 0.45 * Math.sin(Math.PI * (0.2 + 0.8 * t)) + 0.25 * Math.sin(t * 9 + i)) * (1 - t * 0.55) + 0.6, t * h));
      }
      const tex = windows.clone();
      tex.repeat.set(6, h / 18);
      tex.needsUpdate = true;
      const mat = new THREE.MeshStandardMaterial({ name: "pearl tower", color: pearls[i % pearls.length], roughness: 0.3, metalness: 0.15, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.45 });
      mat.userData.gtbRealized = true;
      const tower = mesh(new THREE.LatheGeometry(pts, 28), mat, x, 0, z);
      tower.rotation.y = i;
      block(x, z, base * 0.95);
      // coral spires between them
      const b = ((deg + 13) * Math.PI) / 180, cr = 88;
      const coral = std("coral spire", [0xff8f70, 0xf7b267, 0xc77dff][i % 3], { roughness: 0.6 });
      const cx = Math.cos(b) * cr, cz = Math.sin(b) * cr;
      if (Math.hypot(cx - SHAFT.x, cz - SHAFT.z) > 30 && Math.hypot(cx - ARCHIVE.x, cz - ARCHIVE.z) > 34) {
        mesh(new THREE.ConeGeometry(1.6, 22 + (i % 4) * 5, 10), coral, cx, 11 + (i % 4) * 2.5, cz);
        for (let r = 0; r < 3; r++) {
          const ring = mesh(new THREE.TorusGeometry(2.4 - r * 0.5, 0.35, 8, 20), coral, cx, 6 + r * 6, cz);
          ring.rotation.x = Math.PI / 2;
        }
        block(cx, cz, 2);
      }
    });
  }

  function buildGardens() {
    const grass = std("garden lawn", 0x5f9e45, { roughness: 0.95 });
    const spots = [];
    for (const [gx, gz, gr] of [[-30, -52, 12], [30, -52, 12], [-86, 20, 14], [86, 20, 14], [-24, 78, 11], [26, 80, 11], [0, 12, 9]]) {
      const d = mesh(new THREE.CircleGeometry(gr, 40), grass, gx, 0.04, gz, { cast: false });
      d.rotation.x = -Math.PI / 2;
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2 + gx, rr = gr * (0.35 + ((k * 7) % 5) / 9);
        spots.push([gx + Math.cos(a) * rr, gz + Math.sin(a) * rr, 0.8 + ((k * 13) % 7) / 10]);
      }
    }
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.6, 8);
    const crownGeo = new THREE.SphereGeometry(1.7, 14, 10);
    const trunks = new THREE.InstancedMesh(trunkGeo, std("garden tree bark", 0x6b4e33), spots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, std("garden tree leaves", 0x7fcf5a, { roughness: 0.8 }), spots.length);
    const m = new THREE.Matrix4(), s = new THREE.Vector3(), v = new THREE.Vector3(), q = new THREE.Quaternion();
    const tint = new THREE.Color();
    spots.forEach(([x, z, h], i) => {
      trunks.setMatrixAt(i, m.compose(v.set(x, 1.3 * h, z), q, s.set(h, h, h)));
      crowns.setMatrixAt(i, m.compose(v.set(x, 3.4 * h, z), q, s.set(h, h * 0.9, h)));
      crowns.setColorAt(i, tint.setHex(i % 5 === 0 ? 0xf29bb8 : i % 3 === 0 ? 0x9bdc6a : 0x6fbf4f));
      block(x, z, 0.5 * h);
    });
    trunks.castShadow = crowns.castShadow = true;
    root.add(trunks, crowns);
  }

  function buildTransit() {
    // an elevated monorail ring, silent trams gliding round it
    const rail = std("monorail track", 0xe8e4da, { metalness: 0.3, roughness: 0.4 });
    const track = mesh(new THREE.TorusGeometry(80, 0.7, 10, 128), rail, 0, 14, 0);
    track.rotation.x = Math.PI / 2;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
      const x = Math.cos(a) * 80, z = Math.sin(a) * 80;
      mesh(new THREE.CylinderGeometry(0.7, 1, 14, 12), rail, x, 7, z);
      block(x, z, 1.2);
    }
    const body = new THREE.MeshStandardMaterial({ name: "tram shell", color: 0xf7f4ec, roughness: 0.25, metalness: 0.2, emissive: 0x7fd8ff, emissiveIntensity: 0.25 });
    body.userData.gtbRealized = true;
    const trams = [0, 2.1, 4.2].map(() => {
      const t = new THREE.Mesh(new THREE.CapsuleGeometry(1.5, 7, 6, 16), body);
      t.castShadow = true;
      root.add(t);
      return t;
    });
    animated.push((dt, time) => {
      trams.forEach((tram, i) => {
        const a = time * 0.09 + i * 2.1;
        tram.position.set(Math.cos(a) * 80, 16.3, Math.sin(a) * 80);
        tram.rotation.set(Math.PI / 2, 0, 0);
        tram.rotation.y = 0;
        tram.rotation.z = a;                 // along the ring's tangent
      });
    });
  }

  function buildStops() {
    // 1 · housing terraces: stepped homes with planters on every roof
    const [hx, hz] = [STOPS[0].x - 14, STOPS[0].z];
    const wall = std("terrace housing", 0xf1e7d3);
    const green = std("roof planter", 0x5fa04a, { roughness: 0.95 });
    const warm = basic(new THREE.Color(0xffd89a).multiplyScalar(1.4));
    for (let k = 0; k < 4; k++) {
      const w = 22 - k * 4, y = 2.5 + k * 5;
      mesh(new THREE.BoxGeometry(w, 5, 14 - k * 2), wall, hx - k * 1.5, y, hz);
      mesh(new THREE.BoxGeometry(w, 0.4, 14 - k * 2), green, hx - k * 1.5, y + 2.7, hz, { cast: false });
      for (let j = -2; j <= 2; j++) mesh(new THREE.PlaneGeometry(1.4, 1.8), warm, hx - k * 1.5 + j * 3.4, y, hz + (14 - k * 2) / 2 + 0.02, { cast: false });
    }
    block(hx, hz, 9);
    // 2 · the health garden: a glass pavilion with the trees inside
    const pav = new THREE.MeshPhysicalMaterial({ name: "clinic glass", color: 0xd8f3ff, transparent: true, opacity: 0.3, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    pav.userData.gtbRealized = true;
    mesh(new THREE.SphereGeometry(13, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), pav, STOPS[1].x + 14, 0, STOPS[1].z, { cast: false });
    const cross = canvasTexture(512, 128, (g, w, h) => {
      g.fillStyle = "#f7f4ec"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#2f7f5f"; g.font = "bold 44px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("HEALTH GARDEN · NO CHARGE", w / 2, h / 2);
    });
    const clinicSign = mesh(new THREE.PlaneGeometry(9, 2.2), basic(0xffffff, { map: cross }), STOPS[1].x + 3, 3, STOPS[1].z, { cast: false });
    clinicSign.rotation.y = -Math.PI / 2;
    block(STOPS[1].x + 14, STOPS[1].z, 12);
    // 3 · public kitchen (long shared tables) and a vertical farm
    const wood = std("kitchen table", 0xb98a5a);
    for (let k = 0; k < 3; k++) mesh(new THREE.BoxGeometry(12, 0.9, 1.6), wood, STOPS[2].x - 4, 0.45, STOPS[2].z + 6 + k * 3.2);
    block(STOPS[2].x - 4, STOPS[2].z + 9, 5);
    const farm = std("vertical farm frame", 0xe3e0d6, { metalness: 0.3 });
    for (let k = 0; k < 6; k++) {
      mesh(new THREE.BoxGeometry(10, 0.3, 6), farm, STOPS[2].x - 16, 1 + k * 3, STOPS[2].z - 6);
      mesh(new THREE.BoxGeometry(9.4, 0.8, 5.4), green, STOPS[2].x - 16, 1.5 + k * 3, STOPS[2].z - 6, { cast: false });
    }
    block(STOPS[2].x - 16, STOPS[2].z - 6, 6);
    // a harvesting arm that never stops
    const arm = mesh(new THREE.BoxGeometry(0.4, 0.4, 7), farm, STOPS[2].x - 16, 9, STOPS[2].z - 6);
    animated.push((dt, t) => { arm.position.y = 2 + (Math.sin(t * 0.6) * 0.5 + 0.5) * 15; });
    // 4 · the public ledger: every expenditure, live
    const bc = document.createElement("canvas");
    bc.width = 1024; bc.height = 512;
    const btex = new THREE.CanvasTexture(bc);
    btex.colorSpace = THREE.SRGBColorSpace;
    board = { canvas: bc, tex: btex, t: 0, tick: 0 };
    drawBoard();
    const bx = STOPS[3].x + 12, bz = STOPS[3].z + 4;
    const face = mesh(new THREE.PlaneGeometry(16, 8), basic(0xffffff, { map: btex }), bx, 6, bz, { cast: false });
    face.rotation.y = Math.atan2(-bx, -bz);          // faces the plaza
    for (const off of [-6, 6]) {
      const ang = face.rotation.y;
      mesh(new THREE.CylinderGeometry(0.3, 0.3, 10, 10), farm, bx + Math.cos(ang) * off, 5, bz - Math.sin(ang) * off);
    }
    block(bx, bz, 4);
  }

  function drawBoard() {
    const g = board.canvas.getContext("2d"), w = board.canvas.width, h = board.canvas.height;
    const lines = [
      ["HOUSING", 21.4], ["HEALTH", 18.9], ["EDUCATION", 14.1], ["FOOD & KITCHENS", 9.2], ["RESEARCH", 8.3],
      ["TRANSIT", 7.7], ["CIVIC GUARDIANS", 3.1], ["REHABILITATION", 2.6], ["RESERVE", 14.7],
    ];
    g.fillStyle = "#0b1f22"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#e9d8a6"; g.font = "bold 40px Arial, sans-serif"; g.textAlign = "left"; g.textBaseline = "top";
    g.fillText("PUBLIC LEDGER · EVERY EXPENDITURE · LIVE", 32, 24);
    g.font = "28px Consolas, monospace";
    lines.forEach(([name, pct], i) => {
      const y = 92 + i * 44;
      const spent = (pct * 1.8e7 + board.tick * (137 + i * 53)).toLocaleString("en-US");
      g.fillStyle = "#9fd8c8"; g.fillText(name.padEnd(18, "."), 32, y);
      g.fillStyle = "#f4f1ea"; g.fillText(`${pct.toFixed(1)}%   ₦ ${spent}`, 420, y);
      g.fillStyle = "#2f7f7a"; g.fillRect(860, y + 6, pct * 6, 20);
    });
    board.tex.needsUpdate = true;
  }

  function buildArchive() {
    const stone = std("archive stone", 0xe7dfcd);
    const outer = mesh(new THREE.CylinderGeometry(ARCHIVE.r + 0.6, ARCHIVE.r + 0.6, 16, 48, 1, true, Math.PI * 0.08, Math.PI * 1.84), stone, ARCHIVE.x, 8, ARCHIVE.z);
    outer.rotation.y = -Math.PI / 2 - Math.PI * 0.08 + Math.PI;   // the gap faces the plaza (north)
    const innerMat = new THREE.MeshStandardMaterial({ name: "archive interior", color: 0x1a2a33, emissive: 0x0e2a36, emissiveIntensity: 0.8, side: THREE.BackSide });
    innerMat.userData.gtbRealized = true;
    mesh(new THREE.CylinderGeometry(ARCHIVE.r - 0.4, ARCHIVE.r - 0.4, 16, 48, 1, true), innerMat, ARCHIVE.x, 8, ARCHIVE.z, { cast: false });
    const roof = mesh(new THREE.CylinderGeometry(ARCHIVE.r + 1.4, ARCHIVE.r + 1.4, 0.8, 48), stone, ARCHIVE.x, 16.4, ARCHIVE.z);
    roof.castShadow = true;
    // the door: the crown beneath three waves, glowing
    const emblem = canvasTexture(512, 512, (g, S) => {
      g.fillStyle = "#0e2a33"; g.fillRect(0, 0, S, S);
      g.strokeStyle = "#e9c46a"; g.fillStyle = "#e9c46a"; g.lineWidth = 12; g.lineJoin = "round";
      g.beginPath(); g.moveTo(166, 250); g.lineTo(176, 150); g.lineTo(216, 205); g.lineTo(256, 130); g.lineTo(296, 205); g.lineTo(336, 150); g.lineTo(346, 250); g.closePath(); g.stroke();
      for (let wv = 0; wv < 3; wv++) { g.beginPath(); const y = 300 + wv * 44; for (let px = 120; px <= 392; px += 4) g.lineTo(px, y + Math.sin((px - 120) / 34) * 12); g.stroke(); }
    });
    mesh(new THREE.PlaneGeometry(8, 8), basic(new THREE.Color(1.4, 1.4, 1.4), { map: emblem }), ARCHIVE.x, 10, ARCHIVE.z - ARCHIVE.r - 0.8, { cast: false }).rotation.y = Math.PI;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const x = ARCHIVE.x + Math.cos(a) * (ARCHIVE.r + 1), z = ARCHIVE.z + Math.sin(a) * (ARCHIVE.r + 1);
      if (z < ARCHIVE.z - ARCHIVE.r + 6 && Math.abs(x - ARCHIVE.x) < 7) continue;   // leave the doorway
      block(x - NOLANTIS.x + NOLANTIS.x, z, 1.8);
    }
    // inside: the projection table
    mesh(new THREE.CylinderGeometry(6.5, 7.5, 1.6, 40), std("holo table", 0x2a3a42, { metalness: 0.6, roughness: 0.4 }), ARCHIVE.x, 0.8, ARCHIVE.z + 2);
    const mapTex = new THREE.CanvasTexture(ctx.getMapCanvas ? ctx.getMapCanvas() || placeholderMap() : placeholderMap());
    mapTex.colorSpace = THREE.SRGBColorSpace;
    const aspect = mapTex.image.width / mapTex.image.height;
    holo = mesh(new THREE.PlaneGeometry(11 * aspect / 1.15, 11 / 1.15), basic(0xbfe8ff, { map: mapTex, transparent: true, opacity: 0.85, depthWrite: false }), ARCHIVE.x, 2.3, ARCHIVE.z + 2, { cast: false });
    holo.rotation.x = -Math.PI / 2;
    holo.visible = false;
    const crownTex = new THREE.CanvasTexture(crownNetwork(mapTex.image.width, mapTex.image.height));
    crownTex.colorSpace = THREE.SRGBColorSpace;
    crownLayer = mesh(new THREE.PlaneGeometry(11 * aspect / 1.15, 11 / 1.15), basic(0xffffff, { map: crownTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), ARCHIVE.x, 2.35, ARCHIVE.z + 2, { cast: false });
    crownLayer.rotation.x = -Math.PI / 2;
    crownLayer.visible = false;
    ctx.poolLight(0x7fd8ff, 60, 30, NOLANTIS.x + ARCHIVE.x, 10, NOLANTIS.z + ARCHIVE.z);
  }

  function placeholderMap() {
    const c = document.createElement("canvas");
    c.width = 900; c.height = 800;
    const g = c.getContext("2d");
    g.fillStyle = "#24331f"; g.fillRect(0, 0, 900, 800);
    g.strokeStyle = "#cfcab8"; g.lineWidth = 16; g.beginPath(); g.moveTo(690, 0); g.lineTo(690, 800); g.stroke();
    return c;
  }

  /** Pelican Crown's reach, drawn over the map: the same projection as the radar's base map. */
  function crownNetwork(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    const M = ctx.MAP || { minX: -440, maxX: 136, minZ: -136, maxZ: 382 };
    const sx = w / (M.maxX - M.minX), sz = h / (M.maxZ - M.minZ);
    const P = (x, z) => [(x - M.minX) * sx, (z - M.minZ) * sz];
    const nodes = [
      ["CHATBORO SHERIFF", -6, 128], ["TUSOUXROE REDEVELOPMENT", -40, -80], ["DOWNTOWN TOWERS", 70, 300],
      ["REFINERY", 116, 164], ["CASINO BOAT", 48, 376], ["RIVERFRONT CONDOS", 94, 230], ["BAYOU NOIR FIELDS", -268, -20],
      ["THE CAPITOL", -120, -120],
    ];
    const hub = P(-60, 180);
    g.lineWidth = Math.max(3, w / 300);
    for (const [, x, z] of nodes) {
      const [px, py] = P(x, z);
      g.strokeStyle = "rgba(255,70,60,.85)";
      g.beginPath(); g.moveTo(hub[0], hub[1]); g.lineTo(px, py); g.stroke();
    }
    g.textAlign = "center"; g.textBaseline = "bottom";
    for (const [name, x, z] of nodes) {
      const [px, py] = P(x, z);
      g.fillStyle = "#ff4a3c"; g.beginPath(); g.arc(px, py, w / 90, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#ffd6cf"; g.font = `bold ${Math.round(w / 45)}px Arial, sans-serif`;
      g.fillText(name, px, py - w / 70);
    }
    g.fillStyle = "#ffe08a"; g.font = `bold ${Math.round(w / 26)}px Georgia, serif`;
    g.fillText("PELICAN CROWN HOLDINGS", hub[0], hub[1] - w / 50);
    g.fillStyle = "#ffe08a"; g.beginPath(); g.arc(hub[0], hub[1], w / 60, 0, Math.PI * 2); g.fill();
    return c;
  }

  function buildPlaza() {
    // a fountain at the heart of the central plaza
    const basin = std("fountain basin", 0xe7dfcd);
    mesh(new THREE.CylinderGeometry(7, 7.4, 0.9, 40), basin, 0, 0.45, 12);
    const water = new THREE.MeshPhysicalMaterial({ name: "fountain water", color: 0x3fa7c9, roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.85 });
    water.userData.gtbRealized = true;
    const wdisc = mesh(new THREE.CircleGeometry(6.6, 40), water, 0, 0.8, 12, { cast: false });
    wdisc.rotation.x = -Math.PI / 2;
    const jet = mesh(new THREE.CylinderGeometry(0.15, 0.5, 5, 10), basic(0xcff3ff, { transparent: true, opacity: 0.6 }), 0, 3, 12, { cast: false });
    animated.push((dt, t) => { jet.scale.y = 0.85 + Math.sin(t * 2.3) * 0.15; });
    block(0, 12, 7.5);
  }

  // ---------------------------------------------------------------- people
  function populate() {
    cast.solange = ctx.makeHoodrat({
      sex: "f", seed: 1997, skin: 0xb5835e, top: 0x4a2c5a, denim: 0x1f1f24, hair: 0x241610,
      headwear: "none", curly: true, crew: { cloth: 0x1f1f24, chain: 0xd4af37, shoe: 0x7a1f2a }, height: 1.76,
    });
    cast.mally = ctx.makeCastMember("mally");
    cast.bubba = ctx.makeCastMember("bubba");
    cast.amara = ctx.makeHoodrat({
      sex: "f", seed: 6161, skin: 0x6b4630, top: 0xf2f0ea, denim: 0x3a4a52, hair: 0xd6d3cc,
      headwear: "none", curly: true, beard: false, crew: { cloth: 0x2f7f7a, chain: 0xe9c46a, shoe: 0x2a2f33 }, height: 1.7,
    });
    for (const a of Object.values(cast)) { a.visible = false; scene.add(a); }

    const guardian = (seed, sex) => ctx.makeHoodrat({ sex, seed, top: 0x2f7f7a, denim: 0xe8e6de, headwear: "none", beard: false,
      crew: { cloth: 0x2f7f7a, chain: 0xe9c46a, shoe: 0xf2f0ea } });
    const g1 = guardian(71, "m"), g2 = guardian(72, "f");
    extras.push({ a: g1, home: [TERMINAL.x - 4, TERMINAL.z + 4] }, { a: g2, home: [TERMINAL.x + 4, TERMINAL.z + 4] });

    const tops = [0xe76f51, 0x2a9d8f, 0xe9c46a, 0x8ab17d, 0x9d4edd, 0x457b9d, 0xf4a261, 0xf1faee, 0xff8fab, 0x06d6a0];
    const skins = [0x3b2417, 0x5e3a26, 0x8d6446, 0xb5835e, 0xd6a57c, 0xe8c4a0, 0x6b4630, 0xc79a74];
    const nodes = [[-20, -30], [22, -28], [-45, 5], [44, 6], [-30, 36], [30, 38], [0, 55], [-12, 80], [14, 82], [-70, 34], [70, 34], [0, -60]];
    for (let i = 0; i < 12; i++) {
      const a = ctx.makeHoodrat({ sex: i % 2 ? "f" : "m", seed: 4000 + i * 17, skin: skins[i % skins.length], top: tops[i % tops.length],
        headwear: i % 4 === 0 ? "hat" : "none", beard: i % 3 === 0, curly: i % 2 === 0,
        crew: { cloth: tops[(i + 3) % tops.length], chain: 0xcfd3da, shoe: 0xf2f0ec, hat: 0xe8e6de } });
      extras.push({ a, walk: nodes, node: i % nodes.length, pace: 1.1 + (i % 4) * 0.15 });
    }
    // children playing round the fountain
    for (let i = 0; i < 4; i++) {
      const a = ctx.makeHoodrat({ sex: i % 2 ? "f" : "m", seed: 9000 + i, skin: skins[(i * 3) % skins.length], top: tops[(i * 2) % tops.length],
        headwear: "none", beard: false, crew: { cloth: 0x3a86ff, chain: 0xffffff, shoe: 0xffbe0b }, height: 1.15 });
      extras.push({ a, orbit: { r: 9 + (i % 2) * 2, s: 0.5 + i * 0.08, phase: (i / 4) * Math.PI * 2 } });
    }
    for (const e of extras) { e.a.visible = false; scene.add(e.a); }
  }

  function showExtras() {
    for (const e of extras) {
      if (e.home) place(e.a, e.home[0], 0, e.home[1], TERMINAL.x, TERMINAL.z - 20);
      else if (e.walk) place(e.a, e.walk[e.node][0], 0, e.walk[e.node][1]);
      else place(e.a, Math.cos(e.orbit.phase) * e.orbit.r, 0, 12 + Math.sin(e.orbit.phase) * e.orbit.r);
    }
  }

  // ---------------------------------------------------------------- scenes
  const say = (c, who, line) => c.say(who, line);

  async function descentScene(c) {
    state.cinematic = true;
    c.letterbox(true);
    await c.black(true, 0.01);
    ctx.exitVehicle();
    ctx.setPopulation(false);
    root.visible = true;
    showExtras();
    elev.y = TOP_Y;
    elevator.position.y = TOP_Y;
    const k = ctx.getPlayer();
    const shaftW = W(SHAFT.x, SHAFT.z);
    ctx.teleport(shaftW.x, shaftW.z, 0);
    riders = [k, cast.solange, cast.mally, cast.bubba];
    [[1.3, 1.1], [-1.4, 1.2], [1.4, -1.3], [-1.2, -1.4]].forEach(([dx, dz], i) => {
      place(riders[i], SHAFT.x + dx, TOP_Y + 0.35, SHAFT.z + dz, SHAFT.x, SHAFT.z + 10);
    });

    c.shot({ from: atCar(3.2, 2.6, -3.2), look: atCar(0, -12, 0), dur: 4 });
    moveElevator(CEIL + 48, 9);
    await c.black(false, 0.8);
    c.card("INT.", "THE ELEVATOR", "Going down");
    await c.caption("The elevator travels downward.", 2.2);
    await c.caption("Past rock.", 1.6);
    // bring the car level with the ruins, then look straight out through the glass at a broken column
    await moveElevator(CEIL + 50.5, 2.5);
    c.shot({ from: atCar(-1.5, 1.7, 0), look: L(SHAFT.x + 8.2, CEIL + 52, SHAFT.z), dur: 3 });
    await c.caption("Past submerged ruins.", 2);
    await moveElevator(CEIL + 30, 3);
    c.shot({ from: atCar(14, 0, 6), look: atCar(0, 1.6, 0), dur: 4 });
    moveElevator(CEIL + 14, 5);
    await c.caption("Past enormous transparent waterways filled with fish.", 2.6);
    c.shot({ from: atCar(1.2, 1.7, 2.2), look: atCar(-1.4, 1.5, -1.2), dur: 3 });
    await c.caption("The characters stare.", 1.6);
    await moveElevator(CEIL - 6, 3);
    c.shot({ from: L(SHAFT.x + 22, CEIL - 12, SHAFT.z + 24), look: atCar(0, 1, 0), dur: 3 });
    await c.caption("Then the elevator clears the rock.", 2);
    await c.caption("Everyone falls silent.", 1.6);

    // the reveal
    moveElevator(38, 16);
    c.shot({ from: L(0, 70, -70), to: L(0, 58, 10), look: L(0, 10, 40), lookTo: L(0, 6, 80), dur: 14 });
    await c.card("BELOW THEM LIES", "NIRBAYOU NOLANTIS", "An enormous hidden metropolis beneath the Gulf", { center: true, hold: 3.4 });
    await c.caption("Towers curve like shells and coral.", 2.2);
    await c.caption("Massive gardens grow beneath artificial sunlight.", 2.2);
    await c.caption("Clean electric transit moves silently through the city.", 2.2);
    await c.caption("No billboards. No trash. No homeless camps. No police sirens.", 2.8);
    await c.caption("Children play in public plazas.", 2);

    // over their shoulders, out through the glass at the city
    c.shot({ from: atCar(0.4, 2.7, -3.3), look: L(0, 6, 55), dur: 4 });
    await c.caption("Mally presses his face against the glass.", 1.8);
    await say(c, "MALLY", "We died.");
    await say(c, "BUBBA", "This doesn't look like my expected destination.");
    await c.caption("Solange is speechless.", 1.6);
    c.shot({ from: atCar(-2.6, 1.8, 2.2), look: atCar(1.3, 1.5, 1.1), dur: 3 });
    await say(c, "KESEME", "No advertisements.");
    await say(c, "SOLANGE", "That's what you noticed?");
    await say(c, "KESEME", "It's extremely unusual.");
    await moveElevator(0.35, 4);
    phase = "arrival";
  }

  async function arrivalScene(c) {
    state.cinematic = true;
    c.letterbox(true);
    // out onto the platform
    const out = [[1.5, 6], [-1.5, 6.5], [2.8, 4], [-2.8, 4.5]];
    riders.forEach((a, i) => {
      a.baseY = 0;
      moveTo(a, SHAFT.x + out[i][0], SHAFT.z + out[i][1], 1.6);
    });
    place(cast.amara, TERMINAL.x, 0, TERMINAL.z + 7, SHAFT.x, SHAFT.z);
    c.shot({ from: L(TERMINAL.x + 9, 3, TERMINAL.z + 14), look: L(TERMINAL.x, 1.5, TERMINAL.z + 1), dur: 6 });
    c.card("INT.", "NOLANTIS ARRIVAL TERMINAL", "");
    await c.caption("The elevator opens. Several people wait for them.", 2.2);
    await c.caption("Not soldiers. Civic Guardians, in simple uniforms.", 2.2);
    await c.caption("Their leader: Dr. Amara Veaux, 61. Scientist. Elected civic coordinator.", 2.6);
    c.shot({ from: L(TERMINAL.x - 2.5, 1.75, TERMINAL.z + 1), look: L(TERMINAL.x, 1.6, TERMINAL.z + 7), dur: 3 });
    await say(c, "AMARA", "Keseme Nadia.");
    await c.caption("Keseme freezes.", 1.4);
    await say(c, "KESEME", "You know me.");
    await say(c, "AMARA", "We've known about you for a long time.");
    c.shot({ from: L(TERMINAL.x + 5, 2, TERMINAL.z + 2), look: L(TERMINAL.x + 1, 1.5, TERMINAL.z + 4), dur: 3 });
    await c.caption("Mally slowly raises his hand.", 1.4);
    await say(c, "MALLY", "Do y'all know me?");
    await say(c, "AMARA", "Unfortunately.");
    await c.caption("Bubba laughs.", 1.2);
    await say(c, "MALLY", "Man, even Atlantis disrespect me.");
    c.shot({ from: L(TERMINAL.x - 4, 2.2, TERMINAL.z + 12), look: L(TERMINAL.x, 1.6, TERMINAL.z + 5), dur: 4 });
    await say(c, "AMARA", "What you discovered on the surface threatens more than politicians.");
    await c.caption("She looks toward the city.", 1.4);
    await say(c, "AMARA", "It threatens us.");
    await say(c, "KESEME", "What is this place?");
    await say(c, "AMARA", "The oldest secret in Dixie Beaux.");
    c.shot({ from: L(TERMINAL.x, 4, TERMINAL.z + 2), to: L(TERMINAL.x, 9, TERMINAL.z - 4), look: L(0, 8, 40), dur: 5 });
    await say(c, "AMARA", "Welcome to Nirbayou Nolantis.");
    await c.black(true, 0.4);
    // gameplay: stand the player on the platform, facing the city
    // out past the canopy, so the camera behind the player sees the city, not the shell roof
    const k = ctx.getPlayer();
    const at = W(TERMINAL.x, TERMINAL.z + 22);
    ctx.teleport(at.x, at.z, 0);
    k.baseY = 0;
    ctx.setCameraYaw(Math.PI);
    place(cast.amara, TERMINAL.x + 2, 0, TERMINAL.z + 24);
    place(cast.solange, TERMINAL.x - 2, 0, TERMINAL.z + 21);
    place(cast.mally, TERMINAL.x - 3.5, 0, TERMINAL.z + 23);
    place(cast.bubba, TERMINAL.x + 3.5, 0, TERMINAL.z + 20);
    c.letterbox(false);
    await c.black(false, 0.5);
    state.cinematic = false;
    phase = "tour";
    stop = 0;
    setTourObjective();
    ctx.flashObjective("Walk with Dr. Amara Veaux. See what the surface was never shown.");
  }

  const STOP_SCENES = {
    async housing(c) {
      await c.caption("Housing guaranteed to every resident.", 2.4);
      await say(c, "AMARA", "Every terrace is somebody's home. Nobody here earns the right to a roof.");
      await c.caption("No segregated neighborhoods. No billionaire districts. No abandoned districts.", 3);
      await say(c, "MALLY", "Rent?");
      await say(c, "AMARA", "Nobody has asked me that in thirty years.");
    },
    async clinic(c) {
      await c.caption("Universal healthcare.", 2);
      await c.caption("Hospitals resemble gardens instead of fortresses.", 2.4);
      await say(c, "BUBBA", "Where do they send the bill?");
      await say(c, "AMARA", "There isn't one.");
      await say(c, "BUBBA", "I'm gonna need to sit down.");
    },
    async kitchen(c) {
      await c.caption("Public kitchens. Automated agriculture.", 2.4);
      await c.caption("Machines perform dangerous industrial labor.", 2.2);
      await c.caption("Citizens work farms, laboratories, schools, workshops, sanitation facilities and community kitchens.", 3.4);
      await c.caption("Universities without tuition. Rehabilitation centers instead of conventional prisons. Community councils.", 3.6);
      await say(c, "SOLANGE", "I've spent two years proving the surface can't afford any of this.");
      await say(c, "AMARA", "It can. It chooses not to.");
    },
    async budget(c) {
      await c.caption("A digital board shows every government expenditure publicly.", 2.6);
      await c.caption("Keseme stops.", 1.2);
      await say(c, "KESEME", "Your entire budget is public?");
      await say(c, "AMARA", "Of course.");
      await say(c, "KESEME", "Including law enforcement?");
      await say(c, "AMARA", "Everything.");
      await say(c, "KESEME", "Surface governments would consider that an act of terrorism.");
      await c.caption("Amara smiles.", 1.2);
      await say(c, "AMARA", "That's one reason we're underground.");
    },
  };

  function setTourObjective() {
    if (phase === "tour") ctx.setObjective(`NIRBAYOU NOLANTIS ${stop + 1}/${STOPS.length}: walk with Amara to ${STOPS[stop].label}.`);
    else if (phase === "archive") ctx.setObjective("NIRBAYOU NOLANTIS: follow Amara into the archive.");
    else if (phase === "platform") ctx.setObjective("NIRBAYOU NOLANTIS: find Solange at the observation platform.");
    else if (phase === "done") ctx.setObjective(ctx.partC ? "We're leaving. Take the elevator up to the surface." : "Take the elevator back up to OrleaRouge when you're ready.");
  }

  async function truthScene(c) {
    state.cinematic = true;
    c.letterbox(true);
    await c.black(true, 0.5);
    const k = ctx.getPlayer();
    const A = ARCHIVE;
    const inside = W(A.x - 5, A.z - 6);
    ctx.teleport(inside.x, inside.z, 0);
    place(k, A.x - 5, 0, A.z - 5, A.x, A.z + 2);
    place(cast.amara, A.x + 5.5, 0, A.z - 2, A.x, A.z + 2);
    place(cast.solange, A.x - 7, 0, A.z + 1, A.x, A.z + 2);
    place(cast.mally, A.x - 2, 0, A.z + 9, A.x, A.z + 2);
    place(cast.bubba, A.x + 2.5, 0, A.z + 9.5, A.x, A.z + 2);
    holo.visible = false;
    crownLayer.visible = false;
    c.shot({ from: L(A.x, 11, A.z - 14), to: L(A.x, 9, A.z - 11), look: L(A.x, 2, A.z + 2), dur: 6 });
    await c.black(false, 0.6);
    c.card("INT.", "THE ARCHIVE", "The truth");
    await c.caption("They enter a vast archive.", 2);
    await c.caption("Amara activates a projection of Dixie Beaux.", 2);
    holo.visible = true;
    c.shot({ from: L(A.x + 8, 5, A.z - 4), look: L(A.x, 2.3, A.z + 2), dur: 4 });
    await say(c, "AMARA", "Nolantis did not become peaceful because human beings became perfect.");
    await c.caption("Historical conflicts. Political disputes. Economic crises.", 2.6);
    await say(c, "AMARA", "We became peaceful because we stopped designing systems that rewarded desperation.");
    await c.caption("Housing. Food. Medicine. Education.", 2.4);
    c.shot({ from: L(A.x - 8, 3, A.z - 2), look: L(A.x + 5.5, 1.6, A.z - 2), dur: 4 });
    await say(c, "AMARA", "People still argue. They still become jealous. They still lie. They still make mistakes.");
    c.shot({ from: L(A.x + 3, 2.2, A.z - 3), look: L(A.x - 5, 1.6, A.z - 5), dur: 4 });
    await say(c, "KESEME", "But nobody is starving.");
    await say(c, "AMARA", "Correct.");
    await say(c, "KESEME", "Nobody goes bankrupt because they're sick.");
    await say(c, "AMARA", "Correct.");
    await say(c, "KESEME", "Nobody becomes homeless because rent doubles.");
    await say(c, "AMARA", "Correct.");
    await c.caption("Keseme looks back toward the surface map.", 1.8);
    await say(c, "KESEME", "Then why hide?");
    c.shot({ from: L(A.x + 7, 3.2, A.z + 1), look: L(A.x + 5.5, 1.7, A.z - 2), dur: 3 });
    await c.caption("Amara's expression darkens.", 1.6);
    await say(c, "AMARA", "Because the surface knows we exist.");
    crownLayer.visible = true;
    // from the south side of the table looking down, so north is up and the labels read
    c.shot({ from: L(A.x, 12.5, A.z + 8), look: L(A.x, 2.3, A.z + 2), dur: 4 });
    await c.caption("The map changes. Pelican Crown Holdings appears.", 2.4);
    await say(c, "AMARA", "And certain people have spent generations making sure nobody else does.");
    c.shot({ from: L(A.x - 9, 2.2, A.z - 1), look: L(A.x - 5, 1.6, A.z - 5), dur: 4 });
    await c.caption("Solange understands.", 1.4);
    await say(c, "SOLANGE", "Because if people knew this worked—");
    await say(c, "KESEME", "They'd start asking why their government says it can't.");
    await c.caption("Amara nods.", 1.4);
    await c.card("ACT ONE", "THE TRUTH", "The surface is watching.", { center: true, hold: 2.6 });
    await c.black(true, 0.5);
    holo.visible = false;
    crownLayer.visible = false;
    const outside = W(A.door.x, A.door.z - 6);
    ctx.teleport(outside.x, outside.z, Math.PI);
    place(cast.amara, A.door.x + 2.5, 0, A.door.z - 8);
    place(cast.solange, A.door.x - 2.5, 0, A.door.z - 7);
    place(cast.mally, A.door.x - 4, 0, A.door.z - 10);
    place(cast.bubba, A.door.x + 4, 0, A.door.z - 10);
    ctx.setCameraYaw(0);
    c.letterbox(false);
    await c.black(false, 0.5);
    state.cinematic = false;
  }

  async function returnScene(c) {
    state.cinematic = true;
    await c.black(true, 0.6);
    for (const a of Object.values(cast)) a.visible = false;
    for (const e of extras) e.a.visible = false;
    const r = ctx.returnTo;
    ctx.teleport(r.x, r.z, r.heading || 0);
    ctx.setCameraYaw(r.heading ? r.heading + Math.PI : 0);
    ctx.setPopulation(true);
    ctx.setObjective(null);
    root.visible = false;
    await c.black(false, 0.6);
    state.cinematic = false;
    ctx.flashObjective("Back up in OrleaRouge. Nobody down there will believe the surface. Nobody up here will believe you.");
    phase = "left";
    if (ctx.startNext) ctx.startNext();
  }

  // ---------------------------------------------------------------- Part C (with welcomeback.js)
  const LOOK_ANG = Math.atan2(OVERLOOK.face.x - OVERLOOK.x, OVERLOOK.face.z - OVERLOOK.z);
  /** Local x/z at `f` m toward the city and `r` m to the right of the observation platform. */
  function atDeck(f, r) {
    const fx = Math.sin(LOOK_ANG), fz = Math.cos(LOOK_ANG);
    return [OVERLOOK.x + fx * f + fz * r, OVERLOOK.z + fz * f - fx * r];
  }
  const deckL = (f, r, y) => { const [x, z] = atDeck(f, r); return L(x, y, z); };
  const faceTo = (a, lx, lz) => { a._yaw = Math.atan2(NOLANTIS.x + lx - a.position.x, NOLANTIS.z + lz - a.position.z); };

  async function platformScene(c) {
    state.cinematic = true;
    c.letterbox(true);
    await c.black(true, 0.4);
    const k = ctx.getPlayer();
    const [kx, kz] = atDeck(3.2, 0);
    const kw = W(kx, kz);
    ctx.teleport(kw.x, kw.z, 0);
    place(k, kx, 0, kz, OVERLOOK.face.x, OVERLOOK.face.z);
    const [sx, sz] = atDeck(-4, 3.5);
    place(cast.solange, sx, 0, sz, kx, kz);
    const [ax, az] = atDeck(-14, -10);
    place(cast.amara, ax, 0, az, kx, kz);
    cast.mally.visible = cast.bubba.visible = false;
    c.shot({ from: deckL(0.4, 0.6, 3.4), to: deckL(1, 0.4, 3), look: L(OVERLOOK.face.x, 10, OVERLOOK.face.z), dur: 7 });
    await c.black(false, 0.6);
    c.card("NOLANTIS —", "OBSERVATION PLATFORM", "");
    await c.caption("Keseme stands overlooking the glowing underwater city.", 2.6);
    const [jx, jz] = atDeck(3.2, 1.2);
    moveTo(cast.solange, jx, jz, 1.6);
    await c.caption("Solange joins her.", 1.8);
    faceTo(cast.solange, OVERLOOK.face.x, OVERLOOK.face.z);
    c.shot({ from: deckL(3.4, -3.2, 1.7), look: deckL(3.2, 0.6, 1.55), dur: 8 });
    await say(c, "SOLANGE", "Beautiful, isn't it?");
    await say(c, "KESEME", "Suspiciously.");
    await say(c, "SOLANGE", "You don't trust paradise?");
    await say(c, "KESEME", "I don't trust anything describing itself as paradise.");
    await c.caption("Solange smiles.", 1.2);
    await say(c, "SOLANGE", "Good answer.");
    faceTo(k, jx, jz);
    faceTo(cast.solange, kx, kz);
    c.shot({ from: deckL(3.0, 1.9, 1.72), look: deckL(3.2, 0, 1.62), dur: 4 });
    await c.caption("Their eyes meet.", 1.4);
    await c.caption("There's chemistry.", 1.4);
    faceTo(k, OVERLOOK.face.x, OVERLOOK.face.z);
    await c.caption("Keseme notices and immediately looks toward the city.", 2.2);
    c.shot({ from: deckL(3.4, -3.2, 1.7), look: deckL(3.2, 0.6, 1.55), dur: 6 });
    await say(c, "SOLANGE", "You're blushing.");
    await say(c, "KESEME", "The room is warm.");
    await say(c, "SOLANGE", "It's sixty-nine degrees.");
    await say(c, "KESEME", "Unusually warm.");
    await c.caption("Solange laughs.", 1.2);
    faceTo(cast.solange, OVERLOOK.face.x, OVERLOOK.face.z);
    c.shot({ from: deckL(6.4, 0.6, 1.8), look: deckL(3.2, 0.6, 1.55), dur: 14 });
    await c.caption("Then Keseme becomes serious.", 1.6);
    await say(c, "KESEME", "Something bothers me.");
    await say(c, "SOLANGE", "Only one thing?");
    await say(c, "KESEME", "Nolantis has medicine. Technology. Energy. Food production.");
    await say(c, "KESEME", "Enough resources to change millions of lives.");
    await say(c, "SOLANGE", "Yeah.");
    await say(c, "KESEME", "And they stayed hidden.");
    await c.caption("Silence.", 1.4);
    await say(c, "KESEME", "Maybe the surface isn't the only place with something to answer for.");
    c.shot({ from: deckL(2.4, 1.8, 1.8), look: deckL(-14, -10, 1.6), dur: 6 });
    await c.caption("Amara watches them from a distance.", 1.8);
    await c.caption("Her expression suggests Keseme has asked exactly the question she feared someone eventually would.", 3.6);
    await c.black(true, 0.5);
  }

  async function phoneScene(c) {
    state.cinematic = true;
    c.letterbox(true);
    await c.black(true, 0.01);
    const k = ctx.getPlayer();
    const [kx, kz] = atDeck(3.2, 0);
    const kw = W(kx, kz);
    ctx.teleport(kw.x, kw.z, 0);
    place(k, kx, 0, kz, OVERLOOK.face.x, OVERLOOK.face.z);
    const [sx, sz] = atDeck(3.2, 1.2);
    place(cast.solange, sx, 0, sz, OVERLOOK.face.x, OVERLOOK.face.z);
    const [ax, az] = atDeck(-14, -10);
    place(cast.amara, ax, 0, az, kx, kz);
    c.shot({ from: deckL(3.9, -1.6, 1.75), look: deckL(3.2, 0, 1.55), dur: 5 });
    await c.black(false, 0.5);
    c.sfx("ring", 0.8);
    await c.caption("PHONE RINGS", 1.4);
    await c.caption("Keseme checks her phone.", 1.6);
    await c.card("INCOMING CALL", "UNKNOWN NUMBER", "", { hold: 1.6 });
    await c.caption("She answers.", 1.2);
    await say(c, "KESEME", "Hello?");
    await c.caption("A distorted voice responds.", 1.6);
    await say(c, "VOICE", "You should have given Sheriff Mercer the book.");
    faceTo(k, kx - Math.sin(LOOK_ANG), kz - Math.cos(LOOK_ANG));
    c.shot({ from: deckL(1.8, 0, 1.7), look: deckL(3.2, 0, 1.62), dur: 9 });
    await c.caption("Keseme's expression hardens.", 1.6);
    await say(c, "KESEME", "Who is this?");
    await say(c, "VOICE", "Go back to Tusouxroe.");
    await c.caption("Keseme says nothing.", 1.6);
    await say(c, "VOICE", "Your mother's house is very pretty.");
    await c.caption("Keseme's face changes instantly.", 1.8);
    await c.caption("The call ends.", 1.4);
    c.shot({ from: deckL(3.4, -3.2, 1.7), look: deckL(3.2, 0.6, 1.55), dur: 2 });
    await say(c, "SOLANGE", "Keseme?");
    // she heads back for the elevator; Amara cuts across to stop her
    const walk = [kx + (TERMINAL.x - kx) * 0.35, kz + (TERMINAL.z + 10 - kz) * 0.35];
    faceTo(k, walk[0], walk[1]);
    await c.caption("Keseme turns toward the elevator.", 1.6);
    await say(c, "KESEME", "We're leaving.");
    c.shot({ from: L(kx - 9, 4, kz + 5), look: L((kx + walk[0]) / 2, 1.2, (kz + walk[1]) / 2), dur: 8 });
    moveTo(k, walk[0], walk[1], 1.7);
    moveTo(cast.amara, walk[0] - 3, walk[1] + 1.5, 2.4);
    await say(c, "AMARA", "Going to the surface now would be extremely dangerous.");
    await c.caption("Keseme keeps walking.", 1.4);
    await say(c, "AMARA", "Keseme!");
    place(k, walk[0], 0, walk[1]);
    place(cast.amara, walk[0] - 3, 0, walk[1] + 1.5);
    await c.caption("She stops.", 1.2);
    c.shot({ from: L(walk[0] + 2.2, 1.75, walk[1] + 2), look: L(walk[0], 1.6, walk[1]), dur: 8 });
    await say(c, "KESEME", "Someone threatened my mother.");
    await say(c, "AMARA", "We can protect your family.");
    faceTo(k, walk[0] - 3, walk[1] + 1.5);
    await c.caption("Keseme turns.", 1.2);
    await say(c, "KESEME", "No.");
    await c.wait(0.9);
    await say(c, "KESEME", "I'm going to protect my family.");
    await c.black(true, 0.5);
    await c.card("MISSION UNLOCKED", "WELCOME BACK TO DIXIE",
      "New regions available: Chatboro · Tusouxroe · OrleaRouge  —  Nirbayou Nolantis: restricted", { center: true, hold: 3.6 });
    // gameplay: Keseme where she stopped, the gang waiting by the elevator
    const w = W(walk[0], walk[1]);
    ctx.teleport(w.x, w.z, 0);
    k.baseY = 0;
    place(cast.solange, TERMINAL.x - 2, 0, TERMINAL.z + 8, SHAFT.x, SHAFT.z);
    place(cast.mally, TERMINAL.x + 2.5, 0, TERMINAL.z + 9, SHAFT.x, SHAFT.z);
    place(cast.bubba, TERMINAL.x + 4, 0, TERMINAL.z + 7, SHAFT.x, SHAFT.z);
    place(cast.amara, walk[0] - 3, 0, walk[1] + 1.5, walk[0], walk[1]);
    ctx.setCameraYaw(0);
    c.letterbox(false);
    await c.black(false, 0.5);
    state.cinematic = false;
    ctx.flashObjective("MISSION UNLOCKED · WELCOME BACK TO DIXIE");
  }

  async function finalScene(c) {
    state.cinematic = true;
    c.letterbox(true);
    await c.black(true, 0.5);
    ctx.exitVehicle();
    const k = ctx.getPlayer();
    const shaftW = W(SHAFT.x, SHAFT.z);
    ctx.teleport(shaftW.x, shaftW.z, 0);
    elev.y = 0.35;
    elevator.position.y = 0.35;
    riders = [k, cast.solange, cast.mally, cast.bubba];
    [[1.3, 1.1], [-1.4, 1.2], [1.4, -1.3], [-1.2, -1.4]].forEach(([dx, dz], i) => {
      place(riders[i], SHAFT.x + dx, 0.7, SHAFT.z + dz, SHAFT.x, SHAFT.z - 10);
    });
    place(cast.amara, TERMINAL.x + 3, 0, TERMINAL.z + 9, SHAFT.x, SHAFT.z);
    c.shot({ from: L(SHAFT.x + 3, 2.4, SHAFT.z + 10), look: atCar(0, 1.4, 0), dur: 4 });
    await c.black(false, 0.6);
    c.card("INT.", "THE ELEVATOR", "Going up");
    await c.caption("Keseme enters the elevator with Mally, Bubba and Solange.", 2.6);
    c.shot({ from: atCar(2.9, 1.8, -3.2), look: atCar(1.4, 1.3, -1.3), dur: 2 });
    await c.caption("Mally checks a pistol.", 1.6);
    c.shot({ from: atCar(-3.1, 1.8, -3), look: atCar(-1.2, 1.2, -1.4), dur: 2 });
    await c.caption("Bubba loads equipment.", 1.6);
    c.shot({ from: atCar(-3.2, 1.9, 3), look: atCar(-1.4, 1.5, 1.2), dur: 2 });
    await c.caption("Solange activates a camera.", 1.6);
    // up through the rock, into the glass band
    c.shot({ from: L(SHAFT.x + 26, 10, SHAFT.z + 34), look: atCar(0, 1, 0), lookTo: L(SHAFT.x, CEIL + 4, SHAFT.z), dur: 9 });
    const rise = moveElevator(CEIL + 24, 9);
    await c.caption("Keseme watches the surface grow closer.", 2.4);
    await rise;
    c.shot({ from: atCar(3.4, 2.4, 3.4), look: atCar(0, 1.4, 0), dur: 12 });
    await say(c, "MALLY", "So what's the plan?");
    await say(c, "KESEME", "Find out who threatened my mother.");
    await say(c, "BUBBA", "Then?");
    await say(c, "KESEME", "Find out who owns Pelican Crown.");
    await say(c, "SOLANGE", "Then?");
    await c.caption("Keseme thinks.", 1.4);
    c.shot({ from: L(SHAFT.x + 6, CEIL + 20, SHAFT.z + 6), look: atCar(0, 1, 0), lookTo: L(SHAFT.x, TOP_Y, SHAFT.z), dur: 7 });
    const top = moveElevator(TOP_Y - 1, 7);
    await c.caption("The elevator continues rising.", 2);
    await top;
    c.shot({ from: atCar(1.2, 1.7, 2.4), look: atCar(-1.4, 1.5, -1.2), dur: 8 });
    await say(c, "KESEME", "Then we find out how many people they're hurting.");
    await say(c, "MALLY", "And after that?");
    await c.black(true, 0.4);

    // the doors open on OrleaRouge (welcomeback.js plays the surface)
    for (const e of extras) e.a.visible = false;
    cast.amara.visible = false;
    root.visible = false;
    const r = ctx.returnTo;
    ctx.teleport(r.x, r.z, r.heading || 0);
    ctx.setCameraYaw(r.heading ? r.heading + Math.PI : 0);
    ctx.setPopulation(true);
    ctx.setObjective(null);
    phase = "left";
    for (const a of riders) a.baseY = 0;
    await ctx.partC.surfaceScene(c, { keseme: k, crew: [cast.solange, cast.mally, cast.bubba] });
    k.visible = true;
    c.letterbox(false);
    await c.black(false, 0.8);
    state.cinematic = false;
    ctx.flashObjective("ACT ONE BEGINS · Someone threatened Mama. Tusouxroe is north up US-167.");
    if (ctx.startNext) ctx.startNext();
  }

  let riders = [];

  // ---------------------------------------------------------------- API
  const api = {
    buildSet,
    NOLANTIS,
    get props() { return props; },
    get phase() { return phase; },
    get stop() { return stop; },
    /** True while the player is in the cavern: main.js lifts the map clamp and hides the radar. */
    get inside() {
      const p = ctx.playerPos;
      return phase !== "idle" && phase !== "left" && Math.hypot(p.x - NOLANTIS.x, p.z - NOLANTIS.z) < R + 12;
    },
    /** Where the player should go next ({x, z}), or null. */
    get waypoint() {
      if (phase === "tour") return W(STOPS[stop].x, STOPS[stop].z);
      if (phase === "archive") return W(ARCHIVE.door.x, ARCHIVE.door.z);
      if (phase === "platform") return W(OVERLOOK.x, OVERLOOK.z);
      if (phase === "done") return W(TERMINAL.x, TERMINAL.z + 4);
      return null;
    },

    /** Called when Blue Light Special's flood tunnel door opens. */
    start() {
      if (phase !== "idle") return;
      populate();
      phase = "descent";
      dialogue(descentScene).then(() => dialogue(arrivalScene));
    },

    /** QA hooks for tools/qa/nolantis.mjs: "stop" | "archive" | "overlook" | "elevator". */
    debug(step) {
      const go = (p) => ctx.teleport(p.x, p.z, 0);
      if (step === "overlook" && phase === "platform") go(W(OVERLOOK.x, OVERLOOK.z));
      if (step === "stop" && phase === "tour") go(W(STOPS[stop].x, STOPS[stop].z));
      if (step === "archive" && phase === "archive") go(W(ARCHIVE.door.x, ARCHIVE.door.z));
      if (step === "elevator" && phase === "done") go(W(TERMINAL.x, TERMINAL.z + 4));
      return { phase, stop };
    },

    update(dt) {
      if (phase === "idle") return;
      const cam = ctx.camera.position;
      visTimer -= dt;
      if (visTimer <= 0) {
        visTimer = 0.4;
        root.visible = phase !== "left" && Math.hypot(cam.x - NOLANTIS.x, cam.z - NOLANTIS.z) < 340;
      }
      if (!root.visible) return;
      const t = performance.now() / 1000;

      // the elevator
      if (elev.resolve || elev.t < elev.dur) {
        elev.t = cine.skipping ? elev.dur : elev.t + dt;
        const k = Math.min(1, elev.t / elev.dur), e = k * k * (3 - 2 * k);
        elev.y = elev.from + (elev.to - elev.from) * e;
        elevator.position.y = elev.y;
        if (phase === "descent" || phase === "returning") for (const a of riders) a.baseY = elev.y + 0.35;
        if (k >= 1 && elev.resolve) { const r = elev.resolve; elev.resolve = null; r(); }
      }

      for (let i = movers.length - 1; i >= 0; i--) {
        const m = movers[i], p = m.obj.position;
        const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz), step = m.speed * dt;
        if (cine.skipping || d <= step) {
          p.x = m.x; p.z = m.z;
          m.obj.play("idle");
          movers.splice(i, 1);
          m.resolve();
          continue;
        }
        p.x += (dx / d) * step; p.z += (dz / d) * step;
        m.obj.play("walk");
      }

      for (const fn of animated) fn(dt, t);
      if (board) {
        board.t += dt;
        if (board.t > 0.6) { board.t = 0; board.tick++; drawBoard(); }
      }

      // citizens walk their loops, children chase each other round the fountain
      for (const e of extras) {
        if (!e.a.visible) continue;
        if (e.walk && !movers.some((m) => m.obj === e.a)) {
          e.node = (e.node + 1 + ((e.node * 7) % 3)) % e.walk.length;
          moveTo(e.a, e.walk[e.node][0], e.walk[e.node][1], e.pace);
        } else if (e.orbit) {
          const a = t * e.orbit.s + e.orbit.phase;
          const p = W(Math.cos(a) * e.orbit.r, 12 + Math.sin(a) * e.orbit.r);
          e.a.position.x = p.x; e.a.position.z = p.z;
          e.a.play("walk");
        }
        e.a.update(dt);
      }
      for (const a of Object.values(cast)) if (a.visible) a.update(dt);
      if (state.cinematic) {
        const p = ctx.getPlayer();
        if (p && !state.veh) p.update(dt, ctx.camera);
      }

      if (phase === "arrival" && !state.cinematic && !cine.active) phase = "arrival";   // arrivalScene is already queued
      if (state.cinematic || cine.active) return;
      const pp = ctx.playerPos;
      const near = (lx, lz, r) => Math.hypot(pp.x - (NOLANTIS.x + lx), pp.z - (NOLANTIS.z + lz)) < r;

      if (phase === "tour") {
        // the gang tags along
        const follow = [[cast.solange, -2.5, -2], [cast.mally, 2.5, -2.5], [cast.bubba, 0, -4]];
        for (const [a, ox, oz] of follow) {
          const tx = pp.x - NOLANTIS.x + ox, tz = pp.z - NOLANTIS.z + oz;
          if (Math.hypot(a.position.x - (NOLANTIS.x + tx), a.position.z - (NOLANTIS.z + tz)) > 6 && !movers.some((m) => m.obj === a)) moveTo(a, tx, tz, 4.5);
        }
        const s = STOPS[stop];
        if (!movers.some((m) => m.obj === cast.amara) && Math.hypot(cast.amara.position.x - (NOLANTIS.x + s.x + 3), cast.amara.position.z - (NOLANTIS.z + s.z + 2)) > 2) {
          moveTo(cast.amara, s.x + 3, s.z + 2, 3.2);
        }
        if (near(s.x, s.z, s.r)) {
          const id = s.id;
          stop++;
          if (stop >= STOPS.length) phase = "archive";
          setTourObjective();
          dialogue(STOP_SCENES[id]).then(() => { if (phase === "archive") moveTo(cast.amara, ARCHIVE.door.x + 2, ARCHIVE.door.z - 3, 3.2); });
        }
      } else if (phase === "archive") {
        if (near(ARCHIVE.door.x, ARCHIVE.door.z, 6)) {
          phase = "truth";
          ctx.setObjective(null);
          dialogue(truthScene).then(() => {
            if (!ctx.partC) { phase = "done"; setTourObjective(); ctx.flashObjective("The elevator will take you back to the surface."); return; }
            // Part C: CUT TO the Sheriff's Office, then Solange waits at the observation platform
            phase = "office";
            dialogue((c) => ctx.partC.officeScene(c)).then(() => {
              phase = "platform";
              setTourObjective();
              ctx.flashObjective("Solange slipped away to the observation platform.");
            });
          });
        }
      } else if (phase === "platform") {
        if (near(OVERLOOK.x, OVERLOOK.z, 5)) {
          phase = "overlook";
          ctx.setObjective(null);
          dialogue(platformScene)
            .then(() => dialogue((c) => ctx.partC.montageScene(c, { keseme: ctx.getPlayer() })))
            .then(() => dialogue(phoneScene))
            .then(() => { phase = "done"; setTourObjective(); });
        }
      } else if (phase === "done") {
        if (near(TERMINAL.x, TERMINAL.z + 4, 5)) {
          phase = "returning";
          dialogue(ctx.partC ? finalScene : returnScene);
        }
      }
    },
  };
  return api;
}
