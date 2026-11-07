"use client";

/*
 * Catalogue pieces:
 *   <CourseCard course onOpen />          a course as a card with drawn cover art
 *   <CourseDetailModal courseUuid onClose onPlay onChanged />  outline, batches, enrol
 *   <PathCard path onJoin onOpenCourse /> a learning path as a chain of courses
 *   <RequestCourseModal open onClose onSaved />
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen, CalendarDays, CheckCircle2, ChevronRight, Clock, GraduationCap, Lock, MapPin, PlayCircle, Route, Send, Users, Video,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { Badge, Button, Field, FormGrid, Modal, ModalCancel, NumberInput, Skeleton, TextInput, Textarea } from "@/components/ui-kit";
import { CourseCover, coverFor } from "./cover";
import { Bar, EnrolmentBadge, STROKE, deliveryLabel, errText, levelLabel, minutes } from "./shared";
import type { Course, CourseDetail, LearningPath } from "./types";

export function CourseCard({ course, onOpen }: { course: Course; onOpen: () => void }) {
  const e = course.enrolment;
  const c = coverFor(course.cover, course.title);
  const active = e && ["enrolled", "in_progress", "completed", "requested"].includes(e.status);
  return (
    <button type="button" onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong">
      <CourseCover cover={course.cover} seed={course.title} imageUrl={course.cover_image_url} mandatory={course.mandatory} height={136}>
        <span className="text-[11.5px] uppercase tracking-[0.12em] opacity-80">{course.category ?? deliveryLabel(course.delivery)}</span>
      </CourseCover>
      <div className="flex flex-1 flex-col p-4">
        <p className="line-clamp-2 text-[16px] leading-snug text-ink">{course.title}</p>
        {course.summary && <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-muted">{course.summary}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
          <span className="inline-flex items-center gap-1"><Clock size={13} strokeWidth={STROKE} /> {minutes(course.duration_minutes)}</span>
          <span className="inline-flex items-center gap-1"><BookOpen size={13} strokeWidth={STROKE} /> {course.lesson_count} lesson{course.lesson_count === 1 ? "" : "s"}</span>
          <span>{levelLabel(course.level)}</span>
          {course.delivery !== "online" && <span>{deliveryLabel(course.delivery)}</span>}
        </div>
        <div className="mt-auto pt-4">
          {active ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
                <EnrolmentBadge enrolment={e} />
                {e.status !== "requested" && <span className="tabular text-muted">{Math.round(e.progress)}%</span>}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken">
                <div className="h-full rounded-full" style={{ width: `${e.progress}%`, background: c.accent }} />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between text-[12.5px] text-muted">
              <span className="inline-flex items-center gap-1"><Users size={13} strokeWidth={STROKE} /> {course.stats?.learners ?? 0} learner{course.stats?.learners === 1 ? "" : "s"}</span>
              <span className="inline-flex items-center gap-0.5 text-primary opacity-0 transition-opacity group-hover:opacity-100">View <ChevronRight size={14} strokeWidth={STROKE} /></span>
            </div>
          )}
        </div>
      </div>
    </button>
  );
}

export function CourseDetailModal({ courseUuid, onClose, onPlay, onChanged }: {
  courseUuid: string | null; onClose: () => void; onPlay: (uuid: string) => void; onChanged?: () => void;
}) {
  const toast = useToast();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const load = useCallback(() => {
    if (!courseUuid) return;
    api.get<CourseDetail>(`/learning/courses/${courseUuid}`).then(setCourse).catch((e) => { toast.error("Couldn't open the course", { description: errText(e) }); closeRef.current(); });
  }, [courseUuid, toast]);
  useEffect(() => { setCourse(null); load(); }, [load]);

  async function enrol() {
    if (!course) return;
    setBusy("enrol");
    try {
      const e = await api.post<{ status: string }>(`/learning/courses/${course.uuid}/enrol`);
      if (e.status === "requested") toast.success("Request sent", { description: "Your manager will approve the enrolment." });
      else toast.success("You're enrolled");
      onChanged?.();
      if (e.status !== "requested" && course.delivery === "online") { onClose(); onPlay(course.uuid); } else load();
    } catch (err) { toast.error("Couldn't enrol", { description: errText(err) }); }
    finally { setBusy(null); }
  }

  async function book(batchUuid: string) {
    setBusy(batchUuid);
    try {
      const r = await api.post<{ status: string }>(`/learning/batches/${batchUuid}/seats`, {});
      toast.success(r.status === "confirmed" ? "Seat confirmed" : "You're on the waitlist");
      onChanged?.(); load();
    } catch (err) { toast.error("Couldn't book", { description: errText(err) }); }
    finally { setBusy(null); }
  }

  async function cancelSeat(batchUuid: string, seatUuid: string) {
    setBusy(batchUuid);
    try { await api.delete(`/learning/batches/${batchUuid}/seats/${seatUuid}`); toast.success("Seat cancelled"); onChanged?.(); load(); }
    catch (err) { toast.error("Couldn't cancel", { description: errText(err) }); }
    finally { setBusy(null); }
  }

  const e = course?.enrolment;
  const enrolled = e && ["enrolled", "in_progress", "completed"].includes(e.status);
  const action = !course ? null
    : enrolled ? <Button variant="primary" icon={PlayCircle} onClick={() => { onClose(); onPlay(course.uuid); }}>{e.status === "completed" ? "Review course" : e.status === "in_progress" ? "Continue" : "Start course"}</Button>
    : e?.status === "requested" ? <Badge tone="warn" dot>Awaiting approval</Badge>
    : course.self_enrol ? <Button variant="primary" loading={busy === "enrol"} icon={course.enrol_approval ? Send : GraduationCap} onClick={enrol}>{course.enrol_approval ? "Request to enrol" : "Enrol"}</Button>
    : <span className="text-[13px] text-muted">HR assigns this course.</span>;

  return (
    <Modal open={!!courseUuid} onClose={onClose} size="lg" flush title={course?.title ?? "Course"} footer={<><ModalCancel>Close</ModalCancel>{action}</>}>
      {!course ? <div className="space-y-4 p-6"><Skeleton className="h-40" /><Skeleton className="h-6 w-2/3" /><Skeleton className="h-20" /></div> : (
        <div>
          <CourseCover cover={course.cover} seed={course.title} imageUrl={course.cover_image_url} mandatory={course.mandatory} height={150}>
            <span className="text-[12px] uppercase tracking-[0.12em] opacity-80">{course.category ?? "Course"}</span>
            <span className="mt-1 text-[22px] font-light leading-tight">{course.title}</span>
          </CourseCover>
          <div className="space-y-6 p-6">
            <div className="flex flex-wrap gap-2">
              <Badge>{levelLabel(course.level)}</Badge><Badge>{deliveryLabel(course.delivery)}</Badge><Badge>{minutes(course.duration_minutes)}</Badge>
              {course.certificate && <Badge tone="accent">Certificate</Badge>}
              {course.mandatory && <Badge tone="warn">Mandatory{course.due_days ? ` · ${course.due_days} days to finish` : ""}</Badge>}
              {course.recert_months && <Badge>Renew every {course.recert_months} months</Badge>}
              {e && <EnrolmentBadge enrolment={e} />}
            </div>
            {(course.description || course.summary) && <p className="text-[14.5px] leading-6 text-ink/85">{course.description || course.summary}</p>}
            {enrolled && <div><Bar value={e.progress} /><p className="mt-1.5 text-[12.5px] text-muted">{Math.round(e.progress)}% complete{e.due_date ? ` · due ${formatDate(e.due_date)}` : ""}</p></div>}
            {!!course.lessons.length && (
              <div>
                <p className="mb-2 text-[14px] text-ink">What's inside</p>
                <ol className="divide-y divide-line rounded-xl border border-line">
                  {course.lessons.map((l, i) => (
                    <li key={l.uuid} className="flex items-center gap-3 px-4 py-2.5 text-[14px]">
                      <span className="w-5 text-right text-[12.5px] tabular text-faint">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-ink/85">{l.title}</span>
                      <span className="text-[12px] text-muted">{l.kind === "assessment" ? "Quiz" : minutes(l.duration_minutes)}</span>
                      {l.done ? <CheckCircle2 size={15} strokeWidth={STROKE} className="text-emerald-600" /> : (l.locked && enrolled) || !enrolled ? <Lock size={14} strokeWidth={STROKE} className="text-faint" /> : <span className="w-[14px]" />}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {!!course.batches.length && (
              <div>
                <p className="mb-2 text-[14px] text-ink">Batches</p>
                <div className="space-y-2.5">
                  {course.batches.map((b) => (
                    <div key={b.uuid} className="rounded-xl border border-line p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[14.5px] text-ink">{b.name}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12.5px] text-muted">
                            <span className="inline-flex items-center gap-1">{b.mode === "virtual" ? <Video size={13} strokeWidth={STROKE} /> : <MapPin size={13} strokeWidth={STROKE} />}{b.mode === "virtual" ? "Online" : b.venue || "Classroom"}</span>
                            {b.trainer && <span>with {b.trainer}</span>}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {b.my_seat ? (
                            <>
                              <Badge tone={b.my_seat.status === "confirmed" ? "good" : "warn"} dot>{b.my_seat.status === "confirmed" ? "Seat confirmed" : `Waitlist #${b.my_seat.position ?? ""}`}</Badge>
                              <Button size="sm" variant="ghost" loading={busy === b.uuid} onClick={() => cancelSeat(b.uuid, b.my_seat!.uuid)}>Cancel</Button>
                            </>
                          ) : (
                            <>
                              <span className="text-[12.5px] text-muted">{b.seats_left > 0 ? `${b.seats_left} of ${b.capacity} seats left` : `Full · ${b.waitlisted} waiting`}</span>
                              <Button size="sm" variant="secondary" loading={busy === b.uuid} onClick={() => book(b.uuid)}>{b.seats_left > 0 ? "Book a seat" : "Join waitlist"}</Button>
                            </>
                          )}
                        </div>
                      </div>
                      <ul className="mt-3 space-y-1">
                        {b.sessions.map((s) => (
                          <li key={s.id} className="flex items-center gap-2 text-[13px] text-ink/80">
                            <CalendarDays size={13} strokeWidth={STROKE} className="text-faint" />
                            <span className="tabular">{formatDate(s.date)} · {s.start}–{s.end}</span>
                            {s.topic && <span className="truncate text-muted">· {s.topic}</span>}
                          </li>
                        ))}
                      </ul>
                      {b.meeting_link && b.my_seat && <a href={b.meeting_link} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[13px] text-primary hover:underline">Join link</a>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {course.assessment && (
              <p className="text-[13px] text-muted">Ends with “{course.assessment.title}”: {course.assessment.question_count} questions, pass mark {course.assessment.pass_pct}%.</p>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function PathCard({ path, onJoin, onOpenCourse, joining }: { path: LearningPath; onJoin?: () => void; onOpenCourse: (uuid: string) => void; joining?: boolean }) {
  const joined = path.items.some((i) => i.status);
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><Route size={19} strokeWidth={STROKE} /></span>
          <div className="min-w-0">
            <p className="text-[15.5px] text-ink">{path.title}</p>
            {path.description && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{path.description}</p>}
          </div>
        </div>
        {joined ? <span className="shrink-0 text-[13px] tabular text-muted">{path.completed}/{path.required} done</span>
          : onJoin && <Button size="sm" variant="secondary" loading={joining} onClick={onJoin}>Join</Button>}
      </div>
      <ol className="mt-4 flex flex-wrap items-center gap-1.5">
        {path.items.map((it, i) => {
          const c = coverFor(it.cover, it.title);
          return (
            <li key={it.course_uuid} className="flex items-center gap-1.5">
              <button type="button" onClick={() => onOpenCourse(it.course_uuid)}
                className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-[12.5px] text-ink/85 transition-colors hover:border-line-strong">
                <span className="flex h-6 w-6 items-center justify-center rounded-full text-[11px]" style={{ background: c.to, color: c.ink }}>
                  {it.status === "completed" ? <CheckCircle2 size={13} strokeWidth={1.6} /> : i + 1}
                </span>
                <span className="max-w-[180px] truncate">{it.title}</span>
                {!it.required && <span className="text-faint">optional</span>}
              </button>
              {i < path.items.length - 1 && <ChevronRight size={14} strokeWidth={STROKE} className="text-faint" />}
            </li>
          );
        })}
      </ol>
      {joined && <Bar value={path.progress} className="mt-4" />}
    </div>
  );
}

export function RequestCourseModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ title: "", reason: "", link: "", provider: "", cost: null as number | null });
  const [saving, setSaving] = useState(false);
  const dirty = !!(v.title || v.reason || v.link || v.provider);
  useEffect(() => { if (open) setV({ title: "", reason: "", link: "", provider: "", cost: null }); }, [open]);

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    setSaving(true);
    try {
      await api.post("/learning/requests", { title: v.title, reason: v.reason || null, link: v.link || null, provider: v.provider || null, estimated_cost: v.cost });
      toast.success("Request sent", { description: "You'll hear back once it is approved." });
      onSaved?.(); onClose();
    } catch (e) { toast.error("Couldn't send the request", { description: errText(e) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" title="Request a course" description="Ask for a course or training that isn't in the catalogue." dirty={dirty} busy={saving}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="course-request" loading={saving} disabled={!v.title.trim()}>Send request</Button></>}>
      <form id="course-request" onSubmit={save} className="space-y-5">
        <Field label="Course or training" required><TextInput value={v.title} onValueChange={(x) => setV({ ...v, title: x })} placeholder="e.g. AWS Solutions Architect" autoFocusInModal /></Field>
        <Field label="Why do you need it?"><Textarea value={v.reason} onValueChange={(x) => setV({ ...v, reason: x })} rows={3} /></Field>
        <FormGrid>
          <Field label="Provider"><TextInput value={v.provider} onValueChange={(x) => setV({ ...v, provider: x })} placeholder="Coursera, in-house…" /></Field>
          <Field label="Estimated cost"><NumberInput value={v.cost} onChange={(x) => setV({ ...v, cost: x })} min={0} suffix="₹" /></Field>
        </FormGrid>
        <Field label="Link"><TextInput value={v.link} onValueChange={(x) => setV({ ...v, link: x })} placeholder="https://" /></Field>
      </form>
    </Modal>
  );
}
