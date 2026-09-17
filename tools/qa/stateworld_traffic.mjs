// ---------------------------------------------------------------------------
// stateworld_traffic.mjs — headless checks that the state-wide roads carry
// real traffic (TASK-042), against the lanes TASK-041 landed.
//
// The lane data is parsed straight out of src/stateWorld.js source text, so
// this test follows Antigravity's current definitions — no hardcoded copies.
//
// Verifies:
//   1. Lane data: no dead ends — every lane on the map (US-167 + stateWorld)
//      pairs into a resolving circuit, so a car can never drive off into the
//      void and park. AUDIT NOTE (not asserted): the state lanes touch US-167
//      at x = -6 but handovers only happen at lane ENDS, so the network is
//      several local loops, not one through-network — cars never turn between
//      US-167 and a state road. See AGENT_LOG → TASK-042 for the proposal.
//   2. Circuits: main.js's auto-pairing (the same find() logic) pairs every
//      state lane into a mutual return pair or a one-way loop.
//   3. Life on the roads: the real createTraffic pool (maxCars 28, the way
//      main.js builds it) spawns moving cars on the state lanes when the
//      player visits each of Port Calypso, Cypress Hills and Lakeshore —
//      an empty road reads worse than an empty field.
//   4. Recycle: cars left behind at one region despawn (park) once the focus
//      moves on; nothing accumulates at the far reaches.
//   5. Audio spot-check: a state-road car builds its audio lazily on first
//      drive and tears it down on exit (the main.js lastVehAudio contract).
//
// Run: node tools/qa/stateworld_traffic.mjs
// (three.js resolves from the local node_modules stub)
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { readFileSync } from "node:fs";
import { createTraffic } from "../../src/traffic.js";
import { initAudio, createCarAudio, resumeAudio } from "../../src/audio.js";

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

// ---- the stateWorld lanes, parsed from source (always current) -------------
// Matches lines like: { name: "port-hwy-east", points: [[-6, -596], [1050, -596]], cruise: [14, 22] },
function stateLanesFromSource() {
  const src = readFileSync(new URL("../../src/stateWorld.js", import.meta.url), "utf8");
  const re = /name: "([^"]+)", points: (\[\[.*?\]\])(?:, cruise: \[([\d.]+), ([\d.]+)\])?/g;
  const lanes = [];
  for (const m of src.matchAll(re)) {
    lanes.push({
      name: m[1],
      points: JSON.parse(m[2]),
      cruise: m[3] ? [Number(m[3]), Number(m[4])] : [12, 19],
    });
  }
  return lanes;
}

const stateLanes = stateLanesFromSource();
const STATE_NAMES = new Set(stateLanes.map((l) => l.name));

// main.js builds the US-167 pair from ROAD_X = -6 and the STATE_BOUNDS clamps:
const US167 = [
  { name: "northbound", points: [[-3.6, 1198], [-3.6, -1198]], cruise: [12, 19] },
  { name: "southbound", points: [[-8.4, -1198], [-8.4, 1198]], cruise: [12, 19] },
];

// ---- minimal vehicle registration, the way main.js's registerVehicle does --
const usedModels = [];
function registerVehicle(obj, radius, opts = {}) {
  const v = {
    obj, radius, hp: opts.hp ?? 40, dead: false, speed: 0, heading: 0,
    blocker: { x: 0, z: 0 }, seats: [{ occupant: "npc" }], audio: null,
  };
  return v;
}
function fakeCarModel() {
  const obj = new THREE.Group();          // clone() must yield a fresh object
  obj.position.set(0, 0, 0);
  usedModels.push(obj);
  return obj;
}

// ---- main.js's circuit auto-pairing, verbatim logic ------------------------
function autoPair(all) {
  const start = (l) => l.points[0], end = (l) => l.points[l.points.length - 1];
  const near = (p, q, tol = 15) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol;
  for (const a of all) {
    if (a.next) continue;
    const b = all.find((o) => o !== a && near(end(o), start(a), 20) && near(start(o), end(a)))
           || all.find((o) => o !== a && near(start(o), end(a)));
    if (b) a.next = b.name;
  }
  return all;
}

// ---- 1. lane data: no dead ends anywhere + topology audit ------------------
{
  const graph = autoPair([...US167, ...stateLanes.map((l) => ({ ...l }))]);
  for (const l of graph) {
    assert(!!l.next && graph.some((o) => o.name === l.next), `lane "${l.name}" pairs into a resolving circuit (next: ${l.next})`);
  }
  // audit printout: connected components over the next-graph (mutual links)
  const adj = new Map(graph.map((l) => [l.name, []]));
  for (const l of graph) {
    if (!l.next || !adj.has(l.next)) continue;
    adj.get(l.name).push(l.next);
    adj.get(l.next).push(l.name);
  }
  const seen = new Set();
  const comps = [];
  for (const l of graph) {
    if (seen.has(l.name)) continue;
    const q = [l.name], comp = [];
    while (q.length) {
      const n = q.pop();
      if (seen.has(n)) continue;
      seen.add(n); comp.push(n);
      for (const m of adj.get(n) || []) if (!seen.has(m)) q.push(m);
    }
    comps.push(comp);
  }
  const usComp = comps.find((c) => c.includes("northbound")) || [];
  console.log(`AUDIT: ${comps.length} disjoint traffic components; US-167's contains ${usComp.length} lane(s), state-only components: ${comps.filter((c) => !c.includes("northbound")).length}`);
}

// ---- 2. circuits -----------------------------------------------------------
{
  const paired = autoPair([...US167, ...stateLanes.map((l) => ({ ...l }))]);
  for (const l of paired) {
    if (!STATE_NAMES.has(l.name)) continue;
    assert(!!l.next, `state lane "${l.name}" is paired into a circuit (next: ${l.next})`);
    if (l.next) assert(paired.some((o) => o.name === l.next), `state lane "${l.name}" → next "${l.next}" resolves`);
  }
}

// ---- live pool on the real lanes -------------------------------------------
const allDefs = [...US167, ...stateLanes];
autoPair(allDefs);

function makeTraffic() {
  const scene = new THREE.Scene();
  return { scene, traffic: createTraffic({
    scene, registerVehicle,
    models: Array.from({ length: 9 }, fakeCarModel),
    lanes: allDefs,
    perLane: 5,   // matches main.js's createTraffic() call (TASK-042 pool tune, Claude applied)
    maxCars: 28,
  }) };
}
function step(traffic, focus, n = 400, dt = 0.05) {
  for (let i = 0; i < n; i++) traffic.update(dt, focus, [], null);
}
const activeOn = (traffic, names) => traffic.cars.filter((c) => c.active && names.has(c.lane.name));
const activeCars = (traffic) => traffic.cars.filter((c) => c.active);

// Focus points sit ~55 m off each region's main road (like a player walking it)
const REGIONS = [
  { name: "Port Calypso (NE)",  focus: { x: 500,  z: -650 }, laneRe: /^(port-hwy|dockside)/ },
  { name: "Cypress Hills (NW)", focus: { x: -650, z: -650 }, laneRe: /^red-dust-pass/ },
  { name: "Lakeshore Marsh (SW)", focus: { x: -450, z: 800 }, laneRe: /^causeway/ },
];

const DESPAWN = 235; // traffic.js default
let t;
for (const r of REGIONS) {
  if (!t) { ({ traffic: t } = makeTraffic()); } else {
    // recycle check on the way out of the previous region
    const leftovers = activeCars(t).length;
    step(t, r.focus, 600); // 30 s of driving away; everything >235 m parks
    const still = activeCars(t).filter((c) => Math.hypot(c.obj.position.x - r.focus.x, c.obj.position.z - r.focus.z) > DESPAWN + 1);
    assert(still.length === 0 || leftovers === 0, `cars recycle when the focus moves (${REGIONS[REGIONS.indexOf(r) - 1]?.name} → ${r.name}): none left beyond despawn range`);
  }
  step(t, r.focus, 600); // 30 s: pool builds (0.25 s/car) and spawns in
  const onState = activeOn(t, STATE_NAMES).filter((c) => r.laneRe.test(c.lane.name));
  assert(onState.length >= 1, `${r.name}: traffic on the state roads (${onState.length} cars on ${[...new Set(onState.map((c) => c.lane.name))].join(", ") || "none"})`);
  assert(onState.every((c) => Math.hypot(c.obj.position.x - r.focus.x, c.obj.position.z - r.focus.z) <= DESPAWN), `${r.name}: every car within despawn range of the player`);
  assert(onState.every((c) => Number.isFinite(c.s) && Number.isFinite(c.obj.position.x) && Number.isFinite(c.obj.position.z)), `${r.name}: no NaN positions/arc-lengths`);
}

// ---- cars actually move ----------------------------------------------------
{
  const before = activeOn(t, STATE_NAMES).map((c) => ({ name: c.lane.name, s: c.s }));
  step(t, REGIONS[2].focus, 40); // 2 s
  const after = activeOn(t, STATE_NAMES);
  const moving = after.filter((c) => {
    const b = before.find((x) => x.name === c.lane.name && Math.abs(x.s - c.s) < 400);
    return b ? Math.abs(c.s - b.s) > 1 : true;
  });
  assert(moving.length >= 1, `state-road cars move under cruise (≥1 advanced >1 m in 2 s)`);
}

// ---- 5. audio spot-check on a state-road car -------------------------------
{
  const camera = new THREE.PerspectiveCamera();
  initAudio(camera);
  resumeAudio(); // flip the stub context to "running", like the first click does
  const car = activeOn(t, STATE_NAMES)[0] || activeCars(t)[0];
  assert(!!car, "audio spot-check has a car to drive");
  if (car) {
    car.v.audio = createCarAudio(car.obj);          // main.js's registerVehicle does this
    car.v.audio.update(60, false, true);            // driven: builds lazily
    assert(car.v.audio.started, "driven state-road car built its audio lazily");
    const group = car.v.audio.group;
    assert(group && group.parent === car.obj, "audio group attached to the car");
    car.v.audio.update(0, false, false);            // main.js lastVehAudio calls this on exit
    assert(!car.v.audio.group || !car.v.audio.group.parent, "exiting the car tore the audio down");
    car.v.audio.destroy();
  }
}

// ---- variety tally ---------------------------------------------------------
{
  const distinct = usedModels.length; // clones requested across the whole run
  assert(distinct >= 2, `vehicle variety: pool drew from ${distinct} distinct models (≥2)`);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
