"use client";

/*
 * Home page cards for teaching and learning.
 *   <StaffHomeCard />                    a teacher's live classes today and work waiting to be marked
 *   <PortalHomeCard studentId={id} />    homework due soon and the next live class (with Join)
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ClipboardPen, ListChecks, Video } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, formatRelative, formatTime } from "@/lib/datetime";
import { Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Button, Skeleton } from "@/components/ui-kit";
import { PhaseBadge, StateBadge } from "./shared";
import type { LiveClass, PortalHomework } from "./lib";

type StaffSummary = {
  classes_today: LiveClass[];
  to_grade: { uuid: string; title: string; count: number; due_at: string; subject_name: string | null }[];
  to_grade_total: number; quiz_attempts_to_mark: number;
};

export function StaffHomeCard() {
  const [s, setS] = useState<StaffSummary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    api.get<StaffSummary>("/lms/summary").then((r) => live && setS(r)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []);
  if (failed) return null;
  return (
    <Paper>
      <PaperHeader title="Teaching today" action={<Link href="/dashboard/lms/online-classes" className="text-[13px] text-primary hover:underline">Online classes</Link>} />
      {!s ? <div className="space-y-2 p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div> : (
        <div className="divide-y divide-line">
          {s.classes_today.length === 0 ? (
            <p className="flex items-center gap-2 px-5 py-4 text-[13.5px] text-muted"><Video size={16} strokeWidth={1.4} className="text-faint" />No live classes today.</p>
          ) : s.classes_today.map((c) => (
            <div key={c.uuid} className="flex items-center gap-3 px-5 py-3">
              <span className="tabular w-16 shrink-0 text-[13px] text-muted">{formatTime(c.starts_at)}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-[14px] text-ink">{c.title}</p><p className="truncate text-[12.5px] text-muted">{[c.subject_name, c.section_label].filter(Boolean).join(" · ")}</p></div>
              {c.phase === "ended" || c.phase === "cancelled" ? <PhaseBadge phase={c.phase} /> :
                <Link href={`/dashboard/lms/online-classes/${c.uuid}/join`}><Button size="sm" variant={c.phase === "upcoming" ? "secondary" : "primary"} icon={Video}>Join</Button></Link>}
            </div>
          ))}
          <div className="px-5 py-3">
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-[13.5px] text-ink"><ClipboardPen size={15} strokeWidth={1.4} className="text-faint" />Submissions to mark</p>
              <Badge tone={s.to_grade_total ? "warn" : "neutral"}>{s.to_grade_total}</Badge>
            </div>
            {s.to_grade.slice(0, 3).map((g) => (
              <Link key={g.uuid} href={`/dashboard/lms/homework?view=${g.uuid}`} className="mt-1.5 flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-[13px] hover:bg-sunken/60">
                <span className="truncate text-ink/85">{g.title}</span><span className="tabular shrink-0 text-muted">{g.count}</span>
              </Link>
            ))}
            {s.quiz_attempts_to_mark > 0 && (
              <Link href="/dashboard/lms/quizzes" className="mt-2 flex items-center justify-between text-[13px] text-muted hover:text-ink">
                <span className="flex items-center gap-2"><ListChecks size={15} strokeWidth={1.4} />Quiz answers to mark</span><span className="tabular">{s.quiz_attempts_to_mark}</span>
              </Link>
            )}
          </div>
        </div>
      )}
    </Paper>
  );
}

type PortalSummary = { homework_due: PortalHomework[]; homework_due_total: number; next_class: LiveClass | null; open_quizzes: number; can_join: boolean };

export function PortalHomeCard({ studentId }: { studentId?: number | null }) {
  const [s, setS] = useState<{ id: string; data: PortalSummary } | null>(null);
  const [failed, setFailed] = useState(false);
  const id = String(studentId ?? "");
  useEffect(() => {
    let live = true;
    api.get<PortalSummary>(`/lms/portal/summary${studentId ? `?student_id=${studentId}` : ""}`).then((r) => live && setS({ id, data: r })).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [studentId, id]);
  if (failed) return null;
  const d = s?.id === id ? s.data : null;
  const c = d?.next_class;
  const joinable = !!c && (c.phase === "open" || c.phase === "live") && d?.can_join;
  return (
    <Paper>
      <PaperHeader title="Classes & homework" action={<Link href="/dashboard/my/homework" className="text-[13px] text-primary hover:underline">All homework</Link>} />
      {!d ? <div className="space-y-2 p-5"><Skeleton className="h-12 w-full" /><Skeleton className="h-10 w-full" /></div> : (
        <div className="divide-y divide-line">
          <div className="px-5 py-4">
            <p className="mb-1.5 text-[12px] uppercase tracking-[0.06em] text-faint">Next live class</p>
            {c ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-[14.5px] text-ink">{c.title}</p>
                  <p className="text-[12.5px] text-muted">{c.subject_name ? `${c.subject_name} · ` : ""}{formatDateTime(c.starts_at)} ({formatRelative(c.starts_at)})</p></div>
                {joinable ? <Link href={`/dashboard/my/classes/${c.uuid}/join${studentId ? `?student_id=${studentId}` : ""}`}><Button size="sm" variant="primary" icon={Video}>Join</Button></Link> : <PhaseBadge phase={c.phase} />}
              </div>
            ) : <p className="text-[13.5px] text-muted">No live classes scheduled.</p>}
          </div>
          <div className="px-5 py-3">
            <p className="mb-1 text-[12px] uppercase tracking-[0.06em] text-faint">Homework due{d.homework_due_total ? ` (${d.homework_due_total})` : ""}</p>
            {d.homework_due.length === 0 ? <p className="py-1 text-[13.5px] text-muted">All caught up.</p> : d.homework_due.slice(0, 4).map((h) => (
              <Link key={h.uuid} href="/dashboard/my/homework" className="flex items-center justify-between gap-3 rounded-lg px-1 py-2 hover:bg-sunken/60">
                <span className="min-w-0"><span className="block truncate text-[13.5px] text-ink">{h.title}</span><span className="block text-[12px] text-muted">{h.subject_name} · due {formatRelative(h.due_at)}</span></span>
                <StateBadge state={h.state} />
              </Link>
            ))}
            {d.open_quizzes > 0 && <Link href="/dashboard/my/quizzes" className="mt-1 flex items-center gap-2 text-[13px] text-primary hover:underline"><ListChecks size={15} strokeWidth={1.4} />{d.open_quizzes} quiz{d.open_quizzes > 1 ? "zes" : ""} open</Link>}
          </div>
        </div>
      )}
    </Paper>
  );
}
