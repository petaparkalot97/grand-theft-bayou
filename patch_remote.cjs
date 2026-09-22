const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
  /if \(view\.play && view\.userData\.netLastState !== target\.state\) \{\n\s*view\.play\(target\.state === "IDLE" \? "idle" : "walk"\);\n\s*view\.userData\.netLastState = target\.state;\n\s*\}/,
  `if (view.play && view.userData.netLastState !== target.state) {
      if (target.state === "DEAD") {
        view.play("death", { loop: false, force: true });
      } else {
        view.play(target.state === "IDLE" ? "idle" : "walk");
      }
      view.userData.netLastState = target.state;
    }`
);

fs.writeFileSync('src/main.js', code);
