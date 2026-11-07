"use client";

/*
 * Statutory: PF, ESI, Professional Tax and LWF for a month with their files, the compliance
 * calendar (what is due per entity and state, with challan status and references), registers
 * (wages, bonus, gratuity provision) and the minimum wage check. ?tab= keeps the tab.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, Download, Landmark, Receipt } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Button, DataTable, DateInput, Field, FilterBar, Modal, ModalCancel, NumberInput, Select, Tabs, TextInput, type Column, type FilterValues } from "@/components/ui-kit";
import { Row, StatusPill, currentFY, downloadWithAuth, errMsg, fyOptions, inr } from "@/components/payroll/common";

type Tab = "month" | "calendar" | "registers" | "minimum";
type Summary = { month: string; employees: number; pf: Record<string, any>; esi: Record<string, any>; pt: { state: string; employees: number; amount: string }[];
  lwf: { state: string; employees: number; employee: string; employer: string }[]; tds: string; missing_uan: string[]; missing_esi_number: string[] };
type Item = { uuid: string | null; kind: string; label: string; legal_entity_id: number; state: string; period: string; due_date: string; amount: string;
  status: string; paid_on: string | null; reference: string | null; days_left: number };

function lastMonth() {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthOptions() {
  const out = [];
  const d = new Date(); d.setDate(1);
  for (let i = 0; i < 15; i++) {
    out.push({ value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-IN", { month: "long", year: "numeric" }) });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default function StatutoryPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab) || "month";
  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Statutory" description="PF, ESI, Professional Tax and Labour Welfare Fund: files, payments and due dates." />
      <Tabs value={tab} onChange={(t) => router.replace(`/dashboard/statutory${t === "month" ? "" : `?tab=${t}`}`, { scroll: false })} className="mb-5" items={[
        { value: "month", label: "Monthly returns" }, { value: "calendar", label: "Compliance calendar" },
        { value: "registers", label: "Registers" }, { value: "minimum", label: "Minimum wages" },
      ]} />
      {tab === "month" && <Month />}
      {tab === "calendar" && <Calendar />}
      {tab === "registers" && <Registers />}
      {tab === "minimum" && <MinimumWages />}
    </div>
  );
}

function Month() {
  const toast = useToast();
  const [month, setMonth] = useState(lastMonth());
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => { setS(null); api.get<Summary>(`/payroll/statutory/summary?month=${month}`).then(setS).catch((e) => toast.error(errMsg(e))); }, [month, toast]);
  const dl = (kind: string, fmt = "") => downloadWithAuth(`/payroll/statutory/files/${kind}?month=${month}${fmt}`, kind).catch((e) => toast.error(errMsg(e)));
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3"><div className="w-56"><Select value={month} onChange={(v) => setMonth(v ?? lastMonth())} options={monthOptions()} /></div>
        {s && <span className="text-[13px] text-muted">{s.employees} payslips · TDS {inr(s.tds)}</span>}</div>
      {!s ? <Paper className="p-10 text-center text-muted">Loading…</Paper> : !s.employees ? <Paper><EmptyState icon={Landmark} title="No approved pay run this month" /></Paper> : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Paper>
            <PaperHeader title="Provident fund" action={<span className="tabular text-ink">{inr(s.pf.total)}</span>} />
            <div className="divide-y divide-line px-5">
              <Row label="Members" value={s.pf.members} />
              <Row label="EPF wages / EPS wages" value={`${inr(s.pf.epf_wages)} / ${inr(s.pf.eps_wages)}`} />
              <Row label="Employee share (incl. VPF)" value={inr(Number(s.pf.employee) + Number(s.pf.vpf))} />
              <Row label="Pension (EPS 8.33%)" value={inr(s.pf.eps)} />
              <Row label="Employer to PF (3.67%)" value={inr(s.pf.epf_er)} />
              <Row label="EDLI and admin charges" value={`${inr(s.pf.edli)} + ${inr(s.pf.admin_with_minimum)}`} />
            </div>
            {s.missing_uan.length > 0 && <p className="mx-5 mt-2 text-[12.5px] text-amber-700">No UAN: {s.missing_uan.join(", ")}</p>}
            <div className="flex flex-wrap gap-2 p-5"><Button size="sm" variant="secondary" icon={Download} onClick={() => dl("ecr")}>ECR file</Button><Button size="sm" variant="ghost" icon={Download} onClick={() => dl("ecr_arrears")}>Arrears ECR</Button></div>
          </Paper>
          <Paper>
            <PaperHeader title="ESI" action={<span className="tabular text-ink">{inr(s.esi.total)}</span>} />
            <div className="divide-y divide-line px-5">
              <Row label="People covered" value={s.esi.covered} />
              <Row label="ESI wages" value={inr(s.esi.wages)} />
              <Row label="Employee 0.75%" value={inr(s.esi.employee)} />
              <Row label="Employer 3.25%" value={inr(s.esi.employer)} />
            </div>
            {s.missing_esi_number.length > 0 && <p className="mx-5 mt-2 text-[12.5px] text-amber-700">No ESI number: {s.missing_esi_number.join(", ")}</p>}
            <div className="flex flex-wrap gap-2 p-5"><Button size="sm" variant="secondary" icon={Download} onClick={() => dl("esi")}>ESI file (Excel)</Button><Button size="sm" variant="ghost" icon={Download} onClick={() => dl("esi", "&format=csv")}>CSV</Button></div>
          </Paper>
          <Paper>
            <PaperHeader title="Professional Tax by state" action={<Button size="sm" variant="ghost" icon={Download} onClick={() => dl("pt")}>Return</Button>} />
            {s.pt.length ? <div className="divide-y divide-line px-5">{s.pt.map((p) => <Row key={p.state} label={p.state} sub={`${p.employees} paying`} value={inr(p.amount)} />)}</div> : <p className="px-5 py-4 text-[13.5px] text-muted">No Professional Tax this month.</p>}
          </Paper>
          <Paper>
            <PaperHeader title="Labour Welfare Fund" action={<Button size="sm" variant="ghost" icon={Download} onClick={() => dl("lwf")}>Return</Button>} />
            {s.lwf.length ? <div className="divide-y divide-line px-5">{s.lwf.map((p) => <Row key={p.state} label={p.state} sub={`${p.employees} people`} value={`${inr(p.employee)} + ${inr(p.employer)}`} />)}</div> : <p className="px-5 py-4 text-[13.5px] text-muted">LWF is collected only in certain months; none this month.</p>}
          </Paper>
        </div>
      )}
    </div>
  );
}

function Calendar() {
  const toast = useToast();
  const [items, setItems] = useState<Item[] | null>(null);
  const [filters, setFilters] = useState<FilterValues>({});
  const [rec, setRec] = useState<Item | null>(null);
  const load = useCallback(() => { api.get<{ items: Item[] }>("/payroll/statutory/calendar?months=8").then((r) => setItems(r.items)).catch((e) => toast.error(errMsg(e))); }, [toast]);
  useEffect(() => { load(); }, [load]);
  const rows = (items ?? []).filter((i) => (!filters.kind?.length || filters.kind.includes(i.kind)) && (!filters.status?.length || filters.status.includes(i.status)));
  const columns: Column<Item>[] = [
    { key: "due", header: "Due", cell: (i) => <div><p className="text-ink">{formatDate(i.due_date)}</p><p className={`text-[12.5px] ${i.status === "late" ? "text-rose-700" : i.days_left <= 3 && i.status === "pending" ? "text-amber-700" : "text-faint"}`}>{["paid", "filed"].includes(i.status) ? "Done" : i.days_left < 0 ? `${-i.days_left} days late` : i.days_left === 0 ? "Today" : `in ${i.days_left} days`}</p></div> },
    { key: "what", header: "What", cell: (i) => <div><p className="text-ink">{i.label}</p><p className="text-[12.5px] text-faint">{i.period}</p></div> },
    { key: "amount", header: "Amount", align: "right", cell: (i) => <span className="tabular text-ink/85">{Number(i.amount) ? inr(i.amount) : "—"}</span> },
    { key: "ref", header: "Reference", hideBelow: "md", cell: (i) => <span className="font-mono text-[12.5px] text-muted">{i.reference ?? ""}</span> },
    { key: "st", header: "Status", cell: (i) => <StatusPill status={i.status} /> },
  ];
  return (
    <>
      <FilterBar values={filters} onChange={setFilters} filters={[
        { key: "kind", label: "Kind", multiple: true, options: [["pf", "PF"], ["esi", "ESI"], ["tds", "TDS"], ["pt", "Professional Tax"], ["lwf", "LWF"], ["salary", "Salary"], ["tds_return", "TDS return"], ["certificate", "Form 16"]].map(([value, label]) => ({ value, label })) },
        { key: "status", label: "Status", multiple: true, options: [{ value: "pending", label: "Pending" }, { value: "late", label: "Late" }, { value: "paid", label: "Paid" }, { value: "filed", label: "Filed" }] },
      ]} />
      <DataTable rows={rows} rowKey={(i) => `${i.kind}${i.legal_entity_id}${i.state}${i.period}`} columns={columns} loading={!items} onRowClick={setRec}
        rowActions={(i) => [{ label: ["paid", "filed"].includes(i.status) ? "Edit record" : "Record payment or filing", icon: Receipt, onSelect: () => setRec(i) }]}
        emptyIcon={CalendarClock} emptyTitle="Nothing due" />
      <ChallanModal item={rec} onClose={() => setRec(null)} onSaved={() => { setRec(null); load(); }} />
    </>
  );
}

function ChallanModal({ item, onClose, onSaved }: { item: Item | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [ref, setRef] = useState("");
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>("paid");
  useEffect(() => { if (item) { setRef(item.reference ?? ""); setAmount(Number(item.amount) || null); setStatus(item.kind === "tds_return" || item.kind === "certificate" ? "filed" : "paid"); setPaidOn(item.paid_on ?? new Date().toISOString().slice(0, 10)); } }, [item]);
  async function save() {
    if (!item) return;
    try { await api.post("/payroll/statutory/challans", { kind: item.kind, period: item.period, legal_entity_id: item.legal_entity_id, state: item.state, status, reference: ref, paid_on: paidOn, amount, due_date: item.due_date }); toast.success("Recorded"); onSaved(); }
    catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <Modal open={!!item} onClose={onClose} size="sm" title={item?.label ?? ""} description={item ? `${item.period} · due ${formatDate(item.due_date)}` : undefined}
      footer={<><ModalCancel /><Button variant="primary" onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Status"><Select value={status} onChange={setStatus} options={[{ value: "paid", label: "Paid" }, { value: "filed", label: "Filed" }, { value: "pending", label: "Pending" }, { value: "not_applicable", label: "Not needed" }]} /></Field>
        <Field label="Challan / TRRN / acknowledgement number" required={status !== "pending"}><TextInput value={ref} onValueChange={setRef} /></Field>
        <Field label="Paid or filed on"><DateInput value={paidOn} onChange={setPaidOn} /></Field>
        <Field label="Amount"><NumberInput value={amount} onChange={setAmount} /></Field>
      </div>
    </Modal>
  );
}

function Registers() {
  const toast = useToast();
  const [fy, setFy] = useState(currentFY());
  const [month, setMonth] = useState(lastMonth());
  const dl = (p: string, n: string) => downloadWithAuth(p, n).catch((e) => toast.error(errMsg(e)));
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Paper className="p-5"><p className="text-[15px] text-ink">Register of wages</p><p className="mt-1 text-[13px] text-muted">Combined register under the Code on Wages: rate, days, earnings, deductions and payment date.</p>
        <div className="mt-4 flex gap-2"><div className="flex-1"><Select value={month} onChange={(v) => setMonth(v ?? lastMonth())} options={monthOptions()} /></div><Button variant="secondary" icon={Download} onClick={() => dl(`/payroll/statutory/registers/wages?month=${month}`, "wages.xlsx")}>Excel</Button></div></Paper>
      <Paper className="p-5"><p className="text-[15px] text-ink">Bonus register</p><p className="mt-1 text-[13px] text-muted">Eligibility (wages up to ₹21,000), calculation base and bonus due for the year.</p>
        <div className="mt-4 flex gap-2"><div className="flex-1"><Select value={fy} onChange={(v) => setFy(v ?? currentFY())} options={fyOptions()} /></div><Button variant="secondary" icon={Download} onClick={() => dl(`/payroll/statutory/registers/bonus?fy=${fy}`, "bonus.xlsx")}>Excel</Button></div></Paper>
      <Paper className="p-5"><p className="text-[15px] text-ink">Gratuity provision</p><p className="mt-1 text-[13px] text-muted">Liability to date for everyone (15/26 of wages per year) and the monthly provision.</p>
        <div className="mt-4"><Button variant="secondary" icon={Download} onClick={() => dl("/payroll/statutory/registers/gratuity", "gratuity.xlsx")}>Excel</Button></div></Paper>
    </div>
  );
}

function MinimumWages() {
  const toast = useToast();
  const [rows, setRows] = useState<{ employee_uuid: string; name: string; wages: string; minimum: string; source: string }[] | null>(null);
  useEffect(() => { api.get<{ items: typeof rows }>("/payroll/statutory/minimum-wage-check").then((r) => setRows(r.items)).catch((e) => toast.error(errMsg(e))); }, [toast]);
  return (
    <Paper>
      <PaperHeader title="Below the minimum wage" action={<a href="/dashboard/payroll/settings?tab=statutory" className="text-[13px] text-primary">Minimum wage tables</a>} />
      {!rows ? <p className="p-8 text-center text-muted">Checking…</p> : rows.length ? (
        <ul className="divide-y divide-line">{rows.map((r) => (
          <li key={r.employee_uuid} className="flex items-center gap-3 px-5 py-3"><AlertTriangle size={16} strokeWidth={1.4} className="text-rose-600" />
            <div className="flex-1"><p className="text-[14px] text-ink">{r.name}</p><p className="text-[12.5px] text-faint">{r.source}</p></div>
            <span className="tabular text-[13.5px] text-rose-700">{inr(r.wages)}</span><span className="text-faint">/</span><span className="tabular text-[13.5px] text-muted">{inr(r.minimum)}</span></li>))}</ul>
      ) : <EmptyState icon={CheckCircle2} title="Everyone is paid at least the minimum wage" hint="Checked against each person's state, zone and skill level." />}
    </Paper>
  );
}

void Badge;
