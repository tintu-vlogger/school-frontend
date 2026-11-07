"use client";

/*
 * My pay (self-service): payslips (password-protected PDFs), current salary split, income
 * tax (regime comparison, declarations, proofs, the month-by-month worksheet and Form 16),
 * flexible benefits (split and bills),
 * expense claims and advances, and loans. ?tab= keeps the tab.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Download, FileText, HandCoins, Lock, Paperclip, Plus, Receipt, Upload, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Button, DataTable, Field, FormGrid, NumberInput, RadioCards, Skeleton, Tabs, TextInput, Toggle, type Column } from "@/components/ui-kit";
import { Row, StatusPill, currentFY, downloadWithAuth, errMsg, inr, monthLabel, postForm } from "@/components/payroll/common";
import { PayslipModal } from "@/components/payroll/payslip-modal";
import { MyFlexibleBenefits } from "@/components/payroll/fbp";
import { AdvanceModal, ClaimDetailModal, ClaimFormModal, type Claim } from "@/components/payroll/expense-modals";
import { LoanDetailModal, LoanRequestModal, type Loan } from "@/components/payroll/loan-modals";

type Tab = "payslips" | "salary" | "tax" | "benefits" | "expenses" | "loans";
type Summary = { salary: { annual_ctc: string; monthly_gross: string; effective_from: string; structure_name: string | null; components: { code: string; name: string; kind: string; monthly: string; annual: string }[] } | null;
  last_payslip: { uuid: string; net: string; period_start: string } | null; ytd: { gross: string; net: string; tds: string; pf: string }; fy: string; regime: string;
  declaration_status: string; windows: { declaration_open: boolean; proof_open: boolean; proof_from: string; proof_to: string; declaration_to: string; allow_regime_change: boolean }; password_hint: string };

export default function MyPayPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const tab = (params.get("tab") as Tab) || "payslips";
  const [s, setS] = useState<Summary | null>(null);
  const [notEmployee, setNotEmployee] = useState(false);
  useEffect(() => {
    api.get<Summary>("/payroll/me/summary").then(setS).catch((e) => { if (/employee/i.test(errMsg(e))) setNotEmployee(true); else toast.error(errMsg(e)); });
  }, [toast]);
  if (notEmployee) return <div><PageHeader title="My pay" /><Paper><EmptyState icon={Wallet} title="My pay is for employees" hint="Sign in with an employee login to see payslips and tax." action={<Button onClick={() => router.push("/dashboard/payroll")}>Payroll overview</Button>} /></Paper></div>;
  return (
    <div>
      <PageHeader title="My pay" description="Payslips, salary, income tax, expense claims and loans." />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!s ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />) : (<>
          <Paper className="p-5"><p className="text-[13px] text-muted">Last take-home</p><p className="tabular mt-2 text-[26px] font-extralight text-ink">{s.last_payslip ? inr(s.last_payslip.net) : "—"}</p><p className="text-[12.5px] text-faint">{s.last_payslip ? monthLabel(s.last_payslip.period_start) : "No payslip yet"}</p></Paper>
          <Paper className="p-5"><p className="text-[13px] text-muted">Annual CTC</p><p className="tabular mt-2 text-[26px] font-extralight text-ink">{s.salary ? inr(s.salary.annual_ctc) : "—"}</p><p className="text-[12.5px] text-faint">{s.salary ? `Since ${formatDate(s.salary.effective_from)}` : ""}</p></Paper>
          <Paper className="p-5"><p className="text-[13px] text-muted">Tax deducted this year</p><p className="tabular mt-2 text-[26px] font-extralight text-ink">{inr(s.ytd.tds)}</p><p className="text-[12.5px] text-faint">FY {s.fy} · {s.regime === "new" ? "new" : "old"} regime</p></Paper>
          <Paper className="p-5"><p className="text-[13px] text-muted">Provident fund this year</p><p className="tabular mt-2 text-[26px] font-extralight text-ink">{inr(s.ytd.pf)}</p><p className="text-[12.5px] text-faint">Your share</p></Paper>
        </>)}
      </div>
      <Tabs value={tab} onChange={(t) => router.replace(`/dashboard/payroll/me${t === "payslips" ? "" : `?tab=${t}`}`, { scroll: false })} className="mb-5" items={[
        { value: "payslips", label: "Payslips" }, { value: "salary", label: "Salary" }, { value: "tax", label: "Income tax" }, { value: "benefits", label: "Flexible benefits" }, { value: "expenses", label: "Expenses" }, { value: "loans", label: "Loans" },
      ]} />
      {tab === "payslips" && <Payslips hint={s?.password_hint} />}
      {tab === "salary" && <Salary s={s} />}
      {tab === "tax" && s && <Tax s={s} />}
      {tab === "benefits" && <MyFlexibleBenefits />}
      {tab === "expenses" && <Expenses />}
      {tab === "loans" && <Loans />}
    </div>
  );
}

function Payslips({ hint }: { hint?: string }) {
  const toast = useToast();
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { api.get<{ items: any[] }>("/payroll/me/payslips").then((r) => setRows(r.items)).catch((e) => toast.error(errMsg(e))); }, [toast]);
  const columns: Column<any>[] = [
    { key: "m", header: "Month", cell: (p) => <div><p className="text-ink">{monthLabel(p.period_start)}</p><p className="text-[12.5px] text-faint">{p.run_kind === "regular" ? "Monthly salary" : p.run_title}</p></div> },
    { key: "gross", header: "Gross", align: "right", cell: (p) => <span className="tabular text-muted">{inr(p.gross)}</span> },
    { key: "ded", header: "Deductions", align: "right", hideBelow: "md", cell: (p) => <span className="tabular text-muted">{inr(p.deductions)}</span> },
    { key: "net", header: "Take-home", align: "right", cell: (p) => <span className="tabular text-ink">{inr(p.net)}</span> },
    { key: "dl", header: "", cell: (p) => <Button size="sm" variant="ghost" icon={Download} onClick={(e) => { e.stopPropagation(); downloadWithAuth(`/payroll/payslips/${p.uuid}/pdf`, "payslip.pdf").catch((er) => toast.error(errMsg(er))); }}>PDF</Button> },
  ];
  return (
    <>
      {hint && <p className="mb-3 flex items-center gap-2 text-[13px] text-muted"><Lock size={14} strokeWidth={1.4} />PDFs open with: {hint}</p>}
      <DataTable rows={rows ?? []} rowKey={(p) => p.uuid} columns={columns} loading={!rows} onRowClick={(p) => setOpen(p.uuid)} emptyIcon={FileText} emptyTitle="No payslips yet" emptyHint="Payslips appear here once payroll is published." />
      <PayslipModal uuid={open} open={!!open} onClose={() => setOpen(null)} />
    </>
  );
}

function Salary({ s }: { s: Summary | null }) {
  if (!s?.salary) return <Paper><EmptyState icon={Wallet} title="No salary on record yet" /></Paper>;
  const earn = s.salary.components.filter((c) => c.kind === "earning" || c.kind === "reimbursement");
  const er = s.salary.components.filter((c) => c.kind === "employer");
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Paper><PaperHeader title="Monthly earnings" action={<span className="tabular text-ink">{inr(s.salary.monthly_gross)}</span>} />
        <div className="divide-y divide-line px-5">{earn.map((c) => <Row key={c.code} label={c.name} sub={`${inr(c.annual)} a year`} value={inr(c.monthly)} />)}</div></Paper>
      <Paper><PaperHeader title="Paid by the company for you" />
        <div className="divide-y divide-line px-5">{er.map((c) => <Row key={c.code} label={c.name} value={inr(c.monthly)} />)}<Row label="Cost to company (year)" value={inr(s.salary.annual_ctc)} strong /></div></Paper>
    </div>
  );
}

type Decl = { uuid: string; fy: string; regime: string; regime_locked: boolean; status: string; items: { key: string; section: string; label: string; declared: string; approved: string | null; status: string; comment: string | null; file_ids: string[]; senior?: boolean }[];
  hra: any; previous_employer: any; other_income: string; extra_tds_monthly: string; files: { uuid: string; item: string; filename: string }[];
  windows: Summary["windows"] };
type ItemDef = { key: string; section: string; label: string; section_label: string; cap: number | null };

function Tax({ s }: { s: Summary }) {
  const toast = useToast();
  const [d, setD] = useState<Decl | null>(null);
  const [defs, setDefs] = useState<ItemDef[]>([]);
  const [cmp, setCmp] = useState<any>(null);
  const [ws, setWs] = useState<any>(null);
  const [amounts, setAmounts] = useState<Record<string, number | null>>({});
  const [parentsSenior, setParentsSenior] = useState(false);
  const [rent, setRent] = useState<number | null>(null);
  const [rentMonths, setRentMonths] = useState<number | null>(12);
  const [landlord, setLandlord] = useState({ name: "", pan: "", metro: true });
  const [prev, setPrev] = useState<Record<string, any>>({});
  const [extra, setExtra] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api.get<Decl>(`/payroll/me/declaration?fy=${s.fy}`).then((x) => {
      setD(x);
      setAmounts(Object.fromEntries(x.items.map((i) => [i.key, Number(i.declared)])));
      setParentsSenior(!!x.items.find((i) => i.key === "health_parents")?.senior);
      const m = x.hra?.months ?? [];
      setRent(m.length ? Number(m[0].rent) : null); setRentMonths(m.length || 12);
      setLandlord({ name: x.hra?.landlord_name ?? "", pan: x.hra?.landlord_pan ?? "", metro: x.hra?.metro ?? true });
      setPrev(x.previous_employer ?? {}); setExtra(Number(x.extra_tds_monthly) || null);
    }).catch((e) => toast.error(errMsg(e)));
    api.get(`/payroll/me/tax/compare?fy=${s.fy}`).then(setCmp).catch(() => {});
    api.get(`/payroll/me/tax/worksheet?fy=${s.fy}`).then(setWs).catch(() => {});
  }, [s.fy, toast]);
  useEffect(() => { load(); api.get<{ items: ItemDef[] }>("/payroll/tax/items").then((r) => setDefs(r.items)).catch(() => {}); }, [load]);
  const sections = useMemo(() => {
    const m = new Map<string, ItemDef[]>();
    defs.forEach((x) => m.set(x.section_label, [...(m.get(x.section_label) ?? []), x]));
    return [...m.entries()];
  }, [defs]);
  async function save(submit: boolean, regime?: string) {
    if (!d) return;
    setBusy(true);
    try {
      const fyStart = Number(s.fy.slice(0, 4));
      const months = rent && rentMonths ? Array.from({ length: rentMonths }, (_, i) => { const mm = ((3 + i) % 12) + 1; return { month: `${mm >= 4 ? fyStart : fyStart + 1}-${String(mm).padStart(2, "0")}`, rent }; }) : [];
      await api.put(`/payroll/me/declaration?fy=${s.fy}`, {
        regime: regime ?? d.regime, submit,
        items: Object.entries(amounts).filter(([, v]) => v).map(([key, declared]) => ({ key, declared, senior: key === "health_parents" ? parentsSenior : undefined })),
        hra: { months, landlord_name: landlord.name, landlord_pan: landlord.pan || undefined, metro: landlord.metro },
        previous_employer: prev, extra_tds_monthly: extra ?? 0,
      });
      toast.success(regime ? "Regime changed" : submit ? "Declaration sent" : "Saved");
      load();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function uploadProof(item: string, file: File) {
    const fd = new FormData(); fd.append("item", item); fd.append("fy", s.fy); fd.append("file", file);
    try { await postForm(`/payroll/me/declaration/proofs`, fd); toast.success("Proof added"); load(); } catch (e) { toast.error(errMsg(e)); }
  }
  if (!d) return <Skeleton className="h-64 rounded-2xl" />;
  const locked = d.status === "verified";
  const filesFor = (k: string) => d.files.filter((f) => f.item === k);
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        {(["new", "old"] as const).map((r) => (
          <button key={r} disabled={busy || d.regime_locked || !d.windows.allow_regime_change} onClick={() => d.regime !== r && save(false, r)}
            className={`rounded-2xl border p-5 text-left transition-colors ${d.regime === r ? "border-primary bg-primary-soft/30" : "border-line bg-surface hover:border-line-strong"}`}>
            <div className="flex items-center justify-between"><p className="text-[15px] text-ink">{r === "new" ? "New regime" : "Old regime"}</p>
              <span className="flex gap-1.5">{cmp?.better === r && Number(cmp.saving) > 0 && <Badge tone="good">Pays less</Badge>}{d.regime === r && <Badge tone="accent">Chosen</Badge>}</span></div>
            <p className="tabular mt-3 text-[28px] font-extralight text-ink">{cmp ? inr(cmp[r].annual_tax) : "…"}</p>
            <p className="text-[12.5px] text-muted">Tax for the year on taxable income of {cmp ? inr(cmp[r].taxable_income) : "…"}</p>
          </button>
        ))}
      </div>
      {cmp && <p className="text-[13px] text-muted">{Number(cmp.saving) ? `With today's salary and declarations, the ${cmp.better} regime saves ${inr(cmp.saving)}.` : "Both regimes come to the same tax with today's figures."} {d.regime_locked ? "Your regime is fixed for this year." : ""}</p>}
      <Paper>
        <PaperHeader title={`Declarations for FY ${s.fy}`} action={<StatusPill status={d.status} />} />
        <div className="space-y-6 p-5">
          {d.regime === "new" && <p className="rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-[13px] text-sky-800">The new regime allows only the standard deduction and employer NPS. Declarations still help if you switch.</p>}
          {sections.map(([label, items]) => (
            <div key={label}>
              <p className="mb-2 text-[13.5px] text-ink">{label}{items[0].cap ? <span className="text-faint"> · up to {inr(items[0].cap)}</span> : null}</p>
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((it) => {
                  const di = d.items.find((x) => x.key === it.key);
                  return (
                    <div key={it.key} className="rounded-xl border border-line p-3">
                      <Field label={it.label}><NumberInput value={amounts[it.key] ?? null} onChange={(x) => setAmounts({ ...amounts, [it.key]: x })} disabled={locked} min={0} /></Field>
                      {it.key === "health_parents" && <Toggle className="mt-2" checked={parentsSenior} onChange={setParentsSenior} label="Parents are 60 or older" size="sm" />}
                      {di && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
                          {di.approved !== null && <Badge tone={di.status === "rejected" ? "bad" : "good"}>{di.status === "rejected" ? "Not accepted" : `Accepted ${inr(di.approved)}`}</Badge>}
                          {di.comment && <span className="text-muted">{di.comment}</span>}
                          {filesFor(it.key).map((f) => <span key={f.uuid} className="flex items-center gap-1 text-emerald-700"><Paperclip size={12} strokeWidth={1.4} />{f.filename.slice(0, 20)}</span>)}
                          {d.windows.proof_open && !locked && <label className="cursor-pointer text-primary"><Upload size={12} strokeWidth={1.4} className="mr-1 inline" />Add proof<input type="file" hidden accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && uploadProof(it.key, e.target.files[0])} /></label>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div>
            <p className="mb-2 text-[13.5px] text-ink">Rent (house rent allowance)</p>
            <FormGrid columns={3}>
              <Field label="Rent a month"><NumberInput value={rent} onChange={setRent} disabled={locked} /></Field>
              <Field label="Months this year"><NumberInput value={rentMonths} onChange={setRentMonths} min={1} max={12} disabled={locked} /></Field>
              <div className="pt-6"><Toggle checked={landlord.metro} onChange={(x) => setLandlord({ ...landlord, metro: x })} label="Metro city" /></div>
              <Field label="Landlord's name"><TextInput value={landlord.name} onValueChange={(x) => setLandlord({ ...landlord, name: x })} disabled={locked} /></Field>
              <Field label="Landlord's PAN" hint="Needed when rent is above ₹1 lakh a year"><TextInput value={landlord.pan} onValueChange={(x) => setLandlord({ ...landlord, pan: x.toUpperCase() })} disabled={locked} /></Field>
              {d.windows.proof_open && !locked && <div className="pt-6"><label className="cursor-pointer text-[13px] text-primary"><Upload size={13} strokeWidth={1.4} className="mr-1 inline" />Rent receipts<input type="file" hidden accept="image/*,application/pdf" onChange={(e) => e.target.files?.[0] && uploadProof("hra", e.target.files[0])} /></label></div>}
            </FormGrid>
          </div>
          <div>
            <p className="mb-2 text-[13.5px] text-ink">Previous employer this year</p>
            <FormGrid columns={3}>
              <Field label="Employer"><TextInput value={prev.employer_name ?? ""} onValueChange={(x) => setPrev({ ...prev, employer_name: x })} disabled={locked} /></Field>
              <Field label="Salary received"><NumberInput value={prev.income ? Number(prev.income) : null} onChange={(x) => setPrev({ ...prev, income: x })} disabled={locked} /></Field>
              <Field label="Tax deducted"><NumberInput value={prev.tds ? Number(prev.tds) : null} onChange={(x) => setPrev({ ...prev, tds: x })} disabled={locked} /></Field>
            </FormGrid>
          </div>
          <Field label="Extra tax to deduct each month (optional)" className="max-w-xs"><NumberInput value={extra} onChange={setExtra} min={0} /></Field>
          {!locked && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" loading={busy} onClick={() => save(false)}>Save</Button>
              <Button variant="primary" loading={busy} onClick={() => save(true)}>Send declaration</Button>
              {d.windows.proof_open && <Button variant="primary" icon={CheckCircle2} onClick={async () => { try { await api.post(`/payroll/me/declaration/submit-proofs?fy=${s.fy}`); toast.success("Proofs sent to HR"); load(); } catch (e) { toast.error(errMsg(e)); } }}>Send proofs to HR</Button>}
            </div>
          )}
          <p className="text-[12.5px] text-faint">{d.windows.proof_open ? `Proofs are being collected until ${d.windows.proof_to}.` : `Proofs are collected from ${d.windows.proof_from} to ${d.windows.proof_to}.`}</p>
        </div>
      </Paper>
      {ws && (
        <Paper>
          <PaperHeader title="How your tax is worked out" action={<Button size="sm" variant="ghost" icon={Download} onClick={() => downloadWithAuth(`/payroll/me/form16`, "Form16.pdf").catch((e) => toast.error(errMsg(e)))}>Last year's Form 16</Button>} />
          <div className="grid gap-6 p-5 lg:grid-cols-2">
            <div className="divide-y divide-line">
              <Row label="Salary for the year" value={inr(ws.worksheet.salary)} />
              {Number(ws.worksheet.perquisites) > 0 && <Row label="Perquisites" value={inr(ws.worksheet.perquisites)} />}
              {Number(ws.worksheet.previous_employer_income) > 0 && <Row label="Previous employer" value={inr(ws.worksheet.previous_employer_income)} />}
              {ws.worksheet.exemptions.map((x: any) => <Row key={x.key} label={`Less ${x.label.toLowerCase()}`} value={inr(-Number(x.amount))} />)}
              {ws.worksheet.deductions.map((x: any) => <Row key={x.key} label={`Less ${x.label}`} value={inr(-Number(x.amount))} />)}
              <Row label="Taxable income" value={inr(ws.worksheet.taxable_income)} strong />
              <Row label="Tax, after rebate, with cess" value={inr(ws.worksheet.annual_tax)} strong />
              <Row label="Deducted so far" value={inr(ws.tds_paid)} />
              <Row label="Still to deduct" value={inr(ws.tds_remaining)} />
            </div>
            <div className="max-h-96 overflow-auto">
              {ws.months.map((m: any) => (
                <div key={m.month} className="flex items-center justify-between border-b border-line py-2 text-[13.5px]">
                  <span className="text-ink">{monthLabel(m.month)}</span>
                  <span className="flex items-center gap-3"><span className="tabular text-muted">{inr(m.taxable)}</span><span className={`tabular w-20 text-right ${m.paid ? "text-ink" : "text-faint"}`}>{inr(m.tds)}</span>{!m.paid && <Badge>Projected</Badge>}</span>
                </div>
              ))}
            </div>
          </div>
        </Paper>
      )}
    </div>
  );
}

function Expenses() {
  const toast = useToast();
  const [rows, setRows] = useState<Claim[] | null>(null);
  const [adv, setAdv] = useState<any[]>([]);
  const [form, setForm] = useState<{ open: boolean; target: Claim | null; key: number }>({ open: false, target: null, key: 0 });
  const [view, setView] = useState<string | null>(null);
  const [advOpen, setAdvOpen] = useState(false);
  const load = useCallback(() => {
    api.get<{ items: Claim[] }>("/expenses/claims?scope=mine&size=100").then((r) => setRows(r.items)).catch((e) => toast.error(errMsg(e)));
    api.get<{ items: any[] }>("/expenses/advances").then((r) => setAdv(r.items)).catch(() => {});
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  const columns: Column<Claim>[] = [
    { key: "t", header: "Claim", cell: (c) => <div><p className="text-ink">{c.title}</p><p className="text-[12.5px] text-faint">{c.number ?? "Draft"} · {c.lines_count} bill{c.lines_count === 1 ? "" : "s"}</p></div> },
    { key: "a", header: "Amount", align: "right", cell: (c) => <span className="tabular text-ink">{inr(c.total)}</span> },
    { key: "s", header: "Status", cell: (c) => <StatusPill status={c.status} label={c.status_label} /> },
  ];
  return (
    <div className="space-y-5">
      <div className="flex justify-end gap-2"><Button variant="secondary" icon={HandCoins} onClick={() => setAdvOpen(true)}>Travel advance</Button>
        <Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, target: null, key: form.key + 1 })}>New claim</Button></div>
      <DataTable rows={rows ?? []} rowKey={(c) => c.uuid} columns={columns} loading={!rows} onRowClick={(c) => setView(c.uuid)} emptyIcon={Receipt} emptyTitle="No claims yet" emptyHint="Snap your bills and claim travel, food, fuel and more." />
      {adv.length > 0 && (
        <Paper><PaperHeader title="Advances" /><ul className="divide-y divide-line">{adv.map((a) => (
          <li key={a.uuid} className="flex items-center justify-between px-5 py-3 text-[14px]"><span className="text-ink">{a.purpose}<span className="text-faint"> · {inr(a.amount)}</span></span><span className="flex items-center gap-3">{a.status === "paid" && <span className="text-[12.5px] text-muted">To settle {inr(a.balance)}</span>}<StatusPill status={a.status} /></span></li>))}</ul></Paper>
      )}
      <ClaimFormModal key={form.key} open={form.open} target={form.target} onClose={() => setForm({ ...form, open: false })} onSaved={() => { setForm({ ...form, open: false }); load(); }} />
      <ClaimDetailModal uuid={view} open={!!view} onClose={() => setView(null)} onChanged={load} onEdit={(c) => { setView(null); setForm({ open: true, target: c, key: form.key + 1 }); }} />
      <AdvanceModal open={advOpen} onClose={() => setAdvOpen(false)} onSaved={() => { setAdvOpen(false); load(); }} />
    </div>
  );
}

function Loans() {
  const toast = useToast();
  const [rows, setRows] = useState<Loan[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const load = useCallback(() => { api.get<{ items: Loan[] }>("/loans").then((r) => setRows(r.items)).catch((e) => toast.error(errMsg(e))); }, [toast]);
  useEffect(() => { load(); }, [load]);
  const columns: Column<Loan>[] = [
    { key: "t", header: "Loan", cell: (l) => <div><p className="text-ink">{l.loan_type}</p><p className="text-[12.5px] text-faint">{l.number}</p></div> },
    { key: "a", header: "Amount", align: "right", cell: (l) => <span className="tabular text-muted">{inr(l.principal)}</span> },
    { key: "e", header: "Instalment", align: "right", cell: (l) => <span className="tabular text-muted">{inr(l.emi)}</span> },
    { key: "b", header: "Balance", align: "right", cell: (l) => <span className="tabular text-ink">{inr(l.outstanding)}</span> },
    { key: "s", header: "Status", cell: (l) => <StatusPill status={l.status} label={l.status_label} /> },
  ];
  return (
    <div className="space-y-4">
      <div className="flex justify-end"><Button variant="primary" icon={Plus} onClick={() => setAsking(true)}>Ask for a loan</Button></div>
      <DataTable rows={rows ?? []} rowKey={(l) => l.uuid} columns={columns} loading={!rows} onRowClick={(l) => setView(l.uuid)} emptyIcon={HandCoins} emptyTitle="No loans" emptyHint="Personal loans, festival and salary advances, repaid from salary." />
      <LoanRequestModal open={asking} onClose={() => setAsking(false)} onSaved={() => { setAsking(false); load(); }} />
      <LoanDetailModal uuid={view} open={!!view} onClose={() => setView(null)} onChanged={load} />
    </div>
  );
}

void RadioCards;
