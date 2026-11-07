"use client";

/*
 * My learning: what I'm enrolled in, what is mandatory and due, what I have finished
 * (with certificates) and the learning paths I follow. Continue opens the course player.
 */
import { Suspense, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, BookOpenCheck, CheckCircle2, Clock, GraduationCap, PlayCircle, TriangleAlert } from "lucide-react";
import { formatDate } from "@/lib/datetime";
import { EmptyState, PageHeader } from "@/components/shell/page";
import { Badge, Button, Skeleton, StatCard, StatGrid, Tabs } from "@/components/ui-kit";
import { CertificateModal } from "@/components/learning/certificate";
import { CourseDetailModal, PathCard } from "@/components/learning/course-card";
import { CourseCover } from "@/components/learning/cover";
import { CoursePlayer } from "@/components/learning/course-player";
import { Bar, EnrolmentBadge, LearningTabs, minutes, useLearningMe, useLoad } from "@/components/learning/shared";
import type { Course, MyLearning } from "@/components/learning/types";

type Tab = "active" | "mandatory" | "completed" | "paths";

function Row({ c, onPlay, onCert }: { c: Course; onPlay: () => void; onCert: () => void }) {
  const e = c.enrolment!;
  const done = e.status === "completed";
  const days = c.days_left ?? null;
  return (
    <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
      <button type="button" onClick={onPlay} className="shrink-0 overflow-hidden rounded-xl">
        <CourseCover cover={c.cover} seed={c.title} imageUrl={c.cover_image_url} height={72} className="w-full sm:w-[120px]" />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onPlay} className="truncate text-left text-[15px] text-ink hover:text-primary">{c.title}</button>
          {e.mandatory && <Badge tone="warn">Mandatory</Badge>}
          <EnrolmentBadge enrolment={e} overdue={c.overdue} />
        </div>
        <p className="mt-1 flex flex-wrap gap-x-3 text-[12.5px] text-muted">
          <span>{c.lesson_count} lesson{c.lesson_count === 1 ? "" : "s"} · {minutes(c.duration_minutes)}</span>
          {done ? (
            <span>Completed {e.completed_at ? formatDate(e.completed_at) : ""}{e.score !== null ? ` · score ${Math.round(e.score)}%` : ""}</span>
          ) : e.due_date ? (
            <span className={c.overdue ? "text-rose-700" : days !== null && days <= 7 ? "text-amber-700" : ""}>
              {c.overdue ? `Was due ${formatDate(e.due_date)}` : `Due ${formatDate(e.due_date)}${days !== null ? ` · ${days} day${days === 1 ? "" : "s"} left` : ""}`}
            </span>
          ) : null}
          {e.expires_on && <span>Valid until {formatDate(e.expires_on)}</span>}
        </p>
        {!done && e.status !== "requested" && (
          <div className="mt-2.5 flex max-w-md items-center gap-3"><Bar value={e.progress} /><span className="text-[12px] tabular text-muted">{Math.round(e.progress)}%</span></div>
        )}
      </div>
      <div className="flex shrink-0 gap-2">
        {e.certificate_no && <Button size="sm" variant="secondary" icon={Award} onClick={onCert}>Certificate</Button>}
        {e.status !== "requested" && <Button size="sm" variant={done ? "ghost" : "primary"} icon={PlayCircle} onClick={onPlay}>{done ? "Review" : e.status === "in_progress" ? "Continue" : "Start"}</Button>}
      </div>
    </div>
  );
}

function MyLearningPage() {
  const router = useRouter();
  const me = useLearningMe();
  const { data, loading, refresh } = useLoad<MyLearning>("/learning/my", "Couldn't load your learning");
  const [tab, setTab] = useState<Tab>("active");
  const [player, setPlayer] = useState<string | null>(null);
  const [cert, setCert] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const rows = useMemo(() => data?.enrolments ?? [], [data]);
  const active = rows.filter((c) => c.enrolment && ["enrolled", "in_progress", "requested"].includes(c.enrolment.status));
  const mandatory = rows.filter((c) => c.enrolment?.mandatory && c.enrolment.status !== "completed");
  const completed = rows.filter((c) => c.enrolment?.status === "completed");
  const list = tab === "active" ? active : tab === "mandatory" ? mandatory : completed;
  const s = data?.stats ?? {};

  return (
    <div>
      <PageHeader eyebrow="Talent" title="My learning" description="Your courses, deadlines and certificates."
        actions={<Button variant="secondary" icon={GraduationCap} onClick={() => router.push("/dashboard/learning")}>Browse courses</Button>} />
      <LearningTabs me={me} />
      <StatGrid className="xl:grid-cols-5">
        <StatCard label="In progress" value={s.in_progress ?? "—"} icon={BookOpenCheck} />
        <StatCard label="Completed" value={s.completed ?? "—"} icon={CheckCircle2} />
        <StatCard label="Overdue" value={s.overdue ?? "—"} icon={TriangleAlert} hint={s.overdue ? "Mandatory training past its date" : undefined} />
        <StatCard label="Certificates" value={s.certificates ?? "—"} icon={Award} />
        <StatCard label="Hours learnt" value={s.hours ?? "—"} icon={Clock} />
      </StatGrid>
      <Tabs className="mt-8" value={tab} onChange={(v) => setTab(v as Tab)} items={[
        { value: "active", label: "In progress", count: active.length },
        { value: "mandatory", label: "Mandatory", count: mandatory.length },
        { value: "completed", label: "Completed", count: completed.length },
        { value: "paths", label: "Paths", count: data?.paths.length ?? 0 },
      ]} />
      <div className="mt-5">
        {loading && !data ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        ) : tab === "paths" ? (
          data?.paths.length
            ? <div className="grid gap-4 lg:grid-cols-2">{data.paths.map((p) => <PathCard key={p.uuid} path={p} onOpenCourse={(u) => setDetail(u)} />)}</div>
            : <div className="rounded-2xl border border-line bg-surface"><EmptyState icon={GraduationCap} title="No learning paths yet" hint="Join a path from the catalogue." /></div>
        ) : list.length ? (
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {list.map((c) => <Row key={c.uuid} c={c} onPlay={() => setPlayer(c.uuid)} onCert={() => setCert(c.enrolment!.uuid)} />)}
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-surface">
            <EmptyState icon={tab === "completed" ? Award : BookOpenCheck}
              title={tab === "completed" ? "Nothing finished yet" : tab === "mandatory" ? "No mandatory training due" : "Nothing in progress"}
              hint={tab === "active" ? "Find a course in the catalogue to get started." : undefined}
              action={tab === "active" ? <Button variant="primary" onClick={() => router.push("/dashboard/learning")}>Browse courses</Button> : undefined} />
          </div>
        )}
      </div>
      <CoursePlayer courseUuid={player} onClose={() => setPlayer(null)} onChanged={refresh} />
      <CertificateModal enrolmentUuid={cert} onClose={() => setCert(null)} />
      <CourseDetailModal courseUuid={detail} onClose={() => setDetail(null)} onPlay={(u) => { setDetail(null); setPlayer(u); }} onChanged={refresh} />
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><MyLearningPage /></Suspense>;
}
