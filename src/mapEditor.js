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
//   right-click   (no drag) cancel — deselect, cancel a paste, or back out
//                 of Delete/Select to Place, whichever applies
//   , / .         cycle the selected asset (or click a tile in the library)
//   Q / E         rotate the ghost preview, or the Select tool's selection
//   left click    place the real object in Place mode (calls straight into
//                 landmarks.js — what you see is the actual placement
//                 function running live); acts on the current tool otherwise
//   left drag     in Select mode, sweeps a box over several objects at once
//   Backspace     undo the last placement, or delete the Select tool's
//                 current selection if one is active
//   Ctrl+C/X/V    copy / cut / paste the current selection (Select mode) —
//                 paste follows the cursor as a translucent preview of every
//                 copied object until a click (or Ctrl+V again) drops it
//   F9            toggle off ($DEVMODE69xxx / #DEVx also work)
//
// The ghost is the real object, loaded and built the same way it will be
// placed, just translucent — not a solid green stand-in box — with a thin
// wire outline for its footprint, and it's Place mode's alone now: Select
// used to keep it visible too, "ready to place" the moment you tried to
// click something, which read as "the cursor is always holding a building"
// (a real report). Select instead marks its picks with wireframe boxes and
// moves them straight to wherever you click next — no separate preview step.
// The asset library (its own column, on the right) is searchable (search box
// + category tabs above the grid), not a flat scroll — each tile's thumbnail
// is a real render of that object, snapshotted once (off-screen, via a
// render target — never flashed to the visible canvas) and cached.
//
// Three tools, one active at a time (Place is the default with neither
// button on):
//   Delete    left-click removes the nearest editor-placed object instead
//             of placing one — same reach as Backspace/Undo, but for any
//             placement nearby, not just the last one.
//   Select    left-click (or a drag-box, for several at once) picks the
//             nearest editor-placed object; a click elsewhere moves the
//             whole selection there, keeping their relative arrangement.
//             If nothing this tool placed is nearby, it raycasts the live
//             scene for something the districts authored instead (item 6) —
//             those get a soft hide/reposition only, since there's no
//             landmarks.js call to rebuild one from if it's deleted outright,
//             and no undo tracking for them. A world object merged into a
//             shared static batch (`merge.js` names those meshes exactly
//             "static-batch") can't be individually isolated at all — that's
//             reported rather than silently failing or moving/hiding
//             everything else sharing that batch.
// Editor-placed objects stay fully undoable/persisted either way; world
// objects picked via Select are a best-effort escape hatch, not a second
// persistence system.
//
// The ghost's ground target follows a simple ray/plane intersection against
// y = 0 from the camera — this game's terrain is flat everywhere placements
// matter, so a full scene raycast isn't needed for placing. Select's own
// clicks and drag-box use a real mouse-position raycast instead
// (`screenToGround`), since picking and dragging a box only make sense at
// the actual cursor, not a fixed center crosshair. Placements are kept in
// their own
// THREE.Group (not batched — an editing session is short and small) and are:
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
  placeParkedCar, placeTruck, placeR2Model,
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
  ...["beatall", "doclorean", "landyroamer", "toyoyo", "tristar"].map((key) => ({
    key: `car:${key}`, label: `Parked car: ${key}`, category: "Vehicles", w: 5, d: 2.2,
    place: (ctx, x, z, ry) => placeParkedCar(ctx, key, x, z, ry),
    code: (x, z, ry) => `placeParkedCar(ctx, "${key}", ${x}, ${z}, ${ry});`,
  })),
  ...["pickup", "truck", "van", "car_b", "car_r", "car_y"].map((key) => ({
    key: `truck:${key}`, label: `Parked truck: ${key}`, category: "Vehicles", w: 6, d: 2.5,
    place: (ctx, x, z, ry) => placeTruck(ctx, key, x, z, ry),
    code: (x, z, ry) => `placeTruck(ctx, "${key}", ${x}, ${z}, ${ry});`,
  })),
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
let CATEGORIES = ["All", ...new Set(CATALOG.map((c) => c.category))];
function recomputeCategories() {
  CATEGORIES = ["All", ...new Set(CATALOG.map((c) => c.category))];
}

function httpBaseFor(wsUrl) {
  if (!wsUrl) return null;
  return wsUrl.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
}

// --------------------------------------------------------- R2 asset library
// The ~450 extracted model files under Z:\GITHUB\_ASSETS never shipped with
// this game — they're a completely separate, un-curated archive of dozens of
// unrelated Unity asset packs, uploaded to a Cloudflare R2 bucket by
// tools/upload-assets-to-r2.sh (see that script's header) and indexed by
// tools/r2-manifest.json, which Cloudflare Pages serves as a plain static
// file since this project's pages_build_output_dir is the repo root. Fetched
// lazily (first editor toggle-on, not module import) and merged into CATALOG
// as one entry per pack, exactly like every curated landmark above — the
// only difference is `place` calls the generic placeR2Model() instead of a
// bespoke placeXxx(), since there's no per-pack knowledge to hand-tune here.
const R2_MANIFEST_URL = "./tools/r2-manifest.json";
const MODEL_EXT_PRIORITY = { glb: 0, gltf: 1, fbx: 2, obj: 3 };
let r2ManifestPromise = null;
function loadR2Manifest() {
  if (r2ManifestPromise) return r2ManifestPromise;
  r2ManifestPromise = fetch(R2_MANIFEST_URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`manifest HTTP ${r.status}`))))
    .then((entries) => addR2CatalogEntries(entries))
    .catch((err) => { console.warn("[mapEditor] R2 asset manifest unavailable:", err); });
  return r2ManifestPromise;
}
// A pack ships the same model twice more often than not (an .fbx plus a
// re-exported .glb of the identical mesh) — GLB wins when both exist since
// it's self-contained (no Textures/ folder to redirect, unlike loose FBX),
// so this keeps one catalog entry per real model instead of two duplicates.
function addR2CatalogEntries(entries) {
  const best = new Map();
  for (const e of entries) {
    const m = /\.([a-z0-9]+)$/i.exec(e.file);
    const ext = m ? m[1].toLowerCase() : "";
    const rank = MODEL_EXT_PRIORITY[ext];
    if (rank === undefined) continue;   // texture/material files etc. shouldn't be in here, but skip defensively
    const stem = e.file.slice(0, e.file.length - ext.length - 1);
    const dedupeKey = `${e.category}|${e.pack}|${stem}`;
    const prev = best.get(dedupeKey);
    if (!prev || rank < prev.rank) best.set(dedupeKey, { url: e.url, pack: e.pack, category: e.category, stem, rank });
  }
  const existingKeys = new Set(CATALOG.map((c) => c.key));
  for (const [dedupeKey, e] of best) {
    const key = `r2:${dedupeKey}`;
    if (existingKeys.has(key)) continue;
    CATALOG.push({
      key,
      label: `${e.pack} \u00b7 ${e.stem}`,
      category: `R2: ${e.category}`,
      w: 6, d: 6,
      dynamicSize: true,   // measured from the real model once it loads — see buildCleanPreview()
      place: (pctx, x, z, ry) => placeR2Model(pctx, e.url, x, z, ry),
      code: (x, z, ry) => `placeR2Model(ctx, ${JSON.stringify(e.url)}, ${x}, ${z}, ${ry});`,
    });
  }
  recomputeCategories();
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
  const selectedSet = new Set();   // placement entries (this tool's own) currently selected — 0, 1 or many
  const selectedWorld = new Set(); // { root, name } world-authored Object3Ds currently selected (see item 6)
  let clipboard = null;      // [{ kind: "catalog", catalogKey, dx, dz, dry } | { kind: "world", root, dx, dz, dry, baseY }], relative to a copy/cut anchor, or null
  let pasting = false;       // true while a clipboard paste-preview is following the cursor
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
    // R2 library entries have no authored footprint (no per-pack size table
    // like the curated CATALOG entries above) — measure the real model once
    // it loads and correct the placeholder 6x6 ghost/blocker to match.
    if (spec.dynamicSize) {
      waitForContent(root).then(() => {
        if (!hasContent(root)) return;
        const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
        spec.w = Math.max(0.5, size.x);
        spec.d = Math.max(0.5, size.z);
        if (CATALOG[catalogIndex] === spec) rebuildGhost();
      });
    }
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
  makeBtn(selectRow, "Copy", () => copySelection(false));
  makeBtn(selectRow, "Cut", () => copySelection(true));
  makeBtn(selectRow, "AI Clone", () => aiCloneSelection());
  makeBtn(selectRow, "Delete selected", () => deleteSelection());
  makeBtn(selectRow, "Deselect", () => clearSelection());

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
  let tabButtons = [];
  // Rebuilt (not just filled once) because the R2 manifest adds whole new
  // categories after the editor's already open — CATEGORIES at that point
  // has more entries than it did when the tab row was first drawn.
  function buildTabs() {
    tabRow.innerHTML = "";
    tabButtons = CATEGORIES.map((cat) => {
      const b = document.createElement("button");
      b.textContent = cat;
      b.style.cssText = "font:11px Consolas,monospace;padding:3px 7px;cursor:pointer;border-radius:4px;" +
        "background:#0c2318;color:#8fd9b6;border:1px solid #1c5a3e;";
      b.onclick = () => { activeCategory = cat; filterPicker(); highlightTabs(); };
      tabRow.appendChild(b);
      return { cat, b };
    });
    highlightTabs();
  }
  function highlightTabs() {
    for (const { cat, b } of tabButtons) {
      const on = cat === activeCategory;
      b.style.borderColor = on ? "#38ff9e" : "#1c5a3e";
      b.style.color = on ? "#c9ffdf" : "#8fd9b6";
    }
  }
  buildTabs();

  const picker = document.createElement("div");
  picker.style.cssText = "box-sizing:border-box;display:none;" +
    "grid-template-columns:repeat(4, 1fr);gap:6px;width:100%;" +
    "background:rgba(0,20,10,.85);border:1px solid #38ff9e;border-radius:6px;padding:8px;pointer-events:auto;";
  rightCol.appendChild(picker);
  const pagerRow = document.createElement("div");
  pagerRow.style.cssText = "box-sizing:border-box;display:none;justify-content:space-between;align-items:center;" +
    "gap:6px;width:100%;font:11px Consolas,monospace;color:#8fd9b6;" +
    "background:rgba(0,20,10,.85);border:1px solid #38ff9e;border-radius:6px;padding:4px 8px;";
  rightCol.appendChild(pagerRow);
  const pageLabel = document.createElement("span");
  pagerRow.appendChild(pageLabel);
  const pagerBtns = document.createElement("div");
  pagerBtns.style.cssText = "display:flex;gap:6px;";
  pagerRow.appendChild(pagerBtns);
  const prevBtn = makeBtn(pagerBtns, "‹ Prev", () => { if (page > 0) { page--; renderPage(); } });
  const nextBtn = makeBtn(pagerBtns, "Next ›", () => { if (page < pageCount() - 1) { page++; renderPage(); } });

  // Every asset the library can ever show, filtered down to what the search
  // box + active tab currently match — the picker DOM only ever holds one
  // page's worth of cells at a time. Item 1's explicit ask ("if the
  // container can't list all the items there needs to be a way to go to
  // next page") matters once the R2 library is merged in: a flat scrollable
  // grid of 450+ real models (each a live thumbnail render) is what this
  // replaces, not a hypothetical — the curated catalog alone never needed it.
  const PAGE_SIZE = 48;
  let filteredIndices = [];
  let page = 0;
  function pageCount() { return Math.max(1, Math.ceil(filteredIndices.length / PAGE_SIZE)); }
  function computeFiltered() {
    const q = searchInput.value.trim().toLowerCase();
    filteredIndices = [];
    CATALOG.forEach((spec, i) => {
      const catOk = activeCategory === "All" || spec.category === activeCategory;
      const textOk = !q || spec.label.toLowerCase().includes(q) || spec.category.toLowerCase().includes(q);
      if (catOk && textOk) filteredIndices.push(i);
    });
    page = Math.min(page, pageCount() - 1);
  }
  let pickerCells = [];   // [{ i, cell }] — i is the CATALOG index this rendered cell represents
  function selectCatalog(i) {
    catalogIndex = i;
    rebuildGhost();
    highlightPicker();
  }
  function renderPage() {
    picker.innerHTML = "";
    pickerCells = [];
    const start = page * PAGE_SIZE;
    for (const i of filteredIndices.slice(start, start + PAGE_SIZE)) {
      const spec = CATALOG[i];
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
      pickerCells.push({ i, cell });
      // Only this page's tiles render a thumbnail — with the R2 library
      // merged in that's a real network fetch + off-screen render per tile,
      // and 450+ of those firing at once on first open is exactly what
      // pagination exists to avoid.
      snapshotThumbnail(spec).then((url) => { if (url) cell.style.backgroundImage = `url(${url})`; });
    }
    highlightPicker();
    pageLabel.textContent = `${filteredIndices.length} match${filteredIndices.length === 1 ? "" : "es"} · page ${page + 1}/${pageCount()}`;
    prevBtn.disabled = page === 0;
    nextBtn.disabled = page >= pageCount() - 1;
  }
  function highlightPicker() {
    for (const { i, cell } of pickerCells) {
      const on = i === catalogIndex;
      cell.style.borderColor = on ? "#38ff9e" : "#1c5a3e";
      cell.style.boxShadow = on ? "0 0 6px #38ff9e" : "none";
    }
  }
  // Combines the search text and the active category tab, resets to page 1,
  // and re-renders — call whenever the query, the tab, or CATALOG itself
  // (the R2 manifest landing) changes.
  function filterPicker() {
    computeFiltered();
    renderPage();
  }
  let pickerBuilt = false;
  function ensurePickerBuilt() {
    if (pickerBuilt) return;
    pickerBuilt = true;
    filterPicker();
  }

  // ---------------------------------------------------------------- export box
  const exportBox = document.createElement("textarea");
  exportBox.style.cssText = "position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:50;" +
    "width:600px;height:400px;font:12px/1.4 Consolas,monospace;background:#08140f;color:#c9ffdf;" +
    "border:1px solid #38ff9e;border-radius:6px;padding:10px;display:none;";
  exportBox.readOnly = true;
  exportBox.onclick = () => { exportBox.select(); };
  exportBox.addEventListener("keydown", (e) => { if (e.key === "Escape") exportBox.style.display = "none"; });
  document.body.appendChild(exportBox);

  // ------------------------------------------------------------- context menu
  const ctxMenu = document.createElement("div");
  ctxMenu.style.cssText = "position:fixed;z-index:90;background:#111;border:1px solid #555;border-radius:4px;padding:4px;display:none;flex-direction:column;gap:4px;min-width:120px;box-shadow:0 4px 12px rgba(0,0,0,0.5);";
  document.body.appendChild(ctxMenu);

  const editDesignBtn = document.createElement("button");
  editDesignBtn.textContent = "Edit design";
  editDesignBtn.style.cssText = "background:transparent;border:none;color:#fff;text-align:left;padding:6px 12px;cursor:pointer;border-radius:2px;";
  editDesignBtn.onmouseover = () => editDesignBtn.style.background = "#333";
  editDesignBtn.onmouseout = () => editDesignBtn.style.background = "transparent";
  editDesignBtn.onclick = () => {
    ctxMenu.style.display = "none";
    openColorEditor();
  };
  ctxMenu.appendChild(editDesignBtn);

  // ------------------------------------------------------------- color editor
  const colorEditor = document.createElement("div");
  colorEditor.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%, -50%);z-index:91;background:#111;border:1px solid #555;padding:16px;border-radius:6px;display:none;flex-direction:column;gap:12px;width:300px;box-shadow:0 8px 24px rgba(0,0,0,0.7);color:#fff;font:14px sans-serif;";
  document.body.appendChild(colorEditor);
  
  colorEditor.innerHTML = `
    <h3 style="margin:0;font-size:16px;border-bottom:1px solid #444;padding-bottom:8px;">Edit Design</h3>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <label>Hue <span id="ce-h-val">0</span>°</label>
      <input type="range" id="ce-h" min="0" max="360" value="0">
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <label>Saturation <span id="ce-s-val">100</span>%</label>
      <input type="range" id="ce-s" min="0" max="200" value="100">
    </div>
    <div style="display:flex;flex-direction:column;gap:4px;">
      <label>Lightness <span id="ce-l-val">100</span>%</label>
      <input type="range" id="ce-l" min="0" max="200" value="100">
    </div>
    <div style="display:flex;gap:8px;margin-top:8px;">
      <button id="ce-apply" style="flex:1;padding:6px;background:#38ff9e;color:#000;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">Apply</button>
      <button id="ce-cancel" style="flex:1;padding:6px;background:#444;color:#fff;border:none;border-radius:4px;cursor:pointer;">Cancel</button>
    </div>
  `;
  
  let ceTarget = null;
  let ceOriginalMats = new Map();

  function applyHSL(h, s, l) {
    if (!ceTarget) return;
    for (const entry of ceTarget) {
      for (const obj of entry.created || []) {
        obj.traverse(o => {
          if (o.isMesh && o.material) {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach(m => {
              if (ceOriginalMats.has(m)) {
                const orig = ceOriginalMats.get(m);
                const origHSL = {};
                orig.color.getHSL(origHSL);
                m.color.setHSL((origHSL.h + h / 360) % 1, Math.min(1, Math.max(0, origHSL.s * (s / 100))), Math.min(1, Math.max(0, origHSL.l * (l / 100))));
              }
            });
          }
        });
      }
    }
  }

  function openColorEditor() {
    if (!selectedSet.size) return;
    ceTarget = [...selectedSet];
    ceOriginalMats.clear();
    
    for (const entry of ceTarget) {
      for (const obj of entry.created || []) {
        obj.traverse(o => {
          if (o.isMesh && o.material) {
            if (Array.isArray(o.material)) {
              o.material = o.material.map(m => {
                if (!ceOriginalMats.has(m)) {
                  const cloned = m.clone();
                  ceOriginalMats.set(cloned, m.clone());
                  return cloned;
                }
                return m;
              });
            } else {
              if (!ceOriginalMats.has(o.material)) {
                const cloned = o.material.clone();
                ceOriginalMats.set(cloned, o.material.clone());
                o.material = cloned;
              }
            }
          }
        });
      }
    }

    const hIn = colorEditor.querySelector("#ce-h");
    const sIn = colorEditor.querySelector("#ce-s");
    const lIn = colorEditor.querySelector("#ce-l");
    const hVal = colorEditor.querySelector("#ce-h-val");
    const sVal = colorEditor.querySelector("#ce-s-val");
    const lVal = colorEditor.querySelector("#ce-l-val");
    
    hIn.value = 0; sIn.value = 100; lIn.value = 100;
    hVal.textContent = 0; sVal.textContent = 100; lVal.textContent = 100;

    const onInput = () => {
      hVal.textContent = hIn.value;
      sVal.textContent = sIn.value;
      lVal.textContent = lIn.value;
      applyHSL(parseInt(hIn.value, 10), parseInt(sIn.value, 10), parseInt(lIn.value, 10));
    };
    hIn.oninput = onInput; sIn.oninput = onInput; lIn.oninput = onInput;

    colorEditor.querySelector("#ce-apply").onclick = () => {
      colorEditor.style.display = "none";
      const dh = parseInt(hIn.value, 10), ds = parseInt(sIn.value, 10), dl = parseInt(lIn.value, 10);
      for (const entry of ceTarget) {
        entry.dh = dh; entry.ds = ds; entry.dl = dl;
      }
      persist();
      ceTarget = null;
    };
    colorEditor.querySelector("#ce-cancel").onclick = () => {
      applyHSL(0, 100, 100);
      colorEditor.style.display = "none";
      ceTarget = null;
    };
    
    colorEditor.style.display = "flex";
  }

  function updateHUD() {
    if (!active) return;
    const spec = CATALOG[catalogIndex];
    const modeLine = mode === "delete" ? "  [DELETE MODE]" : mode === "select" ? "  [SELECT MODE]" : "";
    const n = selectedSet.size + selectedWorld.size;
    const selLine = n ? `selected: ${n}\n` : "";
    const hint = pasting
      ? `click or Ctrl+V paste · right-click cancel`
      : mode === "select"
        ? `click select · drag box-select · Q/E rotate`
        : `, / . cycle · Q/E rotate · click place`;
    panel.textContent =
      `DEV MODE — MAP EDITOR\n` +
      `asset: ${spec.label} (${catalogIndex + 1}/${CATALOG.length})\n` +
      `placed: ${placements.length}${modeLine}\n` +
      selLine +
      `WASD pan · wheel zoom · right-drag orbit\n` +
      `${hint}\n` +
      `Backspace undo/delete · right-click cancel\n` +
      `Ctrl+C/X/V copy/cut/paste · F9 or #DEVx exit`;
  }

  // -------------------------------------------------------- cheat code buf
  let buf = "";
  function onKeydownGlobal(e) {
    buf = (buf + e.key).slice(-CHEAT_MAXLEN);
    const lower = buf.toLowerCase();
    if (CHEAT_CODES.some((c) => lower.endsWith(c.toLowerCase()))) { toggle(); buf = ""; }
    if (!active) return;
    if (e.code === "F9") { e.preventDefault(); toggle(); }
    else if (e.code === "Escape") { e.preventDefault(); cancelAction(); }
    else if (e.code === "Comma") { selectCatalog((catalogIndex - 1 + CATALOG.length) % CATALOG.length); }
    else if (e.code === "Period") { selectCatalog((catalogIndex + 1) % CATALOG.length); }
    else if (e.code === "KeyQ") { if (mode === "select" && (selectedSet.size || selectedWorld.size)) rotateSelection(-0.2); else ry -= 0.2; }
    else if (e.code === "KeyE") { if (mode === "select" && (selectedSet.size || selectedWorld.size)) rotateSelection(0.2); else ry += 0.2; }
    else if (e.code === "Backspace") { e.preventDefault(); if (mode === "select" && (selectedSet.size || selectedWorld.size)) deleteSelection(); else undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.code === "KeyC") { e.preventDefault(); copySelection(false); }
    else if ((e.ctrlKey || e.metaKey) && e.code === "KeyX") { e.preventDefault(); copySelection(true); }
    else if ((e.ctrlKey || e.metaKey) && e.code === "KeyV") {
      e.preventDefault();
      if (pasting) { const g = screenToGround(mouseClientX, mouseClientY); if (g) commitPaste(g.x, g.z); }
      else startPaste();
    }
  }
  window.addEventListener("keydown", onKeydownGlobal);

  // ---------------------------------------------------- mouse-ground raycast
  // Place/Delete keep the old center-crosshair aim (ghost.position, driven by
  // camera direction in update() below) — that muscle memory stays intact.
  // Select needs real cursor freedom (you point at a specific thing, and drag
  // a box across several), so it gets its own screen-to-ground raycast.
  const _ray = new THREE.Raycaster();
  const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const _ndc = new THREE.Vector2();
  const _hitPoint = new THREE.Vector3();
  function screenToGround(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    _ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    return _ray.ray.intersectPlane(_groundPlane, _hitPoint) ? { x: _hitPoint.x, z: _hitPoint.z } : null;
  }
  let mouseClientX = 0, mouseClientY = 0;
  window.addEventListener("mousemove", (e) => { mouseClientX = e.clientX; mouseClientY = e.clientY; });

  function onUI(target) { return leftCol.contains(target) || rightCol.contains(target); }

  // -------------------------------------------------------- click / actions
  // A plain click (press+release with barely any movement) place/delete/
  // selects; a left-drag in Select mode instead sweeps a box. Both live here
  // since they share the same mousedown/mouseup pair.
  const CLICK_SLOP = 6;   // px of movement that still counts as "didn't drag"
  let leftDownClient = null;
  let rightDownClient = null;
  let boxSelecting = false;

  const dragBox = document.createElement("div");
  dragBox.style.cssText = "position:fixed;z-index:45;border:1px solid #66c8ff;background:rgba(102,200,255,.15);display:none;pointer-events:none;";
  document.body.appendChild(dragBox);

  function updateDragBox(x0, y0, x1, y1) {
    dragBox.style.left = `${Math.min(x0, x1)}px`;
    dragBox.style.top = `${Math.min(y0, y1)}px`;
    dragBox.style.width = `${Math.abs(x1 - x0)}px`;
    dragBox.style.height = `${Math.abs(y1 - y0)}px`;
  }

  window.addEventListener("mousedown", (e) => {
    if (!active) return;
    if (e.target !== editDesignBtn && !colorEditor.contains(e.target)) ctxMenu.style.display = "none";
    if (e.button === 0) {
      if (onUI(e.target) || exportBox.style.display !== "none" || colorEditor.style.display !== "none") return;
      leftDownClient = { x: e.clientX, y: e.clientY };
      boxSelecting = false;
    } else if (e.button === 2) {
      rightDownClient = { x: e.clientX, y: e.clientY };
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!active || !leftDownClient || mode !== "select" || pasting) return;
    const dx = e.clientX - leftDownClient.x, dy = e.clientY - leftDownClient.y;
    if (!boxSelecting && Math.hypot(dx, dy) > CLICK_SLOP) {
      boxSelecting = true;
      dragBox.style.display = "block";
    }
    if (boxSelecting) {
      updateDragBox(leftDownClient.x, leftDownClient.y, e.clientX, e.clientY);
    }
  });

  window.addEventListener("mouseup", (e) => {
    if (e.button === 0 && leftDownClient) {
      const moved = Math.hypot(e.clientX - leftDownClient.x, e.clientY - leftDownClient.y) > CLICK_SLOP;
      if (boxSelecting) {
        finishBoxSelect(leftDownClient.x, leftDownClient.y, e.clientX, e.clientY, e.shiftKey);
      } else if (!moved && active && !onUI(e.target) && exportBox.style.display === "none") {
        handleClick(e);
      }
      leftDownClient = null;
      boxSelecting = false;
      dragBox.style.display = "none";
    } else if (e.button === 2) {
      // A plain right-click (no drag) is "back out of whatever I'm doing" —
      // right-drag (see the free-fly camera below) still orbits the camera,
      // since a real drag never satisfies this distance check.
      if (active && rightDownClient && Math.hypot(e.clientX - rightDownClient.x, e.clientY - rightDownClient.y) <= CLICK_SLOP) {
        if (selectedSet.size) {
          ctxMenu.style.left = e.clientX + "px";
          ctxMenu.style.top = e.clientY + "px";
          ctxMenu.style.display = "flex";
        } else {
          cancelAction();
        }
      }
      rightDownClient = null;
    }
  });

  function handleClick(e) {
    if (pasting) {
      const g = screenToGround(e.clientX, e.clientY);
      if (g) commitPaste(g.x, g.z);
      return;
    }
    if (mode === "delete") { deleteNear(ghost.position.x, ghost.position.z); return; }
    if (mode === "select") {
      const g = screenToGround(e.clientX, e.clientY);
      if (!g) return;
      if (!selectedSet.size && !selectedWorld.size) selectNear(g.x, g.z, e.shiftKey);
      else moveSelectionTo(g.x, g.z);
      return;
    }
    place();
  }

  // One "back out" gesture for everything: cancel a pending paste, else drop
  // the current selection, else fall back from Delete/Select to Place.
  function cancelAction() {
    if (pasting) { cancelPaste(); return; }
    if (selectedSet.size || selectedWorld.size) { clearSelection(); return; }
    if (mode !== "place") setMode("place");
  }

  // Every placement's ground point, projected to screen space, for box-select.
  function projectToScreen(x, z) {
    const v = new THREE.Vector3(x, 0, z).project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (v.x * 0.5 + 0.5) * rect.width, y: rect.top + (-v.y * 0.5 + 0.5) * rect.height };
  }
  // Bug fix (human report 2026-09-20): a drag-box only ever tested `placements`
  // (this tool's own placed objects) against the rectangle, so dragging over
  // already-standing, district-authored buildings selected nothing. Those don't
  // have a flat x/z list to project the way `placements` does, so grid-sample
  // raycastWorldObject() across the rectangle instead -- bounded, and it only
  // runs once per completed drag, not per frame.
  const BOX_SAMPLE_STEP = 22;   // px between sample points
  const BOX_SAMPLE_MAX = 40;    // cap grid size for a screen-spanning drag
  function finishBoxSelect(x0, y0, x1, y1, additive) {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    if (!additive) clearSelection();
    for (const entry of placements) {
      const p = projectToScreen(entry.x, entry.z);
      if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) selectedSet.add(entry);
    }
    const cols = Math.min(BOX_SAMPLE_MAX, Math.max(1, Math.round((maxX - minX) / BOX_SAMPLE_STEP)));
    const rows = Math.min(BOX_SAMPLE_MAX, Math.max(1, Math.round((maxY - minY) / BOX_SAMPLE_STEP)));
    const seen = new Set([...selectedWorld].map((w) => w.root));
    for (let iy = 0; iy <= rows; iy++) {
      for (let ix = 0; ix <= cols; ix++) {
        const sx = minX + (cols ? (ix / cols) * (maxX - minX) : 0);
        const sy = minY + (rows ? (iy / rows) * (maxY - minY) : 0);
        const hit = raycastWorldObject(sx, sy);
        if (!hit || hit.batched || !hit.root || seen.has(hit.root)) continue;
        seen.add(hit.root);
        selectedWorld.add(hit);
      }
    }
    onSelectionChanged();
  }
  window.addEventListener("contextmenu", (e) => { if (active) e.preventDefault(); });

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
  // Three mutually exclusive tools. Only Place shows the placement ghost —
  // Select used to keep it visible too, which is exactly the "cursor is
  // always holding a building" complaint: trying to click something to
  // select it dropped a new one instead. Select now shows nothing until you
  // actually have a selection, at which point a wireframe box per selected
  // object marks it in place — moves commit straight to the click point,
  // there's no separate "preview then confirm" step to get confused by.
  function updateGhostColor() {
    ghostEdgeMat.color.setHex(mode === "delete" ? 0xff6b6b : 0x38ff9e);
  }
  function setMode(next) {
    mode = next;
    deleteBtn.textContent = mode === "delete" ? "Delete: ON" : "Delete: OFF";
    deleteBtn.style.background = mode === "delete" ? "#3a0c0c" : "#0c3324";
    deleteBtn.style.borderColor = mode === "delete" ? "#ff6b6b" : "#38ff9e";
    selectBtn.textContent = mode === "select" ? "Select: ON" : "Select: OFF";
    selectBtn.style.background = mode === "select" ? "#0c2a3a" : "#0c3324";
    selectBtn.style.borderColor = mode === "select" ? "#66c8ff" : "#38ff9e";
    if (mode !== "select") clearSelection();
    ghost.visible = active && mode === "place" && !pasting;
    updateGhostColor();
    updateHUD();
  }

  // ------------------------------------------------------- selection (multi)
  // Two parallel sets: `selectedSet` for this tool's own placements (full
  // move/rotate/delete, tracked and undoable like everything else it
  // places), `selectedWorld` for objects the districts authored at boot
  // (item 6 — see raycastWorldObject). A world object only ever gets a
  // soft hide/reposition: there's no "undo" for content this tool didn't
  // create, and no clean way to fully reconstruct it if deleted outright.
  const selectionMarkers = new THREE.Group();
  scene.add(selectionMarkers);
  const selectionBoxMat = new THREE.LineBasicMaterial({ color: 0xffe066 });
  function rebuildSelectionMarkers() {
    while (selectionMarkers.children.length) {
      const m = selectionMarkers.children.pop();
      m.geometry.dispose();
    }
    for (const entry of selectedSet) addMarkerAt(entry.x, entry.z, markerSizeFor(entry.catalogKey), entry.ry);
    for (const w of selectedWorld) {
      const box = new THREE.Box3().setFromObject(w.root);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      addMarkerAt(center.x, center.z, [size.x + 1, size.y + 1, size.z + 1], 0, center.y - size.y / 2);
    }
  }
  function markerSizeFor(catalogKey) {
    const spec = CATALOG.find((s) => s.key === catalogKey);
    const w = spec ? spec.w : 6, d = spec ? spec.d : 6;
    return [w + 0.6, Math.max(w, d, 4) + 0.6, d + 0.6];
  }
  function addMarkerAt(x, z, size, markerRy, baseY = 0) {
    const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
    geo.translate(0, size[1] / 2, 0);
    const box = new THREE.LineSegments(new THREE.EdgesGeometry(geo), selectionBoxMat);
    box.position.set(x, baseY, z);
    box.rotation.y = markerRy || 0;
    selectionMarkers.add(box);
  }
  function onSelectionChanged() {
    rebuildSelectionMarkers();
    const n = selectedSet.size + selectedWorld.size;
    selectRow.style.display = n ? "flex" : "none";
    selectStatus.style.display = n || mode === "select" ? "block" : "none";
    if (n === 1 && selectedSet.size === 1) {
      const [entry] = selectedSet;
      const spec = CATALOG.find((s) => s.key === entry.catalogKey);
      selectStatus.textContent = `selected ${spec ? spec.label : entry.catalogKey} — click to move here, Q/E to rotate`;
    } else if (n === 1 && selectedWorld.size === 1) {
      const [w] = selectedWorld;
      selectStatus.textContent = `selected world object "${w.name}" — click to move, Backspace to hide (can't be undone this session)`;
    } else if (n > 1) {
      selectStatus.textContent = `${n} selected — click to move the group here, Ctrl+C/X to copy/cut, Backspace to delete`;
    } else if (mode === "select") {
      selectStatus.textContent = "click something to select it, or drag a box over several";
    }
  }
  function clearSelection() {
    selectedSet.clear();
    selectedWorld.clear();
    onSelectionChanged();
  }
  function selectionCenter() {
    const pts = [...[...selectedSet].map((e) => [e.x, e.z]), ...[...selectedWorld].map((w) => [w.root.position.x, w.root.position.z])];
    if (!pts.length) return null;
    const x = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const z = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return { x, z };
  }

  // Select tool: try this tool's own placements first (exact reach as
  // Delete), then fall back to a real raycast against the live scene for
  // something the districts authored (item 6).
  function selectNear(x, z, additive) {
    if (!additive) clearSelection();
    let best = -1, bestDist = Infinity;
    placements.forEach((entry, i) => {
      const spec = CATALOG.find((s) => s.key === entry.catalogKey);
      const radius = (spec ? Math.max(spec.w, spec.d) : 6) / 2 + 1.5;
      const d = Math.hypot(entry.x - x, entry.z - z);
      if (d <= radius && d < bestDist) { bestDist = d; best = i; }
    });
    if (best !== -1) { selectedSet.add(placements[best]); onSelectionChanged(); return; }
    const hit = raycastWorldObject(mouseClientX, mouseClientY);
    if (hit && hit.batched) {
      selectStatus.textContent = "that's merged into a shared batch for performance — can't isolate it here";
      selectStatus.style.display = "block";
      return;
    }
    if (hit) { selectedWorld.add(hit); onSelectionChanged(); return; }
    selectStatus.textContent = "nothing nearby to select";
    selectStatus.style.display = "block";
  }

  // Moves the whole current selection so its centroid lands at (x, z) —
  // editor placements are destroyed and recreated at their new spot (the
  // established pattern, since an arbitrary created object graph isn't safe
  // to live-transform); world objects are just repositioned in place, since
  // there's no placement function to rebuild them from.
  function moveSelectionTo(x, z) {
    const center = selectionCenter();
    if (!center) return;
    const dx = x - center.x, dz = z - center.z;
    const moved = new Set();
    for (const entry of selectedSet) {
      const spec = CATALOG.find((s) => s.key === entry.catalogKey);
      if (!spec) continue;
      destroyPlacement(entry);
      const i = placements.indexOf(entry);
      if (i !== -1) placements.splice(i, 1);
      moved.add(placeAt(spec, entry.x + dx, entry.z + dz, entry.ry));
    }
    selectedSet.clear();
    for (const e of moved) selectedSet.add(e);
    for (const w of selectedWorld) { w.root.position.x += dx; w.root.position.z += dz; }
    onSelectionChanged();
    updateHUD();
    persist();
  }
  function rotateSelection(delta) {
    const moved = new Set();
    for (const entry of selectedSet) {
      const spec = CATALOG.find((s) => s.key === entry.catalogKey);
      if (!spec) continue;
      destroyPlacement(entry);
      const i = placements.indexOf(entry);
      if (i !== -1) placements.splice(i, 1);
      moved.add(placeAt(spec, entry.x, entry.z, entry.ry + delta));
    }
    selectedSet.clear();
    for (const e of moved) selectedSet.add(e);
    for (const w of selectedWorld) w.root.rotation.y += delta;
    onSelectionChanged();
    updateHUD();
    persist();
  }
  function deleteSelection() {
    for (const entry of selectedSet) {
      destroyPlacement(entry);
      const i = placements.indexOf(entry);
      if (i !== -1) placements.splice(i, 1);
    }
    for (const w of selectedWorld) {
      if (w.isBatchedPart) continue; // cannot be pulled out of batch
      w.root.visible = false;   // soft hide — see the header comment
    }
    clearSelection();
    updateHUD();
    persist();
  }

  // --------------------------------------------- world-object raycast (item 6)
  // Finds whatever the districts built at (clientX, clientY), for Select to
  // fall back to when nothing this tool placed is nearby. `merge.js` names
  // every statically-batched mesh exactly "static-batch" — hitting one means
  // the real object is merged with potentially thousands of others into one
  // shared draw call, and there is no per-source-object seam left to isolate
  // it by; reported as such rather than silently no-op'ing or (worse) hiding
  // the whole shared batch. Anything else still has its own Object3D and can
  // be repositioned or hidden.
  function isEditorPlaced(root) {
    return placements.some((p) => (p.created || []).includes(root));
  }
  function raycastWorldObject(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    _ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    _ray.setFromCamera(_ndc, camera);
    const hits = _ray.intersectObjects(scene.children, true);
    for (const hit of hits) {
      let o = hit.object;
      if (isDescendantOf(o, ghost) || isDescendantOf(o, selectionMarkers) || isDescendantOf(o, pastePreviewGroup)) continue;
      
      let root = o;
      let batchedPart = null;
      
      let cur = o;
      while (cur) {
        if (cur.name === "static-batch") {
           if (cur.userData.batchParts && hit.faceIndex != null) {
              const idx = hit.faceIndex * 3;
              const part = cur.userData.batchParts.find(p => idx >= p.start && idx < p.start + p.count);
              if (part) {
                 batchedPart = part.mesh;
              }
           }
           if (batchedPart) break;
           return { batched: true };
        }
        if (!cur.parent || cur.parent === scene) {
           root = cur;
           break;
        }
        cur = cur.parent;
      }
      
      if (batchedPart) {
         return { root: batchedPart, name: batchedPart.name || "batched object", isBatchedPart: true };
      }
      if (isEditorPlaced(root)) continue;   // selectNear() already covers this one
      return { root, name: root.name || o.name || "unnamed object" };
    }
    return null;
  }
  function isDescendantOf(o, ancestor) {
    for (let cur = o; cur; cur = cur.parent) if (cur === ancestor) return true;
    return false;
  }

  // -------------------------------------------------- clipboard (copy/cut/paste)
  // Stores the current selection's shape (catalogKey + offset from its own
  // centroid) so a paste can drop it anywhere. World objects can't be
  // *copied* (there's no landmarks.js call that recreates one from scratch),
  // but Cut doesn't need to recreate anything -- it's the same live root,
  // just relocated -- so a world-object Cut carries the root reference itself
  // (bug fix, human report 2026-09-20: Cut on an already-placed/world building
  // used to silently no-op, since copySelection() only ever looked at
  // `selectedSet`, this tool's own placements; the selection stayed put and a
  // second click teleported it straight to the click point instead of
  // following the cursor as a holographic preview like every other cut/paste).
  // Per the human's own spec: Ctrl+C/X puts the copy straight into the
  // cursor as a holographic preview, ready to click-place — not a separate
  // "now press Ctrl+V" step.
  function copySelection(cut) {
    if (!selectedSet.size && !selectedWorld.size) return;
    if (!cut && !selectedSet.size) {
      // Check if we have batched parts that CAN be copied
      const hasOnlyUncopyables = [...selectedWorld].every(w => !w.isBatchedPart);
      if (hasOnlyUncopyables) {
        selectStatus.textContent = "unbatched world objects can't be copied, only moved with Cut";
        selectStatus.style.display = "block";
        return;
      }
    }
    
    if (cut) {
       for (const w of selectedWorld) {
          if (w.isBatchedPart) {
             selectStatus.textContent = "cannot cut a batched object, you can only copy it";
             selectStatus.style.display = "block";
             return;
          }
       }
    }

    const center = selectionCenter();
    const items = [...selectedSet].map((e) => ({ kind: "catalog", catalogKey: e.catalogKey, dx: e.x - center.x, dz: e.z - center.z, dry: e.ry }));
    if (cut) {
      for (const w of selectedWorld) items.push({ kind: "world", root: w.root, dx: w.root.position.x - center.x, dz: w.root.position.z - center.z, dry: w.root.rotation.y, baseY: w.root.position.y });
    } else {
      for (const w of selectedWorld) {
        if (w.isBatchedPart) {
          items.push({ kind: "world-copy", original: w.root, dx: w.root.position.x - center.x, dz: w.root.position.z - center.z, dry: w.root.rotation.y, baseY: w.root.position.y });
        }
      }
    }
    
    if (!items.length) return;
    clipboard = items;
    // deleteSelection() already does exactly the right thing for both kinds:
    // destroys+forgets the catalog entries, soft-hides the world roots (never a
    // real delete for those -- same rule as Backspace).
    if (cut) deleteSelection();
    startPaste();
  }
  const pastePreviewGroup = new THREE.Group();
  scene.add(pastePreviewGroup);
  function startPaste() {
    if (!clipboard || !clipboard.length) return;
    pasting = true;
    ghost.visible = false;
    while (pastePreviewGroup.children.length) pastePreviewGroup.remove(pastePreviewGroup.children[0]);
    for (const item of clipboard) {
      let preview;
      if (item.kind === "world" || item.kind === "world-copy") {
        preview = (item.root || item.original).clone(true);
        preview.traverse((o) => {
          if (o.isMesh && o.material) o.material = Array.isArray(o.material) ? o.material.map(ghostifyMaterial) : ghostifyMaterial(o.material);
        });
        preview.position.set(item.dx, item.baseY, item.dz);
      } else {
        const spec = CATALOG.find((s) => s.key === item.catalogKey);
        if (!spec) continue;
        preview = buildGhostPreview(spec).clone(true);
        preview.position.set(item.dx, 0, item.dz);
      }
      preview.rotation.y = item.dry;
      pastePreviewGroup.add(preview);
    }
    selectStatus.textContent = `${clipboard.some((i) => i.kind === "world") ? "moving" : "pasting"} ${clipboard.length} — click or Ctrl+V to drop, right-click to cancel`;
    selectStatus.style.display = "block";
  }
  function cancelPaste() {
    // a cancelled Cut of a world object must reappear where it was -- it was
    // only ever hidden, not destroyed
    if (clipboard) for (const item of clipboard) if (item.kind === "world") item.root.visible = true;
    pasting = false;
    while (pastePreviewGroup.children.length) pastePreviewGroup.remove(pastePreviewGroup.children[0]);
    ghost.visible = active && mode === "place";
    onSelectionChanged();
  }
  function commitPaste(x, z) {
    if (!clipboard) return;
    const placed = new Set();
    const movedWorld = new Set();
    for (const item of clipboard) {
      if (item.kind === "world") {
        item.root.position.set(x + item.dx, item.baseY, z + item.dz);
        item.root.rotation.y = item.dry;
        item.root.visible = true;
        movedWorld.add({ root: item.root, name: item.root.name || "unnamed object" });
      } else if (item.kind === "world-copy") {
        const mesh = item.original;
        const key = `batched:${mesh.name || mesh.uuid}`;
        
        if (!CATALOG.some(c => c.key === key)) {
          CATALOG.push({
            key,
            label: `Extracted: ${mesh.name || "Geometry"}`,
            category: "Extracted",
            w: 6, d: 6,
            dynamicSize: true,
            place: (pctx, px, pz, pry) => {
              const clone = mesh.clone(true);
              clone.position.set(px, item.baseY, pz);
              clone.rotation.y = pry;
              clone.userData = { ...clone.userData, isExtractedClone: true };
              if (pctx.scene) pctx.scene.add(clone);
              if (pctx.props) pctx.props.push(clone);
              return [clone];
            },
            code: (px, pz, pry) => `// Cannot trivially export cloned batched geometry (${key}) at ${px}, ${pz}`,
          });
          recomputeCategories();
        }
        
        const spec = CATALOG.find((s) => s.key === key);
        placed.add(placeAt(spec, x + item.dx, z + item.dz, item.dry));
      } else {
        const spec = CATALOG.find((s) => s.key === item.catalogKey);
        if (!spec) continue;
        placed.add(placeAt(spec, x + item.dx, z + item.dz, item.dry));
      }
    }
    pasting = false;
    while (pastePreviewGroup.children.length) pastePreviewGroup.remove(pastePreviewGroup.children[0]);
    selectedSet.clear();
    selectedWorld.clear();
    for (const e of placed) selectedSet.add(e);
    for (const w of movedWorld) selectedWorld.add(w);
    onSelectionChanged();
    updateHUD();
    persist();   // only the catalog placements are actually persisted -- world-root moves are session-only, same limit Backspace already has
  }

  function toggle() {
    active = !active;
    ghost.visible = active && mode === "place" && !pasting;
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
      ensurePickerBuilt();
      pagerRow.style.display = "flex";
      loadR2Manifest().then(() => { buildTabs(); filterPicker(); });
    } else {
      pagerRow.style.display = "none";
      if (savedFar != null) { camera.far = savedFar; camera.updateProjectionMatrix(); savedFar = null; }
      exportBox.style.display = "none";
      if (pasting) cancelPaste();
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
  function serialize() { return placements.map(({ id, catalogKey, x, z, ry, dh, ds, dl }) => ({ id, catalogKey, x, z, ry, dh, ds, dl })); }
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
    // The curated catalog (~25 entries) always goes in full — the R2 library
    // doesn't: it can run past 400 entries, and sending all of it on every
    // "Ask AI" call would balloon the request and blow past small free-tier
    // models' context for no benefit, since most of it is irrelevant to any
    // one prompt. Keyword-match the prompt against R2 labels instead and
    // send only what could plausibly be meant.
    const promptWords = prompt.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    const r2Matches = promptWords.length
      ? CATALOG.filter((c) => c.key.startsWith("r2:") && promptWords.some((w) => c.label.toLowerCase().includes(w)))
      : [];
    const catalog = CATALOG.filter((c) => !c.key.startsWith("r2:"))
      .concat(r2Matches.slice(0, 40))
      .map((c) => ({ key: c.key, label: c.label, w: c.w, d: c.d }));
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

  async function aiCloneSelection() {
    if (!selectedSet.size && !selectedWorld.size) return;
    if (!httpBase) { selectStatus.textContent = "AI clone needs the server"; selectStatus.style.display = "block"; return; }
    const center = selectionCenter();
    const selection = [...selectedSet].map((e) => ({ kind: "catalog", catalogKey: e.catalogKey, dx: e.x - center.x, dz: e.z - center.z, dry: e.ry }));
    for (const w of selectedWorld) {
      selection.push({ kind: "world", catalogKey: w.name, dx: w.root.position.x - center.x, dz: w.root.position.z - center.z, dry: w.root.rotation.y });
    }
    const prompt = aiInput.value.trim();
    const promptWords = prompt.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
    const r2Matches = promptWords.length
      ? CATALOG.filter((c) => c.key.startsWith("r2:") && promptWords.some((w) => c.label.toLowerCase().includes(w)))
      : [];
    const catalog = CATALOG.filter((c) => !c.key.startsWith("r2:"))
      .concat(r2Matches.slice(0, 40))
      .map((c) => ({ key: c.key, label: c.label, w: c.w, d: c.d }));
    
    selectStatus.textContent = "AI cloning... thinking...";
    selectStatus.style.display = "block";
    try {
      const res = await fetch(`${httpBase}/editor/ai-duplicate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selection, anchor: center, prompt, catalog }),
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
      selectStatus.textContent = placed
        ? `cloned ${placed} items via ${data.model} (world objects replaced with nearest catalog matches if requested)`
        : "AI replied but nothing matched a valid asset";
      if (placed && prompt) aiInput.value = "";
    } catch (err) {
      selectStatus.textContent = String(err.message || err);
    }
  }

  function replayPlacement(entry) {
    const spec = CATALOG.find((s) => s.key === entry.catalogKey);
    if (!spec) return;
    const placed = placeAt(spec, entry.x, entry.z, entry.ry);
    if (entry.dh !== undefined) {
      placed.dh = entry.dh; placed.ds = entry.ds; placed.dl = entry.dl;
      // Because models load async, we poll to apply colors once meshes appear
      const check = setInterval(() => {
        let found = false;
        for (const obj of placed.created) {
          obj.traverse(o => { if (o.isMesh) found = true; });
        }
        if (found) {
          clearInterval(check);
          for (const obj of placed.created) {
            obj.traverse(o => {
              if (o.isMesh && o.material) {
                if (Array.isArray(o.material)) {
                  o.material = o.material.map(m => {
                    const c = m.clone(); const hsl = {}; c.color.getHSL(hsl);
                    c.color.setHSL((hsl.h + placed.dh / 360) % 1, Math.min(1, Math.max(0, hsl.s * (placed.ds / 100))), Math.min(1, Math.max(0, hsl.l * (placed.dl / 100))));
                    return c;
                  });
                } else {
                  const c = o.material.clone(); const hsl = {}; c.color.getHSL(hsl);
                  c.color.setHSL((hsl.h + placed.dh / 360) % 1, Math.min(1, Math.max(0, hsl.s * (placed.ds / 100))), Math.min(1, Math.max(0, hsl.l * (placed.dl / 100))));
                  o.material = c;
                }
              }
            });
          }
          ceTarget = null;
        }
      }, 100);
      setTimeout(() => clearInterval(check), 5000);
    }
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
    if (pasting) {
      const g = screenToGround(mouseClientX, mouseClientY) || { x, z };
      pastePreviewGroup.position.set(g.x, GROUND_Y, g.z);
    }
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
