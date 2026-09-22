const fs = require('fs');
let code = fs.readFileSync('src/weapons_3d.js', 'utf8');

const additionalCode = `
export class RemoteWeaponRig {
  constructor(actor) {
    this.actor = actor;
    this.hand = actor.getObjectByName("mixamorigRightHand") || actor.arms[1].hand;
    this.grip = new THREE.Group();
    this.recoil = new THREE.Group();
    this.grip.add(this.recoil);
    this.hand.add(this.grip);
    this.model = null;
    this.muzzle = new THREE.Object3D();
    this.recoil.add(this.muzzle);
    this.id = null;
    this.def = null;
    this.anim = { type: "idle", time: 0, duration: 0 };
  }

  update(aimDir, stateWeapon, dt, aiming, firing) {
    if (!stateWeapon) {
      this.grip.visible = false;
      this.actor.weaponHold = null;
      return;
    }
    this.grip.visible = true;
    if (this.id !== stateWeapon) {
      this.id = stateWeapon;
      this.def = rigFor(stateWeapon);
      if (this.model) {
        this.recoil.remove(this.model);
        this.model = null;
      }
      const b = builders[this.def.type];
      if (b) {
        this.model = b(this.def);
        this.recoil.add(this.model);
      }
      if (this.def.rotationOffset) {
        this.model.rotation.set(this.def.rotationOffset[0], this.def.rotationOffset[1], this.def.rotationOffset[2]);
      }
      if (this.def.scale) {
        this.model.scale.setScalar(this.def.scale);
      }
      this.muzzle.position.set(this.def.muzzleOffset[0], this.def.muzzleOffset[1], this.def.muzzleOffset[2]);
    }

    const attack = this.anim.type === "swing" && this.anim.duration > 0 ? 1 - Math.max(0, this.anim.time) / this.anim.duration : 0;
    const hold = { kind: this.def.hold, aim: !!aiming, support: null, attack };
    this.actor.weaponHold = hold;
    this.actor.applyWeaponHold(dt);
    this.actor.updateMatrixWorld(true);

    this.grip.position.set(this.def.handOffset[0], this.def.handOffset[1], this.def.handOffset[2]);

    if (this.def.orient === "melee") {
      const u = attack;
      const windUp = Math.sin(Math.min(1, u / 0.28) * Math.PI);
      const strike = u <= 0.28 ? 0 : Math.sin(((u - 0.28) / 0.72) * Math.PI);
      const th = MELEE_REST + 0.18 * windUp - MELEE_SWEEP * strike;
      const yaw = this.actor.rotation.y, sy = Math.sin(yaw), cy = Math.cos(yaw);
      const lx = MELEE_OUT, ly = Math.sin(th), lz = Math.cos(th);
      _goal.set(lx * cy + lz * sy, ly, -lx * sy + lz * cy);
    } else {
      _goal.copy(aimDir);
      if (!aiming && !firing) {
        _goal.set(Math.sin(this.actor.rotation.y), 0, Math.cos(this.actor.rotation.y));
      }
    }

    // inline solveGrip
    this.hand.getWorldQuaternion(_q1);
    this.grip.quaternion.setFromUnitVectors(WORLD_UP, _goal);
    this.hand.getWorldQuaternion(_q2).invert();
    this.grip.quaternion.copy(_q2).multiply(this.grip.quaternion);
    
    // inline applyRecoil
    const a = this.anim, r = this.def.recoil;
    if (firing && a.time <= 0) {
      const t = this.def.type === "melee" ? 0.42 : r.time;
      this.anim = { type: this.def.type === "melee" ? "swing" : "fire", time: t, duration: t };
    }
    if (a.time <= 0) {
      this.recoil.position.set(0, 0, 0);
      this.recoil.rotation.set(0, 0, 0);
      a.type = "idle";
    } else {
      a.time -= dt;
      const p = 1 - Math.max(0, a.time) / a.duration;
      if (a.type !== "swing" && a.type !== "reload") {
        const k = Math.exp(-p * 5.5) * Math.cos(p * Math.PI * 1.6);
        this.recoil.rotation.set(-r.pitch * k, r.yaw * k, 0);
        this.recoil.position.set(0, 0, -r.kick * Math.max(0, k));
      } else {
        this.recoil.position.set(0, 0, 0);
        this.recoil.rotation.set(0, 0, 0);
      }
    }

    if (this.def.twoHanded && this.def.foregrip) {
      this.grip.updateWorldMatrix(true, false);
      _tmp.set(this.def.foregrip[0], this.def.foregrip[1], this.def.foregrip[2]);
      _tmp.applyMatrix4(this.grip.matrixWorld);
      hold.support = _tmp.clone();
      this.actor.applyWeaponHold(0);
    }
  }
}
`;

code = code + "\n" + additionalCode;
fs.writeFileSync('src/weapons_3d.js', code);
