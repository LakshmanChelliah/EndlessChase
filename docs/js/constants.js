/** Shared tunables + biome lane layouts for Endless Chase (NES client). */
export const SEG_LEN = 20;
export const SAVE_KEY = "EndlessChase.Save.v1";
export const MAX_UPGRADE = 5;
export const COSTS = [50, 100, 200, 400, 800];
export const NES_W = 320;
export const NES_H = 180;
export const ASSET = "assets/nes";

export const BRAKE_DURATION = 0.85;
export const BRAKE_SPEED_MUL = 0.4;
export const HEAT_SLOW_THRESHOLD = 10;
export const HEAT_GRACE = 0.6;
export const HEAT_RISE = 25;
export const HEAT_DECAY = 12;
export const TURN_COOLDOWN_SEGS = 10;
export const TURN_WINDOW = 1.25;
export const TURN_YAW = (25 * Math.PI) / 180;
export const MIN_SWIPE = 40;

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

/** Gas resource — drain, stations, hold-to-fill */
export const GAS_START_MIN = 88;
export const GAS_START_MAX = 96;
/** % drained per second at cruise speed (~18) */
export const GAS_DRAIN_PER_SEC = 1.55;
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

/** Police siren — distance → volume (meters) */
export const SIREN_NEAR = 4;
export const SIREN_FAR = 48;
/** Baseline chase ambience while a run is active (0–1) */
export const SIREN_AMBIENT = 0.2;
/** Opening wail when gameplay begins — establishes the chase */
export const SIREN_OPENING = 0.78;
/** Seconds for the opening boost to fade into ambient/distance */
export const SIREN_OPENING_FADE = 5.5;

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
  if (b === "rural") return "RURAL";
  if (b === "highway") return "HWY";
  return "CITY";
}

export function poolKey(biome, kind) {
  if (kind === "I") return biome + "I";
  if (kind === "T") return biome + "T";
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
