import assert from "node:assert";
import { WEAPONS, RARITY, createArsenal } from "../../src/weapons.js";
import { LOOT_TABLES } from "../../src/loot.js";

console.log("Running TASK-036 Weapons & Ammo Unit Tests...");

// Mock DOM elements for headless Node.js unit tests
globalThis.document = {
  createElement: (tag) => ({
    id: "",
    style: {},
    innerHTML: "",
    textContent: "",
  }),
  body: { appendChild: () => {} },
  head: { appendChild: () => {} },
};

// 1. Starter Weapon Check
const state = {};
const logs = [];
const flashObjective = (msg) => logs.push(msg);

const arsenal = createArsenal({ state, flashObjective });

assert.strictEqual(state.weapon, "bat", "Starter weapon should be baseball bat");
assert.strictEqual(state.ammo, Infinity, "Bat ammo should be Infinity");
assert.strictEqual(arsenal.current.id, "bat", "Current weapon object should be bat");
assert.strictEqual(arsenal.stats(false).melee, true, "Bat should be flagged as melee");
console.log("✔ Starter weapon is Baseball Bat (melee, infinite durability)");

// 2. Weapon Pickup & Clip vs Reserve
arsenal.give("tec9", 48);
assert.strictEqual(state.weapon, "tec9", "Equipped weapon should be tec9");
assert.strictEqual(state.ammo, 32, "Clip ammo should cap at clip size (32)");
assert.strictEqual(state.reserve.tec9, 16, "Overflow rounds (16) should go into reserve");
console.log("✔ Weapon pickup correctly splits rounds into clip (32) and reserve (16)");

// 3. Firing & Auto-Reload
for (let i = 0; i < 32; i++) {
  arsenal.consume();
}
// Consuming the 32nd round should trigger reload using 16 reserve rounds
assert.strictEqual(state.ammo, 16, "Auto-reload should load 16 rounds from reserve into clip");
assert.strictEqual(state.reserve.tec9, 0, "Reserve should now be empty (0)");
console.log("✔ Auto-reload triggers on empty clip when reserve ammo is available");

// 4. Reserve Empty -> Swap to Bat
for (let i = 0; i < 16; i++) {
  arsenal.consume();
}
// Consuming last round with 0 reserve should swap back to bat
assert.strictEqual(state.weapon, "bat", "Should swap back to bat when gun is completely empty");
assert.strictEqual(state.ammo, Infinity, "Bat should have infinite ammo");
console.log("✔ Running out of clip & reserve ammo swaps back to Baseball Bat");

// 5. Manual Reloading (Key R)
arsenal.give("sawnoff", 8); // 8 rounds in clip, 0 in reserve
state.ammo = 3; // simulate partially spent clip
arsenal.addReserve("sawnoff", 10);
assert.strictEqual(state.reserve.sawnoff, 10, "Reserve should be 10");
const reloaded = arsenal.reload();
assert.strictEqual(reloaded, true, "Reload action should succeed");
assert.strictEqual(state.ammo, 8, "Clip should be refilled to 8");
assert.strictEqual(state.reserve.sawnoff, 5, "Reserve should be reduced by 5 (to 5)");
console.log("✔ Manual reload moves reserve ammo to fill clip");

// 6. Switching to Bat via Key 1
arsenal.give("bat");
assert.strictEqual(state.weapon, "bat", "Equipping bat should set state.weapon to bat");
assert.strictEqual(state.reserve.sawnoff, 5, "Sawed-off reserve ammo should persist when switching to bat");
console.log("✔ Reserve ammo persists across weapon swaps");

console.log("\nALL TASK-036 UNIT TESTS PASSED SUCCESSFULLY! 🎉");
