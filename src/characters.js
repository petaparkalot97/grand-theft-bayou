// ---------------------------------------------------------------------------
// characters.js — the HOODRATS.
//
// Two crews, red and blue, built to the reference photos: bandana (do-rag on
// the men, tied headband on the women), white ribbed tank, crew-coloured belt
// or leggings, matching high-tops, a chain at the neck.
//
// Built procedurally rather than loaded: the packs have no character that looks
// anything like this, and code lets one builder cover both sexes, both crews
// and per-spawn variation (skin tone, build, hair) from a seed.
//
// A Hoodrat is a drop-in replacement for an `AnimatedSprite` in the enemy
// system — same `play` / `update` / `setFlip` / `finished` / `material.opacity`
// surface — so `updateEnemy()` drives it without knowing it is 3D.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { microSurface } from "./graphics.js";

// --------------------------------------------------------------- palette
export const CREWS = {
  red:  { name: "Red",  cloth: 0x9e1f27, accent: 0xd2434b, chain: 0xd4af37, shoe: 0xb3242c },
  blue: { name: "Blue", cloth: 0x1d3a86, accent: 0x3a63c6, chain: 0xcfd3da, shoe: 0x24357f },
};
export const CREW_NAMES = Object.keys(CREWS);

const SKIN_TONES = [0x7a4f35, 0x633d28, 0x8b6044, 0x512f1f, 0x946c4c, 0x452718];
const DENIM = [0x5d7ea6, 0x53718f, 0x6b8cb2, 0x47607d];

// --------------------------------------------------------------- shared assets
// Geometry is shared across every Hoodrat in the level — only the transforms
// differ. Materials are shared too, and only cloned for one individual when it
// starts to fade out on death.
const geoCache = new Map();
function geo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
const box = (w, h, d) => geo(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt, rb, h, seg = 10) =>
  geo(`c${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const sph = (r, w = 12, h = 10) => geo(`s${r}|${w}|${h}`, () => new THREE.SphereGeometry(r, w, h));
const torus = (r, t, seg = 10, rings = 16) =>
  geo(`t${r}|${t}|${seg}|${rings}`, () => new THREE.TorusGeometry(r, t, seg, rings));

// Surface presets. Everything is tagged `gtbRealized` so the scene-wide PBR
// pass leaves it alone — these are already authored as the surface we want.
const SURFACES = {
  skin:    { roughness: 0.58, metalness: 0, env: 0.75, micro: 26, nScale: 0.35 },
  hair:    { roughness: 0.42, metalness: 0, env: 0.9,  micro: 30, nScale: 0.8 },
  cloth:   { roughness: 0.94, metalness: 0, env: 0.55, micro: 22, nScale: 1.1 },
  denim:   { roughness: 0.9,  metalness: 0, env: 0.5,  micro: 18, nScale: 1.3 },
  lycra:   { roughness: 0.46, metalness: 0, env: 1.0,  micro: 20, nScale: 0.5 },
  leather: { roughness: 0.48, metalness: 0, env: 1.1,  micro: 16, nScale: 0.6 },
  rubber:  { roughness: 0.95, metalness: 0, env: 0.45, micro: 24, nScale: 1.0 },
  metal:   { roughness: 0.24, metalness: 0.95, env: 2.0, micro: 8, nScale: 0.3 },
};

const matCache = new Map();
function mat(kind, color) {
  const key = `${kind}:${color}`;
  if (matCache.has(key)) return matCache.get(key);
  const p = SURFACES[kind] || SURFACES.cloth;
  const m = new THREE.MeshStandardMaterial({
    color, roughness: p.roughness, metalness: p.metalness, envMapIntensity: p.env,
  });
  m.name = kind;                       // readable in the material audit
  const micro = microSurface(p.micro);
  if (micro) {
    m.normalMap = micro.normal;
    m.normalScale = new THREE.Vector2(p.nScale, p.nScale);
    m.roughnessMap = micro.orm;        // multiplies — break-up only
    m.aoMap = micro.orm;
    m.aoMapIntensity = 0.3;
  }
  m.userData.gtbRealized = true;
  matCache.set(key, m);
  return m;
}

let blobTex = null;
function contactShadow(radius) {
  if (!blobTex) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,0.7)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
    blobTex = new THREE.CanvasTexture(c);
    blobTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    new THREE.MeshBasicMaterial({
      map: blobTex, color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false,
    })
  );
  m.material.userData.gtbRealized = true;
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  return m;
}

function add(parent, geometry, material, x, y, z) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

// --------------------------------------------------------------- the rig
// Joint layout, all in metres on a ~1.8 m body that is scaled to fit at the end:
//
//   root → hips → torso → neck → head → (bandana, hair, earrings)
//                      → shoulderL/R → upperArm → elbow → foreArm → hand
//        → hipL/R → thigh → knee → shin → foot
//
// Rotating the shoulder/hip pivots is all the walk cycle needs.
class Hoodrat extends THREE.Object3D {
  constructor(opts = {}) {
    super();
    const rnd = mulberry(opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0);
    const female = opts.sex === "f";
    const crew = CREWS[opts.crew] || CREWS.red;

    this.female = female;
    this.crew = opts.crew || "red";
    this.crewInfo = crew;

    const skin = mat("skin", SKIN_TONES[(rnd() * SKIN_TONES.length) | 0]);
    const white = mat("cloth", 0xeceae4);
    const denim = mat("denim", DENIM[(rnd() * DENIM.length) | 0]);
    const band = mat("cloth", crew.cloth);
    const legging = mat("lycra", crew.cloth);
    const chainMat = mat("metal", crew.chain);
    const hairMat = mat("hair", 0x16100d);
    const shoeWhite = mat("leather", 0xf2f0ec);
    const shoeAccent = mat("leather", crew.shoe);
    const sole = mat("rubber", 0xe6e3dc);

    // build variation — the women in the reference are leaner, the men wider
    const bulk = female ? 0.86 + rnd() * 0.1 : 1 + rnd() * 0.14;
    const shoulder = female ? 0.19 : 0.25;

    // ---- hips ----------------------------------------------------------
    const hips = new THREE.Object3D();
    hips.position.y = 0.92;
    this.add(hips);
    this.hips = hips;

    // ---- torso ---------------------------------------------------------
    const pelvis = add(hips, cyl(0.168 * bulk, 0.152 * bulk, 0.17, 12), female ? legging : denim, 0, -0.06, 0);
    pelvis.scale.z = 0.84;

    const torso = new THREE.Object3D();
    hips.add(torso);
    this.torso = torso;

    if (female) {
      // cropped tank: bare midriff, so the waist is skin and the chest cloth
      add(torso, cyl(0.15 * bulk, 0.17 * bulk, 0.22, 12), skin, 0, 0.11, 0);
      const chest = add(torso, cyl(0.19 * bulk, 0.158 * bulk, 0.3, 12), white, 0, 0.37, 0);
      chest.scale.z = 0.84;
      for (const side of [-1, 1]) {
        const b = add(torso, sph(0.062), white, side * 0.055, 0.35, 0.072 * bulk);
        b.scale.set(1, 0.85, 0.55);
        // scoop-neck strap over the shoulder
        const strap = add(torso, box(0.042, 0.16, 0.03), white, side * 0.105 * bulk, 0.5, 0.02);
        strap.rotation.z = side * 0.2;
      }
      // high waistband of the leggings
      const wb = add(torso, cyl(0.172 * bulk, 0.168 * bulk, 0.1, 12), legging, 0, -0.03, 0);
      wb.scale.z = 0.86;
    } else {
      // ribbed tank straight down over the waist, belt at the hips
      const chest = add(torso, cyl(0.2 * bulk, 0.185 * bulk, 0.56, 12), white, 0, 0.28, 0);
      chest.scale.z = 0.8;
      for (const side of [-1, 1]) {
        const strap = add(torso, box(0.05, 0.18, 0.032), white, side * 0.115 * bulk, 0.5, 0.015);
        strap.rotation.z = side * 0.17;
      }
      const belt = add(torso, cyl(0.19 * bulk, 0.19 * bulk, 0.075, 12), band, 0, -0.02, 0);
      belt.scale.z = 0.74;
      add(torso, box(0.085, 0.06, 0.03), chainMat, 0, -0.02, 0.14 * bulk);
    }

    // chain at the neck
    const chain = add(torso, torus(0.082, 0.011, 6, 18), chainMat, 0, 0.49, 0.055);
    chain.rotation.x = Math.PI / 2 - 0.42;
    chain.scale.z = 0.7;
    // the crucifix / pendant both references wear
    add(torso, box(0.022, 0.05, 0.012), chainMat, 0, 0.415, 0.135 * bulk);
    add(torso, box(0.042, 0.016, 0.012), chainMat, 0, 0.428, 0.135 * bulk);

    // ---- head ----------------------------------------------------------
    const neck = add(torso, cyl(0.055, 0.06, 0.1, 8), skin, 0, 0.58, 0);
    const head = new THREE.Object3D();
    head.position.y = 0.66;
    torso.add(head);
    this.head = head;

    const skull = add(head, sph(0.115), skin, 0, 0.055, 0);
    skull.scale.set(1, 1.12, 1.04);
    add(head, box(0.1, 0.075, 0.05), skin, 0, 0.02, 0.095);   // jaw / chin

    // eyes — small, but without them the head reads as a mannequin
    const eyeW = mat("cloth", 0xe9e4da);
    const pupil = mat("hair", 0x120d0a);
    for (const side of [-1, 1]) {
      const e = add(head, sph(0.019, 8, 6), eyeW, side * 0.042, 0.062, 0.098);
      e.scale.set(1.15, 0.8, 0.6);
      add(head, sph(0.0095, 6, 5), pupil, side * 0.044, 0.06, 0.111);
      const brow = add(head, box(0.038, 0.011, 0.016), hairMat, side * 0.044, 0.089, 0.1);
      brow.rotation.z = side * -0.12;
    }

    if (female) {
      // tied headband, tails to one side, plus a long fall of hair
      const hb = add(head, cyl(0.121, 0.121, 0.075, 14), band, 0, 0.12, 0);
      hb.scale.z = 1.02;
      const knot = add(head, sph(0.036), band, 0.105, 0.125, -0.055);
      knot.scale.set(1, 0.8, 1);
      for (let i = 0; i < 2; i++) {
        const tail = add(head, box(0.05, 0.16, 0.016), band, 0.125 + i * 0.02, 0.04 - i * 0.03, -0.075);
        tail.rotation.z = 0.5 + i * 0.35;
      }
      // Hair: a skull cap, one sheet falling down the back, and a slim strand
      // over each shoulder. The blue-crew reference is curly and the red is
      // straight, so the curly build gets a wider, wavier sheet.
      const curly = this.crew === "blue";
      const cap = add(head, sph(0.126), hairMat, 0, 0.045, -0.012);
      cap.scale.set(1.02, 1.06, 1.05);
      let y = -0.03;
      for (let i = 0; i < 4; i++) {
        const w = curly ? 0.2 - i * 0.012 : 0.17 - i * 0.018;
        const seg = add(head, box(w, 0.15, curly ? 0.075 : 0.055), hairMat,
          curly ? Math.sin(i * 2.3) * 0.016 : 0, y, -0.085 - i * 0.006);
        seg.rotation.z = curly ? Math.sin(i * 1.9) * 0.1 : 0;
        y -= 0.135;
      }
      for (const side of [-1, 1]) {
        const strand = add(head, box(0.05, 0.34, 0.05), hairMat, side * 0.105, -0.16, 0.005);
        strand.rotation.z = side * 0.05;
        if (curly) strand.scale.x = 1.3;
      }
      add(head, torus(0.042, 0.008, 6, 14), chainMat, 0.115, -0.01, 0.01);
      add(head, torus(0.042, 0.008, 6, 14), chainMat, -0.115, -0.01, 0.01);
    } else {
      // do-rag: skull cap with the two tails hanging down the back
      const cap = add(head, sph(0.121, 12, 8), band, 0, 0.062, -0.006);
      cap.scale.set(1, 0.92, 1.05);
      const knot = add(head, sph(0.04), band, 0, 0.055, -0.115);
      knot.scale.set(0.9, 0.8, 1);
      for (const side of [-1, 1]) {
        const tail = add(head, box(0.055, 0.2, 0.016), band, side * 0.035, -0.05, -0.125);
        tail.rotation.z = side * 0.18;
        tail.rotation.x = -0.22;
      }
      // short beard / goatee
      add(head, box(0.085, 0.05, 0.035), hairMat, 0, -0.028, 0.1);
    }

    // ---- arms ----------------------------------------------------------
    this.arms = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * shoulder * bulk, 0.47, 0);
      torso.add(pivot);
      const upper = add(pivot, cyl(0.052 * bulk, 0.045 * bulk, 0.26, 8), skin, 0, -0.13, 0);
      const delt = add(pivot, sph(0.072 * bulk), skin, 0, 0.012, 0);   // deltoid
      delt.scale.set(1, 1.15, 1);
      const elbow = new THREE.Object3D();
      elbow.position.y = -0.26;
      pivot.add(elbow);
      add(elbow, cyl(0.042 * bulk, 0.036 * bulk, 0.24, 8), skin, 0, -0.12, 0);
      add(elbow, sph(0.045), skin, 0, -0.25, 0);               // fist
      this.arms.push({ pivot, elbow, side });
    }

    // ---- legs ----------------------------------------------------------
    this.legs = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 0.105 * bulk, -0.02, 0);
      hips.add(pivot);

      const knee = new THREE.Object3D();
      knee.position.y = -0.44;
      pivot.add(knee);

      if (female) {
        // leggings: slim, continuous
        add(pivot, cyl(0.132 * bulk, 0.092 * bulk, 0.46, 10), legging, 0, -0.22, 0);
        add(knee, cyl(0.088 * bulk, 0.056 * bulk, 0.44, 10), legging, 0, -0.22, 0);
      } else {
        // baggy jeans: wide all the way down, stacked over the shoe
        add(pivot, cyl(0.118 * bulk, 0.126 * bulk, 0.46, 10), denim, 0, -0.22, 0);
        add(knee, cyl(0.126 * bulk, 0.134 * bulk, 0.46, 10), denim, 0, -0.22, 0);
      }

      // high-top sneaker: white upper, crew-coloured panel, pale sole
      const foot = new THREE.Object3D();
      foot.position.y = -0.44;
      knee.add(foot);
      add(foot, box(0.115, 0.09, 0.135), shoeWhite, 0, 0.045, 0.005);   // collar
      add(foot, box(0.12, 0.07, 0.26), shoeWhite, 0, -0.015, 0.045);    // upper
      add(foot, box(0.124, 0.035, 0.1), shoeAccent, 0, -0.012, -0.035); // heel panel
      add(foot, box(0.128, 0.042, 0.27), sole, 0, -0.052, 0.05);        // midsole
      this.legs.push({ pivot, knee, foot, side });
    }

    // the bandana hanging off the back pocket, as in the reference
    if (!female) {
      const rag = add(hips, box(0.11, 0.3, 0.02), band, 0.16 * bulk, -0.16, -0.055);
      rag.rotation.z = 0.14;
    }

    // ---- finish --------------------------------------------------------
    this.blob = contactShadow(0.3);
    this.add(this.blob);

    // normalise to the requested height
    const target = opts.height || (female ? 1.82 : 1.95);
    const raw = 1.86;
    this.scale.setScalar(target / raw);

    this._meshes = [];
    this.traverse((o) => { if (o.isMesh && o !== this.blob) this._meshes.push(o); });

    // animation state
    this.anim = "idle";
    this.time = 0;
    this.phase = rnd() * Math.PI * 2;
    this.finished = false;
    this.loop = true;
    this._yaw = opts.yaw != null ? opts.yaw : 0;
    this.rotation.y = this._yaw;
    this._last = new THREE.Vector3().copy(this.position);
    this._speed = 0;
    this._faded = false;

    // `material.opacity = x` is how the enemy system fades a corpse out. Fan it
    // across every part — cloning first, so one dying Hoodrat doesn't fade the
    // whole crew through the shared material cache.
    const self = this;
    this._opacity = 1;
    this.material = {
      get opacity() { return self._opacity; },
      set opacity(v) {
        self._opacity = v;
        if (!self._faded) {
          self._faded = true;
          for (const m of self._meshes) {
            m.material = m.material.clone();
            m.material.transparent = true;
            m.material.depthWrite = false;
          }
        }
        for (const m of self._meshes) m.material.opacity = Math.max(0, v);
      },
    };
  }

  /** Sprite-compatible. The crew colour is already in the geometry. */
  setTint() {}

  /** Sprite-compatible no-op: a 3D actor turns to face where it is walking. */
  setFlip() {}

  play(anim, { loop = true, force = false } = {}) {
    if (this.anim === anim && !force) return;
    this.anim = anim;
    this.loop = loop;
    this.time = 0;
    this.finished = false;
  }

  update(dt) {
    this.time += dt;

    // measure our own travel so the gait matches the actual ground speed and
    // we face the way we are going — no changes needed in updateEnemy()
    const dx = this.position.x - this._last.x;
    const dz = this.position.z - this._last.z;
    const moved = Math.hypot(dx, dz);
    this._speed = dt > 0 ? moved / dt : 0;
    if (moved > 1e-4) {
      const want = Math.atan2(dx, dz);
      let d = want - this._yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this._yaw += d * Math.min(1, dt * 9);
    }
    this._last.copy(this.position);

    const A = this.arms, L = this.legs;

    if (this.anim === "death") {
      // fold at the hips and topple; `finished` gates the fade in updateEnemy
      const t = Math.min(1, this.time / 0.75);
      const e = t * t * (3 - 2 * t);
      this.rotation.z = e * (Math.PI / 2) * 0.95;
      this.rotation.y = this._yaw;
      this.hips.position.y = 0.92 - e * 0.42;
      for (const l of L) { l.pivot.rotation.x = -e * 0.7; l.knee.rotation.x = e * 1.5; }
      for (const a of A) { a.pivot.rotation.x = e * 1.1; a.elbow.rotation.x = -e * 0.5; }
      if (t >= 1) this.finished = true;
      return;
    }

    this.rotation.z = 0;
    this.rotation.y = this._yaw;
    this.hips.position.y = 0.92;

    if (this.anim === "attack") {
      // alternating straight punches
      const p = this.time * 7;
      const jab = Math.max(0, Math.sin(p));
      const lead = Math.floor(p / Math.PI) % 2;
      A.forEach((a, i) => {
        const on = i === lead;
        a.pivot.rotation.x = on ? -1.5 * jab : -0.25;
        a.elbow.rotation.x = on ? -0.5 + jab * 0.45 : -0.8;
        a.pivot.rotation.z = a.side * (on ? 0.1 : 0.22);
      });
      L.forEach((l) => { l.pivot.rotation.x = 0; l.knee.rotation.x = 0.08; });
      this.torso.rotation.y = Math.sin(p) * 0.18;
      return;
    }

    if (this.anim === "hurt") {
      const t = Math.min(1, this.time / 0.32);
      const k = Math.sin(t * Math.PI);
      this.torso.rotation.x = -k * 0.4;
      A.forEach((a) => { a.pivot.rotation.x = k * 0.7; a.elbow.rotation.x = -k * 1.1; });
      if (t >= 1 && !this.loop) this.finished = true;
      return;
    }

    this.torso.rotation.x = 0;

    if (this.anim === "walk" && this._speed > 0.15) {
      // stride scales with speed, so a wandering Hoodrat ambles and a charging
      // one runs, off the same clip
      const rate = THREE.MathUtils.clamp(this._speed * 1.9, 3, 13);
      this.phase += dt * rate;
      const s = Math.sin(this.phase);
      const c = Math.cos(this.phase);
      const amp = THREE.MathUtils.clamp(this._speed * 0.13, 0.18, 0.62);

      L.forEach((l, i) => {
        const d = i ? s : -s;
        l.pivot.rotation.x = d * amp;
        l.knee.rotation.x = Math.max(0, (i ? -c : c) * amp * 1.15) + 0.05;
        l.foot.rotation.x = -l.knee.rotation.x * 0.45;
      });
      A.forEach((a, i) => {
        const d = i ? -s : s;
        a.pivot.rotation.x = d * amp * 0.75;
        a.pivot.rotation.z = a.side * 0.16;
        a.elbow.rotation.x = -0.3 - Math.max(0, d) * 0.45;
      });
      this.torso.rotation.y = -s * 0.1;
      this.position.y = Math.abs(Math.sin(this.phase * 2)) * 0.022;
      return;
    }

    // idle: slow breathing sway, arms loose, the reference's folded-arm stance
    const b = Math.sin(this.time * 1.6 + this.phase);
    L.forEach((l) => { l.pivot.rotation.x = 0; l.knee.rotation.x = 0.05; l.foot.rotation.x = 0; });
    A.forEach((a, i) => {
      a.pivot.rotation.x = -0.05 + b * 0.025;
      a.pivot.rotation.z = a.side * (0.13 + b * 0.015);
      a.elbow.rotation.x = -0.3 - (i ? 0.05 : 0);
    });
    this.torso.rotation.y = b * 0.045;
    this.position.y = 0;
  }
}

// --------------------------------------------------------------- factory
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build one Hoodrat.
 *
 * @param {object}  opts
 * @param {"m"|"f"} opts.sex     male / female build and outfit
 * @param {string}  opts.crew    "red" | "blue"
 * @param {number}  opts.seed    deterministic variation
 * @param {number}  opts.height  metres, head to heel
 */
export function makeHoodrat(opts = {}) {
  return new Hoodrat(opts);
}

/** A random member of the crew — used by the enemy spawner. */
export function randomHoodrat(rng = Math.random, height) {
  return new Hoodrat({
    sex: rng() < 0.5 ? "f" : "m",
    crew: rng() < 0.5 ? "red" : "blue",
    seed: (rng() * 1e9) | 0,
    yaw: rng() * Math.PI * 2,
    height,
  });
}
