"use client";

/*
 * Employee add/edit form, built to sit inside a Modal (see employee-modals.tsx).
 * Sections: personal details, job (incl. reporting manager and timezone), background,
 * the company's custom fields (Settings > Custom fields), any extra blocks passed as
 * `children`, then the weekly work arrangement.
 *
 * The form renders no buttons: submit it from the modal footer with
 * <Button type="submit" form={EMPLOYEE_FORM_ID}>. Add new fields by extending
 * EmployeeValues, EMPTY_EMPLOYEE, employeeToValues and employeePayload together.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Lock, Mail, Phone } from "lucide-react";
import { api } from "@/lib/api";
import { allTimeZones, timeZoneOffsetLabel } from "@/lib/datetime";
import { CustomFields, customFieldErrors, useCustomFieldLayout, type CustomValues } from "@/components/custom-fields";
import {
  Field, FormGrid, FormSection, NumberInput, Select, TextInput, TimeInput, Toggle, type SelectOption,
} from "@/components/ui-kit";

export const TITLES = ["Mr.", "Ms.", "Mrs.", "Dr.", "Prof."];
export const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const EMPLOYEE_FORM_ID = "employee-form";

export type WorkDay = { working: boolean; start: string; end: string };
export type WorkWeek = Record<string, WorkDay>;
type Timing = Record<string, { working?: boolean; slots?: { start: string; end: string }[] }>;

export type EmployeeValues = {
  greeting: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  password: string;
  employee_code: string;
  designation_id: string;
  department_id: string;
  role: string;
  qualification: string;
  experience: string;
  reporting_manager_id: number | null;
  /** IANA timezone, or "" for the company's timezone. */
  timezone: string;
  custom: CustomValues;
  week: WorkWeek;
};

/** The employee record as returned by GET /employees/{uuid}. */
export type EmployeeRecord = {
  id: number; uuid: string; greeting?: string | null; first_name: string; last_name: string; email: string; phone?: string | null;
  employee_code?: string | null; designation_id?: number | null; designation_name?: string | null;
  department_id?: number | null; department_name?: string | null; role: string; active: boolean;
  reporting_manager_id?: number | null; reporting_manager_name?: string | null; reporting_manager_uuid?: string | null;
  timezone?: string | null; custom?: CustomValues | null;
  profile_image_url?: string | null; created_at?: string | null;
  config?: { timing?: Timing; background?: Background; professional?: Background };
};
type Background = { qualification?: string; experience?: number | null };

/** Qualification and experience (stored as config.background; older records use config.professional). */
export function backgroundOf(e: Pick<EmployeeRecord, "config"> | null | undefined): Background {
  return e?.config?.background ?? e?.config?.professional ?? {};
}

export const ROLE_OPTIONS: SelectOption[] = [
  { value: "employee", label: "Employee", description: "Their own profile, leave and attendance" },
  { value: "manager", label: "Manager", description: "Also approves for their team" },
  { value: "hr", label: "HR", description: "Manages people records" },
  { value: "admin", label: "HR admin", description: "Full access, including settings" },
];

export function defaultWeek(): WorkWeek {
  return Object.fromEntries(DAYS.map((d) => [d, { working: !["Saturday", "Sunday"].includes(d), start: "09:00", end: "18:00" }]));
}

/** Read the stored timing (days with one or more time ranges) as one shift per day. */
export function weekFromTiming(timing: Timing | undefined): WorkWeek {
  const base = defaultWeek();
  if (!timing || !Object.keys(timing).length) return base;
  for (const d of DAYS) {
    const t = timing[d];
    if (!t) continue;
    const slots = t.slots || [];
    base[d] = { working: !!t.working, start: slots[0]?.start || base[d].start, end: slots[slots.length - 1]?.end || base[d].end };
  }
  return base;
}

export function timingFromWeek(week: WorkWeek) {
  return Object.fromEntries(DAYS.map((d) => [d, { working: week[d].working, slots: [{ start: week[d].start, end: week[d].end }] }]));
}

export const EMPTY_EMPLOYEE: EmployeeValues = {
  greeting: "", first_name: "", last_name: "", email: "", phone: "", password: "", employee_code: "",
  designation_id: "", department_id: "", role: "employee", qualification: "", experience: "",
  reporting_manager_id: null, timezone: "", custom: {}, week: defaultWeek(),
};

export function employeeToValues(e: EmployeeRecord): EmployeeValues {
  return {
    greeting: e.greeting || "",
    first_name: e.first_name || "",
    last_name: e.last_name || "",
    email: e.email || "",
    phone: e.phone || "",
    password: "",
    employee_code: e.employee_code || "",
    designation_id: e.designation_id ? String(e.designation_id) : "",
    department_id: e.department_id ? String(e.department_id) : "",
    role: ["admin", "hr", "manager"].includes(e.role) ? e.role : "employee",
    qualification: backgroundOf(e).qualification || "",
    experience: backgroundOf(e).experience != null ? String(backgroundOf(e).experience) : "",
    reporting_manager_id: e.reporting_manager_id ?? null,
    timezone: e.timezone || "",
    custom: e.custom || {},
    week: weekFromTiming(e.config?.timing),
  };
}

/** Body for POST /employees/ (create) or PUT /employees/{uuid} (edit). */
export function employeePayload(v: EmployeeValues, mode: "create" | "edit") {
  const base = {
    greeting: v.greeting || null,
    first_name: v.first_name.trim(),
    last_name: v.last_name.trim(),
    email: v.email.trim(),
    phone: v.phone.trim() || null,
    employee_code: v.employee_code.trim() || null,
    designation_id: v.designation_id ? Number(v.designation_id) : null,
    department_id: v.department_id ? Number(v.department_id) : null,
    role: v.role,
    qualification: v.qualification.trim() || (mode === "edit" ? "" : undefined),
    experience: v.experience ? Number(v.experience) : null,
    reporting_manager_id: v.reporting_manager_id,
    timezone: v.timezone || null,
    custom: v.custom,
  };
  return mode === "create" ? { ...base, password: v.password } : base;
}

export function validateEmployee(v: EmployeeValues, mode: "create" | "edit") {
  const er: Record<string, string> = {};
  if (!v.first_name.trim()) er.first_name = "Enter a first name";
  if (!v.last_name.trim()) er.last_name = "Enter a last name";
  if (!v.email.trim()) er.email = "Enter an email address";
  else if (!/\S+@\S+\.\S+/.test(v.email)) er.email = "This email address doesn't look right";
  if (mode === "create") {
    if (!v.password) er.password = "Set a password so they can sign in";
    else if (v.password.length < 6) er.password = "Use at least 6 characters";
  }
  for (const d of DAYS) if (v.week[d].working && v.week[d].end <= v.week[d].start) er.week = `${d}: the shift must end after it starts`;
  return er;
}

const prefix = (e: Record<string, string>) => Object.fromEntries(Object.entries(e).map(([k, m]) => [`custom.${k}`, m]));
const unprefix = (e: Record<string, string>) => Object.fromEntries(Object.entries(e).filter(([k]) => k.startsWith("custom.")).map(([k, m]) => [k.slice(7), m]));

function useLookup(path: string, labelKey: string) {
  const [opts, setOpts] = useState<SelectOption[]>([]);
  useEffect(() => {
    let live = true;
    api.getCached<Record<string, unknown>[]>(path, 120)
      .then((r) => { if (live) setOpts((Array.isArray(r) ? r : []).filter((x) => x.active !== false).map((x) => ({ value: String(x.id), label: String(x[labelKey]) }))); })
      .catch(() => {});
    return () => { live = false; };
  }, [path, labelKey]);
  return opts;
}

let zoneOptions: SelectOption[] | null = null;
function timezoneOptions(): SelectOption[] {
  if (!zoneOptions) {
    // Some browsers list old names (Asia/Calcutta); show the current IANA names instead.
    const modern: Record<string, string> = {
      "Asia/Calcutta": "Asia/Kolkata", "Asia/Katmandu": "Asia/Kathmandu", "Asia/Saigon": "Asia/Ho_Chi_Minh",
      "Asia/Rangoon": "Asia/Yangon", "Europe/Kiev": "Europe/Kyiv", "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
    };
    const zones = Array.from(new Set(allTimeZones().map((z) => modern[z] ?? z))).sort();
    zoneOptions = zones.map((z) => ({ value: z, label: z.replace(/_/g, " "), description: timeZoneOffsetLabel(z) }));
  }
  return zoneOptions;
}

const lookupEmployees = (exclude?: number) => async (q: string): Promise<SelectOption<number>[]> => {
  const r = await api.get<{ value: number; label: string; hint?: string }[]>(`/employees/lookup?limit=20${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  return (Array.isArray(r) ? r : []).filter((e) => e.value !== exclude).map((e) => ({ value: e.value, label: e.label, description: e.hint || undefined }));
};

export type EmployeeFormProps = {
  mode: "create" | "edit";
  initial: EmployeeValues;
  /** The record being edited (for the reporting manager label and to exclude them as their own manager). */
  record?: EmployeeRecord | null;
  onSubmit: (v: EmployeeValues) => void;
  /** Told whenever the form differs from `initial` (drives the modal's unsaved-changes guard). */
  onDirtyChange?: (dirty: boolean) => void;
  /** Extra sections (custom fields etc.), rendered after Background. */
  children?: ReactNode;
  formId?: string;
};

export function EmployeeForm({ mode, initial, record, onSubmit, onDirtyChange, children, formId = EMPLOYEE_FORM_ID }: EmployeeFormProps) {
  const { layout } = useCustomFieldLayout("employee");
  const [v, setV] = useState<EmployeeValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const designations = useLookup("/designations/", "designation_name");
  const departments = useLookup("/departments/", "department_name");
  const titleOptions = useMemo<SelectOption[]>(() => {
    const t = TITLES.includes(v.greeting) || !v.greeting ? TITLES : [...TITLES, v.greeting];
    return t.map((x) => ({ value: x, label: x }));
  }, [v.greeting]);

  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const set = <K extends keyof EmployeeValues>(k: K, val: EmployeeValues[K]) => {
    setV((p) => ({ ...p, [k]: val }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };
  const setDay = (d: string, patch: Partial<WorkDay>) => {
    setV((p) => ({ ...p, week: { ...p.week, [d]: { ...p.week[d], ...patch } } }));
    if (errors.week) setErrors((e) => ({ ...e, week: "" }));
  };

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const er = { ...validateEmployee(v, mode), ...prefix(customFieldErrors(layout, v.custom)) };
    setErrors(er);
    if (Object.keys(er).length === 0) {
      // Send only fields that still exist (switched-off fields would be refused).
      const live = layout ? new Set([...layout.sections.flatMap((x) => x.fields), ...layout.unsectioned].filter((f) => f.active !== false).map((f) => f.key)) : null;
      onSubmit(live ? { ...v, custom: Object.fromEntries(Object.entries(v.custom).filter(([k]) => live.has(k))) } : v);
    }
    else {
      const form = e.currentTarget;
      requestAnimationFrame(() => form.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());
    }
  }

  return (
    <form id={formId} onSubmit={submit} noValidate>
      <FormSection title="Personal details">
        <FormGrid>
          <Field label="First name" required error={errors.first_name}>
            <div className="flex gap-2">
              <Select id="emp-title" invalid={false} aria-label="Title" className="!w-[104px] shrink-0" placeholder="Title" value={v.greeting || null} onChange={(x) => set("greeting", x ?? "")} options={titleOptions} clearable />
              <TextInput autoFocusInModal value={v.first_name} onValueChange={(x) => set("first_name", x)} className="min-w-0 flex-1" autoComplete="off" />
            </div>
          </Field>
          <Field label="Last name" required error={errors.last_name}>
            <TextInput value={v.last_name} onValueChange={(x) => set("last_name", x)} autoComplete="off" />
          </Field>
          <Field label="Work email" required error={errors.email} hint={mode === "create" ? "They sign in with this" : undefined}>
            <TextInput type="email" leading={Mail} value={v.email} onValueChange={(x) => set("email", x)} placeholder="name@company.com" autoComplete="off" />
          </Field>
          <Field label="Mobile number">
            <TextInput type="tel" leading={Phone} value={v.phone} onValueChange={(x) => set("phone", x)} placeholder="+91" />
          </Field>
          {mode === "create" && (
            <Field label="Sign-in password" required error={errors.password} hint="At least 6 characters. They can change it later.">
              <TextInput type="password" leading={Lock} value={v.password} onValueChange={(x) => set("password", x)} autoComplete="new-password" />
            </Field>
          )}
        </FormGrid>
      </FormSection>

      <FormSection title="Job">
        <FormGrid>
          <Field label="Designation">
            <Select value={v.designation_id || null} onChange={(x) => set("designation_id", x ?? "")} options={designations} placeholder="Not set" clearable />
          </Field>
          <Field label="Department">
            <Select value={v.department_id || null} onChange={(x) => set("department_id", x ?? "")} options={departments} placeholder="Not set" clearable />
          </Field>
          <Field label="Employee code" aside="Optional">
            <TextInput value={v.employee_code} onValueChange={(x) => set("employee_code", x)} placeholder="e.g. EMP-0042" />
          </Field>
          <Field label="Access">
            <Select value={v.role} onChange={(x) => set("role", x ?? "employee")} options={ROLE_OPTIONS} />
          </Field>
          <Field label="Reporting manager" aside="Optional">
            <Select<number> value={v.reporting_manager_id} onChange={(x) => set("reporting_manager_id", x)} loadOptions={lookupEmployees(record?.id)}
              selectedOption={record?.reporting_manager_id ? { value: record.reporting_manager_id, label: record.reporting_manager_name || "Current manager" } : null}
              placeholder="Search people" clearable />
          </Field>
          <Field label="Timezone" hint="Times they see and clock in with use this zone.">
            <Select value={v.timezone || null} onChange={(x) => set("timezone", x ?? "")} options={timezoneOptions()} placeholder="Same as company" clearable />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Background">
        <FormGrid>
          <Field label="Highest qualification">
            <TextInput value={v.qualification} onValueChange={(x) => set("qualification", x)} placeholder="e.g. B.Com, MBA" />
          </Field>
          <Field label="Experience before joining">
            <NumberInput value={v.experience === "" ? null : Number(v.experience)} onChange={(n) => set("experience", n === null ? "" : String(n))} min={0} max={60} suffix="years" />
          </Field>
        </FormGrid>
      </FormSection>

      <CustomFields entity="employee" layout={layout} values={v.custom}
        onChange={(custom) => { setV((p) => ({ ...p, custom })); setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith("custom.")))); }}
        errors={unprefix(errors)} />

      {children}

      <FormSection title="Work arrangement" description="Working days and the usual shift. Rosters can change this for specific dates.">
        <ul className="divide-y divide-line rounded-xl border border-line">
          {DAYS.map((d) => {
            const day = v.week[d];
            return (
              <li key={d} className="flex min-h-[56px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
                <div className="flex w-36 items-center gap-3">
                  <Toggle size="sm" checked={day.working} onChange={(x) => setDay(d, { working: x })} aria-label={`${d} is a working day`} />
                  <span className={day.working ? "text-[14px] text-ink" : "text-[14px] text-muted"}>{d}</span>
                </div>
                {day.working ? (
                  <div className="flex items-center gap-2 text-[13px] text-faint">
                    <TimeInput aria-label={`${d} start`} value={day.start} onChange={(x) => setDay(d, { start: x })} className="!h-9 !w-[132px]" />
                    to
                    <TimeInput aria-label={`${d} end`} value={day.end} onChange={(x) => setDay(d, { end: x })} className="!h-9 !w-[132px]" />
                  </div>
                ) : <span className="text-[13px] text-faint">Weekly off</span>}
              </li>
            );
          })}
        </ul>
        {errors.week && <p className="mt-2 text-[12.5px] text-rose-600">{errors.week}</p>}
      </FormSection>
    </form>
  );
}
