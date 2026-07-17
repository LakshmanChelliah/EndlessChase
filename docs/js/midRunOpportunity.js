/**
 * Mid-run ATM opportunity tracker.
 *
 * Watches distance traveled; when it passes a random threshold ≥ MID_RUN_MIN_DISTANCE,
 * fires window CustomEvent `OnMidRunOpportunity`. A cooldown of MID_RUN_COOLDOWN_METERS
 * prevents overlapping opportunities.
 *
 * Game glue (lane lock, UI, puzzle resolve) lives in game.js — this module only
 * schedules and announces the event.
 */
import {
  MID_RUN_MIN_DISTANCE,
  MID_RUN_THRESHOLD_SPREAD,
  MID_RUN_COOLDOWN_METERS,
  MID_RUN_EVENT,
  MID_RUN_POLICE_DISTANCE_START,
} from "./constants.js?v=37";

/** @param {number} minFloor */
function rollThreshold(minFloor) {
  const floor = Math.max(MID_RUN_MIN_DISTANCE, minFloor);
  return floor + Math.random() * MID_RUN_THRESHOLD_SPREAD;
}

/**
 * @param {{ onOpportunity?: (detail: { distance: number, nextThreshold: number }) => void }} [hooks]
 */
export function createMidRunTracker(hooks = {}) {
  let nextThreshold = rollThreshold(MID_RUN_MIN_DISTANCE);
  let lastTriggerDistance = Number.NEGATIVE_INFINITY;
  /** When false, distance ticks are ignored (choice/puzzle already open). */
  let listening = true;

  function reset() {
    nextThreshold = rollThreshold(MID_RUN_MIN_DISTANCE);
    lastTriggerDistance = Number.NEGATIVE_INFINITY;
    listening = true;
  }

  function setListening(on) {
    listening = !!on;
  }

  /**
   * @param {number} distance meters traveled this run
   * @returns {boolean} true if OnMidRunOpportunity fired this tick
   */
  function update(distance) {
    if (!listening) return false;
    const d = Number(distance) || 0;
    if (d < nextThreshold) return false;
    // Hard cooldown: never fire again until X meters past the last trigger
    if (
      Number.isFinite(lastTriggerDistance) &&
      d - lastTriggerDistance < MID_RUN_COOLDOWN_METERS
    ) {
      nextThreshold = lastTriggerDistance + MID_RUN_COOLDOWN_METERS;
      return false;
    }

    lastTriggerDistance = d;
    nextThreshold = rollThreshold(d + MID_RUN_COOLDOWN_METERS);
    listening = false;

    const detail = {
      distance: d,
      nextThreshold,
      event: MID_RUN_EVENT,
    };
    try {
      window.dispatchEvent(new CustomEvent(MID_RUN_EVENT, { detail }));
    } catch {
      /* non-browser / headless */
    }
    if (typeof hooks.onOpportunity === "function") hooks.onOpportunity(detail);
    return true;
  }

  return {
    reset,
    update,
    setListening,
    isListening: () => listening,
    getNextThreshold: () => nextThreshold,
    getLastTriggerDistance: () => lastTriggerDistance,
    eventName: MID_RUN_EVENT,
  };
}

/**
 * Halve policeDistance and return the new gap (clamped).
 * @param {number} policeDistance
 */
export function applyCrimeFailPoliceClose(policeDistance) {
  const cur = Math.max(0, Number(policeDistance) || 0);
  return Math.max(1, cur * 0.5);
}

/** Map police gap (100 far → 0 on top) into heat floor so the COPS bar jumps. */
export function heatFloorFromPoliceDistance(policeDistance) {
  const gap = Math.max(0, Math.min(MID_RUN_POLICE_DISTANCE_START, Number(policeDistance) || 0));
  return Math.min(100, Math.max(0, MID_RUN_POLICE_DISTANCE_START - gap));
}

/**
 * Build a random PIN sequence for the quick ATM puzzle.
 * @param {number} steps
 * @returns {Array<"L"|"C"|"R">}
 */
export function rollAtmPinSequence(steps = 3) {
  const pads = ["L", "C", "R"];
  const out = [];
  for (let i = 0; i < steps; i++) {
    out.push(pads[(Math.random() * pads.length) | 0]);
  }
  return out;
}
