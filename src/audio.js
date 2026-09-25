import * as THREE from 'three';

let listener = null;
const audioCache = new Map();

export function initAudio(camera) {
  if (!listener) {
    listener = new THREE.AudioListener();
    camera.add(listener);
  }
}

// Browsers start an AudioContext suspended until a user gesture; every sound
// built before that stays silent even after initAudio(). Call once on the
// first click (confirmCharacter).
export function resumeAudio() {
  if (listener && listener.context && listener.context.state === 'suspended') {
    listener.context.resume().catch(() => { /* stays muted until the next gesture */ });
  }
}

export function loadSound(file) {
  if (audioCache.has(file)) return Promise.resolve(audioCache.get(file));
  return new Promise(resolve => {
    new THREE.AudioLoader().load(file, buffer => {
      audioCache.set(file, buffer);
      resolve(buffer);
    }, undefined, () => resolve(null));
  });
}

export function createPositionalAudio(buffer, { volume = 1, loop = false, refDistance = 10, maxDistance = 100 } = {}) {
  if (!listener || !buffer) return null;
  const sound = new THREE.PositionalAudio(listener);
  sound.setBuffer(buffer);
  sound.setRefDistance(refDistance);
  sound.setMaxDistance(maxDistance);
  sound.setVolume(volume);
  sound.setLoop(loop);
  // Important for distance attenuation
  sound.setDistanceModel('exponential');
  return sound;
}

/**
 * Car audio, created for every registered vehicle — including the whole
 * traffic pool — but it builds real WebAudio nodes only once a car is first
 * driven (`update` called with `active`). registerVehicle runs before any
 * user gesture and before initAudio(), so eager creation would leak a
 * THREE.AudioListener into every car's JSON (context has cyclic refs) and
 * play engine loops for cars nobody is near.
 *
 * Returns { update(speedKmh, isSkidding, active), destroy } — safe to call
 * before initAudio / any gesture: it just does nothing until the world is real.
 */
export function createCarAudio(carObj) {
  const loopIdx = Math.floor(Math.random() * 5);

  const sounds = {
    engine: null,
    squeal: null,
    started: false,   // real nodes built
    active: false,    // currently the player's car

    update: (speedKmh, isSkidding, active = true) => {
      if (!listener) return;                 // initAudio() hasn't run yet
      if (!active) {                         // traffic / parked: nothing plays
        if (sounds.started) sounds.destroy();
        return;
      }
      if (!sounds.started) {
        sounds.started = true;
        const audioGroup = new THREE.Group();
        carObj.add(audioGroup);
        const myGroup = audioGroup;
        sounds.group = audioGroup;
        Promise.all([
          loadSound(`assets/audio/car/car_engine_loop${loopIdx}.wav`),
          loadSound('assets/audio/car/tires_squal_loop.wav'),
        ]).then(([engineBuf, squealBuf]) => {
          // the car may have exploded / been swapped while loading
          if (!sounds.started || sounds.group !== myGroup) return;
          sounds.engine = createPositionalAudio(engineBuf, { loop: true, volume: 0.1 });
          sounds.squeal = createPositionalAudio(squealBuf, { loop: true, volume: 0.5 });
          if (sounds.engine) { sounds.group.add(sounds.engine); sounds.engine.play(); }
          if (sounds.squeal) sounds.group.add(sounds.squeal);
        });
      }

      // The engine may still be loading on the first few frames
      if (!sounds.engine || !sounds.squeal) return;

      // Pitch engine up based on speed
      const speedNorm = Math.min(speedKmh / 100, 1);
      sounds.engine.setPlaybackRate(1.0 + (speedNorm * 1.5));
      sounds.engine.setVolume(0.1 + (speedNorm * 0.4));

      // Handle tire squeal
      if (isSkidding) {
        if (!sounds.squeal.isPlaying) sounds.squeal.play();
      } else {
        if (sounds.squeal.isPlaying) sounds.squeal.pause();
      }
    },

    destroy: () => {
      if (sounds.engine && sounds.engine.isPlaying) sounds.engine.stop();
      if (sounds.squeal && sounds.squeal.isPlaying) sounds.squeal.stop();
      if (sounds.group && sounds.group.parent) sounds.group.parent.remove(sounds.group);
      sounds.started = false;
      sounds.engine = null;
      sounds.squeal = null;
      sounds.group = null;
    },
  };

  return sounds;
}

// ---------------------------------------------------------------------------
// Zombie-mode ambience (TASK-081). Occasional distant groans — not a moan bed:
// real silence between them, more often and louder the more zombies are close.
//
// The repo has no zombie SFX (assets/audio holds car, radio, voice, theme), so
// the groans and the Screamer's wail are synthesised with WebAudio. To swap in
// recorded ones, list paths in ZOMBIE_SFX (e.g. 'assets/audio/zombie/groan0.wav')
// — a loaded file is used instead of the synth for the ordinary groan.
//
// Everything here is safe to call at any time: before initAudio(), before a
// user gesture, with the context suspended, or after stop. It never throws.
//
//   start: on entering zombie mode / at nightfall   startZombieAmbience(...)
//   stop:  at dawn / leaving the mode               stopZombieAmbience()
//   the Screamer's wail: playZombieScream(x, z)     (npc.js env.onScream)
// ---------------------------------------------------------------------------
const ZOMBIE_SFX = [];
const GROAN_MIN_GAP = 4, GROAN_MAX_GAP = 22;     // seconds, at 1 zombie ... a crowd
const HEARD_FULL_COUNT = 12;                     // this many nearby = the busiest it gets
let zAmb = null;                                 // { getPlayerPos, getCount, timer }

function audioCtx() {
  return listener && listener.context && listener.context.state === 'running' ? listener.context : null;
}

function envelope(ctx, g, peak, attack, dur) {
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}

// one synthesised voice: a detuned sawtooth pair through a moving formant
// filter, wobbled by a slow vibrato — reads as a throat, not a synth
function synthVoice(ctx, { f0, f1, dur, formant, formant1, vibHz, vibDepth, peak, pan = 0 }) {
  const t = ctx.currentTime;
  const out = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass'; filt.Q.value = 3.5;
  filt.frequency.setValueAtTime(formant, t);
  filt.frequency.linearRampToValueAtTime(formant1, t + dur);
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass'; low.frequency.value = 2400;
  const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
  lfo.frequency.value = vibHz; lfoGain.gain.value = vibDepth;
  const oscs = [0, 7].map((detune) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth'; o.detune.value = detune;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    lfo.connect(lfoGain); lfoGain.connect(o.frequency);
    o.connect(filt);
    return o;
  });
  filt.connect(low); low.connect(out);
  let tail = out;
  if (ctx.createStereoPanner) {
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    out.connect(p); tail = p;
  }
  tail.connect(listener.getInput());
  envelope(ctx, out, peak, dur * 0.3, dur);
  const end = t + dur + 0.1;
  for (const o of [...oscs, lfo]) { o.start(t); o.stop(end); }
  oscs[0].onended = () => { try { tail.disconnect(); } catch (e) { /* already gone */ } };
}

function playGroan(volume) {
  const ctx = audioCtx();
  if (!ctx) return;
  const pan = Math.random() * 1.6 - 0.8;
  if (ZOMBIE_SFX.length) {
    const file = ZOMBIE_SFX[(Math.random() * ZOMBIE_SFX.length) | 0];
    loadSound(file).then((buf) => {
      if (!buf || !audioCtx()) return;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf; g.gain.value = volume;
      src.connect(g); g.connect(listener.getInput()); src.start();
    });
    return;
  }
  const f0 = 85 + Math.random() * 40;
  synthVoice(ctx, {
    f0, f1: f0 * (0.55 + Math.random() * 0.15), dur: 1.6 + Math.random() * 1.4,
    formant: 450 + Math.random() * 250, formant1: 260 + Math.random() * 120,
    vibHz: 4 + Math.random() * 3, vibDepth: 3 + Math.random() * 5, peak: 0.16 * volume, pan,
  });
}

/** The Screamer's wail at (x, z): louder and higher than a groan, fading with distance. */
export function playZombieScream(x, z) {
  try {
    const ctx = audioCtx();
    if (!ctx || !zAmb) return;
    const p = zAmb.getPlayerPos();
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > 130) return;
    synthVoice(ctx, {
      f0: 520, f1: 980, dur: 1.5, formant: 900, formant1: 1700,
      vibHz: 9, vibDepth: 22, peak: 0.28 * (1 - d / 130), pan: Math.max(-0.9, Math.min(0.9, (x - p.x) / 60)),
    });
  } catch (e) { /* audio must never take the game down */ }
}

function scheduleGroan() {
  if (!zAmb) return;
  let gap = 3;                       // nobody near: just check back
  try {
    const n = zAmb.getCount();
    if (n > 0) {
      const crowd = Math.min(1, n / HEARD_FULL_COUNT);
      playGroan(0.35 + 0.65 * crowd);
      gap = GROAN_MAX_GAP - (GROAN_MAX_GAP - GROAN_MIN_GAP) * crowd;
      gap *= 0.6 + Math.random() * 0.8;    // never a metronome
    }
  } catch (e) { /* keep the loop alive */ }
  zAmb.timer = setTimeout(scheduleGroan, gap * 1000);
}

/**
 * Begin the ambience. `getPlayerPos()` -> {x, z}; `getNearbyZombieCount()` ->
 * how many zombies are close enough to be heard. Idempotent.
 */
export function startZombieAmbience(getPlayerPos, getNearbyZombieCount) {
  if (zAmb) return;
  zAmb = { getPlayerPos, getCount: getNearbyZombieCount, timer: null };
  zAmb.timer = setTimeout(scheduleGroan, 2000);
}

export function stopZombieAmbience() {
  if (!zAmb) return;
  clearTimeout(zAmb.timer);
  zAmb = null;
}
