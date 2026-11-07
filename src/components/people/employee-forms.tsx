"use client";

/*
 * Add and edit employees.
 *
 *   <EmployeeWizard open onClose onSaved={(uuid) => ...} />
 *     New employee in a multi-step Stepper modal (personal, job, contact, IDs, review).
 *     Warns about duplicates (email, mobile, PAN, Aadhaar, UAN) before saving and offers to
 *     open a former employee's record to rehire them instead.
 *
 *   <EmployeeEditModal open profile={p} initialTab="job" onClose onSaved />
 *     Edit an existing record by section; only changed fields are sent.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Button, Field, KeyValue, Modal, ModalCancel, Section, Stepper, Tabs } from "@/components/ui-kit";
import {
  AccessFields, ContactFields, EMPTY_DRAFT, JobFields, PersonalFields, StatutoryFields, draftFromProfile, draftPayload, validateDraft,
  type Draft,
} from "./employee-fields";
import { PositionPicker, usePositionsSetup } from "@/components/positions/shared";
import type { Position } from "@/components/positions/types";
import { useOrgOptions } from "./hooks";
import { STATUS, day, type Profile } from "./types";

type Dup = { field: string; label: string; uuid: string; name: string; employee_code: string | null; status: string; can_rehire: boolean };

const STEPS = [
  { key: "personal", label: "Personal", description: "Name and details" },
  { key: "job", label: "Job", description: "Role and reporting" },
  { key: "contact", label: "Contact", description: "Phones and address" },
  { key: "ids", label: "IDs", description: "PAN, Aadhaar, UAN" },
  { key: "review", label: "Review", description: "Access and check" },
] as const;

function DuplicateNotice({ dups }: { dups: Dup[] }) {
  if (!dups.length) return null;
  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[13.5px] text-amber-800">
      <p className="mb-1.5 flex items-center gap-2"><AlertTriangle size={15} strokeWidth={1.4} /> Possible duplicate</p>
      <ul className="space-y-1">
        {dups.map((d, i) => (
          <li key={i}>
            {d.label} already belongs to{" "}
            <Link href={`/dashboard/staff?view=${d.uuid}`} className="underline underline-offset-2">{d.name}{d.employee_code ? ` (${d.employee_code})` : ""}</Link>
            {" · "}{STATUS[d.status]?.label ?? d.status}
            {d.can_rehire && <span> — they have left; open their record and use <em>Rehire</em> instead of adding a new one.</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EmployeeWizard({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: (uuid: string) => void }) {
  const toast = useToast();
  const [d, setD] = useState<Draft>(EMPTY_DRAFT);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dups, setDups] = useState<Dup[]>([]);
  const [saving, setSaving] = useState(false);
  const o = useOrgOptions();
  const positions = usePositionsSetup();
  const [position, setPosition] = useState<Position | null>(null);
  const dirty = JSON.stringify(d) !== JSON.stringify(EMPTY_DRAFT);
  const set = (patch: Partial<Draft>) => { setD((x) => ({ ...x, ...patch })); setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in patch)))); };

  async function checkDuplicates(next: Draft) {
    try {
      const r = await api.post<Dup[]>("/employees/duplicates", {
        email: next.email || null, phone: next.phone || null, pan: next.pan || null,
        aadhaar: next.aadhaar.replace(/\s/g, "") || null, uan: next.uan || null,
      });
      setDups(Array.isArray(r) ? r : []);
    } catch { /* a warning only */ }
  }

  function next() {
    const key = STEPS[step].key;
    const er = key === "review" ? validateDraft(d, "create") : validateDraft(d, "create", key);
    if (key === "job" && positions.required && !position) er.position = "Pick the vacant position for this hire";
    setErrors(er);
    if (Object.keys(er).length) return;
    if (key !== "personal") checkDuplicates(d);
    if (step < STEPS.length - 1) setStep(step + 1);
    else save();
  }

  async function save() {
    const er = validateDraft(d, "create");
    if (Object.keys(er).length) {
      setErrors(er);
      const first = Object.keys(er)[0];
      setStep(["first_name", "last_name", "date_of_birth"].includes(first) ? 0 : ["email", "date_of_joining", "probation_end_date"].includes(first) ? 1 : first.includes("address") || first === "personal_email" ? 2 : 3);
      return;
    }
    setSaving(true);
    try {
      const r = await api.post<{ uuid: string }>("/employees/", draftPayload(d, "create"));
      if (position) {
        // Take the seat from the joining date; the record already carries the position's job details.
        await api.post(`/positions/positions/${position.uuid}/seats`, { employee_uuid: r.uuid, effective_date: d.date_of_joining || null, source: "hire", change_type: "other" })
          .catch((e) => toast.error("Added, but couldn't place them in the position", { description: e instanceof Error ? e.message : undefined }));
      }
      setPosition(null);
      toast.success("Employee added", { description: `${d.first_name} ${d.last_name} is now in the directory.` });
      setD(EMPTY_DRAFT);
      setStep(0);
      onClose();
      onSaved?.(r.uuid);
    } catch (e) {
      toast.error("Couldn't add the employee", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  const label = (opts: { value: number; label: string }[], id: number | null) => opts.find((x) => x.value === id)?.label ?? null;
  const key = STEPS[step].key;
  return (
    <Modal open={open} onClose={() => { setD(EMPTY_DRAFT); setStep(0); setDups([]); setErrors({}); setPosition(null); onClose(); }} size="xl" dirty={dirty} busy={saving}
      title="Add employee" description="Five short steps. Only the name, work email and joining date are needed now; the rest can follow."
      leading={<span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary"><UserPlus size={19} strokeWidth={1.4} /></span>}
      footerStart={<span className="text-[13px] text-faint tabular">Step {step + 1} of {STEPS.length}</span>}
      footer={<>
        {step === 0 ? <ModalCancel /> : <Button icon={ArrowLeft} onClick={() => setStep(step - 1)} disabled={saving}>Back</Button>}
        <Button variant="primary" icon={step === STEPS.length - 1 ? Check : ArrowRight} onClick={next} loading={saving}>
          {step === STEPS.length - 1 ? "Add employee" : "Continue"}
        </Button>
      </>}>
      <Stepper steps={STEPS.map((s) => ({ label: s.label, description: s.description }))} current={step} onStepClick={setStep} className="mb-8" />
      <DuplicateNotice dups={dups} />
      <form onSubmit={(e) => { e.preventDefault(); next(); }} noValidate>
        {key === "personal" && <PersonalFields d={d} set={set} errors={errors} />}
        {key === "job" && positions.enabled && (
          <Field label="Position" className="mb-6" required={positions.required} error={errors.position}
            hint={position ? `Department, designation, location, grade, cost centre and manager are filled from ${position.code}.` : "Pick the vacant position this person is hired for."}>
            <PositionPicker value={position?.uuid ?? null} onChange={(_, p) => {
              setPosition(p);
              setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== "position")));
              if (p) set({ department_id: p.department_id ?? d.department_id, designation_id: p.designation_id ?? d.designation_id, location_id: p.location_id ?? d.location_id,
                grade_id: p.grade_id ?? d.grade_id, cost_centre_id: p.cost_centre_id ?? d.cost_centre_id, reporting_manager_id: p.manager_id ?? d.reporting_manager_id });
            }} />
          </Field>
        )}
        {key === "job" && <JobFields d={d} set={set} errors={errors} mode="create" />}
        {key === "contact" && <ContactFields d={d} set={set} errors={errors} />}
        {key === "ids" && <StatutoryFields d={d} set={set} errors={errors} />}
        {key === "review" && (
          <>
            <AccessFields d={d} set={set} errors={errors} />
            <Section title="Check the details" className="border-t border-line">
              <KeyValue columns={3} items={[
                { label: "Name", value: [d.greeting, d.first_name, d.middle_name, d.last_name].filter(Boolean).join(" ") },
                { label: "Work email", value: d.email },
                { label: "Mobile", value: d.phone },
                { label: "Designation", value: label(o.designations, d.designation_id) },
                { label: "Department", value: label(o.departments, d.department_id) },
                { label: "Location", value: label(o.locations, d.location_id) },
                { label: "Legal entity", value: label(o.entities, d.legal_entity_id) },
                { label: "Joins on", value: day(d.date_of_joining) },
                { label: "Starts as", value: STATUS[d.status]?.label },
                { label: "PAN", value: d.pan },
                { label: "Aadhaar", value: d.aadhaar ? `XXXX XXXX ${d.aadhaar.replace(/\s/g, "").slice(-4)}` : null },
                { label: "UAN", value: d.uan },
              ]} />
            </Section>
          </>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

const EDIT_TABS = [
  { value: "personal", label: "Personal" }, { value: "job", label: "Job" }, { value: "contact", label: "Contact" },
  { value: "ids", label: "IDs" }, { value: "access", label: "Access" },
] as const;
export type EditTab = (typeof EDIT_TABS)[number]["value"];

export function EmployeeEditModal({ open, profile, initialTab = "personal", onClose, onSaved }: {
  open: boolean; profile: Profile | null; initialTab?: EditTab; onClose: () => void; onSaved?: () => void;
}) {
  const toast = useToast();
  const [tab, setTab] = useState<EditTab>(initialTab);
  const [initial, setInitial] = useState<Draft | null>(null);
  const [d, setD] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open && profile) {
      const x = draftFromProfile(profile);
      setInitial(x); setD(x); setTab(initialTab); setErrors({});
    }
    // re-initialise only when the modal opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const dirty = !!d && !!initial && JSON.stringify(d) !== JSON.stringify(initial);
  const set = (patch: Partial<Draft>) => { setD((x) => (x ? { ...x, ...patch } : x)); setErrors({}); };

  async function save() {
    if (!d || !profile || !initial) return;
    const er = validateDraft(d, "edit");
    setErrors(er);
    if (Object.keys(er).length) {
      const first = Object.keys(er)[0];
      setTab(["first_name", "last_name", "date_of_birth"].includes(first) ? "personal" : ["email", "probation_end_date"].includes(first) ? "job" : first.includes("address") || first === "personal_email" ? "contact" : "ids");
      return;
    }
    const body = draftPayload(d, "edit", initial);
    if (!Object.keys(body).length) { onClose(); return; }
    setSaving(true);
    try {
      await api.put(`/employees/${profile.uuid}`, body);
      toast.success("Changes saved", { description: Object.keys(body).some((k) => k.endsWith("_id") && !["gender_id", "marital_status_id", "blood_group_id", "nationality_id"].includes(k)) ? "Job changes are recorded in the history." : undefined });
      setInitial(d);
      onClose();
      onSaved?.();
    } catch (e) {
      toast.error("Couldn't save the changes", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" dirty={dirty} busy={saving}
      title={profile ? `Edit ${profile.full_name}` : "Edit employee"} description="Every change is recorded in the audit log."
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>Save changes</Button></>}>
      {d && (
        <>
          <Tabs value={tab} onChange={setTab} items={EDIT_TABS.map((t) => ({ ...t }))} className="mb-6" />
          <form onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
            {tab === "personal" && <PersonalFields d={d} set={set} errors={errors} record={profile} />}
            {tab === "job" && <JobFields d={d} set={set} errors={errors} record={profile} mode="edit" />}
            {tab === "contact" && <ContactFields d={d} set={set} errors={errors} record={profile} />}
            {tab === "ids" && <StatutoryFields d={d} set={set} errors={errors} record={profile} />}
            {tab === "access" && <AccessFields d={d} set={set} errors={errors} record={profile} />}
            <button type="submit" hidden />
          </form>
        </>
      )}
    </Modal>
  );
}
