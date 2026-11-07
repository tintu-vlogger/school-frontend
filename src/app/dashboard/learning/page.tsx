"use client";

/*
 * Learning catalogue: every published course as a card (drawn covers, progress for my
 * courses), learning paths, and my course requests. A card opens the course details;
 * enrolled courses open in the course player. ?course=<uuid> opens a course directly.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, MessageSquarePlus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { EmptyState, PageHeader } from "@/components/shell/page";
import { Badge, Button, FilterBar, Skeleton, type FilterValues } from "@/components/ui-kit";
import { CourseCard, CourseDetailModal, PathCard, RequestCourseModal } from "@/components/learning/course-card";
import { CoursePlayer } from "@/components/learning/course-player";
import { LearningTabs, errText, useCategories, useLearningMe, useLoad } from "@/components/learning/shared";
import type { Course, CourseRequest, LearningPath } from "@/components/learning/types";

const REQ_TONE = { pending: "warn", approved: "good", fulfilled: "accent", rejected: "bad", cancelled: "neutral" } as const;

function Catalogue() {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const me = useLearningMe();
  const categories = useCategories();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [requestOpen, setRequestOpen] = useState(false);
  const [player, setPlayer] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);
  const detail = params.get("course");
  const setDetail = useCallback((uuid: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (uuid) sp.set("course", uuid); else sp.delete("course");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const q = new URLSearchParams();
  if (search) q.set("q", search);
  if (filters.category?.[0]) q.set("category_id", filters.category[0]);
  if (filters.level?.[0]) q.set("level", filters.level[0]);
  if (filters.delivery?.[0]) q.set("delivery", filters.delivery[0]);
  const courses = useLoad<Course[]>(`/learning/catalogue?${q}`, "Couldn't load courses");
  const paths = useLoad<LearningPath[]>("/learning/paths", "Couldn't load learning paths");
  const requests = useLoad<CourseRequest[]>(me?.employee_id ? "/learning/requests?mine=true" : null);
  const refresh = () => { courses.refresh(); paths.refresh(); };

  const list = useMemo(() => courses.data ?? [], [courses.data]);
  const mine = list.filter((c) => c.enrolment && ["enrolled", "in_progress"].includes(c.enrolment.status));
  const rest = list.filter((c) => !mine.includes(c));
  const filtered = !!search || Object.values(filters).some((v) => v?.length);

  async function join(p: LearningPath) {
    setJoining(p.uuid);
    try { const r = await api.post<{ enrolled: number }>(`/learning/paths/${p.uuid}/join`); toast.success(`Joined ${p.title}`, { description: `${r.enrolled} course${r.enrolled === 1 ? "" : "s"} added to My learning.` }); refresh(); }
    catch (e) { toast.error("Couldn't join", { description: errText(e) }); }
    finally { setJoining(null); }
  }

  useEffect(() => { if (detail) setPlayer(null); }, [detail]);

  return (
    <div>
      <PageHeader eyebrow="Talent" title="Learning" description="Courses, workshops and mandatory training. Pick something and start learning."
        actions={me?.employee_id ? <Button variant="secondary" icon={MessageSquarePlus} onClick={() => setRequestOpen(true)}>Request a course</Button> : undefined} />
      <LearningTabs me={me} />
      <FilterBar searchPlaceholder="Search courses" onSearchChange={setSearch}
        filters={[
          { key: "category", label: "Category", options: categories.map((c) => ({ value: String(c.value), label: c.label })) },
          { key: "level", label: "Level", options: [{ value: "beginner", label: "Beginner" }, { value: "intermediate", label: "Intermediate" }, { value: "advanced", label: "Advanced" }] },
          { key: "delivery", label: "Format", options: [{ value: "online", label: "Online" }, { value: "classroom", label: "Classroom" }, { value: "blended", label: "Blended" }] },
        ]}
        values={filters} onChange={setFilters}
        actions={courses.data && <span className="text-[13px] tabular text-faint">{list.length} course{list.length === 1 ? "" : "s"}</span>} />

      {courses.loading && !courses.data ? (
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-[300px] rounded-2xl" />)}</div>
      ) : !list.length ? (
        <div className="mt-5 rounded-2xl border border-line bg-surface">
          <EmptyState icon={filtered ? Search : GraduationCap} title={filtered ? "No courses match" : "No courses yet"} hint={filtered ? "Try another search or clear the filters." : "Courses appear here once HR publishes them."} />
        </div>
      ) : (
        <>
          {!!mine.length && !filtered && (
            <section className="mt-6">
              <p className="mb-3 text-[15px] text-ink">Continue learning</p>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {mine.map((c) => <CourseCard key={c.uuid} course={c} onOpen={() => setPlayer(c.uuid)} />)}
              </div>
            </section>
          )}
          <section className="mt-8">
            {!!mine.length && !filtered && <p className="mb-3 text-[15px] text-ink">All courses</p>}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {(filtered ? list : rest).map((c) => <CourseCard key={c.uuid} course={c} onOpen={() => setDetail(c.uuid)} />)}
            </div>
          </section>
        </>
      )}

      {!filtered && !!paths.data?.length && (
        <section className="mt-10">
          <p className="mb-1 text-[15px] text-ink">Learning paths</p>
          <p className="mb-3 text-[13px] text-muted">Courses that go together, in order.</p>
          <div className="grid gap-4 lg:grid-cols-2">
            {paths.data.map((p) => <PathCard key={p.uuid} path={p} joining={joining === p.uuid} onJoin={me?.employee_id ? () => join(p) : undefined} onOpenCourse={(u) => setDetail(u)} />)}
          </div>
        </section>
      )}

      {!!requests.data?.length && (
        <section className="mt-10">
          <p className="mb-3 text-[15px] text-ink">My course requests</p>
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {requests.data.map((r) => (
              <div key={r.uuid} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{r.title}{r.provider ? <span className="text-muted"> · {r.provider}</span> : null}</span>
                <span className="text-[12.5px] text-faint">{formatDate(r.created_at)}</span>
                <Badge tone={REQ_TONE[r.status]} dot>{r.status === "fulfilled" ? "Added to catalogue" : r.status[0].toUpperCase() + r.status.slice(1)}</Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      <CourseDetailModal courseUuid={detail} onClose={() => setDetail(null)} onPlay={(u) => { setDetail(null); setPlayer(u); }} onChanged={refresh} />
      <CoursePlayer courseUuid={player} onClose={() => setPlayer(null)} onChanged={refresh} />
      <RequestCourseModal open={requestOpen} onClose={() => setRequestOpen(false)} onSaved={requests.refresh} />
    </div>
  );
}

export default function LearningPage() {
  return <Suspense fallback={null}><Catalogue /></Suspense>;
}
