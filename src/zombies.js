// ---------------------------------------------------------------------------
// zombies.js — zombie archetypes as DATA (TASK-078). Not wired into anything.
//
// TASK-077 (main.js / npc.js) shipped exactly one zombie: ENEMY_TYPES.zombie
// (hp 5, speed 2.1, aggro 30, melee 1.7, dmg 9, atkGap 0.8) with its own
// branch in npc.js's decide() — hunts the closer of the player or any living
// non-zombie NPC within `aggro`, never calms down, shambles toward
// recentViolence (gunfire/kills) when idle. This module layers archetypes on
// that base as stat multipliers plus a small set of behavior FLAGS. Nothing
// here imports game state, THREE, or any module — it is a plain table plus
// pure helpers, so wiring it (Claude, per protocol §1 rule 5) touches only
// ENEMY_TYPES in main.js and ~4 lines in npc.js's zombie branch.
//
// Per the human's TASK-077 decision these are reskins/data only: every
// archetype renders as the same randomZombie() Hoodrat-rig reskin. See
// "Visual differentiation" below for what that means.
// ---------------------------------------------------------------------------

/**
 * The TASK-077 base zombie, mirrored here as the reference archetype's source.
 * Single source of truth stays `ENEMY_TYPES.zombie` in main.js until
 * integration — if that entry changes, change this mirror to match.
 */
export const BASE_ZOMBIE = Object.freeze({
  label: "Zombie",
  hp: 5, speed: 2.1, aggro: 30, melee: 1.7, dmg: 9, atkGap: 0.8,
});

/**
 * Behavior flags. All are DOCUMENTED, NOT WIRED — see Integration notes.
 *
 *   noiseResponse  multiplier on `aggro` limiting how far away an event
 *                  (gunshot, kill, fight — npc.js's recentViolence events)
 *                  will pull this zombie when it has no target. 1 = base
 *                  behaviour (any event it could already "see" pulls it);
 *                  <1 = ignores distant noise (the Brute lumbers, it doesn't
 *                  charge across the parish toward every gunshot); >1 = even
 *                  more of a moth to the flame.
 *   screamOnHostile  { r } — the FIRST time this zombie successfully goes
 *                  hostile (npc.js becomeHostile returns true), it calls the
 *                  npc system's exported noise(x, z, r) with r far larger than
 *                  ordinary violence events (15–22), pulling every idle zombie
 *                  in earshot toward it. once-per-life, not per-target: a
 *                  Screamer that loses its target and finds a new one does NOT
 *                  scream again (e.screamed, cleared on spawn only).
 */
export const ZOMBIE_ARCHETYPES = Object.freeze({
  // The baseline that already exists (TASK-077). Kept as an explicit entry so
  // spawn tables can always name it, and so the other entries read as deltas.
  shambler: {
    label: "Shambler",
    stats: { hp: 1.0, speed: 1.0, aggro: 1.0, melee: 1.0, dmg: 1.0, atkGap: 1.0 },
    flags: { noiseResponse: 1.0 },
    weight: 55,
  },//  Skinny, fast, always looking. Hits like a grabby child but arrives first
  // and forces the player to keep moving. Speed 4.0 ≈ a Hoodrat (4.7) — faster
  // than the player's comfortable walk, outrun by a sprint or any car.
  runner: {
    label: "Runner",
    stats: { hp: 0.6, speed: 1.9, aggro: 1.4, melee: 1.0, dmg: 0.7, atkGap: 0.8 },
    flags: { noiseResponse: 1.5 },
    look: { h: 0.93, skin: 0xc9d4b8, cloth: 0x7a3a30 },                 // gaunt, bone-pale, in bloodied red
    weight: 20,
  },

  // The wall that walks. Near-sighted (aggro 24) and deaf to distant gunfire
  // (noiseResponse 0.35 — it does NOT come running across the map because you
  // shot something two blocks over; it lumbers in a straight line and punishes
  // whoever stands in it). Reach 2.1 and dmg 16 one-shot an unarmored careless
  // player who lets it close; atkGap 1.2 keeps the swing slow and dodgeable.
  brute: {
    label: "Brute",
    stats: { hp: 3.0, speed: 0.55, aggro: 0.8, melee: 1.25, dmg: 1.8, atkGap: 1.5 },
    flags: { noiseResponse: 0.35 },
    look: { h: 1.4, skin: 0xa8906e, cloth: 0x5a1a1a },                  // a head and a half taller than anyone: bloated, sallow, in maroon rags (dark greens vanish at night)
    weight: 12,
  },

  // The interesting one. Weak (dmg 3), not fast, notices a little late — and
  // the moment it DOES go hostile it screams (flag above), dragging every
  // idle zombie within ~55 m onto its position. Kill it before it finishes
  // closing, or fight the crowd it called. The scream's audio hook belongs to
  // TASK-081's ambience work; this flag is only the gameplay pull.
  screamer: {
    label: "Screamer",
    stats: { hp: 0.8, speed: 1.1, aggro: 0.9, melee: 1.0, dmg: 0.3, atkGap: 1.0 },
    flags: { noiseResponse: 1.2, screamOnHostile: { r: 55 } },
    look: { h: 1.0, skin: 0xe8e2c8, cloth: 0xe0b020 },                  // hazard-yellow: you see the one that is about to scream
    weight: 8,
  },

  // Crawler is deliberately ABSENT — the open design question TASK-078 was
  // asked to write up rather than answer. Full tradeoffs in the task's Notes
  // (TODO.md); recommendation: option (c), skip it this wave. If it ever
  // lands as option (a), it plugs in here as a plain entry like the rest:
  //
  // crawler: {
  //   label: "Crawler",
  //   stats: { hp: 0.6, speed: 0.7, aggro: 0.7, melee: 0.9, dmg: 1.2, atkGap: 1.1 },
  //   flags: { noiseResponse: 1.0, lowProfile: true },
  //   weight: 5,
  // },
  //
  // `lowProfile` is only meaningful once anything reads enemy height — today
  // nothing does (hit detection is 2D x/z distance; npc.js melee range is
  // planar), so a crawler would play as a slow Shambler, not a low one.
});

/**
 * Resolve an archetype into concrete ENEMY_TYPES-shaped stats, multiplying the
 * base. Pure: no state, no side effects. Returns null for an unknown name so
 * a typo'd spawn-table entry fails loudly at the consumer, not silently here.
 */
export function resolveArchetype(name, base = BASE_ZOMBIE) {
  const a = ZOMBIE_ARCHETYPES[name];
  if (!a) return null;
  const s = a.stats;
  return {
    label: a.label,
    hp: Math.round(base.hp * s.hp),
    speed: +(base.speed * s.speed).toFixed(2),
    aggro: Math.round(base.aggro * s.aggro),
    melee: +(base.melee * s.melee).toFixed(2),
    dmg: Math.round(base.dmg * s.dmg),
    atkGap: +(base.atkGap * s.atkGap).toFixed(2),
    zombieFlags: { ...a.flags },
    zombieLook: a.look ? { ...a.look } : null,
  };
}

/**
 * Weighted pick over the table's `weight` fields (shambler 55 / runner 20 /
 * brute 12 / screamer 8). Pure. Consumers that want a fixed mix can ignore
 * this and roll their own; this is just the table's own opinion so a horde
 * isn't 16 Screamers.
 */
export function pickArchetype(rnd = Math.random) {
  const entries = Object.entries(ZOMBIE_ARCHETYPES);
  const total = entries.reduce((s, [, a]) => s + (a.weight || 0), 0);
  let r = rnd() * total;
  for (const [name, a] of entries) {
    r -= a.weight || 0;
    if (r < 0) return name;
  }
  return entries[entries.length - 1][0];
}

// ---------------------------------------------------------------------------
// INTEGRATION NOTES (for Claude) — the exact wiring, in four small steps.
//
// 1. main.js `ENEMY_TYPES`: for each archetype, add an entry derived from
//    `zombie`, e.g. with resolveArchetype() output inlined as literals
//    (ENEMY_TYPES is a plain object literal; generating it at module scope
//    also works — `...Object.fromEntries(["shambler","runner","brute",
//    "screamer"].map(n => [n, { kind:"actor", tint:0x6b8f5a, h:1.9,
//    ...resolveArchetype(n) }]))` — but note resolveArchetype output has no
//    `kind`/`h`/`tint`, so spread the base zombie's presentation fields first).
//    Keep the plain `zombie` entry as-is for safety; spawn-side picks the
//    archetype.
//
// 2. main.js `updateZombiePopulation()`: after `spawnZones.pick(...)` returns
//    a spot, choose an archetype — `const name = pickArchetype(); const spot2
//    = { ...spot, archetype: name }` — and `spawnEnemy(name, spot.x, spot.z,
//    spot2)`. (spawnEnemy's first arg indexes ENEMY_TYPES, so the archetype
//    name IS the type name — no spawnEnemy change needed.)
//
// 3. npc.js zombie branch, the noise-response flag: `recentViolence(p)`
//    returns the FIRST event (newest-first) whose own radius already contains
//    p — it takes no radius argument. Cheapest faithful wiring, two lines at
//    the call site in the zombie branch:
//      const ev = recentViolence(p);
//      if (ev && (ev.x - p.x) ** 2 + (ev.z - p.z) ** 2
//          > (e.T.aggro * (e.T.zombieFlags?.noiseResponse ?? 1)) ** 2) { /* ignore it */ }
//    i.e. keep walking/wandering when the only event in earshot lies beyond
//    this archetype's noise-response cap (brutes: aggro * 0.35 ≈ 8.4 m — a
//    gunshot basically at its feet). Alternatively give recentViolence an
//    optional `maxR` param (default Infinity) and `continue` past events
//    farther than maxR — cleaner, but it touches a function every other NPC
//    type shares, so the guard-at-the-call-site version is the safer first
//    pass. Runners' 1.5 is only meaningful if event radii ever shrink; today
//    it is a harmless no-op.
//
// 4. npc.js zombie branch, the Screamer: at the site where `becomeHostile(e,
//    target)` succeeds (the `if (becomeHostile(e, target) && target && ...)`
//    line), before the bite-reaction block:
//      if (!e.screamed && e.T.zombieFlags?.screamOnHostile) {
//        e.screamed = true;
//        noise(p.x, p.z, e.T.zombieFlags.screamOnHostile.r);
//      }
//    `noise` is in scope in npc.js (it's the module's own function, and it is
//    also exported on the system object). `e.screamed` needs no init —
//    undefined is falsy; spawnEnemy's `rec` picks it up per-life, and
//    updateZombiePopulation's dawn clear removes the enemy wholesale.
//    Audio for the scream itself: TASK-081's surface, not this hook.
//
// Visual differentiation (2026-09-26): each archetype carries a `look` (height multiplier, skin,
// clothes) that spawnEnemy hands to characters.js randomZombie — runners bone-pale in red,
// brutes half again as tall and sallow in maroon, screamers hazard-yellow. Colours are chosen to
// read at night (a dark green brute was invisible: a user reported "I didn't see any of the new
// zombies"). Same rig, same animations.
// ---------------------------------------------------------------------------
