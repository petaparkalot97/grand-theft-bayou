const fs = require('fs');
let code = fs.readFileSync('src/multiplayer.js', 'utf8');

code = code.replace(
  /else if \(msg\.type === "SNAPSHOT"\) \{ lastSnapshot = msg; onSnapshot\(msg\); \}/,
  `else if (msg.type === "SNAPSHOT") {
          lastSnapshot = msg;
          onSnapshot(msg);
          if (window.location.search.includes("debug=true") || window.__MP_DEBUG) {
            console.log("SNAPSHOT bytes:", event.data.length, "players:", msg.players.length, "entities:", msg.entities?.length);
          }
        }`
);

fs.writeFileSync('src/multiplayer.js', code);
