"use client";

/*
 * Expenses (HR and finance): every claim with its status and policy warnings, advances to
 * pay and settle, and the categories with limits by grade, receipt rules, mileage rates and
 * tax treatment. Employees claim from My pay. ?view=<uuid> opens a claim.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Pencil, Plus, Receipt, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, Field, FilterBar, FormGrid, Modal, ModalCancel, NumberInput, Select, StatCard, Tabs, TextInput, Toggle,
  type Column, type FilterValues,
} from "@/components/ui-kit";
import { StatusPill, errMsg, inr, type Page } from "@/components/payroll/common";
import { ClaimDetailModal, type Claim } from "@/components/payroll/expense-modals";

type Tab = "claims" | "advances" | "categories";

export default function ExpensesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab) || "claims";
  const [summary, setSummary] = useState<{ by_status: Record<string, { count: number; amount: string }>; advances_outstanding: string } | null>(null);
  const [access, setAccess] = useState<{ can_manage: boolean } | null>(null);
  useEffect(() => {
    api.get<{ can_manage: boolean }>("/expenses/access").then((a) => { setAccess(a); if (!a.can_manage) router.replace("/dashboard/payroll/me?tab=expenses"); }).catch(() => {});
    api.get<typeof summary>("/expenses/summary").then(setSummary).catch(() => {});
  }, [router]);
  if (!access?.can_manage) return <div><PageHeader eyebrow="Payroll" title="Expenses" /></div>;
  const b = summary?.by_status ?? {};
  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Expenses" description="Claims with bills, approvals and payment with salary or by transfer." />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Waiting for approval" value={b.pending?.count ?? 0} hint={inr(b.pending?.amount ?? 0)} icon={Receipt} />
        <StatCard label="Approved, not paid" value={b.approved?.count ?? 0} hint={inr(b.approved?.amount ?? 0)} icon={Wallet} />
        <StatCard label="Paid" value={b.paid?.count ?? 0} hint={inr(b.paid?.amount ?? 0)} icon={Wallet} />
        <StatCard label="Advances to settle" value={inr(summary?.advances_outstanding ?? 0)} icon={AlertTriangle} />
      </div>
      <Tabs value={tab} onChange={(t) => router.replace(`/dashboard/expenses${t === "claims" ? "" : `?tab=${t}`}`, { scroll: false })} className="mb-5"
        items={[{ value: "claims", label: "Claims" }, { value: "advances", label: "Advances" }, { value: "categories", label: "Categories" }]} />
      {tab === "claims" && <Claims />}
      {tab === "advances" && <Advances />}
      {tab === "categories" && <Categories />}
    </div>
  );
}

function Claims() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [filters, setFilters] = useState<FilterValues>(params.get("status") ? { status: [params.get("status")!] } : {});
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Claim & { employee_name: string }> | null>(null);
  const viewing = params.get("view");
  const load = useCallback(() => {
    const qs = new URLSearchParams({ scope: "all", page: String(page), size: "25" });
    if (filters.status?.length) qs.set("status", filters.status.join(","));
    if (q) qs.set("q", q);
    api.get<typeof data>(`/expenses/claims?${qs}`).then(setData).catch((e) => toast.error(errMsg(e)));
  }, [filters, q, page, toast]);
  useEffect(() => { load(); }, [load]);
  const columns: Column<Claim & { employee_name: string }>[] = [
    { key: "who", header: "Employee", cell: (c) => <span className="flex items-center gap-2"><Avatar name={c.employee_name} size={26} /><span className="text-ink">{c.employee_name}</span></span> },
    { key: "what", header: "Claim", cell: (c) => <div className="min-w-0"><p className="truncate text-ink">{c.title}</p><p className="text-[12.5px] text-faint">{c.number ?? "Draft"} · {c.lines_count} bill{c.lines_count === 1 ? "" : "s"} · {c.pay_via === "payroll" ? "with salary" : "by transfer"}</p></div> },
    { key: "date", header: "Sent", hideBelow: "lg", cell: (c) => <span className="text-muted">{c.submitted_at ? formatDate(c.submitted_at) : "—"}</span> },
    { key: "amt", header: "Amount", align: "right", cell: (c) => <span className="tabular text-ink">{inr(c.total)}</span> },
    { key: "flags", header: "", cell: (c) => c.policy_flags.length ? <span title={c.policy_flags.map((f) => f.message).join("\n")}><AlertTriangle size={15} strokeWidth={1.4} className="text-amber-600" /></span> : null },
    { key: "st", header: "Status", cell: (c) => <StatusPill status={c.status} label={c.status_label} /> },
  ];
  return (
    <>
      <FilterBar searchPlaceholder="Search claims" onSearchChange={(x) => { setQ(x); setPage(1); }} values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[{ key: "status", label: "Status", multiple: true, options: [{ value: "pending", label: "Waiting" }, { value: "approved", label: "Approved" }, { value: "paid", label: "Paid" }, { value: "rejected", label: "Rejected" }, { value: "draft", label: "Draft" }] }]} />
      <DataTable rows={data?.items ?? []} rowKey={(c) => c.uuid} columns={columns} loading={!data} onRowClick={(c) => router.replace(`/dashboard/expenses?view=${c.uuid}`, { scroll: false })}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }} emptyIcon={Receipt} emptyTitle="No claims" />
      <ClaimDetailModal uuid={viewing} open={!!viewing} onClose={() => router.replace("/dashboard/expenses", { scroll: false })} onChanged={load} />
    </>
  );
}

function Advances() {
  const toast = useToast();
  const [rows, setRows] = useState<any[] | null>(null);
  const [pay, setPay] = useState<any | null>(null);
  const [ref, setRef] = useState("");
  const load = useCallback(() => { api.get<{ items: any[] }>("/expenses/advances?scope=all").then((r) => setRows(r.items)).catch((e) => toast.error(errMsg(e))); }, [toast]);
  useEffect(() => { load(); }, [load]);
  const columns: Column<any>[] = [
    { key: "who", header: "Employee", cell: (a) => <span className="text-ink">{a.employee_name}</span> },
    { key: "what", header: "Purpose", cell: (a) => <div><p className="text-ink">{a.purpose}</p><p className="text-[12.5px] text-faint">{a.number}</p></div> },
    { key: "amt", header: "Amount", align: "right", cell: (a) => <span className="tabular text-ink">{inr(a.amount)}</span> },
    { key: "bal", header: "To settle", align: "right", cell: (a) => <span className="tabular text-muted">{a.status === "paid" ? inr(a.balance) : "—"}</span> },
    { key: "st", header: "Status", cell: (a) => <StatusPill status={a.status} /> },
  ];
  return (
    <>
      <DataTable rows={rows ?? []} rowKey={(a) => a.uuid} columns={columns} loading={!rows}
        rowActions={(a) => a.status === "approved" ? [{ label: "Mark paid", icon: Wallet, onSelect: () => setPay(a) }] : []}
        emptyIcon={Wallet} emptyTitle="No advances" emptyHint="Employees ask for travel advances from My pay." />
      <Modal open={!!pay} onClose={() => setPay(null)} size="sm" title="Pay advance" footer={<><ModalCancel /><Button variant="primary" onClick={async () => {
        try { await api.post(`/expenses/advances/${pay.uuid}/pay`, { reference: ref }); toast.success("Advance paid"); setPay(null); load(); } catch (e) { toast.error(errMsg(e)); }
      }}>Save</Button></>}>
        <Field label="Bank reference"><TextInput value={ref} onValueChange={setRef} /></Field>
      </Modal>
    </>
  );
}

type Cat = { uuid: string; code: string; name: string; kind: string; default_limit: string | null; monthly_limit: string | null; receipt_required_above: string | null;
  mileage_rates: Record<string, number>; gst_applicable: boolean; taxable: boolean; pay_via: string; component_code: string | null; gl_code: string | null; active: boolean; limits: any[] };

function Categories() {
  const toast = useToast();
  const [rows, setRows] = useState<Cat[] | null>(null);
  const [form, setForm] = useState<{ open: boolean; target: Cat | null; key: number }>({ open: false, target: null, key: 0 });
  const load = useCallback(() => { api.get<Cat[]>("/expenses/categories").then(setRows).catch((e) => toast.error(errMsg(e))); }, [toast]);
  useEffect(() => { load(); }, [load]);
  const columns: Column<Cat>[] = [
    { key: "name", header: "Category", cell: (c) => <div><p className="text-ink">{c.name}{!c.active && <span className="text-faint"> · off</span>}</p><p className="font-mono text-[12px] text-faint">{c.code}</p></div> },
    { key: "limit", header: "Limit", cell: (c) => <span className="text-muted">{c.kind === "mileage" ? Object.entries(c.mileage_rates).map(([k, v]) => `${k.replace(/_/g, " ")} ${inr(v)}/km`).join(" · ") : c.default_limit ? `${inr(c.default_limit)}${c.kind === "per_day" ? " a day" : " a bill"}` : "No limit"}{c.monthly_limit ? ` · ${inr(c.monthly_limit)} a month` : ""}{c.limits.length ? ` · ${c.limits.length} grade rule(s)` : ""}</span> },
    { key: "tax", header: "Tax", hideBelow: "md", cell: (c) => c.taxable ? <Badge tone="warn">Taxable</Badge> : <Badge tone="good">Tax-free</Badge> },
    { key: "pay", header: "Paid", hideBelow: "md", cell: (c) => <span className="text-muted">{c.pay_via === "payroll" ? "With salary" : "By transfer"}</span> },
  ];
  return (
    <>
      <div className="mb-3 flex justify-end"><Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, target: null, key: form.key + 1 })}>New category</Button></div>
      <DataTable rows={rows ?? []} rowKey={(c) => c.uuid} columns={columns} loading={!rows} onRowClick={(c) => setForm({ open: true, target: c, key: form.key + 1 })}
        rowActions={(c) => [{ label: "Edit", icon: Pencil, onSelect: () => setForm({ open: true, target: c, key: form.key + 1 }) }]} emptyIcon={Receipt} emptyTitle="No categories" />
      <CategoryForm key={form.key} open={form.open} target={form.target} onClose={() => setForm({ ...form, open: false })} onSaved={() => { setForm({ ...form, open: false }); load(); }} />
    </>
  );
}

function CategoryForm({ open, target, onClose, onSaved }: { open: boolean; target: Cat | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<any>(target ?? { kind: "amount", pay_via: "payroll", taxable: false, gst_applicable: true, active: true, mileage_rates: {}, limits: [] });
  const [grades, setGrades] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => { if (open) api.get<{ code: string | null; name: string }[]>("/organization/grades").then((g) => setGrades(g.map((x) => ({ value: x.code ?? x.name, label: x.name })))).catch(() => {}); }, [open]);
  const set = (k: string, x: unknown) => setV((o: any) => ({ ...o, [k]: x }));
  const num = (x: any) => (x === null || x === undefined || x === "" ? null : Number(x));
  async function save() {
    try {
      const body = { ...v, default_limit: num(v.default_limit), monthly_limit: num(v.monthly_limit), receipt_required_above: num(v.receipt_required_above) };
      if (target) await api.put(`/expenses/categories/${target.uuid}`, body); else await api.post("/expenses/categories", body);
      toast.success("Saved"); onSaved();
    } catch (e) { toast.error(errMsg(e)); }
  }
  const limits: { grade_codes: string[]; per_claim?: number | null; per_day?: number | null }[] = v.limits ?? [];
  return (
    <Modal open={open} onClose={onClose} size="lg" title={target ? target.name : "New expense category"} dirty footer={<><ModalCancel /><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-5">
        <FormGrid>
          <Field label="Name" required><TextInput value={v.name ?? ""} onValueChange={(x) => set("name", x)} /></Field>
          <Field label="Code" required><TextInput value={v.code ?? ""} disabled={!!target} onValueChange={(x) => set("code", x.toUpperCase())} /></Field>
          <Field label="Claimed as"><Select value={v.kind} onChange={(x) => set("kind", x)} options={[{ value: "amount", label: "Bill amount" }, { value: "per_day", label: "Per day" }, { value: "mileage", label: "Distance (mileage)" }]} /></Field>
          <Field label="Paid"><Select value={v.pay_via} onChange={(x) => set("pay_via", x)} options={[{ value: "payroll", label: "With salary" }, { value: "direct", label: "By bank transfer" }]} /></Field>
          {v.kind === "mileage" ? (<>
            <Field label="Car (₹ per km)"><NumberInput value={v.mileage_rates?.car ?? null} onChange={(x) => set("mileage_rates", { ...v.mileage_rates, car: x })} /></Field>
            <Field label="Two-wheeler (₹ per km)"><NumberInput value={v.mileage_rates?.two_wheeler ?? null} onChange={(x) => set("mileage_rates", { ...v.mileage_rates, two_wheeler: x })} /></Field>
          </>) : <Field label={v.kind === "per_day" ? "Daily limit" : "Limit per bill"}><NumberInput value={num(v.default_limit)} onChange={(x) => set("default_limit", x)} /></Field>}
          <Field label="Monthly limit"><NumberInput value={num(v.monthly_limit)} onChange={(x) => set("monthly_limit", x)} /></Field>
          <Field label="Receipt needed above" hint="0 = always"><NumberInput value={num(v.receipt_required_above)} onChange={(x) => set("receipt_required_above", x)} /></Field>
          <Field label="GL code"><TextInput value={v.gl_code ?? ""} onValueChange={(x) => set("gl_code", x)} /></Field>
          <Field label="Flexible benefit component" hint="Bills count against this allowance for tax"><TextInput value={v.component_code ?? ""} onValueChange={(x) => set("component_code", x.toUpperCase() || null)} /></Field>
          <Toggle checked={!!v.taxable} onChange={(x) => set("taxable", x)} label="Taxable when paid with salary" />
          <Toggle checked={!!v.gst_applicable} onChange={(x) => set("gst_applicable", x)} label="Ask for GST details" />
          <Toggle checked={!!v.active} onChange={(x) => set("active", x)} label="In use" />
        </FormGrid>
        <div>
          <div className="mb-2 flex items-center justify-between"><p className="text-[14px] text-ink">Limits by grade</p>
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => set("limits", [...limits, { grade_codes: [], per_claim: null }])}>Add rule</Button></div>
          {limits.map((r, i) => (
            <div key={i} className="mb-2 grid gap-2 sm:grid-cols-[2fr_1fr_auto]">
              <Select value={r.grade_codes?.[0] ?? null} onChange={(x) => set("limits", limits.map((y, j) => (j === i ? { ...y, grade_codes: x ? [x] : [] } : y)))} options={grades} placeholder="Grade" />
              <NumberInput value={r.per_claim ?? r.per_day ?? null} onChange={(x) => set("limits", limits.map((y, j) => (j === i ? (v.kind === "per_day" ? { ...y, per_day: x } : { ...y, per_claim: x }) : y)))} />
              <Button size="sm" variant="ghost" onClick={() => set("limits", limits.filter((_, j) => j !== i))}>Remove</Button>
            </div>
          ))}
          {!limits.length && <p className="text-[13px] text-muted">Everyone gets the limit above.</p>}
        </div>
      </div>
    </Modal>
  );
}
