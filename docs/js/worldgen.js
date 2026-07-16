/**
 * Seeded procedural world generation — seemingly random, structurally fair.
 *
 * Decisions hash off segment index (mulberry32 / hash2) so biomes, intersections,
 * and gas spacing stay varied without true chaos. Turn offers reach all biomes.
 * Transition plans emit MUTCD-inspired taper recipes (lanes, paint, scenery blend).
 */
import { BIOMES, TRANSITIONS, MARK_STYLES, layoutFor } from "./constants.js?v=33";

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
 * Playable turns offer distinct destinations so all biome pairs are reachable.
 * @param {string} from
 * @param {number} [_distance]
 * @param {() => number} [_rng]
 */
export function pickTurnBiomes(from, _distance = 0, _rng = Math.random) {
  if (from === "city") return { left: "rural", right: "highway" };
  if (from === "rural") return { left: "city", right: "highway" };
  if (from === "highway") return { left: "city", right: "rural" };
  return { left: "city", right: "rural" };
}

/**
 * Decide what kind of segment to spawn for a given index.
 * Returns { kind: ""|"I"|"T"|"R"|"G", reason }
 * @param {number} [intersectionCooldown=0] remaining segments before another light may spawn
 * @param {number} [gasCooldown=0] remaining segments before another gas station may spawn
 */
export function decideSegment(
  biome,
  spawnIndex,
  turnCooldown,
  rng,
  intersectionCooldown = 0,
  gasCooldown = 0
) {
  // Quiet opening stretch (~160 m) so new runs teach steering before events
  if (spawnIndex < 8) return { kind: "", reason: "intro" };

  // Event density ramps with segment index (~0 → 1 over ~1400 m past intro)
  const eventRamp = Math.min(1, Math.max(0, (spawnIndex - 8) / 70));
  const eventMul = 0.45 + 0.55 * eventRamp;

  // Gas stations — roll before turns/lights so they are not starved
  if (gasCooldown <= 0 && spawnIndex > 14) {
    const gChance = biome === "city" ? 0.14 : biome === "rural" ? 0.11 : 0.08;
    if (rng() < gChance * eventMul) return { kind: "G", reason: "gas" };
  }

  // Turn offers — rhythmic, not every tile
  if (turnCooldown <= 0 && spawnIndex > 12) {
    const base = biome === "highway" ? 0.18 : 0.24;
    // Wave the chance so clusters of straight road feel intentional
    const wave = 0.08 * Math.sin(spawnIndex * 0.37);
    if (rng() < (base + wave) * eventMul) return { kind: "T", reason: "turn" };
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
      taperSteps: from === "city" || to === "city" ? 5 : 3,
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

/** Smooth 0→1 corridor progress including exit/enter/settle. */
function corridorProgress(stepIndex, totalSteps) {
  if (totalSteps <= 1) return 1;
  return Math.min(1, Math.max(0, stepIndex / (totalSteps - 1)));
}

/** Pick center-line mark style for a corridor step. */
export function markStyleFor(fromBiome, toBiome, t) {
  const samePaintFamily =
    (fromBiome === "city" && toBiome === "rural") ||
    (fromBiome === "rural" && toBiome === "city");
  if (fromBiome === toBiome) {
    if (fromBiome === "highway") return MARK_STYLES.HIGHWAY_ONE_WAY;
    if (fromBiome === "rural") return MARK_STYLES.RURAL_TWO_WAY;
    return MARK_STYLES.CITY_DIVIDED;
  }
  if (
    (fromBiome === "rural" && toBiome === "highway") ||
    (fromBiome === "highway" && toBiome === "rural")
  ) {
    if (t < 0.35) {
      return fromBiome === "highway"
        ? MARK_STYLES.HIGHWAY_ONE_WAY
        : MARK_STYLES.RURAL_TWO_WAY;
    }
    if (t > 0.7) {
      return toBiome === "highway"
        ? MARK_STYLES.HIGHWAY_ONE_WAY
        : MARK_STYLES.RURAL_TWO_WAY;
    }
    return MARK_STYLES.BLEND_RURAL_HIGHWAY;
  }
  if (
    (fromBiome === "city" && toBiome === "highway") ||
    (fromBiome === "highway" && toBiome === "city")
  ) {
    if (t < 0.3) {
      return fromBiome === "city"
        ? MARK_STYLES.CITY_DIVIDED
        : MARK_STYLES.HIGHWAY_ONE_WAY;
    }
    if (t > 0.75) {
      return toBiome === "city"
        ? MARK_STYLES.CITY_DIVIDED
        : MARK_STYLES.HIGHWAY_ONE_WAY;
    }
    return MARK_STYLES.BLEND_CITY_HIGHWAY;
  }
  // city ↔ rural (both two-way yellow)
  if (samePaintFamily) {
    if (t < 0.25) {
      return fromBiome === "city"
        ? MARK_STYLES.CITY_DIVIDED
        : MARK_STYLES.RURAL_TWO_WAY;
    }
    if (t > 0.8) {
      return toBiome === "city"
        ? MARK_STYLES.CITY_DIVIDED
        : MARK_STYLES.RURAL_TWO_WAY;
    }
    return MARK_STYLES.BLEND_CITY_RURAL;
  }
  return MARK_STYLES.CITY_DIVIDED;
}

function easeInOut(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * Build a seamless transition corridor from → to.
 * Emits exit → taper×N → enter → settle×2 with MUTCD-inspired recipe fields.
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
  const widening = fromLayout.width < toLayout.width;
  const plan = [];

  // exit + tapers + enter + settle×2
  const totalSteps = 1 + taperSteps + 1 + 2;
  let stepIndex = 0;

  function pushStep(partial) {
    const atmosT = easeInOut(corridorProgress(stepIndex, totalSteps));
    // Scenery crossfade starts early and reaches ~1 by enter
    const sceneryBlend = easeInOut(
      Math.min(1, Math.max(0, (stepIndex - 0.2) / Math.max(1, taperSteps + 0.6)))
    );
    const markStyle = markStyleFor(fromBiome, toBiome, atmosT);
    plan.push({
      mixBiome: sceneryBlend > 0.15 && sceneryBlend < 0.92 ? toBiome : null,
      sceneryFrom: fromBiome,
      sceneryTo: toBiome,
      sceneryBlend,
      atmosT,
      markStyle,
      edgeMode: "solid_follow_taper",
      goreXs: [],
      newlyClosedXs: [],
      arrowMode: null,
      markT: atmosT,
      fromBiome,
      toBiome,
      ...partial,
    });
    stepIndex++;
  }

  // Exit — warning foreshadow, full from-width, lane-end arrows if narrowing
  const exitGoreXs =
    narrowing && closeOrder.length
      ? closeOrder.map((li) => fromLayout.xs[li])
      : [];
  pushStep({
    biome: fromBiome,
    kind: "",
    phase: "exit",
    adopt: false,
    usableLanes: allFrom.slice(),
    widthStart: fromLayout.width,
    widthEnd: fromLayout.width,
    closedLaneXs: [],
    newlyClosedXs: [],
    goreXs: exitGoreXs,
    arrowMode: narrowing ? "lane_ends" : widening ? "lane_opens" : null,
    layoutBiome: fromBiome,
    edgeMode: narrowing || widening ? "solid_follow_taper" : "none",
  });

  for (let i = 0; i < taperSteps; i++) {
    const t0 = i / taperSteps;
    const t1 = (i + 1) / taperSteps;
    const widthStart = blendWidth(fromLayout, toLayout, t0);
    const widthEnd = blendWidth(fromLayout, toLayout, t1);
    let usableLanes;
    let closedLaneXs = [];
    let newlyClosedXs = [];
    let goreXs = [];
    let layoutBiome = fromBiome;
    let arrowMode = null;

    if (narrowing && closeOrder.length) {
      usableLanes = usableLanesAtTaperStep(allFrom, closeOrder, taperSteps, i);
      const newly = newlyClosedAtStep(closeOrder, taperSteps, i);
      newlyClosedXs = newly.map((li) => fromLayout.xs[li]);
      const closedSoFar = closeOrder.slice(
        0,
        Math.min(
          closeOrder.length,
          Math.ceil(((i + 1) / taperSteps) * closeOrder.length)
        )
      );
      closedLaneXs = closedSoFar.map((li) => fromLayout.xs[li]);
      goreXs = closedLaneXs.slice();
      arrowMode = newlyClosedXs.length ? "lane_ends" : null;
    } else if (widening && toLayout.count > fromLayout.count) {
      // Progressive open: keep from lanes early; add city outers on later steps
      layoutBiome = toBiome;
      const openFrac = (i + 1) / taperSteps;
      if (openFrac < 0.55) {
        usableLanes = allFrom.slice();
        layoutBiome = fromBiome;
        arrowMode = "lane_opens";
        goreXs = allTo
          .filter((li) => !allFrom.some((fi) => Math.abs(fromLayout.xs[fi] - toLayout.xs[li]) < 0.5))
          .map((li) => toLayout.xs[li]);
      } else {
        usableLanes = allTo.slice();
        arrowMode = i === taperSteps - 1 ? null : "lane_opens";
        goreXs = allTo
          .filter((li) => !allFrom.some((fi) => Math.abs(fromLayout.xs[fi] - toLayout.xs[li]) < 0.5))
          .map((li) => toLayout.xs[li]);
      }
    } else {
      // Flat width (rural ↔ highway): paint/scenery only
      usableLanes = allFrom.slice();
      layoutBiome = fromBiome;
      arrowMode = null;
    }

    pushStep({
      biome: fromBiome,
      kind: "",
      phase: "taper",
      adopt: false,
      usableLanes,
      widthStart,
      widthEnd,
      closedLaneXs,
      newlyClosedXs,
      goreXs,
      arrowMode,
      layoutBiome,
      markT: t1,
    });
  }

  // Enter — full to layout; player adopts here
  pushStep({
    biome: toBiome,
    kind: "",
    phase: "enter",
    adopt: true,
    usableLanes: allTo.slice(),
    widthStart: toLayout.width,
    widthEnd: toLayout.width,
    closedLaneXs: [],
    newlyClosedXs: [],
    goreXs: [],
    arrowMode: null,
    layoutBiome: toBiome,
    edgeMode: "none",
  });

  for (let s = 0; s < 2; s++) {
    pushStep({
      biome: toBiome,
      kind: "",
      phase: "settle",
      adopt: true,
      usableLanes: allTo.slice(),
      widthStart: toLayout.width,
      widthEnd: toLayout.width,
      closedLaneXs: [],
      newlyClosedXs: [],
      goreXs: [],
      arrowMode: null,
      layoutBiome: toBiome,
      edgeMode: "none",
      sceneryBlend: 1,
      atmosT: 1,
      markStyle: markStyleFor(toBiome, toBiome, 1),
    });
  }

  // Ensure settle steps have full destination scenery (override pushStep blend)
  for (const step of plan) {
    if (step.phase === "settle") {
      step.sceneryBlend = 1;
      step.atmosT = 1;
      step.mixBiome = null;
      step.sceneryFrom = toBiome;
      step.sceneryTo = toBiome;
    }
    if (step.phase === "enter") {
      step.sceneryBlend = Math.max(step.sceneryBlend, 0.95);
      step.atmosT = Math.max(step.atmosT, 0.95);
    }
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

export { BIOMES };
