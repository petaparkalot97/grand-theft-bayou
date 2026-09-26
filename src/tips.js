// ---------------------------------------------------------------------------
// tips.js — how the game works, told as it becomes useful.
//
// A GTA-style help box under the HUD. Keseme's story walks through the basics
// once the prologue hands over to Act One (story()); after that, each tip also
// fires by itself the first time it matters — low on health, the first wanted
// star, a pocket full of cash, the first time in OrleaRouge. Every tip shows
// once per run, waits out cutscenes, and holds long enough to read.
// ---------------------------------------------------------------------------

export const TIPS = Object.freeze({
  guns: {
    title: "BUYING GUNS",
    text: "Walk onto the yellow ring at a gun counter — <b>G</b> on the radar — and press <b>E</b>. " +
      "Pick with <b>W/S</b>, buy with <b>E</b>. Cash drops from the people you take down; the 9mm, " +
      "Tec-9, sawed-off and deer rifle are all for sale, and ammo for whatever you're holding.",
  },
  health: {
    title: "HEALING UP",
    text: "Low on health? <b>Popeyes</b> (<b>P</b>): buy a 3-piece at the counter, or grab a bucket. " +
      "A <b>hospital</b> (<b>✚</b>) patches you up for $60. From a car, honk (<b>H</b>) at a " +
      "<b>prostitute</b> — $50, +50 HP. Or the clubs on Frenchmen Street (<b>♥</b>) in OrleaRouge: " +
      "tip a dancer at the rail, or take the VIP chair for a lap dance.",
  },
  wanted: {
    title: "WANTED",
    text: "The stars are how badly Sheriff Mercer wants you. Crimes raise them — gunfire people " +
      "can hear, bodies, wrecked cruisers. To lose them: get out of sight and <b>stay hidden</b> " +
      "until they give up, or drive into a <b>Pay 'n' Spray</b> (<b>S</b>).",
  },
  spray: {
    title: "PAY 'N' SPRAY",
    text: "Drive any car you didn't take from the Sheriff into the garage (<b>S</b> on the radar). " +
      "$100: the door comes down, you get a new paint job and a fixed engine, and your wanted level " +
      "is gone.",
  },
  clubs: {
    title: "FRENCHMEN STREET",
    text: "OrleaRouge's bars and clubs are the <b>♥</b> on the radar — The Pink Pelican, Bayou " +
      "Belles, Club Bounce and Big Easy Beefcake. Walk in. At the stage rail, <b>E</b> makes it " +
      "rain ($10, +15 HP); the VIP chair is a lap dance ($40, +45 HP).",
  },
});

/** @param {{ getContext: () => object }} o  getContext returns the checks' inputs each tick */
export function createTips({ getContext }) {
  const css = document.createElement("style");
  css.textContent = `
    #helpBox { position: fixed; right: 16px; bottom: 60px; z-index: 21; width: 360px; max-width: calc(100vw - 32px);
      background: rgba(8,8,10,.86); color: #ecebe6; font: 14px/1.45 system-ui, sans-serif; padding: 12px 14px 13px;
      border-radius: 8px; border-left: 4px solid #ffd23a; box-shadow: 0 6px 24px rgba(0,0,0,.5);
      transition: opacity .35s, transform .35s; pointer-events: none; }
    #helpBox.off { opacity: 0; transform: translateX(12px); }
    #helpBox h4 { margin: 0 0 4px; font: 900 13px/1.2 system-ui; letter-spacing: .12em; color: #ffd23a; }
    #helpBox b { color: #fff; }
    body.letterbox #helpBox { opacity: 0; }`;
  document.head.appendChild(css);
  const box = document.createElement("div");
  box.id = "helpBox";
  box.className = "off";
  document.body.appendChild(box);

  const seen = new Set();
  const queue = [];
  let showing = null, left = 0, tick = 0, wantedFor = 0;

  function queueTip(id) {
    if (seen.has(id) || !TIPS[id]) return;
    seen.add(id);
    queue.push(id);
  }

  function update(dt) {
    const c = getContext();
    // contextual first times
    tick -= dt;
    if (tick <= 0) {
      tick = 0.5;
      if (c.running && !c.cinematic) {
        if (c.hp < 55) queueTip("health");
        if (c.cash >= 150 && c.storyStarted) queueTip("guns");
        if (c.wanted >= 1) queueTip("wanted");
        if (c.inOrlea) queueTip("clubs");
      }
    }
    if (c.wanted >= 1 && c.inCar) wantedFor += dt; else wantedFor = 0;
    if (wantedFor > 6) queueTip("spray");

    // the box: one tip at a time, and never over a cutscene
    if (showing) {
      if (!c.cinematic) left -= dt;
      if (left <= 0) { box.className = "off"; showing = null; left = 0.6; }
      return;
    }
    if (left > 0) { left -= dt; return; }       // a beat between tips
    if (!queue.length || c.cinematic || !c.running) return;
    showing = queue.shift();
    const tip = TIPS[showing];
    box.innerHTML = `<h4>${tip.title}</h4>${tip.text}`;
    box.className = "";
    left = 7 + tip.text.replace(/<[^>]+>/g, "").length * 0.035;
  }

  return {
    update,
    /** Keseme's story: the basics, in order, right after the prologue. */
    story() { for (const id of ["guns", "health", "wanted", "spray"]) queueTip(id); },
    show: queueTip,
    get showing() { return showing; },
    get queued() { return [...queue]; },
  };
}
