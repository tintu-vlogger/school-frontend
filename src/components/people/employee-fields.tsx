"use client";

/*
 * Employee form sections, shared by the add wizard and the edit modal.
 *
 *   const [d, setD] = useState<Draft>(EMPTY_DRAFT);
 *   <PersonalFields d={d} set={patch} errors={errors} />
 *   <JobFields d={d} set={patch} errors={errors} self={profile} />
 *   <ContactFields ... />  <StatutoryFields ... />
 *   api.post("/employees/", draftPayload(d, "create"))
 *
 * Every value is a string ("" = empty) or a number id (null = empty), so `dirty` can be
 * checked with JSON comparison. Add a field by extending Draft, EMPTY_DRAFT,
 * draftFromProfile and draftPayload together.
 */
import { useMemo } from "react";
import { Lock, Mail, Phone } from "lucide-react";
import { allTimeZones, timeZoneOffsetLabel } from "@/lib/datetime";
import {
  DateInput, Field, FormGrid, FormSection, MasterSelect, MultiSelect, NumberInput, Select, TextInput, Toggle, type SelectOption,
} from "@/components/ui-kit";
import { lookupEmployees, tagOptions, useOrgOptions, useTags } from "./hooks";
import { ROLE_OPTIONS, WORK_MODES, type Address, type Profile } from "./types";

export type AddressDraft = { line1: string; line2: string; city: string; state_id: number | null; pincode: string; country_id: number | null };
const EMPTY_ADDRESS: AddressDraft = { line1: "", line2: "", city: "", state_id: null, pincode: "", country_id: null };

export type Draft = {
  greeting: string; first_name: string; middle_name: string; last_name: string; preferred_name: string;
  email: string; phone: string; password: string; employee_code: string; role: string;
  gender_id: number | null; date_of_birth: string; marital_status_id: number | null; marriage_date: string;
  blood_group_id: number | null; nationality_id: number | null; father_name: string; spouse_name: string;
  personal_email: string; alternate_phone: string; work_phone: string; extension: string;
  current_address: AddressDraft; permanent_address: AddressDraft; same_address: boolean;
  pan: string; aadhaar: string; uan: string; esi_number: string; passport_number: string; passport_expiry: string;
  driving_licence: string; driving_licence_expiry: string;
  legal_entity_id: number | null; location_id: number | null; department_id: number | null; designation_id: number | null;
  grade_id: number | null; cost_centre_id: number | null; employment_type_id: number | null; employee_status_id: number | null;
  status: string; date_of_joining: string; probation_end_date: string; confirmation_date: string; notice_period_days: number | null;
  reporting_manager_id: number | null; secondary_manager_id: number | null; work_mode: string; timezone: string;
  team_ids: number[]; tag_ids: number[];
};

export const EMPTY_DRAFT: Draft = {
  greeting: "", first_name: "", middle_name: "", last_name: "", preferred_name: "", email: "", phone: "", password: "",
  employee_code: "", role: "employee", gender_id: null, date_of_birth: "", marital_status_id: null, marriage_date: "",
  blood_group_id: null, nationality_id: null, father_name: "", spouse_name: "", personal_email: "", alternate_phone: "",
  work_phone: "", extension: "", current_address: EMPTY_ADDRESS, permanent_address: EMPTY_ADDRESS, same_address: false,
  pan: "", aadhaar: "", uan: "", esi_number: "", passport_number: "", passport_expiry: "", driving_licence: "",
  driving_licence_expiry: "", legal_entity_id: null, location_id: null, department_id: null, designation_id: null,
  grade_id: null, cost_centre_id: null, employment_type_id: null, employee_status_id: null, status: "probation",
  date_of_joining: "", probation_end_date: "", confirmation_date: "", notice_period_days: 30, reporting_manager_id: null,
  secondary_manager_id: null, work_mode: "office", timezone: "", team_ids: [], tag_ids: [],
};

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const addr = (a?: Address | null): AddressDraft => ({
  line1: s(a?.line1), line2: s(a?.line2), city: s(a?.city), state_id: a?.state_id ?? null, pincode: s(a?.pincode), country_id: a?.country_id ?? null,
});

export function draftFromProfile(p: Profile): Draft {
  const cur = addr(p.current_address), perm = addr(p.permanent_address);
  return {
    ...EMPTY_DRAFT,
    greeting: s(p.greeting), first_name: p.first_name, middle_name: s(p.middle_name), last_name: p.last_name,
    preferred_name: s(p.preferred_name), email: p.email, phone: s(p.phone), employee_code: s(p.employee_code),
    role: ["admin", "hr", "manager"].includes(p.role) ? p.role : "employee",
    gender_id: p.gender_id, date_of_birth: s(p.date_of_birth), marital_status_id: p.marital_status_id, marriage_date: s(p.marriage_date),
    blood_group_id: p.blood_group_id, nationality_id: p.nationality_id, father_name: s(p.father_name), spouse_name: s(p.spouse_name),
    personal_email: s(p.personal_email), alternate_phone: s(p.alternate_phone), work_phone: s(p.work_phone), extension: s(p.extension),
    current_address: cur, permanent_address: perm, same_address: false,
    pan: s(p.pan), aadhaar: "", uan: s(p.uan), esi_number: s(p.esi_number), passport_number: s(p.passport_number),
    passport_expiry: s(p.passport_expiry), driving_licence: s(p.driving_licence), driving_licence_expiry: s(p.driving_licence_expiry),
    legal_entity_id: p.legal_entity_id, location_id: p.location_id, department_id: p.department_id, designation_id: p.designation_id,
    grade_id: p.grade_id, cost_centre_id: p.cost_centre_id, employment_type_id: p.employment_type_id,
    employee_status_id: p.employee_status_id, status: p.status, date_of_joining: s(p.date_of_joining),
    probation_end_date: s(p.probation_end_date), confirmation_date: s(p.confirmation_date), notice_period_days: p.notice_period_days,
    reporting_manager_id: p.reporting_manager_id, secondary_manager_id: p.secondary_manager_id, work_mode: s(p.work_mode),
    timezone: s(p.timezone), team_ids: p.teams.map((t) => t.id), tag_ids: p.tags.map((t) => t.id),
  };
}

const opt = (v: string) => v.trim() || null;
const addrOut = (a: AddressDraft) => {
  const o = { line1: opt(a.line1), line2: opt(a.line2), city: opt(a.city), state_id: a.state_id, pincode: opt(a.pincode), country_id: a.country_id };
  return Object.values(o).some((x) => x !== null) ? o : {};
};

function fullPayload(d: Draft): Record<string, unknown> {
  return {
    greeting: opt(d.greeting), first_name: d.first_name.trim(), middle_name: opt(d.middle_name), last_name: d.last_name.trim(),
    preferred_name: opt(d.preferred_name), email: d.email.trim(), phone: opt(d.phone), employee_code: opt(d.employee_code), role: d.role,
    gender_id: d.gender_id, date_of_birth: opt(d.date_of_birth), marital_status_id: d.marital_status_id, marriage_date: opt(d.marriage_date),
    blood_group_id: d.blood_group_id, nationality_id: d.nationality_id, father_name: opt(d.father_name), spouse_name: opt(d.spouse_name),
    personal_email: opt(d.personal_email), alternate_phone: opt(d.alternate_phone), work_phone: opt(d.work_phone), extension: opt(d.extension),
    current_address: addrOut(d.current_address), permanent_address: addrOut(d.same_address ? d.current_address : d.permanent_address),
    pan: opt(d.pan.replace(/\s/g, "")), uan: opt(d.uan), esi_number: opt(d.esi_number), passport_number: opt(d.passport_number),
    passport_expiry: opt(d.passport_expiry), driving_licence: opt(d.driving_licence), driving_licence_expiry: opt(d.driving_licence_expiry),
    legal_entity_id: d.legal_entity_id, location_id: d.location_id, department_id: d.department_id, designation_id: d.designation_id,
    grade_id: d.grade_id, cost_centre_id: d.cost_centre_id, employment_type_id: d.employment_type_id, employee_status_id: d.employee_status_id,
    date_of_joining: opt(d.date_of_joining), probation_end_date: opt(d.probation_end_date), confirmation_date: opt(d.confirmation_date),
    notice_period_days: d.notice_period_days, reporting_manager_id: d.reporting_manager_id, secondary_manager_id: d.secondary_manager_id,
    work_mode: opt(d.work_mode), timezone: opt(d.timezone), team_ids: d.team_ids, tag_ids: d.tag_ids,
  };
}

/** Body for POST /employees/ (create) or PUT /employees/{uuid} (edit: only fields that changed). */
export function draftPayload(d: Draft, mode: "create" | "edit", initial?: Draft) {
  const full = fullPayload(d);
  const aadhaar = d.aadhaar.replace(/\s/g, "");
  if (mode === "create") {
    const out = Object.fromEntries(Object.entries(full).filter(([, v]) =>
      v !== null && v !== "" && !(Array.isArray(v) && !v.length) && !(typeof v === "object" && !Array.isArray(v) && !Object.keys(v as object).length)));
    if (aadhaar) out.aadhaar = aadhaar;
    out.status = d.status;
    if (d.password) out.password = d.password;
    return out;
  }
  const before = initial ? fullPayload(initial) : {};
  const out = Object.fromEntries(Object.entries(full).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(before[k])));
  if (aadhaar) out.aadhaar = aadhaar;
  return out;
}

const PAN_RE = /^[A-Z]{3}P[A-Z][0-9]{4}[A-Z]$/;

export function validateDraft(d: Draft, mode: "create" | "edit", step?: "personal" | "job" | "contact" | "ids" | "access") {
  const er: Record<string, string> = {};
  const all = !step;
  if (all || step === "personal") {
    if (!d.first_name.trim()) er.first_name = "Enter a first name";
    if (!d.last_name.trim()) er.last_name = "Enter a last name";
    if (d.date_of_birth && d.date_of_birth > new Date().toISOString().slice(0, 10)) er.date_of_birth = "Date of birth can't be in the future";
  }
  if (all || step === "job") {
    if (!d.email.trim()) er.email = "Enter the work email";
    else if (!/\S+@\S+\.\S+/.test(d.email)) er.email = "This email address doesn't look right";
    if (mode === "create" && !d.date_of_joining) er.date_of_joining = "Pick the joining date";
    if (d.probation_end_date && d.date_of_joining && d.probation_end_date < d.date_of_joining) er.probation_end_date = "Probation can't end before joining";
  }
  if (all || step === "contact") {
    if (d.current_address.pincode && !/^[1-9][0-9]{5}$/.test(d.current_address.pincode)) er["current_address.pincode"] = "PIN codes have 6 digits";
    if (!d.same_address && d.permanent_address.pincode && !/^[1-9][0-9]{5}$/.test(d.permanent_address.pincode)) er["permanent_address.pincode"] = "PIN codes have 6 digits";
    if (d.personal_email && !/\S+@\S+\.\S+/.test(d.personal_email)) er.personal_email = "This email address doesn't look right";
  }
  if (all || step === "ids") {
    const pan = d.pan.replace(/\s/g, "").toUpperCase();
    if (pan && !PAN_RE.test(pan)) er.pan = "PAN looks like ABCPE1234F (4th letter P for a person)";
    const a = d.aadhaar.replace(/\s/g, "");
    if (a && !/^[2-9][0-9]{11}$/.test(a)) er.aadhaar = "Aadhaar has 12 digits";
    if (d.uan && !/^[0-9]{12}$/.test(d.uan.replace(/\s/g, ""))) er.uan = "UAN has 12 digits";
    if (d.passport_number && !/^[A-Za-z][0-9]{7}$/.test(d.passport_number.replace(/\s/g, ""))) er.passport_number = "Like K1234567";
  }
  if ((all || step === "access") && mode === "create" && d.password && d.password.length < 6) er.password = "Use at least 6 characters";
  return er;
}

export type SectionProps = { d: Draft; set: (patch: Partial<Draft>) => void; errors: Record<string, string>; record?: Profile | null };

const TITLES = ["Mr.", "Ms.", "Mrs.", "Dr.", "Prof."].map((x) => ({ value: x, label: x }));

export function PersonalFields({ d, set, errors }: SectionProps) {
  return (
    <>
      <FormSection title="Name">
        <FormGrid columns={3}>
          <Field label="Title"><Select value={d.greeting || null} onChange={(x) => set({ greeting: x ?? "" })} options={TITLES} placeholder="None" clearable /></Field>
          <Field label="First name" required error={errors.first_name}><TextInput autoFocusInModal value={d.first_name} onValueChange={(x) => set({ first_name: x })} autoComplete="off" /></Field>
          <Field label="Middle name"><TextInput value={d.middle_name} onValueChange={(x) => set({ middle_name: x })} autoComplete="off" /></Field>
          <Field label="Last name" required error={errors.last_name}><TextInput value={d.last_name} onValueChange={(x) => set({ last_name: x })} autoComplete="off" /></Field>
          <Field label="Preferred name" hint="What colleagues call them"><TextInput value={d.preferred_name} onValueChange={(x) => set({ preferred_name: x })} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Personal">
        <FormGrid columns={3}>
          <Field label="Gender"><MasterSelect type="gender" value={d.gender_id} onChange={(x) => set({ gender_id: x })} clearable /></Field>
          <Field label="Date of birth" error={errors.date_of_birth}><DateInput value={d.date_of_birth} onChange={(x) => set({ date_of_birth: x })} clearable /></Field>
          <Field label="Blood group"><MasterSelect type="blood_group" value={d.blood_group_id} onChange={(x) => set({ blood_group_id: x })} clearable /></Field>
          <Field label="Marital status"><MasterSelect type="marital_status" value={d.marital_status_id} onChange={(x) => set({ marital_status_id: x })} clearable /></Field>
          <Field label="Marriage date"><DateInput value={d.marriage_date} onChange={(x) => set({ marriage_date: x })} clearable /></Field>
          <Field label="Nationality"><MasterSelect type="nationality" value={d.nationality_id} onChange={(x) => set({ nationality_id: x })} clearable /></Field>
          <Field label="Father's name" hint="Needed for PF and ESI"><TextInput value={d.father_name} onValueChange={(x) => set({ father_name: x })} /></Field>
          <Field label="Spouse's name"><TextInput value={d.spouse_name} onValueChange={(x) => set({ spouse_name: x })} /></Field>
        </FormGrid>
      </FormSection>
    </>
  );
}

let zoneOptions: SelectOption[] | null = null;
function timezoneOptions(): SelectOption[] {
  if (!zoneOptions) {
    const modern: Record<string, string> = { "Asia/Calcutta": "Asia/Kolkata", "Asia/Katmandu": "Asia/Kathmandu", "Asia/Saigon": "Asia/Ho_Chi_Minh" };
    const zones = Array.from(new Set(allTimeZones().map((z) => modern[z] ?? z))).sort();
    zoneOptions = zones.map((z) => ({ value: z, label: z.replace(/_/g, " "), description: timeZoneOffsetLabel(z) }));
  }
  return zoneOptions;
}

export function JobFields({ d, set, errors, record, mode }: SectionProps & { mode: "create" | "edit" }) {
  const o = useOrgOptions();
  const { tags } = useTags();
  const tagOpts = useMemo(() => tagOptions(tags), [tags]);
  return (
    <>
      <FormSection title="Role">
        <FormGrid columns={3}>
          <Field label="Work email" required error={errors.email} hint={mode === "create" ? "They sign in with this" : undefined} className="sm:col-span-2">
            <TextInput type="email" leading={Mail} value={d.email} onValueChange={(x) => set({ email: x })} placeholder="name@company.com" autoComplete="off" />
          </Field>
          <Field label="Employee ID" aside="Optional" hint={mode === "create" ? "Leave empty to number automatically" : undefined}>
            <TextInput value={d.employee_code} onValueChange={(x) => set({ employee_code: x })} placeholder="e.g. NG1042" />
          </Field>
          <Field label="Designation"><Select value={d.designation_id} onChange={(x) => set({ designation_id: x })} options={o.designations} placeholder="Not set" clearable /></Field>
          <Field label="Department"><Select value={d.department_id} onChange={(x) => set({ department_id: x })} options={o.departments} placeholder="Not set" clearable /></Field>
          <Field label="Grade"><Select value={d.grade_id} onChange={(x) => set({ grade_id: x })} options={o.grades} placeholder="Not set" clearable /></Field>
          <Field label="Legal entity"><Select value={d.legal_entity_id} onChange={(x) => set({ legal_entity_id: x })} options={o.entities} placeholder="Not set" clearable /></Field>
          <Field label="Location"><Select value={d.location_id} onChange={(x) => set({ location_id: x })} options={o.locations} placeholder="Not set" clearable /></Field>
          <Field label="Cost centre"><Select value={d.cost_centre_id} onChange={(x) => set({ cost_centre_id: x })} options={o.costCentres} placeholder="Not set" clearable /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Employment">
        <FormGrid columns={3}>
          <Field label="Employment type"><MasterSelect type="employment_type" value={d.employment_type_id} onChange={(x) => set({ employment_type_id: x })} clearable /></Field>
          {mode === "create" ? (
            <Field label="Starts as">
              <Select value={d.status} onChange={(x) => set({ status: x ?? "probation" })} options={[
                { value: "pre_joining", label: "Pre-joining", description: "Hasn't joined yet" },
                { value: "probation", label: "On probation" }, { value: "confirmed", label: "Confirmed" },
              ]} />
            </Field>
          ) : (
            <Field label="Sub-status" aside="Optional"><MasterSelect type="employee_status" value={d.employee_status_id} onChange={(x) => set({ employee_status_id: x })} clearable /></Field>
          )}
          <Field label="Work mode"><Select value={d.work_mode || null} onChange={(x) => set({ work_mode: x ?? "" })} options={WORK_MODES} clearable placeholder="Not set" /></Field>
          <Field label="Date of joining" required={mode === "create"} error={errors.date_of_joining}><DateInput value={d.date_of_joining} onChange={(x) => set({ date_of_joining: x })} clearable /></Field>
          <Field label="Probation ends" error={errors.probation_end_date}><DateInput value={d.probation_end_date} onChange={(x) => set({ probation_end_date: x })} clearable /></Field>
          {mode === "edit"
            ? <Field label="Confirmation date"><DateInput value={d.confirmation_date} onChange={(x) => set({ confirmation_date: x })} clearable /></Field>
            : <div className="hidden sm:block" />}
          <Field label="Notice period"><NumberInput value={d.notice_period_days} onChange={(x) => set({ notice_period_days: x })} min={0} max={365} suffix="days" /></Field>
          <Field label="Timezone" className="sm:col-span-2"><Select value={d.timezone || null} onChange={(x) => set({ timezone: x ?? "" })} options={timezoneOptions()} placeholder="Same as company" clearable /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Reporting and groups">
        <FormGrid columns={2}>
          <Field label="Reporting manager">
            <Select<number> value={d.reporting_manager_id} onChange={(x) => set({ reporting_manager_id: x })} loadOptions={lookupEmployees(record?.id)}
              selectedOption={record?.reporting_manager ? { value: record.reporting_manager.id, label: record.reporting_manager.name } : null}
              placeholder="Search people" clearable />
          </Field>
          <Field label="Secondary manager" aside="Optional">
            <Select<number> value={d.secondary_manager_id} onChange={(x) => set({ secondary_manager_id: x })} loadOptions={lookupEmployees(record?.id)}
              selectedOption={record?.secondary_manager ? { value: record.secondary_manager.id, label: record.secondary_manager.name } : null}
              placeholder="Search people" clearable />
          </Field>
          <Field label="Teams"><MultiSelect<number> value={d.team_ids} onChange={(x) => set({ team_ids: x })} options={o.teams} placeholder="None" /></Field>
          <Field label="Tags"><MultiSelect<number> value={d.tag_ids} onChange={(x) => set({ tag_ids: x })} options={tagOpts} placeholder="None" /></Field>
        </FormGrid>
      </FormSection>
    </>
  );
}

function AddressFields({ value, onChange, errorKey, errors }: { value: AddressDraft; onChange: (a: AddressDraft) => void; errorKey: string; errors: Record<string, string> }) {
  const set = (p: Partial<AddressDraft>) => onChange({ ...value, ...p });
  return (
    <FormGrid columns={3}>
      <Field label="House, building" className="sm:col-span-2"><TextInput value={value.line1} onValueChange={(x) => set({ line1: x })} /></Field>
      <Field label="Area, street"><TextInput value={value.line2} onValueChange={(x) => set({ line2: x })} /></Field>
      <Field label="City"><TextInput value={value.city} onValueChange={(x) => set({ city: x })} /></Field>
      <Field label="State"><MasterSelect type="state" value={value.state_id} onChange={(x) => set({ state_id: x })} clearable /></Field>
      <Field label="PIN code" error={errors[`${errorKey}.pincode`]}><TextInput value={value.pincode} onValueChange={(x) => set({ pincode: x.replace(/\D/g, "").slice(0, 6) })} inputMode="numeric" /></Field>
    </FormGrid>
  );
}

export function ContactFields({ d, set, errors }: SectionProps) {
  return (
    <>
      <FormSection title="Phone and email">
        <FormGrid columns={3}>
          <Field label="Mobile number"><TextInput type="tel" leading={Phone} value={d.phone} onValueChange={(x) => set({ phone: x })} placeholder="+91" /></Field>
          <Field label="Alternate phone"><TextInput type="tel" value={d.alternate_phone} onValueChange={(x) => set({ alternate_phone: x })} /></Field>
          <Field label="Personal email" error={errors.personal_email}><TextInput type="email" value={d.personal_email} onValueChange={(x) => set({ personal_email: x })} /></Field>
          <Field label="Work phone"><TextInput type="tel" value={d.work_phone} onValueChange={(x) => set({ work_phone: x })} /></Field>
          <Field label="Extension"><TextInput value={d.extension} onValueChange={(x) => set({ extension: x })} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Current address">
        <AddressFields value={d.current_address} onChange={(a) => set({ current_address: a })} errorKey="current_address" errors={errors} />
      </FormSection>
      <FormSection title="Permanent address">
        <Toggle checked={d.same_address} onChange={(x) => set({ same_address: x })} label="Same as current address" className="mb-4" />
        {!d.same_address && <AddressFields value={d.permanent_address} onChange={(a) => set({ permanent_address: a })} errorKey="permanent_address" errors={errors} />}
      </FormSection>
    </>
  );
}

export function StatutoryFields({ d, set, errors, record }: SectionProps) {
  return (
    <FormSection title="Government IDs" description="Checked for format and for duplicates across the company.">
      <FormGrid columns={2}>
        <Field label="PAN" error={errors.pan}><TextInput value={d.pan} onValueChange={(x) => set({ pan: x.toUpperCase() })} maxLength={10} placeholder="ABCPE1234F" className="font-mono" /></Field>
        <Field label="Aadhaar" error={errors.aadhaar} hint={record?.aadhaar_masked ? `On record: ${record.aadhaar_masked}. Type a new number only to replace it.` : "Stored encrypted; only the last 4 digits are shown."}>
          <TextInput leading={Lock} value={d.aadhaar} onValueChange={(x) => set({ aadhaar: x.replace(/[^\d ]/g, "").slice(0, 14) })} inputMode="numeric" placeholder="1234 5678 9012" className="font-mono" autoComplete="off" />
        </Field>
        <Field label="UAN" error={errors.uan}><TextInput value={d.uan} onValueChange={(x) => set({ uan: x.replace(/\D/g, "").slice(0, 12) })} inputMode="numeric" className="font-mono" /></Field>
        <Field label="ESI number"><TextInput value={d.esi_number} onValueChange={(x) => set({ esi_number: x.replace(/\D/g, "").slice(0, 17) })} inputMode="numeric" className="font-mono" /></Field>
        <Field label="Passport number" error={errors.passport_number}><TextInput value={d.passport_number} onValueChange={(x) => set({ passport_number: x.toUpperCase() })} maxLength={8} className="font-mono" /></Field>
        <Field label="Passport expiry"><DateInput value={d.passport_expiry} onChange={(x) => set({ passport_expiry: x })} clearable /></Field>
        <Field label="Driving licence"><TextInput value={d.driving_licence} onValueChange={(x) => set({ driving_licence: x.toUpperCase() })} className="font-mono" /></Field>
        <Field label="Licence valid until"><DateInput value={d.driving_licence_expiry} onChange={(x) => set({ driving_licence_expiry: x })} clearable /></Field>
      </FormGrid>
    </FormSection>
  );
}

export function AccessFields({ d, set, errors, record }: SectionProps) {
  return (
    <FormSection title="Sign-in and access">
      <FormGrid columns={2}>
        <Field label="Access"><Select value={d.role} onChange={(x) => set({ role: x ?? "employee" })} options={ROLE_OPTIONS} /></Field>
        {!record && <Field label="Sign-in password" error={errors.password} hint="Optional. At least 6 characters; they can change it later.">
          <TextInput type="password" leading={Lock} value={d.password} onValueChange={(x) => set({ password: x })} autoComplete="new-password" />
        </Field>}
      </FormGrid>
    </FormSection>
  );
}
