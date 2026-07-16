/**
 * Seeded procedural world generation — seemingly random, structurally fair.
 *
 * Decisions hash off segment index (mulberry32 / hash2) so biomes, intersections,
 * and gas spacing stay varied without true chaos. Turn offers are city ↔ rural;
 * highway waits on a proper on-ramp flow. Transition plans taper usable lanes.
 * Path masks evolve Temple Run–style parallel lanes that appear and end.
 */
import {
  BIOMES,
  TRANSITIONS,
  layoutFor,
  PATH_INTRO_SEGS,
  PATH_COOLDOWN_SEGS,
  PATH_CHANGE_BASE,
  PATH_STRIP_WIDTH,
  PATH_MIN_GAP,
} from "./constants.js?v=33";

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
 * Playable turns are city ↔ suburbs (rural) only.
 * Highway is deferred until a proper on-ramp / one-way flow exists.
 * @param {string} from
 * @param {number} [_distance]
 * @param {() => number} [_rng]
 */
export function pickTurnBiomes(from, _distance = 0, _rng = Math.random) {
  if (from === "city") return { left: "rural", right: "rural" };
  if (from === "rural") return { left: "city", right: "city" };
  // Escape hatch if somehow on highway
  return { left: "city", right: "city" };
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

/** Forward (+Z) lane indices for a layout. */
export function forwardLaneIndices(layout) {
  const out = [];
  for (let i = 0; i < layout.count; i++) {
    if (layout.dirs[i] === 1) out.push(i);
  }
  return out;
}

/**
 * Lanes that can become Temple Run–style swipe paths.
 * Prefer same-direction forward lanes; if only one exists (rural), both
 * lanes are candidates so a parallel path can appear beside you.
 */
export function pathCandidateLanes(layout) {
  const fwd = forwardLaneIndices(layout);
  if (fwd.length >= 2) return fwd;
  return [...Array(layout.count).keys()];
}

/** Oncoming lane indices (kept for traffic when path candidates are forward-only). */
export function oncomingLaneIndices(layout) {
  const out = [];
  for (let i = 0; i < layout.count; i++) {
    if (layout.dirs[i] === -1) out.push(i);
  }
  return out;
}

/**
 * Evolve which parallel paths stay open for the next straight segment.
 * Guarantees ≥1 open path and prefers keeping continuity with `prevOpen`.
 *
 * @param {ReturnType<typeof layoutFor>} layout
 * @param {number[]|null} prevOpen previously open path-candidate indices
 * @param {number} spawnIndex
 * @param {() => number} rng
 * @param {number} [pathCooldown=0] segments until another topology change
 * @returns {{
 *   open: number[],
 *   usableLanes: number[],
 *   closedXs: number[],
 *   pathVisual: boolean,
 *   pathCooldown: number,
 *   appeared: number[],
 *   ended: number[],
 * }}
 */
export function evolvePathMask(layout, prevOpen, spawnIndex, rng, pathCooldown = 0) {
  const candidates = pathCandidateLanes(layout);
  const oncoming = oncomingLaneIndices(layout);
  const usingOncomingAsPaths = candidates.some((i) => layout.dirs[i] === -1);

  // Intro / fallback: every candidate open, full continuous road
  if (spawnIndex < PATH_INTRO_SEGS || candidates.length < 2) {
    const open = candidates.slice();
    const usable = usingOncomingAsPaths
      ? open.slice()
      : [...new Set([...open, ...oncoming])];
    return {
      open,
      usableLanes: usable,
      closedXs: [],
      pathVisual: false,
      pathCooldown: Math.max(0, pathCooldown),
      appeared: [],
      ended: [],
      pathXs: null,
    };
  }

  // First stretch after intro: force dual parallel strips so the new mechanic reads
  const PATH_TEACH_SEGS = 6;
  if (spawnIndex < PATH_INTRO_SEGS + PATH_TEACH_SEGS) {
    const open = candidates.slice();
    const pathXs = spacedPathXs(layout, open);
    return {
      open,
      usableLanes: open.slice(),
      closedXs: [],
      pathVisual: true,
      pathCooldown: Math.max(PATH_COOLDOWN_SEGS, pathCooldown),
      appeared: spawnIndex === PATH_INTRO_SEGS ? open.slice() : [],
      ended: [],
      pathXs,
    };
  }

  let open = (prevOpen && prevOpen.length)
    ? prevOpen.filter((i) => candidates.includes(i))
    : candidates.slice();
  if (!open.length) open = [candidates.includes(layout.defaultLane) ? layout.defaultLane : candidates[0]];

  let nextCooldown = Math.max(0, pathCooldown);
  let appeared = [];
  let ended = [];

  if (nextCooldown > 0) {
    nextCooldown--;
  } else {
    // Event density ramps after intro (~0.28 → ~0.5)
    const ramp = Math.min(1, Math.max(0, (spawnIndex - PATH_INTRO_SEGS) / 50));
    const chance = PATH_CHANGE_BASE + 0.22 * ramp;
    if (rng() < chance) {
      const closed = candidates.filter((i) => !open.includes(i));
      const roll = rng();

      if (open.length >= 2 && roll < 0.38) {
        // End a side path — keep at least one (prefer keeping default / center-ish)
        const preferKeep = open.includes(layout.defaultLane)
          ? layout.defaultLane
          : open[(open.length / 2) | 0];
        const closable = open.filter((i) => i !== preferKeep);
        const victim = closable.length
          ? closable[(rng() * closable.length) | 0]
          : open[(rng() * open.length) | 0];
        open = open.filter((i) => i !== victim);
        ended = [victim];
      } else if (closed.length) {
        // Prefer opening a new parallel path (Temple Run branch) over staying single
        const scored = closed.map((i) => {
          let near = 0;
          for (const o of open) near += Math.abs(o - i) === 1 ? 2 : Math.abs(o - i) === 2 ? 1 : 0;
          return { i, near };
        });
        scored.sort((a, b) => b.near - a.near || a.i - b.i);
        const pick = scored[0].i;
        open = [...open, pick].sort((a, b) => a - b);
        appeared = [pick];
      } else if (open.length >= 2 && roll > 0.9) {
        const victim = open[(rng() * open.length) | 0];
        if (open.length > 1) {
          open = open.filter((i) => i !== victim);
          ended = [victim];
        }
      }
      nextCooldown = PATH_COOLDOWN_SEGS + ((rng() * 3) | 0);
    }
  }

  // Hard guarantee
  if (!open.length) {
    open = [candidates.includes(layout.defaultLane) ? layout.defaultLane : candidates[0]];
  }

  const closedXs = candidates
    .filter((i) => !open.includes(i))
    .map((i) => layout.xs[i]);

  // Split visual when any candidate is missing, or when open paths are non-contiguous
  let pathVisual = open.length < candidates.length;
  if (!pathVisual && open.length >= 2) {
    for (let i = 1; i < open.length; i++) {
      if (open[i] - open[i - 1] > 1) {
        pathVisual = true;
        break;
      }
    }
  }
  // Dual+ paths always read as parallel strips (Temple Run bridges)
  if (open.length >= 2) pathVisual = true;

  const usableLanes = pathVisual || usingOncomingAsPaths
    ? open.slice()
    : [...new Set([...open, ...oncoming])];

  /** Spread strip centers so parallel paths read with a clear Temple Run gap. */
  let pathXs = null;
  if (pathVisual && open.length) {
    pathXs = spacedPathXs(layout, open);
  }

  return {
    open,
    usableLanes,
    closedXs,
    pathVisual,
    pathCooldown: nextCooldown,
    appeared,
    ended,
    pathXs,
  };
}

/**
 * Remap open lane centers so strip edges keep at least PATH_MIN_GAP between them.
 * @param {{ xs:number[] }} layout
 * @param {number[]} openLanes
 * @returns {Record<number, number>}
 */
export function spacedPathXs(layout, openLanes) {
  const sorted = openLanes.slice().sort((a, b) => layout.xs[a] - layout.xs[b]);
  /** @type {Record<number, number>} */
  const out = {};
  if (!sorted.length) return out;
  if (sorted.length === 1) {
    out[sorted[0]] = layout.xs[sorted[0]];
    return out;
  }
  const minCenter = PATH_STRIP_WIDTH + PATH_MIN_GAP;
  // If native spacing already wide enough, keep layout xs
  let needSpread = false;
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(layout.xs[sorted[i]] - layout.xs[sorted[i - 1]]) < minCenter - 0.05) {
      needSpread = true;
      break;
    }
  }
  if (!needSpread) {
    for (const i of sorted) out[i] = layout.xs[i];
    return out;
  }
  const span = (sorted.length - 1) * minCenter;
  const start = -span / 2;
  sorted.forEach((li, idx) => {
    out[li] = start + idx * minCenter;
  });
  return out;
}

export { BIOMES };
