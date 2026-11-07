"use client";

/*
 * Leave admin: every request, the balances table (adjust, history, record leave for
 * someone), accrual / expiry / year-end runs with a preview, opening balance import and
 * comp off.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarClock, CalendarPlus, Download, FileUp, History, ListChecks, PlayCircle, Plus, RefreshCw, Scale, SlidersHorizontal,
  Send, Timer, Upload, Wallet,
} from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, DateInput, Field, FileDrop, FilterBar, FormGrid, Modal, ModalCancel, NumberInput, RadioCards,
  Select, Tabs, Textarea, useConfirm, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { ApplyLeaveModal } from "@/components/leave/apply-modal";
import { LeaveNav, useLeaveAccess } from "@/components/leave/leave-nav";
import { StatusBadge, TypeDot, dateRange, fmtDays } from "@/components/leave/leave-ui";
import { LedgerModal } from "@/components/leave/misc";
import { LeaveRequestModal } from "@/components/leave/request-modal";
import type { LeaveRow, Page, Summary } from "@/components/leave/types";

type Tab = "requests" | "balances" | "runs" | "import" | "compoff";
type BalType = { uuid: string; code: string; name: string; color: string; year: number; mode: string };
type BalRow = { id: number; uuid: string; name: string; employee_code: string | null; photo: string | null; department: string | null;
  balances: Record<string, { balance: number; booked: number; has_entries: boolean }> };
type BalPage = Page<BalRow> & { types: BalType[] };

async function loadEmployees(q: string): Promise<SelectOption[]> {
  const rows = await api.get<{ uuid: string; label: string; hint: string }[]>(`/employees/lookup?q=${encodeURIComponent(q)}`);
  return rows.map((r) => ({ value: r.uuid, label: r.label, description: r.hint }));
}

export default function LeaveAdminPage() {
  const router = useRouter();
  const params = useSearchParams();
  const access = useLeaveAccess();
  const tab = (params.get("tab") as Tab) || "requests";
  const setTab = (t: Tab) => router.replace(`/dashboard/leave/admin${t === "requests" ? "" : `?tab=${t}`}`, { scroll: false });
  const [recordFor, setRecordFor] = useState<{ uuid: string; name: string } | null>(null);
  const [picking, setPicking] = useState(false);
  const [nonce, setNonce] = useState(0);

  return (
    <div>
      <PageHeader eyebrow="Time" title="Leave admin" description="All requests and balances, and the runs that keep balances up to date."
        actions={<Button variant="primary" icon={Plus} onClick={() => setPicking(true)}>Record leave</Button>} />
      <LeaveNav access={access} />
      <Tabs<Tab> value={tab} onChange={setTab} className="mb-5" items={[
        { value: "requests", label: "Requests", icon: ListChecks }, { value: "balances", label: "Balances", icon: Scale },
        { value: "runs", label: "Accrual and year end", icon: PlayCircle }, { value: "import", label: "Import", icon: FileUp },
        { value: "compoff", label: "Comp off", icon: Timer },
      ]} />
      {access && !access.can_manage ? <p className="text-muted">You don&apos;t have access to leave administration.</p> : (
        <>
          {tab === "requests" && <RequestsTab key={nonce} />}
          {tab === "balances" && <BalancesTab key={nonce} onRecord={(e) => setRecordFor(e)} />}
          {tab === "runs" && <RunsTab />}
          {tab === "import" && <ImportTab />}
          {tab === "compoff" && <CompOffTab />}
        </>
      )}
      <PickEmployee open={picking} onClose={() => setPicking(false)} onPick={(e) => { setPicking(false); setRecordFor(e); }} />
      <RecordLeave employee={recordFor} onClose={() => setRecordFor(null)} onSaved={() => { setRecordFor(null); setNonce((n) => n + 1); }} />
    </div>
  );
}

/* ── Requests ─────────────────────────────────────────────────────── */

function RequestsTab() {
  const [rows, setRows] = useState<Page<LeaveRow> | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);
  const [openUuid, setOpenUuid] = useState<string | null>(null);
  useEffect(() => { api.get<{ value: string; label: string }[]>("/leave/options/leave_types").then(setTypes).catch(() => {}); }, []);
  const load = useCallback(() => {
    setRows(null);
    const st = filters.status?.join(",") ?? "";
    const lt = filters.type?.join(",") ?? "";
    api.get<Page<LeaveRow>>(`/leave/requests?scope=all&page=${page}&size=25${st ? `&status=${st}` : ""}${lt ? `&leave_type=${lt}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`)
      .then(setRows).catch(() => setRows({ items: [], total: 0, page: 1, size: 25 }));
  }, [page, q, filters]);
  useEffect(() => { load(); }, [load]);
  const columns: Column<LeaveRow>[] = [
    { key: "who", header: "Employee", cell: (r) => (
      <span className="flex min-w-0 items-center gap-3"><Avatar name={r.employee.name} src={r.employee.photo} size={30} />
        <span className="min-w-0"><span className="block truncate text-ink">{r.employee.name}</span>
          <span className="block truncate text-[12px] text-faint">{[r.employee.employee_code, r.employee.department].filter(Boolean).join(" · ")}</span></span></span>) },
    { key: "type", header: "Leave", cell: (r) => <TypeDot color={r.leave_type.color} label={r.leave_type.name} /> },
    { key: "dates", header: "Dates", hideBelow: "md", cell: (r) => <span className="text-ink/85">{dateRange(r.from_date, r.to_date)}</span> },
    { key: "days", header: "Days", align: "right", cell: (r) => <span className="tabular">{fmtDays(r.days, true)}{r.lop_days ? <span className="text-rose-600"> · {fmtDays(r.lop_days, true)} LOP</span> : null}</span> },
    { key: "ref", header: "Reference", hideBelow: "lg", cell: (r) => <span className="text-muted">{r.reference_no ?? "—"}{r.on_behalf ? " · by HR" : ""}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
  ];
  return (
    <>
      <FilterBar onSearchChange={(v) => { setQ(v); setPage(1); }} searchPlaceholder="Search by name, ID or reference"
        filters={[
          { key: "status", label: "Status", multiple: true, options: [{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" }, { value: "cancelled", label: "Cancelled" }, { value: "cancel_pending", label: "Cancellation pending" }] },
          { key: "type", label: "Leave type", multiple: true, options: types },
        ]} values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={rows?.items ?? []} loading={rows === null} columns={columns} rowKey={(r) => r.uuid} onRowClick={(r) => setOpenUuid(r.uuid)}
        pagination={rows ? { page, size: 25, total: rows.total, onPageChange: setPage } : undefined} emptyTitle="No leave requests found" />
      <LeaveRequestModal uuid={openUuid} onClose={() => setOpenUuid(null)} onChanged={load} />
    </>
  );
}

/* ── Balances ─────────────────────────────────────────────────────── */

function BalancesTab({ onRecord }: { onRecord: (e: { uuid: string; name: string }) => void }) {
  const [data, setData] = useState<BalPage | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [year, setYear] = useState<string>("");
  const [adjusting, setAdjusting] = useState<BalRow | null>(null);
  const [history, setHistory] = useState<{ emp: BalRow; t: BalType } | null>(null);
  const load = useCallback(() => {
    api.get<BalPage>(`/leave/balances?page=${page}&size=25${q ? `&q=${encodeURIComponent(q)}` : ""}${year ? `&year=${year}` : ""}`)
      .then(setData).catch(() => setData(null));
  }, [page, q, year]);
  useEffect(() => { load(); }, [load]);
  const shown = (data?.types ?? []).filter((t) => t.mode !== "grant");
  const thisYear = new Date().getFullYear();
  const columns: Column<BalRow>[] = [
    { key: "who", header: "Employee", cell: (r) => (
      <span className="flex min-w-0 items-center gap-3"><Avatar name={r.name} src={r.photo} size={30} />
        <span className="min-w-0"><span className="block truncate text-ink">{r.name}</span><span className="block truncate text-[12px] text-faint">{[r.employee_code, r.department].filter(Boolean).join(" · ")}</span></span></span>) },
    ...shown.map((t): Column<BalRow> => ({
      key: t.code, align: "right", header: <span className="inline-flex items-center gap-1.5" title={t.name}><span className="h-1.5 w-1.5 rounded-full" style={{ background: t.color }} />{t.code}</span>,
      cell: (r) => {
        const b = r.balances[t.code];
        return (
          <button type="button" className="tabular rounded px-1 text-right hover:bg-sunken" onClick={(e) => { e.stopPropagation(); setHistory({ emp: r, t }); }}>
            <span className={b?.balance < 0 ? "text-rose-600" : b?.has_entries ? "text-ink" : "text-faint"}>{fmtDays(b?.balance ?? 0, true)}</span>
            {b?.booked ? <span className="block text-[11px] text-amber-700">{fmtDays(b.booked, true)} waiting</span> : null}
          </button>
        );
      },
    })),
  ];
  return (
    <>
      <FilterBar onSearchChange={(v) => { setQ(v); setPage(1); }} searchPlaceholder="Search employees"
        actions={<div className="w-40"><Select value={year || null} onChange={(v) => setYear(v ?? "")} clearable placeholder="Current year"
          options={[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => ({ value: String(y), label: String(y) }))} /></div>} />
      <DataTable rows={data?.items ?? []} loading={data === null} columns={columns} rowKey={(r) => r.uuid}
        onRowClick={(r) => setAdjusting(r)}
        rowActions={(r) => [
          { label: "Adjust balance", icon: SlidersHorizontal, onSelect: () => setAdjusting(r) },
          { label: "Record leave", icon: CalendarPlus, onSelect: () => onRecord({ uuid: r.uuid, name: r.name }) },
        ]}
        pagination={data ? { page, size: 25, total: data.total, onPageChange: setPage } : undefined} emptyTitle="No employees found" />
      <p className="mt-2 text-[12px] text-faint">Click a number to see its history. Granted leave (maternity, marriage …) has no running balance and is not shown.</p>
      <AdjustModal row={adjusting} types={data?.types ?? []} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); load(); }} />
      <LedgerModal item={history ? { code: history.t.code, name: `${history.emp.name} · ${history.t.name}`, uuid: history.t.uuid } : null}
        employeeUuid={history?.emp.uuid ?? null} onClose={() => setHistory(null)} />
    </>
  );
}

function AdjustModal({ row, types, onClose, onSaved }: { row: BalRow | null; types: BalType[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [typeUuid, setTypeUuid] = useState<string | null>(null);
  const [days, setDays] = useState<number | null>(null);
  const [direction, setDirection] = useState("add");
  const [kind, setKind] = useState("adjustment");
  const [reason, setReason] = useState("");
  const [year, setYear] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (row) { setTypeUuid(types[0]?.uuid ?? null); setDays(null); setDirection("add"); setKind("adjustment"); setReason(""); setYear(types[0]?.year ?? null); } }, [row, types]);
  const t = types.find((x) => x.uuid === typeUuid);
  const cur = t && row ? row.balances[t.code]?.balance ?? 0 : 0;
  const delta = (days ?? 0) * (direction === "add" ? 1 : -1);
  async function save() {
    if (!row || !typeUuid || !days) return;
    setSaving(true);
    try {
      await api.post("/leave/balances/adjust", { employee_uuid: row.uuid, leave_type_uuid: typeUuid, days: delta, reason, year, kind });
      toast.success("Balance updated");
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!row} onClose={onClose} size="md" busy={saving} dirty={!!days || !!reason}
      title={row ? `Adjust balance · ${row.name}` : ""} description="Every change is kept in the balance history with its reason."
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!days || !reason.trim()} onClick={save}>Save</Button></>}>
      <div className="space-y-5">
        <FormGrid>
          <Field label="Leave type" required>
            <Select value={typeUuid} onChange={(v) => { setTypeUuid(v); setYear(types.find((x) => x.uuid === v)?.year ?? null); }}
              options={types.map((x) => ({ value: x.uuid, label: x.name, description: x.code }))} />
          </Field>
          <Field label="Leave year"><NumberInput value={year} onChange={setYear} min={2000} max={2100} /></Field>
        </FormGrid>
        <Field label="Kind of change">
          <RadioCards value={kind} onChange={setKind} columns={2} options={[
            { value: "adjustment", label: "Adjustment", description: "A correction or a special credit" },
            { value: "opening", label: "Opening balance", description: "Brought from an earlier system" }]} />
        </Field>
        <FormGrid>
          <Field label="Add or take away">
            <RadioCards value={direction} onChange={setDirection} columns={2} options={[{ value: "add", label: "Add" }, { value: "take", label: "Take away" }]} />
          </Field>
          <Field label="Days" required><NumberInput value={days} onChange={setDays} min={0.25} max={365} step={0.5} suffix="days" /></Field>
        </FormGrid>
        {t && <p className="rounded-lg bg-canvas/60 px-3 py-2 text-[13px] text-muted">Balance now {fmtDays(cur)} → after <span className="text-ink">{fmtDays(cur + delta)}</span></p>}
        <Field label="Reason" required><Textarea value={reason} onValueChange={setReason} rows={2} maxLength={300} placeholder="e.g. Special leave approved by the director" /></Field>
      </div>
    </Modal>
  );
}

/* ── Runs ─────────────────────────────────────────────────────────── */

type Run = { uuid: string; kind: string; label: string | null; entries: number; created_at: string; ran_by_name: string | null; result: Record<string, unknown> };
type YeRow = { employee_name: string; employee_code: string | null; leave_type: string; leave_type_name: string; color: string; closing: number; carry: number; encash: number; lapse: number };

function RunsTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [year, setYear] = useState<number | null>(new Date().getFullYear() - 1);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ year: number; rows: YeRow[] } | null>(null);
  const [runs, setRuns] = useState<Page<Run> | null>(null);
  const loadRuns = useCallback(() => { api.get<Page<Run>>("/leave/runs?size=20").then(setRuns).catch(() => {}); }, []);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  async function run(kind: "accrual" | "expiry") {
    setBusy(kind);
    try {
      const r = await api.post<{ entries: number }>(`/leave/runs/${kind}`, { as_of: asOf });
      toast.success(r.entries ? `${r.entries} ${kind === "accrual" ? "credits added" : "credits expired"}` : "Everything is already up to date");
      loadRuns();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't run"); }
    finally { setBusy(null); }
  }
  async function yearEnd(apply: boolean) {
    if (!year) return;
    if (apply && !(await confirm({ title: `Close leave year ${year}?`, message: "Unused leave is carried forward, encashed or lapsed as each policy says. Encashed days go to payroll. People already closed are skipped.", confirmLabel: "Close the year" }))) return;
    setBusy(apply ? "ye" : "preview");
    try {
      const r = await api.post<{ year: number; rows: YeRow[]; employees: number }>("/leave/runs/year-end", { year, apply });
      if (apply) { toast.success(`Year ${year} closed for ${r.employees} balances`); setPreview(null); loadRuns(); }
      else setPreview(r);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't run"); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-3">
        <RunCard icon={RefreshCw} title="Accrual" text="Credit leave that has fallen due: yearly and monthly credits, and earned leave from days worked. Runs every day by itself; safe to run again.">
          <Field label="Up to"><DateInput value={asOf} onChange={setAsOf} /></Field>
          <Button variant="primary" icon={PlayCircle} loading={busy === "accrual"} onClick={() => run("accrual")}>Run accrual</Button>
        </RunCard>
        <RunCard icon={CalendarClock} title="Expiry" text="Expire carried-forward leave and comp off whose date has passed. What was used first is taken from the oldest credit.">
          <Field label="Up to"><DateInput value={asOf} onChange={setAsOf} /></Field>
          <Button variant="secondary" icon={PlayCircle} loading={busy === "expiry"} onClick={() => run("expiry")}>Run expiry</Button>
        </RunCard>
        <RunCard icon={Wallet} title="Year end" text="Carry forward, encash and lapse what is left at the end of a leave year. Check the preview before closing.">
          <Field label="Leave year"><NumberInput value={year} onChange={setYear} min={2000} max={2100} /></Field>
          <div className="flex gap-2">
            <Button variant="secondary" loading={busy === "preview"} onClick={() => yearEnd(false)}>Preview</Button>
            <Button variant="primary" loading={busy === "ye"} onClick={() => yearEnd(true)}>Close year</Button>
          </div>
        </RunCard>
      </div>

      <LapsingSoon />

      {preview && (
        <section>
          <h2 className="mb-3 text-[16px] text-ink">Year end preview · {preview.year}</h2>
          <DataTable rows={preview.rows} rowKey={(r) => `${r.employee_code}${r.employee_name}${r.leave_type}`}
            columns={[
              { key: "who", header: "Employee", cell: (r) => <span className="text-ink">{r.employee_name}<span className="text-faint"> {r.employee_code ?? ""}</span></span> },
              { key: "type", header: "Leave", cell: (r) => <TypeDot color={r.color} label={r.leave_type_name} /> },
              { key: "closing", header: "Left", align: "right", cell: (r) => <span className="tabular">{fmtDays(r.closing, true)}</span> },
              { key: "carry", header: "Carried", align: "right", cell: (r) => <span className="tabular text-primary">{fmtDays(r.carry, true)}</span> },
              { key: "encash", header: "Encashed", align: "right", cell: (r) => <span className="tabular text-emerald-700">{fmtDays(r.encash, true)}</span> },
              { key: "lapse", header: "Lapsed", align: "right", cell: (r) => <span className="tabular text-rose-600">{fmtDays(r.lapse, true)}</span> },
            ]}
            emptyTitle="Nothing to close for this year" emptyHint="Either no balances exist for it or it was closed already." />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-[16px] text-ink">Recent runs</h2>
        <DataTable rows={runs?.items ?? []} loading={runs === null} rowKey={(r) => r.uuid}
          columns={[
            { key: "what", header: "Run", cell: (r) => <span className="text-ink">{r.label ?? r.kind}</span> },
            { key: "kind", header: "Kind", hideBelow: "md", cell: (r) => <Badge>{r.kind.replace("_", " ")}</Badge> },
            { key: "n", header: "Changes", align: "right", cell: (r) => <span className="tabular">{r.entries}</span> },
            { key: "by", header: "By", hideBelow: "md", cell: (r) => <span className="text-muted">{r.ran_by_name ?? ""}</span> },
            { key: "when", header: "When", cell: (r) => <span className="text-muted">{formatDateTime(r.created_at)}</span> },
          ]}
          emptyIcon={History} emptyTitle="No runs yet" />
      </section>
    </div>
  );
}

type Lapsing = { employee_id: number; employee_name: string | null; leave_type: string; days: number; expires_on: string; days_left: number };

function LapsingSoon() {
  const toast = useToast();
  const [rows, setRows] = useState<Lapsing[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { api.get<{ items: Lapsing[] }>("/leave/expiry-reminders/due").then((r) => setRows(r.items)).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  async function send() {
    setBusy(true);
    try {
      const r = await api.post<{ employees: number }>("/leave/expiry-reminders/send");
      toast.success(r.employees ? `Reminded ${r.employees} ${r.employees === 1 ? "person" : "people"}` : "Everyone due has been reminded already");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send"); }
    finally { setBusy(false); }
  }
  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[16px] text-ink">Lapsing soon</h2>
          <p className="text-[13px] text-muted">Comp off and carried leave that will expire unless it is used. Reminders go out by email every day by themselves.</p>
        </div>
        <Button variant="secondary" icon={Send} loading={busy} disabled={!rows?.length} onClick={send}>Send reminders now</Button>
      </div>
      <DataTable rows={rows ?? []} loading={rows === null} rowKey={(r) => `${r.employee_id}-${r.leave_type}-${r.expires_on}`}
        columns={[
          { key: "who", header: "Employee", cell: (r) => <span className="text-ink">{r.employee_name}</span> },
          { key: "type", header: "Leave", cell: (r) => <span className="text-muted">{r.leave_type}</span> },
          { key: "days", header: "Days", align: "right", cell: (r) => <span className="tabular">{fmtDays(r.days, true)}</span> },
          { key: "when", header: "Lapses on", cell: (r) => <span className="text-muted">{formatDate(r.expires_on)}</span> },
          { key: "left", header: "", align: "right", cell: (r) => <Badge tone={r.days_left <= 7 ? "warn" : "neutral"}>{r.days_left === 0 ? "today" : `in ${r.days_left} days`}</Badge> },
        ]}
        emptyIcon={CalendarClock} emptyTitle="Nothing lapsing soon" />
    </section>
  );
}

function RunCard({ icon: Icon, title, text, children }: { icon: React.ElementType; title: string; text: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sunken text-muted"><Icon size={17} strokeWidth={1.4} /></span>
        <p className="text-[15px] text-ink">{title}</p>
      </div>
      <p className="mt-2 flex-1 text-[13px] text-muted">{text}</p>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

/* ── Import ───────────────────────────────────────────────────────── */

function ImportTab() {
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ imported: number; error_count: number; errors: { row: number; detail: string }[]; dry_run: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (files[0]) files[0].text().then(setText); }, [files]);
  async function go(dry: boolean) {
    setBusy(true);
    try {
      const r = await api.post<typeof result>("/leave/balances/import", { csv: text, dry_run: dry });
      setResult(r);
      if (!dry && r) toast.success(`${r.imported} opening balances imported`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't read the file"); }
    finally { setBusy(false); }
  }
  async function template() {
    const token = localStorage.getItem("hrms_token");
    const r = await fetch(`${API_BASE}/leave/balances/import/template`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a"); a.href = url; a.download = "opening-balances.csv"; a.click();
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <FileDrop value={files} onChange={setFiles} accept=".csv,text/csv" maxFiles={1} title="Drop the opening balances file" hint="CSV with columns employee, leave_type, days, year, note" />
        <Field label="Or paste the rows"><Textarea value={text} onValueChange={setText} rows={8} className="font-mono text-[12.5px]" placeholder={"employee,leave_type,days,year\nNG1001,EL,12.5,2026"} /></Field>
        <div className="flex gap-2">
          <Button variant="secondary" loading={busy} disabled={!text.trim()} onClick={() => go(true)}>Check</Button>
          <Button variant="primary" icon={Upload} loading={busy} disabled={!text.trim()} onClick={() => go(false)}>Import</Button>
        </div>
        {result && (
          <div className="rounded-xl border border-line p-4 text-[13.5px]">
            <p className="text-ink">{result.dry_run ? "Ready to import" : "Imported"}: {result.imported} rows{result.error_count ? ` · ${result.error_count} with problems` : ""}</p>
            {result.errors.length > 0 && <ul className="mt-2 space-y-1 text-[12.5px] text-rose-700">{result.errors.slice(0, 20).map((e) => <li key={e.row}>Row {e.row}: {e.detail}</li>)}</ul>}
          </div>
        )}
      </div>
      <aside className="rounded-2xl border border-line bg-surface p-5 text-[13px] text-muted">
        <p className="text-[15px] text-ink">How it works</p>
        <ul className="mt-3 list-disc space-y-1.5 pl-4">
          <li><span className="text-ink">employee</span>: employee ID or work email</li>
          <li><span className="text-ink">leave_type</span>: the code, such as EL or SL</li>
          <li><span className="text-ink">days</span>: the balance on the first day of the year</li>
          <li><span className="text-ink">year</span>: leave year (optional, this year by default)</li>
        </ul>
        <p className="mt-3">Importing again for the same person, type and year corrects the earlier figure.</p>
        <Button variant="ghost" size="sm" icon={Download} className="mt-3" onClick={template}>Download a sample file</Button>
      </aside>
    </div>
  );
}

/* ── Comp off ─────────────────────────────────────────────────────── */

type CompOff = { uuid: string; employee: { name: string; photo: string | null; department: string | null }; worked_date: string; day_kind: string;
  days: number; reason: string | null; source: string; status: string; expires_on: string | null; created_at: string };

function CompOffTab() {
  const [rows, setRows] = useState<Page<CompOff> | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => { api.get<Page<CompOff>>(`/leave/comp-offs?scope=all&page=${page}`).then(setRows).catch(() => setRows({ items: [], total: 0, page: 1, size: 25 })); }, [page]);
  return (
    <DataTable rows={rows?.items ?? []} loading={rows === null} rowKey={(r) => r.uuid}
      columns={[
        { key: "who", header: "Employee", cell: (r) => <span className="flex items-center gap-3"><Avatar name={r.employee.name} src={r.employee.photo} size={28} /><span className="text-ink">{r.employee.name}</span></span> },
        { key: "worked", header: "Worked on", cell: (r) => <span className="text-ink/85">{formatDate(r.worked_date)} <span className="text-faint">· {r.day_kind === "holiday" ? "holiday" : "weekly off"}</span></span> },
        { key: "days", header: "Days", align: "right", cell: (r) => <span className="tabular">{fmtDays(r.days, true)}</span> },
        { key: "exp", header: "Expires", hideBelow: "md", cell: (r) => <span className="text-muted">{r.expires_on ? formatDate(r.expires_on) : "—"}</span> },
        { key: "src", header: "From", hideBelow: "lg", cell: (r) => <span className="text-muted">{r.source === "request" ? "Request" : r.source === "attendance" ? "Attendance" : "HR"}</span> },
        { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
      ]}
      pagination={rows ? { page, size: 25, total: rows.total, onPageChange: setPage } : undefined}
      emptyIcon={Timer} emptyTitle="No comp off yet" emptyHint="Employees ask for comp off after working on a weekly off or a holiday." />
  );
}

/* ── Record leave for someone ─────────────────────────────────────── */

function PickEmployee({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (e: { uuid: string; name: string }) => void }) {
  const [v, setV] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  useEffect(() => { if (open) setV(null); }, [open]);
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Record leave for"
      footer={<><ModalCancel /><Button variant="primary" disabled={!v} onClick={() => v && onPick({ uuid: v, name: label })}>Continue</Button></>}>
      <Field label="Employee"><Select value={v} onChange={(x, o) => { setV(x); setLabel(o?.label ?? ""); }} loadOptions={loadEmployees} placeholder="Search by name or ID" /></Field>
    </Modal>
  );
}

function RecordLeave({ employee, onClose, onSaved }: { employee: { uuid: string; name: string } | null; onClose: () => void; onSaved: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  useEffect(() => {
    setSummary(null);
    if (employee) api.get<Summary>(`/leave/me/summary?employee_uuid=${employee.uuid}`).then(setSummary).catch(() => {});
  }, [employee]);
  return <ApplyLeaveModal open={!!employee && !!summary} onClose={onClose} onSaved={onSaved} cards={summary?.cards ?? []} employee={employee} />;
}



