import { createSpawnZones, ZONE_MIX, WANDER } from "../../src/spawnzones.js";
import { createNpcSystem } from "../../src/npc.js";
import { createFactionWar } from "../../src/factions.js";
import * as THREE from "three";

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`✓ PASS: ${message}`);
}

console.log("=== Testing TASK-035: Redneck vs Hoodrat Faction Warfare ===");

// 1. Check ZONE_MIX ratios and border flags
assert(ZONE_MIX.urban.hoodrat === 0.8 && ZONE_MIX.urban.redneck === 0.1 && ZONE_MIX.urban.prostitute === 0.1, "Urban zone: 80% Hoodrat / 10% Redneck / 10% prostitute");
assert(ZONE_MIX.residential.redneck === 0.82 && ZONE_MIX.residential.hoodrat === 0.08 && ZONE_MIX.residential.prostitute === 0.1, "Residential zone: 82% Redneck / 8% Hoodrat / 10% prostitute");
assert(ZONE_MIX.border_strip.border === true && ZONE_MIX.border_strip.hoodrat === 0.45 && ZONE_MIX.border_strip.redneck === 0.45 && ZONE_MIX.border_strip.prostitute === 0.1, "border_strip zone has border flag, 45/45 mix + 10% prostitute");
assert(ZONE_MIX.border_market.border === true && ZONE_MIX.border_market.hoodrat === 0.5, "border_market zone has border flag and 50/50 mix");

// 2. Check createSpawnZones and isBorder
const MAP = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
const spawnZones = createSpawnZones({
  MAP,
  ROAD_X: 0,
  ROAD_HALF: 8,
  LOT_X: 40,
  getOrlea: () => null,
  residential: [{ x: -100, z: -100, r: 30 }],
});

assert(spawnZones.isBorder(20, 0) === true, "isBorder returns true for strip border zone at roadside (20,0)");
assert(spawnZones.isBorder(140, 0) === true, "isBorder returns true for market border zone at (140,0)");
assert(spawnZones.isBorder(-100, -100) === false, "isBorder returns false for residential zone at (-100,-100)");

// 3. Test NPC System and Faction Warfare Integration
const pois = [{ x: 0, z: 0, r: 10 }];
const hitPlayerCalls = [];
const hitPlayer = (dmg) => hitPlayerCalls.push(dmg);
const resolveCollision = () => {};
const bounds = MAP;

const npcs = createNpcSystem({ pois, resolveCollision, hitPlayer, bounds });

function createMockNpc(type, x, z, hp = 5) {
  const spr = new THREE.Group();
  spr.position.set(x, 0, z);
  spr.setFlip = () => {};
  spr.play = () => {};
  spr.anim = "idle";
  const T = {
    label: type === "redneck" ? "Redneck" : "Hoodrat",
    speed: 4,
    aggro: 20,
    melee: 2,
    dmg: 3,
    atkGap: 0.5,
  };
  const rec = {
    type,
    T,
    spr,
    hp,
    t: 0,
    atkCd: 0,
    dead: false,
    fade: 1,
    charge: 0,
    chargeCd: 0,
  };
  npcs.init(rec);
  return rec;
}

const factionWar = createFactionWar({ npcs, spawnZones });

// Scenario A: Solid Territory (Residential) — NPCs stay calm
const r1 = createMockNpc("redneck", -100, -100);
const h1 = createMockNpc("hoodrat", -95, -100);
const livingSolid = [r1, h1];

// Run factionWar update for several steps
for (let i = 0; i < 10; i++) {
  factionWar.update(0.1, livingSolid);
}

assert(r1.state !== "hostile" && h1.state !== "hostile", "NPCs in solid residential territory ignore each other and stay calm");

// Scenario B: Border Zone — Redneck and Hoodrat engage in combat
const r2 = createMockNpc("redneck", 20, 0);
const h2 = createMockNpc("hoodrat", 25, 0);
const livingBorder = [r2, h2];

// Run factionWar update until they spot each other
for (let i = 0; i < 10; i++) {
  factionWar.update(0.1, livingBorder);
}

assert(r2.state === "hostile" && h2.state === "hostile", "NPCs in border zone spot each other and become hostile");
assert(r2.rivalTarget === h2 && h2.rivalTarget === r2, "rivalTarget is set mutually between redneck and hoodrat");

// Scenario C: Combat execution — NPCs attack each other, dealing damage without hitting the player
const env = { player: { x: 20, z: 0 }, driving: false, others: livingBorder, killEnemy: (e) => { npcs.release(e); e.dead = true; } };

hitPlayerCalls.length = 0;
// Advance simulation frame
npcs.beginFrame(0.1);
npcs.update(r2, 0.1, env);
npcs.update(h2, 0.1, env);

assert(hitPlayerCalls.length === 0, "Player was not hit during faction battle");

// Simulate combat until one dies
let rounds = 0;
while (!r2.dead && !h2.dead && rounds < 100) {
  rounds++;
  npcs.beginFrame(0.2);
  // move them closer to melee range
  if (Math.hypot(r2.spr.position.x - h2.spr.position.x, r2.spr.position.z - h2.spr.position.z) > 1.5) {
    r2.spr.position.x = 20.0;
    h2.spr.position.x = 21.0;
  }
  npcs.update(r2, 0.2, env);
  npcs.update(h2, 0.2, env);
}

assert(r2.dead || h2.dead, `One rival was defeated in combat after ${rounds} rounds`);
assert(hitPlayerCalls.length === 0, "Player took zero damage throughout the faction duel");

// Scenario D: MAX_HOSTILE cap enforcement
const extraNpcs = [];
for (let i = 0; i < 10; i++) {
  const n = createMockNpc("redneck", i * 2, 0);
  npcs.becomeHostile(n);
  extraNpcs.push(n);
}
assert(npcs.hostileCount <= 7, `hostileCount (${npcs.hostileCount}) never exceeds MAX_HOSTILE (7)`);

// Scenario E: per-zone wander profiles (zone-dependent walk speed + radius)
console.log("=== Per-zone wander profiles (WANDER) ===");
assert(WANDER.urban.speed > 1 && WANDER.urban.r < 1, "Urban profile: quicker steps, tighter radius");
assert(WANDER.rural.speed < 1 && WANDER.rural.r > 1, "Rural profile: slower steps, wider radius");
assert(WANDER.highway === null && WANDER.water === null, "Nobody wanders on the highway or the water");

let p2 = null;
for (let tries = 0; tries < 50 && !p2; tries++) p2 = spawnZones.pick({ x: 20, z: 0 }, []);   // retries skip highway/water rejections, as the game does
assert(p2 && p2.wanderR != null && p2.wanderSpeed != null, "pick() returns a wander profile alongside the spot");
assert(p2.wanderR === WANDER[p2.zone].r && p2.wanderSpeed === WANDER[p2.zone].speed, "The returned profile matches the spot's zone");

const cityZones = createSpawnZones({
  MAP, ROAD_X: 0, ROAD_HALF: 8, LOT_X: 40,
  // everything east of x 150 is "urban"; the pick relocates to a hangout
  getOrlea: () => ({ inCity: (x, z) => x > 150, pois: [{ x: 245, z: 0, r: 10 }] }),
  coreMinX: 100,
});
let cityPick = null;
for (let tries = 0; tries < 50 && (!cityPick || cityPick.zone !== "urban"); tries++) {
  cityPick = cityZones.pick({ x: 180, z: 0 }, []);
}
assert(cityPick && cityPick.zone === "urban" && cityPick.wanderSpeed === WANDER.urban.speed,
  "A city pick carries the urban profile (fast, tight)");

const npcs2 = createNpcSystem({ pois: [{ x: 180, z: 0, r: 10 }], resolveCollision, hitPlayer, bounds: MAP });
const c = createMockNpc("hoodrat", 180, 0);
c.wanderR = cityPick.wanderR; c.wanderSpeed = cityPick.wanderSpeed;
npcs2.init(c);
assert(c.wanderR === WANDER.urban.r && c.wanderSpeed === WANDER.urban.speed, "init() keeps the spawner's zone profile on the record");

const unp = createMockNpc("hoodrat", 0, 0);
npcs2.init(unp);
assert(unp.wanderR === 1 && unp.wanderSpeed === 1, "A record without a zone profile gets the neutral default");

// Scenario F: Market Row — Lafourchette's Saturday market
console.log("=== Market Row (Saturday crowd) ===");
assert(ZONE_MIX.market_row.hoodrat === 0.25 && ZONE_MIX.market_row.redneck === 0.75, "market_row mix leans parish: 75% Redneck / 25% Hoodrat");
assert(WANDER.market_row.r < WANDER.town.r && WANDER.market_row.r < WANDER.commercial.r, "market_row wanders tighter than town or commercial");

// a district whose open area claims its own zone name; the gather sink pulls
// nearby samples onto the square, exactly as main.js wires it
const MARKET_RECT = { x0: 316, x1: 348, z0: -99, z1: -73 };
const marketDistrict = createSpawnZones({
  MAP: { minX: -200, maxX: 380, minZ: -200, maxZ: 200 },   // Lafourchette sits east of the old ±200 square
  ROAD_X: 0, ROAD_HALF: 8, LOT_X: 40, getOrlea: () => null,
  extraZone: (x, z) => (x >= MARKET_RECT.x0 && x <= MARKET_RECT.x1 && z >= MARKET_RECT.z0 && z <= MARKET_RECT.z1) ? "market_row" : null,
  gatherPois: [{ x: 332, z: -86, r: 10 }],   // r 10 keeps the scatter inside the 26×26 m square
});
let mp = null;
// the player strolls past on the road 40 m west of the square; spawns sample a
// 65–105 m ring around them, and the sink pulls the ones that pass near it
for (let tries = 0; tries < 80 && (!mp || mp.zone !== "market_row"); tries++) {
  mp = marketDistrict.pick({ x: 290, z: -86 }, []);
}
assert(mp && mp.zone === "market_row" && mp.wanderR === WANDER.market_row.r,
  "A Market Row pick carries the market profile (tight and slow)");
assert(mp.x >= MARKET_RECT.x0 && mp.x <= MARKET_RECT.x1 && mp.z >= MARKET_RECT.z0 && mp.z <= MARKET_RECT.z1,
  "The gathered spawn lands on the market square itself");
assert(mp.kind === "redneck" || mp.kind === "hoodrat", "Market Row spawns people, never hogs");

// worldTime drives market hours: day 1 (game opens 18:30) is quiet, day 2+ at
// noon bustles, and night closes
const fakeClock = { hours: 12, day: 2 };
const mkt = createNpcSystem({ pois, resolveCollision, hitPlayer, bounds: MAP, worldTime: fakeClock });
const m1 = createMockNpc("redneck", 0, 0);
m1.wanderR = WANDER.market_row.r; m1.wanderSpeed = WANDER.market_row.speed;
mkt.init(m1);
assert(m1.marketSaturday === true, "A market NPC at noon on day 2 is in Saturday mode");

const lateClock = { hours: 19.5, day: 2 };
const mktLate = createNpcSystem({ pois, resolveCollision, hitPlayer, bounds: MAP, worldTime: lateClock });
const m2 = createMockNpc("redneck", 0, 0);
m2.wanderR = WANDER.market_row.r; m2.wanderSpeed = WANDER.market_row.speed;
mktLate.init(m2);
assert(m2.marketSaturday === false, "A market NPC at 19:30 is closed (quiet streets)");

const day1 = createNpcSystem({ pois, resolveCollision, hitPlayer, bounds: MAP, worldTime: { hours: 19, day: 1 } });
const m3 = createMockNpc("redneck", 0, 0);
m3.wanderR = WANDER.market_row.r; m3.wanderSpeed = WANDER.market_row.speed;
day1.init(m3);
assert(m3.marketSaturday === false, "Day 1 evening (the game's opening) is not a market day");

const noonTown = createNpcSystem({ pois, resolveCollision, hitPlayer, bounds: MAP, worldTime: { hours: 12, day: 2 } });
const m4 = createMockNpc("hoodrat", 0, 0);          // town profile: wanderSpeed 1.1 > 1
noonTown.init(m4);
assert(m4.marketSaturday === false, "Non-market zones never get Saturday mode, whatever the hour");

console.log("🎉 All unit tests passed cleanly!");
