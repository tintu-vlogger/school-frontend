"use client";

/*
 * Homework & assignments (staff). FilterBar + DataTable of homework; New / Edit open the form
 * modal; a row opens the detail modal with the submissions list, where the teacher grades,
 * gives feedback and returns work. ?view=<uuid> opens a homework directly (notification links).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCheck, ClipboardPen, Eye, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, Checkbox, DataTable, DateInput, Field, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, MultiSelect,
  NumberInput, RadioCards, Section, Select, Skeleton, Tabs, TextInput, Textarea, TimeInput, Toggle, useConfirm, type Column,
  type FilterValues,
} from "@/components/ui-kit";
import { AttachmentPicker, Attachments, RichText, StateBadge, sectionOptions, subjectOptions, useLmsOptions } from "@/components/lms/shared";
import { KIND_LABELS, localDate, splitISO, toISO, type FileRef, type Homework, type Page, type SubmissionInfo } from "@/components/lms/lib";

type RosterRow = {
  student_id: number; student_uuid: string; name: string; admission_no: string; roll_no: string | null; photo_url: string | null;
  section_label: string | null; state: string; submission: SubmissionInfo | null;
};

export default function HomeworkPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const { options } = useLmsOptions();
  const allocs = useMemo(() => options?.allocations ?? [], [options]);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ due: [] });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; page: Page<Homework> } | null>(null);
  const [formFor, setFormFor] = useState<Homework | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);

  const key = JSON.stringify({ q, filters, page, size, nonce });
  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ page: String(page), size: String(size) });
    if (q) p.set("q", q);
    if (filters.section?.[0]) p.set("section_id", filters.section[0]);
    if (filters.subject?.[0]) p.set("subject_id", filters.subject[0]);
    if (filters.due?.[0]) p.set("due", filters.due[0]);
    if (filters.mine?.[0]) p.set("mine", "true");
    api.get<Page<Homework>>(`/lms/homework?${p}`).then((r) => { if (live) setData({ key, page: r }); })
      .catch((e) => { if (live) { setData({ key, page: { items: [], total: 0, page: 1, size } }); toast.error(e.message); } });
    return () => { live = false; };
  }, [key, q, filters, page, size, toast]);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v) Promise.resolve().then(() => setViewing(v));
  }, []);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const openForm = (h: Homework | "new") => { setFormKey((k) => k + 1); setFormFor(h); setFormOpen(true); };
  const canTeach = !!options?.can_teach;

  async function remove(h: Homework) {
    if (!(await confirm({ title: `Remove “${h.title}”?`, message: "Learners will no longer see it. Submissions are kept.", confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.delete(`/lms/homework/${h.uuid}`); toast.success("Homework removed"); setViewing(null); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove it"); }
  }

  const columns: Column<Homework>[] = [
    { key: "title", header: "Homework", cell: (h) => (
      <div className="min-w-0">
        <p className="truncate text-ink">{h.title}</p>
        <p className="truncate text-[12.5px] text-muted">{h.subject_name} · {h.sections.map((s) => s.label).join(", ")}</p>
      </div>) },
    { key: "kind", header: "Type", hideBelow: "lg", cell: (h) => <span className="text-muted">{KIND_LABELS[h.kind] ?? h.kind}{h.submission_type === "offline" ? " · on paper" : ""}</span> },
    { key: "due", header: "Due", cell: (h) => <span className={h.is_overdue ? "text-muted" : "text-ink"}>{formatDateTime(h.due_at)}</span> },
    { key: "progress", header: "Handed in", hideBelow: "md", cell: (h) => h.counts ? (
      <div className="w-36">
        <div className="flex justify-between text-[12.5px] text-muted"><span className="tabular">{h.counts.submitted} / {h.counts.learners}</span>{h.counts.late > 0 && <span>{h.counts.late} late</span>}</div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-primary/70" style={{ width: `${h.counts.learners ? (h.counts.submitted * 100) / h.counts.learners : 0}%` }} /></div>
      </div>) : null },
    { key: "grade", header: "To mark", align: "right", cell: (h) => h.counts?.to_grade ? <Badge tone="warn">{h.counts.to_grade}</Badge> : <span className="text-faint">—</span> },
    { key: "status", header: "Status", hideBelow: "sm", cell: (h) => <Badge tone={h.status === "published" ? "good" : "neutral"} dot>{h.status === "published" ? "Set" : h.status === "draft" ? "Draft" : "Closed"}</Badge> },
  ];

  const filtered = !!q || Object.values(filters).some((v) => v?.length);
  return (
    <div>
      <PageHeader eyebrow="Teaching" title="Homework & assignments"
        description={`Set work for your ${term("sections").toLowerCase()}, see who has handed it in, and mark it with feedback.`}
        actions={canTeach ? <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New homework</Button> : undefined} />
      <FilterBar searchPlaceholder="Search homework" onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={[
          { key: "section", label: term("section"), options: sectionOptions(allocs).map((o) => ({ value: String(o.value), label: o.label })) },
          { key: "subject", label: term("subject"), options: subjectOptions(allocs).map((o) => ({ value: String(o.value), label: o.label })) },
          { key: "due", label: "Due", options: [{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past due" }] },
          { key: "mine", label: "Set by", options: [{ value: "1", label: "Me" }] },
        ]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={data?.page.items ?? []} rowKey={(h) => h.uuid} columns={columns} loading={data?.key !== key}
        onRowClick={(h) => setViewing(h.uuid)}
        rowActions={(h) => [
          { label: "Open", icon: Eye, onSelect: () => setViewing(h.uuid) },
          ...(canTeach ? [{ label: "Edit", icon: Pencil, onSelect: () => openForm(h) }, "separator" as const,
            { label: "Remove", icon: Trash2, danger: true, onSelect: () => remove(h) }] : []),
        ]}
        pagination={{ page, size, total: data?.page.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={ClipboardPen}
        emptyTitle={filtered ? "No homework matches" : "No homework yet"}
        emptyHint={filtered ? "Try another search or clear the filters." : "Set homework for a class and learners see it in their portal at once."}
        emptyAction={!filtered && canTeach && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New homework</Button>} />

      <HomeworkForm key={formKey} target={formFor} open={formOpen} onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); refresh(); }} />
      <HomeworkDetail uuid={viewing} onClose={() => { setViewing(null); refresh(); }} canTeach={canTeach}
        onEdit={(h) => { setViewing(null); openForm(h); }} onRemove={remove} />
    </div>
  );
}

/* ── Form ──────────────────────────────────────────────────────────────── */

function HomeworkForm({ target, open, onClose, onSaved }: { target: Homework | "new"; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const { options } = useLmsOptions();
  const allocs = options?.allocations ?? [];
  const editing = target !== "new" ? target : null;
  const due = splitISO(editing?.due_at);
  const hour = String(options?.settings.homework_default_due_hour ?? 9).padStart(2, "0");
  const initial = {
    title: editing?.title ?? "", instructions: editing?.instructions ?? "", kind: editing?.kind ?? "homework",
    subject: editing?.subject_id ?? null as number | null, sections: editing?.section_ids ?? [] as number[],
    date: due.date || localDate(2), time: due.time || `${hour}:00`, maxMarks: editing?.max_marks ? Number(editing.max_marks) : null as number | null,
    type: editing?.submission_type ?? "online", allowLate: editing?.allow_late ?? options?.settings.homework_allow_late ?? true,
    files: (editing?.attachments ?? []) as FileRef[], draft: editing?.status === "draft",
  };
  const [v, setV] = useState(initial);
  const [err, setErr] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => { setV((s) => ({ ...s, [k]: x })); setErr({}); };
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!v.title.trim()) er.title = "Give it a title";
    if (!v.subject) er.subject = `Pick a ${term("subject").toLowerCase()}`;
    if (!v.sections.length) er.sections = `Pick at least one ${term("section").toLowerCase()}`;
    if (!v.date) er.date = "Pick the due date";
    if (Object.keys(er).length) { setErr(er); return; }
    setSaving(true);
    const body = {
      title: v.title.trim(), instructions: v.instructions.trim() || null, kind: v.kind, subject_id: v.subject, section_ids: v.sections,
      due_at: toISO(v.date, v.time), max_marks: v.maxMarks, submission_type: v.type, allow_late: v.allowLate,
      attachments: v.files.map((f) => f.uuid), status: v.draft ? "draft" : "published",
    };
    try {
      if (editing) await api.put(`/lms/homework/${editing.uuid}`, body); else await api.post("/lms/homework", body);
      toast.success(editing ? "Homework updated" : v.draft ? "Saved as draft" : "Homework set", { description: !editing && !v.draft ? "Learners and parents have been told." : undefined });
      onSaved();
    } catch (x) { toast.error("Couldn't save", { description: x instanceof Error ? x.message : undefined }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving} title={editing ? "Edit homework" : "New homework"}
      description={editing ? undefined : "Learners see it in their portal; parents are told."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="hw-form" loading={saving}>{editing ? "Save changes" : v.draft ? "Save draft" : "Set homework"}</Button></>}>
      <form id="hw-form" onSubmit={submit} noValidate className="space-y-5">
        <FormGrid>
          <Field label="Title" required error={err.title} className="sm:col-span-2">
            <TextInput autoFocusInModal value={v.title} onValueChange={(x) => set("title", x)} placeholder="e.g. Exercise 4.2" />
          </Field>
          <Field label={term("subject")} required error={err.subject}>
            <Select value={v.subject} onChange={(x) => { set("subject", x); setV((s) => ({ ...s, subject: x, sections: s.sections.filter((id) => allocs.some((a) => a.section_id === id && a.subject_id === x)) })); }}
              options={subjectOptions(allocs)} placeholder={`Pick a ${term("subject").toLowerCase()}`} />
          </Field>
          <Field label={term("sections")} required error={err.sections} hint={v.subject ? undefined : `Pick the ${term("subject").toLowerCase()} first`}>
            <MultiSelect value={v.sections} onChange={(x) => set("sections", x)} options={sectionOptions(allocs, v.subject)} disabled={!v.subject} placeholder="Pick one or more" />
          </Field>
          <Field label="Type">
            <Select value={v.kind} onChange={(x) => x && set("kind", x)} options={Object.entries(KIND_LABELS).map(([value, label]) => ({ value, label }))} />
          </Field>
          <Field label="Maximum marks" aside="Optional">
            <NumberInput value={v.maxMarks} onChange={(x) => set("maxMarks", x)} min={0} max={1000} placeholder="Not marked" />
          </Field>
          <Field label="Due date" required error={err.date}><DateInput value={v.date} onChange={(x) => set("date", x)} /></Field>
          <Field label="Due time"><TimeInput value={v.time} onChange={(x) => set("time", x)} /></Field>
          <Field label="Instructions" className="sm:col-span-2" hint="Start lines with - for bullets, # for a heading.">
            <Textarea value={v.instructions} onValueChange={(x) => set("instructions", x)} rows={6} autoGrow placeholder="What learners should do" />
          </Field>
        </FormGrid>
        <Field label="How learners hand it in">
          <RadioCards value={v.type} onChange={(x) => set("type", x)} options={[
            { value: "online", label: "Online", description: "Type an answer or upload files in the portal" },
            { value: "offline", label: "On paper", description: "Handed in at school; you record marks here" },
          ]} />
        </Field>
        {v.type === "online" && <Toggle checked={v.allowLate} onChange={(x) => set("allowLate", x)} label="Accept late work" description="Late work is marked as late." />}
        <Field label="Attachments" aside="Optional"><AttachmentPicker value={v.files} onChange={(x) => set("files", x)} /></Field>
        {(!editing || editing.status === "draft") && <Checkbox checked={v.draft} onChange={(x) => set("draft", x)} label="Save as draft" description="Learners won't see it until you set it." />}
      </form>
    </Modal>
  );
}

/* ── Detail with submissions ───────────────────────────────────────────── */

function HomeworkDetail({ uuid, onClose, canTeach, onEdit, onRemove }: {
  uuid: string | null; onClose: () => void; canTeach: boolean; onEdit: (h: Homework) => void; onRemove: (h: Homework) => void;
}) {
  const toast = useToast();
  const { term } = useInstitution();
  const [hwState, setHw] = useState<{ uuid: string; data: Homework } | null>(null);
  const [rosterState, setRoster] = useState<{ uuid: string; rows: RosterRow[] } | null>(null);
  const hw = hwState && hwState.uuid === uuid ? hwState.data : null;
  const roster = rosterState && rosterState.uuid === uuid ? rosterState.rows : null;
  const [tab, setTab] = useState("submissions");
  const [grading, setGrading] = useState<RosterRow | null>(null);
  const [tick, setTick] = useState(0);
  const [stateFilter, setStateFilter] = useState<FilterValues>({});
  useEffect(() => {
    if (!uuid) return;
    let live = true;
    api.get<Homework>(`/lms/homework/${uuid}`).then((r) => live && setHw({ uuid, data: r })).catch((e) => { toast.error(e.message); onClose(); });
    api.get<RosterRow[]>(`/lms/homework/${uuid}/submissions`).then((r) => live && setRoster({ uuid, rows: r }))
      .catch(() => live && setRoster({ uuid, rows: [] }));
    return () => { live = false; };
  }, [uuid, tick, toast, onClose]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of roster ?? []) c[r.state] = (c[r.state] ?? 0) + 1;
    return c;
  }, [roster]);
  const rows = (roster ?? []).filter((r) => !stateFilter.state?.length || stateFilter.state.includes(r.state));

  async function returnAll() {
    try { const r = await api.post<{ returned: number }>(`/lms/homework/${uuid}/return`); toast.success(`${r.returned} returned to learners`); setTick((t) => t + 1); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't return"); }
  }

  const cols: Column<RosterRow>[] = [
    { key: "name", header: term("student"), sortable: true, sortValue: (r) => r.name, cell: (r) => (
      <div className="flex items-center gap-2.5"><Avatar name={r.name} src={r.photo_url ?? undefined} size={28} />
        <div className="min-w-0"><p className="truncate text-ink">{r.name}</p><p className="text-[12px] text-muted">{r.section_label}{r.roll_no ? ` · ${term("roll")} ${r.roll_no}` : ""}</p></div></div>) },
    { key: "state", header: "Status", sortable: true, sortValue: (r) => r.state, cell: (r) => <StateBadge state={r.state} /> },
    { key: "when", header: "Handed in", hideBelow: "md", cell: (r) => r.submission?.submitted_at ? <span className="text-muted">{formatDateTime(r.submission.submitted_at)}</span> : <span className="text-faint">—</span> },
    { key: "marks", header: "Marks", align: "right", cell: (r) => r.submission?.marks ? <span className="tabular">{r.submission.marks}{hw?.max_marks ? ` / ${hw.max_marks}` : ""}</span> : <span className="text-faint">—</span> },
  ];

  return (
    <>
      <Modal open={!!uuid} onClose={onClose} size="xl" title={hw?.title ?? "Homework"}
        description={hw ? `${hw.subject_name} · ${hw.sections.map((s) => s.label).join(", ")} · due ${formatDateTime(hw.due_at)}` : undefined}
        headerActions={hw && canTeach && <Button size="sm" icon={Pencil} onClick={() => onEdit(hw)}>Edit</Button>}
        footer={hw && canTeach ? <>
          <Button icon={Trash2} onClick={() => onRemove(hw)}>Remove</Button>
          {(counts.graded ?? 0) > 0 && <Button variant="primary" icon={CheckCheck} onClick={returnAll}>Return {counts.graded} marked</Button>}
        </> : undefined}>
        {!hw ? <Skeleton className="h-40 w-full" /> : (
          <>
            <Tabs value={tab} onChange={setTab} className="-mt-2 mb-5" items={[
              { value: "submissions", label: "Submissions", count: roster?.length },
              { value: "details", label: "Details" },
            ]} />
            {tab === "details" ? (
              <>
                <Section title="Overview">
                  <KeyValue columns={3} items={[
                    { label: "Type", value: KIND_LABELS[hw.kind] },
                    { label: "Hand in", value: hw.submission_type === "online" ? "Online" : "On paper" },
                    { label: "Late work", value: hw.submission_type === "online" ? (hw.allow_late ? "Accepted" : "Not accepted") : "—" },
                    { label: "Maximum marks", value: hw.max_marks },
                    { label: "Set on", value: hw.assigned_on ? formatDate(hw.assigned_on) : null },
                    { label: "Set by", value: hw.created_by_name },
                  ]} />
                </Section>
                {hw.instructions && <Section title="Instructions" className="border-t border-line"><RichText text={hw.instructions} /></Section>}
                {hw.attachments.length > 0 && <Section title="Attachments" className="border-t border-line"><Attachments files={hw.attachments} /></Section>}
              </>
            ) : (
              <>
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[["Handed in", (counts.submitted ?? 0) + (counts.late ?? 0) + (counts.graded ?? 0) + (counts.returned ?? 0)],
                    ["Not handed in", (counts.pending ?? 0) + (counts.missing ?? 0) + (counts.resubmit ?? 0)], ["Late", counts.late ?? 0],
                    ["Marked", (counts.graded ?? 0) + (counts.returned ?? 0)]].map(([l, n]) => (
                    <div key={l as string} className="rounded-xl border border-line px-4 py-3"><p className="text-[12px] text-muted">{l}</p><p className="tabular text-[22px] font-extralight text-ink">{n}</p></div>
                  ))}
                </div>
                <FilterBar values={stateFilter} onChange={setStateFilter} filters={[{ key: "state", label: "Status", multiple: true, options: [
                  { value: "pending", label: "Not handed in" }, { value: "submitted", label: "Handed in" }, { value: "late", label: "Late" },
                  { value: "graded", label: "Marked" }, { value: "returned", label: "Returned" }, { value: "resubmit", label: "Send again" }, { value: "missing", label: "Missed" }] }]} />
                <DataTable rows={rows} rowKey={(r) => r.student_id} columns={cols} loading={!roster}
                  onRowClick={canTeach ? (r) => setGrading(r) : undefined}
                  rowActions={canTeach ? (r) => [{ label: r.submission?.marks ? "Change marks" : "Mark", icon: Pencil, onSelect: () => setGrading(r) }] : undefined}
                  emptyTitle="No learners" emptyHint={`No learners are enrolled in these ${term("sections").toLowerCase()} yet.`} />
              </>
            )}
          </>
        )}
      </Modal>
      {hw && <GradeModal hw={hw} row={grading} onClose={() => setGrading(null)} onSaved={() => { setGrading(null); setTick((t) => t + 1); }} />}
    </>
  );
}

function GradeModal({ hw, row, onClose, onSaved }: { hw: Homework; row: RosterRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [marks, setMarks] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [ret, setRet] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setMarks(row?.submission?.marks ? Number(row.submission.marks) : null);
    setFeedback(row?.submission?.feedback ?? "");
    setRet(true);
  }, [row]);
  if (!row) return <Modal open={false} onClose={onClose} />;
  const sub = row.submission;
  async function save() {
    setSaving(true);
    try {
      await api.post(`/lms/homework/${hw.uuid}/submissions/${row!.student_uuid}/grade`, { marks, feedback: feedback || null, return_now: ret });
      toast.success(ret ? "Marked and returned" : "Marked"); onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }
  async function resubmit() {
    setSaving(true);
    try { await api.post(`/lms/homework/${hw.uuid}/submissions/${row!.student_uuid}/resubmit`, { note: feedback || null }); toast.success("Asked to send again"); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!row} onClose={onClose} size="lg" busy={saving} title={row.name} description={<StateBadge state={row.state} />}
      footer={<>{sub && <Button icon={RotateCcw} onClick={resubmit} disabled={saving}>Ask to send again</Button>}<ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Save marks</Button></>}>
      {sub ? (
        <Section title="Their work" description={sub.submitted_at ? `Handed in ${formatDateTime(sub.submitted_at)}${sub.is_late ? " (late)" : ""}${sub.attempts > 1 ? ` · ${sub.attempts} tries` : ""}` : undefined}>
          {sub.content ? <div className="rounded-xl border border-line bg-sunken/40 p-4"><RichText text={sub.content} /></div> : null}
          <div className="mt-3"><Attachments files={sub.attachments} /></div>
          {!sub.content && !sub.attachments.length && <p className="text-[13.5px] text-muted">Handed in on paper.</p>}
        </Section>
      ) : <p className="mb-5 text-[13.5px] text-muted">Nothing handed in online. You can still record marks for work handed in on paper.</p>}
      <div className="space-y-4 border-t border-line pt-5">
        <Field label="Marks" aside={hw.max_marks ? `out of ${hw.max_marks}` : "Optional"}>
          <NumberInput value={marks} onChange={setMarks} min={0} max={hw.max_marks ? Number(hw.max_marks) : 1000} step={0.5} />
        </Field>
        <Field label="Feedback"><Textarea value={feedback} onValueChange={setFeedback} rows={3} placeholder="What went well, what to improve" /></Field>
        <Toggle checked={ret} onChange={setRet} label="Return now" description="The learner and parents see the marks and feedback." />
      </div>
    </Modal>
  );
}
