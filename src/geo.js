// ---------------------------------------------------------------------------
// geo.js — shared geometry, and the chamfer.
//
// The single biggest visual difference between San Andreas and its HD remaster
// is not polycount, textures or lighting. It is that every edge in the remaster
// is BEVELLED. A hard 90° corner terminates light flatly and reads as "box"; a
// 2–3 cm chamfer catches a highlight along the whole edge and reads as a real
// object made of a real material. It costs a handful of triangles and nothing
// at all in draw calls.
//
// This game is built almost entirely out of THREE.BoxGeometry, so:
//
//   import { roundedBox } from "./geo.js";
//   mesh(roundedBox(2.6, 0.07, 0.8), top, 0, 0.76, 0);
//
// The radius scales itself down for small props (a 3 cm bevel on a 6 cm cup is
// a pill, not a cup) and the whole thing degrades to a plain BoxGeometry when
// the bevel would be too small to see — so it is always safe to call.
//
// TWO THINGS TO KNOW BEFORE USING IT:
//
//   * UVs are NOT BoxGeometry's. RoundedBoxGeometry lays out its own, so any
//     mesh whose UVs are hand-computed or scaled to size — orlearouge.js's
//     `tiledBox`, cemetery.js's `vaultWall` — must keep using BoxGeometry or
//     its texture tiling will change. Flat-coloured surfaces and surfaces whose
//     only map is realize()'s micro-detail normal are fine: that map is
//     break-up noise, not a pattern that has to line up.
//   * Geometry is cached and SHARED, which is what keeps batchStatic able to
//     merge these meshes. Never mutate a geometry that comes out of here.
// ---------------------------------------------------------------------------

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/** The house chamfer, in metres. Big enough to catch a highlight, small enough
 *  that a wall still reads as a wall. */
export const CHAMFER = 0.03;

/** Below this the bevel is sub-pixel at any sane distance, so don't pay for it. */
const MIN_USEFUL = 0.005;

const cache = new Map();

/**
 * A box with its edges taken off.
 *
 * @param {number} w,h,d      as BoxGeometry
 * @param {object} [opts]
 * @param {number} [opts.radius]    override the chamfer (metres)
 * @param {number} [opts.segments]  1 = a flat chamfer (default, cheapest, and
 *                                  the right look); 2–3 round it into a fillet
 */
export function roundedBox(w, h, d, { radius, segments = 1 } = {}) {
  const smallest = Math.min(w, h, d);
  // never eat more than a seventh of the thinnest dimension: that is what stops
  // a 3 cm bevel turning a 7 cm table leg into a capsule
  const r = radius != null ? radius : Math.min(CHAMFER, smallest / 7);
  if (!(r > MIN_USEFUL) || smallest <= r * 2) return box(w, h, d);

  const key = `r${w}|${h}|${d}|${r}|${segments}`;
  let g = cache.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, segments, r);
    cache.set(key, g);
  }
  return g;
}

/** Plain BoxGeometry, cached the same way — for UV-sensitive surfaces. */
export function box(w, h, d) {
  const key = `b${w}|${h}|${d}`;
  let g = cache.get(key);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    cache.set(key, g);
  }
  return g;
}

/** QA: how many distinct geometries this module is holding. */
export function geoStats() {
  let rounded = 0, plain = 0;
  for (const k of cache.keys()) (k[0] === "r" ? rounded++ : plain++);
  return { rounded, plain, total: cache.size };
}
