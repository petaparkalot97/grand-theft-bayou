import * as THREE from 'three';

const camera = new THREE.PerspectiveCamera(75, 16/9, 0.1, 1000);
// mimic camera.js: focus = P, look = focus + rx*offset. camera looks at look.
// P = (0,0,0)
const dist = 5;
const rightOffset = 0.85;
const camY = 1.25;

// Camera looks down -Z (yaw = 0)
// rx = (1,0,0), rz = (0,0,-1)
const rx = new THREE.Vector3(1, 0, 0);
const rz = new THREE.Vector3(0, 0, -1);
camera.position.set(0 + rx.x*rightOffset, camY, dist);
// Look at P + rx*offset
camera.lookAt(new THREE.Vector3(0 + rx.x*rightOffset, camY, 0));

camera.updateMatrixWorld();

const _ray = new THREE.Raycaster();
_ray.setFromCamera(new THREE.Vector2(0,0), camera);

const target3D = _ray.ray.at(25, new THREE.Vector3());
const origin = new THREE.Vector3(0, 1.2, 0); // player muzzle

const aim3D = target3D.clone().sub(origin).normalize();
const aim = aim3D.clone();
aim.y = 0;
aim.normalize();

console.log("Camera Pos:", camera.position);
console.log("Camera Dir:", _ray.ray.direction);
console.log("Target 3D:", target3D);
console.log("Origin:", origin);
console.log("Aim 3D:", aim3D);
console.log("Aim XZ:", aim);

// Enemy at Z = -5, X = 0
const E = new THREE.Vector3(0, 0, -5);
const dx = E.x - 0;
const dz = E.z - 0;
const d = Math.hypot(dx, dz);
const facing = (dx * aim.x + dz * aim.z) / d;

console.log("Facing for E(0,-5):", facing);
