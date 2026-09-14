// ---------------------------------------------------------------------------
// debug.js — orientation debugging (F4) and the HUD compass.
//
// F4 shows the world axes and every system's idea of "forward": a readout of
// player / camera / vehicle headings plus arrows in the world, over the player:
//   blue   world north          green  player facing
//   yellow camera forward       red    vehicle forward
// If the red arrow doesn't point out of a car's nose, the car's definition in
// vehicles.js has the wrong modelForward.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { WORLD_DIRECTIONS, bearingDegrees, compassPoint, forwardFromHeading } from "./world.js";

const fmt = (h) => `${bearingDegrees(h).toFixed(0).padStart(3)}° ${compassPoint(bearingDegrees(h))}`;

export function createOrientationDebug({ scene }) {
  const panel = document.createElement("div");
  panel.id = "orientDebug";
  panel.hidden = true;
  panel.style.cssText = "position:fixed;left:16px;bottom:240px;z-index:30;pointer-events:none;" +   // above the minimap
    "font:12px/1.5 Consolas,monospace;color:#dfe9ff;background:rgba(0,0,0,.65);padding:8px 10px;border-radius:6px;white-space:pre";
  document.body.appendChild(panel);

  const group = new THREE.Group();
  group.visible = false;
  const arrow = (hex, len) => {
    const a = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), len, hex, 0.9, 0.5);
    a.traverse((o) => {
      if (o.material) { o.material.depthTest = false; o.material.userData.gtbRealized = true; o.renderOrder = 999; }
    });
    group.add(a);
    return a;
  };
  const north = arrow(0x3a7bff, 6), playerA = arrow(0x4dff6a, 4), cameraA = arrow(0xffe14d, 5), vehicleA = arrow(0xff3b3b, 6);
  scene.add(group);
  const v3 = new THREE.Vector3();

  return {
    get visible() { return !panel.hidden; },
    toggle() { panel.hidden = !panel.hidden; group.visible = !panel.hidden; },

    /** info: { pos, playerHeading, camera (camera.js controller), veh } */
    update({ pos, playerHeading, camera, veh }) {
      if (panel.hidden) return;
      const base = veh ? veh.obj.position : pos;
      group.position.set(base.x, (base.y || 0) + (veh ? 3.2 : 2.6), base.z);
      north.setDirection(v3.set(WORLD_DIRECTIONS.NORTH.x, 0, WORLD_DIRECTIONS.NORTH.z));
      playerA.setDirection(forwardFromHeading(playerHeading, v3));
      cameraA.setDirection(camera.forward(v3));
      vehicleA.visible = !!veh;
      if (veh) vehicleA.setDirection(forwardFromHeading(veh.heading, v3));
      const lines = [
        "WORLD   NORTH −Z   EAST +X   UP +Y",
        `PLAYER  pos ${pos.x.toFixed(1)}, ${pos.z.toFixed(1)}   heading ${fmt(playerHeading)}`,
        `CAMERA  heading ${fmt(camera.heading)}   yaw ${camera.yaw.toFixed(2)}   pitch ${camera.pitch.toFixed(2)}`,
      ];
      if (veh) {
        forwardFromHeading(veh.heading, v3);
        lines.push(`VEHICLE heading ${fmt(veh.heading)}   forward (${v3.x.toFixed(2)}, ${v3.z.toFixed(2)})   speed ${veh.speed.toFixed(1)} m/s` +
          (veh.def ? `   model ${veh.def.name} (nose ${veh.def.modelForward})` : ""));
      }
      panel.textContent = lines.join("\n");
    },
  };
}

/** A small always-on compass under the wanted stars: which way the camera faces. */
export function createCompass() {
  const el = document.createElement("div");
  el.id = "compass";
  el.style.cssText = "position:fixed;top:92px;right:16px;z-index:20;pointer-events:none;" +
    "font:700 13px/1 system-ui,sans-serif;letter-spacing:.08em;color:#f4f1ea;text-shadow:0 1px 3px #000;" +
    "background:rgba(0,0,0,.35);padding:5px 9px;border-radius:12px";
  document.body.appendChild(el);
  let last = "";
  return {
    update(cameraHeading) {
      const deg = bearingDegrees(cameraHeading);
      const txt = `▲ ${compassPoint(deg)} ${deg.toFixed(0)}°`;
      if (txt !== last) { el.textContent = txt; last = txt; }
    },
    set hidden(h) { el.hidden = h; },
  };
}
