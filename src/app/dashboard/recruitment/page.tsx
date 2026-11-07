"use client";

/*
 * Hiring overview: numbers at a glance and every job opening. New and edited jobs open
 * in a modal; a row opens the job details; the pipeline has its own board page.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart3, Briefcase, CalendarClock, Columns3, FilePlus2, FileSignature, Plus, Settings2, UserSearch, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import { Badge, Button, DataTable, FilterBar, StatCard, type Column, type FilterValues } from "@/components/ui-kit";
import { useHiringMeta } from "@/components/recruitment/common";
import { JobFormModal } from "@/components/recruitment/job-form";
import { JobModal } from "@/components/recruitment/job-detail";
import { JOB_TONE, errText, expRange, range, type Job, type Page } from "@/components/recruitment/types";

type Summary = {
  open_jobs: number; active_candidates: number; interviews_this_week: number; offers_out: number;
  offers_pending_approval: number; requisitions_pending: number; follow_ups_due: number;
};

export default function HiringPage() {
  const toast = useToast();
  const router = useRouter();
  const meta = useHiringMeta();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [data, setData] = useState<Page<Job> | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; job: Job | null }>({ open: false, job: null });
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => { api.get<Summary>("/recruitment/summary").then(setSummary).catch(() => {}); }, [nonce]);
  useEffect(() => {
    const p = new URLSearchParams({ page: String(page), size: "25" });
    if (q) p.set("q", q);
    if (filters.status?.length) p.set("status", filters.status.join(","));
    setLoading(true);
    api.get<Page<Job>>(`/recruitment/jobs?${p}`).then(setData).catch((e) => toast.error(errText(e))).finally(() => setLoading(false));
  }, [q, filters, page, nonce, toast]);

  const columns: Column<Job>[] = [
    { key: "title", header: "Job", cell: (j) => <div><p className="text-ink">{j.title}</p><p className="text-[12.5px] text-faint">{[j.code, j.department].filter(Boolean).join(" · ")}</p></div> },
    { key: "location", header: "Location", cell: (j) => <span className="text-muted">{j.location ?? "—"} · {j.work_mode_label}</span>, hideBelow: "md" },
    { key: "exp", header: "Experience", cell: (j) => <span className="text-muted">{expRange(j.min_experience, j.max_experience)}</span>, hideBelow: "lg" },
    { key: "ctc", header: "CTC", cell: (j) => <span className="tabular text-muted">{range(j.salary_min, j.salary_max)}</span>, hideBelow: "lg" },
    { key: "active", header: "In the running", align: "right", cell: (j) => <span className="tabular">{j.counts?.active ?? 0}</span> },
    { key: "hired", header: "Hired", align: "right", cell: (j) => <span className="tabular text-muted">{j.counts?.hired ?? 0}/{j.openings}</span>, hideBelow: "sm" },
    { key: "status", header: "Status", cell: (j) => <Badge tone={JOB_TONE[j.status ?? ""] ?? "neutral"} dot>{j.status_label}</Badge> },
  ];

  const statuses = Object.entries(meta?.job_statuses ?? {}).map(([value, label]) => ({ value, label }));
  return (
    <div>
      <PageHeader title="Hiring" description="Job openings, candidates and offers in one place."
        actions={<>
          <Link href="/dashboard/recruitment/reports"><Button variant="ghost" icon={BarChart3}>Reports</Button></Link>
          <Link href="/dashboard/recruitment/settings"><Button variant="ghost" icon={Settings2}>Careers page</Button></Link>
          <Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, job: null })}>New job</Button>
        </>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open jobs" value={summary?.open_jobs ?? "—"} icon={Briefcase} />
        <StatCard label="Candidates in the running" value={summary?.active_candidates ?? "—"} icon={Users} onClick={() => router.push("/dashboard/recruitment/candidates")} />
        <StatCard label="Interviews this week" value={summary?.interviews_this_week ?? "—"} icon={CalendarClock} onClick={() => router.push("/dashboard/recruitment/interviews")} />
        <StatCard label="Offers out" value={summary?.offers_out ?? "—"} icon={FileSignature}
          hint={summary?.offers_pending_approval ? `${summary.offers_pending_approval} waiting for approval` : undefined} onClick={() => router.push("/dashboard/recruitment/offers")} />
      </div>
      {(!!summary?.requisitions_pending || !!summary?.follow_ups_due) && (
        <div className="mb-5 flex flex-wrap gap-3 text-[13.5px]">
          {!!summary?.requisitions_pending && <Link href="/dashboard/recruitment/requisitions" className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50/70 px-3 py-1 text-amber-800"><FilePlus2 size={14} strokeWidth={1.4} />{summary.requisitions_pending} hiring request(s) waiting for approval</Link>}
          {!!summary?.follow_ups_due && <Link href="/dashboard/recruitment/candidates?follow_up=1" className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50/70 px-3 py-1 text-sky-800"><UserSearch size={14} strokeWidth={1.4} />{summary.follow_ups_due} follow-up(s) due</Link>}
        </div>
      )}
      <FilterBar searchPlaceholder="Search jobs" onSearchChange={(x) => { setQ(x); setPage(1); }}
        filters={[{ key: "status", label: "Status", options: statuses, multiple: true }]} values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={data?.items ?? []} columns={columns} rowKey={(j) => j.uuid} loading={loading && !data}
        onRowClick={(j) => setViewing(j.uuid)}
        rowActions={(j) => [
          { label: "Open pipeline", icon: Columns3, onSelect: () => router.push(`/dashboard/recruitment/pipeline?job=${j.uuid}`) },
          { label: "Edit", onSelect: () => setForm({ open: true, job: j }) },
        ]}
        emptyIcon={Briefcase} emptyTitle="No job openings yet" emptyHint="Create a job, publish it on your careers page and share it."
        emptyAction={<Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, job: null })}>New job</Button>}
        pagination={data ? { page: data.page, size: data.size, total: data.total, onPageChange: setPage } : undefined} />
      <JobModal uuid={viewing} onClose={() => setViewing(null)} onChanged={refresh}
        onEdit={(j) => { setViewing(null); api.get<Job>(`/recruitment/jobs/${j.uuid}`).then((full) => setForm({ open: true, job: full })); }} />
      <JobFormModal open={form.open} job={form.job} onClose={() => setForm({ open: false, job: null })}
        onSaved={(j) => { setForm({ open: false, job: null }); refresh(); setViewing(j.uuid); }} />
    </div>
  );
}
