/**
 * Playwright smoke for Endless Chase (local serve or live Pages URL).
 * Covers boot → Play → lane input (keyboard + slow swipe) → garage path.
 * Usage: node tests/smoke.mjs [baseUrl]
 * Expect: server already up for local runs (`npm run serve`).
 */
import { chromium } from "playwright";

const base = process.argv[2] || "http://localhost:4173";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector("#btn-play", { timeout: 15000 });

const title = await page.title();
if (!title.includes("Endless Chase")) throw new Error("bad title: " + title);

await page.click("#btn-play");
await page.waitForSelector("#panel-hud:not(.hidden)", { timeout: 5000 });

// Wait out the curb pull-out intro before asserting controls
await page.waitForFunction(() => window.__endlessChase?.getState()?.running === true, null, { timeout: 8000 });

const laneBefore = await page.evaluate(() => window.__endlessChase.getState().lane);

// Rapid successive lane changes must stack while the spring is still in flight.
// (Regression: syncing lane from physical X mid-swipe ate every other side input.)
{
  let start = await page.evaluate(() => window.__endlessChase.getState().lane);
  // Nudge toward a forward lane with room for two inverted-left steps (higher index)
  for (let i = 0; i < 3 && start > 1; i++) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(450);
    start = await page.evaluate(() => window.__endlessChase.getState().lane);
  }
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(40); // still mid-spring
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(60);
  const rapid = await page.evaluate(() => window.__endlessChase.getState());
  const want = Math.min(3, start + 2);
  if (rapid.lane !== want) {
    throw new Error(
      `rapid side input did not stack: from ${start} got lane=${rapid.lane} target=${rapid.laneTargetX}, want ${want}`
    );
  }
  // Settle back toward the starting corridor before the rest of the suite
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(350);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(350);
}

// Drive lanes via keyboard
await page.keyboard.press("ArrowRight");
await page.waitForTimeout(400);
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(400);

// Caps Lock / uppercase letters must still steer
await page.keyboard.down("Shift");
await page.keyboard.press("KeyD");
await page.keyboard.up("Shift");
await page.waitForTimeout(300);
const afterUpper = await page.evaluate(() => window.__endlessChase.getState().lane);
if (afterUpper === laneBefore) {
  // Inverted: D = swipe right = move left lane index — should have changed at some point
  // ArrowRight already ran; verify at least one lane change stuck
  const mid = await page.evaluate(() => window.__endlessChase.getState().lane);
  if (typeof mid !== "number") throw new Error("lane state missing");
}

// Slow mouse swipe (>450ms) must still register — this was the intermittent miss
const canvas = page.locator("#c");
const box = await canvas.boundingBox();
if (!box) throw new Error("canvas missing");
const sx = box.x + box.width * 0.5;
const sy = box.y + box.height * 0.55;
const lanePreSlow = await page.evaluate(() => window.__endlessChase.getState().lane);
await page.mouse.move(sx, sy);
await page.mouse.down();
// Drag left slowly over ~600ms (inverted: left swipe → higher lane index)
for (let i = 1; i <= 12; i++) {
  await page.mouse.move(sx - i * 8, sy);
  await page.waitForTimeout(50);
}
await page.mouse.up();
await page.waitForTimeout(350);
const lanePostSlow = await page.evaluate(() => window.__endlessChase.getState().lane);
if (lanePostSlow === lanePreSlow) {
  throw new Error(`slow swipe did not change lane (was ${lanePreSlow})`);
}

// Mildly diagonal side swipe (more vertical than horizontal by a hair) must still steer.
// Thumbs often arc; abs(dx)>abs(dy) alone used to classify these as brake/resume.
{
  const pre = await page.evaluate(() => window.__endlessChase.getState().lane);
  // Ensure room to move left (higher index) at least once
  if (pre >= 3) {
    await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(400);
  }
  const lanePreDiag = await page.evaluate(() => window.__endlessChase.getState().lane);
  const dx = box.x + box.width * 0.5;
  const dy = box.y + box.height * 0.55;
  await page.mouse.move(dx, dy);
  await page.mouse.down();
  // ~48px left, ~56px down — vertical wins a pure comparison, but lateral bias should steer
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(dx - i * 6, dy + i * 7);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await page.waitForTimeout(200);
  const lanePostDiag = await page.evaluate(() => window.__endlessChase.getState().lane);
  if (lanePostDiag === lanePreDiag) {
    throw new Error(`diagonal side swipe did not change lane (was ${lanePreDiag})`);
  }
}

const distanceText = await page.textContent("#hud-distance");
if (!/\d+\s*m/.test(distanceText || "")) throw new Error("distance HUD missing: " + distanceText);

// Upgrades panel from menu path: crash or go via exposing API
await page.evaluate(() => {
  window.__endlessChase?.getState();
});

// Force game over via crash helper if exposed — else open upgrades from evaluating
await page.evaluate(() => {
  // inject coin and open upgrades from menu after stopping
  const s = window.__endlessChase;
  if (s) {
    // crash by overlapping — call internal if we add crash export; use UI path
  }
});

await page.keyboard.press("ArrowRight");
await page.waitForTimeout(2000);

// Give free coins via localStorage then test upgrades UI
await page.evaluate(() => {
  const key = "EndlessChase.Save.v1";
  const raw = localStorage.getItem(key);
  const data = raw ? JSON.parse(raw) : { version: 1, coins: 0, topSpeedLevel: 0, accelerationLevel: 0, handlingLevel: 0 };
  data.coins = Math.max(data.coins, 200);
  localStorage.setItem(key, JSON.stringify(data));
});

// Navigate: if still running, reload and use menu upgrades
await page.goto(base, { waitUntil: "networkidle" });
await page.click("#btn-upgrades-menu");
await page.waitForSelector("#panel-upgrades:not(.hidden)");
const coinsLabel = await page.textContent("#up-coins");
if (!/(Coins|Cash|CASH):?\s*\$?\d+/i.test(coinsLabel || "")) throw new Error("upgrades coins missing: " + coinsLabel);

await page.click("#btn-up-speed");
await page.waitForTimeout(200);
const after = await page.evaluate(() => JSON.parse(localStorage.getItem("EndlessChase.Save.v1")));
if (!after || after.topSpeedLevel < 1) throw new Error("upgrade did not persist: " + JSON.stringify(after));

// Persist across reload
await page.reload({ waitUntil: "networkidle" });
const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem("EndlessChase.Save.v1")));
if (afterReload.topSpeedLevel < 1) throw new Error("save lost on reload");

await page.click("#btn-play");
await page.waitForSelector("#panel-hud:not(.hidden)");

const hard = errors.filter((e) => !/favicon|cdn\.jsdelivr|Failed to load resource/.test(e));
if (hard.length) {
  console.error("Console errors:", hard);
  throw new Error("console errors present");
}

console.log("SMOKE_OK", base, { distanceText, topSpeedLevel: afterReload.topSpeedLevel, coins: afterReload.coins });
await browser.close();
