// ---------------------------------------------------------------------------
// stateWorld.js — State-Wide World Expansion System (Dixie Beaux).
//
// Expands Grand Theft Bayou into a massive state-scale map (~5 km x 5 km)
// mirroring the multi-region variety of GTA San Andreas:
//
//   1. OrleaRouge & Lafourchette Metro (South / East): Urban city, riverfront, market.
//   2. Tusouxroe & North Commercial Corridor (North-Central): High-density avenues, tower, hospital.
//   3. West Parish & Bayou Noir (West): Pine ridges, sugarcane fields, church, shacks.
//   4. Port Calypso & Industrial Docks (Northeast): Shipping container yards, warehouses, docks, lighthouse.
//   5. Cypress Hills & Red Dust Badlands (Northwest): Canyon off-road dirt tracks, quarry, summit radio tower.
//   6. Lakeshore Causeway & Marsh Outskirts (Southwest): Bayou causeway loop, fishing piers, swamp camps.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { createComposer } from "./composer.js";
import { createTownKit } from "./townkit.js";
import { createLouisianaKit } from "./louisianakit.js";
import { buildOysterBay as buildOysterBayTown } from "./oysterbay.js";
import { buildPortCalypso as buildPortTown } from "./portcalypso.js";
import { buildLakeshore as buildLakeshoreTown } from "./lakeshore.js";
import { buildRedDust as buildRedDustTown } from "./reddust.js";
import { buildCorridors } from "./corridors.js";
import { buildWonders } from "./wonders.js";
import { inKeepout } from "./districts.js";
import { placeCityBuilding, makeDecorativeFence, placeOfficeClutter, placeStreetClutter, placeMaritimeCargo, placeOilDerrick, placeBillboard, placeBayouStiltHut, placeParkedCar, placeTruck, placeShopGLB, placeGasStation, placeSixTwelve, placeGunShop } from "./landmarks.js";

export const STATE_BOUNDS = { minX: -1200, maxX: 1200, minZ: -1200, maxZ: 1200 };

/**
 * Creates and orchestrates state-wide regional expansion districts.
 */
export function createStateWorld(ctx) {
  const { scene, surface, addBlocker, addLitSpot, flashObjective } = ctx;

  const occluders = [];
  const pois = [];
  const props = [];
  // Each region builds with its own composer; the culling pass has to drive all of
  // them (see update() below).
  const composers = [];
  ctx.props = props;
  const lanes = [];
  const regions = [];          // composed regions: { C, rect, zone, outside } — zoneAt asks their composers
  const minimapLayers = { roads: [], buildings: [], areas: [
    { x0: -1100, x1: -400, z0: -1050, z1: -420, color: "#6e3f28" }, // Red Dust Badlands
  ], water: [] };   // Port Calypso and Oyster Bay add their own areas and water (composer minimap)

  function addOccluder(x, z, w, d, h = 18) {
    occluders.push({
      minX: x - w / 2, maxX: x + w / 2,
      minY: 0, maxY: h,
      minZ: z - d / 2, maxZ: z + d / 2,
    });
  }

  const BANDS = [
    { x0: -350, x1: 350, z0: -1050, z1: -450 }, // North
    { x0: -350, x1: 350, z0: 400, z1: 1050 },   // South
    { x0: -1050, x1: -450, z0: -350, z1: 350 }, // West
    { x0: 400, x1: 1050, z0: -350, z1: 350 }    // East
  ];
  const ANNOUNCE = [
    { x0: 420, x1: 1040, z0: 540, z1: 880, text: "OYSTER BAY · pop. 3,208. The Shrimp Fest is in June. It is always June." },
    { x0: 420, x1: 1040, z0: -940, z1: -440, text: "PORT CALYPSO · The cranes never stop. Neither does the union." },
    { x0: -870, x1: -420, z0: -790, z1: -490, text: "RED DUST · pop. 190 and falling. The saloon's still open." },
    { x0: -1000, x1: -420, z0: 700, z1: 1000, text: "LAKESHORE · Bait, beer and airboats. Mind the gators." },
    { x0: 470, x1: 756, z0: -312, z1: -208, text: "BELLE PLANTATION · Tours on the hour. Ghost tours after dark." },
    { x0: 803, x1: 1048, z0: 96, z1: 208, text: "HOT BAYOU PEPPER WORKS · Free samples. Keep milk handy." },
    { x0: 803, x1: 1048, z0: -238, z1: -32, text: "PELICAN PETROCHEMICAL · River Road. Don't breathe deep." },
    { x0: 542, x1: 808, z0: 230, z1: 372, text: "BAYOU STATE PENITENTIARY · Visitors check in at the gate. The rodeo is Sundays." },
  ];

  // What a region builder needs from this module (oysterbay.js, ...): one shared kit,
  // and the places to report lanes, POIs, occluders and minimap shapes.
  let kit = null, la = null;
  const R = {
    ctx, composers, lanes, pois, addOccluder, regions,
    minimap: minimapLayers,
    get kit() { return kit || (kit = createTownKit(ctx)); },
    get la() { return la || (la = createLouisianaKit(R.kit, ctx)); },
  };

  // ================= 1. PORT CALYPSO (Northeast: x 400..1100, z -1000..-400) =================
  // Composed in portcalypso.js from the townkit (TASK-084).
  function buildPortCalypso() {
    const C = buildPortTown(R);
    regions.push({ C, rect: { x0: 380, x1: 1150, z0: -1150, z1: -380 }, zone: "industrial", outside: "industrial" });
  }

  // ================= 2. CYPRESS HILLS & RED DUST BADLANDS (Northwest: x -1100..-400, z -1000..-400) =================
  // Composed in reddust.js from the townkit (TASK-084).
  function buildCypressHills() {
    const C = buildRedDustTown(R);
    regions.push({ C, rect: { x0: -1150, x1: -380, z0: -1100, z1: -380 }, zone: "town", outside: "rural" });
  }

  // ================= 3. LAKESHORE MARSH & CAUSEWAY LOOP (Southwest: x -1100..-400, z 400..1100) =================
  // Composed in lakeshore.js from the townkit (TASK-084).
  function buildLakeshoreMarsh() {
    const C = buildLakeshoreTown(R);
    regions.push({ C, rect: { x0: -1150, x1: -380, z0: 380, z1: 1150 }, zone: "resort", outside: "forest" });
  }

  // ================= 4. OYSTER BAY (Southeast: x 400..1100, z 400..1100) =================
  // Composed in oysterbay.js from the townkit (TASK-084).
  function buildOysterBay() {
    const C = buildOysterBayTown(R);
    regions.push({ C, rect: { x0: 380, x1: 1150, z0: 380, z1: 1150 }, zone: "town", outside: "rural" });
  }

  // ================= 5. WILDERNESS BANDS (The empty cross connecting the corners) =================
  // Is this ground (± margin) held by a composed district — a road, a lot, a building?
  const held = (x, z, m) => {
    for (let dx = -m; dx <= m; dx += 2) for (let dz = -m; dz <= m; dz += 2) {
      for (const C of composers) if (C.occupiedAt(x + dx, z + dz)) return true;
    }
    return false;
  };

  function buildWildernessBands() {
    const pineTrunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 4, 5).rotateY(Math.PI/5);
    const pineLeavesGeo = new THREE.ConeGeometry(2.5, 10, 5).translate(0, 5, 0);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.95 });
    trunkMat.userData.gtbRealized = true;
    const leavesMat = new THREE.MeshStandardMaterial({ color: 0x1f3b1d, roughness: 0.9 });
    leavesMat.userData.gtbRealized = true;

    const bands = BANDS;

    minimapLayers.areas.push(
      { x0: -350, x1: 350, z0: -1050, z1: -450, color: "#22351a" },
      { x0: -350, x1: 350, z0: 400, z1: 1050, color: "#1b2914" },
      { x0: -1050, x1: -450, z0: -350, z1: 350, color: "#1c2612" },
      { x0: 400, x1: 1050, z0: -350, z1: 350, color: "#2a3622" }
    );

    const trees = [];
    for (const b of bands) {
      const area = (b.x1 - b.x0) * (b.z1 - b.z0);
      const numTrees = Math.floor(area / 600); // 1 per 600m2
      for (let i = 0; i < numTrees; i++) {
        const tx = b.x0 + Math.random() * (b.x1 - b.x0);
        const tz = b.z0 + Math.random() * (b.z1 - b.z0);
        if (Math.abs(tx) < 100 || Math.abs(tz) < 100) continue; // clear highways and city borders
        // These bands are scattered blind, one pine per ~600 m2 across a
        // 600 x 700 m rect, so they need telling where the built world is.
        // held() walks THIS file's composers; Chatboro and the Tusouxroe metro
        // are built by main.js from their own modules and are not among them,
        // so the north band would grow a forest through downtown, the bridges
        // and Mama's front yard. Both checks, or one of the two is unprotected.
        if (held(tx, tz, 1) || inKeepout(tx, tz, 8)) continue;
        trees.push([tx, tz, 0.8 + Math.random() * 0.8, Math.random() * 6]);
      }
      
      const numShacks = Math.floor(area / 120000); 
      for (let i = 0; i < numShacks; i++) {
        const sx = b.x0 + 50 + Math.random() * (b.x1 - b.x0 - 100);
        const sz = b.z0 + 50 + Math.random() * (b.z1 - b.z0 - 100);
        if (Math.abs(sx) < 100 || Math.abs(sz) < 100) continue;
        // a hut drags a 60 m pond in with it, so it needs the widest berth
        if (held(sx, sz, 9) || inKeepout(sx, sz, 40)) continue;
        placeBayouStiltHut(ctx, sx, sz, Math.random() * Math.PI);
        pois.push({ x: sx, z: sz, r: 15, label: "Abandoned Bayou Shack" });
        
        const water = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshPhysicalMaterial({ color: 0x0a1a22, roughness: 0.12, clearcoat: 1 }));
        water.rotation.x = -Math.PI / 2;
        water.position.set(sx, 0.05, sz);
        scene.add(water);
        props.push(water);
      }
    }

    if (trees.length > 0) {
      const CHUNK_SIZE = 200;
      const chunks = new Map();
      for (const [x, z, h, r] of trees) {
        const key = Math.floor(x / CHUNK_SIZE) + "," + Math.floor(z / CHUNK_SIZE);
        if (!chunks.has(key)) chunks.set(key, []);
        chunks.get(key).push([x, z, h, r]);
        if (addBlocker) addBlocker(x, z, 0.6 * h);
      }

      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
      for (const list of chunks.values()) {
        const trunks = new THREE.InstancedMesh(pineTrunkGeo, trunkMat, list.length);
        const leaves = new THREE.InstancedMesh(pineLeavesGeo, leavesMat, list.length);
        list.forEach(([x, z, h, ry], i) => {
          q.setFromAxisAngle(up, ry);
          s.set(h, h, h);
          trunks.setMatrixAt(i, m.compose(v.set(x, 2 * h, z), q, s));
          leaves.setMatrixAt(i, m.compose(v.set(x, 4 * h, z), q, s));
        });
        
        for (const im of [trunks, leaves]) {
          im.castShadow = true;
          im.receiveShadow = true;
          im.computeBoundingSphere();
          scene.add(im);
          props.push(im);
        }
      }
    }
  }

  function buildSet() {
    buildPortCalypso();
    buildCypressHills();
    buildLakeshoreMarsh();
    buildOysterBay();
    buildCorridors(R);                 // US-167 beyond the core, and the four connector highways
    buildWonders(R);                   // Belle Plantation, the Pepper Works, the refinery and the penitentiary, off Delta Road
    buildWildernessBands();
  }

  return {
    bounds: STATE_BOUNDS,
    occluders,
    pois,
    props,

    /**
     * Distance culling for all four regions, as East Bank and West Parish already
     * had it. Without this nothing ever hid these clusters: 3,700 meshes drew from
     * anywhere on the map, at every camera, forever.
     */
    update(dt, playerPos) {
      const eye = ctx.camera ? ctx.camera.position : playerPos;
      for (const C of composers) C.update(dt, eye);
      // each town introduces itself once, the way Lafourchette does
      for (const a of ANNOUNCE) {
        if (a.done || playerPos.x < a.x0 || playerPos.x > a.x1 || playerPos.z < a.z0 || playerPos.z > a.z1) continue;
        a.done = true;
        if (ctx.flashObjective) ctx.flashObjective(a.text);
      }
    },

    lanes,
    /** True when a composed district holds this ground (± margin): a road, lot, building, water. */
    heldAt: (x, z, m = 1) => held(x, z, m),
    minimap: minimapLayers,
    zoneAt(x, z) {
      // a composed region knows its own roads, buildings, water and open areas
      for (const { C, rect, zone, outside, wildAs } of regions) {
        if (x < rect.x0 || x >= rect.x1 || z < rect.z0 || z >= rect.z1) continue;
        const v = C.zoneAt(x, z);
        if (v === "forest") return wildAs || v;
        if (v === "highway" || v === "water" || v === "building") return v;
        return v && v !== "town" ? v : (v === "town" ? zone : outside || zone);
      }
      // the wilderness bands are pine forest (buildWildernessBands scatters them clear of the
      // highways and city borders): hog country. Without this the northern bands fell through to
      // spawnzones' default and read as "town" — hoodrats in the woods, no hogs.
      for (const b of BANDS) {
        if (x >= b.x0 && x < b.x1 && z >= b.z0 && z < b.z1 && Math.abs(x) >= 100 && Math.abs(z) >= 100) return "forest";
      }
      if (x > 380 && z < -380) return "industrial";  // Port Calypso Docks
      if (x < -380 && z < -380) return "industrial"; // Cypress Hills Badlands (Quarry)
      if (x < -380 && z > 380) return "resort";      // Lakeshore Marsh (Stilts / tourists)
      if (x > 380 && z > 380) return "town";         // Oyster Bay
      return null;
    },
    buildSet,
  };
}
