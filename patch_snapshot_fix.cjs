const fs = require('fs');
let code = fs.readFileSync('server/Room.js', 'utf8');

code = code.replace(
  /  snapshot\(\) \{\n    return \{\n      code: this\.code, phase: this\.phase, hostId: this\.hostId,\n      players: \[\.\.\.this\.players\.values\(\)\]\.map\(\(\{ ws, input, \.\.\.player \}\) => \(\{ \.\.\.player \}\)\),\n      maxPlayers: require\("\.\/protocol\.js"\)\.MAX_PLAYERS,\n      availableCharacters: require\("\.\/protocol\.js"\)\.CHARACTERS\.filter\(\(id\) => !\[\.\.\.this\.players\.values\(\)\]\.some\(\(p\) => p\.character === id\)\),\n    \};\n  \}\n    return \{\n      code: this\.code, phase: this\.phase, hostId: this\.hostId,\n      players: \[\.\.\.this\.players\.values\(\)\]\.map\(\(\{ ws, input, \.\.\.player \}\) => \(\{ \.\.\.player \}\)\),\n      maxPlayers: MAX_PLAYERS,\n      availableCharacters: CHARACTERS\.filter\(\(id\) => !\[\.\.\.this\.players\.values\(\)\]\.some\(\(p\) => p\.character === id\)\),\n    \};\n  \}/,
  `  snapshot() {
    return {
      code: this.code, phase: this.phase, hostId: this.hostId,
      players: [...this.players.values()].map(({ ws, input, ...player }) => ({ ...player })),
      maxPlayers: MAX_PLAYERS,
      availableCharacters: CHARACTERS.filter((id) => ![...this.players.values()].some((p) => p.character === id)),
    };
  }`
);

fs.writeFileSync('server/Room.js', code);
