import * as THREE from 'three';

let listener = null;
const audioCache = new Map();

export function initAudio(camera) {
  if (!listener) {
    listener = new THREE.AudioListener();
    camera.add(listener);
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

export function createCarAudio(carObj) {
  if (!listener) return;
  
  // Attach sounds to the car
  const audioGroup = new THREE.Group();
  carObj.add(audioGroup);

  const sounds = {
    engine: null,
    squeal: null,
    update: (speedKmh, isSkidding) => {
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
    }
  };

  // Pick a random engine loop
  const loopIdx = Math.floor(Math.random() * 5);
  Promise.all([
    loadSound(`assets/audio/car/car_engine_loop${loopIdx}.wav`),
    loadSound(`assets/audio/car/tires_squal_loop.wav`)
  ]).then(([engineBuf, squealBuf]) => {
    sounds.engine = createPositionalAudio(engineBuf, { loop: true, volume: 0.1 });
    sounds.squeal = createPositionalAudio(squealBuf, { loop: true, volume: 0.5 });
    
    if (sounds.engine) {
      audioGroup.add(sounds.engine);
      sounds.engine.play();
    }
    if (sounds.squeal) {
      audioGroup.add(sounds.squeal);
    }
  });

  return sounds;
}
