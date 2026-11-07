"use client";

/*
 * Attendance report tabs added in the second pass:
 *   LopReview        loss of pay for a pay period before payroll: cap, carry-over, manual changes
 *   RegistersReport  statutory registers of attendance and overtime (state formats) as PDF/Excel
 *   LeaveLinksReport what attendance did to leave (absences, penalties, comp off), with undo
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, Lock, Plus, RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime, formatMonth, todayISO } from "@/lib/datetime";
import { EmptyState, Paper } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, IconButton, KeyValue, Modal, ModalCancel, NumberInput, Select, Skeleton,
  StatCard, StatGrid, Textarea, useConfirm, type Column, type FilterValues,
} from "@/components/ui-kit";
import { downloadFile, errorText } from "./shared";

const n = (v: string | number | null | undefined) => Number(v ?? 0);
const days = (v: string | number) => {
  const x = n(v);
  return x === 0 ? "0" : String(Number(x.toFixed(2)));
};

function lastDay(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function MonthPicker({ ym, onChange }: { ym: { y: number; m: number }; onChange: (v: { y: number; m: number }) => void }) {
  const shift = (d: number) => { const t = ym.m + d; onChange({ y: ym.y + Math.floor((t - 1) / 12), m: ((t - 1 + 12) % 12) + 1 }); };
  return (
    <div className="flex items-center gap-1">
      <IconButton icon={ChevronLeft} label="Previous month" onClick={() => shift(-1)} />
      <span className="min-w-36 text-center text-[14px] text-ink">{formatMonth(`${ym.y}-${String(ym.m).padStart(2, "0")}-01`)}</span>
      <IconButton icon={ChevronRight} label="Next month" onClick={() => shift(1)} />
    </div>
  );
}

function previousMonth() {
  const t = todayISO();
  const y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7));
  return m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
}

// ── Loss of pay ─────────────────────────────────────────────────────

type ManualEntry = { uuid: string; days: string; note: string | null; by: string | null; at: string | null };
type LopRow = {
  employee_id: number; employee_uuid: string; employee_code: string | null; name: string; attendance_lop: string;
  attendance_adjustment: string; carried_in: string; manual: string; total: string; payable: string; carried_out: string;
  waived: string; reduced_pay_days: string; payroll_lop: string; locked: boolean; manual_entries: ManualEntry[];
};
type LopData = { start: string; end: string; locked: boolean; cap_days: number | null; carry_excess: boolean; rows: LopRow[]; totals: Record<string, string> };

export function LopReview() {
  const toast = useToast();
  const confirm = useConfirm();
  const [ym, setYm] = useState(previousMonth);
  const [data, setData] = useState<LopData | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<LopRow | null>(null);
  const [adjusting, setAdjusting] = useState<LopRow | null>(null);
  const [busy, setBusy] = useState(false);
  const range = useMemo(() => {
    const mm = String(ym.m).padStart(2, "0");
    return { start: `${ym.y}-${mm}-01`, end: `${ym.y}-${mm}-${lastDay(ym.y, ym.m)}` };
  }, [ym]);
  const load = () => {
    setData(null);
    api.get<LopData>(`/attendance/lop?start=${range.start}&end=${range.end}`)
      .then((r) => { setData(r); setOpen((o) => (o ? r.rows.find((x) => x.employee_id === o.employee_id) ?? null : null)); })
      .catch((e) => { setData({ start: range.start, end: range.end, locked: false, cap_days: null, carry_excess: true, rows: [], totals: {} }); toast.error(errorText(e)); });
  };
  useEffect(load, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  async function remove(e: ManualEntry) {
    if (!(await confirm({ title: "Remove this change?", message: `${days(e.days)} day(s): ${e.note ?? ""}`, confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.delete(`/attendance/lop/adjustments/${e.uuid}`); toast.success("Removed"); load(); } catch (x) { toast.error(errorText(x)); }
  }

  const rows = (data?.rows ?? []).filter((r) => !q || `${r.name} ${r.employee_code ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  const columns: Column<LopRow>[] = [
    { key: "name", header: "Employee", sortable: true, sortValue: (r) => r.name, cell: (r) => <div><p className="text-ink">{r.name}</p>{r.employee_code && <p className="text-[12px] text-faint">{r.employee_code}</p>}</div> },
    { key: "att", header: "From attendance", align: "right", hideBelow: "md", cell: (r) => <span className="tabular text-muted">{days(r.attendance_lop)}</span> },
    { key: "in", header: "Carried in", align: "right", hideBelow: "lg", cell: (r) => n(r.carried_in) ? <span className="tabular">{days(r.carried_in)}</span> : <span className="text-faint">—</span> },
    { key: "man", header: "Manual", align: "right", hideBelow: "lg", cell: (r) => n(r.manual) ? <span className="tabular">{n(r.manual) > 0 ? "+" : ""}{days(r.manual)}</span> : <span className="text-faint">—</span> },
    { key: "pay", header: "LOP this period", align: "right", sortable: true, sortValue: (r) => n(r.payable), cell: (r) => <span className={`tabular ${n(r.payable) ? "text-rose-700" : "text-muted"}`}>{days(r.payable)}</span> },
    { key: "out", header: "To next period", align: "right", hideBelow: "sm", cell: (r) => n(r.carried_out) ? <Badge tone="warn">{days(r.carried_out)}</Badge> : <span className="text-faint">—</span> },
    { key: "cut", header: "Reduced pay", align: "right", hideBelow: "md", cell: (r) => n(r.reduced_pay_days) ? <span className="tabular">{days(r.reduced_pay_days)}</span> : <span className="text-faint">—</span> },
    { key: "payroll", header: "Sent to payroll", align: "right", sortable: true, sortValue: (r) => n(r.payroll_lop), cell: (r) => <span className="tabular text-ink">{days(r.payroll_lop)}</span> },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <MonthPicker ym={ym} onChange={setYm} />
        <div className="flex items-center gap-2">
          {data?.locked && <Badge tone="good"><Lock size={12} strokeWidth={1.4} /> Period locked</Badge>}
          <Button icon={Download} loading={busy} onClick={async () => {
            setBusy(true);
            try { await downloadFile(`/attendance/lop?start=${range.start}&end=${range.end}&format=csv`, `lop-${range.start}.csv`); }
            catch (e) { toast.error(errorText(e, "Download failed")); } finally { setBusy(false); }
          }}>Download CSV</Button>
        </div>
      </div>
      <p className="mb-4 max-w-3xl text-[12.5px] text-muted">
        Check loss of pay before running payroll. {data?.cap_days != null ? <>At most {data.cap_days} LOP days a period; the rest {data.carry_excess ? "moves to the next period" : "is waived"}.</> : "No cap on LOP days is set (Settings › Shifts & attendance › Attendance and leave)."}
        {" "}Reduced pay is the pay not kept on part-paid leave such as half-pay sick leave; it is added to what payroll gets.
      </p>
      {data && (
        <StatGrid className="mb-5">
          <StatCard label="LOP from attendance" value={days(data.totals.attendance_lop ?? 0)} />
          <StatCard label="LOP this period" value={days(data.totals.payable ?? 0)} />
          <StatCard label="Moved to next period" value={days(data.totals.carried_out ?? 0)} />
          <StatCard label="Sent to payroll" value={days(data.totals.payroll_lop ?? 0)} hint={n(data.totals.reduced_pay_days) ? `${days(data.totals.reduced_pay_days)} reduced pay` : undefined} />
        </StatGrid>
      )}
      <FilterBar searchPlaceholder="Search by name or employee ID" onSearchChange={setQ} className="mb-3" />
      <DataTable rows={rows} rowKey={(r) => r.employee_id} columns={columns} loading={!data} onRowClick={setOpen}
        rowActions={(r) => [{ label: "Change LOP", icon: Plus, disabled: !!data?.locked, onSelect: () => setAdjusting(r) }]}
        emptyTitle="No loss of pay in this period" />

      <Modal open={!!open} onClose={() => setOpen(null)} size="md" title={open?.name} description={data ? `${formatDate(data.start)} – ${formatDate(data.end)}` : undefined}
        footer={<><Button onClick={() => setOpen(null)}>Close</Button>
          <Button variant="primary" icon={Plus} disabled={!!data?.locked} onClick={() => { setAdjusting(open); }}>Change LOP</Button></>}>
        {open && (
          <div className="space-y-5">
            {data?.locked && <p className="rounded-lg bg-sunken px-3 py-2 text-[13px] text-muted">This pay period is locked. Unlock it in Attendance admin to change loss of pay.</p>}
            <KeyValue columns={2} items={[
              { label: "From attendance", value: days(open.attendance_lop) },
              { label: "Carried in", value: days(open.carried_in) },
              { label: "Manual changes", value: days(open.manual) },
              { label: "Total", value: days(open.total) },
              { label: "LOP this period", value: days(open.payable) },
              { label: "To next period", value: days(open.carried_out) },
              { label: "Waived", value: days(open.waived) },
              { label: "Reduced pay", value: days(open.reduced_pay_days) },
              { label: "Sent to payroll", value: <span className="text-ink">{days(open.payroll_lop)}</span> },
            ]} />
            <div>
              <p className="mb-2 text-[13px] text-muted">Manual changes</p>
              {open.manual_entries.length === 0 ? <p className="text-[13px] text-faint">None</p> : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {open.manual_entries.map((e) => (
                    <li key={e.uuid} className="flex items-start gap-3 px-3 py-2">
                      <span className="tabular w-12 text-ink">{n(e.days) > 0 ? "+" : ""}{days(e.days)}</span>
                      <div className="min-w-0 flex-1"><p className="text-[13.5px] text-ink">{e.note}</p><p className="text-[12px] text-faint">{e.by || "HR"}{e.at ? `, ${formatDateTime(e.at)}` : ""}</p></div>
                      {!data?.locked && <IconButton icon={Trash2} label="Remove" size="sm" onClick={() => remove(e)} />}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
      {adjusting && data && <AdjustModal row={adjusting} start={data.start} end={data.end} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); load(); }} />}
    </div>
  );
}

function AdjustModal({ row, start, end, onClose, onSaved }: { row: LopRow; start: string; end: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api.post("/attendance/lop/adjustments", { employee_uuid: row.employee_uuid, start, end, days: d, note });
      toast.success("Loss of pay changed");
      onSaved();
    } catch (e) { toast.error(errorText(e, "Couldn't save")); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="sm" busy={saving} title={`Change LOP · ${row.name}`} dirty={d !== null || !!note}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!d || note.trim().length < 3} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Days" hint="Plus adds loss of pay, minus takes it away" required>
          <NumberInput value={d} onChange={setD} min={-31} max={31} step={0.5} suffix="days" />
        </Field>
        <Field label="Why" required><Textarea value={note} onValueChange={setNote} rows={2} placeholder="For example: approved leave entered late" /></Field>
      </div>
    </Modal>
  );
}

// ── Statutory registers ─────────────────────────────────────────────

type Format = { key: string; label: string; act: string };
type RegisterData = { title: string; act: string; form: string; columns: string[]; rows: (string | number)[][]; start: string; end: string };

export function RegistersReport() {
  const toast = useToast();
  const [formats, setFormats] = useState<Format[]>([]);
  const [fmt, setFmt] = useState<string>("generic");
  const [kind, setKind] = useState<"attendance" | "overtime">("attendance");
  const [ym, setYm] = useState(previousMonth);
  const [data, setData] = useState<RegisterData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { api.get<{ items: Format[] }>("/attendance/registers/formats").then((r) => setFormats(r.items)).catch(() => {}); }, []);
  const qs = `format=${fmt}&kind=${kind}&year=${ym.y}&month=${ym.m}`;
  useEffect(() => {
    let live = true;
    setData(null);
    api.get<RegisterData>(`/attendance/registers?${qs}&type=json`).then((r) => { if (live) setData(r); })
      .catch((e) => { if (live) { setData({ title: "", act: "", form: "", columns: [], rows: [], start: "", end: "" }); toast.error(errorText(e)); } });
    return () => { live = false; };
  }, [qs, toast]);
  async function dl(type: "pdf" | "xlsx") {
    setBusy(type);
    try { await downloadFile(`/attendance/registers?${qs}&type=${type}`, `${kind}-register-${fmt.toLowerCase()}-${ym.y}-${String(ym.m).padStart(2, "0")}.${type}`); }
    catch (e) { toast.error(errorText(e, "Download failed")); } finally { setBusy(null); }
  }
  const current = formats.find((f) => f.key === fmt);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Format" className="w-56"><Select value={fmt} onChange={(v) => setFmt(v ?? "generic")} options={formats.map((f) => ({ value: f.key, label: f.label }))} /></Field>
          <Field label="Register" className="w-48"><Select value={kind} onChange={(v) => setKind((v ?? "attendance") as "attendance" | "overtime")}
            options={[{ value: "attendance", label: "Attendance" }, { value: "overtime", label: "Overtime" }]} /></Field>
          <MonthPicker ym={ym} onChange={setYm} />
        </div>
        <div className="flex gap-2">
          <Button icon={FileText} loading={busy === "pdf"} onClick={() => dl("pdf")}>Download PDF</Button>
          <Button icon={FileSpreadsheet} loading={busy === "xlsx"} onClick={() => dl("xlsx")}>Download Excel</Button>
        </div>
      </div>
      {current && <p className="mb-3 max-w-3xl text-[12.5px] text-muted">{current.act}. Establishment details and form names come from Settings › Shifts & attendance › Statutory registers. Check the layout against your state&apos;s latest notification.</p>}
      <Paper className="overflow-hidden">
        {!data ? <Skeleton className="m-5 h-60" /> : (
          <>
            <div className="border-b border-line px-5 py-3"><p className="text-[15px] text-ink">{data.title}{data.form ? ` – ${data.form}` : ""}</p></div>
            {data.rows.length === 0 ? <EmptyState icon={FileText} title="Nothing for this month" /> : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[12px]">
                  <thead><tr className="border-b border-line text-muted">{data.columns.map((c, i) => <th key={i} className="whitespace-nowrap px-2 py-2 text-left font-normal">{c}</th>)}</tr></thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={i} className="border-b border-line last:border-0">
                        {r.map((v, j) => <td key={j} className={`whitespace-nowrap px-2 py-1.5 ${j === 2 ? "text-ink" : "text-ink/80"}`}>{String(v ?? "")}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Paper>
    </div>
  );
}

// ── Leave from attendance ───────────────────────────────────────────

type Link = { uuid: string; employee_id: number; employee_name: string | null; date: string; kind: "absence" | "late_penalty" | "comp_off"; status: string; days: string; unit: string; leave_type: string | null; note: string | null; reversed_at: string | null; reverse_reason: string | null; created_at: string | null };
const KIND: Record<string, string> = { absence: "Absence", late_penalty: "Late-mark penalty", comp_off: "Comp off" };
const STATUS: Record<string, { label: string; tone: "good" | "warn" | "bad" | "neutral" | "info" }> = {
  pending: { label: "Waiting for approval", tone: "warn" }, applied: { label: "Done", tone: "good" }, lop: { label: "Loss of pay", tone: "bad" },
  rejected: { label: "Not approved", tone: "neutral" }, reversed: { label: "Undone", tone: "neutral" },
};
const ACTIVE = ["pending", "applied", "lop"];

export function LeaveLinksReport() {
  const toast = useToast();
  const [range] = useState(() => { const t = todayISO(); const d = new Date(`${t}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 90); return { from: d.toISOString().slice(0, 10), to: t }; });
  const [rows, setRows] = useState<Link[] | null>(null);
  const [filters, setFilters] = useState<FilterValues>({});
  const [q, setQ] = useState("");
  const [undo, setUndo] = useState<Link | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const load = () => api.get<{ items: Link[] }>(`/attendance/leave-links?start=${range.from}&end=${range.to}`)
    .then((r) => setRows(r.items)).catch((e) => { setRows([]); toast.error(errorText(e)); });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function doUndo() {
    if (!undo) return;
    setSaving(true);
    try {
      await api.post(`/attendance/leave-links/${undo.uuid}/reverse`, { reason });
      toast.success("Undone");
      setUndo(null);
      load();
    } catch (e) { toast.error(errorText(e)); } finally { setSaving(false); }
  }

  const shown = (rows ?? []).filter((r) => (!filters.kind?.length || filters.kind.includes(r.kind))
    && (!filters.status?.length || filters.status.includes(r.status))
    && (!q || (r.employee_name ?? "").toLowerCase().includes(q.toLowerCase())));
  const columns: Column<Link>[] = [
    { key: "date", header: "Date", sortable: true, sortValue: (r) => r.date, cell: (r) => <span className="tabular">{formatDate(r.date)}</span> },
    { key: "emp", header: "Employee", sortable: true, sortValue: (r) => r.employee_name ?? "", cell: (r) => <span className="text-ink">{r.employee_name}</span> },
    { key: "kind", header: "What", cell: (r) => <span>{KIND[r.kind] ?? r.kind}</span> },
    { key: "days", header: "Days", align: "right", cell: (r) => <span className="tabular">{days(r.days)}</span> },
    { key: "result", header: "Result", hideBelow: "md", cell: (r) => <span className="text-muted">{r.status === "reversed" ? (r.reverse_reason ?? "Undone") : (r.note ?? r.leave_type ?? "")}</span> },
    { key: "status", header: "Status", cell: (r) => { const s = STATUS[r.status] ?? { label: r.status, tone: "neutral" as const }; return <Badge tone={s.tone} dot>{s.label}</Badge>; } },
  ];
  return (
    <div>
      <p className="mb-3 max-w-3xl text-[12.5px] text-muted">
        Absent days turned into leave, late-mark penalties taken from leave and comp off earned on days off, in the last 90 days.
        Each is undone on its own when the attendance is corrected; undo one here when it shouldn&apos;t have happened.
      </p>
      <FilterBar searchPlaceholder="Search by name" onSearchChange={setQ} values={filters} onChange={setFilters} className="mb-3"
        filters={[
          { key: "kind", label: "What", multiple: true, options: Object.entries(KIND).map(([value, label]) => ({ value, label })) },
          { key: "status", label: "Status", multiple: true, options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })) },
        ]} />
      <DataTable rows={shown} rowKey={(r) => r.uuid} columns={columns} loading={!rows}
        rowActions={(r) => ACTIVE.includes(r.status) ? [{ label: "Undo", icon: RotateCcw, danger: true, onSelect: () => { setReason(""); setUndo(r); } }] : []}
        emptyTitle="Nothing yet" emptyHint="Turn these on in Settings › Shifts & attendance › Attendance and leave." />
      <Modal open={!!undo} onClose={() => setUndo(null)} size="sm" busy={saving} title="Undo this?"
        description={undo ? `${KIND[undo.kind]} of ${undo.employee_name} on ${formatDate(undo.date)}. The leave goes back to the balance.` : undefined}
        footer={<><ModalCancel /><Button variant="danger" loading={saving} disabled={reason.trim().length < 3} onClick={doUndo}>Undo</Button></>}>
        <Field label="Why" required><Textarea value={reason} onValueChange={setReason} rows={2} autoFocus /></Field>
      </Modal>
    </div>
  );
}
