"use client";

/*
 * Learning admin: courses, batches, question bank, assessments, learning paths,
 * enrolment rules, course requests, reports and settings. Each tab lives in
 * src/components/learning/admin/. The tab is kept in the address (?tab=).
 */
import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3, BookOpen, CalendarDays, CircleHelp, ClipboardCheck, Inbox, Route, Settings2, Wand2 } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/shell/page";
import { Skeleton, Tabs } from "@/components/ui-kit";
import { AssessmentsTab, QuestionsTab } from "@/components/learning/admin/assessments";
import { BatchesTab } from "@/components/learning/admin/batches";
import { CoursesTab } from "@/components/learning/admin/courses";
import { PathsTab, RequestsTab, RulesTab } from "@/components/learning/admin/plans";
import { ReportsTab, SettingsTab } from "@/components/learning/admin/reports";
import { CourseDetailModal } from "@/components/learning/course-card";
import { LearningTabs, useLearningMe } from "@/components/learning/shared";

const TABS = [
  { value: "courses", label: "Courses", icon: BookOpen },
  { value: "batches", label: "Batches", icon: CalendarDays },
  { value: "questions", label: "Question bank", icon: CircleHelp },
  { value: "assessments", label: "Assessments", icon: ClipboardCheck },
  { value: "paths", label: "Paths", icon: Route },
  { value: "rules", label: "Rules", icon: Wand2 },
  { value: "requests", label: "Requests", icon: Inbox },
  { value: "reports", label: "Reports", icon: BarChart3 },
  { value: "settings", label: "Settings", icon: Settings2 },
];

function Admin() {
  const me = useLearningMe();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get("tab")) ? params.get("tab")! : "courses";
  const [preview, setPreview] = useState<string | null>(null);
  const setTab = (t: string) => router.replace(`${pathname}?tab=${t}`, { scroll: false });

  return (
    <div>
      <PageHeader eyebrow="Talent" title="Learning admin" description="Build courses and quizzes, assign training and track completion." />
      <LearningTabs me={me} />
      {!me ? <Skeleton className="h-64" /> : !me.is_admin ? (
        <div className="rounded-2xl border border-line bg-surface"><EmptyState icon={BookOpen} title="This is for learning administrators" hint="Ask HR if you need to set up courses." /></div>
      ) : (
        <>
          <Tabs value={tab} onChange={setTab} items={TABS} className="mb-5" />
          {tab === "courses" && <CoursesTab onPreview={setPreview} />}
          {tab === "batches" && <BatchesTab />}
          {tab === "questions" && <QuestionsTab />}
          {tab === "assessments" && <AssessmentsTab />}
          {tab === "paths" && <PathsTab />}
          {tab === "rules" && <RulesTab />}
          {tab === "requests" && <RequestsTab />}
          {tab === "reports" && <ReportsTab />}
          {tab === "settings" && <SettingsTab />}
        </>
      )}
      <CourseDetailModal courseUuid={preview} onClose={() => setPreview(null)} onPlay={() => setPreview(null)} />
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><Admin /></Suspense>;
}
