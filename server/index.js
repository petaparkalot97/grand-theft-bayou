import http from "node:http";
import { readFile, writeFile, unlink, mkdir, readdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import { Room, createRoomCode } from "./Room.js";
import { MAX_PLAYERS, TICK_RATE, parseMessage, send } from "./protocol.js";
import { placeWithAI } from "./ai.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// Same tiny .env loader as tools/voiceover-gen.mjs (no dotenv dependency) —
// process.env still wins, so a real Render env var overrides a local .env.
function loadDotEnv() {
  const envPath = path.join(ROOT, "..", ".env");
  if (!existsSync(envPath)) return {};
  const out = {};
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (m && !m[1].startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const env = { ...loadDotEnv(), ...process.env };

const port = Number(env.PORT || 8787);
const rooms = new Map();
const sockets = new Map();

// mapEditor.js's save/load — a shared scratchpad for the hidden dev-mode
// placement tool, not a durable store: most Render web services have
// ephemeral disk, so this file (and everything in it) is lost on restart/
// redeploy unless a persistent disk is attached. The client also keeps a
// localStorage copy, and "Export" turns a session into real committed code —
// that's the actual permanent path, same as every other landmark in the game.
const EDITOR_FILE = path.join(ROOT, "editor-placements.json");
// Named save slots (the map editor's "Save As" / "Load") live alongside it,
// one JSON file per slot. The original unnamed single save above is kept
// exactly as-is so existing saved sessions keep loading unchanged; slots are
// an additive, opt-in layer on top.
const SLOTS_DIR = path.join(ROOT, "editor-slots");
function slotFile(name) {
  const safe = String(name || "").replace(/[^a-zA-Z0-9 _-]/g, "").trim().slice(0, 60);
  if (!safe) return null;
  return path.join(SLOTS_DIR, `${safe}.json`);
}
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

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  if (p === "/health") { sendJson(res, 200, { ok: true, rooms: rooms.size }); return; }

  if ((p === "/editor/save" || p === "/editor/load" || p === "/editor/slots" || p === "/editor/delete-slot" || p === "/editor/ai") && req.method === "OPTIONS") {
    cors(res); res.writeHead(204); res.end(); return;
  }

  if (p === "/editor/load" && req.method === "GET") {
    cors(res);
    const slot = url.searchParams.get("slot");
    const file = slot ? slotFile(slot) : EDITOR_FILE;
    if (slot && !file) { sendJson(res, 400, { placements: [], error: "bad slot name" }); return; }
    readFile(file, "utf8")
      .then((text) => { res.writeHead(200, { "content-type": "application/json" }); res.end(text); })
      .catch(() => sendJson(res, 200, { placements: [] }));
    return;
  }
  if (p === "/editor/save" && req.method === "POST") {
    cors(res);
    const slot = url.searchParams.get("slot");
    const file = slot ? slotFile(slot) : EDITOR_FILE;
    if (slot && !file) { sendJson(res, 400, { ok: false, error: "bad slot name" }); return; }
    readBody(req).then(async (raw) => {
      const body = JSON.parse(raw);
      if (!Array.isArray(body.placements)) throw new Error("bad payload");
      if (slot) await mkdir(SLOTS_DIR, { recursive: true });
      return writeFile(file, JSON.stringify({ placements: body.placements, savedAt: Date.now() }, null, 2));
    }).then(() => {
      sendJson(res, 200, { ok: true });
    }).catch((err) => {
      sendJson(res, 400, { ok: false, error: String(err.message || err) });
    });
    return;
  }
  // Every saved slot name, newest first — the map editor's "Load" list.
  if (p === "/editor/slots" && req.method === "GET") {
    cors(res);
    readdir(SLOTS_DIR)
      .then((files) => Promise.all(files.filter((f) => f.endsWith(".json")).map((f) =>
        readFile(path.join(SLOTS_DIR, f), "utf8")
          .then((text) => ({ name: f.slice(0, -5), savedAt: JSON.parse(text).savedAt || 0 }))
          .catch(() => null))))
      .then((entries) => sendJson(res, 200, { slots: entries.filter(Boolean).sort((a, b) => b.savedAt - a.savedAt) }))
      .catch(() => sendJson(res, 200, { slots: [] }));
    return;
  }
  if (p === "/editor/delete-slot" && req.method === "POST") {
    cors(res);
    const slot = url.searchParams.get("slot");
    const file = slot ? slotFile(slot) : null;
    if (!file) { sendJson(res, 400, { ok: false, error: "bad slot name" }); return; }
    unlink(file).then(() => sendJson(res, 200, { ok: true })).catch(() => sendJson(res, 200, { ok: true }));
    return;
  }
  // Natural-language placement (the map editor's "Ask AI" box) — proxied
  // server-side so the OpenRouter key never reaches the browser.
  if (p === "/editor/ai" && req.method === "POST") {
    cors(res);
    readBody(req).then((raw) => placeWithAI(JSON.parse(raw), env))
      .then((result) => sendJson(res, result.ok ? 200 : 400, result))
      .catch((err) => sendJson(res, 400, { ok: false, error: String(err.message || err) }));
    return;
  }

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
