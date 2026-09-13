// ---------------------------------------------------------------------------
// merge.js — draw-call reduction.
//
// Measured: ~1,260 draw calls a frame for ~1,400 meshes, because every mesh is
// drawn by several passes (shadow map, main view, GTAO normals, road mirror).
// Two cures, neither of which changes what anything looks like:
//
//   mergeRigid   — a procedural character is ~50 little meshes, but only its
//                  joints move. Parts that ride the same joint and share a
//                  material become one mesh.
//   batchStatic  — props that never move are merged per material, per spatial
//                  chunk, so frustum culling still drops what is off-screen.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const _m = new THREE.Matrix4();

function attrKey(geo) {
  return Object.keys(geo.attributes).sort().join(",") + (geo.index ? "|i" : "|n") +
    (Object.keys(geo.morphAttributes).length ? "|morph" : "");
}

/** Transform of `node` expressed in `ancestor`'s space. */
function relativeMatrix(node, ancestor, out) {
  out.identity();
  for (let o = node; o && o !== ancestor; o = o.parent) {
    o.updateMatrix();
    out.premultiply(o.matrix);
  }
  return out;
}

function mergeInto(parent, entries, material, template) {
  const merged = mergeGeometries(entries.map((e) => e.geo), false);
  if (!merged) return null;                 // incompatible attributes: leave as-is
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, material);
  mesh.castShadow = template.castShadow;
  mesh.receiveShadow = template.receiveShadow;
  mesh.renderOrder = template.renderOrder;
  parent.add(mesh);
  for (const e of entries) e.mesh.parent.remove(e.mesh);
  return mesh;
}

/**
 * Merge the rigid parts of an articulated object. Each mesh is assigned to its
 * nearest ancestor in `joints` and baked into that joint's space; meshes with
 * no joint above them (a contact-shadow blob on the root, say) are untouched.
 * Returns the number of meshes removed.
 */
export function mergeRigid(root, joints) {
  const jointSet = new Set(joints);
  const groups = new Map();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    let joint = o.parent;
    while (joint && !jointSet.has(joint)) joint = joint.parent;
    if (!joint) return;
    const key = joint.uuid + "|" + o.material.uuid + "|" + attrKey(o.geometry) + "|" + o.castShadow;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { joint, material: o.material, template: o, entries: [] }));
    g.entries.push({ mesh: o, geo: o.geometry.clone().applyMatrix4(relativeMatrix(o, joint, _m)) });
  });
  let removed = 0;
  for (const g of groups.values()) {
    if (g.entries.length < 2) continue;
    if (mergeInto(g.joint, g.entries, g.material, g.template)) removed += g.entries.length - 1;
  }
  return removed;
}

/**
 * Merge static meshes under `scene` by material, in `cell`-metre chunks.
 * `exclude(root)` skips a whole top-level object (vehicles, NPCs, anything
 * animated). Shader materials, multi-material meshes, mirrored transforms and
 * the wet-road asphalt (fx.js hides those meshes by reference) are left alone.
 */
export function batchStatic(scene, opts = {}) {
  const cell = opts.cell || 48;
  const exclude = opts.exclude || (() => false);
  const groups = new Map();
  const center = new THREE.Vector3();
  let seen = 0;
  scene.updateMatrixWorld(true);

  for (const root of scene.children) {
    if (!root.visible || exclude(root)) continue;
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) return;
      const m = o.material;
      if (!m || Array.isArray(m) || m.isShaderMaterial) return;
      if (m.userData.surfaceKind === "asphalt" || o.userData.noBatch) return;
      for (let p = o; p; p = p.parent) if (!p.visible) return;
      if (o.matrixWorld.determinant() < 0) return;  // mirrored: winding would flip
      seen++;
      if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      center.copy(o.geometry.boundingSphere.center).applyMatrix4(o.matrixWorld);
      const key = [m.uuid, attrKey(o.geometry), o.castShadow, o.receiveShadow, o.renderOrder,
        Math.floor(center.x / cell), Math.floor(center.z / cell)].join("|");
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { material: m, template: o, entries: [] }));
      g.entries.push({ mesh: o, geo: null });
    });
  }

  let removed = 0, batches = 0;
  for (const g of groups.values()) {
    if (g.entries.length < 2) continue;
    for (const e of g.entries) e.geo = e.mesh.geometry.clone().applyMatrix4(e.mesh.matrixWorld);
    const mesh = mergeInto(scene, g.entries, g.material, g.template);
    if (!mesh) continue;
    mesh.matrixAutoUpdate = false;             // identity forever
    mesh.name = "static-batch";
    removed += g.entries.length - 1;
    batches++;
  }
  return { meshes: seen, removed, batches };
}
