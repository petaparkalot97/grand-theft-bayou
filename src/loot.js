// ---------------------------------------------------------------------------
// loot.js — what NPCs drop, and picking it up.
//
// When an NPC dies, its type's loot table is rolled:
//   hoodrat   80% cash, 16% a weapon
//   redneck   70% cash, 24% a weapon (they're the ones carrying)
//   hog       nothing (hogs don't carry wallets)
// Cash comes in $5 / $10 / $20 / $50 notes (mostly small; the strip pays a
// wrecked cruiser $250, so a body shouldn't beat that). Weapons roll a rarity
// first (weapons.js RARITY), then a weapon of that rarity.
//
// Drops are real things on the ground: a green bill stack or a gun on a
// rarity-coloured ring, bobbing, collected by walking over them (or rolling
// over slowly in a car). Pickups are pooled: at most MAX_ACTIVE on the ground,
// the oldest recycled, and each one expires after LIFETIME seconds.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { WEAPONS, RARITY } from "./weapons.js";

export const LOOT_TABLES = Object.freeze({
  hoodrat: { cash: 0.7, weapon: 0.16, ammo: 0.2 },
  redneck: { cash: 0.6, weapon: 0.24, ammo: 0.25 },
  prostitute: { cash: 0.92, weapon: 0.03, ammo: 0.05 },
  hog: { cash: 0, weapon: 0, ammo: 0 },
  // no wallet on a corpse, but whatever they were carrying before they turned
  // sometimes still is
  zombie: { cash: 0, weapon: 0, ammo: 0.12 },
});
// ---------------------------------------------------------------------------
// LOCATION_LOOT (TASK-080): what searching a *place* turns up, as opposed to
// LOOT_TABLES above (what a body drops). Same shape — a 0..1 chance per drop
// category, each rolled independently — and the same three categories: no
// food/water, since no survival-resource system has been approved (TODO.md ->
// Blockers). Where a `food` / `medical` category would plug in later: add the
// key to the entry, add its branch to dropAtLocation() below, add a pickup
// kind to createLoot's pool — nothing else here changes.
//
// Only kinds backed by real built geometry (nothing is speced for a building
// that doesn't exist — no police station or hardware store is built anywhere):
//   gas_station    main.js LANDMARKS "gasstation" (Gas_station.fbx) and the
//                  6twelve ("sixtwelve", makeSixtwelve); stateWorld.js:325
//   restaurant     main.js LANDMARKS "burgerpiz" / "taco" / "popeyes"
//                  (POPEYES_LOCATIONS)
//   hospital       tusouxroeNorth.js Harborlight Hospital, orlearouge.js
//                  OrleaRouge Public Hospital (both register a "hospital"
//                  service), stateWorld.js placeCityBuilding "hospital"
//   general_store  westparish.js Bayou Noir General Store (placeGlbLandmark)
//   residential    any ordinary house/trailer lot (spawnzones.js "residential")
// ---------------------------------------------------------------------------
export const LOCATION_LOOT = Object.freeze({
  gas_station:   { cash: 0.5,  weapon: 0.05, ammo: 0.2 },    // the till; a shotgun under the counter, sometimes
  restaurant:    { cash: 0.55, weapon: 0.02, ammo: 0.05 },   // the till, and not much else
  hospital:      { cash: 0.15, weapon: 0.02, ammo: 0.08 },   // a security guard's leftovers; the real prize is medical, later
  general_store: { cash: 0.45, weapon: 0.12, ammo: 0.45 },   // rural: guns and shells are on the shelves
  residential:   { cash: 0.3,  weapon: 0.1,  ammo: 0.25 },   // a drawer, a closet, a bedside table
});

export const CASH_NOTES = Object.freeze([[5, 40], [10, 30], [20, 20], [50, 10]]);   // [amount, weight]
const MAX_ACTIVE = 24;
const LIFETIME = 90;
const REACH = 1.7;

function weighted(pairs, rnd) {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of pairs) { if ((r -= w) < 0) return v; }
  return pairs[pairs.length - 1][0];
}

/**
 * @param {object} o
 * @param {THREE.Scene} o.scene
 * @param {object} o.state           state.cash lives here
 * @param {Function} o.getPlayerPos  () => Vector3
 * @param {object} o.arsenal         weapons.js
 * @param {Function} o.syncHUD
 * @param {Function} o.flashObjective
 * @param {Function} o.rng           () => [0, 1)
 */
export function createLoot({ scene, state, getPlayerPos, arsenal, syncHUD, flashObjective, rng = Math.random, lootMul = () => 1, tableFor = () => null, ammoTarget = () => null, medDropChance = () => 0 }) {
  const active = [];
  const pool = { cash: [], weapon: [], ammo: [], health: [] };
  let t = 0;

  const unlit = (color, opts = {}) => {
    const m = new THREE.MeshBasicMaterial({ color, ...opts });
    m.userData.gtbRealized = true;
    return m;
  };
  const billMat = unlit(0x3fa34d), bandMat = unlit(0xf2e7b8), gunMat = unlit(0x3a4048), gunMetal = unlit(0x9aa4ae);
  const ammoMat = unlit(0xd97724), ammoBandMat = unlit(0x403425);
  const glowTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(0.5, "rgba(255,255,255,.25)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const ringMats = {};
  const ringMat = (rarity) => ringMats[rarity] || (ringMats[rarity] = unlit(RARITY[rarity].color));

  function makeCash() {
    const g = new THREE.Group();
    const stack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.2), billMat);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.21), bandMat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x7dff8a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.material.userData.gtbRealized = true;
    glow.scale.setScalar(1.2);
    g.add(stack, band, glow);
    return g;
  }
  function makeAmmo() {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.22), ammoMat);
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.23), ammoBandMat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa000, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.material.userData.gtbRealized = true;
    glow.scale.setScalar(1.1);
    g.add(box, band, glow);
    return g;
  }
  function makeHealth() {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }));
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.32), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.32), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff4f6d, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.setScalar(1.2);
    g.add(box, cross, cross2, glow);
    return g;
  }
  function makeWeapon() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.1), gunMat);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 0.09), gunMat);
    grip.position.set(-0.18, -0.13, 0);
    grip.rotation.z = -0.25;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), gunMetal);
    barrel.rotation.z = Math.PI / 2;
    barrel.position.set(0.3, 0.02, 0);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 6, 32), ringMat("common"));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.26;
    // a rarity-coloured glow so a gun reads at night from the chase camera, not just its ring
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.material.userData.gtbRealized = true;
    glow.scale.setScalar(0.95);
    g.add(body, grip, barrel, ring, glow);
    g.scale.setScalar(1.5);
    g.userData.ring = ring;
    g.userData.glow = glow;
    return g;
  }

  function spawn(kind, x, z, payload) {
    if (active.length >= MAX_ACTIVE) release(active[0]);
    const obj = pool[kind].pop() || (kind === "cash" ? makeCash() : kind === "ammo" ? makeAmmo() : kind === "health" ? makeHealth() : makeWeapon());
    if (kind === "weapon") {
      const rarity = WEAPONS[payload.id].rarity;
      obj.userData.ring.material = ringMat(rarity);
      obj.userData.glow.material.color.setHex(RARITY[rarity].color);
    }
    obj.position.set(x, 0.45, z);
    obj.visible = true;
    if (!obj.parent) scene.add(obj);
    const item = { kind, obj, x, z, born: t, phase: rng() * 6, ...payload };
    active.push(item);
    return item;
  }
  function release(item) {
    const i = active.indexOf(item);
    if (i >= 0) active.splice(i, 1);
    item.obj.visible = false;
    pool[item.kind].push(item.obj);
  }

  function rollWeapon() {
    const rarity = weighted(Object.entries(RARITY).filter(([k]) => k !== "starter").map(([k, r]) => [k, r.weight]), rng);
    const options = Object.values(WEAPONS).filter((w) => w.rarity === rarity);
    const w = options[(rng() * options.length) | 0];
    return { id: w.id, rounds: w.clip };
  }

  return {
    LOOT_TABLES,
    LOCATION_LOOT,
    get active() { return active; },

    /** Roll an NPC's loot table where it fell. Returns what dropped. */
    dropFor(npc) {
      const table = tableFor(npc.type) || LOOT_TABLES[npc.type];
      if (!table) return [];
      const p = npc.spr.position, out = [];
      const lm = lootMul();
      if (rng() < table.cash * lm) out.push(spawn("cash", p.x + (rng() - 0.5), p.z + (rng() - 0.5), { amount: weighted(CASH_NOTES, rng) }));
      if (rng() < table.weapon * lm) out.push(spawn("weapon", p.x + (rng() - 0.5) * 1.6, p.z + (rng() - 0.5) * 1.6, rollWeapon()));
      if (rng() < table.ammo * lm) out.push(spawn("ammo", p.x + (rng() - 0.5) * 1.2, p.z + (rng() - 0.5) * 1.2, { rounds: 16 }));
      if (rng() < medDropChance()) out.push(spawn("health", p.x + (rng() - 0.5) * 1.4, p.z + (rng() - 0.5) * 1.4, { amount: 35 }));
      return out;
    },

    /**
     * Search a place: roll LOCATION_LOOT[kind] around (x, z). Returns what
     * dropped (empty for an unknown kind). Interface contract for tagging a
     * building: give its spawn/search point `{ kind: "gas_station", x, z }`
     * and call this once per search — that tagging is a district/main.js job.
     */
    dropAtLocation(kind, x, z) {
      const table = LOCATION_LOOT[kind];
      if (!table) return [];
      const out = [];
      if (rng() < table.cash) out.push(spawn("cash", x + (rng() - 0.5) * 1.5, z + (rng() - 0.5) * 1.5, { amount: weighted(CASH_NOTES, rng) }));
      if (rng() < table.weapon) out.push(spawn("weapon", x + (rng() - 0.5) * 2, z + (rng() - 0.5) * 2, rollWeapon()));
      if (rng() < table.ammo) out.push(spawn("ammo", x + (rng() - 0.5) * 1.5, z + (rng() - 0.5) * 1.5, { rounds: 16 }));
      return out;
    },

    /** Put a specific drop on the ground (QA, story rewards). */
    dropAt(kind, x, z, payload) {
      return spawn(kind, x, z, kind === "cash" ? { amount: payload && payload.amount || 20 } : kind === "ammo" ? { rounds: payload && payload.rounds || 16 } : { id: payload && payload.id || "tec9", rounds: payload && payload.rounds });
    },

    update(dt) {
      t += dt;
      const p = getPlayerPos();
      const inCar = !!state.veh, slow = !inCar || Math.abs(state.veh.speed) < 6;
      for (let i = active.length - 1; i >= 0; i--) {
        const it = active[i];
        if (t - it.born > LIFETIME) { release(it); continue; }
        it.obj.rotation.y += dt * 1.8;
        it.obj.position.y = 0.45 + Math.sin(t * 2.4 + it.phase) * 0.08;
        if (!slow || Math.hypot(p.x - it.x, p.z - it.z) > (inCar ? 2.6 : REACH)) continue;
        if (it.kind === "cash") {
          state.cash += it.amount;
          syncHUD();
          flashObjective(`+$${it.amount}`);
        } else if (it.kind === "ammo") {
          const cur = arsenal.current;
          if (cur.melee) {
            state.cash += 10;
            syncHUD();
            flashObjective(`Recycled ammo scrap for +$10 cash`);
          } else {
            // scarce-ammo modes top up whichever gun is running lowest, not just the one in your hands
            const tgt = WEAPONS[ammoTarget() || cur.id] || cur;
            arsenal.addReserve(tgt.id, it.rounds);
            flashObjective(`Picked up ${it.rounds} ${tgt.name} rounds`);
          }
        } else if (it.kind === "health") {
          const amt = state.stats ? Math.round(it.amount * state.stats.mods.healMul()) : it.amount;
          state.hp = Math.min(100, (state.hp || 100) + amt);
          syncHUD();
          flashObjective(`Salvaged Stimpak (+${amt} HP)`);
        } else {
          const w = WEAPONS[it.id];
          arsenal.give(it.id, it.rounds);
          flashObjective(`Picked up a ${w.name} (${RARITY[w.rarity].label})`);
        }
        release(it);
      }
    },
  };
}
