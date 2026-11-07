/* Shapes used by the dashboards page (see /dashboards and /reports in the API). */

export type WidgetType = "kpi" | "line" | "bar" | "stacked_bar" | "area" | "pie" | "donut" | "table" | "heatmap" | "funnel" | "gauge";

export type Filter = { field: string; op: string; value?: unknown };
export type Measure = { agg: string; field?: string; label?: string };
export type WidgetConfig = {
  columns?: string[];
  filters?: Filter[];
  group_by?: string[];
  measures?: Measure[];
  sort?: { field: string; dir: "asc" | "desc" }[];
  limit?: number | null;
  params?: Record<string, unknown>;
  totals?: boolean;
};
export type WidgetOptions = { format?: "number" | "money" | "percent"; percent?: boolean; max?: number | null; series?: unknown };

export type Widget = {
  id: string;
  type: WidgetType;
  title: string;
  x: number; y: number; w: number; h: number;
  source?: string | null;
  config?: WidgetConfig | null;
  report_uuid?: string | null;
  options?: WidgetOptions;
};

export type DashboardBrief = {
  uuid: string; key: string | null; name: string; description: string | null; icon: string | null;
  is_standard: boolean; owner_name: string | null; shared_roles: string[]; shared_employee_ids: number[];
  can_edit: boolean; can_share: boolean; widget_count: number; updated_at: string;
};
export type Dashboard = DashboardBrief & { widgets: Widget[] };

export type DashMeta = { types: { value: WidgetType; label: string }[]; can_manage: boolean; can_build: boolean };

export type SourceBrief = { key: string; label: string; category: string; description: string; date_field: string | null };
export type SourceField = {
  key: string; label: string; type: string; sensitive?: boolean;
  options: { value: string | number | boolean; label: string }[] | null; default?: boolean; agg?: string | null;
};
export type SourceDef = SourceBrief & { fields: SourceField[] };

export type ReportBrief = { uuid: string; name: string; category: string; source_label: string; is_standard: boolean; chart?: { type: string } | null };

export type ReportsMeta = {
  ops: { value: string; label: string }[]; date_ops: string[]; aggs: { value: string; label: string }[]; grains: string[];
};

export const ROW = 84;
export const GAP = 12;

/** Only the parts of a widget that change its data (not its place on the grid). */
export function contentKey(w: Widget): string {
  return JSON.stringify({ t: w.type, ti: w.title, s: w.source ?? null, c: w.config ?? null, r: w.report_uuid ?? null, o: w.options ?? {} });
}

export function hintFor(d: DashboardBrief): string {
  if (d.is_standard) return "Ready-made";
  if (!d.can_edit || d.shared_roles.length || d.shared_employee_ids.length) return "Shared";
  return "Yours";
}
