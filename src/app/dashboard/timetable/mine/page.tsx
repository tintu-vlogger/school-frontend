"use client";

/*
 * My timetable (any staff member who teaches): the published weekly timetable with today
 * highlighted, and the classes of a picked day including substitutions given to them.
 */
import { useEffect, useState } from "react";
import { CalendarClock, Printer, Replace } from "lucide-react";
import { api } from "@/lib/api";
import { formatLongDate, todayISO } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import { EmptyState, PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Button, DateInput, Skeleton } from "@/components/ui-kit";
import { PrintStyle, WeekGrid, subjectTint, type TtDay, type TtEntry } from "@/components/timetable/week-grid";

type Week = { teacher: { id: number; name: string } | null; days: TtDay[]; entries: TtEntry[]; weekly: number };
type DayClass = TtEntry & { start: string | null; end: string | null; period_name: string; is_substitution: boolean; absent_teacher_name: string | null };

export default function MyTimetablePage() {
  const { term } = useInstitution();
  const [week, setWeek] = useState<Week | null>(null);
  const [day, setDay] = useState("");
  const [classes, setClasses] = useState<DayClass[] | null>(null);
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("date");
    setDay(fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl) ? fromUrl : todayISO());
    api.get<Week>("/timetable/mine").then(setWeek).catch(() => setWeek({ teacher: null, days: [], entries: [], weekly: 0 }));
  }, []);
  useEffect(() => {
    if (!day) return;
    let live = true;
    setClasses(null);
    api.get<{ classes: DayClass[] }>(`/timetable/mine/day?on=${day}`).then((r) => live && setClasses(r.classes)).catch(() => live && setClasses([]));
    return () => { live = false; };
  }, [day]);
  const todayWd = (() => { const d = new Date(`${todayISO()}T12:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; })();

  return (
    <div>
      <PrintStyle />
      <PageHeader eyebrow="Academics" title="My timetable"
        description={week?.weekly ? `${week.weekly} periods a week` : `Your classes across every ${term("section").toLowerCase()}.`}
        actions={<div className="tt-no-print"><Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print</Button></div>} />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Paper className="tt-print min-w-0">
          <PaperHeader title="This week" />
          {!week ? <Skeleton className="m-5 h-80" /> : week.entries.length === 0 ? (
            <EmptyState icon={CalendarClock} title="No published timetable yet" hint="Your periods appear here once the timetable is published." />
          ) : <WeekGrid days={week.days} entries={week.entries} mode="teacher" highlightWeekday={todayWd} />}
        </Paper>
        <Paper className="tt-no-print h-fit">
          <div className="border-b border-line px-5 py-3.5">
            <DateInput value={day} onChange={(v) => v && setDay(v)} />
          </div>
          <p className="px-5 pt-3 text-[13px] text-muted">{day && formatLongDate(day)}</p>
          {!classes ? <Skeleton className="m-5 h-32" /> : classes.length === 0 ? (
            <p className="px-5 py-6 text-[13.5px] text-muted">No classes this day.</p>
          ) : (
            <ul className="space-y-2 p-4">
              {classes.map((c) => (
                <li key={`${c.uuid}-${c.period_no}`} className="flex gap-3 rounded-xl border border-line p-3">
                  <span className="mt-1 h-8 w-1 shrink-0 rounded-full" style={{ background: subjectTint(c) }} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[13.5px] text-ink">
                      {c.subject_name ?? "Free period"}
                      {c.is_substitution && <Badge tone="accent"><Replace size={11} strokeWidth={1.6} className="mr-1 inline" />Substitution</Badge>}
                    </p>
                    <p className="text-[12.5px] text-muted">{c.section_label}{c.room_name ? ` · ${c.room_name}` : ""}</p>
                    {c.is_substitution && c.absent_teacher_name && <p className="text-[12px] text-faint">For {c.absent_teacher_name}</p>}
                  </div>
                  <div className="text-right text-[12px] text-muted">
                    <p>{c.period_name}</p>
                    {c.start && <p className="tabular">{c.start}–{c.end}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Paper>
      </div>
    </div>
  );
}
