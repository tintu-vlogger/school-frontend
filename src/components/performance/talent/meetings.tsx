"use client";

/*
 * One-to-one meeting modals.
 *   <ScheduleMeetingModal open onClose onSaved={(m) => ...} />   book a 1:1 (manager with a reportee,
 *       or an employee with their manager)
 *   <MeetingModal uuid={uuid | null} onClose onChanged />        the meeting: shared agenda, shared
 *       notes and action items (both people see them), my private note (only me), mark done,
 *       reschedule and cancel.
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, CheckCircle2, Circle, Lock, Plus, Repeat, Trash2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, formatLongDate, formatTime, todayISO } from "@/lib/datetime";
import {
  Avatar, Badge, Button, DateInput, Field, FormGrid, IconButton, Modal, ModalCancel, NumberInput, Select, Skeleton, Textarea,
  TextInput, TimeInput, useConfirm, type SelectOption,
} from "@/components/ui-kit";
import { searchEmployees, STROKE } from "../shared";
import type { AgendaItem, Meeting } from "../types";
import { utcToZoned, zonedToUtc } from "./time";

export const RECURRENCE_OPTIONS: SelectOption<string>[] = [
  { value: "none", label: "Does not repeat" },
  { value: "weekly", label: "Every week" },
  { value: "fortnightly", label: "Every two weeks" },
  { value: "monthly", label: "Every month" },
];
export const recurrenceLabel = (r: string) => RECURRENCE_OPTIONS.find((o) => o.value === r)?.label ?? r;

const err = (e: unknown) => (e instanceof Error ? e.message : undefined);

/* ── Schedule ─────────────────────────────────────────────────────────── */

export function ScheduleMeetingModal({ open, onClose, onSaved, presetEmployee }: {
  open: boolean; onClose: () => void; onSaved: (m: Meeting) => void; presetEmployee?: SelectOption<number> | null;
}) {
  const toast = useToast();
  const [who, setWho] = useState<number | null>(presetEmployee?.value ?? null);
  const [whoOpt, setWhoOpt] = useState<SelectOption<number> | null>(presetEmployee ?? null);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayISO());
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState<number | null>(30);
  const [rec, setRec] = useState<string>("weekly");
  const [agenda, setAgenda] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dirty = !!(who || title || agenda);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!who) er.who = "Pick who you are meeting.";
    if (!date) er.date = "Pick a date.";
    if (!time) er.time = "Pick a time.";
    setErrors(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      const m = await api.post<Meeting>("/performance/one-on-ones", {
        employee_id: who, title: title.trim() || undefined, scheduled_at: zonedToUtc(date, time),
        duration_minutes: duration || 30, recurrence: rec,
        agenda: agenda.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      toast.success("One-to-one booked", { description: formatDateTime(m.scheduled_at) });
      onSaved(m);
    } catch (x) {
      toast.error("Couldn't book the meeting", { description: err(x) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" title="Schedule a one-to-one" busy={saving} dirty={dirty}
      description="A regular, private conversation between a manager and a team member."
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="oneonone-form" loading={saving}>Book meeting</Button></>}>
      <form id="oneonone-form" onSubmit={save} className="space-y-5">
        <Field label="With" required error={errors.who} hint="Your team members, or your own manager.">
          <Select<number> value={who} selectedOption={whoOpt} loadOptions={searchEmployees}
            onChange={(v, o) => { setWho(v); setWhoOpt(o); }} placeholder="Search people" />
        </Field>
        <Field label="Title" hint="Leave empty for “1:1 with …”.">
          <TextInput value={title} onValueChange={setTitle} placeholder="Weekly catch-up" maxLength={200} />
        </Field>
        <FormGrid columns={3}>
          <Field label="Date" required error={errors.date}><DateInput value={date} onChange={setDate} min={todayISO()} /></Field>
          <Field label="Time" required error={errors.time}><TimeInput value={time} onChange={setTime} /></Field>
          <Field label="Length"><NumberInput value={duration} onChange={setDuration} min={10} max={240} step={5} suffix="min" /></Field>
        </FormGrid>
        <Field label="Repeat">
          <Select<string> value={rec} onChange={(v) => setRec(v ?? "none")} options={RECURRENCE_OPTIONS} />
        </Field>
        <Field label="Agenda" hint="One topic per line. Both of you can add more later.">
          <Textarea value={agenda} onValueChange={setAgenda} rows={3} placeholder={"Wins this week\nBlockers\nCareer goals"} />
        </Field>
      </form>
    </Modal>
  );
}

/* ── Meeting ──────────────────────────────────────────────────────────── */

function newId() { return Math.random().toString(36).slice(2, 10); }

function ItemList({ items, onChange, placeholder, editable, empty }: {
  items: AgendaItem[]; onChange: (items: AgendaItem[]) => void; placeholder: string; editable: boolean; empty: string;
}) {
  const [text, setText] = useState("");
  function add() {
    const t = text.trim();
    if (!t) return;
    onChange([...items, { id: newId(), text: t, done: false }]);
    setText("");
  }
  return (
    <div>
      {items.length === 0 && <p className="py-2 text-[13.5px] text-faint">{empty}</p>}
      <ul className="divide-y divide-line">
        {items.map((it) => (
          <li key={it.id} className="group flex items-start gap-3 py-2.5">
            <button type="button" disabled={!editable} aria-label={it.done ? "Mark not done" : "Mark done"}
              onClick={() => onChange(items.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)))}
              className="mt-0.5 text-muted transition-colors hover:text-primary disabled:cursor-default">
              {it.done ? <CheckCircle2 size={18} strokeWidth={STROKE} className="text-emerald-600" /> : <Circle size={18} strokeWidth={STROKE} />}
            </button>
            <div className="min-w-0 flex-1">
              <p className={`text-[14px] ${it.done ? "text-faint line-through" : "text-ink"}`}>{it.text}</p>
              {it.by && <p className="text-[12px] text-faint">Added by {it.by}</p>}
            </div>
            {editable && (
              <IconButton icon={Trash2} label="Remove" size="sm" className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                onClick={() => onChange(items.filter((x) => x.id !== it.id))} />
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="mt-2 flex gap-2">
          <TextInput value={text} onValueChange={setText} placeholder={placeholder} maxLength={300}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <Button variant="secondary" icon={Plus} onClick={add} disabled={!text.trim()}>Add</Button>
        </div>
      )}
    </div>
  );
}

export function MeetingModal({ uuid, onClose, onChanged, onOpen }: {
  uuid: string | null; onClose: () => void; onChanged: () => void; onOpen?: (uuid: string) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [m, setM] = useState<Meeting | null>(null);
  const [notes, setNotes] = useState("");
  const [privateNote, setPrivateNote] = useState("");
  const [privateBase, setPrivateBase] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [resched, setResched] = useState<{ date: string; time: string } | null>(null);
  const [savedAt, setSavedAt] = useState<{ notes?: boolean; private?: boolean }>({});

  const load = useCallback(async (id: string) => {
    try {
      const r = await api.get<Meeting>(`/performance/one-on-ones/${id}`);
      setM(r); setNotes(r.shared_notes ?? ""); setPrivateNote(r.private_note ?? ""); setPrivateBase(r.private_note ?? ""); setResched(null); setSavedAt({});
    } catch (x) {
      toast.error("Couldn't open the meeting", { description: err(x) });
      onClose();
    }
  }, [toast, onClose]);

  useEffect(() => { if (uuid) { setM(null); load(uuid); } }, [uuid, load]);

  const shown = m && uuid && m.uuid === uuid ? m : (uuid ? null : m);
  const editable = !!shown?.is_participant && shown.status !== "cancelled";

  async function update(body: Record<string, unknown>, label?: string) {
    if (!shown) return;
    setBusy(label ?? "update");
    try {
      const r = await api.put<Meeting>(`/performance/one-on-ones/${shown.uuid}`, body);
      setM(r);
      if (label === "notes") setSavedAt((s) => ({ ...s, notes: true }));
      if (label === "resched") { setResched(null); toast.success("Rescheduled", { description: formatDateTime(r.scheduled_at) }); }
      if (label === "cancel") toast.success("Meeting cancelled");
      onChanged();
    } catch (x) {
      toast.error("Couldn't save", { description: err(x) });
    } finally {
      setBusy(null);
    }
  }

  async function savePrivate() {
    if (!shown) return;
    setBusy("private");
    try {
      await api.put(`/performance/one-on-ones/${shown.uuid}/private-note`, { note: privateNote });
      setPrivateBase(privateNote);
      setSavedAt((s) => ({ ...s, private: true }));
    } catch (x) {
      toast.error("Couldn't save your note", { description: err(x) });
    } finally {
      setBusy(null);
    }
  }

  async function complete() {
    if (!shown) return;
    setBusy("done");
    try {
      if (notes !== (shown.shared_notes ?? "")) await api.put(`/performance/one-on-ones/${shown.uuid}`, { shared_notes: notes });
      const r = await api.post<{ next_uuid: string | null }>(`/performance/one-on-ones/${shown.uuid}/complete`);
      onChanged();
      if (r.next_uuid) {
        toast.success("Marked done", {
          description: "The next one is booked, with open topics carried over.",
          action: onOpen ? { label: "Open next", onClick: () => onOpen(r.next_uuid!) } : undefined,
        });
      } else toast.success("Marked done");
      await load(shown.uuid);
    } catch (x) {
      toast.error("Couldn't mark it done", { description: err(x) });
    } finally {
      setBusy(null);
    }
  }

  async function cancelMeeting() {
    if (!shown) return;
    if (await confirm({ title: "Cancel this meeting?", message: "Both of you keep the agenda and notes. You can book a new one at any time.", confirmLabel: "Cancel meeting", tone: "danger" })) {
      await update({ status: "cancelled" }, "cancel");
    }
  }

  const other = shown ? (shown.role === "employee" ? shown.manager : shown.employee) : null;
  const statusBadge = shown && (
    shown.status === "done" ? <Badge tone="good" dot>Done</Badge>
      : shown.status === "cancelled" ? <Badge tone="neutral" dot>Cancelled</Badge>
        : <Badge tone="accent" dot>Scheduled</Badge>
  );

  return (
    <Modal open={!!uuid} onClose={onClose} size="xl" busy={busy === "done"}
      title={shown?.title ?? "One-to-one"}
      description={shown ? <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{formatLongDate(shown.scheduled_at)} · {formatTime(shown.scheduled_at)} · {shown.duration_minutes} min</span>
        {shown.recurrence !== "none" && <span className="inline-flex items-center gap-1"><Repeat size={13} strokeWidth={STROKE} />{recurrenceLabel(shown.recurrence)}</span>}
      </span> : undefined}
      headerActions={statusBadge}
      footerStart={shown?.is_participant && shown.status === "scheduled" ? (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" icon={CalendarClock} onClick={() => setResched(utcToZoned(shown.scheduled_at))}>Reschedule</Button>
          <Button variant="ghost" size="sm" icon={XCircle} onClick={cancelMeeting} loading={busy === "cancel"}>Cancel meeting</Button>
        </div>
      ) : undefined}
      footer={<>
        <ModalCancel>Close</ModalCancel>
        {shown?.is_participant && shown.status === "scheduled" && (
          <Button variant="primary" icon={Check} onClick={complete} loading={busy === "done"}>Mark done</Button>
        )}
      </>}>
      {!shown ? (
        <div className="grid gap-6 md:grid-cols-[1fr_300px]"><div className="space-y-3"><Skeleton className="h-6 w-40" /><Skeleton className="h-24" /><Skeleton className="h-32" /></div><Skeleton className="h-48" /></div>
      ) : (
        <div className="grid gap-8 md:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-7">
            {resched && (
              <div className="rounded-xl border border-line bg-sunken/50 p-4">
                <p className="mb-3 text-[14px] text-ink">Move to</p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-44"><DateInput value={resched.date} onChange={(d) => setResched({ ...resched, date: d })} min={todayISO()} /></div>
                  <div className="w-32"><TimeInput value={resched.time} onChange={(t) => setResched({ ...resched, time: t })} /></div>
                  <Button variant="primary" size="sm" loading={busy === "resched"} disabled={!resched.date || !resched.time}
                    onClick={() => update({ scheduled_at: zonedToUtc(resched.date, resched.time) }, "resched")}>Save</Button>
                  <Button variant="ghost" size="sm" onClick={() => setResched(null)}>Cancel</Button>
                </div>
              </div>
            )}
            <section>
              <h3 className="mb-1 text-[15px] text-ink">Agenda</h3>
              <p className="mb-2 text-[12.5px] text-muted">Shared. Either of you can add topics before the meeting.</p>
              <ItemList items={shown.agenda} editable={editable} placeholder="Add a topic" empty="No topics yet."
                onChange={(agenda) => { setM({ ...shown, agenda }); update({ agenda }); }} />
            </section>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[15px] text-ink">Shared notes</h3>
                {savedAt.notes && notes === (shown.shared_notes ?? "") && <span className="text-[12px] text-emerald-700">Saved</span>}
              </div>
              <Textarea value={notes} onValueChange={(v) => { setNotes(v); setSavedAt((s) => ({ ...s, notes: false })); }} rows={5} autoGrow
                disabled={!editable} placeholder="What you talked about and agreed." />
              {editable && (
                <div className="mt-2 flex justify-end">
                  <Button variant="secondary" size="sm" disabled={notes === (shown.shared_notes ?? "")} loading={busy === "notes"}
                    onClick={() => update({ shared_notes: notes }, "notes")}>Save notes</Button>
                </div>
              )}
            </section>
            <section>
              <h3 className="mb-1 text-[15px] text-ink">Action items</h3>
              <p className="mb-2 text-[12.5px] text-muted">Open items carry over to the next meeting.</p>
              <ItemList items={shown.action_items} editable={editable} placeholder="Add an action item" empty="No action items."
                onChange={(action_items) => { setM({ ...shown, action_items }); update({ action_items }); }} />
            </section>
          </div>
          <aside className="space-y-5">
            <div className="rounded-xl border border-line p-4">
              <p className="mb-3 text-[12px] uppercase tracking-[0.08em] text-faint">With</p>
              {other ? (
                <div className="flex items-center gap-3">
                  <Avatar name={other.name} src={other.photo} size={40} />
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] text-ink">{other.name}</p>
                    {other.designation && <p className="truncate text-[12.5px] text-muted">{other.designation}</p>}
                  </div>
                </div>
              ) : <p className="text-muted">—</p>}
              {shown.role === "admin" && (
                <p className="mt-3 text-[12.5px] text-muted">{shown.manager.name} with {shown.employee?.name}</p>
              )}
            </div>
            {shown.is_participant && (
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/40 p-4">
                <div className="mb-1 flex items-center gap-2 text-[14px] text-ink">
                  <Lock size={15} strokeWidth={STROKE} className="text-amber-700" /> My private notes
                </div>
                <p className="mb-3 text-[12.5px] text-amber-800/80">Only you can see this. Not shared with {other?.name?.split(" ")[0] ?? "the other person"} or HR.</p>
                <Textarea value={privateNote} onValueChange={(v) => { setPrivateNote(v); setSavedAt((s) => ({ ...s, private: false })); }}
                  rows={6} autoGrow placeholder="Reminders for yourself" className="bg-surface" />
                <div className="mt-2 flex items-center justify-end gap-3">
                  {savedAt.private && privateNote === privateBase && <span className="text-[12px] text-emerald-700">Saved</span>}
                  <Button variant="secondary" size="sm" onClick={savePrivate} loading={busy === "private"}
                    disabled={privateNote === privateBase}>Save</Button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </Modal>
  );
}
