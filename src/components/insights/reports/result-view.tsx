"use client";

/*
 * Pieces that show a report result: the table (formatted by column type), the totals line,
 * notes about hidden or cut-off data, the chart, and the run-time inputs (dates, month, year).
 */
import type { ReactNode } from "react";
import { EyeOff, Info, X } from "lucide-react";
import { DataTable, DateInput, Select, type Column, type Pagination, type SortState } from "@/components/ui-kit";
import { WidgetChart, formatValue, labelFor, type ValueFormat, type WidgetColumn } from "@/components/insights/charts";
import { formatDate, formatDateTime, formatMonth } from "@/lib/datetime";
import { isNumeric, isRelative, relativeLabel, resultToWidget, type ReportResult, type ResultColumn, type SourceParam } from "./types";

const fmtOf = (t: string): ValueFormat => (t === "money" ? "money" : t === "percent" ? "percent" : t === "hours" ? "hours" : "number");

export function formatCell(col: ResultColumn, v: unknown, masked: boolean): ReactNode {
  if (masked && (v === null || v === undefined)) return <span className="text-faint">Hidden</span>;
  if (v === null || v === undefined || v === "") return <span className="text-faint">—</span>;
  if (isNumeric(col.type)) return formatValue(v, fmtOf(col.type));
  if (col.grain) return labelFor(col as WidgetColumn)(v);
  if (col.type === "datetime") return formatDateTime(String(v));
  if (col.type === "date") return formatDate(String(v));
  if (col.type === "bool") return v ? "Yes" : "No";
  if (col.options?.length) {
    const o = col.options.find((x) => String(x.value) === String(v));
    if (o) return o.label;
  }
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}

type Row = Record<string, unknown> & { __i: number };

export function ResultTable({ result, pagination, sort, onSortChange, loading, emptyTitle = "No rows match" }: {
  result: ReportResult; pagination?: Pagination; sort?: SortState; onSortChange?: (s: SortState) => void; loading?: boolean; emptyTitle?: string;
}) {
  const masked = new Set(result.masked);
  const cols = result.columns.filter((c) => !c.key.startsWith("_"));
  const columns: Column<Row>[] = cols.map((c) => ({
    key: c.key,
    header: (
      <span className="inline-flex items-center gap-1">
        {c.label}{masked.has(c.key) && <EyeOff size={12} strokeWidth={1.4} className="text-faint" />}
      </span>
    ),
    align: isNumeric(c.type) ? "right" : "left",
    sortable: !!onSortChange,
    className: isNumeric(c.type) ? "tabular whitespace-nowrap" : "whitespace-nowrap",
    cell: (r) => formatCell(c, r[c.key], masked.has(c.key)),
  }));
  const rows: Row[] = result.rows.map((r, i) => ({ ...r, __i: i }));
  return (
    <DataTable rows={rows} rowKey={(r) => `${result.page}-${r.__i}`} columns={columns} loading={loading}
      pagination={pagination} sort={sort} onSortChange={onSortChange} emptyTitle={emptyTitle}
      emptyHint="Try a different period or remove a filter." skeletonRows={5} />
  );
}

export function TotalsLine({ result }: { result: ReportResult }) {
  if (!result.totals) return null;
  const items = result.columns.filter((c) => result.totals && result.totals[c.key] !== undefined && result.totals[c.key] !== null);
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-line bg-sunken/50 px-4 py-2.5 text-[13px]">
      <span className="text-[11.5px] uppercase tracking-[0.06em] text-faint">Totals</span>
      {items.map((c) => (
        <span key={c.key} className="text-muted">{c.label} <span className="tabular text-ink">{formatValue(result.totals![c.key], fmtOf(c.type))}</span></span>
      ))}
    </div>
  );
}

export function ResultNotes({ result }: { result: ReportResult }) {
  const hidden = result.columns.filter((c) => result.masked.includes(c.key)).map((c) => c.label);
  if (!hidden.length && !result.truncated) return null;
  return (
    <div className="space-y-1.5">
      {hidden.length > 0 && (
        <p className="flex items-start gap-2 text-[12.5px] text-muted">
          <EyeOff size={14} strokeWidth={1.4} className="mt-0.5 shrink-0 text-faint" />
          Some details are hidden because you can&apos;t see them: {hidden.join(", ")}.
        </p>
      )}
      {result.truncated && (
        <p className="flex items-start gap-2 text-[12.5px] text-muted">
          <Info size={14} strokeWidth={1.4} className="mt-0.5 shrink-0 text-faint" />
          This report is very large, so only the first part is shown. Add a filter to narrow it down.
        </p>
      )}
    </div>
  );
}

export function ResultChart({ result, type, height = 320 }: { result: ReportResult; type?: string | null; height?: number }) {
  if (!result.grouped) return <p className="py-12 text-center text-[13px] text-faint">Group the rows to see a chart.</p>;
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <WidgetChart data={resultToWidget(result, type)} height={height} />
    </div>
  );
}

/* ── Run-time inputs ─────────────────────────────────────────────── */

/** A date that may hold a relative value such as "@today"; shown as a chip until changed. */
export function DateOrRelative({ value, onChange, placeholder }: { value: unknown; onChange: (v: string) => void; placeholder?: string }) {
  if (isRelative(value)) {
    return (
      <div className="flex h-10 items-center justify-between gap-2 rounded-lg border border-line bg-surface pl-3 pr-1.5 text-[14px]">
        <span className="truncate text-ink">{relativeLabel(value)}</span>
        <button type="button" aria-label="Pick a date instead" title="Pick a date instead" onClick={() => onChange("")}
          className="rounded p-1 text-faint transition-colors hover:bg-sunken hover:text-ink">
          <X size={14} strokeWidth={1.4} />
        </button>
      </div>
    );
  }
  return <DateInput value={typeof value === "string" ? value : ""} onChange={onChange} placeholder={placeholder} />;
}

function monthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const out = [{ value: "@month", label: "This month" }];
  for (let i = 0; i < 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ value: v, label: formatMonth(`${v}-01`) });
  }
  return out;
}

function yearOptions(): { value: string; label: string }[] {
  const y = new Date().getFullYear();
  return [{ value: "@year", label: "This year" }, ...Array.from({ length: 8 }, (_, i) => ({ value: String(y + 1 - i), label: String(y + 1 - i) }))];
}

export function ParamInput({ param, value, onChange }: { param: SourceParam; value: unknown; onChange: (v: unknown) => void }) {
  if (param.type === "date") return <DateOrRelative value={value} onChange={onChange} />;
  const opts = param.type === "month" ? monthOptions() : yearOptions();
  const v = value === null || value === undefined || value === "" ? null : String(value);
  return <Select value={v} onChange={(x) => onChange(x ?? "")} options={opts} clearable={!param.required} placeholder={param.type === "year" ? "Current" : "Pick a month"} />;
}
