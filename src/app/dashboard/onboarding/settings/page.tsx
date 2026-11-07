"use client";

/*
 * Onboarding settings: flows chosen by rule (tasks, portal sections, documents, induction,
 * courses, statutory forms) and general settings (link, reminders, check-ins, welcome).
 */
import { useEffect, useState } from "react";
import { ArrowLeft, GripVertical, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, DataTable, Field, FormGrid, FormSection, IconButton, Modal, ModalCancel, MultiSelect, NumberInput,
  Select, Skeleton, Tabs, TextInput, Textarea, Toggle, type Column, type SelectOption,
} from "@/components/ui-kit";
import { employeeOptionsFor, loadEmployees } from "@/components/workplace/pickers";
import { AudienceEditor, audienceSummary, useOrgOptions } from "@/components/onboarding/audience";
import type { Flow, FlowTask, Meta } from "@/components/onboarding/types";

type Settings = {
  portal_link_days: number; reminder_first_after_days: number; reminder_every_days: number; min_gap_days: number;
  checkin_days: number[]; welcome_email: boolean; welcome_text: string; buzz_post: boolean; buzz_text: string;
  auto_start_day_one: boolean; require_appointment_letter: boolean; it_owner_id: number | null; admin_owner_id: number | null;
  hr_owner_id: number | null; minimum_age: number;
};

export default function OnboardingSettingsPage() {
  const [tab, setTab] = useState<"flows" | "general">("flows");
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => { api.get<Meta>("/onboarding/meta").then(setMeta).catch(() => {}); }, []);
  return (
    <div>
      <PageHeader eyebrow={<Link href="/dashboard/onboarding" className="inline-flex items-center gap-1 hover:text-ink"><ArrowLeft size={12} strokeWidth={1.4} />Onboarding</Link>}
        title="Onboarding settings" description="Flows decide the checklist, the joining form and induction for each kind of joiner." />
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[{ value: "flows", label: "Flows" }, { value: "general", label: "General" }]} />
      {tab === "flows" ? <Flows meta={meta} /> : <General />}
    </div>
  );
}

function Flows({ meta }: { meta: Meta | null }) {
  const toast = useToast();
  const org = useOrgOptions();
  const [rows, setRows] = useState<Flow[] | null>(null);
  const [editing, setEditing] = useState<Flow | "new" | null>(null);
  const load = () => api.get<{ items: Flow[] }>("/onboarding/flows").then((r) => setRows(r.items)).catch((e) => toast.error(e.message));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, []);
  const cols: Column<Flow>[] = [
    { key: "name", header: "Flow", cell: (f) => <div><p className="text-ink">{f.name}</p><p className="text-[12px] text-faint">{f.description}</p></div> },
    { key: "aud", header: "Applies to", cell: (f) => <span className="text-muted">{audienceSummary(f.audience, org)}</span> },
    { key: "prio", header: "Order", align: "right", cell: (f) => f.priority },
    { key: "tasks", header: "Tasks", align: "right", hideBelow: "md", cell: (f) => f.tasks.length },
    { key: "use", header: "In use", align: "right", hideBelow: "md", cell: (f) => f.in_use },
    { key: "on", header: "", cell: (f) => f.active ? <Badge tone="good">On</Badge> : <Badge>Off</Badge> },
  ];
  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13.5px] text-muted">The first active flow (lowest order) whose audience matches the joiner is used.</p>
        <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>New flow</Button>
      </div>
      <DataTable rows={rows ?? []} loading={!rows} columns={cols} rowKey={(f) => f.uuid} onRowClick={setEditing} emptyTitle="No flows yet" />
      <FlowModal flow={editing} meta={meta} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </>
  );
}

const BLANK: Flow = {
  uuid: "", name: "", description: "", audience: {}, priority: 100, pre_joining_enabled: true, day_one_enabled: true, tasks: [],
  sections: ["personal", "contact", "family", "nominees", "bank", "statutory", "previous_employment", "tax", "education", "emergency", "documents"],
  documents: [], induction: [], course_ids: [], statutory_forms: ["pf_form2", "pf_form11", "esi_declaration", "gratuity_form_f"],
  require_admin_closure: true, active: true, in_use: 0,
};

function FlowModal({ flow, meta, onClose, onSaved }: { flow: Flow | "new" | null; meta: Meta | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<Flow>(BLANK);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [courses, setCourses] = useState<SelectOption<number>[]>([]);
  const [people, setPeople] = useState<SelectOption<number>[]>([]);
  useEffect(() => {
    if (!flow) return;
    const x = flow === "new" ? BLANK : flow;
    setF(JSON.parse(JSON.stringify(x)));
    setDirty(false);
    employeeOptionsFor([...x.tasks.map((t) => t.employee_id), ...x.induction.map((s) => s.host_id ?? null)]).then(setPeople).catch(() => {});
    api.get<{ id: number; title: string }[]>("/learning/courses").then((r) => setCourses((Array.isArray(r) ? r : []).map((c) => ({ value: c.id, label: c.title })))).catch(() => setCourses([]));
  }, [flow]);
  const up = (patch: Partial<Flow>) => { setF((x) => ({ ...x, ...patch })); setDirty(true); };
  const setTask = (i: number, patch: Partial<FlowTask>) => up({ tasks: f.tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const owners = Object.entries(meta?.owners ?? {}).map(([value, label]) => ({ value, label }));
  async function save() {
    setSaving(true);
    try {
      const body = { ...f, tasks: f.tasks.filter((t) => t.title.trim()), documents: f.documents.filter((d) => d.label.trim()), induction: f.induction.filter((s) => s.title.trim()) };
      if (flow === "new") await api.post("/onboarding/flows", body);
      else await api.put(`/onboarding/flows/${f.uuid}`, body);
      toast.success("Flow saved");
      onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  return (
    <Modal open={!!flow} onClose={onClose} size="xl" dirty={dirty} busy={saving} title={flow === "new" ? "New onboarding flow" : f.name || "Flow"}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={save}>Save flow</Button></>}>
      <FormSection title="Basics">
        <FormGrid>
          <Field label="Name" required><TextInput value={f.name} onValueChange={(v) => up({ name: v })} /></Field>
          <Field label="Order" hint="Lower is checked first"><NumberInput value={f.priority} onChange={(v) => up({ priority: v ?? 100 })} min={1} /></Field>
          <Field label="Description" className="sm:col-span-2"><TextInput value={f.description ?? ""} onValueChange={(v) => up({ description: v })} /></Field>
        </FormGrid>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Toggle checked={f.pre_joining_enabled} onChange={(v) => up({ pre_joining_enabled: v })} label="Pre-joining stage" description="Joining link and tasks before day one" />
          <Toggle checked={f.day_one_enabled} onChange={(v) => up({ day_one_enabled: v })} label="Day-one stage" description="Tasks and induction from the joining date" />
          <Toggle checked={f.active} onChange={(v) => up({ active: v })} label="Active" />
        </div>
      </FormSection>
      <FormSection title="Who it applies to"><AudienceEditor value={f.audience} onChange={(a) => up({ audience: a })} /></FormSection>
      <FormSection title="Checklist tasks" description="Days are counted from the joining date (negative = before).">
        <div className="space-y-2">
          {f.tasks.map((t, i) => (
            <div key={i} className="grid items-start gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_130px_130px_130px_auto]">
              <div className="space-y-2">
                <TextInput value={t.title} onValueChange={(v) => setTask(i, { title: v })} placeholder="Task" />
                <TextInput value={t.checklist.join(", ")} onValueChange={(v) => setTask(i, { checklist: v.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="Checklist items, comma separated" />
                {t.owner === "employee" && <Select loadOptions={loadEmployees} selectedOption={people.find((p) => p.value === t.employee_id) ?? null} value={t.employee_id} onChange={(v) => setTask(i, { employee_id: v })} placeholder="Pick the person" />}
              </div>
              <Select options={owners} value={t.owner} onChange={(v) => setTask(i, { owner: v ?? "hr" })} aria-label="Owner" />
              <Select options={[{ value: "pre_joining", label: "Pre-joining" }, { value: "day_one", label: "Day one" }]} value={t.stage} onChange={(v) => setTask(i, { stage: v ?? "pre_joining" })} aria-label="Stage" />
              <NumberInput value={t.due_days} onChange={(v) => setTask(i, { due_days: v ?? 0 })} suffix="d" />
              <IconButton icon={Trash2} label="Remove task" onClick={() => up({ tasks: f.tasks.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <Button size="sm" icon={Plus} onClick={() => up({ tasks: [...f.tasks, { title: "", owner: "hr", employee_id: null, stage: "pre_joining", due_days: -1, checklist: [] }] })}>Add task</Button>
        </div>
      </FormSection>
      <FormSection title="Joining form" description="Sections the joiner fills in on the joining link.">
        <div className="grid gap-2 sm:grid-cols-3">
          {Object.entries(meta?.sections ?? {}).map(([k, label]) => (
            <Checkbox key={k} label={label} checked={f.sections.includes(k)} onChange={(on) => up({ sections: on ? [...f.sections, k] : f.sections.filter((s) => s !== k) })} />
          ))}
        </div>
      </FormSection>
      <FormSection title="Documents to upload">
        <div className="space-y-2">
          {f.documents.map((d, i) => (
            <div key={i} className="flex items-center gap-3">
              <GripVertical size={14} strokeWidth={1.4} className="text-faint" />
              <TextInput className="flex-1" value={d.label} onValueChange={(v) => up({ documents: f.documents.map((x, j) => (j === i ? { ...x, label: v } : x)) })} placeholder="Document" />
              <Checkbox label="Required" checked={d.required} onChange={(v) => up({ documents: f.documents.map((x, j) => (j === i ? { ...x, required: v } : x)) })} />
              <IconButton icon={Trash2} label="Remove" onClick={() => up({ documents: f.documents.filter((_, j) => j !== i) })} />
            </div>
          ))}
          <Button size="sm" icon={Plus} onClick={() => up({ documents: [...f.documents, { label: "", required: true }] })}>Add document</Button>
        </div>
      </FormSection>
      <FormSection title="Induction sessions">
        <div className="space-y-2">
          {f.induction.map((s, i) => {
            const set = (p: Partial<typeof s>) => up({ induction: f.induction.map((x, j) => (j === i ? { ...x, ...p } : x)) });
            return (
              <div key={i} className="grid items-center gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_120px_80px_130px_1fr_auto]">
                <TextInput value={s.title} onValueChange={(v) => set({ title: v })} placeholder="Session" />
                <NumberInput value={s.day} onChange={(v) => set({ day: v ?? 1 })} min={1} suffix="day" />
                <TextInput value={s.time} onValueChange={(v) => set({ time: v })} placeholder="10:00" />
                <NumberInput value={s.duration_minutes} onChange={(v) => set({ duration_minutes: v ?? 60 })} suffix="min" />
                <TextInput value={s.where ?? ""} onValueChange={(v) => set({ where: v })} placeholder="Where" />
                <IconButton icon={Trash2} label="Remove" onClick={() => up({ induction: f.induction.filter((_, j) => j !== i) })} />
              </div>
            );
          })}
          <Button size="sm" icon={Plus} onClick={() => up({ induction: [...f.induction, { title: "", day: 1, time: "10:00", duration_minutes: 60, where: "" }] })}>Add session</Button>
        </div>
        {courses.length > 0 && (
          <Field label="Courses to assign on day one" className="mt-4">
            <MultiSelect options={courses} value={f.course_ids} onChange={(v) => up({ course_ids: v })} placeholder="Pick courses" />
          </Field>
        )}
      </FormSection>
      <FormSection title="Statutory joining forms">
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(meta?.forms ?? {}).map(([k, label]) => (
            <Checkbox key={k} label={label} checked={f.statutory_forms.includes(k)} onChange={(on) => up({ statutory_forms: on ? [...f.statutory_forms, k] : f.statutory_forms.filter((s) => s !== k) })} />
          ))}
        </div>
      </FormSection>
    </Modal>
  );
}

function General() {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState<SelectOption<number>[]>([]);
  useEffect(() => {
    api.get<Settings>("/onboarding/settings").then((x) => {
      setS(x);
      employeeOptionsFor([x.it_owner_id, x.admin_owner_id, x.hr_owner_id]).then(setPeople).catch(() => {});
    }).catch((e) => toast.error(e.message));
  }, [toast]);
  if (!s) return <Skeleton className="h-80 rounded-2xl" />;
  const up = (p: Partial<Settings>) => { setS({ ...s, ...p }); setDirty(true); };
  const person = (key: "it_owner_id" | "admin_owner_id" | "hr_owner_id") => (
    <Select loadOptions={loadEmployees} selectedOption={people.find((p) => p.value === s[key]) ?? null} value={s[key]} onChange={(v) => up({ [key]: v } as Partial<Settings>)} clearable placeholder="First HR person" />
  );
  async function save() {
    setSaving(true);
    try { setS(await api.put<Settings>("/onboarding/settings", s)); setDirty(false); toast.success("Settings saved"); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  return (
    <Paper className="p-6">
      <FormSection title="Joining link">
        <FormGrid columns={3}>
          <Field label="Link works for"><NumberInput value={s.portal_link_days} onChange={(v) => up({ portal_link_days: v ?? 21 })} suffix="days" min={1} max={90} /></Field>
          <Field label="First reminder after"><NumberInput value={s.reminder_first_after_days} onChange={(v) => up({ reminder_first_after_days: v ?? 2 })} suffix="days" /></Field>
          <Field label="Then remind every"><NumberInput value={s.reminder_every_days} onChange={(v) => up({ reminder_every_days: v ?? 3 })} suffix="days" /></Field>
          <Field label="Finish details before joining" hint="Days before the joining date"><NumberInput value={s.min_gap_days} onChange={(v) => up({ min_gap_days: v ?? 0 })} suffix="days" /></Field>
          <Field label="Minimum age on joining"><NumberInput value={s.minimum_age} onChange={(v) => up({ minimum_age: v ?? 18 })} min={14} suffix="years" /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Who does the work">
        <FormGrid columns={3}>
          <Field label="IT tasks">{person("it_owner_id")}</Field>
          <Field label="Admin tasks">{person("admin_owner_id")}</Field>
          <Field label="Default HR partner">{person("hr_owner_id")}</Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Day one and after">
        <div className="space-y-3">
          <Toggle checked={s.auto_start_day_one} onChange={(v) => up({ auto_start_day_one: v })} label="Start day one on the joining date automatically" />
          <Toggle checked={s.require_appointment_letter} onChange={(v) => up({ require_appointment_letter: v })} label="Require the appointment letter before completing" description="The OSH Code requires one for every employee." />
          <Field label="Check-ins (days after joining)" hint="Comma separated">
            <TextInput value={s.checkin_days.join(", ")} onValueChange={(v) => up({ checkin_days: v.split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => n > 0) })} />
          </Field>
        </div>
      </FormSection>
      <FormSection title="Welcome" description="Use {first_name}, {name}, {joining_date}, {designation} and {department}.">
        <div className="space-y-4">
          <Toggle checked={s.welcome_email} onChange={(v) => up({ welcome_email: v })} label="Send a welcome email on day one" />
          {s.welcome_email && <Textarea value={s.welcome_text} onValueChange={(v) => up({ welcome_text: v })} rows={3} />}
          <Toggle checked={s.buzz_post} onChange={(v) => up({ buzz_post: v })} label="Post a welcome on Buzz" />
          {s.buzz_post && <TextInput value={s.buzz_text} onValueChange={(v) => up({ buzz_text: v })} />}
        </div>
      </FormSection>
      <div className="flex justify-end pt-2"><Button variant="primary" disabled={!dirty} loading={saving} onClick={save}>Save settings</Button></div>
    </Paper>
  );
}
