// ---------------------------------------------------------------------------
// mapEditor.js — hidden dev-mode landmark placement tool.
//
// Type $DEVMODE69xxx anywhere during free roam (a GTA-style typed cheat code,
// buffered from raw keydown, not tied to input.js's action bindings) to turn
// it on. While active, WASD and the mouse drive a free-fly "city builder"
// camera instead of the player (who just stands still, unattended):
//   WASD          pan the camera across the map, at any distance
//   mouse wheel   zoom, from street level out to a near-satellite overview
//   right-drag    orbit the camera
//   , / .         cycle the selected asset (or click a tile in the picker)
//   Q / E         rotate the ghost preview
//   left click    place the real object (calls straight into landmarks.js —
//                 what you see is the actual placement function running live)
//   Backspace     undo the last placement (really removes it: mesh, its
//                 collision blocker and any light it added)
//   F9            toggle off (retyping the code also works)
//
// The ghost is the real object, loaded and built the same way it will be
// placed, just translucent — not a solid green stand-in box — with a thin
// wire outline for its footprint. The asset picker mirrors this: each tile's
// thumbnail is a real render of that object, snapshotted once (off-screen,
// via a render target — never flashed to the visible canvas) and cached.
//
// The ghost's ground target follows a simple ray/plane intersection against
// y = 0 from the camera — this game's terrain is flat everywhere placements
// matter, so a full scene raycast (expensive, and this codebase has none yet)
// isn't needed. Placements are kept in their own THREE.Group (not batched —
// an editing session is short and small) and are:
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
import { cameraYawToHeading, forwardFromHeading, rightFromHeading } from "./world.js";
import {
  CITY_BUILDING_TYPES, placeCityBuilding, placeBillboard, placeGunShop, placeGasStation, placeSixTwelve,
  placeBayouStiltHut, placeMaritimeCargo, placeOilDerrick,
  placeStreetClutter, placeOfficeClutter,
} from "./landmarks.js";

const CHEAT_CODE = "$DEVMODE69xxx";
const LS_KEY = "gtb_mapEditor_placements_v1";

// One entry per placeable asset: { key, label, w, d, place(ctx, x, z, ry) }.
// `w`/`d` size the ghost's footprint outline; `place` calls the exact real
// landmarks.js function this catalog entry represents, and `code(x, z, ry)`
// renders the matching source line for the Export panel.
const CATALOG = [
  ...Object.entries(CITY_BUILDING_TYPES).map(([key, spec]) => ({
    key: `building:${key}`, label: spec.label, w: spec.w, d: spec.d,
    place: (ctx, x, z, ry) => placeCityBuilding(ctx, key, x, z, ry),
    code: (x, z, ry) => `placeCityBuilding(ctx, "${key}", ${x}, ${z}, ${ry});`,
  })),
  // placeParkedCar() / placeTruck() are currently disabled elsewhere in
  // landmarks.js ("cars/trucks are broken/non-interactable" — both are no-op
  // stubs) — omitted here rather than offer a catalog entry that silently
  // places nothing when clicked.
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
  const {
    scene, camera, renderer, input, loadGLB,
    addBlocker, removeBlocker,
    addLitSpot: realAddLitSpot, removeLitSpot,
  } = ctx;
  const httpBase = httpBaseFor(window.__MULTIPLAYER_URL || null);

  let active = false;
  let catalogIndex = 0;
  let ry = 0;
  const placements = [];   // { id, catalogKey, x, z, ry, created, createdBlockers, createdLitSpots }
  let nextId = 1;

  // Placements a click actually creates go straight into `scene` — same as
  // every other landmark in the game. Tracked here only so Undo can find and
  // remove exactly what one click added (mesh, blocker, light).
  let trackedBlockers = null, trackedLitSpots = null;
  const placeCtx = {
    scene, loadGLB, props: [],
    addBlocker: (x, z, r) => {
      const b = addBlocker(x, z, r);
      if (trackedBlockers) trackedBlockers.push(b);
      return b;
    },
    addLitSpot: (spot) => {
      realAddLitSpot(spot);
      if (trackedLitSpots) trackedLitSpots.push(spot);
      return spot;
    },
  };

  const group = new THREE.Group();
  group.name = "mapEditorPlacements";
  scene.add(group);

  // -------------------------------------------------- shared preview models
  // Built once per catalog entry (loaded exactly the way a real placement
  // loads) and reused for both the aiming ghost and the asset-picker
  // thumbnails. Cloned FBX/GLB hierarchies share geometry/material
  // *references* with the game's own loader caches, so none of this is ever
  // disposed — only detached from whatever parent it's briefly under.
  const cleanCache = new Map();   // key -> Group, opaque ("as it will really look")
  const ghostCache = new Map();   // key -> Group, translucent clone for aiming
  const previewCtx = { scene: null, addBlocker: () => {}, addLitSpot: () => {}, props: [], loadGLB };

  function hasContent(root) {
    return !new THREE.Box3().setFromObject(root).isEmpty();
  }
  function waitForContent(root, timeoutMs = 8000) {
    if (hasContent(root)) return Promise.resolve(root);
    return new Promise((resolve) => {
      const t0 = performance.now();
      (function poll() {
        if (hasContent(root) || performance.now() - t0 > timeoutMs) { resolve(root); return; }
        requestAnimationFrame(poll);
      })();
    });
  }
  function buildCleanPreview(spec) {
    let root = cleanCache.get(spec.key);
    if (root) return root;
    root = new THREE.Group();
    cleanCache.set(spec.key, root);
    previewCtx.scene = root;
    spec.place(previewCtx, 0, 0, 0);
    return root;
  }
  function ghostifyMaterial(mat) {
    const gm = mat.clone();
    gm.transparent = true;
    gm.opacity = 0.5;
    gm.depthWrite = false;
    if (gm.emissive) { gm.emissive.setHex(0x1fae6e); gm.emissiveIntensity = 0.5; }
    gm.userData.gtbRealized = true;
    gm.userData.gtbGhost = true;
    return gm;
  }
  function buildGhostPreview(spec) {
    let root = ghostCache.get(spec.key);
    if (root) return root;
    root = new THREE.Group();
    ghostCache.set(spec.key, root);
    const clean = buildCleanPreview(spec);
    waitForContent(clean).then(() => {
      while (root.children.length) root.remove(root.children[0]);
      if (!hasContent(clean)) return;   // load failed — leave the ghost empty
      const dup = clean.clone(true);    // shares geometry/materials with `clean`
      dup.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = false; o.receiveShadow = false;
        o.material = Array.isArray(o.material) ? o.material.map(ghostifyMaterial) : ghostifyMaterial(o.material);
      });
      root.add(dup);
    });
    return root;
  }

  // ------------------------------------------------------------- the ghost
  const ghostEdgeMat = new THREE.LineBasicMaterial({ color: 0x38ff9e });
  const ghost = new THREE.Group();
  ghost.visible = false;
  scene.add(ghost);
  let ghostEdges = null;
  let ghostModel = null;
  function rebuildGhost() {
    const spec = CATALOG[catalogIndex];
    if (ghostEdges) { ghost.remove(ghostEdges); ghostEdges.geometry.dispose(); }
    const geo = new THREE.BoxGeometry(spec.w, Math.max(spec.w, spec.d, 4), spec.d);
    geo.translate(0, geo.parameters.height / 2, 0);
    ghostEdges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), ghostEdgeMat);
    geo.dispose();
    ghost.add(ghostEdges);

    if (ghostModel) ghost.remove(ghostModel);
    ghostModel = buildGhostPreview(spec);
    ghost.add(ghostModel);
  }
  // Not built here: rebuildGhost() calls spec.place(), which for a GLB/FBX
  // entry kicks off a real network load. Deferred to the first toggle-on so
  // importing/constructing this module (done unconditionally at game boot)
  // stays free, as the file header promises.

  // -------------------------------------------------------- asset thumbnails
  // Rendered off-screen into a WebGLRenderTarget (never blitted to the
  // visible canvas — no flash) using the same real preview model as the
  // ghost, auto-framed from its bounding sphere so a 3 m clutter prop and a
  // 28 m hospital both fill the tile.
  let thumbTarget = null, thumbScene = null, thumbCam = null, thumbKey = null;
  const THUMB_SIZE = 84;
  function ensureThumbRig() {
    if (thumbTarget) return;
    thumbTarget = new THREE.WebGLRenderTarget(THUMB_SIZE, THUMB_SIZE, { depthBuffer: true });
    thumbScene = new THREE.Scene();
    thumbScene.background = new THREE.Color(0x07150e);
    thumbScene.add(new THREE.HemisphereLight(0xbfe4ff, 0x16241a, 1.7));
    thumbKey = new THREE.DirectionalLight(0xfff2df, 2.1);
    thumbScene.add(thumbKey);
    thumbCam = new THREE.PerspectiveCamera(32, 1, 0.05, 4000);
  }
  function snapshotThumbnail(spec) {
    const root = buildCleanPreview(spec);
    return waitForContent(root).then(() => {
      if (!hasContent(root)) return null;
      ensureThumbRig();
      const prevParent = root.parent;
      thumbScene.add(root);

      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const radius = Math.max(0.6, size.length() / 2);
      const dist = (radius / Math.sin(THREE.MathUtils.degToRad(32) / 2)) * 1.08;
      thumbKey.position.set(center.x + dist * 0.4, center.y + dist * 0.9, center.z + dist * 0.6);
      thumbCam.position.set(center.x + dist * 0.62, center.y + dist * 0.5, center.z + dist * 0.82);
      thumbCam.near = Math.max(0.05, dist / 200);
      thumbCam.far = dist * 6 + radius * 6;
      thumbCam.lookAt(center);
      thumbCam.updateProjectionMatrix();

      renderer.setRenderTarget(thumbTarget);
      renderer.render(thumbScene, thumbCam);
      renderer.setRenderTarget(null);

      const buf = new Uint8Array(THUMB_SIZE * THUMB_SIZE * 4);
      renderer.readRenderTargetPixels(thumbTarget, 0, 0, THUMB_SIZE, THUMB_SIZE, buf);
      const canvas = document.createElement("canvas");
      canvas.width = THUMB_SIZE; canvas.height = THUMB_SIZE;
      const cx = canvas.getContext("2d");
      const img = cx.createImageData(THUMB_SIZE, THUMB_SIZE);
      // WebGL reads bottom-up; canvas ImageData is top-down.
      for (let y = 0; y < THUMB_SIZE; y++) {
        const srcRow = THUMB_SIZE - 1 - y;
        img.data.set(buf.subarray(srcRow * THUMB_SIZE * 4, (srcRow + 1) * THUMB_SIZE * 4), y * THUMB_SIZE * 4);
      }
      cx.putImageData(img, 0, 0);

      thumbScene.remove(root);
      if (prevParent) prevParent.add(root);   // defensive: `root` isn't normally parented anywhere else
      return canvas.toDataURL("image/png");
    });
  }

  // ------------------------------------------------------------------- HUD
  const panel = document.createElement("div");
  panel.style.cssText = "position:fixed;left:16px;top:16px;z-index:40;pointer-events:none;" +
    "font:12px/1.5 Consolas,monospace;color:#c9ffdf;background:rgba(0,20,10,.78);" +
    "padding:10px 12px;border:1px solid #38ff9e;border-radius:6px;white-space:pre;display:none;max-width:340px;";
  document.body.appendChild(panel);
  const controls = document.createElement("div");
  controls.style.cssText = "position:fixed;left:16px;top:150px;z-index:40;display:none;flex-direction:column;gap:6px;pointer-events:auto;";
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
  controls.appendChild(btnRow);
  document.body.appendChild(controls);

  // --------------------------------------------------------- asset picker
  // A visual library of every placeable asset (real thumbnails, not a text
  // dropdown) — click a tile to select it, same as `,` / `.`.
  const picker = document.createElement("div");
  picker.style.cssText = "position:fixed;left:16px;top:192px;z-index:40;display:none;" +
    "grid-template-columns:repeat(4, 66px);gap:6px;max-height:62vh;overflow-y:auto;" +
    "background:rgba(0,20,10,.78);border:1px solid #38ff9e;border-radius:6px;padding:8px;pointer-events:auto;";
  document.body.appendChild(picker);
  const pickerCells = [];
  function selectCatalog(i) {
    catalogIndex = i;
    rebuildGhost();
    highlightPicker();
  }
  function buildPicker() {
    picker.innerHTML = "";
    pickerCells.length = 0;
    CATALOG.forEach((spec, i) => {
      const cell = document.createElement("button");
      cell.title = spec.label;
      cell.style.cssText = "width:66px;height:66px;padding:0;border:1px solid #1c5a3e;border-radius:4px;" +
        "background-color:#0c2318;background-size:cover;background-position:center;" +
        "color:#c9ffdf;font:9px/1.15 Consolas,monospace;cursor:pointer;" +
        "display:flex;align-items:flex-end;justify-content:center;text-align:center;overflow:hidden;";
      const tag = document.createElement("span");
      tag.textContent = spec.label;
      tag.style.cssText = "background:rgba(0,10,6,.72);width:100%;padding:1px 0;";
      cell.appendChild(tag);
      cell.onclick = () => selectCatalog(i);
      picker.appendChild(cell);
      pickerCells.push(cell);
    });
    highlightPicker();
  }
  function highlightPicker() {
    pickerCells.forEach((c, i) => {
      const on = i === catalogIndex;
      c.style.borderColor = on ? "#38ff9e" : "#1c5a3e";
      c.style.boxShadow = on ? "0 0 6px #38ff9e" : "none";
    });
  }
  let thumbsStarted = false;
  function ensureThumbnails() {
    if (thumbsStarted) return;
    thumbsStarted = true;
    buildPicker();
    for (const [i, spec] of CATALOG.entries()) {
      snapshotThumbnail(spec).then((url) => {
        if (url && pickerCells[i]) pickerCells[i].style.backgroundImage = `url(${url})`;
      });
    }
  }

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
      `WASD pan · wheel zoom · right-drag orbit\n` +
      `, / . cycle · Q/E rotate · click place\n` +
      `Backspace undo · F9 exit`;
  }

  // -------------------------------------------------------- cheat code buf
  let buf = "";
  function onKeydownGlobal(e) {
    buf = (buf + e.key).slice(-CHEAT_CODE.length);
    if (buf.toLowerCase() === CHEAT_CODE.toLowerCase()) { toggle(); buf = ""; }
    if (!active) return;
    if (e.code === "F9") { e.preventDefault(); toggle(); }
    else if (e.code === "Comma") { selectCatalog((catalogIndex - 1 + CATALOG.length) % CATALOG.length); }
    else if (e.code === "Period") { selectCatalog((catalogIndex + 1) % CATALOG.length); }
    else if (e.code === "KeyQ") { ry -= 0.2; }
    else if (e.code === "KeyE") { ry += 0.2; }
    else if (e.code === "Backspace") { e.preventDefault(); undo(); }
  }
  window.addEventListener("keydown", onKeydownGlobal);

  function onClick(e) {
    if (!active || e.button !== 0) return;
    if (exportBox.style.display !== "none") return;   // don't place while reading the export box
    // Clicking Undo/Export/Save or a picker tile is a mousedown too, and it
    // bubbles to window same as a click on the world — without this guard
    // every button click also placed a fresh object right before acting on
    // it (e.g. Undo silently placing-then-undoing its own new object, which
    // looks exactly like Undo doing nothing).
    if (controls.contains(e.target) || picker.contains(e.target)) return;
    place();
  }
  window.addEventListener("mousedown", onClick);

  // ------------------------------------------------- free-fly camera (RTS-style)
  // Detaches the camera from the player entirely while active: WASD pans over
  // any distance, the wheel zooms from street level out to a near-satellite
  // view, and right-drag orbits — a small city-builder camera, not the
  // player's chase cam with a leash.
  const FLY_PITCH_MIN = 0.2, FLY_PITCH_MAX = 1.5;
  const FLY_MIN_DIST = 5, FLY_MAX_DIST = 340;
  let flyYaw = 0, flyPitch = 0.95, flyDist = 55;
  const flyFocus = new THREE.Vector3();
  let flyDragging = false;
  let savedFar = null;

  window.addEventListener("mousedown", (e) => {
    if (active && e.button === 2) flyDragging = true;
  });
  window.addEventListener("mouseup", (e) => { if (e.button === 2) flyDragging = false; });
  // movementX/Y (not clientX/Y) — clientX/Y freeze at the lock point if the
  // page still has the pointer locked from normal gameplay when devmode
  // turns on; movementX/Y keeps reporting real deltas either way.
  window.addEventListener("mousemove", (e) => {
    if (!active || !flyDragging) return;
    flyYaw -= (e.movementX || 0) * 0.0032;
    flyPitch = THREE.MathUtils.clamp(flyPitch + (e.movementY || 0) * 0.0026, FLY_PITCH_MIN, FLY_PITCH_MAX);
  });
  window.addEventListener("contextmenu", (e) => { if (active) e.preventDefault(); });
  window.addEventListener("wheel", (e) => {
    if (!active) return;
    const k = Math.exp(Math.sign(e.deltaY) * 0.12);
    flyDist = THREE.MathUtils.clamp(flyDist * k, FLY_MIN_DIST, FLY_MAX_DIST);
  }, { passive: true });

  const _flyFwd = new THREE.Vector3(), _flyRight = new THREE.Vector3(), _flyDir = new THREE.Vector3();
  function updateCamera(dt) {
    if (!active) return;
    const fIn = (input.isDown("forward") ? 1 : 0) - (input.isDown("back") ? 1 : 0);
    const rIn = (input.isDown("right") ? 1 : 0) - (input.isDown("left") ? 1 : 0);
    if (fIn || rIn) {
      const panSpeed = Math.max(18, flyDist * 1.5);
      const h = cameraYawToHeading(flyYaw);
      forwardFromHeading(h, _flyFwd);
      rightFromHeading(h, _flyRight);
      flyFocus.x += (_flyFwd.x * fIn + _flyRight.x * rIn) * panSpeed * dt;
      flyFocus.z += (_flyFwd.z * fIn + _flyRight.z * rIn) * panSpeed * dt;
    }
    const cosP = Math.cos(flyPitch), sinP = Math.sin(flyPitch);
    camera.position.set(
      flyFocus.x + Math.sin(flyYaw) * cosP * flyDist,
      Math.max(2, sinP * flyDist),
      flyFocus.z + Math.cos(flyYaw) * cosP * flyDist,
    );
    camera.lookAt(flyFocus.x, 0, flyFocus.z);
  }

  // ------------------------------------------------------------- lifecycle
  function toggle() {
    active = !active;
    ghost.visible = active;
    panel.style.display = active ? "block" : "none";
    controls.style.display = active ? "flex" : "none";
    picker.style.display = active ? "grid" : "none";
    if (active) {
      // Gameplay may still have the pointer locked (hidden OS cursor, only
      // relative movement) from before the cheat code was typed — release it
      // so there's a visible, clickable cursor for the picker and buttons.
      if (document.pointerLockElement) document.exitPointerLock();
      // Hand off from the chase cam: aim the fly camera at whatever ground
      // point it was already looking at, at roughly its current distance.
      camera.getWorldDirection(_flyDir);
      let gx = camera.position.x, gz = camera.position.z;
      if (_flyDir.y < -0.05) {
        const t = -camera.position.y / _flyDir.y;
        gx = camera.position.x + _flyDir.x * t;
        gz = camera.position.z + _flyDir.z * t;
      }
      flyFocus.set(gx, 0, gz);
      const v = camera.position.clone().sub(flyFocus);
      const dist = v.length();
      flyDist = THREE.MathUtils.clamp(dist || flyDist, FLY_MIN_DIST, FLY_MAX_DIST);
      if (dist > 0.01) {
        flyYaw = Math.atan2(v.x, v.z);
        flyPitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(v.y / dist, -1, 1)), FLY_PITCH_MIN, FLY_PITCH_MAX);
      }
      // Far past the normal 420 m draw distance, so zooming all the way out
      // doesn't clip the very city you zoomed out to see.
      savedFar = camera.far;
      camera.far = Math.max(savedFar, FLY_MAX_DIST * 4);
      camera.updateProjectionMatrix();
      rebuildGhost();
      ensureThumbnails();
    } else {
      if (savedFar != null) { camera.far = savedFar; camera.updateProjectionMatrix(); savedFar = null; }
      exportBox.style.display = "none";
    }
  }

  function place() {
    const spec = CATALOG[catalogIndex];
    const p = ghost.position;
    const propsBefore = placeCtx.props.length;
    trackedBlockers = [];
    trackedLitSpots = [];
    spec.place(placeCtx, p.x, p.z, ry);
    const created = placeCtx.props.slice(propsBefore);
    const createdBlockers = trackedBlockers;
    const createdLitSpots = trackedLitSpots;
    trackedBlockers = null;
    trackedLitSpots = null;
    const id = nextId++;
    placements.push({ id, catalogKey: spec.key, x: p.x, z: p.z, ry, created, createdBlockers, createdLitSpots });
    updateHUD();
    persist();
  }

  function undo() {
    const last = placements.pop();
    if (!last) return;
    for (const obj of last.created || []) scene.remove(obj);
    for (const b of last.createdBlockers || []) removeBlocker(b);
    for (const l of last.createdLitSpots || []) removeLitSpot(l);
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
    const propsBefore = placeCtx.props.length;
    trackedBlockers = [];
    trackedLitSpots = [];
    spec.place(placeCtx, entry.x, entry.z, entry.ry);
    const created = placeCtx.props.slice(propsBefore);
    const createdBlockers = trackedBlockers;
    const createdLitSpots = trackedLitSpots;
    trackedBlockers = null;
    trackedLitSpots = null;
    placements.push({ id: nextId++, catalogKey: entry.catalogKey, x: entry.x, z: entry.z, ry: entry.ry, created, createdBlockers, createdLitSpots });
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
    updateCamera,
    get active() { return active; },
    get placements() { return placements.length; },
    get props() { return placeCtx.props; },
  };
}
