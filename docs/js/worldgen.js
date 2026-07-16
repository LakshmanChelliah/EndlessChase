/**
 * Seeded procedural world generation — seemingly random, structurally fair.
 *
 * Decisions hash off segment index (mulberry32 / hash2) so biomes, intersections,
 * and gas spacing stay varied without true chaos. Transition plans taper usable
 * lanes for optional biome corridors (highway on-ramp flow deferred).
 */
import { BIOMES, TRANSITIONS, layoutFor } from "./constants.js?v=35";

/** Mulberry32 — tiny deterministic PRNG */
export function mulberry32(seed) {
  let t = seed >>> 0;
  return function next() {
    t |= 0;
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Decide what kind of segment to spawn for a given index.
 * Returns { kind: ""|"I"|"R"|"G", reason }
 * @param {number} [intersectionCooldown=0] remaining segments before another light may spawn
 * @param {number} [gasCooldown=0] remaining segments before another gas station may spawn
 */
export function decideSegment(
  biome,
  spawnIndex,
  _turnCooldown,
  rng,
  intersectionCooldown = 0,
  gasCooldown = 0
) {
  // Quiet opening stretch (~160 m) so new runs teach steering before events
  if (spawnIndex < 8) return { kind: "", reason: "intro" };

  // Event density ramps with segment index (~0 → 1 over ~1400 m past intro)
  const eventRamp = Math.min(1, Math.max(0, (spawnIndex - 8) / 70));
  const eventMul = 0.45 + 0.55 * eventRamp;

  // Gas stations — roll before lights so they are not starved
  if (gasCooldown <= 0 && spawnIndex > 14) {
    const gChance = biome === "city" ? 0.14 : biome === "rural" ? 0.11 : 0.08;
    if (rng() < gChance * eventMul) return { kind: "G", reason: "gas" };
  }

  // Intersections — denser in city, rare on highway; never back-to-back
  if (intersectionCooldown > 0) return { kind: "", reason: "light-gap" };
  const iChance = biome === "city" ? 0.14 : biome === "rural" ? 0.1 : 0.05;
  if (spawnIndex > 8 && rng() < iChance * eventMul) return { kind: "I", reason: "light" };

  return { kind: "", reason: "straight" };
}

/** @param {string} from @param {string} to */
export function transitionKey(from, to) {
  return `${String(from).toUpperCase()}_TO_${String(to).toUpperCase()}`;
}

/** @param {string} from @param {string} to */
export function getTransitionDef(from, to) {
  const key = transitionKey(from, to);
  return (
    TRANSITIONS[key] || {
      from,
      to,
      taperSteps: from === "city" || to === "city" ? 4 : 3,
      closeLaneIndices: layoutFor(from).count > layoutFor(to).count
        ? [...Array(layoutFor(from).count).keys()].filter((i) => {
            const fx = layoutFor(from).xs[i];
            return !layoutFor(to).xs.some((tx) => Math.abs(tx - fx) < 0.5);
          })
        : [],
    }
  );
}

/**
 * Progressive usable-lane sets for narrowing: close one outer lane at a time.
 * @param {number[]} allIndices
 * @param {number[]} closeOrder
 * @param {number} taperSteps
 * @param {number} stepIndex 0-based within taper
 */
function usableLanesAtTaperStep(allIndices, closeOrder, taperSteps, stepIndex) {
  const closedCount = Math.min(
    closeOrder.length,
    Math.ceil(((stepIndex + 1) / taperSteps) * closeOrder.length)
  );
  const closed = new Set(closeOrder.slice(0, closedCount));
  return allIndices.filter((i) => !closed.has(i));
}

/**
 * Lanes newly closed on this taper step (for obstacle placement).
 */
function newlyClosedAtStep(closeOrder, taperSteps, stepIndex) {
  const prevCount =
    stepIndex <= 0
      ? 0
      : Math.min(
          closeOrder.length,
          Math.ceil((stepIndex / taperSteps) * closeOrder.length)
        );
  const closedCount = Math.min(
    closeOrder.length,
    Math.ceil(((stepIndex + 1) / taperSteps) * closeOrder.length)
  );
  return closeOrder.slice(prevCount, closedCount);
}

/**
 * Build a seamless transition corridor from → to.
 * Emits exit → taper×N → enter → settle×2 with per-step lane/width metadata.
 * Biome adoption is flagged on enter/settle for the *player*, not spawn-time.
 */
export function buildTransitionPlan(fromBiome, toBiome) {
  const def = getTransitionDef(fromBiome, toBiome);
  const fromLayout = layoutFor(fromBiome);
  const toLayout = layoutFor(toBiome);
  const taperSteps = Math.max(3, Math.min(5, def.taperSteps | 0 || 4));
  const closeOrder = def.closeLaneIndices || [];
  const allFrom = [...Array(fromLayout.count).keys()];
  const allTo = [...Array(toLayout.count).keys()];
  const narrowing = fromLayout.width > toLayout.width;
  const plan = [];

  // Exit ramp — still fully in from-biome
  plan.push({
    biome: fromBiome,
    kind: "R",
    phase: "exit",
    adopt: false,
    usableLanes: allFrom.slice(),
    widthStart: fromLayout.width,
    widthEnd: fromLayout.width,
    closedLaneXs: [],
    fromBiome,
    toBiome,
    mixBiome: null,
    layoutBiome: fromBiome,
  });

  for (let i = 0; i < taperSteps; i++) {
    const t0 = i / taperSteps;
    const t1 = (i + 1) / taperSteps;
    const widthStart = blendWidth(fromLayout, toLayout, t0);
    const widthEnd = blendWidth(fromLayout, toLayout, t1);
    let usableLanes;
    let closedLaneXs = [];
    let layoutBiome = fromBiome;

    if (narrowing && closeOrder.length) {
      usableLanes = usableLanesAtTaperStep(allFrom, closeOrder, taperSteps, i);
      const newly = newlyClosedAtStep(closeOrder, taperSteps, i);
      // Keep obstacles on all already-closed lanes for the rest of the taper
      const closedSoFar = closeOrder.slice(
        0,
        Math.min(
          closeOrder.length,
          Math.ceil(((i + 1) / taperSteps) * closeOrder.length)
        )
      );
      closedLaneXs = closedSoFar.map((li) => fromLayout.xs[li]);
      // Prefer placing denser cones on newly closed lanes (caller can use both)
      void newly;
    } else {
      // Widening: road expands; all to-lanes become usable near the end
      const openCount = Math.min(
        toLayout.count,
        Math.max(
          fromLayout.count,
          Math.ceil(((i + 1) / taperSteps) * toLayout.count)
        )
      );
      usableLanes = allTo.slice(0, openCount);
      if (usableLanes.length < fromLayout.count) {
        usableLanes = allFrom.slice();
      }
      // During widen taper still drive with from-lane indices until enter
      if (fromLayout.count <= toLayout.count) {
        usableLanes = allFrom.slice();
        layoutBiome = fromBiome;
      }
    }

    plan.push({
      biome: fromBiome,
      kind: "",
      phase: "taper",
      adopt: false,
      usableLanes,
      widthStart,
      widthEnd,
      closedLaneXs,
      fromBiome,
      toBiome,
      mixBiome: i >= taperSteps - 2 ? toBiome : null,
      layoutBiome,
      markT: t1,
    });
  }

  // Enter ramp — new biome visuals; player adopts when crossing this tile
  plan.push({
    biome: toBiome,
    kind: "R",
    phase: "enter",
    adopt: true,
    usableLanes: allTo.slice(),
    widthStart: toLayout.width,
    widthEnd: toLayout.width,
    closedLaneXs: [],
    fromBiome,
    toBiome,
    mixBiome: fromBiome,
    layoutBiome: toBiome,
  });

  for (let s = 0; s < 2; s++) {
    plan.push({
      biome: toBiome,
      kind: "",
      phase: "settle",
      adopt: true,
      usableLanes: allTo.slice(),
      widthStart: toLayout.width,
      widthEnd: toLayout.width,
      closedLaneXs: [],
      fromBiome,
      toBiome,
      mixBiome: null,
      layoutBiome: toBiome,
    });
  }

  return plan;
}

/** Soft lane remap: map old lane index/X into new layout nearest forward lane preferred. */
export function nearestLane(layout, x, preferForward = true) {
  let best = layout.defaultLane;
  let bestScore = Infinity;
  for (let i = 0; i < layout.count; i++) {
    const dist = Math.abs(layout.xs[i] - x);
    const forwardBonus = preferForward && layout.dirs[i] === 1 ? -0.35 : 0;
    const score = dist + forwardBonus;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Nearest usable lane index given an allowed index set. */
export function nearestUsableLane(layout, x, usableLanes, preferForward = true) {
  const allowed =
    usableLanes && usableLanes.length
      ? usableLanes
      : [...Array(layout.count).keys()];
  let best = allowed.includes(layout.defaultLane) ? layout.defaultLane : allowed[0];
  let bestScore = Infinity;
  for (const i of allowed) {
    if (i < 0 || i >= layout.count) continue;
    const dist = Math.abs(layout.xs[i] - x);
    const forwardBonus = preferForward && layout.dirs[i] === 1 ? -0.35 : 0;
    const score = dist + forwardBonus;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Lerp road width between layouts for transition visuals. */
export function blendWidth(fromLayout, toLayout, t) {
  return fromLayout.width + (toLayout.width - fromLayout.width) * t;
}

/**
 * Outermost forward lane on a side for intersection turns.
 * side −1 = left (−X / lower screen), +1 = right (+X).
 * @param {{ count: number, xs: number[], dirs: number[] }} layout
 * @param {-1|1} side
 * @param {number[]} [usable]
 * @returns {number} lane index or -1
 */
export function turnLaneForSide(layout, side, usable = null) {
  const allowed =
    usable && usable.length ? usable : [...Array(layout.count).keys()];
  let best = -1;
  let bestX = side < 0 ? Infinity : -Infinity;
  for (const i of allowed) {
    if (i < 0 || i >= layout.count) continue;
    if (layout.dirs[i] !== 1) continue;
    const x = layout.xs[i];
    if (side < 0 ? x < bestX : x > bestX) {
      bestX = x;
      best = i;
    }
  }
  return best;
}

export { BIOMES };
