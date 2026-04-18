/**
 * Thin wrapper around Web Audio API for workflow notifications.
 *
 * Browser autoplay policy blocks audio until the user interacts with the page.
 * Call `primeAudioContext()` inside any user-gesture handler (button click, key
 * press, etc.) as early as possible in the session.  That single gesture
 * "unlocks" the AudioContext so subsequent playSound() calls fire automatically
 * without needing another gesture.
 *
 * Tones:
 *   success  → normal pitch (playbackRate 1.0)
 *   error    → lower pitch  (playbackRate 0.65)
 */

const SOUND_SRC = "/sounds/notification.mp3";

let audioCtx: AudioContext | null = null;
let cachedBuffer: AudioBuffer | null = null;
let loadPromise: Promise<AudioBuffer> | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx || audioCtx.state === "closed") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    audioCtx = new AC() as AudioContext;
    cachedBuffer = null;
    loadPromise = null;
  }
  return audioCtx;
}

/**
 * Call this inside ANY user-gesture handler (e.g. first button click) so the
 * AudioContext is already resumed before we need to play a notification.
 */
export function primeAudioContext(): void {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    // Pre-load the sample in the background so the first play is instant.
    void loadBuffer();
  } catch {
    // Non-critical – ignore.
  }
}

async function loadBuffer(): Promise<AudioBuffer> {
  if (cachedBuffer) return cachedBuffer;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ctx = getAudioContext();
    const res = await fetch(SOUND_SRC);
    const arrayBuf = await res.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuf);
    cachedBuffer = decoded;
    return decoded;
  })();

  return loadPromise;
}

async function playSound(opts: { playbackRate?: number; gain?: number }): Promise<void> {
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();

    const buffer = await loadBuffer();

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = opts.playbackRate ?? 1.0;

    const gainNode = ctx.createGain();
    gainNode.gain.value = opts.gain ?? 0.85;

    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    source.start(0);
  } catch {
    // Sound is non-critical; swallow errors silently.
  }
}

/** Bell ding at normal pitch — workflow finished successfully. */
export function playSuccessSound(): void {
  void playSound({ playbackRate: 1.0, gain: 0.85 });
}

/** Same bell at lower pitch — step errored out after retries. */
export function playErrorSound(): void {
  void playSound({ playbackRate: 0.65, gain: 1.0 });
}
