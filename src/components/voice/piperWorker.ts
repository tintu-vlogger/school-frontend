/// <reference lib="webworker" />
/**
 * Background thread for the Piper voice, so making speech never freezes the
 * page (or a talking face) while it runs. Any failure is reported back, and
 * the page then makes the voice itself.
 */
import { setAssetOrigin, synthesizeHere, type PiperVoiceId } from './piperCore';

const busy = new Set<number>();
const failAll = (message: string) => {
  for (const id of busy) self.postMessage({ id, error: message, fatal: true });
  busy.clear();
};
// Errors thrown deep inside the engine never reach the try/catch below.
self.addEventListener('unhandledrejection', (e) => failAll(String((e as PromiseRejectionEvent).reason?.message || (e as PromiseRejectionEvent).reason)));
self.addEventListener('error', (e) => failAll((e as ErrorEvent).message || 'worker error'));

self.onmessage = async (e: MessageEvent<{ id: number; text: string; voice: PiperVoiceId; origin: string }>) => {
  const { id, text, voice, origin } = e.data;
  setAssetOrigin(origin);
  busy.add(id);
  try {
    const blob = await synthesizeHere(text, voice, (progress) => {
      // Only plain fields cross threads.
      const { url, loaded, total } = progress as { url?: string; loaded?: number; total?: number };
      self.postMessage({ id, progress: { url, loaded, total } });
    });
    if (busy.delete(id)) self.postMessage({ id, blob });
  } catch (err) {
    if (busy.delete(id)) self.postMessage({ id, error: err instanceof Error ? err.message : String(err), fatal: true });
  }
};
