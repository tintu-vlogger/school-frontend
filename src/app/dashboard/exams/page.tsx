"use client";

/*
 * Exams: the list for the session (FilterBar + DataTable). Row click opens the exam in a
 * modal with its timetable (papers per program: date, time, marks), seating plan, admit
 * cards and results; New / Edit open the form modal.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Archive, CalendarPlus, Eye, FileDown, FileSpreadsheet, Pencil, Plus, RotateCcw, Send, Sparkles, Trash2, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, IconButton, KeyValue, Modal, ModalCancel, MultiSelect,
  NumberInput, Section, Select, Skeleton, Tabs, TextInput, Textarea, TimeInput, Toggle, useConfirm,
  type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import {
  downloadFile, fmt, PhaseBadge, useExamOptions, useSections, type Exam, type Options, type Paper, type Seat,
} from "@/components/exams/shared";

type Page = { items: Exam[]; total: number; page: number; size: number };

export default function ExamsPage() {
  const toast = useToast();
  const { can } = useAccess();
  const canManage = can("exams.manage");
  const { term } = useInstitution();
  const { options, reload: reloadOptions } = useExamOptions();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ nonce: number; page: Page } | null>(null);
  const [formFor, setFormFor] = useState<Exam | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ page: String(page), size: String(size) });
    if (q) p.set("q", q);
    if (filters.term?.[0]) p.set("term_id", filters.term[0]);
    if (filters.status?.[0] === "archived") p.set("archived", "true");
    else if (filters.status?.[0]) p.set("status", filters.status[0]);
    api.get<Page>(`/exams?${p}`).then((r) => { if (live) setData({ nonce, page: r }); })
      .catch((e) => { if (live) { setData({ nonce, page: { items: [], total: 0, page: 1, size } }); toast.error("Couldn't load exams", { description: e.message }); } });
    return () => { live = false; };
  }, [q, filters, page, size, nonce, toast]);
  const refresh = useCallback(() => { setNonce((n) => n + 1); reloadOptions(); }, [reloadOptions]);
  const openForm = (e: Exam | "new") => { setFormKey((k) => k + 1); setFormFor(e); setFormOpen(true); };

  async function archive(e: Exam) {
    if (!(await confirm({ title: `Archive ${e.name}?`, message: "It disappears from marks entry and lists. Marks stay and you can restore it.", confirmLabel: "Archive", tone: "danger" }))) return;
    try { await api.delete(`/exams/${e.uuid}`); toast.success("Exam archived"); setViewing(null); refresh(); }
    catch (err) { toast.error("Couldn't archive", { description: (err as Error).message }); }
  }

  const columns: Column<Exam>[] = [
    { key: "name", header: "Exam", sortable: true, sortValue: (e) => e.name, cell: (e) => (
      <div className="min-w-0"><p className="truncate text-ink">{e.name}</p>
        <p className="truncate text-[12.5px] text-muted">{[e.exam_type_name, e.term_name].filter(Boolean).join(" · ") || "—"}</p></div>) },
    { key: "dates", header: "Dates", sortable: true, sortValue: (e) => e.start_date, cell: (e) => e.start_date
      ? <span className="text-ink/80">{formatDate(e.start_date)}{e.end_date && e.end_date !== e.start_date ? ` – ${formatDate(e.end_date)}` : ""}</span>
      : <span className="text-faint">Not set</span> },
    { key: "programs", header: term("programs"), hideBelow: "md", cell: (e) => <span className="text-muted">{e.program_names.length ? (e.program_names.length > 3 ? `${e.program_names.length} ${term("programs").toLowerCase()}` : e.program_names.join(", ")) : "All"}</span> },
    { key: "papers", header: "Papers", align: "right", hideBelow: "sm", cell: (e) => <span className="tabular text-muted">{e.paper_count}</span> },
    { key: "phase", header: "Status", cell: (e) => <PhaseBadge phase={e.phase} /> },
  ];
  const termOptions = (options?.terms ?? []).map((t) => ({ value: String(t.id), label: t.name }));
  const loading = data?.nonce !== nonce;
  const filtered = !!q || Object.values(filters).some((v) => v?.length);

  return (
    <div>
      <PageHeader eyebrow="Exams" title="Exams" description={`Plan assessments for ${options?.session?.name ?? "the session"}: timetable, seating, admit cards and results.`}
        actions={<>
          <Link href="/dashboard/exams/marks"><Button icon={FileSpreadsheet}>Marks entry</Button></Link>
          {canManage && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New exam</Button>}
        </>} />
      <FilterBar searchPlaceholder="Search exams" onSearchChange={(v) => { setQ(v); setPage(1); }} values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[
          { key: "term", label: term("term"), options: termOptions },
          { key: "status", label: "Status", options: [{ value: "draft", label: "Draft" }, { value: "scheduled", label: "Scheduled" }, { value: "published", label: "Results out" }, { value: "archived", label: "Archived" }] },
        ]} />
      <DataTable rows={data?.page.items ?? []} rowKey={(e) => e.uuid} columns={columns} loading={loading}
        onRowClick={(e) => setViewing(e.uuid)}
        rowActions={(e) => [
          { label: "Open", icon: Eye, onSelect: () => setViewing(e.uuid) },
          ...(canManage ? [{ label: "Edit", icon: Pencil, onSelect: () => openForm(e) }, "separator" as const,
            e.archived ? { label: "Restore", icon: RotateCcw, onSelect: async () => { await api.post(`/exams/${e.uuid}/restore`); refresh(); } }
              : { label: "Archive", icon: Archive, danger: true, onSelect: () => archive(e) }] : []),
        ]}
        pagination={{ page, size, total: data?.page.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={CalendarPlus}
        emptyTitle={filtered ? "No exams match" : "No exams yet"}
        emptyHint={filtered ? "Try another search or clear the filters." : "Create an exam such as a unit test or mid-term. Papers are added from the curriculum."}
        emptyAction={!filtered && canManage && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New exam</Button>} />

      <ExamFormModal key={formKey} target={formFor} open={formOpen} options={options} onClose={() => setFormOpen(false)}
        onSaved={(e) => { setFormOpen(false); refresh(); if (formFor === "new") setViewing(e.uuid); }} />
      <ExamDetailModal uuid={viewing} options={options} canManage={canManage} onClose={() => setViewing(null)}
        onEdit={(e) => openForm(e)} onArchive={archive} onChanged={refresh} />
    </div>
  );
}

/* ── Form ──────────────────────────────────────────────────────────────── */

function ExamFormModal({ target, open, options, onClose, onSaved }: {
  target: Exam | "new"; open: boolean; options: Options | null; onClose: () => void; onSaved: (e: Exam) => void;
}) {
  const toast = useToast();
  const { term } = useInstitution();
  const editing = target !== "new" ? target : null;
  const initial = {
    name: editing?.name ?? "", code: editing?.code ?? "", exam_type_id: editing?.exam_type_id ?? null as number | null,
    term_id: editing?.term_id ?? null as number | null, program_ids: editing?.program_ids ?? [] as number[],
    start_date: editing?.start_date ?? "", end_date: editing?.end_date ?? "", marks_due_on: editing?.marks_due_on ?? "",
    grading_scheme_id: editing?.grading_scheme_id ?? null as number | null, status: editing?.status === "draft" || !editing ? (editing?.status ?? "scheduled") : "scheduled",
    ranking: editing?.ranking ?? true, instructions: editing?.instructions ?? "", max_marks: null as number | null, generate: true,
  };
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((p) => ({ ...p, [k]: x }));
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setErr("Give the exam a name"); return; }
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: v.name.trim(), code: v.code.trim() || null, exam_type_id: v.exam_type_id, term_id: v.term_id,
      program_ids: v.program_ids, start_date: v.start_date || null, end_date: v.end_date || null,
      marks_due_on: v.marks_due_on || null, grading_scheme_id: v.grading_scheme_id, ranking: v.ranking,
      instructions: v.instructions.trim() || null,
    };
    if (!editing || editing.status !== "published") payload.status = v.status;
    try {
      const res = editing ? await api.put<Exam>(`/exams/${editing.uuid}`, payload)
        : await api.post<Exam>("/exams", { ...payload, generate_papers: v.generate, max_marks: v.max_marks });
      toast.success(editing ? "Exam saved" : `Exam created with ${res.paper_count} papers`);
      onSaved(res);
    } catch (x) { toast.error("Couldn't save the exam", { description: (x as Error).message }); }
    finally { setSaving(false); }
  }

  const typeOpts = (options?.exam_types ?? []).map((t) => ({ value: t.id, label: t.name }));
  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving} title={editing ? `Edit ${editing.name}` : "New exam"}
      description={editing ? undefined : "An assessment event: unit test, mid-term, final, practical …"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="exam-form" loading={saving}>{editing ? "Save changes" : "Create exam"}</Button></>}>
      <form id="exam-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Name" required error={err} className="sm:col-span-2">
            <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { set("name", x); setErr(""); }} placeholder="e.g. Mid-term examination" />
          </Field>
          <Field label="Type">
            <Select value={v.exam_type_id} clearable options={typeOpts} placeholder="Pick a type"
              onChange={(x) => { set("exam_type_id", x); const t = options?.exam_types.find((y) => y.id === x); if (t?.default_max_marks && !editing) set("max_marks", t.default_max_marks); }} />
          </Field>
          <Field label={term("term")} aside="Optional">
            <Select value={v.term_id} clearable options={(options?.terms ?? []).map((t) => ({ value: t.id, label: t.name }))} onChange={(x) => set("term_id", x)} placeholder="Whole session" />
          </Field>
          <Field label={`${term("programs")} writing it`} hint="Leave empty for all" className="sm:col-span-2">
            <MultiSelect value={v.program_ids} onChange={(x) => set("program_ids", x)} placeholder={`All ${term("programs").toLowerCase()}`}
              options={(options?.programs ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
          <Field label="First day"><DateInput value={v.start_date} onChange={(x) => set("start_date", x)} clearable /></Field>
          <Field label="Last day"><DateInput value={v.end_date} onChange={(x) => set("end_date", x)} min={v.start_date || undefined} clearable /></Field>
          <Field label="Marks due by" aside="Optional"><DateInput value={v.marks_due_on} onChange={(x) => set("marks_due_on", x)} clearable /></Field>
          <Field label="Grading" aside="Optional" hint={`Empty = each ${term("program").toLowerCase()}'s scheme`}>
            <Select value={v.grading_scheme_id} clearable options={(options?.schemes ?? []).map((s) => ({ value: s.id, label: s.name }))} onChange={(x) => set("grading_scheme_id", x)} placeholder="Default" />
          </Field>
          {!editing && <>
            <Field label="Maximum marks per paper" hint="Change single papers later"><NumberInput value={v.max_marks} onChange={(x) => set("max_marks", x)} min={1} placeholder="100" /></Field>
            <div className="flex items-end pb-1"><Toggle checked={v.generate} onChange={(x) => set("generate", x)} label="Add papers from the curriculum" /></div>
          </>}
          {(!editing || editing.status !== "published") && (
            <div className="sm:col-span-2"><Toggle checked={v.status === "scheduled"} onChange={(x) => set("status", x ? "scheduled" : "draft")}
              label="Visible to teachers and families" description="Drafts are only seen by the exam team." /></div>
          )}
          <div className="sm:col-span-2"><Toggle checked={v.ranking} onChange={(x) => set("ranking", x)} label="Rank learners" description="Work out section and class ranks in the results." /></div>
          <Field label="Instructions on admit cards" aside="Optional" className="sm:col-span-2">
            <Textarea value={v.instructions} onValueChange={(x) => set("instructions", x)} rows={3} placeholder="Reach 15 minutes early. Bring your admit card." />
          </Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Details ───────────────────────────────────────────────────────────── */

function ExamDetailModal({ uuid, options, canManage, onClose, onEdit, onArchive, onChanged }: {
  uuid: string | null; options: Options | null; canManage: boolean; onClose: () => void; onEdit: (e: Exam) => void;
  onArchive: (e: Exam) => void; onChanged: () => void;
}) {
  const toast = useToast();
  const { term } = useInstitution();
  const { can } = useAccess();
  const [exam, setExam] = useState<Exam | null>(null);
  const [tab, setTab] = useState("timetable");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!uuid) return;
    let live = true;
    api.get<Exam>(`/exams/${uuid}`).then((r) => { if (live) setExam(r); }).catch((e) => toast.error("Couldn't open the exam", { description: e.message }));
    return () => { live = false; };
  }, [uuid, tick, toast]);
  const reload = () => { setTick((t) => t + 1); onChanged(); };
  const e = exam && exam.uuid === uuid ? exam : null;

  return (
    <Modal open={!!uuid} onClose={() => { setTab("timetable"); onClose(); }} size="full" title={e?.name ?? "Exam"} flush
      description={e ? [e.exam_type_name, e.term_name, e.start_date && `${formatDate(e.start_date)}${e.end_date && e.end_date !== e.start_date ? ` – ${formatDate(e.end_date)}` : ""}`].filter(Boolean).join(" · ") : undefined}
      headerActions={e && canManage && <Button size="sm" icon={Pencil} onClick={() => onEdit(e)}>Edit</Button>}
      footerStart={e && canManage && !e.archived && <Button icon={Archive} onClick={() => onArchive(e)}>Archive</Button>}
      footer={e && <Link href={`/dashboard/exams/marks?exam=${e.uuid}`}><Button variant="primary" icon={FileSpreadsheet}>Marks entry</Button></Link>}>
      {!e ? <div className="space-y-3 p-6"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-40 w-full" /></div> : (
        <>
          <div className="border-b border-line px-6 pt-2">
            <Tabs value={tab} onChange={setTab} items={[
              { value: "timetable", label: "Timetable", count: e.paper_count },
              { value: "seating", label: "Seating & admit cards" },
              { value: "overview", label: "Overview" },
            ]} />
          </div>
          <div className="p-6">
            {tab === "timetable" && <Timetable exam={e} options={options} canManage={canManage} onSaved={reload} />}
            {tab === "seating" && <Seating exam={e} options={options} canManage={canManage} onSaved={reload} />}
            {tab === "overview" && (
              <div className="space-y-6">
                <KeyValue columns={3} items={[
                  { label: "Status", value: <PhaseBadge phase={e.phase} /> },
                  { label: term("session"), value: e.session_name },
                  { label: term("programs"), value: e.program_names.join(", ") || "All" },
                  { label: "Marks due", value: e.marks_due_on ? formatDate(e.marks_due_on) : null },
                  { label: "Ranking", value: e.ranking ? "On" : "Off" },
                  { label: "Results published", value: e.published_at ? formatDate(e.published_at) : "Not yet" },
                  { label: "Instructions", value: e.instructions, span: 3 },
                ]} />
                <div className="flex flex-wrap gap-2">
                  <Link href={`/dashboard/exams/report-cards?source=exam:${e.uuid}`}><Button icon={Send}>{can("exams.publish") ? "Results & publishing" : "Results"}</Button></Link>
                  <Link href={`/dashboard/exams/analysis?source=exam:${e.uuid}`}><Button icon={Sparkles}>Analysis</Button></Link>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

type PaperDraft = Paper & { _dirty?: boolean };
const numCls = "h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[14px] tabular outline-none focus:border-primary disabled:bg-sunken/50 disabled:text-muted";

function Timetable({ exam, options, canManage, onSaved }: { exam: Exam; options: Options | null; canManage: boolean; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const programs = useMemo(() => {
    const ids = Array.from(new Set((exam.papers ?? []).map((p) => p.program_id)));
    return ids.map((id) => ({ value: id, label: exam.papers!.find((p) => p.program_id === id)?.program_name ?? String(id) }));
  }, [exam]);
  const [program, setProgram] = useState<number | null>(programs[0]?.value ?? null);
  const [rows, setRows] = useState<PaperDraft[]>(exam.papers ?? []);
  const [saving, setSaving] = useState(false);
  const [copyAll, setCopyAll] = useState(false);
  useEffect(() => { setRows(exam.papers ?? []); }, [exam]);
  useEffect(() => { if (!programs.some((p) => p.value === program)) setProgram(programs[0]?.value ?? null); }, [programs, program]);
  const shown = rows.filter((r) => r.program_id === program);
  const dirty = rows.some((r) => r._dirty);
  const edit = (uuid: string, patch: Partial<Paper>) => setRows((rs) => rs.map((r) => r.uuid === uuid ? { ...r, ...patch, _dirty: true } : r));

  async function save() {
    setSaving(true);
    try {
      let list = rows.filter((r) => r._dirty);
      if (copyAll && program) {
        // Same dates and times for every program writing the same subject.
        const src = rows.filter((r) => r.program_id === program);
        list = rows.map((r) => {
          const s = src.find((x) => x.subject_id === r.subject_id);
          return s && r.program_id !== program ? { ...r, paper_date: s.paper_date, start_time: s.start_time, end_time: s.end_time, _dirty: true } : r;
        }).filter((r) => r._dirty);
      }
      await api.put(`/exams/${exam.uuid}/papers`, list.map((r) => ({
        uuid: r.uuid, program_id: r.program_id, subject_id: r.subject_id, paper_date: r.paper_date || null,
        start_time: r.start_time || null, end_time: r.end_time || null, room_id: r.room_id, invigilator_id: r.invigilator_id,
        max_marks: r.max_marks, pass_marks: r.pass_marks, components: r.components, entry_mode: r.entry_mode,
        counts_in_total: r.entry_mode === "marks" ? r.counts_in_total : false, credits: r.credits,
        grading_scheme_id: r.grading_scheme_id, sort_order: r.sort_order,
      })));
      toast.success("Timetable saved");
      onSaved();
    } catch (x) { toast.error("Couldn't save the timetable", { description: (x as Error).message }); }
    finally { setSaving(false); }
  }
  async function generate() {
    try {
      const r = await api.post<{ added: number }>(`/exams/${exam.uuid}/papers/generate`, {});
      toast.success(r.added ? `${r.added} papers added` : "Every subject already has a paper");
      onSaved();
    } catch (x) { toast.error("Couldn't add papers", { description: (x as Error).message }); }
  }
  async function remove(p: Paper) {
    try { await api.delete(`/exams/${exam.uuid}/papers/${p.uuid}`); toast.success("Paper removed"); onSaved(); }
    catch (x) { toast.error("Couldn't remove the paper", { description: (x as Error).message }); }
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
        <p className="text-[14.5px] text-ink">No papers yet</p>
        <p className="mt-1 text-[13.5px] text-muted">Add a paper for every {term("subject").toLowerCase()} in the curriculum of each {term("program").toLowerCase()}.</p>
        {canManage && <Button className="mt-4" variant="primary" icon={Wand2} onClick={generate}>Add papers from the curriculum</Button>}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-60"><Select value={program} onChange={setProgram} options={programs} aria-label={term("program")} /></div>
        {canManage && <Button size="sm" icon={Wand2} onClick={generate}>Add missing papers</Button>}
        {(exam.clashes?.length ?? 0) > 0 && (
          <span className="flex items-center gap-1.5 text-[13px] text-amber-700"><AlertTriangle size={15} strokeWidth={1.4} />
            {exam.clashes!.length} clash{exam.clashes!.length > 1 ? "es" : ""}: {exam.clashes!.slice(0, 2).map((c) => `${c.program} ${formatDate(c.date)}`).join(", ")}</span>
        )}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[860px] text-[13.5px]">
          <thead className="bg-sunken/60 text-left text-[12px] text-muted">
            <tr><th className="px-3 py-2 font-normal">{term("subject")}</th><th className="px-2 py-2 font-normal">Date</th><th className="px-2 py-2 font-normal">Start</th>
              <th className="px-2 py-2 font-normal">End</th><th className="px-2 py-2 font-normal">Max</th><th className="px-2 py-2 font-normal">Pass</th>
              <th className="px-2 py-2 font-normal">Entry</th><th className="px-2 py-2 font-normal">Room</th><th className="w-8" /></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.map((p) => (
              <tr key={p.uuid} className={p._dirty ? "bg-primary-soft/20" : ""}>
                <td className="px-3 py-2"><p className="text-ink">{p.subject_name}</p>
                  {p.components.length > 0 && <p className="text-[12px] text-muted">{p.components.map((c) => `${c.label} ${c.max_marks}`).join(" + ")}</p>}</td>
                <td className="px-2 py-1.5 w-40"><DateInput value={p.paper_date ?? ""} onChange={(x) => edit(p.uuid, { paper_date: x })} disabled={!canManage} clearable /></td>
                <td className="px-2 py-1.5 w-28"><TimeInput value={p.start_time ?? ""} onChange={(x) => edit(p.uuid, { start_time: x })} disabled={!canManage} /></td>
                <td className="px-2 py-1.5 w-28"><TimeInput value={p.end_time ?? ""} onChange={(x) => edit(p.uuid, { end_time: x })} disabled={!canManage} /></td>
                <td className="px-2 py-1.5 w-20">{p.entry_mode === "marks" ? <input className={numCls} inputMode="decimal" value={p.max_marks} aria-label={`Maximum marks for ${p.subject_name}`}
                  onChange={(e) => edit(p.uuid, { max_marks: Number(e.target.value) || 0, components: [] })} disabled={!canManage || p.components.length > 0} /> : <span className="text-faint">—</span>}</td>
                <td className="px-2 py-1.5 w-20">{p.entry_mode === "marks" ? <input className={numCls} inputMode="decimal" value={p.pass_marks ?? ""} aria-label={`Pass marks for ${p.subject_name}`}
                  onChange={(e) => edit(p.uuid, { pass_marks: e.target.value === "" ? null : Number(e.target.value) })} disabled={!canManage} /> : <span className="text-faint">—</span>}</td>
                <td className="px-2 py-1.5 w-32"><Select value={p.entry_mode} disabled={!canManage} onChange={(x) => x && edit(p.uuid, { entry_mode: x as "marks" | "grade" })}
                  options={[{ value: "marks", label: "Marks" }, { value: "grade", label: "Grade" }]} /></td>
                <td className="px-2 py-1.5 w-40"><Select value={p.room_id} clearable disabled={!canManage} onChange={(x) => edit(p.uuid, { room_id: x })}
                  options={(options?.rooms ?? []).map((r) => ({ value: r.id, label: r.name }))} placeholder="—" /></td>
                <td className="px-1">{canManage && <IconButton icon={Trash2} label="Remove paper" onClick={() => remove(p)} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Toggle checked={copyAll} onChange={setCopyAll} label={`Use these dates for every ${term("program").toLowerCase()}`} size="sm" />
          <Button variant="primary" loading={saving} disabled={!dirty && !copyAll} onClick={save}>Save timetable</Button>
        </div>
      )}
    </div>
  );
}

const searchStaff = async (q: string): Promise<SelectOption<number>[]> => {
  const r = await api.get<{ id: number; first_name: string; last_name: string; designation_name?: string | null }[]>(`/employees/?status=active${q ? `&search=${encodeURIComponent(q)}` : ""}`);
  return (Array.isArray(r) ? r : []).slice(0, 30).map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}`.trim(), description: e.designation_name ?? undefined }));
};

function Seating({ exam, options, canManage, onSaved }: { exam: Exam; options: Options | null; canManage: boolean; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const allSections = useSections();
  const sections = allSections.filter((s) => !exam.program_ids.length || exam.program_ids.includes(s.program_id));
  const [rows, setRows] = useState<Seat[]>(exam.seating ?? []);
  const [rooms, setRooms] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  const [ticketSection, setTicketSection] = useState<number | null>(null);
  useEffect(() => { setRows(exam.seating ?? []); }, [exam]);
  const roomOpts = (options?.rooms ?? []).map((r) => ({ value: r.id, label: r.name, description: r.capacity ? `${r.capacity} seats` : undefined }));
  const edit = (i: number, patch: Partial<Seat>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function save() {
    if (rows.some((r) => !r.room_id || !r.section_id)) { toast.error("Pick a room and a section on every row"); return; }
    setSaving(true);
    try {
      await api.put(`/exams/${exam.uuid}/seating`, rows.map((r) => ({ room_id: r.room_id, section_id: r.section_id, roll_from: r.roll_from || null, roll_to: r.roll_to || null, seats: r.seats, invigilator_id: r.invigilator_id })));
      toast.success("Seating plan saved"); onSaved();
    } catch (x) { toast.error("Couldn't save the seating plan", { description: (x as Error).message }); }
    finally { setSaving(false); }
  }
  async function auto() {
    if (!rooms.length) { toast.error("Pick the rooms to fill"); return; }
    try { await api.post(`/exams/${exam.uuid}/seating/auto`, { room_ids: rooms }); toast.success("Rooms filled in roll order"); onSaved(); }
    catch (x) { toast.error("Couldn't fill the rooms", { description: (x as Error).message }); }
  }
  async function tickets() {
    try { await downloadFile(`/exams/${exam.uuid}/hall-tickets.pdf${ticketSection ? `?section_id=${ticketSection}` : ""}`, "admit-cards.pdf"); }
    catch (x) { toast.error("Couldn't make admit cards", { description: (x as Error).message }); }
  }

  return (
    <div className="space-y-6">
      <Section title="Admit cards" description="One page per learner with the timetable, room and instructions.">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-64"><Select value={ticketSection} onChange={setTicketSection} clearable placeholder={`Every ${term("section").toLowerCase()}`}
            options={sections.map((s) => ({ value: s.id, label: s.label }))} /></div>
          <Button icon={FileDown} onClick={tickets}>Download admit cards</Button>
        </div>
      </Section>
      <Section title="Seating plan" description="Which roll numbers of each section sit in which room.">
        {canManage && roomOpts.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="w-full sm:w-80"><MultiSelect value={rooms} onChange={setRooms} options={roomOpts} placeholder="Rooms to fill" /></div>
            <Button size="sm" icon={Wand2} onClick={auto}>Fill automatically</Button>
          </div>
        )}
        {roomOpts.length === 0 && <p className="mb-3 text-[13px] text-muted">Add rooms under Academics to plan seating.</p>}
        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[720px] text-[13.5px]">
              <thead className="bg-sunken/60 text-left text-[12px] text-muted"><tr>
                <th className="px-3 py-2 font-normal">Room</th><th className="px-2 py-2 font-normal">{term("section")}</th>
                <th className="px-2 py-2 font-normal">From roll</th><th className="px-2 py-2 font-normal">To roll</th>
                <th className="px-2 py-2 font-normal">Invigilator</th><th className="w-8" /></tr></thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5 w-44"><Select value={r.room_id || null} onChange={(x) => x && edit(i, { room_id: x })} options={roomOpts} disabled={!canManage} /></td>
                    <td className="px-2 py-1.5 w-48"><Select value={r.section_id || null} onChange={(x) => x && edit(i, { section_id: x })} options={sections.map((s) => ({ value: s.id, label: s.label }))} disabled={!canManage} /></td>
                    <td className="px-2 py-1.5 w-24"><TextInput value={r.roll_from ?? ""} onValueChange={(x) => edit(i, { roll_from: x })} disabled={!canManage} /></td>
                    <td className="px-2 py-1.5 w-24"><TextInput value={r.roll_to ?? ""} onValueChange={(x) => edit(i, { roll_to: x })} disabled={!canManage} /></td>
                    <td className="px-2 py-1.5 w-52"><Select value={r.invigilator_id} clearable loadOptions={searchStaff} disabled={!canManage} onChange={(x) => edit(i, { invigilator_id: x })}
                      selectedOption={r.invigilator_id ? { value: r.invigilator_id, label: r.invigilator_name || "Invigilator" } : null} placeholder="Search staff" /></td>
                    <td className="px-1">{canManage && <IconButton icon={Trash2} label="Remove row" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canManage && (
          <div className="mt-3 flex flex-wrap justify-between gap-3">
            <Button size="sm" icon={Plus} onClick={() => setRows((rs) => [...rs, { room_id: 0, section_id: 0, roll_from: "", roll_to: "", seats: null, invigilator_id: null }])}>Add row</Button>
            <Button variant="primary" loading={saving} onClick={save}>Save seating plan</Button>
          </div>
        )}
        {!rows.length && !canManage && <p className="text-[13px] text-faint">No seating plan yet.</p>}
      </Section>
      <p className="text-[12.5px] text-muted"><Badge tone="neutral">{fmt(exam.paper_count, 0)} papers</Badge></p>
    </div>
  );
}
