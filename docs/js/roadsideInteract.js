/**
 * Optional roadside mini-game zones (ATM / convenience store).
 *
 * Pure helpers — no DOM, no Three.js. Game glue owns segment meshes, HUD, and
 * pausing movement. Entering a zone never auto-starts; the player must opt in
 * with the interact key (or a curb swipe toward the site).
 *
 * Glow: visuals live in nes.js (`interactGlow` meshes). Pulse them each frame
 * with pulseInteractGlow() — emission-style opacity flicker, same idea as GAS.
 */
import {
  ROADSIDE_HUD_AHEAD,
  ROADSIDE_INTERACT_RANGE,
  ROADSIDE_INTERACT_KEY,
  ROADSIDE_ATM_BONUS,
  ROADSIDE_STORE_BONUS,
  ROADSIDE_PUZZLE_STEPS,
} from "./constants.js?v=38";

/** @typedef {"atm"|"store"} RoadsideKind */

export const ROADSIDE_KINDS = Object.freeze(["atm", "store"]);

/**
 * @param {() => number} [rng]
 * @returns {RoadsideKind}
 */
export function rollRoadsideKind(rng = Math.random) {
  return rng() < 0.55 ? "atm" : "store";
}

/**
 * Build a random PIN / grab sequence for the optional mini-game.
 * @param {number} [steps]
 * @returns {Array<"L"|"C"|"R">}
 */
export function rollAtmPinSequence(steps = ROADSIDE_PUZZLE_STEPS) {
  const pads = ["L", "C", "R"];
  const out = [];
  const n = Math.max(1, steps | 0);
  for (let i = 0; i < n; i++) {
    out.push(pads[(Math.random() * pads.length) | 0]);
  }
  return out;
}

/**
 * @param {RoadsideKind} kind
 * @param {1|-1} side lot side (+1 right of road)
 * @param {{ keyLabel?: string, mobile?: boolean }} [opts]
 */
export function roadsidePromptText(kind, side, opts = {}) {
  const key = (opts.keyLabel || ROADSIDE_INTERACT_KEY).toUpperCase();
  const label = kind === "store" ? "ENTER STORE" : "USE ATM";
  if (opts.mobile) {
    // Inverted steering: swipe left into a right-side lot
    const arrow = side > 0 ? "←" : "→";
    return `SWIPE ${arrow} · ${label}`;
  }
  return `PRESS ${key} · ${label}`;
}

/** @param {RoadsideKind} kind */
export function roadsideBonusCoins(kind) {
  return kind === "store" ? ROADSIDE_STORE_BONUS : ROADSIDE_ATM_BONUS;
}

/** @param {RoadsideKind} kind */
export function roadsidePuzzleTitle(kind) {
  return kind === "store" ? "QUICK GRAB" : "CRACK PIN";
}

/**
 * Pick the nearest unresolved interact segment within HUD ahead range.
 * @param {Array<{ position: { z: number }, userData: object }>} segments
 * @param {number} playerZ
 * @param {number} [hudAhead]
 */
export function findNearbyRoadside(segments, playerZ, hudAhead = ROADSIDE_HUD_AHEAD) {
  let best = null;
  let bestAbs = Infinity;
  for (const seg of segments) {
    if (!seg?.userData?.interactSite || seg.userData.interactResolved) continue;
    const dz = seg.position.z - playerZ;
    if (dz < -6 || dz > hudAhead) continue;
    const a = Math.abs(dz);
    if (a < bestAbs) {
      bestAbs = a;
      best = seg;
    }
  }
  return best;
}

/**
 * True when the player is close enough to opt in (still does not auto-start).
 * @param {{ position: { z: number }, userData: object }} seg
 * @param {number} playerZ
 * @param {number} playerLane
 * @param {number} laneCount
 * @param {number} [range]
 */
export function isInsideRoadsideZone(seg, playerZ, playerLane, laneCount, range = ROADSIDE_INTERACT_RANGE) {
  if (!seg?.userData?.interactSite || seg.userData.interactResolved) return false;
  const dz = seg.position.z - playerZ;
  if (dz < -2 || Math.abs(dz) > range) return false;
  return playerLane === requiredLaneForRoadside(seg, laneCount);
}

/**
 * Literal outermost curb lane for the site side.
 * @param {{ userData: { interactSide?: number } }} seg
 * @param {number} laneCount
 */
export function requiredLaneForRoadside(seg, laneCount) {
  const side = seg.userData.interactSide < 0 ? -1 : 1;
  const count = Math.max(1, laneCount | 0);
  return side < 0 ? 0 : count - 1;
}

/**
 * Whether a lateral swipe aims at the lot (optional mobile enter).
 * @param {"left"|"right"|"up"|"down"} dir
 * @param {1|-1} side
 */
export function swipeTowardRoadside(dir, side) {
  // Inverted: swipe left → move right into a right-side lot
  if (side > 0) return dir === "left";
  return dir === "right";
}

/**
 * @param {string} key normalized lowercase / special
 * @param {string} [interactKey]
 */
export function isRoadsideInteractKey(key, interactKey = ROADSIDE_INTERACT_KEY) {
  if (!key) return false;
  const k = key.length === 1 ? key.toLowerCase() : key;
  return k === interactKey || k === "Enter" || k === " ";
}
