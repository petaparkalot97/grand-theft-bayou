const fs = require('fs');
let code = fs.readFileSync('src/multiplayer.js', 'utf8');

code = code.replace(
  /export function createMultiplayer\(\{ url = DEFAULT_URL, onConnection = \(\) => \{\}, onRoom = \(\) => \{\}, onRooms = \(\) => \{\}, onSnapshot = \(\) => \{\}, onError = \(\) => \{\}, onRespawned = \(\) => \{\}, onEntityDied = \(\) => \{\} \} = \{\}\) \{/,
  `export function createMultiplayer({ url = DEFAULT_URL, onConnection = () => {}, onRoom = () => {}, onRooms = () => {}, onSnapshot = () => {}, onError = () => {}, onRespawned = () => {}, onEntityDied = () => {}, onDamage = () => {} } = {}) {`
);

code = code.replace(
  /else if \(msg\.type === "ENTITY_DIED"\) onEntityDied\(msg\.id\);/,
  `else if (msg.type === "ENTITY_DIED") onEntityDied(msg.id);
        else if (msg.type === "DAMAGE") onDamage(msg);
        else if (msg.type === "PLAYER_DIED") { if (msg.playerId === api.playerId) onDamage({ id: msg.playerId, health: 0 }); }`
);

fs.writeFileSync('src/multiplayer.js', code);
