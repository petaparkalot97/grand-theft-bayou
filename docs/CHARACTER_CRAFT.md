# Making people that hold up — research notes and what we did with them

*(2026-09-26. The ask: "improve the sprites for humans, people in 3D games ... they need to look good not just when stationary, but also when
moving, running, operating vehicles, laying down or dead". Our people are not 2D sprites any more: every ped is the procedural 3D rig in
`src/characters.js` (`Hoodrat`, dressed as a redneck, a suit, a tourist...). So "improving the sprites" means improving that rig, its wardrobe and its
animation.)*

## What the research says (and where it applies here)

**Read the silhouette first.** A stylised character has to read *in motion, at distance, in low light, against a chaotic background*; test at three
distances (close, gameplay-typical ~15 m, recognition threshold 50-100 m) and across canonical poses — idle, attack, traversal, **hit reaction**, and the
ones games forget: seated, prone, dead. Exaggerate the two or three features that identify a role and let the rest go; give each faction/role a
shape-language cue (angular = aggressive, round = friendly) and a value structure of three steps (shadow / mid / highlight). *For us:* a role needs a
silhouette cue, not just a colour swap — a hard hat, a tie and lapels, a cap brim, shades, sleeves — because at 40 m a tinted copy of the same body is the
same person.

**A walk and a run are different gaits.** Locomotion is built from *contact* (foot planted ahead) and *passing* (back foot lifted) poses; on top of that
sit hip bob (highest at passing, lowest at contact), hip roll at half the bob's frequency with the chest counter-rotating, a lean into acceleration (low-pass
filtered so it never snaps), amplitude that scales with speed (damped, not switched), and foot planting so nothing slides. The classic failure is
speed/animation mismatch: *foot sliding*. *For us:* the old clip was one cycle played faster (amplitude clamped to 0.62 rad). Now the gait eases into a run past
~3.6 m/s: forward pitch, higher knee drive, elbows folded, bigger bounce.

**Riders and drivers: partial independence.** A seated vehicle pose is its own state (hands to the bars, knees to the pegs) with a lean that is *not* the
vehicle's (the bike leans 30 degrees, the rider ~20); live foot IK on pedals is rarely worth it because nobody looks there. *For us:* the ride pose exists
and main.js leans it; it was frozen, so a rider read as a statue — it now breathes and sways.

**Hit reactions and deaths are short, one-shot and must end on a readable pose.** A hit reaction is ~0.3-0.5 s: a sharp recoil, head/chest snap, arms flinch,
no return-to-neutral. A death collapses to a *resting* pose that reads as a body lying flat, not a mid-fall freeze — and variety matters, because a crowd that
all falls sideways to the right is the tell. Ragdoll blends are the AAA answer; a hand-built rig can get most of the read with variants + settle + ground contact.
*For us:* three fall kinds per body (side, backwards, forwards onto the face), a flinch before the fall, an ease-in fall with a small bounce on impact, sprawled limbs
per kind, and the body is lifted by its own thickness so it rests **on** the ground (it pivots about its feet, so before it lay half under the floor).

**Cost discipline.** Keep the silhouette across LOD; procedural on top of keyframe/clip is the common setup; do not spend on what the camera never sees.
*For us:* the extra wardrobe pieces are a handful of boxes/cylinders that `mergeRigid` folds into the joint meshes, and materials come from the shared cache.

## What changed (`src/characters.js`, `src/main.js`)

| Area | Change |
|---|---|
| Gait | walk -> run blend (`_run`): torso pitch up to 0.27 rad, knee drive, folded elbows, hip roll/yaw with counter-rotating chest, weight-sink at contact; the idle branch resets it |
| Death | 3 fall kinds x mirrored sides chosen per body; flinch, ease-in, impact bounce, sprawled limbs; rests on the ground (`position.y` lift); `rotation.order` is per-clip (`YXZ` for tilts about the body's own x — `allfours` had been tilting about the world's x) |
| Ride | breathing and sway on the seated pose |
| Wardrobe | `sleeves` / `shortSleeves`, `shirt` + `tie` + lapels + cuffs (suit), `reflective` tape (hi-vis), `hardhat`, `shades`, `slim` trousers; new `plastic` and `glass` surface presets |
| People | redneck, dockworker, mechanic, suit and tourist are now 3D actors (they were tinted copies of the 2D pixel-art redneck / oldman atlases and stuck out); the story's thief too |
| Bikes | the rider you jack or shoot off a bike or scooter is now that same body (it was a fresh random hoodrat/redneck) |

`tools/qa/actor_lab.mjs` renders a row of people — walking, jogging, running, idle, riding, hurt, dying — up in the sky on a plain floor, side / front / run / dead
views, so a change is judged in motion and in the poses that hurt most.

## Not done yet (candidates)

- Foot planting / speed matching from real ground speed (the gait uses measured speed, but the feet still slide a little at speed changes).
- A crawl / prone pose for the living (`allfours` is a podium pose); a proper "lying" state for stealth prone in third person is a scaled body today.
- Head look-at (the head is not a merge joint — see the note in the constructor), so no head turns survive the merge.
- Cloth/secondary motion on hair, loose shirts, chains; a real ragdoll-blended death.
- Face and hand detail; per-role LOD.

## Sources

- [Stylized 3D Characters Done Right: the production-grade art-direction playbook](https://nastyrodent.com/stylized-3d-characters-art-direction-principles/) — silhouette at three distances, shape language, value structure, "read in motion, at distance, in low light".
- [Procedural Animation: Locomotion (Little Polygon)](https://blog.littlepolygon.com/posts/loco1/) — contact/passing poses, hip bob and roll, damped amplitude, lean into acceleration, foot snapping.
- [Procedural Animation in Games: When to Use It (Animworks)](https://anim.works/proceduralanimation/) — layering procedural on authored clips, IK foot placement, hit reactions, ragdoll.
- [Walk Cycle Animation: Game Engine Integration Guide (MoCap Online)](https://mocaponline.com/blogs/mocap-news/walk-cycle-animation) — the eight-pose walk, speed mismatch as the source of foot sliding.
- [Ragdoll Physics in Games: How to Blend Animation (MoCap Online)](https://mocaponline.com/blogs/mocap-news/ragdoll-physics-animation-guide) — short hit/death clips blended into ragdoll, ending on a lying pose.
- [Vehicle Animation for Games: Characters In, On, and Around (MoCap Online)](https://mocaponline.com/blogs/mocap-news/vehicle-animation-games-guide) — seated states, two-bone IK for hands and feet, rider lean independent of the vehicle's.
- [Low Poly Game Art: An Ultimate Guide (Retro Style Games)](https://retrostylegames.com/blog/low-poly-game-art-an-ultimate-guide/), [Low Poly Character Design (Sunday Sundae)](https://sundaysundae.co/how-to-make-low-poly-characters/) — silhouette-first low-poly work, exaggerate the identifying features.
