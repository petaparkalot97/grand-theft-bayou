// Probe: is the two-bone IK landing the fist exactly on its target?
//
// Only the SUPPORT arm is solved onto an arbitrary target (the gun arm is solved
// onto its pose target), so that is what this sweeps.
import * as THREE from "three";
import "./lib/three_math.mjs";
import { installBrowserStub } from "./lib/browser_stub.mjs";
installBrowserStub();
const { makeHoodrat } = await import("../../src/characters.js");

const scene = new THREE.Scene();
const actor = makeHoodrat({ height: 1.8, seed: 12345 });
scene.add(actor);
actor.update(1 / 60);
actor.updateMatrixWorld(true);

const f = (v) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;
const arm = actor.leftArm;
const S = arm.pivot.position.clone();
const reach = arm.upper + arm.fore;
console.log("left shoulder (torso space)", f(S), " reach", reach.toFixed(3), " scale", actor.scale.x.toFixed(4));

let worst = 0, worstAt = null, n = 0, over = 0;
for (let i = 0; i < 200; i++) {
  const r = 0.06 + (i % 10) * 0.05;                        // 0.06 … 0.51, across the reach
  const az = (i / 200) * Math.PI * 2;
  const el = -0.7 + 1.2 * Math.sin(i * 1.7);
  const target = S.clone().add(new THREE.Vector3(
    Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el),
  ).multiplyScalar(r));
  actor.weaponHold = { kind: "long", aim: true, support: target.clone().applyMatrix4(actor.torso.matrixWorld) };
  actor.applyWeaponHold(0);
  actor.updateMatrixWorld(true);
  const got = actor.torso.worldToLocal(arm.hand.getWorldPosition(new THREE.Vector3()));
  const err = got.distanceTo(target);
  const clamped = Math.min(reach - 0.01, Math.max(0.02, r));
  const slack = Math.max(0, r - (reach - 0.01));           // unreachable by this much
  n++;
  if (err > worst) { worst = err; worstAt = { r: r.toFixed(2), az: az.toFixed(2), clamped: clamped.toFixed(3), slack: slack.toFixed(3) }; }
  if (err > 0.002) over++;
}
console.log(`targets ${n}  over 2mm: ${over}  worst ${worst.toFixed(5)}`, worstAt);

console.log("\nreachable band only (r <= 0.49):");
let w2 = 0, o2 = 0, c2 = 0;
for (let i = 0; i < 200; i++) {
  const r = 0.06 + (i % 10) * 0.05;
  if (r > 0.49) continue;
  const az = (i / 200) * Math.PI * 2;
  const el = -0.7 + 1.2 * Math.sin(i * 1.7);
  const target = S.clone().add(new THREE.Vector3(
    Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el),
  ).multiplyScalar(r));
  actor.weaponHold = { kind: "long", aim: true, support: target.clone().applyMatrix4(actor.torso.matrixWorld) };
  actor.applyWeaponHold(0);
  actor.updateMatrixWorld(true);
  const got = actor.torso.worldToLocal(arm.hand.getWorldPosition(new THREE.Vector3()));
  const err = got.distanceTo(target);
  c2++; if (err > w2) w2 = err; if (err > 0.002) o2++;
}
console.log(`targets ${c2}  over 2mm: ${o2}  worst ${w2.toFixed(5)}`);
