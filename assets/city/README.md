# Crayon City Architecture

Ten ready-to-place city buildings — from a suburban cottage to a downtown skyscraper — covering homes, work, food, retail, education, health, and emergency services. Every model ships with baked compound collision, embedded materials, and a low-poly triangle budget tuned for web games.

## Folders

- `models/textured`: GLB files with embedded procedural surface textures.
- `models/flat`: GLB files with texture maps disabled and the same material palette.
- `manifest.json`: dimensions, triangle counts, texture state, and collider counts.
- `COLLISIONS.md`: the portable `crayon.collider.v2` contract.

GLB is the primary format: it keeps hierarchy, PBR materials, embedded textures,
and collision metadata together in one file. Units are metres, Y-up, with a
ground-centred pivot on every model.
