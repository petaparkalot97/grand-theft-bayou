// ---------------------------------------------------------------------------
// radio.js — the in-vehicle radio. Plays while the player is driving, silent
// on foot, cycling assets/audio/radio/'s tracks with a plain HTMLAudioElement
// (same approach createSoundtrack() uses for the background music player) so
// there's no WebAudio graph to build. Fades in/out on enter/exit instead of
// cutting off mid-beat.
//
// Track order shuffles once at boot and again every time it loops, so two
// drives in a row don't always open on the same song. Human-written DJ voice
// lines between tracks are a separate follow-up (TASK-054) — this ships the
// music-only version first.
// ---------------------------------------------------------------------------

const TRACKS = [
  "nola-boom-bap.mp3",
  "park-a-drum-kit.mp3",
  "motivia-squad.mp3",
  "free-from-satans-brick-house.mp3",
];

function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createRadio() {
  const el = new Audio();
  el.preload = "auto";
  el.volume = 0;
  let order = shuffled(TRACKS);
  let idx = 0;
  let targetVolume = 0.5;
  let fadeRaf = null;
  let playing = false;

  function loadCurrent() {
    el.src = `./assets/audio/radio/${order[idx]}`;
  }
  el.addEventListener("ended", () => {
    idx++;
    if (idx >= order.length) { idx = 0; order = shuffled(TRACKS); }
    loadCurrent();
    if (playing) el.play().catch(() => {});
  });

  function fadeTo(target, ms) {
    if (fadeRaf) cancelAnimationFrame(fadeRaf);
    const start = el.volume, t0 = performance.now();
    (function step() {
      const t = Math.min(1, (performance.now() - t0) / ms);
      el.volume = start + (target - start) * t;
      if (t < 1) fadeRaf = requestAnimationFrame(step);
      else fadeRaf = null;
    })();
  }

  return {
    play() {
      if (playing) return;
      playing = true;
      if (!el.src) loadCurrent();
      el.play().catch(() => {});   // blocked until a user gesture fires — same caveat as the music player
      fadeTo(targetVolume, 800);
    },
    stop() {
      if (!playing) return;
      playing = false;
      fadeTo(0, 500);
      setTimeout(() => { if (!playing) el.pause(); }, 550);
    },
    setVolume(v) { targetVolume = v; if (playing) fadeTo(v, 200); },
    get isPlaying() { return playing; },
  };
}
