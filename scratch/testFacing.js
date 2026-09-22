const dx = 0;
const dz = -5; // Enemy is 5m directly ahead
const d = 5;

// Player aiming perfectly at the enemy
const aim = { x: 0, y: 0, z: -1 }; 

const facing = (dx * aim.x + dz * aim.z) / d;
console.log("Facing perfectly at enemy:", facing);

// Aiming slightly off (e.g. camera slant)
const aimSlanted = { x: 0.1, y: 0, z: -0.995 };
const facingSlanted = (dx * aimSlanted.x + dz * aimSlanted.z) / d;
console.log("Facing slanted:", facingSlanted);
