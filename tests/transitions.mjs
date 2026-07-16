/**
 * Gate A — transition corridor structural checks for all 6 directed biome pairs.
 * Usage: node tests/transitions.mjs
 */
import {
  buildTransitionPlan,
  getTransitionDef,
  pickTurnBiomes,
} from "../docs/js/worldgen.js";
import { layoutFor, TRANSITIONS } from "../docs/js/constants.js";

const PAIRS = [
  ["city", "rural"],
  ["city", "highway"],
  ["rural", "city"],
  ["highway", "city"],
  ["rural", "highway"],
  ["highway", "rural"],
];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function phasesOf(plan) {
  return plan.map((s) => s.phase);
}

function checkPair(from, to) {
  const def = getTransitionDef(from, to);
  const plan = buildTransitionPlan(from, to);
  const fromL = layoutFor(from);
  const toL = layoutFor(to);
  const narrowing = fromL.width > toL.width;
  const widening = fromL.width < toL.width;

  assert(plan.length >= 6, `${from}→${to}: plan too short (${plan.length})`);
  const phases = phasesOf(plan);
  assert(phases[0] === "exit", `${from}→${to}: first phase must be exit`);
  assert(phases[phases.length - 1] === "settle", `${from}→${to}: last must be settle`);
  assert(phases.filter((p) => p === "settle").length === 2, `${from}→${to}: need settle×2`);
  assert(phases.includes("enter"), `${from}→${to}: missing enter`);

  const tapers = plan.filter((s) => s.phase === "taper");
  const expectedTaper = narrowing ? 5 : 3;
  assert(
    tapers.length === expectedTaper,
    `${from}→${to}: expected ${expectedTaper} taper steps, got ${tapers.length} (def=${def.taperSteps})`
  );

  // Phase order: exit, taper*, enter, settle, settle
  const expected = ["exit", ...Array(tapers.length).fill("taper"), "enter", "settle", "settle"];
  assert(
    phases.join(",") === expected.join(","),
    `${from}→${to}: bad phase order ${phases.join(">")}`
  );

  // Width monotonicity
  if (narrowing) {
    for (let i = 1; i < plan.length; i++) {
      assert(
        plan[i].widthEnd <= plan[i - 1].widthStart + 0.01 || plan[i].phase === "enter" || plan[i].phase === "settle",
        `${from}→${to}: width should not grow while narrowing at step ${i}`
      );
    }
    assert(plan[0].widthStart === fromL.width, `${from}→${to}: exit width`);
    const enter = plan.find((s) => s.phase === "enter");
    assert(enter.widthEnd === toL.width, `${from}→${to}: enter width`);
    // Closures before enter
    const lastTaper = tapers[tapers.length - 1];
    assert(
      lastTaper.closedLaneXs.length > 0,
      `${from}→${to}: last taper must close outer lanes`
    );
    assert(
      lastTaper.usableLanes.length === toL.count,
      `${from}→${to}: last taper usable should match destination count`
    );
    assert(
      plan.some((s) => (s.newlyClosedXs || []).length > 0),
      `${from}→${to}: newlyClosedXs must appear`
    );
    assert(
      plan.some((s) => (s.goreXs || []).length > 0),
      `${from}→${to}: goreXs must appear`
    );
    assert(
      plan.some((s) => s.arrowMode === "lane_ends"),
      `${from}→${to}: lane_ends arrows required`
    );
  }

  if (widening) {
    assert(tapers.length === 3, `${from}→${to}: widen taper count`);
    // Outers appear in usableLanes before settle
    const late = [...tapers, plan.find((s) => s.phase === "enter")];
    assert(
      late.some((s) => (s.usableLanes || []).length >= toL.count),
      `${from}→${to}: destination lanes must open by enter`
    );
    assert(
      plan.some((s) => s.arrowMode === "lane_opens"),
      `${from}→${to}: lane_opens arrows required`
    );
  }

  if (!narrowing && !widening) {
    for (const s of plan) {
      assert(
        Math.abs(s.widthStart - fromL.width) < 0.01 &&
          Math.abs(s.widthEnd - toL.width) < 0.01,
        `${from}→${to}: flat width expected`
      );
      assert(
        !(s.closedLaneXs && s.closedLaneXs.length),
        `${from}→${to}: no closures on flat pair`
      );
    }
  }

  // Smooth sceneryBlend / atmosT — no 0→1 single-tile jump mid-corridor
  const blendSteps = plan.filter((s) => s.phase !== "settle");
  for (let i = 1; i < blendSteps.length; i++) {
    const d = (blendSteps[i].sceneryBlend ?? 0) - (blendSteps[i - 1].sceneryBlend ?? 0);
    assert(d > -0.05, `${from}→${to}: sceneryBlend should not drop mid-corridor`);
    assert(d < 0.55, `${from}→${to}: sceneryBlend jump too large at ${i} (Δ=${d.toFixed(2)})`);
  }
  for (let i = 1; i < blendSteps.length; i++) {
    const d = (blendSteps[i].atmosT ?? 0) - (blendSteps[i - 1].atmosT ?? 0);
    assert(d > -0.05, `${from}→${to}: atmosT should not drop`);
    assert(d < 0.55, `${from}→${to}: atmosT jump too large at ${i} (Δ=${d.toFixed(2)})`);
  }
  const enter = plan.find((s) => s.phase === "enter");
  assert((enter.atmosT ?? 0) >= 0.9, `${from}→${to}: enter atmosT should be ≥0.9`);
  assert((enter.sceneryBlend ?? 0) >= 0.9, `${from}→${to}: enter sceneryBlend should be ≥0.9`);

  // Recipe fields present
  for (const s of plan) {
    assert(s.markStyle, `${from}→${to}: missing markStyle on ${s.phase}`);
    assert(s.fromBiome === from && s.toBiome === to, `${from}→${to}: from/to mismatch`);
    assert(typeof s.sceneryBlend === "number", `${from}→${to}: sceneryBlend`);
    assert(typeof s.atmosT === "number", `${from}→${to}: atmosT`);
  }

  // Mainline kinds (no decorative on-ramp R on corridor)
  for (const s of plan) {
    assert(s.kind === "" || s.kind == null, `${from}→${to}: corridor kind should be straight, got ${s.kind}`);
  }
}

// All TRANSITIONS keys covered
for (const key of Object.keys(TRANSITIONS)) {
  const def = TRANSITIONS[key];
  assert(def.from && def.to, `TRANSITIONS.${key} incomplete`);
}

for (const [from, to] of PAIRS) {
  checkPair(from, to);
}

// Turn graph reaches all biomes
const fromCity = pickTurnBiomes("city");
const fromRural = pickTurnBiomes("rural");
const fromHwy = pickTurnBiomes("highway");
assert(fromCity.left !== fromCity.right, "city turns should offer distinct biomes");
assert(
  new Set([fromCity.left, fromCity.right, fromRural.left, fromRural.right, fromHwy.left, fromHwy.right]).size === 3,
  "turn graph should include city, rural, and highway"
);

console.log(`TRANSITIONS_OK ${PAIRS.length} pairs + turn graph`);
