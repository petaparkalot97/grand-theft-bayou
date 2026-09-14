import * as THREE from "three";

// Identity data is centralized so menus, save state, abilities and future
// campaign content query the same character definition.
export const PLAYER_CHARACTERS = Object.freeze({
  peta: {
    id: "peta", name: "PetaTheParkalotPrince", subtitle: "THE CANONICAL PRINCE",
    ability: "MASTER DEBATERER",
    description: "Do not underestimate this man's ability to drive a mean political debate that will absolutely crush your soul and will to live.",
    campaign: "main", health: 100, speed: 6.5, melee: 1, ranged: 1, abilityCooldown: 0,
    accent: "#d99a3a", portrait: "♛",
  },
  chimi: {
    id: "chimi", name: "Chimi The Cunt UwU", subtitle: "THE GREEN MENACE",
    ability: "GIT IN YOUR HUB",
    description: "You will find a strange green liquid inside your asshole... er Github repository. May induce AI Psychosis.",
    campaign: "alternate", health: 90, speed: 7, melee: 0.8, ranged: 1.1, abilityCooldown: 18,
    accent: "#76d35a", portrait: "☘",
  },
  gr33do: {
    id: "gr33do", name: "Gr33do", subtitle: "THE SMOKE SIGNAL",
    ability: "SMOKE UP",
    description: "Annihilates his enemies by smoking them out!",
    campaign: "alternate", health: 100, speed: 6.2, melee: 0.9, ranged: 1.15, abilityCooldown: 20,
    accent: "#b8a0d8", portrait: "☁",
  },
  dixon: {
    id: "dixon", name: "Dixon", subtitle: "MAORI WARRIOR",
    ability: "SKULL FUCK",
    description: "A brutal close-range finisher.",
    campaign: "alternate", health: 125, speed: 5.5, melee: 1.7, ranged: 0.75, abilityCooldown: 14,
    accent: "#db6548", portrait: "⚔",
  },
});

export function getPlayerCharacter(id) { return PLAYER_CHARACTERS[id] || PLAYER_CHARACTERS.peta; }

class BulbasaurActor extends THREE.Object3D {
  constructor() {
    super();
    const green = new THREE.MeshStandardMaterial({ color: 0x5eae52, roughness: 0.88 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x264b2b, roughness: 0.92 });
    const bulb = new THREE.MeshStandardMaterial({ color: 0x9f5c9f, roughness: 0.8 });
    const eye = new THREE.MeshStandardMaterial({ color: 0x171b17, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.68, 14, 10), green);
    body.scale.set(1.25, 0.85, 1.0); body.position.y = 0.7;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 10), green); head.position.set(0, 1.18, 0.34);
    const plant = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), bulb); plant.position.set(0, 1.52, -0.02); plant.scale.set(1.15, 0.72, 1.0);
    this.add(body, head, plant);
    for (const x of [-0.22, 0.22]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), eye); e.position.set(x, 1.28, 0.75); this.add(e);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.35, 8), dark); leg.position.set(x * 2.2, 0.3, 0.2); this.add(leg);
    }
    this.blob = new THREE.Object3D(); this.add(this.blob);
    this.material = { opacity: 1 }; this.anim = "idle"; this.finished = false; this._last = new THREE.Vector3(); this._yaw = 0; this.time = 0;
  }
  setFlip(x) { if (x) this.scale.x = Math.abs(this.scale.x) * (x < 0 ? -1 : 1); }
  play(anim) { this.anim = anim; this.time = 0; this.finished = false; }
  update(dt) { this.time += dt; }
}

function addSmoke(actor) {
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xb9b3c7, transparent: true, opacity: 0.7 }));
  smoke.position.set(0.16, 1.7, 0.2); actor.add(smoke); actor.userData.smoke = smoke;
}

export function createPlayerCharacter(id, { makePeta, makeHoodrat }) {
  if (id === "peta") return makePeta();
  if (id === "chimi") return new BulbasaurActor();
  if (id === "gr33do") {
    const actor = makeHoodrat({ sex: "m", seed: 8831, height: 1.98, top: 0x4d4656, denim: 0x272a36, hair: 0x261b16, headwear: "none", crew: { cloth: 0x51466b, chain: 0x9b8bba, shoe: 0x322841 } });
    addSmoke(actor); return actor;
  }
  return makeHoodrat({ sex: "m", seed: 4412, height: 2.25, top: 0x8c3a31, denim: 0x292c35, hair: 0x17120f, headwear: "none", crew: { cloth: 0x5c2525, chain: 0x8d7048, shoe: 0x25252b } });
}
