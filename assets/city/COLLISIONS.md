# Collision guide

Every model contains baked compound box geometry under a node named `Colliders`.
Each child is named `Collider_XX`, carries `crayon.collider.v2` metadata, and uses
an invisible unlit material. The model root also includes the complete collider
manifest in `userData.collider` / glTF `extras.collider`.

Use the collider children as static boxes for buildings, trees, ground, and street
props. Vehicles ship with the same compound representation so you can replace it
with a chassis-specific dynamic collider later without changing the visual mesh.

OBJ files store the same manifest in a `# crayon-collider-v2` header and include
the collider boxes as named objects. GLB is recommended because it preserves PBR
materials, embedded procedural textures, hierarchy, units, and metadata in one file.

Coordinate contract: metres, Y-up, ground-centred pivot. Colliders are local-space,
non-trigger boxes. Import helpers should hide the `Colliders` group after creating
physics bodies.
