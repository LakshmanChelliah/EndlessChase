/**
 * Seeded procedural world generation — "seemingly random" but structured.
 * Decisions hash off segment index so the road feels varied without true chaos.
 */

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

const BIOMES = ["city", "rural", "highway"];

/** Weighted pick of next biome — distance biases highway later. */
export function pickTurnBiomes(from, distance = 0, rng = Math.random) {
  const others = BIOMES.filter((b) => b !== from);
  const roll = rng();
  if (distance > 1200 && roll < 0.5) {
    const hwy = others.includes("highway") ? "highway" : others[0];
    const alt = others.find((b) => b !== hwy) || others[0];
    return rng() < 0.5 ? { left: hwy, right: alt } : { left: alt, right: hwy };
  }
  if (roll < 0.5) return { left: others[0], right: others[1] };
  return { left: others[1], right: others[0] };
}

/**
 * Decide what kind of segment to spawn for a given index.
 * Returns { kind: ""|"I"|"T"|"R", reason }
 */
export function decideSegment(biome, spawnIndex, turnCooldown, rng) {
  // Quiet opening stretch
  if (spawnIndex < 4) return { kind: "", reason: "intro" };

  // Turn offers — rhythmic, not every tile
  if (turnCooldown <= 0 && spawnIndex > 6) {
    const base = biome === "highway" ? 0.18 : 0.24;
    // Wave the chance so clusters of straight road feel intentional
    const wave = 0.08 * Math.sin(spawnIndex * 0.37);
    if (rng() < base + wave) return { kind: "T", reason: "turn" };
  }

  // Intersections — denser in city, rare on highway
  const iChance = biome === "city" ? 0.22 : biome === "rural" ? 0.14 : 0.06;
  if (spawnIndex > 3 && rng() < iChance) return { kind: "I", reason: "light" };

  return { kind: "", reason: "straight" };
}

/**
 * Build a seamless transition corridor from → to.
 * Does NOT wipe existing road; these are appended by the spawner.
 *
 * Pattern: taper (from) → mix → mix → merge (to) → settle (to)
 */
export function buildTransitionPlan(fromBiome, toBiome) {
  return [
    { biome: fromBiome, kind: "", phase: "taper", t: 0.2 },
    { biome: fromBiome, kind: "R", phase: "exit", t: 0.4 },
    { biome: toBiome, kind: "R", phase: "enter", t: 0.65 },
    { biome: toBiome, kind: "", phase: "settle", t: 0.85 },
    { biome: toBiome, kind: "", phase: "settle", t: 1.0 },
  ];
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

/** Lerp road width between layouts for transition visuals. */
export function blendWidth(fromLayout, toLayout, t) {
  return fromLayout.width + (toLayout.width - fromLayout.width) * t;
}
