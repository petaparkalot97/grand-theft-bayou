// ---------------------------------------------------------------------------
// bluelight.js — ACT ONE, continued: OrleaRouge. "BLUE LIGHT SPECIAL".
//
// From the script: Keseme, Mally and Bubba meet the journalist Solange Duval in
// the French District. Pelican Crown isn't a conspiracy, it's business. Then
// the raid: red and blue light floods the street, Keseme's senses overload and
// she counts it back down, reads the police positions, and finds the east
// alley they left open. The escape runs through a nightclub kitchen, a wedding
// reception, the cemetery, a brass-band parade and the riverfront casino, and
// down into a storm drain, where a flood tunnel ends at a door marked with a
// crown over three waves.
//
// (TASK-017 part A. Nirbayou Nolantis itself is part B.)
//
// Sets are built during buildLevel. The door and its glow animate, so they're
// listed in `props` for main.js to keep out of batchStatic. People are created
// when the chapter starts.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const MEET = { x: -26, z: 254.5 };                       // French District sidewalk, street z = 250
const DRAIN = { x: 120, z: 381.4 };                      // storm drain in the levee wall
// The sealed flood tunnel is an enclosed set just past the west edge of the map
// at ground level: height fog stays sane and the light pool, which picks lights
// near the player, lights it while the cutscene stands the player there.
const TUNNEL = { x: -236, y: 0, z: 330 };

const CPS = [
  { hint: "Out through the east alley and the nightclub kitchen.", x: -12.5, z: 270, r: 3.5,
    note: "Through the nightclub kitchen. Nobody stops cooking." },
  { hint: "Cut through the wedding reception in the courtyard.", x: -58, z: 270, r: 4,
    note: "Right through a wedding reception. Nobody stops dancing." },
  { hint: "Lose them among the tombs in the cemetery.", x: -118, z: 347, r: 5,
    note: "The cruisers can't follow between the tombs." },
  { hint: "Blend into the brass-band parade.", x: -50, z: 330, r: 5,
    note: "A brass band swallows the sirens." },
  { hint: "Along the riverfront, past the casino boat.", x: 48, z: 376, r: 5,
    note: "The tourists keep drinking." },
  { hint: "Into the storm drain at the levee.", x: 120, z: 377.5, r: 4 },
];

function basic(color) {
  const m = new THREE.MeshBasicMaterial({ color });
  m.userData.gtbRealized = true;
  return m;
}

// "A crown beneath three waves" — the Nolantis mark.
function emblemTexture() {
  const S = 512, c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, "#3a4148"); g.addColorStop(1, "#22282d");
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  x.strokeStyle = "rgba(0,0,0,.45)"; x.lineWidth = 6;
  for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(0, (S * i) / 4); x.lineTo(S, (S * i) / 4); x.stroke(); }
  x.strokeStyle = "#d9b45a"; x.fillStyle = "#d9b45a"; x.lineWidth = 12; x.lineJoin = "round";
  // crown
  x.beginPath();
  x.moveTo(166, 250); x.lineTo(176, 150); x.lineTo(216, 205); x.lineTo(256, 130);
  x.lineTo(296, 205); x.lineTo(336, 150); x.lineTo(346, 250); x.closePath();
  x.stroke();
  for (const [cx, cy] of [[176, 138], [256, 116], [336, 138]]) { x.beginPath(); x.arc(cx, cy, 11, 0, 7); x.fill(); }
  // three waves
  for (let w = 0; w < 3; w++) {
    x.beginPath();
    const y = 300 + w * 44;
    for (let px = 120; px <= 392; px += 4) x.lineTo(px, y + Math.sin((px - 120) / 34) * 12);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Through the open door: the top of a colossal shaft, gold light far below.
function shaftTexture() {
  const W = 256, H = 256, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#040506"); g.addColorStop(0.55, "#1c1508"); g.addColorStop(1, "#ffcf7a");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // work lights down the far wall, brighter the deeper they go
  for (let row = 0; row < 7; row++) {
    const y = 40 + row * 30, r = 1.2 + row * 0.5;
    x.fillStyle = `rgba(255, 214, 140, ${0.25 + row * 0.11})`;
    for (let col = 0; col < 6; col++) { x.beginPath(); x.arc(28 + col * 40, y, r, 0, 7); x.fill(); }
  }
  // cables and the gantry lip in silhouette
  x.fillStyle = "rgba(0,0,0,.7)";
  for (const cx of [62, 70, 186, 194]) x.fillRect(cx, 0, 2, H);
  x.fillRect(0, H - 14, W, 14);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {object} ctx from main.js: scene, camera, cine, state, playerPos, renderer,
 *   getPlayer(), makeHoodrat(opts), makeCastMember(who), addBlocker(x, z, r),
 *   poolLight(color, power, range, x, y, z), getSheriffProto(), setObjective(text|null),
 *   flashObjective(text), exitVehicle(), teleport(x, z, heading), setCameraYaw(yaw),
 *   setWanted(stars), holdWanted(stars), clearPolice(), revive(), setFail(fn|null)
 */
export function createBlueLight(ctx) {
  const { scene, cine, state, playerPos } = ctx;
  const say = (c, who, line) => c.say(who, line);

  let phase = "idle";          // idle | toMeet | meet | run | tunnel | done
  let cp = 0;
  const props = [];            // animated pieces main.js must not batch
  const cast = {};
  const extras = [];           // wedding guests, band, crowd
  const movers = [];
  let door = null, doorGlow = null, marker = null, wash = null;
  let talk = Promise.resolve();

  // ---------------------------------------------------------------- helpers
  function mesh(geo, mat, x, y, z, { cast: c = true, parent = scene } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = c;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function dialogue(fn) {
    talk = talk.then(() => cine.scene(fn)).catch((e) => console.error(e));
    return talk;
  }
  function place(a, x, y, z, faceX, faceZ) {
    a.visible = true;
    a.baseY = y;
    a.position.set(x, y, z);
    a._last.copy(a.position);
    if (faceX != null) a._yaw = Math.atan2(faceX - x, faceZ - z);
  }
  function moveTo(obj, x, z, speed) {
    return new Promise((resolve) => {
      const i = movers.findIndex((m) => m.obj === obj);
      if (i >= 0) movers.splice(i, 1);
      movers.push({ obj, x, z, speed, resolve });
    });
  }

  // the police light wash over the screen during the raid
  function ensureWash() {
    if (wash) return wash;
    const style = document.createElement("style");
    style.textContent = `
      #policeWash { position: fixed; inset: 0; z-index: 17; pointer-events: none; opacity: 0; transition: opacity .5s; }
      #policeWash.on { opacity: 1; }
      #policeWash i { position: absolute; inset: 0; animation: policeFlash .6s infinite; }
      #policeWash .r { background: radial-gradient(ellipse at 8% 40%, rgba(255,30,40,.55), transparent 55%); }
      #policeWash .b { background: radial-gradient(ellipse at 92% 40%, rgba(40,90,255,.55), transparent 55%); animation-delay: .3s; }
      @keyframes policeFlash { 0%, 45% { opacity: 1; } 50%, 100% { opacity: .1; } }`;
    document.head.appendChild(style);
    wash = document.createElement("div");
    wash.id = "policeWash";
    wash.innerHTML = '<i class="r"></i><i class="b"></i>';
    document.body.appendChild(wash);
    return wash;
  }
  const setWash = (on) => ensureWash().classList.toggle("on", !!on);
  const setOverload = (on) => {
    ctx.renderer.domElement.style.transition = "filter .6s";
    ctx.renderer.domElement.style.filter = on ? "blur(2.6px) saturate(1.5) contrast(1.15)" : "";
  };

  // ---------------------------------------------------------------- sets
  function buildSet() {
    // the wedding reception, in the courtyard between two French District rows
    const white = new THREE.MeshStandardMaterial({ name: "canvas tent", color: 0xf4f1ea });
    const cloth = new THREE.MeshStandardMaterial({ name: "table cloth", color: 0xfaf7f0 });
    const tx = -67, tz = 270;
    mesh(new THREE.BoxGeometry(11, 0.15, 6.2), white, tx, 3.4, tz);
    for (const [px, pz] of [[-5.3, -2.9], [5.3, -2.9], [-5.3, 2.9], [5.3, 2.9]]) {
      mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4, 8), white, tx + px, 1.7, tz + pz);
      ctx.addBlocker(tx + px, tz + pz, 0.3);
    }
    for (const dx of [-3.5, 0, 3.5]) {
      mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.75, 16), cloth, tx + dx, 0.38, tz);
      ctx.addBlocker(tx + dx, tz, 0.8);
    }
    const bulb = basic(new THREE.Color(0xffe2a0).multiplyScalar(2.4));
    for (let i = 0; i < 22; i++) {
      const s = i / 21;
      mesh(new THREE.SphereGeometry(0.07, 6, 5), bulb, tx - 5.2 + s * 10.4, 3.25 - Math.sin(s * Math.PI) * 0.35, tz - 3, { cast: false });
      mesh(new THREE.SphereGeometry(0.07, 6, 5), bulb, tx - 5.2 + s * 10.4, 3.25 - Math.sin(s * Math.PI) * 0.35, tz + 3, { cast: false });
    }
    ctx.poolLight(0xffd9a0, 40, 16, tx, 3, tz);

    // the storm drain in the levee wall, behind the promenade railing
    const concrete = new THREE.MeshStandardMaterial({ name: "concrete headwall", color: 0x86827a });
    mesh(new THREE.BoxGeometry(7, 3.4, 1.4), concrete, DRAIN.x, 1.7, DRAIN.z + 0.6);
    mesh(new THREE.PlaneGeometry(3.2, 2.2), basic(0x050607), DRAIN.x, 1.2, DRAIN.z - 0.12, { cast: false })
      .rotation.y = Math.PI;
    const iron = new THREE.MeshStandardMaterial({ name: "iron grate", color: 0x2a2d30, metalness: 0.7, roughness: 0.5 });
    for (let i = 0; i < 7; i++) mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), iron, DRAIN.x - 1.5 + i * 0.5, 1.2, DRAIN.z - 0.2, { cast: false });

    // the flood tunnel, sealed deep under the city
    const T = TUNNEL;
    const wall = new THREE.MeshStandardMaterial({ name: "concrete tunnel", color: 0x5e5a52, side: THREE.DoubleSide });
    mesh(new THREE.BoxGeometry(32, 0.2, 7), wall, T.x, T.y - 0.05, T.z, { cast: false });
    mesh(new THREE.BoxGeometry(32, 0.2, 7), wall, T.x, T.y + 4.2, T.z, { cast: false });
    mesh(new THREE.BoxGeometry(32, 4.4, 0.2), wall, T.x, T.y + 2.1, T.z - 3.5, { cast: false });
    mesh(new THREE.BoxGeometry(32, 4.4, 0.2), wall, T.x, T.y + 2.1, T.z + 3.5, { cast: false });
    mesh(new THREE.BoxGeometry(0.2, 4.4, 7), wall, T.x - 16, T.y + 2.1, T.z, { cast: false });
    const water = new THREE.MeshPhysicalMaterial({
      name: "tunnel water", color: 0x0b1210, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05,
      transparent: true, opacity: 0.85,
    });
    water.userData.gtbRealized = true;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(32, 7), water);
    w.rotation.x = -Math.PI / 2;
    w.position.set(T.x, T.y + 0.18, T.z);
    scene.add(w);
    ctx.poolLight(0x9fd6ff, 30, 22, T.x - 6, T.y + 3.6, T.z);
    ctx.poolLight(0xffd27a, 26, 18, T.x + 12, T.y + 3.2, T.z);

    // the door at the far end: too sophisticated for sewer infrastructure
    const frame = new THREE.MeshStandardMaterial({ name: "steel door frame", color: 0x2b3036, metalness: 0.9, roughness: 0.3 });
    mesh(new THREE.BoxGeometry(0.4, 4.4, 7), frame, T.x + 16, T.y + 2.1, T.z, { cast: false });
    const doorMat = new THREE.MeshStandardMaterial({
      name: "vault door", map: emblemTexture(), metalness: 0.85, roughness: 0.35,
    });
    doorMat.userData.gtbRealized = true;
    door = mesh(new THREE.BoxGeometry(0.3, 3.4, 3.2), doorMat, T.x + 15.7, T.y + 1.7, T.z, { cast: false });
    props.push(door);
    mesh(new THREE.BoxGeometry(0.1, 0.5, 0.35), basic(new THREE.Color(0x5fe8ff).multiplyScalar(2)), T.x + 15.5, T.y + 2, T.z - 2.3, { cast: false });
    // what's past the door: the top of a colossal shaft, golden light far below
    const shaftMat = new THREE.MeshBasicMaterial({ map: shaftTexture(), color: new THREE.Color(1.6, 1.6, 1.6) });
    shaftMat.userData.gtbRealized = true;
    doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.4), shaftMat);
    doorGlow.position.set(T.x + 15.78, T.y + 1.7, T.z);   // in front of the end wall, behind the closed door
    doorGlow.rotation.y = -Math.PI / 2;
    doorGlow.visible = false;
    scene.add(doorGlow);
    props.push(doorGlow);
    return props;
  }

  // ---------------------------------------------------------------- people
  function populate() {
    cast.solange = ctx.makeHoodrat({
      sex: "f", seed: 1997, skin: 0xb5835e, top: 0x4a2c5a, denim: 0x1f1f24, hair: 0x241610,
      headwear: "none", curly: true, crew: { cloth: 0x1f1f24, chain: 0xd4af37, shoe: 0x7a1f2a }, height: 1.76,
    });
    cast.mally = ctx.makeCastMember("mally");
    cast.bubba = ctx.makeCastMember("bubba");
    for (const a of Object.values(cast)) { a.visible = false; scene.add(a); }

    // wedding guests
    const looks = [0xf4f1ea, 0x3a5a8a, 0xd96b8a, 0x2b2b2b, 0xe0b04a];
    for (let i = 0; i < 5; i++) {
      const a = ctx.makeHoodrat({ sex: i % 2 ? "f" : "m", seed: 800 + i, top: looks[i], headwear: "none",
        crew: { cloth: 0x2b2b2b, shoe: 0x1a1a1a }, beard: false });
      place(a, -71 + i * 2, 0, 268 + (i % 2) * 4, -67, 270);
      a.dance = Math.random() * 6;
      extras.push(a); scene.add(a);
    }
    // the brass band on street 330, with gold horns
    const gold = new THREE.MeshStandardMaterial({ name: "brass horn", color: 0xd4a93a, metalness: 1, roughness: 0.25 });
    gold.userData.gtbRealized = true;
    for (let i = 0; i < 5; i++) {
      const a = ctx.makeHoodrat({ sex: "m", seed: 900 + i, top: 0xf2efe6, denim: 0x1b1b1b, headwear: i % 2 ? "hat" : "none",
        crew: { cloth: 0x1b1b1b, shoe: 0x111111, hat: 0x1b1b1b }, beard: i % 2 === 0 });
      const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.12, 0.5, 10), gold);
      horn.position.set(0, -0.25, 0.15);
      horn.rotation.x = Math.PI / 2;
      a.arms[0].elbow.add(horn);
      place(a, -80 + i * 2.2, 0, 331.5);
      a.band = { from: -80 + i * 2.2, to: -24 + i * 2.2 };
      extras.push(a); scene.add(a);
    }
    // the crowd lining the parade
    for (let i = 0; i < 8; i++) {
      const a = ctx.makeHoodrat({ sex: i % 2 ? "f" : "m", seed: 950 + i, headwear: "none",
        top: [0xe0433a, 0x3a8ae0, 0xf2c33a, 0x9dff6a][i % 4], crew: { cloth: 0x2b2b2b, shoe: 0xf2f0ec }, beard: false });
      const z = i % 2 ? 325 : 336;
      place(a, -76 + i * 7, 0, z, -76 + i * 7, 330.5);
      extras.push(a); scene.add(a);
    }

    marker = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.3, 4), basic(0x6ab8ff));
    marker.rotation.x = Math.PI;
    scene.add(marker);
  }

  // ---------------------------------------------------------------- scenes
  async function meetScene(c) {
    state.cinematic = true;
    c.letterbox(true);
    await c.black(true, 0.5);
    ctx.exitVehicle();
    const k = ctx.getPlayer();
    place(k, MEET.x - 1.6, 0, MEET.z, MEET.x, MEET.z);
    place(cast.solange, MEET.x + 1.7, 0, MEET.z + 0.3, MEET.x - 1.6, MEET.z);
    place(cast.mally, MEET.x - 2.4, 0, MEET.z - 1.6, MEET.x + 1.7, MEET.z);
    place(cast.bubba, MEET.x - 0.2, 0, MEET.z - 2.1, MEET.x + 1.7, MEET.z);
    c.shot({ from: [MEET.x - 7, 3.2, MEET.z - 7], to: [MEET.x - 5.5, 2.8, MEET.z - 6], look: [MEET.x, 1.4, MEET.z], dur: 9 });
    await c.black(false, 0.6);
    c.card("EXT.", "ORLEAROUGE — FRENCH DISTRICT", "Solange Duval, 29. Investigative journalist.");
    await say(c, "SOLANGE", "You brought the original ledger?");
    await say(c, "KESEME", "No.");
    await say(c, "SOLANGE", "Smart.");
    await say(c, "MALLY", "She made twelve copies.");
    await say(c, "KESEME", "Thirteen.");
    await say(c, "SOLANGE", "Extremely smart.");
    await say(c, "BUBBA", "I ate near one of them.");
    await c.caption("Everyone looks at him.");
    await say(c, "BUBBA", "What?");
    c.shot({ from: [MEET.x + 4.5, 2.2, MEET.z - 3.5], look: [MEET.x + 1.5, 1.5, MEET.z + 0.3], dur: 3 });
    await c.caption("Solange examines the photographed pages. She goes quiet.");
    await say(c, "SOLANGE", "Where did this come from?");
    await say(c, "KESEME", "Why does everyone keep asking me that before telling me what it means?");
    await say(c, "SOLANGE", "Because I've been investigating these people for two years.");
    await say(c, "KESEME", "Who are they?");
    await say(c, "SOLANGE", "Everybody.");
    await c.caption("Police unions. Developers. Casinos. Oil companies. Prison contractors. Drug traffickers. Judges. Political donors.");
    await say(c, "SOLANGE", "Sometimes they're fighting each other. Sometimes they're working together.");
    await say(c, "MALLY", "So it's a conspiracy?");
    await say(c, "SOLANGE", "No.");
    await say(c, "MALLY", "Thank God.");
    await say(c, "SOLANGE", "It's worse.");
    c.shot({ from: [MEET.x - 3, 1.9, MEET.z - 2.4], look: [MEET.x + 1.7, 1.55, MEET.z + 0.3], dur: 2.5 });
    await say(c, "SOLANGE", "It's business.");

    // ---- the raid
    c.sfx("siren", 1.2);
    setWash(true);
    const proto = ctx.getSheriffProto();
    const cruisers = [];
    if (proto) {
      for (const [sx, tx2] of [[-70, -40], [20, -12]]) {
        const car = proto.clone(true);
        car.position.set(sx, proto.position.y, 250);
        car.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;
        scene.add(car);
        cruisers.push(car);
        moveTo(car, tx2, 250, 18);
      }
    }
    // above the north sidewalk, clear of the rowhouse balconies across the street
    c.shot({ from: [MEET.x - 12, 8, MEET.z - 8.5], to: [MEET.x - 9, 7, MEET.z - 8], look: [MEET.x, 1.2, MEET.z], dur: 4 });
    await c.caption("Red and blue lights suddenly flood the windows.");
    await say(c, "LOUDSPEAKER", "ORLEAROUGE POLICE! EVERYONE INSIDE, COME OUT WITH YOUR HANDS VISIBLE!");
    await say(c, "SOLANGE", "That was fast.");
    await say(c, "MALLY", "Who called them?");
    await c.caption("Everyone looks at Mally.");
    await say(c, "MALLY", "Why y'all keep doing that?");
    await say(c, "BUBBA", "Pattern recognition.");

    // Keseme's senses overload, and she counts them back down
    c.shot({ from: [MEET.x - 2.6, 1.75, MEET.z - 1.4], look: [MEET.x - 1.6, 1.6, MEET.z], dur: 6 });
    setOverload(true);
    c.sfx("siren", 0.6);
    await c.caption("Too much noise. Lights flashing. Multiple voices. Sirens.", 2.2);
    await c.caption("She closes her eyes. Touches her thumb against each finger.", 2.2);
    for (const n of ["One.", "Two.", "Three.", "Four."]) await c.caption(n, 0.75);
    setOverload(false);
    await c.caption("She focuses.", 1.2);
    await say(c, "SOLANGE", "Keseme?");
    await say(c, "KESEME", "I'm fine.");
    await c.caption("She isn't entirely. But she regains control.");
    c.shot({ from: [MEET.x + 8, 9, MEET.z + 6], look: [-12, 0, 262], dur: 4 });
    await c.caption("Delivery truck. Fire escape. Drainage entrance. Police positions. Pattern.");
    await say(c, "KESEME", "They're leaving the east alley open.");
    await say(c, "SOLANGE", "Trap?");
    await say(c, "KESEME", "No.");
    await c.caption("She watches.");
    await say(c, "KESEME", "Incompetence.");
    await say(c, "KESEME", "Move.");
    await c.card("MISSION", "BLUE LIGHT SPECIAL", "Escape the raid", { center: true, hold: 2.2 });
    for (const a of [cast.solange, cast.mally, cast.bubba]) a.visible = false;   // they scatter; meet at the drain
    for (const car of cruisers) scene.remove(car);
    setWash(false);
    ctx.setCameraYaw(Math.PI);
    state.cinematic = false;
  }

  async function tunnelScene(c) {
    state.cinematic = true;
    c.letterbox(true);
    await c.black(true, 0.6);
    ctx.clearPolice();
    ctx.exitVehicle();
    const T = TUNNEL, y = T.y;
    ctx.teleport(T.x - 8, T.z, Math.PI / 2);
    // The tunnel is sealed, but the city behind its end wall is still in the
    // frustum: a short far plane culls it for the length of the scene.
    const far = ctx.camera.far;
    ctx.camera.far = 60;
    ctx.camera.updateProjectionMatrix();
    const k = ctx.getPlayer();
    place(k, T.x - 8, y, T.z, T.x + 16, T.z);
    place(cast.solange, T.x - 9.5, y, T.z + 1.4, T.x + 16, T.z);
    place(cast.mally, T.x - 10, y, T.z - 1.3, T.x + 16, T.z);
    place(cast.bubba, T.x - 11.5, y, T.z + 0.2, T.x + 16, T.z);
    door.position.y = y + 1.7;
    doorGlow.visible = false;
    c.shot({ from: [T.x - 15, y + 2.2, T.z + 2.5], to: [T.x - 14, y + 2, T.z + 2], look: [T.x - 8, y + 1.2, T.z], dur: 8 });
    await c.black(false, 0.6);
    c.card("INT.", "FLOOD TUNNEL — NIGHT", "Police remain behind.");
    await c.caption("Dark water reaches their ankles. Mally checks his shoes.");
    await say(c, "MALLY", "These cost two hundred dollars.");
    await say(c, "KESEME", "You owe me three hundred.");
    await say(c, "MALLY", "That's different.");
    await say(c, "KESEME", "Mathematically, it isn't.");
    await moveTo(k, T.x + 12, T.z, 1.6);
    moveTo(cast.solange, T.x + 10.5, T.z + 1.5, 1.6);
    moveTo(cast.mally, T.x + 10, T.z - 1.4, 1.6);
    await moveTo(cast.bubba, T.x + 9, T.z + 0.2, 1.6);
    c.shot({ from: [T.x + 8, y + 2.4, T.z - 2.4], look: [T.x + 15.7, y + 1.9, T.z], dur: 4 });
    await c.caption("Bubba notices something. A metal door built into the tunnel. Too sophisticated for sewer infrastructure.");
    c.shot({ from: [T.x + 12.5, y + 2, T.z - 0.8], look: [T.x + 15.7, y + 2, T.z], dur: 3 });
    await c.caption("A crown beneath three waves. The same symbol beside Project Nolantis in the ledger.");
    await say(c, "SOLANGE", "Keseme…");
    await c.caption("Keseme approaches. A scanner activates.");
    c.sfx("chime", 0.8);
    await say(c, "COMPUTER VOICE", "Surface identification detected.");
    await say(c, "MALLY", "The sewer just talked.");
    await say(c, "BUBBA", "I knew OrleaRouge had infrastructure money.");
    // the door opens
    doorGlow.visible = true;
    for (let i = 0; i < 24; i++) { door.position.y += 0.16; await c.wait(0.05); }
    c.shot({ from: [T.x + 9, y + 1.8, T.z + 1.8], to: [T.x + 12, y + 1.9, T.z + 0.6], look: [T.x + 16, y + 1.5, T.z], dur: 4 });
    await c.caption("Beyond it, a colossal elevator shaft descends into darkness.");
    await say(c, "SOLANGE", "Where does that go?");
    await c.caption("Far beneath them, golden lights glow.");
    await say(c, "KESEME", "Not a sewer.");
    await c.card("TO BE CONTINUED", "NIRBAYOU NOLANTIS", "", { center: true, hold: 2.6 });

    // back up at the drain, on the promenade
    await c.black(true, 0.5);
    for (const a of [cast.solange, cast.mally, cast.bubba]) a.visible = false;
    ctx.camera.far = far;
    ctx.camera.updateProjectionMatrix();
    k.baseY = 0;
    ctx.teleport(CPS[CPS.length - 1].x, CPS[CPS.length - 1].z - 3, Math.PI);
    ctx.setCameraYaw(Math.PI);
    await c.black(false, 0.5);
    state.cinematic = false;
  }

  // ---------------------------------------------------------------- flow
  function startRun() {
    phase = "run";
    cp = 0;
    ctx.setWanted(3);
    ctx.setFail(() => {
      if (phase !== "run") return false;
      // back on your feet at the last checkpoint instead of WASTED / BUSTED
      const at = cp > 0 ? CPS[cp - 1] : MEET;
      ctx.clearPolice();
      ctx.exitVehicle();
      ctx.revive();
      ctx.teleport(at.x, at.z, 0);
      ctx.setWanted(3);
      ctx.flashObjective("Back on your feet. The raid's still on.");
      return true;
    });
  }

  function finish() {
    phase = "done";
    if (marker) marker.visible = false;
    ctx.setFail(null);
    ctx.clearPolice();
    ctx.setObjective(null);
    ctx.flashObjective("Beneath OrleaRouge, a door is open. (Nirbayou Nolantis is next.)");
  }

  return {
    buildSet,
    get props() { return props; },
    get phase() { return phase; },
    get checkpoint() { return cp; },

    /** Called when Act One ("Welcome Home") ends. */
    start() {
      if (phase !== "idle") return;
      populate();
      phase = "toMeet";
      ctx.setObjective("Drive south to OrleaRouge: meet Solange Duval in the French District.");
      ctx.flashObjective("The coordinates point south. Solange Duval is waiting in OrleaRouge.");
    },

    /** QA hooks for tools/qa/bluelight.mjs: "meet" | "next" | "drain". */
    debug(step) {
      if (step === "meet" && phase === "toMeet") { ctx.exitVehicle(); ctx.teleport(MEET.x, MEET.z - 6, 0); }
      if (step === "next" && phase === "run") { const t = CPS[cp]; ctx.teleport(t.x, t.z, 0); }
      if (step === "drain" && phase === "run") { cp = CPS.length - 1; const t = CPS[cp]; ctx.teleport(t.x, t.z, 0); }
      return { phase, cp };
    },

    update(dt) {
      if (phase === "idle") return;
      const t = performance.now() / 1000;

      for (let i = movers.length - 1; i >= 0; i--) {
        const m = movers[i], p = m.obj.position;
        const dx = m.x - p.x, dz = m.z - p.z, d = Math.hypot(dx, dz), step = m.speed * dt;
        if (cine.skipping || d <= step) {
          p.x = m.x; p.z = m.z;
          if (m.obj.play) m.obj.play("idle"); else m.obj.rotation.y = Math.atan2(dx, dz) || m.obj.rotation.y;
          movers.splice(i, 1);
          m.resolve();
          continue;
        }
        p.x += (dx / d) * step; p.z += (dz / d) * step;
        if (m.obj.play) m.obj.play("walk"); else m.obj.rotation.y = Math.atan2(dx, dz);
      }

      const nearCity = playerPos.z > 190 || state.cinematic;
      if (nearCity) {
        for (const a of extras) {
          if (a.band && !movers.some((m) => m.obj === a)) {
            const back = Math.abs(a.position.x - a.band.to) < 0.5;
            moveTo(a, back ? a.band.from : a.band.to, 331.5, 1.1);
          }
          if (a.dance != null) a._yaw += Math.sin(t * 2 + a.dance) * dt * 1.5;
          a.update(dt);
        }
        for (const a of Object.values(cast)) if (a.visible) a.update(dt);
      }
      if (state.cinematic) {
        const p = ctx.getPlayer();
        if (p && !state.veh) p.update(dt, ctx.camera);
      }

      if (marker) {
        const target = phase === "toMeet" ? MEET : phase === "run" ? CPS[cp] : null;
        marker.visible = !!target;
        if (target) {
          marker.position.set(target.x, 3.1 + Math.sin(t * 3) * 0.25, target.z);
          marker.rotation.y += dt * 2;
        }
      }

      if (phase === "toMeet") {
        const d = Math.hypot(playerPos.x - MEET.x, playerPos.z - MEET.z);
        if (d < 16 && state.veh) ctx.setObjective("Get out of the car: Solange is waiting on the sidewalk.");
        if (d < 12 && !state.veh && !state.cinematic) {
          phase = "meet";
          dialogue(meetScene).then(startRun);
        }
      } else if (phase === "run") {
        ctx.holdWanted(3);
        const target = CPS[cp];
        ctx.setObjective(`BLUE LIGHT SPECIAL ${cp + 1}/${CPS.length} — ${target.hint}`);
        if (Math.hypot(playerPos.x - target.x, playerPos.z - target.z) < target.r && !state.cinematic) {
          if (cp === CPS.length - 1) {
            phase = "tunnel";
            ctx.setFail(null);
            dialogue(tunnelScene).then(finish);
          } else {
            if (target.note) dialogue((c) => c.caption(target.note, 2.4));
            cp++;
          }
        }
      }
    },
  };
}
