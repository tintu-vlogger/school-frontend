"use client";

/*
 * Survey builder: details, questions (with a live preview) and who / when, in one modal.
 *   <SurveyBuilderModal open uuid={null | uuid} start="enps" onClose onSaved />
 * Questions can't change once a survey has opened (copy it to make a new version).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignLeft, ArrowDown, ArrowUp, CheckSquare, CircleDot, Copy, Eye, Gauge, Lock, Plus, SlidersHorizontal, Star, Trash2, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { toISODate } from "@/components/ui-kit";
import { useToast } from "@/lib/toast-context";
import {
  Button, DateInput, Field, FormGrid, IconButton, Modal, NumberInput, RadioCards, Select, Skeleton, Tabs, TextInput, Textarea, Toggle,
} from "@/components/ui-kit";
import { COVER_PRESETS, PresetArt } from "./art";
import { AudiencePicker } from "./audience-picker";
import { QuestionInput, type Question } from "./survey-take";
import { RECURRENCE_LABEL, type SurveyDetail, type SurveysMeta } from "./survey-types";
import type { Audience } from "./types";

type QType = Question["qtype"];
type Draft = { key: string; uuid?: string; qtype: QType; text: string; help_text: string; required: boolean; options: string[]; settings: Question["settings"] };
type Form = {
  title: string; kind: "survey" | "pulse" | "enps"; description: string; thank_you: string; preset: string | null;
  identity: "anonymous" | "optional" | "named"; min_responses: number | null; audience: Audience; mandatory: boolean;
  reminder_every_days: number | null; open_mode: "now" | "later"; opens_on: string; duration_days: number | null;
  recurrence: string; recurrence_count: number | null; post_to_buzz: boolean;
};

const QICON: Record<QType, typeof Star> = { single: CircleDot, multi: CheckSquare, rating: Star, scale: SlidersHorizontal, text: AlignLeft, enps: Gauge };
let seq = 0;
const key = () => `q${++seq}`;

function blank(qtype: QType): Draft {
  const base = { key: key(), qtype, text: "", help_text: "", required: true, options: [] as string[], settings: {} as Question["settings"] };
  if (qtype === "single" || qtype === "multi") return { ...base, options: ["", ""] };
  if (qtype === "rating") return { ...base, settings: { max: 5 } };
  if (qtype === "scale") return { ...base, settings: { points: 5, low_label: "Strongly disagree", high_label: "Strongly agree" } };
  if (qtype === "enps") return { ...base, text: "How likely are you to recommend us as a place to work to a friend?", settings: { low_label: "Not at all likely", high_label: "Extremely likely" } };
  return { ...base, required: false, settings: { long: true } };
}

const STARTERS: Record<string, { title: string; description: string; questions: () => Draft[] }> = {
  enps: {
    title: "Employee Net Promoter Score", description: "Two quick questions. Your answers are anonymous.",
    questions: () => [blank("enps"), { ...blank("text"), text: "What is the main reason for your score?" }],
  },
  pulse: {
    title: "Pulse check", description: "A one-minute check-in on how things are going.",
    questions: () => [
      { ...blank("scale"), text: "I feel recognised for the work I do." },
      { ...blank("scale"), text: "I have the tools and support I need to do my job well." },
      { ...blank("rating"), text: "How would you rate your work–life balance this month?" },
      { ...blank("text"), text: "Anything else on your mind?" },
    ],
  },
  survey: { title: "", description: "", questions: () => [] },
};

const empty = (kind: Form["kind"] = "survey"): Form => ({
  title: STARTERS[kind].title, kind, description: STARTERS[kind].description, thank_you: "", preset: kind === "enps" ? "lavender" : kind === "pulse" ? "meadow" : "ocean",
  identity: kind === "survey" ? "optional" : "anonymous", min_responses: 5, audience: { all: true }, mandatory: false, reminder_every_days: 3,
  open_mode: "now", opens_on: "", duration_days: kind === "pulse" ? 5 : 14, recurrence: kind === "enps" ? "quarterly" : "none", recurrence_count: null,
  post_to_buzz: true,
});

function toQuestion(d: Draft): Question {
  return { uuid: d.key, qtype: d.qtype, text: d.text || "Your question", help_text: d.help_text || null, required: d.required, options: d.options.filter(Boolean).length ? d.options.filter(Boolean) : ["Choice 1", "Choice 2"], settings: d.settings };
}

function QuestionEditor({ d, index, count, locked, onChange, onMove, onRemove, onCopy, active, onFocus }: {
  d: Draft; index: number; count: number; locked: boolean; active: boolean;
  onChange: (d: Draft) => void; onMove: (dir: -1 | 1) => void; onRemove: () => void; onCopy: () => void; onFocus: () => void;
}) {
  const Icon = QICON[d.qtype];
  const set = (patch: Partial<Draft>) => onChange({ ...d, ...patch });
  const setS = (patch: Partial<Question["settings"]>) => set({ settings: { ...d.settings, ...patch } });
  return (
    <div onFocusCapture={onFocus} onClick={onFocus}
      className={`rounded-2xl border bg-surface p-4 transition-shadow ${active ? "border-primary/50 shadow-[0_0_0_3px_rgba(99,102,241,.12)]" : "border-line"}`}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon size={15} strokeWidth={1.6} /></span>
        <span className="text-[12px] uppercase tracking-[0.08em] text-faint">Question {index + 1}</span>
        {!locked && (
          <span className="ml-auto flex items-center gap-0.5">
            <IconButton icon={ArrowUp} label="Move up" size="sm" disabled={index === 0} onClick={() => onMove(-1)} />
            <IconButton icon={ArrowDown} label="Move down" size="sm" disabled={index === count - 1} onClick={() => onMove(1)} />
            {d.qtype !== "enps" && <IconButton icon={Copy} label="Duplicate" size="sm" onClick={onCopy} />}
            <IconButton icon={Trash2} label="Remove" size="sm" onClick={onRemove} />
          </span>
        )}
      </div>
      <div className="space-y-3">
        <TextInput value={d.text} onValueChange={(v) => set({ text: v })} placeholder="Write the question" maxLength={500} disabled={locked} aria-label="Question" />
        <TextInput value={d.help_text} onValueChange={(v) => set({ help_text: v })} placeholder="Help text (optional)" maxLength={300} disabled={locked} aria-label="Help text" className="text-[13px]" />
        {(d.qtype === "single" || d.qtype === "multi") && (
          <div className="space-y-1.5">
            {d.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={`h-3.5 w-3.5 shrink-0 border border-line-strong ${d.qtype === "single" ? "rounded-full" : "rounded"}`} />
                <TextInput value={o} onValueChange={(v) => set({ options: d.options.map((x, j) => (j === i ? v : x)) })} placeholder={`Choice ${i + 1}`} maxLength={200} disabled={locked} className="flex-1" aria-label={`Choice ${i + 1}`} />
                {!locked && d.options.length > 2 && <IconButton icon={X} label="Remove choice" size="sm" onClick={() => set({ options: d.options.filter((_, j) => j !== i) })} />}
              </div>
            ))}
            {!locked && d.options.length < 20 && <button type="button" onClick={() => set({ options: [...d.options, ""] })} className="ml-5 text-[13px] text-primary hover:underline">+ Add choice</button>}
          </div>
        )}
        {d.qtype === "rating" && (
          <Field label="Stars"><Select value={d.settings.max ?? 5} onChange={(v) => setS({ max: v ?? 5 })} disabled={locked} options={[3, 4, 5, 7, 10].map((n) => ({ value: n, label: `${n} stars` }))} className="w-40" /></Field>
        )}
        {d.qtype === "scale" && (
          <FormGrid columns={3}>
            <Field label="Points"><Select value={d.settings.points ?? 5} onChange={(v) => setS({ points: v ?? 5 })} disabled={locked} options={[3, 4, 5, 7, 10].map((n) => ({ value: n, label: `${n} points` }))} /></Field>
            <Field label="Low end"><TextInput value={d.settings.low_label ?? ""} onValueChange={(v) => setS({ low_label: v })} maxLength={60} disabled={locked} /></Field>
            <Field label="High end"><TextInput value={d.settings.high_label ?? ""} onValueChange={(v) => setS({ high_label: v })} maxLength={60} disabled={locked} /></Field>
          </FormGrid>
        )}
        {d.qtype === "enps" && (
          <p className="rounded-lg bg-violet-50 px-3 py-2 text-[12.5px] text-violet-800">Scored 0 to 10. Promoters answer 9–10, passives 7–8, detractors 0–6. eNPS = % promoters − % detractors.</p>
        )}
        {d.qtype === "text" && (
          <Toggle size="sm" checked={d.settings.long !== false} onChange={(v) => setS({ long: v })} disabled={locked} label="Long answer" />
        )}
        {d.qtype !== "enps" && <Toggle size="sm" checked={d.required} onChange={(v) => set({ required: v })} disabled={locked} label="Answer required" />}
      </div>
    </div>
  );
}

export function SurveyBuilderModal({ open, uuid, start = "survey", onClose, onSaved }: {
  open: boolean; uuid: string | null; start?: "survey" | "pulse" | "enps"; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [meta, setMeta] = useState<SurveysMeta | null>(null);
  const [form, setForm] = useState<Form>(empty());
  const [questions, setQuestions] = useState<Draft[]>([]);
  const [detail, setDetail] = useState<SurveyDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"questions" | "details" | "audience">("questions");
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [dirty, setDirty] = useState(false);
  const [coverTouched, setCoverTouched] = useState(false);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  useEffect(() => { api.get<SurveysMeta>("/engagement/surveys/meta").then(setMeta).catch(() => {}); }, []);
  useEffect(() => {
    if (!open) return;
    setTab("questions"); setActive(0); setDirty(false); setCoverTouched(false);
    if (!uuid) {
      setDetail(null); setForm(empty(start)); setQuestions(STARTERS[start].questions());
      return;
    }
    setLoading(true);
    api.get<SurveyDetail>(`/engagement/surveys/${uuid}`).then((d) => {
      setDetail(d);
      const opens = d.status === "draft" && d.opens_at && new Date(d.opens_at) > new Date() ? toISODate(new Date(d.opens_at)) : "";
      setForm({
        title: d.title, kind: d.kind, description: d.description ?? "", thank_you: d.thank_you ?? "", preset: d.cover?.preset ?? null,
        identity: d.identity, min_responses: d.min_responses, audience: d.audience ?? { all: true }, mandatory: d.mandatory,
        reminder_every_days: d.reminder_every_days, open_mode: opens ? "later" : "now", opens_on: opens, duration_days: d.duration_days,
        recurrence: d.recurrence, recurrence_count: d.recurrence_count, post_to_buzz: d.post_to_buzz,
      });
      setQuestions(d.questions.map((q) => ({ key: key(), uuid: q.uuid, qtype: q.qtype, text: q.text, help_text: q.help_text ?? "", required: q.required, options: [...q.options], settings: { ...q.settings } })));
    }).catch((e) => { toast.error((e as Error).message); closeRef.current(); }).finally(() => setLoading(false));
  }, [open, uuid, start, toast]);

  const locked = !!detail && detail.status !== "draft";
  const max = meta?.max_questions[form.kind] ?? 60;
  const set = (patch: Partial<Form>) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };
  const setQs = (qs: Draft[]) => { setQuestions(qs); setDirty(true); };
  const hasEnps = questions.some((q) => q.qtype === "enps");
  const preview = questions[active] ?? questions[0];
  const [previewValue, setPreviewValue] = useState<string | number | string[] | undefined>(undefined);
  useEffect(() => setPreviewValue(undefined), [active, preview?.qtype]);

  const qtypes = useMemo(() => Object.entries(meta?.question_types ?? { single: "Single choice", multi: "Multiple choice", rating: "Star rating", scale: "Agreement scale", text: "Text answer", enps: "eNPS (0–10)" }) as [QType, string][], [meta]);

  function addQuestion(qtype: QType) {
    const qs = [...questions, blank(qtype)];
    setQs(qs); setActive(qs.length - 1);
  }

  async function save(action: "draft" | "publish") {
    if (!form.title.trim()) { toast.error("Give the survey a title."); setTab("details"); return; }
    setBusy(action);
    const body: Record<string, unknown> = {
      title: form.title, kind: form.kind, description: form.description, thank_you: form.thank_you, identity: form.identity,
      min_responses: form.identity === "named" ? undefined : form.min_responses, audience: form.audience, mandatory: form.mandatory,
      reminder_every_days: form.reminder_every_days || null, duration_days: form.duration_days, recurrence: form.recurrence,
      recurrence_count: form.recurrence === "none" ? null : form.recurrence_count, post_to_buzz: form.post_to_buzz,
    };
    if (!locked) {
      body.opens_at = form.open_mode === "later" && form.opens_on ? new Date(`${form.opens_on}T09:00:00`).toISOString() : null;
      body.questions = questions.map((q) => ({
        uuid: q.uuid, qtype: q.qtype, text: q.text, help_text: q.help_text || null, required: q.qtype === "enps" ? true : q.required,
        options: q.options.map((o) => o.trim()).filter(Boolean), settings: q.settings,
      }));
      body.action = action;
    }
    if (!uuid || coverTouched) body.cover = form.preset ? { preset: form.preset } : null;
    if (body.min_responses === undefined) delete body.min_responses;
    try {
      if (uuid) await api.put(`/engagement/surveys/${uuid}`, body);
      else await api.post("/engagement/surveys", body);
      toast.success(action === "publish" ? (form.open_mode === "later" && form.opens_on ? "Survey scheduled" : "Survey published") : "Saved");
      setDirty(false); onSaved(); onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  }

  const tabItems = [
    { value: "questions" as const, label: "Questions", count: questions.length },
    { value: "details" as const, label: "Details" },
    { value: "audience" as const, label: "Who and when" },
  ];

  return (
    <Modal open={open} onClose={onClose} size="full" flush dirty={dirty} busy={!!busy} bodyClassName="bg-canvas"
      title={uuid ? (locked ? "Survey settings" : "Edit survey") : "New survey"}
      description={locked ? "Questions are fixed once a survey opens. Copy it to make a new version." : `${questions.length} of ${max} questions`}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <span className="hidden text-[12.5px] text-faint sm:block">{form.identity === "named" ? "Names are shown with answers." : `Results show after ${form.min_responses ?? 5} responses.`}</span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={() => save("draft")} loading={busy === "draft"}>{locked ? "Save changes" : "Save draft"}</Button>
            {!locked && <Button variant="primary" onClick={() => save("publish")} loading={busy === "publish"} disabled={!questions.length}>
              {form.open_mode === "later" && form.opens_on ? "Schedule" : "Publish"}
            </Button>}
          </div>
        </div>
      }>
      {loading ? <div className="space-y-3 p-6"><Skeleton className="h-24" /><Skeleton className="h-48" /></div> : (
        <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0 border-line lg:border-r">
            <div className="sticky top-0 z-10 border-b border-line bg-surface px-6"><Tabs value={tab} onChange={setTab} items={tabItems} /></div>
            <div className="space-y-4 p-6">
              {tab === "questions" && (
                <>
                  {locked && <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-[13px] text-amber-800"><Lock size={14} /> This survey has opened, so its questions can&apos;t change.</p>}
                  {questions.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
                      <p className="text-[15px] text-ink">Start with a question</p>
                      <p className="mt-1 text-[13px] text-muted">Pick a type below. Keep it short: five good questions beat twenty.</p>
                    </div>
                  )}
                  {questions.map((d, i) => (
                    <QuestionEditor key={d.key} d={d} index={i} count={questions.length} locked={locked} active={active === i} onFocus={() => setActive(i)}
                      onChange={(x) => setQs(questions.map((q) => (q.key === d.key ? x : q)))}
                      onMove={(dir) => { const qs = [...questions]; [qs[i], qs[i + dir]] = [qs[i + dir], qs[i]]; setQs(qs); setActive(i + dir); }}
                      onRemove={() => { setQs(questions.filter((q) => q.key !== d.key)); setActive(Math.max(0, i - 1)); }}
                      onCopy={() => { const qs = [...questions]; qs.splice(i + 1, 0, { ...d, key: key(), uuid: undefined, options: [...d.options], settings: { ...d.settings } }); setQs(qs); setActive(i + 1); }} />
                  ))}
                  {!locked && questions.length < max && (
                    <div className="rounded-2xl border border-line bg-surface p-3">
                      <p className="px-1 pb-2 text-[12px] uppercase tracking-[0.08em] text-faint">Add a question</p>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {qtypes.filter(([t]) => t !== "enps" || !hasEnps).map(([t, label]) => {
                          const Icon = QICON[t];
                          return (
                            <button key={t} type="button" onClick={() => addQuestion(t)}
                              className="flex items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-left text-[13.5px] text-ink transition-colors hover:border-primary/40 hover:bg-primary-soft">
                              <Icon size={16} strokeWidth={1.5} className="text-primary" /> {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {tab === "details" && (
                <div className="space-y-5 rounded-2xl border border-line bg-surface p-5">
                  <Field label="Title" required><TextInput value={form.title} onValueChange={(v) => set({ title: v })} maxLength={200} placeholder="e.g. Quarterly engagement survey" /></Field>
                  <Field label="Type">
                    <RadioCards columns={3} value={form.kind} onChange={(v) => {
                      set({ kind: v as Form["kind"] });
                      if (!locked && questions.length === 0) setQuestions(STARTERS[v].questions());
                    }} options={[
                      { value: "survey", label: "Survey", description: "Up to 60 questions", icon: AlignLeft },
                      { value: "pulse", label: "Pulse check", description: "Up to 10, quick and frequent", icon: SlidersHorizontal },
                      { value: "enps", label: "eNPS", description: "One 0–10 question plus a why", icon: Gauge },
                    ]} />
                  </Field>
                  <Field label="Introduction" hint="Shown before the first question."><Textarea value={form.description} onValueChange={(v) => set({ description: v })} rows={3} maxLength={4000} /></Field>
                  <Field label="Thank-you message"><TextInput value={form.thank_you} onValueChange={(v) => set({ thank_you: v })} maxLength={500} placeholder="Thank you for your answers!" /></Field>
                  <Field label="Cover">
                    <div className="grid grid-cols-5 gap-2">
                      {Object.entries(COVER_PRESETS).map(([k, p]) => (
                        <button key={k} type="button" onClick={() => { set({ preset: k }); setCoverTouched(true); }} aria-pressed={form.preset === k} title={p.label}
                          className={`overflow-hidden rounded-xl ring-offset-2 transition ${form.preset === k ? "ring-2 ring-primary" : "hover:opacity-90"}`}>
                          <PresetArt preset={k} className="h-12" />
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Names">
                    <RadioCards columns={3} value={form.identity} onChange={(v) => set({ identity: v as Form["identity"] })} options={[
                      { value: "anonymous", label: "Anonymous", description: "Nobody sees who answered what" },
                      { value: "optional", label: "Their choice", description: "Anonymous unless they show their name" },
                      { value: "named", label: "Named", description: "Names are shown with answers" },
                    ]} />
                  </Field>
                  {form.identity !== "named" && (
                    <Field label="Show results after" hint={`At least ${meta?.min_responses ?? 5} responses, so nobody can be singled out.`}>
                      <NumberInput value={form.min_responses} onChange={(v) => set({ min_responses: v })} min={meta?.min_responses ?? 5} max={100} suffix="responses" className="w-48" />
                    </Field>
                  )}
                </div>
              )}

              {tab === "audience" && (
                <div className="space-y-5">
                  <div className="rounded-2xl border border-line bg-surface p-5">
                    <p className="mb-3 text-[14.5px] text-ink">Who should answer</p>
                    <AudiencePicker value={form.audience} onChange={(a) => set({ audience: a })} />
                  </div>
                  <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
                    <p className="text-[14.5px] text-ink">When</p>
                    {!locked && (
                      <RadioCards columns={2} value={form.open_mode} onChange={(v) => set({ open_mode: v as Form["open_mode"] })} options={[
                        { value: "now", label: "Open on publishing" }, { value: "later", label: "Open on a date" },
                      ]} />
                    )}
                    {!locked && form.open_mode === "later" && <Field label="Opens on" hint="Opens at 9 am."><DateInput value={form.opens_on} onChange={(v) => set({ opens_on: v })} min={toISODate(new Date())} className="w-56" /></Field>}
                    <FormGrid columns={2}>
                      <Field label="Stays open for"><NumberInput value={form.duration_days} onChange={(v) => set({ duration_days: v })} min={1} max={form.recurrence === "weekly" ? 7 : 90} suffix="days" /></Field>
                      <Field label="Repeats">
                        <Select value={form.recurrence} onChange={(v) => set({ recurrence: v ?? "none" })} options={(meta?.recurrence ?? Object.keys(RECURRENCE_LABEL)).map((r) => ({ value: r, label: RECURRENCE_LABEL[r] ?? r }))} />
                      </Field>
                      {form.recurrence !== "none" && (
                        <Field label="Number of rounds" hint="Leave empty to keep repeating."><NumberInput value={form.recurrence_count} onChange={(v) => set({ recurrence_count: v })} min={2} max={52} placeholder="No end" /></Field>
                      )}
                    </FormGrid>
                  </div>
                  <div className="space-y-4 rounded-2xl border border-line bg-surface p-5">
                    <Toggle checked={form.mandatory} onChange={(v) => set({ mandatory: v })} label="Required" description="People are reminded until they answer and see it when they open Buzz." />
                    <Field label="Remind people who haven't answered every">
                      <NumberInput value={form.reminder_every_days} onChange={(v) => set({ reminder_every_days: v })} min={1} max={14} suffix="days" placeholder="Never" className="w-48" />
                    </Field>
                    <Toggle checked={form.post_to_buzz} onChange={(v) => set({ post_to_buzz: v })} label="Post on Buzz" description="A card on the feed invites people to answer." />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Live preview */}
          <aside className="hidden bg-sunken/40 p-6 lg:block">
            <div className="sticky top-6">
              <p className="mb-3 flex items-center gap-1.5 text-[12px] uppercase tracking-[0.08em] text-faint"><Eye size={13} /> Preview</p>
              <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
                <PresetArt preset={form.preset ?? (form.kind === "enps" ? "lavender" : "ocean")} className="h-24">
                  <div className="flex h-24 items-end px-5 pb-3"><p className="truncate text-[17px] font-light text-white drop-shadow">{form.title || "Untitled survey"}</p></div>
                </PresetArt>
                {preview ? (
                  <div className="p-5">
                    <div className="mb-4 h-1 overflow-hidden rounded-full bg-sunken"><div className="h-full bg-primary" style={{ width: `${((Math.min(active, questions.length - 1) + 1) * 100) / (questions.length + 1)}%` }} /></div>
                    <p className="text-[11.5px] uppercase tracking-[0.08em] text-faint">Question {Math.min(active, questions.length - 1) + 1} of {questions.length}{!preview.required && preview.qtype !== "enps" && " · optional"}</p>
                    <p className="mt-1.5 text-[17px] font-light leading-snug text-ink">{preview.text || <span className="text-faint">Your question</span>}</p>
                    {preview.help_text && <p className="mt-1 text-[13px] text-muted">{preview.help_text}</p>}
                    <div className="mt-4"><QuestionInput q={toQuestion(preview)} value={previewValue} onChange={setPreviewValue} /></div>
                  </div>
                ) : <p className="p-8 text-center text-[13px] text-faint">Add a question to see it here.</p>}
              </div>
              {questions.length > 1 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {questions.map((q, i) => (
                    <button key={q.key} type="button" onClick={() => { setActive(i); setTab("questions"); }} aria-label={`Preview question ${i + 1}`}
                      className={`h-7 w-7 rounded-full text-[12px] tabular ${i === active ? "bg-ink text-white" : "bg-surface text-muted hover:text-ink"}`}>{i + 1}</button>
                  ))}
                </div>
              )}
              {!locked && questions.length < max && tab === "questions" && (
                <Button className="mt-4" size="sm" variant="ghost" icon={Plus} onClick={() => addQuestion("single")}>Quick add a choice question</Button>
              )}
            </div>
          </aside>
        </div>
      )}
    </Modal>
  );
}
