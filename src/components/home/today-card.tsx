"use client";

/*
 * Today card on the Overview: today's shift, a clock in / out button with a running
 * timer, the day's status, and shortcuts for work from home and on duty requests.
 *   <TodayCard className="lg:col-span-5" />
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Briefcase, Clock3, Home as HomeIcon, LogIn, LogOut, MapPin, Moon, Sun } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatTime, viewerTimeZone } from "@/lib/datetime";
import { Badge, Skeleton, type BadgeTone } from "@/components/ui-kit";
import { RequestModal, type RequestKind } from "@/components/attendance/request-modal";
import { HomeCard, STROKE, Unavailable, useLoad } from "./kit";

type Punch = { uuid: string; punched_at: string; direction: string | null; ignored?: boolean };
type Today = {
  date: string; now: string;
  day: { status: string; status_label: string; shift_name?: string | null; is_late?: boolean; late_minutes?: number; holiday_name?: string | null } | null;
  plan: { day_type: string; holiday_name: string | null; punch_required: boolean;
    shift: { name: string; start_time: string; end_time: string; is_flexible: boolean; full_day_hours: number; breaks?: { name: string; start: string; end: string }[] } | null };
  punches: Punch[]; clocked_in: boolean; next_action: "in" | "out";
  settings: { web_enabled: boolean; geo_required: boolean; selfie_required: boolean; face_required?: boolean };
};

const TONE: Record<string, BadgeTone> = {
  present: "good", half_day: "warn", wfh: "info", on_duty: "info", on_leave: "accent", absent: "bad",
  missing_punch: "warn", holiday: "neutral", weekly_off: "neutral", not_yet: "neutral",
};

function useTick(ms: number, on: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, on]);
  return now;
}

/** Seconds worked today from the punch pairs; an open "in" runs until now. */
function workedSeconds(punches: Punch[], now: number) {
  const ts = punches.filter((p) => !p.ignored).map((p) => new Date(p.punched_at).getTime()).sort((a, b) => a - b);
  let s = 0;
  for (let i = 0; i < ts.length; i += 2) s += ((ts[i + 1] ?? now) - ts[i]) / 1000;
  return Math.max(0, Math.floor(s));
}

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}:${pad(m)} ${ap}`;
};

function getPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve(p), () => resolve(null), { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 });
  });
}

export function TodayCard({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad<Today>("/attendance/me/today", 5);
  const [today, setToday] = useState<Today | null>(null);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState<RequestKind | null>(null);
  useEffect(() => { if (data) setToday(data); }, [data]);

  const now = useTick(1000, !!today?.clocked_in);
  const secs = useMemo(() => (today ? workedSeconds(today.punches, now) : 0), [today, now]);
  const shift = today?.plan.shift;
  const target = (shift?.full_day_hours ?? 8) * 3600;
  const firstIn = today?.punches.find((p) => !p.ignored)?.punched_at;
  const status = today?.clocked_in ? "present" : today?.day?.status ?? "not_yet";
  const statusLabel = today?.clocked_in ? "Working" : today?.day?.status_label ?? "Not in yet";
  const offDay = today && ["weekly_off", "holiday"].includes(today.plan.day_type);

  async function punch() {
    if (!today) return;
    setBusy(true);
    try {
      const pos = await getPosition();
      if (!pos && today.settings.geo_required) throw new Error("Allow location access in your browser to clock in.");
      const r = await api.post<{ today: Today }>("/attendance/me/clock", {
        direction: today.next_action,
        latitude: pos?.coords.latitude ?? null, longitude: pos?.coords.longitude ?? null, accuracy: pos?.coords.accuracy ?? null,
      });
      toast.success(today.next_action === "in" ? "Clocked in. Have a good day!" : "Clocked out");
      if (r?.today) setToday(r.today); else reload();
      api.invalidate("/attendance/me/today");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't record the punch");
    } finally {
      setBusy(false);
    }
  }

  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const needsAttendancePage = today && (today.settings.selfie_required || today.settings.face_required || !today.settings.web_enabled);

  return (
    <HomeCard title="Today" icon={Clock3} href="/dashboard/attendance" link="Attendance" className={className} delay={delay}>
      {loading && !today ? (
        <div className="space-y-4 px-5 py-5"><Skeleton className="h-4 w-40" /><Skeleton className="h-12 w-48" /><Skeleton className="h-10 w-full rounded-xl" /></div>
      ) : error || !today ? <Unavailable /> : (
        <div className="flex flex-1 flex-col px-5 pb-5 pt-2">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {offDay ? <Moon size={14} strokeWidth={STROKE} /> : <Sun size={14} strokeWidth={STROKE} />}
            {today.plan.holiday_name ? <span>{today.plan.holiday_name}</span>
              : shift ? <span>{shift.name} · {shift.is_flexible ? "Flexible hours" : `${hhmm(shift.start_time)} – ${hhmm(shift.end_time)}`}</span>
                : <span>No shift today</span>}
            <Badge tone={TONE[status] ?? "neutral"} dot className="ml-auto">{statusLabel}</Badge>
          </div>

          <div className="mt-5 flex items-end gap-4">
            <div className="min-w-0">
              <p className="tabular text-[40px] font-extralight leading-none tracking-tight text-ink">
                {pad(h)}<span className="text-faint">:</span>{pad(m)}<span className="text-[22px] text-faint">:{pad(s)}</span>
              </p>
              <p className="mt-1.5 text-[12.5px] text-faint">
                {firstIn ? `In at ${formatTime(firstIn)}` : "Hours worked today"}
                {today.day?.is_late && today.day.late_minutes ? ` · ${today.day.late_minutes} min late` : ""}
              </p>
            </div>
          </div>
          <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-sunken">
            <div className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (secs / target) * 100)}%` }} />
          </div>

          <DayTimeline today={today} />

          <div className="mt-auto pt-5">
            {needsAttendancePage ? (
              <Link href="/dashboard/attendance" className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-[14.5px] text-white transition-colors hover:bg-primary-dark">
                <LogIn size={17} strokeWidth={STROKE} /> {today.next_action === "in" ? "Clock in" : "Clock out"} on Attendance
              </Link>
            ) : (
              <button type="button" onClick={punch} disabled={busy}
                className={`group relative flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl border text-[14.5px] transition-colors disabled:opacity-60 ${
                  today.next_action === "in" ? "border-primary bg-primary text-white hover:bg-primary-dark" : "border-line-strong bg-surface text-ink hover:border-primary/50 hover:text-primary"}`}>
                {today.clocked_in && <span className="absolute left-4 h-2 w-2 animate-pulse rounded-full bg-emerald-500" aria-hidden />}
                {today.next_action === "in" ? <LogIn size={17} strokeWidth={STROKE} /> : <LogOut size={17} strokeWidth={STROKE} />}
                {busy ? "Saving…" : today.next_action === "in" ? "Clock in" : "Clock out"}
              </button>
            )}
            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setAsking("wfh")} className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line text-[13px] text-muted transition-colors hover:border-primary/40 hover:text-primary">
                <HomeIcon size={14} strokeWidth={STROKE} /> Work from home
              </button>
              <button type="button" onClick={() => setAsking("on_duty")} className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-line text-[13px] text-muted transition-colors hover:border-primary/40 hover:text-primary">
                <Briefcase size={14} strokeWidth={STROKE} /> On duty
              </button>
            </div>
            {today.settings.geo_required && <p className="mt-2 flex items-center gap-1 text-[11.5px] text-faint"><MapPin size={11} strokeWidth={STROKE} /> Your location is checked when you clock in.</p>}
          </div>
        </div>
      )}
      <RequestModal key={asking ?? "none"} kind={asking} onClose={() => setAsking(null)} onSent={() => setAsking(null)} />
    </HomeCard>
  );
}

/* ── Day timeline: the shift window, breaks, punches and a "now" marker ── */

function minutesOfDay(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: viewerTimeZone() }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  return h * 60 + Number(parts.find((p) => p.type === "minute")?.value ?? 0);
}
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };

function DayTimeline({ today }: { today: Today }) {
  const now = useTick(60_000, true);
  const shift = today.plan.shift;
  const start = shift ? toMin(shift.start_time) : 9 * 60;
  let end = shift ? toMin(shift.end_time) : 18 * 60;
  if (end <= start) end += 24 * 60;
  const from = Math.max(0, Math.floor((start - 120) / 60) * 60);
  const to = Math.min(48 * 60, Math.ceil((end + 120) / 60) * 60);
  const pos = (m: number) => `${Math.max(0, Math.min(100, ((m - from) / (to - from)) * 100))}%`;
  const nowMin = minutesOfDay(new Date(now));
  const punches = today.punches.filter((p) => !p.ignored);
  const ticks: number[] = [];
  for (let m = from; m <= to; m += 180) ticks.push(m);
  const label = (m: number) => { const h = Math.floor(m / 60) % 24; return `${((h + 11) % 12) + 1}${h >= 12 ? "p" : "a"}`; };

  return (
    <div className="mt-6">
      <div className="relative h-9">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line" />
        {shift && (
          <div className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-primary-soft"
            style={{ left: pos(start), width: `calc(${pos(end)} - ${pos(start)})` }} title={`${shift.name} shift`} />
        )}
        {(shift?.breaks ?? []).map((b) => (
          <div key={b.name + b.start} className="absolute top-1/2 h-2.5 -translate-y-1/2 bg-[repeating-linear-gradient(135deg,var(--hr-line-strong)_0_2px,transparent_2px_5px)]"
            style={{ left: pos(toMin(b.start)), width: `calc(${pos(toMin(b.end))} - ${pos(toMin(b.start))})` }} title={b.name} />
        ))}
        {punches.map((p, i) => (
          <span key={p.uuid} title={`${i % 2 ? "Out" : "In"} ${formatTime(p.punched_at)}`}
            className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface ${i % 2 ? "bg-ink/60" : "bg-primary"}`}
            style={{ left: pos(minutesOfDay(new Date(p.punched_at))) }} />
        ))}
        {nowMin >= from && nowMin <= to && (
          <span className="absolute inset-y-0 w-px bg-rose-400" style={{ left: pos(nowMin) }}>
            <span className="absolute -top-0.5 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-rose-400" />
          </span>
        )}
      </div>
      <div className="relative mt-1 h-4 text-[10.5px] text-faint">
        {ticks.map((m) => <span key={m} className="absolute -translate-x-1/2" style={{ left: pos(m) }}>{label(m)}</span>)}
      </div>
      <ul className="mt-4 space-y-1.5 text-[12.5px]">
        {punches.length === 0 ? (
          <li className="text-faint">No punches yet today.</li>
        ) : punches.slice(-4).map((p, i, arr) => {
          const idx = punches.length - arr.length + i;
          return (
            <li key={p.uuid} className="flex items-center gap-2 text-muted">
              <span className={`h-1.5 w-1.5 rounded-full ${idx % 2 ? "bg-ink/60" : "bg-primary"}`} />
              <span className="w-8 text-faint">{idx % 2 ? "Out" : "In"}</span>
              <span className="tabular text-ink">{formatTime(p.punched_at)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
