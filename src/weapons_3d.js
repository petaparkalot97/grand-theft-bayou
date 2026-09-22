// ---------------------------------------------------------------------------
// weapons_3d.js — what the player is actually holding.
//
// WHAT WAS WRONG. The old version was a "view model": one shared pivot parked
// near the player's shoulder (`playerPos.y + 1.1`), aimed with `lookAt`, and a
// per-weapon hardcoded position like `activeWeapon.position.set(0.3, -0.2, 0.2)`.
// That is a weapon placed NEXT TO a character, not held by one — it does not
// know where the hands are, it is not a child of anything that animates, and the
// offsets that make it look reasonable in one pose are wrong in every other.
// That is why the bat floated beside the player and the shotgun read as
// detached.
//
// WHAT REPLACES IT. Three ideas, and every weapon in the game inherits all three:
//
//   1. PARENTING. Every weapon is a child of the character's HAND SOCKET —
//      `characters.js` builds one per arm at the middle of the fist. Position
//      comes from the hand, always: the weapon cannot float, drift, or fail to
//      follow the body through a walk, a turn, a dance clip or a melee swing,
//      because it is inside the arm that is doing all of that. Nothing here
//      knows or cares where the camera or the player's world position is.
//
//   2. A SOLVED ORIENTATION. A wrist's frame tumbles through every clip, so a gun
//      rigidly bolted to one would point wherever the wrist happened to be. The
//      grip node's LOCAL rotation is solved from a desired WORLD orientation each
//      frame instead:
//
//          gripLocal = handWorld⁻¹ · desiredWorld · modelOffset
//
//      `desiredWorld` puts the weapon's +Z (its barrel axis) along the aim
//      direction — or, for melee, leaves the weapon rigidly in the fist, which
//      is what a bat is. So: position from the hand, orientation from the aim.
//
//   3. A GRIP ORIGIN. Every model below is built GRIP-AT-ORIGIN: the point the
//      hand closes around is (0,0,0) and the barrel runs down +Z. Rotating the
//      weapon about its own origin is therefore rotating it about the grip, so
//      recoil kicks the muzzle while the grip stays put in the hand, and nothing
//      ever pivots around the middle of an image.
//
// The muzzle is a real node at the weapon's `muzzleOffset`, so tracers, flashes
// and shell effects can start at the end of the barrel instead of at the
// player's navel.
//
// Gameplay stays in weapons.js (damage, clip, cooldown, fireMode); everything
// about how a weapon SITS lives here. Both tables are keyed by the same id, and
// the one field they must agree on is `hold`.
//
// PER-WEAPON CONFIG (the data model the task asked for, in this codebase's idiom):
//
//   type            melee | pistol | smg | shotgun | rifle
//   hold            which arm pose the character uses: pistol | long | melee
//   orient          "aim"  — barrel solved onto the aim direction (firearms)
//                   "hand" — rigid in the fist (melee: a bat does not track a camera)
//   twoHanded       the support hand is solved onto `foregrip` (characters.js IK)
//   handOffset      where the grip sits inside the fist, in hand-socket space
//   gripOffset      where the hand's grip is in MODEL space (baked into the build
//                   so it is normally zero, but it is real per-weapon data)
//   rotationOffset  model alignment inside the grip node
//   scale           model scale
//   muzzleOffset    the muzzle, in model space
//   foregrip        the support hand's target, in grip-node space
//   recoil          { pitch, yaw, kick, time } — a rotation about the grip
//   layer           renderOrder (presentation depth ordering)
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SRGBColorSpace } from "three";

// ---------------------------------------------------------------- materials
function std(name, color, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ name, color, roughness: 0.6, ...extra });
  m.userData.gtbRealized = true;                 // keep the scene-wide realize pass off these
  return m;
}
const MAT = {
  wood: std("weapon wood", 0x6b4526, { roughness: 0.74 }),
  woodDark: std("weapon wood dark", 0x472c15, { roughness: 0.82 }),
  steel: std("weapon steel", 0x33383f, { roughness: 0.4, metalness: 0.75 }),
  black: std("weapon black", 0x15171b, { roughness: 0.52, metalness: 0.4 }),
  grip: std("weapon grip", 0x1b1d22, { roughness: 0.9 }),
  brass: std("weapon brass", 0xb99a4c, { roughness: 0.34, metalness: 0.85 }),
};

// geometry, shared across every weapon that repeats a size
const _geo = new Map();
const box = (w, h, d) => {
  const k = `b${w}|${h}|${d}`;
  if (!_geo.has(k)) _geo.set(k, new THREE.BoxGeometry(w, h, d));
  return _geo.get(k);
};
const cyl = (rt, rb, h, seg = 8) => {
  const k = `c${rt}|${rb}|${h}|${seg}`;
  if (!_geo.has(k)) _geo.set(k, new THREE.CylinderGeometry(rt, rb, h, seg));
  return _geo.get(k);
};

/**
 * Add a part to a weapon model. Every weapon part is culled off
 * (`frustumCulled = false`) and excluded from the static batcher
 * (`userData.noBatch`) — it is welded to a moving actor, so both of those
 * systems are wrong about it by definition.
 */
function part(parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (rx || ry || rz) m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = false;
  m.frustumCulled = false;
  m.userData.noBatch = true;
  parent.add(m);
  return m;
}

// ---------------------------------------------------------------- the models
// Every builder returns a Group whose ORIGIN IS THE GRIP POINT and whose +Z is
// the muzzle direction. Nothing else in the file has to know a weapon's size.

function makeBat() {
  const g = new THREE.Group();
  // A bat: thin handle in the fist, thickening to the barrel up +Z. The knob
  // below the origin is what the palm actually catches on, and it is what makes
  // the hand read as closed around the handle rather than floating at the end.
  part(g, box(0.05, 0.05, 0.045), MAT.woodDark, 0, 0, -0.035);
  const shaft = cyl(0.046, 0.021, 0.78, 8);
  shaft.translate(0, 0.39, 0);
  shaft.rotateX(Math.PI / 2);
  part(g, shaft, MAT.wood, 0, 0, 0);
  part(g, cyl(0.048, 0.048, 0.02, 8), MAT.woodDark, 0, 0, 0.72, Math.PI / 2, 0, 0);
  return g;
}

function makePistol() {
  const g = new THREE.Group();
  part(g, box(0.042, 0.052, 0.17), MAT.steel, 0, 0.036, 0.075);      // slide / barrel
  part(g, box(0.038, 0.026, 0.15), MAT.black, 0, 0.002, 0.065);      // frame
  part(g, box(0.036, 0.028, 0.03), MAT.black, 0, 0.03, -0.012);      // rear sight block
  const grip = part(g, box(0.036, 0.115, 0.048), MAT.grip, 0, -0.052, -0.028);
  grip.rotation.x = -0.3;                                            // angled back into the palm
  part(g, box(0.026, 0.05, 0.012), MAT.steel, 0, -0.03, 0.026);      // trigger
  return g;
}

function makeTec9() {
  const g = new THREE.Group();
  part(g, box(0.045, 0.055, 0.28), MAT.black, 0, 0.04, 0.13);        // long receiver
  part(g, box(0.03, 0.03, 0.1), MAT.steel, 0, 0.042, 0.3);           // barrel shroud
  part(g, box(0.032, 0.14, 0.05), MAT.black, 0, -0.06, 0.09);        // magazine
  part(g, box(0.03, 0.05, 0.04), MAT.grip, 0, -0.02, 0.2);           // foregrip
  const grip = part(g, box(0.034, 0.1, 0.045), MAT.grip, 0, -0.048, -0.02);
  grip.rotation.x = -0.28;
  return g;
}

function makeSawnoff() {
  const g = new THREE.Group();
  part(g, box(0.03, 0.03, 0.36), MAT.steel, -0.019, 0.052, 0.16);    // left barrel
  part(g, box(0.03, 0.03, 0.36), MAT.steel, 0.019, 0.052, 0.16);     // right barrel
  part(g, box(0.062, 0.04, 0.1), MAT.wood, 0, 0.042, -0.02);         // breech
  part(g, box(0.05, 0.036, 0.16), MAT.woodDark, 0, 0.03, 0.13);      // forend
  const grip = part(g, box(0.036, 0.105, 0.05), MAT.woodDark, 0, -0.05, -0.05);
  grip.rotation.x = -0.32;
  return g;
}

function makeDeerRifle() {
  const g = new THREE.Group();
  part(g, box(0.034, 0.034, 0.62), MAT.steel, 0, 0.045, 0.28);       // long barrel
  part(g, box(0.05, 0.05, 0.2), MAT.wood, 0, 0.03, -0.02);           // receiver / stock wrist
  part(g, box(0.046, 0.075, 0.26), MAT.wood, 0, 0.005, -0.24);       // stock
  part(g, box(0.03, 0.06, 0.09), MAT.wood, 0, 0.012, 0.16);          // forend
  part(g, box(0.012, 0.026, 0.012), MAT.black, 0, 0.068, 0.03);      // rear sight
  part(g, box(0.012, 0.026, 0.012), MAT.black, 0, 0.068, 0.46);      // front sight
  return g;
}

const BUILDERS = {
  bat: { build: makeBat },
  pistol: { build: makePistol },
  tec9: { build: makeTec9 },
  sawnoff: { build: makeSawnoff },
  deerRifle: { build: makeDeerRifle },
};

// ------------------------------------------------------------------ the GLB
// The gangster-rifle glTF still stands in for the deer rifle when it loads
// (assets/models/weapons/gangster_rifle). Its raw bounding box is ~0.70 × 3.79 ×
// 14.33 units, so it has to be measured rather than guessed at — the old
// hardcoded `scale 0.05` was luck, not a fit — and, because the file does not
// come with a grip marker, it is then shifted so that the point a hand would
// hold (about a third of the way back from the muzzle) lands on the origin, the
// same place the procedural models put their grip.
const GLB_RIFLE = { url: "assets/models/weapons/gangster_rifle/scene.gltf", length: 0.95, gripAt: 0.34 };
let _glbRifle = null, _glbRifleLoading = false;

function loadGlbRifle() {
  new GLTFLoader().load(GLB_RIFLE.url, (gltf) => {
    const model = gltf.scene;
    const bbox = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const longest = Math.max(size.x, size.y, size.z) || 1;
    model.scale.setScalar(GLB_RIFLE.length / longest);
    model.rotation.y = Math.PI;                       // barrel toward +Z (best guess — needs a real-browser look)
    bbox.setFromObject(model);
    bbox.getCenter(size);
    model.position.sub(size);                         // centred on the origin
    model.position.z -= (0.5 - GLB_RIFLE.gripAt) * GLB_RIFLE.length;   // then grip-forward onto it
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
      o.userData.noBatch = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        if (m.map) m.map.colorSpace = SRGBColorSpace;   // three r152+: encoding became colorSpace
        m.userData.gtbRealized = true;
      }
    });
    _glbRifle = model;
    if (rig.id === "deerRifle" && rig.model) swapInGlbRifle(rig.model);
  }, undefined, () => { /* offline / 404: the procedural rifle stays */ });
}

/** Replace the procedural deer rifle's parts with the loaded GLB, in place. */
function swapInGlbRifle(model) {
  if (!_glbRifle) return;
  for (const child of [...model.children]) {
    if (child.name === "muzzle") continue;
    model.remove(child);
  }
  model.add(_glbRifle);
}

// ---------------------------------------------------------------- the config
/**
 * How each weapon sits in the hand. `hold` is the only field weapons.js also
 * carries, because it is the one the character rig has to agree on.
 *
 * `foregrip` is where the SUPPORT hand goes, in grip-node space — i.e. along the
 * barrel, measured from the grip. Its distance up the weapon is what makes a
 * Tec-9 and a deer rifle hold differently without either being special-cased
 * anywhere: the left arm is solved onto that point whatever it is.
 */
export const WEAPON_RIGS = Object.freeze({
  bat: {
    // `orient: "hand"` keeps the bat rigid in the fist instead of sighting it
    // down the camera, and `rotationOffset` lays it along the forearm: hand -y
    // is the direction the forearm runs, so a bat rotated ~90° about x is a
    // straight extension of the arm past the fist — the handle end where the
    // palm closes, the barrel out beyond. That is what makes the arm and the
    // bat read as one limb with a hand in the middle of it, rather than a bat
    // standing next to a man.
    type: "melee", hold: "melee", orient: "hand", twoHanded: false,
    handOffset: [0, 0.005, 0.01], gripOffset: [0, 0, 0], rotationOffset: [1.42, 0.08, 0.12],
    scale: 1, muzzleOffset: [0, 0, 0.78], foregrip: null,
    recoil: { pitch: 0.5, yaw: 0.1, kick: 0.03, time: 0.3 }, layer: 2,
  },
  pistol: {
    type: "pistol", hold: "pistol", orient: "aim", twoHanded: false,
    handOffset: [0, 0.0, 0.0], gripOffset: [0, 0, 0], rotationOffset: [0, 0, 0],
    scale: 1, muzzleOffset: [0, 0.036, 0.17], foregrip: null,
    recoil: { pitch: 0.34, yaw: 0.08, kick: 0.035, time: 0.2 }, layer: 1,
  },
  tec9: {
    type: "smg", hold: "long", orient: "aim", twoHanded: true,
    handOffset: [0, 0.0, -0.02], gripOffset: [0, 0, 0], rotationOffset: [0, 0, 0],
    scale: 1, muzzleOffset: [0, 0.042, 0.35], foregrip: [0, -0.01, 0.21],
    recoil: { pitch: 0.22, yaw: 0.14, kick: 0.03, time: 0.12 }, layer: 1,
  },
  sawnoff: {
    type: "shotgun", hold: "long", orient: "aim", twoHanded: true,
    handOffset: [0, 0.0, -0.03], gripOffset: [0, 0, 0], rotationOffset: [0, 0, 0],
    scale: 1, muzzleOffset: [0, 0.052, 0.35], foregrip: [0, 0.02, 0.16],
    recoil: { pitch: 0.6, yaw: 0.1, kick: 0.075, time: 0.4 }, layer: 1,
  },
  deerRifle: {
    type: "rifle", hold: "long", orient: "aim", twoHanded: true,
    handOffset: [0, 0.0, -0.03], gripOffset: [0, 0, 0], rotationOffset: [0, 0, 0],
    scale: 1, muzzleOffset: [0, 0.045, 0.6], foregrip: [0, 0.01, 0.21],
    recoil: { pitch: 0.5, yaw: 0.08, kick: 0.06, time: 0.5 }, layer: 1,
  },
});

const FALLBACK = "pistol";
const rigFor = (id) => WEAPON_RIGS[id] || WEAPON_RIGS[FALLBACK];

// ---------------------------------------------------------------- the rig
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qIdent = new THREE.Quaternion();
const _m4 = new THREE.Matrix4();
const _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3();
const _goal = new THREE.Vector3(), _tmp = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const rig = {
  scene: null,
  actor: null,
  hand: null,
  grip: null,          // child of the hand: position = handOffset, orientation = solved
  recoil: null,        // recoil / reload: rotates about the GRIP, never about the model centre
  model: null,         // the current weapon model, grip at its origin
  muzzle: null,        // Object3D at muzzleOffset, for effect origins
  id: null,
  def: null,
  anim: { type: "idle", time: 0, duration: 0 },
};

/**
 * `scene` is accepted and unused: weapons are parented to the actor, so nothing
 * belongs in the scene graph at boot. Keeping the signature means main.js's
 * existing call site does not have to change, and keeping weapons OUT of the
 * scene until they are held matters — the parish-wide static batcher runs at
 * boot, and a mesh it cannot see is a mesh it cannot merge into a batch.
 */
export function initWeapons3D(scene) {
  rig.scene = scene || rig.scene;
  if (!_glbRifle && !_glbRifleLoading) { _glbRifleLoading = true; loadGlbRifle(); }
}

function buildModel(id) {
  const spec = BUILDERS[id] || BUILDERS[FALLBACK];
  const model = new THREE.Group();
  model.name = `weapon:${id}`;
  model.add(spec.build());
  // if the gangster-rifle glTF has arrived, it stands in for the procedural one
  if (id === "deerRifle" && _glbRifle) swapInGlbRifle(model);
  return model;
}

function applyModelTransform() {
  const def = rig.def;
  rig.model.position.set(def.gripOffset[0], def.gripOffset[1], def.gripOffset[2]);
  rig.model.rotation.set(def.rotationOffset[0], def.rotationOffset[1], def.rotationOffset[2]);
  rig.model.scale.setScalar(def.scale);
  rig.model.renderOrder = def.layer;
  rig.model.traverse((o) => { if (o.isMesh) o.renderOrder = def.layer; });
  rig.muzzle.position.set(def.muzzleOffset[0], def.muzzleOffset[1], def.muzzleOffset[2]);
}

function selectModel(id) {
  if (rig.id === id && rig.def) return;
  const def = rigFor(id);
  rig.def = def;
  rig.id = id;
  if (rig.model && rig.model.parent) rig.model.parent.remove(rig.model);
  rig.model = buildModel(id);
  rig.muzzle = new THREE.Object3D();
  rig.muzzle.name = "muzzle";
  rig.model.add(rig.muzzle);
  applyModelTransform();
  rig.recoil.add(rig.model);
  rig.anim = { type: "idle", time: 0, duration: 0 };
}

/** Weld the rig to an actor's right hand. Rebuilt whenever the actor changes. */
function attachTo(actor) {
  detach();
  const hand = actor && actor.rightArm && actor.rightArm.hand;
  if (!hand) return false;
  const grip = new THREE.Group(); grip.name = "weaponGrip";
  const recoil = new THREE.Group(); recoil.name = "weaponRecoil";
  grip.add(recoil);
  hand.add(grip);
  rig.actor = actor; rig.hand = hand; rig.grip = grip; rig.recoil = recoil;
  rig.id = null;
  return true;
}

function detach() {
  if (rig.grip && rig.grip.parent) rig.grip.parent.remove(rig.grip);
  rig.actor = null; rig.hand = null; rig.grip = null; rig.recoil = null; rig.model = null; rig.muzzle = null;
  rig.id = null; rig.def = null;
}

/**
 * Point the weapon somewhere in the world, and convert that into the hand's
 * local frame. This is the whole of requirement (2) above:
 *
 *   gripLocal = handWorld⁻¹ · desiredWorld
 *
 * The basis is built from the direction plus world up, so the weapon has no roll
 * however the character is leaning, and it stays the right way up while the
 * wrist tumbles underneath it.
 */
function solveGrip(actor, wantDir) {
  if (rig.def.orient === "hand") {
    // Rigid in the fist — a bat is an extension of the arm, not a sighting
    // device. `rotationOffset` on the model is the tuning knob.
    rig.grip.quaternion.identity();
    return;
  }
  _fwd.copy(wantDir);
  if (_fwd.lengthSq() < 1e-8) _fwd.set(0, 0, 1);
  _fwd.normalize();
  _right.crossVectors(WORLD_UP, _fwd);
  if (_right.lengthSq() < 1e-6) _right.set(1, 0, 0);          // aiming straight up or down
  _right.normalize();
  _up.crossVectors(_fwd, _right).normalize();
  _m4.makeBasis(_right, _up, _fwd);                            // +z = muzzle
  _q1.setFromRotationMatrix(_m4);                              // desiredWorld
  // It has to be the HAND's world rotation, not the actor's: the grip is a
  // child of the hand, and the hand carries the whole arm's rotation too. Using
  // the body here is off by the shoulder and elbow angles, which is the same
  // class of mistake as positioning the weapon off the player instead of the
  // hand — right answer for a T-pose, wrong for every frame since.
  rig.hand.getWorldQuaternion(_q2).invert();                   // handWorld⁻¹
  rig.grip.quaternion.copy(_q2).multiply(_q1);
}

/** Kick the muzzle, not the whole weapon: the rotation happens at the grip. */
function applyRecoil(dt) {
  const a = rig.anim, r = rig.def.recoil;
  if (a.time <= 0) {
    rig.recoil.position.set(0, 0, 0);
    rig.recoil.rotation.set(0, 0, 0);
    a.type = "idle";
    return;
  }
  a.time -= dt;
  const p = 1 - Math.max(0, a.time) / a.duration;              // 0 → 1
  if (a.type === "swing") {
    // A melee attack is animated by the ARM (characters.js applyWeaponHold),
    // and the bat is rigid in the fist that arm ends in — so there is nothing
    // to add on this node. The weapon moves because the hand moves, which is
    // the entire point of welding it there instead of positioning it.
    rig.recoil.position.set(0, 0, 0);
    rig.recoil.rotation.set(0, 0, 0);
    return;
  }
  if (a.type === "reload") {
    // A dip out of the aim and back, on the same node, so the grip never moves
    const k = Math.sin(Math.min(1, p) * Math.PI);
    rig.recoil.rotation.set(-0.55 * k, 0.18 * k, 0);
    rig.recoil.position.set(0, -0.05 * k, -0.04 * k);
    return;
  }
  // Recoil: snap out and settle, oscillating. `pitch` is how far the muzzle
  // climbs, `kick` how far the weapon rides back toward the shoulder.
  const k = Math.exp(-p * 5.5) * Math.cos(p * Math.PI * 1.6);
  rig.recoil.rotation.set(-r.pitch * k, r.yaw * k, 0);
  rig.recoil.position.set(0, 0, -r.kick * Math.max(0, k));
}

/**
 * Per-frame update. Call from the main tick AFTER the player's own update, so
 * the arm pose and the hand's world matrix are current — the weapon hangs off
 * the hand, so placing it before the pose would put it a frame behind the body.
 *
 * `hidden` (driving, cutscenes) drops the rig and clears the hold, which is what
 * leaves the character posed normally instead of frozen mid-aim.
 */
export function updateWeapon3D(actor, playerPos, aimDir, stateWeapon, dt, aiming, hidden = false, firing = false) {
  if (hidden || !actor) {
    if (rig.grip) rig.grip.visible = false;
    if (actor) actor.weaponHold = null;
    return;
  }
  if (rig.actor !== actor) { if (!attachTo(actor)) return; }
  selectModel(stateWeapon);
  rig.grip.visible = true;

  // 1. tell the character what it is holding, and let it pose the gun arm. The
  //    weapon then hangs off a hand that already knows where it is going.
  //    `attack` is the melee swing's progress (0 when not swinging): the arm
  //    plays the swing and the bat comes along, welded to the fist.
  const attack = rig.anim.type === "swing" && rig.anim.duration > 0
    ? 1 - Math.max(0, rig.anim.time) / rig.anim.duration : 0;
  const hold = { kind: rig.def.hold, aim: !!aiming, support: null, attack };
  actor.weaponHold = hold;
  actor.applyWeaponHold(dt);
  actor.updateMatrixWorld(true);

  // 2. into the hand
  rig.grip.position.set(rig.def.handOffset[0], rig.def.handOffset[1], rig.def.handOffset[2]);
  _goal.copy(aimDir);
  if (!aiming && !firing) {
    // Not aiming or shooting: point along the body rather than the camera, so
    // the weapon does not swing around when the player looks about while
    // walking. On the trigger it follows the true aim, because a muzzle that
    // disagrees with the shot is the one thing a player always notices.
    _goal.set(Math.sin(actor.rotation.y), 0, Math.cos(actor.rotation.y));
  }
  solveGrip(actor, _goal);
  applyRecoil(dt);

  // 3. the support hand. Solved onto the weapon's actual foregrip, which needs
  //    the weapon's world matrix — so this is the one thing that has to happen
  //    after the weapon is up.
  if (rig.def.twoHanded && rig.def.foregrip) {
    rig.grip.updateWorldMatrix(true, false);
    _tmp.set(rig.def.foregrip[0], rig.def.foregrip[1], rig.def.foregrip[2]);
    _tmp.applyMatrix4(rig.grip.matrixWorld);
    hold.support = _tmp.clone();
    // dt = 0: this pass only poses the SUPPORT arm onto the point we just
    // computed. It must not advance the carry→aim blend a second time, and it
    // must leave the gun arm exactly as it was — the grip's orientation was
    // solved against that hand's world rotation above, so moving it here would
    // invalidate the solve it already used.
    actor.applyWeaponHold(0);
  }
}

/** The muzzle in world space, or null when nothing is held. */
export function getWeaponMuzzle(out) {
  if (!rig.muzzle || !rig.grip || !rig.grip.visible) return null;
  rig.muzzle.updateWorldMatrix(true, false);
  return out.setFromMatrixPosition(rig.muzzle.matrixWorld);
}

/** Where the barrel is pointing, in world space. */
export function getWeaponMuzzleDir(out) {
  if (!rig.muzzle || !rig.grip || !rig.grip.visible) return null;
  rig.muzzle.updateWorldMatrix(true, false);
  _fwd.set(0, 0, 1).applyQuaternion(_q1.setFromRotationMatrix(rig.muzzle.matrixWorld)).normalize();
  return out.copy(_fwd);
}

export function playFireAnim3D(weaponId, isMelee) {
  const def = rigFor(weaponId);
  // Melee matches main.js's attackTimer (0.42 s) so the arm's swing and the
  // player clip end together instead of the pose popping off mid-swing.
  const t = isMelee ? 0.42 : def.recoil.time;
  rig.anim = { type: isMelee ? "swing" : "fire", time: t, duration: t };
}

/** Called when a reload starts, so the weapon dips and comes back up. */
export function notifyReload3D(weaponId, seconds) {
  const def = rigFor(weaponId);
  if (!def || def.type === "melee") return;
  // The duration is the weapon's own reloadTime (weapons.js), passed in by the
  // arsenal's onReload hook, so the dip lasts exactly as long as the reload.
  const t = Math.max(0.3, seconds || 1);
  rig.anim = { type: "reload", time: t, duration: t };
}

/** QA: the live rig, for a headless pass to interrogate. */
export function weaponRigState() {
  return {
    id: rig.id, attached: !!(rig.actor && rig.grip), hidden: !!(rig.grip && !rig.grip.visible),
    anim: rig.anim.type, muzzleOffset: rig.def ? rig.def.muzzleOffset.slice() : null,
    handOffset: rig.def ? rig.def.handOffset.slice() : null,
  };
}
