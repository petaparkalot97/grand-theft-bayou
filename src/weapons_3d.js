import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SRGBColorSpace } from 'three';

// View-model weapons, one per id in the game's arsenal (weapons.js):
// bat / pistol / tec9 / sawnoff / deerRifle. Anything unknown falls back to
// the pistol proxy. All ids the game can hold are built here — the old smg /
// shotgun / rifle ids never matched state.weapon, so every gun rendered as
// the boxy pistol.
const weapons = {};
let activeWeapon = null;
const weaponPivot = new THREE.Group();

const matWood = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.8 });
const matDarkMetal = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.55, metalness: 0.4 });
const matBlack = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
for (const m of [matWood, matDarkMetal, matBlack]) m.userData.gtbRealized = true;   // keep the realize pass off these

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function makeBat() {
  const batGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.8, 8);
  batGeo.translate(0, 0.4, 0);      // pivot at the handle
  batGeo.rotateX(Math.PI / 2);      // head points +Z (the pivot's aim axis)
  const mesh = new THREE.Mesh(batGeo, matWood);
  mesh.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

function makePistol() {
  const g = new THREE.Group();
  g.add(box(0.04, 0.04, 0.2, matDarkMetal, 0, 0.05, 0.05));   // barrel
  const grip = box(0.04, 0.12, 0.04, matBlack, 0, 0, -0.05);  // grip
  grip.rotation.x = Math.PI / 8;
  g.add(grip);
  return g;
}

function makeTec9() {
  const g = new THREE.Group();
  g.add(box(0.045, 0.05, 0.3, matDarkMetal, 0, 0.05, 0.1));   // long receiver
  g.add(box(0.035, 0.14, 0.05, matBlack, 0, -0.04, 0.05));    // magazine below
  const grip = box(0.04, 0.1, 0.04, matBlack, 0, 0, -0.08);
  grip.rotation.x = Math.PI / 8;
  g.add(grip);
  return g;
}

function makeSawnoff() {
  const g = new THREE.Group();
  g.add(box(0.028, 0.028, 0.34, matDarkMetal, -0.018, 0.06, 0.12));  // left barrel
  g.add(box(0.028, 0.028, 0.34, matDarkMetal, 0.018, 0.06, 0.12));   // right barrel
  g.add(box(0.06, 0.035, 0.1, matWood, 0, 0.05, -0.02));             // breech
  const grip = box(0.04, 0.11, 0.05, matWood, 0, -0.01, -0.07);
  grip.rotation.x = Math.PI / 8;
  g.add(grip);
  return g;
}

function makeDeerRifleFallback() {
  const g = new THREE.Group();
  g.add(box(0.035, 0.035, 0.55, matDarkMetal, 0, 0.05, 0.2));   // long barrel
  g.add(box(0.05, 0.06, 0.2, matWood, 0, 0.03, -0.08));         // stock
  g.add(box(0.03, 0.05, 0.03, matBlack, 0, 0.09, 0.05));        // sight
  return g;
}

// The gangster rifle glTF (assets/models/weapons/gangster_rifle) is a Sketchfab
// export whose raw bounding box is ~0.70 × 3.79 × 14.33 units — so the old
// hard-coded scale 0.05 was luck, not a fit. Measure the loaded model and
// normalize it to a hand-weapon length instead.
function fitViewModel(model, targetLength = 0.85) {
  const bbox = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const longest = Math.max(size.x, size.y, size.z) || 1;
  model.scale.setScalar(targetLength / longest);
  // centre it on the grip point (origin), so offsets in updateWeapon3D hold
  bbox.setFromObject(model);
  bbox.getCenter(size);
  model.position.sub(size);
}

export function initWeapons3D(scene) {
  if (weapons.bat) return;          // idempotent: the wired call site runs once at boot
  scene.add(weaponPivot);
  weaponPivot.visible = false;      // shown on the first on-foot update only

  weapons.bat = makeBat();
  weapons.pistol = makePistol();
  weapons.tec9 = makeTec9();
  weapons.sawnoff = makeSawnoff();
  weapons.deerRifle = makeDeerRifleFallback();

  new GLTFLoader().load('assets/models/weapons/gangster_rifle/scene.gltf', (gltf) => {
    const model = gltf.scene;
    fitViewModel(model);
    model.rotation.y = Math.PI;     // barrel toward +Z (best guess; check in browser)
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          // three r152+: texture.encoding was removed for colorSpace
          if (m.map) m.map.colorSpace = SRGBColorSpace;
          m.userData.gtbRealized = true;
        }
      }
    });
    weapons.deerRifle.clear();
    weapons.deerRifle.add(model);
  }, undefined, () => { /* offline / 404: the procedural fallback stays */ });
}

let animState = { type: 'idle', time: 0, duration: 0, maxRecoil: 0 };

/**
 * Per-frame view-model update. Call from the main tick (not just on foot):
 * `hidden` hides the pivot while driving or in a cutscene — without it the
 * last pose froze in the world the moment you got into a car.
 */
export function updateWeapon3D(playerPos, aimDir, stateWeapon, dt, isAiming, hidden = false) {
  if (hidden || !playerPos) {
    weaponPivot.visible = false;
    return;
  }

  if (!activeWeapon || activeWeapon.name !== stateWeapon) {
    if (activeWeapon && activeWeapon.parent) activeWeapon.parent.remove(activeWeapon);
    activeWeapon = weapons[stateWeapon] || weapons.pistol;
    activeWeapon.name = stateWeapon;
    weaponPivot.add(activeWeapon);
  }
  weaponPivot.visible = true;

  // Position pivot near player shoulder
  weaponPivot.position.copy(playerPos);
  weaponPivot.position.y += 1.1; // shoulder height

  // Orient towards aim
  const targetPt = weaponPivot.position.clone().add(aimDir);
  weaponPivot.lookAt(targetPt);

  // Offset weapon to the right side (handedness)
  activeWeapon.position.set(0.3, -0.2, 0.2);

  if (!isAiming) {
    // Holstered / lowered
    activeWeapon.position.y = -0.5;
    activeWeapon.rotation.x = -Math.PI / 2;
    activeWeapon.rotation.y = 0;
    activeWeapon.rotation.z = 0;
  } else {
    // Aiming / Firing animation
    if (animState.time > 0) {
      animState.time -= dt;
      const progress = 1.0 - (animState.time / animState.duration);

      if (animState.type === 'melee') {
        // Swing from right to left
        activeWeapon.rotation.x = 0;
        activeWeapon.rotation.y = Math.sin(progress * Math.PI) * -1.5;
        activeWeapon.rotation.z = Math.sin(progress * Math.PI) * 0.5;
      } else {
        // Gun recoil
        const recoil = Math.sin(progress * Math.PI * 2) * Math.exp(-progress * 5); // snappy recoil
        activeWeapon.rotation.x = recoil * animState.maxRecoil;
        activeWeapon.rotation.y = 0;
        activeWeapon.rotation.z = 0;
        activeWeapon.position.z = 0.2 + (recoil * 0.1); // push back
      }
    } else {
      // Steady aim
      activeWeapon.rotation.set(0, 0, 0);
    }
  }
}

export function playFireAnim3D(isMelee) {
  if (isMelee) {
    animState = { type: 'melee', time: 0.4, duration: 0.4, maxRecoil: 0 };
  } else {
    animState = { type: 'shoot', time: 0.2, duration: 0.2, maxRecoil: 0.2 };
  }
}
