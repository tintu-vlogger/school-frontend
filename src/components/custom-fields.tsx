"use client";

/*
 * CustomFields: renders a record's custom fields (set up in Settings > Custom fields).
 *
 *   // in a form (values live in your form state, sent to the API as `custom`)
 *   <CustomFields entity="employee" values={v.custom} onChange={(custom) => set("custom", custom)} errors={errors} />
 *   // in a details view
 *   <CustomFields entity="employee" mode="view" values={emp.custom} />
 *
 * Record types: employee, department, designation, location, legal_entity, asset,
 * helpdesk_case, candidate (CustomFieldEntity).
 *
 * Props: entity, values (object keyed by field key), onChange?(next), errors? (by key),
 * readOnly?, mode?: "form" | "view", layout? (skip fetching, e.g. a live preview),
 * audience?: "hr" | "employee" (employee hides fields not visible to employees and
 * locks fields they can't edit), emptyText? (view mode, when no fields exist).
 *
 * Value shapes (as the API stores them): text-like -> string, number -> number,
 * date -> "YYYY-MM-DD", boolean -> true/false, choice from a master -> id or [ids],
 * fixed choice -> string or [strings], file -> { name, url (data URL), size }.
 * Also exported: useCustomFieldLayout, customFieldErrors (client-side required/limits check),
 * hasCustomFields, useCustomFieldDraft (form state for one record's custom values) and the types.
 *
 *   // in any record's form modal
 *   const cf = useCustomFieldDraft("asset", editing?.custom);
 *   ...on submit: if (!cf.check()) return;  payload.custom = cf.values;
 *   <CustomFields entity="asset" layout={cf.layout} values={cf.values} onChange={cf.setValues} errors={cf.errors} />
 */
import { useCallback, useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import {
  DateInput, Field, FileDrop, FormGrid, FormSection, KeyValue, MasterSelect, MultiSelect, NumberInput, Section, Select,
  SkeletonText, TextInput, Textarea, Toggle, formatBytes, useMasterLabels, type SelectOption,
} from "@/components/ui-kit";

/** Record types that can carry custom fields (see GET /custom-fields/meta). */
export type CustomFieldEntity =
  | "employee" | "department" | "designation" | "location" | "legal_entity" | "asset" | "helpdesk_case" | "candidate";

export type CustomFieldType =
  | "text" | "textarea" | "number" | "date" | "boolean" | "single_choice" | "multi_choice" | "email" | "phone" | "url" | "file";

export type CustomFieldDef = {
  id: number;
  uuid: string;
  key: string;
  label: string;
  field_type: CustomFieldType;
  section_id: number | null;
  master_type_key: string | null;
  options: (string | { value: string; label: string })[];
  required: boolean;
  help_text: string | null;
  placeholder: string | null;
  validation: { min?: number; max?: number; min_length?: number; max_length?: number; pattern?: string; pattern_message?: string };
  visible_to_employee: boolean;
  editable_by_employee: boolean;
  active: boolean;
  sort_order: number;
};

export type CustomFieldSection = {
  id: number; uuid: string; name: string; description: string | null; active: boolean; sort_order: number; fields: CustomFieldDef[];
};

export type CustomFieldLayout = { entity: string; sections: CustomFieldSection[]; unsectioned: CustomFieldDef[] };
export type CustomValues = Record<string, unknown>;
export type CustomFile = { name: string; url: string; size?: number | null };

/** Load the sections and fields for a record type. */
export function useCustomFieldLayout(entity: string, includeInactive = false) {
  const [state, setState] = useState<{ key: string; layout: CustomFieldLayout | null } | null>(null);
  const [version, setVersion] = useState(0);
  const key = `${entity}:${includeInactive}:${version}`;
  useEffect(() => {
    let live = true;
    const path = `/custom-fields/${entity}${includeInactive ? "?include_inactive=true" : ""}`;
    const req = includeInactive || version ? api.get<CustomFieldLayout>(path) : api.getCached<CustomFieldLayout>(path, 60);
    req.then((layout) => { if (live) setState({ key, layout }); })
      .catch(() => { if (live) setState({ key, layout: null }); });
    return () => { live = false; };
  }, [entity, includeInactive, version, key]);
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  const current = state && state.key === key ? state : null;
  return { layout: current?.layout ?? null, loading: !current, reload };
}

type Group = { key: string; title: string; description?: string | null; fields: CustomFieldDef[] };

function groups(layout: CustomFieldLayout, audience: "hr" | "employee"): Group[] {
  const keep = (f: CustomFieldDef) => f.active !== false && (audience === "hr" || f.visible_to_employee);
  const out: Group[] = layout.sections
    .filter((s) => s.active !== false)
    .map((s) => ({ key: s.uuid, title: s.name, description: s.description, fields: s.fields.filter(keep) }));
  const loose = layout.unsectioned.filter(keep);
  if (loose.length) out.push({ key: "other", title: "Other details", fields: loose });
  return out.filter((g) => g.fields.length > 0);
}

export function hasCustomFields(layout: CustomFieldLayout | null) {
  return !!layout && groups(layout, "hr").length > 0;
}

export function choiceOptions(def: Pick<CustomFieldDef, "options">): SelectOption[] {
  return (def.options || []).map((o) => (typeof o === "string" ? { value: o, label: o } : { value: String(o.value), label: o.label || String(o.value) }));
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** Client-side check before saving (the server checks again): required fields and simple limits. */
export function customFieldErrors(layout: CustomFieldLayout | null, values: CustomValues, audience: "hr" | "employee" = "hr") {
  const errors: Record<string, string> = {};
  if (!layout) return errors;
  for (const g of groups(layout, audience)) {
    for (const f of g.fields) {
      const v = values[f.key];
      if (isEmpty(v)) { if (f.required) errors[f.key] = `${f.label} is required`; continue; }
      const r = f.validation || {};
      if (typeof v === "string") {
        if (r.min_length && v.length < r.min_length) errors[f.key] = `Use at least ${r.min_length} characters`;
        else if (r.max_length && v.length > r.max_length) errors[f.key] = `Use at most ${r.max_length} characters`;
        else if (f.field_type === "email" && !/\S+@\S+\.\S+/.test(v)) errors[f.key] = "This doesn't look like an email address";
        else if (f.field_type === "url" && !/^https?:\/\//i.test(v)) errors[f.key] = "Start the link with http:// or https://";
        else if (r.pattern) {
          try { if (!new RegExp(r.pattern).test(v)) errors[f.key] = r.pattern_message || "This isn't in the right format"; } catch { /* server checks */ }
        }
      }
      if (typeof v === "number") {
        if (r.min !== undefined && r.min !== null && v < r.min) errors[f.key] = `Must be at least ${r.min}`;
        else if (r.max !== undefined && r.max !== null && v > r.max) errors[f.key] = `Must be at most ${r.max}`;
      }
    }
  }
  return errors;
}

/** Form state for one record's custom values: the layout, the values, errors after `check()`
 *  and whether anything changed (for the modal's "discard changes?" guard). */
export function useCustomFieldDraft(entity: CustomFieldEntity, initial: CustomValues | null | undefined) {
  const { layout } = useCustomFieldLayout(entity);
  const [start] = useState<CustomValues>(() => ({ ...(initial || {}) }));
  const [values, setValuesState] = useState<CustomValues>(start);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const setValues = useCallback((next: CustomValues) => { setValuesState(next); setErrors({}); }, []);
  const check = () => {
    const e = customFieldErrors(layout, values);
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  return { layout, values, setValues, errors, check, dirty: JSON.stringify(values) !== JSON.stringify(start) };
}

function readFile(file: File): Promise<CustomFile> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res({ name: file.name, url: String(fr.result), size: file.size });
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
}

/* ── one control ───────────────────────────────────────────────────────── */

function Control({ f, value, onChange, disabled, invalid }: {
  f: CustomFieldDef; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; invalid?: boolean;
}) {
  const ph = f.placeholder || undefined;
  const r = f.validation || {};
  switch (f.field_type) {
    case "textarea":
      return <Textarea value={(value as string) ?? ""} onValueChange={(x) => onChange(x)} placeholder={ph} disabled={disabled} invalid={invalid} rows={3} autoGrow maxLength={r.max_length} />;
    case "number":
      return <NumberInput value={typeof value === "number" ? value : value === "" || value == null ? null : Number(value)} onChange={(n) => onChange(n)} min={r.min} max={r.max} placeholder={ph} disabled={disabled} invalid={invalid} />;
    case "date":
      return <DateInput value={(value as string) ?? ""} onChange={(x) => onChange(x || null)} placeholder={ph} disabled={disabled} invalid={invalid} clearable />;
    case "boolean":
      return (
        <div className="flex h-10 items-center gap-3">
          <Toggle checked={value === true} onChange={(x) => onChange(x)} disabled={disabled} aria-label={f.label} />
          <span className="text-[14px] text-muted">{value === true ? "Yes" : "No"}</span>
        </div>
      );
    case "single_choice":
      return f.master_type_key
        ? <MasterSelect type={f.master_type_key} value={typeof value === "number" ? value : value == null ? null : Number(value)} onChange={(x) => onChange(x)} placeholder={ph} disabled={disabled} invalid={invalid} clearable />
        : <Select value={value == null ? null : String(value)} onChange={(x) => onChange(x)} options={choiceOptions(f)} placeholder={ph} disabled={disabled} invalid={invalid} clearable />;
    case "multi_choice": {
      const arr = Array.isArray(value) ? value : [];
      return f.master_type_key
        ? <MasterSelect multiple type={f.master_type_key} value={arr.map(Number)} onChange={(x) => onChange(x)} placeholder={ph} disabled={disabled} invalid={invalid} />
        : <MultiSelect value={arr.map(String)} onChange={(x) => onChange(x)} options={choiceOptions(f)} placeholder={ph} disabled={disabled} invalid={invalid} />;
    }
    case "file": {
      const file = value as CustomFile | null;
      if (file?.url) {
        return (
          <div className="flex h-10 items-center gap-3 rounded-lg border border-line px-3">
            <FileText size={16} strokeWidth={1.4} className="shrink-0 text-faint" />
            <a href={file.url} download={file.name} className="min-w-0 flex-1 truncate text-[14px] text-ink hover:text-primary">{file.name}</a>
            {file.size ? <span className="shrink-0 text-[12px] text-faint">{formatBytes(file.size)}</span> : null}
            {!disabled && (
              <button type="button" aria-label="Remove file" onClick={() => onChange(null)} className="shrink-0 rounded p-0.5 text-faint hover:bg-sunken hover:text-ink">
                <X size={14} strokeWidth={1.4} />
              </button>
            )}
          </div>
        );
      }
      return <FileDrop value={[]} onChange={(files) => { if (files[0]) readFile(files[0]).then(onChange).catch(() => {}); }} maxSizeMb={2} disabled={disabled} hint="One file, up to 2 MB" />;
    }
    default: {
      const type = f.field_type === "email" ? "email" : f.field_type === "phone" ? "tel" : f.field_type === "url" ? "url" : "text";
      return <TextInput type={type} value={(value as string) ?? ""} onValueChange={(x) => onChange(x)} placeholder={ph} disabled={disabled} invalid={invalid} maxLength={r.max_length} />;
    }
  }
}

/* ── view values ───────────────────────────────────────────────────────── */

function MasterLabels({ type, ids }: { type: string; ids: number[] }) {
  const map = useMasterLabels(type, ids);
  if (!map) return <span className="text-faint">…</span>;
  return <>{ids.map((i) => map.get(i)?.label ?? `#${i}`).join(", ")}</>;
}

function viewValue(f: CustomFieldDef, v: unknown) {
  if (isEmpty(v)) return null;
  switch (f.field_type) {
    case "date": return typeof v === "string" ? formatDate(v) : String(v);
    case "boolean": return v === true ? "Yes" : "No";
    case "number": return <span className="tabular">{String(v)}</span>;
    case "url": return <a href={String(v)} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-dark">{String(v)}</a>;
    case "email": return <a href={`mailto:${v}`} className="hover:text-primary">{String(v)}</a>;
    case "phone": return <a href={`tel:${v}`} className="tabular hover:text-primary">{String(v)}</a>;
    case "file": {
      const file = v as CustomFile;
      return <a href={file.url} download={file.name} className="inline-flex items-center gap-1.5 text-primary hover:text-primary-dark"><FileText size={14} strokeWidth={1.4} />{file.name}</a>;
    }
    case "single_choice":
    case "multi_choice": {
      const arr = Array.isArray(v) ? v : [v];
      if (f.master_type_key) return <MasterLabels type={f.master_type_key} ids={arr.map(Number)} />;
      const opts = choiceOptions(f);
      return arr.map((x) => opts.find((o) => o.value === String(x))?.label ?? String(x)).join(", ");
    }
    default: return <span className="whitespace-pre-line">{String(v)}</span>;
  }
}

/* ── CustomFields ──────────────────────────────────────────────────────── */

export type CustomFieldsProps = {
  entity: CustomFieldEntity;
  values: CustomValues | null | undefined;
  onChange?: (values: CustomValues) => void;
  errors?: Record<string, string | undefined>;
  readOnly?: boolean;
  mode?: "form" | "view";
  layout?: CustomFieldLayout | null;
  audience?: "hr" | "employee";
  emptyText?: string;
};

export function CustomFields({ entity, values, onChange, errors, readOnly, mode = "form", layout: given, audience = "hr", emptyText }: CustomFieldsProps) {
  const fetched = useCustomFieldLayout(entity);
  const layout = given !== undefined ? given : fetched.layout;
  const loading = given === undefined && fetched.loading;
  const vals = values || {};

  if (loading) return mode === "form" ? <SkeletonText lines={3} className="py-4" /> : <SkeletonText lines={2} />;
  if (!layout) return null;
  const gs = groups(layout, audience);
  if (!gs.length) return emptyText ? <p className="text-[13.5px] text-faint">{emptyText}</p> : null;

  if (mode === "view") {
    return (
      <div>
        {gs.map((g, i) => (
          <Section key={g.key} title={g.title} description={g.description || undefined} className={i ? "border-t border-line" : undefined}>
            <KeyValue items={g.fields.map((f) => ({ label: f.label, value: viewValue(f, vals[f.key]), span: f.field_type === "textarea" ? 2 : 1 }))} />
          </Section>
        ))}
      </div>
    );
  }

  const set = (key: string, v: unknown) => onChange?.({ ...vals, [key]: v });
  return (
    <>
      {gs.map((g) => (
        <FormSection key={g.key} title={g.title} description={g.description || undefined}>
          <FormGrid>
            {g.fields.map((f) => {
              const locked = readOnly || (audience === "employee" && !f.editable_by_employee);
              const wide = f.field_type === "textarea" || f.field_type === "file";
              return (
                <Field key={f.key} label={f.label} required={f.required} hint={f.help_text || undefined} error={errors?.[f.key]} className={wide ? "sm:col-span-2" : undefined}>
                  <Control f={f} value={vals[f.key]} onChange={(v) => set(f.key, v)} disabled={locked} invalid={!!errors?.[f.key]} />
                </Field>
              );
            })}
          </FormGrid>
        </FormSection>
      ))}
    </>
  );
}
