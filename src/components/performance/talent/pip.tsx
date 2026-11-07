"use client";

/*
 * Performance improvement plan modals.
 *   <PipFormModal open pip={null | PipItem} onClose onSaved />   start (or edit) a plan: employee,
 *       reason, dates, goals with measure and due date, support; save as draft or start now
 *   <PipModal uuid onClose onChanged />                          the plan: summary, goals, check-ins,
 *       add check-in, close (successful / extended / unsuccessful), start a draft, acknowledge
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Circle, CircleSlash, ClipboardCheck, Flag, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime, todayISO } from "@/lib/datetime";
import {
  Avatar, Badge, Button, DateInput, DateRangeInput, Field, FormGrid, FormSection, IconButton, KeyValue, Modal, ModalCancel, RadioCards,
  Select, Skeleton, Textarea, TextInput, Timeline, type BadgeTone, type SelectOption,
} from "@/components/ui-kit";
import { ProgressBar, searchEmployees, STROKE } from "../shared";
import type { PipGoal, PipItem } from "../types";

const err = (e: unknown) => (e instanceof Error ? e.message : undefined);

export const PIP_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" }, active: { label: "Active", tone: "accent" },
  extended: { label: "Extended", tone: "warn" }, closed: { label: "Closed", tone: "neutral" },
};
export const OUTCOME: Record<string, { label: string; tone: BadgeTone }> = {
  successful: { label: "Successful", tone: "good" }, unsuccessful: { label: "Unsuccessful", tone: "bad" }, extended: { label: "Extended", tone: "warn" },
};
const RATING: Record<string, { label: string; tone: "good" | "warn" | "bad" }> = {
  on_track: { label: "On track", tone: "good" }, some_progress: { label: "Some progress", tone: "warn" }, off_track: { label: "Off track", tone: "bad" },
};
const GOAL_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  open: { label: "Open", tone: "neutral" }, met: { label: "Met", tone: "good" }, not_met: { label: "Not met", tone: "bad" },
};

export function PipStatusBadge({ p }: { p: Pick<PipItem, "status" | "outcome"> }) {
  if (p.status === "closed" && p.outcome) return <Badge tone={OUTCOME[p.outcome]?.tone ?? "neutral"} dot>{OUTCOME[p.outcome]?.label ?? p.outcome}</Badge>;
  const s = PIP_STATUS[p.status] ?? { label: p.status, tone: "neutral" as BadgeTone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

type GoalDraft = { id?: string; title: string; measure: string; due_date: string; status?: string };

function newGoal(): GoalDraft { return { title: "", measure: "", due_date: "" }; }

/* ── Start / edit ─────────────────────────────────────────────────────── */

export function PipFormModal({ open, pip, onClose, onSaved }: { open: boolean; pip: PipItem | null; onClose: () => void; onSaved: (uuid: string) => void }) {
  const toast = useToast();
  const [emp, setEmp] = useState<number | null>(pip?.employee?.id ?? null);
  const [empOpt, setEmpOpt] = useState<SelectOption<number> | null>(pip?.employee ? { value: pip.employee.id, label: pip.employee.name } : null);
  const [reason, setReason] = useState(pip?.reason ?? "");
  const [range, setRange] = useState({ from: pip?.start_date ?? todayISO(), to: pip?.end_date ?? "" });
  const [goals, setGoals] = useState<GoalDraft[]>(pip?.goals.map((g) => ({ ...g, measure: g.measure ?? "", due_date: g.due_date ?? "" })) ?? [newGoal()]);
  const [support, setSupport] = useState(pip?.support ?? "");
  const [saving, setSaving] = useState<"draft" | "start" | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editing = !!pip;

  async function save(draft: boolean) {
    const er: Record<string, string> = {};
    if (!emp) er.emp = "Pick the employee.";
    if (!reason.trim()) er.reason = "Say why the plan is needed.";
    if (!range.from || !range.to || range.to <= range.from) er.range = "Pick a start and an end date after it.";
    if (!goals.some((g) => g.title.trim())) er.goals = "Add at least one goal.";
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(draft ? "draft" : "start");
    const body = {
      employee_id: emp, reason: reason.trim(), start_date: range.from, end_date: range.to, support: support.trim() || null,
      goals: goals.filter((g) => g.title.trim()).map((g) => ({ ...g, due_date: g.due_date || null })), draft,
    };
    try {
      const r = editing ? await api.put<PipItem>(`/performance/pips/${pip!.uuid}`, body) : await api.post<PipItem>("/performance/pips", body);
      toast.success(editing ? "Plan updated" : draft ? "Saved as draft" : "Plan started", { description: draft || editing ? undefined : `${r.employee?.name} has been told and can read it now.` });
      onSaved(r.uuid);
    } catch (x) {
      toast.error("Couldn't save the plan", { description: err(x) });
    } finally {
      setSaving(null);
    }
  }

  const setGoal = (i: number, patch: Partial<GoalDraft>) => setGoals((gs) => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));

  return (
    <Modal open={open} onClose={onClose} size="lg" busy={!!saving} dirty={!!reason.trim() || goals.some((g) => g.title)}
      title={editing ? "Edit improvement plan" : "Start an improvement plan"}
      description="Clear goals, a fair timeline and the support you will give. The employee sees everything except your private notes."
      footer={<>
        <ModalCancel />
        {!editing && <Button variant="secondary" onClick={() => save(true)} loading={saving === "draft"}>Save as draft</Button>}
        <Button variant="primary" onClick={() => save(false)} loading={saving === "start"}>{editing ? "Save changes" : "Start plan"}</Button>
      </>}>
      <div className="space-y-8">
        <FormSection title="The plan">
          <div className="space-y-5">
            <Field label="Employee" required error={errors.emp}>
              <Select<number> value={emp} selectedOption={empOpt} loadOptions={searchEmployees} disabled={editing} placeholder="Search your team"
                onChange={(v, o) => { setEmp(v); setEmpOpt(o); }} />
            </Field>
            <Field label="Why it is needed" required error={errors.reason} hint="Facts and examples, not opinions.">
              <Textarea value={reason} onValueChange={setReason} rows={3} autoGrow maxLength={5000} />
            </Field>
            <Field label="Duration" required error={errors.range} hint="Usually 30, 60 or 90 days.">
              <DateRangeInput value={range} onChange={setRange} />
            </Field>
          </div>
        </FormSection>
        <FormSection title="Goals" description="What success looks like by the end of the plan.">
          {errors.goals && <p className="mb-3 text-[13px] text-rose-700">{errors.goals}</p>}
          <div className="space-y-3">
            {goals.map((g, i) => (
              <div key={i} className="rounded-xl border border-line p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sunken text-[12px] text-muted tabular">{i + 1}</span>
                  <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[1fr_170px]">
                    <TextInput value={g.title} onValueChange={(v) => setGoal(i, { title: v })} placeholder="Close 3 new accounts" aria-label="Goal" maxLength={300} />
                    <DateInput value={g.due_date} onChange={(v) => setGoal(i, { due_date: v })} placeholder="Due by" clearable />
                    <TextInput value={g.measure} onValueChange={(v) => setGoal(i, { measure: v })} placeholder="How it is measured" aria-label="Measure" className="sm:col-span-2" maxLength={500} />
                  </div>
                  <IconButton icon={Trash2} label="Remove goal" size="sm" disabled={goals.length === 1} onClick={() => setGoals((gs) => gs.filter((_, j) => j !== i))} />
                </div>
              </div>
            ))}
          </div>
          <Button variant="ghost" icon={Plus} className="mt-3" onClick={() => setGoals((gs) => [...gs, newGoal()])}>Add goal</Button>
        </FormSection>
        <FormSection title="Support">
          <Field label="Help the company will give" hint="Coaching, training, more frequent check-ins…">
            <Textarea value={support} onValueChange={setSupport} rows={3} autoGrow />
          </Field>
        </FormSection>
      </div>
    </Modal>
  );
}

/* ── Check-in ─────────────────────────────────────────────────────────── */

function CheckinModal({ pip, open, onClose, onSaved }: { pip: PipItem; open: boolean; onClose: () => void; onSaved: (p: PipItem) => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [rating, setRating] = useState<"on_track" | "some_progress" | "off_track">("some_progress");
  const [date, setDate] = useState(todayISO());
  const [statuses, setStatuses] = useState<Record<string, string>>(Object.fromEntries(pip.goals.map((g) => [g.id, g.status])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!note.trim()) { setError("Write a short note."); return; }
    setSaving(true);
    try {
      const r = await api.post<PipItem>(`/performance/pips/${pip.uuid}/checkins`, {
        note: note.trim(), rating, checkin_date: date,
        goal_status: Object.entries(statuses).map(([id, status]) => ({ id, status })),
      });
      toast.success("Check-in added");
      onSaved(r);
    } catch (x) {
      toast.error("Couldn't add the check-in", { description: err(x) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" title="Add check-in" busy={saving} dirty={!!note.trim()} zIndex={60}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Add check-in</Button></>}>
      <div className="space-y-5">
        <FormGrid columns={2}>
          <Field label="Date"><DateInput value={date} onChange={setDate} max={todayISO()} /></Field>
        </FormGrid>
        <Field label="Overall">
          <RadioCards value={rating} onChange={setRating} columns={3} options={[
            { value: "on_track", label: "On track" }, { value: "some_progress", label: "Some progress" }, { value: "off_track", label: "Off track" },
          ]} />
        </Field>
        <Field label="Note" required error={error}>
          <Textarea value={note} onValueChange={(v) => { setNote(v); setError(null); }} rows={4} autoGrow placeholder="What changed since the last check-in." />
        </Field>
        <div>
          <p className="mb-2 text-[14px] text-ink">Goals</p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {pip.goals.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 text-[14px] text-ink/85">{g.title}</span>
                <div className="flex gap-1">
                  {(["open", "met", "not_met"] as const).map((s) => (
                    <button key={s} type="button" onClick={() => setStatuses((st) => ({ ...st, [g.id]: s }))}
                      className={`rounded-full border px-2.5 py-0.5 text-[12px] transition-colors ${statuses[g.id] === s ? "border-primary/40 bg-primary-soft text-primary" : "border-line text-muted hover:border-line-strong"}`}>
                      {GOAL_STATUS[s].label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

/* ── Close ────────────────────────────────────────────────────────────── */

function CloseModal({ pip, open, onClose, onSaved }: { pip: PipItem; open: boolean; onClose: () => void; onSaved: (p: PipItem) => void }) {
  const toast = useToast();
  const [outcome, setOutcome] = useState<"successful" | "extended" | "unsuccessful">("successful");
  const [note, setNote] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (outcome === "extended" && (!newEnd || newEnd <= pip.end_date)) { setError("Pick a new end date after the current one."); return; }
    setSaving(true);
    try {
      const r = await api.post<PipItem>(`/performance/pips/${pip.uuid}/close`, { outcome, note: note.trim() || null, new_end_date: outcome === "extended" ? newEnd : null });
      toast.success(outcome === "extended" ? "Plan extended" : "Plan closed");
      onSaved(r);
    } catch (x) {
      toast.error("Couldn't save", { description: err(x) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" title="Close or extend the plan" busy={saving} zIndex={60}
      description={`${pip.goals_met} of ${pip.goals.length} goals met so far.`}
      footer={<><ModalCancel /><Button variant={outcome === "unsuccessful" ? "danger" : "primary"} onClick={save} loading={saving}>
        {outcome === "extended" ? "Extend plan" : "Close plan"}</Button></>}>
      <div className="space-y-5">
        <RadioCards value={outcome} onChange={(v) => { setOutcome(v); setError(null); }} columns={1} options={[
          { value: "successful", label: "Successful", description: "The goals were met. The plan ends here.", icon: CheckCircle2 },
          { value: "extended", label: "Extend", description: "Good progress, but more time is needed.", icon: CalendarClock },
          { value: "unsuccessful", label: "Unsuccessful", description: "The goals were not met. HR will advise on next steps.", icon: CircleSlash },
        ]} />
        {outcome === "extended" && (
          <Field label="New end date" required error={error}><DateInput value={newEnd} onChange={setNewEnd} min={pip.end_date} /></Field>
        )}
        <Field label="Note" hint="Shared with the employee.">
          <Textarea value={note} onValueChange={setNote} rows={3} autoGrow />
        </Field>
      </div>
    </Modal>
  );
}

/* ── The plan ─────────────────────────────────────────────────────────── */

function GoalRow({ g }: { g: PipGoal }) {
  const Icon = g.status === "met" ? CheckCircle2 : g.status === "not_met" ? CircleSlash : Circle;
  const color = g.status === "met" ? "text-emerald-600" : g.status === "not_met" ? "text-rose-600" : "text-faint";
  return (
    <li className="flex items-start gap-3 py-3">
      <Icon size={18} strokeWidth={STROKE} className={`mt-0.5 shrink-0 ${color}`} />
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] text-ink">{g.title}</p>
        {(g.measure || g.due_date) && (
          <p className="text-[12.5px] text-muted">{[g.measure, g.due_date && `by ${formatDate(g.due_date)}`].filter(Boolean).join(" · ")}</p>
        )}
      </div>
      <Badge tone={GOAL_STATUS[g.status]?.tone ?? "neutral"}>{GOAL_STATUS[g.status]?.label ?? g.status}</Badge>
    </li>
  );
}

export function PipModal({ uuid, onClose, onChanged, onEdit }: { uuid: string | null; onClose: () => void; onChanged: () => void; onEdit: (p: PipItem) => void }) {
  const toast = useToast();
  const [p, setP] = useState<PipItem | null>(null);
  const [checkin, setCheckin] = useState(false);
  const [closing, setClosing] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback((id: string) => {
    api.get<PipItem>(`/performance/pips/${id}`).then(setP).catch((x) => { toast.error("Couldn't open the plan", { description: err(x) }); onClose(); });
  }, [toast, onClose]);
  useEffect(() => { if (uuid) { setP(null); load(uuid); } }, [uuid, load]);
  const shown = p && (!uuid || p.uuid === uuid) ? p : null;

  async function act(path: string, done: string) {
    if (!shown) return;
    setBusy(true);
    try {
      await api.post(`/performance/pips/${shown.uuid}/${path}`);
      toast.success(done);
      load(shown.uuid);
      onChanged();
    } catch (x) {
      toast.error("Couldn't save", { description: err(x) });
    } finally {
      setBusy(false);
    }
  }

  const running = shown && (shown.status === "active" || shown.status === "extended");
  const updated = (r: PipItem) => { setP(r); setCheckin(false); setClosing(false); onChanged(); };

  return (
    <>
      <Modal open={!!uuid} onClose={onClose} size="xl" busy={busy}
        title={shown ? `Improvement plan · ${shown.employee?.name ?? ""}` : "Improvement plan"}
        description={shown ? `${formatDate(shown.start_date)} to ${formatDate(shown.end_date)}` : undefined}
        headerActions={shown && <PipStatusBadge p={shown} />}
        footerStart={shown?.can_manage && shown.status !== "closed" ? (
          <Button variant="ghost" size="sm" icon={Pencil} onClick={() => onEdit(shown)}>Edit</Button>
        ) : undefined}
        footer={<>
          <ModalCancel>Close</ModalCancel>
          {shown?.is_mine && !shown.acknowledged_at && shown.status !== "draft" && (
            <Button variant="primary" icon={ClipboardCheck} loading={busy} onClick={() => act("acknowledge", "Thanks — acknowledged")}>I have read this plan</Button>
          )}
          {shown?.can_manage && shown.status === "draft" && (
            <Button variant="primary" icon={Play} loading={busy} onClick={() => act("activate", "Plan started")}>Start plan</Button>
          )}
          {shown?.can_manage && running && <>
            <Button variant="secondary" icon={Flag} onClick={() => setClosing(true)}>Close or extend</Button>
            <Button variant="primary" icon={Plus} onClick={() => setCheckin(true)}>Add check-in</Button>
          </>}
        </>}>
        {!shown ? (
          <div className="space-y-4"><Skeleton className="h-20" /><Skeleton className="h-40" /></div>
        ) : (
          <div className="grid gap-8 md:grid-cols-[1fr_300px]">
            <div className="min-w-0 space-y-8">
              <section>
                <h3 className="mb-2 text-[15px] text-ink">Why</h3>
                <p className="whitespace-pre-line text-[14.5px] leading-relaxed text-ink/85">{shown.reason}</p>
              </section>
              <section>
                <div className="mb-1 flex items-baseline justify-between">
                  <h3 className="text-[15px] text-ink">Goals</h3>
                  <span className="text-[13px] text-muted tabular">{shown.goals_met} of {shown.goals.length} met</span>
                </div>
                <ul className="divide-y divide-line">{shown.goals.map((g) => <GoalRow key={g.id} g={g} />)}</ul>
              </section>
              {shown.support && (
                <section>
                  <h3 className="mb-2 text-[15px] text-ink">Support</h3>
                  <p className="whitespace-pre-line text-[14px] text-ink/80">{shown.support}</p>
                </section>
              )}
              <section>
                <h3 className="mb-3 text-[15px] text-ink">Check-ins</h3>
                {shown.checkins.length ? (
                  <Timeline items={[...shown.checkins].reverse().map((c) => ({
                    id: c.uuid, tone: c.rating ? RATING[c.rating].tone : "neutral",
                    title: <span className="flex flex-wrap items-center gap-2">{c.rating ? RATING[c.rating].label : "Check-in"}<span className="text-[12.5px] text-faint">by {c.author}</span></span>,
                    time: formatDate(c.date), description: <span className="whitespace-pre-line">{c.note}</span>,
                  }))} />
                ) : <p className="text-[13.5px] text-faint">No check-ins yet.</p>}
              </section>
              {shown.status === "closed" && shown.outcome_note && (
                <section className="rounded-xl bg-sunken/60 p-4">
                  <p className="text-[12px] uppercase tracking-[0.08em] text-faint">Outcome</p>
                  <p className="mt-1 text-[14px] text-ink">{shown.outcome_note}</p>
                </section>
              )}
            </div>
            <aside className="space-y-5">
              <div className="rounded-xl border border-line p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={shown.employee?.name ?? "?"} src={shown.employee?.photo} size={42} />
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] text-ink">{shown.employee?.name}</p>
                    <p className="truncate text-[12.5px] text-muted">{shown.employee?.designation ?? shown.employee?.department ?? ""}</p>
                  </div>
                </div>
                <div className="mt-5">
                  <div className="mb-1.5 flex justify-between text-[12.5px] text-muted">
                    <span>Time used</span>
                    <span className="tabular">{shown.status === "closed" ? "Ended" : shown.days_left >= 0 ? `${shown.days_left} days left` : "Past end date"}</span>
                  </div>
                  <ProgressBar value={shown.time_pct} tone={shown.days_left < 0 && shown.status !== "closed" ? "rose" : "indigo"} />
                  <div className="mb-1.5 mt-4 flex justify-between text-[12.5px] text-muted"><span>Goals met</span><span className="tabular">{shown.goals_met}/{shown.goals.length}</span></div>
                  <ProgressBar value={shown.goals.length ? (shown.goals_met / shown.goals.length) * 100 : 0} tone="emerald" />
                </div>
              </div>
              <KeyValue columns={1} items={[
                { label: "Manager", value: shown.manager?.name },
                { label: "Acknowledged", value: shown.acknowledged_at ? formatDateTime(shown.acknowledged_at) : <span className="text-amber-700">Not yet</span> },
                ...(shown.outcome ? [{ label: "Outcome", value: OUTCOME[shown.outcome]?.label ?? shown.outcome }] : []),
              ]} />
            </aside>
          </div>
        )}
      </Modal>
      {shown && <CheckinModal key={`c${shown.uuid}${checkin}`} pip={shown} open={checkin} onClose={() => setCheckin(false)} onSaved={updated} />}
      {shown && <CloseModal key={`x${shown.uuid}${closing}`} pip={shown} open={closing} onClose={() => setClosing(false)} onSaved={updated} />}
    </>
  );
}
