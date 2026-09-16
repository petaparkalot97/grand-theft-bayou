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

  // Everything below is sized from the shell it was handed, not from constants:
  // the same call has to look right on whatever car the game has loaded, and the
  // models are normalised nose-to-+z (vehicles.js), so +z is the front.
  //
  // The shell arrives wherever its source last stood (main.js hands over the same
  // pickup it parked as a wreck), and a clone keeps that transform. Measure it at
  // the origin, unrotated, or the livery is built around a point 15 m off the car —
  // which is exactly what happened: beacons and doors floated in the next lot.
  g.position.x = 0; g.position.z = 0;
  g.rotation.set(0, 0, 0);
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g).translate(new THREE.Vector3(0, -g.position.y, 0));
  const size = box.getSize(new THREE.Vector3());
  const mid = box.getCenter(new THREE.Vector3());
  const halfW = size.x / 2, halfD = size.z / 2;

  // Two-tone door panels: thin slabs flush against the flanks, at door height.
  const doorGeo = new THREE.BoxGeometry(0.06, size.y * 0.3, size.z * 0.42);
  const leftDoor = new THREE.Mesh(doorGeo, doorMat);
  leftDoor.position.set(mid.x + halfW - 0.03, box.min.y + size.y * 0.5, mid.z + size.z * 0.06);
  const rightDoor = leftDoor.clone();
  rightDoor.position.x = mid.x - halfW + 0.03;
  g.add(leftDoor, rightDoor);

  // Push bar across the nose, with two chrome uprights.
  const pushBar = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.82, size.y * 0.16, 0.1), barMat);
  pushBar.position.set(mid.x, box.min.y + size.y * 0.3, mid.z + halfD + 0.05);
  const barGuard1 = new THREE.Mesh(new THREE.BoxGeometry(0.09, size.y * 0.34, 0.09), chromeMat);
  barGuard1.position.set(mid.x + size.x * 0.22, box.min.y + size.y * 0.32, mid.z + halfD + 0.05);
  const barGuard2 = barGuard1.clone();
  barGuard2.position.x = mid.x - size.x * 0.22;
  g.add(pushBar, barGuard1, barGuard2);

  // Lightbar on the roof, over the cabin (forward of centre on a pickup).
  const barY = box.max.y + size.y * 0.05;
  const barZ = mid.z + size.z * 0.12;
  const lightBarHolder = new THREE.Mesh(new THREE.BoxGeometry(size.x * 0.78, size.y * 0.05, size.z * 0.1), barMat);
  lightBarHolder.position.set(mid.x, barY, barZ);
  const beaconGeo = new THREE.BoxGeometry(size.x * 0.34, size.y * 0.09, size.z * 0.09);
  const redBeacon = new THREE.Mesh(beaconGeo, redLightMat);
  redBeacon.position.set(mid.x + size.x * 0.2, barY + size.y * 0.06, barZ);
  const blueBeacon = new THREE.Mesh(beaconGeo, blueLightMat);
  blueBeacon.position.set(mid.x - size.x * 0.2, barY + size.y * 0.06, barZ);

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
      if (c.hp <= 0 && !c.dead) c.dead = true;
      if (c.dead || c.state === "dead") {
        if (c.dead !== "released") {
          if (loot && typeof loot.dropFor === "function") loot.dropFor(c);
          c.dead = "released";
          if (c.spr.parent) c.spr.parent.remove(c.spr);
        }
        footCops.splice(i, 1);            // dropped and gone: the list holds the living
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

  /**
   * Where a pursuing unit should drive: the player while they are in sight, the
   * place they were last seen once they are not. `null` before the first sighting.
   */
  function pursuitTarget() { return hasLastKnownPos ? lastKnownPos : null; }

  /** Seconds since the player was last in sight (0 while they are). */
  function timeSinceSeen() { return hasLastKnownPos ? sightLostTime : 0; }

  /** True once the give-up window has run out: the units are searching, not chasing. */
  function hasGivenUp() { return hasLastKnownPos && sightLostTime > GIVEUP_WINDOW; }

  /** Drop the chase outright (the player was busted, or the story took over). */
  function clearPursuit() { hasLastKnownPos = false; sightLostTime = 0; }

  return {
    GIVEUP_WINDOW,
    buildCruiserModel,
    spawnFootCop,
    updateSearchAndEvasion,
    updateFootCops,
    pursuitTarget,
    timeSinceSeen,
    hasGivenUp,
    clearPursuit,
    get footCops() { return footCops; },
    get cruisers() { return cruisers; },
  };
}
