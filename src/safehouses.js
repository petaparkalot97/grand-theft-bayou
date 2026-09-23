import * as THREE from "three";
import { roundedBox } from "./geo.js";

/**
 * 3-5 hand-placed, visually distinct safe locations across the existing map
 * where zombies cannot spawn or enter.
 * 
 * @param {object} ctx Context from main.js: { scene, addBlocker, poolLight }
 */
export function createSafehouses(ctx) {
  const { scene, addBlocker, poolLight } = ctx;
  const safehouses = [];

  // Reusable materials
  const M = {
    wood: new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.6 }),
    light: new THREE.MeshBasicMaterial({ color: 0xfff0c0 })
  };

  function addSafehouse(x, z, r, name, buildFn) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    
    if (buildFn) buildFn(group);
    
    scene.add(group);
    safehouses.push({ x, z, r, name });
  }

  // 1. Bayou Noir General Store Barricades (West Parish)
  // The general store is roughly at x: -44, z: -270 based on westparish.js
  addSafehouse(-44, -270, 15, "Bayou Noir General Store", (g) => {
    // A boarded-up barricade
    const b1 = new THREE.Mesh(roundedBox(4, 1.2, 0.4, 0.05), M.wood);
    b1.position.set(0, 0.6, 6);
    b1.castShadow = true;
    b1.receiveShadow = true;
    
    const b2 = new THREE.Mesh(roundedBox(4, 1.2, 0.4, 0.05), M.wood);
    b2.position.set(6, 0.6, 0);
    b2.rotation.y = Math.PI / 2;
    b2.castShadow = true;
    b2.receiveShadow = true;
    
    g.add(b1, b2);
    addBlocker(-44, -264, 2);
    addBlocker(-38, -270, 2);
    
    // A surviving light left on
    poolLight(0xffcc88, 20, 20, -44, 4, -270);
  });

  // 2. Chatboro Strip Storefront (Near Start)
  // The player starts near x: 26, z: 124 on the strip
  addSafehouse(26, 124, 12, "Chatboro Safehouse", (g) => {
    // Metal barricade
    const bar = new THREE.Mesh(roundedBox(5, 1.8, 0.2, 0.02), M.steel);
    bar.position.set(0, 0.9, 0);
    bar.rotation.y = 0.2;
    bar.castShadow = true;
    g.add(bar);
    
    addBlocker(26, 124, 2.5);
    poolLight(0xffaa88, 15, 15, 26, 3, 124);
  });

  // 3. Port Mercer Fenced Service Yard (East Bank)
  // East Bank docks are around x: 190, z: -350
  addSafehouse(190, -350, 18, "Port Mercer Yard", (g) => {
    // Concrete dividers
    const d1 = new THREE.Mesh(roundedBox(3, 1.0, 0.6, 0.05), M.steel);
    d1.position.set(-2, 0.5, 5);
    d1.castShadow = true;
    
    const d2 = new THREE.Mesh(roundedBox(3, 1.0, 0.6, 0.05), M.steel);
    d2.position.set(2, 0.5, 4.5);
    d2.rotation.y = -0.3;
    d2.castShadow = true;
    
    g.add(d1, d2);
    addBlocker(188, -345, 1.5);
    addBlocker(192, -345.5, 1.5);
    
    poolLight(0xccee88, 25, 25, 190, 6, -350);
  });

  // 4. OrleaRouge Rooftop / Balcony
  // Near the civic blocks x: 92, z: 270
  addSafehouse(92, 270, 14, "OrleaRouge Refuge", (g) => {
    const box = new THREE.Mesh(roundedBox(1.5, 1.5, 1.5, 0.1), M.wood);
    box.position.set(2, 0.75, 2);
    box.castShadow = true;
    g.add(box);
    
    addBlocker(94, 272, 1);
    poolLight(0x88ccff, 20, 15, 92, 4, 270);
  });

  return {
    /** Returns true if (x, z) is inside any safehouse radius */
    insideSafehouse: (x, z) => {
      for (const sh of safehouses) {
        if (Math.hypot(x - sh.x, z - sh.z) < sh.r) return true;
      }
      return false;
    },
    
    /** Returns the closest safehouse object, or null */
    nearestSafehouse: (x, z) => {
      let best = null, minDist = Infinity;
      for (const sh of safehouses) {
        const d = Math.hypot(x - sh.x, z - sh.z);
        if (d < minDist) {
          minDist = d;
          best = sh;
        }
      }
      return best;
    }
  };
}
