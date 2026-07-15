/**
 * localStorage persistence for coins, unlocked cars, and per-car upgrades.
 *
 * Flow: loadSave() → migrate/normalize → gameplay mutates → writeSave().
 * Invariants: version ≥ 2 shape; starter car always unlocked; levels clamped
 * to MAX_UPGRADE. v1 flat upgrades migrate into per-car maps.
 */
import { SAVE_KEY, MAX_UPGRADE, COSTS } from "./constants.js?v=30";
import { STARTER_CAR, getCar, BUYABLE_CARS } from "./cars.js?v=25";

function emptyCarLevels() {
  return { topSpeedLevel: 0, accelerationLevel: 0, handlingLevel: 0, brakesLevel: 0 };
}

export function defaultSave() {
  return {
    version: 2,
    coins: 0,
    selectedCar: STARTER_CAR,
    unlocked: [STARTER_CAR],
    cars: { [STARTER_CAR]: emptyCarLevels() },
  };
}

function migrateV1(d) {
  const save = defaultSave();
  save.coins = d.coins | 0;
  save.cars[STARTER_CAR] = {
    topSpeedLevel: d.topSpeedLevel | 0,
    accelerationLevel: d.accelerationLevel | 0,
    handlingLevel: d.handlingLevel | 0,
    brakesLevel: d.brakesLevel | 0,
  };
  return save;
}

function normalizeSave(d) {
  if (!d || typeof d !== "object") return defaultSave();
  if (!d.version || d.version < 2) {
    // Legacy flat upgrades
    if ("topSpeedLevel" in d && !d.cars) return migrateV1(d);
  }
  const unlocked = Array.isArray(d.unlocked) && d.unlocked.length
    ? d.unlocked.filter((id) => getCar(id).buyable)
    : [STARTER_CAR];
  if (!unlocked.includes(STARTER_CAR)) unlocked.unshift(STARTER_CAR);

  const cars = {};
  for (const id of unlocked) {
    const src = (d.cars && d.cars[id]) || {};
    cars[id] = {
      topSpeedLevel: src.topSpeedLevel | 0,
      accelerationLevel: src.accelerationLevel | 0,
      handlingLevel: src.handlingLevel | 0,
      brakesLevel: src.brakesLevel | 0,
    };
  }

  let selected = d.selectedCar || STARTER_CAR;
  if (!unlocked.includes(selected)) selected = STARTER_CAR;

  return {
    version: 2,
    coins: d.coins | 0,
    selectedCar: selected,
    unlocked,
    cars,
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return normalizeSave(JSON.parse(raw));
  } catch {
    return defaultSave();
  }
}

export function writeSave(data) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

function selectedLevels(save) {
  const id = save.selectedCar || STARTER_CAR;
  return save.cars[id] || emptyCarLevels();
}

export function topSpeedFactor(save) {
  const car = getCar(save.selectedCar);
  const lvl = selectedLevels(save).topSpeedLevel | 0;
  return car.speed * (1 + lvl * 0.08);
}

export function accelFactor(save) {
  const car = getCar(save.selectedCar);
  const lvl = selectedLevels(save).accelerationLevel | 0;
  return car.accel * (1 + lvl * 0.1);
}

export function handlingFactor(save) {
  const car = getCar(save.selectedCar);
  const lvl = selectedLevels(save).handlingLevel | 0;
  return car.handling * (1 + lvl * 0.1);
}

export function brakesFactor(save) {
  const car = getCar(save.selectedCar);
  const lvl = selectedLevels(save).brakesLevel | 0;
  return car.brakes * (1 + lvl * 0.1);
}

export function costFor(level) {
  return level >= MAX_UPGRADE ? -1 : COSTS[Math.min(level, COSTS.length - 1)];
}

export function isUnlocked(save, carId) {
  return save.unlocked.includes(carId);
}

export function ensureCarEntry(save, carId) {
  if (!save.cars[carId]) save.cars[carId] = emptyCarLevels();
}

export function tryBuyCar(save, carId) {
  const def = getCar(carId);
  if (!def.buyable || def.cost < 0) return false;
  if (isUnlocked(save, carId)) return false;
  if (save.coins < def.cost) return false;
  save.coins -= def.cost;
  save.unlocked.push(carId);
  ensureCarEntry(save, carId);
  save.selectedCar = carId;
  writeSave(save);
  return true;
}

export function selectCar(save, carId) {
  if (!isUnlocked(save, carId)) return false;
  save.selectedCar = carId;
  ensureCarEntry(save, carId);
  writeSave(save);
  return true;
}

/** Upgrade the currently selected car (or explicit carId). */
export function tryUpgrade(save, key, carId = save.selectedCar) {
  if (!isUnlocked(save, carId)) return false;
  ensureCarEntry(save, carId);
  const levels = save.cars[carId];
  const level = levels[key] | 0;
  const cost = costFor(level);
  if (cost < 0 || save.coins < cost) return false;
  save.coins -= cost;
  levels[key] = level + 1;
  writeSave(save);
  return true;
}

export { BUYABLE_CARS, STARTER_CAR };
