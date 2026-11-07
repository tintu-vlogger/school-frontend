"use client";

/*
 * Assessment player (full-size modal).
 *   <AssessmentPlayer assessmentUuid={uuid} title="POSH quiz" open onClose onFinished={(attempt) => ...} />
 * Starts (or resumes) an attempt, shows a countdown that submits by itself at 0, a question
 * navigator, saves answers as you go, and ends on a result screen with a per-question
 * review when the assessment allows it. "Try again" starts a new attempt if any are left.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Clock, RotateCcw, Send, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Badge, Button, Modal, Skeleton, TextInput, useConfirm } from "@/components/ui-kit";
import { STROKE, errText } from "./shared";
import type { AnswerValue, Attempt, Question } from "./types";

function clock(s: number) {
  const m = Math.floor(s / 60), r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

const KIND_HINT: Record<string, string> = { single: "Pick one", multi: "Pick all that apply", true_false: "True or false", short: "Type a short answer" };

function answered(q: Question, a: AnswerValue | undefined) {
  if (a === undefined || a === null) return false;
  return Array.isArray(a) ? a.length > 0 : String(a).trim() !== "";
}

export function AssessmentPlayer({ assessmentUuid, title, open, onClose, onFinished }: {
  assessmentUuid: string | null; title?: string; open: boolean; onClose: () => void; onFinished?: (a: Attempt) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const autoSubmitted = useRef(false);

  const start = useCallback(async () => {
    if (!assessmentUuid) return;
    setAttempt(null); setError(null); setIndex(0); autoSubmitted.current = false;
    try {
      const a = await api.post<Attempt>(`/learning/assessments/${assessmentUuid}/attempts`);
      setAttempt(a);
      setAnswers(a.answers || {});
      setLeft(a.seconds_left);
    } catch (e) {
      setError(errText(e) ?? "Couldn't start the assessment");
    }
  }, [assessmentUuid]);

  useEffect(() => { if (open && assessmentUuid) start(); }, [open, assessmentUuid, start]);

  const submit = useCallback(async (auto = false) => {
    if (!attempt || attempt.status !== "in_progress") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSubmitting(true);
    try {
      const r = await api.post<Attempt>(`/learning/attempts/${attempt.uuid}/submit`, { answers: answersRef.current });
      setAttempt(r);
      setIndex(0);
      if (auto) toast.info("Time is up. Your answers were submitted.");
      onFinished?.(r);
    } catch (e) {
      toast.error("Couldn't submit", { description: errText(e) });
    } finally {
      setSubmitting(false);
    }
  }, [attempt, toast, onFinished]);

  // countdown
  useEffect(() => {
    if (!attempt || attempt.status !== "in_progress" || left === null) return;
    if (left <= 0) {
      if (!autoSubmitted.current) { autoSubmitted.current = true; submit(true); }
      return;
    }
    const t = setTimeout(() => setLeft((s) => (s === null ? s : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [left, attempt, submit]);

  function setAnswer(qid: number, v: AnswerValue) {
    if (!attempt || attempt.status !== "in_progress") return;
    setAnswers((cur) => ({ ...cur, [String(qid)]: v }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.put(`/learning/attempts/${attempt.uuid}`, { answers: { ...answersRef.current, [String(qid)]: v } }).catch(() => {});
    }, 600);
  }

  async function askSubmit() {
    const qs = attempt?.questions ?? [];
    const missing = qs.filter((q) => !answered(q, answers[String(q.id)])).length;
    const ok = await confirm({
      title: "Submit your answers?",
      message: missing ? `${missing} question${missing === 1 ? " is" : "s are"} still unanswered. You can't change answers after submitting.` : "You can't change answers after submitting.",
      confirmLabel: "Submit", tone: "primary",
    });
    if (ok) submit();
  }

  const done = attempt?.status === "submitted";
  const qs = attempt?.questions ?? [];
  const q = qs[index];
  const a = attempt?.assessment;
  const answeredCount = qs.filter((x) => answered(x, answers[String(x.id)])).length;
  const canRetry = done && a && (a.max_attempts === null || (attempt?.number ?? 0) < a.max_attempts);

  return (
    <Modal
      open={open} onClose={onClose} size="full" busy={submitting}
      title={title ?? a?.title ?? "Assessment"}
      description={a && !done ? `${qs.length} questions · pass mark ${a.pass_pct}%${a.negative_marking !== "none" ? " · wrong answers lose marks" : ""}` : undefined}
      headerActions={attempt && !done && left !== null ? (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] tabular ${left < 60 ? "border-rose-200 bg-rose-50 text-rose-700" : "border-line text-ink"}`}>
          <Clock size={14} strokeWidth={STROKE} /> {clock(Math.max(left, 0))}
        </span>
      ) : undefined}
      footer={attempt && !done ? (
        <>
          <span className="mr-auto text-[13px] text-muted">{answeredCount} of {qs.length} answered</span>
          <Button variant="secondary" icon={ChevronLeft} disabled={index === 0} onClick={() => setIndex((i) => i - 1)}>Previous</Button>
          {index < qs.length - 1
            ? <Button variant="secondary" iconRight={ChevronRight} onClick={() => setIndex((i) => i + 1)}>Next</Button>
            : null}
          <Button variant="primary" icon={Send} loading={submitting} onClick={askSubmit}>Submit</Button>
        </>
      ) : done ? (
        <>
          <Button variant="secondary" onClick={onClose}>Close</Button>
          {canRetry && !attempt?.passed && <Button variant="primary" icon={RotateCcw} onClick={start}>Try again</Button>}
        </>
      ) : undefined}
    >
      {error ? (
        <div className="flex flex-col items-center py-20 text-center">
          <AlertTriangle size={28} strokeWidth={1.2} className="mb-3 text-amber-500" />
          <p className="text-[15px] text-ink">{error}</p>
        </div>
      ) : !attempt ? (
        <div className="mx-auto max-w-2xl space-y-4 py-8"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-12" /><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
      ) : done ? (
        <Result attempt={attempt} />
      ) : (
        <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_220px]">
          <div className="min-w-0">
            {q && (
              <div key={q.id}>
                <p className="text-[12.5px] uppercase tracking-[0.08em] text-faint">Question {index + 1} of {qs.length} · {q.marks} mark{q.marks === 1 ? "" : "s"}</p>
                <h3 className="mt-2 text-[20px] font-light leading-snug text-ink">{q.text}</h3>
                <p className="mt-1 text-[13px] text-muted">{KIND_HINT[q.kind]}</p>
                <div className="mt-6"><QuestionInput q={q} value={answers[String(q.id)]} onChange={(v) => setAnswer(q.id, v)} /></div>
              </div>
            )}
          </div>
          <aside className="rounded-2xl border border-line p-4">
            <p className="mb-3 text-[13px] text-muted">Questions</p>
            <div className="grid grid-cols-5 gap-2">
              {qs.map((x, i) => {
                const has = answered(x, answers[String(x.id)]);
                return (
                  <button key={x.id} type="button" onClick={() => setIndex(i)}
                    className={`h-9 rounded-lg border text-[13px] tabular transition-colors ${i === index ? "border-primary bg-primary text-white" : has ? "border-primary/30 bg-primary-soft text-primary" : "border-line text-muted hover:border-line-strong"}`}>
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <p className="mt-4 text-[12.5px] leading-5 text-faint">Answers are saved as you go. If time runs out, what you have answered is submitted.</p>
          </aside>
        </div>
      )}
    </Modal>
  );
}

function QuestionInput({ q, value, onChange, readOnly }: { q: Question; value: AnswerValue | undefined; onChange?: (v: AnswerValue) => void; readOnly?: boolean }) {
  if (q.kind === "short") {
    return <TextInput value={typeof value === "string" ? value : ""} onValueChange={(v) => onChange?.(v)} placeholder="Your answer" disabled={readOnly} className="max-w-md" />;
  }
  const multi = q.kind === "multi";
  const picked = new Set(Array.isArray(value) ? value : value ? [value] : []);
  return (
    <div className="space-y-2.5">
      {q.options.map((o, i) => {
        const on = picked.has(o.id);
        const right = o.correct;
        const tone = readOnly && right !== undefined
          ? right ? "border-emerald-300 bg-emerald-50/60" : on ? "border-rose-300 bg-rose-50/60" : "border-line"
          : on ? "border-primary bg-primary-soft/60" : "border-line hover:border-line-strong";
        return (
          <button key={o.id} type="button" disabled={readOnly}
            onClick={() => {
              if (!onChange) return;
              if (multi) { const n = new Set(picked); if (on) n.delete(o.id); else n.add(o.id); onChange([...n]); }
              else onChange(o.id);
            }}
            className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-[14.5px] text-ink transition-colors ${tone}`}>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center border text-[11px] ${multi ? "rounded-md" : "rounded-full"} ${on ? "border-primary bg-primary text-white" : "border-line-strong text-faint"}`}>
              {on ? "✓" : String.fromCharCode(65 + i)}
            </span>
            <span className="flex-1">{o.text}</span>
            {readOnly && right && <CheckCircle2 size={16} strokeWidth={STROKE} className="text-emerald-600" />}
          </button>
        );
      })}
    </div>
  );
}

function Result({ attempt }: { attempt: Attempt }) {
  const passed = !!attempt.passed;
  const pct = attempt.pct ?? 0;
  const s = attempt.summary;
  return (
    <div className="mx-auto max-w-3xl">
      <div className={`flex flex-col items-center rounded-2xl border px-6 py-10 text-center ${passed ? "border-emerald-200 bg-emerald-50/50" : "border-amber-200 bg-amber-50/50"}`}>
        <div className="relative h-32 w-32">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="8" className="text-white" />
            <circle cx="60" cy="60" r="52" fill="none" strokeWidth="8" strokeLinecap="round"
              stroke={passed ? "#10b981" : "#f59e0b"} strokeDasharray={`${(pct / 100) * 327} 327`} />
          </svg>
          <span className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[30px] font-extralight tabular text-ink">{Math.round(pct)}%</span>
          </span>
        </div>
        <p className="mt-4 text-[22px] font-light text-ink">{passed ? "You passed" : "Not quite there yet"}</p>
        <p className="mt-1 text-[14px] text-muted">
          {attempt.score} of {attempt.max_score} marks · pass mark {attempt.assessment.pass_pct}% · attempt {attempt.number}
          {attempt.assessment.max_attempts ? ` of ${attempt.assessment.max_attempts}` : ""}
        </p>
        {s && (
          <div className="mt-5 flex gap-2">
            <Badge tone="good">{s.correct} right</Badge>
            <Badge tone="bad">{s.wrong} wrong</Badge>
            <Badge tone="neutral">{s.unanswered} skipped</Badge>
          </div>
        )}
      </div>
      {attempt.reveal ? (
        <div className="mt-8 space-y-4">
          <p className="text-[15px] text-ink">Review your answers</p>
          {attempt.questions.map((q, i) => {
            const r = q.result;
            const val = attempt.answers[String(q.id)];
            return (
              <div key={q.id} className="rounded-2xl border border-line p-5">
                <div className="flex items-start gap-3">
                  {r?.correct ? <CheckCircle2 size={18} strokeWidth={STROKE} className="mt-0.5 shrink-0 text-emerald-600" />
                    : <XCircle size={18} strokeWidth={STROKE} className={`mt-0.5 shrink-0 ${r?.answered ? "text-rose-500" : "text-faint"}`} />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] text-ink">{i + 1}. {q.text}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted tabular">{r ? `${r.marks} / ${r.max} marks` : ""}{r && !r.answered ? " · not answered" : ""}</p>
                    <div className="mt-3">
                      {q.kind === "short" ? (
                        <div className="space-y-1 text-[13.5px]">
                          <p className="text-muted">Your answer: <span className="text-ink">{typeof val === "string" && val ? val : "—"}</span></p>
                          {!!q.accepted_answers?.length && <p className="text-muted">Accepted: <span className="text-emerald-700">{q.accepted_answers.join(", ")}</span></p>}
                        </div>
                      ) : <QuestionInput q={q} value={val} readOnly />}
                    </div>
                    {q.explanation && <p className="mt-3 text-[13px] text-muted">{q.explanation}</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-6 text-center text-[13.5px] text-muted">Answers are not shown for this assessment.</p>
      )}
    </div>
  );
}
