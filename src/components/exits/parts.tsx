"use client";

/*
 * Building blocks shared by the exit pages:
 *   <ClearanceCard c={...} onSaved={refresh} canEdit />    one department's clearance with items and actions
 *   <InterviewForm interview={...} onSubmit={(body) => ...} />  exit interview form
 *   <SettlementPanel s={...} />                              2-working-day countdown
 *   <Bar label value max />                                  a thin CSS bar for analytics
 */
import { useEffect, useState } from "react";
import { AlarmClock, CheckCircle2, CircleDashed, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, Checkbox, Field, FormGrid, MasterSelect, NumberInput, RadioCards, Textarea, TextInput, formatDisplayDate,
} from "@/components/ui-kit";
import { SETTLEMENT_STATE, errMsg, money, type Clearance, type Interview, type Settlement } from "./types";

const S = 1.4;

export function ClearanceCard({ c, onSaved, canEdit }: { c: Clearance; onSaved: (c: Clearance) => void; canEdit: boolean }) {
  const toast = useToast();
  const [items, setItems] = useState(c.items);
  const [remarks, setRemarks] = useState(c.remarks ?? "");
  const [recovery, setRecovery] = useState<number | null>(c.recovery_amount ? Number(c.recovery_amount) : null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setItems(c.items); setRemarks(c.remarks ?? ""); setRecovery(c.recovery_amount ? Number(c.recovery_amount) : null); }, [c]);

  async function save(status?: string, force = false) {
    setBusy(true);
    try {
      const out = await api.put<Clearance>(`/exits/clearances/${c.uuid}`, {
        items: items.map((i) => ({ label: i.label, done: i.done })), remarks,
        recovery_amount: recovery === null ? null : String(recovery), ...(status ? { status } : {}), force,
      });
      toast.success(status === "cleared" ? "Cleared" : status === "pending" ? "Reopened" : status ? "Marked not needed" : "Saved");
      onSaved(out);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  const tone = c.status === "cleared" ? "good" : c.status === "not_applicable" ? "neutral" : c.delayed ? "bad" : "warn";
  const statusLabel = c.status === "cleared" ? "Cleared" : c.status === "not_applicable" ? "Not needed" : c.delayed ? `${c.days_late} day${c.days_late === 1 ? "" : "s"} late` : "Pending";
  const open = c.status === "pending";
  return (
    <div className={`rounded-xl border p-4 ${c.delayed && open ? "border-rose-200 bg-rose-50/30" : "border-line bg-surface"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[14.5px] text-ink">{c.label}</p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {c.department_label} · {c.owner_name || "HR"} · due {formatDisplayDate(c.due_date)}
            {c.cleared_by && <> · {c.status === "cleared" ? "cleared" : "closed"} by {c.cleared_by}</>}
          </p>
        </div>
        <Badge tone={tone} dot>{statusLabel}</Badge>
      </div>
      {items.length > 0 && (
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {items.map((it, i) => (
            <Checkbox key={it.label} checked={it.done} disabled={!canEdit || !open} label={it.label}
              onChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, done: v } : x)))} />
          ))}
        </div>
      )}
      {canEdit && open && (
        <FormGrid columns={2} className="mt-3">
          <Field label="Remarks"><TextInput value={remarks} onValueChange={setRemarks} placeholder="Optional" /></Field>
          <Field label="Amount to recover" hint="For damage, loss or dues; deducted in the settlement">
            <NumberInput value={recovery} onChange={setRecovery} min={0} />
          </Field>
        </FormGrid>
      )}
      {!open && c.remarks && <p className="mt-2 text-[13px] text-muted">{c.remarks}</p>}
      {!open && c.recovery_amount && <p className="mt-1 text-[13px] text-muted">Recover {money(c.recovery_amount)}</p>}
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          {open ? (
            <>
              <Button size="sm" variant="primary" icon={CheckCircle2} loading={busy} onClick={() => save("cleared")}>Clear</Button>
              {items.some((i) => !i.done && !i.asset_assignment) && (
                <Button size="sm" variant="secondary" loading={busy} onClick={() => save("cleared", true)}>Clear anyway</Button>
              )}
              <Button size="sm" variant="secondary" loading={busy} onClick={() => save()}>Save</Button>
              <Button size="sm" variant="ghost" icon={CircleDashed} loading={busy} onClick={() => save("not_applicable")}>Not needed</Button>
            </>
          ) : (
            <Button size="sm" variant="ghost" icon={RotateCcw} loading={busy} onClick={() => save("pending")}>Reopen</Button>
          )}
        </div>
      )}
    </div>
  );
}

export type InterviewBody = {
  ratings: Record<string, number>; answers: Record<string, string>; would_rejoin: string | null; would_recommend: number | null;
  primary_reason_id: number | null; checklist: Record<string, boolean>; interviewer_notes?: string | null;
};

const CHECKLIST = [
  ["equipment", "All equipment handed in"], ["id_card", "ID and access cards returned"], ["documents", "Company documents returned"],
  ["notice_followed", "Notice period followed"], ["resignation_letter", "Resignation letter on file"],
] as const;

export function InterviewForm({ interview, onSubmit, interviewer, busy, readOnly }: {
  interview: Interview; onSubmit: (b: InterviewBody) => void; interviewer?: boolean; busy?: boolean; readOnly?: boolean;
}) {
  const [ratings, setRatings] = useState<Record<string, number>>(interview.ratings || {});
  const [answers, setAnswers] = useState<Record<string, string>>(interview.answers || {});
  const [rejoin, setRejoin] = useState<string | null>(interview.would_rejoin);
  const [recommend, setRecommend] = useState<number | null>(interview.would_recommend);
  const [reason, setReason] = useState<number | null>(interview.primary_reason_id);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(interview.checklist || {});
  const [notes, setNotes] = useState(interview.interviewer_notes ?? "");
  const ro = !!readOnly;
  return (
    <form id="exit-interview-form" className="space-y-6" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({ ratings, answers, would_rejoin: rejoin, would_recommend: recommend, primary_reason_id: reason, checklist,
        ...(interviewer ? { interviewer_notes: notes } : {}) });
    }}>
      <div>
        <p className="mb-2 text-[13px] text-muted">How was it? 1 is poor, 5 is great.</p>
        <div className="space-y-2">
          {Object.entries(interview.rating_areas).map(([k, label]) => (
            <div key={k} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[14px] text-ink">{label}</span>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" disabled={ro} onClick={() => setRatings({ ...ratings, [k]: n })}
                    className={`h-8 w-8 rounded-lg border text-[13px] transition-colors ${ratings[k] === n ? "border-primary bg-primary text-white" : "border-line bg-surface text-muted hover:border-line-strong"}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Field label="Main reason for leaving">
        <MasterSelect type="exit_reason" value={reason} onChange={(v) => setReason(v)} clearable disabled={ro} allowCreate={false} />
      </Field>
      {interview.questions.map((q) => (
        <Field key={q.key} label={q.label}>
          <Textarea value={answers[q.key] ?? ""} onValueChange={(v) => setAnswers({ ...answers, [q.key]: v })} rows={2} autoGrow disabled={ro} />
        </Field>
      ))}
      <FormGrid columns={2}>
        <Field label="Would you work here again?">
          <RadioCards columns={3} value={rejoin ?? ""} onChange={(v) => !ro && setRejoin(v)}
            options={[{ value: "yes", label: "Yes" }, { value: "maybe", label: "Maybe" }, { value: "no", label: "No" }]} />
        </Field>
        <Field label="Would you recommend us to a friend? (0-10)">
          <NumberInput value={recommend} onChange={setRecommend} min={0} max={10} disabled={ro} />
        </Field>
      </FormGrid>
      {interviewer && (
        <>
          <div>
            <p className="mb-2 text-[13px] text-muted">Exit checklist</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {CHECKLIST.map(([k, label]) => (
                <Checkbox key={k} label={label} checked={!!checklist[k]} disabled={ro} onChange={(v) => setChecklist({ ...checklist, [k]: v })} />
              ))}
            </div>
          </div>
          <Field label="Interviewer notes" hint="Not shown to the leaver">
            <Textarea value={notes} onValueChange={setNotes} rows={2} autoGrow disabled={ro} />
          </Field>
        </>
      )}
      {!ro && <div className="flex justify-end"><Button type="submit" variant="primary" loading={busy}>Submit interview</Button></div>}
    </form>
  );
}

export function SettlementPanel({ s, lastDay }: { s: Settlement; lastDay: string }) {
  const st = SETTLEMENT_STATE[s.state ?? "not_started"] ?? SETTLEMENT_STATE.not_started;
  const big = s.state === "paid_on_time" || s.state === "paid_late" ? "Paid" :
    s.working_days_left === undefined ? "—" : s.working_days_left < 0 ? `${-s.working_days_left}` : `${s.working_days_left}`;
  const sub = s.state === "paid_on_time" || s.state === "paid_late" ? `on ${formatDisplayDate(s.paid_on)}` :
    (s.working_days_left ?? 0) < 0 ? "working days late" : "working days left";
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${st.tone === "bad" ? "bg-rose-50 text-rose-600" : st.tone === "good" ? "bg-emerald-50 text-emerald-600" : "bg-sunken text-muted"}`}>
            <AlarmClock size={22} strokeWidth={S} />
          </span>
          <div>
            <p className="tabular text-[30px] font-extralight leading-none text-ink">{big}</p>
            <p className="mt-1 text-[12.5px] text-muted">{sub}</p>
          </div>
        </div>
        <div className="text-right">
          <Badge tone={st.tone} dot>{st.label}</Badge>
          <p className="mt-1.5 text-[13px] text-muted">Due by {formatDisplayDate(s.due_date) || "—"}</p>
          <p className="text-[12px] text-faint">Last working day {formatDisplayDate(lastDay)} + 2 working days (Code on Wages)</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 border-t border-line pt-4 text-[13.5px] sm:grid-cols-3">
        <div><p className="text-[12px] text-faint">Handed to payroll</p><p className="text-ink">{s.handed_at ? "Yes" : "Not yet"}</p></div>
        <div><p className="text-[12px] text-faint">Payroll settlement</p><p className="text-ink">{s.payroll ? `${s.payroll.number ?? "Draft"} · ${s.payroll.status.replace("_", " ")}` : "Not prepared yet"}</p></div>
        <div><p className="text-[12px] text-faint">Net payable</p><p className="text-ink">{s.payroll?.net ? money(s.payroll.net) : "—"}</p></div>
      </div>
    </div>
  );
}

export function Bar({ label, value, max, suffix, tone = "primary" }: { label: string; value: number | null; max: number; suffix?: string; tone?: "primary" | "good" | "bad" | "warn" }) {
  const pct = value === null || !max ? 0 : Math.max(2, Math.min(100, (value / max) * 100));
  const color = { primary: "bg-primary/70", good: "bg-emerald-500/70", bad: "bg-rose-500/70", warn: "bg-amber-500/70" }[tone];
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[13px]">
        <span className="text-ink">{label}</span>
        <span className="tabular text-muted">{value === null ? "—" : `${value}${suffix ?? ""}`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-sunken">
        <div className={`h-full rounded-full ${color} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
