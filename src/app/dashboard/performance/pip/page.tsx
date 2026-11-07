"use client";

/*
 * Improvement plans: HR sees every plan, managers their team's, employees their own. Start a
 * plan, open one (goals, check-ins, close or extend) and acknowledge it, all in modals.
 * ?view=<uuid> opens a plan directly.
 */
import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LifeBuoy, Plus } from "lucide-react";
import { formatDate } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import { Button, DataTable, FilterBar, StatCard, StatGrid, paginate, type Column, type FilterValues } from "@/components/ui-kit";
import { PerformanceTabs, PersonInline, ProgressBar, useList, usePerfMe } from "@/components/performance/shared";
import { PipFormModal, PipModal, PipStatusBadge } from "@/components/performance/talent/pip";
import type { PipItem } from "@/components/performance/types";

function PipPage() {
  const { me } = usePerfMe();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get("view");
  const list = useList<PipItem>("/performance/pips", "Couldn't load improvement plans");
  const [form, setForm] = useState<{ open: boolean; pip: PipItem | null; n: number }>({ open: false, pip: null, n: 0 });
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const canStart = !!(me?.is_admin || me?.is_manager);

  const setView = (uuid: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (uuid) sp.set("view", uuid); else sp.delete("view");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const rows = useMemo(() => list.rows.filter((p) => {
    if (filters.status?.[0] && p.status !== filters.status[0]) return false;
    if (search && !(p.employee?.name ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [list.rows, filters, search]);

  const running = list.rows.filter((p) => p.status === "active" || p.status === "extended");
  const closed = list.rows.filter((p) => p.status === "closed");

  const columns: Column<PipItem>[] = [
    { key: "employee", header: "Employee", sortable: true, sortValue: (p) => p.employee?.name ?? "",
      cell: (p) => <PersonInline person={p.employee} size={32} sub={p.employee?.designation ?? p.employee?.department} /> },
    { key: "dates", header: "Plan", hideBelow: "md", sortable: true, sortValue: (p) => p.start_date,
      cell: (p) => <span className="tabular text-muted">{formatDate(p.start_date)} – {formatDate(p.end_date)}</span> },
    { key: "time", header: "Time", hideBelow: "lg", width: "160px", cell: (p) => (
      <div className="w-32">
        <ProgressBar value={p.time_pct} tone={p.days_left < 0 && p.status !== "closed" ? "rose" : "indigo"} />
        <p className="mt-1 text-[12px] text-faint tabular">{p.status === "closed" ? "Ended" : p.days_left >= 0 ? `${p.days_left} days left` : "Past end date"}</p>
      </div>
    ) },
    { key: "goals", header: "Goals met", align: "right", cell: (p) => <span className="tabular text-ink/80">{p.goals_met}/{p.goals.length}</span> },
    { key: "checkins", header: "Check-ins", align: "right", hideBelow: "md", cell: (p) => <span className="tabular text-muted">{p.checkins.length}</span> },
    { key: "status", header: "Status", cell: (p) => <PipStatusBadge p={p} /> },
  ];

  return (
    <div>
      <PageHeader eyebrow="Performance" title="Improvement plans"
        description="A fair, structured way to help someone get back on track: clear goals, support and regular check-ins."
        actions={canStart && <Button variant="primary" icon={Plus} onClick={() => setForm((f) => ({ open: true, pip: null, n: f.n + 1 }))}>Start a plan</Button>} />
      <PerformanceTabs me={me} />

      {canStart && list.rows.length > 0 && (
        <StatGrid className="mb-6">
          <StatCard label="Running" value={running.length} hint="Active or extended" />
          <StatCard label="Ending in 14 days" value={running.filter((p) => p.days_left >= 0 && p.days_left <= 14).length} />
          <StatCard label="Closed successfully" value={closed.filter((p) => p.outcome === "successful").length} hint={`of ${closed.length} closed`} />
          <StatCard label="Not yet acknowledged" value={running.filter((p) => !p.acknowledged_at).length} />
        </StatGrid>
      )}

      <FilterBar searchPlaceholder="Search by employee" onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[{ key: "status", label: "Status", options: [
          { value: "active", label: "Active" }, { value: "extended", label: "Extended" }, { value: "draft", label: "Draft" }, { value: "closed", label: "Closed" },
        ] }]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={paginate(rows, page, 25)} rowKey={(p) => p.uuid} columns={columns} loading={list.loading}
        onRowClick={(p) => setView(p.uuid)}
        pagination={{ page, size: 25, total: rows.length, onPageChange: setPage }}
        emptyIcon={LifeBuoy}
        emptyTitle={search || filters.status?.length ? "No plans match" : "No improvement plans"}
        emptyHint={canStart ? "Start a plan when someone needs clear goals and support to get back on track." : "You have no improvement plans."} />

      <PipFormModal key={`f${form.n}`} open={form.open} pip={form.pip} onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={(uuid) => { setForm((f) => ({ ...f, open: false })); list.refresh(); setView(uuid); }} />
      <PipModal uuid={view} onClose={() => setView(null)} onChanged={list.refresh}
        onEdit={(p) => { setView(null); setForm((f) => ({ open: true, pip: p, n: f.n + 1 })); }} />
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><PipPage /></Suspense>;
}
