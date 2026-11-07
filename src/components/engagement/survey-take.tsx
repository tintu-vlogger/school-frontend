"use client";

/*
 * Answering a survey, one question per step (phone friendly), with progress.
 *   <TakeSurveyModal uuid={u} onClose={...} onDone={...} />
 * Admins who are not invited see a read-only preview.
 */
import { useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Lock, Star } from "lucide-react";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { Button, Checkbox, Modal, Skeleton, Textarea } from "@/components/ui-kit";
import { CoverArt } from "./art";
import type { Cover } from "./types";

export type Question = {
  uuid: string; qtype: "single" | "multi" | "rating" | "scale" | "text" | "enps"; text: string; help_text: string | null;
  required: boolean; options: string[]; settings: { max?: number; points?: number; low_label?: string; high_label?: string; long?: boolean };
};
type Taking = {
  uuid: string; title: string; kind: string; description: string | null; thank_you: string | null; cover: Cover;
  identity: string; mandatory: boolean; questions: Question[]; closes_at: string; answered: boolean; preview: boolean;
};
type Answer = string | number | string[] | undefined;

export function QuestionInput({ q, value, onChange }: { q: Question; value: Answer; onChange: (v: Answer) => void }) {
  if (q.qtype === "single") return (
    <div className="space-y-2">{q.options.map((o) => (
      <button key={o} type="button" onClick={() => onChange(o)} aria-pressed={value === o}
        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-[14.5px] transition-colors ${value === o ? "border-primary bg-primary-soft text-ink" : "border-line hover:border-line-strong"}`}>
        <span className={`flex h-4 w-4 items-center justify-center rounded-full border ${value === o ? "border-primary" : "border-line-strong"}`}>{value === o && <span className="h-2 w-2 rounded-full bg-primary" />}</span>{o}
      </button>
    ))}</div>
  );
  if (q.qtype === "multi") {
    const arr = Array.isArray(value) ? value : [];
    return <div className="space-y-2">{q.options.map((o) => (
      <div key={o} className={`rounded-xl border px-4 py-3 ${arr.includes(o) ? "border-primary bg-primary-soft" : "border-line"}`}>
        <Checkbox checked={arr.includes(o)} onChange={(c) => onChange(c ? [...arr, o] : arr.filter((x) => x !== o))} label={o} />
      </div>
    ))}</div>;
  }
  if (q.qtype === "rating") {
    const max = q.settings.max ?? 5;
    return <div className="flex gap-1.5">{Array.from({ length: max }, (_, i) => i + 1).map((n) => (
      <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`}
        className="rounded-lg p-1 transition-transform hover:scale-110">
        <Star size={34} strokeWidth={1.2} className={typeof value === "number" && n <= value ? "fill-amber-400 text-amber-500" : "text-line-strong"} />
      </button>
    ))}</div>;
  }
  if (q.qtype === "scale" || q.qtype === "enps") {
    const lo = q.qtype === "enps" ? 0 : 1, hi = q.qtype === "enps" ? 10 : (q.settings.points ?? 5);
    const nums = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    const tone = (n: number) => q.qtype !== "enps" ? "bg-primary" : n <= 6 ? "bg-rose-500" : n <= 8 ? "bg-amber-500" : "bg-emerald-500";
    return (
      <div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${nums.length}, minmax(0, 1fr))` }}>
          {nums.map((n) => (
            <button key={n} type="button" onClick={() => onChange(n)} aria-pressed={value === n}
              className={`h-11 rounded-lg border text-[15px] tabular transition-colors ${value === n ? `${tone(n)} border-transparent text-white` : "border-line text-ink hover:border-line-strong"}`}>{n}</button>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-faint"><span>{q.settings.low_label}</span><span>{q.settings.high_label}</span></div>
      </div>
    );
  }
  return <Textarea value={typeof value === "string" ? value : ""} onValueChange={onChange} rows={q.settings.long === false ? 2 : 5} maxLength={4000} placeholder="Type your answer" />;
}

export function TakeSurveyModal({ uuid, onClose, onDone }: { uuid: string | null; onClose: () => void; onDone?: () => void }) {
  const toast = useToast();
  const [s, setS] = useState<Taking | null>(null);
  const [step, setStep] = useState(-1);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [showName, setShowName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (!uuid) return;
    setS(null); setStep(-1); setAnswers({}); setDone(null); setShowName(false);
    api.get<Taking>(`/engagement/surveys/${uuid}/take`).then(setS).catch((e) => { toast.error((e as Error).message); onClose(); });
  }, [uuid, toast, onClose]);

  const q = s && step >= 0 ? s.questions[step] : null;
  const has = (v: Answer) => v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
  const canNext = !q || !q.required || has(answers[q.uuid]);
  const last = s ? step === s.questions.length - 1 : false;

  async function submit() {
    if (!s) return;
    setBusy(true);
    try {
      const r = await api.post<{ detail: string }>(`/engagement/surveys/${s.uuid}/responses`, { answers, show_name: showName });
      setDone(r.detail); onDone?.();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  const pct = s ? Math.round(((step + 1) / (s.questions.length + 1)) * 100) : 0;
  return (
    <Modal open={!!uuid} onClose={onClose} size="md" flush dirty={Object.keys(answers).length > 0 && !done} title={s?.title ?? "Survey"}
      footer={s && !done && !s.answered && step >= 0 ? (
        <div className="flex w-full items-center justify-between">
          <Button variant="ghost" icon={ChevronLeft} onClick={() => setStep(step - 1)}>Back</Button>
          {s.preview ? (last ? <Button onClick={onClose}>Close preview</Button> : <Button variant="primary" iconRight={ChevronRight} onClick={() => setStep(step + 1)}>Next</Button>)
            : last ? <Button variant="primary" loading={busy} disabled={!canNext} onClick={submit}>Submit</Button>
              : <Button variant="primary" iconRight={ChevronRight} disabled={!canNext} onClick={() => setStep(step + 1)}>Next</Button>}
        </div>
      ) : undefined}>
      {!s ? <div className="space-y-3 p-6"><Skeleton className="h-28" /><Skeleton className="h-6 w-1/2" /></div>
        : done || s.answered ? (
          <div className="flex flex-col items-center px-8 py-14 text-center">
            <span className="buzz-pop flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 size={34} strokeWidth={1.3} /></span>
            <p className="mt-4 text-[20px] font-light text-ink">{done ? "Thank you!" : "You have already answered"}</p>
            <p className="mt-1 max-w-sm text-[14px] text-muted">{done ?? s.thank_you ?? "Thanks for taking part."}</p>
            <Button className="mt-6" onClick={onClose}>Close</Button>
          </div>
        ) : step < 0 ? (
          <div>
            <CoverArt cover={s.cover} fallback={s.kind === "enps" ? "lavender" : "ocean"} className="h-32" />
            <div className="px-6 py-6">
              {s.preview && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Preview only. You are not in this survey&apos;s audience.</p>}
              <p className="text-[15px] leading-relaxed text-muted">{s.description || "A few quick questions."}</p>
              <ul className="mt-4 space-y-1.5 text-[13.5px] text-muted">
                <li>• {s.questions.length} question{s.questions.length === 1 ? "" : "s"}, about {Math.max(1, Math.round(s.questions.length * 0.4))} minute{s.questions.length > 3 ? "s" : ""}</li>
                <li className="flex items-center gap-1.5">• <Lock size={13} strokeWidth={1.5} />{s.identity === "named" ? "Your name is shown with your answers." : "Your answers are anonymous. Results show only once enough people answer."}</li>
                <li>• Open until {formatRelative(s.closes_at)}</li>
              </ul>
              {s.identity === "optional" && !s.preview && (
                <div className="mt-4 rounded-xl border border-line p-3"><Checkbox checked={showName} onChange={setShowName} label="Show my name to the survey owner" description="Leave this off to stay anonymous." /></div>
              )}
              <Button variant="primary" className="mt-6" iconRight={ChevronRight} onClick={() => setStep(0)}>Start</Button>
            </div>
          </div>
        ) : q && (
          <div className="px-6 py-6">
            <div className="mb-5 h-1 overflow-hidden rounded-full bg-sunken"><div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>
            <p className="text-[12px] uppercase tracking-[0.08em] text-faint">Question {step + 1} of {s.questions.length}{!q.required && " · optional"}</p>
            <p className="mt-2 text-[19px] font-light leading-snug text-ink">{q.text}</p>
            {q.help_text && <p className="mt-1 text-[13.5px] text-muted">{q.help_text}</p>}
            <div className="mt-5"><QuestionInput q={q} value={answers[q.uuid]} onChange={(v) => setAnswers({ ...answers, [q.uuid]: v })} /></div>
          </div>
        )}
    </Modal>
  );
}
