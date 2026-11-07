"use client";

/*
 * Attendance reports: muster roll (register style), late and early, overtime against the
 * quarterly limit, the monthly summary for payroll, the loss-of-pay review before payroll,
 * statutory registers (state formats, PDF/Excel) and what attendance did to leave.
 */
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileClock } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatMonth, todayISO } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateRangeInput, IconButton, Skeleton, Tabs, type Column, type DateRange,
} from "@/components/ui-kit";
import { LeaveLinksReport, LopReview, RegistersReport } from "@/components/attendance/reports-extra";
import { useUrlTab } from "@/lib/use-url-tab";
import { STATUS, WEEKDAYS, downloadFile, errorText, hoursShort, statusInfo, weekdayIndex } from "@/components/attendance/shared";

const TABS = [
  { value: "muster", label: "Muster roll" }, { value: "late", label: "Late & early" },
  { value: "overtime", label: "Overtime" }, { value: "payroll", label: "Payroll summary" },
  { value: "lop", label: "Loss of pay" }, { value: "registers", label: "Statutory registers" },
  { value: "links", label: "Leave from attendance" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export default function AttendanceReportsPage() {
  const [tab, setTab] = useState<Tab>("muster");
  useUrlTab(TABS.map((t) => t.value), setTab);
  return (
    <div>
      <PageHeader title="Attendance reports" eyebrow="Time" description="Registers and summaries for the month, ready to download." />
      <Tabs value={tab} onChange={setTab} items={[...TABS]} className="mb-5" />
      {tab === "muster" && <MusterRoll />}
      {tab === "late" && <LateEarly />}
      {tab === "overtime" && <Overtime />}
      {tab === "payroll" && <Payroll />}
      {tab === "lop" && <LopReview />}
      {tab === "registers" && <RegistersReport />}
      {tab === "links" && <LeaveLinksReport />}
    </div>
  );
}

function useDownload() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (path: string, name: string) => {
      setBusy(true);
      try { await downloadFile(path, name); } catch (e) { toast.error(errorText(e, "Download failed")); } finally { setBusy(false); }
    },
  };
}

function monthRange(): DateRange {
  const t = todayISO();
  return { from: `${t.slice(0, 8)}01`, to: t };
}

function RangeBar({ range, onChange, onDownload, busy }: { range: DateRange; onChange: (r: DateRange) => void; onDownload: () => void; busy: boolean }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="w-72"><DateRangeInput value={range} onChange={onChange} clearable={false} /></div>
      <Button icon={Download} loading={busy} disabled={!range.from || !range.to} onClick={onDownload}>Download CSV</Button>
    </div>
  );
}

// ── Muster roll ─────────────────────────────────────────────────────

type MusterRow = { employee_id: number; name: string; employee_code: string | null; cells: Record<string, { s: string; late?: boolean; ot?: number; future?: boolean }>; summary: Record<string, number | string> };

function MusterRoll() {
  const toast = useToast();
  const dl = useDownload();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const [rows, setRows] = useState<MusterRow[] | null>(null);
  useEffect(() => {
    let live = true;
    api.get<{ rows: MusterRow[] }>(`/attendance/reports/muster?year=${ym.y}&month=${ym.m}`)
      .then((r) => { if (live) setRows(r.rows); }).catch((e) => { if (live) { setRows([]); toast.error(errorText(e)); } });
    return () => { live = false; };
  }, [ym, toast]);
  const shift = (n: number) => setYm(({ y, m }) => { const t = m + n; return { y: y + Math.floor((t - 1) / 12), m: ((t - 1 + 12) % 12) + 1 }; });
  const days = rows?.[0] ? Object.keys(rows[0].cells).sort() : [];
  const s = (r: MusterRow, k: string) => Number(r.summary[k] ?? 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <IconButton icon={ChevronLeft} label="Previous month" onClick={() => shift(-1)} />
          <span className="min-w-36 text-center text-[14px] text-ink">{formatMonth(`${ym.y}-${String(ym.m).padStart(2, "0")}-01`)}</span>
          <IconButton icon={ChevronRight} label="Next month" onClick={() => shift(1)} />
        </div>
        <Button icon={Download} loading={dl.busy} onClick={() => dl.run(`/attendance/reports/muster?year=${ym.y}&month=${ym.m}&format=csv`, `muster-roll-${ym.y}-${String(ym.m).padStart(2, "0")}.csv`)}>Download CSV</Button>
      </div>
      <p className="mb-3 text-[12.5px] text-muted">
        Register of attendance in the form kept under the OSH Code and state shop rules. {Object.entries(STATUS).filter(([, v]) => v.code).map(([, v]) => `${v.code} ${v.label}`).join(" · ")}
      </p>
      <Paper className="overflow-hidden">
        {!rows ? <Skeleton className="m-5 h-72" /> : rows.length === 0 ? <EmptyState icon={FileClock} title="Nothing for this month" /> : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="sticky left-0 z-10 min-w-44 bg-surface px-3 py-2 text-left font-normal">Employee</th>
                  {days.map((d) => <th key={d} className={`min-w-7 px-0.5 py-2 text-center font-normal ${weekdayIndex(d) >= 5 ? "text-faint" : ""}`}><div className="text-[10px]">{WEEKDAYS[weekdayIndex(d)].slice(0, 2)}</div>{Number(d.slice(8))}</th>)}
                  {["P", "HD", "A", "L", "H", "WO", "Payable", "LOP", "OT h"].map((h) => <th key={h} className="px-2 py-2 text-right font-normal">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employee_id} className="border-b border-line last:border-0">
                    <td className="sticky left-0 z-10 bg-surface px-3 py-1.5"><p className="truncate text-[13px] text-ink">{r.name}</p>{r.employee_code && <p className="text-[11px] text-faint">{r.employee_code}</p>}</td>
                    {days.map((d) => {
                      const c = r.cells[d];
                      const info = statusInfo(c?.s);
                      return <td key={d} className={`border-l border-line/60 px-0.5 text-center ${c?.late ? "text-rose-700" : c?.future ? "text-faint" : "text-ink/80"}`}>{c?.future && c.s === "upcoming" ? "" : info.code}</td>;
                    })}
                    <td className="tabular px-2 text-right">{s(r, "present") + s(r, "wfh") + s(r, "on_duty")}</td>
                    <td className="tabular px-2 text-right">{s(r, "half_day")}</td>
                    <td className="tabular px-2 text-right">{s(r, "absent") + s(r, "missing_punch")}</td>
                    <td className="tabular px-2 text-right">{s(r, "on_leave")}</td>
                    <td className="tabular px-2 text-right">{s(r, "holiday")}</td>
                    <td className="tabular px-2 text-right">{s(r, "weekly_off")}</td>
                    <td className="tabular px-2 text-right text-ink">{Number(r.summary.payable_days ?? 0)}</td>
                    <td className="tabular px-2 text-right">{Number(r.summary.lop_days ?? 0)}</td>
                    <td className="tabular px-2 text-right">{hoursShort(s(r, "overtime_minutes"))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Paper>
    </div>
  );
}

// ── Late and early ──────────────────────────────────────────────────

type LateRow = { employee_id: number; name: string; employee_code: string | null; late: number; late_minutes: number; early: number; early_minutes: number; penalty: string; dates: { date: string; late_minutes: number; early_minutes: number }[] };

function LateEarly() {
  const toast = useToast();
  const dl = useDownload();
  const [range, setRange] = useState<DateRange>(monthRange);
  const [rows, setRows] = useState<LateRow[] | null>(null);
  useEffect(() => {
    if (!range.from || !range.to) return;
    let live = true;
    api.get<{ rows: LateRow[] }>(`/attendance/reports/late-early?start=${range.from}&end=${range.to}`)
      .then((r) => { if (live) setRows(r.rows); }).catch((e) => { if (live) { setRows([]); toast.error(errorText(e)); } });
    return () => { live = false; };
  }, [range, toast]);
  const columns: Column<LateRow>[] = [
    { key: "name", header: "Employee", sortable: true, sortValue: (r) => r.name, cell: (r) => <div><p className="text-ink">{r.name}</p>{r.employee_code && <p className="text-[12px] text-faint">{r.employee_code}</p>}</div> },
    { key: "late", header: "Late days", align: "right", sortable: true, sortValue: (r) => r.late, cell: (r) => <span className="tabular">{r.late}</span> },
    { key: "lm", header: "Late by (total)", align: "right", hideBelow: "sm", cell: (r) => <span className="tabular text-muted">{hoursShort(r.late_minutes)} h</span> },
    { key: "early", header: "Early exits", align: "right", sortable: true, sortValue: (r) => r.early, cell: (r) => <span className="tabular">{r.early}</span> },
    { key: "em", header: "Early by (total)", align: "right", hideBelow: "sm", cell: (r) => <span className="tabular text-muted">{hoursShort(r.early_minutes)} h</span> },
    { key: "pen", header: "Penalty (LOP days)", align: "right", cell: (r) => Number(r.penalty) ? <Badge tone="bad">{Number(r.penalty)}</Badge> : <span className="text-faint">—</span> },
    { key: "dates", header: "Days", hideBelow: "lg", cell: (r) => <span className="text-[12.5px] text-muted">{r.dates.slice(0, 6).map((d) => formatDate(d.date, { year: undefined })).join(", ")}{r.dates.length > 6 ? "…" : ""}</span> },
  ];
  return (
    <>
      <RangeBar range={range} onChange={setRange} busy={dl.busy} onDownload={() => dl.run(`/attendance/reports/late-early?start=${range.from}&end=${range.to}&format=csv`, `late-early-${range.from}-${range.to}.csv`)} />
      <DataTable rows={rows ?? []} rowKey={(r) => r.employee_id} columns={columns} loading={!rows} emptyTitle="No late arrivals or early exits" />
    </>
  );
}

// ── Overtime ────────────────────────────────────────────────────────

type OtRow = { employee_id: number; name: string; employee_code: string | null; overtime_hours: number; overtime_days: number; unapproved_hours: number; quarter_hours: number; quarter_cap_hours: number; alert: "ok" | "near" | "over"; rate_multiplier: number };

function Overtime() {
  const toast = useToast();
  const dl = useDownload();
  const [range, setRange] = useState<DateRange>(monthRange);
  const [data, setData] = useState<{ quarter_start: string; rows: OtRow[] } | null>(null);
  useEffect(() => {
    if (!range.from || !range.to) return;
    let live = true;
    api.get<{ quarter_start: string; rows: OtRow[] }>(`/attendance/reports/overtime?start=${range.from}&end=${range.to}`)
      .then((r) => { if (live) setData(r); }).catch((e) => { if (live) { setData({ quarter_start: "", rows: [] }); toast.error(errorText(e)); } });
    return () => { live = false; };
  }, [range, toast]);
  const columns: Column<OtRow>[] = [
    { key: "name", header: "Employee", sortable: true, sortValue: (r) => r.name, cell: (r) => <div><p className="text-ink">{r.name}</p>{r.employee_code && <p className="text-[12px] text-faint">{r.employee_code}</p>}</div> },
    { key: "h", header: "Overtime hours", align: "right", sortable: true, sortValue: (r) => r.overtime_hours, cell: (r) => <span className="tabular">{r.overtime_hours.toFixed(2)}</span> },
    { key: "d", header: "Days", align: "right", hideBelow: "sm", cell: (r) => <span className="tabular text-muted">{r.overtime_days}</span> },
    { key: "u", header: "Not pre-approved", align: "right", hideBelow: "md", cell: (r) => r.unapproved_hours ? <span className="tabular text-amber-700">{r.unapproved_hours.toFixed(2)}</span> : <span className="text-faint">—</span> },
    { key: "rate", header: "Rate", hideBelow: "md", cell: (r) => <span className="text-muted">{r.rate_multiplier}× ordinary rate</span> },
    {
      key: "q", header: "This quarter", sortable: true, sortValue: (r) => r.quarter_hours, cell: (r) => {
        const pct = r.quarter_cap_hours ? Math.min(100, (r.quarter_hours / r.quarter_cap_hours) * 100) : 0;
        return (
          <div className="flex min-w-48 items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-sunken"><div className={`h-1.5 rounded-full ${r.alert === "over" ? "bg-rose-500" : r.alert === "near" ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} /></div>
            <span className="tabular text-[12.5px] text-muted">{r.quarter_hours.toFixed(1)} / {r.quarter_cap_hours} h</span>
            {r.alert !== "ok" && <Badge tone={r.alert === "over" ? "bad" : "warn"}>{r.alert === "over" ? "Over limit" : "Near limit"}</Badge>}
          </div>
        );
      },
    },
  ];
  return (
    <>
      <RangeBar range={range} onChange={setRange} busy={dl.busy} onDownload={() => dl.run(`/attendance/reports/overtime?start=${range.from}&end=${range.to}&format=csv`, `overtime-${range.from}-${range.to}.csv`)} />
      {data?.quarter_start && <p className="mb-3 text-[12.5px] text-muted">Quarter from {formatDate(data.quarter_start)}. The OSH Code caps overtime per quarter; overtime is paid at twice the ordinary rate of wages.</p>}
      <DataTable rows={data?.rows ?? []} rowKey={(r) => r.employee_id} columns={columns} loading={!data} emptyTitle="No overtime in these dates" />
    </>
  );
}

// ── Payroll summary ─────────────────────────────────────────────────

type PayRow = {
  employee_id: number; name: string; employee_code: string | null; days_in_period: number; present_days: number; half_days: number;
  absent_days: number; leave_days: number; holidays: number; weekly_offs: number; late_marks: number; payable_days: string;
  lop_days: string; penalty_lop_days: string; overtime_hours: string; night_shifts: number; shift_allowance_days: number;
  shift_allowance_amount: string; adjustment_payable_days: string; adjustment_lop_days: string; adjustment_overtime_hours: string; locked: boolean;
};

function Payroll() {
  const toast = useToast();
  const dl = useDownload();
  const [range, setRange] = useState<DateRange>(monthRange);
  const [rows, setRows] = useState<PayRow[] | null>(null);
  useEffect(() => {
    if (!range.from || !range.to) return;
    let live = true;
    api.get<{ rows: PayRow[] }>(`/attendance/reports/payroll?start=${range.from}&end=${range.to}`)
      .then((r) => { if (live) setRows(r.rows); }).catch((e) => { if (live) { setRows([]); toast.error(errorText(e)); } });
    return () => { live = false; };
  }, [range, toast]);
  const n = (v: string | number) => Number(v);
  const adj = (r: PayRow) => [n(r.adjustment_payable_days) && `payable ${n(r.adjustment_payable_days) > 0 ? "+" : ""}${n(r.adjustment_payable_days)}`,
    n(r.adjustment_lop_days) && `LOP ${n(r.adjustment_lop_days) > 0 ? "+" : ""}${n(r.adjustment_lop_days)}`,
    n(r.adjustment_overtime_hours) && `OT ${n(r.adjustment_overtime_hours)} h`].filter(Boolean).join(", ");
  const columns: Column<PayRow>[] = [
    { key: "name", header: "Employee", sortable: true, sortValue: (r) => r.name, cell: (r) => <div><p className="text-ink">{r.name}</p>{r.employee_code && <p className="text-[12px] text-faint">{r.employee_code}</p>}</div> },
    { key: "pay", header: "Payable days", align: "right", sortable: true, sortValue: (r) => n(r.payable_days), cell: (r) => <span className="tabular text-ink">{n(r.payable_days)}</span> },
    { key: "lop", header: "LOP days", align: "right", sortable: true, sortValue: (r) => n(r.lop_days), cell: (r) => <span className={`tabular ${n(r.lop_days) ? "text-rose-700" : "text-muted"}`}>{n(r.lop_days)}{n(r.penalty_lop_days) ? <span className="text-faint"> ({n(r.penalty_lop_days)} penalty)</span> : null}</span> },
    { key: "p", header: "Present · half · absent · leave", hideBelow: "lg", cell: (r) => <span className="tabular text-muted">{r.present_days} · {r.half_days} · {r.absent_days} · {r.leave_days}</span> },
    { key: "ot", header: "OT hours", align: "right", cell: (r) => <span className="tabular">{n(r.overtime_hours) || "—"}</span> },
    { key: "night", header: "Night shifts", align: "right", hideBelow: "md", cell: (r) => <span className="tabular text-muted">{r.night_shifts || "—"}</span> },
    { key: "allow", header: "Shift allowance", align: "right", hideBelow: "md", cell: (r) => r.shift_allowance_days ? <span className="tabular">{r.shift_allowance_days} d · ₹{n(r.shift_allowance_amount).toLocaleString("en-IN")}</span> : <span className="text-faint">—</span> },
    { key: "adj", header: "From earlier periods", hideBelow: "lg", cell: (r) => adj(r) ? <Badge tone="accent">{adj(r)}</Badge> : <span className="text-faint">—</span> },
    { key: "lock", header: "", cell: (r) => r.locked ? <Badge tone="good">Locked</Badge> : <Badge tone="warn">Open</Badge> },
  ];
  return (
    <>
      <RangeBar range={range} onChange={setRange} busy={dl.busy} onDownload={() => dl.run(`/attendance/reports/payroll?start=${range.from}&end=${range.to}&format=csv`, `attendance-payroll-${range.from}-${range.to}.csv`)} />
      <p className="mb-3 text-[12.5px] text-muted">What payroll uses for the period. Lock the period in Attendance admin before running payroll.</p>
      <DataTable rows={rows ?? []} rowKey={(r) => r.employee_id} columns={columns} loading={!rows} emptyTitle="No attendance in these dates" />
    </>
  );
}
