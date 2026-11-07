"use client";

/*
 * Export history: every file made from reports, by download, schedule, data export, the
 * assistant or an MCP client. Your own by default; HR can switch to everyone's.
 */
import { useEffect, useState } from "react";
import { Download, History, Lock, ShieldCheck } from "lucide-react";
import { Badge, Button, DataTable, FilterBar, Toggle, useToast, type Column, type FilterValues } from "@/components/ui-kit";
import { downloadWithAuth } from "@/components/people/types";
import { api } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/datetime";
import { CHANNEL_LABELS, errMsg, type ExportRow, type Paged, type ReportsMeta } from "./types";

export function ExportsTab({ meta }: { meta: ReportsMeta }) {
  const toast = useToast();
  const [data, setData] = useState<Paged<ExportRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [everyone, setEveryone] = useState(false);
  const [filters, setFilters] = useState<FilterValues>({});
  const [busy, setBusy] = useState<string | null>(null);
  const channel = filters.channel?.[0] ?? "";

  useEffect(() => {
    let live = true;
    setLoading(true);
    const q = new URLSearchParams({ page: String(page), size: String(size) });
    if (everyone) q.set("everyone", "true");
    if (channel) q.set("channel", channel);
    api.get<Paged<ExportRow>>(`/reports/exports?${q}`)
      .then((r) => { if (live) setData(r); })
      .catch((e) => { if (live) { toast.error(errMsg(e)); setData({ items: [], total: 0, page: 1, size }); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [page, size, everyone, channel, toast]);

  async function download(x: ExportRow) {
    setBusy(x.uuid);
    try { await downloadWithAuth(`/reports/exports/${x.uuid}/download`, x.file_name); }
    catch (e) { toast.error(errMsg(e)); }
    finally { setBusy(null); }
  }

  const columns: Column<ExportRow>[] = [
    {
      key: "when", header: "When",
      cell: (x) => <span className="whitespace-nowrap text-muted" title={formatDateTime(x.created_at)}>{formatRelative(x.created_at)}</span>,
    },
    {
      key: "what", header: "What",
      cell: (x) => (
        <div className="min-w-0 max-w-[340px]">
          <p className="truncate text-ink">{x.what}</p>
          <p className="truncate text-[12.5px] text-faint">{x.file_name}</p>
        </div>
      ),
    },
    { key: "channel", header: "How", hideBelow: "md", cell: (x) => <span className="text-muted">{CHANNEL_LABELS[x.channel] ?? x.channel}</span> },
    { key: "format", header: "File", hideBelow: "md", cell: (x) => <span className="text-muted">{meta.formats.find((f) => f.value === x.format)?.label ?? x.format.toUpperCase()}</span> },
    { key: "rows", header: "Rows", align: "right", hideBelow: "sm", cell: (x) => <span className="tabular text-muted">{x.rows.toLocaleString("en-IN")}</span> },
    ...(everyone ? [{ key: "by", header: "By", hideBelow: "lg" as const, cell: (x: ExportRow) => <span className="text-muted">{x.actor_name ?? "—"}</span> }] : []),
    {
      key: "flags", header: "", hideBelow: "lg",
      cell: (x) => (
        <span className="flex flex-wrap gap-1.5">
          {x.protected && <Badge tone="good"><ShieldCheck size={12} strokeWidth={1.4} />Protected</Badge>}
          {x.sensitive && <Badge tone="warn"><Lock size={11} strokeWidth={1.4} />Private details</Badge>}
        </span>
      ),
    },
    {
      key: "dl", header: "", align: "right",
      cell: (x) => x.available
        ? <Button size="sm" variant="ghost" icon={Download} loading={busy === x.uuid} onClick={() => download(x)}>Download again</Button>
        : <span className="text-[12.5px] text-faint">Expired</span>,
    },
  ];

  return (
    <div>
      <FilterBar values={filters} onChange={(f) => { setFilters(f); setPage(1); }}
        filters={[{ key: "channel", label: "How", options: Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label })) }]}
        actions={meta.can_see_all_exports && (
          <Toggle checked={everyone} onChange={(v) => { setEveryone(v); setPage(1); }} label="Everyone's exports" />
        )} />
      <DataTable rows={data?.items ?? []} rowKey={(x) => x.uuid} columns={columns} loading={loading}
        pagination={data ? { page, size, total: data.total, onPageChange: setPage, onSizeChange: (n) => { setSize(n); setPage(1); } } : undefined}
        emptyIcon={History} emptyTitle="No exports yet" emptyHint="Files you download or get by email are listed here." />
    </div>
  );
}
