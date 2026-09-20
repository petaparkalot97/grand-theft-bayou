// ---------------------------------------------------------------------------
// characters.js — the HOODRATS.
//
// Two crews, red and blue, built to the GTA San Andreas-style reference sheets:
//   men    paisley crew bandana (over the crown for red, a brow band over
//          cornrows for blue), goatee, white tank, leather belt, the crew
//          bandana hanging long from a front pocket, baggy stacked jeans, arm
//          tattoos; all-white low-tops (red) or white-and-navy high-tops (blue)
//   women  paisley headband, long hair (straight for red, spiral curls for
//          blue), gold hoops and a cross on a gold chain, white cropped tank,
//          bright crew leggings, colour-blocked crew high-tops
// Story characters pass their own palette object (opts.crew = {...}) and keep
// the classic look, so the cast doesn't change with the crew sheets.
//
// The same rig also dresses Rednecks (`randomRedneck`): flannel (`opts.plaid`),
// a trucker cap (`headwear: "cap"`) and work boots (`opts.shoe = "boots"`)
// instead of the crew's paisley / high-tops. It's one body builder shared by
// both factions plus the police (`makeDeputy`) and every named story
// character — only the palette and props change.
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
import { mergeRigid } from "./merge.js";

// --------------------------------------------------------------- palette
export const CREWS = {
  red:  { name: "Red",  cloth: 0xb3242c, accent: 0xd2434b, chain: 0xd4af37, shoe: 0xc0282e, legging: 0xc4292d,
          belt: 0x4a2c1c, maleShoe: "low", headStyle: "wrap", pocket: -1 },
  blue: { name: "Blue", cloth: 0x223f94, accent: 0x3a63c6, chain: 0xd4af37, shoe: 0x223f94, legging: 0x2946b8,
          belt: 0x141414, maleShoe: "high", headStyle: "cornrows", pocket: 1 },
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
/** The top of a sphere, down to polar angle `theta` (a skull cap with a level rim). */
const capGeo = (r, theta) => geo(`cap${r}|${theta}`, () => new THREE.SphereGeometry(r, 14, 10, 0, Math.PI * 2, 0, theta));
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

// Paisley bandana print, per crew colour: white teardrops with a dot, rings of
// small dots, thin black outlines. Tiled twice across each bandana part.
const printCache = new Map();
function paisleyMat(color) {
  if (printCache.has(color)) return printCache.get(color);
  const S = 256;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const base = "#" + new THREE.Color(color).getHexString();
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  const drop = (x, y, s, rot) => {
    g.save();
    g.translate(x, y); g.rotate(rot); g.scale(s, s);
    g.beginPath();
    g.moveTo(0, -18);
    g.bezierCurveTo(17, -15, 18, 9, 0, 18);
    g.bezierCurveTo(-13, 14, -11, -2, 4, -6);
    g.bezierCurveTo(8, -9, 4, -16, 0, -18);
    g.closePath();
    g.fillStyle = "#f4efe6"; g.fill();
    g.lineWidth = 2; g.strokeStyle = "#101010"; g.stroke();
    g.beginPath(); g.arc(3, 7, 5, 0, Math.PI * 2); g.fillStyle = base; g.fill();
    g.restore();
  };
  const dots = (x, y, r) => {
    g.fillStyle = "#f4efe6";
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      g.beginPath(); g.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 2.2, 0, Math.PI * 2); g.fill();
    }
  };
  for (const [x, y, s, r] of [[44, 48, 1.3, 0.4], [178, 70, 1.1, -0.9], [108, 160, 1.4, 2.2], [226, 196, 1.0, 1.1], [30, 214, 1.0, -2.4]]) drop(x, y, s, r);
  for (const [x, y, r] of [[120, 50, 14], [60, 130, 11], [200, 130, 12], [150, 232, 10]]) dots(x, y, r);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  const m = new THREE.MeshStandardMaterial({ name: "cloth", map: t, roughness: 0.92, envMapIntensity: 0.55 });
  m.userData.gtbRealized = true;
  printCache.set(color, m);
  return m;
}

// Pride stripes: the rainbow do-rags, headbands and tops on Frenchmen Street
// (randomGayMan / randomLesbian / makeDancer). One shared material.
let rainbowCache = null;
function rainbowMat() {
  if (rainbowCache) return rainbowCache;
  const c = document.createElement("canvas");
  c.width = 16; c.height = 96;
  const g = c.getContext("2d");
  ["#e40303", "#ff8c00", "#ffed00", "#008026", "#004dff", "#750787"].forEach((col, i) => { g.fillStyle = col; g.fillRect(0, i * 16, 16, 16); });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 1.5);
  rainbowCache = new THREE.MeshStandardMaterial({ name: "cloth", map: t, roughness: 0.85, envMapIntensity: 0.6 });
  rainbowCache.userData.gtbRealized = true;
  return rainbowCache;
}

// Flannel/plaid print for redneck-styled shirts: a crosshatch of two accent
// lines over a base colour, the same tiling trick as the paisley bandana.
const plaidCache = new Map();
function plaidMat(base, line) {
  const key = `${base}:${line}`;
  if (plaidCache.has(key)) return plaidCache.get(key);
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = "#" + new THREE.Color(base).getHexString();
  g.fillRect(0, 0, S, S);
  g.strokeStyle = "#" + new THREE.Color(line).getHexString();
  g.globalAlpha = 0.85;
  for (const w of [10, 3]) {
    g.lineWidth = w;
    for (const off of [0, 64]) {
      g.beginPath(); g.moveTo(0, off); g.lineTo(S, off); g.stroke();
      g.beginPath(); g.moveTo(off, 0); g.lineTo(off, S); g.stroke();
    }
  }
  g.globalAlpha = 0.35;
  g.lineWidth = 1;
  for (const off of [32, 96]) {
    g.beginPath(); g.moveTo(0, off); g.lineTo(S, off); g.stroke();
    g.beginPath(); g.moveTo(off, 0); g.lineTo(off, S); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  const m = new THREE.MeshStandardMaterial({ name: "cloth", map: t, roughness: 0.9, envMapIntensity: 0.55 });
  m.userData.gtbRealized = true;
  plaidCache.set(key, m);
  return m;
}

// Arm-sleeve tattoos: dark ink drawn on white, multiplied by the skin tone, so
// one texture works on every skin. Script, a rose, praying hands, stars.
let tattooTex = null;
const inkCache = new Map();
function tattooMat(skinColor) {
  if (inkCache.has(skinColor)) return inkCache.get(skinColor);
  if (!tattooTex) {
    const c = document.createElement("canvas");
    c.width = 256; c.height = 512;
    const g = c.getContext("2d");
    g.fillStyle = "#ffffff"; g.fillRect(0, 0, 256, 512);
    g.strokeStyle = g.fillStyle = "rgba(34,26,22,.88)";
    g.lineWidth = 5;
    g.font = "italic bold 40px Georgia, serif";
    g.fillText("Family", 20, 70); g.fillText("First", 60, 118);
    g.font = "italic bold 30px Georgia, serif";
    g.fillText("Good Men", 20, 300); g.fillText("Still Exist", 30, 338);
    // a rose: spiral petals and two leaves
    g.beginPath();
    for (let a = 0; a < Math.PI * 6; a += 0.2) g.lineTo(150 + Math.cos(a) * a * 3.2, 200 + Math.sin(a) * a * 3.2);
    g.stroke();
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(150 + s * 50, 240, 26, 10, s * 0.6, 0, Math.PI * 2); g.fill(); }
    // praying hands, simplified
    g.beginPath(); g.ellipse(90, 430, 22, 60, -0.15, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(118, 430, 22, 60, 0.15, 0, Math.PI * 2); g.fill();
    // stars
    for (const [x, y] of [[210, 40], [30, 170], [220, 440], [200, 380]]) {
      g.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 7 : 16, a = (i / 10) * Math.PI * 2 - Math.PI / 2; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      g.closePath(); g.fill();
    }
    tattooTex = new THREE.CanvasTexture(c);
    tattooTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = mat("skin", skinColor).clone();
  m.map = tattooTex;
  m.userData.gtbRealized = true;
  inkCache.set(skinColor, m);
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
    // `crew` is a crew name, or a palette object for the story characters
    const crew = typeof opts.crew === "object"
      ? { ...CREWS.red, ...opts.crew }
      : CREWS[opts.crew] || CREWS.red;
    const headwear = opts.headwear || "band";      // "band" | "none" | "hat" | "cap"

    this.female = female;
    this.crew = typeof opts.crew === "object" ? "custom" : opts.crew || "red";
    this.crewInfo = crew;
    // crew members follow the reference sheets; story characters (a palette
    // object) keep the classic look, and their seeds build the same bodies
    const styled = typeof opts.crew !== "object";

    // draw both tones even when overridden, so a seed builds the same body
    const skinTone = SKIN_TONES[(rnd() * SKIN_TONES.length) | 0];
    const denimTone = DENIM[(rnd() * DENIM.length) | 0];
    const skin = mat("skin", opts.skin != null ? opts.skin : skinTone);
    // opts.plaid: a redneck-styled flannel shirt instead of a flat tank colour
    const white = opts.plaid
      ? plaidMat(opts.plaidBase != null ? opts.plaidBase : 0x8a2e2e, opts.plaidLine != null ? opts.plaidLine : 0x2c2c2c)
      : opts.top === "rainbow" ? rainbowMat()
      : mat("cloth", opts.top != null ? opts.top : 0xeceae4);
    const denim = mat("denim", opts.denim != null ? opts.denim : denimTone);
    const band = opts.rainbow ? rainbowMat() : styled ? paisleyMat(crew.cloth) : mat("cloth", crew.cloth);
    const legging = mat("lycra", styled && crew.legging != null ? crew.legging : crew.cloth);
    const chainMat = mat("metal", crew.chain);
    const hairMat = mat("hair", opts.hair != null ? opts.hair : 0x16100d);
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
      // the reference belts are plain leather with a silver buckle
      const belt = add(torso, cyl(0.19 * bulk, 0.19 * bulk, 0.07, 12), styled ? mat("leather", crew.belt) : band, 0, -0.02, 0);
      belt.scale.z = 0.74;
      add(torso, box(0.085, 0.06, 0.03), styled ? mat("metal", 0xcfd3da) : chainMat, 0, -0.02, 0.14 * bulk);
    }

    // chain at the neck: the women's sheet has a gold chain and cross; the men's
    // mostly go without (a third wear a plain chain)
    if (!styled || female || rnd() < 0.35) {
      const chain = add(torso, torus(0.082, 0.011, 6, 18), chainMat, 0, 0.49, 0.055);
      chain.rotation.x = Math.PI / 2 - 0.42;
      chain.scale.z = 0.7;
      if (!styled || female) {
        add(torso, box(0.022, 0.05, 0.012), chainMat, 0, 0.415, 0.135 * bulk);
        add(torso, box(0.042, 0.016, 0.012), chainMat, 0, 0.428, 0.135 * bulk);
      }
    }

    if (opts.police) {
      const badgeGold = mat("metal", 0xd4af37);
      add(torso, box(0.04, 0.045, 0.015), badgeGold, -0.075 * bulk, 0.38, 0.12 * bulk);
      const dutyBeltMat = mat("leather", 0x181818);
      const holsterMat = mat("leather", 0x101010);
      const radioMat = mat("rubber", 0x1f1f1f);
      add(torso, cyl(0.20 * bulk, 0.20 * bulk, 0.08, 12), dutyBeltMat, 0, -0.02, 0);
      add(torso, box(0.065, 0.11, 0.05), holsterMat, 0.16 * bulk, -0.04, 0);
      add(torso, box(0.04, 0.09, 0.035), radioMat, -0.15 * bulk, -0.02, 0);
    }

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
      if (headwear === "band") {
        // tied headband, tails to one side
        const hb = add(head, cyl(0.121, 0.121, 0.075, 14), band, 0, 0.12, 0);
        hb.scale.z = 1.02;
        const knot = add(head, sph(0.036), band, 0.105, 0.125, -0.055);
        knot.scale.set(1, 0.8, 1);
        for (let i = 0; i < 2; i++) {
          const tail = add(head, box(0.05, 0.16, 0.016), band, 0.125 + i * 0.02, 0.04 - i * 0.03, -0.075);
          tail.rotation.z = 0.5 + i * 0.35;
        }
      }
      // Hair: a skull cap, one sheet falling down the back, and a slim strand
      // over each shoulder. The blue-crew reference is curly and the red is
      // straight, so the curly build gets a wider, wavier sheet.
      const curly = opts.curly != null ? opts.curly : this.crew === "blue";
      const cap = add(head, sph(0.126), hairMat, 0, 0.045, -0.012);
      cap.scale.set(1.02, 1.06, 1.05);
      let y = -0.03;
      // opts.shortHair: a pixie / undercut — the cap alone, nothing down the back
      const lengths = opts.shortHair ? 0 : styled ? 5 : 4;   // the sheet's hair falls to the lower back
      for (let i = 0; i < lengths; i++) {
        const w = curly ? 0.2 - i * 0.012 : 0.17 - i * 0.018;
        const seg = add(head, box(w, 0.15, curly ? 0.075 : 0.055), hairMat,
          curly ? Math.sin(i * 2.3) * 0.016 : 0, y, -0.085 - i * 0.006);
        seg.rotation.z = curly ? Math.sin(i * 1.9) * 0.1 : 0;
        y -= 0.135;
      }
      for (const side of opts.shortHair ? [] : [-1, 1]) {
        const strand = add(head, box(0.05, 0.34, 0.05), hairMat, side * 0.105, -0.16, 0.005);
        strand.rotation.z = side * 0.05;
        if (curly) strand.scale.x = 1.3;
      }
      if (styled && curly && !opts.shortHair) {
        // spiral curls: bumps down the back and over the shoulders
        for (let i = 0; i < 16; i++) {
          add(head, sph(0.032, 6, 5), hairMat, ((i % 4) - 1.5) * 0.05, -0.02 - i * 0.042, -0.125 - (i % 3) * 0.012);
        }
        for (const side of [-1, 1]) {
          for (let i = 0; i < 5; i++) add(head, sph(0.03, 6, 5), hairMat, side * (0.115 + (i % 2) * 0.012), -0.04 - i * 0.07, 0.01);
        }
      }
      add(head, torus(0.042, 0.008, 6, 14), chainMat, 0.115, -0.01, 0.01);
      add(head, torus(0.042, 0.008, 6, 14), chainMat, -0.115, -0.01, 0.01);
    } else {
      // Hair and cloth cover the crown only. The skull tops out at y ≈ 0.184 and the
      // eyebrows reach y ≈ 0.095, so every cap follows the skull's shape down to a level
      // rim at y ≈ 0.105: the eyes and brows stay visible, as on the reference sheet.
      // (Full spheres centred at eye height used to bury the eyes.)
      const crown = (m, r) => {
        const c = add(head, capGeo(r, 1.2), m, 0, 0.055, 0);
        c.scale.set(1, 1.12, 1.04);
        return c;
      };
      if (headwear === "band" && styled) {
        // the men's sheet: a paisley bandana either over the whole crown
        // (red's usual) or folded into a brow band over cornrows (blue's usual)
        const style = rnd() < 0.7 ? crew.headStyle : crew.headStyle === "wrap" ? "cornrows" : "wrap";
        if (style === "cornrows") {
          crown(hairMat, 0.121);
          for (let i = -2; i <= 2; i++) {
            const row = add(head, box(0.02, 0.026, 0.25), hairMat, i * 0.04, 0.188 - Math.abs(i) * 0.03, -0.018);
            row.rotation.z = i * 0.3;
            row.rotation.x = 0.1;
          }
          const brow = add(head, cyl(0.096, 0.117, 0.042, 16), band, 0, 0.124, 0);   // high on the forehead
          brow.scale.z = 1.05;
        } else {
          crown(band, 0.124);
          const brow = add(head, cyl(0.1, 0.119, 0.04, 16), band, 0, 0.12, 0);       // the folded edge at the rim
          brow.scale.z = 1.05;
        }
        // knot and short tails at the back, just off-centre
        const knot = add(head, sph(0.034), band, -0.045, 0.12, -0.11);
        knot.scale.set(1, 0.8, 0.9);
        for (let i = 0; i < 2; i++) {
          const tail = add(head, box(0.045, 0.12, 0.014), band, -0.06 + i * 0.03, 0.06, -0.12);
          tail.rotation.z = -0.35 + i * 0.5;
          tail.rotation.x = -0.25;
        }
        if (rnd() < 0.5) {
          // small stud earrings
          for (const side of [-1, 1]) add(head, sph(0.011, 6, 5), mat("metal", 0xe8e2d0), side * 0.118, 0.02, 0.01);
        }
      } else if (headwear === "band") {
        // do-rag: a crown cap with the two tails hanging down the back
        crown(band, 0.122);
        const knot = add(head, sph(0.04), band, 0, 0.1, -0.11);
        knot.scale.set(0.9, 0.8, 1);
        for (const side of [-1, 1]) {
          const tail = add(head, box(0.055, 0.2, 0.016), band, side * 0.035, 0.0, -0.12);
          tail.rotation.z = side * 0.18;
          tail.rotation.x = -0.22;
        }
      } else {
        // close-cropped hair
        crown(hairMat, 0.119);
      }
      if (opts.beard !== false) {
        // short beard / goatee
        add(head, box(0.085, 0.05, 0.035), hairMat, 0, -0.028, 0.1);
      }
    }

    if (headwear === "hat") {
      // wide-brimmed campaign hat: the sheriff's, or anyone's in the sun
      const felt = mat("leather", crew.hat != null ? crew.hat : 0x8a6a44);
      const brim = add(head, cyl(0.24, 0.24, 0.018, 20), felt, 0, 0.13, 0);
      brim.scale.z = 1.08;
      add(head, cyl(0.105, 0.13, 0.12, 16), felt, 0, 0.2, 0);
      add(head, cyl(0.133, 0.133, 0.03, 16), band, 0, 0.155, 0);
      if (opts.police) {
        const badgeGold = mat("metal", 0xd4af37);
        add(head, box(0.028, 0.032, 0.012), badgeGold, 0, 0.165, 0.138);
      }
    }

    if (headwear === "cap") {
      // redneck-styled trucker/baseball cap: a rounded crown and a flat brim
      // over the front only (unlike "hat"'s full 360° brim)
      const capMat = mat("cloth", opts.capColor != null ? opts.capColor : 0x2c2c2c);
      const dome = add(head, capGeo(0.128, 1.25), capMat, 0, 0.06, 0);
      dome.scale.set(1.03, 1.05, 1.06);
      const brim = add(head, box(0.16, 0.014, 0.11), capMat, 0, 0.09, 0.165);
      brim.rotation.x = -0.12;
      // a small snapback strap at the back
      add(head, box(0.06, 0.03, 0.012), mat("leather", 0x3a3a3a), 0, 0.045, -0.135);
    }

    // ---- arms ----------------------------------------------------------
    // most crew men have both arms sleeved in ink, like the sheet
    const inked = styled && !female && rnd() < 0.8 ? tattooMat(opts.skin != null ? opts.skin : skinTone) : null;
    this.arms = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * shoulder * bulk, 0.47, 0);
      torso.add(pivot);
      const upper = add(pivot, cyl(0.052 * bulk, 0.045 * bulk, 0.26, 8), inked || skin, 0, -0.13, 0);
      const delt = add(pivot, sph(0.072 * bulk), skin, 0, 0.012, 0);   // deltoid
      delt.scale.set(1, 1.15, 1);
      const elbow = new THREE.Object3D();
      elbow.position.y = -0.26;
      pivot.add(elbow);
      add(elbow, cyl(0.042 * bulk, 0.036 * bulk, 0.24, 8), inked || skin, 0, -0.12, 0);
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

      const foot = new THREE.Object3D();
      foot.position.y = -0.44;
      knee.add(foot);
      const shoe = opts.shoe || (!styled ? "classic" : female ? "high" : crew.maleShoe);
      if (shoe === "boots") {
        // plain work boots: a taller leather shaft over a thick heel
        const bootMat = mat("leather", opts.bootColor != null ? opts.bootColor : 0x3d2b1c);
        add(foot, cyl(0.098, 0.11, 0.22, 10), bootMat, 0, 0.06, 0.01);   // shaft
        add(foot, box(0.12, 0.07, 0.26), bootMat, 0, -0.015, 0.045);    // upper/toe
        add(foot, box(0.128, 0.05, 0.27), sole, 0, -0.056, 0.05);       // thick heel
      } else if (shoe === "low") {
        // all-white low-tops (the red sheet)
        add(foot, box(0.115, 0.05, 0.12), shoeWhite, 0, 0.02, -0.005);   // low collar
        add(foot, box(0.12, 0.07, 0.26), shoeWhite, 0, -0.015, 0.045);   // upper
        add(foot, box(0.128, 0.042, 0.27), sole, 0, -0.052, 0.05);       // midsole
      } else if (shoe === "high") {
        // colour-blocked high-tops: crew collar, heel and side stripe on a white toe
        add(foot, box(0.118, 0.1, 0.13), shoeAccent, 0, 0.05, 0.005);   // collar
        add(foot, box(0.12, 0.07, 0.26), shoeWhite, 0, -0.015, 0.045);  // upper
        add(foot, box(0.124, 0.05, 0.11), shoeAccent, 0, -0.005, -0.03); // heel panel
        for (const s of [-1, 1]) {
          const stripe = add(foot, box(0.006, 0.026, 0.15), shoeAccent, s * 0.062, 0, 0.06);
          stripe.rotation.x = -0.35;                                     // the side stripe, roughly
        }
        add(foot, box(0.128, 0.042, 0.27), sole, 0, -0.052, 0.05);
      } else {
        // high-top sneaker: white upper, crew-coloured panel, pale sole
        add(foot, box(0.115, 0.09, 0.135), shoeWhite, 0, 0.045, 0.005);   // collar
        add(foot, box(0.12, 0.07, 0.26), shoeWhite, 0, -0.015, 0.045);    // upper
        add(foot, box(0.124, 0.035, 0.1), shoeAccent, 0, -0.012, -0.035); // heel panel
        add(foot, box(0.128, 0.042, 0.27), sole, 0, -0.052, 0.05);        // midsole
      }
      this.legs.push({ pivot, knee, foot, side });
    }

    // the bandana hanging off the back pocket, as in the reference
    if (!female && headwear === "band") {
      if (styled) {
        // hanging long from a front pocket: left for red, right for blue
        const s = crew.pocket || 1;
        // outside the baggy jeans (their radius is ~0.13 at the thigh), hanging to mid-thigh
        const rag = add(hips, box(0.11, 0.4, 0.02), band, s * 0.215 * bulk, -0.24, 0.05);
        rag.rotation.z = s * 0.08;
        rag.rotation.y = s * 0.45;
      } else {
        const rag = add(hips, box(0.11, 0.3, 0.02), band, 0.16 * bulk, -0.16, -0.055);
        rag.rotation.z = 0.14;
      }
    }

    // ---- finish --------------------------------------------------------
    this.blob = contactShadow(0.3);
    this.add(this.blob);

    // normalise to the requested height
    const target = opts.height || (female ? 1.82 : 1.95);
    const raw = 1.86;
    this.scale.setScalar(target / raw);

    // ~50 parts but only a dozen joints move: bake the parts riding each joint
    // into one mesh per material. Same silhouette, roughly a third of the draw
    // calls in every pass (shadows, main view, AO, road mirror).
    mergeRigid(this, [
      hips, torso,
      ...this.arms.flatMap((a) => [a.pivot, a.elbow]),
      ...this.legs.flatMap((l) => [l.pivot, l.knee, l.foot]),
    ]);

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
    this.hips.rotation.set(0, 0, 0);       // only the dance clips below tip the pelvis
    this.head.rotation.set(0, 0, 0);

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

    if (this.anim === "twerk" || this.anim === "grind" || this.anim === "dance" || this.anim === "sit" || this.anim === "kiss" || this.anim === "ride") {
      this.position.y = this.baseY || 0;
      danceClip(this, dt);
      return;
    }

    if (this.anim === "aim" || this.anim === "shoot") {
      const recoil = this.anim === "shoot" ? Math.max(0, 1 - this.time / 0.15) : 0;
      this.torso.rotation.y = 0.4;
      
      // Right arm holds weapon
      A[1].pivot.rotation.x = -1.57 + recoil * 0.2;
      A[1].pivot.rotation.z = 0.1;
      A[1].elbow.rotation.x = -0.1 - recoil * 0.3;
      
      // Left arm supports
      A[0].pivot.rotation.x = -1.3;
      A[0].pivot.rotation.z = -0.4;
      A[0].elbow.rotation.x = -1.2;
      
      // Legs planted
      L.forEach((l) => { l.pivot.rotation.x = 0; l.knee.rotation.x = 0.1; l.foot.rotation.x = 0; });
      this.position.y = this.baseY || 0;
      
      if (this.anim === "shoot" && this.time > 0.15) {
        this.anim = "aim"; // go back to aim after recoil
      }
      return;
    }

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
      // `baseY` is the floor this actor stands on (0 = the ground); story
      // scenes set it for rooms that aren't at ground level
      this.position.y = (this.baseY || 0) + Math.abs(Math.sin(this.phase * 2)) * 0.022;
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
    this.position.y = this.baseY || 0;
  }
}

// --------------------------------------------------------------- club clips
// The nightlife clips (nightlife.js). Leg rig: the thighs hang from the hips, the
// shins from the knees (0.44 m each). A squat with the thigh `th` radians forward
// and the knee bent 2·th keeps the foot under the hip, and the hip drops
// 0.88·(1 − cos th). When the pelvis is tipped (`h`), the thighs take −h so the
// legs don't swing with it, and the torso takes (lean − h) so the chest holds
// its angle while only the hips move — that isolation is the whole dance.
function squat(r, th, h) {
  r.hips.position.y = 0.92 - 0.88 * (1 - Math.cos(th));
  r.hips.rotation.x = h;
  for (const l of r.legs) {
    l.pivot.rotation.x = -th - h;
    l.knee.rotation.x = 2 * th;
    l.foot.rotation.x = -th;
  }
}
function danceClip(r, dt) {
  const A = r.arms, t = r.time;
  if (r.anim === "twerk") {
    // NOLA bounce: a low squat, hands on the knees, the hips popping ~3.6 times a
    // second (pelvis tilting back and forth) with a little bounce on every pop
    const p = t * Math.PI * 2 * 3.6;
    const h = 0.18 + Math.sin(p) * 0.32;
    squat(r, 0.72 + Math.abs(Math.sin(p)) * 0.05, h);
    r.torso.rotation.x = 0.78 - h;
    r.torso.rotation.y = Math.sin(t * 1.3) * 0.12;
    A.forEach((a) => { a.pivot.rotation.x = -0.95; a.pivot.rotation.z = a.side * 0.12; a.elbow.rotation.x = -0.25; });
    r.head.rotation.x = -0.35;        // chin up, looking over her shoulder
    r.head.rotation.y = Math.sin(t * 0.9) * 0.5;
    return;
  }
  if (r.anim === "grind") {
    // the lap dance: slow hip circles over the chair, one hand behind the head
    const p = t * Math.PI * 2 * 0.85;
    squat(r, 0.42 + Math.sin(p) * 0.12, Math.sin(p) * 0.16);
    r.hips.rotation.z = Math.cos(p) * 0.16;
    r.torso.rotation.x = 0.12 - Math.sin(p) * 0.16;
    r.torso.rotation.z = -Math.cos(p) * 0.12;
    A[0].pivot.rotation.x = -2.7; A[0].pivot.rotation.z = -0.4; A[0].elbow.rotation.x = -1.6;
    A[1].pivot.rotation.x = -0.5 + Math.sin(p) * 0.2; A[1].pivot.rotation.z = 0.25; A[1].elbow.rotation.x = -0.6;
    r.head.rotation.z = Math.sin(p) * 0.18;
    return;
  }
  if (r.anim === "dance") {
    // the floor: knees bouncing on the beat, arms up and waving, a twist
    const p = t * Math.PI * 2 * 1.9 + r.phase;
    squat(r, 0.16 + Math.abs(Math.sin(p)) * 0.14, 0);
    r.torso.rotation.y = Math.sin(p * 0.5) * 0.35;
    A.forEach((a, i) => {
      const up = Math.sin(p + i * Math.PI) > 0;
      a.pivot.rotation.x = up ? -2.6 : -1.2;
      a.pivot.rotation.z = a.side * (0.3 + Math.sin(p * 0.5) * 0.15);
      a.elbow.rotation.x = up ? -0.3 : -1.1;
    });
    r.head.rotation.x = Math.sin(p) * 0.12;
    return;
  }
  if (r.anim === "ride") {
    // astride a bike (bikes.js): hips on the seat (main.js sets rideHip / rideLean
    // from the bike's definition), knees up to the pegs, hands on the bars
    r.hips.position.y = r.rideHip || 0.9;
    for (const l of r.legs) { l.pivot.rotation.x = -1.05; l.knee.rotation.x = 1.25; l.foot.rotation.x = -0.2; }
    r.torso.rotation.x = r.rideLean != null ? r.rideLean : 0.3;
    A.forEach((a) => { a.pivot.rotation.x = -1.2 - (r.rideLean || 0) * 0.6; a.pivot.rotation.z = a.side * 0.16; a.elbow.rotation.x = -0.35; });
    return;
  }
  if (r.anim === "sit") {
    // in the chair (the lap-dance seat): thighs level, shins down, hands on the knees
    r.hips.position.y = 0.52;
    for (const l of r.legs) { l.pivot.rotation.x = -1.5; l.knee.rotation.x = 1.5; l.foot.rotation.x = 0; }
    r.torso.rotation.x = -0.12;
    A.forEach((a) => { a.pivot.rotation.x = -0.75; a.pivot.rotation.z = a.side * 0.18; a.elbow.rotation.x = -0.55; });
    return;
  }
  // kiss: lean in over the seat and tilt the head
  const k = Math.min(1, r.time / 0.6);
  const e = k * k * (3 - 2 * k);
  squat(r, 0.25 * e, 0);
  r.torso.rotation.x = 0.55 * e;
  r.head.rotation.x = 0.15 * e;
  r.head.rotation.z = 0.35 * e;
  A.forEach((a) => { a.pivot.rotation.x = -1.1 * e; a.pivot.rotation.z = a.side * 0.35; a.elbow.rotation.x = -0.9 * e; });
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

const PLAID_PAIRS = [
  [0x8a2e2e, 0x2c2c2c], [0x2e4a2e, 0x1c1c1c], [0x2e3a6a, 0xd8d0c0],
  [0x6a4a2e, 0x2c2c2c], [0x3a3a3a, 0xb02020],
];
const REDNECK_DENIM = [0x3a3428, 0x4a4436, 0x2c281f];
const REDNECK_SKIN = [0xd8a878, 0xc79a74, 0xe0b48e, 0xb08258];

/**
 * A random redneck: same rig as `Hoodrat`, dressed for the other faction —
 * a flannel shirt, work jeans, a trucker cap or bare head, and boots.
 * Distinct clothing set, not a distinct class; palette overrides win, so
 * story characters (Mally, Bubba) can still take a specific look.
 */
export function randomRedneck(rng = Math.random, height, opts = {}) {
  const [plaidBase, plaidLine] = PLAID_PAIRS[(rng() * PLAID_PAIRS.length) | 0];
  return new Hoodrat({
    sex: rng() < 0.25 ? "f" : "m",
    crew: { cloth: 0x5a4a34, chain: 0xaaaaaa, shoe: 0x3d2b1c, hat: 0x4a3a28 },
    seed: (rng() * 1e9) | 0,
    yaw: rng() * Math.PI * 2,
    skin: REDNECK_SKIN[(rng() * REDNECK_SKIN.length) | 0],
    denim: REDNECK_DENIM[(rng() * REDNECK_DENIM.length) | 0],
    plaid: true,
    plaidBase, plaidLine,
    headwear: rng() < 0.6 ? "cap" : "none",
    shoe: "boots",
    height,
    ...opts,
  });
}

/** Build a 3D Parish Deputy / Police Officer on foot. */
export function makeDeputy(opts = {}) {
  return new Hoodrat({
    sex: "m",
    seed: opts.seed != null ? opts.seed : 911,
    skin: opts.skin || 0xc79a74,
    top: 0x9c8660,           // khaki / tan deputy uniform shirt
    denim: 0x3d3a34,         // dark brown/navy trousers
    headwear: "hat",         // campaign hat
    police: true,            // star badge + duty belt + holster + radio
    beard: false,
    crew: { cloth: 0x2e2a22, chain: 0xaaaaaa, shoe: 0x1a1917, hat: 0x6b5a3e },
    ...opts,
  });
}

const PROSTITUTE_TOPS = [0xe62b7e, 0x9b27b0, 0xff5722, 0xe91e63, 0x00bcd4, 0xffeb3b];
const PROSTITUTE_BOTTOMS = [0x111111, 0x881144, 0x221144, 0xcc2277];

/** A random prostitute walking the streets at night. */
export function randomProstitute(rng = Math.random, height, opts = {}) {
  const top = PROSTITUTE_TOPS[(rng() * PROSTITUTE_TOPS.length) | 0];
  const denim = PROSTITUTE_BOTTOMS[(rng() * PROSTITUTE_BOTTOMS.length) | 0];
  return new Hoodrat({
    sex: "f",
    seed: (rng() * 1e9) | 0,
    yaw: rng() * Math.PI * 2,
    skin: SKIN_TONES[(rng() * SKIN_TONES.length) | 0],
    top,
    denim,
    headwear: "band",
    curly: rng() < 0.5,
    crew: { cloth: top, chain: 0xd4af37, shoe: top, legging: denim },
    height,
    ...opts,
  });
}
export function makeHobo(opts = {}) {
  const crew = { primary: 0x4a4a40, sec: 0x3d4133 }; // dirty, drab colors
  return new Hoodrat({ ...opts, crew, headwear: "hat" });
}

export function randomHobo(rng = Math.random, height) {
  return new Hoodrat({
    sex: rng() < 0.2 ? "f" : "m",
    crew: { primary: 0x504a40, sec: 0x353a30 },
    headwear: rng() < 0.5 ? "hat" : "cap",
    seed: (rng() * 1e9) | 0,
    yaw: rng() * Math.PI * 2,
    height,
  });
}

// --------------------------------------------------------------- Frenchmen Street
// OrleaRouge's out crowd (nightlife.js, and the city's sidewalks): same rig, their
// own wardrobe. Gay men run bright — crop tanks, pastel and rainbow, white or
// light-wash jeans, bleached or dyed hair or a rainbow do-rag, clean-shaven or a
// neat beard. Lesbians run flannel, denim and boots — short hair, a backwards cap
// or a rainbow headband. Palette overrides win, as for every other builder.
const pickOf = (rng, arr) => arr[(rng() * arr.length) | 0];
const ALL_SKIN = [...SKIN_TONES, ...REDNECK_SKIN];
const GAY_TOPS = ["rainbow", 0xff4fb3, 0x2ee6d6, 0xf4f1ea, 0x9b5de5, 0xffd23a, 0x151515, 0xff8a65];
const GAY_JEANS = [0xa9c1dc, 0xf2efe8, 0x161616, 0x6b8cb2, 0xd9b7d8];
const GAY_HAIR = [0x16100d, 0xeadcae, 0xff8fc8, 0x4a2c1a, 0xb8a9e8, 0xf4f1ea];

export function randomGayMan(rng = Math.random, height, opts = {}) {
  const top = pickOf(rng, GAY_TOPS);
  const accent = top === "rainbow" ? 0xff4fb3 : top;
  return new Hoodrat({
    sex: "m",
    seed: (rng() * 1e9) | 0,
    yaw: rng() * Math.PI * 2,
    skin: pickOf(rng, ALL_SKIN),
    top,
    denim: pickOf(rng, GAY_JEANS),
    hair: pickOf(rng, GAY_HAIR),
    headwear: rng() < 0.35 ? "band" : "none",
    rainbow: true,
    beard: rng() < 0.4,
    crew: { cloth: accent, accent, chain: rng() < 0.5 ? 0xd4af37 : 0xd8d8d8, shoe: 0xf2f0ec, belt: 0x141414, maleShoe: "low" },
    height,
    ...opts,
  });
}

const FLANNEL_PAIRS = [[0x2e4a6a, 0x151515], [0x7a2e3e, 0x151515], [0x2e5a3a, 0xd8d0c0], [0x5a2e7a, 0x151515], [0x8a5a2e, 0x2c2c2c]];
const LESBIAN_HAIR = [0x16100d, 0x4a2c1a, 0x8a2e2e, 0x2e5a8a, 0xeadcae, 0x6a3a8a];

export function randomLesbian(rng = Math.random, height, opts = {}) {
  const flannel = rng() < 0.6;
  const [plaidBase, plaidLine] = pickOf(rng, FLANNEL_PAIRS);
  const hw = rng();
  return new Hoodrat({
    sex: "f",
    seed: (rng() * 1e9) | 0,
    yaw: rng() * Math.PI * 2,
    skin: pickOf(rng, ALL_SKIN),
    plaid: flannel, plaidBase, plaidLine,
    top: flannel ? undefined : pickOf(rng, ["rainbow", 0x151515, 0xf4f1ea, 0x3a6ea5]),
    denim: pickOf(rng, [0x3a4a6a, 0x161616, 0x5d7ea6, 0x4a4436]),
    hair: pickOf(rng, LESBIAN_HAIR),
    shortHair: rng() < 0.7,
    headwear: hw < 0.3 ? "cap" : hw < 0.5 ? "band" : "none",
    capColor: pickOf(rng, [0x151515, 0x2e4a6a, 0x7a2e3e]),
    rainbow: true,
    shoe: "boots",
    crew: { cloth: 0x2e2e36, chain: 0xc0c0c0, shoe: 0x2a1c14, legging: 0x2e2e36 },
    height,
    ...opts,
  });
}

/** A club dancer: sequins-bright top and short bottoms, glitter-gold chain. */
export function makeDancer(opts = {}) {
  const rng = mulberry(opts.seed != null ? opts.seed : (Math.random() * 1e9) | 0);
  const female = opts.sex !== "m";
  const top = opts.top != null ? opts.top : pickOf(rng, [0xff2e93, 0xffd23a, 0x2ee6d6, 0xe8e8e8, 0x9b27b0, "rainbow", 0x111111]);
  const bottom = pickOf(rng, [0x111111, 0xff2e93, 0x6a1b9a, 0xd4af37, 0x1a1a3a]);
  return new Hoodrat({
    sex: female ? "f" : "m",
    seed: (rng() * 1e9) | 0,
    skin: pickOf(rng, ALL_SKIN),
    top,
    denim: bottom,
    hair: pickOf(rng, female ? [0x16100d, 0x8a2e2e, 0xeadcae, 0xff8fc8, 0x4a2c1a] : [0x16100d, 0xeadcae, 0x4a2c1a]),
    headwear: female ? (rng() < 0.4 ? "band" : "none") : "none",
    rainbow: top === "rainbow",
    curly: rng() < 0.5,
    beard: false,
    crew: { cloth: top === "rainbow" ? 0xff2e93 : top, accent: top === "rainbow" ? 0xff2e93 : top, chain: 0xd4af37, shoe: bottom, legging: bottom, maleShoe: "low" },
    ...opts,
  });
}
