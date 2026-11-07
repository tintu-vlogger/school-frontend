"use client";

/*
 * Service editor for admins: the drag-and-drop form designer, the service settings
 * (who may use it, who handles it, approval, statuses, menu, numbering) and form versions.
 *
 *   <ServiceEditor code="training_request" meta={meta} onClose onSaved />
 *
 * Drag a field type from the left onto the form (or click it to add at the end), drag
 * fields to reorder, click one to set its properties on the right. Saving the form makes a
 * new version; records keep the version they were filled in.
 */
import { useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  AlignLeft, ArrowDown, ArrowUp, AtSign, Building2, Calculator, Calendar, CalendarClock, CheckSquare, Clock,
  Copy, GripVertical, Hash, Heading, IndianRupee, Link2, List, ListChecks, MapPin, Percent, Phone, Plus, Sigma,
  Table2, ToggleLeft, Trash2, Type, Upload, UserRound, Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/datetime";
import {
  Badge, Button, Checkbox, Field, FormGrid, FormSection, IconButton, Modal, ModalCancel, MultiSelect, NumberInput,
  Select, Skeleton, Tabs, TextInput, Textarea, Toggle, useToast, type SelectOption,
} from "@/components/ui-kit";
import { lookupLoader } from "./form-renderer";
import { SERVICE_ICONS, serviceIcon } from "./icons";
import type { FieldType, FormField, Meta, ServiceFull, Status } from "./types";

const STROKE = 1.4;

export const TYPE_ICONS: Record<FieldType, LucideIcon> = {
  text: Type, textarea: AlignLeft, number: Hash, decimal: Percent, currency: IndianRupee, date: Calendar,
  datetime: CalendarClock, time: Clock, boolean: ToggleLeft, single_choice: List, multi_choice: ListChecks,
  master: CheckSquare, employee: UserRound, department: Building2, location: MapPin, file: Upload, email: AtSign,
  phone: Phone, url: Link2, formula: Sigma, section: Heading, table: Table2,
};

type Draft = FormField & { _id: string; _saved?: boolean };

let seq = 0;
const nid = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;

function slug(label: string) {
  let s = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!s || !/^[a-z]/.test(s)) s = `f_${s || "field"}`;
  return s.slice(0, 40);
}

function newField(type: FieldType, label: string, taken: Set<string>): Draft {
  let key = slug(label);
  for (let i = 2; taken.has(key); i++) key = `${slug(label).slice(0, 36)}_${i}`;
  const f: Draft = { _id: nid(), key, type, label };
  if (type === "single_choice" || type === "multi_choice") f.options = ["Option 1", "Option 2"];
  if (type === "single_choice") f.display = "dropdown";
  if (type === "master") f.master = "blood_group";
  if (type === "formula") { f.formula = ""; f.result = "number"; }
  if (type === "table") { f.columns = [{ key: "item", type: "text", label: "Item", required: true }]; f.max_rows = 20; f.min_rows = 0; }
  if (type === "file") { f.accept = "any"; f.max_files = 1; }
  return f;
}

function clean(fields: Draft[]): FormField[] {
  return fields.map(({ _id, _saved, access, ...f }) => { void _id; void _saved; void access; return f; });
}

function errText(e: unknown) { return e instanceof Error ? e.message : "Something went wrong"; }

/* ── The editor modal ─────────────────────────────────────────────── */

export function ServiceEditor({ code, meta, onClose, onSaved, initialTab = "form" }: {
  code: string; meta: Meta; onClose: () => void; onSaved: () => void; initialTab?: "form" | "settings" | "versions";
}) {
  const [svc, setSvc] = useState<ServiceFull | null>(null);
  const [tab, setTab] = useState(initialTab);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { api.get<ServiceFull>(`/custom-forms/services/${code}`).then(setSvc).catch(() => onClose()); }, [code, onClose]);
  const Icon = serviceIcon(svc?.icon);
  return (
    <Modal open onClose={onClose} size="full" dirty={dirty}
      leading={<span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary"><Icon size={18} strokeWidth={STROKE} /></span>}
      title={svc?.name ?? "Service"} description={svc ? `Form version ${svc.version} · ${svc.records} record${svc.records === 1 ? "" : "s"}` : undefined}
      headerActions={svc ? <Badge tone={svc.archived ? "neutral" : svc.active ? "good" : "neutral"}>{svc.archived ? "Archived" : svc.active ? "In use" : "Off"}</Badge> : undefined}>
      {!svc ? <div className="space-y-3"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-64" /></div> : (
        <>
          <Tabs value={tab} onChange={(t) => setTab(t)} className="mb-5" items={[
            { value: "form", label: "Form" }, { value: "settings", label: "Settings" }, { value: "versions", label: "Versions", count: svc.version },
          ]} />
          {tab === "form" && <FormDesigner svc={svc} meta={meta} onDirty={setDirty} onSaved={(s) => { setSvc(s); setDirty(false); onSaved(); }} />}
          {tab === "settings" && <ServiceSettings svc={svc} meta={meta} onDirty={setDirty} onSaved={(s) => { setSvc(s); setDirty(false); onSaved(); }} />}
          {tab === "versions" && <Versions code={svc.code} />}
        </>
      )}
    </Modal>
  );
}

/* ── Designer ─────────────────────────────────────────────────────── */

function FormDesigner({ svc, meta, onDirty, onSaved }: { svc: ServiceFull; meta: Meta; onDirty: (d: boolean) => void; onSaved: (s: ServiceFull) => void }) {
  const toast = useToast();
  const [fields, setFields] = useState<Draft[]>(() => svc.definition.fields.map((f) => ({ ...f, _id: nid(), _saved: true })));
  const [sel, setSel] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState<number | null>(null);
  const [masters, setMasters] = useState<SelectOption[]>([]);
  useEffect(() => {
    api.get<{ key: string; name: string }[]>("/masters/types").then((r) => setMasters(r.map((t) => ({ value: t.key, label: t.name })))).catch(() => {});
  }, []);

  const update = (next: Draft[]) => { setFields(next); onDirty(true); setError(""); };
  const taken = useMemo(() => new Set(fields.map((f) => f.key)), [fields]);
  const label = (t: FieldType) => meta.field_types.find((x) => x.value === t)?.label ?? t;

  function insert(type: FieldType, at: number) {
    const f = newField(type, type === "section" ? "New section" : label(type), taken);
    const next = [...fields];
    next.splice(at, 0, f);
    update(next);
    setSel(f._id);
  }
  function move(from: number, to: number) {
    if (from === to || from + 1 === to) return;
    const next = [...fields];
    const [x] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, x);
    update(next);
  }
  function onDrop(e: DragEvent, at: number) {
    e.preventDefault();
    setOver(null);
    const data = e.dataTransfer.getData("text/plain");
    if (data.startsWith("new:")) insert(data.slice(4) as FieldType, at);
    else if (data.startsWith("move:")) move(Number(data.slice(5)), at);
  }
  async function save() {
    setBusy(true); setError("");
    try {
      const s = await api.put<ServiceFull>(`/custom-forms/services/${svc.code}/form`, { fields: clean(fields), change_note: note || null });
      toast.success(s.version !== svc.version ? `Saved as version ${s.version}` : "No changes to save");
      setFields(s.definition.fields.map((f) => ({ ...f, _id: nid(), _saved: true })));
      setNote("");
      onSaved(s);
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }

  const selected = fields.find((f) => f._id === sel) ?? null;
  const keys = fields.filter((f) => f.type !== "section").map((f) => f.key);

  return (
    <div className="grid gap-5 lg:grid-cols-[210px_minmax(0,1fr)_330px]">
      {/* palette */}
      <aside className="space-y-4">
        {meta.field_groups.map((g) => (
          <div key={g.label}>
            <p className="mb-1.5 text-[11.5px] uppercase tracking-[0.06em] text-faint">{g.label}</p>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
              {g.types.map((t) => {
                const I = TYPE_ICONS[t];
                return (
                  <button key={t} type="button" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", `new:${t}`)}
                    onClick={() => insert(t, fields.length)} title="Drag onto the form, or click to add at the end"
                    className="flex cursor-grab items-center gap-2 rounded-lg border border-line bg-surface px-2.5 py-1 text-left text-[13px] text-ink/90 hover:border-primary/40 hover:bg-primary-soft/40 active:cursor-grabbing">
                    <I size={15} strokeWidth={STROKE} className="shrink-0 text-muted" />{label(t)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      {/* canvas */}
      <section className="min-w-0">
        <div className="grid grid-cols-2 gap-x-2 rounded-xl border border-line bg-sunken/30 p-3"
          onDragOver={(e) => { e.preventDefault(); if (!fields.length) setOver(0); }} onDrop={(e) => onDrop(e, fields.length)}>
          {fields.length === 0 && (
            <div className={`col-span-2 grid place-items-center rounded-lg border border-dashed py-16 text-[13.5px] text-faint ${over === 0 ? "border-primary bg-primary-soft/40" : "border-line"}`}>
              Drag fields here to build the form
            </div>
          )}
          {fields.map((f, i) => {
            const I = TYPE_ICONS[f.type];
            const active = f._id === sel;
            return (
              <div key={f._id} className={f.width === "half" && f.type !== "section" && f.type !== "table" ? "col-span-2 lg:col-span-1" : "col-span-2"}>
                <DropLine on={over === i} onOver={() => setOver(i)} onDrop={(e) => onDrop(e, i)} />
                <div draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", `move:${i}`)} onDragEnd={() => setOver(null)}
                  onClick={() => setSel(f._id)}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setOver(e.clientY < r.top + r.height / 2 ? i : i + 1); }}
                  onDrop={(e) => { e.stopPropagation(); onDrop(e, over ?? i); }}
                  className={`group flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 ${f.type === "section" ? "mt-2 bg-transparent" : "bg-surface"} ${active ? "border-primary ring-2 ring-primary/15" : "border-line hover:border-line-strong"}`}>
                  <GripVertical size={16} strokeWidth={STROKE} className="mt-0.5 shrink-0 cursor-grab text-faint" />
                  <I size={16} strokeWidth={STROKE} className="mt-0.5 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate ${f.type === "section" ? "text-[12.5px] uppercase tracking-[0.06em] text-muted" : "text-[14px] text-ink"}`}>
                      {f.label}{f.required && <span className="text-rose-500"> *</span>}
                    </p>
                    <p className="truncate text-[12px] text-faint">
                      {label(f.type)}{f.type !== "section" && ` · ${f.key}`}
                      {f.show_if && " · shown when …"}{f.formula && ` · = ${f.formula}`}
                      {f.permissions && Object.keys(f.permissions).length > 0 && " · access set"}
                      {f.columns && ` · ${f.columns.length} column${f.columns.length === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <span className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <IconButton icon={Copy} label="Duplicate" size="sm" onClick={(e) => { e.stopPropagation(); const c = { ...f, _id: nid(), _saved: false, key: newField(f.type, f.label, taken).key, label: `${f.label} (copy)` }; const n = [...fields]; n.splice(i + 1, 0, c); update(n); setSel(c._id); }} />
                    <IconButton icon={Trash2} label="Remove" size="sm" onClick={(e) => { e.stopPropagation(); update(fields.filter((x) => x._id !== f._id)); if (active) setSel(null); }} />
                  </span>
                </div>
              </div>
            );
          })}
          {fields.length > 0 && <div className="col-span-2"><DropLine on={over === fields.length} onOver={() => setOver(fields.length)} onDrop={(e) => onDrop(e, fields.length)} /></div>}
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="What changed" hint="Optional, kept with this version." className="min-w-[240px] flex-1">
            <TextInput value={note} onValueChange={setNote} maxLength={300} placeholder="e.g. Added travel cost" />
          </Field>
          <Button variant="primary" onClick={save} loading={busy}>Save form</Button>
        </div>
        {error && <p className="mt-2 text-[13px] text-rose-600">{error}</p>}
        <p className="mt-2 text-[12.5px] text-faint">Saving creates a new version. Records already sent keep the version they were filled in.</p>
      </section>

      {/* properties */}
      <aside className="lg:sticky lg:top-0 lg:self-start">
        {selected ? (
          <FieldProperties key={selected._id} f={selected} meta={meta} masters={masters} keys={keys}
            onChange={(nf) => update(fields.map((x) => (x._id === nf._id ? nf : x)))} />
        ) : (
          <div className="rounded-xl border border-dashed border-line p-5 text-[13.5px] text-muted">
            Click a field to set its label, rules, condition and who may see or change it.
          </div>
        )}
      </aside>
    </div>
  );
}

function DropLine({ on, onOver, onDrop }: { on: boolean; onOver: () => void; onDrop: (e: DragEvent) => void }) {
  return (
    <div onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onOver(); }} onDrop={(e) => { e.stopPropagation(); onDrop(e); }}
      className={`transition-all ${on ? "my-1 h-1.5 rounded-full bg-primary" : "h-1.5"}`} />
  );
}

/* ── Field properties ─────────────────────────────────────────────── */

const ACCESS_OPTIONS = [{ value: "edit", label: "Can edit" }, { value: "view", label: "View only" }, { value: "hidden", label: "Hidden" }];

function FieldProperties({ f, meta, masters, keys, onChange, inTable }: {
  f: Draft; meta: Meta; masters: SelectOption[]; keys: string[]; onChange: (f: Draft) => void; inTable?: boolean;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    const next = { ...f, [k]: v } as Draft;
    if (v === undefined || v === "" || v === null) delete (next as Record<string, unknown>)[k as string];
    onChange(next);
  };
  const t = f.type;
  const numeric = t === "number" || t === "decimal" || t === "currency";
  const texty = t === "text" || t === "textarea" || t === "email" || t === "phone" || t === "url";
  const choice = t === "single_choice" || t === "multi_choice";
  const lookup = t === "master" || t === "employee" || t === "department" || t === "location";
  const others = keys.filter((k) => k !== f.key);
  return (
    <div className="space-y-4 rounded-xl border border-line p-4">
      <p className="text-[12px] uppercase tracking-[0.06em] text-faint">{meta.field_types.find((x) => x.value === t)?.label}</p>
      <Field label={t === "section" ? "Heading" : "Label"} required>
        <TextInput value={f.label} maxLength={120} onValueChange={(x) => onChange({ ...f, label: x, ...(!f._saved && t !== "section" ? { key: slug(x || "field") } : {}) })} />
      </Field>
      {t !== "section" && (
        <Field label="Field name" hint={f._saved ? "Used in conditions and formulas. It can't change once saved." : "Used in conditions and formulas."}>
          <TextInput value={f.key} disabled={f._saved} onValueChange={(x) => set("key", x.toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 40))} />
        </Field>
      )}
      <Field label={t === "section" ? "Description" : "Help text"}><Textarea value={f.help ?? ""} rows={2} autoGrow onValueChange={(x) => set("help", x)} /></Field>

      {t !== "section" && t !== "formula" && t !== "table" && !inTable && (
        <Field label="Placeholder"><TextInput value={f.placeholder ?? ""} maxLength={120} onValueChange={(x) => set("placeholder", x)} /></Field>
      )}
      {t !== "section" && t !== "formula" && (
        <div className="space-y-2">
          <Toggle size="sm" checked={!!f.required} onChange={(x) => set("required", x || undefined)} label="Required" />
          {!inTable && meta.unique_types.includes(t) && <Toggle size="sm" checked={!!f.unique} onChange={(x) => set("unique", x || undefined)} label="Must be different on every record" />}
          {!inTable && <Toggle size="sm" checked={!!f.summary} onChange={(x) => set("summary", x || undefined)} label="Show as a column in lists" />}
        </div>
      )}
      {t !== "section" && t !== "table" && !inTable && (
        <Field label="Width">
          <Select value={f.width ?? "full"} onChange={(x) => set("width", x === "half" ? "half" : undefined)} options={[{ value: "full", label: "Full width" }, { value: "half", label: "Half width" }]} />
        </Field>
      )}

      {choice && (
        <Field label="Options" hint="One per line.">
          <Textarea rows={4} autoGrow value={(f.options ?? []).join("\n")} onValueChange={(x) => set("options", x.split("\n"))} />
        </Field>
      )}
      {t === "single_choice" && !inTable && (
        <Field label="Show as"><Select value={f.display ?? "dropdown"} onChange={(x) => set("display", (x ?? "dropdown") as Draft["display"])} options={[{ value: "dropdown", label: "Dropdown" }, { value: "radio", label: "Buttons" }]} /></Field>
      )}
      {t === "master" && (
        <Field label="Master list" required hint="Lists are kept under Settings, Masters."><Select value={f.master ?? null} onChange={(x) => set("master", x ?? undefined)} options={masters} /></Field>
      )}
      {lookup && !inTable && <Toggle size="sm" checked={!!f.multiple} onChange={(x) => set("multiple", x || undefined)} label="Allow several" />}
      {numeric && (
        <FormGrid columns={2}>
          <Field label="Smallest"><NumberInput value={f.min ?? null} onChange={(x) => set("min", x ?? undefined)} step={t === "number" ? 1 : 0.01} /></Field>
          <Field label="Largest"><NumberInput value={f.max ?? null} onChange={(x) => set("max", x ?? undefined)} step={t === "number" ? 1 : 0.01} /></Field>
        </FormGrid>
      )}
      {t === "decimal" && <Field label="Decimal places"><NumberInput value={f.decimals ?? 2} min={0} max={6} onChange={(x) => set("decimals", x ?? undefined)} /></Field>}
      {texty && (
        <FormGrid columns={2}>
          <Field label="Shortest"><NumberInput value={f.min_length ?? null} min={0} onChange={(x) => set("min_length", x ?? undefined)} /></Field>
          <Field label="Longest"><NumberInput value={f.max_length ?? null} min={1} onChange={(x) => set("max_length", x ?? undefined)} /></Field>
        </FormGrid>
      )}
      {t === "file" && (
        <FormGrid columns={2}>
          <Field label="Accept"><Select value={f.accept ?? "any"} onChange={(x) => set("accept", (x ?? "any") as Draft["accept"])} options={[{ value: "any", label: "Any file" }, { value: "images", label: "Images" }, { value: "documents", label: "Documents" }]} /></Field>
          <Field label="Most files"><NumberInput value={f.max_files ?? 1} min={1} max={10} onChange={(x) => set("max_files", x ?? 1)} /></Field>
        </FormGrid>
      )}
      {t === "formula" && (
        <>
          <ExpressionField label="Formula" value={f.formula ?? ""} onChange={(x) => set("formula", x)} fields={others} hint="e.g. coalesce(fee, 0) + coalesce(travel_cost, 0), days_between(start_date, end_date) + 1, items.amount for a table's total." />
          <FormGrid columns={2}>
            <Field label="Result"><Select value={f.result ?? "number"} onChange={(x) => set("result", (x ?? "number") as Draft["result"])} options={meta.formula_results} /></Field>
            {(f.result ?? "number") === "number" && <Field label="Decimals"><NumberInput value={f.decimals ?? 2} min={0} max={6} onChange={(x) => set("decimals", x ?? undefined)} /></Field>}
          </FormGrid>
        </>
      )}
      {t !== "section" && t !== "formula" && t !== "table" && t !== "file" && (
        <Field label="Starting value" hint={t === "date" ? "A date, or “today”." : t === "employee" ? "“me” fills in the person filling the form." : t === "department" || t === "location" ? "“my” fills in their own." : undefined}>
          <TextInput value={f.default === undefined || f.default === null ? "" : String(f.default)} onValueChange={(x) => set("default", x === "" ? undefined : (t === "boolean" ? x === "true" || x === "yes" : x))} />
        </Field>
      )}
      {!inTable && (
        <ExpressionField label="Show only when" value={f.show_if ?? ""} onChange={(x) => set("show_if", x || undefined)} fields={others}
          hint={t === "section" ? "Hides the whole section. e.g. travel_needed == true" : "Leave empty to always show. e.g. training_type != 'Internal'"} />
      )}
      {t === "table" && <TableColumns f={f} meta={meta} masters={masters} onChange={onChange} />}
      {t !== "section" && !inTable && (
        <div>
          <p className="mb-2 text-[13px] text-ink">Who may see or change it</p>
          <div className="space-y-1.5">
            {meta.roles.map((r) => (
              <div key={r.value} className="flex items-center justify-between gap-3">
                <span className="truncate text-[13px] text-muted">{r.label}</span>
                <Select className="w-36" value={f.permissions?.[r.value] ?? "edit"} options={ACCESS_OPTIONS}
                  onChange={(x) => {
                    const p = { ...(f.permissions ?? {}) };
                    if (!x || x === "edit") delete p[r.value]; else p[r.value] = x as "view" | "hidden";
                    set("permissions", Object.keys(p).length ? p : undefined);
                  }} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-faint">The company owner can always see and change every field.</p>
        </div>
      )}
    </div>
  );
}

function ExpressionField({ label, value, onChange, fields, hint }: { label: string; value: string; onChange: (v: string) => void; fields: string[]; hint?: string }) {
  const [check, setCheck] = useState<{ ok: boolean; message?: string } | null>(null);
  const known = fields.join(",");
  useEffect(() => {
    if (!value.trim()) { setCheck(null); return; }
    const t = setTimeout(() => {
      api.post<{ ok: boolean; message?: string }>("/custom-forms/check-expression", { expression: value, fields: known.split(",") }).then(setCheck).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [value, known]);
  return (
    <Field label={label} hint={hint} error={check && !check.ok ? check.message : undefined}>
      <Textarea rows={2} autoGrow value={value} onValueChange={onChange} className="font-mono text-[13px]" spellCheck={false} />
    </Field>
  );
}

function TableColumns({ f, meta, masters, onChange }: { f: Draft; meta: Meta; masters: SelectOption[]; onChange: (f: Draft) => void }) {
  const cols = (f.columns ?? []) as Draft[];
  const [open, setOpen] = useState<number | null>(null);
  const setCols = (next: FormField[]) => onChange({ ...f, columns: next });
  const taken = new Set(cols.map((c) => c.key));
  const typeOptions = meta.field_types.filter((x) => meta.table_column_types.includes(x.value)).map((x) => ({ value: x.value, label: x.label }));
  return (
    <div className="space-y-3">
      <FormGrid columns={2}>
        <Field label="Fewest rows"><NumberInput value={f.min_rows ?? 0} min={0} max={100} onChange={(x) => onChange({ ...f, min_rows: x ?? 0 })} /></Field>
        <Field label="Most rows"><NumberInput value={f.max_rows ?? 20} min={1} max={100} onChange={(x) => onChange({ ...f, max_rows: x ?? 20 })} /></Field>
      </FormGrid>
      <p className="text-[13px] text-ink">Columns</p>
      {cols.map((c, i) => (
        <div key={i} className="rounded-lg border border-line">
          <div className="flex items-center gap-2 px-2.5 py-2">
            <button type="button" className="min-w-0 flex-1 truncate text-left text-[13px] text-ink" onClick={() => setOpen(open === i ? null : i)}>
              {c.label} <span className="text-faint">· {meta.field_types.find((x) => x.value === c.type)?.label}</span>
            </button>
            <IconButton icon={ArrowUp} label="Move up" size="sm" disabled={i === 0} onClick={() => { const n = [...cols]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; setCols(n); }} />
            <IconButton icon={ArrowDown} label="Move down" size="sm" disabled={i === cols.length - 1} onClick={() => { const n = [...cols]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; setCols(n); }} />
            <IconButton icon={Trash2} label="Remove column" size="sm" onClick={() => setCols(cols.filter((_, j) => j !== i))} />
          </div>
          {open === i && (
            <div className="border-t border-line p-2.5">
              <FieldProperties f={{ ...c, _id: `c${i}` }} meta={meta} masters={masters} inTable keys={cols.map((x) => x.key)}
                onChange={(nc) => { const { _id, _saved, ...rest } = nc; void _id; void _saved; setCols(cols.map((x, j) => (j === i ? rest : x))); }} />
            </div>
          )}
        </div>
      ))}
      <Select<string> placeholder="Add a column…" value={null} options={typeOptions}
        onChange={(x) => { if (!x) return; const nc = newField(x as FieldType, typeOptions.find((o) => o.value === x)?.label ?? "Column", taken); const { _id, ...rest } = nc; void _id; setCols([...cols, rest]); setOpen(cols.length); }} />
      <p className="text-[12px] text-faint">A formula column works on its own row, e.g. qty * price. Use the table name in a formula field for totals: {f.key}.amount, {f.key}.count.</p>
    </div>
  );
}

/* ── Settings ─────────────────────────────────────────────────────── */

const TONE_OPTIONS = ["neutral", "info", "accent", "warn", "good", "bad"].map((t) => ({ value: t, label: ({ neutral: "Grey", info: "Blue", accent: "Indigo", warn: "Amber", good: "Green", bad: "Red" } as Record<string, string>)[t] }));

function ServiceSettings({ svc, meta, onDirty, onSaved }: { svc: ServiceFull; meta: Meta; onDirty: (d: boolean) => void; onSaved: (s: ServiceFull) => void }) {
  const toast = useToast();
  const [v, setV] = useState(() => ({
    name: svc.name, description: svc.description ?? "", icon: svc.icon, nav_section: svc.nav_section, active: svc.active,
    needs_approval: svc.needs_approval, allow_drafts: svc.allow_drafts, allow_cancel: svc.allow_cancel,
    everyone: svc.submit_access.everyone !== false, roles: svc.submit_access.roles ?? [], team_ids: svc.submit_access.team_ids ?? [],
    department_ids: svc.submit_access.department_ids ?? [], location_ids: svc.submit_access.location_ids ?? [],
    manager_roles: svc.manager_roles, manager_employee_ids: svc.manager_employee_ids, statuses: svc.statuses as Status[],
    notify: { managers_on_submit: svc.notify.managers_on_submit !== false, requester_on_status: svc.notify.requester_on_status !== false, requester_on_comment: svc.notify.requester_on_comment !== false },
    title_field: svc.title_field, prefix: svc.series?.prefix ?? "", pattern: svc.series?.pattern ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => { setV((o) => ({ ...o, [k]: x })); onDirty(true); setError(""); };
  const loaders = useMemo(() => ({ employee: lookupLoader("employee"), team: lookupLoader("team"), department: lookupLoader("department"), location: lookupLoader("location") }), []);
  const fieldOptions = svc.definition.fields.filter((f) => !["section", "table", "file"].includes(f.type)).map((f) => ({ value: f.key, label: f.label }));

  async function save() {
    setBusy(true); setError("");
    try {
      const body = {
        name: v.name, description: v.description, icon: v.icon, nav_section: v.nav_section, active: v.active,
        needs_approval: v.needs_approval, allow_drafts: v.allow_drafts, allow_cancel: v.allow_cancel,
        submit_access: v.everyone ? { everyone: true } : { everyone: false, roles: v.roles, team_ids: v.team_ids, department_ids: v.department_ids, location_ids: v.location_ids },
        manager_roles: v.manager_roles, manager_employee_ids: v.manager_employee_ids, statuses: v.statuses, notify: v.notify,
        title_field: v.title_field, prefix: v.prefix, ...(v.pattern ? { pattern: v.pattern } : {}),
      };
      const s = await api.put<ServiceFull>(`/custom-forms/services/${svc.code}`, body);
      toast.success("Settings saved");
      onSaved(s);
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <FormSection title="About" description="How the service appears to people.">
        <FormGrid columns={2}>
          <Field label="Name" required><TextInput value={v.name} maxLength={50} onValueChange={(x) => set("name", x)} /></Field>
          <Field label="Shows in the menu under"><Select value={v.nav_section} onChange={(x) => set("nav_section", x ?? "home")} options={meta.nav_sections} /></Field>
        </FormGrid>
        <Field label="Description" className="mt-4"><Textarea value={v.description} maxLength={300} rows={2} autoGrow onValueChange={(x) => set("description", x)} /></Field>
        <Field label="Icon" className="mt-4">
          <div className="flex flex-wrap gap-1.5">
            {meta.icons.map((name) => {
              const I = SERVICE_ICONS[name] ?? serviceIcon(name);
              return (
                <button key={name} type="button" title={name} onClick={() => set("icon", name)}
                  className={`grid h-9 w-9 place-items-center rounded-lg border ${v.icon === name ? "border-primary bg-primary-soft text-primary" : "border-line text-muted hover:text-ink"}`}>
                  <I size={17} strokeWidth={STROKE} />
                </button>
              );
            })}
          </div>
        </Field>
        <div className="mt-4 space-y-2">
          <Toggle checked={v.active} onChange={(x) => set("active", x)} label="In use" description="When off, it leaves the menu and no new requests can be made." />
          <Toggle checked={v.allow_drafts} onChange={(x) => set("allow_drafts", x)} label="Allow saving drafts" />
          <Toggle checked={v.allow_cancel} onChange={(x) => set("allow_cancel", x)} label="Let people withdraw their request" description="While it is waiting for approval or has just started." />
        </div>
        <Field label="Record title" hint="The field whose value names each record, e.g. the visitor's name." className="mt-4">
          <Select value={v.title_field} onChange={(x) => set("title_field", x)} clearable options={fieldOptions} placeholder="Only the service name" />
        </Field>
      </FormSection>

      <FormSection title="Who may use it">
        <Toggle checked={v.everyone} onChange={(x) => set("everyone", x)} label="Everyone in the company" />
        {!v.everyone && (
          <FormGrid columns={2} className="mt-4">
            <Field label="Roles"><MultiSelect value={v.roles} onChange={(x) => set("roles", x)} options={meta.roles} /></Field>
            <Field label="Teams"><MultiSelect<number> value={v.team_ids} onChange={(x) => set("team_ids", x)} loadOptions={loaders.team} /></Field>
            <Field label="Departments"><MultiSelect<number> value={v.department_ids} onChange={(x) => set("department_ids", x)} loadOptions={loaders.department} /></Field>
            <Field label="Locations"><MultiSelect<number> value={v.location_ids} onChange={(x) => set("location_ids", x)} loadOptions={loaders.location} /></Field>
          </FormGrid>
        )}
      </FormSection>

      <FormSection title="Who handles the records" description="They see every record, fill in the fields kept for them and move the status. HR admins always can.">
        <FormGrid columns={2}>
          <Field label="Roles"><MultiSelect value={v.manager_roles} onChange={(x) => set("manager_roles", x)} options={meta.roles} /></Field>
          <Field label="People" hint="They are also told about new requests.">
            <MultiSelect<number> value={v.manager_employee_ids} onChange={(x) => set("manager_employee_ids", x)} loadOptions={loaders.employee}
              selectedOptions={svc.managers.map((m) => ({ value: m.value, label: m.label }))} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection title="Approval">
        <Toggle checked={v.needs_approval} onChange={(x) => set("needs_approval", x)} label="Needs approval before it starts" />
        {v.needs_approval && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-[13.5px] text-muted">
            {svc.flows ? `${svc.flows} approval flow${svc.flows === 1 ? "" : "s"} set up.` : "Save to get a default flow (reporting manager)."}
            <Link href="/dashboard/workflows" className="inline-flex items-center gap-1 text-primary hover:underline"><Workflow size={14} strokeWidth={STROKE} /> Change it in Approval flows</Link>
          </p>
        )}
      </FormSection>

      <FormSection title="Statuses" description="Where a record goes after it is approved (or submitted, without approval). The first is where it starts; final ones close it.">
        <div className="space-y-2">
          {v.statuses.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <TextInput className="min-w-[160px] flex-1" value={s.label} maxLength={40} onValueChange={(x) => set("statuses", v.statuses.map((y, j) => (j === i ? { ...y, label: x } : y)))} />
              <Select className="w-32" value={s.tone} options={TONE_OPTIONS} onChange={(x) => set("statuses", v.statuses.map((y, j) => (j === i ? { ...y, tone: (x ?? "neutral") as Status["tone"] } : y)))} />
              <Checkbox label="Final" checked={s.closed} onChange={(x) => set("statuses", v.statuses.map((y, j) => (j === i ? { ...y, closed: x } : y)))} />
              <IconButton icon={ArrowUp} label="Move up" size="sm" disabled={i === 0} onClick={() => { const n = [...v.statuses]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set("statuses", n); }} />
              <IconButton icon={Trash2} label="Remove" size="sm" onClick={() => set("statuses", v.statuses.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button size="sm" icon={Plus} onClick={() => set("statuses", [...v.statuses, { key: "", label: "New status", tone: "neutral", closed: false }])}>Add status</Button>
        </div>
      </FormSection>

      <FormSection title="Notifications">
        <div className="space-y-2">
          <Toggle checked={v.notify.managers_on_submit} onChange={(x) => set("notify", { ...v.notify, managers_on_submit: x })} label="Tell the people who handle it about each new request" />
          <Toggle checked={v.notify.requester_on_status} onChange={(x) => set("notify", { ...v.notify, requester_on_status: x })} label="Tell the requester when the status changes" />
          <Toggle checked={v.notify.requester_on_comment} onChange={(x) => set("notify", { ...v.notify, requester_on_comment: x })} label="Tell the requester about new comments" />
        </div>
        <p className="mt-2 text-[12.5px] text-faint">Approvers are told by the approval flow.</p>
      </FormSection>

      <FormSection title="Record numbers" description={svc.series?.next ? `The next record gets ${svc.series.next}.` : undefined}>
        <FormGrid columns={2}>
          <Field label="Prefix"><TextInput value={v.prefix} maxLength={30} onValueChange={(x) => set("prefix", x.toUpperCase())} /></Field>
          <Field label="Format" hint="{PREFIX}, {YYYY}, {YY}, {MM}, {FY} and the counter {SEQ:4}."><TextInput value={v.pattern} maxLength={120} onValueChange={(x) => set("pattern", x)} /></Field>
        </FormGrid>
        <p className="mt-2 text-[12.5px] text-faint">Resets and counters are under <Link href="/dashboard/numbering" className="text-primary hover:underline">Numbering</Link>.</p>
      </FormSection>

      <div className="flex items-center justify-end gap-3 border-t border-line pt-4">
        {error && <p className="mr-auto text-[13px] text-rose-600">{error}</p>}
        <Button variant="primary" onClick={save} loading={busy}>Save settings</Button>
      </div>
    </div>
  );
}

/* ── Versions ─────────────────────────────────────────────────────── */

type Version = { uuid: string; version: number; current: boolean; fields: number; records: number; change_note: string | null; created_by_name: string | null; created_at: string };

function Versions({ code }: { code: string }) {
  const [rows, setRows] = useState<Version[] | null>(null);
  useEffect(() => { api.get<Version[]>(`/custom-forms/services/${code}/versions`).then(setRows).catch(() => setRows([])); }, [code]);
  if (!rows) return <Skeleton className="h-40" />;
  return (
    <div className="mx-auto max-w-3xl divide-y divide-line rounded-xl border border-line">
      {rows.map((r) => (
        <div key={r.uuid} className="flex items-center gap-4 px-4 py-3">
          <span className="w-16 text-[14px] text-ink">v{r.version}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] text-ink/90">{r.change_note ?? "—"}</p>
            <p className="text-[12px] text-faint">{r.fields} fields · {r.created_by_name ?? "System"} · {formatDateTime(r.created_at)}</p>
          </div>
          <span className="text-[13px] text-muted">{r.records} record{r.records === 1 ? "" : "s"}</span>
          {r.current && <Badge tone="good">Current</Badge>}
        </div>
      ))}
    </div>
  );
}

/* ── New service and templates ────────────────────────────────────── */

export function NewServiceModal({ meta, open, onClose, onCreated }: { meta: Meta; open: boolean; onClose: () => void; onCreated: (code: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [section, setSection] = useState("home");
  const [approval, setApproval] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function create() {
    if (!name.trim()) { setError("Give it a name"); return; }
    setBusy("new");
    try {
      const s = await api.post<ServiceFull>("/custom-forms/services", { name: name.trim(), nav_section: section, needs_approval: approval });
      toast.success("Service created", { description: "Now build its form." });
      onCreated(s.code);
    } catch (e) { setError(errText(e)); } finally { setBusy(null); }
  }
  async function install(key: string) {
    setBusy(key);
    try {
      const s = await api.post<ServiceFull>(`/custom-forms/templates/${key}/install`);
      toast.success(`${s.name} added`, { description: "It is in the menu for everyone who may use it." });
      onCreated(s.code);
    } catch (e) { toast.error(errText(e)); } finally { setBusy(null); }
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" busy={!!busy} title="New service" description="Start from a ready-made template or from a blank form."
      footer={<><ModalCancel /><Button variant="primary" onClick={create} loading={busy === "new"}>Create blank service</Button></>}>
      <div className="space-y-6">
        <div>
          <p className="mb-2 text-[12px] uppercase tracking-[0.06em] text-faint">Templates</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {meta.templates.map((t) => {
              const I = serviceIcon(t.icon);
              return (
                <div key={t.key} className="flex items-start gap-3 rounded-xl border border-line p-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><I size={18} strokeWidth={STROKE} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] text-ink">{t.name}</p>
                    <p className="text-[12.5px] text-muted">{t.description}</p>
                    <p className="mt-1 text-[12px] text-faint">{t.fields} fields · {t.needs_approval ? "with approval" : "no approval"}</p>
                  </div>
                  {t.installed ? <Badge tone="good">Added</Badge>
                    : <Button size="sm" onClick={() => install(t.key)} loading={busy === t.key} disabled={!!busy}>Add</Button>}
                </div>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-2 text-[12px] uppercase tracking-[0.06em] text-faint">Blank service</p>
          <FormGrid columns={2}>
            <Field label="Name" required error={error}><TextInput value={name} maxLength={50} onValueChange={(x) => { setName(x); setError(""); }} placeholder="e.g. Uniform request" /></Field>
            <Field label="Shows in the menu under"><Select value={section} onChange={(x) => setSection(x ?? "home")} options={meta.nav_sections} /></Field>
          </FormGrid>
          <Toggle className="mt-3" checked={approval} onChange={setApproval} label="Needs approval" description="A default flow (reporting manager) is set up; change it in Approval flows." />
        </div>
      </div>
    </Modal>
  );
}

export function SectionNote({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] text-faint">{children}</p>;
}
