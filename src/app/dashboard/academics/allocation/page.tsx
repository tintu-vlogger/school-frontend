"use client";

/*
 * Teacher allocation: per section, who teaches each subject (plus assistants) and how many
 * periods a week; changes save as you make them. "Apply curriculum" adds the program's
 * subjects. The Workload tab totals periods per teacher across the session.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { BookCopy, Gauge, ListPlus, Plus, Trash2, UserCog, Users } from "lucide-react";
import { useAccess } from "@/lib/access";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, Field, FormGrid, IconButton, Modal, ModalCancel, MultiSelect, NumberInput, Select, Tabs,
  useConfirm, type Column, type SelectOption,
} from "@/components/ui-kit";
import {
  errText, searchStaff, staffLabels, useList, useSectionOptions, useSessions, type Allocation, type Subject,
} from "@/components/academics/shared";

type Tab = "section" | "workload";

export default function AllocationPage() {
  const { term } = useInstitution();
  const [tab, setTab] = useState<Tab>("section");
  const { sessions, current } = useSessions();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const sid = sessionId ?? current?.id ?? null;
  return (
    <div>
      <PageHeader eyebrow="Academics" title={`${term("teacher")} allocation`}
        description={`Who teaches each ${term("subject").toLowerCase()} in every ${term("section").toLowerCase()}, and how the load spreads across ${term("teachers").toLowerCase()}.`}
        actions={<div className="w-44"><Select value={sid} onChange={setSessionId} options={sessions.map((s) => ({ value: s.id, label: s.name, description: s.is_current ? "Current" : undefined }))} placeholder={term("session")} /></div>} />
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[
        { value: "section", label: `By ${term("section").toLowerCase()}`, icon: UserCog },
        { value: "workload", label: "Workload", icon: Gauge },
      ]} />
      {tab === "section" ? <BySection sessionId={sid} /> : <Workload sessionId={sid} />}
    </div>
  );
}

/* ── By section ────────────────────────────────────────────────────── */

function BySection({ sessionId }: { sessionId: number | null }) {
  const { term } = useInstitution();
  const canManage = useAccess().can("academics.manage");
  const toast = useToast();
  const confirm = useConfirm();
  const { sections, options } = useSectionOptions(sessionId);
  const [sectionId, setSectionId] = useState<number | null>(null);
  useEffect(() => {
    if (sections.length && !sections.some((s) => s.id === sectionId)) setSectionId(sections[0].id);
    if (!sections.length && sectionId) setSectionId(null);
  }, [sections, sectionId]);
  const section = sections.find((s) => s.id === sectionId) ?? null;
  const allocs = useList<Allocation>(sectionId ? `/academics/allocations?section_id=${sectionId}` : null);
  const subjects = useList<Subject>("/academics/subjects");
  const [labels, setLabels] = useState<Record<number, string>>({});
  const [applying, setApplying] = useState(false);
  const [adding, setAdding] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [local, setLocal] = useState<Record<string, Partial<Allocation>>>({});

  const assistantIds = useMemo(() => Array.from(new Set(allocs.rows.flatMap((a) => a.assistant_ids || []))), [allocs.rows]);
  useEffect(() => {
    const missing = assistantIds.filter((id) => !(id in labels));
    if (!missing.length) return;
    staffLabels(missing).then((r) => setLabels((l) => ({ ...l, ...Object.fromEntries(r.map((o) => [o.value, o.label])) }))).catch(() => {});
  }, [assistantIds, labels]);

  const rows = allocs.rows.map((a) => ({ ...a, ...local[a.uuid] }))
    .sort((a, b) => (a.subject_name || "").localeCompare(b.subject_name || ""));
  const colorOf = Object.fromEntries(subjects.rows.map((s) => [s.id, s.color]));
  const unassigned = rows.filter((a) => !a.teacher_id).length;
  const periods = rows.reduce((n, a) => n + (a.weekly_periods || 0), 0);

  async function save(a: Allocation, patch: Partial<Allocation>, quiet = false) {
    setLocal((l) => ({ ...l, [a.uuid]: { ...l[a.uuid], ...patch } }));
    try {
      await api.put(`/academics/allocations/${a.uuid}`, patch);
      if (!quiet) toast.success("Saved");
    } catch (e) {
      toast.error("Couldn't save", { description: errText(e) });
      allocs.reload();
    }
  }
  async function apply() {
    if (!section) return;
    setApplying(true);
    try {
      const r = await api.post<{ added: number }>(`/academics/sections/${section.uuid}/apply-curriculum`);
      toast.success(r.added ? `${r.added} ${term("subjects").toLowerCase()} added` : `Everything in the curriculum is already here`);
      allocs.reload();
    } catch (e) { toast.error("Couldn't apply the curriculum", { description: errText(e) }); }
    finally { setApplying(false); }
  }
  async function remove(a: Allocation) {
    if (!await confirm({ title: `Remove ${a.subject_name} from ${section?.label}?`, tone: "danger", confirmLabel: "Remove",
      message: "Timetable slots and marks already recorded are not changed." })) return;
    try { await api.delete(`/academics/allocations/${a.uuid}`); toast.success("Removed"); allocs.reload(); }
    catch (e) { toast.error("Couldn't remove it", { description: errText(e) }); }
  }

  const columns: Column<Allocation>[] = [
    { key: "subject", header: term("subject"), width: "22%", cell: (a) => (
      <span className="flex items-center gap-2.5">
        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-line" style={{ background: colorOf[a.subject_id] || "transparent" }} />
        <span className="text-ink">{a.subject_name}</span>
      </span>
    ) },
    { key: "teacher", header: term("teacher"), width: "28%", cell: (a) => canManage ? (
      <Select value={a.teacher_id} onChange={(v, opt) => save(a, { teacher_id: v, teacher_name: opt?.label ?? null })} loadOptions={searchStaff} clearable
        placeholder={`Pick a ${term("teacher").toLowerCase()}`} selectedOption={a.teacher_id ? { value: a.teacher_id, label: a.teacher_name || "Current" } : null} />
    ) : (a.teacher_name ? <span className="flex items-center gap-2"><Avatar name={a.teacher_name} size={24} />{a.teacher_name}</span> : <Badge tone="warn">Not assigned</Badge>) },
    { key: "assistants", header: "Assistants", hideBelow: "md", cell: (a) => canManage ? (
      <MultiSelect value={a.assistant_ids || []} loadOptions={searchStaff} placeholder="None"
        selectedOptions={(a.assistant_ids || []).map((id) => ({ value: id, label: labels[id] || "…" }))}
        onChange={(ids, opts) => { setLabels((l) => ({ ...l, ...Object.fromEntries(opts.map((o) => [o.value, o.label])) })); save(a, { assistant_ids: ids }); }} />
    ) : <span className="text-muted">{(a.assistant_ids || []).map((id) => labels[id]).filter(Boolean).join(", ") || "—"}</span> },
    { key: "periods", header: "Periods a week", width: "130px", cell: (a) => canManage
      ? <PeriodsInput value={a.weekly_periods} onCommit={(n) => save(a, { weekly_periods: n }, true)} />
      : <span className="tabular">{a.weekly_periods ?? "—"}</span> },
    ...(canManage ? [{ key: "x", header: "", width: "48px", cell: (a: Allocation) => <IconButton icon={Trash2} label="Remove" size="sm" onClick={() => remove(a)} /> }] : []),
  ];

  if (!sessionId || (!sections.length && options.length === 0)) {
    return <Paper><EmptyState icon={Users} title={`No ${term("sections").toLowerCase()} in this ${term("session").toLowerCase()}`}
      hint={`Add ${term("sections").toLowerCase()} on the ${term("programs")} & ${term("sections").toLowerCase()} page first.`} /></Paper>;
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-64"><Field label={term("section")}><Select value={sectionId} onChange={setSectionId} options={options} placeholder={`Pick a ${term("section").toLowerCase()}`} /></Field></div>
          {section && !allocs.loading && (
            <p className="pb-2 text-[13px] text-muted">
              {rows.length} {term("subjects").toLowerCase()} · {periods} periods a week
              {unassigned > 0 && <> · <span className="text-amber-700">{unassigned} without a {term("teacher").toLowerCase()}</span></>}
            </p>
          )}
        </div>
        {canManage && section && (
          <div className="flex gap-2">
            <Button icon={BookCopy} loading={applying} onClick={apply}>Apply curriculum</Button>
            <Button variant="primary" icon={Plus} onClick={() => { setAdding((k) => k + 1); setAddOpen(true); }}>Add {term("subject").toLowerCase()}</Button>
          </div>
        )}
      </div>
      <DataTable rows={rows} rowKey={(a) => a.uuid} columns={columns} loading={allocs.loading}
        emptyIcon={ListPlus} emptyTitle={`No ${term("subjects").toLowerCase()} in ${section?.label ?? "this"} yet`}
        emptyHint={canManage ? `Apply the curriculum to add every ${term("subject").toLowerCase()} of the ${term("program").toLowerCase()}, then pick a ${term("teacher").toLowerCase()} for each.` : undefined}
        emptyAction={canManage && section && <Button variant="primary" icon={BookCopy} loading={applying} onClick={apply}>Apply curriculum</Button>} />
      {section && (
        <AddAllocationModal key={adding} open={addOpen} sectionId={section.id} sectionLabel={section.label}
          subjects={subjects.rows.filter((s) => s.active && !rows.some((a) => a.subject_id === s.id))}
          onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); allocs.reload(); }} />
      )}
    </>
  );
}

function PeriodsInput({ value, onCommit }: { value: number | null; onCommit: (n: number | null) => void }) {
  const [v, setV] = useState(value);
  const first = useRef(true);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (v === value) return;
    const t = setTimeout(() => commit.current(v), 700);
    return () => clearTimeout(t);
  }, [v, value]);
  return <NumberInput value={v} onChange={setV} min={0} max={80} />;
}

function AddAllocationModal({ open, sectionId, sectionLabel, subjects, onClose, onSaved }: {
  open: boolean; sectionId: number; sectionLabel: string; subjects: Subject[]; onClose: () => void; onSaved: () => void;
}) {
  const { term } = useInstitution();
  const toast = useToast();
  const [v, setV] = useState<{ subject_id: number | null; teacher_id: number | null; weekly_periods: number | null }>({ subject_id: null, teacher_id: null, weekly_periods: null });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const opts: SelectOption<number>[] = subjects.map((s) => ({ value: s.id, label: s.name, description: s.code || undefined }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.subject_id) { setError(`Pick a ${term("subject").toLowerCase()}`); return; }
    setSaving(true);
    try { await api.post("/academics/allocations", { section_id: sectionId, ...v }); toast.success("Added"); onSaved(); }
    catch (err) { toast.error("Couldn't add it", { description: errText(err) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} dirty={!!v.subject_id}
      title={`Add a ${term("subject").toLowerCase()} to ${sectionLabel}`}
      description={`For ${term("subjects").toLowerCase()} outside the curriculum, such as a club or remedial class.`}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="alloc-form" loading={saving}>Add</Button></>}>
      <form id="alloc-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label={term("subject")} required error={error} className="sm:col-span-2">
            <Select value={v.subject_id} onChange={(x) => { setV({ ...v, subject_id: x }); setError(""); }} options={opts}
              placeholder={`Pick a ${term("subject").toLowerCase()}`} emptyText={`Every ${term("subject").toLowerCase()} is already here`} />
          </Field>
          <Field label={term("teacher")} aside="Optional">
            <Select value={v.teacher_id} onChange={(x) => setV({ ...v, teacher_id: x })} loadOptions={searchStaff} clearable placeholder="Search staff" />
          </Field>
          <Field label="Periods a week" aside="Optional">
            <NumberInput value={v.weekly_periods} onChange={(x) => setV({ ...v, weekly_periods: x })} min={0} max={80} />
          </Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Workload ──────────────────────────────────────────────────────── */

type Line = { section: string; subject: string; periods: number; role: "teacher" | "assistant" };
type Load = {
  teacher_id: number; name: string; uuid: string | null; photo: string | null; periods: number; assist_periods: number;
  sections: number; subjects: number; class_teacher_of: string[]; lines: Line[];
};

function Workload({ sessionId }: { sessionId: number | null }) {
  const { term } = useInstitution();
  const [data, setData] = useState<{ key: string; items: Load[]; unassigned: number } | null>(null);
  const key = String(sessionId);
  const [viewing, setViewing] = useState<Load | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let live = true;
    api.get<{ items: Load[]; unassigned: number }>(`/academics/workload${sessionId ? `?session_id=${sessionId}` : ""}`)
      .then((r) => { if (live) setData({ key, items: r.items || [], unassigned: r.unassigned || 0 }); })
      .catch(() => { if (live) setData({ key, items: [], unassigned: 0 }); });
    return () => { live = false; };
  }, [sessionId, key]);
  const loading = data?.key !== key;
  const items = loading ? [] : data!.items;
  const max = Math.max(1, ...items.map((i) => i.periods + i.assist_periods));

  const columns: Column<Load>[] = [
    { key: "name", header: term("teacher"), sortable: true, sortValue: (r) => r.name, cell: (r) => (
      <span className="flex items-center gap-2.5"><Avatar name={r.name} src={r.photo} size={28} /><span className="text-ink">{r.name}</span></span>
    ) },
    { key: "periods", header: "Periods a week", sortable: true, sortValue: (r) => r.periods, cell: (r) => (
      <div className="flex min-w-[140px] items-center gap-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
          <div className="h-full rounded-full bg-primary" style={{ width: `${(r.periods / max) * 100}%` }} />
        </div>
        <span className="tabular w-8 text-right text-ink">{r.periods}</span>
      </div>
    ) },
    { key: "assist", header: "Assisting", align: "right", sortable: true, sortValue: (r) => r.assist_periods, hideBelow: "sm", cell: (r) => r.assist_periods ? <span className="tabular text-muted">{r.assist_periods}</span> : <span className="text-faint">—</span> },
    { key: "sections", header: term("sections"), align: "right", sortable: true, sortValue: (r) => r.sections, hideBelow: "md", cell: (r) => <span className="tabular">{r.sections}</span> },
    { key: "subjects", header: term("subjects"), align: "right", sortable: true, sortValue: (r) => r.subjects, hideBelow: "md", cell: (r) => <span className="tabular">{r.subjects}</span> },
    { key: "ct", header: `Class ${term("teacher").toLowerCase()} of`, hideBelow: "lg", cell: (r) => r.class_teacher_of.length ? <span className="text-ink/80">{r.class_teacher_of.join(", ")}</span> : <span className="text-faint">—</span> },
  ];

  return (
    <>
      {!loading && data!.unassigned > 0 && (
        <p className="mb-3 text-[13px] text-amber-700">{data!.unassigned} {term("subject").toLowerCase()} slot{data!.unassigned === 1 ? "" : "s"} still need a {term("teacher").toLowerCase()}. Pick them on the "By {term("section").toLowerCase()}" tab.</p>
      )}
      <DataTable rows={items} rowKey={(r) => r.teacher_id} columns={columns} loading={loading}
        defaultSort={{ key: "periods", dir: "desc" }}
        onRowClick={(r) => { setViewing(r); setOpen(true); }}
        emptyIcon={Gauge} emptyTitle="No allocations yet"
        emptyHint={`Assign ${term("teachers").toLowerCase()} to ${term("subjects").toLowerCase()} on the "By ${term("section").toLowerCase()}" tab to see their load here.`} />
      <Modal open={open && !!viewing} onClose={() => setOpen(false)} size="md" title={viewing?.name}
        leading={viewing && <Avatar name={viewing.name} src={viewing.photo} size={40} />}
        description={viewing ? `${viewing.periods} periods a week teaching${viewing.assist_periods ? `, ${viewing.assist_periods} assisting` : ""}` : undefined}>
        {viewing && (
          <div className="space-y-4">
            {viewing.class_teacher_of.length > 0 && (
              <p className="text-[13.5px] text-muted">Class {term("teacher").toLowerCase()} of <span className="text-ink">{viewing.class_teacher_of.join(", ")}</span></p>
            )}
            <div className="divide-y divide-line rounded-xl border border-line">
              {viewing.lines.length === 0 && <p className="px-4 py-3 text-[13.5px] text-muted">No {term("subjects").toLowerCase()} assigned.</p>}
              {[...viewing.lines].sort((a, b) => a.section.localeCompare(b.section)).map((l, i) => (
                <div key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px]">
                  <div className="min-w-0">
                    <p className="truncate text-ink">{l.subject}</p>
                    <p className="truncate text-[12.5px] text-muted">{l.section}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {l.role === "assistant" && <Badge tone="info">Assistant</Badge>}
                    <span className="tabular text-muted">{l.periods || "—"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
