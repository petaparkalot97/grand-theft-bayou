// ---------------------------------------------------------------------------
// neonsign.js — canvas neon signage that fits its own text.
//
// Every sign in the game draws its name into a canvas texture. The old
// generators picked a font size from a rule of thumb (`text.length > 15 ? 100 :
// 124`) and always used the same 1024x256 canvas whatever the sign's real
// proportions were. Two things went wrong with that:
//
//   1. it clipped. "PELICAN CROWN CASINO" is 20 characters; at 100 px in a 1024
//      px canvas the glyphs run past the border. Nothing measured the string.
//   2. it stretched. A 24 x 2.9 m casino fascia is 8.3:1, but a 1024x256 texture
//      is 4:1, so the face smeared the text horizontally.
//
// This module fixes both. `neonSignTexture` draws the canvas at the *face's own
// aspect ratio*, then fits the text with measureText(): it starts from the
// largest size the height allows and shrinks only as far as the width demands,
// so short names stay big and long names stay inside the border.
//
// The look is unchanged: dark background, bright neon letters with a glow, a
// border rectangle, sRGB colour space.
// ---------------------------------------------------------------------------

import * as THREE from "three";

const MAX_SIDE = 4096;         // canvas dimension ceiling, aspect-preserving
const MIN_SIDE = 64;

/**
 * Shrink `size` until `text` measures inside `maxWidth`, starting from `maxSize`
 * and never growing. Pure, so it is cheap to unit-test: pass any object with a
 * `measureText(s) -> { width }` method (a real 2D context, or a stub).
 *
 * @returns {number} a font size in px, never above `maxSize` nor below `minSize`.
 */
export function fitFontSize(measure, text, {
  maxWidth, maxSize, minSize = 10, font = "Arial Black, Arial, sans-serif", weight = 900, passes = 8,
} = {}) {
  if (!measure || !text || !(maxWidth > 0)) return maxSize;
  const setFont = (size) => { try { measure.font = `${weight} ${size}px ${font}`; } catch { /* stub contexts */ } };
  let size = maxSize;
  for (let i = 0; i < passes; i++) {
    setFont(size);
    const w = measure.measureText(text).width;
    if (!(w > maxWidth)) break;                 // fits (or the stub reports nothing)
    const next = size * (maxWidth / w);
    if (!(next < size)) break;                  // no progress: leave it
    size = Math.max(minSize, next);
    if (size === minSize) break;                // floor reached
  }
  return size;
}

/** Idle canvas helpers — drawing a rect and text, with the 2D context stubbed out safely. */
function shapedTextSize(measure, chars, { maxWidth, maxHeight, maxSize, minSize, font, weight, step = 1.06 }) {
  if (!measure || !chars.length) return maxSize;
  const byWidth = (size, fit) => chars.reduce((m, ch) => Math.max(m, fit ? fit(ch, size) : measure.measureText(ch).width), 0);
  const fitsIn = (size) => {
    try { measure.font = `${weight} ${size}px ${font}`; } catch { /* stub */ }
    return byWidth(size) <= maxWidth && size * step * chars.length <= maxHeight;
  };
  let size = maxSize;
  for (let i = 0; i < 8 && !fitsIn(size); i++) {
    const w = byWidth(size), hRoom = maxHeight / (step * chars.length);
    const scale = Math.min(w > 0 ? maxWidth / w : 1, hRoom / size);
    if (!(scale < 1)) break;
    const next = Math.max(minSize, size * scale);
    if (!(next < size)) break;
    size = next;
    if (size === minSize) break;
  }
  return size;
}

/**
 * A neon sign canvas texture, sized to the face it will fill.
 *
 * @param {object} o
 * @param {string} o.text               the venue name
 * @param {string} o.ink                neon colour, any CSS colour
 * @param {string} [o.bg="#080a12"]     background fill
 * @param {number} [o.aspect]           physical ratio of the sign face. The canvas
 *                                      is built at this ratio so the texture is
 *                                      never stretched. Either order works:
 *                                      8.3, or 0.12 for a tall face.
 * @param {number} [o.width]            explicit canvas width in px (overrides aspect)
 * @param {number} [o.height]           explicit canvas height in px
 * @param {number} [o.minSide=256]      px on the canvas's minor axis
 * @param {number} [o.padding=0.09]     safe margin, as a fraction of the minor side
 * @param {number} [o.border=0.055]     border inset, as a fraction of the minor side
 * @param {number} [o.lineWidth]        border thickness in px (default 0.03 * minor)
 * @param {number} [o.glow]             glow blur in px (default 0.12 * minor)
 * @param {boolean} [o.vertical=false]  stack the characters (blade signs)
 * @returns {THREE.CanvasTexture|null}  null without a DOM (headless builds)
 */
export function neonSignTexture(o = {}) {
  const { text = "", ink = "#ffffff", bg = "#080a12", vertical = false } = o;
  if (typeof document === "undefined") return null;

  // ---- canvas size: the face's aspect, at a fixed resolution on the minor axis.
  // `vertical` (a blade sign) forces a tall canvas even when the caller passes
  // the ratio the long way round, which `aspectOf` always does.
  const ratio = o.aspect > 0 ? o.aspect : 4;
  const long = ratio < 1 ? 1 / ratio : ratio;          // long axis / short axis
  const tall = vertical || ratio < 1;
  let width = o.width, height = o.height;
  if (!(width > 0) || !(height > 0)) {
    const minor = o.minSide || 256;
    width = tall ? minor : Math.round(minor * long);
    height = tall ? Math.round(minor * long) : minor;
    if (width > MAX_SIDE) { width = MAX_SIDE; height = Math.max(MIN_SIDE, Math.round(MAX_SIDE / long)); }
    if (height > MAX_SIDE) { height = MAX_SIDE; width = Math.max(MIN_SIDE, Math.round(MAX_SIDE / long)); }
  }
  width = Math.max(MIN_SIDE, Math.round(width));
  height = Math.max(MIN_SIDE, Math.round(height));

  const c = document.createElement("canvas");
  c.width = width; c.height = height;
  const x = c.getContext("2d");
  x.fillStyle = bg; x.fillRect(0, 0, width, height);

  // ---- safe area: the border, plus the padding, kept clear of the glyphs
  const minor = Math.min(width, height);
  const borderInset = (o.border ?? 0.055) * minor;
  const lineWidth = o.lineWidth ?? Math.max(2, 0.03 * minor);
  const safe = Math.max((o.padding ?? 0.09) * minor, borderInset + lineWidth);
  const innerW = width - 2 * safe;
  const innerH = height - 2 * safe;

  x.textAlign = "center"; x.textBaseline = "middle";
  x.fillStyle = ink;
  x.shadowColor = ink;
  x.shadowBlur = o.glow ?? 0.12 * minor;
  const font = o.font || "Arial Black, Arial, sans-serif";
  const weight = o.weight ?? 900;

  if (vertical) {
    // a blade sign: fit the widest glyph AND the stacked block height
    const chars = [...text];
    const maxByHeight = innerH / (1.10 * Math.max(1, chars.length));
    const size = shapedTextSize(x, chars, {
      maxWidth: innerW, maxHeight: innerH, maxSize: maxByHeight,
      minSize: o.minFontSize ?? 10, font, weight,
    });
    x.font = `${weight} ${size}px ${font}`;
    const step = size * 1.06;
    const top = (height - step * chars.length) / 2 + step / 2;
    chars.forEach((ch, i) => x.fillText(ch, width / 2, top + step * i));
  } else {
    // a fascia sign: the height sets the ceiling. 0.82 leaves the em box (which
    // is taller than the cap height) room inside the safe area, so uppercase ink
    // never touches the border. The width then pulls the size down only as far
    // as it must.
    const maxSize = o.maxFontSize ?? innerH / 0.82;
    const size = fitFontSize(x, text, {
      maxWidth: innerW, maxSize, minSize: o.minFontSize ?? 10, font, weight,
    });
    x.font = `${weight} ${size}px ${font}`;
    x.fillText(text, width / 2, height / 2);
  }

  x.shadowBlur = 0;
  x.lineWidth = lineWidth;
  x.strokeStyle = ink;
  x.strokeRect(borderInset, borderInset, width - borderInset * 2, height - borderInset * 2);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if ("anisotropy" in t) t.anisotropy = 4;
  return t;
}

/**
 * A neon sign material — the texture above, in a material shaped for its host.
 *
 * @param {object} o                 same options as `neonSignTexture`, plus:
 * @param {"basic"|"standard"} [o.kind="standard"]
 * @param {string} [o.name]          material name (a QA pass can find signs by it)
 * @param {number} [o.emissive]      standard only; the neon tint of the emissive map
 * @param {number} [o.emissiveIntensity]
 * @returns {THREE.Material}         a flat colour material when there is no DOM
 */
/**
 * Two signs that ask for the same thing are the same sign.
 *
 * A texture here is a pure function of its options, and each one is a full canvas
 * — so a venue that puts the same name on the roof AND beside its door (a casino
 * marquee does) was paying twice, and nothing in merge.js's material signature or
 * the wet-road mirror pass treats two identical materials as one. Memoised, the
 * pair shares a texture, a material and a batch.
 *
 * The key includes `name`, because the QA read a sign's identity out of it
 * (`crown sign: BAYOU GOLD`): same pixels, different label, different entry.
 */
const _signMats = new Map();
const signKey = (o, kind, name) => JSON.stringify([
  name, o.text || "", o.ink || "#ffffff", o.bg || "#080a12", kind,
  !!o.vertical, o.aspect > 0 ? Math.round(o.aspect * 1000) : null,
  o.width > 0 ? Math.round(o.width) : null, o.height > 0 ? Math.round(o.height) : null,
  o.minSide || null, o.minFontSize || null, o.padding || null,
]);

export function neonSignMaterial(o = {}) {
  const { ink = "#ffffff", kind = "standard", name = null, emissive = 0xffffff, emissiveIntensity = 1.1 } = o;
  const key = signKey(o, kind, name);
  const hit = _signMats.get(key);
  if (hit) return hit;
  const tex = neonSignTexture(o);
  let m;
  if (!tex) {
    m = kind === "basic" ? new THREE.MeshBasicMaterial({ color: ink }) : new THREE.MeshStandardMaterial({ color: ink });
  } else if (kind === "basic") {
    m = new THREE.MeshBasicMaterial({ map: tex });
  } else {
    m = new THREE.MeshStandardMaterial({ map: tex, emissive, emissiveIntensity, emissiveMap: tex });
  }
  if (name) m.name = name;
  m.userData.gtbRealized = true;
  _signMats.set(key, m);
  return m;
}

/**
 * Physical sign proportions from a box/plane face, for `neonSignTexture`'s
 * `aspect`. `a` by `b` in metres, in any order — the larger becomes the long axis.
 */
export const aspectOf = (a, b) => (a > 0 && b > 0 ? Math.max(a, b) / Math.min(a, b) : 4);
