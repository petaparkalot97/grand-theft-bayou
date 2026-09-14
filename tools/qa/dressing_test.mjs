// ---------------------------------------------------------------------------
// dressing_test.mjs — Standalone Node unit test for TASK-038 Set Dressing & Assets
// ---------------------------------------------------------------------------

import assert from "assert";
import * as THREE from "three";
import { CITY_BUILDING_TYPES, placeCityBuilding, makeDecorativeFence, placeOfficeClutter } from "../../src/landmarks.js";
import { createEastBank } from "../../src/eastbank.js";
import { createOrleaRouge } from "../../src/orlearouge.js";
import { createWestParish } from "../../src/westparish.js";

// Dummy Three.js environment stubs for standalone execution
if (typeof globalThis.document === "undefined") {
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        fillStyle: "", fillRect: () => {}, font: "", textAlign: "", textBaseline: "", fillText: () => {},
        strokeStyle: "", lineWidth: 1, strokeRect: () => {}, moveTo: () => {}, lineTo: () => {},
        beginPath: () => {}, stroke: () => {}, fill: () => {}, arc: () => {}
      }),
      width: 128, height: 128
    })
  };
}

class MockMaterial {
  constructor(opts = {}) {
    Object.assign(this, opts);
    this.userData = {};
    this.color = { set: () => {}, copy: () => ({ multiplyScalar: () => {} }), multiplyScalar: () => {} };
  }
}
class MockVector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
class MockObject3D {
  constructor() {
    this.position = new MockVector3();
    this.rotation = new MockVector3();
    this.scale = new MockVector3(1, 1, 1);
    this.children = [];
  }
  add(child) { this.children.push(child); }
}

function createMockCtx() {
  const scene = new MockObject3D();
  const blockers = [];
  const litSpots = [];
  const pois = [];

  return {
    scene,
    ROAD_X: -6,
    ROAD_HALF: 4.5,
    playerPos: new MockVector3(0, 0, 0),
    state: { cinematic: false },
    cine: { scene: () => {} },
    addBlocker: (x, z, r) => blockers.push({ x, z, r }),
    addLitSpot: (spot) => litSpots.push(spot),
    poolLight: (color, power, range, x, y, z) => litSpots.push({ color, power, range, x, y, z }),
    flashObjective: () => {},
    roadMaterial: () => new MockMaterial(),
    surface: () => ({
      material: () => new MockMaterial(),
    }),
    makeShed: () => new MockObject3D(),
    makeFence: () => new MockObject3D(),
    makeBarrel: () => new MockObject3D(),
    makePallet: () => new MockObject3D(),
    makeWaterTower: () => new MockObject3D(),
    makeBillboard: () => new MockObject3D(),
    makeGasStation: () => new MockObject3D(),
    makeNeonSign: () => new MockMaterial(),
    placeGlbLandmark: () => false, // test procedural fallback
    getSheriffProto: () => null,
    blockers,
    litSpots,
    pois,
  };
}

console.log("=== Testing TASK-038: Set Dressing & Asset Integration ===");

// 1. Verify 10 City Building GLB Types
const expectedTypes = [
  "cottage", "apartments", "school", "cafe", "market",
  "hospital", "offices", "garage", "fire_station", "tower"
];
assert.strictEqual(Object.keys(CITY_BUILDING_TYPES).length, 10, "Should have 10 building types");
for (const key of expectedTypes) {
  assert.ok(CITY_BUILDING_TYPES[key], `Building type ${key} should be defined`);
  assert.ok(CITY_BUILDING_TYPES[key].file.endsWith(".glb"), `File for ${key} should be a .glb`);
}
console.log("✓ PASS: All 10 city building variants registered");

// 2. Test placeCityBuilding
const mockCtx1 = createMockCtx();
const bBuilding = placeCityBuilding(mockCtx1, "offices", 100, 200);
assert.ok(bBuilding, "placeCityBuilding should return a Group");
assert.ok(mockCtx1.blockers.length > 0, "Should add a collision blocker for the building");
assert.ok(mockCtx1.litSpots.length > 0, "Should add a lit spot for entrance canopy");
console.log("✓ PASS: placeCityBuilding constructs building with collision & lighting");

// 3. Test makeDecorativeFence
const mockCtx2 = createMockCtx();
const fenceGroup = makeDecorativeFence(mockCtx2, 0, 0, 10, 0);
assert.ok(fenceGroup, "makeDecorativeFence should return a Group");
assert.ok(fenceGroup.children.length > 5, "Fence group should contain piers, caps, and rails");
assert.ok(mockCtx2.blockers.length >= 2, "Fence should place blockers along its length");
console.log("✓ PASS: makeDecorativeFence generates posts, caps, rails, and blockers");

// 4. Test placeOfficeClutter
const mockCtx3 = createMockCtx();
const clutterGroup = placeOfficeClutter(mockCtx3, 10, 10);
assert.ok(clutterGroup, "placeOfficeClutter should return a Group");
assert.ok(clutterGroup.children.length >= 5, "Office clutter should contain desk, chair, laptop, bin, and potted plant");
assert.ok(mockCtx3.blockers.length > 0, "Office clutter should add a collision blocker");
console.log("✓ PASS: placeOfficeClutter builds executive desk, laptop, swivel chair, bin, and planter");

// 5. Integration Test: EastBank set build
const mockCtxEB = createMockCtx();
const eb = createEastBank(mockCtxEB);
eb.buildSet();
assert.ok(mockCtxEB.scene.children.length > 10, "EastBank set should populate scene elements");
console.log("✓ PASS: EastBank district builds cleanly with set dressing");

// 6. Integration Test: OrleaRouge set build
const mockCtxOR = createMockCtx();
const or = createOrleaRouge(mockCtxOR);
or.buildSet();
assert.ok(mockCtxOR.scene.children.length > 10, "OrleaRouge district should populate scene elements");
console.log("✓ PASS: OrleaRouge district builds cleanly with set dressing");

// 7. Integration Test: WestParish set build
const mockCtxWP = createMockCtx();
const wp = createWestParish(mockCtxWP);
wp.buildSet();
assert.ok(mockCtxWP.scene.children.length > 10, "WestParish district should populate scene elements");
console.log("✓ PASS: WestParish district builds cleanly with set dressing");

console.log("🎉 All Set Dressing & Asset Integration tests passed cleanly!");
