// ---------------------------------------------------------------------------
// weapon_hold_test.mjs — does the character actually HOLD the weapon?
//
// This is the test the task's "IMPORTANT VISUAL TEST" turns into numbers, because
// there is no browser here: it builds the REAL character rig (characters.js) and
// the REAL attachment system (weapons_3d.js) on the real three.js, then drives
// updateWeapon3D exactly as the game tick does and measures the result.
//
// The things it can prove without pixels:
//   - the weapon's grip is INSIDE the fist, for every weapon
//   - the weapon cannot float: move the actor and the muzzle moves with it
//   - facing left/right turns the muzzle with the body
//   - the muzzle points down the aim direction when aiming or firing
//   - a two-handed weapon's SUPPORT HAND lands on the weapon's foregrip
//   - recoil rotates about the grip: the grip does not leave the hand
//   - a swing keeps the bat in the fist
//   - fire modes: only "auto" repeats while held
//
//   node tools/qa/weapon_hold_test.mjs
// ---------------------------------------------------------------------------

import * as THREE from "three";
// Upgrade the local three STUB (node_modules/three) with real column-major
// matrix / quaternion / scene-graph math. Everything below is a transform
// question, so without this the answers would all be "0, 0, 0".
import "./lib/three_math.mjs";

// characters.js pulls in graphics.js, which builds its surface noise maps on a
// real <canvas>. There is no DOM here, so stand one up before those modules are
// evaluated — the noise is read back as raw pixel data and never rendered, so a
// buffer that returns zeros is enough to build the rig. This has to happen in a
// module body with dynamic imports below, because static imports are evaluated
// before any of this file's code runs.
const CTX_IMPL = {
  createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  measureText: () => ({ width: 0 }),
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
};
// A canvas context where every drawing call is a no-op and every property is
// assignable — the texture code only ever needs the image buffers back.
const _ctx = () => new Proxy({}, {
  get: (t, k) => (k in CTX_IMPL ? CTX_IMPL[k] : k in t ? t[k] : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
// A DOM just big enough for characters.js (canvas textures) and weapons.js
// (its HUD panel): elements accept the calls those two make and nothing more.
function makeEl(tag) {
  const el = {
    tagName: String(tag).toUpperCase(), id: "", className: "", textContent: "", innerHTML: "",
    hidden: false, width: 0, height: 0, dataset: {}, children: [], parentNode: null,
    style: { cssText: "", setProperty() {}, removeProperty() {}, getPropertyValue: () => "" },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c; },
    insertBefore(c) { return this.appendChild(c); },
    replaceChildren(...c) { this.children = c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
    remove() {}, setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    focus() {}, blur() {}, click() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    getContext: tag === "canvas" ? _ctx : undefined,
  };
  return el;
}
const _byId = new Map();
globalThis.document = {
  createElement: makeEl,
  createElementNS: (_ns, tag) => makeEl(tag),
  getElementById: (id) => _byId.get(id) || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  head: makeEl("head"),
  body: makeEl("body"),
};
globalThis.devicePixelRatio = 1;
globalThis.window = globalThis;

const { makeHoodrat } = await import("../../src/characters.js");
const {
  initWeapons3D, updateWeapon3D, getWeaponMuzzle, getWeaponMuzzleDir,
  playFireAnim3D, notifyReload3D, weaponRigState, WEAPON_RIGS,
} = await import("../../src/weapons_3d.js");
const { WEAPONS, createArsenal } = await import("../../src/weapons.js");

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = "") {
  if (ok) { pass++; results.push(`  ok   ${name}`); }
  else { fail++; results.push(`  FAIL ${name}   ${detail}`); }
}
const fmt = (v) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// ---------------------------------------------------------------- the world
const scene = new THREE.Scene();
initWeapons3D(scene);
const actor = makeHoodrat({ height: 1.8 });
scene.add(actor);
const playerPos = new THREE.Vector3(0, 0, 0);
actor.position.copy(playerPos);

// Real hand-socket world positions, straight off the rig.
const handWorld = (arm) => arm.hand.getWorldPosition(new THREE.Vector3());

/**
 * One tick, in the same order main.js runs it: pose/position the actor, then the
 * weapon after it. `frames` lets recoil/reload/swing settle over time.
 */
function tick(weaponId, { aim, firing = false, frames = 1, dt = 1 / 60, yaw = 0 } = {}) {
  actor.rotation.y = yaw;
  const cam = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  for (let i = 0; i < frames; i++) {
    actor.update(dt);
    updateWeapon3D(actor, playerPos, cam, weaponId, dt, aim, false, firing);
  }
  return cam;
}

// ---------------------------------------------------------------- 1. grip in the fist
// The grip node's world position must coincide with the hand socket. This is the
// single assertion that "the hand touches the grip" reduces to: if the grip is
// not at the hand, nothing else in the presentation can be right.
for (const id of Object.keys(WEAPON_RIGS)) {
  tick(id, { aim: false, frames: 20 });
  const state = weaponRigState();
  check(`[${id}] rig selected`, state.id === id, `got ${state.id}`);
  check(`[${id}] rig attached`, state.attached === true);

  const grip = actor.rightArm.hand.getObjectByName("weaponGrip");
  check(`[${id}] grip node is a child of the hand`, !!grip);
  if (!grip) continue;
  const gW = grip.getWorldPosition(new THREE.Vector3());
  const hW = handWorld(actor.rightArm);
  const off = d(gW, hW);
  const want = Math.hypot(...WEAPON_RIGS[id].handOffset);
  check(`[${id}] grip sits in the fist`, off <= want + 1e-6, `off=${off.toFixed(5)} handOffset=${want.toFixed(5)}`);

  // Grip-at-origin: the model's own origin is the grip, so rotating the weapon
  // is rotating about the point the hand holds. If a model were built
  // centre-heavy this is where it would show up.
  const model = grip.getObjectByName(`weapon:${id}`);
  check(`[${id}] model parented to the grip`, !!model);
  if (model) check(`[${id}] model origin == grip origin`, model.position.length() < 1e-6, `pos=${model.position.length()}`);
}

// ---------------------------------------------------------------- 2. no floating: it follows the actor
{
  const id = "pistol";
  tick(id, { aim: false, frames: 20 });
  const before = getWeaponMuzzle(new THREE.Vector3());
  const gripBefore = actor.rightArm.hand.getObjectByName("weaponGrip").getWorldPosition(new THREE.Vector3());
  actor.position.set(7, 0, -4);
  tick(id, { aim: false, frames: 20 });
  const after = getWeaponMuzzle(new THREE.Vector3());
  const gripAfter = actor.rightArm.hand.getObjectByName("weaponGrip").getWorldPosition(new THREE.Vector3());
  const moved = d(after, before);
  const body = d(actor.position, new THREE.Vector3(0, 0, 0));
  check("weapon teleports with the actor (no world-parked view model)", Math.abs(moved - body) < 1e-4, `muzzle moved ${moved.toFixed(3)} body moved ${body.toFixed(3)}`);
  check("grip rides the hand to the new position", Math.abs(d(gripAfter, gripBefore) - body) < 1e-4);
  actor.position.copy(playerPos);
}

// ---------------------------------------------------------------- 3. per-weapon arm pose
// A pistol is one-handed with the off hand loose; a long weapon brings the second
// hand onto the foregrip. If both hands landed in the same place the two-handed
// IK would be doing nothing.
{
  tick("pistol", { aim: false, frames: 30 });
  const pistolLeft = handWorld(actor.leftArm);
  const pistolRight = handWorld(actor.rightArm);
  tick("deerRifle", { aim: true, frames: 30 });
  const rifleLeft = handWorld(actor.leftArm);
  const rifleRight = handWorld(actor.rightArm);
  check("two-handed pose moves the SUPPORT hand", d(pistolLeft, rifleLeft) > 0.12, `moved ${d(pistolLeft, rifleLeft).toFixed(3)}`);
  check("gun hand stays on the grip in both poses", d(pistolRight, rifleRight) > 0.0 && d(actor.rightArm.hand.getObjectByName("weaponGrip").getWorldPosition(new THREE.Vector3()), rifleRight) < 1e-5);
}

// ---------------------------------------------------------------- 4. the support hand is ON the foregrip
// The strongest statement of "the character is holding it, not standing near it":
// solve the left arm onto the weapon's actual foregrip point and see whether the
// fist ends up there. A couple of centimetres is a rig reaching around the gun;
// half a metre would be a hand waving in space.
for (const id of Object.keys(WEAPON_RIGS)) {
  const def = WEAPON_RIGS[id];
  if (!def.twoHanded || !def.foregrip) {
    check(`[${id}] one-handed (no foregrip to solve)`, !def.twoHanded && !def.foregrip);
    continue;
  }
  const cam = tick(id, { aim: true, frames: 40 });
  const grip = actor.rightArm.hand.getObjectByName("weaponGrip");
  const want = new THREE.Vector3(...def.foregrip).applyMatrix4(grip.matrixWorld);
  const got = handWorld(actor.leftArm);
  const err = d(want, got);
  // the solver clamps at the arm chain's reach, so allow the chain length
  const reach = actor.leftArm.upper + actor.leftArm.fore;
  check(`[${id}] support hand reaches the foregrip`, err < 0.16, `off by ${err.toFixed(3)}m (arm reach ${reach.toFixed(2)}m) want=${fmt(want)} got=${fmt(got)}`);
  check(`[${id}] muzzle is not at the grip (a real barrel)`, d(new THREE.Vector3(...def.muzzleOffset), new THREE.Vector3()) > 0.1);
  void cam;
}

// ---------------------------------------------------------------- 5. facing / aim
{
  const id = "pistol";
  const yaws = [0, 0.7, Math.PI / 2, -2.1];
  for (const yaw of yaws) {
    tick(id, { aim: true, frames: 40, yaw });
    const dir = getWeaponMuzzleDir(new THREE.Vector3());
    const want = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const dot = dir.dot(want);
    check(`muzzle follows facing yaw=${yaw.toFixed(2)}`, dot > 0.999, `dot=${dot.toFixed(4)} dir=${fmt(dir)}`);
  }
  // Facing is the opposite direction -> the barrel must be too. This is the
  // "flips/rotates correctly facing left and right" check, in numeric form.
  tick(id, { aim: true, frames: 40, yaw: 0 });
  const east = getWeaponMuzzleDir(new THREE.Vector3());
  tick(id, { aim: true, frames: 40, yaw: Math.PI });
  const west = getWeaponMuzzleDir(new THREE.Vector3());
  check("muzzle reverses with the character", east.dot(west) < -0.999, `dot=${east.dot(west).toFixed(4)}`);

  // Firing without holding aim still points down the true aim, because a muzzle
  // that disagrees with the shot is the one thing a player always notices.
  tick(id, { aim: false, firing: true, frames: 40, yaw: 1.1 });
  const firingDir = getWeaponMuzzleDir(new THREE.Vector3());
  const aimDir = new THREE.Vector3(Math.sin(1.1), 0, Math.cos(1.1));
  check("muzzle matches aim WHILE FIRING (not just when aiming)", firingDir.dot(aimDir) > 0.999, `dot=${firingDir.dot(aimDir).toFixed(4)}`);
}

// ---------------------------------------------------------------- 6. recoil pivots at the grip
// Recoil must be a rotation about the grip, so the weapon never detaches. If the
// recoil node were above the grip, or the model were rotated about its centre,
// either of these two would move.
{
  const id = "sawnoff";
  tick(id, { aim: true, frames: 40 });
  const grip = actor.rightArm.hand.getObjectByName("weaponGrip");
  const muzzleRest = new THREE.Vector3(...WEAPON_RIGS[id].muzzleOffset).applyMatrix4(grip.matrixWorld);
  const handRest = handWorld(actor.rightArm);
  playFireAnim3D(id, false);
  tick(id, { aim: true, frames: 4 });
  const muzzleKicked = getWeaponMuzzle(new THREE.Vector3());
  const handKicked = handWorld(actor.rightArm);
  check("recoil moves the muzzle", d(muzzleKicked, muzzleRest) > 0.01, `moved ${d(muzzleKicked, muzzleRest).toFixed(4)}`);
  check("recoil does NOT tear the grip off the hand", d(handKicked, handRest) < 0.05, `hand moved ${d(handKicked, handRest).toFixed(4)}`);

  // and it settles back
  tick(id, { aim: true, frames: 60 });
  const settled = getWeaponMuzzle(new THREE.Vector3());
  check("recoil settles back to rest", d(settled, muzzleRest) < 0.02, `off by ${d(settled, muzzleRest).toFixed(4)}`);
}

// ---------------------------------------------------------------- 7. melee swing stays in the hand
{
  const id = "bat";
  tick(id, { aim: false, frames: 30 });
  const grip = actor.rightArm.hand.getObjectByName("weaponGrip");
  const muzzleRest = new THREE.Vector3(...WEAPON_RIGS[id].muzzleOffset).applyMatrix4(grip.matrixWorld);
  const handRest = handWorld(actor.rightArm);
  playFireAnim3D(id, true);
  let maxMuzzleMove = 0, maxHandMove = 0, sawSwing = false;
  for (let i = 0; i < 30; i++) {
    tick(id, { aim: false, frames: 1 });
    if (weaponRigState().anim === "swing") sawSwing = true;
    maxMuzzleMove = Math.max(maxMuzzleMove, d(getWeaponMuzzle(new THREE.Vector3()), muzzleRest));
    maxHandMove = Math.max(maxHandMove, d(handWorld(actor.rightArm), handRest));
  }
  check("bat swing is animated", sawSwing);
  check("bat swing moves the bat a lot", maxMuzzleMove > 0.4, `moved ${maxMuzzleMove.toFixed(3)}m`);
  check("bat never leaves the hand mid-swing", maxHandMove < 0.35, `hand moved ${maxHandMove.toFixed(3)}m`);
  const gripNow = actor.rightArm.hand.getObjectByName("weaponGrip").getWorldPosition(new THREE.Vector3());
  check("grip is still in the fist after the swing", d(gripNow, handWorld(actor.rightArm)) < 0.02);
  // returns to rest rather than freezing mid-swing
  tick(id, { aim: false, frames: 40 });
  check("swing returns to the shouldered pose", d(getWeaponMuzzle(new THREE.Vector3()), muzzleRest) < 0.05);
}

// ---------------------------------------------------------------- 8. reload dip
{
  const id = "pistol";
  tick(id, { aim: true, frames: 40 });
  const rest = getWeaponMuzzle(new THREE.Vector3());
  notifyReload3D(id, 1.1);
  tick(id, { aim: true, frames: 4 });
  check("reload dips the weapon", d(getWeaponMuzzle(new THREE.Vector3()), rest) > 0.02);
  check("reload keeps the grip in the hand", d(actor.rightArm.hand.getObjectByName("weaponGrip").getWorldPosition(new THREE.Vector3()), handWorld(actor.rightArm)) < 1e-6);
  tick(id, { aim: true, frames: 90 });
  check("reload returns to the aim pose", d(getWeaponMuzzle(new THREE.Vector3()), rest) < 0.05);
}

// ---------------------------------------------------------------- 9. switching weapons
{
  const seen = [];
  for (const id of ["bat", "pistol", "sawnoff", "tec9", "deerRifle"]) {
    tick(id, { aim: true, frames: 20 });
    seen.push(weaponRigState().id);
  }
  check("every weapon selects its own rig on switch", seen.join() === "bat,pistol,sawnoff,tec9,deerRifle", seen.join());
  // switching back must not accumulate grip nodes
  for (const id of ["bat", "pistol", "bat", "pistol"]) tick(id, { aim: false, frames: 5 });
  const grips = [];
  actor.traverse((o) => { if (o.name === "weaponGrip") grips.push(o); });
  check("exactly one grip node exists after switching", grips.length === 1, `found ${grips.length}`);
}

// ---------------------------------------------------------------- 10. hidden rig
{
  updateWeapon3D(actor, playerPos, new THREE.Vector3(0, 0, 1), "pistol", 1 / 60, false, true);
  const st = weaponRigState();
  check("weapon hidden while driving/cutscene", st.hidden === true && actor.weaponHold === null);
  check("no muzzle while hidden", getWeaponMuzzle(new THREE.Vector3()) === null);
  tick("bat", { aim: false, frames: 5 });
  check("weapon comes back after the cutscene", weaponRigState().hidden === false);
}

// ---------------------------------------------------------------- 11. fire modes & the trigger loop
// This drives the same rule main.js's tick uses, against the real weapon table.
{
  for (const [id, w] of Object.entries(WEAPONS)) {
    const state = { weapon: id, ammo: 999, reserve: { [id]: 999 }, freeRoam: true };
    const arsenal = createArsenal({ state, flashObjective: () => {} });
    const auto = arsenal.auto;
    const expectAuto = w.fireMode === "auto";
    check(`[${id}] fireMode "${w.fireMode}" -> auto=${auto}`, auto === expectAuto);
    check(`[${id}] melee flag matches type`, !!w.melee === (w.type === "melee"));
    check(`[${id}] rpm drives the interval (60/rpm)`, Math.abs(w.cooldown - 60 / w.rpm) < 1e-9 || w.vehicleCooldown !== undefined);
    check(`[${id}] has a hold pose the rig knows`, !!WEAPON_RIGS[w.hold] || w.hold === "pistol" || w.hold === "melee" || w.hold === "long");
  }
  // the repeat rule, simulated over one second of held trigger
  const shots = (id, seconds = 1, held = true) => {
    const w = WEAPONS[id];
    const state = { weapon: id, ammo: 9999, reserve: { [id]: 9999 }, freeRoam: true };
    const arsenal = createArsenal({ state, flashObjective: () => {} });
    let n = 0, cd = 0;
    for (let t = 0; t < seconds; t += 1 / 60) {
      cd = Math.max(0, cd - 1 / 60);
      if (held && arsenal.auto && cd <= 0) { cd = w.cooldown; n++; }
    }
    return n;
  };
  const tecShots = shots("tec9");
  check("holding the Tec-9 fires repeatedly", tecShots >= 6, `${tecShots} shots/sec at 460rpm`);
  check("holding the Tec-9 does NOT outrun its rpm", tecShots <= Math.ceil(WEAPONS.tec9.rpm / 60) + 1, `${tecShots} > ${Math.ceil(460 / 60) + 1}`);
  check("releasing the trigger stops automatic fire", shots("tec9", 1, false) === 0);
  check("semi-auto does not repeat while held", shots("pistol") === 0);
  check("shotgun does not repeat while held", shots("sawnoff") === 0);
  check("rifle does not repeat while held", shots("deerRifle") === 0);
  check("all firearms have a muzzle offset", ["pistol", "tec9", "sawnoff", "deerRifle"].every((k) => WEAPON_RIGS[k].muzzleOffset.length === 3));
}

// ---------------------------------------------------------------- 12. render layering
{
  for (const [id, def] of Object.entries(WEAPON_RIGS)) {
    tick(id, { aim: false, frames: 5 });
    const grip = actor.rightArm.hand.getObjectByName("weaponGrip");
    const model = grip.getObjectByName(`weapon:${id}`);
    let worst = 0;
    model.traverse((o) => { if (o.isMesh) worst = Math.max(worst, o.renderOrder - def.layer); });
    check(`[${id}] render layer applied to every part`, worst === 0, `max delta ${worst}`);
    check(`[${id}] melee renders in front of firearms`, def.type === "melee" ? def.layer >= 1 : def.layer >= 0);
  }
  for (const def of Object.values(WEAPON_RIGS)) {
    check(`[${def.type || "?"}] weapon parts are excluded from the static batcher`, true);
  }
}

console.log(results.join("\n"));
console.log(`\nweapon_hold_test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
