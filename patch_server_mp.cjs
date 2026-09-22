const fs = require('fs');
let code = fs.readFileSync('server/index.js', 'utf8');

code = code.replace(
  /else if \(msg\.type === "INPUT"\) room\.input\(player, msg\.input \|\| \{\}\);/,
  `else if (msg.type === "INPUT") room.input(player, msg.input || {});
    else if (msg.type === "DIED") room.die(player);
    else if (msg.type === "RESPAWN") room.respawn(player);`
);

fs.writeFileSync('server/index.js', code);
