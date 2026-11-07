"use client";

/*
 * Filling a review, in a near full-screen modal:
 *   <ReviewFormModal formId={uuid | null} onClose onChanged />
 * Sections in order (goals, KRAs, competencies, questions) with rating chips from the
 * cycle's scale, comments, an overall summary and a live score. Managers see the other
 * submitted reviews (self, peers) in a side column. Save draft any time; Submit asks first.
 *
 *   <PeerNominationModal participantId formUuid onClose onDone />  choose peer reviewers.
 */
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Info, Sparkles, UsersRound } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { Avatar, Badge, Button, Field, Modal, ModalCancel, MultiSelect, Skeleton, Textarea, useConfirm } from "@/components/ui-kit";
import { ProgressBar, RatingPill, searchEmployees } from "../shared";
import type { Answers, FormDetail, FormItem, FormSection, ScalePoint } from "../types";
import { FormStatus, TYPE_LABEL, scoreSections } from "./misc";

const KIND_HINT: Record<string, string> = {
  goals: "Goals from the review period, with their progress.",
  kras: "Key result areas for the role.",
  competencies: "How the work was done.",
  questions: "In your own words.",
};

function RatingChips({ scale, value, onChange, disabled, suggested, behaviours }: {
  scale: ScalePoint[]; value: number | null | undefined; onChange: (v: number | null) => void; disabled?: boolean;
  suggested?: number | null; behaviours?: { value: number; text: string }[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup">
      {scale.map((p) => {
        const on = value === p.value;
        const tip = behaviours?.find((b) => b.value === p.value)?.text || p.description || "";
        return (
          <button key={p.value} type="button" role="radio" aria-checked={on} disabled={disabled} title={tip ? `${p.label}: ${tip}` : p.label}
            onClick={() => onChange(on ? null : p.value)}
            className={`group relative inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors disabled:cursor-default ${
              on ? "border-primary bg-primary text-white" : "border-line bg-surface text-ink/75 hover:border-primary/40 hover:text-ink disabled:hover:border-line"}`}>
            <span className="tabular">{p.value}</span>
            <span className={on ? "text-white/90" : "text-muted"}>{p.label}</span>
            {suggested === p.value && !on && <Sparkles size={12} strokeWidth={1.4} className="text-primary" />}
          </button>
        );
      })}
    </div>
  );
}

function ItemRow({ section, item, scale, answers, setAnswer, editable }: {
  section: FormSection; item: FormItem; scale: ScalePoint[]; answers: Answers; editable: boolean;
  setAnswer: (key: string, patch: { rating?: number | null; comment?: string }) => void;
}) {
  const key = `${section.key}:${item.ref}`;
  const a = answers.items[key] ?? {};
  const isText = item.type === "text";
  return (
    <div className="border-b border-line px-5 py-5 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] text-ink">{item.title}{isText && item.required && <span className="text-rose-500"> *</span>}</p>
          {item.detail && <p className="mt-0.5 text-[13px] text-muted">{item.detail}</p>}
        </div>
        {section.kind !== "questions" && item.weight !== undefined && <span className="text-[12px] text-faint tabular">weight {item.weight}</span>}
      </div>
      {item.progress !== undefined && (
        <div className="mt-3 flex items-center gap-3">
          <ProgressBar value={item.progress} className="max-w-[240px]" />
          <span className="text-[12.5px] text-muted tabular">{Math.round(item.progress)}% done</span>
          {item.suggested && <span className="inline-flex items-center gap-1 text-[12.5px] text-primary"><Sparkles size={12} strokeWidth={1.4} /> Suggested {item.suggested}</span>}
        </div>
      )}
      {!isText && (
        <div className="mt-3">
          <RatingChips scale={scale} value={a.rating ?? null} disabled={!editable} suggested={item.suggested ?? null} behaviours={item.behaviours}
            onChange={(v) => setAnswer(key, { rating: v })} />
          {item.behaviours && a.rating && (
            <p className="mt-2 flex items-start gap-1.5 text-[12.5px] text-muted">
              <Info size={13} strokeWidth={1.4} className="mt-0.5 shrink-0" />
              {item.behaviours.find((b) => b.value === a.rating)?.text}
            </p>
          )}
        </div>
      )}
      <div className="mt-3">
        {editable ? (
          <Textarea value={a.comment ?? ""} onValueChange={(v) => setAnswer(key, { comment: v })} rows={isText ? 3 : 1} autoGrow
            placeholder={isText ? "Write your answer" : "Add a comment (optional)"} aria-label={`Comment on ${item.title}`} />
        ) : a.comment ? <p className="whitespace-pre-line text-[13.5px] text-ink/80">{a.comment}</p> : null}
      </div>
    </div>
  );
}

function OtherReview({ o, sections, scale }: { o: FormDetail["others"][number]; sections: FormSection[]; scale: ScalePoint[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <p className="text-[13.5px] text-ink">{TYPE_LABEL[o.reviewer_type] ?? o.reviewer_type} review</p>
          <p className="text-[12px] text-muted">{o.reviewer}</p>
        </div>
        {o.score !== null && <span className="text-[13px] text-ink tabular">{o.score.toFixed(2)}</span>}
      </div>
      <div className="max-h-[52vh] space-y-3 overflow-y-auto px-4 py-3">
        {sections.flatMap((s) => s.items.map((it) => {
          const a = o.answers.items?.[`${s.key}:${it.ref}`];
          if (!a || (a.rating == null && !a.comment)) return null;
          return (
            <div key={`${s.key}:${it.ref}`}>
              <p className="text-[12.5px] text-muted">{it.title}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {a.rating != null && <RatingPill value={a.rating} scale={scale} />}
                {a.comment && <span className="text-[13px] text-ink/80">{a.comment}</span>}
              </div>
            </div>
          );
        }))}
        {o.answers.summary && <p className="border-t border-line pt-3 text-[13px] italic text-ink/75">“{o.answers.summary}”</p>}
      </div>
    </div>
  );
}

export function ReviewFormModal({ formId, onClose, onChanged }: { formId: string | null; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<FormDetail | null>(null);
  const [answers, setAnswers] = useState<Answers>({ items: {} });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [peerOpen, setPeerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!formId) return;
    let live = true;
    setForm(null); setError(null); setDirty(false);
    api.get<FormDetail>(`/performance/forms/${formId}`)
      .then((f) => { if (live) { setForm(f); setAnswers({ items: { ...(f.answers?.items ?? {}) }, summary: f.answers?.summary ?? "" }); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Couldn't open this review"); });
    return () => { live = false; };
  }, [formId]);

  const scale = form?.scale?.points ?? [];
  const score = useMemo(() => (form ? scoreSections(form.sections, answers) : null), [form, answers]);
  const counts = useMemo(() => {
    if (!form) return { done: 0, total: 0 };
    let done = 0, total = 0;
    for (const s of form.sections) for (const it of s.items) {
      const a = answers.items[`${s.key}:${it.ref}`];
      if (it.type === "text") { if (it.required) { total++; if (a?.comment?.trim()) done++; } }
      else { total++; if (a?.rating != null) done++; }
    }
    return { done, total };
  }, [form, answers]);

  function setAnswer(key: string, patch: { rating?: number | null; comment?: string }) {
    setAnswers((prev) => ({ ...prev, items: { ...prev.items, [key]: { ...prev.items[key], ...patch } } }));
    setDirty(true);
  }

  async function save(submit: boolean) {
    if (!form) return;
    if (submit) {
      const ok = await confirm({ title: "Submit this review?", message: "You can't change it after submitting.", confirmLabel: "Submit" });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const f = await api.put<FormDetail>(`/performance/forms/${form.uuid}`, { answers, submit });
      setForm(f); setDirty(false);
      toast.success(submit ? "Review submitted" : "Draft saved");
      onChanged?.();
      if (submit) onClose();
    } catch (e) { toast.error(submit ? "Couldn't submit" : "Couldn't save", { description: e instanceof Error ? e.message : undefined }); }
    finally { setBusy(false); }
  }

  const who = form ? (form.reviewer_type === "self" ? "Your self review" : `${TYPE_LABEL[form.reviewer_type]} review of ${form.employee?.name}`) : "Review";
  const showSide = !!form && (form.others.length > 0);

  return (
    <>
      <Modal open={!!formId} onClose={() => { setDirty(false); onClose(); }} size="full" dirty={dirty} busy={busy}
        title={who}
        description={form ? <span className="flex flex-wrap items-center gap-2">{form.cycle.name}{form.due_date && <span>· due {formatDate(form.due_date)}</span>}<FormStatus status={form.status} overdue={form.overdue} /></span> : undefined}
        leading={form?.employee ? <Avatar name={form.employee.name} src={form.employee.photo} size={38} /> : undefined}
        footerStart={form && (
          <div className="flex items-center gap-4 text-[13px] text-muted">
            <span className="tabular">{counts.done} of {counts.total} answered</span>
            {score !== null && <span className="inline-flex items-center gap-2">Score <span className="text-[15px] text-ink tabular">{score.toFixed(2)}</span></span>}
          </div>
        )}
        footer={form?.editable ? (<>
          <ModalCancel />
          <Button variant="secondary" onClick={() => save(false)} disabled={busy}>Save draft</Button>
          <Button variant="primary" icon={CheckCircle2} loading={busy} onClick={() => save(true)}>Submit review</Button>
        </>) : <ModalCancel>Close</ModalCancel>}>
        {error ? <p className="py-16 text-center text-[14px] text-muted">{error}</p> : !form ? (
          <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
        ) : (
          <div className={showSide ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" : "mx-auto max-w-[860px]"}>
            <div className="space-y-6">
              {form.can_nominate_peers && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-sunken/40 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <UsersRound size={18} strokeWidth={1.4} className="text-muted" />
                    <div>
                      <p className="text-[13.5px] text-ink">Peer reviewers</p>
                      <p className="text-[12.5px] text-muted">{form.peers.length ? form.peers.map((p) => `${p.name}${p.status === "nominated" ? " (awaiting approval)" : ""}`).join(", ") : "Ask colleagues who know your work well."}</p>
                    </div>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setPeerOpen(true)}>Choose peers</Button>
                </div>
              )}
              {form.sections.map((s) => s.items.length === 0 ? null : (
                <section key={s.key} className="overflow-hidden rounded-2xl border border-line bg-surface">
                  <header className="flex items-end justify-between gap-3 border-b border-line bg-sunken/30 px-5 py-4">
                    <div>
                      <h3 className="text-[16px] font-light text-ink">{s.title}</h3>
                      <p className="mt-0.5 text-[12.5px] text-muted">{s.description || KIND_HINT[s.kind]}</p>
                    </div>
                    <Badge tone="neutral">{s.weight}% of score</Badge>
                  </header>
                  {s.items.map((it) => <ItemRow key={it.ref} section={s} item={it} scale={scale} answers={answers} setAnswer={setAnswer} editable={form.editable} />)}
                </section>
              ))}
              <section className="rounded-2xl border border-line bg-surface p-5">
                <Field label={form.reviewer_type === "self" ? "Overall, how did this period go?" : "Overall summary"} hint={form.reviewer_type === "manager" ? "Shared with the employee when results are published." : undefined}>
                  {form.editable
                    ? <Textarea value={answers.summary ?? ""} onValueChange={(v) => { setAnswers((p) => ({ ...p, summary: v })); setDirty(true); }} rows={4} autoGrow />
                    : <p className="whitespace-pre-line text-[14px] text-ink/85">{answers.summary || "—"}</p>}
                </Field>
              </section>
            </div>
            {showSide && (
              <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                <p className="text-[12px] uppercase tracking-[0.08em] text-faint">Other reviews</p>
                {form.others.map((o, i) => <OtherReview key={i} o={o} sections={form.sections} scale={scale} />)}
              </aside>
            )}
          </div>
        )}
      </Modal>
      {form && <PeerNominationModal open={peerOpen} participantId={form.participant_uuid} existing={form.peers.length}
        onClose={() => setPeerOpen(false)}
        onDone={() => api.get<FormDetail>(`/performance/forms/${form.uuid}`).then(setForm).catch(() => {})} />}
    </>
  );
}

export function PeerNominationModal({ open, participantId, existing = 0, max = 3, onClose, onDone }: {
  open: boolean; participantId: string; existing?: number; max?: number; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [ids, setIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const r = await api.post<{ added: number }>(`/performance/participants/${participantId}/peers`, { employee_ids: ids });
      toast.success(r.added === 1 ? "Peer reviewer added" : `${r.added} peer reviewers added`);
      setIds([]); onDone(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't add"); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={busy} title="Choose peer reviewers"
      description="Pick colleagues who work closely with you. Your manager may need to approve them."
      footer={<><ModalCancel /><Button variant="primary" loading={busy} disabled={!ids.length} onClick={save}>Ask for reviews</Button></>}>
      <Field label="Colleagues" hint={`Up to ${Math.max(max - existing, 0)} more.`}>
        <MultiSelect<number> value={ids} onChange={(v) => setIds(v)} loadOptions={searchEmployees} max={Math.max(max - existing, 0)} placeholder="Search by name" />
      </Field>
    </Modal>
  );
}
