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

/** @param {Biome} biome */
export function layoutFor(biome) {
  if (biome === "city") {
    return {
      count: 4,
      width: 16,
      xs: [-6.0, -2.0, 2.0, 6.0],
      // Left lanes forward (+Z); right lanes oncoming (−Z)
      dirs: [1, 1, -1, -1],
      defaultLane: 1,
    };
  }
  if (biome === "rural") {
    return {
      count: 2,
      width: 10,
      xs: [-2.0, 2.0],
      // Left forward, right oncoming
      dirs: [1, -1],
      defaultLane: 0,
    };
  }
  return {
    count: 2,
    width: 10,
    xs: [-2.0, 2.0],
    dirs: [1, 1],
    defaultLane: 0,
  };
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
  return biome;
}
