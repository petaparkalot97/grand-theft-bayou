// ---------------------------------------------------------------------------
// services.js — places that do something for you, for money.
//
//   spray     Pay 'n' Spray: drive into the bay and the door comes down — new
//             paint, the engine fixed, and the wanted level gone. $100.
//   gun       a gun counter: walk onto the ring, F opens the counter menu.
//   hospital  walk onto the ring by the doors, F: patched up to full. $60
//             (broke? the charity ward still gets you to 60 HP).
//   food      a Popeyes counter: F buys a 3-piece spicy combo. $12, +40 HP.
//
// Every service is a spot on the ground: a glowing ring, a floating icon and a
// radar blip. Other modules register theirs with add() — the gun shops
// (landmarks.js), the hospitals (orlearouge.js, tusouxroeNorth.js) — and main.js
// adds the Popeyes counters and the Pay 'n' Spray garages this file builds.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { WEAPONS } from "./weapons.js";

export const PRICES = Object.freeze({ spray: 100, hospital: 60, food: 12, ammo: 60 });
const FOOD_HP = 40;
const CHARITY_HP = 60;
const GUN_PRICES = [["pistol", 150], ["tec9", 400], ["sawnoff", 600], ["deerRifle", 900]];

const KINDS = {
  spray:    { color: 0x2f9bff, icon: "🎨", r: 3.6 },
  gun:      { color: 0xffd23a, icon: "🔫", r: 1.7 },
  hospital: { color: 0xff3b3b, icon: "✚",  r: 1.9 },
  food:     { color: 0xff8a2c, icon: "🍗", r: 1.7 },
};

function basic(color, extra = {}) {
  const m = new THREE.MeshBasicMaterial({ color, ...extra });
  m.userData.gtbRealized = true;
  return m;
}
function iconTexture(icon, color) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  x.fillStyle = "#" + new THREE.Color(color).getHexString();
  x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.fill();
  x.lineWidth = 8; x.strokeStyle = "#101010"; x.stroke();
  x.font = icon === "✚" ? "bold 84px Arial" : "68px 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif";
  x.fillStyle = icon === "✚" ? "#ffffff" : "#000";
  x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(icon, 64, icon === "✚" ? 70 : 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * @param {object} ctx  scene, state, playerPos, cine, arsenal, flashObjective,
 *   syncHUD(), clearWanted(), addBlocker(x, z, r), setCameraYaw(yaw)?
 */
export function createServices(ctx) {
  // the character's Barter / Speech / Charisma (zombie mode) move every price; Medicine moves what food heals
  const scaled = (n) => Math.max(1, Math.round(n * (ctx.priceMul ? ctx.priceMul() : 1)));
  const price = (k) => scaled(PRICES[k]);
  const heal = () => (ctx.healMul ? ctx.healMul() : 1);

  const { scene, state, playerPos } = ctx;
  const flash = (t) => ctx.flashObjective(t);
  const list = [];
  const props = [];              // every group this module adds (kept out of static batching: they move)
  let busy = false;              // a service scene or the gun menu owns the player
  let prompt = null;             // the on-foot service the player is standing on
  let t = 0;

  // ---------------------------------------------------------------- DOM
  const css = document.createElement("style");
  css.textContent = `
    #svcPrompt { position: fixed; left: 50%; bottom: 92px; transform: translateX(-50%); z-index: 22;
      background: rgba(10,10,14,.82); color: #f4f0e6; font: 600 15px/1.35 system-ui, sans-serif;
      padding: 8px 16px; border-radius: 8px; border: 1px solid rgba(255,255,255,.18); pointer-events: none; }
    #svcPrompt b { color: #ffd23a; }
    #gunMenu { position: fixed; right: 24px; top: 50%; transform: translateY(-50%); z-index: 23; width: 330px;
      background: rgba(12,12,16,.93); color: #eee; font: 14px/1.4 system-ui, sans-serif; border-radius: 10px;
      border: 2px solid #ffd23a; padding: 14px 16px; box-shadow: 0 8px 30px rgba(0,0,0,.6); }
    #gunMenu h3 { margin: 0 0 2px; font: 900 18px/1.2 system-ui; color: #ffd23a; letter-spacing: .06em; }
    #gunMenu .cash { color: #6fe07a; font-weight: 800; margin-bottom: 8px; }
    #gunMenu .row { display: flex; justify-content: space-between; padding: 5px 8px; border-radius: 6px; }
    #gunMenu .row.sel { background: #ffd23a; color: #111; font-weight: 800; }
    #gunMenu .row.poor { opacity: .45; }
    #gunMenu .keys { margin-top: 10px; font-size: 12px; color: #9aa; }
    body.letterbox #svcPrompt { display: none; }`;
  document.head.appendChild(css);
  const promptEl = document.createElement("div");
  promptEl.id = "svcPrompt";
  promptEl.hidden = true;
  document.body.appendChild(promptEl);
  const menuEl = document.createElement("div");
  menuEl.id = "gunMenu";
  menuEl.hidden = true;
  document.body.appendChild(menuEl);

  // ---------------------------------------------------------------- spots
  const ringGeo = new THREE.RingGeometry(0.78, 1, 40);
  const colGeo = new THREE.CylinderGeometry(1, 1, 2.4, 28, 1, true);

  /** Register a service spot. `name` shows in prompts; `face` (radians) is the way out, for cameras. */
  function add({ kind, name, x, z, face = 0, extra = null }) {
    const K = KINDS[kind];
    if (!K) throw new Error("unknown service kind " + kind);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const ring = new THREE.Mesh(ringGeo, basic(K.color, { transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    ring.scale.setScalar(K.r);
    const col = new THREE.Mesh(colGeo, basic(K.color, { transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    col.scale.set(K.r * 0.95, 1, K.r * 0.95);
    col.position.y = 1.2;
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(K.icon, K.color), depthWrite: false }));
    icon.material.userData.gtbRealized = true;
    icon.scale.setScalar(kind === "spray" ? 1.6 : 1.1);
    icon.position.y = kind === "spray" ? 5.4 : 2.9;
    for (const o of [ring, col]) { o.castShadow = false; o.receiveShadow = false; }
    g.add(ring, col, icon);
    scene.add(g);
    props.push(g);
    const s = { kind, name, x, z, face, r: K.r, obj: g, icon, iconY: icon.position.y, cool: false, ...(extra || {}) };
    list.push(s);
    return s;
  }

  // ---------------------------------------------------------------- the garage
  const signTex = (() => {
    const c = document.createElement("canvas");
    c.width = 1024; c.height = 192;
    const x = c.getContext("2d");
    x.fillStyle = "#101a2e"; x.fillRect(0, 0, 1024, 192);
    const grad = x.createLinearGradient(0, 0, 1024, 0);
    for (const [s, col] of [[0, "#ff4fb3"], [0.33, "#ffd23a"], [0.66, "#3ae0ff"], [1, "#6fe07a"]]) grad.addColorStop(s, col);
    x.fillStyle = grad;
    x.font = "900 118px Arial Black, Arial, sans-serif";
    x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText("PAY 'N' SPRAY", 512, 100);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();

  /**
   * A drive-in garage, open toward local +z (turn it with `rot` to face a road).
   * The bay's service ring sits inside; the roll-up door drops while it works.
   */
  function buildPayNSpray(x, z, rot, name) {
    const W = 8.4, D = 11, H = 4.6, T = 0.35;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    scene.add(g);
    props.push(g);
    const wall = new THREE.MeshStandardMaterial({ name: "painted block wall", color: 0x3c6fb4, roughness: 0.85 });
    const trim = new THREE.MeshStandardMaterial({ name: "painted trim", color: 0xf2f0ea, roughness: 0.7 });
    const floor = new THREE.MeshStandardMaterial({ name: "garage floor concrete", color: 0x4b4d52, roughness: 0.95 });
    const box = (w, h, d, m, px, py, pz) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(px, py, pz); b.castShadow = true; b.receiveShadow = true;
      g.add(b);
      return b;
    };
    box(T, H, D, wall, -W / 2, H / 2, 0);
    box(T, H, D, wall, W / 2, H / 2, 0);
    box(W + T, H, T, wall, 0, H / 2, -D / 2);
    box(W + 1.2, 0.4, D + 1, trim, 0, H + 0.2, 0);                 // roof slab
    box(W + T, 1.1, T, trim, 0, H - 0.55, D / 2);                   // header over the door
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(W, D + 6), floor);
    pad.rotation.x = -Math.PI / 2; pad.position.set(0, 0.024, 3); pad.receiveShadow = true;
    g.add(pad);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.6, 1.5),
      new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.85, name: "pay n spray sign" }));
    sign.material.userData.gtbRealized = true;
    sign.position.set(0, H + 1.25, D / 2 + 0.25);
    g.add(sign);
    // the roll-up door: rolled up it is a sliver under the header
    const doorH = H - 1.1;
    const door = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, doorH, 0.12),
      new THREE.MeshStandardMaterial({ name: "roller door metal", color: 0xb9bec4, roughness: 0.5, metalness: 0.3 }));
    door.position.set(0, doorH, D / 2 - 0.1);
    door.scale.y = 0.02;
    g.add(door);
    // spray-booth lights inside, so the bay reads at night
    const lamp = new THREE.PointLight(0xd8f0ff, 22, 14, 2);
    lamp.position.set(0, H - 0.6, 0);
    g.add(lamp);
    // walls are solid; the front is open
    g.updateMatrixWorld(true);
    const wpt = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyMatrix4(g.matrixWorld);
    for (let lz = -D / 2; lz <= D / 2; lz += 1.4) {
      for (const lx of [-W / 2, W / 2]) { const p = wpt(lx, lz); ctx.addBlocker(p.x, p.z, 0.55); }
    }
    for (let lx = -W / 2; lx <= W / 2; lx += 1.4) { const p = wpt(lx, -D / 2); ctx.addBlocker(p.x, p.z, 0.55); }
    const bay = wpt(0, -0.6);
    const mouth = wpt(0, D / 2 + 9);
    const s = add({ kind: "spray", name, x: bay.x, z: bay.z, face: rot,
      extra: { door, doorH, doorT: 0, doorF: 0.02, mouth: [mouth.x, mouth.z], rot } });
    s.icon.position.y = s.iconY = H + 2.6;          // the icon floats over the sign
    return s;
  }

  // ---------------------------------------------------------------- the jobs
  function repaint(v) {
    const hue = Math.random();
    v.obj.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const next = mats.map((m) => {
        if (!m || m.transparent || !m.color || (m.emissive && m.emissive.getHex() && m.emissiveIntensity > 0.2)) return m;
        const c = m.userData.gtbSprayed ? m : m.clone();     // shared with every car of the model until the first spray
        c.userData.gtbSprayed = true;
        c.color.setHSL(hue, 0.5 + Math.random() * 0.3, 0.55 + Math.random() * 0.2);
        return c;
      });
      o.material = Array.isArray(o.material) ? next : next[0];
    });
  }

  async function respray(s) {
    const v = state.veh;
    if (!v || busy) return;
    if (state.cash < price("spray")) {
      flash(`Pay 'n' Spray: $${price("spray")} a job. You've got $${state.cash}. Go make some money.`);
      s.cool = true;
      return;
    }
    busy = true;
    state.cinematic = true;
    v.speed = 0;
    // roll the car into the middle of the bay, nose in
    v.obj.position.x = s.x; v.obj.position.z = s.z;
    v.heading = s.rot + Math.PI;
    v.obj.rotation.y = v.heading;
    if (v.blocker) { v.blocker.x = s.x; v.blocker.z = s.z; }
    const wanted = state.wanted > 0;
    await ctx.cine.scene(async (c) => {
      c.shot({ from: [s.mouth[0], 5.5, s.mouth[1]], look: [s.x, 1.6, s.z], dur: 4.4 });
      s.doorT = 1;
      await c.wait(1.0);
      c.sfx("static", 0.35);
      await c.caption("PSSSSHHHHHHT…", 1.3);
      c.sfx("static", 0.25);
      await c.wait(0.7);
      s.doorT = 0;
      await c.wait(1.0);
    });
    s.door.scale.y = 0.02; s.doorF = 0.02;
    state.cash -= price("spray");
    if (v.hpMax) v.hp = v.hpMax;
    ctx.stopVehicleFire(v);
    repaint(v);
    if (wanted) ctx.clearWanted();
    ctx.syncHUD();
    state.cinematic = false;
    busy = false;
    s.cool = true;
    flash(wanted
      ? `New paint, engine fixed, and the Sheriff's looking for some other car now. -$${price("spray")}`
      : `New paint and the engine's fixed. -$${price("spray")}`);
  }

  async function treat(s) {
    if (state.hp >= 100) { flash(`${s.name}: "You're fine, baby. Next!"`); return; }
    const paying = state.cash >= price("hospital");
    if (!paying && state.hp >= CHARITY_HP) { flash(`${s.name}: $${price("hospital")} to be seen. The charity ward only takes you under ${CHARITY_HP} HP.`); return; }
    busy = true;
    state.cinematic = true;
    await ctx.cine.scene(async (c) => {
      await c.black(true, 0.45);
      await c.caption(paying ? "Stitches, a tetanus shot, and a bill." : "The charity ward. Long wait, cold hands.", 1.6);
      await c.black(false, 0.45);
    });
    if (paying) { state.cash -= price("hospital"); state.hp = 100; }
    else state.hp = Math.max(state.hp, CHARITY_HP);
    ctx.syncHUD();
    state.cinematic = false;
    busy = false;
    flash(paying ? `${s.name}: patched up. Full health. -$${price("hospital")}` : `${s.name}: charity ward. Back to ${CHARITY_HP} HP. It's something.`);
  }

  function eat(s) {
    const who = s.dish ? s.name : "Popeyes", dish = s.dish || "Popeyes 3-piece spicy combo";     // a service can sell its own dish (extra: { dish })
    if (state.cash < price("food")) { flash(`${who}: ${s.dish ? "that" : "a 3-piece"} is $${price("food")}. You've got $${state.cash}.`); return; }
    if (state.hp >= 100) { flash(`${who}: you're already full. Come back hungry.`); return; }
    state.cash -= price("food");
    state.hp = Math.min(100, state.hp + Math.round(FOOD_HP * heal()));
    ctx.syncHUD();
    ctx.cine.sfx("chime", 0.4);
    flash(`${dish}. +${Math.round(FOOD_HP * heal())} HP, -$${price("food")}`);
  }

  // ---------------------------------------------------------------- gun counter
  let menu = null;              // { s, sel }
  // Ammo for every gun you carry (the one in your hands first). A gun counter stocks guns AND ammo; Popeyes stocks
  // chicken and ammo only, no guns (human request, 2026-09-26).
  function ammoItems() {
    const owned = GUN_PRICES.map(([id]) => id).filter((id) => id === state.weapon || (state.reserve && state.reserve[id] > 0) || (state.freeRoam && WEAPONS[id]));
    owned.sort((a, b) => (b === state.weapon) - (a === state.weapon));
    return owned.filter((id) => WEAPONS[id] && !WEAPONS[id].melee).map((id) => ({ ammo: true, id, price: price("ammo"), label: `Ammo: ${WEAPONS[id].name} (+${WEAPONS[id].clip * 2})` }));
  }
  function menuItems() {
    if (menu && menu.s.kind === "food") return [{ food: true, price: price("food"), label: `${menu.s.dish || "Popeyes 3-piece spicy combo"} (+${Math.round(FOOD_HP * heal())} HP)` }, ...ammoItems()];
    return [...GUN_PRICES.map(([id, base]) => ({ id, price: scaled(base), label: WEAPONS[id].name })), ...ammoItems()];
  }
  function renderMenu() {
    if (!menu) return;
    const items = menuItems();
    menu.sel = Math.max(0, Math.min(items.length - 1, menu.sel));
    menuEl.innerHTML = `<h3>${menu.s.name.toUpperCase()}</h3><div class="cash">Cash $${state.cash.toLocaleString()}</div>` +
      items.map((it, i) => `<div class="row${i === menu.sel ? " sel" : ""}${state.cash < it.price ? " poor" : ""}"><span>${it.label}</span><span>$${it.price}</span></div>`).join("") +
      `<div class="keys">W / S choose · E or Enter buy · Esc leave</div>`;
  }
  function openMenu(s) {
    menu = { s, sel: 0 };
    busy = true;
    state.cinematic = true;          // the world holds still at the counter
    menuEl.hidden = false;
    promptEl.hidden = true;
    renderMenu();
  }
  function closeMenu() {
    menu = null;
    menuEl.hidden = true;
    busy = false;
    state.cinematic = false;
  }
  function buy() {
    const it = menuItems()[menu.sel];
    if (!it) return;
    if (it.food) { eat(menu.s); renderMenu(); return; }        // eat() charges, heals and flashes for itself
    if (state.cash < it.price) { flash(`Not enough cash for the ${it.label}.`); return; }
    state.cash -= it.price;
    const w = WEAPONS[it.id];
    if (it.ammo) ctx.arsenal.addReserve(it.id, w.clip * 2);      // ammo for a gun in your pack must not swap it into your hands
    else ctx.arsenal.give(it.id, w.clip * 3);
    ctx.syncHUD();
    ctx.cine.sfx("chime", 0.35);
    flash(it.ammo ? `Bought ammo for the ${w.name}. -$${it.price}` : `Bought a ${w.name}. It's in your hands. -$${it.price}`);
    renderMenu();
  }
  // capture-phase, so the game's own bindings (E, Esc, W/S) never see these keys
  window.addEventListener("keydown", (e) => {
    if (!menu) return;
    const k = e.code;
    if (k === "KeyW" || k === "ArrowUp") { menu.sel--; renderMenu(); }
    else if (k === "KeyS" || k === "ArrowDown") { menu.sel++; renderMenu(); }
    else if (k === "KeyE" || k === "Enter" || k === "Space") buy();
    else if (k === "Escape" || k === "Backspace") closeMenu();
    else return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  // ---------------------------------------------------------------- per frame
  function describe(s) {
    if (s.kind === "gun") return `<b>E</b> · ${s.name}: guns & ammo`;
    if (s.kind === "hospital") return `<b>E</b> · ${s.name}: full health, $${price("hospital")}`;
    if (s.kind === "food") return (s.dish ? `<b>E</b> · ${s.dish}: $${price("food")}, +${Math.round(FOOD_HP * heal())} HP` : `<b>E</b> · Popeyes: chicken $${price("food")} · ammo $${price("ammo")}`);
    return "";
  }

  function update(dt) {
    t += dt;
    for (const s of list) {
      s.icon.position.y = s.iconY + Math.sin(t * 2.4 + s.x) * 0.12;
      if (s.door) {
        // roll the door toward where the job wants it
        const want = s.doorT ? 1 : 0.02;
        s.doorF += (want - s.doorF) * Math.min(1, dt * 3.2);
        s.door.scale.y = s.doorF;
        s.door.position.y = s.doorH - (s.doorH * s.doorF) / 2;     // rolls down from the header
      }
    }
    if (busy || state.cinematic || !state.running) { promptEl.hidden = true; return; }
    prompt = null;
    for (const s of list) {
      const at = state.veh ? state.veh.obj.position : playerPos;
      const d = Math.hypot(at.x - s.x, at.z - s.z);
      if (s.cool) { if (d > s.r + 3) s.cool = false; continue; }
      if (s.kind === "spray") {
        if (state.veh && d < s.r && state.veh.sheriff) { flash("Pay 'n' Spray won't touch a Sheriff cruiser. Bring something you stole from a civilian."); s.cool = true; }
        else if (state.veh && d < s.r && Math.abs(state.veh.speed || 0) < 9) respray(s);
        else if (!state.veh && d < s.r) prompt = { s, text: `${s.name}: drive a car in. $${price("spray")} — new paint, repairs, wanted level gone.` };
        continue;
      }
      if (!state.veh && d < s.r) prompt = { s, text: describe(s) };
    }
    if (prompt) { promptEl.innerHTML = prompt.text; promptEl.hidden = false; }
    else promptEl.hidden = true;
  }

  /** E pressed: true if a service took it (main.js then skips car enter/exit). */
  function interact() {
    if (busy || !prompt || state.veh) return false;
    const s = prompt.s;
    if (s.kind === "gun") openMenu(s);
    else if (s.kind === "hospital") treat(s);
    else if (s.kind === "food") { if (s.dish) eat(s); else openMenu(s); }      // Popeyes: chicken and ammo
    else return false;
    return true;
  }

  return {
    add,
    buildPayNSpray,
    update,
    interact,
    get busy() { return busy; },
    get list() { return list; },
    get props() { return props; },
    /** Radar blips: one per service. */
    blips() { return list.map((s) => ({ kind: s.kind, x: s.x, z: s.z })); },
    /** The closest service of a kind to (x, z), or null. */
    nearest(kind, x, z) {
      let best = null, bd = Infinity;
      for (const s of list) {
        if (s.kind !== kind) continue;
        const d = Math.hypot(s.x - x, s.z - z);
        if (d < bd) { bd = d; best = s; }
      }
      return best;
    },
    /** QA: run a service directly. */
    debug: { respray, treat, eat, openMenu, closeMenu, buy, get menu() { return menu; } },
  };
}
