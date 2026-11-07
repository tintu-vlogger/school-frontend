"use client";

/*
 * Study materials (staff): files, links, YouTube videos and notes by program, subject and
 * syllabus topic, visible to chosen sections (or the whole program), with view counts.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Eye, FileText, Link2, NotebookText, Pencil, Plus, PlayCircle, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, MultiSelect, RadioCards, Section, Select,
  Skeleton, Tabs, TextInput, Textarea, Toggle, useConfirm, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { AttachmentPicker, programOptions, useLmsOptions } from "@/components/lms/shared";
import { uniqueBy, type FileRef, type Material, type Page } from "@/components/lms/lib";
import { KIND_ICON, KIND_LABEL, MaterialPreview } from "@/components/lms/material-preview";


type Unit = { id: number; title: string; topics: { id: number; title: string }[] };

export default function MaterialsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const { options } = useLmsOptions();
  const allocs = useMemo(() => options?.allocations ?? [], [options]);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; page: Page<Material> } | null>(null);
  const [formFor, setFormFor] = useState<Material | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<Material | null>(null);

  const key = JSON.stringify({ q, filters, page, size, nonce });
  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ page: String(page), size: String(size) });
    if (q) p.set("q", q);
    for (const [k, param] of [["program", "program_id"], ["subject", "subject_id"], ["kind", "kind"]] as const) if (filters[k]?.[0]) p.set(param, filters[k][0]);
    api.get<Page<Material>>(`/lms/materials?${p}`).then((r) => live && setData({ key, page: r }))
      .catch((e) => { if (live) { setData({ key, page: { items: [], total: 0, page: 1, size } }); toast.error(e.message); } });
    return () => { live = false; };
  }, [key, q, filters, page, size, toast]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const openForm = (m: Material | "new") => { setFormKey((k) => k + 1); setFormFor(m); setFormOpen(true); };
  const canTeach = !!options?.can_teach;
  const canEdit = (m: Material) => canTeach && (options?.can_manage || m.created_by_employee_id === options?.employee_id);

  async function remove(m: Material) {
    if (!(await confirm({ title: `Remove “${m.title}”?`, message: "Learners will no longer see it.", confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.delete(`/lms/materials/${m.uuid}`); toast.success("Removed"); setViewing(null); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove it"); }
  }

  const columns: Column<Material>[] = [
    { key: "title", header: "Material", cell: (m) => {
      const Icon = KIND_ICON[m.kind];
      return (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted"><Icon size={16} strokeWidth={1.4} /></span>
          <div className="min-w-0"><p className="truncate text-ink">{m.title}</p><p className="truncate text-[12.5px] text-muted">{[m.unit_title, m.topic].filter(Boolean).join(" · ") || KIND_LABEL[m.kind]}</p></div>
        </div>);
    } },
    { key: "subject", header: term("subject"), hideBelow: "md", cell: (m) => <span className="text-ink/80">{m.subject_name}</span> },
    { key: "for", header: "For", hideBelow: "lg", cell: (m) => <span className="text-muted">{m.sections?.length ? m.sections.map((s) => s.label).join(", ") : `All of ${m.program_name}`}</span> },
    { key: "views", header: "Views", align: "right", cell: (m) => <span className="tabular text-muted">{m.view_count ?? 0}</span> },
    { key: "added", header: "Added", hideBelow: "sm", cell: (m) => <span className="text-muted">{formatDate(m.created_at)}</span> },
    { key: "status", header: "", hideBelow: "sm", cell: (m) => !m.published ? <Badge>Hidden</Badge> : null },
  ];

  const filtered = !!q || Object.values(filters).some((v) => v?.length);
  return (
    <div>
      <PageHeader eyebrow="Teaching" title="Study materials" description="Notes, files, videos and links for learners, organised by subject and topic."
        actions={canTeach ? <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>Share material</Button> : undefined} />
      <FilterBar searchPlaceholder="Search materials" onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={[
          { key: "program", label: term("program"), options: programOptions(allocs).map((o) => ({ value: String(o.value), label: o.label })) },
          { key: "subject", label: term("subject"), options: uniqueBy(allocs, (a) => a.subject_id).map((a) => ({ value: String(a.subject_id), label: a.subject_name })) },
          { key: "kind", label: "Type", options: Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label })) },
        ]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={data?.page.items ?? []} rowKey={(m) => m.uuid} columns={columns} loading={data?.key !== key}
        onRowClick={setViewing}
        rowActions={(m) => [{ label: "Open", icon: Eye, onSelect: () => setViewing(m) },
          ...(canEdit(m) ? [{ label: "Edit", icon: Pencil, onSelect: () => openForm(m) }, "separator" as const, { label: "Remove", icon: Trash2, danger: true, onSelect: () => remove(m) }] : [])]}
        pagination={{ page, size, total: data?.page.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={BookOpen} emptyTitle={filtered ? "Nothing matches" : "No materials yet"}
        emptyHint={filtered ? "Try another search or clear the filters." : "Share notes, worksheets, videos and links. Learners find them in their portal."}
        emptyAction={!filtered && canTeach && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>Share material</Button>} />
      <MaterialForm key={formKey} target={formFor} open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refresh(); }} />
      <MaterialDetail m={viewing} onClose={() => setViewing(null)} canEdit={!!viewing && !!canEdit(viewing)} onEdit={(m) => { setViewing(null); openForm(m); }} onRemove={remove} />
    </div>
  );
}

function MaterialDetail({ m, onClose, canEdit, onEdit, onRemove }: { m: Material | null; onClose: () => void; canEdit: boolean; onEdit: (m: Material) => void; onRemove: (m: Material) => void }) {
  type View = { name: string; views: number; last_viewed_at: string };
  const [fullState, setFull] = useState<{ uuid: string; data: Material } | null>(null);
  const [viewsState, setViews] = useState<{ uuid: string; rows: View[] } | null>(null);
  const [tabState, setTab] = useState<{ uuid?: string; tab: string }>({ tab: "preview" });
  const full = fullState && fullState.uuid === m?.uuid ? fullState.data : null;
  const views = viewsState && viewsState.uuid === m?.uuid ? viewsState.rows : null;
  const tab = tabState.uuid === m?.uuid ? tabState.tab : "preview";
  useEffect(() => {
    if (!m) return;
    let live = true;
    api.get<Material>(`/lms/materials/${m.uuid}`).then((r) => live && setFull({ uuid: m.uuid, data: r })).catch(() => live && setFull({ uuid: m.uuid, data: m }));
    api.get<View[]>(`/lms/materials/${m.uuid}/views`).then((r) => live && setViews({ uuid: m.uuid, rows: r })).catch(() => live && setViews({ uuid: m.uuid, rows: [] }));
    return () => { live = false; };
  }, [m]);
  const d = full ?? m;
  return (
    <Modal open={!!m} onClose={onClose} size="lg" title={d?.title} description={d ? `${d.subject_name} · ${d.program_name}` : undefined}
      headerActions={d && canEdit && <Button size="sm" icon={Pencil} onClick={() => onEdit(d)}>Edit</Button>}
      footer={d && canEdit ? <Button icon={Trash2} onClick={() => onRemove(d)}>Remove</Button> : undefined}>
      {!d ? null : (
        <>
          <Tabs value={tab} onChange={(t) => setTab({ uuid: m?.uuid, tab: t })} className="-mt-2 mb-5" items={[{ value: "preview", label: "Material" }, { value: "views", label: "Viewed by", count: views?.length }]} />
          {tab === "preview" ? (
            <>
              {full ? <MaterialPreview m={full} /> : <Skeleton className="h-32 w-full" />}
              <Section title="Details" className="mt-6 border-t border-line">
                <KeyValue columns={3} items={[
                  { label: "Type", value: KIND_LABEL[d.kind] }, { label: "Topic", value: [d.unit_title, d.topic].filter(Boolean).join(" · ") },
                  { label: "For", value: d.sections?.length ? d.sections.map((s) => s.label).join(", ") : `All of ${d.program_name}` },
                  { label: "Shared by", value: d.created_by_name }, { label: "Added", value: formatDate(d.created_at) },
                  { label: "Views", value: d.view_count ?? 0 },
                ]} />
              </Section>
            </>
          ) : !views ? <Skeleton className="h-24 w-full" /> : views.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">No one has opened this yet.</p>
          ) : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {views.map((v, i) => <li key={i} className="flex items-center justify-between px-4 py-2.5 text-[13.5px]"><span className="text-ink">{v.name}</span><span className="text-muted">{v.views}× · {formatDateTime(v.last_viewed_at)}</span></li>)}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}

function MaterialForm({ target, open, onClose, onSaved }: { target: Material | "new"; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const { options } = useLmsOptions();
  const allocs = options?.allocations ?? [];
  const editing = target !== "new" ? target : null;
  const initial = {
    title: editing?.title ?? "", kind: editing?.kind ?? "file", url: editing?.url ?? "", description: editing?.description ?? "",
    program: editing?.program_id ?? null as number | null, subject: editing?.subject_id ?? null as number | null,
    sections: editing?.section_ids ?? [] as number[], topic: editing?.topic_id ?? null as number | null, topicText: editing?.topic_id ? "" : editing?.topic ?? "",
    files: (editing?.attachments ?? []) as FileRef[], published: editing?.published ?? true,
  };
  const [v, setV] = useState(initial);
  const [units, setUnits] = useState<Unit[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => { setV((s) => ({ ...s, [k]: x })); setErr(""); };
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  useEffect(() => {
    if (!v.program || !v.subject) { setUnits([]); return; }
    let live = true;
    api.get<{ units: Unit[] }>(`/lms/syllabus?program_id=${v.program}&subject_id=${v.subject}`).then((r) => live && setUnits(r.units)).catch(() => live && setUnits([]));
    return () => { live = false; };
  }, [v.program, v.subject]);
  const subjects = uniqueBy(allocs.filter((a) => a.program_id === v.program), (a) => a.subject_id).map((a) => ({ value: a.subject_id, label: a.subject_name }));
  const sections = uniqueBy(allocs.filter((a) => a.program_id === v.program && a.subject_id === v.subject), (a) => a.section_id).map((a) => ({ value: a.section_id, label: a.section_label }));
  const topicOptions: SelectOption<number>[] = units.flatMap((u) => u.topics.map((t) => ({ value: t.id, label: t.title, description: u.title })));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.title.trim() || !v.program || !v.subject) { setErr(`Add a title, ${term("program").toLowerCase()} and ${term("subject").toLowerCase()}`); return; }
    if ((v.kind === "link" || v.kind === "video") && !v.url.trim()) { setErr("Paste the link"); return; }
    if (v.kind === "file" && !v.files.length) { setErr("Upload a file"); return; }
    setSaving(true);
    const body = { title: v.title.trim(), kind: v.kind, url: v.url.trim() || null, description: v.description.trim() || null, program_id: v.program,
      subject_id: v.subject, section_ids: v.sections, topic_id: v.topic, topic: v.topic ? null : v.topicText.trim() || null,
      attachments: v.files.map((f) => f.uuid), published: v.published };
    try {
      if (editing) await api.put(`/lms/materials/${editing.uuid}`, body); else await api.post("/lms/materials", body);
      toast.success(editing ? "Material updated" : "Material shared"); onSaved();
    } catch (x) { toast.error("Couldn't save", { description: x instanceof Error ? x.message : undefined }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving} title={editing ? "Edit material" : "Share material"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="mat-form" loading={saving}>{editing ? "Save changes" : "Share"}</Button></>}>
      <form id="mat-form" onSubmit={submit} noValidate className="space-y-5">
        <RadioCards columns={4} value={v.kind} onChange={(x) => set("kind", x)} options={[
          { value: "file", label: "File", icon: FileText }, { value: "video", label: "Video", icon: PlayCircle },
          { value: "link", label: "Link", icon: Link2 }, { value: "note", label: "Note", icon: NotebookText }]} />
        <FormGrid>
          <Field label="Title" required error={err} className="sm:col-span-2"><TextInput autoFocusInModal value={v.title} onValueChange={(x) => set("title", x)} placeholder="e.g. Chapter 3 notes" /></Field>
          <Field label={term("program")} required>
            <Select value={v.program} onChange={(x) => setV((s) => ({ ...s, program: x, subject: null, sections: [], topic: null }))} options={programOptions(allocs)} />
          </Field>
          <Field label={term("subject")} required>
            <Select value={v.subject} onChange={(x) => setV((s) => ({ ...s, subject: x, sections: [], topic: null }))} options={subjects} disabled={!v.program} />
          </Field>
          <Field label={`Visible to ${term("sections").toLowerCase()}`} hint={`Leave empty for every ${term("section").toLowerCase()}`} className="sm:col-span-2">
            <MultiSelect value={v.sections} onChange={(x) => set("sections", x)} options={sections} disabled={!v.subject} placeholder={`All ${term("sections").toLowerCase()}`} />
          </Field>
          {topicOptions.length > 0 ? (
            <Field label="Topic" aside="From the syllabus" className="sm:col-span-2"><Select value={v.topic} onChange={(x) => set("topic", x)} options={topicOptions} clearable placeholder="Pick a topic" /></Field>
          ) : (
            <Field label="Topic" aside="Optional" className="sm:col-span-2"><TextInput value={v.topicText} onValueChange={(x) => set("topicText", x)} placeholder="e.g. Fractions" /></Field>
          )}
          {(v.kind === "link" || v.kind === "video") && (
            <Field label={v.kind === "video" ? "Video link" : "Link"} required className="sm:col-span-2" hint={v.kind === "video" ? "YouTube links play inside the page." : undefined}>
              <TextInput value={v.url} onValueChange={(x) => set("url", x)} placeholder="https://" />
            </Field>
          )}
          <Field label={v.kind === "note" ? "Note" : "Description"} className="sm:col-span-2" hint="Start lines with - for bullets, # for a heading.">
            <Textarea value={v.description} onValueChange={(x) => set("description", x)} rows={v.kind === "note" ? 10 : 3} autoGrow />
          </Field>
        </FormGrid>
        {(v.kind === "file" || v.kind === "note") && <Field label="Files" aside={v.kind === "note" ? "Optional" : undefined}><AttachmentPicker value={v.files} onChange={(x) => set("files", x)} /></Field>}
        <Toggle checked={v.published} onChange={(x) => set("published", x)} label="Visible to learners" />
      </form>
    </Modal>
  );
}
