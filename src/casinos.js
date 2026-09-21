// ---------------------------------------------------------------------------
// casinos.js — small enterable casino floors for OrleaRouge's expanded district.
//
// Like nightlife.js, casinos are built in the live scene: walking through the
// front opening reveals the floor without a loading screen or a second world.
// The geometry is deliberately compact and pooled-light friendly.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const W = 15, D = 13, H = 4.8;
const CASINO_DEFS = [
  { name: "PELICAN PALACE", ink: "#ffd23a", glow: 0xffb31a },
  { name: "THE GOLDEN GATOR", ink: "#3affc2", glow: 0x20d9a8 },
  { name: "BELLEFONTAINE CLUB", ink: "#ff4fb3", glow: 0xff2e93 },
  { name: "LUCKY SEVENTH", ink: "#7aa7ff", glow: 0x4d7dff },
];

function mat(name, color, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.72, ...extra });
  m.userData.gtbRealized = true;
  return m;
}
function basic(color, extra = {}) {
  const m = new THREE.MeshBasicMaterial({ color, ...extra });
  m.userData.gtbRealized = true;
  return m;
}

export function createCasinos(ctx) {
  const { scene, playerPos, state } = ctx;
  const casinos = [];
  const props = [];
  let inside = null;
  let prompt = null;

  const css = document.createElement("style");
  css.textContent = `#casinoPrompt { position: fixed; left: 50%; bottom: 164px; transform: translateX(-50%); z-index: 22;
    background: rgba(8,16,24,.9); color: #eafff8; font: 600 15px/1.35 system-ui,sans-serif; padding: 8px 16px;
    border-radius: 8px; border: 1px solid #ffd23a; pointer-events: none; }`;
  document.head.appendChild(css);
  const promptEl = document.createElement("div");
  promptEl.id = "casinoPrompt";
  promptEl.hidden = true;
  document.body.appendChild(promptEl);

  function world(c, x, z) {
    return new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.rot).add(new THREE.Vector3(c.cx, 0, c.cz));
  }
  function block(c, x, z, r) {
    const p = world(c, x, z);
    ctx.addBlocker(p.x, p.z, r);
  }
  function build(def, cx, cz, rot) {
    const g = new THREE.Group();
    g.position.set(cx, 0, cz);
    g.rotation.y = rot;
    scene.add(g);
    props.push(g);
    const c = { def, g, cx, cz, rot, walls: [], roof: null, slots: [], table: null };

    const wallMat = mat("casino wall", 0x101923);
    const trim = basic(def.glow);
    const wall = (geo, x, z) => {
      const m = new THREE.Mesh(geo, wallMat);
      m.position.set(x, 0, z);
      g.add(m); c.walls.push(m);
      return m;
    };
    const side = (W - 3.0) / 2;
    wall(new THREE.BoxGeometry(W, H, 0.35), 0, -D / 2);
    wall(new THREE.BoxGeometry(0.35, H, D), -W / 2, 0);
    wall(new THREE.BoxGeometry(0.35, H, D), W / 2, 0);
    wall(new THREE.BoxGeometry(side, H, 0.35), -3 / 2 - side / 2, D / 2);
    wall(new THREE.BoxGeometry(side, H, 0.35), 3 / 2 + side / 2, D / 2);

    c.roof = new THREE.Group();
    const roof = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.35, D + 0.5), mat("casino roof", 0x182531));
    roof.position.y = H + 0.15;
    const header = new THREE.Mesh(new THREE.BoxGeometry(3, 1.1, 0.35), wallMat);
    header.position.set(0, H - 0.55, D / 2);
    c.roof.add(roof, header);
    g.add(c.roof);

    const sign = new THREE.Mesh(new THREE.BoxGeometry(W - 1, 1.7, 0.22), ctx.makeNeonSign(def.name, def.ink, "#080b12"));
    sign.position.set(0, H + 1.15, D / 2 + 0.2);
    g.add(sign); c.sign = sign;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.4, D - 0.4), mat("casino carpet", 0x25122d, { roughness: 0.92 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = 0.03; g.add(floor);

    // Slot machines along both side walls.
    const slotBody = mat("slot cabinet", 0x253448, { metalness: 0.25 });
    const slotGlow = basic(def.glow);
    for (const x of [-5.2, -3.7, 3.7, 5.2]) {
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.75, 0.75), slotBody);
      cabinet.position.set(x, 0.88, -1.8); g.add(cabinet);
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.38, 0.05), slotGlow);
      screen.position.set(x, 1.25, -1.38); g.add(screen);
      c.slots.push({ x, z: -1.8 });
    }
    // Central roulette table / gaming table.
    const table = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.45, 24), mat("roulette felt", 0x12613f, { roughness: 0.5 }));
    table.position.set(0, 0.28, 1.2); g.add(table); c.table = table;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.1, 8, 28), mat("roulette gold rim", 0xd4af37, { metalness: 0.8, roughness: 0.25 }));
    rim.rotation.x = Math.PI / 2; rim.position.set(0, 0.52, 1.2); g.add(rim);
    for (let i = 0; i < 8; i++) {
      const chip = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 10), basic([0xff4f6d, 0xffd23a, 0xffffff][i % 3]));
      chip.position.set(Math.cos(i) * 1.2, 0.57, 1.2 + Math.sin(i) * 1.2); g.add(chip);
    }
    const chandelier = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), basic(def.glow));
    chandelier.position.set(0, H - 0.5, 0); g.add(chandelier);

    // Door gap and furniture collision. Roof/sign lift out of the way inside.
    g.updateMatrixWorld(true);
    for (let x = -W / 2; x <= W / 2; x += 1.4) {
      block(c, x, -D / 2, 0.45);
      block(c, -W / 2, x * D / W, 0.45);
      block(c, W / 2, x * D / W, 0.45);
      if (Math.abs(x) > 2.0) block(c, x, D / 2, 0.45);
    }
    block(c, -2.0, D / 2, 0.35); block(c, 2.0, D / 2, 0.35);
    block(c, 0, 1.2, 2.1);
    const lp = world(c, 0, 0);
    ctx.poolLight(def.glow, 100, 15, lp.x, 3.7, lp.z);
    const dp = world(c, 0, D / 2 + 1);
    ctx.poolLight(def.glow, 45, 10, dp.x, 3, dp.z);
    casinos.push(c);
    return c;
  }

  function buildBlock(b) {
    const xs = [b.x0 + W / 2 + 0.5, b.x1 - W / 2 - 0.5];
    for (let i = 0; i < 2; i++) {
      const c = CASINO_DEFS[(casinos.length + i) % CASINO_DEFS.length];
      build(c, xs[i], b.cz, i ? 0 : Math.PI);
    }
    const pavement = new THREE.Mesh(new THREE.PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0), mat("casino plaza", 0x34343b, { roughness: 0.9 }));
    pavement.rotation.x = -Math.PI / 2; pavement.position.set(b.cx, 0.014, b.cz); pavement.receiveShadow = true;
    scene.add(pavement); props.push(pavement);
  }

  function update(dt) {
    inside = null;
    let near = Infinity;
    for (const c of casinos) {
      const d = Math.hypot(playerPos.x - c.cx, playerPos.z - c.cz);
      near = Math.min(near, d);
      const local = new THREE.Vector3(playerPos.x - c.cx, 0, playerPos.z - c.cz).applyAxisAngle(new THREE.Vector3(0, 1, 0), -c.rot);
      const isIn = !state.veh && Math.abs(local.x) < W / 2 - 0.2 && Math.abs(local.z) < D / 2 - 0.2;
      if (isIn) inside = c;
      c.roof.visible = !isIn;
      c.sign.visible = !isIn;
      c.walls.forEach((w) => { w.scale.y += ((isIn ? 0.2 : 1) - w.scale.y) * Math.min(1, dt * 8); });
      if (d < 70) {
        c.table.rotation.y += dt * 0.12;
        c.slots.forEach((s, i) => { const mesh = c.g.children.find((x) => x.position.x === s.x && x.position.z === s.z); if (mesh) mesh.position.y = 0.88 + Math.sin(performance.now() * 0.004 + i) * 0.015; });
      }
    }
    prompt = null;
    if (inside && !state.cinematic) {
      const l = new THREE.Vector3(playerPos.x - inside.cx, 0, playerPos.z - inside.cz).applyAxisAngle(new THREE.Vector3(0, 1, 0), -inside.rot);
      if (Math.hypot(l.x, l.z + 1.8) < 1.3) prompt = { text: `<b>F</b> · Try a slot machine — $10`, type: "slot" };
      else if (Math.hypot(l.x, l.z - 1.2) < 2.6) prompt = { text: `<b>F</b> · Play roulette — $25`, type: "table" };
    }
    promptEl.hidden = !prompt;
    if (prompt) promptEl.innerHTML = prompt.text;
  }

  function gamble(amount, label) {
    if (state.cash < amount) {
      ctx.flashObjective(`${label}: you need $${amount}.`);
      return;
    }
    state.cash -= amount;
    const win = Math.random() < 0.38;
    if (win) state.cash += amount * 3;
    ctx.syncHUD();
    ctx.flashObjective(win ? `${label}: lucky break! You won $${amount * 2}.` : `${label}: the house wins. -$${amount}.`);
  }
  function interact() {
    if (!prompt || state.veh || state.cinematic) return false;
    gamble(prompt.type === "slot" ? 10 : 25, prompt.type === "slot" ? "Slots" : "Roulette");
    return true;
  }

  return {
    buildBlock,
    update,
    interact,
    get props() { return props; },
    get pois() { return casinos.map((c) => ({ x: c.cx, z: c.cz + 8, r: 7 })); },
    blips() { return casinos.map((c) => ({ kind: "casino", x: world(c, 0, D / 2 + 1.5).x, z: world(c, 0, D / 2 + 1.5).z })); },
  };
}
