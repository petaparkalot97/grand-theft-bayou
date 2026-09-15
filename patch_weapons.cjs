const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

// Imports
code = code.replace('import { initAudio, createCarAudio } from "./audio.js";', 'import { initAudio, createCarAudio } from "./audio.js";\nimport { initWeapons3D, updateWeapon3D, playFireAnim3D } from "./weapons_3d.js";');

// Init
code = code.replace('const arsenal = createArsenal({ state, flashObjective });', 'const arsenal = createArsenal({ state, flashObjective });\n  initWeapons3D(scene);');

// Firing anim
const fireAnimCode = `  if (!state.veh) { attackTimer = 0.42; player.play("attack", { fps: 12, loop: false, force: true }); playFireAnim3D(gun.melee); }`;
code = code.replace('  if (!state.veh) { attackTimer = 0.42; player.play("attack", { fps: 12, loop: false, force: true }); }', fireAnimCode);

// Update loop
const updateLoopCode = `  updateFx(playerPos, dt, timeStamp);
  if (!state.veh) {
    updateWeapon3D(playerPos, _aim, state.weapon, dt, input.isDown("aim") || window.__qaAim);
  } else {
    updateWeapon3D(playerPos, _aim, state.weapon, dt, false);
  }
`;
code = code.replace('  updateFx(playerPos, dt, timeStamp);', updateLoopCode);

fs.writeFileSync('src/main.js', code);
