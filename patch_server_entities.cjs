const fs = require('fs');
let code = fs.readFileSync('server/index.js', 'utf8');

code = code.replace(
  /else if \(msg\.type === "RESPAWN"\) room\.respawn\(player\);/,
  `else if (msg.type === "RESPAWN") room.respawn(player);
    else if (msg.type === "ENTITY_SPAWN") room.spawnEntity(player, msg.entity);
    else if (msg.type === "ENTITY_UPDATE") room.updateEntity(player, msg.entity);
    else if (msg.type === "ENTITY_REMOVE") room.removeEntity(player, msg.id);
    else if (msg.type === "VEHICLE_ENTER") room.enterVehicle(player, msg.id);
    else if (msg.type === "VEHICLE_EXIT") room.exitVehicle(player);
    else if (msg.type === "DAMAGE") room.damageEntity(player, msg);`
);

fs.writeFileSync('server/index.js', code);
