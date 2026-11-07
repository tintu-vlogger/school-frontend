"use client";

/*
 * Learning admin: learning paths (ordered courses, required or optional), enrolment rules
 * (a course or path for everyone, chosen departments / designations or a condition), and
 * course requests from employees.
 */
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Inbox, Pencil, Play, Plus, Route, Trash2, UserPlus, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatRelative } from "@/lib/datetime";
import {
  Badge, Button, Checkbox, DataTable, Field, FormGrid, IconButton, Modal, ModalCancel, MultiSelect, NumberInput, RadioCards, Select,
  TextInput, Textarea, Toggle, type Column, type SelectOption,
} from "@/components/ui-kit";
import { AssignModal } from "./courses";
import { errText, money, useLoad, useSimpleOptions } from "../shared";
import type { Course, CourseRequest, LearningPath, Rule } from "../types";

function useCourseOptions(open: boolean) {
  const [opts, setOpts] = useState<SelectOption<number>[]>([]);
  useEffect(() => {
    if (!open) return;
    api.get<Course[]>("/learning/courses?status=published").then((r) => setOpts((r ?? []).map((c) => ({ value: c.id, label: c.title })))).catch(() => {});
  }, [open]);
  return opts;
}

/* ── Paths ─────────────────────────────────────────────────────────────── */

export function PathsTab() {
  const { data, loading, refresh } = useLoad<LearningPath[]>("/learning/paths", "Couldn't load paths");
  const [editing, setEditing] = useState<LearningPath | null | "new">(null);
  const [assign, setAssign] = useState<LearningPath | null>(null);
  const columns: Column<LearningPath>[] = [
    { key: "title", header: "Path", cell: (p) => <div><p className="text-ink">{p.title}</p>{p.description && <p className="line-clamp-1 text-[12.5px] text-muted">{p.description}</p>}</div> },
    { key: "kind", header: "Kind", cell: (p) => <Badge tone={p.kind === "plan" ? "accent" : "neutral"}>{p.kind === "plan" ? "Learning plan" : "Path"}</Badge> },
    { key: "courses", header: "Courses", cell: (p) => <span className="text-ink/80">{p.items.length} ({p.items.filter((i) => i.required).length} required)</span> },
    { key: "due", header: "Time to finish", hideBelow: "md", cell: (p) => p.due_days ? `${p.due_days} days` : <span className="text-faint">—</span> },
  ];
  return (
    <>
      <div className="mb-4 flex justify-end"><Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Add path</Button></div>
      <DataTable rows={data ?? []} rowKey={(p) => p.uuid} columns={columns} loading={loading} onRowClick={(p) => setEditing(p)}
        rowActions={(p) => [{ label: "Edit", icon: Pencil, onSelect: () => setEditing(p) }, { label: "Assign to people", icon: UserPlus, onSelect: () => setAssign(p) }]}
        emptyIcon={Route} emptyTitle="No learning paths yet" emptyHint="Group courses into a journey, such as new manager essentials." />
      <PathModal open={editing !== null} path={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />
      <AssignModal path={assign} onClose={() => setAssign(null)} onSaved={refresh} />
    </>
  );
}

function PathModal({ open, path, onClose, onSaved }: { open: boolean; path: LearningPath | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const courses = useCourseOptions(open);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState("path");
  const [dueDays, setDueDays] = useState<number | null>(null);
  const [sequential, setSequential] = useState(false);
  const [items, setItems] = useState<{ course_id: number | null; required: boolean }[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTitle(path?.title ?? ""); setDescription(path?.description ?? ""); setKind(path?.kind ?? "path"); setDueDays(path?.due_days ?? null);
    setSequential(path?.sequential ?? false); setItems(path?.items.map((i) => ({ course_id: i.course_id, required: i.required })) ?? [{ course_id: null, required: true }]);
    setDirty(false);
  }, [open, path]);
  const upd = (fn: () => void) => { fn(); setDirty(true); };
  const move = (i: number, d: number) => upd(() => { const n = [...items]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x); setItems(n); });

  async function save() {
    setSaving(true);
    try {
      const body = { title, description: description || null, kind, due_days: dueDays, sequential, status: "published", items: items.filter((i) => i.course_id) };
      if (path) await api.put(`/learning/paths/${path.uuid}`, body); else await api.post("/learning/paths", body);
      toast.success(path ? "Path saved" : "Path added"); setDirty(false); onSaved(); onClose();
    } catch (e) { toast.error("Couldn't save the path", { description: errText(e) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={path ? `Edit ${path.title}` : "Add learning path"} dirty={dirty} busy={saving}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!title.trim() || !items.some((i) => i.course_id)} onClick={save}>{path ? "Save" : "Add path"}</Button></>}>
      <div className="space-y-5">
        <Field label="Title" required><TextInput value={title} onValueChange={(x) => upd(() => setTitle(x))} autoFocusInModal /></Field>
        <Field label="Description"><Textarea value={description} onValueChange={(x) => upd(() => setDescription(x))} rows={2} /></Field>
        <RadioCards columns={2} value={kind} onChange={(x) => upd(() => setKind(x))} options={[
          { value: "plan", label: "Learning plan", description: "Assigned by HR, with a deadline." },
          { value: "path", label: "Path", description: "A suggested journey people can join." },
        ]} />
        <FormGrid>
          <Field label="Days to finish" hint="When assigned"><NumberInput value={dueDays} onChange={(x) => upd(() => setDueDays(x))} min={1} suffix="days" /></Field>
          <div className="pt-7"><Toggle checked={sequential} onChange={(x) => upd(() => setSequential(x))} label="Courses in order" /></div>
        </FormGrid>
        <div>
          <p className="mb-2 text-[14px] text-ink">Courses</p>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 text-right text-[12.5px] tabular text-faint">{i + 1}</span>
                <Select className="flex-1" value={it.course_id} onChange={(x) => upd(() => setItems(items.map((p, j) => (j === i ? { ...p, course_id: x } : p))))} options={courses} placeholder="Pick a course" />
                <Checkbox checked={it.required} onChange={(x) => upd(() => setItems(items.map((p, j) => (j === i ? { ...p, required: x } : p))))} label="Required" />
                <IconButton icon={ArrowUp} size="sm" label="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
                <IconButton icon={ArrowDown} size="sm" label="Move down" disabled={i === items.length - 1} onClick={() => move(i, 1)} />
                <IconButton icon={Trash2} size="sm" label="Remove" onClick={() => upd(() => setItems(items.filter((_, j) => j !== i)))} />
              </div>
            ))}
          </div>
          <Button className="mt-2" size="sm" variant="secondary" icon={Plus} onClick={() => upd(() => setItems([...items, { course_id: null, required: true }]))}>Add course</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Rules ─────────────────────────────────────────────────────────────── */

export function RulesTab() {
  const toast = useToast();
  const { data, loading, refresh } = useLoad<Rule[]>("/learning/rules", "Couldn't load rules");
  const [editing, setEditing] = useState<Rule | null | "new">(null);
  const [running, setRunning] = useState<string | null>(null);

  async function run(r: Rule) {
    setRunning(r.uuid);
    try { const res = await api.post<{ enrolled: number }>(`/learning/rules/${r.uuid}/run`); toast.success(res.enrolled ? `${res.enrolled} people enrolled` : "Everyone who matches is already enrolled"); refresh(); }
    catch (e) { toast.error("Couldn't run the rule", { description: errText(e) }); }
    finally { setRunning(null); }
  }

  const columns: Column<Rule>[] = [
    { key: "name", header: "Rule", cell: (r) => <div><p className="text-ink">{r.name}</p><p className="text-[12.5px] text-muted">{r.target?.kind === "path" ? "Path: " : ""}{r.target?.title ?? "—"}</p></div> },
    { key: "who", header: "Who", cell: (r) => <span className="text-ink/80">{r.criteria.condition ? "Matching a condition" : r.criteria.department_ids?.length || r.criteria.designation_ids?.length ? `${(r.criteria.department_ids?.length ?? 0) + (r.criteria.designation_ids?.length ?? 0)} groups` : "Everyone"}</span> },
    { key: "flags", header: "", hideBelow: "md", cell: (r) => <div className="flex gap-1">{r.mandatory && <Badge tone="warn">Mandatory</Badge>}{r.due_days && <Badge>{r.due_days} days</Badge>}</div> },
    { key: "last", header: "Last run", hideBelow: "lg", cell: (r) => r.last_run_at ? <span className="text-muted">{formatRelative(r.last_run_at)} · {r.last_run_count} added</span> : <span className="text-faint">Never</span> },
    { key: "active", header: "Status", cell: (r) => <Badge tone={r.active ? "good" : "neutral"} dot>{r.active ? "On" : "Off"}</Badge> },
  ];
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">Rules also run at every start of the day, so new joiners get their courses.</p>
        <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Add rule</Button>
      </div>
      <DataTable rows={data ?? []} rowKey={(r) => r.uuid} columns={columns} loading={loading} onRowClick={(r) => setEditing(r)}
        rowActions={(r) => [{ label: "Edit", icon: Pencil, onSelect: () => setEditing(r) }, { label: running === r.uuid ? "Running…" : "Run now", icon: Play, disabled: !r.active || running === r.uuid, onSelect: () => run(r) }]}
        emptyIcon={Wand2} emptyTitle="No enrolment rules" emptyHint="For example: POSH awareness for everyone, due in 30 days." />
      <RuleModal open={editing !== null} rule={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </>
  );
}

function RuleModal({ open, rule, onClose, onSaved }: { open: boolean; rule: Rule | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const courses = useCourseOptions(open);
  const paths = useSimpleOptions("/learning/paths", "title");
  const departments = useSimpleOptions("/departments/", "department_name");
  const designations = useSimpleOptions("/designations/", "designation_name");
  const [name, setName] = useState("");
  const [target, setTarget] = useState<"course" | "path">("course");
  const [courseId, setCourseId] = useState<number | null>(null);
  const [pathId, setPathId] = useState<number | null>(null);
  const [who, setWho] = useState<"all" | "groups" | "condition">("all");
  const [deps, setDeps] = useState<number[]>([]);
  const [desigs, setDesigs] = useState<number[]>([]);
  const [condition, setCondition] = useState("");
  const [mandatory, setMandatory] = useState(true);
  const [dueDays, setDueDays] = useState<number | null>(30);
  const [active, setActive] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const r = rule;
    setName(r?.name ?? ""); setTarget(r?.path_id ? "path" : "course"); setCourseId(r?.course_id ?? null); setPathId(r?.path_id ?? null);
    setWho(r?.criteria.condition ? "condition" : r?.criteria.department_ids?.length || r?.criteria.designation_ids?.length ? "groups" : "all");
    setDeps(r?.criteria.department_ids ?? []); setDesigs(r?.criteria.designation_ids ?? []); setCondition(r?.criteria.condition ?? "");
    setMandatory(r?.mandatory ?? true); setDueDays(r ? r.due_days : 30); setActive(r?.active ?? true); setDirty(false);
  }, [open, rule]);
  const upd = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirty(true); };

  async function save() {
    setSaving(true);
    try {
      const body = { name, course_id: target === "course" ? courseId : null, path_id: target === "path" ? pathId : null, mandatory, due_days: dueDays, active,
        criteria: { all: who === "all", department_ids: who === "groups" ? deps : [], designation_ids: who === "groups" ? desigs : [], condition: who === "condition" ? condition : "" } };
      if (rule) { await api.put(`/learning/rules/${rule.uuid}`, body); toast.success("Rule saved"); }
      else { const r = await api.post<{ enrolled: number }>("/learning/rules", body); toast.success("Rule added", { description: `${r.enrolled} people enrolled now.` }); }
      setDirty(false); onSaved(); onClose();
    } catch (e) { toast.error("Couldn't save the rule", { description: errText(e) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={rule ? "Edit enrolment rule" : "Add enrolment rule"} description="Everyone who matches is enrolled now and whenever they join later." dirty={dirty} busy={saving}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!name.trim() || (target === "course" ? !courseId : !pathId)} onClick={save}>{rule ? "Save" : "Add and run"}</Button></>}>
      <div className="space-y-5">
        <Field label="Name" required><TextInput value={name} onValueChange={upd(setName)} placeholder="e.g. POSH awareness for everyone" autoFocusInModal /></Field>
        <RadioCards columns={2} value={target} onChange={upd((x: string) => setTarget(x as "course" | "path"))} options={[{ value: "course", label: "A course" }, { value: "path", label: "A learning path" }]} />
        {target === "course"
          ? <Field label="Course" required><Select value={courseId} onChange={upd(setCourseId)} options={courses} placeholder="Pick a course" /></Field>
          : <Field label="Learning path" required><Select value={pathId} onChange={upd(setPathId)} options={paths} placeholder="Pick a path" /></Field>}
        <Field label="Who">
          <RadioCards columns={3} value={who} onChange={upd((x: string) => setWho(x as typeof who))} options={[
            { value: "all", label: "Everyone" }, { value: "groups", label: "Departments or designations" }, { value: "condition", label: "A condition" },
          ]} />
        </Field>
        {who === "groups" && (
          <FormGrid>
            <Field label="Departments"><MultiSelect value={deps} onChange={upd(setDeps)} options={departments} placeholder="Any department" /></Field>
            <Field label="Designations"><MultiSelect value={desigs} onChange={upd(setDesigs)} options={designations} placeholder="Any designation" /></Field>
          </FormGrid>
        )}
        {who === "condition" && <Field label="Condition" hint="e.g. employee.role == 'manager'"><TextInput value={condition} onValueChange={upd(setCondition)} className="font-mono" /></Field>}
        <FormGrid>
          <Field label="Days to finish"><NumberInput value={dueDays} onChange={upd(setDueDays)} min={1} suffix="days" /></Field>
          <div className="space-y-3 pt-6">
            <Checkbox checked={mandatory} onChange={upd(setMandatory)} label="Mandatory" />
            <Toggle checked={active} onChange={upd(setActive)} label="Rule is on" />
          </div>
        </FormGrid>
      </div>
    </Modal>
  );
}

/* ── Requests ──────────────────────────────────────────────────────────── */

const REQ_TONE = { pending: "warn", approved: "good", fulfilled: "accent", rejected: "bad", cancelled: "neutral" } as const;

export function RequestsTab() {
  const toast = useToast();
  const { data, loading, refresh } = useLoad<CourseRequest[]>("/learning/requests?mine=false", "Couldn't load requests");
  const [fulfil, setFulfil] = useState<CourseRequest | null>(null);
  const [courseId, setCourseId] = useState<number | null>(null);
  const courses = useCourseOptions(!!fulfil);
  const [saving, setSaving] = useState(false);

  const columns: Column<CourseRequest>[] = [
    { key: "title", header: "Course asked for", cell: (r) => <div><p className="text-ink">{r.title}</p>{r.reason && <p className="line-clamp-1 text-[12.5px] text-muted">{r.reason}</p>}</div> },
    { key: "who", header: "Asked by", cell: (r) => <span className="text-ink/80">{r.requester ?? "—"}</span> },
    { key: "provider", header: "Provider", hideBelow: "lg", cell: (r) => r.provider ?? <span className="text-faint">—</span> },
    { key: "cost", header: "Cost", align: "right", hideBelow: "md", cell: (r) => r.estimated_cost ? <span className="tabular">{money(r.estimated_cost)}</span> : <span className="text-faint">—</span> },
    { key: "date", header: "Asked on", hideBelow: "md", cell: (r) => <span className="text-muted">{formatDate(r.created_at)}</span> },
    { key: "status", header: "Status", cell: (r) => <Badge tone={REQ_TONE[r.status]} dot>{r.status === "fulfilled" ? "Fulfilled" : r.status[0].toUpperCase() + r.status.slice(1)}</Badge> },
  ];

  async function save() {
    if (!fulfil || !courseId) return;
    setSaving(true);
    try { await api.post(`/learning/requests/${fulfil.uuid}/fulfil`, { course_id: courseId }); toast.success("Request fulfilled", { description: "The person was enrolled in the course." }); setFulfil(null); refresh(); }
    catch (e) { toast.error("Couldn't fulfil", { description: errText(e) }); }
    finally { setSaving(false); }
  }

  return (
    <>
      <p className="mb-4 text-[13px] text-muted">Requests are approved through the approval flow “Course request”. Once approved, link the course you set up.</p>
      <DataTable rows={data ?? []} rowKey={(r) => r.uuid} columns={columns} loading={loading}
        rowActions={(r) => r.status === "approved" || r.status === "pending" ? [{ label: "Fulfil with a course", icon: Inbox, onSelect: () => { setCourseId(null); setFulfil(r); } }] : []}
        emptyIcon={Inbox} emptyTitle="No course requests" emptyHint="Employees can ask for courses from the catalogue." />
      <Modal open={!!fulfil} onClose={() => setFulfil(null)} size="md" title="Fulfil request" description={fulfil?.title} busy={saving}
        footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!courseId} onClick={save}>Fulfil and enrol</Button></>}>
        <Field label="Course" hint="Add the course first if it isn't in the catalogue yet."><Select value={courseId} onChange={setCourseId} options={courses} placeholder="Pick a course" /></Field>
      </Modal>
    </>
  );
}
