/**
 * Short procedural SFX (Web Audio API).
 *
 * Shares the siren AudioContext so one unlock gesture covers chase + pickup sounds.
 * Coin cue: two-note ascending square blip (NES-style collectible).
 */

import { getGameAudioContext, unlockSirenAudio, resumeSirenAudio } from "./siren.js?v=9";

/** Peak coin loudness — below siren so pickups stay bright without drowning the chase. */
const COIN_GAIN = 0.22;
const NOTE_A = 1047; // C6
const NOTE_B = 1568; // G6
const NOTE_MS = 0.055;
const GAP_MS = 0.045;

/**
 * Play the coin-collect blip. Safe to call before unlock (no-op if context missing).
 * Overlapping calls are fine — each pickup schedules its own short nodes.
 */
export function playCoinPickup() {
  unlockSirenAudio();
  resumeSirenAudio();
  const c = getGameAudioContext();
  if (!c) return;

  const t0 = c.currentTime;
  const master = c.createGain();
  master.gain.value = COIN_GAIN;
  master.connect(c.destination);

  // Mild low-pass so square isn't harsh on phone speakers
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2800;
  filter.Q.value = 0.4;
  filter.connect(master);

  scheduleBeep(c, filter, NOTE_A, t0);
  scheduleBeep(c, filter, NOTE_B, t0 + NOTE_MS + GAP_MS);

  // Disconnect after both notes finish
  const doneAt = t0 + (NOTE_MS + GAP_MS) * 2 + 0.05;
  setTimeout(() => {
    try { master.disconnect(); } catch (_) { /* ignore */ }
    try { filter.disconnect(); } catch (_) { /* ignore */ }
  }, Math.ceil((doneAt - t0) * 1000) + 30);
}

function scheduleBeep(c, dest, freq, start) {
  const osc = c.createOscillator();
  osc.type = "square";
  osc.frequency.value = freq;

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(0.7, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + NOTE_MS);

  osc.connect(g);
  g.connect(dest);
  osc.start(start);
  osc.stop(start + NOTE_MS + 0.02);
}
