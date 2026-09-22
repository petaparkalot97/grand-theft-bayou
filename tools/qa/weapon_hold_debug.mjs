// Scratch harness: prints the measured geometry that the hold poses have to
// satisfy, so they can be tuned against numbers instead of guesses.
import * as THREE from "three";
import "./lib/three_math.mjs";
import { installBrowserStub } from "./lib/browser_stub.mjs";
installBrowserStub();

const { makeHoodrat } = await import("../../src/characters.js");
const { initWeapons3D, updateWeapon3D, WEAPON_RIGS } = await import("../../src/weapons_3d.js");

const scene = new THREE.Scene();
initWeapons3D(scene);
const actor = makeHoodrat({ height: 1.8, seed: 777 });
scene.add(actor);
const playerPos = new THREE.Vector3();
const handW = (a) => a.hand.getWorldPosition(new THREE.Vector3());
const f = (v) => `(${v.x.toFixed(3)}, ${v.y.toFixed(3)}, ${v.z.toFixed(3)})`;

function tick(id, aim, firing, frames, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) {
    actor.update(dt);
    updateWeapon3D(actor, playerPos, new THREE.Vector3(0, 0, 1), id, dt, aim, false, firing);
  }
}

console.log("scale", actor.scale.x.toFixed(4));
console.log("shoulderL", f(actor.leftArm.pivot.getWorldPosition(new THREE.Vector3())),
            "shoulderR", f(actor.rightArm.pivot.getWorldPosition(new THREE.Vector3())));
console.log("reach  L", (actor.leftArm.upper + actor.leftArm.fore).toFixed(3) * 1,
            " world", ((actor.leftArm.upper + actor.leftArm.fore) * actor.scale.x).toFixed(3));
console.log("");

for (const id of ["pistol", "tec9", "sawnoff", "deerRifle", "bat"]) {
  tick(id, true, false, 40);
  const grip = actor.rightArm.hand.getObjectByName("weaponGrip");
  const rHand = handW(actor.rightArm);
  const lHand = handW(actor.leftArm);
  const shL = actor.leftArm.pivot.getWorldPosition(new THREE.Vector3());
  const def = WEAPON_RIGS[id];
  const line = `${id.padEnd(10)} Rhand=${f(rHand)}  Lhand=${f(lHand)}`;
  if (def.foregrip) {
    const want = new THREE.Vector3(...def.foregrip).applyMatrix4(grip.matrixWorld);
    console.log(line);
    console.log(`           foregrip=${f(want)}  |want-Lshoulder|=${want.distanceTo(shL).toFixed(3)}  err=${want.distanceTo(lHand).toFixed(3)}`);
  } else {
    console.log(line + "  (one-handed)");
  }
}

// what the model's own axes do, so rotationOffset can be reasoned about
console.log("\nmodel axis probes (world, sawnoff, aiming):");
tick("sawnoff", true, false, 40);
{
  const grip = actor.rightArm.hand.getObjectByName("weaponGrip");
  const m = grip.getObjectByName("weapon:sawnoff");
  m.updateWorldMatrix(true, false);
  const o = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
  for (const [name, local] of [["+z(barrel)", new THREE.Vector3(0, 0, 1)], ["+y", new THREE.Vector3(0, 1, 0)], ["+x", new THREE.Vector3(1, 0, 0)]]) {
    const p = local.clone().applyMatrix4(m.matrixWorld);
    console.log(`  ${name} -> ${f(p.clone().sub(o).normalize())}`);
  }
}

// bat: where does the barrel actually point in the shouldered pose?
console.log("\nbat barrel direction (shouldered / mid-swing):");
{
  tick("bat", false, false, 40);
  const { playFireAnim3D } = await import("../../src/weapons_3d.js");
  const grip = actor.rightArm.hand.getObjectByName("weaponGrip");
  const probe = (label) => {
    grip.updateWorldMatrix(true, false);
    const o = new THREE.Vector3().setFromMatrixPosition(grip.matrixWorld);
    const barrel = new THREE.Vector3(...WEAPON_RIGS.bat.muzzleOffset).applyMatrix4(grip.matrixWorld);
    console.log(`  ${label}: barrel dir ${f(barrel.sub(o).normalize())}  tip=${f(barrel.clone().add(o))}`);
  };
  probe("rest");
  playFireAnim3D("bat", true);
  for (const n of [6, 12, 18, 24]) { tick("bat", false, false, n === 6 ? 6 : 6); probe(`f${n}`); }
}
