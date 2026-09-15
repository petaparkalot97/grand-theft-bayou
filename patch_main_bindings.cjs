const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

const regex = /input\.onPress\("equipBat", \(\) => \{ if \(state\.running\) arsenal\.give\("bat"\); \}\);/;
const replace = `input.onPress("equipBat", () => { if (state.running) arsenal.give("bat"); });
input.onPress("nextWeapon", () => { if (state.running) arsenal.cycleWeapon(1); });
input.onPress("prevWeapon", () => { if (state.running) arsenal.cycleWeapon(-1); });`;

code = code.replace(regex, replace);
fs.writeFileSync('src/main.js', code);
console.log('Patched main.js with nextWeapon and prevWeapon.');
