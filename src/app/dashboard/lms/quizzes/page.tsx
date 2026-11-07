"use client";

/*
 * Quizzes & tests (staff). Tab "Quizzes": build quizzes from the question bank (fixed list or
 * random draw), publish, see results, mark long answers and read the item analysis.
 * Tab "Question bank": questions of six kinds with difficulty, topic and tags.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Check, Eye, ListChecks, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, DataTable, DateInput, Field, FilterBar, FormGrid, FormSection, KeyValue, Modal, ModalCancel, MultiSelect,
  NumberInput, RadioCards, Section, Select, Skeleton, Tabs, TextInput, Textarea, TimeInput, Toggle, useConfirm, type BadgeTone, type Column,
  type FilterValues,
} from "@/components/ui-kit";
import { RichText, sectionOptions, subjectOptions, useLmsOptions } from "@/components/lms/shared";
import { QUESTION_KINDS, splitISO, toISO, type Attempt, type Page, type Question, type QuestionKind, type Quiz, type RandomRule } from "@/components/lms/lib";

const WINDOW: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" }, scheduled: { label: "Opens later", tone: "info" }, open: { label: "Open", tone: "good" }, closed: { label: "Closed", tone: "neutral" },
};
const DIFF: Record<string, BadgeTone> = { easy: "good", medium: "info", hard: "warn" };

export default function QuizzesPage() {
  const [tab, setTab] = useState("quizzes");
  const { options } = useLmsOptions();
  const [newQuiz, setNewQuiz] = useState(0);
  const [newQuestion, setNewQuestion] = useState(0);
  return (
    <div>
      <PageHeader eyebrow="Teaching" title="Quizzes & tests" description="Build quizzes from your question bank. Answers are marked automatically; you mark only long answers."
        actions={options?.can_teach ? (tab === "quizzes"
          ? <Button variant="primary" icon={Plus} onClick={() => setNewQuiz((n) => n + 1)}>New quiz</Button>
          : <Button variant="primary" icon={Plus} onClick={() => setNewQuestion((n) => n + 1)}>New question</Button>) : undefined} />
      <Tabs value={tab} onChange={setTab} className="mb-4" items={[{ value: "quizzes", label: "Quizzes" }, { value: "bank", label: "Question bank" }]} />
      {tab === "quizzes" ? <QuizList newSignal={newQuiz} /> : <QuestionBank newSignal={newQuestion} />}
    </div>
  );
}

/* ── Quizzes ───────────────────────────────────────────────────────────── */

function QuizList({ newSignal }: { newSignal: number }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const { options } = useLmsOptions();
  const allocs = useMemo(() => options?.allocations ?? [], [options]);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; page: Page<Quiz> } | null>(null);
  const [formFor, setFormFor] = useState<Quiz | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);
  const key = JSON.stringify({ q, filters, page, nonce });
  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ page: String(page), size: "25" });
    if (q) p.set("q", q);
    if (filters.section?.[0]) p.set("section_id", filters.section[0]);
    if (filters.subject?.[0]) p.set("subject_id", filters.subject[0]);
    if (filters.status?.[0]) p.set("status", filters.status[0]);
    api.get<Page<Quiz>>(`/lms/quizzes?${p}`).then((r) => live && setData({ key, page: r }))
      .catch((e) => { if (live) { setData({ key, page: { items: [], total: 0, page: 1, size: 25 } }); toast.error(e.message); } });
    return () => { live = false; };
  }, [key, q, filters, page, toast]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const openForm = useCallback((x: Quiz | "new") => { setFormKey((k) => k + 1); setFormFor(x); setFormOpen(true); }, []);
  useEffect(() => { if (newSignal) Promise.resolve().then(() => openForm("new")); }, [newSignal, openForm]);
  const canTeach = !!options?.can_teach;

  async function remove(x: Quiz) {
    if (!(await confirm({ title: `Remove “${x.title}”?`, message: "Learners will no longer see it. Results are kept.", confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.delete(`/lms/quizzes/${x.uuid}`); toast.success("Removed"); setViewing(null); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove"); }
  }

  const columns: Column<Quiz>[] = [
    { key: "title", header: "Quiz", cell: (x) => <div className="min-w-0"><p className="truncate text-ink">{x.title}</p><p className="truncate text-[12.5px] text-muted">{x.subject_name} · {x.sections.map((s) => s.label).join(", ")}</p></div> },
    { key: "qs", header: "Questions", hideBelow: "md", cell: (x) => <span className="tabular text-muted">{x.question_count}{x.mode === "random" ? " (random)" : ""}</span> },
    { key: "closes", header: "Closes", hideBelow: "lg", cell: (x) => <span className="text-muted">{x.closes_at ? formatDateTime(x.closes_at) : "—"}</span> },
    { key: "attempted", header: "Attempted", align: "right", hideBelow: "sm", cell: (x) => <span className="tabular text-muted">{x.stats?.attempted ?? 0}</span> },
    { key: "avg", header: "Average", align: "right", hideBelow: "md", cell: (x) => x.stats?.average != null ? <span className="tabular">{x.stats.average}%</span> : <span className="text-faint">—</span> },
    { key: "mark", header: "To mark", align: "right", cell: (x) => x.stats?.to_mark ? <Badge tone="warn">{x.stats.to_mark}</Badge> : <span className="text-faint">—</span> },
    { key: "status", header: "Status", cell: (x) => <Badge tone={WINDOW[x.window]?.tone} dot>{WINDOW[x.window]?.label ?? x.window}</Badge> },
  ];
  return (
    <>
      <FilterBar searchPlaceholder="Search quizzes" onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={[
          { key: "section", label: term("section"), options: sectionOptions(allocs).map((o) => ({ value: String(o.value), label: o.label })) },
          { key: "subject", label: term("subject"), options: subjectOptions(allocs).map((o) => ({ value: String(o.value), label: o.label })) },
          { key: "status", label: "Status", options: [{ value: "draft", label: "Draft" }, { value: "published", label: "Published" }, { value: "closed", label: "Closed" }] },
        ]} values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={data?.page.items ?? []} rowKey={(x) => x.uuid} columns={columns} loading={data?.key !== key} onRowClick={(x) => setViewing(x.uuid)}
        rowActions={(x) => [{ label: "Open", icon: Eye, onSelect: () => setViewing(x.uuid) },
          ...(canTeach ? [{ label: "Edit", icon: Pencil, onSelect: () => openForm(x) }, "separator" as const, { label: "Remove", icon: Trash2, danger: true, onSelect: () => remove(x) }] : [])]}
        pagination={{ page, size: 25, total: data?.page.total ?? 0, onPageChange: setPage }}
        emptyIcon={ListChecks} emptyTitle="No quizzes yet" emptyHint="Add questions to the bank, then put a quiz together from them."
        emptyAction={canTeach && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New quiz</Button>} />
      <QuizForm key={formKey} target={formFor} open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refresh(); }} />
      <QuizDetail uuid={viewing} canTeach={canTeach} onClose={() => { setViewing(null); refresh(); }} onEdit={(x) => { setViewing(null); openForm(x); }} />
    </>
  );
}

function QuizForm({ target, open, onClose, onSaved }: { target: Quiz | "new"; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const { options } = useLmsOptions();
  const allocs = options?.allocations ?? [];
  const [full, setFull] = useState<Quiz | null>(null);
  const editing = target !== "new" ? (full ?? target) : null;
  useEffect(() => {
    if (target === "new") return;
    let live = true;
    api.get<Quiz>(`/lms/quizzes/${target.uuid}`).then((r) => live && setFull(r)).catch(() => {});
    return () => { live = false; };
  }, [target]);
  const opens = splitISO(editing?.opens_at);
  const closes = splitISO(editing?.closes_at);
  const make = () => ({
    title: editing?.title ?? "", instructions: editing?.instructions ?? "", kind: editing?.kind ?? "quiz",
    subject: editing?.subject_id ?? null as number | null, sections: editing?.section_ids ?? [] as number[],
    mode: editing?.mode ?? "fixed", rules: (editing?.random_rules?.length ? editing.random_rules : [{ count: 10, difficulty: null }]) as RandomRule[],
    picked: (editing?.questions ?? []).map((x) => x.id), time: editing ? editing.time_limit_min : (options?.settings.quiz_default_time_limit || null),
    attempts: editing?.attempts_allowed ?? 1 as number | null, shuffleQ: editing?.shuffle_questions ?? false, shuffleO: editing?.shuffle_options ?? false,
    openDate: opens.date, openTime: opens.time || "08:00", closeDate: closes.date, closeTime: closes.time || "20:00",
    show: editing?.show_answers ?? options?.settings.quiz_show_answers ?? "after_close", pass: editing?.pass_percent ? Number(editing.pass_percent) : null as number | null,
  });
  const [v, setV] = useState(make);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (full && loadedFor !== full.uuid) { setLoadedFor(full.uuid); setV(make()); }
  const [bank, setBank] = useState<Question[]>([]);
  const [bankQ, setBankQ] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => { setV((s) => ({ ...s, [k]: x })); setErr(""); };
  const locked = !!editing?.has_attempts;
  useEffect(() => {
    if (!v.subject) return;
    let live = true;
    api.get<Page<Question>>(`/lms/questions?subject_id=${v.subject}&size=200`).then((r) => live && setBank(r.items)).catch(() => live && setBank([]));
    return () => { live = false; };
  }, [v.subject]);
  const visibleBank = bank.filter((x) => x.subject_id === v.subject && (!bankQ || `${x.prompt} ${x.topic ?? ""} ${x.tags.join(" ")}`.toLowerCase().includes(bankQ.toLowerCase())));
  const pickedMarks = bank.filter((x) => v.picked.includes(x.id)).reduce((s, x) => s + Number(x.marks), 0);

  async function save(publish: boolean) {
    if (!v.title.trim() || !v.subject || !v.sections.length) { setErr(`Add a title, ${term("subject").toLowerCase()} and ${term("sections").toLowerCase()}`); return; }
    setSaving(true);
    const body: Record<string, unknown> = {
      title: v.title.trim(), instructions: v.instructions.trim() || null, kind: v.kind, subject_id: v.subject, section_ids: v.sections,
      time_limit_min: v.time || null, attempts_allowed: v.attempts || 1, shuffle_questions: v.shuffleQ, shuffle_options: v.shuffleO,
      opens_at: v.openDate ? toISO(v.openDate, v.openTime) : null, closes_at: v.closeDate ? toISO(v.closeDate, v.closeTime) : null,
      show_answers: v.show, pass_percent: v.pass,
    };
    if (!locked) Object.assign(body, { mode: v.mode, random_rules: v.mode === "random" ? v.rules : [], questions: v.mode === "fixed" ? v.picked.map((id) => ({ question_id: id })) : [] });
    if (publish) body.status = "published";
    else if (!editing) body.status = "draft";
    try {
      if (editing) await api.put(`/lms/quizzes/${editing.uuid}`, body); else await api.post("/lms/quizzes", body);
      toast.success(publish ? "Quiz published" : "Quiz saved", { description: publish ? "Learners and parents have been told." : undefined }); onSaved();
    } catch (x) { toast.error("Couldn't save", { description: x instanceof Error ? x.message : undefined }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" busy={saving} title={editing ? `Edit ${editing.title}` : "New quiz"}
      footer={<><ModalCancel /><Button onClick={() => save(false)} loading={saving}>{editing?.status === "published" ? "Save changes" : "Save draft"}</Button>
        {editing?.status !== "published" && <Button variant="primary" icon={Send} onClick={() => save(true)} loading={saving}>Publish</Button>}</>}>
      <FormSection title="About">
        <FormGrid>
          <Field label="Title" required error={err} className="sm:col-span-2"><TextInput autoFocusInModal value={v.title} onValueChange={(x) => set("title", x)} placeholder="e.g. Chapter 2 quiz" /></Field>
          <Field label={term("subject")} required><Select value={v.subject} onChange={(x) => setV((s) => ({ ...s, subject: x, picked: [], sections: s.sections.filter((id) => allocs.some((a) => a.section_id === id && a.subject_id === x)) }))} options={subjectOptions(allocs)} disabled={locked} /></Field>
          <Field label={term("sections")} required><MultiSelect value={v.sections} onChange={(x) => set("sections", x)} options={sectionOptions(allocs, v.subject)} disabled={!v.subject} /></Field>
          <Field label="Type"><Select value={v.kind} onChange={(x) => x && set("kind", x)} options={[{ value: "quiz", label: "Quiz" }, { value: "test", label: "Test" }]} /></Field>
          <Field label="Pass mark" aside="Optional"><NumberInput value={v.pass} onChange={(x) => set("pass", x)} min={0} max={100} suffix="%" /></Field>
          <Field label="Instructions" className="sm:col-span-2"><Textarea value={v.instructions} onValueChange={(x) => set("instructions", x)} rows={2} autoGrow /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Questions" description={locked ? "Learners have started, so questions can't change." : undefined}>
        <RadioCards value={v.mode} onChange={(x) => !locked && set("mode", x)} options={[
          { value: "fixed", label: "Pick questions", description: "Everyone gets the same questions" },
          { value: "random", label: "Random from the bank", description: "Each learner gets a different draw" }]} />
        {v.mode === "fixed" ? (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <TextInput value={bankQ} onValueChange={setBankQ} placeholder="Search the bank" className="max-w-xs" />
              <span className="text-[13px] text-muted">{v.picked.length} picked · {pickedMarks} marks</span>
            </div>
            {!v.subject ? <p className="text-[13.5px] text-muted">Pick the {term("subject").toLowerCase()} first.</p> : visibleBank.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-[13.5px] text-muted">No questions for this {term("subject").toLowerCase()} yet. Add some in the Question bank tab.</p>
            ) : (
              <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line">
                {visibleBank.map((x) => {
                  const on = v.picked.includes(x.id);
                  return (
                    <li key={x.id} className="flex items-start gap-3 px-4 py-2.5">
                      <Checkbox checked={on} disabled={locked} onChange={(c) => set("picked", c ? [...v.picked, x.id] : v.picked.filter((i) => i !== x.id))} />
                      <div className="min-w-0 flex-1"><p className="line-clamp-2 text-[13.5px] text-ink">{x.prompt}</p>
                        <p className="mt-0.5 text-[12px] text-muted">{x.kind_label} · {x.marks} mark{Number(x.marks) === 1 ? "" : "s"}{x.topic ? ` · ${x.topic}` : ""}</p></div>
                      <Badge tone={DIFF[x.difficulty]}>{x.difficulty}</Badge>
                    </li>);
                })}
              </ul>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {v.rules.map((r, i) => (
              <div key={i} className="grid grid-cols-[90px_1fr_1fr_32px] items-end gap-2">
                <Field label={i === 0 ? "How many" : undefined}><NumberInput value={r.count} onChange={(x) => set("rules", v.rules.map((y, j) => j === i ? { ...y, count: x ?? 0 } : y))} min={1} max={100} /></Field>
                <Field label={i === 0 ? "Difficulty" : undefined}><Select value={r.difficulty ?? null} clearable placeholder="Any" onChange={(x) => set("rules", v.rules.map((y, j) => j === i ? { ...y, difficulty: x } : y))}
                  options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} /></Field>
                <Field label={i === 0 ? "Topic" : undefined}><TextInput value={r.topic ?? ""} placeholder="Any" onValueChange={(x) => set("rules", v.rules.map((y, j) => j === i ? { ...y, topic: x } : y))} /></Field>
                <button type="button" aria-label="Remove rule" className="mb-2 rounded p-1 text-faint hover:bg-sunken hover:text-ink" onClick={() => set("rules", v.rules.filter((_, j) => j !== i))}><X size={15} strokeWidth={1.4} /></button>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => set("rules", [...v.rules, { count: 5, difficulty: null }])}>Add rule</Button>
          </div>
        )}
      </FormSection>
      <FormSection title="Timing and rules">
        <FormGrid columns={3}>
          <Field label="Time limit" aside="Optional"><NumberInput value={v.time} onChange={(x) => set("time", x)} min={1} max={600} suffix="min" /></Field>
          <Field label="Attempts allowed"><NumberInput value={v.attempts} onChange={(x) => set("attempts", x)} min={1} max={20} /></Field>
          <Field label="Show answers"><Select value={v.show} onChange={(x) => x && set("show", x)} options={[{ value: "after_submit", label: "Right after submitting" }, { value: "after_close", label: "After the quiz closes" }, { value: "never", label: "Never" }]} /></Field>
          <Field label="Opens" aside="Optional"><DateInput value={v.openDate} onChange={(x) => set("openDate", x)} clearable /></Field>
          <Field label="at"><TimeInput value={v.openTime} onChange={(x) => set("openTime", x)} /></Field>
          <div className="hidden lg:block" />
          <Field label="Closes" aside="Optional"><DateInput value={v.closeDate} onChange={(x) => set("closeDate", x)} clearable /></Field>
          <Field label="at"><TimeInput value={v.closeTime} onChange={(x) => set("closeTime", x)} /></Field>
        </FormGrid>
        <div className="mt-4 flex flex-wrap gap-6">
          <Toggle checked={v.shuffleQ} onChange={(x) => set("shuffleQ", x)} label="Shuffle questions" />
          <Toggle checked={v.shuffleO} onChange={(x) => set("shuffleO", x)} label="Shuffle options" />
        </div>
      </FormSection>
    </Modal>
  );
}

type Results = {
  rows: { student_id: number; name: string; roll_no: string | null; section_label: string | null; attempts: number; in_progress: boolean;
    best_attempt_uuid: string | null; score: string | null; max_score: string | null; percent: number | null; passed: boolean | null; needs_marking: boolean; submitted_at: string | null }[];
  items: { question_id: number; prompt: string; kind: string; difficulty: string; seen: number; correct: number; blank: number; correct_percent: number | null;
    average_percent: number | null; options: { key: string; text: string; count: number; is_answer: boolean }[] }[];
  summary: { learners: number; attempted: number; average: number | null; highest: number | null; lowest: number | null; to_mark: number };
};

function QuizDetail({ uuid, canTeach, onClose, onEdit }: { uuid: string | null; canTeach: boolean; onClose: () => void; onEdit: (x: Quiz) => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [state, setState] = useState<{ uuid: string; quiz: Quiz; results: Results } | null>(null);
  const [tabState, setTab] = useState<{ uuid: string | null; tab: string }>({ uuid: null, tab: "results" });
  const [tick, setTick] = useState(0);
  const [marking, setMarking] = useState<string | null>(null);
  const tab = tabState.uuid === uuid ? tabState.tab : "results";
  useEffect(() => {
    if (!uuid) return;
    let live = true;
    Promise.all([api.get<Quiz>(`/lms/quizzes/${uuid}`), api.get<Results>(`/lms/quizzes/${uuid}/results`)])
      .then(([quiz, results]) => live && setState({ uuid, quiz, results })).catch((e) => { toast.error(e.message); onClose(); });
    return () => { live = false; };
  }, [uuid, tick, toast, onClose]);
  const d = state && state.uuid === uuid ? state : null;
  const qz = d?.quiz;
  async function setStatus(status: string) {
    try { await api.put(`/lms/quizzes/${uuid}`, { status }); toast.success(status === "published" ? "Published" : "Closed"); setTick((t) => t + 1); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't change it"); }
  }
  const cols: Column<Results["rows"][number]>[] = [
    { key: "name", header: term("student"), sortable: true, sortValue: (r) => r.name, cell: (r) => <div><p className="text-ink">{r.name}</p><p className="text-[12px] text-muted">{r.section_label}</p></div> },
    { key: "attempts", header: "Attempts", align: "right", hideBelow: "sm", cell: (r) => <span className="tabular text-muted">{r.attempts}{r.in_progress ? " +1 open" : ""}</span> },
    { key: "score", header: "Best score", align: "right", sortable: true, sortValue: (r) => r.percent ?? -1, cell: (r) => r.score != null ? <span className="tabular">{r.score} / {r.max_score} <span className="text-muted">({r.percent}%)</span></span> : <span className="text-faint">—</span> },
    { key: "state", header: "", cell: (r) => r.needs_marking ? <Badge tone="warn">To mark</Badge> : r.passed === true ? <Badge tone="good">Passed</Badge> : r.passed === false ? <Badge tone="bad">Below pass</Badge> : !r.attempts ? <Badge>Not attempted</Badge> : null },
  ];
  return (
    <>
      <Modal open={!!uuid} onClose={onClose} size="xl" title={qz?.title ?? "Quiz"} description={qz ? `${qz.subject_name} · ${qz.sections.map((s) => s.label).join(", ")}` : undefined}
        headerActions={qz && canTeach && <Button size="sm" icon={Pencil} onClick={() => onEdit(qz)}>Edit</Button>}
        footer={qz && canTeach ? <>{qz.status === "draft" && <Button variant="primary" icon={Send} onClick={() => setStatus("published")}>Publish</Button>}
          {qz.status === "published" && <Button onClick={() => setStatus("closed")}>Close now</Button>}</> : undefined}>
        {!d || !qz ? <Skeleton className="h-48 w-full" /> : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[["Status", WINDOW[qz.window]?.label], ["Attempted", `${d.results.summary.attempted} / ${d.results.summary.learners}`], ["Average", d.results.summary.average != null ? `${d.results.summary.average}%` : "—"],
                ["Highest", d.results.summary.highest != null ? `${d.results.summary.highest}%` : "—"], ["To mark", d.results.summary.to_mark]].map(([l, n]) => (
                <div key={l as string} className="rounded-xl border border-line px-4 py-3"><p className="text-[12px] text-muted">{l}</p><p className="tabular text-[19px] font-extralight text-ink">{n}</p></div>))}
            </div>
            <Tabs value={tab} onChange={(t) => setTab({ uuid, tab: t })} className="mb-4" items={[{ value: "results", label: "Results" }, { value: "items", label: "Item analysis", icon: BarChart3 }, { value: "about", label: "Questions", count: qz.question_count }]} />
            {tab === "results" && <DataTable rows={d.results.rows} rowKey={(r) => r.student_id} columns={cols} onRowClick={(r) => r.best_attempt_uuid && setMarking(r.best_attempt_uuid)} emptyTitle="No learners" />}
            {tab === "items" && (d.results.items.length === 0 ? <p className="text-[13.5px] text-muted">Item analysis appears once learners submit.</p> : (
              <ul className="space-y-3">
                {d.results.items.map((it, i) => (
                  <li key={it.question_id} className="rounded-xl border border-line p-4">
                    <div className="flex items-start justify-between gap-3"><p className="text-[13.5px] text-ink">{i + 1}. {it.prompt}</p><Badge tone={DIFF[it.difficulty]}>{it.difficulty}</Badge></div>
                    <p className="mt-1 text-[12.5px] text-muted">{it.seen} answered · {it.blank} left blank{it.correct_percent != null ? ` · ${it.correct_percent}% right` : ""}{it.average_percent != null ? ` · average ${it.average_percent}%` : ""}</p>
                    {it.correct_percent != null && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken"><div className={`h-full rounded-full ${it.correct_percent < 40 ? "bg-rose-400" : it.correct_percent < 70 ? "bg-amber-400" : "bg-emerald-500"}`} style={{ width: `${it.correct_percent}%` }} /></div>}
                    {it.options.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {it.options.map((o) => <li key={o.key} className="flex items-center gap-2 text-[12.5px]">
                          <span className={`w-5 ${o.is_answer ? "text-emerald-600" : "text-faint"}`}>{o.is_answer ? <Check size={13} strokeWidth={1.6} /> : o.key}</span>
                          <span className="flex-1 truncate text-ink/80">{o.text}</span><span className="tabular text-muted">{o.count}</span></li>)}
                      </ul>
                    )}
                  </li>))}
              </ul>
            ))}
            {tab === "about" && (
              <>
                <KeyValue columns={3} items={[{ label: "Time limit", value: qz.time_limit_min ? `${qz.time_limit_min} min` : "None" }, { label: "Attempts", value: qz.attempts_allowed },
                  { label: "Total marks", value: qz.mode === "random" ? "Depends on the draw" : qz.total_marks }, { label: "Opens", value: qz.opens_at ? formatDateTime(qz.opens_at) : "When published" },
                  { label: "Closes", value: qz.closes_at ? formatDateTime(qz.closes_at) : "No end" }, { label: "Answers shown", value: { after_submit: "After submitting", after_close: "After it closes", never: "Never" }[qz.show_answers] }]} />
                {qz.instructions && <Section title="Instructions" className="mt-4 border-t border-line"><RichText text={qz.instructions} /></Section>}
                <ol className="mt-4 space-y-2">{(qz.questions ?? []).map((x, i) => <li key={x.id} className="rounded-lg border border-line px-4 py-2.5 text-[13.5px] text-ink">{i + 1}. {x.prompt} <span className="text-muted">· {x.kind_label}</span></li>)}</ol>
              </>
            )}
          </>
        )}
      </Modal>
      <AttemptMarking uuid={marking} canTeach={canTeach} onClose={() => setMarking(null)} onSaved={() => { setMarking(null); setTick((t) => t + 1); }} />
    </>
  );
}

function formatAnswer(a: unknown, options: { key: string; text: string }[]): string {
  if (a == null || a === "") return "—";
  const byKey = Object.fromEntries(options.map((o) => [o.key, o.text]));
  if (Array.isArray(a)) return a.map((k) => byKey[String(k)] ?? String(k)).join(", ");
  if (typeof a === "object") { const o = a as { value?: string; tolerance?: string }; return `${o.value}${o.tolerance && Number(o.tolerance) ? ` ± ${o.tolerance}` : ""}`; }
  return byKey[String(a)] ?? String(a);
}

function AttemptMarking({ uuid, canTeach, onClose, onSaved }: { uuid: string | null; canTeach: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ uuid: string; a: Attempt } | null>(null);
  const [scores, setScores] = useState<Record<string, { score: number | null; feedback: string }>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!uuid) return;
    let live = true;
    api.get<Attempt>(`/lms/quiz-attempts/${uuid}`).then((a) => {
      if (!live) return;
      setState({ uuid, a });
      setScores(Object.fromEntries(a.items.filter((i) => i.kind === "long").map((i) => [String(i.question_id), { score: i.score != null ? Number(i.score) : null, feedback: i.feedback ?? "" }])));
    }).catch((e) => toast.error(e.message));
    return () => { live = false; };
  }, [uuid, toast]);
  const a = state && state.uuid === uuid ? state.a : null;
  async function save() {
    setSaving(true);
    try { await api.post(`/lms/quiz-attempts/${uuid}/mark`, { items: scores }); toast.success("Marks saved"); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }
  const hasLong = !!a?.items.some((i) => i.kind === "long");
  return (
    <Modal open={!!uuid} onClose={onClose} size="lg" busy={saving} title={a?.student_name ?? "Attempt"}
      description={a ? `Attempt ${a.attempt_no} · ${a.score != null ? `${a.score} / ${a.max_score}` : "not fully marked"}` : undefined}
      footer={canTeach && hasLong ? <><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Save marks</Button></> : undefined}>
      {!a ? <Skeleton className="h-40 w-full" /> : (
        <ol className="space-y-3">
          {a.items.map((it) => (
            <li key={it.question_id} className="rounded-xl border border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[13.5px] text-ink">{it.no}. {it.prompt}</p>
                {it.kind !== "long" && <Badge tone={it.correct ? "good" : "bad"}>{it.score ?? 0} / {it.marks}</Badge>}
              </div>
              <p className="mt-2 text-[13px] text-muted">Answer: <span className="text-ink">{formatAnswer(it.response, it.options)}</span></p>
              {it.kind !== "long" && <p className="text-[13px] text-muted">Right answer: <span className="text-ink">{formatAnswer(it.answer, it.options)}</span></p>}
              {it.kind === "long" && canTeach && (
                <div className="mt-3 grid gap-3 sm:grid-cols-[120px_1fr]">
                  <Field label={`Marks (of ${it.marks})`}><NumberInput value={scores[String(it.question_id)]?.score ?? null} min={0} max={Number(it.marks)} step={0.5}
                    onChange={(x) => setScores((s) => ({ ...s, [String(it.question_id)]: { ...(s[String(it.question_id)] ?? { feedback: "" }), score: x } }))} /></Field>
                  <Field label="Feedback"><TextInput value={scores[String(it.question_id)]?.feedback ?? ""}
                    onValueChange={(x) => setScores((s) => ({ ...s, [String(it.question_id)]: { ...(s[String(it.question_id)] ?? { score: null }), feedback: x } }))} /></Field>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

/* ── Question bank ─────────────────────────────────────────────────────── */

function QuestionBank({ newSignal }: { newSignal: number }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const { options } = useLmsOptions();
  const allocs = useMemo(() => options?.allocations ?? [], [options]);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; page: Page<Question> } | null>(null);
  const [formFor, setFormFor] = useState<Question | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const key = JSON.stringify({ q, filters, page, nonce });
  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ page: String(page), size: "25" });
    if (q) p.set("q", q);
    for (const [k, param] of [["subject", "subject_id"], ["kind", "kind"], ["difficulty", "difficulty"]] as const) if (filters[k]?.[0]) p.set(param, filters[k][0]);
    api.get<Page<Question>>(`/lms/questions?${p}`).then((r) => live && setData({ key, page: r }))
      .catch((e) => { if (live) { setData({ key, page: { items: [], total: 0, page: 1, size: 25 } }); toast.error(e.message); } });
    return () => { live = false; };
  }, [key, q, filters, page, toast]);
  const openForm = useCallback((x: Question | "new") => { setFormKey((k) => k + 1); setFormFor(x); setFormOpen(true); }, []);
  useEffect(() => { if (newSignal) Promise.resolve().then(() => openForm("new")); }, [newSignal, openForm]);
  const canTeach = !!options?.can_teach;
  async function remove(x: Question) {
    if (!(await confirm({ title: "Switch off this question?", message: "It stays in past quizzes but won't be used again.", confirmLabel: "Switch off", tone: "danger" }))) return;
    try { await api.delete(`/lms/questions/${x.uuid}`); toast.success("Switched off"); setNonce((n) => n + 1); } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't do that"); }
  }
  const columns: Column<Question>[] = [
    { key: "prompt", header: "Question", cell: (x) => <div className="min-w-0 max-w-xl"><p className="line-clamp-2 text-ink">{x.prompt}</p><p className="truncate text-[12.5px] text-muted">{x.subject_name}{x.topic ? ` · ${x.topic}` : ""}{x.tags.length ? ` · ${x.tags.join(", ")}` : ""}</p></div> },
    { key: "kind", header: "Type", hideBelow: "md", cell: (x) => <span className="text-muted">{x.kind_label}</span> },
    { key: "marks", header: "Marks", align: "right", hideBelow: "sm", cell: (x) => <span className="tabular text-muted">{Number(x.marks)}</span> },
    { key: "diff", header: "Difficulty", cell: (x) => <Badge tone={DIFF[x.difficulty]}>{x.difficulty}</Badge> },
  ];
  return (
    <>
      <FilterBar searchPlaceholder="Search questions" onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={[
          { key: "subject", label: term("subject"), options: subjectOptions(allocs).map((o) => ({ value: String(o.value), label: o.label })) },
          { key: "kind", label: "Type", options: QUESTION_KINDS.map((k) => ({ value: k.value, label: k.label })) },
          { key: "difficulty", label: "Difficulty", options: [{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }] },
        ]} values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={data?.page.items ?? []} rowKey={(x) => x.uuid} columns={columns} loading={data?.key !== key} onRowClick={canTeach ? openForm : undefined}
        rowActions={canTeach ? (x) => [{ label: "Edit", icon: Pencil, onSelect: () => openForm(x) }, "separator", { label: "Switch off", icon: Trash2, danger: true, onSelect: () => remove(x) }] : undefined}
        pagination={{ page, size: 25, total: data?.page.total ?? 0, onPageChange: setPage }}
        emptyIcon={ListChecks} emptyTitle="The bank is empty" emptyHint="Add questions once and reuse them in any quiz."
        emptyAction={canTeach && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New question</Button>} />
      <QuestionForm key={formKey} target={formFor} open={formOpen} onClose={() => setFormOpen(false)} onSaved={(again) => { setNonce((n) => n + 1); if (again) openForm("new"); else setFormOpen(false); }} />
    </>
  );
}

function QuestionForm({ target, open, onClose, onSaved }: { target: Question | "new"; open: boolean; onClose: () => void; onSaved: (again: boolean) => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const { options } = useLmsOptions();
  const editing = target !== "new" ? target : null;
  const ans = editing?.answer;
  const initial = {
    subject: editing?.subject_id ?? null as number | null, kind: (editing?.kind ?? "single") as QuestionKind, prompt: editing?.prompt ?? "",
    options: editing?.options?.length && editing.kind !== "true_false" ? editing.options.map((o) => o.text) : ["", "", "", ""],
    correct: Array.isArray(ans) && editing && ["single", "multiple"].includes(editing.kind) ? (ans as string[]).map((k) => k.charCodeAt(0) - 97) : [] as number[],
    tf: Array.isArray(ans) && editing?.kind === "true_false" ? String(ans[0]) : "true",
    accepted: Array.isArray(ans) && editing?.kind === "short" ? (ans as string[]).join("\n") : "",
    value: editing?.kind === "numeric" ? Number((ans as { value: string }).value) : null as number | null,
    tolerance: editing?.kind === "numeric" ? Number((ans as { tolerance: string }).tolerance) : 0 as number | null,
    marks: editing ? Number(editing.marks) : 1 as number | null, negative: editing ? Number(editing.negative_marks) : 0 as number | null,
    difficulty: editing?.difficulty ?? "medium", topic: editing?.topic ?? "", tags: editing?.tags.join(", ") ?? "", explanation: editing?.explanation ?? "",
  };
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((s) => ({ ...s, [k]: x }));
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const choice = v.kind === "single" || v.kind === "multiple";

  async function save(again: boolean) {
    if (!v.subject || !v.prompt.trim()) { toast.error(`Pick the ${term("subject").toLowerCase()} and write the question`); return; }
    const opts = v.options.map((t, i) => ({ key: String.fromCharCode(97 + i), text: t.trim() })).filter((o) => o.text);
    let answer: unknown = null;
    if (choice) answer = v.correct.map((i) => String.fromCharCode(97 + i)).filter((k) => opts.some((o) => o.key === k));
    else if (v.kind === "true_false") answer = [v.tf];
    else if (v.kind === "short") answer = v.accepted.split("\n").map((s) => s.trim()).filter(Boolean);
    else if (v.kind === "numeric") answer = { value: v.value, tolerance: v.tolerance ?? 0 };
    const body = { subject_id: v.subject, kind: v.kind, prompt: v.prompt.trim(), options: choice ? opts : [], answer, marks: v.marks || 1,
      negative_marks: v.negative || 0, difficulty: v.difficulty, topic: v.topic.trim() || null, explanation: v.explanation.trim() || null,
      tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean) };
    setSaving(true);
    try {
      if (editing) await api.put(`/lms/questions/${editing.uuid}`, body); else await api.post("/lms/questions", body);
      toast.success("Question saved"); onSaved(again);
    } catch (x) { toast.error("Couldn't save", { description: x instanceof Error ? x.message : undefined }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving} title={editing ? "Edit question" : "New question"}
      footer={<><ModalCancel />{!editing && <Button onClick={() => save(true)} loading={saving}>Save and add another</Button>}<Button variant="primary" onClick={() => save(false)} loading={saving}>Save</Button></>}>
      <div className="space-y-5">
        <FormGrid>
          <Field label={term("subject")} required><Select value={v.subject} onChange={(x) => set("subject", x)} options={subjectOptions(options?.allocations ?? [])} /></Field>
          <Field label="Type"><Select value={v.kind} onChange={(x) => x && set("kind", x)} options={QUESTION_KINDS} /></Field>
          <Field label="Question" required className="sm:col-span-2"><Textarea autoFocus value={v.prompt} onValueChange={(x) => set("prompt", x)} rows={3} autoGrow /></Field>
        </FormGrid>
        {choice && (
          <Field label="Options" hint={v.kind === "single" ? "Tick the right option" : "Tick every right option"}>
            <div className="space-y-2">
              {v.options.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Checkbox checked={v.correct.includes(i)} onChange={(c) => set("correct", v.kind === "single" ? (c ? [i] : []) : c ? [...v.correct, i] : v.correct.filter((x) => x !== i))} aria-label="Right answer" />
                  <span className="w-5 text-[13px] text-faint">{String.fromCharCode(97 + i)}</span>
                  <TextInput value={t} onValueChange={(x) => set("options", v.options.map((y, j) => j === i ? x : y))} className="flex-1" placeholder={`Option ${i + 1}`} />
                  {v.options.length > 2 && <button type="button" aria-label="Remove option" className="rounded p-1 text-faint hover:bg-sunken" onClick={() => { set("options", v.options.filter((_, j) => j !== i)); set("correct", v.correct.filter((x) => x !== i).map((x) => (x > i ? x - 1 : x))); }}><X size={14} strokeWidth={1.4} /></button>}
                </div>
              ))}
              {v.options.length < 8 && <Button size="sm" variant="ghost" icon={Plus} onClick={() => set("options", [...v.options, ""])}>Add option</Button>}
            </div>
          </Field>
        )}
        {v.kind === "true_false" && <Field label="The statement is"><RadioCards value={v.tf} onChange={(x) => set("tf", x)} options={[{ value: "true", label: "True" }, { value: "false", label: "False" }]} /></Field>}
        {v.kind === "short" && <Field label="Accepted answers" hint="One per line. Case and extra spaces don't matter."><Textarea value={v.accepted} onValueChange={(x) => set("accepted", x)} rows={3} /></Field>}
        {v.kind === "numeric" && (
          <FormGrid>
            <Field label="Right answer"><NumberInput value={v.value} onChange={(x) => set("value", x)} step={0.01} /></Field>
            <Field label="Accept within ±"><NumberInput value={v.tolerance} onChange={(x) => set("tolerance", x)} min={0} step={0.01} /></Field>
          </FormGrid>
        )}
        {v.kind === "long" && <p className="rounded-lg bg-sunken/60 px-4 py-3 text-[13px] text-muted">Long answers are marked by you after learners submit.</p>}
        <FormGrid columns={3}>
          <Field label="Marks"><NumberInput value={v.marks} onChange={(x) => set("marks", x)} min={0.5} step={0.5} /></Field>
          <Field label="Minus for wrong" aside="Optional"><NumberInput value={v.negative} onChange={(x) => set("negative", x)} min={0} step={0.25} /></Field>
          <Field label="Difficulty"><Select value={v.difficulty} onChange={(x) => x && set("difficulty", x)} options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} /></Field>
          <Field label="Topic" aside="Optional"><TextInput value={v.topic} onValueChange={(x) => set("topic", x)} /></Field>
          <Field label="Tags" aside="Comma separated" className="sm:col-span-2"><TextInput value={v.tags} onValueChange={(x) => set("tags", x)} placeholder="e.g. grade 8, revision" /></Field>
        </FormGrid>
        <Field label="Explanation" aside="Shown with the answers"><Textarea value={v.explanation} onValueChange={(x) => set("explanation", x)} rows={2} /></Field>
      </div>
    </Modal>
  );
}
