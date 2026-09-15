import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const weapons = {};
let activeWeapon = null;
let weaponPivot = new THREE.Group();

export function initWeapons3D(scene) {
  scene.add(weaponPivot);
  
  // Procedural Bat
  const batGeo = new THREE.CylinderGeometry(0.04, 0.02, 0.8, 8);
  batGeo.translate(0, 0.4, 0); // pivot at handle
  batGeo.rotateX(Math.PI / 2); // point forward
  const batMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.8 });
  const batMesh = new THREE.Mesh(batGeo, batMat);
  batMesh.castShadow = true;
  
  const batGroup = new THREE.Group();
  batGroup.add(batMesh);
  weapons.bat = batGroup;

  // Procedural Pistol
  const pistolGroup = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.2), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  barrel.position.set(0, 0.05, 0.05);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.04), new THREE.MeshStandardMaterial({ color: 0x111111 }));
  grip.rotation.x = Math.PI / 8;
  grip.position.set(0, 0, -0.05);
  pistolGroup.add(barrel, grip);
  weapons.pistol = pistolGroup;

  // Gangster Rifle (if available)
  const rifleGroup = new THREE.Group();
  weapons.rifle = rifleGroup; // placeholder until loaded
  weapons.smg = pistolGroup;
  weapons.shotgun = pistolGroup;

  new GLTFLoader().load('assets/models/weapons/gangster_rifle/scene.gltf', (gltf) => {
    const model = gltf.scene;
    // Assume it needs scaling and orientation
    model.scale.setScalar(0.05); // usually sketchfab models are huge
    model.rotation.y = Math.PI; // point forward
    model.traverse(o => {
      if (o.isMesh) {
        o.castShadow = true;
        if (o.material) {
          // ensure standard material isn't black
          if (o.material.map) o.material.map.encoding = THREE.SRGBColorSpace || 3001;
        }
      }
    });
    rifleGroup.add(model);
  });
}

let animState = { type: 'idle', time: 0, duration: 0, maxRecoil: 0 };

export function updateWeapon3D(playerPos, aimDir, stateWeapon, dt, isAiming) {
  if (!activeWeapon || activeWeapon.name !== stateWeapon) {
    if (activeWeapon && activeWeapon.parent) activeWeapon.parent.remove(activeWeapon);
    activeWeapon = weapons[stateWeapon] || weapons.pistol;
    activeWeapon.name = stateWeapon;
    weaponPivot.add(activeWeapon);
  }

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
