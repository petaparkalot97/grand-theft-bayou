import * as THREE from "three";

// Identity data is centralized so menus, save state, abilities and future
// campaign content query the same character definition.
export const PLAYER_CHARACTERS = Object.freeze({
  // The story's protagonist (prologue.js CAST.keseme): first card and the default pick.
  keseme: {
    id: "keseme", name: "Keseme Nadia", subtitle: "SHE WANTS OUT",
    ability: "COUNT IT DOWN",
    description: "Doesn't want to be Dixie Beaux's greatest criminal; she wants out. Calm, sharp, and holding the one book Sheriff Mercer needs back.",
    campaign: "main", health: 100, speed: 6.5, melee: 1, ranged: 1, abilityCooldown: 0,
    accent: "#2f9e8f", portrait: "❀",
  },
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
    campaign: "greedo", health: 100, speed: 6.2, melee: 0.9, ranged: 1.15, abilityCooldown: 20,
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

function addSmoke(actor) {
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xb9b3c7, transparent: true, opacity: 0.7 }));
  smoke.position.set(0.16, 1.7, 0.2); actor.add(smoke); actor.userData.smoke = smoke;
}

export function createPlayerCharacter(id, { makePeta, makeKeseme = makePeta, makeHoodrat }) {
  if (id === "keseme") return makeKeseme();
  if (id === "peta") return makePeta();
  if (id === "chimi") {
    // Normal human (was a Bulbasaur creature — reverted per human request,
    // 2026-09-17): Caucasian male, casual build. Skin tone matches the
    // game's existing REDNECK_SKIN palette (characters.js) rather than
    // inventing a new one. Keeps a green shirt as a nod to "THE GREEN
    // MENACE" without making him a plant creature.
    return makeHoodrat({
      sex: "m", seed: 2026, height: 1.8, skin: 0xd8a878, hair: 0x4a3524,
      top: 0x4a8f3a, denim: 0x3a4a6a, headwear: "none",
      crew: { cloth: 0x4a8f3a, chain: 0x9b8bba, shoe: 0x2c2c2c },
    });
  }
  if (id === "gr33do") {
    const actor = makeHoodrat({ sex: "m", seed: 8831, height: 1.98, top: 0x4d4656, denim: 0x272a36, hair: 0x261b16, headwear: "none", crew: { cloth: 0x51466b, chain: 0x9b8bba, shoe: 0x322841 } });
    addSmoke(actor); return actor;
  }
  return makeHoodrat({ sex: "m", seed: 4412, height: 2.25, top: 0x8c3a31, denim: 0x292c35, hair: 0x17120f, headwear: "none", crew: { cloth: 0x5c2525, chain: 0x8d7048, shoe: 0x25252b } });
}
