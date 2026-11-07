"use client";

/*
 * Report viewer: runs a saved or standard report with run-time choices (period, a quick
 * extra filter, sorting, paging) and shows it as a table or chart. Export, schedule,
 * share, copy, edit and delete live in the header.
 */
import { useEffect, useState } from "react";
import { BarChart3, CalendarClock, Copy, Download, Filter as FilterIcon, Lock, Pencil, Share2, Table2, Trash2, X } from "lucide-react";
import { Button, Field, Menu, Modal, Skeleton, Tabs, useConfirm, useToast, type MenuItem, type SortState } from "@/components/ui-kit";
import { EmptyState } from "@/components/shell/page";
import { api } from "@/lib/api";
import { ExportModal } from "./export-modal";
import { FilterRow, filterReady, newFilter } from "./filter-editor";
import { ParamInput, ResultChart, ResultNotes, ResultTable, TotalsLine, formatCell } from "./result-view";
import { ScheduleModal } from "./schedule-modal";
import { ShareModal } from "./share-modal";
import { errMsg, isRelative, relativeLabel, type ExportResponse, type Filter, type Report, type ReportDetail, type ReportResult, type ReportsMeta } from "./types";

export function ReportViewer({ uuid, version = 0, meta, onClose, onChanged, onEdit, onCopied, onDeleted }: {
  uuid: string | null; /** Bump to reload after the report was edited. */ version?: number; meta: ReportsMeta; onClose: () => void; onChanged: () => void;
  onEdit: (uuid: string) => void; onCopied: (uuid: string) => void; onDeleted: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [runParams, setRunParams] = useState<Record<string, unknown> | null>(null);
  const [draft, setDraft] = useState<Filter | null>(null);
  const [applied, setApplied] = useState<Filter | null>(null);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(50);
  const [sort, setSort] = useState<SortState>(null);
  const [view, setView] = useState<"table" | "chart">("table");
  const [modal, setModal] = useState<null | "export" | "schedule" | "share">(null);
  const [copying, setCopying] = useState(false);

  // reset on open
  useEffect(() => {
    setDetail(null); setResult(null); setError(null); setParams({}); setRunParams(null); setDraft(null); setApplied(null);
    setPage(1); setSort(null); setModal(null);
    if (!uuid) return;
    api.get<ReportDetail>(`/reports/${uuid}`).then((d) => {
      setDetail(d);
      setView(d.chart ? "chart" : "table");
    }).catch((e) => setError(errMsg(e)));
  }, [uuid, version]);

  useEffect(() => {
    if (!uuid) return;
    let live = true;
    setLoading(true);
    const body: Record<string, unknown> = { page, size };
    if (applied) body.filters = [applied];
    if (runParams) body.params = runParams;
    if (sort) body.sort = [{ field: sort.key, dir: sort.dir }];
    api.post<ReportResult>(`/reports/${uuid}/run`, body).then((r) => {
      if (!live) return;
      setResult(r);
      setError(null);
      if (!runParams) setParams(r.params ?? {});
      if (!r.grouped) setView("table");
    }).catch((e) => { if (live) setError(errMsg(e)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [uuid, version, page, size, applied, runParams, sort]);

  const fields = detail?.source_def.fields ?? [];
  const sourceParams = detail?.source_def.params ?? [];

  function setParam(k: string, v: unknown) {
    const next = { ...params, [k]: v };
    setParams(next);
    setRunParams(next);
    setPage(1);
  }

  async function copy() {
    if (!detail) return;
    setCopying(true);
    try {
      const r = await api.post<Report>(`/reports/${detail.uuid}/clone`, {});
      toast.success("Copy made. You can change it now.");
      onChanged();
      onCopied(r.uuid);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setCopying(false);
    }
  }

  async function remove() {
    if (!detail) return;
    const ok = await confirm({
      title: `Delete “${detail.name}”?`, message: detail.schedules ? "Its email schedules stop as well." : "People it was shared with lose access too.",
      confirmLabel: "Delete", tone: "danger",
      onConfirm: async () => {
        try { await api.delete(`/reports/${detail.uuid}`); } catch (e) { toast.error(errMsg(e)); throw e; }
      },
    });
    if (ok) { toast.success("Report deleted"); onDeleted(); }
  }

  const exportRun = (format: string, protect: boolean) => {
    const body: Record<string, unknown> = { format, protect };
    if (applied) body.filters = [applied];
    if (runParams) body.params = runParams;
    if (sort) body.sort = [{ field: sort.key, dir: sort.dir }];
    return api.post<ExportResponse>(`/reports/${uuid}/export`, body);
  };

  const more: MenuItem[] = [];
  if (meta.can_build) more.push({ label: "Make a copy", icon: Copy, onSelect: copy, disabled: copying });
  if (detail?.can_edit) more.push({ label: "Edit", icon: Pencil, onSelect: () => onEdit(detail.uuid) }, "separator", { label: "Delete", icon: Trash2, danger: true, onSelect: remove });

  const appliedField = applied ? fields.find((f) => f.key === applied.field) : undefined;
  const appliedText = applied && appliedField ? describeFilter(applied, appliedField, meta) : "";

  return (
    <>
      <Modal open={!!uuid} onClose={onClose} size="full" flush
        title={detail ? (
          <span className="flex items-center gap-2">
            <span className="truncate">{detail.name}</span>
            {detail.sensitive && <Lock size={14} strokeWidth={1.4} className="shrink-0 text-faint" aria-label="Has private details" />}
          </span>
        ) : "Report"}
        description={detail ? [result?.scope_label, detail.source_label, result ? `${result.row_count.toLocaleString("en-IN")} ${result.row_count === 1 ? "row" : "rows"}` : null].filter(Boolean).join(" · ") : " "}
        headerActions={detail && (
          <div className="mr-1 hidden items-center gap-1.5 sm:flex">
            <Button size="sm" icon={Download} onClick={() => setModal("export")}>Export</Button>
            {meta.can_share && <Button size="sm" variant="ghost" icon={CalendarClock} onClick={() => setModal("schedule")}>Schedule</Button>}
            {detail.can_share && <Button size="sm" variant="ghost" icon={Share2} onClick={() => setModal("share")}>Share</Button>}
            {detail.can_edit && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEdit(detail.uuid)}>Edit</Button>}
            {more.length > 0 && <Menu items={more} />}
          </div>
        )}>
        {!detail && !error && <ViewerSkeleton />}
        {error && !result && <EmptyState icon={FilterIcon} title="This report couldn't run" hint={error} />}
        {detail && (
          <div className="flex min-h-full flex-col">
            {/* mobile actions */}
            <div className="flex flex-wrap gap-2 border-b border-line px-6 py-3 sm:hidden">
              <Button size="sm" icon={Download} onClick={() => setModal("export")}>Export</Button>
              {meta.can_share && <Button size="sm" variant="ghost" icon={CalendarClock} onClick={() => setModal("schedule")}>Schedule</Button>}
              {detail.can_share && <Button size="sm" variant="ghost" icon={Share2} onClick={() => setModal("share")}>Share</Button>}
              {more.length > 0 && <Menu items={more} />}
            </div>
            <div className="flex flex-wrap items-end gap-3 border-b border-line bg-canvas/40 px-6 py-4">
              {sourceParams.map((p) => (
                <Field key={p.key} label={p.label} className="w-full sm:w-48">
                  <ParamInput param={p} value={params[p.key]} onChange={(v) => setParam(p.key, v)} />
                </Field>
              ))}
              {!draft && !applied && fields.length > 0 && (
                <Button size="sm" variant="secondary" icon={FilterIcon} onClick={() => setDraft(newFilter(fields[0], meta))} className="mb-1">Add a filter</Button>
              )}
              {applied && (
                <span className="mb-1 inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/30 bg-primary-soft/50 pl-3 pr-1 text-[13px] text-ink">
                  <FilterIcon size={13} strokeWidth={1.4} className="text-primary" />
                  <button type="button" className="max-w-[320px] truncate" onClick={() => setDraft(applied)}>{appliedText}</button>
                  <button type="button" aria-label="Remove filter" onClick={() => { setApplied(null); setDraft(null); setPage(1); }}
                    className="rounded p-1 text-faint hover:text-ink"><X size={13} strokeWidth={1.4} /></button>
                </span>
              )}
              {result?.grouped && (
                <Tabs variant="pill" className="mb-0.5 ml-auto" value={view} onChange={setView}
                  items={[{ value: "table", label: "Table", icon: Table2 }, { value: "chart", label: "Chart", icon: BarChart3 }]} />
              )}
            </div>
            {draft && (
              <div className="flex flex-wrap items-start gap-3 border-b border-line px-6 py-3">
                <div className="min-w-0 flex-1"><FilterRow filter={draft} fields={fields} meta={meta} onChange={setDraft} /></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" disabled={!filterReady(draft)} onClick={() => { setApplied(draft); setDraft(null); setPage(1); }}>Apply</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
                </div>
              </div>
            )}
            <div className="flex-1 space-y-3 px-6 py-5">
              {error && result && <p className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-[13px] text-rose-700">{error}</p>}
              {!result && !error && <Skeleton className="h-64 w-full rounded-2xl" />}
              {result && (view === "chart" && result.grouped ? (
                <ResultChart result={result} type={detail.chart?.type} />
              ) : (
                <ResultTable result={result} loading={loading}
                  sort={sort} onSortChange={(s) => { setSort(s); setPage(1); }}
                  pagination={{ page, size, total: result.row_count, onPageChange: setPage, onSizeChange: (n) => { setSize(n); setPage(1); }, sizeOptions: [25, 50, 100, 250] }} />
              ))}
              {result && <TotalsLine result={result} />}
              {result && <ResultNotes result={result} />}
              {detail.description && <p className="pt-1 text-[12.5px] text-faint">{detail.description}</p>}
            </div>
          </div>
        )}
      </Modal>
      {detail && (
        <>
          <ExportModal open={modal === "export"} onClose={() => setModal(null)} title={detail.name} sensitive={detail.sensitive}
            formats={meta.formats} run={exportRun} />
          <ScheduleModal open={modal === "schedule"} onClose={() => setModal(null)} meta={meta} report={detail}
            onSaved={() => { setDetail({ ...detail, schedules: detail.schedules + 1 }); onChanged(); }} />
          <ShareModal open={modal === "share"} onClose={() => setModal(null)} report={detail}
            onSaved={(r) => { setDetail({ ...detail, shared_roles: r.shared_roles, shared_employee_ids: r.shared_employee_ids }); onChanged(); }} />
        </>
      )}
    </>
  );
}

function describeFilter(f: Filter, field: { label: string; type: string; options: { value: unknown; label: string }[] | null }, meta: ReportsMeta): string {
  const op = meta.ops.find((o) => o.value === f.op)?.label ?? f.op;
  const col = { key: "", label: field.label, type: field.type, options: field.options };
  const val = (v: unknown): string => {
    if (isRelative(v)) return relativeLabel(v);
    const node = formatCell(col, v, false);
    return typeof node === "string" ? node : String(v ?? "");
  };
  let value = "";
  if (Array.isArray(f.value)) value = f.value.map(val).filter(Boolean).join(f.op === "between" ? " and " : ", ");
  else if (f.op === "last_n_days" || f.op === "next_n_days") value = "";
  else if (f.value !== null && f.value !== undefined && f.value !== "") value = val(f.value);
  const opText = f.op === "last_n_days" ? `in the last ${f.value} days` : f.op === "next_n_days" ? `in the next ${f.value} days` : op;
  return `${field.label} ${opText}${value ? ` ${value}` : ""}`;
}

function ViewerSkeleton() {
  return (
    <div className="space-y-4 px-6 py-5">
      <div className="flex gap-3"><Skeleton className="h-10 w-48" /><Skeleton className="h-10 w-48" /></div>
      <Skeleton className="h-72 w-full rounded-2xl" />
    </div>
  );
}
