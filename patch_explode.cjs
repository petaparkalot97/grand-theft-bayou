const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

const explodeFn = `
function explodeCar(v) {
  if (v.exploded) return;
  v.exploded = true;
  v.speed = 0;
  if (v.audio) v.audio.destroy();
  
  // Turn it black
  v.obj.traverse(o => {
    if (o.isMesh && o.material) {
      if (Array.isArray(o.material)) {
        o.material.forEach(m => m.color.setHex(0x111111));
      } else {
        o.material.color.setHex(0x111111);
      }
    }
  });

  // Spawn explosion effect
  const ex = new AnimatedSprite(atlases.muzzle, 8.0);
  ex.position.copy(v.obj.position).setY(1.5);
  scene.add(ex);
  ex.play("flash", { fps: 12, loop: false });
  setTimeout(() => scene.remove(ex), 500);

  // Play sound if possible
  // Kick occupants out
  if (v.seats) {
    for (const seat of v.seats) {
      if (seat.occupant === "player") {
        state.veh = null;
        playerPos.copy(v.obj.position);
        playerPos.x += 2.5;
        player.position.copy(playerPos);
        player.visible = true;
      }
    }
  }
}

function updateRemotePlayers`;

code = code.replace('function updateRemotePlayers', explodeFn);
fs.writeFileSync('src/main.js', code);
