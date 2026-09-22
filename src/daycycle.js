// ---------------------------------------------------------------------------
// daycycle.js — what the world looks like at a given hour.
//
// One pure function: the clock (worldtime.js) goes in, the whole lighting state
// comes out — where the sun is, what colour and how strong the key light is,
// the hemisphere fill, the fog, the ground mist, how bright the sky probe reads,
// and whether the street lamps and headlights are on. main.js applies it; nothing
// here touches three.js, so it can be read and tested on its own.
//
// The game used to render dusk → night only: the sun sat just under the horizon
// and everything followed a single `dusk` 0…1 ramp. Now the sun actually rises,
// crosses the sky and sets, and noon looks like noon.
//
// Louisiana, summer: sunrise ~05:50, sunset ~20:10, the sun high and slightly
// south at midday. Azimuth is compass degrees (90 E, 180 S, 270 W) for the Sky
// shader; elevation is degrees above the horizon, negative below it.
// ---------------------------------------------------------------------------

export const SUNRISE = 5.9;
export const SUNSET = 20.15;
const NOON_ELEVATION = 72;        // degrees at the top of the arc
const NIGHT_DEPTH = 34;           // how far below the horizon at the dead of night

// Human report (2026-09-23): the actual daytime arc (dawn through evening)
// reads far too bright/blown-out; the world only starts looking right once
// the sun drops toward golden hour, around 19:30. 18:00 itself is not a safe
// freeze/unfreeze point: the sun is still ~33 degrees up at 18:00 in this
// SUNSET=20.15 model (the `day` ramp is already pegged at 1, same brightness
// as noon), so stopping the freeze there would leave a bright flash between
// 18:00 and ~19:00 as the curve caught back up. Instead the freeze runs all
// the way from SUNRISE to the moment the natural curve reaches that same
// 19:30 golden look (sun static, no arc, no flash), then hands off to the
// existing 19:30 -> night -> dawn curve exactly as it already plays today.
const DAY_FREEZE_UNTIL_HOUR = 19.5;
const DAY_FREEZE_LOOK_HOUR = 19.5;

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
/** 0 below `a`, 1 above `b`, smooth between. */
const ramp = (x, a, b) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Mix two 0xRRGGBB colours. */
function mixHex(a, b, t) {
  const k = clamp01(t);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(lerp(ar, br, k)) << 16) | (Math.round(lerp(ag, bg, k)) << 8) | Math.round(lerp(ab, bb, k));
}

/** Sun elevation in degrees at `hour` (negative at night). */
export function sunElevation(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= SUNRISE && h <= SUNSET) return NOON_ELEVATION * Math.sin((Math.PI * (h - SUNRISE)) / (SUNSET - SUNRISE));
  const night = 24 - (SUNSET - SUNRISE);                 // hours of darkness
  const since = h > SUNSET ? h - SUNSET : h + 24 - SUNSET;
  return -NIGHT_DEPTH * Math.sin((Math.PI * since) / night);
}

/** Compass azimuth of the sun (or the moon, at night) in degrees. */
export function sunAzimuth(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= SUNRISE && h <= SUNSET) return lerp(84, 276, (h - SUNRISE) / (SUNSET - SUNRISE));   // ENE → WNW
  const night = 24 - (SUNSET - SUNRISE);
  const since = h > SUNSET ? h - SUNSET : h + 24 - SUNSET;
  return (276 + (168 * since) / night) % 360;            // the moon carries on round
}

// key light: deep night → moonlight, first light → sunrise amber, noon → white
const MOON_LIGHT = 0xc8d8ff, DAWN_LIGHT = 0xffb070, DAY_LIGHT = 0xfff4e2;
// hemisphere fill, sky and ground halves
const NIGHT_SKY = 0x4a6a8c, DAY_SKY = 0xa8cbe8, NIGHT_GROUND = 0x2a2c1c, DAY_GROUND = 0x7a7358;
// fog: night blue, dusk/dawn amber, daytime haze
const NIGHT_FOG = 0x24353f, GOLDEN_FOG = 0xd8a878, DAY_FOG = 0xb0c6d6;

/**
 * The lighting state at `hour` (0…24).
 * @returns {{elevation:number, azimuth:number, day:number, golden:number, night:number,
 *   lightColor:number, lightIntensity:number, hemiSky:number, hemiGround:number,
 *   hemiIntensity:number, envIntensity:number, bgIntensity:number, fogColor:number,
 *   fogDensity:number, mist:number, lampsOn:number, turbidity:number, rayleigh:number}}
 */
export function skyState(hour) {
  const h = (hour >= SUNRISE && hour < DAY_FREEZE_UNTIL_HOUR) ? DAY_FREEZE_LOOK_HOUR : hour;
  const elevation = sunElevation(h);
  const azimuth = sunAzimuth(h);
  // three overlapping moods, by how high the sun is
  const day = ramp(elevation, 2, 20);            // full daylight
  const night = 1 - ramp(elevation, -8, 1);      // full dark
  const golden = clamp01(1 - Math.abs(elevation - 4) / 12) * (1 - night * 0.5);   // low sun, warm

  const lightColor = mixHex(mixHex(MOON_LIGHT, DAWN_LIGHT, ramp(elevation, -7, 3)), DAY_LIGHT, day);
  // Keep the day/night key below the PBR probe and local lights; the previous
  // range made pale walls and roads clip, especially around OrleaRouge lamps.
  const lightIntensity = lerp(1.35, 1.8, day) * lerp(1, 0.55, night);
  return {
    elevation, azimuth, day, golden, night,
    lightColor,
    lightIntensity,
    hemiSky: mixHex(NIGHT_SKY, DAY_SKY, day),
    hemiGround: mixHex(NIGHT_GROUND, DAY_GROUND, day),
    // less fill by day: the sun is doing the work, and its shadows should show
    hemiIntensity: lerp(0.62, 0.62, day),
    // the probe is dark at night, so it gets turned up to keep an ambient term;
    // in daylight it is already bright and 1.0 is plenty
    envIntensity: lerp(0.65, 1.0, night),
    bgIntensity: lerp(0.72, 0.62, night),
    fogColor: mixHex(mixHex(NIGHT_FOG, DAY_FOG, day), GOLDEN_FOG, golden * 0.75),
    fogDensity: lerp(0.0011, 0.0032, night),
    mist: lerp(0.006, 0.062, night),             // ground mist is a night thing
    lampsOn: night,                              // street lamps, shop glow, headlights
    // The filmic exposure was tuned for a night game; daylight through the same
    // 1.55 blows the sky and every pale wall out to white.
    exposure: lerp(0.78, 1.18, night),
    turbidity: lerp(6, 3.4, day),
    rayleigh: lerp(2.4, 1.6, day),
    // the filmic grade (graphics.js): daylight wants contrast and colour, night
    // wants the softer, grainier, heavily vignetted look the game shipped with
    grade: {
      contrast: lerp(1.16, 1.08, night),
      saturation: lerp(1.22, 1.05, night) + golden * 0.06,
      vignette: lerp(0.3, 0.42, night),
      grain: lerp(0.028, 0.05, night),
      shadowTint: mixHex(0x16242e, 0x1b2b38, day),
      highlightTint: mixHex(0xffe6c2, mixHex(0xfff4e6, 0xffd9a0, golden), day),
    },
  };
}
