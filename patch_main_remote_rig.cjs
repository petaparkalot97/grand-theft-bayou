const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
  /import \{ initWeapons3D, updateWeapon3D, playFireAnim3D, notifyReload3D, getWeaponMuzzle \} from "\.\/weapons_3d\.js";/,
  `import { initWeapons3D, updateWeapon3D, playFireAnim3D, notifyReload3D, getWeaponMuzzle, RemoteWeaponRig } from "./weapons_3d.js";`
);

code = code.replace(
  /view\.position\.set\(data\.x, data\.y, data\.z\); scene\.add\(view\); remotePlayers\.set\(data\.id, view\);/,
  `view.position.set(data.x, data.y, data.z); scene.add(view); remotePlayers.set(data.id, view);
      if (view.arms) {
        view.userData.weaponRig = new RemoteWeaponRig(view);
      }`
);

code = code.replace(
  /if \(view\.update && view\.visible\) view\.update\(dt\);\n\s*\}/,
  `if (view.update && view.visible) view.update(dt);
    if (view.userData.weaponRig && view.visible) {
      const aimDir = new THREE.Vector3(Math.sin(target.yaw), 0, Math.cos(target.yaw));
      view.userData.weaponRig.update(aimDir, target.weapon, dt, target.aiming, target.firing);
    }
  }`
);

fs.writeFileSync('src/main.js', code);
