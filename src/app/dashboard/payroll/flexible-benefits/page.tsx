"use client";

/*
 * Flexible benefit plan for payroll: bills waiting for verification (a row opens the bill
 * beside the employee's ledger; accept in full, in part or not at all), everyone's split for
 * the year, and the plan's windows. Approved bills are paid with the next salary.
 * ?view=<claim uuid> deep-links.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Lock, Receipt, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Avatar, Button, DataTable, Field, FilterBar, Modal, NumberInput, Select, StatCard, Tabs, Textarea, useConfirm, type Column, type FilterValues } from "@/components/ui-kit";
import { Row, currentFY, errMsg, fyOptions, inr, type Page } from "@/components/payroll/common";
import { BillPreview, ClaimStatus, type FbpClaim, type FbpSummary } from "@/components/payroll/fbp";

type Decl = { uuid: string; employee_name: string; employee_code: string | null; allocation: Record<string, string>; total: string; status: string };

export default function FlexibleBenefitsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") ?? "bills";
  const [fy, setFy] = useState<string | null>(currentFY());
  const go = (t: string) => router.replace(`/dashboard/payroll/flexible-benefits${t === "bills" ? "" : `?tab=${t}`}`, { scroll: false });
  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Flexible benefits" description="Employees split part of their salary among tax-saving benefits and claim them with bills. Unclaimed amounts are paid as taxable pay at the year end."
        actions={<div className="w-40"><Select value={fy} onChange={setFy} options={fyOptions()} /></div>} />
      <Tabs value={tab} onChange={go} className="mb-5" items={[{ value: "bills", label: "Bills" }, { value: "splits", label: "Employee splits" }]} />
      {tab === "bills" ? <Bills fy={fy!} /> : <Splits fy={fy!} />}
    </div>
  );
}

function Bills({ fy }: { fy: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [filters, setFilters] = useState<FilterValues>({ status: ["submitted"] });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<(Page<FbpClaim> & { waiting: { count: number; amount: string } }) | null>(null);
  const viewing = params.get("view");
  const setViewing = (u: string | null) => router.replace(`/dashboard/payroll/flexible-benefits${u ? `?view=${u}` : ""}`, { scroll: false });
  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page), size: "25", fy });
    if (filters.status?.length) qs.set("status", filters.status.join(","));
    if (q) qs.set("q", q);
    api.get<typeof data>(`/payroll/fbp/claims?${qs}`).then(setData).catch((e) => toast.error(errMsg(e)));
  }, [page, q, filters, fy, toast]);
  useEffect(() => { load(); }, [load]);
  const columns: Column<FbpClaim>[] = [
    { key: "who", header: "Employee", cell: (c) => <span className="flex items-center gap-3"><Avatar name={c.employee_name ?? ""} size={30} /><span><span className="block text-ink">{c.employee_name}</span><span className="block text-[12.5px] text-faint">{c.component_name}</span></span></span> },
    { key: "date", header: "Bill date", hideBelow: "md", cell: (c) => <span className="text-muted">{formatDate(c.bill_date)}{c.vendor ? ` · ${c.vendor}` : ""}</span> },
    { key: "amt", header: "Amount", align: "right", cell: (c) => <span className="tabular text-ink">{inr(c.amount)}</span> },
    { key: "ok", header: "Approved", align: "right", hideBelow: "sm", cell: (c) => <span className="tabular text-muted">{c.approved_amount !== null ? inr(c.approved_amount) : "—"}</span> },
    { key: "st", header: "Status", cell: (c) => <ClaimStatus c={c} /> },
  ];
  return (
    <>
      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <StatCard label="Bills to verify" value={data?.waiting.count ?? "—"} icon={Receipt} />
        <StatCard label="Amount waiting" value={data ? inr(data.waiting.amount) : "—"} />
      </div>
      <FilterBar search={q} onSearchChange={(v) => { setQ(v); setPage(1); }} searchPlaceholder="Search people" values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[{ key: "status", label: "Status", multiple: true, options: [{ value: "submitted", label: "To verify" }, { value: "approved", label: "Approved" },
          { value: "partly_approved", label: "Partly approved" }, { value: "rejected", label: "Rejected" }, { value: "paid", label: "Paid" }] }]} />
      <DataTable rows={data?.items ?? []} rowKey={(c) => c.uuid} columns={columns} loading={!data} onRowClick={(c) => setViewing(c.uuid)}
        pagination={data ? { page: data.page, size: data.size, total: data.total, onPageChange: setPage } : undefined}
        emptyIcon={Receipt} emptyTitle="No bills here" emptyHint="Bills employees send from My pay appear here for checking." />
      <VerifyModal uuid={viewing} onClose={() => setViewing(null)} onDone={load} />
    </>
  );
}

function VerifyModal({ uuid, onClose, onDone }: { uuid: string | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [c, setC] = useState<(FbpClaim & { ledger: FbpSummary }) | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!uuid) return;
    setC(null);
    api.get<FbpClaim & { ledger: FbpSummary }>(`/payroll/fbp/claims/${uuid}`).then((x) => { setC(x); setAmount(Number(x.approved_amount ?? x.amount)); setComment(x.hr_comment ?? ""); }).catch((e) => toast.error(errMsg(e)));
  }, [uuid, toast]);
  async function verify(value: number) {
    setBusy(true);
    try { await api.post(`/payroll/fbp/claims/${uuid}/verify`, { approved_amount: value, comment: comment || null }); toast.success(value ? "Bill accepted" : "Bill not accepted"); onDone(); onClose(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  const row = c?.ledger.components.find((x) => x.code === c.component_code);
  const open = c && ["submitted", "approved", "partly_approved"].includes(c.status) && Number(c.paid_amount) === 0;
  return (
    <Modal open={!!uuid} onClose={onClose} size="xl" busy={busy} title={c ? `${c.employee_name} · ${c.component_name}` : "Bill"}
      description={c ? `${formatDate(c.bill_date)}${c.bill_number ? ` · bill ${c.bill_number}` : ""}${c.vendor ? ` · ${c.vendor}` : ""}` : undefined}
      headerActions={c && <ClaimStatus c={c} />}
      footer={open && (<>
        <Button variant="ghost" icon={XCircle} disabled={!comment.trim()} loading={busy} onClick={() => verify(0)}>Not accepted</Button>
        <Button variant="primary" icon={CheckCircle2} loading={busy} disabled={amount === null} onClick={() => verify(amount ?? 0)}>Accept {amount !== null ? inr(amount) : ""}</Button>
      </>)}>
      {!c ? <p className="py-10 text-center text-muted">Loading…</p> : (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-3">{c.file_ids.map((f) => <BillPreview key={f} fileId={f} />)}</div>
          <div className="space-y-5">
            <div className="divide-y divide-line rounded-xl border border-line px-4">
              <Row label="Bill amount" value={inr(c.amount)} strong />
              {row && <Row label="Allocated this year" value={inr(row.allocated)} />}
              {row && <Row label="Already approved" value={inr(row.approved)} />}
              {row && <Row label="Paid so far" value={inr(row.paid)} />}
              {row && <Row label="Tax-free in" value={row.tax_free_regimes.length === 2 ? "Both regimes" : row.tax_free_regimes.includes("old") ? "Old regime only" : "Neither"} />}
            </div>
            {open && (<>
              <Field label="Accept" hint="Less than the bill if part of it is not allowed"><NumberInput value={amount} onChange={setAmount} min={0} max={Number(c.amount)} /></Field>
              <Field label="Note to the employee" hint="Needed when a bill is not accepted"><Textarea value={comment} onValueChange={setComment} rows={3} /></Field>
            </>)}
            {!open && c.hr_comment && <p className="text-[13.5px] text-muted">{c.hr_comment}</p>}
            {c.verified_by_name && <p className="text-[12.5px] text-faint">Checked by {c.verified_by_name}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Splits({ fy }: { fy: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<{ items: Decl[]; components: { code: string; name: string }[]; window: FbpSummary["window"] } | null>(null);
  const load = useCallback(() => { api.get<typeof data>(`/payroll/fbp/declarations?fy=${fy}`).then(setData).catch((e) => toast.error(errMsg(e))); }, [fy, toast]);
  useEffect(() => { load(); }, [load]);
  async function lock() {
    if (!(await confirm({ title: "Lock the splits?", message: "Employees will not be able to change their split for this year.", confirmLabel: "Lock" }))) return;
    try { const r = await api.post<{ locked: number }>(`/payroll/fbp/declarations/lock?fy=${fy}`); toast.success(`${r.locked} splits locked`); load(); } catch (e) { toast.error(errMsg(e)); }
  }
  const comps = data?.components ?? [];
  const columns: Column<Decl>[] = [
    { key: "who", header: "Employee", cell: (d) => <div><p className="text-ink">{d.employee_name}</p><p className="text-[12.5px] text-faint">{d.employee_code}</p></div> },
    ...comps.map((c) => ({ key: c.code, header: c.name.replace(" (flexible)", ""), align: "right" as const, hideBelow: "md" as const, cell: (d: Decl) => <span className="tabular text-muted">{d.allocation[c.code] ? inr(d.allocation[c.code]) : "—"}</span> })),
    { key: "total", header: "Yearly amount", align: "right", cell: (d) => <span className="tabular text-ink">{inr(d.total)}</span> },
    { key: "st", header: "Status", cell: (d) => <span className="text-muted">{d.status === "draft" ? "Not chosen" : d.status === "locked" ? "Locked" : "Chosen"}</span> },
  ];
  return (
    <>
      {data && (
        <Paper className="mb-5">
          <PaperHeader title="Window" action={<Button size="sm" variant="secondary" icon={Lock} onClick={lock}>Lock splits</Button>} />
          <p className="px-5 py-4 text-[13.5px] text-muted">Employees choose between {formatDate(data.window.declaration_from)} and {formatDate(data.window.declaration_to)} ({data.window.declaration_open ? "open now" : "closed"}). Bills are accepted until {formatDate(data.window.claim_last_date)}. Change the dates in Payroll settings.</p>
        </Paper>
      )}
      <DataTable rows={data?.items ?? []} rowKey={(d) => d.uuid} columns={columns} loading={!data} emptyIcon={Receipt} emptyTitle="No splits yet" emptyHint="A split is made when an employee opens Flexible benefits in My pay." />
    </>
  );
}
