// Zombie archetypes + safehouse exclusion, as wired into npc.js (TASK-078/082).
// Headless: node tools/qa/zombie_test.mjs  (needs `three`, see TODO.md testing notes)
import * as THREE from "three";
import { createNpcSystem } from "../../src/npc.js";
import { resolveArchetype, pickArchetype, ZOMBIE_ARCHETYPES } from "../../src/zombies.js";

let failed = 0;
function check(cond, msg) {
  if (cond) console.log(`✓ PASS: ${msg}`);
  else { console.error(`❌ FAIL: ${msg}`); failed++; }
}

const BASE = { label: "Zombie", h: 1.9, hp: 5, speed: 2.1, aggro: 30, melee: 1.7, dmg: 9, atkGap: 0.8 };
const bounds = { minX: -500, maxX: 500, minZ: -500, maxZ: 500 };
const npcs = createNpcSystem({ pois: [{ x: 0, z: 0, r: 10 }], resolveCollision: () => {}, hitPlayer: () => {}, bounds, maxHostile: () => 20 });

function zombie(x, z, archetype = null) {
  const spr = new THREE.Group();
  spr.position.set(x, 0, z);
  spr.setFlip = () => {}; spr.play = () => {};
  const T = archetype ? { ...BASE, ...resolveArchetype(archetype) } : BASE;
  const e = { type: "zombie", T, spr, hp: T.hp, t: 0, atkCd: 0, dead: false, fade: 1, charge: 0, chargeCd: 0 };
  npcs.init(e);
  return e;
}
// run one think tick for e against a player at (px, pz)
function think(e, env, px = 0, pz = -70) {
  env.player = new THREE.Vector3(px, 0, pz);
  e.think = 0;
  npcs.beginFrame(0.3);
  npcs.update(e, 0.3, env);
}
const mkEnv = (extra = {}) => ({ others: [], state: {}, ...extra });

// ---- archetype table ----
check(resolveArchetype("brute").hp === 15 && resolveArchetype("runner").speed > BASE.speed, "resolveArchetype scales the base stats");
check(resolveArchetype("nope") === null, "unknown archetype resolves to null");
const seen = new Set();
for (let i = 0; i < 400; i++) seen.add(pickArchetype());
check([...seen].every((n) => n in ZOMBIE_ARCHETYPES) && seen.size === Object.keys(ZOMBIE_ARCHETYPES).length, "pickArchetype only names real archetypes and reaches all of them");

// ---- Screamer: one big noise, once ----
{
  const s = zombie(0, 0, "screamer"), other = zombie(40, 0, "shambler");
  const env = mkEnv({ others: [s, other] });
  think(s, env, 10, 0);   // player 10 m away, inside its aggro
  check(s.state === "hostile" && s.screamed === true, "screamer goes hostile and screams");
  think(other, mkEnv({ others: [s, other] }));   // 40 m off: beyond a shambler's own aggro, inside the scream (55)
  check(other.state === "wander" && Math.abs(other.goal.x) < 1, "an idle zombie 40 m away is pulled toward the scream");
  // does not scream again
  s.screamed = true;
  think(s, env, 10, 0);
  check(s.screamed === true, "scream is once-per-life");
}

// ---- Brute: deaf to distant noise ----
{
  const brute = zombie(0, 0, "brute"), shambler = zombie(0, 0, "shambler");
  npcs.noise(20, 0, 30);    // a gunshot 20 m away
  think(brute, mkEnv({ others: [brute] }));
  think(shambler, mkEnv({ others: [shambler] }));
  check(brute.state !== "wander" || brute.goal.x < 1, "brute ignores a gunshot 20 m off (hear range " + Math.round(brute.T.aggro * 0.35) + " m)");
  check(shambler.state === "wander" && Math.abs(shambler.goal.x - 20) < 1, "shambler is drawn to the same gunshot");
}

// ---- Safehouse: pushed out, and the player is safe inside ----
{
  const sh = { x: 100, z: 100, r: 15 };
  const inside = zombie(105, 100);
  const env = mkEnv({ others: [inside], safehouseAt: (x, z) => (Math.hypot(x - sh.x, z - sh.z) < sh.r ? sh : null) });
  think(inside, env, 150, 100);
  check(inside.state === "wander" && Math.hypot(inside.goal.x - sh.x, inside.goal.z - sh.z) > sh.r, "a zombie inside a safehouse is sent back out");

  const hunter = zombie(0, 0);
  think(hunter, mkEnv({ others: [hunter] }), 10, 0);
  check(hunter.state === "hostile", "control: a zombie near the player goes hostile");
  think(hunter, mkEnv({ others: [hunter], playerSafe: true }), 10, 0);
  check(hunter.state !== "hostile", "hostile zombie drops the player once they're in a safehouse");
  const fresh = zombie(0, 0);
  think(fresh, mkEnv({ others: [fresh], playerSafe: true }), 10, 0);
  check(fresh.state !== "hostile", "a zombie won't notice a player standing in a safehouse");
}

// ---- the horde is outside the hostile budget, and drifts toward the player ----
{
  const crowd = [];
  for (let i = 0; i < 40; i++) crowd.push(zombie(10 + (i % 8), i * 0.5));   // 40 zombies, all inside aggro; the budget is 20
  const env = mkEnv({ others: crowd });
  for (const z of crowd) think(z, env, 0, 0);
  check(crowd.every((z) => z.state === "hostile"), "all 40 zombies go hostile despite a hostile budget of 20 (they used to stand there)");
  check(npcs.hostileCount <= 20, "zombie hostility does not eat the civilians' hostile budget (" + npcs.hostileCount + ")");
  const far = zombie(0, 70);                                                  // 70 m off: past aggro (30), inside scent (100)
  think(far, mkEnv({ others: [far] }), 0, 0);
  check(far.state === "wander" && Math.hypot(far.goal.x, far.goal.z) < 5, "an idle zombie 70 m away shambles toward the player");
  const gone = zombie(0, 100 * 1.5);
  think(gone, mkEnv({ others: [gone] }), 0, 0);
  check(!(gone.state === "wander" && Math.hypot(gone.goal.x, gone.goal.z) < 5), "...but not one 150 m away");
  const safe = zombie(0, 70);
  think(safe, mkEnv({ others: [safe], playerSafe: true }), 0, 0);
  check(!(safe.state === "wander" && Math.hypot(safe.goal.x, safe.goal.z) < 5), "...nor toward a player in a safehouse");
}

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1); }
console.log("\nAll zombie checks passed");
