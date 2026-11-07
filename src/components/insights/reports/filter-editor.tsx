"use client";

/*
 * Filter rows for reports: field, condition (only the ones that make sense for the field's
 * type) and a value input that matches the type. Used by the builder and the viewer's
 * quick filter.
 */
import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton, MultiSelect, NumberInput, Select, TextInput } from "@/components/ui-kit";
import { DateOrRelative } from "./result-view";
import { isDateType, isNumeric, type Filter, type ReportsMeta, type SourceField } from "./types";

const NO_VALUE = new Set(["empty", "not_empty", "is_true", "is_false", "this_month", "last_month", "this_quarter", "this_year", "this_fy"]);
const DATE_LABELS: Record<string, string> = { eq: "on", ne: "not on", gt: "after", gte: "on or after", lt: "before", lte: "on or before" };

export function opsFor(field: SourceField | undefined, meta: ReportsMeta): { value: string; label: string }[] {
  const label = (v: string) => (field && isDateType(field.type) && DATE_LABELS[v]) || meta.ops.find((o) => o.value === v)?.label || v;
  let keys: string[];
  if (!field) keys = ["eq"];
  else if (isDateType(field.type)) keys = ["this_month", "last_month", "this_quarter", "this_year", "this_fy", "last_n_days", "next_n_days", "eq", "ne", "gt", "gte", "lt", "lte", "between", "empty", "not_empty"];
  else if (field.type === "bool") keys = ["is_true", "is_false"];
  else if (isNumeric(field.type)) keys = ["eq", "ne", "gt", "gte", "lt", "lte", "between", "in", "not_in", "empty", "not_empty"];
  else if (field.type === "enum" || field.options?.length) keys = ["eq", "ne", "in", "not_in", "empty", "not_empty"];
  else keys = ["contains", "eq", "ne", "starts", "in", "not_in", "empty", "not_empty"];
  return keys.map((v) => ({ value: v, label: label(v) }));
}

function defaultValue(field: SourceField | undefined, op: string): unknown {
  if (NO_VALUE.has(op)) return null;
  if (op === "last_n_days" || op === "next_n_days") return 30;
  if (op === "in" || op === "not_in") return [];
  if (op === "between") return ["", ""];
  return field && isNumeric(field.type) ? null : "";
}

export function newFilter(field: SourceField | undefined, meta: ReportsMeta): Filter {
  const op = opsFor(field, meta)[0]?.value ?? "eq";
  return { field: field?.key ?? "", op, value: defaultValue(field, op) };
}

function ValueInput({ field, filter, onChange }: { field: SourceField | undefined; filter: Filter; onChange: (v: unknown) => void }) {
  const { op, value } = filter;
  if (!field || NO_VALUE.has(op)) return <div className="hidden sm:block" />;
  const opts = field.options ?? [];
  if (op === "last_n_days" || op === "next_n_days") {
    return <NumberInput value={typeof value === "number" ? value : Number(value) || null} onChange={(n) => onChange(n)} min={1} suffix="days" />;
  }
  if (op === "in" || op === "not_in") {
    const arr = Array.isArray(value) ? value : value === null || value === undefined || value === "" ? [] : [value];
    if (opts.length) {
      return <MultiSelect<string | number> value={arr as (string | number)[]} onChange={(v) => onChange(v)} options={opts} placeholder="Choose values" />;
    }
    return <TextInput value={arr.join(", ")} placeholder="Values, separated by commas"
      onValueChange={(t) => onChange(t.split(",").map((s) => s.trim()).filter(Boolean))} />;
  }
  if (op === "between") {
    const [lo, hi] = Array.isArray(value) ? value : ["", ""];
    if (isDateType(field.type)) {
      return (
        <div className="grid grid-cols-2 gap-2">
          <DateOrRelative value={lo} onChange={(v) => onChange([v, hi])} placeholder="From" />
          <DateOrRelative value={hi} onChange={(v) => onChange([lo, v])} placeholder="To" />
        </div>
      );
    }
    const num = (x: unknown) => (x === "" || x === null || x === undefined ? null : Number(x));
    return (
      <div className="grid grid-cols-2 gap-2">
        <NumberInput value={num(lo)} onChange={(n) => onChange([n ?? "", hi])} placeholder="From" />
        <NumberInput value={num(hi)} onChange={(n) => onChange([lo, n ?? ""])} placeholder="To" />
      </div>
    );
  }
  if (isDateType(field.type)) return <DateOrRelative value={value} onChange={onChange} />;
  if (isNumeric(field.type)) {
    return <NumberInput value={value === "" || value === null || value === undefined ? null : Number(value)} onChange={onChange} />;
  }
  if (opts.length) {
    return <Select<string | number> value={(value as string | number | null) ?? null} onChange={(v) => onChange(v ?? "")} options={opts} placeholder="Choose a value" />;
  }
  return <TextInput value={value === null || value === undefined ? "" : String(value)} onValueChange={onChange} placeholder="Value" />;
}

export function FilterRow({ filter, fields, meta, onChange, onRemove }: {
  filter: Filter; fields: SourceField[]; meta: ReportsMeta; onChange: (f: Filter) => void; onRemove?: () => void;
}) {
  const field = fields.find((f) => f.key === filter.field);
  const ops = opsFor(field, meta);
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_auto] sm:items-start">
      <Select value={filter.field || null} aria-label="Field"
        options={fields.map((f) => ({ value: f.key, label: f.label }))}
        onChange={(k) => {
          const nf = fields.find((f) => f.key === k);
          onChange(newFilter(nf, meta));
        }} placeholder="Field" />
      <Select value={filter.op} aria-label="Condition" options={ops}
        onChange={(op) => op && onChange({ ...filter, op, value: defaultValue(field, op) })} />
      <ValueInput field={field} filter={filter} onChange={(value) => onChange({ ...filter, value })} />
      {onRemove ? <IconButton icon={Trash2} label="Remove filter" onClick={onRemove} className="mt-0.5" /> : <span />}
    </div>
  );
}

export function FiltersEditor({ filters, fields, meta, onChange }: {
  filters: Filter[]; fields: SourceField[]; meta: ReportsMeta; onChange: (f: Filter[]) => void;
}) {
  return (
    <div className="space-y-2.5">
      {filters.length === 0 && <p className="text-[13px] text-faint">No filters. Every row is included.</p>}
      {filters.map((f, i) => (
        <FilterRow key={i} filter={f} fields={fields} meta={meta}
          onChange={(nf) => onChange(filters.map((x, j) => (j === i ? nf : x)))}
          onRemove={() => onChange(filters.filter((_, j) => j !== i))} />
      ))}
      <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...filters, newFilter(fields[0], meta)])}>Add filter</Button>
    </div>
  );
}

/** A filter is complete when it has a field and, where needed, a value. */
export function filterReady(f: Filter): boolean {
  if (!f.field) return false;
  if (NO_VALUE.has(f.op)) return true;
  if (Array.isArray(f.value)) return f.op === "between" ? f.value.some((x) => x !== "" && x !== null) : f.value.length > 0;
  return f.value !== null && f.value !== undefined && f.value !== "";
}
