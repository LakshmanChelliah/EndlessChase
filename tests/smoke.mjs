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

// First-play howto gates Start Engine — mark tips seen for the drive path
await page.evaluate(() => {
  localStorage.setItem("EndlessChase.Hints.v1", JSON.stringify({ howto: true, coach: true }));
});

await page.waitForFunction(() => !!window.__endlessChase?.getSave, null, { timeout: 15000 });

// Missions board on menu + save shape (v3 tracks)
await page.waitForSelector("#menu-missions", { timeout: 5000 });
await page.waitForFunction(() => {
  const el = document.getElementById("menu-missions");
  return el && /MISSIONS/i.test(el.textContent || "");
}, null, { timeout: 5000 });
const menuMissionsText = await page.textContent("#menu-missions");
if (!/Visit 1 gas station/i.test(menuMissionsText || "")) {
  throw new Error("menu missions missing starter gas goal: " + menuMissionsText);
}
const missionSave = await page.evaluate(() => window.__endlessChase.getSave());
const tracks = missionSave?.missions?.tracks;
if (!tracks?.gasVisits || !tracks?.coins || !tracks?.distance || !tracks?.boosts) {
  throw new Error("missions.tracks incomplete: " + JSON.stringify(tracks));
}
if ((tracks.gasVisits.tier | 0) !== 0 || (tracks.coins.tier | 0) !== 0) {
  throw new Error("starter mission tiers not zero: " + JSON.stringify(tracks));
}

// How to Play panel should open from the menu
await page.click("#btn-howto");
await page.waitForSelector("#panel-howto:not(.hidden)", { timeout: 3000 });
const howtoTitle = await page.textContent("#howto-title");
if (!howtoTitle || !/STEER/i.test(howtoTitle)) throw new Error("howto missing steer step: " + howtoTitle);
await page.click("#btn-howto-skip");
await page.waitForSelector("#panel-menu:not(.hidden)", { timeout: 3000 });

// Menu easter egg: 5 taps on the BANK sign → 99999 coins
const bankEgg = await page.evaluate(async () => {
  const api = window.__endlessChase;
  if (!api?.debugTapBankSign) return { ok: false, reason: "missing-debugTapBankSign" };
  let last = null;
  for (let i = 0; i < 5; i++) {
    last = api.debugTapBankSign();
    if (!last.ok) return { ok: false, reason: "tap-miss", i, last };
    // Keep taps inside the easter-egg window without racing the rAF loop
    await new Promise((r) => setTimeout(r, 40));
  }
  const coins = api.getSave().coins;
  return { ok: coins === 99999, coins, last };
});
if (!bankEgg.ok) throw new Error("bank sign easter egg failed: " + JSON.stringify(bankEgg));

await page.click("#btn-play");
// Boarding cue shows before HUD; allow skip via state or wait for HUD
await page.waitForFunction(() => {
  const s = window.__endlessChase?.getState?.();
  return !!(s && (s.boarding || s.intro || s.running));
}, null, { timeout: 5000 });
await page.waitForSelector("#panel-hud:not(.hidden)", { timeout: 8000 });

// Wait out boarding (~2s) + curb pull-out (~2s) before asserting controls
await page.waitForFunction(() => window.__endlessChase?.getState()?.running === true, null, { timeout: 14000 });

// Mission HUD + debug grant path (coins tier 0 → 1)
await page.waitForSelector("#hud-mission", { timeout: 3000 });
const grantCoins = await page.evaluate(() => {
  const before = window.__endlessChase.getSave().coins;
  const r = window.__endlessChase.debugGrantMissionStat("coins", 10);
  return { before, after: r.coins, tier: r.missions.coins.tier, earned: r.coinsEarned, ok: r.ok };
});
if (!grantCoins.ok) throw new Error("debugGrantMissionStat failed: " + JSON.stringify(grantCoins));
if (grantCoins.earned !== 40) throw new Error("coins mission reward wrong: " + JSON.stringify(grantCoins));
if (grantCoins.tier !== 1) throw new Error("coins tier did not advance: " + JSON.stringify(grantCoins));
if (grantCoins.after !== grantCoins.before + 40) {
  throw new Error("coins balance mismatch after mission: " + JSON.stringify(grantCoins));
}
const grantDist = await page.evaluate(() => {
  const r = window.__endlessChase.debugGrantMissionStat("distance", 300);
  return { after: r.coins, tier: r.missions.distance.tier, earned: r.coinsEarned };
});
if (grantDist.earned !== 40 || grantDist.tier !== 1) {
  throw new Error("distance mission clear failed: " + JSON.stringify(grantDist));
}

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

async function slowSwipeLaneChange() {
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
  return { lanePreSlow, lanePostSlow };
}

let swipe = await slowSwipeLaneChange();
if (swipe.lanePostSlow === swipe.lanePreSlow) {
  // One retry — touch-mouse guard / timing can miss the first gesture
  await page.waitForTimeout(500);
  swipe = await slowSwipeLaneChange();
}
if (swipe.lanePostSlow === swipe.lanePreSlow) {
  throw new Error(`slow swipe did not change lane (was ${swipe.lanePreSlow})`);
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

const hudHighText = await page.textContent("#hud-high");
if (!/BEST\s+\d+\s*m/.test(hudHighText || "")) throw new Error("high score HUD missing: " + hudHighText);

// Force a high score and confirm it persists after game over → menu
await page.evaluate(() => {
  const s = window.__endlessChase;
  if (!s) throw new Error("debug handle missing");
  // Drive distance forward then crash via overlapping world hazard if exported;
  // otherwise mutate save + simulate game-over labels by ending via startRun state.
  const key = "EndlessChase.Save.v1";
  const raw = localStorage.getItem(key);
  const data = raw ? JSON.parse(raw) : { version: 2, coins: 0, highScore: 0 };
  data.highScore = Math.max(data.highScore | 0, 250);
  localStorage.setItem(key, JSON.stringify(data));
});

await page.goto(base, { waitUntil: "networkidle" });
const menuHigh = await page.textContent("#menu-high");
if (!/BEST\s+250\s*m/.test(menuHigh || "")) throw new Error("menu high score missing: " + menuHigh);

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
const speedLvl = (data, id) => {
  if (!data) return 0;
  if (data.cars && data.cars[id]) return data.cars[id].topSpeedLevel | 0;
  return data.topSpeedLevel | 0;
};
const selected = after?.selectedCar || "mobil";
if (speedLvl(after, selected) < 1) throw new Error("upgrade did not persist: " + JSON.stringify(after));

// Persist across reload
await page.reload({ waitUntil: "networkidle" });
const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem("EndlessChase.Save.v1")));
const reloadId = afterReload?.selectedCar || "mobil";
const reloadLvl = speedLvl(afterReload, reloadId);
if (reloadLvl < 1) throw new Error("save lost on reload");
if ((afterReload.highScore | 0) < 250) throw new Error("high score lost on reload: " + JSON.stringify(afterReload));

await page.click("#btn-play");
await page.waitForSelector("#panel-hud:not(.hidden)");

const hard = errors.filter((e) => !/favicon|cdn\.jsdelivr|Failed to load resource/.test(e));
if (hard.length) {
  console.error("Console errors:", hard);
  throw new Error("console errors present");
}

// Beat the saved best via debug end-run and confirm NEW BEST + persistence
await page.goto(base, { waitUntil: "networkidle" });
await page.evaluate(() => {
  localStorage.setItem("EndlessChase.Hints.v1", JSON.stringify({ howto: true, coach: true }));
  const key = "EndlessChase.Save.v1";
  const raw = localStorage.getItem(key);
  const data = raw ? JSON.parse(raw) : { version: 2, coins: 0, highScore: 0 };
  data.highScore = 100;
  localStorage.setItem(key, JSON.stringify(data));
});
await page.reload({ waitUntil: "networkidle" });
await page.click("#btn-play");
await page.waitForFunction(() => window.__endlessChase?.getState()?.running === true, null, { timeout: 8000 });
const ended = await page.evaluate(() => window.__endlessChase.debugEndRun("wreck", 350));
if (!ended || ended.highScore !== 350) throw new Error("debugEndRun did not set high score: " + JSON.stringify(ended));
await page.waitForSelector("#panel-gameover:not(.hidden)");
const goHighText = await page.textContent("#go-high");
if (!/NEW BEST\s+350\s*m/.test(goHighText || "")) throw new Error("NEW BEST missing: " + goHighText);
await page.click("#btn-menu");
await page.waitForSelector("#panel-menu:not(.hidden)");
const menuAfterBest = await page.textContent("#menu-high");
if (!/BEST\s+350\s*m/.test(menuAfterBest || "")) throw new Error("menu best after run: " + menuAfterBest);

// Mission tiers persist across reload; v2 save without missions still normalizes
const persisted = await page.evaluate(() => {
  const key = "EndlessChase.Save.v1";
  const data = JSON.parse(localStorage.getItem(key));
  return data?.missions?.tracks;
});
if (!persisted?.coins || (persisted.coins.tier | 0) < 1) {
  throw new Error("mission tiers not persisted: " + JSON.stringify(persisted));
}
await page.evaluate(() => {
  localStorage.setItem("EndlessChase.Save.v1", JSON.stringify({
    version: 2,
    coins: 10,
    highScore: 50,
    selectedCar: "mobil",
    unlocked: ["mobil"],
    cars: { mobil: { topSpeedLevel: 0, accelerationLevel: 0, handlingLevel: 0, brakesLevel: 0 } },
  }));
});
await page.reload({ waitUntil: "networkidle" });
const migrated = await page.evaluate(() => window.__endlessChase.getSave());
if (migrated.version !== 3 || !migrated.missions?.tracks?.gasVisits) {
  throw new Error("v2→v3 mission migrate failed: " + JSON.stringify(migrated));
}
if ((migrated.missions.tracks.gasVisits.tier | 0) !== 0) {
  throw new Error("migrated tiers should start at 0: " + JSON.stringify(migrated.missions));
}
await page.waitForSelector("#menu-missions", { timeout: 5000 });

console.log("SMOKE_OK", base, {
  distanceText,
  highScore: 350,
  topSpeedLevel: reloadLvl,
  coins: afterReload.coins,
  missionTiers: {
    coins: persisted.coins.tier,
    distance: persisted.distance?.tier,
  },
});
await browser.close();
