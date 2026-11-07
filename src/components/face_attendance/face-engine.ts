/*
 * Face engine for face attendance, running fully in the browser.
 *
 * Uses the open-source @vladmandic/human library with models served by this app from
 * /models/face (copied there by scripts/copy-face-models.mjs), so no request leaves the
 * app at run time. It finds one face, checks it is a live person (anti-spoofing texture
 * score, liveness score, face size and a blink or head-turn challenge) and makes face
 * templates (lists of numbers) for matching. Pictures are never sent anywhere; only the
 * templates and, when the company keeps them, one small snapshot.
 *
 *   const r = await runCheck(video, { level: "standard", rules, samples: 1, onStatus });
 *   if (r.ok) r.descriptors[0] ...
 *   identify(descriptor, gallery, threshold, margin)  // same maths as the server
 */

export const FACE_MODEL = "human-faceres";

export type LivenessRules = { real: number; live: number; challenges: number; min_face_px: number };
export type LivenessLevel = "off" | "basic" | "standard" | "strict";
export type Liveness = { passed: boolean; real: number | null; live: number | null; face_px: number; challenges: string[] };
export type CheckOk = { ok: true; descriptors: number[][]; liveness: Liveness; snapshot: string | null };
export type CheckFail = { ok: false; reason: "liveness" | "no_face" | "cancelled" | "error"; message: string; liveness?: Liveness; snapshot?: string | null };
export type CheckResult = CheckOk | CheckFail;
export type Status = { text: string; hint?: string; progress?: number; tone?: "info" | "good" | "warn" };

/* ── loading ─────────────────────────────────────────────────────────── */

type Pt = number[];
type HFace = {
  box: [number, number, number, number]; mesh: Pt[]; embedding?: number[]; real?: number; live?: number; score: number;
  rotation?: { angle: { yaw: number; pitch: number; roll: number } } | null;
};
type HResult = { face: HFace[] };
type HumanLike = { load: () => Promise<void>; warmup: () => Promise<unknown>; detect: (input: HTMLVideoElement) => Promise<HResult> };

let loading: Promise<HumanLike> | null = null;

export function loadFaceEngine(): Promise<HumanLike> {
  if (loading) return loading;
  loading = (async () => {
    // the browser build is served from /models/face too (see scripts/copy-face-models.mjs), so
    // the server bundle never touches the library and nothing is loaded from outside the app
    const url = `${window.location.origin}/models/face/human.esm.js`;
    const mod = await import(/* webpackIgnore: true */ url);
    const HumanClass = (mod as unknown as { Human: new (cfg: unknown) => HumanLike }).Human
      ?? (mod as unknown as { default: new (cfg: unknown) => HumanLike }).default;
    const human = new HumanClass({
      modelBasePath: `${window.location.origin}/models/face/`,
      debug: false,
      async: true,
      warmup: "none",
      cacheSensitivity: 0,
      filter: { enabled: true, equalization: false, flip: false },
      face: {
        enabled: true,
        detector: { rotation: true, maxDetected: 2, minConfidence: 0.5, return: false },
        mesh: { enabled: true },
        attention: { enabled: false },
        iris: { enabled: true },
        description: { enabled: true },
        emotion: { enabled: false },
        antispoof: { enabled: true },
        liveness: { enabled: true },
        gear: { enabled: false },
      },
      body: { enabled: false }, hand: { enabled: false }, object: { enabled: false },
      gesture: { enabled: false }, segmentation: { enabled: false },
    });
    await human.load();
    return human;
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

/* ── maths (kept the same as the server's matching helper) ───────────── */

export function normalise(v: number[]): number[] {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return n > 1e-9 ? v.map((x) => x / n) : v;
}

export function similarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return Math.max(-1, Math.min(1, dot / Math.sqrt(na * nb)));
}

export const isMatch = (score: number, threshold: number) => 1 - score <= threshold + 1e-9;

export type GalleryPerson = { employee_uuid: string; name: string; first_name: string; employee_code: string | null; templates: number[][] };
export type Identified = { matched: boolean; person: GalleryPerson | null; score: number; reason: "matched" | "below_threshold" | "ambiguous" | "empty" };

export function identify(probe: number[], people: GalleryPerson[], threshold: number, margin: number): Identified {
  const scored = people
    .filter((p) => p.templates.length && p.templates[0].length === probe.length)
    .map((p) => ({ p, s: Math.max(...p.templates.map((t) => similarity(probe, t))) }))
    .sort((a, b) => b.s - a.s);
  if (!scored.length) return { matched: false, person: null, score: 0, reason: "empty" };
  const [top, second] = scored;
  if (!isMatch(top.s, threshold)) return { matched: false, person: top.p, score: top.s, reason: "below_threshold" };
  if (second && isMatch(second.s, threshold) && top.s - second.s < margin) return { matched: false, person: top.p, score: top.s, reason: "ambiguous" };
  return { matched: true, person: top.p, score: top.s, reason: "matched" };
}

/* ── camera helpers ──────────────────────────────────────────────────── */

export async function openCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot use the camera.");
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
}

export function snapshotOf(video: HTMLVideoElement, width = 240, quality = 0.6): string | null {
  if (!video.videoWidth) return null;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.round((video.videoHeight / video.videoWidth) * width);
  c.getContext("2d")?.drawImage(video, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

/* ── the check ───────────────────────────────────────────────────────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function eyeOpenness(m: Pt[]): number | null {
  if (!m || m.length < 460) return null;
  const l = Math.abs(m[374][1] - m[386][1]) / Math.max(1e-6, Math.abs(m[443][1] - m[450][1]));
  const r = Math.abs(m[145][1] - m[159][1]) / Math.max(1e-6, Math.abs(m[223][1] - m[230][1]));
  return (l + r) / 2;
}

function turnRatio(m: Pt[]): number {
  if (!m || m.length < 300) return 0;
  const z = (m[33][2] || 0) - (m[263][2] || 0);
  const x = m[33][0] - m[263][0];
  return Math.abs(x) > 1e-6 ? z / x : 0;
}

export function challengesFor(level: LivenessLevel, rules: LivenessRules): ("blink" | "turn")[] {
  if (level === "off" || rules.challenges <= 0) return [];
  if (rules.challenges >= 2) return Math.random() < 0.5 ? ["blink", "turn"] : ["turn", "blink"];
  return [Math.random() < 0.5 ? "blink" : "turn"];
}

export type CheckOptions = {
  level: LivenessLevel;
  rules: LivenessRules;
  samples?: number;            // how many templates to return (enrolment 3 to 5, a check 1)
  waitMs?: number;             // how long to wait for a face
  signal?: { cancelled: boolean };
  onStatus?: (s: Status) => void;
};

/** Watch the video until one live face is confirmed and its templates are made. */
export async function runCheck(video: HTMLVideoElement, opts: CheckOptions): Promise<CheckResult> {
  const { level, rules, samples = 1, waitMs = 20000, signal, onStatus } = opts;
  const status = (s: Status) => onStatus?.(s);
  let human: HumanLike;
  try {
    status({ text: "Getting ready…" });
    human = await loadFaceEngine();
  } catch {
    return { ok: false, reason: "error", message: "The face check could not start on this device." };
  }
  const reals: number[] = [], lives: number[] = [];
  let facePx = 0;
  const done: string[] = [];
  const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const evidence = (passed: boolean): Liveness => ({
    passed, real: avg(reals), live: avg(lives), face_px: Math.round(facePx), challenges: [...done],
  });

  async function frame(): Promise<HFace | "none" | "many" | "small"> {
    if (signal?.cancelled) throw new Error("cancelled");
    const r = await human.detect(video);
    const faces = (r.face || []).filter((f) => f.score > 0.5);
    if (!faces.length) return "none";
    if (faces.length > 1) return "many";
    const f = faces[0];
    if (typeof f.real === "number") reals.push(f.real);
    if (typeof f.live === "number") lives.push(f.live);
    if (reals.length > 30) reals.shift();
    if (lives.length > 30) lives.shift();
    facePx = Math.max(facePx * 0.6, f.box[2]);
    if (f.box[2] < rules.min_face_px) return "small";
    return f;
  }

  try {
    // 1. one face, close enough
    const until = Date.now() + waitMs;
    let face: HFace | null = null;
    while (!face) {
      if (Date.now() > until) return { ok: false, reason: "no_face", message: "No face found. Look at the camera." };
      const f = await frame();
      if (f === "none") status({ text: "Look at the camera" });
      else if (f === "many") status({ text: "One person at a time", tone: "warn" });
      else if (f === "small") status({ text: "Come a little closer" });
      else face = f;
      if (!face) await sleep(60);
    }

    // 2. liveness challenge(s): blink or head turn
    for (const c of challengesFor(level, rules)) {
      const limit = Date.now() + 8000;
      let ok = false;
      if (c === "blink") {
        status({ text: "Blink slowly", hint: "Close your eyes for a moment, then open them" });
        let base = 0, closed = false;
        while (!ok && Date.now() < limit) {
          const f = await frame();
          if (typeof f === "string") continue;
          const o = eyeOpenness(f.mesh);
          if (o == null) continue;
          base = Math.max(base * 0.97, o);
          if (!closed && base > 0 && o < base * 0.55) closed = true;
          else if (closed && o > base * 0.8) ok = true;
        }
      } else {
        status({ text: "Turn your head to one side", hint: "Slowly, then look back at the camera" });
        let turned = false;
        while (!ok && Date.now() < limit) {
          const f = await frame();
          if (typeof f === "string") continue;
          const t = Math.abs(turnRatio(f.mesh));
          if (!turned && t > 0.35) { turned = true; status({ text: "Now look back at the camera" }); }
          else if (turned && t < 0.15) ok = true;
        }
      }
      if (!ok) {
        return { ok: false, reason: "liveness", message: c === "blink" ? "We didn't see a blink." : "We didn't see a head turn.",
          liveness: evidence(false), snapshot: snapshotOf(video) };
      }
      done.push(c === "blink" ? "blink" : "turn_left");
    }

    // 3. templates while facing the camera
    const out: number[][] = [];
    const prompts = ["Look straight at the camera", "Tilt your head a little", "Look straight again", "Lift your chin a little", "Look straight at the camera"];
    const want = Math.max(1, samples);
    const per = want === 1 ? 2 : 1;  // a check averages two frames
    let tries = 0;
    while (out.length < want && tries < 200) {
      tries++;
      status({ text: want > 1 ? prompts[out.length % prompts.length] : "Hold still", progress: want > 1 ? out.length / want : undefined });
      const parts: number[][] = [];
      while (parts.length < per && tries < 200) {
        tries++;
        const f = await frame();
        if (typeof f === "string" || !f.embedding?.length) continue;
        if (Math.abs(turnRatio(f.mesh)) > 0.25 && want === 1) continue;
        parts.push(normalise(Array.from(f.embedding)));
      }
      if (parts.length < per) break;
      const mean = normalise(parts[0].map((_, i) => parts.reduce((s, p) => s + p[i], 0) / parts.length));
      out.push(mean.map((x) => Math.round(x * 1e5) / 1e5));
      if (want > 1) await sleep(450);
    }
    if (out.length < want) return { ok: false, reason: "no_face", message: "Keep your face in the frame and try again." };

    // 4. texture and liveness scores over the whole check
    const real = avg(reals) ?? 0, live = avg(lives) ?? 0;
    const passed = level === "off" || (real >= rules.real && live >= rules.live && facePx >= rules.min_face_px);
    const snap = snapshotOf(video);
    if (!passed) {
      return { ok: false, reason: "liveness", message: "We could not confirm a live face. Use good light and don't hold up a photo or a screen.",
        liveness: evidence(false), snapshot: snap };
    }
    status({ text: "Done", tone: "good", progress: 1 });
    return { ok: true, descriptors: out, liveness: evidence(true), snapshot: snap };
  } catch (e) {
    if ((e as Error).message === "cancelled") return { ok: false, reason: "cancelled", message: "Stopped." };
    return { ok: false, reason: "error", message: "The face check stopped. Try again." };
  }
}
