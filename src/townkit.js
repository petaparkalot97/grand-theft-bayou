// ---------------------------------------------------------------------------
// townkit.js — a procedural building kit for filling districts (TASK-084).
//
// Chatboro reads as a place because it is full of *specific* things: named
// shopfronts, lit windows, porches, parked cars, fences, signs, a water tower.
// The state regions were five buildings on a kilometre of road. This kit makes
// the specific things cheaply, so composer.js can populate a whole street:
//
//   const kit = createTownKit(ctx);
//   C.frontage("Front Street", { ..., build: kit.strip({ names: [...] }) });
//   C.frontage("Oak Street",   { ..., build: kit.house() });
//
// Every builder takes a composer slot ({ x, z, rot, index, s, ... }), builds
// facing local +z (the front, toward the road), registers collision, and
// returns true. Nothing is built from a GLB: plain boxes and extrusions with
// named materials, so realize() (graphics.js) classifies them by name and
// batchStatic folds the meshes of one material into one draw call. Materials
// come from one cache, so a district's hundred houses share a dozen of them.
//
// ctx: scene, addBlocker, addLitSpot (+ loadDsCar, for parked cars, if given)
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { placeParkedCar } from "./landmarks.js";
import { makeChurch } from "./church.js";

// deterministic 0..1 from a slot + salt, so a street varies but never re-rolls
function hash(a, b, k = 0) {
  let h = Math.imul(Math.round(a * 13) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.round(b * 13) + k * 977, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return ((h >>> 0) % 100000) / 100000;
}
const pick = (arr, r) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];
// neighbours never share a name: step through the list by 5 (coprime with the 8 and 16-long lists), offset per side
const nameFor = (names, slot) => names[((slot.index || 0) * 5 + (slot.side > 0 ? 3 : 0)) % names.length];

export const PALETTES = {
  siding: [0xd9c7a0, 0x9cc7b4, 0xe6b0a0, 0xc9d6e3, 0xefe4cf, 0xd98e73, 0xb7c99a, 0xc9b6d3, 0xe8d27a],
  weathered: [0xb9b2a0, 0x9a9f94, 0xa89880, 0x8f9aa0, 0xb59b86],
  brick: [0x9a4a3a, 0x8a5a44, 0xa8583c, 0x7a4a3c],
  awning: [0xc0392b, 0x2e86c1, 0x27ae60, 0xe67e22, 0x8e44ad, 0xd4ac0d],
  roof: [0x4a4f55, 0x5a3b30, 0x3b4a40, 0x6a5a48, 0x51565c],
  trim: [0xf2efe6, 0xe8e2d0, 0xdad6c8],
};

export function createTownKit(ctx) {
  const { scene, addBlocker } = ctx;

  // ------------------------------------------------------------ materials
  const cache = new Map();
  /** One shared material per (colour, name, options). Names drive graphics.js's PBR rules. */
  function mat(hex, name, rough = 0.85, extra = {}) {
    const key = hex + "|" + name + "|" + rough + "|" + JSON.stringify(extra);
    let m = cache.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, name, ...extra }); cache.set(key, m); }
    return m;
  }
  const lamp = () => {
    let m = cache.get("lit window");
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color: 0x2a2418, emissive: 0xffc070, emissiveIntensity: 0.75, roughness: 0.4, name: "lit window" });
      m.userData.gtbRealized = true;
      cache.set("lit window", m);
    }
    return m;
  };
  const dark = () => mat(0x1e2b37, "window glass", 0.3);
  const windowMat = (r) => (r < 0.38 ? lamp() : dark());

  const signs = new Map();
  /** A lit sign board texture: text on a coloured field, glowing softly at night. */
  function signMat(text, ink = "#fff4d8", bg = "#7a1f12", trimColour = null) {
    const key = text + ink + bg;
    let m = signs.get(key);
    if (m) return m;
    const c = document.createElement("canvas");
    c.width = 512; c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
    g.strokeStyle = trimColour || ink; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
    g.fillStyle = ink; g.textAlign = "center"; g.textBaseline = "middle";
    let size = 66;
    g.font = `bold ${size}px Trebuchet MS, Arial Black, sans-serif`;
    while (g.measureText(text).width > 470 && size > 22) { size -= 3; g.font = `bold ${size}px Trebuchet MS, Arial Black, sans-serif`; }
    g.fillText(text, 256, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    m = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.55, roughness: 0.6, name: "signboard lit" });
    m.userData.gtbRealized = true;
    signs.set(key, m);
    return m;
  }

  // ------------------------------------------------------------ geometry helpers
  function box(parent, w, h, d, material, x, y, z, ry = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function cyl(parent, r, h, material, x, y, z, seg = 10) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  /** A gable prism: `w` across (x), `h` tall (y), `len` long (z), centred on z. */
  function gable(parent, w, h, len, material, x, y, z, ry = 0) {
    const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
    geo.translate(0, 0, -len / 2);
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  /** A tin/shingle roof as two slabs, `pitch` radians, ridge along z. */
  function slabRoof(parent, w, len, pitch, material, y, z, over = 0.5) {
    const half = w / 2 / Math.cos(pitch) + over;
    for (const s of [-1, 1]) {
      const r = box(parent, half, 0.18, len + over * 2, material, s * (w / 4 + 0.05), y + Math.sin(pitch) * w / 4, z);
      r.rotation.z = -s * pitch;
    }
  }
  const at = (slot, lx, lz) => [slot.x + Math.cos(slot.rot) * lx + Math.sin(slot.rot) * lz, slot.z - Math.sin(slot.rot) * lx + Math.cos(slot.rot) * lz];
  /** Collision for a w x d rectangle centred (0, cz) in the slot's frame: circles along its long side. */
  function block(slot, w, d, cz = 0) {
    const r = Math.min(w, d) / 2, long = Math.max(w, d) / 2, alongX = w >= d;
    const n = Math.max(1, Math.ceil(long / r));
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1, off = t * Math.max(0, long - r);
      addBlocker(...at(slot, alongX ? off : 0, cz + (alongX ? 0 : off)), r);
    }
  }
  function group(slot) {
    const g = new THREE.Group();
    g.position.set(slot.x, 0, slot.z);
    g.rotation.y = slot.rot;
    return g;
  }

  // ------------------------------------------------------------ dressing
  /** A live oak / cypress: a trunk and a few overlapping crowns. */
  function tree(parent, x, z, s = 1, tone = 0) {
    const trunk = mat(0x4a3826, "tree trunk bark", 0.95);
    const leaf = mat([0x2f5a2a, 0x3a6a30, 0x27502b][tone % 3], "tree leaves foliage", 0.9);
    cyl(parent, 0.22 * s, 3 * s, trunk, x, 1.5 * s, z, 7);
    for (const [ox, oy, oz, r] of [[0, 3.6, 0, 1.9], [1.1, 3.1, 0.4, 1.4], [-1, 3.2, -0.5, 1.5]]) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), leaf);
      m.position.set(x + ox * s, oy * s, z + oz * s);
      m.castShadow = true;
      parent.add(m);
    }
  }
  function mailbox(parent, x, z) {
    box(parent, 0.1, 1.1, 0.1, mat(0x5a4a3a, "wood post", 0.9), x, 0.55, z);
    box(parent, 0.32, 0.26, 0.5, mat(0x2a2f36, "mailbox plastic", 0.5), x, 1.2, z);
  }
  function picketFence(parent, x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 0.55));
    const white = mat(0xf2efe6, "painted wood fence", 0.8);
    const a = Math.atan2(x1 - x0, z1 - z0);
    box(parent, 0.06, 0.06, len, white, (x0 + x1) / 2, 0.55, (z0 + z1) / 2, a);
    box(parent, 0.06, 0.06, len, white, (x0 + x1) / 2, 0.25, (z0 + z1) / 2, a);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      box(parent, 0.09, 0.85, 0.05, white, x0 + (x1 - x0) * t, 0.42, z0 + (z1 - z0) * t, a);
    }
  }
  function sign(parent, w, h, text, x, y, z, ink, bg, trim) {
    const m = signMat(text, ink, bg, trim);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    front.position.set(x, y, z + 0.02);
    parent.add(front);
    return front;
  }
  /** A pickup or car parked near a slot, if the district's ctx can load them. */
  function parkedNear(slot, lx, lz, r) {
    if (!ctx.loadDsCar) return;
    const kinds = ["beatall", "doclorean", "landyroamer", "toyoyo", "tristar"];
    const [wx, wz] = at(slot, lx, lz);
    placeParkedCar(ctx, pick(kinds, r), wx, wz, slot.rot + (hash(wx, wz, 3) < 0.5 ? 0 : Math.PI));
  }

  // ------------------------------------------------------------ houses
  const houses = {};

  /** A shotgun house: narrow, deep, raised on piers, a porch on the street (as Lafourchette's). */
  houses.shotgun = (slot) => {
    const g = group(slot), r = hash(slot.x, slot.z);
    const wall = mat(pick(PALETTES.siding, hash(slot.x, slot.z, 1)), "painted wood siding");
    const trim = mat(0xf2efe6, "painted wood trim", 0.8), tin = mat(pick(PALETTES.roof, r), "tin roof", 0.6);
    box(g, 5.6, 3.4, 9, wall, 0, 2.4, -0.8);
    slabRoof(g, 5.6, 9, 0.6, tin, 4.1, -0.8, 0.45);
    box(g, 5.6, 1.5, 0.12, wall, 0, 4.4, 3.64);
    box(g, 5.8, 0.25, 2.1, trim, 0, 0.62, 4.7);
    box(g, 6.1, 0.14, 2.4, tin, 0, 3.55, 4.7);
    for (const px of [-2.7, 2.7]) box(g, 0.18, 2.9, 0.18, trim, px, 2.1, 5.7);
    box(g, 1.1, 2.1, 0.08, mat(0x5a3a28, "wood door", 0.7), -1.3, 1.85, 3.74);
    box(g, 1.3, 1.4, 0.08, windowMat(hash(slot.x, slot.z, 2)), 1.3, 2.5, 3.74);
    box(g, 1.4, 0.3, 0.8, trim, -1.3, 0.25, 6.1);
    box(g, 0.5, 2.4, 0.5, mat(0x7a4a3a, "brick chimney wall", 0.95), 1.6, 5.2, -3.2);
    scene.add(g);
    block(slot, 5.6, 9, -0.8);
    return true;
  };

  /** A gabled bungalow: porch, chimney, shuttered windows, a yard tree. */
  houses.bungalow = (slot) => {
    const g = group(slot);
    const wall = mat(pick(PALETTES.siding, hash(slot.x, slot.z, 1)), "painted wood siding");
    const trim = mat(pick(PALETTES.trim, hash(slot.x, slot.z, 4)), "painted wood trim", 0.8);
    const roof = mat(pick(PALETTES.roof, hash(slot.x, slot.z, 5)), "shingle roof", 0.75);
    const shut = mat(pick([0x2a4a3a, 0x3a2a4a, 0x4a2a2a, 0x2a3a5a], hash(slot.x, slot.z, 6)), "painted wood shutter", 0.8);
    box(g, 9, 3, 7, wall, 0, 1.9, -0.5);                                  // body on low piers
    box(g, 9.2, 0.5, 7.2, mat(0x6a6a66, "concrete piers", 0.95), 0, 0.25, -0.5);
    gable(g, 9.6, 2.8, 8, roof, 0, 3.4, -0.5, Math.PI / 2);               // ridge along x, gable ends on the sides
    box(g, 3.6, 2.2, 0.16, wall, -2.2, 4.4, 3.05);                        // front dormer face
    gable(g, 4.2, 1.8, 2.6, roof, -2.2, 4.4, 2.2);
    box(g, 9.4, 0.22, 2.2, trim, 0, 0.62, 4.2);                           // porch deck
    box(g, 9.6, 0.16, 2.4, roof, 0, 3.4, 4.2);                            // porch roof
    for (const px of [-4.4, -1.2, 4.4]) box(g, 0.16, 2.7, 0.16, trim, px, 2, 5.2);
    box(g, 1.1, 2.1, 0.08, mat(0x6b1f1a, "wood door", 0.7), 0.6, 1.9, 3.06);
    for (const px of [-2.6, 3.1]) {
      box(g, 1.3, 1.5, 0.08, windowMat(hash(slot.x + px, slot.z, 7)), px, 2.3, 3.05);
      box(g, 0.35, 1.5, 0.06, shut, px - 1, 2.3, 3.08); box(g, 0.35, 1.5, 0.06, shut, px + 1, 2.3, 3.08);
    }
    box(g, 0.8, 3.2, 0.8, mat(0x8a5a44, "brick chimney wall", 0.95), 3.3, 5, -2.4);
    tree(g, hash(slot.x, slot.z, 8) < 0.5 ? -5.4 : 5.4, 4.5, 0.8 + hash(slot.x, slot.z, 9) * 0.5, slot.index);
    mailbox(g, 5.6, 7.2);
    scene.add(g);
    block(slot, 9, 7, -0.5);
    if (hash(slot.x, slot.z, 10) < 0.22) parkedNear(slot, hash(slot.x, slot.z, 12) < 0.5 ? -7.4 : 7.4, 3.5, hash(slot.x, slot.z, 11));   // in the drive beside the house, never on the street
    return true;
  };

  /** A two-storey farmhouse with a wrap-around porch and a tin roof. */
  houses.farmhouse = (slot) => {
    const g = group(slot);
    const wall = mat(pick([0xefe4cf, 0xd9d2c0, 0xc9d6c0, 0xe6d8b0], hash(slot.x, slot.z, 1)), "painted wood siding");
    const trim = mat(0xf7f4ec, "painted wood trim", 0.8), tin = mat(pick([0x6a3a30, 0x4a4f55, 0x3f5a4a], hash(slot.x, slot.z, 2)), "tin roof", 0.6);
    box(g, 8, 6.2, 7, wall, 0, 3.6, -0.5);
    box(g, 8.4, 0.6, 7.4, mat(0x6a6a66, "concrete piers", 0.95), 0, 0.3, -0.5);
    gable(g, 8.6, 3.6, 7.8, tin, 0, 6.7, -0.5, 0);
    box(g, 11, 0.22, 3.4, trim, 0, 0.62, 4);                              // wide porch deck
    box(g, 11.4, 0.16, 3.6, tin, 0, 3.4, 4);
    for (const px of [-5.2, -2.6, 0, 2.6, 5.2]) box(g, 0.18, 2.8, 0.18, trim, px, 2, 5.6);
    box(g, 1.2, 2.2, 0.08, mat(0x4a2a1e, "wood door", 0.7), 0, 1.9, 3.06);
    for (const [px, py] of [[-2.6, 2.3], [2.6, 2.3], [-2.6, 5.4], [0, 5.4], [2.6, 5.4]]) box(g, 1.2, 1.6, 0.08, windowMat(hash(slot.x + px, slot.z + py, 3)), px, py, 3.06);
    box(g, 0.9, 3.6, 0.9, mat(0x8a5a44, "brick chimney wall", 0.95), -3.2, 7.2, -2);
    tree(g, -6.6, 3, 1.3, 0); tree(g, 7.2, -2, 1.1, 1);
    mailbox(g, 4.8, 8);
    scene.add(g);
    block(slot, 8, 7, -0.5);
    if (hash(slot.x, slot.z, 10) < 0.5) parkedNear(slot, 7.6, 3, hash(slot.x, slot.z, 11));
    return true;
  };

  /** A double-wide trailer on cinder blocks, with steps, an AC unit and a yard light. */
  houses.trailer = (slot) => {
    const g = group(slot);
    const skin = mat(pick([0xd8d4c8, 0xc7d0d4, 0xdac9a8, 0xb8c4b0], hash(slot.x, slot.z, 1)), "aluminium siding panel", 0.6);
    box(g, 14, 3.2, 4.2, skin, 0, 1.9, 0);
    box(g, 14.2, 0.35, 4.4, mat(0x2e3238, "metal skirting panel", 0.7), 0, 0.3, 0);
    box(g, 14.4, 0.2, 4.7, mat(0xe8e6de, "tin roof", 0.55), 0, 3.6, 0);
    box(g, 1.1, 2.1, 0.08, mat(0xdfe4e8, "door panel", 0.5), -3, 1.7, 2.14);
    for (const px of [-0.4, 2.6, 5.2]) box(g, 1.5, 1.1, 0.08, windowMat(hash(slot.x + px, slot.z, 2)), px, 2.2, 2.14);
    box(g, 1.8, 0.2, 1.4, mat(0x7a5a3a, "wood plank steps", 0.9), -3, 0.5, 2.9);
    box(g, 0.9, 0.7, 0.8, mat(0xb8bcc0, "aluminium unit", 0.5), 6.2, 0.45, -1.2);
    if (hash(slot.x, slot.z, 3) < 0.5) box(g, 5, 0.1, 3, mat(0x2e6a8a, "tarp canvas", 0.9), 2.6, 3.1, 3.7);
    scene.add(g);
    block(slot, 14, 4.2);
    if (hash(slot.x, slot.z, 4) < 0.35) parkedNear(slot, 4, 5, hash(slot.x, slot.z, 5));
    return true;
  };

  /** A log cabin: dark timber, a stone chimney, a small porch. */
  houses.cabin = (slot) => {
    const g = group(slot);
    const log = mat(pick([0x5a3d26, 0x6a4a30, 0x4a3320], hash(slot.x, slot.z, 1)), "log wall timber", 0.9);
    const roof = mat(0x3a3f3a, "tin roof", 0.65);
    box(g, 7, 2.8, 6, log, 0, 1.4 + 0.4, 0);
    for (let i = 0; i < 4; i++) box(g, 7.15, 0.12, 6.15, mat(0x3a2818, "log wall timber", 0.95), 0, 0.7 + i * 0.7, 0);
    gable(g, 7.8, 2.6, 6.8, roof, 0, 3.2, 0, Math.PI / 2 * 0);
    box(g, 7.4, 0.2, 2, mat(0x6a4a30, "wood plank deck", 0.9), 0, 0.5, 4);
    for (const px of [-3.4, 3.4]) box(g, 0.2, 2.4, 0.2, log, px, 1.6, 4.9);
    box(g, 7.6, 0.14, 2.1, roof, 0, 2.9, 4);
    box(g, 1, 2, 0.08, mat(0x3a2418, "wood door", 0.8), 0, 1.5, 3.05);
    box(g, 1.2, 1.2, 0.08, windowMat(hash(slot.x, slot.z, 2)), -2.2, 2, 3.05); box(g, 1.2, 1.2, 0.08, windowMat(hash(slot.x, slot.z, 3)), 2.2, 2, 3.05);
    box(g, 1, 4.6, 1, mat(0x777a78, "stone chimney", 0.95), -3.9, 3, -1);
    tree(g, 5.2, 2, 1.2, 2);
    scene.add(g);
    block(slot, 7, 6);
    return true;
  };

  /** A house on piles over the water, with a stair down to a boat landing. */
  houses.stilt = (slot) => {
    const g = group(slot);
    const wood = mat(pick([0x7a6a54, 0x6a5a48, 0x8a7a64], hash(slot.x, slot.z, 1)), "weathered wood plank", 0.95);
    const tin = mat(pick([0x6a3a30, 0x4a4f55, 0x5a6a5a], hash(slot.x, slot.z, 2)), "tin roof", 0.65);
    for (const [px, pz] of [[-2.4, -2], [2.4, -2], [-2.4, 2], [2.4, 2], [0, 4.6], [0, -2]]) cyl(g, 0.16, 3.4, mat(0x3a2e22, "wood post piling", 0.95), px, 1.4, pz, 7);
    box(g, 6.4, 0.25, 5.6, wood, 0, 3.05, 0);
    box(g, 5.4, 2.5, 4.6, wood, 0, 4.4, 0);
    slabRoof(g, 5.4, 4.6, 0.55, tin, 5.6, 0, 0.6);
    box(g, 1, 1.9, 0.08, mat(0x3a2418, "wood door", 0.8), -1.2, 4.0, 2.34);
    box(g, 1.2, 1.1, 0.08, windowMat(hash(slot.x, slot.z, 3) * 0.6), 1.3, 4.4, 2.34);
    box(g, 1.6, 0.15, 3.4, wood, 0, 3.0, 4.4);                            // the gangway
    box(g, 3.2, 0.15, 1.6, wood, 0, 0.6, 7.8);                            // the landing
    scene.add(g);
    block(slot, 6.4, 5.6);
    return true;
  };

  /** A small cottage behind a picket fence. */
  houses.cottage = (slot) => {
    const g = group(slot);
    const wall = mat(pick(PALETTES.siding, hash(slot.x, slot.z, 1)), "painted wood siding");
    const trim = mat(0xf2efe6, "painted wood trim", 0.8), roof = mat(pick(PALETTES.roof, hash(slot.x, slot.z, 2)), "shingle roof", 0.75);
    box(g, 6.6, 2.8, 5.6, wall, 0, 1.8, 0);
    gable(g, 7.2, 2.6, 6.2, roof, 0, 3.2, 0, Math.PI / 2);
    box(g, 2.6, 0.2, 1.6, trim, 0, 0.5, 3.6);
    box(g, 1, 2, 0.08, mat(0x2e5a7a, "wood door", 0.7), 0, 1.5, 2.85);
    for (const px of [-2.1, 2.1]) box(g, 1.2, 1.3, 0.08, windowMat(hash(slot.x + px, slot.z, 2)), px, 2.2, 2.85);
    picketFence(g, -5, 6.4, 5, 6.4); picketFence(g, -5, 6.4, -5, -1); picketFence(g, 5, 6.4, 5, -1);
    tree(g, 6.3, 3, 0.9, 1);
    scene.add(g);
    block(slot, 6.6, 5.6);
    return true;
  };

  /** Rotates through house styles by slot, so a street isn't one building repeated. */
  houses.mixed = (styles, weights = null) => (slot) => {
    const w = weights || styles.map(() => 1), total = w.reduce((a, b) => a + b, 0);
    let r = hash(slot.x, slot.z, 20) * total, i = 0;
    while (i < styles.length - 1 && (r -= w[i]) > 0) i++;
    return houses[styles[i]](slot);
  };

  // ------------------------------------------------------------ commercial
  const shops = {};

  /** A one-storey strip storefront: glass, an awning, a lit sign, a flat roof with a parapet. */
  shops.strip = ({ names, ink = "#fff4d8", bgs = ["#7a1f12", "#1f4a7a", "#1f6a3a", "#5a2a6a", "#7a5a12"] } = {}) => (slot) => {
    const g = group(slot), r = hash(slot.x, slot.z);
    const wall = mat(pick([...PALETTES.siding, ...PALETTES.weathered, ...PALETTES.brick], hash(slot.x, slot.z, 1)), "stucco wall");
    const roofEdge = mat(0x8a8a86, "concrete parapet", 0.9), awn = mat(pick(PALETTES.awning, hash(slot.x, slot.z, 2)), "awning canvas", 0.9);
    const w = 12, d = 9, h = 4.4;
    box(g, w, h, d, wall, 0, h / 2, 0);
    box(g, w + 0.3, 0.6, d + 0.3, roofEdge, 0, h + 0.3, 0);
    box(g, 8.6, 2.4, 0.1, mat(0x9ec4d8, "window glass", 0.15, { transparent: true, opacity: 0.55 }), -1, 1.6, d / 2 + 0.03);
    box(g, 1.2, 2.3, 0.1, mat(0x3a2418, "wood door", 0.7), 4.6, 1.2, d / 2 + 0.04);
    box(g, w - 0.6, 0.12, 2.2, awn, 0, 3.15, d / 2 + 1.05).rotation.x = 0.18;
    box(g, 6, 1.1, 0.14, mat(0x1e1e22, "sign board back", 0.7), 0, 3.85, d / 2 + 0.1);
    sign(g, 5.6, 0.95, nameFor(names, slot), 0, 3.85, d / 2 + 0.2, ink, pick(bgs, hash(slot.x, slot.z, 4)));
    if (r < 0.5) box(g, 1.8, 0.9, 1.4, mat(0xb8bcc0, "aluminium unit", 0.5), 3, h + 1.05, -1.5);
    box(g, 0.9, 1.1, 0.9, mat(0x2d5a37, "dumpster bin", 0.7), 0, 0.55, -d / 2 - 0.9);
    scene.add(g);
    block(slot, w, d);
    return true;
  };

  /** A two-storey brick main-street block: cornice, upper windows, a street-level awning, a sign. */
  shops.brickBlock = ({ names, ink = "#f6ecd0", bgs = ["#2a3a5a", "#5a2a2a", "#2a4a3a", "#4a3a2a"] } = {}) => (slot) => {
    const g = group(slot);
    const brick = mat(pick(PALETTES.brick, hash(slot.x, slot.z, 1)), "brick wall", 0.95);
    const stone = mat(0xc9c3b8, "concrete cornice", 0.9), awn = mat(pick(PALETTES.awning, hash(slot.x, slot.z, 2)), "awning canvas", 0.9);
    const w = 12, d = 12, h = 8.4;
    box(g, w, h, d, brick, 0, h / 2, 0);
    box(g, w + 0.5, 0.5, d + 0.5, stone, 0, h + 0.25, 0);
    box(g, w + 0.2, 0.3, 0.6, stone, 0, 4.4, d / 2 + 0.2);
    for (let i = 0; i < 4; i++) box(g, 1.3, 1.9, 0.1, windowMat(hash(slot.x + i, slot.z, 6)), -4.2 + i * 2.8, 6.3, d / 2 + 0.03);
    box(g, 4.6, 2.6, 0.1, mat(0x9ec4d8, "window glass", 0.15, { transparent: true, opacity: 0.55 }), -2.6, 1.9, d / 2 + 0.03);
    box(g, 1.3, 2.4, 0.1, mat(0x2a2018, "wood door", 0.7), 3.2, 1.3, d / 2 + 0.04);
    box(g, w - 1, 0.12, 1.9, awn, 0, 3.5, d / 2 + 0.95).rotation.x = 0.2;
    box(g, 5.2, 0.9, 0.12, mat(0x1e1e22, "sign board back", 0.7), 0, 4.05, d / 2 + 0.3);
    sign(g, 5, 0.8, nameFor(names, slot), 0, 4.05, d / 2 + 0.38, ink, pick(bgs, hash(slot.x, slot.z, 4)));
    scene.add(g);
    block(slot, w, d);
    return true;
  };

  /** A roadside diner: low, chrome-banded, big windows, a pole sign. */
  shops.diner = ({ name = "DINER" } = {}) => (slot) => {
    const g = group(slot);
    const wall = mat(0xe8e2d0, "stucco wall"), chrome = mat(0xb8bcc0, "chrome trim", 0.25, { metalness: 0.9 });
    const w = 14, d = 8, h = 3.8;
    box(g, w, h, d, wall, 0, h / 2, 0);
    box(g, w + 0.4, 0.5, d + 0.4, mat(0xb0281c, "painted trim", 0.6), 0, h + 0.25, 0);
    box(g, w + 0.05, 0.3, d + 0.05, chrome, 0, 2.6, 0);
    box(g, 10, 1.5, 0.1, lamp(), 0, 1.7, d / 2 + 0.03);
    box(g, 1.3, 2.3, 0.1, mat(0x9ec4d8, "window glass", 0.15, { transparent: true, opacity: 0.55 }), 5.4, 1.2, d / 2 + 0.04);
    cyl(g, 0.15, 7, mat(0x2a2a2a, "steel post", 0.6), -9, 3.5, 6, 8);
    box(g, 4.2, 1.6, 0.3, mat(0x1e1e22, "sign board back", 0.7), -9, 7.3, 6);
    sign(g, 4, 1.3, name, -9, 7.3, 6.17, "#fff4d8", "#b0281c");
    scene.add(g);
    block(slot, w, d);
    return true;
  };

  /** A motel: a long row of rooms with a walkway roof, doors, and a pole sign. */
  shops.motel = ({ name = "MOTEL" } = {}) => (slot) => {
    const g = group(slot);
    const wall = mat(pick([0xe6d8b0, 0xd9c7a0, 0xb7c99a], hash(slot.x, slot.z, 1)), "stucco wall");
    const roof = mat(0x5a3b30, "shingle roof", 0.75), doorC = pick(PALETTES.awning, hash(slot.x, slot.z, 2));
    const w = 26, d = 6, h = 3.6;
    box(g, w, h, d, wall, 0, h / 2, 0);
    box(g, w + 0.8, 0.25, d + 3.4, roof, 0, h + 0.15, 1.4);
    for (let i = 0; i < 8; i++) {
      const x = -w / 2 + 1.7 + i * 3.2;
      box(g, 0.95, 2.1, 0.08, mat(doorC, "painted door", 0.6), x, 1.1, d / 2 + 0.04);
      box(g, 1.2, 1.1, 0.08, windowMat(hash(slot.x + i, slot.z, 3) * 0.9), x + 1.3, 1.9, d / 2 + 0.04);
    }
    for (let i = 0; i <= 4; i++) box(g, 0.14, 2.9, 0.14, mat(0xf2efe6, "painted post", 0.8), -w / 2 + i * (w / 4), 1.5, d / 2 + 2.9);
    cyl(g, 0.2, 8, mat(0x2a2a2a, "steel post", 0.6), w / 2 + 3, 4, d / 2 + 5, 8);
    box(g, 3.6, 2.4, 0.3, mat(0x1e1e22, "sign board back", 0.7), w / 2 + 3, 8.4, d / 2 + 5);
    sign(g, 3.4, 1.1, name, w / 2 + 3, 8.7, d / 2 + 5.17, "#fff4d8", "#1f4a7a");
    sign(g, 3.4, 0.9, "VACANCY", w / 2 + 3, 7.6, d / 2 + 5.17, "#ff6a5a", "#180a08");
    scene.add(g);
    block(slot, w, d);
    return true;
  };

  /** A corrugated warehouse: ridge roof, roll-up doors, a loading dock, drums. */
  shops.warehouse = ({ tone = 0x8a8f96, w = 22, d = 16, h = 6.5 } = {}) => (slot) => {
    const g = group(slot);
    const sheet = mat(tone, "corrugated sheet cladding", 0.6), roof = mat(0x6a6f76, "corrugated sheet roof", 0.6);
    box(g, w, h, d, sheet, 0, h / 2, 0);
    gable(g, d + 0.6, 1.8, w + 0.5, roof, 0, h, 0, Math.PI / 2);
    const nDoors = Math.max(2, Math.round(w / 7));
    for (let i = 0; i < nDoors; i++) {
      const x = -w / 2 + (i + 0.5) * (w / nDoors);
      box(g, 3.4, 3.8, 0.12, mat(0x4a5560, "door panel roll", 0.5), x, 1.9, d / 2 + 0.04);
      box(g, 3.6, 0.3, 1.6, mat(0x777a78, "concrete dock", 0.9), x, 0.15, d / 2 + 0.9);
    }
    box(g, 1, 2.2, 0.1, mat(0x2a2f36, "door panel", 0.6), -w / 2 + 0.9, 1.1, d / 2 + 0.05);
    sign(g, 5, 1, pick(["FREIGHT", "COLD STORAGE", "SHIPPING", "SUPPLY CO."], hash(slot.x, slot.z, 2)), 0, h - 1, d / 2 + 0.08, "#ffffff", "#2a3a5a");
    scene.add(g);
    block(slot, w, d);
    return true;
  };

  /** A red barn with a tin roof and a silo. */
  shops.barn = () => (slot) => {
    const g = group(slot);
    const red = mat(0x8a2a22, "painted wood siding", 0.85), white = mat(0xf2efe6, "painted wood trim", 0.8), tin = mat(0x8a8f96, "tin roof", 0.6);
    box(g, 11, 6, 14, red, 0, 3, 0);
    gable(g, 12, 4, 15, tin, 0, 6, 0, Math.PI / 2 * 0);
    box(g, 4, 4.6, 0.12, red, 0, 2.3, 7.05);
    box(g, 4.2, 0.2, 0.2, white, 0, 4.7, 7.12);
    box(g, 0.2, 4.6, 0.2, white, 2.05, 2.3, 7.12); box(g, 0.2, 4.6, 0.2, white, -2.05, 2.3, 7.12);
    cyl(g, 1.8, 10, mat(0xb8bcc0, "aluminium silo", 0.5, { metalness: 0.6 }), 8, 5, -3, 14);
    scene.add(g);
    block(slot, 11, 14);
    addBlocker(...at(slot, 8, -3), 1.9);
    return true;
  };

  /** A procedural gas stop: pump canopy toward the road, a small store behind, a pole sign. */
  shops.gasStop = ({ name = "GAS & GO", tone = 0xdedac9, band = 0x2b6fb0, sign: bg = "#2b6fb0" } = {}) => (slot) => {
    const g = group(slot);
    const wall = mat(tone, "stucco wall"), trim = mat(band, "painted trim", 0.6), white = mat(0xf2efe6, "painted post", 0.8);
    box(g, 10, 4, 6, wall, 0, 2, -3);
    box(g, 10.3, 0.7, 6.3, trim, 0, 4.2, -3);
    box(g, 7, 2.2, 0.1, lamp(), -0.5, 1.7, 0.03);
    box(g, 1.1, 2.2, 0.1, mat(0x2a2018, "wood door", 0.7), 4, 1.15, 0.04);
    box(g, 13, 0.6, 8, white, 0, 5.6, 6);
    box(g, 13.2, 0.35, 8.2, trim, 0, 6, 6);
    for (const px of [-5.5, 5.5]) for (const pz of [3, 9]) cyl(g, 0.3, 5.6, white, px, 2.8, pz, 8);
    for (const px of [-2.5, 2.5]) {
      box(g, 1.4, 0.3, 4, mat(0x5a5a58, "concrete island", 0.9), px, 0.15, 6);
      box(g, 0.9, 1.7, 0.9, mat(0xc4392b, "pump housing plastic", 0.5), px, 1.15, 6);
    }
    cyl(g, 0.22, 9, mat(0x2a2a2a, "steel post", 0.6), 8.5, 4.5, 11, 8);
    box(g, 4.4, 2, 0.3, mat(0x1e1e22, "sign board back", 0.7), 8.5, 9.4, 11);
    sign(g, 4.2, 1.6, name, 8.5, 9.4, 11.17, "#ffffff", bg);
    scene.add(g);
    block(slot, 10, 6, -3);
    addBlocker(...at(slot, 0, 6), 2.2);
    return true;
  };

  /** A little white church, via church.js. */
  shops.church = ({ name = "church" } = {}) => (slot) => {
    const [x, z] = at(slot, 0, 4);
    makeChurch(ctx, { x, z, rot: slot.rot, length: 14, name });
    return true;
  };

  // ------------------------------------------------------------ open-area builders (run inside composer.openArea)
  const areas = {};
  /** A paved lot with painted bays, a pole light and a few parked cars. */
  areas.lot = (C, { cars = 4 } = {}) => (r, c) => {
    C.plane(c.w, c.d, C.tiled(ctx.roadMaterial(), c.w, c.d, 9), c.x, 0.02, c.z);
    const line = mat(0xe8e4d8, "road paint", 0.7);
    line.userData.gtbRealized = true;
    for (let x = r.x0 + 2; x <= r.x1 - 2; x += 3.2) { C.plane(0.14, 5, line, x, 0.03, r.z0 + 4); C.plane(0.14, 5, line, x, 0.03, r.z1 - 4); }
    ctx.addLitSpot({ x: c.x, y: 8.5, z: c.z, warm: 0xffbf74, power: 150, range: 30, pole: true });
    if (ctx.loadDsCar) {
      const kinds = ["beatall", "doclorean", "landyroamer", "toyoyo", "tristar"];
      for (let i = 0; i < cars; i++) {
        const x = r.x0 + 5 + i * 6.4, top = i % 2 === 0;
        if (x > r.x1 - 3) break;
        placeParkedCar(ctx, kinds[(i + Math.round(c.x)) % kinds.length], x, top ? r.z0 + 4 : r.z1 - 4, top ? 0 : Math.PI);
      }
    }
  };
  /** A small green: lawn, paths, benches, a few trees and a lamp. */
  areas.green = (C) => (r, c) => {
    C.plane(c.w, c.d, mat(0x63914d, "park lawn", 1), c.x, 0.02, c.z);
    const path = mat(0xb8b2a8, "concrete path", 0.9);
    C.plane(2, c.d, path, c.x, 0.03, c.z); C.plane(c.w, 2, path, c.x, 0.03, c.z);
    const g = new THREE.Group(); scene.add(g);
    for (const [ox, oz] of [[0.28, 0.28], [-0.28, 0.28], [0.28, -0.28], [-0.28, -0.28]]) {
      tree(g, c.x + ox * c.w, c.z + oz * c.d, 1.2, Math.round(ox * 4 + oz * 4));
      addBlocker(c.x + ox * c.w, c.z + oz * c.d, 0.8);
    }
    const bench = mat(0x5a4632, "wood bench plank", 0.9);
    for (const s of [-1, 1]) { box(g, 1.8, 0.1, 0.5, bench, c.x + s * 3.2, 0.5, c.z + 1.6); box(g, 1.8, 0.5, 0.08, bench, c.x + s * 3.2, 0.8, c.z + 1.85); }
    cyl(g, 0.2, 5, mat(0x2a2a2a, "steel post", 0.6), c.x, 2.5, c.z - 4, 8);
    ctx.addLitSpot({ x: c.x, y: 5.2, z: c.z - 4, warm: 0xffd6a0, power: 100, range: 26 });
  };

  // ------------------------------------------------------------ props
  const props = {};
  /** A plank pier from (x0, z0) to (x1, z1) on piles, with rail posts. Walkable: no collision. */
  props.pier = (parent, x0, z0, x1, z1, width = 4) => {
    const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(x1 - x0, z1 - z0);
    const wood = mat(0x6a5a48, "weathered wood plank", 0.95), pile = mat(0x3a2e22, "wood post piling", 0.95);
    box(parent, width, 0.2, len, wood, (x0 + x1) / 2, 0.55, (z0 + z1) / 2, a);
    const n = Math.max(2, Math.round(len / 4));
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      for (const sd of [-1, 1]) cyl(parent, 0.16, 2.4, pile, px + Math.cos(a) * sd * width / 2, 0.5, pz - Math.sin(a) * sd * width / 2, 7);
    }
  };
  /** A working boat: hull, cabin, a mast, in a colour picked from the hash. */
  props.boat = (parent, x, z, ry = 0, s = 1) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = ry; g.scale.setScalar(s);
    const hull = mat(pick([0xf2efe6, 0x2e6a8a, 0x8a2a22, 0xd9c7a0], hash(x, z)), "boat hull paint", 0.6);
    const shape = new THREE.Shape([new THREE.Vector2(-1.6, 0), new THREE.Vector2(1.6, 0), new THREE.Vector2(1.2, 6), new THREE.Vector2(0, 8.5), new THREE.Vector2(-1.2, 6)]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 1.2, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2); geo.translate(0, 0.25, -4);
    const h = new THREE.Mesh(geo, hull); h.castShadow = true; g.add(h);
    box(g, 2.4, 1.6, 2.4, mat(0xf2efe6, "painted trim", 0.8), 0, 1.9, -1.4);
    box(g, 2.5, 0.2, 2.6, mat(0x2a2f36, "roof plate", 0.7), 0, 2.8, -1.4);
    cyl(g, 0.07, 5, mat(0x2a2a2a, "steel post", 0.6), 0, 3.6, 1.2, 6);
    parent.add(g);
    return g;
  };
  /** A line of utility poles between two points with a sagging wire — LineSegments, one draw call. */
  props.poleLine = (x0, z0, x1, z1, every = 45, avoid = []) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.floor(len / every)), alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
    const wood = mat(0x3a2c20, "utility pole", 0.95);
    wood.userData.gtbRealized = true;
    const g = new THREE.Group();
    const pts = [];
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      // a pole never stands where a side street meets this road
      if (i > 0 && i < n && avoid.some((a) => Math.abs(a - (alongX ? x : z)) < 6)) continue;
      cyl(g, 0.18, 9, wood, x, 4.5, z, 6);
      box(g, 2.2, 0.14, 0.14, wood, x, 8.6, z, Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2);
      const a = Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2;
      const here = [-0.9, 0.9].map((o) => new THREE.Vector3(x + Math.sin(a) * o, 8.55, z + Math.cos(a) * o));
      if (prev) for (let k = 0; k < 2; k++) {
        const A = prev[k], B = here[k];
        for (let j = 0; j < 4; j++) {
          const u0 = j / 4, u1 = (j + 1) / 4, sag = (u) => -Math.sin(u * Math.PI) * 0.7;
          pts.push(A.x + (B.x - A.x) * u0, 8.55 + sag(u0), A.z + (B.z - A.z) * u0, A.x + (B.x - A.x) * u1, 8.55 + sag(u1), A.z + (B.z - A.z) * u1);
        }
      }
      prev = here;
      addBlocker(x, z, 0.3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x141414 })));
    scene.add(g);
    return g;
  };

  /** Above-ground tombs in rows (this is Louisiana), a low wall, a gate, a cross. */
  areas.cemetery = (C) => (r, c) => {
    const dirt = ctx.surface("dirt", 512).material(1);
    C.plane(c.w, c.d, C.tiled(dirt, c.w, c.d, 8), c.x, 0.02, c.z);
    const g = new THREE.Group(); scene.add(g);
    const white = mat(0xe8e4d8, "whitewashed plaster tomb", 0.9), grey = mat(0x9a9a94, "weathered stone tomb", 0.95);
    for (let z = r.z0 + 6; z < r.z1 - 5; z += 6.5) {
      for (let x = r.x0 + 5; x < r.x1 - 4; x += 5) {
        const h = hash(x, z, 1);
        if (h < 0.12) continue;
        const m = h < 0.6 ? white : grey, tall = 1.5 + h * 1.2;
        box(g, 2.4, tall, 3.4, m, x, tall / 2, z);
        box(g, 2.7, 0.25, 3.7, grey, x, tall + 0.12, z);
        if (h > 0.8) { box(g, 0.14, 0.9, 0.14, white, x, tall + 0.7, z); box(g, 0.6, 0.14, 0.14, white, x, tall + 0.9, z); }
        addBlocker(x, z, 1.6);
      }
    }
    const wall = mat(0xd8d2c4, "plaster wall", 0.9);
    for (const [wx, wz, ww, wd] of [[c.x, r.z0 + 0.4, c.w, 0.6], [c.x, r.z1 - 0.4, c.w, 0.6], [r.x0 + 0.4, c.z, 0.6, c.d], [r.x1 - 0.4, c.z, 0.6, c.d]]) box(g, ww, 1.6, wd, wall, wx, 0.8, wz);
    ctx.addLitSpot({ x: c.x, y: 5, z: r.z1 - 2, warm: 0xb8d0ff, power: 60, range: 22 });
  };

  // ------------------------------------------------------------ industrial props
  const CONTAINER_COLOURS = [0xa83232, 0x2a5ca8, 0xd4a028, 0x2e7d32, 0x4a4f55, 0xc4671f, 0x7a3a8a];
  /**
   * Rows of shipping containers stacked 1-3 high, with aisles: one InstancedMesh
   * per colour, so a whole yard is seven draw calls. Runs inside openArea().
   */
  areas.containerYard = (C, { seed = 1, fill = 0.8 } = {}) => (r, c) => {
    const cw = 6.2, cd = 2.6, ch = 2.6, aisleEvery = 3;
    const perColour = CONTAINER_COLOURS.map(() => []);
    const lanesZ = [];
    let rowIndex = 0;
    for (let z = r.z0 + 4; z + cd < r.z1 - 3; z += cd + 0.5, rowIndex++) {
      if (rowIndex % (aisleEvery + 1) === aisleEvery) { z += 4; continue; }
      for (let x = r.x0 + 4; x + cw < r.x1 - 3; x += cw + 0.4) {
        const h = hash(x, z, seed);
        if (h > fill) continue;
        const stack = 1 + Math.floor(hash(x, z, seed + 1) * 3);
        const col = Math.floor(hash(x, z, seed + 2) * CONTAINER_COLOURS.length);
        for (let k = 0; k < stack; k++) perColour[col].push([x + cw / 2, ch / 2 + k * ch, z + cd / 2]);
      }
      lanesZ.push(z);
    }
    const geo = new THREE.BoxGeometry(cw, ch, cd), m = new THREE.Matrix4();
    perColour.forEach((list, i) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat(CONTAINER_COLOURS[i], "shipping container corrugated sheet", 0.6), list.length);
      im.castShadow = im.receiveShadow = true;
      list.forEach(([x, y, z], k) => im.setMatrixAt(k, m.makeTranslation(x, y, z)));
      im.computeBoundingSphere();
      scene.add(im);
    });
    // collision: one circle per pair of container lengths along every row
    for (const z of lanesZ) for (let x = r.x0 + 7; x < r.x1 - 4; x += 6.6) addBlocker(x, z + cd / 2, 2.4);
    const asphalt = mat(0x55575a, "asphalt yard surface", 0.95);
    C.plane(c.w, c.d, asphalt, c.x, 0.021, c.z);
    C.claim(r);                                  // stacks and fences: nobody spawns inside a yard
    ctx.addLitSpot({ x: c.x, y: 12, z: c.z, warm: 0xfff0c0, power: 220, range: 40, pole: true });
    for (const [x, z] of [[r.x0 + 1, r.z0 + 1], [r.x1 - 1, r.z1 - 1]]) ctx.addLitSpot({ x, y: 10, z, warm: 0xfff0c0, power: 140, range: 32, pole: true });
    if (ctx.makeFence) { ctx.makeFence(r.x0, r.z0, r.x1, r.z0); ctx.makeFence(r.x0, r.z1, r.x1, r.z1); ctx.makeFence(r.x0, r.z0, r.x0, r.z1); ctx.makeFence(r.x1, r.z0, r.x1, r.z1); }
  };
  /** A tank farm: fat round tanks, catwalks and a berm, fenced. */
  areas.tankFarm = (C, { tanks = 4 } = {}) => (r, c) => {
    const g = new THREE.Group(); scene.add(g);
    C.plane(c.w, c.d, mat(0x4a4d4a, "gravel yard surface", 0.98), c.x, 0.021, c.z);
    C.claim(r);
    const cols = Math.ceil(Math.sqrt(tanks)), sx = c.w / cols, sz = c.d / Math.ceil(tanks / cols);
    for (let i = 0; i < tanks; i++) {
      const x = r.x0 + sx * (i % cols + 0.5), z = r.z0 + sz * (Math.floor(i / cols) + 0.5), rad = Math.min(sx, sz) * 0.36;
      const tone = pick([0xd8d6cf, 0xc9cbc8, 0xb8bcc0], hash(x, z, 2));
      cyl(g, rad, 9, mat(tone, "storage tank steel sheet", 0.55), x, 4.5, z, 20);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(rad * 1.02, 1.6, 20), mat(0x8a8f96, "storage tank roof sheet", 0.6));
      cap.position.set(x, 9.8, z); cap.castShadow = true; g.add(cap);
      box(g, 0.5, 10, 0.25, mat(0x3a3d40, "ladder steel", 0.6), x + rad, 5, z);
      addBlocker(x, z, rad + 0.6);
    }
    for (const [ex, ez, w, d] of [[c.x, r.z0 + 0.6, c.w, 1.2], [c.x, r.z1 - 0.6, c.w, 1.2], [r.x0 + 0.6, c.z, 1.2, c.d], [r.x1 - 0.6, c.z, 1.2, c.d]]) box(g, w, 0.9, d, mat(0x6a6a60, "earth berm", 1), ex, 0.45, ez);
    ctx.addLitSpot({ x: c.x, y: 12, z: c.z, warm: 0xffe0b0, power: 180, range: 38, pole: true });
  };
  /** A gantry crane on rails at the quay edge, boom out over the water (toward -z). */
  props.crane = (parent, x, z, ry = 0) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = ry;
    const red = mat(0xc0392b, "crane painted steel", 0.55), grey = mat(0x4a4f55, "crane rail steel", 0.6);
    for (const [px, pz] of [[-6, -3], [6, -3], [-6, 3], [6, 3]]) box(g, 0.9, 22, 0.9, red, px, 11, pz);
    box(g, 14, 1.1, 8, red, 0, 22.5, 0);
    box(g, 1.2, 1.2, 40, red, 0, 23.5, -14);                    // the boom, out over the ship
    for (const px of [-6, 6]) box(g, 1.2, 0.5, 8.4, grey, px, 0.25, 0);
    box(g, 3, 2.4, 3, mat(0xe8e0c8, "crane cab paint", 0.6), 0, 20.6, -6);
    parent.add(g);
    addBlocker(x - 6, z - 3, 1.2); addBlocker(x + 6, z - 3, 1.2); addBlocker(x - 6, z + 3, 1.2); addBlocker(x + 6, z + 3, 1.2);
    return g;
  };
  /** A container ship moored with its side to a quay running along x: hull, bridge, funnel, deck boxes. */
  props.ship = (parent, x, z, len = 130, wid = 20) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z); parent.add(g);
    const hullMat = mat(0x2a3a4a, "ship hull paint", 0.6), red = mat(0x9a2a22, "ship hull paint red", 0.6), white = mat(0xf2efe6, "ship superstructure paint", 0.6);
    const shape = new THREE.Shape([new THREE.Vector2(-len / 2, -wid / 2), new THREE.Vector2(len / 2 - 22, -wid / 2), new THREE.Vector2(len / 2, 0), new THREE.Vector2(len / 2 - 22, wid / 2), new THREE.Vector2(-len / 2, wid / 2)]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 9, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    const hull = new THREE.Mesh(geo, hullMat); hull.position.y = -1; hull.castShadow = true; g.add(hull);
    box(g, len - 26, 0.6, wid * 0.6, red, -13, 0.4, 0);
    box(g, 14, 14, wid * 0.9, white, -len / 2 + 12, 15, 0);
    box(g, 6, 5, wid * 0.55, white, -len / 2 + 12, 24, 0);
    cyl(g, 2.2, 8, mat(0xc0392b, "ship funnel paint", 0.55), -len / 2 + 6, 22, 0, 12);
    const list = CONTAINER_COLOURS.map(() => []);
    for (let cx = -len / 2 + 26; cx < len / 2 - 32; cx += 6.4) for (let cz = -wid / 2 + 3; cz < wid / 2 - 2; cz += 2.7) {
      const st = 1 + Math.floor(hash(cx, cz, 5) * 3), col = Math.floor(hash(cx, cz, 6) * CONTAINER_COLOURS.length);
      for (let k = 0; k < st; k++) list[col].push([cx, 9.4 + k * 2.6 + 1.3, cz]);
    }
    const bg = new THREE.BoxGeometry(6.2, 2.6, 2.6), m4 = new THREE.Matrix4();
    list.forEach((l, i) => {
      if (!l.length) return;
      const im = new THREE.InstancedMesh(bg, mat(CONTAINER_COLOURS[i], "shipping container corrugated sheet", 0.6), l.length);
      im.castShadow = true;
      l.forEach(([px, py, pz], k) => im.setMatrixAt(k, m4.makeTranslation(px, py, pz)));
      im.computeBoundingSphere();
      g.add(im);
    });
    return g;
  };

  /** An airboat: a flat hull, a caged fan on a stand, a high seat. */
  props.airboat = (parent, x, z, ry = 0) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = ry;
    const hull = mat(pick([0x4a7a5a, 0xd9c7a0, 0x8a8f96], hash(x, z)), "boat hull paint", 0.6);
    box(g, 2.2, 0.5, 6.5, hull, 0, 0.35, 0);
    box(g, 1.2, 1.4, 1.2, mat(0x2a2f36, "roof plate", 0.7), 0, 1.4, -0.8);
    box(g, 0.2, 2.6, 0.2, mat(0x2a2a2a, "steel post", 0.6), 0, 2, -3);
    box(g, 2.4, 2.4, 0.2, mat(0x3a3d40, "fan cage steel", 0.6), 0, 2.6, -3.2);
    parent.add(g);
    return g;
  };
  /** Bald cypress for marsh: a flared trunk and a wide flat crown — a composer.vegetation `shape`. */
  props.cypressShape = () => {
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.9, 5, 8);
    const leafGeo = new THREE.SphereGeometry(2.6, 9, 6); leafGeo.scale(1.15, 0.8, 1.15);
    return { trunkGeo, leafGeo, trunkY: 2.5, leafY: 5.6 };
  };
  /** Dark standing water for a marsh pool. Not collidable: pools are wet ground, not ponds. */
  props.pool = (parent, x, z, w, d) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(0x0d1f1c, "marsh water", 0.2, { transparent: true, opacity: 0.8 }));
    m.material.userData.gtbRealized = true;
    m.rotation.x = -Math.PI / 2; m.position.set(x, 0.03, z); m.receiveShadow = true;
    parent.add(m);
  };

  // ------------------------------------------------------------ badlands
  const ROCK = [0x9a4a30, 0xb0603a, 0x8a4028, 0xa8583a];
  /** A red-rock mesa: three stepped slabs, slightly rotated, with a blocker footprint. */
  props.mesa = (parent, x, z, w = 40, d = 30, h = 26) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = hash(x, z) * Math.PI;
    let cw = w, cd = d, y = 0;
    for (let i = 0; i < 3; i++) {
      const sh = h * (i === 0 ? 0.5 : i === 1 ? 0.32 : 0.18);
      box(g, cw, sh, cd, mat(ROCK[(i + Math.floor(hash(x, z, 4) * 4)) % ROCK.length], "red rock sandstone", 0.98), 0, y + sh / 2, 0);
      y += sh; cw *= 0.72; cd *= 0.74;
    }
    parent.add(g);
    addBlocker(x, z, Math.min(w, d) * 0.5);
    return g;
  };
  /** Scrub tree shape for badlands: a bare trunk and a small dry crown — a composer.vegetation `shape`. */
  props.scrubShape = () => ({ trunkGeo: new THREE.CylinderGeometry(0.15, 0.3, 3, 6), leafGeo: new THREE.ConeGeometry(1.2, 2.4, 5), trunkY: 1.5, leafY: 3.4 });
  /** An open quarry: a scraped floor, terraced walls on three sides, gravel heaps, a conveyor, floodlights. */
  areas.quarry = (C) => (r, c) => {
    const g = new THREE.Group(); scene.add(g);
    C.plane(c.w, c.d, mat(0x8a6a4a, "quarry gravel floor", 0.98), c.x, 0.021, c.z);
    C.claim(r);
    for (const [side, len, ox, oz, rot] of [["n", c.w, 0, -c.d / 2 + 4, 0], ["w", c.d, -c.w / 2 + 4, 0, Math.PI / 2], ["e", c.d, c.w / 2 - 4, 0, Math.PI / 2]]) {
      let y = 0;
      for (let i = 0; i < 3; i++) {
        const w2 = len - i * 14, hh = 3.4;
        const dxz = (side === "n" ? [0, i * 4] : side === "w" ? [i * 4, 0] : [-i * 4, 0]);
        box(g, w2, hh, 7, mat(ROCK[(i + 1) % ROCK.length], "quarry rock face", 0.98), c.x + ox + dxz[0], y + hh / 2, c.z + oz + dxz[1], rot);
        y += hh;
      }
    }
    for (let i = 0; i < 7; i++) {
      const px = r.x0 + 14 + kit_hash(i, 1) * (c.w - 28), pz = r.z1 - 14 - kit_hash(i, 2) * (c.d * 0.4), rad = 3 + kit_hash(i, 3) * 3;
      const m = new THREE.Mesh(new THREE.ConeGeometry(rad, rad * 0.9, 9), mat(0x9a8a72, "gravel heap", 1));
      m.position.set(px, rad * 0.45, pz); m.castShadow = true; g.add(m);
      addBlocker(px, pz, rad * 0.7);
    }
    box(g, 26, 0.6, 1.6, mat(0x3a3d40, "conveyor steel belt", 0.6), c.x - 10, 3.2, r.z1 - 24, 0.25).rotation.z = 0.12;
    for (const [x, z] of [[r.x0 + 6, r.z1 - 6], [r.x1 - 6, r.z1 - 6], [c.x, r.z0 + 12]]) ctx.addLitSpot({ x, y: 11, z, warm: 0xfff0c0, power: 200, range: 40, pole: true });
    if (ctx.makeFence) { ctx.makeFence(r.x0 + 1, r.z1 - 1, r.x1 - 1, r.z1 - 1); }
  };
  const kit_hash = (a, b) => hash(a * 7.3, b * 3.1, 9);
  /** Runs `fn` with the wall-colour palette swapped (a bleached, sun-faded town). */
  const withSiding = (palette, fn) => { const keep = PALETTES.siding; PALETTES.siding = palette; try { return fn(); } finally { PALETTES.siding = keep; } };

  return {
    mat, box, cyl, gable, tree, sign, signMat, picketFence, mailbox, block, at, group, hash, pick,
    houses, shops, areas, props, palettes: PALETTES, windowMat, lamp, withSiding,
  };
}
