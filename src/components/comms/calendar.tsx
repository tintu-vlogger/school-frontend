"use client";

/*
 * Calendar views for the events calendar (staff and portal).
 *   const cal = useCalendar();                 // view, cursor, range { start, end } for the API
 *   <CalendarToolbar cal={cal} />
 *   <CalendarView cal={cal} events={rows} onEvent={open} onDay={(iso) => ...} />
 * Month grid (weeks start Monday), a week list and an agenda. Phones get the agenda.
 */
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { formatTime } from "@/lib/datetime";
import { EmptyState } from "@/components/shell/page";
import { Badge, Button, IconButton, Tabs, formatDisplayDate, parseISODate, toISODate } from "@/components/ui-kit";
import { CATEGORY_DOT, categoryTone, eventWhen, type CalEvent } from "./shared";

export type CalView = "month" | "week" | "agenda";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfWeek(d: Date) { const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

export function useCalendar(initial: CalView = "month") {
  const [view, setView] = useState<CalView>(initial);
  const [cursor, setCursor] = useState(() => new Date());
  const range = useMemo(() => {
    if (view === "week") { const s = startOfWeek(cursor); return { start: toISODate(s), end: toISODate(addDays(s, 6)) }; }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    if (view === "agenda") return { start: toISODate(first), end: toISODate(new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0)) };
    const s = startOfWeek(first);
    return { start: toISODate(s), end: toISODate(addDays(s, 41)) };
  }, [view, cursor]);
  const move = (dir: number) => setCursor((c) => view === "week" ? addDays(c, 7 * dir) : new Date(c.getFullYear(), c.getMonth() + dir, 1));
  const title = view === "week"
    ? `${formatDisplayDate(range.start)} – ${formatDisplayDate(range.end)}`
    : view === "agenda" ? `${MONTHS[cursor.getMonth()]} – ${MONTHS[(cursor.getMonth() + 1) % 12]} ${cursor.getFullYear()}`
    : `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;
  return { view, setView, cursor, setCursor, range, move, title, today: () => setCursor(new Date()) };
}
type Cal = ReturnType<typeof useCalendar>;

export function CalendarToolbar({ cal, actions }: { cal: Cal; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <IconButton icon={ChevronLeft} label="Previous" onClick={() => cal.move(-1)} />
        <IconButton icon={ChevronRight} label="Next" onClick={() => cal.move(1)} />
        <Button size="sm" variant="ghost" onClick={cal.today}>Today</Button>
        <h2 className="ml-2 text-[17px] font-light text-ink">{cal.title}</h2>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <Tabs variant="pill" value={cal.view} onChange={(v) => cal.setView(v as CalView)}
          items={[{ value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "agenda", label: "Agenda" }]} />
      </div>
    </div>
  );
}

function onDay(e: CalEvent, iso: string) { return e.start_date <= iso && e.end_date >= iso; }

function Chip({ e, onClick }: { e: CalEvent; onClick: () => void }) {
  return (
    <button type="button" onClick={(ev) => { ev.stopPropagation(); onClick(); }} title={e.title}
      className={`flex w-full items-center gap-1.5 truncate rounded-md px-1.5 py-0.5 text-left text-[12px] transition-colors hover:bg-sunken ${e.status === "cancelled" ? "text-faint line-through" : "text-ink/85"}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${CATEGORY_DOT[e.category] ?? "bg-indigo-500"}`} />
      {!e.all_day && e.start_at && <span className="shrink-0 text-muted">{formatTime(e.start_at).replace(":00", "")}</span>}
      <span className="truncate">{e.title}</span>
    </button>
  );
}

export function CalendarView(props: { cal: Cal; events: CalEvent[]; onEvent: (e: CalEvent) => void; onDay?: (iso: string) => void; loading?: boolean }) {
  if (props.cal.view === "agenda") return <Agenda events={props.events} onEvent={props.onEvent} loading={props.loading} />;
  // Phones always get the agenda; the grids need the width.
  return (
    <>
      <div className="hidden sm:block"><GridView {...props} /></div>
      <div className="sm:hidden"><Agenda events={props.events} onEvent={props.onEvent} loading={props.loading} /></div>
    </>
  );
}

function GridView({ cal, events, onEvent, onDay: onDayClick, loading }: {
  cal: Cal; events: CalEvent[]; onEvent: (e: CalEvent) => void; onDay?: (iso: string) => void; loading?: boolean;
}) {
  const todayIso = toISODate(new Date());
  if (cal.view === "month") {
    const start = parseISODate(cal.range.start)!;
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    return (
      <div className={`overflow-hidden rounded-2xl border border-line bg-surface ${loading ? "opacity-60" : ""}`}>
        <div className="grid grid-cols-7 border-b border-line">{WD.map((d) => <div key={d} className="px-2 py-2 text-[12px] text-faint">{d}</div>)}</div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const iso = toISODate(d);
            const list = events.filter((e) => onDay(e, iso));
            const other = d.getMonth() !== cal.cursor.getMonth();
            return (
              <div key={iso} onClick={() => onDayClick?.(iso)}
                className={`min-h-[104px] border-line p-1 ${i % 7 ? "border-l" : ""} ${i >= 7 ? "border-t" : ""} ${other ? "bg-sunken/30" : ""} ${onDayClick ? "cursor-pointer hover:bg-sunken/40" : ""}`}>
                <p className={`mb-0.5 px-1 text-[12.5px] ${iso === todayIso ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary px-0 text-white" : other ? "text-faint" : "text-muted"}`}>{d.getDate()}</p>
                <div className="space-y-0.5">
                  {list.slice(0, 3).map((e) => <Chip key={e.uuid} e={e} onClick={() => onEvent(e)} />)}
                  {list.length > 3 && <p className="px-1.5 text-[11.5px] text-muted">+{list.length - 3} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  if (cal.view === "week") {
    const start = parseISODate(cal.range.start)!;
    return (
      <div className={`grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-7 ${loading ? "opacity-60" : ""}`}>
        {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => {
          const iso = toISODate(d);
          const list = events.filter((e) => onDay(e, iso));
          return (
            <div key={iso} className="min-h-[220px] bg-surface p-2" onClick={() => onDayClick?.(iso)}>
              <p className={`mb-2 text-[12.5px] ${iso === todayIso ? "text-primary" : "text-muted"}`}>{WD[(d.getDay() + 6) % 7]} {d.getDate()}</p>
              <div className="space-y-1">{list.map((e) => <Chip key={e.uuid} e={e} onClick={() => onEvent(e)} />)}</div>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
}

export function Agenda({ events, onEvent, loading, compact }: { events: CalEvent[]; onEvent: (e: CalEvent) => void; loading?: boolean; compact?: boolean }) {
  const groups = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of [...events].sort((a, b) => (a.start_date + (a.start_at ?? "")).localeCompare(b.start_date + (b.start_at ?? "")))) {
      const k = e.start_date;
      m.set(k, [...(m.get(k) ?? []), e]);
    }
    return [...m.entries()];
  }, [events]);
  if (!loading && groups.length === 0) {
    return <div className="rounded-2xl border border-line bg-surface"><EmptyState icon={CalendarDays} title="Nothing on the calendar" hint="Events, holidays and exams for this period appear here." /></div>;
  }
  return (
    <div className={`divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface ${loading ? "opacity-60" : ""}`}>
      {groups.map(([day, list]) => {
        const d = parseISODate(day)!;
        return (
          <div key={day} className="flex gap-4 px-4 py-3">
            <div className="w-12 shrink-0 text-center">
              <p className="text-[11.5px] uppercase tracking-wide text-faint">{WD[(d.getDay() + 6) % 7]}</p>
              <p className="text-[22px] font-extralight leading-tight text-ink">{d.getDate()}</p>
              <p className="text-[11.5px] text-faint">{MONTHS[d.getMonth()].slice(0, 3)}</p>
            </div>
            <ul className="min-w-0 flex-1 space-y-2">
              {list.map((e) => (
                <li key={e.uuid}>
                  <button type="button" onClick={() => onEvent(e)} className="w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-sunken/60">
                    <p className={`flex flex-wrap items-center gap-2 text-[14.5px] ${e.status === "cancelled" ? "text-faint line-through" : "text-ink"}`}>
                      <span className={`h-2 w-2 rounded-full ${CATEGORY_DOT[e.category] ?? "bg-indigo-500"}`} />{e.title}
                      {!compact && <Badge tone={categoryTone(e.category)}>{e.category_label}</Badge>}
                      {e.status === "cancelled" && <Badge tone="bad">Cancelled</Badge>}
                      {e.my_rsvp && <Badge tone={e.my_rsvp.response === "yes" ? "good" : "neutral"}>You: {e.my_rsvp.response}</Badge>}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12.5px] text-muted">
                      <span>{eventWhen(e)}</span>
                      {e.location && <span className="inline-flex items-center gap-1"><MapPin size={12} strokeWidth={1.4} />{e.location}</span>}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
