const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
  /onRespawned: \(msg\) => \{/,
  `onDamage: (msg) => {
      if (msg.id === multiplayer?.playerId) {
         if (msg.health < state.hp) {
           hurtFlash();
           state.hp = msg.health;
           syncHUD();
           if (state.hp <= 0 && state.running && !state.over) wasted();
         }
      }
    },
    onRespawned: (msg) => {`
);

fs.writeFileSync('src/main.js', code);
