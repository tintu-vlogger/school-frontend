"use client";

/*
 * Job opening form (new or edit) in a full modal, plus the stage and question editors
 * reused by the hiring settings page.
 *   <JobFormModal open job={job | null} requisitionUuid={uuid?} onClose onSaved={(job) => ...} />
 */
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Button, Checkbox, DateInput, Field, FormGrid, FormSection, IconButton, MasterSelect, Modal, ModalCancel, NumberInput,
  Select, Textarea, TextInput, Toggle, type SelectOption,
} from "@/components/ui-kit";
import { useOrgOptions } from "@/components/people/hooks";
import { employeeOptionsFor, loadEmployees } from "@/components/workplace/pickers";
import { TagInput, useHiringMeta } from "./common";
import { errText, type Job, type Question, type Requisition, type Stage, type TeamMember } from "./types";

const KIND_OPTIONS = [
  { value: "applied", label: "Applied" }, { value: "screening", label: "Screening" }, { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" }, { value: "hired", label: "Hired" },
];
const QTYPES = [
  { value: "text", label: "Short answer" }, { value: "long_text", label: "Long answer" }, { value: "yesno", label: "Yes / no" },
  { value: "number", label: "Number" }, { value: "choice", label: "Choice" },
];

export function StagesEditor({ value, onChange }: { value: Stage[]; onChange: (v: Stage[]) => void }) {
  const set = (i: number, patch: Partial<Stage>) => onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {value.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-6 text-center text-[12px] text-faint tabular">{i + 1}</span>
          <TextInput value={s.label} onValueChange={(x) => set(i, { label: x })} placeholder="Stage name" className="flex-1" aria-label="Stage name" />
          <div className="w-40"><Select value={s.kind} onChange={(v) => set(i, { kind: v ?? "screening" })} options={KIND_OPTIONS} aria-label="Kind" /></div>
          <IconButton icon={ArrowUp} label="Move up" onClick={() => move(i, -1)} disabled={i === 0} />
          <IconButton icon={ArrowDown} label="Move down" onClick={() => move(i, 1)} disabled={i === value.length - 1} />
          <IconButton icon={Trash2} label="Remove stage" onClick={() => onChange(value.filter((_, j) => j !== i))}
            disabled={s.kind === "applied" || s.kind === "hired"} />
        </div>
      ))}
      <Button variant="ghost" size="sm" icon={Plus}
        onClick={() => { const at = Math.max(1, value.length - 1); const next = [...value]; next.splice(at, 0, { key: "", label: "", kind: "screening" }); onChange(next); }}>
        Add stage
      </Button>
      <p className="text-[12.5px] text-faint">The first stage is where applications land; the last is Hired (only through an accepted offer).</p>
    </div>
  );
}

export function QuestionsEditor({ value, onChange }: { value: Question[]; onChange: (v: Question[]) => void }) {
  const set = (i: number, patch: Partial<Question>) => onChange(value.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  return (
    <div className="space-y-3">
      {value.map((q, i) => (
        <div key={i} className="rounded-xl border border-line p-3">
          <div className="flex items-start gap-2">
            <TextInput value={q.label} onValueChange={(x) => set(i, { label: x })} placeholder="Question" className="flex-1" aria-label="Question" />
            <div className="w-40"><Select value={q.type} onChange={(v) => set(i, { type: v ?? "text" })} options={QTYPES} aria-label="Answer type" /></div>
            <IconButton icon={Trash2} label="Remove question" onClick={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-4">
            <Checkbox checked={q.required} onChange={(v) => set(i, { required: v })} label="Required" />
            {q.type === "choice" && (
              <div className="min-w-[260px] flex-1"><TagInput value={q.options} onChange={(v) => set(i, { options: v })} placeholder="Choices: type and press Enter" /></div>
            )}
          </div>
        </div>
      ))}
      <Button variant="ghost" size="sm" icon={Plus} onClick={() => onChange([...value, { key: "", label: "", type: "text", required: false, options: [] }])}>
        Add question
      </Button>
    </div>
  );
}

type Form = {
  title: string; department_id: number | null; designation_id: number | null; location_id: number | null; location_text: string;
  work_mode: string; employment_type_id: number | null; summary: string; description: string; skills: string[]; nice_skills: string[];
  min_experience: number | null; max_experience: number | null; salary_min: number | null; salary_max: number | null;
  show_salary: boolean; openings: number | null; closes_on: string; hiring_manager_id: number | null; team: TeamMember[];
  questions: Question[]; stages: Stage[]; referral_bonus: number | null; auto_reject_below: number | null; auto_shortlist_above: number | null;
};

const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));

function fromJob(j: Job | null, stages: Stage[]): Form {
  return {
    title: j?.title ?? "", department_id: j?.department_id ?? null, designation_id: j?.designation_id ?? null,
    location_id: j?.location_id ?? null, location_text: j?.location_text ?? "", work_mode: j?.work_mode ?? "office",
    employment_type_id: j?.employment_type_id ?? null, summary: j?.summary ?? "", description: j?.description ?? "",
    skills: j?.skills ?? [], nice_skills: j?.nice_skills ?? [], min_experience: j?.min_experience ?? null,
    max_experience: j?.max_experience ?? null, salary_min: num(j?.salary_min), salary_max: num(j?.salary_max),
    show_salary: j?.show_salary ?? false, openings: j?.openings ?? 1, closes_on: j?.closes_on ?? "",
    hiring_manager_id: j?.hiring_manager_id ?? null, team: j?.team ?? [], questions: j?.questions ?? [],
    stages: j?.stages ?? stages, referral_bonus: num(j?.referral_bonus),
    auto_reject_below: j?.screening?.auto_reject_below ?? null, auto_shortlist_above: j?.screening?.auto_shortlist_above ?? null,
  };
}

export function JobFormModal({ open, job, requisition, onClose, onSaved }: {
  open: boolean; job: Job | null; requisition?: Requisition | null; onClose: () => void; onSaved: (j: Job) => void;
}) {
  const toast = useToast();
  const meta = useHiringMeta();
  const org = useOrgOptions();
  const [f, setF] = useState<Form>(() => fromJob(job, []));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [teamOpts, setTeamOpts] = useState<SelectOption<number>[]>([]);
  const [reqs, setReqs] = useState<SelectOption<string>[]>([]);
  const [reqUuid, setReqUuid] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const base = fromJob(job, meta?.default_stages ?? []);
    if (!job && requisition) {
      Object.assign(base, {
        title: requisition.title, department_id: requisition.department_id, designation_id: requisition.designation_id,
        location_id: requisition.location_id, employment_type_id: requisition.employment_type_id,
        min_experience: requisition.min_experience, max_experience: requisition.max_experience,
        salary_min: num(requisition.budget_min), salary_max: num(requisition.budget_max), openings: requisition.openings,
        hiring_manager_id: requisition.hiring_manager_id,
      });
    }
    setF(base);
    setReqUuid(requisition?.uuid ?? null);
    setDirty(false);
    employeeOptionsFor([base.hiring_manager_id, ...base.team.map((t) => t.employee_id)]).then(setTeamOpts).catch(() => {});
    if (!job) {
      api.get<{ items: Requisition[] }>("/recruitment/requisitions?status=approved&size=100")
        .then((r) => setReqs(r.items.filter((x) => !x.jobs.length).map((x) => ({ value: x.uuid, label: x.title, description: x.number ?? undefined }))))
        .catch(() => {});
    }
  }, [open, job, requisition, meta?.default_stages]);

  useEffect(() => {
    if (open && !job && !f.stages.length && meta?.default_stages) setF((x) => ({ ...x, stages: meta.default_stages }));
  }, [open, job, meta?.default_stages, f.stages.length]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((x) => ({ ...x, [k]: v })); setDirty(true); };

  async function save() {
    if (!f.title.trim()) { toast.error("Give the job a title."); return; }
    setSaving(true);
    try {
      const body = {
        ...(reqUuid && !job ? { requisition_uuid: reqUuid } : {}),
        title: f.title, department_id: f.department_id, designation_id: f.designation_id, location_id: f.location_id,
        location_text: f.location_text || null, work_mode: f.work_mode, employment_type_id: f.employment_type_id,
        summary: f.summary, description: f.description, skills: f.skills, nice_skills: f.nice_skills,
        min_experience: f.min_experience, max_experience: f.max_experience, salary_min: f.salary_min, salary_max: f.salary_max,
        show_salary: f.show_salary, openings: f.openings ?? 1, closes_on: f.closes_on || null, hiring_manager_id: f.hiring_manager_id,
        team: f.team, questions: f.questions.filter((q) => q.label.trim()), stages: f.stages, referral_bonus: f.referral_bonus,
        screening: { auto_reject_below: f.auto_reject_below, auto_shortlist_above: f.auto_shortlist_above },
      };
      const saved = job ? await api.put<Job>(`/recruitment/jobs/${job.uuid}`, body) : await api.post<Job>("/recruitment/jobs", body);
      toast.success(job ? "Job saved" : "Job created");
      setDirty(false);
      onSaved(saved);
    } catch (e) {
      toast.error(errText(e));
    } finally {
      setSaving(false);
    }
  }

  const modes = Object.entries(meta?.work_modes ?? { office: "Office", remote: "Remote", hybrid: "Hybrid" }).map(([value, label]) => ({ value, label }));
  return (
    <Modal open={open} onClose={onClose} size="full" dirty={dirty} busy={saving} title={job ? `Edit ${job.title}` : "New job opening"}
      description="Shown on your careers page once published."
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={save}>{job ? "Save" : "Create job"}</Button></>}>
      <div className="mx-auto max-w-4xl space-y-8">
        {!job && (
          <Field label="From an approved hiring request" hint="Fills the position, budget and hiring manager. Optional.">
            <Select value={reqUuid} onChange={(v) => setReqUuid(v)} options={reqs} clearable placeholder="Start blank" />
          </Field>
        )}
        <FormSection title="The role">
          <FormGrid>
            <Field label="Job title" required><TextInput value={f.title} onValueChange={(x) => set("title", x)} data-autofocus /></Field>
            <Field label="Openings"><NumberInput value={f.openings} onChange={(x) => set("openings", x)} min={1} /></Field>
            <Field label="Department"><Select value={f.department_id} onChange={(v) => set("department_id", v)} options={org.departments} clearable /></Field>
            <Field label="Designation"><Select value={f.designation_id} onChange={(v) => set("designation_id", v)} options={org.designations} clearable /></Field>
            <Field label="Location"><Select value={f.location_id} onChange={(v) => set("location_id", v)} options={org.locations} clearable /></Field>
            <Field label="Location text" hint="Shown instead, e.g. Anywhere in India"><TextInput value={f.location_text} onValueChange={(x) => set("location_text", x)} /></Field>
            <Field label="Work mode"><Select value={f.work_mode} onChange={(v) => set("work_mode", v ?? "office")} options={modes} /></Field>
            <Field label="Employment type"><MasterSelect type="employment_type" value={f.employment_type_id} onChange={(v) => set("employment_type_id", v)} clearable /></Field>
          </FormGrid>
          <div className="mt-4 space-y-4">
            <Field label="One-line summary"><TextInput value={f.summary} onValueChange={(x) => set("summary", x)} maxLength={300} /></Field>
            <Field label="Description" hint="Responsibilities, requirements, benefits. Simple HTML is fine."><Textarea value={f.description} onValueChange={(x) => set("description", x)} rows={7} autoGrow /></Field>
          </div>
        </FormSection>
        <FormSection title="Requirements" description="Used for resume screening.">
          <div className="space-y-4">
            <Field label="Required skills"><TagInput value={f.skills} onChange={(v) => set("skills", v)} /></Field>
            <Field label="Good-to-have skills"><TagInput value={f.nice_skills} onChange={(v) => set("nice_skills", v)} /></Field>
            <FormGrid columns={3}>
              <Field label="Minimum experience"><NumberInput value={f.min_experience} onChange={(x) => set("min_experience", x)} min={0} suffix="yrs" /></Field>
              <Field label="Maximum experience"><NumberInput value={f.max_experience} onChange={(x) => set("max_experience", x)} min={0} suffix="yrs" /></Field>
              <Field label="Applications close on"><DateInput value={f.closes_on} onChange={(x) => set("closes_on", x)} clearable /></Field>
              <Field label="Reject automatically below" hint="Screening score 0–100"><NumberInput value={f.auto_reject_below} onChange={(x) => set("auto_reject_below", x)} min={0} max={100} /></Field>
              <Field label="Shortlist automatically from"><NumberInput value={f.auto_shortlist_above} onChange={(x) => set("auto_shortlist_above", x)} min={0} max={100} /></Field>
            </FormGrid>
          </div>
        </FormSection>
        <FormSection title="Pay">
          <FormGrid columns={3}>
            <Field label="Annual CTC from"><NumberInput value={f.salary_min} onChange={(x) => set("salary_min", x)} min={0} suffix="₹" /></Field>
            <Field label="Annual CTC up to"><NumberInput value={f.salary_max} onChange={(x) => set("salary_max", x)} min={0} suffix="₹" /></Field>
            <Field label="Referral bonus"><NumberInput value={f.referral_bonus} onChange={(x) => set("referral_bonus", x)} min={0} suffix="₹" /></Field>
          </FormGrid>
          <div className="mt-3"><Toggle checked={f.show_salary} onChange={(v) => set("show_salary", v)} label="Show the salary range on the careers page" /></div>
        </FormSection>
        <FormSection title="Hiring team">
          <FormGrid>
            <Field label="Hiring manager">
              <Select value={f.hiring_manager_id} onChange={(v) => set("hiring_manager_id", v)} loadOptions={loadEmployees}
                selectedOption={teamOpts.find((o) => o.value === f.hiring_manager_id) ?? null} clearable />
            </Field>
          </FormGrid>
          <div className="mt-3 space-y-2">
            {f.team.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1">
                  <Select value={m.employee_id || null} loadOptions={loadEmployees} aria-label="Team member"
                    selectedOption={teamOpts.find((o) => o.value === m.employee_id) ?? (m.name ? { value: m.employee_id, label: m.name } : null)}
                    onChange={(v, opt) => { if (opt) setTeamOpts((o) => [...o, opt]); set("team", f.team.map((t, j) => (j === i ? { ...t, employee_id: v ?? 0 } : t))); }} />
                </div>
                <div className="w-44">
                  <Select value={m.role} aria-label="Role" onChange={(v) => set("team", f.team.map((t, j) => (j === i ? { ...t, role: v ?? "interviewer" } : t)))}
                    options={[{ value: "recruiter", label: "Recruiter" }, { value: "interviewer", label: "Interviewer" }, { value: "coordinator", label: "Coordinator" }]} />
                </div>
                <IconButton icon={Trash2} label="Remove" onClick={() => set("team", f.team.filter((_, j) => j !== i))} />
              </div>
            ))}
            <Button variant="ghost" size="sm" icon={Plus} onClick={() => set("team", [...f.team, { employee_id: 0, role: "interviewer" }])}>Add team member</Button>
          </div>
        </FormSection>
        <FormSection title="Questions on the application form"><QuestionsEditor value={f.questions} onChange={(v) => set("questions", v)} /></FormSection>
        <FormSection title="Pipeline stages"><StagesEditor value={f.stages} onChange={(v) => set("stages", v)} /></FormSection>
      </div>
    </Modal>
  );
}
