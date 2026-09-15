const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');
code = code.replace('import { batchStatic } from "./merge.js";', 'import { batchStatic } from "./merge.js";\nimport { initAudio, createCarAudio } from "./audio.js";');
code = code.replace('    obj, heading: obj.rotation.y, speed: 0, hp: opts.hp || 40,', '    audio: createCarAudio(obj),\n    obj, heading: obj.rotation.y, speed: 0, hp: opts.hp || 40,');
fs.writeFileSync('src/main.js', code);
