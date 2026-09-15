const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

const fireReplacement = `
  for (const v of vehicles) {
    if (v === state.veh) continue;
    const dx = v.obj.position.x - playerPos.x, dz = v.obj.position.z - playerPos.z;
    const d = Math.hypot(dx, dz);
    if (d > gun.range || d < 1e-3) continue;
    const facing = (dx * _aim.x + dz * _aim.z) / d;
    if (facing < 0.8) continue;
    const score = d * 1.5 * (1.6 - facing);
    if (score < bestScore) { bestScore = score; best = v; bestKind = "vehicle"; }
  }
  npcs.noise(playerPos.x, playerPos.z, 26);     // gunfire carries`;

code = code.replace('  npcs.noise(playerPos.x, playerPos.z, 26);     // gunfire carries', fireReplacement);

const damageRegex = /  if \(bestKind === "enemy"\) \{[\s\S]*?if \(best\.hp <= 0\) \{ best\.dead = true; crime\(3\.5\); \}\s*\}/;

const damageReplacement = `  if (bestKind === "enemy") {
    best.hp -= gun.damage;
    npcs.provoke(best);
    if (best.type !== "hog") { best.spr.play("hurt", { loop: false, force: true }); best.t = 0; }
    else best.spr.position.addScaledVector(best.spr.position.clone().sub(playerPos).setY(0).normalize(), 0.4);
    if (best.hp <= 0) { killEnemy(best); if (best.type !== "hog") crime(1.2); }
  } else if (bestKind === "sheriff") {
    best.hp -= gun.damage;
    if (best.hp <= 0) { best.dead = true; crime(3.5); explodeCar(best); }
  } else if (bestKind === "vehicle") {
    best.hp -= gun.damage;
    if (best.hp <= 0) { best.dead = true; crime(1.5); explodeCar(best); }
  }`;

code = code.replace(damageRegex, damageReplacement);

fs.writeFileSync('src/main.js', code);
