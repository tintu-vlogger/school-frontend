"use client";

/*
 * Shifts & roster: a grid of people by day. Each cell shows the planned shift (coloured
 * chip), a weekly off, holidays and leave. Planners drag a shift from the palette onto a
 * cell, or select cells (click, shift-click for a range) and assign from a modal. Every
 * change is checked against the rest rules and the women's night-shift consent rule.
 * Changes are drafts (dashed) until published. Cells from someone's usual work arrangement
 * (no roster entry) are shown faded. Employees see the published roster and can ask for a
 * shift change or a swap.
 */
import { useCallback, useEffect, useMemo, useState, type DragEvent, type MouseEvent } from "react";
import {
  CalendarRange, ChevronLeft, ChevronRight, Eraser, Layers, Megaphone, MoonStar, Plus, Repeat, ShieldCheck, Shuffle, Wand2, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatMonth, todayISO } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Avatar, Button, FilterBar, Skeleton, Tabs, useConfirm, type FilterValues, type SelectOption } from "@/components/ui-kit";
import { WEEKDAYS, addDays, dayNumber, errorText, mondayOf, shiftColor, useAttendanceAccess, weekdayIndex } from "@/components/attendance/shared";
import {
  ApplyPatternModal, AssignModal, ConsentModal, PatternsModal, ShiftChangeModal, ShiftChip, SwapModal,
} from "@/components/attendance/roster-modals";
import type { AssignResult, Cell, Grid, GridRow, Shift } from "@/components/attendance/roster-types";

type View = "week" | "fortnight" | "month";

function rangeFor(view: View, anchor: string): { start: string; end: string } {
  if (view === "month") {
    const [y, m] = anchor.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { start: `${anchor.slice(0, 7)}-01`, end: `${anchor.slice(0, 7)}-${String(last).padStart(2, "0")}` };
  }
  const start = mondayOf(anchor);
  return { start, end: addDays(start, view === "week" ? 6 : 13) };
}

function shiftAnchor(view: View, anchor: string, dir: 1 | -1): string {
  if (view === "month") {
    const [y, m] = anchor.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + dir, 1));
    return d.toISOString().slice(0, 10);
  }
  return addDays(anchor, dir * (view === "week" ? 7 : 14));
}

const key = (eid: number, d: string) => `${eid}|${d}`;

export default function RosterPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const access = useAttendanceAccess();
  const today = todayISO();
  const [view, setView] = useState<View>("fortnight");
  const [anchor, setAnchor] = useState(today);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [grid, setGrid] = useState<Grid | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [departments, setDepartments] = useState<SelectOption<number>[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastClick, setLastClick] = useState<{ row: number; col: number } | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "assign" | "assign-selected" | "pattern" | "patterns" | "consent" | "change" | "swap">(null);

  const { start, end } = rangeFor(view, anchor);
  const days = useMemo(() => {
    const out: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [start, end]);

  useEffect(() => {
    api.getCached<{ id: number; department_name: string }[]>("/departments/", 120)
      .then((r) => setDepartments((Array.isArray(r) ? r : []).map((d) => ({ value: d.id, label: d.department_name }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const p = new URLSearchParams({ start_date: start, end_date: end });
    if (q) p.set("q", q);
    if (filters.department?.[0]) p.set("department_id", filters.department[0]);
    if (filters.team?.[0]) p.set("team_id", filters.team[0]);
    api.get<Grid>(`/roster/grid?${p}`)
      .then((g) => { if (live) setGrid(g); })
      .catch((e) => { if (live) toast.error("Couldn't load the roster", { description: errorText(e) }); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [start, end, q, filters, nonce, toast]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const shifts = useMemo(() => grid?.shifts ?? [], [grid]);
  const byId = useMemo(() => Object.fromEntries(shifts.map((s) => [s.id, s])) as Record<number, Shift>, [shifts]);
  const rows = grid?.rows ?? [];
  const canManage = !!grid?.can_manage;
  const teams = useMemo(() => (grid?.teams ?? []).map((t) => ({ value: t.value, label: t.label })), [grid]);

  // ── Selection ──
  function onCellClick(e: MouseEvent, rowIdx: number, colIdx: number) {
    if (!canManage) return;
    const k = key(rows[rowIdx].employee_id, days[colIdx]);
    setSelected((prev) => {
      const next = new Set(e.metaKey || e.ctrlKey || e.shiftKey ? prev : []);
      if (e.shiftKey && lastClick) {
        const [r0, r1] = [Math.min(lastClick.row, rowIdx), Math.max(lastClick.row, rowIdx)];
        const [c0, c1] = [Math.min(lastClick.col, colIdx), Math.max(lastClick.col, colIdx)];
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) next.add(key(rows[r].employee_id, days[c]));
      } else if (prev.has(k) && (e.metaKey || e.ctrlKey || prev.size === 1)) {
        next.delete(k);
      } else {
        next.add(k);
      }
      return next;
    });
    setLastClick({ row: rowIdx, col: colIdx });
  }

  const selection = useMemo(() => {
    const cells: Record<number, string[]> = {};
    for (const k of selected) {
      const [eid, d] = k.split("|");
      (cells[Number(eid)] ||= []).push(d);
    }
    const employeeIds = Object.keys(cells).map(Number);
    const dates = Array.from(new Set(Object.values(cells).flat())).sort();
    const names = Object.fromEntries(rows.filter((r) => cells[r.employee_id]).map((r) => [r.employee_id, r.name]));
    return { cells, employeeIds, dates, names };
  }, [selected, rows]);

  // ── Quick assign (drag and drop) ──
  async function quickAssign(eids: number[], dates: string[], what: string) {
    try {
      const body = what === "off" ? { status: "off" } : { status: "working", shift_id: Number(what) };
      const r = await api.post<AssignResult>("/roster/assign", { ...body, employee_ids: eids, dates });
      if (r.blocked.length) toast.error(r.saved ? `${r.saved} saved, ${r.blocked.length} not allowed` : "Not allowed", { description: r.blocked[0].message });
      else if (r.warnings.length) toast.info(`${r.saved} day(s) saved as draft`, { description: r.warnings[0].message });
      else toast.success(`${r.saved} day(s) saved as draft`);
      refresh();
    } catch (e) {
      toast.error(errorText(e, "Couldn't change the roster"));
    }
  }

  function onDrop(e: DragEvent, eid: number, d: string) {
    e.preventDefault();
    setDragOver(null);
    const what = e.dataTransfer.getData("text/x-shift");
    if (!what) return;
    const k = key(eid, d);
    if (selected.has(k) && selected.size > 1) {
      // dropping on a selected cell fills the whole selection
      Promise.all(Object.entries(selection.cells).map(([id, ds]) => quickAssign([Number(id)], ds, what))).then(() => setSelected(new Set()));
    } else {
      quickAssign([eid], [d], what);
    }
  }

  async function clearSelected() {
    if (!(await confirm({ title: `Clear ${selected.size} planned day(s)?`, message: "These people go back to their usual work arrangement on those days.", confirmLabel: "Clear", tone: "danger" }))) return;
    try {
      let n = 0;
      for (const [eid, ds] of Object.entries(selection.cells)) {
        const sorted = [...ds].sort();
        const r = await api.post<{ cleared: number }>("/roster/clear", { employee_ids: [Number(eid)], start_date: sorted[0], end_date: sorted[sorted.length - 1] });
        n += r.cleared;
      }
      toast.success(`${n} day(s) cleared`);
      setSelected(new Set());
      refresh();
    } catch (e) {
      toast.error(errorText(e));
    }
  }

  async function publish() {
    const drafts = grid?.drafts ?? 0;
    if (!(await confirm({
      title: `Publish ${drafts} draft day(s)?`,
      message: `Employees see their roster from ${formatDate(start)} to ${formatDate(end)} and are told about it. Attendance uses the new shifts from now on.`,
      confirmLabel: "Publish",
    }))) return;
    try {
      const r = await api.post<{ published: number }>("/roster/publish", { start_date: start, end_date: end, employee_ids: [] });
      toast.success(`${r.published} day(s) published`);
      refresh();
    } catch (e) {
      toast.error(errorText(e, "Couldn't publish"));
    }
  }

  const title = view === "month" ? formatMonth(start) : `${formatDate(start, { year: undefined })} to ${formatDate(end)}`;
  const isEmployee = !!access?.employee_id;

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        title="Shifts & roster"
        description={canManage ? "Plan shifts by dragging them onto the grid. Rest rules and night-shift consent are checked on every change." : "Your team's published shifts."}
        actions={<>
          {isEmployee && <Button variant="secondary" icon={Repeat} onClick={() => setModal("change")}>Ask for shift change</Button>}
          {isEmployee && <Button variant="secondary" icon={Shuffle} onClick={() => setModal("swap")}>Swap shift</Button>}
          {canManage && <Button variant="secondary" icon={MoonStar} onClick={() => setModal("consent")}>Night-shift consent</Button>}
          {canManage && <Button variant="secondary" icon={Layers} onClick={() => setModal("patterns")}>Patterns</Button>}
          {canManage && <Button variant="primary" icon={Megaphone} disabled={!grid?.drafts} onClick={publish}>Publish{grid?.drafts ? ` ${grid.drafts}` : ""}</Button>}
        </>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs variant="pill" value={view} onChange={(v) => setView(v)} items={[
          { value: "week", label: "Week" }, { value: "fortnight", label: "2 weeks" }, { value: "month", label: "Month" },
        ]} />
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Previous" onClick={() => setAnchor((a) => shiftAnchor(view, a, -1))} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink"><ChevronLeft size={17} strokeWidth={1.4} /></button>
          <button type="button" aria-label="Next" onClick={() => setAnchor((a) => shiftAnchor(view, a, 1))} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink"><ChevronRight size={17} strokeWidth={1.4} /></button>
          <span className="ml-1 text-[15px] text-ink">{title}</span>
          {!(today >= start && today <= end) && <Button size="sm" variant="ghost" onClick={() => setAnchor(today)}>Today</Button>}
        </div>
        <div className="ml-auto">
          <FilterBar
            className="!mb-0"
            searchPlaceholder="Search people"
            onSearchChange={setQ}
            filters={[
              { key: "department", label: "Department", options: departments.map((d) => ({ value: String(d.value), label: d.label })) },
              ...(teams.length ? [{ key: "team", label: "Team", options: teams.map((t) => ({ value: String(t.value), label: t.label })) }] : []),
            ]}
            values={filters}
            onChange={setFilters}
          />
        </div>
      </div>

      {canManage && (
        <Paper className="mb-4 flex flex-wrap items-center gap-2 px-4 py-3">
          <span className="mr-1 text-[13px] text-muted">Drag onto the grid</span>
          {shifts.filter((s) => s.active).map((s) => {
            const c = shiftColor(s.color);
            return (
              <span key={s.id} draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-shift", String(s.id)); e.dataTransfer.effectAllowed = "copy"; }}
                title={`${s.name}: ${s.start_time} to ${s.end_time}`}
                className={`inline-flex cursor-grab items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[13px] active:cursor-grabbing ${c.chip}`}>
                <span className="font-normal">{s.code}</span>
                <span className="opacity-80">{s.name} · {s.start_time}–{s.end_time}{s.is_night ? " · night" : ""}</span>
              </span>
            );
          })}
          <span draggable onDragStart={(e) => { e.dataTransfer.setData("text/x-shift", "off"); e.dataTransfer.effectAllowed = "copy"; }}
            className="inline-flex cursor-grab items-center rounded-lg border border-line bg-sunken px-2.5 py-1 text-[13px] text-muted">Weekly off</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="secondary" icon={Wand2} onClick={() => setModal("pattern")}>Apply pattern</Button>
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setModal("assign")}>Assign</Button>
          </div>
        </Paper>
      )}

      {loading && !grid ? (
        <Paper className="p-4"><Skeleton className="h-80 w-full" /></Paper>
      ) : rows.length === 0 ? (
        <Paper><EmptyState icon={CalendarRange} title="Nobody to show" hint="Try another search or clear the filters." /></Paper>
      ) : (
        <Paper className={`overflow-hidden ${loading ? "opacity-70" : ""}`}>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 min-w-[220px] border-b border-line bg-surface px-4 py-2.5 text-left font-normal text-muted">Employee</th>
                  {days.map((d) => {
                    const wd = weekdayIndex(d);
                    return (
                      <th key={d} className={`min-w-[52px] border-b border-l border-line px-1 py-2 text-center font-normal ${d === today ? "bg-primary/5 text-primary" : wd >= 5 ? "bg-sunken/50 text-faint" : "text-muted"}`}>
                        <div className="text-[11px] uppercase tracking-wide">{WEEKDAYS[wd]}</div>
                        <div className="tabular text-[14px]">{dayNumber(d)}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <RosterRow key={r.employee_id} row={r} ri={ri} days={days} today={today} byId={byId} selected={selected}
                    canManage={canManage} dragOver={dragOver} setDragOver={setDragOver} onDrop={onDrop} onCellClick={onCellClick} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-2.5 text-[12.5px] text-muted">
            <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border border-dashed border-primary/60" /> Draft, not published</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border border-line opacity-50" /> Usual work week</span>
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-indigo-500" /> Holiday</span>
            <span className="flex items-center gap-1.5"><span className="rounded bg-sky-100 px-1 text-[10.5px] text-sky-800">L</span> On leave</span>
            <span className="flex items-center gap-1.5"><MoonStar size={13} strokeWidth={1.4} /> Night-shift consent on file</span>
          </div>
        </Paper>
      )}

      {canManage && selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 text-[14px] shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
            <span className="mr-2 text-ink">{selected.size} day(s) selected</span>
            <Button size="sm" variant="primary" icon={ShieldCheck} onClick={() => setModal("assign-selected")}>Assign shift</Button>
            <Button size="sm" variant="secondary" onClick={() => Promise.all(Object.entries(selection.cells).map(([id, ds]) => quickAssign([Number(id)], ds, "off"))).then(() => setSelected(new Set()))}>Weekly off</Button>
            <Button size="sm" variant="ghost" icon={Eraser} onClick={clearSelected}>Clear</Button>
            <Button size="sm" variant="ghost" icon={X} onClick={() => setSelected(new Set())}>Deselect</Button>
          </div>
        </div>
      )}

      {canManage && (
        <>
          <AssignModal key={`a${modal === "assign"}`} open={modal === "assign"} onClose={() => setModal(null)} shifts={shifts} teams={teams}
            departments={departments} target={null} onSaved={() => { setModal(null); refresh(); }} />
          <AssignModal key={`s${modal === "assign-selected"}`} open={modal === "assign-selected"} onClose={() => setModal(null)} shifts={shifts}
            teams={teams} departments={departments} cells={selection.cells}
            target={{ employeeIds: selection.employeeIds, names: selection.names, dates: selection.dates }}
            onSaved={() => { setModal(null); setSelected(new Set()); refresh(); }} />
          <ApplyPatternModal key={`p${modal === "pattern"}`} open={modal === "pattern"} onClose={() => setModal(null)} teams={teams}
            departments={departments} defaultRange={{ from: start, to: end }} onSaved={() => { setModal(null); refresh(); }} />
          <PatternsModal open={modal === "patterns"} onClose={() => setModal(null)} shifts={shifts} />
          <ConsentModal open={modal === "consent"} onClose={() => setModal(null)} onChanged={refresh} />
        </>
      )}
      {isEmployee && (
        <>
          <ShiftChangeModal key={`c${modal === "change"}`} open={modal === "change"} onClose={() => setModal(null)} shifts={shifts} />
          <SwapModal key={`w${modal === "swap"}`} open={modal === "swap"} onClose={() => setModal(null)} />
        </>
      )}
    </div>
  );
}

function RosterRow({
  row, ri, days, today, byId, selected, canManage, dragOver, setDragOver, onDrop, onCellClick,
}: {
  row: GridRow; ri: number; days: string[]; today: string; byId: Record<number, Shift>; selected: Set<string>;
  canManage: boolean; dragOver: string | null; setDragOver: (k: string | null) => void;
  onDrop: (e: DragEvent, eid: number, d: string) => void; onCellClick: (e: MouseEvent, ri: number, ci: number) => void;
}) {
  return (
    <tr className="group">
      <td className="sticky left-0 z-10 border-b border-line bg-surface px-4 py-2 group-hover:bg-sunken/40">
        <div className="flex items-center gap-2.5">
          <Avatar name={row.name} src={row.photo} size={28} />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] text-ink">{row.name}</p>
            <p className="flex items-center gap-1 text-[11.5px] text-faint">
              {row.employee_code || "—"}
              {row.woman && row.night_consent && <MoonStar size={11} strokeWidth={1.4} className="text-violet-500" aria-label="Night-shift consent on file" />}
            </p>
          </div>
        </div>
      </td>
      {days.map((d, ci) => {
        const c: Cell | undefined = row.cells[d];
        const k = `${row.employee_id}|${d}`;
        const isSel = selected.has(k);
        const off = !c || c.status === "off" || c.day_type === "weekly_off";
        const shift = c?.shift_id ? byId[c.shift_id] : null;
        const draft = c && c.entry && !c.published;
        return (
          <td key={d}
            onClick={(e) => onCellClick(e, ri, ci)}
            onDragOver={canManage ? (e) => { e.preventDefault(); if (dragOver !== k) setDragOver(k); } : undefined}
            onDragLeave={canManage ? () => setDragOver(null) : undefined}
            onDrop={canManage ? (e) => onDrop(e, row.employee_id, d) : undefined}
            title={[shift ? `${shift.name} ${shift.start_time}–${shift.end_time}` : off ? "Weekly off" : "", c?.holiday_name || "", c?.on_leave ? "On leave" : "", draft ? "Draft" : ""].filter(Boolean).join(" · ")}
            className={`relative border-b border-l border-line p-1 text-center align-middle ${d === today ? "bg-primary/[0.03]" : ""} ${canManage ? "cursor-pointer" : ""} ${dragOver === k ? "bg-primary/10" : ""}`}>
            <div className={`flex h-9 items-center justify-center rounded-lg border ${draft ? "border-dashed border-primary/60" : "border-transparent"} ${isSel ? "ring-2 ring-primary/70" : ""} ${c && !c.entry ? "opacity-55" : ""}`}>
              {c?.on_leave ? (
                <span className="rounded bg-sky-100 px-1.5 text-[11px] text-sky-800">L</span>
              ) : (
                <ShiftChip shift={shift} off={off} small />
              )}
            </div>
            {c?.day_type === "holiday" && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-indigo-500" />}
          </td>
        );
      })}
    </tr>
  );
}
