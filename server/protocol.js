export const MAX_PLAYERS = 4;
export const TICK_RATE = 20;
export const CHARACTERS = ["keseme", "peta", "chimi", "gr33do", "dixon"];   // every id in src/playerCharacters.js

export function send(ws, type, payload = {}) {
  if (ws.readyState === 1) ws.send(JSON.stringify({ type, ...payload }));
}

export function parseMessage(raw) {
  try {
    const value = JSON.parse(String(raw));
    if (!value || typeof value.type !== "string" || value.type.length > 40) return null;
    return value;
  } catch { return null; }
}

export function safeCharacter(id) { return CHARACTERS.includes(id) ? id : null; }

export function clampNumber(value, min, max, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}
