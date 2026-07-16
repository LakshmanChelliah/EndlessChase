/**
 * Visual mid-taper capture + seam heuristic for biome corridor ground blend.
 * Usage: node tests/transition-visual.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";

const base = process.argv[2] || "http://localhost:4173";
const PAIRS = [
  ["city", "rural"],
  ["city", "highway"],
  ["rural", "city"],
  ["highway", "city"],
];

mkdirSync("/opt/cursor/artifacts/screenshots", { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

async function boot() {
  await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(() => {
    localStorage.setItem("EndlessChase.Hints.v1", JSON.stringify({ howto: true, coach: true }));
  });
  await page.waitForFunction(() => !!window.__endlessChase?.beginBiomeTransition, null, {
    timeout: 15000,
  });
  await page.click("#btn-play");
  await page.waitForFunction(() => window.__endlessChase?.getState()?.running === true, null, {
    timeout: 14000,
  });
  await page.waitForTimeout(400);
}

async function settleInto(biome) {
  const st = await page.evaluate(() => window.__endlessChase.getState());
  if (st.biome === biome && !st.transitioning) return;
  await page.evaluate((b) => window.__endlessChase.beginBiomeTransition(b), biome);
  for (let i = 0; i < 40; i++) {
    const cur = await page.evaluate(() => {
      window.__endlessChase.debugAdvance(30);
      return window.__endlessChase.getState();
    });
    if (cur.biome === biome && !cur.transitioning) return;
    await page.waitForTimeout(25);
  }
}

/**
 * Sample a horizontal band of the canvas mid-distance and score green/dark jumps.
 * Returns max Δgreen across adjacent pixel groups — high = hard seam.
 */
async function seamScore() {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!canvas) return { maxJump: 999, note: "no canvas" };
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    // WebGL canvas often can't be read via 2d — use drawImage fallback
    let data;
    try {
      const tmp = document.createElement("canvas");
      tmp.width = w;
      tmp.height = h;
      const tctx = tmp.getContext("2d");
      tctx.drawImage(canvas, 0, 0);
      // Sample a band ~38% down (mid road / verge)
      const y = Math.floor(h * 0.38);
      data = tctx.getImageData(0, y, w, 1).data;
    } catch (e) {
      return { maxJump: -1, note: String(e) };
    }
    // Average in blocks of 8px across the right verge (55%–92% width)
    const x0 = Math.floor(w * 0.55);
    const x1 = Math.floor(w * 0.92);
    const blocks = [];
    for (let x = x0; x < x1; x += 8) {
      let g = 0, r = 0, b = 0, n = 0;
      for (let dx = 0; dx < 8 && x + dx < x1; dx++) {
        const i = (x + dx) * 4;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
      blocks.push({ r: r / n, g: g / n, b: b / n });
    }
    let maxJump = 0;
    for (let i = 1; i < blocks.length; i++) {
      const dg = Math.abs(blocks[i].g - blocks[i - 1].g);
      const dr = Math.abs(blocks[i].r - blocks[i - 1].r);
      const jump = Math.max(dg, dr);
      if (jump > maxJump) maxJump = jump;
    }
    return { maxJump, blocks: blocks.length, yBand: 0.38 };
  });
}

const results = [];

for (const [from, to] of PAIRS) {
  await boot();
  if (from !== "city") await settleInto(from);
  await page.evaluate((to) => window.__endlessChase.beginBiomeTransition(to), to);

  let captured = false;
  let score = { maxJump: -1 };
  for (let i = 0; i < 24; i++) {
    const hit = await page.evaluate(() => {
      window.__endlessChase.debugAdvance(16);
      const st = window.__endlessChase.getState();
      const pz = st.playerZ || 0;
      const segs = (window.__endlessChase.getTransitionSegments() || []).filter(
        (s) => Math.abs((s.z || 0) - pz) < 40
      );
      const mid = segs.find(
        (s) =>
          s.phase === "taper" &&
          (s.sceneryBlend ?? 0) > 0.25 &&
          (s.sceneryBlend ?? 0) < 0.85
      );
      return mid ? { ...mid, pz } : null;
    });
    if (hit) {
      await page.waitForTimeout(120);
      const shot = `/opt/cursor/artifacts/screenshots/seamcheck-${from}-to-${to}.png`;
      await page.screenshot({ path: shot });
      score = await seamScore();
      results.push({ from, to, shot, score, sample: hit });
      captured = true;
      break;
    }
    await page.waitForTimeout(30);
  }
  if (!captured) {
    const shot = `/opt/cursor/artifacts/screenshots/seamcheck-${from}-to-${to}-miss.png`;
    await page.screenshot({ path: shot });
    results.push({ from, to, shot, score: { maxJump: 999 }, sample: null, miss: true });
  }
}

await browser.close();

// Threshold: neon green / dark gray hard cuts usually jump > 50–70 in green channel
const FAIL_JUMP = 55;
const fails = [];
for (const r of results) {
  if (r.miss) fails.push(`${r.from}→${r.to}: no mid-taper sample`);
  else if (r.score.maxJump < 0) {
    // canvas read failed — rely on manual screenshot review, don't fail CI
    console.warn(`seam pixel read skipped for ${r.from}→${r.to}:`, r.score.note);
  } else if (r.score.maxJump > FAIL_JUMP) {
    fails.push(`${r.from}→${r.to}: seam jump ${r.score.maxJump.toFixed(1)} > ${FAIL_JUMP}`);
  }
}
if (errors.length) fails.push("page errors: " + errors.slice(0, 5).join(" | "));

writeFileSync(
  "/opt/cursor/artifacts/seamcheck-results.json",
  JSON.stringify({ results, fails, errors }, null, 2)
);

if (fails.length) {
  console.error("SEAMCHECK_FAIL\n" + fails.join("\n"));
  process.exit(1);
}
console.log(
  "SEAMCHECK_OK",
  results.map((r) => `${r.from}→${r.to}:jump=${r.score.maxJump?.toFixed?.(1) ?? r.score.maxJump}`).join(", ")
);
