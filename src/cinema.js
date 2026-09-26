// ---------------------------------------------------------------------------
// cinema.js — cutscenes.
//
// A tiny timeline toolkit for the story: letterbox bars, subtitles with a
// speaker name, location / mission cards, a title that gets blown apart, black
// fades, scripted camera moves and synthesized sound effects. Scenes are plain
// async functions:
//
//   await cine.scene(async (c) => {
//     c.letterbox(true);
//     c.shot({ from: [0, 20, 40], to: [0, 12, 20], look: [0, 0, 0], dur: 4 });
//     await c.say("KESEME", "That's water.");
//   });
//
// Timing runs on game time (update(dt)), so it pauses with the game. Enter
// finishes the current line; Esc skips the rest of the scene, and every wait,
// line and camera move inside it completes instantly.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const $ = (id) => document.getElementById(id);
const smooth = (t) => t * t * (3 - 2 * t);

export function createCinema({ camera, muted = () => false }) {
  const el = {
    black: $("cineBlack"), flash: $("cineFlash"), card: $("cineCard"),
    title: $("cineTitle"), sub: $("cineSub"),
  };
  const waits = new Set();          // { t, resolve, line }
  let inScene = false;
  let skipping = false;
  let shotState = null;
  let sceneQueue = Promise.resolve();   // scenes play one after another (see scene())
  const look = new THREE.Vector3();

  function wait(seconds, line = false) {
    if (skipping || seconds <= 0) return Promise.resolve();
    return new Promise((resolve) => waits.add({ t: seconds, resolve, line }));
  }

  function flush(onlyLines) {
    for (const w of [...waits]) {
      if (onlyLines && !w.line) continue;
      waits.delete(w);
      w.resolve();
    }
  }

  addEventListener("keydown", (e) => {
    if (!inScene) return;
    if (e.code === "Enter" || e.code === "NumpadEnter") { e.preventDefault(); flush(true); }
    if (e.code === "Escape") { skipping = true; flush(false); finishShot(); stopVoice(); }
  });

  // ---------------------------------------------------------------- camera
  const v3 = (a, fallback) => (a ? new THREE.Vector3(a[0], a[1], a[2]) : fallback.clone());

  function applyShot() {
    const s = shotState;
    const k = s.ease(Math.min(1, s.t / s.dur));
    camera.position.lerpVectors(s.from, s.to, k);
    look.lerpVectors(s.look0, s.look1, k);
    camera.lookAt(look);
  }
  function finishShot() {
    if (!shotState) return;
    shotState.t = shotState.dur;
    applyShot();
  }

  // ------------------------------------------------------------- voiceover
  // Lines are generated offline by `npm run voiceover` (tools/voiceover-gen.mjs)
  // via the Fish Audio API, keyed by "WHO::text" in assets/audio/voice/manifest.json.
  // Missing/offline just means no voice audio — subtitles still work standalone.
  let voiceManifest = null;
  let voiceManifestPromise = null;
  let activeVoice = null;
  function loadVoiceManifest() {
    if (!voiceManifestPromise) {
      voiceManifestPromise = fetch("./assets/audio/voice/manifest.json", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : {}))
        .catch(() => ({}))
        .then((m) => (voiceManifest = m));
    }
    return voiceManifestPromise;
  }
  loadVoiceManifest();
  function stopVoice() {
    if (activeVoice) { activeVoice.pause(); activeVoice = null; }
    if ("speechSynthesis" in window) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
  }
  // Returns a Promise for the clip's real duration (0 if there's no audio —
  // muted, skipping, or the browser TTS fallback) so say() can hold the line
  // on screen at least that long instead of guessing from text length alone.
  function playVoiceLine(who, text, { tts = true } = {}) {
    stopVoice();
    if (muted() || skipping) return Promise.resolve(0);
    if (voiceManifest) {
      const fileName = voiceManifest[`${who}::${text}`];
      if (fileName) {
        const audioEl = new Audio(`./assets/audio/voice/${fileName}`);
        audioEl.volume = 0.95;
        activeVoice = audioEl;
        return new Promise((resolve) => {
          const done = () => resolve(Number.isFinite(audioEl.duration) ? audioEl.duration : 0);
          audioEl.addEventListener("loadedmetadata", done, { once: true });
          audioEl.addEventListener("error", () => resolve(0), { once: true });
          audioEl.play().catch(() => resolve(0));
        });
      }
    }
    if (tts && "speechSynthesis" in window) {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.volume = 0.85;
        window.speechSynthesis.speak(u);
      } catch (e) {}
    }
    return Promise.resolve(0);
  }

  // ---------------------------------------------------------------- sound
  let ac = null;
  function audio() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; }
    }
    if (ac && ac.state === "suspended") ac.resume().catch(() => {});
    return ac;
  }
  function noiseBuffer(a, seconds, shape) {
    const len = Math.floor(a.sampleRate * seconds);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * shape(i / len);
    return buf;
  }
  function sfx(kind, volume = 1) {
    if (muted() || skipping) return;
    const a = audio();
    if (!a) return;
    const t = a.currentTime;
    const out = a.createGain();
    out.gain.value = 0.45 * volume;
    out.connect(a.destination);

    if (kind === "shotgun" || kind === "gunshot") {
      const far = kind === "gunshot";
      const src = a.createBufferSource();
      // Increase buffer duration and lengthen the exponential envelope
      src.buffer = noiseBuffer(a, far ? 0.35 : 0.9, (p) => Math.pow(1 - p, far ? 6 : 2.5));
      const lp = a.createBiquadFilter();
      lp.type = "lowpass";
      // Lower starting frequency, heavy bass taper
      lp.frequency.setValueAtTime(far ? 900 : 2800, t);
      lp.frequency.exponentialRampToValueAtTime(far ? 200 : 120, t + 0.8);
      
      const peq = a.createBiquadFilter();
      peq.type = "peaking";
      peq.frequency.value = 140; // Bass thump
      peq.Q.value = 0.8;
      peq.gain.value = far ? 0 : 8;

      if (far) out.gain.value *= 0.35;
      else out.gain.value *= 1.2; // louder
      src.connect(lp).connect(peq).connect(out);
      src.start(t);
      
      if (!far) {
        // High frequency initial "crack"
        const snap = a.createBufferSource();
        snap.buffer = noiseBuffer(a, 0.08, (p) => Math.pow(1 - p, 10));
        const hp = a.createBiquadFilter();
        hp.type = "highpass"; hp.frequency.value = 1800;
        const snapGain = a.createGain();
        snapGain.gain.value = 1.0 * volume;
        snap.connect(hp).connect(snapGain).connect(a.destination);
        snap.start(t);
      }
    } else if (kind === "pistolShot") {
      // A crisp mid-range crack — shorter and brighter than the shotgun's boom.
      const src = a.createBufferSource();
      src.buffer = noiseBuffer(a, 0.16, (p) => Math.pow(1 - p, 4.5));
      const lp = a.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(3200, t);
      lp.frequency.exponentialRampToValueAtTime(450, t + 0.14);
      out.gain.value *= 0.7;
      src.connect(lp).connect(out);
      src.start(t);
    } else if (kind === "tec9Shot") {
      // Very short and tinny — a light, fast-firing round. Quieter per shot
      // since the Tec-9's cooldown (0.13s) means these stack up fast.
      const src = a.createBufferSource();
      src.buffer = noiseBuffer(a, 0.09, (p) => Math.pow(1 - p, 6));
      const bp = a.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 2600; bp.Q.value = 1.1;
      out.gain.value *= 0.42;
      src.connect(bp).connect(out);
      src.start(t);
    } else if (kind === "rifleShot") {
      // A sharp, powerful crack: a noise burst plus a brief high bandpass
      // "snap" layered on top, distinct from the shotgun's low boom.
      const body = a.createBufferSource();
      body.buffer = noiseBuffer(a, 0.24, (p) => Math.pow(1 - p, 3.2));
      const lp = a.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(5200, t);
      lp.frequency.exponentialRampToValueAtTime(320, t + 0.22);
      body.connect(lp).connect(out);
      body.start(t);

      const snap = a.createBufferSource();
      snap.buffer = noiseBuffer(a, 0.035, (p) => Math.pow(1 - p, 8));
      const bp = a.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 4400; bp.Q.value = 0.8;
      const snapGain = a.createGain();
      snapGain.gain.value = 0.6 * volume;
      snap.connect(bp).connect(snapGain).connect(a.destination);
      snap.start(t);

      out.gain.value *= 1.15;
    } else if (kind === "static") {
      const src = a.createBufferSource();
      src.buffer = noiseBuffer(a, 0.4, () => 0.5);
      const bp = a.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 2400; bp.Q.value = 0.6;
      out.gain.value *= 0.4;
      src.connect(bp).connect(out);
      src.start(t);
    } else if (kind === "siren") {
      const o = a.createOscillator();
      o.type = "sawtooth";
      for (let i = 0; i < 8; i++) {
        o.frequency.setValueAtTime(620, t + i * 0.4);
        o.frequency.linearRampToValueAtTime(980, t + i * 0.4 + 0.2);
      }
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(0.12 * volume, t + 0.6);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      o.connect(out);
      o.start(t);
      o.stop(t + 3.3);
    } else if (kind === "ring") {
      for (let r = 0; r < 2; r++) {
        for (const f of [440, 480]) {
          const o = a.createOscillator();
          o.frequency.value = f;
          const g = a.createGain();
          g.gain.setValueAtTime(0.0001, t + r * 0.55);
          g.gain.exponentialRampToValueAtTime(0.15, t + r * 0.55 + 0.02);
          g.gain.setValueAtTime(0.15, t + r * 0.55 + 0.38);
          g.gain.exponentialRampToValueAtTime(0.0001, t + r * 0.55 + 0.42);
          o.connect(g).connect(out);
          o.start(t + r * 0.55);
          o.stop(t + r * 0.55 + 0.45);
        }
      }
    } else if (kind === "squeal") {
      const o = a.createOscillator();
      o.type = "square";
      o.frequency.setValueAtTime(700, t);
      o.frequency.exponentialRampToValueAtTime(1500, t + 0.12);
      o.frequency.exponentialRampToValueAtTime(600, t + 0.45);
      const bp = a.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 1100; bp.Q.value = 2;
      out.gain.setValueAtTime(0.0001, t);
      out.gain.exponentialRampToValueAtTime(0.2 * volume, t + 0.04);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(bp).connect(out);
      o.start(t);
      o.stop(t + 0.55);
    } else if (kind === "chime") {
      const o = a.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(880, t);
      o.frequency.setValueAtTime(660, t + 0.14);
      out.gain.setValueAtTime(0.12, t);
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(out);
      o.start(t);
      o.stop(t + 0.5);
    }
  }

  // ---------------------------------------------------------------- the api
  const api = {
    get active() { return inScene; },
    /** True while a scripted shot owns the camera (main.js skips its camera). */
    get hasCamera() { return !!shotState; },
    get skipping() { return skipping; },

    wait,
    sfx,
    // Ambient one-liners (pedestrianChatter.js) that need real audio but no
    // on-screen subtitle or scene ownership — say() drives both; this is the
    // bare audio half. Returns a Promise for the clip's duration (0 if muted,
    // skipping, or no manifest entry — falls back to browser speechSynthesis).
    playVoiceLine,

    letterbox(on) { document.body.classList.toggle("letterbox", !!on); },

    black(on, seconds = 1) {
      el.black.style.setProperty("--fade", (skipping ? 0 : seconds) + "s");
      el.black.classList.toggle("on", !!on);
      return wait(seconds);
    },

    flash() {
      el.flash.classList.remove("on");
      void el.flash.offsetWidth;
      el.flash.classList.add("on");
    },

    /** A location / mission card. Resolves when it has faded back out. */
    async card(kicker, big, sub = "", { center = false, hold = 2.6 } = {}) {
      el.card.querySelector("small").textContent = kicker || "";
      el.card.querySelector("b").textContent = big || "";
      el.card.querySelector("span").textContent = sub || "";
      el.card.classList.toggle("center", center);
      el.card.classList.add("on");
      await wait(hold, true);
      el.card.classList.remove("on");
      await wait(0.5);
    },

    /** Show the game title, then blow it apart with a shotgun blast. */
    async title(text, hold = 2.2) {
      el.title.textContent = text;
      el.title.classList.remove("blast");
      el.title.classList.add("on");
      await wait(hold, true);
      sfx("shotgun", 1.3);
      api.flash();
      el.title.classList.add("blast");
      await wait(1.1);
      el.title.classList.remove("on", "blast");
    },

    /**
     * One subtitle line. Duration scales with its length, but never cuts off
     * real recorded voice audio short — whichever is longer wins. Enter skips it.
     *
     * `voiceWho`, if given, is looked up for the audio/voice cast instead of
     * `who` while the on-screen name still shows `who` — for a character
     * whose voice actually changes at some point in the story (e.g. Keseme
     * pre/post transition in missionClinic.js) without renaming them on
     * screen.
     */
    async say(who, text, seconds, voiceWho) {
      await loadVoiceManifest();
      const audioDur = await playVoiceLine(voiceWho || who, text);
      const textDur = seconds != null ? seconds : Math.min(6, Math.max(1.7, 1.1 + text.length * 0.055));
      const dur = audioDur > 0 ? Math.max(textDur, audioDur + 0.15) : textDur;
      el.sub.classList.remove("action");
      el.sub.querySelector("em").textContent = who || "";
      el.sub.querySelector("span").textContent = text;
      el.sub.classList.add("on");
      await wait(dur, true);
      stopVoice();
      el.sub.classList.remove("on");
      await wait(0.12);
    },

    /** An action / sound line from the script, shown in italics. */
    async caption(text, seconds) {
      el.sub.classList.add("action");
      el.sub.querySelector("em").textContent = "";
      el.sub.querySelector("span").textContent = text;
      el.sub.classList.add("on");
      await wait(seconds != null ? seconds : Math.max(1.2, text.length * 0.05), true);
      el.sub.classList.remove("on");
      await wait(0.1);
    },

    /**
     * Move the camera. `from` defaults to where it is now, `to` to `from`,
     * `lookTo` to `look`. Returns a promise that resolves when the move ends.
     */
    shot({ from, to, look: l0, lookTo, dur = 3, ease = smooth }) {
      const start = v3(from, camera.position);
      shotState = {
        from: start, to: to ? v3(to) : start.clone(),
        look0: v3(l0), look1: lookTo ? v3(lookTo) : v3(l0),
        t: 0, dur, ease,
      };
      if (skipping) finishShot();
      else applyShot();
      return wait(dur);
    },

    /** Hand the camera back to gameplay. */
    releaseCamera() { shotState = null; },

    /**
     * Run a scene. While it runs, `active` is true; afterwards the UI is
     * cleared and the camera released, whether it finished or was skipped.
     *
     * Scenes never overlap: one requested while another is playing waits for
     * it to finish. Two at once used to clobber each other — when the first
     * ended, its cleanup reset the second's skip flag, letterbox and camera,
     * so Esc stopped working mid-scene. Never await a scene from inside
     * another scene; it would wait for itself.
     */
    scene(fn) {
      const play = async () => {
        inScene = true;
        skipping = false;
        try {
          await fn(api);
        } finally {
          flush(false);
          stopVoice();
          inScene = false;
          skipping = false;
          shotState = null;
          el.sub.classList.remove("on");
          el.card.classList.remove("on");
          el.title.classList.remove("on", "blast");
          el.black.classList.remove("on");
          api.letterbox(false);
        }
      };
      const run = sceneQueue.then(play);
      sceneQueue = run.catch(() => {});
      return run;
    },

    update(dt) {
      for (const w of [...waits]) {
        w.t -= dt;
        if (w.t <= 0) { waits.delete(w); w.resolve(); }
      }
      if (shotState && shotState.t < shotState.dur) {
        shotState.t += dt;
        applyShot();
      }
    },
  };
  return api;
}
