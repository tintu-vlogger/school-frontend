"use client";

/*
 * Lists of detail rows on the employee profile (emergency contacts, family, nominees,
 * bank accounts, education, previous jobs), each with an add/edit modal built from a
 * field spec. Saves go to /employees/{uuid}/details/{kind}.
 *
 *   <DetailList kind="family" employeeUuid={p.uuid} rows={p.family} canEdit onChanged={reload} />
 */
import { useState, type ReactNode } from "react";
import {
  Banknote, BriefcaseBusiness, GraduationCap, HeartHandshake, Pencil, Phone, Plus, ShieldCheck, Trash2, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, DateInput, Field, FormGrid, IconButton, MasterSelect, Modal, ModalCancel, NumberInput, Select, TextInput, Textarea,
  Toggle, useConfirm, type IconType, type SelectOption,
} from "@/components/ui-kit";
import { NOMINEE_KINDS, day, money, type Row } from "./types";

type FieldSpec = {
  key: string; label: string; type: "text" | "date" | "master" | "number" | "money" | "toggle" | "select" | "textarea" | "year";
  master?: string; options?: SelectOption[]; required?: boolean; span?: 2; hint?: string; upper?: boolean;
};

export type Kind = "emergency-contacts" | "family" | "nominees" | "bank-accounts" | "education" | "experience";

const SPECS: Record<Kind, { title: string; noun: string; icon: IconType; empty: string; fields: FieldSpec[] }> = {
  "emergency-contacts": {
    title: "Emergency contacts", noun: "contact", icon: Phone, empty: "No one to call in an emergency yet.",
    fields: [
      { key: "name", label: "Name", type: "text", required: true }, { key: "relation_id", label: "Relation", type: "master", master: "relation" },
      { key: "phone", label: "Phone", type: "text", required: true }, { key: "alternate_phone", label: "Alternate phone", type: "text" },
      { key: "email", label: "Email", type: "text" }, { key: "is_primary", label: "Call first", type: "toggle" },
      { key: "address", label: "Address", type: "textarea", span: 2 },
    ],
  },
  family: {
    title: "Family members", noun: "family member", icon: Users, empty: "No family members recorded.",
    fields: [
      { key: "name", label: "Name", type: "text", required: true }, { key: "relation_id", label: "Relation", type: "master", master: "relation" },
      { key: "date_of_birth", label: "Date of birth", type: "date" }, { key: "gender_id", label: "Gender", type: "master", master: "gender" },
      { key: "occupation", label: "Occupation", type: "text" }, { key: "phone", label: "Phone", type: "text" },
      { key: "is_dependent", label: "Dependent", type: "toggle", hint: "Covered by insurance and benefits" },
      { key: "lives_with_employee", label: "Lives with them", type: "toggle" },
    ],
  },
  nominees: {
    title: "Nominees", noun: "nominee", icon: HeartHandshake, empty: "No nominees yet. PF, gratuity and insurance each need one.",
    fields: [
      { key: "kind", label: "Nominated for", type: "select", options: NOMINEE_KINDS, required: true },
      { key: "share_percent", label: "Share (%)", type: "number", required: true },
      { key: "name", label: "Name", type: "text", required: true }, { key: "relation_id", label: "Relation", type: "master", master: "relation" },
      { key: "date_of_birth", label: "Date of birth", type: "date" }, { key: "guardian_name", label: "Guardian (if a minor)", type: "text" },
      { key: "address", label: "Address", type: "textarea", span: 2 },
    ],
  },
  "bank-accounts": {
    title: "Bank accounts", noun: "bank account", icon: Banknote, empty: "No bank account yet. Salary needs one.",
    fields: [
      { key: "bank_id", label: "Bank", type: "master", master: "bank" }, { key: "account_holder", label: "Account holder", type: "text", required: true },
      { key: "account_number", label: "Account number", type: "text", required: true }, { key: "ifsc", label: "IFSC", type: "text", required: true, upper: true, hint: "e.g. HDFC0001234" },
      { key: "branch", label: "Branch", type: "text" },
      { key: "account_type", label: "Account type", type: "select", options: [
        { value: "savings", label: "Savings" }, { value: "salary", label: "Salary" }, { value: "current", label: "Current" }, { value: "nre", label: "NRE" }, { value: "nro", label: "NRO" }] },
      { key: "is_primary", label: "Salary goes here", type: "toggle" }, { key: "verified", label: "Verified", type: "toggle", hint: "Checked against a cancelled cheque or passbook" },
    ],
  },
  education: {
    title: "Education", noun: "qualification", icon: GraduationCap, empty: "No education added.",
    fields: [
      { key: "level_id", label: "Level", type: "master", master: "education_level" }, { key: "degree", label: "Degree or course", type: "text", required: true },
      { key: "specialisation", label: "Specialisation", type: "text" }, { key: "institution", label: "Institution", type: "text" },
      { key: "university", label: "University or board", type: "text" }, { key: "score", label: "Score", type: "text", hint: "e.g. 8.2 CGPA or 78%" },
      { key: "start_year", label: "From (year)", type: "year" }, { key: "end_year", label: "To (year)", type: "year" },
    ],
  },
  experience: {
    title: "Previous employment", noun: "previous job", icon: BriefcaseBusiness, empty: "No earlier jobs recorded.",
    fields: [
      { key: "company_name", label: "Employer", type: "text", required: true }, { key: "designation", label: "Designation", type: "text" },
      { key: "from_date", label: "From", type: "date" }, { key: "to_date", label: "To", type: "date" },
      { key: "last_ctc", label: "Last CTC (yearly)", type: "money" }, { key: "reason_for_leaving", label: "Reason for leaving", type: "text" },
      { key: "previous_pf_member_id", label: "Previous PF member ID", type: "text" }, { key: "is_relevant", label: "Counts as relevant experience", type: "toggle" },
      { key: "financial_year", label: "Financial year", type: "text", hint: "For this year's tax, e.g. 2026-27" },
      { key: "fy_taxable_income", label: "Taxable income this year", type: "money" }, { key: "fy_tds", label: "Tax deducted (TDS)", type: "money" },
      { key: "fy_pf", label: "PF deducted", type: "money" }, { key: "fy_pt", label: "Professional Tax", type: "money" },
    ],
  },
};

function RowFormModal({ kind, employeeUuid, row, open, onClose, onSaved, canVerify, familyOptions }: {
  kind: Kind; employeeUuid: string; row: Row | null; open: boolean; onClose: () => void; onSaved: () => void; canVerify: boolean;
  familyOptions?: SelectOption<number>[];
}) {
  const spec = SPECS[kind];
  const toast = useToast();
  const initial = Object.fromEntries(spec.fields.map((f) => [f.key, row?.[f.key] ?? (f.type === "toggle" ? (f.key === "lives_with_employee" || f.key === "is_relevant") : null)]));
  const [v, setV] = useState<Record<string, unknown>>(initial);
  const [error, setError] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const set = (k: string, x: unknown) => { setV((p) => ({ ...p, [k]: x })); setError((e) => ({ ...e, [k]: "" })); };

  async function save() {
    const er: Record<string, string> = {};
    for (const f of spec.fields) if (f.required && (v[f.key] === null || v[f.key] === "" || v[f.key] === undefined)) er[f.key] = `Enter ${f.label.toLowerCase()}`;
    setError(er);
    if (Object.keys(er).length) return;
    const body = Object.fromEntries(spec.fields.filter((f) => f.key !== "verified" || canVerify).map((f) => [f.key, v[f.key] === "" ? null : v[f.key]]));
    setSaving(true);
    try {
      if (row) await api.put(`/employees/${employeeUuid}/details/${kind}/${row.uuid}`, body);
      else await api.post(`/employees/${employeeUuid}/details/${kind}`, body);
      toast.success(row ? "Saved" : `${spec.noun[0].toUpperCase()}${spec.noun.slice(1)} added`);
      onSaved();
    } catch (e) {
      toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined });
    } finally { setSaving(false); }
  }

  const control = (f: FieldSpec): ReactNode => {
    const val = v[f.key];
    switch (f.type) {
      case "date": return <DateInput value={(val as string) || ""} onChange={(x) => set(f.key, x || null)} clearable />;
      case "master": return <MasterSelect type={f.master!} value={(val as number) ?? null} onChange={(x) => set(f.key, x)} clearable />;
      case "number": return <NumberInput value={val == null ? null : Number(val)} onChange={(x) => set(f.key, x)} min={0} max={100} suffix="%" />;
      case "year": return <NumberInput value={val == null ? null : Number(val)} onChange={(x) => set(f.key, x)} min={1950} max={2100} />;
      case "money": return <NumberInput value={val == null ? null : Number(val)} onChange={(x) => set(f.key, x)} min={0} step={1000} suffix="₹" />;
      case "toggle": return <Toggle checked={!!val} onChange={(x) => set(f.key, x)} label={f.label} description={f.hint} disabled={f.key === "verified" && !canVerify} />;
      case "select": return <Select value={(val as string) ?? null} onChange={(x) => set(f.key, x)} options={f.options!} />;
      case "textarea": return <Textarea value={(val as string) || ""} onValueChange={(x) => set(f.key, x)} rows={2} />;
      default: return <TextInput value={(val as string) || ""} onValueChange={(x) => set(f.key, f.upper ? x.toUpperCase() : x)} />;
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving}
      title={row ? `Edit ${spec.noun}` : `Add ${spec.noun}`}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>{row ? "Save" : "Add"}</Button></>}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
        {kind === "nominees" && familyOptions && familyOptions.length > 0 && !row && (
          <Field label="Pick from family" hint="Fills the name, relation and date of birth" className="mb-5">
            <Select<number> value={(v.family_member_id as number) ?? null} options={familyOptions} clearable placeholder="Or type the details below"
              onChange={(x, o) => setV((p) => ({ ...p, family_member_id: x, name: o?.label ?? p.name, relation_id: (o as SelectOption<number> & { relation_id?: number })?.relation_id ?? p.relation_id, date_of_birth: (o as SelectOption<number> & { dob?: string })?.dob ?? p.date_of_birth }))} />
          </Field>
        )}
        <FormGrid>
          {spec.fields.map((f) => f.type === "toggle"
            ? <div key={f.key} className="flex items-center">{control(f)}</div>
            : <Field key={f.key} label={f.label} required={f.required} error={error[f.key]} hint={f.hint} className={f.span === 2 ? "sm:col-span-2" : undefined}>{control(f)}</Field>)}
        </FormGrid>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function summary(kind: Kind, r: Row): { title: ReactNode; lines: ReactNode[]; badges: ReactNode[] } {
  const s = (k: string) => (r[k] === null || r[k] === undefined || r[k] === "" ? null : String(r[k]));
  switch (kind) {
    case "emergency-contacts":
      return { title: s("name"), lines: [[s("relation_name"), s("phone"), s("alternate_phone")].filter(Boolean).join(" · "), s("email"), s("address")], badges: r.is_primary ? [<Badge key="p" tone="accent">Call first</Badge>] : [] };
    case "family":
      return { title: s("name"), lines: [[s("relation_name"), r.date_of_birth ? `Born ${day(String(r.date_of_birth))}` : null, s("occupation")].filter(Boolean).join(" · "), s("phone")], badges: r.is_dependent ? [<Badge key="d" tone="info">Dependent</Badge>] : [] };
    case "nominees":
      return { title: s("name"), lines: [[s("relation_name"), r.date_of_birth ? `Born ${day(String(r.date_of_birth))}` : null].filter(Boolean).join(" · "), r.guardian_name ? `Guardian: ${s("guardian_name")}` : null], badges: [<Badge key="k" tone="accent">{s("kind_label")}</Badge>, <Badge key="s">{Number(r.share_percent)}%</Badge>] };
    case "bank-accounts":
      return { title: <span className="font-mono tabular">{s("account_number")}</span>, lines: [[s("bank_name"), s("ifsc"), s("branch")].filter(Boolean).join(" · "), `${s("account_holder")} · ${s("account_type_label")}`], badges: [
        ...(r.is_primary ? [<Badge key="p" tone="accent">Salary account</Badge>] : []),
        r.verified ? <Badge key="v" tone="good" dot>Verified</Badge> : <Badge key="v" tone="warn" dot>Not verified</Badge>,
        ...(r.active === false ? [<Badge key="a">Switched off</Badge>] : [])] };
    case "education":
      return { title: [s("degree"), s("specialisation")].filter(Boolean).join(", "), lines: [[s("institution"), s("university")].filter(Boolean).join(" · "), [r.start_year && r.end_year ? `${r.start_year} – ${r.end_year}` : s("end_year"), s("score")].filter(Boolean).join(" · ")], badges: r.level_name ? [<Badge key="l">{s("level_name")}</Badge>] : [] };
    case "experience":
      return { title: s("company_name"), lines: [[s("designation"), r.from_date ? `${day(String(r.from_date))} – ${r.to_date ? day(String(r.to_date)) : "?"}` : null].filter(Boolean).join(" · "), [money(r.last_ctc) ? `Last CTC ${money(r.last_ctc)}` : null, s("reason_for_leaving")].filter(Boolean).join(" · "),
        r.fy_taxable_income != null ? `FY ${s("financial_year")}: income ${money(r.fy_taxable_income)}, TDS ${money(r.fy_tds) ?? "₹0"}${r.fy_pf ? `, PF ${money(r.fy_pf)}` : ""}` : null], badges: r.is_relevant ? [] : [<Badge key="r">Not relevant</Badge>] };
  }
}

export function DetailList({ kind, employeeUuid, rows, canEdit, canVerify = false, onChanged, familyRows, footnote }: {
  kind: Kind; employeeUuid: string; rows: Row[]; canEdit: boolean; canVerify?: boolean; onChanged: () => void; familyRows?: Row[]; footnote?: ReactNode;
}) {
  const spec = SPECS[kind];
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ row: Row | null; key: number } | null>(null);
  const [open, setOpen] = useState(false);
  const Icon = spec.icon;
  const familyOptions = familyRows?.map((f) => ({ value: f.id, label: String(f.name), description: f.relation_name ? String(f.relation_name) : undefined, relation_id: f.relation_id, dob: f.date_of_birth })) as SelectOption<number>[] | undefined;

  async function remove(r: Row) {
    const bank = kind === "bank-accounts";
    const ok = await confirm({
      title: bank ? "Switch off this account?" : `Remove this ${spec.noun}?`,
      message: bank ? "It stays on record but salary won't be paid into it." : "The audit log keeps a copy of what it held.",
      confirmLabel: bank ? "Switch off" : "Remove", tone: "danger",
    });
    if (!ok) return;
    try {
      await api.delete(`/employees/${employeeUuid}/details/${kind}/${r.uuid}`);
      toast.success(bank ? "Account switched off" : "Removed");
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove"); }
  }

  const openForm = (row: Row | null) => { setEditing({ row, key: Date.now() }); setOpen(true); };
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <p className="flex items-center gap-2 text-[15px] text-ink"><Icon size={16} strokeWidth={1.4} className="text-faint" /> {spec.title}
          {rows.length > 0 && <span className="text-[12.5px] text-faint tabular">{rows.length}</span>}</p>
        {canEdit && <Button size="sm" icon={Plus} onClick={() => openForm(null)}>Add</Button>}
      </header>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-[13.5px] text-muted">{spec.empty}</p>
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => {
            const sm = summary(kind, r);
            return (
              <li key={r.uuid} className={`group flex items-start gap-4 px-5 py-3.5 ${r.active === false ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="text-[14px] text-ink">{sm.title}</p>{sm.badges}</div>
                  {sm.lines.filter(Boolean).map((l, i) => <p key={i} className="mt-0.5 text-[13px] text-muted">{l}</p>)}
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100">
                    <IconButton icon={Pencil} label="Edit" size="sm" onClick={() => openForm(r)} />
                    {r.active !== false && <IconButton icon={Trash2} label={kind === "bank-accounts" ? "Switch off" : "Remove"} size="sm" onClick={() => remove(r)} />}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {footnote && <div className="border-t border-line px-5 py-3 text-[12.5px] text-muted">{footnote}</div>}
      {editing && (
        <RowFormModal key={editing.key} kind={kind} employeeUuid={employeeUuid} row={editing.row} open={open} canVerify={canVerify}
          familyOptions={familyOptions} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); onChanged(); }} />
      )}
    </section>
  );
}

export function NomineeTotals({ totals }: { totals: Record<string, number> }) {
  const kinds = ["pf", "gratuity", "insurance"];
  return (
    <span className="flex flex-wrap gap-x-4 gap-y-1">
      {kinds.map((k) => {
        const t = totals[k] ?? 0;
        const label = NOMINEE_KINDS.find((x) => x.value === k)?.label;
        return <span key={k} className="inline-flex items-center gap-1.5"><ShieldCheck size={13} strokeWidth={1.4} className={t === 100 ? "text-emerald-600" : "text-amber-600"} />{label}: <span className="tabular">{t}%</span></span>;
      })}
    </span>
  );
}
