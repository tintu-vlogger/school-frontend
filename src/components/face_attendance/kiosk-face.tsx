"use client";

/*
 * Face check on the clock-in kiosk.
 *
 * - useKioskFace(token): the kiosk's face settings and the templates of the people at its
 *   location. Kept in IndexedDB (so a reload works offline) and downloaded again every
 *   `refresh_minutes`; an unchanged list is not downloaded again (version check).
 * - <KioskFace>: the camera, the liveness check and the match on the tablet. It reports a
 *   match, no match or a failed liveness check; the page records the punch (or queues it
 *   when offline) and the server checks the match again.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { FaceCapture } from "./face-capture";
import { identify, type CheckResult, type GalleryPerson, type Liveness, type LivenessLevel, type LivenessRules } from "./face-engine";

export type KioskFaceConfig = {
  mode: "off" | "on" | "required"; model: string; threshold: number; margin: number; liveness: LivenessLevel;
  liveness_rules: LivenessRules; snapshot: "off" | "flagged" | "all"; max_attempts: number; refresh_minutes: number;
};
type Stored = { version: string; config: KioskFaceConfig; items: GalleryPerson[]; saved_at: string };

/* ── IndexedDB ───────────────────────────────────────────────────────── */

const DB_NAME = "hrms-face";
const STORE = "galleries";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no indexeddb")); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readStored(token: string): Promise<Stored | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const r = db.transaction(STORE, "readonly").objectStore(STORE).get(token);
      r.onsuccess = () => resolve((r.result as Stored) ?? null);
      r.onerror = () => resolve(null);
    });
  } catch { return null; }
}

async function writeStored(token: string, data: Stored | null): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      if (data) tx.objectStore(STORE).put(data, token); else tx.objectStore(STORE).delete(token);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* storage not available: the kiosk works online only */ }
}

export function useKioskFace(token: string) {
  const [state, setState] = useState<Stored | null>(null);
  const ref = useRef<Stored | null>(null);

  const refresh = useCallback(async () => {
    const cur = ref.current;
    try {
      const res = await fetch(`${API_BASE}/face-attendance/kiosk/${token}/gallery${cur ? `?since=${encodeURIComponent(cur.version)}` : ""}`, { cache: "no-store" });
      if (res.status === 404) { ref.current = null; setState(null); await writeStored(token, null); return; }
      if (!res.ok) return;
      const r = await res.json() as { version: string; unchanged?: boolean; config: KioskFaceConfig; items?: GalleryPerson[] };
      const next: Stored = r.unchanged && cur ? { ...cur, config: r.config, saved_at: new Date().toISOString() }
        : { version: r.version, config: r.config, items: r.items ?? [], saved_at: new Date().toISOString() };
      ref.current = next;
      setState(next);
      await writeStored(token, next);
    } catch { /* offline: keep what we have */ }
  }, [token]);

  useEffect(() => {
    let live = true;
    readStored(token).then((s) => { if (live && s && !ref.current) { ref.current = s; setState(s); } }).finally(() => { if (live) refresh(); });
    return () => { live = false; };
  }, [token, refresh]);

  const minutes = state?.config.refresh_minutes ?? 30;
  useEffect(() => {
    const t = setInterval(refresh, Math.max(5, minutes) * 60_000);
    const up = () => refresh();
    window.addEventListener("online", up);
    return () => { clearInterval(t); window.removeEventListener("online", up); };
  }, [minutes, refresh]);

  const on = !!state && state.config.mode !== "off";
  return { on, config: state?.config ?? null, people: state?.items ?? [], refresh };
}

/* ── the camera panel ────────────────────────────────────────────────── */

export type FaceOutcome = { liveness: Liveness | undefined; snapshot: string | null; score: number };
export type FaceMatch = FaceOutcome & { person: GalleryPerson; descriptor: number[] };

export function KioskFace({ config, people, paused, runKey, onMatch, onNoMatch, onSpoof }: {
  config: KioskFaceConfig; people: GalleryPerson[]; paused: boolean; runKey: number;
  onMatch: (m: FaceMatch) => void; onNoMatch: (o: FaceOutcome & { reason: string }) => void; onSpoof: (o: FaceOutcome) => void;
}) {
  const [again, setAgain] = useState(0);
  const handle = useCallback((r: CheckResult) => {
    if (!r.ok) {
      if (r.reason === "liveness") onSpoof({ liveness: r.liveness, snapshot: r.snapshot ?? null, score: 0 });
      else if (r.reason !== "cancelled") setTimeout(() => setAgain((n) => n + 1), r.reason === "error" ? 3000 : 200);
      return;
    }
    const d = r.descriptors[0];
    const m = identify(d, people, config.threshold, config.margin);
    if (m.matched && m.person) onMatch({ person: m.person, score: m.score, descriptor: d, liveness: r.liveness, snapshot: r.snapshot });
    else onNoMatch({ score: m.score, liveness: r.liveness, snapshot: r.snapshot, reason: m.reason });
  }, [people, config.threshold, config.margin, onMatch, onNoMatch, onSpoof]);

  return <FaceCapture big level={config.liveness} rules={config.liveness_rules} samples={1} runKey={runKey * 1000 + again} paused={paused} onResult={handle} />;
}
