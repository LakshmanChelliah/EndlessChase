/**
 * Lowpoly car catalog — unlock costs, baseline stats, NPC spawn weights.
 * Paths resolve under CARS_ASSET (see constants.js). Police is NPC-only.
 */
import { CARS_ASSET } from "./constants.js?v=29";

export { CARS_ASSET };
export const STARTER_CAR = "mobil";

/** @typedef {{ id: string, name: string, speed: number, accel: number, handling: number, cost: number, buyable: boolean, npcWeight: number, menuDeco: boolean }} CarDef */

/** @type {CarDef[]} */
export const CARS = [
  { id: "mobil", name: "Mobil", speed: 0.95, accel: 0.9, handling: 0.95, cost: 0, buyable: true, npcWeight: 22, menuDeco: true },
  { id: "coupe", name: "Coupe", speed: 1.0, accel: 1.0, handling: 1.0, cost: 150, buyable: true, npcWeight: 20, menuDeco: true },
  { id: "van", name: "Van", speed: 0.85, accel: 0.8, handling: 0.75, cost: 200, buyable: true, npcWeight: 18, menuDeco: true },
  { id: "jeep", name: "Jeep", speed: 0.9, accel: 0.9, handling: 0.85, cost: 350, buyable: true, npcWeight: 16, menuDeco: true },
  { id: "armor", name: "Armor", speed: 0.88, accel: 0.85, handling: 0.8, cost: 450, buyable: true, npcWeight: 14, menuDeco: true },
  { id: "rally", name: "Rally", speed: 0.95, accel: 1.1, handling: 1.2, cost: 600, buyable: true, npcWeight: 6, menuDeco: true },
  { id: "kamaro", name: "Kamaro", speed: 1.1, accel: 1.15, handling: 0.9, cost: 900, buyable: true, npcWeight: 5, menuDeco: true },
  { id: "ghini", name: "Ghini", speed: 1.15, accel: 1.1, handling: 1.1, cost: 1400, buyable: true, npcWeight: 2.5, menuDeco: false },
  { id: "italia", name: "Italia", speed: 1.2, accel: 1.2, handling: 1.15, cost: 2000, buyable: true, npcWeight: 0.7, menuDeco: false },
  { id: "lamb", name: "Lamb", speed: 1.25, accel: 1.15, handling: 1.05, cost: 2800, buyable: true, npcWeight: 0.5, menuDeco: false },
  { id: "fenyr", name: "Fenyr", speed: 1.3, accel: 1.25, handling: 1.2, cost: 4000, buyable: true, npcWeight: 0.3, menuDeco: false },
  { id: "police", name: "Police", speed: 1.0, accel: 1.0, handling: 1.0, cost: -1, buyable: false, npcWeight: 0, menuDeco: false },
];

/** @type {Record<string, CarDef>} */
export const CAR_BY_ID = Object.fromEntries(CARS.map((c) => [c.id, c]));

export const BUYABLE_CARS = CARS.filter((c) => c.buyable);

/** NPC body tint palette (hex). */
export const NPC_TINTS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6,
  0xe67e22, 0x1abc9c, 0xecf0f1, 0x34495e, 0xd35400,
  0x27ae60, 0x2980b9, 0xc0392b, 0x8e44ad, 0x16a085,
];

export function previewUrl(id) {
  return `${CARS_ASSET}/previews/${id}.png`;
}

export function glbUrl(id) {
  return `${CARS_ASSET}/${id}.glb`;
}

export function getCar(id) {
  return CAR_BY_ID[id] || CAR_BY_ID[STARTER_CAR];
}

/** Weighted civilian pick (includes very rare exotics). */
export function pickCivilianCarId(rand = Math.random) {
  let total = 0;
  for (const c of CARS) {
    if (c.npcWeight > 0) total += c.npcWeight;
  }
  let r = rand() * total;
  for (const c of CARS) {
    if (c.npcWeight <= 0) continue;
    r -= c.npcWeight;
    if (r <= 0) return c.id;
  }
  return "coupe";
}

/** Menu curb deco — common/uncommon only. */
export function pickMenuDecoCarId(rand = Math.random) {
  const pool = CARS.filter((c) => c.menuDeco);
  let total = 0;
  for (const c of pool) total += c.npcWeight;
  let r = rand() * total;
  for (const c of pool) {
    r -= c.npcWeight;
    if (r <= 0) return c.id;
  }
  return "mobil";
}

/**
 * Distinct menu deco car ids (no duplicates), optionally excluding the player's car.
 * @param {number} count
 * @param {string[]} [excludeIds]
 * @param {() => number} [rand]
 */
export function pickDistinctMenuDecoIds(count, excludeIds = [], rand = Math.random) {
  const exclude = new Set(excludeIds);
  const pool = CARS.filter((c) => c.menuDeco && !exclude.has(c.id)).map((c) => c.id);
  // Fisher–Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  const out = pool.slice(0, Math.min(count, pool.length));
  // If we need more than unique pool allows, fill without matching neighbors
  while (out.length < count && pool.length) {
    out.push(pool[out.length % pool.length]);
  }
  return out;
}
