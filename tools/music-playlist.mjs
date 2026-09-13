// Writes assets/music/playlist.json from the audio files in assets/music/.
// Used by `npm run build` for static hosting; the local dev server (serve.mjs)
// lists the folder live instead, so adding or deleting a track needs no rebuild.
import { readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const AUDIO_EXT = /\.(mp3|ogg|oga|wav|m4a|aac|flac|opus|webm)$/i;

export function listTracks(dir) {
  try {
    return readdirSync(dir).filter((f) => AUDIO_EXT.test(f)).sort();
  } catch {
    return [];
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = fileURLToPath(new URL("../assets/music/", import.meta.url));
  const tracks = listTracks(dir);
  writeFileSync(dir + "playlist.json", JSON.stringify({ tracks }, null, 2) + "\n");
  console.log(`playlist.json: ${tracks.length} track(s)`);
}
