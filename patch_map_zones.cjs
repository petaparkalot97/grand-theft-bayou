const fs = require('fs');

// Patch tusouxroeNorth.js
let tNorth = fs.readFileSync('src/tusouxroeNorth.js', 'utf8');
tNorth = tNorth.replace('if (Math.abs(z - BLVD_Z) < 25) return "commercial";\n      if (Math.abs(x - WEST_STREET_X) < 35 || Math.abs(x - EAST_STREET_X) < 35) return "town";', 'if (Math.abs(z - BLVD_Z) < 25) return "corporate";\n      if (Math.abs(x - WEST_STREET_X) < 35 || Math.abs(x - EAST_STREET_X) < 35) return "industrial";');
fs.writeFileSync('src/tusouxroeNorth.js', tNorth);

// Patch stateWorld.js
let sWorld = fs.readFileSync('src/stateWorld.js', 'utf8');
sWorld = sWorld.replace('zoneAt(x, z) {\n      if (x > 380 && z < -380) return "commercial";  // Port Calypso Docks\n      if (x < -380 && z < -380) return "rural";       // Cypress Hills Badlands\n      if (x < -380 && z > 380) return "rural";        // Lakeshore Marsh\n      return null;', 'zoneAt(x, z) {\n      if (x > 380 && z < -380) return "industrial";  // Port Calypso Docks\n      if (x < -380 && z < -380) return "industrial";       // Cypress Hills Badlands (Quarry)\n      if (x < -380 && z > 380) return "resort";        // Lakeshore Marsh (Stilts / tourists)\n      return null;');
fs.writeFileSync('src/stateWorld.js', sWorld);
