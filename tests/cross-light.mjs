/**
 * Assert cross-traffic NPCs stop for a red→green flip instead of running the box.
 * Usage: node tests/cross-light.mjs [baseUrl]
 * Expect: `npm run serve` already on :4173
 */
import { chromium } from "playwright";

const base = process.argv[2] || "http://localhost:4173";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector("#btn-play", { timeout: 15000 });
await page.click("#btn-play");
await page.waitForFunction(() => window.__endlessChase?.getState()?.running === true, null, {
  timeout: 8000,
});

// Keep seeking until an intersection exists ahead, then spawn cross traffic on red
let spawned = null;
for (let i = 0; i < 40; i++) {
  spawned = await page.evaluate(() => {
    const g = window.__endlessChase;
    const ix = g.getIntersections?.() || [];
    if (!ix.length) return { ok: false, reason: "waiting" };
    return g.debugSpawnCross(false);
  });
  if (spawned?.ok) break;
  await page.waitForTimeout(250);
}
if (!spawned?.ok) {
  await browser.close();
  throw new Error("failed to spawn cross traffic: " + JSON.stringify(spawned));
}

// Let the car approach the stop line on red
await page.waitForTimeout(900);
const approaching = await page.evaluate(() => window.__endlessChase.getCross());
if (!approaching.length) {
  await browser.close();
  throw new Error("cross car despawned before light flip");
}

// Flip to green — car must stop outside the main-road box (|x| >= ~8 for city)
await page.evaluate(() => window.__endlessChase.debugSetLight("green", 3));
await page.waitForTimeout(1200);

const after = await page.evaluate(() => ({
  cross: window.__endlessChase.getCross(),
  lights: window.__endlessChase.getIntersections(),
}));

const car = after.cross[0];
if (!car) {
  await browser.close();
  throw new Error("cross car missing after green (unexpected despawn)");
}

const absX = Math.abs(car.x);
// City half-width 8 + pad 1.6 → stop ≈ 9.6; allow small tolerance
if (absX < 8.2) {
  await browser.close();
  throw new Error(
    `cross car entered the box on green: x=${car.x} vx=${car.vx} stopped=${car.stopped}`
  );
}
if (Math.abs(car.vx) > 0.5 && absX < 12) {
  await browser.close();
  throw new Error(
    `cross car still rolling into the junction on green: x=${car.x} vx=${car.vx}`
  );
}

if (errors.length) {
  await browser.close();
  throw new Error("page errors: " + errors.join("; "));
}

console.log(
  `CROSS_LIGHT_OK stopped=${!!car.stopped} x=${car.x.toFixed(2)} vx=${(+car.vx).toFixed(2)}`
);
await browser.close();
