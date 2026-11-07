"use client";

/*
 * Clearances: the ones I own (IT, admin, finance, manager, assets), or every clearance
 * for HR, with a delayed filter. A row opens the clearance in a modal.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import { Badge, DataTable, FilterBar, Modal, Tabs, formatDisplayDate, type Column, type FilterValues } from "@/components/ui-kit";
import { ClearanceCard } from "@/components/exits/parts";
import { errMsg, type Clearance, type ExitMeta } from "@/components/exits/types";

function ClearancesInner() {
  const toast = useToast();
  const params = useSearchParams();
  const [meta, setMeta] = useState<ExitMeta | null>(null);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [filters, setFilters] = useState<FilterValues>({ status: ["pending"], ...(params.get("delayed") ? { delayed: ["1"] } : {}) });
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Clearance[]>([]);
  const [loadedKey, setLoadedKey] = useState("");
  const [open, setOpen] = useState<Clearance | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    api.get<ExitMeta>("/exits/meta").then((m) => { setMeta(m); if (m.can_manage) setScope("all"); }).catch(() => {});
  }, []);
  const key = JSON.stringify([scope, filters, nonce]);
  const loading = loadedKey !== key;
  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ scope, status: (filters.status ?? []).join(",") });
    if (filters.delayed?.length) p.set("delayed", "true");
    api.get<{ items: Clearance[] }>(`/exits/clearances?${p}`)
      .then((r) => { if (live) setRows(r.items); })
      .catch((e) => toast.error(errMsg(e)))
      .finally(() => { if (live) setLoadedKey(key); });
    return () => { live = false; };
  }, [scope, filters, nonce, toast, key]);

  const shown = rows.filter((r) => !q || `${r.employee_name} ${r.label}`.toLowerCase().includes(q.toLowerCase()));
  const columns: Column<Clearance>[] = [
    { key: "who", header: "Leaver", sortable: true, sortValue: (r) => r.employee_name ?? "", cell: (r) => (
      <div><p className="text-ink">{r.employee_name}</p><p className="text-[12px] text-muted">{r.exit_type_label} · last day {formatDisplayDate(r.last_working_day)}</p></div>
    ) },
    { key: "label", header: "Clearance", cell: (r) => r.label },
    { key: "owner", header: "Owner", hideBelow: "md", cell: (r) => r.owner_name ?? "HR" },
    { key: "due", header: "Due", sortable: true, sortValue: (r) => r.due_date, cell: (r) => (
      <span className={r.delayed ? "text-rose-600" : ""}>{formatDisplayDate(r.due_date)}{r.delayed ? ` · ${r.days_late} d late` : ""}</span>
    ) },
    { key: "items", header: "Items", hideBelow: "md", cell: (r) => r.items.length ? `${r.items.filter((i) => i.done).length}/${r.items.length}` : "—" },
    { key: "status", header: "Status", cell: (r) => (
      <Badge tone={r.status === "cleared" ? "good" : r.status === "not_applicable" ? "neutral" : r.delayed ? "bad" : "warn"} dot>
        {r.status === "cleared" ? "Cleared" : r.status === "not_applicable" ? "Not needed" : r.delayed ? "Delayed" : "Pending"}
      </Badge>
    ) },
  ];

  return (
    <div>
      <PageHeader title="Clearances" description="Sign off what a leaver returns or settles with your department." />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterBar searchPlaceholder="Search by person or clearance" onSearchChange={setQ}
          filters={[
            { key: "status", label: "Status", multiple: true, options: [{ value: "pending", label: "Pending" }, { value: "cleared", label: "Cleared" }, { value: "not_applicable", label: "Not needed" }] },
            { key: "delayed", label: "Delayed", options: [{ value: "1", label: "Only delayed" }] },
          ]}
          values={filters} onChange={setFilters} />
        {meta?.can_manage && (
          <Tabs variant="pill" value={scope} onChange={setScope} items={[{ value: "mine", label: "Mine" }, { value: "all", label: "Everyone's" }]} />
        )}
      </div>
      <DataTable rows={shown} rowKey={(r) => r.uuid} columns={columns} loading={loading} onRowClick={setOpen}
        rowClassName={(r) => (r.delayed ? "bg-rose-50/30" : undefined)} emptyIcon={ClipboardCheck}
        emptyTitle="No clearances" emptyHint={scope === "mine" ? "Clearances assigned to you show here." : "Nothing matches the filters."} />
      <Modal open={!!open} onClose={() => setOpen(null)} size="lg" title={open?.label}
        description={open ? `${open.employee_name} · last working day ${formatDisplayDate(open.last_working_day)}` : undefined}>
        {open && <ClearanceCard c={open} canEdit onSaved={(c) => { setOpen({ ...open, ...c }); refresh(); }} />}
      </Modal>
    </div>
  );
}

export default function ClearancesPage() {
  return <Suspense><ClearancesInner /></Suspense>;
}
