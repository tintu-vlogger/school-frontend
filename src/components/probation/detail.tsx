"use client";

/*
 * One probation in a centered modal: dates, policy limits, reviews by level, outcome
 * (confirm, extend, end employment, hold), end-date override, cancel and history.
 *   <ProbationDetail uuid={uuid} onClose={...} onChanged={refresh} />
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarCog, CheckCircle2, ExternalLink, History, Play, Send, Star, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime } from "@/lib/datetime";
import {
  Badge, Button, DateInput, Field, KeyValue, Modal, ModalCancel, RadioCards, Section, Skeleton, Textarea, Timeline, Toggle,
  formatDisplayDate, useConfirm,
} from "@/components/ui-kit";
import { fileHref } from "@/components/workplace/files";
import { OPEN, STATUS_TONE, type ProbationDetail as Detail, type Review } from "./types";

export function Stars({ value }: { value: number | null }) {
  if (!value) return <span className="text-faint">—</span>;
  return <span className="inline-flex gap-0.5">{[1, 2, 3, 4, 5].map((n) => <Star key={n} size={13} strokeWidth={1.4} className={n <= value ? "fill-amber-400 text-amber-400" : "text-line-strong"} />)}</span>;
}

export function ProbationDetail({ uuid, onClose, onChanged }: { uuid: string | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<Detail | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [endDate, setEndDate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const load = useCallback(() => {
    if (!uuid) return;
    api.get<Detail>(`/probation/probations/${uuid}`).then(setD).catch((e) => toast.error(e.message));
  }, [uuid, toast]);
  useEffect(() => { setD(null); load(); }, [load]);

  async function post(key: string, path: string, body: unknown, msg: string) {
    setBusy(key);
    try { setD(await api.post<Detail>(`/probation/probations/${uuid}${path}`, body)); onChanged(); toast.success(msg); return true; }
    catch (e) { toast.error((e as Error).message); return false; } finally { setBusy(null); }
  }

  const open = d ? OPEN.includes(d.status) : false;
  const rounds = d ? Array.from(new Set(d.reviews.map((r) => r.round))).sort((a, b) => b - a) : [];

  return (
    <Modal open={!!uuid} onClose={onClose} size="lg" title={d?.name ?? "Probation"}
      description={d ? [d.designation, d.department, d.policy_name].filter(Boolean).join(" · ") : undefined}
      headerActions={d && <Badge tone={STATUS_TONE[d.status] ?? "neutral"} dot>{d.status_label}</Badge>}
      footerStart={d && open && <Button variant="ghost" icon={XCircle} onClick={() => setCancelling(true)}>Cancel probation</Button>}
      footer={d && <>
        <ModalCancel>Close</ModalCancel>
        {d.status === "on_hold" && <Button icon={Play} loading={busy === "resume"} onClick={() => post("resume", "/resume", {}, "Back under review")}>Resume</Button>}
        {(d.status === "active" || d.status === "extended") && <Button icon={Send} loading={busy === "review"} onClick={async () => {
          if (await confirm({ title: "Start the review now?", message: "Reviewers are asked for their ratings and recommendation.", confirmLabel: "Start review" }))
            await post("review", "/start-review", {}, "Review started");
        }}>Start review</Button>}
        {open && <Button variant="primary" icon={CheckCircle2} onClick={() => setDeciding(true)}>Decide outcome</Button>}
      </>}>
      {!d ? <div className="space-y-3"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-40" /></div> : (
        <div className="space-y-6">
          <KeyValue columns={3} items={[
            { label: "Started", value: formatDisplayDate(d.start_date) },
            { label: "Ends", value: <span className={d.overdue ? "text-rose-600" : ""}>{formatDisplayDate(d.end_date)}{open && <span className="ml-1 text-[12px] text-faint">({d.days_left >= 0 ? `${d.days_left} days left` : `${-d.days_left} days ago`})</span>}</span> },
            { label: "Review starts", value: formatDisplayDate(d.review_starts_on) },
            { label: "Originally ending", value: formatDisplayDate(d.original_end_date) },
            { label: "Extensions", value: `${d.extensions}${d.max_extensions !== null ? ` of ${d.max_extensions}` : ""}` },
            { label: "Outcome", value: d.outcome_label ? `${d.outcome_label}${d.confirmation_date ? ` from ${formatDisplayDate(d.confirmation_date)}` : ""}` : "Not decided" },
          ]} />
          {d.hold_reason && <p className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-2.5 text-[13.5px] text-amber-800">On hold: {d.hold_reason}</p>}
          {d.outcome_reason && <p className="text-[13.5px] text-muted">Reason: {d.outcome_reason}</p>}
          {open && (
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
              {d.extension.allowed ? <span>Can be extended to {formatDisplayDate(d.extension.new_end)} ({d.extension.left} extension(s) left).</span> : <span>{d.extension.reason}</span>}
              {d.status === "active" && d.extensions === 0 && <Button size="sm" variant="ghost" icon={CalendarCog} onClick={() => setEndDate(true)}>Change end date</Button>}
            </div>
          )}
          {d.letter && (
            <div className="flex items-center justify-between rounded-xl border border-line px-4 py-3">
              <p className="text-[14px] text-ink">Confirmation letter <span className="text-[12px] text-muted">· {d.letter.status}</span></p>
              {d.letter.file?.url && <a href={fileHref(d.letter.file.url)} target="_blank" rel="noreferrer"><Button size="sm" icon={ExternalLink}>View</Button></a>}
            </div>
          )}
          <Section title="Reviews">
            {!d.reviews.length ? <p className="text-[13.5px] text-muted">The review starts {formatDisplayDate(d.review_starts_on)}, {d.policy?.review_before_days ?? 15} days before the end.</p> : rounds.map((rd) => (
              <div key={rd} className="mb-4">
                {rounds.length > 1 && <p className="mb-2 text-[12.5px] text-faint">{rd === 1 ? "First review" : `After extension ${rd - 1}`}</p>}
                <div className="divide-y divide-line rounded-xl border border-line">
                  {d.reviews.filter((r) => r.round === rd).map((r) => <ReviewRow key={r.uuid} r={r} />)}
                </div>
              </div>
            ))}
          </Section>
          <Section title="History">
            <Timeline items={d.history.map((h, i) => ({ id: i, title: h.text, time: formatDateTime(h.at), description: h.by, icon: History,
              tone: h.kind === "decision" ? "good" : h.kind === "extend" ? "warn" : h.kind === "cancel" ? "bad" : "neutral" }))} />
          </Section>
        </div>
      )}
      {d && <DecideModal d={d} open={deciding} onClose={() => setDeciding(false)} onDone={(x) => { setD(x); setDeciding(false); onChanged(); }} />}
      <Modal open={cancelling} onClose={() => setCancelling(false)} size="sm" zIndex={70} title="Cancel probation"
        description="For someone added by mistake. The record is kept."
        footer={<><ModalCancel /><Button variant="danger" disabled={!cancelReason.trim()} loading={busy === "cancel"} onClick={async () => {
          if (await post("cancel", "/cancel", { reason: cancelReason }, "Probation cancelled")) { setCancelling(false); setCancelReason(""); }
        }}>Cancel probation</Button></>}>
        <Field label="Reason" required><Textarea value={cancelReason} onValueChange={setCancelReason} /></Field>
      </Modal>
      {d && <EndDateModal d={d} open={endDate} onClose={() => setEndDate(false)} onDone={(x) => { setD(x); setEndDate(false); onChanged(); }} />}
    </Modal>
  );
}

function ReviewRow({ r }: { r: Review }) {
  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-[14px] text-ink">{r.reviewer_name ?? "Reviewer"}</p>
          <span className="text-[12px] text-faint">{r.kind === "feedback" ? "Feedback" : `Level ${r.level}`}</span>
        </div>
        <div className="flex items-center gap-2">
          {r.status === "submitted" ? <><Stars value={r.rating} />{r.recommendation_label && <Badge tone={r.recommendation === "confirm" ? "good" : r.recommendation === "terminate" ? "bad" : "warn"}>{r.recommendation_label}</Badge>}</>
            : <Badge tone={r.status === "pending" ? "info" : "neutral"}>{r.status === "waiting" ? "Waiting for earlier level" : r.status}</Badge>}
        </div>
      </div>
      {(r.strengths || r.improvements || r.comments) && (
        <div className="mt-1.5 space-y-0.5 text-[13px] text-muted">
          {r.strengths && <p><span className="text-faint">Strengths: </span>{r.strengths}</p>}
          {r.improvements && <p><span className="text-faint">To improve: </span>{r.improvements}</p>}
          {r.comments && <p><span className="text-faint">Comments: </span>{r.comments}</p>}
        </div>
      )}
    </div>
  );
}

function DecideModal({ d, open, onClose, onDone }: { d: Detail; open: boolean; onClose: () => void; onDone: (x: Detail) => void }) {
  const toast = useToast();
  const [outcome, setOutcome] = useState<string>("confirm");
  const [reason, setReason] = useState("");
  const [cdate, setCdate] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [lwd, setLwd] = useState("");
  const [letter, setLetter] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    const recs = d.reviews.filter((r) => r.status === "submitted" && r.recommendation).map((r) => r.recommendation!);
    setOutcome(recs.length && recs.every((x) => x === recs[0]) ? recs[0] : "confirm");
    setReason(""); setNewEnd(d.extension.new_end ?? ""); setLwd("");
    const next = new Date(`${d.end_date}T00:00:00`); next.setDate(next.getDate() + 1);
    setCdate(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`);
  }, [open, d]);
  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { outcome, reason: reason || null, letter };
      if (outcome === "confirm") body.confirmation_date = cdate || null;
      if (outcome === "extend") body.new_end_date = newEnd || null;
      if (outcome === "terminate") body.last_working_day = lwd || null;
      onDone(await api.post<Detail>(`/probation/probations/${d.uuid}/decide`, body));
      toast.success("Outcome recorded");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  const options = [
    { value: "confirm", label: "Confirm", description: "Employment is confirmed; the date is written to the record." },
    { value: "extend", label: "Extend", description: d.extension.allowed ? `Up to ${formatDisplayDate(d.extension.new_end)}.` : d.extension.reason ?? "Not allowed", disabled: !d.extension.allowed },
    { value: "hold", label: "Put on hold", description: "Keep the decision open with a reason." },
    { value: "terminate", label: "End employment", description: "Starts the exit process with the 2-day settlement deadline." },
  ];
  return (
    <Modal open={open} onClose={onClose} size="md" zIndex={70} busy={saving} title={`Outcome for ${d.name}`}
      footer={<><ModalCancel /><Button variant={outcome === "terminate" ? "danger" : "primary"} loading={saving} onClick={save}>Record outcome</Button></>}>
      <div className="space-y-5">
        <RadioCards columns={2} value={outcome} onChange={setOutcome} options={options} />
        {outcome === "confirm" && <>
          <Field label="Confirmed from"><DateInput value={cdate} onChange={setCdate} /></Field>
          <Toggle checked={letter} onChange={setLetter} label="Issue the confirmation letter" />
        </>}
        {outcome === "extend" && <Field label="New end date" hint={d.extension.new_end ? `At most ${formatDisplayDate(d.extension.new_end)}` : undefined}>
          <DateInput value={newEnd} onChange={setNewEnd} min={d.end_date} max={d.extension.new_end ?? undefined} /></Field>}
        {outcome === "terminate" && <Field label="Last working day" hint="Leave empty to use the notice period"><DateInput value={lwd} onChange={setLwd} clearable /></Field>}
        <Field label="Reason" required={outcome === "hold" || outcome === "terminate"}><Textarea value={reason} onValueChange={setReason} /></Field>
      </div>
    </Modal>
  );
}

function EndDateModal({ d, open, onClose, onDone }: { d: Detail; open: boolean; onClose: () => void; onDone: (x: Detail) => void }) {
  const toast = useToast();
  const [end, setEnd] = useState(d.end_date);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setEnd(d.end_date); setReason(""); } }, [open, d.end_date]);
  async function save() {
    setSaving(true);
    try { onDone(await api.post<Detail>(`/probation/probations/${d.uuid}/end-date`, { end_date: end, reason })); toast.success("End date changed"); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" zIndex={70} title="Change end date" description="Allowed before the review starts. Logged with your reason."
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!reason.trim()} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="New end date"><DateInput value={end} onChange={setEnd} min={d.start_date} /></Field>
        <Field label="Reason" required><Textarea value={reason} onValueChange={setReason} /></Field>
      </div>
    </Modal>
  );
}

export function ReviewFormModal({ review, name, onClose, onSaved }: { review: { uuid: string; kind: string } | null; name: string; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [rating, setRating] = useState<number | null>(null);
  const [rec, setRec] = useState<string | null>(null);
  const [strengths, setStrengths] = useState("");
  const [improve, setImprove] = useState("");
  const [comments, setComments] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (review) { setRating(null); setRec(null); setStrengths(""); setImprove(""); setComments(""); } }, [review]);
  async function save() {
    if (!review) return;
    setSaving(true);
    try {
      await api.post(`/probation/reviews/${review.uuid}`, { rating, recommendation: rec, strengths, improvements: improve, comments });
      toast.success("Review submitted");
      onSaved();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  return (
    <Modal open={!!review} onClose={onClose} size="md" busy={saving} dirty={!!(rating || strengths || comments)}
      title={`${review?.kind === "feedback" ? "Feedback" : "Probation review"}: ${name}`}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!rating || (review?.kind === "review" && !rec)} onClick={save}>Submit</Button></>}>
      <div className="space-y-5">
        <Field label="Overall rating" required>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} of 5`}
                className={`flex h-10 w-10 items-center justify-center rounded-lg border transition-colors ${rating && n <= rating ? "border-amber-300 bg-amber-50 text-amber-500" : "border-line text-faint hover:border-line-strong"}`}>
                <Star size={16} strokeWidth={1.4} className={rating && n <= rating ? "fill-amber-400" : ""} />
              </button>
            ))}
          </div>
        </Field>
        {review?.kind === "review" && (
          <Field label="Recommendation" required>
            <RadioCards columns={2} value={rec} onChange={setRec} options={[
              { value: "confirm", label: "Confirm" }, { value: "extend", label: "Extend" },
              { value: "hold", label: "Put on hold" }, { value: "terminate", label: "End employment" }]} />
          </Field>
        )}
        <Field label="Strengths"><Textarea value={strengths} onValueChange={setStrengths} /></Field>
        <Field label="Areas to improve"><Textarea value={improve} onValueChange={setImprove} /></Field>
        <Field label="Comments" hint={rec && rec !== "confirm" ? "Explain your recommendation" : undefined}><Textarea value={comments} onValueChange={setComments} /></Field>
      </div>
    </Modal>
  );
}

