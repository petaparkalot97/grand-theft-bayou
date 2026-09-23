// ---------------------------------------------------------------------------
// interiors.js — the venue-agnostic interior kit.
//
// tusouxroeNorth.js's Crown Strip builds four large walk-in venues. Their shells,
// forecourts and cutaway belong to that district; the *furniture* does not — a
// slot bank, a bar back, a disco ball or a dressing table is the same builder
// wherever it stands. This module is that furniture, so a venue is a data list in
// the district and a piece of furniture is one function here.
//
// Design rules, all learned the hard way on this codebase:
//
//   * Import only three. A builder takes its geometry and material caches through
//     `b`, so nothing here knows about a scene, a district, or a colour palette.
//   * Reuse geometry and materials aggressively (PSX-era density, not polygon
//     count). `b.G.*` is a memoised geometry cache and `b.m/b.e/b.gl` are
//     memoised materials, so twenty slot machines are one BatchGeometry and one
//     material, not twenty of each.
//   * Anything repeated more than about four times is an InstancedMesh through
//     `instanced()`. merge.js skips instanced meshes, so they survive the batch
//     sweep as one draw call each and keep their own bounding sphere for culling.
//   * Collision goes through `b.block` — the district's existing `addBlocker`,
//     which is the same spatial grid every walker and car already uses. Only
//     large furniture gets it. A chip, a bottle or a neon tube does not.
//   * Walkable lanes matter more than filling the floor. Each fixture is placed
//     to leave a lane; `tools/qa/crown_build_test.mjs` flood-fills the blockers
//     and asserts every interaction point is actually reachable from the door.
// ---------------------------------------------------------------------------

import * as THREE from "three";

// One scratch set for every instance matrix, never allocated per placement.
// Names are suffixed `_one` because this module and merge.js are both loaded as
// top-level scripts in the QA sandbox, where two module-scope `_m`s would clash.
const _mOne = new THREE.Matrix4();
const _qOne = new THREE.Quaternion();
const _vOne = new THREE.Vector3();
const _sOne = new THREE.Vector3();
const _eOne = new THREE.Euler();

/**
 * Place `list` copies of one geometry/material as a single InstancedMesh.
 *
 * @param {THREE.Object3D} parent
 * @param {THREE.BufferGeometry} geo
 * @param {THREE.Material} mat
 * @param {Array<{x,y,z,ry?,rx?,rz?,s?}>} list
 */
export function instanced(parent, geo, mat, list, { cast = false, receive = true } = {}) {
  if (!list.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((t, i) => {
    _vOne.set(t.x, t.y, t.z);
    _eOne.set(t.rx || 0, t.ry || 0, t.rz || 0);
    _qOne.setFromEuler(_eOne);
    const sc = t.s ?? 1;
    _sOne.set(sc, sc, sc);
    mesh.setMatrixAt(i, _mOne.compose(_vOne, _qOne, _sOne));
  });
  if (mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
  if (typeof mesh.computeBoundingSphere === "function") mesh.computeBoundingSphere();
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  parent.add(mesh);
  return mesh;
}

/**
 * A memoised geometry cache. Every shape is created once per dimension and shared
 * by every mesh that wants it — the difference between four slots banks and four
 * thousand geometry objects.
 *
 * `wall(w, h, d)` is a box whose pivot is at its own base, so `mesh.scale.y`
 * shrinks it down from the floor: that is what lets the district's cutaway drop a
 * venue's outer walls (nightlife.js's trick).
 */
export function makeGeoCache() {
  const cache = new Map();
  const keyed = (key, make) => {
    let g = cache.get(key);
    if (!g) cache.set(key, (g = make()));
    return g;
  };
  return {
    box: (w, h, d) => keyed(`b|${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d)),
    cyl: (r, h, seg = 10) => keyed(`c|${r}|${h}|${seg}`, () => new THREE.CylinderGeometry(r, r, h, seg)),
    cone: (r, h) => keyed(`k|${r}|${h}`, () => new THREE.ConeGeometry(r, h, 12)),
    sph: (r) => keyed(`s|${r}`, () => new THREE.SphereGeometry(r, 12, 8)),
    plane: (w, d) => keyed(`p|${w}|${d}`, () => new THREE.PlaneGeometry(w, d)),
    torus: (r, t) => keyed(`t|${r}|${t}`, () => new THREE.TorusGeometry(r, t, 8, 24)),
    ring: (r0, r1) => keyed(`r|${r0}|${r1}`, () => new THREE.RingGeometry(r0, r1, 28)),
    wall: (w, h, d) => keyed(`w|${w}|${h}|${d}`, () => {
      const g = new THREE.BoxGeometry(w, h, d);
      g.translate(0, h / 2, 0);
      return g;
    }),
  };
}

/**
 * A memoised material cache: the shared venue pieces, plus per-name factories.
 * `of`/`emis`/`glow` key on name + colour + options, so two venues that happen to
 * share a colour share a material and merge into one batch.
 */
export function makeKit() {
  const memo = new Map();
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
  const of = (name, color, extra = {}) => {
    const key = `${name}|${color}|${JSON.stringify(extra)}`;
    let m = memo.get(key);
    if (!m) memo.set(key, (m = std(name, color, extra)));
    return m;
  };
  const emis = (name, color, intensity = 1.1) =>
    of(name, color, { emissive: color, emissiveIntensity: intensity, roughness: 0.45 });
  const glow = (name, color) => {
    const key = `flat|${name}|${color}`;
    let m = memo.get(key);
    if (!m) memo.set(key, (m = flat(name, color)));
    return m;
  };
  return {
    std, flat, of, emis, glow,
    chrome: std("kit chrome", 0xe8e8ee, { metalness: 1, roughness: 0.12 }),
    gold: std("kit gold", 0xd4af37, { metalness: 0.85, roughness: 0.28 }),
    steel: std("kit steel", 0x3a3d40, { metalness: 0.6, roughness: 0.45 }),
    dark: std("kit dark", 0x141414, { roughness: 0.95 }),
    wood: std("kit wood", 0x3a2418, { roughness: 0.8 }),
    velvet: std("kit velvet", 0x8a0f3c, { roughness: 0.9 }),
  };
}

// ---------------------------------------------------------------------------
// The fixtures. Each is `(b, spec)` — `spec` is the venue's layout entry, and `b`
// is the builder context the district hands over (see the INTERFACE note in
// AGENT_LOG.md):
//
//   b.v              the venue definition (name, theme, interior, ...)
//   b.g, b.W/b.D/b.H, b.FZ     the group and the hall's dimensions in metres
//   b.G, b.M         the shared geometry and material caches
//   b.add(geo, mat, x, y, z, opt)      one mesh in the venue group
//   b.inst(geo, mat, list, opt)        one InstancedMesh
//   b.m/b.e/b.gl(name, color, ...)     memoised materials, scoped to the venue
//   b.sign(text, ink, { x, y, z, w, h, ry, vertical })   a neon name face
//   b.block(lx, lz, r)                 collision, in local hall space
//   b.lit(lx, y, lz, power, range)     a pooled light spot, in local hall space
//   b.free(lx, lz, r)                  is this clear of everything built so far?
//                                      Blocks are registered as fixtures run, so
//                                      ask for a spot *after* the furniture that
//                                      might own it (a column, a speaker).
//   b.spot(lx, lz, { role, face, y, anim, beat, r, hype, name, bounds })
//                                      a person stands here (crowd.js). A
//                                      fixture proposes people the same way it
//                                      places furniture, so a bar that moves
//                                      takes its barman with it. `role` pins a
//                                      staff part; leave it off for a punter
//                                      drawn from the strip's own door mix.
//                                      `face` is a local yaw (models face +z).
//                                      `anim` overrides the role's pose for this
//                                      spot, `hype` marks somebody who is watching
//                                      a stage act, `name` names a performer, and
//                                      `bounds` is the rectangle a scripted actor
//                                      (the `star` role) may not leave.
// ---------------------------------------------------------------------------

const chipColors = [0xff4f6d, 0xffd23a, 0xf4f1ea];

export const FIXTURES = {
  /** A very large white performance glove for interior use. */
  propGlove(b, s) {
    const white = b.m("glove white", 0xf4f7ff, { roughness: 0.22, metalness: 0.12, emissive: 0xffffff, emissiveIntensity: 0.35 });
    const seam = b.m("glove sequin", 0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.9 });
    const gg = new THREE.Group();
    gg.position.set(s.x || 0, s.y || 4.0, s.z || 0);
    gg.rotation.set(0, s.ry || 0, 0.16);
    if (s.scale) gg.scale.setScalar(s.scale);
    b.g.add(gg);
    const put = (geo, mat, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.castShadow = true;
      gg.add(m);
      return m;
    };
    put(b.G.box(5.2, 5.6, 2.3), white, 0, 0, 0);                       // palm
    [-1.75, -0.6, 0.55, 1.7].forEach((x, i) =>                          // four fingers
      put(b.G.box(1.15, 3.5 - i * 0.35, 2.0), white, x, 4.3 - i * 0.18, 0.1, -0.12 - i * 0.02));
    put(b.G.box(1.3, 3.1, 1.9), white, -3.2, 1.5, 0.1, 0.55);           // thumb
    put(b.G.box(5.6, 1.5, 2.7), b.m("glove cuff", 0x1a1a1a), 0, -3.5, 0);
    put(b.G.box(5.9, 0.4, 3.0), b.m("glove gold", b.v.theme.trim, { metalness: 0.9, roughness: 0.2 }), 0, -2.7, 0);
    const sequins = [];
    for (let ix = -2; ix <= 2; ix++) for (let iy = -2; iy <= 1; iy++) sequins.push({ x: ix, y: iy * 0.9 + 0.2, z: 1.25 });
    instanced(gg, b.G.sph(0.16), seam, sequins);
    b.lit(s.x || 0, s.y || 4.0, s.z || 0, 95, 26);
  },

  /** A pig's head for interior use. */
  propPig(b, s) {
    const pink = b.m("pig pink", 0xff8fb0, { roughness: 0.5, emissive: 0xff4f7a, emissiveIntensity: 0.3 });
    const dark = b.m("pig dark", 0x5a2030);
    const pg = new THREE.Group();
    pg.position.set(s.x || 0, s.y || 4.0, s.z || 0);
    pg.rotation.set(0, s.ry || 0, 0);
    if (s.scale) pg.scale.setScalar(s.scale);
    b.g.add(pg);
    const put = (geo, mat, x, y, z, rx = 0, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      m.castShadow = true;
      pg.add(m);
      return m;
    };
    put(b.G.sph(3.4), pink, 0, 0, 0);
    put(b.G.cyl(1.7, 1.4), pink, 0, -0.7, 3.1, Math.PI / 2);
    for (const sx of [-1, 1]) {
      put(b.G.box(0.6, 0.6, 0.2), dark, sx * 0.7, 0.4, 3.3);           // eyes
      put(b.G.box(0.5, 0.8, 0.2), dark, sx * 0.5, -0.5, 3.8);          // snout
      put(b.G.box(2.2, 3.1, 0.4), pink, sx * 2.8, 2.5, 0.4, 0, sx * 0.4); // ears
    }
    put(b.G.box(4.2, 1.2, 0.6), b.m("pig tie 1", 0x1a1a1a), 0, -3.7, 1.9, 0.2); // tie
    put(b.G.box(0.8, 1.4, 0.8), b.m("pig tie 2", 0x1a1a1a), 0, -3.7, 2.0, 0.2);
    put(b.G.torus(3.9, 0.2), b.e("pig halo", b.v.theme.accent, 1.1), 0, 0, -0.6);
    b.lit(s.x || 0, s.y || 4.0, s.z || 0, 85, 24);
  },

  /** The way in: a carpet runner, its brass edges, four bell posts — and light. */
  runner(b, s) {
    const w = s.w ?? 9, d = s.d ?? 12;
    b.lit(s.x, 3.2, s.z, 40, 13);
    const rx = s.rx ?? w / 2;
    const ry = s.ry ?? d / 2;
    b.add(b.G.box(w, 0.04, d), b.e("runner", b.v.theme.accent, 0.1), s.x, 0.13, s.z);
    for (const sz of [-1, 1]) b.add(b.G.box(w + 0.5, 0.06, 0.35), b.m("runner edge", b.v.theme.trim, { metalness: 0.7 }), s.x, 0.15, s.z + sz * (d / 2));
    for (const sx of [-1, 1]) b.add(b.G.box(0.35, 0.06, d + 0.5), b.m("runner edge", b.v.theme.trim, { metalness: 0.7 }), s.x + sx * (w / 2), 0.15, s.z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.add(b.G.cyl(0.1, 1.25), b.M.chrome, s.x + sx * (rx + 0.5), 0.62, s.z + sz * (ry + 0.5));
    }
  },

  /** A bank of slot machines: cabinets, lit screens, toppers and stools. */
  slotBank(b, s) {
    const n = s.n ?? 8, pitch = s.pitch ?? 2.1, rot = s.rot ? 1 : 0;
    const body = [], screen = [], topper = [], stool = [];
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * pitch;
      const x = rot ? s.x : s.x + o, z = rot ? s.z + o : s.z;
      body.push({ x, y: 0.9, z, ry: rot ? Math.PI / 2 : 0 });
      screen.push({ x: rot ? x + 0.42 : x, y: 1.34, z: rot ? z : z + 0.42, ry: rot ? Math.PI / 2 : 0 });
      topper.push({ x, y: 1.92, z, ry: rot ? Math.PI / 2 : 0 });
      stool.push({ x: rot ? x + 1.05 : x, y: 0.28, z: rot ? z : z + 1.05 });
    }
    b.inst(b.G.box(1.0, 1.6, 0.75), b.m("slot body", b.v.theme.interior), body, { cast: true });
    b.inst(b.G.box(0.66, 0.44, 0.1), b.e("slot screen", b.v.theme.accent, 1.0), screen);
    b.inst(b.G.box(0.9, 0.22, 0.5), b.e("slot topper", b.v.theme.accent, 1.3), topper);
    b.inst(b.G.cyl(0.26, 0.5), b.m("stool seat", b.v.theme.trim, { metalness: 0.5 }), stool);
    b.lit(rot ? s.x + 2.6 : s.x, 3.0, rot ? s.z : s.z + 2.6, 48, 15);
    b.station(rot ? s.x + 1.4 : s.x, rot ? s.z : s.z + 1.4, "slots", "Slots — $10 a spin");
    // a punter on every other stool, facing the machine: nobody plays a bank of
    // eight alone, and crowd.js spreads whichever of these it casts
    for (let i = 0; i < n; i += 2) {
      const o = (i - (n - 1) / 2) * pitch;
      if (rot) b.spot(s.x + 1.05, s.z + o, { face: -Math.PI / 2 });
      else b.spot(s.x + o, s.z + 1.05, { face: Math.PI });
    }
    // a solid bank, so nobody can wedge in behind the machines
    const span = n * pitch;
    const rows = Math.max(1, Math.round(span / 2.0));
    for (let i = 0; i <= rows; i++) {
      const o = (i - rows / 2) * 2.0;
      b.block(rot ? s.x : s.x + o, rot ? s.z + o : s.z, 0.8);
    }
  },

  /** A roulette pit: felt table, gold rim, the wheel and a scatter of chips. */
  roulette(b, s) {
    b.add(b.G.cyl(2.0, 0.9), b.m("pit base", b.v.theme.interior, { roughness: 0.65 }), s.x, 0.45, s.z, { cast: true });
    b.add(b.G.cyl(2.1, 0.12), b.m("pit felt", b.v.theme.felt, { roughness: 0.5 }), s.x, 0.96, s.z);
    b.add(b.G.torus(1.25, 0.14), b.m("pit rim", 0xd4af37, { metalness: 0.9, roughness: 0.2 }), s.x, 1.08, s.z, { rx: Math.PI / 2 });
    b.add(b.G.cyl(0.85, 0.14), b.e("wheel", b.v.theme.accent, 0.7), s.x, 1.06, s.z);
    const chips = [];
    for (let i = 0; i < 12; i++) chips.push({ x: s.x + Math.cos(i * 0.9) * 1.55, y: 1.06, z: s.z + Math.sin(i * 0.9) * 1.55 });
    b.inst(b.G.cyl(0.1, 0.05), b.e("chip", chipColors[1], 0.35), chips);
    b.lit(s.x, 2.7, s.z, 26, 11);
    b.block(s.x, s.z, 2.1);
    b.station(s.x, s.z + 2.5, "roulette", "Roulette — $25 on the felt");
    // the croupier on the far side of the wheel, and three punters on the rim
    b.spot(s.x + 1.9, s.z - 1.9, { role: "croupier", face: -Math.PI / 4 });
    b.spot(s.x - 2.55, s.z + 0.5, { face: Math.PI / 2 });
    b.spot(s.x + 2.55, s.z + 0.5, { face: -Math.PI / 2 });
    b.spot(s.x - 1.9, s.z - 1.9, { face: Math.PI / 4 });
  },

  /** A blackjack / poker table with three seats on the player's side. */
  cardTable(b, s) {
    const w = s.w ?? 2.6, d = s.d ?? 1.6;
    b.add(b.G.box(w, 1.0, d), b.m("card base", b.v.theme.interior), s.x, 0.5, s.z, { cast: true });
    b.add(b.G.box(w + 0.2, 0.14, d + 0.2), b.m("card top", b.v.theme.felt, { roughness: 0.5 }), s.x, 1.06, s.z);
    b.add(b.G.box(w + 0.24, 0.05, d + 0.24), b.m("card rim", 0xd4af37, { metalness: 0.85, roughness: 0.25 }), s.x, 1.14, s.z);
    b.add(b.G.box(0.5, 0.3, 0.24), b.e("card shoe", b.v.theme.accent, 0.9), s.x, 1.28, s.z - d / 2 + 0.25);
    const seats = [];
    for (const sx of [-1, 0, 1]) seats.push({ x: s.x + sx * (w / 3), y: 0.28, z: s.z + d / 2 + 0.7 });
    b.inst(b.G.cyl(0.24, 0.56), b.m("stool seat", b.v.theme.trim, { metalness: 0.5 }), seats);
    b.lit(s.x, 2.5, s.z, 22, 9);
    b.block(s.x, s.z, 1.6);
    b.station(s.x, s.z + 1.9, "cards", "Blackjack — the dealer's in");
    // the dealer behind the shoe, two of the three seats taken — and 0.4 m off
    // the table, because a hall whose pit sits near the back wall has no room
    // for a dealer standing a stride behind it (the audit caught exactly that)
    b.spot(s.x, s.z - d / 2 - 0.4, { role: "dealer", face: 0 });
    for (const sx of [-1, 1]) b.spot(s.x + sx * (w / 3), s.z + d / 2 + 0.75, { face: Math.PI });
  },

  /** The cashier's cage: counter, gold top, bars over the window. */
  cashier(b, s) {
    const w = s.w ?? 8, d = s.d ?? 2.6, h = 1.15;
    b.add(b.G.box(w, h, d), b.m("cashier counter", b.v.theme.interior), s.x, h / 2, s.z, { cast: true });
    b.add(b.G.box(w + 0.25, 0.1, d + 0.25), b.m("cashier top", 0xd4af37, { metalness: 0.85, roughness: 0.25 }), s.x, h + 0.05, s.z);
    const bars = [];
    const n = Math.max(4, Math.round(w / 0.36));
    for (let i = 0; i < n; i++) bars.push({ x: s.x + (i - (n - 1) / 2) * 0.36, y: 2.35, z: s.z - d / 2 + 0.12 });
    b.inst(b.G.cyl(0.035, 2.3), b.M.chrome, bars);
    b.add(b.G.box(w, 0.22, 0.22), b.m("cage header", 0xd4af37, { metalness: 0.8, roughness: 0.3 }), s.x, 3.6, s.z - d / 2 + 0.12);
    b.add(b.G.box(0.6, 0.62, 0.1), b.e("cage till", b.v.theme.accent, 0.9), s.x + w * 0.25, 1.5, s.z - 0.2);
    b.sign("CASHIER", b.v.ink, { x: s.x, y: 4.4, z: s.z - d / 2 + 0.2, w: w * 0.66, h: 0.85 });
    b.lit(s.x, 3.0, s.z + 2.2, 40, 13);
    b.station(s.x, s.z + 2.4, "cashier", "Cashier — chips and cash");
    // the teller behind the counter, window side
    b.spot(s.x - w * 0.18, s.z - 1.5, { role: "clerk", face: 0 });
    const rows = Math.max(2, Math.round(w / 2.2));
    for (let i = 0; i <= rows; i++) b.block(s.x - w / 2 + (i * w) / rows, s.z, 1.0);
  },

  /** The vault door, squarely in view: a gold disc, a wheel, bolt holes. */
  vault(b, s) {
    const r = s.r ?? 1.7;
    b.add(b.G.box(r * 2.7, r * 2.7, 0.55), b.m("vault frame", 0x2a2f3d, { metalness: 0.7, roughness: 0.4 }), s.x, r * 1.35, s.z, { cast: true });
    b.add(b.G.cyl(r, 0.5), b.m("vault door", 0xd4af37, { metalness: 0.95, roughness: 0.25 }), s.x, r * 1.35, s.z + 0.4, { rx: Math.PI / 2 });
    b.add(b.G.torus(r * 0.6, 0.13), b.M.chrome, s.x, r * 1.35, s.z + 0.7, { rx: Math.PI / 2 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      b.add(b.G.box(0.14, r * 1.1, 0.14), b.M.chrome, s.x + Math.cos(a) * r * 0.3, r * 1.35 + Math.sin(a) * r * 0.3, s.z + 0.72, { rz: a });
    }
    const bolts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      bolts.push({ x: s.x + Math.cos(a) * r * 0.78, y: r * 1.35 + Math.sin(a) * r * 0.78, z: s.z + 0.66, rz: Math.PI / 2 });
    }
    b.inst(b.G.cyl(0.11, 0.16), b.M.steel, bolts);
    b.sign("VAULT", b.v.ink, { x: s.x, y: r * 2.85, z: s.z + 0.3, w: r * 2.1, h: 0.8 });
    b.lit(s.x, r * 1.6, s.z + 2.0, 34, 12);
    b.station(s.x, s.z + 2.8, "vault", "The vault — cameras are rolling");
    b.block(s.x, s.z, r * 1.2);
  },

  /** A long bar: counter, toe rail, back shelf, bottles and stools. */
  barBig(b, s) {
    const rot = s.rot ? 1 : 0, len = s.len ?? 16, h = 1.12;
    b.add(b.G.box(rot ? 1.1 : len, h, rot ? len : 1.1), b.M.wood, s.x, h / 2, s.z, { cast: true });
    b.add(b.G.box(rot ? 1.45 : len + 0.3, 0.09, rot ? len + 0.3 : 1.45), b.m("bar top", b.v.theme.trim, { metalness: 0.55, roughness: 0.3 }), s.x, h + 0.04, s.z);
    b.add(b.G.box(rot ? 0.9 : len, 0.26, rot ? len : 0.9), b.M.dark, s.x, 0.13, s.z);
    // the back shelf and its bottles, both instanced
    const bx = rot ? s.x - 1.6 : s.x, bz = rot ? s.z : s.z - 1.6;
    b.add(b.G.box(rot ? 0.4 : len, 2.8, rot ? len : 0.4), b.m("back bar", b.v.theme.interior), bx, 1.5, bz);
    const bottles = [];
    const rows = 3, cols = Math.max(4, Math.round((len - 1) / 0.7));
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const o = (c - (cols - 1) / 2) * 0.7;
      bottles.push(rot ? { x: bx + 0.38, y: 1.35 + r * 0.78, z: bz + o } : { x: bx + o, y: 1.35 + r * 0.78, z: bz + 0.38 });
    }
    b.inst(b.G.cyl(0.075, 0.34), b.e("bottles", b.v.theme.accent, 0.85), bottles);
    // stools on the room side
    const stools = [];
    const ns = Math.max(3, Math.round(len / 1.7));
    for (let i = 0; i < ns; i++) {
      const o = (i - (ns - 1) / 2) * 1.7;
      stools.push(rot ? { x: s.x + 1.35, y: 0.28, z: s.z + o } : { x: s.x + o, y: 0.28, z: s.z + 1.35 });
    }
    b.inst(b.G.cyl(0.24, 0.56), b.M.velvet, stools);
    const rows2 = Math.max(2, Math.round(len / 2.4));
    for (let i = 0; i <= rows2; i++) {
      const o = (i / rows2 - 0.5) * len;
      b.block(rot ? s.x : s.x + o, rot ? s.z + o : s.z, 0.85);
    }
    b.lit(rot ? s.x + 3.0 : s.x, 3.4, rot ? s.z : s.z + 3.0, 62, 17);
    b.station(rot ? s.x + 1.9 : s.x, rot ? s.z : s.z + 1.9, "bar", "Bar — what are you having?");
    // the barman between the counter and his shelf, then drinkers on the near
    // side. `s.keep` is who is minding the bar — HAPPY HOGS puts a hog behind it
    // (crowd.js's `hogkeep`, which works the shift rather than standing at it),
    // and that is the only line the venue has to change to do it.
    const keep = s.keep || "barkeep";
    // and a counter runs along one axis: `patrol` is what the `work` beat walks,
    // so a barman steps along his bar instead of drifting into the bottles
    const patrol = rot ? "z" : "x";
    if (rot) {
      b.spot(s.x - 1.05, s.z, { role: keep, face: Math.PI / 2, patrol, r: 1.5 });
      for (let i = 0; i < ns; i += 2) b.spot(s.x + 1.35, s.z + (i - (ns - 1) / 2) * 1.7, { face: -Math.PI / 2, beat: "still" });
    } else {
      b.spot(s.x, s.z - 1.05, { role: keep, face: 0, patrol, r: 1.5 });
      for (let i = 0; i < ns; i += 2) b.spot(s.x + (i - (ns - 1) / 2) * 1.7, s.z + 1.55, { face: Math.PI, beat: "still" });
    }
  },

  /** Bench booths: table, two seats, high backs. */
  booths(b, s) {
    const n = s.n ?? 3, dx = s.dx ?? 6;
    for (let i = 0; i < n; i++) {
      const x = s.x + (i - (n - 1) / 2) * dx;
      b.add(b.G.box(2.6, 0.16, 1.5), b.m("booth table", b.v.theme.trim, { metalness: 0.35, roughness: 0.4 }), x, 0.78, s.z);
      b.add(b.G.cyl(0.12, 0.72), b.M.dark, x, 0.36, s.z);
      for (const sz of [-1, 1]) {
        b.add(b.G.box(2.6, 0.5, 0.95), b.m("booth seat", b.v.theme.felt, { roughness: 0.9 }), x, 0.45, s.z + sz * 1.25);
        b.add(b.G.box(2.6, 0.95, 0.25), b.m("booth back", b.v.theme.felt, { roughness: 0.9 }), x, 1.08, s.z + sz * 1.68);
      }
      b.block(x, s.z, 1.5);
      b.lit(x, 2.7, s.z, 28, 10);      // one per booth: a row of three is a 12 m span
      for (const sz of [-1, 1]) b.spot(x + sz * 0.75, s.z + sz * 1.3, { face: sz < 0 ? 0 : Math.PI, beat: "still" });
    }
  },

  /** Lounge seating: a rug, sofas facing each other, low tables. */
  lounge(b, s) {
    const n = s.n ?? 2, dx = s.dx ?? 10;
    for (let i = 0; i < n; i++) {
      const x = s.x + (i - (n - 1) / 2) * dx;
      b.add(b.G.plane(6.5, 5.5), b.m("rug", b.v.theme.felt, { roughness: 0.95 }), x, 0.14, s.z, { rx: -Math.PI / 2 });
      for (const sz of [-1, 1]) {
        b.add(b.G.box(5.2, 0.55, 1.3), b.m("sofa", b.v.theme.interior, { roughness: 0.9 }), x, 0.42, s.z + sz * 1.9);
        b.add(b.G.box(5.2, 0.8, 0.35), b.m("sofa back", b.v.theme.interior, { roughness: 0.9 }), x, 0.95, s.z + sz * 2.4);
      }
      b.add(b.G.cyl(0.85, 0.42), b.M.wood, x, 0.35, s.z);
      b.block(x, s.z + 1.9, 1.6);
      b.block(x, s.z - 1.9, 1.6);
      b.block(x, s.z, 0.9);
      // two sitting-and-talking: one on each sofa, turned in to the table
      b.spot(x - 1.3, s.z + 1.9, { face: Math.PI, beat: "still" });
      b.spot(x + 1.3, s.z - 1.9, { face: 0, beat: "still" });
    }
    b.lit(s.x, 2.8, s.z, 34, 12);
  },

  /** Two pool tables under a hanging lamp. */
  poolTable(b, s) {
    const n = s.n ?? 2, dx = s.dx ?? 6;
    for (let i = 0; i < n; i++) {
      const x = s.x + (i - (n - 1) / 2) * dx;
      b.add(b.G.box(1.7, 0.28, 3.0), b.M.wood, x, 0.86, s.z, { cast: true });
      b.add(b.G.box(1.5, 0.08, 2.8), b.m("pool felt", b.v.theme.felt, { roughness: 0.5 }), x, 1.02, s.z);
      const legs = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push({ x: x + sx * 0.65, y: 0.43, z: s.z + sz * 1.25 });
      b.inst(b.G.cyl(0.1, 0.86), b.M.wood, legs);
      b.add(b.G.cone(0.85, 0.5), b.e("pool lamp", b.v.theme.accent, 1.0), x, 2.5, s.z);
      b.lit(x, 2.4, s.z, 30, 10);
      b.block(x, s.z, 1.8);
      b.station(x, s.z + 2.0, "pool", "Pool table — rack 'em up");
      // a break in progress: one player lining up, one waiting his turn
      b.spot(x - 1.5, s.z, { face: Math.PI / 2, beat: "still" });
      b.spot(x + 1.5, s.z + 1.4, { face: -Math.PI / 2, beat: "still" });
    }
  },

  /** A performance stage: deck, edge trim, backdrop, truss and poles. */
  stage(b, s) {
    const w = s.w ?? 12, d = s.d ?? 5, rise = s.rise ?? 0.7;
    b.add(b.G.box(w, rise, d), b.m("stage deck", b.v.theme.interior, { roughness: 0.3 }), s.x, rise / 2, s.z, { cast: true });
    b.add(b.G.box(w + 0.12, 0.12, 0.12), b.e("stage edge", b.v.theme.accent, 1.1), s.x, rise + 0.02, s.z + d / 2 - 0.06);
    b.add(b.G.box(w * 0.72, 6.0, 0.25), b.gl("stage backdrop", b.v.theme.accent), s.x, rise + 3.0, s.z - d / 2 - 0.18);
    b.add(b.G.box(w + 0.6, 0.3, 0.3), b.M.steel, s.x, 6.6, s.z - d / 2 - 0.2);
    const cans = [];
    const nc = Math.max(3, Math.round(w / 2.2));
    for (let i = 0; i < nc; i++) cans.push({ x: s.x + (i - (nc - 1) / 2) * 2.2, y: 6.3, z: s.z - d / 2 - 0.2, rx: Math.PI / 2 });
    b.inst(b.G.cyl(0.16, 0.3), b.M.steel, cans);
    if (s.poles) {
      for (let i = 0; i < s.poles; i++) {
        const x = s.x + (i - (s.poles - 1) / 2) * (w / (s.poles + 1));
        b.add(b.G.cyl(0.05, b.H - 1.2), b.M.chrome, x, rise + (b.H - 1.2) / 2, s.z);
        b.add(b.G.cyl(0.2, 0.1), b.M.steel, x, rise + 0.08, s.z);
      }
    }
    for (let i = 0; i <= 3; i++) b.block(s.x - w / 2 + (i * w) / 3, s.z + d / 2 - 0.2, 0.8);
    b.lit(s.x, 4.6, s.z, 80, 18);
    b.station(s.x, s.z + d / 2 + 1.0, "stage", "The stage — the show's about to start");
    // the act, on the deck: a girl on each pole if this stage has them, else two
    // go-go dancers working the front corners. Height is the deck, not the floor.
    if (s.poles) {
      // `s.who` is who works the poles (HAPPY HOGS' are hogs)
      for (let i = 0; i < s.poles; i++) {
        const x = s.x + (i - (s.poles - 1) / 2) * (w / (s.poles + 1));
        b.spot(x + 0.7, s.z + 0.2, { role: s.who || "performer", face: 0, y: rise });
      }
    } else {
      for (const sx of [-1, 1]) b.spot(s.x + sx * w * 0.26, s.z + 0.3, { role: "gogo", face: 0, y: rise });
    }
    // ...and the headliner, if this stage has one (`star: "BILLY JEANS"`). He
    // gets front-centre, the facing the room has (0 = at the crowd), and the deck
    // itself as a rectangle he is not allowed to leave — his routine walks him
    // sideways and glides him backwards, and the bounds are what keep a scripted
    // actor from stepping off a 6 m riser mid-moonwalk.
    if (s.star) {
      const z1 = s.z + d / 2 - 2.2, z0 = s.z - d / 2 + 1.4;
      b.spot(s.x, z1, {
        role: "star", face: 0, y: rise, name: s.star,
        bounds: { x0: s.x - w * 0.2, x1: s.x + w * 0.2, z0: Math.min(z0, z1 - 1.2), z1 },
      });
    }
  },

  /**
   * The floor in front of a stage: the crowd the act plays to.
   *
   * People only — a barricade here would be collision between the room and its own
   * stage — and every spot faces the stage (local −z, yaw π), dances on the spot,
   * and is flagged `hype`, which is what makes the *front row* rather than the
   * whole bar lose it when the act lands a move (crowd.js). A game room has a
   * column in it, so the fixture asks the builder what is actually free (`b.free`)
   * instead of proposing a person inside a pillar and letting the audit find it.
   */
  stagefront(b, s) {
    const w = s.w ?? 12, d = s.d ?? 3.4, n = s.n ?? 6, dz = s.dz ?? 1.7;
    const cols = Math.max(2, Math.round(w / 3)), rows = Math.max(1, Math.round(d / dz));
    const cand = [];
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      cand.push({ x: s.x + (i - (cols - 1) / 2) * (w / cols), z: s.z + (j - (rows - 1) / 2) * dz });
    }
    const step = Math.max(1, Math.round(cand.length / n));
    let placed = 0;
    for (let k = 0; k < cand.length && placed < n; k += step) {
      const c = cand[k];
      if (!b.free(c.x, c.z, 0.7)) continue;
      b.spot(c.x, c.z, { role: "fan", face: Math.PI, hype: true, r: 0.5, anim: "dance" });
      placed++;
    }
    b.lit(s.x, 2.6, s.z, 40, 12);
  },

  /**
   * A row of dance podiums: small lit risers with one dancer on each.
   *
   * The podium is a *riser*, so its collision is one circle under a person who
   * stands above it — which is exactly what the audit's floor-plane rule already
   * allows for (see the raised-actor note in `crown_build_test`).
   *
   * `r: 0.3` is what keeps a dancer on a 0.6 m disc, and it does it by being under
   * the crowd's own 0.3 m arrival threshold (crowd.js) — so a podium dancer turns
   * on the spot inside her pose rather than pacing off the edge. A wider radius
   * would put her on the floor; the fixture does not need to fence her in.
   */
  podiums(b, s) {
    const n = s.n ?? 3, dx = s.dx ?? 3.4, rise = s.rise ?? 0.42, r = s.r ?? 0.62;
    const tops = [], rims = [];
    for (let i = 0; i < n; i++) {
      const x = s.x + (i - (n - 1) / 2) * dx;
      tops.push({ x, y: rise / 2, z: s.z });
      rims.push({ x, y: rise, z: s.z });
      b.block(x, s.z, r * 1.5);
      b.spot(x, s.z, {
        role: s.role || "hogdancer", face: (s.face ?? 0) + (i - (n - 1) / 2) * 0.5,
        y: rise, r: 0.3, beat: "shuffle",
      });
    }
    b.inst(b.G.cyl(r, rise), b.m("podium", b.v.theme.interior), tops, { cast: true });
    b.inst(b.G.cyl(r + 0.06, 0.07), b.e("podium rim", b.v.theme.accent, 1.2), rims);
    // one pooled light for the row: three 0.6 m risers do not each need a lamp
    b.lit(s.x, rise + 2.4, s.z, 42, 13);
  },

  /** A stack of PA speakers. */
  speakers(b, s) {
    const n = s.n ?? 2, dx = s.dx ?? 3.0;
    for (let i = 0; i < n; i++) {
      const x = s.x + (i - (n - 1) / 2) * dx;
      b.add(b.G.box(0.8, 1.9, 0.7), b.M.dark, x, 0.95, s.z, { cast: true });
      b.add(b.G.cyl(0.28, 0.06), b.e("speaker cone", b.v.theme.accent, 0.5), x, 0.95, s.z + 0.37, { rx: Math.PI / 2 });
      b.block(x, s.z, 0.7);
    }
  },

  /** The dance floor: an emissive deck with a grid of lit panels. */
  danceFloor(b, s) {
    const w = s.w ?? 18, d = s.d ?? 12;
    b.add(b.G.plane(w, d), b.e("dance deck", b.v.theme.accent, 0.35), s.x, 0.05, s.z, { rx: -Math.PI / 2 });
    const panels = [];
    const nx = Math.round(w / 3), nz = Math.round(d / 3);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      panels.push({
        x: s.x + (i - (nx - 1) / 2) * 3, y: 0.07, z: s.z + (j - (nz - 1) / 2) * 3,
        rx: -Math.PI / 2,
      });
    }
    b.inst(b.G.plane(2.6, 2.6), b.e("dance panel", b.v.theme.trim, 0.75), panels);
    for (const sz of [-1, 1]) b.add(b.G.box(w + 0.2, 0.1, 0.2), b.e("floor trim", b.v.theme.trim, 1.0), s.x, 0.1, s.z + sz * d / 2);
    for (const sx of [-1, 1]) b.add(b.G.box(0.2, 0.1, d + 0.2), b.e("floor trim", b.v.theme.trim, 1.0), s.x + sx * w / 2, 0.1, s.z);
    b.lit(s.x, 2.4, s.z, 55, 20);
    // the floor itself: a loose grid of people, dancing on the spot. `shuffle` +
    // `dance` rather than the `dancer` role, so the room is the strip's own mix
    // of patrons out on the floor instead of a chorus line of sequins.
    const dx = 4.2, dz = 3.6;
    const cols = Math.max(1, Math.round(w / dx)), rows = Math.max(1, Math.round(d / dz));
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if ((i + j) % 3 === 2) continue;              // leave gaps, so it reads as a crowd not a lattice
      b.spot(s.x + (i - (cols - 1) / 2) * dx, s.z + (j - (rows - 1) / 2) * dz,
        { anim: "dance", beat: "shuffle", r: 0.9 });
    }
  },

  /** The DJ booth: riser, console, screens, decks. */
  djBooth(b, s) {
    const w = s.w ?? 10, d = s.d ?? 3;
    b.add(b.G.box(w, 0.5, d), b.m("dj riser", b.v.theme.interior), s.x, 0.25, s.z);
    b.add(b.G.box(w, 1.2, d * 0.7), b.m("dj console", b.v.theme.interior), s.x, 1.1, s.z);
    b.add(b.G.box(w + 0.3, 0.1, d * 0.75), b.m("dj top", b.v.theme.trim, { metalness: 0.7, roughness: 0.25 }), s.x, 1.75, s.z);
    b.add(b.G.box(w * 0.62, 3.0, 0.3), b.gl("dj screen", b.v.theme.accent), s.x, 3.4, s.z - d * 0.5 - 0.15);
    const decks = [];
    for (const sx of [-1, 1]) decks.push({ x: s.x + sx * w * 0.28, y: 1.82, z: s.z, rx: -Math.PI / 2 });
    b.inst(b.G.cyl(0.42, 0.06), b.e("deck", b.v.theme.trim, 0.9), decks);
    for (let i = 0; i <= 2; i++) b.block(s.x + (i - 1) * (w / 2), s.z, 0.9);
    b.lit(s.x, 3.6, s.z + 1.4, 45, 13);
    b.station(s.x, s.z + d / 2 + 1.3, "dj", "The DJ booth — requests taken");
    // the DJ on the riser, behind the console and facing the floor, the screens
    // at their back — which is what the console's own geometry already implies
    b.spot(s.x, s.z - 1.1, { role: "dj", face: 0, y: 0.5 });
  },

  /** Structural columns. Instanced, and each one is real collision. */
  columns(b, s) {
    const n = s.n ?? 4, dx = s.dx ?? 12, dz = s.dz ?? 0;
    const shafts = [], caps = [], bases = [];
    // the hall's mid-space: columns are what a big room has instead of walls
    b.lit(s.x, b.H - 3.0, s.z, 34, 16);
    for (let i = 0; i < n; i++) {
      const x = s.x + (i - (n - 1) / 2) * dx;
      for (const z of dz ? [s.z - dz / 2, s.z + dz / 2] : [s.z]) {
        shafts.push({ x, y: b.H / 2, z });
        caps.push({ x, y: b.H - 0.25, z });
        bases.push({ x, y: 0.25, z });
        b.block(x, z, 0.85);
      }
    }
    b.inst(b.G.cyl(0.5, b.H), b.m("column", b.v.theme.interior), shafts, { cast: true });
    b.inst(b.G.box(1.6, 0.5, 1.6), b.m("column cap", b.v.theme.trim, { metalness: 0.4 }), caps);
    b.inst(b.G.box(1.4, 0.5, 1.4), b.m("column cap", b.v.theme.trim, { metalness: 0.4 }), bases);
  },

  /** The VIP deck: a raised, roped platform with velvet booths. */
  vipDeck(b, s) {
    const w = s.w ?? 12, d = s.d ?? 8, rise = s.rise ?? 0.45;
    b.add(b.G.box(w, rise, d), b.m("vip deck", b.v.theme.interior, { roughness: 0.6 }), s.x, rise / 2, s.z, { cast: true });
    b.add(b.G.box(w + 0.4, 0.1, d + 0.4), b.m("vip trim", 0xd4af37, { metalness: 0.85, roughness: 0.25 }), s.x, rise + 0.03, s.z);
    const booths = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) booths.push({ x: s.x + sx * (w / 2 - 2.0), y: rise + 0.72, z: s.z + sz * (d / 2 - 1.6) });
    b.inst(b.G.box(2.4, 0.5, 1.1), b.M.velvet, booths);
    b.inst(b.G.box(2.4, 1.0, 0.3), b.M.velvet, booths.map((t) => ({ ...t, y: t.y + 0.6, z: t.z + 0.55 })));
    const posts = [], ropes = [];
    for (let i = -1; i <= 1; i++) {
      posts.push({ x: s.x + i * (w / 2.6), y: rise + 0.55, z: s.z + d / 2 + 0.5 });
      if (i < 1) ropes.push({ x: s.x + (i + 0.5) * (w / 2.6), y: rise + 0.85, z: s.z + d / 2 + 0.5, rz: Math.PI / 2 });
    }
    b.inst(b.G.cyl(0.07, 1.1), b.m("vip post", 0xd4af37, { metalness: 0.9 }), posts);
    b.inst(b.G.cyl(0.05, w / 2.6), b.M.velvet, ropes);
    b.lit(s.x, rise + 2.4, s.z, 46, 14);
    b.block(s.x, s.z, Math.min(w, d) / 2 - 0.5);
    b.station(s.x, s.z + d / 2 + 1.0, "vip", "VIP — velvet rope policy");
    // high rollers on the deck at the rail, and the host working the rope
    for (const sx of [-1, 1]) b.spot(s.x + sx * (w / 2 - 2.0), s.z + (d / 2 - 1.6), { y: rise, face: 0, beat: "still" });
    b.spot(s.x - 2.2, s.z + d / 2 + 1.2, { role: "host", face: 0 });
  },

  /** A private room: three walls, a door gap, a curtain, a bench. */
  privateRoom(b, s) {
    const w = s.w ?? 7, d = s.d ?? 4, h = 3.1, t = 0.28;
    const wall = b.m("room wall", b.v.theme.interior);
    b.add(b.G.box(w, h, t), wall, s.x, h / 2, s.z - d / 2, { cast: true });
    b.add(b.G.box(t, h, d), wall, s.x - w / 2, h / 2, s.z, { cast: true });
    const door = s.door ?? 1.6;
    const side = (d - door) / 2;
    b.add(b.G.box(t, h, side), wall, s.x + w / 2, h / 2, s.z - (door + side) / 2, { cast: true });
    b.add(b.G.box(t, h, side), wall, s.x + w / 2, h / 2, s.z + (door + side) / 2, { cast: true });
    b.add(b.G.box(w, 0.12, d), b.m("room floor", b.v.theme.felt, { roughness: 0.9 }), s.x, 0.08, s.z);
    b.add(b.G.box(0.14, 2.5, door), b.gl("room curtain", b.v.theme.accent), s.x + w / 2 + 0.05, 1.35, s.z);
    b.add(b.G.box(w - 1.2, 0.5, 0.9), b.M.velvet, s.x, 0.45, s.z - d / 2 + 0.7);
    b.sign(s.name || "PRIVATE", b.v.ink, { x: s.x, y: h + 0.5, z: s.z + d / 2 + 0.1, w: 2.6, h: 0.7 });
    b.lit(s.x, 2.4, s.z, 28, 9);
    for (let i = 0; i <= 3; i++) b.block(s.x - w / 2 + (i * w) / 3, s.z - d / 2, 0.5);
    for (let i = 0; i <= 2; i++) b.block(s.x - w / 2, s.z - d / 2 + (i * d) / 2, 0.5);
    for (let i = 0; i <= 2; i++) b.block(s.x + w / 2, s.z - d / 2 + (i * d) / 2, 0.5);
    // inside the room: a seated guest, and someone entertaining them
    b.spot(s.x, s.z - d / 2 + 0.7, { face: 0, beat: "still" });
    b.spot(s.x, s.z + 0.6, { face: Math.PI });
  },

  /** Backstage: mirrors, a rack of costumes, a bench. */
  dressingRoom(b, s) {
    const w = s.w ?? 10, d = s.d ?? 5, h = 3.1, t = 0.28;
    const wall = b.m("room wall", b.v.theme.interior);
    b.add(b.G.box(w, h, t), wall, s.x, h / 2, s.z - d / 2, { cast: true });
    b.add(b.G.box(t, h, d), wall, s.x - w / 2, h / 2, s.z, { cast: true });
    b.add(b.G.box(w, 0.12, d), b.m("room floor", b.v.theme.felt, { roughness: 0.9 }), s.x, 0.08, s.z);
    const mirrors = [], bulbs = [];
    const nm = Math.max(2, Math.round(w / 3));
    for (let i = 0; i < nm; i++) {
      const x = s.x + (i - (nm - 1) / 2) * 3;
      mirrors.push({ x, y: 1.7, z: s.z - d / 2 + 0.2 });
      for (let k = 0; k < 6; k++) bulbs.push({ x: x - 0.75 + (k % 3) * 0.75, y: 1.7 + (k < 3 ? 0.95 : -0.95), z: s.z - d / 2 + 0.32 });
    }
    b.inst(b.G.box(1.6, 1.5, 0.08), b.M.chrome, mirrors);
    b.inst(b.G.sph(0.09), b.e("vanity bulb", 0xfff2d0, 1.4), bulbs);
    b.inst(b.G.cyl(0.04, 2.0), b.M.steel, [{ x: s.x + w / 2 - 1.4, y: 1.4, z: s.z - d / 2 + 0.5 }]);
    b.add(b.G.box(w - 2, 0.5, 0.8), b.M.velvet, s.x, 0.45, s.z + d / 2 - 0.6);
    b.lit(s.x, 2.6, s.z, 30, 10);
    for (let i = 0; i <= 3; i++) b.block(s.x - w / 2 + (i * w) / 3, s.z - d / 2, 0.5);
    for (let i = 0; i <= 2; i++) b.block(s.x - w / 2, s.z - d / 2 + (i * d) / 2, 0.5);
    // off-shift: somebody at the mirrors, somebody on the bench
    b.spot(s.x - w * 0.25, s.z - d / 2 + 0.9, { beat: "still", face: 0 });
    b.spot(s.x + w * 0.2, s.z + d / 2 - 1.2, { beat: "still", face: 0 });
  },

  /** A gold chandelier: a ring of bulbs on a chain. */
  chandelier(b, s) {
    const r = s.r ?? 1.5, y = s.y ?? b.H - 2.0;
    b.add(b.G.cyl(0.05, Math.max(0.6, b.H - y - 0.2)), b.M.steel, s.x, (y + b.H) / 2, s.z);
    b.add(b.G.torus(r, 0.12), b.m("chandelier ring", 0xd4af37, { metalness: 0.9, roughness: 0.2 }), s.x, y, s.z, { rx: Math.PI / 2 });
    const bulbs = [];
    const n = Math.max(6, Math.round(r * 8));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      bulbs.push({ x: s.x + Math.cos(a) * r, y: y + 0.35, z: s.z + Math.sin(a) * r });
    }
    b.inst(b.G.sph(0.13), b.e("chandelier bulb", 0xffe9b0, 1.5), bulbs);
    b.lit(s.x, y, s.z, 55, 15);
  },

  /** Mirror balls on chains, plus their pin spots. */
  discoBall(b, s) {
    const n = s.n ?? 3, dx = s.dx ?? 4;
    const balls = [];
    for (let i = 0; i < n; i++) {
      const x = s.x + (i - (n - 1) / 2) * dx;
      balls.push({ x, y: b.H - 1.9 - (i % 2) * 0.6, z: s.z, s: 0.75 + (i % 2) * 0.3 });
      b.add(b.G.cyl(0.03, 1.0), b.M.steel, x, b.H - 0.9, s.z);
    }
    b.inst(b.G.sph(0.7), b.M.chrome, balls);
    b.lit(s.x, b.H - 2.4, s.z, 42, 16);
  },

  /** Interior neon branding on a wall. */
  neonBrand(b, s) {
    b.add(b.G.box(s.w, 2.4, 0.2), b.M.dark, s.x, s.y, s.z);
    b.sign(s.text || b.v.name, b.v.ink, { x: s.x, y: s.y, z: s.z + 0.15, w: s.w - 0.4, h: 1.9 });
    b.lit(s.x, s.y, s.z + 1.6, 46, 15);
  },

  /** Framed pictures marching along a wall line. */
  decorWall(b, s) {
    const n = s.n ?? 4, dx = s.dx ?? 4, h = s.y ?? 3.1;
    const frames = [], art = [];
    for (let i = 0; i < n; i++) {
      const x = s.x + (i - (n - 1) / 2) * dx;
      frames.push({ x, y: h, z: s.z, ry: s.face ? Math.PI / 2 : 0 });
      art.push({ x, y: h, z: s.z + (s.face ? 0 : 0.06), ry: s.face ? Math.PI / 2 : 0 });
    }
    b.inst(b.G.box(2.0, 1.4, 0.14), b.m("frame", 0xd4af37, { metalness: 0.6, roughness: 0.4 }), frames);
    b.inst(b.G.box(1.7, 1.1, 0.06), b.e("art", b.v.theme.accent, 0.25), art);
  },

  /** Stanchions and a rope: a queue, or the edge of a floor. */
  rail(b, s) {
    const n = s.n ?? 4, dx = s.dx ?? 3, posts = [], rope = [];
    for (let i = 0; i < n; i++) {
      const x = s.x + (i - (n - 1) / 2) * dx;
      posts.push({ x, y: 0.55, z: s.z });
      if (i < n - 1) rope.push({ x: x + dx / 2, y: 0.95, z: s.z, rz: Math.PI / 2 });
    }
    b.inst(b.G.cyl(0.07, 1.1), b.M.chrome, posts);
    b.inst(b.G.cyl(0.05, dx), b.M.velvet, rope);
  },

  // ---- street frontage -----------------------------------------------------
  // Everything below this line stands in a forecourt, not on a floor: local z is
  // past `b.FZ`, out on the apron. Two rules, both of which the QA enforces:
  //
  //   * Nothing here adds a pooled light. main.js runs EIGHT real PointLights for
  //     the whole map, and the interior spots need them — an outdoor spot would
  //     push a slot machine out of the pool. Readability outdoors comes from
  //     emissive geometry plus the lamps the avenue already has.
  //   * Nothing lands in the doorway lane (|x| < door/2 + 2.5 within 12 m of the
  //     facade). Bollards, planters and bins are collision, and the entrance has
  //     to stay walkable.

  /** An entrance awning: a slab on two posts, striped, lit underneath. */
  awning(b, s) {
    const w = s.w ?? 12, d = s.d ?? 5, y = s.y ?? 4.6;
    const trim = b.m("awning trim", b.v.theme.trim, { metalness: 0.4, roughness: 0.4 });
    const cloth = b.m("awning cloth", s.color ?? b.v.theme.accent, { roughness: 0.85 });
    b.add(b.G.box(w, 0.22, d), cloth, s.x, y, s.z, { cast: true });
    b.add(b.G.box(w + 0.3, 0.16, 0.3), trim, s.x, y + 0.02, s.z + d / 2 - 0.15);
    // stripes across the leading edge, so it reads as fabric not a slab
    const stripes = [];
    const n = Math.max(4, Math.round(w / 1.6));
    for (let i = 0; i < n; i += 2) stripes.push({ x: s.x + (i - (n - 1) / 2) * 1.6, y: y - 0.12, z: s.z + d / 2 - 0.1 });
    b.inst(b.G.box(0.8, 0.06, 0.16), b.e("awning stripe", 0xfff2d0, 0.5), stripes);
    for (const sx of [-1, 1]) b.add(b.G.cyl(0.12, y), trim, s.x + sx * (w / 2 - 0.4), y / 2, s.z + d / 2 - 0.4, { cast: true });
    b.add(b.G.box(w * 0.9, 0.1, 0.2), b.e("awning underglow", b.v.theme.accent, 0.9), s.x, y - 0.14, s.z - d / 2 + 0.3);
  },

  /** An emissive arrow on the pier, pointing at the door. */
  neonArrow(b, s) {
    const dir = s.x < 0 ? 1 : -1;                 // always points inward, at the door
    const y = s.y ?? 4.2;
    const arrow = b.e("arrow", b.v.theme.accent, 1.15);
    b.add(b.G.box(2.3, 0.62, 0.14), b.M.dark, s.x, y, s.z - 0.1);   // the backing plate, matte
    b.neon(b.add(b.G.box(1.9, 0.42, 0.22), arrow, s.x, y, s.z));    // the lit shape reflects
    b.neon(b.add(b.G.cone(0.46, 0.9), arrow, s.x + dir * 1.3, y, s.z, { rz: -dir * Math.PI / 2 }));
  },

  /** A short pole with an emissive head: a security lamp, no pooled light. */
  securityLight(b, s) {
    const y = s.y ?? 4.4;
    b.add(b.G.cyl(0.1, y), b.M.steel, s.x, y / 2, s.z, { cast: true });
    b.add(b.G.box(0.5, 0.3, 0.9), b.M.steel, s.x, y + 0.1, s.z);
    b.neon(b.add(b.G.box(0.42, 0.12, 0.8), b.e("security lamp", s.color ?? 0xfff0d0, 1.2), s.x, y - 0.06, s.z));
    // and the pool of light it throws, painted on the apron
    b.add(b.G.plane(3.4, 3.4), b.e("lamp spill", s.color ?? 0xfff0d0, 0.14), s.x, 0.055, s.z + 1.2, { rx: -Math.PI / 2 });
  },

  /** A lit plate on a pole: a street sign, or a section marker. */
  streetSign(b, s) {
    const y = s.y ?? 3.2, text = s.text || b.v.name;
    b.add(b.G.cyl(0.07, y), b.M.steel, s.x, y / 2, s.z, { cast: true });
    b.sign(text, b.v.ink, { x: s.x, y: y + 0.5, z: s.z, w: s.w ?? 3.2, h: s.h ?? 0.9, ry: s.ry || 0 });
  },

  /** A row of bollards, lit at the base: the valet line, or a kerb edge. */
  bollardRow(b, s) {
    const n = s.n ?? 6, dx = s.dx ?? 3.2, rot = s.rot ? 1 : 0;
    const posts = [], bands = [];
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * dx;
      const x = rot ? s.x : s.x + o, z = rot ? s.z + o : s.z;
      posts.push({ x, y: 0.5, z });
      bands.push({ x, y: 0.86, z });
      b.block(x, z, 0.4);
    }
    b.inst(b.G.cyl(0.16, 1.0), b.m("bollard", b.v.theme.trim, { metalness: 0.7, roughness: 0.35 }), posts, { cast: true });
    b.inst(b.G.cyl(0.18, 0.14), b.e("bollard band", b.v.theme.accent, 0.9), bands);
  },

  /** A planter box with a low-poly shrub in it. */
  planter(b, s) {
    const n = s.n ?? 3, dx = s.dx ?? 7, rot = s.rot ? 1 : 0;
    const boxes = [], shrubs = [], soil = [];
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * dx;
      const x = rot ? s.x : s.x + o, z = rot ? s.z + o : s.z;
      boxes.push({ x, y: 0.34, z });
      soil.push({ x, y: 0.7, z });
      shrubs.push({ x, y: 1.05, z });
      b.block(x, z, 0.9);
    }
    b.inst(b.G.box(1.7, 0.68, 1.7), b.m("planter", b.v.theme.trim, { metalness: 0.25, roughness: 0.6 }), boxes, { cast: true });
    b.inst(b.G.box(1.4, 0.06, 1.4), b.m("soil", 0x2a2018, { roughness: 1 }), soil);
    b.inst(b.G.sph(0.62), b.m("shrub", 0x2f4a2a, { roughness: 0.95 }), shrubs, { cast: true });
  },

  /** A bin and its post: the small stuff a pavement has. */
  bin(b, s) {
    const n = s.n ?? 2, dx = s.dx ?? 9;
    const cans = [], lids = [], rims = [];
    for (let i = 0; i < n; i++) {
      const x = s.x + (i - (n - 1) / 2) * dx;
      cans.push({ x, y: 0.44, z: s.z });
      lids.push({ x, y: 0.92, z: s.z });
      rims.push({ x, y: 0.78, z: s.z });
      b.block(x, s.z, 0.55);
    }
    b.inst(b.G.cyl(0.34, 0.88), b.m("bin", 0x2f3a33, { metalness: 0.5, roughness: 0.55 }), cans, { cast: true });
    b.inst(b.G.cyl(0.38, 0.08), b.M.steel, lids);
    b.inst(b.G.cyl(0.37, 0.1), b.e("bin band", b.v.theme.accent, 0.5), rims);
  },

  /** A queue barrier out on the pavement, in front of a door. */
  queue(b, s) {
    const n = s.n ?? 5, dx = s.dx ?? 2.4;
    const posts = [], ropes = [];
    for (let i = 0; i < n; i++) {
      const x = s.x + (i - (n - 1) / 2) * dx;
      posts.push({ x, y: 0.55, z: s.z });
      if (i < n - 1) ropes.push({ x: x + dx / 2, y: 0.95, z: s.z, rz: Math.PI / 2 });
      // soft: the player walks through a rope line, a stroller's lane does not.
      // Recorded at the guests' side of the rope `crowd.js` stands people on, so
      // the lane a walker gets keeps clear of the queue, not just the posts.
      b.soft(x, s.z + 0.75, 0.6);
    }
    b.inst(b.G.cyl(0.07, 1.1), b.m("queue post", b.v.theme.trim, { metalness: 0.8, roughness: 0.25 }), posts);
    b.inst(b.G.cyl(0.05, dx), b.e("queue rope", s.color ?? b.v.theme.accent, 0.45), ropes);
    // the line itself: one guest between each pair of posts, facing the door
    // (which is at a smaller local z — the rope runs along the pavement)
    for (let i = 0; i < n - 1; i++) {
      b.spot(s.x + (i - (n - 1) / 2) * dx + dx / 2, s.z + 0.75, { role: "queue", face: Math.PI });
    }
  },

  /** A painted pool of light on the apron: "the entrance is here", no light cost. */
  spill(b, s) {
    const w = s.w ?? 14, d = s.d ?? 10;
    
    // Generate a soft radial gradient so the light pools naturally instead of being a hard rectangle
    if (!b.spillMap) {
      const canvas = document.createElement("canvas");
      canvas.width = 64; canvas.height = 64;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, 64, 64);
      const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, "rgba(255, 255, 255, 1)");
      grd.addColorStop(0.5, "rgba(255, 255, 255, 0.7)");
      grd.addColorStop(1, "rgba(0, 0, 0, 1)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 64, 64);
      b.spillMap = new THREE.CanvasTexture(canvas);
    }
    
    // Not `b.e()`: that wrapper only forwards (name, color, intensity) to the
    // kit's memoized `M.emis`/`M.of` — a transparent, additively-blended,
    // textured material silently had its whole options object (map, blending,
    // transparent, depthWrite) dropped on the floor, so this rendered as a
    // flat, fully opaque colour slab instead of the soft gradient pool the
    // canvas texture above was built for. Un-memoized on purpose: this is the
    // one material here that actually needs those options honoured.
    const spillMat = new THREE.MeshBasicMaterial({
      name: "entrance spill", color: b.v.theme.accent, map: b.spillMap,
      transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    spillMat.userData.gtbRealized = true;
    b.add(b.G.plane(w, d), spillMat, s.x, 0.045, s.z, { rx: -Math.PI / 2 });
    b.add(b.G.box(w * 0.28, 0.08, 0.1), b.e("kerb stripe", b.v.theme.accent, 0.7), s.x, 0.1, s.z - d / 2);
  },

  /** Back-office: desks, chairs, a filing cabinet. */
  desk(b, s) {
    const n = s.n ?? 2, dx = s.dx ?? 5;
    for (let i = 0; i < n; i++) {
      const x = s.x + (i - (n - 1) / 2) * dx;
      b.add(b.G.box(2.2, 0.12, 1.1), b.M.wood, x, 0.76, s.z);
      b.add(b.G.box(0.16, 0.76, 1.0), b.M.wood, x - 1.0, 0.38, s.z);
      b.add(b.G.box(0.16, 0.76, 1.0), b.M.wood, x + 1.0, 0.38, s.z);
      b.add(b.G.box(0.7, 0.5, 0.06), b.e("monitor", b.v.theme.accent, 0.7), x, 1.1, s.z - 0.3);
      b.add(b.G.box(0.5, 0.9, 0.5), b.M.steel, x + 0.7, 0.45, s.z + 0.9);
      b.block(x, s.z, 1.2);
      b.spot(x, s.z + 0.9, { face: 0, beat: "still" });      // back office, night shift
    }
    b.lit(s.x, 2.6, s.z, 30, 11);
  },
};

// ---------------------------------------------------------------------------
// Exterior landmarks. These hang off a venue facade rather than a floor, so they
// are their own table — the district calls them after the interior is built.
// ---------------------------------------------------------------------------
export const PROPS = {
  /** A very large white performance glove, mounted above a facade. */
  glove(b) {
    const white = b.m("glove white", 0xf4f7ff,
      { roughness: 0.22, metalness: 0.12, emissive: 0xffffff, emissiveIntensity: 0.35 });
    const seam = b.m("glove sequin", 0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.9 });
    const gg = new THREE.Group();
    gg.position.set(-b.W / 2 + 11, b.H + 6.4, b.FZ - 1.0);
    gg.rotation.set(0, -0.35, 0.16);
    b.g.add(gg);
    const put = (geo, mat, x, y, z, rx = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      m.castShadow = true;
      gg.add(m);
      return m;
    };
    put(b.G.box(5.2, 5.6, 2.3), white, 0, 0, 0);                       // palm
    [-1.75, -0.6, 0.55, 1.7].forEach((x, i) =>                          // four fingers
      put(b.G.box(1.15, 3.5 - i * 0.35, 2.0), white, x, 4.3 - i * 0.18, 0.1, -0.12 - i * 0.02));
    put(b.G.box(1.3, 3.1, 1.9), white, -3.2, 1.5, 0.1, 0.55);           // thumb
    put(b.G.box(5.6, 1.5, 2.7), b.m("glove cuff", 0x1a1a1a), 0, -3.5, 0);
    put(b.G.box(5.9, 0.4, 3.0), b.m("glove gold", b.v.theme.trim, { metalness: 0.9, roughness: 0.2 }), 0, -2.7, 0);
    const sequins = [];
    for (let ix = -2; ix <= 2; ix++) for (let iy = -2; iy <= 1; iy++) sequins.push({ x: ix, y: iy * 0.9 + 0.2, z: 1.25 });
    instanced(gg, b.G.sph(0.16), seam, sequins);
    for (const sx of [-1, 1]) put(b.G.box(0.35, 3.4, 0.35), b.m("glove mount", 0x2a2f3d, { metalness: 0.6 }), sx * 2.2, -6.1, 0);
    b.lit(-b.W / 2 + 11, b.H + 6.4, b.FZ - 0.6, 95, 26);
  },

  /** A pig's head over the door, in a bow tie, inside a neon halo. */
  pig(b) {
    const pink = b.m("pig pink", 0xff8fb0, { roughness: 0.5, emissive: 0xff4f7a, emissiveIntensity: 0.3 });
    const dark = b.m("pig dark", 0x5a2030);
    const pg = new THREE.Group();
    pg.position.set(0, b.H + 5.6, b.FZ - 0.8);
    b.g.add(pg);
    const put = (geo, mat, x, y, z, rx = 0, ry = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      m.castShadow = true;
      pg.add(m);
      return m;
    };
    put(b.G.sph(3.4), pink, 0, 0, 0);
    put(b.G.cyl(1.7, 1.4), pink, 0, -0.7, 3.1, Math.PI / 2);
    put(b.G.cyl(0.3, 0.2), dark, -0.6, -0.7, 3.85, Math.PI / 2);
    put(b.G.cyl(0.3, 0.2), dark, 0.6, -0.7, 3.85, Math.PI / 2);
    put(b.G.cone(1.3, 2.2), pink, -2.4, 2.6, 0, 0, 0.4);
    put(b.G.cone(1.3, 2.2), pink, 2.4, 2.6, 0, 0, -0.4);
    put(b.G.sph(0.42), dark, -1.2, 0.9, 2.9);
    put(b.G.sph(0.42), dark, 1.2, 0.9, 2.9);
    put(b.G.box(2.4, 0.9, 0.5), b.e("pig bowtie", b.v.theme.accent, 1.2), 0, -2.6, 2.7);
    put(b.G.torus(3.9, 0.2), b.e("pig halo", b.v.theme.accent, 1.1), 0, 0, -0.6);
    b.lit(0, b.H + 5.6, b.FZ - 0.6, 85, 24);
  },

  /** A roof mirror ball, balls along the canopy, neon up the piers. */
  disco(b) {
    const put = (geo, mat, x, y, z, opt) => b.add(geo, mat, x, y, z, opt);
    put(b.G.sph(2.6), b.M.chrome, 0, b.H + 3.6, b.FZ - 4, { cast: true });
    put(b.G.cyl(0.1, 3.0), b.M.steel, 0, b.H + 1.3, b.FZ - 4);
    const canopy = [];
    for (let i = -3; i <= 3; i++) canopy.push({ x: i * 3.2, y: 5.4, z: b.FZ + 4.6 });
    b.inst(b.G.sph(0.55), b.M.chrome, canopy, { cast: true });
    for (const s of [-1, 1]) {
      put(b.G.box(0.35, b.H * 0.7, 0.35), b.e("neon tube", b.v.theme.accent, 1.3), s * (b.W / 2 - 1.2), b.H * 0.4, b.FZ + 0.12);
      put(b.G.box(0.35, b.H * 0.7, 0.35), b.e("neon tube 2", b.v.theme.trim, 1.2), s * (b.W / 2 - 2.6), b.H * 0.35, b.FZ + 0.12);
    }
    b.lit(0, 6.0, b.FZ + 1.0, 80, 26);
  },
};

