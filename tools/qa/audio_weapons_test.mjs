// ---------------------------------------------------------------------------
// audio_weapons_test.mjs — headless checks for the car audio + 3D weapons
// wiring (TASK-040).
//
// Verifies:
//   A. weapons_3d.js — the view-model builds every weapon id the game's
//      arsenal can hold (bat / pistol / tec9 / sawnoff / deerRifle), unknown
//      ids fall back to the pistol proxy, the pivot hides while driving /
//      in a cutscene, and the fire animations play and settle.
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
const { initWeapons3D, updateWeapon3D, playFireAnim3D } = await import("../../src/weapons_3d.js");
const { collisionResponse, stepArcadeVehicle } = await import("../../src/vehicles.js");

// ===========================================================================
section("A. weapons_3d — ids, fallback, gating");
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.3, 420);
initWeapons3D(scene);                    // loader fails offline: the procedural fallback stays
const pivot = scene.children.find(o => o.isGroup && o.type === "Group");
assert(!!pivot, "weapon pivot added to the scene");
assert(pivot.visible === false, "pivot hidden until the first on-foot update");

const pos = new THREE.Vector3(0, 0, 0);
const aim = new THREE.Vector3(0, 0, -1);
// on foot, aiming: each arsenal id shows a model without throwing
for (const id of ["bat", "pistol", "tec9", "sawnoff", "deerRifle"]) {
  updateWeapon3D(pos, aim, id, 1 / 60, true);
  assert(pivot.visible === true && pivot.children.length === 1 && pivot.children[0].name === id,
    `weapon "${id}" builds and attaches`);
}
// unknown id → pistol proxy (model still attaches, named with the id)
updateWeapon3D(pos, aim, "minigun", 1 / 60, true);
assert(pivot.children.length === 1, "unknown weapon id still attaches a model (pistol proxy)");
// holstered
updateWeapon3D(pos, aim, "bat", 1 / 60, false);
assert(pivot.children[0].position.y < 0 && Math.abs(pivot.children[0].rotation.x + Math.PI / 2) < 1e-6,
  "not aiming: weapon lowered to the hip");
// hidden while driving / cutscene: visible flag drops (model may stay parented)
updateWeapon3D(pos, aim, "bat", 1 / 60, true, true);
assert(pivot.visible === false, "hidden=driving/cinematic hides the pivot");
updateWeapon3D(null, aim, "bat", 1 / 60, true, false);
assert(pivot.visible === false, "null playerPos (between states) hides instead of throwing");
// back on foot: visible again
updateWeapon3D(pos, aim, "bat", 1 / 60, true, false);
assert(pivot.visible === true, "back on foot: pivot visible again");

// fire anims run and settle (no per-frame throw, no NaNs)
playFireAnim3D(true);
for (let i = 0; i < 40; i++) updateWeapon3D(pos, aim, "bat", 1 / 60, true);
assert(Number.isFinite(pivot.children[0].rotation.y), "melee swing plays 40 frames, stays finite");
playFireAnim3D(false);
for (let i = 0; i < 40; i++) updateWeapon3D(pos, aim, "pistol", 1 / 60, true);
assert(Number.isFinite(pivot.children[0].rotation.x), "gun recoil plays 40 frames, stays finite");

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
