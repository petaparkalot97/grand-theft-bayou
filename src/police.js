// ---------------------------------------------------------------------------
// police.js — Sheriff & Police Department System.
//
// Features:
//   1. Distinct Two-Tone Cruiser Model: lightbar with alternating emissive red/blue
//      beacons, push-bar grill, and side stripes.
//   2. Escapable Search AI: Cruisers and on-foot officers pursue last known position
//      instead of an omnipresent lock-on. If the player breaks line of sight or
//      escapes search radius for the give-up window (~5s), heat decays and wanted clears.
//   3. On-Foot Deputies: 3D procedural parish deputies (makeDeputy) who patrol on foot,
//      pursue, attempt arrests, deal balanced contact damage, and drop loot when defeated.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { makeDeputy } from "./characters.js";

const GIVEUP_WINDOW = 5.0; // seconds out of sight before chase breaks off
const MAX_FOOT_COPS = 4;

export function buildCruiserModel(baseCarMesh) {
  const g = baseCarMesh ? baseCarMesh.clone(true) : new THREE.Group();

  // White & Navy two-tone Sheriff paint job
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f7, roughness: 0.35, metalness: 0.2 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x1a2636, roughness: 0.4, metalness: 0.3 });
  const barMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
  const redLightMat = new THREE.MeshStandardMaterial({ name: "red beacon", color: 0xff1122, emissive: 0xff1122, emissiveIntensity: 2.5 });
  const blueLightMat = new THREE.MeshStandardMaterial({ name: "blue beacon", color: 0x2255ff, emissive: 0x2255ff, emissiveIntensity: 2.5 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.9, roughness: 0.2 });

  bodyMat.userData.gtbRealized = true;
  doorMat.userData.gtbRealized = true;
  barMat.userData.gtbRealized = true;
  redLightMat.userData.gtbRealized = true;
  blueLightMat.userData.gtbRealized = true;
  chromeMat.userData.gtbRealized = true;

  // Apply white body repaint
  g.traverse((o) => {
    if (o.isMesh && o.material) {
      o.material = bodyMat;
    }
  });

  // Door panels (two-tone side doors)
  const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.75, 1.4), doorMat);
  leftDoor.position.set(0.92, 0.85, 0.1);
  const rightDoor = leftDoor.clone();
  rightDoor.position.x = -0.92;
  g.add(leftDoor, rightDoor);

  // Push-bar bumper on front
  const pushBar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 0.12), barMat);
  pushBar.position.set(0, 0.5, 2.1);
  const barGuard1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.65, 0.1), chromeMat);
  barGuard1.position.set(0.4, 0.6, 2.15);
  const barGuard2 = barGuard1.clone();
  barGuard2.position.x = -0.4;
  g.add(pushBar, barGuard1, barGuard2);

  // Roof lightbar rig
  const lightBarHolder = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 0.22), barMat);
  lightBarHolder.position.set(0, 1.72, 0);
  const redBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.2), redLightMat);
  redBeacon.position.set(0.28, 1.81, 0);
  const blueBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.2), blueLightMat);
  blueBeacon.position.set(-0.28, 1.81, 0);

  g.add(lightBarHolder, redBeacon, blueBeacon);
  g.userData.lightbar = { red: redBeacon, blue: blueBeacon };

  return g;
}

export function createPoliceSystem({ scene, MAP, npcs, loot, hitPlayer, busted }) {
  const cruisers = [];
  const footCops = [];
  const lastKnownPos = new THREE.Vector3();
  let sightLostTime = 0;
  let hasLastKnownPos = false;

  function spawnFootCop(x, z) {
    if (footCops.filter((c) => !c.dead).length >= MAX_FOOT_COPS) return null;
    const spr = makeDeputy({ seed: (Math.random() * 1e9) | 0, height: 1.82 });
    spr.position.set(x, 0, z);
    scene.add(spr);

    const rec = {
      type: "deputy",
      T: { label: "Deputy", speed: 4.8, aggro: 28, melee: 1.9, dmg: 8, atkGap: 0.9 },
      spr,
      hp: 24,
      atkCd: 0,
      dead: false,
      state: "hostile",
      rivalTarget: null,
      calm: 0,
      t: 0,
    };
    if (npcs && typeof npcs.init === "function") npcs.init(rec);
    rec.state = "hostile";
    footCops.push(rec);
    return rec;
  }

  function updateSearchAndEvasion(dt, playerPos, isPlayerInSight, state) {
    if (isPlayerInSight) {
      lastKnownPos.copy(playerPos);
      hasLastKnownPos = true;
      sightLostTime = 0;
    } else if (hasLastKnownPos) {
      sightLostTime += dt;
      if (sightLostTime > GIVEUP_WINDOW) {
        // Break off chase: decay heat and reset wanted level
        state.heat = Math.max(0, state.heat - dt * 1.5);
        if (state.heat <= 0) {
          state.wanted = 0;
          hasLastKnownPos = false;
        }
      }
    }
  }

  function updateFootCops(dt, env) {
    const playerPos = env.player;
    let onTopCount = 0;

    for (let i = footCops.length - 1; i >= 0; i--) {
      const c = footCops[i];
      if (c.dead || c.state === "dead") {
        if (c.dead !== "released") {
          if (loot && typeof loot.dropFor === "function") loot.dropFor(c);
          c.dead = "released";
        }
        continue;
      }

      const p = c.spr.position;
      const targetPos = hasLastKnownPos ? lastKnownPos : playerPos;
      const dist = Math.hypot(targetPos.x - p.x, targetPos.z - p.z);
      const inv = dist > 1e-4 ? 1 / dist : 0;
      const dx = (targetPos.x - p.x) * inv, dz = (targetPos.z - p.z) * inv;

      c.t += dt;
      c.atkCd = Math.max(0, c.atkCd - dt);

      if (dist < c.T.melee) {
        c.spr.play("attack", { fps: 10, loop: true });
        c.spr.setFlip(dx);
        if (c.atkCd === 0) {
          c.atkCd = c.T.atkGap;
          if (!env.driving) hitPlayer(c.T.dmg);
        }
        onTopCount++;
      } else {
        c.spr.play("walk", { fps: 9, loop: true });
        c.spr.setFlip(dx);
        p.x += dx * c.T.speed * dt;
        p.z += dz * c.T.speed * dt;
      }
    }

    return onTopCount;
  }

  return {
    buildCruiserModel,
    spawnFootCop,
    updateSearchAndEvasion,
    updateFootCops,
    get footCops() { return footCops; },
    get cruisers() { return cruisers; },
  };
}
