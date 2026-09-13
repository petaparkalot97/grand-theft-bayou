// ---------------------------------------------------------------------------
// input.js — one source of truth for controls.
//
// Gameplay code asks about ACTIONS ("forward", "interact"), never key codes, so
// rebinding a key is a one-line change here and no system invents its own idea
// of what W means. Mouse look belongs to camera.js; the cutscene keys (Enter /
// Esc) to cinema.js.
//
//   input.isDown("forward")            held?
//   input.axis("back", "forward")      −1 / 0 / +1
//   input.onPress("interact", fn)      edge-triggered, ignores key repeat
// ---------------------------------------------------------------------------

export const DEFAULT_BINDINGS = Object.freeze({
  // movement: on foot these are camera-relative, in a vehicle they are throttle / steering
  forward: ["KeyW", "ArrowUp"],
  back: ["KeyS", "ArrowDown"],
  left: ["KeyA"],
  right: ["KeyD"],
  sprint: ["ShiftLeft", "ShiftRight"],     // on foot
  brake: ["ShiftLeft", "ShiftRight"],      // in a vehicle (handbrake)
  orbitLeft: ["KeyQ", "ArrowLeft"],        // keyboard camera orbit, secondary to the mouse
  orbitRight: ["KeyE", "ArrowRight"],
  interact: ["KeyF"],                      // enter / exit a vehicle, use things (Enter is the cutscene key)
  fire: ["Space"],
  mute: ["KeyM"],
  nextTrack: ["KeyN"],
  gfxDown: ["BracketLeft"],
  gfxUp: ["BracketRight"],
  perf: ["F3"],
  debugOrientation: ["F4"],
});

// keys the browser must not act on (scrolling, find bar, …)
const SWALLOW = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "F3", "F4"]);

export function createInput({ bindings = DEFAULT_BINDINGS, target = window } = {}) {
  const held = new Set();                  // key codes currently down
  const byCode = new Map();                // code -> [actions]
  for (const [action, codes] of Object.entries(bindings)) {
    for (const code of codes) {
      if (!byCode.has(code)) byCode.set(code, []);
      byCode.get(code).push(action);
    }
  }
  const handlers = new Map();              // action -> [fn]

  target.addEventListener("keydown", (e) => {
    if (SWALLOW.has(e.code)) e.preventDefault();
    held.add(e.code);
    if (e.repeat) return;
    for (const action of byCode.get(e.code) || []) {
      for (const fn of handlers.get(action) || []) fn(e);
    }
  });
  target.addEventListener("keyup", (e) => held.delete(e.code));
  // alt-tab or a lost pointer lock must not leave W stuck down
  target.addEventListener("blur", () => held.clear());

  const isDown = (action) => (bindings[action] || []).some((c) => held.has(c));

  return {
    bindings,
    isDown,
    /** −1 when `negative` is held, +1 for `positive`, 0 for neither or both. */
    axis: (negative, positive) => (isDown(positive) ? 1 : 0) - (isDown(negative) ? 1 : 0),
    onPress(action, fn) {
      if (!handlers.has(action)) handlers.set(action, []);
      handlers.get(action).push(fn);
    },
    clear: () => held.clear(),
  };
}
