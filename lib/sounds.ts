/**
 * sounds.ts — Web Audio API synthesized sound effects.
 *
 * All sounds are synthesized programmatically — no audio files, no CDN,
 * no network requests, works offline.
 *
 * Browser autoplay policy: AudioContext requires a user gesture before
 * audio can play. All functions are safe to call — they silently no-op
 * if the context can't be created or resumed.
 *
 * Three sounds:
 *   playSpaceWhoosh()     — void/dimension entry (PREVIS SPACE nav)
 *   playPaperSound()      — paper/print rustle (storyboard load)
 *   playTypewriterClick() — subtle key click (script textarea keydown)
 */

// Shared AudioContext — created once, reused across all calls
let _ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!_ctx) {
      _ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (_ctx.state === "suspended") {
      _ctx.resume().catch(() => {});
    }
    return _ctx;
  } catch {
    return null;
  }
}

/**
 * Create a white noise buffer of the given duration.
 */
function createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
  const sampleRate  = ctx.sampleRate;
  const frameCount  = Math.floor(sampleRate * durationSec);
  const buffer      = ctx.createBuffer(1, frameCount, sampleRate);
  const data        = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

// ── Space Whoosh ──────────────────────────────────────────────────────────────
/**
 * Deep void whoosh — filtered noise sweep from low to high frequency.
 * Duration: ~800ms. Volume: subtle (0.18).
 * Triggered when user navigates to PREVIS SPACE.
 */
export function playSpaceWhoosh(): void {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const duration = 0.85;
    const now      = ctx.currentTime;

    // Noise source
    const buffer = createNoiseBuffer(ctx, duration + 0.1);
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Bandpass filter — sweeps from 80Hz to 2400Hz
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(80, now);
    filter.frequency.exponentialRampToValueAtTime(2400, now + duration * 0.7);
    filter.Q.setValueAtTime(1.2, now);

    // Low-pass to smooth the top end
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(3000, now);

    // Gain envelope — fade in fast, fade out slow
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.08);
    gain.gain.linearRampToValueAtTime(0.12, now + duration * 0.5);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(filter);
    filter.connect(lp);
    lp.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + duration + 0.05);
  } catch { /* silent fail */ }
}

// ── Paper Sound ───────────────────────────────────────────────────────────────
/**
 * Short paper/print rustle — high-frequency noise burst with fast decay.
 * Duration: ~320ms. Volume: very subtle (0.10).
 * Triggered when storyboard view mounts.
 */
export function playPaperSound(): void {
  const ctx = getCtx();
  if (!ctx) return;
  try {
    const duration = 0.32;
    const now      = ctx.currentTime;

    const buffer = createNoiseBuffer(ctx, duration + 0.05);
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // High-pass filter — paper is all high frequencies
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(4000, now);
    hp.Q.setValueAtTime(0.8, now);

    // Shelf to add crispness
    const shelf = ctx.createBiquadFilter();
    shelf.type = "highshelf";
    shelf.frequency.setValueAtTime(8000, now);
    shelf.gain.setValueAtTime(6, now);

    // Gain envelope — very fast attack, medium decay
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.10, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(hp);
    hp.connect(shelf);
    shelf.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + duration + 0.05);
  } catch { /* silent fail */ }
}

// ── Typewriter Click ──────────────────────────────────────────────────────────
/**
 * Subtle mechanical key click — very short noise transient.
 * Duration: ~40ms. Volume: barely audible (0.06).
 * Triggered on each keydown in the script textarea.
 *
 * Throttled internally: max one click per 30ms to avoid
 * overwhelming the AudioContext with rapid keypresses.
 */
let _lastClickTime = 0;

export function playTypewriterClick(): void {
  const ctx = getCtx();
  if (!ctx) return;

  const now = ctx.currentTime;
  // Throttle: skip if last click was < 30ms ago
  if (now - _lastClickTime < 0.03) return;
  _lastClickTime = now;

  try {
    const duration = 0.04;

    const buffer = createNoiseBuffer(ctx, duration + 0.01);
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    // Bandpass centred around typewriter click frequency (~1200Hz)
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(1200, now);
    bp.Q.setValueAtTime(3, now);

    // Gain envelope — instant attack, very fast decay
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    source.connect(bp);
    bp.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + duration + 0.01);
  } catch { /* silent fail */ }
}
