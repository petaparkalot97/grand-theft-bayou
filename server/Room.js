import { CHARACTERS, MAX_PLAYERS, TICK_RATE, clampNumber, safeCharacter, send } from "./protocol.js";

const SPAWNS = [[-6, 130], [-2, 130], [2, 130], [6, 130]];

function codePart() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }

export class Room {

  spawnEntity(player, entity) {
    if (this.hostId !== player.id && !entity.clientOwned) return;
    if (!this.entities) this.entities = new Map();
    this.entities.set(entity.id, entity);
    this.broadcast("ENTITY_SPAWN", { entity });
  }

  updateEntityBatch(player, updates) {
    if (!this.entities) return;
    for (const update of updates) {
      const entity = this.entities.get(update.id);
      if (!entity) continue;
      if (this.hostId !== player.id && entity.owner !== player.id) continue;
      Object.assign(entity, update);
    }
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
    const id = payload && payload.id;
    // the client reports its own hits, so the numbers are clamped here: no negative "damage" (a heal), no NaN,
    // nothing bigger than a shotgun blast — and a message with a non-string id must not throw
    if (typeof id !== "string") return;
    const amount = clampNumber(payload.amount, 0, 40, 0);
    if (amount <= 0) return;
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

  die(player) {
    if (player.health <= 0) return;
    player.health = 0;
    player.state = "DEAD";
    this.broadcast("PLAYER_DIED", { playerId: player.id });
    this.broadcastRoom();
  }
  respawn(player) {
    if (player.health > 0) return;
    player.health = 100;
    player.state = "IDLE";
    const [x, z] = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
    player.x = x; player.y = 0; player.z = z;
    if (player.netPose) { player.netPose.x = x; player.netPose.z = z; }
    this.broadcast("PLAYER_RESPAWNED", { playerId: player.id, x, y: 0, z });
    this.broadcastRoom();
  }
  constructor(code) {
    this.code = code;
    this.hostId = null;
    this.phase = "LOBBY";
    this.createdAt = Date.now();
    this.players = new Map();
    this.tick = 0;
  }

  snapshot() {
    return {
      code: this.code, phase: this.phase, hostId: this.hostId, zombie: this.zombie,
      players: [...this.players.values()].map(({ ws, input, ...player }) => ({ ...player })),
      maxPlayers: MAX_PLAYERS,
      availableCharacters: CHARACTERS.filter((id) => ![...this.players.values()].some((p) => p.character === id)),
    };
  }

  broadcast(type, payload = {}) { for (const p of this.players.values()) send(p.ws, type, payload); }
  broadcastRoom() { this.broadcast("ROOM_STATE", { room: this.snapshot() }); }

  add(ws) {
    if (this.players.size >= MAX_PLAYERS) return null;
    const id = `player_${Math.random().toString(36).slice(2, 8)}`;
    const [x, z] = SPAWNS[this.players.size];
    const player = { id, character: null, ready: false, state: "IN_LOBBY", x, y: 0, z, yaw: 0, vx: 0, vz: 0, health: 100, input: {} , ws };
    this.players.set(id, player);
    if (!this.hostId) this.hostId = id;
    return player;
  }

  remove(id) {
    const player = this.players.get(id); if (!player) return;
    this.players.delete(id);
    if (this.hostId === id) this.hostId = this.players.keys().next().value || null;
    if (!this.players.size) return;
    this.broadcast("PLAYER_LEFT", { playerId: id }); this.broadcastRoom();
  }

  select(player, character) {
    const id = safeCharacter(character);
    if (!id) return { error: "INVALID_CHARACTER" };
    const taken = [...this.players.values()].some((p) => p.id !== player.id && p.character === id);
    if (taken) return { error: "CHARACTER_TAKEN" };
    player.character = id; player.ready = false; player.state = "CHARACTER_SELECT";
    this.broadcastRoom(); return null;
  }

  setReady(player, ready) {
    if (!player.character) return { error: "SELECT_CHARACTER_FIRST" };
    player.ready = Boolean(ready); player.state = player.ready ? "READY" : "CHARACTER_SELECT"; this.broadcastRoom(); return null;
  }

  start(player) {
    if (player.id !== this.hostId) return { error: "HOST_ONLY" };
    const members = [...this.players.values()];
    if (!members.length || members.some((p) => !p.character || !p.ready)) return { error: "PLAYERS_NOT_READY" };
    this.phase = "PLAYING"; members.forEach((p) => { p.state = "PLAYING"; });
    this.broadcast("GAME_STARTED", { room: this.snapshot() }); this.broadcastRoom(); return null;
  }

  input(player, value) {
    if (this.phase !== "PLAYING") return;
    player.input = {
      forward: Boolean(value.forward), backward: Boolean(value.backward), left: Boolean(value.left), right: Boolean(value.right),
      sprint: Boolean(value.sprint), crouch: Boolean(value.crouch), jump: Boolean(value.jump), yaw: clampNumber(value.yaw, -Math.PI * 4, Math.PI * 4, player.yaw),
    };
    // The local game owns vehicle physics and collision, so the server must
    // receive the resulting pose as well as the buttons. Without this, driving
    // only moved the server-side avatar along an imaginary on-foot path and a
    // remote player appeared to vanish when they got out of the car.
    const x = Number(value.x), z = Number(value.z);
    if (Number.isFinite(x) && Number.isFinite(z)) {
      player.netPose = {
        x: clampNumber(x, -260, 260, player.x),
        y: clampNumber(value.y, -4, 20, player.y),
        z: clampNumber(z, -260, 420, player.z),
        yaw: clampNumber(value.yaw, -Math.PI * 4, Math.PI * 4, player.yaw),
        vehicle: Boolean(value.vehicle),
        state: typeof value.state === "string" ? value.state.slice(0, 24) : null,
        weapon: typeof value.weapon === "string" ? value.weapon.slice(0, 24) : null,
        aiming: Boolean(value.aiming),
        firing: Boolean(value.firing),
      };
    }
  }

  applyNetworkPose(player) {
    const pose = player.netPose;
    if (!pose) return false;
    player.vx = (pose.x - player.x) * TICK_RATE;
    player.vz = (pose.z - player.z) * TICK_RATE;
    player.x = pose.x; player.y = pose.y; player.z = pose.z;
    player.yaw = pose.yaw;
    player.vehicle = pose.vehicle;
    if (pose.state) player.state = pose.state;
    if (player.health <= 0) player.state = "DEAD";
    player.weapon = pose.weapon;
    player.aiming = pose.aiming;
    player.firing = pose.firing;
    return true;
  }

  step(dt) {
    if (this.phase !== "PLAYING") return;
    for (const p of this.players.values()) {
      if (this.applyNetworkPose(p)) continue;
      const i = p.input, x = (i.right ? 1 : 0) - (i.left ? 1 : 0), z = (i.backward ? 1 : 0) - (i.forward ? 1 : 0);
      const length = Math.hypot(x, z) || 1, speed = i.crouch ? 2.4 : i.sprint ? 8.4 : 5.4;
      p.vx = x / length * speed; p.vz = z / length * speed;
      p.x = clampNumber(p.x + p.vx * dt, -260, 260, p.x); p.z = clampNumber(p.z + p.vz * dt, -260, 420, p.z);
      p.yaw = i.yaw; p.vehicle = false; p.state = (x || z) ? (i.sprint ? "SPRINT" : i.crouch ? "CROUCH_WALK" : "RUN") : (i.crouch ? "CROUCH" : "IDLE");
    }
    this.tick++;
    this.broadcast("SNAPSHOT", { serverTick: this.tick, players: [...this.players.values()].map(({ ws, input, ...p }) => p), entities: this.entities ? [...this.entities.values()] : [] });
  }
}

export function createRoomCode(existing) { let code; do code = `BAYOU-${codePart()}`; while (existing.has(code)); return code; }
