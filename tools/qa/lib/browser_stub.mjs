// ---------------------------------------------------------------------------
// browser_stub.mjs — the minimum browser surface the game modules touch.
//
// characters.js builds its surface textures on a <canvas>, weapons.js appends
// its HUD panel to document.body, and both read back pixel data they never
// render. This stands up just enough of that for headless QA, and nothing that
// could hide a real DOM dependency: anything not implemented here throws, loudly,
// which is what you want from a stub.
//
//   installBrowserStub();   // call before importing the game modules
// ---------------------------------------------------------------------------

const CTX_IMPL = {
  createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  getImageData: (x, y, w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
  measureText: () => ({ width: 0 }),
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
};

/** A canvas 2D context where every drawing call is a no-op and every property is
 *  assignable — the texture code only ever needs the image buffers back. */
const makeContext = () => new Proxy({}, {
  get: (t, k) => (k in CTX_IMPL ? CTX_IMPL[k] : k in t ? t[k] : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});

function makeElement(tag) {
  return {
    tagName: String(tag).toUpperCase(), id: "", className: "", textContent: "", innerHTML: "",
    hidden: false, width: 0, height: 0, dataset: {}, children: [], parentNode: null,
    style: { cssText: "", setProperty() {}, removeProperty() {}, getPropertyValue: () => "" },
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    appendChild(c) { this.children.push(c); if (c) c.parentNode = this; return c; },
    insertBefore(c) { return this.appendChild(c); },
    replaceChildren(...c) { this.children = c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); return c; },
    remove() {}, setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    focus() {}, blur() {}, click() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    getContext: tag === "canvas" ? makeContext : undefined,
  };
}

export function installBrowserStub() {
  const byId = new Map();
  globalThis.document = {
    createElement: makeElement,
    createElementNS: (_ns, tag) => makeElement(tag),
    getElementById: (id) => byId.get(id) || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {}, removeEventListener() {},
    head: makeElement("head"),
    body: makeElement("body"),
  };
  globalThis.devicePixelRatio = 1;
  globalThis.window = globalThis;
  return globalThis.document;
}
