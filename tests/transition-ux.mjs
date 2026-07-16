/**
 * Gate B — drive all 6 biome transitions, sample corridor metadata, screenshot.
 * Usage: node tests/transition-ux.mjs [baseUrl]
 * Expect: `npm run serve` already up.
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "fs";

const base = process.argv[2] || "http://localhost:4173";
const PAIRS = [
  ["city", "rural"],
  ["city", "highway"],
  ["rural", "city"],
  ["highway", "city"],
  ["rural", "highway"],
  ["highway", "rural"],
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});

await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
await page.evaluate(() => {
  localStorage.setItem("EndlessChase.Hints.v1", JSON.stringify({ howto: true, coach: true }));
});
await page.waitForFunction(() => !!window.__endlessChase?.beginBiomeTransition, null, {
  timeout: 15000,
});

mkdirSync("/opt/cursor/artifacts/screenshots", { recursive: true });

async function startFreshRun() {
  // Return to menu if needed, then start a clean run
  await page.evaluate(() => {
    const g = window.__endlessChase;
    if (g.debugEndRun) g.debugEndRun();
  }).catch(() => {});
  await page.waitForTimeout(200);
  const menuVisible = await page.locator("#panel-menu:not(.hidden)").count();
  if (!menuVisible) {
    // Force reload for a clean world
    await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
    await page.evaluate(() => {
      localStorage.setItem("EndlessChase.Hints.v1", JSON.stringify({ howto: true, coach: true }));
    });
    await page.waitForFunction(() => !!window.__endlessChase?.beginBiomeTransition, null, {
      timeout: 15000,
    });
  }
  await page.click("#btn-play");
  await page.waitForFunction(() => window.__endlessChase?.getState()?.running === true, null, {
    timeout: 14000,
  });
  await page.waitForTimeout(500);
}

async function settleInto(biome) {
  const st = await page.evaluate(() => window.__endlessChase.getState());
  if (st.biome === biome && !st.transitioning) return true;
  await page.evaluate((b) => window.__endlessChase.beginBiomeTransition(b), biome);
  for (let i = 0; i < 36; i++) {
    const cur = await page.evaluate(() => {
      window.__endlessChase.debugAdvance(30);
      return window.__endlessChase.getState();
    });
    if (cur.biome === biome && !cur.transitioning) return true;
    await page.waitForTimeout(30);
  }
  return false;
}

const results = [];

for (const [from, to] of PAIRS) {
  await startFreshRun();

  // Reach from-biome (city is default start)
  if (from !== "city") {
    const ok = await settleInto(from);
    if (!ok) {
      results.push({
        from,
        to,
        checks: { settled: false, hadCorridor: false, marks: false, closed: false, envBlend: false },
        phases: [],
        sample: [],
        endBiome: (await page.evaluate(() => window.__endlessChase.getState().biome)),
        screenshot: null,
        error: `settleInto(${from}) failed`,
      });
      continue;
    }
  }

  await page.evaluate((to) => window.__endlessChase.beginBiomeTransition(to), to);

  let sample = [];
  let sawMarks = false;
  let sawMix = false;
  let sawClosed = false;
  let sawAtmosProgress = false;
  let phasesSeen = new Set();

  for (let i = 0; i < 36; i++) {
    const snap = await page.evaluate(() => {
      const before = window.__endlessChase.getState();
      window.__endlessChase.debugAdvance(24);
      const st = window.__endlessChase.getState();
      const pz = st.playerZ ?? 0;
      const segs = (window.__endlessChase.getTransitionSegments() || []).filter(
        (s) => Math.abs((s.z || 0) - pz) < 80
      );
      return { st, segs, pz };
    });
    for (const s of snap.segs) {
      if (s.phase) phasesSeen.add(s.phase);
      if (s.taperMarks) sawMarks = true;
      if (s.mix) sawMix = true;
      if (s.closed && s.closed.length) sawClosed = true;
      if (s.atmosT != null && s.atmosT > 0.15 && s.atmosT < 0.95) sawAtmosProgress = true;
      if (sample.length < 4) sample.push(s);
    }
    if (snap.st.biome === to && !snap.st.transitioning) break;
    await page.waitForTimeout(30);
  }

  const shot = `/opt/cursor/artifacts/screenshots/transition-${from}-to-${to}.png`;
  await page.screenshot({ path: shot, fullPage: false });

  const end = await page.evaluate(() => window.__endlessChase.getState());
  const narrowing = from === "city" && (to === "rural" || to === "highway");

  const checks = {
    settled: end.biome === to && !end.transitioning,
    hadCorridor: phasesSeen.has("exit") || phasesSeen.has("taper") || phasesSeen.has("enter"),
    marks: sawMarks || phasesSeen.has("taper") || phasesSeen.has("exit"),
    closed: narrowing ? sawClosed : true,
    envBlend: sawMix || sawAtmosProgress || phasesSeen.has("taper"),
  };

  results.push({
    from,
    to,
    checks,
    phases: [...phasesSeen],
    sample,
    endBiome: end.biome,
    screenshot: shot,
  });
}

await browser.close();

const fails = [];
for (const r of results) {
  for (const [k, ok] of Object.entries(r.checks)) {
    if (!ok) fails.push(`${r.from}→${r.to}: ${k} failed`);
  }
  if (r.error) fails.push(`${r.from}→${r.to}: ${r.error}`);
}
if (errors.length) fails.push("page errors: " + [...new Set(errors)].slice(0, 8).join(" | "));

writeFileSync(
  "/opt/cursor/artifacts/transition-ux-results.json",
  JSON.stringify({ results, fails, errors: [...new Set(errors)] }, null, 2)
);

if (fails.length) {
  console.error("TRANSITION_UX_FAIL\n" + fails.join("\n"));
  console.log(JSON.stringify(results, null, 2));
  process.exit(1);
}
console.log(
  "TRANSITION_UX_OK",
  results.map((r) => `${r.from}→${r.to}[${r.phases.join("+")}]`).join(", ")
);
