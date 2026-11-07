/**
 * On-device Piper speech, shared by the 3D assistant and the photo speaker.
 * Runs the engine (piperCore) in a background worker.
 */
import type { Progress } from '@mintplex-labs/piper-tts-web';
import { synthesizeHere, type PiperVoiceId } from './piperCore';

export { PIPER_VOICES, speechSupportIssue, synthesizeHere, type PiperVoiceId } from './piperCore';

/*
 * The model runs in a background worker. On the page's own thread every
 * sentence froze the screen for a moment (no multi-threading without special
 * page headers), so a talking face stopped mid-word while the next line was
 * being made.
 */
type Pending = {
  resolve: (b: Blob) => void;
  reject: (e: Error) => void;
  onProgress?: (p: Progress) => void;
  /** Reset on every sign of life; fires if the worker goes quiet. */
  watchdog: number;
};
let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, Pending>();
/** No word from the worker for this long = it is stuck. */
const WORKER_SILENCE_MS = 20000;

/** Give up on the worker for this page; waiting lines are made on the page. */
function abandonWorker() {
  workerBroken = true;
  worker?.terminate();
  worker = null;
  for (const [, job] of pending) { window.clearTimeout(job.watchdog); job.reject(new Error('worker-failed')); }
  pending.clear();
}

function arm(job: Pending) {
  window.clearTimeout(job.watchdog);
  job.watchdog = window.setTimeout(abandonWorker, WORKER_SILENCE_MS);
}

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./piperWorker.ts', import.meta.url), { type: 'module' });
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (e: MessageEvent) => {
    const { id, blob, error, progress } = e.data || {};
    const job = pending.get(id);
    if (!job) return;
    if (progress) { arm(job); job.onProgress?.(progress); return; }
    window.clearTimeout(job.watchdog);
    pending.delete(id);
    if (blob) { job.resolve(blob); return; }
    // The engine failed inside the worker: stop using it and make the voice
    // on the page instead, so the lesson never waits on a dead worker.
    console.warn('[voice] worker failed, using the page instead:', error);
    job.reject(new Error('worker-failed'));
    abandonWorker();
  };
  worker.onerror = () => abandonWorker();
  return worker;
}

function synthesizeInWorker(
  text: string,
  voice: PiperVoiceId,
  onProgress?: (progress: Progress) => void,
): Promise<Blob> {
  const w = getWorker();
  if (!w) return synthesizeHere(text, voice, onProgress);
  const id = nextId++;
  return new Promise<Blob>((resolve, reject) => {
    const job: Pending = { resolve, reject, onProgress, watchdog: 0 };
    pending.set(id, job);
    arm(job);
    w.postMessage({ id, text, voice, origin: window.location.origin });
  }).catch((err: Error) => {
    if (err.message === 'worker-failed') return synthesizeHere(text, voice, onProgress);
    throw err;
  });
}

/**
 * Generate speech for `text` in the browser (in a background worker). The
 * first call for a voice downloads its model; `onProgress` receives download
 * progress events. Returns a WAV Blob ready for playback and analysis.
 *
 * Recent clips are kept, so a line prepared ahead of time (a lesson's next
 * sentence) plays the moment it is asked for.
 */
const speechCache = new Map<string, Promise<Blob>>();
const SPEECH_CACHE_SIZE = 8;

export async function synthesizeSpeech(
  text: string,
  voice: PiperVoiceId,
  onProgress?: (progress: Progress) => void,
): Promise<Blob> {
  const key = `${voice}|${text}`;
  const cached = speechCache.get(key);
  if (cached) return cached;
  const job = synthesizeInWorker(text, voice, onProgress);
  speechCache.set(key, job);
  job.catch(() => speechCache.delete(key));
  while (speechCache.size > SPEECH_CACHE_SIZE) {
    speechCache.delete(speechCache.keys().next().value as string);
  }
  return job;
}
