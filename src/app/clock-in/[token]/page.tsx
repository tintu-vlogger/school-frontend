"use client";

/*
 * Clock-in kiosk: the page a shared office tablet opens from its secret link. No sign-in.
 * People type their employee ID and their PIN (set in My attendance) on the keypad; a photo
 * is taken when the kiosk asks for one. The punch goes to /attendance/kiosk/{token}/punch.
 *
 * Offline: when the network is down the punch is kept in this browser (localStorage, per
 * kiosk, up to 200; photos are dropped first if storage runs out) with the time it was
 * made, and sent to /attendance/kiosk/{token}/sync when the tablet is back online (and
 * every minute). The server checks each PIN then and ignores repeats.
 *
 * Face check (when HR switches it on for this kiosk): the camera recognises the person on
 * the tablet against the face templates of the people at this kiosk's location (kept in
 * IndexedDB, works offline) after a liveness check. The punch goes to
 * /face-attendance/kiosk/{token}/punch, where the server checks the match again. When the
 * face is not recognised the person uses employee ID and PIN (sent through the same face
 * endpoint so HR can review repeated failures). Face punches use the same offline queue.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Camera, CheckCircle2, CloudOff, Delete, KeyRound, LogIn, LogOut, RefreshCw, ScanFace, TriangleAlert } from "lucide-react";
import { KioskFace, useKioskFace, type FaceMatch, type FaceOutcome } from "@/components/face_attendance/kiosk-face";
import type { Liveness } from "@/components/face_attendance/face-engine";
import { API_BASE } from "@/lib/api";

const S = 1.4;
const MAX_QUEUE = 200;

type Info = { name: string; location_note: string | null; photo: "off" | "optional" | "required"; company: { name: string; logo: string | null; timezone: string | null }; now: string };
type Queued = {
  employee_code?: string; pin?: string; photo?: string | null; at: string; client_id: string;
  // face check items (sent to the face endpoint): face = matched on the tablet, pin = PIN after
  // the face check, miss = face not recognised and nobody punched (or liveness failed)
  method?: "face" | "pin" | "miss"; employee_uuid?: string; descriptor?: number[]; score?: number; attempts?: number;
  liveness?: Liveness | null; snapshot?: string | null; reason?: string; first_name?: string;
};
type Result = { status: "ok" | "duplicate" | "rejected" | "logged"; detail?: string; employee_name: string; first_name: string; punched_at: string; direction: "in" | "out" | null; offline: boolean };
type Screen = { kind: "entry" } | { kind: "done"; text: string; sub: string; direction: "in" | "out" | null } | { kind: "saved" } | { kind: "error"; text: string };

class NetworkError extends Error {}

async function call<T>(path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, body === undefined ? { cache: "no-store" } : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  } catch {
    throw new NetworkError("offline");
  }
  if (!res.ok) {
    let msg = "Something went wrong. Try again.";
    try { const j = await res.json(); if (typeof j.detail === "string") msg = j.detail; } catch { /* not JSON */ }
    if (res.status >= 500) throw new NetworkError(msg);
    const e = new Error(msg);
    (e as Error & { status?: number }).status = res.status;
    throw e;
  }
  return res.json();
}

function newId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

function readQueue(key: string): Queued[] {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
}

function writeQueue(key: string, items: Queued[]): void {
  const list = items.slice(-MAX_QUEUE);
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // storage full: keep the punches, drop their photos
    try { localStorage.setItem(key, JSON.stringify(list.map((q) => ({ ...q, photo: null, snapshot: null })))); } catch { /* nothing more to do */ }
  }
}

function greeting(tz: string | undefined): string {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function timeText(iso: string | Date, tz?: string) {
  return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(new Date(iso));
}

export default function ClockInKioskPage() {
  const { token } = useParams<{ token: string }>();
  const qKey = `hrms_kiosk_queue_${token}`;
  const infoKey = `hrms_kiosk_info_${token}`;
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(0);
  const [code, setCode] = useState("");
  const [pin, setPin] = useState("");
  const [step, setStep] = useState<"code" | "pin">("code");
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<Screen>({ kind: "entry" });
  const [camOk, setCamOk] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const syncing = useRef(false);
  const tz = info?.company.timezone || undefined;
  const face = useKioskFace(token);
  const faceOn = face.on && !!face.config;
  const [entryMode, setEntryMode] = useState<"face" | "pin">("face");
  const [attempts, setAttempts] = useState(0);
  const attemptsRef = useRef(0);
  useEffect(() => { attemptsRef.current = attempts; }, [attempts]);
  const [faceRun, setFaceRun] = useState(0);
  const [faceNote, setFaceNote] = useState<string | null>(null);
  const lastFace = useRef<{ snapshot: string | null; liveness: Liveness | null; score: number } | null>(null);
  const usingFace = faceOn && entryMode === "face";

  // ── kiosk details (cached so a reload works offline) ──
  useEffect(() => {
    let cached: Info | null = null;
    try { cached = JSON.parse(localStorage.getItem(infoKey) || "null"); } catch { /* ignore */ }
    if (cached) setInfo(cached);
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = () => call<Info>(`/attendance/kiosk/${token}`).then((r) => {
      if (!live) return;
      setInfo(r);
      try { localStorage.setItem(infoKey, JSON.stringify(r)); } catch { /* ignore */ }
    }).catch((e) => {
      if (!live) return;
      if (!(e instanceof NetworkError) && (e as { status?: number }).status === 404) {
        setMissing(true);
        try { localStorage.removeItem(infoKey); } catch { /* ignore */ }
      } else {
        timer = setTimeout(load, 15_000);  // server not reachable yet: try again
      }
    });
    load();
    return () => { live = false; clearTimeout(timer); };
  }, [token, infoKey]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── offline queue ──
  const sync = useCallback(async () => {
    if (syncing.current) return;
    const items = readQueue(qKey);
    setQueued(items.length);
    if (!items.length || !navigator.onLine) return;
    syncing.current = true;
    try {
      const batch = items.slice(0, 200);
      const plain = batch.filter((q) => !q.method);
      const face = batch.filter((q) => q.method);
      const results: { client_id: string | null; status: string }[] = [];
      if (plain.length) results.push(...(await call<{ results: { client_id: string | null; status: string }[] }>(`/attendance/kiosk/${token}/sync`, { punches: plain })).results);
      if (face.length) results.push(...(await call<{ results: { client_id: string | null; status: string }[] }>(`/face-attendance/kiosk/${token}/sync`, { items: face })).results);
      const r = { results };
      const done = new Set(r.results.filter((x) => ["ok", "duplicate", "error", "rejected", "logged", "ignored"].includes(x.status)).map((x) => x.client_id));
      const left = readQueue(qKey).filter((q) => !done.has(q.client_id));
      writeQueue(qKey, left);
      setQueued(left.length);
      setOnline(true);
    } catch (e) {
      if (e instanceof NetworkError) setOnline(false);
    } finally {
      syncing.current = false;
    }
  }, [qKey, token]);

  useEffect(() => {
    setOnline(navigator.onLine);
    setQueued(readQueue(qKey).length);
    const up = () => { setOnline(true); sync(); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const t = setInterval(sync, 60_000);
    sync();
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); clearInterval(t); };
  }, [qKey, sync]);

  // ── camera ──
  useEffect(() => {
    if (!info || info.photo === "off" || faceOn) return;
    let stopped = false;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 } }, audio: false })
      .then((s) => {
        if (stopped) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        setCamOk(true);
      })
      .catch(() => setCamOk(false));
    if (!navigator.mediaDevices) setCamOk(false);
    return () => { stopped = true; streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, [info, faceOn]);

  useEffect(() => {
    if (videoRef.current && streamRef.current && videoRef.current.srcObject !== streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  });

  function snap(): string | null {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const w = 320, h = Math.round((v.videoHeight / v.videoWidth) * w);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")?.drawImage(v, 0, 0, w, h);
    return c.toDataURL("image/jpeg", 0.6);
  }

  // ── entry ──
  const reset = useCallback(() => {
    setCode(""); setPin(""); setStep("code"); setScreen({ kind: "entry" });
    setEntryMode("face"); setFaceNote(null); setFaceRun((n) => n + 1);
    // the face was not recognised and nobody punched: log it (a run of these is flagged for HR)
    const n = attemptsRef.current;
    if (n > 0 && lastFace.current) {
      const lf = lastFace.current;
      const item: Queued = { method: "miss", attempts: n, score: lf.score, liveness: lf.liveness, snapshot: lf.snapshot, at: new Date().toISOString(), client_id: newId() };
      call(`/face-attendance/kiosk/${token}/punch`, item).catch((e) => { if (e instanceof NetworkError) writeQueue(qKey, [...readQueue(qKey), item]); });
    }
    lastFace.current = null;
    attemptsRef.current = 0;
    setAttempts(0);
  }, [token, qKey]);
  useEffect(() => {
    if (screen.kind === "entry") return;
    const t = setTimeout(reset, screen.kind === "error" ? 5000 : 4000);
    return () => clearTimeout(t);
  }, [screen, reset]);

  useEffect(() => {
    if (!faceOn || entryMode !== "pin" || screen.kind !== "entry") return;
    const t = setTimeout(reset, 45_000);
    return () => clearTimeout(t);
  }, [faceOn, entryMode, screen, code, pin, reset]);

  // ── face check results ──
  const sendFace = useCallback(async (item: Queued, firstName: string) => {
    const keep = () => {
      writeQueue(qKey, [...readQueue(qKey), item]);
      setQueued(readQueue(qKey).length);
      setOnline(false);
      setScreen({ kind: "done", direction: null, text: `Thanks, ${firstName}`, sub: `Saved at ${timeText(new Date(), tz)}. It will be sent when the tablet is back online.` });
    };
    if (!navigator.onLine) { keep(); return; }
    setBusy(true);
    try {
      const r = await call<Result>(`/face-attendance/kiosk/${token}/punch`, item);
      if (r.status === "rejected") {
        setAttempts((n) => n + 1);
        setFaceNote(r.detail ?? "Your face was not recognised.");
        setEntryMode("pin");
        return;
      }
      lastFace.current = null;
      setAttempts(0);
      const verb = r.direction === "out" ? "checked out" : "checked in";
      setScreen({
        kind: "done", direction: r.direction,
        text: `${r.direction === "out" ? "Goodbye" : greeting(tz)}, ${r.first_name}`,
        sub: r.status === "duplicate" ? `Already recorded at ${timeText(r.punched_at, tz)}` : `You ${verb} at ${timeText(r.punched_at, tz)}`,
      });
      sync();
    } catch (e) {
      if (e instanceof NetworkError) keep();
      else setScreen({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }, [qKey, token, tz, sync]);

  const keepSnap = (snap: string | null) => (face.config?.snapshot !== "off" || info?.photo !== "off" ? snap : null);

  const onFaceMatch = useCallback((m: FaceMatch) => {
    const item: Queued = {
      method: "face", employee_uuid: m.person.employee_uuid, descriptor: m.descriptor, score: Math.round(m.score * 1e4) / 1e4,
      liveness: m.liveness ?? null, snapshot: keepSnap(m.snapshot), attempts, at: new Date().toISOString(), client_id: newId(), first_name: m.person.first_name,
    };
    sendFace(item, m.person.first_name);
  }, [attempts, sendFace]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFaceMiss = useCallback((o: FaceOutcome & { reason: string }) => {
    lastFace.current = { snapshot: keepSnap(o.snapshot), liveness: o.liveness ?? null, score: Math.round(o.score * 1e4) / 1e4 };
    const n = attempts + 1;
    setAttempts(n);
    const max = face.config?.max_attempts ?? 3;
    if (!face.people.length) { setFaceNote("No faces are set up for this kiosk yet. Use your employee ID and PIN."); setEntryMode("pin"); return; }
    if (n >= max) { setFaceNote("Your face was not recognised. Use your employee ID and PIN."); setEntryMode("pin"); return; }
    setFaceNote(o.reason === "ambiguous" ? "Not sure who you are. Look straight at the camera." : `Not recognised. Try again (${n} of ${max}).`);
    setTimeout(() => setFaceRun((x) => x + 1), 1200);
  }, [attempts, face.config, face.people.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const onFaceSpoof = useCallback((o: FaceOutcome) => {
    const item: Queued = { method: "miss", reason: "liveness", attempts: attempts + 1, liveness: o.liveness ?? null, snapshot: o.snapshot, at: new Date().toISOString(), client_id: newId() };
    call(`/face-attendance/kiosk/${token}/punch`, item).catch((e) => { if (e instanceof NetworkError) writeQueue(qKey, [...readQueue(qKey), item]); });
    lastFace.current = null;
    setAttempts((n) => n + 1);
    setFaceNote("We could not confirm a live face. Look at the camera in good light, or use your PIN.");
    setTimeout(() => setFaceRun((x) => x + 1), 2500);
  }, [attempts, token, qKey]);

  function press(d: string) {
    if (step === "code") setCode((c) => (c + d).slice(0, 30));
    else setPin((p) => (p + d).slice(0, 6));
  }
  function back() {
    if (step === "code") setCode((c) => c.slice(0, -1));
    else if (pin) setPin((p) => p.slice(0, -1));
    else setStep("code");
  }

  async function submit() {
    if (!info || busy) return;
    if (step === "code") { if (code.trim()) setStep("pin"); return; }
    if (pin.length < 4) return;
    const photo = info.photo !== "off" && !faceOn ? snap() : null;
    if (info.photo === "required" && !photo && !faceOn) {
      setScreen({ kind: "error", text: "A photo is needed here. Allow the camera and look at it." });
      return;
    }
    const item: Queued = faceOn
      ? { method: "pin", employee_code: code.trim(), pin, attempts, snapshot: lastFace.current?.snapshot ?? null, liveness: lastFace.current?.liveness ?? null,
          score: lastFace.current?.score, photo: info.photo !== "off" ? lastFace.current?.snapshot ?? null : null, at: new Date().toISOString(), client_id: newId() }
      : { employee_code: code.trim(), pin, photo, at: new Date().toISOString(), client_id: newId() };
    const keep = () => {
      writeQueue(qKey, [...readQueue(qKey), item]);
      setQueued(readQueue(qKey).length);
      setOnline(false);
      setScreen({ kind: "saved" });
    };
    if (!navigator.onLine) { keep(); return; }
    setBusy(true);
    try {
      const r = await call<Result>(faceOn ? `/face-attendance/kiosk/${token}/punch` : `/attendance/kiosk/${token}/punch`, item);
      lastFace.current = null;
      setAttempts(0);
      const verb = r.direction === "out" ? "checked out" : "checked in";
      setScreen({
        kind: "done", direction: r.direction,
        text: `${r.direction === "out" ? "Goodbye" : greeting(tz)}, ${r.first_name}`,
        sub: r.status === "duplicate" ? `Already recorded at ${timeText(r.punched_at, tz)}` : `You ${verb} at ${timeText(r.punched_at, tz)}`,
      });
      sync();
    } catch (e) {
      if (e instanceof NetworkError) keep();
      else { setPin(""); setScreen({ kind: "error", text: (e as Error).message }); }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (screen.kind !== "entry" || usingFace) return;
      const typing = (e.target as HTMLElement | null)?.tagName === "INPUT";
      if (typing && e.key !== "Enter" && e.key !== "Escape") return;
      if (/^[0-9]$/.test(e.key)) press(e.key);
      else if (step === "code" && /^[a-zA-Z\-/]$/.test(e.key)) setCode((c) => (c + e.key.toUpperCase()).slice(0, 30));
      else if (e.key === "Backspace") back();
      else if (e.key === "Enter") submit();
      else if (e.key === "Escape") reset();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (missing) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f6f3] p-8 text-center">
        <div><TriangleAlert size={36} strokeWidth={S} className="mx-auto mb-4 text-stone-400" />
          <p className="text-[22px] font-light text-stone-800">This kiosk link doesn&apos;t work</p>
          <p className="mt-2 text-[15px] text-stone-500">It was switched off or replaced. Ask HR for the new link.</p></div>
      </main>
    );
  }

  const dateText = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(now);
  const clock = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(now);

  return (
    <main className="min-h-screen bg-[#f7f6f3] text-stone-800 [font-family:var(--font-outfit)]">
      <div className="mx-auto grid min-h-screen max-w-6xl gap-8 p-6 md:grid-cols-[1fr_minmax(0,440px)] md:p-10">
        {/* left: time and place */}
        <section className="flex flex-col justify-between">
          <div className="flex items-center gap-3">
            {info?.company.logo && <img src={info.company.logo} alt="" className="h-9 w-9 rounded-lg object-contain" />}
            <div>
              <p className="text-[17px] font-light">{info?.company.name ?? ""}</p>
              <p className="text-[13px] text-stone-500">{info ? [info.name, info.location_note].filter(Boolean).join(" · ") : "Loading…"}</p>
            </div>
          </div>
          <div className="py-10">
            <p className="tabular text-[clamp(64px,11vw,140px)] font-extralight leading-none tracking-tight">{clock}</p>
            <p className="mt-3 text-[20px] font-light text-stone-500">{dateText}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-stone-500">
            {online ? <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />Online</span>
              : <span className="inline-flex items-center gap-1.5 text-amber-700"><CloudOff size={15} strokeWidth={S} />Offline: punches are kept here</span>}
            {queued > 0 && (
              <button type="button" onClick={sync} className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1 text-stone-600">
                <RefreshCw size={13} strokeWidth={S} />{queued} waiting to send
              </button>
            )}
          </div>
        </section>

        {/* right: entry */}
        <section className="flex items-center">
          <div className="w-full rounded-3xl border border-stone-200 bg-white p-6 md:p-8">
            {screen.kind === "done" && (
              <div className="flex min-h-[460px] flex-col items-center justify-center text-center">
                <div className={`mb-5 flex h-20 w-20 items-center justify-center rounded-full ${screen.direction === "out" ? "bg-indigo-50 text-indigo-600" : "bg-emerald-50 text-emerald-600"}`}>
                  {screen.direction === "out" ? <LogOut size={34} strokeWidth={S} /> : <LogIn size={34} strokeWidth={S} />}
                </div>
                <p className="text-[28px] font-light">{screen.text}</p>
                <p className="mt-2 text-[17px] text-stone-500">{screen.sub}</p>
              </div>
            )}
            {screen.kind === "saved" && (
              <div className="flex min-h-[460px] flex-col items-center justify-center text-center">
                <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-amber-50 text-amber-600"><CheckCircle2 size={34} strokeWidth={S} /></div>
                <p className="text-[26px] font-light">Saved</p>
                <p className="mt-2 max-w-xs text-[16px] text-stone-500">No internet right now. Your punch at {timeText(new Date(), tz)} will be sent when the tablet is back online.</p>
              </div>
            )}
            {screen.kind === "error" && (
              <div className="flex min-h-[460px] flex-col items-center justify-center text-center">
                <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-rose-50 text-rose-600"><TriangleAlert size={32} strokeWidth={S} /></div>
                <p className="max-w-xs text-[20px] font-light">{screen.text}</p>
                <button type="button" onClick={reset} className="mt-6 rounded-full border border-stone-300 px-5 py-2 text-[15px] text-stone-600">Try again</button>
              </div>
            )}
            {screen.kind === "entry" && usingFace && face.config && (
              <div>
                <div className="mb-4 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[13px] text-stone-500">Face check</p>
                    <p className="text-[22px] font-light">Look at the camera</p>
                  </div>
                  <ScanFace size={26} strokeWidth={S} className="mt-1 text-stone-400" />
                </div>
                <KioskFace config={face.config} people={face.people} paused={busy || screen.kind !== "entry"} runKey={faceRun}
                  onMatch={onFaceMatch} onNoMatch={onFaceMiss} onSpoof={onFaceSpoof} />
                <p className="mt-3 min-h-[20px] text-center text-[14px] text-amber-700">{busy ? "Recording…" : faceNote ?? ""}</p>
                {(face.config.mode === "on" || attempts > 0) && (
                  <button type="button" onClick={() => setEntryMode("pin")}
                    className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 text-[16px] font-light text-stone-700 active:bg-stone-100">
                    <KeyRound size={18} strokeWidth={S} />Use employee ID and PIN
                  </button>
                )}
                {face.config.mode === "required" && attempts === 0 && <p className="mt-4 text-center text-[12.5px] text-stone-400">PIN is offered if your face is not recognised.</p>}
              </div>
            )}
            {screen.kind === "entry" && !usingFace && (
              <div>
                {faceOn && faceNote && <p className="-mt-1 mb-4 rounded-xl bg-amber-50 px-3 py-2 text-center text-[13.5px] text-amber-800">{faceNote}</p>}
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[13px] text-stone-500">{step === "code" ? "Step 1 of 2" : "Step 2 of 2"}</p>
                    <p className="text-[22px] font-light">{step === "code" ? "Your employee ID" : "Your PIN"}</p>
                  </div>
                  {info && info.photo !== "off" && !faceOn && (
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-stone-100">
                      {camOk ? <video ref={videoRef} muted playsInline className="h-full w-full scale-x-[-1] object-cover" />
                        : <div className="flex h-full w-full items-center justify-center text-stone-400"><Camera size={20} strokeWidth={S} /></div>}
                    </div>
                  )}
                </div>
                <div className="mb-5 flex h-16 items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 px-4">
                  {step === "code" ? (
                    <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 30))} placeholder="e.g. EMP0012"
                      className="w-full bg-transparent text-center text-[26px] font-light tracking-wider outline-none placeholder:text-stone-300" aria-label="Employee ID" autoComplete="off" />
                  ) : (
                    <div className="flex gap-3" aria-label={`${pin.length} digits entered`}>
                      {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                        <span key={i} className={`h-4 w-4 rounded-full ${i < pin.length ? "bg-stone-800" : "border border-stone-300"}`} />
                      ))}
                    </div>
                  )}
                </div>
                {step === "pin" && <p className="-mt-3 mb-4 text-center text-[13px] text-stone-500">{code} · <button type="button" className="underline" onClick={() => { setPin(""); setStep("code"); }}>change</button></p>}
                {info?.photo === "required" && !faceOn && camOk === false && <p className="-mt-2 mb-4 text-center text-[13px] text-rose-600">Allow the camera: a photo is needed to punch here.</p>}
                <div className="grid grid-cols-3 gap-3">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                    <Key key={d} onClick={() => press(d)}>{d}</Key>
                  ))}
                  <Key onClick={back} label="Delete"><Delete size={24} strokeWidth={S} /></Key>
                  <Key onClick={() => press("0")}>0</Key>
                  <button type="button" onClick={submit} disabled={busy || !info || (step === "code" ? !code.trim() : pin.length < 4)}
                    className="h-16 rounded-2xl bg-indigo-600 text-[17px] font-normal text-white transition-opacity disabled:opacity-30">
                    {busy ? "…" : step === "code" ? "Next" : "Punch"}
                  </button>
                </div>
                <p className="mt-5 text-center text-[12.5px] text-stone-400">No PIN yet? Set one in My attendance on your phone or computer.</p>
                {faceOn && <button type="button" onClick={reset} className="mx-auto mt-3 flex items-center gap-1.5 text-[13.5px] text-stone-500 underline"><ScanFace size={15} strokeWidth={S} />Back to the face check</button>}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function Key({ children, onClick, label }: { children: React.ReactNode; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className="flex h-16 items-center justify-center rounded-2xl border border-stone-200 bg-white text-[26px] font-light text-stone-800 transition-colors active:bg-stone-100">
      {children}
    </button>
  );
}
