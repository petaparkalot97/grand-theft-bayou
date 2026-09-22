const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
  /enterVehicle: \(v\) => \{ state\.veh = v; if \(v\) arsenal\.enforceVehicle\(\); playerPos\.copy\(v\.obj\.position\); player\.visible = false; \}/g,
  `enterVehicle: (v) => { state.veh = v; if (v) { arsenal.enforceVehicle(); if (multiplayerMode && multiplayer?.connected && v.netId) { multiplayer.send("VEHICLE_ENTER", { id: v.netId }); } } playerPos.copy(v.obj.position); player.visible = false; }`
);

code = code.replace(
  /enterVehicle: \(v\) => \{\n\s*state\.veh = v; if \(v\) arsenal\.enforceVehicle\(\);\n\s*playerPos\.copy\(v\.obj\.position\);\n\s*player\.visible = false;\n\s*\}/g,
  `enterVehicle: (v) => {
        state.veh = v; if (v) { arsenal.enforceVehicle(); if (multiplayerMode && multiplayer?.connected && v.netId) { multiplayer.send("VEHICLE_ENTER", { id: v.netId }); } }
        playerPos.copy(v.obj.position);
        player.visible = false;
      }`
);


code = code.replace(
  /exitVehicle: \(\) => \{\n\s*if \(!state\.veh\) return;/g,
  `exitVehicle: () => {
        if (!state.veh) return;
        if (multiplayerMode && multiplayer?.connected) { multiplayer.send("VEHICLE_EXIT"); }`
);

fs.writeFileSync('src/main.js', code);
