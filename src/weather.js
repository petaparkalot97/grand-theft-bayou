// ---------------------------------------------------------------------------
// weather.js — the current weather, as numbers other systems can use.
//
// Systems never check the weather type directly for their own tuning; they read
// the blended multipliers, so a change of weather eases in and new weather types
// only need a profile here:
//
//   weather.fogMultiplier     scene fog density
//   weather.mistMultiplier    ground mist height/strength
//   weather.lightMultiplier   moon / sky strength
//   weather.wetness           0 dry … 1 soaked (road reflections, later)
//   weather.grip              tyre grip multiplier (vehicle handling, later)
//   weather.wind              0 … 1 (foliage, rain slant, later)
//
// Today main.js applies fog, mist and light. Rain particles, thunder, wet
// roads and grip are the next steps; they read the same values.
// ---------------------------------------------------------------------------

export const WEATHER_TYPES = Object.freeze(["clear", "cloudy", "rain", "storm", "fog"]);

export const WEATHER_PROFILES = Object.freeze({
  clear:  { fog: 1.0, mist: 1.0, light: 1.0,  wetness: 0.35, grip: 1.0,  wind: 0.15 },
  cloudy: { fog: 1.2, mist: 1.1, light: 0.85, wetness: 0.35, grip: 1.0,  wind: 0.3 },
  rain:   { fog: 1.6, mist: 1.3, light: 0.7,  wetness: 1.0,  grip: 0.85, wind: 0.45 },
  storm:  { fog: 2.0, mist: 1.5, light: 0.55, wetness: 1.0,  grip: 0.75, wind: 0.9 },
  fog:    { fog: 3.0, mist: 2.2, light: 0.8,  wetness: 0.5,  grip: 0.95, wind: 0.05 },
});

/**
 * @param {object} o
 * @param {string} o.initial  starting weather type
 */
export function createWeather({ initial = "clear" } = {}) {
  let type = WEATHER_PROFILES[initial] ? initial : "clear";
  const cur = { ...WEATHER_PROFILES[type] };
  let from = { ...cur }, to = { ...cur }, blend = 1, blendTime = 0;
  const listeners = [];

  return {
    WEATHER_TYPES,
    get type() { return type; },
    /** Change the weather, easing over `seconds`. */
    set(next, { seconds = 8 } = {}) {
      if (!WEATHER_PROFILES[next] || next === type) return;
      const prev = type;
      type = next;
      from = { ...cur };
      to = { ...WEATHER_PROFILES[next] };
      blend = seconds > 0 ? 0 : 1;
      blendTime = Math.max(0.001, seconds);
      if (blend >= 1) Object.assign(cur, to);
      for (const fn of listeners) fn(next, prev);
    },
    update(dt) {
      if (blend >= 1) return;
      blend = Math.min(1, blend + dt / blendTime);
      const k = blend * blend * (3 - 2 * blend);
      for (const key of Object.keys(cur)) cur[key] = from[key] + (to[key] - from[key]) * k;
    },
    onChange(fn) { listeners.push(fn); },
    get fogMultiplier() { return cur.fog; },
    get mistMultiplier() { return cur.mist; },
    get lightMultiplier() { return cur.light; },
    get wetness() { return cur.wetness; },
    get grip() { return cur.grip; },
    get wind() { return cur.wind; },
  };
}
