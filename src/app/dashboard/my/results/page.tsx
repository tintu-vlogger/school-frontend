"use client";

/*
 * Portal: exams and results for a parent's child (switcher) or the signed-in student.
 * Upcoming exam timetable with admit card download, published results only (subject
 * breakdown on tap), report card and transcript download, and progress across exams.
 */
import { useEffect, useState } from "react";
import { CalendarClock, ChevronDown, FileDown, ScrollText } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { formatDate } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Button, Skeleton } from "@/components/ui-kit";
import { ChildSwitcher, downloadFile, fmt, ResultBadge, useChild, type Result } from "@/components/exams/shared";

type Schedule = { uuid: string; name: string; start_date: string | null; end_date: string | null; instructions: string | null;
  papers: { subject: string; date: string | null; start_time: string | null; end_time: string | null; max_marks: number | null }[] }[];
type Point = { exam: string; percentage: number | null; grade: string | null };

export default function MyResultsPage() {
  const toast = useToast();
  const { term } = useInstitution();
  const child = useChild();
  const sid = child.studentId;
  const [got, setGot] = useState<{ sid: number; results: Result[]; schedule: Schedule; points: Point[] } | null>(null);
  const [opened, setOpen] = useState<string | null | undefined>(undefined);
  const fresh = got && got.sid === sid ? got : null;
  const results = fresh?.results ?? null, schedule = fresh?.schedule ?? null, points = fresh?.points ?? [];
  const open = opened === undefined ? results?.[0]?.uuid ?? null : opened;
  useEffect(() => {
    if (!sid) return;
    let live = true;
    Promise.all([
      api.get<Result[]>(`/exams/portal/results?student_id=${sid}`),
      api.get<Schedule>(`/exams/portal/schedule?student_id=${sid}`),
      api.get<Point[]>(`/exams/portal/progress?student_id=${sid}`),
    ]).then(([r, s, p]) => { if (!live) return; setGot({ sid, results: r, schedule: s, points: p }); setOpen(undefined); })
      .catch((e) => { if (live) { setGot({ sid, results: [], schedule: [], points: [] }); toast.error("Couldn't load results", { description: e.message }); } });
    return () => { live = false; };
  }, [sid, toast]);
  const dl = (path: string, name: string) => downloadFile(path, name).catch((e) => toast.error(e.message));
  const hasTerms = (results ?? []).some((r) => r.source.startsWith("rule") && r.gpa !== null);

  return (
    <div>
      <PageHeader title="Exams & results" description="Exam timetable, published results and report cards." actions={<ChildSwitcher child={child} />} />
      {child.ready && !sid ? <Paper className="p-10 text-center text-[14px] text-muted">No {term("student").toLowerCase()} is linked to this sign-in.</Paper>
        : !results || !schedule ? <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div> : (
          <div className="space-y-5">
            {schedule.length > 0 && (
              <Paper>
                <PaperHeader title={<span className="flex items-center gap-2"><CalendarClock size={16} strokeWidth={1.4} className="text-muted" />Exam timetable</span>} />
                <div className="divide-y divide-line">
                  {schedule.map((e) => (
                    <div key={e.uuid} className="p-4 sm:p-5">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div><p className="text-[15px] text-ink">{e.name}</p>
                          <p className="text-[12.5px] text-muted">{e.start_date ? formatDate(e.start_date) : "Dates to be announced"}{e.end_date && e.end_date !== e.start_date ? ` – ${formatDate(e.end_date)}` : ""}</p></div>
                        <Button size="sm" icon={FileDown} onClick={() => dl(`/exams/portal/hall-ticket.pdf?student_id=${sid}&exam=${e.uuid}`, "admit-card.pdf")}>Admit card</Button>
                      </div>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {e.papers.map((p, i) => (
                          <li key={i} className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2 text-[13.5px]">
                            <span className="min-w-0 truncate text-ink">{p.subject}</span>
                            <span className="shrink-0 text-muted">{p.date ? formatDate(p.date, { weekday: "short", year: undefined }) : "TBA"}{p.start_time ? ` · ${p.start_time}` : ""}</span>
                          </li>
                        ))}
                      </ul>
                      {e.instructions && <p className="mt-3 whitespace-pre-line text-[12.5px] text-muted">{e.instructions}</p>}
                    </div>
                  ))}
                </div>
              </Paper>
            )}
            <Paper>
              <PaperHeader title={<span className="flex items-center gap-2"><ScrollText size={16} strokeWidth={1.4} className="text-muted" />Results</span>}
                action={results.length > 0 && <div className="flex gap-2">
                  {hasTerms && <Button size="sm" icon={FileDown} onClick={() => dl(`/exams/portal/transcript.pdf?student_id=${sid}`, "transcript.pdf")}>Grade sheet</Button>}
                  <Button size="sm" icon={FileDown} onClick={() => dl(`/exams/portal/report-card.pdf?student_id=${sid}`, "report-card.pdf")}>Report card</Button></div>} />
              {results.length === 0 ? (
                <p className="px-5 py-10 text-center text-[14px] text-muted">No results have been published yet. You&apos;ll get a notification when they are.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {results.map((r) => (
                    <li key={r.uuid}>
                      <button type="button" onClick={() => setOpen(open === r.uuid ? null : r.uuid)} aria-expanded={open === r.uuid}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sunken/50 sm:px-5">
                        <span className="min-w-0 flex-1"><span className="block truncate text-[14.5px] text-ink">{r.name}</span>
                          <span className="block text-[12.5px] text-muted">{r.published_at ? `Published ${formatDate(r.published_at)}` : ""}{r.rank ? ` · Rank ${r.rank}` : ""}</span></span>
                        <span className="tabular text-[18px] font-light text-ink">{r.gpa !== null ? fmt(r.gpa) : r.percentage !== null ? `${fmt(r.percentage, 1)}%` : "—"}</span>
                        {r.grade && <Badge tone="accent">{r.grade}</Badge>}
                        <span className="hidden sm:inline"><ResultBadge status={r.status} /></span>
                        <ChevronDown size={16} strokeWidth={1.4} className={`text-faint transition-transform ${open === r.uuid ? "rotate-180" : ""}`} />
                      </button>
                      {open === r.uuid && (
                        <div className="px-4 pb-4 sm:px-5">
                          <div className="mb-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted sm:hidden"><ResultBadge status={r.status} /></div>
                          <div className="overflow-x-auto rounded-xl border border-line">
                            <table className="w-full text-[13.5px]">
                              <thead className="bg-sunken/60 text-left text-[12px] text-muted"><tr><th className="px-3 py-2 font-normal">{term("subject")}</th>
                                <th className="px-3 py-2 text-right font-normal">Marks</th><th className="px-3 py-2 font-normal">Grade</th></tr></thead>
                              <tbody className="divide-y divide-line">
                                {(r.subjects ?? []).map((s) => (
                                  <tr key={s.subject_id} className={s.passed === false ? "text-rose-700" : ""}>
                                    <td className="px-3 py-2">{s.subject}</td>
                                    <td className="px-3 py-2 text-right tabular">{s.excluded ? (s.mark_code ?? "Exempt") : s.mark_code === "AB" ? "Absent" : s.obtained !== null && s.counts ? `${fmt(s.obtained)} / ${fmt(s.max)}` : "—"}</td>
                                    <td className="px-3 py-2">{s.grade ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-muted">
                            {r.total_max ? <span>Total <span className="tabular text-ink">{fmt(r.total_obtained)} / {fmt(r.total_max)}</span></span> : null}
                            {r.percentage !== null && <span>Percentage <span className="tabular text-ink">{fmt(r.percentage)}%</span></span>}
                            {r.cgpa !== null && <span>CGPA <span className="tabular text-ink">{fmt(r.cgpa)}</span></span>}
                            {r.credits_attempted !== null && <span>Credits <span className="tabular text-ink">{fmt(r.credits_earned)} / {fmt(r.credits_attempted)}</span></span>}
                            {r.attendance_percent !== null && <span>Attendance <span className="tabular text-ink">{fmt(r.attendance_percent)}%</span></span>}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Paper>
            {points.length > 1 && (
              <Paper>
                <PaperHeader title="Progress across exams" />
                <div className="h-[220px] p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={points} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
                      <CartesianGrid vertical={false} stroke="#ececf0" />
                      <XAxis dataKey="exam" tick={{ fontSize: 12, fill: "#8a8f9c" }} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: "#8a8f9c" }} tickLine={false} axisLine={false} unit="%" />
                      <Tooltip formatter={(v) => [`${fmt(Number(v), 1)}%`, "Percentage"]} />
                      <Line type="monotone" dataKey="percentage" stroke="var(--primary, #4f46e5)" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Paper>
            )}
          </div>
        )}
    </div>
  );
}
