"use client";

/*
 * My attendance: today's card with clock in / out (location and selfie when the company
 * asks for them), the month as a colour-coded calendar (a day opens its details), request
 * buttons (correction, work from home, on duty, permission hours, overtime) and my requests.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Camera, ChevronLeft, ChevronRight, Clock, Coffee, FilePen, Fingerprint, Home, LogIn, LogOut, MapPin, Moon,
  Briefcase, Hourglass, KeyRound, TimerReset, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatLongDate, formatMonth, formatTime } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, DataTable, FilterBar, IconButton, KeyValue, Modal, ModalCancel, Skeleton, StatCard, useConfirm,
  type Column, type FilterValues,
} from "@/components/ui-kit";
import { RequestModal, type RequestKind } from "@/components/attendance/request-modal";
import { KioskPinModal } from "@/components/attendance/kiosk-pin-modal";
import { FaceClockModal, MyFaceModal } from "@/components/face_attendance/self-service";
import { ScanFace } from "lucide-react";
import {
  REQUEST_KINDS, RequestStatus, StatusBadge, WEEKDAYS, errorText, minutesText, monthGrid, shiftColor, statusInfo,
  useAttendanceAccess,
} from "@/components/attendance/shared";

const STROKE = 1.4;

type Punch = { uuid: string; punched_at: string; direction: string | null; source: string; fence_name?: string | null; distance_m?: number | null; has_selfie: boolean; ignored: boolean; note?: string | null };
type Shift = { name: string; start_time: string; end_time: string; color: string; crosses_midnight: boolean; is_flexible: boolean };
type Day = {
  uuid?: string; date: string; status: string; status_label: string; day_type: string; shift_name?: string | null; shift_code?: string | null;
  shift_color?: string | null; first_in?: string | null; last_out?: string | null; worked_minutes?: number; late_minutes?: number;
  early_minutes?: number; overtime_minutes?: number; is_late?: boolean; is_early_exit?: boolean; notes: string[];
  holiday_name?: string | null; payable_days?: string; lop_days?: string; penalty_lop_days?: string; future?: boolean;
  requests?: Req[]; punch_count?: number; permission_minutes?: number; break_minutes?: number; locked?: boolean;
};
type Today = {
  date: string; day: Day | null; plan: { day_type: string; shift: Shift | null; holiday_name: string | null; punch_required: boolean };
  punches: Punch[]; clocked_in: boolean; next_action: "in" | "out";
  settings: { web_enabled: boolean; geo_required: boolean; selfie_required: boolean; face_required?: boolean };
};
type Month = { year: number; month: number; days: Day[]; summary: Record<string, number | string> };
type Req = {
  uuid: string; kind: string; kind_label: string; date: string; end_date: string | null; from_time: string | null; to_time: string | null;
  minutes: number | null; duration: string | null; reason: string | null; status: string; created_at: string;
  reference_no?: string | null; workflow_uuid?: string | null; details?: Record<string, unknown>;
};

const REQUEST_BUTTONS: { kind: RequestKind; label: string; icon: typeof Home }[] = [
  { kind: "regularisation", label: "Fix attendance", icon: FilePen },
  { kind: "wfh", label: "Work from home", icon: Home },
  { kind: "on_duty", label: "On duty", icon: Briefcase },
  { kind: "permission", label: "Permission", icon: Hourglass },
  { kind: "overtime", label: "Overtime", icon: TimerReset },
];

export default function MyAttendancePage() {
  const access = useAttendanceAccess();
  const toast = useToast();
  const [today, setToday] = useState<Today | null>(null);
  const [ymPicked, setYm] = useState<{ y: number; m: number } | null>(null);
  const [monthData, setMonth] = useState<{ key: string; data: Month } | null>(null);
  const [asking, setAsking] = useState<{ kind: RequestKind; date?: string } | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [myFaceOpen, setMyFaceOpen] = useState(false);
  const [openDay, setOpenDay] = useState<Day | null>(null);
  const [nonce, setNonce] = useState(0);
  const isEmployee = !!access?.employee_id;

  const ym = useMemo(() => {
    if (ymPicked) return ymPicked;
    if (!access) return null;
    const [y, m] = access.today.split("-").map(Number);
    return { y, m };
  }, [ymPicked, access]);
  const monthKey = ym ? `${ym.y}-${ym.m}-${nonce}` : "";
  const month = monthData?.key === monthKey ? monthData.data : null;

  const loadToday = useCallback(() => {
    api.get<Today>("/attendance/me/today").then(setToday).catch((e) => toast.error(errorText(e, "Couldn't load today")));
  }, [toast]);

  useEffect(() => { if (isEmployee) loadToday(); }, [isEmployee, loadToday, nonce]);
  useEffect(() => {
    if (!isEmployee || !ym) return;
    let live = true;
    api.get<Month>(`/attendance/me/month?year=${ym.y}&month=${ym.m}`)
      .then((r) => { if (live) setMonth({ key: monthKey, data: r }); })
      .catch((e) => toast.error(errorText(e, "Couldn't load the month")));
    return () => { live = false; };
  }, [isEmployee, ym, monthKey, toast]);

  const refresh = () => setNonce((n) => n + 1);
  const shiftMonth = (d: number) => setYm(() => {
    const c = ym;
    if (!c) return c;
    const m = c.m + d;
    return m < 1 ? { y: c.y - 1, m: 12 } : m > 12 ? { y: c.y + 1, m: 1 } : { y: c.y, m };
  });

  if (access && !isEmployee) {
    return (
      <>
        <PageHeader title="Attendance" description="Your own attendance appears here when you sign in as an employee." />
        <Paper>
          <EmptyState icon={Users} title="You are signed in as the company owner"
            hint="See everyone's attendance on the team board, or correct and lock records in Attendance admin."
            action={<div className="flex gap-2">
              <Link href="/dashboard/attendance/team"><Button>Team attendance</Button></Link>
              <Link href="/dashboard/attendance/admin"><Button variant="primary">Attendance admin</Button></Link>
            </div>} />
        </Paper>
      </>
    );
  }

  return (
    <>
      <PageHeader title="My attendance" description="Clock in and out, see your month and ask for corrections."
        actions={<div className="flex flex-wrap gap-2">
          {REQUEST_BUTTONS.map((b) => (
            <Button key={b.kind} size="sm" icon={b.icon} onClick={() => setAsking({ kind: b.kind })}>{b.label}</Button>
          ))}
          <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => setPinOpen(true)}>Kiosk PIN</Button>
          <Button size="sm" variant="ghost" icon={ScanFace} onClick={() => setMyFaceOpen(true)}>Face sign-in</Button>
        </div>} />
      {pinOpen && <KioskPinModal onClose={() => setPinOpen(false)} />}
      {myFaceOpen && <MyFaceModal onClose={() => setMyFaceOpen(false)} />}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <TodayCard today={today} onPunched={(t) => { setToday(t); setNonce((n) => n + 1); }} />
        <div className="space-y-5">
          <MonthStats month={month} />
          <Paper>
            <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
              <p className="text-[15px] text-ink">{ym ? formatMonth(`${ym.y}-${String(ym.m).padStart(2, "0")}-01`) : ""}</p>
              <div className="flex items-center gap-1">
                <IconButton icon={ChevronLeft} label="Previous month" onClick={() => shiftMonth(-1)} />
                <IconButton icon={ChevronRight} label="Next month" onClick={() => shiftMonth(1)} />
              </div>
            </div>
            <MonthCalendar ym={ym} month={month} onPick={setOpenDay} />
            <Legend />
          </Paper>
        </div>
      </div>

      <MyRequests nonce={nonce} onChanged={refresh} />

      <DayModal day={openDay} onClose={() => setOpenDay(null)}
        onAsk={(kind, date) => { setOpenDay(null); setAsking({ kind, date }); }} />
      <RequestModal key={asking ? `${asking.kind}-${asking.date ?? ""}` : "none"} kind={asking?.kind ?? null}
        date={asking?.date ?? null} onClose={() => setAsking(null)}
        onSent={() => { setAsking(null); refresh(); }} />
    </>
  );
}

/* ── Today ─────────────────────────────────────────────────────────── */

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function getPosition(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition((p) => resolve(p), () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 });
  });
}

function TodayCard({ today, onPunched }: { today: Today | null; onPunched: (t: Today) => void }) {
  const toast = useToast();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [faceOpen, setFaceOpen] = useState(false);

  async function punch(selfie?: string) {
    if (!today) return;
    setBusy(true);
    try {
      const pos = await getPosition();
      if (!pos && today.settings.geo_required) throw new Error("Allow location access in your browser to clock in.");
      const r = await api.post<{ today: Today }>("/attendance/me/clock", {
        direction: today.next_action, selfie: selfie || null,
        latitude: pos?.coords.latitude ?? null, longitude: pos?.coords.longitude ?? null, accuracy: pos?.coords.accuracy ?? null,
      });
      toast.success(today.next_action === "in" ? "Clocked in" : "Clocked out");
      onPunched(r.today);
    } catch (e) {
      toast.error(errorText(e, "Couldn't record the punch"));
    } finally {
      setBusy(false);
    }
  }

  if (!today) return <Paper className="p-6"><Skeleton className="h-64 w-full rounded-xl" /></Paper>;
  const shift = today.plan.shift;
  const day = today.day;
  const first = today.punches.find((p) => !p.ignored);
  const runningMin = today.clocked_in && first ? Math.max(0, Math.round((now - new Date(first.punched_at).getTime()) / 60000)) : null;
  const worked = runningMin ?? day?.worked_minutes ?? 0;
  const off = today.plan.day_type !== "working";
  const c = shiftColor(shift?.color);

  return (
    <Paper className="overflow-hidden">
      <div className="border-b border-line px-6 py-5">
        <p className="text-[12px] uppercase tracking-[0.08em] text-faint">Today</p>
        <p className="mt-1 text-[19px] font-light text-ink">{formatLongDate(today.date)}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {day ? <StatusBadge status={day.status} /> : <Badge tone="neutral">Not in yet</Badge>}
          {shift && !off && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] ${c.chip}`}>
              {shift.crosses_midnight ? <Moon size={12} strokeWidth={STROKE} /> : <Clock size={12} strokeWidth={STROKE} />}
              {shift.name} · {shift.start_time}–{shift.end_time}
            </span>
          )}
          {today.plan.holiday_name && <Badge tone="accent">{today.plan.holiday_name}</Badge>}
          {day?.is_late && <Badge tone="warn">Late {minutesText(day.late_minutes)}</Badge>}
        </div>
      </div>

      <div className="flex flex-col items-center px-6 py-7 text-center">
        <p className="tabular text-[44px] font-extralight leading-none text-ink">{minutesText(worked).replace(" min", "m").replace(" h", "h")}</p>
        <p className="mt-2 text-[13px] text-muted">{today.clocked_in ? "Worked so far" : "Worked today"}</p>
        {!today.plan.punch_required ? (
          <p className="mt-6 max-w-[260px] text-[13.5px] text-muted">You are marked present by default. No need to clock in.</p>
        ) : !today.settings.web_enabled ? (
          <p className="mt-6 max-w-[260px] text-[13.5px] text-muted">Clock in at the attendance device in the office.</p>
        ) : (
          <button type="button" disabled={busy}
            onClick={() => (today.settings.face_required ? setFaceOpen(true) : today.settings.selfie_required ? setSelfieOpen(true) : punch())}
            className={`mt-6 flex h-28 w-28 flex-col items-center justify-center gap-1.5 rounded-full border text-[14px] transition-colors disabled:opacity-50 ${
              today.next_action === "in" ? "border-primary/40 bg-primary text-white hover:bg-primary-dark" : "border-line-strong bg-surface text-ink hover:border-primary/50"}`}>
            {today.next_action === "in" ? <LogIn size={24} strokeWidth={STROKE} /> : <LogOut size={24} strokeWidth={STROKE} />}
            {busy ? "Saving…" : today.next_action === "in" ? "Clock in" : "Clock out"}
          </button>
        )}
        {(today.settings.geo_required || today.settings.selfie_required || today.settings.face_required) && today.plan.punch_required && (
          <p className="mt-3 flex items-center gap-3 text-[12px] text-faint">
            {today.settings.geo_required && <span className="inline-flex items-center gap-1"><MapPin size={12} strokeWidth={STROKE} />Location needed</span>}
            {today.settings.face_required ? <span className="inline-flex items-center gap-1"><ScanFace size={12} strokeWidth={STROKE} />Face check</span>
              : today.settings.selfie_required && <span className="inline-flex items-center gap-1"><Camera size={12} strokeWidth={STROKE} />Selfie needed</span>}
          </p>
        )}
      </div>

      <div className="border-t border-line px-6 py-4">
        <p className="mb-2 text-[12px] uppercase tracking-[0.08em] text-faint">Punches</p>
        {today.punches.length === 0 ? <p className="text-[13.5px] text-muted">No punches yet.</p> : (
          <ul className="space-y-2">
            {today.punches.map((p, i) => (
              <li key={p.uuid} className={`flex items-center justify-between text-[13.5px] ${p.ignored ? "text-faint line-through" : "text-ink"}`}>
                <span className="inline-flex items-center gap-2">
                  {(p.direction ?? (i % 2 === 0 ? "in" : "out")) === "in"
                    ? <LogIn size={14} strokeWidth={STROKE} className="text-emerald-600" />
                    : <LogOut size={14} strokeWidth={STROKE} className="text-rose-500" />}
                  <span className="tabular">{formatTime(p.punched_at)}</span>
                </span>
                <span className="text-[12.5px] text-muted">{sourceLabel(p.source)}{p.fence_name ? ` · ${p.fence_name}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
        {day?.notes?.length ? <p className="mt-3 text-[12.5px] text-muted">{day.notes.join(" · ")}</p> : null}
      </div>
      {faceOpen && today.next_action && (
        <FaceClockModal direction={today.next_action} selfieRequired={today.settings.selfie_required}
          getPosition={async () => {
            const pos = await getPosition();
            if (!pos && today.settings.geo_required) throw new Error("Allow location access in your browser to clock in.");
            return { latitude: pos?.coords.latitude ?? null, longitude: pos?.coords.longitude ?? null, accuracy: pos?.coords.accuracy ?? null };
          }}
          onClose={() => setFaceOpen(false)} onDone={(t) => { setFaceOpen(false); onPunched(t as Today); }} />
      )}
      <SelfieModal open={selfieOpen} onClose={() => setSelfieOpen(false)} onTaken={(img) => { setSelfieOpen(false); punch(img); }} />
    </Paper>
  );
}

function sourceLabel(s: string): string {
  return { web: "Web", mobile: "Phone", device: "Device", file: "File import", ftp: "Device file", api: "Device software", database: "Device database", regularisation: "Correction", admin: "Added by HR" }[s] ?? s;
}

function SelfieModal({ open, onClose, onTaken }: { open: boolean; onClose: () => void; onTaken: (dataUrl: string) => void }) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: "user", width: 640 } })
      .then((s) => { stream = s; if (video.current) { video.current.srcObject = s; video.current.play().catch(() => {}); } })
      .catch(() => setError("Allow camera access in your browser to take a selfie."));
    return () => { stream?.getTracks().forEach((t) => t.stop()); };
  }, [open]);

  function take() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * w);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d")?.drawImage(v, 0, 0, w, h);
    onTaken(c.toDataURL("image/jpeg", 0.7));
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Take a selfie" description="It is kept with this punch for the retention period."
      footer={<><ModalCancel /><Button variant="primary" icon={Camera} onClick={take} disabled={!!error}>Use this photo</Button></>}>
      {error ? <p className="text-[13.5px] text-rose-700">{error}</p> : (
        <video ref={video} playsInline muted className="aspect-[4/3] w-full rounded-xl bg-sunken object-cover" />
      )}
    </Modal>
  );
}

/* ── Month ─────────────────────────────────────────────────────────── */

function MonthStats({ month }: { month: Month | null }) {
  if (!month) return <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[88px] rounded-2xl" />)}</div>;
  const s = month.summary;
  const n = (k: string) => Number(s[k] ?? 0);
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="Present" value={n("present") + n("wfh") + n("on_duty")} icon={Fingerprint} hint={`${n("half_day")} half days`} />
      <StatCard label="Absent" value={n("absent") + n("missing_punch")} icon={Coffee} hint={n("missing_punch") ? `${n("missing_punch")} missing punch` : "This month"} />
      <StatCard label="Late arrivals" value={n("late")} icon={Clock} hint={Number(s.penalty_lop_days) ? `${s.penalty_lop_days} day penalty` : "No penalty"} />
      <StatCard label="Payable days" value={String(s.payable_days ?? "0")} icon={Briefcase} hint={`Overtime ${minutesText(n("overtime_minutes"))}`} />
    </div>
  );
}

function MonthCalendar({ ym, month, onPick }: { ym: { y: number; m: number } | null; month: Month | null; onPick: (d: Day) => void }) {
  const byDate = useMemo(() => new Map((month?.days ?? []).map((d) => [d.date, d])), [month]);
  if (!ym) return <div className="p-5"><Skeleton className="h-72 w-full rounded-xl" /></div>;
  const weeks = monthGrid(ym.y, ym.m);
  return (
    <div className="p-3 sm:p-4">
      <div className="grid grid-cols-7 gap-1.5 pb-1.5">
        {WEEKDAYS.map((w) => <p key={w} className="text-center text-[11.5px] uppercase tracking-[0.06em] text-faint">{w}</p>)}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {weeks.flat().map((iso, i) => {
          if (!iso) return <div key={`x${i}`} />;
          const d = byDate.get(iso);
          const s = statusInfo(d?.status);
          const pending = d?.requests?.some((r) => r.status === "pending");
          return (
            <button key={iso} type="button" disabled={!d} onClick={() => d && onPick(d)}
              className={`group relative flex min-h-[64px] flex-col rounded-xl border border-transparent p-2 text-left transition-colors hover:border-line-strong ${d ? s.cell : "bg-sunken/40"} ${!month ? "animate-pulse" : ""}`}>
              <span className="tabular text-[13px]">{Number(iso.slice(8))}</span>
              {d && d.status !== "upcoming" && d.status !== "not_yet" && (
                <span className="mt-auto truncate text-[11px] opacity-80">{s.code || s.label}{d.shift_code && d.status === "present" ? ` · ${d.shift_code}` : ""}</span>
              )}
              {d?.status === "upcoming" && d.shift_code && <span className="mt-auto text-[11px] text-faint">{d.shift_code}</span>}
              <span className="absolute right-1.5 top-1.5 flex gap-1">
                {d?.is_late && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Late" />}
                {pending && <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Request waiting" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Legend() {
  const keys = ["present", "half_day", "absent", "missing_punch", "on_leave", "wfh", "on_duty", "holiday", "weekly_off"];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line px-5 py-3 text-[12px] text-muted">
      {keys.map((k) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${statusInfo(k).dot}`} />{statusInfo(k).label}</span>)}
      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Late</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Request waiting</span>
    </div>
  );
}

function DayModal({ day, onClose, onAsk }: { day: Day | null; onClose: () => void; onAsk: (k: RequestKind, date: string) => void }) {
  const [fetched, setFetched] = useState<(Day & { punches?: Punch[] }) | null>(null);
  useEffect(() => {
    if (day?.uuid) api.get<Day & { punches: Punch[] }>(`/attendance/me/days/${day.date}`).then(setFetched).catch(() => {});
  }, [day]);
  const d: (Day & { punches?: Punch[] }) | null = day ? (fetched?.date === day.date ? fetched : day) : null;
  const past = !!d && !d.future;
  return (
    <Modal open={!!day} onClose={onClose} size="md" title={d ? formatLongDate(d.date) : ""}
      description={d ? [d.shift_name, d.holiday_name].filter(Boolean).join(" · ") || undefined : undefined}
      footer={d && past ? <>
        <Button onClick={() => onAsk("regularisation", d.date)} icon={FilePen}>Fix attendance</Button>
        <Button variant="primary" onClick={onClose}>Done</Button>
      </> : <Button variant="primary" onClick={onClose}>Done</Button>}>
      {d && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={d.status} />
            {d.is_late && <Badge tone="warn">Late {minutesText(d.late_minutes)}</Badge>}
            {d.is_early_exit && <Badge tone="warn">Left early {minutesText(d.early_minutes)}</Badge>}
            {!!d.overtime_minutes && <Badge tone="accent">Overtime {minutesText(d.overtime_minutes)}</Badge>}
            {d.locked && <Badge tone="neutral">Locked for payroll</Badge>}
          </div>
          {past && d.uuid && (
            <KeyValue columns={2} items={[
              { label: "First in", value: d.first_in ? formatTime(d.first_in) : null },
              { label: "Last out", value: d.last_out ? formatTime(d.last_out) : null },
              { label: "Worked", value: minutesText(d.worked_minutes) },
              { label: "Breaks", value: d.break_minutes ? minutesText(d.break_minutes) : null },
              { label: "Payable", value: d.payable_days ? `${d.payable_days} day` : null },
              { label: "Loss of pay", value: d.lop_days && Number(d.lop_days) + Number(d.penalty_lop_days || 0) ? `${(Number(d.lop_days) + Number(d.penalty_lop_days || 0)).toFixed(2)} day` : null },
            ]} />
          )}
          {d.notes?.length ? <ul className="space-y-1 text-[13.5px] text-muted">{d.notes.map((n) => <li key={n}>· {n}</li>)}</ul> : null}
          {d.punches?.length ? (
            <div>
              <p className="mb-2 text-[12px] uppercase tracking-[0.08em] text-faint">Punches</p>
              <ul className="space-y-1.5 text-[13.5px]">
                {d.punches.map((p) => (
                  <li key={p.uuid} className={`flex justify-between ${p.ignored ? "text-faint line-through" : "text-ink"}`}>
                    <span className="tabular">{formatTime(p.punched_at)} {p.direction ? `(${p.direction})` : ""}</span>
                    <span className="text-muted">{sourceLabel(p.source)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {d.requests?.length ? (
            <div>
              <p className="mb-2 text-[12px] uppercase tracking-[0.08em] text-faint">Requests</p>
              <ul className="space-y-1.5 text-[13.5px]">
                {d.requests.map((r) => (
                  <li key={r.uuid} className="flex items-center justify-between gap-3"><span>{r.kind_label}</span><RequestStatus status={r.status} /></li>
                ))}
              </ul>
            </div>
          ) : null}
          {d.future && <p className="text-[13.5px] text-muted">This day is still ahead.</p>}
        </div>
      )}
    </Modal>
  );
}

/* ── My requests ───────────────────────────────────────────────────── */

function MyRequests({ nonce, onChanged }: { nonce: number; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Req[]; total: number } | null>(null);
  const [open, setOpen] = useState<Req | null>(null);
  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), size: "10" });
    if (filters.kind?.[0]) q.set("kind", filters.kind[0]);
    if (filters.status?.[0]) q.set("status", filters.status[0]);
    let live = true;
    api.get<{ items: Req[]; total: number }>(`/attendance/me/requests?${q}`).then((r) => { if (live) setData(r); }).catch(() => {});
    return () => { live = false; };
  }, [filters, page, nonce]);

  async function withdraw(r: Req) {
    if (!r.workflow_uuid) return;
    if (!(await confirm({ title: "Withdraw this request?", message: "It stops going through approval.", confirmLabel: "Withdraw", tone: "danger" }))) return;
    try {
      await api.post(`/workflow/requests/${r.workflow_uuid}/cancel`, { reason: "Withdrawn" });
      toast.success("Withdrawn");
      setOpen(null);
      onChanged();
    } catch (e) { toast.error(errorText(e)); }
  }

  const columns: Column<Req>[] = [
    { key: "kind", header: "Request", cell: (r) => <span className="text-ink">{r.kind_label}</span> },
    { key: "date", header: "Date", cell: (r) => <span className="tabular text-muted">{formatDate(r.date)}{r.end_date ? ` – ${formatDate(r.end_date)}` : ""}</span> },
    { key: "what", header: "Details", hideBelow: "md", cell: (r) => <span className="text-muted">{requestLine(r)}</span> },
    { key: "ref", header: "Reference", hideBelow: "lg", cell: (r) => <span className="tabular text-faint">{r.reference_no ?? "—"}</span> },
    { key: "status", header: "Status", cell: (r) => <RequestStatus status={r.status} /> },
  ];

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[17px] font-light text-ink">My requests</h2>
      <FilterBar filters={[
        { key: "kind", label: "Kind", options: Object.entries(REQUEST_KINDS).map(([value, label]) => ({ value, label })) },
        { key: "status", label: "Status", options: [{ value: "pending", label: "Waiting" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }, { value: "cancelled", label: "Withdrawn" }] },
      ]} values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={data?.items ?? []} rowKey={(r) => r.uuid} columns={columns} loading={!data} onRowClick={setOpen}
        pagination={{ page, size: 10, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={FilePen} emptyTitle="No requests yet" emptyHint="Corrections, work from home and other requests show here." />
      <Modal open={!!open} onClose={() => setOpen(null)} size="sm" title={open?.kind_label} description={open?.reference_no ?? undefined}
        footer={open?.status === "pending"
          ? <><Button variant="danger" onClick={() => open && withdraw(open)}>Withdraw</Button><Button variant="primary" onClick={() => setOpen(null)}>Close</Button></>
          : <Button variant="primary" onClick={() => setOpen(null)}>Close</Button>}>
        {open && <KeyValue columns={1} items={[
          { label: "Status", value: <RequestStatus status={open.status} /> },
          { label: "Date", value: `${formatDate(open.date)}${open.end_date ? ` – ${formatDate(open.end_date)}` : ""}` },
          { label: "Details", value: requestLine(open) },
          { label: "Reason", value: open.reason },
        ]} />}
      </Modal>
    </section>
  );
}

function requestLine(r: Req): string {
  const d = (r.details || {}) as Record<string, string | boolean | null>;
  if (r.kind === "regularisation") return [d.in ? `In ${d.in}` : null, d.out ? `Out ${d.out}${d.out_next_day ? " (next day)" : ""}` : null].filter(Boolean).join(", ");
  if (r.kind === "permission") return `${r.from_time}–${r.to_time} (${r.minutes} min)`;
  if (r.kind === "overtime") return `${((r.minutes || 0) / 60).toFixed(1)} h, consent given`;
  return { full_day: "Full day", first_half: "First half", second_half: "Second half" }[r.duration || "full_day"] ?? "";
}
