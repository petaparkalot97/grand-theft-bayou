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
  bat:       { id: "bat",       name: "Baseball Bat", rarity: "starter",  damage: 3,   cooldown: 0.55, vehicleCooldown: 0.55, range: 2.2, clip: Infinity, melee: true },
  pistol:    { id: "pistol",    name: "9mm",        rarity: "common",   damage: 2,   cooldown: 0.42, vehicleCooldown: 0.3,  range: 30,  clip: 12, maxReserve: 72 },
  tec9:      { id: "tec9",      name: "Tec-9",      rarity: "common",   damage: 1.5, cooldown: 0.13, vehicleCooldown: 0.13, range: 24,  clip: 32, maxReserve: 128 },
  sawnoff:   { id: "sawnoff",   name: "Sawed-off",  rarity: "uncommon", damage: 6,   cooldown: 0.95, vehicleCooldown: 0.95, range: 13,  clip: 8,  maxReserve: 32 },
  deerRifle: { id: "deerRifle", name: "Deer rifle", rarity: "rare",     damage: 9,   cooldown: 1.15, vehicleCooldown: 1.15, range: 55,  clip: 5,  maxReserve: 20 },
});

export const RARITY = Object.freeze({
  starter:  { weight: 0,  color: 0xa0a8b0, label: "Starter" },
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
  if (!WEAPONS[state.weapon]) state.weapon = "bat";
  // Diagnostic starting loadout (human request, 2026-09-17): every character
  // starts owning every gun — one clip's worth of reserve each, not full
  // maxReserve — so cycleWeapon() (mouse wheel) can reach all of them
  // immediately to check animations/sounds/behavior without hunting for
  // pickups first. cycleWeapon() treats reserve > 0 as "owned".
  if (!state.reserve) {
    state.reserve = { pistol: WEAPONS.pistol.clip, tec9: WEAPONS.tec9.clip, sawnoff: WEAPONS.sawnoff.clip, deerRifle: WEAPONS.deerRifle.clip };
  }
  if (state.ammo == null) state.ammo = WEAPONS[state.weapon].clip;

  const hud = document.createElement("div");
  hud.id = "weaponHud";
  hud.style.cssText = "position:fixed;top:85px;right:16px;z-index:20;pointer-events:none;" +
    "display:flex;flex-direction:column;align-items:flex-end;gap:4px;transition:opacity .4s";
  document.body.appendChild(hud);
  const css = document.createElement("style");
  css.textContent = "body.letterbox #weaponHud { opacity: 0; }";
  document.head.appendChild(css);

  // No baseball bat icon exists anywhere in assets/ (checked the whole tree) —
  // it was mapped to "unarmed.png" (a bare-fists icon), which is the "am I
  // using my fists?" bug: the HUD visually said unarmed while the bat was
  // equipped and working fine. Drawn inline instead of adding a new binary
  // asset — a simple tapered-bar silhouette, same flat icon style as the rest.
  const BAT_ICON = "data:image/svg+xml;utf8," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <g transform="rotate(-40 32 32)">
        <rect x="29" y="8" width="6" height="15" rx="3" fill="#5a3a1e"/>
        <path d="M29 23 h6 v20 a3 3 0 0 1 -3 8 a3 3 0 0 1 -3 -8 z" fill="#c99a5b"/>
        <rect x="28.5" y="23" width="7" height="3" fill="#5a3a1e"/>
      </g>
    </svg>`
  );
  const ICONS = {
    bat: BAT_ICON,
    pistol: "WEAPON_PISTOL.png",
    tec9: "WEAPON_MICROSMG.png",
    sawnoff: "WEAPON_SHOTGUN.png",
    deerRifle: "WEAPON_ASSAULTRIFLE.png"
  };

  function render() {
    const w = WEAPONS[state.weapon] || WEAPONS.bat;
    // Holstered (main.js, X): dim the icon right down so the HUD reads as
    // "carrying it, not holding it" rather than looking like the weapon is gone.
    hud.style.opacity = state.holstered ? "0.35" : "1";
    hud.title = state.holstered ? "Weapon away — X to draw" : "";
    const iconName = ICONS[w.id] || BAT_ICON;
    const iconSrc = iconName.startsWith("data:") ? iconName : `./assets/ui/weapons/${iconName}`;
    const imgHtml = `<div style="background: rgba(0,0,0,0.6); border: 2px solid #000; border-radius: 12px; padding: 4px; display: flex; align-items: center; justify-content: center; width: 64px; height: 64px;"><img src="${iconSrc}" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(2px 2px 0px #000) drop-shadow(-1px -1px 0px #000);"></div>`;
    const tint = RARITY[w.rarity] ? "#" + RARITY[w.rarity].color.toString(16).padStart(6, "0") : "#f4f1ea";
    
    if (w.melee) {
      hud.innerHTML = `${imgHtml}`;
    } else {
      const clip = Number.isFinite(state.ammo) ? state.ammo : "∞";
      const res = state.reserve && state.reserve[w.id] != null ? state.reserve[w.id] : 0;
      hud.innerHTML = `${imgHtml}<div style="font:900 18px/1 'Arial Black',sans-serif;color:${tint};text-shadow:0 2px 2px #000, 0 0 4px #000;">${clip}-${res}</div>`;
    }
  }
  render();

  function reload() {
    const w = WEAPONS[state.weapon];
    if (!w || w.melee || !Number.isFinite(w.clip)) return false;
    if (state.ammo >= w.clip) return false;
    const res = state.reserve && state.reserve[w.id] ? state.reserve[w.id] : 0;
    if (res <= 0) {
      flashObjective(`No reserve ammo for ${w.name}!`);
      return false;
    }
    const needed = w.clip - state.ammo;
    const take = Math.min(needed, res);
    state.reserve[w.id] -= take;
    state.ammo += take;
    flashObjective(`Reloaded ${w.name} (+${take})`);
    render();
    return true;
  }

  function addReserve(id, rounds) {
    const w = WEAPONS[id];
    if (!w || w.melee) return;
    if (!state.reserve) state.reserve = {};
    if (state.freeRoam) { state.reserve[id] = Infinity; render(); return; }
    const maxRes = w.maxReserve || 100;
    state.reserve[id] = Math.min(maxRes, (state.reserve[id] || 0) + rounds);
    render();
  }

  return {
    WEAPONS,
    get current() { return WEAPONS[state.weapon] || WEAPONS.bat; },
    get ammo() { return state.ammo; },
    get reserve() { return state.reserve; },
    /** The numbers fire() uses. */
    stats(inVehicle) {
      const w = WEAPONS[state.weapon] || WEAPONS.bat;
      return { damage: w.damage, range: w.range, cooldown: inVehicle ? w.vehicleCooldown : w.cooldown, melee: !!w.melee, name: w.name };
    },
    /** One round spent; bat never runs out. */
    consume() {
      const w = WEAPONS[state.weapon];
      if (!w || w.melee || !Number.isFinite(state.ammo)) return;
      state.ammo--;
      if (state.ammo <= 0) {
        const res = state.reserve && state.reserve[w.id] ? state.reserve[w.id] : 0;
        if (res > 0) {
          reload();
        } else {
          flashObjective(`${w.name} is empty! Back to the Baseball Bat.`);
          state.weapon = "bat";
          state.ammo = Infinity;
        }
      }
      render();
    },
        cycleWeapon(dir) {
      const keys = Object.keys(WEAPONS);
      const available = keys.filter(k => {
        if (state.veh && k !== 'pistol' && k !== 'tec9') return false;
        if (k === 'bat' || state.freeRoam) return true;
        if (state.weapon === k && state.ammo > 0) return true;
        if (state.reserve && state.reserve[k] > 0) return true;
        return false;
      });
      if (available.length <= 1) return; // Nothing to switch to
      
      let idx = available.indexOf(state.weapon);
      if (idx === -1) idx = 0;
      
      // Before switching, dump current clip into reserve
      if (!WEAPONS[state.weapon].melee && Number.isFinite(state.ammo)) {
        if (!state.reserve) state.reserve = {};
        const maxRes = WEAPONS[state.weapon].maxReserve || 100;
        state.reserve[state.weapon] = Math.min(maxRes, (state.reserve[state.weapon] || 0) + state.ammo);
      }
      
      idx = (idx + dir + available.length) % available.length;
      const nextId = available[idx];
      
      state.weapon = nextId;
      const w = WEAPONS[nextId];
      if (w.melee || state.freeRoam) {
        state.ammo = Infinity;
      } else {
        const res = state.reserve && state.reserve[nextId] ? state.reserve[nextId] : 0;
        const take = Math.min(w.clip, res);
        state.ammo = take;
        state.reserve[nextId] -= take;
      }
      render();
    },
    enforceVehicle() {
      if (state.veh && state.weapon !== "pistol" && state.weapon !== "tec9") {
        if (state.reserve && state.reserve.tec9 > 0) {
          this.cycleWeapon(1); // Force a cycle, it will naturally pick tec9/pistol due to the filter
          if (state.weapon !== "tec9" && state.weapon !== "pistol") {
             // If cycleWeapon didn't work (no ammo), force it anyway
             state.weapon = "pistol";
             state.ammo = 0;
          }
        } else {
          // Just force switch to pistol
          state.weapon = "pistol";
          this.reload();
        }
        render();
      }
    },
    reload,
    addReserve,
    /** Pick up a weapon: the same one adds ammo to reserve, a different one swaps. */
    give(id, rounds) {
      const w = WEAPONS[id];
      if (!w) return;
      if (w.melee) {
        state.weapon = "bat";
        state.ammo = Infinity;
        render();
        return;
      }
      if (!state.reserve) state.reserve = {};
      if (state.freeRoam) { state.weapon = id; state.ammo = Infinity; state.reserve[id] = Infinity; render(); return; }
      const n = rounds != null ? rounds : w.clip;
      if (state.weapon === id) {
        const maxRes = w.maxReserve || 100;
        state.reserve[id] = Math.min(maxRes, (state.reserve[id] || 0) + n);
      } else {
        state.weapon = id;
        state.ammo = Math.min(w.clip, n);
        const overflow = Math.max(0, n - w.clip);
        if (overflow > 0) {
          const maxRes = w.maxReserve || 100;
          state.reserve[id] = Math.min(maxRes, (state.reserve[id] || 0) + overflow);
        }
      }
      this.enforceVehicle();
      render();
    },
    render,
  };
}

