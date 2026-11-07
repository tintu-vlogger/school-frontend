"use client";

/*
 * Report builder: pick a data source, then shape the report (columns, filters, groups,
 * totals, sort, period, whose data, chart) with a live preview on the right.
 * Saves a new report, updates one you own, or exports without saving.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, Database, Download, Lock, Plus, Search, Table2, Trash2 } from "lucide-react";
import {
  Button, Checkbox, Field, IconButton, Modal, ModalCancel, NumberInput, Select, Skeleton, Tabs, TextInput, Textarea, Toggle, useToast,
} from "@/components/ui-kit";
import { EmptyState } from "@/components/shell/page";
import { api } from "@/lib/api";
import { ExportModal } from "./export-modal";
import { FiltersEditor, filterReady } from "./filter-editor";
import { ParamInput, ResultChart, ResultNotes, ResultTable, TotalsLine } from "./result-view";
import {
  CHART_TYPES, GRAIN_LABELS, errMsg, isDateType, isNumeric, measureKey,
  type ExportResponse, type Measure, type Report, type ReportConfig, type ReportDetail, type ReportResult, type ReportsMeta, type Source, type SourceField,
} from "./types";

type FullSource = Source & { fields: SourceField[] };

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export function ReportBuilder({ open, reportUuid, meta, onClose, onSaved }: {
  open: boolean;
  /** Edit this report; empty for a new one. */
  reportUuid?: string | null;
  meta: ReportsMeta;
  onClose: () => void;
  onSaved: (r: Report) => void;
}) {
  const toast = useToast();
  const [sources, setSources] = useState<Source[] | null>(null);
  const [src, setSrc] = useState<FullSource | null>(null);
  const [loadingSrc, setLoadingSrc] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [config, setConfig] = useState<ReportConfig>({});
  const [scope, setScope] = useState("auto");
  const [chartType, setChartType] = useState("bar");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  // open: load sources, or the report being edited
  useEffect(() => {
    if (!open) return;
    setSrc(null); setName(""); setDescription(""); setConfig({}); setScope("auto"); setChartType("bar"); setDirty(false); setNameError(null);
    if (reportUuid) {
      setLoadingSrc(true);
      api.get<ReportDetail>(`/reports/${reportUuid}`).then((d) => {
        setSrc({ ...d.source_def, scopes: d.scopes });
        setName(d.name);
        setDescription(d.description ?? "");
        setConfig({ totals: true, ...d.config });
        setScope(d.scope || "auto");
        setChartType(d.chart?.type || "bar");
      }).catch((e) => toast.error(errMsg(e))).finally(() => setLoadingSrc(false));
    } else if (!sources) {
      api.get<Source[]>("/reports/sources").then(setSources).catch((e) => toast.error(errMsg(e)));
    }
  }, [open, reportUuid]); // eslint-disable-line react-hooks/exhaustive-deps

  async function pickSource(s: Source) {
    setLoadingSrc(true);
    try {
      const full = await api.get<FullSource>(`/reports/sources/${s.key}`);
      setSrc(full);
      setConfig({
        columns: full.fields.filter((f) => f.default).map((f) => f.key),
        filters: [], group_by: [], measures: [], sort: [], totals: true, limit: null,
        params: Object.fromEntries(full.params.map((p) => [p.key, p.default ?? ""])),
      });
      setScope("auto");
      if (!name) setName(full.label);
      setDirty(true);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoadingSrc(false);
    }
  }

  const update = (patch: Partial<ReportConfig>) => { setConfig((c) => ({ ...c, ...patch })); setDirty(true); };

  /** What goes to the server: incomplete filters left out. */
  const sendConfig = useMemo<ReportConfig>(() => ({
    ...config,
    filters: (config.filters ?? []).filter(filterReady),
    measures: (config.measures ?? []).filter((m) => m.agg === "count" || m.field).map((m) => ({ ...m, label: m.label || null })),
  }), [config]);

  const grouped = (config.group_by ?? []).length > 0;
  const chart = grouped ? {
    type: chartType,
    x: config.group_by![0],
    y: measureKey(sendConfig.measures?.[0] ?? { agg: "count" }),
    ...(config.group_by![1] ? { series: config.group_by![1] } : {}),
  } : null;

  async function save() {
    if (!src) return;
    if (!name.trim()) { setNameError("Give the report a name."); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), description: description.trim() || null, source: src.key, config: sendConfig, chart, scope };
      const r = reportUuid ? await api.put<Report>(`/reports/${reportUuid}`, body) : await api.post<Report>("/reports/", body);
      toast.success(reportUuid ? "Report saved" : "Report created");
      setDirty(false);
      onSaved(r);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  const exportRun = (format: string, protect: boolean) =>
    api.post<ExportResponse>("/reports/export", { source: src!.key, config: sendConfig, scope, title: name.trim() || src!.label, format, protect });

  const building = !!src;

  return (
    <>
      <Modal open={open} onClose={onClose} size="full" flush dirty={dirty} busy={saving}
        title={reportUuid ? "Edit report" : "New report"}
        description={building ? src!.label : "Choose what the report is about"}
        footerStart={building && !reportUuid && (
          <Button variant="ghost" icon={ArrowLeft} onClick={() => { setSrc(null); if (!sources) api.get<Source[]>("/reports/sources").then(setSources).catch(() => {}); }}>Change data</Button>
        )}
        footer={building ? (
          <>
            <ModalCancel />
            <Button icon={Download} onClick={() => setExporting(true)}>Export without saving</Button>
            <Button variant="primary" onClick={save} loading={saving}>{reportUuid ? "Save" : "Save report"}</Button>
          </>
        ) : <ModalCancel />}>
        {loadingSrc && !src ? (
          <div className="space-y-3 p-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
        ) : !src ? (
          <SourcePicker sources={sources} meta={meta} onPick={pickSource} />
        ) : (
          <div className="grid lg:h-full lg:grid-cols-[440px_minmax(0,1fr)]">
            <div className="hr-scroll border-b border-line lg:overflow-y-auto lg:border-b-0 lg:border-r">
              <Settings src={src} meta={meta} config={config} update={update} name={name} setName={(v) => { setName(v); setNameError(null); setDirty(true); }}
                nameError={nameError} description={description} setDescription={(v) => { setDescription(v); setDirty(true); }}
                scope={scope} setScope={(v) => { setScope(v); setDirty(true); }} chartType={chartType} setChartType={(v) => { setChartType(v); setDirty(true); }} />
            </div>
            <div className="hr-scroll min-w-0 bg-canvas/40 lg:overflow-y-auto">
              <Preview source={src.key} config={sendConfig} scope={scope} chartType={chartType} />
            </div>
          </div>
        )}
      </Modal>
      {src && (
        <ExportModal open={exporting} onClose={() => setExporting(false)} title={name.trim() || src.label} sensitive={src.sensitive}
          formats={meta.formats} run={exportRun} />
      )}
    </>
  );
}

/* ── Step 1: source ──────────────────────────────────────────────── */

function SourcePicker({ sources, meta, onPick }: { sources: Source[] | null; meta: ReportsMeta; onPick: (s: Source) => void }) {
  const [q, setQ] = useState("");
  if (!sources) return <div className="space-y-3 p-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>;
  const term = q.trim().toLowerCase();
  const shown = sources.filter((s) => !term || s.label.toLowerCase().includes(term) || s.description.toLowerCase().includes(term));
  const groups = meta.categories.map((c) => ({ ...c, items: shown.filter((s) => s.category === c.value) })).filter((g) => g.items.length);
  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <TextInput leading={Search} value={q} onValueChange={setQ} placeholder="Search data, e.g. leave, payslips, assets" autoFocusInModal />
      {groups.length === 0 && <EmptyState icon={Database} title="Nothing matches" hint="Try another word." />}
      {groups.map((g) => (
        <section key={g.value} className="mt-7">
          <h3 className="mb-2.5 text-[12px] uppercase tracking-[0.06em] text-faint">{g.label}</h3>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {g.items.map((s) => (
              <button key={s.key} type="button" onClick={() => onPick(s)}
                className="group flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft/20">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted group-hover:text-primary">
                  <Database size={15} strokeWidth={1.4} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[14px] text-ink">
                    {s.label}
                    {s.sensitive && <Lock size={12} strokeWidth={1.4} className="text-faint" aria-label="Has private details" />}
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-[18px] text-muted">{s.description}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ── Step 2: settings ────────────────────────────────────────────── */

function Block({ title, hint, children, action }: { title: string; hint?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-line px-6 py-5 last:border-b-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-[14px] text-ink">{title}</h3>
          {hint && <p className="mt-0.5 text-[12.5px] text-faint">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Settings({ src, meta, config, update, name, setName, nameError, description, setDescription, scope, setScope, chartType, setChartType }: {
  src: FullSource; meta: ReportsMeta; config: ReportConfig; update: (p: Partial<ReportConfig>) => void;
  name: string; setName: (v: string) => void; nameError: string | null; description: string; setDescription: (v: string) => void;
  scope: string; setScope: (v: string) => void; chartType: string; setChartType: (v: string) => void;
}) {
  const fields = src.fields;
  const fieldOpts = fields.map((f) => ({ value: f.key, label: f.label }));
  const groups = config.group_by ?? [];
  const measures = config.measures ?? [];
  const grouped = groups.length > 0;
  const fieldOf = (k: string) => fields.find((f) => f.key === k);

  const groupLabel = (g: string) => {
    const [k, grain] = g.split(":");
    const f = fieldOf(k);
    return `${f?.label ?? k}${grain ? ` (${GRAIN_LABELS[grain]?.toLowerCase() ?? grain})` : ""}`;
  };
  const measureLabel = (m: Measure) => m.label || (m.agg === "count" ? "Count" : `${meta.aggs.find((a) => a.value === m.agg)?.label ?? m.agg} ${fieldOf(m.field ?? "")?.label.toLowerCase() ?? ""}`);
  const sortOpts = grouped
    ? [...groups.map((g) => ({ value: g, label: groupLabel(g) })), ...(measures.length ? measures : [{ agg: "count" }]).map((m) => ({ value: measureKey(m), label: measureLabel(m) }))]
    : fieldOpts;
  const sort = config.sort?.[0] ?? null;

  function setGroup(i: number, value: string | null) {
    const next = [...groups];
    if (value === null) next.splice(i, 1); else next[i] = value;
    const patch: Partial<ReportConfig> = { group_by: next };
    if (next.length && !measures.length) patch.measures = [{ agg: "count", field: null, label: null }];
    if (sort && !sortOptsFor(next).includes(sort.field)) patch.sort = [];
    update(patch);
  }
  function sortOptsFor(gs: string[]) {
    return gs.length ? [...gs, ...(measures.length ? measures : [{ agg: "count" }]).map(measureKey)] : fields.map((f) => f.key);
  }
  function setMeasure(i: number, m: Measure) { update({ measures: measures.map((x, j) => (j === i ? m : x)) }); }

  return (
    <div>
      <Block title="Details">
        <div className="space-y-3">
          <Field label="Name" required error={nameError}>
            <TextInput value={name} onValueChange={setName} placeholder="e.g. Joiners this quarter" />
          </Field>
          <Field label="Description" aside="Optional">
            <Textarea value={description} onValueChange={setDescription} rows={2} autoGrow placeholder="What this report shows" />
          </Field>
        </div>
      </Block>

      {src.params.length > 0 && (
        <Block title="Period" hint="Used each time the report runs">
          <div className="grid gap-3 sm:grid-cols-2">
            {src.params.map((p) => (
              <Field key={p.key} label={p.label} required={p.required}>
                <ParamInput param={p} value={config.params?.[p.key]} onChange={(v) => update({ params: { ...(config.params ?? {}), [p.key]: v } })} />
              </Field>
            ))}
          </div>
        </Block>
      )}

      <Block title="Whose data" hint="People only ever see data they are allowed to see">
        <Select value={scope} onChange={(v) => setScope(v ?? "auto")}
          options={[{ value: "auto", label: "Automatic", description: "Everything the viewer can see" }, ...src.scopes]} />
      </Block>

      <Block title="Filters">
        <FiltersEditor filters={config.filters ?? []} fields={fields} meta={meta} onChange={(filters) => update({ filters })} />
      </Block>

      <Block title="Group and total" hint="Group rows to count or add up, and to draw a chart">
        <div className="space-y-2.5">
          {groups.map((g, i) => {
            const [k, grain] = g.split(":");
            const f = fieldOf(k);
            return (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-2.5 w-14 shrink-0 text-[12.5px] text-faint">{i === 0 ? "Group by" : "then by"}</span>
                <Select className="min-w-0 flex-1" value={k} options={fieldOpts}
                  onChange={(v) => { if (!v) return; const nf = fieldOf(v); setGroup(i, nf && isDateType(nf.type) ? `${v}:month` : v); }} />
                {f && isDateType(f.type) && (
                  <Select className="w-32 shrink-0" value={grain || "month"} aria-label="By"
                    options={meta.grains.map((x) => ({ value: x, label: GRAIN_LABELS[x] ?? x }))}
                    onChange={(v) => v && setGroup(i, `${k}:${v}`)} />
                )}
                <IconButton icon={Trash2} label="Remove group" onClick={() => setGroup(i, null)} />
              </div>
            );
          })}
          {groups.length < 2 && (
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => {
              const used = new Set(groups.map((g) => g.split(":")[0]));
              const f = fields.find((x) => !used.has(x.key) && (x.type === "enum" || x.type === "text")) ?? fields[0];
              setGroup(groups.length, isDateType(f.type) ? `${f.key}:month` : f.key);
            }}>{groups.length ? "Group again" : "Group rows"}</Button>
          )}
        </div>

        {grouped && (
          <div className="mt-5 space-y-2.5 border-t border-line pt-4">
            <p className="text-[12.5px] text-faint">Show for each group</p>
            {measures.map((m, i) => {
              const fieldChoices = (m.agg === "sum" || m.agg === "avg" ? fields.filter((f) => isNumeric(f.type)) : fields).map((f) => ({ value: f.key, label: f.label }));
              return (
                <div key={i} className="space-y-2 rounded-xl border border-line p-2.5">
                  <div className="flex items-start gap-2">
                    <Select className="w-40 shrink-0" value={m.agg} options={meta.aggs} aria-label="Calculation"
                      onChange={(v) => {
                        if (!v) return;
                        const keep = m.field && (v === "count" ? null : (v === "sum" || v === "avg") ? (isNumeric(fieldOf(m.field)?.type) ? m.field : null) : m.field);
                        const firstNum = fields.find((f) => isNumeric(f.type))?.key ?? null;
                        setMeasure(i, { ...m, agg: v, field: v === "count" ? null : keep || (v === "sum" || v === "avg" ? firstNum : fields[0]?.key ?? null) });
                      }} />
                    {m.agg !== "count" ? (
                      <Select className="min-w-0 flex-1" value={m.field ?? null} options={fieldChoices} placeholder="Field" aria-label="Field"
                        onChange={(v) => setMeasure(i, { ...m, field: v })} />
                    ) : <span className="mt-2.5 flex-1 text-[13px] text-muted">rows</span>}
                    <IconButton icon={Trash2} label="Remove" onClick={() => update({ measures: measures.filter((_, j) => j !== i) })} disabled={measures.length === 1} />
                  </div>
                  <TextInput value={m.label ?? ""} onValueChange={(v) => setMeasure(i, { ...m, label: v })} placeholder={`Label (${measureLabel({ ...m, label: null })})`} />
                </div>
              );
            })}
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => {
              const f = fields.find((x) => isNumeric(x.type));
              update({ measures: [...measures, f ? { agg: f.agg || "sum", field: f.key, label: null } : { agg: "count", field: null, label: null }] });
            }}>Add a total</Button>
            <Field label="Chart" className="pt-2">
              <Select value={chartType} onChange={(v) => setChartType(v ?? "bar")} options={CHART_TYPES} />
            </Field>
          </div>
        )}
      </Block>

      {!grouped && <ColumnsBlock fields={fields} columns={config.columns ?? []} onChange={(columns) => update({ columns })} />}

      <Block title="Sort and size">
        <div className="space-y-3">
          <div className="flex gap-2">
            <Select className="min-w-0 flex-1" value={sort?.field ?? null} options={sortOpts} clearable placeholder="Default order"
              onChange={(v) => update({ sort: v ? [{ field: v, dir: sort?.dir ?? "asc" }] : [] })} aria-label="Sort by" />
            <Select className="w-36 shrink-0" value={sort?.dir ?? "asc"} disabled={!sort} aria-label="Direction"
              options={[{ value: "asc", label: "Low to high" }, { value: "desc", label: "High to low" }]}
              onChange={(v) => sort && v && update({ sort: [{ field: sort.field, dir: v as "asc" | "desc" }] })} />
          </div>
          <Field label="Show only the top" hint="Leave empty to show every row">
            <NumberInput value={config.limit ?? null} onChange={(n) => update({ limit: n && n > 0 ? Math.round(n) : null })} min={1} suffix="rows" placeholder="All" />
          </Field>
          <Toggle checked={config.totals !== false} onChange={(v) => update({ totals: v })} label="Show totals" description="Adds up number columns" />
        </div>
      </Block>
    </div>
  );
}

function ColumnsBlock({ fields, columns, onChange }: { fields: SourceField[]; columns: string[]; onChange: (c: string[]) => void }) {
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();
  const match = (f: SourceField) => !term || f.label.toLowerCase().includes(term);
  const chosen = columns.map((k) => fields.find((f) => f.key === k)).filter((f): f is SourceField => !!f);
  const rest = fields.filter((f) => !columns.includes(f.key));
  const move = (i: number, d: number) => {
    const next = [...columns];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const row = (f: SourceField, on: boolean, i?: number) => (
    <div key={f.key} className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-sunken/70">
      <Checkbox checked={on} onChange={(v) => onChange(v ? [...columns, f.key] : columns.filter((k) => k !== f.key))}
        label={<span className="flex items-center gap-1.5">{f.label}{f.sensitive && <Lock size={11} strokeWidth={1.4} className="text-faint" />}</span>}
        className="min-w-0 flex-1" />
      {on && i !== undefined && !term && (
        <span className="flex opacity-50 transition-opacity group-hover:opacity-100">
          <IconButton icon={ArrowUp} label="Move up" size="sm" onClick={() => move(i, -1)} disabled={i === 0} />
          <IconButton icon={ArrowDown} label="Move down" size="sm" onClick={() => move(i, 1)} disabled={i === columns.length - 1} />
        </span>
      )}
    </div>
  );
  return (
    <Block title="Columns" hint={`${chosen.length} chosen, in this order`}>
      <TextInput leading={Search} value={q} onValueChange={setQ} placeholder="Find a column" className="mb-2" />
      <div className="space-y-0.5">
        {chosen.map((f, i) => (match(f) ? row(f, true, i) : null))}
        {chosen.length > 0 && rest.some(match) && <div className="my-2 h-px bg-line" />}
        {rest.filter(match).map((f) => row(f, false))}
      </div>
    </Block>
  );
}

/* ── Live preview ────────────────────────────────────────────────── */

function Preview({ source, config, scope, chartType }: { source: string; config: ReportConfig; scope: string; chartType: string }) {
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneBody, setDoneBody] = useState<string | null>(null);
  const [view, setView] = useState<"table" | "chart">("table");
  const seq = useRef(0);
  const body = JSON.stringify({ source, config, scope: scope === "auto" ? null : scope, page: 1, size: 50 });
  const loading = doneBody !== body;

  useEffect(() => {
    const id = ++seq.current;
    const t = setTimeout(() => {
      api.post<ReportResult>("/reports/preview", JSON.parse(body)).then((r) => {
        if (id !== seq.current) return;
        setResult(r); setError(null);
      }).catch((e) => { if (id === seq.current) setError(errMsg(e)); }).finally(() => { if (id === seq.current) setDoneBody(body); });
    }, 500);
    return () => clearTimeout(t);
  }, [body]);

  const grouped = !!result?.grouped;
  return (
    <div className="space-y-3 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[14px] text-ink">Preview</p>
          <p className="text-[12.5px] text-faint">
            {result ? `${result.row_count.toLocaleString("en-IN")} ${result.row_count === 1 ? "row" : "rows"} · ${result.scope_label}${result.row_count > 50 ? " · first 50 shown" : ""}` : "Loading…"}
          </p>
        </div>
        {grouped && (
          <Tabs variant="pill" value={view} onChange={setView}
            items={[{ value: "table", label: "Table", icon: Table2 }, { value: "chart", label: "Chart", icon: BarChart3 }]} />
        )}
      </div>
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50/60 px-3 py-2 text-[13px] text-rose-700">{error}</p>}
      {!result && !error && <Skeleton className="h-72 w-full rounded-2xl" />}
      {result && (
        <div className={cx("space-y-3 transition-opacity", loading && "opacity-60")}>
          {view === "chart" && grouped ? <ResultChart result={result} type={chartType} height={300} /> : <ResultTable result={result} loading={loading && !result.rows.length} />}
          <TotalsLine result={result} />
          <ResultNotes result={result} />
        </div>
      )}
    </div>
  );
}
