const fs = require('fs');

let mainCode = fs.readFileSync('src/main.js', 'utf8');

// We are going to replace ENEMY_TYPES and ENEMY_KINDS.
const enemyTypesRegex = /const ENEMY_TYPES = \{[\s\S]*?^\};/m;
const enemyTypesReplace = `const ENEMY_TYPES = {
  redneck: { label: "Redneck", kind: "sprite", atlas: "redneck", tint: 0xd6402a,
             h: 2.0, hp: 5, speed: 3.9, aggro: 22, melee: 1.9, dmg: 11, atkGap: 1.1 },
  hoodrat: { label: "Hoodrat", kind: "actor", tint: 0x6d95d6,
             h: 1.92, hp: 4, speed: 4.7, aggro: 24, melee: 1.8, dmg: 8, atkGap: 0.85 },
  prostitute: { label: "Prostitute", kind: "prostitute", tint: 0xe62b7e,
               h: 1.8, hp: 4, speed: 3.4, aggro: 24, melee: 1.8, dmg: 5, atkGap: 1.0 },
  hog:     { label: "Feral Hog", kind: "hog", tint: 0x000000,
             h: 1.0, hp: 6, speed: 2.3, aggro: 18, melee: 1.7, dmg: 20, atkGap: 1.6 },
             
  // New NPCS
  dockworker: { label: "Dockworker", kind: "sprite", atlas: "redneck", tint: 0xffa500, // orange vest
                h: 2.05, hp: 7, speed: 3.5, aggro: 22, melee: 2.0, dmg: 14, atkGap: 1.3 },
  mechanic: { label: "Mechanic", kind: "sprite", atlas: "redneck", tint: 0x444488, // blue overalls
              h: 1.95, hp: 5, speed: 4.0, aggro: 23, melee: 1.9, dmg: 10, atkGap: 1.1 },
  suit: { label: "Suit", kind: "sprite", atlas: "redneck", tint: 0x222222, // dark suit
          h: 1.9, hp: 4, speed: 4.2, aggro: 22, melee: 1.8, dmg: 7, atkGap: 1.2 },
  tourist: { label: "Tourist", kind: "sprite", atlas: "oldman", tint: 0x88ccff, // bright shirt
             h: 1.85, hp: 3, speed: 3.6, aggro: 20, melee: 1.8, dmg: 4, atkGap: 1.4 },
  thug: { label: "Thug", kind: "actor", tint: 0x333333, // dark hoodrat 3D actor
          h: 1.98, hp: 8, speed: 4.5, aggro: 25, melee: 2.0, dmg: 12, atkGap: 0.9 },
};`;
mainCode = mainCode.replace(enemyTypesRegex, enemyTypesReplace);

// We need to restore ENEMY_KINDS since we broke it with my earlier script. Wait, my earlier script did replace ENEMY_KINDS properly!
// Let's ensure it has all of them.
const enemyKindsRegex = /const ENEMY_KINDS = \[.*?\];/;
const enemyKindsReplace = `const ENEMY_KINDS = ["hog", "redneck", "hoodrat", "prostitute", "dockworker", "mechanic", "suit", "tourist", "thug"];`;
mainCode = mainCode.replace(enemyKindsRegex, enemyKindsReplace);

fs.writeFileSync('src/main.js', mainCode);
console.log('Fixed ENEMY_TYPES and ENEMY_KINDS');
