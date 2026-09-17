# Improvement survey — 2026-09-17

A point-in-time audit of `src/*` outside the dev-mode map editor (that pass —
ghost preview, undo, free-fly camera, visual asset picker, and a handful of
bugs it turned up — is covered by session notes, not repeated here). Purpose:
give the human a menu to pick from. Cross-references `TODO.md` rather than
duplicating it — that file already tracks most of what a fresh sweep would
find, since three other agents (Codex, Antigravity, Freebuff) are actively
working the backlog.

## 1. Bugs — broken and silent

- **Keseme has no real voice.** `src/voiceCast.js:21-23` — `KESEME`/`KESEM`/`NADIA`
  all point at `referenceId: "TODO_FEMALE_KESEME_PASTE_FISH_AUDIO_REFERENCE_ID"`,
  a literal unfilled placeholder. Keseme is the female protagonist but every
  line on file was generated with the male voice she used to share with Peta;
  the comment above it (already written by a prior agent) has the exact fix —
  paste a real Fish Audio reference ID, then `npm run voiceover -- --force
  --character=KESEME`. Easy to miss because nothing errors; you just never
  hear her.
- **Nolantis map reveal can silently degrade.** `src/nolantis.js:491-505` —
  `getMapCanvas` falls back to a blank `placeholderMap()` if the radar canvas
  isn't ready. Worth a manual check that the "Truth" reveal scene never hits
  this path in the shipped flow; if it does, the payoff moment shows an empty
  map instead of Dixie Beaux's real one.

## 2. Quick wins

Cheapest path to felt improvement — small, isolated, and `TODO.md` already
has acceptance criteria written for each:

| Task | What | Why it's cheap |
|---|---|---|
| TASK-023 | Torch sprites read as flat carved poles; bigger flame frame or a real 3D torch | Isolated visual asset, no system coupling |
| TASK-022 | Re-check the taco stand's draw cost (`Tacos.glb`, ~358 meshes) now that batching (TASK-045) landed | May already be fixed by batching — just needs measuring |
| TASK-029 | Traffic headlights don't share the player's spotlight rig with the nearest oncoming car | Reuses an existing rig, one wiring change |
| TASK-028 | Tune mist/headlight brightness on real hardware | Numbers exist, just untested on a real GPU (blocked on TASK-010) |

Not on the board yet: **`src/multiplayer.js`** is a ~30-line WebSocket client
with no reconnect/backoff — a dropped socket mid-session just sits at
`DISCONNECTED` with no retry. A few lines of exponential-backoff reconnect
would meaningfully improve multiplayer reliability for very little risk.

## 3. Bigger feature opportunities

All grounded in systems that already exist — no new infrastructure needed:

- **TASK-025 — Airboat** for the bayou stretches. The cover art already
  promises one; `vehicles.js` has the pattern to extend.
- **TASK-026 — Drive the escape truck out** instead of an instant win on
  reaching it.
- **TASK-027 — Radio stations** layered on the existing `music.js` soundtrack
  system.
- **TASK-035 — Redneck vs. Hoodrat territorial warfare.** Already has a full
  brief and is in `REVIEW` (built by Antigravity, integrated by Claude,
  headless-tested) — closest thing to a "ready to land" big feature, just
  needs the real-browser pass (TASK-010).
- **TASK-021 — Minimap/waypoint arrow.** Story objectives already carry world
  positions; this is pure UI wiring in `src/minimap.js`. Gets more valuable
  as districts keep multiplying (East Bank, West Parish, state-wide
  expansion are all live now).
- **No free-roam persistence layer.** Story chapters checkpoint themselves
  (`bluelight.js`'s 6-checkpoint run), but there's no save/continue for
  free-roam state (money, reputation, and — if TASK-035 lands — faction
  standing). Worth an explicit decision before an economy or faction-standing
  system ships, rather than discovering the gap after the fact.

## 4. Technical debt / perf

- **TASK-045** (material-signature batching) and **TASK-044** (wet-road
  mirror layer) just landed with large draw-call wins (up to −49% in some
  scenes per `TODO.md`'s numbers) — both are headless-verified only.
  **TASK-010** (real-browser playtest pass) is the one gating task blocking
  several `REVIEW` items from closing to `COMPLETE`; running it converts
  those numbers into a felt check and unblocks the backlog.
- `npc.js`/`traffic.js` look lean — `spatial.js`'s `BlockerGrid` is already
  doing the heavy lifting, no unbounded per-frame loops found. Perf debt is
  concentrated in draw calls (actively being worked), not CPU-side
  simulation.
- **Shared-material trade-off from TASK-045**: batched materials are now
  shared by reference across every mesh using that signature. Any future
  code that mutates a batched material at runtime (a damage-flash effect, a
  paint-color picker, etc.) needs to know this or a mutation will bleed
  across every mesh sharing that material — clone before mutating.

## Net

The team's own backlog (`TODO.md`) already covers most "big idea" territory
better than a fresh pass would — most of what a generic audit would surface
is already a scoped, owned task. The one finding worth acting on immediately
is the Keseme voice placeholder: it's silent, easy to miss until someone
actually plays a voiced scene of hers, and the fix is already spelled out in
the code comment next to it.
