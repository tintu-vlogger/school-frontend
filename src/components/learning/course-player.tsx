"use client";

/*
 * Course player (full-size modal).
 *   <CoursePlayer courseUuid={uuid} onClose={...} onChanged={reload} />
 * Lesson list on the left (ticks, locks, progress), the lesson on the right: video
 * (YouTube, Vimeo or a video file), a file (PDF shown inline, others to open), text, or a
 * quiz (opens the assessment player). "Mark complete" moves to the next lesson; finishing
 * the course shows a small celebration with the certificate.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award, BookOpen, CheckCircle2, ChevronRight, Circle, ExternalLink, FileText, Lock, PartyPopper, PlayCircle, ClipboardCheck,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Badge, Button, Modal, Skeleton } from "@/components/ui-kit";
import { AssessmentPlayer } from "./assessment-player";
import { CertificateModal } from "./certificate";
import { CourseCover } from "./cover";
import { Bar, STROKE, errText, minutes } from "./shared";
import type { AssessmentBrief, CourseDetail, Lesson } from "./types";

const KIND_ICON = { video: PlayCircle, file: FileText, text: BookOpen, assessment: ClipboardCheck };

function embedUrl(url: string): { kind: "iframe" | "video"; src: string } {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return { kind: "iframe", src: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { kind: "iframe", src: `https://player.vimeo.com/video/${vm[1]}` };
  return { kind: "video", src: url };
}

function isPdf(l: Lesson) {
  const u = (l.url || "").toLowerCase();
  return u.startsWith("data:application/pdf") || u.split("?")[0].endsWith(".pdf") || (l.file_name || "").toLowerCase().endsWith(".pdf");
}

export function CoursePlayer({ courseUuid, onClose, onChanged }: { courseUuid: string | null; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [current, setCurrent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [quiz, setQuiz] = useState<{ uuid: string; title: string } | null>(null);
  const [assessments, setAssessments] = useState<AssessmentBrief[]>([]);
  const [cert, setCert] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);

  const load = useCallback(async (keepLesson?: number | null) => {
    if (!courseUuid) return;
    try {
      const c = await api.get<CourseDetail>(`/learning/courses/${courseUuid}`);
      setCourse(c);
      if (keepLesson === undefined) {
        const last = c.lessons.find((l) => l.id === c.enrolment?.last_lesson_id && !l.locked);
        const next = c.lessons.find((l) => !l.done && !l.locked);
        setCurrent((last && !last.done ? last : next ?? last ?? c.lessons[0])?.id ?? null);
      }
      return c;
    } catch (e) {
      toast.error("Couldn't open the course", { description: errText(e) });
    }
  }, [courseUuid, toast]);

  useEffect(() => {
    if (!courseUuid) return;
    setCourse(null); setCelebrate(false);
    load();
    api.get<AssessmentBrief[]>("/learning/assessments").then((r) => setAssessments(Array.isArray(r) ? r : [])).catch(() => {});
  }, [courseUuid, load]);

  const lesson = course?.lessons.find((l) => l.id === current) ?? null;
  const enrolment = course?.enrolment ?? null;

  // remember where the learner is
  useEffect(() => {
    if (!lesson || !enrolment || lesson.locked) return;
    api.post(`/learning/enrolments/${enrolment.uuid}/lessons/${lesson.uuid}/open`).catch(() => {});
  }, [lesson?.uuid, enrolment?.uuid]); // eslint-disable-line react-hooks/exhaustive-deps

  const quizFor = useMemo(() => {
    if (!lesson || lesson.kind !== "assessment") return null;
    return assessments.find((a) => a.id === lesson.assessment_id) ?? (course?.assessment && course.assessment.id === lesson.assessment_id ? course.assessment : null);
  }, [lesson, assessments, course]);

  async function complete() {
    if (!lesson || !enrolment) return;
    setBusy(true);
    try {
      const wasDone = enrolment.status === "completed";
      const c = await api.post<CourseDetail>(`/learning/enrolments/${enrolment.uuid}/lessons/${lesson.uuid}/complete`);
      setCourse(c);
      onChanged?.();
      if (!wasDone && c.enrolment?.status === "completed") { setCelebrate(true); return; }
      const idx = c.lessons.findIndex((l) => l.id === lesson.id);
      const next = c.lessons.slice(idx + 1).find((l) => !l.locked);
      if (next) setCurrent(next.id);
    } catch (e) {
      toast.error("Couldn't mark it done", { description: errText(e) });
    } finally {
      setBusy(false);
    }
  }

  async function afterQuiz() {
    const before = enrolment?.status;
    const c = await load(current);
    onChanged?.();
    if (c && before !== "completed" && c.enrolment?.status === "completed") setCelebrate(true);
  }

  const done = course?.lessons.filter((l) => l.done).length ?? 0;
  const total = course?.lessons.length ?? 0;
  const progress = enrolment?.progress ?? 0;
  const idx = course?.lessons.findIndex((l) => l.id === current) ?? -1;

  return (
    <>
      <Modal open={!!courseUuid} onClose={onClose} size="full" flush title={course?.title ?? "Course"}
        description={course ? `${done} of ${total} lessons · ${Math.round(progress)}% done` : undefined}
        headerActions={enrolment?.certificate_no ? <Button size="sm" variant="secondary" icon={Award} onClick={() => setCert(enrolment.uuid)}>Certificate</Button> : undefined}>
        {!course ? (
          <div className="grid h-full grid-cols-[300px_1fr] gap-0"><div className="space-y-3 border-r border-line p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div><div className="p-8"><Skeleton className="h-64" /></div></div>
        ) : (
          <div className="grid min-h-full md:grid-cols-[300px_1fr]">
            <aside className="border-b border-line bg-sunken/30 md:border-b-0 md:border-r">
              <div className="p-5">
                <Bar value={progress} />
                <p className="mt-2 text-[12.5px] text-muted">{Math.round(progress)}% complete{course.sequential ? " · lessons open in order" : ""}</p>
              </div>
              <ol className="space-y-0.5 px-2 pb-4">
                {course.lessons.map((l, i) => {
                  const Icon = KIND_ICON[l.kind] ?? BookOpen;
                  const active = l.id === current;
                  return (
                    <li key={l.uuid}>
                      <button type="button" disabled={l.locked} onClick={() => { setCurrent(l.id); setCelebrate(false); }}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${active ? "bg-surface ring-1 ring-line" : "hover:bg-surface/70"} ${l.locked ? "cursor-not-allowed opacity-55" : ""}`}>
                        <span className="shrink-0">
                          {l.done ? <CheckCircle2 size={18} strokeWidth={STROKE} className="text-emerald-600" />
                            : l.locked ? <Lock size={16} strokeWidth={STROKE} className="text-faint" />
                            : <Circle size={18} strokeWidth={STROKE} className={active ? "text-primary" : "text-faint"} />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[14px] ${active ? "text-ink" : "text-ink/80"}`}>{i + 1}. {l.title}</span>
                          <span className="flex items-center gap-1.5 text-[12px] text-muted"><Icon size={12} strokeWidth={STROKE} /> {l.kind === "assessment" ? "Quiz" : l.kind === "file" ? "Reading" : l.kind === "video" ? "Video" : "Lesson"} · {minutes(l.duration_minutes)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </aside>
            <section className="min-w-0 p-5 sm:p-8">
              {!enrolment || !["enrolled", "in_progress", "completed"].includes(enrolment.status) ? (
                <p className="py-16 text-center text-[14px] text-muted">Enrol in this course to start learning.</p>
              ) : celebrate ? (
                <div className="mx-auto flex max-w-lg flex-col items-center py-14 text-center">
                  <div className="relative">
                    <CourseCover cover={course.cover} seed={course.title} className="h-28 w-28 rounded-full" height={112} />
                    <PartyPopper size={34} strokeWidth={1.2} className="absolute -right-3 -top-2 text-amber-500" />
                  </div>
                  <h3 className="mt-6 text-[26px] font-light text-ink">Course complete</h3>
                  <p className="mt-2 text-[14.5px] text-muted">Well done on finishing {course.title}.{enrolment.certificate_no ? " Your certificate is ready." : ""}</p>
                  <div className="mt-6 flex gap-2">
                    {enrolment.certificate_no && <Button variant="primary" icon={Award} onClick={() => setCert(enrolment.uuid)}>View certificate</Button>}
                    <Button variant="secondary" onClick={onClose}>Back to my learning</Button>
                  </div>
                </div>
              ) : lesson ? (
                <div className="mx-auto max-w-3xl">
                  <p className="text-[12.5px] uppercase tracking-[0.08em] text-faint">Lesson {idx + 1} of {total}</p>
                  <h3 className="mt-1 text-[24px] font-light leading-tight text-ink">{lesson.title}</h3>
                  <div className="mt-6"><LessonBody lesson={lesson} quiz={quizFor} onQuiz={(a) => setQuiz({ uuid: a.uuid, title: a.title })} /></div>
                  <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                    <span className="text-[13px] text-muted">{lesson.done ? <span className="inline-flex items-center gap-1.5 text-emerald-700"><CheckCircle2 size={15} strokeWidth={STROKE} /> Done</span> : lesson.kind === "assessment" ? "Pass the quiz to finish this lesson." : "Finished? Mark it done to move on."}</span>
                    <div className="flex gap-2">
                      {lesson.kind !== "assessment" && !lesson.done && <Button variant="primary" iconRight={ChevronRight} loading={busy} onClick={complete}>Mark complete{idx < total - 1 ? " & next" : ""}</Button>}
                      {lesson.done && idx < total - 1 && !course.lessons[idx + 1].locked && <Button variant="secondary" iconRight={ChevronRight} onClick={() => setCurrent(course.lessons[idx + 1].id)}>Next lesson</Button>}
                    </div>
                  </div>
                </div>
              ) : <p className="py-16 text-center text-[14px] text-muted">This course has no lessons yet.</p>}
            </section>
          </div>
        )}
      </Modal>
      <AssessmentPlayer open={!!quiz} assessmentUuid={quiz?.uuid ?? null} title={quiz?.title} onClose={() => setQuiz(null)} onFinished={afterQuiz} />
      <CertificateModal enrolmentUuid={cert} onClose={() => setCert(null)} />
    </>
  );
}

function LessonBody({ lesson, quiz, onQuiz }: { lesson: Lesson; quiz: AssessmentBrief | null; onQuiz: (a: AssessmentBrief) => void }) {
  if (lesson.kind === "video" && lesson.url) {
    const e = embedUrl(lesson.url);
    return (
      <div className="overflow-hidden rounded-2xl border border-line bg-black">
        {e.kind === "iframe"
          ? <iframe src={e.src} title={lesson.title} className="aspect-video w-full" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          : <video src={e.src} controls className="aspect-video w-full" />}
      </div>
    );
  }
  if (lesson.kind === "file" && lesson.url) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
          <span className="flex min-w-0 items-center gap-3"><FileText size={20} strokeWidth={STROKE} className="text-muted" /><span className="truncate text-[14px] text-ink">{lesson.file_name || "Course file"}</span></span>
          <a href={lesson.url} target="_blank" rel="noreferrer" download={lesson.file_name || undefined} className="inline-flex items-center gap-1.5 text-[13.5px] text-primary hover:underline">Open <ExternalLink size={13} strokeWidth={STROKE} /></a>
        </div>
        {isPdf(lesson) && <iframe src={lesson.url} title={lesson.title} className="h-[60vh] w-full rounded-2xl border border-line" />}
      </div>
    );
  }
  if (lesson.kind === "assessment") {
    return (
      <div className="rounded-2xl border border-line p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><ClipboardCheck size={22} strokeWidth={STROKE} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] text-ink">{quiz?.title ?? "Quiz"}</p>
            {quiz ? (
              <div className="mt-2 flex flex-wrap gap-2 text-[12.5px]">
                <Badge>{quiz.question_count} questions</Badge>
                <Badge>Pass mark {quiz.pass_pct}%</Badge>
                {quiz.time_limit_minutes && <Badge>{quiz.time_limit_minutes} min</Badge>}
                {quiz.negative_marking !== "none" && <Badge tone="warn">Wrong answers lose marks</Badge>}
                {quiz.max_attempts && <Badge>{quiz.attempts_left ?? quiz.max_attempts} attempt{(quiz.attempts_left ?? quiz.max_attempts) === 1 ? "" : "s"} left</Badge>}
                {quiz.best && <Badge tone={quiz.best.passed ? "good" : "warn"}>Best {Math.round(quiz.best.pct)}%</Badge>}
              </div>
            ) : <p className="mt-1 text-[13px] text-muted">Loading the quiz…</p>}
            {quiz?.description && <p className="mt-3 text-[13.5px] text-muted">{quiz.description}</p>}
            <div className="mt-5">
              {quiz && (quiz.attempts_left === 0 && !quiz.best?.passed
                ? <p className="text-[13.5px] text-rose-700">You have used all your attempts. Please contact HR.</p>
                : !lesson.done && <Button variant="primary" icon={PlayCircle} onClick={() => onQuiz(quiz)}>{quiz.in_progress ? "Resume quiz" : quiz.my_attempts ? "Try again" : "Start quiz"}</Button>)}
            </div>
          </div>
        </div>
      </div>
    );
  }
  const paras = (lesson.body || "").split(/\n\s*\n/).filter((p) => p.trim());
  return (
    <article className="space-y-4 text-[16px] font-light leading-[1.75] text-ink/90">
      {paras.length ? paras.map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>) : <p className="text-muted">Nothing to read here.</p>}
    </article>
  );
}
