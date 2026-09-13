BACKGROUND MUSIC
================

Drop audio files in this folder to add them to the game's soundtrack.
Delete a file to remove it. The game shuffles through everything here.

Supported: .mp3 .ogg .wav .m4a .aac .flac .opus .webm

- Running locally (start-game.cmd / npm start): changes show up the next time
  you load the page. No restart needed.
- Deploying as a static site (Cloudflare Pages): the build step
  (npm run build) writes playlist.json from this folder's contents.
- If the folder has no audio files, the game falls back to
  assets/audio/theme.mp3.

M mutes the music in game; N skips to the next track.
