// ---------------------------------------------------------------------------
// audio_weapons_test.mjs — headless checks for the car audio + 3D weapons
// wiring (TASK-040).
//
// Verifies:
//   A. weapons_3d.js — the module contract around attachment: boot puts nothing
//      in the scene, an absent actor is a safe no-op (menu / between states),
//      every weapon the game can hold has a rig, and the muzzle only exists for
//      a weapon that is actually held.
//
//      This section used to assert the old VIEW MODEL: one pivot added to the
//      scene, moved around the player's world position, holstered by writing
//      `position.y` and a rotation onto it. That design is exactly what made a
//      weapon read as an image parked next to the character, so it is gone.
//      The geometry — grip in the fist, muzzle down the aim, support hand on the
//      foregrip — is measured in weapon_hold_test.mjs against a real rig.
//   B. audio.js — car audio is lazy and gesture-safe: createCarAudio before
//      initAudio returns a usable no-op object, audio only builds for the
//      active car, deactivating it stops and tears down, destroy() cleans up,
//      and resumeAudio() resumes the suspended context.
//   C. vehicles.js — collisionResponse() reports the first-frame impact as
//      v.impact (the hook drivingUpdate turns into crash damage).
//
// Run: node tools/qa/audio_weapons_test.mjs
// (three resolves to the local QA stub in node_modules/three — see index.js)
// ---------------------------------------------------------------------------

import * as THREE from "three";

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log(`✓ PASS: ${msg}`); return; }
  failures++;
  console.error(`✗ FAIL: ${msg}`);
}
function section(name) { console.log(`\n--- ${name} ---`); }

const { initAudio, createCarAudio, resumeAudio } = await import("../../src/audio.js");
const { initWeapons3D, updateWeapon3D, getWeaponMuzzle, playFireAnim3D, notifyReload3D, weaponRigState, WEAPON_RIGS } = await import("../../src/weapons_3d.js");
const { WEAPONS } = await import("../../src/weapons.js");
const { collisionResponse, stepArcadeVehicle } = await import("../../src/vehicles.js");

// ===========================================================================
section("A. weapons_3d — attachment contract");
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.3, 420);
initWeapons3D(scene);                    // loader fails offline: the procedural fallback stays
assert(scene.children.length === 0,
  "initWeapons3D adds nothing to the scene (weapons hang off the character, not the world)");

const pos = new THREE.Vector3(0, 0, 0);
const aim = new THREE.Vector3(0, 0, 1);
// Between states there is no actor. That has to be a no-op, for every id, on
// every frame — it is the menu, the cutscene and the load path all at once.
for (const id of Object.keys(WEAPONS)) {
  updateWeapon3D(null, pos, aim, id, 1 / 60, true);
  updateWeapon3D(undefined, pos, aim, id, 1 / 60, false);
}
assert(weaponRigState().attached === false, "no actor (menu / between states) is a safe no-op");
assert(getWeaponMuzzle(new THREE.Vector3()) === null, "no muzzle while nothing is held");
// an object that is not a character (no hand socket) must also be refused, not
// half-attached to
const notAnActor = new THREE.Group();
updateWeapon3D(notAnActor, pos, aim, "pistol", 1 / 60, true);
assert(weaponRigState().attached === false, "an object with no hand socket is refused");
// the fire/reload hooks are safe with nothing attached (a queued input can land
// in the same frame a weapon is dropped)
playFireAnim3D("pistol", false);
playFireAnim3D("bat", true);
notifyReload3D("pistol", 1.1);
notifyReload3D("bat", 1);
assert(true, "fire / reload hooks do not throw with nothing held");

// Every weapon the arsenal can hold needs a rig entry, or it silently falls
// back to the pistol — carried like a 9mm, which is how a new weapon ends up
// looking wrong instead of failing.
for (const id of Object.keys(WEAPONS)) {
  assert(!!WEAPON_RIGS[id], `weapon "${id}" has a rig entry (hold pose, grip, muzzle)`);
}
assert(Object.keys(WEAPON_RIGS).length >= Object.keys(WEAPONS).length,
  "no rig entry exists for a weapon the game cannot hold");
for (const [id, def] of Object.entries(WEAPON_RIGS)) {
  assert(Array.isArray(def.muzzleOffset) && def.muzzleOffset.length === 3 && def.muzzleOffset.some((v) => v !== 0),
    `[${id}] has a real muzzle offset (effects start at the barrel)`);
  assert(def.handOffset.length === 3 && def.rotationOffset.length === 3,
    `[${id}] carries its attachment config (hand / rotation offsets)`);
  assert(["pistol", "long", "melee"].includes(def.hold),
    `[${id}] names a hold pose the character rig implements`);
}

// ===========================================================================
section("B. audio — lazy, gesture-safe, gated to the player's car");
const car = new THREE.Group();
// BEFORE initAudio: the pre-fix bug was `undefined` here (cars registered
// before any gesture got nothing forever). Now it's a usable no-op object.
const preAudio = createCarAudio(car);
assert(!!preAudio && typeof preAudio.update === "function", "createCarAudio before initAudio still returns a usable object");
preAudio.update(50, false, true);        // must not throw without a listener
assert(car.children.length === 0, "no audio nodes attached before initAudio");

initAudio(camera);
assert(camera.children.some(c => c.isAudioListener === true), "initAudio put an AudioListener on the camera");
resumeAudio();
await Promise.resolve();                  // resumeAudio is async
assert(camera.children[0].context.state === "running", "resumeAudio() resumes the suspended context");

const audio = createCarAudio(car);
audio.update(50, false, true);           // listener exists now → builds (buffers still loading)
const group = car.children.find(c => c.type === "Group");
assert(!!group, "active car gets an audio group attached");
assert(audio.started === true, "audio marks itself started once activated");

// traffic car: active=false never builds, and deactivating tears down
const trafficCar = new THREE.Group();
const trafficAudio = createCarAudio(trafficCar);
trafficAudio.update(80, false, false);
assert(trafficCar.children.length === 0, "inactive (traffic) car builds no audio");
audio.update(0, false, false);           // player got out
assert(car.children.length === 0, "deactivating the player's car removes the audio group");
assert(audio.started === false, "deactivated audio resets to unstarted");
audio.update(30, false, true);           // back in
assert(!!car.children.find(c => c.type === "Group"), "re-entering the car rebuilds audio");
audio.destroy();
assert(car.children.length === 0, "destroy() removes the audio group (explodeCar path)");
audio.destroy();                          // idempotent
assert(true, "destroy() is safe to call twice");
assert(audio.engine === null && audio.squeal === null, "destroy() drops the engine and squeal nodes");

// ===========================================================================
section("C. vehicles — v.impact contract (crash damage source)");
{
  const v = { heading: Math.PI / 2, speed: 20, jolt: 0, inContact: false };   // heading east
  const intendedX = 20, intendedZ = 0;
  const resolvedX = 18, resolvedZ = 0;                                        // wall pushed it 2 m back
  const touching = collisionResponse(v, intendedX, intendedZ, resolvedX, resolvedZ, 1 / 60);
  assert(touching === true, "head-on contact reported as touching");
  assert(v.impact > 0, `first frame sets v.impact (${v.impact && v.impact.toFixed(1)} m/s)`);
  assert(v.speed < 20, "head-on hit lost speed");
  const impact = v.impact;
  collisionResponse(v, intendedX, intendedZ, resolvedX + 0.01, resolvedZ, 1 / 60);
  assert(v.impact === impact, "impact does not stack on later frames of the same contact");
}
{
  // glancing scrape must NOT set impact (that's a slide, not a crash)
  const v = { heading: 0, speed: 15, jolt: 0, inContact: false };             // moving +z
  const intendedX = 0, intendedZ = 15;
  const resolvedX = 0.5, resolvedZ = 15;                                      // tiny sideways push only
  collisionResponse(v, intendedX, intendedZ, resolvedX, resolvedZ, 1 / 60);
  assert(!v.impact, "a sideways scrape sets no impact (not crash damage)");
}
{
  // stepping a car normally leaves impact untouched
  const v = { heading: Math.PI, speed: 10 };
  stepArcadeVehicle(v, { throttle: 1, steer: 0, brake: false }, 1 / 60);
  assert(!v.impact, "ordinary driving leaves v.impact untouched");
}

// ===========================================================================
console.log(`\n${failures === 0 ? "ALL PASS" : failures + " FAILURE(S)"}`);
process.exit(failures === 0 ? 0 : 1);
