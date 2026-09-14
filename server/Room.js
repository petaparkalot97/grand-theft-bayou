import { CHARACTERS, MAX_PLAYERS, TICK_RATE, clampNumber, safeCharacter, send } from "./protocol.js";

const SPAWNS = [[-6, 130], [-2, 130], [2, 130], [6, 130]];

function codePart() { return Math.random().toString(36).slice(2, 6).toUpperCase(); }

export class Room {
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
      code: this.code, phase: this.phase, hostId: this.hostId,
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
  }

  step(dt) {
    if (this.phase !== "PLAYING") return;
    for (const p of this.players.values()) {
      const i = p.input, x = (i.right ? 1 : 0) - (i.left ? 1 : 0), z = (i.backward ? 1 : 0) - (i.forward ? 1 : 0);
      const length = Math.hypot(x, z) || 1, speed = i.crouch ? 2.4 : i.sprint ? 8.4 : 5.4;
      p.vx = x / length * speed; p.vz = z / length * speed;
      p.x = clampNumber(p.x + p.vx * dt, -260, 260, p.x); p.z = clampNumber(p.z + p.vz * dt, -260, 420, p.z);
      p.yaw = i.yaw; p.state = (x || z) ? (i.sprint ? "SPRINT" : i.crouch ? "CROUCH_WALK" : "RUN") : (i.crouch ? "CROUCH" : "IDLE");
    }
    this.tick++;
    this.broadcast("SNAPSHOT", { serverTick: this.tick, players: [...this.players.values()].map(({ ws, input, ...p }) => p) });
  }
}

export function createRoomCode(existing) { let code; do code = `BAYOU-${codePart()}`; while (existing.has(code)); return code; }
