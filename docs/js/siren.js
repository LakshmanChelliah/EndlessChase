/**
 * Procedural police siren (Web Audio API) — alternating hi/lo yelp.
 *
 * Flow: unlockSirenAudio() inside Play/Retry gesture → startSiren() →
 * setSirenVolume() from heat bar (see SIREN_* in constants.js).
 * Invariant: AudioContext must be created/resumed in a user gesture (iOS).
 */

let ctx = null;
let master = null;
let osc = null;
let oscGain = null;
let yelpTimer = null;
let playing = false;
let hiTone = true;
let targetVol = 0;
let appliedVol = -1;
let unlocked = false;

const FREQ_LO = 680;
const FREQ_HI = 980;
const YELP_MS = 280;
/** Peak output level (0–1). Kept high so the chase is obvious on phone speakers. */
const MAX_GAIN = 0.9;
const VOL_EPS = 0.01;

function ensureCtx() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  return ctx;
}

/** Shared AudioContext for other procedural SFX (coins, etc.). */
export function getGameAudioContext() {
  return ensureCtx();
}

/**
 * Must run synchronously inside a click/touch/pointer handler.
 * Creates the context, resumes it, and plays a tiny silent buffer —
 * required on iOS/Safari to unlock audio.
 */
export function unlockSirenAudio() {
  const c = ensureCtx();
  if (!c) return false;

  // Resume is async; kick it immediately from the gesture.
  if (c.state === "suspended") {
    c.resume().then(() => { unlocked = true; }).catch(() => {});
  } else {
    unlocked = true;
  }

  // Silent buffer play — the reliable iOS unlock pattern
  try {
    const buf = c.createBuffer(1, 1, c.sampleRate || 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch (_) { /* ignore */ }

  return c.state === "running" || unlocked;
}

/** Keep trying to resume if the browser left us suspended. */
export function resumeSirenAudio() {
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().then(() => { unlocked = true; }).catch(() => {});
  } else if (ctx.state === "running") {
    unlocked = true;
  }
}

function buildGraph() {
  if (!ctx || !master) return;

  // Tear down any leftover nodes
  teardownNodes();

  osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = FREQ_HI;

  oscGain = ctx.createGain();
  oscGain.gain.value = 0.55;

  // Mild low-pass so square isn't piercing/harsh on laptop speakers
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 3200;
  filter.Q.value = 0.5;

  osc.connect(filter);
  filter.connect(oscGain);
  oscGain.connect(master);

  const t = ctx.currentTime;
  osc.start(t);
  hiTone = true;
  scheduleYelp();
}

function scheduleYelp() {
  clearYelp();
  yelpTimer = setInterval(() => {
    if (!osc || !ctx) return;
    hiTone = !hiTone;
    const f = hiTone ? FREQ_HI : FREQ_LO;
    try {
      const now = ctx.currentTime;
      osc.frequency.cancelScheduledValues(now);
      osc.frequency.setValueAtTime(f, now);
    } catch (_) { /* ignore */ }
  }, YELP_MS);
}

function clearYelp() {
  if (yelpTimer != null) {
    clearInterval(yelpTimer);
    yelpTimer = null;
  }
}

function teardownNodes() {
  clearYelp();
  const o = osc;
  const g = oscGain;
  osc = null;
  oscGain = null;
  try {
    if (o) { o.stop(); o.disconnect(); }
  } catch (_) { /* ignore */ }
  try {
    if (g) g.disconnect();
  } catch (_) { /* ignore */ }
}

/** Begin the looping siren (idempotent). */
export function startSiren() {
  unlockSirenAudio();
  if (!ensureCtx()) return;
  resumeSirenAudio();
  if (playing) return;
  buildGraph();
  playing = true;
  appliedVol = -1;
  try {
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0, ctx.currentTime);
  } catch (_) { /* ignore */ }
}

/** Stop and tear down the siren. */
export function stopSiren() {
  targetVol = 0;
  appliedVol = -1;
  if (!playing) return;
  playing = false;
  const t = ctx ? ctx.currentTime : 0;
  try {
    if (master) {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(0, t);
    }
  } catch (_) { /* ignore */ }
  teardownNodes();
}

/**
 * @param {number} level 0–1 desired loudness
 */
export function setSirenVolume(level) {
  targetVol = Math.max(0, Math.min(1, level));
  if (!playing || !ctx || !master) return;
  resumeSirenAudio();
  const next = targetVol * MAX_GAIN;
  if (Math.abs(next - appliedVol) < VOL_EPS) return;
  const now = ctx.currentTime;
  try {
    master.gain.cancelScheduledValues(now);
    // Short linear ramp — more reliable than setTargetAtTime across browsers
    const cur = appliedVol < 0 ? 0 : appliedVol;
    master.gain.setValueAtTime(cur, now);
    master.gain.linearRampToValueAtTime(next, now + 0.06);
  } catch (_) {
    try { master.gain.value = next; } catch (__) { /* ignore */ }
  }
  appliedVol = next;
}

export function isSirenPlaying() {
  return playing;
}

export function getSirenDebug() {
  return {
    playing,
    unlocked,
    ctxState: ctx ? ctx.state : "none",
    targetVol: +targetVol.toFixed(3),
    appliedVol: +appliedVol.toFixed(3),
  };
}

/**
 * Volume from the HUD police distance bar (+ optional opening boost).
 *
 * `bar` is heat/100 — the same 0–100% fill shown on the police proximity meter.
 *   • bar < onset (default 60%) → silent (e.g. 30% fill = no sirens)
 *   • bar >= onset → sirens on; louder as the bar climbs (e.g. 75% > 60%)
 *
 * @param {{ bar?: number, opening?: number }} p
 * @param {{ onset?: number, volNear?: number, volOnset?: number }} [cfg]
 */
export function sirenLevelFromProximity(p, cfg = {}) {
  const onset = cfg.onset ?? 0.6;
  const volNear = cfg.volNear ?? 0.9;
  const volOnset = cfg.volOnset ?? 0.3;
  const opening = Math.max(0, Math.min(1, p.opening || 0));
  const bar = Math.max(0, Math.min(1, p.bar ?? 0));

  let barVol = 0;
  if (bar >= onset) {
    // Incremental loudness from onset → full bar
    const u = (bar - onset) / Math.max(0.001, 1 - onset);
    barVol = volOnset + (volNear - volOnset) * Math.max(0, Math.min(1, u));
  }

  // Opening can only raise volume (establishes the chase at run start)
  return Math.max(barVol, opening);
}
