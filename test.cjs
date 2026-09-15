"use strict";
const fs = require('fs');
global.document = {
  createElement: () => ({ getContext: () => ({ fillRect: ()=>{}, fillStyle: '', beginPath:()=>{}, ellipse:()=>{}, fill:()=>{}, strokeStyle:'', moveTo:()=>{}, lineTo:()=>{}, stroke:()=>{} }) }),
  getElementById: (id) => ({ textContent: '', style: {}, classList: { add: ()=>{} }, appendChild: ()=>{}, addEventListener: ()=>{} }),
  body: { appendChild: ()=>{} }
};
global.window = { innerWidth: 1000, innerHeight: 1000, addEventListener: ()=>{} };
const vm = require('vm');
const context = vm.createContext({ ...global, console, Math, Date, setTimeout });

let strippedT = '"use strict";\n' + fs.readFileSync('src/tusouxroeNorth.js', 'utf8').replace(/export /g, '').replace(/import[\s\S]*?from\s+['\"].*?['\"];/g, '');
try { vm.runInContext(strippedT, context); console.log('tusouxroeNorth syntax OK'); } catch(e) { console.error('TUSOUXROE:', e); }

let strippedS = '"use strict";\n' + fs.readFileSync('src/stateWorld.js', 'utf8').replace(/export /g, '').replace(/import[\s\S]*?from\s+['\"].*?['\"];/g, '');
try { vm.runInContext(strippedS, context); console.log('stateWorld syntax OK'); } catch(e) { console.error('STATEWORLD:', e); }
