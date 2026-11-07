"use client";

/*
 * Help desk reports: volume by category, SLA met and breaches, ratings, for a date range.
 */
import { useEffect, useState } from "react";
import { AlarmClock, Inbox, LifeBuoy, Star, Target } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import { Paper, PaperHeader } from "@/components/shell/page";
import { DataTable, DateRangeInput, Skeleton, StatCard, type DateRange } from "@/components/ui-kit";
import { durationLabel } from "@/components/workplace/pickers";
import { PriorityBadge, StatusBadge } from "./types";

type Volume = {
  category_id: number; category: string | null; total: number; open: number; resolved: number; breached: number;
  avg_resolution_hours: number | null; avg_first_response_hours: number | null; sla_met_percent: number | null;
};
type Breach = {
  uuid: string; reference_no: string | null; subject: string; category: string | null; priority: string; status: string;
  assignee_name: string | null; response_late_minutes: number | null; resolution_late_minutes: number | null; created_at: string;
};
type Report = {
  total: number; open: number; breached: number; sla_met_percent: number | null; avg_rating: number | null;
  ratings: Record<string, number>; by_category: Volume[]; breaches: Breach[];
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function HelpdeskReports({ onOpenCase, scale, statuses }: { onOpenCase: (uuid: string) => void; scale: number; statuses: Record<string, string> }) {
  const today = new Date();
  const [range, setRange] = useState<DateRange>({ from: iso(new Date(today.getTime() - 89 * 864e5)), to: iso(today) });
  const [data, setData] = useState<{ key: string; r: Report } | null>(null);
  const key = `${range.from}|${range.to}`;
  useEffect(() => {
    if (!range.from || !range.to) return;
    let live = true;
    api.get<Report>(`/helpdesk/reports?start=${range.from}&end=${range.to}`).then((r) => { if (live) setData({ key, r }); }).catch(() => {});
    return () => { live = false; };
  }, [key, range.from, range.to]);
  const r = data?.key === key ? data.r : null;
  const max = Math.max(1, ...(r?.by_category.map((v) => v.total) ?? [1]));
  const rated = r ? Object.values(r.ratings).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-muted">Cases raised in the period.</p>
        <div className="w-[300px] max-w-full"><DateRangeInput value={range} onChange={setRange} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {r ? (
          <>
            <StatCard label="Cases" value={r.total} icon={LifeBuoy} />
            <StatCard label="Still open" value={r.open} icon={Inbox} />
            <StatCard label="Missed a target" value={r.breached} icon={AlarmClock} />
            <StatCard label="Targets met" value={r.sla_met_percent === null ? "—" : `${r.sla_met_percent}%`} icon={Target} />
            <StatCard label="Average rating" value={r.avg_rating === null ? "—" : `${r.avg_rating} / ${scale}`} icon={Star} hint={rated ? `${rated} ratings` : undefined} />
          </>
        ) : [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[118px] rounded-2xl" />)}
      </div>

      <Paper>
        <PaperHeader title="Volume by category" />
        <div className="divide-y divide-line">
          {!r ? <div className="p-5"><Skeleton className="h-24" /></div> : r.by_category.length === 0 ? (
            <p className="px-5 py-8 text-center text-[13.5px] text-muted">No cases in this period.</p>
          ) : r.by_category.map((v) => (
            <div key={v.category_id} className="grid grid-cols-1 items-center gap-3 px-5 py-3 md:grid-cols-[180px_1fr_330px]">
              <span className="truncate text-[14px] text-ink">{v.category}</span>
              <div className="flex h-6 items-center gap-2">
                <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-sunken">
                  <span className="h-full bg-primary/70" style={{ width: `${(v.resolved / max) * 100}%` }} title={`${v.resolved} resolved`} />
                  <span className="h-full bg-primary/25" style={{ width: `${((v.total - v.resolved) / max) * 100}%` }} title={`${v.total - v.resolved} open`} />
                </div>
                <span className="tabular w-8 text-right text-[13px] text-ink">{v.total}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-right text-[12.5px] text-muted">
                <span>Reply {v.avg_first_response_hours ?? "—"} h</span>
                <span>Resolve {v.avg_resolution_hours ?? "—"} h</span>
                <span className={v.sla_met_percent !== null && v.sla_met_percent < 80 ? "text-rose-600" : ""}>{v.sla_met_percent ?? "—"}% on time</span>
              </div>
            </div>
          ))}
        </div>
      </Paper>

      <div>
        <p className="mb-2 text-[15px] text-ink">Missed targets</p>
        <DataTable<Breach>
          rows={r?.breaches ?? []} rowKey={(b) => b.uuid} loading={!r} onRowClick={(b) => onOpenCase(b.uuid)}
          emptyIcon={Target} emptyTitle="Every target was met" emptyHint="Cases that miss their reply or resolution time show here."
          columns={[
            { key: "ref", header: "Case", cell: (b) => <div className="min-w-0"><p className="truncate text-ink">{b.subject}</p><p className="text-[12.5px] text-faint">{b.reference_no} · {b.category}</p></div> },
            { key: "priority", header: "Priority", hideBelow: "sm", cell: (b) => <PriorityBadge priority={b.priority} /> },
            { key: "late", header: "Late by", sortable: true, sortValue: (b) => b.resolution_late_minutes ?? b.response_late_minutes ?? 0,
              cell: (b) => <span className="text-rose-600">{durationLabel(b.resolution_late_minutes || b.response_late_minutes)}</span> },
            { key: "who", header: "Agent", hideBelow: "md", cell: (b) => <span className="text-muted">{b.assignee_name ?? "Nobody"}</span> },
            { key: "status", header: "Status", cell: (b) => <StatusBadge status={b.status} label={statuses[b.status]} /> },
            { key: "raised", header: "Raised", hideBelow: "lg", cell: (b) => <span className="text-muted">{formatDateTime(b.created_at)}</span> },
          ]} />
      </div>
    </div>
  );
}
