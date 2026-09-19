// ---------------------------------------------------------------------------
// mapEditor.js — hidden dev-mode landmark placement tool.
//
// Type $DEVMODE69xxx anywhere during free roam (a GTA-style typed cheat code,
// buffered from raw keydown, not tied to input.js's action bindings) to turn
// it on — or the shorter alias #DEVx, same switch either way. While active,
// WASD and the mouse drive a free-fly "city builder" camera instead of the
// player (who just stands still, unattended), and the game's own HUD hides
// itself so it doesn't fight the editor's panels for space:
//   WASD          pan the camera across the map, at any distance
//   mouse wheel   zoom, from street level out to a near-satellite overview
//   right-drag    orbit the camera
//   , / .         cycle the selected asset (or click a tile in the library)
//   Q / E         rotate the ghost preview (or the Select tool's selection)
//   left click    place the real object (calls straight into landmarks.js —
//                 what you see is the actual placement function running
//                 live) — or act on the current tool, see below
//   Backspace     undo the last placement, or delete the current Select
//                 tool selection if one is active
//   F9            toggle off ($DEVMODE69xxx / #DEVx also work)
//
// The ghost is the real object, loaded and built the same way it will be
// placed, just translucent — not a solid green stand-in box — with a thin
// wire outline for its footprint. The asset library (its own column, on the
// right) is searchable (search box + category tabs above the grid), not a
// flat scroll — each tile's thumbnail is a real render of that object,
// snapshotted once (off-screen, via a render target — never flashed to the
// visible canvas) and cached.
//
// Three tools, one active at a time (Place is the default with neither
// button on):
//   Delete    left-click removes the nearest editor-placed object instead
//             of placing one — same reach as Backspace/Undo, but for any
//             placement nearby, not just the last one.
//   Select    left-click picks the nearest editor-placed object; its ghost
//             preview swaps to match it (so what you see is what moves),
//             turns yellow, and a second click drops it at the new spot —
//             Q/E rotates it in place, Backspace or "Delete selected"
//             removes it, "Deselect" lets go without moving it.
// Both tools only ever touch objects THIS tool tracks in `placements` (this
// session, or replayed from a save) — the world's own authored landmarks
// aren't editable here.
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
//   - separately, "Save As" / "Load" / "Delete slot" snapshot the current
//     session under a name on that same server, so you can keep several
//     named layouts and switch between them ("Load" replaces the current
//     session, same as opening a different file)
//   - exportable as real code (the Export button) — pasting that into a
//     district file's build function is how a placement becomes permanent,
//     shared world content, the same way every other landmark in this game
//     is authored.
//
// The "Ask AI" box sends a free-text prompt plus grounding (the ghost's
// current ground point as an anchor, and whatever's already placed nearby)
// to server/index.js's /editor/ai, which proxies to an LLM over OpenRouter
// with a model fallback chain (server/ai.js) and hands back a short list of
// placements to drop exactly as if you'd clicked them. Needs
// OPENROUTER_API_KEY set on the server — see server/ai.js's header.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { cameraYawToHeading, forwardFromHeading, rightFromHeading } from "./world.js";
import {
  CITY_BUILDING_TYPES, placeCityBuilding, placeBillboard, placeGunShop, placeGasStation, placeSixTwelve,
  placeBayouStiltHut, placeMaritimeCargo, placeOilDerrick,
  placeStreetClutter, placeOfficeClutter, placeTacos, placeBurgerPiz, placePopeyes, placeStreetLamp,
} from "./landmarks.js";

// Either code turns the editor on (or back off) — "#DEVx" is the same switch
// under a shorter alias, for anyone who doesn't want to type the whole thing.
const CHEAT_CODES = ["$DEVMODE69xxx", "#DEVx"];
const CHEAT_MAXLEN = Math.max(...CHEAT_CODES.map((c) => c.length));
const LS_KEY = "gtb_mapEditor_placements_v1";

// One entry per placeable asset: { key, label, category, w, d, place(ctx, x, z, ry) }.
// `w`/`d` size the ghost's footprint outline; `place` calls the exact real
// landmarks.js function this catalog entry represents, and `code(x, z, ry)`
// renders the matching source line for the Export panel. `category` groups
// the library/search UI (below) into sections instead of one flat grid.
const CATALOG = [
  ...Object.entries(CITY_BUILDING_TYPES).map(([key, spec]) => ({
    key: `building:${key}`, label: spec.label, category: "Buildings", w: spec.w, d: spec.d,
    place: (ctx, x, z, ry) => placeCityBuilding(ctx, key, x, z, ry),
    code: (x, z, ry) => `placeCityBuilding(ctx, "${key}", ${x}, ${z}, ${ry});`,
  })),
  // placeParkedCar() / placeTruck() are currently disabled elsewhere in
  // landmarks.js ("cars/trucks are broken/non-interactable" — both are no-op
  // stubs) — omitted here rather than offer a catalog entry that silently
  // places nothing when clicked.
  { key: "gasStation", label: "Gas station", category: "Infrastructure", w: 18, d: 14,
    place: (ctx, x, z, ry) => placeGasStation(ctx, x, z, ry),
    code: (x, z, ry) => `placeGasStation(ctx, ${x}, ${z}, ${ry});` },
  { key: "sixTwelve", label: "6twelve store", category: "Infrastructure", w: 14, d: 12,
    place: (ctx, x, z, ry) => placeSixTwelve(ctx, x, z, ry),
    code: (x, z, ry) => `placeSixTwelve(ctx, ${x}, ${z}, ${ry});` },
  { key: "gunShop", label: "Gun shop (Bayou Arsenal)", category: "Infrastructure", w: 16, d: 14,
    place: (ctx, x, z, ry) => placeGunShop(ctx, x, z, ry),
    code: (x, z, ry) => `placeGunShop(ctx, ${x}, ${z}, ${ry});` },
  { key: "billboard", label: "Billboard", category: "Infrastructure", w: 10, d: 1,
    place: (ctx, x, z, ry) => placeBillboard(ctx, x, z, ry),
    code: (x, z, ry) => `placeBillboard(ctx, ${x}, ${z}, ${ry});` },
  { key: "stiltHut", label: "Bayou stilt hut", category: "Infrastructure", w: 6.4, d: 6.4,
    place: (ctx, x, z, ry) => placeBayouStiltHut(ctx, x, z, ry),
    code: (x, z, ry) => `placeBayouStiltHut(ctx, ${x}, ${z}, ${ry});` },
  { key: "cargo", label: "Maritime cargo stack", category: "Infrastructure", w: 8, d: 8,
    place: (ctx, x, z, ry) => placeMaritimeCargo(ctx, x, z, ry),
    code: (x, z, ry) => `placeMaritimeCargo(ctx, ${x}, ${z}, ${ry});` },
  { key: "derrick", label: "Oil derrick", category: "Infrastructure", w: 6, d: 6,
    place: (ctx, x, z, ry) => placeOilDerrick(ctx, x, z, ry),
    code: (x, z, ry) => `placeOilDerrick(ctx, ${x}, ${z}, ${ry});` },
  { key: "tacos", label: "Tacos stand", category: "Infrastructure", w: 8, d: 5,
    place: (ctx, x, z, ry) => placeTacos(ctx, x, z, ry),
    code: (x, z, ry) => `placeTacos(ctx, ${x}, ${z}, ${ry});` },
  { key: "burgerPiz", label: "BurgerPiz", category: "Infrastructure", w: 12, d: 9,
    place: (ctx, x, z, ry) => placeBurgerPiz(ctx, x, z, ry),
    code: (x, z, ry) => `placeBurgerPiz(ctx, ${x}, ${z}, ${ry});` },
  { key: "popeyes", label: "Popeyes", category: "Infrastructure", w: 12, d: 10,
    place: (ctx, x, z, ry) => placePopeyes(ctx, x, z, ry),
    code: (x, z, ry) => `placePopeyes(ctx, ${x}, ${z}, ${ry});` },
  { key: "streetLamp", label: "Street lamp", category: "Infrastructure", w: 1.5, d: 1.5,
    place: (ctx, x, z, ry) => placeStreetLamp(ctx, x, z, ry),
    code: (x, z, ry) => `placeStreetLamp(ctx, ${x}, ${z}, ${ry});` },
  { key: "streetClutter", label: "Street clutter", category: "Clutter", w: 4, d: 4,
    place: (ctx, x, z, ry) => placeStreetClutter(ctx, x, z, ry),
    code: (x, z, ry) => `placeStreetClutter(ctx, ${x}, ${z}, ${ry});` },
  { key: "officeClutter", label: "Office clutter", category: "Clutter", w: 3, d: 3,
    place: (ctx, x, z, ry) => placeOfficeClutter(ctx, x, z, ry),
    code: (x, z, ry) => `placeOfficeClutter(ctx, ${x}, ${z}, ${ry});` },
];
const CATEGORIES = ["All", ...new Set(CATALOG.map((c) => c.category))];

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
  let mode = "place";        // "place" | "delete" | "select"
  let selected = null;       // the placement entry under the Select tool, or null
  const placements = [];   // { id, catalogKey, x, z, ry, created, createdBlockers, createdLitSpots }
  let nextId = 1;
  const gameHud = document.getElementById("hud");   // hidden while the editor's own panels are up

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
  // Two fixed columns, each laid out with plain flexbox flow instead of
  // hand-picked `top:` offsets per panel — the old layout guessed a pixel
  // offset for every box, so any panel that grew (more buttons, a status
  // line) shoved the next one halfway underneath it. The left column is the
  // info readout and every action; the whole searchable asset library moved
  // to its own column on the right, instead of stacking under the controls
  // on the left — that alone was most of the crowding.
  const leftCol = document.createElement("div");
  leftCol.style.cssText = "position:fixed;left:16px;top:16px;z-index:40;display:none;flex-direction:column;" +
    "gap:8px;max-width:300px;max-height:calc(100vh - 32px);overflow-y:auto;";
  document.body.appendChild(leftCol);
  const rightCol = document.createElement("div");
  rightCol.style.cssText = "position:fixed;right:16px;top:16px;z-index:40;display:none;flex-direction:column;" +
    "gap:8px;max-width:300px;max-height:calc(100vh - 32px);overflow-y:auto;align-items:flex-end;";
  document.body.appendChild(rightCol);

  const panel = document.createElement("div");
  panel.style.cssText = "box-sizing:border-box;pointer-events:none;" +
    "font:12px/1.5 Consolas,monospace;color:#c9ffdf;background:rgba(0,20,10,.85);" +
    "padding:10px 12px;border:1px solid #38ff9e;border-radius:6px;white-space:pre;";
  leftCol.appendChild(panel);
  const controls = document.createElement("div");
  controls.style.cssText = "box-sizing:border-box;display:flex;flex-direction:column;gap:6px;pointer-events:auto;" +
    "background:rgba(0,20,10,.85);border:1px solid #38ff9e;border-radius:6px;padding:8px;";
  leftCol.appendChild(controls);
  function row() {
    const r = document.createElement("div");
    r.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;";
    controls.appendChild(r);
    return r;
  }
  function makeBtn(parent, label, fn) {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "font:12px Consolas,monospace;padding:4px 8px;cursor:pointer;background:#0c3324;color:#c9ffdf;border:1px solid #38ff9e;border-radius:4px;";
    b.onclick = fn;
    parent.appendChild(b);
    return b;
  }
  function makeInput(parent, placeholder, width) {
    const i = document.createElement("input");
    i.type = "text";
    i.placeholder = placeholder;
    i.style.cssText = `font:12px Consolas,monospace;padding:4px 6px;width:${width}px;` +
      "background:#08140f;color:#c9ffdf;border:1px solid #1c5a3e;border-radius:4px;";
    // typing in a field must not also feed the cheat-code buffer or fire ,/./Q/E
    i.addEventListener("keydown", (e) => e.stopPropagation());
    parent.appendChild(i);
    return i;
  }

  const mainRow = row();
  makeBtn(mainRow, "Undo", () => undo());
  makeBtn(mainRow, "Export", () => showExport());
  const modeRow = row();
  const deleteBtn = makeBtn(modeRow, "Delete: OFF", () => setMode(mode === "delete" ? "place" : "delete"));
  const selectBtn = makeBtn(modeRow, "Select: OFF", () => setMode(mode === "select" ? "place" : "select"));

  // Only meaningful once something is selected — hidden the rest of the time
  // instead of sitting there disabled, since "Select" already reads as the
  // mode toggle and these are its follow-up actions.
  const selectStatus = document.createElement("div");
  selectStatus.style.cssText = "font:11px Consolas,monospace;color:#ffe066;min-height:14px;display:none;";
  controls.appendChild(selectStatus);
  const selectRow = row();
  selectRow.style.display = "none";
  makeBtn(selectRow, "Delete selected", () => deleteSelected());
  makeBtn(selectRow, "Deselect", () => setSelected(null));

  const slotRow = row();
  const slotInput = makeInput(slotRow, "slot name", 84);
  makeBtn(slotRow, "Save As", () => saveSlot(slotInput.value));
  const slotSelect = document.createElement("select");
  slotSelect.style.cssText = "font:12px Consolas,monospace;padding:4px;max-width:100px;" +
    "background:#08140f;color:#c9ffdf;border:1px solid #1c5a3e;border-radius:4px;";
  slotSelect.addEventListener("keydown", (e) => e.stopPropagation());
  slotRow.appendChild(slotSelect);
  makeBtn(slotRow, "Load", () => loadSlot(slotSelect.value));
  makeBtn(slotRow, "Delete slot", () => deleteSlotUI(slotSelect.value));
  const slotStatus = document.createElement("div");
  slotStatus.style.cssText = "font:11px Consolas,monospace;color:#8fd9b6;min-height:14px;";
  controls.appendChild(slotStatus);

  const aiRow = row();
  const aiInput = makeInput(aiRow, "ask AI to place something…", 170);
  const aiBtn = makeBtn(aiRow, "Ask AI", () => runAI());
  aiInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runAI(); });
  const aiStatus = document.createElement("div");
  aiStatus.style.cssText = "font:11px Consolas,monospace;color:#8fd9b6;min-height:14px;";
  controls.appendChild(aiStatus);

  // --------------------------------------------------------- asset picker
  // A visual library of every placeable asset (real thumbnails, not a text
  // dropdown), with a search box and category tabs — click a tile to select
  // it, same as `,` / `.`. Its own column, on the right, so a long catalog
  // never pushes into the controls on the left.
  const libraryBar = document.createElement("div");
  libraryBar.style.cssText = "box-sizing:border-box;display:flex;flex-direction:column;gap:6px;pointer-events:auto;" +
    "background:rgba(0,20,10,.85);border:1px solid #38ff9e;border-radius:6px;padding:8px;width:100%;";
  rightCol.appendChild(libraryBar);
  const searchInput = makeInput(libraryBar, "search assets…", 0);
  searchInput.style.width = "100%";
  searchInput.addEventListener("input", () => filterPicker());
  const tabRow = document.createElement("div");
  tabRow.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;";
  libraryBar.appendChild(tabRow);

  let activeCategory = "All";
  const tabButtons = CATEGORIES.map((cat) => {
    const b = document.createElement("button");
    b.textContent = cat;
    b.style.cssText = "font:11px Consolas,monospace;padding:3px 7px;cursor:pointer;border-radius:4px;" +
      "background:#0c2318;color:#8fd9b6;border:1px solid #1c5a3e;";
    b.onclick = () => { activeCategory = cat; filterPicker(); highlightTabs(); };
    tabRow.appendChild(b);
    return { cat, b };
  });
  function highlightTabs() {
    for (const { cat, b } of tabButtons) {
      const on = cat === activeCategory;
      b.style.borderColor = on ? "#38ff9e" : "#1c5a3e";
      b.style.color = on ? "#c9ffdf" : "#8fd9b6";
    }
  }
  highlightTabs();

  const picker = document.createElement("div");
  picker.style.cssText = "box-sizing:border-box;display:none;" +
    "grid-template-columns:repeat(4, 1fr);gap:6px;max-height:60vh;overflow-y:auto;width:100%;" +
    "background:rgba(0,20,10,.85);border:1px solid #38ff9e;border-radius:6px;padding:8px;pointer-events:auto;";
  rightCol.appendChild(picker);
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
      cell.style.cssText = "aspect-ratio:1;width:100%;padding:0;border:1px solid #1c5a3e;border-radius:4px;" +
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
    filterPicker();
  }
  function highlightPicker() {
    pickerCells.forEach((c, i) => {
      const on = i === catalogIndex;
      c.style.borderColor = on ? "#38ff9e" : "#1c5a3e";
      c.style.boxShadow = on ? "0 0 6px #38ff9e" : "none";
    });
  }
  // Combines the search text and the active category tab — a plain visual
  // filter (hide non-matching tiles) so index-based selection (`,`/`.`,
  // click) keeps working unchanged against the full CATALOG.
  function filterPicker() {
    const q = searchInput.value.trim().toLowerCase();
    CATALOG.forEach((spec, i) => {
      const catOk = activeCategory === "All" || spec.category === activeCategory;
      const textOk = !q || spec.label.toLowerCase().includes(q) || spec.category.toLowerCase().includes(q);
      if (pickerCells[i]) pickerCells[i].style.display = catOk && textOk ? "" : "none";
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
    const modeLine = mode === "delete" ? "  [DELETE MODE]" : mode === "select" ? "  [SELECT MODE]" : "";
    panel.textContent =
      `DEV MODE — MAP EDITOR\n` +
      `asset: ${spec.label} (${catalogIndex + 1}/${CATALOG.length})\n` +
      `placed: ${placements.length}${modeLine}\n` +
      `WASD pan · wheel zoom · right-drag orbit\n` +
      `, / . cycle · Q/E rotate · click place\n` +
      `Backspace undo · F9 or #DEVx exit`;
  }

  // -------------------------------------------------------- cheat code buf
  let buf = "";
  function onKeydownGlobal(e) {
    buf = (buf + e.key).slice(-CHEAT_MAXLEN);
    const lower = buf.toLowerCase();
    if (CHEAT_CODES.some((c) => lower.endsWith(c.toLowerCase()))) { toggle(); buf = ""; }
    if (!active) return;
    if (e.code === "F9") { e.preventDefault(); toggle(); }
    else if (e.code === "Comma") { selectCatalog((catalogIndex - 1 + CATALOG.length) % CATALOG.length); }
    else if (e.code === "Period") { selectCatalog((catalogIndex + 1) % CATALOG.length); }
    else if (e.code === "KeyQ") { if (mode === "select" && selected) moveSelectedTo(selected.x, selected.z, selected.ry - 0.2); else ry -= 0.2; }
    else if (e.code === "KeyE") { if (mode === "select" && selected) moveSelectedTo(selected.x, selected.z, selected.ry + 0.2); else ry += 0.2; }
    else if (e.code === "Backspace") { e.preventDefault(); if (mode === "select" && selected) deleteSelected(); else undo(); }
  }
  window.addEventListener("keydown", onKeydownGlobal);

  function onClick(e) {
    if (!active || e.button !== 0) return;
    if (exportBox.style.display !== "none") return;   // don't place while reading the export box
    // Clicking a button, the picker, or one of the new panels is a
    // mousedown too, and it bubbles to window same as a click on the world —
    // without this guard every button click also placed (or deleted) a
    // fresh object right before acting on it.
    if (leftCol.contains(e.target) || rightCol.contains(e.target)) return;
    if (mode === "delete") { deleteNear(ghost.position.x, ghost.position.z); return; }
    if (mode === "select") {
      if (!selected) selectNear(ghost.position.x, ghost.position.z);
      else moveSelectedTo(ghost.position.x, ghost.position.z, selected.ry);
      return;
    }
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
  // Three mutually exclusive tools. "select" keeps the ghost visible (it
  // doubles as the move target once something is picked) while "delete"
  // hides it — there's nothing to aim.
  function updateGhostColor() {
    ghostEdgeMat.color.setHex(mode === "delete" ? 0xff6b6b : (mode === "select" && selected) ? 0xffe066 : 0x38ff9e);
  }
  function setMode(next) {
    mode = next;
    deleteBtn.textContent = mode === "delete" ? "Delete: ON" : "Delete: OFF";
    deleteBtn.style.background = mode === "delete" ? "#3a0c0c" : "#0c3324";
    deleteBtn.style.borderColor = mode === "delete" ? "#ff6b6b" : "#38ff9e";
    selectBtn.textContent = mode === "select" ? "Select: ON" : "Select: OFF";
    selectBtn.style.background = mode === "select" ? "#0c2a3a" : "#0c3324";
    selectBtn.style.borderColor = mode === "select" ? "#66c8ff" : "#38ff9e";
    if (mode !== "select") setSelected(null);
    ghost.visible = active && mode !== "delete";
    updateGhostColor();
    updateHUD();
  }
  // Select tool: pick the nearest editor-placed object to `x, z` (same reach
  // as Delete's own nearest-search) and make it the active selection —
  // its ghost preview swaps to match, so what you see is what will move.
  function selectNear(x, z) {
    let best = -1, bestDist = Infinity;
    placements.forEach((entry, i) => {
      const spec = CATALOG.find((s) => s.key === entry.catalogKey);
      const radius = (spec ? Math.max(spec.w, spec.d) : 6) / 2 + 1.5;
      const d = Math.hypot(entry.x - x, entry.z - z);
      if (d <= radius && d < bestDist) { bestDist = d; best = i; }
    });
    if (best === -1) { selectStatus.textContent = "nothing nearby to select"; selectStatus.style.display = "block"; return; }
    setSelected(placements[best]);
  }
  function setSelected(entry) {
    selected = entry;
    selectRow.style.display = entry ? "flex" : "none";
    selectStatus.style.display = entry || mode === "select" ? "block" : "none";
    if (entry) {
      const spec = CATALOG.find((s) => s.key === entry.catalogKey);
      const idx = spec ? CATALOG.indexOf(spec) : -1;
      if (idx !== -1) { catalogIndex = idx; rebuildGhost(); highlightPicker(); }
      ry = entry.ry;
      selectStatus.textContent = `selected ${spec ? spec.label : entry.catalogKey} — click the world to move it here, Q/E to rotate`;
    } else if (mode === "select") {
      selectStatus.textContent = "click something placed to select it";
    }
    updateGhostColor();
  }
  function moveSelectedTo(x, z, moveRy) {
    if (!selected) return;
    const spec = CATALOG.find((s) => s.key === selected.catalogKey);
    if (!spec) return;
    destroyPlacement(selected);
    const i = placements.indexOf(selected);
    if (i !== -1) placements.splice(i, 1);
    const entry = placeAt(spec, x, z, moveRy);
    setSelected(entry);
    updateHUD();
    persist();
  }
  function deleteSelected() {
    if (!selected) return;
    destroyPlacement(selected);
    const i = placements.indexOf(selected);
    if (i !== -1) placements.splice(i, 1);
    setSelected(null);
    updateHUD();
    persist();
  }

  function toggle() {
    active = !active;
    ghost.visible = active && mode !== "delete";
    leftCol.style.display = active ? "flex" : "none";
    rightCol.style.display = active ? "flex" : "none";
    picker.style.display = active ? "grid" : "none";
    if (gameHud) gameHud.style.display = active ? "none" : "";   // the editor's own panels replace it, don't fight it for space
    if (active) {
      refreshSlots();
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
      setMode("place");
    }
  }

  // Shared by a click, a replayed save, and an AI placement — the only
  // difference between them is where x/z/ry/spec come from.
  function placeAt(spec, x, z, placeRy) {
    const propsBefore = placeCtx.props.length;
    trackedBlockers = [];
    trackedLitSpots = [];
    spec.place(placeCtx, x, z, placeRy);
    const created = placeCtx.props.slice(propsBefore);
    const createdBlockers = trackedBlockers;
    const createdLitSpots = trackedLitSpots;
    trackedBlockers = null;
    trackedLitSpots = null;
    const entry = { id: nextId++, catalogKey: spec.key, x, z, ry: placeRy, created, createdBlockers, createdLitSpots };
    placements.push(entry);
    return entry;
  }

  function place() {
    const spec = CATALOG[catalogIndex];
    const p = ghost.position;
    placeAt(spec, p.x, p.z, ry);
    updateHUD();
    persist();
  }

  function destroyPlacement(entry) {
    for (const obj of entry.created || []) scene.remove(obj);
    for (const b of entry.createdBlockers || []) removeBlocker(b);
    for (const l of entry.createdLitSpots || []) removeLitSpot(l);
  }

  function undo() {
    const last = placements.pop();
    if (!last) return;
    destroyPlacement(last);
    updateHUD();
    persist();
  }

  // Delete mode: remove whatever editor-placed object is nearest the ghost's
  // ground point, as long as it's actually close enough to be "that one" —
  // this only ever finds objects THIS tool tracks in `placements` (its own
  // session, or a loaded save), never the world's authored landmarks.
  function deleteNear(x, z) {
    let best = -1, bestDist = Infinity;
    placements.forEach((entry, i) => {
      const spec = CATALOG.find((s) => s.key === entry.catalogKey);
      const radius = (spec ? Math.max(spec.w, spec.d) : 6) / 2 + 1.5;
      const d = Math.hypot(entry.x - x, entry.z - z);
      if (d <= radius && d < bestDist) { bestDist = d; best = i; }
    });
    if (best === -1) return;
    destroyPlacement(placements[best]);
    placements.splice(best, 1);
    updateHUD();
    persist();
  }

  function clearAllPlacements() {
    for (const entry of placements) destroyPlacement(entry);
    placements.length = 0;
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

  // --------------------------------------------------------- named slots
  // Layered on top of the single auto-saved session above: "Save As" snaps
  // a copy of the current session under a name on the server; "Load"
  // replaces the current session with a saved one (and that replacement
  // then becomes the thing auto-saving, same as any other change).
  function setSlotStatus(text) { slotStatus.textContent = text; }
  async function refreshSlots() {
    slotSelect.innerHTML = "";
    if (!httpBase) { setSlotStatus("no server reachable — slots need it"); return; }
    try {
      const res = await fetch(`${httpBase}/editor/slots`);
      const data = await res.json();
      const slots = Array.isArray(data.slots) ? data.slots : [];
      if (!slots.length) { const o = document.createElement("option"); o.textContent = "(no saved slots)"; o.disabled = true; slotSelect.appendChild(o); return; }
      for (const s of slots) {
        const o = document.createElement("option");
        o.value = o.textContent = s.name;
        slotSelect.appendChild(o);
      }
      setSlotStatus(`${slots.length} saved slot${slots.length === 1 ? "" : "s"}`);
    } catch { setSlotStatus("couldn't reach the server"); }
  }
  async function saveSlot(name) {
    name = (name || "").trim();
    if (!name) { setSlotStatus("type a name first"); return; }
    if (!httpBase) { setSlotStatus("no server reachable — slots need it"); return; }
    try {
      const res = await fetch(`${httpBase}/editor/save?slot=${encodeURIComponent(name)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placements: serialize() }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "save failed");
      setSlotStatus(`saved "${name}"`);
      slotInput.value = "";
      refreshSlots();
    } catch (err) { setSlotStatus(`save failed: ${err.message || err}`); }
  }
  async function loadSlot(name) {
    if (!name) { setSlotStatus("pick a slot to load"); return; }
    if (!httpBase) { setSlotStatus("no server reachable — slots need it"); return; }
    try {
      const res = await fetch(`${httpBase}/editor/load?slot=${encodeURIComponent(name)}`);
      const data = await res.json();
      if (!Array.isArray(data.placements)) throw new Error("bad save data");
      clearAllPlacements();
      for (const entry of data.placements) replayPlacement(entry);
      updateHUD();
      persist();   // the loaded slot is now the current (auto-saving) session
      setSlotStatus(`loaded "${name}" (${data.placements.length})`);
    } catch (err) { setSlotStatus(`load failed: ${err.message || err}`); }
  }
  async function deleteSlotUI(name) {
    if (!name) { setSlotStatus("pick a slot to delete"); return; }
    if (!httpBase) { setSlotStatus("no server reachable — slots need it"); return; }
    try {
      await fetch(`${httpBase}/editor/delete-slot?slot=${encodeURIComponent(name)}`, { method: "POST" });
      setSlotStatus(`deleted "${name}"`);
      refreshSlots();
    } catch (err) { setSlotStatus(`delete failed: ${err.message || err}`); }
  }

  // ------------------------------------------------------------------- AI
  // Natural-language placement: send the prompt plus grounding (an anchor —
  // the ghost's current ground point — and whatever's already nearby) to
  // the server, which proxies to an LLM and hands back a short list of
  // { catalogKey, x, z, ry } to place exactly like a click would.
  async function runAI() {
    const prompt = aiInput.value.trim();
    if (!prompt) return;
    if (!httpBase) { aiStatus.textContent = "AI needs the multiplayer server (not reachable)"; return; }
    const anchor = { x: ghost.position.x, z: ghost.position.z };
    const nearby = placements
      .map((p) => ({ catalogKey: p.catalogKey, dx: p.x - anchor.x, dz: p.z - anchor.z, d: Math.hypot(p.x - anchor.x, p.z - anchor.z) }))
      .filter((p) => p.d < 80)
      .sort((a, b) => a.d - b.d)
      .slice(0, 12);
    const catalog = CATALOG.map((c) => ({ key: c.key, label: c.label, w: c.w, d: c.d }));
    aiBtn.disabled = true;
    aiStatus.textContent = "thinking…";
    try {
      const res = await fetch(`${httpBase}/editor/ai`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, anchor, nearby, catalog }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "AI request failed");
      let placed = 0;
      for (const p of data.placements) {
        const spec = CATALOG.find((s) => s.key === p.catalogKey);
        if (!spec) continue;
        placeAt(spec, p.x, p.z, p.ry || 0);
        placed++;
      }
      updateHUD();
      persist();
      aiStatus.textContent = placed
        ? `placed ${placed} via ${data.model}`
        : "AI replied but nothing matched a valid asset";
      if (placed) aiInput.value = "";
    } catch (err) {
      aiStatus.textContent = String(err.message || err);
    } finally {
      aiBtn.disabled = false;
    }
  }

  function replayPlacement(entry) {
    const spec = CATALOG.find((s) => s.key === entry.catalogKey);
    if (!spec) return;
    placeAt(spec, entry.x, entry.z, entry.ry);
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
