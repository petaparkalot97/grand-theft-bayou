// ---------------------------------------------------------------------------
// mapEditor.js — hidden dev-mode landmark placement tool.
//
// Type $DEVMODE69xxx anywhere during free roam (a GTA-style typed cheat code,
// buffered from raw keydown, not tied to input.js's action bindings) to turn
// it on. While active:
//   , / .        cycle the selected asset type
//   mouse wheel  rotate the ghost preview
//   left click   place the real object (calls straight into landmarks.js —
//                what you see is the actual placement function running live)
//   Backspace    undo the last placement
//   F9           toggle off (retyping the code also works)
//
// The ghost follows a simple ray/plane intersection against y = 0 from the
// camera — this game's terrain is flat everywhere placements matter, so a
// full scene raycast (expensive, and this codebase has none yet) isn't
// needed. Placements are kept in their own THREE.Group (not batched — an
// editing session is short and small) and are:
//   - auto-saved to localStorage every change (survives a refresh)
//   - auto-saved to the Render server every change, if reachable, so a
//     session isn't lost to a different device/tab (best-effort: most
//     Render web services have ephemeral disk, so this is a *shared
//     scratchpad*, not guaranteed durable storage — see server/index.js)
//   - exportable as real code (the Export button) — pasting that into a
//     district file's build function is how a placement becomes permanent,
//     shared world content, the same way every other landmark in this game
//     is authored.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import {
  CITY_BUILDING_TYPES, placeCityBuilding, placeTruck,
  placeBillboard, placeGunShop, placeGasStation, placeSixTwelve,
  placeBayouStiltHut, placeMaritimeCargo, placeOilDerrick,
  placeStreetClutter, placeOfficeClutter,
} from "./landmarks.js";

const CHEAT_CODE = "$DEVMODE69xxx";
const LS_KEY = "gtb_mapEditor_placements_v1";

// One entry per placeable asset: { key, label, w, d, place(ctx, x, z, ry) }.
// `w`/`d` size the ghost box; `place` calls the exact real landmarks.js
// function this catalog entry represents, and `code(x, z, ry)` renders the
// matching source line for the Export panel.
const CATALOG = [
  ...Object.entries(CITY_BUILDING_TYPES).map(([key, spec]) => ({
    key: `building:${key}`, label: spec.label, w: spec.w, d: spec.d,
    place: (ctx, x, z, ry) => placeCityBuilding(ctx, key, x, z, ry),
    code: (x, z, ry) => `placeCityBuilding(ctx, "${key}", ${x}, ${z}, ${ry});`,
  })),
  // placeParkedCar() is currently disabled elsewhere in landmarks.js ("cars
  // are broken/non-interactable") — omitted here too rather than offer a
  // catalog entry that silently places nothing.
  ...["pickup", "truck", "van", "car_b", "car_r"].map((key) => ({
    key: `truck:${key}`, label: `Vehicle — ${key}`, w: 2.4, d: 5,
    place: (ctx, x, z, ry) => placeTruck(ctx, key, x, z, ry),
    code: (x, z, ry) => `placeTruck(ctx, "${key}", ${x}, ${z}, ${ry});`,
  })),
  { key: "gasStation", label: "Gas station", w: 18, d: 14,
    place: (ctx, x, z, ry) => placeGasStation(ctx, x, z, ry),
    code: (x, z, ry) => `placeGasStation(ctx, ${x}, ${z}, ${ry});` },
  { key: "sixTwelve", label: "6twelve store", w: 14, d: 12,
    place: (ctx, x, z, ry) => placeSixTwelve(ctx, x, z, ry),
    code: (x, z, ry) => `placeSixTwelve(ctx, ${x}, ${z}, ${ry});` },
  { key: "gunShop", label: "Gun shop (Bayou Arsenal)", w: 16, d: 14,
    place: (ctx, x, z, ry) => placeGunShop(ctx, x, z, ry),
    code: (x, z, ry) => `placeGunShop(ctx, ${x}, ${z}, ${ry});` },
  { key: "billboard", label: "Billboard", w: 10, d: 1,
    place: (ctx, x, z, ry) => placeBillboard(ctx, x, z, ry),
    code: (x, z, ry) => `placeBillboard(ctx, ${x}, ${z}, ${ry});` },
  { key: "stiltHut", label: "Bayou stilt hut", w: 6.4, d: 6.4,
    place: (ctx, x, z, ry) => placeBayouStiltHut(ctx, x, z, ry),
    code: (x, z, ry) => `placeBayouStiltHut(ctx, ${x}, ${z}, ${ry});` },
  { key: "cargo", label: "Maritime cargo stack", w: 8, d: 8,
    place: (ctx, x, z, ry) => placeMaritimeCargo(ctx, x, z, ry),
    code: (x, z, ry) => `placeMaritimeCargo(ctx, ${x}, ${z}, ${ry});` },
  { key: "derrick", label: "Oil derrick", w: 6, d: 6,
    place: (ctx, x, z, ry) => placeOilDerrick(ctx, x, z, ry),
    code: (x, z, ry) => `placeOilDerrick(ctx, ${x}, ${z}, ${ry});` },
  { key: "streetClutter", label: "Street clutter", w: 4, d: 4,
    place: (ctx, x, z, ry) => placeStreetClutter(ctx, x, z, ry),
    code: (x, z, ry) => `placeStreetClutter(ctx, ${x}, ${z}, ${ry});` },
  { key: "officeClutter", label: "Office clutter", w: 3, d: 3,
    place: (ctx, x, z, ry) => placeOfficeClutter(ctx, x, z, ry),
    code: (x, z, ry) => `placeOfficeClutter(ctx, ${x}, ${z}, ${ry});` },
];

function httpBaseFor(wsUrl) {
  if (!wsUrl) return null;
  return wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

export function createMapEditor(ctx) {
  const { scene, camera, addBlocker } = ctx;
  const placeCtx = { scene, addBlocker, addLitSpot: ctx.addLitSpot || (() => {}), props: [] };
  const httpBase = httpBaseFor(window.__MULTIPLAYER_URL || null);

  let active = false;
  let catalogIndex = 0;
  let ry = 0;
  const placements = [];   // { id, catalogKey, x, z, ry, group }
  let nextId = 1;

  const group = new THREE.Group();
  group.name = "mapEditorPlacements";
  scene.add(group);

  // ------------------------------------------------------------- the ghost
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x38ff9e, transparent: true, opacity: 0.35, depthWrite: false });
  ghostMat.userData.gtbRealized = true;
  const ghostEdgeMat = new THREE.LineBasicMaterial({ color: 0x38ff9e });
  const ghost = new THREE.Group();
  ghost.visible = false;
  scene.add(ghost);
  let ghostBox = null, ghostEdges = null;
  function rebuildGhost() {
    if (ghostBox) { ghost.remove(ghostBox); ghostBox.geometry.dispose(); }
    if (ghostEdges) { ghost.remove(ghostEdges); ghostEdges.geometry.dispose(); }
    const spec = CATALOG[catalogIndex];
    const geo = new THREE.BoxGeometry(spec.w, Math.max(spec.w, spec.d, 4), spec.d);
    geo.translate(0, geo.parameters.height / 2, 0);
    ghostBox = new THREE.Mesh(geo, ghostMat);
    ghostEdges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), ghostEdgeMat);
    ghost.add(ghostBox, ghostEdges);
  }
  rebuildGhost();

  // ------------------------------------------------------------------- HUD
  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;left:16px;top:16px;z-index:40;pointer-events:none;" +
    "font:12px/1.5 Consolas,monospace;color:#c9ffdf;background:rgba(0,20,10,.78);" +
    "padding:10px 12px;border:1px solid #38ff9e;border-radius:6px;white-space:pre;display:none;max-width:340px;";
  document.body.appendChild(panel);
  const controls = document.createElement("div");
  controls.style.cssText = "position:fixed;left:16px;top:170px;z-index:40;display:none;flex-direction:column;gap:6px;pointer-events:auto;";
  const select = document.createElement("select");
  select.style.cssText = "font:12px Consolas,monospace;padding:4px;";
  for (const [i, spec] of CATALOG.entries()) {
    const o = document.createElement("option"); o.value = i; o.textContent = spec.label; select.appendChild(o);
  }
  select.onchange = () => { catalogIndex = Number(select.value); rebuildGhost(); };
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:6px;";
  function makeBtn(label, fn) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "font:12px Consolas,monospace;padding:4px 8px;cursor:pointer;background:#0c3324;color:#c9ffdf;border:1px solid #38ff9e;border-radius:4px;";
    b.onclick = fn;
    btnRow.appendChild(b);
    return b;
  }
  makeBtn("Undo", () => undo());
  makeBtn("Export", () => showExport());
  makeBtn("Save", () => saveRemote());
  controls.appendChild(select);
  controls.appendChild(btnRow);
  document.body.appendChild(controls);

  const exportBox = document.createElement("textarea");
  exportBox.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:50;" +
    "width:600px;height:400px;font:12px/1.4 Consolas,monospace;background:#08140f;color:#c9ffdf;" +
    "border:1px solid #38ff9e;border-radius:6px;padding:10px;display:none;";
  exportBox.readOnly = true;
  exportBox.onclick = () => { exportBox.select(); };
  exportBox.addEventListener("keydown", (e) => { if (e.key === "Escape") exportBox.style.display = "none"; });
  document.body.appendChild(exportBox);

  function updateHUD() {
    if (!active) return;
    const spec = CATALOG[catalogIndex];
    panel.textContent =
      `DEV MODE — MAP EDITOR\n` +
      `asset: ${spec.label} (${catalogIndex + 1}/${CATALOG.length})\n` +
      `placed: ${placements.length}\n` +
      `, / . cycle · wheel rotate · click place\n` +
      `Backspace undo · F9 exit`;
  }

  // -------------------------------------------------------- cheat code buf
  let buf = "";
  function onKeydownGlobal(e) {
    buf = (buf + e.key).slice(-CHEAT_CODE.length);
    if (buf.toLowerCase() === CHEAT_CODE.toLowerCase()) { toggle(); buf = ""; }
    if (!active) return;
    if (e.code === "F9") { e.preventDefault(); toggle(); }
    else if (e.code === "Comma") { catalogIndex = (catalogIndex - 1 + CATALOG.length) % CATALOG.length; select.value = catalogIndex; rebuildGhost(); }
    else if (e.code === "Period") { catalogIndex = (catalogIndex + 1) % CATALOG.length; select.value = catalogIndex; rebuildGhost(); }
    else if (e.code === "Backspace") { e.preventDefault(); undo(); }
  }
  window.addEventListener("keydown", onKeydownGlobal);

  function onWheel(e) {
    if (!active) return;
    ry += e.deltaY > 0 ? 0.2 : -0.2;
  }
  window.addEventListener("wheel", onWheel, { passive: true });

  function onClick(e) {
    if (!active || e.button !== 0) return;
    if (exportBox.style.display !== "none") return;   // don't place while reading the export box
    place();
  }
  window.addEventListener("mousedown", onClick);

  // ------------------------------------------------------------- lifecycle
  function toggle() {
    active = !active;
    ghost.visible = active;
    panel.style.display = active ? "block" : "none";
    controls.style.display = active ? "flex" : "none";
    if (!active) exportBox.style.display = "none";
  }

  function place() {
    const spec = CATALOG[catalogIndex];
    const p = ghost.position;
    spec.place(placeCtx, p.x, p.z, ry);
    const id = nextId++;
    placements.push({ id, catalogKey: spec.key, x: p.x, z: p.z, ry });
    updateHUD();
    persist();
  }

  function undo() {
    const last = placements.pop();
    if (!last) return;
    // Placed objects build async (FBX/GLB) and add themselves straight to
    // `scene`/`placeCtx.props` rather than a per-entry handle, so "undo" here
    // removes it from the session record (and the export/save output) —
    // it stays visible in the live scene until the next reload. Good enough
    // for a session-scoped dev tool; note it in the HUD rather than fake a
    // scene-graph removal we can't do precisely.
    updateHUD();
    persist();
  }

  // ------------------------------------------------------------ persistence
  function serialize() { return placements.map(({ id, catalogKey, x, z, ry }) => ({ id, catalogKey, x, z, ry })); }
  function persist() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(serialize())); } catch {}
    saveRemote();
  }
  let saveTimer = null;
  function saveRemote() {
    if (!httpBase) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      fetch(`${httpBase}/editor/save`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placements: serialize() }),
      }).catch(() => {});   // best-effort — see the file header
    }, 500);
  }
  async function loadRemote() {
    if (!httpBase) return null;
    try {
      const res = await fetch(`${httpBase}/editor/load`);
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data.placements) ? data.placements : null;
    } catch { return null; }
  }

  function replayPlacement(entry) {
    const spec = CATALOG.find((s) => s.key === entry.catalogKey);
    if (!spec) return;
    spec.place(placeCtx, entry.x, entry.z, entry.ry);
    placements.push({ id: nextId++, catalogKey: entry.catalogKey, x: entry.x, z: entry.z, ry: entry.ry });
  }

  async function loadSaved() {
    // Prefer the server copy (shared across devices/tabs) if reachable, else
    // fall back to this browser's localStorage.
    let saved = await loadRemote();
    if (!saved) {
      try { saved = JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch { saved = null; }
    }
    if (!Array.isArray(saved)) return;
    for (const entry of saved) replayPlacement(entry);
    updateHUD();
  }

  function showExport() {
    const lines = placements.map((p) => {
      const spec = CATALOG.find((s) => s.key === p.catalogKey);
      return spec ? spec.code(Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10, Math.round(p.ry * 100) / 100) : "";
    }).filter(Boolean);
    exportBox.value = lines.length
      ? `// paste into the relevant district's build function, inside its ctx\n${lines.join("\n")}`
      : "// nothing placed yet";
    exportBox.style.display = "block";
    exportBox.focus();
    exportBox.select();
  }

  // ------------------------------------------------------------------ tick
  const _dir = new THREE.Vector3();
  const GROUND_Y = 0;
  const FALLBACK_DIST = 15;
  function update() {
    if (!active) return;
    camera.getWorldDirection(_dir);
    let x, z;
    if (_dir.y < -0.05) {
      const t = (GROUND_Y - camera.position.y) / _dir.y;
      x = camera.position.x + _dir.x * t;
      z = camera.position.z + _dir.z * t;
    } else {
      x = camera.position.x + _dir.x * FALLBACK_DIST;
      z = camera.position.z + _dir.z * FALLBACK_DIST;
    }
    ghost.position.set(x, GROUND_Y, z);
    ghost.rotation.y = ry;
    updateHUD();
  }

  loadSaved();

  return {
    update,
    get active() { return active; },
    get placements() { return placements.length; },
    get props() { return placeCtx.props; },
  };
}
