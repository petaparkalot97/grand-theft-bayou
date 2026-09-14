// ---------------------------------------------------------------------------
// weapons.js — the player's weapon slot.
//
// The game had one gun, hard-coded into fire(). This keeps that as the starter
// 9mm (infinite ammo, the same numbers) and adds the weapons NPCs can drop. There
// is one slot: picking up a different weapon swaps to it, picking up the same one
// adds its ammo, and running dry falls back to the 9mm. The slot lives on the
// game state (state.weapon, state.ammo) next to state.cash; nothing else keeps
// a second inventory.
// ---------------------------------------------------------------------------

export const WEAPONS = Object.freeze({
  pistol:    { id: "pistol",    name: "9mm",        rarity: "starter",  damage: 2,   cooldown: 0.42, vehicleCooldown: 0.3, range: 30, clip: Infinity },
  tec9:      { id: "tec9",      name: "Tec-9",      rarity: "common",   damage: 1.5, cooldown: 0.13, vehicleCooldown: 0.13, range: 24, clip: 48 },
  sawnoff:   { id: "sawnoff",   name: "Sawed-off",  rarity: "uncommon", damage: 6,   cooldown: 0.95, vehicleCooldown: 0.95, range: 13, clip: 10 },
  deerRifle: { id: "deerRifle", name: "Deer rifle", rarity: "rare",     damage: 9,   cooldown: 1.15, vehicleCooldown: 1.15, range: 55, clip: 8 },
});

export const RARITY = Object.freeze({
  common:   { weight: 65, color: 0xd9dde2, label: "Common" },
  uncommon: { weight: 27, color: 0x4fc3f7, label: "Uncommon" },
  rare:     { weight: 8,  color: 0xffd23a, label: "Rare" },
});

/**
 * @param {object} o
 * @param {object} o.state          the game state (state.weapon / state.ammo live here)
 * @param {Function} o.flashObjective
 */
export function createArsenal({ state, flashObjective }) {
  if (!WEAPONS[state.weapon]) state.weapon = "pistol";
  if (state.ammo == null) state.ammo = Infinity;

  const hud = document.createElement("div");
  hud.id = "weaponHud";
  hud.style.cssText = "position:fixed;top:124px;right:16px;z-index:20;pointer-events:none;" +
    "font:700 13px/1 system-ui,sans-serif;letter-spacing:.06em;color:#f4f1ea;text-shadow:0 1px 3px #000;" +
    "background:rgba(0,0,0,.35);padding:5px 9px;border-radius:12px;transition:opacity .4s";
  document.body.appendChild(hud);
  const css = document.createElement("style");
  css.textContent = "body.letterbox #weaponHud { opacity: 0; }";
  document.head.appendChild(css);

  function render() {
    const w = WEAPONS[state.weapon];
    const ammo = Number.isFinite(state.ammo) ? state.ammo : "∞";
    const tint = RARITY[w.rarity] ? "#" + RARITY[w.rarity].color.toString(16).padStart(6, "0") : "#f4f1ea";
    hud.innerHTML = `<span style="color:${tint}">${w.name}</span> · ${ammo}`;
  }
  render();

  return {
    WEAPONS,
    get current() { return WEAPONS[state.weapon]; },
    get ammo() { return state.ammo; },
    /** The numbers fire() uses. */
    stats(inVehicle) {
      const w = WEAPONS[state.weapon];
      return { damage: w.damage, range: w.range, cooldown: inVehicle ? w.vehicleCooldown : w.cooldown };
    },
    /** One round spent; the 9mm never runs out. */
    consume() {
      if (!Number.isFinite(state.ammo)) return;
      state.ammo--;
      if (state.ammo <= 0) {
        flashObjective(`${WEAPONS[state.weapon].name} is empty. Back to the 9mm.`);
        state.weapon = "pistol";
        state.ammo = Infinity;
      }
      render();
    },
    /** Pick up a weapon: the same one adds ammo, a different one swaps. */
    give(id, rounds) {
      const w = WEAPONS[id];
      if (!w) return;
      const n = rounds != null ? rounds : w.clip;
      if (state.weapon === id && Number.isFinite(state.ammo)) state.ammo += n;
      else { state.weapon = id; state.ammo = n; }
      render();
    },
    render,
  };
}
