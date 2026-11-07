"use client";

/*
 * Loans and advances (HR): every loan with balance and status, and the loan types with
 * eligibility, limits, interest and instalments. ?view=<uuid> opens a loan.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HandCoins, Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import { Avatar, Badge, Button, DataTable, Field, FilterBar, FormGrid, Modal, ModalCancel, NumberInput, Select, StatCard, Tabs, TextInput, Textarea, Toggle, type Column, type FilterValues } from "@/components/ui-kit";
import { StatusPill, errMsg, inr, monthLabel } from "@/components/payroll/common";
import { LoanDetailModal, LoanRequestModal, type Loan } from "@/components/payroll/loan-modals";

export default function LoansPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const tab = params.get("tab") === "types" ? "types" : "loans";
  const [rows, setRows] = useState<Loan[] | null>(null);
  const [filters, setFilters] = useState<FilterValues>({});
  const [adding, setAdding] = useState(false);
  const viewing = params.get("view");
  useEffect(() => { api.get<{ can_manage: boolean }>("/loans/access").then((a) => { if (!a.can_manage) router.replace("/dashboard/payroll/me?tab=loans"); }).catch(() => {}); }, [router]);
  const load = useCallback(() => {
    api.get<{ items: Loan[] }>(`/loans?scope=all${filters.status?.length ? `&status=${filters.status.join(",")}` : ""}`).then((r) => setRows(r.items)).catch((e) => toast.error(errMsg(e)));
  }, [filters, toast]);
  useEffect(() => { load(); }, [load]);
  const active = rows?.filter((l) => l.status === "active") ?? [];
  const columns: Column<Loan>[] = [
    { key: "who", header: "Employee", cell: (l) => <span className="flex items-center gap-2"><Avatar name={l.employee_name ?? "?"} size={26} /><span className="text-ink">{l.employee_name}</span></span> },
    { key: "type", header: "Loan", cell: (l) => <div><p className="text-ink">{l.loan_type}</p><p className="text-[12.5px] text-faint">{l.number} · from {monthLabel(l.start_month)}</p></div> },
    { key: "amt", header: "Amount", align: "right", cell: (l) => <span className="tabular text-muted">{inr(l.principal)}</span> },
    { key: "emi", header: "Instalment", align: "right", hideBelow: "md", cell: (l) => <span className="tabular text-muted">{inr(l.emi)} × {l.instalments}</span> },
    { key: "bal", header: "Balance", align: "right", cell: (l) => <span className="tabular text-ink">{inr(l.outstanding)}</span> },
    { key: "st", header: "Status", cell: (l) => <StatusPill status={l.status} label={l.status_label} /> },
  ];
  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Loans and advances" description="Instalments are deducted in payroll; any balance is recovered in the final settlement."
        actions={tab === "loans" && <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add loan</Button>} />
      <Tabs value={tab} onChange={(t) => router.replace(`/dashboard/loans${t === "loans" ? "" : "?tab=types"}`, { scroll: false })} className="mb-5" items={[{ value: "loans", label: "Loans" }, { value: "types", label: "Loan types" }]} />
      {tab === "loans" ? (
        <>
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <StatCard label="Running" value={active.length} icon={HandCoins} />
            <StatCard label="Balance to recover" value={inr(active.reduce((a, l) => a + Number(l.outstanding), 0))} icon={HandCoins} />
            <StatCard label="Waiting" value={rows?.filter((l) => ["pending", "approved"].includes(l.status)).length ?? 0} hint="Approval or pay-out" icon={HandCoins} />
          </div>
          <FilterBar values={filters} onChange={setFilters} filters={[{ key: "status", label: "Status", multiple: true, options: [{ value: "pending", label: "Waiting" }, { value: "approved", label: "To pay out" }, { value: "active", label: "Running" }, { value: "closed", label: "Closed" }, { value: "rejected", label: "Rejected" }] }]} />
          <DataTable rows={rows ?? []} rowKey={(l) => l.uuid} columns={columns} loading={!rows} onRowClick={(l) => router.replace(`/dashboard/loans?view=${l.uuid}`, { scroll: false })}
            emptyIcon={HandCoins} emptyTitle="No loans" />
          <LoanRequestModal open={adding} forEmployee onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />
          <LoanDetailModal uuid={viewing} open={!!viewing} onClose={() => router.replace("/dashboard/loans", { scroll: false })} onChanged={load} />
        </>
      ) : <Types />}
    </div>
  );
}

type LT = { uuid: string; code: string; name: string; kind: string; description: string | null; max_amount: string | null; max_salary_multiple: string | null;
  max_instalments: number; interest_rate: string; interest_method: string; min_service_months: number; eligibility: string | null; max_active: number; medical: boolean; active: boolean };

function Types() {
  const toast = useToast();
  const [rows, setRows] = useState<LT[] | null>(null);
  const [form, setForm] = useState<{ open: boolean; target: LT | null; key: number }>({ open: false, target: null, key: 0 });
  const load = useCallback(() => { api.get<LT[]>("/loans/types").then(setRows).catch((e) => toast.error(errMsg(e))); }, [toast]);
  useEffect(() => { load(); }, [load]);
  const columns: Column<LT>[] = [
    { key: "name", header: "Type", cell: (t) => <div><p className="text-ink">{t.name}{!t.active && <span className="text-faint"> · off</span>}</p><p className="text-[12.5px] text-faint">{t.kind === "advance" ? "Advance" : "Loan"} · {t.code}</p></div> },
    { key: "max", header: "Up to", cell: (t) => <span className="text-muted">{[t.max_amount ? inr(t.max_amount) : null, t.max_salary_multiple ? `${Number(t.max_salary_multiple)} × gross` : null].filter(Boolean).join(" or ") || "No limit"}</span> },
    { key: "n", header: "Instalments", align: "right", cell: (t) => <span className="tabular text-muted">{t.max_instalments}</span> },
    { key: "rate", header: "Interest", align: "right", cell: (t) => Number(t.interest_rate) ? <span className="tabular text-muted">{t.interest_rate}% {t.interest_method}</span> : <Badge tone="good">Free</Badge> },
    { key: "svc", header: "Service needed", hideBelow: "md", cell: (t) => <span className="text-muted">{t.min_service_months ? `${t.min_service_months} months` : "None"}</span> },
  ];
  return (
    <>
      <div className="mb-3 flex justify-end"><Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, target: null, key: form.key + 1 })}>New loan type</Button></div>
      <DataTable rows={rows ?? []} rowKey={(t) => t.uuid} columns={columns} loading={!rows} onRowClick={(t) => setForm({ open: true, target: t, key: form.key + 1 })}
        rowActions={(t) => [{ label: "Edit", icon: Pencil, onSelect: () => setForm({ open: true, target: t, key: form.key + 1 }) }]} emptyIcon={HandCoins} emptyTitle="No loan types" />
      <TypeForm key={form.key} open={form.open} target={form.target} onClose={() => setForm({ ...form, open: false })} onSaved={() => { setForm({ ...form, open: false }); load(); }} />
    </>
  );
}

function TypeForm({ open, target, onClose, onSaved }: { open: boolean; target: LT | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<any>(target ? { ...target, max_amount: target.max_amount ? Number(target.max_amount) : null, max_salary_multiple: target.max_salary_multiple ? Number(target.max_salary_multiple) : null, interest_rate: Number(target.interest_rate) }
    : { kind: "loan", max_instalments: 12, interest_rate: 0, interest_method: "reducing", min_service_months: 0, max_active: 1, medical: false, active: true });
  const set = (k: string, x: unknown) => setV((o: any) => ({ ...o, [k]: x }));
  async function save() {
    try { if (target) await api.put(`/loans/types/${target.uuid}`, v); else await api.post("/loans/types", v); toast.success("Saved"); onSaved(); } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" title={target ? target.name : "New loan type"} dirty footer={<><ModalCancel /><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-5">
        <FormGrid columns={3}>
          <Field label="Name" required><TextInput value={v.name ?? ""} onValueChange={(x) => set("name", x)} /></Field>
          <Field label="Code" required><TextInput value={v.code ?? ""} disabled={!!target} onValueChange={(x) => set("code", x.toUpperCase())} /></Field>
          <Field label="Kind"><Select value={v.kind} onChange={(x) => set("kind", x)} options={[{ value: "loan", label: "Loan" }, { value: "advance", label: "Salary advance" }]} /></Field>
          <Field label="Most you can borrow (₹)"><NumberInput value={v.max_amount} onChange={(x) => set("max_amount", x)} /></Field>
          <Field label="Or times monthly gross"><NumberInput value={v.max_salary_multiple} onChange={(x) => set("max_salary_multiple", x)} step={0.5} /></Field>
          <Field label="Most instalments"><NumberInput value={v.max_instalments} onChange={(x) => set("max_instalments", x ?? 1)} min={1} /></Field>
          <Field label="Interest (% a year)"><NumberInput value={v.interest_rate} onChange={(x) => set("interest_rate", x ?? 0)} step={0.25} /></Field>
          <Field label="Interest worked on"><Select value={v.interest_method} onChange={(x) => set("interest_method", x)} options={[{ value: "reducing", label: "Reducing balance" }, { value: "flat", label: "Flat" }]} /></Field>
          <Field label="Months of service needed"><NumberInput value={v.min_service_months} onChange={(x) => set("min_service_months", x ?? 0)} /></Field>
        </FormGrid>
        <Field label="Eligibility rule" hint="Optional, e.g. employee.confirmed and employee.monthly_gross >= 25000"><TextInput value={v.eligibility ?? ""} onValueChange={(x) => set("eligibility", x || null)} className="font-mono" /></Field>
        <Field label="Description"><Textarea value={v.description ?? ""} onValueChange={(x) => set("description", x)} rows={2} /></Field>
        <FormGrid>
          <Toggle checked={!!v.medical} onChange={(x) => set("medical", x)} label="For medical treatment" description="No taxable benefit on low interest" />
          <Toggle checked={!!v.active} onChange={(x) => set("active", x)} label="In use" />
        </FormGrid>
      </div>
    </Modal>
  );
}
