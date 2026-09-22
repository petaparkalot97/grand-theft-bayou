const fs = require('fs');
let code = fs.readFileSync('server/Room.js', 'utf8');

code = code.replace(
  /updateEntity\(player, update\) \{/,
  `updateEntityBatch(player, updates) {
    if (!this.entities) return;
    for (const update of updates) {
      const entity = this.entities.get(update.id);
      if (!entity) continue;
      if (this.hostId !== player.id && entity.owner !== player.id) continue;
      Object.assign(entity, update);
    }
  }
  updateEntity(player, update) {`
);
fs.writeFileSync('server/Room.js', code);

let indexCode = fs.readFileSync('server/index.js', 'utf8');
indexCode = indexCode.replace(
  /else if \(msg\.type === "ENTITY_UPDATE"\) room\.updateEntity\(player, msg\.entity\);/,
  `else if (msg.type === "ENTITY_UPDATE") room.updateEntity(player, msg.entity);
    else if (msg.type === "ENTITY_BATCH_UPDATE") room.updateEntityBatch(player, msg.updates);`
);
fs.writeFileSync('server/index.js', indexCode);
