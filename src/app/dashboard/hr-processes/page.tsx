"use client";

/*
 * HR processes: raise transfers, promotions, confirmations and the company's own change
 * processes for one or many people, follow them through approval, and revoke with one
 * click. The Processes tab sets up what each process changes and the letters it issues.
 */
import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, Eye, Pencil, Plus, RotateCcw, Settings2, Workflow } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAllowed } from "@/components/workflow/use-allowed";
import { formatDate } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, FilterBar, Tabs, useConfirm, type FilterValues,
} from "@/components/ui-kit";
import {
  ChangeDetailModal, ProcessTypeModal, StartChangeModal, STATUS_TONE, useProcessMeta, type ChangeRow, type ProcessType,
} from "@/components/hr-processes/hr-processes";

type Page<T> = { items: T[]; total: number; page: number; size: number };

export default function HrProcessesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const access = useAllowed("/hr-processes/meta");
  const canManage = access.allowed;
  const meta = useProcessMeta();
  const [tab, setTab] = useState<"changes" | "processes">("changes");
  const [types, setTypes] = useState<ProcessType[]>([]);
  const [rows, setRows] = useState<Page<ChangeRow> | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [start, setStart] = useState<{ open: boolean; type?: string | null; key: number }>({ open: false, key: 0 });
  const [editor, setEditor] = useState<{ target: ProcessType | "new" | null; key: number }>({ target: null, key: 0 });
  const [view, setView] = useState<string | null>(null);

  const loadTypes = useCallback(() => { api.get<ProcessType[]>("/hr-processes/types").then(setTypes).catch(() => setTypes([])); }, []);
  const loadRows = useCallback(() => {
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), size: String(size) });
    if (q) sp.set("q", q);
    if (filters.status?.[0]) sp.set("status", filters.status[0]);
    if (filters.process?.[0]) sp.set("process", filters.process[0]);
    api.get<Page<ChangeRow>>(`/hr-processes/requests?${sp}`).then(setRows).catch(() => setRows({ items: [], total: 0, page: 1, size }))
      .finally(() => setLoading(false));
  }, [page, size, q, filters]);
  useEffect(() => { if (canManage) loadTypes(); }, [canManage, loadTypes]);
  useEffect(() => { if (canManage) loadRows(); }, [canManage, loadRows]);

  const closeView = useCallback(() => setView(null), []);

  async function revoke(r: ChangeRow) {
    if (!(await confirm({ title: `Revoke this ${r.process.name.toLowerCase()}?`, message: "The previous values are put back and recorded in the job history.", confirmLabel: "Revoke", tone: "danger" }))) return;
    try { await api.post(`/hr-processes/requests/${r.uuid}/revoke`, { reason: null }); toast.success("Change revoked"); loadRows(); }
    catch (e) { toast.error("Couldn't revoke", { description: e instanceof Error ? e.message : undefined }); }
  }

  if (access.ready && !canManage) {
    return <div><PageHeader eyebrow="People" title="HR processes" description="You don't have access to HR processes." /></div>;
  }

  const filtered = !!q || Object.values(filters).some((v) => v.length);
  return (
    <div>
      <PageHeader eyebrow="People" title="HR processes" description="Transfers, promotions, confirmations and your own change processes, with approval, effective dates and one-click revoke."
        actions={<>
          <Link href="/dashboard/workflows"><Button icon={Workflow}>Approval flows</Button></Link>
          {tab === "processes"
            ? <Button variant="primary" icon={Plus} onClick={() => setEditor((e) => ({ target: "new", key: e.key + 1 }))}>New process</Button>
            : <Button variant="primary" icon={ArrowRightLeft} onClick={() => setStart((s) => ({ open: true, type: null, key: s.key + 1 }))} disabled={!types.length}>Start a change</Button>}
        </>} />
      <Tabs value={tab} onChange={setTab} className="mb-5" items={[
        { value: "changes", label: "Changes", count: rows?.total },
        { value: "processes", label: "Processes", count: types.length },
      ]} />

      {tab === "changes" ? (
        <>
          <FilterBar searchPlaceholder="Search by name, ID or reason" onSearchChange={(x) => { setQ(x); setPage(1); }}
            filters={[
              { key: "status", label: "Status", options: (meta?.statuses ?? []).map((s) => ({ value: String(s.value), label: s.label })) },
              { key: "process", label: "Process", options: types.map((t) => ({ value: t.uuid, label: t.name })) },
            ]}
            values={filters} onChange={(f) => { setFilters(f); setPage(1); }} />
          <DataTable
            rows={rows?.items ?? []} rowKey={(r) => r.uuid} loading={loading}
            columns={[
              { key: "employee", header: "Employee", cell: (r) => (
                <span className="flex items-center gap-2.5"><Avatar name={r.employee.name} src={r.employee.photo} size={30} />
                  <span className="min-w-0"><span className="block truncate text-ink">{r.employee.name}</span><span className="block text-[12px] text-faint">{r.employee.code ?? ""}</span></span></span>) },
              { key: "process", header: "Process", cell: (r) => <span><span className="text-ink/90">{r.process.name}</span><span className="block text-[12px] text-faint">{r.fields.join(", ")}</span></span> },
              { key: "date", header: "Takes effect", cell: (r) => formatDate(r.effective_date), hideBelow: "sm" },
              { key: "reason", header: "Reason", cell: (r) => <span className="line-clamp-1 text-muted">{r.reason ?? "—"}</span>, hideBelow: "lg" },
              { key: "status", header: "Status", cell: (r) => <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status_label}</Badge> },
            ]}
            onRowClick={(r) => setView(r.uuid)}
            rowActions={(r) => [
              { label: "View details", icon: Eye, onSelect: () => setView(r.uuid) },
              ...(r.can_revoke ? ["separator" as const, { label: "Revoke", icon: RotateCcw, danger: true, onSelect: () => revoke(r) }] : []),
            ]}
            pagination={{ page, size, total: rows?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
            emptyIcon={ArrowRightLeft}
            emptyTitle={filtered ? "No changes match" : "No changes yet"}
            emptyHint={filtered ? "Try another search or clear the filters." : "Start a transfer, promotion or confirmation for one or many people."}
            emptyAction={!filtered && types.length > 0 && <Button variant="primary" icon={ArrowRightLeft} onClick={() => setStart((s) => ({ open: true, type: null, key: s.key + 1 }))}>Start a change</Button>}
          />
        </>
      ) : (
        <DataTable
          rows={types} rowKey={(t) => t.uuid} loading={!types.length && loading}
          columns={[
            { key: "name", header: "Process", cell: (t) => <span><span className="text-ink">{t.name}</span> <span className="ml-1 text-[12px] text-faint">{t.code}</span>
              {t.description && <span className="block line-clamp-1 text-[12.5px] text-muted">{t.description}</span>}</span> },
            { key: "fields", header: "Changes", cell: (t) => <span className="text-muted">{[...t.field_labels, ...(t.target_status ? ["Stage"] : [])].join(", ") || "—"}</span>, hideBelow: "md" },
            { key: "letters", header: "Letters", cell: (t) => t.letter_template_uuids.length || "—", hideBelow: "lg", align: "center" },
            { key: "used", header: "Used", cell: (t) => t.requests, hideBelow: "sm", align: "right" },
            { key: "status", header: "", cell: (t) => <span className="flex justify-end gap-1.5">{!t.needs_approval && <Badge tone="neutral">No approval</Badge>}<Badge tone={t.active ? "good" : "neutral"}>{t.active ? "In use" : "Off"}</Badge></span>, align: "right" },
          ]}
          onRowClick={(t) => setEditor((e) => ({ target: t, key: e.key + 1 }))}
          rowActions={(t) => [
            { label: "Edit", icon: Pencil, onSelect: () => setEditor((e) => ({ target: t, key: e.key + 1 })) },
            ...(t.active ? [{ label: "Start a change", icon: ArrowRightLeft, onSelect: () => { setTab("changes"); setStart((s) => ({ open: true, type: t.uuid, key: s.key + 1 })); } }] : []),
          ]}
          emptyIcon={Settings2} emptyTitle="No processes yet" emptyHint="Add a process such as Transfer or Promotion."
        />
      )}

      <StartChangeModal key={`s${start.key}`} open={start.open} types={types} meta={meta} initialType={start.type}
        onClose={() => setStart((s) => ({ ...s, open: false }))} onSaved={() => { setStart((s) => ({ ...s, open: false })); loadRows(); loadTypes(); }} />
      <ProcessTypeModal key={`e${editor.key}`} open={!!editor.target} target={editor.target} meta={meta}
        onClose={() => setEditor((e) => ({ ...e, target: null }))} onSaved={() => { setEditor((e) => ({ ...e, target: null })); loadTypes(); }} />
      <ChangeDetailModal uuid={view} canRevoke={canManage} onClose={closeView} onChanged={loadRows} />
    </div>
  );
}
