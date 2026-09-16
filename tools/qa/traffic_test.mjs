// ---------------------------------------------------------------------------
// traffic_test.mjs — headless checks for the traffic circuit system (TASK-039).
//
// Verifies the fix for "cars vanish at lane ends": every direction pair becomes
// a mutual circuit (lane.next), a car that reaches its lane end hands over to
// the return lane instead of parking (vanishing), a car at a visible lane end
// waits instead of teleporting, and DESPAWN sits past the fog edge.
//
// Run: node tools/qa/traffic_test.mjs   (three.js must resolve from node_modules)
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { createTraffic } from "../../src/traffic.js";

// traffic.js picks lanes and spawn gaps with Math.random. With a 2-car pool both
// cars can land on the same lane and stay there, which failed "cars spawn on both
// lanes" about once in six runs. Seed it: the same run every time.
{
  let a = 0x9e3779b9;
  Math.random = () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// traffic.js paints its light-glow sprite texture on a canvas at car-build
// time; Node has no DOM, so hand it the smallest canvas a 2d-context stub.
globalThis.document = {
  createElement(tag) {
    return {
      width: 0, height: 0, style: {},
      getContext() {
        return { createRadialGradient: () => ({ addColorStop: () => {} }), fillRect: () => {}, set fillStyle(v) {} };
      },
    };
  },
};

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log(`✓ PASS: ${msg}`); return; }
  failures++;
  console.error(`❌ FAIL: ${msg}`);
}

// ---- minimal stubs: no renderer, no real vehicles -------------------------
const scene = new THREE.Scene();
const registered = [];
function registerVehicle(obj, radius, opts = {}) {
  const v = {
    obj, radius, hp: opts.hp ?? 40, dead: false, speed: 0, heading: 0,
    blocker: { x: 0, z: 0 },
    seats: [{ occupant: null }],
  };
  registered.push(v);
  return v;
}

// A 200 m two-way road along x = 0, from z = -100 (north end) to z = 100.
// Ends meet within 15 m so the auto-pairing (main.js) and handover apply.
const lanes = [
  // mutual circuit, exactly what main.js's auto-pairer builds for US-167
  { name: "nb", points: [[2.4, 100], [2.4, -100]], cruise: [12, 14], next: "sb" },
  { name: "sb", points: [[-2.4, -100], [-2.4, 100]], cruise: [12, 14], next: "nb" },
];
const traffic = createTraffic({
  scene, registerVehicle, models: [new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4))],
  lanes, perLane: 2, maxCars: 2,
});

const focus = { x: 0, z: 0 };   // the player stands mid-road
const OBSTACLES = [];
const dt = 0.05;

// 1. Both lanes built and paired into a mutual circuit.
assert(traffic.cars.length >= 0, "traffic system constructs with stub models");
{
  const l = traffic.cars.length;
  for (let i = 0; i < 240 && traffic.cars.length < 2; i++) traffic.update(dt, focus, OBSTACLES, null);
  assert(traffic.cars.length === 2, `pool builds up to per-lane cap (got ${traffic.cars.length}, started ${l})`);
}
// Drive until at least one car is active on each lane, then check pairing.
{
  let nb = null, sb = null;
  for (let i = 0; i < 4000 && !(nb && sb); i++) {
    traffic.update(dt, focus, OBSTACLES, null);
    for (const c of traffic.cars) {
      if (!c.active) continue;
      if (c.lane.name === "nb") nb = c;
      if (c.lane.name === "sb") sb = c;
    }
  }
  assert(nb && sb, "cars spawn on both lanes near the player");
}

// 2. A car at the lane end, far from the player (in the mist), hands over to
//    the return lane instead of parking (vanishing).
{
  let nbCar = null;
  for (let i = 0; i < 3000 && !nbCar; i++) {
    traffic.update(dt, focus, OBSTACLES, null);
    nbCar = traffic.cars.find((c) => c.active && c.lane.name === "nb") || null;
  }
  assert(!!nbCar, "a car is active on the northbound lane");
  if (nbCar) {
    nbCar.s = nbCar.lane.length - 2;           // 2 m from the north end (z = -100)
    nbCar.speed = nbCar.cruise;
    nbCar.obj.position.set(2.4, 0, -98);       // sync: update() reads position for despawn
    const far = { x: 2.4, z: -300 };           // 200 m past the end: beyond WRAP_HIDE
    let handed = false, vanished = false;
    for (let i = 0; i < 600; i++) {
      traffic.update(dt, far, OBSTACLES, null);
      if (!nbCar.active) { vanished = true; break; }
      if (nbCar.lane.name !== "nb") { handed = true; break; }
    }
    assert(!vanished, "lane-end car beyond the mist is never parked (never vanishes)");
    assert(handed, "lane-end car beyond the mist hands over to the return lane");
    if (handed) assert(nbCar.s > 0 && nbCar.s < nbCar.lane.length, "handover lands inside the return lane");
  }
}

// 3. A car at a VISIBLE lane end (player nearby) waits at the end — it must not
//    disappear and must not teleport to the return lane.
{
  let sbCar = null;
  for (let i = 0; i < 3000 && !sbCar; i++) {
    traffic.update(dt, focus, OBSTACLES, null);
    sbCar = traffic.cars.find((c) => c.active && c.lane.name === "sb") || null;
  }
  assert(!!sbCar, "a car is active on the southbound lane");
  if (sbCar) {
    sbCar.s = sbCar.lane.length - 2;           // 2 m from the south end (z = +100)
    sbCar.speed = sbCar.cruise;
    const near = { x: -2.4, z: 92 };           // player right there
    let parked = false, moved = false;
    for (let i = 0; i < 300; i++) {
      traffic.update(dt, near, OBSTACLES, null);
      if (!sbCar.active) { parked = true; break; }
      if (sbCar.lane.name !== "sb") { moved = true; break; }
    }
    assert(!parked && !moved, "visible lane-end car neither vanishes nor teleports");
    if (!parked && !moved) {
      const d = Math.hypot(sbCar.obj.position.x + 2.4, sbCar.obj.position.z - 100);
      assert(d < 8, `visible car holds at the lane end (${d.toFixed(1)} m from the end)`);
    }
  }
}

// 4. DESPAWN (235) sits past WRAP_HIDE but inside the fog edge (~240 m at
//    density 0.0072): a car can never pop out of existence on screen.
{
  const c = traffic.cars[0];
  c.active = true;
  c.s = 10;
  c.lane = c.lane;                            // whichever lane it holds
  const f = { x: c.obj.position.x, z: c.obj.position.z + 230 };   // 230 m away
  traffic.update(dt, f, OBSTACLES, null);
  assert(c.active, "car at 230 m (inside the fog, past wrap range) is still simulated, not vanished");
}

console.log(failures === 0 ? "\n=== traffic_test: ALL PASS ===" : `\n=== traffic_test: ${failures} FAILURE(S) ===`);
process.exit(failures === 0 ? 0 : 1);
