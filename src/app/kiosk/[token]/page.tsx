"use client";

/*
 * Kiosk display: the full-screen page an office TV opens from its secret link. No sign-in.
 * It cycles a welcome clock, today's birthdays and work anniversaries, new joiners,
 * announcements, news and recent kudos, with a progress bar and dots. Data comes from
 * /public/kiosk/{token} and refreshes every 3 minutes; sizes follow the screen (vw/vh),
 * so 1280x720 and 1920x1080 both fill the frame.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { API_BASE, resolveImageUrl } from "@/lib/api";
import { avatarTint, initialsOf } from "@/components/ui-kit/avatar";
import { CelebrationDecor, CoverArt, PresetArt } from "@/components/engagement/art";
import { EngagementStyles } from "@/components/engagement/text";
import type { Cover } from "@/components/engagement/types";

type WallPerson = { name: string; first_name?: string; title?: string | null; department?: string | null; image?: string | null };
type Event = { kind: string; date: string; today: boolean; years: number | null; person: WallPerson };
type Ann = { uuid: string; kind: string; title: string; summary: string; cover: Cover; published_at: string | null };
type KudosItem = {
  message: string; giver: WallPerson; recipients: WallPerson[];
  value: { name: string; emoji: string; accent: string; soft: string } | null;
};
type Display = {
  kiosk: { name: string; seconds_per_slide: number; theme: "dark" | "light" | "festive"; welcome_text: string | null; slides: { type: string }[] };
  company: { name: string; logo: string | null; timezone: string | null };
  date: string;
  birthdays: Event[]; anniversaries: Event[]; new_joiners: WallPerson[];
  announcements: Ann[]; news: Ann[]; kudos: KudosItem[];
};
type Frame = { key: string; label: string; render: () => React.ReactNode };

const REFRESH_MS = 3 * 60_000;
const KIND_LABEL: Record<string, string> = { announcement: "Announcement", news: "News", policy: "Policy update", event: "Event" };

const THEMES = {
  dark: { bg: "radial-gradient(ellipse at 15% 0%, #312e81 0%, #0b1020 55%, #05070f 100%)", ink: "#f8fafc", muted: "rgba(226,232,240,.72)", card: "rgba(255,255,255,.06)", line: "rgba(255,255,255,.12)", accent: "#a5b4fc" },
  light: { bg: "linear-gradient(135deg, #fffaf3 0%, #f3f1ff 60%, #eef6ff 100%)", ink: "#111827", muted: "rgba(55,65,81,.75)", card: "rgba(255,255,255,.85)", line: "rgba(17,24,39,.08)", accent: "#4f46e5" },
  festive: { bg: "linear-gradient(135deg, #3b0764 0%, #831843 50%, #9a3412 100%)", ink: "#fff7ed", muted: "rgba(255,237,213,.8)", card: "rgba(255,255,255,.1)", line: "rgba(255,255,255,.16)", accent: "#fcd34d" },
};

function TvAvatar({ p, size, ring }: { p: WallPerson; size: string; ring?: string }) {
  const style: React.CSSProperties = { width: size, height: size, boxShadow: ring ? `0 0 0 0.35vw ${ring}` : undefined };
  if (p.image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={resolveImageUrl(p.image)} alt="" className="shrink-0 rounded-full object-cover" style={style} />;
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full text-white" style={{ ...style, background: `linear-gradient(135deg, ${avatarTint(p.name)}, ${avatarTint(p.name + "x")})`, fontSize: `calc(${size} * 0.36)` }}>
      {initialsOf(p.name)}
    </span>
  );
}

function useClock(tz: string | null | undefined) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const opts = tz ? { timeZone: tz } : {};
  let time: string, date: string, hour: number;
  try {
    time = new Intl.DateTimeFormat("en-IN", { ...opts, hour: "numeric", minute: "2-digit", hour12: true }).format(now);
    date = new Intl.DateTimeFormat("en-IN", { ...opts, weekday: "long", day: "numeric", month: "long" }).format(now);
    hour = Number(new Intl.DateTimeFormat("en-GB", { ...opts, hour: "numeric", hour12: false }).format(now));
  } catch {
    time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); date = now.toDateString(); hour = now.getHours();
  }
  return { time, date, hour };
}

function shortDay(iso: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z"));
}

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}

/* ── Slides ─────────────────────────────────────────────────────── */

function Heading({ eyebrow, title, t }: { eyebrow: string; title: string; t: (typeof THEMES)["dark"] }) {
  return (
    <div className="mb-[3vh]">
      <p className="uppercase" style={{ color: t.accent, fontSize: "1.1vw", letterSpacing: "0.25em" }}>{eyebrow}</p>
      <h2 className="font-light leading-[1.05]" style={{ fontSize: "4.4vw" }}>{title}</h2>
    </div>
  );
}

function CelebrationSlide({ kind, events, t }: { kind: "birthday" | "anniversary"; events: Event[]; t: (typeof THEMES)["dark"] }) {
  const today = events.filter((e) => e.today);
  const soon = events.filter((e) => !e.today).slice(0, 6);
  const birthday = kind === "birthday";
  const big = today.slice(0, 3);
  return (
    <div className="flex h-full flex-col">
      <Heading t={t} eyebrow={birthday ? "Birthdays" : "Work anniversaries"}
        title={today.length ? (birthday ? "Happy birthday! 🎂" : "Happy work anniversary! 🎉") : birthday ? "Birthdays this week 🎈" : "Anniversaries this week ✨"} />
      {big.length > 0 && (
        <div className="grid flex-1 gap-[2vw]" style={{ gridTemplateColumns: `repeat(${big.length}, minmax(0, 1fr))` }}>
          {big.map((e, i) => (
            <div key={e.person.name + i} className="kiosk-pop relative flex flex-col items-center justify-center overflow-hidden rounded-[2vw] px-[2vw] text-center text-white"
              style={{ background: birthday ? ["linear-gradient(140deg,#db2777,#7c3aed)", "linear-gradient(140deg,#f97316,#db2777)", "linear-gradient(140deg,#0ea5e9,#6366f1)"][i % 3] : ["linear-gradient(140deg,#d97706,#b45309)", "linear-gradient(140deg,#0f766e,#1e3a8a)", "linear-gradient(140deg,#7c3aed,#312e81)"][i % 3], animationDelay: `${i * 120}ms` }}>
              <CelebrationDecor theme={birthday ? (i % 2 ? "bubble" : "disco") : "fireworks"} seed={e.person.name} />
              <div className="relative flex flex-col items-center">
                <TvAvatar p={e.person} size={big.length === 1 ? "15vw" : "11vw"} ring="rgba(255,255,255,.85)" />
                <p className="mt-[2.5vh] font-light leading-tight" style={{ fontSize: big.length === 1 ? "4vw" : "2.8vw" }}>{e.person.name}</p>
                {(e.person.title || e.person.department) && <p className="mt-1 opacity-85" style={{ fontSize: "1.3vw" }}>{[e.person.title, e.person.department].filter(Boolean).join(" · ")}</p>}
                {!birthday && e.years != null && (
                  <span className="mt-[2vh] rounded-full bg-white/20 px-[1.4vw] py-[0.6vh] backdrop-blur" style={{ fontSize: "1.5vw" }}>{ordinal(e.years)} year with us</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {soon.length > 0 && (
        <div className={big.length ? "mt-[3vh]" : "flex flex-1 flex-col justify-center"}>
          {big.length > 0 && <p className="mb-[1.5vh] uppercase" style={{ color: t.muted, fontSize: "1vw", letterSpacing: "0.2em" }}>Coming up this week</p>}
          <div className={`grid gap-[1.4vw] ${big.length ? "grid-cols-6" : soon.length < 3 ? "mx-auto grid-flow-col [grid-auto-columns:minmax(0,32vw)] justify-center" : "grid-cols-3"}`}>
            {soon.map((e, i) => (
              <div key={e.person.name + i} className={`kiosk-pop flex items-center gap-[1vw] rounded-[1.2vw] ${big.length ? "p-[1vw]" : "p-[1.8vw]"}`} style={{ background: t.card, border: `1px solid ${t.line}`, animationDelay: `${200 + i * 80}ms` }}>
                <TvAvatar p={e.person} size={big.length ? "3.6vw" : "7vw"} ring={big.length ? undefined : t.accent} />
                <div className="min-w-0">
                  <p className="truncate" style={{ fontSize: big.length ? "1.15vw" : "2.2vw" }}>{big.length ? e.person.first_name || e.person.name : e.person.name}</p>
                  <p style={{ color: t.muted, fontSize: big.length ? "0.95vw" : "1.4vw" }}>{shortDay(e.date)}{!birthday && e.years ? ` · ${big.length ? `${e.years} yrs` : `${ordinal(e.years)} year`}` : ""}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function JoinersSlide({ people, t }: { people: WallPerson[]; t: (typeof THEMES)["dark"] }) {
  const shown = people.slice(0, 8);
  const cols = shown.length <= 3 ? shown.length : 4;
  return (
    <div className="flex h-full flex-col">
      <Heading t={t} eyebrow="New joiners" title="Please welcome 👋" />
      <div className="grid flex-1 content-center gap-[2vw]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {shown.map((p, i) => (
          <div key={p.name + i} className="kiosk-pop flex flex-col items-center rounded-[1.6vw] px-[1vw] py-[3vh] text-center" style={{ background: t.card, border: `1px solid ${t.line}`, animationDelay: `${i * 90}ms` }}>
            <TvAvatar p={p} size={shown.length <= 3 ? "11vw" : "7vw"} ring={t.accent} />
            <p className="mt-[2vh] truncate font-light" style={{ fontSize: shown.length <= 3 ? "2.6vw" : "1.8vw", maxWidth: "100%" }}>{p.name}</p>
            <p className="truncate" style={{ color: t.muted, fontSize: "1.15vw", maxWidth: "100%" }}>{p.title || p.department || "New colleague"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnnouncementSlide({ a, t }: { a: Ann; t: (typeof THEMES)["dark"] }) {
  return (
    <div className="grid h-full grid-cols-[1.15fr_1fr] gap-[3vw]">
      <CoverArt cover={a.cover} fallback={a.kind === "news" ? "festive" : "aurora"} className="kiosk-pop h-full rounded-[2vw]" />
      <div className="flex flex-col justify-center">
        <span className="mb-[2.5vh] inline-flex w-fit items-center rounded-full px-[1.2vw] py-[0.6vh] uppercase" style={{ background: t.card, border: `1px solid ${t.line}`, color: t.accent, fontSize: "1vw", letterSpacing: "0.2em" }}>
          {KIND_LABEL[a.kind] ?? "Announcement"}
        </span>
        <h2 className="kiosk-rise font-light leading-[1.08]" style={{ fontSize: a.title.length > 60 ? "3.2vw" : "4vw" }}>{a.title}</h2>
        {a.summary && <p className="kiosk-rise mt-[3vh] leading-snug" style={{ color: t.muted, fontSize: "1.7vw", animationDelay: "150ms", display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.summary}</p>}
      </div>
    </div>
  );
}

function KudosSlide({ k, t }: { k: KudosItem; t: (typeof THEMES)["dark"] }) {
  const accent = k.value?.accent ?? "#d98a06";
  return (
    <div className="flex h-full flex-col">
      <Heading t={t} eyebrow="Kudos" title="Shout-outs from the team 💛" />
      <div className="kiosk-pop relative flex flex-1 items-center overflow-hidden rounded-[2vw] px-[4vw]" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc 45%, #1f1147)` }}>
        <div className="pointer-events-none absolute inset-0 opacity-40"><CelebrationDecor theme="golden" seed={k.message} /></div>
        <div className="relative grid w-full grid-cols-[auto_1fr] items-center gap-[4vw] text-white">
          <div className="flex flex-col items-center">
            <span className="flex items-center justify-center rounded-full bg-white/15 backdrop-blur" style={{ width: "13vw", height: "13vw", fontSize: "7vw" }}>{k.value?.emoji ?? "🌟"}</span>
            {k.value && <p className="mt-[2vh] rounded-full bg-white/20 px-[1.2vw] py-[0.5vh]" style={{ fontSize: "1.3vw" }}>{k.value.name}</p>}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-[1.2vw]">
              <div className="flex -space-x-[1vw]">{k.recipients.slice(0, 4).map((r, i) => <TvAvatar key={i} p={r} size="5.2vw" ring="rgba(255,255,255,.9)" />)}</div>
              <p className="font-light" style={{ fontSize: "2.6vw" }}>{k.recipients.map((r) => r.first_name || r.name).join(", ")}</p>
            </div>
            <p className="mt-[3vh] font-light leading-snug" style={{ fontSize: k.message.length > 160 ? "2vw" : "2.6vw", display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>“{k.message}”</p>
            <p className="mt-[3vh] opacity-85" style={{ fontSize: "1.4vw" }}>— {k.giver.name}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function WelcomeSlide({ d, clock, t }: { d: Display; clock: ReturnType<typeof useClock>; t: (typeof THEMES)["dark"] }) {
  const hello = clock.hour < 12 ? "Good morning" : clock.hour < 17 ? "Good afternoon" : "Good evening";
  const chips = [
    d.birthdays.filter((e) => e.today).length && `🎂 ${d.birthdays.filter((e) => e.today).length} birthday${d.birthdays.filter((e) => e.today).length > 1 ? "s" : ""} today`,
    d.anniversaries.filter((e) => e.today).length && `🎉 ${d.anniversaries.filter((e) => e.today).length} work anniversar${d.anniversaries.filter((e) => e.today).length > 1 ? "ies" : "y"} today`,
    d.new_joiners.length && `👋 ${d.new_joiners.length} new joiner${d.new_joiners.length > 1 ? "s" : ""}`,
    d.kudos.length && `💛 ${d.kudos.length} kudos lately`,
  ].filter(Boolean) as string[];
  return (
    <div className="relative flex h-full flex-col items-center justify-center text-center">
      <p className="kiosk-rise uppercase" style={{ color: t.accent, fontSize: "1.3vw", letterSpacing: "0.3em" }}>{hello}</p>
      <p className="kiosk-rise font-extralight tabular-nums leading-none" style={{ fontSize: "13vw", animationDelay: "80ms" }}>{clock.time.replace(/\s?(am|pm)/i, "")}<span style={{ fontSize: "3vw", marginLeft: "1vw", color: t.muted }}>{/pm/i.test(clock.time) ? "PM" : "AM"}</span></p>
      <p className="kiosk-rise mt-[1vh]" style={{ fontSize: "2.2vw", color: t.muted, animationDelay: "160ms" }}>{clock.date}</p>
      <p className="kiosk-rise mt-[5vh] max-w-[70vw] font-light" style={{ fontSize: "3vw", animationDelay: "240ms" }}>{d.kiosk.welcome_text || `Welcome to ${d.company.name}`}</p>
      {chips.length > 0 && (
        <div className="kiosk-rise mt-[5vh] flex flex-wrap justify-center gap-[1vw]" style={{ animationDelay: "320ms" }}>
          {chips.map((c) => <span key={c} className="rounded-full px-[1.6vw] py-[1vh]" style={{ background: t.card, border: `1px solid ${t.line}`, fontSize: "1.4vw" }}>{c}</span>)}
        </div>
      )}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────── */

function Message({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center p-8 text-center text-white" style={{ background: THEMES.dark.bg }}>
      <div>
        <p className="font-light" style={{ fontSize: "clamp(28px, 3.2vw, 64px)" }}>{title}</p>
        <p className="mt-3 text-white/70" style={{ fontSize: "clamp(15px, 1.3vw, 26px)" }}>{hint}</p>
      </div>
    </div>
  );
}

export default function KioskDisplayPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Display | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing" | "offline">("loading");
  const [index, setIndex] = useState(0);
  const [tick, setTick] = useState(0); // restarts the progress bar

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/public/kiosk/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (r.status === 404) { setState("missing"); setData(null); return; }
      if (!r.ok) throw new Error(String(r.status));
      setData(await r.json());
      setState("ok");
    } catch {
      setState((s) => (s === "ok" ? "ok" : "offline")); // keep showing the last good data
    }
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const t = THEMES[data?.kiosk.theme ?? "dark"] ?? THEMES.dark;
  const clock = useClock(data?.company.timezone);

  const frames = useMemo<Frame[]>(() => {
    if (!data) return [];
    const out: Frame[] = [];
    for (const s of data.kiosk.slides) {
      if (s.type === "welcome") out.push({ key: "welcome", label: "Welcome", render: () => null });
      if (s.type === "birthdays" && data.birthdays.length) out.push({ key: "birthdays", label: "Birthdays", render: () => <CelebrationSlide kind="birthday" events={data.birthdays} t={t} /> });
      if (s.type === "anniversaries" && data.anniversaries.length) out.push({ key: "anniversaries", label: "Anniversaries", render: () => <CelebrationSlide kind="anniversary" events={data.anniversaries} t={t} /> });
      if (s.type === "new_joiners" && data.new_joiners.length) out.push({ key: "joiners", label: "New joiners", render: () => <JoinersSlide people={data.new_joiners} t={t} /> });
      if (s.type === "announcements") data.announcements.slice(0, 5).forEach((a) => out.push({ key: `a-${a.uuid}`, label: "Announcement", render: () => <AnnouncementSlide a={a} t={t} /> }));
      if (s.type === "news") data.news.slice(0, 5).forEach((a) => out.push({ key: `n-${a.uuid}`, label: "News", render: () => <AnnouncementSlide a={a} t={t} /> }));
      if (s.type === "kudos") data.kudos.slice(0, 6).forEach((k, i) => out.push({ key: `k-${i}`, label: "Kudos", render: () => <KudosSlide k={k} t={t} /> }));
    }
    if (!out.length) out.push({ key: "welcome", label: "Welcome", render: () => null });
    return out;
  }, [data, t]);

  const seconds = Math.max(5, data?.kiosk.seconds_per_slide ?? 10);
  useEffect(() => {
    if (frames.length <= 1) return;
    const id = setTimeout(() => { setIndex((i) => (i + 1) % frames.length); setTick((n) => n + 1); }, seconds * 1000);
    return () => clearTimeout(id);
  }, [frames.length, seconds, tick]);
  useEffect(() => { if (frames.length && index >= frames.length) setIndex(0); }, [frames.length, index]);
  // ?slide=<n> starts on a given slide (handy when setting up a screen)
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get("slide"));
    if (n > 0) setIndex(n - 1);
  }, []);

  if (state === "loading") return <div className="h-screen w-screen" style={{ background: THEMES.dark.bg }} />;
  if (state === "missing") return <Message title="This screen link isn't active" hint="Ask your HR team for the current kiosk link. Links stop working when they are changed or the screen is switched off." />;
  if (!data) return <Message title="Can't reach the server" hint="We'll keep trying every few minutes." />;

  const frame = frames[Math.min(index, frames.length - 1)];
  return (
    <div className="kiosk relative flex h-screen w-screen cursor-none flex-col overflow-hidden" style={{ background: t.bg, color: t.ink }}>
      <EngagementStyles />
      <style>{`
        @keyframes kiosk-in { from { opacity: 0; transform: translateY(1.2vh) scale(.985) } to { opacity: 1; transform: none } }
        .kiosk-stage { animation: kiosk-in .8s cubic-bezier(.2,.7,.2,1) both; }
        @keyframes kiosk-pop { from { opacity: 0; transform: translateY(2vh) scale(.96) } to { opacity: 1; transform: none } }
        .kiosk-pop { animation: kiosk-pop .7s cubic-bezier(.2,.8,.2,1.05) both; }
        .kiosk-rise { animation: kiosk-pop .7s ease-out both; }
        @keyframes kiosk-bar { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        @keyframes kiosk-drift { 0%,100% { transform: translate(0,0) } 50% { transform: translate(2vw,-2vh) } }
        @media (prefers-reduced-motion: reduce) { .kiosk-stage, .kiosk-pop, .kiosk-rise { animation: none !important; } }
      `}</style>
      {/* soft background glow */}
      <div className="pointer-events-none absolute -right-[10vw] -top-[20vh] h-[60vh] w-[50vw] rounded-full opacity-40 blur-3xl" style={{ background: t.accent, animation: "kiosk-drift 18s ease-in-out infinite" }} />
      {frame.key === "welcome" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[34vh] opacity-30 [mask-image:linear-gradient(to_top,black,transparent)]">
          <PresetArt preset={data.kiosk.theme === "light" ? "lavender" : data.kiosk.theme === "festive" ? "festive" : "aurora"} className="h-full w-full" />
        </div>
      )}

      {/* header */}
      <header className="relative flex items-center justify-between px-[4vw] pt-[4vh]">
        <div className="flex items-center gap-[1vw]">
          {data.company.logo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={resolveImageUrl(data.company.logo)} alt="" className="h-[5vh] w-auto rounded-lg" />
            : <span className="flex h-[5vh] w-[5vh] items-center justify-center rounded-xl" style={{ background: t.accent, color: data.kiosk.theme === "light" ? "#fff" : "#111827", fontSize: "2.4vh" }}>{initialsOf(data.company.name)}</span>}
          <span style={{ fontSize: "1.5vw" }}>{data.company.name}</span>
        </div>
        {frame.key !== "welcome" && (
          <div className="text-right">
            <p className="tabular-nums leading-none" style={{ fontSize: "2.2vw" }}>{clock.time}</p>
            <p style={{ color: t.muted, fontSize: "1vw" }}>{clock.date}</p>
          </div>
        )}
      </header>

      {/* stage */}
      <main key={`${frame.key}-${tick}`} className="kiosk-stage relative min-h-0 flex-1 px-[4vw] py-[3vh]">
        {frame.key === "welcome" ? <WelcomeSlide d={data} clock={clock} t={t} /> : frame.render()}
      </main>

      {/* footer: dots and progress */}
      <footer className="relative flex items-center justify-between px-[4vw] pb-[3.5vh]">
        <div className="flex items-center gap-[0.6vw]">
          {frames.map((f, i) => (
            <span key={f.key} className="rounded-full transition-all duration-500" style={{ height: "0.9vh", width: i === index ? "3vw" : "0.9vh", background: i === index ? t.accent : t.line }} />
          ))}
        </div>
        <p style={{ color: t.muted, fontSize: "0.95vw" }}>{frame.label} · {data.kiosk.name}{state === "offline" ? " · reconnecting…" : ""}</p>
      </footer>
      {frames.length > 1 && (
        <div key={`bar-${tick}`} className="absolute bottom-0 left-0 h-[0.5vh] w-full origin-left" style={{ background: t.accent, opacity: 0.7, animation: `kiosk-bar ${seconds}s linear both` }} />
      )}
    </div>
  );
}
