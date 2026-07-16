/**
 * Gas station UX: flickering pylon + swipe/keyboard enter (tap does not enter).
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

const spawned = await page.evaluate(() => window.__endlessChase.debugSpawnGas(1, 14));
if (!spawned?.ok) throw new Error("debugSpawnGas failed: " + JSON.stringify(spawned));

const stations = await page.evaluate(() => window.__endlessChase.getGasStations());
const station = stations.find((s) => !s.resolved);
if (!station?.hasPylon) throw new Error("gas pylon missing: " + JSON.stringify(stations));
if (!station?.hasLetters) throw new Error("gas GAS letters missing: " + JSON.stringify(stations));
if (station.glowOpacity == null) throw new Error("gas letter glow missing");

// GAS text must be a yawed Plane (not a billboard Sprite) with no UV mirror.
// Sprite + repeat.x=-1 was still mirrored under the +Z chase cam.
const letterOrient = await page.evaluate(() => {
  const player = window.__endlessChase.getPlayer();
  let scene = player;
  while (scene.parent) scene = scene.parent;
  scene.updateMatrixWorld(true);
  let plane = null;
  let sprite = null;
  scene.traverse((o) => {
    if (o.name === "gasLetterPlane") plane = o;
    if (o.isSprite && o.userData?.gasLetter) sprite = o;
  });
  if (!plane) return { ok: false, reason: "missing-gasLetterPlane" };
  if (sprite) return { ok: false, reason: "sprite-still-used" };
  const map = plane.material?.map;
  const repeatX = map?.repeat?.x ?? 1;
  if (repeatX < 0) return { ok: false, reason: "uv-mirrored", repeatX };
  const root = plane.parent;
  const yaw = root?.rotation?.y ?? 0;
  // Expect ~π yaw so the plane faces the chase cam
  if (Math.abs(Math.abs(yaw) - Math.PI) > 0.2) {
    return { ok: false, reason: "bad-yaw", yaw };
  }
  return { ok: true, repeatX, yaw: +yaw.toFixed(3), isMesh: !!plane.isMesh };
});
if (!letterOrient.ok) {
  throw new Error("gas letter orientation broken: " + JSON.stringify(letterOrient));
}

const reqLane = spawned.requiredLane | 0;
for (let i = 0; i < 8; i++) {
  const lane = await page.evaluate(() => window.__endlessChase.getState().lane);
  if (lane === reqLane) break;
  if (lane < reqLane) await page.keyboard.press("a");
  else await page.keyboard.press("d");
  await page.waitForTimeout(280);
}

await page.waitForFunction((need) => {
  const st = window.__endlessChase.getState();
  const floatEl = document.getElementById("hud-station-float");
  const g = window.__endlessChase.getGasStations().find((s) => !s.resolved);
  return st.lane === need && g && g.dz < 16 && g.dz > -2
    && floatEl && !floatEl.classList.contains("hidden");
}, reqLane, { timeout: 20000 });

const floatText = await page.locator("#hud-station-float").innerText();
if (!/SWIPE/i.test(floatText)) {
  throw new Error("expected SWIPE prompt, got: " + floatText);
}

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

await page.evaluate(() => window.__endlessChase.debugClearHazards());

// Tap on canvas must not enter
await page.click("#c");
await page.waitForTimeout(150);
let st = await page.evaluate(() => window.__endlessChase.getState());
if (st.gasVisit) throw new Error("tap entered gas station (should not)");

// Focused canvas + A (swipe-left) toward right-side lot
await page.keyboard.press("a");
await page.waitForTimeout(100);
st = await page.evaluate(() => window.__endlessChase.getState());
if (!st.gasVisit) {
  // Fallback: same code path the gesture uses
  const diag = await page.evaluate(() => window.__endlessChase.debugTrySwipeEnterGas("left"));
  if (!diag.ok) throw new Error("enter failed: " + JSON.stringify(diag));
  st = await page.evaluate(() => window.__endlessChase.getState());
}
if (!st.gasVisit) throw new Error("swipe did not enter gas station");

if (errors.length) throw new Error("page errors: " + errors.join("; "));

console.log("GAS_STATION_OK", {
  floatText,
  phase: st.gasVisit.phase,
  requiredLane: reqLane,
  flickerSamples: opacities,
  letterOrient,
  spawned,
});
await browser.close();
