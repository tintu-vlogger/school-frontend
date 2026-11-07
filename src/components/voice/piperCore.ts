/**
 * The Piper voice engine itself (no worker code here, so the speech worker can
 * import it without pulling itself in again).
 * Free: the voice model downloads once and is cached in the browser.
 */
import { TtsSession, type Progress } from '@mintplex-labs/piper-tts-web';

/* ========================================================================
   PIPER SPEECH — on-device neural synthesis (WASM)
   ======================================================================== */

/**
 * On-device neural speech synthesis powered by Piper (WASM). The voice model
 * downloads once from Hugging Face and is cached in the browser's origin
 * storage, so repeated generations are instant and always free.
 */

export const PIPER_VOICES = [
  { value: 'en_US-lessac-medium', label: 'Lessac · clear US voice' },
  { value: 'en_US-amy-medium', label: 'Amy · warm US voice' },
  { value: 'en_US-kristin-medium', label: 'Kristin · confident US voice' },
  { value: 'en_US-joe-medium', label: 'Joe · casual US voice' },
  { value: 'en_GB-alba-medium', label: 'Alba · British voice' },
  { value: 'en_US-ryan-medium', label: 'Ryan · deep US voice' },
] as const;

export type PiperVoiceId = (typeof PIPER_VOICES)[number]['value'];

/* Where the voice files live. Empty = this page's own site. A worker passes
   the page's origin in: inside a worker a path like /wasm/... has nothing to
   resolve against, and loading it fails. */
let assetOrigin = '';
export function setAssetOrigin(origin: string) { assetOrigin = origin; }

/**
 * The Piper phonemizer is self-hosted. The onnxruntime glue comes from the
 * CDN, pinned to the installed onnxruntime-web version.
 */
const wasmPaths = () => ({
  onnxWasm: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.29.0/dist/',
  piperWasm: `${assetOrigin}/wasm/piper_phonemize.wasm`,
  piperData: `${assetOrigin}/wasm/piper_phonemize.data`,
});

let sessionVoice: PiperVoiceId | null = null;
// Session creation is serialized: piper-tts-web keeps one process-wide
// singleton, so a new voice must not start loading while another is.
let sessionQueue: Promise<unknown> = Promise.resolve();

function getSession(
  voice: PiperVoiceId,
  onProgress?: (progress: Progress) => void,
): Promise<TtsSession> {
  const run = sessionQueue.then(async () => {
    if (sessionVoice === voice && TtsSession._instance) {
      return TtsSession._instance;
    }
    // The library reuses its singleton without reloading the model, so it
    // must be reset explicitly before a different voice can load. Models
    // already downloaded stay cached in origin storage, making this cheap.
    TtsSession._instance = null;
    const session = await TtsSession.create({
      voiceId: voice,
      wasmPaths: wasmPaths(),
      progress: onProgress,
    });
    sessionVoice = voice;
    return session;
  });
  sessionQueue = run.catch(() => {});
  return run;
}

/** Returns a human-readable reason on-device speech cannot run, or null. */
export function speechSupportIssue(): string | null {
  if (typeof WebAssembly === 'undefined') {
    return 'This browser cannot run on-device voices (WebAssembly unavailable).';
  }
  try {
    // Canonical WebAssembly SIMD feature-detection module.
    const simdModule = new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10,
      10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11,
    ]);
    if (!WebAssembly.validate(simdModule)) {
      return 'This browser lacks the WebAssembly SIMD support on-device voices need.';
    }
  } catch {
    return 'This browser cannot run on-device voices.';
  }
  const storage = navigator.storage;
  if (!storage || typeof storage.getDirectory !== 'function') {
    return 'This browser cannot store the voice model (persistent storage unavailable).';
  }
  return null;
}

/** One synthesis at a time on a thread — the model must not run concurrently. */
let synthQueue: Promise<unknown> = Promise.resolve();

/**
 * Make speech on THIS thread. Used inside the speech worker, and on the page
 * only as a fallback when the worker cannot start.
 */
export async function synthesizeHere(
  text: string,
  voice: PiperVoiceId,
  onProgress?: (progress: Progress) => void,
): Promise<Blob> {
  const job = synthQueue.then(async () => {
    const session = await getSession(voice, onProgress);
    return session.predict(text);
  });
  synthQueue = job.catch(() => undefined);
  return job;
}

