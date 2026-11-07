"use client";

/*
 * ApplicabilityEditor: who a leave type, holiday calendar or work week applies to.
 *   <ApplicabilityEditor value={app} onChange={setApp} />
 * Everyone; or simple pickers (gender, marital status, employment type, location, state,
 * department, designation, grade, tags, length of service, probation, named people in or
 * out); or a rule in the rules language, e.g. employee.tenure_years >= 2 and employee.gender == 'F'.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Field, FormGrid, MasterSelect, MultiSelect, NumberInput, RadioCards, Select, Textarea, type SelectOption,
} from "@/components/ui-kit";
import type { Applicability } from "./types";

type Opt = SelectOption<number>;
const lists: Record<string, Promise<Opt[]>> = {};
function useList(kind: string, enabled = true) {
  const [opts, setOpts] = useState<Opt[]>([]);
  useEffect(() => {
    if (!enabled) return;
    lists[kind] ??= api.get<Opt[]>(`/leave/options/${kind}`).catch(() => []);
    lists[kind].then(setOpts);
  }, [kind, enabled]);
  return opts;
}

async function loadEmployees(q: string): Promise<Opt[]> {
  const rows = await api.get<{ value: number; label: string; hint: string }[]>(`/employees/lookup?q=${encodeURIComponent(q)}`);
  return rows.map((r) => ({ value: r.value, label: r.label, description: r.hint }));
}

export function ApplicabilityEditor({ value, onChange, compact }: { value: Applicability; onChange: (v: Applicability) => void; compact?: boolean }) {
  const v = value || {};
  const set = (patch: Partial<Applicability>) => onChange({ ...v, ...patch });
  const mode = v.mode || "all";
  const pickers = mode === "pickers";
  const departments = useList("departments", pickers);
  const designations = useList("designations", pickers);
  const locations = useList("locations", pickers);
  const grades = useList("grades", pickers);
  const tags = useList("tags", pickers);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [empLabels, setEmpLabels] = useState<Opt[]>([]);
  useEffect(() => {
    const ids = [...(v.employees ?? []), ...(v.exclude_employees ?? [])];
    if (!ids.length) return;
    api.get<{ value: number; label: string }[]>(`/employees/lookup?ids=${ids.join(",")}&active_only=false`).then((r) => setEmpLabels(r.map((x) => ({ value: x.value, label: x.label })))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkRule(text: string) {
    if (!text.trim()) { setRuleError(null); return; }
    try {
      const r = await api.post<{ ok: boolean; detail?: string }>("/leave/types/validate-rule", { rule: text });
      setRuleError(r.ok ? null : r.detail ?? "This rule can't be read");
    } catch { setRuleError(null); }
  }

  return (
    <div className="space-y-5">
      <RadioCards value={mode} onChange={(m) => set({ mode: m as Applicability["mode"] })} columns={3} options={[
        { value: "all", label: "Everyone", description: "All employees" },
        { value: "pickers", label: "Chosen groups", description: "Pick from lists" },
        { value: "rule", label: "A rule", description: "Write a condition" },
      ]} />
      {pickers && (
        <>
          <FormGrid columns={compact ? 2 : 3}>
            <Field label="Gender"><MasterSelect type="gender" multiple value={v.genders ?? []} onChange={(ids) => set({ genders: ids })} placeholder="Any" /></Field>
            <Field label="Marital status"><MasterSelect type="marital_status" multiple value={v.marital_statuses ?? []} onChange={(ids) => set({ marital_statuses: ids })} placeholder="Any" /></Field>
            <Field label="Employment type"><MasterSelect type="employment_type" multiple value={v.employment_types ?? []} onChange={(ids) => set({ employment_types: ids })} placeholder="Any" /></Field>
            <Field label="Location"><MultiSelect value={v.locations ?? []} onChange={(ids) => set({ locations: ids })} options={locations} placeholder="Any" /></Field>
            <Field label="State"><MasterSelect type="state" multiple value={v.states ?? []} onChange={(ids) => set({ states: ids })} placeholder="Any" /></Field>
            <Field label="Department"><MultiSelect value={v.departments ?? []} onChange={(ids) => set({ departments: ids })} options={departments} placeholder="Any" /></Field>
            <Field label="Designation"><MultiSelect value={v.designations ?? []} onChange={(ids) => set({ designations: ids })} options={designations} placeholder="Any" /></Field>
            <Field label="Grade"><MultiSelect value={v.grades ?? []} onChange={(ids) => set({ grades: ids })} options={grades} placeholder="Any" /></Field>
            <Field label="Tags"><MultiSelect value={v.tags ?? []} onChange={(ids) => set({ tags: ids })} options={tags} placeholder="Any" /></Field>
          </FormGrid>
          <FormGrid columns={compact ? 2 : 3}>
            <Field label="Least service" hint="Days since joining"><NumberInput value={v.min_tenure_days ?? 0} onChange={(n) => set({ min_tenure_days: n ?? 0 })} min={0} max={20000} suffix="days" /></Field>
            <Field label="Probation">
              <Select value={v.probation ?? "any"} onChange={(p) => set({ probation: (p ?? "any") as Applicability["probation"] })}
                options={[{ value: "any", label: "On probation or confirmed" }, { value: "only", label: "Only on probation" }, { value: "exclude", label: "Only confirmed" }]} />
            </Field>
          </FormGrid>
        </>
      )}
      {mode !== "all" && (
        <>
          <Field label={pickers ? "Extra rule (optional)" : "Rule"} error={ruleError ?? undefined}
            hint="For example: employee.gender == 'F' and employee.tenure_days >= 80. Fields: gender, on_probation, tenure_days, tenure_years, department_id, location_id, grade_id, role, custom.<field>.">
            <Textarea value={v.rule ?? ""} onValueChange={(t) => set({ rule: t })} onBlur={() => checkRule(v.rule ?? "")} rows={2} className="font-mono text-[12.5px]" />
          </Field>
          <FormGrid columns={2}>
            <Field label="Also these people"><MultiSelect value={v.employees ?? []} onChange={(ids) => set({ employees: ids })} loadOptions={loadEmployees} selectedOptions={empLabels} placeholder="Nobody" /></Field>
            <Field label="Never these people"><MultiSelect value={v.exclude_employees ?? []} onChange={(ids) => set({ exclude_employees: ids })} loadOptions={loadEmployees} selectedOptions={empLabels} placeholder="Nobody" /></Field>
          </FormGrid>
        </>
      )}
    </div>
  );
}

export function applicabilityText(v: Applicability | undefined): string {
  if (!v || !v.mode || v.mode === "all") {
    if (v?.employees?.length) return `Everyone`;
    return "Everyone";
  }
  const parts: string[] = [];
  const n = (k: keyof Applicability, w: string) => { const x = v[k]; if (Array.isArray(x) && x.length) parts.push(`${x.length} ${w}${x.length > 1 ? "s" : ""}`); };
  n("genders", "gender"); n("locations", "location"); n("states", "state"); n("departments", "department"); n("designations", "designation");
  n("grades", "grade"); n("employment_types", "employment type"); n("tags", "tag");
  if (v.min_tenure_days) parts.push(`${v.min_tenure_days}+ days of service`);
  if (v.probation === "only") parts.push("on probation"); else if (v.probation === "exclude") parts.push("confirmed");
  if (v.rule) parts.push(`rule: ${v.rule}`);
  return parts.join(" · ") || "Everyone";
}
