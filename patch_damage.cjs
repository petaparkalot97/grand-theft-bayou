const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

const updateVehCode = `  if (v.lastImpact > 10) {
    v.hp -= v.lastImpact * 1.5;
    v.lastImpact = 0;
    if (v.hp <= 0 && !v.exploded) { crime(0.5); explodeCar(v); }
  }
  if (v.jolt > 0) {`;

code = code.replace('  if (v.jolt > 0) {', updateVehCode);
fs.writeFileSync('src/main.js', code);
