"use client";

/*
 * Reports tab: search, category and "Standard / Mine / Shared with me" chips, then the
 * reports grouped by category as cards. Clicking a card opens the viewer.
 */
import { BarChart3, CalendarClock, FileBarChart2, Lock, Plus, Table2 } from "lucide-react";
import { Badge, Button, FilterBar, Skeleton, type FilterValues } from "@/components/ui-kit";
import { EmptyState } from "@/components/shell/page";
import type { Report, ReportsMeta } from "./types";

export const WHICH_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "mine", label: "Mine" },
  { value: "shared", label: "Shared with me" },
];

export function ReportList({ reports, meta, filters, onFiltersChange, onSearch, search, onOpen, onNew }: {
  reports: Report[] | null; meta: ReportsMeta | null; filters: FilterValues; onFiltersChange: (f: FilterValues) => void;
  search: string; onSearch: (q: string) => void; onOpen: (r: Report) => void; onNew?: () => void;
}) {
  const categories = meta?.categories ?? [];
  const groups = categories
    .map((c) => ({ ...c, items: (reports ?? []).filter((r) => r.category === c.value) }))
    .concat([{ value: "_other", label: "Other", items: (reports ?? []).filter((r) => !categories.some((c) => c.value === r.category)) }])
    .filter((g) => g.items.length);
  const anyFilter = !!search || Object.values(filters).some((v) => v.length);

  return (
    <div>
      <FilterBar search={search} onSearchChange={onSearch} searchPlaceholder="Search reports" values={filters} onChange={onFiltersChange}
        filters={[
          { key: "category", label: "Category", options: categories },
          { key: "which", label: "Show", options: WHICH_OPTIONS },
        ]} />
      {!reports ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="space-y-2.5 rounded-2xl border border-line bg-surface p-4">
              <Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState icon={FileBarChart2}
            title={anyFilter ? "No reports match" : "No reports yet"}
            hint={anyFilter ? "Try another word or clear the filters." : onNew ? "Build your own report from any of your data." : "When HR shares a report with you, it shows up here."}
            action={!anyFilter && onNew ? <Button variant="primary" icon={Plus} onClick={onNew}>New report</Button> : undefined} />
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.value}>
              <h2 className="mb-3 flex items-baseline gap-2 text-[12px] uppercase tracking-[0.06em] text-faint">
                {g.label}<span className="tabular normal-case tracking-normal">{g.items.length}</span>
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map((r) => <ReportCard key={r.uuid} report={r} onOpen={() => onOpen(r)} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ report: r, onOpen }: { report: Report; onOpen: () => void }) {
  const Icon = r.chart ? BarChart3 : Table2;
  return (
    <button type="button" onClick={onOpen}
      className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-primary/35 focus-visible:border-primary/60 focus-visible:outline-none">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted transition-colors group-hover:text-primary">
          <Icon size={15} strokeWidth={1.4} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[14.5px] text-ink">
            <span className="truncate">{r.name}</span>
            {r.sensitive && <Lock size={12} strokeWidth={1.4} className="shrink-0 text-faint" aria-label="Has private details" />}
          </p>
          {r.description && <p className="mt-0.5 line-clamp-2 text-[13px] leading-[19px] text-muted">{r.description}</p>}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3.5 text-[12px] text-faint">
        <span className="truncate">{r.source_label}</span>
        {r.is_standard ? <Badge>Standard</Badge> : !r.mine ? <Badge tone="accent">Shared</Badge> : null}
        {!r.is_standard && !r.mine && r.owner_name && <span className="truncate">by {r.owner_name}</span>}
        {r.schedules > 0 && (
          <span className="ml-auto inline-flex items-center gap-1" title={`${r.schedules} email ${r.schedules === 1 ? "schedule" : "schedules"}`}>
            <CalendarClock size={12} strokeWidth={1.4} />{r.schedules}
          </span>
        )}
      </div>
    </button>
  );
}
