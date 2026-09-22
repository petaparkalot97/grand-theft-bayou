const fs = require('fs');
let code = fs.readFileSync('server/Room.js', 'utf8');

code = code.replace(
  /if \(pose\.state\) player\.state = pose\.state;/,
  `if (pose.state) player.state = pose.state;
    if (player.health <= 0) player.state = "DEAD";`
);

code = code.replace(
  /export class Room \{/,
  `export class Room {
  die(player) {
    if (player.health <= 0) return;
    player.health = 0;
    player.state = "DEAD";
    this.broadcast("PLAYER_DIED", { playerId: player.id });
    this.broadcastRoom();
  }
  respawn(player) {
    if (player.health > 0) return;
    player.health = 100;
    player.state = "IDLE";
    const [x, z] = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
    player.x = x; player.y = 0; player.z = z;
    if (player.netPose) { player.netPose.x = x; player.netPose.z = z; }
    this.broadcast("PLAYER_RESPAWNED", { playerId: player.id, x, y: 0, z });
    this.broadcastRoom();
  }`
);

fs.writeFileSync('server/Room.js', code);
