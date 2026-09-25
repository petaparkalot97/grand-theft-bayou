// ---------------------------------------------------------------------------
// chatboro.js — CHATBORO, the village in the middle of northern Bayou Dixie.
//
// Chatham, Louisiana: a few hundred people, a church, a water tower, and a
// highway. What makes a place like that a place at all is the road through it,
// so this village is built on the one thing it has — the crossroads where
// US-167 running north crosses the Port Highway running east.
//
// That junction is not decoration. It is the only way north on the map: US-167
// comes up from OrleaRouge, the Port Highway goes east to Tusouxroe and the
// docks, and they meet here. You cannot get to Mama's door without driving
// through Chatboro, which is exactly the relationship Chatham has with Monroe.
//
//   THE CROSSROADS   the gas station on the corner, and the highway frontage:
//                    the diner, the market, the things you pull in off a state
//                    road for
//   CHATBORO MAIN    the village's own street, one block west of the highway.
//                    Cottages, a market, a garage — where people actually live
//   CHURCH STREET    houses, and First Baptist closing its west end
//   PINE STREET      houses, and the trailer park behind them
//   EAST OF THE ROAD no street at all: the water tower and a fenced pasture
//
// Laid out by composer.js in its six stages, in TOWN-LOCAL coordinates measured
// from DISTRICTS.chatboro — local (0, 0) IS the crossroads. See the rules at the
// top of districts.js.
//
// WHAT IS NOT HERE: the prologue. Keseme's opening — the hog chase, the Green
// Bravado, the ledger board — is still on the US-167 strip at OrleaRouge's north
// edge, where it has always been, because that set is built inline across
// main.js, prologue.js, safehouses.js and welcomeback.js rather than in a module
// of its own. Moving it is its own job and its own risk; nothing here depends on
// it, and nothing here breaks it.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { createComposer } from "./composer.js";
import { DISTRICTS } from "./districts.js";
import { makeChurch } from "./church.js";
import { placeCityBuilding, placeParkedCar, placeTruck, placeGasStation, placeBillboard, makeDecorativeFence, placeStreetClutter } from "./landmarks.js";

const TOWN = DISTRICTS.chatboro;
const wx = (x) => TOWN.x + x;
const wz = (z) => TOWN.z + z;
const wr = (r) => ({ x0: wx(r.x0), x1: wx(r.x1), z0: wz(r.z0), z1: wz(r.z1) });
const wp = (pts) => pts.map(([x, z]) => [wx(x), wz(z)]);

// ---- the plot ----
// Long along the highway and narrow across it, the way a highway village grows.
// 144 x 220 m: about half again the ground the old Chatboro end of the strip
// covered (~19,500 m2), and a fifth of the Tusouxroe metro (169,120 m2), which is
// the right ratio between a village and a city.
const BOUNDS = { x0: -96, x1: 48, z0: -120, z1: 100 };
const CORE = { x0: -90, x1: 42, z0: -114, z1: 94 };

// ---- the street plan ----
// US-167 and the Port Highway are laid by stateWorld.js as one plane each,
// running the length and breadth of the map. Chatboro marks their corridors on
// its own grid so nothing is built or planted on them, but it does NOT pave them
// again — `paved: false` is exactly that. The one exception is the Port
// Highway's western arm: stateWorld starts that road at x -6, which is the
// crossroads itself, so everything west of here is Chatboro's to surface.
// There is no street east of the highway. The first cut of this village had one
// — Mill Road — and it cost more than it gave: the east side is only forty
// metres deep, so Mill Road, the highway's own frontage and the three open areas
// were all fighting for the same strip, and two thirds of every frontage slot in
// the village was rejected for landing on something. Fourteen buildings came out
// of a plan for forty.
//
// A village of four thousand has ONE built-up side of the highway and fields on
// the other, which is both true of Chatham and what fits: the west side carries
// the streets, and the east side carries the gas station, the water tower and a
// pasture.
const MAIN_X = -44;           // Chatboro Main, one block west of the highway
const CHURCH_Z = -56;
const PINE_Z = 52;

const STREETS = [
  { name: "Chatboro Main", points: [[MAIN_X, -110], [MAIN_X, 90]], width: 9, lampEvery: 36 },
  { name: "Church Street", points: [[-84, CHURCH_Z], [30, CHURCH_Z]], width: 8, lampEvery: 34 },
  { name: "Pine Street", points: [[-84, PINE_Z], [30, PINE_Z]], width: 8, lampEvery: 34 },
];

export function createChatboro(ctx) {
  const { scene } = ctx;
  const C = createComposer(ctx, {
    name: "Chatboro",
    bounds: wr(BOUNDS),
    zones: { core: wr(CORE), wild: wr(BOUNDS) },
    seed: 40831,
  });
  let announced = false;

  const std = (hex, rough, label, extra = {}) =>
    new THREE.MeshStandardMaterial({ color: hex, roughness: rough, name: label, ...extra });

  function box(w, h, d, mat, x, y, z, ry = 0, parent = scene) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  /** World position of a point in a building's local frame (front = local +z). */
  const local = (slot, lx, lz) => [
    slot.x + Math.cos(slot.rot) * lx + Math.sin(slot.rot) * lz,
    slot.z - Math.sin(slot.rot) * lx + Math.cos(slot.rot) * lz,
  ];

  // -------------------------------------------------------------------------
  // The houses. A village is mostly houses, and Lafourchette's shotgun house
  // (eastbank.js) is a city form — narrow, deep, built to a city lot. Up here
  // the lots are wide and cheap, so the house is a wide single-storey with a
  // hip roof and a porch across the front, which is what Jackson Parish
  // actually looks like.
  // -------------------------------------------------------------------------
  const SIDING = [0xe4d9c0, 0xb9c9b0, 0xd9c0b4, 0xc7d2dd, 0xefe8d8, 0xcfa88e, 0xaebd96];
  const sidingMats = SIDING.map((c) => std(c, 0.86, "painted wood siding"));
  const trim = std(0xf4f1e8, 0.8, "painted trim");
  const tin = std(0x585e64, 0.55, "tin roof", { metalness: 0.45 });
  const doorWood = std(0x5a3a28, 0.72, "wood door");
  const litWindow = new THREE.MeshStandardMaterial({
    color: 0x2a2418, emissive: 0xffc070, emissiveIntensity: 0.7, roughness: 0.4, name: "lit window",
  });
  litWindow.userData.gtbRealized = true;

  function villageHouse(slot) {
    const g = new THREE.Group();
    g.position.set(slot.x, 0, slot.z);
    g.rotation.y = slot.rot;
    const wall = sidingMats[(slot.index * 3 + Math.round(slot.s)) % sidingMats.length];
    box(9.4, 3.1, 7.2, wall, 0, 1.75, -0.6, 0, g);                   // the house, up on low piers
    // a hip roof: four slabs leaning in
    for (const [sx, sz, rz, rx] of [[-1, 0, 0.5, 0], [1, 0, -0.5, 0], [0, -1, 0, -0.5], [0, 1, 0, 0.5]]) {
      const r = box(sx ? 5.6 : 10, 0.16, sz ? 4.6 : 7.8, tin, sx * 2.5, 4.0, -0.6 + sz * 1.9, 0, g);
      r.rotation.z = rz; r.rotation.x = rx;
    }
    box(9.8, 0.24, 2.4, trim, 0, 0.6, 4.2, 0, g);                    // porch deck
    box(10.2, 0.14, 2.7, tin, 0, 3.15, 4.2, 0, g);                   // porch roof
    for (const px of [-4.4, -1.5, 1.5, 4.4]) box(0.16, 2.6, 0.16, trim, px, 1.85, 5.3, 0, g);
    box(1.1, 2.1, 0.08, doorWood, 0, 1.75, 3.06, 0, g);
    for (const px of [-3, 3]) box(1.4, 1.3, 0.08, (slot.index + px) % 3 ? trim : litWindow, px, 2.2, 3.06, 0, g);
    box(1.6, 0.3, 0.9, trim, 0, 0.26, 5.6, 0, g);                    // the step down to the yard
    scene.add(g);
    for (const [lx, lz] of [[-2.6, -0.6], [2.6, -0.6]]) ctx.addBlocker(...local(slot, lx, lz), 3.1);
    return true;
  }

  // Main Street is not all houses: a village street has a market, a bar and a
  // laundromat in among them.
  const MAIN_MIX = ["house", "house", "market", "house", "cafe", "house", "house", "garage", "house", "house", "cottage"];
  function mainStreet(slot) {
    const pick = MAIN_MIX[slot.index % MAIN_MIX.length];
    if (pick === "house") return villageHouse(slot);
    placeCityBuilding(ctx, pick, slot.x, slot.z, slot.rot);
    return true;
  }
  function houses(slot) { return villageHouse(slot); }

  // The highway frontage is what a driver sees: the things that exist to be
  // pulled into off a state road.
  const HIGHWAY_MIX = ["cafe", "market", "cottage", "garage", "cafe"];
  function highwayStop(slot) {
    placeCityBuilding(ctx, HIGHWAY_MIX[slot.index % HIGHWAY_MIX.length], slot.x, slot.z, slot.rot);
    return true;
  }

  const lanes = [
    { name: "Chatboro Main northbound", points: wp([[MAIN_X - 2.2, 86], [MAIN_X - 2.2, -106]]), cruise: [7, 11] },
    { name: "Chatboro Main southbound", points: wp([[MAIN_X + 2.2, -106], [MAIN_X + 2.2, 86]]), cruise: [7, 11] },
    { name: "Church St eastbound", points: wp([[-64, CHURCH_Z + 2.2], [36, CHURCH_Z + 2.2]]), cruise: [7, 10] },
    { name: "Pine St westbound", points: wp([[36, PINE_Z - 2.2], [-64, PINE_Z - 2.2]]), cruise: [7, 10] },
  ];

  function buildSet() {
    // ---- 1 road: the crossroads, the village streets, and the plan --------
    // Both highways are already surfaced by stateWorld.js, so these two calls
    // only claim the ground. Paving them again would put a second plane a
    // millimetre above the first for 220 m.
    C.road("US-167", wp([[0, -118], [0, 98]]), { width: 12, paved: false, lampEvery: 44, sidewalk: 0 });
    C.road("Port Highway", wp([[0, 0], [46, 0]]), { width: 12, paved: false, sidewalk: 0 });
    // ...except its western arm, which stateWorld starts at the crossroads and
    // never lays. West of here the road is Chatboro's.
    C.road("Port Highway West", wp([[-94, 0], [0, 0]]), { width: 12, lampEvery: 40, y: 0.023 });
    for (const st of STREETS) {
      C.road(st.name, wp(st.points), { width: st.width, lampEvery: st.lampEvery || 0, y: 0.021 });
    }

    // Everything below is set clear of the corridors above, which are already on
    // the grid — composer.report().siteOverlaps stays 0 or one of these is wrong.
    // West of Chatboro Main's own frontage band (x -61..-51), so the street can
    // still be built up along its whole length.
    C.site("church", wr({ x0: -92, x1: -66, z0: -36, z1: -10 }));
    C.site("school", wr({ x0: -92, x1: -68, z0: -104, z1: -78 }));
    C.site("trailer park", wr({ x0: -92, x1: -68, z0: 16, z1: 44 }));
    // East of the highway: no street, so these get the room they need.
    C.site("water tower", wr({ x0: 26, x1: 44, z0: 8, z1: 30 }));
    C.site("pasture", wr({ x0: 24, x1: 46, z0: -104, z1: -64 }));
    C.site("crossroads lot", wr({ x0: 10, x1: 28, z0: -28, z1: -12 }));

    // ---- 2 buildings: the highway frontage, what a driver sees -----------
    // spacing 22 off startAt 26 puts the slots at z -81, -59, -37, -15, 7, 29 and
    // 51. Three of those (-59, 7, 51) sit on Church Street, the Port Highway and
    // Pine Street and are rejected on both sides — that is the junction working,
    // not a mistake: you do not build a shop across a crossroads.
    C.frontage("US-167", {
      setback: 16, spacing: 22, footprint: { w: 15, d: 14 }, startAt: 26, endAt: 20,
      label: "US-167 frontage", build: highwayStop,
    });

    // ---- 3 side streets: the village itself ------------------------------
    const blk = { stage: "sideStreets" };
    // The village house is 9.4 x 7.2, so a 13 x 12 footprint on 16 m centres was
    // reserving half again the ground each one needs and losing the difference to
    // every intersection. 11 x 10 on 13 m centres is a village lot.
    C.frontage("Chatboro Main", { ...blk, setback: 12, spacing: 13, footprint: { w: 11, d: 10 }, startAt: 8, endAt: 8, label: "Chatboro Main", build: mainStreet });
    C.frontage("Church Street", { ...blk, setback: 12.5, spacing: 13, footprint: { w: 11, d: 10 }, startAt: 10, endAt: 8, label: "Church Street", build: houses });
    C.frontage("Pine Street", { ...blk, setback: 12.5, spacing: 13, footprint: { w: 11, d: 10 }, startAt: 10, endAt: 8, label: "Pine Street", build: houses });

    // ---- 4 open areas ----------------------------------------------------
    C.openArea("water tower", { color: "#4f5a3e", build: (r, c) => {
      const dirt = ctx.surface("dirt", 512).material(1);
      C.plane(c.w, c.d, C.tiled(dirt, c.w, c.d, 7), c.x, 0.021, c.z);
      // The village's own tower. The one on the OrleaRouge strip still reads
      // CHATBORO because the prologue's establishing card does, and the two will
      // agree again when that opening moves up here.
      if (ctx.makeWaterTower) ctx.makeWaterTower(c.x, c.z, "CHATBORO", ["POP. 4,083", "FAITH — FAMILY — FREEDOM"], "TERMS AND CONDITIONS APPLY");
      makeDecorativeFence(ctx, r.x0 + 1, r.z1 - 1, r.x1 - 1, r.z1 - 1);
      ctx.addLitSpot({ x: c.x, y: 7, z: c.z + 6, warm: 0xffc48a, power: 110, range: 24, pole: true });
    } });

    C.openArea("trailer park", { color: "#5a5344", zoneName: "residential", build: (r, c) => {
      const gravel = ctx.surface("dirt", 512).material(1, { color: 0x9a9184 });
      C.plane(c.w, c.d, C.tiled(gravel, c.w, c.d, 6), c.x, 0.022, c.z);
      // four singlewides on the pad, two rows, facing the track between them
      const skirt = std(0x8d8578, 0.9, "trailer skirt");
      const shell = [0xd8d2c4, 0xc3cdd4, 0xd9c8b0, 0xcfd6c2].map((h) => std(h, 0.62, "trailer shell", { metalness: 0.25 }));
      let i = 0;
      for (const tz of [r.z0 + 7, r.z0 + 21]) {
        for (const tx of [r.x0 + 7, r.x0 + 17]) {
          box(8.4, 0.5, 3.4, skirt, tx, 0.25, tz);
          box(8.6, 2.5, 3.6, shell[i % shell.length], tx, 1.75, tz);
          box(9, 0.14, 4, tin, tx, 3.05, tz);
          box(1.8, 0.18, 1.1, trim, tx + 2.6, 0.62, tz + 2.2);        // the steps
          ctx.addBlocker(tx, tz, 3.2);
          i++;
        }
      }
      if (ctx.makeBarrel) { ctx.makeBarrel(r.x1 - 2.5, r.z0 + 3); ctx.makeBarrel(r.x1 - 3.7, r.z0 + 3.6); }
      placeParkedCar(ctx, "beatall", r.x1 - 4, r.z1 - 5, Math.PI / 2);
      ctx.addLitSpot({ x: c.x, y: 6, z: c.z, warm: 0xffbf74, power: 90, range: 20, pole: true });
    } });

    C.openArea("school", { color: "#55604a", build: (r, c) => {
      placeCityBuilding(ctx, "school", c.x, c.z, 0);
      const grit = ctx.surface("concrete", 512).material(1, { color: 0xb2ada2 });
      C.plane(c.w, 8, C.tiled(grit, c.w, 8, 6), c.x, 0.02, r.z1 - 4);
      placeTruck(ctx, "van", r.x0 + 5, r.z1 - 4, Math.PI / 2);
      ctx.addLitSpot({ x: c.x, y: 8, z: r.z1 - 4, warm: 0xf4f8ff, power: 130, range: 26, pole: true });
      C.pois.push({ x: c.x, z: r.z1 - 6, r: 7, label: "Chatboro School" });
    } });

    C.openArea("pasture", { color: "#4a6b3a", build: (r, c) => {
      const grass = ctx.surface("grass", 512).material(1, { color: 0x9ec47e });
      C.plane(c.w, c.d, C.tiled(grass, c.w, c.d, 8), c.x, 0.02, c.z);
      if (ctx.makeFence) {
        ctx.makeFence(r.x0 + 0.5, r.z0 + 1, r.x0 + 0.5, r.z1 - 1);
        ctx.makeFence(r.x1 - 0.5, r.z0 + 1, r.x1 - 0.5, r.z1 - 1);
        ctx.makeFence(r.x0 + 1, r.z0 + 0.5, r.x1 - 1, r.z0 + 0.5);
      }
      if (ctx.makeShed) ctx.makeShed(r.x0 + 6, r.z0 + 6, 0);
      if (ctx.makePallet) ctx.makePallet(r.x1 - 4, r.z1 - 6, 0.4);
    } });

    C.openArea("crossroads lot", { color: "#55544e", build: (r, c) => {
      C.plane(c.w, c.d, C.tiled(ctx.roadMaterial(), c.w, c.d, 9), c.x, 0.02, c.z);
      // the reason anyone stops here at all
      placeGasStation(ctx, c.x, c.z + 2, Math.PI);
      placeStreetClutter(ctx, r.x0 + 3, r.z0 + 4, 0);
      ctx.addLitSpot({ x: c.x, y: 8.5, z: c.z, warm: 0xffe0a8, power: 160, range: 30, pole: true });
      C.pois.push({ x: c.x, z: c.z - 6, r: 7, label: "Chatboro Crossroads" });
    } });

    placeBillboard(ctx, wx(16), wz(-112), Math.PI, "CHATBORO", "POP. 4,083", "NEXT SERVICES 40 MILES");
    placeBillboard(ctx, wx(-14), wz(94), 0, "JESUS IS COMING", "LOOK BUSY", "AND HE AIN'T STOPPING HERE EITHER");

    // ---- 5 vegetation: pines on whatever the village did not take --------
    C.vegetation(wr(BOUNDS), {
      spacing: 11, jitter: 3.5, clearance: 4,
      trunk: ctx.surface("dirt", 512).material(2, { color: 0xc4ae95, envMapIntensity: 0.7 }),
      foliage: ctx.surface("grass", 512).material(3, { color: 0xa2c184, envMapIntensity: 0.8 }),
    });

    // ---- 6 landmark: the church, closing the west end of Church Street ---
    C.landmark("church", (r, c) => {
      const concrete = ctx.surface("concrete", 512).material(1, { color: 0xc9c3b8 });
      // the nave runs west from the road; the steeple and the doors face east,
      // back down Church Street at the crossroads
      makeChurch(ctx, { x: r.x0 + 3, z: c.z, rot: Math.PI / 2, length: r.x1 - 4 - (r.x0 + 3), name: "Chatboro First Baptist" });
      C.plane(7, 14, C.tiled(concrete, 7, 14, 5), r.x1 - 2.5, 0.023, c.z);
      ctx.addLitSpot({ x: r.x1 - 1, y: 6.5, z: c.z + 5, warm: 0xfff0c8, power: 130, range: 26, pole: true });
      C.pois.push({ x: r.x1 + 2, z: c.z, r: 7, label: "Chatboro First Baptist" });
    });
  }

  return {
    BOUNDS: wr(BOUNDS), CORE: wr(CORE), lanes,
    composer: C,
    buildSet,
    zoneAt: (x, z) => C.zoneAt(x, z),
    report: () => C.report(),
    get pois() { return C.pois; },
    get props() { return C.props; },
    get minimap() { return C.minimap; },
    get zoneRects() { return C.zoneRects; },
    get drawn() { return C.drawn; },
    update(dt, playerPos) {
      const b = wr(BOUNDS);
      const quiet = !(ctx.storyBusy && ctx.storyBusy());
      if (!announced && quiet && playerPos.x > b.x0 && playerPos.x < b.x1 && playerPos.z > b.z0 && playerPos.z < b.z1) {
        announced = true;
        ctx.flashObjective("CHATBORO · pop. 4,083. One light, one church, and everybody going somewhere else.");
      }
      C.update(dt, ctx.camera ? ctx.camera.position : playerPos);
    },
  };
}
