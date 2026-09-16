// ---------------------------------------------------------------------------
// welcomeback.js — ACT ONE, continued: "WELCOME BACK TO DIXIE" (TASK-017 part C).
//
// From the script, after The Truth: CUT TO the Chatboro Sheriff's Office, where
// Governor Gus Bellefontaine, a casino magnate and a corporate executive decide
// nobody has to kill Keseme, just make sure nobody believes her. Then (played in
// nolantis.js) the observation platform with Solange, and this module's montage
// of Dixie Beaux under Keseme's V.O. ("Who keeps taking it?"), the threatening
// phone call, MISSION UNLOCKED, and the elevator back up, where police
// helicopters sweep the skyline and Keseme promises to become extremely
// inconvenient.
//
// This module owns everything that isn't inside the cavern: the office and a
// counting room (sealed sets under Chatboro at y = -40, like Act One's kitchen),
// the montage dressing placed around the map (hidden until the montage plays),
// the helicopters, and the surface beat. nolantis.js calls the scene functions
// from inside its own cine scenes, passing `c`.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { NOLANTIS } from "./nolantis.js";

const Y = -40;                                   // sealed sets live under Chatboro
const OFFICE = { x: 30, z: 118 };
const ROOM = { x: 30, z: 148 };                  // the montage's counting room
const SURFACE = { x: 120, z: 372 };              // the ladder up from the storm drain (nolantis returnTo)
const SKYLINE = { x: 74, z: 290 };               // downtown, where the helicopters circle

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
function signTexture(text, fg, bg, w = 1024, h = 256) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
    const lines = String(text).split("\n");
    // the biggest bold face that fits every line inside the canvas
    let size = Math.min(110, (h / lines.length) * 0.78);
    const fits = () => { g.font = `bold ${size}px Arial, sans-serif`; return lines.every((l) => g.measureText(l).width <= w * 0.92); };
    while (size > 12 && !fits()) size -= 4;
    lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * (h / lines.length) * 0.9));
  });
}

/**
 * @param {object} ctx from main.js: scene, camera, cine, state, makeHoodrat(opts),
 *   makeCastMember(who), poolLight(color, power, range, x, y, z), getPlayer()
 */
export function createWelcomeBack(ctx) {
  const { scene, cine, state } = ctx;
  const props = [];
  const actors = [];                             // everyone this module animates while visible
  const movers = [];
  const runners = [];                            // the prison bus and the freight train
  let office = null, room = null, montage = null, helis = null;
  let footage = null, footageT = 0, photo = null, ledger = null, bundle = null;
  const cast = {};
  const beats = {};                              // counting-room dressings
  let roomSign = null, roomCloth = null;
  let surfaceActor = null;
  let t = 0;

  function group(name, visible = false) {
    const g = new THREE.Group();
    g.name = name;
    g.visible = visible;
    scene.add(g);
    props.push(g);
    return g;
  }
  function mesh(parent, geo, mat, x, y, z, { cast: c = true } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = c;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function person(parent, opts, x, y, z, faceX, faceZ) {
    const a = opts.who ? ctx.makeCastMember(opts.who) : ctx.makeHoodrat(opts);
    place(a, x, y, z, faceX, faceZ);
    parent.add(a);
    actors.push(a);
    return a;
  }
  function place(a, x, y, z, faceX, faceZ) {
    a.baseY = y;
    a.position.set(x, y, z);
    if (a._last) a._last.copy(a.position);
    if (faceX != null) a._yaw = Math.atan2(faceX - x, faceZ - z);
  }
  function sign(parent, text, fg, bg, w, h, x, y, z, rotY = 0, bright = 1) {
    // front side only (no mirrored text from behind); `bright` < 1 keeps pale signs out of the bloom
    const s = mesh(parent, new THREE.PlaneGeometry(w, h), basic(new THREE.Color(1, 1, 1).multiplyScalar(bright), { map: signTexture(text, fg, bg) }), x, y, z, { cast: false });
    s.rotation.y = rotY;
    return s;
  }
  /** A sealed box room (inward-facing walls), lit by pooled lights at its ceiling. */
  function sealedRoom(g, cx, cz, w, d, h, wall, floor) {
    mesh(g, new THREE.BoxGeometry(w, 0.2, d), floor, cx, Y - 0.1, cz, { cast: false });
    mesh(g, new THREE.BoxGeometry(w, 0.2, d), std("office ceiling", 0xd8d2c4), cx, Y + h + 0.1, cz, { cast: false });
    for (const [x, z, ww, dd] of [[cx, cz - d / 2, w, 0.2], [cx, cz + d / 2, w, 0.2], [cx - w / 2, cz, 0.2, d], [cx + w / 2, cz, 0.2, d]]) {
      mesh(g, new THREE.BoxGeometry(ww, h, dd), wall, x, Y + h / 2, z, { cast: false });
    }
  }

  // ---------------------------------------------------------------- the Sheriff's Office
  function buildOffice() {
    office = group("chatboro sheriff's office");
    const { x: cx, z: cz } = OFFICE;
    sealedRoom(office, cx, cz, 14, 10, 3.6, std("wood panelling", 0x6b4a32), std("office carpet", 0x4a3b2c));
    ctx.poolLight(0xffd9a8, 70, 18, cx, Y + 3.2, cz);
    ctx.poolLight(0xffc88a, 40, 12, cx + 4, Y + 2.4, cz);
    const wood = std("conference table", 0x3a2618, { roughness: 0.45 });
    mesh(office, new THREE.BoxGeometry(7, 0.12, 2.6), wood, cx, Y + 0.78, cz);
    for (const [dx, dz] of [[-3.2, -1.1], [3.2, -1.1], [-3.2, 1.1], [3.2, 1.1]]) mesh(office, new THREE.BoxGeometry(0.12, 0.72, 0.12), wood, cx + dx, Y + 0.36, cz + dz);
    // window blinds glowing on the north wall, the sheriff's star on the east
    const blind = basic(new THREE.Color(0xffe2a8).multiplyScalar(0.9));
    for (let i = 0; i < 9; i++) mesh(office, new THREE.BoxGeometry(3.4, 0.1, 0.02), blind, cx + 2.5, Y + 1.4 + i * 0.16, cz - 4.88, { cast: false });
    sign(office, "CHATBORO PARISH\nSHERIFF'S OFFICE", "#e8c872", "#2a1c12", 3.2, 0.9, cx + 6.88, Y + 2.5, cz, -Math.PI / 2);
    // bourbon, and a photograph Mercer puts down later
    mesh(office, new THREE.CylinderGeometry(0.07, 0.08, 0.3, 10), std("bourbon bottle", 0x7a3b12, { roughness: 0.2, transparent: true, opacity: 0.85 }), cx + 3.1, Y + 0.99, cz - 0.6);
    mesh(office, new THREE.CylinderGeometry(0.05, 0.04, 0.09, 10), std("bourbon glass", 0xd9a45a, { roughness: 0.1 }), cx + 3.4, Y + 0.88, cz + 0.2);
    const mug = canvasTexture(256, 320, (g, w, h) => {
      g.fillStyle = "#c9c6bd"; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#8a877e"; for (let y = 40; y < h - 60; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(18, y); g.stroke(); }
      g.fillStyle = "#3b2c22"; g.beginPath(); g.arc(w / 2, 120, 52, 0, Math.PI * 2); g.fill();
      g.fillRect(w / 2 - 80, 180, 160, 90);
      g.fillStyle = "#111"; g.font = "bold 26px Arial"; g.textAlign = "center"; g.fillText("NADIA, KESEME", w / 2, h - 22);
    });
    photo = mesh(office, new THREE.PlaneGeometry(0.34, 0.42), basic(0xffffff, { map: mug }), cx + 0.4, Y + 0.85, cz, { cast: false });
    photo.rotation.x = -Math.PI / 2;
    photo.visible = false;
    // the security footage: Keseme at the crown-over-waves door, redrawn a few times a second
    const cv = document.createElement("canvas");
    cv.width = 512; cv.height = 288;
    footage = { canvas: cv, tex: new THREE.CanvasTexture(cv) };
    footage.tex.colorSpace = THREE.SRGBColorSpace;
    drawFootage();
    mesh(office, new THREE.BoxGeometry(0.1, 1.5, 2.5), std("tv frame", 0x111111), cx - 6.9, Y + 2.1, cz);
    const screen = mesh(office, new THREE.PlaneGeometry(2.3, 1.3), basic(0xffffff, { map: footage.tex }), cx - 6.83, Y + 2.1, cz, { cast: false });
    screen.rotation.y = Math.PI / 2;

    cast.mercer = person(office, { who: "mercer" }, cx - 0.5, Y, cz - 2.3, cx - 0.5, cz);
    cast.magnate = person(office, { sex: "m", seed: 777, skin: 0xd9ab85, top: 0x6e1420, denim: 0x241016, hair: 0x1a1410, headwear: "none", beard: true,
      crew: { cloth: 0x2a0a10, chain: 0xffd24a, shoe: 0x111111 }, height: 1.8 }, cx - 1.6, Y, cz + 2.3, cx - 1.6, cz);
    cast.executive = person(office, { sex: "m", seed: 4242, skin: 0xf0d0b4, top: 0x3a3f47, denim: 0x2a2e35, hair: 0x5a3b22, headwear: "none", beard: false,
      crew: { cloth: 0x2a2e35, chain: 0xcfd3da, shoe: 0x1c1c1c }, height: 1.76 }, cx + 1.4, Y, cz + 2.3, cx + 1.4, cz);
    cast.governor = person(office, { sex: "m", seed: 1861, skin: 0xe8c3a0, top: 0xf2efe6, denim: 0xe9e4d8, hair: 0xdadada, headwear: "none", beard: false,
      crew: { cloth: 0xefeae0, chain: 0xd4af37, shoe: 0x3a2418 }, height: 1.86 }, cx + 4.2, Y, cz, cx, cz);
  }

  function drawFootage() {
    const g = footage.canvas.getContext("2d"), w = 512, h = 288;
    g.fillStyle = "#0c110e"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#1d2621"; g.beginPath(); g.ellipse(w / 2, h, 200, 250, 0, Math.PI, 0); g.fill();     // the tunnel
    g.fillStyle = "#2c3a33"; g.fillRect(w / 2 - 40, 90, 80, 150);                                      // the door
    g.strokeStyle = "#9fb8a8"; g.lineWidth = 3;
    g.beginPath(); g.moveTo(w / 2 - 20, 120); g.lineTo(w / 2 - 12, 104); g.lineTo(w / 2, 116); g.lineTo(w / 2 + 12, 104); g.lineTo(w / 2 + 20, 120); g.closePath(); g.stroke();
    for (let i = 0; i < 3; i++) { g.beginPath(); for (let x = -22; x <= 22; x += 4) g.lineTo(w / 2 + x, 132 + i * 9 + Math.sin(x / 4) * 3); g.stroke(); }
    const px = w / 2 - 150 + ((footageT * 22) % 120);                                                   // Keseme walks to the door
    g.fillStyle = "#070907"; g.beginPath(); g.arc(px, 158, 10, 0, Math.PI * 2); g.fill(); g.fillRect(px - 11, 168, 22, 60);
    for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(160,200,170,${0.03 + Math.random() * 0.04})`; g.fillRect(0, y, w, 1); }
    g.fillStyle = "#d8f0dc"; g.font = "bold 16px monospace";
    g.fillText("CAM 07 · STORM DRAIN · ORLEAROUGE", 12, 22);
    g.fillStyle = footageT % 1 < 0.5 ? "#ff4040" : "#551515"; g.fillText("● REC", w - 70, 22);
    g.fillStyle = "#d8f0dc"; g.fillText(`02:14:${String(33 + Math.floor(footageT) % 27).padStart(2, "0")}`, 12, h - 12);
    footage.tex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- the counting room
  function buildRoom() {
    room = group("counting room");
    const { x: cx, z: cz } = ROOM;
    sealedRoom(room, cx, cz, 9, 7, 3.2, std("counting room wall", 0x5b5f5a), std("counting room floor", 0x3b3a36));
    ctx.poolLight(0xfff1d6, 70, 14, cx, Y + 2.9, cz);
    mesh(room, new THREE.BoxGeometry(3.4, 0.1, 1.8), std("counting table", 0x2b2b2b), cx, Y + 0.8, cz);
    roomCloth = mesh(room, new THREE.BoxGeometry(3.3, 0.02, 1.7), std("tablecloth", 0x2f5a35), cx, Y + 0.86, cz, { cast: false });
    roomSign = mesh(room, new THREE.PlaneGeometry(3.6, 0.8), basic(0xffffff), cx, Y + 2.3, cz - 3.38, { cast: false });
    const cash = std("cash bundle", 0x6f9a5a, { roughness: 0.9 });
    const stacks = (g, n, x0) => { for (let i = 0; i < n; i++) mesh(g, new THREE.BoxGeometry(0.16, 0.06 + (i % 3) * 0.04, 0.07), cash, cx + x0 + (i % 4) * 0.22, Y + 0.9, cz - 0.3 + Math.floor(i / 4) * 0.2); };
    const beat = (id, signText, fg, bg, cloth, build) => {
      const g = new THREE.Group();
      g.visible = false;
      room.add(g);
      beats[id] = { g, cloth, tex: signTexture(signText, fg, bg) };
      build(g);
    };
    const deputy = (seed) => ({ sex: "m", seed, skin: 0xc79a74, top: 0x9c8660, denim: 0x3d3a34, headwear: "hat", beard: false,
      crew: { cloth: 0x2e2a22, chain: 0xaaaaaa, shoe: 0x201a14, hat: 0x6b5a3e } });
    beat("dealers", "NO SIGN ON THIS DOOR", "#9a9a9a", "#1b1b1b", 0x2b2b2b, (g) => {
      stacks(g, 14, -0.8);
      person(g, { sex: "m", seed: 3131, top: 0x1f3a8a, headwear: "band", crew: "blue" }, cx - 0.6, Y, cz + 1.4, cx - 0.6, cz);
      person(g, { sex: "m", seed: 3132, top: 0xeceae4, headwear: "none", crew: "blue" }, cx + 0.8, Y, cz + 1.3, cx + 0.8, cz);
    });
    beat("police", "EVIDENCE · DO NOT REMOVE", "#ffffff", "#7a1c1c", 0x3a3a3a, (g) => {
      stacks(g, 10, -0.9);
      const bag = std("evidence bag", 0xc9b38a, { roughness: 0.95 });
      for (let i = 0; i < 3; i++) mesh(g, new THREE.BoxGeometry(0.4, 0.3, 0.3), bag, cx + 0.6 + i * 0.45, Y + 1.0, cz + 0.2);
      bundle = mesh(g, new THREE.BoxGeometry(0.16, 0.08, 0.07), cash, cx - 0.2, Y + 0.9, cz + 0.4);
      cast.skimmer = person(g, deputy(611), cx - 0.4, Y, cz + 1.3, cx - 0.4, cz);
      person(g, deputy(612), cx + 1.1, Y, cz + 1.3, cx + 1.1, cz);
    });
    beat("casino", "GRAND CRESCENT · COUNT ROOM", "#ffd23a", "#2a0808", 0x1f5a2f, (g) => {
      const chip = [std("red chip", 0xb3261e), std("black chip", 0x151515), std("gold chip", 0xd4af37)];
      for (let i = 0; i < 12; i++) mesh(g, new THREE.CylinderGeometry(0.05, 0.05, 0.05 + (i % 4) * 0.05, 12), chip[i % 3], cx - 1 + (i % 6) * 0.35, Y + 0.92, cz - 0.2 + Math.floor(i / 6) * 0.35);
      person(g, { sex: "m", seed: 5151, top: 0x2a2a2a, denim: 0x1a1a1a, headwear: "none", beard: false, crew: { cloth: 0x1a1a1a, chain: 0xffd24a, shoe: 0x111111 } }, cx - 0.5, Y, cz + 1.3, cx - 0.5, cz);
      person(g, { sex: "f", seed: 5152, top: 0x6e1420, denim: 0x1a1a1a, headwear: "none", crew: { cloth: 0x1a1a1a, chain: 0xffd24a, shoe: 0x111111 } }, cx + 0.9, Y, cz + 1.3, cx + 0.9, cz);
    });
    beat("preacher", "FIRST BAPTIST · BUILDING FUND", "#f4ead0", "#2c3e66", 0x6b2030, (g) => {
      const plate = std("collection plate", 0xc9a227, { metalness: 0.7, roughness: 0.3 });
      for (let i = 0; i < 3; i++) mesh(g, new THREE.CylinderGeometry(0.22, 0.18, 0.05, 20), plate, cx - 0.8 + i * 0.8, Y + 0.9, cz);
      stacks(g, 8, -0.4);
      person(g, { sex: "m", seed: 7777, skin: 0x7a5238, top: 0x111111, denim: 0x111111, hair: 0x9a9a9a, headwear: "none", beard: true,
        crew: { cloth: 0x111111, chain: 0xd4af37, shoe: 0x111111 } }, cx, Y, cz + 1.3, cx, cz);
    });
  }
  function showBeat(id) {
    for (const [k, b] of Object.entries(beats)) b.g.visible = k === id;
    const b = beats[id];
    roomCloth.material.color.setHex(b.cloth);
    roomSign.material.map = b.tex;
    roomSign.material.needsUpdate = true;
  }

  // ---------------------------------------------------------------- the montage around Dixie Beaux
  function buildMontage() {
    montage = group("dixie beaux montage");
    // Chatboro, at the trailer park's south edge (open ground, no blockers for ~9 m around (-56, 96)):
    // a payday lender's billboard facing north...
    for (const x of [-57.4, -50.6]) mesh(montage, new THREE.CylinderGeometry(0.08, 0.08, 4, 8), std("sign post", 0x555555), x, 2, 90);
    sign(montage, "PAYDAY LOANS\nCASH TODAY · NO CREDIT CHECK", "#ffe14a", "#b3261e", 7, 2.2, -54, 4.4, 90.1, 0, 0.85);
    // ...and a family getting an eviction notice
    person(montage, { sex: "f", seed: 901, top: 0x8a6f9e, denim: 0x3a4a6a, headwear: "none" }, -62.5, 0, 99.6, -59.5, 99);
    person(montage, { sex: "m", seed: 902, top: 0x6a6f3c, headwear: "cap", plaid: true }, -63.6, 0, 98.6, -59.5, 99);
    person(montage, { sex: "m", seed: 903, top: 0xd96b2a, headwear: "none", height: 1.2 }, -62, 0, 100.8, -59.5, 99);
    person(montage, { who: "deputy" }, -59.5, 0, 99, -62.5, 99.6);
    const notice = mesh(montage, new THREE.PlaneGeometry(0.22, 0.3), basic(0xf4f1e6, { side: THREE.DoubleSide }), -60.2, 1.2, 99.2, { cast: false });
    notice.rotation.y = -Math.PI / 2;

    // South Tusouxroe: a candlelit memorial
    const candle = basic(new THREE.Color(0xffc15a).multiplyScalar(2.4));
    for (let i = 0; i < 9; i++) mesh(montage, new THREE.SphereGeometry(0.06, 6, 5), candle, 78.6 + (i % 5) * 0.35, 0.18, -101.4 + (i % 2) * 0.3, { cast: false });
    sign(montage, "IN LOVING MEMORY", "#ffffff", "#1a1a1a", 1.6, 0.5, 79.4, 1.1, -100.9, Math.PI);   // faces the street, where the shot is
    ctx.poolLight(0xffb45a, 18, 8, 79.4, 0.8, -101.2);
    [[77, -103], [78.4, -103.6], [80.4, -103.5], [81.6, -102.8], [79.4, -104.2]].forEach(([x, z], i) =>
      person(montage, { sex: i % 2 ? "m" : "f", seed: 990 + i, top: 0x1b1b1b, denim: 0x222222, headwear: "none" }, x, 0, z, 79.4, -101.2));

    // OrleaRouge: a protest a block from the daiquiri bars
    ["JUSTICE", "STOP POLICE\nBRUTALITY", "WHO PROTECTS US?"].forEach((text, i) => {
      const x = -42 + i * 2.6;
      person(montage, { sex: i === 1 ? "f" : "m", seed: 1300 + i, top: [0xeceae4, 0x2f6f6a, 0x7a1c1c][i], headwear: "none" }, x, 0, 244.2, x, 250);
      sign(montage, text, "#111111", "#d8cfb8", 1.5, 0.8, x, 2.4, 244.6, 0, 0.55);
    });

    // the riverfront: Bellefontaine's fundraiser outside the casino boat
    for (const x of [42.6, 53.4]) mesh(montage, new THREE.CylinderGeometry(0.08, 0.08, 4.2, 8), std("banner pole", 0xd4af37, { metalness: 0.7 }), x, 2.1, 379.2);
    sign(montage, "BELLEFONTAINE\nKEEP DIXIE BEAUX GROWING", "#ffffff", "#1c2f5e", 10.6, 2, 48, 3.6, 379.2, Math.PI);
    [[46.2, 376.5, 47.8, 376.5], [47.8, 376.5, 46.2, 376.5], [50.5, 377.2, 48, 372], [44, 377.4, 48, 372]].forEach(([x, z, fx, fz], i) =>
      person(montage, { sex: i === 3 ? "f" : "m", seed: 1400 + i, top: [0x1c2f5e, 0x2a2a2a, 0x4a4a4a, 0x6e1420][i], denim: 0x1a1a1a, headwear: "none", beard: false,
        crew: { cloth: 0x1a1a1a, chain: 0xd4af37, shoe: 0x111111 } }, x, 0, z, fx, fz));

    // US-167: a prison bus
    const bus = new THREE.Group();
    mesh(bus, new THREE.BoxGeometry(2.5, 2.6, 11), std("prison bus", 0xefefe8), 0, 1.7, 0);
    for (const s of [-1, 1]) {
      mesh(bus, new THREE.BoxGeometry(0.02, 0.7, 9), basic(0x16181a), s * 1.26, 2.3, -0.6, { cast: false });
      const side = sign(bus, "DEPT. OF CORRECTIONS", "#1c2f5e", "#efefe8", 7, 0.6, s * 1.27, 1.2, 0, s * Math.PI / 2);
      side.material.side = THREE.FrontSide;
    }
    for (const [x, z] of [[-1.1, 3.6], [1.1, 3.6], [-1.1, -3.6], [1.1, -3.6]]) {
      const w = mesh(bus, new THREE.CylinderGeometry(0.5, 0.5, 0.4, 12), std("tyre", 0x151515), x, 0.5, z);
      w.rotation.z = Math.PI / 2;
    }
    montage.add(bus);
    runners.push({ obj: bus, x: -3.6, z0: 104, dir: -1, speed: 11, t: -1 });

    // the refinery's back fence: containers and a freight train hauling it all away
    const cols = [0xb3261e, 0x1f5a8a, 0x2f7f3a, 0xd98a1a];
    for (let i = 0; i < 6; i++) mesh(montage, new THREE.BoxGeometry(2.4, 2.6, 6), std("shipping container", cols[i % 4]), 150 + (i % 3) * 2.6, 1.3 + (i > 2 ? 2.6 : 0), 180);
    for (const x of [141.3, 142.7]) mesh(montage, new THREE.BoxGeometry(0.1, 0.12, 110), std("rail", 0x6a6a6a, { metalness: 0.6 }), x, 0.06, 165, { cast: false });
    const train = new THREE.Group();
    mesh(train, new THREE.BoxGeometry(2.6, 3.4, 12), std("locomotive", 0x2c3e66), 0, 2, 0);
    for (let i = 1; i <= 6; i++) {
      const tank = mesh(train, new THREE.CylinderGeometry(1.25, 1.25, 11, 14), std("tank car", i % 2 ? 0x1a1a1a : 0x4a4a4a), 0, 2, -i * 12.5);
      tank.rotation.x = Math.PI / 2;
    }
    montage.add(train);
    runners.push({ obj: train, x: 142, z0: 130, dir: 1, speed: 7, t: -1 });

    // the ledger Keseme closes at the end
    ledger = new THREE.Group();
    mesh(ledger, new THREE.BoxGeometry(0.3, 0.05, 0.38), std("ledger cover", 0x4a1a14), 0, 0, 0);
    ledger.visible = false;
    scene.add(ledger);
    props.push(ledger);
  }
  function runRunner(i) { const r = runners[i]; r.t = 0; r.obj.position.set(r.x, 0, r.z0); if (r.dir < 0) r.obj.rotation.y = Math.PI; }

  // ---------------------------------------------------------------- police helicopters
  function buildHelicopters() {
    helis = group("police helicopters");
    helis.userData.list = [0, 1].map((i) => {
      const h = new THREE.Group();
      mesh(h, new THREE.SphereGeometry(1.3, 14, 10), std("helicopter body", 0x1c2f5e), 0, 0, 0).scale.set(1, 0.8, 1.6);
      mesh(h, new THREE.BoxGeometry(0.3, 0.3, 4.5), std("tail boom", 0x1c2f5e), 0, 0.2, -3.2);
      const rotor = mesh(h, new THREE.BoxGeometry(9, 0.05, 0.3), std("rotor", 0x111111), 0, 1.15, 0, { cast: false });
      mesh(h, new THREE.SphereGeometry(0.12, 6, 5), basic(new THREE.Color(0xff2233).multiplyScalar(3)), 0, -1, 0.8, { cast: false });
      const beam = mesh(h, new THREE.ConeGeometry(7, 48, 18, 1, true), basic(0xdfefff, { transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }), 0, -24, 0, { cast: false });
      helis.add(h);
      return { h, rotor, beam, r: 34 + i * 16, y: 48 + i * 9, speed: 0.22 - i * 0.05, phase: i * 2.4 };
    });
  }

  // ---------------------------------------------------------------- scenes
  const say = (c, who, line) => c.say(who, line);
  const O = (dx, dy, dz) => [OFFICE.x + dx, Y + dy, OFFICE.z + dz];
  const R = (dx, dy, dz) => [ROOM.x + dx, Y + dy, ROOM.z + dz];

  /** CUT TO: the Chatboro Sheriff's Office. Starts and ends on black. */
  async function officeScene(c) {
    state.cinematic = true;
    c.letterbox(true);
    await c.black(true, 0.4);
    office.visible = true;
    photo.visible = false;
    c.shot({ from: O(5.5, 3, -3.8), to: O(4.6, 2.6, -3.2), look: O(-1, 1.1, 0.5), dur: 6 });
    await c.black(false, 0.6);
    c.card("CUT TO:", "CHATBORO SHERIFF'S OFFICE", "");
    await c.caption("Sheriff Mercer sits across from three powerful figures.", 2.6);
    c.shot({ from: O(-1.6, 1.7, 0.3), look: O(-1.6, 1.55, 2.3), dur: 2.2 });
    await c.caption("A casino magnate.", 1.6);
    c.shot({ from: O(1.4, 1.7, 0.3), look: O(1.4, 1.55, 2.3), dur: 2.2 });
    await c.caption("A corporate executive.", 1.6);
    c.shot({ from: O(1.8, 1.8, -0.8), look: O(4.2, 1.7, 0), dur: 3.4 });
    await c.caption("And Governor Augustus “Gus” Bellefontaine, the charismatic governor of Dixie Beaux.", 3.4);
    c.shot({ from: O(5.4, 2.1, 0.7), look: O(-6.8, 2.1, 0), dur: 3 });
    await c.caption("Bellefontaine watches security footage.", 2);
    c.shot({ from: O(-4.3, 2.1, 0.5), look: O(-6.85, 2.1, 0), dur: 2.4 });
    await c.caption("Keseme entering the underground door.", 2);
    c.shot({ from: O(1.8, 1.8, -0.8), look: O(4.2, 1.7, 0), dur: 2 });
    await say(c, "BELLEFONTAINE", "Who is she?");
    photo.visible = true;
    c.shot({ from: O(0.4, 2.3, -1), look: O(0.4, 0.85, 0), dur: 2.4 });
    await c.caption("Mercer places Keseme's photograph on the table.", 2.2);
    c.shot({ from: O(-0.5, 1.7, 0.4), look: O(-0.5, 1.6, -2.3), dur: 2 });
    await say(c, "MERCER", "Keseme Nadia.");
    c.shot({ from: O(1.8, 1.8, -0.8), look: O(4.2, 1.7, 0), dur: 1.6 });
    await say(c, "BELLEFONTAINE", "Criminal record?");
    c.shot({ from: O(-0.5, 1.7, 0.4), look: O(-0.5, 1.6, -2.3), dur: 5 });
    await say(c, "MERCER", "Minor stuff.");
    await say(c, "MERCER", "Trespassing. Street racing citation. Unauthorized computer access when she was seventeen.");
    c.shot({ from: O(2.2, 2.2, -2.8), look: O(1.5, 1.4, 0.4), dur: 6 });
    await say(c, "BELLEFONTAINE", "Political activist?");
    await say(c, "MERCER", "No.");
    await say(c, "BELLEFONTAINE", "Journalist?");
    await say(c, "MERCER", "No.");
    await say(c, "BELLEFONTAINE", "Police?");
    await say(c, "MERCER", "Definitely not.");
    c.shot({ from: O(2.1, 1.75, 0.2), look: O(4.2, 1.72, 0), dur: 2 });
    await c.caption("The governor smiles.", 1.4);
    await say(c, "BELLEFONTAINE", "Good.");
    c.shot({ from: O(1.4, 1.7, 0.3), look: O(1.4, 1.55, 2.3), dur: 1.8 });
    await say(c, "EXECUTIVE", "Why is that good?");
    c.shot({ from: O(4.8, 1.6, 1.4), look: O(3.4, 0.9, 0.2), dur: 2 });
    await c.caption("The governor pours himself bourbon.", 1.8);
    c.shot({ from: O(1.6, 1.9, 1.2), look: O(4.2, 1.7, 0), dur: 5 });
    await say(c, "BELLEFONTAINE", "Because people believe journalists. They believe activists. Sometimes they even believe cops.");
    c.shot({ from: O(3.6, 2.2, -0.6), look: O(0.4, 0.85, 0), dur: 2 });
    await c.caption("He looks at Keseme's photograph.", 1.8);
    c.shot({ from: O(2.3, 1.75, -0.2), look: O(4.2, 1.72, 0), dur: 6 });
    await say(c, "BELLEFONTAINE", "But a broke girl from Tusouxroe with a criminal record?");
    await c.caption("He laughs.", 1.2);
    await say(c, "BELLEFONTAINE", "We don't even have to kill her.");
    await c.caption("He drinks.", 1.2);
    await say(c, "BELLEFONTAINE", "We just have to make sure nobody believes her.");
    await c.black(true, 0.6);
    office.visible = false;
    state.cinematic = false;             // back to Keseme in Nolantis (the scene's cleanup lifts the black)
  }

  /** EXT. DIXIE BEAUX — VARIOUS, then KESEME (V.O.). `keseme`: the player, on the observation platform. */
  async function montageScene(c, { keseme }) {
    state.cinematic = true;
    c.letterbox(true);
    await c.black(true, 0.4);
    montage.visible = true;
    const beat = async (shot, text, seconds) => { c.shot(shot); await c.caption(text, seconds); };
    c.shot({ from: [-52, 3.4, 103], to: [-53, 3.2, 101], look: [-54, 3.6, 90], dur: 4 });
    await c.black(false, 0.5);
    c.card("EXT.", "DIXIE BEAUX", "Various");
    await c.caption("Chatboro residents struggle beneath predatory loans and political corruption.", 3.2);
    await beat({ from: [72, 2.4, -110], to: [73, 2.2, -109], look: [79.4, 1, -101.6], dur: 3 }, "Tusouxroe families mourn another shooting.", 2.8);
    await beat({ from: [-31, 2.6, 250.5], to: [-32.5, 2.5, 250], look: [-39.4, 2, 244.4], dur: 3.6 }, "OrleaRouge tourists party while residents protest police brutality nearby.", 3.4);
    await beat({ from: [60, 12, 198], to: [66, 14, 194], look: [128, 30, 158], dur: 3 }, "Offshore rigs burn against the horizon.", 2.6);
    runRunner(0);
    await beat({ from: [8, 9, 52], to: [6, 8, 46], look: [-4, 1.5, 76], dur: 3.2 }, "Prison buses travel down highways.", 2.6);
    await beat({ from: [-58, 2.2, 104.5], look: [-61.5, 1.3, 99.4], dur: 2.8 }, "A family receives an eviction notice.", 2.4);
    await beat({ from: [40, 3, 365], to: [42, 3, 367], look: [48, 3.2, 379], dur: 3 }, "Politicians attend a fundraiser.", 2.4);
    room.visible = true;
    const roomShot = { from: R(3.2, 2.4, 3), look: R(0, 0.95, 0), dur: 2 };
    for (const [id, text] of [["dealers", "Drug dealers count money."], ["police", "Police officers count seized cash."],
      ["casino", "Casino executives count chips."], ["preacher", "A preacher counts donations."]]) {
      showBeat(id);
      await beat(roomShot, text, 1.8);
    }
    await c.caption("Then—", 0.9);
    const P = (lx, y, lz) => [NOLANTIS.x + lx, y, NOLANTIS.z + lz];
    await beat({ from: P(14, 5, -8), to: P(10, 4, -4), look: P(0, 1, 12), dur: 4 }, "Nolantis children swim peacefully beneath artificial sunlight.", 3.2);

    // KESEME (V.O.)
    runRunner(1);
    c.shot({ from: [168, 7, 146], to: [168, 7, 154], look: [143, 2.2, 178], dur: 6 });
    await say(c, "KESEME", "Everybody tells you Dixie Beaux is poor.");
    await c.caption("Keseme watches freight trains hauling resources away.", 2.4);
    await say(c, "KESEME", "It isn't.");
    c.shot({ from: [110, 20, 190], look: [129, 33, 157], dur: 1.8 });
    await say(c, "KESEME", "Oil. Gas.");
    c.shot({ from: [160, 3, 172], look: [152, 3, 180], dur: 1.8 });
    await say(c, "KESEME", "Shipping containers.");
    c.shot({ from: [48, 9, 372], look: [48, 9.2, 394.4], dur: 1.8 });
    await say(c, "KESEME", "Casinos.");
    c.shot({ from: [92, 6, 190], look: [110, 6, 162], dur: 1.8 });
    await say(c, "KESEME", "Chemical plants.");
    c.shot({ from: [-60, 6, 262], to: [-50, 6, 262], look: [-30, 4, 250], dur: 2 });
    await say(c, "KESEME", "Tourism.");
    c.shot({ from: [47, 1.8, 373], look: [47, 1.6, 376.5], dur: 3.6 });
    await say(c, "KESEME", "There's money everywhere.");
    await c.caption("Politicians shake hands.", 1.6);
    showBeat("police");
    c.shot({ from: R(2.6, 2, 2.6), look: R(-0.2, 0.95, 0.4), dur: 6 });
    await say(c, "KESEME", "The question isn't why Dixie Beaux doesn't have enough.");
    await c.caption("Police load confiscated cash into evidence bags.", 2.2);
    bundle.position.set(ROOM.x - 0.55, Y + 1.05, ROOM.z + 1.05);          // into the deputy's jacket
    await c.caption("A deputy quietly removes several bundles.", 2.2);
    room.visible = false;

    // back on the observation platform
    const k = keseme.position, yaw = keseme._yaw || 0;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    ledger.position.set(k.x + fx * 0.38, k.y + 1.1, k.z + fz * 0.38);
    ledger.rotation.set(0.5, yaw, 0);
    ledger.visible = true;
    c.shot({ from: [k.x + fx * 2 + fz * 0.8, k.y + 1.6, k.z + fz * 2 - fx * 0.8], look: [k.x, k.y + 1.3, k.z], dur: 5 });
    await say(c, "KESEME", "The question is—");
    await c.caption("Keseme closes the ledger.", 1.6);
    ledger.rotation.x = 1.2;
    await say(c, "KESEME", "Who keeps taking it?");
    await c.black(true, 0.6);
    ledger.visible = false;
    montage.visible = false;
    for (const r of runners) r.t = -1;
  }

  /**
   * The doors open on OrleaRouge: helicopters, sirens, the last lines, ACT ONE BEGINS.
   * Call with the screen black and the player already standing at SURFACE.
   */
  async function surfaceScene(c, { keseme, crew }) {
    const [solange, mally, bubba] = crew;
    const spots = [[solange, -2.2, 1.4], [mally, 2.2, 1], [bubba, 0.6, 2.4]];
    for (const [a, dx, dz] of spots) { a.visible = true; place(a, SURFACE.x + dx, 0, SURFACE.z + dz, SURFACE.x + dx, SURFACE.z - 60); scene.add(a); if (!actors.includes(a)) actors.push(a); }
    place(keseme, SURFACE.x, 0, SURFACE.z, SURFACE.x, SURFACE.z - 60);
    surfaceActor = keseme;              // nolantis.js stops animating her once the cavern is out of view
    helis.visible = true;
    c.shot({ from: [SURFACE.x + 1.2, 2.2, SURFACE.z + 6], to: [SURFACE.x + 0.8, 2.6, SURFACE.z + 5], look: [SKYLINE.x, 30, SKYLINE.z], dur: 7 });
    await c.black(false, 0.8);
    await c.caption("The doors open.", 1.4);
    c.sfx("siren", 0.7);
    await c.caption("Police helicopters sweep across the distant skyline.", 2.6);
    c.sfx("siren", 0.5);
    await c.caption("Sirens echo.", 1.4);
    moveTo(keseme, SURFACE.x, SURFACE.z - 2.2, 1.2);
    await c.caption("Keseme steps forward.", 1.6);
    c.shot({ from: [SURFACE.x - 2.6, 1.8, SURFACE.z + 1.2], look: [SURFACE.x, 1.6, SURFACE.z - 2.2], dur: 3 });
    await say(c, "KESEME", "After that—");
    c.shot({ from: [SURFACE.x + 0.3, 1.72, SURFACE.z - 4.6], look: [SURFACE.x, 1.62, SURFACE.z - 2.2], dur: 4 });
    await c.caption("She looks toward Dixie Beaux.", 1.6);
    await say(c, "KESEME", "—we become extremely inconvenient.");
    await c.black(true, 0.05);
    await c.caption("CUT TO BLACK.", 1);
    await c.title("GRAND THEFT BAYOU", 2.4);
    await c.card("", "ACT ONE BEGINS", "", { center: true, hold: 3 });
    for (const [a] of spots) a.visible = false;
    helis.visible = false;
    surfaceActor = null;
  }

  function moveTo(a, x, z, speed) {
    return new Promise((resolve) => {
      const i = movers.findIndex((m) => m.obj === a);
      if (i >= 0) { movers[i].resolve(); movers.splice(i, 1); }
      movers.push({ obj: a, x, z, speed, resolve });
    });
  }

  return {
    SURFACE,
    get props() { return props; },
    get cast() { return cast; },
    buildSet() {
      buildOffice();
      buildRoom();
      buildMontage();
      buildHelicopters();
      return props;
    },
    officeScene,
    montageScene,
    surfaceScene,

    update(dt) {
      t += dt;
      if (office && office.visible) {
        footageT += dt;
        if ((footageT % 0.15) < dt) drawFootage();
      }
      for (const r of runners) {
        if (r.t < 0) continue;
        r.t += dt;
        r.obj.position.z = r.z0 + r.dir * r.speed * r.t;
      }
      if (helis && helis.visible) {
        for (const q of helis.userData.list) {
          const a = t * q.speed + q.phase;
          q.h.position.set(SKYLINE.x + Math.cos(a) * q.r, q.y, SKYLINE.z + Math.sin(a) * q.r);
          q.h.rotation.y = -a;
          q.rotor.rotation.y = t * 22;
          q.beam.rotation.z = Math.sin(t * 0.7 + q.phase) * 0.35;
        }
      }
      for (let i = movers.length - 1; i >= 0; i--) {
        const m = movers[i], p = m.obj.position;
        const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz), step = m.speed * dt;
        if (cine.skipping || d <= step) { p.x = m.x; p.z = m.z; if (m.obj.play) m.obj.play("idle"); movers.splice(i, 1); m.resolve(); continue; }
        p.x += (dx / d) * step; p.z += (dz / d) * step;
        if (m.obj.play) m.obj.play("walk");
      }
      for (const a of actors) {
        let v = a.visible, o = a.parent;
        while (v && o && o !== scene) { v = o.visible; o = o.parent; }
        if (v && a.update) a.update(dt, ctx.camera);
      }
      if (surfaceActor && state.cinematic && surfaceActor.update) surfaceActor.update(dt, ctx.camera);
    },
  };
}
