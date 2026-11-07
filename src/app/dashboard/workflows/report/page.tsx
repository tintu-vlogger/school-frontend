"use client";

/*
 * Approvals history: every decision with how long it took and whether it was within the
 * step's time limit, plus totals per kind of request and per approver.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCheck, Clock, Download, Hourglass, Mail, Timer } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime } from "@/lib/datetime";
import { downloadFrom } from "@/components/workplace/files";
import { PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateRangeInput, FilterBar, Select, StatCard, StatGrid, Tabs, type BadgeTone, type Column,
  type FilterValues, type SelectOption,
} from "@/components/ui-kit";

type Row = {
  task_uuid: string; request_uuid: string; reference_no: string | null; title: string; request_type_label: string;
  requester_name: string | null; step_name: string; approver_name: string | null; status: string;
  decided_by_name: string | null; decided_via: string | null; created_at: string; decided_at: string | null;
  due_at: string | null; hours_taken: number | null; hours_waiting: number | null; within_sla: boolean | null;
};
type Bucket = {
  key: string; label: string; decided: number; approved: number; rejected: number; pending: number; overdue: number;
  avg_hours: number | null; sla_rate: number | null;
};
type Summary = {
  overall: { decided: number; pending: number; overdue: number; avg_hours: number | null; sla_rate: number | null; auto: number; by_email: number };
  by_type: Bucket[]; by_approver: Bucket[];
};
type Page<T> = { items: T[]; total: number; page: number; size: number };

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Waiting", tone: "warn" }, approved: { label: "Approved", tone: "good" }, rejected: { label: "Rejected", tone: "bad" },
  reassigned: { label: "Passed on", tone: "info" }, escalated: { label: "Escalated", tone: "info" },
};
const VIA: Record<string, string> = { app: "In the app", email: "From email", bulk: "In bulk", auto: "Automatically", system: "By the system" };
const SIZE = 25;

function hours(h: number | null) {
  if (h === null || h === undefined) return "—";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} days`;
}

export default function ApprovalsReportPage() {
  const toast = useToast();
  const [tab, setTab] = useState<"history" | "types" | "approvers">("history");
  const [range, setRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [kind, setKind] = useState<string | null>(null);
  const [kinds, setKinds] = useState<SelectOption[]>([]);
  const [filters, setFilters] = useState<FilterValues>({});
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Page<Row> | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    api.get<{ key: string; label: string }[]>("/workflow/request-types")
      .then((r) => setKinds(r.map((x) => ({ value: x.key, label: x.label })))).catch(() => {});
  }, []);

  const params = useCallback((withPage: boolean) => {
    const p = new URLSearchParams();
    if (range.from) p.set("date_from", range.from);
    if (range.to) p.set("date_to", range.to);
    if (kind) p.set("request_type", kind);
    if (withPage) {
      if (filters.status?.[0]) p.set("status", filters.status[0]);
      if (q.trim()) p.set("q", q.trim());
      p.set("page", String(page));
      p.set("size", String(SIZE));
    }
    return p.toString();
  }, [range, kind, filters, q, page]);

  useEffect(() => {
    setRows(null);
    api.get<Page<Row>>(`/workflow/reports/history?${params(true)}`).then(setRows)
      .catch((e) => { toast.error(e instanceof Error ? e.message : "Couldn't load the report"); setRows({ items: [], total: 0, page: 1, size: SIZE }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);
  useEffect(() => {
    api.get<Summary>(`/workflow/reports/summary?${params(false)}`).then(setSummary).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, kind]);
  useEffect(() => { setPage(1); }, [range, kind, filters, q]);

  const cols: Column<Row>[] = [
    { key: "req", header: "Request", cell: (r) => (
      <div className="min-w-0">
        <p className="truncate text-ink">{r.title}</p>
        <p className="truncate text-[12.5px] text-faint">{r.reference_no ?? ""} · {r.request_type_label}</p>
      </div>
    ) },
    { key: "step", header: "Step and approver", hideBelow: "md", cell: (r) => (
      <div className="min-w-0 text-[13px]"><p className="truncate text-ink">{r.approver_name}</p><p className="truncate text-faint">{r.step_name}</p></div>
    ) },
    { key: "status", header: "Outcome", cell: (r) => (
      <div className="space-y-0.5">
        <Badge tone={STATUS[r.status]?.tone ?? "neutral"} dot>{STATUS[r.status]?.label ?? r.status}</Badge>
        {r.decided_via && <p className="text-[12px] text-faint">{VIA[r.decided_via] ?? r.decided_via}</p>}
      </div>
    ) },
    { key: "asked", header: "Asked", hideBelow: "lg", cell: (r) => <span className="text-muted">{formatDateTime(r.created_at)}</span> },
    { key: "took", header: "Time taken", align: "right", cell: (r) => (
      <span className="tabular text-muted">{r.status === "pending" ? `${hours(r.hours_waiting)} so far` : hours(r.hours_taken)}</span>
    ) },
    { key: "sla", header: "Time limit", align: "right", hideBelow: "sm", cell: (r) => r.within_sla === null
      ? <span className="text-faint">None</span>
      : r.within_sla ? <Badge tone="good">Within</Badge> : <Badge tone="bad">Late</Badge> },
  ];

  const bucketCols: Column<Bucket>[] = [
    { key: "label", header: tab === "types" ? "Kind of request" : "Approver", cell: (b) => <span className="text-ink">{b.label}</span> },
    { key: "decided", header: "Decided", align: "right", cell: (b) => <span className="tabular">{b.decided}</span> },
    { key: "approved", header: "Approved", align: "right", hideBelow: "md", cell: (b) => <span className="tabular text-muted">{b.approved}</span> },
    { key: "rejected", header: "Rejected", align: "right", hideBelow: "md", cell: (b) => <span className="tabular text-muted">{b.rejected}</span> },
    { key: "pending", header: "Waiting", align: "right", cell: (b) => (
      <span className="tabular">{b.pending}{b.overdue ? <span className="text-rose-600"> ({b.overdue} late)</span> : null}</span>
    ) },
    { key: "avg", header: "Average time", align: "right", cell: (b) => <span className="tabular text-muted">{hours(b.avg_hours)}</span> },
    { key: "sla", header: "Within limit", align: "right", cell: (b) => <span className="tabular">{b.sla_rate === null ? "—" : `${b.sla_rate}%`}</span> },
  ];

  const o = summary?.overall;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Approvals history"
        description="How quickly requests are decided, and how many are decided within their time limits."
        actions={<>
          <Link href="/dashboard/workflows"><Button variant="ghost" icon={ArrowLeft}>Approval flows</Button></Link>
          <Button variant="secondary" icon={Download}
            onClick={() => downloadFrom(`/workflow/reports/history.csv?${params(false)}`, "approvals-history.csv").catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't download"))}>
            Download CSV
          </Button>
        </>} />

      <Paper className="flex flex-wrap items-end gap-4 p-4">
        <div className="w-72"><p className="mb-1.5 text-[12.5px] text-muted">Asked between</p><DateRangeInput value={range} onChange={setRange} /></div>
        <div className="w-64"><p className="mb-1.5 text-[12.5px] text-muted">Kind of request</p>
          <Select value={kind} onChange={(v) => setKind(v ? String(v) : null)} options={kinds} clearable placeholder="All kinds" /></div>
      </Paper>

      <StatGrid>
        <StatCard label="Decided" value={o?.decided ?? "—"} icon={CheckCheck} hint={o ? `${o.by_email} from email, ${o.auto} automatically` : undefined} />
        <StatCard label="Average time to decide" value={o ? hours(o.avg_hours) : "—"} icon={Timer} />
        <StatCard label="Within the time limit" value={o?.sla_rate === null || !o ? "—" : `${o.sla_rate}%`} icon={Clock} hint="of steps that have a limit" />
        <StatCard label="Waiting now" value={o?.pending ?? "—"} icon={Hourglass} hint={o?.overdue ? `${o.overdue} late` : "none late"} />
      </StatGrid>

      <Tabs value={tab} onChange={setTab} items={[
        { value: "history", label: "Every decision", icon: Mail },
        { value: "types", label: "By kind of request" },
        { value: "approvers", label: "By approver" },
      ]} />

      {tab === "history" ? (
        <>
          <FilterBar search={q} onSearchChange={setQ} searchPlaceholder="Search by request, reference or person"
            filters={[{ key: "status", label: "Outcome", options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })) }]}
            values={filters} onChange={setFilters} />
          <DataTable rows={rows?.items ?? []} loading={rows === null} columns={cols} rowKey={(r) => r.task_uuid}
            pagination={rows ? { page, size: SIZE, total: rows.total, onPageChange: setPage } : undefined}
            emptyIcon={CheckCheck} emptyTitle="No approvals in this period" emptyHint="Try a wider date range." />
        </>
      ) : (
        <DataTable rows={(tab === "types" ? summary?.by_type : summary?.by_approver) ?? []} loading={summary === null}
          columns={bucketCols} rowKey={(b) => b.key} emptyIcon={CheckCheck} emptyTitle="No approvals in this period" />
      )}
    </div>
  );
}
