"use client";

/*
 * Home page cards for the exams module.
 *   <StaffHomeCard />                     // upcoming exams, and mark sheets the signed-in teacher still has to fill
 *   <PortalHomeCard studentId={id} />     // the latest published result and the next exam paper
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, PencilLine, ScrollText } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Skeleton } from "@/components/ui-kit";
import { fmt, ResultBadge } from "./shared";

type StaffSummary = {
  upcoming: { uuid: string; name: string; start_date: string | null; end_date: string | null; next_paper_on: string | null; ongoing: boolean }[];
  pending_sheets: { paper_uuid: string; section_id: number; section_label: string; subject_name: string; exam_name: string; entered: number; students: number; marks_due_on: string | null }[];
  pending_count: number;
};

export function StaffHomeCard() {
  const [s, setS] = useState<StaffSummary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api.get<StaffSummary>("/exams/summary").then(setS).catch(() => setFailed(true)); }, []);
  if (failed) return null;
  return (
    <Paper>
      <PaperHeader title="Exams" action={<Link href="/dashboard/exams" className="text-[13px] text-primary hover:underline">Open</Link>} />
      {!s ? <div className="space-y-3 p-5"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-16 w-full" /></div> : (
        <div className="divide-y divide-line">
          <div className="p-5">
            <p className="mb-2 flex items-center gap-1.5 text-[13px] text-muted"><CalendarClock size={15} strokeWidth={1.4} />Coming up</p>
            {s.upcoming.length === 0 ? <p className="text-[13.5px] text-faint">No exams in the next few weeks.</p> : (
              <ul className="space-y-2">
                {s.upcoming.slice(0, 4).map((e) => (
                  <li key={e.uuid} className="flex items-center justify-between gap-3 text-[14px]">
                    <span className="min-w-0 truncate text-ink">{e.name}</span>
                    {e.ongoing ? <Badge tone="accent" dot>On now</Badge>
                      : <span className="shrink-0 text-[12.5px] text-muted">{e.start_date ? formatDate(e.start_date) : "Dates to be set"}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
          {s.pending_count > 0 && (
            <div className="p-5">
              <p className="mb-2 flex items-center gap-1.5 text-[13px] text-muted"><PencilLine size={15} strokeWidth={1.4} />Marks to enter <span className="tabular text-ink">{s.pending_count}</span></p>
              <ul className="space-y-2">
                {s.pending_sheets.slice(0, 4).map((p) => (
                  <li key={`${p.paper_uuid}-${p.section_id}`}>
                    <Link href={`/dashboard/exams/marks?paper=${p.paper_uuid}&section=${p.section_id}`}
                      className="flex items-center justify-between gap-3 rounded-lg text-[14px] hover:text-primary">
                      <span className="min-w-0 truncate">{p.subject_name} · {p.section_label}<span className="text-muted"> · {p.exam_name}</span></span>
                      <span className="tabular shrink-0 text-[12.5px] text-muted">{p.entered}/{p.students}</span>
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
  latest: { name: string; percentage: number | null; grade: string | null; gpa: number | null; status: string; rank: number | null } | null;
  next_exam: { exam: string; subject: string; date: string; start_time: string | null } | null;
};

export function PortalHomeCard({ studentId }: { studentId: number }) {
  const [got, setGot] = useState<(PortalSummary & { sid: number }) | null>(null);
  const [failed, setFailed] = useState(false);
  const s = got?.sid === studentId ? got : null;
  useEffect(() => {
    let live = true;
    api.get<PortalSummary>(`/exams/portal/summary?student_id=${studentId}`)
      .then((r) => { if (live) setGot({ ...r, sid: studentId }); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [studentId]);
  if (failed) return null;
  return (
    <Paper>
      <PaperHeader title="Exams & results" action={<Link href="/dashboard/my/results" className="text-[13px] text-primary hover:underline">Open</Link>} />
      {!s ? <div className="space-y-3 p-5"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-5 w-2/3" /></div> : (
        <div className="space-y-4 p-5">
          {s.latest ? (
            <div>
              <p className="flex items-center gap-1.5 text-[13px] text-muted"><ScrollText size={15} strokeWidth={1.4} />{s.latest.name}</p>
              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                <span className="tabular text-[30px] font-extralight leading-none text-ink">
                  {s.latest.gpa !== null ? fmt(s.latest.gpa) : s.latest.percentage !== null ? `${fmt(s.latest.percentage, 1)}%` : s.latest.grade ?? "—"}
                </span>
                {s.latest.grade && <Badge tone="accent">{s.latest.grade}</Badge>}
                <ResultBadge status={s.latest.status} />
              </div>
            </div>
          ) : <p className="text-[13.5px] text-faint">No results published yet.</p>}
          {s.next_exam && (
            <div className="rounded-xl border border-line px-4 py-3">
              <p className="text-[12.5px] text-muted">Next paper · {s.next_exam.exam}</p>
              <p className="mt-0.5 text-[14px] text-ink">{s.next_exam.subject}<span className="text-muted"> · {formatDate(s.next_exam.date)}{s.next_exam.start_time ? `, ${s.next_exam.start_time}` : ""}</span></p>
            </div>
          )}
        </div>
      )}
    </Paper>
  );
}
