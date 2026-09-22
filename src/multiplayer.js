const DEFAULT_URL = window.__MULTIPLAYER_URL || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname || "localhost"}:8787`;

export function createMultiplayer({ url = DEFAULT_URL, onConnection = () => {}, onRoom = () => {}, onRooms = () => {}, onSnapshot = () => {}, onError = () => {}, onRespawned = () => {}, onEntityDied = () => {}, onDamage = () => {} } = {}) {
  let socket = null, pingTimer = null, lastSnapshot = null;
  const api = {
    connected: false, playerId: null, room: null, url,
    connect() {
      if (socket && socket.readyState < 2) return;
      socket = new WebSocket(url); onConnection("CONNECTING");
      socket.addEventListener("open", () => { api.connected = true; onConnection("CONNECTED"); pingTimer = setInterval(() => api.send("PING", { at: performance.now() }), 5000); });
      socket.addEventListener("message", (event) => {
        let msg; try { msg = JSON.parse(event.data); } catch { return; }
        if (msg.type === "WELCOME") { api.playerId = msg.playerId; api.room = msg.room; onRoom(api.room); }
        else if (msg.type === "ROOM_STATE") { api.room = msg.room; onRoom(api.room); }
        else if (msg.type === "SNAPSHOT") {
          lastSnapshot = msg;
          onSnapshot(msg);
          if (window.location.search.includes("debug=true") || window.__MP_DEBUG) {
            console.log("SNAPSHOT bytes:", event.data.length, "players:", msg.players.length, "entities:", msg.entities?.length);
          }
        }
        else if (msg.type === "PONG") onConnection("CONNECTED", performance.now() - msg.at);
        else if (msg.type === "ERROR") onError(msg.code);
        else if (msg.type === "PLAYER_RESPAWNED") { if (msg.playerId === api.playerId) onRespawned(msg); }
        else if (msg.type === "ENTITY_DIED") onEntityDied(msg.id);
        else if (msg.type === "DAMAGE") onDamage(msg);
        else if (msg.type === "PLAYER_DIED") { if (msg.playerId === api.playerId) onDamage({ id: msg.playerId, health: 0 }); }
        else if (msg.type === "GAME_STARTED") { api.room = msg.room; onRoom(api.room); }
      });
      socket.addEventListener("close", () => { clearInterval(pingTimer); pingTimer = null; api.connected = false; onConnection("DISCONNECTED"); });
      socket.addEventListener("error", () => onError("CONNECTION_FAILED"));
    },
    send(type, payload = {}) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, ...payload })); },
    createRoom(opts = {}) { api.send("CREATE_ROOM", opts); }, joinRoom(code, password) { api.send("JOIN_ROOM", { code, password }); },
    async fetchRooms() {
      try {
        const httpUrl = url.replace(/^ws/, "http");
        const res = await fetch(httpUrl + "/rooms");
        if (res.ok) {
          const data = await res.json();
          onRooms(data.rooms);
        }
      } catch (e) {
        console.warn("Failed to fetch rooms", e);
      }
    },
    selectCharacter(character) { api.send("SELECT_CHARACTER", { character }); },
    ready(ready = true) { api.send("READY", { ready }); }, startGame() { api.send("START_GAME"); }, leave() { api.send("LEAVE_ROOM"); api.room = null; onRoom(null); },
    sendInput(input) { api.send("INPUT", { input }); }, get lastSnapshot() { return lastSnapshot; },
    die() { api.send("DIED"); }, respawn() { api.send("RESPAWN"); },
  };
  return api;
}
