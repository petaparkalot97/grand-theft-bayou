const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
  /function hitPlayer\(amount\) \{\n\s*if \(state\.hp <= 0 \|\| state\.over\) return;\n\s*state\.hp -= amount;/,
  `function hitPlayer(amount) {
  if (state.hp <= 0 || state.over) return;
  state.hp -= amount;
  if (multiplayerMode && multiplayer?.connected) {
    multiplayer.send("DAMAGE", { id: multiplayer.playerId, amount });
  }`
);

fs.writeFileSync('src/main.js', code);
