const DEFAULT_URL = window.__MULTIPLAYER_URL || `${location.protocol === "https:" ? "wss" : "ws"}://${location.hostname || "localhost"}:8787`;

export function createMultiplayer({ url = DEFAULT_URL, onConnection = () => {}, onRoom = () => {}, onSnapshot = () => {}, onError = () => {} } = {}) {
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
        else if (msg.type === "SNAPSHOT") { lastSnapshot = msg; onSnapshot(msg); }
        else if (msg.type === "PONG") onConnection("CONNECTED", performance.now() - msg.at);
        else if (msg.type === "ERROR") onError(msg.code);
        else if (msg.type === "GAME_STARTED") { api.room = msg.room; onRoom(api.room); }
      });
      socket.addEventListener("close", () => { clearInterval(pingTimer); pingTimer = null; api.connected = false; onConnection("DISCONNECTED"); });
      socket.addEventListener("error", () => onError("CONNECTION_FAILED"));
    },
    send(type, payload = {}) { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, ...payload })); },
    createRoom() { api.send("CREATE_ROOM"); }, joinRoom(code) { api.send("JOIN_ROOM", { code }); },
    selectCharacter(character) { api.send("SELECT_CHARACTER", { character }); },
    ready(ready = true) { api.send("READY", { ready }); }, startGame() { api.send("START_GAME"); }, leave() { api.send("LEAVE_ROOM"); },
    sendInput(input) { api.send("INPUT", { input }); }, get lastSnapshot() { return lastSnapshot; },
  };
  return api;
}
