// ---------------------------------------------------------------------------
// music.js — the background soundtrack.
//
// Plays every audio file in assets/music/ in a shuffled order, reshuffling each
// time the list runs out. The list comes from assets/music/playlist.json, which
// the dev server generates live and `npm run build` writes for static hosting.
// With no tracks it falls back to the original theme, looped.
// ---------------------------------------------------------------------------

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function createSoundtrack(audio, { fallback } = {}) {
  let tracks = [];
  try {
    const r = await fetch("./assets/music/playlist.json", { cache: "no-store" });
    if (r.ok) tracks = ((await r.json()).tracks || []).map((f) => "./assets/music/" + encodeURIComponent(f));
  } catch {
    // offline or no playlist: fall through to the fallback theme
  }
  if (!tracks.length && fallback) tracks = [fallback];

  let order = shuffle(tracks);
  let index = 0;
  let failures = 0;
  let wanted = false;          // play() has been called (autoplay needs a gesture)

  function load(i) {
    if (!order.length) return;
    if (i >= order.length) {
      // reshuffle, avoiding an immediate repeat of the last track
      const last = order[order.length - 1];
      order = shuffle(tracks);
      if (order.length > 1 && order[0] === last) order.push(order.shift());
      i = 0;
    }
    index = i;
    audio.loop = tracks.length === 1;
    audio.src = order[index];
    if (wanted) audio.play().catch(() => {});
  }

  audio.addEventListener("ended", () => load(index + 1));
  audio.addEventListener("playing", () => { failures = 0; });
  audio.addEventListener("error", () => {
    // a deleted or unreadable file: skip it, but don't spin on a broken list
    if (++failures < tracks.length) load(index + 1);
  });

  audio.removeAttribute("src");
  load(0);

  return {
    get tracks() { return tracks.slice(); },
    get current() { return order[index] || null; },
    play() {
      wanted = true;
      return audio.play().catch(() => {});
    },
    next() { load(index + 1); },
  };
}
