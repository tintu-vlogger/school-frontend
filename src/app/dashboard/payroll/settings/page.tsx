"use client";

/*
 * Payroll settings: general rules (rounding, part months, overtime formula, bonus rate,
 * checks), payslips and tax windows, pay groups and periods, the statutory library with
 * company overrides and minimum wage import, bank file formats and GL mapping.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Pencil, Plus, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, FormSection, Modal, ModalCancel, NumberInput, Select, Tabs, TextInput,
  Textarea, Toggle, type Column, type FilterValues,
} from "@/components/ui-kit";
import { STATES, errMsg, postForm } from "@/components/payroll/common";
import { BankSettings } from "@/components/payroll/bank-settings";

type Tab = "general" | "payslips" | "groups" | "statutory" | "bank" | "gl";

export default function PayrollSettingsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const tab = (params.get("tab") as Tab) || "general";
  const [s, setS] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get("/payroll/settings").then(setS).catch((e) => toast.error(errMsg(e))); }, [toast]);
  const set = (path: string, v: unknown) => setS((o: any) => {
    const n = structuredClone(o); const keys = path.split("."); let cur = n;
    keys.slice(0, -1).forEach((k) => { cur[k] = cur[k] ?? {}; cur = cur[k]; }); cur[keys[keys.length - 1]] = v; return n;
  });
  async function save() {
    setSaving(true);
    try { setS(await api.put("/payroll/settings", s)); toast.success("Settings saved"); } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }
  const saveBar = <div className="mt-5 flex justify-end"><Button variant="primary" loading={saving} onClick={save}>Save settings</Button></div>;
  return (
    <div>
      <PageHeader eyebrow="Settings" title="Payroll settings" description="How pay is worked out, payslips, pay groups, statutory rules, bank files and accounts." />
      <Tabs value={tab} onChange={(t) => router.replace(`/dashboard/payroll/settings${t === "general" ? "" : `?tab=${t}`}`, { scroll: false })} className="mb-5" items={[
        { value: "general", label: "General" }, { value: "payslips", label: "Payslips and tax" }, { value: "groups", label: "Pay groups" },
        { value: "statutory", label: "Statutory rules" }, { value: "bank", label: "Bank files" }, { value: "gl", label: "Accounts" },
      ]} />
      {!s ? <Paper className="p-10 text-center text-muted">Loading…</Paper> : (
        <>
          {tab === "general" && (<Paper className="p-6">
            <FormSection title="Calculation">
              <FormGrid>
                <Field label="Round net pay"><Select value={s.rounding} onChange={(v) => set("rounding", v)} options={[{ value: "nearest", label: "To the nearest rupee" }, { value: "up", label: "Up" }, { value: "down", label: "Down" }, { value: "none", label: "Keep paise" }]} /></Field>
                <Field label="Part months are paid on" hint="Pay groups can choose their own"><Select value={s.proration_basis} onChange={(v) => set("proration_basis", v)} options={[{ value: "calendar", label: "Calendar days" }, { value: "fixed_30", label: "Fixed 30 days" }, { value: "fixed_26", label: "Fixed 26 days" }, { value: "working_days", label: "Working days" }]} /></Field>
                <Field label="Overtime formula" hint="Uses basic, da, gross and hours. Twice the normal rate by law."><TextInput value={s.overtime_formula} onValueChange={(v) => set("overtime_formula", v)} className="font-mono" /></Field>
                <Field label="Statutory bonus rate (%)" hint="Between 8.33 and 20"><NumberInput value={Number(s.bonus_rate)} onChange={(v) => set("bonus_rate", v)} min={8.33} max={20} step={0.01} /></Field>
                <Field label="Flag pay changes above (%)"><NumberInput value={Number(s.variance_percent)} onChange={(v) => set("variance_percent", v)} min={1} /></Field>
                <Field label="Default state for PT and LWF" hint="When a location has no state"><Select value={s.default_state} onChange={(v) => set("default_state", v)} options={STATES} clearable /></Field>
              </FormGrid>
            </FormSection>
            <FormSection title="Provident fund">
              <FormGrid>
                <Field label="Employee PF on"><Select value={s.pf.employee_basis} onChange={(v) => set("pf.employee_basis", v)} options={[{ value: "ceiling", label: "Wages up to ₹15,000" }, { value: "actual", label: "Actual wages" }]} /></Field>
                <Field label="Employer PF on"><Select value={s.pf.employer_basis} onChange={(v) => set("pf.employer_basis", v)} options={[{ value: "ceiling", label: "Wages up to ₹15,000 (restricted)" }, { value: "actual", label: "Actual wages" }]} /></Field>
                <Toggle checked={!!s.pf.apply_wage_rule} onChange={(v) => set("pf.apply_wage_rule", v)} label="Use the 50% wage rule for PF wages" description="Adds allowances above half of pay to PF wages" />
                <Toggle checked={!!s.esi_include_overtime} onChange={(v) => set("esi_include_overtime", v)} label="ESI on overtime" />
              </FormGrid>
            </FormSection>
            <FormSection title="Checks before payroll">
              <FormGrid>
                <Toggle checked={!!s.checks.block_below_min_wage} onChange={(v) => set("checks.block_below_min_wage", v)} label="Stop payroll below minimum wage" description="Needs an acknowledgement with a reason" />
                <Toggle checked={!!s.checks.block_negative_net} onChange={(v) => set("checks.block_negative_net", v)} label="Stop payroll on negative take-home" />
                <Field label="Missing bank details"><Select value={s.checks.missing_bank} onChange={(v) => set("checks.missing_bank", v)} options={[{ value: "warn", label: "Warn" }, { value: "block", label: "Stop" }]} /></Field>
              </FormGrid>
            </FormSection>
            <FormSection title="Final settlement">
              <FormGrid>
                <Field label="Leave encashment on"><Select value={s.settlement.leave_encash_basis} onChange={(v) => set("settlement.leave_encash_basis", v)} options={[{ value: "basic_da", label: "Basic and DA" }, { value: "gross", label: "Gross" }]} /></Field>
                <Field label="Days in a month for encashment"><NumberInput value={Number(s.settlement.leave_encash_divisor)} onChange={(v) => set("settlement.leave_encash_divisor", v)} /></Field>
                <Field label="Notice pay on"><Select value={s.settlement.notice_basis} onChange={(v) => set("settlement.notice_basis", v)} options={[{ value: "gross", label: "Gross" }, { value: "basic_da", label: "Basic and DA" }]} /></Field>
                <Toggle checked={!!s.settlement.pay_bonus_on_exit} onChange={(v) => set("settlement.pay_bonus_on_exit", v)} label="Pay statutory bonus on exit" />
              </FormGrid>
            </FormSection>
            {saveBar}
          </Paper>)}
          {tab === "payslips" && (<Paper className="p-6">
            <FormSection title="Payslips">
              <FormGrid>
                <Field label="PDF password"><Select value={s.payslip.password} onChange={(v) => set("payslip.password", v)} options={[{ value: "pan", label: "PAN in capitals" }, { value: "pan_dob", label: "First 5 of PAN + birth day and month" }, { value: "none", label: "No password" }]} /></Field>
                <Field label="Accent colour"><TextInput value={s.payslip.accent} onValueChange={(v) => set("payslip.accent", v)} /></Field>
                <Toggle checked={!!s.payslip.hindi} onChange={(v) => set("payslip.hindi", v)} label="Hindi labels" />
                <Toggle checked={!!s.payslip.show_ytd} onChange={(v) => set("payslip.show_ytd", v)} label="Year-to-date column" />
                <Toggle checked={!!s.payslip.show_leave} onChange={(v) => set("payslip.show_leave", v)} label="Leave balance" />
                <Toggle checked={!!s.payslip.show_tax} onChange={(v) => set("payslip.show_tax", v)} label="Tax summary" />
                <Toggle checked={!!s.payslip.email_on_publish} onChange={(v) => set("payslip.email_on_publish", v)} label="Email payslips when published" />
              </FormGrid>
              <Field label="Footer" className="mt-5"><Textarea value={s.payslip.footer} onValueChange={(v) => set("payslip.footer", v)} rows={2} /></Field>
            </FormSection>
            <FormSection title="Income tax" description="Dates are month-day within the financial year.">
              <FormGrid columns={3}>
                <Field label="Default regime"><Select value={s.tax.default_regime} onChange={(v) => set("tax.default_regime", v)} options={[{ value: "new", label: "New" }, { value: "old", label: "Old" }]} /></Field>
                <Field label="Declarations from"><TextInput value={s.tax.declaration_from} onValueChange={(v) => set("tax.declaration_from", v)} placeholder="04-01" /></Field>
                <Field label="Declarations until"><TextInput value={s.tax.declaration_to} onValueChange={(v) => set("tax.declaration_to", v)} /></Field>
                <Field label="Proofs from"><TextInput value={s.tax.proof_from} onValueChange={(v) => set("tax.proof_from", v)} /></Field>
                <Field label="Proofs until"><TextInput value={s.tax.proof_to} onValueChange={(v) => set("tax.proof_to", v)} /></Field>
                <div className="pt-6"><Toggle checked={!!s.tax.allow_regime_change} onChange={(v) => set("tax.allow_regime_change", v)} label="Employees may change regime" /></div>
              </FormGrid>
            </FormSection>
            {saveBar}
          </Paper>)}
          {tab === "groups" && <Groups />}
          {tab === "statutory" && <Statutory />}
          {tab === "bank" && <BankSettings s={s} set={set} saveBar={saveBar} />}
          {tab === "gl" && (<Paper className="p-6">
            <p className="mb-4 text-[13.5px] text-muted">Ledgers used for the payroll journal. Salary costs use each component's own GL code (Salary components), else the default.</p>
            <FormGrid columns={3}>
              {[["salary_payable", "Salary payable"], ["pf_payable", "PF payable"], ["esi_payable", "ESI payable"], ["pt_payable", "Professional Tax payable"], ["lwf_payable", "LWF payable"], ["tds_payable", "TDS payable"], ["loan_recovery", "Loans to employees"], ["other_deductions", "Other recoveries"], ["gratuity_payable", "Gratuity provision"], ["employer_cost_default", "Default salary cost"]].map(([k, l]) => (
                <Field key={k} label={l}><TextInput value={s.gl?.[k] ?? ""} onValueChange={(v) => set(`gl.${k}`, v)} /></Field>
              ))}
            </FormGrid>
            {saveBar}
          </Paper>)}
        </>
      )}
    </div>
  );
}

function Groups() {
  const toast = useToast();
  const [rows, setRows] = useState<any[] | null>(null);
  const [periods, setPeriods] = useState<any[]>([]);
  const [form, setForm] = useState<any | null>(null);
  const load = useCallback(() => {
    api.get<any[]>("/payroll/pay-groups").then(setRows).catch((e) => toast.error(errMsg(e)));
    api.get<any[]>("/payroll/pay-periods").then(setPeriods).catch(() => {});
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  async function save() {
    try { if (form.uuid) await api.put(`/payroll/pay-groups/${form.uuid}`, form); else await api.post("/payroll/pay-groups", form); toast.success("Saved"); setForm(null); load(); }
    catch (e) { toast.error(errMsg(e)); }
  }
  const columns: Column<any>[] = [
    { key: "n", header: "Pay group", cell: (g) => <div><p className="text-ink">{g.name} {g.is_default && <Badge tone="accent">Default</Badge>}</p><p className="text-[12.5px] text-faint">{g.employees} people</p></div> },
    { key: "c", header: "Attendance cut-off", cell: (g) => <span className="text-muted">Day {g.attendance_cutoff_day}</span> },
    { key: "p", header: "Pay day", cell: (g) => <span className="text-muted">Day {g.pay_day} of {g.pay_day_same_month ? "the same" : "the next"} month</span> },
    { key: "b", header: "Part months", hideBelow: "md", cell: (g) => <span className="text-muted">{({ calendar: "Calendar days", fixed_30: "30 days", fixed_26: "26 days", working_days: "Working days" } as Record<string, string>)[g.proration_basis]}</span> },
  ];
  return (
    <div className="space-y-5">
      <div className="flex justify-end"><Button variant="primary" icon={Plus} onClick={() => setForm({ name: "", frequency: "monthly", attendance_cutoff_day: 25, pay_day: 1, proration_basis: "calendar", active: true })}>New pay group</Button></div>
      <DataTable rows={rows ?? []} rowKey={(g) => g.uuid} columns={columns} loading={!rows} onRowClick={setForm} rowActions={(g) => [{ label: "Edit", icon: Pencil, onSelect: () => setForm(g) }]} />
      <Paper>
        <PaperHeader title="Pay periods this year (default group)" />
        <ul className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">{periods.map((p) => (
          <li key={p.uuid} className="bg-surface px-5 py-3"><p className="flex items-center justify-between text-[14px] text-ink">{p.label}<Badge tone={p.status === "locked" ? "good" : p.status === "open" ? "accent" : "neutral"}>{p.status}</Badge></p>
            <p className="text-[12.5px] text-faint">Cut-off {formatDate(p.cutoff_date)} · pay {formatDate(p.pay_date)}</p></li>))}</ul>
      </Paper>
      <Modal open={!!form} onClose={() => setForm(null)} size="md" title={form?.uuid ? form.name : "New pay group"} footer={<><ModalCancel /><Button variant="primary" onClick={save}>Save</Button></>}>
        {form && <div className="space-y-4">
          <FormGrid>
            <Field label="Name" required><TextInput value={form.name} onValueChange={(v) => setForm({ ...form, name: v })} /></Field>
            <Field label="Code"><TextInput value={form.code ?? ""} onValueChange={(v) => setForm({ ...form, code: v })} /></Field>
            <Field label="Attendance cut-off day"><NumberInput value={form.attendance_cutoff_day} onChange={(v) => setForm({ ...form, attendance_cutoff_day: v })} min={1} max={31} /></Field>
            <Field label="Pay day"><NumberInput value={form.pay_day} onChange={(v) => setForm({ ...form, pay_day: v })} min={1} max={31} /></Field>
            <Field label="Part months on"><Select value={form.proration_basis} onChange={(v) => setForm({ ...form, proration_basis: v })} options={[{ value: "calendar", label: "Calendar days" }, { value: "fixed_30", label: "Fixed 30 days" }, { value: "fixed_26", label: "Fixed 26 days" }, { value: "working_days", label: "Working days" }]} /></Field>
          </FormGrid>
          <Toggle checked={!!form.pay_day_same_month} onChange={(v) => setForm({ ...form, pay_day_same_month: v })} label="Pay in the same month" description="Wages must be paid by the 7th of the next month" />
          <Toggle checked={!!form.is_default} onChange={(v) => setForm({ ...form, is_default: v })} label="Default group" />
          <Toggle checked={!!form.active} onChange={(v) => setForm({ ...form, active: v })} label="In use" />
        </div>}
      </Modal>
    </div>
  );
}

function Statutory() {
  const toast = useToast();
  const [data, setData] = useState<{ library: any[]; overrides: any[]; kinds: Record<string, string> } | null>(null);
  const [filters, setFilters] = useState<FilterValues>({ kind: ["pt"] });
  const [view, setView] = useState<any | null>(null);
  const [ov, setOv] = useState<any | null>(null);
  const [mwDate, setMwDate] = useState(new Date().toISOString().slice(0, 10));
  const fileRef = useRef<HTMLInputElement>(null);
  const load = useCallback(() => { api.get<typeof data>("/payroll/statutory/rules").then(setData).catch((e) => toast.error(errMsg(e))); }, [toast]);
  useEffect(() => { load(); }, [load]);
  const kinds = Object.entries(data?.kinds ?? {}).map(([value, label]) => ({ value, label }));
  const rows = [...(data?.overrides ?? []).map((x) => ({ ...x, company: true })), ...(data?.library ?? [])].filter((r) => !filters.kind?.length || filters.kind.includes(r.kind));
  const columns: Column<any>[] = [
    { key: "k", header: "Rule", cell: (r) => <div><p className="text-ink">{r.kind_label}{r.scope ? ` · ${r.scope}` : ""}</p><p className="text-[12.5px] text-faint">{r.note}</p></div> },
    { key: "f", header: "From", cell: (r) => <span className="text-muted">{formatDate(r.effective_from)}</span> },
    { key: "s", header: "Source", cell: (r) => r.company ? <Badge tone="accent">{r.active ? "Company" : "Company · off"}</Badge> : <Badge>Library</Badge> },
  ];
  async function saveOverride() {
    try {
      await api.post("/payroll/statutory/overrides", { kind: ov.kind, scope: ov.scope || null, effective_from: ov.effective_from, data: JSON.parse(ov.json), reason: ov.reason });
      toast.success("Your version is saved"); setOv(null); load();
    } catch (e) { toast.error(e instanceof SyntaxError ? "The rule must be valid JSON" : errMsg(e)); }
  }
  async function importMw(f: File) {
    const fd = new FormData(); fd.append("file", f);
    try { const r = await postForm<{ states: string[]; rows: number }>(`/payroll/statutory/minimum-wages/import?effective_from=${mwDate}`, fd); toast.success(`${r.rows} rates for ${r.states.join(", ")}`); load(); }
    catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <div className="space-y-5">
      <Paper className="flex flex-wrap items-end gap-3 p-5">
        <div className="min-w-0 flex-1"><p className="text-[14px] text-ink">Minimum wages</p><p className="text-[13px] text-muted">Import a state's notification as CSV or Excel with columns state, zone, skill, monthly (daily optional).</p></div>
        <Field label="From"><DateInput value={mwDate} onChange={setMwDate} /></Field>
        <input ref={fileRef} type="file" accept=".csv,.xlsx" hidden onChange={(e) => e.target.files?.[0] && importMw(e.target.files[0])} />
        <Button variant="secondary" icon={Upload} onClick={() => fileRef.current?.click()}>Import</Button>
      </Paper>
      <FilterBar values={filters} onChange={setFilters} filters={[{ key: "kind", label: "Rule", multiple: true, options: kinds }]} actions={<Button variant="primary" icon={Plus} onClick={() => setOv({ kind: filters.kind?.[0] ?? "pt", scope: "", effective_from: new Date().toISOString().slice(0, 10), json: "{}", reason: "" })}>Company version</Button>} />
      <DataTable rows={rows} rowKey={(r) => r.uuid} columns={columns} loading={!data} onRowClick={setView} />
      <Modal open={!!view} onClose={() => setView(null)} size="lg" title={view ? `${view.kind_label}${view.scope ? ` · ${view.scope}` : ""}` : ""} description={view ? `From ${formatDate(view.effective_from)}` : undefined}
        footer={view && !view.company && <Button variant="secondary" onClick={() => { setOv({ kind: view.kind, scope: view.scope ?? "", effective_from: new Date().toISOString().slice(0, 10), json: JSON.stringify(view.data, null, 2), reason: "" }); setView(null); }}>Make a company version</Button>}>
        {view && <pre className="max-h-[60vh] overflow-auto rounded-xl bg-sunken/60 p-4 text-[12.5px] text-ink/85">{JSON.stringify(view.data, null, 2)}</pre>}
      </Modal>
      <Modal open={!!ov} onClose={() => setOv(null)} size="lg" title="Company version of a rule" description="You may be more generous than the law, never less. Earlier months keep the earlier rule."
        footer={<><ModalCancel /><Button variant="primary" disabled={!ov?.reason} onClick={saveOverride}>Save</Button></>}>
        {ov && <div className="space-y-4">
          <FormGrid columns={3}>
            <Field label="Rule"><Select value={ov.kind} onChange={(v) => setOv({ ...ov, kind: v })} options={kinds} /></Field>
            <Field label="State or regime"><TextInput value={ov.scope} onValueChange={(v) => setOv({ ...ov, scope: v.toUpperCase() })} placeholder="e.g. KA" /></Field>
            <Field label="From"><DateInput value={ov.effective_from} onChange={(v) => setOv({ ...ov, effective_from: v })} /></Field>
          </FormGrid>
          <Field label="Values (JSON)" hint="Only the fields you change are needed"><Textarea value={ov.json} onValueChange={(v) => setOv({ ...ov, json: v })} rows={10} className="font-mono text-[12.5px]" /></Field>
          <Field label="Reason" required hint="e.g. the notification number"><TextInput value={ov.reason} onValueChange={(v) => setOv({ ...ov, reason: v })} /></Field>
        </div>}
      </Modal>
    </div>
  );
}

void Download;
