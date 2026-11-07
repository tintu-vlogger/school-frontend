"use client";

/*
 * Add or edit a candidate. Dropping a CV reads it and fills the fields (email, phone,
 * experience, skills, current role …); possible duplicates are shown before saving.
 *   <CandidateFormModal open candidate={c?} jobUuid={uuid?} onClose onSaved={(c) => ...} />
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Button, DateInput, Field, FileDrop, FormGrid, FormSection, Modal, ModalCancel, NumberInput, Select, Textarea, TextInput, Toggle,
  type SelectOption,
} from "@/components/ui-kit";
import { uploadFile } from "@/components/workplace/files";
import { loadEmployees } from "@/components/workplace/pickers";
import { TagInput, useHiringMeta } from "./common";
import { useEmployeeOptions } from "./interviews";
import { errText, type Candidate } from "./types";
import { CustomFields, customFieldErrors, useCustomFieldLayout, type CustomValues } from "@/components/custom-fields";

type F = {
  first_name: string; last_name: string; email: string; phone: string; location: string; current_company: string; current_title: string;
  total_experience: number | null; current_ctc: number | null; expected_ctc: number | null; notice_days: number | null;
  skills: string[]; education: string; linkedin_url: string; source: string; source_detail: string; tags: string[]; notes: string;
  owner_employee_id: number | null; follow_up_on: string; follow_up_note: string; talent_pool: boolean;
};
const EMPTY: F = { first_name: "", last_name: "", email: "", phone: "", location: "", current_company: "", current_title: "",
  total_experience: null, current_ctc: null, expected_ctc: null, notice_days: null, skills: [], education: "", linkedin_url: "",
  source: "direct", source_detail: "", tags: [], notes: "", owner_employee_id: null, follow_up_on: "", follow_up_note: "", talent_pool: false };

function fromCand(c: Candidate): F {
  return { first_name: c.first_name, last_name: c.last_name, email: c.email ?? "", phone: c.phone ?? "", location: c.location ?? "",
    current_company: c.current_company ?? "", current_title: c.current_title ?? "", total_experience: c.total_experience,
    current_ctc: c.current_ctc ? Number(c.current_ctc) : null, expected_ctc: c.expected_ctc ? Number(c.expected_ctc) : null,
    notice_days: c.notice_days, skills: c.skills, education: c.education ?? "", linkedin_url: c.linkedin_url ?? "", source: c.source,
    source_detail: c.source_detail ?? "", tags: c.tags, notes: c.notes ?? "", owner_employee_id: c.owner_employee_id,
    follow_up_on: c.follow_up_on ?? "", follow_up_note: c.follow_up_note ?? "", talent_pool: c.talent_pool };
}

export function CandidateFormModal({ open, candidate, jobUuid, onClose, onSaved }: {
  open: boolean; candidate?: Candidate | null; jobUuid?: string | null; onClose: () => void; onSaved: (c: Candidate) => void;
}) {
  const toast = useToast();
  const meta = useHiringMeta();
  const [f, setF] = useState<F>(EMPTY);
  const [files, setFiles] = useState<File[]>([]);
  const [resume, setResume] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [found, setFound] = useState<string[]>([]);
  const [dups, setDups] = useState<{ uuid: string; name: string; email: string | null }[]>([]);
  const [job, setJob] = useState<string | null>(jobUuid ?? null);
  const [jobs, setJobs] = useState<SelectOption<string>[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { layout: cfLayout } = useCustomFieldLayout("candidate");
  const [custom, setCustom] = useState<CustomValues>({});
  const [cfErrors, setCfErrors] = useState<Record<string, string>>({});
  const ownerOpts = useEmployeeOptions([f.owner_employee_id]);

  useEffect(() => {
    if (!open) return;
    setF(candidate ? fromCand(candidate) : EMPTY); setCustom({ ...(candidate?.custom || {}) }); setCfErrors({}); setFiles([]); setResume(null); setFound([]); setDups([]); setDirty(false);
    setJob(jobUuid ?? null);
    if (!candidate) api.get<{ items: { uuid: string; title: string }[] }>("/recruitment/jobs?status=open,draft,on_hold&size=200")
      .then((r) => setJobs(r.items.map((j) => ({ value: j.uuid, label: j.title })))).catch(() => {});
  }, [open, candidate, jobUuid]);

  const set = <K extends keyof F>(k: K, v: F[K]) => { setF((x) => ({ ...x, [k]: v })); setDirty(true); };

  async function onFiles(list: File[]) {
    setFiles(list);
    if (!list.length) { setResume(null); return; }
    setReading(true);
    try {
      const ref = await uploadFile(list[0]);
      setResume(ref.uuid);
      const r = await api.post<{ fields: Record<string, unknown>; text_found: boolean; duplicates: { uuid: string; name: string; email: string | null }[] }>(
        "/recruitment/candidates/parse", { resume_uuid: ref.uuid, job_uuid: job });
      if (!r.text_found) { toast.info("The CV has no readable text (perhaps a scan). Fill the fields by hand."); return; }
      const keys: string[] = [];
      setF((x) => {
        const next = { ...x } as Record<string, unknown>;
        for (const [k, v] of Object.entries(r.fields)) {
          if (!(k in x)) continue;
          const cur = next[k];
          if (cur === "" || cur === null || (Array.isArray(cur) && !cur.length)) {
            next[k] = ["total_experience", "current_ctc", "notice_days"].includes(k) ? Number(v) : v;
            keys.push(k);
          }
        }
        return next as F;
      });
      setFound(keys); setDups(r.duplicates); setDirty(true);
    } catch (e) { toast.error(errText(e)); } finally { setReading(false); }
  }

  async function save(allowDuplicate = false) {
    const cfe = customFieldErrors(cfLayout, custom);
    setCfErrors(cfe);
    if (Object.keys(cfe).length) return;
    setSaving(true);
    try {
      const body = { ...f, custom, email: f.email || null, phone: f.phone || null, follow_up_on: f.follow_up_on || null,
        resume_uuid: resume, ...(candidate ? {} : { job_uuid: job, allow_duplicate: allowDuplicate }) };
      const c = candidate ? await api.put<Candidate>(`/recruitment/candidates/${candidate.uuid}`, body)
        : await api.post<Candidate>("/recruitment/candidates", body);
      toast.success(candidate ? "Candidate saved" : "Candidate added");
      setDirty(false);
      onSaved(c);
    } catch (e) {
      const m = errText(e);
      if (/already exists/.test(m) && !candidate) {
        setDups((d) => d.length ? d : [{ uuid: "", name: m.split(": ")[1]?.split(".")[0] ?? "Someone", email: f.email }]);
      }
      toast.error(m);
    } finally { setSaving(false); }
  }

  const sources = Object.entries(meta?.sources ?? {}).map(([value, label]) => ({ value, label }));
  const hl = (k: string) => (found.includes(k) ? "Read from the CV" : undefined);
  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving} title={candidate ? `Edit ${candidate.name}` : "Add candidate"}
      footer={<><ModalCancel />
        {!!dups.length && !candidate && <Button variant="secondary" loading={saving} onClick={() => save(true)}>Add anyway</Button>}
        <Button variant="primary" loading={saving} onClick={() => save(false)}>{candidate ? "Save" : "Add candidate"}</Button></>}>
      <div className="space-y-6">
        <Field label="CV" hint={reading ? "Reading the CV…" : "PDF or Word. Fields are filled from it."}>
          <FileDrop value={files} onChange={onFiles} accept=".pdf,.doc,.docx,.txt" maxSizeMb={5} />
        </Field>
        {!!found.length && <p className="flex items-center gap-1.5 text-[13px] text-primary"><Sparkles size={14} strokeWidth={1.4} />Filled {found.length} field(s) from the CV. Check them before saving.</p>}
        {!!dups.length && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-[13px] text-amber-800">
            <AlertTriangle size={15} strokeWidth={1.4} className="mt-0.5 shrink-0" />
            <span>Possible duplicate: {dups.map((d) => `${d.name}${d.email ? ` (${d.email})` : ""}`).join(", ")}. Open them instead, or add anyway and merge later.</span>
          </div>
        )}
        {!candidate && <Field label="Add to job"><Select value={job} onChange={setJob} options={jobs} clearable placeholder="Talent pool only" /></Field>}
        <FormSection title="Contact">
          <FormGrid>
            <Field label="First name" required hint={hl("first_name")}><TextInput value={f.first_name} onValueChange={(x) => set("first_name", x)} /></Field>
            <Field label="Last name" hint={hl("last_name")}><TextInput value={f.last_name} onValueChange={(x) => set("last_name", x)} /></Field>
            <Field label="Email" hint={hl("email")}><TextInput type="email" value={f.email} onValueChange={(x) => set("email", x)} /></Field>
            <Field label="Phone" hint={hl("phone")}><TextInput value={f.phone} onValueChange={(x) => set("phone", x)} /></Field>
            <Field label="Location" hint={hl("location")}><TextInput value={f.location} onValueChange={(x) => set("location", x)} /></Field>
            <Field label="LinkedIn" hint={hl("linkedin_url")}><TextInput value={f.linkedin_url} onValueChange={(x) => set("linkedin_url", x)} /></Field>
          </FormGrid>
        </FormSection>
        <FormSection title="Experience">
          <FormGrid>
            <Field label="Current company" hint={hl("current_company")}><TextInput value={f.current_company} onValueChange={(x) => set("current_company", x)} /></Field>
            <Field label="Current role" hint={hl("current_title")}><TextInput value={f.current_title} onValueChange={(x) => set("current_title", x)} /></Field>
            <Field label="Total experience" hint={hl("total_experience")}><NumberInput value={f.total_experience} onChange={(x) => set("total_experience", x)} min={0} step={0.5} suffix="yrs" /></Field>
            <Field label="Notice period" hint={hl("notice_days")}><NumberInput value={f.notice_days} onChange={(x) => set("notice_days", x)} min={0} suffix="days" /></Field>
            <Field label="Current CTC" hint={hl("current_ctc")}><NumberInput value={f.current_ctc} onChange={(x) => set("current_ctc", x)} min={0} suffix="₹" /></Field>
            <Field label="Expected CTC"><NumberInput value={f.expected_ctc} onChange={(x) => set("expected_ctc", x)} min={0} suffix="₹" /></Field>
            <Field label="Education" hint={hl("education")}><TextInput value={f.education} onValueChange={(x) => set("education", x)} /></Field>
          </FormGrid>
          <div className="mt-4"><Field label="Skills" hint={hl("skills")}><TagInput value={f.skills} onChange={(v) => set("skills", v)} /></Field></div>
        </FormSection>
        <FormSection title="Tracking">
          <FormGrid>
            <Field label="Source"><Select value={f.source} onChange={(v) => set("source", v ?? "direct")} options={sources} /></Field>
            <Field label="Source details" hint="Agency or site name"><TextInput value={f.source_detail} onValueChange={(x) => set("source_detail", x)} /></Field>
            <Field label="Owner"><Select value={f.owner_employee_id} onChange={(v) => set("owner_employee_id", v)} loadOptions={loadEmployees} selectedOption={ownerOpts[0] ?? null} clearable /></Field>
            <Field label="Follow up on"><DateInput value={f.follow_up_on} onChange={(x) => set("follow_up_on", x)} clearable /></Field>
          </FormGrid>
          <div className="mt-4 space-y-4">
            <Field label="Follow-up note"><TextInput value={f.follow_up_note} onValueChange={(x) => set("follow_up_note", x)} /></Field>
            <Field label="Tags"><TagInput value={f.tags} onChange={(v) => set("tags", v)} /></Field>
            <Field label="Notes"><Textarea value={f.notes} onValueChange={(x) => set("notes", x)} rows={2} /></Field>
            <Toggle checked={f.talent_pool} onChange={(v) => set("talent_pool", v)} label="Keep in the talent pool" description="Kept longer for future roles (still deleted after the retention period)." />
          </div>
        </FormSection>
        <CustomFields entity="candidate" layout={cfLayout} values={custom} errors={cfErrors}
          onChange={(x) => { setCustom(x); setCfErrors({}); setDirty(true); }} />
      </div>
    </Modal>
  );
}
