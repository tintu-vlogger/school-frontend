"use client";

/*
 * Home page cards for the timetable module.
 *   <StaffHomeCard />                   // the signed-in teacher's classes today (now / next), and for
 *                                       // timetable managers the periods of absent teachers still uncovered
 *   <PortalHomeCard studentId={id} />   // a child's periods today
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Replace } from "lucide-react";
import { api } from "@/lib/api";
import { Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Skeleton } from "@/components/ui-kit";
import { subjectTint, type TtEntry } from "./week-grid";

type Item = TtEntry & {
  start: string | null; end: string | null; period_name: string; is_substitution?: boolean;
  substitution?: { kind: string; teacher_name: string | null } | null;
};

function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function DayList({ items, who }: { items: Item[]; who: "teacher" | "portal" }) {
  const now = nowHM();
  const nextIdx = items.findIndex((i) => (i.end ?? "") > now);
  return (
    <ul className="divide-y divide-line">
      {items.map((c, i) => {
        const live = c.start && c.end && c.start <= now && now < c.end;
        const next = !live && i === nextIdx;
        const cancelled = c.substitution?.kind === "cancelled";
        const done = c.end ? c.end <= now : false;
        return (
          <li key={`${c.uuid}-${i}`} className={`flex items-center gap-3 px-5 py-2.5 ${done ? "opacity-55" : ""}`}>
            <span className="h-7 w-1 shrink-0 rounded-full" style={{ background: subjectTint(c) }} />
            <div className="min-w-0 flex-1">
              <p className={`truncate text-[13.5px] text-ink ${cancelled ? "line-through" : ""}`}>{c.subject_name ?? "Free period"}</p>
              <p className="truncate text-[12px] text-muted">
                {who === "teacher" ? [c.section_label, c.room_name].filter(Boolean).join(" · ")
                  : [c.substitution?.teacher_name ?? c.teacher_name, c.room_name].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="shrink-0 text-right">
              {live ? <Badge tone="accent" dot>Now</Badge> : next ? <Badge tone="neutral">Next</Badge>
                : c.is_substitution ? <Badge tone="warn">Cover</Badge> : cancelled ? <Badge>Cancelled</Badge> : null}
              <p className="tabular mt-0.5 text-[11.5px] text-faint">{c.start ?? c.period_name}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function StaffHomeCard() {
  const [d, setD] = useState<{ date: string; classes: Item[]; uncovered: number | null; absent_teachers?: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api.get<typeof d>("/timetable/summary").then(setD).catch(() => setFailed(true)); }, []);
  if (failed) return null;
  if (d && d.classes.length === 0 && !d.uncovered) {
    if (d.uncovered === null) return null; // not a teacher and not a timetable manager
  }
  return (
    <Paper>
      <PaperHeader title="My classes today" action={<Link href="/dashboard/timetable/mine" className="text-[13px] text-primary hover:underline">Week</Link>} />
      {!d ? <div className="space-y-2 p-5"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-6 w-1/2" /></div> : (
        <>
          {d.classes.length ? <DayList items={d.classes} who="teacher" /> : <p className="px-5 py-5 text-[13.5px] text-muted">No classes today.</p>}
          {!!d.uncovered && (
            <Link href="/dashboard/timetable/substitutions" className="flex items-center gap-2 border-t border-line px-5 py-3 text-[13px] text-amber-700 hover:bg-sunken">
              <Replace size={15} strokeWidth={1.4} />
              {d.uncovered} period{d.uncovered === 1 ? "" : "s"} of absent teachers not covered
            </Link>
          )}
        </>
      )}
    </Paper>
  );
}

export function PortalHomeCard({ studentId }: { studentId: number }) {
  const [d, setD] = useState<{ date: string; periods: Item[] } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setD(null);
    api.get<{ date: string; periods: Item[] }>(`/timetable/portal/summary?student_id=${studentId}`).then(setD).catch(() => setFailed(true));
  }, [studentId]);
  if (failed) return null;
  return (
    <Paper>
      <PaperHeader title="Today's timetable" action={<Link href="/dashboard/my/timetable" className="text-[13px] text-primary hover:underline">Week</Link>} />
      {!d ? <div className="space-y-2 p-5"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-6 w-1/2" /></div>
        : d.periods.length ? <DayList items={d.periods} who="portal" />
        : <p className="px-5 py-5 text-[13.5px] text-muted">No classes today.</p>}
    </Paper>
  );
}
