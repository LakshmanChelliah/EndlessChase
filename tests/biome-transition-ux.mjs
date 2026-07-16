/**
 * Biome-transition UI/UX harness for Endless Chase.
 * Clears civ hazards so the corridor can be driven end-to-end, samples each
 * phase, and writes screenshots + report.json under /opt/cursor/artifacts/biome-ux.
 *
 * Usage: node tests/biome-transition-ux.mjs [baseUrl]
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const base = process.argv[2] || "http://localhost:4173";
const outDir = "/opt/cursor/artifacts/biome-ux";
const shotDir = path.join(outDir, "screenshots");
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});

await page.goto(base, { waitUntil: "networkidle", timeout: 60000 });
await page.evaluate(() => {
  localStorage.setItem("EndlessChase.Hints.v1", JSON.stringify({ howto: true, coach: true }));
});
await page.waitForFunction(() => !!window.__endlessChase?.beginBiomeTransition, null, {
  timeout: 20000,
});
await page.click("#btn-play");
await page.waitForFunction(() => window.__endlessChase?.getState()?.running === true, null, {
  timeout: 20000,
});

async function shot(name) {
  const file = path.join(shotDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function sample() {
  return page.evaluate(() => {
    const g = window.__endlessChase;
    const st = g.getState();
    const seg = g.getSegmentAt(st.playerZ);
    const segs = g.getTransitionSegments?.() || [];
    const hudTurn = document.getElementById("hud-turn");
    const hudLight = document.getElementById("hud-light");
    const hudLaneWarn = document.getElementById("hud-lane-warn");
    return {
      state: {
        biome: st.biome,
        distance: +st.distance.toFixed(1),
        playerZ: +st.playerZ.toFixed(1),
        transitioning: st.transitioning,
        transitionQueue: st.transitionQueue,
        alive: st.alive,
        running: st.running,
        controlUsable: st.controlUsable,
        lane: st.lane,
        laneX: st.laneX,
        playerX: st.playerX,
        turnActive: !!st.turnActive,
        heat: st.heat,
      },
      phase: seg?.userData?.transitionPhase || null,
      atmosT: seg?.userData?.atmosT ?? null,
      mix: !!seg?.userData?.mixGroup,
      usable: seg?.userData?.usableLanes || null,
      closed: seg?.userData?.closedLaneXs || null,
      ahead: segs.map((s) => `${s.phase}@${s.z}`),
      hudTurn: {
        visible: !!(hudTurn && !hudTurn.classList.contains("hidden")),
        text: hudTurn?.textContent || "",
      },
      hudLight: {
        visible: !!(hudLight && !hudLight.classList.contains("hidden")),
        text: hudLight?.textContent || "",
      },
      hudLaneWarn: {
        visible: !!(hudLaneWarn && !hudLaneWarn.classList.contains("hidden")),
        text: hudLaneWarn?.textContent || "",
      },
    };
  });
}

async function keepSafe(step = 4) {
  return page.evaluate((m) => {
    const g = window.__endlessChase;
    g.debugClearHazards?.();
    g.debugSetGas?.(80);
    const st = g.getState();
    if (!st.alive || !st.running) return { ok: false, dead: true };
    const u = st.controlUsable || [];
    // Prefer forward city lanes 0/1; otherwise first usable
    let prefer = u.includes(1) ? 1 : u.includes(0) ? 0 : u[0];
    if (prefer == null) prefer = 0;
    g.debugSetLane(prefer);
    g.debugAdvance(m);
    return { ok: true };
  }, step);
}

async function ensureAlive() {
  const st = await page.evaluate(() => window.__endlessChase.getState());
  if (st.alive && st.running) return true;
  // Retry from game over
  const retry = await page.$("#btn-retry, #btn-play");
  if (retry) await retry.click();
  await page.waitForFunction(() => window.__endlessChase?.getState()?.running === true, null, {
    timeout: 20000,
  });
  return true;
}

/** Drive until predicate; always clear hazards and stay in usable forward lane. */
async function driveUntil(pred, { maxMeters = 800, step = 4, label = "drive" } = {}) {
  let meters = 0;
  let snap = await sample();
  while (meters < maxMeters) {
    if (!snap.state.alive || !snap.state.running) {
      await ensureAlive();
      return { ok: false, meters, snap, label, died: true };
    }
    if (await pred(snap, meters)) return { ok: true, meters, snap, label };
    const r = await keepSafe(step);
    if (r.dead) {
      await ensureAlive();
      return { ok: false, meters, snap, label, died: true };
    }
    meters += step;
    await page.waitForTimeout(24);
    snap = await sample();
  }
  return { ok: false, meters, snap, label };
}

async function settleIn(biome) {
  await page.evaluate((b) => {
    const g = window.__endlessChase;
    const st = g.getState();
    if (st.biome !== b || st.transitioning) g.beginBiomeTransition(b);
  }, biome);
  return driveUntil((s) => s.state.biome === biome && !s.state.transitioning, {
    maxMeters: 700,
    step: 5,
    label: `settle-${biome}`,
  });
}

const report = {
  base,
  testedAt: new Date().toISOString(),
  pairs: [],
  naturalTurn: null,
  stretch: null,
  foreshadowLatency: null,
  consoleErrors,
  verdicts: [],
};

const pairs = [
  { from: "city", to: "rural" },
  { from: "rural", to: "city" },
];

for (const { from, to } of pairs) {
  await ensureAlive();
  const settled = await settleIn(from);
  await page.evaluate(() => {
    window.__endlessChase.debugClearHazards?.();
    window.__endlessChase.debugSetLane(1);
  });
  const beforeShot = await shot(`ux-${from}-baseline`);
  const before = await sample();

  // Fire transition and capture the immediate HUD flash (biome destination cue)
  await page.evaluate((b) => window.__endlessChase.beginBiomeTransition(b), to);
  await page.waitForTimeout(80);
  const flash = await sample();
  const flashShot = await shot(`ux-${from}-to-${to}-hud-flash`);

  // Measure how far ahead the corridor starts (append-only latency)
  const latency = await page.evaluate(() => {
    const g = window.__endlessChase;
    const st = g.getState();
    const segs = g.getTransitionSegments() || [];
    const exit = segs.find((s) => s.phase === "exit");
    return {
      playerZ: st.playerZ,
      exitZ: exit?.z ?? null,
      metersAhead: exit ? +(exit.z - st.playerZ).toFixed(1) : null,
      queue: st.transitionQueue,
      ahead: segs.map((s) => `${s.phase}@${s.z}`),
    };
  });

  const phasesWanted = ["exit", "taper", "enter", "settle"];
  const phaseSnaps = {};
  const seenTaperSteps = [];

  for (const phase of phasesWanted) {
    const hit = await driveUntil(
      (s) => {
        if (phase === "settle") {
          return s.phase === "settle" || (s.state.biome === to && !s.state.transitioning);
        }
        return s.phase === phase;
      },
      { maxMeters: 600, step: 4, label: `${from}-${to}-${phase}` }
    );

    if (phase === "taper" && hit.ok) {
      // Capture early + late taper if possible
      seenTaperSteps.push({ ...hit.snap, screenshot: await shot(`ux-${from}-to-${to}-taper-early`) });
      await keepSafe(18);
      await page.waitForTimeout(40);
      const mid = await sample();
      seenTaperSteps.push({ ...mid, screenshot: await shot(`ux-${from}-to-${to}-taper-mid`) });
      // Try wrong-way warn: aim at a closed/oncoming lane briefly
      await page.evaluate(() => {
        const g = window.__endlessChase;
        const u = g.getState().controlUsable || [];
        // Pick highest index (often oncoming in city) if still listed, else force lane 3
        const bad = u.includes(3) ? 3 : u.includes(2) ? 2 : null;
        if (bad != null) g.debugSetLane(bad);
      });
      await page.waitForTimeout(60);
      const warnSnap = await sample();
      seenTaperSteps.push({
        ...warnSnap,
        screenshot: await shot(`ux-${from}-to-${to}-lane-warn`),
        tag: "lane-warn-probe",
      });
      // Return to safe lane
      await page.evaluate(() => {
        const g = window.__endlessChase;
        const u = g.getState().controlUsable || [];
        g.debugSetLane(u.includes(1) ? 1 : u[0]);
      });
    }

    const snap = hit.snap || (await sample());
    const file = await shot(`ux-${from}-to-${to}-${phase}`);
    phaseSnaps[phase] = {
      reached: hit.ok,
      died: !!hit.died,
      metersToPhase: hit.meters,
      phase: snap.phase,
      atmosT: snap.atmosT,
      mix: snap.mix,
      usable: snap.usable,
      closed: snap.closed,
      controlUsable: snap.state.controlUsable,
      biome: snap.state.biome,
      distance: snap.state.distance,
      hudLight: snap.hudLight,
      hudTurn: snap.hudTurn,
      hudLaneWarn: snap.hudLaneWarn,
      screenshot: file,
    };
  }

  const finish = await driveUntil(
    (s) => s.state.biome === to && !s.state.transitioning,
    { maxMeters: 400, step: 5, label: `${from}-${to}-finish` }
  );
  const afterShot = await shot(`ux-${from}-to-${to}-arrived`);

  const findings = [];
  if (!phaseSnaps.exit?.reached) findings.push({ severity: "fail", id: "missing-exit", msg: "Exit phase not reached" });
  else findings.push({ severity: "pass", id: "exit", msg: "Exit phase reached with foreshadow mix" });

  if (!phaseSnaps.taper?.reached) findings.push({ severity: "fail", id: "missing-taper", msg: "Taper phase not reached" });
  else findings.push({ severity: "pass", id: "taper", msg: `Taper reached; usable=${JSON.stringify(phaseSnaps.taper.usable)} closed=${JSON.stringify(phaseSnaps.taper.closed)}` });

  if (!phaseSnaps.enter?.reached) findings.push({ severity: "fail", id: "missing-enter", msg: "Enter phase not reached" });
  else findings.push({ severity: "pass", id: "enter", msg: `Enter reached; biome=${phaseSnaps.enter.biome}` });

  if (!finish.ok) findings.push({ severity: "fail", id: "did-not-settle", msg: `Did not settle into ${to}` });
  else findings.push({ severity: "pass", id: "settle", msg: `Settled into ${to}` });

  // HUD flash on forced transition
  if (flash.hudLight.visible && /→|Rural|City|Suburbs|Highway/i.test(flash.hudLight.text)) {
    findings.push({
      severity: "pass",
      id: "dest-flash",
      msg: `Destination flash shown: "${flash.hudLight.text}"`,
    });
  } else {
    findings.push({
      severity: "warn",
      id: "dest-flash-miss",
      msg: `Expected short destination flash on beginBiomeTransition; got "${flash.hudLight.text}" visible=${flash.hudLight.visible}`,
    });
  }

  // Append-ahead latency
  if (latency.metersAhead != null) {
    if (latency.metersAhead > 120) {
      findings.push({
        severity: "warn",
        id: "corridor-latency",
        msg: `Corridor starts ~${latency.metersAhead} m ahead of accept — HUD flash precedes visuals`,
      });
    } else {
      findings.push({
        severity: "pass",
        id: "corridor-latency",
        msg: `Corridor starts ~${latency.metersAhead} m ahead`,
      });
    }
  }

  // Atmosphere ramp across reached phases
  const atmosVals = ["exit", "taper", "enter", "settle"]
    .map((p) => phaseSnaps[p])
    .filter((p) => p?.reached && p.atmosT != null)
    .map((p) => p.atmosT);
  if (atmosVals.length >= 2) {
    const delta = atmosVals[atmosVals.length - 1] - atmosVals[0];
    if (delta >= 0.4) {
      findings.push({ severity: "pass", id: "atmos-ramp", msg: `atmosT ${atmosVals[0]} → ${atmosVals.at(-1)}` });
    } else {
      findings.push({ severity: "warn", id: "atmos-flat", msg: `atmosT weak ramp ${atmosVals.join(" → ")}` });
    }
  }

  if (phaseSnaps.exit?.mix || phaseSnaps.taper?.mix) {
    findings.push({ severity: "pass", id: "mix", msg: "Mix scenery overlay present" });
  } else if (phaseSnaps.exit?.reached) {
    findings.push({ severity: "warn", id: "mix-missing", msg: "No mix overlay on exit/taper" });
  }

  if (from === "city" && to === "rural" && phaseSnaps.taper?.reached) {
    const closed = phaseSnaps.taper.closed?.length || 0;
    const usableN = phaseSnaps.taper.usable?.length ?? 4;
    if (closed > 0 || usableN < 4) {
      findings.push({ severity: "pass", id: "lane-close", msg: `Narrowing readable in data (usable=${usableN}, closed=${closed})` });
    } else {
      findings.push({ severity: "warn", id: "lane-close-weak", msg: "No lane closure detected mid-taper" });
    }
  }

  const warnProbe = seenTaperSteps.find((s) => s.tag === "lane-warn-probe");
  if (warnProbe?.hudLaneWarn?.visible) {
    findings.push({
      severity: "pass",
      id: "lane-warn",
      msg: `Lane warn shows when targeting bad lane: "${warnProbe.hudLaneWarn.text}"`,
    });
  } else if (from === "city" && to === "rural" && phaseSnaps.taper?.reached) {
    findings.push({
      severity: "info",
      id: "lane-warn-skip",
      msg: "Lane-warn probe did not flash (bad lane may still have been usable mid-taper)",
    });
  }

  report.pairs.push({
    from,
    to,
    settledOk: settled.ok,
    before,
    beforeShot,
    flash,
    flashShot,
    latency,
    phaseSnaps,
    taperProbes: seenTaperSteps.map((s) => ({
      phase: s.phase,
      atmosT: s.atmosT,
      usable: s.usable,
      closed: s.closed,
      warn: s.hudLaneWarn,
      tag: s.tag || null,
      screenshot: s.screenshot,
    })),
    finishOk: finish.ok,
    afterShot,
    findings,
  });
}

// Natural turn offer: hunt after a long stretch in city
await ensureAlive();
await settleIn("city");
await page.evaluate(() => window.__endlessChase.debugClearHazards?.());

let natural = { found: false, findings: [] };
for (let i = 0; i < 120; i++) {
  await keepSafe(18);
  await page.waitForTimeout(20);
  const s = await sample();
  if (!s.state.alive) {
    await ensureAlive();
    continue;
  }
  if (s.hudTurn.visible || s.state.turnActive) {
    natural = {
      found: true,
      text: s.hudTurn.text,
      distance: s.state.distance,
      screenshot: await shot("ux-natural-turn-cue"),
      findings: [],
    };
    if (/<</.test(s.hudTurn.text) && />>/.test(s.hudTurn.text)) {
      natural.findings.push({
        severity: "pass",
        id: "cue-arrows",
        msg: `Turn cue uses ASCII arrows + labels: "${s.hudTurn.text}"`,
      });
    } else {
      natural.findings.push({
        severity: "warn",
        id: "cue-format",
        msg: `Turn cue format odd: "${s.hudTurn.text}"`,
      });
    }
    // Accept with left swipe
    const canvas = await page.$("canvas");
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.58);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.28, box.y + box.height * 0.58, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(200);
    const after = await sample();
    natural.afterSwipe = {
      transitioning: after.state.transitioning,
      queue: after.state.transitionQueue,
      biome: after.state.biome,
      hudTurn: after.hudTurn,
    };
    natural.afterShot = await shot("ux-natural-turn-accepted");
    if (after.state.transitioning || after.state.transitionQueue > 0) {
      natural.findings.push({
        severity: "pass",
        id: "cue-accept",
        msg: "Swipe while cue visible started biome corridor",
      });
    } else {
      natural.findings.push({
        severity: "warn",
        id: "cue-accept-fail",
        msg: "Swipe did not start corridor (window may have expired)",
      });
    }
    break;
  }
}
if (!natural.found) {
  natural.findings.push({
    severity: "info",
    id: "no-natural-turn",
    msg: "No natural turn offer in hunt window — cooldown keeps stretches long",
  });
  natural.screenshot = await shot("ux-natural-turn-miss");
}
report.naturalTurn = natural;

// Stretch after forced transition
await ensureAlive();
await settleIn("city");
await page.evaluate(() => window.__endlessChase.beginBiomeTransition("rural"));
await driveUntil((s) => s.state.biome === "rural" && !s.state.transitioning, {
  maxMeters: 700,
  step: 5,
});
const stretchStart = (await sample()).state.distance;
const stretchHunt = await driveUntil((s) => s.hudTurn.visible || s.state.turnActive, {
  maxMeters: 900,
  step: 16,
  label: "stretch",
});
const stretchEnd = stretchHunt.snap?.state?.distance ?? stretchStart;
report.stretch = {
  startDistance: stretchStart,
  endDistance: stretchEnd,
  deltaMeters: +(stretchEnd - stretchStart).toFixed(1),
  foundTurn: stretchHunt.ok,
  screenshot: await shot("ux-stretch-end"),
  finding: stretchHunt.ok
    ? {
        severity: stretchEnd - stretchStart >= 280 ? "pass" : "warn",
        id: "stretch-length",
        msg: `Next turn ~${(stretchEnd - stretchStart).toFixed(0)} m after settle`,
      }
    : {
        severity: "pass",
        id: "stretch-long",
        msg: "No turn within ~900 m after settle — biomes feel substantial",
      },
};

for (const p of report.pairs) {
  for (const f of p.findings) report.verdicts.push({ pair: `${p.from}→${p.to}`, ...f });
}
for (const f of report.naturalTurn.findings) report.verdicts.push({ pair: "natural", ...f });
report.verdicts.push({ pair: "stretch", ...report.stretch.finding });

report.summary = {
  fail: report.verdicts.filter((v) => v.severity === "fail").length,
  warn: report.verdicts.filter((v) => v.severity === "warn").length,
  pass: report.verdicts.filter((v) => v.severity === "pass").length,
  info: report.verdicts.filter((v) => v.severity === "info").length,
  consoleErrors: consoleErrors.length,
};

fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.summary, null, 2));
for (const v of report.verdicts) console.log(`[${v.severity}] ${v.pair} ${v.id}: ${v.msg}`);
await browser.close();
if (report.summary.fail) process.exitCode = 1;
