// ---------------------------------------------------------------------------
// pipboy.js — the character screens, drawn the way Fallout: New Vegas draws them: green phosphor on
// black, a header of tabs, a list on the left, the description of whatever you are pointing at below.
//
//   pipboy.create()          -> Promise<build | null>   character creation (SPECIAL + Zomboid-style traits)
//   pipboy.open(character)   the STAT / SPECIAL / SKILLS / PERKS / TRAITS screen (Tab); spends skill points
//   pipboy.close()  pipboy.isOpen
//   pipboy.hud(character)    the little level / XP readout under the health bars, and the level-up flag
//
// All state lives in stats.js; this file only draws it and passes the player's clicks back.
// ---------------------------------------------------------------------------

import { SPECIAL, SKILLS, TRAITS, PERKS, BACKGROUNDS, creationBudget, validateBuild, DEFAULT_BUILD } from "./stats.js";

const CSS = `
#pip, #pipCreate { position: fixed; inset: 0; z-index: 40; display: none; align-items: center; justify-content: center;
  background: rgba(2,8,3,.92); font-family: "Courier New", ui-monospace, monospace; color: #3dff7a; user-select: none; }
#pip.on, #pipCreate.on { display: flex; }
.pipScreen { position: relative; width: min(1120px, 96vw); height: min(680px, 92vh); border: 3px solid #1c8f45; border-radius: 14px;
  background: #061208; box-shadow: 0 0 40px rgba(61,255,122,.25), inset 0 0 60px rgba(0,60,20,.6); display: flex; flex-direction: column; overflow: hidden;
  text-shadow: 0 0 6px rgba(61,255,122,.55); }
.pipScreen::after { content: ""; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(0,0,0,.22) 0 1px, transparent 1px 3px); mix-blend-mode: multiply; }
.pipHead { display: flex; align-items: center; gap: 22px; padding: 10px 18px; border-bottom: 2px solid #1c8f45; font-size: 18px; letter-spacing: 2px; }
.pipHead .title { font-size: 22px; font-weight: bold; margin-right: auto; }
.pipTab { padding: 2px 10px; cursor: pointer; opacity: .7; }
.pipTab.on { opacity: 1; border: 1px solid #3dff7a; background: rgba(61,255,122,.14); }
.pipBody { flex: 1; display: flex; min-height: 0; }
.pipCol { flex: 1; padding: 12px 18px; overflow-y: auto; min-width: 0; }
.pipCol + .pipCol { border-left: 1px solid #1c8f45; }
.pipCol h3 { margin: 0 0 8px; font-size: 15px; letter-spacing: 2px; border-bottom: 1px dashed #1c8f45; padding-bottom: 4px; }
.pipRow { display: flex; align-items: center; gap: 8px; padding: 3px 6px; font-size: 16px; cursor: default; }
.pipRow:hover, .pipRow.sel { background: rgba(61,255,122,.16); }
.pipRow .grow { flex: 1; }
.pipRow .val { min-width: 34px; text-align: right; }
.pipBtn { border: 1px solid #3dff7a; background: transparent; color: #3dff7a; font: inherit; padding: 0 8px; cursor: pointer; text-shadow: inherit; }
.pipBtn:hover:not(:disabled) { background: rgba(61,255,122,.25); }
.pipBtn:disabled { opacity: .3; cursor: default; }
.pipFoot { border-top: 2px solid #1c8f45; padding: 10px 18px; min-height: 64px; font-size: 15px; display: flex; gap: 20px; align-items: center; }
.pipFoot .desc { flex: 1; }
.bad { color: #ff6a5a; text-shadow: 0 0 6px rgba(255,106,90,.5); }
.dim { opacity: .55; }
.pipBar { height: 12px; border: 1px solid #3dff7a; margin: 3px 0 8px; }
.pipBar i { display: block; height: 100%; background: #3dff7a; box-shadow: 0 0 8px #3dff7a; }
.pipTrait.taken { background: rgba(61,255,122,.22); }
.pipTag { display: inline-block; width: 14px; text-align: center; }
#xpHud { position: fixed; left: 14px; top: 112px; z-index: 12; font: bold 12px "Courier New", monospace; color: #3dff7a; text-shadow: 0 0 5px rgba(61,255,122,.5);
  background: rgba(4,12,6,.55); border: 1px solid rgba(61,255,122,.5); border-radius: 6px; padding: 3px 8px; display: none; pointer-events: none; min-width: 226px; }
#xpHud .bar { height: 5px; margin-top: 3px; border: 1px solid rgba(61,255,122,.6); }
#xpHud .bar i { display: block; height: 100%; background: #3dff7a; }
#xpHud.up { animation: xpUp 1s ease-in-out infinite; }
@keyframes xpUp { 50% { box-shadow: 0 0 14px #3dff7a; } }
#stealthHud { position: fixed; left: 50%; bottom: 88px; transform: translateX(-50%); z-index: 12; font: bold 13px "Courier New", monospace; letter-spacing: 3px;
  color: #3dff7a; background: rgba(4,12,6,.55); border: 1px solid rgba(61,255,122,.5); border-radius: 6px; padding: 3px 14px; display: none; pointer-events: none; }
#stealthHud.caution { color: #ffd23a; border-color: #ffd23a; }
#stealthHud.danger { color: #ff5a4a; border-color: #ff5a4a; }
`;

const h = (tag, props = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v; else if (k === "text") el.textContent = v; else if (k.startsWith("on")) el.addEventListener(k.slice(2), v); else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
};

export function createPipboy({ host = document.body, onOpen = () => {}, onClose = () => {} } = {}) {
  const style = h("style", { text: CSS });
  document.head.append(style);
  const overlay = h("div", { id: "pip" });
  const create = h("div", { id: "pipCreate" });
  host.append(overlay, create);
  const xpHud = h("div", { id: "xpHud" });
  const stealthHud = h("div", { id: "stealthHud" });
  host.append(xpHud, stealthHud);

  // ================================================================ creation
  let creationResolve = null;
  function openCreation() {
    return new Promise((resolve) => {
      creationResolve = resolve;
      const build = { name: "Survivor", special: { ...DEFAULT_BUILD.special }, traits: [], tagged: [], background: "none" };
      let hint = "Pick a point to read about it. Bad traits and low attributes give points back; good ones spend them.";
      const render = () => {
        const { attrPoints, traitPoints } = creationBudget(build);
        const errors = validateBuild(build);
        const setHint = (t) => { const d = create.querySelector(".desc"); if (d) d.textContent = t; };
        create.replaceChildren(h("div", { class: "pipScreen" },
          h("div", { class: "pipHead" }, h("span", { class: "title", text: "CHARACTER CREATION" }),
            h("span", { class: attrPoints < 0 ? "bad" : "", text: `ATTRIBUTE POINTS ${attrPoints}` }),
            h("span", { class: traitPoints < 0 ? "bad" : "", text: `TRAIT POINTS ${traitPoints}` })),
          h("div", { class: "pipBody" },
            // ---- S.P.E.C.I.A.L.
            h("div", { class: "pipCol" }, h("h3", { text: "S.P.E.C.I.A.L." }),
              SPECIAL.map((s) => h("div", { class: "pipRow", onmouseenter: () => setHint(`${s.name}: ${s.blurb}`) },
                h("span", { class: "grow", text: s.name }),
                h("button", { class: "pipBtn", text: "−", disabled: build.special[s.id] <= 1, onclick: () => { build.special[s.id]--; render(); } }),
                h("span", { class: "val", text: String(build.special[s.id]) }),
                h("button", { class: "pipBtn", text: "+", disabled: build.special[s.id] >= 10 || attrPoints <= 0, onclick: () => { build.special[s.id]++; render(); } }))),
              h("p", { class: "dim", text: "5 is average. Take an attribute below 5 to earn points for another." }),
              h("h3", { text: "BACKGROUND" }),
              BACKGROUNDS.map((b) => h("div", { class: "pipRow" + (build.background === b.id ? " sel" : ""), onmouseenter: () => setHint(`${b.name}: ${b.blurb} ${Object.entries(b.skills).map(([k, v]) => `+${v} ${k}`).join(", ")}`), onclick: () => { build.background = b.id; render(); } },
                h("span", { class: "grow", text: (build.background === b.id ? "▶ " : "  ") + b.name })))),
            // ---- traits
            h("div", { class: "pipCol" }, h("h3", { text: "TRAITS  (good ones cost, bad ones pay)" }),
              TRAITS.map((t) => h("div", { class: "pipRow pipTrait" + (build.traits.includes(t.id) ? " taken" : ""), onmouseenter: () => setHint(`${t.name}: ${t.blurb}`),
                onclick: () => { const i = build.traits.indexOf(t.id); if (i >= 0) build.traits.splice(i, 1); else build.traits.push(t.id); render(); } },
                h("span", { class: "pipTag", text: build.traits.includes(t.id) ? "■" : "□" }),
                h("span", { class: "grow" + (t.cost < 0 ? " bad" : ""), text: t.name }),
                h("span", { class: "val" + (t.cost < 0 ? "" : ""), text: t.cost > 0 ? `−${t.cost}` : `+${-t.cost}` })))),
            // ---- skills, name, go
            h("div", { class: "pipCol" }, h("h3", { text: `TAG 3 SKILLS  (${build.tagged.length}/3)  +15 each` }),
              SKILLS.map((k) => h("div", { class: "pipRow" + (build.tagged.includes(k.id) ? " sel" : ""), onmouseenter: () => setHint(`${k.name}: ${k.blurb}`),
                onclick: () => { const i = build.tagged.indexOf(k.id); if (i >= 0) build.tagged.splice(i, 1); else if (build.tagged.length < 3) build.tagged.push(k.id); render(); } },
                h("span", { class: "pipTag", text: build.tagged.includes(k.id) ? "★" : "☆" }), h("span", { class: "grow", text: k.name }))),
              h("h3", { text: "NAME" }),
              h("input", { value: build.name, maxlength: 20, style: "width:100%;background:#031007;color:#3dff7a;border:1px solid #3dff7a;font:inherit;padding:4px;", oninput: (e) => { build.name = e.target.value; } }),
              h("p", { class: errors.length ? "bad" : "dim", text: errors.length ? errors[0] : "Ready when you are." }))),
          h("div", { class: "pipFoot" }, h("div", { class: "desc", text: hint }),
            h("button", { class: "pipBtn", text: "BACK", onclick: () => { create.classList.remove("on"); creationResolve && creationResolve(null); creationResolve = null; } }),
            h("button", { class: "pipBtn", text: "RESET", onclick: () => { build.special = { ...DEFAULT_BUILD.special }; build.traits = []; build.tagged = []; build.background = "none"; render(); } }),
            h("button", { class: "pipBtn", text: "BEGIN", disabled: errors.length > 0, onclick: () => { if (errors.length) return; create.classList.remove("on"); const b = { ...build, name: (build.name || "Survivor").trim() || "Survivor" }; creationResolve && creationResolve(b); creationResolve = null; } }))));
      };
      render();
      create.classList.add("on");
    });
  }

  // ================================================================ the in-game screen
  let tab = "STATUS", ch = null, isOpen = false;
  const TABS = ["STATUS", "SPECIAL", "SKILLS", "PERKS", "TRAITS"];
  function draw() {
    if (!ch) return;
    const setDesc = (t) => { const d = overlay.querySelector(".desc"); if (d) d.textContent = t; };
    const bar = (f) => h("div", { class: "pipBar" }, h("i", { style: `width:${Math.round(Math.max(0, Math.min(1, f)) * 100)}%` }));
    let body;
    if (tab === "STATUS") {
      body = [
        h("div", { class: "pipCol" }, h("h3", { text: ch.name.toUpperCase() }),
          h("div", { class: "pipRow" }, h("span", { class: "grow", text: "Level" }), h("span", { class: "val", text: String(ch.level) })),
          h("div", { class: "pipRow" }, h("span", { class: "grow", text: `XP  ${ch.xp} / ${ch.xpToNext}` })), bar(ch.xpFrac),
          h("div", { class: "pipRow" }, h("span", { class: "grow", text: "Skill points" }), h("span", { class: "val" + (ch.skillPoints ? "" : " dim"), text: String(ch.skillPoints) })),
          h("div", { class: "pipRow" }, h("span", { class: "grow", text: "Perks to choose" }), h("span", { class: "val" + (ch.perkPoints ? "" : " dim"), text: String(ch.perkPoints) })),
          h("div", { class: "pipRow" }, h("span", { class: "grow", text: "Kills" }), h("span", { class: "val", text: String(ch.kills) })),
          h("div", { class: "pipRow" }, h("span", { class: "grow", text: "Background" }), h("span", { text: ch.background.name }))),
        h("div", { class: "pipCol" }, h("h3", { text: "EFFECTS" }),
          ...[
            ["Damage taken", `${Math.round(ch.mods.damageTakenMul() * 100)}%`], ["Firearm damage", `${Math.round(ch.mods.gunMul() * 100)}%`], ["Melee damage", `${Math.round(ch.mods.meleeMul() * 100)}%`],
            ["Crit chance", `${Math.round(ch.mods.critChance() * 100)}%`], ["Noticed by the dead", `${Math.round(ch.mods.stealthMul() * 100)}%`], ["Stamina", `${Math.round(ch.mods.staminaMul() * 100)}%`],
            ["Jump height", `${Math.round(ch.mods.jumpMul() * 100)}%`], ["Prices", `${Math.round(ch.mods.priceMul() * 100)}%`], ["Healing", `${Math.round(ch.mods.healMul() * 100)}%`], ["Loot", `${Math.round(ch.mods.lootMul() * 100)}%`],
          ].map(([k, v]) => h("div", { class: "pipRow" }, h("span", { class: "grow", text: k }), h("span", { class: "val", text: v })))),
      ];
    } else if (tab === "SPECIAL") {
      body = [h("div", { class: "pipCol" }, h("h3", { text: "S.P.E.C.I.A.L." }),
        SPECIAL.map((s) => h("div", { class: "pipRow", onmouseenter: () => setDesc(`${s.name}: ${s.blurb}`) }, h("span", { class: "grow", text: s.name }), h("span", { class: "val", text: String(ch.special[s.id]) }))))];
    } else if (tab === "SKILLS") {
      body = [h("div", { class: "pipCol" }, h("h3", { text: `SKILLS   points: ${ch.skillPoints}` }),
        SKILLS.map((k) => h("div", { class: "pipRow", onmouseenter: () => setDesc(`${k.name}: ${k.blurb}`) },
          h("span", { class: "pipTag", text: ch.tagged.includes(k.id) ? "★" : " " }), h("span", { class: "grow", text: k.name }),
          h("button", { class: "pipBtn", text: "+", disabled: !ch.skillPoints || ch.skill(k.id) >= 100, onclick: () => { if (ch.buySkill(k.id)) draw(); } }),
          h("span", { class: "val", text: String(ch.skill(k.id)) })))) ];
    } else if (tab === "PERKS") {
      body = [h("div", { class: "pipCol" }, h("h3", { text: `PERKS   to choose: ${ch.perkPoints}` }),
        PERKS.map((p) => {
          const has = ch.perks.includes(p.id), can = ch.canTakePerk(p);
          return h("div", { class: "pipRow" + (has ? " sel" : ""), onmouseenter: () => setDesc(`${p.name}: ${p.blurb}`) },
            h("span", { class: "pipTag", text: has ? "■" : "□" }), h("span", { class: "grow" + (has || can ? "" : " dim"), text: p.name }),
            h("button", { class: "pipBtn", text: "TAKE", disabled: !can, onclick: () => { if (ch.takePerk(p.id)) draw(); } }));
        }))];
    } else {
      body = [h("div", { class: "pipCol" }, h("h3", { text: "TRAITS" }),
        ch.traits.length ? ch.traits.map((id) => { const t = TRAITS.find((x) => x.id === id); return h("div", { class: "pipRow", onmouseenter: () => setDesc(`${t.name}: ${t.blurb}`) }, h("span", { class: "grow" + (t.cost < 0 ? " bad" : ""), text: t.name })); }) : h("p", { class: "dim", text: "None." }))];
    }
    overlay.replaceChildren(h("div", { class: "pipScreen" },
      h("div", { class: "pipHead" }, h("span", { class: "title", text: "PIP-BOY" }), TABS.map((t) => h("span", { class: "pipTab" + (t === tab ? " on" : ""), text: t, onclick: () => { tab = t; draw(); } }))),
      h("div", { class: "pipBody" }, body),
      h("div", { class: "pipFoot" }, h("div", { class: "desc", text: "Tab or Esc to close." }), h("button", { class: "pipBtn", text: "CLOSE", onclick: () => api.close() }))));
  }

  // ================================================================ HUD
  let lastLevel = 0;
  const api = {
    create: openCreation,
    open(character) { if (!character) return; ch = character; isOpen = true; overlay.classList.add("on"); draw(); onOpen(); },
    close() { if (!isOpen) return; isOpen = false; overlay.classList.remove("on"); onClose(); },
    get isOpen() { return isOpen; },
    toggle(character) { if (isOpen) api.close(); else api.open(character); },
    /** Level / XP under the health bars, pulsing while there is something to spend. */
    hud(character) {
      if (!character) { xpHud.style.display = "none"; return; }
      xpHud.style.display = "block";
      const spend = character.skillPoints + character.perkPoints;
      xpHud.classList.toggle("up", spend > 0);
      xpHud.replaceChildren(document.createTextNode(`${character.name.toUpperCase()}  LVL ${character.level}${spend ? `   ▲ ${spend} to spend (Tab)` : ""}`),
        h("div", { class: "bar" }, h("i", { style: `width:${Math.round(character.xpFrac * 100)}%` })));
      lastLevel = character.level;
    },
    /** The stealth read-out: HIDDEN / CAUTION / DETECTED, with the stance. */
    stealth(text, level) { stealthHud.style.display = text ? "block" : "none"; stealthHud.textContent = text || ""; stealthHud.className = level || ""; },
    get level() { return lastLevel; },
  };
  return api;
}
