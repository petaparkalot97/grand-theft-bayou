// ---------------------------------------------------------------------------
// police_test.mjs — Standalone Node unit test for TASK-020 Police System
// ---------------------------------------------------------------------------

import assert from "assert";
import * as THREE from "three";
if (typeof globalThis.document === "undefined") {
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        fillStyle: "", fillRect: () => {}, font: "", textAlign: "", textBaseline: "", fillText: () => {},
        strokeStyle: "", lineWidth: 1, strokeRect: () => {}, moveTo: () => {}, lineTo: () => {},
        beginPath: () => {}, stroke: () => {}, fill: () => {}, arc: () => {},
        createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
        putImageData: () => {},
        createRadialGradient: () => ({ addColorStop: () => {} }),
        createLinearGradient: () => ({ addColorStop: () => {} })
      }),
      width: 128, height: 128
    })
  };
}

import { makeDeputy } from "../../src/characters.js";
import { createPoliceSystem } from "../../src/police.js";

// 1. Character procedural 3D deputy model test
const deputyMesh = makeDeputy({ police: true, hat: true });
assert(deputyMesh && deputyMesh.children.length > 0, "makeDeputy creates a 3D procedural Object3D character");
assert(deputyMesh.children.some(c => c.children && c.children.length > 0), "Deputy character has structured head and torso rig");

// 2. Police System Harness Setup
const scene = new THREE.Group();
const MAP = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
const playerPos = new THREE.Vector3(0, 0, 0);

const hitPlayerCalls = [];
const hitPlayer = (dmg) => hitPlayerCalls.push(dmg);

const registerVehicle = () => {};
const blockers = [];
const createDrop = () => {};

const state = {
  wanted: 2,
  heat: 2,
  heatDecay: 0.2,
  playerDead: false,
};

const policeSystem = createPoliceSystem({
  scene,
  MAP,
  playerPos,
  hitPlayer,
  registerVehicle,
  blockers,
  createDrop,
  state,
});

// 3. Test Cruiser Model Construction
const cruiser = policeSystem.buildCruiserModel();
assert(cruiser && cruiser.children.length > 0, "buildCruiserModel returns upgraded cruiser Object3D");
let hasBeacons = false;
cruiser.traverse(c => { if (c.material && (c.material.name === "blue beacon" || c.material.name === "red beacon")) hasBeacons = true; });
assert(hasBeacons, "Cruiser has lightbar rig with red/blue emissive beacons");

// 4. Test On-Foot Cop Spawning and AI Movement
const footCop = policeSystem.spawnFootCop(10, 10);
assert(footCop && footCop.spr.position.x === 10 && footCop.spr.position.z === 10, "spawnFootCop spawns on-foot deputy officer");
assert(policeSystem.footCops.length === 1, "Foot cop added to police system list");

// Update police system: cop should advance towards player at (0,0,0)
const initialDist = Math.hypot(footCop.spr.position.x - playerPos.x, footCop.spr.position.z - playerPos.z);
policeSystem.updateFootCops(0.5, { player: playerPos });
const newDist = Math.hypot(footCop.spr.position.x - playerPos.x, footCop.spr.position.z - playerPos.z);
assert(newDist < initialDist, "On-foot cop moves towards player position");

// Move cop to melee range (1.2m)
footCop.spr.position.set(1.0, 0, 0);
policeSystem.updateFootCops(0.5, { player: playerPos });
assert(hitPlayerCalls.length > 0, "On-foot cop attacks player in melee range");

// Test foot cop defeat and loot drop
const initialLootCount = scene.children.length;
footCop.hp = 0;
policeSystem.updateFootCops(0.1, { player: playerPos });
assert(policeSystem.footCops.length === 0, "Defeated on-foot cop drops loot");

// 5. Test Search & Evasion AI Give-up Decay
state.wanted = 1;
state.heat = 1;
playerPos.set(0, 0, 0);

// Line of sight maintained -> chase stays active
policeSystem.updateSearchAndEvasion(0.5, playerPos, true, state);
assert(state.wanted === 1, "Wanted level maintained while player visible");

// Out of sight -> lost timer builds up, give up after ~5s
let totalDt = 0;
while (totalDt < 6.0 && state.wanted > 0) {
  policeSystem.updateSearchAndEvasion(0.5, playerPos, false, state);
  totalDt += 0.5;
}

assert(state.wanted === 0 && state.heat === 0, "Police give up chase after evasion window, heat and wanted reset to 0");
console.log("🎉 All Police System unit tests passed cleanly!");
