"use client";

/*
 * Learning admin: the question bank (single choice, multiple choice, true/false, short
 * answer) and assessments built from it (fixed questions or picked at random, timer,
 * attempts, pass mark, negative marking, when answers are shown).
 */
import { useEffect, useMemo, useState } from "react";
import { CircleHelp, ClipboardCheck, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, Checkbox, DataTable, Field, FilterBar, FormGrid, FormSection, IconButton, Modal, ModalCancel, MultiSelect, NumberInput,
  RadioCards, Select, TextInput, Textarea, Toggle, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { errText, useLoad } from "../shared";
import type { AssessmentBrief, Question, QuestionKind } from "../types";

const KIND_LABEL: Record<QuestionKind, string> = { single: "Single choice", multi: "Multiple choice", true_false: "True / false", short: "Short answer" };

export function QuestionsTab() {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const q = new URLSearchParams();
  if (search) q.set("q", search);
  if (filters.category?.[0]) q.set("category", filters.category[0]);
  const { data, loading, refresh } = useLoad<Question[]>(`/learning/questions?${q}`, "Couldn't load questions");
  const cats = useLoad<{ category: string; count: number }[]>("/learning/questions/categories");
  const [editing, setEditing] = useState<Question | null | "new">(null);
  const rows = (data ?? []).filter((x) => !filters.kind?.[0] || x.kind === filters.kind[0]);

  const columns: Column<Question>[] = [
    { key: "text", header: "Question", cell: (x) => <p className="line-clamp-2 max-w-xl text-ink/90">{x.text}</p> },
    { key: "kind", header: "Type", hideBelow: "md", cell: (x) => <span className="text-muted">{KIND_LABEL[x.kind]}</span> },
    { key: "category", header: "Category", cell: (x) => <Badge>{x.category}</Badge> },
    { key: "difficulty", header: "Difficulty", hideBelow: "lg", cell: (x) => <span className="text-muted">{x.difficulty[0].toUpperCase() + x.difficulty.slice(1)}</span> },
    { key: "marks", header: "Marks", align: "right", cell: (x) => <span className="tabular">{x.marks}</span> },
    { key: "active", header: "", cell: (x) => (x.active ? null : <Badge>Off</Badge>) },
  ];

  return (
    <>
      <FilterBar searchPlaceholder="Search questions" onSearchChange={setSearch} values={filters} onChange={setFilters}
        filters={[
          { key: "category", label: "Category", options: (cats.data ?? []).map((c) => ({ value: c.category, label: `${c.category} (${c.count})` })) },
          { key: "kind", label: "Type", options: Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })) },
        ]}
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Add question</Button>} />
      <DataTable rows={rows} rowKey={(x) => x.uuid} columns={columns} loading={loading} onRowClick={(x) => setEditing(x)}
        rowActions={(x) => [{ label: "Edit", icon: Pencil, onSelect: () => setEditing(x) }]}
        emptyIcon={CircleHelp} emptyTitle="No questions yet" emptyHint="Questions here can be used in any assessment." />
      <QuestionModal open={editing !== null} question={editing === "new" ? null : editing} categories={(cats.data ?? []).map((c) => c.category)}
        onClose={() => setEditing(null)} onSaved={() => { refresh(); cats.refresh(); }} />
    </>
  );
}

type Opt = { id?: string; text: string; correct: boolean };

function QuestionModal({ open, question, categories, onClose, onSaved }: { open: boolean; question: Question | null; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<QuestionKind>("single");
  const [text, setText] = useState("");
  const [category, setCategory] = useState("General");
  const [difficulty, setDifficulty] = useState("medium");
  const [marks, setMarks] = useState<number | null>(1);
  const [opts, setOpts] = useState<Opt[]>([]);
  const [tf, setTf] = useState("true");
  const [accepted, setAccepted] = useState("");
  const [explanation, setExplanation] = useState("");
  const [active, setActive] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const q = question;
    setKind(q?.kind ?? "single"); setText(q?.text ?? ""); setCategory(q?.category ?? "General"); setDifficulty(q?.difficulty ?? "medium");
    setMarks(q?.marks ?? 1); setExplanation(q?.explanation ?? ""); setActive(q?.active ?? true);
    setOpts(q && ["single", "multi"].includes(q.kind) ? q.options.map((o) => ({ id: o.id, text: o.text, correct: !!o.correct })) : [{ text: "", correct: true }, { text: "", correct: false }, { text: "", correct: false }]);
    setTf(q?.kind === "true_false" ? (q.options.find((o) => o.correct)?.id ?? "true") : "true");
    setAccepted((q?.accepted_answers ?? []).join("\n"));
    setDirty(false);
  }, [open, question]);

  const touch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirty(true); };
  const catOptions = useMemo(() => Array.from(new Set(["General", ...categories, category])).map((c) => ({ value: c, label: c })), [categories, category]);

  async function save() {
    setSaving(true);
    try {
      const body = { kind, text, category, difficulty, marks, explanation: explanation || null, active,
        options: kind === "single" || kind === "multi" ? opts : [], answer: kind === "true_false" ? tf : null,
        accepted_answers: kind === "short" ? accepted.split("\n").map((a) => a.trim()).filter(Boolean) : [] };
      if (question) await api.put(`/learning/questions/${question.uuid}`, body); else await api.post("/learning/questions", body);
      toast.success(question ? "Question saved" : "Question added"); setDirty(false); onSaved(); onClose();
    } catch (e) { toast.error("Couldn't save the question", { description: errText(e) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={question ? "Edit question" : "Add question"} dirty={dirty} busy={saving}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!text.trim()} onClick={save}>{question ? "Save" : "Add question"}</Button></>}>
      <div className="space-y-5">
        <RadioCards columns={2} value={kind} onChange={touch((v: string) => setKind(v as QuestionKind))}
          options={(Object.keys(KIND_LABEL) as QuestionKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
        <Field label="Question" required><Textarea value={text} onValueChange={touch(setText)} rows={2} autoGrow /></Field>
        {(kind === "single" || kind === "multi") && (
          <div>
            <p className="mb-2 text-[13.5px] text-ink">Options <span className="text-muted">· tick the right answer{kind === "multi" ? "s" : ""}</span></p>
            <div className="space-y-2">
              {opts.map((o, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Checkbox checked={o.correct} aria-label="Right answer"
                    onChange={touch((x: boolean) => setOpts(opts.map((p, j) => (kind === "single" ? { ...p, correct: j === i ? x : false } : j === i ? { ...p, correct: x } : p))))} />
                  <TextInput value={o.text} onValueChange={touch((x: string) => setOpts(opts.map((p, j) => (j === i ? { ...p, text: x } : p))))} placeholder={`Option ${String.fromCharCode(65 + i)}`} className="flex-1" />
                  <IconButton icon={Trash2} size="sm" label="Remove option" disabled={opts.length <= 2} onClick={() => { setOpts(opts.filter((_, j) => j !== i)); setDirty(true); }} />
                </div>
              ))}
            </div>
            {opts.length < 8 && <Button className="mt-2" size="sm" variant="secondary" icon={Plus} onClick={() => { setOpts([...opts, { text: "", correct: false }]); setDirty(true); }}>Add option</Button>}
          </div>
        )}
        {kind === "true_false" && (
          <Field label="Right answer"><RadioCards columns={2} value={tf} onChange={touch(setTf)} options={[{ value: "true", label: "True" }, { value: "false", label: "False" }]} /></Field>
        )}
        {kind === "short" && (
          <Field label="Accepted answers" hint="One per line. Case and extra spaces don't matter.">
            <Textarea value={accepted} onValueChange={touch(setAccepted)} rows={3} />
          </Field>
        )}
        <FormGrid columns={3}>
          <Field label="Category"><Select value={category} onChange={(x) => { setCategory(x ?? "General"); setDirty(true); }} options={catOptions} onCreate={async (t) => ({ value: t, label: t })} /></Field>
          <Field label="Difficulty"><Select value={difficulty} onChange={(x) => { setDifficulty(x ?? "medium"); setDirty(true); }} options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} /></Field>
          <Field label="Marks"><NumberInput value={marks} onChange={touch(setMarks)} min={0.5} step={0.5} /></Field>
        </FormGrid>
        <Field label="Explanation" hint="Shown with the answers after the attempt"><Textarea value={explanation} onValueChange={touch(setExplanation)} rows={2} /></Field>
        <Toggle checked={active} onChange={touch(setActive)} label="In use" description="Switched-off questions aren't picked for new attempts." />
      </div>
    </Modal>
  );
}

/* ── Assessments ───────────────────────────────────────────────────────── */

export function AssessmentsTab() {
  const { data, loading, refresh } = useLoad<AssessmentBrief[]>("/learning/assessments", "Couldn't load assessments");
  const [editing, setEditing] = useState<AssessmentBrief | null | "new">(null);
  const columns: Column<AssessmentBrief>[] = [
    { key: "title", header: "Assessment", cell: (a) => <div><p className="text-ink">{a.title}</p>{a.description && <p className="line-clamp-1 text-[12.5px] text-muted">{a.description}</p>}</div> },
    { key: "q", header: "Questions", cell: (a) => <span className="text-ink/80">{a.question_count} {a.selection === "random" ? "at random" : "fixed"}</span> },
    { key: "pass", header: "Pass mark", align: "right", cell: (a) => <span className="tabular">{a.pass_pct}%</span> },
    { key: "time", header: "Time", hideBelow: "md", cell: (a) => a.time_limit_minutes ? `${a.time_limit_minutes} min` : <span className="text-faint">No limit</span> },
    { key: "att", header: "Attempts", hideBelow: "md", cell: (a) => a.max_attempts ?? <span className="text-faint">Unlimited</span> },
    { key: "neg", header: "Negative marking", hideBelow: "lg", cell: (a) => a.negative_marking === "none" ? <span className="text-faint">None</span> : a.negative_marking === "fixed" ? `−${a.negative_value} per wrong answer` : `−${a.negative_value}% of marks` },
    { key: "status", header: "Status", cell: (a) => <Badge tone={a.status === "published" ? "good" : "neutral"} dot>{a.status === "published" ? "Published" : "Draft"}</Badge> },
  ];
  return (
    <>
      <div className="mb-4 flex justify-end"><Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Add assessment</Button></div>
      <DataTable rows={data ?? []} rowKey={(a) => a.uuid} columns={columns} loading={loading} onRowClick={(a) => setEditing(a)}
        rowActions={(a) => [{ label: "Edit", icon: Pencil, onSelect: () => setEditing(a) }]}
        emptyIcon={ClipboardCheck} emptyTitle="No assessments yet" emptyHint="Add questions to the bank first, then build a quiz from them." />
      <AssessmentModal open={editing !== null} assessment={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />
    </>
  );
}

type ADraft = {
  title: string; description: string; selection: "fixed" | "random"; question_ids: number[]; count: number | null; categories: string[];
  difficulty: string | null; time_limit_minutes: number | null; max_attempts: number | null; pass_pct: number | null;
  negative_marking: "none" | "fixed" | "percent"; negative_value: number | null; shuffle: boolean; show_answers: string; final_score: string; status: string;
};

function AssessmentModal({ open, assessment, onClose, onSaved }: { open: boolean; assessment: AssessmentBrief | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<ADraft | null>(null);
  const [bank, setBank] = useState<Question[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get<Question[]>("/learning/questions").then((r) => setBank(r ?? [])).catch(() => {});
    const a = assessment;
    setV({
      title: a?.title ?? "", description: a?.description ?? "", selection: a?.selection ?? "fixed", question_ids: a?.question_ids ?? [],
      count: a?.random_rule?.count ?? 10, categories: a?.random_rule?.categories ?? [], difficulty: a?.random_rule?.difficulty ?? null,
      time_limit_minutes: a?.time_limit_minutes ?? null, max_attempts: a?.max_attempts ?? null, pass_pct: a?.pass_pct ?? 60,
      negative_marking: a?.negative_marking ?? "none", negative_value: a?.negative_value ?? 0, shuffle: a?.shuffle ?? true,
      show_answers: a?.show_answers ?? "after_submit", final_score: a?.final_score ?? "highest", status: a?.status ?? "published",
    });
    setDirty(false);
  }, [open, assessment]);

  const set = <K extends keyof ADraft>(k: K, val: ADraft[K]) => { setV((c) => (c ? { ...c, [k]: val } : c)); setDirty(true); };
  const categories = useMemo(() => Array.from(new Set(bank.map((q) => q.category))).map((c) => ({ value: c, label: `${c} (${bank.filter((q) => q.category === c && q.active).length})` })), [bank]);
  const qOptions: SelectOption<number>[] = bank.filter((q) => q.active).map((q) => ({ value: q.id, label: q.text.slice(0, 120), description: `${q.category} · ${KIND_LABEL[q.kind]} · ${q.marks} mark${q.marks === 1 ? "" : "s"}` }));
  const pool = bank.filter((q) => q.active && (!v?.categories.length || v.categories.includes(q.category)) && (!v?.difficulty || q.difficulty === v.difficulty)).length;

  async function save() {
    if (!v) return;
    setSaving(true);
    try {
      const body = { title: v.title, description: v.description || null, selection: v.selection, question_ids: v.question_ids,
        random_rule: { count: v.count, categories: v.categories, difficulty: v.difficulty }, time_limit_minutes: v.time_limit_minutes,
        max_attempts: v.max_attempts, pass_pct: v.pass_pct, negative_marking: v.negative_marking, negative_value: v.negative_value ?? 0,
        shuffle: v.shuffle, show_answers: v.show_answers, final_score: v.final_score, status: v.status };
      if (assessment) await api.put(`/learning/assessments/${assessment.uuid}`, body); else await api.post("/learning/assessments", body);
      toast.success(assessment ? "Assessment saved" : "Assessment added"); setDirty(false); onSaved(); onClose();
    } catch (e) { toast.error("Couldn't save the assessment", { description: errText(e) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={assessment ? `Edit ${assessment.title}` : "Add assessment"} dirty={dirty} busy={saving}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!v?.title.trim()} onClick={save}>{assessment ? "Save" : "Add assessment"}</Button></>}>
      {v && (
        <div className="space-y-8">
          <FormSection title="Basics">
            <div className="space-y-5">
              <Field label="Title" required><TextInput value={v.title} onValueChange={(x) => set("title", x)} autoFocusInModal /></Field>
              <Field label="Instructions"><Textarea value={v.description} onValueChange={(x) => set("description", x)} rows={2} /></Field>
            </div>
          </FormSection>
          <FormSection title="Questions">
            <RadioCards columns={2} value={v.selection} onChange={(x) => set("selection", x as ADraft["selection"])}
              options={[{ value: "fixed", label: "Fixed questions", description: "Everyone gets the questions you pick." }, { value: "random", label: "Random from the bank", description: "Each attempt gets a fresh set." }]} />
            <div className="mt-5">
              {v.selection === "fixed" ? (
                <Field label="Questions" hint={`${v.question_ids.length} picked`}><MultiSelect value={v.question_ids} onChange={(x) => set("question_ids", x)} options={qOptions} placeholder="Search the question bank" /></Field>
              ) : (
                <FormGrid columns={3}>
                  <Field label="How many" hint={`${pool} matching in the bank`}><NumberInput value={v.count} onChange={(x) => set("count", x)} min={1} /></Field>
                  <Field label="From categories"><MultiSelect value={v.categories} onChange={(x) => set("categories", x)} options={categories} placeholder="Any category" /></Field>
                  <Field label="Difficulty"><Select value={v.difficulty} onChange={(x) => set("difficulty", x)} clearable placeholder="Any" options={[{ value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} /></Field>
                </FormGrid>
              )}
            </div>
          </FormSection>
          <FormSection title="Rules">
            <FormGrid columns={3}>
              <Field label="Pass mark"><NumberInput value={v.pass_pct} onChange={(x) => set("pass_pct", x)} min={0} max={100} suffix="%" /></Field>
              <Field label="Time limit" hint="Empty for no limit"><NumberInput value={v.time_limit_minutes} onChange={(x) => set("time_limit_minutes", x)} min={1} suffix="min" /></Field>
              <Field label="Attempts" hint="Empty for unlimited"><NumberInput value={v.max_attempts} onChange={(x) => set("max_attempts", x)} min={1} /></Field>
              <Field label="Negative marking"><Select value={v.negative_marking} onChange={(x) => set("negative_marking", (x ?? "none") as ADraft["negative_marking"])}
                options={[{ value: "none", label: "None" }, { value: "fixed", label: "Fixed marks per wrong answer" }, { value: "percent", label: "% of the question's marks" }]} /></Field>
              {v.negative_marking !== "none" && <Field label={v.negative_marking === "fixed" ? "Marks lost" : "Share lost"}><NumberInput value={v.negative_value} onChange={(x) => set("negative_value", x)} min={0} step={v.negative_marking === "fixed" ? 0.25 : 5} suffix={v.negative_marking === "percent" ? "%" : "marks"} /></Field>}
              <Field label="Score that counts"><Select value={v.final_score} onChange={(x) => set("final_score", x ?? "highest")} options={[{ value: "highest", label: "Best attempt" }, { value: "latest", label: "Latest attempt" }]} /></Field>
              <Field label="Show answers"><Select value={v.show_answers} onChange={(x) => set("show_answers", x ?? "after_submit")} options={[{ value: "after_submit", label: "After each attempt" }, { value: "after_pass", label: "Only after passing" }, { value: "never", label: "Never" }]} /></Field>
            </FormGrid>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Toggle checked={v.shuffle} onChange={(x) => set("shuffle", x)} label="Shuffle the questions" />
              <Toggle checked={v.status === "published"} onChange={(x) => set("status", x ? "published" : "draft")} label="Published" description="Learners can take it." />
            </div>
          </FormSection>
        </div>
      )}
    </Modal>
  );
}
