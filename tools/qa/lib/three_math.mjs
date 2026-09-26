// ---------------------------------------------------------------------------
// three_math.mjs — import this from a QA script to get real transforms.
//
// Locally `node_modules/three` is a hand-written STUB whose Matrix4/Object3D/
// Quaternion are no-ops, so three_math_stub.mjs upgrades it in place. CI installs the REAL three
// (ci.yml), which already has correct transforms — and patching it would break it (the stub patch
// defines a prototype `elements` getter, which real Matrix4's constructor can't assign over).
// A real Matrix4 has an own `elements` array from birth; the stub's has none. Only patch the stub.
// ---------------------------------------------------------------------------

import * as THREE from "three";

export const present = true;
export const realThree = new THREE.Matrix4().elements !== undefined;

if (!realThree) await import("./three_math_stub.mjs");
