// ---------------------------------------------------------------------------
// newton.js — the ghost of Huey P. Newton, in the schoolyard at dawn.
//
// He was born in Monroe, Louisiana, on 17 February 1942 — the youngest of seven,
// named after Huey P. Long — and the family left for Oakland in the Great
// Migration while he was still a toddler. Monroe is one of the three towns this
// game says on the tin it is about (Chatham → Monroe → Ruston). So this is not
// a cameo from somewhere else. It is a son of this parish coming back to it.
//
// He is deliberately NOT a second Marie Laveau. She keeps the dead, at night,
// inside a wall, and what she gives you costs $20. He does the two things the
// Panthers actually did first, and both are different verbs:
//
//   the Free Breakfast   The Free Breakfast for Children ran before school, out
//                        of church halls, and grew into the biggest thing the
//                        party did. In this game a Popeyes costs money, the
//                        hospital costs $60, a club costs $10–40 and Marie
//                        costs $20. **His costs nothing.** That contrast is the
//                        whole argument, made as a mechanic instead of a
//                        speech, and it is why there is no price on the prompt.
//
//   copwatch             The party's first practice was following police with a
//                        law book and telling people their rights. So: stand in
//                        his yard with stars on you and the heat drains, because
//                        somebody is standing there with his eyes open. He never
//                        throws a punch, cannot be fought and cannot be killed.
//                        He does not launder an *active* crime either — the
//                        drain waits for `state.crimeCd`, the same way the
//                        game's own does. He watches. He does not cover for you.
//
// Dawn only (05:00–08:30), which is both when the breakfast ran and the cleanest
// way to keep him and Marie from reading as the same idea: she is moonlight and
// a cold blue, he is sunrise and a warm amber.
//
// On tone: he is written as the organiser and the reader he was — he finished a
// doctorate on political repression — not as a poster. Plain, dry, a bit tired.
// No slogans in his mouth, and no sanding him down into a mascot either.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { roundedBox } from "./geo.js";

const DAWN_START = 5.0;
const DAWN_END = 8.5;
const YARD_R = 16;          // how far his eyes reach, for copwatch
const HEAL = 40;
const COPWATCH_DRAIN = 0.6; // heat per second, on top of the game's own decay

/**
 * @param {object} ctx from main.js:
 *   scene, state, playerPos, cine, flashObjective(text), syncHUD(),
 *   makeHoodrat(opts), poolLight(color, power, range, x, y, z),
 *   addBlocker(x, z, r), worldTime, getKlanPhase()
 * @param {{x:number, z:number, ry:number}} at  the schoolyard (tusouxroeNorth.js)
 */
export function createNewton(ctx, at) {
  const { scene, state, playerPos } = ctx;
  const props = [];
  let ghost = null;
  let presence = 0;
  let met = false;
  let fedOnDay = -1;          // one breakfast per morning, by worldTime.day
  let prompt = false;
  let watching = 0;           // seconds he has been watching, for the one-off line
  let saidKlan = false;       // he only makes the Tusouxroe speech once
  let t = 0;

  const matCache = new Map();
  function std(name, color, extra = {}) {
    const key = name + color + JSON.stringify(extra);
    if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ name, color, ...extra }));
    return matCache.get(key);
  }
  const fixed = (m) => { m.userData.gtbRealized = true; return m; };
  function mesh(geo, mat, x, y, z, { parent = scene, ry = 0, cast = true } = {}) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // ------------------------------------------------------------- the table
  // A folding table, a couple of benches, an urn and a stack of trays. It is
  // meant to look like something four people set up at half four in the morning,
  // not like a monument.
  const TABLE = { x: at.x, z: at.z };
  function buildTable() {
    const g = new THREE.Group();
    g.position.set(TABLE.x, 0, TABLE.z);
    g.rotation.y = at.ry || 0;
    scene.add(g);
    props.push(g);                 // it is only here at dawn, so it must not batch

    const top = std("folding table formica", 0xd8d3c4, { roughness: 0.6 });
    const leg = fixed(new THREE.MeshStandardMaterial({ name: "table leg", color: 0x8a8f94, metalness: 0.7, roughness: 0.45 }));
    mesh(roundedBox(2.6, 0.07, 0.8), top, 0, 0.76, 0, { parent: g });
    for (const [lx, lz] of [[-1.15, -0.3], [1.15, -0.3], [-1.15, 0.3], [1.15, 0.3]]) {
      mesh(roundedBox(0.05, 0.76, 0.05), leg, lx, 0.38, lz, { parent: g, cast: false });
    }
    // benches either side
    for (const bz of [-1.15, 1.15]) {
      mesh(roundedBox(2.4, 0.06, 0.34), std("bench plank wood", 0x8a6a44), 0, 0.44, bz, { parent: g });
      for (const lx of [-1.0, 1.0]) mesh(roundedBox(0.05, 0.44, 0.05), leg, lx, 0.22, bz, { parent: g, cast: false });
    }
    // the urn, a tray stack, and paper cups
    const steel = fixed(new THREE.MeshStandardMaterial({ name: "coffee urn steel", color: 0xc8ccd0, metalness: 0.8, roughness: 0.3 }));
    mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.44, 14), steel, -0.95, 1.02, 0, { parent: g });
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), steel, -0.95, 1.29, 0, { parent: g, cast: false });
    const tray = std("cafeteria tray", 0xb8894a, { roughness: 0.55 });
    for (let i = 0; i < 6; i++) mesh(roundedBox(0.42, 0.025, 0.32), tray, 0.15, 0.81 + i * 0.03, 0, { parent: g, cast: false });
    const cup = std("paper cup", 0xf2efe6, { roughness: 0.85 });
    for (let i = 0; i < 9; i++) {
      mesh(new THREE.CylinderGeometry(0.038, 0.03, 0.09, 8), cup,
        0.72 + (i % 3) * 0.1, 0.845, -0.2 + Math.floor(i / 3) * 0.14, { parent: g, cast: false });
    }
    // a hand-lettered card propped against the urn — no slogan, just the hours
    const c = document.createElement("canvas");
    c.width = 256; c.height = 128;
    const x2 = c.getContext("2d");
    x2.fillStyle = "#efe9d8"; x2.fillRect(0, 0, 256, 128);
    x2.fillStyle = "#2a2722"; x2.textAlign = "center";
    x2.font = "bold 30px Georgia"; x2.fillText("FREE BREAKFAST", 128, 48);
    x2.font = "22px Georgia"; x2.fillText("before school", 128, 84);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const card = fixed(new THREE.MeshStandardMaterial({ name: "breakfast card", map: tex, roughness: 0.9 }));
    const cm = mesh(new THREE.PlaneGeometry(0.62, 0.31), card, -0.35, 1.0, 0.36, { parent: g, cast: false });
    cm.rotation.x = -0.22;

    ctx.addBlocker(TABLE.x, TABLE.z, 1.3);
    // the light over it: a work lamp on a stand, because it is still dark at five
    ctx.poolLight(0xffd9a8, 24, 14, TABLE.x, 1.9, TABLE.z);
  }

  // -------------------------------------------------------------- the ghost
  // Same treatment as cemetery.js: set `material.opacity` FIRST, which is what
  // clones this actor's materials off the shared characters.js cache, and only
  // then recolour — the other way round tints every Hoodrat in the parish.
  const TINT = new THREE.Color(0xffe2b0);
  function buildGhost() {
    ghost = ctx.makeHoodrat({
      sex: "m", seed: 19420217, height: 1.8,
      skin: 0x6b4630, hair: 0x140f0c,
      top: 0x2a2724,                 // under the jacket
      denim: 0x22262c,
      headwear: "none", beard: false, shoe: "boots",
      crew: { cloth: 0x1c1a18, chain: 0xb9b5aa, shoe: 0x1a1714 },
    });
    ghost.name = "huey-newton-ghost";

    ghost.material.opacity = 0.46;
    ghost.traverse((o) => {
      if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
      const m = o.material;
      if (m.color) m.color.lerp(TINT, 0.5);
      if (m.emissive) { m.emissive.setHex(0xffb861); m.emissiveIntensity = 0.5; }
      m.transparent = true;
      m.depthWrite = false;
      m.userData.gtbRealized = true;
      o.castShadow = false;
      o.receiveShadow = false;
    });

    const cloth = fixed(new THREE.MeshStandardMaterial({
      name: "ghost leather", color: 0x2b2926, emissive: 0xffb861, emissiveIntensity: 0.42,
      roughness: 0.6, transparent: true, opacity: 0.5, depthWrite: false,
    }));
    ghost._cloth = cloth;
    // the jacket: a shell over the torso and down both arms
    const jacket = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.255, 0.62, 14, 1, true), cloth);
    jacket.position.y = 1.22;
    ghost.add(jacket);
    for (const a of ghost.arms) {
      const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.058, 0.28, 9, 1, true), cloth);
      sleeve.position.y = -0.13;
      a.pivot.add(sleeve);
    }
    // the beret, pulled to one side
    const beret = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.125, 0.055, 16), cloth);
    beret.position.set(0.012, 0.135, -0.008);
    beret.rotation.z = 0.16;
    ghost.head.add(beret);
    const nub = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), cloth);
    nub.position.set(0.012, 0.17, -0.008);
    ghost.head.add(nub);

    ghost.visible = false;
    // behind the table, on the far side from the benches
    ghost.position.set(TABLE.x - Math.sin(at.ry || 0) * 1.1, 0, TABLE.z - Math.cos(at.ry || 0) * 1.1);
    ghost.rotation.y = (at.ry || 0) + Math.PI;
    scene.add(ghost);
    props.push(ghost);
    ghost._glow = ctx.poolLight(0xffc27a, 0, 10, ghost.position.x, 1.4, ghost.position.z);
  }

  // ------------------------------------------------------------------- UI
  const promptEl = document.createElement("div");
  promptEl.id = "breakfastPrompt";
  promptEl.hidden = true;
  document.body.appendChild(promptEl);
  const css = document.createElement("style");
  css.textContent = `#breakfastPrompt { position: fixed; left: 50%; bottom: 132px; transform: translateX(-50%);
    z-index: 22; padding: 7px 14px; border-radius: 8px; font: 500 14px/1.35 system-ui, sans-serif;
    color: #fff3e0; background: rgba(18,12,6,0.78); border: 1px solid rgba(255,190,110,0.36);
    box-shadow: 0 0 18px rgba(255,170,70,0.16); pointer-events: none; text-align: center; }
    #breakfastPrompt b { color: #ffc27a; }
    body.letterbox #breakfastPrompt { display: none; }`;
  document.head.appendChild(css);

  const isDawn = () => {
    const h = ctx.worldTime.hours;
    return h >= DAWN_START && h < DAWN_END;
  };
  const nearTable = () => Math.hypot(playerPos.x - TABLE.x, playerPos.z - TABLE.z) < 2.8;
  const inYard = () => Math.hypot(playerPos.x - TABLE.x, playerPos.z - TABLE.z) < YARD_R;

  function greet() {
    met = true;
    ctx.cine.scene(async (c) => {
      c.card("EXT.", "WILLOWBROOK SCHOOL", "North Tusouxroe · before the bell");
      await c.wait(1.0);
      await c.say("NEWTON", "You're early. Or you never went to bed.");
      await c.say("KESEME", "…Who are you?");
      await c.say("NEWTON", "Born about forty minutes up the road from here. Monroe.");
      await c.say("NEWTON", "Left at two years old and spent the rest of it in Oakland, so don't ask me for directions.");
      await c.wait(0.5);
      await c.say("KESEME", "And you're out here at five in the morning because…");
      await c.say("NEWTON", "Because a child who hasn't eaten can't learn, and everybody agrees with that right up until it costs something.");
      await c.say("NEWTON", "Sit down. It's free. That's not a figure of speech.");
    });
  }

  // ------------------------------------------------- what he makes of TASK-066
  // The one thing he is actually here to say. The Panthers formed because of
  // precisely the dynamic klan.js builds — a night ride, and a sheriff parked up
  // the street with his lights off — and Willowbrook is twenty minutes up the
  // road from Emiko's house. If those two arcs never touch, both of them are
  // just decoration.
  //
  // He is not written as the moral of the story. He is written as somebody who
  // has already had this exact week and is tired of it. The last line is the
  // argument, and it is the same argument as the table he is standing behind.
  function klanTalk() {
    saidKlan = true;
    ctx.cine.scene(async (c) => {
      await c.say("NEWTON", "I heard about Tusouxroe.");
      await c.say("KESEME", "You heard.");
      await c.say("NEWTON", "The dead hear everything. It is the only advantage.");
      await c.wait(0.6);
      await c.say("NEWTON", "Six of them, your mother's house, and how many of you?");
      await c.say("KESEME", "…One.");
      await c.say("NEWTON", "That's not you being brave. That's the whole design working.");
      await c.wait(0.5);
      await c.say("NEWTON", "Here's the part nobody writes down. We didn't start with the guns.");
      await c.say("NEWTON", "We started with law books. Followed the cars. Stood where they could see us and read the code out loud.");
      await c.say("NEWTON", "Because what they need most is for nobody to be looking.");
      await c.wait(0.5);
      await c.say("KESEME", "There was a sheriff up the street. Lights off. Whole time.");
      await c.say("NEWTON", "Then he isn't your enemy, he's your evidence. An enemy would have got out of the car.");
      await c.wait(0.7);
      await c.say("NEWTON", "And we fed the children. Every morning, before the bell.");
      await c.say("KESEME", "…Why does that come after the rest of it?");
      await c.say("NEWTON", "Because a building burns in a night. A thing people need every morning is a great deal harder to get rid of.");
      await c.say("NEWTON", "Your mother's house is gone, Keseme. Build the other thing.");
    });
  }

  /** The breakfast. No price, on purpose. */
  function interact() {
    if (!prompt || state.veh || state.cinematic) return false;
    state.hp = Math.min(100, state.hp + HEAL);
    ctx.syncHUD();
    fedOnDay = ctx.worldTime.day;
    const after = ctx.getKlanPhase && ctx.getKlanPhase() === "done";
    ctx.cine.scene(async (c) => {
      await c.caption("Grits, eggs, a slice of ham and coffee that could strip a fence.");
      if (after) {
        await c.say("NEWTON", "Sit down. Whatever you're going to do about them, you'll do it better fed.");
      } else {
        await c.say("NEWTON", "Eat it sitting down. You've got a hole in you and a list in your head.");
      }
    });
    return true;
  }

  function update(dt) {
    if (!ghost) return;
    t += dt;

    const want = isDawn() ? 1 : 0;
    presence += (want - presence) * Math.min(1, dt * 0.5);
    ghost.visible = presence > 0.02;
    if (!ghost.visible) {
      ghost._glow.power = 0;
      promptEl.hidden = true;
      prompt = false;
      watching = 0;
      return;
    }

    // he stands. He shifts his weight and looks around; he does not patrol.
    ghost.baseY = 0.16 + Math.sin(t * 0.8) * 0.045;
    ghost.position.y = ghost.baseY;
    ghost.update(dt);
    ghost.rotation.y = (at.ry || 0) + Math.PI + Math.sin(t * 0.3) * 0.5;
    ghost._glow.power = 12 * presence;

    const near = Math.hypot(playerPos.x - ghost.position.x, playerPos.z - ghost.position.z);
    const solid = presence * THREE.MathUtils.clamp(1.25 - near / 26, 0.25, 1);
    ghost.material.opacity = 0.52 * solid;
    ghost._cloth.opacity = 0.56 * solid;

    if (!met && near < 14 && !state.cinematic && !state.veh) greet();
    // queued behind the greeting if they arrive having already done the ride —
    // cinema.js plays scenes one after another, so both land in order
    if (met && !saidKlan && near < 14 && !state.veh && !state.cinematic
        && ctx.getKlanPhase && ctx.getKlanPhase() === "done") klanTalk();

    // ---- copwatch ----
    // Stars on you, standing in his yard: the heat drains, because somebody is
    // there with his eyes open. Not while you are actively committing the crime
    // — `crimeCd` gates the game's own decay and it gates this too. He watches.
    // He does not cover for you.
    // `state.heat`, not `state.wanted`: wanted is a display value main.js only
    // derives while `copsActive()`, so keying off it meant he did nothing at all
    // until the department had formally taken an interest. Heat is the real
    // quantity and cooling it is the right behaviour either way.
    if (inYard() && state.heat > 0 && state.crimeCd <= 0) {
      state.heat = Math.max(0, state.heat - dt * COPWATCH_DRAIN);
      watching += dt;
      if (watching > 1.2 && watching - dt <= 1.2) {
        ctx.flashObjective("NEWTON: \"Keep your hands where I can see them. Not for me — for the report I'm writing.\"");
      }
    } else if (!inYard()) {
      watching = 0;
    }

    // ---- the breakfast prompt ----
    const fed = fedOnDay === ctx.worldTime.day;
    prompt = !!(nearTable() && !fed && !state.cinematic && !state.veh && state.hp < 100);
    if (prompt) {
      promptEl.innerHTML = `<b>F</b> · Free Breakfast (+${HEAL} HP) — <b>no charge</b>`;
      promptEl.hidden = false;
    } else if (nearTable() && fed && !state.cinematic) {
      promptEl.innerHTML = "You've eaten today. Come back tomorrow morning.";
      promptEl.hidden = false;
    } else {
      promptEl.hidden = true;
    }
  }

  buildTable();
  buildGhost();

  return {
    update,
    interact,
    /** He and his table are only here at dawn — keep them out of batchStatic. */
    get props() { return props; },
    get present() { return presence > 0.5; },
    debug: { table: TABLE, yardR: YARD_R, get ghost() { return ghost; },
      get presence() { return presence; }, get fedOnDay() { return fedOnDay; },
      get met() { return met; }, get saidKlan() { return saidKlan; } },
  };
}
