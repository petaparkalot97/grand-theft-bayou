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
