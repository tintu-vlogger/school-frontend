"use client";

/*
 * Salary components: earnings, deductions, employer contributions and reimbursements with
 * how each is worked out, its tax treatment, whether it counts as "wages" under the Code on
 * Wages, PF and ESI wages, proration for unpaid days, rounding and payslip display.
 */
import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Puzzle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, FormGrid, FormSection, Modal, ModalCancel, NumberInput, Select, TextInput, Textarea, Toggle,
  type Column, type FilterValues,
} from "@/components/ui-kit";
import { KIND_OPTIONS, can, errMsg, inr, usePayrollAccess } from "@/components/payroll/common";

type Comp = { uuid: string; code: string; name: string; name_hi: string | null; kind: string; kind_label: string; calc: string; calc_label: string;
  formula: string | null; one_time: boolean; taxability: string; tax_exemption: string | null; wage_class: string; pf_wage: boolean;
  esi_wage: boolean; prorate: boolean; rounding: string; in_ctc: boolean; fbp: boolean; fbp_max: string | null; show_on_payslip: boolean;
  show_if_zero: boolean; gl_code: string | null; sort_order: number; is_system: boolean; active: boolean; description: string | null };

const WAGE = { wage: "Wages (Basic, DA, retaining)", exclusion: "Allowance (50% rule)", none: "Not remuneration" } as Record<string, string>;

export default function ComponentsPage() {
  const toast = useToast();
  const access = usePayrollAccess();
  const [rows, setRows] = useState<Comp[] | null>(null);
  const [filters, setFilters] = useState<FilterValues>({});
  const [q, setQ] = useState("");
  const [form, setForm] = useState<{ open: boolean; target: Comp | null; key: number }>({ open: false, target: null, key: 0 });
  const load = useCallback(() => { api.get<Comp[]>("/payroll/components").then(setRows).catch((e) => toast.error(errMsg(e))); }, [toast]);
  useEffect(() => { load(); }, [load]);
  const canEdit = can(access, "payroll.settings");
  const list = (rows ?? []).filter((c) => (!filters.kind?.length || filters.kind.includes(c.kind)) && (!q || `${c.name} ${c.code}`.toLowerCase().includes(q.toLowerCase())));

  const columns: Column<Comp>[] = [
    { key: "name", header: "Component", cell: (c) => <div><p className="text-ink">{c.name} {!c.active && <span className="text-faint">· off</span>}</p><p className="text-[12.5px] text-faint"><span className="font-mono">{c.code}</span>{c.name_hi ? ` · ${c.name_hi}` : ""}</p></div> },
    { key: "kind", header: "Type", hideBelow: "md", cell: (c) => <span className="text-muted">{c.kind_label}</span> },
    { key: "calc", header: "Worked out", hideBelow: "lg", cell: (c) => <span className="text-muted">{c.calc === "formula" && c.formula ? <span className="font-mono text-[12.5px]">{c.formula}</span> : c.calc_label}</span> },
    { key: "flags", header: "Applies to", cell: (c) => <span className="flex flex-wrap gap-1">
      {c.wage_class === "wage" && <Badge tone="accent">Wages</Badge>}{c.pf_wage && <Badge>PF</Badge>}{c.esi_wage && <Badge>ESI</Badge>}
      {c.taxability === "exempt" ? <Badge tone="good">Tax-free</Badge> : c.taxability === "partly" ? <Badge tone="info">Partly taxable</Badge> : null}
      {c.one_time && <Badge tone="warn">One-time</Badge>}{c.fbp && <Badge tone="info">Flexible</Badge>}</span> },
  ];
  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Salary components" description="Every part of pay: how it is worked out, taxed and counted for PF, ESI and the Code on Wages."
        actions={canEdit && <Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, target: null, key: form.key + 1 })}>New component</Button>} />
      <FilterBar searchPlaceholder="Search components" onSearchChange={setQ} values={filters} onChange={setFilters}
        filters={[{ key: "kind", label: "Type", multiple: true, options: KIND_OPTIONS }]} />
      <DataTable rows={list} rowKey={(c) => c.uuid} columns={columns} loading={!rows} onRowClick={(c) => canEdit && setForm({ open: true, target: c, key: form.key + 1 })}
        rowActions={(c) => canEdit ? [{ label: "Edit", icon: Pencil, onSelect: () => setForm({ open: true, target: c, key: form.key + 1 }) }] : []}
        emptyIcon={Puzzle} emptyTitle="No components" />
      <ComponentForm key={form.key} open={form.open} target={form.target} onClose={() => setForm({ ...form, open: false })} onSaved={() => { setForm({ ...form, open: false }); load(); }} />
    </div>
  );
}

function ComponentForm({ open, target, onClose, onSaved }: { open: boolean; target: Comp | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Partial<Comp>>(target ?? { kind: "earning", calc: "fixed", taxability: "taxable", wage_class: "exclusion", prorate: true,
    rounding: "nearest", in_ctc: true, show_on_payslip: true, active: true, sort_order: 100, pf_wage: false, esi_wage: true, one_time: false, fbp: false });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Comp, x: unknown) => setV((o) => ({ ...o, [k]: x }));
  const system = !!target?.is_system && target.calc === "system";
  async function save() {
    setBusy(true);
    try {
      const body = { ...v, fbp_max: v.fbp_max ? Number(v.fbp_max) : null };
      if (target) await api.put(`/payroll/components/${target.uuid}`, body); else await api.post("/payroll/components", body);
      toast.success("Saved");
      onSaved();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" title={target ? target.name : "New salary component"} description={system ? "Worked out by payroll; you can change its name, labels, display and GL code." : undefined}
      busy={busy} dirty footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <FormSection title="Basics">
        <FormGrid>
          <Field label="Name" required><TextInput value={v.name ?? ""} onValueChange={(x) => set("name", x)} /></Field>
          <Field label="Code" required hint="Used in formulas"><TextInput value={v.code ?? ""} disabled={!!target} onValueChange={(x) => set("code", x.toUpperCase())} className="font-mono" /></Field>
          <Field label="Hindi label" hint="On payslips"><TextInput value={v.name_hi ?? ""} onValueChange={(x) => set("name_hi", x)} /></Field>
          <Field label="Type"><Select value={v.kind ?? null} onChange={(x) => set("kind", x)} options={KIND_OPTIONS} disabled={system} /></Field>
          <Field label="Worked out"><Select value={v.calc ?? null} onChange={(x) => set("calc", x)} disabled={system} options={[
            { value: "fixed", label: "Fixed amount" }, { value: "formula", label: "Formula" }, { value: "balance", label: "Balancing figure" }, { value: "manual", label: "Typed in each month" },
            ...(system ? [{ value: "system", label: "By payroll" }] : [])]} /></Field>
          {v.calc === "formula" && <Field label="Default formula"><TextInput value={v.formula ?? ""} onValueChange={(x) => set("formula", x)} className="font-mono" placeholder="round(basic * 0.4)" /></Field>}
        </FormGrid>
      </FormSection>
      <FormSection title="Law and tax">
        <FormGrid>
          <Field label="Code on Wages" hint="Allowances above 50% of pay are added back to wages"><Select value={v.wage_class ?? null} onChange={(x) => set("wage_class", x)} options={Object.entries(WAGE).map(([value, label]) => ({ value, label }))} /></Field>
          <Field label="Income tax"><Select value={v.taxability ?? null} onChange={(x) => set("taxability", x)} options={[{ value: "taxable", label: "Taxable" }, { value: "partly", label: "Partly exempt (by rule)" }, { value: "exempt", label: "Tax-free" }]} /></Field>
          {v.taxability === "partly" && <Field label="Exemption rule"><Select value={v.tax_exemption ?? null} onChange={(x) => set("tax_exemption", x)} options={[{ value: "hra", label: "House rent allowance" }, { value: "lta", label: "Leave travel" }, { value: "bills", label: "Against bills" }, { value: "employer_nps", label: "Employer NPS" }]} /></Field>}
          <Toggle checked={!!v.pf_wage} onChange={(x) => set("pf_wage", x)} label="Counts for PF" />
          <Toggle checked={!!v.esi_wage} onChange={(x) => set("esi_wage", x)} label="Counts for ESI" />
          <Toggle checked={!!v.prorate} onChange={(x) => set("prorate", x)} label="Cut for unpaid days" />
          <Toggle checked={!!v.one_time} onChange={(x) => set("one_time", x)} label="One-time payment" description="Taxed in full in the month paid" />
        </FormGrid>
      </FormSection>
      <FormSection title="Display and accounts">
        <FormGrid>
          <Field label="Rounding"><Select value={v.rounding ?? null} onChange={(x) => set("rounding", x)} options={[{ value: "nearest", label: "Nearest rupee" }, { value: "up", label: "Up" }, { value: "down", label: "Down" }, { value: "none", label: "Two decimals" }]} /></Field>
          <Field label="GL code"><TextInput value={v.gl_code ?? ""} onValueChange={(x) => set("gl_code", x)} /></Field>
          <Field label="Order"><NumberInput value={v.sort_order ?? 100} onChange={(x) => set("sort_order", x ?? 100)} /></Field>
          <Toggle checked={!!v.in_ctc} onChange={(x) => set("in_ctc", x)} label="Part of CTC" />
          <Toggle checked={!!v.show_on_payslip} onChange={(x) => set("show_on_payslip", x)} label="Show on payslip" />
          <Toggle checked={!!v.fbp} onChange={(x) => set("fbp", x)} label="Flexible benefit" description={v.fbp_max ? `Up to ${inr(v.fbp_max)} a year` : "Employees choose an amount"} />
          {v.fbp && <Field label="Yearly limit"><NumberInput value={v.fbp_max ? Number(v.fbp_max) : null} onChange={(x) => set("fbp_max", x)} /></Field>}
          <Toggle checked={!!v.active} onChange={(x) => set("active", x)} label="In use" />
        </FormGrid>
        <Field label="Description" className="mt-5"><Textarea value={v.description ?? ""} onValueChange={(x) => set("description", x)} rows={2} /></Field>
      </FormSection>
    </Modal>
  );
}
