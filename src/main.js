import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { loadAtlas, AnimatedSprite } from "./sprite.js";
import {
  GFX, TIERS, autoTier, nextTier, initRenderer, createEnvironment,
  createComposer, createGovernor, realize, surface, MIST,
} from "./graphics.js";
import { addLamp, createHeadlights, createWetRoads, updateFx } from "./fx.js";
import { BlockerGrid } from "./spatial.js";
import { createSoundtrack } from "./music.js";
import { createRadio } from "./radio.js";
import { batchStatic } from "./merge.js";
import { initAudio, createCarAudio, resumeAudio, startZombieAmbience, stopZombieAmbience, playZombieScream } from "./audio.js";
import { initWeapons3D, updateWeapon3D, playFireAnim3D, notifyReload3D, getWeaponMuzzle, RemoteWeaponRig } from "./weapons_3d.js";
import { createNpcSystem, MAX_HOSTILE } from "./npc.js";
import { bumpLine, fightLine } from "./pedestrianChatter.js";
import { pedestrianVoiceWho } from "./voiceCast.js";
import { createCameraController } from "./camera.js";
import { createTraffic } from "./traffic.js";
import { randomHoodrat, randomProstitute, makeHoodrat, randomHobo, makeHobo, randomGayMan, randomLesbian, randomTuxedo, randomHighEndEscort, randomKlansman, randomZombie } from "./characters.js";
import { createCinema } from "./cinema.js";
import { createPrologue, makeCastMember, PROLOGUE_KEEPOUT } from "./prologue.js";
import { createMissionClinic } from "./missionClinic.js";   // unused: see missionClinic below
import { createActOne, NADIA_HOME, NADIA_DOOR } from "./actone.js";
import { createOrleaRouge } from "./orlearouge.js";
import { createPotholes } from "./potholes.js";
import { createBlueLight } from "./bluelight.js";
import { headingFromVector, forwardFromHeading } from "./world.js";
import { createInput } from "./input.js";
import { VEHICLE_DEFS, vehicleDef, normalizeVehicleModel, createSeats, exitOffset, stepArcadeVehicle, collisionResponse, canHijack, CRASH_MIN_IMPACT, CRASH_DAMAGE_SCALE } from "./vehicles.js";
import { createOrientationDebug, createCompass } from "./debug.js";
import { createMinimap } from "./minimap.js";
import { createHijacker } from "./hijack.js";
import { createArsenal } from "./weapons.js";
import { createServices } from "./services.js";
import { createNightlife } from "./nightlife.js";
import { createCasinos } from "./casinos.js";
import { createTips } from "./tips.js";
import { buildMotorbike, buildScooter, buildPushBike, buildLimo } from "./bikes.js";
import { skyState } from "./daycycle.js";
import { createPauseMenu } from "./pauseMenu.js";
import { createLoot } from "./loot.js";
import { createWorldTime } from "./worldtime.js";
import { createWeather } from "./weather.js";
import { createEastBank, EAST_MAX_X } from "./eastbank.js";
import { createNolantis } from "./nolantis.js";
import { createWelcomeBack } from "./welcomeback.js";
import { ROUTE_EAST, CRASH } from "./prologue.js";
import { createSpawnZones, zombieDensityAtSpawn } from "./spawnzones.js";
import { pickArchetype, resolveArchetype } from "./zombies.js";
import { createFactionWar } from "./factions.js";
import { createKlan } from "./klan.js";
import { createNewton } from "./newton.js";
import { createTusouxroeNorth, NORTH_MIN_Z } from "./tusouxroeNorth.js";
import { createWestParish, onParishHighway, PARISH_MIN_X } from "./westparish.js";
import { createPlayerCharacter, getPlayerCharacter, PLAYER_CHARACTERS } from "./playerCharacters.js";
import { createAlternateCampaign } from "./alternateCampaign.js";
import { buildCruiserModel, createPoliceSystem } from "./police.js";
import { createGreedoCampaign } from "./greedoCampaign.js";
import { createMapEditor } from "./mapEditor.js";
import { createSyncCampaign } from "./syncCampaign.js";
import { createMultiplayer } from "./multiplayer.js";
import { createStateWorld, STATE_BOUNDS } from "./stateWorld.js";

// ---------------------------------------------------------------- config
// Dixie Beaux, a Gulf Coast state that isn't Louisiana, honest: US-167 runs from
// Chatboro (south, the swamp and the trailer park) up the Tusouxroe strip (north).
const WORLD = 136;           // half-width of the map (x), and its northern extent
// State-Wide GTA San Andreas scale map bounds (~5 km x 5 km)
const MAP = { minX: STATE_BOUNDS.minX, maxX: STATE_BOUNDS.maxX, minZ: STATE_BOUNDS.minZ, maxZ: STATE_BOUNDS.maxZ };
const ROAD_X = -6;           // the highway runs N/S along this line
const ROAD_HALF = 5;         // half road width
const LOT_X = 24;            // how far off the centre line a lot's building sits
const TRUCK_Z = -116;        // south end of the dashed centre line; also where the (now-removed) escape truck used to sit
const SPAWN_Z = 130;         // bottom of the map
const SIGN_Z = 126;          // Louisiana sign, just north (in front) of the spawn

// Every business lines the highway. [type, side, z, variant]: side +1 is east,
// which is the player's RIGHT heading north (−z) from the spawn.
// A mix of what's actually in assets/: the GAS·N·GEAUX station (Gas_station.fbx),
// 6twelve (6twelve.fbx), BurgerPiz and Tacos (GLB), storefronts from
// Buildings.glb (variant = which building). Popeyes: see POPEYES_LOCATIONS.
const LANDMARKS = [
  ["burgerpiz",  -1, 126],   // immediate LEFT of spawn
  ["gasstation", +1, 108],   // gas station — player's RIGHT, just past the sign
  ["sixtwelve",  -1, 100],   // 6twelve — player's LEFT
  ["popeyes",    +1,  84],
  ["shop",       -1,  78, 0],
  ["burgerpiz",  +1,  56],
  ["shop",       -1,  52, 3],
  ["taco",       -1,  28],
  ["shop",       +1,  30, 5],
  ["gasstation", +1,   6],
  ["shop",       -1, -14, 7],
  ["shop",       +1, -34, 1],
  ["sixtwelve",  -1, -54],
  ["shop",       +1, -74, 8],
  ["taco",       -1, -94],
];
const landmarkPos = (side, z) => [ROAD_X + side * LOT_X, z];

// Popeyes are landmarks, not a building type that repeats: exactly these two, a
// region apart. #1 is a lot on the US-167 strip at the Chatboro end (its entry in
// LANDMARKS builds it); #2 stands on the OrleaRouge boulevard, reached by driving
// south over the causeway. Nothing else may call makePopeyes.
const POPEYES_LOCATIONS = [
  { name: "Popeyes #1 · US-167 strip, Chatboro end", lot: { side: +1, z: 84 } },
  { name: "Popeyes #2 · OrleaRouge boulevard", x: ROAD_X + LOT_X, z: 230, rot: -Math.PI / 2 },
];
const popeyesPlaced = [];        // every makePopeyes call records itself (QA checks the count)

const KEEPOUT = [
  ...LANDMARKS.map(([, side, z]) => {
    const [x, lz] = landmarkPos(side, z);
    return { x, z: lz, r: 22 };
  }),
  { x: -46, z: 112, r: 22 },   // trailer park
  { x: 46, z: 92, r: 22 },     // junkyard
  { x: 30, z: 70, r: 10 },     // shack
  ...PROLOGUE_KEEPOUT,         // Mission 1: dirt road into the woods + crash site
];
function inKeepout(x, z) {
  if (onParishHighway(x, z, 8)) return true;                     // Parish Highway 9
  if (Math.abs(x - ROAD_X) < ROAD_HALF + 4) return true;         // road corridor
  if (Math.abs(x - ROAD_X) < LOT_X + 14) return true;            // the whole strip frontage
  if (Math.hypot(x - ROAD_X, z - SPAWN_Z) < 24) return true;     // clear the spawn + sign
  if (z < -50) return true;                                      // Ruston
  if (z > 142) return true;                                      // causeway + OrleaRouge: no swamp pines
  return KEEPOUT.some((k) => Math.hypot(x - k.x, z - k.z) < k.r);
}

const overlay = document.getElementById("overlay");
const loadNote = document.getElementById("loadNote");
const loadPct = document.getElementById("loadPct");
const loadBarFill = document.getElementById("loadBarFill");
const loadHud = document.getElementById("loadHud");
const startBtn = document.getElementById("startBtn");
const freeBtn = document.getElementById("freeBtn");
const zombieBtn = document.getElementById("zombieBtn");
const loadScreen = document.getElementById("loadScreen");
const hpFill = document.getElementById("hpFill");
const spFill = document.getElementById("spFill");
const objEl = document.getElementById("objective");
const crosshair = document.getElementById("crosshair");
const introPanel = document.getElementById("introPanel");
const characterSelect = document.getElementById("characterSelect");
const characterCards = document.getElementById("characterCards");
const characterPortrait = document.getElementById("characterPortrait");
const characterName = document.getElementById("characterName");
const characterSubtitle = document.getElementById("characterSubtitle");
const characterAbility = document.getElementById("characterAbility");
const characterDescription = document.getElementById("characterDescription");
const confirmCharacterBtn = document.getElementById("confirmCharacter");
const backCharacterBtn = document.getElementById("backCharacter");
const multiplayerBtn = document.getElementById("multiplayerBtn");
const multiplayerPanel = document.getElementById("multiplayerPanel");
const mpConnection = document.getElementById("mpConnection");
const mpCreate = document.getElementById("mpCreate");
const mpJoin = document.getElementById("mpJoin");
const mpRoomInput = document.getElementById("mpRoomInput");
const mpCode = document.getElementById("mpCode");
const mpPlayers = document.getElementById("mpPlayers");
const mpPick = document.getElementById("mpPick");
const mpReady = document.getElementById("mpReady");
const mpStart = document.getElementById("mpStart");
const mpBack = document.getElementById("mpBack");
const mpMessage = document.getElementById("mpMessage");

const mpBrowserView = document.getElementById("mpBrowserView");
const mpRefreshRooms = document.getElementById("mpRefreshRooms");
const mpVisibility = document.getElementById("mpVisibility");
const mpCreatePassword = document.getElementById("mpCreatePassword");
const mpRoomList = document.getElementById("mpRoomList");
const mpJoinPassword = document.getElementById("mpJoinPassword");
const mpLobbyView = document.getElementById("mpLobbyView");
const mpLeaveRoom = document.getElementById("mpLeaveRoom");

// ---------------------------------------------------------------- main menu (GTA-style)
// Start Game / Options / Exit Game, with Start Game opening onto the existing
// Story/Free Roam/Multiplayer row (startBtn/freeBtn/multiplayerBtn keep their
// ids so all the launch wiring further down needs no changes). Pure UI state —
// nothing here depends on assets being loaded yet.
const menuPanels = {
  root: document.getElementById("menuRoot"),
  start: document.getElementById("menuStartSub"),
  options: document.getElementById("menuOptionsPanel"),
  exit: document.getElementById("menuExitPanel"),
};
const gfxChoices = document.getElementById("gfxChoices");
const musicVolumeInput = document.getElementById("musicVolume");
const muteToggleBtn = document.getElementById("muteToggle");
const exitYesBtn = document.getElementById("exitYes");

function showMenuPanel(name) {
  for (const [key, el] of Object.entries(menuPanels)) el.hidden = key !== name;
  if (name === "options") syncGfxChoices();
  const first = menuPanels[name].querySelector(".menu-item:not(:disabled)");
  if (first) first.focus();
}
for (const [name, panel] of Object.entries(menuPanels)) {
  panel.addEventListener("click", (e) => {
    const menuBtn = e.target.closest("[data-menu]");
    if (menuBtn) return showMenuPanel(menuBtn.dataset.menu);
    const backBtn = e.target.closest("[data-back]");
    if (backBtn) return showMenuPanel(backBtn.dataset.back || "root");
  });
  panel.addEventListener("mouseover", (e) => {
    const item = e.target.closest(".menu-item");
    if (item && !item.disabled) item.focus();
  });
}
// Arrow-key / Escape navigation, console-menu style. Left alone while a range
// input (music volume) has focus, so its own native left/right handling isn't
// fought over.
document.addEventListener("keydown", (e) => {
  if (introPanel.hidden || !characterSelect.hidden || !multiplayerPanel.hidden) return;
  const active = document.activeElement;
  if (active && active.tagName === "INPUT") return;
  const openPanel = Object.values(menuPanels).find((el) => !el.hidden);
  if (!openPanel) return;
  const items = [...openPanel.querySelectorAll(".menu-item:not(:disabled)")];
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const i = items.indexOf(active);
    const next = e.key === "ArrowDown" ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[Math.max(0, next)]?.focus();
  } else if (e.key === "Escape" && openPanel !== menuPanels.root) {
    showMenuPanel("root");
  }
});
exitYesBtn.addEventListener("click", () => {
  window.close();
  setTimeout(() => {
    menuPanels.exit.innerHTML =
      '<div class="menu-confirm">Thanks for playing.</div>' +
      '<div class="menu-confirm-sub">Browsers won’t let a page close its own tab — you can close it now.</div>';
  }, 250);
});
function syncGfxChoices() {
  for (const b of gfxChoices.querySelectorAll("[data-tier]")) b.classList.toggle("active", b.dataset.tier === GFX.tier);
}
for (const b of gfxChoices.querySelectorAll("[data-tier]")) {
  b.addEventListener("click", () => {
    GFX.adaptive = false;
    GFX.tier = b.dataset.tier;
    applyTier();
    syncGfxChoices();
  });
}

// ---------------------------------------------------------------- renderer / scene
GFX.tier = autoTier();

const renderer = new THREE.WebGLRenderer({
  antialias: false,          // SMAA in the composer does this properly
  powerPreference: "high-performance",
  stencil: false,
});
renderer.setSize(innerWidth, innerHeight);
initRenderer(renderer);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// Aerial perspective. Keep it thin — the whole point of the PBR pass is that
// you can see surface detail down the strip.
// Keep the night haze atmospheric without hiding the ground texture and road edges.
// The old density saturated at normal gameplay distances, making the whole map
// read as one gray plane.
scene.fog = new THREE.FogExp2(0x24353f, 0.0028);

const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.3, 420);
const CAM_OFFSET = new THREE.Vector3(0, 15, 15);

// Physical sky baked to a PMREM probe — this replaces the old flat ambient and
// is what makes every metal, glass and wet surface in the scene read correctly.
// Elevation just under the horizon = deep blue "blue hour" night that still
// carries enough light to read a surface, rather than pitch black.
const env = createEnvironment(scene, renderer, {
  elevation: -1.8, azimuth: 196, turbidity: 4.5, rayleigh: 3.4,
  // Keep the global fill restrained; street lamps and neon should provide the
  // readable pools of light rather than washing every surface equally.
  environmentIntensity: 1.5, backgroundIntensity: 0.72,
});

const composer = await createComposer(renderer, scene, camera);

// Wet asphalt with a mirror pass under the road, and the player's headlights.
// Both live in fx.js; the wet shader is attached to the roads once they exist.
const wetRoads = createWetRoads(renderer, scene, camera);
wetRoads.setQuality(GFX.preset.reflect, GFX.preset.reflectEvery);
const headlights = createHeadlights(scene);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.resize();
  wetRoads.resize();
});

// ---------------------------------------------------------------- lights
// The IBL probe carries the ambient term now, so these are just the two key
// lights: hard moonlight, and a very low warm bounce off the ground haze.
const hemi = new THREE.HemisphereLight(0x4a6a8c, 0x2a2c1c, 0.62);
scene.add(hemi);
// The key light: the sun by day, the moon at night — daycycle.js says which, what
// colour, how strong, and where in the sky (the variable keeps its old name).
const moon = new THREE.DirectionalLight(0xc8d8ff, 1.8);
moon.position.set(-40, 60, -20);
moon.castShadow = true;
moon.shadow.mapSize.set(GFX.preset.shadow, GFX.preset.shadow);
const s = 70;
moon.shadow.camera.left = -s; moon.shadow.camera.right = s;
moon.shadow.camera.top = s; moon.shadow.camera.bottom = -s;
moon.shadow.camera.near = 1;
moon.shadow.camera.far = 220;
moon.shadow.bias = -0.0006;
moon.shadow.normalBias = 0.035;
moon.shadow.radius = 3;
scene.add(moon);
scene.add(moon.target);

// ---------------------------------------------------------------- helpers
/**
 * Let the browser paint before the next block of synchronous work. A hidden
 * tab never fires requestAnimationFrame, so a timer backs it up: loading
 * carries on while the player is in another tab instead of freezing on the
 * current loader line until they come back.
 */
const paint = () =>
  new Promise((r) => {
    let done = false;
    const go = () => { if (!done) { done = true; setTimeout(r, 0); } };
    requestAnimationFrame(go);
    setTimeout(go, 100);
  });

const loadManager = new THREE.LoadingManager();
// Two packs reference textures that aren't where their FBX says: the
// Designersoup cars point one folder above their .fbm directory, and the
// Trailer Park characters carry an absolute path from the author's machine.
// Both sets of materials are replaced with the right textures after loading,
// so redirect those requests instead of letting them 404 into the console.
const BLANK_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAMAASsJTYQAAAAASUVORK5CYII=";
loadManager.setURLModifier((url) => {
  // A model whose material names no texture at all resolves to the model's own
  // folder, so the loader requests a DIRECTORY — "assets/models/tacos/Tacos/
  // Models/ 403" and the same for BurgerPiz, on every single load. Nothing is
  // there to fetch; hand it a blank pixel and make no request.
  if (url.endsWith("/")) return BLANK_PNG;
  if (/(^|\/)C:\/Users\//i.test(url)) return BLANK_PNG;
  if (/\/cars\/387359c5580f06c08c266126b3b46db47e48ba44\.png$/.test(url)) {
    return "./assets/models/cars/docLorean.fbm/387359c5580f06c08c266126b3b46db47e48ba44.png";
  }
  return url;
});
const gltfLoader = new GLTFLoader(loadManager);
const fbxLoader = new FBXLoader(loadManager);
const texLoader = new THREE.TextureLoader(loadManager);
const rng = mulberry32(20240901);
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = (lo, hi) => lo + (hi - lo) * rng();

// ---------------------------------------------------------------- ground + water
// Bayou floor: the same hand-mixed swamp palette as before, but at 4x the
// resolution and run through the PBR deriver so it gets real relief.
function groundTexture() {
  const S = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d", { willReadFrequently: true });
  x.fillStyle = "#2e3d24"; x.fillRect(0, 0, S, S);
  const cols = ["#37481f", "#283a2a", "#3d3016", "#22331c", "#45532b", "#1a2a16", "#4e5a33"];
  for (let i = 0; i < 7000; i++) {
    x.fillStyle = cols[(Math.random() * cols.length) | 0];
    x.globalAlpha = 0.1 + Math.random() * 0.22;
    const r = 1 + Math.random() * 13;
    x.beginPath();
    x.ellipse(Math.random() * S, Math.random() * S, r, r * (0.4 + Math.random()), Math.random() * 6, 0, 7);
    x.fill();
  }
  // blades / litter, so the surface has fine detail to catch the moonlight
  x.lineWidth = 1;
  for (let i = 0; i < 4000; i++) {
    const px = Math.random() * S, py = Math.random() * S, a = Math.random() * 6, len = 2 + Math.random() * 6;
    x.strokeStyle = cols[(Math.random() * cols.length) | 0];
    x.globalAlpha = 0.25 + Math.random() * 0.45;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
    x.stroke();
  }
  x.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(30, 30);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = GFX.maxAniso;
  return t;
}

// Ground decals stack in a fixed order, and every one of them gets its own height:
// two surfaces at the same y fight for the same depth and the land shimmers wherever
// they overlap. Bottom to top: pads and lots, aprons, side streets, US-167, markings.
const GROUND_Y = Object.freeze({
  dirtPad: 0.012,        // junkyard / shack dirt
  lot: 0.014,            // the truck lot outside Tusouxroe
  gravel: 0.016,         // the trailer-park pad at Chatboro
  apron: 0.018,          // asphalt linking a lot to the highway shoulder
  street: 0.019,         // Main Street and the side streets
  highway: 0.02,         // US-167 itself
});

let ground;
function buildGround() {
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP.maxX - MAP.minX + WORLD * 0.4, MAP.maxZ - MAP.minZ + WORLD * 0.8, 1, 1),
    new THREE.MeshStandardMaterial({
      map: groundTexture(), color: 0x43552f, roughness: 1,
      // The floor is the player's depth reference. Applying the atmospheric fog
      // shader to this kilometre-scale plane made its near side blend into the
      // fog colour and look like a solid white/gray map.
      fog: false,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  // centred on the grown map, and tiled to match its longer z so it doesn't stretch
  ground.position.x = (MAP.maxX + MAP.minX) / 2;
  ground.position.z = (MAP.maxZ + MAP.minZ) / 2;
  ground.material.map.repeat.set(30 * (MAP.maxX - MAP.minX + WORLD * 0.4) / (WORLD * 2.4),
                                 30 * (MAP.maxZ - MAP.minZ + WORLD * 0.8) / (WORLD * 2.4));
  ground.castShadow = false;
  scene.add(ground);
  realize(ground, { hint: "grass ground", shadows: false });
  ground.receiveShadow = true;
  // The derived maps inherit the albedo's repeat, which is what we want here,
  // but the relief needs dialling back at this tiling or it reads as gravel.
  ground.material.normalScale.set(0.6, 0.6);
}

// Standing bayou water. A true mirror finish reflects the whole sky probe and
// reads as pale sand from a high camera, so this is deliberately a duller,
// wind-rippled surface: dark body, broad specular, a tight clearcoat on top.
const waterMat = new THREE.MeshPhysicalMaterial({
  color: 0x07120f, roughness: 0.22, metalness: 0.0,
  transparent: true, opacity: 0.9,
  envMapIntensity: 0.9, clearcoat: 1, clearcoatRoughness: 0.16,
});
waterMat.userData.gtbRealized = true;
const waterPatches = [];
for (let i = 0; i < 9; i++) {
  const w = rand(10, 26), d = rand(10, 26);
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d, 6, 6), waterMat);
  p.rotation.x = -Math.PI / 2;
  p.position.set(rand(-WORLD + 15, WORLD - 15), 0.04, rand(-WORLD + 15, WORLD - 15));
  p.receiveShadow = true;
  scene.add(p);
  waterPatches.push(p);
  p.userData.base = p.geometry.attributes.position.array.slice();
}

// ---------------------------------------------------------------- light pool
// A US-167 strip at night is defined by its lighting: sodium pole lights over
// every parking lot, spaced streetlamps down the shoulder. Lighting all ~30 of
// them at once would blow the forward renderer's per-object light budget, so
// instead a small pool of real lights is recycled onto whichever spots are
// nearest the camera. Anything further away still reads, via emissive bulbs.
const litSpots = [];
const lightPool = [];
function initLightPool(n = 8) {
  for (let i = 0; i < n; i++) {
    const l = new THREE.PointLight(0xffc27a, 0, 40, 2);
    scene.add(l);
    lightPool.push(l);
  }
}
// Every static light in the level goes through the pool too. Each PointLight in
// the scene is evaluated for every lit pixel on screen, so ~20 always-on lights
// were the single biggest shading cost; pooled, only the nearest 8 are real.
// `group`: position is local to a builder's group (converted to world here).
// Returns the spot, so a caller with a light that travels (cemetery.js's ghost)
// can move it by writing x/z/power on it — the pool re-sorts at 4 Hz and picks
// it up on its own.
function poolLight(color, power, range, x, y, z, group) {
  const p = new THREE.Vector3(x, y, z);
  if (group) {
    group.updateMatrixWorld(true);
    p.applyMatrix4(group.matrixWorld);
  }
  const spot = { x: p.x, y: p.y, z: p.z, warm: color, power, range, fx: false };
  litSpots.push(spot);
  return spot;
}

// Street lamps (addLitSpot) fade out in daylight; fires, neon and interior glows
// (poolLight, fx: false) do not. daycycle.js drives `lampPower`; `lampFx` holds the
// beams and halos, switched off together when the lamps go out.
let lampPower = 1;
let lampsLit = true;
const lampFx = [];
let poolTimer = 0;
// Soft ceiling for a pooled light's near-field brightness — see updateLightPool.
const POOL_LIGHT_CAP = 30;
// Crown Strip interiors (tusouxroeNorth.js's `indoor: true` spots) don't have
// the outdoor problem this cap exists for — a casino floor isn't a bonfire a
// couple of metres from its own prop, it's a windowless room whose only light
// IS this fixture. Capped at 30 it read as pitch black except for chrome/neon
// accents that don't need a light at all (specular and emissive materials
// still show without one). Indoors gets a much higher knee instead.
const POOL_LIGHT_CAP_INDOOR = 55;
function updateLightPool(dt, focus) {
  poolTimer -= dt;
  if (poolTimer > 0 || !litSpots.length) return;
  poolTimer = 0.25;                       // 4 Hz is plenty for this
  for (const sp of litSpots) {
    sp.d = (sp.x - focus.x) ** 2 + (sp.z - focus.z) ** 2;
  }
  litSpots.sort((a, b) => a.d - b.d);
  for (let i = 0; i < lightPool.length; i++) {
    const l = lightPool[i];
    const sp = litSpots[i];
    // Parked at zero intensity rather than hidden: toggling .visible changes
    // the scene's light count, which recompiles every lit shader mid-frame.
    if (!sp || sp.d > 90 * 90) { l.intensity = 0; continue; }
    l.position.set(sp.x, sp.y, sp.z);
    l.color.setHex(sp.warm);
    l.distance = sp.range;
    // fade the outermost lights in rather than popping them on
    // Street lamps are accent lighting, not a second sun. Keep authored
    // interior/fire lights at full strength, but soften pooled lamp spill.
    // Every `power` here feeds a real, physically-decaying PointLight (decay 2,
    // set in initLightPool) with no minimum-distance floor, so a light placed a
    // couple of metres from its own prop (a sign, a torch, a bonfire — exactly
    // where most of these sit) blows that prop's surface to solid white and
    // bloom smears it across the frame; the sun itself never exceeds ~3.2
    // (daycycle.js), so a `power` of 16-170 is catastrophic up close no matter
    // how reasonable it looks from across the street. Soft-cap with a knee
    // (POOL_LIGHT_CAP) instead of a hard clamp: small fixtures barely move,
    // the worst offenders (klan bonfires, casino fronts) get pulled way down,
    // and every light keeps its authored ranking relative to the others.
    const cap = sp.indoor ? POOL_LIGHT_CAP_INDOOR : POOL_LIGHT_CAP;
    const nearFieldSafePower = cap * sp.power / (cap + sp.power);
    l.intensity = nearFieldSafePower * THREE.MathUtils.smoothstep(90 * 90 - sp.d, 0, 30 * 30) * (sp.fx === false ? 1 : lampPower * 0.72);
  }
}

// ---------------------------------------------------------------- collision registry
const blockers = [];   // { x, z, r }  circular obstacles
// Spatial index over `blockers`: movers only test what is near them.
const blockerGrid = new BlockerGrid(8);
function addBlocker(x, z, r) {
  const b = { x, z, r };
  blockers.push(b);
  blockerGrid.addStatic(b);
  return b;
}
// The undo path in the dev-mode map editor needs to take a placed object's
// collision back out again, not just delete its mesh.
function removeBlocker(b) {
  const i = blockers.indexOf(b);
  if (i >= 0) blockers.splice(i, 1);
  blockerGrid.remove(b);
}

// ---------------------------------------------------------------- trees (wall of swamp)
function buildTrees() {
  // more sides now that they're lit properly — 5-sided trunks silhouette badly
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.32, 3.4, 10);
  const foliageGeo = new THREE.ConeGeometry(1.9, 4.6, 12);
  // colour multiplies the generated albedo, so these stay near-white and let
  // the "dirt" / "grass" palettes do the work
  const trunkMat = surface("dirt", 512).material(2, { color: 0xc9b49a, envMapIntensity: 0.7 });
  const foliageMat = surface("grass", 512).material(3, { color: 0xb9d69a, envMapIntensity: 0.8 });
  trunkMat.normalScale.set(2.2, 2.2);
  foliageMat.normalScale.set(1.6, 1.6);
  const N = 460;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, N);
  const foliage = new THREE.InstancedMesh(foliageGeo, foliageMat, N);
  trunks.castShadow = foliage.castShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  let n = 0;
  for (let i = 0; i < N; i++) {
    let x, z, ring = i < N * 0.45;
    if (ring) {
      const a = rng() * Math.PI * 2;
      const rad = WORLD - rand(0, 16);
      x = Math.cos(a) * rad; z = Math.sin(a) * rad;
    } else {
      x = rand(-WORLD + 10, WORLD - 10);
      // bias the scatter toward the southern swamp
      z = rng() < 0.7 ? rand(20, WORLD - 10) : rand(-WORLD + 10, WORLD - 10);
      if (Math.hypot(x, z - 100) < 12) continue;   // clear the spawn
    }
    if (inKeepout(x, z)) continue;      // keep landmarks / road / city clear
    const h = rand(0.8, 1.5);
    sc.set(h, h, h);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6);
    m.compose(new THREE.Vector3(x, 1.7 * h, z), q, sc);
    trunks.setMatrixAt(n, m);
    m.compose(new THREE.Vector3(x, 4.6 * h, z), q, sc);
    foliage.setMatrixAt(n, m);
    addBlocker(x, z, 0.7 * h);
    n++;
  }
  trunks.count = foliage.count = n;
  scene.add(trunks, foliage);
}

function buildSwampTrees() {
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.4, 3.8, 10);
  const foliageGeo = new THREE.ConeGeometry(2.2, 5.0, 12);
  const waterGeo = new THREE.PlaneGeometry(5, 5).rotateX(-Math.PI / 2);
  
  const trunkMat = surface("dirt", 512).material(2, { color: 0x3a2f24, envMapIntensity: 0.6 });
  const foliageMat = surface("grass", 512).material(3, { color: 0x4a5a30, envMapIntensity: 0.7 });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x1a2a1a, transparent: true, opacity: 0.85, roughness: 0.1 });
  
  const N = 800; // Scattered across the entire map
  let placed = 0;
  for (let i = 0; i < N; i++) {
    const x = rand(-WORLD + 10, WORLD - 10);
    const z = rand(-WORLD + 10, WORLD - 10);
    if (Math.hypot(x, z - 100) < 12) continue; // clear spawn
    if (inKeepout(x, z)) continue; // keep roads and cities clear
    
    // extra filtering to ensure it really is wilderness (rural/forest/water/none)
    const zZone = spawnZones.zoneAt(x, z);
    if (zZone && !["rural", "forest", "water"].includes(zZone)) continue;

    const h = rand(0.9, 1.4);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6);
    
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(0, 1.9 * h, 0);
    trunk.scale.set(h, h, h);
    trunk.quaternion.copy(q);
    
    const fol = new THREE.Mesh(foliageGeo, foliageMat);
    fol.position.set(0, 4.8 * h, 0);
    fol.scale.set(h, h, h);
    fol.quaternion.copy(q);
    
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.set(0, 0.05, 0);
    water.scale.set(h, 1, h); // Scale the puddle too

    const mesh = new THREE.Group();
    mesh.add(trunk, fol, water);
    mesh.position.set(x, 0, z);
    
    scene.add(mesh);
    addBlocker(x, z, 0.7 * h); // keep collision
    
    swampTrees.push({ x, z, hp: 100, mesh, dead: false });
    placed++;
  }
}

// ---------------------------------------------------------------- kit loading
const urbanTex = {};
function loadUrbanTextures() {
  const a = texLoader.load("./assets/models/urban/textures/demo_texture_512x512_albedo_psified.png");
  a.colorSpace = THREE.SRGBColorSpace; a.flipY = false;
  urbanTex.albedo = a;
}
loadUrbanTextures();

const kitCache = new Map();
function loadKit(path) {
  if (kitCache.has(path)) return kitCache.get(path);
  const p = new Promise((res) => {
    gltfLoader.load(
      `./assets/models/urban/${path}`,
      (g) => {
        g.scene.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            o.material = new THREE.MeshStandardMaterial({ map: urbanTex.albedo, roughness: 0.9 });
          }
        });
        // urban kit = roads, kerbs, pillars, pavement — all masonry
        realize(g.scene, { hint: "concrete masonry " + path });
        res(g.scene);
      },
      undefined,
      () => res(null)
    );
  });
  kitCache.set(path, p);
  return p;
}

function placeKit(scene3, x, z, rotY = 0, scale = 1) {
  if (!scene3) return null;
  const o = scene3.clone(true);
  o.position.set(x, 0, z);
  o.rotation.y = rotY;
  o.scale.setScalar(scale);
  scene.add(o);
  return o;
}

// ---------------------------------------------------------------- vehicles
function loadVehicle(file, texFile) {
  return new Promise((res) => {
    const tex = texLoader.load(`./assets/models/vehicles/${texFile}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    fbxLoader.load(
      `./assets/models/vehicles/${file}`,
      (obj) => {
        const box = new THREE.Box3().setFromObject(obj);
        const size = box.getSize(new THREE.Vector3());
        const scl = 3.4 / Math.max(size.x, size.y, size.z); // normalise to ~car length
        obj.scale.setScalar(scl);
        obj.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true; o.receiveShadow = true;
            o.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.2 });
          }
        });
        // clearcoat car paint + chrome + glass, picked per submesh name
        realize(obj, { hint: "vehicle carpaint" });
        res(normalizeVehicleModel(obj, vehicleDef(file)));
      },
      undefined,
      () => res(normalizeVehicleModel(fallbackCar(tex), VEHICLE_DEFS.fallback))
    );
  });
}
function fallbackCar(tex) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 4.4),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  body.position.y = 0.75; body.castShadow = true;
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 2),
    new THREE.MeshStandardMaterial({ color: 0x222222 }));
  cab.position.set(0, 1.5, -0.2); cab.castShadow = true;
  g.add(body, cab);
  return g;
}

// --- generic GLB loader (keeps embedded materials, just tweaks them) ---
// cullRe: drop interior clutter / scenery meshes we don't need (perf)
const glbCache = new Map();
// Asset packs ship painted backdrop cards — "Background", "Trees_Background" and
// the like: 300-500 m planes hung 13-17 m up so a pack looks good in isolation.
// In a world with its own sky and horizon they read as a grey ceiling over the
// town. Dropped on load, from every pack, whatever else the caller asks for.
const BACKDROP_RE = /^(background|backdrop|skybox|sky_?dome|trees_background)/i;

function loadGLB(path, cullRe, keepRe) {
  const key = path + (cullRe ? "|c" + cullRe.source : "") + (keepRe ? "|k" + keepRe.source : "");
  if (glbCache.has(key)) return glbCache.get(key);
  const p = new Promise((res) => {
    gltfLoader.load(path, (g) => {
      const doomed = [];
      g.scene.traverse((o) => {
        if (o.isMesh) {
          const nm = o.name || "";
          // packs name the card on the mesh or only on its material
          const matNm = (o.material && !Array.isArray(o.material) && o.material.name) || "";
          if (BACKDROP_RE.test(nm) || BACKDROP_RE.test(matNm)) { doomed.push(o); return; }
          if (keepRe && !keepRe.test(nm)) { doomed.push(o); return; }
          if (cullRe && cullRe.test(nm)) { doomed.push(o); return; }
          o.castShadow = true; o.receiveShadow = true;
          if (o.material) {
            o.material.roughness = 0.85;
            o.material.metalness = 0.0;
            if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
          }
        }
      });
      doomed.forEach((m) => m.parent && m.parent.remove(m));
      // GLBs keep their authored materials; realize() only adds what's missing
      // (normal / ORM / envMapIntensity) and reclassifies glass + metal trim.
      realize(g.scene, { hint: path });
      res(g.scene);
    }, undefined, (e) => { console.warn("GLB fail", path, e); res(null); });
  });
  glbCache.set(key, p);
  return p;
}
const CLUTTER = /armchair|chair|shelf|basket|terminal|cash_register|air.?condition|ceiling|urinary|light_fixture|napkin|cup|plate|tray|bottle|sauce|salt|oil|flour|dough|roller|grater|cutter|tongs|ladle|bowl|book|paper|mug|candle/i;

// --- Designersoup low-poly cars (FBX + shared texture in a .fbm folder) ---
function loadDsCar(name) {
  return new Promise((res) => {
    const tex = texLoader.load(
      `./assets/models/cars/${name}.fbm/387359c5580f06c08c266126b3b46db47e48ba44.png`);
    tex.colorSpace = THREE.SRGBColorSpace;
    // A palette sheet of flat colour swatches: every face samples one swatch.
    // Filtering or mipmapping it bleeds neighbouring swatches (some near-black)
    // across the paint as distance changes, which read as black flicker.
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    fbxLoader.load(`./assets/models/cars/${encodeURIComponent(name)}.fbx`, (obj) => {
      const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
      obj.scale.setScalar(4.2 / Math.max(size.x, size.y, size.z));
      obj.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          o.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.25 });
        }
      });
      // no derived normal/ORM maps (they turned swatch edges into glitter) and a
      // calmer metal; keepPixelFilter leaves the swatch filtering above alone
      realize(obj, { hint: "vehicle carpaint " + name, noDerive: true, keepPixelFilter: true, metalness: 0.3, roughness: 0.38 });
      res(normalizeVehicleModel(obj, vehicleDef(name)));
    }, undefined, () => res(normalizeVehicleModel(fallbackCar(null), VEHICLE_DEFS.fallback)));
  });
}

// --- generic FBX-with-sidecar-textures loader (6twelve gas station, etc.) ---
// cullRe drops scene-dressing meshes (ground / parking lot / backdrop) so the
// building isn't shrunk to nothing when its footprint is normalised.
function loadFbxScene(fbxPath, texDir, targetSize, cullRe) {
  return new Promise((res) => {
    fbxLoader.setResourcePath(texDir);
    fbxLoader.load(fbxPath, (obj) => {
      if (cullRe) {
        const doomed = [];
        obj.traverse((o) => {
          if (o.isMesh && (cullRe.test(o.name || "") ||
              (Array.isArray(o.material) ? o.material : [o.material]).some((m) => m && cullRe.test(m.name || ""))))
            doomed.push(o);
        });
        doomed.forEach((m) => m.parent && m.parent.remove(m));
      }
      const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
      if (targetSize) obj.scale.setScalar(targetSize / Math.max(size.x, size.z));
      obj.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          const apply = (mat) => {
            if (!mat) return;
            if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
            mat.roughness = mat.roughness ?? 0.85; mat.metalness = 0.05;
            if (/sign|emiss|light|neon|logo|lottery|price/i.test(mat.name || "")) {
              mat.emissive = new THREE.Color(0xffe9c0);
              mat.emissiveIntensity = 0.7;
              if (mat.map) mat.emissiveMap = mat.map;
            }
          };
          Array.isArray(o.material) ? o.material.forEach(apply) : apply(o.material);
        }
      });
      realize(obj, { hint: fbxPath, emissiveBoost: 1.15 });
      const b = new THREE.Box3().setFromObject(obj);
      obj.position.y = -b.min.y;
      fbxLoader.setResourcePath("");
      res(obj);
    }, undefined, (e) => { console.warn("FBX fail", fbxPath, e); fbxLoader.setResourcePath(""); res(null); });
  });
}
const SITE_CLUTTER = /ground|asphalt|parking|road|street|sidewalk|pavement|background|backdrop|terrain|grass|bush|plant|tree|fence|curb|soil|sand|dirt/i;
const loadSixtwelve = () =>
  loadFbxScene("./assets/models/sixtwelve/6twelve.fbx", "./assets/models/sixtwelve/Textures/", 22, SITE_CLUTTER);
const loadGasStation = () =>
  loadFbxScene("./assets/models/gasstation/Gas_station.fbx", "./assets/models/gasstation/Textures/", 24, SITE_CLUTTER);

// --- shack / shed / junk decor from the "Shacks Shanties Sheds" texture pack ---
const shackTex = {};
function shackTexture(file, rep = [1, 1]) {
  const t = texLoader.load(`./assets/models/shacks/${file}`);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = GFX.maxAniso;   // was NearestFilter for the PSX look
  t.repeat.set(rep[0], rep[1]);
  return t;
}
function initShackTex() {
  shackTex.corr = shackTexture("Shed_Corrugated_Texture.png", [3, 2]);
  shackTex.plate = shackTexture("Shed_Plate_Texture.png", [2, 2]);
  shackTex.barrel = shackTexture("Barrel-Texture.png");
  shackTex.pallet = shackTexture("Pallet-Texture.png");
  shackTex.fence = shackTexture("Chainlink-Fence.png", [4, 1]);
  shackTex.barricade = shackTexture("Concrete_Barricade_Texture.png");
  shackTex.concrete = shackTexture("Concrete_Floor_Texture.png", [4, 4]);
}

function makeShed(x, z, ry = 0, w = 7, d = 5) {
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = ry;
  const wallMat = new THREE.MeshStandardMaterial({ map: shackTex.corr, roughness: 1 });
  const roofMat = new THREE.MeshStandardMaterial({ map: shackTex.plate, roughness: 1, metalness: 0.2 });
  const h = 3.2;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  walls.position.y = h / 2; walls.castShadow = true; walls.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.25, d + 0.6), roofMat);
  roof.position.y = h + 0.1; roof.rotation.z = 0.06;
  g.add(walls, roof);
  scene.add(g);
  addBlocker(x, z, Math.max(w, d) * 0.5);
  return g;
}
function makeBarrel(x, z) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 10),
    new THREE.MeshStandardMaterial({ map: shackTex.barrel, roughness: 0.8, metalness: 0.3 }));
  m.position.set(x, 0.6, z); m.rotation.y = Math.random() * 3; m.castShadow = true;
  scene.add(m);
  addBlocker(x, z, 0.6);
}
function makePallet(x, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 1.6),
    new THREE.MeshStandardMaterial({ map: shackTex.pallet, roughness: 1 }));
  m.position.set(x, 0.13, z); m.rotation.y = ry;
  scene.add(m);
}
function makeFence(x1, z1, x2, z2) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 2.2),
    new THREE.MeshStandardMaterial({
      map: shackTex.fence, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1,
    }));
  m.material.map = m.material.map.clone();
  m.material.map.repeat.set(len / 2.5, 1);
  m.material.map.needsUpdate = true;
  m.position.set((x1 + x2) / 2, 1.1, (z1 + z2) / 2);
  m.rotation.y = Math.atan2(x2 - x1, z2 - z1);
  scene.add(m);
}

// ---------------------------------------------------------------- Popeyes (everywhere)
function signTexture() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 512;
  const x = c.getContext("2d");
  x.fillStyle = "#f47216"; x.fillRect(0, 0, 1024, 512);
  x.strokeStyle = "#ffffff"; x.lineWidth = 22;
  x.strokeRect(28, 28, 968, 456);
  x.fillStyle = "#ffffff";
  x.textAlign = "center"; x.textBaseline = "middle";
  x.font = "bold 210px Trebuchet MS, Arial Black, sans-serif";
  x.fillText("POPEYES", 512, 210);
  x.fillStyle = "#7a1f12";
  x.font = "bold 76px Trebuchet MS, Arial";
  x.fillText("LOUISIANA KITCHEN", 512, 380);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const popeyesSign = signTexture();
const signMat = () => new THREE.MeshStandardMaterial({
  map: popeyesSign, emissive: 0xff8a2c, emissiveIntensity: 1.0, emissiveMap: popeyesSign,
});
// Real aggregate asphalt: 2K albedo + derived normal/ORM, so headlights and
// moonlight actually skid across the grain instead of hitting a flat slab.
let asphalt, asphaltMat;
function buildAsphalt() {
  asphalt = surface("asphalt", 1024);
  asphaltMat = asphalt.material(6, { envMapIntensity: 0.9 });
  asphaltMat.normalScale.set(1.9, 1.9);
}

// Painted stalls, drawn over the same aggregate so the derived relief lines up.
function carParkTexture() {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const x = c.getContext("2d");
  x.drawImage(asphalt.map.image, 0, 0, S, S);
  x.lineCap = "butt";
  for (let i = S * 0.125; i < S; i += S * 0.1875) {
    // worn paint: several jittered passes rather than one clean stroke
    for (let p = 0; p < 5; p++) {
      x.strokeStyle = `rgba(201,196,176,${0.16 + Math.random() * 0.2})`;
      x.lineWidth = 14 + Math.random() * 5;
      x.beginPath();
      x.moveTo(i + (Math.random() - 0.5) * 5, S * 0.08);
      x.lineTo(i + (Math.random() - 0.5) * 5, S * 0.92);
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = GFX.maxAniso;
  return t;
}
let parkTex;

// An OrleaRouge block given to a Pay 'n' Spray (orlearouge.js `lots`): the garage
// opens onto the street on the block's north side, a concrete lot fills the rest.
function payNSprayLot(b, name) {
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(b.x1 - b.x0, b.z1 - b.z0),
    new THREE.MeshStandardMaterial({ name: "concrete lot", color: 0x5a5c60, roughness: 0.95 }));
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(b.cx, GROUND_Y.lot, b.cz);
  lot.receiveShadow = true;
  scene.add(lot);
  services.buildPayNSpray(b.cx, b.z0 + 6.2, Math.PI, name);
}

function makePopeyes(x, z, rot = 0) {
  popeyesPlaced.push({ x, z });
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xe8681c, roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x8f2016, roughness: 0.8 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(11, 5, 9), wallMat);
  box.position.y = 2.5; box.castShadow = true; box.receiveShadow = true;
  const band = new THREE.Mesh(new THREE.BoxGeometry(11.3, 1.1, 9.3), trimMat);
  band.position.y = 4.6;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.5, 9.6),
    new THREE.MeshStandardMaterial({ color: 0x2f241c }));
  roof.position.y = 5.3;

  // ---- giant pylon sign, taller than any tree ----
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 20, 10),
    new THREE.MeshStandardMaterial({ color: 0x1e1e1e }));
  pole.position.set(9, 10, 7);
  const board = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 0.6), signMat());
  board.position.set(9, 19, 7);
  board.castShadow = true;
  // double-sided readability: the back face is its own mesh, NOT a child of the
  // original — a clone keeps the parent's position as a local offset, which
  // used to fling a ghost sign to twice the height and offset (the sky signs).
  const board2 = board.clone();
  board2.rotation.y = Math.PI;
  board2.position.set(0, 0, -0.02);   // 2 cm behind: readable, and no z-fight
  board.add(board2);
  // a glowing bulb strip on the pylon instead of a real light (light budget)
  const glowBar = new THREE.Mesh(new THREE.BoxGeometry(12.4, 6.4, 0.2),
    new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.16 }));
  glowBar.position.set(9, 19, 7);

  // ---- rooftop sign ----
  const roofSign = new THREE.Mesh(new THREE.BoxGeometry(9, 2.6, 0.5), signMat());
  roofSign.position.set(0, 7.2, 0);
  const roofSignB = roofSign.clone();
  roofSignB.rotation.y = Math.PI;
  roofSignB.position.set(0, 0, -0.02);   // 2 cm behind: readable, and no z-fight
  roofSign.add(roofSignB);

  // ---- wall sign over the door ----
  const wsign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.6), signMat());
  wsign.position.set(0, 3.2, 4.55);

  // ---- car park out front (toward +z, faces the road once placed) ----
  const park = new THREE.Mesh(new THREE.PlaneGeometry(20, 13), asphaltMat.clone());
  park.material.map = parkTex;
  park.rotation.x = -Math.PI / 2;
  park.position.set(0, 0.04, 11.5);
  park.receiveShadow = true;
  g.add(box, band, roof, pole, board, glowBar, roofSign, wsign, park);
  scene.add(g);
  g.updateMatrixWorld(true);
  const counter = new THREE.Vector3(0, 0, 8).applyMatrix4(g.matrixWorld);   // clear of the front collision circle (local z 4.5, r 2.6)
  addService({ kind: "food", name: "Popeyes", x: counter.x, z: counter.z, face: rot });

  // a couple of cars parked out front
  parkedCarSpots.push({ x, z, rot });

  // collision: building footprint + pole
  for (const [bx, bz] of [[0, 4.5], [0, -4.5], [5.5, 0], [-5.5, 0], [0, 0]]) {
    const wx = x + bx * Math.cos(rot) - bz * Math.sin(rot);
    const wz = z + bx * Math.sin(rot) + bz * Math.cos(rot);
    addBlocker(wx, wz, 2.6);
  }
  return g;
}
const parkedCarSpots = [];

// Popeyes buckets — grab for a health boost
const buckets = [];
function makeBucket(x, z) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34, 0.26, 0.62, 14),
    new THREE.MeshStandardMaterial({ color: 0xf3f1e6, roughness: 0.6, emissive: 0x2a1200, emissiveIntensity: 0.6 })
  );
  body.position.y = 0.31; body.castShadow = true;
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 14),
    new THREE.MeshStandardMaterial({ color: 0xd23b1e }));
  stripe.position.y = 0.31;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.37, 0.08, 14),
    new THREE.MeshStandardMaterial({ color: 0xd23b1e }));
  lid.position.y = 0.64;
  g.add(body, stripe, lid);
  g.position.set(x, 0.35, z);
  g.userData = { taken: false, baseY: 0.35 };
  scene.add(g);
  buckets.push(g);
}

// ---------------------------------------------------------------- muzzle flash / tracer
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });
const tracers = [];
const tracerPool = [];
function spawnTracer(from, to) {
  let line = tracerPool.pop();
  if (!line) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    line = new THREE.Line(geo, tracerMat.clone());
    line.frustumCulled = false;
  }
  const p = line.geometry.attributes.position;
  p.setXYZ(0, from.x, from.y, from.z);
  p.setXYZ(1, to.x, to.y, to.z);
  p.needsUpdate = true;
  line.userData.life = 0.09;
  scene.add(line);
  tracers.push(line);
}

// ---------------------------------------------------------------- blood / gore
// Two looks, two textures: a soft round droplet for the airborne spray, and a
// blotchy multi-blob splat (several overlapping radial gradients, not one
// clean disc) for the pool a body leaves on the ground.
let bloodDropTex = null;
function bloodDropTexture() {
  if (bloodDropTex) return bloodDropTex;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(150,4,4,1)");
  g.addColorStop(0.55, "rgba(110,2,2,0.9)");
  g.addColorStop(1, "rgba(80,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  bloodDropTex = new THREE.CanvasTexture(c);
  bloodDropTex.colorSpace = THREE.SRGBColorSpace;
  return bloodDropTex;
}
let bloodPoolTex = null;
function bloodPoolTexture() {
  if (bloodPoolTex) return bloodPoolTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  x.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rand(-0.35, 0.35);
    const r = rand(22, 48);
    const cx = 64 + Math.cos(a) * rand(0, 20);
    const cy = 64 + Math.sin(a) * rand(0, 20);
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, "rgba(112,6,6,0.95)");
    g.addColorStop(0.7, "rgba(78,4,4,0.6)");
    g.addColorStop(1, "rgba(78,4,4,0)");
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, r, 0, Math.PI * 2);
    x.fill();
  }
  bloodPoolTex = new THREE.CanvasTexture(c);
  bloodPoolTex.colorSpace = THREE.SRGBColorSpace;
  return bloodPoolTex;
}

// Airborne droplets: pooled sprites with a velocity and gravity, same
// pop/recycle shape as spawnTracer above. `dir` is the shot's own aim
// vector — blood keeps travelling the way the bullet was going, not straight
// up, so a point-blank shotgun blast reads differently from a pistol tap.
const bloodSprayMat = new THREE.SpriteMaterial({ map: bloodDropTexture(), transparent: true, depthWrite: false, fog: false });
bloodSprayMat.userData.gtbRealized = true;
const bloodDrops = [];
const bloodDropPool = [];
function spawnBloodSpray(pos, dir, count = 7) {
  for (let i = 0; i < count; i++) {
    let s = bloodDropPool.pop();
    if (!s) {
      s = new THREE.Sprite(bloodSprayMat.clone());
      s.userData.vel = new THREE.Vector3();
    }
    s.position.copy(pos);
    s.scale.setScalar(rand(0.07, 0.2));
    s.userData.vel.set(
      dir.x * rand(1, 3.2) + rand(-1, 1),
      rand(1.6, 3.6),
      dir.z * rand(1, 3.2) + rand(-1, 1)
    );
    s.userData.life = s.userData.maxLife = rand(0.35, 0.6);
    s.material.opacity = 1;
    scene.add(s);
    bloodDrops.push(s);
  }
}

// Ground pools: capped and recycled like the loot pickups (see loot.js) —
// gore accumulates forever otherwise, and a body dropped on top of an old
// pool just steals it rather than growing the pile without bound.
const bloodPoolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const bloodPoolBaseMat = new THREE.MeshBasicMaterial({
  map: bloodPoolTexture(), transparent: true, depthWrite: false, fog: false,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
});
bloodPoolBaseMat.userData.gtbRealized = true;
const MAX_BLOOD_POOLS = 40;
const bloodPools = [];
function spawnBloodPool(x, z, scale = 1) {
  let m = bloodPools.length >= MAX_BLOOD_POOLS ? bloodPools.shift() : null;
  if (!m) {
    m = new THREE.Mesh(bloodPoolGeo, bloodPoolBaseMat.clone());
    scene.add(m);
  }
  m.position.set(x, 0.015, z);
  m.rotation.y = rand(0, Math.PI * 2);
  m.scale.setScalar(rand(0.75, 1.3) * scale);
  m.material.opacity = 0;
  bloodPools.push(m);
}
function updateBlood(dt) {
  for (let i = bloodDrops.length - 1; i >= 0; i--) {
    const s = bloodDrops[i];
    s.userData.life -= dt;
    s.userData.vel.y -= dt * 9;
    s.position.addScaledVector(s.userData.vel, dt);
    if (s.position.y <= 0.05) s.userData.life = 0;   // hit the ground, gone
    s.material.opacity = Math.max(0, s.userData.life / s.userData.maxLife);
    if (s.userData.life <= 0) { scene.remove(s); bloodDrops.splice(i, 1); bloodDropPool.push(s); }
  }
  for (const m of bloodPools) if (m.material.opacity < 1) m.material.opacity = Math.min(1, m.material.opacity + dt * 3);
}

// ---------------------------------------------------------------- game state
const state = {
  running: false, over: false,
  hp: 100, sp: 100, cash: 0,
  fireCd: 0, hurtCd: 0, dusk: 0, prostituteTrips: 0,
  selectedCharacter: "keseme", campaign: "main",   // Keseme Nadia, the story's protagonist, is the default pick
  veh: null,          // vehicle the player is driving, or null (on foot)
  heat: 0,            // crime heat -> wanted stars
  wanted: 0,
  crimeCd: 0,         // time since last crime (heat holds while > 0)
  // Weapon put away (X). Starts AWAY: left click is for looking around, and
  // nobody expects grabbing the pointer or dragging the view to empty a
  // magazine. Draw with X when you actually want to use it. While holstered,
  // fire() refuses, the view-model is hidden and the HUD dims.
  holstered: true,
  holsterHintCd: 0,
  bustCd: 0,          // seconds a sheriff has been on top of you
  cinematic: false,   // a cutscene owns the world: simulation and input pause
};
const vehicles = [];   // every drivable car
let lastVehAudio = null;   // the previous frame's state.veh.audio, so exiting a car tears its sound down
const sheriffs = [];   // active police units
const wrecks = [];      // exploded vehicles left standing — see updateWrecks
let sheriffSpawnCd = 0;   // stagger cruiser call-outs — see updateSheriffs
let footSpawnCd = 0;      // stagger deputy call-outs — see updateSheriffs
const cashEl = document.getElementById("cash");
const clockEl = document.getElementById("clock");
const starsEl = document.getElementById("stars");
const zombieKillsEl = document.getElementById("zombieKills");
const vehIndic = document.getElementById("vehIndic");
const music = document.getElementById("music");
// Soundtrack: every audio file in assets/music/ (see the README there), shuffled.
const soundtrackReady = createSoundtrack(music, { fallback: "./assets/audio/theme.mp3" });
const radio = createRadio();   // assets/audio/radio/ — plays only while state.veh is set, see tick()
initAudio(camera);   // THREE.AudioListener on the camera; car audio builds from it lazily (audio.js)
document.getElementById("mute").onclick = () => toggleMute();
// The in-car radio, silenced on its own (K, or the button beside the music one).
// Separate from the soundtrack mute: M kills the music, K kills the DJ, and
// wanting one without the other is the normal case.
let radioOff = false;
const radioBtn = document.getElementById("radioBtn");
function toggleRadio() {
  radioOff = !radioOff;
  if (radioOff) radio.stop();
  else if (state.veh) radio.play();
  if (radioBtn) radioBtn.classList.toggle("off", radioOff);
  flashObjective(radioOff ? "Car radio off." : "Car radio on.");
}
if (radioBtn) radioBtn.onclick = () => toggleRadio();
function toggleMute() {
  music.muted = !music.muted;
  document.getElementById("mute").textContent = music.muted ? "♪̶" : "♪";
  syncMuteToggle();
}
// The main-menu Options panel's own volume/mute controls (set before the game
// starts, or from Options mid-session). The two music.volume = musicVolume
// assignments elsewhere (starting the soundtrack fresh) read this instead of
// a literal, so a choice made in Options survives into the game.
let musicVolume = 0.55;
function syncMuteToggle() {
  muteToggleBtn.textContent = music.muted ? "Off" : "On";
  muteToggleBtn.classList.toggle("off", music.muted);
}
musicVolumeInput.addEventListener("input", () => {
  musicVolume = Number(musicVolumeInput.value) / 100;
  music.volume = musicVolume;
});
muteToggleBtn.addEventListener("click", () => toggleMute());
syncMuteToggle();

function registerVehicle(obj, r = 1.8, opts = {}) {
  if (!obj) return null;
  const v = {
    audio: createCarAudio(obj),
    obj, heading: obj.rotation.y, speed: 0, hp: opts.hp || 40, hpMax: opts.hp || 40,
    sheriff: !!opts.sheriff, blocker: { x: obj.position.x, z: obj.position.z, r },
    r, wob: 0, impact: 0,   // impact: set by collisionResponse on the first frame of a hard hit (crash damage)
    def: obj.userData.vehicleDef || null,          // vehicles.js definition (class, model forward)
    seats: createSeats(obj.userData.vehicleDef),   // driver first; see vehicles.js for hijacking
  };
  if (!opts.sheriff) {
    blockers.push(v.blocker);
    blockerGrid.addDynamic(v.blocker);   // its x/z move with the car
  }
  vehicles.push(v);
  return v;
}

function crime(amount) {
  state.heat += amount;
  state.crimeCd = 6;
  checkHeatUp();
}
// Gunfire is only a crime when somebody hears it: popping hogs out in the woods
// doesn't bring the Sheriff, and a shot near people or a cruiser does.
function shotWitnessed() {
  for (const [id, rp] of remotePlayers.entries()) {
    if (rp.userData.netTarget && rp.userData.netTarget.state === "DEAD") continue;
    const dx = rp.position.x - playerPos.x, dz = rp.position.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d > gun.range || d < 1e-3) continue;
    const facing = (dx * _aim.x + dz * _aim.z) / d;
    if (state.weapon === "sawnoff") {
      if (facing > 0.82) hitTargets.push({ t: { id, rp }, kind: "player", d });
    } else {
      if (facing < 0) continue;
      const distToRay = Math.sqrt(Math.max(0, d * d - (d * facing) * (d * facing)));
      if (distToRay > 1.0) continue;
      const score = d;
      if (score < bestScore) { bestScore = score; best = { id, rp }; bestKind = "player"; bestDist = d; }
    }
  }
  for (const e of enemies) {
    if (!e.dead && e.type !== "hog" && Math.hypot(e.spr.position.x - playerPos.x, e.spr.position.z - playerPos.z) < 35) return true;
  }
  return sheriffs.some((s) => !s.dead && Math.hypot(s.obj.position.x - playerPos.x, s.obj.position.z - playerPos.z) < 60);
}
// One source of truth for controls (input.js): gameplay asks about actions,
// never key codes.
const input = createInput();

// Hidden dev-mode landmark placement tool (type $DEVMODE69xxx during free
// roam). Constructed here (not in boot()) so it's live the instant the cheat
// code is typed, and after `input`/`renderer`/`loadGLB` so it can drive its
// own free-fly camera and build real-looking (not fallback-box) previews.
const mapEditor = createMapEditor({
  scene, camera, renderer, input, loadGLB, loadVehicle, loadDsCar,
  addBlocker, removeBlocker,
  addLitSpot: (spot) => litSpots.push(spot),
  removeLitSpot: (spot) => { const i = litSpots.indexOf(spot); if (i >= 0) litSpots.splice(i, 1); },
});

input.onPress("interact", () => { if (services.interact() || nightlife.interact() || casinos.interact() || (orlea && orlea.interact()) || (newton && newton.interact())) return; enterExitVehicle(); });
input.onPress("mute", () => toggleMute());
input.onPress("nextTrack", () => soundtrackReady.then((s) => s.next()));
// [ / ] step the graphics tier down / up; once you touch it, the auto
// governor stops overriding your choice.
input.onPress("gfxDown", () => stepGfxTier(-1));
input.onPress("gfxUp", () => stepGfxTier(1));
function stepGfxTier(dir) {
  GFX.adaptive = false;
  nextTier(dir);
  applyTier();
  flashGfx("graphics: " + TIERS[GFX.tier].name);
}

// Mouse: the first click captures the pointer (camera.js), after which the mouse
// looks around and left click shoots. Esc releases. Right-drag still orbits
// while the pointer is free, but is no longer required.
renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
const cine = createCinema({ camera, muted: () => music.muted });
let prologue = null;           // created once the car models have loaded
let missionClinic = null;      // missionClinic.js, "Transition Day". NOT WIRED: Keseme's story
                               // opens on the PROLOGUE as scripted, and "Hog Wild" is Mission 1.
                               // The module is left on disk, unbuilt and unstarted, so nothing is
                               // lost — re-create it here to put it back in the flow.
let actOne = null;             // Act One "Welcome Home" (actone.js), starts when the prologue ends
let orlea = null;              // the causeway + OrleaRouge, the south of the map (orlearouge.js)
let potholes = null;           // Tusouxroe's potholes (potholes.js)
let blueLight = null;          // Act One continued: Solange, the raid, the flood tunnel (bluelight.js)
let storyFail = null;
let westParish = null;         // Parish Highway 9 and the rural west (westparish.js)
let eastBank = null;           // Lafourchette, the east bank (eastbank.js, laid out by composer.js)
let tusouxroeNorth = null;     // North Tusouxroe, composed district
let stateWorld = null;         // State-Wide Expansion (stateWorld.js)
let nolantis = null;           // Act One continued underground: Nirbayou Nolantis (nolantis.js)          // a story chapter can catch WASTED / BUSTED and respawn instead
let welcomeBack = null;        // Act One part C: the Sheriff's Office, the montage, the surface (welcomeback.js)
let alternate = null;
let greedoCampaign = null;     // Gr33do's own campaign, "FIND PETA" (greedoCampaign.js)
let syncCampaign = null;       // Sync's own campaign, "THE TRIALS" (syncCampaign.js)
const buildingOccluders = [];  // tall buildings the camera must stay in front of
let mainStreetWest = -73;      // Main Street runs from US-167 west to the last shopfront
const camCtl = createCameraController({
  camera, dom: renderer.domElement,
  // The dev-mode map editor drives its own free-fly camera and owns
  // left-click (placing) / right-drag (its own orbit) while it's active —
  // without this the chase cam's click-to-lock and orbit fought it.
  canCapture: () => state.running && !state.over && !mapEditor.active,
});
// F4: world axes and every system's idea of forward (debug.js); the HUD compass
const orientDebug = createOrientationDebug({ scene });
const compass = createCompass();
// GTA-style radar (minimap.js): the base map is built once the level exists
const minimap = createMinimap({ MAP });
// the player's weapon slot (weapons.js) and what NPCs drop (loot.js)
// onReload is the one seam between the weapon slot and how it is presented:
// weapons.js says "this reload started and it takes this long" and weapons_3d.js
// turns that into the dip-and-return. Neither has to know about the other.
const arsenal = createArsenal({ state, flashObjective, onReload: notifyReload3D });
  initWeapons3D(scene);
const kills = { hog: 0, redneck: 0, hoodrat: 0, prostitute: 0 };
const EMOJI = { hog: "🐗", redneck: "🧢", hoodrat: "🎧", prostitute: "💋" };
const pauseMenu = createPauseMenu({ MAP, state, getPlayerPos: () => playerPos, minimap, arsenal, kills });
const loot = createLoot({
  scene, state, arsenal, flashObjective,
  getPlayerPos: () => playerPos,
  syncHUD: () => syncHUD(),
});
// the one clock and the current weather (worldtime.js, weather.js)
const worldTime = createWorldTime();
const weather = createWeather({ initial: "clear" });
// GTA-style car-jacking (hijack.js): F at a car someone's driving pulls them out first.
// Getters, not values: playerPos, enemies and npcs are declared further down.
const hijacker = createHijacker({
  state,
  getPlayerPos: () => playerPos,
  getPlayer: () => player,
  releaseFromTraffic: (v) => { if (traffic) traffic.releaseVehicle(v); },
  spawnDriver: (x, z) => { spawnEnemy(Math.random() < 0.55 ? "hoodrat" : "redneck", x, z); return enemies[enemies.length - 1]; },
  provoke: (e) => npcs.provoke(e),
  enterVehicle: (v) => { state.veh = v; if (v) { arsenal.enforceVehicle(); if (multiplayerMode && multiplayer?.connected && v.netId) { multiplayer.send("VEHICLE_ENTER", { id: v.netId }); } } playerPos.copy(v.obj.position); player.visible = false; },
  flashObjective,
  crime,
});
const _blips = [];
function minimapBlips() {
  _blips.length = 0;
  if (pauseMenu && pauseMenu.customWaypoint) {
    _blips.push({ kind: "waypoint", x: pauseMenu.customWaypoint.x, z: pauseMenu.customWaypoint.z });
  }
  const wp = (blueLight && blueLight.waypoint) || (actOne && actOne.waypoint) || (greedoCampaign && greedoCampaign.waypoint) || (syncCampaign && syncCampaign.waypoint) || (prologue && prologue.waypoint);
  if (wp) _blips.push({ kind: "waypoint", x: wp.x, z: wp.z });
  for (const b of services.blips()) _blips.push(b);
  for (const b of nightlife.blips()) _blips.push(b);
  for (const b of casinos.blips()) _blips.push(b);
  for (const s of sheriffs) if (!s.dead) _blips.push({ kind: "cop", x: s.obj.position.x, z: s.obj.position.z });
  for (const e of enemies) if (!e.dead && e.state === "hostile") _blips.push({ kind: "hostile", x: e.spr.position.x, z: e.spr.position.z });
  return _blips;
}
input.onPress("debugOrientation", () => orientDebug.toggle());
renderer.domElement.addEventListener("mousedown", (e) => {
  if (state.running && e.button === 0 && !mapEditor.active) fire();
});

// ---------------------------------------------------------------- player
let player, playerObj;
const playerPos = new THREE.Vector3(ROAD_X, 0, SPAWN_Z);
// Pay 'n' Spray, gun counters, hospitals, Popeyes counters (services.js). Districts
// register their own spots through ctx.addService; the garages are built in boot().
const services = createServices({
  scene, state, playerPos, arsenal, flashObjective, addBlocker,
  get cine() { return cine; },
  syncHUD: () => syncHUD(),
  stopVehicleFire: (v) => stopVehicleFire(v),
  clearWanted: () => {
    state.heat = 0;
    state.wanted = 0;
    state.crimeCd = 0;
    police.clearPursuit();
    syncHUD();
  },
});
const addService = (o) => services.add(o);
// Frenchmen Street's bars and clubs (nightlife.js): built on an OrleaRouge block in boot()
const nightlife = createNightlife({
  scene, state, playerPos, flashObjective, poolLight, addBlocker, music,
  get cine() { return cine; },
  get camera() { return camera; },
  getPlayer: () => player,
  setPlayerPos: (x, z) => {
    playerPos.set(x, 0, z);
    player.position.set(x, 0, z);
    if (player._last) player._last.copy(player.position);
  },
  syncHUD: () => syncHUD(),
  bark: (type, label, female) => speakPedestrian({ type, spr: { female } }, bumpLine(type, label)),
});
const casinos = createCasinos({
  scene, state, playerPos, flashObjective, poolLight, addBlocker,
  makeNeonSign, syncHUD: () => syncHUD(),
});
// How the game works, as it becomes useful (tips.js): the story walks through
// guns, healing, wanted stars and Pay 'n' Spray after the prologue; each also
// fires by itself the first time it matters.
const tips = createTips({
  getContext: () => ({
    running: state.running && !state.over,
    cinematic: state.cinematic || !!state.paused,
    hp: state.hp, cash: state.cash, wanted: state.wanted, inCar: !!state.veh,
    storyStarted: !!(actOne && actOne.phase !== "idle"),
    inOrlea: !!(orlea && orlea.inCity(playerPos.x, playerPos.z)),
  }),
});
let playerFacing = new THREE.Vector3(0, 0, -1);   // last movement direction
let beginGame = null;
let gameLaunched = false;     // confirmCharacter launches the game once (see there)
let pendingLaunch = "story";
let selectionIndex = 0;
let multiplayerMode = false;
let multiplayer = null;
const remotePlayers = new Map();
const _remoteTarget = new THREE.Vector3();
let networkInputTimer = 0;
const characterIds = Object.keys(PLAYER_CHARACTERS);

function renderCharacterSelect() {
  const id = characterIds[selectionIndex], cfg = getPlayerCharacter(id);
  state.selectedCharacter = id; state.campaign = cfg.campaign;
  characterName.textContent = cfg.name;
  characterSubtitle.textContent = cfg.subtitle;
  characterAbility.textContent = cfg.ability;
  characterDescription.textContent = cfg.description;
  characterPortrait.textContent = cfg.portrait;
  characterPortrait.style.setProperty("--accent", cfg.accent);
  for (const card of characterCards.querySelectorAll("button")) {
    const active = card.dataset.id === id;
    card.classList.toggle("selected", active); card.setAttribute("aria-pressed", String(active));
  }
}
function openCharacterSelect(mode = "story") {
  pendingLaunch = mode; introPanel.hidden = true; characterSelect.hidden = false;
  selectionIndex = Math.max(0, characterIds.indexOf(state.selectedCharacter)); renderCharacterSelect();
}
function closeCharacterSelect() { characterSelect.hidden = true; introPanel.hidden = false; }
function replacePlayerCharacter(id) {
  const next = createPlayerCharacter(id, {
    makePeta: () => makeCastMember(makeHoodrat, "keseme", { height: 1.74 }), makeHoodrat,
  });
  if (player) scene.remove(player); player = next; player.position.copy(playerPos); scene.add(player);
}
function confirmCharacter() {
  const id = characterIds[selectionIndex], cfg = getPlayerCharacter(id);
  state.selectedCharacter = id; state.campaign = cfg.campaign; state.hp = cfg.health;
  if (id !== "keseme" && id !== "peta") replacePlayerCharacter(id);   // the starting player is already Keseme's model
  if (multiplayerMode && multiplayer) {
    multiplayer.selectCharacter(id); characterSelect.hidden = true; multiplayerPanel.hidden = false; mpMessage.textContent = `${cfg.name} selected. Ready when you are.`; return;
  }
  if (!beginGame || gameLaunched) return;
  resumeAudio();   // the AudioContext starts suspended until a user gesture — this click is one
  // Launch once. The select used to stay open under the hidden overlay, so every later Enter
  // (next cutscene line) or Space (jump) confirmed the character again and restarted the game:
  // the story opening queued again and again, and free roam reset on every jump.
  gameLaunched = true;
  characterSelect.hidden = true;
  beginGame();
  if (cfg.campaign === "alternate") { prologue.skip(); alternate.start(); return; }
  if (cfg.campaign === "greedo") { prologue.skip(); greedoCampaign.start(); return; }
  if (cfg.campaign === "sync") { prologue.skip(); syncCampaign.start(); return; }
  if (pendingLaunch === "story") prologue.start();
  else {
    prologue.skip(); music.volume = musicVolume; soundtrackReady.then((s) => s.play());
    flashObjective("Click the game to look around with the mouse · Esc releases it");
    // Free Roam: every gun, no reload grind (human request, 2026-09-20).
    // weapons.js checks this flag itself so it survives weapon switches and
    // pickups, not just the initial grant.
    state.freeRoam = true;
    state.reserve = { pistol: Infinity, tec9: Infinity, sawnoff: Infinity, deerRifle: Infinity };
    state.ammo = Infinity;
    arsenal.render();
    // Zombie Survival Nightmare (human request, 2026-09-23): a free-roam
    // variant, not the default — ordinary Free Roam is untouched. Cuts
    // straight to night so the horde (updateZombiePopulation) is already out
    // instead of the player waiting through a daylight freeze first.
    if (pendingLaunch === "zombie") {
      state.zombieMode = true;
      // worldTime.isNight() (worldtime.js) is what updateZombiePopulation
      // gates on, and its own night threshold is 22:00, not daycycle.js's
      // visual dusk — 21:00 reads dark already but isNight() would still say
      // no and the horde would never spawn. 22:30 clears both.
      worldTime.setTime(22.5);
      flashObjective("The Bayou is infected. Survive the night.");
    }
  }
}
for (const id of characterIds) {
  const cfg = PLAYER_CHARACTERS[id], b = document.createElement("button");
  b.type = "button"; b.dataset.id = id; b.textContent = cfg.name; b.style.setProperty("--accent", cfg.accent);
  b.addEventListener("click", () => { selectionIndex = characterIds.indexOf(id); renderCharacterSelect(); }); characterCards.appendChild(b);
}
confirmCharacterBtn.addEventListener("click", confirmCharacter); backCharacterBtn.addEventListener("click", closeCharacterSelect);
addEventListener("keydown", (e) => {
  if (characterSelect.hidden || state.running) return;   // the select keys are dead once the game runs (Enter is the cutscene key, Space jumps)
  if (e.code === "ArrowLeft" || e.code === "ArrowUp") { e.preventDefault(); selectionIndex = (selectionIndex + characterIds.length - 1) % characterIds.length; renderCharacterSelect(); }
  else if (e.code === "ArrowRight" || e.code === "ArrowDown") { e.preventDefault(); selectionIndex = (selectionIndex + 1) % characterIds.length; renderCharacterSelect(); }
  else if (e.code === "Enter" || e.code === "Space") { e.preventDefault(); confirmCharacter(); }
  else if (e.code === "Escape") { e.preventDefault(); closeCharacterSelect(); }
});

function drawMultiplayerRoom(room) {
  if (!room) {
    if (mpBrowserView) mpBrowserView.hidden = false;
    if (mpLobbyView) mpLobbyView.hidden = true;
    if (multiplayer) multiplayer.fetchRooms();
    return;
  }
  if (mpBrowserView) mpBrowserView.hidden = true;
  if (mpLobbyView) mpLobbyView.hidden = false;
  if (!room) return;
  mpCode.textContent = room.code || "—";
  mpPlayers.replaceChildren(...room.players.map((p) => {
    const el = document.createElement("div"); el.className = `mp-player${p.ready ? " ready" : ""}`;
    el.innerHTML = `<b>${p.character || "CHOOSING..."}</b><br><span class="mp-status">${p.id === multiplayer?.playerId ? "YOU · " : ""}${p.ready ? "READY" : "NOT READY"}${p.id === room.hostId ? " · HOST" : ""}</span>`; return el;
  }));
  const me = room.players.find((p) => p.id === multiplayer?.playerId);
  mpReady.disabled = !me?.character; mpReady.textContent = me?.ready ? "Unready" : "Ready";
  mpStart.disabled = multiplayer?.playerId !== room.hostId || room.players.some((p) => !p.character || !p.ready);
}

function drawMultiplayerRooms(rooms) {
  if (!mpRoomList) return;
  mpRoomList.innerHTML = "";
  if (!rooms || rooms.length === 0) {
    mpRoomList.innerHTML = "<div style='color: #888;'>No public rooms found. Create one!</div>";
    return;
  }
  rooms.forEach(r => {
    const d = document.createElement("div");
    d.style.cssText = "display: flex; justify-content: space-between; padding: 4px; border-bottom: 1px solid #333;";
    const name = document.createElement("span");
    name.textContent = `${r.name} (${r.players}/${r.maxPlayers})`;
    const btn = document.createElement("button");
    btn.textContent = "Join";
    btn.style.padding = "2px 8px";
    btn.onclick = () => {
      mpRoomInput.value = r.code;
      multiplayer?.joinRoom(r.code, mpJoinPassword.value);
    };
    d.appendChild(name);
    d.appendChild(btn);
    mpRoomList.appendChild(d);
  });
}

function openMultiplayer() {
  multiplayerMode = true; introPanel.hidden = true; characterSelect.hidden = true; multiplayerPanel.hidden = false;
  if (!multiplayer) multiplayer = createMultiplayer({ onConnection: (status, ping) => { mpConnection.textContent = `SERVER · ${status}${ping ? ` · ${Math.round(ping)}ms` : ""}`; }, onRooms: drawMultiplayerRooms, onDamage: (msg) => {
      if (msg.id === multiplayer?.playerId) {
         if (msg.health < state.hp) {
           hurtFlash();
           state.hp = msg.health;
           syncHUD();
           if (state.hp <= 0 && state.running && !state.over) wasted();
         }
      }
    },
    onRespawned: (msg) => {
      state.hp = 100;
      syncHUD();
      player.position.set(msg.x, msg.y, msg.z);
      playerPos.set(msg.x, msg.y, msg.z);
      camCtl.reset();
      camCtl.snap();
      player.visible = true;
      if (state.veh) {
        state.veh = null;
      }
    },
    onRoom: (room) => { drawMultiplayerRoom(room); if (room && room.phase === "PLAYING" && beginGame && !state.running) { multiplayerPanel.hidden = true; if (room.zombie) { state.zombieMode = true; worldTime.setTime(22.5); flashObjective("The Bayou is infected. Survive the night."); } else { flashObjective("Multiplayer bayou loaded · watch your six"); } state.freeRoam = true; state.reserve = { pistol: Infinity, tec9: Infinity, sawnoff: Infinity, deerRifle: Infinity }; state.ammo = Infinity; arsenal.render(); beginGame(); prologue.skip(); } }, onSnapshot: applyNetworkSnapshot, onError: (code) => { mpMessage.textContent = code.replaceAll("_", " "); } });
  multiplayer.connect();
}

const networkEntities = new Map();
function applyNetworkSnapshot(snapshot) {
  for (const data of snapshot.players || []) {
    if (data.id === multiplayer?.playerId) continue;
    let view = remotePlayers.get(data.id);
    if (!view) {
      view = createPlayerCharacter(data.character || "peta", { makePeta: () => makeCastMember(makeHoodrat, "keseme", { height: 1.74 }), makeHoodrat });
      view.position.set(data.x, data.y, data.z); scene.add(view); remotePlayers.set(data.id, view);
      if (view.arms) {
        view.userData.weaponRig = new RemoteWeaponRig(view);
      }
    }
    view.userData.netTarget = {
      x: data.x, y: data.y, z: data.z, yaw: data.yaw || 0,
      state: data.state, vehicle: Boolean(data.vehicle),
      weapon: data.weapon, aiming: Boolean(data.aiming), firing: Boolean(data.firing)
    };
  }
  const live = new Set((snapshot.players || []).map((p) => p.id));
  for (const [id, view] of remotePlayers) if (!live.has(id)) { scene.remove(view); remotePlayers.delete(id); }

  const liveEntities = new Set();
  for (const data of snapshot.entities || []) {
    liveEntities.add(data.id);
    let ent = networkEntities.get(data.id);
    if (!ent) {
      if (data.type === "vehicle") {
        // Find existing vehicle or create dummy
        const existing = vehicles.find(v => v.netId === data.id);
        if (existing) {
          ent = existing;
        } else {
          // If we are host, we shouldn't be receiving new entities we don't know about, except when joining
          if (multiplayer?.playerId === multiplayer?.room?.hostId && !data.clientOwned) continue;
          
          ent = { netId: data.id, type: "vehicle", obj: new THREE.Group() };
          scene.add(ent.obj);
          vehicles.push(ent);
          
          // load visual
          import("./vehicles.js").then(({ VEHICLE_DEFS }) => {
            const defName = Object.keys(VEHICLE_DEFS).find(k => k === data.model) || "fallback";
            const file = VEHICLE_DEFS[defName].file;
            const tex = VEHICLE_DEFS[defName].texture;
            // We can't easily call loadVehicle from here if it's not exported, wait, it's not exported from vehicles.js!
            // It's in main.js. Let's just use it.
          });
          // Actually loadVehicle is defined in main.js, we can just call it
          if (typeof loadVehicle === "function") {
             const defName = data.model || "fallback";
             // find file/tex from VEHICLE_DEFS in main.js? VEHICLE_DEFS is imported!
             const def = VEHICLE_DEFS[defName] || VEHICLE_DEFS.fallback;
             loadVehicle(def.file, def.texture || "blue.png").then(v => {
               if (ent.obj) ent.obj.add(v.obj);
             });
          }
        }
      } else if (data.type === "npc") {
         const existing = enemies.find(e => e.netId === data.id);
         if (existing) ent = existing;
         else {
           if (multiplayer?.playerId === multiplayer?.room?.hostId) continue;
           ent = spawnEnemy("hoodrat", data.x || 0, data.z || 0);
           ent.netId = data.id;
           ent.type = "npc"; // tag for the cleanup loop below
         }
      }
      if (ent) networkEntities.set(data.id, ent);
    }
    
    // Sync state
    if (ent && multiplayer?.playerId !== multiplayer?.room?.hostId) { // Only sync if we are not host
      if (data.type === "vehicle" && ent.owner !== multiplayer?.playerId) {
         ent.obj.position.set(data.x, data.y, data.z);
         if (data.yaw !== undefined) ent.heading = data.yaw;
         if (data.yaw !== undefined && ent.obj.rotation) ent.obj.rotation.y = data.yaw;
         ent.health = data.health;
         if (data.destroyed && !ent.exploded) {
            explodeCar(ent);
         }
         ent.owner = data.owner;
      } else if (data.type === "npc") {
         if (ent.spr) {
           ent.spr.position.set(data.x, data.y, data.z);
           if (data.yaw !== undefined) {
             if (ent.spr.rotation) ent.spr.rotation.y = data.yaw;
             ent._yaw = data.yaw;
           }
           if (data.anim && ent.spr.play) ent.spr.play(data.anim, { loop: true });
         }
         ent.hp = data.health;
         if (data.dead && !ent.dead) {
            ent.dead = true;
            if (ent.spr && ent.spr.play) ent.spr.play("death", { loop: false, force: true });
         }
      }
    }
  }

  for (const [id, ent] of networkEntities) {
    if (!liveEntities.has(id)) {
       if (ent.type === "vehicle") {
         scene.remove(ent.obj);
         const idx = vehicles.indexOf(ent);
         if (idx >= 0) vehicles.splice(idx, 1);
       } else if (ent.type === "npc" || ent.isEnemy) {
         if (ent.spr) scene.remove(ent.spr);
         else scene.remove(ent);
         const idx = enemies.indexOf(ent);
         if (idx >= 0) enemies.splice(idx, 1);
       }
       networkEntities.delete(id);
    }
  }
}


// A beat-up car smokes and licks with flame before it dies, rather than going
// from "fine" straight to "gone." One small rig (cone flame + smoke puff +
// flickering light) parented to the car so it rides along while still driving
// or rolling to a stop.
const VEHICLE_FIRE_HP_FRAC = 0.3;   // catch fire once this much health is left
const WRECK_DESPAWN_DIST = 75;      // m: how far the player has to move off before a wreck clears
function startVehicleFire(v) {
  // No `!v.exploded` guard: explodeCar deliberately restarts this rig as the
  // wreck's smoulder once the car is already flagged exploded.
  if (v.onFire || !v.obj) return;
  v.onFire = true;
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a1e).multiplyScalar(2.6) });
  flameMat.userData.gtbRealized = true;
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.85, 7), flameMat);
  flame.position.y = 0.4;
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x161513, transparent: true, opacity: 0.45, depthWrite: false });
  smokeMat.userData.gtbRealized = true;
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), smokeMat);
  smoke.position.y = 1.0;
  const group = new THREE.Group();
  group.add(flame, smoke);
  group.position.set(0, 0.85, 0);          // above the hood, in the car's own local space
  v.obj.add(group);
  v.fireFx = { group, flame, smoke, phase: Math.random() * 9 };
}
function stopVehicleFire(v) {
  if (!v.fireFx) return;
  v.obj.remove(v.fireFx.group);
  v.fireFx = null;
  v.onFire = false;
}
let litFires = 0;
function updateVehicleFire(v, dt) {
  const f = v.fireFx;
  if (!f) return;
  f.phase += dt * (7 + Math.sin(f.phase * 0.3) * 2);
  const flick = 0.75 + Math.sin(f.phase) * 0.25;
  f.flame.scale.setScalar((v.exploded ? 0.55 : 0.85) + Math.sin(f.phase * 1.3) * 0.15);

  if (litFires < fireLights.length) {
    const l = fireLights[litFires++];
    l.position.copy(v.obj.position).setY(v.obj.position.y + 1.4);
    l.intensity = (v.exploded ? 2.2 : 5) * flick;
  }
}
function updateVehicleFires(dt) {
  litFires = 0;
  for (const v of vehicles) if (v.fireFx && !v.exploded) updateVehicleFire(v, dt);
}
/** Charred wrecks left standing after an explosion; they clear once the
 * player has moved well away rather than on a fixed timer. */
function updateWrecks(dt) {
  const at = state.veh ? state.veh.obj.position : playerPos;
  for (let i = wrecks.length - 1; i >= 0; i--) {
    const v = wrecks[i];
    updateVehicleFire(v, dt);
    const d = Math.hypot(at.x - v.obj.position.x, at.z - v.obj.position.z);
    if (d > WRECK_DESPAWN_DIST) {
      stopVehicleFire(v);
      scene.remove(v.obj);
      wrecks.splice(i, 1);
    }
  }
  for (; litFires < fireLights.length; litFires++) fireLights[litFires].intensity = 0;
}

function explodeCar(v) {
  if (v.exploded) return;
  v.exploded = true;
  v.dead = true;
  v.speed = 0;
  if (v.audio) v.audio.destroy();

  // Turn it black — the charred wreck left behind, not just a paused car.
  v.obj.traverse(o => {
    if (o.isMesh && o.material) {
      if (Array.isArray(o.material)) {
        o.material.forEach(m => m.color && m.color.setHex(0x111111));
      } else if (o.material.color) {
        o.material.color.setHex(0x111111);
      }
    }
  });

  // Spawn explosion effect (using torch since muzzle is missing)
  const ex = new AnimatedSprite(atlases.torch, 8.0);
  ex.position.copy(v.obj.position).setY(1.5);
  scene.add(ex);
  ex.play("burn", { fps: 12, loop: false });
  setTimeout(() => scene.remove(ex), 500);
  wreckLight.position.copy(v.obj.position).setY(1.5);
  wreckLight.intensity = 30;
  setTimeout(() => { if (wreckLight.intensity === 30) wreckLight.intensity = 0; }, 1400);

  // The pre-death flame becomes the wreck's smoulder: same rig, calmer, and it
  // stays lit (updateWrecks) until the carcass itself despawns.
  stopVehicleFire(v);
  startVehicleFire(v);

  // Kick occupants out
  if (v.seats) {
    for (const seat of v.seats) {
      if (seat.occupant === "player") {
        state.veh = null;
        playerPos.copy(v.obj.position);
        playerPos.x += 2.5;
        player.position.copy(playerPos);
        player.visible = true;
      }
    }
  }

  // No longer driveable, in the way, or chasing anyone — but v.obj stays in
  // the scene as a wreck (see wrecks / updateWrecks) instead of vanishing.
  if (v.blocker) {
    const bi = blockers.indexOf(v.blocker);
    if (bi >= 0) blockers.splice(bi, 1);
    blockerGrid.remove(v.blocker);
  }
  const vi = vehicles.indexOf(v);
  if (vi >= 0) vehicles.splice(vi, 1);
  const si = sheriffs.indexOf(v);
  if (si >= 0) sheriffs.splice(si, 1);
  if (v.sheriff) { state.cash += 250; crime(0.6); flashObjective("Cruiser wrecked. +$250"); syncHUD(); }
  if (state.veh === v) state.veh = null;

  wrecks.push(v);
}

function updateRemotePlayers(dt) {
  for (const view of remotePlayers.values()) {
    const target = view.userData.netTarget;
    if (!target) continue;
    // Remote cars are not rendered yet, so hide the avatar while its owner is
    // driving and restore it immediately when the server reports an exit.
    view.visible = !target.vehicle;
    view.position.lerp(_remoteTarget.set(target.x, target.y, target.z), Math.min(1, dt * 12));
    view._yaw = target.yaw;
    if (view.play && view.userData.netLastState !== target.state) {
      if (target.state === "DEAD") {
        view.play("death", { loop: false, force: true });
      } else {
        view.play(target.state === "IDLE" ? "idle" : "walk");
      }
      view.userData.netLastState = target.state;
    }
    // play() only selects a clip; the character's update() advances its gait.
    // Omitting this left remote players permanently frozen in their idle pose.
    if (view.update && view.visible) view.update(dt);
    if (view.userData.weaponRig && view.visible) {
      const aimDir = new THREE.Vector3(Math.sin(target.yaw), 0, Math.cos(target.yaw));
      view.userData.weaponRig.update(aimDir, target.weapon, dt, target.aiming, target.firing);
    }
  }
}
multiplayerBtn.addEventListener("click", openMultiplayer);
const mpZombieMode = document.getElementById("mpZombieMode");
mpCreate.addEventListener("click", () => multiplayer?.createRoom({ visibility: mpVisibility.value, password: mpCreatePassword.value, zombie: mpZombieMode.checked }));
mpJoin.addEventListener("click", () => multiplayer?.joinRoom(mpRoomInput.value, mpJoinPassword.value));
if (mpRefreshRooms) mpRefreshRooms.addEventListener("click", () => multiplayer?.fetchRooms());
if (mpLeaveRoom) mpLeaveRoom.addEventListener("click", () => multiplayer?.leave());

mpPick.addEventListener("click", () => { multiplayerPanel.hidden = true; openCharacterSelect("multiplayer"); });
mpReady.addEventListener("click", () => { const me = multiplayer?.room?.players.find((p) => p.id === multiplayer.playerId); multiplayer?.ready(!me?.ready); });
mpStart.addEventListener("click", () => multiplayer?.startGame());
mpBack.addEventListener("click", () => {
  multiplayerMode = false;
  multiplayer?.leave();
  multiplayerPanel.hidden = true;
  showMenuPanel("root");
  introPanel.hidden = false;
});
// scratch vectors, so movement doesn't allocate every frame
const _mv = new THREE.Vector3(), _step = new THREE.Vector3(), _aim = new THREE.Vector3();
const _camFwd = new THREE.Vector3(), _camRight = new THREE.Vector3();
let playerMoveHeading = null;   // heading the player is walking (null standing), for camera recentring
let attackTimer = 0;
let bumpCd = 0;   // one pedestrian bark at a time, not a crowd shouting in unison

// ---------------------------------------------------------------- enemies
// Bayou trouble: Feral Hogs, Rednecks, Hoodrats, Prostitutes.
const enemies = [];
const swampTrees = [];
const atlases = {};   // name -> loaded atlas


const ENEMY_TYPES = {
  redneck: { label: "Redneck", kind: "sprite", atlas: "redneck", tint: 0xd6402a,
             h: 2.0, hp: 5, speed: 3.9, aggro: 22, melee: 1.9, dmg: 11, atkGap: 1.1 },
  hoodrat: { label: "Hoodrat", kind: "actor", tint: 0x6d95d6,
             h: 1.92, hp: 4, speed: 4.7, aggro: 24, melee: 1.8, dmg: 8, atkGap: 0.85 },
  hobo:    { label: "Hobo", kind: "hobo", tint: 0x5a5a40,
             h: 1.85, hp: 3, speed: 3.1, aggro: 15, melee: 1.8, dmg: 4, atkGap: 1.5 },
  prostitute: { label: "Prostitute", kind: "prostitute", tint: 0xe62b7e,
               h: 1.8, hp: 4, speed: 3.4, aggro: 24, melee: 1.8, dmg: 5, atkGap: 1.0 },
  hog:     { label: "Feral Hog", kind: "hog", tint: 0x000000,
             h: 1.0, hp: 6, speed: 2.3, aggro: 18, melee: 1.7, dmg: 20, atkGap: 1.6 },
             
  // New NPCS
  dockworker: { label: "Dockworker", kind: "sprite", atlas: "redneck", tint: 0xffa500, // orange vest
                h: 2.05, hp: 7, speed: 3.5, aggro: 22, melee: 2.0, dmg: 14, atkGap: 1.3 },
  mechanic: { label: "Mechanic", kind: "sprite", atlas: "redneck", tint: 0x444488, // blue overalls
              h: 1.95, hp: 5, speed: 4.0, aggro: 23, melee: 1.9, dmg: 10, atkGap: 1.1 },
  suit: { label: "Suit", kind: "sprite", atlas: "redneck", tint: 0x222222, // dark suit
          h: 1.9, hp: 4, speed: 4.2, aggro: 22, melee: 1.8, dmg: 7, atkGap: 1.2 },
  tourist: { label: "Tourist", kind: "sprite", atlas: "oldman", tint: 0x88ccff, // bright shirt
             h: 1.85, hp: 3, speed: 3.6, aggro: 20, melee: 1.8, dmg: 4, atkGap: 1.4 },
  thug: { label: "Thug", kind: "actor", tint: 0x333333, // dark hoodrat 3D actor
          h: 1.98, hp: 8, speed: 4.5, aggro: 25, melee: 2.0, dmg: 12, atkGap: 0.9 },
  // OrleaRouge's out crowd (characters.js; lines in pedestrianChatter.js)
  gayman: { label: "Gay Guy", kind: "gayman", tint: 0xff4fb3,
            h: 1.86, hp: 4, speed: 3.9, aggro: 20, melee: 1.8, dmg: 6, atkGap: 1.1 },
  lesbian: { label: "Lesbian", kind: "lesbian", tint: 0x9b5de5,
             h: 1.78, hp: 4, speed: 3.8, aggro: 22, melee: 1.8, dmg: 7, atkGap: 1.0 },
  tuxedo: { label: "Tuxedo Regular", kind: "tuxedo", tint: 0x151515,
            h: 1.86, hp: 4, speed: 3.5, aggro: 18, melee: 1.8, dmg: 5, atkGap: 1.2 },
  highendescort: { label: "High-End Escort", kind: "highendescort", tint: 0x7f173d,
                   h: 1.82, hp: 4, speed: 3.4, aggro: 18, melee: 1.8, dmg: 5, atkGap: 1.2 },
  // klan.js only. Deliberately absent from every spawnzones.js mix: they are a
  // set piece that turns out at night, never ambient street population. Tougher
  // and slower than a Redneck — they come in a group and they do not scatter.
  klansman: { label: "Klansman", kind: "klansman", tint: 0xe8e4d8,
              h: 2.0, hp: 9, speed: 3.7, aggro: 30, melee: 2.0, dmg: 13, atkGap: 1.0 },
  // Keseme's people, as fighting NPCs rather than cutscene props — the same rig
  // the story cast already uses (prologue.js CAST), driven by the same AI as
  // everyone else, so they chase, swing and take hits for real. Tough on
  // purpose: watching Mally get dropped by the third man through the gate is
  // not the scene. klan.js is the only thing that spawns these.
  mally: { label: "Mally", kind: "cast", who: "mally", tint: 0x2f9e44,
           h: 1.9, hp: 26, speed: 4.7, aggro: 34, melee: 2.0, dmg: 9, atkGap: 0.75 },
  bubba: { label: "Bubba", kind: "cast", who: "bubba", tint: 0x6a6f3c,
           h: 1.96, hp: 32, speed: 4.2, aggro: 34, melee: 2.1, dmg: 12, atkGap: 0.9 },
  // Zombie-mode only (main.js: state.zombieMode). Weak one-on-one — a couple
  // of hits from anything drops one — but slow to notice and then relentless
  // (npc.js) once it does, and it comes in numbers. `aggro` doubles as its
  // detection range here, not just its leash.
  zombie: { label: "Zombie", kind: "actor", tint: 0x6b8f5a,
            h: 1.9, hp: 5, speed: 2.1, aggro: 30, melee: 1.7, dmg: 9, atkGap: 0.8 },
};

function buildHog() {
  const g = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: 0x3b2f28, roughness: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x241c18, roughness: 1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.0, 0.95), hide);
  body.position.y = 0.95; body.castShadow = true;
  const rump = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 1.05), hide);
  rump.position.set(-0.7, 1.0, 0); rump.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), hide);
  head.position.set(1.0, 0.8, 0); head.castShadow = true;
  const snout = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.5), dark);
  snout.position.set(1.45, 0.7, 0);
  const tuskGeo = new THREE.ConeGeometry(0.07, 0.35, 5);
  const tuskMat = new THREE.MeshStandardMaterial({ color: 0xe8e0cc });
  const t1 = new THREE.Mesh(tuskGeo, tuskMat); t1.position.set(1.5, 0.6, 0.18); t1.rotation.z = -0.5;
  const t2 = t1.clone(); t2.position.z = -0.18;
  const legGeo = new THREE.BoxGeometry(0.22, 0.7, 0.22);
  const legs = [];
  for (const [lx, lz] of [[0.6, 0.34], [0.6, -0.34], [-0.7, 0.36], [-0.7, -0.36]]) {
    const l = new THREE.Mesh(legGeo, dark);
    l.position.set(lx, 0.35, lz); l.castShadow = true;
    legs.push(l); g.add(l);
  }
  g.add(body, rump, head, snout, t1, t2);
  g.userData.legs = legs;
  return g;
}

// Home turf NPCs hang around: every lot on the strip, the trailer park, the
// junkyard, the shack, Ruston's main street and the shoulders in between.
const NPC_POIS = [
  // the strip is a row of storefronts: small radii keep loiterers out front
  ...LANDMARKS.map(([, side, z]) => ({ x: ROAD_X + side * (LOT_X - 11), z, r: 6 })),
  { x: -48, z: 116, r: 12 }, { x: -75, z: 120, r: 14 }, // homeless tent camp
  { x: 48, z: 100, r: 9 }, { x: 34, z: 88, r: 5 },
  ...[-60, -40, -20, 0, 20, 40].map((x) => ({ x, z: -78, r: 6 })),
];
for (let z = MAP.maxZ - 16; z > MAP.minZ + 16; z -= 24) {
  NPC_POIS.push({ x: ROAD_X + (z % 48 ? 9 : -9), z, r: 4 });
}
// Zombie mode (state.zombieMode) wants an actual horde bearing down on the
// player, not npc.js's usual 7-assailant cap meant for ordinary street fights.
// state.zombieMode is only known once the player picks the mode from the
// menu, well after this module-scope call runs, so the cap is read live
// through a getter rather than snapshotted here.
const ZOMBIE_MAX_HOSTILE = 20;
const npcs = createNpcSystem({
  pois: NPC_POIS, resolveCollision, hitPlayer, bounds: MAP, worldTime,
  maxHostile: () => (state.zombieMode ? ZOMBIE_MAX_HOSTILE : MAX_HOSTILE),
});
// The Sheriff's search / give-up logic (police.js). The cruisers themselves are
// driven below in updateSheriffs; the module owns "where do they think you are".
const police = createPoliceSystem({
  scene, MAP, npcs, loot, hitPlayer, busted: () => busted(), shootPlayer: policeShoot,
  resolveCollision,          // foot deputies walked through walls without this
});
const npcEnv = {
  player: playerPos,
  driving: false,
  get veh() { return state.veh; },
  state,
  syncHUD,
  flashObjective,
  others: enemies,
  // a turf fight's loser (npc.js hitRival) drops loot but isn't the player's kill
  killEnemy: (e) => killEnemy(e, { turf: true }),
  // Zombie-mode safehouses (safehouses.js, declared just below; both are only
  // read lazily, at NPC think time): zombies can't enter one, and lose the
  // player while they stand in one
  get playerSafe() { return state.zombieMode && safehouses.insideSafehouse(playerPos.x, playerPos.z); },
  safehouseAt: (x, z) => (state.zombieMode ? safehouses.safehouseAt(x, z) : null),
  onScream: playZombieScream,   // a Screamer (zombies.js) going hostile
};
// What spawns where comes from the world context (spawnzones.js): no hogs in
// town or on the highway, an occasional one in the woods.
const spawnZones = createSpawnZones({
  MAP, ROAD_X, ROAD_HALF, LOT_X, getOrlea: () => orlea,
  residential: [{ x: -48, z: 116, r: 24 }, { x: 48, z: 100, r: 20 }],   // trailer park, junkyard
  extraZone: (x, z) => (stateWorld && stateWorld.zoneAt(x, z)) || (tusouxroeNorth && tusouxroeNorth.zoneAt(x, z)) || (westParish && westParish.zoneAt(x, z)) || (eastBank && eastBank.zoneAt(x, z)) || null,   // Hwy 9, Bayou Noir, Lafourchette
  coreMinX: -WORLD - 4,                                                   // town / city zones end at the old west edge
  worldTime,
  // crowd sinks pull spawns onto small busy places the sample ring would miss
  get gatherPois() {
    return eastBank && eastBank.zoneRects
      ? eastBank.zoneRects.filter(([n]) => n === "market_row")
          // r stays inside the square so scattered spawns keep to it
          .map(([, r]) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, r: Math.min(r.x1 - r.x0, r.z1 - r.z0) / 4 }))
      : [];
  },
});
// Rednecks and Hoodrats leave each other alone on their own turf; where the turfs
// meet (spawnzones.js border zones) they fight, near the player (factions.js).
const factionWar = createFactionWar({ npcs, spawnZones });
// Who actually threatened Keseme's mother (klan.js). Nothing here spawns on its
// own: a story beat or `__game.klan.nightRide(...)` has to call them out.
import { createSafehouses } from "./safehouses.js";
import { createOutbreak } from "./outbreak.js";
const safehouses = createSafehouses({ scene, addBlocker, poolLight });
// TASK-083: 8 outbreak-storytelling beats along the Strip/Chatboro stretch
// (dropped luggage, a barricaded gas station, a burned-out car, a warning
// sign, a checkpoint, scavenged trash, a crashed van, a blood trail toward
// the causeway). Placed against the real LANDMARKS lot positions; nothing
// dynamic, so nothing to hold onto after construction.
createOutbreak({ scene, addBlocker, makeBarrel, makePallet });
const klan = createKlan({
  scene, state, playerPos, cine, enemies, npcs,
  spawnEnemy, killEnemy, addBlocker, poolLight, flashObjective,
  setObjective: setStoryObjective,
  isNight: () => worldTime.isNight(),
  worldTime,
  // the strip of lawn between Emiko's door and the street — where the call
  // from nolantis.js was always pointing
  mamaLawn: { x: NADIA_DOOR.x, z: NADIA_DOOR.z - 4.6 },
  mamaDoor: NADIA_DOOR,
  mamaHouse: NADIA_HOME,
  teleport: (x, z, heading) => teleportPlayer(x, z, heading),
  makeCastMember: (who) => makeCastMember(makeHoodrat, who),
  getSheriffProto: () => sheriffProto,
  setCameraYaw: (yaw) => camCtl.addYaw(yaw - camCtl.yaw),
});

function spawnEnemy(typeName, x, z, spot = null) {
  let T = ENEMY_TYPES[typeName];
  // A zombie archetype (zombies.js) is still type "zombie" — every kill,
  // dawn-clear and loot check keys off that — with its own stats layered on
  // the base and the archetype name kept on the record.
  const archetype = typeName === "zombie" && spot && spot.archetype;
  if (archetype) T = { ...T, ...resolveArchetype(archetype) };
  let view;
  if (T.kind === "hog") {
    view = buildHog();
  } else if (typeName === "prostitute") {
    view = randomProstitute(rng, T.h);
  } else if (T.kind === "hobo") {
    view = randomHobo(rng, T.h);
  } else if (T.kind === "gayman") {
    view = randomGayMan(rng, T.h);
  } else if (T.kind === "lesbian") {
    view = randomLesbian(rng, T.h);
  } else if (T.kind === "tuxedo") {
    view = randomTuxedo(rng, T.h);
  } else if (T.kind === "highendescort") {
    view = randomHighEndEscort(rng, T.h);
  } else if (typeName === "zombie") {
    view = randomZombie(rng, T.h);
  } else if (T.kind === "cast") {
    view = makeCastMember(makeHoodrat, T.who);
  } else if (T.kind === "klansman") {
    // `spot.officer`: the one in the crimson robe, so a mission can point at
    // whoever is giving the orders without putting a health bar over him
    view = randomKlansman(rng, T.h, spot && spot.officer ? { officer: true } : {});
  } else if (T.kind === "actor") {
    view = randomHoodrat(rng, T.h);
  } else {
    view = new AnimatedSprite(atlases[T.atlas], T.h);
    view.setTint(T.tint);
  }
  view.position.set(x, 0, z);
  scene.add(view);
  const rec = {
    type: typeName, T, spr: view, hp: T.hp, t: rand(0, 3),
    atkCd: 0, dead: false, fade: 1, charge: 0, chargeCd: 0,
  };
  if (archetype) rec.archetype = archetype;
  // Hobos spawned at the tent camp belong there. A soft leash keeps them near
  // the tents instead of wandering into the trailer rows or being culled as
  // "too far away" while the player explores the rest of the map.
  if (typeName === "hobo" && spot && spot.camp === "homeless") {
    rec.leash = { x: -75, z: 120, r: 18 };
  }
  // the zone's wander profile (spawnzones.js WANDER): city blocks keep people
  // on short, quick trips, the parish lets them spread out. `spot` is the
  // spawnzones.pick() result; spawners without one get the neutral default.
  if (spot && spot.wanderR != null) { rec.wanderR = spot.wanderR; rec.wanderSpeed = spot.wanderSpeed; }
  npcs.init(rec);
  enemies.push(rec);
  return rec;
}

let traffic = null;   // ambient cars (traffic.js), created once the car models load

// Things a traffic car should stop for, gathered into one reused array.
const _obstacles = [];
function trafficObstacles() {
  _obstacles.length = 0;
  _obstacles.push(playerPos);
  if (traffic) for (const c of traffic.cars) if (c.active) _obstacles.push(c.obj.position);
  for (const s of sheriffs) if (!s.dead) _obstacles.push(s.obj.position);
  for (const c of police.footCops) {
    if (!c.dead && Math.abs(c.spr.position.x - ROAD_X) < ROAD_HALF + 3) _obstacles.push(c.spr.position);
  }
  for (const e of enemies) {
    if (!e.dead && Math.abs(e.spr.position.x - ROAD_X) < ROAD_HALF + 3) _obstacles.push(e.spr.position);
  }
  for (const v of vehicles) {
    if (!v.traffic && !v.sheriff && v !== state.veh && Math.abs(v.obj.position.x - ROAD_X) < ROAD_HALF) {
      _obstacles.push(v.obj.position);
    }
  }
  // The Crown Strip's crossing (tusouxroeNorth.js): pedestrians *in the
  // carriageway*, as radius-bearing points — traffic.js never eases past one of
  // those, it waits. Everybody on the kerb is parked far outside the map and is
  // skipped by the same test, so this costs an array walk and nothing else.
  if (tusouxroeNorth) for (const p of tusouxroeNorth.crownCrossers) _obstacles.push(p);
  return _obstacles;
}
// ---------------------------------------------------------------- build the level
async function buildLevel() {
  // ---- Route 9: one long asphalt highway, swamp in the south, city in the north
  const roadMat = asphalt.material(1, { envMapIntensity: 0.9 });
  roadMat.normalScale.set(2.1, 2.1);
  for (const t of [roadMat.map, roadMat.normalMap, roadMat.roughnessMap]) {
    if (t) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, (MAP.maxZ - MAP.minZ + 40) / 5); }
  }
  // US-167 runs the whole length of the map, and becomes OrleaRouge's main boulevard
  const road = new THREE.Mesh(new THREE.PlaneGeometry(10, MAP.maxZ - MAP.minZ + 40), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(ROAD_X, GROUND_Y.highway, (MAP.maxZ + MAP.minZ) / 2);
  road.receiveShadow = true;
  scene.add(road);
  const lineMat = new THREE.MeshStandardMaterial({
    color: 0xd9c14a, roughness: 0.62, metalness: 0, envMapIntensity: 1.1,
  });
  lineMat.userData.gtbRealized = true;
  for (let z = MAP.maxZ; z > TRUCK_Z; z -= 6) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 2.4), lineMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(ROAD_X, 0.05, z);
    scene.add(dash);
  }

  setLoadStage("loading the kit…", 8);
  const [wall, doorway, windowW, roofC, lamp, stop] = await Promise.all([
    loadKit("Wall/wall_01.gltf"), loadKit("Wall/Doorway/wall_doorway_01.gltf"),
    loadKit("Wall/Window/wall_window_01.gltf"), loadKit("Roof/Concrete/roof_concrete_01.gltf"),
    loadKit("Streetlamp/streetlamp_01.gltf"), loadKit("stopsign.gltf"),
  ]);

  initShackTex();

  // ================= CHATHAM (south) — the Louisiana line, trailer park =======
  // "Bienvenue en Louisiane" straddles the road at the very bottom; you spawn
  // just past it, nose pointed north up US-167.
  // player's RIGHT shoulder, just before the gas station, facing oncoming traffic
  makeWelcomeSign(ROAD_X + ROAD_HALF + 3.5, SIGN_Z, -0.35);
  makeWaterTower(-58, SPAWN_Z - 2, "CHATBORO", ["FAITH — FAMILY — FREEDOM"], "TERMS AND CONDITIONS APPLY");
  makeTrailerPark(-48, 116);
  makeJunkyard(48, 100);
  buildShack(wall, doorway, windowW, roofC, 34, 88, 0.15);

  // ================= THE HIGHWAY STRIP — every business lines the road =========
  const [tacoGLB, burgerGLB, shopGLB] = await Promise.all([
    loadGLB("./assets/models/tacos/Tacos.glb", null,
      /Taco|Grill|Shelf_S|Table|Meat|Tortilla|Board|Sauce|Onion|shepherd|Napkin|Plates|Sal|Oil/i),
    loadGLB("./assets/models/burgerpiz/BurgerPiz.glb", null, /BurgerPiz/i),
    loadGLB("./assets/models/buildings/Buildings.glb"),
  ]);
  const shopParts = shopGLB ? shopGLB.children.filter((c) => /Building/i.test(c.name || "")) : [];
  for (const [type, side, z, variant = 0] of LANDMARKS) {
    const [bx] = landmarkPos(side, z);
    const rot = -side * Math.PI / 2;         // front (+z local) faces the road
    roadApron(side, z, 20);                  // asphalt linking lot -> highway
    if (type === "popeyes") makePopeyes(bx, z, rot);
    else if (type === "shop") {
      const part = shopParts.length ? shopParts[variant % shopParts.length] : null;
      if (placeGlbLandmark(part, bx, z, rot, 22, "Shop", 0xffd9a0)) {
        for (const [ox, oz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) addBlocker(bx + ox, z + oz, 4.5);
      } else makePizzeria(bx, z, rot);
    }
    else if (type === "sixtwelve") makeSixtwelve(bx, z, rot);
    else if (type === "gasstation")
      makeGasStation(bx, z, rot, { name: "GAS·N·GEAUX", wall: 0xdedac9, trim: 0x2b6fb0, bg: "#f2efe2", band: "#c62b23", ink: "#1d4e8c" });
    else if (type === "burgerpiz")
      placeGlbLandmark(burgerGLB, bx, z, rot, 26, "BurgerPiz", 0xff5a3c)
        || makePizzeria(bx, z, rot);
    else if (type === "taco")
      placeGlbLandmark(tacoGLB, bx, z, rot, 14, "Tacos", 0xffd27a, -Math.PI)
        || makePizzeria(bx, z, rot);
    // every lot gets a parking-lot pole light out front
    litSpots.push({ x: bx - side * 9, y: 8.5, z: z + 9, warm: 0xffbf74, power: 170, range: 30, pole: true });
  }

  // services.js on the strip: a gun counter in the shop at the Chatboro end, and
  // Chatboro's Pay 'n' Spray on the empty west lot between the taco stand and the
  // next shop (z 7…15), open to the highway. Tusouxroe's is on US-167 at the south
  // edge of the north district, clear of its lamps and the filler rows.
  {
    const [gx] = landmarkPos(-1, 52);
    addService({ kind: "gun", name: "Chatboro Guns & Pawn", x: gx + 12.5, z: 52, face: Math.PI / 2 });
    services.buildPayNSpray(-27, 11, Math.PI / 2, "Chatboro Pay 'n' Spray");
    services.buildPayNSpray(15, -160, -Math.PI / 2, "Tusouxroe Pay 'n' Spray");
  }

  // streetlamps + one warm glow for the whole strip
  for (let z = SPAWN_Z; z > -100; z -= 22) {
    const L = placeKit(lamp, ROAD_X + ROAD_HALF + 1.5, z, 0, 0.6);
    if (L) addBlocker(ROAD_X + ROAD_HALF + 1.5, z, 0.4);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xffe6b0 }));
    bulb.position.set(ROAD_X + ROAD_HALF + 1.5, 4.4, z);
    scene.add(bulb);
    litSpots.push({ x: ROAD_X + ROAD_HALF + 1.5, y: 4.3, z, warm: 0xffd9a0, power: 90, range: 22 });
  }
  for (const lz of [78, 24, -30, -84]) poolLight(0xffcf8a, 90, 70, ROAD_X, 11, lz);
  // a few torches + shrooms only right around the spawn so it reads "bayou"
  makeTorch(ROAD_X - ROAD_HALF - 1.5, SPAWN_Z - 3, true);
  makeTorch(ROAD_X + ROAD_HALF + 1.5, SPAWN_Z - 10, true);
  makeTorch(ROAD_X - ROAD_HALF - 1.5, SPAWN_Z - 20, true);
  for (let i = 0; i < 10; i++) {
    const x = rand(-WORLD + 24, WORLD - 24), z = rand(60, WORLD - 24);
    if (!inKeepout(x, z)) makeShroom(x, z);
  }
  if (stop) placeKit(stop, ROAD_X - ROAD_HALF - 1, SPAWN_Z - 24, 0, 1.2);
  // The camp has a guaranteed population; the general spawner also knows about
  // hobos, but random roadside rolls should never empty their home base.
  for (const [x, z] of [[-75, 112], [-76, 119], [-68, 125], [-82, 128], [-69, 132], [-84, 120]]) {
    spawnEnemy("hobo", x, z, { camp: "homeless", wanderR: 0.55, wanderSpeed: 0.55 });
  }
  // Prostitutes work the commercial strip at dusk/night. Seed a few visible
  // encounters instead of relying on a 10% random roll plus a later night swap.
  for (const [x, z] of [[-18, 88], [6, 64], [-18, 34], [6, 4]]) {
    spawnEnemy("prostitute", x, z, { wanderR: 0.8, wanderSpeed: 1.05 });
  }
    makeWaterTower(64, 2, "TUSOUXROE", ["SOUTH SIDE"]);
  // Tusouxroe's welcome: redevelopment, and the neighbourhood's answer to it
  makeBillboard(ROAD_X - ROAD_HALF - 6, -38, 0.12,
    "LUXURY CONDOS", "COMING SOON", "WHERE WE SUPPOSED TO GO?");

  // ================= RUSTON (north) — small-town shopfronts =================
  const buildings = await loadGLB("./assets/models/buildings/Buildings.glb");
  if (buildings) {
    const parts = buildings.children.filter((c) => c.name && /Building/i.test(c.name));
    // two facing rows of low shopfronts along a main street
    for (const side of [-1, 1]) {
      // west from just past the Popeyes lots, so no shopfront lands on US-167
      let bx = -44;
      parts.forEach((src, i) => {
        if (!src) return;
        const b = src.clone(true);
        const sz = new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3());
        const s = (10 + (i % 3) * 3) / Math.max(sz.x, sz.z || 1);   // keep them small-town
        b.scale.setScalar(s);
        const w = sz.x * s;
        bx -= w / 2 + 1.5;
        b.position.set(bx, 0, -78 + side * 16);
        bx -= w / 2 + 1.5;
        b.rotation.y = side < 0 ? 0 : Math.PI;
        const gb = new THREE.Box3().setFromObject(b);
        b.position.y = -gb.min.y;
        scene.add(b);
        // Use the building's diagonal footprint, not an inscribed circle. The
        // old 0.4 radius left gaps at corners that let the player clip through.
        addBlocker(b.position.x, b.position.z, Math.hypot(sz.x, sz.z) * s * 0.52);
        // tall enough to swallow the camera: keep the lens in front of it
        const ob = new THREE.Box3().setFromObject(b);
        buildingOccluders.push({ minX: ob.min.x, maxX: ob.max.x, minY: ob.min.y, maxY: ob.max.y, minZ: ob.min.z, maxZ: ob.max.z });
        mainStreetWest = Math.min(mainStreetWest, ob.min.x - 3);
      });
    }
  }
  // plain asphalt lot around the truck (no dense-city street kit — off theme)
  const lotMat = asphaltMat.clone();
  lotMat.color.setHex(0xb9b9c2);
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(70, 44), lotMat);
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(ROAD_X, GROUND_Y.lot, -98);
  lot.receiveShadow = true;
  scene.add(lot);
  makeWaterTower(52, -92, "TUSOUXROE", ["CITY LIMITS"]);

  // ================= VEHICLES =================
  setLoadStage("towing in the cars…", 18);
  const [carR, carB, van, pickup, truckMesh, doclorean, beetle, landy, carY, tristar, toyoyo] = await Promise.all([
    loadVehicle("Car_1_R.fbx", "Car_1_R_128x128_Color.png"),
    loadVehicle("Car_1_B.fbx", "Car_1_B_128x128_Color.png"),
    loadVehicle("Van_1.fbx", "Van_1_128x128_Color.png"),
    loadVehicle("Pick_Up_1.fbx", "Pick_Up_1_128x128_Color.png"),
    loadVehicle("Truck_1.fbx", "Truck_1_128x128_Color.png"),
    loadDsCar("docLorean"), loadDsCar("Beatall"), loadDsCar("Landyroamer"),
    loadVehicle("Car_1_Y.fbx", "Car_1_Y_128x128_Color.png"),
    loadDsCar("Tristar Racer"), loadDsCar("Toyoyo Highlight"),
  ]);

  // wrecks scattered on the shoulders down the highway
  placeWreck(carR, ROAD_X + ROAD_HALF + 2, 88, 0.4);
  placeWreck(carB, ROAD_X - ROAD_HALF - 3, 44, 2.1);
  placeWreck(van, ROAD_X + ROAD_HALF + 3, 6, -0.7);
  placeWreck(pickup, ROAD_X - ROAD_HALF - 4, -34, 1.2);
  placeWreck(beetle, ROAD_X + ROAD_HALF + 2, -66, 0.9);
  placeWreck(landy, ROAD_X - ROAD_HALF - 3, 122, 2.6);   // by the spawn
  // the DeLorean, abandoned at the 6twelve pumps
  const gasSpot = landmarkPos(1, 100);
  if (doclorean) placeParked(doclorean, gasSpot[0] - 8, gasSpot[1] + 4, 1.1);

  const parkCars = [carR, carB, carY, van, pickup, beetle, landy, toyoyo].filter(Boolean);
  parkedCarSpots.forEach((s, i) => {
    const side = Math.sign(s.x - ROAD_X) || 1;
    for (let k = 0; k < 3; k++) {
      const src = parkCars[(i * 3 + k) % parkCars.length];
      if (!src) continue;
      // nose-in bays in the lot between the building and the road
      const px = ROAD_X + side * (9 + (k % 2) * 4.5);
      const pz = s.z - 5 + k * 4.5 + rand(-0.6, 0.6);
      placeParked(src.clone(true), px, pz, side * Math.PI / 2 + rand(-0.08, 0.08));
    }
  });

  // two-wheelers (bikes.js): parked where people would leave them. Each spot is a
  // guess; the bike goes on the nearest clear ground within a few metres of it.
  for (const [kind, x, z, rot] of BIKE_SPOTS) parkBike(kind, x, z, rot);

  // sheriff cruiser for the wanted system: police.js paints the two-tone livery,
  // the push bar and the red/blue lightbar over the pickup shell (TASK-020)
  if (pickup) sheriffProto = buildCruiserModel(pickup);

  // ---- the Prologue / Mission 1 set: Keseme's coupe, Mally's Bravado, the dirt road ----
  prologue = createPrologue({
    scene, camera, cine, state, playerPos, getPlayer: () => player, vehicles, enemies,
    registerVehicle, spawnEnemy, killEnemy, npcs, makeHoodrat, surface, hitPlayer,
    spawnTracer, muzzleFlash, flashObjective,
    makeThief: () => {
      const t = new AnimatedSprite(atlases.redneck, 1.9);
      t.setTint(0x9aa3ab);
      t.play("idle", { fps: 5 });
      return t;
    },
    setObjective: setStoryObjective,
    enterVehicle: (v) => {
        state.veh = v; if (v) { arsenal.enforceVehicle(); if (multiplayerMode && multiplayer?.connected && v.netId) { multiplayer.send("VEHICLE_ENTER", { id: v.netId }); } }
        playerPos.copy(v.obj.position);
        player.visible = false;
      },
    exitVehicle: () => {
        if (!state.veh) return;
        if (multiplayerMode && multiplayer?.connected) { multiplayer.send("VEHICLE_EXIT"); }
      state.veh.speed = 0;
      state.veh = null;
      player.visible = true;
    },
    startMusic: () => {
      music.volume = musicVolume;
      soundtrackReady.then((s) => s.play());
    },
    setPopulation: (on) => { populationOn = on; },
    onFinished: () => { if (actOne) actOne.start(); tips.story(); },
    models: { coupe: carB, bravado: carR, pickup },
    getSheriffProto: () => sheriffProto,
    ROAD_X, ROAD_HALF, SPAWN_Z, SIGN_Z,
  });
  prologue.buildSet();

  // ---- Act One set: South Tusouxroe and the Nadia kitchen ----
  actOne = createActOne({
    setCameraYaw: (yaw) => camCtl.addYaw(yaw - camCtl.yaw),
    startNext: () => { if (blueLight) blueLight.start(); },
    scene, camera, cine, state, playerPos, getPlayer: () => player, makeHoodrat, surface,
    makeBillboard, addBlocker, poolLight, flashObjective,
    makeCastMember: (who) => makeCastMember(makeHoodrat, who),
    addLitSpot: (spot) => litSpots.push(spot),
    setObjective: setStoryObjective,
    exitVehicle: () => {
        if (!state.veh) return;
        if (multiplayerMode && multiplayer?.connected) { multiplayer.send("VEHICLE_EXIT"); }
      state.veh.speed = 0;
      state.veh = null;
      player.visible = true;
    },
    teleport: (x, z, heading = 0) => {
      const v = state.veh;
      if (v) {
        v.obj.position.x = x; v.obj.position.z = z;
        v.heading = heading; v.obj.rotation.y = heading; v.speed = 0;
        v.blocker.x = x; v.blocker.z = z;
      }
      playerPos.set(x, 0, z);
      player.position.set(x, 0, z);
      if (player._last) player._last.copy(player.position);
    },
    // Act One's last beat: reaching Mama's door is where the night ride happens
    // (klan.js), which is what nolantis.js's phone call was always pointing at.
    nightRide: (onDone) => klan.nightRideOnMamas(onDone),
  });
  actOne.buildSet();

  // ---- the south: bayou causeway and the city of OrleaRouge ----
  orlea = createOrleaRouge({
    scene, surface, addBlocker, poolLight, makeBillboard, makeNeonSign,
    addLitSpot: (spot) => litSpots.push(spot),
    getSheriffProto: () => sheriffProto,
    cine, state, playerPos, ROAD_X, ROAD_HALF, addService,
    // cemetery.js, on the block at (-110, 350): the ghost needs a body, the hour,
    // and the HUD to hand back a blessing with. `enemies`/`npcs`/`police` are
    // what she keeps her ground with — see keepsHerGround().
    makeHoodrat, flashObjective, syncHUD, isNight: () => worldTime.isNight(),
    enemies, npcs, police,
    // whole blocks other modules build on, in place of the French District rowhouses
    lots: [
      { at: [-66, 230], build: (b) => payNSprayLot(b, "OrleaRouge Pay 'n' Spray") },
      { at: [-26, 270], build: (b) => nightlife.buildBlock(b) },        // Frenchmen Street
      // Party Central continues east: the same proven walk-in club system is
      // reused for the new modern nightlife blocks instead of sealed façades.
      { at: [134, 230], build: (b) => nightlife.buildBlock(b) },
      { at: [134, 310], build: (b) => nightlife.buildBlock(b) },
      { at: [94, 270], build: (b) => casinos.buildBlock(b) },
      { at: [94, 350], build: (b) => casinos.buildBlock(b) },
    ],
  });
  orlea.buildSet();
  NPC_POIS.push(...nightlife.pois);          // regulars hang out on the sidewalk outside the clubs
  NPC_POIS.push(...casinos.pois);            // casino foot traffic and valet-side crowds
  // Popeyes #2, on the OrleaRouge boulevard (#1 is a LANDMARKS lot on the strip)
  for (const p of POPEYES_LOCATIONS) {
    if (p.lot) continue;
    makePopeyes(p.x, p.z, p.rot);
    NPC_POIS.push({ x: p.x - 11, z: p.z, r: 8 });
  }
  NPC_POIS.push(...orlea.pois);          // npcs holds this same array
  // OrleaRouge needs pockets of people, not one wide field: corner hangouts on
  // the avenues (the boulevard POIs come from orlea.pois)
  for (const z of [225, 255, 285, 315, 345]) {
    NPC_POIS.push({ x: -46, z, r: 7 }, { x: 34, z, r: 7 });
  }
  // The expanded eastern nightlife blocks need their own pedestrian anchors;
  // otherwise the new venues would look busy only when the player is inside.
  for (const z of [230, 270, 310, 350]) {
    NPC_POIS.push({ x: 114, z, r: 9 }, { x: 154, z, r: 7 });
  }
  // A few visibly overdressed regulars sell the new district before the
  // casino interiors arrive. They remain calm civilian NPCs until provoked.
  for (const [x, z] of [[126, 222], [148, 222], [126, 302], [148, 302], [164, 342]]) {
    spawnEnemy("tuxedo", x, z);
  }
  for (const [x, z] of [[104, 262], [126, 342], [154, 362]]) {
    spawnEnemy("highendescort", x, z);
  }
  // the overpass deck, OrleaRouge's buildings, and Tusouxroe's shopfronts
  losBoxes = [...orlea.occluders, ...buildingOccluders];
  camCtl.setOccluders(losBoxes);

  // ---- Tusouxroe's roads, and 40 potholes on each one ----
  // Main Street runs between the two shopfront rows, west from US-167.
  {
    const len = (ROAD_X - ROAD_HALF) - mainStreetWest;
    const mat = asphalt.material(1);
    for (const t of [mat.map, mat.normalMap, mat.roughnessMap]) if (t) t.repeat.set(len / 9, 1);
    const mainStreet = new THREE.Mesh(new THREE.PlaneGeometry(len, 9), mat);
    mainStreet.rotation.x = -Math.PI / 2;
    mainStreet.position.set(ROAD_X - ROAD_HALF - len / 2, GROUND_Y.street, -78);
    mainStreet.receiveShadow = true;
    scene.add(mainStreet);
  }
  potholes = createPotholes({
    scene, perStreet: 40, seed: 20260913,
    streets: [
      { name: "US-167 (Tusouxroe)", x0: ROAD_X - ROAD_HALF + 0.6, x1: ROAD_X + ROAD_HALF - 0.6, z0: -132, z1: -32, y: 0.042 },
      { name: "Main Street", x0: mainStreetWest + 1, x1: ROAD_X - ROAD_HALF - 0.6, z0: -82, z1: -74, y: 0.041 },
      { name: "South Tusouxroe", x0: 31, x1: 122, z0: -109.8, z1: -102.2, y: 0.04 },
    ],
  });

  // ---- Act One, continued in OrleaRouge: "Blue Light Special" ----
  blueLight = createBlueLight({
    scene, camera, cine, state, playerPos, renderer, makeHoodrat, addBlocker, poolLight, flashObjective,
    getPlayer: () => player,
    makeCastMember: (who) => makeCastMember(makeHoodrat, who),
    getSheriffProto: () => sheriffProto,
    setObjective: setStoryObjective,
    setCameraYaw: (yaw) => camCtl.addYaw(yaw - camCtl.yaw),
    exitVehicle: () => {
        if (!state.veh) return;
        if (multiplayerMode && multiplayer?.connected) { multiplayer.send("VEHICLE_EXIT"); }
      state.veh.speed = 0;
      state.veh = null;
      player.visible = true;
    },
    teleport: (x, z, heading = 0) => {
      const v = state.veh;
      if (v) {
        v.obj.position.x = x; v.obj.position.z = z;
        v.heading = heading; v.obj.rotation.y = heading; v.speed = 0;
        v.blocker.x = x; v.blocker.z = z;
      }
      playerPos.set(x, 0, z);
      player.position.set(x, 0, z);
      if (player._last) player._last.copy(player.position);
    },
    // the chapter puts the police on you (whatever the kill count) and calls them off
    setWanted: (stars) => {
      state.forceCops = true;
      state.heat = Math.max(state.heat, stars * 1.4 + 0.2);
      state.wanted = stars;
      state.crimeCd = 6;
      syncHUD();
    },
    holdWanted: (stars) => {
      state.crimeCd = 6;
      state.heat = Math.max(state.heat, stars * 1.4 + 0.2);
    },
    clearPolice: () => {
      // same removal as a destroyed vehicle, minus the fire; keep one the player drives
      for (const s of sheriffs) {
        if (s === state.veh || s.dead) continue;
        s.dead = true;
        scene.remove(s.obj);
        const bi = blockers.indexOf(s.blocker);
        if (bi >= 0) blockers.splice(bi, 1);
        blockerGrid.remove(s.blocker);
        const vi = vehicles.indexOf(s);
        if (vi >= 0) vehicles.splice(vi, 1);
      }
      sheriffs.length = 0;
      for (const b of beaconLights) b.intensity = 0;
      state.forceCops = false;
      state.heat = 0;
      state.wanted = 0;
      state.bustCd = 0;
      syncHUD();
    },
    revive: () => { state.hp = 100; state.hurtCd = 1; syncHUD(); },
    setFail: (fn) => { storyFail = fn; },
    startNext: () => { if (nolantis) nolantis.start(); },
  });
  blueLight.buildSet();

  // ---- the west: Parish Highway 9 through the pines to Bayou Noir, looping into OrleaRouge ----
  westParish = createWestParish({
    scene, camera, surface, addBlocker, flashObjective, shopParts,
    roadMaterial: () => asphalt.material(1, { envMapIntensity: 0.9 }),
    addLitSpot: (spot) => litSpots.push(spot),
    makeShed, makeFence, makeBarrel, makePallet, makeWaterTower, makeBillboard, makeGasStation, placeGlbLandmark, loadGLB,
  });
  westParish.buildSet();
  NPC_POIS.push(...westParish.pois);

  // ---- Lafourchette: the east bank, composed road → buildings → side streets → open areas → vegetation → landmark ----
  eastBank = createEastBank({
    scene, camera, surface, addBlocker, flashObjective, shopParts,
    roadMaterial: () => asphalt.material(1, { envMapIntensity: 0.9 }),
    addLitSpot: (spot) => litSpots.push(spot),
    makeShed, makeFence, makeBarrel, makePallet, makeWaterTower, placeGlbLandmark, loadGLB,
  });
  eastBank.buildSet();
  NPC_POIS.push(...eastBank.pois);
  // the Saturday market on Market Row gets a POI ring of its own — the crowd
  // keeps to the square, weaving between the stalls (npc.js marketSaturday)
  if (eastBank.zoneRects) {
    for (const [zoneName, rect] of eastBank.zoneRects) {
      if (zoneName !== "market_row") continue;
      const cx = (rect.x0 + rect.x1) / 2, cz = (rect.z0 + rect.z1) / 2;
      NPC_POIS.push({ x: cx, z: cz, r: Math.min(rect.x1 - rect.x0, rect.z1 - rect.z0) / 4 });
      NPC_POIS.push({ x: rect.x0 + 6, z: cz, r: 4 }, { x: rect.x1 - 6, z: cz, r: 4 });
    }
  }

  // ---- North Tusouxroe: Commercial & Civic District (composed 6-stage lifecycle) ----
  tusouxroeNorth = createTusouxroeNorth({
    scene, camera, surface, addBlocker, flashObjective, addService,
    roadMaterial: () => asphalt.material(1, { envMapIntensity: 0.9 }),
    addLitSpot: (spot) => litSpots.push(spot),
    placeGlbLandmark, loadGLB,
    // the strip's crowd works a shift off this (crowd.js setShift): staff hold
    // the venues all day, the nightlife turns up after dark
    worldTime,
  });
  tusouxroeNorth.buildSet();
  NPC_POIS.push(...tusouxroeNorth.pois);
  // The ghost of Huey P. Newton, in the yard at Willowbrook School (newton.js).
  // He was born in Monroe, which is one of the three towns this game is set
  // between, so the north is where he belongs — not the OrleaRouge end.
  // tusouxroeNorth.js puts the school at (WEST_STREET_X - 22, -320) facing east.
  newton = createNewton({
    scene, state, playerPos, cine, flashObjective, syncHUD,
    makeHoodrat, poolLight, addBlocker, worldTime,
    // he has one thing to say about the night ride, and nothing to say until
    // it has happened (klan.js)
    getKlanPhase: () => klan.missionPhase,
  }, { x: -132 + 9, z: -320 + 11, ry: 0 });
  // ---- State-Wide Expansion: Port Calypso Docks, Cypress Badlands, Lakeshore Marsh ----
  stateWorld = createStateWorld({
    scene, camera, surface, addBlocker, flashObjective, addService, shopParts,
    roadMaterial: () => asphalt.material(1, { envMapIntensity: 0.9 }),
    addLitSpot: (spot) => litSpots.push(spot),
    placeGlbLandmark, loadGLB,
    // landmarks.js's placeParkedCar / placeTruck call these, and quietly did
    // nothing while this ctx lacked them (TASK-084): no parked car, pickup or
    // van ever appeared anywhere in the state
    loadDsCar, loadVehicle,
    makeWaterTower, makeBillboard, makeBarrel, makePallet, makeFence, makeShed, makeGasStation,
    buildPayNSpray: (x, z, rot, name) => services.buildPayNSpray(x, z, rot, name),
  });
  stateWorld.buildSet();
  NPC_POIS.push(...stateWorld.pois);
  losBoxes = [...orlea.occluders, ...buildingOccluders, ...tusouxroeNorth.occluders, ...stateWorld.occluders];
  camCtl.setOccluders(losBoxes);

  // ---- Act One part C, "Welcome Back to Dixie": sets under Chatboro, montage dressing, helicopters ----
  welcomeBack = createWelcomeBack({
    scene, camera, cine, state, makeHoodrat, poolLight,
    makeCastMember: (who) => makeCastMember(makeHoodrat, who),
    getPlayer: () => player,
  });
  welcomeBack.buildSet();

  // ---- Nirbayou Nolantis: a sealed cavern set well west of the map ----
  nolantis = createNolantis({
    scene, camera, cine, state, playerPos, MAP, makeHoodrat, addBlocker, poolLight, surface, flashObjective,
    getPlayer: () => player,
    partC: welcomeBack,                                       // after The Truth, the rest of the script
    // "I'm going to protect my family": back north to Mama's (actone.js). Nolantis always
    // called startNext, but nothing was wired, so the HUD fell back to the gas cans.
    startNext: () => { if (actOne) actOne.protectMama(); },
    makeCastMember: (who) => makeCastMember(makeHoodrat, who),
    setObjective: setStoryObjective,
    setCameraYaw: (yaw) => camCtl.addYaw(yaw - camCtl.yaw),
    setPopulation: (on) => { populationOn = on; },
    getMapCanvas: () => minimap.baseCanvas,
    returnTo: { x: 120, z: 372, heading: Math.PI },          // up the ladder by the storm drain
    exitVehicle: () => {
        if (!state.veh) return;
        if (multiplayerMode && multiplayer?.connected) { multiplayer.send("VEHICLE_EXIT"); }
      state.veh.speed = 0;
      state.veh = null;
      player.visible = true;
    },
    teleport: (x, z, heading = 0) => {
      const v = state.veh;
      if (v) { v.speed = 0; state.veh = null; }
      playerPos.set(x, 0, z);
      player.position.set(x, 0, z);
      player.visible = true;
      if (player._last) player._last.copy(player.position);
    },
  });
  nolantis.buildSet();

  // ---- ambient traffic: both lanes of US-167 ----
  traffic = createTraffic({
    scene, registerVehicle,
    // Bikes are part of the pooled traffic population now, not just parked
    // decoration. A modest share keeps the city believable without replacing
    // the car-heavy baseline.
    models: [carR, carB, carY, van, pickup, beetle, landy, tristar, toyoyo,
      normalizeVehicleModel(buildMotorbike(), VEHICLE_DEFS.motorbike),
      normalizeVehicleModel(buildScooter(), VEHICLE_DEFS.scooter),
      normalizeVehicleModel(buildLimo(), VEHICLE_DEFS.limo)],
    makeRider: () => randomHoodrat(rng, 1.78),
    lanes: (() => {
      // Circuits, not dead ends: pair every lane with the lane that starts
      // where it ends (the return carriageway — all roads here run both ways).
      // A car that runs out of lane hands over instead of vanishing
      // (traffic.js "next"); lanes with no partner just wait at the end.
      const all = [
        { name: "northbound", points: [[ROAD_X + 2.4, MAP.maxZ - 2], [ROAD_X + 2.4, MAP.minZ + 2]], cruise: [12, 19] },
        { name: "southbound", points: [[ROAD_X - 2.4, MAP.minZ + 2], [ROAD_X - 2.4, MAP.maxZ - 2]], cruise: [12, 19] },
        ...(orlea ? orlea.lanes : []),
        ...(westParish ? westParish.lanes : []),
        ...(eastBank ? eastBank.lanes : []),
        ...(tusouxroeNorth ? tusouxroeNorth.lanes : []),
        ...(stateWorld ? stateWorld.lanes : []),
      ];
      const start = (l) => l.points[0], end = (l) => l.points[l.points.length - 1];
      const near = (p, q, tol = 15) => Math.hypot(p[0] - q[0], p[1] - q[1]) < tol;
      for (const a of all) {
        if (a.next) continue;
        // Prefer a true return carriageway: starts where a ends AND ends where
        // a starts. Fall back to any lane starting at a's end (a one-way loop).
        const b = all.find((o) => o !== a && near(end(o), start(a), 20) && near(start(o), end(a)))
               || all.find((o) => o !== a && near(start(o), end(a)));
        if (b) a.next = b.name;
      }
      return all;
    })(),
    perLane: 5,
    maxCars: 28,   // TASK-042 (Freebuff): the state-wide map is 5x the old one; spawn/despawn
                   // are player-relative so this is a density tune, not a correctness fix —
                   // measured ~2.4k draw calls, still under the ~4.5k driving budget guardrail
  });

  // The "collect 4 gas cans, drive the escape truck out of Dixie Beaux" free-roam
  // objective predates Act One's story campaign and was never wired to it (nothing
  // outside the pickup loop below ever set state.cans). It's gone per a human
  // report: no cans were actually reachable in the current world, the "Jack a ride
  // rob gas cans: 0/4" objective was stuck showing forever, and the parked escape
  // truck itself was reported as an oddly-placed leftover. win()/tryInteract's
  // truck check and the gas-can HUD panel were removed with it.

  const be = ROAD_X + ROAD_HALF + 8;
  for (const [bx, bz] of [[be, 96], [-be, 62], [be, 30], [-be, 0], [be, -28],
                          [-be, -58], [be, -88], [-be, 118], [30, 74], [-34, 44]]) {
    makeBucket(bx, bz);
  }

  // ================= ENEMIES =================  Rednecks, Hoodrats, Feral Hogs
  // seed a starting mob down the whole highway...
  for (let placed = 0, tries = 0; placed < 40 && tries < 500; tries++) {
    const spot = spawnZones.pick({ x: ROAD_X, z: rand(-110, SPAWN_Z - 4) }, enemies, { minDist: 0, maxDist: 30 });
    if (spot) { spawnEnemy(spot.kind, spot.x, spot.z, spot); placed++; }
  }
  // ...and give OrleaRouge a crowd before the player ever arrives (the boulevard
  // and cross streets; more pour in from the top-up spawner once you're there)
  // OrleaRouge should already feel occupied when the player crosses the
  // causeway: seed several separate hangouts instead of one thin boulevard
  // crowd. The urban mix supplies clubs, escorts, crews, and tourists-by-night.
  for (let placed = 0, tries = 0; placed < 22 && tries < 500; tries++) {
    const focus = placed % 3 === 0
      ? { x: -66, z: rand(220, 325) }       // French District / club blocks
      : placed % 3 === 1
        ? { x: 18, z: rand(215, 350) }      // boulevard and civic blocks
        : { x: 92, z: rand(250, 370) };     // downtown / casino approach
    const spot = spawnZones.pick(focus, enemies, { minDist: 0, maxDist: 40 });
    if (spot) { spawnEnemy(spot.kind, spot.x, spot.z, spot); placed++; }
  }
}
// ...and top it back up forever, out of sight of the player.
const ENEMY_KINDS = ["hog", "redneck", "hobo", "hoodrat", "prostitute", "dockworker", "mechanic", "suit", "tourist", "thug", "gayman", "lesbian", "tuxedo", "highendescort"];
const ENEMY_CAP = 48;         // living NPCs to maintain (off-screen ones are hidden, npc.js)
let enemyRespawnCd = 0;
let populationOn = true;      // missions switch spawning off during set pieces
function updateEnemyPopulation(dt) {
  if (!populationOn) return;
  // Zombie mode's horde (updateZombiePopulation, below) shares this same
  // `enemies` array and its own separate cap — counted out here so it can't
  // eat into this budget and thin out the ordinary population as it fills
  // up. It's meant to be added on top of the civilian count, not carved out of it.
  let alive = 0;
  for (const e of enemies) if (!e.dead && e.type !== "zombie") alive++;
  enemyRespawnCd -= dt;
  if (enemyRespawnCd > 0 || alive >= ENEMY_CAP) return;
  enemyRespawnCd = alive < ENEMY_CAP * 0.5 ? 0.5 : 1.1;

  // spawn out of sight; the zone decides who (spawnzones.js)
  const spot = spawnZones.pick(playerPos, enemies);
  if (!spot) return;
  spawnEnemy(spot.kind, spot.x, spot.z, spot);

  // cull enemies that wandered absurdly far, then compact the list. Mission-penned
  // NPCs (e.leash) stay put: culling Hog Wild's herd would count as clearing it.
  for (const e of enemies) {
    if (!e.dead && !e.leash && Math.hypot(e.spr.position.x - playerPos.x, e.spr.position.z - playerPos.z) > 160) {
      npcs.release(e);
      scene.remove(e.spr); e.dead = "gone";
    }
  }
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].dead === "gone") enemies.splice(i, 1);
  }
}

// Zombie Survival Nightmare (human request, 2026-09-23): "the zombies come out
// after dark" in free roam. Added on top of the ordinary population above,
// not instead of it — the horde is capped separately, and existing NPCs are
// valid targets for it, not just the player (npc.js's zombie branch in
// decide()). Runs only in state.zombieMode; the horde clears out at dawn.
let zombieRespawnCd = 0;
function nearbyZombieCount() {
  let n = 0;
  for (const e of enemies) {
    if (e.dead || e.type !== "zombie") continue;
    if (Math.hypot(e.spr.position.x - playerPos.x, e.spr.position.z - playerPos.z) < 60) n++;
  }
  return n;
}
function updateZombiePopulation(dt) {
  // Ordinary Story/Free Roam/Multiplayer games never set state.zombieMode, so
  // this is a single boolean check for them, forever — not a per-frame scan
  // of `enemies` for a type that can never appear.
  if (!state.zombieMode) return;
  if (!worldTime.isNight()) {
    stopZombieAmbience();
    // the sun's up: nobody's left standing come morning
    for (const e of enemies) {
      if (e.type === "zombie" && !e.dead) { npcs.release(e); scene.remove(e.spr); e.dead = "gone"; }
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].dead === "gone") enemies.splice(i, 1);
    }
    return;
  }
  // occasional distant groans, thicker the more zombies are close (audio.js;
  // idempotent, and silent until the audio context is unlocked)
  startZombieAmbience(() => playerPos, nearbyZombieCount);
  let alive = 0;
  for (const e of enemies) if (!e.dead && e.type === "zombie") alive++;
  
  // Dynamic scaling: "The more you kill the more they swarm, they should form big hordes"
  const zKills = kills.zombie || 0;
  const currentCap = Math.min(300, 60 + zKills * 2);
  
  zombieRespawnCd -= dt;
  if (zombieRespawnCd > 0 || alive >= currentCap) return;
  
  const fastCd = Math.max(0.05, 0.35 - (zKills * 0.005));
  const slowCd = Math.max(0.2, 0.9 - (zKills * 0.01));
  zombieRespawnCd = alive < currentCap * 0.4 ? fastCd : slowCd;

  // spawn out of sight, same ring spawnzones.js already uses for the ordinary
  // population — just force the kind, since the zone mix has no opinion on
  // zombies (they're not a place's regular crowd)
  const spot = spawnZones.pick(playerPos, enemies, { minDist: 35, maxDist: 75, forZombie: true });
  if (!spot) return;

  // In the wilderness, zombies must spawn from the murky waters of a Swamp Tree.
  // If the player cleanses the trees, the zombies stop spawning there!
  const isWilderness = !spot.zone || ["rural", "forest", "water"].includes(spot.zone);
  if (isWilderness) {
    let nearSwamp = false;
    for (const t of swampTrees) {
      if (!t.dead && Math.hypot(t.x - spot.x, t.z - spot.z) < 16) {
        nearSwamp = true;
        break;
      }
    }
    if (!nearSwamp) return; // spawn blocked by cleansed terrain
  }

  const d = zombieDensityAtSpawn(spawnZones, spot.x, spot.z);
  if (Math.random() >= d) return;
  // never drop a horde on a safehouse's doorstep (radius + the cluster's own spread)
  if (safehouses.insideSafehouse(spot.x, spot.z, 20)) return;

  // A horde, not a queue: one at a time out of sight reads as a trickle no
  // matter how low the cap is set. Drop a knot of them at the same spot.
  const maxCluster = Math.min(25, 4 + Math.floor(zKills / 10));
  const clusterN = Math.min(currentCap - alive, 4 + ((Math.random() * maxCluster) | 0));
  for (let i = 0; i < clusterN; i++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * Math.min(15, 5 + zKills * 0.1);
    spawnEnemy("zombie", spot.x + Math.cos(a) * r, spot.z + Math.sin(a) * r, { ...spot, archetype: pickArchetype() });
  }
}

// ---- an asphalt apron linking a lot to the highway shoulder ----
function roadApron(side, z, depth) {
  const inner = ROAD_X + side * (ROAD_HALF - 0.3);
  const outer = ROAD_X + side * (LOT_X + 4);
  const p = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.abs(outer - inner), depth),
    asphaltMat
  );
  p.rotation.x = -Math.PI / 2;
  p.position.set((inner + outer) / 2, GROUND_Y.apron, z);
  p.receiveShadow = true;
  scene.add(p);
}

// ---- 6twelve gas station (stylised — the 960-node FBX was too heavy) ----
function gasSign(name, bg, band, ink) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = bg; x.fillRect(0, 0, 512, 256);
  x.fillStyle = band; x.fillRect(0, 0, 512, 40); x.fillRect(0, 216, 512, 40);
  x.fillStyle = ink;
  x.textAlign = "center"; x.textBaseline = "middle";
  x.font = `bold ${name.length > 7 ? 96 : 150}px Arial Black, sans-serif`;
  x.fillText(name, 256, 132);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveIntensity: 0.55, emissiveMap: t });
}

const makeSixtwelve = (x, z, rot = 0) => makeGasStation(x, z, rot);
function makeGasStation(x, z, rot = 0, o = {}) {
  const name = o.name || "6twelve";
  const sign = () => gasSign(name, o.bg || "#f6f2e8", o.band || "#1a7a3c", o.ink || "#e23b2e");
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = rot;
  const white = new THREE.MeshStandardMaterial({ color: o.wall || 0xe9e6dc, roughness: 0.8 });
  const red = new THREE.MeshStandardMaterial({ color: o.trim || 0xd0342a, roughness: 0.7 });

  // shop
  const shop = new THREE.Mesh(new THREE.BoxGeometry(12, 4.6, 7), white);
  shop.position.set(0, 2.3, -4); shop.castShadow = true; shop.receiveShadow = true;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.8, 7.2), red);
  // 2 cm proud of the roof: at 4.2 its top sat at exactly the shop's 4.6, and the
  // white roof z-fought through the red in stripes on every 6twelve and gas station
  stripe.position.set(0, 4.22, -4);
  const wsign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), sign());
  wsign.position.set(0, 3, -0.4);

  // canopy over the pumps (toward the road, +z)
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(16, 0.7, 12), white);
  canopy.position.set(0, 6, 6); canopy.castShadow = true;
  const cstripe = new THREE.Mesh(new THREE.BoxGeometry(16.2, 0.4, 12.2), red);
  cstripe.position.set(0, 6.5, 6);
  for (const [px, pz] of [[-6.5, 1], [6.5, 1], [-6.5, 11], [6.5, 11]]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 6), white);
    col.position.set(px, 3, pz); col.castShadow = true; g.add(col);
    addBlocker(x + px * Math.cos(rot) - pz * Math.sin(rot),
               z + px * Math.sin(rot) + pz * Math.cos(rot), 0.5);
  }
  poolLight(0xfff4d8, 60, 30, 0, 5.4, 6, g);

  // pump islands
  for (const px of [-3.5, 3.5]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 4),
      new THREE.MeshStandardMaterial({ color: 0x555 }));
    base.position.set(px, 0.2, 6);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(1, 1.8, 1.1), red);
    pump.position.set(px, 1.3, 6); pump.castShadow = true;
    g.add(base, pump);
  }

  // tall pylon sign toward the road
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 16),
    new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
  pole.position.set(7, 8, 13);
  const pylon = new THREE.Mesh(new THREE.BoxGeometry(6, 3.4, 0.5), sign());
  pylon.position.set(7, 15, 13);
  const pylonB = pylon.clone();
  pylonB.rotation.y = Math.PI;
  pylonB.position.set(0, 0, -0.02);      // 2 cm behind: readable, and no z-fight
  pylon.add(pylonB);
  poolLight(0xffe6b0, 24, 26, 7, 14, 13, g);

  g.add(shop, stripe, wsign, canopy, cstripe, pole, pylon);
  scene.add(g);
  parkedCarSpots.push({ x, z, rot });
  for (const [bx, bz] of [[0, -4], [5.5, -4], [-5.5, -4]]) {
    addBlocker(x + bx * Math.cos(rot) - bz * Math.sin(rot),
               z + bx * Math.sin(rot) + bz * Math.cos(rot), 2.4);
  }
}

// place a GLB/FBX scene as a roadside landmark, recentred on (x,z).
// rotOffset corrects models whose "front" isn't local +z.  returns true on success.
function placeGlbLandmark(src, x, z, rot, target, label, glow, rotOffset = 0) {
  if (!src) return false;
  const inner = new THREE.Group();
  inner.add(src.clone(true));
  inner.rotation.y = rotOffset;
  let b = new THREE.Box3().setFromObject(inner);
  const sz = b.getSize(new THREE.Vector3());
  const s = target / Math.max(sz.x, sz.z, 1);
  inner.scale.setScalar(s);
  b = new THREE.Box3().setFromObject(inner);
  const c = b.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -b.min.y, -c.z);   // recentre footprint on origin
  const o = new THREE.Group();
  o.add(inner);
  o.position.set(x, 0, z);
  o.rotation.y = rot;
  scene.add(o);
  // Collision follows the model's actual footprint. A single circle of
  // `target * 0.52` used the model's WIDTH as a radius in every direction, so a
  // 26 m-wide, 15 m-deep BurgerPiz blocked 13.5 m to its south as well — which
  // closed the Mission 1 dirt road at z 43, six metres from the nearest wall.
  // Now: circles the size of the short side, laid along the long one.
  o.updateMatrixWorld(true);
  const fb = new THREE.Box3().setFromObject(o);
  const halfX = (fb.max.x - fb.min.x) / 2, halfZ = (fb.max.z - fb.min.z) / 2;
  const r = Math.max(3, Math.min(halfX, halfZ));
  const alongX = halfX >= halfZ;
  const long = Math.max(halfX, halfZ);
  const n = Math.max(1, Math.ceil(long / r));
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;        // -1 … 1 along the long side
    const off = t * Math.max(0, long - r);
    addBlocker(x + (alongX ? off : 0), z + (alongX ? 0 : off), r);
  }
  poolLight(glow || 0xffe0b0, 40, 30, x, 6, z);
  parkedCarSpots.push({ x, z, rot });
  return true;
}


// ---- a fenced junkyard: sheds, barrels, pallets, wrecks-to-be ----
function makeJunkyard(cx, cz) {
  const dirt = new THREE.Mesh(new THREE.PlaneGeometry(34, 34),
    new THREE.MeshStandardMaterial({ map: shackTex.concrete, roughness: 1 }));
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.set(cx, GROUND_Y.dirtPad, cz);
  dirt.receiveShadow = true;
  scene.add(dirt);
  makeShed(cx - 8, cz - 8, 0.2, 9, 6);
  makeShed(cx + 9, cz + 6, -1.5, 6, 5);
  for (const [dx, dz] of [[-6, 6], [-4, 8], [-6, 9], [8, -7], [10, -6], [2, 10]]) makeBarrel(cx + dx, cz + dz);
  makePallet(cx + 4, cz + 4, 0.3);
  makePallet(cx + 5, cz + 5, 1.1);
  makePallet(cx - 10, cz + 2, -0.4);
  // chainlink perimeter with a gap toward the road
  makeFence(cx - 17, cz - 17, cx + 17, cz - 17);
  makeFence(cx + 17, cz - 17, cx + 17, cz + 17);
  makeFence(cx - 17, cz + 17, cx + 17, cz + 17);
  makeFence(cx - 17, cz - 17, cx - 17, cz + 4);
}

// ---- a Chatham trailer park: mobile homes + the pedestrians ----
function makeTrailerPark(cx, cz) {
  const gravel = new THREE.Mesh(new THREE.PlaneGeometry(46, 40),
    new THREE.MeshStandardMaterial({ color: 0x4a453a, roughness: 1 }));
  gravel.rotation.x = -Math.PI / 2;
  gravel.position.set(cx, GROUND_Y.gravel, cz);
  gravel.receiveShadow = true;
  scene.add(gravel);

  const skirt = new THREE.MeshStandardMaterial({ color: 0x6b6f74, roughness: 1 });
  const colors = [0xbfae86, 0x9fb0a3, 0xc7b8b0, 0xa8a29a, 0xb9a999, 0x8f9aa5];
  let i = 0;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const tx = cx - 15 + col * 15 + rand(-1, 1);
      const tz = cz - 9 + row * 18 + rand(-1, 1);
      const g = new THREE.Group();
      g.position.set(tx, 0, tz);
      g.rotation.y = (row ? 0.06 : -0.03) + rand(-0.05, 0.05);
      const body = new THREE.Mesh(new THREE.BoxGeometry(9, 3, 3.6),
        new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.9 }));
      body.position.y = 1.9; body.castShadow = true; body.receiveShadow = true;
      const roof = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.4, 4),
        new THREE.MeshStandardMaterial({ color: 0x4c4f53 }));
      roof.position.y = 3.5;
      const base = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.9, 3.4), skirt);
      base.position.y = 0.45;
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.8, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x3a2f26 }));
      door.position.set(-2, 1.4, 1.85);
      for (const wx of [1, 3]) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 0.1),
          new THREE.MeshStandardMaterial({ color: 0x243b45 }));
        win.position.set(wx, 2.1, 1.85); g.add(win);
      }
      g.add(body, roof, base, door);
      scene.add(g);
      addBlocker(tx, tz, 3.2);
      i++;
    }
  }
  // a tool shed + junk between the trailers
  makeShed(cx + 14, cz - 12, -0.4, 5, 4);
  makeBarrel(cx - 18, cz - 6);
  makeBarrel(cx - 17, cz - 4);
  makePallet(cx + 12, cz + 8, 0.5);

  // Homeless camp: these are deliberately visible props rather than only NPC
  // spawn coordinates, so the trailer park reads as lived-in from a distance.
  const tentMat = new THREE.MeshStandardMaterial({ color: 0x55483b, roughness: 1, name: "homeless tent canvas" });
  const tarpMat = new THREE.MeshStandardMaterial({ color: 0x283b3b, roughness: 1, name: "homeless tarp" });
  const camp = [
    [cx - 27, cz - 4, 0.15], [cx - 28, cz + 5, -0.2],
    [cx - 20, cz + 9, 0.35], [cx - 34, cz + 10, -0.35],
  ];
  for (const [tx, tz, ry] of camp) {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.5, 4), tentMat);
    tent.position.set(tx, 1.25, tz);
    tent.rotation.y = Math.PI / 4 + ry;
    tent.castShadow = true; tent.receiveShadow = true;
    const tarp = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 2.2), tarpMat);
    tarp.position.set(tx + 0.4, 0.08, tz + 0.2);
    tarp.rotation.y = ry;
    tarp.receiveShadow = true;
    scene.add(tent, tarp);
    addBlocker(tx, tz, 1.3);
  }

  loadPed("Character_Male", cx - 12, cz + 2);
  loadPed("Character_Female", cx + 2, cz - 4);
  loadPed("Character_Male_01", cx + 10, cz + 6);
  loadPed("Character_Female_01", cx - 4, cz + 10);
}

// stylised Tony's Pizza (the 100 MB scene GLB was too heavy to ship)
function makePizzeria(x, z, rot = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rot;
  const brick = new THREE.MeshStandardMaterial({ color: 0x8a3b2a, roughness: 0.9 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 8), brick);
  box.position.y = 2.5; box.castShadow = true; box.receiveShadow = true;
  const awn = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.5, 3),
    new THREE.MeshStandardMaterial({ color: 0x1f7a3d }));
  awn.position.set(0, 4.1, 4.4);
  // green/white/red bands
  for (let i = 0; i < 3; i++) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.5, 0.2),
      new THREE.MeshStandardMaterial({ color: [0x1f7a3d, 0xf4f4f4, 0xc0392b][i] }));
    band.position.set(0, 0.6 + i * 0.5, 4.05);
    g.add(band);
  }
  const sign = makeNeonSign("TONY'S PIZZA", "#e8402c", "#f4e6c8");
  const board = new THREE.Mesh(new THREE.BoxGeometry(9, 3, 0.4), sign);
  board.position.set(0, 6.6, 0.2);
  const b2 = board.clone();
  b2.rotation.y = Math.PI;
  b2.position.set(0, 0, -0.02);          // 2 cm behind: readable, and no z-fight
  board.add(b2);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 14),
    new THREE.MeshStandardMaterial({ color: 0x222 }));
  pole.position.set(6.5, 7, 5);
  const pyl = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.6, 0.4), sign);
  pyl.position.set(6.5, 13, 5);
  poolLight(0xff5a3c, 20, 26, 3, 6, 4, g);
  g.add(box, awn, board, pole, pyl);
  scene.add(g);
  parkedCarSpots.push({ x, z, rot });
  for (const [bx, bz] of [[0, 4], [0, -4], [5, 0], [-5, 0]]) {
    const wx = x + bx * Math.cos(rot) - bz * Math.sin(rot);
    const wz = z + bx * Math.sin(rot) + bz * Math.cos(rot);
    addBlocker(wx, wz, 2.4);
  }
}

function makeNeonSign(text, ink, bg) {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 320;
  const x = c.getContext("2d");
  x.fillStyle = bg; x.fillRect(0, 0, 1024, 320);
  x.strokeStyle = ink; x.lineWidth = 16; x.strokeRect(20, 20, 984, 280);
  x.fillStyle = ink;
  x.textAlign = "center"; x.textBaseline = "middle";
  x.font = "bold 150px Trebuchet MS, Arial Black, sans-serif";
  x.fillText(text, 512, 170);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, emissive: 0xff6644, emissiveIntensity: 0.9, emissiveMap: t });
}

// ---- roadside decor ----
const shrooms = [], torches = [];
function makeShroom(x, z) {
  const spr = new AnimatedSprite(atlases.shroom, 0.9 + Math.random() * 0.7);
  spr.blob.visible = false;
  spr.material.color.setHex(0x9fe8c8);
  spr.play("glow", { fps: 6 });
  spr.position.set(x, 0, z);
  scene.add(spr);
  shrooms.push(spr);
  addBlocker(x, z, 0.4);
}
function makeTorch(x, z, withLight) {
  const spr = new AnimatedSprite(atlases.torch, 3.0);
  spr.blob.visible = false;
  spr.play("burn", { fps: 10 });
  spr.position.set(x, 0, z);
  scene.add(spr);
  torches.push(spr);
  addBlocker(x, z, 0.3);
  if (withLight) poolLight(0xff9a3c, 22, 18, x, 2.6, z);
}

// ---- the state line billboard — planted on the shoulder, angled to the road ----
function makeWelcomeSign(x, z, ry = 0) {
  const c = document.createElement("canvas");
  c.width = 768; c.height = 420;
  const g = c.getContext("2d");
  g.fillStyle = "#1f5d3a"; g.fillRect(0, 0, 768, 420);
  g.strokeStyle = "#f4f1e4"; g.lineWidth = 14; g.strokeRect(26, 26, 716, 368);
  g.fillStyle = "#f4f1e4"; g.textAlign = "center";
  g.font = "italic 44px Georgia, serif"; g.fillText("Welcome to", 384, 98);
  g.font = "bold 100px Georgia, serif"; g.fillText("DIXIE BEAUX", 384, 196);
  g.font = "italic 27px Georgia, serif";
  g.fillText("“Sportsman’s Heaven — Everybody Else’s Problem.”", 384, 258);
  // somebody got to it with a spray can
  g.save();
  g.translate(398, 336);
  g.rotate(-0.06);
  g.font = "bold 46px 'Comic Sans MS', 'Marker Felt', Impact, sans-serif";
  g.fillStyle = "#e8402c";
  g.fillText("HEAVEN GOT A LOW BAR.", 0, 0);
  g.restore();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;

  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = ry;
  // BoxGeometry already textures front + back — one panel, no z-fighting clone
  const panel = new THREE.Mesh(new THREE.BoxGeometry(7, 3.8, 0.35),
    new THREE.MeshStandardMaterial({ map: tex, emissive: 0x0e3320, emissiveIntensity: 0.3, emissiveMap: tex }));
  panel.position.y = 4; panel.castShadow = true;
  grp.add(panel);
  for (const px of [-3, 3]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.4, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }));
    post.position.set(px, 2.2, 0); post.castShadow = true;
    grp.add(post);
  }
  addBlocker(x, z, 2);
  poolLight(0xcfeecb, 16, 20, x, 5, z);
  scene.add(grp);
}

// ---- a big roadside billboard on two posts, with optional graffiti ----
function makeBillboard(x, z, ry, headline, sub, graffiti) {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 420;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 420);
  grad.addColorStop(0, "#f4efe4");
  grad.addColorStop(1, "#d9cdb4");
  g.fillStyle = grad; g.fillRect(0, 0, 1024, 420);
  g.fillStyle = "#1f2a36"; g.fillRect(0, 0, 1024, 34); g.fillRect(0, 386, 1024, 34);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = "#1f2a36"; g.font = "bold 128px Georgia, serif"; g.fillText(headline, 512, 150);
  g.fillStyle = "#a8812f"; g.font = "italic 64px Georgia, serif"; g.fillText(sub, 512, 250);
  if (graffiti) {
    g.save();
    g.translate(530, 336);
    g.rotate(-0.05);
    g.fillStyle = "#d4321f";
    g.font = "bold 62px 'Comic Sans MS', 'Marker Felt', Impact, sans-serif";
    g.fillText(graffiti, 0, 0);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = GFX.maxAniso;

  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  grp.rotation.y = ry;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(12, 4.9, 0.3),
    new THREE.MeshStandardMaterial({ map: tex, emissive: 0x2a2418, emissiveIntensity: 0.35, emissiveMap: tex }));
  panel.position.y = 7.2;
  panel.castShadow = true;
  grp.add(panel);
  for (const px of [-4, 4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 7.4, 0.35),
      new THREE.MeshStandardMaterial({ name: "steel post", color: 0x4a4d50 }));
    post.position.set(px, 3.7, 0);
    post.castShadow = true;
    grp.add(post);
  }
  scene.add(grp);
  grp.updateMatrixWorld(true);
  for (const px of [-4, 4]) {
    const p = new THREE.Vector3(px, 0, 0).applyMatrix4(grp.matrixWorld);
    addBlocker(p.x, p.z, 0.5);
  }
  poolLight(0xffe2b0, 30, 18, x, 3, z + 2);
}

// ---- water tower with the town name, a motto, and whatever got painted on it ----
function makeWaterTower(x, z, name, lines = [], graffiti = null) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#c9cdd0"; g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#26333f"; g.textAlign = "center"; g.textBaseline = "middle";
  // long names (TUSOUXROE) shrink to fit the tank
  let size = 90;
  g.font = "bold " + size + "px Arial Black, sans-serif";
  while (g.measureText(name).width > 470 && size > 40) {
    size -= 4;
    g.font = "bold " + size + "px Arial Black, sans-serif";
  }
  g.fillText(name, 256, lines.length || graffiti ? 92 : 138);
  g.font = "bold 26px Arial, sans-serif";
  lines.forEach((line, i) => g.fillText(line, 256, 158 + i * 30));
  if (graffiti) {
    g.save();
    g.translate(256, 212);
    g.rotate(-0.035);
    g.fillStyle = "#c0392b";
    g.font = "bold 27px 'Comic Sans MS', 'Marker Felt', Impact, sans-serif";
    g.fillText(graffiti, 0, 0);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  const metal = new THREE.MeshStandardMaterial({ color: 0xb7bdc0, roughness: 0.7, metalness: 0.3 });
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 5, 16), [
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }), metal, metal,
  ]);
  tank.position.y = 20; tank.castShadow = true;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(4.7, 2.4, 16), metal);
  cap.position.y = 23.6;
  const bowl = new THREE.Mesh(new THREE.ConeGeometry(4.5, 3, 16), metal);
  bowl.position.y = 16.4; bowl.rotation.x = Math.PI;
  grp.add(tank, cap, bowl);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 16), metal);
    leg.position.set(Math.cos(a) * 3.4, 8, Math.sin(a) * 3.4);
    leg.rotation.z = Math.cos(a) * 0.12; leg.rotation.x = -Math.sin(a) * 0.12;
    leg.castShadow = true;
    grp.add(leg);
  }
  scene.add(grp);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    addBlocker(x + Math.cos(a) * 3.4, z + Math.sin(a) * 3.4, 0.8);
  }
}

// ---- pedestrians from the Trailer Park character pack (static, they just stand) ----
const peds = [];
function loadPed(name, x, z) {
  const tex = texLoader.load(`./assets/models/trailerpark/chars/${name}.png`);
  tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = false;
  fbxLoader.load(`./assets/models/trailerpark/chars/${name}.fbx`, (obj) => {
    const sz = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    obj.scale.setScalar(1.9 / (sz.y || 1.9));
    obj.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }); }
    });
    const b = new THREE.Box3().setFromObject(obj);
    obj.position.set(x, -b.min.y, z);
    obj.rotation.y = Math.random() * 6;
    scene.add(obj);
    peds.push(obj);
    addBlocker(x, z, 0.5);
  }, undefined, () => {});
}

function buildShack(wall, doorway, windowW, roofC, cx, cz, rot) {
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  g.rotation.y = rot;
  scene.add(g);
  const put = (src, px, pz, ry) => {
    if (!src) return;
    const o = src.clone(true);
    o.position.set(px, 0, pz); o.rotation.y = ry;
    g.add(o);
  };
  const W = 4;
  put(doorway, 0, W / 2, 0);
  put(windowW, -W / 2, 0, Math.PI / 2);
  put(windowW, W / 2, 0, Math.PI / 2);
  put(wall, 0, -W / 2, 0);
  if (roofC) { const r = roofC.clone(true); r.position.y = 3.0; r.scale.set(1.3, 1, 1.3); g.add(r); }
  // approximate collision as a ring of blockers
  addBlocker(cx, cz + 2, 1.4);
  addBlocker(cx, cz - 2, 1.4);
  addBlocker(cx + 2, cz, 1.4);
  addBlocker(cx - 2, cz, 1.4);
}

function placeWreck(obj, x, z, rot) {
  if (!obj) return null;
  obj.position.set(x, 0, z);
  obj.rotation.y = rot;
  scene.add(obj);
  return registerVehicle(obj, 2.0, { hp: 34 });   // every wreck still runs
}
// Motorbikes and scooters (bikes.js, vehicles.js "motorbike" / "scooter").
const BIKE_SPOTS = [
  ["motorbike", ROAD_X + 8, 120, -Math.PI / 2],    // Chatboro, by the spawn
  ["scooter", ROAD_X - 8, 96, Math.PI / 2],
  ["motorbike", -18, 20, Math.PI / 2],              // outside Chatboro's Pay 'n' Spray
  ["scooter", -20, -72, 0],                         // Tusouxroe, Main Street
  ["motorbike", ROAD_X + 8, -112, -Math.PI / 2],
  ["motorbike", ROAD_X + 8, -205, -Math.PI / 2],    // Tusouxroe North
  ["scooter", -38, 254.5, Math.PI / 2],             // Frenchmen Street, by the clubs
  ["motorbike", -15, 286, -Math.PI / 2],
  ["scooter", 8, 238, Math.PI],                     // OrleaRouge Popeyes
  ["pushbike", 146, 302, Math.PI / 2],              // eastern nightlife district
];
function parkBike(kind, x, z, rot) {
  const clear = (px, pz) => !blockers.some((b) => Math.hypot(b.x - px, b.z - pz) < b.r + 1.1);
  let at = null;
  for (let r = 0; r <= 6 && !at; r += 1.5) {
    for (let a = 0; a < Math.PI * 2 && !at; a += Math.PI / 4) {
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (clear(px, pz)) at = [px, pz];
      if (r === 0) break;
    }
  }
  if (!at) return null;
  const model = kind === "scooter" ? buildScooter() : kind === "pushbike" ? buildPushBike() : buildMotorbike();
  const obj = normalizeVehicleModel(model, VEHICLE_DEFS[kind]);
  obj.position.set(at[0], obj.position.y, at[1]);
  obj.rotation.y = rot;
  scene.add(obj);
  return registerVehicle(obj, 0.95, { hp: kind === "scooter" ? 20 : 28 });
}

function placeParked(obj, x, z, rot) {
  if (!obj) return null;
  obj.position.set(x, 0, z);
  obj.rotation.y = rot;
  scene.add(obj);
  return registerVehicle(obj, 1.9, { hp: 34 });
}

// ---------------------------------------------------------------- combat
// Distinct gunfire per weapon (human report: "the guns should have sounds,
// different sounds"). Procedural, via cinema.js's sfx() — see there for the
// actual noise/filter shaping of each kind.
const WEAPON_SFX = { pistol: "pistolShot", tec9: "tec9Shot", sawnoff: "shotgun", deerRifle: "rifleShot" };
const _tmpV = new THREE.Vector3();
const _muzzleV = new THREE.Vector3();
function fire() {
  if (state.fireCd > 0 || state.over || state.cinematic) return;
  // Weapon away: left click is inert, in a car as much as on foot — "put it
  // away" that still lets you drive-by is not put away. Checked before the aim
  // prompt below so holstering doesn't nag you to hold right click either.
  if (state.holstered) {
    // Say why nothing happened. Without this, starting holstered just reads as
    // "shooting is broken". Rate-limited, or an automatic weapon's held trigger
    // would repeat it every frame.
    if (state.holsterHintCd <= 0) {
      state.holsterHintCd = 4;
      flashObjective("Weapon away — press X to draw it.");
    }
    return;
  }
  
  if (state.veh && state.weapon !== "pistol" && state.weapon !== "tec9") {
    // Try to auto-switch to a drive-by capable weapon if they have ammo
    if (arsenal.ammo > 0 && (state.weapon === "pistol" || state.weapon === "tec9")) {
      // already holding one (redundant check but safe)
    } else if (arsenal.reserve && arsenal.reserve.tec9 > 0) {
      flashObjective("Swapped to Tec-9 for drive-by.");
      state.weapon = "tec9";
      arsenal.reload();
    } else if (arsenal.reserve && arsenal.reserve.pistol > 0) {
      flashObjective("Swapped to 9mm for drive-by.");
      state.weapon = "pistol";
      arsenal.reload();
    } else {
      flashObjective("Need a Pistol or Tec-9 to shoot from a vehicle!");
      return;
    }
  }

  const gun = arsenal.stats(!!state.veh);
  if (!gun.melee && state.ammo <= 0) {
    if (!arsenal.reload()) {
      flashObjective(`${gun.name} is empty! Swapped to Baseball Bat.`);
      state.weapon = "bat";
      state.ammo = Infinity;
      arsenal.render();
    }
    return;
  }
  state.fireCd = gun.cooldown;
  if (shotWitnessed()) crime(0.12);
  // Shots come out of the BARREL, not the player's navel. weapons_3d.js exposes
  // the muzzle node in world space; the chest-height point is only the fallback
  // for the frames before a freshly-swapped weapon's model is up, and while
  // driving (the rig is hidden and the car is the view).
  const origin = _tmpV.copy(playerPos).setY(state.veh ? 1.4 : 1.2);
  if (!state.veh && getWeaponMuzzle(_muzzleV)) origin.copy(_muzzleV);

  const _ray = new THREE.Raycaster();
  const _crosshairNDC = new THREE.Vector2(0, 0);
  const _aim3D = new THREE.Vector3();

  const isAiming = input.isDown("aim") || state.veh;
  if (isAiming) {
    _ray.setFromCamera(_crosshairNDC, camera);
    const target3D = _ray.ray.at(1000, new THREE.Vector3());
    _aim3D.subVectors(target3D, origin).normalize();
    _aim.copy(_aim3D);
    _aim.y = 0;
    _aim.normalize();
  } else {
    _aim.set(Math.sin(player._yaw), 0, Math.cos(player._yaw));
    _aim3D.copy(_aim);
  }

  if (!state.veh) { 
    attackTimer = 0.42; 
    player.play(gun.melee ? (state.weapon === "bat" ? "swing_bat" : "attack") : "shoot", { fps: 12, loop: false, force: true }); 
    if (!gun.melee && isAiming) player._yaw = camCtl.heading;
    playFireAnim3D(state.weapon, gun.melee); 
  }

  let best = null, bestScore = Infinity, bestKind = null, bestDist = 0;
  let hitTargets = [];

  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.spr.position.x - playerPos.x, dz = e.spr.position.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d > gun.range || d < 1e-3) continue;
    const facing = (dx * _aim.x + dz * _aim.z) / d;       // 1 = dead ahead
    const hostile = e.state === "hostile";
    if (state.weapon === "sawnoff") {
      if (facing > 0.82) hitTargets.push({ t: e, kind: "enemy", d });
    } else {
      if (facing < 0) continue; // must be in front
      // perpendicular distance from ray to enemy center
      const distToRay = Math.sqrt(Math.max(0, d * d - (d * facing) * (d * facing)));
      const hitRadius = e.type === "hog" ? 1.5 : 1.0; 
      if (distToRay > hitRadius) continue; // must actually aim at them
      const score = d; // closest enemy along the ray gets hit
      if (score < bestScore) { bestScore = score; best = e; bestKind = "enemy"; bestDist = d; }
    }
  }
  for (const c of police.footCops) {
    if (c.dead) continue;
    const dx = c.spr.position.x - playerPos.x, dz = c.spr.position.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d > gun.range || d < 1e-3) continue;
    const facing = (dx * _aim.x + dz * _aim.z) / d;
    if (state.weapon === "sawnoff") {
      if (facing > 0.82) hitTargets.push({ t: c, kind: "footCop", d });
    } else {
      if (facing < 0) continue;
      const distToRay = Math.sqrt(Math.max(0, d * d - (d * facing) * (d * facing)));
      if (distToRay > 1.0) continue;
      const score = d;
      if (score < bestScore) { bestScore = score; best = c; bestKind = "footCop"; bestDist = d; }
    }
  }
  // Ambient venue crowds (tusouxroeNorth.js's Crown Strip, nightlife.js's
  // clubs): everyone close enough for their district to be ticking them —
  // bystanders, never hostile (neither system has a fight-back state), so
  // the same tight facing cone as an unprovoked street pedestrian. Both
  // expose the identical `{x, y, z, rec}` shape from `hittable()`, so one
  // loop over both lists does the targeting for both.
  const venuePeople = [];
  if (tusouxroeNorth) venuePeople.push(...tusouxroeNorth.hittable(playerPos, gun.range + 5));
  venuePeople.push(...nightlife.hittable(playerPos, gun.range + 5));
  for (const p of venuePeople) {
    const dx = p.x - playerPos.x, dz = p.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d > gun.range || d < 1e-3) continue;
    const facing = (dx * _aim.x + dz * _aim.z) / d;
    if (state.weapon === "sawnoff") {
      if (facing > 0.82) hitTargets.push({ t: p, kind: "crowd", d });
    } else {
      if (facing < 0) continue;
      const distToRay = Math.sqrt(Math.max(0, d * d - (d * facing) * (d * facing)));
      if (distToRay > 1.0) continue;
      const score = d;
      if (score < bestScore) { bestScore = score; best = p; bestKind = "crowd"; bestDist = d; }
    }
  }
  for (const s of sheriffs) {
    if (s.dead) continue;
    const dx = s.obj.position.x - playerPos.x, dz = s.obj.position.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d > gun.range || d < 1e-3) continue;
    const facing = (dx * _aim.x + dz * _aim.z) / d;
    if (state.weapon === "sawnoff") {
      if (facing > 0.82) hitTargets.push({ t: s, kind: "sheriff", d });
    } else {
      if (facing < 0) continue;
      const distToRay = Math.sqrt(Math.max(0, d * d - (d * facing) * (d * facing)));
      if (distToRay > 2.5) continue; // cars are wider
      if (d < bestScore) { bestScore = d; best = s; bestKind = "sheriff"; bestDist = d; }
    }
  }

  for (const v of vehicles) {
    if (v === state.veh) continue;
    const dx = v.obj.position.x - playerPos.x, dz = v.obj.position.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d > gun.range || d < 1e-3) continue;
    const facing = (dx * _aim.x + dz * _aim.z) / d;
    if (state.weapon === "sawnoff") {
      if (facing > 0.82) hitTargets.push({ t: v, kind: "vehicle", d });
    } else {
      if (facing < 0) continue;
      const distToRay = Math.sqrt(Math.max(0, d * d - (d * facing) * (d * facing)));
      if (distToRay > 2.5) continue;
      const score = d;
      if (score < bestScore) { bestScore = score; best = v; bestKind = "vehicle"; bestDist = d; }
    }
  }

  for (const t of swampTrees) {
    if (t.dead) continue;
    const dx = t.x - playerPos.x, dz = t.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d > gun.range || d < 1e-3) continue;
    const facing = (dx * _aim.x + dz * _aim.z) / d;
    if (state.weapon === "sawnoff") {
      if (facing > 0.82) hitTargets.push({ t, kind: "swampTree", d });
    } else {
      if (facing < 0) continue;
      const distToRay = Math.sqrt(Math.max(0, d * d - (d * facing) * (d * facing)));
      if (distToRay > 1.5) continue; // tree trunk + leeway
      const score = d;
      if (score < bestScore) { bestScore = score; best = t; bestKind = "swampTree"; bestDist = d; }
    }
  }
  
  if (state.weapon !== "sawnoff" && best) {
    hitTargets.push({ t: best, kind: bestKind, d: bestDist });
  }

  npcs.noise(playerPos.x, playerPos.z, state.weapon === "sawnoff" ? 40 : 26);     // gunfire carries

  if (!gun.melee) {
    if (state.weapon === "sawnoff") {
      for (let i = 0; i < 6; i++) {
        const spreadAim = _aim3D.clone().add(new THREE.Vector3((Math.random() - 0.5)*0.3, (Math.random() - 0.5)*0.1, (Math.random() - 0.5)*0.3)).normalize();
        spawnTracer(origin, origin.clone().addScaledVector(spreadAim, gun.range));
      }
    } else {
      let target;
      if (bestKind === "enemy") target = best.spr.position.clone().setY(best.type === "hog" ? 0.8 : 1.1);
      else if (bestKind === "sheriff") target = best.obj.position.clone().setY(1.1);
      else if (bestKind === "player") target = best.rp.position.clone().setY(1.1);
      else if (bestKind === "crowd") target = new THREE.Vector3(best.x, best.y + 0.9, best.z);
      else if (bestKind === "swampTree") target = new THREE.Vector3(best.x, 1.5, best.z);
      else target = origin.clone().addScaledVector(_aim3D, 24);
      spawnTracer(origin, target);
    }
    muzzleFlash(origin, origin.clone().addScaledVector(_aim3D, 2));
    cine.sfx(WEAPON_SFX[state.weapon] || "pistolShot");
  }
  arsenal.consume();

  for (const hit of hitTargets) {
    const { t, kind, d } = hit;
    const dmg = state.weapon === "sawnoff" ? gun.damage * (1 - d / gun.range) : gun.damage;
    if (multiplayerMode && multiplayer?.connected) {
       if (kind === "player") {
         multiplayer.send("DAMAGE", { id: t.id, amount: dmg });
       } else if (kind === "enemy" && t.netId) {
         multiplayer.send("DAMAGE", { id: t.netId, amount: dmg });
       } else if (kind === "vehicle" && t.netId) {
         multiplayer.send("DAMAGE", { id: t.netId, amount: dmg });
       } else if (kind === "sheriff" && t.netId) {
         multiplayer.send("DAMAGE", { id: t.netId, amount: dmg });
       }
       if (kind === "player") continue; // Server will handle player death
    }
    if (kind === "swampTree") {
      t.hp -= dmg;
      if (t.hp <= 0) {
        t.dead = true;
        scene.remove(t.mesh);
        npcs.noise(t.x, t.z, 20); // loud cracking sound radius
        // Use explosion sfx as a placeholder for a loud crash
        if (Math.hypot(t.x - playerPos.x, t.z - playerPos.z) < 50) cine.sfx("explosion"); 
      }
    } else if (kind === "enemy") {
      t.hp -= dmg;
      const freshFight = t.state !== "hostile" && t.state !== "flee";
      npcs.provoke(t);
      spawnBloodSpray(t.spr.position.clone().setY(t.type === "hog" ? 0.6 : 1.0), _aim3D);
      if (t.type !== "hog") { t.spr.play("hurt", { loop: false, force: true }); t.t = 0; }
      else t.spr.position.addScaledVector(t.spr.position.clone().sub(playerPos).setY(0).normalize(), 0.4);
      if (t.hp <= 0) { killEnemy(t); if (t.type !== "hog") crime(1.2); }
      else if (freshFight) speakPedestrian(t, fightLine(t.type, t.T.label, t.mood));
    } else if (kind === "footCop") {
      t.hp -= dmg;
      spawnBloodSpray(t.spr.position.clone().setY(1.0), _aim3D);
      if (t.spr.play) { t.spr.play("hurt", { loop: false, force: true }); t.t = 0; }
      if (t.hp <= 0) {
        // Custom kill logic since killEnemy accesses t.T.label which footCops lack
        t.dead = true;
        t.state = "dead";
        if (t.spr.play) t.spr.play("death", { fps: 9, loop: false, force: true });
        spawnBloodSpray(t.spr.position.clone().setY(1.0), _aim3D, 14);
        spawnBloodPool(t.spr.position.x, t.spr.position.z);
        loot.dropFor(t);
        crime(2.0); // Killing a cop is a serious crime
        flashObjective(`Deputy down.  ${EMOJI.hog} ${kills.hog}   ${EMOJI.redneck} ${kills.redneck}   ${EMOJI.hoodrat} ${kills.hoodrat}`);
      } else {
        crime(0.4); // Shooting a cop
      }
    } else if (kind === "sheriff") {
      crime(0.4);
      damageVehicle(t, dmg * 2);
    } else if (kind === "vehicle") {
      damageVehicle(t, dmg * 1.5);
    } else if (kind === "crowd") {
      // The Crown Strip's crowd (crowd.js, via tusouxroeNorth.js's hittable()):
      // `t.rec` is the live actor record, mutated in place so the district's
      // own tick() sees the same hp/dead every other kind already gets.
      const p = t.rec;
      const wp = { x: t.x, y: t.y + (p.a.userData.hog ? 0.5 : 0.9), z: t.z };
      p.hp -= dmg;
      spawnBloodSpray(wp, _aim3D);
      if (p.a.play) p.a.play("hurt", { loop: false, force: true });
      if (p.hp <= 0) {
        p.dead = true;
        if (p.a.play) p.a.play("death", { loop: false, force: true });
        spawnBloodSpray(wp, _aim3D, 14);
        spawnBloodPool(t.x, t.z);
        crime(1.2);
      } else {
        crime(0.12);
      }
    }
  }
}

// Created up front at zero intensity. Adding a light mid-game changes the light
// count, which recompiles every lit shader: a visible hitch on the first shot,
// on every wrecked car and on every cruiser that spawned with its own beacon.
const muzzleLight = new THREE.PointLight(0xffd070, 0, 12, 2);
const wreckLight = new THREE.PointLight(0xff6a1e, 0, 16, 2);
const beaconLights = [new THREE.PointLight(0x3366ff, 0, 18, 2), new THREE.PointLight(0xff2233, 0, 18, 2)];
const fireLights = Array(4).fill(0).map(() => new THREE.PointLight(0xff5a1e, 0, 9, 2));
scene.add(muzzleLight, wreckLight, ...beaconLights, ...fireLights);
function muzzleFlash(from) {
  muzzleLight.position.copy(from);
  muzzleLight.intensity = 30;
}

// `turf`: killed by a rival gang member, not the player. The body still drops its
// loot, but there's no tally, no kill line and no heat (police and gang violence
// is a separate decision; see TASK-035).
function killEnemy(e, { turf = false, killer = null } = {}) {
  npcs.release(e);
  npcs.noise(e.spr.position.x, e.spr.position.z, 30);
  e.dead = true;
  e.state = "dead";
  e.t = 0;
  spawnBloodSpray(e.spr.position.clone().setY(e.type === "hog" ? 0.6 : 1.0), _aim, 14);
  spawnBloodPool(e.spr.position.x, e.spr.position.z, e.type === "hog" ? 1.3 : 1);
  if (e.type !== "hog") e.spr.play("death", { fps: 9, loop: false, force: true });
  loot.dropFor(e);
  
  if (killer && killer.type === "zombie" && e.type !== "hog" && e.type !== "zombie") {
    e.zombifyTimer = 300; // 5 minutes to rise as zombie
  }
  
  if (turf) return;
  kills[e.type] = (kills[e.type] || 0) + 1;
  flashObjective(`${e.T.label} down.  ${EMOJI.hog} ${kills.hog}   ${EMOJI.redneck} ${kills.redneck}   ${EMOJI.hoodrat} ${kills.hoodrat}`);
  checkHeatUp();
}

// ---------------------------------------------------------------- HUD
function syncHUD() {
  hpFill.style.width = Math.max(0, state.hp) + "%";
  spFill.style.width = Math.max(0, state.sp) + "%";
  cashEl.textContent = "$" + state.cash.toLocaleString();
  if (clockEl) clockEl.textContent = worldTime.label();
  let s = "";
  if (copsActive()) for (let i = 0; i < 6; i++) s += `<span class="${i < state.wanted ? "on" : "off"}">★</span>`;
  starsEl.innerHTML = s;
  if (state.zombieMode) {
    zombieKillsEl.hidden = false;
    zombieKillsEl.textContent = `🧟 ${kills.zombie || 0}`;
  } else {
    zombieKillsEl.hidden = true;
  }
  if (state.veh) {
    vehIndic.hidden = false;
    vehIndic.textContent = state.veh.sheriff
      ? `⚡ SHERIFF CRUISER — ${Math.round(Math.abs(state.veh.speed) * 3)} mph`
      : `${Math.round(Math.abs(state.veh.speed) * 3)} mph   ·   F to get out`;
  } else {
    vehIndic.hidden = true;
  }
}
let objTimer = 0;
function flashObjective(txt) {
  objEl.textContent = txt;
  objTimer = 2.5;
}
function hurtFlash() {
  document.body.classList.remove("flash");
  void document.body.offsetWidth;
  document.body.classList.add("flash");
}

// ---------------------------------------------------------------- win / lose
function endScreen(title, body, btn) {
  state.running = false;
  state.over = true;
  crosshair.style.display = "none";
  camCtl.release();
  overlay.classList.remove("hidden");
  overlay.style.background = "radial-gradient(ellipse at center, rgba(8,16,10,.82), rgba(3,5,4,.97))";
  overlay.innerHTML = `<h1 class="end">${title}</h1><p>${body}</p><button id="againBtn">${btn}</button>`;
  document.getElementById("againBtn").onclick = () => location.reload();
}
function scoreLine() {
  return `Cash $${state.cash.toLocaleString()} &nbsp;·&nbsp; ${EMOJI.hog}${kills.hog}
    ${EMOJI.redneck}${kills.redneck} ${EMOJI.hoodrat}${kills.hoodrat}
    &nbsp;·&nbsp; ${state.wanted}★ at the line`;
}
function lose() {
  if (storyFail && storyFail("wasted")) return;   // a mission may respawn you instead
  endScreen('<span style="color:#b8202a;font-style:italic">WASTED</span>',
    `The swamp took you back.<br><br>${scoreLine()}`,
    "Respawn");
}
function busted() {
  if (storyFail && storyFail("busted")) return;
  endScreen('<span style="color:#2e6fff;font-style:italic">BUSTED</span>',
    `The Chatboro Sheriff's Office would like a word. Bail is more than you've got,
     and Sheriff Mercer is smiling.<br><br>${scoreLine()}`,
    "Make bail");
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let idleAcc = 0;
let wasInVehicle = false;   // edge-detects state.veh for the radio (tick())

// ---- dev diagnostics: F3 toggles a frame-time readout (hidden by default) ----
// CPU-side timings only; the GPU works asynchronously, so "render" is the cost of
// submitting the frame, and a slow GPU shows up as a low fps with small numbers.
const perf = {
  fps: 0, frameMs: 0, worstMs: 0, simMs: 0, aiMs: 0, renderMs: 0,
  calls: 0, tris: 0, _frames: 0, _acc: 0, _worst: 0, _sim: 0, _ai: 0, _render: 0,
};
renderer.info.autoReset = false;          // count draw calls across every pass
const perfEl = document.createElement("div");
perfEl.id = "perf";
perfEl.hidden = true;
perfEl.style.cssText = "position:fixed;top:120px;right:16px;z-index:30;pointer-events:none;" +
  "font:12px/1.5 Consolas,monospace;color:#cfe8bf;background:rgba(0,0,0,.6);" +
  "padding:8px 10px;border-radius:6px;white-space:pre";
document.body.appendChild(perfEl);
input.onPress("perf", () => { perfEl.hidden = !perfEl.hidden; });
function samplePerf(frameMs) {
  perf._frames++;
  perf._acc += frameMs;
  perf._worst = Math.max(perf._worst, frameMs);
  if (perf._acc < 500) return;
  const n = perf._frames;
  perf.fps = Math.round((n * 1000) / perf._acc);
  perf.frameMs = +(perf._acc / n).toFixed(1);
  perf.worstMs = +perf._worst.toFixed(1);
  perf.simMs = +(perf._sim / n).toFixed(2);
  perf.aiMs = +(perf._ai / n).toFixed(2);
  perf.renderMs = +(perf._render / n).toFixed(2);
  perf._frames = perf._acc = perf._worst = perf._sim = perf._ai = perf._render = 0;
  if (!perfEl.hidden) {
    perfEl.textContent =
      `${perf.fps} fps   ${perf.frameMs} ms (worst ${perf.worstMs})\n` +
      `sim ${perf.simMs} ms   ai ${perf.aiMs} ms\n` +
      `render submit ${perf.renderMs} ms\n` +
      `draw calls ${perf.calls}   tris ${(perf.tris / 1000).toFixed(0)}k\n` +
      `npcs ${enemies.length}   vehicles ${vehicles.length}`;
  }
}
let lastFrameStamp = performance.now();

function tick() {
  requestAnimationFrame(tick);
  const now = performance.now();
  const frameMs = now - lastFrameStamp;
  lastFrameStamp = now;
  // Clamp only real stalls (tab switches, load hitches). Everything under
  // 100 ms is simulated in full, in fixed steps below, so gameplay speed no
  // longer drops when the frame rate does.
  const dt = Math.min(clock.getDelta(), 0.1);

  // The menu / end-screen overlay is opaque, so driving the full post chain and
  // a 3072px shadow map behind it is pure waste — and on a software GL context
  // it is what makes the level appear to load slowly. Tick it at ~2.5 fps
  // instead: slow enough to cost nothing, often enough that shaders are already
  // compiled and there is no hitch on Start.
  if (!state.running) {
    idleAcc += dt;
    if (idleAcc < 0.4) return;
    idleAcc = 0;
  }

  if (state.running && !state.over) {
    const t0 = performance.now();
    // fixed-size steps: collision and AI stay stable at any frame rate
    // (a cutscene pauses the simulation; the story drives its own actors)
    if (!state.cinematic && !state.paused) {
      for (let left = dt; left > 1e-4 && !state.over; left -= 1 / 30) {
        simulate(Math.min(left, 1 / 30));
      }
    }
    // The radio: driven off state.veh directly rather than hooked into every
    // individual enter/exit call site (there are close to a dozen — normal
    // exit, hijack, explosion, the wanted system's forced eject, dev
    // teleport…), so it reacts correctly no matter how the player left the
    // car.
    const inVehicle = !!state.veh;
    if (inVehicle !== wasInVehicle) {
      wasInVehicle = inVehicle;
      if (inVehicle && !radioOff) radio.play(); else radio.stop();
    }
    if (missionClinic) missionClinic.update(dt);
    if (prologue) prologue.update(dt);
    if (actOne) actOne.update(dt);
    if (orlea) orlea.update(dt);
    klan.update(dt);
    if (newton) newton.update(dt);
    services.update(dt);
    nightlife.update(dt);
    casinos.update(dt);
    tips.update(dt);
    if (blueLight) blueLight.update(dt);
    if (westParish) westParish.update(dt, playerPos);
    if (eastBank) eastBank.update(dt, playerPos);
    if (tusouxroeNorth) tusouxroeNorth.update(dt, playerPos);
    if (stateWorld) stateWorld.update(dt, playerPos);
    hijacker.update(dt);
    if (nolantis) nolantis.update(dt);
    if (welcomeBack) welcomeBack.update(dt);
    if (alternate) alternate.update(dt);
    if (greedoCampaign) greedoCampaign.update(dt);
    if (syncCampaign) syncCampaign.update(dt);
    mapEditor.update(dt);
    updateRemotePlayers(dt);
    if (multiplayerMode && multiplayer?.connected && state.running) {
      networkInputTimer += dt;
      if (networkInputTimer >= 1 / 20) {
        networkInputTimer = 0;
        const netAt = state.veh ? state.veh.obj.position : playerPos;
        multiplayer.sendInput({
          forward: input.isDown("forward"), backward: input.isDown("back"), left: input.isDown("left"), right: input.isDown("right"),
          sprint: input.isDown("sprint"), crouch: input.isDown("crouch"), jump: input.isDown("jump"),
          x: netAt.x, y: netAt.y, z: netAt.z,
          yaw: state.veh ? state.veh.heading : (player?._yaw || 0),
          state: state.veh ? "VEHICLE" : (player?.anim || "IDLE"),
          vehicle: !!state.veh,
          weapon: state.weapon || null,
          aiming: input.isDown("aim"),
          firing: input.isDown("fire") || input.isDown("fireAlt"),
        });
      }
    }
    cine.update(dt);
    if (!cine.hasCamera && mapEditor.active) {
      mapEditor.updateCamera(dt);
    } else if (!cine.hasCamera) {
      const isAimingCamera = input.isDown("aim") && (!state.veh || state.weapon === "pistol" || state.weapon === "tec9");
      camCtl.setAiming(isAimingCamera);
      crosshair.style.display = isAimingCamera && !arsenal.current.melee ? "block" : "none";
      camCtl.update(dt, playerPos, state.veh, blockerGrid, playerMoveHeading);
      if (state.veh && state.veh.jolt > 0) {
        const j = state.veh.jolt;
        camera.position.x += (Math.random() - 0.5) * 0.25 * j;
        camera.position.y += (Math.random() - 0.5) * 0.35 * j;
      }
    }
    // The held weapon: parented to the character's hand, so this has to run
    // after the player's own update (the pose and the hand's world matrix have
    // to be current) and it takes the ACTOR, not a screen position. Hidden while
    // driving (the car is the view) and during cutscenes — without the gate its
    // last pose froze in the world — and while holstered (X).
    const shooting = input.isDown("attack") && !arsenal.current.melee;
    updateWeapon3D(player, playerPos, _camFwd, state.weapon, dt, input.isDown("aim"),
      state.cinematic || (!!state.veh && !input.isDown("aim")) || state.holstered, shooting);

    // Automatic fire: holding the trigger keeps firing at the weapon's own rate.
    // fire() gates on state.fireCd (= 60/rpm), so this cannot outrun the
    // configured rate, cannot spawn a second firing loop, and cannot fire at all
    // once the button is released — input.isDown("attack") goes false on mouseup.
    // Only "auto" weapons repeat; a semi-auto (and the bat) still needs a fresh
    // press per shot, and melee still needs its cooldown between swings.
    // A holstered weapon never gets here: fire() refuses on state.holstered.
    if (!state.cinematic && !state.paused && arsenal.auto && input.isDown("attack")) fire();
    compass.update(camCtl.heading);
    minimap.visible = !(nolantis && nolantis.inside);
    minimap.update({
      dt,
      player: state.veh ? state.veh.obj.position : playerPos,
      playerHeading: state.veh ? state.veh.heading : (player && player._yaw != null ? player._yaw : 0),
      cameraHeading: camCtl.heading,
      speed: state.veh ? Math.abs(state.veh.speed) : 0,
      blips: minimapBlips(),
    });
    orientDebug.update({ pos: playerPos, playerHeading: player && player._yaw != null ? player._yaw : 0, camera: camCtl, veh: state.veh });
    perf._sim += performance.now() - t0;
  }

  // tracers fade
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i];
    t.userData.life -= dt;
    t.material.opacity = Math.max(0, t.userData.life / 0.09) * 0.9;
    if (t.userData.life <= 0) { scene.remove(t); tracers.splice(i, 1); tracerPool.push(t); }
  }
  updateBlood(dt);
  if (muzzleLight) muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 240);

  // water ripple
  const time = clock.elapsedTime;
  for (const p of waterPatches) {
    const pos = p.geometry.attributes.position;
    const base = p.userData.base;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1];
      pos.setZ(i, Math.sin(bx * 0.6 + time * 1.6) * 0.06 + Math.cos(by * 0.7 + time) * 0.05);
    }
    pos.needsUpdate = true;
  }

  for (const s of shrooms) s.update(dt, camera);
  for (const t of torches) t.update(dt, camera);
  updateLightPool(dt, camera.position);

  // ---- atmosphere: drifting mist, lamp beams, headlights, sense of speed ----
  MIST.x = time;
  updateFx(dt);
  headlights.update(dt, state.veh);
  const rush = state.veh ? THREE.MathUtils.smoothstep(Math.abs(state.veh.speed), 12, 30) : 0;
  const fov = THREE.MathUtils.damp(camera.fov, 52 + rush * 8, 3, dt);
  if (Math.abs(fov - camera.fov) > 1e-3) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  composer.grade.uniforms.uBlur.value = rush;

  const r0 = performance.now();
  renderer.info.reset();
  wetRoads.render();
  composer.render(dt);
  perf.calls = renderer.info.render.calls;
  perf.tris = renderer.info.render.triangles;
  perf._render += performance.now() - r0;
  if (state.running) samplePerf(frameMs);
  governor(dt);
}

// Steps the quality tier down if this machine can't hold the 4K buffer.
const governor = createGovernor((tier) => {
  applyTier();
  flashGfx(`graphics auto-set to ${TIERS[tier].name}`);
});

function applyTier() {
  moon.shadow.mapSize.set(GFX.preset.shadow, GFX.preset.shadow);
  if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; }
  composer.resize();
  if (composer.bloom) composer.bloom.enabled = GFX.preset.bloom;
  if (composer.gtao) composer.gtao.enabled = GFX.preset.ao;
  if (composer.smaa) composer.smaa.enabled = GFX.preset.smaa;
  wetRoads.setQuality(GFX.preset.reflect, GFX.preset.reflectEvery);
  updateGfxLabel();
}

const gfxLabel = document.getElementById("gfxLabel");
let gfxFlash = 0;
function updateGfxLabel() {
  if (!gfxLabel) return;
  const [w, h] = composer.renderScale;
  gfxLabel.textContent = `${TIERS[GFX.tier].name} · ${w}×${h}`;
}
function flashGfx(msg) {
  if (!gfxLabel) return;
  gfxLabel.textContent = msg;
  clearTimeout(gfxFlash);
  gfxFlash = setTimeout(updateGfxLabel, 2200);
}

let lastElev = -1.8, lastAz = 200;
const _sunDir = new THREE.Vector3();
function simulate(dt) {
  state.fireCd = Math.max(0, state.fireCd - dt);
  state.holsterHintCd = Math.max(0, state.holsterHintCd - dt);
  state.hurtCd = Math.max(0, state.hurtCd - dt);
  worldTime.update(dt);
  weather.update(dt);
  state.dusk = worldTime.dusk;
  if (objTimer > 0) { objTimer -= dt; if (objTimer <= 0) objEl.textContent = defaultObjective(); }

  // ---- the day: sun up, sun across, sun down (daycycle.js) ----
  const sky = skyState(worldTime.hours);
  const f = weather.lightMultiplier;
  moon.color.setHex(sky.lightColor);
  moon.intensity = sky.lightIntensity * f;
  hemi.color.setHex(sky.hemiSky);
  hemi.groundColor.setHex(sky.hemiGround);
  hemi.intensity = sky.hemiIntensity * f;
  // wetRoads (fx.js) was built expecting this and never got it: uWetness sat at
  // its hardcoded construction-time default (0.6, full reflect strength) no
  // matter the weather, so every road looked like a full-strength wet mirror in
  // broad daylight, clear skies included — reflecting the bright sky straight
  // at the camera. That's a real, separate contributor to "still very bright
  // during the day" beyond the sun/exposure tuning in daycycle.js.
  wetRoads.uniforms.uWetness.value = weather.wetness;
  scene.fog.color.setHex(sky.fogColor);
  scene.fog.density = sky.fogDensity * weather.fogMultiplier;
  MIST.y = sky.mist * weather.mistMultiplier;
  lampPower = sky.lampsOn;
  renderer.toneMappingExposure = sky.exposure;
  if (composer.grade) {
    const gu = composer.grade.uniforms;
    gu.uContrast.value = sky.grade.contrast;
    gu.uSaturation.value = sky.grade.saturation;
    gu.uVignette.value = sky.grade.vignette;
    gu.uGrain.value = sky.grade.grain;
    gu.uShadowTint.value.setHex(sky.grade.shadowTint);
    gu.uHighlightTint.value.setHex(sky.grade.highlightTint);
  }
  if ((sky.lampsOn > 0.35) !== lampsLit) {         // the lamps come on at dusk, off at dawn
    lampsLit = sky.lampsOn > 0.35;
    for (const g of lampFx) for (const m of g.userData.glows) m.visible = lampsLit;
  }
  // re-baking the PMREM probe is expensive — only when the sun has moved enough to show
  if (Math.abs(sky.elevation - lastElev) > 1.2 || Math.abs(sky.azimuth - lastAz) > 4) {
    lastElev = sky.elevation;
    lastAz = sky.azimuth;
    env.setAtmosphere(sky.turbidity, sky.rayleigh);
    env.setElevation(sky.elevation, sky.azimuth);
    env.setIntensity(sky.envIntensity * f, sky.bgIntensity);
  }

  // ---- camera orbit (Q/E), secondary to mouse look ----
  const orbit = input.axis("orbitLeft", "orbitRight");
  if (orbit) camCtl.addYaw(orbit * dt * 2.0);

  if (state.veh) drivingUpdate(dt);
  else onFootUpdate(dt);

  updateVehicleFires(dt);
  updateWrecks(dt);

  // Car audio: the player's car only — the traffic pool never builds or plays.
  // Every exit path (walking out, hijacked, crashed) just clears state.veh, so
  // tear the *previous* car's audio down here instead of at each exit site.
  if (state.veh && state.veh.audio) {
    const v = state.veh;
    const isSkidding = (input.isDown("brake") && Math.abs(v.speed) > 5) || (Math.abs(input.axis("left", "right")) > 0.5 && Math.abs(v.speed) > 25);
    v.audio.update(Math.abs(v.speed * 3.6), isSkidding, true);
    lastVehAudio = v.audio;
  } else if (lastVehAudio) {
    lastVehAudio.update(0, false, false);
    lastVehAudio = null;
  }

  // keep the shadow box over the player, with the light where the sky says the sun is
  _sunDir.setFromSphericalCoords(70, THREE.MathUtils.degToRad(90 - Math.max(6, sky.elevation)), THREE.MathUtils.degToRad(sky.azimuth));
  moon.position.set(playerPos.x + _sunDir.x, Math.max(24, _sunDir.y), playerPos.z + _sunDir.z);
  moon.target.position.set(playerPos.x, 0, playerPos.z);
  moon.target.updateMatrixWorld();

  // ---- wanted level (only once the Sheriff is paying attention) ----
  if (copsActive()) {
    state.crimeCd = Math.max(0, state.crimeCd - dt);
    // police.js holds the last-known position and the give-up window: once the
    // cruisers have lost you for GIVEUP_WINDOW it drains the heat fast, and the
    // wanted level is allowed to reach 0 -- it used to be floored at 1 star for
    // the rest of the run, so a chase could only end by wrecking every cruiser.
    police.updateSearchAndEvasion(dt, playerPos, sheriffSees(dt), state);
    if (state.crimeCd <= 0) state.heat = Math.max(0, state.heat - dt * (state.veh ? 0.3 : 0.16));
    const w = starsForHeat(state.heat);
    if (w !== state.wanted) {
      if (w === 0) { police.clearPursuit(); flashObjective("You lost them."); }
      state.wanted = w;
      syncHUD();
    }
    updateSheriffs(dt);
  }

  // ---- Popeyes buckets (health) ----
  for (const b of buckets) {
    if (b.userData.taken) continue;
    b.rotation.y += dt * 1.6;
    b.position.y = b.userData.baseY + Math.sin(clock.elapsedTime * 2 + b.position.z) * 0.1;
    if (state.hp < 100 && playerPos.distanceTo(b.position) < 1.5) {
      b.userData.taken = true;
      b.visible = false;
      state.hp = Math.min(100, state.hp + 28);
      syncHUD();
      flashObjective("Popeyes. That's a spicy heal. +28 HP");
    }
  }

  // ---- loot on the ground ----
  loot.update(dt);

  // ---- enemies ----
  const a0 = performance.now();
  updateEnemyPopulation(dt);
  updateZombiePopulation(dt);
  npcEnv.driving = !!state.veh;
  npcs.beginFrame(dt);
  for (const e of enemies) {
    if (e.dead === "gone") continue;
    // false = paused or off-beat for its distance: skip the animation as well
    if (updateEnemy(e, dt) && e.spr.update) e.spr.update(dt, camera);
  }
  if (populationOn) factionWar.update(dt, enemies, playerPos);   // no turf wars during set pieces
  perf._ai += performance.now() - a0;

  // ---- ambient traffic ----
  if (traffic) traffic.update(dt, playerPos, trafficObstacles(), state.veh);

  if (state.hp <= 0) lose();
  syncHUD();
}

// A mission can pin the objective line; null hands it back to the free-roam text.
let storyObjective = null;
function setStoryObjective(text) {
  if (storyObjective === text) return;
  storyObjective = text;
  if (objTimer <= 0) objEl.textContent = defaultObjective();
}

function defaultObjective() {
  if (storyObjective) return storyObjective;
  if (copsActive() && state.wanted >= 1) return "Lose the Sheriff.";
  return "Free roam. Explore Dixie Beaux.";
}

function hitPlayer(dmg) {
  state.hp -= dmg;
  state.hurtCd = 0.4;
  hurtFlash();
  if (!state.veh) { player.play("hurt", { loop: false, force: true }); attackTimer = 0.3; }
}

// ============================================================ ON FOOT
function onFootUpdate(dt) {
  // mid car-jack, hijack.js moves the player; on-foot input waits
  if (hijacker.active) {
    attackTimer = Math.max(0, attackTimer - dt);
    player.update(dt, camera);
    return;
  }
  // WASD drives the dev-mode free-fly camera instead while it's active — the
  // player would otherwise wander off screen unattended the whole time.
  if (mapEditor.active) {
    attackTimer = Math.max(0, attackTimer - dt);
    return;
  }
  // Camera-relative: W walks where the camera looks (flattened), D to its right.
  // (This used to rotate the keys by −yaw, which inverted them facing east/west.)
  const fwdIn = input.axis("back", "forward");
  const strafeIn = input.axis("left", "right");
  camCtl.forward(_camFwd);
  camCtl.right(_camRight);
  const mv = _mv.set(0, 0, 0).addScaledVector(_camFwd, fwdIn).addScaledVector(_camRight, strafeIn);
  const moving = mv.lengthSq() > 0;
  playerMoveHeading = moving ? headingFromVector(mv.x, mv.z) : null;
  const sprint = input.isDown("sprint");
  let speed = 6.5;
  if (sprint && state.sp > 1 && moving) { speed = 12.5; state.sp -= dt * 26; }
  else state.sp = Math.min(100, state.sp + dt * 14);

  if (moving) {
    mv.normalize();
    if (strafeIn !== 0) player.setFlip(strafeIn);
    playerFacing.copy(mv);
    const next = _step.copy(playerPos).addScaledVector(mv, speed * dt);
    resolveCollision(playerPos, next, 0.6);
    checkPedestrianBump();
  }
  bumpCd = Math.max(0, bumpCd - dt);
  if (!(nolantis && nolantis.inside)) {
    playerPos.x = THREE.MathUtils.clamp(playerPos.x, MAP.minX + 4, MAP.maxX - 4);
    playerPos.z = THREE.MathUtils.clamp(playerPos.z, MAP.minZ + 4, MAP.maxZ - 4);
  }
  player.position.copy(playerPos);
  player.visible = true;

  attackTimer = Math.max(0, attackTimer - dt);
  if (attackTimer <= 0) {
    if (moving) {
      player.play("walk", { fps: 10 });
      if (input.isDown("aim")) player._yaw = camCtl.heading;
    } else if (input.isDown("aim")) {
      player.play("aim");
      player._yaw = camCtl.heading;
    } else {
      player.play("idle", { fps: 5 });
    }
  }
  player.update(dt, camera);
}

// Flashes a pedestrianChatter.js line and, if the archetype has a Fish Audio
// voice (voiceCast.js — hogs don't), plays it. `e.spr.female` only exists on
// the 3D-rig archetypes (hoodrat/hobo/thug/prostitute — characters.js
// Hoodrat); the flat-sprite archetypes ignore the female arg entirely
// (pedestrianVoiceWho only branches gender for hoodrat/hobo/thug).
function speakPedestrian(e, line) {
  flashObjective(line.display);
  const voiceWho = pedestrianVoiceWho(e.type, !!e.spr.female);
  if (voiceWho) cine.playVoiceLine(voiceWho, line.text);
}

// A calm pedestrian jostled on the sidewalk gets a one-liner and a shove out
// of the way — no damage, no aggro, just flavor. Hostile/fleeing/dead NPCs
// and hogs mid-charge are left alone; the fight lines in fire() cover those.
const BUMP_R = 1.15;
function checkPedestrianBump() {
  if (bumpCd > 0) return;
  for (const e of enemies) {
    if (e.dead || e.state === "hostile" || e.state === "flee" || e.state === "in_car" || e.state === "approaching_car") continue;
    const dx = e.spr.position.x - playerPos.x, dz = e.spr.position.z - playerPos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 > BUMP_R * BUMP_R) continue;
    const d = Math.sqrt(d2) || 1;
    e.spr.position.x += (dx / d) * 0.6;
    e.spr.position.z += (dz / d) * 0.6;
    speakPedestrian(e, bumpLine(e.type, e.T.label));
    bumpCd = 2.2;
    break;
  }
}

// ============================================================ DRIVING
const _fwd = new THREE.Vector3();
const _next = new THREE.Vector3();
function drivingUpdate(dt) {
  state.sp = Math.min(100, state.sp + dt * 14);
  const v = state.veh;
  // The vehicle defines forward, never the camera: W accelerates along its own
  // heading, A/D steer it (vehicles.js arcade model).
  const inX = input.axis("left", "right");
  // Push bikes need a deliberate pedal input: Space adds momentum, while
  // releasing it lets the bicycle coast and naturally slow down.
  const throttle = v.def && v.def.pedal ? (input.isDown("jump") ? 1 : 0) : input.axis("back", "forward");
  stepArcadeVehicle(v, { throttle, steer: inX, brake: input.isDown("brake") }, dt);
  forwardFromHeading(v.heading, _fwd);
  const next = _next.copy(v.obj.position).addScaledVector(_fwd, v.speed * dt);

  // collide with world blockers (excluding own): push out of them, then drop only
  // the motion that points into the obstacle, so the car can slide, back off or
  // steer away (vehicles.js)
  const intendedX = next.x, intendedZ = next.z;
  blockerGrid.resolve(next, v.r, next, v.blocker);
  collisionResponse(v, intendedX, intendedZ, next.x, next.z, dt);
  next.x = THREE.MathUtils.clamp(next.x, MAP.minX + 3, MAP.maxX - 3);
  next.z = THREE.MathUtils.clamp(next.z, MAP.minZ + 3, MAP.maxZ - 3);
  v.obj.position.copy(next);
  v.blocker.x = next.x; v.blocker.z = next.z;

  // body roll / bob
  v.wob += dt * (6 + Math.abs(v.speed) * 0.4);
  v.obj.rotation.y = v.heading;
  if (v.def && v.def.bike) {
    // a bike leans into the turn, more with speed; a scooter barely
    const want = inX * v.def.seat.lean * Math.min(1, Math.abs(v.speed) / 14);
    v.lean = (v.lean || 0) + (want - (v.lean || 0)) * Math.min(1, dt * 6);
    v.obj.rotation.z = v.lean;
  } else {
    v.obj.rotation.z = -inX * Math.min(0.12, Math.abs(v.speed) / 60) + Math.sin(v.wob) * 0.01;
  }

  // potholes: a jolt the moment a wheel drops into one, harder at speed
  if (potholes && Math.abs(v.speed) > 2) {
    const hit = potholes.hitTest(next.x, next.z, v.r * 0.6);
    if (hit && hit.hole !== v.lastHole) {
      const hard = hit.depth * Math.min(1, Math.abs(v.speed) / 22);
      v.speed *= 1 - 0.22 * hard;
      v.jolt = Math.min(1, (v.jolt || 0) + 0.35 + hard);
      v.potholesHit = (v.potholesHit || 0) + 1;
    }
    v.lastHole = hit ? hit.hole : null;
  }
  // Crash damage (vehicles.js sets v.impact on the first frame of a hit, only
  // once it clears CRASH_MIN_IMPACT — anything below that is a scrape, not a
  // crash, and does no damage at all)
  if (v.impact > 0) {
    v.hp -= Math.max(0, v.impact - CRASH_MIN_IMPACT) * CRASH_DAMAGE_SCALE;
    v.impact = 0;
    if (v.hp <= 0 && !v.exploded) { crime(0.5); explodeCar(v); }
    else if (v.hp / (v.hpMax || 40) < VEHICLE_FIRE_HP_FRAC) startVehicleFire(v);
  }
  if (v.jolt > 0) {
    v.jolt = Math.max(0, v.jolt - dt * 3.2);
    v.obj.rotation.x = Math.sin(v.wob * 7) * 0.05 * v.jolt;
    v.obj.rotation.z += Math.sin(v.wob * 5) * 0.03 * v.jolt;
  } else if (v.obj.rotation.x) {
    v.obj.rotation.x = 0;
  }

  // roadkill
  if (Math.abs(v.speed) > 7) {
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.spr.position.distanceTo(next) < 2.4) {
        e.hp -= 5;
        npcs.provoke(e);
        e.spr.position.addScaledVector(_fwd, 1.2);
        v.speed *= 0.82;
        if (e.hp <= 0) { killEnemy(e); if (e.type !== "hog") crime(1.1); }
      }
    }
    for (const c of police.footCops) {
      if (c.dead) continue;
      if (c.spr.position.distanceTo(next) < 2.4) {
        c.hp -= 5;
        c.spr.position.addScaledVector(_fwd, 1.2);
        v.speed *= 0.82;
        if (c.hp <= 0) {
          c.dead = true; 
          c.state = "dead";
          if (c.spr.play) c.spr.play("death", { fps: 9, loop: false, force: true });
          loot.dropFor(c);
          crime(2.0); // Killing a cop
          flashObjective(`Deputy down.  ${EMOJI.hog} ${kills.hog}   ${EMOJI.redneck} ${kills.redneck}   ${EMOJI.hoodrat} ${kills.hoodrat}`);
        } else {
          crime(0.4);
        }
      }
    }
  }

  // player rides along: out of sight in a car, astride a bike
  playerPos.copy(next);
  player.position.copy(next);
  if (v.def && v.def.bike) {
    player.visible = true;
    player.position.addScaledVector(_fwd, v.def.seat.z);
    player.rideHip = v.def.seat.y;
    player.rideLean = v.def.name === "scooter" ? 0.05 : v.def.name === "pushbike" ? 0.16 : 0.3;
    player._yaw = v.heading;
    player.play("ride");
    if (player._last) player._last.copy(player.position);
    player.update(dt, camera);
    player.rotation.z = v.obj.rotation.z;      // lean with the bike
  } else {
    player.visible = false;
  }

  syncHUD();
}

function nearestVehicle(pos, maxD) {
  let best = null, bd = maxD;
  for (const v of vehicles) {
    if (v === state.veh || v.dead || v.locked) continue;
    const d = v.obj.position.distanceTo(pos);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

function enterExitVehicle() {
  if (!state.running || state.cinematic || hijacker.active) return;
  if (state.veh) {
    if (multiplayerMode && multiplayer?.connected) {
      multiplayer.send("VEHICLE_EXIT");
    }
    // step out
    const v = state.veh;
    state.veh = null;
    v.speed = 0;
    if (v.seats) v.seats[0].occupant = null;
    const side = exitOffset(v, _fwd, v.def && v.def.bike ? 1.3 : 2.4);   // out of the driver's door (or off the bike)
    playerPos.copy(v.obj.position).add(side);
    player.position.copy(playerPos);
    player.visible = true;
    flashObjective("On foot.");
    return;
  }
  const v = nearestVehicle(playerPos, 4.2);
  if (v && canHijack(v)) {
    hijacker.start(v);                         // someone's driving it: pull them out first
    return;
  }
  if (v) {
    state.veh = v; if (v) arsenal.enforceVehicle();
    if (v.seats) v.seats[0].occupant = "player";
    if (v.sheriff) { crime(0.8); flashObjective("You jacked a Sheriff cruiser. Bold."); }
    else flashObjective("Jacked it. Floor it.");
  } else {
    flashObjective("Nothing to jack here.");
  }
}

// ============================================================ SHERIFF
let newton = null;          // newton.js — the schoolyard at dawn
let sheriffProto = null;
function policeShoot(origin, damage, source = "police") {
  const from = origin && origin.clone ? origin.clone() : new THREE.Vector3(origin.x, origin.y || 1.2, origin.z);
  from.y = Math.max(1.2, from.y || 1.2);
  const to = playerPos.clone();
  to.y = 1.05;
  spawnTracer(from, to);
  muzzleFlash(from, to);
  cine.sfx("pistolShot");
  // Shared by every cruiser, deputy and the helicopter — this was a guaranteed
  // hit on every cooldown tick, at any range up to each shooter's own cap
  // (45m/38m/58m). With several of them converging that stacked into lethal
  // DPS almost instantly. Real suppressive fire from a moving car or a running
  // deputy misses plenty; scale that in by range instead of a certain hit.
  const dist = from.distanceTo(to);
  const missChance = THREE.MathUtils.clamp(0.28 + dist / 65, 0.28, 0.8);
  if (Math.random() < missChance) return;
  if (state.veh) damageVehicle(state.veh, damage * 0.8);
  else hitPlayer(damage);
  if (source === "helicopter") flashObjective("POLICE HELICOPTER: incoming fire!");
}
// A cruiser used to be dropped at a random bearing 55 m out with no check on
// what was there, so a chase that started next to a block put one INSIDE a
// building. The push-out in updateSheriffs then walked it out through a wall,
// which reads exactly like a police car driving through the wall — because it
// is. Try bearings around the ring until one is clear, and if the whole ring is
// blocked, don't spawn this frame rather than spawn inside something.
function clearOfBlockers(x, z, r) {
  let ok = true;
  blockerGrid.near(x, z, r + 6, (b) => {
    if (!ok) return false;
    const dx = x - b.x, dz = z - b.z, min = b.r + r;
    if (dx * dx + dz * dz < min * min) ok = false;
    return false;
  });
  if (!ok) return false;
  // A blocker test alone is not enough. Plenty of buildings are HOLLOW — their
  // blockers ring the walls and the middle is empty — so a point inside one
  // reads as perfectly clear while being visibly inside a tower. Nothing can
  // walk in there (the walls stop it), which means anything found in there got
  // spawned in there. Reject the footprints too.
  for (const o of losBoxes) {
    if (o.minY < 1 && x > o.minX && x < o.maxX && z > o.minZ && z < o.maxZ) return false;
  }
  return true;
}
function spawnSheriff() {
  if (!sheriffProto) return;
  const start = Math.random() * Math.PI * 2;
  let ang = null, sx = 0, sz = 0;
  for (let i = 0; i < 12 && ang === null; i++) {
    const a = start + (i / 12) * Math.PI * 2;
    for (const dist of [55, 48, 62]) {
      const x = THREE.MathUtils.clamp(playerPos.x + Math.cos(a) * dist, MAP.minX + 6, MAP.maxX - 6);
      const z = THREE.MathUtils.clamp(playerPos.z + Math.sin(a) * dist, MAP.minZ + 6, MAP.maxZ - 6);
      if (clearOfBlockers(x, z, 2.2)) { ang = a; sx = x; sz = z; break; }
    }
  }
  if (ang === null) return;                       // nowhere clear: try again next tick
  const car = sheriffProto.clone(true);
  car.position.set(sx, 0, sz);
  car.rotation.y = ang;
  scene.add(car);
  const v = registerVehicle(car, 2.0, { sheriff: true, hp: 32 });
  v.shootCd = Math.random() * 0.8;
  sheriffs.push(v);
}
// The Sheriff answers crime from the first star's worth of it: heat → wanted
// stars → cruisers. It used to stay away until a dozen Redneck/Hoodrat kills, so
// most players never met the wanted level at all (this session's own report,
// independently reached the same conclusion before spotting this upstream fix
// mid-merge). Once called, the system stays on — it stands down at zero stars —
// exactly as it did after the twelfth kill.
// Stars go the GTA ways: get out of sight and stay hidden until they give up
// (police.js), or drive into a Pay 'n' Spray (services.js).
const WANTED_HEAT = 1.4;              // one star (see WANTED_THRESHOLDS below)
const CRUISER_FOOT_STANDOFF = 9;      // m: how close a cruiser will get to a pedestrian before holding off
// Heat needed to reach 1..6 stars. Was a flat `heat / 1.4`, so six stars — the
// max police response, cruisers + a full foot squad + a helicopter — cost the
// same per star as the first one: about seven kills (crime() ~1.1-1.2 each) and
// you were maxed out. Escalating instead: the first couple of stars stay just
// as easy to earn (that responsiveness was a deliberate earlier fix), but
// climbing to the top costs a full rampage's worth of heat, not a scuffle's.
const WANTED_THRESHOLDS = [0, 1.4, 3.2, 5.8, 9.2, 13.8, 20];
function starsForHeat(heat) {
  if (heat <= 0.1) return 0;
  let stars = 0;
  for (let i = 1; i < WANTED_THRESHOLDS.length; i++) {
    if (heat >= WANTED_THRESHOLDS[i]) stars = i;
  }
  return Math.max(1, stars);
}
// No cops in zombie mode (human request, 2026-09-23): the Sheriff's department
// isn't part of that world, and a "★ WANTED, Mercer's on the way" flash while
// you're fighting off a horde would be actively misleading — nobody's coming.
function copsActive() { return !state.zombieMode && (state.forceCops || !!state.copsCalled); }
function checkHeatUp() {
  if (state.zombieMode || state.copsCalled || state.heat < WANTED_HEAT) return;
  state.copsCalled = true;
  // Give dispatch a beat before anyone turns out, rather than a cruiser
  // appearing on the same frame the first star lights up.
  footSpawnCd = Math.max(footSpawnCd, 1.5);
  sheriffSpawnCd = Math.max(sheriffSpawnCd, 3);
  flashObjective("★ WANTED. Sheriff Mercer's on the way. Lose him: get out of sight and stay hidden, or drive into a Pay 'n' Spray.");
  syncHUD();
}
// ---- can a cruiser see you? (TASK-020) ------------------------------------
// Sight is range plus line of sight through the same boxes the camera treats as
// occluders. Re-tested 5x a second, not every frame: it only drives the give-up
// timer, and a chase turns on a few hundred ms, not on one frame.
let losBoxes = [];
const COP_SIGHT = 62;          // m: past this you are a rumour, not a target
const COP_POINT_BLANK = 14;    // m: this close they have you, walls or not
let _seenCd = 0, _seenNow = false;
function segmentBlocked(ax, az, bx, bz) {
  const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx);
  const z0 = Math.min(az, bz), z1 = Math.max(az, bz);
  const dx = bx - ax, dz = bz - az;
  for (const o of losBoxes) {
    if (o.maxY !== undefined && o.maxY < 1.6) continue;       // low walls do not hide a car
    if (o.maxX < x0 || o.minX > x1 || o.maxZ < z0 || o.minZ > z1) continue;
    // slab test in the x/z plane, unrolled: this runs over every occluder, and the
    // array-of-pairs version allocated on each one
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-6) {
      if (o.minX - ax > 0 || o.maxX - ax < 0) continue;
    } else {
      let near = (o.minX - ax) / dx, far = (o.maxX - ax) / dx;
      if (near > far) { const t = near; near = far; far = t; }
      if (near > t0) t0 = near;
      if (far < t1) t1 = far;
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-6) {
      if (o.minZ - az > 0 || o.maxZ - az < 0) continue;
    } else {
      let near = (o.minZ - az) / dz, far = (o.maxZ - az) / dz;
      if (near > far) { const t = near; near = far; far = t; }
      if (near > t0) t0 = near;
      if (far < t1) t1 = far;
      if (t0 > t1) continue;
    }
    return true;
  }
  return false;
}
function sheriffSees(dt) {
  _seenCd -= dt;
  if (_seenCd > 0) return _seenNow;
  _seenCd = 0.2;
  _seenNow = false;
  const at = state.veh ? state.veh.obj.position : playerPos;
  for (const s of sheriffs) {
    if (s.dead) continue;
    const d = Math.hypot(at.x - s.obj.position.x, at.z - s.obj.position.z);
    if (d > COP_SIGHT) continue;
    if (d < COP_POINT_BLANK || !segmentBlocked(s.obj.position.x, s.obj.position.z, at.x, at.z)) {
      _seenNow = true;
      break;
    }
  }
  return _seenNow;
}
/** Send a cruiser home: off the blocker grid, out of the lists, out of the scene. */
function retireSheriff(v) {
  v.dead = true;
  scene.remove(v.obj);
  const bi = blockers.indexOf(v.blocker);
  if (bi >= 0) blockers.splice(bi, 1);
  blockerGrid.remove(v.blocker);
  const vi = vehicles.indexOf(v);
  if (vi >= 0) vehicles.splice(vi, 1);
  const si = sheriffs.indexOf(v);
  if (si >= 0) sheriffs.splice(si, 1);
}
function updateSheriffs(dt) {
  // One star is a beat cop's business, not a car chase: only foot deputies
  // turn out. Cruisers wait for two stars and up, same as the helicopter
  // waits for three (HELI_MIN_STARS) — the response escalates in kind, not
  // just in number.
  const want = state.wanted >= 2 ? Math.min(6, state.wanted - 1) : 0;
  const footWant = state.wanted >= 1 ? Math.min(8, state.wanted + 1) : 0;

  // Dispatch staggers who it sends, instead of the whole shift arriving on
  // the same frame the star count ticks over.
  sheriffSpawnCd = Math.max(0, sheriffSpawnCd - dt);
  if (sheriffSpawnCd <= 0 && sheriffs.filter((s) => !s.dead).length < want && sheriffProto) {
    spawnSheriff();
    sheriffSpawnCd = 3.5 + Math.random() * 2;
  }
  footSpawnCd = Math.max(0, footSpawnCd - dt);
  if (footSpawnCd <= 0 && police.footCops.filter((c) => !c.dead).length < footWant) {
    // Same unchecked-ring bug the cruisers had: a random bearing with no test
    // for what is there drops deputies INSIDE buildings, and a foot cop that
    // starts in a wall spends its life being pushed out of one. Find clear
    // ground first, and if the ring is solid, skip this one rather than bury it.
    const start = Math.random() * Math.PI * 2;
    let placed = false;
    for (let i = 0; i < 10 && !placed; i++) {
      const a = start + (i / 10) * Math.PI * 2;
      const r = 14 + Math.random() * 16;
      const x = playerPos.x + Math.cos(a) * r, z = playerPos.z + Math.sin(a) * r;
      if (!clearOfBlockers(x, z, 0.7)) continue;
      police.spawnFootCop(x, z);
      placed = true;
    }
    footSpawnCd = placed ? 2.5 + Math.random() * 1.5 : 0.4;
  }

  // Where they drive: you while they can see you, the last place they saw you
  // once they cannot. Homing on your live position is what made this inescapable.
  const at = state.veh ? state.veh.obj.position : playerPos;
  const lastKnown = police.pursuitTarget();
  const searching = police.hasGivenUp();
  const standDown = state.wanted === 0;
  const target = standDown ? null : (lastKnown || at);

  let onTop = false;
  const footOnTop = police.updateFootCops(dt, { player: at, driving: !!state.veh, state });
  onTop = footOnTop > 0;
  police.updateHelicopters(dt, { player: at, state });
  const on = Math.sin(clock.elapsedTime * 12) > 0;
  const flash = on ? 0x3366ff : 0xff2233;
  // the lightbar alternates on the shared cruiser materials: two uniform writes for
  // the whole fleet, no extra lights (adding one would recompile every shader)
  const bar = sheriffProto && sheriffProto.userData.lightbar;
  if (bar) {
    const live = !standDown && sheriffs.some((s) => !s.dead);
    bar.red.material.emissiveIntensity = live && on ? 3.2 : 0.12;
    bar.blue.material.emissiveIntensity = live && !on ? 3.2 : 0.12;
  }
  let lit = 0;
  for (let i = sheriffs.length - 1; i >= 0; i--) {
    const s = sheriffs[i];
    if (s.dead) continue;
    const gone = Math.hypot(at.x - s.obj.position.x, at.z - s.obj.position.z);
    if (standDown && gone > 70) { retireSheriff(s); continue; }   // chase over: leave, off screen
    // the two persistent beacon lights ride the first two cruisers
    if (lit < beaconLights.length) {
      const b = beaconLights[lit++];
      b.position.copy(s.obj.position).setY(2.4);
      b.color.setHex(flash);
      b.intensity = standDown ? 0 : 20;
    }
    if (target) {
      const to = _tmpV.set(target.x - s.obj.position.x, 0, target.z - s.obj.position.z);
      const d = to.length();
      to.normalize();
      const desired = Math.atan2(to.x, to.z);
      let dh = desired - s.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      s.heading += THREE.MathUtils.clamp(dh, -2.4 * dt, 2.4 * dt);
      // A cruiser chasing a car drives to catch and PIT it. Chasing a
      // pedestrian, it holds a standoff instead of closing the last few
      // metres — nobody has a blocker to stop a car walking through them, so
      // without this it just drove straight over you. Deputies (on foot,
      // police.js) make the actual arrest.
      const holdingOff = !state.veh && gone < CRUISER_FOOT_STANDOFF;
      const spd = holdingOff ? 0 : d < 6 ? 7 : searching ? 11 : 18;
      s.speed = THREE.MathUtils.lerp(s.speed, spd, dt * 1.5);
    } else {
      s.speed = THREE.MathUtils.lerp(s.speed, 0, dt * 1.2);
    }
    _fwd.set(Math.sin(s.heading), 0, Math.cos(s.heading));
    const nx = s.obj.position.x + _fwd.x * s.speed * dt;
    const nz = s.obj.position.z + _fwd.z * s.speed * dt;
    const resolved = _next.set(
      THREE.MathUtils.clamp(nx, MAP.minX + 4, MAP.maxX - 4), 0,
      THREE.MathUtils.clamp(nz, MAP.minZ + 4, MAP.maxZ - 4)
    );
    blockerGrid.resolve(resolved, s.r, resolved, s.blocker);
    s.obj.position.copy(resolved);
    s.blocker.x = s.obj.position.x; s.blocker.z = s.obj.position.z;
    s.obj.rotation.y = s.heading;

    s.shootCd = Math.max(0, (s.shootCd || 0) - dt);
    // Cruisers don't fire on a pedestrian at all — a car shooting at someone
    // on foot read as far more aggressive than the arrest it's supposed to
    // be; deputies (police.js) carry that job when you're not in a vehicle.
    if (!standDown && state.veh && gone < 45 && gone > 7 && s.shootCd <= 0 && sheriffSees(0)) {
      s.shootCd = 1.4 + Math.random() * 0.6;
      policeShoot(s.obj.position, 3.5, "cruiser");
    }
    // Close contact is a PIT/ram — only meaningful car-to-car. On foot the
    // standoff above keeps the cruiser back; the deputy melee (footOnTop)
    // is what actually busts you.
    if (!standDown && state.veh && gone < 4) {
      onTop = true;
      state.veh.speed *= (1 - dt * 1.5);
    }
  }
  for (; lit < beaconLights.length; lit++) beaconLights[lit].intensity = 0;
  if (onTop && !state.veh && state.bustCd <= dt) flashObjective("DEPUTY: Stop moving! You are under arrest — break contact or surrender.");
  state.bustCd = onTop ? state.bustCd + dt : Math.max(0, state.bustCd - dt * 0.6);
  if (state.bustCd > 3 && !state.veh) {
    flashObjective("ARRESTED — Sheriff Mercer has you.");
    return busted();
  }
}

function damageVehicle(v, amount) {
  v.hp -= amount;

  if (v.def && v.def.bike && v.seats && v.seats[0] && v.seats[0].occupant === "npc") {
    if (traffic) traffic.releaseVehicle(v);
    v.seats[0].occupant = null;
    spawnEnemy(Math.random() < 0.55 ? "hoodrat" : "redneck", v.obj.position.x, v.obj.position.z);
    const e = enemies[enemies.length - 1];
    e.hp -= amount; 
    const freshFight = e.state !== "hostile" && e.state !== "flee";
    npcs.provoke(e);
    spawnBloodSpray(e.spr.position.clone().setY(1.0), new THREE.Vector3(0, 1, 0));
    if (e.hp <= 0) { 
      killEnemy(e); 
      crime(1.2); 
    } else {
      e.spr.play("hurt", { loop: false, force: true });
      e.t = 0;
      if (freshFight) speakPedestrian(e, fightLine(e.type, e.T.label, e.mood));
    }
  }

  if (v.exploded) return;
  if (v.hp <= 0) { explodeCar(v); return; }
  if (v.hp / (v.hpMax || 40) < VEHICLE_FIRE_HP_FRAC) startVehicleFire(v);
}

function updateEnemy(e, dt) {
  const p = e.spr.position;
  const T = e.T;

  if (e.dead) {
    e.t += dt;
    if (e.zombifyTimer > 0) {
      e.zombifyTimer -= dt;
      if (e.zombifyTimer <= 0) {
        scene.remove(e.spr); e.dead = "gone";
        spawnEnemy("zombie", p.x, p.z);
        return false;
      }
      return true; // prevent fading while waiting to rise
    }
    if (e.type === "hog") {
      e.spr.rotation.z = Math.min(Math.PI / 2, e.spr.rotation.z + dt * 4); // topple
      e.fade -= dt * 0.35;
      e.spr.scale.setScalar(Math.max(0.01, e.fade));
      if (e.fade <= 0) { scene.remove(e.spr); e.dead = "gone"; }
    } else if (e.spr.finished) {
      e.fade -= dt * 0.4;
      e.spr.material.opacity = Math.max(0, e.fade);
      e.spr.blob.material.opacity = Math.max(0, e.fade * 0.3);
      if (e.fade <= 0) { scene.remove(e.spr); e.dead = "gone"; }
    }
    return true;                 // keep playing the death animation
  }

  // behaviour, level of detail and movement live in npc.js
  return npcs.update(e, dt, npcEnv);
}

// slide-along-obstacle collision: mutate `current` toward `next`
function resolveCollision(current, next, radius) {
  blockerGrid.resolve(next, radius, current, null);
}

// Put the player (and whatever she is driving) somewhere. The district modules
// each carry their own inline copy of this in their ctx; this is the one the
// module-scope systems use, hoisted so it is available before boot() has run.
function teleportPlayer(x, z, heading = 0) {
  const v = state.veh;
  if (v) {
    v.obj.position.x = x; v.obj.position.z = z;
    v.heading = heading; v.obj.rotation.y = heading; v.speed = 0;
    v.blocker.x = x; v.blocker.z = z;
  }
  playerPos.set(x, 0, z);
  if (player) {
    player.position.set(x, 0, z);
    if (player._last) player._last.copy(player.position);
  }
}

// ---------------------------------------------------------------- boot
async function boot() {
  setLoadStage("loading sprites…", 30);
  const [rn, om, sh, to] = await Promise.all([
    loadAtlas("redneck"), loadAtlas("oldman"), loadAtlas("shroom"), loadAtlas("torch"),
  ]);
  atlases.redneck = rn;
  atlases.oldman = om;
  atlases.shroom = sh;
  atlases.torch = to;

  // Keseme Nadia: a 3D actor with the same play / update / setFlip surface as
  // the old sprite, so on-foot movement and combat drive her unchanged
  player = makeCastMember(makeHoodrat, "keseme", { height: 1.74 });
  player.position.copy(playerPos);
  scene.add(player);

  // Generating the world's PBR surfaces is a few seconds of synchronous canvas
  // work. It used to run at module top level, which froze the page on
  // "loading assets…" with no feedback and looked like the game had hung.
  // Staged here instead, with a paint between each step.
  setLoadStage("pouring the asphalt…", 42);
  await paint();
  buildAsphalt();
  parkTex = carParkTexture();

  setLoadStage("laying the bayou floor…", 52);
  await paint();
  buildGround();

  setLoadStage("planting the swamp…", 62);
  await paint();
  buildTrees();
  buildSwampTrees();

  setLoadStage("building the parish…", 72);
  await paint();
  await buildLevel();
  alternate = createAlternateCampaign({
    scene, cine, state, playerPos, getPlayer: () => player,
    makeActor: (id) => createPlayerCharacter(id, {
      makePeta: () => makeCastMember(makeHoodrat, "keseme", { height: 1.74 }), makeHoodrat,
    }),
    flashObjective,
  });
  alternate.buildSet();
  greedoCampaign = createGreedoCampaign({
    scene, cine, state, playerPos, getPlayer: () => player, makeHoodrat,
    makeActor: (id) => createPlayerCharacter(id, {
      makePeta: () => makeCastMember(makeHoodrat, "keseme", { height: 1.74 }), makeHoodrat,
    }),
    flashObjective, setObjective: setStoryObjective,
  });
  greedoCampaign.buildSet();
  syncCampaign = createSyncCampaign({
    scene, cine, state, playerPos, getPlayer: () => player,
    makeActor: (id) => createPlayerCharacter(id, {
      makePeta: () => makeCastMember(makeHoodrat, "keseme", { height: 1.74 }), makeHoodrat,
    }),
    flashObjective, setObjective: setStoryObjective,
  });
  syncCampaign.buildSet();

  // Final sweep: the hand-built landmarks (Popeyes, trailers, water towers,
  // sheds) are plain coloured boxes straight out of the builders. Everything
  // already upgraded carries a gtbRealized tag and is skipped, and shadow flags
  // are left exactly as each builder set them.
  initLightPool();
  // shafts, pools and halos under every lamp (and poles for the lot lights) —
  // before the sweep below, so the new poles get a proper steel surface
  for (const sp of litSpots) if (sp.fx !== false) lampFx.push(addLamp(scene, sp));

  setLoadStage("resurfacing the parish…", 84);
  await new Promise((r) => setTimeout(r, 0));   // let the loading text paint
  realize(scene, { shadows: false });
  wetRoads.collect(scene);

  // Merge everything that never moves, per material and 48 m chunk. Anything
  // that moves or animates is excluded by its top-level object.
  setLoadStage("batching the parish…", 92);
  await paint();
  // Anything that moves, or that a set piece shows and hides, must stay out of the
  // batcher. The world districts used to be in here too — every composer cluster of
  // West Parish, Lafourchette, north Tusouxroe and the state map — which left their
  // scenery drawing one mesh at a time (162 separate fence rails in one view of the
  // strip). batchStatic merges siblings into their own parent now, so a cluster still
  // hides itself with everything it owns, and it can be batched safely (TASK-011).
  // Anything that moves, or that a set piece shows and hides, stays out of the
  // batcher entirely.
  const moving = new Set([
    player, ...vehicles.map((v) => v.obj), ...enemies.map((e) => e.spr),
    ...buckets, ...waterPatches, ...shrooms, ...torches, ...peds,
    ...services.props, ...nightlife.props,      // garage doors, markers, club cutaways: they move
    ...casinos.props,                           // casino roof/sign cutaways, wall scale, the roulette table and the slots all animate in casinos.update()
    ...(orlea ? orlea.props : []),              // Marie Laveau's ghost, drifting the cemetery alleys
    ...klan.props,                              // the cross burns and goes out: it cannot be baked in
    ...(newton ? newton.props : []),            // he and his table are only there at dawn
    ...(missionClinic ? missionClinic.props : []),
    ...(prologue ? prologue.props : []),
    ...(blueLight ? blueLight.props : []),
    ...(nolantis ? nolantis.props : []),
    ...(welcomeBack ? welcomeBack.props : []),
    ...(alternate ? alternate.props : []),
    ...(greedoCampaign ? greedoCampaign.props : []),
    ...(syncCampaign ? syncCampaign.props : []),
    ...(westParish ? westParish.props : []),
    ...(eastBank ? eastBank.props : []),
    ...(tusouxroeNorth ? tusouxroeNorth.props : []),
    ...(stateWorld ? stateWorld.props : []),
  ]);
  // The districts' culling groups are boundaries, not exclusions: batch *inside* each
  // cluster, never across them. A cluster hides itself by going invisible, so a batch
  // lifted out of one into the scene root would keep drawing after the cluster hid —
  // which is exactly what has been happening since the `boundary` line was dropped.
  const cullGroups = new Set([
    ...(westParish ? westParish.props : []),
    ...(eastBank ? eastBank.props : []),
    ...(tusouxroeNorth ? tusouxroeNorth.props : []),
    ...(stateWorld ? stateWorld.props : []),
  ]);
  const batch = batchStatic(scene, {
    exclude: (root) => moving.has(root),
    boundary: (o) => cullGroups.has(o),
  });
  console.info(`[gfx] static batching: ${batch.meshes} meshes -> ${batch.meshes - batch.removed} (${batch.batches} batches)`);
  updateGfxLabel();

  camera.position.copy(playerPos.clone().add(CAM_OFFSET));
  camera.lookAt(playerPos);
  syncHUD();

  window.__game = { scene, camera, state, enemies, buckets, kills, vehicles, sheriffs,
    gfxStats: GFX.stats, MIST, wetRoads, headlights, npcs, camCtl, MAP,
    get traffic() { return traffic; },
    get policeHelicopters() { return police.helicopters; },
    get player() { return player; }, get prologue() { return prologue; }, get alternate() { return alternate; }, get greedoCampaign() { return greedoCampaign; }, get syncCampaign() { return syncCampaign; }, get safehouses() { return safehouses; }, mapEditor, get currentCharacter() { return getPlayerCharacter(state.selectedCharacter); }, get actOne() { return actOne; }, get orlea() { return orlea; }, get potholes() { return potholes; }, get blueLight() { return blueLight; }, get westParish() { return westParish; }, get eastBank() { return eastBank; }, get tusouxroeNorth() { return tusouxroeNorth; }, get stateWorld() { return stateWorld; },
    teleport: (x, z) => {                // QA: move the player on foot
      if (state.veh) { state.veh.speed = 0; state.veh = null; }
      playerPos.set(x, 0, z);
      player.position.set(x, 0, z);
      player.visible = true;
      if (player._last) player._last.copy(player.position);
    }, cine, blockers, blockerGrid, renderer, perf, input, spawnZones, klan, radio,
    get radioOff() { return radioOff; },
    get newton() { return newton; },
    // where the story says Mama's house is, so QA never hardcodes a town's
    // position again — districts.js moves it and this follows
    mamaDoor: NADIA_DOOR, mamaHouse: NADIA_HOME, orientDebug, minimap, hijacker, arsenal, services, nightlife, tips, loot, worldTime, weather, POPEYES_LOCATIONS, popeyesPlaced, killEnemy, spawnEnemy, factionWar, police, sheriffSees: () => sheriffSees(0.21), get nolantis() { return nolantis; }, get welcomeBack() { return welcomeBack; },
    get playerMoveHeading() { return playerMoveHeading; },
    get soundtrack() { return soundtrackReady; }, get casinos() { return casinos; } };
  // the radar's base map, from the level as built
  {
    const roads = [
      { points: [[ROAD_X, MAP.minZ], [ROAD_X, MAP.maxZ]], width: ROAD_HALF * 2 + 2, color: "#cfcab8" },   // US-167
      { points: [[mainStreetWest, -78], [ROAD_X, -78]], width: 9 },                                      // Main Street
      { points: [[31, -106], [122, -106]], width: 8 },                                                   // South Tusouxroe
      { points: [[ROAD_X + ROAD_HALF, 43], ...ROUTE_EAST, [CRASH.x, CRASH.z]], width: 5, color: "#8a7a5a" },   // the prologue's dirt road
    ];
    const areas = [], water = [], buildings = [];
    for (const [, side, z] of LANDMARKS) {
      const [bx] = landmarkPos(side, z);
      buildings.push({ x0: bx - 8, x1: bx + 8, z0: z - 8, z1: z + 8 });
    }
    for (const o of buildingOccluders) buildings.push({ x0: o.minX, x1: o.maxX, z0: o.minZ, z1: o.maxZ });
    for (const p of POPEYES_LOCATIONS) if (!p.lot) buildings.push({ x0: p.x - 6, x1: p.x + 6, z0: p.z - 7, z1: p.z + 7 });
    if (orlea) {
      const G = orlea.grid;
      areas.push({ x0: G.city.minX, x1: G.city.maxX, z0: G.city.minZ, z1: G.city.maxZ });
      water.push({ x0: -140, x1: ROAD_X - ROAD_HALF - 2, z0: G.causeway.minZ - 4, z1: G.causeway.maxZ + 4 });
      water.push({ x0: ROAD_X + ROAD_HALF + 2, x1: 140, z0: G.causeway.minZ - 4, z1: G.causeway.maxZ + 4 });
      for (const o of orlea.occluders) if (o.minY < 1) buildings.push({ x0: o.minX, x1: o.maxX, z0: o.minZ, z1: o.maxZ });
      for (const x of G.avenues) roads.push({ points: [[x, G.city.minZ], [x, G.city.maxZ]], width: G.width });
      for (const z of G.streets) roads.push({ points: [[G.city.minX, z], [G.city.maxX, z]], width: G.width });
    }
    if (westParish) {
      roads.push({ points: westParish.samples.map((p) => [p.x, p.z]), width: westParish.width, color: "#dcd7c4" });
      roads.push({ points: westParish.dirtSamples.map((p) => [p.x, p.z]), width: westParish.dirtWidth, color: "#8a7a5a" });
      for (const f of westParish.fields) areas.push({ ...f, color: "#4d4a26" });
      for (const w of westParish.water) water.push({ x0: w.x - w.w / 2, x1: w.x + w.w / 2, z0: w.z - w.d / 2, z1: w.z + w.d / 2 });
    }
    if (eastBank) {
      const m = eastBank.minimap;
      roads.push(...m.roads);
      areas.push(...m.areas);
      water.push(...m.water);
      buildings.push(...m.buildings);
    }
    if (tusouxroeNorth) { const m = tusouxroeNorth.minimap; roads.push(...m.roads); areas.push(...m.areas); buildings.push(...m.buildings); water.push(...(m.water||[])); }
    if (stateWorld) { const m = stateWorld.minimap; roads.push(...m.roads); areas.push(...m.areas); buildings.push(...m.buildings); water.push(...(m.water||[])); }
    minimap.build({ roads, areas, water, buildings });
  }
  setLoadStage("ready.", 100);
  finishLoading();
  startBtn.disabled = false;
  freeBtn.disabled = false;
  zombieBtn.disabled = false;
  // Gated the same as Story/Free Roam: applyTier() (called by the Options
  // graphics buttons) touches `composer`, which doesn't exist until the
  // top-level `await createComposer(...)` above resolves.
  for (const b of gfxChoices.querySelectorAll("[data-tier]")) b.disabled = false;
  const begin = () => {
    overlay.classList.add("hidden");
    crosshair.style.display = "none";
    state.running = true;
    clock.start();
  };
  beginGame = begin;
  startBtn.onclick = () => openCharacterSelect("story");
  freeBtn.onclick = () => { pendingLaunch = "free"; selectionIndex = characterIds.indexOf("keseme"); confirmCharacter(); };
  zombieBtn.onclick = () => { pendingLaunch = "zombie"; selectionIndex = characterIds.indexOf("keseme"); confirmCharacter(); };
}

// Loading screen: while boot() is loading assets, the menu (logo, Start/
// Options/Exit — all of #introPanel, hidden by default in index.html) stays
// off-screen entirely and this cycles mood art full-bleed instead, so there's
// nothing half-clickable to notice is disabled. The slideshow itself keeps
// alternating forever, through the ready state too — finishLoading() only
// reveals the menu and retires the numeric readout (#loadHud), since a
// percentage stuck at 100% means nothing once you're just looking at art.
let loadScreenTimer = null;
function startLoadScreen() {
  if (!loadScreen) return;
  const slides = loadScreen.querySelectorAll(".slide");
  if (!slides.length) return;
  let i = 0;
  slides[0].classList.add("on");
  loadScreenTimer = setInterval(() => {
    slides[i].classList.remove("on");
    i = (i + 1) % slides.length;
    slides[i].classList.add("on");
  }, 4200);
}
// Drives #loadHud's neon readout — text plus a segmented percentage bar,
// standing in for the plain "loading assets…" label the boot stages used to
// write straight to loadNote.
function setLoadStage(text, pct) {
  loadNote.textContent = text;
  if (loadPct) loadPct.textContent = Math.round(pct) + "%";
  if (loadBarFill) loadBarFill.style.width = Math.round(pct) + "%";
}
function finishLoading() {
  introPanel.hidden = false;
  if (loadHud) loadHud.hidden = true;
}
startLoadScreen();

startBtn.disabled = true;
freeBtn.disabled = true;
zombieBtn.disabled = true;
for (const b of gfxChoices.querySelectorAll("[data-tier]")) b.disabled = true;
tick();
boot().catch((err) => {
  console.error(err);
  loadNote.textContent = "load error: " + err.message;
  finishLoading();
});

let carHornAudioCtx = null;
function playCarHorn(volume = 0.5) {
  try {
    if (!carHornAudioCtx) {
      carHornAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (carHornAudioCtx.state === "suspended") {
      carHornAudioCtx.resume().catch(() => {});
    }
    const a = carHornAudioCtx;
    const t = a.currentTime;
    const gain = a.createGain();
    gain.gain.setValueAtTime(0.2 * volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

    const osc1 = a.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(440, t);

    const osc2 = a.createOscillator();
    osc2.type = "sawtooth";
    osc2.frequency.setValueAtTime(370, t);

    const filter = a.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1200, t);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(a.destination);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.38);
    osc2.stop(t + 0.38);
  } catch (err) {
    // audio context issue
  }
}

function honkHorn() {
  if (!state.veh) return;
  playCarHorn(0.5);

  const carPos = state.veh.obj.position;
  let solicitTarget = null;
  let minDist = Infinity;
  for (const e of enemies) {
    if (e.dead || e.type !== "prostitute") continue;
    if (e.state === "in_car" || e.state === "approaching_car") continue;
    const d = e.spr.position.distanceTo(carPos);
    if (d < 20 && d < minDist) {
      minDist = d;
      solicitTarget = e;
    }
  }

  if (solicitTarget) {
    solicitTarget.solicitVeh = state.veh;
    solicitTarget.state = "approaching_car";
    solicitTarget.solicitTimer = 15;
    flashObjective("HONK! Prostitute approaching your vehicle...");
  }
}

// LMB fires (edge-triggered through input.js).
// This was `onPress("fire", …)` — and there is no "fire" action. input.js
// dispatches "attack" on button 0 and has no "fire" in DEFAULT_BINDINGS, so the
// handler was registered against a name nothing ever raises and the player
// could not shoot or swing at all. Found while testing the cemetery's reaction
// to a gunshot (cemetery.js), which is how it finally showed up.
input.onPress("attack", () => { if (state.running) fire(); });
input.onPress("reload", () => { if (state.running) arsenal.reload(); });
input.onPress("radio", () => { if (state.running) toggleRadio(); });
input.onPress("holster", () => {
  if (!state.running || state.cinematic) return;
  state.holstered = !state.holstered;
  arsenal.render();
  flashObjective(state.holstered
    ? "Weapon away. Left click won't fire — X to draw."
    : `Drew the ${arsenal.stats(!!state.veh).name}. Hold right click to aim, left click to use it.`);
});
input.onPress("equipBat", () => { if (state.running) arsenal.give("bat"); });
input.onPress("nextWeapon", () => { if (state.running) arsenal.cycleWeapon(1); });
input.onPress("prevWeapon", () => { if (state.running) arsenal.cycleWeapon(-1); });
input.onPress("horn", () => { if (state.running) honkHorn(); });

window.addEventListener("keydown", (e) => {
  if (e.code === "Escape") {
    if (state.running && !state.cinematic && (!characterSelect || characterSelect.hidden)) {
      e.preventDefault();
      pauseMenu.toggle();
    }
  }
});

