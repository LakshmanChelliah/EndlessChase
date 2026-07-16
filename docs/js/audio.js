/**
 * Shared Web Audio context for siren + SFX.
 * Unlock must run inside a user gesture (iOS/Safari).
 */

let ctx = null;
let unlocked = false;

export function getAudioContext() {
  return ctx;
}

export function ensureAudioContext() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

/**
 * Must run synchronously inside a click/touch/pointer handler.
 * Creates the context, resumes it, and plays a tiny silent buffer.
 */
export function unlockAudio() {
  const c = ensureAudioContext();
  if (!c) return false;

  if (c.state === "suspended") {
    c.resume().then(() => { unlocked = true; }).catch(() => {});
  } else {
    unlocked = true;
  }

  try {
    const buf = c.createBuffer(1, 1, c.sampleRate || 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
  } catch (_) { /* ignore */ }

  return c.state === "running" || unlocked;
}

export function resumeAudio() {
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().then(() => { unlocked = true; }).catch(() => {});
  } else if (ctx.state === "running") {
    unlocked = true;
  }
}

export function isAudioUnlocked() {
  return unlocked && !!ctx && ctx.state === "running";
}
