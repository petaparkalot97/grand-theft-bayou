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
const MAX_FOOT_COPS = 8;
const HELI_MIN_STARS = 3;

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
  const box = new THREE.Box3().setFromObject(g);
  // Box3.translate() is not available in the headless three.js stub used by
  // the QA harness; apply the tiny y correction explicitly.
  box.min.y -= g.position.y;
  box.max.y -= g.position.y;
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

  // High-contrast side markings make the unit read as law enforcement even
  // in the blue-hour fog: a red/blue stripe and an actual SHERIFF label.
  const stripeRed = new THREE.Mesh(new THREE.BoxGeometry(0.07, size.y * 0.09, size.z * 0.72), redLightMat);
  const stripeBlue = new THREE.Mesh(new THREE.BoxGeometry(0.075, size.y * 0.05, size.z * 0.72), blueLightMat);
  stripeRed.position.set(mid.x + halfW + 0.01, box.min.y + size.y * 0.39, mid.z);
  stripeBlue.position.set(mid.x - halfW - 0.01, box.min.y + size.y * 0.39, mid.z);
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 512; labelCanvas.height = 96;
  const labelCtx = labelCanvas.getContext("2d");
  labelCtx.fillStyle = "#f4f4f4"; labelCtx.fillRect(0, 0, 512, 96);
  labelCtx.fillStyle = "#18283a"; labelCtx.font = "900 58px Arial Black,Arial"; labelCtx.textAlign = "center"; labelCtx.textBaseline = "middle";
  labelCtx.fillText("SHERIFF", 256, 50);
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true });
  const labelA = new THREE.Mesh(new THREE.PlaneGeometry(size.z * 0.48, size.y * 0.12), labelMat);
  labelA.rotation.y = Math.PI / 2; labelA.position.set(mid.x + halfW + 0.04, box.min.y + size.y * 0.55, mid.z);
  const labelB = labelA.clone(); labelB.rotation.y = -Math.PI / 2; labelB.position.x = mid.x - halfW - 0.04;
  g.add(stripeRed, stripeBlue, labelA, labelB);

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

/** A compact procedural police helicopter: readable silhouette, search lamp,
 * spinning rotor and a clear red/blue tail beacon. */
export function buildPoliceHelicopter() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.05, 3.6), new THREE.MeshStandardMaterial({ color: 0x18283a, roughness: 0.42, metalness: 0.25 }));
  body.position.y = 0;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.72, 1.55), new THREE.MeshStandardMaterial({ color: 0x9bc6d8, transparent: true, opacity: 0.72, roughness: 0.12, metalness: 0.25 }));
  cabin.position.set(0, 0.32, 0.45);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 2.8), new THREE.MeshStandardMaterial({ color: 0x18283a, roughness: 0.42 }));
  tail.position.set(0, 0.15, -2.55);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.55), new THREE.MeshStandardMaterial({ color: 0x18283a }));
  fin.position.set(0, 0.62, -3.55);
  const rotor = new THREE.Group();
  rotor.add(new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.06, 0.16), new THREE.MeshStandardMaterial({ color: 0x121820, metalness: 0.7 })));
  rotor.add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 5.8), new THREE.MeshStandardMaterial({ color: 0x121820, metalness: 0.7 })));
  rotor.position.y = 0.78;
  const skidMat = new THREE.MeshStandardMaterial({ color: 0x707b84, metalness: 0.75, roughness: 0.3 });
  for (const x of [-0.78, 0.78]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 3.5), skidMat);
    skid.position.set(x, -0.72, 0);
    g.add(skid);
    for (const z of [-1.1, 1.1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.7, 0.07), skidMat);
      strut.position.set(x, -0.38, z); g.add(strut);
    }
  }
  const red = new THREE.MeshBasicMaterial({ color: 0xff1830 }); red.name = "heli red beacon";
  const blue = new THREE.MeshBasicMaterial({ color: 0x2f68ff }); blue.name = "heli blue beacon";
  const beacon = new THREE.Group();
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.22), red); r.position.x = 0.22;
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.22), blue); b.position.x = -0.22;
  beacon.add(r, b); beacon.position.set(0, 0.55, -1.2);
  g.add(body, cabin, tail, fin, rotor, beacon);
  g.userData.rotor = rotor; g.userData.beacon = { red: r, blue: b };
  return g;
}

export function createPoliceSystem({ scene, MAP, npcs, loot, hitPlayer, busted, shootPlayer,
  resolveCollision = null }) {
  // `resolveCollision(current, next, radius)` from main.js. Without it a foot
  // deputy integrated its position straight onto the world and walked through
  // walls, buildings and parked cars — it was the only mover in the game that
  // never consulted the blocker grid, because this module was never handed a
  // way to.
  const _step = new THREE.Vector3();   // reused: one allocation, not one per deputy per frame
  const FOOT_R = 0.5;                  // a deputy on foot, same order as the player's 0.6
  const cruisers = [];
  const footCops = [];
  const helicopters = [];
  const lastKnownPos = new THREE.Vector3();
  let sightLostTime = 0;
  let hasLastKnownPos = false;

  function spawnFootCop(x, z) {
    if (footCops.filter((c) => !c.dead).length >= MAX_FOOT_COPS) return null;
    const spr = makeDeputy({ police: true, seed: (Math.random() * 1e9) | 0, height: 1.82 });
    spr.position.set(x, 0, z);
    scene.add(spr);

    const rec = {
      type: "deputy",
      T: { label: "Deputy", speed: 4.3, aggro: 28, melee: 1.9, dmg: 6, atkGap: 1.1 },
      spr,
      hp: 7,
      atkCd: 0,
      shootCd: Math.random() * 0.8,
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
    const standDown = env.state && env.state.wanted === 0;

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
      
      if (standDown && dist > 50) {
        if (c.spr.parent) c.spr.parent.remove(c.spr);
        footCops.splice(i, 1);
        continue;
      }

      if (standDown) {
        c.spr.play("idle", { fps: 6, loop: true });
        continue;
      }

      const inv = dist > 1e-4 ? 1 / dist : 0;
      const dx = (targetPos.x - p.x) * inv, dz = (targetPos.z - p.z) * inv;

      c.t += dt;
      c.atkCd = Math.max(0, c.atkCd - dt);

      c.shootCd = Math.max(0, c.shootCd - dt);
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
        if (resolveCollision) {
          // NOTE the argument order: resolveCollision(current, next, radius)
          // writes the RESOLVED position into `current`, not into `next` —
          // main.js's own player call does the same (resolveCollision(playerPos,
          // next, 0.6) and then uses playerPos). Copying back out of `next`
          // here silently threw the collision result away and the deputies kept
          // walking through walls even with the grid wired up.
          _step.set(p.x + dx * c.T.speed * dt, 0, p.z + dz * c.T.speed * dt);
          resolveCollision(p, _step, FOOT_R);
        } else {
          p.x += dx * c.T.speed * dt;
          p.z += dz * c.T.speed * dt;
        }
        // Deputies shoot while closing the distance, making the threat readable
        // before they reach arrest range. They fire slowly and only when the
        // player is not hidden inside a vehicle.
        if (!env.driving && dist < 38 && dist > 5 && c.shootCd <= 0 && shootPlayer) {
          c.shootCd = 1.6 + Math.random() * 0.6;
          shootPlayer(p, 3, "deputy");
        }
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
  function clearPursuit() {
    hasLastKnownPos = false; sightLostTime = 0;
    for (const h of helicopters) scene.remove(h.obj);
    helicopters.length = 0;
  }

  function updateHelicopters(dt, env) {
    const active = env.state.wanted >= HELI_MIN_STARS;
    if (!active) {
      for (const h of helicopters) scene.remove(h.obj);
      helicopters.length = 0;
      return;
    }
    if (!helicopters.length) {
      const obj = buildPoliceHelicopter();
      obj.position.set(env.player.x + 24, 16, env.player.z + 24);
      scene.add(obj);
      helicopters.push({ obj, shootCd: 1.2 });
    }
    const target = env.player;
    for (const h of helicopters) {
      const o = h.obj;
      const dx = target.x - o.position.x, dz = target.z - o.position.z;
      const d = Math.hypot(dx, dz) || 1;
      const orbit = 5.5;
      o.position.x += (dx / d * 13 + (-dz / d) * orbit) * dt;
      o.position.z += (dz / d * 13 + (dx / d) * orbit) * dt;
      o.position.y += (15 + Math.sin(performance.now() * 0.002) * 1.2 - o.position.y) * Math.min(1, dt * 2);
      o.rotation.y = Math.atan2(dx, dz);
      o.userData.rotor.rotation.y += dt * 18;
      const on = Math.sin(performance.now() * 0.012) > 0;
      o.userData.beacon.red.visible = on;
      o.userData.beacon.blue.visible = !on;
      h.shootCd -= dt;
      const invisible = env.state.stance > 0 && env.state.stats && env.state.stats.mods.invisibleToHeli();
      if (h.shootCd <= 0 && shootPlayer && d < 58 && !invisible) {
        h.shootCd = 1.4 + Math.random() * 0.8;
        shootPlayer(o.position, 4.5, "helicopter");
      }
    }
  }

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
    get helicopters() { return helicopters; },
    updateHelicopters,
    get cruisers() { return cruisers; },
  };
}
