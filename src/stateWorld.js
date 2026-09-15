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
import { placeCityBuilding, makeDecorativeFence, placeOfficeClutter, placeStreetClutter, placeMaritimeCargo, placeOilDerrick, placeBillboard, placeBayouStiltHut } from "./landmarks.js";

export const STATE_BOUNDS = { minX: -1200, maxX: 1200, minZ: -1200, maxZ: 1200 };

/**
 * Creates and orchestrates state-wide regional expansion districts.
 */
export function createStateWorld(ctx) {
  const { scene, surface, roadMaterial, addBlocker, addLitSpot, flashObjective } = ctx;

  const occluders = [];
  const pois = [];
  const props = [];
  const lanes = [];
  const minimapLayers = { roads: [], buildings: [], areas: [], water: [] };

  function addOccluder(x, z, w, d, h = 18) {
    occluders.push({
      minX: x - w / 2, maxX: x + w / 2,
      minY: 0, maxY: h,
      minZ: z - d / 2, maxZ: z + d / 2,
    });
  }

  // ================= 1. PORT CALYPSO & DOCKS (Northeast: x 400..1100, z -1000..-400) =================
  function buildPortCalypso() {
    const C = createComposer(ctx, {
      name: "PortCalypso",
      bounds: { x0: 380, x1: 1150, z0: -1100, z1: -380 },
      zones: { core: { x0: 420, x1: 1100, z0: -1050, z1: -420 } },
      seed: 88412,
    });

    const ROAD_Y = 0.02;
    const roadMat = typeof roadMaterial === "function" ? roadMaterial() : new THREE.MeshStandardMaterial({ color: 0x333538 });

    // Main Harbor Expressway & Dockside Road
    // (composer.road takes the points array directly; an options object builds nothing)
    C.road("Port Highway", [[400, -600], [1050, -600]], { width: 12 });
    C.road("Dockside Drive", [[750, -1000], [750, -420]], { width: 10 });

    const portHwy = new THREE.Mesh(new THREE.PlaneGeometry(650, 12), roadMat);
    portHwy.rotation.x = -Math.PI / 2;
    portHwy.position.set(725, ROAD_Y, -600);
    portHwy.receiveShadow = true;
    scene.add(portHwy);

    const dockDr = new THREE.Mesh(new THREE.PlaneGeometry(10, 580), roadMat);
    dockDr.rotation.x = -Math.PI / 2;
    dockDr.position.set(750, ROAD_Y + 0.001, -710);
    dockDr.receiveShadow = true;
    scene.add(dockDr);

    // Warehouse & Container Yard Buildings
    // 1. Cargo Warehouse Alpha
    placeCityBuilding(ctx, "garage", 620, -720, 0);
    addOccluder(620, -720, 18, 16, 8);
    pois.push({ x: 620, z: -720, r: 14, label: "Calypso Cargo Alpha" });

    // 2. Shipping Terminal Offices
    placeCityBuilding(ctx, "offices", 880, -720, Math.PI / 2);
    addOccluder(880, -720, 22, 18, 20);
    placeOfficeClutter(ctx, 880, -710, 0);
    pois.push({ x: 880, z: -720, r: 12, label: "Port Terminal HQ" });

    // 3. Port Calypso Supermarket / Supply Depot
    placeCityBuilding(ctx, "market", 620, -480, Math.PI);
    addOccluder(620, -480, 20, 16, 8);
    pois.push({ x: 620, z: -480, r: 10, label: "Dockside Supply Co." });

    // 4. Harbor Fire Station
    placeCityBuilding(ctx, "fire_station", 880, -480, -Math.PI / 2);
    addOccluder(880, -480, 18, 15, 10);
    makeDecorativeFence(ctx, 860, -495, 900, -495);
    pois.push({ x: 880, z: -480, r: 10, label: "Port Fire Station" });

    // Shipping Container Stacks & Docks
      // Large maritime cargo stacks
      placeMaritimeCargo(ctx, 520, -850, 0);
      placeMaritimeCargo(ctx, 640, -880, Math.PI / 4);
      placeMaritimeCargo(ctx, 820, -850, -Math.PI / 6);
      placeMaritimeCargo(ctx, 940, -880, 0);

      // Highway Billboards & Port Clutter
      placeBillboard(ctx, 500, -580, Math.PI / 2, "PORT CALYPSO TERMINAL");
      placeBillboard(ctx, 900, -580, -Math.PI / 2, "EXPRESS FREIGHT WAY");

      placeStreetClutter(ctx, 620, -700, 0);
      placeStreetClutter(ctx, 880, -700, Math.PI);
      placeStreetClutter(ctx, 750, -620, Math.PI / 2);

    // Harbor Lighting & Streetlamps
    for (let x = 450; x <= 1000; x += 40) {
      addLitSpot({ x, y: 5.5, z: -588, warm: 0xffe0b0, power: 110, range: 28, pole: true });
    }

    C.landmark("Port Calypso Lighthouse", () => {
      // Coastal Lighthouse Landmark
      const lightHouseMat = new THREE.MeshStandardMaterial({ color: 0xdedac9, roughness: 0.4 });
      lightHouseMat.userData.gtbRealized = true;

      const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 4.2, 28, 12), lightHouseMat);
      tower.position.set(1020, 14, -980);
      tower.castShadow = tower.receiveShadow = true;
      scene.add(tower);

      const beaconMesh = new THREE.Mesh(new THREE.SphereGeometry(1.8, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffffaa }));
      beaconMesh.position.set(1020, 28.5, -980);
      scene.add(beaconMesh);

      addLitSpot({ x: 1020, y: 28, z: -980, warm: 0xffffaa, power: 300, range: 60 });
      if (addBlocker) addBlocker(1020, -980, 4.5);
      addOccluder(1020, -980, 9, 9, 30);
      pois.push({ x: 1020, z: -980, r: 16, label: "Calypso Lighthouse" });
    });

    lanes.push(
      { name: "port-hwy-east", points: [[400, -596], [1050, -596]], cruise: [14, 22] },
      { name: "port-hwy-west", points: [[1050, -604], [400, -604]], cruise: [14, 22] },
      { name: "dockside-north", points: [[754, -420], [754, -1000]], cruise: [12, 18] },
      { name: "dockside-south", points: [[746, -1000], [746, -420]], cruise: [12, 18] }
    );

    minimapLayers.roads.push(
      { points: [[400, -600], [1050, -600]], width: 12, color: "#cfcab8" },
      { points: [[750, -1000], [750, -420]], width: 10, color: "#cfcab8" }
    );
    minimapLayers.buildings.push(
      { x0: 611, x1: 629, z0: -728, z1: -712 },
      { x0: 869, x1: 891, z0: -729, z1: -711 },
      { x0: 610, x1: 630, z0: -488, z1: -472 },
      { x0: 871, x1: 889, z0: -487, z1: -473 },
      { x0: 1014, x1: 1026, z0: -986, z1: -974 }
    );
  }

  // ================= 2. CYPRESS HILLS & RED DUST BADLANDS (Northwest: x -1100..-400, z -1000..-400) =================
  function buildCypressHills() {
    const C = createComposer(ctx, {
      name: "CypressHills",
      bounds: { x0: -1150, x1: -380, z0: -1100, z1: -380 },
      zones: { wild: { x0: -1100, x1: -400, z0: -1050, z1: -420 } },
      seed: 55193,
    });

    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.95 });
    dirtMat.userData.gtbRealized = true;

    // Off-Road Canyon Circuit (axis-aligned legs — the composer rejects diagonals)
    C.road("Red Dust Pass", [[-400, -600], [-1050, -600], [-1050, -850]], { width: 9 });

    const canyonTrail = new THREE.Mesh(new THREE.PlaneGeometry(720, 10), dirtMat);
    canyonTrail.rotation.x = -Math.PI / 2;
    canyonTrail.rotation.z = -0.32;
    canyonTrail.position.set(-725, 0.02, -725);
    canyonTrail.receiveShadow = true;
    scene.add(canyonTrail);

    // Hilltop Cabins & Quarry Outpost
      placeCityBuilding(ctx, "cottage", -750, -850, 0.4);
      addOccluder(-750, -850, 12, 10, 6);
      pois.push({ x: -750, z: -850, r: 8, label: "Red Dust Ridge Cabin" });

      placeCityBuilding(ctx, "garage", -920, -650, -0.5);
      addOccluder(-920, -650, 16, 14, 7);
      pois.push({ x: -920, z: -650, r: 9, label: "Cypress Quarry Works" });

      // Industrial Oil Derricks / Pumpjacks in Badlands Quarry
      placeOilDerrick(ctx, -850, -780, 0.3);
      placeOilDerrick(ctx, -650, -720, -0.4);

      // Warning Billboards & Clutter
      placeBillboard(ctx, -550, -620, -0.3, "DANGER: QUARRY AREA");
      placeStreetClutter(ctx, -920, -630, 0);

    // Dense Pine Ridges
      const pineGeo = new THREE.ConeGeometry(2.5, 8.5, 5);
      const pineMat = new THREE.MeshStandardMaterial({ color: 0x1f3b1d, roughness: 0.9 });
      pineMat.userData.gtbRealized = true;

      for (let i = 0; i < 110; i++) {
        const tx = -1100 + Math.random() * 650;
        const tz = -1050 + Math.random() * 600;
        if (Math.abs((tx + 725) * 0.3 + (tz + 725)) < 25) continue; // clear trail

        const tree = new THREE.Mesh(pineGeo, pineMat);
        tree.position.set(tx, 4.25, tz);
        tree.castShadow = true;
        scene.add(tree);
        if (addBlocker) addBlocker(tx, tz, 1.4);
      }

    C.landmark("Summit Radio Tower", () => {
      const towerMat = new THREE.MeshStandardMaterial({ color: 0xd6402a, metalness: 0.8, roughness: 0.3 });
      towerMat.userData.gtbRealized = true;

      const radioTower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 3.5, 45, 4), towerMat);
      radioTower.position.set(-1020, 22.5, -950);
      radioTower.castShadow = true;
      scene.add(radioTower);

      addLitSpot({ x: -1020, y: 44, z: -950, warm: 0xff1122, power: 250, range: 50 });
      if (addBlocker) addBlocker(-1020, -950, 4.0);
      addOccluder(-1020, -950, 8, 8, 45);
      pois.push({ x: -1020, z: -950, r: 15, label: "Cypress Summit Radio" });
    });

    lanes.push(
      { name: "red-dust-west", points: [[-400, -600], [-1050, -850]], cruise: [10, 16] },
      { name: "red-dust-east", points: [[-1050, -850], [-400, -600]], cruise: [10, 16] }
    );

    minimapLayers.roads.push(
      { points: [[-400, -600], [-1050, -850]], width: 9, color: "#8a5a3a" }
    );
    minimapLayers.buildings.push(
      { x0: -756, x1: -744, z0: -855, z1: -845 },
      { x0: -928, x1: -912, z0: -657, z1: -643 },
      { x0: -1024, x1: -1016, z0: -954, z1: -946 }
    );
  }

  // ================= 3. LAKESHORE MARSH & CAUSEWAY LOOP (Southwest: x -1100..-400, z 400..1100) =================
  function buildLakeshoreMarsh() {
    const C = createComposer(ctx, {
      name: "LakeshoreMarsh",
      bounds: { x0: -1150, x1: -380, z0: 380, z1: 1150 },
      zones: { wild: { x0: -1100, x1: -400, z0: 420, z1: 1100 } },
      seed: 44102,
    });

    const roadMat = typeof roadMaterial === "function" ? roadMaterial() : new THREE.MeshStandardMaterial({ color: 0x3a3a40 });

    // Causeway Loop Expressway
    C.road("Lakeshore Causeway", [[-400, 750], [-1050, 750]], { width: 12 });

    const causewayMesh = new THREE.Mesh(new THREE.PlaneGeometry(650, 12), roadMat);
    causewayMesh.rotation.x = -Math.PI / 2;
    causewayMesh.position.set(-725, 0.02, 750);
    causewayMesh.receiveShadow = true;
    scene.add(causewayMesh);

    // Fishing Outpost & Airboat Camp
      placeCityBuilding(ctx, "cottage", -680, 820, 0);
      addOccluder(-680, 820, 12, 10, 6);
      pois.push({ x: -680, z: 820, r: 8, label: "Captain Thibodeaux Shacks" });

      placeCityBuilding(ctx, "cafe", -920, 820, Math.PI / 2);
      addOccluder(-920, 820, 14, 12, 7);
      pois.push({ x: -920, z: 820, r: 8, label: "Alligator Bait Diner" });

      // Bayou Stilt Huts & Boardwalk Outposts
      placeBayouStiltHut(ctx, -550, 880, Math.PI / 6);
      placeBayouStiltHut(ctx, -800, 920, -Math.PI / 4);

      // Causeway Advertisements & Fishing Clutter
      placeBillboard(ctx, -600, 730, Math.PI / 2, "MARSH AIRBOAT TOURS");
      placeStreetClutter(ctx, -920, 800, 0);

    // Causeway Lighting
    for (let x = -450; x >= -1000; x -= 40) {
      addLitSpot({ x, y: 5.5, z: 756, warm: 0xffd9a0, power: 100, range: 26, pole: true });
    }

    lanes.push(
      { name: "causeway-west", points: [[-400, 746], [-1050, 746]], cruise: [14, 22] },
      { name: "causeway-east", points: [[-1050, 754], [-400, 754]], cruise: [14, 22] }
    );

    minimapLayers.roads.push(
      { points: [[-400, 750], [-1050, 750]], width: 12, color: "#cfcab8" }
    );
    minimapLayers.buildings.push(
      { x0: -686, x1: -674, z0: 815, z1: 825 },
      { x0: -927, x1: -913, z0: 814, z1: 826 }
    );
  }

  function buildSet() {
    buildPortCalypso();
    buildCypressHills();
    buildLakeshoreMarsh();
  }

  return {
    bounds: STATE_BOUNDS,
    occluders,
    pois,
    props,
    lanes,
    minimap: minimapLayers,
    zoneAt(x, z) {
      if (x > 380 && z < -380) return "commercial";  // Port Calypso Docks
      if (x < -380 && z < -380) return "rural";       // Cypress Hills Badlands
      if (x < -380 && z > 380) return "rural";        // Lakeshore Marsh
      return null;
    },
    buildSet,
  };
}
