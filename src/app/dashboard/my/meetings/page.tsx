"use client";

/*
 * Portal parent-teacher meetings: for the picked child, each open meeting day lists the
 * child's teachers; the parent books one slot per teacher (in person or online), can cancel,
 * and later sees the teacher's notes when the teacher shares them.
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarCheck2, Clock, Handshake, MapPin, Video } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { formatTime } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Button, Field, Modal, ModalCancel, RadioCards, Skeleton, TextInput, formatDisplayDate, useConfirm } from "@/components/ui-kit";
import { ChildSwitcher, errText, useChild } from "@/components/comms/shared";

type Slot = { id: number; start_at: string; end_at: string; free: boolean };
type Booking = { uuid: string; start_at: string; end_at: string; mode: string; status: string; notes: string | null; action_points: { text: string; done: boolean }[]; teacher_name: string | null };
type TeacherRow = { ptm_teacher_id: number; name: string; roles: string[]; location: string | null; meeting_link: string | null; booking: Booking | null; slots: Slot[] };
type Day = { uuid: string; title: string; date: string; start_time: string; end_time: string; mode: "in_person" | "online" | "both"; location: string | null; instructions: string | null; status: string; can_book: boolean; teachers: TeacherRow[] };

export default function MyMeetingsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const { portalRole } = useAccess();
  const child = useChild();
  const [data, setData] = useState<{ key: string; days: Day[] } | null>(null);
  const [nonce, setNonce] = useState(0);
  const [picking, setPicking] = useState<{ day: Day; teacher: TeacherRow; slot: Slot } | null>(null);
  const load = useCallback(() => setNonce((n) => n + 1), []);
  const key = `${child.studentId}|${nonce}`;
  useEffect(() => {
    if (!child.studentId) return;
    let live = true;
    api.get<Day[]>(`/comms/portal/ptm?student_id=${child.studentId}`).then((r) => { if (live) setData({ key, days: r }); })
      .catch((e) => { if (live) { setData({ key, days: [] }); toast.error(errText(e)); } });
    return () => { live = false; };
  }, [key, child.studentId, toast]);
  const days: Day[] | null = child.ready && !child.studentId ? [] : data && data.key === key ? data.days : (data?.days ?? null);

  async function cancel(b: Booking) {
    if (!(await confirm({ title: "Cancel this meeting?", message: "The slot is freed for other parents. You can book another time.", confirmLabel: "Cancel meeting", tone: "danger" }))) return;
    try { await api.post(`/comms/portal/ptm/bookings/${b.uuid}/cancel`); toast.success("Meeting cancelled"); load(); } catch (e) { toast.error(errText(e)); }
  }
  const isParent = portalRole === "parent";
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Parent-teacher meetings" description={`Book a time with each of your child's ${term("teachers").toLowerCase()}.`} actions={<ChildSwitcher child={child} />} />
      {days === null ? <Skeleton className="h-64 w-full rounded-2xl" /> : days.length === 0 ? (
        <Paper><EmptyState icon={Handshake} title="No meetings planned" hint="When the school opens parent-teacher meetings for your child's class, you can book a slot here." /></Paper>
      ) : (
        <div className="space-y-6">
          {days.map((d) => (
            <Paper key={d.uuid}>
              <PaperHeader title={<span className="flex flex-wrap items-center gap-2">{d.title}{d.can_book ? <Badge tone="good" dot>Booking open</Badge> : <Badge>Booking closed</Badge>}</span>} />
              <div className="space-y-4 p-5">
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px] text-muted">
                  <span className="inline-flex items-center gap-1.5"><CalendarCheck2 size={14} strokeWidth={1.4} />{formatDisplayDate(d.date)}</span>
                  <span className="inline-flex items-center gap-1.5"><Clock size={14} strokeWidth={1.4} />{d.start_time}–{d.end_time}</span>
                  {d.location && d.mode !== "online" && <span className="inline-flex items-center gap-1.5"><MapPin size={14} strokeWidth={1.4} />{d.location}</span>}
                  {d.mode !== "in_person" && <span className="inline-flex items-center gap-1.5"><Video size={14} strokeWidth={1.4} />{d.mode === "online" ? "Online" : "In person or online"}</span>}
                </p>
                {d.instructions && <p className="rounded-xl bg-sunken/60 px-4 py-3 text-[13.5px] text-ink/80">{d.instructions}</p>}
                {d.teachers.length === 0 && <p className="text-[13.5px] text-muted">None of your child&rsquo;s {term("teachers").toLowerCase()} are taking part.</p>}
                <ul className="space-y-3">
                  {d.teachers.map((t) => (
                    <li key={t.ptm_teacher_id} className="rounded-xl border border-line p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div><p className="text-[14.5px] text-ink">{t.name}</p><p className="text-[12.5px] text-muted">{t.roles.join(", ")}</p></div>
                        {t.booking && (
                          <div className="text-right">
                            <Badge tone={t.booking.status === "met" ? "good" : t.booking.status === "no_show" ? "bad" : "accent"}>
                              {t.booking.status === "met" ? "Met" : t.booking.status === "no_show" ? "Missed" : `Booked · ${formatTime(t.booking.start_at)}`}
                            </Badge>
                            {t.booking.mode === "online" && t.meeting_link && t.booking.status === "booked" && <a href={t.meeting_link} target="_blank" rel="noreferrer" className="mt-1 block text-[12.5px] text-primary hover:underline">Join online</a>}
                          </div>
                        )}
                      </div>
                      {t.booking ? (
                        <div className="mt-3 space-y-2">
                          {(t.booking.notes || t.booking.action_points.length > 0) && (
                            <div className="rounded-lg bg-sunken/50 px-3 py-2.5 text-[13.5px]">
                              {t.booking.notes && <p className="whitespace-pre-wrap text-ink/85">{t.booking.notes}</p>}
                              {t.booking.action_points.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-ink/80">{t.booking.action_points.map((a, i) => <li key={i} className={a.done ? "line-through opacity-60" : ""}>{a.text}</li>)}</ul>}
                            </div>
                          )}
                          {isParent && t.booking.status === "booked" && d.can_book && <Button size="sm" variant="ghost" onClick={() => cancel(t.booking!)}>Cancel meeting</Button>}
                        </div>
                      ) : isParent && d.can_book ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {t.slots.filter((s) => s.free).length === 0 && <p className="text-[13px] text-muted">All slots are taken. Message the {term("teacher").toLowerCase()} to find another time.</p>}
                          {t.slots.filter((s) => s.free).map((s) => (
                            <button key={s.id} type="button" onClick={() => setPicking({ day: d, teacher: t, slot: s })}
                              className="tabular h-8 rounded-lg border border-line px-2.5 text-[13px] text-ink/85 transition-colors hover:border-primary/40 hover:bg-primary-soft/40">
                              {formatTime(s.start_at)}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </Paper>
          ))}
        </div>
      )}
      {picking && child.studentId && <BookModal {...picking} studentId={child.studentId} onClose={() => setPicking(null)} onBooked={() => { setPicking(null); load(); }} />}
    </div>
  );
}

function BookModal({ day, teacher, slot, studentId, onClose, onBooked }: { day: Day; teacher: TeacherRow; slot: Slot; studentId: number; onClose: () => void; onBooked: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<string>(day.mode === "online" ? "online" : "in_person");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  async function book() {
    setSaving(true);
    try {
      await api.post("/comms/portal/ptm/book", { slot_id: slot.id, student_id: studentId, mode, note: note || null });
      toast.success("Meeting booked", { description: `${teacher.name} at ${formatTime(slot.start_at)}. We'll remind you the day before.` });
      onBooked();
    } catch (e) { toast.error("Couldn't book", { description: errText(e) }); onBooked(); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="sm" title="Book this slot" busy={saving}
      description={`${teacher.name} · ${formatDisplayDate(day.date)} at ${formatTime(slot.start_at)}`}
      footer={<><ModalCancel /><Button variant="primary" onClick={book} loading={saving}>Book</Button></>}>
      <div className="space-y-4">
        {day.mode === "both" && <Field label="How will you meet?"><RadioCards columns={2} value={mode} onChange={setMode} options={[{ value: "in_person", label: "In person" }, { value: "online", label: "Online", icon: Video }]} /></Field>}
        <Field label="Anything you'd like to discuss?" aside="Optional"><TextInput value={note} onValueChange={setNote} maxLength={500} placeholder="e.g. Maths progress" /></Field>
      </div>
    </Modal>
  );
}
