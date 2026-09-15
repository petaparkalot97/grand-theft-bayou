const fs = require('fs');

// main.js patch
let mainCode = fs.readFileSync('src/main.js', 'utf8');

const npcTypesCode = `const NPC_TYPES = {
  hog: { atlas: "shroom", scale: 1.5, hp: 5, loot: 0.1 },
  redneck: { atlas: "redneck", scale: 1.9, hp: 4, loot: 0.35, melee: true },
  hoodrat: { atlas: "redneck", scale: 1.9, hp: 6, loot: 0.4, melee: false },
  prostitute: { atlas: "redneck", scale: 1.9, hp: 3, loot: 0.6, melee: false },
  dockworker: { atlas: "redneck", scale: 2.0, hp: 7, loot: 0.5, melee: true },
  mechanic: { atlas: "redneck", scale: 1.9, hp: 5, loot: 0.4, melee: true },
  suit: { atlas: "redneck", scale: 1.9, hp: 4, loot: 0.9, melee: false },
  tourist: { atlas: "oldman", scale: 1.8, hp: 3, loot: 0.8, melee: false },
  thug: { atlas: "redneck", scale: 1.95, hp: 8, loot: 0.7, melee: false }
};`;
mainCode = mainCode.replace(/const NPC_TYPES = \{[\s\S]*?^\};/m, npcTypesCode);

const enemyKindsCode = `const ENEMY_KINDS = ["hog", "redneck", "hoodrat", "prostitute", "dockworker", "mechanic", "suit", "tourist", "thug"];`;
mainCode = mainCode.replace(/const ENEMY_KINDS = \[.*?\];/, enemyKindsCode);

// Handle new appearances in spawnEnemy
const spawnEnemyRegex = /  } else if \(typeName === "prostitute"\) {[\s\S]*?view\.setTint\(0x9aa3ab\);\n  }/;
const spawnEnemyReplace = `  } else if (typeName === "prostitute") {
    view = new AnimatedSprite(atlases[T.atlas], T.scale);
    view.setTint(0xff66cc);
  } else if (typeName === "dockworker") {
    view = new AnimatedSprite(atlases[T.atlas], T.scale);
    view.setTint(0xffa500); // orange vest
  } else if (typeName === "mechanic") {
    view = new AnimatedSprite(atlases[T.atlas], T.scale);
    view.setTint(0x444488); // blue overalls
  } else if (typeName === "suit") {
    view = new AnimatedSprite(atlases[T.atlas], T.scale);
    view.setTint(0x222222); // dark suit
  } else if (typeName === "tourist") {
    view = new AnimatedSprite(atlases[T.atlas], T.scale);
    view.setTint(0x88ccff); // bright shirt
  } else if (typeName === "thug") {
    view = new AnimatedSprite(atlases[T.atlas], T.scale);
    view.setTint(0x111111); // black 
  } else {
    view = new AnimatedSprite(atlases[T.atlas], T.scale);
    view.setTint(0x9aa3ab);
  }`;
mainCode = mainCode.replace(spawnEnemyRegex, spawnEnemyReplace);

fs.writeFileSync('src/main.js', mainCode);

// spawnzones.js patch
let szCode = fs.readFileSync('src/spawnzones.js', 'utf8');

const zoneMixRegex = /export const ZONE_MIX = Object\.freeze\(\{[\s\S]*?\}\);/;
const zoneMixReplace = `export const ZONE_MIX = Object.freeze({
  urban: { hoodrat: 0.9, redneck: 0.1 },
  town: { hoodrat: 0.7, redneck: 0.3 },
  commercial: { hoodrat: 0.45, redneck: 0.55 },
  border_strip: { hoodrat: 0.5, redneck: 0.5, border: true },
  border_market: { hoodrat: 0.5, redneck: 0.5, border: true },
  residential: { redneck: 0.92, hoodrat: 0.08 },
  market_row: { hoodrat: 0.25, redneck: 0.75 },
  rural: { redneck: 0.6, hoodrat: 0.15, hog: 0.25 },
  forest: { hog: 0.5, redneck: 0.5 },
  highway: null,
  water: null,
  // New Zones
  industrial: { dockworker: 0.7, mechanic: 0.2, thug: 0.1 },
  corporate: { suit: 0.8, tourist: 0.1, hoodrat: 0.1 },
  resort: { tourist: 0.7, suit: 0.2, redneck: 0.1 }
});`;
szCode = szCode.replace(zoneMixRegex, zoneMixReplace);

const wanderRegex = /export const WANDER = Object\.freeze\(\{[\s\S]*?\}\);/;
const wanderReplace = `export const WANDER = Object.freeze({
  urban:        { r: 0.55, speed: 1.25 },
  town:         { r: 0.8,  speed: 1.1 },
  commercial:   { r: 0.9,  speed: 1.05 },
  border_strip: { r: 0.85, speed: 1.05 },
  border_market:{ r: 0.85, speed: 1.05 },
  residential:  { r: 1.0,  speed: 1.0 },
  market_row:   { r: 0.45, speed: 0.9 },
  rural:        { r: 1.6,  speed: 0.85 },
  forest:       { r: 1.6,  speed: 0.85 },
  highway:      null,
  water:        null,
  // New Zones
  industrial:   { r: 0.6,  speed: 1.0 },
  corporate:    { r: 0.4,  speed: 1.3 },
  resort:       { r: 0.8,  speed: 0.8 }
});`;
szCode = szCode.replace(wanderRegex, wanderReplace);

fs.writeFileSync('src/spawnzones.js', szCode);
