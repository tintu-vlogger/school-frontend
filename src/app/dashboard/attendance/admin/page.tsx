"use client";

/*
 * Attendance admin (HR): every daily record with filters, the day's details with hand
 * corrections, recompute a range, lock a pay period, and see later adjustments.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Lock, LockOpen, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime, formatTime, todayISO } from "@/lib/datetime";
import { PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateRangeInput, Field, FilterBar, Modal, ModalCancel, Tabs, Textarea, useConfirm,
  type Column, type DateRange, type FilterValues,
} from "@/components/ui-kit";
import { DayDetailModal } from "@/components/attendance/admin-day-modal";
import { STATUS, StatusBadge, addDays, errorText, minutesText, useAttendanceAccess } from "@/components/attendance/shared";

type Row = {
  uuid: string; employee_id: number; employee_name: string; employee_code: string | null; date: string; status: string;
  shift_name: string | null; first_in: string | null; last_out: string | null; worked_minutes: number; late_minutes: number;
  is_late: boolean; is_early_exit: boolean; early_minutes: number; overtime_minutes: number; payable_days: string;
  lop_days: string; penalty_lop_days: string; override_status: string | null; locked: boolean;
};
type Lock = { uuid: string; period_start: string; period_end: string; status: string; locked_at: string | null; locked_by_name: string | null; unlocked_at: string | null; unlocked_by_name: string | null; note: string | null };
type Adjustment = { uuid: string; employee_name: string; date: string; apply_from: string; payable_days_delta: string; lop_days_delta: string; overtime_minutes_delta: number; old_status: string | null; new_status: string | null; reason: string | null };

const TABS = [{ value: "records", label: "Daily records" }, { value: "locks", label: "Locked periods" }, { value: "adjustments", label: "Adjustments" }] as const;
type Tab = (typeof TABS)[number]["value"];

const signed = (v: string | number) => { const n = Number(v); return n > 0 ? `+${n}` : String(n); };

export default function AttendanceAdminPage() {
  const access = useAttendanceAccess();
  const [tab, setTab] = useState<Tab>("records");
  const [recompute, setRecompute] = useState(false);
  const [locking, setLocking] = useState(false);
  const [nonce, setNonce] = useState(0);
  const refresh = () => setNonce((n) => n + 1);

  return (
    <div>
      <PageHeader title="Attendance admin" eyebrow="Time"
        description="Check every day's record, correct it, and lock the pay period before payroll."
        actions={access?.can_manage && <>
          <Button icon={RefreshCw} onClick={() => setRecompute(true)}>Recompute</Button>
          <Button variant="primary" icon={Lock} onClick={() => setLocking(true)}>Lock period</Button>
        </>} />
      <Tabs value={tab} onChange={setTab} items={[...TABS]} className="mb-5" />
      {tab === "records" && <Records key={nonce} canManage={!!access?.can_manage} />}
      {tab === "locks" && <Locks key={nonce} onChanged={refresh} />}
      {tab === "adjustments" && <Adjustments key={nonce} />}
      {recompute && <RecomputeModal onClose={() => setRecompute(false)} onDone={() => { setRecompute(false); refresh(); }} />}
      {locking && <LockModal onClose={() => setLocking(false)} onDone={() => { setLocking(false); refresh(); setTab("locks"); }} />}
    </div>
  );
}

function Records({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const today = todayISO();
  const [range, setRange] = useState<DateRange>({ from: addDays(today, -6), to: today });
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [departments, setDepartments] = useState<{ value: string; label: string }[]>([]);
  const [data, setData] = useState<{ key: string; items: Row[]; total: number } | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    api.getCached<{ id: number; department_name: string }[]>("/departments/", 120)
      .then((r) => setDepartments((Array.isArray(r) ? r : []).map((d) => ({ value: String(d.id), label: d.department_name })))).catch(() => {});
  }, []);

  const key = JSON.stringify({ range, q, filters, page, size, nonce });
  useEffect(() => {
    if (!range.from || !range.to) return;
    const p = new URLSearchParams({ start: range.from, end: range.to, page: String(page), size: String(size) });
    if (q) p.set("q", q);
    if (filters.status?.length) p.set("status", filters.status.join(","));
    if (filters.flags?.length) p.set("flags", filters.flags.join(","));
    if (filters.department?.[0]) p.set("department_id", filters.department[0]);
    let live = true;
    api.get<{ items: Row[]; total: number }>(`/attendance/records?${p}`)
      .then((r) => { if (live) setData({ key, items: r.items, total: r.total }); })
      .catch((e) => { if (live) { setData({ key, items: [], total: 0 }); toast.error(errorText(e, "Couldn't load records")); } });
    return () => { live = false; };
  }, [key, range, q, filters, page, size, toast]);

  const columns: Column<Row>[] = [
    { key: "date", header: "Date", cell: (r) => <span className="tabular text-ink/80">{formatDate(r.date, { weekday: "short" })}</span> },
    { key: "name", header: "Employee", cell: (r) => <div className="min-w-0"><p className="truncate text-ink">{r.employee_name}</p>{r.employee_code && <p className="text-[12px] text-faint">{r.employee_code}</p>}</div> },
    { key: "status", header: "Status", cell: (r) => <div className="flex items-center gap-1.5"><StatusBadge status={r.status} />{r.override_status && <Badge tone="accent">By hand</Badge>}{r.locked && <Lock size={13} strokeWidth={1.4} className="text-faint" />}</div> },
    { key: "shift", header: "Shift", hideBelow: "lg", cell: (r) => <span className="text-muted">{r.shift_name ?? "—"}</span> },
    { key: "in", header: "In – out", hideBelow: "sm", cell: (r) => <span className="tabular text-muted">{r.first_in ? formatTime(r.first_in) : "—"} – {r.last_out ? formatTime(r.last_out) : "—"}</span> },
    { key: "worked", header: "Worked", hideBelow: "md", cell: (r) => <span className="tabular text-muted">{r.worked_minutes ? minutesText(r.worked_minutes) : "—"}</span> },
    {
      key: "flags", header: "Flags", hideBelow: "md", cell: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.is_late && <Badge tone="warn">Late {r.late_minutes}m</Badge>}
          {r.is_early_exit && <Badge tone="warn">Early {r.early_minutes}m</Badge>}
          {r.overtime_minutes > 0 && <Badge tone="info">OT {minutesText(r.overtime_minutes)}</Badge>}
          {Number(r.penalty_lop_days) > 0 && <Badge tone="bad">Penalty {Number(r.penalty_lop_days)}</Badge>}
        </div>
      ),
    },
    { key: "pay", header: "Payable", align: "right", cell: (r) => <span className="tabular">{Number(r.payable_days) - Number(r.penalty_lop_days)}</span> },
  ];

  const statusOptions = useMemo(() => Object.entries(STATUS).filter(([k]) => k !== "upcoming").map(([value, s]) => ({ value, label: s.label })), []);
  return (
    <div className="space-y-4">
      <FilterBar searchPlaceholder="Search by name, email or code" onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={[
          { key: "status", label: "Status", multiple: true, options: statusOptions },
          { key: "flags", label: "Flags", multiple: true, options: [{ value: "late", label: "Late" }, { value: "early", label: "Left early" }, { value: "overtime", label: "Overtime" }, { value: "overridden", label: "Set by hand" }, { value: "night", label: "Night shift" }] },
          { key: "department", label: "Department", options: departments },
        ]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={<div className="w-64"><DateRangeInput value={range} onChange={(r) => { setRange(r); setPage(1); }} clearable={false} max={today} /></div>} />
      <DataTable rows={data?.items ?? []} rowKey={(r) => r.uuid} columns={columns} loading={data?.key !== key}
        onRowClick={(r) => setView(r.uuid)} emptyIcon={ClipboardCheck}
        emptyTitle="No records for these filters" emptyHint="Try another date range or clear the filters."
        pagination={{ page, size, total: data?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }} />
      <DayDetailModal uuid={view} canManage={canManage} onClose={() => setView(null)} onChanged={() => setNonce((n) => n + 1)} />
    </div>
  );
}

function Locks({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Lock[] | null>(null);
  const [unlocking, setUnlocking] = useState<Lock | null>(null);
  const load = useCallback(() => {
    api.get<{ items: Lock[] }>("/attendance/locks").then((r) => setRows(r.items)).catch((e) => toast.error(errorText(e)));
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  const columns: Column<Lock>[] = [
    { key: "period", header: "Period", cell: (l) => <span className="text-ink">{formatDate(l.period_start)} – {formatDate(l.period_end)}</span> },
    { key: "status", header: "Status", cell: (l) => <Badge tone={l.status === "locked" ? "good" : "neutral"} dot>{l.status === "locked" ? "Locked" : "Unlocked"}</Badge> },
    { key: "by", header: "Locked by", hideBelow: "md", cell: (l) => <span className="text-muted">{l.locked_by_name ?? "—"}{l.locked_at ? ` · ${formatDateTime(l.locked_at)}` : ""}</span> },
    { key: "un", header: "Unlocked", hideBelow: "lg", cell: (l) => <span className="text-muted">{l.unlocked_at ? `${l.unlocked_by_name ?? ""} · ${formatDateTime(l.unlocked_at)}` : "—"}</span> },
    { key: "note", header: "Note", hideBelow: "lg", cell: (l) => <span className="text-muted">{l.note ?? "—"}</span> },
  ];
  return (
    <>
      <DataTable rows={rows ?? []} rowKey={(l) => l.uuid} columns={columns} loading={!rows} emptyIcon={Lock}
        emptyTitle="No period is locked yet" emptyHint="Lock each pay period once attendance is checked, before running payroll."
        rowActions={(l) => l.status === "locked" ? [{ label: "Unlock", icon: LockOpen, danger: true, onSelect: () => setUnlocking(l) }] : []} />
      {unlocking && <UnlockModal lock={unlocking} onClose={() => setUnlocking(null)} onDone={() => { setUnlocking(null); load(); onChanged(); }} />}
    </>
  );
}

function UnlockModal({ lock, onClose, onDone }: { lock: Lock; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try { await api.post(`/attendance/locks/${lock.uuid}/unlock`, { note }); toast.success("Period unlocked"); onDone(); }
    catch (e) { toast.error(errorText(e)); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="sm" busy={saving} title="Unlock this period?"
      description={`${formatDate(lock.period_start)} – ${formatDate(lock.period_end)}. Days can change again; payroll may need to be run again.`}
      footer={<><ModalCancel /><Button variant="danger" loading={saving} disabled={note.trim().length < 3} onClick={save}>Unlock</Button></>}>
      <Field label="Why" required><Textarea value={note} onValueChange={setNote} rows={2} placeholder="e.g. Wrong shift found for the warehouse team" /></Field>
    </Modal>
  );
}

function Adjustments() {
  const toast = useToast();
  const [rows, setRows] = useState<Adjustment[] | null>(null);
  useEffect(() => { api.get<Adjustment[]>("/attendance/adjustments").then(setRows).catch((e) => toast.error(errorText(e))); }, [toast]);
  const columns: Column<Adjustment>[] = [
    { key: "name", header: "Employee", cell: (a) => <span className="text-ink">{a.employee_name}</span> },
    { key: "date", header: "Day changed", cell: (a) => <span className="tabular text-muted">{formatDate(a.date)}</span> },
    { key: "status", header: "Change", hideBelow: "md", cell: (a) => <span className="text-muted">{STATUS[a.old_status ?? ""]?.label ?? a.old_status} → {STATUS[a.new_status ?? ""]?.label ?? a.new_status}</span> },
    { key: "pay", header: "Payable", align: "right", cell: (a) => <span className="tabular">{signed(a.payable_days_delta)}</span> },
    { key: "lop", header: "LOP", align: "right", cell: (a) => <span className="tabular">{signed(a.lop_days_delta)}</span> },
    { key: "ot", header: "Overtime", align: "right", hideBelow: "sm", cell: (a) => <span className="tabular">{a.overtime_minutes_delta ? `${a.overtime_minutes_delta > 0 ? "+" : "−"}${minutesText(Math.abs(a.overtime_minutes_delta))}` : "—"}</span> },
    { key: "apply", header: "Paid from", cell: (a) => <span className="tabular text-muted">{formatDate(a.apply_from)}</span> },
  ];
  return (
    <div className="space-y-3">
      <p className="text-[13.5px] text-muted">Changes to days in a locked period. They are paid or recovered in the next open pay period.</p>
      <DataTable rows={rows ?? []} rowKey={(a) => a.uuid} columns={columns} loading={!rows}
        emptyTitle="No adjustments" emptyHint="Corrections approved after a lock show up here." />
    </div>
  );
}

function RecomputeModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const today = todayISO();
  const [range, setRange] = useState<DateRange>({ from: today.slice(0, 8) + "01", to: today });
  const [saving, setSaving] = useState(false);
  async function run() {
    setSaving(true);
    try {
      const r = await api.post<{ days: number; employees: number }>("/attendance/recompute", { start: range.from, end: range.to });
      toast.success(`Worked out ${r.days} days again`, { description: `${r.employees} people` });
      onDone();
    } catch (e) { toast.error(errorText(e)); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="sm" busy={saving} title="Recompute attendance"
      description="Works out every day again from punches, shifts, rules and approved requests. Locked days are not changed."
      footer={<><ModalCancel /><Button variant="primary" icon={RefreshCw} loading={saving} disabled={!range.from || !range.to} onClick={run}>Recompute</Button></>}>
      <Field label="Dates" hint="Up to three months"><DateRangeInput value={range} onChange={setRange} max={today} /></Field>
    </Modal>
  );
}

function LockModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get<{ suggested: { start: string; end: string } }>("/attendance/locks")
      .then((r) => setRange({ from: r.suggested.start, to: r.suggested.end })).catch(() => {});
  }, []);
  async function run() {
    if (!(await confirm({ title: "Lock this period?", message: `${formatDate(range.from)} – ${formatDate(range.to)}. Days will no longer change; later corrections go to the next period.`, confirmLabel: "Lock" }))) return;
    setSaving(true);
    try { await api.post("/attendance/locks", { start: range.from, end: range.to, note: note || null }); toast.success("Period locked"); onDone(); }
    catch (e) { toast.error(errorText(e)); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="sm" busy={saving} title="Lock a pay period"
      description="Every day is brought up to date first, then frozen for payroll."
      footer={<><ModalCancel /><Button variant="primary" icon={Lock} loading={saving} disabled={!range.from || !range.to} onClick={run}>Lock period</Button></>}>
      <div className="space-y-4">
        <Field label="Pay period"><DateRangeInput value={range} onChange={setRange} /></Field>
        <Field label="Note"><Textarea value={note} onValueChange={setNote} rows={2} placeholder="Optional" /></Field>
        <Paper className="px-4 py-3 text-[13px] text-muted">Pending requests in the period stay pending; if approved later they become adjustments.</Paper>
      </div>
    </Modal>
  );
}

