// ---------------------------------------------------------------------------
// ledgerboard.js — "THE LEDGER": Keseme's evidence board.
//
// A full-screen corkboard overlay for the Act One map scene: index cards for
// every kind of name in the ledger, red string drawn from each to PELICAN CROWN
// HOLDINGS, then PROJECT NOLANTIS with its crown-over-waves mark, and finally a
// set of coordinates pointing south to OrleaRouge.
//
// It is plain SVG with its own styles, so it needs nothing in index.html. The
// scene script decides the pacing (cinema.js waits); every call here is instant
// apart from the CSS transitions.
// ---------------------------------------------------------------------------

const NS = "http://www.w3.org/2000/svg";

const STYLE = `
  #ledgerBoard { position: fixed; inset: 0; z-index: 17; pointer-events: none; opacity: 0;
    transition: opacity .8s ease; }
  #ledgerBoard.on { opacity: 1; }
  #ledgerBoard svg { width: 100%; height: 100%; display: block; }
  #ledgerBoard .card { opacity: 0; transform-box: fill-box; transform-origin: center;
    transform: scale(.85) rotate(var(--tilt)); transition: opacity .45s ease, transform .45s ease; }
  #ledgerBoard .card.on { opacity: 1; transform: scale(1) rotate(var(--tilt)); }
  #ledgerBoard .card.hot rect.face { fill: #fff3c4; stroke: #c28b16; stroke-width: 4; }
  #ledgerBoard .string { fill: none; stroke: #b3261e; stroke-width: 3.2; stroke-linecap: round;
    transition: stroke-dashoffset 1.1s ease; filter: drop-shadow(0 2px 1px rgba(0,0,0,.45)); }
  #ledgerBoard .stamp { opacity: 0; transition: opacity .6s ease; }
  #ledgerBoard .stamp.on { opacity: 1; }
`;

function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
}

export function createLedgerBoard() {
  if (!document.getElementById("ledgerBoardStyle")) {
    const s = document.createElement("style");
    s.id = "ledgerBoardStyle";
    s.textContent = STYLE;
    document.head.appendChild(s);
  }
  const root = document.createElement("div");
  root.id = "ledgerBoard";
  document.body.appendChild(root);

  const svg = el("svg", { viewBox: "0 0 1600 900", preserveAspectRatio: "xMidYMid slice" }, root);
  const defs = el("defs", {}, svg);
  const cork = el("radialGradient", { id: "lbCork", cx: "50%", cy: "45%", r: "75%" }, defs);
  el("stop", { offset: "0%", "stop-color": "#a57a4f" }, cork);
  el("stop", { offset: "70%", "stop-color": "#7c5634" }, cork);
  el("stop", { offset: "100%", "stop-color": "#3b2716" }, cork);
  const grain = el("filter", { id: "lbGrain" }, defs);
  el("feTurbulence", { type: "fractalNoise", baseFrequency: "0.9", numOctaves: "2", stitchTiles: "stitch" }, grain);
  el("feColorMatrix", { values: "0 0 0 0 0.2  0 0 0 0 0.12  0 0 0 0 0.05  0 0 0 0.35 0" }, grain);
  el("rect", { width: 1600, height: 900, fill: "url(#lbCork)" }, svg);
  el("rect", { width: 1600, height: 900, filter: "url(#lbGrain)" }, svg);

  const strings = el("g", {}, svg);
  const cards = el("g", {}, svg);
  const nodes = new Map();

  function addCard(id, label, x, y, { sub = "", w = 230, hot = false, tilt = null } = {}) {
    // Position lives on an outer group. The CSS transform that animates the
    // card replaces an SVG `transform` attribute on the same element, which
    // stacked every card at the origin.
    const holder = el("g", { transform: `translate(${x} ${y})` }, cards);
    const g = el("g", { class: "card" + (hot ? " hot" : "") }, holder);
    g.style.setProperty("--tilt", (tilt != null ? tilt : (Math.random() * 6 - 3)).toFixed(1) + "deg");
    const h = sub ? 96 : 70;
    el("rect", { x: -w / 2 + 5, y: -h / 2 + 7, width: w, height: h, fill: "rgba(0,0,0,.35)", rx: 3 }, g);
    el("rect", { class: "face", x: -w / 2, y: -h / 2, width: w, height: h, fill: "#f4efe2", stroke: "#d8cfb8", rx: 3 }, g);
    el("line", { x1: -w / 2 + 12, y1: -h / 2 + 22, x2: w / 2 - 12, y2: -h / 2 + 22, stroke: "#e07a73", "stroke-width": 1.5 }, g);
    const t = el("text", {
      x: 0, y: sub ? -6 : 12, "text-anchor": "middle",
      "font-family": "'Courier New', Courier, monospace", "font-weight": "700",
      "font-size": hot ? 25 : 22, fill: "#1d1d1d",
    }, g);
    t.textContent = label;
    if (sub) {
      const s = el("text", {
        x: 0, y: 26, "text-anchor": "middle", "font-family": "'Courier New', monospace",
        "font-size": 16, fill: "#5a4a3a",
      }, g);
      s.textContent = sub;
    }
    // the pin
    el("circle", { cx: 0, cy: -h / 2 + 6, r: 8, fill: hot ? "#c28b16" : "#b3261e", stroke: "#3a0d0a", "stroke-width": 2 }, g);
    nodes.set(id, { g, x, y: y - h / 2 + 6 });
    requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add("on")));
    return g;
  }

  function link(a, b) {
    const A = nodes.get(a), B = nodes.get(b);
    if (!A || !B) return;
    // a little sag, the way string hangs between two pins
    const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2 + Math.hypot(B.x - A.x, B.y - A.y) * 0.08;
    const p = el("path", { class: "string", d: `M${A.x} ${A.y} Q${mx} ${my} ${B.x} ${B.y}` }, strings);
    const len = p.getTotalLength ? p.getTotalLength() : 1000;
    p.style.strokeDasharray = len;
    p.style.strokeDashoffset = len;
    requestAnimationFrame(() => requestAnimationFrame(() => { p.style.strokeDashoffset = 0; }));
  }

  function stamp(text, x, y, { size = 40, color = "#b3261e", rotate = -6 } = {}) {
    const g = el("g", { class: "stamp", transform: `translate(${x} ${y}) rotate(${rotate})` }, svg);
    const t = el("text", {
      x: 0, y: 0, "text-anchor": "middle", "font-family": "'Arial Black', Impact, sans-serif",
      "font-size": size, fill: "none", stroke: color, "stroke-width": 2.5, "letter-spacing": 2,
    }, g);
    t.textContent = text;
    const bb = t.getBBox ? t.getBBox() : { x: -200, y: -size, width: 400, height: size * 1.2 };
    el("rect", { x: bb.x - 16, y: bb.y - 10, width: bb.width + 32, height: bb.height + 20,
      fill: "none", stroke: color, "stroke-width": 4, rx: 6 }, g);
    requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add("on")));
  }

  return {
    show() { root.classList.add("on"); },
    hide() { root.classList.remove("on"); },
    addCard,
    link,
    stamp,
    highlight(id) { const n = nodes.get(id); if (n) n.g.classList.add("hot"); },
    /** Clear everything, ready to be built again (e.g. replaying the scene). */
    reset() {
      root.classList.remove("on");
      strings.replaceChildren();
      cards.replaceChildren();
      for (const s of svg.querySelectorAll(".stamp")) s.remove();
      nodes.clear();
    },
  };
}
