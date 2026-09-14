import http from "node:http";
import { WebSocketServer } from "ws";
import { Room, createRoomCode } from "./Room.js";
import { MAX_PLAYERS, TICK_RATE, parseMessage, send } from "./protocol.js";

const port = Number(process.env.PORT || 8787);
const rooms = new Map();
const sockets = new Map();
const server = http.createServer((req, res) => {
  if (req.url === "/health") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }
  res.writeHead(404); res.end();
});
const wss = new WebSocketServer({ server, maxPayload: 32 * 1024 });

function fail(ws, code) { send(ws, "ERROR", { code }); }
function leave(ws) {
  const record = sockets.get(ws); if (!record) return;
  record.room.remove(record.player.id); sockets.delete(ws);
  if (!record.room.players.size) rooms.delete(record.room.code);
  console.log(`[PLAYER] ${record.player.id} disconnected`);
}
function attach(ws, room, player) { sockets.set(ws, { room, player }); send(ws, "WELCOME", { playerId: player.id, room: room.snapshot() }); room.broadcastRoom(); console.log(`[ROOM] ${player.id} joined ${room.code}`); }

wss.on("connection", (ws) => {
  ws.isAlive = true; ws.on("pong", () => { ws.isAlive = true; });
  ws.on("message", (raw) => {
    const msg = parseMessage(raw); if (!msg) return fail(ws, "BAD_MESSAGE");
    const record = sockets.get(ws);
    if (msg.type === "PING") return send(ws, "PONG", { at: msg.at });
    if (msg.type === "CREATE_ROOM") {
      if (record) return fail(ws, "ALREADY_IN_ROOM");
      const room = new Room(createRoomCode(rooms)); rooms.set(room.code, room); const player = room.add(ws); attach(ws, room, player); console.log(`[ROOM] Created ${room.code}`); return;
    }
    if (msg.type === "JOIN_ROOM") {
      if (record) return fail(ws, "ALREADY_IN_ROOM");
      const room = rooms.get(String(msg.code || "").trim().toUpperCase()); if (!room) return fail(ws, "ROOM_NOT_FOUND");
      if (room.phase !== "LOBBY") return fail(ws, "GAME_ALREADY_STARTED"); if (room.players.size >= MAX_PLAYERS) return fail(ws, "ROOM_FULL");
      return attach(ws, room, room.add(ws));
    }
    if (!record) return fail(ws, "NOT_IN_ROOM");
    const { room, player } = record;
    if (msg.type === "SELECT_CHARACTER") { const error = room.select(player, msg.character); if (error) fail(ws, error.error); }
    else if (msg.type === "READY") { const error = room.setReady(player, msg.ready); if (error) fail(ws, error.error); }
    else if (msg.type === "START_GAME") { const error = room.start(player); if (error) fail(ws, error.error); }
    else if (msg.type === "INPUT") room.input(player, msg.input || {});
    else if (msg.type === "LEAVE_ROOM") { leave(ws); ws.close(); }
    else fail(ws, "UNKNOWN_MESSAGE");
  });
  ws.on("close", () => leave(ws)); ws.on("error", () => leave(ws));
});
const heartbeat = setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 30000);
setInterval(() => { for (const room of rooms.values()) room.step(1 / TICK_RATE); }, 1000 / TICK_RATE);
server.listen(port, () => console.log(`[SERVER] Grand Theft Bayou multiplayer listening on ${port}`));
process.on("SIGTERM", () => { clearInterval(heartbeat); server.close(); });
