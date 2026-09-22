const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
  /function wasted\(\) \{\n\s*if \(storyFail && storyFail\("wasted"\)\) return;\s*\/\/ a mission may respawn you instead/,
  `function wasted() {
  if (multiplayerMode && multiplayer?.connected) {
    state.health = 0;
    updateHud();
    multiplayer.die();
    const wastedOverlay = document.createElement("div");
    wastedOverlay.className = "wasted";
    wastedOverlay.innerHTML = "WASTED";
    document.body.appendChild(wastedOverlay);
    camCtl.release();
    setTimeout(() => {
      wastedOverlay.remove();
      multiplayer.respawn();
    }, 4000);
    return;
  }
  if (storyFail && storyFail("wasted")) return;   // a mission may respawn you instead`
);

code = code.replace(
  /onRoom: \(room\) => \{ drawMultiplayerRoom\(room\);/,
  `onRespawned: (msg) => {
      state.health = 100;
      updateHud();
      player.position.set(msg.x, msg.y, msg.z);
      playerPos.set(msg.x, msg.y, msg.z);
      camCtl.reset();
      camCtl.snap();
      player.visible = true;
      if (state.veh) {
        state.veh = null;
      }
    },
    onRoom: (room) => { drawMultiplayerRoom(room);`
);

fs.writeFileSync('src/main.js', code);
