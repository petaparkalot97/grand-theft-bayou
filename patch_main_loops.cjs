const fs = require('fs');

let code = fs.readFileSync('src/main.js', 'utf8');

// Patch onFootUpdate for weapon animation
const footRegex = /  player\.update\(dt, camera\);\n\}/;
const footReplace = `  player.update(dt, camera);\n  updateWeapon3D(playerPos, _camFwd, state.weapon, dt, input.isDown("aim"));\n}`;
code = code.replace(footRegex, footReplace);

// Patch simulate for car audio
const simRegex = /  if \(state\.veh\) drivingUpdate\(dt\);\n  else onFootUpdate\(dt\);/;
const simReplace = `  if (state.veh) drivingUpdate(dt);\n  else onFootUpdate(dt);\n\n  for (const v of vehicles) {\n    if (v.audio) {\n      const isSkidding = v === state.veh ? (input.isDown("brake") && Math.abs(v.speed) > 5) || (Math.abs(input.axis("left", "right")) > 0.5 && Math.abs(v.speed) > 25) : false;\n      v.audio.update(Math.abs(v.speed * 3.6), isSkidding);\n    }\n  }`;
code = code.replace(simRegex, simReplace);

fs.writeFileSync('src/main.js', code);
console.log('Patched main.js loops.');
