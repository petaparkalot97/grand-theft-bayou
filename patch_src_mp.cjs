const fs = require('fs');
let code = fs.readFileSync('src/multiplayer.js', 'utf8');

code = code.replace(
  /export function createMultiplayer\(\{ url = DEFAULT_URL, onConnection = \(\) => \{\}, onRoom = \(\) => \{\}, onRooms = \(\) => \{\}, onSnapshot = \(\) => \{\}, onError = \(\) => \{\} \} = \{\}\) \{/,
  `export function createMultiplayer({ url = DEFAULT_URL, onConnection = () => {}, onRoom = () => {}, onRooms = () => {}, onSnapshot = () => {}, onError = () => {}, onRespawned = () => {} } = {}) {`
);

code = code.replace(
  /else if \(msg\.type === "ERROR"\) onError\(msg\.code\);/,
  `else if (msg.type === "ERROR") onError(msg.code);
        else if (msg.type === "PLAYER_RESPAWNED") { if (msg.playerId === api.playerId) onRespawned(msg); }`
);

code = code.replace(
  /sendInput\(input\) \{ api\.send\("INPUT", \{ input \}\); \}, get lastSnapshot\(\) \{ return lastSnapshot; \},/,
  `sendInput(input) { api.send("INPUT", { input }); }, get lastSnapshot() { return lastSnapshot; },
    die() { api.send("DIED"); }, respawn() { api.send("RESPAWN"); },`
);

fs.writeFileSync('src/multiplayer.js', code);
