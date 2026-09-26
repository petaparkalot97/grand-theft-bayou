// ---------------------------------------------------------------------------
// graphics.js — the "real life 4K" render pipeline for Grand Theft Bayou.
//
// The world is built from low-poly / PSX-era asset packs whose materials are a
// flat albedo and nothing else. This module turns them into physically-based
// surfaces and renders them through a filmic HDR pipeline:
//
//   * ACES filmic tone mapping + a physical sky baked into an IBL probe,
//   * per-material PBR classification (paint / chrome / glass / rubber / ...),
//   * normal + ORM (occlusion-roughness-metalness) maps DERIVED from each
//     albedo at load time, so a 256px pack texture gains real micro-surface,
//   * GTAO -> bloom -> filmic grade -> SMAA, rendered into an internal buffer
//     that targets 4K and backs off on its own if the frame rate can't hold it.
//
// Everything is generated at runtime — no new binary assets in the repo.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";

// --------------------------------------------------------------- quality tiers
// `scale` is the long edge, in pixels, the internal render buffer aims for.
// `derive` caps the generated normal/ORM maps. Do not raise it past 512: the
// derived detail is mostly high-frequency micro-noise that gains nothing at
// 1024, while the CPU cost of the material pass scales with its square — at
// 1024 the load pass took long enough to look like the game had hung. Do not
// drop it below 256 either, or surfaces tiled many times (the highway repeats
// its asphalt ~62x) band visibly.
// `reflect` sizes the wet-road mirror pass as a fraction of the canvas (fx.js);
// 0 skips that second scene render and leaves the roads wet but IBL-lit only.
export const TIERS = {
  // `ss` caps supersampling relative to the display's own pixels. Rendering
  // HIGH at 2560 on a 1080p screen cost ~1.8x the pixels for a barely visible
  // gain, so only 4K ULTRA supersamples now. `reflectEvery` refreshes the
  // mirror every Nth frame; `aoSamples` is the GTAO sample count.
  ultra:  { name: "4K ULTRA",    scale: 3840, ss: 1.5, shadow: 4096, ao: true,  aoSamples: 16, bloom: true,  smaa: true,  derive: 512, reflect: 0.6,  reflectEvery: 1 },
  high:   { name: "HIGH",        scale: 2560, ss: 1.0, shadow: 2048, ao: true,  aoSamples: 10, bloom: true,  smaa: true,  derive: 512, reflect: 0.45, reflectEvery: 2 },
  medium: { name: "BALANCED",    scale: 1920, ss: 1.0, shadow: 2048, ao: false, aoSamples: 0,  bloom: true,  smaa: true,  derive: 256, reflect: 0,    reflectEvery: 1 },
  low:    { name: "PERFORMANCE", scale: 1280, ss: 1.0, shadow: 1024, ao: false, aoSamples: 0,  bloom: false, smaa: false, derive: 256, reflect: 0,    reflectEvery: 1 },
};
const TIER_ORDER = ["low", "medium", "high", "ultra"];

// --------------------------------------------------------------- height fog + mist
// three's fog is a flat distance fade. A bayou at night wants mist lying on the
// ground: exponential height fog integrated along each view ray, broken into
// slow-drifting banks. Patched into the shared fog chunks so every fogged
// material in the scene — PBR, sprites, instanced trees — gets it for free.
//
// MIST is deliberately a PLAIN object, not a Vector3. three clones Vector3
// uniform values per material but copies plain objects by reference, so this
// one object is live in every program and main.js only has to write to it.
//   x = time (s), y = ground density, z = height falloff (1/m)
export const MIST = { x: 0, y: 0.04, z: 0.3 };

for (const key of Object.keys(THREE.ShaderLib)) {
  const u = THREE.ShaderLib[key].uniforms;
  if (u && u.fogColor) u.fogMist = { value: MIST };
}
THREE.UniformsLib.fog.fogMist = { value: MIST };

THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogWorld;
#endif
`;

// world position recovered from mvPosition, so instancing and sprites are
// already accounted for; viewMatrix is rigid, so its inverse is a transpose
THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWorld = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[ 3 ].xyz );
#endif
`;

THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
	uniform vec3 fogColor;
	uniform vec3 fogMist;
	varying float vFogDepth;
	varying vec3 vFogWorld;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	float gtbFogHash( vec2 p ) {
		p = fract( p * vec2( 123.34, 456.21 ) );
		p += dot( p, p + 45.32 );
		return fract( p.x * p.y );
	}
	float gtbFogNoise( vec2 p ) {
		vec2 i = floor( p );
		vec2 f = fract( p );
		f = f * f * ( 3.0 - 2.0 * f );
		return mix( mix( gtbFogHash( i ), gtbFogHash( i + vec2( 1.0, 0.0 ) ), f.x ),
		            mix( gtbFogHash( i + vec2( 0.0, 1.0 ) ), gtbFogHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
	}
#endif
`;

THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );

	// Optical depth of density y * exp(-z * height) along the eye ray. abs() on
	// the heights lets the wet-road mirror camera, which sits under the road,
	// see the same mist as the real one.
	float gtbY0 = abs( cameraPosition.y );
	float gtbK = fogMist.z * ( abs( vFogWorld.y ) - gtbY0 );
	float gtbLine = abs( gtbK ) > 1e-4 ? ( 1.0 - exp( - gtbK ) ) / gtbK : 1.0;
	vec2 gtbP = vFogWorld.xz * 0.035;
	float gtbBank = gtbFogNoise( gtbP + fogMist.x * vec2( 0.018, 0.011 ) ) * 0.65
	              + gtbFogNoise( gtbP * 2.7 - fogMist.x * vec2( 0.026, -0.014 ) ) * 0.35;
	float gtbOpt = fogMist.y * length( vFogWorld - cameraPosition ) * exp( - fogMist.z * gtbY0 )
	             * gtbLine * ( 0.25 + 1.5 * gtbBank * gtbBank );
	// moonlit mist reads a little brighter than the distance haze behind it
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * 1.5, 1.0 - exp( - gtbOpt ) );
#endif
`;

export const GFX = {
  tier: "high",
  maxAniso: 8,
  adaptive: true,
  // rough build-cost accounting, so the asset pass can be tuned without guessing
  stats: { normalMs: 0, normals: 0, ormMs: 0, orms: 0, surfaceMs: 0, surfaces: 0, envMs: 0, envBakes: 0, textures: 0, derivedCalls: 0 },
  get preset() { return TIERS[this.tier]; },
};

// Pick a sane starting tier. A 4K buffer on integrated graphics is a slideshow,
// so only opt in when the display itself is already large / high-DPI.
function gpuIsIntegrated() {
  try {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    return /intel|uhd|iris|hd graphics|mali|adreno|apple gpu|swiftshader|llvmpipe|software/i.test(name) && !/arc/i.test(name);
  } catch { return false; }
}

export function autoTier() {
  const integrated = gpuIsIntegrated();
  const px = Math.max(screen.width, screen.height) * (devicePixelRatio || 1);
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (integrated) return px >= 1400 ? "medium" : "low";
  if (px >= 3000 && mem >= 8 && cores >= 8) return "ultra";
  if (px >= 1800 && cores >= 6) return "high";
  if (px >= 1400) return "medium";
  return "low";
}

export function nextTier(dir) {
  const i = TIER_ORDER.indexOf(GFX.tier);
  const j = Math.max(0, Math.min(TIER_ORDER.length - 1, i + dir));
  GFX.tier = TIER_ORDER[j];
  return GFX.tier;
}

// --------------------------------------------------------------- renderer setup
export function initRenderer(renderer) {
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.55;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  GFX.maxAniso = renderer.capabilities.getMaxAnisotropy();
  return renderer;
}

/** Pixel ratio that lands the internal buffer on the tier's target long edge. */
export function targetPixelRatio() {
  const longEdge = Math.max(innerWidth, innerHeight);
  const want = GFX.preset.scale / longEdge;
  return Math.max(0.6, Math.min(want, (devicePixelRatio || 1) * GFX.preset.ss, 2.5));
}

// --------------------------------------------------------------- noise helpers
function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

// Tileable value noise summed over octaves. Returns a Float32Array in 0..1.
function noiseField(size, octaves, seed) {
  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const out = new Float32Array(size * size);
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const freq = 2 << o; // 2, 4, 8, 16 ... all divide a power-of-two `size`
    if (freq > size) break;
    const grid = new Float32Array(freq * freq);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    const step = size / freq;
    for (let y = 0; y < size; y++) {
      const gy = y / step;
      const y0 = Math.floor(gy) % freq;
      const y1 = (y0 + 1) % freq;
      const fy = gy - Math.floor(gy);
      const sy = fy * fy * (3 - 2 * fy);
      for (let x = 0; x < size; x++) {
        const gx = x / step;
        const x0 = Math.floor(gx) % freq;
        const x1 = (x0 + 1) % freq;
        const fx = gx - Math.floor(gx);
        const sx = fx * fx * (3 - 2 * fx);
        const a = grid[y0 * freq + x0];
        const b = grid[y0 * freq + x1];
        const c = grid[y1 * freq + x0];
        const d = grid[y1 * freq + x1];
        const top = a + (b - a) * sx;
        const bot = c + (d - c) * sx;
        out[y * size + x] += (top + (bot - top) * sy) * amp;
      }
    }
    norm += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

const noiseCache = new Map();
function cachedNoise(size, octaves, seed) {
  const k = size + "/" + octaves + "/" + seed;
  if (!noiseCache.has(k)) noiseCache.set(k, noiseField(size, octaves, seed));
  return noiseCache.get(k);
}

// Pull pixels out of whatever image a three.js texture is holding.
function readPixels(image, size) {
  const c = makeCanvas(size, size);
  const x = c.getContext("2d", { willReadFrequently: true });
  try {
    x.drawImage(image, 0, 0, size, size);
    return x.getImageData(0, 0, size, size);
  } catch (e) {
    return null; // tainted canvas, or the image never decoded
  }
}

// --------------------------------------------------------------- map derivation
// One albedo atlas is routinely shared by materials that want very different
// surfaces — a car's paint, its tyres and its glass all sample the same 128px
// texture. The two outputs are therefore cached separately (the normal map
// depends only on the relief parameters, the ORM only on the roughness ones),
// and the THREE.Texture wrappers are cached again by UV transform, so the same
// canvas is only ever uploaded to the GPU once per distinct tiling.
const heightCache = new WeakMap();   // image -> (size -> Float32Array)
const normalCache = new WeakMap();   // image -> (sig  -> canvas)
const ormCache = new WeakMap();      // image -> (sig  -> canvas)
const texCache = new WeakMap();      // canvas -> (uv sig -> THREE.Texture)

function subCache(store, img) {
  let m = store.get(img);
  if (!m) { m = new Map(); store.set(img, m); }
  return m;
}

/** Luminance heightfield for an image at `size`, cached. null if unreadable. */
function heightField(img, size) {
  const per = subCache(heightCache, img);
  if (per.has(size)) return per.get(size);
  const src = readPixels(img, size);
  if (!src) { per.set(size, null); return null; }
  const px = src.data;
  const n = size * size;
  const h = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    h[i] = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
  }
  per.set(size, h);
  return h;
}

function deriveSize(img) {
  const pow2 = 1 << Math.round(Math.log2(img.width));
  return Math.min(GFX.preset.derive, Math.max(64, pow2));
}

// Macro relief from a Sobel pass over albedo luminance — dark seams in a
// hand-painted texture are nearly always recessed detail — plus tiled value
// noise for micro-surface, so a flat 128px pack texture still catches a moving
// highlight the way a real surface does.
function normalCanvas(img, size, strength, detail, tiles) {
  const h = heightField(img, size);
  if (!h) return null;
  const micro = cachedNoise(size, 4, 0xba70 + size);
  const wrap = (v) => ((v % size) + size) % size;
  const at = (x, y) => h[wrap(y) * size + wrap(x)];
  const mAt = (x, y) => micro[wrap(y * tiles) * size + wrap(x * tiles)];

  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");
  const out = ctx.createImageData(size, size);
  const microK = detail * tiles * 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      let dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      let dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      dx = dx * strength + (mAt(x - 1, y) - mAt(x + 1, y)) * microK;
      dy = dy * strength + (mAt(x, y - 1) - mAt(x, y + 1)) * microK;

      const len = Math.hypot(dx, dy, 1);
      out.data[i * 4] = ((dx / len) * 0.5 + 0.5) * 255;
      out.data[i * 4 + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i * 4 + 2] = (1 / len) * 0.5 * 255 + 127.5;
      out.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

// ORM: R = ambient occlusion, G = roughness, B = metalness. Dark pixels read as
// crevices (occluded, rougher); bright ones as finished surfaces (open, smoother).
function ormCanvas(img, size, rough, roughVar, metal) {
  const h = heightField(img, size);
  if (!h) return null;
  const grain = cachedNoise(size, 5, 0x5eed);
  const c = makeCanvas(size, size);
  const ctx = c.getContext("2d");
  const out = ctx.createImageData(size, size);
  const m = metal * 255;

  for (let i = 0; i < size * size; i++) {
    const l = h[i];
    const cavity = Math.min(1, Math.max(0.25, 0.5 + l * 0.6));
    const r = Math.min(1, Math.max(0.04, rough + (0.5 - l) * roughVar + (grain[i] - 0.5) * 0.14));
    out.data[i * 4] = cavity * 255;
    out.data[i * 4 + 1] = r * 255;
    out.data[i * 4 + 2] = m;
    out.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

/** Derive a tangent-space normal map and an ORM map from an albedo texture. */
export function deriveMaps(texture, opts) {
  const o = opts || {};
  const img = texture && texture.image;
  if (!img || !img.width) return null;

  const strength = o.strength != null ? o.strength : 1.6;
  const detail = o.detail != null ? o.detail : 0.55;
  const tiles = o.tiles || 5;
  const rough = o.rough != null ? o.rough : 0.8;
  const roughVar = o.roughVar != null ? o.roughVar : 0.32;
  const metal = o.metal != null ? o.metal : 0;

  GFX.stats.derivedCalls++;
  const size = deriveSize(img);
  const round = (v) => Math.round(v * 100) / 100;

  const nSig = [size, round(strength), round(detail), tiles].join(":");
  const nPer = subCache(normalCache, img);
  if (!nPer.has(nSig)) {
    const t0 = performance.now();
    nPer.set(nSig, normalCanvas(img, size, strength, detail, tiles));
    GFX.stats.normalMs += performance.now() - t0;
    GFX.stats.normals++;
  }
  const nrm = nPer.get(nSig);
  if (!nrm) return null;

  const oSig = [size, round(rough), round(roughVar), round(metal)].join(":");
  const oPer = subCache(ormCache, img);
  if (!oPer.has(oSig)) {
    const t0 = performance.now();
    oPer.set(oSig, ormCanvas(img, size, rough, roughVar, metal));
    GFX.stats.ormMs += performance.now() - t0;
    GFX.stats.orms++;
  }
  const orm = oPer.get(oSig);
  if (!orm) return null;

  // A THREE.Texture wrapper carries its own repeat/offset, so materials that
  // tile the same canvas differently each need their own. Materials that tile it
  // IDENTICALLY — the common case, since they share the albedo — must share one:
  // a fresh CanvasTexture per material re-uploads the same pixels to the GPU
  // and re-generates its mipmaps, which dominated level load time.
  const uv = [texture.wrapS, texture.wrapT, texture.repeat.x, texture.repeat.y,
    texture.offset.x, texture.offset.y, texture.flipY].join(",");
  const wrapTex = (canvas) => {
    const per = subCache(texCache, canvas);
    if (per.has(uv)) return per.get(uv);
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = texture.wrapS;
    t.wrapT = texture.wrapT;
    t.repeat.copy(texture.repeat);
    t.offset.copy(texture.offset);
    t.flipY = texture.flipY;
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = GFX.maxAniso;
    // Share UV set 0 with the albedo — most pack geometry has no second UV,
    // and three defaults aoMap to uv1, which would sample nothing.
    t.channel = 0;
    t.needsUpdate = true;
    per.set(uv, t);
    GFX.stats.textures++;
    return t;
  };
  return { normal: wrapTex(nrm), orm: wrapTex(orm) };
}

// --------------------------------------------------------------- micro-surface
// A lot of the parish is hand-built coloured boxes with no texture at all —
// Popeyes walls, trailers, water towers. Nothing to derive maps from, so they
// get this shared fine-grain normal + roughness break-up instead. Without it a
// flat-colour PBR box is a perfect mirror-smooth plane and reads as plastic.
let microBase = null;
const microVariants = new Map();

function buildMicro() {
  const S = 512;
  const fine = cachedNoise(S, 5, 0x9e3d);
  const blotch = cachedNoise(S, 3, 0x4c11);

  const nrm = makeCanvas(S, S);
  const nctx = nrm.getContext("2d");
  const nOut = nctx.createImageData(S, S);
  const orm = makeCanvas(S, S);
  const octx = orm.getContext("2d");
  const oOut = octx.createImageData(S, S);
  const wrap = (v) => ((v % S) + S) % S;
  const at = (x, y) => fine[wrap(y) * S + wrap(x)];

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const dx = (at(x - 1, y) - at(x + 1, y)) * 7;
      const dy = (at(x, y - 1) - at(x, y + 1)) * 7;
      const len = Math.hypot(dx, dy, 1);
      nOut.data[i * 4] = ((dx / len) * 0.5 + 0.5) * 255;
      nOut.data[i * 4 + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      nOut.data[i * 4 + 2] = (1 / len) * 0.5 * 255 + 127.5;
      nOut.data[i * 4 + 3] = 255;

      // R = cavity, G = roughness break-up around 1.0 (it MULTIPLIES the
      // material's own roughness), B = 1.0 so metalness passes through.
      oOut.data[i * 4] = (0.72 + blotch[i] * 0.28) * 255;
      oOut.data[i * 4 + 1] = Math.min(255, (0.82 + fine[i] * 0.3) * 255);
      oOut.data[i * 4 + 2] = 255;
      oOut.data[i * 4 + 3] = 255;
    }
  }
  nctx.putImageData(nOut, 0, 0);
  octx.putImageData(oOut, 0, 0);
  return { nrm, orm };
}

/** Shared micro-surface maps, tiled `rep` times. Cached per repeat value. */
export function microSurface(rep) {
  if (!microBase) microBase = buildMicro();
  const key = String(rep);
  if (microVariants.has(key)) return microVariants.get(key);
  const mk = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
    t.colorSpace = THREE.NoColorSpace;
    t.anisotropy = GFX.maxAniso;
    t.channel = 0;
    t.needsUpdate = true;
    return t;
  };
  const v = { normal: mk(microBase.nrm), orm: mk(microBase.orm) };
  microVariants.set(key, v);
  return v;
}

/** A standalone tiling PBR surface (asphalt, concrete, dirt) at `size` px. */
export function surface(kind, size) {
  const _t0 = performance.now();
  size = size || 1024;
  const presets = {
    asphalt:  { bg: [34, 34, 38],  spec: [86, 86, 92],   flecks: 4200, rough: 0.93, tiles: 7 },
    concrete: { bg: [92, 90, 85],  spec: [126, 124, 116], flecks: 2200, rough: 0.9,  tiles: 5 },
    dirt:     { bg: [56, 45, 32],  spec: [92, 76, 52],   flecks: 3600, rough: 0.97, tiles: 6 },
    grass:    { bg: [38, 52, 28],  spec: [72, 92, 44],   flecks: 5200, rough: 0.95, tiles: 8 },
  };
  const base = presets[kind] || presets.concrete;

  const c = makeCanvas(size, size);
  const x = c.getContext("2d", { willReadFrequently: true });

  // broad tonal blotches, so it never reads as one flat colour
  const field = cachedNoise(size, 5, kind.length * 977 + 13);
  const img = x.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = (field[i] - 0.5) * 52;
    img.data[i * 4] = Math.max(0, Math.min(255, base.bg[0] + v));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, base.bg[1] + v));
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, base.bg[2] + v));
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);

  // aggregate / grit, drawn wrapped so the tile stays seamless
  const count = Math.round(base.flecks * (size / 1024));
  for (let i = 0; i < count; i++) {
    const fx = Math.random() * size;
    const fy = Math.random() * size;
    const r = 0.6 + Math.random() * (size / 340);
    const t = Math.random();
    const col = base.spec.map((sp) => Math.max(0, Math.min(255, sp * (0.55 + t * 0.75) + (Math.random() - 0.5) * 18)) | 0);
    x.fillStyle = "rgba(" + col.join(",") + "," + (0.22 + t * 0.5).toFixed(3) + ")";
    const rot = Math.random() * 6;
    const ry = r * (0.6 + Math.random() * 0.8);
    for (const off of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      x.beginPath();
      x.ellipse(fx + off[0], fy + off[1], r, ry, rot, 0, 7);
      x.fill();
    }
  }

  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = GFX.maxAniso;
  map.needsUpdate = true;

  const maps = deriveMaps(map, {
    strength: 2.2, detail: 0.95, tiles: base.tiles,
    rough: base.rough, roughVar: 0.2, metal: 0,
  });

  GFX.stats.surfaceMs += performance.now() - _t0;
  GFX.stats.surfaces++;
  return {
    map,
    normalMap: maps && maps.normal,
    ormMap: maps && maps.orm,
    /**
     * Build a ready-to-use material, tiled `rep` times across the mesh.
     *
     * Each call gets its OWN texture clones. Sharing them would mean the last
     * caller's `repeat` silently re-tiled every earlier surface — the highway,
     * the aprons and the car parks all draw from this one generator.
     */
    material(rep, extra) {
      const own = (t) => {
        if (!t) return null;
        const k = t.clone();
        k.wrapS = k.wrapT = THREE.RepeatWrapping;
        k.needsUpdate = true;
        return k;
      };
      const m = new THREE.MeshStandardMaterial(Object.assign({
        map: own(map), roughness: 1, metalness: 0, envMapIntensity: 1,
      }, extra || {}));
      if (maps) {
        const nrm = own(maps.normal);
        const o = own(maps.orm);
        m.normalMap = nrm;
        m.normalScale = new THREE.Vector2(1.7, 1.7);
        m.roughnessMap = o;
        m.metalnessMap = o;
        m.aoMap = o;
        m.aoMapIntensity = 0.7;
      }
      if (rep) {
        for (const t of [m.map, m.normalMap, m.roughnessMap]) {
          if (!t) continue;
          t.wrapS = t.wrapT = THREE.RepeatWrapping;
          t.repeat.set(rep, rep);
        }
      }
      m.userData.gtbRealized = true;
      // survives material.clone(), so fx.js can find every asphalt surface
      m.userData.surfaceKind = kind;
      return m;
    },
  };
}

// --------------------------------------------------------------- material rules
// Matched against the material name plus the mesh's and parent's names.
const RULES = [
  { key: "glass",
    re: /glass|window|windshield|windscreen|mirror|lens|headlight|glazing|taillight/i,
    set: { metalness: 0, roughness: 0.05, envMapIntensity: 2.6, transparent: true, opacity: 0.38,
           clearcoat: 1, clearcoatRoughness: 0.02 },
    physical: true, noDerive: true },

  { key: "chrome", microRepeat: 4,
    re: /chrome|steel|metal|bumper|\brim\b|hubcap|exhaust|muffler|grill|grille|handle|alloy|alumin/i,
    set: { metalness: 0.95, roughness: 0.22, envMapIntensity: 2.0 }, normalScale: 0.35 },

  { key: "rubber", microRepeat: 14,
    re: /tire|tyre|rubber|wheel|tread|seal|hose|belt/i,
    set: { metalness: 0, roughness: 0.96, envMapIntensity: 0.5 }, normalScale: 1.5, tiles: 9 },

  { key: "paint", microRepeat: 3,
    // \b on "hood" matters: without it "hoodrat" matches and every Hoodrat
    // material comes out as clearcoat car paint.
    re: /paint|carbody|car_?body|carpaint|\bcar\b|vehicle|chassis|\bhood\b|fender|bonnet|sedan|coupe/i,
    set: { metalness: 0.75, roughness: 0.26, envMapIntensity: 1.7,
           clearcoat: 1, clearcoatRoughness: 0.05 },
    physical: true, normalScale: 0.25 },

  { key: "stone", microRepeat: 12,
    re: /asphalt|tarmac|road|pavement|parking|kerb|curb|concrete|cement|sidewalk|stone|gravel|tile/i,
    set: { metalness: 0, roughness: 0.95, envMapIntensity: 1.0 }, normalScale: 1.9, tiles: 8 },

  { key: "masonry", microRepeat: 10,
    re: /brick|stucco|plaster|wall|render|block|masonry|facade/i,
    set: { metalness: 0, roughness: 0.92, envMapIntensity: 0.9 }, normalScale: 1.7, tiles: 7 },

  { key: "sheet", microRepeat: 9,
    re: /corrugat|sheet|\btin\b|roof|cladding|siding|panel|shed|gutter|awning_?metal/i,
    set: { metalness: 0.6, roughness: 0.55, envMapIntensity: 1.4 }, normalScale: 1.2, tiles: 6 },

  { key: "wood", microRepeat: 10,
    re: /wood|plank|timber|board|fence|\bpost\b|pallet|\blog\b|bark|trunk|crate/i,
    set: { metalness: 0, roughness: 0.86, envMapIntensity: 0.7 }, normalScale: 1.6, tiles: 7 },

  { key: "foliage", microRepeat: 12,
    re: /leaf|leaves|foliage|grass|plant|bush|tree|hedge|moss|weed|palm|fern/i,
    set: { metalness: 0, roughness: 0.88, envMapIntensity: 0.85, side: THREE.DoubleSide },
    normalScale: 1.1 },

  { key: "liquid",
    re: /water|liquid|puddle|fuel|\boil\b/i,
    set: { metalness: 0.2, roughness: 0.05, envMapIntensity: 2.8 }, noDerive: true },

  { key: "fabric", microRepeat: 16,
    re: /fabric|cloth|seat|canvas|tarp|curtain|cushion|carpet|upholster/i,
    set: { metalness: 0, roughness: 0.95, envMapIntensity: 0.6 }, normalScale: 1.4, tiles: 10 },

  { key: "plastic", microRepeat: 5,
    re: /plastic|vinyl|signboard|\bbin\b|barrel|cone|bollard|pump|dispenser/i,
    set: { metalness: 0, roughness: 0.4, envMapIntensity: 1.3,
           clearcoat: 0.5, clearcoatRoughness: 0.24 },
    physical: true, normalScale: 0.9 },

  { key: "skin", microRepeat: 14,
    re: /skin|hide|flesh|hog|boar|pig|fur|hair|body_?mat/i,
    set: { metalness: 0, roughness: 0.74, envMapIntensity: 0.7 }, normalScale: 1.2, tiles: 11 },
];

// Lit signage. Judged on a surface's OWN names — its material's and its mesh's —
// never the call-site hint or the parent: "harborLIGHT-hospital.glb" lit every
// curb, paving slab and wall of the hospital, and "Toyoyo_HighLIGHT" the whole
// truck, so both glowed warm white at any hour. NOT_LIT catches the rest of
// what reads as a light and isn't: the city packs' "-light" SHADES
// (stone-light, paving-light, brick-light, their "-surface" twins) and the
// grey back of a sign. The packs' real light sources — lamp lenses, lit
// windows, beacons, "…-glow" — are named for it and keep their own emissive.
const EMISSIVE = /neon|emiss|\bled\b|lamp|light|glow|sign|logo|lottery|price|menu|billboard|display|bulb|marquee/i;
const NOT_LIT = /-light(?:-surface)?$|\bback\b/i;
const isLit = (n) => !!n && EMISSIVE.test(n) && !NOT_LIT.test(n);

/**
 * Repair normals that would light as NaN. A zero-length (or non-finite) normal
 * normalizes to NaN in the shader; bloom and the speed blur then smear those few
 * pixels into a black, flickering blur. Seen on the Designersoup Beetle
 * ("beetle004"). A bad normal takes its triangle's face normal, or straight up
 * for a degenerate triangle. Runs once per geometry.
 */
export function sanitizeNormals(geometry) {
  if (!geometry || !geometry.attributes || geometry.userData.gtbNormalsChecked) return 0;
  geometry.userData.gtbNormalsChecked = true;
  const nrm = geometry.attributes.normal, pos = geometry.attributes.position;
  if (!nrm || !pos) return 0;
  const index = geometry.index;
  const tri = new Uint32Array(3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  // which triangle each vertex belongs to (the first one found is enough)
  let owner = null;
  const triOf = (v) => {
    if (!index) { const t = Math.floor(v / 3); tri[0] = t * 3; tri[1] = t * 3 + 1; tri[2] = t * 3 + 2; return tri[2] < pos.count; }
    if (!owner) {
      owner = new Int32Array(pos.count).fill(-1);
      for (let i = 0; i < index.count; i++) { const vi = index.getX(i); if (owner[vi] < 0) owner[vi] = i - (i % 3); }
    }
    const t = owner[v];
    if (t < 0 || t + 2 >= index.count) return false;
    tri[0] = index.getX(t); tri[1] = index.getX(t + 1); tri[2] = index.getX(t + 2);
    return true;
  };
  let fixed = 0;
  for (let v = 0; v < nrm.count; v++) {
    const x = nrm.getX(v), y = nrm.getY(v), z = nrm.getZ(v);
    const len = Math.hypot(x, y, z);
    if (Number.isFinite(len) && len > 1e-6) continue;
    n.set(0, 1, 0);
    if (triOf(v)) {
      a.fromBufferAttribute(pos, tri[0]); b.fromBufferAttribute(pos, tri[1]); c.fromBufferAttribute(pos, tri[2]);
      const face = b.sub(a).cross(c.sub(a));
      if (face.lengthSq() > 1e-12) n.copy(face).normalize();
    }
    nrm.setXYZ(v, n.x, n.y, n.z);
    fixed++;
  }
  if (fixed) {
    nrm.needsUpdate = true;
    geometry.userData.gtbNormalsFixed = fixed;
  }
  return fixed;
}

function classify(name) {
  for (const r of RULES) if (r.re.test(name)) return r;
  return null;
}

/**
 * Upgrade every material under `root` to a physically-based surface.
 * Safe to call repeatedly — upgraded materials are tagged and skipped.
 *
 * `hint` is an extra classification keyword from the call site, for packs whose
 * mesh names are things like "polySurface42".
 */
export function realize(root, opts) {
  if (!root) return root;
  const o = opts || {};
  const shadows = o.shadows !== false;

  root.traverse((node) => {
    if (!node.isMesh && !node.isInstancedMesh) return;
    sanitizeNormals(node.geometry);                 // a zero-length normal lights as NaN (see sanitizeNormals)
    if (shadows) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
    const context = [o.hint || "", node.name || "", node.parent ? node.parent.name : ""].join(" ");
    const single = !Array.isArray(node.material);
    const mats = single ? [node.material] : node.material;
    const next = mats.map((m) => upgrade(m, context, o, node.name || ""));
    node.material = single ? next[0] : next;
  });
  return root;
}

function upgrade(mat, context, opts, meshName) {
  if (!mat || mat.userData.gtbRealized) return mat;

  // Unlit, untextured overlays (tracers, markers, HUD blobs) stay unlit.
  if (mat.isMeshBasicMaterial && !mat.map && !opts.litBasic) {
    mat.userData.gtbRealized = true;
    return mat;
  }

  const name = (mat.name || "") + " " + context;
  const rule = classify(name);
  const wantPhysical = !!(rule && rule.physical);
  const needsSwap = !mat.isMeshStandardMaterial || (wantPhysical && !mat.isMeshPhysicalMaterial);

  let out = mat;
  if (needsSwap) {
    out = wantPhysical ? new THREE.MeshPhysicalMaterial() : new THREE.MeshStandardMaterial();
    out.name = mat.name;
    out.color = mat.color ? mat.color.clone() : new THREE.Color(0xffffff);
    out.map = mat.map || null;
    out.alphaMap = mat.alphaMap || null;
    out.alphaTest = mat.alphaTest;
    out.transparent = mat.transparent;
    out.opacity = mat.opacity;
    out.side = mat.side;
    out.depthWrite = mat.depthWrite;
    out.vertexColors = mat.vertexColors;
    out.fog = mat.fog !== false;
    if (mat.emissive) out.emissive = mat.emissive.clone();
    if (mat.emissiveMap) out.emissiveMap = mat.emissiveMap;
    if (mat.emissiveIntensity != null) out.emissiveIntensity = mat.emissiveIntensity;
  }

  // colour-space and filtering hygiene on whatever albedo we inherited
  if (out.map) {
    out.map.colorSpace = THREE.SRGBColorSpace;
    out.map.anisotropy = GFX.maxAniso;
    if (!opts.keepPixelFilter) {
      // The packs ship NearestFilter for the PSX look; real surfaces need mips.
      out.map.magFilter = THREE.LinearFilter;
      out.map.minFilter = THREE.LinearMipmapLinearFilter;
      out.map.generateMipmaps = true;
    }
    out.map.needsUpdate = true;
  }

  // photoreal defaults, then the matched rule on top
  out.roughness = 0.78;
  out.metalness = 0.04;
  out.envMapIntensity = 1.0;
  if (rule) {
    for (const k of Object.keys(rule.set)) out[k] = rule.set[k];
  }
  if (opts.tint != null && out.color) out.color.setHex(opts.tint);
  if (opts.roughness != null) out.roughness = opts.roughness;
  if (opts.metalness != null) out.metalness = opts.metalness;

  // Derived normal + ORM — this is what gives a flat pack texture actual
  // surface relief under a moving light.
  if (out.map && !(rule && rule.noDerive) && !opts.noDerive) {
    const maps = deriveMaps(out.map, {
      rough: out.roughness,
      metal: out.metalness,
      tiles: (rule && rule.tiles) || 5,
      strength: 1.6,
      detail: 0.55,
    });
    if (maps) {
      out.normalMap = maps.normal;
      const ns = (rule && rule.normalScale) || 0.9;
      out.normalScale = new THREE.Vector2(ns, ns);
      out.roughnessMap = maps.orm;
      out.metalnessMap = maps.orm;
      out.aoMap = maps.orm;
      out.aoMapIntensity = 0.7;
      // roughnessMap.g and metalnessMap.b MULTIPLY the scalars, and the map
      // already encodes the values we want, so let it pass straight through —
      // but only for a rule that actually asked for metal. The photoreal
      // *default* metalness is 0.04 (a hair of specular sheen on everything,
      // not literal metal), and 0.04 > 0.001 — so this used to promote every
      // unrecognized surface (any material with no matching rule, e.g. plain
      // concrete/asphalt lots) straight to metalness 1.0: a rough mirror that
      // reflects the sky probe instead of showing its own texture, reading as
      // a blown-out white/gray sheet. Every real metal rule above uses 0.2 or
      // higher, so 0.1 cleanly separates "asked for metal" from "the default."
      out.roughness = 1.0;
      out.metalness = out.metalness > 0.1 ? 1.0 : 0.0;
    }
  } else if (!out.map && !(rule && rule.noDerive) && !opts.noDerive) {
    // Untextured flat-colour geometry: no albedo to derive from, so give it the
    // shared micro-surface. A perfectly smooth PBR box reads as cheap plastic.
    const rep = (rule && rule.microRepeat) || 8;
    const micro = microSurface(rep);
    out.normalMap = micro.normal;
    const ns = ((rule && rule.normalScale) || 0.9) * 0.7;
    out.normalScale = new THREE.Vector2(ns, ns);
    out.roughnessMap = micro.orm;   // multiplies — break-up only
    out.aoMap = micro.orm;
    out.aoMapIntensity = 0.35;
  }

  // lit signage (see EMISSIVE: own names only)
  if (isLit(mat.name) || isLit(meshName)) {
    out.emissive = new THREE.Color(0xffd9a0);
    out.emissiveIntensity = 1.15 * (opts.emissiveBoost || 1);
    if (out.map) out.emissiveMap = out.map;
  }

  out.userData.gtbRealized = true;
  out.needsUpdate = true;
  return out;
}

// --------------------------------------------------------------- sky + IBL
/**
 * A physical sky rendered once into a PMREM probe, so every PBR material gets a
 * real ambient term instead of a flat AmbientLight. A negative `elevation` puts
 * the sun below the horizon, which is what produces the deep blue of night.
 */
export function createEnvironment(scene, renderer, opts) {
  const o = opts || {};
  const azimuth = o.azimuth != null ? o.azimuth : 200;

  const sky = new Sky();
  sky.scale.setScalar(12000);
  const u = sky.material.uniforms;
  u.turbidity.value = o.turbidity != null ? o.turbidity : 6;
  u.rayleigh.value = o.rayleigh != null ? o.rayleigh : 2.4;
  u.mieCoefficient.value = 0.007;
  u.mieDirectionalG.value = 0.82;

  const sunDir = new THREE.Vector3();
  const aim = (el, az) => {
    sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - el), THREE.MathUtils.degToRad(az));
    u.sunPosition.value.copy(sunDir);
  };
  aim(o.elevation != null ? o.elevation : -4.5, azimuth);

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  let rt = null;
  const bake = () => {
    const _t0 = performance.now();
    const prev = rt;
    rt = pmrem.fromScene(sky, 0.0);
    scene.environment = rt.texture;
    scene.background = rt.texture;
    scene.backgroundBlurriness = 0.0;
    scene.backgroundIntensity = o.backgroundIntensity != null ? o.backgroundIntensity : 0.9;
    scene.environmentIntensity = o.environmentIntensity != null ? o.environmentIntensity : 1.0;
    if (prev) prev.dispose();
    GFX.stats.envMs += performance.now() - _t0;
    GFX.stats.envBakes++;
  };
  bake();

  return {
    sky,
    sunDir,
    /** Drift the sun for the game's slow dusk, then re-bake the probe. */
    setElevation(el, az) {
      aim(el, az != null ? az : azimuth);
      bake();
    },
    /** Haze and blue: thinner and bluer at midday, thicker low down (daycycle.js). */
    setAtmosphere(turbidity, rayleigh) {
      u.turbidity.value = turbidity;
      u.rayleigh.value = rayleigh;
    },
    setIntensity(env, bg) {
      scene.environmentIntensity = env;
      scene.backgroundIntensity = bg != null ? bg : env;
    },
    dispose() {
      pmrem.dispose();
      if (rt) rt.dispose();
    },
  };
}

// --------------------------------------------------------------- filmic grade
// Vignette, per-pixel grain, a little chromatic aberration and a teal/amber
// split-tone. Runs after tone mapping, so it works in display space.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.05 },
    uAberration: { value: 1.0 },
    uShadowTint: { value: new THREE.Color(0x16242e) },
    uHighlightTint: { value: new THREE.Color(0xffe6c2) },
    uContrast: { value: 1.08 },
    uSaturation: { value: 1.05 },
    uBlur: { value: 0 },          // 0..1 speed blur, driven by main.js while driving
  },
  vertexShader: [
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = uv;",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
    "}",
  ].join("\n"),
  fragmentShader: [
    "uniform sampler2D tDiffuse;",
    "uniform float uTime, uVignette, uGrain, uAberration, uContrast, uSaturation, uBlur;",
    "uniform vec3 uShadowTint, uHighlightTint;",
    "varying vec2 vUv;",
    "",
    "float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }",
    "",
    "void main() {",
    "  vec2 c = vUv - 0.5;",
    "  float r2 = dot(c, c);",
    "",
    "  // lens: channels separate further from centre, more so at speed",
    "  float ab = uAberration * (0.0018 + uBlur * 0.004) * r2;",
    "  vec3 col;",
    "  col.r = texture2D(tDiffuse, vUv + c * ab).r;",
    "  col.g = texture2D(tDiffuse, vUv).g;",
    "  col.b = texture2D(tDiffuse, vUv - c * ab).b;",
    "",
    "  // speed blur: streaks radiating from the centre, which stays sharp so",
    "  // the road ahead is still readable",
    "  if (uBlur > 0.001) {",
    "    float k = uBlur * 0.03 * smoothstep(0.02, 0.25, r2);",
    "    vec3 acc = col;",
    "    for (int i = 1; i < 8; i++) {",
    "      acc += texture2D(tDiffuse, vUv - c * k * (float(i) / 7.0)).rgb;",
    "    }",
    "    col = acc / 8.0;",
    "  }",
    "",
    "  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));",
    "",
    "  // split-tone: cool shadows, warm highlights",
    "  vec3 shad = col * (uShadowTint * 1.6 + 0.72);",
    "  vec3 high = col * (uHighlightTint * 0.45 + 0.66);",
    "  col = mix(shad, high, smoothstep(0.12, 0.8, l));",
    "",
    "  col = (col - 0.5) * uContrast + 0.5;",
    "  col = mix(vec3(l), col, uSaturation);",
    "",
    "  col *= 1.0 - uVignette * smoothstep(0.16, 0.78, r2);",
    "",
    "  // grain, rolled off in the highlights the way film behaves",
    "  float g = hash(vUv * 1024.0 + fract(uTime * 0.97) * 91.7) - 0.5;",
    "  col += g * uGrain * (1.0 - l * 0.7);",
    "",
    "  gl_FragColor = vec4(max(col, 0.0), 1.0);",
    "}",
  ].join("\n"),
};

// A NaN or +Inf pixel reaching bloom spreads into a black, flickering blur (and the
// speed blur smears it further). Before bloom, any such pixel becomes plain black:
// one dark pixel instead of a smear. realize() also repairs the normals behind it.
const NanGuardShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: [
    "varying vec2 vUv;",
    "void main() {",
    "  vUv = uv;",
    "  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
    "}",
  ].join("\n"),
  fragmentShader: [
    "uniform sampler2D tDiffuse;",
    "varying vec2 vUv;",
    "void main() {",
    "  vec4 c = texture2D(tDiffuse, vUv);",
    "  bool bad = any(isnan(c)) || any(isinf(c)) || max(max(c.r, c.g), c.b) > 60000.0;",
    "  gl_FragColor = bad ? vec4(0.0, 0.0, 0.0, 1.0) : c;",
    "}",
  ].join("\n"),
};

// --------------------------------------------------------------- composer
/**
 * RenderPass -> GTAO -> bloom -> tone map -> filmic grade -> SMAA.
 *
 * Async because GTAOPass is imported lazily: it is the most fragile pass in the
 * addons, and a failure there must not take the whole game down with it.
 */
export async function createComposer(renderer, scene, camera) {
  // EffectComposer has no getPixelRatio(), so track it here — the passes render
  // into targets at innerSize * ratio and the last pass downsamples to the
  // canvas, which is what makes this real supersampling rather than upscaling.
  let ratio = targetPixelRatio();
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(ratio);
  composer.setSize(innerWidth, innerHeight);

  composer.addPass(new RenderPass(scene, camera));

  // GTAO is the single biggest "this is a real place" upgrade: contact
  // darkening in every crease the low-poly geometry has.
  let gtao = null;
  if (GFX.preset.ao) {
    try {
      const mod = await import("three/addons/postprocessing/GTAOPass.js");
      gtao = new mod.GTAOPass(scene, camera, innerWidth, innerHeight);
      gtao.output = mod.GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = 0.9;
      gtao.updateGtaoMaterial({
        radius: 0.5, distanceExponent: 1.4, thickness: 1.2,
        scale: 1.35, samples: GFX.preset.aoSamples || 12, screenSpaceRadius: false,
      });
      // AO is low-frequency, so it is computed at half resolution and the
      // blend step upsamples it — a quarter of the pixels for the costliest
      // pass. The composer calls setSize on every pass, so wrap it once here.
      const fullSetSize = gtao.setSize.bind(gtao);
      gtao.setSize = (w, h) => fullSetSize(Math.max(1, Math.ceil(w / 2)), Math.max(1, Math.ceil(h / 2)));
      gtao.setSize(innerWidth * ratio, innerHeight * ratio);
      composer.addPass(gtao);
    } catch (e) {
      console.warn("[gfx] GTAO unavailable, continuing without it:", e && e.message);
      gtao = null;
    }
  }

  // before bloom: no NaN / Inf pixel may spread into a black blur (NanGuardShader)
  const nanGuard = new ShaderPass(NanGuardShader);
  composer.addPass(nanGuard);

  let bloom = null;
  if (GFX.preset.bloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.75, 0.8);
    composer.addPass(bloom);
  }

  composer.addPass(new OutputPass());

  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);

  let smaa = null;
  if (GFX.preset.smaa) {
    smaa = new SMAAPass(innerWidth * ratio, innerHeight * ratio);
    composer.addPass(smaa);
  }

  return {
    composer, grade, bloom, gtao, smaa,
    /** The actual internal buffer size the scene is being rendered at. */
    get renderScale() {
      return [Math.round(innerWidth * ratio), Math.round(innerHeight * ratio)];
    },
    resize() {
      ratio = targetPixelRatio();
      composer.setPixelRatio(ratio);
      composer.setSize(innerWidth, innerHeight);
      if (smaa) smaa.setSize(innerWidth * ratio, innerHeight * ratio);
      if (gtao) gtao.setSize(innerWidth * ratio, innerHeight * ratio);
    },
    render(dt) {
      grade.uniforms.uTime.value += dt;
      composer.render(dt);
    },
  };
}

// --------------------------------------------------------------- adaptive scale
/**
 * Watches frame time and steps the tier DOWN (never up, so it can't oscillate)
 * when the 4K buffer clearly isn't sustainable on this machine.
 */
export function createGovernor(onChange) {
  let acc = 0;
  let frames = 0;
  let warmup = 3; // ignore the first few windows — asset decode skews them
  return function sample(dt) {
    if (!GFX.adaptive) return;
    acc += dt;
    frames++;
    if (acc < 2) return;
    const fps = frames / acc;
    acc = 0;
    frames = 0;
    if (warmup > 0) {
      warmup--;
      return;
    }
    const i = TIER_ORDER.indexOf(GFX.tier);
    if (fps < 45 && i > 0) {
      GFX.tier = TIER_ORDER[i - 1];
      warmup = 3;
      onChange(GFX.tier, fps);
    }
  };
}
