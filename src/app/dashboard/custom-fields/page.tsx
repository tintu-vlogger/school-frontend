"use client";

/*
 * Settings > Custom fields: extra fields a company adds to records (employees, departments,
 * designations, locations, legal entities, assets, help desk cases and candidates; pick the
 * record type at the top, also as ?type=<entity>). Sections are blocks in order, each with
 * its fields; both are reordered by dragging (or the arrow buttons), edited and switched
 * off (nothing is deleted). Dropping a field on another section moves it there. A live preview on the right renders the form exactly
 * as people will see it (via the shared CustomFields renderer).
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlignLeft, ArrowDown, ArrowUp, AtSign, Calendar, CheckSquare, CircleDot, Eye, EyeOff, FileUp, GripVertical, Hash, Link2, ListChecks,
  Pencil, Phone, Plus, Rows3, ToggleLeft, Type, UserPen,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  CustomFields, useCustomFieldLayout, type CustomFieldDef, type CustomFieldEntity, type CustomFieldLayout, type CustomFieldSection, type CustomFieldType, type CustomValues,
} from "@/components/custom-fields";
import {
  Badge, Button, Field, FormGrid, IconButton, Modal, ModalCancel, NumberInput, RadioCards, Select, Skeleton, TextInput, Textarea, Toggle,
  type IconType, type SelectOption,
} from "@/components/ui-kit";

const TYPES: { value: CustomFieldType; label: string; description: string; icon: IconType }[] = [
  { value: "text", label: "Short text", description: "A name, number or code", icon: Type },
  { value: "textarea", label: "Long text", description: "Notes over a few lines", icon: AlignLeft },
  { value: "number", label: "Number", description: "With optional limits", icon: Hash },
  { value: "date", label: "Date", description: "Picked from a calendar", icon: Calendar },
  { value: "boolean", label: "Yes / no", description: "A switch", icon: ToggleLeft },
  { value: "single_choice", label: "Choose one", description: "From a list", icon: CircleDot },
  { value: "multi_choice", label: "Choose many", description: "From a list", icon: ListChecks },
  { value: "email", label: "Email", description: "Checked for format", icon: AtSign },
  { value: "phone", label: "Phone", description: "Digits and +", icon: Phone },
  { value: "url", label: "Web link", description: "Starts with https://", icon: Link2 },
  { value: "file", label: "File", description: "One upload, up to 2 MB", icon: FileUp },
];
const typeInfo = (t: string) => TYPES.find((x) => x.value === t);
const isChoice = (t: string) => t === "single_choice" || t === "multi_choice";
const ENTITY_LABELS: Record<CustomFieldEntity, string> = {
  employee: "Employee", department: "Department", designation: "Designation", location: "Location",
  legal_entity: "Legal entity", asset: "Asset", helpdesk_case: "Help desk case", candidate: "Candidate",
};
/** Record types whose fields an employee can see (their own profile, or cases they raised). */
const EMPLOYEE_FACING = new Set<CustomFieldEntity>(["employee", "helpdesk_case"]);
const isEntity = (x: string | null): x is CustomFieldEntity => !!x && x in ENTITY_LABELS;

/** Dragging: a field (by id) or a section (by index). */
type Drag = { kind: "field"; id: number } | { kind: "section"; index: number } | null;
type DropTarget = { kind: "field"; id: number; after: boolean } | { kind: "group"; sectionId: number | null } | { kind: "section"; index: number; after: boolean } | null;

type MasterType = { key: string; name: string; value_count: number; active: boolean };

export default function CustomFieldsPage() {
  const toast = useToast();
  const { user } = useAuth();
  const canManage = user?.role === "admin";
  const [entity, setEntityState] = useState<CustomFieldEntity>("employee");
  const ENTITY = entity;
  const { layout, loading, reload } = useCustomFieldLayout(entity, true);
  const [entities, setEntities] = useState<SelectOption[]>([{ value: "employee", label: "Employee" }]);
  const [drag, setDrag] = useState<Drag>(null);
  const [over, setOver] = useState<DropTarget>(null);
  const [masterTypes, setMasterTypes] = useState<MasterType[]>([]);
  const [preview, setPreview] = useState<CustomValues>({});
  const [busy, setBusy] = useState(false);
  const [sectionModal, setSectionModal] = useState<{ open: boolean; target: CustomFieldSection | null; key: number }>({ open: false, target: null, key: 0 });
  const [fieldModal, setFieldModal] = useState<{ open: boolean; target: CustomFieldDef | null; sectionId: number | null; key: number }>({ open: false, target: null, sectionId: null, key: 0 });

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("type");
    if (isEntity(t)) setTimeout(() => setEntityState(t), 0);
  }, []);

  function setEntity(next: CustomFieldEntity) {
    setEntityState(next);
    setPreview({});
    const url = new URL(window.location.href);
    if (next === "employee") url.searchParams.delete("type"); else url.searchParams.set("type", next);
    window.history.replaceState(null, "", url.toString());
  }

  useEffect(() => {
    let live = true;
    api.getCached<{ entities: { value: string; label: string }[] }>("/custom-fields/meta", 300)
      .then((m) => { if (live && m?.entities?.length) setEntities(m.entities); }).catch(() => {});
    api.get<MasterType[]>("/masters/types").then((r) => { if (live) setMasterTypes(Array.isArray(r) ? r : []); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const sections = useMemo(() => layout?.sections ?? [], [layout]);
  const loose = useMemo(() => layout?.unsectioned ?? [], [layout]);
  const masterName = (key: string | null) => masterTypes.find((t) => t.key === key)?.name ?? key;
  const empty = !loading && sections.length === 0 && loose.length === 0;

  async function moveSection(i: number, dir: -1 | 1) {
    const ids = sections.map((s) => s.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setBusy(true);
    try { await api.post(`/custom-fields/${ENTITY}/sections/reorder`, { ids }); reload(); }
    catch (e: unknown) { toast.error("Couldn't change the order", { description: e instanceof Error ? e.message : undefined }); }
    finally { setBusy(false); }
  }

  async function moveField(f: CustomFieldDef, dir: -1 | 1) {
    const groups = [...sections.map((s) => s.fields), loose];
    const g = groups.find((list) => list.some((x) => x.id === f.id));
    if (!g) return;
    const i = g.findIndex((x) => x.id === f.id);
    const j = i + dir;
    if (j < 0 || j >= g.length) return;
    const copy = [...g];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    const ids = groups.flatMap((list) => (list === g ? copy : list)).map((x) => x.id);
    setBusy(true);
    try { await api.post(`/custom-fields/${ENTITY}/fields/reorder`, { ids }); reload(); }
    catch (e: unknown) { toast.error("Couldn't change the order", { description: e instanceof Error ? e.message : undefined }); }
    finally { setBusy(false); }
  }

  async function saveSectionOrder(ids: number[]) {
    setBusy(true);
    try { await api.post(`/custom-fields/${ENTITY}/sections/reorder`, { ids }); reload(); }
    catch (e: unknown) { toast.error("Couldn't change the order", { description: e instanceof Error ? e.message : undefined }); }
    finally { setBusy(false); }
  }

  /** Drop the dragged field before/after another field, or at the end of a group; a field
   *  dropped in another section moves to that section. */
  async function dropField(fieldId: number, target: NonNullable<DropTarget>) {
    const all = [...sections.flatMap((s) => s.fields), ...loose];
    const moving = all.find((f) => f.id === fieldId);
    if (!moving || target.kind === "section") return;
    let sectionId: number | null;
    let order: CustomFieldDef[][] = [...sections.map((s) => s.fields.filter((f) => f.id !== fieldId)), loose.filter((f) => f.id !== fieldId)];
    const groupIndex = (sid: number | null) => (sid === null ? sections.length : sections.findIndex((s) => s.id === sid));
    if (target.kind === "field") {
      if (target.id === fieldId) return;
      const host = all.find((f) => f.id === target.id);
      if (!host) return;
      sectionId = sections.some((s) => s.id === host.section_id) ? host.section_id : null;
      const gi = groupIndex(sectionId);
      const list = [...order[gi]];
      const at = list.findIndex((f) => f.id === target.id) + (target.after ? 1 : 0);
      list.splice(at, 0, moving);
      order = order.map((l, i) => (i === gi ? list : l));
    } else {
      sectionId = target.sectionId;
      const gi = groupIndex(sectionId);
      order = order.map((l, i) => (i === gi ? [...l, moving] : l));
    }
    const currentSection = sections.some((s) => s.id === moving.section_id) ? moving.section_id : null;
    setBusy(true);
    try {
      if (currentSection !== sectionId) await api.put(`/custom-fields/fields/${moving.uuid}`, { section_id: sectionId });
      await api.post(`/custom-fields/${ENTITY}/fields/reorder`, { ids: order.flat().map((f) => f.id) });
      if (currentSection !== sectionId) toast.success(`“${moving.label}” moved to ${sectionId === null ? "no section" : sections.find((s) => s.id === sectionId)?.name}`);
      reload();
    } catch (e: unknown) {
      toast.error("Couldn't move the field", { description: e instanceof Error ? e.message : undefined });
    } finally { setBusy(false); }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const d = drag, t = over;
    setDrag(null); setOver(null);
    if (!d || !t) return;
    if (d.kind === "field") { dropField(d.id, t); return; }
    if (t.kind !== "section") return;
    const ids = sections.map((s) => s.id);
    const [moved] = ids.splice(d.index, 1);
    let at = t.index + (t.after ? 1 : 0);
    if (d.index < at) at -= 1;
    if (at === d.index) return;
    ids.splice(at, 0, moved);
    saveSectionOrder(ids);
  }

  const afterHalf = (e: React.DragEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY > r.top + r.height / 2;
  };

  async function setFieldActive(f: CustomFieldDef, active: boolean) {
    try {
      await api.put(`/custom-fields/fields/${f.uuid}`, { active });
      toast.success(active ? `“${f.label}” is on` : `“${f.label}” is switched off`, active ? undefined : { description: "Saved values are kept and come back if you switch it on again." });
      reload();
    } catch (e: unknown) { toast.error("Couldn't change it", { description: e instanceof Error ? e.message : undefined }); }
  }

  const openSection = (target: CustomFieldSection | null) => setSectionModal((m) => ({ open: true, target, key: m.key + 1 }));
  const openField = (target: CustomFieldDef | null, sectionId: number | null = null) => setFieldModal((m) => ({ open: true, target, sectionId, key: m.key + 1 }));

  const fieldRow = (f: CustomFieldDef, i: number, list: CustomFieldDef[]) => {
    const t = typeInfo(f.field_type);
    const Icon = t?.icon ?? Type;
    return (
      <li key={f.uuid}
        draggable={canManage && !busy}
        onDragStart={(e) => { e.stopPropagation(); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", f.key); setDrag({ kind: "field", id: f.id }); }}
        onDragEnd={() => { setDrag(null); setOver(null); }}
        onDragOver={(e) => { if (drag?.kind !== "field") return; e.preventDefault(); e.stopPropagation(); const after = afterHalf(e); setOver((o) => (o?.kind === "field" && o.id === f.id && o.after === after ? o : { kind: "field", id: f.id, after })); }}
        onDrop={(e) => { e.stopPropagation(); onDrop(e); }}
        className={`group relative flex items-center gap-3 px-5 py-3 transition-opacity ${drag?.kind === "field" && drag.id === f.id ? "opacity-40" : ""}`}>
        {over?.kind === "field" && over.id === f.id && drag?.kind === "field" && drag.id !== f.id && (
          <span aria-hidden className={`pointer-events-none absolute inset-x-4 h-0.5 rounded-full bg-accent ${over.after ? "-bottom-px" : "-top-px"}`} />
        )}
        {canManage && <span className="-ml-3 flex h-8 w-4 shrink-0 cursor-grab items-center justify-center text-faint opacity-60 group-hover:opacity-100 active:cursor-grabbing" title="Drag to reorder"><GripVertical size={14} strokeWidth={1.4} /></span>}
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${f.active ? "bg-sunken text-muted" : "bg-sunken/60 text-faint"}`}><Icon size={15} strokeWidth={1.4} /></span>
        <button type="button" onClick={() => canManage && openField(f)} className="min-w-0 flex-1 text-left" disabled={!canManage}>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={`truncate text-[14px] ${f.active ? "text-ink" : "text-faint line-through decoration-faint/50"}`}>{f.label}</span>
            {f.required && <Badge tone="accent">Required</Badge>}
            {isChoice(f.field_type) && f.master_type_key && <Badge>List: {masterName(f.master_type_key)}</Badge>}
            {!f.active && <Badge tone="warn" dot>Off</Badge>}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-[12px] text-faint">
            <span>{t?.label ?? f.field_type}</span>
            <span className="font-mono">{f.key}</span>
            {EMPLOYEE_FACING.has(entity) && !f.visible_to_employee && <span className="inline-flex items-center gap-1"><EyeOff size={12} strokeWidth={1.4} /> HR only</span>}
            {EMPLOYEE_FACING.has(entity) && f.visible_to_employee && f.editable_by_employee && <span className="inline-flex items-center gap-1"><UserPen size={12} strokeWidth={1.4} /> Employee can edit</span>}
          </span>
        </button>
        {canManage && (
          <span className="flex shrink-0 items-center gap-0.5">
            <IconButton size="sm" icon={ArrowUp} label="Move up" disabled={busy || i === 0} onClick={() => moveField(f, -1)} />
            <IconButton size="sm" icon={ArrowDown} label="Move down" disabled={busy || i === list.length - 1} onClick={() => moveField(f, 1)} />
            <IconButton size="sm" icon={Pencil} label="Edit field" onClick={() => openField(f)} />
            <span className="ml-2"><Toggle size="sm" checked={f.active} onChange={(x) => setFieldActive(f, x)} aria-label={f.active ? `Switch off ${f.label}` : `Switch on ${f.label}`} /></span>
          </span>
        )}
      </li>
    );
  };

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Custom fields"
        description="Add the extra details your company keeps, grouped in sections. They appear on forms and profiles right away."
        actions={canManage && <><Button icon={Rows3} onClick={() => openSection(null)}>New section</Button><Button variant="primary" icon={Plus} onClick={() => openField(null)}>Add field</Button></>}
      />
      <div className="mb-6 flex items-center gap-3">
        <span className="text-[13px] text-muted">Fields for</span>
        <Select<string> aria-label="Record type" className="!w-56" value={entity}
          onChange={(x) => { if (isEntity(x)) setEntity(x); }} options={entities} />
        {canManage && !empty && !loading && <span className="hidden text-[12.5px] text-faint sm:inline">Drag fields and sections to change their order.</span>}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          {loading && [0, 1].map((i) => <Skeleton key={i} className="h-48 w-full rounded-2xl" />)}
          {empty && (
            <div className="rounded-2xl border border-line bg-surface px-6 py-14 text-center">
              <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-sunken text-faint"><CheckSquare size={20} strokeWidth={1.4} /></span>
              <p className="text-[15px] text-ink">No custom fields yet</p>
              <p className="mx-auto mt-1 max-w-sm text-[13.5px] text-muted">Start with a section such as “Statutory details” or “Uniform”, then add fields to it.</p>
              {canManage && <div className="mt-5 flex justify-center gap-2"><Button icon={Rows3} onClick={() => openSection(null)}>New section</Button><Button variant="primary" icon={Plus} onClick={() => openField(null)}>Add field</Button></div>}
            </div>
          )}
          {sections.map((s, i) => (
            <section key={s.uuid}
              onDragOver={(e) => {
                if (drag?.kind === "section") { e.preventDefault(); const after = afterHalf(e); setOver((o) => (o?.kind === "section" && o.index === i && o.after === after ? o : { kind: "section", index: i, after })); }
                else if (drag?.kind === "field") { e.preventDefault(); setOver((o) => (o?.kind === "group" && o.sectionId === s.id ? o : { kind: "group", sectionId: s.id })); }
              }}
              onDrop={onDrop}
              className={`relative rounded-2xl border bg-surface transition-colors ${s.active ? "" : "opacity-75"} ${drag?.kind === "section" && drag.index === i ? "opacity-40" : ""} ${over?.kind === "group" && over.sectionId === s.id ? "border-accent/50" : "border-line"}`}>
              {over?.kind === "section" && over.index === i && drag?.kind === "section" && drag.index !== i && (
                <span aria-hidden className={`pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-accent ${over.after ? "-bottom-3" : "-top-3"}`} />
              )}
              <header
                draggable={canManage && !busy}
                onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", s.name); setDrag({ kind: "section", index: i }); }}
                onDragEnd={() => { setDrag(null); setOver(null); }}
                className={`flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 ${canManage ? "cursor-grab active:cursor-grabbing" : ""}`}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {canManage && <GripVertical size={14} strokeWidth={1.4} className="-ml-2 text-faint" aria-hidden />}
                    <h2 className="text-[15.5px] font-normal text-ink">{s.name}</h2>
                    {!s.active && <Badge tone="warn" dot>Off</Badge>}
                    <span className="text-[12px] text-faint">{s.fields.length} {s.fields.length === 1 ? "field" : "fields"}</span>
                  </div>
                  {s.description && <p className="mt-0.5 text-[13px] text-muted">{s.description}</p>}
                </div>
                {canManage && (
                  <div className="flex items-center gap-0.5">
                    <IconButton size="sm" icon={ArrowUp} label="Move section up" disabled={busy || i === 0} onClick={() => moveSection(i, -1)} />
                    <IconButton size="sm" icon={ArrowDown} label="Move section down" disabled={busy || i === sections.length - 1} onClick={() => moveSection(i, 1)} />
                    <IconButton size="sm" icon={Pencil} label="Edit section" onClick={() => openSection(s)} />
                    <Button size="sm" icon={Plus} className="ml-2" onClick={() => openField(null, s.id)}>Add field</Button>
                  </div>
                )}
              </header>
              {s.fields.length ? (
                <ul className="divide-y divide-line">{s.fields.map((f, j) => fieldRow(f, j, s.fields))}</ul>
              ) : (
                <p className="px-5 py-6 text-[13.5px] text-faint">No fields in this section yet.</p>
              )}
            </section>
          ))}
          {(loose.length > 0 || (drag?.kind === "field" && sections.length > 0)) && (
            <section
              onDragOver={(e) => { if (drag?.kind !== "field") return; e.preventDefault(); setOver((o) => (o?.kind === "group" && o.sectionId === null ? o : { kind: "group", sectionId: null })); }}
              onDrop={onDrop}
              className={`rounded-2xl border border-dashed bg-surface ${over?.kind === "group" && over.sectionId === null ? "border-accent/60" : "border-line-strong"}`}>
              <header className="border-b border-line px-5 py-4">
                <h2 className="text-[15.5px] font-normal text-ink">Not in a section</h2>
                <p className="mt-0.5 text-[13px] text-muted">Shown under “Other details”. Edit a field to move it into a section.</p>
              </header>
              {loose.length ? <ul className="divide-y divide-line">{loose.map((f, j) => fieldRow(f, j, loose))}</ul>
                : <p className="px-5 py-6 text-[13.5px] text-faint">Drop a field here to take it out of its section.</p>}
            </section>
          )}
        </div>

        <aside className="rounded-2xl border border-line bg-surface xl:sticky xl:top-6">
          <header className="flex items-center justify-between border-b border-line px-5 py-3.5">
            <p className="flex items-center gap-2 text-[14px] text-ink"><Eye size={15} strokeWidth={1.4} className="text-faint" /> Preview</p>
            <span className="text-[12px] text-faint">{ENTITY_LABELS[entity]} form</span>
          </header>
          <div className="hr-scroll max-h-[calc(100dvh-200px)] overflow-y-auto px-5 py-5">
            {layout && (empty
              ? <p className="py-8 text-center text-[13px] text-faint">Fields you add show up here.</p>
              : <CustomFields entity={entity} layout={layout} values={preview} onChange={setPreview} />)}
          </div>
        </aside>
      </div>

      <SectionModal key={`s${sectionModal.key}`} entity={entity} open={sectionModal.open} target={sectionModal.target}
        onClose={() => setSectionModal((m) => ({ ...m, open: false }))}
        onSaved={() => { setSectionModal((m) => ({ ...m, open: false })); reload(); }} />
      <FieldModal key={`f${fieldModal.key}`} entity={entity} open={fieldModal.open} target={fieldModal.target} sectionId={fieldModal.sectionId}
        sections={sections} masterTypes={masterTypes}
        onClose={() => setFieldModal((m) => ({ ...m, open: false }))}
        onSaved={() => { setFieldModal((m) => ({ ...m, open: false })); reload(); }} />
    </div>
  );
}

/* ── Section modal ─────────────────────────────────────────────────────── */

function SectionModal({ entity, open, target, onClose, onSaved }: { entity: CustomFieldEntity; open: boolean; target: CustomFieldSection | null; onClose: () => void; onSaved: () => void }) {
  const ENTITY = entity;
  const toast = useToast();
  const initial = { name: target?.name ?? "", description: target?.description ?? "", active: target?.active ?? true };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError("Give the section a name"); return; }
    setSaving(true);
    try {
      const body = { name: v.name.trim(), description: v.description.trim() || null };
      if (target) await api.put(`/custom-fields/sections/${target.uuid}`, { ...body, active: v.active });
      else await api.post(`/custom-fields/${ENTITY}/sections`, body);
      toast.success(target ? "Section saved" : "Section added");
      onSaved();
    } catch (err: unknown) {
      toast.error("Couldn't save the section", { description: err instanceof Error ? err.message : undefined });
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(initial)}
      title={target ? "Edit section" : "New section"} description={target ? undefined : "A titled group of fields on the form and profile."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="cf-section-form" loading={saving}>{target ? "Save" : "Add section"}</Button></>}>
      <form id="cf-section-form" onSubmit={submit} noValidate className="space-y-5">
        <Field label="Name" required error={error}>
          <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} placeholder="e.g. Statutory details" />
        </Field>
        <Field label="Description" aside="Optional">
          <Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={2} placeholder="A line of help shown under the title" />
        </Field>
        {target && <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="On" description="A switched-off section is hidden with its fields; values are kept." />}
      </form>
    </Modal>
  );
}

/* ── Field modal ───────────────────────────────────────────────────────── */

type FieldDraft = {
  label: string; field_type: CustomFieldType; section_id: number | null; source: "master" | "typed"; master_type_key: string | null;
  choices: string; required: boolean; help_text: string; placeholder: string;
  min: number | null; max: number | null; min_length: number | null; max_length: number | null; pattern: string; pattern_message: string;
  visible_to_employee: boolean; editable_by_employee: boolean; active: boolean;
};

function draftOf(f: CustomFieldDef | null, sectionId: number | null): FieldDraft {
  const val = f?.validation ?? {};
  return {
    label: f?.label ?? "", field_type: f?.field_type ?? "text", section_id: f ? f.section_id : sectionId,
    source: f?.master_type_key ? "master" : f && isChoice(f.field_type) ? "typed" : "master",
    master_type_key: f?.master_type_key ?? null,
    choices: (f?.options ?? []).map((o) => (typeof o === "string" ? o : o.label || o.value)).join("\n"),
    required: f?.required ?? false, help_text: f?.help_text ?? "", placeholder: f?.placeholder ?? "",
    min: val.min ?? null, max: val.max ?? null, min_length: val.min_length ?? null, max_length: val.max_length ?? null,
    pattern: val.pattern ?? "", pattern_message: val.pattern_message ?? "",
    visible_to_employee: f?.visible_to_employee ?? true, editable_by_employee: f?.editable_by_employee ?? false, active: f?.active ?? true,
  };
}

function FieldModal({ entity, open, target, sectionId, sections, masterTypes, onClose, onSaved }: {
  entity: CustomFieldEntity; open: boolean; target: CustomFieldDef | null; sectionId: number | null; sections: CustomFieldSection[]; masterTypes: MasterType[];
  onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const ENTITY = entity;
  const employeeFacing = EMPLOYEE_FACING.has(entity);
  const initial = draftOf(target, sectionId);
  const [v, setV] = useState<FieldDraft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [sample, setSample] = useState<CustomValues>({});
  const set = <K extends keyof FieldDraft>(k: K, val: FieldDraft[K]) => { setV((p) => ({ ...p, [k]: val })); setErrors((e) => ({ ...e, [k]: "" })); };

  const choice = isChoice(v.field_type);
  const textual = ["text", "textarea", "email", "phone", "url"].includes(v.field_type);
  const options = v.choices.split("\n").map((x) => x.trim()).filter(Boolean);

  const validation = () => {
    const out: Record<string, unknown> = {};
    if (v.field_type === "number") { if (v.min !== null) out.min = v.min; if (v.max !== null) out.max = v.max; }
    if (textual) {
      if (v.min_length !== null) out.min_length = v.min_length;
      if (v.max_length !== null) out.max_length = v.max_length;
      if (v.field_type === "text" && v.pattern.trim()) { out.pattern = v.pattern.trim(); if (v.pattern_message.trim()) out.pattern_message = v.pattern_message.trim(); }
    }
    return out;
  };

  // A one-field layout for the preview below the form.
  const previewLayout: CustomFieldLayout = {
    entity: ENTITY, unsectioned: [],
    sections: [{
      id: -1, uuid: "preview", name: "Preview", description: null, active: true, sort_order: 0,
      fields: [{
        id: -1, uuid: "preview-field", key: "preview", label: v.label || "Field name", field_type: v.field_type, section_id: -1,
        master_type_key: choice && v.source === "master" ? v.master_type_key : null, options: choice && v.source === "typed" ? options : [],
        required: v.required, help_text: v.help_text || null, placeholder: v.placeholder || null, validation: validation(),
        visible_to_employee: true, editable_by_employee: true, active: true, sort_order: 0,
      }],
    }],
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!v.label.trim()) er.label = "Give the field a name";
    if (choice && v.source === "master" && !v.master_type_key) er.master_type_key = "Pick a list";
    if (choice && v.source === "typed" && options.length < 2) er.choices = "Type at least two choices, one per line";
    setErrors(er);
    if (Object.keys(er).length) return;
    const body = {
      label: v.label.trim(), section_id: v.section_id,
      master_type_key: choice && v.source === "master" ? v.master_type_key : null,
      options: choice && v.source === "typed" ? options : [],
      required: v.required, help_text: v.help_text.trim() || null, placeholder: v.placeholder.trim() || null,
      validation: validation(), visible_to_employee: v.visible_to_employee, editable_by_employee: v.visible_to_employee && v.editable_by_employee,
    };
    setSaving(true);
    try {
      if (target) await api.put(`/custom-fields/fields/${target.uuid}`, { ...body, active: v.active });
      else await api.post(`/custom-fields/${ENTITY}/fields`, { ...body, field_type: v.field_type });
      toast.success(target ? "Field saved" : `“${v.label.trim()}” added`);
      onSaved();
    } catch (err: unknown) {
      toast.error("Couldn't save the field", { description: err instanceof Error ? err.message : undefined });
    } finally { setSaving(false); }
  }

  const TypeIcon = typeInfo(v.field_type)?.icon ?? Type;
  return (
    <Modal open={open} onClose={onClose} size="xl" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(initial)}
      title={target ? `Edit “${target.label}”` : "Add field"}
      description={target ? undefined : `The field shows on the ${ENTITY_LABELS[entity].toLowerCase()} form and details.`}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="cf-field-form" loading={saving}>{target ? "Save field" : "Add field"}</Button></>}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form id="cf-field-form" onSubmit={submit} noValidate className="space-y-6">
          <FormGrid>
            <Field label="Field name" required error={errors.label}>
              <TextInput autoFocusInModal value={v.label} onValueChange={(x) => set("label", x)} placeholder="e.g. PF number" />
            </Field>
            <Field label="Section">
              <Select<number> value={v.section_id} onChange={(x) => set("section_id", x)} placeholder="No section" clearable
                options={sections.map((s) => ({ value: s.id, label: s.name, description: s.active ? undefined : "Switched off" }))} />
            </Field>
          </FormGrid>

          <Field label="Type" hint={target ? "The type can't change once the field exists. Add a new field instead." : undefined}>
            {target ? (
              <div className="flex h-10 items-center gap-2.5 rounded-lg border border-line bg-sunken px-3 text-[14px] text-muted">
                <TypeIcon size={15} strokeWidth={1.4} /> {typeInfo(v.field_type)?.label}
              </div>
            ) : (
              <RadioCards<CustomFieldType> columns={3} value={v.field_type} onChange={(x) => set("field_type", x)}
                options={TYPES.map((t) => ({ value: t.value, label: t.label, description: t.description, icon: t.icon }))} />
            )}
          </Field>

          {choice && (
            <div className="space-y-4 rounded-xl border border-line p-4">
              <RadioCards<"master" | "typed"> columns={2} value={v.source} onChange={(x) => set("source", x)} options={[
                { value: "master", label: "From a list", description: "Use a list from Settings › Lists" },
                { value: "typed", label: "Typed choices", description: "Just for this field" },
              ]} />
              {v.source === "master" ? (
                <Field label="List" required error={errors.master_type_key}>
                  <Select value={v.master_type_key} onChange={(x) => set("master_type_key", x)} placeholder="Pick a list"
                    options={masterTypes.filter((t) => t.active || t.key === v.master_type_key).map((t) => ({ value: t.key, label: t.name, description: `${t.value_count} values` }))} />
                </Field>
              ) : (
                <Field label="Choices" required error={errors.choices} hint="One per line, in the order they should appear.">
                  <Textarea value={v.choices} onValueChange={(x) => set("choices", x)} rows={5} placeholder={"Small\nMedium\nLarge"} />
                </Field>
              )}
            </div>
          )}

          <FormGrid>
            {!["boolean", "file"].includes(v.field_type) && (
              <Field label="Placeholder" aside="Optional">
                <TextInput value={v.placeholder} onValueChange={(x) => set("placeholder", x)} placeholder="Shown in the empty box" />
              </Field>
            )}
            <Field label="Help text" aside="Optional" className={["boolean", "file"].includes(v.field_type) ? "sm:col-span-2" : undefined}>
              <TextInput value={v.help_text} onValueChange={(x) => set("help_text", x)} placeholder="A short hint under the field" />
            </Field>
            {v.field_type === "number" && <>
              <Field label="Lowest allowed" aside="Optional"><NumberInput value={v.min} onChange={(x) => set("min", x)} /></Field>
              <Field label="Highest allowed" aside="Optional"><NumberInput value={v.max} onChange={(x) => set("max", x)} /></Field>
            </>}
            {textual && <>
              <Field label="Shortest length" aside="Optional"><NumberInput value={v.min_length} onChange={(x) => set("min_length", x)} min={0} suffix="chars" /></Field>
              <Field label="Longest length" aside="Optional"><NumberInput value={v.max_length} onChange={(x) => set("max_length", x)} min={1} suffix="chars" /></Field>
            </>}
            {v.field_type === "text" && <>
              <Field label="Format (pattern)" aside="Advanced" hint="A regular expression, e.g. ^[A-Z]{5}[0-9]{4}[A-Z]$ for a PAN.">
                <TextInput value={v.pattern} onValueChange={(x) => set("pattern", x)} className="font-mono" placeholder="^[A-Z0-9]+$" />
              </Field>
              <Field label="Message when the format is wrong" aside="Optional">
                <TextInput value={v.pattern_message} onValueChange={(x) => set("pattern_message", x)} placeholder="e.g. Enter a valid PAN" />
              </Field>
            </>}
          </FormGrid>

          <div className="space-y-4 rounded-xl border border-line p-4">
            <Toggle checked={v.required} onChange={(x) => set("required", x)} label="Required" description="The form can't be saved without it." />
            {employeeFacing && <>
              <Toggle checked={v.visible_to_employee} onChange={(x) => set("visible_to_employee", x)} label="Employees can see it"
                description={entity === "employee" ? "Shown on their own profile." : "Shown to the person who raised the case."} />
              <Toggle checked={v.visible_to_employee && v.editable_by_employee} disabled={!v.visible_to_employee} onChange={(x) => set("editable_by_employee", x)}
                label="Employees can change it" description="Otherwise only HR can change it." />
            </>}
            {target && <Toggle checked={v.active} onChange={(x) => set("active", x)} label="On" description="Switched-off fields are hidden; saved values are kept." />}
          </div>
        </form>

        <aside className="lg:sticky lg:top-0 lg:self-start">
          <p className="mb-3 text-[12px] uppercase tracking-[0.06em] text-faint">Preview</p>
          <div className="rounded-xl border border-line bg-sunken/40 p-4 [&_section]:border-0 [&_section]:p-0 [&_section>div:first-child]:hidden [&_.grid]:!grid-cols-1">
            <CustomFields entity={entity} layout={previewLayout} values={sample} onChange={setSample} />
          </div>
        </aside>
      </div>
    </Modal>
  );
}
