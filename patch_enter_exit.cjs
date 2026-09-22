const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
  /function enterExitVehicle\(\) \{\n\s*if \(!state\.running \|\| state\.cinematic \|\| hijacker\.active\) return;\n\s*if \(state\.veh\) \{/,
  `function enterExitVehicle() {
  if (!state.running || state.cinematic || hijacker.active) return;
  if (state.veh) {
    if (multiplayerMode && multiplayer?.connected) {
      multiplayer.send("VEHICLE_EXIT");
    }`
);

code = code.replace(
  /state\.veh = v;\n\s*player\.visible = false;/,
  `state.veh = v;
    if (multiplayerMode && multiplayer?.connected && v.netId) {
      multiplayer.send("VEHICLE_ENTER", { id: v.netId });
    }
    player.visible = false;`
);

fs.writeFileSync('src/main.js', code);
