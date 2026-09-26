// ---------------------------------------------------------------------------
// fpsview.js — the first-person view model: the gun in your hands (zombie mode).
//
// The third-person weapon is welded to the character's hand (weapons_3d.js), and in first
// person the character is hidden, so the gun would go with it. This holds a second copy of the
// weapon's model in front of the camera instead: lower right, barrel forward, drawn on top of
// the world. It kicks back and pitches up when you fire, dips for a reload, bobs as you walk,
// and a bat swings across the screen.
//
//   const view = createFpsView({ scene, camera });
//   view.update({ dt, active, weaponId, holstered, moving, sprinting })   // after the camera has moved
//   view.fire(melee)  /  view.reload(seconds)
//   view.muzzle(out)  -> the barrel's world position (tracers and flashes start here), or null
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { createViewmodel } from "./weapons_3d.js";

// where each weapon rests, in camera space (+x right, +y up, -z forward), and its resting pitch
const POSE = {
  pistol:    { p: [0.17, -0.17, -0.5], pitch: 0.02 },
  tec9:      { p: [0.18, -0.18, -0.54], pitch: 0.02 },
  sawnoff:   { p: [0.19, -0.2, -0.56], pitch: 0.02 },
  deerRifle: { p: [0.19, -0.21, -0.6], pitch: 0.02 },
  bat:       { p: [0.26, -0.22, -0.55], pitch: -0.55 },
};

export function createFpsView({ scene, camera }) {
  const holder = new THREE.Group();          // world-space, re-posed from the camera every frame
  holder.visible = false;
  holder.name = "fpsView";
  scene.add(holder);
  let id = null, vm = null, kick = 0, kickMax = 0.1, swing = 0, dip = 0, dipDur = 1, bob = 0;
  const q = new THREE.Quaternion(), turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const off = new THREE.Vector3(), pitchQ = new THREE.Quaternion(), rollQ = new THREE.Quaternion();
  const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);

  function select(weaponId) {
    if (id === weaponId && vm) return;
    if (vm) holder.remove(vm.model);
    id = weaponId;
    vm = createViewmodel(weaponId);
    holder.add(vm.model);
    kickMax = vm.def.recoil.kick * 2.2 + 0.03;
  }

  return {
    update({ dt, active, weaponId, holstered = false, moving = false, sprinting = false }) {
      if (!active || holstered) { holder.visible = false; return; }
      select(weaponId);
      holder.visible = true;
      kick = Math.max(0, kick - dt / Math.max(0.08, vm.def.recoil.time));
      swing = Math.max(0, swing - dt / 0.42);
      dip = Math.max(0, dip - dt);
      bob += dt * (moving ? (sprinting ? 12 : 8) : 2);
      const amp = moving ? (sprinting ? 0.016 : 0.010) : 0.002;
      const pose = POSE[weaponId] || POSE.pistol;
      const melee = vm.def.type === "melee";

      // camera-space offset: rest pose + walk bob + recoil (pushed back toward the eye)
      off.set(pose.p[0] + Math.sin(bob * 0.5) * amp, pose.p[1] + Math.abs(Math.sin(bob * 0.5)) * amp * 1.4, pose.p[2]);
      off.z += kick * kickMax;
      off.y -= kick * kickMax * 0.25;
      let pitch = pose.pitch + kick * vm.def.recoil.pitch * 0.5;
      let roll = 0;
      if (dip > 0) {                                   // reload: the gun drops out of frame and comes back
        const t = 1 - dip / dipDur, k = Math.sin(Math.min(1, t) * Math.PI);
        off.y -= 0.22 * k; pitch += 0.5 * k;
      }
      if (melee && swing > 0) {                        // the bat: cocked, then across and down
        const t = 1 - swing, wind = Math.min(1, t / 0.28), strike = t < 0.28 ? 0 : (t - 0.28) / 0.72;
        pitch = pose.pitch - 0.5 * Math.sin(wind * Math.PI) + 1.4 * Math.sin(strike * Math.PI);
        roll = -0.9 * Math.sin(strike * Math.PI);
        off.x -= 0.34 * Math.sin(strike * Math.PI);
      }
      if (sprinting && moving && !melee) { pitch += 0.12; off.y -= 0.03; }   // low-ready while running

      // into world space: camera orientation, barrel turned to -z, then the pitch and roll
      camera.updateMatrixWorld(true);
      holder.position.copy(off).applyMatrix4(camera.matrixWorld);
      q.copy(camera.quaternion).multiply(turn);
      pitchQ.setFromAxisAngle(X, -pitch);
      rollQ.setFromAxisAngle(Z, roll);
      holder.quaternion.copy(q).multiply(pitchQ).multiply(rollQ);
      holder.updateMatrixWorld(true);
    },
    fire(melee) { if (melee) swing = 1; else kick = 1; },
    reload(seconds) { dipDur = Math.max(0.3, seconds || 1); dip = dipDur; },
    /** The barrel's world position, or null when nothing is showing. */
    muzzle(out) {
      if (!holder.visible || !vm) return null;
      vm.muzzle.updateWorldMatrix(true, false);
      return out.setFromMatrixPosition(vm.muzzle.matrixWorld);
    },
    get visible() { return holder.visible; },
  };
}
