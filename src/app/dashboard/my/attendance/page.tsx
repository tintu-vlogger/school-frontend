"use client";

/*
 * Portal: a child's attendance. Month calendar coloured by the day's mark, this month and
 * session percentages against the required threshold, and the list of absences, leave and
 * late days. Parents with several children switch between them.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CalendarX2, ChevronLeft, ChevronRight, Clock, UserX } from "lucide-react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { formatDate, formatMonth, todayISO } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Button, IconButton, Skeleton, StatCard } from "@/components/ui-kit";
import { MyChildSwitcher, useMyChild } from "@/components/student_attendance/child";
import { pctText, pctTone, type Pct } from "@/components/student_attendance/lib";

type Day = { date: string; working: boolean; holiday: string | null; state: string; value: number | null; codes: string[]; names: string[]; late_minutes: number | null; remarks: string | null };
type Absence = { date: string; code: string; name: string; color: string | null; kind: string; subject: string | null; slot: string | null; late_minutes: number | null; remarks: string | null };
type Cal = { month: string; days: Day[]; summary: Pct; absences: Absence[]; session: Pct | null; session_label: string; threshold: number };

const STATE: Record<string, { cls: string; label: string }> = {
  present: { cls: "bg-emerald-500/85 text-white", label: "Present" },
  late: { cls: "bg-amber-400 text-white", label: "Late" },
  partial: { cls: "bg-violet-400 text-white", label: "Part of the day" },
  absent: { cls: "bg-rose-500 text-white", label: "Absent" },
  leave: { cls: "bg-indigo-400 text-white", label: "Leave" },
  holiday: { cls: "bg-line/60 text-faint", label: "Holiday" },
  none: { cls: "border border-dashed border-line text-muted", label: "Not marked" },
  future: { cls: "text-faint", label: "" },
};

function shiftMonth(m: string, n: number) {
  const d = new Date(`${m}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}

export default function MyAttendancePage() {
  const { term } = useInstitution();
  const child = useMyChild();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [data, setData] = useState<Cal | null>(null);
  const [picked, setPicked] = useState<Day | null>(null);

  useEffect(() => {
    if (!child.studentId) return;
    let live = true;
    setData(null);
    api.get<Cal>(`/student-attendance/portal/calendar?student_id=${child.studentId}&month=${month}`).then((r) => live && setData(r)).catch(() => live && setData(null));
    return () => { live = false; };
  }, [child.studentId, month]);

  const lead = useMemo(() => {
    if (!data?.days.length) return 0;
    const first = new Date(`${data.days[0].date}T12:00:00Z`).getUTCDay();
    return (first + 6) % 7;
  }, [data]);
  const today = todayISO();
  const t = data?.threshold ?? 75;

  return (
    <div>
      <PageHeader title="Attendance" description={child.current ? undefined : `Your child's attendance by day.`} actions={<MyChildSwitcher child={child} />} />
      {child.ready && !child.studentId ? (
        <Paper><EmptyState icon={CalendarCheck} title={`No ${term("student").toLowerCase()} linked to this sign-in`} hint="Ask the school office to link your child." /></Paper>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="This month" icon={CalendarCheck} value={<span className={pctTone(data?.summary.pct, t)}>{pctText(data?.summary.pct)}</span>} hint={data ? `${data.summary.present} of ${data.summary.total} ${data.summary.total === 1 ? "day" : "days"}` : undefined} />
            <StatCard label={data?.session_label || "This year"} value={<span className={pctTone(data?.session?.pct, t)}>{pctText(data?.session?.pct)}</span>} hint={`Required ${t}%`} />
            <StatCard label="Absent" icon={UserX} value={data?.session?.absent ?? "—"} hint="This year" />
            <StatCard label="Late" icon={Clock} value={data?.session?.late ?? "—"} hint={data?.session?.leave ? `${data.session.leave} on leave` : "This year"} />
          </div>
          {data?.session?.pct != null && data.session.pct < t && (
            <p className="mb-5 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-[13.5px] text-rose-700">
              Attendance is below the required {t}%. Please talk to the class {term("teacher").toLowerCase()} if there is a reason.
            </p>
          )}
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Paper>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <IconButton icon={ChevronLeft} label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))} />
                <p className="text-[15px] text-ink">{formatMonth(`${month}-15`)}</p>
                <IconButton icon={ChevronRight} label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= today.slice(0, 7)} />
              </div>
              <div className="p-3 sm:p-4">
                <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11.5px] text-faint">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}</div>
                {!data ? <Skeleton className="h-64 w-full" /> : (
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: lead }).map((_, i) => <span key={`l${i}`} />)}
                    {data.days.map((d) => {
                      const s = STATE[d.state] ?? STATE.none;
                      return (
                        <button key={d.date} type="button" onClick={() => setPicked(d)} title={[s.label, d.holiday, d.names.join(", ")].filter(Boolean).join(" · ")}
                          className={`flex aspect-square flex-col items-center justify-center rounded-lg text-[13px] transition-transform hover:scale-[1.04] ${s.cls} ${d.date === today ? "ring-2 ring-primary ring-offset-1" : ""} ${picked?.date === d.date ? "outline outline-2 outline-ink/40" : ""}`}>
                          <span className="tabular">{Number(d.date.slice(8))}</span>
                          {d.codes.length > 0 && <span className="text-[9.5px] opacity-90">{d.codes.length > 2 ? `${d.codes.filter((c) => c !== "A").length}/${d.codes.length}` : d.codes.join("/")}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 text-[12px] text-muted">
                  {["present", "late", "partial", "absent", "leave", "holiday"].map((k) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded ${STATE[k].cls}`} />{STATE[k].label}</span>)}
                </div>
                {picked && (
                  <div className="mt-4 rounded-xl border border-line px-4 py-3 text-[13.5px]">
                    <p className="text-ink">{formatDate(picked.date, { weekday: "long" })}</p>
                    <p className="text-muted">{picked.holiday || (picked.names.length ? picked.names.join(", ") : picked.state === "future" ? "Not yet" : "Not marked yet")}
                      {picked.late_minutes ? ` · ${picked.late_minutes} min late` : ""}{picked.remarks ? ` · ${picked.remarks}` : ""}</p>
                  </div>
                )}
              </div>
            </Paper>
            <Paper>
              <PaperHeader title="Absences, leave and late days" action={<Link href="/dashboard/my/leave"><Button size="sm" icon={CalendarX2}>Ask for leave</Button></Link>} />
              {!data ? <div className="space-y-2 p-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : data.absences.length === 0 ? (
                <EmptyState icon={CalendarCheck} title="No absences this year" hint="Every marked day so far was present." />
              ) : (
                <ul className="max-h-[480px] divide-y divide-line overflow-y-auto">
                  {data.absences.map((a, i) => (
                    <li key={`${a.date}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-[13.5px] text-ink">{formatDate(a.date, { weekday: "short" })}</p>
                        <p className="truncate text-[12.5px] text-muted">{[a.subject, a.slot === "am" ? "Morning" : a.slot === "pm" ? "Afternoon" : null, a.late_minutes ? `${a.late_minutes} min late` : null, a.remarks].filter(Boolean).join(" · ") || " "}</p>
                      </div>
                      <Badge tone={a.kind === "absent" ? "bad" : a.kind === "leave" ? "info" : a.kind === "late" ? "warn" : "neutral"}>{a.name}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Paper>
          </div>
        </>
      )}
    </div>
  );
}
