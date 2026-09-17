# Player & NPC sprites, and how they hold weapons

How every human character in the game is actually built and animated, and
how the weapon system connects to it. Read this before touching character
geometry, animations, or anything about how a gun/bat looks in the player's
hands — most confusion here comes from not realizing there are **two
separate character-rendering systems** and that **the view-model weapon is
not physically attached to the character at all**.

## Two systems, not one

| | 3D procedural rig | 2D billboard sprite |
|---|---|---|
| File | `src/characters.js` | `src/sprite.js` |
| Class | `Hoodrat extends THREE.Object3D` | `AnimatedSprite extends THREE.Object3D` |
| Built from | Primitive `BoxGeometry`/`CylinderGeometry`/`SphereGeometry` assembled into a body, seed + palette driven | A pre-sliced texture atlas (`loadAtlas()`), one quad that swaps frames |
| Used for | Every player character, hoodrats, prostitutes, hobos, thugs, every named story/cutscene character | Rednecks, and several newer NPC "kinds" that reuse the redneck/oldman atlas with a tint (dockworker, mechanic, suit, tourist) |

Both expose the **same interface** — `.play(animName, opts)`, `.update(dt)`,
`.setFlip(x)`, `.material.opacity`, `.finished` — on purpose, so
`npc.js`/`main.js` can drive either one without knowing which it's holding.
This was a deliberate migration (`Hoodrat` is literally commented "a drop-in
replacement for an `AnimatedSprite`"), not an accident — don't assume every
character is one or the other; check `ENEMY_TYPES[type].kind` (see below).

## The procedural rig (`src/characters.js`)

`class Hoodrat` (line 266) is the actual body: a torso, limbs, head, hair,
and clothing, each a primitive mesh, positioned/scaled from a palette object
and a seed so the same builder produces visually distinct people. Its
`update(dt)` (starting ~line 700) is a state machine keyed on `this.anim`:

| `anim` value | What it does |
|---|---|
| `"idle"` / `"walk"` | Standing sway / a walk cycle, legs and arms swinging opposite |
| `"attack"` (line 717) | **One generic animation for everything** — alternating straight punches. Used for the baseball bat swing *and* every gun shot. See "The animation gap" below. |
| `"hurt"` (line 733) | A short flinch |
| `"death"` (line 700) | Folds at the hips and topples; sets `.finished` when done |

Builder functions (bottom of the file, ~line 828 on):

- `makeHoodrat(opts)` — the raw entry point; takes `sex`, `seed`, `height`,
  `skin`, `hair`, `top`, `denim`, `headwear`, `beard`, `curly`, and a `crew`
  palette object (`{cloth, chain, shoe, ...}`).
- `randomHoodrat(rng, height)`, `randomRedneck(rng, height, opts)`,
  `randomProstitute(rng, height, opts)`, `randomHobo(rng, height)` — randomized
  presets for each NPC faction, drawing from that faction's own palette
  arrays (`REDNECK_SKIN`, etc.).
- `makeDeputy(opts)` — the police faction's look.
- `makeCastMember(makeHoodrat, who, extra)` (in `prologue.js`) — named story
  characters (Keseme, Mally, Bubba, Emiko, ...) via a shared `CAST` palette
  table, so a character looks the same in every cutscene and in free roam.

## The 2D sprite system (`src/sprite.js`)

`loadAtlas(name)` fetches a pre-sliced sprite sheet (`APIgqp.jpg` /
`S4KKpl.jpg`, sliced offline by `tools/slice_sprites.py`) and
`class AnimatedSprite` plays frames from it, always facing the camera
(billboarded). Only **rednecks** actually use this for their own atlas;
`dockworker`/`mechanic`/`suit` reuse the `redneck` atlas with a different
tint, and `tourist` reuses `oldman` — see `ENEMY_TYPES` below.

## Player characters (`src/playerCharacters.js`)

`PLAYER_CHARACTERS` holds the 6 playable characters' stats/menu data;
`createPlayerCharacter(id, { makePeta, makeKeseme, makeHoodrat })` is the
*only* place their actual look is configured — each `if (id === "...")`
branch is a `makeHoodrat({...})` call with that character's own seed and
palette (or `makeKeseme()`/`makePeta()` for the two who share Keseme's model
via `makeCastMember`). This is where Chimi's and Sync's looks live if you
need to change them.

## NPC spawning — who becomes what

`ENEMY_TYPES` in `main.js` (~line 1217) is the source of truth for every
non-player character: label, `kind` (which builder to use), stats
(`hp`/`speed`/`aggro`/`melee`/`dmg`/`atkGap`), and — for sprite-kind
entries — which atlas/tint.

`spawnEnemy(typeName, x, z, spot)` (main.js) dispatches on `T.kind`:

```
T.kind === "hog"         → buildHog()            (its own 3D procedural build, not Hoodrat)
typeName === "prostitute" → randomProstitute(rng, T.h)
T.kind === "hobo"         → randomHobo(rng, T.h)
T.kind === "actor"        → randomHoodrat(rng, T.h)
otherwise ("sprite")      → new AnimatedSprite(atlases[T.atlas], T.h) + .setTint(T.tint)
```

`spawnzones.js`'s `ZONE_MIX` decides **which type** spawns in a given zone
(e.g. `urban: { hoodrat: 0.68, redneck: 0.12, prostitute: 0.20 }`) — that's
the file to edit for population mix, not `characters.js`.

Once spawned, `npc.js`'s `decide()`/`update()` is what actually calls
`.play(anim)`/`.setFlip()` on whichever view object it got — it doesn't know
or care if that's a `Hoodrat` or an `AnimatedSprite`, which is the entire
point of the shared interface.

## Weapon interaction

This is where most of the confusion is, so read carefully: **the player's
weapon is not attached to the character.** There are two entirely separate,
independently-positioned pieces:

1. **The character's own body animation** — `characters.js`'s `Hoodrat`
   plays `"attack"` (melee) or `"shoot"` (guns) on the player's own body,
   driven from `fire()` in `main.js`. This is the same generic
   alternating-punches animation for *everything* — a bat swing looks the
   same as firing a pistol, which looks the same as firing a shotgun. This
   is the root of "the animations look bad" — there is currently exactly one
   attack animation in the entire game.
2. **The view-model weapon** — `src/weapons_3d.js`. A completely separate
   `THREE.Group` (`weaponPivot`) that is **not parented to the character or
   any hand bone** (the `Hoodrat` rig has no bones/skeleton at all — it's
   rigid primitive meshes with pivots, not a rig a weapon could attach to).
   Instead, `updateWeapon3D(playerPos, aimDir, stateWeapon, dt, isAiming,
   hidden)` (called every frame from `main.js`'s `tick()`) repositions the
   pivot to `playerPos + (0, 1.1, 0)` (a fixed "shoulder height" offset) and
   orients it to face `aimDir`, independently of whatever the character's
   arms are actually doing. **This is why a held weapon can look
   disconnected from the character** — it's two unlinked objects animated
   by two unrelated systems, not one skinned mesh. Fixing this properly (a
   weapon that visually reads as *in the character's hand*, not floating at
   shoulder height near it) needs either a real attachment point on the rig
   or hand-tuned per-animation-frame offsets — it's not a quick fix.
   - `hidden = state.cinematic || !!state.veh` — the view-model is hidden
     during cutscenes and while driving, visible the rest of the time
     (visibility isn't gated on aiming — it's meant to always show while on
     foot).
   - `weapons_3d.js` builds one procedural model per weapon id (`bat`,
     `pistol`, `tec9`, `sawnoff`, `deerRifle`); an unrecognized id falls back
     to the pistol proxy. The deer rifle can load a real glTF model
     (`assets/models/weapons/gangster_rifle`) over its procedural fallback.

### The arsenal (`src/weapons.js`)

One weapon slot, not a full inventory: `state.weapon` (the equipped id),
`state.ammo` (current clip), `state.reserve` (an object keyed by weapon id,
ammo not yet chambered). `WEAPONS` defines each gun's `damage`/`cooldown`/
`range`/`clip`/`maxReserve`; the bat has `melee: true, clip: Infinity`.
`createArsenal({ state, flashObjective })` now also seeds a small starting
`reserve` (one clip's worth) for every gun so `cycleWeapon()` (mouse wheel)
can reach all of them from the start of a game — a deliberate diagnostic
default, not a design decision about the shipped starting loadout.

### `fire()` (`main.js`, ~line 2420) — what happens on a shot

1. Requires `input.isDown("aim")` (right-click) unless already in a vehicle.
2. Picks a target: the nearest hostile/facing enemy, sheriff, or **vehicle**
   within `gun.range`, scored by distance and how close to dead-ahead it is
   (`bestKind` = `"enemy"` / `"sheriff"` / `"vehicle"`). Shooting cars
   already works — `bestKind === "vehicle"` calls `damageVehicle(best,
   gun.damage * 1.5)`.
3. Plays the character's body animation (`player.play("attack"|"shoot", ...)`)
   and the view-model's (`playFireAnim3D(gun.melee)`).
4. For guns: spawns a tracer + muzzle flash, and plays a **weapon-specific
   sound** via `cine.sfx(WEAPON_SFX[state.weapon])` — `WEAPON_SFX` (just
   above `fire()`) maps each gun id to a distinct procedural sound kind
   defined in `cinema.js`'s `sfx()`: `pistolShot` (crisp mid crack),
   `tec9Shot` (short, tinny, quiet — it fires fast), `shotgun` (the
   sawed-off's existing boomy sound), `rifleShot` (a sharp crack with an
   extra high-frequency "snap" layer). These are synthesized noise bursts
   through a filter, the same technique `cinema.js` already used for
   siren/squeal/chime — no audio files.
5. Applies damage via `arsenal.consume()` (ammo) and the relevant
   `hp -=`/`damageVehicle()` call.

### The HUD (`weapons.js`'s `render()`)

Shows the equipped weapon's icon (`assets/ui/weapons/WEAPON_*.png`, a GTA
San Andreas-style icon set) plus `clip-reserve` for guns. **The bat has no
real icon asset** — nothing named "baseball bat" exists anywhere in
`assets/`; it used to fall back to `unarmed.png` (a bare-fists icon), which
read as "you're using your fists" even with the bat equipped and working
correctly. Fixed by drawing a small inline SVG bat icon (a `data:` URI in
`weapons.js`, no new binary asset) rather than leave the fists icon in place.

## Known gaps (as of 2026-09-17)

- **One generic attack animation for everything.** No distinction between
  the bat swing, a one-handed pistol/Tec-9 shot, and a two-handed shotgun/
  rifle shot — on the character body *or* the view-model. This is TASK-044
  in `TODO.md` (briefed for Freebuff, not yet built): add a `grip` field to
  `WEAPONS` (`melee`/`one`/`two`) and three real pose sets instead of the
  single punch cycle.
- **The view-model isn't kinematically attached to the character.** See
  above — it's a real, structural limitation of the current rig (no bones),
  not a bug with a one-line fix.
- **The `Hoodrat` rig itself reads as "blocky"/"Roblox-like"** to the human
  (primitive-geometry construction, not a sculpted/skinned model) — TASK-043
  in `TODO.md` (briefed for Antigravity, not yet built).
