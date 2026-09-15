import { createTusouxroeNorth } from './src/tusouxroeNorth.js';
import { createStateWorld } from './src/stateWorld.js';

const mockScene = { add: () => {}, children: [] };
const mockCtx = {
  scene: mockScene,
  surface: () => ({ material: () => ({ userData: {} }) }),
  roadMaterial: () => ({ userData: {} }),
  addBlocker: () => {},
  addLitSpot: () => {},
  placeGlbLandmark: () => {},
  loadGLB: async () => ({ clone: () => ({ scale: { setScalar: () => {} }, position: { set: () => {} }, traverse: () => {} }) })
};

// We need a mock THREE
import * as THREE from 'three';
global.THREE = THREE;

try {
  const tn = createTusouxroeNorth(mockCtx);
  tn.buildSet();
  console.log("TusouxroeNorth SUCCESS");
} catch(e) {
  console.error("TusouxroeNorth ERROR:", e);
}

try {
  const sw = createStateWorld(mockCtx);
  sw.buildSet();
  console.log("StateWorld SUCCESS");
} catch(e) {
  console.error("StateWorld ERROR:", e);
}
