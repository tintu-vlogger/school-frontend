"use client";

/*
 * Income tax (HR): declarations and regime per employee, proof verification (accept,
 * reject or partly accept with comments), perquisites, opening balances, the quarterly TDS
 * return file and Form 16 (Part B generated, Part A uploaded and merged). ?tab= keeps the tab.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Car, CheckCircle2, Download, FileText, Home, Paperclip, Plus, ReceiptIndianRupee, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { Form16Signing } from "@/components/payroll/signing";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, Modal, ModalCancel, NumberInput, RadioCards, Select, Tabs, TextInput,
  Toggle, type Column, type FilterValues,
} from "@/components/ui-kit";
import { Row, StatusPill, currentFY, downloadWithAuth, errMsg, fyOptions, inr, loadPayrollEmployees, postForm, type Page } from "@/components/payroll/common";

type Decl = { uuid: string | null; employee_uuid: string; employee_id: number; employee_name: string; employee_code: string | null; pan: string | null;
  fy: string; regime: string; status: string; declared_total: string; approved_total: string; rent_total: string; items: Item[] };
type Item = { key: string; section: string; label: string; declared: string; proof_amount: string | null; approved: string | null; status: string; comment: string | null; file_ids: string[]; senior?: boolean };
type Tab = "declarations" | "proofs" | "perquisites" | "returns";

export default function TaxPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab) || "declarations";
  const [fy, setFy] = useState(currentFY());
  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Income tax" description="Regimes, investment declarations, proofs, perquisites, quarterly returns and Form 16."
        actions={<div className="w-44"><Select value={fy} onChange={(v) => setFy(v ?? currentFY())} options={fyOptions()} /></div>} />
      <Tabs value={tab} onChange={(t) => router.replace(`/dashboard/tax${t === "declarations" ? "" : `?tab=${t}`}`, { scroll: false })} className="mb-5" items={[
        { value: "declarations", label: "Declarations" }, { value: "proofs", label: "Proofs to verify" },
        { value: "perquisites", label: "Perquisites" }, { value: "returns", label: "Returns and Form 16" },
      ]} />
      {(tab === "declarations" || tab === "proofs") && <Declarations fy={fy} proofsOnly={tab === "proofs"} />}
      {tab === "perquisites" && <Perquisites />}
      {tab === "returns" && <Returns fy={fy} />}
    </div>
  );
}

function Declarations({ fy, proofsOnly }: { fy: string; proofsOnly: boolean }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [data, setData] = useState<(Page<Decl> & { counts: Record<string, number> }) | null>(null);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => {
    const qs = new URLSearchParams({ fy, page: String(page), size: "25" });
    if (q) qs.set("q", q);
    const st = proofsOnly ? "proofs_submitted" : filters.status?.join(",");
    if (st) qs.set("status", st);
    api.get<typeof data>(`/payroll/tax/declarations?${qs}`).then(setData).catch((e) => toast.error(errMsg(e)));
  }, [fy, page, q, filters, proofsOnly, toast]);
  useEffect(() => { load(); }, [load]);
  async function openRow(d: Decl) {
    if (d.uuid) { setOpen(d.uuid); return; }
    try { const x = await api.post<Decl>(`/payroll/tax/declarations/start/${d.employee_uuid}?fy=${fy}`); setOpen(x.uuid); load(); } catch (e) { toast.error(errMsg(e)); }
  }
  const columns: Column<Decl>[] = [
    { key: "who", header: "Employee", cell: (d) => <div><p className="text-ink">{d.employee_name}</p><p className="text-[12.5px] text-faint">{d.employee_code} · PAN {d.pan ?? <span className="text-amber-700">missing</span>}</p></div> },
    { key: "regime", header: "Regime", cell: (d) => <Badge tone={d.regime === "new" ? "accent" : "neutral"}>{d.regime === "new" ? "New" : "Old"}</Badge> },
    { key: "dec", header: "Declared", align: "right", hideBelow: "md", cell: (d) => <span className="tabular text-muted">{inr(d.declared_total)}</span> },
    { key: "rent", header: "Rent", align: "right", hideBelow: "lg", cell: (d) => <span className="tabular text-muted">{inr(d.rent_total)}</span> },
    { key: "app", header: "Approved", align: "right", hideBelow: "md", cell: (d) => <span className="tabular text-ink">{inr(d.approved_total)}</span> },
    { key: "st", header: "Status", cell: (d) => <StatusPill status={d.status} /> },
  ];
  const c = data?.counts ?? {};
  return (
    <>
      {!proofsOnly && (
        <div className="mb-4 grid gap-4 sm:grid-cols-4">
          {[["Not started", c.not_started], ["Declared", (c.submitted ?? 0) + (c.draft ?? 0)], ["Proofs to verify", c.proofs_submitted], ["Verified", c.verified]].map(([l, v]) => (
            <Paper key={l as string} className="p-4"><p className="text-[13px] text-muted">{l}</p><p className="tabular mt-1 text-[24px] font-extralight text-ink">{v ?? 0}</p></Paper>
          ))}
        </div>
      )}
      <FilterBar searchPlaceholder="Search by name or ID" onSearchChange={(x) => { setQ(x); setPage(1); }} values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        filters={proofsOnly ? [] : [{ key: "status", label: "Status", multiple: true, options: [{ value: "not_started", label: "Not started" }, { value: "draft", label: "Draft" }, { value: "submitted", label: "Declared" }, { value: "proofs_submitted", label: "Proofs sent" }, { value: "verified", label: "Verified" }] }]} />
      <DataTable rows={data?.items ?? []} rowKey={(d) => `${d.employee_id}`} columns={columns} loading={!data} onRowClick={openRow}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={ReceiptIndianRupee} emptyTitle={proofsOnly ? "No proofs waiting" : "No one here"} />
      <DeclarationModal uuid={open} open={!!open} onClose={() => setOpen(null)} onChanged={load} />
    </>
  );
}

function DeclarationModal({ uuid, open, onClose, onChanged }: { uuid: string | null; open: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<(Decl & { hra: any; files: { uuid: string; item: string; filename: string }[]; previous_employer: any }) | null>(null);
  const [dec, setDec] = useState<Record<string, { status: string; approved: number | null; comment: string }>>({});
  const [hraApproved, setHraApproved] = useState<number | null>(null);
  const [cmp, setCmp] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !uuid) return;
    setD(null); setCmp(null);
    api.get<NonNullable<typeof d>>(`/payroll/tax/declarations/${uuid}`).then((x) => {
      setD(x);
      setDec(Object.fromEntries(x.items.map((i) => [i.key, { status: ["accepted", "rejected", "partial"].includes(i.status) ? i.status : "accepted", approved: i.approved ? Number(i.approved) : Number(i.proof_amount ?? i.declared), comment: i.comment ?? "" }])));
      setHraApproved(Number(x.rent_total));
      api.get(`/payroll/tax/employees/${x.employee_uuid}/compare?fy=${x.fy}`).then(setCmp).catch(() => {});
    }).catch((e) => toast.error(errMsg(e)));
  }, [uuid, open, toast]);
  async function verify(complete: boolean) {
    if (!d) return;
    setBusy(true);
    try {
      await api.post(`/payroll/tax/declarations/${d.uuid}/verify`, { items: Object.entries(dec).map(([key, v]) => ({ key, ...v })), hra_approved: hraApproved, complete });
      toast.success(complete ? "Proofs verified; tax uses the approved amounts from the next payroll" : "Saved");
      onChanged(); if (complete) onClose();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function setRegime(regime: string) {
    if (!d) return;
    try { await api.put(`/payroll/tax/declarations/${d.uuid}`, { regime }); setD({ ...d, regime }); onChanged(); toast.success("Regime changed"); } catch (e) { toast.error(errMsg(e)); }
  }
  const files = (key: string) => d?.files.filter((f) => f.item === key) ?? [];
  return (
    <Modal open={open} onClose={onClose} size="xl" title={d ? `${d.employee_name} · FY ${d.fy}` : "Declaration"} busy={busy}
      headerActions={d && <StatusPill status={d.status} />}
      footer={d && <><Button variant="secondary" loading={busy} onClick={() => verify(false)}>Save review</Button><Button variant="primary" icon={CheckCircle2} loading={busy} onClick={() => verify(true)}>Verification complete</Button></>}>
      {!d ? <p className="py-10 text-center text-muted">Loading…</p> : (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4">
            {d.items.length === 0 && !d.hra?.months?.length && <p className="text-[14px] text-muted">Nothing declared yet.</p>}
            {d.items.map((i) => (
              <div key={i.key} className="rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div><p className="text-[14px] text-ink">{i.label}</p><p className="text-[12.5px] text-faint">{i.section} · declared {inr(i.declared)}{i.proof_amount ? ` · proof ${inr(i.proof_amount)}` : ""}</p></div>
                  <div className="flex gap-1">{files(i.key).map((f) => (
                    <Button key={f.uuid} size="sm" variant="ghost" icon={Paperclip} onClick={() => downloadWithAuth(`/payroll/tax/files/${f.uuid}`, f.filename, true)}>{f.filename.slice(0, 18)}</Button>))}
                    {!files(i.key).length && <Badge tone="warn">No proof</Badge>}</div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1.6fr_1fr_1.4fr]">
                  <RadioCards value={dec[i.key]?.status ?? "accepted"} columns={3} onChange={(s) => setDec({ ...dec, [i.key]: { ...dec[i.key], status: s } })}
                    options={[{ value: "accepted", label: "Accept" }, { value: "partial", label: "Part" }, { value: "rejected", label: "Reject" }]} />
                  <NumberInput value={dec[i.key]?.approved ?? null} onChange={(x) => setDec({ ...dec, [i.key]: { ...dec[i.key], approved: x } })} placeholder="Approved" />
                  <TextInput value={dec[i.key]?.comment ?? ""} onValueChange={(x) => setDec({ ...dec, [i.key]: { ...dec[i.key], comment: x } })} placeholder="Comment for the employee" />
                </div>
              </div>
            ))}
            {d.hra?.months?.length > 0 && (
              <div className="rounded-xl border border-line p-4">
                <p className="flex items-center gap-2 text-[14px] text-ink"><Home size={15} strokeWidth={1.4} />Rent {inr(d.rent_total)} for {d.hra.months.length} months</p>
                <p className="text-[12.5px] text-faint">Landlord {d.hra.landlord_name ?? "—"} · PAN {d.hra.landlord_pan ?? "not given"} · {d.hra.metro ? "metro" : "non-metro"}</p>
                <div className="mt-3 flex items-center gap-3"><span className="text-[13px] text-muted">Rent accepted</span><div className="w-44"><NumberInput value={hraApproved} onChange={setHraApproved} /></div>
                  {files("hra").map((f) => <Button key={f.uuid} size="sm" variant="ghost" icon={Paperclip} onClick={() => downloadWithAuth(`/payroll/tax/files/${f.uuid}`, f.filename, true)}>Receipt</Button>)}</div>
              </div>
            )}
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-line p-4">
              <p className="mb-2 text-[14px] text-ink">Regime</p>
              <RadioCards value={d.regime} onChange={setRegime} columns={2} options={[{ value: "new", label: "New", description: cmp ? inr(cmp.new.annual_tax) : undefined }, { value: "old", label: "Old", description: cmp ? inr(cmp.old.annual_tax) : undefined }]} />
              {cmp && <p className="mt-2 text-[12.5px] text-muted">The {cmp.better} regime saves {inr(cmp.saving)} on current figures.</p>}
            </div>
            {d.previous_employer?.income && Number(d.previous_employer.income) > 0 && (
              <div className="rounded-xl border border-line p-4 text-[13.5px]"><p className="mb-1 text-ink">Previous employer</p>
                <Row label={d.previous_employer.employer_name ?? "Income"} value={inr(d.previous_employer.income)} /><Row label="TDS" value={inr(d.previous_employer.tds)} /></div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Perquisites() {
  const toast = useToast();
  const [data, setData] = useState<{ items: any[]; loans: { employee_name: string; monthly_value: string }[] } | null>(null);
  const [form, setForm] = useState(false);
  const [emp, setEmp] = useState<string | null>(null);
  const [kind, setKind] = useState("car");
  const [details, setDetails] = useState<any>({ engine_cc: 1500, driver: false });
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const load = useCallback(() => { api.get<typeof data>("/payroll/tax/perquisites").then(setData).catch((e) => toast.error(errMsg(e))); }, [toast]);
  useEffect(() => { load(); }, [load]);
  async function save() {
    try { await api.post("/payroll/tax/perquisites", { employee_uuid: emp, kind, details, effective_from: from }); toast.success("Perquisite added"); setForm(false); load(); }
    catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <div className="space-y-5">
      <Paper>
        <PaperHeader title="Taxable benefits" action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setForm(true)}>Add</Button>} />
        {data?.items.length ? <ul className="divide-y divide-line">{data.items.map((p) => (
          <li key={p.uuid} className="flex items-center gap-3 px-5 py-3">
            {p.kind === "car" ? <Car size={16} strokeWidth={1.4} className="text-faint" /> : <Home size={16} strokeWidth={1.4} className="text-faint" />}
            <div className="flex-1"><p className="text-[14px] text-ink">{p.employee_name} · {p.kind}</p><p className="text-[12.5px] text-faint">From {formatDate(p.effective_from)}{p.details.engine_cc ? ` · ${p.details.engine_cc} cc${p.details.driver ? " with driver" : ""}` : ""}{p.details.city_band ? ` · ${p.details.city_band.replace(/_/g, " ")}` : ""}</p></div>
            <span className="tabular text-ink">{inr(p.monthly_value)} a month</span>
          </li>))}</ul> : <EmptyState icon={Car} title="No perquisites" hint="Company car, housing and other benefits are added to taxable salary." />}
      </Paper>
      <Paper>
        <PaperHeader title="Concessional loans" />
        {data?.loans.length ? <ul className="divide-y divide-line">{data.loans.map((l, i) => <li key={i} className="flex justify-between px-5 py-3 text-[14px]"><span className="text-ink">{l.employee_name}</span><span className="tabular text-muted">{inr(l.monthly_value)} a month</span></li>)}</ul>
          : <p className="px-5 py-4 text-[13.5px] text-muted">Loans below the reference rate add a taxable value automatically when all loans of a person exceed the exempt limit.</p>}
      </Paper>
      <Modal open={form} onClose={() => setForm(false)} size="md" title="Add perquisite" footer={<><ModalCancel /><Button variant="primary" disabled={!emp} onClick={save}>Add</Button></>}>
        <div className="space-y-5">
          <Field label="Employee" required><Select value={emp} onChange={setEmp} loadOptions={loadPayrollEmployees} /></Field>
          <RadioCards value={kind} onChange={(k) => { setKind(k); setDetails(k === "car" ? { engine_cc: 1500, driver: false } : k === "accommodation" ? { city_band: "population_above_40_lakh", recovered: 0 } : { monthly_value: 0 }); }} columns={3}
            options={[{ value: "car", label: "Company car" }, { value: "accommodation", label: "Housing" }, { value: "other", label: "Other" }]} />
          {kind === "car" && <FormGrid><Field label="Engine (cc)"><NumberInput value={details.engine_cc} onChange={(x) => setDetails({ ...details, engine_cc: x })} /></Field><div className="pt-6"><Toggle checked={!!details.driver} onChange={(x) => setDetails({ ...details, driver: x })} label="With driver" /></div></FormGrid>}
          {kind === "accommodation" && <FormGrid>
            <Field label="City"><Select value={details.city_band} onChange={(x) => setDetails({ ...details, city_band: x })} options={[{ value: "population_above_40_lakh", label: "Above 40 lakh people (10%)" }, { value: "population_15_to_40_lakh", label: "15 to 40 lakh (7.5%)" }, { value: "other", label: "Other (5%)" }]} /></Field>
            <Field label="Rent recovered a month"><NumberInput value={details.recovered} onChange={(x) => setDetails({ ...details, recovered: x })} /></Field></FormGrid>}
          {kind === "other" && <Field label="Value a month"><NumberInput value={details.monthly_value} onChange={(x) => setDetails({ ...details, monthly_value: x })} /></Field>}
          <Field label="From"><DateInput value={from} onChange={setFrom} /></Field>
        </div>
      </Modal>
    </div>
  );
}

function Returns({ fy }: { fy: string }) {
  const toast = useToast();
  const partA = useRef<HTMLInputElement>(null);
  const opening = useRef<HTMLInputElement>(null);
  const dl = (p: string, n: string) => downloadWithAuth(p, n).catch((e) => toast.error(errMsg(e)));
  async function uploadPartA(files: FileList) {
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    try { const r = await postForm<{ matched: number; unmatched: string[] }>(`/payroll/tax/form16/part-a?fy=${fy}`, fd); toast.success(`${r.matched} Part A files matched by PAN`, r.unmatched.length ? { description: `Not matched: ${r.unmatched.join(", ")}` } : undefined); }
    catch (e) { toast.error(errMsg(e)); }
  }
  async function uploadOpening(f: File) {
    const fd = new FormData(); fd.append("file", f);
    try { const r = await postForm<{ imported: number; errors: unknown[] }>(`/payroll/tax/opening-balances?fy=${fy}`, fd); toast.success(`${r.imported} opening balances saved`); }
    catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Paper>
        <PaperHeader title="Quarterly TDS return" />
        <ul className="divide-y divide-line">{[1, 2, 3, 4].map((q) => (
          <li key={q} className="flex items-center justify-between px-5 py-3">
            <div><p className="text-[14px] text-ink">Quarter {q}</p><p className="text-[12.5px] text-faint">{["April–June", "July–September", "October–December", "January–March (with salary details)"][q - 1]}</p></div>
            <div className="flex gap-2"><Button size="sm" variant="ghost" icon={FileText} onClick={() => dl(`/payroll/tax/return?fy=${fy}&quarter=${q}&format=txt`, `24Q-Q${q}.txt`)}>Text file</Button>
              <Button size="sm" variant="ghost" icon={Download} onClick={() => dl(`/payroll/tax/return?fy=${fy}&quarter=${q}&format=xlsx`, `24Q-Q${q}.xlsx`)}>Excel</Button></div>
          </li>))}</ul>
        <p className="px-5 pb-4 text-[12.5px] text-faint">Laid out for the File Validation Utility. Check it with the FVU before filing.</p>
      </Paper>
      <Paper>
        <PaperHeader title="Form 16" />
        <div className="space-y-4 p-5">
          <p className="text-[13.5px] text-muted">Part B is made from the year's locked payroll. Upload Part A from TRACES (file names with the PAN) to merge both into one PDF per person.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={Download} onClick={() => dl(`/payroll/tax/form16?fy=${fy}`, `Form16-${fy}.zip`)}>Download all (zip)</Button>
            <input ref={partA} type="file" accept="application/pdf" multiple hidden onChange={(e) => e.target.files && uploadPartA(e.target.files)} />
            <Button variant="secondary" icon={Upload} onClick={() => partA.current?.click()}>Upload Part A</Button>
          </div>
        </div>
      </Paper>
      <Form16Signing fy={fy} />
      <Paper>
        <PaperHeader title="Opening balances" />
        <div className="space-y-3 p-5">
          <p className="text-[13.5px] text-muted">Moving from another payroll mid-year? Upload what was already paid this year: employee_code, gross, taxable, tds, pf, pt, basic_da, hra.</p>
          <input ref={opening} type="file" accept=".csv,.xlsx" hidden onChange={(e) => e.target.files?.[0] && uploadOpening(e.target.files[0])} />
          <Button variant="secondary" icon={Upload} onClick={() => opening.current?.click()}>Upload CSV or Excel</Button>
        </div>
      </Paper>
    </div>
  );
}
