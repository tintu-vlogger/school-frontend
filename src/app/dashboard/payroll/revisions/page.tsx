"use client";

/*
 * Salary revisions: increments and promotions released by pay reviews (and revisions typed
 * in here) wait for payroll's review. A row opens the revision: current and new CTC, the new
 * split with the employee's structure and the arrears for months already paid. Apply writes
 * the effective-dated salary (the next pay run adds the arrears); reject needs a reason.
 * ?view=<uuid> deep-links.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Plus, TrendingUp, Undo2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, Modal, ModalCancel, NumberInput, Select, StatCard,
  Textarea, type Column, type FilterValues,
} from "@/components/ui-kit";
import { Row, StatusPill, can, errMsg, inr, loadPayrollEmployees, monthLabel, usePayrollAccess } from "@/components/payroll/common";

type Rev = {
  uuid: string; employee_id: number; employee_uuid: string; employee_name: string; employee_code: string | null; source: string;
  source_label: string; reason: string; effective_from: string; current_ctc: string; new_ctc: string; change: string;
  change_percent: string | null; arrears_estimate: string; structure_name: string | null; note: string | null; status: string;
  status_label: string; decided_by_name: string | null; decided_at: string | null; decision_note: string | null;
};
type Detail = Rev & {
  current_components: { code: string; name: string; kind: string; monthly: string }[];
  estimate: { months: { month: string; should: string; paid: string; difference: string }[]; total: string; monthly_gross: string;
    components: { code: string; name: string; kind: string; monthly: string }[]; warnings: { message: string }[] } | null;
  estimate_error?: string;
};
const TONE: Record<string, "warn" | "good" | "bad"> = { pending: "warn", applied: "good", rejected: "bad" };
const REASONS: Record<string, string> = { annual_raise: "Annual raise", promotion: "Promotion", correction: "Correction",
  market_adjustment: "Market adjustment", transfer: "Transfer", first_salary: "First salary" };

export default function RevisionsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const access = usePayrollAccess();
  const [filters, setFilters] = useState<FilterValues>({ status: ["pending"] });
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ items: Rev[]; summary: { pending: number; arrears: string; yearly_change: string } } | null>(null);
  const [selected, setSelected] = useState<(string | number)[]>([]);
  const [adding, setAdding] = useState(false);
  const viewing = params.get("view");
  const setViewing = (u: string | null) => router.replace(`/dashboard/payroll/revisions${u ? `?view=${u}` : ""}`, { scroll: false });
  const canEdit = can(access, "payroll.salaries.manage");

  const load = useCallback(() => {
    const qs = new URLSearchParams();
    if (filters.status?.length) qs.set("status", filters.status.join(","));
    if (q) qs.set("q", q);
    api.get<typeof data>(`/payroll/revisions?${qs}`).then(setData).catch((e) => toast.error(errMsg(e)));
  }, [filters, q, toast]);
  useEffect(() => { load(); }, [load]);

  async function applyMany(rows: Rev[], clear: () => void) {
    try {
      const r = await api.post<{ applied: number; failed: { employee: string; reason: string }[] }>("/payroll/revisions/apply-many", { uuids: rows.map((x) => x.uuid) });
      toast.success(`${r.applied} revision${r.applied === 1 ? "" : "s"} applied`, r.failed.length ? { description: r.failed.map((f) => `${f.employee}: ${f.reason}`).join("; ") } : undefined);
      clear(); load();
    } catch (e) { toast.error(errMsg(e)); }
  }

  const columns: Column<Rev>[] = [
    { key: "who", header: "Employee", cell: (r) => (
      <span className="flex min-w-0 items-center gap-3"><Avatar name={r.employee_name} size={30} />
        <span className="min-w-0"><span className="block truncate text-ink">{r.employee_name}</span>
          <span className="block truncate text-[12.5px] text-faint">{[r.employee_code, REASONS[r.reason] ?? r.reason, r.source_label].filter(Boolean).join(" · ")}</span></span></span>) },
    { key: "from", header: "From", cell: (r) => <span className="text-muted">{formatDate(r.effective_from)}</span> },
    { key: "ctc", header: "New CTC", align: "right", cell: (r) => (
      <div className="text-right"><p className="tabular text-ink">{inr(r.new_ctc)}</p>
        <p className="tabular text-[12.5px] text-faint">{inr(r.current_ctc)}{r.change_percent ? ` · ${Number(r.change_percent) >= 0 ? "+" : ""}${r.change_percent}%` : ""}</p></div>) },
    { key: "arrears", header: "Arrears", align: "right", hideBelow: "md", cell: (r) => Number(r.arrears_estimate) ? <span className="tabular text-ink/85">{inr(r.arrears_estimate)}</span> : <span className="text-faint">None</span> },
    { key: "status", header: "Status", cell: (r) => <Badge tone={TONE[r.status] ?? "neutral"} dot>{r.status_label}</Badge> },
  ];

  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Salary revisions" description="Increments and promotions from pay reviews, checked by payroll before they reach pay. Arrears for paid months follow in the next pay run."
        actions={canEdit && <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>New revision</Button>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Waiting for review" value={data?.summary.pending ?? "—"} icon={TrendingUp} />
        <StatCard label="Arrears they would pay" value={data ? inr(data.summary.arrears) : "—"} hint="For months already paid" />
        <StatCard label="Change in yearly cost" value={data ? inr(data.summary.yearly_change) : "—"} hint="Sum of CTC increases" />
      </div>
      <FilterBar search={q} onSearchChange={setQ} searchPlaceholder="Search people" values={filters} onChange={setFilters}
        filters={[{ key: "status", label: "Status", multiple: true, options: [{ value: "pending", label: "Waiting for review" }, { value: "applied", label: "Applied" }, { value: "rejected", label: "Rejected" }] }]} />
      <DataTable rows={data?.items ?? []} rowKey={(r) => r.uuid} columns={columns} loading={!data} onRowClick={(r) => setViewing(r.uuid)}
        selectable={canEdit} selected={selected} onSelectedChange={setSelected}
        bulkActions={canEdit ? [{ label: "Apply", icon: CheckCircle2, onSelect: (rows, clear) => applyMany(rows.filter((x) => x.status === "pending"), clear) }] : undefined}
        emptyIcon={TrendingUp} emptyTitle="Nothing to review" emptyHint="Released pay reviews appear here on their effective date." />
      <RevisionModal uuid={viewing} onClose={() => setViewing(null)} onChanged={load} canEdit={canEdit} />
      <NewRevision open={adding} onClose={() => setAdding(false)} onCreated={(r) => { setAdding(false); load(); setViewing(r.uuid); }} />
    </div>
  );
}

function RevisionModal({ uuid, onClose, onChanged, canEdit }: { uuid: string | null; onClose: () => void; onChanged: () => void; canEdit: boolean }) {
  const toast = useToast();
  const [r, setR] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!uuid) return;
    setR(null);
    api.get<Detail>(`/payroll/revisions/${uuid}`).then(setR).catch((e) => toast.error(errMsg(e)));
  }, [uuid, toast]);
  async function act(path: "apply" | "reject", body: unknown) {
    setBusy(true);
    try { await api.post(`/payroll/revisions/${uuid}/${path}`, body); toast.success(path === "apply" ? "Salary revised" : "Revision rejected"); onChanged(); onClose(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  const cur = Object.fromEntries((r?.current_components ?? []).map((c) => [c.code, c]));
  const next = r?.estimate?.components.filter((c) => ["earning", "reimbursement", "employer"].includes(c.kind) && Number(c.monthly)) ?? [];
  return (
    <Modal open={!!uuid} onClose={onClose} size="lg" busy={busy} title={r ? r.employee_name : "Salary revision"}
      description={r ? `${REASONS[r.reason] ?? r.reason} from ${formatDate(r.effective_from)} · ${r.source_label}` : undefined}
      headerActions={r && <StatusPill status={r.status === "pending" ? "pending" : r.status === "applied" ? "approved" : "rejected"} label={r.status_label} />}
      footer={r && canEdit && r.status === "pending" && (<>
        <Button variant="ghost" icon={XCircle} onClick={() => setRejecting(true)}>Reject</Button>
        <Button variant="primary" icon={CheckCircle2} loading={busy} onClick={() => act("apply", {})}>Apply to payroll</Button>
      </>)}>
      {!r ? <p className="py-10 text-center text-muted">Loading…</p> : (
        <div className="space-y-6">
          <div className="grid gap-3 rounded-xl bg-sunken/60 p-4 sm:grid-cols-3">
            <div><p className="text-[12px] text-muted">Current CTC</p><p className="tabular text-[19px] font-light text-ink">{inr(r.current_ctc)}</p></div>
            <div><p className="text-[12px] text-muted">New CTC</p><p className="tabular text-[19px] font-light text-primary">{inr(r.new_ctc)}</p><p className="text-[12px] text-faint">{r.change_percent ? `${Number(r.change_percent) >= 0 ? "+" : ""}${r.change_percent}%` : ""}</p></div>
            <div><p className="text-[12px] text-muted">Arrears</p><p className="tabular text-[19px] font-light text-ink">{inr(r.estimate?.total ?? r.arrears_estimate)}</p><p className="text-[12px] text-faint">In the next pay run</p></div>
          </div>
          {r.estimate_error && <p className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[13px] text-amber-800">{r.estimate_error}</p>}
          {r.estimate && (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="mb-1 text-[12px] uppercase tracking-[0.06em] text-faint">Monthly split{r.structure_name ? ` · ${r.structure_name}` : ""}</p>
                <div className="divide-y divide-line">
                  {next.map((c) => <Row key={c.code} label={c.name} sub={cur[c.code] ? `Was ${inr(cur[c.code].monthly)}` : "New"} value={inr(c.monthly)} />)}
                  <Row label="Monthly gross" value={inr(r.estimate.monthly_gross)} strong />
                </div>
              </div>
              <div>
                <p className="mb-1 text-[12px] uppercase tracking-[0.06em] text-faint">Arrears for paid months</p>
                {r.estimate.months.length ? (
                  <div className="divide-y divide-line">{r.estimate.months.map((m) => <Row key={m.month} label={monthLabel(m.month)} sub={`Paid ${inr(m.paid)}, due ${inr(m.should)}`} value={inr(m.difference)} />)}</div>
                ) : <p className="py-2 text-[13.5px] text-muted">No paid month is affected.</p>}
                {r.estimate.warnings.map((w, i) => <p key={i} className="mt-2 text-[12.5px] text-amber-700">{w.message}</p>)}
              </div>
            </div>
          )}
          {r.note && <p className="text-[13.5px] text-muted">{r.note}</p>}
          {r.status !== "pending" && <p className="text-[13px] text-faint">{r.status_label} by {r.decided_by_name}{r.decided_at ? ` on ${formatDate(r.decided_at)}` : ""}{r.decision_note ? `: ${r.decision_note}` : ""}</p>}
        </div>
      )}
      <Modal open={rejecting} onClose={() => setRejecting(false)} size="sm" title="Reject revision" zIndex={60}
        footer={<><ModalCancel /><Button variant="danger" icon={Undo2} disabled={!note.trim()} loading={busy} onClick={() => act("reject", { note })}>Reject</Button></>}>
        <Field label="Reason" required><Textarea value={note} onValueChange={setNote} rows={3} /></Field>
      </Modal>
    </Modal>
  );
}

function NewRevision({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (r: Rev) => void }) {
  const toast = useToast();
  const [emp, setEmp] = useState<string | null>(null);
  const [ctc, setCtc] = useState<number | null>(null);
  const [from, setFrom] = useState("");
  const [reason, setReason] = useState<string | null>("annual_raise");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { onCreated(await api.post<Rev>("/payroll/revisions", { employee_uuid: emp, new_ctc: ctc, effective_from: from, reason })); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title="New salary revision" busy={busy}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} disabled={!emp || !ctc || !from} onClick={save}>Add for review</Button></>}>
      <div className="space-y-5">
        <Field label="Employee" required><Select value={emp} onChange={setEmp} loadOptions={loadPayrollEmployees} placeholder="Search" /></Field>
        <FormGrid>
          <Field label="New annual CTC" required><NumberInput value={ctc} onChange={setCtc} min={0} /></Field>
          <Field label="From" required><DateInput value={from} onChange={setFrom} /></Field>
        </FormGrid>
        <Field label="Reason"><Select value={reason} onChange={setReason} options={Object.entries(REASONS).filter(([k]) => k !== "first_salary").map(([value, label]) => ({ value, label }))} /></Field>
      </div>
    </Modal>
  );
}
