"use client";

/*
 * Add or edit one dashboard widget: pick a chart, a title and the data (a saved report,
 * or a data source with groups, a number, filters and sort), with a live preview.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChartArea, ChartColumn, ChartColumnStacked, ChartLine, ChartPie, Donut, Funnel, Gauge, Grid3x3, Hash, Plus, Table2, X,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  Button, DateInput, Field, FormGrid, IconButton, Modal, ModalCancel, MultiSelect, NumberInput, RadioCards, Select, Tabs,
  TextInput, Toggle, type IconType, type SelectOption,
} from "@/components/ui-kit";
import { WidgetChart, type WidgetData } from "@/components/insights/charts";
import type { DashMeta, Filter, ReportBrief, ReportsMeta, SourceBrief, SourceDef, SourceField, Widget, WidgetType } from "./types";

const ICONS: Record<WidgetType, IconType> = {
  kpi: Hash, line: ChartLine, bar: ChartColumn, stacked_bar: ChartColumnStacked, area: ChartArea, pie: ChartPie,
  donut: Donut, table: Table2, heatmap: Grid3x3, funnel: Funnel, gauge: Gauge,
};

const DEFAULT_SIZE: Record<WidgetType, [number, number]> = {
  kpi: [3, 2], gauge: [3, 3], table: [6, 4], pie: [4, 4], donut: [4, 4], funnel: [6, 4], heatmap: [6, 4],
  line: [6, 4], area: [6, 4], bar: [6, 4], stacked_bar: [6, 4],
};

const NUMERIC = new Set(["number", "money", "hours", "percent"]);
const DATE = new Set(["date", "datetime"]);
const NO_VALUE = new Set(["empty", "not_empty", "is_true", "is_false", "this_month", "last_month", "this_quarter", "this_year", "this_fy"]);
const GRAIN_LABEL: Record<string, string> = { day: "Day", week: "Week", month: "Month", quarter: "Quarter", year: "Year" };

function opsFor(f: SourceField | undefined, dateOps: string[]): string[] {
  if (!f) return ["eq"];
  if (f.type === "bool") return ["is_true", "is_false", "empty", "not_empty"];
  if (DATE.has(f.type)) return ["eq", "gt", "gte", "lt", "lte", "between", ...dateOps, "empty", "not_empty"];
  if (NUMERIC.has(f.type)) return ["eq", "ne", "gt", "gte", "lt", "lte", "between", "empty", "not_empty"];
  if (f.options?.length) return ["eq", "ne", "in", "not_in", "empty", "not_empty"];
  return ["eq", "ne", "in", "not_in", "contains", "starts", "empty", "not_empty"];
}

type Group = { field: string; grain: string };
type Form = {
  type: WidgetType; title: string; from: "source" | "report"; report_uuid: string | null; source: string | null;
  groups: Group[]; agg: string; field: string | null; label: string; filters: Filter[];
  sortField: string | null; sortDir: "asc" | "desc"; limit: number | null; columns: string[];
  format: "number" | "money" | "percent" | ""; max: number | null; percent: boolean;
};

function toForm(w: Widget | null): Form {
  const c = w?.config ?? {};
  const m = c.measures?.[0];
  return {
    type: w?.type ?? "bar", title: w?.title ?? "", from: w?.report_uuid ? "report" : "source",
    report_uuid: w?.report_uuid ?? null, source: w?.source ?? null,
    groups: (c.group_by ?? []).map((g) => { const [field, grain] = g.split(":"); return { field, grain: grain ?? "" }; }),
    agg: m?.agg ?? "count", field: m?.field ?? null, label: m?.label ?? "", filters: c.filters ?? [],
    sortField: c.sort?.[0]?.field ?? null, sortDir: c.sort?.[0]?.dir ?? "desc", limit: c.limit ?? null, columns: c.columns ?? [],
    format: w?.options?.format ?? "", max: w?.options?.max ?? null, percent: !!w?.options?.percent,
  };
}

const maxGroups = (t: WidgetType) => (t === "kpi" || t === "gauge" ? 0 : t === "pie" || t === "donut" || t === "funnel" ? 1 : 2);
const measureKey = (agg: string, field: string | null) => (agg === "count" || !field ? "count" : `${agg}__${field}`);

export function WidgetEditor({ open, widget, existing, meta, onClose, onSave }: {
  open: boolean;
  widget: Widget | null;
  existing: Widget[];
  meta: DashMeta | null;
  onClose: () => void;
  onSave: (w: Widget) => void;
}) {
  const [f, setF] = useState<Form>(() => toForm(widget));
  const [dirty, setDirty] = useState(false);
  const [rmeta, setRmeta] = useState<ReportsMeta | null>(null);
  const [sources, setSources] = useState<SourceBrief[]>([]);
  const [reports, setReports] = useState<ReportBrief[]>([]);
  const [def, setDef] = useState<SourceDef | null>(null);
  const [preview, setPreview] = useState<WidgetData | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const newId = useRef(`w${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    if (!open) return;
    setF(toForm(widget));
    setDirty(false);
    setError(null);
    setPreview(null);
    newId.current = `w${Math.random().toString(36).slice(2, 9)}`;
  }, [open, widget]);

  useEffect(() => {
    if (!open) return;
    api.getCached<ReportsMeta>("/reports/meta", 300).then(setRmeta).catch(() => {});
    api.getCached<SourceBrief[]>("/reports/sources", 300).then(setSources).catch(() => {});
    api.getCached<ReportBrief[]>("/reports/", 60).then(setReports).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open || !f.source || f.from !== "source") { setDef(null); return; }
    let live = true;
    api.getCached<SourceDef>(`/reports/sources/${f.source}`, 300).then((d) => { if (live) setDef(d); }).catch(() => {});
    return () => { live = false; };
  }, [open, f.source, f.from]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((p) => ({ ...p, [k]: v })); setDirty(true); };
  const fields = useMemo(() => def?.fields ?? [], [def]);
  const fieldBy = useMemo(() => new Map(fields.map((x) => [x.key, x])), [fields]);
  const fieldOpts: SelectOption[] = fields.map((x) => ({ value: x.key, label: x.label }));
  const numericOpts: SelectOption[] = fields.filter((x) => NUMERIC.has(x.type)).map((x) => ({ value: x.key, label: x.label }));
  const ng = maxGroups(f.type);

  const built = useMemo<Widget>(() => {
    const [dw, dh] = DEFAULT_SIZE[f.type];
    const options: Widget["options"] = {};
    if (f.format) options.format = f.format;
    if (f.type === "gauge") { if (f.percent) options.percent = true; else if (f.max) options.max = f.max; }
    const base = {
      id: widget?.id ?? newId.current, type: f.type, title: f.title.trim(),
      x: widget?.x ?? 0, y: widget?.y ?? Math.max(0, ...existing.map((w) => w.y + w.h)), w: widget?.w ?? dw, h: widget?.h ?? dh, options,
    };
    if (f.from === "report") return { ...base, report_uuid: f.report_uuid, config: {} };
    const groups = f.groups.slice(0, ng).filter((g) => g.field).map((g) => {
      const fd = fieldBy.get(g.field);
      return fd && DATE.has(fd.type) ? `${g.field}:${g.grain || "month"}` : g.field;
    });
    const needsField = f.agg !== "count";
    const measure = { agg: needsField && !f.field ? "count" : f.agg, ...(needsField && f.field ? { field: f.field } : {}), ...(f.label.trim() ? { label: f.label.trim() } : {}) };
    const filters = f.filters.filter((x) => x.field && x.op && (NO_VALUE.has(x.op) || (x.value !== undefined && x.value !== null && x.value !== "")));
    const config: Widget["config"] = { group_by: groups, measures: [measure], filters };
    if (f.sortField) config.sort = [{ field: f.sortField, dir: f.sortDir }];
    if (f.limit) config.limit = f.limit;
    if (f.type === "table" && !groups.length && f.columns.length) config.columns = f.columns;
    if (f.type === "table" && !groups.length) config.measures = [];
    return { ...base, source: f.source, config };
  }, [f, widget, existing, ng, fieldBy]);

  const ready = f.from === "report" ? !!f.report_uuid : !!f.source;

  // Live preview, debounced
  const sig = JSON.stringify({ ...built, title: "", x: 0, y: 0 });
  useEffect(() => {
    if (!open || !ready) { setPreview(null); return; }
    let live = true;
    setPreviewing(true);
    const t = setTimeout(() => {
      api.post<WidgetData>("/dashboards/widget-preview", { widget: { ...built, title: built.title || "Preview" } })
        .then((d) => { if (live) setPreview(d); })
        .catch((e) => { if (live) setPreview({ type: built.type, status: "error", message: e instanceof Error ? e.message : "Couldn't preview" }); })
        .finally(() => { if (live) setPreviewing(false); });
    }, 450);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, open, ready]);

  function save() {
    if (!ready) { setError(f.from === "report" ? "Choose a report." : "Choose the data to show."); return; }
    let title = built.title;
    if (!title && f.from === "report") title = reports.find((r) => r.uuid === f.report_uuid)?.name ?? "";
    if (!title) { setError("Give the widget a title."); return; }
    onSave({ ...built, title });
  }

  const sortOpts: SelectOption[] = (() => {
    const gs = f.groups.slice(0, ng).filter((g) => g.field).map((g) => {
      const fd = fieldBy.get(g.field);
      const key = fd && DATE.has(fd.type) ? `${g.field}:${g.grain || "month"}` : g.field;
      return { value: key, label: fd?.label ?? g.field };
    });
    const mk = measureKey(f.agg, f.field);
    const ml = f.label || (f.agg === "count" ? "Count" : `${rmeta?.aggs.find((a) => a.value === f.agg)?.label ?? f.agg} of ${fieldBy.get(f.field ?? "")?.label ?? ""}`);
    if (f.type === "table" && !gs.length) return fieldOpts;
    return [...gs, { value: mk, label: ml }];
  })();

  const typeOpts = (meta?.types ?? []).map((t) => ({ value: t.value, label: t.label, icon: ICONS[t.value] }));
  const previewH = f.type === "kpi" ? 120 : 260;

  return (
    <Modal open={open} onClose={onClose} size="xl" dirty={dirty}
      title={widget ? "Edit widget" : "Add widget"}
      footer={<><ModalCancel /><Button variant="primary" onClick={save}>{widget ? "Done" : "Add widget"}</Button></>}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <Field label="Chart">
            <RadioCards columns={4} value={f.type} onChange={(v) => set("type", v as WidgetType)} options={typeOpts} />
          </Field>

          <Field label="Title" required error={error && !f.title.trim() && f.from === "source" ? error : undefined}>
            <TextInput value={f.title} onValueChange={(v) => set("title", v)} placeholder="e.g. Headcount by department" autoFocusInModal />
          </Field>

          <div className="space-y-4">
            <Tabs variant="pill" value={f.from} onChange={(v) => set("from", v)}
              items={[{ value: "source", label: "Build from data" }, { value: "report", label: "Use a saved report" }]} />

            {f.from === "report" ? (
              <Field label="Report" hint="The widget shows the report's own groups and numbers.">
                <Select value={f.report_uuid} onChange={(v) => set("report_uuid", v)} placeholder="Choose a report"
                  options={reports.map((r) => ({ value: r.uuid, label: r.name, description: `${r.source_label}${r.is_standard ? " · Ready-made" : ""}` }))} />
              </Field>
            ) : (
              <>
                <Field label="Data">
                  <Select value={f.source} placeholder="Choose what to count"
                    onChange={(v) => { setF((p) => ({ ...p, source: v, groups: [], filters: [], field: null, agg: "count", sortField: null, columns: [] })); setDirty(true); }}
                    options={sources.map((s) => ({ value: s.key, label: s.label, description: s.description }))} />
                </Field>

                {def && (
                  <>
                    {ng > 0 && (
                      <Field label={ng > 1 ? "Group by" : "Split by"} hint={ng > 1 ? (f.type === "heatmap" ? "Rows, then columns." : "A second group splits each bar or line into series.") : undefined}>
                        <div className="space-y-2">
                          {f.groups.slice(0, ng).map((g, i) => {
                            const fd = fieldBy.get(g.field);
                            return (
                              <div key={i} className="flex items-center gap-2">
                                <Select className="min-w-0 flex-1" value={g.field || null} options={fieldOpts} placeholder="Choose a field"
                                  onChange={(v) => set("groups", f.groups.map((x, j) => (j === i ? { field: v ?? "", grain: x.grain } : x)))} />
                                {fd && DATE.has(fd.type) && (
                                  <Select className="w-32" value={g.grain || "month"} aria-label="Date grain"
                                    options={(rmeta?.grains ?? ["day", "week", "month", "quarter", "year"]).map((x) => ({ value: x, label: GRAIN_LABEL[x] ?? x }))}
                                    onChange={(v) => set("groups", f.groups.map((x, j) => (j === i ? { ...x, grain: v ?? "month" } : x)))} />
                                )}
                                <IconButton icon={X} label="Remove group" onClick={() => set("groups", f.groups.filter((_, j) => j !== i))} />
                              </div>
                            );
                          })}
                          {f.groups.length < ng && (
                            <Button size="sm" variant="ghost" icon={Plus} onClick={() => set("groups", [...f.groups, { field: "", grain: "month" }])}>
                              {f.groups.length ? "Add a second group" : "Add a group"}
                            </Button>
                          )}
                        </div>
                      </Field>
                    )}

                    {f.type === "table" && !f.groups.filter((g) => g.field).length ? (
                      <Field label="Columns" hint="Leave empty for the usual columns.">
                        <MultiSelect value={f.columns} onChange={(v) => set("columns", v)} options={fieldOpts} placeholder="Choose columns" />
                      </Field>
                    ) : (
                      <FormGrid columns={3}>
                        <Field label="Number">
                          <Select value={f.agg} onChange={(v) => set("agg", v ?? "count")}
                            options={(rmeta?.aggs ?? [{ value: "count", label: "Count" }]).map((a) => ({ value: a.value, label: a.value === "count" ? "Count of rows" : a.label }))} />
                        </Field>
                        {f.agg !== "count" ? (
                          <Field label="Of">
                            <Select value={f.field} onChange={(v) => set("field", v)} placeholder="Choose a field"
                              options={f.agg === "sum" || f.agg === "avg" ? numericOpts : fieldOpts} />
                          </Field>
                        ) : <div className="hidden sm:block" />}
                        <Field label="Label" aside="Optional">
                          <TextInput value={f.label} onValueChange={(v) => set("label", v)} placeholder={f.agg === "count" ? "People" : ""} />
                        </Field>
                      </FormGrid>
                    )}

                    <FilterEditor filters={f.filters} onChange={(v) => set("filters", v)} fields={fields} fieldBy={fieldBy} rmeta={rmeta} />

                    {f.type !== "kpi" && f.type !== "gauge" && (
                      <FormGrid columns={3}>
                        <Field label="Sort by">
                          <Select value={f.sortField} onChange={(v) => set("sortField", v)} options={sortOpts} placeholder="Default" clearable />
                        </Field>
                        <Field label="Order">
                          <Select value={f.sortDir} onChange={(v) => set("sortDir", (v ?? "desc") as "asc" | "desc")}
                            options={[{ value: "desc", label: "High to low" }, { value: "asc", label: "Low to high" }]} />
                        </Field>
                        <Field label="Show at most" aside="Optional">
                          <NumberInput value={f.limit} onChange={(v) => set("limit", v)} min={1} max={500} placeholder="All" />
                        </Field>
                      </FormGrid>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <FormGrid columns={2}>
            <Field label="Show numbers as">
              <Select value={f.format || null} onChange={(v) => set("format", (v ?? "") as Form["format"])} clearable placeholder="Automatic"
                options={[{ value: "number", label: "Number" }, { value: "money", label: "Money" }, { value: "percent", label: "Percent" }]} />
            </Field>
            {f.type === "gauge" && (
              <div className="space-y-3">
                <Toggle checked={f.percent} onChange={(v) => set("percent", v)} label="Show as percent" description="For a rate between 0 and 1." />
                {!f.percent && (
                  <Field label="Full scale">
                    <NumberInput value={f.max} onChange={(v) => set("max", v)} min={1} placeholder="100" />
                  </Field>
                )}
              </div>
            )}
          </FormGrid>
          {error && <p className="text-[13px] text-rose-600">{error}</p>}
        </div>

        <div className="min-w-0">
          <div className="sticky top-0 rounded-2xl border border-line bg-canvas/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="truncate text-[13.5px] text-ink">{f.title.trim() || "Preview"}</p>
              {previewing && <span className="text-[11.5px] text-faint">Updating…</span>}
            </div>
            <div className="overflow-auto" style={{ height: previewH + 30 }}>
              {!ready ? (
                <div className="flex h-full items-center justify-center text-center text-[13px] text-faint">
                  {f.from === "report" ? "Choose a report to see it here." : "Choose the data to see a preview."}
                </div>
              ) : preview ? (
                <WidgetChart data={preview} height={previewH} />
              ) : (
                <div className="h-full animate-pulse rounded-lg bg-sunken" />
              )}
            </div>
            {preview?.status === "ok" && preview.scope_label && preview.scope_label !== "Everyone" && (
              <p className="mt-2 text-[11.5px] text-faint">Showing: {preview.scope_label}</p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ── Filters ──────────────────────────────────────────────────── */

function FilterEditor({ filters, onChange, fields, fieldBy, rmeta }: {
  filters: Filter[]; onChange: (f: Filter[]) => void; fields: SourceField[]; fieldBy: Map<string, SourceField>; rmeta: ReportsMeta | null;
}) {
  const opLabel = new Map((rmeta?.ops ?? []).map((o) => [o.value, o.label]));
  const upd = (i: number, patch: Partial<Filter>) => onChange(filters.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <Field label="Only include" aside={filters.length ? undefined : "Optional"}>
      <div className="space-y-2">
        {filters.map((flt, i) => {
          const fd = fieldBy.get(flt.field);
          const ops = opsFor(fd, rmeta?.date_ops ?? []);
          return (
            <div key={i} className="flex flex-wrap items-start gap-2 rounded-xl border border-line p-2 sm:flex-nowrap">
              <Select className="w-full sm:w-44" value={flt.field || null} placeholder="Field"
                options={fields.map((x) => ({ value: x.key, label: x.label }))}
                onChange={(v) => { const nf = v ? fieldBy.get(v) : undefined; upd(i, { field: v ?? "", op: opsFor(nf, rmeta?.date_ops ?? [])[0], value: undefined }); }} />
              <Select className="w-full sm:w-44" value={flt.op} aria-label="Condition"
                options={ops.map((o) => ({ value: o, label: opLabel.get(o) ?? o.replace(/_/g, " ") }))}
                onChange={(v) => upd(i, { op: v ?? "eq", value: undefined })} />
              <div className="min-w-0 flex-1">
                <ValueInput field={fd} op={flt.op} value={flt.value} onChange={(v) => upd(i, { value: v })} />
              </div>
              <IconButton icon={X} label="Remove filter" onClick={() => onChange(filters.filter((_, j) => j !== i))} />
            </div>
          );
        })}
        <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...filters, { field: "", op: "eq" }])}>Add a filter</Button>
      </div>
    </Field>
  );
}

function ValueInput({ field, op, value, onChange }: { field?: SourceField; op: string; value: unknown; onChange: (v: unknown) => void }) {
  if (!field || NO_VALUE.has(op)) return <div className="flex h-10 items-center text-[13px] text-faint">{field ? "" : "Choose a field first"}</div>;
  if (op === "last_n_days" || op === "next_n_days") {
    return <NumberInput value={typeof value === "number" ? value : null} onChange={onChange} min={1} suffix="days" />;
  }
  const isDate = DATE.has(field.type);
  const isNum = NUMERIC.has(field.type);
  const single = (v: unknown, set: (x: unknown) => void, ph?: string) => {
    if (isDate && !(typeof v === "string" && v.startsWith("@"))) return <DateInput value={typeof v === "string" ? v : ""} onChange={set} placeholder={ph} />;
    if (isNum) return <NumberInput value={typeof v === "number" ? v : v === undefined || v === null || v === "" ? null : Number(v)} onChange={set} placeholder={ph} />;
    return <TextInput value={v === undefined || v === null ? "" : String(v)} onValueChange={set} placeholder={ph ?? "Value"} />;
  };
  if (op === "between") {
    const arr = Array.isArray(value) ? value : [null, null];
    return (
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">{single(arr[0], (x) => onChange([x, arr[1]]), "From")}</div>
        <span className="text-[12.5px] text-faint">and</span>
        <div className="min-w-0 flex-1">{single(arr[1], (x) => onChange([arr[0], x]), "To")}</div>
      </div>
    );
  }
  if (field.options?.length) {
    const opts = field.options.map((o) => ({ value: String(o.value), label: o.label }));
    if (op === "in" || op === "not_in") {
      return <MultiSelect value={Array.isArray(value) ? value.map(String) : []} onChange={onChange} options={opts} placeholder="Choose" />;
    }
    return <Select value={value === undefined || value === null ? null : String(value)} onChange={onChange} options={opts} placeholder="Choose" />;
  }
  if (op === "in" || op === "not_in") {
    return <CsvInput value={Array.isArray(value) ? value.map(String) : []} onChange={onChange} />;
  }
  return single(value, onChange);
}

function CsvInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  return <TextInput value={text} placeholder="Values, separated by commas"
    onValueChange={(t) => { setText(t); onChange(t.split(",").map((x) => x.trim()).filter(Boolean)); }} />;
}
