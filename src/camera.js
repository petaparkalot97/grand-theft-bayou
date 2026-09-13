// ---------------------------------------------------------------------------
// camera.js — third-person camera + mouse look, PC-GTA style.
//
// Click the game to capture the mouse (Pointer Lock); plain mouse movement then
// orbits the camera, the wheel zooms, Esc releases. No held button needed —
// right-drag still works as a fallback while the mouse is free.
//
// The camera is positioned from a smoothed focus point plus an orbit offset,
// rather than lerping its position toward a goal: position lag was what made
// the old camera feel disconnected from the player at speed.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const TAU = Math.PI * 2;
const wrap = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);

export function createCameraController({ camera, dom, canCapture }) {
  const cfg = {
    sensX: 0.0024, sensY: 0.0019,
    pitchMin: 0.1, pitchMax: 1.3,         // radians above horizontal, looking down
    foot: { dist: 15, pitch: 0.72, min: 6, max: 30 },
    drive: { dist: 14, pitch: 0.5, min: 8, max: 34 },
    recentreAfter: 1.4,                   // seconds of no mouse input while driving
  };

  let yaw = 0, targetYaw = 0;
  let pitch = cfg.foot.pitch, targetPitch = cfg.foot.pitch;
  let footDist = cfg.foot.dist, driveDist = cfg.drive.dist, dist = footDist;
  let wasDriving = false;
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

  function turn(dx, dy) {
    targetYaw -= dx * cfg.sensX;
    targetPitch = THREE.MathUtils.clamp(targetPitch + dy * cfg.sensY, cfg.pitchMin, cfg.pitchMax);
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
    if (e.button === 2 && !locked) { dragging = true; lastX = e.clientX; lastY = e.clientY; }
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
    if (wasDriving) driveDist = THREE.MathUtils.clamp(driveDist * k, cfg.drive.min, cfg.drive.max);
    else footDist = THREE.MathUtils.clamp(footDist * k, cfg.foot.min, cfg.foot.max);
  }, { passive: false });

  return {
    get locked() { return locked; },
    /** Camera yaw, for camera-relative walking. 0 = looking toward -z. */
    get yaw() { return yaw; },
    addYaw(a) { targetYaw += a; lastMouse = performance.now() / 1000; },
    release() { if (locked) document.exitPointerLock(); },
    /** Overhead structures the camera must stay in front of. */
    setOccluders(list) { occluders = list || []; },

    /**
     * @param {number} dt
     * @param {THREE.Vector3} target   player or vehicle position
     * @param {object|null} veh        the vehicle being driven ({heading, speed}) or null
     * @param {object|null} grid       BlockerGrid, to pull in past buildings
     */
    update(dt, target, veh, grid) {
      const driving = !!veh;
      if (driving !== wasDriving) {
        // entering a car: swing in behind it; leaving: keep the current view
        if (driving) targetYaw = yaw + wrap(veh.heading + Math.PI - yaw);
        targetPitch = driving ? cfg.drive.pitch : cfg.foot.pitch;
        wasDriving = driving;
      }
      if (!primed) { focus.copy(target); primed = true; }

      if (driving) {
        const now = performance.now() / 1000;
        if (now - lastMouse > cfg.recentreAfter && Math.abs(veh.speed) > 2) {
          // GTA-style: drift back behind the car once the mouse is left alone
          const behind = veh.heading + Math.PI;
          targetYaw += wrap(behind - targetYaw) * (1 - Math.exp(-2.6 * dt));
        }
      }

      yaw += wrap(targetYaw - yaw) * (1 - Math.exp(-22 * dt));
      targetYaw = yaw + wrap(targetYaw - yaw);   // keep both from winding up
      pitch += (targetPitch - pitch) * (1 - Math.exp(-18 * dt));
      focus.x += (target.x - focus.x) * (1 - Math.exp(-(driving ? 11 : 15) * dt));
      focus.z += (target.z - focus.z) * (1 - Math.exp(-(driving ? 11 : 15) * dt));
      focus.y = target.y;

      // pull in when a building stands between the focus and the camera; only
      // matters for low angles — from above the strip, roofs sit under the lens
      let want = driving ? driveDist : footDist;
      const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
      if (grid && want * sinP < 8) {
        const dx = Math.sin(yaw), dz = Math.cos(yaw);
        const reach = want * cosP;
        grid.near(focus.x + dx * reach * 0.5, focus.z + dz * reach * 0.5, reach * 0.5 + 6, (b) => {
          if (b.r < 1.5) return false;                  // trees and posts: ignore
          const bx = b.x - focus.x, bz = b.z - focus.z;
          const along = bx * dx + bz * dz;
          if (along <= 0 || along > reach) return false;
          if (Math.abs(bx * dz - bz * dx) < b.r) {
            want = Math.min(want, Math.max(4, (along - b.r - 0.6) / cosP));
          }
          return false;
        });
      }
      // ...and in front of anything overhead between the focus and the camera
      // (standing under or beside the overpass used to put the lens above the deck)
      if (occluders.length) {
        const lift0 = driving ? 1.6 : 1.4;
        const ox = Math.sin(yaw) * cosP, oz = Math.cos(yaw) * cosP;
        for (const b of occluders) {
          const t = rayBox(focus.x, focus.y + lift0, focus.z, ox, sinP, oz, b);
          if (t !== null && t < want) want = Math.max(3, t - 0.8);
        }
      }
      // snap in quickly, ease back out
      dist += (want - dist) * (1 - Math.exp(-(want < dist ? 20 : 3) * dt));

      const lift = driving ? 1.6 : 1.4;
      camera.position.set(
        focus.x + Math.sin(yaw) * cosP * dist,
        Math.max(focus.y + 1.2, focus.y + lift + sinP * dist),
        focus.z + Math.cos(yaw) * cosP * dist,
      );
      look.set(focus.x, focus.y + lift, focus.z);
      if (driving) {
        // look a little ahead of the car, so the road you're heading into is framed
        look.x += Math.sin(veh.heading) * 4;
        look.z += Math.cos(veh.heading) * 4;
      }
      camera.lookAt(look);
    },
  };
}
