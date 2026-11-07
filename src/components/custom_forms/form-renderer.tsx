"use client";

/*
 * Renders a custom service's form (definition JSON) for filling in or reading.
 *
 *   <FormRenderer code="training_request" definition={def} values={v} onChange={setV} labels={labels} />
 *   <ValuesView definition={def} values={record.values} labels={record.labels} files={record.files} />
 *
 * Show-if conditions and formulas are worked out by the API (POST /custom-forms/services/{code}/evaluate)
 * a moment after each change, so the browser shows exactly what the server will store.
 * Fields marked access "view" are shown read-only; "hidden" ones never reach the browser.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, FileText, IndianRupee, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { fileHref, uploadFile } from "@/components/workplace/files";
import {
  Checkbox, DateInput, Field, FileDrop, IconButton, MasterSelect, MultiSelect, NumberInput, RadioCards, Select,
  Textarea, TextInput, TimeInput, Toggle, formatBytes, useToast, type SelectOption,
} from "@/components/ui-kit";
import type { Definition, FileRef, FormField, Labels, Values } from "./types";

const STROKE = 1.4;
const LOOKUP = new Set(["employee", "department", "location"]);

export function isEmpty(v: unknown) {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });

export function money(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? INR.format(n) : String(v ?? "");
}

function labelKey(f: FormField, id: unknown) {
  return f.type === "master" ? `master:${id}` : `${f.type}:${id}`;
}

/** A stored value as text for lists and details. */
export function displayValue(f: FormField, v: unknown, labels: Labels = {}): string {
  if (isEmpty(v)) return "";
  const t = f.type === "formula" ? (f.result ?? "number") : f.type;
  if (t === "master" || LOOKUP.has(t)) {
    const ids = Array.isArray(v) ? v : [v];
    return ids.map((i) => labels[labelKey(f, i)] ?? `#${i}`).join(", ");
  }
  if (t === "boolean") return v ? "Yes" : "No";
  if (t === "currency") return money(v);
  if (t === "date") return formatDate(String(v));
  if (t === "datetime") return formatDateTime(String(v));
  if (t === "multi_choice") return (v as string[]).join(", ");
  if (t === "table") { const n = Array.isArray(v) ? v.length : 0; return `${n} row${n === 1 ? "" : "s"}`; }
  if (t === "file") return Array.isArray(v) ? (v as FileRef[]).map((x) => x.name).join(", ") : "";
  if (t === "number" || t === "decimal") {
    const n = Number(v);
    return Number.isFinite(n) ? n.toLocaleString("en-IN", { maximumFractionDigits: 6 }) : String(v);
  }
  return String(v);
}

/* ── live evaluation ──────────────────────────────────────────────── */

type Evaluation = { visible: string[]; computed: Record<string, unknown> };

export function useEvaluation(code: string, values: Values, recordUuid?: string | null) {
  const [ev, setEv] = useState<Evaluation | null>(null);
  const body = JSON.stringify(values);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api.post<Evaluation>(`/custom-forms/services/${code}/evaluate`, { values: JSON.parse(body), record_uuid: recordUuid ?? null })
        .then((r) => { if (live) setEv(r); }).catch(() => {});
    }, ev ? 350 : 0);
    return () => { live = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, body, recordUuid]);
  return ev;
}

/** Which fields and sections show, given the API's list of visible fields. */
function visibleFields(def: Definition, ev: Evaluation | null): FormField[] {
  const shown = ev ? new Set(ev.visible) : null;
  const out: FormField[] = [];
  const fields = def.fields;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    if (f.type === "section") {
      // a section shows when something under it shows
      let any = false;
      for (let j = i + 1; j < fields.length && fields[j].type !== "section"; j++) {
        if (!shown ? !fields[j].show_if && !f.show_if : shown.has(fields[j].key)) { any = true; break; }
      }
      if (any) out.push(f);
      continue;
    }
    if (shown ? shown.has(f.key) : !f.show_if) out.push(f);
  }
  return out;
}

/* ── the form ─────────────────────────────────────────────────────── */

export type FormRendererProps = {
  code: string;
  definition: Definition;
  values: Values;
  onChange: (values: Values) => void;
  labels?: Labels;
  /** Existing record (edits): the API evaluates with its requester. */
  recordUuid?: string | null;
  /** Signed links for files already on the record. */
  files?: Record<string, FileRef[]>;
  errors?: Record<string, string>;
  /** Make every field read-only (e.g. preview). */
  readOnly?: boolean;
};

export function FormRenderer({ code, definition, values, onChange, labels = {}, recordUuid, files, errors = {}, readOnly }: FormRendererProps) {
  const ev = useEvaluation(code, values, recordUuid);
  const shown = useMemo(() => visibleFields(definition, ev), [definition, ev]);
  const set = (key: string, v: unknown) => onChange({ ...values, [key]: v });

  const blocks: ReactNode[] = [];
  let row: ReactNode[] = [];
  const flush = () => { if (row.length) { blocks.push(<div key={`r${blocks.length}`} className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">{row}</div>); row = []; } };
  for (const f of shown) {
    if (f.type === "section") {
      flush();
      blocks.push(
        <div key={`s-${f.label}-${blocks.length}`} className="pt-2">
          <h3 className="text-[13px] font-normal uppercase tracking-[0.06em] text-faint">{f.label}</h3>
          {f.help && <p className="mt-1 text-[13px] text-muted">{f.help}</p>}
          <div className="mt-2 h-px bg-line" />
        </div>,
      );
      continue;
    }
    const full = f.width !== "half" || f.type === "table" || f.type === "textarea" || (f.type === "single_choice" && f.display === "radio" && (f.options?.length ?? 0) > 2);
    const node = (
      <div key={f.key} className={full ? "sm:col-span-2" : ""}>
        <FieldControl code={code} f={f} value={f.type === "formula" ? ev?.computed[f.key] ?? values[f.key] : values[f.key]}
          computedRows={ev?.computed[f.key] as Values[] | undefined}
          onChange={(v) => set(f.key, v)} labels={labels} files={files?.[f.key]} error={errors[f.key]}
          readOnly={readOnly || f.access === "view"} />
      </div>
    );
    row.push(node);
  }
  flush();
  return <div className="space-y-5">{blocks}</div>;
}

function FieldControl({ code, f, value, onChange, labels, files, error, readOnly, computedRows }: {
  code: string; f: FormField; value: unknown; onChange: (v: unknown) => void; labels: Labels; files?: FileRef[];
  error?: string; readOnly?: boolean; computedRows?: Values[];
}) {
  const hint = f.help;
  if (f.type === "formula") {
    return (
      <Field label={f.label} hint={hint ?? "Worked out from the other fields."}>
        <div className="flex h-10 items-center rounded-lg border border-dashed border-line bg-sunken/60 px-3 text-[14px] text-ink/90">
          {isEmpty(value) ? <span className="text-faint">—</span> : displayValue(f, value, labels)}
        </div>
      </Field>
    );
  }
  if (readOnly) {
    return (
      <Field label={f.label} hint={hint}>
        <div className="min-h-10 rounded-lg bg-sunken/60 px-3 py-2.5 text-[14px] text-ink/90">
          <ReadValue f={f} value={value} labels={labels} files={files} />
        </div>
      </Field>
    );
  }
  if (f.type === "table") {
    return <TableControl code={code} f={f} value={(value as Values[]) ?? []} onChange={onChange} labels={labels} error={error} computedRows={computedRows} />;
  }
  if (f.type === "boolean") {
    return (
      <Field label={f.label} hint={hint} error={error} required={f.required}>
        <div className="flex h-10 items-center"><Toggle checked={!!value} onChange={(x) => onChange(x)} label={value ? "Yes" : "No"} /></div>
      </Field>
    );
  }
  return (
    <Field label={f.label} hint={hint} error={error} required={f.required}>
      <Control code={code} f={f} value={value} onChange={onChange} labels={labels} files={files} invalid={!!error} />
    </Field>
  );
}

function Control({ f, value, onChange, labels, files, invalid }: {
  code: string; f: FormField; value: unknown; onChange: (v: unknown) => void; labels: Labels; files?: FileRef[]; invalid?: boolean;
}) {
  const str = value === null || value === undefined ? "" : String(value);
  switch (f.type) {
    case "text": case "email": case "phone": case "url":
      return <TextInput value={str} onValueChange={(x) => onChange(x)} invalid={invalid} maxLength={f.max_length ?? 255}
        type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "url" ? "url" : "text"}
        placeholder={f.placeholder ?? (f.type === "url" ? "https://" : f.type === "phone" ? "+91" : undefined)} />;
    case "textarea":
      return <Textarea value={str} onValueChange={(x) => onChange(x)} invalid={invalid} autoGrow rows={3} maxLength={f.max_length ?? 5000} placeholder={f.placeholder} />;
    case "number":
      return <NumberInput value={str === "" ? null : Number(str)} onChange={(x) => onChange(x)} min={f.min} max={f.max} invalid={invalid} placeholder={f.placeholder} />;
    case "decimal": case "currency":
      return <TextInput value={str} onValueChange={(x) => onChange(x.replace(/[^0-9.,-]/g, ""))} inputMode="decimal" invalid={invalid}
        leading={f.type === "currency" ? IndianRupee : undefined} placeholder={f.placeholder ?? (f.type === "currency" ? "0.00" : undefined)} />;
    case "date":
      return <DateInput value={str} onChange={(x) => onChange(x || null)} clearable invalid={invalid} />;
    case "datetime":
      return <DateTimeControl value={str} onChange={onChange} invalid={invalid} />;
    case "time":
      return <TimeInput value={str} onChange={(x) => onChange(x || null)} invalid={invalid} />;
    case "single_choice": {
      const opts = (f.options ?? []).map((o) => ({ value: o, label: o }));
      if (f.display === "radio" && opts.length <= 8) {
        return <RadioCards options={opts} value={str || null} onChange={(x) => onChange(x)} columns={opts.length >= 4 ? 4 : opts.length === 3 ? 3 : 2} />;
      }
      return <Select options={opts} value={str || null} onChange={(x) => onChange(x)} clearable invalid={invalid} placeholder={f.placeholder ?? "Choose…"} />;
    }
    case "multi_choice": {
      const cur = Array.isArray(value) ? (value as string[]) : [];
      const opts = f.options ?? [];
      if (opts.length <= 6) {
        return (
          <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
            {opts.map((o) => <Checkbox key={o} label={o} checked={cur.includes(o)} onChange={(c) => onChange(c ? [...cur, o] : cur.filter((x) => x !== o))} />)}
          </div>
        );
      }
      return <MultiSelect options={opts.map((o) => ({ value: o, label: o }))} value={cur} onChange={(x) => onChange(x)} invalid={invalid} />;
    }
    case "master":
      return f.multiple
        ? <MasterSelect type={f.master!} multiple value={Array.isArray(value) ? (value as number[]) : []} onChange={(x) => onChange(x)} invalid={invalid} />
        : <MasterSelect type={f.master!} value={value === null || value === undefined || value === "" ? null : Number(value)} onChange={(x) => onChange(x)} clearable invalid={invalid} />;
    case "employee": case "department": case "location":
      return <LookupControl kind={f.type} multiple={!!f.multiple} value={value} onChange={onChange} labels={labels} invalid={invalid} />;
    case "file":
      return <FileControl f={f} value={value} onChange={onChange} files={files} />;
    default:
      return null;
  }
}

function DateTimeControl({ value, onChange, invalid }: { value: string; onChange: (v: unknown) => void; invalid?: boolean }) {
  const d = value ? new Date(value) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePart = d && !Number.isNaN(d.getTime()) ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "";
  const timePart = d && !Number.isNaN(d.getTime()) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
  const emit = (date: string, time: string) => {
    if (!date) { onChange(null); return; }
    onChange(new Date(`${date}T${time || "09:00"}`).toISOString());
  };
  return (
    <div className="grid grid-cols-[1fr_120px] gap-2">
      <DateInput value={datePart} onChange={(x) => emit(x, timePart)} clearable invalid={invalid} />
      <TimeInput value={timePart} onChange={(x) => emit(datePart, x)} invalid={invalid} />
    </div>
  );
}

export function lookupLoader(kind: string) {
  return async (q: string): Promise<SelectOption<number>[]> => {
    const rows = await api.get<{ value: number; label: string; hint?: string | null }[]>(`/custom-forms/lookups/${kind}?q=${encodeURIComponent(q)}`);
    return rows.map((r) => ({ value: r.value, label: r.label, description: r.hint ?? undefined }));
  };
}

function LookupControl({ kind, multiple, value, onChange, labels, invalid }: {
  kind: string; multiple: boolean; value: unknown; onChange: (v: unknown) => void; labels: Labels; invalid?: boolean;
}) {
  const load = useMemo(() => lookupLoader(kind), [kind]);
  if (multiple) {
    const ids = Array.isArray(value) ? (value as number[]) : [];
    return <MultiSelect<number> loadOptions={load} value={ids} onChange={(x) => onChange(x)} invalid={invalid}
      selectedOptions={ids.map((i) => ({ value: i, label: labels[`${kind}:${i}`] ?? `#${i}` }))} />;
  }
  const id = value === null || value === undefined || value === "" ? null : Number(value);
  return <Select<number> loadOptions={load} value={id} onChange={(x) => onChange(x)} clearable invalid={invalid}
    selectedOption={id !== null ? { value: id, label: labels[`${kind}:${id}`] ?? `#${id}` } : null} placeholder="Search…" />;
}

function FileControl({ f, value, onChange, files }: { f: FormField; value: unknown; onChange: (v: unknown) => void; files?: FileRef[] }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const current = (Array.isArray(value) ? value : []) as (FileRef | string)[];
  const refs: FileRef[] = current.map((x) => (typeof x === "string" ? { uuid: x, name: "File" } : x));
  const withLinks = refs.map((r) => files?.find((x) => x.uuid === r.uuid) ?? r);
  const max = f.max_files ?? 1;
  const accept = f.accept === "images" ? "image/*" : f.accept === "documents" ? ".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,image/*" : undefined;
  async function add(list: File[]) {
    if (!list.length) return;
    setBusy(true);
    try {
      const up: FileRef[] = [];
      for (const file of list.slice(0, Math.max(0, max - refs.length))) up.push(await uploadFile(file));
      onChange([...refs, ...up]);
    } catch (e) { toast.error("Couldn't upload", { description: e instanceof Error ? e.message : undefined }); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-2">
      {withLinks.map((r) => (
        <div key={r.uuid} className="flex items-center gap-2.5 rounded-lg border border-line px-3 py-2 text-[13.5px]">
          <FileText size={16} strokeWidth={STROKE} className="shrink-0 text-muted" />
          {r.url ? <a href={fileHref(r.url)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-ink hover:underline">{r.name}</a>
            : <span className="min-w-0 flex-1 truncate text-ink">{r.name}</span>}
          {r.size ? <span className="text-[12px] text-faint">{formatBytes(r.size)}</span> : null}
          <IconButton icon={X} label="Remove file" size="sm" onClick={() => onChange(refs.filter((x) => x.uuid !== r.uuid))} />
        </div>
      ))}
      {refs.length < max && (
        <FileDrop value={[]} onChange={add} accept={accept} multiple={max - refs.length > 1} maxFiles={max - refs.length} maxSizeMb={10}
          disabled={busy} title={busy ? "Uploading…" : undefined}
          hint={f.accept === "images" ? "JPG or PNG, up to 10 MB" : f.accept === "documents" ? "PDF, Word, Excel or images, up to 10 MB" : "Up to 10 MB"} />
      )}
    </div>
  );
}

function TableControl({ code, f, value, onChange, labels, error, computedRows }: {
  code: string; f: FormField; value: Values[]; onChange: (v: unknown) => void; labels: Labels; error?: string; computedRows?: Values[];
}) {
  const cols = f.columns ?? [];
  const rows = value.length ? value : [];
  const max = f.max_rows ?? 20;
  const setCell = (i: number, key: string, v: unknown) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  return (
    <Field label={f.label} hint={f.help} error={error} required={f.required}>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[520px] text-[13.5px]">
          <thead>
            <tr className="border-b border-line bg-sunken/50 text-left text-[12px] text-muted">
              {cols.map((c) => <th key={c.key} className="px-3 py-2 font-normal">{c.label}{c.required && <span className="text-rose-500"> *</span>}</th>)}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-line/70 last:border-0 align-top">
                {cols.map((c) => (
                  <td key={c.key} className="px-2 py-1.5">
                    {c.type === "formula"
                      ? <div className="flex h-10 items-center px-1 text-ink/90">{displayValue(c, computedRows?.[i]?.[c.key], labels) || <span className="text-faint">—</span>}</div>
                      : c.type === "boolean"
                        ? <div className="flex h-10 items-center"><Toggle size="sm" checked={!!r[c.key]} onChange={(x) => setCell(i, c.key, x)} aria-label={c.label} /></div>
                        : <Control code={code} f={c} value={r[c.key]} onChange={(v) => setCell(i, c.key, v)} labels={labels} />}
                  </td>
                ))}
                <td className="px-1 py-1.5"><IconButton icon={Trash2} label="Remove row" size="sm" onClick={() => onChange(rows.filter((_, j) => j !== i))} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={cols.length + 1} className="px-3 py-4 text-center text-[13px] text-faint">No rows yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {rows.length < max && (
        <button type="button" onClick={() => onChange([...rows, {}])} className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-primary hover:underline">
          <Plus size={14} strokeWidth={STROKE} /> Add a row
        </button>
      )}
    </Field>
  );
}

/* ── reading ──────────────────────────────────────────────────────── */

function ReadValue({ f, value, labels, files }: { f: FormField; value: unknown; labels: Labels; files?: FileRef[] }) {
  if (isEmpty(value)) return <span className="text-faint">—</span>;
  if (f.type === "file") {
    const list = files ?? (value as FileRef[]);
    return (
      <span className="flex flex-col gap-1">
        {list.map((x) => x.url
          ? <a key={x.uuid} href={fileHref(x.url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline"><Download size={14} strokeWidth={STROKE} />{x.name}</a>
          : <span key={x.uuid}>{x.name}</span>)}
      </span>
    );
  }
  if (f.type === "table") {
    const rows = (value as Values[]) ?? [];
    const cols = f.columns ?? [];
    return (
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[12px] text-faint">{cols.map((c) => <th key={c.key} className="px-1 pb-1 font-normal">{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line/70">
                {cols.map((c) => <td key={c.key} className="px-1 py-1">{displayValue(c, r[c.key], labels) || "—"}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (f.type === "textarea") return <span className="whitespace-pre-wrap">{String(value)}</span>;
  if (f.type === "url") return <a href={String(value)} target="_blank" rel="noreferrer" className="text-primary hover:underline">{String(value)}</a>;
  return <>{displayValue(f, value, labels)}</>;
}

/** Read-only view of a record's values, laid out like the form (sections as headings). */
export function ValuesView({ definition, values, labels = {}, files }: { definition: Definition; values: Values; labels?: Labels; files?: Record<string, FileRef[]> }) {
  const blocks: ReactNode[] = [];
  let items: ReactNode[] = [];
  let heading: FormField | null = null;
  const flush = () => {
    if (items.length) {
      blocks.push(
        <div key={`b${blocks.length}`}>
          {heading && <h3 className="mb-2 text-[12px] uppercase tracking-[0.06em] text-faint">{heading.label}</h3>}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">{items}</dl>
        </div>,
      );
    }
    items = [];
  };
  for (const f of definition.fields) {
    if (f.type === "section") { flush(); heading = f; continue; }
    if (isEmpty(values[f.key]) && f.type !== "boolean") continue;
    const wide = f.type === "table" || f.type === "textarea" || f.width !== "half";
    items.push(
      <div key={f.key} className={wide ? "sm:col-span-2" : ""}>
        <dt className="text-[12px] text-faint">{f.label}</dt>
        <dd className="mt-0.5 text-[14px] text-ink/90"><ReadValue f={f} value={values[f.key]} labels={labels} files={files?.[f.key]} /></dd>
      </div>,
    );
  }
  flush();
  if (!blocks.length) return <p className="text-[13.5px] text-faint">Nothing filled in.</p>;
  return <div className="space-y-6">{blocks}</div>;
}

/** Turn file values into the uuids the API takes, and drop empty table rows. */
export function toPayload(definition: Definition, values: Values): Values {
  const out: Values = {};
  for (const f of definition.fields) {
    if (f.type === "section" || f.type === "formula" || f.access === "view") continue;
    if (!(f.key in values)) continue;
    const v = values[f.key];
    if (f.type === "file") out[f.key] = Array.isArray(v) ? (v as (FileRef | string)[]).map((x) => (typeof x === "string" ? x : x.uuid)) : [];
    else if (f.type === "table") out[f.key] = Array.isArray(v) ? (v as Values[]).filter((r) => Object.values(r).some((x) => !isEmpty(x))) : [];
    else out[f.key] = v;
  }
  return out;
}

export function useOnce<T>(value: T) {
  const ref = useRef(value);
  return ref.current;
}
