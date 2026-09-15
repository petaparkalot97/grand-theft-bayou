const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
  if (m && !m[1].startsWith('#')) acc[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  return acc;
}, {});
async function check() {
  const res = await fetch('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + env.FISH_AUDIO_API_KEY, 'Content-Type': 'application/json', 'model': 's1' },
    body: JSON.stringify({ text: 'Testing', reference_id: 'f1b549768da341069e84d25c5b354d50', format: 'mp3' })
  });
  console.log('Status for s1:', res.status);
  if (res.status !== 200) console.log('Body:', await res.text());
}
check();
