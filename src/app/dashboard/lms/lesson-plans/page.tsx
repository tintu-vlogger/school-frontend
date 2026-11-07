"use client";

/*
 * Syllabus & lesson plans (staff).
 *   Lesson plans  weekly plans per section + subject (objectives, activities, resources, homework)
 *   Syllabus      units and topics per program + subject (term-wise); tick topics covered per section
 *   Coverage      % of topics covered per section + subject (principals see every section)
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookCheck, CheckCircle2, Circle, NotebookPen, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatDayMonth } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, DataTable, DateInput, Field, FilterBar, FormGrid, Modal, ModalCancel, MultiSelect, NumberInput, Select,
  Skeleton, Tabs, TextInput, Textarea, useConfirm, type Column, type FilterValues,
} from "@/components/ui-kit";
import { RichText, programOptions, sectionOptions, subjectOptions, useLmsOptions } from "@/components/lms/shared";
import { localDate, uniqueBy, type Homework, type Page } from "@/components/lms/lib";

type Plan = {
  id: number; uuid: string; section_id: number; section_label: string; subject_id: number; subject_name: string | null; teacher_name: string | null;
  week_start: string; week_end: string; title: string | null; topic_ids: number[]; topics: { id: number; title: string | null }[];
  objectives: string | null; activities: string | null; resources: string | null; assessment: string | null; homework_id: number | null;
  homework: { uuid: string; title: string } | null; status: "planned" | "done" | "skipped"; reflection: string | null;
};
type Topic = { id: number; uuid: string; title: string; planned_periods: number | null; covered: boolean; covered_on: string | null; covered_by: string | null };
type Unit = { id: number; uuid: string; title: string; term_no: number | null; topics: Topic[]; covered: number; total: number };
type Syllabus = { units: Unit[]; total: number; covered: number; percent: number | null };
type CoverageRow = { section_id: number; section_label: string; subject_id: number; subject_name: string; teacher_name: string | null; total: number; covered: number; percent: number | null };

const STATUS: Record<string, { label: string; tone: "neutral" | "good" | "warn" }> = { planned: { label: "Planned", tone: "neutral" }, done: { label: "Done", tone: "good" }, skipped: { label: "Skipped", tone: "warn" } };

export default function LessonPlansPage() {
  const { term } = useInstitution();
  const [tab, setTab] = useState("plans");
  const [newPlan, setNewPlan] = useState(0);
  const { options } = useLmsOptions();
  return (
    <div>
      <PageHeader eyebrow="Academics" title="Syllabus & lesson plans" description={`Plan each week, tick topics as you cover them and see how far each ${term("section").toLowerCase()} has got.`}
        actions={tab === "plans" && options?.can_teach ? <Button variant="primary" icon={Plus} onClick={() => setNewPlan((n) => n + 1)}>New lesson plan</Button> : undefined} />
      <Tabs value={tab} onChange={setTab} className="mb-4" items={[{ value: "plans", label: "Lesson plans" }, { value: "syllabus", label: "Syllabus" }, { value: "coverage", label: "Coverage" }]} />
      {tab === "plans" && <Plans newSignal={newPlan} />}
      {tab === "syllabus" && <SyllabusView />}
      {tab === "coverage" && <Coverage onOpen={() => setTab("syllabus")} />}
    </div>
  );
}

/* ── Lesson plans ──────────────────────────────────────────────────────── */

function Plans({ newSignal }: { newSignal: number }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const { options } = useLmsOptions();
  const allocs = useMemo(() => options?.allocations ?? [], [options]);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; page: Page<Plan> } | null>(null);
  const [formFor, setFormFor] = useState<Plan | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<Plan | null>(null);
  const key = JSON.stringify({ q, filters, page, nonce });
  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ page: String(page), size: "25" });
    if (q) p.set("q", q);
    for (const [k, param] of [["section", "section_id"], ["subject", "subject_id"], ["status", "status"]] as const) if (filters[k]?.[0]) p.set(param, filters[k][0]);
    if (filters.week?.[0]) p.set("week", filters.week[0] === "this" ? localDate(0) : localDate(7));
    api.get<Page<Plan>>(`/lms/lesson-plans?${p}`).then((r) => live && setData({ key, page: r }))
      .catch((e) => { if (live) { setData({ key, page: { items: [], total: 0, page: 1, size: 25 } }); toast.error(e.message); } });
    return () => { live = false; };
  }, [key, q, filters, page, toast]);
  const openForm = useCallback((p: Plan | "new") => { setFormKey((k) => k + 1); setFormFor(p); setFormOpen(true); }, []);
  useEffect(() => { if (newSignal) Promise.resolve().then(() => openForm("new")); }, [newSignal, openForm]);
  const refresh = () => setNonce((n) => n + 1);
  const canTeach = !!options?.can_teach;
  async function remove(p: Plan) {
    if (!(await confirm({ title: "Remove this lesson plan?", confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.delete(`/lms/lesson-plans/${p.uuid}`); toast.success("Removed"); setViewing(null); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove"); }
  }
  const columns: Column<Plan>[] = [
    { key: "week", header: "Week", cell: (p) => <span className="whitespace-nowrap text-ink">{formatDayMonth(p.week_start)} – {formatDayMonth(p.week_end)}</span> },
    { key: "title", header: "Plan", cell: (p) => <div className="min-w-0"><p className="truncate text-ink">{p.title || p.topics.map((t) => t.title).join(", ") || "Lesson plan"}</p><p className="truncate text-[12.5px] text-muted">{p.subject_name} · {p.section_label}</p></div> },
    { key: "teacher", header: term("teacher"), hideBelow: "lg", cell: (p) => <span className="text-muted">{p.teacher_name}</span> },
    { key: "hw", header: "Homework", hideBelow: "md", cell: (p) => p.homework ? <span className="text-ink/80">{p.homework.title}</span> : <span className="text-faint">—</span> },
    { key: "status", header: "Status", cell: (p) => <Badge tone={STATUS[p.status].tone} dot>{STATUS[p.status].label}</Badge> },
  ];
  return (
    <>
      <FilterBar searchPlaceholder="Search plans" onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={[
          { key: "week", label: "Week", options: [{ value: "this", label: "This week" }, { value: "next", label: "Next week" }] },
          { key: "section", label: term("section"), options: sectionOptions(allocs).map((o) => ({ value: String(o.value), label: o.label })) },
          { key: "subject", label: term("subject"), options: subjectOptions(allocs).map((o) => ({ value: String(o.value), label: o.label })) },
          { key: "status", label: "Status", options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })) },
        ]} values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={data?.page.items ?? []} rowKey={(p) => p.uuid} columns={columns} loading={data?.key !== key} onRowClick={setViewing}
        rowActions={canTeach ? (p) => [{ label: "Edit", icon: Pencil, onSelect: () => openForm(p) }, "separator", { label: "Remove", icon: Trash2, danger: true, onSelect: () => remove(p) }] : undefined}
        pagination={{ page, size: 25, total: data?.page.total ?? 0, onPageChange: setPage }}
        emptyIcon={NotebookPen} emptyTitle="No lesson plans yet" emptyHint="Plan a week: what learners will learn, how, and the homework that follows."
        emptyAction={canTeach && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New lesson plan</Button>} />
      <PlanForm key={formKey} target={formFor} open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refresh(); }} />
      <Modal open={!!viewing} onClose={() => setViewing(null)} size="lg" title={viewing?.title || "Lesson plan"}
        description={viewing ? `${viewing.subject_name} · ${viewing.section_label} · week of ${formatDate(viewing.week_start)}` : undefined}
        headerActions={viewing && canTeach && <Button size="sm" icon={Pencil} onClick={() => { const p = viewing; setViewing(null); openForm(p); }}>Edit</Button>}>
        {viewing && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2"><Badge tone={STATUS[viewing.status].tone} dot>{STATUS[viewing.status].label}</Badge>{viewing.topics.map((t) => <Badge key={t.id}>{t.title}</Badge>)}</div>
            {([["Objectives", viewing.objectives], ["Activities", viewing.activities], ["Resources", viewing.resources], ["Assessment", viewing.assessment], ["Reflection", viewing.reflection]] as const)
              .filter(([, t]) => t).map(([l, t]) => <div key={l}><p className="mb-1 text-[12px] uppercase tracking-[0.06em] text-faint">{l}</p><RichText text={t} /></div>)}
            {viewing.homework && <p className="text-[13.5px] text-muted">Homework: <a className="text-primary hover:underline" href={`/dashboard/lms/homework?view=${viewing.homework.uuid}`}>{viewing.homework.title}</a></p>}
          </div>
        )}
      </Modal>
    </>
  );
}

function PlanForm({ target, open, onClose, onSaved }: { target: Plan | "new"; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const { options } = useLmsOptions();
  const allocs = options?.allocations ?? [];
  const editing = target !== "new" ? target : null;
  const initial = {
    section: editing?.section_id ?? null as number | null, subject: editing?.subject_id ?? null as number | null, week: editing?.week_start ?? localDate(0),
    title: editing?.title ?? "", topics: editing?.topic_ids ?? [] as number[], objectives: editing?.objectives ?? "", activities: editing?.activities ?? "",
    resources: editing?.resources ?? "", assessment: editing?.assessment ?? "", homework: editing?.homework_id ?? null as number | null,
    status: (editing?.status ?? "planned") as string, reflection: editing?.reflection ?? "", markCovered: true,
  };
  const [v, setV] = useState(initial);
  const [units, setUnits] = useState<Unit[]>([]);
  const [homework, setHomework] = useState<Homework[]>([]);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((s) => ({ ...s, [k]: x }));
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const programId = allocs.find((a) => a.section_id === v.section)?.program_id;
  useEffect(() => {
    if (!programId || !v.subject || !v.section) return;
    let live = true;
    api.get<Syllabus>(`/lms/syllabus?program_id=${programId}&subject_id=${v.subject}`).then((r) => live && setUnits(r.units)).catch(() => {});
    api.get<Page<Homework>>(`/lms/homework?section_id=${v.section}&subject_id=${v.subject}&size=50`).then((r) => live && setHomework(r.items)).catch(() => {});
    return () => { live = false; };
  }, [programId, v.subject, v.section]);

  async function save() {
    if (!v.section || !v.subject || !v.week) { toast.error(`Pick the ${term("section").toLowerCase()}, ${term("subject").toLowerCase()} and week`); return; }
    setSaving(true);
    const body = { section_id: v.section, subject_id: v.subject, week_start: v.week, title: v.title.trim() || null, topic_ids: v.topics,
      objectives: v.objectives || null, activities: v.activities || null, resources: v.resources || null, assessment: v.assessment || null,
      homework_id: v.homework, status: v.status, reflection: v.reflection || null, mark_topics_covered: v.status === "done" && v.markCovered };
    try {
      if (editing) await api.put(`/lms/lesson-plans/${editing.uuid}`, body); else await api.post("/lms/lesson-plans", body);
      toast.success("Lesson plan saved"); onSaved();
    } catch (x) { toast.error("Couldn't save", { description: x instanceof Error ? x.message : undefined }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving} title={editing ? "Edit lesson plan" : "New lesson plan"}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Save</Button></>}>
      <FormGrid>
        <Field label={term("section")} required><Select value={v.section} onChange={(x) => setV((s) => ({ ...s, section: x, subject: null, topics: [], homework: null }))} options={sectionOptions(allocs)} /></Field>
        <Field label={term("subject")} required><Select value={v.subject} onChange={(x) => setV((s) => ({ ...s, subject: x, topics: [], homework: null }))} options={v.section ? subjectOptions(allocs, [v.section]) : []} disabled={!v.section} /></Field>
        <Field label="Week of" hint="Any day; the plan covers Monday to Sunday"><DateInput value={v.week} onChange={(x) => set("week", x)} /></Field>
        <Field label="Status"><Select value={v.status} onChange={(x) => x && set("status", x)} options={Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label }))} /></Field>
        <Field label="Title" aside="Optional" className="sm:col-span-2"><TextInput value={v.title} onValueChange={(x) => set("title", x)} /></Field>
        <Field label="Topics" aside="From the syllabus" className="sm:col-span-2">
          <MultiSelect value={v.topics} onChange={(x) => set("topics", x)} options={units.flatMap((u) => u.topics.map((t) => ({ value: t.id, label: t.title, description: u.title })))}
            placeholder={units.length ? "Pick topics" : "No syllabus for this subject yet"} disabled={!units.length} />
        </Field>
        <Field label="Objectives" className="sm:col-span-2"><Textarea value={v.objectives} onValueChange={(x) => set("objectives", x)} rows={2} autoGrow placeholder="By the end of the week learners can…" /></Field>
        <Field label="Activities" className="sm:col-span-2"><Textarea value={v.activities} onValueChange={(x) => set("activities", x)} rows={3} autoGrow /></Field>
        <Field label="Resources"><Textarea value={v.resources} onValueChange={(x) => set("resources", x)} rows={2} autoGrow /></Field>
        <Field label="Assessment"><Textarea value={v.assessment} onValueChange={(x) => set("assessment", x)} rows={2} autoGrow /></Field>
        <Field label="Homework" aside="Optional" className="sm:col-span-2"><Select value={v.homework} onChange={(x) => set("homework", x)} clearable options={homework.map((h) => ({ value: h.id, label: h.title, description: `Due ${formatDate(h.due_at)}` }))} placeholder="Link homework you've set" /></Field>
        {v.status !== "planned" && <Field label="How it went" className="sm:col-span-2"><Textarea value={v.reflection} onValueChange={(x) => set("reflection", x)} rows={2} /></Field>}
      </FormGrid>
      {v.status === "done" && v.topics.length > 0 && <Checkbox className="mt-4" checked={v.markCovered} onChange={(x) => set("markCovered", x)} label="Mark these topics as covered" />}
    </Modal>
  );
}

/* ── Syllabus ──────────────────────────────────────────────────────────── */

function SyllabusView() {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const { options } = useLmsOptions();
  const allocs = useMemo(() => options?.allocations ?? [], [options]);
  const [program, setProgram] = useState<number | null>(null);
  const [subject, setSubject] = useState<number | null>(null);
  const [section, setSection] = useState<number | null>(null);
  const [data, setData] = useState<{ key: string; s: Syllabus } | null>(null);
  const [tick, setTick] = useState(0);
  const [unitForm, setUnitForm] = useState<{ unit: Unit | null } | null>(null);
  const [topicForm, setTopicForm] = useState<{ unit: Unit; topic: Topic | null } | null>(null);
  const p = program ?? allocs[0]?.program_id ?? null;
  const subjects = uniqueBy(allocs.filter((a) => a.program_id === p), (a) => a.subject_id);
  const sb = subject && subjects.some((a) => a.subject_id === subject) ? subject : subjects[0]?.subject_id ?? null;
  const sections = uniqueBy(allocs.filter((a) => a.program_id === p && a.subject_id === sb), (a) => a.section_id);
  const sec = section && sections.some((a) => a.section_id === section) ? section : sections[0]?.section_id ?? null;
  const key = `${p}:${sb}:${sec}:${tick}`;
  useEffect(() => {
    if (!p || !sb) return;
    let live = true;
    api.get<Syllabus>(`/lms/syllabus?program_id=${p}&subject_id=${sb}${sec ? `&section_id=${sec}` : ""}`).then((s) => live && setData({ key, s })).catch((e) => toast.error(e.message));
    return () => { live = false; };
  }, [key, p, sb, sec, toast]);
  const s = data?.key === key ? data.s : null;
  const canEdit = !!options?.can_teach;

  async function toggle(t: Topic) {
    if (!sec) return;
    try { await api.post(`/lms/syllabus/topics/${t.uuid}/coverage`, { section_id: sec, covered: !t.covered }); setTick((x) => x + 1); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update"); }
  }
  async function removeUnit(u: Unit) {
    if (!(await confirm({ title: `Remove ${u.title}?`, message: "Its topics are removed from the syllabus.", confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.delete(`/lms/syllabus/units/${u.uuid}`); setTick((x) => x + 1); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove"); }
  }
  async function removeTopic(t: Topic) {
    try { await api.delete(`/lms/syllabus/topics/${t.uuid}`); setTick((x) => x + 1); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove"); }
  }

  if (!options) return <Skeleton className="h-60 w-full" />;
  if (!allocs.length) return <Paper className="px-6 py-12 text-center text-[14px] text-muted">You don&apos;t teach any {term("subjects").toLowerCase()} this {term("session").toLowerCase()} yet.</Paper>;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={term("program")}><Select value={p} onChange={(x) => { setProgram(x); setSubject(null); setSection(null); }} options={programOptions(allocs)} /></Field>
        <Field label={term("subject")}><Select value={sb} onChange={(x) => { setSubject(x); setSection(null); }} options={subjects.map((a) => ({ value: a.subject_id, label: a.subject_name }))} /></Field>
        <Field label={`Coverage for ${term("section").toLowerCase()}`}><Select value={sec} onChange={setSection} options={sections.map((a) => ({ value: a.section_id, label: a.section_label }))} /></Field>
      </div>
      {!s ? <Skeleton className="h-60 w-full" /> : (
        <>
          <Paper className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-[200px] flex-1">
              <p className="text-[13px] text-muted">{s.covered} of {s.total} topics covered</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-primary/70" style={{ width: `${s.percent ?? 0}%` }} /></div>
            </div>
            <p className="tabular text-[26px] font-extralight text-ink">{s.percent ?? 0}%</p>
            {canEdit && <Button icon={Plus} onClick={() => setUnitForm({ unit: null })}>Add unit</Button>}
          </Paper>
          {s.units.length === 0 ? (
            <Paper className="px-6 py-12 text-center"><BookCheck size={26} strokeWidth={1.2} className="mx-auto mb-3 text-faint" /><p className="text-[14.5px] text-ink">No syllabus yet</p>
              <p className="mt-1 text-[13.5px] text-muted">Add the units and topics for this {term("subject").toLowerCase()}, then tick them off as you teach.</p></Paper>
          ) : s.units.map((u) => (
            <Paper key={u.id}>
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                <div className="min-w-0"><p className="truncate text-[15px] text-ink">{u.title}</p><p className="text-[12.5px] text-muted">{u.term_no ? `${term("term")} ${u.term_no} · ` : ""}{u.covered}/{u.total} covered</p></div>
                {canEdit && <div className="flex gap-1"><Button size="sm" variant="ghost" icon={Plus} onClick={() => setTopicForm({ unit: u, topic: null })}>Topic</Button>
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setUnitForm({ unit: u })} aria-label="Edit unit" />
                  <Button size="sm" variant="ghost" icon={Trash2} onClick={() => removeUnit(u)} aria-label="Remove unit" /></div>}
              </div>
              <ul className="divide-y divide-line">
                {u.topics.map((t) => (
                  <li key={t.id} className="group flex items-center gap-3 px-5 py-2.5">
                    <button type="button" disabled={!canEdit || !sec} onClick={() => toggle(t)} aria-label={t.covered ? "Mark not covered" : "Mark covered"} className="shrink-0 disabled:cursor-default">
                      {t.covered ? <CheckCircle2 size={19} strokeWidth={1.4} className="text-emerald-600" /> : <Circle size={19} strokeWidth={1.2} className="text-faint" />}
                    </button>
                    <span className={`min-w-0 flex-1 truncate text-[14px] ${t.covered ? "text-muted" : "text-ink"}`}>{t.title}</span>
                    {t.covered && <span className="hidden text-[12.5px] text-faint sm:inline">{t.covered_on ? formatDate(t.covered_on) : ""}{t.covered_by ? ` · ${t.covered_by}` : ""}</span>}
                    {canEdit && <span className="flex opacity-0 transition-opacity group-hover:opacity-100">
                      <button type="button" aria-label="Edit topic" className="rounded p-1 text-faint hover:bg-sunken hover:text-ink" onClick={() => setTopicForm({ unit: u, topic: t })}><Pencil size={13} strokeWidth={1.4} /></button>
                      <button type="button" aria-label="Remove topic" className="rounded p-1 text-faint hover:bg-sunken hover:text-ink" onClick={() => removeTopic(t)}><Trash2 size={13} strokeWidth={1.4} /></button></span>}
                  </li>
                ))}
                {u.topics.length === 0 && <li className="px-5 py-3 text-[13px] text-muted">No topics yet.</li>}
              </ul>
            </Paper>
          ))}
        </>
      )}
      {unitForm && p && sb && <UnitForm unit={unitForm.unit} programId={p} subjectId={sb} onClose={() => setUnitForm(null)} onSaved={() => { setUnitForm(null); setTick((x) => x + 1); }} />}
      {topicForm && <TopicForm unit={topicForm.unit} topic={topicForm.topic} onClose={() => setTopicForm(null)} onSaved={() => { setTopicForm(null); setTick((x) => x + 1); }} />}
    </div>
  );
}

function UnitForm({ unit, programId, subjectId, onClose, onSaved }: { unit: Unit | null; programId: number; subjectId: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [title, setTitle] = useState(unit?.title ?? "");
  const [termNo, setTermNo] = useState<number | null>(unit?.term_no ?? null);
  const [topics, setTopics] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!title.trim()) { toast.error("Give the unit a name"); return; }
    setSaving(true);
    try {
      if (unit) await api.put(`/lms/syllabus/units/${unit.uuid}`, { title: title.trim(), term_no: termNo });
      else await api.post("/lms/syllabus/units", { program_id: programId, subject_id: subjectId, title: title.trim(), term_no: termNo,
        topics: topics.split("\n").map((t) => t.trim()).filter(Boolean).map((t) => ({ title: t })) });
      toast.success("Saved"); onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} title={unit ? "Edit unit" : "Add unit"}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Unit" required><TextInput autoFocusInModal value={title} onValueChange={setTitle} placeholder="e.g. Number systems" /></Field>
        <Field label={`${term("term")} number`} aside="Optional"><NumberInput value={termNo} onChange={setTermNo} min={1} max={20} /></Field>
        {!unit && <Field label="Topics" hint="One per line"><Textarea value={topics} onValueChange={setTopics} rows={5} /></Field>}
      </div>
    </Modal>
  );
}

function TopicForm({ unit, topic, onClose, onSaved }: { unit: Unit; topic: Topic | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(topic?.title ?? "");
  const [periods, setPeriods] = useState<number | null>(topic?.planned_periods ?? null);
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      if (topic) await api.put(`/lms/syllabus/topics/${topic.uuid}`, { title: title.trim(), planned_periods: periods });
      else await api.post(`/lms/syllabus/units/${unit.uuid}/topics`, { title: title.trim(), planned_periods: periods });
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="sm" busy={saving} title={topic ? "Edit topic" : `Add topic to ${unit.title}`}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Topic" required><TextInput autoFocusInModal value={title} onValueChange={setTitle} /></Field>
        <Field label="Periods planned" aside="Optional"><NumberInput value={periods} onChange={setPeriods} min={0} max={100} /></Field>
      </div>
    </Modal>
  );
}

/* ── Coverage ──────────────────────────────────────────────────────────── */

function Coverage({ onOpen }: { onOpen: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [rows, setRows] = useState<CoverageRow[] | null>(null);
  const [filters, setFilters] = useState<FilterValues>({});
  useEffect(() => {
    let live = true;
    api.get<CoverageRow[]>("/lms/coverage").then((r) => live && setRows(r)).catch((e) => { toast.error(e.message); if (live) setRows([]); });
    return () => { live = false; };
  }, [toast]);
  const list = (rows ?? []).filter((r) => (!filters.subject?.length || filters.subject.includes(String(r.subject_id))) &&
    (!filters.band?.length || filters.band.some((b) => (b === "none" ? r.total === 0 : b === "low" ? r.total > 0 && (r.percent ?? 0) < 40 : b === "mid" ? (r.percent ?? 0) >= 40 && (r.percent ?? 0) < 75 : (r.percent ?? 0) >= 75))));
  const cols: Column<CoverageRow>[] = [
    { key: "section", header: term("section"), sortable: true, sortValue: (r) => r.section_label, cell: (r) => <span className="text-ink">{r.section_label}</span> },
    { key: "subject", header: term("subject"), sortable: true, sortValue: (r) => r.subject_name, cell: (r) => <span className="text-ink/80">{r.subject_name}</span> },
    { key: "teacher", header: term("teacher"), hideBelow: "md", cell: (r) => <span className="text-muted">{r.teacher_name ?? "—"}</span> },
    { key: "pct", header: "Covered", sortable: true, sortValue: (r) => r.percent ?? -1, cell: (r) => r.total === 0 ? <span className="text-faint">No syllabus</span> : (
      <div className="flex w-48 items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"><div className={`h-full rounded-full ${(r.percent ?? 0) < 40 ? "bg-rose-400" : (r.percent ?? 0) < 75 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${r.percent ?? 0}%` }} /></div>
        <span className="tabular w-20 text-right text-[12.5px] text-muted">{r.covered}/{r.total} · {Math.round(r.percent ?? 0)}%</span></div>) },
  ];
  return (
    <>
      <FilterBar values={filters} onChange={setFilters} filters={[
        { key: "subject", label: term("subject"), multiple: true, options: uniqueBy(rows ?? [], (r) => r.subject_id).map((r) => ({ value: String(r.subject_id), label: r.subject_name })) },
        { key: "band", label: "Coverage", multiple: true, options: [{ value: "low", label: "Under 40%" }, { value: "mid", label: "40–75%" }, { value: "high", label: "75% or more" }, { value: "none", label: "No syllabus" }] }]} />
      <DataTable rows={list} rowKey={(r) => `${r.section_id}-${r.subject_id}`} columns={cols} loading={!rows} onRowClick={onOpen}
        emptyIcon={BookCheck} emptyTitle="Nothing to show" emptyHint={`Coverage appears once ${term("subjects").toLowerCase()} are allocated and syllabi added.`} />
    </>
  );
}
