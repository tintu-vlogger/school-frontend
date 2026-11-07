"use client";

/*
 * Portal: a child's weekly timetable. A grid on wide screens; on phones one day at a time
 * (today first) as a list.
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Skeleton, Tabs } from "@/components/ui-kit";
import { MyChildSwitcher, useMyChild } from "@/components/student_attendance/child";
import { WeekGrid, subjectTint, type TtDay, type TtEntry } from "@/components/timetable/week-grid";

type Week = {
  published: boolean; section_label?: string; days: TtDay[]; entries: TtEntry[]; today: string; weekday: number;
  dates?: Record<string, string>; published_at?: string | null;
};

export default function PortalTimetablePage() {
  const { term } = useInstitution();
  const child = useMyChild();
  const [week, setWeek] = useState<Week | null>(null);
  const [day, setDay] = useState<string>("");
  useEffect(() => {
    if (!child.studentId) return;
    let live = true;
    setWeek(null);
    api.get<Week>(`/timetable/portal/week?student_id=${child.studentId}`).then((w) => {
      if (!live) return;
      setWeek(w);
      const has = w.days.some((d) => d.weekday === w.weekday);
      setDay(String(has ? w.weekday : w.days[0]?.weekday ?? 1));
    }).catch(() => live && setWeek({ published: false, days: [], entries: [], today: "", weekday: 1 }));
    return () => { live = false; };
  }, [child.studentId]);

  const dayObj = week?.days.find((d) => String(d.weekday) === day);
  const dayEntries = useMemo(() => (week?.entries ?? []).filter((e) => String(e.weekday) === day), [week, day]);

  return (
    <div>
      <PageHeader title="Timetable" description={week?.section_label ? `${week.section_label}${week.published_at ? ` · updated ${formatDateTime(week.published_at)}` : ""}` : undefined}
        actions={<MyChildSwitcher child={child} />} />
      {child.ready && !child.studentId ? (
        <Paper><EmptyState icon={CalendarClock} title={`No ${term("student").toLowerCase()} linked to this sign-in`} /></Paper>
      ) : !week ? <Skeleton className="h-80 w-full" /> : !week.published ? (
        <Paper><EmptyState icon={CalendarClock} title="The timetable is not published yet" hint="It appears here as soon as the school publishes it." /></Paper>
      ) : (
        <>
          <Paper className="hidden min-w-0 md:block">
            <WeekGrid days={week.days} entries={week.entries} mode="section" highlightWeekday={week.weekday} minWidth={680} />
          </Paper>
          <div className="md:hidden">
            <div className="-mx-1 mb-3 overflow-x-auto px-1">
              <Tabs variant="pill" value={day} onChange={setDay}
                items={week.days.map((d) => ({ value: String(d.weekday), label: d.weekday === week.weekday ? "Today" : d.short }))} />
            </div>
            <Paper>
              <p className="border-b border-line px-4 py-3 text-[14px] text-ink">
                {dayObj?.label}{week.dates?.[day] ? <span className="ml-2 text-[12.5px] text-muted">{formatDate(week.dates[day])}</span> : null}
              </p>
              <ul className="divide-y divide-line">
                {(dayObj?.periods ?? []).map((p) => {
                  if (p.kind !== "class") {
                    return <li key={p.uuid} className="bg-sunken/60 px-4 py-1.5 text-[12px] text-faint">{p.name} · {p.start}</li>;
                  }
                  const list = dayEntries.filter((e) => e.period_no === p.no);
                  return (
                    <li key={p.uuid} className="flex gap-3 px-4 py-3">
                      <div className="w-14 shrink-0 text-[12px] text-muted"><p>{p.start}</p><p className="text-faint">{p.end}</p></div>
                      <div className="min-w-0 flex-1 space-y-1">
                        {list.length === 0 ? <p className="text-[13px] text-faint">Free</p> : list.map((e) => (
                          <div key={e.uuid} className="flex gap-2">
                            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: subjectTint(e) }} />
                            <div className="min-w-0">
                              <p className="truncate text-[13.5px] text-ink">{e.subject_name ?? "Free period"}</p>
                              <p className="truncate text-[12px] text-muted">{[e.teacher_name, e.room_name, e.elective_group].filter(Boolean).join(" · ")}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Paper>
          </div>
        </>
      )}
    </div>
  );
}
