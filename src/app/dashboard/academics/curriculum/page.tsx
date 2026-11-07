"use client";

/*
 * Curriculum: which subjects each program teaches. Semester-based programmes group the
 * subjects by term number; electives carry a group (learners pick from the same group).
 * Credits and weekly periods are totalled per term.
 */
import { useEffect, useMemo, useState } from "react";
import { ListTree, Pencil, Plus, Trash2 } from "lucide-react";
import { useAccess } from "@/lib/access";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FormGrid, Modal, ModalCancel, NumberInput, Select, TextInput, Toggle, useConfirm, type Column,
} from "@/components/ui-kit";
import { errText, useList, type CurriculumRow, type Program, type Subject } from "@/components/academics/shared";

const num = (v: string | number | null | undefined) => (v == null || v === "" ? 0 : Number(v));

export default function CurriculumPage() {
  const { term } = useInstitution();
  const canManage = useAccess().can("academics.manage");
  const toast = useToast();
  const confirm = useConfirm();
  const programs = useList<Program>("/academics/programs");
  const subjects = useList<Subject>("/academics/subjects");
  const active = programs.rows.filter((p) => p.active).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const [programId, setProgramId] = useState<number | null>(null);
  useEffect(() => { if (programId == null && active.length) setProgramId(active[0].id); }, [active, programId]);
  const program = active.find((p) => p.id === programId) ?? null;
  const rows = useList<CurriculumRow>(programId ? `/academics/curriculum?program_id=${programId}` : null);
  const [form, setForm] = useState<{ open: boolean; target: CurriculumRow | null; termNo: number | null; key: number }>({ open: false, target: null, termNo: null, key: 0 });
  const open = (r: CurriculumRow | null, termNo: number | null = null) => setForm((f) => ({ open: true, target: r, termNo, key: f.key + 1 }));
  const colorOf = Object.fromEntries(subjects.rows.map((s) => [s.id, s.color]));

  const groups = useMemo(() => {
    const m = new Map<number | null, CurriculumRow[]>();
    if (program?.duration_terms) for (let i = 1; i <= program.duration_terms; i++) m.set(i, []);
    for (const r of rows.rows) {
      const k = program?.duration_terms ? r.term_no : (r.term_no ?? null);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return [...m.entries()].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  }, [rows.rows, program]);

  async function remove(r: CurriculumRow) {
    if (!await confirm({ title: `Remove ${r.subject_name} from ${program?.name}?`, tone: "danger", confirmLabel: "Remove",
      message: `${term("sections")} that already have it keep their ${term("teacher").toLowerCase()} allocation.` })) return;
    try { await api.delete(`/academics/curriculum/${r.uuid}`); toast.success("Removed"); rows.reload(); }
    catch (e) { toast.error("Couldn't remove it", { description: errText(e) }); }
  }

  const columns: Column<CurriculumRow>[] = [
    { key: "subject", header: term("subject"), sortable: true, sortValue: (r) => r.subject_name, cell: (r) => (
      <span className="flex items-center gap-2.5">
        <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-line" style={{ background: colorOf[r.subject_id] || "transparent" }} />
        <span className="text-ink">{r.subject_name}</span>
        {r.subject_code && <span className="font-mono text-[12px] text-faint">{r.subject_code}</span>}
      </span>
    ) },
    { key: "type", header: "Type", cell: (r) => r.is_elective ? <Badge tone="accent">Elective{r.elective_group ? ` · ${r.elective_group}` : ""}</Badge> : <Badge>Core</Badge> },
    { key: "credits", header: "Credits", align: "right", hideBelow: "sm", cell: (r) => r.effective_credits != null ? <span className="tabular">{num(r.effective_credits)}{r.credits != null && <span className="ml-1 text-[11.5px] text-faint">set here</span>}</span> : <span className="text-faint">—</span> },
    { key: "periods", header: "Periods a week", align: "right", hideBelow: "sm", cell: (r) => r.weekly_periods != null ? <span className="tabular">{r.weekly_periods}</span> : <span className="text-faint">—</span> },
  ];

  return (
    <div>
      <PageHeader eyebrow="Academics" title="Curriculum"
        description={`The ${term("subjects").toLowerCase()} each ${term("program").toLowerCase()} teaches${program?.duration_terms ? `, ${term("term").toLowerCase()} by ${term("term").toLowerCase()}` : ""}, with electives, credits and weekly periods.`}
        actions={<>
          <div className="w-60"><Select value={programId} onChange={setProgramId} options={active.map((p) => ({ value: p.id, label: p.name, description: p.level || undefined }))} placeholder={`Pick a ${term("program").toLowerCase()}`} /></div>
          {canManage && program && <Button variant="primary" icon={Plus} onClick={() => open(null)}>Add {term("subject").toLowerCase()}</Button>}
        </>} />

      {!programs.loading && !active.length ? (
        <Paper><EmptyState icon={ListTree} title={`No ${term("programs").toLowerCase()} yet`} hint={`Add ${term("programs").toLowerCase()} first on the ${term("programs")} & ${term("sections").toLowerCase()} page.`} /></Paper>
      ) : (
        <div className="space-y-6">
          {groups.length === 0 && !rows.loading && (
            <Paper><EmptyState icon={ListTree} title={`No ${term("subjects").toLowerCase()} in ${program?.name ?? "this"} yet`}
              hint={`Add the ${term("subjects").toLowerCase()} taught here. ${term("sections")} pick them up with "Apply curriculum" on the allocation page.`}
              action={canManage && program && <Button variant="primary" icon={Plus} onClick={() => open(null)}>Add {term("subject").toLowerCase()}</Button>} /></Paper>
          )}
          {groups.map(([termNo, list]) => {
            const credits = list.filter((r) => !r.is_elective).reduce((n, r) => n + num(r.effective_credits), 0);
            const periods = list.reduce((n, r) => n + (r.weekly_periods || 0), 0);
            const electiveGroups = new Set(list.filter((r) => r.is_elective).map((r) => r.elective_group || "Electives"));
            return (
              <div key={String(termNo)}>
                <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <p className="text-[15px] text-ink">{termNo ? `${term("term")} ${termNo}` : program?.duration_terms ? `Every ${term("term").toLowerCase()}` : `${program?.name ?? ""}`}</p>
                    <p className="text-[12.5px] text-muted">
                      {list.length} {term("subjects").toLowerCase()} · {credits} core credits · {periods} periods a week
                      {electiveGroups.size > 0 && ` · ${electiveGroups.size} elective group${electiveGroups.size === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  {canManage && program?.duration_terms ? <Button size="sm" icon={Plus} onClick={() => open(null, termNo)}>Add to this {term("term").toLowerCase()}</Button> : null}
                </div>
                <DataTable rows={list.sort((a, b) => a.sort_order - b.sort_order || (a.subject_name || "").localeCompare(b.subject_name || ""))}
                  rowKey={(r) => r.uuid} columns={columns} loading={rows.loading}
                  onRowClick={canManage ? (r) => open(r) : undefined}
                  rowActions={canManage ? (r) => [{ label: "Edit", icon: Pencil, onSelect: () => open(r) }, "separator", { label: "Remove", icon: Trash2, danger: true, onSelect: () => remove(r) }] : undefined}
                  emptyIcon={ListTree} emptyTitle={`Nothing in this ${term("term").toLowerCase()} yet`} emptyHint={canManage ? `Add the ${term("subjects").toLowerCase()} taught in this ${term("term").toLowerCase()}.` : undefined} />
              </div>
            );
          })}
        </div>
      )}

      {program && (
        <CurriculumModal key={form.key} open={form.open} target={form.target} program={program} subjects={subjects.rows}
          defaultTerm={form.termNo} existing={rows.rows}
          onClose={() => setForm((f) => ({ ...f, open: false }))}
          onSaved={() => { setForm((f) => ({ ...f, open: false })); rows.reload(); }} />
      )}
    </div>
  );
}

function CurriculumModal({ open, target, program, subjects, defaultTerm, existing, onClose, onSaved }: {
  open: boolean; target: CurriculumRow | null; program: Program; subjects: Subject[]; defaultTerm: number | null;
  existing: CurriculumRow[]; onClose: () => void; onSaved: () => void;
}) {
  const { term } = useInstitution();
  const toast = useToast();
  const initial = {
    subject_id: target?.subject_id ?? null as number | null, term_no: target ? target.term_no : defaultTerm,
    is_elective: target?.is_elective ?? false, elective_group: target?.elective_group ?? "",
    credits: target?.credits != null ? Number(target.credits) : null, weekly_periods: target?.weekly_periods ?? null,
    sort_order: target?.sort_order ?? existing.length + 1,
  };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const groups = Array.from(new Set(existing.map((r) => r.elective_group).filter(Boolean))) as string[];
  const subjectOptions = subjects.filter((s) => s.active || s.id === initial.subject_id)
    .map((s) => ({ value: s.id, label: s.name, description: [s.code, s.credits != null ? `${Number(s.credits)} credits` : null].filter(Boolean).join(" · ") || undefined }));
  const termOptions = program.duration_terms ? Array.from({ length: program.duration_terms }, (_, i) => ({ value: i + 1, label: `${term("term")} ${i + 1}` })) : [];
  const chosen = subjects.find((s) => s.id === v.subject_id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.subject_id) { setError(`Pick a ${term("subject").toLowerCase()}`); return; }
    setSaving(true);
    try {
      const body = { term_no: v.term_no, is_elective: v.is_elective, elective_group: v.is_elective ? (v.elective_group.trim() || null) : null,
        credits: v.credits, weekly_periods: v.weekly_periods, sort_order: v.sort_order };
      if (target) await api.put(`/academics/curriculum/${target.uuid}`, body);
      else await api.post("/academics/curriculum", { ...body, program_id: program.id, subject_id: v.subject_id });
      toast.success(target ? "Saved" : `Added to ${program.name}`);
      onSaved();
    } catch (err) { toast.error("Couldn't save", { description: errText(err) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" dirty={dirty} busy={saving}
      title={target ? `${target.subject_name} in ${program.name}` : `Add a ${term("subject").toLowerCase()} to ${program.name}`}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="curriculum-form" loading={saving}>{target ? "Save changes" : "Add"}</Button></>}>
      <form id="curriculum-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label={term("subject")} required error={error} className="sm:col-span-2">
            <Select value={v.subject_id} onChange={(x) => { setV({ ...v, subject_id: x }); setError(""); }} options={subjectOptions} disabled={!!target}
              placeholder={`Pick a ${term("subject").toLowerCase()}`} emptyText={`No ${term("subjects").toLowerCase()} yet. Add them on the ${term("subjects")} page.`} />
          </Field>
          {termOptions.length > 0 && (
            <Field label={term("term")} hint={`Leave empty if it runs in every ${term("term").toLowerCase()}`}>
              <Select value={v.term_no} onChange={(x) => setV({ ...v, term_no: x })} options={termOptions} clearable placeholder={`Every ${term("term").toLowerCase()}`} disabled={!!target} />
            </Field>
          )}
          <Field label="Periods a week" aside="Optional">
            <NumberInput value={v.weekly_periods} onChange={(x) => setV({ ...v, weekly_periods: x })} min={0} max={80} />
          </Field>
          <Field label="Credits" aside="Optional" hint={chosen?.credits != null ? `Leave empty to use ${Number(chosen.credits)}` : "Overrides the subject's own credits"}>
            <NumberInput value={v.credits} onChange={(x) => setV({ ...v, credits: x })} min={0} max={100} step={0.5} />
          </Field>
          <Field label="Order">
            <NumberInput value={v.sort_order} onChange={(x) => setV({ ...v, sort_order: x ?? 1 })} min={1} max={999} />
          </Field>
          <div className="sm:col-span-2">
            <Toggle checked={v.is_elective} onChange={(x) => setV({ ...v, is_elective: x })} label="Elective"
              description={`${term("students")} choose it rather than everyone taking it`} />
          </div>
          {v.is_elective && (
            <Field label="Elective group" aside="Optional" hint={groups.length ? `In use: ${groups.join(", ")}` : "Electives in the same group are alternatives, e.g. Second language"} className="sm:col-span-2">
              <TextInput value={v.elective_group} onValueChange={(x) => setV({ ...v, elective_group: x })} maxLength={60} placeholder="e.g. Second language" />
            </Field>
          )}
        </FormGrid>
      </form>
    </Modal>
  );
}
