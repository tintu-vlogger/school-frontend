"use client";

/*
 * Add or edit a student in a multi-step modal.
 *   <StudentFormModal open onClose target="new" onSaved={(s, logins) => ...} />
 * New: personal -> enrolment -> parents/guardians (link an existing one for siblings) ->
 * medical and extra fields -> sign-ins. After saving, any new portal sign-ins are shown once.
 * Edit: personal -> admission details -> medical and extra fields (guardians and class are
 * changed from the student's detail modal).
 */
import { useMemo, useRef, useState } from "react";
import { Camera, Link2, Plus, Trash2, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { CustomFields, useCustomFieldDraft, type CustomFieldEntity } from "@/components/custom-fields";
import {
  Avatar, Button, Checkbox, DateInput, Field, FormGrid, FormSection, Modal, ModalCancel, RadioCards, Select, Stepper,
  TextInput, Textarea, Toggle, type SelectOption,
} from "@/components/ui-kit";
import { errText, useList, useSectionOptions, type House } from "@/components/academics/shared";
import {
  BLOOD_GROUPS, GENDERS, NewLogins, RELATIONS, photoDataUrl, type NewLogin, type StudentFull,
} from "./shared";

const STUDENT_ENTITY = "student" as CustomFieldEntity;

type GuardianDraft = {
  key: number; mode: "new" | "existing"; id: number | null; existingLabel: string;
  first_name: string; last_name: string; relation: string; phone: string; email: string; occupation: string;
  is_primary: boolean; can_pickup: boolean; receives_notifications: boolean;
};

const blankGuardian = (key: number, relation: string, primary: boolean): GuardianDraft => ({
  key, mode: "new", id: null, existingLabel: "", first_name: "", last_name: "", relation, phone: "", email: "",
  occupation: "", is_primary: primary, can_pickup: true, receives_notifications: true,
});

type Draft = {
  first_name: string; middle_name: string; last_name: string; gender: string | null; date_of_birth: string;
  blood_group: string | null; email: string; phone: string; photo_url: string; address: string; city: string;
  state: string; pincode: string; nationality: string; religion: string; category: string; mother_tongue: string;
  national_id: string; student_reg_id: string;
  admission_no: string; admission_date: string; section_id: number | null; roll_no: string; house_id: number | null;
  previous_institution: string; is_boarder: boolean; uses_transport: boolean; fee_category: string;
  medical_notes: string; allergies: string;
};

function initialDraft(s: StudentFull | null): Draft {
  return {
    first_name: s?.first_name ?? "", middle_name: s?.middle_name ?? "", last_name: s?.last_name ?? "",
    gender: s?.gender ?? null, date_of_birth: s?.date_of_birth ?? "", blood_group: s?.blood_group ?? null,
    email: s?.email ?? "", phone: s?.phone ?? "", photo_url: s?.photo_url ?? "", address: s?.address ?? "",
    city: s?.city ?? "", state: s?.state ?? "", pincode: s?.pincode ?? "", nationality: s?.nationality ?? "",
    religion: s?.religion ?? "", category: s?.category ?? "", mother_tongue: s?.mother_tongue ?? "",
    national_id: "", student_reg_id: s?.student_reg_id ?? "",
    admission_no: s?.admission_no ?? "", admission_date: s?.admission_date ?? "", section_id: s?.section_id ?? null,
    roll_no: "", house_id: s?.house_id ?? null, previous_institution: s?.previous_institution ?? "",
    is_boarder: s?.is_boarder ?? false, uses_transport: s?.uses_transport ?? false, fee_category: s?.fee_category ?? "",
    medical_notes: s?.medical_notes ?? "", allergies: s?.allergies ?? "",
  };
}

type GuardianHit = { id: number; name: string; phone: string | null; email: string | null; children: { name: string }[] };
async function searchGuardians(q: string): Promise<SelectOption<number>[]> {
  const r = await api.get<{ items: GuardianHit[] }>(`/guardians?size=20${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  return (r.items ?? []).map((g) => ({
    value: g.id, label: g.name,
    description: [g.phone, g.children.length ? `Parent of ${g.children.map((c) => c.name).join(", ")}` : null].filter(Boolean).join(" · ") || undefined,
  }));
}

const nul = (s: string) => (s.trim() ? s.trim() : null);

export function StudentFormModal({ open, onClose, target, onSaved }: {
  open: boolean; onClose: () => void; target: StudentFull | "new"; onSaved: (s: StudentFull) => void;
}) {
  const { term } = useInstitution();
  const toast = useToast();
  const editing = target === "new" ? null : target;
  const start = useMemo(() => initialDraft(editing), [editing]);
  const [v, setV] = useState<Draft>(start);
  const set = <K extends keyof Draft>(k: K, x: Draft[K]) => setV((d) => ({ ...d, [k]: x }));
  const [guardians, setGuardians] = useState<GuardianDraft[]>(() => [blankGuardian(1, "father", true), blankGuardian(2, "mother", false)]);
  const nextKey = useRef(3);
  const [createLogins, setCreateLogins] = useState(true);
  const cf = useCustomFieldDraft(STUDENT_ENTITY, editing?.custom);
  const { options: sectionOptions } = useSectionOptions(null);
  const houses = useList<House>("/academics/houses").rows.filter((h) => h.active || h.id === v.house_id);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [logins, setLogins] = useState<NewLogin[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const steps = editing
    ? [{ label: "Personal" }, { label: "Admission" }, { label: "Medical & more" }]
    : [{ label: "Personal" }, { label: "Enrolment" }, { label: term("guardians") }, { label: "Medical & more" }, { label: "Sign-ins" }];
  const last = step === steps.length - 1;
  const dirty = !logins && (JSON.stringify(v) !== JSON.stringify(start) || cf.dirty);

  function check(i: number): boolean {
    const e: Record<string, string> = {};
    if (i === 0 && !v.first_name.trim()) e.first_name = "Enter the first name";
    if (i === 0 && v.email && !/^\S+@\S+\.\S+$/.test(v.email)) e.email = "Enter a valid email";
    if (!editing && i === 2) {
      guardians.forEach((g) => {
        if (g.mode === "existing" && !g.id) e[`g${g.key}`] = "Pick someone or switch to a new entry";
        if (g.mode === "new" && !g.first_name.trim() && (g.phone || g.email || g.last_name)) e[`g${g.key}`] = "Enter a first name";
        if (g.mode === "new" && g.email && !/^\S+@\S+\.\S+$/.test(g.email)) e[`g${g.key}`] = "Enter a valid email";
      });
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function next() {
    if (!check(step)) return;
    const medical = editing ? 2 : 3;
    if (step === medical && !cf.check()) return;
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try { set("photo_url", await photoDataUrl(file)); } catch (e) { toast.error(errText(e) ?? "Couldn't read that image"); }
  }

  async function save() {
    for (let i = 0; i < steps.length; i++) if (!check(i)) { setStep(i); return; }
    if (!cf.check()) { setStep(editing ? 2 : 3); return; }
    setSaving(true);
    const base = {
      first_name: v.first_name.trim(), middle_name: nul(v.middle_name), last_name: nul(v.last_name), gender: v.gender,
      date_of_birth: v.date_of_birth || null, blood_group: v.blood_group, email: nul(v.email), phone: nul(v.phone),
      photo_url: v.photo_url || null, address: nul(v.address), city: nul(v.city), state: nul(v.state), pincode: nul(v.pincode),
      nationality: nul(v.nationality), religion: nul(v.religion), category: nul(v.category), mother_tongue: nul(v.mother_tongue),
      student_reg_id: nul(v.student_reg_id), previous_institution: nul(v.previous_institution),
      admission_date: v.admission_date || null, house_id: v.house_id, medical_notes: nul(v.medical_notes),
      allergies: nul(v.allergies), is_boarder: v.is_boarder, uses_transport: v.uses_transport, fee_category: nul(v.fee_category),
      custom: cf.values,
      ...(v.national_id.trim() ? { national_id: v.national_id.trim() } : {}),
    };
    try {
      if (editing) {
        const out = await api.put<StudentFull>(`/students/${editing.uuid}`, { ...base, admission_no: v.admission_no.trim() || undefined });
        toast.success(`${out.name} updated`);
        onSaved(out);
        return;
      }
      const gs = guardians.filter((g) => (g.mode === "existing" ? !!g.id : !!g.first_name.trim()));
      if (gs.length && !gs.some((g) => g.is_primary)) gs[0] = { ...gs[0], is_primary: true };
      const payload = {
        ...base, admission_no: nul(v.admission_no), section_id: v.section_id, roll_no: nul(v.roll_no),
        create_portal_accounts: createLogins,
        guardians: gs.map((g) => g.mode === "existing"
          ? { id: g.id, relation: g.relation, is_primary: g.is_primary, can_pickup: g.can_pickup, receives_notifications: g.receives_notifications }
          : {
            first_name: g.first_name.trim(), last_name: nul(g.last_name), relation: g.relation, phone: nul(g.phone),
            email: nul(g.email), occupation: nul(g.occupation), is_primary: g.is_primary, can_pickup: g.can_pickup,
            receives_notifications: g.receives_notifications,
          }),
      };
      const out = await api.post<StudentFull & { new_logins: NewLogin[] }>("/students", payload);
      toast.success(`${out.name} added`, { description: `Admission no. ${out.admission_no}` });
      onSaved(out);
      if (out.new_logins?.length) setLogins(out.new_logins.map((l) => ({ ...l, student: out.name, admission_no: out.admission_no })));
      else onClose();
    } catch (e) {
      toast.error(editing ? "Couldn't save the changes" : `Couldn't add the ${term("student").toLowerCase()}`, { description: errText(e) });
    } finally { setSaving(false); }
  }

  const updateG = (key: number, patch: Partial<GuardianDraft>) => setGuardians((gs) => gs.map((g) => {
    if (g.key === key) return { ...g, ...patch };
    return patch.is_primary ? { ...g, is_primary: false } : g;
  }));

  if (logins) {
    return (
      <Modal open={open} onClose={onClose} size="lg" title="Sign-ins created"
        description={`Share these with the ${term("student").toLowerCase()} and their ${term("guardians").toLowerCase()}. They'll be asked to choose a new password the first time they sign in.`}
        footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <NewLogins logins={logins} guardianWord={term("guardian")} studentWord={term("student")} />
      </Modal>
    );
  }

  const medicalStep = editing ? 2 : 3;
  return (
    <Modal open={open} onClose={onClose} size="xl" dirty={dirty} busy={saving}
      title={editing ? `Edit ${editing.name}` : `Add ${term("student").toLowerCase()}`}
      description={editing ? undefined : "Only the first name is required. Everything else can be filled in later."}
      footerStart={step > 0 ? <Button onClick={() => setStep(step - 1)}>Back</Button> : undefined}
      footer={<>
        <ModalCancel />
        {editing && !last && <Button onClick={save} loading={saving}>Save now</Button>}
        {last ? <Button variant="primary" onClick={save} loading={saving}>{editing ? "Save changes" : `Add ${term("student").toLowerCase()}`}</Button>
          : <Button variant="primary" onClick={next}>Next</Button>}
      </>}>
      <Stepper steps={steps} current={step} onStepClick={(i) => i < step && setStep(i)} className="mb-6" />

      {step === 0 && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar name={v.first_name || "New"} src={v.photo_url || null} size={64} />
            <div className="flex gap-2">
              <Button size="sm" icon={Camera} onClick={() => fileRef.current?.click()}>{v.photo_url ? "Change photo" : "Add photo"}</Button>
              {v.photo_url && <Button size="sm" variant="ghost" onClick={() => set("photo_url", "")}>Remove</Button>}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          </div>
          <FormGrid columns={3}>
            <Field label="First name" required error={errors.first_name}>
              <TextInput autoFocusInModal value={v.first_name} onValueChange={(x) => set("first_name", x)} />
            </Field>
            <Field label="Middle name" aside="Optional"><TextInput value={v.middle_name} onValueChange={(x) => set("middle_name", x)} /></Field>
            <Field label="Last name"><TextInput value={v.last_name} onValueChange={(x) => set("last_name", x)} /></Field>
            <Field label="Gender"><Select value={v.gender} onChange={(x) => set("gender", x)} options={GENDERS} clearable placeholder="Pick" /></Field>
            <Field label="Date of birth"><DateInput value={v.date_of_birth} onChange={(x) => set("date_of_birth", x)} clearable /></Field>
            <Field label="Blood group"><Select value={v.blood_group} onChange={(x) => set("blood_group", x)} options={BLOOD_GROUPS} clearable placeholder="Pick" /></Field>
            <Field label="Email" aside="Optional" error={errors.email} hint="Used as the sign-in when given">
              <TextInput type="email" value={v.email} onValueChange={(x) => set("email", x)} />
            </Field>
            <Field label="Phone" aside="Optional"><TextInput value={v.phone} onValueChange={(x) => set("phone", x)} inputMode="tel" /></Field>
            <Field label="Mother tongue" aside="Optional"><TextInput value={v.mother_tongue} onValueChange={(x) => set("mother_tongue", x)} /></Field>
          </FormGrid>
          <FormSection title="Address">
            <FormGrid columns={3}>
              <Field label="Address" className="sm:col-span-3"><Textarea rows={2} value={v.address} onValueChange={(x) => set("address", x)} /></Field>
              <Field label="City"><TextInput value={v.city} onValueChange={(x) => set("city", x)} /></Field>
              <Field label="State"><TextInput value={v.state} onValueChange={(x) => set("state", x)} /></Field>
              <Field label="PIN code"><TextInput value={v.pincode} onValueChange={(x) => set("pincode", x)} /></Field>
            </FormGrid>
          </FormSection>
          <FormSection title="Identity and background" description="Kept private. ID numbers are masked for people without access.">
            <FormGrid columns={3}>
              <Field label="National ID" aside="Optional" hint={editing?.national_id ? `On record: ${editing.national_id}. Type to replace.` : "Aadhaar, passport or similar"}>
                <TextInput value={v.national_id} onValueChange={(x) => set("national_id", x)} />
              </Field>
              <Field label="Board or government ID" aside="Optional" hint="APAAR, PEN, university ID …"><TextInput value={v.student_reg_id} onValueChange={(x) => set("student_reg_id", x)} /></Field>
              <Field label="Nationality"><TextInput value={v.nationality} onValueChange={(x) => set("nationality", x)} /></Field>
              <Field label="Religion" aside="Optional"><TextInput value={v.religion} onValueChange={(x) => set("religion", x)} /></Field>
              <Field label="Category" aside="Optional" hint="General, OBC, SC, ST, EWS …"><TextInput value={v.category} onValueChange={(x) => set("category", x)} /></Field>
            </FormGrid>
          </FormSection>
        </div>
      )}

      {step === 1 && (
        <FormGrid columns={2}>
          <Field label="Admission number" aside={editing ? undefined : "Optional"} hint={editing ? undefined : "Leave empty to use the next number"}>
            <TextInput value={v.admission_no} onValueChange={(x) => set("admission_no", x)} className="font-mono" />
          </Field>
          <Field label="Admission date" hint={editing ? undefined : "Defaults to today"}><DateInput value={v.admission_date} onChange={(x) => set("admission_date", x)} clearable /></Field>
          {!editing && (
            <>
              <Field label={`${term("program")} and ${term("section").toLowerCase()}`} hint={sectionOptions.length ? "In the current session" : `Add ${term("sections").toLowerCase()} under Academics first`}>
                <Select value={v.section_id} onChange={(x) => set("section_id", x)} options={sectionOptions} clearable placeholder={`Pick a ${term("section").toLowerCase()}`} />
              </Field>
              <Field label={term("roll")} aside="Optional" hint="Leave empty for the next number">
                <TextInput value={v.roll_no} onValueChange={(x) => set("roll_no", x)} />
              </Field>
            </>
          )}
          <Field label="House" aside="Optional">
            <Select value={v.house_id} onChange={(x) => set("house_id", x)} options={houses.map((h) => ({ value: h.id, label: h.name }))} clearable placeholder="Pick a house" />
          </Field>
          <Field label="Fee category" aside="Optional" hint="Scholarship or concession tag used by fees"><TextInput value={v.fee_category} onValueChange={(x) => set("fee_category", x)} /></Field>
          <Field label="Previous school or institution" aside="Optional" className="sm:col-span-2"><TextInput value={v.previous_institution} onValueChange={(x) => set("previous_institution", x)} /></Field>
          <Toggle checked={v.is_boarder} onChange={(x) => set("is_boarder", x)} label="Stays in the hostel" />
          <Toggle checked={v.uses_transport} onChange={(x) => set("uses_transport", x)} label="Uses school transport" />
        </FormGrid>
      )}

      {!editing && step === 2 && (
        <div className="space-y-4">
          <p className="text-[13.5px] text-muted">Add up to four {term("guardians").toLowerCase()} or emergency contacts. For a sibling, link the {term("guardian").toLowerCase()} already on record so both children share one sign-in.</p>
          {guardians.map((g, i) => (
            <div key={g.key} className="rounded-xl border border-line p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[14px] text-ink">{term("guardian")} {i + 1}</p>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant={g.mode === "new" ? "secondary" : "ghost"} icon={UserPlus} onClick={() => updateG(g.key, { mode: "new", id: null })}>New</Button>
                  <Button size="sm" variant={g.mode === "existing" ? "secondary" : "ghost"} icon={Link2} onClick={() => updateG(g.key, { mode: "existing" })}>Link existing</Button>
                  <Button size="sm" variant="ghost" icon={Trash2} aria-label="Remove" onClick={() => setGuardians((gs) => gs.filter((x) => x.key !== g.key))} />
                </div>
              </div>
              <FormGrid columns={3}>
                {g.mode === "existing" ? (
                  <Field label="Find on record" className="sm:col-span-2" error={errors[`g${g.key}`]} hint="Search by name, phone or email">
                    <Select value={g.id} onChange={(x, o) => updateG(g.key, { id: x, existingLabel: o?.label ?? "" })} loadOptions={searchGuardians}
                      selectedOption={g.id ? { value: g.id, label: g.existingLabel } : null} placeholder="Search" />
                  </Field>
                ) : (
                  <>
                    <Field label="First name" error={errors[`g${g.key}`]}><TextInput value={g.first_name} onValueChange={(x) => updateG(g.key, { first_name: x })} /></Field>
                    <Field label="Last name"><TextInput value={g.last_name} onValueChange={(x) => updateG(g.key, { last_name: x })} /></Field>
                  </>
                )}
                <Field label="Relation"><Select value={g.relation} onChange={(x) => updateG(g.key, { relation: x ?? "guardian" })} options={RELATIONS} /></Field>
                {g.mode === "new" && (
                  <>
                    <Field label="Mobile"><TextInput value={g.phone} inputMode="tel" onValueChange={(x) => updateG(g.key, { phone: x })} /></Field>
                    <Field label="Email" hint="Used as the sign-in when given"><TextInput type="email" value={g.email} onValueChange={(x) => updateG(g.key, { email: x })} /></Field>
                    <Field label="Occupation" aside="Optional"><TextInput value={g.occupation} onValueChange={(x) => updateG(g.key, { occupation: x })} /></Field>
                  </>
                )}
              </FormGrid>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                <Checkbox checked={g.is_primary} onChange={(x) => x && updateG(g.key, { is_primary: true })} label="Primary contact" />
                <Checkbox checked={g.can_pickup} onChange={(x) => updateG(g.key, { can_pickup: x })} label="May pick up" />
                <Checkbox checked={g.receives_notifications} onChange={(x) => updateG(g.key, { receives_notifications: x })} label="Gets notices" />
              </div>
            </div>
          ))}
          {guardians.length < 4 && (
            <Button icon={Plus} onClick={() => { const k = nextKey.current++; setGuardians((gs) => [...gs, blankGuardian(k, "guardian", gs.length === 0)]); }}>
              Add {term("guardian").toLowerCase()}
            </Button>
          )}
        </div>
      )}

      {step === medicalStep && (
        <div className="space-y-6">
          <FormGrid columns={2}>
            <Field label="Medical notes" aside="Optional" hint="Conditions, medication, doctor's contact"><Textarea rows={3} value={v.medical_notes} onValueChange={(x) => set("medical_notes", x)} /></Field>
            <Field label="Allergies" aside="Optional"><Textarea rows={3} value={v.allergies} onValueChange={(x) => set("allergies", x)} /></Field>
          </FormGrid>
          <CustomFields entity={STUDENT_ENTITY} layout={cf.layout} values={cf.values} onChange={cf.setValues} errors={cf.errors} />
        </div>
      )}

      {!editing && step === 4 && (
        <div className="space-y-5">
          <RadioCards columns={2} value={createLogins ? "yes" : "no"} onChange={(x) => setCreateLogins(x === "yes")} options={[
            { value: "yes", label: "Create portal sign-ins now", description: `For the ${term("student").toLowerCase()} and each ${term("guardian").toLowerCase()} with an email or mobile. Passwords are shown once after saving.` },
            { value: "no", label: "Not now", description: "You can create them later from the student's details or Portal sign-ins." },
          ]} />
          <div className="rounded-xl border border-line bg-sunken/40 px-4 py-3 text-[13.5px] text-muted">
            <p className="text-ink">{[v.first_name, v.middle_name, v.last_name].filter(Boolean).join(" ") || "New student"}</p>
            <p>{sectionOptions.find((o) => o.value === v.section_id)?.label ?? `No ${term("section").toLowerCase()} yet`}
              {" · "}{guardians.filter((g) => g.first_name.trim() || g.id).length} {term("guardians").toLowerCase()}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
