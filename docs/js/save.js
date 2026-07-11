import { SAVE_KEY, MAX_UPGRADE, COSTS } from "./constants.js";

export function defaultSave() {
  return { version: 1, coins: 0, topSpeedLevel: 0, accelerationLevel: 0, handlingLevel: 0 };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    const d = JSON.parse(raw);
    return {
      version: 1,
      coins: d.coins | 0,
      topSpeedLevel: d.topSpeedLevel | 0,
      accelerationLevel: d.accelerationLevel | 0,
      handlingLevel: d.handlingLevel | 0,
    };
  } catch {
    return defaultSave();
  }
}

export function writeSave(data) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

export function topSpeedFactor(save) { return 1 + save.topSpeedLevel * 0.08; }
export function accelFactor(save) { return 1 + save.accelerationLevel * 0.1; }
export function handlingFactor(save) { return 1 + save.handlingLevel * 0.1; }
export function costFor(level) {
  return level >= MAX_UPGRADE ? -1 : COSTS[Math.min(level, COSTS.length - 1)];
}

export function tryUpgrade(save, key) {
  const level = save[key];
  const cost = costFor(level);
  if (cost < 0 || save.coins < cost) return false;
  save.coins -= cost;
  save[key] = level + 1;
  writeSave(save);
  return true;
}
