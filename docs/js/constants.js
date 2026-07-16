/**
 * Endless Chase — shared tunables, biome lane layouts, and asset path roots.
 *
 * Single source of truth for paths used by nes.js / cars.js loaders:
 *   ASSET      → docs/assets/nes/   (procedural pixel atlases)
 *   CARS_ASSET → docs/assets/cars/  (GLB + garage previews)
 *
 * Invariants: SEG_LEN matches Unity LevelManager.SegmentLength (20m);
 * SAVE_KEY must stay stable across releases or migrate in save.js.
 */
export const SEG_LEN = 20;
export const SAVE_KEY = "EndlessChase.Save.v1";
export const MAX_UPGRADE = 5;
export const COSTS = [50, 100, 200, 400, 800];
export const NES_W = 320;
export const NES_H = 180;
/** Relative to the Pages / docs/ site root */
export const ASSET = "assets/nes";
/** Relative to the Pages / docs/ site root */
export const CARS_ASSET = "assets/cars";

export const BRAKE_DURATION = 0.85;
export const BRAKE_SPEED_MUL = 0.4;
/** Coupe stock speed limiter (world units). HUD = round(world × 4); Van (0.85) stock reads 70. */
export const BASE_MAX_SPEED = 70 / (0.85 * 4);
/** Coupe stock accel (units/s²). Effective = BASE_ACCEL * accelFactor. */
export const BASE_ACCEL = 6;
/** Coupe stock brake deceleration (units/s²). Effective = BASE_BRAKE * brakesFactor. */
export const BASE_BRAKE = 12;
export const HEAT_SLOW_THRESHOLD = 10;
export const HEAT_GRACE = 0.6;
export const HEAT_RISE = 25;
export const HEAT_DECAY = 12;

/**
 * Progressive difficulty — quiet opening, full pressure by DIFFICULTY_RAMP_DIST.
 * difficulty01 ease-in keeps the first ~hundreds of meters forgiving.
 */
export const DIFFICULTY_RAMP_DIST = 2800;
/** First ambient traffic spawn delay after pull-out (seconds) */
export const TRAFFIC_TIMER_START = 1.65;
export const TRAFFIC_INTERVAL_EASY = 2.25;
export const TRAFFIC_INTERVAL_HARD = 0.5;
export const TRAFFIC_ONCOMING_EASY = 0.12;
export const TRAFFIC_ONCOMING_HARD = 0.5;
/** Extra heat-grace seconds at distance 0 (added on top of HEAT_GRACE) */
export const HEAT_GRACE_EASY_BONUS = 0.75;
/** Heat rise multiplier at distance 0 (ramps to 1) */
export const HEAT_RISE_EASY_MUL = 0.55;

/** @param {number} distance meters traveled this run */
export function difficulty01(distance) {
  const t = Math.max(0, Math.min(1, Number(distance) / DIFFICULTY_RAMP_DIST || 0));
  // Mild ease-in: forgiving opening, solid mid-run pressure, full by ramp end
  return t ** 1.25;
}

/** Ambient traffic respawn interval (seconds) */
export function trafficSpawnInterval(distance) {
  const d = difficulty01(distance);
  return TRAFFIC_INTERVAL_EASY - d * (TRAFFIC_INTERVAL_EASY - TRAFFIC_INTERVAL_HARD);
}

/** Chance a traffic spawn uses an oncoming lane when one is available */
export function trafficOncomingChance(distance) {
  const d = difficulty01(distance);
  return TRAFFIC_ONCOMING_EASY + d * (TRAFFIC_ONCOMING_HARD - TRAFFIC_ONCOMING_EASY);
}

/** Seconds before slow/brake starts building heat */
export function heatGraceFor(distance) {
  return HEAT_GRACE + (1 - difficulty01(distance)) * HEAT_GRACE_EASY_BONUS;
}

/** Multiplier on heat gain (slowing, lights, etc.) */
export function heatPressureMul(distance) {
  return HEAT_RISE_EASY_MUL + difficulty01(distance) * (1 - HEAT_RISE_EASY_MUL);
}
/** Commit window while approaching an intersection center (seconds). Unused for expiry — proximity band gates turns. */
export const TURN_WINDOW = 1.25;
/** Cosmetic lane-change yaw kick (radians). */
export const TURN_YAW = (25 * Math.PI) / 180;
/** Locked intersection drift duration (seconds). */
export const TURN_DRIFT_DURATION = 1.05;
/** Peak yaw during a full intersection drift (±π/2). */
export const TURN_DRIFT_YAW = Math.PI / 2;
/** How far into the cross-street arm the drift arcs (meters past road half). */
export const TURN_DRIFT_ARC = 7.5;
/**
 * Show turn cue / accept turn swipe when intersection center is within this
 * Z distance ahead (and until just past center). Must last the whole approach —
 * a short wall-clock timer made late swipes miss the turn.
 */
export const TURN_HUD_AHEAD = 18;
export const MIN_SWIPE = 40;
/** Max duration for a tap (gas station). Swipes have no time limit. */
export const TAP_MAX_MS = 450;
/** Ignore synthetic mouse clicks this long after a real touch. */
export const TOUCH_MOUSE_GUARD_MS = 700;

/**
 * Minimum straight segments between traffic-light intersections.
 * Prevents city lights from stacking on consecutive tiles.
 */
export const INTERSECTION_COOLDOWN_SEGS = 3;

/** Traffic light phase durations (seconds) */
export const LIGHT_GREEN = 3.0;
export const LIGHT_YELLOW = 1.0;
export const LIGHT_RED = 3.0;
/** Show phase on HUD when intersection is this far ahead */
export const LIGHT_HUD_AHEAD = 18;
/** Same-dir NPCs stop this far before intersection center */
export const NPC_STOP_OFFSET = 3;

/** Cross-street traffic — spawn far so approach is visible */
export const CROSS_SPAWN_X = 28;
export const CROSS_SPEED = 14;
export const CROSS_HAZARD_SPEED = 22;
export const CROSS_MAX = 3;
export const CROSS_SPAWN_INTERVAL = 1.15;
/** Stop short of the main-road edge (beyond road half) */
export const CROSS_STOP_PAD = 1.6;
/**
 * Last seconds of main-road red: cross NPCs must not enter the box.
 * Prevents cars still rolling through when the light flips green.
 */
export const CROSS_ENTER_CUTOFF = 0.9;

/** Gas resource — drain, stations, hold-to-fill */
export const GAS_START_MIN = 88;
export const GAS_START_MAX = 96;
/** % drained per second at Coupe stock cruise (BASE_MAX_SPEED) */
export const GAS_DRAIN_PER_SEC = 1.24;
export const GAS_DRAIN_BOOST_MUL = 1.7;
export const GAS_DRAIN_BRAKE_MUL = 0.35;
/** Soft fail: empty tank forces a coast that builds heat */
export const GAS_EMPTY_SPEED_MUL = 0.32;
/** Minimum straight segments between gas stations */
export const GAS_STATION_COOLDOWN_SEGS = 18;
/** Show / allow tap when station is this far ahead (meters) */
export const GAS_HUD_AHEAD = 28;
/** Interact range — tap station while within this distance */
export const GAS_INTERACT_RANGE = 16;
/** HUD color tiers */
export const GAS_COLOR_OK = 40;
export const GAS_COLOR_LOW = 15;
/** Hold-to-fill rates */
export const GAS_HOLD_FILL_PER_SEC = 28;
/** Heat keeps climbing the whole visit (pull-in / pumping idle) */
export const GAS_VISIT_HEAT_PER_SEC = 18;
/** Slower heat while waiting to merge — time to find a gap */
export const GAS_MERGE_HEAT_PER_SEC = 5.5;
/** Extra heat while actively holding the pump */
export const GAS_HOLD_HEAT_PER_SEC = 22;
/** Pull-in / pull-out anim length (seconds) */
export const GAS_PULL_DURATION = 0.75;
/** Camera pan toward station side while visiting (world X offset) */
export const GAS_CAM_PAN = 4.2;
/** Cop visual distance while pumping (far → near as heat rises) */
export const GAS_COP_Z_FAR = 22;
export const GAS_COP_Z_NEAR = 2.8;

/**
 * Police siren vs HUD police distance bar (`heat`, 0–100% fill).
 * After the opening cue, sirens stay off until the bar reaches SIREN_ONSET,
 * then get louder as the bar fills toward 100%.
 */
/** Turn sirens on at this bar fill (60%) */
export const SIREN_ONSET = 0.6;
/** Loudness at full bar / cops on you (0–1) */
export const SIREN_VOL_NEAR = 0.9;
/** Loudness just as the bar hits SIREN_ONSET (0–1) */
export const SIREN_VOL_ONSET = 0.3;
/** Opening sirens when gameplay begins — fairly loud, then bar gate takes over */
export const SIREN_OPENING = 0.88;
/** Seconds for the opening boost to fade; after this, wait for bar ≥ 60% */
export const SIREN_OPENING_FADE = 4.0;

export const NES = {
  black: 0x000000,
  navy: 0x1d2b53,
  sky: 0x83769c,
  white: 0xfff1e8,
  red: 0xff004d,
  orange: 0xffa300,
  yellow: 0xffec27,
  green: 0x00e436,
  asphalt: 0x292a32,
  curb: 0x5a5a6e,
  forest: 0x008751,
};

/** Per-biome fog / sky / ground — keeps NES palette, differentiates stretches. */
export const BIOME_ATMOS = {
  city: {
    fog: 0x1d2b53,
    fogNear: 35,
    fogFar: 95,
    clear: 0x1d2b53,
    ground: 0x008751,
    sky: ["#0f1730", "#1d2b53", "#3a4570", "#5a6588"],
    stars: "#fff1e8",
  },
  rural: {
    fog: 0x143028,
    fogNear: 40,
    fogFar: 105,
    clear: 0x143028,
    ground: 0x0a5a30,
    sky: ["#101820", "#1a3040", "#2a4840", "#3d6050"],
    stars: "#fff1e8",
  },
  highway: {
    fog: 0x222830,
    fogNear: 48,
    fogFar: 115,
    clear: 0x222830,
    ground: 0x2a3a28,
    sky: ["#0a0e18", "#161c28", "#2a3040", "#4a5060"],
    stars: "#c2c3c7",
  },
};

/** @typedef {"city"|"rural"|"highway"} Biome */

/**
 * Canonical biome layouts. Lane indices are stable within a biome.
 * City outer lanes (0, 3) close during narrowing transitions.
 */
export const BIOMES = {
  city: {
    id: "city",
    count: 4,
    width: 16,
    xs: [-6.0, -2.0, 2.0, 6.0],
    // Left lanes forward (+Z); right lanes oncoming (−Z)
    dirs: [1, 1, -1, -1],
    defaultLane: 1,
  },
  rural: {
    id: "rural",
    count: 2,
    width: 10,
    xs: [-2.0, 2.0],
    // Left forward, right oncoming
    dirs: [1, -1],
    defaultLane: 0,
  },
  highway: {
    id: "highway",
    count: 2,
    width: 10,
    xs: [-2.0, 2.0],
    dirs: [1, 1],
    defaultLane: 0,
  },
};

/**
 * Transition corridor defs. Narrowing closes outer lanes with obstacles;
 * widening expands width with no closures.
 */
export const TRANSITIONS = {
  CITY_TO_HIGHWAY: { from: "city", to: "highway", taperSteps: 4, closeLaneIndices: [0, 3] },
  CITY_TO_RURAL: { from: "city", to: "rural", taperSteps: 4, closeLaneIndices: [0, 3] },
  HIGHWAY_TO_CITY: { from: "highway", to: "city", taperSteps: 3, closeLaneIndices: [] },
  HIGHWAY_TO_RURAL: { from: "highway", to: "rural", taperSteps: 3, closeLaneIndices: [] },
  RURAL_TO_CITY: { from: "rural", to: "city", taperSteps: 3, closeLaneIndices: [] },
  RURAL_TO_HIGHWAY: { from: "rural", to: "highway", taperSteps: 3, closeLaneIndices: [] },
};

/** @param {Biome} biome */
export function layoutFor(biome) {
  return BIOMES[biome] || BIOMES.highway;
}

export function biomeLabel(b) {
  if (b === "rural") return "SUBURBS";
  if (b === "highway") return "HWY";
  return "CITY";
}

export function poolKey(biome, kind) {
  if (kind === "I") return biome + "I";
  if (kind === "R") return biome + "R";
  if (kind === "G") return biome + "G";
  return biome;
}

/**
 * Police countdown while pumping — higher heat = shorter window.
 * Rural is safest; city is hottest.
 * @param {"city"|"rural"|"highway"} biome
 * @param {number} heat 0–100
 * @deprecated pump UI no longer uses a police timer; kept for debug
 */
export function gasPoliceWindow(biome, heat) {
  const base = biome === "rural" ? 3.7 : biome === "highway" ? 3.1 : 2.75;
  const heatFactor = 1 - Math.min(1, heat / 100) * 0.48;
  return Math.max(1.55, base * heatFactor);
}
