// ---------------------------------------------------------------------------
// minimap.js — the GTA San Andreas-style radar, bottom-left.
//
// A base map is drawn once from the level's own data (roads, water, city
// blocks, buildings, fields) into an offscreen canvas. Each frame the radar
// draws that image rotated so the CAMERA's forward points up, as SA does, with
// an N on the rim marking north. The player arrow shows which way the player
// (or the car) actually faces relative to that. Blips: the story waypoint
// (pinned to the rim when off-radar), gas cans, the escape truck, cops and
// anyone hostile. The radar zooms out with speed.
//
// Orientation comes from world.js: north is −z. In the base image x is east,
// right, and y is world z, so north is up before any rotation.
// ---------------------------------------------------------------------------

import { bearingDegrees } from "./world.js";

const DEG = Math.PI / 180;
const S = 1.6;                           // base-map pixels per metre

const STYLE = {
  ground: "#24331f", outside: "#141c12",
  area: "#3a3a36", water: "#1f5468", building: "#77705f",
  road: "#a8a597", roadEdge: "#10150f", rim: "rgba(0,0,0,.85)",
};

export function createMinimap({ MAP, size = 190 }) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const wrap = document.createElement("div");
  wrap.id = "minimap";
  wrap.style.cssText = `position:fixed;left:16px;bottom:34px;width:${size}px;height:${size}px;border-radius:50%;` +
    "overflow:hidden;z-index:11;pointer-events:none;transition:opacity .4s;" +
    "box-shadow:0 0 0 3px rgba(0,0,0,.75),0 0 0 5px rgba(160,190,150,.35),0 4px 18px rgba(0,0,0,.6)";
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.round(size * dpr);
  canvas.style.cssText = `width:${size}px;height:${size}px`;
  wrap.appendChild(canvas);
  document.body.appendChild(wrap);
  const css = document.createElement("style");
  css.textContent = "body.letterbox #minimap { opacity: 0; }";   // hidden in cutscenes, like the HUD
  document.head.appendChild(css);

  const g = canvas.getContext("2d");
  let base = null;
  let zoom = 1.7;                        // screen pixels per metre
  let acc = 1;                           // time since the last redraw; the radar redraws at most 30 times a second
  const last = { built: false, zoom, rot: 0, north: [0, 0], arrow: 0, blips: 0, pinned: 0 };

  /**
   * layers: { roads: [{ points: [[x, z]…], width, color? }], areas / water /
   * buildings: [{ x0, x1, z0, z1, color? }] } in world metres.
   */
  function build(layers) {
    const W = Math.ceil((MAP.maxX - MAP.minX) * S), H = Math.ceil((MAP.maxZ - MAP.minZ) * S);
    base = document.createElement("canvas");
    base.width = W; base.height = H;
    const b = base.getContext("2d");
    const X = (x) => (x - MAP.minX) * S, Z = (z) => (z - MAP.minZ) * S;
    const rect = (r, fill) => { b.fillStyle = r.color || fill; b.fillRect(X(r.x0), Z(r.z0), (r.x1 - r.x0) * S, (r.z1 - r.z0) * S); };

    b.fillStyle = STYLE.ground; b.fillRect(0, 0, W, H);
    for (const r of layers.areas || []) rect(r, STYLE.area);
    for (const r of layers.water || []) rect(r, STYLE.water);
    for (const r of layers.buildings || []) rect(r, STYLE.building);

    // roads: every outline first, then every fill, so junctions read cleanly
    b.lineCap = "round"; b.lineJoin = "round";
    const roads = (layers.roads || []).filter((r) => r.points && r.points.length > 1);
    for (const pass of [0, 1]) {
      for (const r of roads) {
        b.strokeStyle = pass ? r.color || STYLE.road : STYLE.roadEdge;
        b.lineWidth = Math.max(2, r.width * S) + (pass ? 0 : 3);
        b.beginPath();
        r.points.forEach(([x, z], i) => (i ? b.lineTo(X(x), Z(z)) : b.moveTo(X(x), Z(z))));
        b.stroke();
      }
    }
    last.built = true;
  }

  function blip(kind, x, y, t) {
    g.lineWidth = 1.5;
    g.strokeStyle = "#000";
    if (kind === "waypoint") {
      g.fillStyle = "#ffd23a";
      g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y); g.lineTo(x, y + 6); g.lineTo(x - 6, y); g.closePath();
      g.fill(); g.stroke();
    } else if (kind === "truck") {
      g.fillStyle = "#6fe07a";
      g.fillRect(x - 4, y - 4, 8, 8); g.strokeRect(x - 4, y - 4, 8, 8);
    } else if (kind === "can") {
      g.fillStyle = "#ff6a3c";
      g.beginPath(); g.arc(x, y, 3.5, 0, Math.PI * 2); g.fill(); g.stroke();
    } else if (kind === "cop") {
      g.fillStyle = Math.sin(t * 12) > 0 ? "#3a6bff" : "#ff2a2a";
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); g.stroke();
    } else if (kind === "hostile") {
      g.fillStyle = "#e23a2e";
      g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    }
  }

  return {
    build,
    /** The base map image (a canvas), e.g. for Nolantis's archive projection. */
    get baseCanvas() { return base; },
    /** For QA: what the last frame drew. */
    get state() { return { ...last, north: [...last.north] }; },
    set visible(v) { wrap.hidden = !v; },

    /**
     * @param {object} o
     * @param {{x, z}} o.player            the player's (or their car's) position
     * @param {number} o.playerHeading     world.js heading the player / car faces
     * @param {number} o.cameraHeading     world.js heading the camera looks along
     * @param {number} o.speed             m/s; the radar zooms out with it
     * @param {Array}  o.blips             [{ kind: waypoint|truck|can|cop|hostile, x, z }]
     */
    update({ player, playerHeading, cameraHeading, speed = 0, blips = [], dt = 1 / 60 }) {
      if (!base) return;
      acc += dt;
      if (acc < 1 / 30) return;
      dt = acc;
      acc = 0;
      const R = size / 2;
      const want = Math.max(0.8, 1.7 - Math.max(0, speed - 4) * 0.04);
      zoom += (want - zoom) * Math.min(1, dt * 2.5);
      const rot = -bearingDegrees(cameraHeading) * DEG;          // camera forward → up
      const cos = Math.cos(rot), sin = Math.sin(rot);
      const t = performance.now() / 1000;

      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, size, size);
      g.save();
      g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip();
      g.fillStyle = STYLE.outside; g.fillRect(0, 0, size, size);

      // the map, turned and centred on the player. Only the patch of the base
      // image that can land inside the circle (at any rotation) is drawn, not the whole map.
      const px = (player.x - MAP.minX) * S, py = (player.z - MAP.minZ) * S;
      const half = Math.ceil(((R * Math.SQRT2) / zoom) * S) + 2;
      const sx = Math.max(0, Math.floor(px - half)), sy = Math.max(0, Math.floor(py - half));
      const ex = Math.min(base.width, Math.ceil(px + half)), ey = Math.min(base.height, Math.ceil(py + half));
      g.save();
      g.translate(R, R);
      g.rotate(rot);
      g.scale(zoom / S, zoom / S);
      if (ex > sx && ey > sy) g.drawImage(base, sx, sy, ex - sx, ey - sy, sx - px, sy - py, ex - sx, ey - sy);
      g.restore();

      // blips: world offset → rotated screen position; waypoints pin to the rim
      let pinned = 0;
      for (const b of blips) {
        const dx = (b.x - player.x) * zoom, dz = (b.z - player.z) * zoom;
        let sx = dx * cos - dz * sin, sy = dx * sin + dz * cos;
        const d = Math.hypot(sx, sy), edge = R - 9;
        if (d > edge) {
          if (b.kind !== "waypoint" && b.kind !== "truck") continue;
          sx *= edge / d; sy *= edge / d;
          pinned++;
        }
        blip(b.kind, R + sx, R + sy, t);
      }

      // the player arrow: which way they face, relative to the camera
      const arrow = (bearingDegrees(playerHeading) - bearingDegrees(cameraHeading)) * DEG;
      g.save();
      g.translate(R, R);
      g.rotate(arrow);
      g.fillStyle = "#f4f1ea"; g.strokeStyle = "#000"; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath();
      g.fill(); g.stroke();
      g.restore();
      g.restore();   // clip

      // north on the rim
      const nx = R + Math.sin(rot) * (R - 11), ny = R - Math.cos(rot) * (R - 11);
      g.fillStyle = STYLE.rim;
      g.beginPath(); g.arc(nx, ny, 8, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#f4f1ea"; g.font = "bold 11px Arial, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText("N", nx, ny + 0.5);

      last.zoom = zoom; last.rot = rot; last.north = [Math.round(nx), Math.round(ny)];
      last.arrow = arrow; last.blips = blips.length; last.pinned = pinned;
    },
  };
}
