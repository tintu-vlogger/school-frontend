"use client";

/*
 * Weekly timetable grid shared by the builder, teacher and room views, "My timetable" and
 * the portal.
 *   <WeekGrid days={grid.days} entries={grid.entries} mode="section" onCellClick={(wd, p, list) => ...}
 *             highlightWeekday={3} clashIds={new Set(["uuid"])} />
 * Rows follow the longest day's bell schedule (breaks drawn as thin rows); a day without
 * that period shows a hatched cell. The grid scrolls sideways inside its own frame on phones.
 */
import { avatarTint } from "@/components/ui-kit";

export type TtPeriod = { uuid: string; no: number | null; name: string; kind: string; start: string; end: string; sort_order?: number };
export type TtDay = { weekday: number; label: string; short: string; schedule: string | null; periods: TtPeriod[] };
export type TtEntry = {
  uuid: string; id: number; section_id: number; section_label: string; weekday: number; period_no: number;
  subject_id: number | null; subject_name: string | null; subject_code: string | null; subject_color: string | null;
  teacher_id?: number | null; teacher_name: string | null; room_id: number | null; room_name: string | null;
  group_key: string | null; elective_group: string | null; note: string | null;
};
export type TtClash = {
  kind: string; severity: "error" | "warning"; weekday: number | null; period_no: number | null; message: string;
  entry_ids: number[]; entry_uuids: string[]; teacher_id?: number;
};

export const WEEKDAY_NAMES = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function subjectTint(e: { subject_color: string | null; subject_name: string | null }) {
  return e.subject_color || avatarTint(e.subject_name || "Free");
}

type Mode = "section" | "teacher" | "room";

/** Row template: the day with the most slots. */
export function templateRows(days: TtDay[]): TtPeriod[] {
  let best: TtPeriod[] = [];
  for (const d of days) if (d.periods.length > best.length) best = d.periods;
  return best;
}

export function EntryChip({ e, mode, clash }: { e: TtEntry; mode: Mode; clash?: boolean }) {
  const tint = subjectTint(e);
  const second = mode === "section" ? e.teacher_name : e.section_label;
  const third = mode === "room" ? e.teacher_name : e.room_name;
  return (
    <div className={`min-w-0 rounded-lg border px-2 py-1.5 text-left ${clash ? "border-rose-300 bg-rose-50" : "border-transparent"}`}
      style={clash ? undefined : { background: `${tint}14` }}>
      <p className="flex items-center gap-1.5 truncate text-[12.5px] text-ink">
        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: tint }} />
        <span className="truncate">{e.subject_name || "Free period"}</span>
      </p>
      {second && <p className="truncate text-[11.5px] text-muted">{second}</p>}
      {(third || e.elective_group || e.group_key) && (
        <p className="truncate text-[11px] text-faint">
          {[third, e.elective_group, e.group_key && mode === "section" ? "Combined" : null].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

export function WeekGrid({
  days, entries, mode = "section", onCellClick, highlightWeekday, clashIds, emptyLabel = "", minWidth = 760, cellHeight = 64,
}: {
  days: TtDay[]; entries: TtEntry[]; mode?: Mode;
  onCellClick?: (weekday: number, periodNo: number, list: TtEntry[]) => void;
  highlightWeekday?: number | null; clashIds?: Set<string>; emptyLabel?: string; minWidth?: number; cellHeight?: number;
}) {
  const rows = templateRows(days);
  const byCell = new Map<string, TtEntry[]>();
  for (const e of entries) {
    const k = `${e.weekday}:${e.period_no}`;
    byCell.set(k, [...(byCell.get(k) ?? []), e]);
  }
  if (!days.length || !rows.length) {
    return <p className="px-5 py-10 text-center text-[13.5px] text-muted">Set up a bell schedule first (Bell schedules tab).</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-[13px]" style={{ minWidth }}>
        <thead>
          <tr>
            <th className="sticky left-0 z-[1] w-[92px] border-b border-line bg-surface px-3 py-2 text-left text-[12px] font-normal text-muted">Period</th>
            {days.map((d) => (
              <th key={d.weekday} className={`border-b border-line px-2 py-2 text-left text-[12.5px] font-normal ${d.weekday === highlightWeekday ? "text-primary" : "text-muted"}`}>
                <span className="hidden sm:inline">{d.label}</span><span className="sm:hidden">{d.short}</span>
                {d.weekday === highlightWeekday && <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10.5px] text-primary">Today</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            if (p.kind !== "class") {
              return (
                <tr key={p.uuid}>
                  <td className="sticky left-0 z-[1] border-b border-line bg-sunken/60 px-3 py-1 text-[11.5px] text-faint">{p.start}</td>
                  <td colSpan={days.length} className="border-b border-line bg-sunken/60 px-2 py-1 text-[11.5px] text-faint">{p.name}</td>
                </tr>
              );
            }
            return (
              <tr key={p.uuid}>
                <td className="sticky left-0 z-[1] border-b border-line bg-surface px-3 py-2 align-top">
                  <p className="text-[12.5px] text-ink">{p.name}</p>
                  <p className="tabular text-[11px] text-faint">{p.start}–{p.end}</p>
                </td>
                {days.map((d) => {
                  const own = d.periods.find((x) => x.no === p.no);
                  const list = byCell.get(`${d.weekday}:${p.no}`) ?? [];
                  const today = d.weekday === highlightWeekday;
                  if (!own) {
                    return <td key={d.weekday} className="border-b border-line bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(0,0,0,0.03)_6px,rgba(0,0,0,0.03)_12px)]" />;
                  }
                  const clash = list.some((e) => clashIds?.has(e.uuid));
                  const inner = list.length ? (
                    <div className="grid gap-1">
                      {list.map((e) => <EntryChip key={e.uuid} e={e} mode={mode} clash={clashIds?.has(e.uuid)} />)}
                    </div>
                  ) : <span className="text-[12px] text-faint">{emptyLabel}</span>;
                  return (
                    <td key={d.weekday} className={`border-b border-line p-1 align-top ${today ? "bg-primary/[0.04]" : ""}`}
                      title={own.start !== p.start ? `${own.start}–${own.end}` : undefined}>
                      {onCellClick ? (
                        <button type="button" onClick={() => onCellClick(d.weekday, p.no!, list)}
                          className={`block w-full rounded-lg p-0.5 text-left transition-colors hover:bg-sunken focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${clash ? "ring-1 ring-rose-300" : ""}`}
                          style={{ minHeight: cellHeight }} aria-label={`${d.label} ${p.name}`}>
                          {list.length ? inner : <span className="flex h-full items-center px-2 text-[12px] text-faint">+ Add</span>}
                        </button>
                      ) : <div style={{ minHeight: cellHeight - 8 }}>{inner}</div>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Print only the element with this class (used by the Print buttons). */
export function PrintStyle({ target = "tt-print" }: { target?: string }) {
  return (
    <style>{`@media print {
      body * { visibility: hidden !important; }
      .${target}, .${target} * { visibility: visible !important; }
      .${target} { position: absolute; left: 0; top: 0; width: 100%; border: none !important; }
      .${target} .overflow-x-auto { overflow: visible !important; }
      .tt-no-print { display: none !important; }
      @page { size: landscape; margin: 10mm; }
    }`}</style>
  );
}
