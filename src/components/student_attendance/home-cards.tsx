"use client";

/*
 * Home page cards for student attendance.
 *   <StaffHomeCard />                    // today: registers marked, present %, absentees; a teacher's registers to mark
 *   <PortalHomeCard studentId={id} />    // a child's attendance this month and today's mark
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, ClipboardCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Skeleton } from "@/components/ui-kit";
import { pctText, pctTone, type Pct } from "./lib";

type StaffSummary = {
  date: string; mode: string;
  overview: { sections: number; marked: number; partly: number; present_pct: number | null; absent: number; late: number; leave: number; strength: number } | null;
  unmarked?: string[];
  registers: { section_id: number; label: string; slot: string; period_no: number; subject_id: number | null; slot_label: string; start: string | null; marked: boolean; present: number | null; total: number | null }[];
};

export function StaffHomeCard() {
  const { term } = useInstitution();
  const [s, setS] = useState<StaffSummary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api.get<StaffSummary>("/student-attendance/summary").then(setS).catch(() => setFailed(true)); }, []);
  if (failed || (s && !s.overview && s.registers.length === 0)) return null;
  const o = s?.overview;
  const todo = s?.registers.filter((r) => !r.marked) ?? [];
  return (
    <Paper>
      <PaperHeader title={`${term("student")} attendance today`} action={<Link href="/dashboard/student-attendance" className="text-[13px] text-primary hover:underline">Open</Link>} />
      {!s ? <div className="space-y-3 p-5"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-16 w-full" /></div> : (
        <div className="space-y-5 p-5">
          {o && (
            <div className="grid grid-cols-3 gap-3">
              <div><p className="text-[12.5px] text-muted">Marked</p><p className="tabular mt-1 text-[26px] font-extralight leading-none text-ink">{o.marked}<span className="text-[15px] text-faint">/{o.sections}</span></p></div>
              <div><p className="text-[12.5px] text-muted">Present</p><p className={`tabular mt-1 text-[26px] font-extralight leading-none ${pctTone(o.present_pct)}`}>{pctText(o.present_pct)}</p></div>
              <div><p className="text-[12.5px] text-muted">Absent</p><p className="tabular mt-1 text-[26px] font-extralight leading-none text-ink">{o.absent}</p></div>
            </div>
          )}
          {o && s.unmarked && s.unmarked.length > 0 && (
            <p className="text-[12.5px] text-muted">Not marked yet: {s.unmarked.join(", ")}{o.sections - o.marked > s.unmarked.length ? " and more" : ""}</p>
          )}
          {s.registers.length > 0 && (
            <div>
              <p className="mb-2 text-[12.5px] text-muted">{todo.length ? `Your registers to mark (${todo.length})` : "Your registers are all marked"}</p>
              <ul className="space-y-1.5">
                {s.registers.slice(0, 6).map((r) => (
                  <li key={`${r.section_id}-${r.slot}-${r.period_no}-${r.subject_id}`}>
                    <Link href={`/dashboard/student-attendance/register?section=${r.section_id}&date=${s.date}&slot=${r.slot}&period=${r.period_no}&subject=${r.subject_id ?? 0}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 transition-colors hover:border-line-strong">
                      <span className="flex min-w-0 items-center gap-2 text-[13.5px] text-ink"><ClipboardCheck size={15} strokeWidth={1.4} className="shrink-0 text-faint" />
                        <span className="truncate">{r.label}{r.slot !== "day" ? ` · ${r.slot_label}` : ""}</span></span>
                      {r.marked ? <Badge tone="good">{r.present}/{r.total}</Badge> : <Badge tone="warn" dot>Mark</Badge>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Paper>
  );
}

type PortalSummary = {
  date: string; threshold: number; month: Pct; session: Pct; session_label: string;
  today: { working: boolean; reason: string | null; marked: boolean; state: string | null; names: string[]; late_minutes: number | null };
};

const TODAY: Record<string, { label: string; tone: "good" | "warn" | "bad" | "info" | "neutral" }> = {
  present: { label: "Present", tone: "good" }, late: { label: "Late", tone: "warn" }, absent: { label: "Absent", tone: "bad" },
  partial: { label: "Part of the day", tone: "warn" }, leave: { label: "On leave", tone: "info" },
};

export function PortalHomeCard({ studentId }: { studentId: number }) {
  const [s, setS] = useState<PortalSummary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setS(null);
    api.get<PortalSummary>(`/student-attendance/portal/summary?student_id=${studentId}`).then(setS).catch(() => setFailed(true));
  }, [studentId]);
  if (failed) return null;
  const today = s?.today;
  const st = today?.state ? TODAY[today.state] : null;
  return (
    <Paper>
      <PaperHeader title="Attendance" action={<Link href="/dashboard/my/attendance" className="text-[13px] text-primary hover:underline">Open</Link>} />
      {!s ? <div className="space-y-3 p-5"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-6 w-full" /></div> : (
        <div className="space-y-4 p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-[12.5px] text-muted"><CalendarCheck size={14} strokeWidth={1.4} />This month</p>
              <p className={`tabular mt-1 text-[30px] font-extralight leading-none ${pctTone(s.month.pct, s.threshold)}`}>{pctText(s.month.pct)}</p>
            </div>
            <div className="text-right text-[12.5px] text-muted">
              <p>{s.session_label}: <span className={pctTone(s.session.pct, s.threshold)}>{pctText(s.session.pct)}</span></p>
              <p>Required {s.threshold}%</p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[13.5px]">
            <span className="text-muted">Today</span>
            {!today?.working ? <Badge>{today?.reason || "Holiday"}</Badge>
              : st ? <Badge tone={st.tone} dot>{st.label}{today.late_minutes ? ` · ${today.late_minutes} min` : ""}</Badge>
                : <span className="text-faint">Not marked yet</span>}
          </div>
        </div>
      )}
    </Paper>
  );
}
