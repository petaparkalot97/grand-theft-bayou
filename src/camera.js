// ---------------------------------------------------------------------------
// camera.js — third-person camera + mouse look, classic PC-GTA style.
//
// Click the game to capture the mouse (Pointer Lock); plain mouse movement then
// orbits the camera, the wheel zooms, Esc releases. No held button needed —
// right-drag still works as a fallback while the mouse is free.
//
// Orientation follows world.js: yaw 0 looks NORTH, and the camera looks along
// heading yaw + π. forward() / right() give the flattened view vectors that
// on-foot movement is built from, so "W" always means "where the camera looks".
//
// The camera is positioned from a smoothed focus point plus an orbit offset,
// rather than lerping its position toward a goal: position lag was what made
// the old camera feel disconnected from the player at speed.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { wrapAngle as wrap, cameraYawToHeading, headingToCameraYaw, forwardFromHeading, rightFromHeading } from "./world.js";

/**
 * Every camera tuning value, in one place. Angles in radians; pitch is above
 * horizontal, looking down. Rates are per second.
 */
export const CAMERA_CONFIG = {
  cameraOrbitSensitivity: { x: 0.0024, y: 0.0019 },   // per pixel of mouse movement
  cameraPitchMin: -0.6,
  cameraPitchMax: 1.4,
  yawSmoothing: 22,
  pitchSmoothing: 18,
  collisionPullIn: 20,           // snap in front of a wall quickly…
  collisionEaseOut: 3,           // …and ease back out once it's gone
  onFoot: {
    cameraDistance: 15, cameraPitch: 0.72, minDistance: 6, maxDistance: 30,
    cameraHeight: 1.4, cameraFollowStrength: 15,
    // walking forward-ish with the mouse left alone swings the camera back behind you
    cameraRecenteringSpeed: 0.9, recenterAfter: 2.5, recenterCone: 1.75,
    aimDistance: 10, aimHeight: 1.25,
  },
  driving: {
    cameraDistance: 14, cameraPitch: 0.5, minDistance: 8, maxDistance: 34,
    cameraHeight: 1.6, cameraFollowStrength: 11, lookAhead: 4,
    cameraRecenteringSpeed: 2.6, recenterAfter: 1.4, recenterMinSpeed: 2,
  },
};

export function createCameraController({ camera, dom, canCapture }) {
  const C = CAMERA_CONFIG;
  let yaw = 0, targetYaw = 0;
  let pitch = C.onFoot.cameraPitch, targetPitch = C.onFoot.cameraPitch;
  let footDist = C.onFoot.cameraDistance, driveDist = C.driving.cameraDistance, dist = footDist;
  let wasDriving = false;
  let aiming = false;
  let lastMouse = -1e9;
  let locked = false;
  let dragging = false, lastX = 0, lastY = 0;
  const focus = new THREE.Vector3();
  const look = new THREE.Vector3();
  let primed = false;
  let occluders = [];            // overhead boxes { minX, maxX, minY, maxY, minZ, maxZ }

  /** Distance along a ray to where it enters box `b`, or null (also when starting inside). */
  function rayBox(px, py, pz, dx, dy, dz, b) {
    let tmin = 0, tmax = Infinity;
    const axis = (p, d, lo, hi) => {
      if (Math.abs(d) < 1e-6) return p >= lo && p <= hi;
      let t1 = (lo - p) / d, t2 = (hi - p) / d;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      return tmin <= tmax;
    };
    if (!axis(px, dx, b.minX, b.maxX) || !axis(py, dy, b.minY, b.maxY) || !axis(pz, dz, b.minZ, b.maxZ)) return null;
    return tmin > 0 ? tmin : null;
  }

  const onLock = () => { locked = document.pointerLockElement === dom; };
  document.addEventListener("pointerlockchange", onLock);

  // Mouse → camera orientation only. It never moves the player directly.
  function turn(dx, dy) {
    targetYaw -= dx * C.cameraOrbitSensitivity.x;
    targetPitch = THREE.MathUtils.clamp(targetPitch + dy * C.cameraOrbitSensitivity.y, C.cameraPitchMin, C.cameraPitchMax);
    lastMouse = performance.now() / 1000;
  }

  dom.addEventListener("mousedown", (e) => {
    if (!canCapture()) return;
    if (e.button === 0 && !locked && dom.requestPointerLock) {
      // the first click only captures; it must not also fire
      e.stopImmediatePropagation();
      const p = dom.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    }
    if (e.button === 2 && !locked && canCapture()) { dragging = true; lastX = e.clientX; lastY = e.clientY; }
  }, true);
  addEventListener("mouseup", (e) => { if (e.button === 2) dragging = false; });
  addEventListener("blur", () => { dragging = false; });
  addEventListener("mousemove", (e) => {
    if (locked) turn(e.movementX || 0, e.movementY || 0);
    else if (dragging) { turn(e.clientX - lastX, e.clientY - lastY); lastX = e.clientX; lastY = e.clientY; }
  });
  dom.addEventListener("wheel", (e) => {
    if (!canCapture()) return;
    e.preventDefault();
    const k = Math.exp(Math.sign(e.deltaY) * 0.1);
    if (wasDriving) driveDist = THREE.MathUtils.clamp(driveDist * k, C.driving.minDistance, C.driving.maxDistance);
    else footDist = THREE.MathUtils.clamp(footDist * k, C.onFoot.minDistance, C.onFoot.maxDistance);
  }, { passive: false });

  return {
    get locked() { return locked; },
    /** Orbit yaw (world.js: 0 = looking north). */
    get yaw() { return yaw; },
    get pitch() { return pitch; },
    /** The heading the camera is looking along. */
    get heading() { return cameraYawToHeading(yaw); },
    /** Horizontal view direction, into `out`. */
    forward(out) { return forwardFromHeading(cameraYawToHeading(yaw), out); },
    /** Horizontal screen-right direction, into `out`. */
    right(out) { return rightFromHeading(cameraYawToHeading(yaw), out); },
    addYaw(a) { targetYaw += a; lastMouse = performance.now() / 1000; },
    release() { if (locked) document.exitPointerLock(); },
    /** Overhead structures the camera must stay in front of. */
    setOccluders(list) { occluders = list || []; },
    setAiming(value) { aiming = !!value; },

    /**
     * @param {number} dt
     * @param {THREE.Vector3} target      player or vehicle position
     * @param {object|null} veh           the vehicle being driven ({heading, speed}) or null
     * @param {object|null} grid          BlockerGrid, to pull in past buildings
     * @param {number|null} moveHeading   heading the player is walking (null when standing)
     */
    update(dt, target, veh, grid, moveHeading = null) {
      const driving = !!veh;
      const M = driving ? C.driving : C.onFoot;
      const now = performance.now() / 1000;
      if (driving !== wasDriving) {
        // entering a car: swing in behind it; leaving: keep the current view
        if (driving) targetYaw = yaw + wrap(headingToCameraYaw(veh.heading) - yaw);
        targetPitch = M.cameraPitch;
        wasDriving = driving;
      }
      if (!primed) { focus.copy(target); primed = true; }

      // Recentring: drift back behind whatever you're steering, once the mouse is left alone.
      if (now - lastMouse > M.recenterAfter) {
        let want = null;
        if (driving) {
          if (Math.abs(veh.speed) > M.recenterMinSpeed) want = headingToCameraYaw(veh.heading);
        } else if (moveHeading != null && Math.abs(wrap(moveHeading - cameraYawToHeading(yaw))) < M.recenterCone) {
          // only while walking forward-ish: strafing or backing up doesn't spin the camera
          want = headingToCameraYaw(moveHeading);
        }
        if (want != null) targetYaw += wrap(want - targetYaw) * (1 - Math.exp(-M.cameraRecenteringSpeed * dt));
      }

      yaw += wrap(targetYaw - yaw) * (1 - Math.exp(-C.yawSmoothing * dt));
      targetYaw = yaw + wrap(targetYaw - yaw);   // keep both from winding up
      pitch += (targetPitch - pitch) * (1 - Math.exp(-C.pitchSmoothing * dt));
      const follow = 1 - Math.exp(-M.cameraFollowStrength * dt);
      focus.x += (target.x - focus.x) * follow;
      focus.z += (target.z - focus.z) * follow;
      focus.y = target.y;

      // collision: pull in when a building stands between the focus and the camera;
      // only matters for low angles — from above the strip, roofs sit under the lens
      let want = driving ? (aiming ? Math.min(driveDist, M.aimDistance || 10) : driveDist) : (aiming ? Math.min(footDist, M.aimDistance) : footDist);
      const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
      const ox = Math.sin(yaw), oz = Math.cos(yaw);       // from the focus out to the camera
      if (grid && want * sinP < 8) {
        const reach = want * cosP;
        grid.near(focus.x + ox * reach * 0.5, focus.z + oz * reach * 0.5, reach * 0.5 + 6, (b) => {
          if (b.r < 1.5) return false;                  // trees and posts: ignore
          const bx = b.x - focus.x, bz = b.z - focus.z;
          const along = bx * ox + bz * oz;
          if (along <= 0 || along > reach) return false;
          if (Math.abs(bx * oz - bz * ox) < b.r) {
            want = Math.min(want, Math.max(4, (along - b.r - 0.6) / cosP));
          }
          return false;
        });
      }
      // ...and in front of anything overhead between the focus and the camera
      // (standing under or beside the overpass used to put the lens above the deck)
      if (occluders.length) {
        for (const b of occluders) {
          const t = rayBox(focus.x, focus.y + M.cameraHeight, focus.z, ox * cosP, sinP, oz * cosP, b);
          if (t !== null && t < want) want = Math.max(3, t - 0.8);
        }
      }
      // snap in quickly, ease back out — never teleport
      dist += (want - dist) * (1 - Math.exp(-(want < dist ? C.collisionPullIn : C.collisionEaseOut) * dt));

      const camY = Math.max(focus.y + 1.2, focus.y + M.cameraHeight + sinP * dist);
      camera.position.set(
        focus.x + ox * cosP * dist,
        camY,
        focus.z + oz * cosP * dist,
      );
      look.set(focus.x, camY - sinP * dist, focus.z);
      if (driving) {
        // look a little ahead of the car, so the road you're heading into is framed
        look.x += Math.sin(veh.heading) * C.driving.lookAhead;
        look.z += Math.cos(veh.heading) * C.driving.lookAhead;
      }
      camera.lookAt(look);
    },
  };
}
