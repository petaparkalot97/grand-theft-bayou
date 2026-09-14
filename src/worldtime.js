// ---------------------------------------------------------------------------
// worldtime.js — the one clock. Anything that cares what time it is asks here.
//
//   worldTime.getCurrentTime()   → { day, hour, minute }
//   worldTime.isNight()          → true between NIGHT_START and DAWN_END
//   worldTime.dusk               → 0 (daylight / dusk start) … 1 (full night)
//   worldTime.onHour(fn)         → called with (hour, day) on every new hour
//
// Today the game only renders dusk → night (sky elevation, fog, mist, moon
// strength all follow `dusk`). The clock already runs a full day so a later day
// cycle, NPC schedules, shop hours, spawning and weather can all read the same
// time. Nothing else in the codebase keeps its own timer for time of day.
// ---------------------------------------------------------------------------

export const SECONDS_PER_DAY = 24 * 3600;

// the dusk ramp: light starts going at DUSK_START, full night by NIGHT_START,
// and it lifts again from DAWN_START to DAWN_END
export const DUSK_START = 18.5;
export const NIGHT_START = 22;
export const DAWN_START = 5;
export const DAWN_END = 7;

/**
 * @param {object} o
 * @param {number} o.hour   starting hour (18.5 = 18:30, when the game opens)
 * @param {number} o.day    starting day
 * @param {number} o.scale  game seconds per real second. The default keeps the
 *   old feel: dusk to full night (3.5 game hours) takes ~10.4 real minutes.
 */
export function createWorldTime({ hour = DUSK_START, day = 1, scale = (3.5 * 3600) / 625 } = {}) {
  let t = hour * 3600;
  let d = day;
  let paused = false;
  let lastHour = Math.floor(hour);
  const hourListeners = [];

  const hours = () => t / 3600;

  function darkness(h) {
    if (h >= NIGHT_START || h < DAWN_START) return 1;
    if (h >= DUSK_START) return (h - DUSK_START) / (NIGHT_START - DUSK_START);
    if (h < DAWN_END) return 1 - (h - DAWN_START) / (DAWN_END - DAWN_START);
    return 0;
  }

  return {
    /** Advance the clock (call once per frame with real seconds). */
    update(dt) {
      if (paused) return;
      t += dt * scale;
      while (t >= SECONDS_PER_DAY) { t -= SECONDS_PER_DAY; d++; }
      const h = Math.floor(hours());
      if (h !== lastHour) {
        lastHour = h;
        for (const fn of hourListeners) fn(h, d);
      }
    },
    getCurrentTime() {
      const h = hours();
      return { day: d, hour: Math.floor(h), minute: Math.floor((h % 1) * 60) };
    },
    /** Hours as a float, 0 … 24. */
    get hours() { return hours(); },
    get day() { return d; },
    isNight() {
      const h = hours();
      return h >= NIGHT_START || h < DAWN_START;
    },
    /** 0 in daylight, rising through dusk to 1 at night, falling again at dawn. */
    get dusk() { return darkness(hours()); },
    /** Jump the clock (QA, story beats). */
    setTime(hour, day = d) { t = ((hour % 24) + 24) % 24 * 3600; d = day; lastHour = Math.floor(hours()); },
    get scale() { return scale; },
    set scale(s) { scale = Math.max(0, s); },
    get paused() { return paused; },
    set paused(p) { paused = !!p; },
    onHour(fn) { hourListeners.push(fn); },
    /** "18:30" */
    label() {
      const { hour: h, minute: m } = this.getCurrentTime();
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    },
  };
}
