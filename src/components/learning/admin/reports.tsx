"use client";

/*
 * Learning admin: reports (headline numbers, mandatory-training compliance such as POSH,
 * completion by department, and every enrolment with filters) and settings (certificate
 * wording).
 */
import { useEffect, useState } from "react";
import { Award, BookOpen, CheckCircle2, GraduationCap, ShieldCheck, TriangleAlert, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { Paper, PaperHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, Field, FilterBar, Skeleton, StatCard, StatGrid, TextInput, Textarea, type Column, type FilterValues,
} from "@/components/ui-kit";
import { Bar, EnrolmentBadge, errText, useLoad, useSimpleOptions } from "../shared";
import type { Course, EnrolmentRow, LearningSettings, Summary } from "../types";

export function ReportsTab() {
  const { data: s } = useLoad<Summary>("/learning/reports/summary", "Couldn't load the summary");
  const courses = useLoad<Course[]>("/learning/courses");
  const departments = useSimpleOptions("/departments/", "department_name");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const q = new URLSearchParams({ page: String(page), size: "25" });
  if (filters.course?.[0]) q.set("course_id", filters.course[0]);
  if (filters.status?.[0] && filters.status[0] !== "overdue") q.set("status", filters.status[0]);
  if (filters.status?.[0] === "overdue") q.set("overdue", "true");
  if (filters.department?.[0]) q.set("department_id", filters.department[0]);
  const rows = useLoad<{ items: EnrolmentRow[]; total: number }>(`/learning/enrolments?${q}`, "Couldn't load enrolments");

  const columns: Column<EnrolmentRow>[] = [
    { key: "who", header: "Employee", cell: (r) => <span className="flex items-center gap-2.5"><Avatar name={r.employee?.name ?? "?"} src={r.employee?.photo} size={28} /><span className="min-w-0"><span className="block truncate text-ink/85">{r.employee?.name}</span><span className="block truncate text-[12px] text-muted">{r.employee?.department ?? "—"}</span></span></span> },
    { key: "course", header: "Course", cell: (r) => <span className="text-ink/80">{r.course.title}</span> },
    { key: "progress", header: "Progress", hideBelow: "md", cell: (r) => <div className="flex w-32 items-center gap-2"><Bar value={r.progress} /><span className="w-9 text-right text-[12px] tabular text-muted">{Math.round(r.progress)}%</span></div> },
    { key: "due", header: "Due", hideBelow: "lg", cell: (r) => r.due_date ? <span className={r.overdue ? "text-rose-700" : "text-muted"}>{formatDate(r.due_date)}</span> : <span className="text-faint">—</span> },
    { key: "score", header: "Score", align: "right", hideBelow: "lg", cell: (r) => r.score !== null ? <span className="tabular">{Math.round(r.score)}%</span> : <span className="text-faint">—</span> },
    { key: "status", header: "Status", cell: (r) => <EnrolmentBadge enrolment={r} overdue={r.overdue} /> },
  ];

  return (
    <div className="space-y-6">
      {!s ? <Skeleton className="h-28" /> : (
        <StatGrid className="xl:grid-cols-4">
          <StatCard label="Enrolments" value={s.enrolments} icon={Users} hint={`${s.courses} published courses`} />
          <StatCard label="Completion" value={`${s.completion_pct}%`} icon={CheckCircle2} hint={`${s.completed} completed`} />
          <StatCard label="Overdue" value={s.overdue} icon={TriangleAlert} hint="Past their due date" />
          <StatCard label="Assessments" value={s.avg_score !== null ? `${s.avg_score}%` : "—"} icon={Award} hint={s.pass_rate !== null ? `Average score · ${s.pass_rate}% pass` : "No attempts yet"} />
        </StatGrid>
      )}
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Paper>
          <PaperHeader title={<span className="inline-flex items-center gap-2"><ShieldCheck size={16} strokeWidth={1.4} className="text-muted" /> Mandatory training</span>} />
          {!s ? <div className="p-5"><Skeleton className="h-24" /></div> : s.mandatory.length ? (
            <div className="divide-y divide-line">
              {s.mandatory.map((m) => (
                <div key={m.course_uuid} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-[14.5px] text-ink">{m.course}</p>
                    <span className="text-[13px] tabular text-muted">{m.completed}/{m.assigned}</span>
                  </div>
                  <Bar value={m.completion_pct} tone={m.completion_pct >= 90 ? "bg-emerald-500" : m.completion_pct >= 60 ? "bg-amber-500" : "bg-rose-500"} className="mt-2" height={6} />
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone={m.completion_pct >= 90 ? "good" : "neutral"}>{m.completion_pct}% complete</Badge>
                    {m.overdue > 0 && <Badge tone="bad">{m.overdue} overdue</Badge>}
                    {m.expiring > 0 && <Badge tone="warn">{m.expiring} expiring in 30 days</Badge>}
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="px-5 py-8 text-center text-[13.5px] text-muted">No mandatory courses assigned yet.</p>}
        </Paper>
        <Paper>
          <PaperHeader title={<span className="inline-flex items-center gap-2"><GraduationCap size={16} strokeWidth={1.4} className="text-muted" /> By department</span>} />
          {!s ? <div className="p-5"><Skeleton className="h-24" /></div> : (
            <div className="space-y-3.5 p-5">
              {s.by_department.map((d) => (
                <div key={d.department}>
                  <div className="mb-1 flex items-center justify-between text-[13.5px]"><span className="text-ink/85">{d.department}</span><span className="tabular text-muted">{d.completion_pct}% · {d.completed}/{d.enrolled}</span></div>
                  <Bar value={d.completion_pct} />
                </div>
              ))}
              {!s.by_department.length && <p className="text-center text-[13.5px] text-muted">No enrolments yet.</p>}
            </div>
          )}
        </Paper>
      </div>
      <div>
        <p className="mb-3 text-[15px] text-ink">All enrolments</p>
        <FilterBar values={filters} onChange={(v) => { setFilters(v); setPage(1); }} filters={[
          { key: "course", label: "Course", options: (courses.data ?? []).map((c) => ({ value: String(c.id), label: c.title })) },
          { key: "status", label: "Status", options: [{ value: "overdue", label: "Overdue" }, { value: "enrolled", label: "Not started" }, { value: "in_progress", label: "In progress" }, { value: "completed", label: "Completed" }, { value: "requested", label: "Awaiting approval" }] },
          { key: "department", label: "Department", options: departments.map((d) => ({ value: String(d.value), label: d.label })) },
        ]} actions={rows.data && <span className="text-[13px] tabular text-faint">{rows.data.total} enrolments</span>} />
        <DataTable rows={rows.data?.items ?? []} rowKey={(r) => r.uuid} columns={columns} loading={rows.loading}
          pagination={{ page, size: 25, total: rows.data?.total ?? 0, onPageChange: setPage }}
          emptyIcon={BookOpen} emptyTitle="No enrolments match" />
      </div>
    </div>
  );
}

export function SettingsTab() {
  const toast = useToast();
  const [v, setV] = useState<LearningSettings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get<LearningSettings>("/learning/settings").then(setV).catch(() => {}); }, []);
  async function save() {
    if (!v) return;
    setSaving(true);
    try { setV(await api.put<LearningSettings>("/learning/settings", v)); toast.success("Settings saved"); }
    catch (e) { toast.error("Couldn't save", { description: errText(e) }); }
    finally { setSaving(false); }
  }
  if (!v) return <Skeleton className="h-64" />;
  return (
    <Paper className="max-w-2xl">
      <PaperHeader title="Certificates" />
      <div className="space-y-5 p-5">
        <Field label="Title"><TextInput value={v.certificate_title} onValueChange={(x) => setV({ ...v, certificate_title: x })} /></Field>
        <Field label="Wording" hint="Use {employee_name}, {course_title} and {completed_on}."><Textarea value={v.certificate_text} onValueChange={(x) => setV({ ...v, certificate_text: x })} rows={3} /></Field>
        <Field label="Signed by"><TextInput value={v.certificate_signatory} onValueChange={(x) => setV({ ...v, certificate_signatory: x })} /></Field>
        <p className="text-[13px] text-muted">Certificate numbers follow the “Certificates” series in Numbering.</p>
        <div className="flex justify-end"><Button variant="primary" loading={saving} onClick={save}>Save</Button></div>
      </div>
    </Paper>
  );
}
