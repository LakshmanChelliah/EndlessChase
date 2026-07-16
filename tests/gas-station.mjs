/**
 * Gas station UX: swipe cues + flicker + enter/merge (tap does not enter/merge).
 * Expects `npm run serve` on the target URL (default http://localhost:4173).
 */
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:4173";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForSelector("#btn-play", { timeout: 15000 });
await page.evaluate(() => {
  localStorage.setItem("EndlessChase.Hints.v1", JSON.stringify({ howto: true, coach: true }));
});
await page.waitForFunction(() => !!window.__endlessChase?.getSave, null, { timeout: 15000 });

await page.click("#btn-play");
await page.waitForFunction(() => {
  const s = window.__endlessChase?.getState?.();
  return !!(s && (s.boarding || s.intro || s.running));
}, null, { timeout: 5000 });
await page.waitForSelector("#panel-hud:not(.hidden)", { timeout: 8000 });
await page.waitForFunction(() => window.__endlessChase?.getState()?.running === true, null, { timeout: 14000 });

await page.evaluate(() => window.__endlessChase.debugClearHazards());
await page.keyboard.press("s");

const spawned = await page.evaluate(() => window.__endlessChase.debugSpawnGas(1, 18));
if (!spawned?.ok) throw new Error("debugSpawnGas failed: " + JSON.stringify(spawned));

const stations = await page.evaluate(() => window.__endlessChase.getGasStations());
const station = stations.find((s) => !s.resolved);
if (!station?.hasPylon) throw new Error("gas pylon missing: " + JSON.stringify(stations));
if (!station?.hasLetters) throw new Error("gas GAS letters missing: " + JSON.stringify(stations));
if (station.glowOpacity == null) throw new Error("gas letter glow missing");

// Flicker while station is still ahead
const opacities = await page.evaluate(async () => {
  const samples = [];
  for (let i = 0; i < 10; i++) {
    const g = window.__endlessChase.getGasStations().find((s) => !s.resolved);
    samples.push(g?.glowOpacity ?? -1);
    await new Promise((r) => setTimeout(r, 50));
  }
  return samples;
});
const uniq = new Set(opacities.map((v) => v.toFixed(2)));
if (uniq.size < 2) {
  throw new Error("gas sign did not flicker: " + JSON.stringify(opacities));
}

const reqLane = spawned.requiredLane | 0;
for (let i = 0; i < 8; i++) {
  const lane = await page.evaluate(() => window.__endlessChase.getState().lane);
  if (lane === reqLane) break;
  if (lane < reqLane) await page.keyboard.press("a");
  else await page.keyboard.press("d");
  await page.waitForTimeout(220);
}

await page.waitForFunction((need) => {
  const st = window.__endlessChase.getState();
  const floatEl = document.getElementById("hud-station-float");
  const g = window.__endlessChase.getGasStations().find((s) => !s.resolved);
  return st.lane === need && g && g.dz < 16 && g.dz > 0
    && floatEl && !floatEl.classList.contains("hidden");
}, reqLane, { timeout: 20000 });

const floatText = await page.locator("#hud-station-float").innerText();
if (!/SWIPE/i.test(floatText) || !/ENTER/i.test(floatText)) {
  throw new Error("expected swipe ENTER cue, got: " + floatText);
}
const enterDirOk = await page.evaluate(() => {
  const el = document.getElementById("hud-station-float");
  return el && el.classList.contains("dir-left");
});
if (!enterDirOk) throw new Error("enter cue missing dir-left class");

await page.evaluate(() => window.__endlessChase.debugClearHazards());

// Tap on canvas must not enter
await page.click("#c");
await page.waitForTimeout(100);
let st = await page.evaluate(() => window.__endlessChase.getState());
if (st.gasVisit) throw new Error("tap entered gas station (should not)");

// Enter via the same path as a curb-lane swipe
const diag = await page.evaluate(() => window.__endlessChase.debugTrySwipeEnterGas("left"));
if (!diag.ok) throw new Error("enter failed: " + JSON.stringify(diag));
st = await page.evaluate(() => window.__endlessChase.getState());
if (!st.gasVisit) throw new Error("swipe did not enter gas station");

// Wait for pumping, brief hold, release → waitClear
await page.waitForFunction(() => window.__endlessChase.getState().gasVisit?.phase === "pumping", null, { timeout: 5000 });
await page.keyboard.down(" ");
await page.waitForTimeout(350);
await page.keyboard.up(" ");
await page.waitForFunction(() => window.__endlessChase.getState().gasVisit?.phase === "waitClear", null, { timeout: 5000 });

const mergeVisible = await page.evaluate(() => {
  const el = document.getElementById("hud-merge-btn");
  return !!(el && !el.classList.contains("hidden") && el.classList.contains("dir-right")
    && /MERGE/i.test(el.textContent || "") && /SWIPE/i.test(el.textContent || ""));
});
if (!mergeVisible) throw new Error("merge swipe cue not visible with dir-right");

// Tap must not merge
await page.click("#c");
await page.waitForTimeout(100);
st = await page.evaluate(() => window.__endlessChase.getState());
if (st.gasVisit?.phase !== "waitClear") throw new Error("tap merged out (should not)");

// Swipe toward road (D = right for right-side lot)
await page.keyboard.press("d");
await page.waitForTimeout(200);
st = await page.evaluate(() => window.__endlessChase.getState());
if (st.gasVisit?.phase === "waitClear") {
  throw new Error("swipe did not merge out of gas station");
}

if (errors.length) throw new Error("page errors: " + errors.join("; "));

console.log("GAS_STATION_OK", {
  floatText,
  phaseAfterMerge: st.gasVisit?.phase || "done",
  requiredLane: reqLane,
  flickerSamples: opacities,
  spawned,
});
await browser.close();
