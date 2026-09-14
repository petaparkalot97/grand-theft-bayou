import assert from "node:assert";
import { createPauseMenu } from "../../src/pauseMenu.js";

console.log("Running GTA Pause Menu & Map Unit Tests...");

// Mock DOM elements for headless Node.js unit tests
globalThis.document = {
  createElement: (tag) => {
    const el = {
      id: "",
      style: {},
      innerHTML: "",
      textContent: "",
      children: [],
      appendChild: (c) => el.children.push(c),
      querySelector: (sel) => el,
      querySelectorAll: (sel) => [],
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      getContext: () => ({
        setTransform: () => {},
        clearRect: () => {},
        fillRect: () => {},
        strokeRect: () => {},
        drawImage: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        arc: () => {},
        closePath: () => {},
        fill: () => {},
        stroke: () => {},
        fillText: () => {},
      }),
    };
    return el;
  },
  body: { appendChild: () => {} },
  head: { appendChild: () => {} },
};
globalThis.window = {
  devicePixelRatio: 1,
  addEventListener: () => {},
};

const MAP = { minX: -440, maxX: 380, minZ: -136, maxZ: 382 };
const state = { running: true, paused: false, weapon: "bat", cash: 500, hp: 100 };
const getPlayerPos = () => ({ x: 18, z: 84 });
const arsenal = {
  stats: () => ({ damage: 3, range: 2.2 }),
};

const pauseMenu = createPauseMenu({ MAP, state, getPlayerPos, minimap: null, arsenal, kills: {} });

assert.strictEqual(pauseMenu.isOpen, false, "Pause menu should be closed by default");
assert.strictEqual(state.paused, false, "Game should not be paused by default");

// Open pause menu
pauseMenu.open();
assert.strictEqual(pauseMenu.isOpen, true, "Pause menu should be open");
assert.strictEqual(state.paused, true, "Game should be paused when menu is open");
console.log("✔ Pause menu opens and sets state.paused = true");

// Close pause menu
pauseMenu.close();
assert.strictEqual(pauseMenu.isOpen, false, "Pause menu should be closed");
assert.strictEqual(state.paused, false, "Game should resume when menu is closed");
console.log("✔ Pause menu closes and resumes gameplay");

console.log("\nALL PAUSE MENU UNIT TESTS PASSED SUCCESSFULLY! 🎉");
