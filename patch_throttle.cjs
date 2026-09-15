const fs = require('fs');
let code = fs.readFileSync('src/input.js', 'utf8');

const regex = /target\.addEventListener\("wheel", \(e\) => \{[\s\S]*?\}, \{ passive: true \}\);/;
const replace = `let lastWheel = 0;
  target.addEventListener("wheel", (e) => {
    const now = performance.now();
    if (now - lastWheel < 100) return; // 100ms throttle
    lastWheel = now;
    if (e.deltaY > 0) {
      for (const fn of handlers.get("nextWeapon") || []) fn(e);
    } else if (e.deltaY < 0) {
      for (const fn of handlers.get("prevWeapon") || []) fn(e);
    }
  }, { passive: true });`;

code = code.replace(regex, replace);
fs.writeFileSync('src/input.js', code);
console.log('Throttled scroll wheel.');
