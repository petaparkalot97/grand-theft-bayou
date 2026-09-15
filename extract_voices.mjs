import fs from 'fs';
import { resolveVoice } from './src/voiceCast.js';

const dialogueData = JSON.parse(fs.readFileSync('data/game-dialogue.json', 'utf8'));
const voices = { characters: {} };

for (const line of dialogueData.lines) {
  const who = line.character;
  const charKey = who.replace(/\s*\(V\.O\.\)\s*$/i, '').trim().toUpperCase();
  const prefix = charKey.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'npc';

  if (!voices.characters[prefix]) {
    const v = resolveVoice(who);
    voices.characters[prefix] = {
      voice_id: v.referenceId,
      voice_title: v.label,
      model: "s2.1-pro-free"
    };
  }
}

fs.writeFileSync('data/game-voices.json', JSON.stringify(voices, null, 2));
console.log('Created data/game-voices.json with', Object.keys(voices.characters).length, 'characters.');
