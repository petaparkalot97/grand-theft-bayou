// ---------------------------------------------------------------------------
// three_math.mjs — real transforms on top of the local three stub.
//
// `node_modules/three` here is a hand-written STUB (see its comments): it exists
// so headless QA can load the game's modules and check call flow, and its
// Matrix4/Object3D/Quaternion are deliberately no-ops. That is fine for "did the
// district build", and useless for "is the gun in the hand", because that
// question IS a transform question.
//
// So this module upgrades the stub in place — prototype methods only, nothing
// about the stub's shape changes — to real column-major matrix math and real
// scene-graph composition:
//
//   vector · quaternion · 4×4 matrix · Object3D matrixWorld propagation
//
// Nothing else in the repo is affected: every other QA script keeps the
// no-op stub it was written against, because this only patches when imported.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const { Vector3, Quaternion, Matrix4, Object3D, BufferGeometry } = THREE;

// The stub's BufferGeometry has no `index` property at all, so merge.js's
// `entries[0].geo.index !== null` test reads `undefined !== null` -> "indexed"
// and then reads `.count` off undefined. Real three defaults it to null.
if (!("index" in BufferGeometry.prototype)) {
  Object.defineProperty(BufferGeometry.prototype, "index", { get() { return null; }, configurable: true });
}

// ---------------------------------------------------------------- Vector3
const V = Vector3.prototype;
V.subVectors = function (a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; };
V.addVectors = function (a, b) { this.x = a.x + b.x; this.y = a.y + b.y; this.z = a.z + b.z; return this; };
V.crossVectors = function (a, b) {
  const ax = a.x, ay = a.y, az = a.z, bx = b.x, by = b.y, bz = b.z;
  this.x = ay * bz - az * by; this.y = az * bx - ax * bz; this.z = ax * by - ay * bx; return this;
};
V.applyQuaternion = function (q) {
  const { x, y, z } = this, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return this;
};
V.applyMatrix4 = function (m) {
  const e = m.elements, { x, y, z } = this;
  const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15] || 1);
  this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
  this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
  this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
  return this;
};
V.setFromMatrixPosition = function (m) { const e = m.elements; return this.set(e[12], e[13], e[14]); };
V.setFromMatrixColumn = function (m, i) {
  const e = m.elements;
  return this.set(e[i * 4], e[i * 4 + 1], e[i * 4 + 2]);
};
V.setFromMatrixScale = function (m) {
  const e = m.elements;
  return this.set(Math.hypot(e[0], e[1], e[2]), Math.hypot(e[4], e[5], e[6]), Math.hypot(e[8], e[9], e[10]));
};
V.negate = function () { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; };
V.lerpVectors = function (a, b, t) { return this.subVectors(b, a).multiplyScalar(t).add(a); };
// Euler.setFromQuaternion, XYZ order — used by the rotation/quaternion sync
// below. (The stub's "Euler" is a Vector3, so it is a method here instead.)
V.setFromQuaternion = function (q) {
  const clamp = (v) => (v < -1 ? -1 : v > 1 ? 1 : v);
  const t0 = 2 * (q.w * q.x + q.y * q.z), t1 = 1 - 2 * (q.x * q.x + q.y * q.y);
  const t2 = clamp(2 * (q.w * q.y - q.z * q.x));
  const t3 = 2 * (q.w * q.z + q.x * q.y), t4 = 1 - 2 * (q.y * q.y + q.z * q.z);
  this.x = Math.atan2(t0, t1); this.y = Math.asin(t2); this.z = Math.atan2(t3, t4);
  return this;
};

// ---------------------------------------------------------------- Quaternion
const Q = Quaternion.prototype;
Q.identity = function () { this.x = 0; this.y = 0; this.z = 0; this.w = 1; return this; };
Q.copy = function (q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; };
Q.clone = function () { return new Quaternion(this.x, this.y, this.z, this.w); };
Q.set = function (x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; };
Q.setFromAxisAngle = function (axis, angle) {
  const h = angle / 2, s = Math.sin(h);
  this.x = axis.x * s; this.y = axis.y * s; this.z = axis.z * s; this.w = Math.cos(h); return this;
};
Q.setFromEuler = function (x, y, z, order = "XYZ") {
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  if (order === "YXZ") {
    this.x = s1 * c2 * c3 + c1 * s2 * s3; this.y = c1 * s2 * c3 - s1 * c2 * s3;
    this.z = c1 * c2 * s3 - s1 * s2 * c3; this.w = c1 * c2 * c3 + s1 * s2 * s3;
  } else {
    this.x = s1 * c2 * c3 + c1 * s2 * s3; this.y = c1 * s2 * c3 - s1 * c2 * s3;
    this.z = c1 * c2 * s3 + s1 * s2 * c3; this.w = c1 * c2 * c3 - s1 * s2 * s3;
  }
  return this;
};
Q.setFromRotationMatrix = function (m) {
  const te = m.elements;
  const m11 = te[0], m12 = te[4], m13 = te[8];
  const m21 = te[1], m22 = te[5], m23 = te[9];
  const m31 = te[2], m32 = te[6], m33 = te[10];
  const trace = m11 + m22 + m33;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    this.w = 0.25 / s; this.x = (m32 - m23) * s; this.y = (m13 - m31) * s; this.z = (m21 - m12) * s;
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    this.w = (m32 - m23) / s; this.x = 0.25 * s; this.y = (m12 + m21) / s; this.z = (m13 + m31) / s;
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    this.w = (m13 - m31) / s; this.x = (m12 + m21) / s; this.y = 0.25 * s; this.z = (m23 + m32) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    this.w = (m21 - m12) / s; this.x = (m13 + m31) / s; this.y = (m23 + m32) / s; this.z = 0.25 * s;
  }
  return this;
};
Q.multiplyQuaternions = function (a, b) {
  const ax = a.x, ay = a.y, az = a.z, aw = a.w, bx = b.x, by = b.y, bz = b.z, bw = b.w;
  this.x = ax * bw + aw * bx + ay * bz - az * by;
  this.y = ay * bw + aw * by + az * bx - ax * bz;
  this.z = az * bw + aw * bz + ax * by - ay * bx;
  this.w = aw * bw - ax * bx - ay * by - az * bz;
  return this;
};
Q.multiply = function (q) { return this.multiplyQuaternions(this, q); };
Q.premultiply = function (q) { return this.multiplyQuaternions(q, this); };
Q.invert = function () { return this.conjugate(); };
Q.conjugate = function () { this.x *= -1; this.y *= -1; this.z *= -1; return this; };
Q.normalize = function () {
  let l = Math.hypot(this.x, this.y, this.z, this.w);
  if (l === 0) { this.x = 0; this.y = 0; this.z = 0; this.w = 1; } else { l = 1 / l; this.x *= l; this.y *= l; this.z *= l; this.w *= l; }
  return this;
};
Q.dot = function (q) { return this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w; };

// three keeps an Object3D's `rotation` (Euler) and `quaternion` in sync through
// a pair of onChange callbacks, and updateMatrix composes the QUATERNION. The
// stub has neither, and that difference matters twice over:
//
//   * without a sync, a node posed by Euler angles and then IK'd by quaternion
//     gets posed by BOTH — which is how the support hand first measured 0.4 m
//     off its foregrip, with nothing wrong in the game code;
//   * and composing from the Euler would round-trip through atan2/asin every
//     frame, which is lossy and degenerate near gimbal lock, so a shoulder
//     solved by IK would not land where it was solved to.
//
// So: `_q` is authoritative (as in three), `rotation` is a mirror that is
// recomputed from it only when it has actually gone stale, and every write to a
// rotation field rebuilds the quaternion. Quaternion mutations just mark the
// mirror stale — Object3D.updateMatrix then reads the quaternion, exactly like
// the real thing.
const _sync = (q) => { const o = q._owner; if (o) o._rotStale = true; };
for (const name of ["identity", "copy", "set", "setFromAxisAngle", "setFromEuler", "setFromRotationMatrix", "multiply", "premultiply", "multiplyQuaternions", "invert", "conjugate", "normalize"]) {
  const fn = Q[name];
  Q[name] = function (...args) { const r = fn.apply(this, args); _sync(this); return r; };
}

// ---------------------------------------------------------------- Matrix4
// Own `elements` never exists on a stub instance, so a prototype getter is both
// the storage and a no-change upgrade.
if (!Object.getOwnPropertyDescriptor(Matrix4.prototype, "elements")) {
  Object.defineProperty(Matrix4.prototype, "elements", {
    get() { return this._e || (this._e = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])); },
    configurable: true,
  });
}
const M = Matrix4.prototype;
M.identity = function () {
  const e = this.elements;
  e[0] = 1; e[4] = 0; e[8] = 0; e[12] = 0;
  e[1] = 0; e[5] = 1; e[9] = 0; e[13] = 0;
  e[2] = 0; e[6] = 0; e[10] = 1; e[14] = 0;
  e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
  return this;
};
M.set = function (n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44) {
  const e = this.elements;
  e[0] = n11; e[4] = n12; e[8] = n13; e[12] = n14;
  e[1] = n21; e[5] = n22; e[9] = n23; e[13] = n24;
  e[2] = n31; e[6] = n32; e[10] = n33; e[14] = n34;
  e[3] = n41; e[7] = n42; e[11] = n43; e[15] = n44;
  return this;
};
M.copy = function (m) { this.elements.set(m.elements); return this; };
M.clone = function () { return new Matrix4().copy(this); };
M.makeBasis = function (xAxis, yAxis, zAxis) {
  return this.set(
    xAxis.x, yAxis.x, zAxis.x, 0,
    xAxis.y, yAxis.y, zAxis.y, 0,
    xAxis.z, yAxis.z, zAxis.z, 0,
    0, 0, 0, 1,
  );
};
M.makeRotationFromQuaternion = function (q) {
  const { x, y, z, w } = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return this.set(
    1 - (yy + zz), xy - wz, xz + wy, 0,
    xy + wz, 1 - (xx + zz), yz - wx, 0,
    xz - wy, yz + wx, 1 - (xx + yy), 0,
    0, 0, 0, 1,
  );
};
M.makeTranslation = function (x, y, z) {
  return this.set(1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1);
};
M.multiplyMatrices = function (a, b) {
  const ae = a.elements, be = b.elements, te = this.elements;
  const a11 = ae[0], a12 = ae[4], a13 = ae[8], a14 = ae[12];
  const a21 = ae[1], a22 = ae[5], a23 = ae[9], a24 = ae[13];
  const a31 = ae[2], a32 = ae[6], a33 = ae[10], a34 = ae[14];
  const a41 = ae[3], a42 = ae[7], a43 = ae[11], a44 = ae[15];
  const b11 = be[0], b12 = be[4], b13 = be[8], b14 = be[12];
  const b21 = be[1], b22 = be[5], b23 = be[9], b24 = be[13];
  const b31 = be[2], b32 = be[6], b33 = be[10], b34 = be[14];
  const b41 = be[3], b42 = be[7], b43 = be[11], b44 = be[15];
  te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
  te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
  te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
  te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
  te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
  te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
  te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
  te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
  te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
  te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
  te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
  te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
  te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
  te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
  te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
  te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
  return this;
};
M.multiply = function (m) { return this.multiplyMatrices(this, m); };
M.premultiply = function (m) { return this.multiplyMatrices(m, this); };
M.compose = function (position, quaternion, scale) {
  const te = this.elements;
  const { x, y, z, w } = quaternion;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const sx = scale.x, sy = scale.y, sz = scale.z;
  te[0] = (1 - (yy + zz)) * sx; te[1] = (xy + wz) * sx; te[2] = (xz - wy) * sx; te[3] = 0;
  te[4] = (xy - wz) * sy; te[5] = (1 - (xx + zz)) * sy; te[6] = (yz + wx) * sy; te[7] = 0;
  te[8] = (xz + wy) * sz; te[9] = (yz - wx) * sz; te[10] = (1 - (xx + yy)) * sz; te[11] = 0;
  te[12] = position.x; te[13] = position.y; te[14] = position.z; te[15] = 1;
  return this;
};
M.decompose = function (position, quaternion, scale) {
  const te = this.elements;
  let sx = Math.hypot(te[0], te[1], te[2]);
  const sy = Math.hypot(te[4], te[5], te[6]);
  const sz = Math.hypot(te[8], te[9], te[10]);
  if (this.determinant() < 0) sx = -sx;
  position.set(te[12], te[13], te[14]);
  _m4copy.copy(this);
  const ie = _m4copy.elements;
  const inv = 1 / (sx || 1), invy = 1 / (sy || 1), invz = 1 / (sz || 1);
  ie[0] *= inv; ie[1] *= inv; ie[2] *= inv;
  ie[4] *= invy; ie[5] *= invy; ie[6] *= invy;
  ie[8] *= invz; ie[9] *= invz; ie[10] *= invz;
  quaternion.setFromRotationMatrix(_m4copy);
  scale.set(sx, sy, sz);
  return this;
};
M.determinant = function () {
  const te = this.elements;
  const n11 = te[0], n12 = te[4], n13 = te[8], n14 = te[12];
  const n21 = te[1], n22 = te[5], n23 = te[9], n24 = te[13];
  const n31 = te[2], n32 = te[6], n33 = te[10], n34 = te[14];
  const n41 = te[3], n42 = te[7], n43 = te[11], n44 = te[15];
  return (
    n41 * (+n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34) +
    n42 * (+n11 * n23 * n34 - n11 * n24 * n33 + n14 * n21 * n33 - n13 * n21 * n34 + n13 * n24 * n31 - n14 * n23 * n31) +
    n43 * (+n11 * n24 * n32 - n11 * n22 * n34 - n14 * n21 * n32 + n12 * n21 * n34 + n14 * n22 * n31 - n12 * n24 * n31) +
    n44 * (-n13 * n22 * n31 - n11 * n23 * n32 + n11 * n22 * n33 + n13 * n21 * n32 - n12 * n21 * n33 + n12 * n23 * n31)
  );
};
M.invert = function () {
  const te = this.elements;
  const n11 = te[0], n21 = te[1], n31 = te[2], n41 = te[3];
  const n12 = te[4], n22 = te[5], n32 = te[6], n42 = te[7];
  const n13 = te[8], n23 = te[9], n33 = te[10], n43 = te[11];
  const n14 = te[12], n24 = te[13], n34 = te[14], n44 = te[15];
  const t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
  const t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
  const t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
  const t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
  const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
  if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  const d = 1 / det;
  te[0] = t11 * d;
  te[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * d;
  te[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * d;
  te[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * d;
  te[4] = t12 * d;
  te[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * d;
  te[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * d;
  te[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * d;
  te[8] = t13 * d;
  te[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * d;
  te[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * d;
  te[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * d;
  te[12] = t14 * d;
  te[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * d;
  te[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * d;
  te[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * d;
  return this;
};
const _m4copy = new Matrix4();

// ---------------------------------------------------------------- Object3D
// The stub has no quaternion at all; a prototype accessor gives one without
// touching its constructor, so `node.quaternion.setFromRotationMatrix(...)`
// (the support-hand IK in characters.js) works exactly as in the browser.
if (!("quaternion" in Object3D.prototype)) {
  Object.defineProperty(Object3D.prototype, "quaternion", {
    get() {
      if (!this._q) { this._q = new Quaternion(); this._q._owner = this; }
      return this._q;
    },
    set(v) { this._q = v; if (v) v._owner = this; },
    configurable: true,
  });
}

// The Euler mirror: x/y/z assignments rebuild the quaternion (Euler XYZ, three's
// default order), and the whole object is refreshed in place from the quaternion
// whenever something else wrote it, so a held reference stays valid.
const _rotTmp = new Vector3();
function makeEuler(owner) {
  const e = { order: "XYZ", _x: 0, _y: 0, _z: 0 };
  const apply = () => {
    owner.quaternion.setFromEuler(e._x, e._y, e._z);
    owner._rotStale = false;          // this write IS the mirror — not stale
  };
  Object.defineProperty(e, "x", { get: () => e._x, set: (v) => { e._x = v; apply(); }, enumerable: true });
  Object.defineProperty(e, "y", { get: () => e._y, set: (v) => { e._y = v; apply(); }, enumerable: true });
  Object.defineProperty(e, "z", { get: () => e._z, set: (v) => { e._z = v; apply(); }, enumerable: true });
  e.set = (x, y, z) => { e._x = x; e._y = y; e._z = z; apply(); return e; };
  e.copy = (v) => e.set(v.x, v.y, v.z);
  e.setFromQuaternion = (q) => {
    _rotTmp.setFromQuaternion(q);
    e._x = _rotTmp.x; e._y = _rotTmp.y; e._z = _rotTmp.z; return e;
  };
  // Start from whatever the quaternion already says: something may have posed
  // this node by quaternion (the weapon rig, the support-hand IK) before
  // anything ever read its rotation.
  _rotTmp.setFromQuaternion(owner.quaternion);
  e._x = _rotTmp.x; e._y = _rotTmp.y; e._z = _rotTmp.z;
  owner._rotStale = false;
  return e;
}
if (!("rotation" in Object3D.prototype)) {
  Object.defineProperty(Object3D.prototype, "rotation", {
    get() {
      if (!this._rot) this._rot = makeEuler(this);
      if (this._rotStale) { this._rot.setFromQuaternion(this.quaternion); this._rotStale = false; }
      return this._rot;
    },
    // The stub's constructor assigns `this.rotation = new Vector3()`. Swallow it:
    // the mirror above is created on first read instead.
    set() {},
    configurable: true,
  });
}

const O = Object3D.prototype;
O.updateMatrix = function () {
  this.matrix.compose(this.position, this.quaternion, this.scale);
  return this;
};
O.updateMatrixWorld = function (force = false) {
  if (this.matrixAutoUpdate !== false) this.updateMatrix();
  if (!this._mwParent) this.matrixWorld.copy(this.matrix);
  else this.matrixWorld.multiplyMatrices(this._mwParent.matrixWorld, this.matrix);
  for (const c of this.children) { c._mwParent = this; c.updateMatrixWorld(force); }
  return this;
};
O.updateWorldMatrix = function (updateParents = false, updateChildren = false) {
  let parent = this.parent;
  if (updateParents && parent) parent.updateWorldMatrix(true, false);
  this.updateMatrix();
  if (!parent) this.matrixWorld.copy(this.matrix);
  else this.matrixWorld.multiplyMatrices(parent.matrixWorld, this.matrix);
  if (updateChildren) for (const c of this.children) c.updateWorldMatrix(false, true);
  return this;
};
O.getWorldPosition = function (target) {
  this.updateWorldMatrix(true, false);
  return target.setFromMatrixPosition(this.matrixWorld);
};
O.getWorldQuaternion = function (target) {
  this.updateWorldMatrix(true, false);
  _pos.setFromMatrixPosition(this.matrixWorld);
  this.matrixWorld.decompose(_pos, target, _scl);
  return target;
};
O.getObjectByName = function (name) {
  if (this.name === name) return this;
  for (const c of this.children) { const hit = c.getObjectByName(name); if (hit) return hit; }
  return undefined;
};
O.localToWorld = function (v) { this.updateWorldMatrix(true, false); return v.applyMatrix4(this.matrixWorld); };
O.worldToLocal = function (v) { this.updateWorldMatrix(true, false); return v.applyMatrix4(_m4inv.copy(this.matrixWorld).invert()); };
const _pos = new Vector3(), _scl = new Vector3(), _m4inv = new Matrix4();

export const present = true;
