"use client";

/*
 * Small pieces for the review pages:
 *   FormStatus          chip for one reviewer's form (pending, draft, submitted …)
 *   CycleStatus         chip for a review cycle
 *   CycleSelect         pick a review cycle (defaults to the newest running one)
 *   AckModal            a manager accepts or declines a calibrated rating
 *   RespondModal        the employee agrees or disagrees with their published review
 *   LetterModal         a printable letter (review or revision letter)
 *   scoreSections()     live score for a form, same maths as the server
 */
import { useEffect, useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatLongDate } from "@/lib/datetime";
import { Badge, Button, Field, Modal, ModalCancel, RadioCards, Select, Textarea, type BadgeTone } from "@/components/ui-kit";
import { RatingPill } from "../shared";
import type { Answers, Cycle, FormSection, Letter, ParticipantRow, ScalePoint } from "../types";

export const TYPE_LABEL: Record<string, string> = { self: "Self", manager: "Manager", peer: "Peer", skip: "Skip-level" };
export const KIND_LABEL: Record<string, string> = { annual: "Annual", half_yearly: "Half-yearly", quarterly: "Quarterly", probation: "Probation" };

const FORM_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  nominated: { label: "Awaiting approval", tone: "warn" },
  pending: { label: "Not started", tone: "neutral" },
  draft: { label: "In progress", tone: "info" },
  submitted: { label: "Submitted", tone: "good" },
  declined: { label: "Declined", tone: "bad" },
};

export function FormStatus({ status, overdue }: { status: string; overdue?: boolean }) {
  const s = FORM_STATUS[status] ?? { label: status, tone: "neutral" as BadgeTone };
  if (overdue && status !== "submitted") return <Badge tone="bad" dot>Overdue</Badge>;
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

const CYCLE_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  active: { label: "Reviews open", tone: "info" },
  calibration: { label: "Calibration", tone: "warn" },
  published: { label: "Published", tone: "good" },
  closed: { label: "Closed", tone: "neutral" },
};
export function CycleStatus({ status }: { status: string }) {
  const s = CYCLE_STATUS[status] ?? { label: status, tone: "neutral" as BadgeTone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export const ACK_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Waiting for manager", tone: "warn" },
  accepted: { label: "Manager agreed", tone: "good" },
  declined: { label: "Manager disagreed", tone: "bad" },
};

/** Review cycles for admins (loaded once per page). */
export function useCycles(enabled = true) {
  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    api.get<Cycle[]>("/performance/cycles").then((r) => { if (live) setCycles(r); }).catch(() => { if (live) setCycles([]); });
    return () => { live = false; };
  }, [enabled, nonce]);
  return { cycles, reload: () => setNonce((n) => n + 1) };
}

export function pickDefaultCycle(cycles: Cycle[] | null, prefer: Cycle["status"][] = ["calibration", "active", "published", "closed"]) {
  if (!cycles?.length) return null;
  for (const st of prefer) {
    const c = cycles.find((x) => x.status === st);
    if (c) return c.uuid;
  }
  return cycles[0].uuid;
}

export function CycleSelect({ cycles, value, onChange }: { cycles: Cycle[]; value: string | null; onChange: (uuid: string) => void }) {
  return (
    <Select<string>
      className="w-[300px]"
      value={value}
      onChange={(v) => v && onChange(v)}
      options={cycles.filter((c) => c.status !== "draft").map((c) => ({ value: c.uuid, label: c.name, description: CYCLE_STATUS[c.status]?.label }))}
      placeholder="Pick a review cycle"
    />
  );
}

/** Live score for a form: weighted average of items per section, sections by weight. */
export function scoreSections(sections: FormSection[], answers: Answers): number | null {
  let total = 0, weights = 0;
  for (const s of sections) {
    let st = 0, sw = 0;
    for (const it of s.items) {
      if (it.type === "text") continue;
      const r = answers.items[`${s.key}:${it.ref}`]?.rating;
      if (r === null || r === undefined) continue;
      const w = it.weight || 1;
      st += r * w; sw += w;
    }
    if (sw > 0 && s.weight > 0) { total += (st / sw) * s.weight; weights += s.weight; }
    else if (sw > 0 && sections.every((x) => !x.weight)) { total += st / sw; weights += 1; }
  }
  return weights ? total / weights : null;
}

export function ScaleLegend({ scale }: { scale: ScalePoint[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {scale.map((p) => <RatingPill key={p.value} value={p.value} label={p.label} scale={scale} />)}
    </div>
  );
}

/* ── Acknowledge a calibrated rating ─────────────────────────────────── */

export function AckModal({ row, onClose, onDone }: { row: ParticipantRow | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [choice, setChoice] = useState<"accept" | "decline">("accept");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!row) return;
    setBusy(true);
    try {
      await api.post(`/performance/participants/${row.uuid}/acknowledge`, { accept: choice === "accept", note: note || null });
      toast.success(choice === "accept" ? "Rating accepted" : "Your concern was sent to HR");
      onDone(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={!!row} onClose={onClose} size="md" busy={busy} title="Calibrated rating"
      description={row ? `${row.employee?.name} · ${row.cycle?.name ?? ""}` : undefined}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={save}>{choice === "accept" ? "Accept" : "Send disagreement"}</Button></>}>
      {row && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line p-4">
              <p className="text-[12.5px] text-muted">Your review gave</p>
              <div className="mt-2"><RatingPill value={row.proposed_rating} label={row.proposed_label} muted /></div>
            </div>
            <div className="rounded-xl border border-primary/25 bg-primary-soft/40 p-4">
              <p className="text-[12.5px] text-muted">After calibration</p>
              <div className="mt-2"><RatingPill value={row.calibrated_rating} label={row.calibrated_label} /></div>
            </div>
          </div>
          {row.calibration_reason && (
            <p className="rounded-xl bg-sunken/60 px-4 py-3 text-[13.5px] text-ink/80">“{row.calibration_reason}”{row.calibrated_by && <span className="text-muted"> — {row.calibrated_by}</span>}</p>
          )}
          <RadioCards<"accept" | "decline"> value={choice} onChange={setChoice} options={[
            { value: "accept", label: "I agree", description: "The new rating is fair." },
            { value: "decline", label: "I disagree", description: "HR will look at it again before publishing." },
          ]} />
          <Field label={choice === "decline" ? "Why do you disagree?" : "Note (optional)"} required={choice === "decline"}>
            <Textarea value={note} onValueChange={setNote} rows={3} autoGrow />
          </Field>
        </div>
      )}
    </Modal>
  );
}

/* ── Employee's response to a published review ───────────────────────── */

export function RespondModal({ uuid, onClose, onDone }: { uuid: string | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [choice, setChoice] = useState<"agree" | "disagree">("agree");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!uuid) return;
    setBusy(true);
    try {
      await api.post(`/performance/participants/${uuid}/respond`, { response: choice, note: note || null });
      toast.success("Thanks, your response was shared with your manager");
      onDone(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={!!uuid} onClose={onClose} size="md" busy={busy} title="Your response"
      description="Tell your manager how you feel about this review."
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={save}>Send</Button></>}>
      <div className="space-y-5">
        <RadioCards<"agree" | "disagree"> value={choice} onChange={setChoice} options={[
          { value: "agree", label: "I agree", description: "The review reflects my work." },
          { value: "disagree", label: "I disagree", description: "I'd like to talk about it." },
        ]} />
        <Field label={choice === "disagree" ? "What should be looked at again?" : "Comment (optional)"} required={choice === "disagree"}>
          <Textarea value={note} onValueChange={setNote} rows={4} autoGrow />
        </Field>
      </div>
    </Modal>
  );
}

/* ── Letters ─────────────────────────────────────────────────────────── */

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function LetterModal({ path, title, onClose }: { path: string | null; title: string; onClose: () => void }) {
  const [letter, setLetter] = useState<Letter | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!path) return;
    let live = true;
    setLetter(null); setError(null);
    api.get<Letter>(path).then((l) => { if (live) setLetter(l); }).catch((e) => { if (live) setError(e instanceof Error ? e.message : "Not available"); });
    return () => { live = false; };
  }, [path]);
  const when = letter?.generated_at || letter?.released_at;
  const paragraphs = useMemo(() => (letter?.body ?? "").split(/\n{2,}/), [letter]);

  function print() {
    if (!letter) return;
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) return;
    const body = paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`).join("");
    w.document.write(`<!doctype html><html><head><title>${escapeHtml(title)}</title><style>
      body{font-family:Georgia,serif;color:#1f2937;margin:64px 72px;line-height:1.65;font-size:15px}
      .ref{display:flex;justify-content:space-between;color:#6b7280;font-size:13px;margin-bottom:40px}
      h1{font-weight:400;font-size:22px;margin:0 0 28px} p{margin:0 0 16px}
    </style></head><body><div class="ref"><span>Ref: ${escapeHtml(letter.letter_no ?? "")}</span><span>${when ? escapeHtml(formatLongDate(when)) : ""}</span></div>
    <h1>${escapeHtml(title)}</h1>${body}<script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
  }

  return (
    <Modal open={!!path} onClose={onClose} size="lg" title={title} description={letter ? letter.cycle : undefined}
      footer={<><ModalCancel>Close</ModalCancel><Button variant="primary" icon={Printer} disabled={!letter} onClick={print}>Print or save as PDF</Button></>}>
      {error ? <p className="py-10 text-center text-[14px] text-muted">{error}</p> : !letter ? (
        <div className="space-y-3 py-6">{[0, 1, 2, 3].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-sunken" style={{ width: `${90 - i * 12}%` }} />)}</div>
      ) : (
        <article className="mx-auto max-w-[560px] rounded-xl border border-line bg-white px-10 py-10 font-serif text-[15px] leading-[1.7] text-ink/90">
          <div className="mb-8 flex justify-between text-[12.5px] text-muted [font-family:inherit]">
            <span>Ref: {letter.letter_no ?? "—"}</span>
            {when && <span>{formatLongDate(when)}</span>}
          </div>
          {paragraphs.map((p, i) => <p key={i} className="mb-4 whitespace-pre-line">{p}</p>)}
        </article>
      )}
    </Modal>
  );
}
