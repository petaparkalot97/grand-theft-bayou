// ---------------------------------------------------------------------------
// cemetery.js — OrleaRouge's "city of the dead", and the ghost who keeps it.
//
// Built to St. Louis No. 1 in New Orleans rather than to a lawn of headstones:
// the water table there is a metre down, so nobody is buried *in* the ground.
// Everything that reads as that cemetery is here —
//
//   oven vaults   the perimeter wall IS the cemetery. Stacked rented vaults,
//                 three tablets high, plastered and whitewashed, closed with
//                 engraved marble tablets. Called "fours" (ovens) because a
//                 year and a day in a New Orleans summer is all it takes.
//   step tombs    family tombs above ground: a plastered brick box of two or
//                 three receding tiers with a cornice, a cross or an urn on
//                 top, and the family's tablet on the face.
//   society tomb  the big multi-vault tombs the benevolent societies built for
//                 members who had nobody — wider, domed, with columns.
//   the alleys    narrow, crooked, staggered row to row. Wide enough to walk,
//                 never wide enough to drive: the gate itself is under 3.2 m of
//                 clear opening, and every alley is tighter still. (bluelight.js
//                 "Lose them among the tombs" depends on exactly that.)
//   the Glapion tomb
//                 three tiers, whitewashed, the most visited grave in the
//                 United States. Marie Laveau — the Voodoo Queen of New
//                 Orleans, 1801–1881 — is said to lie in it. People still
//                 leave offerings at its foot: coins, beads, candles, flowers,
//                 a pour of rum. They used to mark it with XXX and ask for
//                 something; the archdiocese has repainted it more than once.
//
// And the cameo: after dark her ghost walks the alleys. She is not a threat and
// cannot be fought or killed — she patrols, she objects to a gun going off over
// her dead, and she'll take an offering at her own tomb and give something back.
// See `createCemetery` for what main.js has to pass in.
// ---------------------------------------------------------------------------

import * as THREE from "three";

// ---------------------------------------------------------------- layout
const WALL_T = 0.7;          // the oven-vault wall's thickness
const WALL_H = 3.3;          // three tablets high, plus the coping
const GATE_W = 3.2;          // clear opening: a person fits, a car (r 1.8) does not
const TOMB_W = 1.9;          // a family tomb's frontage
const TOMB_D = 2.3;
const TOMB_R = 1.45;         // its blocker. Sized so the alleys pass a walker (r 0.6)
const ROW_PITCH = 4.7;       // and stop a car (r 1.8): 4.7 - 2*1.45 = 1.8 m of alley
const COL_PITCH = 3.2;       // along a row, 0.3 m — shoulder to shoulder, impassable

/** Deterministic layout: the same cemetery every run, and the same on every machine. */
function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {object} ctx  from orlearouge.js, which gets it from main.js:
 *   scene, addBlocker(x, z, r), poolLight(color, power, range, x, y, z),
 *   state, playerPos, cine, flashObjective(text), syncHUD(),
 *   isNight(), makeHoodrat(opts)
 * @param {{x0:number,x1:number,z0:number,z1:number,cx:number,cz:number}} b
 *   the city block the cemetery fills (orlearouge.js `blocks()`)
 */
export function createCemetery(ctx, b) {
  const { scene, state, playerPos } = ctx;
  const rnd = mulberry(18011881);            // her dates, for luck
  const props = [];                          // anything that moves: kept out of batchStatic
  const candles = [];                        // { mat, base, phase } — guttered in update()

  const matCache = new Map();
  function std(name, color, extra = {}) {
    const key = name + ":" + color + JSON.stringify(extra);
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ name, color, ...extra }));
    return matCache.get(key);
  }
  /** A material realize() must not touch — canvas albedo, metal, or anything emissive. */
  function fixed(mat) { mat.userData.gtbRealized = true; return mat; }
  function mesh(geo, mat, x, y, z, { ry = 0, cast = true, parent = scene } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function canvasTex(w, h, draw, repeat = true) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  // ------------------------------------------------------------ materials
  // Plaster over brick, limewashed and going grey — every tomb in the place is
  // the same four ingredients, so they all share one material and batch into one
  // draw call. realize() picks these up as masonry from their names.
  const plaster = std("whitewashed plaster tomb wall", 0xe4e0d4, { roughness: 0.94 });
  const plasterGrey = std("weathered plaster tomb wall", 0xa9a496, { roughness: 0.95 });
  const plasterDark = std("mildewed plaster tomb wall", 0x7d7b70, { roughness: 0.96 });
  const marble = std("marble tomb tablet stone", 0xcfcabb, { roughness: 0.66 });
  const granite = std("granite stone step", 0x6e6b66, { roughness: 0.8 });
  const iron = fixed(new THREE.MeshStandardMaterial({
    name: "wrought iron grille", color: 0x1b1d1f, metalness: 0.75, roughness: 0.46,
  }));
  const TOMB_SKINS = [plaster, plaster, plaster, plasterGrey, plasterGrey, plasterDark];

  /**
   * The oven-vault face: rows of rented vaults closed with marble tablets, each
   * in its own plastered frame. Drawn rather than modelled — the wall is 130 m
   * of it all told, and 380 tablets as boxes would be 380 meshes for something
   * you read as a texture from two metres away.
   */
  const ovenTex = canvasTex(512, 384, (g, w, h) => {
    g.fillStyle = "#cdc7b7"; g.fillRect(0, 0, w, h);
    const cols = 4, rows = 3, cw = w / cols, ch = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw, y = r * ch;
        // the plastered frame, then the recess, then the closure tablet
        g.fillStyle = "#e0dac9"; g.fillRect(x + 3, y + 3, cw - 6, ch - 6);
        g.fillStyle = "#8f8a7c"; g.fillRect(x + 11, y + 11, cw - 22, ch - 22);
        const shade = 0.82 + ((r * 7 + c * 13) % 5) * 0.045;     // no two tablets the same
        const v = Math.round(196 * shade);
        g.fillStyle = `rgb(${v},${v - 6},${v - 18})`;
        g.fillRect(x + 14, y + 14, cw - 28, ch - 28);
        // the engraving, illegible at this distance and meant to be
        g.strokeStyle = "rgba(60,56,48,0.5)"; g.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
          const ly = y + 30 + i * 13;
          const lw = (cw - 44) * (0.45 + ((r + c + i) % 4) * 0.16);
          g.beginPath(); g.moveTo(x + 22, ly); g.lineTo(x + 22 + lw, ly); g.stroke();
        }
        // The occasional vault standing open — the tablet gone, the brick
        // showing. Rare on purpose: at one in five the whole wall read as a
        // pegboard rather than as masonry.
        if ((r * 4 + c * 5) % 11 === 0) {
          g.fillStyle = "#4a443a"; g.fillRect(x + 14, y + 14, cw - 28, ch - 28);
          g.fillStyle = "#2b2823"; g.fillRect(x + 18, y + 18, cw - 36, ch - 36);
        }
      }
    }
    // damp climbing out of the ground, and a century of rain down the face
    const damp = g.createLinearGradient(0, h, 0, h * 0.45);
    damp.addColorStop(0, "rgba(72,80,62,0.55)"); damp.addColorStop(1, "rgba(72,80,62,0)");
    g.fillStyle = damp; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(120,116,102,${0.05 + Math.random() * 0.12})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 6 + Math.random() * 40);
    }
  });
  const ovenMat = fixed(new THREE.MeshStandardMaterial({
    name: "oven vault wall", map: ovenTex, roughness: 0.95, metalness: 0,
  }));

  /** Marie Laveau's tablet: her name, her dates, and the XXX people keep leaving. */
  const glapionTex = canvasTex(256, 320, (g, w, h) => {
    g.fillStyle = "#d8d2c2"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {                               // marble, not paper
      g.fillStyle = `rgba(150,146,134,${0.04 + Math.random() * 0.1})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 20, 1);
    }
    g.fillStyle = "#3b372f"; g.textAlign = "center";
    g.font = "bold 25px Georgia"; g.fillText("FAMILLE", w / 2, 52);
    g.font = "bold 31px Georgia"; g.fillText("VVE. PARIS", w / 2, 92);
    g.font = "bold 27px Georgia"; g.fillText("née LAVEAU", w / 2, 128);
    g.font = "20px Georgia"; g.fillText("1801  —  1881", w / 2, 172);
    g.font = "italic 17px Georgia"; g.fillText("ci-gît", w / 2, 206);
    // the marks: three crosses, asked for and never washed off for long
    g.strokeStyle = "rgba(160,52,40,0.72)"; g.lineWidth = 5; g.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const cx = 62 + i * 66, cy = 258, s = 15;
      g.beginPath();
      g.moveTo(cx - s, cy - s); g.lineTo(cx + s, cy + s);
      g.moveTo(cx + s, cy - s); g.lineTo(cx - s, cy + s);
      g.stroke();
    }
  }, false);
  const glapionMat = fixed(new THREE.MeshStandardMaterial({
    name: "glapion tablet", map: glapionTex, roughness: 0.62, metalness: 0,
  }));

  const gateSignTex = canvasTex(512, 96, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = "#12140f"; g.font = "bold 46px Georgia";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("ST. LOUIS  No. 1", w / 2, h / 2 + 2);
  }, false);
  const gateSignMat = fixed(new THREE.MeshStandardMaterial({
    name: "cemetery gate sign", map: gateSignTex, transparent: true,
    color: 0x2a2c26, metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide,
  }));

  const flameMat = () => fixed(new THREE.MeshBasicMaterial({
    name: "votive flame", color: new THREE.Color(0xffb04a).multiplyScalar(3.2),
  }));

  // ------------------------------------------------------------ the walls
  // Every wall is vaults on both faces, so it is drawn as one box with the oven
  // texture tiled to its own length: ~0.85 m per tablet, ~1.05 m per row.
  function vaultWall(len, x, z, ry) {
    const g = new THREE.BoxGeometry(len, WALL_H, WALL_T);
    const uv = g.attributes.uv, n = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      if (Math.abs(n.getY(i)) > 0.5) continue;                     // the coping covers the top
      const side = Math.abs(n.getX(i)) > 0.5 ? WALL_T : len;
      uv.setXY(i, (uv.getX(i) * side) / 3.4, (uv.getY(i) * WALL_H) / 3.3);
    }
    mesh(g, ovenMat, x, WALL_H / 2, z, { ry });
    // the coping: a plastered cap that throws the wall's shadow line
    const cap = ry ? new THREE.BoxGeometry(WALL_T + 0.24, 0.22, len) : new THREE.BoxGeometry(len, 0.22, WALL_T + 0.24);
    mesh(cap, plasterGrey, x, WALL_H + 0.11, z, { cast: false });
  }

  function buildWalls() {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    // north, east, west — solid. South is the street face and carries the gate.
    vaultWall(w, b.cx, b.z1, 0);
    vaultWall(d, b.x0, b.cz, Math.PI / 2);
    vaultWall(d, b.x1, b.cz, Math.PI / 2);
    const seg = (w - GATE_W) / 2;
    vaultWall(seg, b.x0 + seg / 2, b.z0, 0);
    vaultWall(seg, b.x1 - seg / 2, b.z0, 0);

    for (let x = b.x0; x <= b.x1; x += 1.8) {
      ctx.addBlocker(x, b.z1, 0.75);
      if (Math.abs(x - b.cx) > GATE_W / 2 + 0.2) ctx.addBlocker(x, b.z0, 0.75);
    }
    for (let z = b.z0; z <= b.z1; z += 1.8) {
      ctx.addBlocker(b.x0, z, 0.75);
      ctx.addBlocker(b.x1, z, 0.75);
    }

    // the gate: two plastered piers, an iron arch, and the name across it
    for (const side of [-1, 1]) {
      const px = b.cx + side * (GATE_W / 2 + 0.45);
      mesh(new THREE.BoxGeometry(0.9, WALL_H + 0.7, WALL_T + 0.3), plasterGrey, px, (WALL_H + 0.7) / 2, b.z0);
      mesh(new THREE.SphereGeometry(0.3, 12, 10), marble, px, WALL_H + 1.2, b.z0);
      ctx.addBlocker(px, b.z0, 0.7);
      // the leaf, swung back against its pier and left that way for a century
      const leaf = new THREE.Group();
      leaf.position.set(px - side * 0.4, 0, b.z0 + 0.45);
      leaf.rotation.y = side * 1.15;
      scene.add(leaf);
      mesh(new THREE.BoxGeometry(1.5, 0.07, 0.07), iron, -0.75 * side, 0.2, 0, { parent: leaf, cast: false });
      mesh(new THREE.BoxGeometry(1.5, 0.07, 0.07), iron, -0.75 * side, 2.3, 0, { parent: leaf, cast: false });
      for (let i = 0; i <= 7; i++) {
        mesh(new THREE.BoxGeometry(0.05, 2.35, 0.05), iron, -side * (0.06 + i * 0.2), 1.2, 0, { parent: leaf, cast: false });
      }
    }
    const arch = mesh(new THREE.BoxGeometry(GATE_W + 1.9, 0.14, 0.1), iron, b.cx, WALL_H + 0.55, b.z0, { cast: false });
    arch.receiveShadow = false;
    mesh(new THREE.PlaneGeometry(GATE_W + 1.7, 0.62), gateSignMat, b.cx, WALL_H + 1.0, b.z0 + 0.06, { cast: false });
  }

  // ------------------------------------------------------------ the tombs
  /** One family tomb: two or three receding tiers, a cornice, and something on top. */
  function stepTomb(x, z, { tiers = 2, skin = plaster, ry = 0, tablet = true } = {}) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    scene.add(g);

    const base = 1.55 + rnd() * 0.25;
    mesh(new THREE.BoxGeometry(TOMB_W, base, TOMB_D), skin, 0, base / 2, 0, { parent: g });
    mesh(new THREE.BoxGeometry(TOMB_W + 0.16, 0.12, TOMB_D + 0.16), skin, 0, base + 0.06, 0, { parent: g, cast: false });
    let y = base + 0.12, w = TOMB_W - 0.34, dd = TOMB_D - 0.34;
    for (let t = 1; t < tiers; t++) {
      const h = 0.78 - t * 0.14;
      mesh(new THREE.BoxGeometry(w, h, dd), skin, 0, y + h / 2, 0, { parent: g });
      mesh(new THREE.BoxGeometry(w + 0.14, 0.1, dd + 0.14), skin, 0, y + h + 0.05, 0, { parent: g, cast: false });
      y += h + 0.1; w -= 0.3; dd -= 0.3;
    }
    // the closure tablet on the face, always toward the alley
    if (tablet) {
      mesh(new THREE.BoxGeometry(TOMB_W - 0.5, base - 0.55, 0.06), marble, 0, base / 2 + 0.06, TOMB_D / 2 + 0.03, { parent: g, cast: false });
    }
    // a cross, an urn, or nothing at all
    const cap = rnd();
    if (cap < 0.42) {
      mesh(new THREE.BoxGeometry(0.1, 0.62, 0.1), marble, 0, y + 0.31, 0, { parent: g });
      mesh(new THREE.BoxGeometry(0.38, 0.1, 0.1), marble, 0, y + 0.42, 0, { parent: g, cast: false });
    } else if (cap < 0.62) {
      mesh(new THREE.CylinderGeometry(0.15, 0.1, 0.34, 10), marble, 0, y + 0.17, 0, { parent: g });
      mesh(new THREE.SphereGeometry(0.1, 8, 7), marble, 0, y + 0.39, 0, { parent: g, cast: false });
    }
    ctx.addBlocker(x, z, TOMB_R);
    return g;
  }

  /** The big benevolent-society tomb: vaults for members who had nobody. */
  function societyTomb(x, z, ry = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    scene.add(g);
    const W = 4.6, D = 3.0;
    mesh(new THREE.BoxGeometry(W, 0.3, D + 0.5), granite, 0, 0.15, 0, { parent: g });
    mesh(new THREE.BoxGeometry(W, 3.0, D), plasterGrey, 0, 1.8, 0, { parent: g });
    mesh(new THREE.BoxGeometry(W + 0.3, 0.2, D + 0.3), plasterGrey, 0, 3.4, 0, { parent: g, cast: false });
    // a pediment, and the dome the societies liked
    mesh(new THREE.CylinderGeometry(1.0, 1.3, 0.5, 4), plasterGrey, 0, 3.75, 0, { parent: g, ry: Math.PI / 4 });
    mesh(new THREE.SphereGeometry(0.95, 14, 9, 0, Math.PI * 2, 0, Math.PI / 2), plasterGrey, 0, 3.95, 0, { parent: g });
    mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), marble, 0, 5.3, 0, { parent: g });
    mesh(new THREE.BoxGeometry(0.44, 0.1, 0.1), marble, 0, 5.45, 0, { parent: g, cast: false });
    for (const sx of [-1.7, 1.7]) {                                // columns either side of the face
      mesh(new THREE.CylinderGeometry(0.17, 0.19, 2.8, 12), plasterGrey, sx, 1.7, D / 2 - 0.1, { parent: g });
    }
    for (let r = 0; r < 3; r++) {                                  // its own rank of vault tablets
      for (let c = -1; c <= 1; c++) {
        mesh(new THREE.BoxGeometry(0.86, 0.72, 0.06), marble, c * 0.98, 1.0 + r * 0.82, D / 2 + 0.02, { parent: g, cast: false });
      }
    }
    for (const dx of [-1.5, 0, 1.5]) ctx.addBlocker(x + Math.cos(ry) * dx, z - Math.sin(ry) * dx, 1.6);
    return g;
  }

  /** The pyramid — every old cemetery has the one tomb nobody can explain. */
  function pyramidTomb(x, z) {
    mesh(new THREE.BoxGeometry(3.0, 0.3, 3.0), granite, x, 0.15, z);
    const p = mesh(new THREE.ConeGeometry(2.0, 3.2, 4), std("limestone pyramid tomb stone", 0xdedac9, { roughness: 0.88 }), x, 1.9, z);
    p.rotation.y = Math.PI / 4;
    mesh(new THREE.BoxGeometry(0.8, 1.2, 0.08), marble, x, 0.85, z + 1.02, { cast: false });
    ctx.addBlocker(x, z, 1.9);
  }

  // The field: staggered rows with alleys between them, gaps punched through so
  // there is a way across on foot. Never a straight run wide enough to drive.
  const GAPS = [];                     // the lanes a walker can cross a row by
  function buildField() {
    const ix0 = b.x0 + 4.0, ix1 = b.x1 - 4.4;
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const z = b.z0 + 4.0 + r * ROW_PITCH;
      const off = (r % 2) * (COL_PITCH / 2);                       // stagger, row to row
      const n = Math.floor((ix1 - ix0 - off) / COL_PITCH) + 1;
      // two guaranteed ways through per row, in different places each row, so
      // the field is always crossable however the dice fall
      const cutA = (r * 5 + 2) % n, cutB = (r * 7 + 6) % n;
      for (let i = 0; i < n; i++) {
        const x = ix0 + off + i * COL_PITCH;
        // Leave the Glapion tomb an apron to be visited from. Without it the
        // last row stands 1.25 m off her step — a gap a walker is 1.2 m wide
        // for, which is to say no gap at all, and the most visited grave in the
        // country could not be walked up to.
        if (Math.abs(x - TOMB.x) < 3.6 && z > TOMB.z - 7.5) { GAPS.push({ x, z }); continue; }
        if (i === cutA || i === cutB || rnd() < 0.12) { GAPS.push({ x, z }); continue; }
        stepTomb(x, z, {
          tiers: rnd() < 0.35 ? 3 : 2,
          skin: TOMB_SKINS[(rnd() * TOMB_SKINS.length) | 0],
          ry: (rnd() - 0.5) * 0.12,                                // a century of settling
        });
      }
    }
    societyTomb(b.x0 + 6.4, b.z1 - 3.0, 0);
    societyTomb(b.x1 - 6.6, b.z1 - 3.0, 0);
    pyramidTomb(b.x1 - 3.4, b.z0 + 5.2);
  }

  // ------------------------------------------------------- the Glapion tomb
  const TOMB = { x: b.cx, z: b.z1 - 3.4 };      // hers, against the back wall
  // Where you stand to leave something. Clear of the tomb's own blocker (r 1.8)
  // by a walker's radius and then some — at 2.4 it was exactly on the edge of
  // it, so the one spot the game called "her step" was the one spot you could
  // not stand on.
  const OFFERING = { x: TOMB.x, z: TOMB.z - 3.2 };
  function buildLaveauTomb() {
    const g = new THREE.Group();
    g.position.set(TOMB.x, 0, TOMB.z);
    scene.add(g);
    const W = 2.3, D = 2.6;
    mesh(new THREE.BoxGeometry(W + 0.7, 0.24, D + 0.9), granite, 0, 0.12, -0.2, { parent: g });
    // three tiers, plain — it is famous for who is in it, not for what it is
    mesh(new THREE.BoxGeometry(W, 1.75, D), plaster, 0, 1.0, 0, { parent: g });
    mesh(new THREE.BoxGeometry(W + 0.18, 0.13, D + 0.18), plaster, 0, 1.94, 0, { parent: g, cast: false });
    mesh(new THREE.BoxGeometry(W - 0.4, 0.72, D - 0.4), plaster, 0, 2.36, 0, { parent: g });
    mesh(new THREE.BoxGeometry(W - 0.24, 0.12, D - 0.24), plaster, 0, 2.78, 0, { parent: g, cast: false });
    mesh(new THREE.BoxGeometry(W - 0.86, 0.5, D - 0.86), plaster, 0, 3.09, 0, { parent: g });
    mesh(new THREE.BoxGeometry(0.11, 0.7, 0.11), marble, 0, 3.69, 0, { parent: g });
    mesh(new THREE.BoxGeometry(0.46, 0.11, 0.11), marble, 0, 3.86, 0, { parent: g, cast: false });
    mesh(new THREE.PlaneGeometry(1.5, 1.2), glapionMat, 0, 1.15, D / 2 + 0.02, { parent: g, cast: false });

    // what people leave at the foot of it
    const bead = [0x9b2fae, 0x2f8f4f, 0xd4af37, 0x2f5fae];
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, rr = 0.9 + rnd() * 1.3;
      const px = Math.sin(a) * rr, pz = D / 2 + 0.35 + Math.cos(a) * rr * 0.55;
      const pick = rnd();
      if (pick < 0.34) {                                            // beads
        const m = fixed(new THREE.MeshStandardMaterial({ name: "glass bead", color: bead[(rnd() * 4) | 0], roughness: 0.28, metalness: 0.1 }));
        for (let k = 0; k < 7; k++) {
          mesh(new THREE.SphereGeometry(0.035, 6, 5), m, px + Math.sin(k) * 0.09, 0.27, pz + Math.cos(k) * 0.09, { parent: g, cast: false });
        }
      } else if (pick < 0.62) {                                     // coins, face up
        const c = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 10),
          fixed(new THREE.MeshStandardMaterial({ name: "coin", color: 0xb98a3a, metalness: 0.85, roughness: 0.4 })),
          px, 0.255, pz, { parent: g, cast: false });
        c.rotation.z = rnd() * 0.3;
      } else if (pick < 0.86) {                                     // votive candles
        const wax = std("candle wax", 0xf0e6cf, { roughness: 0.7 });
        mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 9), wax, px, 0.34, pz, { parent: g, cast: false });
        const fm = flameMat();
        const fl = mesh(new THREE.ConeGeometry(0.035, 0.1, 6), fm, px, 0.48, pz, { parent: g, cast: false });
        candles.push({ mat: fm, mesh: fl, phase: rnd() * 9 });
      } else {                                                      // a pour of rum, bottle left behind
        mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.26, 9),
          fixed(new THREE.MeshStandardMaterial({ name: "rum bottle glass", color: 0x3f2a16, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.85 })),
          px, 0.38, pz, { parent: g, cast: false });
      }
    }
    // the light people have kept on her for a hundred and forty years
    ctx.poolLight(0xffb45a, 16, 11, TOMB.x, 0.7, TOMB.z + 1.8);
    ctx.addBlocker(TOMB.x, TOMB.z, 1.8);
  }

  // -------------------------------------------------------------- the ghost
  // Marie built from the same rig as everyone else (characters.js), then made
  // into a ghost: every material cloned off the shared cache first — one
  // untended `.opacity =` on a shared material would fade every Hoodrat in the
  // parish — then washed pale, lit from inside, and stopped from writing depth
  // so the tombs show through her.
  let ghost = null;
  const GHOST_TINT = new THREE.Color(0xdff2ff);
  function buildGhost() {
    ghost = ctx.makeHoodrat({
      sex: "f", seed: 1881, height: 1.69,
      skin: 0xc3b6a6, hair: 0x14100c, top: 0xf6f2e6, denim: 0xece7d8,
      headwear: "band",
      crew: { cloth: 0xf4efe0, accent: 0xf4efe0, chain: 0xd8cfae, shoe: 0xe8e2d2, legging: 0xece7d8, belt: 0xd8cfae },
    });
    ghost.name = "marie-laveau-ghost";

    ghost.material.opacity = 0.44;            // clones every material off the cache
    ghost.traverse((o) => {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
      const m = o.material;
      if (m.color) m.color.lerp(GHOST_TINT, 0.62);
      if (m.emissive) { m.emissive.setHex(0x86c8ff); m.emissiveIntensity = 0.55; }
      m.transparent = true;
      m.depthWrite = false;
      m.fog = true;
      m.userData.gtbRealized = true;          // realize() would hand her skin back
      o.castShadow = false;                   // she doesn't have one
      o.receiveShadow = false;
    });

    // the tignon — the headwrap she is drawn in, seven points, tied up high.
    // (Louisiana's 1786 tignon law told free women of colour to cover their
    // hair; they tied it in madras and silk until it was the fashion.)
    const wrapMat = fixed(new THREE.MeshStandardMaterial({
      name: "tignon wrap", color: 0xf2ece0, emissive: 0x86c8ff, emissiveIntensity: 0.5,
      roughness: 0.9, transparent: true, opacity: 0.5, depthWrite: false,
    }));
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.128, 0.2, 14), wrapMat);
    wrap.position.y = 0.2;
    ghost.head.add(wrap);
    const knot = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.17, 8), wrapMat);
    knot.position.set(0.03, 0.33, -0.02);
    knot.rotation.z = -0.4;
    ghost.head.add(knot);
    ghost._wrap = wrapMat;

    // A long white shift over the rig, and no feet at all: she is always drawn
    // this way, and it also means she needs no walk cycle — she doesn't walk.
    for (const l of ghost.legs) l.pivot.visible = false;
    const shroudMat = fixed(new THREE.MeshStandardMaterial({
      name: "grave shroud", color: 0xe8f4ff, emissive: 0x78bcff, emissiveIntensity: 0.6,
      roughness: 1, transparent: true, opacity: 0.34, depthWrite: false,
      side: THREE.DoubleSide,
    }));
    const bodice = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.245, 0.48, 14, 1, true), shroudMat);
    bodice.position.y = 1.23;
    ghost.add(bodice);
    // the skirt: apex at the hips, open at the hem, and the hem never reaches
    // the ground because she is never standing on it
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.2, 18, 1, true), shroudMat);
    skirt.position.y = 0.6;
    ghost.add(skirt);
    ghost._shroud = shroudMat;

    ghost.visible = false;
    ghost.position.set(PATH[0].x, 0, PATH[0].z);
    scene.add(ghost);
    props.push(ghost);                        // she moves: main.js keeps her out of batchStatic

    // a cold light that travels with her, so she lights the tombs she passes
    ghost._glow = ctx.poolLight(0x9fd6ff, 0, 9, PATH[0].x, 1.3, PATH[0].z);
  }

  // Her round: down the alleys, one after another, and home to her own tomb.
  // Alley centres, so she does not walk through the stone she is looking after.
  const PATH = (() => {
    const ax = b.x0 + 2.2, bx = b.x1 - 2.4;                         // the perimeter lanes
    const out = [];
    for (let r = 0; r < 4; r++) {
      const z = b.z0 + 4.0 + r * ROW_PITCH + ROW_PITCH / 2;
      out.push({ x: r % 2 ? bx : ax, z }, { x: r % 2 ? ax : bx, z });
    }
    out.push({ x: ax, z: b.z1 - 4.6 }, { x: TOMB.x, z: TOMB.z - 2.6 });
    return out;
  })();

  // ------------------------------------------------------------- behaviour
  const promptEl = document.createElement("div");
  promptEl.id = "cemeteryPrompt";
  promptEl.hidden = true;
  document.body.appendChild(promptEl);
  const css = document.createElement("style");
  css.textContent = `#cemeteryPrompt { position: fixed; left: 50%; bottom: 132px; transform: translateX(-50%);
    z-index: 22; padding: 7px 14px; border-radius: 8px; font: 500 14px/1.35 system-ui, sans-serif;
    color: #e8f4ff; background: rgba(8,12,18,0.76); border: 1px solid rgba(140,200,255,0.34);
    box-shadow: 0 0 18px rgba(90,170,255,0.18); pointer-events: none; text-align: center; }
    #cemeteryPrompt b { color: #9fd6ff; }
    body.letterbox #cemeteryPrompt { display: none; }`;
  document.head.appendChild(css);

  const OFFERING_COST = 20;
  const OFFERING_HEAL = 35;
  let leg = 0, legT = 0, waiting = 0;         // where she is on her round
  let presence = 0;                           // 0 gone, 1 fully there
  let met = false;                            // the first time you find her
  let offerCd = 0;                            // the ritual is not a vending machine
  let sulk = 0;                               // she withdraws after a gunshot
  let lastFireCd = 0;                         // a rise in state.fireCd means a shot
  let scolded = 0;
  let prompt = false;
  let t = 0;
  // keeping her ground (see keepsHerGround): one cooldown per kind of thing she
  // objects to, so she does not talk over herself in a running fight
  let copCd = 0, klanCd = 0, hurtCd = 0, mournCd = 0;
  let lastHp = 100;
  let sanctuaryMet = false;

  /** Inside the walls (the cemetery proper), not merely on the block. */
  function inside(x, z) {
    return x > b.x0 + WALL_T && x < b.x1 - WALL_T && z > b.z0 + WALL_T && z < b.z1 - WALL_T;
  }

  function greet() {
    met = true;
    ctx.cine.scene(async (c) => {
      c.card("EXT.", "ST. LOUIS No. 1", "The city of the dead");
      await c.wait(0.9);
      await c.say("MARIE LAVEAU", "Easy, child. Nobody in here can hurt you.");
      await c.say("MARIE LAVEAU", "They tried burying folks in the ground once. River gave them right back.");
      await c.say("MARIE LAVEAU", "So we built them houses instead. I keep them.");
      await c.say("KESEME", "…And who keeps you?");
      await c.say("MARIE LAVEAU", "Hm. Leave something at my step and find out.");
    });
  }

  function scold() {
    scolded++;
    sulk = 26;
    ctx.flashObjective(scolded > 1
      ? "MARIE LAVEAU: \"I said not over my dead. Get out.\""
      : "MARIE LAVEAU: \"Not in here. Not over my dead.\"");
  }

  // ------------------------------------------------ she keeps her own ground
  // She was only ever pointed at the player: fire a gun and she scolds *you*.
  // That made the one figure in the parish who is explicitly looking after
  // people into another thing telling Keseme off. The rest of it is here — what
  // she does about the people doing the actual harm.
  //
  // Three things happen on her ground after dark, and none of them is a fight:
  // she has no hands. She has standing.
  //
  //   sanctuary   Nobody is taken off this ground in handcuffs. A wanted level
  //               inside the walls is broken outright — pursuit cleared, heat to
  //               zero. Distinct from newton.js's copwatch on purpose: his is
  //               gradual, procedural and about the paperwork; hers is instant,
  //               total, and only inside consecrated ground. It also finally
  //               makes bluelight.js's "lose them among the tombs" a mechanic
  //               rather than a hope about the terrain.
  //   the mob     A klansman who walks in here gets broken and runs. They are
  //               `brave` everywhere else in the game (npc.js) and it does not
  //               help them in a graveyard.
  //   the harmed  She names it when Keseme is hurt on her ground, and when
  //               somebody who was not in the fight is killed on it.
  const COP_LINES = [
    "MARIE LAVEAU: \"Put it away. Nobody leaves this ground in handcuffs.\"",
    "MARIE LAVEAU: \"A badge, a debt, and somebody else's hand in your pocket. Which one's doing the arresting?\"",
    "MARIE LAVEAU: \"She's trying to mend what you're paid to look past. Go home.\"",
    "MARIE LAVEAU: \"I have buried better men than you for less. Off my ground.\"",
  ];
  const KLAN_LINES = [
    "MARIE LAVEAU: \"You came to a graveyard in a bedsheet. Look around — you are outnumbered.\"",
    "MARIE LAVEAU: \"Every soul in this ground is standing up. RUN.\"",
    "MARIE LAVEAU: \"Hoods. In my house. Take them off or take them out of here.\"",
  ];
  const HURT_LINES = [
    "MARIE LAVEAU: \"They put hands on you. On MY ground.\"",
    "MARIE LAVEAU: \"Behind me, child. Bleed later.\"",
  ];
  const MOURN_LINES = [
    "MARIE LAVEAU: \"That one was helping. Somebody is going to answer for that one.\"",
    "MARIE LAVEAU: \"They were trying to do some good in Dixie Beaux. Now they're mine to keep.\"",
  ];
  const pick = (a, i) => a[i % a.length];

  function keepsHerGround(dt) {
    copCd -= dt; klanCd -= dt; hurtCd -= dt; mournCd -= dt;
    if (presence < 0.5) { lastHp = state.hp; return; }
    const hereNow = inside(playerPos.x, playerPos.z) && !state.veh;

    // ---- sanctuary ----
    // `crimeCd` gates it the same way it gates the game's own heat decay: she
    // will not stand over a crime still in progress, any more than Newton will.
    if (hereNow && state.heat > 0 && state.crimeCd <= 0) {
      const wasWanted = state.wanted > 0;
      if (ctx.police) ctx.police.clearPursuit();
      state.heat = 0;
      state.wanted = 0;
      ctx.syncHUD();
      if (wasWanted && copCd <= 0) {
        copCd = 14;
        ctx.flashObjective(pick(COP_LINES, scolded + (t | 0)));
        if (!sanctuaryMet) {
          sanctuaryMet = true;
          ctx.cine.scene(async (c) => {
            await c.say("MARIE LAVEAU", "They don't come in here after anybody. Not since the fever years.");
            await c.say("MARIE LAVEAU", "Half this parish is in this ground because of what men like that wouldn't do.");
            await c.say("MARIE LAVEAU", "So they can stand at the gate and think about it.");
          });
        }
      }
    }

    // ---- the mob ----
    // `_marieBroke` per man, not a timer: she scatters them all the way out, so
    // without it she re-scolded every 12 s for as long as anyone was still
    // running — which talked straight over the lines below. She says it once to
    // each of them and then lets them go.
    let broke = 0;
    for (const e of ctx.enemies || []) {
      if (e.dead || e.type !== "klansman" || e._marieBroke) continue;
      const p = e.spr.position;
      if (!inside(p.x, p.z)) continue;
      if (ctx.npcs && ctx.npcs.scatter) ctx.npcs.scatter(e, TOMB.x, TOMB.z);
      e._marieBroke = true;
      broke++;
    }
    if (broke && klanCd <= 0) {
      klanCd = 12;
      for (const c of candles) c.flare = 1;
      ctx.flashObjective(pick(KLAN_LINES, broke + (t | 0)));
    }

    // ---- the harmed ----
    if (hereNow && state.hp < lastHp - 0.5 && hurtCd <= 0) {
      hurtCd = 9;
      ctx.flashObjective(pick(HURT_LINES, (t | 0)));
    }
    lastHp = state.hp;

    // somebody killed on her ground who was not the one swinging
    for (const e of ctx.enemies || []) {
      if (!e.dead || e._marieKept || e.type === "klansman") continue;
      const p = e.spr.position;
      if (!inside(p.x, p.z)) continue;
      e._marieKept = true;
      if (mournCd > 0) continue;
      mournCd = 11;
      ctx.flashObjective(pick(MOURN_LINES, (t | 0)));
    }
  }

  /** The offering, at her step: a little money for a little of whatever she has. */
  function interact() {
    if (!prompt || state.veh || state.cinematic) return false;
    if (state.cash < OFFERING_COST) {
      ctx.flashObjective(`An offering runs $${OFFERING_COST}. You've got $${state.cash}.`);
      return true;
    }
    state.cash -= OFFERING_COST;
    state.hp = Math.min(100, state.hp + OFFERING_HEAL);
    ctx.syncHUD();
    offerCd = 45;
    for (const c of candles) c.flare = 1;
    ctx.cine.scene(async (c) => {
      await c.caption("Three crosses on the stone. A coin at the step. The candles stand up straight.");
      await c.say("MARIE LAVEAU", "Asked and answered. Go on — and don't come back bleeding.");
    });
    return true;
  }

  function update(dt) {
    t += dt;

    // the candles never stop moving, offering or no
    for (const c of candles) {
      if (c.flare) c.flare = Math.max(0, c.flare - dt * 0.6);
      const s = 2.6 + Math.sin(t * 7 + c.phase) * 0.55 + Math.sin(t * 19 + c.phase) * 0.25;
      c.mat.color.setHex(0xffb04a).multiplyScalar(s * (1 + (c.flare || 0) * 1.8));
      c.mesh.scale.setScalar(1 + (c.flare || 0) * 0.5);
    }
    if (!ghost) return;

    const here = inside(playerPos.x, playerPos.z) && !state.veh;

    // a gun going off in here is the one thing she will not have. state.fireCd
    // is set by the shot and decays every frame, so a rise in it is a shot —
    // no new hook in main.js just to be told about one.
    if (state.fireCd > lastFireCd + 0.01 && here) scold();
    lastFireCd = state.fireCd;
    if (sulk > 0) sulk -= dt;
    if (offerCd > 0) offerCd -= dt;

    // she is a night thing, and she keeps away while she is cross with you
    const wanted = ctx.isNight() && sulk <= 0 ? 1 : 0;
    presence += (wanted - presence) * Math.min(1, dt * 0.55);
    ghost.visible = presence > 0.02;
    if (!ghost.visible) { ghost._glow.power = 0; promptEl.hidden = true; prompt = false; return; }

    // her round: alley to alley, then a long stop at her own tomb
    const from = PATH[leg], to = PATH[(leg + 1) % PATH.length];
    if (waiting > 0) {
      waiting -= dt;
    } else {
      const d = Math.hypot(to.x - from.x, to.z - from.z);
      legT += (dt * 0.9) / Math.max(0.001, d);
      if (legT >= 1) {
        legT = 0;
        leg = (leg + 1) % PATH.length;
        if (leg === 0) waiting = 9;                    // home, and in no hurry
      }
    }
    const k = legT * legT * (3 - 2 * legT);
    const gx = from.x + (to.x - from.x) * k;
    const gz = from.z + (to.z - from.z) * k;
    // `baseY` is the rig's own floor — set the hover there, because the idle
    // clip writes position.y from it every frame and would undo anything else.
    ghost.baseY = 0.24 + Math.sin(t * 0.9) * 0.07;                  // she does not touch the ground
    ghost.position.set(gx, ghost.baseY, gz);
    ghost.update(dt);                                               // the rig turns her the way she is going
    ghost._glow.x = gx; ghost._glow.z = gz;
    ghost._glow.power = 14 * presence;

    // she fades with distance as well as with the hour — up close she is almost
    // solid, from the gate she is a smear of cold light between the tombs
    const near = Math.hypot(playerPos.x - gx, playerPos.z - gz);
    const solid = presence * THREE.MathUtils.clamp(1.25 - near / 26, 0.25, 1);
    ghost.material.opacity = 0.5 * solid;
    ghost._shroud.opacity = 0.36 * solid;
    ghost._wrap.opacity = 0.52 * solid;

    if (here && !met && near < 17 && !state.cinematic) greet();
    keepsHerGround(dt);

    // the offering prompt, at her step
    const atStep = here && Math.hypot(playerPos.x - OFFERING.x, playerPos.z - OFFERING.z) < 2.6;
    prompt = !!(atStep && offerCd <= 0 && !state.cinematic);
    if (prompt) {
      promptEl.innerHTML = `<b>F</b> · Leave an offering at Marie Laveau's tomb: $${OFFERING_COST} (+${OFFERING_HEAL} HP)`;
      promptEl.hidden = false;
    } else {
      promptEl.hidden = true;
    }
  }

  // ------------------------------------------------------------------ build
  buildWalls();
  buildField();
  buildLaveauTomb();
  buildGhost();

  return {
    update,
    interact,
    /** Anything that moves — main.js excludes these from batchStatic. */
    get props() { return props; },
    /** QA / debug: where the set pieces actually landed. */
    debug: { tomb: TOMB, offering: OFFERING, gate: { x: b.cx, z: b.z0 }, path: PATH, gaps: GAPS,
      get ghost() { return ghost; }, get presence() { return presence; },
      inside: (x, z) => inside(x, z), get sanctuaryMet() { return sanctuaryMet; } },
  };
}
