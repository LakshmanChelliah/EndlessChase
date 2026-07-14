/**
 * Procedural police siren via Web Audio API.
 * Two-tone wail that loops; volume is driven by the game (distance / heat).
 */

let ctx = null;
let master = null;
let osc = null;
let gain = null;
let lfo = null;
let lfoGain = null;
let playing = false;
let targetVol = 0;
let currentVol = 0;

const BASE_FREQ = 780;
const WAIL_DEPTH = 420;
const WAIL_RATE = 0.55;
const MAX_GAIN = 0.42;
const RAMP_UP = 0.08;
const RAMP_DOWN = 0.18;

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

/** Call from a user gesture (Play click) so the AudioContext can start. */
export function unlockSirenAudio() {
  const c = ensureCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});
}

function buildGraph() {
  if (!ctx || !master) return;

  osc = ctx.createOscillator();
  osc.type = "sawtooth";

  gain = ctx.createGain();
  gain.gain.value = 0.22;

  // Soft low-pass so the sawtooth isn't harsh
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2200;
  filter.Q.value = 0.7;

  lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = WAIL_RATE;

  lfoGain = ctx.createGain();
  lfoGain.gain.value = WAIL_DEPTH;

  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);
  osc.frequency.value = BASE_FREQ;

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(master);

  const t = ctx.currentTime;
  osc.start(t);
  lfo.start(t);
}

/**
 * Begin the looping siren (idempotent). Does not set volume — call setSirenVolume.
 */
export function startSiren() {
  unlockSirenAudio();
  if (!ensureCtx()) return;
  if (playing) return;
  buildGraph();
  playing = true;
  currentVol = 0;
  master.gain.setValueAtTime(0, ctx.currentTime);
}

/** Stop and tear down the siren graph. */
export function stopSiren() {
  targetVol = 0;
  currentVol = 0;
  if (!playing) return;
  playing = false;
  const t = ctx ? ctx.currentTime : 0;
  try {
    if (master) master.gain.cancelScheduledValues(t);
    if (master) master.gain.setTargetAtTime(0, t, 0.05);
  } catch (_) { /* ignore */ }

  const o = osc;
  const l = lfo;
  const g = gain;
  osc = null;
  lfo = null;
  lfoGain = null;
  gain = null;

  // Allow a short fade before stopping nodes
  const stopAt = (t || 0) + 0.2;
  try {
    if (o) { o.stop(stopAt); o.disconnect(); }
    if (l) { l.stop(stopAt); l.disconnect(); }
    if (g) g.disconnect();
  } catch (_) { /* ignore */ }
}

/**
 * @param {number} level 0–1 desired loudness (pre-max-gain)
 */
export function setSirenVolume(level) {
  targetVol = Math.max(0, Math.min(1, level));
  if (!playing || !ctx || !master) return;
  const next = targetVol * MAX_GAIN;
  const now = ctx.currentTime;
  const tau = next > currentVol ? RAMP_UP : RAMP_DOWN;
  master.gain.cancelScheduledValues(now);
  master.gain.setTargetAtTime(next, now, tau);
  currentVol = next;
}

export function isSirenPlaying() {
  return playing;
}

/**
 * Map nearest-cop distance + heat + opening boost → 0–1 volume.
 * Closer cops and higher heat = louder.
 *
 * @param {{ dist: number|null, heat: number, opening: number, ambient?: number }} p
 * @param {{ near?: number, far?: number }} [cfg]
 */
export function sirenLevelFromProximity(p, cfg = {}) {
  const near = cfg.near ?? 4;
  const far = cfg.far ?? 48;
  const ambient = p.ambient ?? 0;
  const heatVol = Math.max(0, Math.min(1, (p.heat || 0) / 100));
  let distVol = 0;
  if (p.dist != null && Number.isFinite(p.dist)) {
    const t = (p.dist - near) / Math.max(0.001, far - near);
    distVol = 1 - Math.max(0, Math.min(1, t));
    // Smoothstep so mid-range stays audible
    distVol = distVol * distVol * (3 - 2 * distVol);
  }
  const opening = Math.max(0, Math.min(1, p.opening || 0));
  return Math.max(ambient, distVol, heatVol * 0.92, opening);
}
