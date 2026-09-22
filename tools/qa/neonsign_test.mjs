// neonsign.js — does the fitter actually fit?
//
//   node tools/qa/neonsign_test.mjs
//
// The sign fixer's whole job is to never reproduce the clipped-texture bug
// (PELICAN CROWN CASINO running past the border at a fixed 100 px, and a 4:1
// texture smeared across an 8.3:1 fascia). So this test asserts the two things
// that went wrong, numerically, with a fake 2D context whose measureText is
// proportional to the font size (a constant-width stub would hide a clip):
//
//   * every glyph run is drawn INSIDE the border rectangle that was stroked
//   * the canvas aspect ratio equals the physical sign face's aspect ratio
//   * short names stay near the height ceiling; long names shrink, but stay big
//   * blade (vertical) signs fit the widest glyph and the stacked block height
//
// No browser, no GPU: it is the geometry and the math, which is where the bug was.

import { fitFontSize, neonSignTexture, aspectOf } from "../../src/neonsign.js";
import { CROWN_STRIP } from "../../src/tusouxroeNorth.js";

let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : " FAIL "} ${label}${detail ? `  — ${detail}` : ""}`);
}

// ---------------------------------------------------------------- a fake canvas
// Advance widths close to Arial Black uppercase: 0.64 em a glyph, 0.32 a space.
function advance(s, size) {
  let em = 0;
  for (const ch of String(s)) em += ch === " " ? 0.32 : 0.64;
  return em * size;
}
const canvases = [];
function fakeCanvas() {
  const el = { width: 0, height: 0, __ops: [] };
  const ctx = {
    fillStyle: "", font: "", textAlign: "", textBaseline: "", shadowColor: "",
    shadowBlur: 0, lineWidth: 0, strokeStyle: "",
    fillRect(x, y, w, h) { el.__ops.push({ t: "rect", x, y, w, h }); },
    strokeRect(x, y, w, h) { el.__ops.push({ t: "rect", x, y, w, h }); },
    fillText(text, x, y) { el.__ops.push({ t: "text", text, x, y, font: this.font, align: this.textAlign }); },
    measureText(s) {
      const m = /(\d+(?:\.\d+)?)px/.exec(this.font || "");
      return { width: advance(s, m ? parseFloat(m[1]) : 10) };
    },
  };
  el.getContext = () => ctx;
  canvases.push(el);
  return el;
}
globalThis.document = { createElement: (tag) => (tag === "canvas" ? fakeCanvas() : { style: {} }) };

const sizeOf = (font) => {
  const m = /(\d+(?:\.\d+)?)px/.exec(font || "");
  return m ? parseFloat(m[1]) : 0;
};

/** Draw a sign, then check every glyph run sits inside the stroked border. */
function audit(label, { text, ink = "#ffcf4a", aspect, vertical = false }) {
  canvases.length = 0;
  neonSignTexture({ text, ink, aspect, vertical });
  const c = canvases[canvases.length - 1];
  if (!c) return { ok: false, why: "no canvas" };
  const rects = c.__ops.filter((o) => o.t === "rect");
  const border = rects[rects.length - 1];
  const texts = c.__ops.filter((o) => o.t === "text");
  if (!border || !texts.length) return { ok: false, why: "no border or no text" };

  let inside = true, why = "";
  for (const t of texts) {
    const w = advance(t.text, sizeOf(t.font));
    const left = t.align === "center" ? t.x - w / 2 : t.x;
    const right = left + w;
    const size = sizeOf(t.font);
    // a deliberate over-estimate: canvas "middle" baseline puts uppercase ink at
    // roughly ±0.36 em, so ±0.40 em is a conservative envelope
    const top = t.y - size * 0.40, bottom = t.y + size * 0.40;
    if (left < border.x - 0.01 || right > border.x + border.w + 0.01) {
      inside = false; why = `"${t.text}" spans ${left.toFixed(0)}..${right.toFixed(0)} vs border ${border.x.toFixed(0)}..${(border.x + border.w).toFixed(0)}`;
    }
    if (top < border.y - 0.01 || bottom > border.y + border.h + 0.01) {
      inside = false; why = `"${t.text}" vertical overflow`;
    }
  }
  return { ok: inside, why, canvas: c, text: texts[0], border, size: sizeOf(texts[0].font) };
}

// ---------------------------------------------------------------- 1. the fitter itself
{
  // a tiny metric object: the fitter writes `font`, measureText reads it back
  const metric = { font: "", measureText(s) { return { width: advance(s, sizeOf(this.font)) }; } };
  const long = fitFontSize(metric, "PELICAN CROWN CASINO", { maxWidth: 2000, maxSize: 280, minSize: 10 });
  const short = fitFontSize(metric, "BAYOU GOLD", { maxWidth: 2000, maxSize: 280, minSize: 10 });
  check("a long name shrinks to fit", long < 280, `${long.toFixed(1)}px from 280`);
  check("a short name keeps the ceiling", short === 280, `${short.toFixed(1)}px`);
  check("the fitted long name fits its width",
    advance("PELICAN CROWN CASINO", long) <= 2000 + 0.5, `${advance("PELICAN CROWN CASINO", long).toFixed(0)} <= 2000`);
  check("a name shorter than the box is not grown past the ceiling",
    fitFontSize(metric, "THE STILT", { maxWidth: 100000, maxSize: 140, minSize: 10 }) === 140);
  check("a stub that reports nothing does not loop forever",
    fitFontSize({ font: "", measureText: () => ({ width: 0 }) }, "X", { maxWidth: 10, maxSize: 99 }) === 99);
  check("no measurement is survivable", fitFontSize(null, "X", { maxWidth: 10, maxSize: 50 }) === 50);
}

// ---------------------------------------------------------------- 2. aspect ratio
{
  const faces = [
    { label: "casino fascia", w: 24, h: 2.9 },
    { label: "club fascia", w: 13, h: 2.1 },
    { label: "bar fascia", w: 10, h: 2.1 },
    { label: "strip gateway", w: 24, h: 1.4 },
    { label: "blade sign", w: 1.15, h: 4.6, vertical: true },
  ];
  for (const f of faces) {
    const want = f.w / f.h;
    canvases.length = 0;
    neonSignTexture({ text: "BAYOU GOLD", ink: "#fff", aspect: aspectOf(f.w, f.h), vertical: !!f.vertical });
    const c = canvases[canvases.length - 1];
    const got = c.width / c.height;
    check(`${f.label} texture aspect matches the face`, Math.abs(got - want) < 0.02,
      `${got.toFixed(3)} vs ${want.toFixed(3)} (${c.width}x${c.height})`);
  }
}

// ---------------------------------------------------------------- 3. every Crown venue
{
  const names = new Set();
  let worst = { size: Infinity, name: "", textH: 0 };
  let minRatio = Infinity;
  for (const v of CROWN_STRIP.venues) {
    const roof = v.kind === "casino" ? 2.9 : 2.1;
    const face = { text: v.name, ink: v.ink, aspect: aspectOf(v.k.w - 2, roof) };
    const a = audit(v.name, face);
    names.add(v.name);
    if (!a.ok) check(`roof sign "${v.name}" stays inside its border`, false, a.why);
    else {
      // how much of the sign height the caps fill (cap height ~0.75 em)
      const ratio = (a.size * 0.75) / a.canvas.height;
      if (ratio < minRatio) { minRatio = ratio; worst = { name: v.name, size: a.size, textH: a.size * 0.75, ratio }; }
    }
    if (v.k.door < 4.5) {
      const b = audit(v.name, { text: v.name, ink: v.ink, aspect: aspectOf(1.15, 4.6), vertical: true });
      if (!b.ok) check(`blade sign "${v.name}" stays inside its border`, false, b.why);
    }
  }
  check("every Crown roof name fits inside its own border", true, `${names.size} names`);
  check("no Crown name is rendered tiny",
    minRatio >= 0.25,
    `smallest cap height is ${(minRatio * 100).toFixed(0)}% of the sign (${worst.name}, ${worst.size.toFixed(0)}px)`);
  // the other half of the brief: short names must stay big, not be shrunk to fit
  // the longest name on the strip
  const shorts = [];
  for (const v of CROWN_STRIP.venues) {
    if (v.name.replace(/ /g, "").length > 10) continue;
    const a = audit(v.name, { text: v.name, ink: v.ink, aspect: aspectOf(v.k.w - 2, v.kind === "casino" ? 2.9 : 2.1) });
    shorts.push({ n: v.name, r: (a.size * 0.72) / a.canvas.height });
  }
  const minShort = shorts.reduce((m, s) => Math.min(m, s.r), 1);
  check("short Crown names stay large", minShort >= 0.52,
    `${shorts.length} short names, smallest cap height ${(minShort * 100).toFixed(0)}%`);
  const gate = audit("CROWN STRIP", { text: "CROWN STRIP", ink: "#ffcf4a", aspect: aspectOf(24, 1.4) });
  check("the strip gateway name fits", gate.ok, gate.why);
}

// ---------------------------------------------------------------- 4. OrleaRouge signs
{
  // nightlife.js: PlaneGeometry(W - 1, 2.2), W = 12
  const clubAspect = aspectOf(11, 2.2);
  // casinos.js: BoxGeometry(W - 1, 1.7), W = 15
  const casinoAspect = aspectOf(14, 1.7);
  const nightlife = ["THE PINK PELICAN", "BAYOU BELLES", "CLUB BOUNCE", "BIG EASY BEEFCAKE"];
  const casinos = ["PELICAN PALACE", "THE GOLDEN GATOR", "BELLEFONTAINE CLUB", "LUCKY SEVENTH"];
  const run = (list, aspect) => {
    for (const n of list) { const a = audit(n, { text: n, aspect }); if (!a.ok) return `${n}: ${a.why}`; }
    return "";
  };
  const clubWhy = run(nightlife, clubAspect);
  const casinoWhy = run(casinos, casinoAspect);
  check("nightlife club names fit their plane", !clubWhy, clubWhy);
  check("casino names fit their fascia", !casinoWhy, casinoWhy);
}

// ---------------------------------------------------------------- 5. no DOM, no crash
{
  const saved = globalThis.document;
  delete globalThis.document;
  const t = neonSignTexture({ text: "X", ink: "#fff", aspect: 4 });
  check("neonSignTexture returns null without a DOM", t === null);
  globalThis.document = saved;
}

console.log(`\n${failures ? failures + " FAILED" : "all checks passed"}.\n`);
process.exit(failures ? 1 : 0);
