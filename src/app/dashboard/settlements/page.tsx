"use client";

/*
 * Final settlements: every exit with the 2-working-day countdown (Code on Wages). New
 * settlement and the statement open in modals; the statement shows each line with its
 * workings, lets HR adjust inputs (leave days, notice, extra lines), send for approval,
 * pay and download the payslip-style statement. Approval makes an off-cycle pay run for the
 * person (bank file, PF/ESI/TDS like any run). ?view=<uuid> deep-links.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, Download, FileSignature, PlayCircle, Plus, RefreshCw, Send, Trash2, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, todayISO } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, IconButton, Modal, ModalCancel, NumberInput, Select, StatCard,
  TextInput, Toggle, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { Row, StatusPill, can, downloadWithAuth, errMsg, inr, usePayrollAccess } from "@/components/payroll/common";

type Line = { code: string; label: string; kind: string; amount: string; taxable: string; detail?: any; ref?: string | null };
type S = { uuid: string; number: string | null; employee_uuid: string; employee_name: string; employee_code: string | null; exit_kind: string;
  exit_kind_label: string; resignation_date: string | null; last_working_day: string; due_date: string; status: string; status_label: string;
  total_earnings: string; total_deductions: string; tax: string; net: string; paid_on: string | null; payment_ref: string | null;
  countdown: { days_left: number; state: string }; lines?: Line[]; notice?: any; inputs?: any; workings?: any;
  approval?: { status: string; steps: { uuid: string; name: string; status: string; approver: string | null; mine: boolean }[] };
  pay_run?: { uuid: string; number: string | null; status: string; title: string } | null };

const KINDS: SelectOption<string>[] = [
  { value: "resignation", label: "Resignation" }, { value: "termination", label: "Termination" }, { value: "retrenchment", label: "Retrenchment" },
  { value: "layoff", label: "Lay-off" }, { value: "closure", label: "Closure of business" }, { value: "retirement", label: "Retirement" },
  { value: "death", label: "Death" }, { value: "contract_end", label: "End of contract" }, { value: "absconding", label: "Absconding" },
];

function Countdown({ c, status }: { c: S["countdown"]; status: string }) {
  if (status === "paid") return <Badge tone={c.state === "on_time" ? "good" : "bad"} dot>{c.state === "on_time" ? "Paid on time" : "Paid late"}</Badge>;
  if (status === "cancelled") return <Badge>Cancelled</Badge>;
  const tone = c.state === "overdue" ? "bad" : c.state === "on_track" ? "neutral" : "warn";
  const text = c.state === "overdue" ? `Overdue by ${-c.days_left} day${c.days_left === -1 ? "" : "s"}` : c.state === "due_today" ? "Due today" : `${c.days_left} day${c.days_left === 1 ? "" : "s"} left`;
  return <Badge tone={tone} dot><Clock size={12} strokeWidth={1.6} className="mr-0.5" />{text}</Badge>;
}

export default function SettlementsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const access = usePayrollAccess();
  const [rows, setRows] = useState<S[] | null>(null);
  const [filters, setFilters] = useState<FilterValues>({ status: ["draft", "pending_approval", "approved"] });
  const [creating, setCreating] = useState(false);
  const viewing = params.get("view");
  const setViewing = (u: string | null) => router.replace(`/dashboard/settlements${u ? `?view=${u}` : ""}`, { scroll: false });
  const load = useCallback(() => {
    api.get<{ items: S[] }>(`/payroll/settlements${filters.status?.length ? `?status=${filters.status.join(",")}` : ""}`).then((r) => setRows(r.items)).catch((e) => toast.error(errMsg(e)));
  }, [filters, toast]);
  useEffect(() => { load(); }, [load]);
  const open = rows?.filter((r) => !["paid", "cancelled"].includes(r.status)) ?? [];
  const columns: Column<S>[] = [
    { key: "who", header: "Employee", cell: (s) => <span className="flex items-center gap-3"><Avatar name={s.employee_name} size={30} /><span><span className="block text-ink">{s.employee_name}</span><span className="block text-[12.5px] text-faint">{s.exit_kind_label}{s.number ? ` · ${s.number}` : ""}</span></span></span> },
    { key: "lwd", header: "Last day", hideBelow: "md", cell: (s) => <span className="text-muted">{formatDate(s.last_working_day)}</span> },
    { key: "due", header: "Pay by", cell: (s) => <div><p className="text-ink/85">{formatDate(s.due_date)}</p><Countdown c={s.countdown} status={s.status} /></div> },
    { key: "net", header: "Net", align: "right", cell: (s) => <span className={`tabular ${Number(s.net) < 0 ? "text-rose-700" : "text-ink"}`}>{inr(s.net)}</span> },
    { key: "status", header: "Status", cell: (s) => <StatusPill status={s.status} label={s.status_label} /> },
  ];
  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Final settlements" description="All dues paid within 2 working days of the last working day, as the Code on Wages requires."
        actions={can(access, "payroll.settlements.manage") && <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New settlement</Button>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Open settlements" value={open.length} icon={FileSignature} />
        <StatCard label="Due within a day" value={open.filter((s) => ["due_today", "due_soon"].includes(s.countdown.state)).length} icon={Clock} />
        <StatCard label="Overdue" value={open.filter((s) => s.countdown.state === "overdue").length} icon={Clock} />
      </div>
      <FilterBar values={filters} onChange={setFilters} filters={[{ key: "status", label: "Status", multiple: true, options: [
        { value: "draft", label: "Draft" }, { value: "pending_approval", label: "Waiting for approval" }, { value: "approved", label: "Approved" }, { value: "paid", label: "Paid" }, { value: "cancelled", label: "Cancelled" }] }]} />
      <DataTable rows={rows ?? []} rowKey={(s) => s.uuid} columns={columns} loading={!rows} onRowClick={(s) => setViewing(s.uuid)}
        emptyIcon={FileSignature} emptyTitle="No settlements" emptyHint="A draft is made automatically when someone's exit date arrives, or start one here." />
      <NewSettlement open={creating} onClose={() => setCreating(false)} onCreated={(s) => { setCreating(false); load(); setViewing(s.uuid); }} />
      <SettlementModal uuid={viewing} open={!!viewing} onClose={() => setViewing(null)} onChanged={load} canManage={can(access, "payroll.settlements.manage")} />
    </div>
  );
}

function NewSettlement({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (s: S) => void }) {
  const toast = useToast();
  const [cands, setCands] = useState<{ employee_uuid: string; name: string; exit_date: string; resignation_date: string | null }[]>([]);
  const [emp, setEmp] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>("resignation");
  const [lwd, setLwd] = useState("");
  const [resig, setResig] = useState("");
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState<SelectOption<string>[]>([]);
  useEffect(() => {
    if (!open) return;
    api.get<typeof cands>("/payroll/settlements/candidates").then(setCands).catch(() => {});
    api.get<{ items: { employee_uuid: string; name: string; employee_code: string | null }[] }>("/payroll/salaries?size=200&filter=assigned")
      .then((r) => setAll(r.items.map((x) => ({ value: x.employee_uuid, label: x.name, description: x.employee_code ?? undefined })))).catch(() => {});
  }, [open]);
  async function create() {
    setBusy(true);
    try { onCreated(await api.post<S>("/payroll/settlements", { employee_uuid: emp, exit_kind: kind, last_working_day: lwd, resignation_date: resig || undefined })); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title="New final settlement" busy={busy}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} disabled={!emp || !lwd} onClick={create}>Work it out</Button></>}>
      <div className="space-y-5">
        {cands.length > 0 && (
          <div className="rounded-xl border border-line p-3">
            <p className="mb-2 text-[12.5px] text-muted">Leaving soon</p>
            <div className="flex flex-wrap gap-2">{cands.map((c) => (
              <button key={c.employee_uuid} onClick={() => { setEmp(c.employee_uuid); setLwd(c.exit_date); setResig(c.resignation_date ?? ""); }}
                className={`rounded-full border px-3 py-1 text-[13px] ${emp === c.employee_uuid ? "border-primary text-primary" : "border-line text-ink/85 hover:border-line-strong"}`}>{c.name} · {formatDate(c.exit_date)}</button>))}</div>
          </div>
        )}
        <Field label="Employee" required><Select value={emp} onChange={setEmp} options={all} placeholder="Choose" /></Field>
        <Field label="Kind of exit" required><Select value={kind} onChange={setKind} options={KINDS} /></Field>
        <FormGrid>
          <Field label="Last working day" required><DateInput value={lwd} onChange={setLwd} /></Field>
          <Field label="Resignation date"><DateInput value={resig} onChange={setResig} /></Field>
        </FormGrid>
      </div>
    </Modal>
  );
}

function SettlementModal({ uuid, open, onClose, onChanged, canManage }: { uuid: string | null; open: boolean; onClose: () => void; onChanged: () => void; canManage: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const [s, setS] = useState<S | null>(null);
  const [inputs, setInputs] = useState<any>({});
  const [paying, setPaying] = useState(false);
  const [payRef, setPayRef] = useState("");
  const [payOn, setPayOn] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { if (uuid) api.get<S>(`/payroll/settlements/${uuid}`).then((x) => { setS(x); setInputs(x.inputs ?? {}); }).catch((e) => toast.error(errMsg(e))); }, [uuid, toast]);
  useEffect(() => { if (open) { setS(null); load(); } }, [open, load]);
  async function call(path: string, body?: unknown, ok?: string) {
    setBusy(true);
    try { const x = await api.post<S>(`/payroll/settlements/${uuid}/${path}`, body); setS(x); setInputs(x.inputs ?? {}); if (ok) toast.success(ok); onChanged(); return true; }
    catch (e) { toast.error(errMsg(e)); return false; } finally { setBusy(false); }
  }
  async function saveInputs() {
    setBusy(true);
    try { const x = await api.put<S>(`/payroll/settlements/${uuid}`, { inputs }); setS(x); toast.success("Worked out again"); onChanged(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function decide(task: string) {
    try { await api.post(`/workflow/tasks/${task}/decision`, { decision: "approve" }); toast.success("Approved"); load(); onChanged(); } catch (e) { toast.error(errMsg(e)); }
  }
  const earn = s?.lines?.filter((l) => l.kind === "earning") ?? [];
  const ded = s?.lines?.filter((l) => l.kind === "deduction") ?? [];
  const mine = s?.approval?.steps.find((x) => x.mine);
  const extras: { label: string; amount: number }[] = inputs.extra_earnings ?? [];
  const extraDed: { label: string; amount: number }[] = inputs.extra_deductions ?? [];
  return (
    <Modal open={open} onClose={onClose} size="xl" title={s ? `${s.employee_name} · ${s.exit_kind_label}` : "Final settlement"} busy={busy}
      description={s ? `Last working day ${formatDate(s.last_working_day)} · pay by ${formatDate(s.due_date)}` : undefined}
      headerActions={s && <Countdown c={s.countdown} status={s.status} />}
      footer={s && (
        <>
          <Button variant="ghost" icon={Download} onClick={() => downloadWithAuth(`/payroll/settlements/${s.uuid}/pdf`, "settlement.pdf").catch((e) => toast.error(errMsg(e)))}>Statement</Button>
          {canManage && s.status === "draft" && <Button variant="secondary" icon={RefreshCw} loading={busy} onClick={() => call("recompute", undefined, "Worked out again")}>Recalculate</Button>}
          {canManage && s.status === "draft" && <Button variant="primary" icon={Send} loading={busy} onClick={() => call("submit", undefined, "Sent for approval")}>Send for approval</Button>}
          {mine && <Button variant="primary" icon={CheckCircle2} onClick={() => decide(mine.uuid)}>Approve</Button>}
          {s.pay_run && <Button variant="secondary" icon={PlayCircle} onClick={() => router.push(`/dashboard/payroll/runs/${s.pay_run!.uuid}`)}>Pay run</Button>}
          {canManage && s.status === "approved" && !s.pay_run && <Button variant="secondary" icon={PlayCircle} loading={busy} onClick={() => call("pay-run", undefined, "Pay run made")}>Make pay run</Button>}
          {canManage && s.status === "approved" && <Button variant="primary" icon={Wallet} onClick={() => setPaying(true)}>Record payment</Button>}
        </>
      )}>
      {!s ? <p className="py-10 text-center text-muted">Loading…</p> : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-5">
            <div className="grid gap-3 rounded-xl bg-sunken/60 p-4 sm:grid-cols-3">
              <div><p className="text-[12px] text-muted">Payable</p><p className="tabular text-[19px] font-light text-ink">{inr(s.total_earnings)}</p></div>
              <div><p className="text-[12px] text-muted">Recovered (incl. tax {inr(s.tax)})</p><p className="tabular text-[19px] font-light text-ink">{inr(s.total_deductions)}</p></div>
              <div><p className="text-[12px] text-muted">Net settlement</p><p className={`tabular text-[19px] font-light ${Number(s.net) < 0 ? "text-rose-700" : "text-primary"}`}>{inr(s.net)}</p></div>
            </div>
            <div>
              <p className="mb-1 text-[12px] uppercase tracking-[0.06em] text-faint">Payable to the employee</p>
              <div className="divide-y divide-line">{earn.map((l, i) => <Row key={i} label={l.label} sub={l.code === "RESKILL" ? "Paid into the re-skilling fund, not to the employee" : Number(l.taxable) < Number(l.amount) ? `Taxable ${inr(l.taxable)}` : undefined} value={inr(l.amount)} />)}</div>
            </div>
            <div>
              <p className="mb-1 text-[12px] uppercase tracking-[0.06em] text-faint">Recovered</p>
              <div className="divide-y divide-line">{ded.length ? ded.map((l, i) => <Row key={i} label={l.label} value={inr(l.amount)} />) : <p className="py-2 text-[13.5px] text-muted">Nothing to recover</p>}</div>
            </div>
            {s.workings?.assets_not_returned?.length > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[13px] text-amber-800">Not returned yet: {s.workings.assets_not_returned.join(", ")}</p>}
          </div>
          <div className="space-y-4">
            {s.workings?.gratuity && (
              <div className="rounded-xl border border-line p-4 text-[13.5px]">
                <p className="mb-1 text-ink">Gratuity</p>
                <p className="text-muted">Service {s.workings.gratuity.service.years} years {s.workings.gratuity.service.months} months · {s.workings.gratuity.eligible ? `${s.workings.gratuity.years_counted} years counted at ${inr(s.workings.gratuity.wage)} × 15/26` : "Not eligible yet (5 years, 1 for fixed-term)"}</p>
              </div>
            )}
            {s.notice && <div className="rounded-xl border border-line p-4 text-[13.5px]"><p className="mb-1 text-ink">Notice</p><p className="text-muted">{s.notice.required_days} days required · {s.notice.served_days} served{s.notice.shortfall_days ? ` · ${s.notice.shortfall_days} days short` : ""}{s.notice.waived ? " · waived" : ""}</p></div>}
            {canManage && s.status === "draft" && (
              <div className="space-y-4 rounded-xl border border-line p-4">
                <p className="text-[14px] text-ink">Adjust</p>
                <Field label="Leave days to encash" hint="Empty: the balance on the last day"><NumberInput value={inputs.leave_days ?? null} onChange={(x) => setInputs({ ...inputs, leave_days: x })} step={0.5} /></Field>
                <Field label="Notice days short (resignation)"><NumberInput value={inputs.notice_shortfall_days ?? null} onChange={(x) => setInputs({ ...inputs, notice_shortfall_days: x })} /></Field>
                <Toggle checked={!!inputs.waive_notice} onChange={(x) => setInputs({ ...inputs, waive_notice: x })} label="Waive notice recovery" />
                <Field label="Bonus rate (%)"><NumberInput value={inputs.bonus_rate ?? null} onChange={(x) => setInputs({ ...inputs, bonus_rate: x })} min={8.33} max={20} step={0.01} /></Field>
                <ExtraLines title="Other earnings" rows={extras} onChange={(r) => setInputs({ ...inputs, extra_earnings: r })} />
                <ExtraLines title="Other recoveries" rows={extraDed} onChange={(r) => setInputs({ ...inputs, extra_deductions: r })} />
                <Button variant="secondary" className="w-full justify-center" loading={busy} onClick={saveInputs}>Apply changes</Button>
              </div>
            )}
            {s.status === "paid" && <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-[13.5px] text-emerald-800">Paid on {formatDate(s.paid_on!)} · {s.payment_ref}</div>}
          </div>
        </div>
      )}
      <Modal open={paying} onClose={() => setPaying(false)} size="sm" title="Record payment" zIndex={60}
        footer={<><ModalCancel /><Button variant="primary" disabled={!payRef} onClick={async () => { if (await call("pay", { reference: payRef, paid_on: payOn }, "Settlement paid")) setPaying(false); }}>Save</Button></>}>
        <div className="space-y-4">
          <Field label="Paid on"><DateInput value={payOn} onChange={setPayOn} /></Field>
          <Field label="Bank reference (UTR)" required><TextInput value={payRef} onValueChange={setPayRef} /></Field>
          <p className="text-[12.5px] text-muted">The settlement's pay run is locked and marked paid; loans, advances, asset recoveries and leave encashment are closed.</p>
        </div>
      </Modal>
    </Modal>
  );
}

function ExtraLines({ title, rows, onChange }: { title: string; rows: { label: string; amount: number }[]; onChange: (r: { label: string; amount: number }[]) => void }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between"><p className="text-[13px] text-muted">{title}</p>
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...rows, { label: "", amount: 0 }])}>Add</Button></div>
      {rows.map((r, i) => (
        <div key={i} className="mb-2 grid grid-cols-[1fr_110px_auto] gap-2">
          <TextInput value={r.label} onValueChange={(x) => onChange(rows.map((y, j) => (j === i ? { ...y, label: x } : y)))} placeholder="What" />
          <NumberInput value={r.amount} onChange={(x) => onChange(rows.map((y, j) => (j === i ? { ...y, amount: x ?? 0 } : y)))} />
          <IconButton icon={Trash2} label="Remove" size="sm" onClick={() => onChange(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
    </div>
  );
}
