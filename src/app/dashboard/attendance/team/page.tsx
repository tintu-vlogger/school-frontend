"use client";

/*
 * Team attendance: today's board (who is in, remote, on leave, absent, late) and a
 * monthly muster grid. Managers see their reports; HR sees everyone. A row or a day
 * cell opens the day's details.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlarmClock, ChevronLeft, ChevronRight, Home, LogIn, Plane, UserX, Users, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { formatMonth, formatTime } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, FilterBar, IconButton, Skeleton, StatCard, Tabs, type Column, type FilterValues,
} from "@/components/ui-kit";
import { DayDetailModal } from "@/components/attendance/admin-day-modal";
import { STATUS, StatusBadge, WEEKDAYS, errorText, hoursShort, minutesText, statusInfo, useAttendanceAccess, weekdayIndex } from "@/components/attendance/shared";

type Person = {
  employee_id: number; employee_uuid: string; name: string; employee_code: string | null; photo: string | null;
  bucket: string; uuid?: string; status: string; first_in?: string | null; last_out?: string | null; is_late?: boolean;
  late_minutes?: number; worked_minutes?: number; shift_name?: string | null; department_id: number | null;
};
type Today = { date: string; counts: Record<string, number>; people: Person[] };
type Cell = { s: string; late?: boolean; early?: boolean; ot?: number; w?: number; uuid?: string; future?: boolean };
type MusterRow = { employee_id: number; employee_uuid: string; name: string; employee_code: string | null; cells: Record<string, Cell>; summary: Record<string, number | string> };
type Muster = { year: number; month: number; rows: MusterRow[] };

function useDepartments() {
  const [opts, setOpts] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    api.getCached<{ id: number; department_name: string }[]>("/departments/", 120)
      .then((r) => setOpts((Array.isArray(r) ? r : []).map((d) => ({ value: String(d.id), label: d.department_name })))).catch(() => {});
  }, []);
  return opts;
}

export default function TeamAttendancePage() {
  const access = useAttendanceAccess();
  const [tab, setTab] = useState<"today" | "month">("today");
  const [view, setView] = useState<string | null>(null);
  const [noTeam, setNoTeam] = useState(false);
  const [nonce, setNonce] = useState(0);

  return (
    <div>
      <PageHeader title="Team attendance" eyebrow="Time"
        description={access?.can_manage ? "Everyone's attendance today and through the month." : "Your team's attendance today and through the month."} />
      {noTeam ? (
        <Paper><EmptyState icon={Users} title="You have no team to show" hint="People who report to you will appear here." /></Paper>
      ) : (
        <>
          <Tabs value={tab} onChange={setTab} className="mb-5" items={[{ value: "today", label: "Today" }, { value: "month", label: "Month" }]} />
          {tab === "today" && <TodayBoard key={nonce} onOpen={setView} onNoTeam={() => setNoTeam(true)} />}
          {tab === "month" && <MonthGrid key={nonce} onOpen={setView} onNoTeam={() => setNoTeam(true)} />}
        </>
      )}
      <DayDetailModal uuid={view} canManage={access?.can_manage} onClose={() => setView(null)} onChanged={() => setNonce((n) => n + 1)} />
    </div>
  );
}

function TodayBoard({ onOpen, onNoTeam }: { onOpen: (uuid: string) => void; onNoTeam: () => void }) {
  const departments = useDepartments();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [data, setData] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (filters.department?.[0]) p.set("department_id", filters.department[0]);
    let live = true;
    api.get<Today>(`/attendance/team/today?${p}`).then((d) => { if (live) { setData(d); setError(null); } })
      .catch((e) => { if (!live) return; const m = errorText(e); if (/no team/i.test(m)) onNoTeam(); else setError(m); });
    return () => { live = false; };
  }, [q, filters, onNoTeam]);

  const rows = useMemo(() => {
    const all = data?.people ?? [];
    const b = filters.bucket?.[0];
    if (!b) return all;
    if (b === "late") return all.filter((p) => p.is_late);
    return all.filter((p) => p.bucket === b);
  }, [data, filters.bucket]);

  const c = data?.counts ?? {};
  const columns: Column<Person>[] = [
    {
      key: "name", header: "Name", sortable: true, sortValue: (p) => p.name,
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={p.name} src={p.photo} size={32} />
          <div className="min-w-0"><p className="truncate text-ink">{p.name}</p>
            <p className="truncate text-[12.5px] text-muted">{p.employee_code ?? ""}{p.shift_name ? `${p.employee_code ? " · " : ""}${p.shift_name}` : ""}</p></div>
        </div>
      ),
    },
    { key: "status", header: "Status", sortable: true, sortValue: (p) => p.status, cell: (p) => <StatusBadge status={p.status} /> },
    { key: "in", header: "In", hideBelow: "sm", cell: (p) => p.first_in ? <span className="tabular">{formatTime(p.first_in)}</span> : <span className="text-faint">—</span> },
    { key: "out", header: "Out", hideBelow: "sm", cell: (p) => p.last_out ? <span className="tabular">{formatTime(p.last_out)}</span> : <span className="text-faint">—</span> },
    { key: "worked", header: "Worked", hideBelow: "md", cell: (p) => p.worked_minutes ? <span className="tabular text-muted">{minutesText(p.worked_minutes)}</span> : <span className="text-faint">—</span> },
    { key: "late", header: "Late", hideBelow: "md", cell: (p) => p.is_late ? <Badge tone="warn">{minutesText(p.late_minutes)}</Badge> : <span className="text-faint">—</span> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatCard label="In today" value={data ? c.present ?? 0 : "–"} icon={LogIn} onClick={() => setFilters({ ...filters, bucket: ["present"] })} />
        <StatCard label="Remote / on duty" value={data ? c.remote ?? 0 : "–"} icon={Home} onClick={() => setFilters({ ...filters, bucket: ["remote"] })} />
        <StatCard label="On leave" value={data ? c.on_leave ?? 0 : "–"} icon={Plane} onClick={() => setFilters({ ...filters, bucket: ["on_leave"] })} />
        <StatCard label="Absent" value={data ? c.absent ?? 0 : "–"} icon={UserX} onClick={() => setFilters({ ...filters, bucket: ["absent"] })} />
        <StatCard label="Not in yet" value={data ? c.not_yet ?? 0 : "–"} icon={Clock} onClick={() => setFilters({ ...filters, bucket: ["not_yet"] })} />
        <StatCard label="Late" value={data ? c.late ?? 0 : "–"} icon={AlarmClock} onClick={() => setFilters({ ...filters, bucket: ["late"] })} />
      </div>
      {error && <p className="text-[13.5px] text-rose-700">{error}</p>}
      <FilterBar searchPlaceholder="Search by name or code" onSearchChange={setQ}
        filters={[
          { key: "bucket", label: "Show", options: [{ value: "present", label: "In today" }, { value: "remote", label: "Remote / on duty" }, { value: "on_leave", label: "On leave" }, { value: "absent", label: "Absent" }, { value: "not_yet", label: "Not in yet" }, { value: "late", label: "Late" }, { value: "off", label: "Off today" }] },
          { key: "department", label: "Department", options: departments },
        ]}
        values={filters} onChange={setFilters}
        actions={data && <span className="tabular text-[13px] text-faint">{rows.length} of {c.total ?? 0}</span>} />
      <DataTable rows={rows} rowKey={(p) => p.employee_id} columns={columns} loading={!data && !error}
        onRowClick={(p) => p.uuid && onOpen(p.uuid)} emptyIcon={Users}
        emptyTitle="Nobody here" emptyHint="Try another filter." />
    </div>
  );
}

function MonthGrid({ onOpen, onNoTeam }: { onOpen: (uuid: string) => void; onNoTeam: () => void }) {
  const departments = useDepartments();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [data, setData] = useState<Muster | null>(null);

  const load = useCallback(() => {
    const p = new URLSearchParams({ year: String(ym.y), month: String(ym.m) });
    if (q) p.set("q", q);
    if (filters.department?.[0]) p.set("department_id", filters.department[0]);
    api.get<Muster>(`/attendance/team/muster?${p}`).then(setData)
      .catch((e) => { if (/no team/i.test(errorText(e))) onNoTeam(); else setData({ year: ym.y, month: ym.m, rows: [] }); });
  }, [ym, q, filters, onNoTeam]);
  useEffect(() => { load(); }, [load]);

  const shift = (n: number) => setYm(({ y, m }) => { const t = m + n; return { y: y + Math.floor((t - 1) / 12), m: ((t - 1 + 12) % 12) + 1 }; });
  const days = data?.rows[0] ? Object.keys(data.rows[0].cells).sort() : [];

  return (
    <div className="space-y-4">
      <FilterBar searchPlaceholder="Search by name or code" onSearchChange={setQ}
        filters={[{ key: "department", label: "Department", options: departments }]} values={filters} onChange={setFilters}
        actions={
          <div className="flex items-center gap-1">
            <IconButton icon={ChevronLeft} label="Previous month" onClick={() => shift(-1)} />
            <span className="min-w-36 text-center text-[14px] text-ink">{formatMonth(`${ym.y}-${String(ym.m).padStart(2, "0")}-01`)}</span>
            <IconButton icon={ChevronRight} label="Next month" onClick={() => shift(1)} />
          </div>
        } />
      <div className="flex flex-wrap gap-3 text-[12.5px] text-muted">
        {["present", "half_day", "absent", "missing_punch", "on_leave", "wfh", "on_duty", "holiday", "weekly_off"].map((s) => (
          <span key={s} className="inline-flex items-center gap-1.5"><span className={`inline-flex h-4 min-w-6 items-center justify-center rounded px-1 text-[10px] ${STATUS[s].cell}`}>{STATUS[s].code}</span>{STATUS[s].label}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-rose-500" />Late</span>
      </div>
      <Paper className="overflow-hidden">
        {!data ? <Skeleton className="m-5 h-72" /> : !data || data.rows.length === 0 ? (
          <EmptyState icon={Users} title="Nobody to show" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="sticky left-0 z-10 min-w-48 bg-surface px-4 py-2 text-left font-normal text-muted">Employee</th>
                  {days.map((d) => (
                    <th key={d} className={`min-w-8 px-0.5 py-2 text-center font-normal ${weekdayIndex(d) >= 5 ? "text-faint" : "text-muted"}`}>
                      <div className="text-[10.5px]">{WEEKDAYS[weekdayIndex(d)].slice(0, 2)}</div><div className="tabular">{Number(d.slice(8))}</div>
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-normal text-muted">Payable</th>
                  <th className="px-3 py-2 text-right font-normal text-muted">LOP</th>
                  <th className="px-3 py-2 text-right font-normal text-muted">Late</th>
                  <th className="px-3 py-2 text-right font-normal text-muted">OT</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.employee_id} className="border-b border-line last:border-0">
                    <td className="sticky left-0 z-10 bg-surface px-4 py-1.5">
                      <p className="truncate text-[13.5px] text-ink">{r.name}</p>
                      {r.employee_code && <p className="text-[11.5px] text-faint">{r.employee_code}</p>}
                    </td>
                    {days.map((d) => {
                      const c = r.cells[d];
                      const s = statusInfo(c?.s);
                      const clickable = !!c?.uuid;
                      return (
                        <td key={d} className="px-0.5 py-1">
                          <button type="button" disabled={!clickable} onClick={() => c?.uuid && onOpen(c.uuid)}
                            title={`${s.label}${c?.w ? ` · ${hoursShort(c.w)} h` : ""}${c?.late ? " · late" : ""}${c?.ot ? ` · OT ${hoursShort(c.ot)}` : ""}`}
                            className={`relative flex h-7 w-full min-w-7 items-center justify-center rounded text-[10.5px] ${c?.future ? "text-faint" : s.cell} ${clickable ? "hover:ring-1 hover:ring-primary/40" : "cursor-default"}`}>
                            {c?.future && c.s === "upcoming" ? "" : s.code}
                            {c?.late && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-rose-500" />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="tabular px-3 text-right text-ink">{Number(r.summary.payable_days ?? 0)}</td>
                    <td className="tabular px-3 text-right text-muted">{Number(r.summary.lop_days ?? 0)}</td>
                    <td className="tabular px-3 text-right text-muted">{r.summary.late ?? 0}</td>
                    <td className="tabular px-3 text-right text-muted">{hoursShort(Number(r.summary.overtime_minutes ?? 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Paper>
      <div className="flex justify-end"><Button variant="ghost" onClick={load}>Refresh</Button></div>
    </div>
  );
}
