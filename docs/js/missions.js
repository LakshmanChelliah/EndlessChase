/**
 * Progressive run missions — four tracks that always stay on the board.
 * Pure helpers: no DOM, no Three.js, no localStorage.
 *
 * Tracks: gasVisits, coins, distance, boosts.
 * Progress is per-run; tier persists and advances forever after each clear.
 */

export const TRACK_KEYS = Object.freeze(["gasVisits", "coins", "distance", "boosts"]);

const MAX_ADVANCES_PER_SYNC = 20;

const META = {
  gasVisits: {
    hud: "GAS",
    label: (n) => `Visit ${n} gas station${n === 1 ? "" : "s"} in one run`,
  },
  coins: {
    hud: "COINS",
    label: (n) => `Grab ${n} coins in one run`,
  },
  distance: {
    hud: "DIST",
    label: (n) => `Drive ${n} m in one run`,
  },
  boosts: {
    hud: "BOOST",
    label: (n) => `Hit ${n} red-light boost${n === 1 ? "" : "s"} in one run`,
  },
};

/** Seed ladders; tier 3+ uses the scaling formulas from the plan. */
const SEEDS = {
  gasVisits: [
    { target: 1, reward: 25 },
    { target: 3, reward: 75 },
    { target: 5, reward: 150 },
  ],
  coins: [
    { target: 10, reward: 40 },
    { target: 20, reward: 80 },
    { target: 35, reward: 140 },
  ],
  distance: [
    { target: 300, reward: 40 },
    { target: 600, reward: 90 },
    { target: 1000, reward: 160 },
  ],
  boosts: [
    { target: 1, reward: 50 },
    { target: 2, reward: 100 },
    { target: 3, reward: 180 },
  ],
};

function emptyTrack() {
  return { tier: 0, progress: 0 };
}

export function defaultMissions() {
  return {
    tracks: {
      gasVisits: emptyTrack(),
      coins: emptyTrack(),
      distance: emptyTrack(),
      boosts: emptyTrack(),
    },
  };
}

/** Repair / migrate missions onto a save object. Returns save.missions. */
export function ensureMissions(save) {
  if (!save || typeof save !== "object") return defaultMissions();
  if (!save.missions || typeof save.missions !== "object") {
    save.missions = defaultMissions();
  }
  if (!save.missions.tracks || typeof save.missions.tracks !== "object") {
    save.missions.tracks = defaultMissions().tracks;
  }
  const tracks = save.missions.tracks;
  for (const key of TRACK_KEYS) {
    const src = tracks[key];
    if (!src || typeof src !== "object") {
      tracks[key] = emptyTrack();
      continue;
    }
    tracks[key] = {
      tier: Math.max(0, src.tier | 0),
      progress: Math.max(0, src.progress | 0),
    };
  }
  return save.missions;
}

/** Target + reward + copy for a track at a given tier. */
export function tierDef(goal, tier) {
  const t = Math.max(0, tier | 0);
  if (!TRACK_KEYS.includes(goal)) {
    return { target: 1, reward: 0, hud: "?", label: "Unknown mission", goal, tier: t };
  }
  const seeds = SEEDS[goal];
  let target;
  let reward;
  if (t < seeds.length) {
    target = seeds[t].target;
    reward = seeds[t].reward;
  } else {
    // Plan formulas use (tier - 2) when seeds are tiers 0..2
    const k = t - 2;
    if (goal === "gasVisits") {
      target = 5 + k * 2;
      reward = 150 + k * 50;
    } else if (goal === "coins") {
      target = 35 + k * 15;
      reward = 140 + k * 40;
    } else if (goal === "distance") {
      target = 1000 + k * 400;
      reward = 160 + k * 50;
    } else {
      target = 3 + k;
      reward = 180 + k * 60;
    }
  }
  target = Math.max(1, target | 0);
  reward = Math.max(0, reward | 0);
  const meta = META[goal];
  return {
    goal,
    tier: t,
    target,
    reward,
    hud: meta.hud,
    label: meta.label(target),
  };
}

/** Zero per-run progress on all tracks (tiers unchanged). */
export function resetMissionProgress(save) {
  const missions = ensureMissions(save);
  for (const key of TRACK_KEYS) {
    missions.tracks[key].progress = 0;
  }
  return missions;
}

/**
 * Sync track progress from runStats and advance tiers while goals are met.
 * Mutates save.missions and save.coins. Idempotent for a given runStats snapshot
 * relative to current tiers (re-applying the same stats after advance is a no-op
 * until stats grow again).
 */
export function applyRunStats(save, runStats) {
  const missions = ensureMissions(save);
  const stats = runStats || {};
  const completed = [];
  let coinsEarned = 0;

  for (const goal of TRACK_KEYS) {
    const track = missions.tracks[goal];
    const value = Math.max(0, Math.floor(Number(stats[goal]) || 0));
    track.progress = value;

    let advances = 0;
    while (advances < MAX_ADVANCES_PER_SYNC) {
      const def = tierDef(goal, track.tier);
      if (value < def.target) break;
      track.tier += 1;
      coinsEarned += def.reward;
      completed.push({
        goal,
        tier: track.tier - 1,
        target: def.target,
        reward: def.reward,
        hud: def.hud,
        label: def.label,
      });
      advances += 1;
      // progress stays as run total; next loop checks against new target
      track.progress = value;
    }
  }

  if (coinsEarned > 0) {
    save.coins = (save.coins | 0) + coinsEarned;
  }

  return { completed, coinsEarned };
}

/** Compact snapshot for HUD / debug. */
export function trackSnapshot(save) {
  const missions = ensureMissions(save);
  const out = {};
  for (const goal of TRACK_KEYS) {
    const track = missions.tracks[goal];
    const def = tierDef(goal, track.tier);
    out[goal] = {
      tier: track.tier,
      progress: track.progress | 0,
      target: def.target,
      reward: def.reward,
      hud: def.hud,
      label: def.label,
    };
  }
  return out;
}

/** Track closest to completion (highest progress/target ratio). */
export function closestTrack(save) {
  const snap = trackSnapshot(save);
  let best = null;
  let bestRatio = -1;
  for (const goal of TRACK_KEYS) {
    const t = snap[goal];
    const ratio = t.target > 0 ? Math.min(1, t.progress / t.target) : 0;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = t;
    }
  }
  return best;
}
