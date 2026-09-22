const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
  /state: state\.veh \? "VEHICLE" : \(player\?\.anim === "walk" \? "RUN" : "IDLE"\),\n\s*vehicle: !!state\.veh,/,
  `state: state.veh ? "VEHICLE" : (player?.anim || "IDLE"),
          vehicle: !!state.veh,
          weapon: state.weapon || null,
          aiming: input.isDown("aim"),
          firing: input.isDown("fire") || input.isDown("fireAlt"),`
);

fs.writeFileSync('src/main.js', code);
