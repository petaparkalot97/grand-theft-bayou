const fs = require('fs');
let code = fs.readFileSync('server/Room.js', 'utf8');

code = code.replace(
  /vehicle: Boolean\(value\.vehicle\),\n\s*state: typeof value\.state === "string" \? value\.state\.slice\(0, 24\) : null,\n\s*\};\n\s*\}/,
  `vehicle: Boolean(value.vehicle),
        state: typeof value.state === "string" ? value.state.slice(0, 24) : null,
        weapon: typeof value.weapon === "string" ? value.weapon.slice(0, 24) : null,
        aiming: Boolean(value.aiming),
        firing: Boolean(value.firing),
      };
    }`
);

code = code.replace(
  /player\.vehicle = pose\.vehicle;\n\s*if \(pose\.state\) player\.state = pose\.state;\n\s*if \(player\.health <= 0\) player\.state = "DEAD";/,
  `player.vehicle = pose.vehicle;
    if (pose.state) player.state = pose.state;
    if (player.health <= 0) player.state = "DEAD";
    player.weapon = pose.weapon;
    player.aiming = pose.aiming;
    player.firing = pose.firing;`
);

fs.writeFileSync('server/Room.js', code);
