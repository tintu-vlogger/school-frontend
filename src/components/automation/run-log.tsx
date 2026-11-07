"use client";

/*
 * Run log: every time a rule's trigger fired, whether its condition held and what each
 * action did. Row click opens the details.  <RunLog rules={rules} />
 */
import { useEffect, useState } from "react";
import { CheckCircle2, History, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/datetime";
import { Badge, DataTable, FilterBar, KeyValue, Modal, type Column, type FilterValues } from "@/components/ui-kit";
import { RUN_LABEL, RUN_TONE, type Page, type Rule, type Run } from "./types";

const SIZE = 25;

export function RunLog({ rules, nonce }: { rules: Rule[]; nonce: number }) {
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Run> | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Run | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), size: String(SIZE) });
    if (filters.rule?.[0]) p.set("rule", filters.rule[0]);
    if (filters.status?.length) p.set("status", filters.status.join(","));
    api.get<Page<Run>>(`/automation/runs?${p}`).then((r) => { if (live) setData(r); }).catch(() => { if (live) setData({ items: [], total: 0, page: 1, size: SIZE }); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [filters, page, nonce]);

  const columns: Column<Run>[] = [
    { key: "when", header: "When", width: "170px", cell: (r) => <span className="text-muted" title={formatDateTime(r.created_at)}>{formatRelative(r.created_at)}</span> },
    { key: "rule", header: "Rule", cell: (r) => <span className="text-ink">{r.rule_name ?? "—"}</span> },
    { key: "record", header: "Record", hideBelow: "md", cell: (r) => <span className="text-ink/80">{r.record_label || "—"}</span> },
    { key: "trigger", header: "Because", hideBelow: "lg", cell: (r) => <span className="text-muted">{r.trigger_label}</span> },
    { key: "status", header: "Result", cell: (r) => <Badge tone={RUN_TONE[r.status]} dot>{RUN_LABEL[r.status]}</Badge> },
  ];

  return (
    <>
      <FilterBar values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[
          { key: "rule", label: "Rule", options: rules.map((r) => ({ value: r.uuid, label: r.name })) },
          { key: "status", label: "Result", multiple: true, options: Object.entries(RUN_LABEL).map(([value, label]) => ({ value, label })) },
        ]} />
      <DataTable rows={data?.items ?? []} rowKey={(r) => r.uuid} columns={columns} loading={loading} onRowClick={setOpen}
        pagination={{ page, size: SIZE, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={History} emptyTitle="No runs yet" emptyHint="Each time a rule runs, it is listed here with what it did." />
      <Modal open={!!open} onClose={() => setOpen(null)} size="md" title={open?.rule_name ?? "Run"}
        description={open ? formatDateTime(open.created_at) : undefined}>
        {open && (
          <div className="space-y-5">
            <KeyValue items={[
              { label: "Record", value: open.record_label || "—" },
              { label: "Because", value: open.trigger_label },
              { label: "Result", value: <Badge tone={RUN_TONE[open.status]} dot>{RUN_LABEL[open.status]}</Badge> },
              ...(open.error ? [{ label: "Problem", value: <span className="text-rose-600">{open.error}</span> }] : []),
            ]} />
            {open.results.length > 0 && (
              <div>
                <p className="mb-2 text-[13px] text-muted">Actions</p>
                <ul className="space-y-2">
                  {open.results.map((r, i) => (
                    <li key={i} className="flex gap-2 rounded-lg border border-line px-3 py-2 text-[13.5px]">
                      {r.ok ? <CheckCircle2 size={16} strokeWidth={1.4} className="mt-0.5 shrink-0 text-emerald-600" /> : <XCircle size={16} strokeWidth={1.4} className="mt-0.5 shrink-0 text-rose-600" />}
                      <span className="text-ink/85">{r.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
