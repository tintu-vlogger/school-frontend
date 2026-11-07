"use client";

/*
 * Add or edit a benefit plan: insurer and policy, policy year, sum insured (fixed or a
 * multiple of salary), coverage tiers with yearly premiums, optional age bands for parental
 * cover, the employer's share, eligibility and enrolment windows.
 */
import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Button, Checkbox, DateInput, Field, FormGrid, FormSection, IconButton, Modal, ModalCancel, NumberInput, RadioCards, Select, TextInput,
  Textarea, Toggle,
} from "@/components/ui-kit";
import { errMsg } from "@/components/payroll/common";

export type Tier = { code: string; label: string; spouse: boolean; children: number; parents: number; premium: number };
export type Band = { min_age: number; max_age: number; premium: number };
export type Plan = {
  uuid: string; name: string; kind: string; kind_label: string; insurer: string | null; policy_number: string | null; tpa: string | null;
  broker: string | null; contact_email: string | null; contact_phone: string | null; website: string | null; description: string | null;
  policy_start: string; policy_end: string; sum_insured_basis: string; sum_insured: string; salary_multiple: string | null;
  min_sum_insured: string | null; max_sum_insured: string | null; tiers: Tier[]; age_bands: Band[]; employer_share_type: string;
  employer_share_value: string; deduct_in_payroll: boolean; eligibility_rule: string | null; waiting_days: number; cover_starts: string;
  mandatory: boolean; auto_enrol: boolean; joining_window_days: number; renewal_window_from: string | null; renewal_window_to: string | null;
  renewal_open: boolean; active: boolean; enrolled: number; waived: number; employee_premium_total: string; premium_total: string;
};

export const KINDS = [
  { value: "gmc", label: "Group health" }, { value: "gpa", label: "Group personal accident" }, { value: "gtl", label: "Group term life" },
  { value: "topup", label: "Top-up health" }, { value: "parental", label: "Parental cover" }, { value: "other", label: "Other" },
];

const blank = (): Partial<Plan> => {
  const y = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  return { kind: "gmc", policy_start: `${y}-04-01`, policy_end: `${y + 1}-03-31`, sum_insured_basis: "fixed", employer_share_type: "percent",
    employer_share_value: "100", deduct_in_payroll: true, cover_starts: "on_joining", waiting_days: 0, joining_window_days: 30, mandatory: false,
    auto_enrol: false, active: true, tiers: [{ code: "employee", label: "Employee only", spouse: false, children: 0, parents: 0, premium: 0 }], age_bands: [] };
};

export function PlanModal({ plan, open, onClose, onSaved }: { plan: Plan | null; open: boolean; onClose: () => void; onSaved: (p: Plan) => void }) {
  const toast = useToast();
  const [f, setF] = useState<Partial<Plan>>(blank());
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (open) { setF(plan ? { ...plan } : blank()); setDirty(false); } }, [open, plan]);
  const set = (patch: Partial<Plan>) => { setF((x) => ({ ...x, ...patch })); setDirty(true); };
  const tiers = f.tiers ?? [];
  const bands = f.age_bands ?? [];
  async function save() {
    setBusy(true);
    const body = { ...f, sum_insured: f.sum_insured || 0, salary_multiple: f.salary_multiple || null, min_sum_insured: f.min_sum_insured || null,
      max_sum_insured: f.max_sum_insured || null, renewal_window_from: f.renewal_window_from || null, renewal_window_to: f.renewal_window_to || null };
    for (const k of ["uuid", "kind_label", "renewal_open", "enrolled", "waived", "employee_premium_total", "premium_total"]) delete (body as Record<string, unknown>)[k];
    try { const p = plan ? await api.put<Plan>(`/benefits/plans/${plan.uuid}`, body) : await api.post<Plan>("/benefits/plans", body); toast.success("Plan saved"); onSaved(p); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="xl" title={plan ? `Edit ${plan.name}` : "New benefit plan"} busy={busy} dirty={dirty}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={save}>Save plan</Button></>}>
      <div className="space-y-8">
        <FormSection title="Plan and policy">
          <FormGrid>
            <Field label="Name" required><TextInput value={f.name ?? ""} onValueChange={(v) => set({ name: v })} /></Field>
            <Field label="Kind" required><Select value={f.kind ?? null} onChange={(v) => set({ kind: v ?? "gmc" })} options={KINDS} /></Field>
            <Field label="Insurer"><TextInput value={f.insurer ?? ""} onValueChange={(v) => set({ insurer: v })} /></Field>
            <Field label="Policy number"><TextInput value={f.policy_number ?? ""} onValueChange={(v) => set({ policy_number: v })} /></Field>
            <Field label="TPA"><TextInput value={f.tpa ?? ""} onValueChange={(v) => set({ tpa: v })} /></Field>
            <Field label="Broker"><TextInput value={f.broker ?? ""} onValueChange={(v) => set({ broker: v })} /></Field>
            <Field label="Claims email"><TextInput value={f.contact_email ?? ""} onValueChange={(v) => set({ contact_email: v })} /></Field>
            <Field label="Helpline"><TextInput value={f.contact_phone ?? ""} onValueChange={(v) => set({ contact_phone: v })} /></Field>
            <Field label="Policy starts" required><DateInput value={f.policy_start ?? ""} onChange={(v) => set({ policy_start: v })} /></Field>
            <Field label="Policy ends" required><DateInput value={f.policy_end ?? ""} onChange={(v) => set({ policy_end: v })} /></Field>
          </FormGrid>
          <Field label="What it covers" className="mt-4"><Textarea value={f.description ?? ""} onValueChange={(v) => set({ description: v })} rows={2} /></Field>
        </FormSection>
        <FormSection title="Sum insured">
          <RadioCards value={f.sum_insured_basis ?? "fixed"} onChange={(v) => set({ sum_insured_basis: v })} options={[
            { value: "fixed", label: "Fixed amount", description: "The same cover for everyone" },
            { value: "salary_multiple", label: "Multiple of salary", description: "Common for life cover" }]} />
          <FormGrid className="mt-4">
            {f.sum_insured_basis === "salary_multiple" ? (<>
              <Field label="Times annual CTC" required><NumberInput value={f.salary_multiple ? Number(f.salary_multiple) : null} onChange={(v) => set({ salary_multiple: v === null ? null : String(v) })} step={0.5} min={0} /></Field>
              <Field label="At least"><NumberInput value={f.min_sum_insured ? Number(f.min_sum_insured) : null} onChange={(v) => set({ min_sum_insured: v === null ? null : String(v) })} min={0} /></Field>
              <Field label="At most"><NumberInput value={f.max_sum_insured ? Number(f.max_sum_insured) : null} onChange={(v) => set({ max_sum_insured: v === null ? null : String(v) })} min={0} /></Field>
            </>) : <Field label="Sum insured" required><NumberInput value={f.sum_insured ? Number(f.sum_insured) : null} onChange={(v) => set({ sum_insured: String(v ?? 0) })} min={0} /></Field>}
          </FormGrid>
        </FormSection>
        <FormSection title="Who is covered and the yearly premium">
          <div className="space-y-2">
            {tiers.map((t, i) => (
              <div key={i} className="grid items-end gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1.6fr_auto_90px_90px_130px_auto]">
                <Field label="Tier"><TextInput value={t.label} onValueChange={(v) => set({ tiers: tiers.map((x, j) => j === i ? { ...x, label: v } : x) })} /></Field>
                <div className="pb-2"><Checkbox checked={t.spouse} onChange={(v) => set({ tiers: tiers.map((x, j) => j === i ? { ...x, spouse: v } : x) })} label="Spouse" /></div>
                <Field label="Children"><NumberInput value={t.children} onChange={(v) => set({ tiers: tiers.map((x, j) => j === i ? { ...x, children: v ?? 0 } : x) })} min={0} max={6} /></Field>
                <Field label="Parents"><NumberInput value={t.parents} onChange={(v) => set({ tiers: tiers.map((x, j) => j === i ? { ...x, parents: v ?? 0 } : x) })} min={0} max={4} /></Field>
                <Field label="Premium a year"><NumberInput value={t.premium} onChange={(v) => set({ tiers: tiers.map((x, j) => j === i ? { ...x, premium: v ?? 0 } : x) })} min={0} /></Field>
                <IconButton icon={Trash2} label="Remove tier" onClick={() => set({ tiers: tiers.filter((_, j) => j !== i) })} disabled={tiers.length < 2} />
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => set({ tiers: [...tiers, { code: "", label: "", spouse: false, children: 0, parents: 0, premium: 0 }] })}>Add tier</Button>
          </div>
          <div className="mt-5">
            <p className="mb-2 text-[13px] text-muted">Premium per parent by age (optional, for parental cover)</p>
            {bands.map((b, i) => (
              <div key={i} className="mb-2 grid grid-cols-[90px_90px_1fr_auto] items-end gap-2">
                <Field label="From age"><NumberInput value={b.min_age} onChange={(v) => set({ age_bands: bands.map((x, j) => j === i ? { ...x, min_age: v ?? 0 } : x) })} min={0} /></Field>
                <Field label="To age"><NumberInput value={b.max_age} onChange={(v) => set({ age_bands: bands.map((x, j) => j === i ? { ...x, max_age: v ?? 0 } : x) })} min={0} /></Field>
                <Field label="Premium a year"><NumberInput value={b.premium} onChange={(v) => set({ age_bands: bands.map((x, j) => j === i ? { ...x, premium: v ?? 0 } : x) })} min={0} /></Field>
                <IconButton icon={Trash2} label="Remove band" onClick={() => set({ age_bands: bands.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => { const last = bands[bands.length - 1]; set({ age_bands: [...bands, { min_age: last ? last.max_age + 1 : 0, max_age: last ? last.max_age + 10 : 45, premium: 0 }] }); }}>Add age band</Button>
          </div>
        </FormSection>
        <FormSection title="Who pays">
          <FormGrid>
            <Field label="Employer's share"><Select value={f.employer_share_type ?? "percent"} onChange={(v) => set({ employer_share_type: v ?? "percent" })} options={[{ value: "percent", label: "Percentage of the premium" }, { value: "flat", label: "Fixed amount a year" }]} /></Field>
            <Field label={f.employer_share_type === "flat" ? "Amount a year" : "Percentage"}><NumberInput value={Number(f.employer_share_value ?? 0)} onChange={(v) => set({ employer_share_value: String(v ?? 0) })} min={0} max={f.employer_share_type === "flat" ? undefined : 100} /></Field>
          </FormGrid>
          <Toggle className="mt-4" checked={!!f.deduct_in_payroll} onChange={(v) => set({ deduct_in_payroll: v })} label="Deduct the employee's share from salary" description="Spread over the months of the policy, part months pro-rated" />
        </FormSection>
        <FormSection title="Eligibility and enrolment">
          <FormGrid>
            <Field label="Who is eligible" hint="A rule, e.g. grade_rank >= 3 and age < 65. Empty: everyone. Fields: grade, grade_rank, department, location, designation, employment_type, age, months_of_service, annual_ctc, gender"><TextInput value={f.eligibility_rule ?? ""} onValueChange={(v) => set({ eligibility_rule: v || null })} /></Field>
            <Field label="Cover starts"><Select value={f.cover_starts ?? "on_joining"} onChange={(v) => set({ cover_starts: v ?? "on_joining" })} options={[{ value: "on_joining", label: "From the joining date" }, { value: "first_of_month", label: "1st of the joining month" }, { value: "first_of_next_month", label: "1st of the next month" }]} /></Field>
            <Field label="Waiting period (days)"><NumberInput value={f.waiting_days ?? 0} onChange={(v) => set({ waiting_days: v ?? 0 })} min={0} /></Field>
            <Field label="Joining window (days)" hint="New joiners can enrol for this long"><NumberInput value={f.joining_window_days ?? 30} onChange={(v) => set({ joining_window_days: v ?? 0 })} min={0} /></Field>
            <Field label="Renewal window opens"><DateInput value={f.renewal_window_from ?? ""} onChange={(v) => set({ renewal_window_from: v || null })} /></Field>
            <Field label="Renewal window closes"><DateInput value={f.renewal_window_to ?? ""} onChange={(v) => set({ renewal_window_to: v || null })} /></Field>
          </FormGrid>
          <div className="mt-4 space-y-3">
            <Toggle checked={!!f.mandatory} onChange={(v) => set({ mandatory: v })} label="Compulsory" description="Cannot be waived" />
            <Toggle checked={!!f.auto_enrol} onChange={(v) => set({ auto_enrol: v })} label="Enrol new joiners automatically" description="In the first tier, as soon as they are eligible" />
            <Toggle checked={f.active !== false} onChange={(v) => set({ active: v })} label="Active" />
          </div>
        </FormSection>
      </div>
    </Modal>
  );
}
