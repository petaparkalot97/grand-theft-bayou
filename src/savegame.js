// ---------------------------------------------------------------------------
// savegame.js — three manual save slots in the browser's localStorage.
//
// A save is a plain JSON snapshot main.js builds (mode, place, health, cash, guns and ammo, kills, the clock, the
// Pip-Boy character in zombie mode). This module only stores and lists them; what goes in and how it is put back
// is main.js's job (snapshotGame / applySave). Everything is wrapped: private windows and blocked storage just
// mean "no saves", never an exception.
// ---------------------------------------------------------------------------

const KEY = "gtb.saves.v1";
export const SAVE_SLOTS = 3;
export const SAVE_VERSION = 1;

function readAll() {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(all) ? all : [];
  } catch (e) { return []; }
}

/** [{ slot, save|null }] for every slot. */
export function listSaves() {
  const all = readAll();
  return Array.from({ length: SAVE_SLOTS }, (_, slot) => ({ slot, save: all[slot] && all[slot].v === SAVE_VERSION ? all[slot] : null }));
}

export function getSave(slot) { return listSaves()[slot]?.save || null; }

/** Returns true if it was stored. */
export function putSave(slot, data) {
  if (slot < 0 || slot >= SAVE_SLOTS) return false;
  const all = readAll();
  while (all.length < SAVE_SLOTS) all.push(null);
  all[slot] = { ...data, v: SAVE_VERSION, savedAt: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(all)); return true; } catch (e) { return false; }
}

export function deleteSave(slot) {
  const all = readAll();
  if (slot >= 0 && slot < all.length) all[slot] = null;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* storage blocked */ }
}

/** "Zombie Survival · Lv 4 · $120 · 2 Oct 21:14" for a slot row. */
export function describeSave(s) {
  if (!s) return "Empty";
  const mode = s.mode === "zombie" ? "Zombie Survival" : "Free Roam";
  const lv = s.stats && s.stats.level ? ` · Lv ${s.stats.level}` : "";
  const when = new Date(s.savedAt || 0).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `${mode}${lv} · ${s.place || "the Bayou"} · $${(s.cash || 0).toLocaleString()} · ${when}`;
}
