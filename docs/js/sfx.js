/**
 * Procedural NES-style one-shots and short loops (Web Audio API).
 * Shares AudioContext with siren.js via audio.js — separate SFX bus.
 *
 * IDs: coin | gasFill | gasFull | gasLow | gasCritical | crash | arrested | boost | nearMiss | uiBlip
 */

import {
  ensureAudioContext, unlockAudio, resumeAudio, getAudioContext,
} from "./audio.js?v=1";

/** Catalog for preview UI / docs. */
export const SFX_CATALOG = [
  { id: "coin", label: "Coin collect", desc: "Bright short ascending square blip (~100ms)" },
  { id: "gasFill", label: "Gas filling", desc: "Soft rising triangle + noise glug (loop while held)" },
  { id: "gasFull", label: "Gas tank full", desc: "Quick rising arpeggio — tank sealed" },
  { id: "gasLow", label: "Low gas warning", desc: "Soft two-tone warning chime (edge once)" },
  { id: "gasCritical", label: "Critical gas", desc: "Faster urgent beep (edge once)" },
  { id: "crash", label: "Crash / wreck", desc: "Noise burst + falling pitch impact" },
  { id: "arrested", label: "Arrested / bust", desc: "Descending square sting + siren chirp" },
  { id: "boost", label: "Red-light boost", desc: "Power-up rising square sweep" },
  { id: "nearMiss", label: "Near miss", desc: "Soft whoosh / high click" },
  { id: "uiBlip", label: "UI select", desc: "Tiny menu select blip" },
];

let bus = null;
let gasFillNodes = null;

function ensureBus() {
  const ctx = ensureAudioContext();
  if (!ctx) return null;
  if (!bus) {
    bus = ctx.createGain();
    bus.gain.value = 0.85;
    bus.connect(ctx.destination);
  }
  return ctx;
}

function tone(freq, {
  type = "square",
  start = 0,
  dur = 0.1,
  gain = 0.22,
  freqEnd = null,
  attack = 0.005,
  release = 0.04,
} = {}) {
  const ctx = getAudioContext();
  if (!ctx || !bus) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd != null) {
    osc.frequency.linearRampToValueAtTime(freqEnd, t0 + dur);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.setValueAtTime(gain, t0 + Math.max(attack, dur - release));
  g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(bus);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noiseBurst({
  start = 0,
  dur = 0.18,
  gain = 0.35,
  cutoff = 1800,
  cutoffEnd = 400,
} = {}) {
  const ctx = getAudioContext();
  if (!ctx || !bus) return;
  const t0 = ctx.currentTime + start;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(cutoff, t0);
  filter.frequency.exponentialRampToValueAtTime(Math.max(80, cutoffEnd), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(bus);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

function playCoin() {
  tone(880, { type: "square", dur: 0.055, gain: 0.18, freqEnd: 1320, release: 0.03 });
  tone(1320, { type: "square", start: 0.05, dur: 0.07, gain: 0.14, freqEnd: 1760, release: 0.04 });
}

function playGasFull() {
  tone(392, { type: "triangle", dur: 0.07, gain: 0.2 });
  tone(523, { type: "triangle", start: 0.06, dur: 0.07, gain: 0.2 });
  tone(659, { type: "triangle", start: 0.12, dur: 0.07, gain: 0.2 });
  tone(784, { type: "square", start: 0.18, dur: 0.12, gain: 0.16, release: 0.06 });
}

function playGasLow() {
  tone(520, { type: "square", dur: 0.09, gain: 0.14 });
  tone(390, { type: "square", start: 0.1, dur: 0.12, gain: 0.14, release: 0.05 });
}

function playGasCritical() {
  tone(720, { type: "square", dur: 0.06, gain: 0.16 });
  tone(720, { type: "square", start: 0.09, dur: 0.06, gain: 0.16 });
  tone(880, { type: "square", start: 0.18, dur: 0.1, gain: 0.18, release: 0.05 });
}

function playCrash() {
  noiseBurst({ dur: 0.22, gain: 0.45, cutoff: 2400, cutoffEnd: 280 });
  tone(180, { type: "sawtooth", dur: 0.28, gain: 0.22, freqEnd: 55, attack: 0.01, release: 0.12 });
  tone(90, { type: "square", start: 0.02, dur: 0.2, gain: 0.12, freqEnd: 40, release: 0.1 });
}

function playArrested() {
  tone(660, { type: "square", dur: 0.1, gain: 0.2, freqEnd: 330, release: 0.05 });
  tone(440, { type: "square", start: 0.1, dur: 0.12, gain: 0.18, freqEnd: 220, release: 0.06 });
  tone(880, { type: "square", start: 0.24, dur: 0.08, gain: 0.14 });
  tone(620, { type: "square", start: 0.34, dur: 0.08, gain: 0.14 });
  tone(880, { type: "square", start: 0.44, dur: 0.1, gain: 0.12, release: 0.06 });
  noiseBurst({ start: 0.05, dur: 0.12, gain: 0.18, cutoff: 1200, cutoffEnd: 500 });
}

function playBoost() {
  tone(220, { type: "square", dur: 0.18, gain: 0.16, freqEnd: 880, attack: 0.01, release: 0.05 });
  tone(440, { type: "triangle", start: 0.08, dur: 0.2, gain: 0.14, freqEnd: 1320, release: 0.08 });
}

function playNearMiss() {
  noiseBurst({ dur: 0.08, gain: 0.12, cutoff: 4000, cutoffEnd: 1800 });
  tone(1400, { type: "triangle", dur: 0.05, gain: 0.08, freqEnd: 900, release: 0.03 });
}

function playUiBlip() {
  tone(660, { type: "square", dur: 0.045, gain: 0.12, release: 0.025 });
}

function startGasFill() {
  if (gasFillNodes) return;
  const ctx = ensureBus();
  if (!ctx || !bus) return;
  resumeAudio();

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = 140;

  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 7;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 28;
  lfo.connect(lfoGain);
  lfoGain.connect(osc.frequency);

  const noiseLen = Math.floor(ctx.sampleRate * 0.5);
  const nbuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = nbuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = nbuf;
  noise.loop = true;
  const nFilter = ctx.createBiquadFilter();
  nFilter.type = "bandpass";
  nFilter.frequency.value = 420;
  nFilter.Q.value = 2.5;
  const nGain = ctx.createGain();
  nGain.gain.value = 0.05;

  const g = ctx.createGain();
  g.gain.value = 0;
  const now = ctx.currentTime;
  g.gain.linearRampToValueAtTime(0.2, now + 0.06);

  osc.connect(g);
  noise.connect(nFilter);
  nFilter.connect(nGain);
  nGain.connect(g);
  g.connect(bus);

  osc.start(now);
  lfo.start(now);
  noise.start(now);

  // Slow rise so the fill “climbs” while held
  osc.frequency.linearRampToValueAtTime(210, now + 4);

  gasFillNodes = { osc, lfo, noise, g, nGain, nFilter, lfoGain };
}

function stopGasFill() {
  if (!gasFillNodes) return;
  const ctx = getAudioContext();
  const { osc, lfo, noise, g, nGain, nFilter, lfoGain } = gasFillNodes;
  gasFillNodes = null;
  const now = ctx ? ctx.currentTime : 0;
  try {
    if (g && ctx) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0.0001, now + 0.05);
    }
  } catch (_) { /* ignore */ }
  const stopAt = now + 0.08;
  try { if (osc) osc.stop(stopAt); } catch (_) { /* ignore */ }
  try { if (lfo) lfo.stop(stopAt); } catch (_) { /* ignore */ }
  try { if (noise) noise.stop(stopAt); } catch (_) { /* ignore */ }
  setTimeout(() => {
    for (const n of [osc, lfo, noise, g, nGain, nFilter, lfoGain]) {
      try { n?.disconnect(); } catch (_) { /* ignore */ }
    }
  }, 120);
}

const ONE_SHOTS = {
  coin: playCoin,
  gasFull: playGasFull,
  gasLow: playGasLow,
  gasCritical: playGasCritical,
  crash: playCrash,
  arrested: playArrested,
  boost: playBoost,
  nearMiss: playNearMiss,
  uiBlip: playUiBlip,
};

/**
 * Play a named SFX. `gasFill` starts a loop — call stopSfx("gasFill") to end.
 * @param {string} id
 */
export function playSfx(id) {
  unlockAudio();
  if (!ensureBus()) return;
  resumeAudio();

  if (id === "gasFill") {
    startGasFill();
    return;
  }
  const fn = ONE_SHOTS[id];
  if (fn) fn();
}

/**
 * Stop a looping SFX (currently only gasFill).
 * @param {string} [id]
 */
export function stopSfx(id) {
  if (!id || id === "gasFill") stopGasFill();
}

/** Stop all loops (e.g. on run end). */
export function stopAllSfx() {
  stopGasFill();
}

export function unlockSfxAudio() {
  return unlockAudio();
}

export { unlockAudio, resumeAudio };
