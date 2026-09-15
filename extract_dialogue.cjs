const fs = require('fs');

const files = fs.readdirSync('src').filter(f => f.endsWith('.js'));
const dialogue = [];
const counts = {};

for (const file of files) {
  const content = fs.readFileSync('src/' + file, 'utf8');
  // Match say(c, 'WHO', 'TEXT') or c.say('WHO', 'TEXT')
  const regex = /(?:say\(c,\s*|c\.say\()([\"'])(.*?)\1,\s*([\"'])(.*?)\3\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const who = match[2];
    const text = match[4];
    
    // Normalize character name for ID
    const charKey = who.replace(/\s*\(V\.O\.\)\s*$/i, '').trim().toUpperCase();
    const prefix = charKey.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'npc';
    
    counts[prefix] = (counts[prefix] || 0) + 1;
    const id = prefix + '_' + counts[prefix].toString().padStart(3, '0');
    
    dialogue.push({
      id: id,
      character: who,
      text: text
    });
  }
}

fs.mkdirSync('data', {recursive: true});
fs.writeFileSync('data/game-dialogue.json', JSON.stringify({lines: dialogue}, null, 2));
console.log('Extracted', dialogue.length, 'lines.');
