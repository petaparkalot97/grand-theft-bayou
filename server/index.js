import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { Room, createRoomCode } from "./Room.js";
import { MAX_PLAYERS, TICK_RATE, parseMessage, send } from "./protocol.js";

const port = Number(process.env.PORT || 8787);
const rooms = new Map();
const sockets = new Map();

// mapEditor.js's save/load — a shared scratchpad for the hidden dev-mode
// placement tool, not a durable store: most Render web services have
// ephemeral disk, so this file (and everything in it) is lost on restart/
// redeploy unless a persistent disk is attached. The client also keeps a
// localStorage copy, and "Export" turns a session into real committed code —
// that's the actual permanent path, same as every other landmark in the game.
const EDITOR_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "editor-placements.json");
function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function readBody(req, max = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > max) { reject(new Error("payload too large")); req.destroy(); }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

const server = http.createServer((req, res) => {
  if (req.url === "/health") { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, rooms: rooms.size })); return; }

  if (req.url === "/editor/load" && req.method === "GET") {
    cors(res);
    readFile(EDITOR_FILE, "utf8")
      .then((text) => { res.writeHead(200, { "content-type": "application/json" }); res.end(text); })
      .catch(() => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ placements: [] })); });
    return;
  }
  if (req.url === "/editor/save" && req.method === "POST") {
    cors(res);
    readBody(req).then((raw) => {
      const body = JSON.parse(raw);
      if (!Array.isArray(body.placements)) throw new Error("bad payload");
      return writeFile(EDITOR_FILE, JSON.stringify({ placements: body.placements }, null, 2));
    }).then(() => {
      res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true }));
    }).catch((err) => {
      res.writeHead(400, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: false, error: String(err.message || err) }));
    });
    return;
  }
  if (req.url === "/editor/save" && req.method === "OPTIONS") { cors(res); res.writeHead(204); res.end(); return; }

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
