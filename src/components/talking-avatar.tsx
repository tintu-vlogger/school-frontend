"use client";

/*
 * A small talking photo in the bottom-right corner. It blinks and moves gently while idle;
 * a click makes it speak a fixed paragraph, lips in sync. The voice is Piper, a free neural voice
 * engine that runs in the browser (a background worker); each voice model downloads once and is
 * cached. Women speak with "Lessac", men with "Ryan". If the browser can't run it, the browser's
 * own voice is used instead.
 * Purely in the browser: each person is a photo and a face map (rig.json) prepared once in public/talking-avatar/people/, animated with WebGL. The small gear opens a
 * popover to pick another person; the choice is remembered on this device.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Settings2, Volume2, X } from "lucide-react";

const BASE = "/talking-avatar/";
const PEOPLE_BASE = `${BASE}people/`;
const PICK_KEY = "hr_avatar_person";
const PICK_EVENT = "hr-avatar-person";
const ON_KEY = "hr_avatar_on";
const TEETH_TUNE = { upEdge: 0.75, loEdge: -0.15, bright: 0.98, scale: 1, shadow: 0.38, corners: 0.7 };

type Person = { id: string; name: string; gender: "f" | "m"; framing: [number, number, number, number] };
type Avatar = {
  destroy: () => void; stop: () => void;
  setViewRect: (r: [number, number, number, number]) => void;
  say: (text: string, o?: { voice?: SpeechSynthesisVoice; rate?: number; pitch?: number }) => Promise<void>;
  saySilent: (text: string) => Promise<void>;
  sayAudio: (buf: ArrayBuffer, text: string) => Promise<void>;
  speech: unknown;
  actx?: AudioContext;
  teethTune: typeof TEETH_TUNE;
};
type AvatarModule = {
  TalkingAvatar: {
    fromParts: (el: HTMLElement, rig: unknown, img: HTMLImageElement, mask: HTMLImageElement | null, opts: object) => Avatar;
    loadDictionary: (url: string) => Promise<void>;
  };
};

let modulePromise: Promise<AvatarModule> | null = null;
const loadModule = () => {
  modulePromise ||= import(/* webpackIgnore: true */ `${BASE}avatar.js` as string) as Promise<AvatarModule>;
  modulePromise.catch(() => { modulePromise = null; });
  return modulePromise;
};
let peoplePromise: Promise<Person[]> | null = null;
const loadPeople = () => {
  peoplePromise ||= fetch(`${PEOPLE_BASE}people.json`).then((r) => r.json());
  peoplePromise.catch(() => { peoplePromise = null; });
  return peoplePromise;
};
const loadImg = (src: string) => new Promise<HTMLImageElement>((ok, fail) => {
  const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src;
});

/* Free neural voices (Piper), loaded only when the avatar is first used. */
const NEURAL_VOICE = { f: "en_US-lessac-medium", m: "en_US-ryan-medium" } as const;
type VoiceLib = typeof import("@/components/voice/piperSpeech");
let voiceLib: Promise<VoiceLib> | null = null;
const loadVoiceLib = () => {
  voiceLib ||= import("@/components/voice/piperSpeech");
  voiceLib.catch(() => { voiceLib = null; });
  return voiceLib;
};

/** Browser voice fallback: an English voice that matches the person, Indian English first. */
function pickVoice(gender: "f" | "m"): SpeechSynthesisVoice | undefined {
  const vs = window.speechSynthesis?.getVoices() ?? [];
  const male = /\bmale\b|rishi|ravi|daniel|alex|aaron|arthur|fred|tom|google uk english male/i;
  const female = /female|veena|lekha|kajal|neerja|isha|samantha|karen|moira|tessa|serena|google uk english female|victoria|zira/i;
  const want = gender === "f" ? female : male;
  return vs.find((v) => v.lang === "en-IN" && want.test(v.name))
    ?? vs.find((v) => v.lang.startsWith("en") && want.test(v.name))
    ?? vs.find((v) => v.lang === "en-IN")
    ?? vs.find((v) => v.lang.startsWith("en"));
}

/** Split a paragraph into sentences (short ones are joined so the voice keeps a natural flow). */
function sentences(text: string): string[] {
  const raw = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [text];
  const out: string[] = [];
  for (const r of raw) {
    if (out.length && out[out.length - 1].length < 40) out[out.length - 1] += " " + r;
    else out.push(r);
  }
  return out.length ? out : [text];
}

function readPick(): string | null {
  try { return localStorage.getItem(PICK_KEY); } catch { return null; }
}

/**
 * cutout: just the person, no circle, border or background (the photo's background is cut away
 * with the person's mask); the whole photo is shown, nothing cropped or faded.
 */
export function TalkingAvatar({ text, hint = "Tap me", size = 112, cutout = false, autoPlay = false, onHide, onReady }: { text: string; hint?: string; size?: number; cutout?: boolean; autoPlay?: boolean; onHide?: () => void; onReady?: (ready: boolean) => void }) {
  const stage = useRef<HTMLDivElement>(null);
  const avatar = useRef<Avatar | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [person, setPerson] = useState<Person | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const resumeWaiters = useRef<(() => void)[]>([]);
  const heldSpeech = useRef<unknown>(null);           // the lip timeline, put aside while paused
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const [voiceReady, setVoiceReady] = useState(false); // speech made in advance (or the fallback chosen)
  const [shown, setShown] = useState(false);            // appears only once everything is ready
  const run = useRef<{ cancelled: boolean } | null>(null);
  const [hidden, setHidden] = useState(false);
  const [bubble, setBubble] = useState(true);
  const [picker, setPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Choose the remembered person (or the first) once the page is idle.
  useEffect(() => {
    let dead = false;
    const start = () => loadPeople().then((list) => {
      if (dead || !list.length) return;
      setPeople(list);
      setPerson(list.find((p) => p.id === readPick()) ?? list[0]);
    }).catch(() => !dead && setFailed(true));
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const id = w.requestIdleCallback ? w.requestIdleCallback(start) : window.setTimeout(start, 600);
    window.speechSynthesis?.getVoices(); // voices load lazily in some browsers
    return () => { dead = true; if (!w.requestIdleCallback) window.clearTimeout(id); };
  }, []);

  // Build the face for the chosen person; rebuilt when someone else is picked.
  useEffect(() => {
    if (!person) return;
    let dead = false;
    setReady(false);
    setFailed(false);
    (async () => {
      try {
        const dir = `${PEOPLE_BASE}${person.id}/`;
        const [{ TalkingAvatar: TA }, rig, photo, mask] = await Promise.all([
          loadModule(), fetch(`${dir}rig.json`).then((r) => r.json()), loadImg(`${dir}photo.jpg`),
          cutout ? loadImg(`${dir}mask.png`) : Promise.resolve(null),
        ]);
        if (dead || !stage.current) return;
        avatar.current?.destroy();
        stage.current.innerHTML = "";
        // Round version: the whole photo, background included. Cut-out version: only the person.
        const a = TA.fromParts(stage.current, rig, photo, mask, {
          view: "circle", speechV2: true, smoothLips: true, denseMouth: true, expressive: true, motion: 2.2,
        });
        a.teethTune = { ...TEETH_TUNE };
        // cut-out: the whole photo (everything it shows of the person); round: the head-and-shoulders square
        if (cutout) a.setViewRect([0, 0, (rig as { w: number }).w, (rig as { h: number }).h]);
        else a.setViewRect(person.framing);
        avatar.current = a;
        setFailed(false);
        setReady(true);
        TA.loadDictionary(`${BASE}assets/cmudict.txt`).catch(() => {});
      } catch {
        if (!dead) setFailed(true);
      }
    })();
    return () => { dead = true; };
  }, [person, cutout]);

  // Groundwork, done quietly before the avatar appears: load the voice and make the whole speech,
  // so a click plays at once. Redone for a new person (other voice) or a new text.
  useEffect(() => {
    if (!person) return;
    let dead = false;
    setVoiceReady(false);
    (async () => {
      try {
        const lib = await loadVoiceLib();
        if (!lib.speechSupportIssue()) {
          for (const part of sentences(text)) {
            if (dead) return;
            await lib.synthesizeSpeech(part, NEURAL_VOICE[person.gender]);
          }
        }
      } catch { /* the browser's own voice will be used */ }
      if (!dead) setVoiceReady(true);
    })();
    return () => { dead = true; };
  }, [person, text]);

  const allReady = (ready || failed) && voiceReady;
  useEffect(() => { if (allReady) setShown(true); }, [allReady]);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => { onReadyRef.current?.(shown); }, [shown]);
  // switched on from the toolbar: start talking as soon as it appears
  const playRef = useRef<() => void>(() => {});
  playRef.current = () => { setBubble(false); play(); };
  useEffect(() => { if (shown && autoPlay) playRef.current(); }, [shown, autoPlay]);

  // Hidden or closed: stop talking at once (current clip, the next sentence and any browser voice).
  useEffect(() => () => {
    if (run.current) run.current.cancelled = true;
    run.current = null;
    try { avatar.current?.stop(); } catch { /* already gone */ }
    window.speechSynthesis?.cancel();
    // close its audio too, so a clip that was still being prepared can never start afterwards
    (avatar.current as unknown as { actx?: AudioContext } | null)?.actx?.close().catch(() => {});
    avatar.current?.destroy();
    avatar.current = null;
  }, []);
  useEffect(() => { if (!shown) return; const t = setTimeout(() => setBubble(false), 9000); return () => clearTimeout(t); }, [shown]);

  // Close the picker on an outside click or Escape.
  useEffect(() => {
    if (!picker) return;
    const down = (e: MouseEvent) => { if (!pickerRef.current?.contains(e.target as Node)) setPicker(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setPicker(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [picker]);

  const stop = useCallback(() => {
    if (run.current) run.current.cancelled = true;
    run.current = null;
    pausedRef.current = false; setPaused(false); heldSpeech.current = null;
    resumeWaiters.current.splice(0).forEach((r) => r());
    audioEl.current?.pause(); audioEl.current = null;
    avatar.current?.stop(); window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  /** Pause: the voice and the lips stop where they are (the mouth closes) until resumed. */
  function pause() {
    const a = avatar.current;
    pausedRef.current = true; setPaused(true);
    if (a?.actx) { a.actx.suspend().catch(() => {}); heldSpeech.current = a.speech; a.speech = null; }
    audioEl.current?.pause();
    window.speechSynthesis?.pause();
  }
  function resume() {
    const a = avatar.current;
    pausedRef.current = false; setPaused(false);
    if (a?.actx) { if (heldSpeech.current) a.speech = heldSpeech.current; heldSpeech.current = null; a.actx.resume().catch(() => {}); }
    audioEl.current?.play().catch(() => {});
    window.speechSynthesis?.resume();
    resumeWaiters.current.splice(0).forEach((r) => r());
  }
  const waitWhilePaused = () => (pausedRef.current ? new Promise<void>((r) => resumeWaiters.current.push(r)) : Promise.resolve());

  function choose(p: Person) {
    setPicker(false);
    if (p.id === person?.id) return;
    stop();
    try { localStorage.setItem(PICK_KEY, p.id); } catch { /* not kept */ }
    window.dispatchEvent(new CustomEvent(PICK_EVENT, { detail: p.id }));
    setPerson(p);
  }

  async function browserVoice(a: Avatar | null, gender: "f" | "m") {
    const voice = pickVoice(gender);
    if (a && window.speechSynthesis) return a.say(text, { voice, rate: 1, pitch: 1 });
    if (a) return a.saySilent(text);
    if (!window.speechSynthesis) return;
    await new Promise<void>((done) => {
      const u = new SpeechSynthesisUtterance(text);
      if (voice) u.voice = voice;
      u.onend = () => done(); u.onerror = () => done();
      window.speechSynthesis.speak(u);
    });
  }

  /** A click on the avatar: play, pause, or carry on from where it paused. */
  function toggle() {
    setBubble(false);
    if (paused) resume();
    else if (speaking) pause();
    else play();
  }

  async function play() {
    if (run.current) return;
    const token = { cancelled: false };
    run.current = token;
    const gender = person?.gender ?? "m";
    const voice = NEURAL_VOICE[gender];
    let lib: VoiceLib | null = null;
    try {
      lib = await loadVoiceLib();
      if (lib.speechSupportIssue()) lib = null;
    } catch { lib = null; }
    if (token.cancelled) return;
    try {
      if (!lib) { setSpeaking(true); await browserVoice(avatar.current, gender); return; }
      // One sentence at a time: the first plays as soon as it is made, the next is made meanwhile.
      const parts = sentences(text);
      // made in advance, so these come straight from the cache
      const make = (i: number) => lib!.synthesizeSpeech(parts[i], voice).then((b) => b.arrayBuffer());
      setSpeaking(true);
      let next: Promise<ArrayBuffer> | null = make(0);
      for (let i = 0; i < parts.length && next; i++) {
        const buf = await next;
        await waitWhilePaused();
        if (token.cancelled) return;
        next = i + 1 < parts.length ? make(i + 1) : null;
        next?.catch(() => {});
        const a = avatar.current;
        if (a) await a.sayAudio(buf, parts[i]);
        else {
          const audio = new Audio(URL.createObjectURL(new Blob([buf], { type: "audio/wav" })));
          audioEl.current = audio;
          await new Promise<void>((done) => { audio.onended = () => done(); audio.onerror = () => done(); audio.play().catch(() => done()); });
        }
        if (token.cancelled) return;
      }
    } catch {
      // the neural voice failed (offline, blocked download): say it with the browser's voice
      if (!token.cancelled) { setSpeaking(true); await browserVoice(avatar.current, gender); }
    } finally {
      if (run.current === token) { run.current = null; setSpeaking(false); setPaused(false); pausedRef.current = false; }
    }
  }

  if (hidden || (!person && failed)) return null;

  const badge = "absolute flex h-7 w-7 items-center justify-center rounded-full text-white shadow";
  return (
    <div className={`fixed z-50 flex items-end gap-3 ${cutout ? "-bottom-[3px] -right-[3px]" : "bottom-5 right-5"}`} style={{ opacity: shown ? 1 : 0, pointerEvents: shown ? undefined : "none", transition: "opacity .5s" }} aria-hidden={!shown}>
      {shown && bubble && !speaking && !picker && (
        <button type="button" onClick={toggle}
          className="mb-6 hidden max-w-[220px] rounded-2xl rounded-br-sm bg-white px-4 py-2.5 text-left text-[13.5px] font-light leading-snug text-[#14171f] shadow-[0_12px_30px_-12px_rgba(0,0,0,0.35)] sm:block">
          {hint}
        </button>
      )}
      <div className="group relative" ref={pickerRef}>
        {picker && (
          <div role="dialog" aria-label="Choose an avatar"
            className="absolute bottom-[calc(100%+12px)] right-0 w-[284px] rounded-2xl border border-[#ebedf2] bg-white p-3 font-light text-[#14171f] shadow-[0_24px_50px_-20px_rgba(20,23,31,0.45)]">
            <p className="px-1 pb-2.5 text-[13.5px]">Choose an avatar</p>
            <div className="grid grid-cols-4 gap-2">
              {people.map((p) => {
                const sel = p.id === person?.id;
                return (
                  <button key={p.id} type="button" onClick={() => choose(p)} title={p.name}
                    className={`group/p flex flex-col items-center gap-1 rounded-xl p-1 transition-colors ${sel ? "bg-[#f1f0ff]" : "hover:bg-[#f6f7f9]"}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`${PEOPLE_BASE}${p.id}/thumb.jpg`} alt={p.name} loading="lazy"
                      className={`h-14 w-14 rounded-full object-cover ring-2 ${sel ? "ring-[#4f46e5]" : "ring-transparent group-hover/p:ring-[#e3e5ea]"}`} />
                    <span className={`text-[11.5px] ${sel ? "text-[#4f46e5]" : "text-[#5b6170]"}`}>{p.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <button type="button" onClick={toggle} aria-label={speaking && !paused ? "Pause" : paused ? "Carry on" : "Play introduction"}
          className={cutout
            ? "relative block [filter:drop-shadow(0_6px_16px_rgba(20,23,31,0.22))]"
            : "relative block overflow-hidden rounded-full border-[3px] border-white shadow-[0_14px_34px_-10px_rgba(0,0,0,0.45)] transition-transform hover:scale-[1.04]"}
          style={cutout
            ? { width: size, aspectRatio: "752 / 666" }
            : { width: size, height: size, background: "radial-gradient(120% 90% at 50% 30%, #e8edf3 0%, #c9d3df 100%)" }}>
          <div ref={stage} className="absolute inset-0 [&>canvas]:!h-full [&>canvas]:!w-full" />
          {failed && !ready && person && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`${PEOPLE_BASE}${person.id}/thumb.jpg`} alt="" className={`absolute inset-0 h-full w-full object-cover ${cutout ? "rounded-full" : ""}`} />
          )}
          {speaking && !paused && !cutout && <span className="pointer-events-none absolute inset-0 animate-pulse rounded-full ring-4 ring-[#4f46e5]/50" />}
        </button>
        <span className={`${badge} pointer-events-none -left-1 bottom-1 bg-[#4f46e5]`}>
          {speaking && !paused ? <Pause size={13} strokeWidth={2} /> : <Volume2 size={14} strokeWidth={1.8} />}
        </span>
        {people.length > 1 && (
          <button type="button" onClick={() => { setBubble(false); setPicker((v) => !v); }} aria-label="Choose an avatar" aria-expanded={picker}
            className={`${badge} -left-1 bottom-9 bg-[#14171f] transition-transform hover:scale-110`}>
            <Settings2 size={14} strokeWidth={1.8} />
          </button>
        )}
        <button type="button" onClick={() => { stop(); if (onHide) onHide(); else setHidden(true); }} aria-label="Hide"
          className="absolute -right-1 -top-1 hidden h-6 w-6 items-center justify-center rounded-full bg-white text-[#5b6170] shadow group-hover:flex">
          <X size={13} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

/** Show or hide the avatar; remembered on this device. */
export function useAvatarSwitch(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => { try { setOn(localStorage.getItem(ON_KEY) !== "0"); } catch { /* default on */ } }, []);
  const set = useCallback((v: boolean) => {
    setOn(v);
    try { localStorage.setItem(ON_KEY, v ? "1" : "0"); } catch { /* not kept */ }
  }, []);
  return [on, set];
}

/** Small round button with the chosen person's face, for the app's top bar. */
/** busy: the avatar is being prepared (a thin turning ring, nothing else). */
export function AvatarToggle({ on, busy = false, onToggle, className = "" }: { on: boolean; busy?: boolean; onToggle: () => void; className?: string }) {
  const [id, setId] = useState("p01");
  useEffect(() => {
    const pick = readPick();
    if (pick) setId(pick);
    const h = (e: Event) => setId((e as CustomEvent<string>).detail);
    window.addEventListener(PICK_EVENT, h);
    return () => window.removeEventListener(PICK_EVENT, h);
  }, []);
  return (
    <button type="button" onClick={onToggle} aria-pressed={on} title={on ? "Hide the assistant avatar" : "Show the assistant avatar"}
      aria-label={on ? "Hide the assistant avatar" : "Show the assistant avatar"}
      className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-sunken ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${PEOPLE_BASE}${id}/thumb.jpg`} alt="" className={`h-[26px] w-[26px] rounded-full object-cover ring-2 transition-[filter,opacity] ${on ? "ring-primary/70" : "opacity-60 ring-transparent grayscale"}`} />
      {busy
        ? <span className="pointer-events-none absolute inset-[3px] animate-spin rounded-full border-2 border-transparent border-t-primary" />
        : <span className={`absolute bottom-1 right-1 h-2 w-2 rounded-full border-2 border-surface ${on ? "bg-emerald-500" : "bg-faint"}`} />}
    </button>
  );
}
