"use client";

/*
 * Quizzes & tests (portal). Students start or resume an attempt (timer, answers saved as they
 * go, submit; time running out submits automatically) and see results. Parents see scores.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, ListChecks, Play, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Badge, Button, Checkbox, Modal, Skeleton, TextInput, Textarea, useConfirm } from "@/components/ui-kit";
import { ChildSwitcher, RichText, useChild } from "@/components/lms/shared";
import type { Attempt, AttemptItem, Quiz } from "@/components/lms/lib";

type PortalQuiz = Quiz & {
  attempts_used: number; in_progress_uuid: string | null; can_start: boolean; best_score: string | null; best_max: string | null;
  attempts: { uuid: string; attempt_no: number; status: string; score: string | null; max_score: string | null; submitted_at: string | null }[];
};

export default function MyQuizzesPage() {
  const toast = useToast();
  const child = useChild();
  const [data, setData] = useState<{ sid: number; items: PortalQuiz[] } | null>(null);
  const [tick, setTick] = useState(0);
  const [taking, setTaking] = useState<Attempt | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const sid = child.studentId;
  useEffect(() => {
    if (!sid) return;
    let live = true;
    api.get<{ items: PortalQuiz[] }>(`/lms/portal/quizzes?student_id=${sid}`).then((r) => live && setData({ sid, items: r.items }))
      .catch((e) => { toast.error(e.message); if (live) setData({ sid, items: [] }); });
    return () => { live = false; };
  }, [sid, tick, toast]);
  const items = data?.sid === sid ? data.items : null;

  async function start(qz: PortalQuiz) {
    try { setTaking(await api.post<Attempt>(`/lms/portal/quizzes/${qz.uuid}/start`)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't start"); setTick((t) => t + 1); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Quizzes & tests" description={child.isParent ? "Quizzes set for your child and their scores." : "Take your quizzes and see how you did."} actions={<ChildSwitcher child={child} />} />
      {!items ? <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)}</div> : items.length === 0 ? (
        <Paper><EmptyState icon={ListChecks} title="No quizzes yet" hint="Quizzes from your teachers appear here." /></Paper>
      ) : (
        <ul className="space-y-3">
          {items.map((qz) => (
            <li key={qz.uuid} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[12px] uppercase tracking-[0.06em] text-faint">{qz.subject_name} · {qz.kind === "test" ? "Test" : "Quiz"}</p>
                  <p className="mt-1 text-[15px] text-ink">{qz.title}</p>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {qz.question_count} questions{qz.time_limit_min ? ` · ${qz.time_limit_min} min` : ""} · {qz.attempts_used}/{qz.attempts_allowed} attempts used
                    {qz.window === "open" && qz.closes_at ? ` · closes ${formatRelative(qz.closes_at)}` : qz.window === "scheduled" && qz.opens_at ? ` · opens ${formatDateTime(qz.opens_at)}` : ""}
                  </p>
                </div>
                {qz.best_score != null ? <div className="text-right"><p className="tabular text-[22px] font-extralight text-ink">{qz.best_score}<span className="text-[14px] text-muted"> / {qz.best_max}</span></p><p className="text-[12px] text-muted">Best score</p></div>
                  : qz.window === "closed" ? <Badge>Closed</Badge> : qz.window === "scheduled" ? <Badge tone="info">Opens later</Badge> : <Badge tone="good" dot>Open</Badge>}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {child.isStudent && qz.can_start && <Button variant="primary" icon={Play} onClick={() => start(qz)}>{qz.in_progress_uuid ? "Continue" : qz.attempts_used ? "Try again" : "Start"}</Button>}
                {qz.attempts.map((a) => <Button key={a.uuid} size="sm" variant="ghost" onClick={() => setResult(a.uuid)}>Attempt {a.attempt_no}: {a.score != null ? `${a.score}/${a.max_score}` : "being marked"}</Button>)}
              </div>
            </li>
          ))}
        </ul>
      )}
      {taking && <TakeQuiz attempt={taking} onDone={(uuid) => { setTaking(null); setTick((t) => t + 1); if (uuid) setResult(uuid); }} />}
      <ResultModal uuid={result} studentId={sid} onClose={() => setResult(null)} />
    </div>
  );
}

/* ── Taking a quiz ─────────────────────────────────────────────────────── */

function TakeQuiz({ attempt, onDone }: { attempt: Attempt; onDone: (resultUuid: string | null) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => Object.fromEntries(attempt.items.map((i) => [String(i.question_id), i.response ?? null])));
  const [saved, setSaved] = useState<"saved" | "saving" | "idle">("idle");
  const [submitting, setSubmitting] = useState(false);
  const skew = useRef(new Date(attempt.server_now).getTime() - Date.now());
  const deadline = attempt.deadline_at ? new Date(attempt.deadline_at).getTime() : null;
  const [left, setLeft] = useState<number | null>(() => (deadline ? Math.max(0, deadline - (Date.now() + skew.current)) : null));
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<number | null>(null);
  const done = useRef(false);

  const flush = useCallback(async () => {
    const batch = pending.current;
    pending.current = {};
    if (!Object.keys(batch).length || done.current) return;
    setSaved("saving");
    try { await api.put(`/lms/portal/attempts/${attempt.uuid}/answers`, { answers: batch }); setSaved("saved"); }
    catch (e) { setSaved("idle"); toast.error(e instanceof Error ? e.message : "Couldn't save"); }
  }, [attempt.uuid, toast]);

  const submit = useCallback(async (auto = false) => {
    if (done.current) return;
    if (!auto && !(await confirm({ title: "Submit your answers?", message: "You can't change them after submitting.", confirmLabel: "Submit" }))) return;
    done.current = true;
    setSubmitting(true);
    try {
      await api.post(`/lms/portal/attempts/${attempt.uuid}/submit`, { answers: { ...answers, ...pending.current } });
      toast.success(auto ? "Time is up. Your answers were submitted." : "Submitted");
      onDone(attempt.uuid);
    } catch (e) { done.current = false; toast.error(e instanceof Error ? e.message : "Couldn't submit"); }
    finally { setSubmitting(false); }
  }, [answers, attempt.uuid, confirm, onDone, toast]);

  useEffect(() => {
    if (!deadline) return;
    const t = window.setInterval(() => {
      const ms = Math.max(0, deadline - (Date.now() + skew.current));
      setLeft(ms);
      if (ms <= 0) { window.clearInterval(t); submit(true); }
    }, 1000);
    return () => window.clearInterval(t);
  }, [deadline, submit]);

  function answer(qid: number, value: unknown) {
    setAnswers((a) => ({ ...a, [String(qid)]: value }));
    pending.current[String(qid)] = value;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, 1200);
  }
  const answered = attempt.items.filter((i) => { const v = answers[String(i.question_id)]; return v != null && v !== "" && !(Array.isArray(v) && !v.length); }).length;
  const mm = left != null ? Math.floor(left / 60000) : 0;
  const ss = left != null ? Math.floor((left % 60000) / 1000) : 0;

  return (
    <Modal open onClose={() => { flush(); onDone(null); }} size="full" busy={submitting} title={attempt.quiz?.title ?? "Quiz"}
      description={`${answered} of ${attempt.items.length} answered · ${saved === "saving" ? "Saving…" : saved === "saved" ? "Answers saved" : "Answers save as you go"}`}
      headerActions={left != null && <span className={`tabular inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[14px] ${left < 60000 ? "border-rose-200 text-rose-700" : "border-line text-ink"}`}><Clock size={15} strokeWidth={1.4} />{mm}:{String(ss).padStart(2, "0")}</span>}
      footer={<><span className="mr-auto text-[13px] text-muted">You can close this and continue later{left != null ? " while time remains" : ""}.</span><Button variant="primary" onClick={() => submit(false)} loading={submitting}>Submit</Button></>}>
      <div className="mx-auto max-w-2xl space-y-4">
        {attempt.quiz?.instructions && <div className="rounded-xl bg-sunken/60 px-4 py-3"><RichText text={attempt.quiz.instructions} /></div>}
        {attempt.items.map((it) => <QuestionCard key={it.question_id} item={it} value={answers[String(it.question_id)]} onChange={(v) => answer(it.question_id, v)} />)}
      </div>
    </Modal>
  );
}

function QuestionCard({ item, value, onChange }: { item: AttemptItem; value: unknown; onChange: (v: unknown) => void }) {
  const opt = "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-[14px] transition-colors";
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <p className="text-[15px] text-ink">{item.no}. {item.prompt}</p>
        <span className="shrink-0 text-[12px] text-faint">{Number(item.marks)} mark{Number(item.marks) === 1 ? "" : "s"}</span>
      </div>
      {(item.kind === "single" || item.kind === "true_false") && (
        <div role="radiogroup" className="space-y-2">
          {item.options.map((o) => {
            const on = value === o.key;
            return <button key={o.key} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.key)}
              className={`${opt} ${on ? "border-primary bg-primary-soft/50 text-ink" : "border-line hover:border-line-strong"}`}>
              <span className={`h-4 w-4 shrink-0 rounded-full border ${on ? "border-[5px] border-primary" : "border-line-strong"}`} />{o.text}</button>;
          })}
        </div>
      )}
      {item.kind === "multiple" && (
        <div className="space-y-2">
          <p className="text-[12.5px] text-muted">Pick all that apply.</p>
          {item.options.map((o) => {
            const list = Array.isArray(value) ? (value as string[]) : [];
            const on = list.includes(o.key);
            return <div key={o.key} className={`${opt} ${on ? "border-primary bg-primary-soft/50" : "border-line"}`}>
              <Checkbox checked={on} onChange={(c) => onChange(c ? [...list, o.key] : list.filter((k) => k !== o.key))} label={o.text} /></div>;
          })}
        </div>
      )}
      {item.kind === "short" && <TextInput value={String(value ?? "")} onValueChange={onChange} placeholder="Your answer" />}
      {item.kind === "numeric" && <TextInput inputMode="decimal" value={String(value ?? "")} onValueChange={onChange} placeholder="Enter a number" className="max-w-xs" />}
      {item.kind === "long" && <Textarea value={String(value ?? "")} onValueChange={onChange} rows={5} autoGrow placeholder="Write your answer" />}
    </div>
  );
}

/* ── Results ───────────────────────────────────────────────────────────── */

function show(a: unknown, options: { key: string; text: string }[]): string {
  if (a == null || a === "" || (Array.isArray(a) && !a.length)) return "No answer";
  const by = Object.fromEntries(options.map((o) => [o.key, o.text]));
  if (Array.isArray(a)) return a.map((k) => by[String(k)] ?? String(k)).join(", ");
  if (typeof a === "object") { const o = a as { value?: string; tolerance?: string }; return `${o.value}${o.tolerance && Number(o.tolerance) ? ` (± ${o.tolerance})` : ""}`; }
  return by[String(a)] ?? String(a);
}

function ResultModal({ uuid, studentId, onClose }: { uuid: string | null; studentId: number | null; onClose: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ uuid: string; a: Attempt } | null>(null);
  useEffect(() => {
    if (!uuid) return;
    let live = true;
    api.get<Attempt>(`/lms/portal/attempts/${uuid}?student_id=${studentId ?? ""}`).then((a) => live && setState({ uuid, a })).catch((e) => { toast.error(e.message); onClose(); });
    return () => { live = false; };
  }, [uuid, studentId, toast, onClose]);
  const a = state && state.uuid === uuid ? state.a : null;
  return (
    <Modal open={!!uuid} onClose={onClose} size="lg" title={a?.quiz?.title ?? "Result"} description={a ? `Attempt ${a.attempt_no}${a.submitted_at ? ` · ${formatDateTime(a.submitted_at)}` : ""}` : undefined}>
      {!a ? <Skeleton className="h-40 w-full" /> : (
        <>
          <div className="mb-5 rounded-2xl border border-line px-5 py-4">
            {a.score != null ? <p className="tabular text-[30px] font-extralight text-ink">{a.score}<span className="text-[16px] text-muted"> / {a.max_score}</span></p>
              : <p className="text-[15px] text-ink">Your teacher is still marking some answers.</p>}
            {!a.show_answers && <p className="mt-1 text-[13px] text-muted">{a.quiz?.show_answers === "after_close" ? "The right answers appear after the quiz closes." : a.quiz?.show_answers === "never" ? "Right answers are not shown for this quiz." : ""}</p>}
          </div>
          <ol className="space-y-3">
            {a.items.map((it) => (
              <li key={it.question_id} className="rounded-xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[14px] text-ink">{it.no}. {it.prompt}</p>
                  {it.correct === true ? <CheckCircle2 size={18} strokeWidth={1.4} className="shrink-0 text-emerald-600" /> : it.correct === false ? <XCircle size={18} strokeWidth={1.4} className="shrink-0 text-rose-500" /> : null}
                </div>
                <p className="mt-2 text-[13px] text-muted">Answer: <span className="text-ink">{show(it.response, it.options)}</span>{it.score != null ? ` · ${it.score}/${it.marks}` : ""}</p>
                {a.show_answers && it.answer != null && <p className="text-[13px] text-muted">Right answer: <span className="text-emerald-700">{show(it.answer, it.options)}</span></p>}
                {it.explanation && a.show_answers && <p className="mt-1 text-[13px] text-ink/75">{it.explanation}</p>}
                {it.feedback && <p className="mt-1 text-[13px] text-ink/75">Teacher: {it.feedback}</p>}
              </li>
            ))}
          </ol>
        </>
      )}
    </Modal>
  );
}
