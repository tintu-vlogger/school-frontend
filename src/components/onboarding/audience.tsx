"use client";

/*
 * Audience picker for flows and policies: departments, locations and employment types.
 *   <AudienceEditor value={audience} onChange={setAudience} />   // empty lists mean "everyone"
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Field, FormGrid, MasterSelect, MultiSelect, type SelectOption } from "@/components/ui-kit";
import type { Audience } from "./types";

let cache: { depts: SelectOption<number>[]; locs: SelectOption<number>[] } | null = null;

export function useOrgOptions() {
  const [opts, setOpts] = useState(cache ?? { depts: [] as SelectOption<number>[], locs: [] as SelectOption<number>[] });
  useEffect(() => {
    if (cache) return;
    Promise.all([
      api.get<{ id: number; department_name: string }[]>("/departments/").catch(() => []),
      api.get<{ id: number; name: string }[]>("/organization/locations").catch(() => []),
    ]).then(([d, l]) => {
      cache = {
        depts: (Array.isArray(d) ? d : []).map((x) => ({ value: x.id, label: x.department_name })),
        locs: (Array.isArray(l) ? l : []).map((x) => ({ value: x.id, label: x.name })),
      };
      setOpts(cache);
    });
  }, []);
  return opts;
}

export function audienceSummary(a: Audience | undefined, opts: { depts: SelectOption<number>[]; locs: SelectOption<number>[] }): string {
  if (!a) return "Everyone";
  const parts: string[] = [];
  const names = (ids: number[] | undefined, list: SelectOption<number>[]) => (ids ?? []).map((i) => list.find((o) => o.value === i)?.label ?? `#${i}`);
  if (a.department_ids?.length) parts.push(names(a.department_ids, opts.depts).join(", "));
  if (a.location_ids?.length) parts.push(names(a.location_ids, opts.locs).join(", "));
  if (a.employment_type_ids?.length) parts.push(`${a.employment_type_ids.length} employment type(s)`);
  return parts.length ? parts.join(" · ") : "Everyone";
}

export function AudienceEditor({ value, onChange }: { value: Audience; onChange: (a: Audience) => void }) {
  const { depts, locs } = useOrgOptions();
  return (
    <FormGrid>
      <Field label="Departments" hint="Leave empty for all">
        <MultiSelect options={depts} value={value.department_ids ?? []} onChange={(v) => onChange({ ...value, department_ids: v })} placeholder="All departments" />
      </Field>
      <Field label="Locations" hint="Leave empty for all">
        <MultiSelect options={locs} value={value.location_ids ?? []} onChange={(v) => onChange({ ...value, location_ids: v })} placeholder="All locations" />
      </Field>
      <Field label="Employment types" hint="Leave empty for all">
        <MasterSelect type="employment_type" multiple value={value.employment_type_ids ?? []} onChange={(v) => onChange({ ...value, employment_type_ids: v })} placeholder="All types" />
      </Field>
    </FormGrid>
  );
}
