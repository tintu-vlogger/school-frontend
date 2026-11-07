"use client";

/*
 * One pay run as a stepper: Inputs -> Checks -> Calculate -> Review -> Approve -> Lock and pay.
 * The current step follows the run's status; earlier steps can be revisited. Calculation
 * runs in the background and this page polls for progress.
 */
import { BankFilesPanel } from "@/components/payroll/bank-run";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle, Ban, Bell, Calculator, CheckCircle2, Download, FileSpreadsheet, Info, Lock, Plus, RefreshCw, Send, ShieldAlert,
  Sparkles, Trash2, Undo2, Upload, Wallet, XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, Field, FilterBar, FormGrid, Modal, ModalCancel, NumberInput, Select, Stepper, Tabs, TextInput,
  Textarea, useConfirm, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { RunStatus, StatusPill, can, downloadWithAuth, errMsg, inr, postForm, usePayrollAccess } from "@/components/payroll/common";
import { PayslipModal } from "@/components/payroll/payslip-modal";

type Finding = { key: string; level: "block" | "warn" | "info"; title: string; message: string; employees: { id: number; name: string }[]; action?: string; stage?: string };
type Flag = { key: string; severity: string; employee_id: number | null; employee_name: string | null; title: string; explanation: string };
type Run = {
  uuid: string; number: string | null; kind: string; kind_label: string; title: string; period_start: string; period_end: string;
  pay_date: string | null; status: string; progress: number; progress_total: number; totals: Record<string, any>;
  checks: Finding[]; acknowledgements: Record<string, { by: string; at: string; reason: string }>; assistant: Flag[];
  history: { stage: string; by: string; at: string; note: string | null }[]; error: string | null; pay_group_name: string | null;
  employee_count: number; blocking: string[]; can_submit: boolean;
  settlement?: { uuid: string; number: string | null; status: string; due_date: string; last_working_day: string; countdown: { days_left: number; state: string } };
  approval?: { status: string; reference: string | null; steps: { uuid: string; name: string; status: string; approver: string | null; decided_by: string | null; comment: string | null; mine: boolean }[] };
};
type Input = { uuid: string; employee_id: number; employee_name: string; kind: string; kind_label: string; component_code: string | null; amount: string | null; days: string | null; note: string | null; source: string };
type Slip = { uuid: string; employee_id: number; employee_name: string; employee_code: string | null; department: string | null; status: string;
  payable_days: string; lop_days: string; gross: string; deductions: string; net: string; tds: string | null; pf: string | null;
  warnings: { code: string; level: string; message: string }[]; arrears: unknown[]; payment_status: string };

const STEPS = [
  { label: "Inputs", description: "Days, overtime, one-time pay" }, { label: "Checks", description: "Fix problems first" },
  { label: "Calculate", description: "Work out every payslip" }, { label: "Review", description: "Register and changes" },
  { label: "Approve", description: "Approval flow" }, { label: "Lock and pay", description: "Files and payslips" },
];
const STEP_OF: Record<string, number> = { draft: 0, inputs: 0, checked: 1, calculating: 2, failed: 2, review: 3, pending_approval: 4, approved: 4, locked: 5, paid: 5, cancelled: 0 };

export default function PayRunPage() {
  const { uuid } = useParams<{ uuid: string }>();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const access = usePayrollAccess();
  const [run, setRun] = useState<Run | null>(null);
  const [step, setStep] = useState(0);
  const lastStatus = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get<Run>(`/payroll/runs/${uuid}`);
      setRun(r);
      if (lastStatus.current !== r.status) { setStep(STEP_OF[r.status] ?? 0); lastStatus.current = r.status; }
      return r;
    } catch (e) { toast.error(errMsg(e)); return null; }
  }, [uuid, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (run?.status !== "calculating") return;
    const t = setInterval(load, 1200);
    return () => clearInterval(t);
  }, [run?.status, load]);

  async function act(path: string, body?: unknown, ok?: string) {
    try {
      const r = await api.post<Run>(`/payroll/runs/${uuid}/${path}`, body);
      if (r && (r as Run).uuid) { setRun(r as Run); setStep(STEP_OF[(r as Run).status] ?? 0); lastStatus.current = (r as Run).status; }
      else await load();
      if (ok) toast.success(ok);
      return true;
    } catch (e) { toast.error(errMsg(e)); return false; }
  }

  if (!run) return <div><PageHeader eyebrow="Payroll" title="Pay run" /><Paper><EmptyState icon={Wallet} title="Loading…" /></Paper></div>;
  const current = STEP_OF[run.status] ?? 0;
  const editable = ["draft", "inputs", "checked", "review", "failed"].includes(run.status);

  return (
    <div>
      <PageHeader eyebrow={<span>Payroll · <button className="hover:text-ink" onClick={() => router.push("/dashboard/payroll/runs")}>Pay runs</button></span>}
        title={run.title}
        description={<span className="flex flex-wrap items-center gap-2">{run.number && <span className="font-mono text-[13px]">{run.number}</span>}
          <span>· {formatDate(run.period_start)} to {formatDate(run.period_end)}</span>{run.pay_date && <span>· pay date {formatDate(run.pay_date)}</span>}
          <RunStatus status={run.status} /></span>}
        actions={editable && run.status !== "cancelled" && (
          <Button variant="ghost" icon={Ban} onClick={async () => {
            if (await confirm({ title: "Cancel this pay run?", message: "Inputs and calculations are discarded.", confirmLabel: "Cancel run", tone: "danger" }))
              await act("cancel", undefined, "Pay run cancelled");
          }}>Cancel run</Button>
        )} />
      {run.settlement && (
        <Paper className="mb-5 flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
          <p className="text-[13.5px] text-muted">Full and final settlement{run.settlement.number ? ` ${run.settlement.number}` : ""}: last day {formatDate(run.settlement.last_working_day)}, to be paid by <span className="text-ink">{formatDate(run.settlement.due_date)}</span> (2 working days).{" "}
            {run.settlement.status !== "paid" && <Badge tone={run.settlement.countdown.state === "overdue" ? "bad" : run.settlement.countdown.state === "on_track" ? "neutral" : "warn"} dot>
              {run.settlement.countdown.days_left < 0 ? `Overdue by ${-run.settlement.countdown.days_left} days` : run.settlement.countdown.days_left === 0 ? "Due today" : `${run.settlement.countdown.days_left} days left`}</Badge>}</p>
          <Button size="sm" variant="ghost" onClick={() => router.push(`/dashboard/settlements?view=${run.settlement!.uuid}`)}>Open settlement</Button>
        </Paper>
      )}
      <Paper className="mb-5 px-5 py-4">
        <Stepper steps={STEPS} current={current} onStepClick={(i) => setStep(i)} />
      </Paper>
      {run.status === "cancelled" ? <Paper><EmptyState icon={Ban} title="This pay run was cancelled" /></Paper> : (
        <>
          {step === 0 && <InputsStep run={run} editable={editable} onChanged={load} onNext={() => act("checks", undefined, "Checks done")} act={act} />}
          {step === 1 && <ChecksStep run={run} access={access} act={act} />}
          {step === 2 && <CalculateStep run={run} act={act} />}
          {step === 3 && <ReviewStep run={run} act={act} onChanged={load} />}
          {step === 4 && <ApproveStep run={run} act={act} onChanged={load} canApprove={can(access, "payroll.approve")} />}
          {step === 5 && <PayStep run={run} act={act} canReopen={can(access, "payroll.reopen")} canApprove={can(access, "payroll.approve")} />}
          <History run={run} />
        </>
      )}
    </div>
  );
}

type Act = (path: string, body?: unknown, ok?: string) => Promise<boolean>;

/* ── Inputs ─────────────────────────────────────────────────────── */

function InputsStep({ run, editable, onChanged, onNext, act }: { run: Run; editable: boolean; onChanged: () => void; onNext: () => void; act: Act }) {
  const toast = useToast();
  const [data, setData] = useState<{ items: Input[]; kinds: Record<string, string>; employees: { id: number; uuid: string; name: string; employee_code: string | null; joining: string | null; leaving: string | null }[] } | null>(null);
  const [filters, setFilters] = useState<FilterValues>({});
  const [adding, setAdding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = useCallback(() => {
    api.get<typeof data>(`/payroll/runs/${run.uuid}/inputs`).then(setData).catch((e) => toast.error(errMsg(e)));
  }, [run.uuid, toast]);
  useEffect(() => { load(); }, [load, run.status]);

  async function remove(i: Input) {
    try { await api.delete(`/payroll/runs/${run.uuid}/inputs/${i.uuid}`); load(); onChanged(); } catch (e) { toast.error(errMsg(e)); }
  }
  async function upload(f: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const r = await postForm<{ imported: number; errors: { row: number; message: string }[] }>(`/payroll/runs/${run.uuid}/inputs/import`, fd);
      toast.success(`${r.imported} inputs added`, r.errors.length ? { description: `${r.errors.length} rows skipped: ${r.errors.slice(0, 2).map((e) => `row ${e.row} ${e.message}`).join("; ")}` } : undefined);
      load(); onChanged();
    } catch (e) { toast.error(errMsg(e)); } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const rows = (data?.items ?? []).filter((i) => (!filters.kind?.length || filters.kind.includes(i.kind)) && (!filters.source?.length || filters.source.includes(i.source)));
  const columns: Column<Input>[] = [
    { key: "who", header: "Employee", cell: (i) => <span className="flex items-center gap-2"><Avatar name={i.employee_name} size={26} /><span className="text-ink">{i.employee_name}</span></span> },
    { key: "what", header: "Input", cell: (i) => <div><p className="text-ink">{i.kind_label}{i.component_code ? ` · ${i.component_code}` : ""}</p>{i.note && <p className="text-[12.5px] text-faint">{i.note}</p>}</div> },
    { key: "value", header: "Value", align: "right", cell: (i) => <span className="tabular text-ink">{i.amount !== null ? (i.kind === "overtime_hours" ? `${Number(i.amount)} h` : inr(i.amount)) : i.days !== null ? `${Number(i.days)} days` : "—"}</span> },
    { key: "src", header: "From", hideBelow: "md", cell: (i) => <Badge tone={i.source === "manual" || i.source === "excel" ? "accent" : "neutral"}>{{ manual: "Typed in", excel: "Excel", attendance: "Attendance", leave: "Leave", loan: "Loan", expense: "Expense claim", encashment: "Leave encashment" }[i.source] ?? i.source}</Badge> },
  ];
  const joiners = data?.employees.filter((e) => e.joining) ?? [];
  const leavers = data?.employees.filter((e) => e.leaving) ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Paper className="p-5"><p className="text-[13px] text-muted">People in this run</p><p className="tabular mt-2 text-[28px] font-extralight text-ink">{data?.employees.length ?? run.employee_count}</p></Paper>
        <Paper className="p-5"><p className="text-[13px] text-muted">Joining this month</p><p className="mt-2 truncate text-[14px] text-ink">{joiners.length ? joiners.map((j) => j.name).join(", ") : "No one"}</p></Paper>
        <Paper className="p-5"><p className="text-[13px] text-muted">Leaving this month</p><p className="mt-2 truncate text-[14px] text-ink">{leavers.length ? leavers.map((j) => j.name).join(", ") : "No one"}</p></Paper>
      </div>
      <FilterBar values={filters} onChange={setFilters} filters={[
        { key: "kind", label: "Input", multiple: true, options: Object.entries(data?.kinds ?? {}).map(([value, label]) => ({ value, label })) },
        { key: "source", label: "From", multiple: true, options: [{ value: "attendance", label: "Attendance" }, { value: "leave", label: "Leave" }, { value: "loan", label: "Loans" }, { value: "expense", label: "Expenses" }, { value: "manual", label: "Typed in" }, { value: "excel", label: "Excel" }] },
      ]} actions={editable && (
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" icon={RefreshCw} onClick={async () => { if (await act("sync", undefined, "Inputs refreshed")) load(); }}>Refresh</Button>
          <Button variant="ghost" icon={FileSpreadsheet} onClick={() => downloadWithAuth(`/payroll/runs/${run.uuid}/inputs/template`, "inputs.xlsx")}>Template</Button>
          <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button variant="secondary" icon={Upload} loading={uploading} onClick={() => fileRef.current?.click()}>Upload Excel</Button>
          <Button variant="secondary" icon={Plus} onClick={() => setAdding(true)}>Add input</Button>
        </div>
      )} />
      <DataTable rows={rows} rowKey={(i) => i.uuid} columns={columns} loading={!data}
        rowActions={(i) => editable ? [{ label: "Remove", icon: Trash2, danger: true, onSelect: () => remove(i) }] : []}
        emptyIcon={Plus} emptyTitle="No inputs" emptyHint="Unpaid days, overtime, loan instalments and approved claims are pulled in automatically. Add one-time pay or deductions here." />
      {editable && (
        <div className="flex justify-end">
          <Button variant="primary" icon={ShieldAlert} onClick={onNext}>Run checks</Button>
        </div>
      )}
      {data && <AddInputModal open={adding} onClose={() => setAdding(false)} run={run} employees={data.employees} kinds={data.kinds}
        onAdded={() => { setAdding(false); load(); onChanged(); }} />}
    </div>
  );
}

function AddInputModal({ open, onClose, run, employees, kinds, onAdded }: { open: boolean; onClose: () => void; run: Run; employees: { uuid: string; name: string; employee_code: string | null }[]; kinds: Record<string, string>; onAdded: () => void }) {
  const toast = useToast();
  const [emp, setEmp] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>("earning");
  const [code, setCode] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [comps, setComps] = useState<{ code: string; name: string; kind: string; calc: string }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) api.get<typeof comps>("/payroll/components").then(setComps).catch(() => {}); }, [open]);
  const compOpts = comps.filter((c) => (kind === "earning" ? ["earning", "reimbursement"].includes(c.kind) && c.calc !== "balance" : c.kind === "deduction") && !["PF_EE", "ESI_EE", "PT", "TDS", "LWF_EE", "VPF"].includes(c.code))
    .map((c) => ({ value: c.code, label: c.name, description: c.code }));
  const usesDays = kind === "lop_days";
  const usesAmount = ["earning", "deduction", "overtime_hours", "tds_override"].includes(kind ?? "");
  async function save() {
    setBusy(true);
    try {
      await api.post(`/payroll/runs/${run.uuid}/inputs`, { employee_uuid: emp, kind, component_code: code, amount: usesAmount ? amount : undefined, days: usesDays ? amount : undefined, note });
      toast.success("Input added");
      setEmp(null); setAmount(null); setNote(""); setCode(null);
      onAdded();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title="Add input" busy={busy}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} disabled={!emp || !kind} onClick={save}>Add</Button></>}>
      <div className="space-y-5">
        <Field label="Employee" required><Select value={emp} onChange={setEmp} options={employees.map((e) => ({ value: e.uuid, label: e.name, description: e.employee_code ?? undefined }))} placeholder="Choose" /></Field>
        <Field label="What" required><Select value={kind} onChange={(v) => { setKind(v); setCode(null); }} options={Object.entries(kinds).map(([value, label]) => ({ value, label }))} /></Field>
        {(kind === "earning" || kind === "deduction") && <Field label="Salary component" required><Select value={code} onChange={setCode} options={compOpts} /></Field>}
        {(usesAmount || usesDays) && (
          <Field label={usesDays ? "Days" : kind === "overtime_hours" ? "Hours" : "Amount (₹)"} required>
            <NumberInput value={amount} onChange={setAmount} min={0} step={usesDays ? 0.5 : 1} />
          </Field>
        )}
        <Field label="Note"><TextInput value={note} onValueChange={setNote} placeholder="Shown on the payslip for one-time pay" /></Field>
      </div>
    </Modal>
  );
}

/* ── Checks ─────────────────────────────────────────────────────── */

function FindingCard({ f, ack, onAck }: { f: Finding; ack?: { by: string; reason: string }; onAck?: () => void }) {
  const Icon = f.level === "block" ? XCircle : f.level === "warn" ? AlertTriangle : Info;
  const tone = f.level === "block" ? "text-rose-600" : f.level === "warn" ? "text-amber-600" : "text-sky-600";
  return (
    <li className="flex gap-3 px-5 py-4">
      <Icon size={18} strokeWidth={1.4} className={`mt-0.5 shrink-0 ${ack ? "text-emerald-600" : tone}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><p className="text-[14.5px] text-ink">{f.title}</p>
          {f.level === "block" && !ack && <Badge tone="bad">Must fix or acknowledge</Badge>}
          {ack && <Badge tone="good">Acknowledged by {ack.by}</Badge>}</div>
        <p className="mt-0.5 text-[13.5px] text-muted">{f.message}{ack ? ` Reason: ${ack.reason}` : ""}</p>
        {f.employees.length > 0 && <p className="mt-1.5 text-[12.5px] text-faint">{f.employees.slice(0, 8).map((e) => e.name).join(", ")}{f.employees.length > 8 ? ` and ${f.employees.length - 8} more` : ""}</p>}
      </div>
      {f.level === "block" && !ack && onAck && <Button size="sm" variant="secondary" onClick={onAck}>Acknowledge</Button>}
    </li>
  );
}

function ChecksStep({ run, access, act }: { run: Run; access: ReturnType<typeof usePayrollAccess>; act: Act }) {
  const toast = useToast();
  const [ackKey, setAckKey] = useState<string | null>(null);
  const pre = run.checks.filter((c) => c.stage !== "calculated");
  const counts = { block: pre.filter((c) => c.level === "block").length, warn: pre.filter((c) => c.level === "warn").length };
  const editable = ["inputs", "checked", "review", "failed", "draft"].includes(run.status);
  return (
    <div className="space-y-5">
      <Paper>
        <PaperHeader title={pre.length ? `${counts.block} to fix · ${counts.warn} warnings` : "Checks"} action={editable && (
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => act("checks", undefined, "Checked again")}>Check again</Button>
            <Button size="sm" variant="secondary" icon={Bell} onClick={async () => {
              try { const r = await api.post<Record<string, number>>(`/payroll/runs/${run.uuid}/reminders`); toast.success("Reminders sent", { description: `${r.approvers ?? 0} approvers and ${r.employees ?? 0} employees told in the app and by email` }); }
              catch (e) { toast.error(errMsg(e)); }
            }}>Send reminders</Button>
          </div>
        )} />
        {pre.length ? <ul className="divide-y divide-line">{pre.map((f) => <FindingCard key={f.key} f={f} ack={run.acknowledgements[f.key]} onAck={can(access, "payroll.approve") ? () => setAckKey(f.key) : undefined} />)}</ul>
          : <EmptyState icon={CheckCircle2} title="Run the checks" hint="Pending leave and attendance, missing bank details or PAN, joiners, leavers and holds are listed here before you calculate." />}
      </Paper>
      {editable && <div className="flex justify-end"><Button variant="primary" icon={Calculator} onClick={() => act("calculate", undefined, "Calculation started")}>Calculate pay</Button></div>}
      <AckModal open={!!ackKey} onClose={() => setAckKey(null)} onSave={async (reason) => { if (await act("acknowledge", { key: ackKey, reason }, "Acknowledged")) setAckKey(null); }} />
    </div>
  );
}

function AckModal({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Go ahead anyway?" description="Recorded in the audit log with your name."
      footer={<><ModalCancel /><Button variant="primary" disabled={reason.trim().length < 3} onClick={() => onSave(reason)}>Acknowledge</Button></>}>
      <Field label="Reason" required><Textarea value={reason} onValueChange={setReason} rows={3} /></Field>
    </Modal>
  );
}

/* ── Calculate ──────────────────────────────────────────────────── */

function CalculateStep({ run, act }: { run: Run; act: Act }) {
  const pct = run.progress_total ? Math.round((run.progress / run.progress_total) * 100) : 0;
  return (
    <Paper className="p-8">
      {run.status === "calculating" ? (
        <div className="mx-auto max-w-md text-center">
          <Calculator size={28} strokeWidth={1.2} className="mx-auto mb-3 text-primary" />
          <p className="text-[16px] text-ink">Calculating payslips…</p>
          <p className="mt-1 text-[13.5px] text-muted">{run.progress} of {run.progress_total} people</p>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
      ) : run.status === "failed" ? (
        <div className="mx-auto max-w-md text-center">
          <XCircle size={28} strokeWidth={1.2} className="mx-auto mb-3 text-rose-600" />
          <p className="text-[16px] text-ink">The calculation stopped</p>
          <p className="mt-1 text-[13.5px] text-muted">{run.error}</p>
          <Button className="mt-5" variant="primary" icon={RefreshCw} onClick={() => act("calculate", undefined, "Calculation started")}>Try again</Button>
        </div>
      ) : (
        <div className="mx-auto max-w-md text-center">
          <Calculator size={28} strokeWidth={1.2} className="mx-auto mb-3 text-faint" />
          <p className="text-[16px] text-ink">Ready to calculate</p>
          <p className="mt-1 text-[13.5px] text-muted">Gross pay, unpaid-day cuts, PF, ESI, PT, LWF, TDS, net pay and employer cost for everyone in the run.</p>
          {["inputs", "checked", "review"].includes(run.status) && <Button className="mt-5" variant="primary" icon={Calculator} onClick={() => act("calculate", undefined, "Calculation started")}>Calculate pay</Button>}
        </div>
      )}
    </Paper>
  );
}

/* ── Review ─────────────────────────────────────────────────────── */

function Totals({ t }: { t: Record<string, any> }) {
  const items = [["Gross", t.gross], ["Deductions", t.deductions], ["Net pay", t.net], ["Employer cost", t.employer_cost]];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([l, v]) => <Paper key={l} className="p-5"><p className="text-[13px] text-muted">{l}</p><p className="tabular mt-2 text-[26px] font-extralight text-ink">{inr(v)}</p></Paper>)}
    </div>
  );
}

function ReviewStep({ run, act, onChanged }: { run: Run; act: Act; onChanged: () => void }) {
  const toast = useToast();
  const [tab, setTab] = useState("register");
  const [slips, setSlips] = useState<Slip[] | null>(null);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [open, setOpen] = useState<string | null>(null);
  const [variance, setVariance] = useState<any>(null);
  const load = useCallback(() => {
    api.get<{ items: Slip[] }>(`/payroll/runs/${run.uuid}/payslips`).then((r) => setSlips(r.items)).catch((e) => toast.error(errMsg(e)));
  }, [run.uuid, toast]);
  useEffect(() => { load(); }, [load, run.totals]);
  useEffect(() => { if (tab === "variance" && !variance) api.get(`/payroll/runs/${run.uuid}/variance`).then(setVariance).catch(() => {}); }, [tab, variance, run.uuid]);
  const rows = (slips ?? []).filter((s) => (!q || s.employee_name.toLowerCase().includes(q.toLowerCase()) || (s.employee_code ?? "").toLowerCase().includes(q.toLowerCase()))
    && (!filters.status?.length || filters.status.includes(s.status)) && (!filters.flag?.[0] || s.warnings.some((w) => w.level !== "info")));
  const after = run.checks.filter((c) => c.stage === "calculated");
  const columns: Column<Slip>[] = [
    { key: "who", header: "Employee", cell: (s) => <div className="min-w-0"><p className="truncate text-ink">{s.employee_name}</p><p className="truncate text-[12.5px] text-faint">{[s.employee_code, s.department].filter(Boolean).join(" · ")}</p></div> },
    { key: "days", header: "Paid days", align: "right", hideBelow: "md", cell: (s) => <span className="tabular text-muted">{Number(s.payable_days)}{Number(s.lop_days) ? <span className="text-amber-700"> (−{Number(s.lop_days)})</span> : null}</span> },
    { key: "gross", header: "Gross", align: "right", cell: (s) => <span className="tabular text-ink/85">{inr(s.gross)}</span> },
    { key: "tds", header: "TDS", align: "right", hideBelow: "lg", cell: (s) => <span className="tabular text-muted">{inr(s.tds)}</span> },
    { key: "ded", header: "Deductions", align: "right", hideBelow: "lg", cell: (s) => <span className="tabular text-muted">{inr(s.deductions)}</span> },
    { key: "net", header: "Net pay", align: "right", cell: (s) => <span className="tabular text-ink">{inr(s.net)}</span> },
    { key: "flags", header: "", cell: (s) => <span className="flex items-center justify-end gap-1.5">
      {s.status !== "calculated" && <StatusPill status={s.status} />}
      {s.arrears.length > 0 && <Badge tone="info">Arrears</Badge>}
      {s.warnings.some((w) => w.level === "block") ? <XCircle size={16} strokeWidth={1.4} className="text-rose-600" /> : s.warnings.some((w) => w.level === "warn") ? <AlertTriangle size={16} strokeWidth={1.4} className="text-amber-600" /> : null}</span> },
  ];
  const editable = run.status === "review";
  return (
    <div className="space-y-5">
      <Totals t={run.totals} />
      <Tabs value={tab} onChange={setTab} items={[
        { value: "register", label: "Payroll register", count: run.totals.employees },
        { value: "assistant", label: "Check assistant", count: run.assistant.length },
        { value: "checks", label: "Findings", count: after.length },
        { value: "variance", label: "Against last month" },
        { value: "components", label: "By component" },
      ]} />
      {tab === "register" && (
        <>
          <FilterBar searchPlaceholder="Search by name or ID" onSearchChange={setQ} values={filters} onChange={setFilters} filters={[
            { key: "status", label: "Status", multiple: true, options: [{ value: "calculated", label: "Ready" }, { value: "held", label: "On hold" }, { value: "skipped", label: "Left out" }, { value: "error", label: "Error" }] },
            { key: "flag", label: "Flagged", options: [{ value: "1", label: "Has warnings" }] },
          ]} actions={<Button variant="ghost" icon={Download} onClick={() => downloadWithAuth(`/payroll/runs/${run.uuid}/register?format=xlsx`, "register.xlsx")}>Excel</Button>} />
          <DataTable rows={rows} rowKey={(s) => s.uuid} columns={columns} loading={!slips} onRowClick={(s) => setOpen(s.uuid)}
            emptyIcon={Wallet} emptyTitle="No payslips" />
        </>
      )}
      {tab === "assistant" && (
        <Paper>
          <PaperHeader title={<span className="flex items-center gap-2"><Sparkles size={16} strokeWidth={1.4} className="text-primary" />Payroll check assistant</span>} />
          {run.assistant.length ? <ul className="divide-y divide-line">{run.assistant.map((f, i) => (
            <li key={i} className="flex gap-3 px-5 py-4">
              {f.severity === "block" ? <XCircle size={18} strokeWidth={1.4} className="mt-0.5 shrink-0 text-rose-600" /> : f.severity === "warn" ? <AlertTriangle size={18} strokeWidth={1.4} className="mt-0.5 shrink-0 text-amber-600" /> : <Info size={18} strokeWidth={1.4} className="mt-0.5 shrink-0 text-sky-600" />}
              <div><p className="text-[14.5px] text-ink">{f.title}{f.employee_name ? <span className="text-muted"> · {f.employee_name}</span> : null}</p><p className="mt-0.5 text-[13.5px] text-muted">{f.explanation}</p></div>
            </li>))}</ul> : <EmptyState icon={CheckCircle2} title="Nothing unusual" hint="No sudden changes, duplicate bank accounts, missing PF or tax jumps." />}
        </Paper>
      )}
      {tab === "checks" && <Paper>{after.length ? <ul className="divide-y divide-line">{after.map((f) => <FindingCard key={f.key} f={f} ack={run.acknowledgements[f.key]} />)}</ul> : <EmptyState icon={CheckCircle2} title="No problems found" />}</Paper>}
      {tab === "variance" && (variance ? (
        <Paper>
          <PaperHeader title={variance.previous_run ? `Compared with ${variance.previous_run.title}` : "No earlier pay run to compare with"} />
          <ul className="divide-y divide-line">{variance.people.slice(0, 40).map((p: any) => (
            <li key={p.employee_id} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-5 px-5 py-2.5 text-[13.5px]">
              <span className="truncate text-ink">{p.employee_name}{p.note ? <span className="text-faint"> · {p.note}</span> : null}</span>
              <span className="tabular text-faint">{inr(p.previous_net)}</span><span className="tabular text-ink">{inr(p.net)}</span>
              <span className={`tabular w-24 text-right ${Number(p.change) > 0 ? "text-emerald-700" : Number(p.change) < 0 ? "text-rose-700" : "text-faint"}`}>{inr(p.change, { sign: true })}</span>
            </li>))}</ul>
        </Paper>
      ) : <Paper className="p-8 text-center text-muted">Loading…</Paper>)}
      {tab === "components" && (
        <Paper>
          <ul className="divide-y divide-line">{(run.totals.by_component ?? []).map((c: any) => (
            <li key={c.code} className="flex items-center justify-between px-5 py-2.5 text-[13.5px]"><span className="text-ink/85">{c.name} <span className="text-faint">· {c.kind}</span></span><span className="tabular text-ink">{inr(c.amount)}</span></li>
          ))}</ul>
        </Paper>
      )}
      {editable && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" icon={Undo2} onClick={() => act("checks")}>Back to inputs</Button>
          <Button variant="secondary" icon={RefreshCw} onClick={() => act("calculate", undefined, "Recalculating")}>Recalculate</Button>
          <Button variant="primary" icon={Send} disabled={!run.can_submit} onClick={() => act("submit", undefined, "Sent for approval")}>Send for approval</Button>
        </div>
      )}
      {editable && run.blocking.length > 0 && <p className="text-right text-[13px] text-rose-700">Fix or acknowledge the blocking findings first.</p>}
      <PayslipModal uuid={open} open={!!open} onClose={() => setOpen(null)} admin onChanged={() => { load(); onChanged(); }} />
    </div>
  );
}

/* ── Approve ────────────────────────────────────────────────────── */

function ApproveStep({ run, act, onChanged, canApprove }: { run: Run; act: Act; onChanged: () => void; canApprove: boolean }) {
  const toast = useToast();
  const [comment, setComment] = useState("");
  async function decide(task: string, decision: "approve" | "reject") {
    try { await api.post(`/workflow/tasks/${task}/decision`, { decision, comment: comment || undefined }); toast.success(decision === "approve" ? "Approved" : "Sent back"); onChanged(); }
    catch (e) { toast.error(errMsg(e)); }
  }
  if (!["pending_approval", "approved"].includes(run.status)) return <Paper><EmptyState icon={Send} title="Not sent for approval yet" hint="Review the run, then send it for approval." /></Paper>;
  const mine = run.approval?.steps.find((s) => s.mine);
  return (
    <div className="space-y-5">
      <Totals t={run.totals} />
      <Paper>
        <PaperHeader title={run.approval?.reference ? `Approval ${run.approval.reference}` : "Approval"} action={<StatusPill status={run.approval?.status ?? run.status} />} />
        <ul className="divide-y divide-line">
          {(run.approval?.steps ?? []).map((s) => (
            <li key={s.uuid} className="flex items-center gap-3 px-5 py-3">
              {s.status === "approved" ? <CheckCircle2 size={18} strokeWidth={1.4} className="text-emerald-600" /> : s.status === "rejected" ? <XCircle size={18} strokeWidth={1.4} className="text-rose-600" /> : <span className="h-[18px] w-[18px] rounded-full border border-line-strong" />}
              <div className="flex-1"><p className="text-[14px] text-ink">{s.name}</p><p className="text-[12.5px] text-faint">{s.decided_by ?? s.approver ?? "—"}{s.comment ? ` · ${s.comment}` : ""}</p></div>
              <StatusPill status={s.status} />
            </li>
          ))}
          {!run.approval && <li className="px-5 py-3 text-[13.5px] text-muted">Approved without a flow.</li>}
        </ul>
        {mine && (
          <div className="space-y-3 border-t border-line p-5">
            <Field label="Comment"><Textarea value={comment} onValueChange={setComment} rows={2} /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => decide(mine.uuid, "reject")}>Send back</Button>
              <Button variant="primary" icon={CheckCircle2} onClick={() => decide(mine.uuid, "approve")}>Approve</Button>
            </div>
          </div>
        )}
      </Paper>
      {run.status === "approved" && canApprove && <div className="flex justify-end"><Button variant="primary" icon={Lock} onClick={() => act("lock", undefined, "Pay run locked")}>Lock pay run</Button></div>}
    </div>
  );
}

/* ── Lock and pay ───────────────────────────────────────────────── */

function PayStep({ run, act, canReopen, canApprove }: { run: Run; act: Act; canReopen: boolean; canApprove: boolean }) {
  const toast = useToast();
  const [paidOpen, setPaidOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [reason, setReason] = useState("");
  const [publishing, setPublishing] = useState(false);
  const dl = (path: string, name: string) => downloadWithAuth(path, name).catch((e) => toast.error(errMsg(e)));
  const files = useMemo(() => [
    { key: "ecr", label: "PF return (ECR)", hint: "EPFO text file" }, { key: "ecr_arrears", label: "PF arrears (ECR)", hint: "Only when arrears were paid" },
    { key: "esi", label: "ESI monthly file", hint: "Excel for the ESIC portal" }, { key: "pt", label: "Professional Tax return", hint: "By state and slab" },
    { key: "lwf", label: "Labour Welfare Fund", hint: "In collection months" }, { key: "journal_csv", label: "Journal (CSV)", hint: "By GL code and cost centre" },
    { key: "tally", label: "Tally import (XML)", hint: "Journal voucher" }, { key: "wage_register", label: "Register of wages", hint: "Code on Wages" },
  ], []);
  if (!["locked", "paid"].includes(run.status)) return <Paper><EmptyState icon={Lock} title="Lock the pay run first" hint="Files and payslips are made from the locked run." /></Paper>;
  return (
    <div className="space-y-5">
      <Totals t={run.totals} />
      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <Paper>
          <PaperHeader title="Pay salaries" action={run.status === "paid" ? <StatusPill status="paid" /> : null} />
          <div className="space-y-4 p-5">
            <BankFilesPanel runUuid={run.uuid} heldCount={Number(run.totals.held_count) || 0} />
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button variant="primary" icon={Send} loading={publishing} onClick={async () => {
                setPublishing(true);
                try { const r = await api.post<{ published: number; emailed: number }>(`/payroll/runs/${run.uuid}/publish`); toast.success(`${r.published} payslips published`, { description: `${r.emailed} emailed with a password` }); }
                catch (e) { toast.error(errMsg(e)); } finally { setPublishing(false); }
              }}>Publish payslips</Button>
              {run.status !== "paid" && canApprove && <Button variant="secondary" icon={Wallet} onClick={() => setPaidOpen(true)}>Mark as paid</Button>}
              {canReopen && run.status === "locked" && <Button variant="ghost" icon={Undo2} onClick={() => setReopenOpen(true)}>Reopen</Button>}
            </div>
          </div>
        </Paper>
        <Paper>
          <PaperHeader title="Statutory and accounting files" />
          <ul className="divide-y divide-line">
            {files.map((f) => (
              <li key={f.key} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div><p className="text-[14px] text-ink">{f.label}</p><p className="text-[12.5px] text-faint">{f.hint}</p></div>
                <Button size="sm" variant="ghost" icon={Download} onClick={() => dl(`/payroll/runs/${run.uuid}/files/${f.key}`, f.key)}>Download</Button>
              </li>
            ))}
          </ul>
        </Paper>
      </div>
      <Modal open={paidOpen} onClose={() => setPaidOpen(false)} size="sm" title="Mark salaries as paid"
        footer={<><ModalCancel /><Button variant="primary" onClick={async () => { if (await act("paid", { reference: ref }, "Marked as paid")) setPaidOpen(false); }}>Mark paid</Button></>}>
        <Field label="Bank reference" hint="Batch or UTR number from the bank"><TextInput value={ref} onValueChange={setRef} /></Field>
      </Modal>
      <Modal open={reopenOpen} onClose={() => setReopenOpen(false)} size="sm" title="Reopen this pay run?" description="Loan instalments and expense payments are undone. The reason is kept in the audit log."
        footer={<><ModalCancel /><Button variant="danger" disabled={reason.trim().length < 3} onClick={async () => { if (await act("reopen", { reason }, "Pay run reopened")) setReopenOpen(false); }}>Reopen</Button></>}>
        <Field label="Reason" required><Textarea value={reason} onValueChange={setReason} rows={3} /></Field>
      </Modal>
    </div>
  );
}

function History({ run }: { run: Run }) {
  const label: Record<string, string> = { opened: "Opened", inputs_synced: "Inputs refreshed", inputs_uploaded: "Inputs uploaded", checked: "Checked", reminders_sent: "Reminders sent", calculated: "Calculated", submitted: "Sent for approval", approved: "Approved", rejected: "Sent back", locked: "Locked", reopened: "Reopened", paid: "Paid", cancelled: "Cancelled" };
  return (
    <details className="mt-6">
      <summary className="cursor-pointer text-[13px] text-muted hover:text-ink">History ({run.history.length})</summary>
      <ul className="mt-3 space-y-1.5">
        {[...run.history].reverse().map((h, i) => (
          <li key={i} className="flex flex-wrap gap-x-2 text-[13px]"><span className="text-ink">{label[h.stage] ?? h.stage}</span><span className="text-faint">· {h.by} · {formatDateTime(h.at)}</span>{h.note && <span className="text-muted">· {h.note}</span>}</li>
        ))}
      </ul>
    </details>
  );
}

void FormGrid;
