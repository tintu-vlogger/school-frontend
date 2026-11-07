"use client";

/*
 * Learning admin: courses. A table of every course with enrolment numbers; Add / Edit
 * open the course form (details, cover, options, final assessment, lessons editor);
 * Assign enrols chosen people with a due date.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Archive, ArrowDown, ArrowUp, BookOpen, ClipboardCheck, Eye, FileText, Pencil, PlayCircle, Plus, Send, Trash2, UserPlus, Undo2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, Checkbox, DataTable, DateInput, Field, FileDrop, FilterBar, FormGrid, FormSection, IconButton, MasterSelect, Modal,
  ModalCancel, MultiSelect, NumberInput, Select, TextInput, Textarea, Toggle, useConfirm, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { COVERS, COVER_KEYS, CourseCover } from "../cover";
import { Bar, STROKE, deliveryLabel, errText, fileToDataUrl, levelLabel, minutes, searchEmployees, useLoad } from "../shared";
import type { AssessmentBrief, Course, CourseDetail, Lesson, LessonKind } from "../types";

const STATUS_TONE = { draft: "neutral", published: "good", archived: "warn" } as const;

export function CoursesTab({ onPreview }: { onPreview: (uuid: string) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const q = new URLSearchParams();
  if (search) q.set("q", search);
  if (filters.status?.[0]) q.set("status", filters.status[0]);
  const { data, loading, refresh } = useLoad<Course[]>(`/learning/courses?${q}`, "Couldn't load courses");
  const [editing, setEditing] = useState<string | null | "new">(null);
  const [assigning, setAssigning] = useState<Course | null>(null);

  async function setStatus(c: Course, status: string) {
    if (status === "archived" && !(await confirm({ title: `Archive ${c.title}?`, message: "It leaves the catalogue. Records of people who took it stay.", confirmLabel: "Archive", tone: "danger" }))) return;
    try { await api.post(`/learning/courses/${c.uuid}/status`, { status }); toast.success(status === "published" ? "Published" : status === "archived" ? "Archived" : "Moved to draft"); refresh(); }
    catch (e) { toast.error("Couldn't change the course", { description: errText(e) }); }
  }

  const columns: Column<Course>[] = [
    {
      key: "title", header: "Course", cell: (c) => (
        <div className="flex min-w-0 items-center gap-3">
          <CourseCover cover={c.cover} seed={c.title} height={36} className="w-14 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <p className="truncate text-ink">{c.title}</p>
            <p className="truncate text-[12.5px] text-muted">{c.category ?? deliveryLabel(c.delivery)} · {c.lesson_count} lessons · {minutes(c.duration_minutes)}</p>
          </div>
        </div>
      ),
    },
    { key: "flags", header: "Type", hideBelow: "lg", cell: (c) => <div className="flex flex-wrap gap-1">{c.mandatory && <Badge tone="warn">Mandatory</Badge>}<Badge>{levelLabel(c.level)}</Badge></div> },
    { key: "status", header: "Status", cell: (c) => <Badge tone={STATUS_TONE[c.status]} dot>{c.status[0].toUpperCase() + c.status.slice(1)}</Badge> },
    { key: "enrolled", header: "Learners", align: "right", sortable: true, sortValue: (c) => c.stats?.enrolled ?? 0, cell: (c) => <span className="tabular text-ink/80">{c.stats?.enrolled ?? 0}</span> },
    {
      key: "completion", header: "Completed", hideBelow: "md", sortable: true, sortValue: (c) => c.stats?.completion_pct ?? 0,
      cell: (c) => <div className="flex w-36 items-center gap-2"><Bar value={c.stats?.completion_pct ?? 0} tone="bg-emerald-500" /><span className="w-9 text-right text-[12.5px] tabular text-muted">{c.stats?.completion_pct ?? 0}%</span></div>,
    },
    { key: "overdue", header: "Overdue", align: "right", hideBelow: "md", cell: (c) => c.stats?.overdue ? <span className="tabular text-rose-700">{c.stats.overdue}</span> : <span className="text-faint">—</span> },
  ];

  return (
    <>
      <FilterBar searchPlaceholder="Search courses" onSearchChange={setSearch}
        filters={[{ key: "status", label: "Status", options: [{ value: "published", label: "Published" }, { value: "draft", label: "Draft" }, { value: "archived", label: "Archived" }] }]}
        values={filters} onChange={setFilters}
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Add course</Button>} />
      <DataTable rows={data ?? []} rowKey={(c) => c.uuid} columns={columns} loading={loading}
        onRowClick={(c) => setEditing(c.uuid)}
        rowActions={(c) => [
          { label: "Edit", icon: Pencil, onSelect: () => setEditing(c.uuid) },
          { label: "Preview", icon: Eye, onSelect: () => onPreview(c.uuid) },
          ...(c.status === "published" ? [{ label: "Assign to people", icon: UserPlus, onSelect: () => setAssigning(c) }] : []),
          "separator" as const,
          c.status === "published" ? { label: "Move to draft", icon: Undo2, onSelect: () => setStatus(c, "draft") } : { label: "Publish", icon: Send, onSelect: () => setStatus(c, "published") },
          ...(c.status !== "archived" ? [{ label: "Archive", icon: Archive, danger: true, onSelect: () => setStatus(c, "archived") }] : []),
        ]}
        emptyIcon={BookOpen} emptyTitle="No courses yet" emptyHint="Add your first course to build the catalogue."
        emptyAction={<Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Add course</Button>} />
      <CourseFormModal open={editing !== null} uuid={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />
      <AssignModal course={assigning} onClose={() => setAssigning(null)} onSaved={refresh} />
    </>
  );
}

/* ── Course form ───────────────────────────────────────────────────────── */

type LessonDraft = { key: string; uuid?: string; title: string; kind: LessonKind; body: string; url: string; file_name: string; assessment_id: number | null; duration_minutes: number | null };
type CourseDraft = {
  title: string; summary: string; description: string; category_id: number | null; level: string; delivery: string; cover: string;
  duration_minutes: number | null; sequential: boolean; self_enrol: boolean; enrol_approval: boolean; mandatory: boolean;
  due_days: number | null; recert_months: number | null; assessment_id: number | null; certificate: boolean; tags: string; lessons: LessonDraft[];
};

const EMPTY: CourseDraft = {
  title: "", summary: "", description: "", category_id: null, level: "beginner", delivery: "online", cover: "indigo", duration_minutes: null,
  sequential: true, self_enrol: true, enrol_approval: false, mandatory: false, due_days: null, recert_months: null, assessment_id: null,
  certificate: true, tags: "", lessons: [],
};

let seq = 0;
const newLesson = (kind: LessonKind = "text"): LessonDraft => ({ key: `n${++seq}`, title: "", kind, body: "", url: "", file_name: "", assessment_id: null, duration_minutes: 5 });

function fromCourse(c: CourseDetail): CourseDraft {
  return {
    title: c.title, summary: c.summary ?? "", description: c.description ?? "", category_id: c.category_id, level: c.level, delivery: c.delivery,
    cover: c.cover ?? "indigo", duration_minutes: c.duration_minutes || null, sequential: c.sequential, self_enrol: c.self_enrol,
    enrol_approval: c.enrol_approval, mandatory: c.mandatory, due_days: c.due_days, recert_months: c.recert_months,
    assessment_id: c.assessment_id, certificate: c.certificate, tags: (c.tags ?? []).join(", "),
    lessons: c.lessons.map((l: Lesson) => ({ key: l.uuid, uuid: l.uuid, title: l.title, kind: l.kind, body: l.body ?? "", url: l.url ?? "", file_name: l.file_name ?? "", assessment_id: l.assessment_id, duration_minutes: l.duration_minutes })),
  };
}

const KIND_OPTS: SelectOption<LessonKind>[] = [
  { value: "text", label: "Text" }, { value: "video", label: "Video link" }, { value: "file", label: "File" }, { value: "assessment", label: "Quiz" },
];
const KIND_ICON = { text: BookOpen, video: PlayCircle, file: FileText, assessment: ClipboardCheck };

function CourseFormModal({ open, uuid, onClose, onSaved }: { open: boolean; uuid: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<CourseDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assessments, setAssessments] = useState<SelectOption<number>[]>([]);

  useEffect(() => {
    if (!open) return;
    setDirty(false);
    api.get<AssessmentBrief[]>("/learning/assessments").then((r) => setAssessments((r ?? []).map((a) => ({ value: a.id, label: a.title, description: `${a.question_count} questions · pass ${a.pass_pct}%` })))).catch(() => {});
    if (!uuid) { setV({ ...EMPTY, lessons: [newLesson()] }); return; }
    setV(null);
    api.get<CourseDetail>(`/learning/courses/${uuid}`).then((c) => setV(fromCourse(c))).catch((e) => toast.error("Couldn't load the course", { description: errText(e) }));
  }, [open, uuid, toast]);

  const set = <K extends keyof CourseDraft>(k: K, val: CourseDraft[K]) => { setV((cur) => (cur ? { ...cur, [k]: val } : cur)); setDirty(true); };
  const setLesson = (i: number, patch: Partial<LessonDraft>) => set("lessons", v!.lessons.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: number) => { const ls = [...v!.lessons]; const [x] = ls.splice(i, 1); ls.splice(i + d, 0, x); set("lessons", ls); };

  async function save(publish?: boolean) {
    if (!v) return;
    setSaving(true);
    try {
      const body = {
        ...v, summary: v.summary || null, description: v.description || null,
        tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean),
        duration_minutes: v.duration_minutes ?? 0,
        ...(publish ? { status: "published" } : {}),
        lessons: v.lessons.map((l) => ({ uuid: l.uuid, title: l.title, kind: l.kind, body: l.kind === "text" ? l.body : null, url: ["video", "file"].includes(l.kind) ? l.url : null, file_name: l.kind === "file" ? l.file_name || null : null, assessment_id: l.kind === "assessment" ? l.assessment_id : null, duration_minutes: l.duration_minutes ?? 5 })),
      };
      if (uuid) await api.put(`/learning/courses/${uuid}`, body);
      else await api.post("/learning/courses", body);
      toast.success(uuid ? "Course saved" : publish ? "Course published" : "Course added as a draft");
      setDirty(false); onSaved(); onClose();
    } catch (e) { toast.error("Couldn't save the course", { description: errText(e) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" title={uuid ? `Edit ${v?.title || "course"}` : "Add course"} description="Lessons open in the order you set here." dirty={dirty} busy={saving}
      footer={<><ModalCancel />{!uuid && <Button variant="secondary" loading={saving} disabled={!v?.title.trim()} onClick={() => save(false)}>Save as draft</Button>}<Button variant="primary" loading={saving} disabled={!v?.title.trim()} onClick={() => save(!uuid)}>{uuid ? "Save changes" : "Publish"}</Button></>}>
      {!v ? <p className="py-10 text-center text-[14px] text-muted">Loading…</p> : (
        <div className="space-y-8">
          <FormSection title="About the course">
            <div className="grid gap-5 md:grid-cols-[1fr_220px]">
              <div className="space-y-5">
                <Field label="Title" required><TextInput value={v.title} onValueChange={(x) => set("title", x)} autoFocusInModal /></Field>
                <Field label="One-line summary" hint="Shown on the course card"><TextInput value={v.summary} onValueChange={(x) => set("summary", x)} maxLength={400} /></Field>
              </div>
              <div>
                <CourseCover cover={v.cover} seed={v.title || "course"} height={104} className="rounded-xl" mandatory={v.mandatory} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {COVER_KEYS.map((k) => (
                    <button key={k} type="button" title={COVERS[k].label} onClick={() => set("cover", k)}
                      className={`h-6 w-6 rounded-full border-2 ${v.cover === k ? "border-ink/60" : "border-transparent"}`} style={{ background: `linear-gradient(135deg, ${COVERS[k].from}, ${COVERS[k].accent})` }} />
                  ))}
                </div>
              </div>
            </div>
            <Field label="Description" className="mt-5"><Textarea value={v.description} onValueChange={(x) => set("description", x)} rows={3} autoGrow /></Field>
            <FormGrid columns={3} className="mt-5">
              <Field label="Category"><MasterSelect type="course_category" value={v.category_id} onChange={(x) => set("category_id", x)} clearable /></Field>
              <Field label="Level"><Select value={v.level} onChange={(x) => set("level", x ?? "beginner")} options={[{ value: "beginner", label: "Beginner" }, { value: "intermediate", label: "Intermediate" }, { value: "advanced", label: "Advanced" }]} /></Field>
              <Field label="Format"><Select value={v.delivery} onChange={(x) => set("delivery", x ?? "online")} options={[{ value: "online", label: "Online" }, { value: "classroom", label: "Classroom" }, { value: "blended", label: "Blended" }]} /></Field>
              <Field label="Length" hint="Leave empty to add up the lessons"><NumberInput value={v.duration_minutes} onChange={(x) => set("duration_minutes", x)} min={0} suffix="min" /></Field>
              <Field label="Tags" hint="Comma separated"><TextInput value={v.tags} onValueChange={(x) => set("tags", x)} /></Field>
              <Field label="Final assessment"><Select value={v.assessment_id} onChange={(x) => set("assessment_id", x)} options={assessments} clearable placeholder="None" /></Field>
            </FormGrid>
          </FormSection>

          <FormSection title="Rules">
            <div className="grid gap-x-8 gap-y-4 md:grid-cols-2">
              <Toggle checked={v.sequential} onChange={(x) => set("sequential", x)} label="Lessons open in order" description="Learners finish one lesson before the next unlocks." />
              <Toggle checked={v.certificate} onChange={(x) => set("certificate", x)} label="Certificate on completion" />
              <Toggle checked={v.self_enrol} onChange={(x) => set("self_enrol", x)} label="Anyone can enrol" description="Otherwise HR or managers assign it." />
              <Toggle checked={v.enrol_approval} onChange={(x) => set("enrol_approval", x)} label="Enrolment needs approval" description="Goes to the reporting manager." />
              <Toggle checked={v.mandatory} onChange={(x) => set("mandatory", x)} label="Mandatory training" description="For POSH, safety and policy courses." />
            </div>
            <FormGrid className="mt-5">
              <Field label="Days to finish after assignment"><NumberInput value={v.due_days} onChange={(x) => set("due_days", x)} min={1} suffix="days" /></Field>
              <Field label="Renew every" hint="People re-take it after this"><NumberInput value={v.recert_months} onChange={(x) => set("recert_months", x)} min={1} suffix="months" /></Field>
            </FormGrid>
          </FormSection>

          <FormSection title="Lessons" description={`${v.lessons.length} lesson${v.lessons.length === 1 ? "" : "s"}`}>
            <div className="space-y-3">
              {v.lessons.map((l, i) => {
                const Icon = KIND_ICON[l.kind];
                return (
                  <div key={l.key} className="rounded-xl border border-line p-4">
                    <div className="flex items-start gap-3">
                      <span className="mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted"><Icon size={15} strokeWidth={STROKE} /></span>
                      <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_150px_110px]">
                        <TextInput value={l.title} onValueChange={(x) => setLesson(i, { title: x })} placeholder={`Lesson ${i + 1} title`} aria-label="Lesson title" />
                        <Select value={l.kind} onChange={(x) => setLesson(i, { kind: x ?? "text" })} options={KIND_OPTS} aria-label="Lesson type" />
                        <NumberInput value={l.duration_minutes} onChange={(x) => setLesson(i, { duration_minutes: x })} min={1} suffix="min" />
                      </div>
                      <div className="flex shrink-0 items-center">
                        <IconButton icon={ArrowUp} label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
                        <IconButton icon={ArrowDown} label="Move down" size="sm" disabled={i === v.lessons.length - 1} onClick={() => move(i, 1)} />
                        <IconButton icon={Trash2} label="Remove lesson" size="sm" onClick={() => set("lessons", v.lessons.filter((_, j) => j !== i))} />
                      </div>
                    </div>
                    <div className="mt-3 pl-10">
                      {l.kind === "text" && <Textarea value={l.body} onValueChange={(x) => setLesson(i, { body: x })} rows={4} autoGrow placeholder="Write the lesson. Leave a blank line between paragraphs." />}
                      {l.kind === "video" && <TextInput value={l.url} onValueChange={(x) => setLesson(i, { url: x })} placeholder="YouTube, Vimeo or video file link" />}
                      {l.kind === "file" && (
                        <div className="space-y-2">
                          {l.url ? (
                            <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-[13.5px]">
                              <span className="truncate text-ink/85">{l.file_name || l.url}</span>
                              <Button size="sm" variant="ghost" onClick={() => setLesson(i, { url: "", file_name: "" })}>Replace</Button>
                            </div>
                          ) : (
                            <>
                              <FileDrop value={[]} maxSizeMb={8} accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/*"
                                onChange={async (files) => { const f = files[0]; if (f) setLesson(i, { url: await fileToDataUrl(f), file_name: f.name }); }}
                                onReject={(r) => toast.error(r[0] ?? "That file can't be used")} title="Drop a file or click to choose" hint="PDF, Office files or images, up to 8 MB" />
                              <TextInput value="" onValueChange={(x) => setLesson(i, { url: x })} placeholder="…or paste a link" />
                            </>
                          )}
                        </div>
                      )}
                      {l.kind === "assessment" && <Select value={l.assessment_id} onChange={(x) => setLesson(i, { assessment_id: x })} options={assessments} placeholder="Pick a quiz" />}
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-2">
                {KIND_OPTS.map((k) => <Button key={k.value} size="sm" variant="secondary" icon={Plus} onClick={() => set("lessons", [...v.lessons, newLesson(k.value)])}>{k.label}</Button>)}
              </div>
            </div>
          </FormSection>
        </div>
      )}
    </Modal>
  );
}

/* ── Assign ────────────────────────────────────────────────────────────── */

export function AssignModal({ course, path, onClose, onSaved }: { course?: Course | null; path?: { uuid: string; title: string } | null; onClose: () => void; onSaved?: () => void }) {
  const toast = useToast();
  const [ids, setIds] = useState<number[]>([]);
  const [picked, setPicked] = useState<SelectOption<number>[]>([]);
  const [due, setDue] = useState("");
  const [mandatory, setMandatory] = useState(true);
  const [saving, setSaving] = useState(false);
  const target = course ?? path ?? null;
  useEffect(() => { if (target) { setIds([]); setPicked([]); setDue(""); setMandatory(course?.mandatory ?? true); } }, [target, course]);

  async function save() {
    if (!target) return;
    setSaving(true);
    try {
      const url = course ? `/learning/courses/${course.uuid}/assign` : `/learning/paths/${path!.uuid}/assign`;
      const r = await api.post<{ enrolled: number }>(url, { employee_ids: ids, due_date: due || null, mandatory });
      toast.success(r.enrolled ? `${r.enrolled} enrolment${r.enrolled === 1 ? "" : "s"} added` : "Everyone picked was already enrolled");
      onSaved?.(); onClose();
    } catch (e) { toast.error("Couldn't assign", { description: errText(e) }); }
    finally { setSaving(false); }
  }

  const selected = useMemo(() => picked, [picked]);
  return (
    <Modal open={!!target} onClose={onClose} size="md" title={`Assign ${target?.title ?? ""}`} description="Chosen people are enrolled and told by notification." busy={saving} dirty={ids.length > 0}
      footer={<><ModalCancel /><Button variant="primary" icon={UserPlus} loading={saving} disabled={!ids.length} onClick={save}>Assign</Button></>}>
      <div className="space-y-5">
        <Field label="People" required>
          <MultiSelect value={ids} onChange={(v, o) => { setIds(v); setPicked(o); }} loadOptions={searchEmployees} selectedOptions={selected} placeholder="Search by name or code" />
        </Field>
        <Field label="Finish by" hint={course?.due_days ? `Leave empty to use ${course.due_days} days from today` : undefined}><DateInput value={due} onChange={setDue} clearable /></Field>
        {course && <Checkbox checked={mandatory} onChange={setMandatory} label="Mandatory" description="Shows as required training and in compliance reports." />}
      </div>
    </Modal>
  );
}
