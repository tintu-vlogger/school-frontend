"use client";

/* History of imports and exports, with a detail modal per job. Refreshes while jobs run. */
import { useEffect, useState } from "react";
import { Download, History as HistoryIcon } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/datetime";
import { downloadWithAuth } from "@/components/people/types";
import {
  Badge, Button, DataTable, KeyValue, Modal, Skeleton, Tabs, useToast, type Column,
} from "@/components/ui-kit";
import { ProgressBar } from "./import-wizard";
import { JOB_STATUS, type DataJob, type FullJob, type Page } from "./types";

type Kind = "import" | "export";

export function JobHistory({ refresh }: { refresh: number }) {
  const [kind, setKind] = useState<Kind>("import");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; page: Page<DataJob> } | null>(null);
  const [selected, setSelected] = useState<DataJob | null>(null);
  const key = `${kind}:${page}:${size}:${refresh}:${nonce}`;

  useEffect(() => {
    let live = true;
    api.get<Page<DataJob>>(`/data/jobs?kind=${kind}&page=${page}&size=${size}`)
      .then((r) => { if (live) setData({ key, page: r }); })
      .catch(() => { if (live) setData({ key, page: { items: [], total: 0, page: 1, size } }); });
    return () => { live = false; };
  }, [kind, page, size, key]);

  const rows = data?.page.items ?? [];
  const active = rows.some((r) => r.status === "queued" || r.status === "running");
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setNonce((n) => n + 1), 2000);
    return () => clearTimeout(t);
  }, [active, data]);

  const columns: Column<DataJob>[] = [
    {
      key: "when", header: "When", sortable: true, sortValue: (r) => r.created_at,
      cell: (r) => <span className="text-[13.5px] text-ink" title={formatDateTime(r.created_at)}>{formatRelative(r.created_at)}</span>,
    },
    {
      key: "what", header: "What",
      cell: (r) => (
        <div className="min-w-0">
          <p className="text-[14px] text-ink">{r.entity_label}</p>
          {kind === "import" && <p className="text-[12.5px] text-faint">{r.mode_label}</p>}
        </div>
      ),
    },
    { key: "file", header: "File", hideBelow: "md", cell: (r) => <span className="block max-w-[220px] truncate text-[13px] text-muted">{r.file_name || "—"}</span> },
    { key: "by", header: "By", hideBelow: "lg", cell: (r) => <span className="text-[13px] text-muted">{r.created_by_name || "—"}</span> },
    {
      key: "status", header: "Status",
      cell: (r) => (r.status === "running" || r.status === "queued") ? (
        <div className="w-32">
          <ProgressBar value={r.progress} />
          <p className="tabular mt-1 text-[12px] text-faint">{r.processed} of {r.total}</p>
        </div>
      ) : <Badge tone={JOB_STATUS[r.status].tone} dot>{JOB_STATUS[r.status].label}</Badge>,
    },
    {
      key: "counts", header: kind === "import" ? "Added · updated · failed" : "Rows", hideBelow: "md",
      cell: (r) => kind === "import" ? (
        <span className="tabular text-[13px] text-muted">
          {r.added} · {r.updated} · <span className={r.failed ? "text-rose-700" : undefined}>{r.failed}</span>
        </span>
      ) : <span className="tabular text-[13px] text-muted">{r.total.toLocaleString("en-IN")}</span>,
    },
  ];

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-light text-ink">History</h2>
          <p className="mt-0.5 text-[13px] text-muted">Every import and export, who ran it and how it went.</p>
        </div>
      </div>
      <Tabs<Kind> className="mb-4" value={kind} onChange={(k) => { setKind(k); setPage(1); }}
        items={[{ value: "import", label: "Imports" }, { value: "export", label: "Exports" }]} />
      <DataTable rows={rows} rowKey={(r) => r.uuid} columns={columns} loading={!data || data.key !== key && !active}
        onRowClick={setSelected} emptyIcon={HistoryIcon}
        emptyTitle={kind === "import" ? "No imports yet" : "No exports yet"}
        pagination={data && data.page.total > size ? { page, size, total: data.page.total, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } } : undefined} />
      <JobModal job={selected} onClose={() => setSelected(null)} />
    </section>
  );
}

function JobModal({ job, onClose }: { job: DataJob | null; onClose: () => void }) {
  return (
    <Modal open={!!job} onClose={onClose} size="lg"
      title={job ? `${job.kind === "import" ? "Import" : "Export"} of ${job.entity_label.toLowerCase()}` : undefined}
      description={job ? formatDateTime(job.created_at) : undefined}
      footer={<Button onClick={onClose}>Close</Button>}>
      {job && <JobBody key={job.uuid} job={job} />}
    </Modal>
  );
}

function JobBody({ job }: { job: DataJob }) {
  const toast = useToast();
  const [full, setFull] = useState<FullJob | null>(null);
  useEffect(() => {
    let live = true;
    api.get<FullJob>(`/data/imports/${job.uuid}`).then((j) => { if (live) setFull(j); }).catch(() => { /* summary is enough */ });
    return () => { live = false; };
  }, [job.uuid]);
  const j: DataJob = full ?? job;
  const errors = full?.errors ?? [];
  const isImport = j.kind === "import";
  const st = JOB_STATUS[j.status];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={st.tone} dot>{st.label}</Badge>
        {j.message && <span className="text-[13.5px] text-muted">{j.message}</span>}
      </div>
      {(j.status === "running" || j.status === "queued") && <ProgressBar value={j.progress} />}
      <KeyValue columns={3} items={[
        { label: "File", value: j.file_name, span: 2 },
        { label: "By", value: j.created_by_name },
        ...(isImport ? [
          { label: "How", value: j.mode_label },
          { label: "Rows in file", value: j.total.toLocaleString("en-IN") },
          { label: "Processed", value: j.processed.toLocaleString("en-IN") },
          { label: "Added", value: j.added.toLocaleString("en-IN") },
          { label: "Updated", value: j.updated.toLocaleString("en-IN") },
          { label: "Unchanged", value: j.skipped.toLocaleString("en-IN") },
          { label: "Failed", value: <span className={j.failed ? "text-rose-700" : undefined}>{j.failed.toLocaleString("en-IN")}</span> },
        ] : [{ label: "Rows", value: j.total.toLocaleString("en-IN") }]),
        { label: "Started", value: j.started_at ? formatDateTime(j.started_at) : null },
        { label: "Finished", value: j.finished_at ? formatDateTime(j.finished_at) : null },
      ]} />

      <div className="flex flex-wrap gap-2">
        {isImport && j.failed > 0 && (
          <Button icon={Download} onClick={() => downloadWithAuth(`/data/imports/${j.uuid}/errors`, `${j.entity}-rows-to-fix.xlsx`).catch((e: Error) => toast.error(e.message))}>
            Download rows to fix
          </Button>
        )}
        {!isImport && full?.export_uuid && (
          <Button icon={Download} onClick={() => downloadWithAuth(`/reports/exports/${full.export_uuid}/download`, j.file_name || "export").catch((e: Error) => toast.error("Couldn't download", { description: e.message }))}>
            Download again
          </Button>
        )}
      </div>

      {isImport && (
        <div>
          <p className="mb-2 text-[13px] text-muted">Problems{errors.length ? ` (${errors.length})` : ""}</p>
          {!full ? <Skeleton className="h-16 w-full" /> : errors.length ? (
            <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {errors.slice(0, 200).map((e, i) => (
                <li key={i} className="flex gap-4 px-4 py-2.5 text-[13px]">
                  <span className="tabular w-16 shrink-0 text-faint">Row {e.row}</span>
                  <span className="w-36 shrink-0 truncate text-muted">{e.column || "—"}</span>
                  <span className="min-w-0 text-rose-700">{e.message}</span>
                </li>
              ))}
              {errors.length > 200 && <li className="px-4 py-2.5 text-[12.5px] text-faint">Showing the first 200. Download the rows to fix to see all.</li>}
            </ul>
          ) : <p className="text-[13.5px] text-faint">No problems.</p>}
        </div>
      )}
    </div>
  );
}
