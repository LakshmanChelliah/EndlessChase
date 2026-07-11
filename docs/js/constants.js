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
      dirs: [-1, -1, 1, 1],
      defaultLane: 2,
    };
  }
  if (biome === "rural") {
    return {
      count: 2,
      width: 10,
      xs: [-2.0, 2.0],
      dirs: [-1, 1],
      defaultLane: 1,
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

export function pickTurnBiomes(from, distance = 0) {
  const others = ["city", "rural", "highway"].filter((b) => b !== from);
  if (distance > 900 && Math.random() < 0.55) {
    return { left: others[0], right: "highway" };
  }
  if (Math.random() < 0.5) return { left: others[0], right: others[1] };
  return { left: others[1], right: others[0] };
}

export function poolKey(biome, kind) {
  if (kind === "I") return biome + "I";
  if (kind === "T") return biome + "T";
  if (kind === "R") return biome + "R";
  return biome;
}
