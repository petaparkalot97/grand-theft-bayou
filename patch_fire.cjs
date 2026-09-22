const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
  /for \(const e of enemies\) \{/,
  `for (const [id, rp] of remotePlayers.entries()) {
    if (rp.userData.netTarget && rp.userData.netTarget.state === "DEAD") continue;
    const dx = rp.position.x - playerPos.x, dz = rp.position.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d > gun.range || d < 1e-3) continue;
    const facing = (dx * _aim.x + dz * _aim.z) / d;
    if (state.weapon === "sawnoff") {
      if (facing > 0.82) hitTargets.push({ t: { id, rp }, kind: "player", d });
    } else {
      if (facing < 0.8) continue;
      const score = d * 1.5 * (1.6 - facing);
      if (score < bestScore) { bestScore = score; best = { id, rp }; bestKind = "player"; bestDist = d; }
    }
  }
  for (const e of enemies) {`
);

code = code.replace(
  /else if \(bestKind === "sheriff"\) target = best\.obj\.position\.clone\(\)\.setY\(1\.1\);/,
  `else if (bestKind === "sheriff") target = best.obj.position.clone().setY(1.1);
      else if (bestKind === "player") target = best.rp.position.clone().setY(1.1);`
);

code = code.replace(
  /for \(const hit of hitTargets\) \{\n\s*const \{ t, kind, d \} = hit;\n\s*\/\/ Shotgun damage falls off linearly to 0 at max range\n\s*const dmg = state\.weapon === "sawnoff" \? gun\.damage \* \(1 - d \/ gun\.range\) : gun\.damage;/,
  `for (const hit of hitTargets) {
    const { t, kind, d } = hit;
    const dmg = state.weapon === "sawnoff" ? gun.damage * (1 - d / gun.range) : gun.damage;
    if (multiplayerMode && multiplayer?.connected) {
       if (kind === "player") {
         multiplayer.send("DAMAGE", { id: t.id, amount: dmg });
       } else if (kind === "enemy" && t.netId) {
         multiplayer.send("DAMAGE", { id: t.netId, amount: dmg });
       } else if (kind === "vehicle" && t.netId) {
         multiplayer.send("DAMAGE", { id: t.netId, amount: dmg });
       } else if (kind === "sheriff" && t.netId) {
         multiplayer.send("DAMAGE", { id: t.netId, amount: dmg });
       }
       if (kind === "player") continue; // Server will handle player death
    }`
);

fs.writeFileSync('src/main.js', code);
