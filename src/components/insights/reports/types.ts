/*
 * Shared types and helpers for the Reports area (list, viewer, builder, schedules, exports).
 */
import { api } from "@/lib/api";
import type { WidgetColumn, WidgetData } from "@/components/insights/charts";

export type Option<V = string> = { value: V; label: string };

export type ReportsMeta = {
  categories: Option[];
  ops: Option[];
  date_ops: string[];
  aggs: Option[];
  grains: string[];
  scopes: Option[];
  formats: Option[];
  frequencies: Option[];
  can_share: boolean;
  can_build: boolean;
  can_see_all_exports: boolean;
};

export type FieldType = "text" | "number" | "money" | "date" | "datetime" | "bool" | "enum" | "hours" | "percent";

export type SourceField = {
  key: string;
  label: string;
  type: FieldType;
  sensitive: boolean;
  options: Option<string | number>[] | null;
  default: boolean;
  agg: string | null;
  description?: string | null;
};

export type SourceParam = { key: string; label: string; type: "date" | "month" | "year"; default: string | number | null; required: boolean };

export type Source = {
  key: string;
  label: string;
  category: string;
  description: string;
  kind: "query" | "function";
  sensitive: boolean;
  company_level: boolean;
  date_field: string | null;
  params: SourceParam[];
  scopes: Option[];
  fields?: SourceField[];
};

export type Filter = { field: string; op: string; value: unknown };
export type Measure = { agg: string; field?: string | null; label?: string | null };
export type SortRule = { field: string; dir: "asc" | "desc" };

export type ReportConfig = {
  columns?: string[];
  filters?: Filter[];
  group_by?: string[];
  measures?: Measure[];
  sort?: SortRule[];
  totals?: boolean;
  params?: Record<string, unknown>;
  limit?: number | null;
};

export type ChartConfig = { type: string; x?: string; y?: string; series?: string | null };

export type Report = {
  uuid: string;
  key: string | null;
  name: string;
  description: string | null;
  category: string;
  source: string;
  source_label: string;
  config: ReportConfig;
  chart: ChartConfig | null;
  scope: string;
  is_standard: boolean;
  owner_name: string;
  mine: boolean;
  shared_roles: string[];
  shared_employee_ids: number[];
  can_edit: boolean;
  can_share: boolean;
  schedules: number;
  sensitive: boolean;
  updated_at: string;
};

export type ReportDetail = Report & { scopes: Option[]; source_def: Source & { fields: SourceField[] } };

export type ResultColumn = {
  key: string;
  label: string;
  type: string;
  grain?: string | null;
  options?: Option<unknown>[] | null;
  measure?: boolean;
  sensitive?: boolean;
};

export type ReportResult = {
  source: string;
  source_label: string;
  columns: ResultColumn[];
  rows: Record<string, unknown>[];
  row_count: number;
  base_rows: number;
  totals: Record<string, unknown> | null;
  grouped: boolean;
  scope: string;
  scope_label: string;
  masked: string[];
  truncated: boolean;
  params: Record<string, unknown>;
  config: ReportConfig;
  today: string;
  timezone: string;
  page: number;
  size: number;
};

export type ExportResponse = { uuid: string; file_name: string; password: string | null; rows: number; sensitive: boolean };

export type Schedule = {
  uuid: string;
  name: string;
  report_uuid: string;
  report_name: string;
  frequency: "daily" | "weekly" | "monthly";
  frequency_label: string;
  weekday: number | null;
  day_of_month: number | null;
  hour: number;
  format: string;
  recipient_employee_ids: number[];
  recipients: { id: number; name: string; email: string | null }[];
  recipient_emails: string[];
  active: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: "sent" | "not_sent" | "failed" | null;
  last_message: string | null;
  created_by_name: string | null;
};

export type ExportRow = {
  uuid: string;
  what: string;
  channel: string;
  format: string;
  rows: number;
  scope: string | null;
  actor_name: string | null;
  sensitive: boolean;
  protected: boolean;
  file_name: string;
  created_at: string;
  downloaded_at: string | null;
  available: boolean;
  details: Record<string, unknown> | null;
};

export type Paged<T> = { items: T[]; total: number; page: number; size: number };

/* ── helpers ─────────────────────────────────────────────────────── */

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong. Please try again.";
}

export const NUMERIC_TYPES = ["number", "money", "percent", "hours"];
export const isNumeric = (t: string | undefined) => !!t && NUMERIC_TYPES.includes(t);
export const isDateType = (t: string | undefined) => t === "date" || t === "datetime";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const CHART_TYPES: Option[] = [
  { value: "bar", label: "Bars" },
  { value: "stacked_bar", label: "Stacked bars" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "pie", label: "Pie" },
  { value: "donut", label: "Donut" },
  { value: "funnel", label: "Funnel" },
];

export const GRAIN_LABELS: Record<string, string> = { day: "Day", week: "Week", month: "Month", quarter: "Quarter", year: "Year" };

export const CHANNEL_LABELS: Record<string, string> = {
  download: "Download", schedule: "Scheduled email", data: "Import format", assistant: "Assistant", mcp: "MCP",
};

export const hourLabel = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Output key of a measure in a result row. */
export const measureKey = (m: Measure) => (m.agg === "count" || !m.field ? "count" : `${m.agg}__${m.field}`);

const RELATIVE: Record<string, string> = {
  "@today": "Today", "@yesterday": "Yesterday", "@month_start": "Start of this month", "@month_end": "End of this month",
  "@last_month_start": "Start of last month", "@last_month_end": "End of last month", "@quarter_start": "Start of this quarter",
  "@quarter_end": "End of this quarter", "@year_start": "Start of this year", "@year_end": "End of this year",
  "@fy_start": "Start of the financial year", "@fy_end": "End of the financial year", "@month": "This month", "@year": "This year",
};

export function relativeLabel(v: string): string {
  if (RELATIVE[v]) return RELATIVE[v];
  const m = /^@days:(-?\d+)$/.exec(v);
  if (m) {
    const n = Number(m[1]);
    if (n === 0) return "Today";
    return n < 0 ? `${-n} days ago` : `In ${n} days`;
  }
  return v;
}

export const isRelative = (v: unknown): v is string => typeof v === "string" && v.startsWith("@");

/** Async people search for pickers. */
export async function lookupPeople(q: string): Promise<{ value: number; label: string; description?: string }[]> {
  const rows = await api.get<{ value: number; label: string; hint?: string }[]>(`/employees/lookup?q=${encodeURIComponent(q)}`);
  return rows.map((r) => ({ value: r.value, label: r.label, description: r.hint || undefined }));
}

/** Labels for people already chosen (by id). */
export async function resolvePeople(ids: number[]): Promise<{ value: number; label: string; description?: string }[]> {
  if (!ids.length) return [];
  const rows = await api.get<{ value: number; label: string; hint?: string }[]>(`/employees/lookup?ids=${ids.join(",")}&active_only=false&limit=50`);
  return rows.map((r) => ({ value: r.value, label: r.label, description: r.hint || undefined }));
}

/** Build the data the shared WidgetChart understands from a grouped report result. */
export function resultToWidget(result: ReportResult, chartType?: string | null): WidgetData {
  const cols = result.columns as WidgetColumn[];
  const dims = cols.filter((c) => !c.measure && !c.key.startsWith("_"));
  const measures = cols.filter((c) => c.measure);
  return {
    type: chartType || "bar",
    status: "ok",
    columns: cols,
    rows: result.rows,
    x: dims[0] ?? null,
    series: dims[1] ?? null,
    measures,
    options: {},
    row_count: result.row_count,
    scope_label: result.scope_label,
  };
}
