const fs = require('fs');

let code = fs.readFileSync('src/input.js', 'utf8');

const wheelRegex = /  target\.addEventListener\("mouseup", \(e\) => mouseHeld\.delete\(e\.button\)\);/;
const wheelReplace = `  target.addEventListener("mouseup", (e) => mouseHeld.delete(e.button));
  target.addEventListener("wheel", (e) => {
    if (e.deltaY > 0) {
      for (const fn of handlers.get("nextWeapon") || []) fn(e);
    } else if (e.deltaY < 0) {
      for (const fn of handlers.get("prevWeapon") || []) fn(e);
    }
  }, { passive: true });`;

code = code.replace(wheelRegex, wheelReplace);
fs.writeFileSync('src/input.js', code);
