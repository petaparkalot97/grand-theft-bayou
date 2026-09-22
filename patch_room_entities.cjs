const fs = require('fs');
let code = fs.readFileSync('server/Room.js', 'utf8');

const entityCode = `
  spawnEntity(player, entity) {
    if (this.hostId !== player.id && !entity.clientOwned) return;
    if (!this.entities) this.entities = new Map();
    this.entities.set(entity.id, entity);
    this.broadcast("ENTITY_SPAWN", { entity });
  }

  updateEntity(player, update) {
    if (!this.entities) return;
    const entity = this.entities.get(update.id);
    if (!entity) return;
    // Only host or owner can update
    if (this.hostId !== player.id && entity.owner !== player.id) return;
    Object.assign(entity, update);
    // Let it be sent in snapshot
  }

  removeEntity(player, id) {
    if (this.hostId !== player.id) return;
    if (!this.entities) return;
    this.entities.delete(id);
    this.broadcast("ENTITY_REMOVE", { id });
  }

  enterVehicle(player, id) {
    if (!this.entities) return;
    const entity = this.entities.get(id);
    if (!entity || entity.type !== "vehicle" || entity.destroyed) return;
    if (entity.owner && entity.owner !== player.id) return; // occupied
    entity.owner = player.id;
    player.vehicleId = id;
    this.broadcast("VEHICLE_ENTER", { playerId: player.id, vehicleId: id });
    this.broadcastRoom();
  }

  exitVehicle(player) {
    if (!player.vehicleId) return;
    if (!this.entities) return;
    const entity = this.entities.get(player.vehicleId);
    if (entity && entity.owner === player.id) {
      entity.owner = null;
    }
    const vehicleId = player.vehicleId;
    player.vehicleId = null;
    this.broadcast("VEHICLE_EXIT", { playerId: player.id, vehicleId });
    this.broadcastRoom();
  }

  damageEntity(player, payload) {
    const { id, amount } = payload;
    if (id.startsWith("player_")) {
      const target = this.players.get(id);
      if (target && target.health > 0) {
        target.health -= amount;
        if (target.health <= 0) {
          this.die(target);
        } else {
          this.broadcast("DAMAGE", { id, health: target.health });
        }
      }
      return;
    }
    if (!this.entities) return;
    const entity = this.entities.get(id);
    if (!entity) return;
    entity.health = (entity.health || 100) - amount;
    if (entity.health <= 0 && !entity.dead) {
      entity.dead = true;
      if (entity.type === "npc") {
        this.broadcast("ENTITY_DIED", { id });
      } else if (entity.type === "vehicle") {
        entity.destroyed = true;
        this.broadcast("ENTITY_DIED", { id });
      }
    } else {
      this.broadcast("DAMAGE", { id, health: entity.health });
    }
  }
`;

code = code.replace(
  /export class Room \{/,
  `export class Room {
${entityCode}`
);

code = code.replace(
  /snapshot\(\) \{/,
  `snapshot() {
    return {
      code: this.code, phase: this.phase, hostId: this.hostId,
      players: [...this.players.values()].map(({ ws, input, ...player }) => ({ ...player })),
      maxPlayers: require("./protocol.js").MAX_PLAYERS,
      availableCharacters: require("./protocol.js").CHARACTERS.filter((id) => ![...this.players.values()].some((p) => p.character === id)),
    };
  }`
);

code = code.replace(
  /broadcast\("SNAPSHOT", \{ serverTick: this\.tick, players: \[\.\.\.this\.players\.values\(\)\]\.map\(\(\{ ws, input, \.\.\.p \}\) => p\) \}\);/,
  `broadcast("SNAPSHOT", { serverTick: this.tick, players: [...this.players.values()].map(({ ws, input, ...p }) => p), entities: this.entities ? [...this.entities.values()] : [] });`
);

fs.writeFileSync('server/Room.js', code);
