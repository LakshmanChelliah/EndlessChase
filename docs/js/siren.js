/**
 * Procedural police siren (Web Audio API) — alternating hi/lo yelp.
 *
 * Flow: unlockSirenAudio() inside Play/Retry gesture → startSiren() →
 * setSirenVolume() from heat bar (see SIREN_* in constants.js).
 * Invariant: AudioContext must be created/resumed in a user gesture (iOS).
 * Shares AudioContext with sfx.js via audio.js (separate master buses).
 */

import {
  ensureAudioContext, unlockAudio, resumeAudio, getAudioContext,
} from "./audio.js?v=1";

let master = null;
let osc = null;
let oscGain = null;
let yelpTimer = null;
let playing = false;
let hiTone = true;
let targetVol = 0;
let appliedVol = -1;

const FREQ_LO = 680;
const FREQ_HI = 980;
const YELP_MS = 280;
/** Peak output level (0–1). Kept high so the chase is obvious on phone speakers. */
const MAX_GAIN = 0.9;
const VOL_EPS = 0.01;

function ensureMaster() {
  const ctx = ensureAudioContext();
  if (!ctx) return null;
  if (!master) {
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** @deprecated Prefer unlockAudio from audio.js; kept for call-site compat. */
export function unlockSirenAudio() {
  return unlockAudio();
}

/** @deprecated Prefer resumeAudio from audio.js; kept for call-site compat. */
export function resumeSirenAudio() {
  resumeAudio();
}

function buildGraph() {
  const ctx = getAudioContext();
  if (!ctx || !master) return;

  teardownNodes();

  osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = FREQ_HI;

  oscGain = ctx.createGain();
  oscGain.gain.value = 0.55;

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
    const ctx = getAudioContext();
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
  unlockAudio();
  if (!ensureMaster()) return;
  resumeAudio();
  if (playing) return;
  buildGraph();
  playing = true;
  appliedVol = -1;
  const ctx = getAudioContext();
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
  const ctx = getAudioContext();
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
  const ctx = getAudioContext();
  if (!playing || !ctx || !master) return;
  resumeAudio();
  const next = targetVol * MAX_GAIN;
  if (Math.abs(next - appliedVol) < VOL_EPS) return;
  const now = ctx.currentTime;
  try {
    master.gain.cancelScheduledValues(now);
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
  const ctx = getAudioContext();
  return {
    playing,
    unlocked: !!ctx && ctx.state === "running",
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
    const u = (bar - onset) / Math.max(0.001, 1 - onset);
    barVol = volOnset + (volNear - volOnset) * Math.max(0, Math.min(1, u));
  }

  return Math.max(barVol, opening);
}
