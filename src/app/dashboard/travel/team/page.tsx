"use client";

/*
 * Team trips (managers): trips of the people who report to me, with policy warnings, and
 * approve or reject from the trip itself (the Approvals inbox has them too).
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Luggage } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import { Avatar, DataTable, FilterBar, type Column, type FilterValues } from "@/components/ui-kit";
import { errMsg, inr, type Page } from "@/components/payroll/common";
import { ModeIcons, TripDetailModal, TripStatus, type Trip } from "@/components/travel/trip-modals";

export default function TeamTripsPage() {
  const toast = useToast();
  const [filters, setFilters] = useState<FilterValues>({});
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Trip> | null>(null);
  const [view, setView] = useState<string | null>(null);
  const load = useCallback(() => {
    const qs = new URLSearchParams({ scope: "team", page: String(page), size: "25" });
    if (filters.status?.length) qs.set("status", filters.status.join(","));
    if (filters.policy?.length) qs.set("outside_policy", filters.policy[0]);
    if (q) qs.set("q", q);
    api.get<Page<Trip>>(`/travel/trips?${qs}`).then(setData).catch((e) => toast.error(errMsg(e)));
  }, [filters, q, page, toast]);
  useEffect(() => { load(); }, [load]);
  const columns: Column<Trip>[] = [
    { key: "who", header: "Employee", cell: (t) => <span className="flex items-center gap-2"><Avatar name={t.employee_name ?? ""} size={26} /><span className="text-ink">{t.employee_name}</span></span> },
    { key: "trip", header: "Trip", cell: (t) => <div className="min-w-0"><p className="truncate text-ink">{t.purpose}</p><p className="truncate text-[12.5px] text-faint">{t.route}</p></div> },
    { key: "when", header: "Dates", hideBelow: "md", cell: (t) => <span className="text-muted">{formatDate(t.start_date)} – {formatDate(t.end_date)}</span> },
    { key: "by", header: "By", hideBelow: "lg", cell: (t) => <ModeIcons modes={t.modes} /> },
    { key: "amt", header: "Estimated", align: "right", cell: (t) => <span className="tabular text-ink">{inr(t.estimated_total)}</span> },
    { key: "flag", header: "", cell: (t) => t.outside_policy ? <span title={t.policy_flags.map((f) => f.message).join("\n")}><AlertTriangle size={15} strokeWidth={1.4} className="text-amber-600" /></span> : null },
    { key: "st", header: "Status", cell: (t) => <TripStatus status={t.status} label={t.status_label} /> },
  ];
  return (
    <div>
      <PageHeader eyebrow="Home" title="Team trips" description="Work travel of the people who report to you." />
      <FilterBar searchPlaceholder="Search trips" onSearchChange={(x) => { setQ(x); setPage(1); }} values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[{ key: "status", label: "Status", multiple: true, options: [{ value: "pending", label: "Waiting" }, { value: "approved", label: "Approved" }, { value: "booked", label: "Booked" }, { value: "settled", label: "Settled" }, { value: "rejected", label: "Rejected" }] },
          { key: "policy", label: "Policy", options: [{ value: "true", label: "Outside policy" }, { value: "false", label: "Within policy" }] }]} />
      <DataTable rows={data?.items ?? []} rowKey={(t) => t.uuid} columns={columns} loading={!data} onRowClick={(t) => setView(t.uuid)}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }} emptyIcon={Luggage} emptyTitle="No team trips" emptyHint="Trips your team plans show up here." />
      <TripDetailModal uuid={view} open={!!view} onClose={() => setView(null)} onChanged={load} />
    </div>
  );
}
