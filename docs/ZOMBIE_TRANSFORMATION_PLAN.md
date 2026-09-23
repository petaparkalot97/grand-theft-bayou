# Grand Theft Bayou → Zombie Survival Nightmare: transformation master plan

**Author:** Claude (orchestrator) · **Date:** 2026-09-23 · **Status:** DRAFT — first
pass, sequenced for the next wave of tasks, not the whole roadmap at once.

> Human directive (2026-09-23, verbatim intent): evolve the existing GTA-style
> open world into "Grand Theft Bayou after the world collapsed" — not "Grand
> Theft Bayou but with zombies everywhere." Preserve the existing foundation;
> layer Zombie Mode on top of Free Roam as a real game mode, not a separate
> game. Claude orchestrates; Antigravity and Freebuff implement; the human
> decides anything ambiguous.

**Read first:** [`AGENT_PROTOCOL.md`](../AGENT_PROTOCOL.md) (the actual rules —
this plan doesn't override it), [`docs/ARCHITECTURE.md`](ARCHITECTURE.md),
[`docs/WORLD_BUILDING.md`](WORLD_BUILDING.md), and `TODO.md` → TASK-077
(Zombie Mode's first pass, already `REVIEW`).

---

## 1. Existing architecture (grounded, not assumed)

This is a vanilla Three.js r160 game, ES modules, no bundler
(`AGENT_PROTOCOL.md` §6). The world is much bigger than a single town:

- **US-167 corridor** (`main.js`): Tusouxroe → the Strip → Chatboro (start) →
  the bayou causeway → OrleaRouge.
- **OrleaRouge** (`orlearouge.js`): the city proper — French District, downtown
  towers, hospital, cemetery (`cemetery.js`), casino riverboat.
- **The Crown Strip** (`tusouxroeNorth.js`, TASK-070): five casinos, nine
  bars/clubs, its own nightlife crowd system (`crowd.js`, `nightlife.js`,
  `interiors.js`).
- **Parish Highway 9 / the rural west** (`westparish.js`): Bayou Noir (general
  store, church, shacks, cane fields — hogs live here, not downtown).
- **Lafourchette / East Bank** (`eastbank.js`): Cypress Heights (residential),
  Market Row (cafe/market/hospital/civic), Port Mercer (offices/garage/fire
  station/service yard).
- **The state-wide expansion** (`stateWorld.js`): Port Calypso & Docks, Cypress
  Hills & Red Dust Badlands, Lakeshore Marsh & Causeway, Oyster Bay — a ~5km×5km
  connected state, each region reachable by a named highway/pass.
- **Nirbayou Nolantis** (`nolantis.js`): a sealed cavern set, outside `MAP`
  bounds, its own lighting/render rules.
- Story chapters (`prologue.js`, `actone.js`, `bluelight.js`, `nolantis.js`)
  are phase machines chained by `ctx.startNext`.

Core systems, already read this session (not re-derived from docs):

| System | File | What it actually does |
|---|---|---|
| The one clock | `worldtime.js` | `hours`, `isNight()` (≥22:00 or <5:00 — **not** the same threshold as the visual sky model), `dusk`, `setTime`, `onHour`. |
| Sky/lighting by hour | `daycycle.js` | Pure function `skyState(hour)` → sun elevation/azimuth, light color/intensity, fog, mist, exposure, lamps-on. Frozen to the 19:30 golden look for all of dawn→19:30 as of TASK-075 (a deliberate brightness fix, not a bug to "restore"). |
| NPC behavior | `npc.js` | Civilians by default (`DEFAULT_AGGRESSION = 0`); `idle/loiter/wander/flee/hostile`; LOD by distance; a shared `hostiles` counter capped by `MAX_HOSTILE` (now a **live getter**, not a constant — see §10). |
| Faction war | `factions.js` | Redneck-vs-Hoodrat turf fights via `becomeHostile(a,b)` pairing — the existing precedent for "NPC attacks NPC," which the zombie branch reuses. |
| Spawn classification | `spawnzones.js` | `zoneAt(x,z)` → zone name, `ZONE_MIX` → weighted civilian types per zone, `pick(focus, living, {minDist,maxDist})` → an out-of-sight spawn point + a suggested `kind`. |
| Ambient population | `main.js` `updateEnemyPopulation` | Top-up spawner, `ENEMY_CAP = 48`, culls anything >160m from the player. |
| Loot | `loot.js` | `LOOT_TABLES` keyed by NPC type; pooled ground pickups. |
| Weapons | `weapons.js` | One slot, `state.weapon`/`state.ammo`; Free Roam grants `Infinity` (checked live, not a one-time grant). |
| Police | `police.js` + `main.js` | Fully reactive — gated by one function, `copsActive()` — never ambient. |
| Vehicles | `vehicles.js` | Arcade model, `DRIVE` tuning, `collisionResponse` sets `v.impact`; crash damage tuned in TASK-076 (`CRASH_MIN_IMPACT`, `CRASH_DAMAGE_SCALE`). |
| Multiplayer | `multiplayer.js` + `server/` | **Real**, server-authoritative, 20Hz snapshots, 4 players, room codes. Combat/NPC/mission authority are explicitly *not* done yet (README). |
| Performance | `merge.js`, `spatial.js` | `batchStatic`/`mergeRigid`, a blocker grid, static-light pooling (nearest 8). Anything that moves must stay out of `batchStatic`. |

**Zombie Mode already exists as a first pass** (TASK-077, `REVIEW`, not yet
verified live):
- `state.zombieMode` flag, its own menu button, jumps the clock to 22:30.
- `ENEMY_TYPES.zombie` (`main.js`) reskins the Hoodrat rig (`randomZombie()`,
  `characters.js`) — no new art.
- `npc.js` gives zombies their own `decide()` branch: hunts the nearest of
  {player, any living NPC} within `aggro` range, never calms down once
  hostile, converges on `recentViolence()` (gunfire/kills already call
  `npcs.noise()` — the "noise attracts the horde" mechanic is real today, not
  aspirational).
- `MAX_HOSTILE` is now a **getter** (`() => state.zombieMode ? 20 : 7`) so the
  horde isn't capped by the ordinary 7-assailant street-fight budget.
- `updateZombiePopulation()` (`main.js`): its own capped population (16),
  counted separately from the 48-civilian cap, out-of-sight spawn ring reused
  from `spawnzones.pick`, dawn wipe.
- Cops are fully disabled in zombie mode (`copsActive()` returns `false`,
  `checkHeatUp()` no-ops).

This plan is the **next wave on top of that foundation**, not a redesign of it.

---

## 2. Existing systems we can reuse as-is

- **`npcs.noise()` / `recentViolence()`** — the noise abstraction Phase 3 of
  the original brief asks for already exists (gunfire: 26-40 units, a kill:
  30, a turf clash: 18). It needs *tuning and more call sites* (vehicle
  collisions, sprinting), not a rewrite.
- **`becomeHostile(a, b)` pairing** (`factions.js`'s pattern) — any future
  "X attacks Y" mechanic should reuse this, not invent a parallel system.
- **`spawnZones.pick()`** — out-of-sight, zone-aware placement already solves
  "never spawn directly in front of the player" (Phase 5's ring uses
  `minDist`/`maxDist`; it already excludes highway/water zones).
- **The klan.js ctx pattern** — a self-contained module that takes an
  injected `ctx` (scene, state, spawnEnemy, addBlocker, poolLight, isNight,
  etc.) from `main.js` and owns its own set pieces. This is the template every
  new zombie-adjacent module (safehouses, outbreak storytelling, dynamic
  events) should follow, instead of writing directly into `main.js`.
- **`batchStatic`/blocker grid** (`merge.js`, `spatial.js`) — any new prop
  work (Phase 8/9) must register through these, not add raw meshes.
- **Loot pooling** (`loot.js`'s `spawn`/`release`/`MAX_ACTIVE`) — contextual
  loot (Phase 7) extends the existing table shape, doesn't reinvent pickups.

## 3. Systems that need modification (not replacement)

- **`spawnzones.js`** — needs a *parallel* zombie-density table keyed by the
  same zone names `ZONE_MIX` already uses (§10, TASK-079). Additive only.
- **`loot.js`** — needs a *second* table keyed by location kind, alongside the
  existing NPC-keyed one (§10, TASK-080). Additive only.
- **`audio.js`** — needs a zombie-ambience layer function Claude can call from
  `updateZombiePopulation`. Additive (§10, TASK-081).
- **`npc.js`'s zombie branch** — currently one archetype. Needs archetype
  *data* (stat/behavior deltas), not a new state machine — the existing
  `IDLE→WANDER→HOSTILE` shape already covers what Phase 2's fuller state list
  (`INVESTIGATE/ALERT/CHASE/ATTACK/STAGGER`) is trying to express; collapsing
  those into flags on the existing states is less risk than a parallel state
  machine. **Claude's call to make at integration time**, not an agent's.

## 4. Systems that need new modules

- `src/zombies.js` (or similar — final name is whichever agent's task settles
  on, per `AGENT_PROTOCOL.md`'s "don't blindly use example filenames") —
  archetype table + any zombie-specific data that doesn't belong inlined in
  `main.js`'s `ENEMY_TYPES`.
- `src/safehouses.js` — visually distinct safe locations, klan.js-style ctx
  module (§10, TASK-082).
- `src/outbreak.js` — environmental storytelling props, klan.js-style ctx
  module (§10, TASK-083).
- A later `src/zombieEvents.js` for Phase 15's dynamic encounters — **not
  scoped this wave**; needs the above landed first.

## 5. Existing technical debt (found, not invented)

- **`TODO.md` itself has drifted.** It's ~4,950 lines. The "File / subsystem
  locks" table near the bottom still shows TASK-039/041/070-era locks as
  current; the "Review queue" and "Completed tasks" sections stop around
  TASK-045. New tasks have been prepended under "ACTIVE TASKS" at the top
  without the older bookkeeping sections being kept in sync. **This plan does
  not attempt to fix that archive** — rewriting 4,950 lines of another agent's
  history is exactly the kind of unrequested large-scale change
  `AGENT_PROTOCOL.md` warns against. Flagged here as a `BLOCKERS /
  DECISIONS NEEDED` candidate for the human: either accept the top section as
  the only live truth going forward, or dedicate a task to archiving
  everything below a cut line into `docs/TODO_ARCHIVE.md`.
- **Two different "is it night" thresholds** (`worldtime.js`'s `isNight()` at
  22:00 vs. `daycycle.js`'s visual dusk ramp reaching full dark closer to
  21:00) already caused one near-miss this session (zombie mode's initial
  `setTime(21)` would have looked dark but spawned nothing). Any future
  night-gated system must use `worldTime.isNight()` for gameplay logic, the
  visual model is cosmetic only. Worth a code comment at both definitions
  cross-referencing each other — small, cheap, not scoped as its own task.
- **`docs/ARCHITECTURE.md` and `README.md` are stale in places**: `ENEMY_CAP`
  is documented as 30, it's actually 48; the zone table is missing
  `entertainment`/`industrial`/`corporate`/`resort`/`border_*`; the minimap
  blip list still says "gas cans, the escape truck" (removed in TASK-074).
  Not urgent, but a Freebuff-sized doc-cleanup task later.
- **The gas-can/escape-truck free-roam objective was already removed**
  (TASK-074) — if anyone's plan assumes it still exists, it doesn't.

## 6. Major risks

- **Scope creep into "rebuild the game."** The human's own instructions here
  are explicit: don't replace the map, don't replace the engine, don't turn
  this into a crafting simulator. Every task below is additive to what
  exists.
- **`main.js` contention.** It's the one file every feature wants to touch,
  and only Claude may. Every agent task in §10 is scoped to new/additive
  files specifically to keep Antigravity and Freebuff out of it; Claude does
  the wiring afterward as its own short, reviewable diff.
- **Un-verified-live debt is already stacking up.** TASK-073 through TASK-077
  are all `REVIEW`, `node --check`ed only — no GPU/Chromium available in these
  sessions. Before layering more zombie-mode systems on top, someone with a
  real browser needs to actually play a zombie-mode session. This is now the
  single biggest risk to the whole plan: every number in TASK-077 (hp, speed,
  aggro, caps) is a guess.
- **Design decisions dressed as engineering tasks.** Phase 4's CRAWLER
  archetype ("a downed shambler that keeps crawling") is a real design
  question (is it a death replacement, a distinct spawn, or a stagger state?)
  — flagged to Freebuff as an open question in TASK-078, not pre-decided here.
  Phase 6's survival resources (food/water/fuel) are explicitly **not**
  scoped this wave — that's a product decision for the human, not something
  to infer from a mega-brief.

## 7. Performance risks

- `updateZombiePopulation`'s cap (16) is a first-pass guess, additive to the
  existing 48-civilian population — a zombie-mode night can have ~64 concurrent
  NPCs. Given `ENEMY_CAP` was already sized against real draw-call budgets
  (TASK-042's comment: "measured ~2.4k draw calls, still under the ~4.5k
  driving budget guardrail"), this needs a real measurement, not an assumption
  that 16 more actors is free.
- Zombies reuse the Hoodrat rig, which already goes through `mergeRigid`
  (per-joint baking) — good, no new draw-call category introduced.
- Any new environmental prop work (§10, TASK-083) must go through
  `batchStatic`/culling clusters exactly like East Bank did, not raw
  `scene.add()` — this is stated explicitly in that task's acceptance
  criteria.
- District-aware zombie density (§10, TASK-079) should also serve as a
  performance lever: don't spawn horde-density zombies in every zone
  regardless of whether the player's actually near enough to see them —
  reuse the existing out-of-sight ring, don't invent a second spawn path.

## 8. Multiplayer considerations

Per README, the server already owns rooms/ready-state/20Hz movement, but
**combat, NPCs and mission authority are not yet server-authoritative** — an
explicitly acknowledged gap, not something this plan needs to solve. Per the
human's own Phase 18: make Zombie Mode solid in single-player first. Concretely:
- Nothing in TASK-077's zombie system currently touches `multiplayer.js`.
- When multiplayer combat authority eventually lands, zombies would need to
  become server-tracked entities like any other NPC — the existing `enemies`
  array + `npc.js` state machine is already the right shape for that (it's
  data, not view-coupled), so no architecture change is anticipated, just a
  future task once the base multiplayer-combat work exists. **Not scoped now.**

## 9. Map/detail opportunities (grounded in what's real)

Real districts with real personality already exist — the transformation should
lean on them, not invent parallel generic ones:

| District | Existing identity | Outbreak/zombie opportunity |
|---|---|---|
| Chatboro (start) | trailer park, junkyard, swamp edge | player's first impression — outbreak storytelling should start here (TASK-083) |
| The Strip | gas stations, Popeyes, BurgerPiz, Tacos, 6twelve | contextual loot (TASK-080) is obvious here; abandoned-vehicle roadblock beats |
| Tusouxroe | Main Street shopfronts, potholed streets | small-town evacuation beats; residential loot |
| OrleaRouge | French District, downtown, hospital, cemetery, casino | hospital = medical loot; dense urban = highest zombie density (TASK-079) |
| Crown Strip | 5 casinos, 9 bars/clubs, `crowd.js` nightlife | "high-risk nightlife outbreak" fits literally — TASK-070's crowd system already seats/staffs venues, a natural place for a horde to have torn through |
| Bayou Noir / Parish Hwy 9 | general store, church, cane fields, hogs | low-density, ambush/isolation flavor; general-store loot |
| East Bank (Cypress Heights/Market Row/Port Mercer) | residential loop, civic market, industrial service yard | Port Mercer's fenced service yard is a strong safehouse candidate (TASK-082) |
| Port Calypso & Docks, Cypress Hills & Badlands, Lakeshore Marsh, Oyster Bay (`stateWorld.js`) | industrial port, off-road canyon/quarry, swamp outskirts, coastal town w/ hospital | not touched this wave — flagged for a later pass once the core loop is proven in the original map |

## 10. Zombie Mode architecture — what exists, what's next

```
state.zombieMode (main.js)
  ├─ menu entry (index.html #zombieBtn) ─┐
  ├─ worldTime.setTime(22.5) on launch    │  DONE (TASK-077)
  ├─ ENEMY_TYPES.zombie (main.js)         │
  ├─ randomZombie() (characters.js)       │
  ├─ npc.js zombie decide() branch        │
  ├─ updateZombiePopulation (main.js)     │
  └─ copsActive() disabled                ┘
        │
        ├─ TASK-078 zombie archetypes (Freebuff, new module, data only)
        ├─ TASK-079 district-aware density (Freebuff, spawnzones.js, additive)
        ├─ TASK-080 contextual loot (Freebuff, loot.js, additive)
        ├─ TASK-081 ambient audio layer (Freebuff, audio.js, additive)
        ├─ TASK-082 safehouses (Antigravity, new module)
        └─ TASK-083 outbreak storytelling, Strip+Chatboro (Antigravity, new module)
              │
              └─ Claude integrates all six into main.js/npc.js as reviewed,
                 self-contained wiring diffs, one at a time, after each is
                 in REVIEW.
```

None of the six tasks below touch `main.js`. Each hands Claude an interface
contract (`AGENT_LOG.md` → Interface contracts) to wire in.

## 11. Recommended implementation order

1. **A real playtest of TASK-077 first**, if at all possible, before adding
   more on top of unverified numbers. This is a human/GPU dependency, not an
   agent task — flagged in `TODO.md` → Blockers.
2. TASK-079 (density) and TASK-080 (loot) — no dependencies, disjoint files,
   safe to run in parallel with each other and with TASK-081.
3. TASK-078 (archetypes) — best done once TASK-079's density table exists, so
   archetype mix can vary by zone too, but not hard-blocked; can start in
   parallel and reconcile at integration.
4. TASK-081 (audio) — parallel-safe with everything above.
5. TASK-082 (safehouses) and TASK-083 (outbreak dressing) — both
   Antigravity, both new modules, **sequence them rather than run
   simultaneously** if they'd plausibly touch the same stretch of world
   (Chatboro/the Strip) — Claude to confirm placement before the second one
   starts, per `AGENT_PROTOCOL.md`'s conflict rule (same *world space*, not
   just same file, is worth a check here even though the rule is written
   about files).
6. Claude integrates each as it reaches `REVIEW`, in the order above,
   `node --check` + a headless QA pass per `AGENT_PROTOCOL.md` §6 before
   marking `COMPLETE`.

## 12. Agent task breakdown

See `TODO.md` → ACTIVE TASKS for the actual claimable briefs: **TASK-078**
through **TASK-083**, written to the `AGENT_PROTOCOL.md` §5 template. Summary:

| Task | Owner | Files (new/additive only) | Depends on |
|---|---|---|---|
| TASK-078 | Freebuff | `src/zombies.js` (new) | TASK-077 (REVIEW) |
| TASK-079 | Freebuff | `src/spawnzones.js` (additive export) | none |
| TASK-080 | Freebuff | `src/loot.js` (additive export) | none |
| TASK-081 | Freebuff | `src/audio.js` (additive export) | TASK-077 (context) |
| TASK-082 | Antigravity | `src/safehouses.js` (new) | none to start; TASK-079 for full integration |
| TASK-083 | Antigravity | `src/outbreak.js` (new) | none; sequence vs. TASK-082 by world space |

---

## Explicitly not scoped this wave (flagged, not forgotten)

- Phase 6 survival resources (food/water/fuel) — **needs a human decision**:
  do we actually want a resource-management layer, or does that contradict
  "not a crafting simulator"? Added to `TODO.md` → Blockers.
- Phase 15 dynamic events module — depends on TASK-082/083 landing first.
- Phase 16's "night should increase tension without just raising zombie HP" —
  a design principle to hold future tasks to, not a task itself.
- Phase 17 HUD extension — nothing to extend yet (no survival resources
  scoped, see above); revisit once/if Phase 6 is decided.
- Phase 18 multiplayer authority — explicitly deferred per the human's own
  brief; single-player first.
- Phase 19 deep performance instrumentation beyond what F3/`perf` already
  gives — revisit after TASK-077 gets a real playtest and real numbers.
- Full QA harness additions (Phase 20) — one task per landed feature above is
  more honest than a speculative QA suite for systems that don't exist yet;
  each task's own acceptance criteria should include its test, not a
  separate QA task.
