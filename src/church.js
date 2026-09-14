// ---------------------------------------------------------------------------
// church.js — a white clapboard church: a nave with a gabled shingle roof, a
// steeple and cross over red doors, steps, and windows down both sides.
// Buildings.glb has no church (its part 9 is an apartment block with shops),
// so every church in the parish is built here.
//
//   makeChurch(ctx, { x, z, rot, length, stainedGlass, name })
//
// (x, z) is the middle of the nave's front wall; the steeple and steps stand in
// front of it. `rot` turns the church so its front faces (sin rot, cos rot),
// world.js style: like every other builder, local +z is the front. ctx needs
// scene and addBlocker.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const WIDTH = 9;
const WALL = 6;
const TOWER_Z = 1.8;

export function makeChurch(ctx, { x, z, rot = 0, length = 16, stainedGlass = true, name = "church" }) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, 0, z);
  g.rotation.y = rot;

  const std = (hex, rough, label, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, name: label, ...extra });
  const white = std(0xf2efe6, 0.8, "painted wood siding");
  const shingle = std(0x3b3f45, 0.75, "shingle roof");
  const add = (geo, mat, px, py, pz, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const box = (w, h, d, mat, px, py, pz) => add(new THREE.BoxGeometry(w, h, d), mat, px, py, pz);
  const gable = (w, h) => new THREE.Shape([new THREE.Vector2(-w, 0), new THREE.Vector2(w, 0), new THREE.Vector2(0, h)]);

  // the nave: front wall at local z = 0, running back to z = -length
  box(WIDTH, WALL, length, white, 0, WALL / 2, -length / 2);
  add(new THREE.ExtrudeGeometry(gable(WIDTH / 2 + 0.9, 3.6), { depth: length + 1, bevelEnabled: false }), shingle, 0, WALL - 0.05, -length - 0.5);
  add(new THREE.ShapeGeometry(gable(WIDTH / 2, 3.0)), white, 0, WALL, 0.56);                    // gable ends
  add(new THREE.ShapeGeometry(gable(WIDTH / 2, 3.0)), white, 0, WALL, -length - 0.56, Math.PI);

  // the steeple, over the doors
  box(3.4, 12, 3.4, white, 0, 6, TOWER_Z);
  box(3.7, 0.3, 3.7, white, 0, 12.1, TOWER_Z);
  box(2.8, 2.4, 2.8, std(0x2a2e33, 0.9, "belfry louvres"), 0, 13.4, TOWER_Z);
  add(new THREE.ConeGeometry(2.2, 7, 4), white, 0, 18.1, TOWER_Z, Math.PI / 4);
  const gold = std(0xd4af37, 0.35, "gilded cross", { metalness: 0.9 });
  box(0.22, 2.2, 0.22, gold, 0, 22.7, TOWER_Z);
  box(1.2, 0.22, 0.22, gold, 0, 23.1, TOWER_Z);
  box(2, 3.2, 0.12, std(0x6b1f1a, 0.6, "red church doors"), 0, 1.9, TOWER_Z + 1.76);
  box(3.6, 0.3, 2.4, white, 0, 0.15, TOWER_Z + 2.9);                                            // steps
  box(3.6, 0.3, 1.2, white, 0, 0.45, TOWER_Z + 2.3);

  // windows down both sides, lit from inside
  const glass = (stainedGlass ? [0xffb060, 0x7fb0ff, 0xff7a6a] : [0xffd9a0]).map((hex) => {
    const m = new THREE.MeshStandardMaterial({ color: 0x1a1410, emissive: hex, emissiveIntensity: 0.9, roughness: 0.3, name: stainedGlass ? "stained glass" : "lit window" });
    m.userData.gtbRealized = true;
    return m;
  });
  let k = 0;
  for (let wz = -2.5; wz > -length + 1; wz -= 3.2) {
    for (const s of [-1, 1]) box(0.1, 2.6, 1.1, glass[k++ % glass.length], s * (WIDTH / 2 + 0.02), 3.4, wz);
  }

  ctx.scene.add(g);

  // collision down the nave and around the tower, in world space
  const at = (lx, lz) => [x + Math.cos(rot) * lx + Math.sin(rot) * lz, z - Math.sin(rot) * lx + Math.cos(rot) * lz];
  for (let lz = -3; lz >= -length + 2; lz -= 5) ctx.addBlocker(...at(0, lz), 4.6);
  ctx.addBlocker(...at(0, TOWER_Z), 2.3);
  return { group: g, door: at(0, TOWER_Z + 3.6) };
}
