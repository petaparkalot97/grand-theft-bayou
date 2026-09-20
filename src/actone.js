// ---------------------------------------------------------------------------
// actone.js — ACT ONE "Welcome Home": Tusouxroe.
//
// From the script: Keseme drives into Tusouxroe to the radio's redevelopment
// gag, rolls into South Tusouxroe (kids on the court, dominoes, a woman selling
// plates off her porch, two crews staring each other down under a luxury-condo
// billboard), goes home to her mother Emiko, and lays the ledger out on the
// kitchen table. The evidence board ties the names to PELICAN CROWN HOLDINGS
// and PROJECT NOLANTIS, and the coordinates point south, to OrleaRouge.
//
// The neighbourhood is built in the empty north-east corner of the map. The
// kitchen is a sealed room directly under it (y = -40): nothing outside can be
// seen from in there, and the road-mirror pass switches itself off below the
// road plane.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { createLedgerBoard } from "./ledgerboard.js";

export const NB = { x: 92, z: -100 };            // South Tusouxroe
const STREET_Z = -106;
const HOME = { x: 100, z: -93, w: 9, d: 8 };      // the Nadia house (door faces the street)
const DOOR = { x: HOME.x, z: HOME.z - HOME.d / 2 - 0.3 };
const ROOM_Y = -40;

function basic(color, extra = {}) {
  const m = new THREE.MeshBasicMaterial({ color, ...extra });
  m.userData.gtbRealized = true;
  return m;
}
function canvasTex(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {object} ctx  from main.js: scene, camera, cine, state, playerPos,
 *   getPlayer(), makeHoodrat(opts), surface(kind, size), makeBillboard(...),
 *   addBlocker(x, z, r), poolLight(color, power, range, x, y, z),
 *   addLitSpot(spot), setObjective(text|null), flashObjective(text),
 *   exitVehicle(), teleport(x, z, heading), startNext()
 */
export function createActOne(ctx) {
  const { scene, cine, state, playerPos } = ctx;
  const say = (c, who, line) => c.say(who, line);
  const board = createLedgerBoard();

  let phase = "idle";        // idle | toCity | arrive | door | inside | done
  let radioDone = false;
  const actors = [];         // everyone in the neighbourhood (updated when near)
  const movers = [];
  let marker = null, ball = null, ballKid = null, ledgerProp = null;
  const cast = {};           // named: emiko, mally, bubba
  let talk = Promise.resolve();

  // ---------------------------------------------------------------- building blocks
  function box(w, h, d, mat, x, y, z, parent = scene, shadow = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function house(cx, cz, { siding, trim, lit = true, boarded = false }) {
    const w = HOME.w, d = HOME.d, h = 3.4;
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    scene.add(g);
    const wall = new THREE.MeshStandardMaterial({ name: "siding wood", color: siding });
    const trimMat = new THREE.MeshStandardMaterial({ name: "trim wood", color: trim });
    box(w, 0.6, d, new THREE.MeshStandardMaterial({ name: "concrete block", color: 0x77756e }), 0, 0.3, 0, g);
    box(w, h, d, wall, 0, 0.6 + h / 2, 0, g);
    // pitched roof from two slabs
    const roofMat = new THREE.MeshStandardMaterial({ name: "roof shingle", color: 0x3b3430 });
    for (const s of [-1, 1]) {
      const r = box(w + 0.8, 0.22, d / 2 + 0.9, roofMat, 0, 0.6 + h + 1.0, s * (d / 4 + 0.1), g);
      r.rotation.x = s * 0.52;
    }
    // porch slab, posts and awning on the street side (-z)
    box(w * 0.7, 0.3, 2.4, new THREE.MeshStandardMaterial({ name: "concrete porch", color: 0x8a877f }), 0, 0.15, -d / 2 - 1.2, g);
    for (const px of [-w * 0.33, w * 0.33]) box(0.18, 2.8, 0.18, trimMat, px, 1.7, -d / 2 - 2.2, g);
    box(w * 0.75, 0.16, 2.6, trimMat, 0, 3.15, -d / 2 - 1.2, g);
    // door and windows
    box(1.1, 2.1, 0.12, new THREE.MeshStandardMaterial({ name: "door wood", color: boarded ? 0x6b5a44 : 0x2e2622 }), 0, 1.65, -d / 2 - 0.02, g);
    const glow = boarded
      ? new THREE.MeshStandardMaterial({ name: "plywood board", color: 0x9a7b52 })
      : lit ? basic(new THREE.Color(0xffc27a).multiplyScalar(1.6)) : basic(0x1a2430);
    for (const wx of [-w * 0.3, w * 0.3]) {
      box(1.5, 1.1, 0.1, glow, wx, 2.2, -d / 2 - 0.03, g, false);
      box(1.7, 0.12, 0.16, trimMat, wx, 1.6, -d / 2 - 0.05, g, false);
    }
    // collision: the house body
    for (const [bx, bz] of [[-w / 4, 0], [w / 4, 0]]) ctx.addBlocker(cx + bx, cz + bz, d / 2);
    return g;
  }

  function buildSet() {
    // the street, from the truck lot east into the neighbourhood
    const asphalt = ctx.surface("asphalt", 1024);
    const len = 124 - 29;
    const street = new THREE.Mesh(new THREE.PlaneGeometry(len, 9), asphalt.material(1));
    for (const t of [street.material.map, street.material.normalMap, street.material.roughnessMap]) {
      if (t) t.repeat.set(len / 9, 1);
    }
    street.rotation.x = -Math.PI / 2;
    street.position.set(29 + len / 2, 0.018, STREET_Z);
    street.receiveShadow = true;
    scene.add(street);

    house(HOME.x, HOME.z, { siding: 0xb7c4b1, trim: 0xefeae0 });        // the Nadia house
    house(82, -93, { siding: 0xd8b98a, trim: 0xf2efe6 });                 // the porch-plates house
    house(64, -93, { siding: 0x8d8a82, trim: 0x6d6a64, boarded: true });   // boarded up

    // "for sale" in front of the boarded house — the name from the ledger
    const sale = canvasTex(512, 256, (x, w, h) => {
      x.fillStyle = "#f4efe4"; x.fillRect(0, 0, w, h);
      x.fillStyle = "#1f3a5a"; x.fillRect(0, 0, w, 58);
      x.fillStyle = "#f4efe4"; x.font = "bold 40px Arial"; x.textAlign = "center"; x.fillText("FOR SALE", w / 2, 44);
      x.fillStyle = "#1f3a5a"; x.font = "bold 34px Georgia"; x.fillText("PELICAN CROWN", w / 2, 128);
      x.font = "italic 30px Georgia"; x.fillText("Realty & Redevelopment", w / 2, 176);
      x.font = "20px Arial"; x.fillText("A Brighter Tusouxroe Is Coming", w / 2, 222);
    });
    const post = box(0.12, 1.8, 0.12, new THREE.MeshStandardMaterial({ name: "steel post", color: 0x444 }), 60.5, 0.9, -99.2);
    post.castShadow = false;
    box(1.6, 0.8, 0.05, new THREE.MeshStandardMaterial({ map: sale, name: "signboard" }), 60.5, 1.9, -99.2);

    // basketball court across the street
    const courtTex = canvasTex(512, 352, (x, w, h) => {
      x.fillStyle = "#6f6c66"; x.fillRect(0, 0, w, h);
      x.strokeStyle = "rgba(240,236,220,.8)"; x.lineWidth = 6;
      x.strokeRect(12, 12, w - 24, h - 24);
      x.beginPath(); x.moveTo(w / 2, 12); x.lineTo(w / 2, h - 12); x.stroke();
      x.beginPath(); x.arc(w / 2, h / 2, 46, 0, 7); x.stroke();
      for (const s of [0, 1]) { x.strokeRect(s ? w - 12 - 90 : 12, h / 2 - 60, 90, 120); }
    });
    const court = new THREE.Mesh(new THREE.PlaneGeometry(16, 11), new THREE.MeshStandardMaterial({ map: courtTex, name: "concrete court" }));
    court.rotation.x = -Math.PI / 2;
    court.position.set(84, 0.03, -119);
    court.receiveShadow = true;
    scene.add(court);
    const steel = new THREE.MeshStandardMaterial({ name: "steel pole", color: 0x5a5d60 });
    for (const s of [-1, 1]) {
      box(0.16, 3.4, 0.16, steel, 84 + s * 8.6, 1.7, -119);
      box(0.1, 1.1, 1.8, basic(0xeeeeee), 84 + s * 8.3, 3.3, -119, scene, false);
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.025, 6, 16), basic(0xe0561c));
      hoop.rotation.x = Math.PI / 2;
      hoop.position.set(84 + s * 7.95, 3.05, -119);
      scene.add(hoop);
      ctx.addBlocker(84 + s * 8.6, -119, 0.3);
    }

    // domino table
    const tableWood = new THREE.MeshStandardMaterial({ name: "table wood", color: 0x6b4c32 });
    box(1.6, 0.08, 1.0, tableWood, 104, 0.82, -117);
    for (const [lx, lz] of [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]]) box(0.07, 0.8, 0.07, tableWood, 104 + lx, 0.4, -117 + lz);
    for (let i = 0; i < 9; i++) {
      const tile = box(0.1, 0.03, 0.2, basic(0xf2efe6), 103.5 + (i % 5) * 0.22, 0.88, -117.2 + ((i * 7) % 3) * 0.2, scene, false);
      tile.rotation.y = (i % 2) * Math.PI / 2;
    }
    ctx.addBlocker(104, -117, 0.9);

    // porch food table in front of the plates house
    box(1.8, 0.06, 0.8, new THREE.MeshStandardMaterial({ name: "plastic table", color: 0xe6e3dc }), 82, 0.76, -99.6);
    for (let i = 0; i < 4; i++) box(0.34, 0.08, 0.26, basic(0xf4f1ea), 81.4 + i * 0.4, 0.83, -99.6, scene, false);

    // memorial mural
    const mural = canvasTex(1024, 256, (x, w, h) => {
      const g = x.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, "#f2a33a"); g.addColorStop(0.5, "#d9486a"); g.addColorStop(1, "#4a4fb0");
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = "rgba(255,240,210,.9)";
      x.beginPath(); x.arc(w / 2, h * 0.95, 110, Math.PI, 0); x.fill();
      x.fillStyle = "#fff"; x.textAlign = "center";
      x.font = "bold 64px 'Arial Black', Impact, sans-serif"; x.fillText("FOREVER YOUNG", w / 2, 92);
      x.font = "italic 32px Georgia, serif"; x.fillText("South Tusouxroe remembers", w / 2, 140);
      for (let i = 0; i < 9; i++) { x.fillStyle = "#ffdca0"; x.beginPath(); x.arc(120 + i * 100, 214, 9, 0, 7); x.fill(); }
    });
    box(14, 3.2, 0.4, new THREE.MeshStandardMaterial({ map: mural, name: "brick wall" }), 68, 1.6, -121);
    ctx.addBlocker(63, -121, 1); ctx.addBlocker(68, -121, 1); ctx.addBlocker(73, -121, 1);

    // the billboard the script calls for, over the neighbourhood
    ctx.makeBillboard(118, -124, 0, "LUXURY CONDOS", "COMING SOON", "WHERE WE SUPPOSED TO GO?");

    // street lights
    for (const x of [50, 72, 94, 116]) ctx.addLitSpot({ x, y: 5, z: STREET_Z - 5.5, warm: 0xffd9a0, power: 90, range: 22, pole: true });

    // ---- the kitchen, sealed under the neighbourhood ----
    const rx = NB.x, rz = NB.z, y = ROOM_Y;
    const wallMat = new THREE.MeshStandardMaterial({ name: "plaster wall", color: 0xd9cdb6, side: THREE.DoubleSide });
    box(10, 0.1, 8, new THREE.MeshStandardMaterial({ name: "wood floor", color: 0x8a6a48 }), rx, y - 0.05, rz, scene, false);
    box(10, 0.1, 8, wallMat, rx, y + 3, rz, scene, false);
    box(10, 3, 0.1, wallMat, rx, y + 1.5, rz - 4, scene, false);
    box(10, 3, 0.1, wallMat, rx, y + 1.5, rz + 4, scene, false);
    box(0.1, 3, 8, wallMat, rx - 5, y + 1.5, rz, scene, false);
    box(0.1, 3, 8, wallMat, rx + 5, y + 1.5, rz, scene, false);
    // window onto the night street, counter, fridge, table and chairs
    box(2.2, 1.2, 0.05, basic(0x1c2a44), rx + 1.5, y + 1.8, rz - 3.93, scene, false);
    box(0.1, 1.2, 0.08, basic(0xefeae0), rx + 1.5, y + 1.8, rz - 3.9, scene, false);
    box(3.6, 0.95, 0.7, new THREE.MeshStandardMaterial({ name: "counter wood", color: 0x6b4f38 }), rx - 2.6, y + 0.48, rz - 3.5, scene, false);
    box(0.9, 1.9, 0.75, new THREE.MeshStandardMaterial({ name: "plastic fridge", color: 0xe9e7e1 }), rx + 4.3, y + 0.95, rz - 3.4, scene, false);
    const wood = new THREE.MeshStandardMaterial({ name: "table wood", color: 0x7a5636 });
    box(1.8, 0.07, 1.1, wood, rx, y + 0.78, rz, scene, false);
    for (const [lx, lz] of [[-0.8, -0.45], [0.8, -0.45], [-0.8, 0.45], [0.8, 0.45]]) box(0.06, 0.76, 0.06, wood, rx + lx, y + 0.38, rz + lz, scene, false);
    for (const [cx, cz] of [[-1.3, 0], [1.3, 0], [0, 0.95], [0, -0.95]]) box(0.45, 0.06, 0.45, wood, rx + cx, y + 0.46, rz + cz, scene, false);
    for (const [cx, cz] of [[-0.3, 0.2], [0.45, -0.25]]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.1, 10), basic(0xf4efe4));
      cup.position.set(rx + cx, y + 0.86, rz + cz);
      scene.add(cup);
    }
    ledgerProp = box(0.32, 0.05, 0.42, new THREE.MeshStandardMaterial({ color: 0x5a1f1a, name: "leather book" }), rx - 0.1, y + 0.84, rz + 0.05, scene, false);
    ledgerProp.visible = false;
    box(0.5, 0.04, 0.5, basic(new THREE.Color(0xffe0b0).multiplyScalar(2)), rx, y + 2.93, rz, scene, false);
    ctx.poolLight(0xffd9a8, 60, 16, rx, y + 2.6, rz);
  }

  // ---------------------------------------------------------------- people
  function person(opts, x, z, yawTo, height) {
    const a = ctx.makeHoodrat({ ...opts, height });
    a.position.set(x, 0, z);
    a._last.copy(a.position);
    if (yawTo) a._yaw = Math.atan2(yawTo[0] - x, yawTo[1] - z);
    scene.add(a);
    actors.push(a);
    return a;
  }

  function populate() {
    // kids on the court
    const kidLooks = [
      { sex: "m", top: 0xe0433a, headwear: "none", crew: { cloth: 0x2a2a2a, shoe: 0xf2f0ec } },
      { sex: "f", top: 0xf2c33a, headwear: "none", crew: { cloth: 0x3a4a8a, shoe: 0xe0433a } },
      { sex: "m", top: 0x3a8ae0, headwear: "none", crew: { cloth: 0x222, shoe: 0x3a8ae0 } },
    ];
    kidLooks.forEach((look, i) => {
      const kid = person({ ...look, seed: 40 + i, beard: false }, 80 + i * 3, -119 + (i - 1) * 2, null, 1.25);
      kid.court = true;
      if (i === 0) ballKid = kid;
    });
    ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xd9621c, roughness: 0.7, name: "rubber ball" }));
    ball.castShadow = true;
    scene.add(ball);

    // older men at the dominoes
    const elders = [
      { sex: "m", top: 0xf0eee6, hair: 0x9a9a9a, headwear: "hat", crew: { cloth: 0x444, hat: 0x2d2d2d } },
      { sex: "m", top: 0x7a5a8a, hair: 0xbdbdbd, headwear: "none", crew: { cloth: 0x333 } },
      { sex: "m", top: 0x5a7a5a, hair: 0x8a8a8a, headwear: "none", crew: { cloth: 0x2a2a2a } },
    ];
    [[103, -118.1], [105.2, -117], [103.2, -115.9]].forEach(([x, z], i) =>
      person({ ...elders[i], seed: 70 + i, skin: [0x5e3a26, 0x7a4f35, 0x452718][i] }, x, z, [104, -117]));

    // the woman selling plates off her porch
    person({ sex: "f", seed: 91, skin: 0x633d28, top: 0xd9534f, headwear: "band", hair: 0x111,
      crew: { cloth: 0xf2c33a, shoe: 0xf2f0ec } }, 82, -98.6, [82, -106]);

    // two crews, staring each other down across the street
    for (let i = 0; i < 3; i++) {
      person({ sex: i === 1 ? "f" : "m", crew: "red", seed: 300 + i }, 70 + i * 1.2, -103.5 + (i - 1) * 1.3, [114, -103]);
      person({ sex: i === 2 ? "f" : "m", crew: "blue", seed: 400 + i }, 114 - i * 1.2, -103.5 + (i - 1) * 1.3, [70, -103]);
    }

    // Emiko, at home in the kitchen
    cast.emiko = person({ sex: "f", seed: 1966, skin: 0xe6c3a2, top: 0x6f5e7e, denim: 0x3f3a46, hair: 0x2b2b2b,
      headwear: "none", crew: { cloth: 0x3f3a46, chain: 0xcfd3da, shoe: 0x2b2b2b } },
      NB.x + 1.3, NB.z - 0.2, [NB.x, NB.z], 1.62);
    cast.emiko.position.y = ROOM_Y;
    cast.emiko.baseY = ROOM_Y;          // she lives in the kitchen, under the street

    // where Keseme is headed
    marker = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 4), basic(0x7ee87e));
    marker.rotation.x = Math.PI;
    scene.add(marker);
  }

  // ---------------------------------------------------------------- movement helpers
  function moveTo(obj, x, z, speed) {
    return new Promise((resolve) => {
      const i = movers.findIndex((m) => m.obj === obj);
      if (i >= 0) movers.splice(i, 1);
      movers.push({ obj, x, z, speed, resolve });
    });
  }
  function updateMovers(dt) {
    for (let i = movers.length - 1; i >= 0; i--) {
      const m = movers[i], p = m.obj.position;
      const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz), step = m.speed * dt;
      if (cine.skipping || d <= step) {
        p.x = m.x; p.z = m.z;
        if (m.obj.play) m.obj.play("idle");
        movers.splice(i, 1);
        m.resolve();
        continue;
      }
      p.x += (dx / d) * step; p.z += (dz / d) * step;
      if (m.obj.play) m.obj.play("walk");
    }
  }
  function placeActor(a, x, y, z, yawTo) {
    a.visible = true;
    a.baseY = y;                        // update() keeps them on this floor
    a.position.set(x, y, z);
    a._last.copy(a.position);
    if (yawTo) a._yaw = Math.atan2(yawTo[0] - x, yawTo[1] - z);
  }
  function dialogue(fn) {
    talk = talk.then(() => cine.scene(fn)).catch((e) => console.error(e));
    return talk;
  }

  // ---------------------------------------------------------------- scenes
  async function radio(c) {
    c.card("EXT.", "TUSOUXROE", "A sprawling northern Dixie Beaux city");
    await c.wait(1.5);
    c.sfx("static");
    await say(c, "RADIO HOST", "Tusouxroe city officials announced another fourteen-million-dollar redevelopment initiative today.");
    await say(c, "SECOND HOST", "What are they redeveloping?");
    await say(c, "RADIO HOST", "The development initiative.");
    await say(c, "SECOND HOST", "What?");
    await say(c, "RADIO HOST", "Nobody knows.");
  }

  async function establishing(c) {
    state.cinematic = true;
    c.letterbox(true);
    c.card("EXT.", "SOUTH TUSOUXROE", "The neighborhood where Keseme was born");
    await c.shot({ from: [56, 18, -84], to: [70, 11, -96], look: [92, 1, -110], dur: 4.5 });
    c.shot({ from: [72, 4.5, -107], to: [75, 4, -110], look: [84, 1.4, -119], dur: 4 });
    await c.caption("Children play basketball.");
    c.shot({ from: [98, 3.2, -111], to: [99.5, 3, -112.5], look: [104, 1, -117], dur: 3.5 });
    await c.caption("Older men play dominoes.");
    c.shot({ from: [76, 3, -106], to: [78, 2.8, -105], look: [82, 1.2, -99], dur: 3.5 });
    await c.caption("A woman sells plates of food from her porch. Music shakes car windows.");
    // pulled back to the court so both crews (x ≈ 70 and 114) are in frame
    c.shot({ from: [92, 13, -130], to: [92, 11, -127], look: [92, 1, -103], dur: 4 });
    await c.caption("Down the street, members of two neighborhood crews exchange hostile looks.");
    await c.caption("Not everyone in the neighborhood is involved with crime. Most are simply trying to live.");
    c.shot({ from: [104, 3, -104], to: [106, 3.5, -107], look: [118, 7, -124], dur: 4 });
    await c.caption("A billboard towers overhead: LUXURY CONDOS COMING SOON.");
    await c.caption("Someone has spray-painted: WHERE WE SUPPOSED TO GO?");
    state.cinematic = false;
  }

  async function home(c) {
    state.cinematic = true;
    c.letterbox(true);
    await c.black(true, 0.6);
    ctx.exitVehicle();
    const k = ctx.getPlayer();
    const { x: rx, z: rz } = NB, y = ROOM_Y;
    placeActor(k, rx - 1.35, y, rz + 0.2, [rx, rz]);
    placeActor(cast.emiko, rx + 1.3, y, rz - 0.2, [rx, rz]);
    c.shot({ from: [rx - 3.8, y + 2.1, rz + 3.1], to: [rx - 3.4, y + 1.9, rz + 2.7], look: [rx, y + 1.1, rz], dur: 8 });
    await c.black(false, 0.6);
    c.card("INT.", "NADIA FAMILY HOUSE", "Emiko Nadia. Calm. Sharp.");
    await say(c, "EMIKO", "You look tired.");
    await say(c, "KESEME", "That's my face.");
    await say(c, "EMIKO", "You looked less tired yesterday.");
    await say(c, "KESEME", "Yesterday nobody shot at me.");
    await c.caption("Emiko slowly lowers her tea.");
    await say(c, "EMIKO", "Excuse me?");
    await say(c, "KESEME", "Bad opening sentence.");
    await say(c, "EMIKO", "Very bad.");
    ledgerProp.visible = true;
    c.shot({ from: [rx + 0.4, y + 1.7, rz + 1.5], look: [rx - 0.1, y + 0.8, rz + 0.05], dur: 3 });
    await c.caption("Keseme places the ledger on the table. Emiko flips through it. Her expression becomes serious.");
    await say(c, "EMIKO", "Where did you get this?");
    await say(c, "KESEME", "Mally.");
    await say(c, "EMIKO", "Of course.");
    c.shot({ from: [rx - 3.8, y + 2.1, rz + 3.1], look: [rx, y + 1.1, rz], dur: 2 });
    await say(c, "KESEME", "Technically thieves stole it from Mally, hogs stole it from the thieves, and then I stole it from the sheriff.");
    await c.caption("Emiko stares at her daughter.");
    await say(c, "EMIKO", "I'm going to make more tea.");
    await moveTo(cast.emiko, rx - 2.4, rz - 2.9, 1.4);
    placeActor(cast.emiko, rx - 2.4, y, rz - 2.9, [rx - 2.4, rz - 4]);

    // the ledger map, with Mally and Bubba crowding in
    cast.mally = cast.mally || ctx.makeCastMember("mally");
    cast.bubba = cast.bubba || ctx.makeCastMember("bubba");
    for (const a of [cast.mally, cast.bubba]) if (!a.parent) scene.add(a);
    placeActor(cast.mally, rx + 1.25, y, rz + 0.6, [rx, rz]);
    placeActor(cast.bubba, rx + 0.3, y, rz + 1.5, [rx, rz]);
    await c.caption("Later. Mally and Bubba crowd around the kitchen table.");

    board.reset();
    c.letterbox(false);                 // the board needs the whole screen
    board.show();
    await c.caption("Keseme builds a map.", 1.4);
    const names = [
      ["POLICE DEPARTMENTS", 250, 150], ["PRIVATE PRISONS", 800, 110], ["CASINOS", 1350, 150],
      ["CHEMICAL COMPANIES", 1400, 420], ["REAL-ESTATE DEVELOPERS", 1330, 700],
      ["STREET GANGS", 300, 720], ["POLITICIANS", 200, 430], ["SHERIFF OFFICES", 560, 270],
      ["CHURCH CHARITIES", 1060, 280], ["DRUG TRAFFICKERS", 820, 800],
    ];
    for (const [label, x, yy] of names) {
      board.addCard(label, label, x, yy);
      c.sfx("chime", 0.25);
      await c.wait(0.35);
    }
    board.addCard("pelican", "PELICAN CROWN HOLDINGS", 800, 450, { w: 380, hot: true, tilt: -1.5, sub: "appears again and again" });
    for (const [label] of names) { board.link(label, "pelican"); await c.wait(0.12); }
    await c.caption("One company appears again and again. Keseme searches it. Almost nothing.");
    await say(c, "KESEME", "Shell corporation.");
    board.addCard("nolantis", "PROJECT NOLANTIS", 1080, 590, { w: 300, sub: "♛  ≈ ≈ ≈", tilt: 2 });
    board.link("nolantis", "pelican");
    await c.caption("Another name: PROJECT NOLANTIS. She searches. Nothing.");
    await say(c, "MALLY", "Sounds like a water park.");
    await say(c, "BUBBA", "I'd go.");
    await say(c, "KESEME", "You'd drink the water.");
    await say(c, "BUBBA", "Depends what's in it.");
    board.stamp("29.9° N · 90.1° W  ↓  ORLEAROUGE", 1080, 700, { size: 34 });
    await c.caption("Keseme finds coordinates. They point south. Toward OrleaRouge.", 3.2);
    board.hide();
    c.letterbox(true);
    await c.wait(0.8);
    await c.card("ACT ONE", "WELCOME HOME", "Next: the highway to OrleaRouge", { center: true, hold: 3 });

    // back out on the street, in front of the house
    await c.black(true, 0.6);
    for (const a of [cast.mally, cast.bubba]) a.visible = false;
    // out on the pavement, with the camera on the street side looking back at the house
    ctx.teleport(DOOR.x, DOOR.z - 5, Math.PI);
    k.baseY = 0;
    k.position.set(DOOR.x, 0, DOOR.z - 5);
    k._last.copy(k.position);
    if (ctx.setCameraYaw) ctx.setCameraYaw(Math.PI);
    await c.black(false, 0.6);
    state.cinematic = false;
  }

  // ---------------------------------------------------------------- flow
  function finish() {
    phase = "done";
    if (marker) marker.visible = false;
    ctx.setObjective(null);
    ctx.flashObjective("The coordinates point south to OrleaRouge. For now: gas cans, and the truck.");
    if (ctx.startNext) ctx.startNext();
  }

  // After Nirbayou Nolantis: "Your mother's house is very pretty." Keseme comes up out
  // of the cavern in OrleaRouge promising to protect her family, and this is that
  // mission — back north to Mama's door. Without it the story handed off to nothing
  // and the HUD fell straight back to the gas cans.
  const MAMA_OBJECTIVE = "Someone threatened Mama. Get to her house in South Tusouxroe — north up US-167.";
  function reachedMama() {
    phase = "done";
    if (marker) marker.visible = false;
    ctx.setObjective(null);
    ctx.flashObjective("Mama's safe — for now. For now: gas cans, and the truck.");
  }

  return {
    buildSet,
    get phase() { return phase; },
    /** Where the player should go next ({x, z}), or null: the minimap's waypoint blip. */
    get waypoint() {
      if (phase === "toCity") return { x: NB.x - 20, z: STREET_Z };
      return phase === "door" || phase === "toMama" ? DOOR : null;
    },

    /** Called when Nirbayou Nolantis ends: someone threatened Mama, so go to her. */
    protectMama() {
      if (phase === "toMama") return;
      if (phase === "idle") populate();       // reached Nolantis without Act One (QA, skips)
      phase = "toMama";
      if (marker) marker.visible = true;
      ctx.setObjective(MAMA_OBJECTIVE);
    },

    /** Called when the prologue ends. */
    start() {
      if (phase !== "idle") return;
      populate();
      phase = "toCity";
      ctx.setObjective("Go home to South Tusouxroe — Mama's house, north-east of the strip.");
      ctx.flashObjective("ACT ONE — Welcome Home");
    },

    /** QA hooks for tools/qa/actone.mjs: "arrive" | "door". */
    debug(step) {
      if (step === "arrive" && phase === "toCity") ctx.teleport(NB.x - 30, STREET_Z, -Math.PI / 2);
      if (step === "door" && (phase === "door" || phase === "toMama")) { ctx.exitVehicle(); ctx.teleport(DOOR.x, DOOR.z - 1, 0); }
      return phase;
    },

    update(dt) {
      if (phase === "idle") return;
      updateMovers(dt);
      const t = performance.now() / 1000;
      const near = Math.hypot(playerPos.x - NB.x, playerPos.z - NB.z) < 110 || state.cinematic;
      if (near) {
        for (const a of actors) {
          if (a.court && !movers.some((m) => m.obj === a) && Math.random() < dt * 0.8) {
            moveTo(a, 78 + Math.random() * 12, -122.5 + Math.random() * 7, 2.5 + Math.random() * 2);
          }
          a.update(dt);
        }
        for (const a of [cast.mally, cast.bubba]) if (a && a.visible && a.parent) a.update(dt);
        if (ball && ballKid) {
          ball.position.set(ballKid.position.x + 0.35, 0.13 + Math.abs(Math.sin(t * 5.5)) * 0.85, ballKid.position.z + 0.2);
        }
      }
      if (state.cinematic) {
        const p = ctx.getPlayer();
        if (p) p.update(dt, ctx.camera);
      }
      if (marker && marker.visible) {
        const target = phase === "door" || phase === "toMama" ? DOOR : { x: NB.x - 20, z: STREET_Z };
        marker.position.set(target.x, 3.1 + Math.sin(t * 3) * 0.25, target.z);
        marker.rotation.y += dt * 2;
      }

      if (phase === "toCity") {
        if (!radioDone && playerPos.z < -25) { radioDone = true; dialogue(radio); }
        if (Math.hypot(playerPos.x - NB.x, playerPos.z - NB.z) < 36 && !state.cinematic) {
          phase = "arrive";
          dialogue(establishing).then(() => {
            phase = "door";
            ctx.setObjective("Go inside: Mama Emiko's house (the green one).");
          });
        }
      } else if (phase === "door") {
        const d = Math.hypot(playerPos.x - DOOR.x, playerPos.z - DOOR.z);
        if (state.veh && d < 14) ctx.setObjective("Get out of the car and go inside (F).");
        else if (!state.veh) ctx.setObjective("Go inside: Mama Emiko's house (the green one).");
        if (!state.veh && d < 2.6 && !state.cinematic) {
          phase = "inside";
          dialogue(home).then(finish);
        }
      } else if (phase === "toMama") {
        const d = Math.hypot(playerPos.x - DOOR.x, playerPos.z - DOOR.z);
        if (state.veh && d < 14) ctx.setObjective("Get out of the car and go to Mama's door (F).");
        else if (d < 14) ctx.setObjective("Go to Mama's door: the green house.");
        else ctx.setObjective(MAMA_OBJECTIVE);
        if (!state.veh && d < 2.6 && !state.cinematic) reachedMama();
      }
    },
  };
}
