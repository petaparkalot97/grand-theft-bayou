const fs = require('fs');
let code = fs.readFileSync('src/multiplayer.js', 'utf8');

code = code.replace(
  /export function createMultiplayer\(\{ url = DEFAULT_URL, onConnection = \(\) => \{\}, onRoom = \(\) => \{\}, onRooms = \(\) => \{\}, onSnapshot = \(\) => \{\}, onError = \(\) => \{\}, onRespawned = \(\) => \{\} \} = \{\}\) \{/,
  `export function createMultiplayer({ url = DEFAULT_URL, onConnection = () => {}, onRoom = () => {}, onRooms = () => {}, onSnapshot = () => {}, onError = () => {}, onRespawned = () => {}, onEntityDied = () => {} } = {}) {`
);

code = code.replace(
  /else if \(msg\.type === "PLAYER_RESPAWNED"\) \{ if \(msg\.playerId === api\.playerId\) onRespawned\(msg\); \}/,
  `else if (msg.type === "PLAYER_RESPAWNED") { if (msg.playerId === api.playerId) onRespawned(msg); }
        else if (msg.type === "ENTITY_DIED") onEntityDied(msg.id);`
);

fs.writeFileSync('src/multiplayer.js', code);
