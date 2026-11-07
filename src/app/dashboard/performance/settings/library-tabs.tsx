"use client";

/*
 * Settings libraries: rating scales, KRAs (tagged to departments and designations so they
 * are assigned automatically), competencies (behaviours per level, linked skills) and
 * review templates (sections with weights that add up to 100%, and questions).
 */
import { useState } from "react";
import { ArrowDown, ArrowUp, BookMarked, ClipboardList, Pencil, Plus, Ruler, Sparkles, Trash2, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, Checkbox, DataTable, Field, FilterBar, FormGrid, FormSection, IconButton, MasterSelect, Modal, ModalCancel,
  MultiSelect, NumberInput, Select, TextInput, Textarea, Toggle, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { RatingPill, useDepartments, useDesignations, useList } from "@/components/performance/shared";
import type { Competency, Kra, RatingScale, ReviewTemplate, ScalePoint, Tags, TemplateSection } from "@/components/performance/types";

function useSave() {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  async function run(fn: () => Promise<unknown>, ok: string) {
    setSaving(true);
    try { await fn(); toast.success(ok); return true; } catch (e) { toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined }); return false; } finally { setSaving(false); }
  }
  return { saving, run };
}

function TagNames({ tags, deps, desigs }: { tags: Tags; deps: SelectOption<number>[]; desigs: SelectOption<number>[] }) {
  const names = [
    ...(tags.department_ids ?? []).map((id) => deps.find((d) => d.value === id)?.label).filter(Boolean),
    ...(tags.designation_ids ?? []).map((id) => desigs.find((d) => d.value === id)?.label).filter(Boolean),
  ] as string[];
  if (!names.length) return <span className="text-faint">Everyone (assign by hand)</span>;
  return <span className="flex flex-wrap gap-1">{names.slice(0, 3).map((n) => <Badge key={n}>{n}</Badge>)}{names.length > 3 && <Badge>+{names.length - 3}</Badge>}</span>;
}

/* ── Rating scales ────────────────────────────────────────────────────── */

export function ScalesTab() {
  const { rows, loading, refresh } = useList<RatingScale>("/performance/rating-scales", "Couldn't load scales");
  const [edit, setEdit] = useState<RatingScale | "new" | null>(null);
  const [v, setV] = useState<{ name: string; description: string; points: ScalePoint[]; is_default: boolean; active: boolean }>({ name: "", description: "", points: [], is_default: false, active: true });
  const { saving, run } = useSave();
  function open(s: RatingScale | "new") {
    setEdit(s);
    setV(s === "new"
      ? { name: "", description: "", is_default: false, active: true, points: [1, 2, 3, 4, 5].map((n) => ({ value: n, label: "", description: "", color: null })) }
      : { name: s.name, description: s.description ?? "", points: s.points, is_default: s.is_default, active: s.active });
  }
  const setPoint = (i: number, p: Partial<ScalePoint>) => setV((x) => ({ ...x, points: x.points.map((q, j) => (j === i ? { ...q, ...p } : q)) }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(() => (edit === "new" ? api.post("/performance/rating-scales", v) : api.put(`/performance/rating-scales/${(edit as RatingScale).uuid}`, v)), "Scale saved");
    if (ok) { setEdit(null); refresh(); }
  }
  const columns: Column<RatingScale>[] = [
    { key: "name", header: "Scale", cell: (s) => <span className="flex items-center gap-2 text-ink">{s.name}{s.is_default && <Badge tone="accent">Default</Badge>}</span> },
    { key: "points", header: "Points", cell: (s) => <span className="flex flex-wrap gap-1">{s.points.map((p) => <RatingPill key={p.value} value={p.value} label={p.label} scale={s.points} />)}</span> },
    { key: "active", header: "Status", cell: (s) => <Badge tone={s.active ? "good" : "neutral"} dot>{s.active ? "In use" : "Off"}</Badge> },
  ];
  return (
    <>
      <div className="mb-4 flex justify-end"><Button variant="primary" icon={Plus} onClick={() => open("new")}>Add scale</Button></div>
      <DataTable rows={rows} rowKey={(s) => s.uuid} columns={columns} loading={loading} onRowClick={open}
        rowActions={(s) => [{ label: "Edit", icon: Pencil, onSelect: () => open(s) }]} emptyIcon={Ruler} emptyTitle="No rating scales" />
      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" busy={saving} title={edit === "new" ? "Add rating scale" : "Edit rating scale"}
        description="Between 3 and 10 points, lowest first."
        footer={<><ModalCancel /><Button variant="primary" type="submit" form="scale-form" loading={saving}>Save</Button></>}>
        <form id="scale-form" onSubmit={save} className="space-y-6">
          <FormGrid columns={2}>
            <Field label="Name" required><TextInput value={v.name} onValueChange={(x) => setV({ ...v, name: x })} /></Field>
            <Field label="Description"><TextInput value={v.description} onValueChange={(x) => setV({ ...v, description: x })} /></Field>
          </FormGrid>
          <div className="space-y-2">
            {v.points.map((p, i) => (
              <div key={i} className="grid grid-cols-[130px_1fr_1.4fr_auto] items-center gap-2">
                <NumberInput value={p.value} onChange={(x) => setPoint(i, { value: x ?? 0 })} step={0.5} />
                <TextInput value={p.label} onValueChange={(x) => setPoint(i, { label: x })} placeholder="Name, e.g. Meets expectations" aria-label="Point name" />
                <TextInput value={p.description ?? ""} onValueChange={(x) => setPoint(i, { description: x })} placeholder="What it means" aria-label="Point description" />
                <IconButton icon={Trash2} label="Remove point" size="sm" disabled={v.points.length <= 3} onClick={() => setV({ ...v, points: v.points.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={Plus} type="button" disabled={v.points.length >= 10}
              onClick={() => setV({ ...v, points: [...v.points, { value: (v.points[v.points.length - 1]?.value ?? 0) + 1, label: "", description: "" }] })}>Add point</Button>
          </div>
          <div className="space-y-3">
            <Toggle checked={v.is_default} onChange={(x) => setV({ ...v, is_default: x })} label="Default scale" description="Used when a template or cycle doesn't pick one" />
            <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="In use" />
          </div>
        </form>
      </Modal>
    </>
  );
}

/* ── KRAs ─────────────────────────────────────────────────────────────── */

export function KrasTab() {
  const toast = useToast();
  const deps = useDepartments();
  const desigs = useDesignations();
  const { rows, loading, refresh } = useList<Kra>("/performance/kras", "Couldn't load KRAs");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [edit, setEdit] = useState<Kra | "new" | null>(null);
  const [v, setV] = useState({ title: "", description: "", measure: "", weight: 20 as number | null, department_ids: [] as number[], designation_ids: [] as number[], active: true });
  const [assigning, setAssigning] = useState(false);
  const { saving, run } = useSave();
  function open(k: Kra | "new") {
    setEdit(k);
    setV(k === "new" ? { title: "", description: "", measure: "", weight: 20, department_ids: [], designation_ids: [], active: true }
      : { title: k.title, description: k.description ?? "", measure: k.measure ?? "", weight: k.weight, department_ids: k.tags.department_ids ?? [], designation_ids: k.tags.designation_ids ?? [], active: k.active });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { title: v.title, description: v.description || null, measure: v.measure || null, weight: v.weight, active: v.active,
      tags: { department_ids: v.department_ids, designation_ids: v.designation_ids } };
    const ok = await run(() => (edit === "new" ? api.post("/performance/kras", body) : api.put(`/performance/kras/${(edit as Kra).uuid}`, body)), "KRA saved");
    if (ok) { setEdit(null); refresh(); }
  }
  async function autoAssign() {
    setAssigning(true);
    try {
      const r = await api.post<{ assigned: number }>("/performance/kras/auto-assign");
      toast.success(r.assigned ? `${r.assigned} KRA${r.assigned === 1 ? "" : "s"} assigned` : "Everyone already has their KRAs");
    } catch (e) { toast.error("Couldn't assign", { description: e instanceof Error ? e.message : undefined }); } finally { setAssigning(false); }
  }
  const shown = rows.filter((k) => (!q || k.title.toLowerCase().includes(q.toLowerCase()))
    && (!filters.dep?.length || (k.tags.department_ids ?? []).some((d) => filters.dep.includes(String(d))))
    && (!filters.status?.length || filters.status.includes(k.active ? "on" : "off")));
  const columns: Column<Kra>[] = [
    { key: "title", header: "KRA", sortable: true, sortValue: (k) => k.title, cell: (k) => <div className="min-w-0"><p className="truncate text-ink">{k.title}</p>{k.measure && <p className="truncate text-[12.5px] text-muted">{k.measure}</p>}</div> },
    { key: "weight", header: "Weight", align: "right", cell: (k) => <span className="tabular text-muted">{k.weight}%</span> },
    { key: "tags", header: "Applies to", hideBelow: "md", cell: (k) => <TagNames tags={k.tags} deps={deps} desigs={desigs} /> },
    { key: "active", header: "Status", cell: (k) => <Badge tone={k.active ? "good" : "neutral"} dot>{k.active ? "In use" : "Off"}</Badge> },
  ];
  return (
    <>
      <FilterBar searchPlaceholder="Search KRAs" onSearchChange={setQ} values={filters} onChange={setFilters}
        filters={[{ key: "dep", label: "Department", multiple: true, options: deps.map((d) => ({ value: String(d.value), label: d.label })) },
          { key: "status", label: "Status", options: [{ value: "on", label: "In use" }, { value: "off", label: "Off" }] }]}
        actions={<>
          <Button variant="secondary" icon={Wand2} loading={assigning} onClick={autoAssign}>Auto-assign</Button>
          <Button variant="primary" icon={Plus} onClick={() => open("new")}>Add KRA</Button>
        </>} />
      <DataTable rows={shown} rowKey={(k) => k.uuid} columns={columns} loading={loading} onRowClick={open} defaultSort={{ key: "title", dir: "asc" }}
        rowActions={(k) => [{ label: "Edit", icon: Pencil, onSelect: () => open(k) }]} emptyIcon={BookMarked} emptyTitle="No KRAs yet"
        emptyHint="Key result areas describe what a role is responsible for. Tag them to departments and designations to assign them automatically." />
      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" busy={saving} title={edit === "new" ? "Add KRA" : "Edit KRA"}
        footer={<><ModalCancel /><Button variant="primary" type="submit" form="kra-form" loading={saving}>Save</Button></>}>
        <form id="kra-form" onSubmit={save} className="space-y-6">
          <FormGrid columns={2}>
            <Field label="Title" required className="sm:col-span-2"><TextInput value={v.title} onValueChange={(x) => setV({ ...v, title: x })} placeholder="e.g. Revenue achievement" autoFocusInModal /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={2} autoGrow /></Field>
            <Field label="How it is measured"><TextInput value={v.measure} onValueChange={(x) => setV({ ...v, measure: x })} placeholder="e.g. Bookings against quota" /></Field>
            <Field label="Default weight"><NumberInput value={v.weight} onChange={(x) => setV({ ...v, weight: x })} min={1} max={100} suffix="%" /></Field>
          </FormGrid>
          <FormSection title="Assign automatically to" description="People in these departments and designations get this KRA. Leave both empty to assign only by hand.">
            <FormGrid columns={2}>
              <Field label="Departments"><MultiSelect value={v.department_ids} onChange={(x) => setV({ ...v, department_ids: x })} options={deps} placeholder="Any department" /></Field>
              <Field label="Designations"><MultiSelect value={v.designation_ids} onChange={(x) => setV({ ...v, designation_ids: x })} options={desigs} placeholder="Any designation" /></Field>
            </FormGrid>
          </FormSection>
          <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="In use" />
        </form>
      </Modal>
    </>
  );
}

/* ── Competencies ─────────────────────────────────────────────────────── */

const CATEGORIES: SelectOption[] = [{ value: "core", label: "Core" }, { value: "leadership", label: "Leadership" }, { value: "functional", label: "Functional" }];

export function CompetenciesTab() {
  const deps = useDepartments();
  const desigs = useDesignations();
  const { rows, loading, refresh } = useList<Competency>("/performance/competencies", "Couldn't load competencies");
  const { rows: scales } = useList<RatingScale>("/performance/rating-scales", "Couldn't load scales");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [edit, setEdit] = useState<Competency | "new" | null>(null);
  type V = { name: string; category: string | null; description: string; rating_scale_id: number | null; weight: number | null; behaviours: { value: number; text: string }[]; skill_ids: number[]; department_ids: number[]; designation_ids: number[]; active: boolean };
  const [v, setV] = useState<V>({ name: "", category: "core", description: "", rating_scale_id: null, weight: 1, behaviours: [], skill_ids: [], department_ids: [], designation_ids: [], active: true });
  const { saving, run } = useSave();
  const scaleFor = (id: number | null) => scales.find((s) => s.id === id) ?? scales.find((s) => s.is_default) ?? scales[0];
  function open(c: Competency | "new") {
    setEdit(c);
    if (c === "new") {
      const s = scaleFor(null);
      setV({ name: "", category: "core", description: "", rating_scale_id: s?.id ?? null, weight: 1, behaviours: (s?.points ?? []).map((p) => ({ value: p.value, text: "" })), skill_ids: [], department_ids: [], designation_ids: [], active: true });
    } else {
      const s = scaleFor(c.rating_scale_id);
      const byVal = new Map(c.behaviours.map((b) => [b.value, b.text]));
      setV({ name: c.name, category: c.category, description: c.description ?? "", rating_scale_id: c.rating_scale_id, weight: c.weight,
        behaviours: (s?.points ?? []).map((p) => ({ value: p.value, text: byVal.get(p.value) ?? "" })), skill_ids: c.skill_ids,
        department_ids: c.tags.department_ids ?? [], designation_ids: c.tags.designation_ids ?? [], active: c.active });
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { name: v.name, category: v.category, description: v.description || null, rating_scale_id: v.rating_scale_id, weight: v.weight ?? 1,
      behaviours: v.behaviours.filter((b) => b.text.trim()), skill_ids: v.skill_ids, active: v.active,
      tags: { department_ids: v.department_ids, designation_ids: v.designation_ids } };
    const ok = await run(() => (edit === "new" ? api.post("/performance/competencies", body) : api.put(`/performance/competencies/${(edit as Competency).uuid}`, body)), "Competency saved");
    if (ok) { setEdit(null); refresh(); }
  }
  const scale = scaleFor(v.rating_scale_id);
  const shown = rows.filter((c) => (!q || c.name.toLowerCase().includes(q.toLowerCase())) && (!filters.cat?.length || filters.cat.includes(c.category ?? "")));
  const columns: Column<Competency>[] = [
    { key: "name", header: "Competency", sortable: true, sortValue: (c) => c.name, cell: (c) => <div className="min-w-0"><p className="truncate text-ink">{c.name}</p>{c.description && <p className="truncate text-[12.5px] text-muted">{c.description}</p>}</div> },
    { key: "cat", header: "Category", cell: (c) => <Badge tone={c.category === "leadership" ? "accent" : c.category === "functional" ? "info" : "neutral"}>{CATEGORIES.find((x) => x.value === c.category)?.label ?? "—"}</Badge> },
    { key: "levels", header: "Levels described", hideBelow: "md", align: "right", cell: (c) => <span className="tabular text-muted">{c.behaviours.length}</span> },
    { key: "tags", header: "Applies to", hideBelow: "lg", cell: (c) => (c.tags.department_ids?.length || c.tags.designation_ids?.length) ? <TagNames tags={c.tags} deps={deps} desigs={desigs} /> : <span className="text-muted">Everyone</span> },
    { key: "active", header: "Status", cell: (c) => <Badge tone={c.active ? "good" : "neutral"} dot>{c.active ? "In use" : "Off"}</Badge> },
  ];
  return (
    <>
      <FilterBar searchPlaceholder="Search competencies" onSearchChange={setQ} values={filters} onChange={setFilters}
        filters={[{ key: "cat", label: "Category", multiple: true, options: CATEGORIES.map((c) => ({ value: String(c.value), label: c.label })) }]}
        actions={<Button variant="primary" icon={Plus} onClick={() => open("new")}>Add competency</Button>} />
      <DataTable rows={shown} rowKey={(c) => c.uuid} columns={columns} loading={loading} onRowClick={open} defaultSort={{ key: "name", dir: "asc" }}
        rowActions={(c) => [{ label: "Edit", icon: Pencil, onSelect: () => open(c) }]} emptyIcon={Sparkles} emptyTitle="No competencies yet" />
      <Modal open={!!edit} onClose={() => setEdit(null)} size="xl" busy={saving} title={edit === "new" ? "Add competency" : "Edit competency"}
        footer={<><ModalCancel /><Button variant="primary" type="submit" form="comp-form" loading={saving}>Save</Button></>}>
        <form id="comp-form" onSubmit={save} className="space-y-7">
          <FormGrid columns={3}>
            <Field label="Name" required><TextInput value={v.name} onValueChange={(x) => setV({ ...v, name: x })} autoFocusInModal /></Field>
            <Field label="Category"><Select value={v.category} onChange={(x) => setV({ ...v, category: x })} options={CATEGORIES} clearable /></Field>
            <Field label="Weight" hint="Within the competencies section"><NumberInput value={v.weight} onChange={(x) => setV({ ...v, weight: x })} min={0.5} step={0.5} /></Field>
            <Field label="Description" className="sm:col-span-3"><Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={2} autoGrow /></Field>
          </FormGrid>
          <FormSection title="What each level looks like" description="Shown to reviewers next to the rating.">
            <Field label="Rating scale">
              <Select value={v.rating_scale_id} onChange={(x) => { const s = scaleFor(x); setV({ ...v, rating_scale_id: x, behaviours: (s?.points ?? []).map((p) => ({ value: p.value, text: v.behaviours.find((b) => b.value === p.value)?.text ?? "" })) }); }}
                options={scales.map((s) => ({ value: s.id, label: s.name }))} />
            </Field>
            <div className="mt-3 space-y-2">
              {v.behaviours.map((b, i) => (
                <div key={b.value} className="grid grid-cols-[180px_1fr] items-center gap-3">
                  <RatingPill value={b.value} scale={scale?.points} />
                  <TextInput value={b.text} onValueChange={(x) => setV({ ...v, behaviours: v.behaviours.map((y, j) => (j === i ? { ...y, text: x } : y)) })} placeholder="Behaviour at this level" aria-label={`Level ${b.value}`} />
                </div>
              ))}
            </div>
          </FormSection>
          <FormSection title="Skills and who it applies to">
            <FormGrid columns={3}>
              <Field label="Linked skills"><MasterSelect type="skill_category" multiple value={v.skill_ids} onChange={(x) => setV({ ...v, skill_ids: x })} placeholder="Pick skills" /></Field>
              <Field label="Departments"><MultiSelect value={v.department_ids} onChange={(x) => setV({ ...v, department_ids: x })} options={deps} placeholder="Everyone" /></Field>
              <Field label="Designations"><MultiSelect value={v.designation_ids} onChange={(x) => setV({ ...v, designation_ids: x })} options={desigs} placeholder="Everyone" /></Field>
            </FormGrid>
          </FormSection>
          <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="In use" />
        </form>
      </Modal>
    </>
  );
}

/* ── Review templates ─────────────────────────────────────────────────── */

const SECTION_KINDS: SelectOption[] = [
  { value: "goals", label: "Goals", description: "The person's objectives for the period" },
  { value: "kras", label: "KRAs", description: "Their key result areas" },
  { value: "competencies", label: "Competencies", description: "From the competency library" },
  { value: "questions", label: "Questions", description: "Your own rating or text questions" },
];

export function TemplatesTab() {
  const { rows, loading, refresh } = useList<ReviewTemplate>("/performance/templates", "Couldn't load templates");
  const { rows: scales } = useList<RatingScale>("/performance/rating-scales", "Couldn't load scales");
  const [edit, setEdit] = useState<ReviewTemplate | "new" | null>(null);
  const [v, setV] = useState<{ name: string; description: string; rating_scale_id: number | null; sections: TemplateSection[]; active: boolean }>({ name: "", description: "", rating_scale_id: null, sections: [], active: true });
  const { saving, run } = useSave();
  function open(t: ReviewTemplate | "new") {
    setEdit(t);
    setV(t === "new" ? { name: "", description: "", rating_scale_id: null, active: true, sections: [
      { key: "goals", kind: "goals", title: "Goals", weight: 50, questions: [] },
      { key: "competencies", kind: "competencies", title: "Competencies", weight: 50, questions: [] }] }
      : { name: t.name, description: t.description ?? "", rating_scale_id: t.rating_scale_id, sections: t.sections, active: t.active });
  }
  const total = v.sections.reduce((a, s) => a + (s.weight || 0), 0);
  const setSec = (i: number, p: Partial<TemplateSection>) => setV((x) => ({ ...x, sections: x.sections.map((s, j) => (j === i ? { ...s, ...p } : s)) }));
  const move = (i: number, d: number) => setV((x) => { const s = [...x.sections]; const j = i + d; if (j < 0 || j >= s.length) return x; [s[i], s[j]] = [s[j], s[i]]; return { ...x, sections: s }; });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const ok = await run(() => (edit === "new" ? api.post("/performance/templates", v) : api.put(`/performance/templates/${(edit as ReviewTemplate).uuid}`, v)), "Template saved");
    if (ok) { setEdit(null); refresh(); }
  }
  const columns: Column<ReviewTemplate>[] = [
    { key: "name", header: "Template", cell: (t) => <div className="min-w-0"><p className="truncate text-ink">{t.name}</p>{t.description && <p className="truncate text-[12.5px] text-muted">{t.description}</p>}</div> },
    { key: "sections", header: "Sections", cell: (t) => <span className="flex flex-wrap gap-1">{t.sections.map((s) => <Badge key={s.key}>{s.title} · {s.weight}%</Badge>)}</span> },
    { key: "active", header: "Status", cell: (t) => <Badge tone={t.active ? "good" : "neutral"} dot>{t.active ? "In use" : "Off"}</Badge> },
  ];
  return (
    <>
      <div className="mb-4 flex justify-end"><Button variant="primary" icon={Plus} onClick={() => open("new")}>Add template</Button></div>
      <DataTable rows={rows} rowKey={(t) => t.uuid} columns={columns} loading={loading} onRowClick={open}
        rowActions={(t) => [{ label: "Edit", icon: Pencil, onSelect: () => open(t) }]} emptyIcon={ClipboardList} emptyTitle="No templates yet" />
      <Modal open={!!edit} onClose={() => setEdit(null)} size="xl" busy={saving} title={edit === "new" ? "Add review template" : "Edit review template"}
        description="Sections are scored on the rating scale and weighted. Weights must add up to 100%."
        footer={<><span className={`mr-auto text-[13px] tabular ${Math.abs(total - 100) < 0.01 ? "text-emerald-700" : "text-rose-700"}`}>Total weight {total}%</span><ModalCancel /><Button variant="primary" type="submit" form="tmpl-form" loading={saving}>Save</Button></>}>
        <form id="tmpl-form" onSubmit={save} className="space-y-6">
          <FormGrid columns={3}>
            <Field label="Name" required><TextInput value={v.name} onValueChange={(x) => setV({ ...v, name: x })} /></Field>
            <Field label="Rating scale"><Select value={v.rating_scale_id} onChange={(x) => setV({ ...v, rating_scale_id: x })} options={scales.map((s) => ({ value: s.id, label: s.name }))} clearable placeholder="Default scale" /></Field>
            <Field label="Description"><TextInput value={v.description} onValueChange={(x) => setV({ ...v, description: x })} /></Field>
          </FormGrid>
          <div className="space-y-3">
            {v.sections.map((s, i) => (
              <div key={i} className="rounded-2xl border border-line bg-sunken/30 p-4">
                <div className="grid items-end gap-3 md:grid-cols-[160px_1fr_170px_auto]">
                  <Field label="Kind"><Select value={s.kind} onChange={(x) => x && setSec(i, { kind: x as TemplateSection["kind"], key: s.key || x })} options={SECTION_KINDS} /></Field>
                  <Field label="Title"><TextInput value={s.title} onValueChange={(x) => setSec(i, { title: x })} /></Field>
                  <Field label="Weight"><NumberInput value={s.weight} onChange={(x) => setSec(i, { weight: x ?? 0 })} min={0} max={100} suffix="%" /></Field>
                  <div className="flex gap-1 pb-1">
                    <IconButton icon={ArrowUp} label="Move up" size="sm" onClick={() => move(i, -1)} />
                    <IconButton icon={ArrowDown} label="Move down" size="sm" onClick={() => move(i, 1)} />
                    <IconButton icon={Trash2} label="Remove section" size="sm" onClick={() => setV({ ...v, sections: v.sections.filter((_, j) => j !== i) })} />
                  </div>
                </div>
                {s.kind === "questions" && (
                  <div className="mt-3 space-y-2">
                    {s.questions.map((q, j) => (
                      <div key={q.id || j} className="grid grid-cols-[1fr_170px_auto_auto] items-center gap-2">
                        <TextInput value={q.text} onValueChange={(x) => setSec(i, { questions: s.questions.map((y, k) => (k === j ? { ...y, text: x } : y)) })} placeholder="Question" aria-label="Question" />
                        <Select value={q.type} onChange={(x) => x && setSec(i, { questions: s.questions.map((y, k) => (k === j ? { ...y, type: x as "rating" | "text" } : y)) })}
                          options={[{ value: "rating", label: "Rating" }, { value: "text", label: "Written answer" }]} />
                        <Checkbox checked={q.required} label="Required" onChange={(x) => setSec(i, { questions: s.questions.map((y, k) => (k === j ? { ...y, required: x } : y)) })} />
                        <IconButton icon={Trash2} label="Remove question" size="sm" onClick={() => setSec(i, { questions: s.questions.filter((_, k) => k !== j) })} />
                      </div>
                    ))}
                    <Button size="sm" variant="ghost" icon={Plus} type="button" onClick={() => setSec(i, { questions: [...s.questions, { id: "", text: "", type: "text", required: true }] })}>Add question</Button>
                  </div>
                )}
              </div>
            ))}
            <Button variant="secondary" icon={Plus} type="button" onClick={() => setV({ ...v, sections: [...v.sections, { key: "", kind: "questions", title: "Questions", weight: 0, questions: [] }] })}>Add section</Button>
          </div>
          <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="In use" />
        </form>
      </Modal>
    </>
  );
}

