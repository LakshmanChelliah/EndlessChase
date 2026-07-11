/**
 * Generate NES-palette pixel textures for Endless Chase (CC0 procedural).
 * Run: node scripts/gen-nes-textures.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "../docs/assets/nes");
fs.mkdirSync(outDir, { recursive: true });

// Classic-inspired NES-safe palette (not Nintendo IP — generic 8-bit colors)
const C = {
  black: [0x00, 0x00, 0x00, 255],
  dark: [0x1a, 0x1c, 0x2c, 255],
  ash: [0x5d, 0x27, 0x5d, 255], // unused accent
  navy: [0x1d, 0x2b, 0x53, 255],
  blue: [0x29, 0xad, 0xff, 255],
  sky: [0x83, 0x76, 0x9c, 255],
  white: [0xff, 0xf1, 0xe8, 255],
  red: [0xff, 0x00, 0x4d, 255],
  crimson: [0xab, 0x52, 0x36, 255],
  orange: [0xff, 0xa3, 0x00, 255],
  yellow: [0xff, 0xec, 0x27, 255],
  green: [0x00, 0xe4, 0x36, 255],
  forest: [0x00, 0x87, 0x51, 255],
  brown: [0x7e, 0x25, 0x53, 255],
  tan: [0xff, 0xcc, 0xaa, 255],
  gray: [0xc2, 0xc3, 0xc7, 255],
  asphalt: [0x29, 0x2a, 0x32, 255],
  asphaltL: [0x3d, 0x3f, 0x4a, 255],
  curb: [0x5a, 0x5a, 0x6e, 255],
  brick: [0xb1, 0x3e, 0x53, 255],
  brickD: [0x7a, 0x28, 0x38, 255],
  window: [0xff, 0xec, 0x27, 255],
  policeB: [0x1d, 0x2b, 0x53, 255],
  policeW: [0xff, 0xf1, 0xe8, 255],
  carRed: [0xff, 0x00, 0x4d, 255],
  carBlue: [0x29, 0xad, 0xff, 255],
  carGreen: [0x00, 0xe4, 0x36, 255],
  carGray: [0xc2, 0xc3, 0xc7, 255],
  chrome: [0xff, 0xf1, 0xe8, 255],
  glass: [0x1d, 0x2b, 0x53, 255],
};

function png(w, h) {
  const img = new PNG({ width: w, height: h });
  img.data.fill(0);
  return img;
}

function set(img, x, y, rgba) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (img.width * y + x) << 2;
  img.data[i] = rgba[0];
  img.data[i + 1] = rgba[1];
  img.data[i + 2] = rgba[2];
  img.data[i + 3] = rgba[3] ?? 255;
}

function fill(img, x0, y0, x1, y1, rgba) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) set(img, x, y, rgba);
}

function rect(img, x, y, w, h, rgba) {
  fill(img, x, y, x + w, y + h, rgba);
}

function save(img, name) {
  const p = path.join(outDir, name);
  fs.writeFileSync(p, PNG.sync.write(img, { colorType: 6 }));
  console.log("wrote", name, img.width + "x" + img.height);
}

// --- Road atlas 64x64 ---
{
  const img = png(64, 64);
  fill(img, 0, 0, 64, 64, C.asphalt);
  // noise dither
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      if ((x + y) % 7 === 0) set(img, x, y, C.asphaltL);
    }
  }
  // lane dashes at x~21 and ~43
  for (const lx of [20, 42]) {
    for (let y = 0; y < 64; y += 8) {
      rect(img, lx, y, 2, 4, C.yellow);
    }
  }
  save(img, "road.png");
}

// --- Building face 32x48 ---
{
  const img = png(32, 48);
  fill(img, 0, 0, 32, 48, C.brick);
  for (let y = 0; y < 48; y++) {
    for (let x = 0; x < 32; x++) {
      if (y % 6 === 0) set(img, x, y, C.brickD);
      if (x % 8 === 0) set(img, x, y, C.brickD);
    }
  }
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 3; col++) {
      const wx = 3 + col * 10;
      const wy = 4 + row * 9;
      rect(img, wx, wy, 6, 5, (row + col) % 2 === 0 ? C.window : C.navy);
      // window frame
      for (let x = wx; x < wx + 6; x++) {
        set(img, x, wy, C.dark);
        set(img, x, wy + 4, C.dark);
      }
    }
  }
  save(img, "building.png");
}

// --- Suburb house 32x32 ---
{
  const img = png(32, 32);
  fill(img, 0, 12, 32, 32, C.tan);
  // roof triangle-ish
  for (let y = 0; y < 14; y++) {
    const inset = Math.floor((14 - y) * 0.9);
    fill(img, inset, y, 32 - inset, y + 1, C.crimson);
  }
  rect(img, 12, 18, 8, 14, C.brown);
  rect(img, 4, 16, 6, 6, C.navy);
  rect(img, 22, 16, 6, 6, C.navy);
  save(img, "house.png");
}

// --- Sky gradient dithered 8x64 (soft dusk — no solid orange horizon wall) ---
{
  const img = png(8, 64);
  const peach = [0xc4, 0xa5, 0x74, 255];
  const dusk = [0x6b, 0x8c, 0xae, 255];
  for (let y = 0; y < 64; y++) {
    const t = y / 63;
    let col = C.navy;
    if (t >= 0.92) col = dusk;
    else if (t >= 0.85) col = peach;
    else if (t >= 0.7) col = C.sky;
    fill(img, 0, y, 8, y + 1, col);
    if (y % 3 === 0 && t < 0.55) set(img, y % 8, y, C.dark);
  }
  for (const [x, y] of [[1, 4], [5, 8], [3, 12], [6, 3], [2, 18]]) set(img, x, y, C.white);
  save(img, "sky.png");
}

// --- Car sprites top-down-ish 16x24 (player, police, civs) ---
function carSprite(body, accent, name, police = false) {
  const img = png(16, 24);
  fill(img, 0, 0, 16, 24, [0, 0, 0, 0]);
  // body
  rect(img, 3, 2, 10, 20, body);
  // cabin
  rect(img, 4, 7, 8, 7, C.glass);
  // hood highlight
  rect(img, 4, 3, 8, 3, accent || body);
  // bumpers
  rect(img, 3, 1, 10, 1, C.chrome);
  rect(img, 3, 22, 10, 1, C.chrome);
  // wheels
  rect(img, 1, 4, 2, 4, C.black);
  rect(img, 13, 4, 2, 4, C.black);
  rect(img, 1, 16, 2, 4, C.black);
  rect(img, 13, 16, 2, 4, C.black);
  if (police) {
    rect(img, 5, 6, 3, 8, C.policeW);
    rect(img, 8, 6, 3, 8, C.policeW);
    rect(img, 5, 5, 3, 2, C.red);
    rect(img, 8, 5, 3, 2, C.blue);
  }
  // taillights
  rect(img, 4, 21, 3, 1, C.red);
  rect(img, 9, 21, 3, 1, C.red);
  save(img, name);
}

carSprite(C.carRed, C.orange, "car_player.png");
carSprite(C.policeB, C.policeW, "car_police.png", true);
carSprite(C.carBlue, C.blue, "car_civ_a.png");
carSprite(C.carGreen, C.forest, "car_civ_b.png");
carSprite(C.carGray, C.gray, "car_civ_c.png");
carSprite(C.orange, C.yellow, "car_truck.png");

// --- Coin 8x8 ---
{
  const img = png(8, 8);
  fill(img, 0, 0, 8, 8, [0, 0, 0, 0]);
  rect(img, 2, 1, 4, 6, C.yellow);
  rect(img, 1, 2, 6, 4, C.yellow);
  rect(img, 3, 2, 2, 4, C.orange);
  save(img, "coin.png");
}

// --- Traffic light 8x16 ---
{
  const img = png(8, 16);
  fill(img, 3, 0, 5, 16, C.gray);
  rect(img, 1, 0, 6, 10, C.dark);
  rect(img, 2, 1, 4, 2, C.red);
  rect(img, 2, 4, 4, 2, C.yellow);
  rect(img, 2, 7, 4, 2, C.green);
  save(img, "traffic_light.png");
}

// --- Curb strip ---
{
  const img = png(16, 16);
  fill(img, 0, 0, 16, 16, C.curb);
  for (let i = 0; i < 16; i++) if (i % 2 === 0) fill(img, i, 0, i + 1, 16, C.gray);
  save(img, "curb.png");
}

fs.writeFileSync(
  path.join(outDir, "ATTRIBUTION.txt"),
  "Procedural NES-style textures generated for Endless Chase. Palette inspired by classic 8-bit constraints (not Nintendo IP). CC0.\n"
);
console.log("done ->", outDir);
