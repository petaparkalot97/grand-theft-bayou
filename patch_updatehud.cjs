const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(/updateHud\(\)/g, "syncHUD()");
code = code.replace(/state\.health =/g, "state.hp =");

fs.writeFileSync('src/main.js', code);
