"use client";

/*
 * Subjects (or courses / units / activity areas): kind, credits, code, colour and department.
 * FilterBar + DataTable; add / edit in a modal; switching off keeps past records.
 */
import { useMemo, useState } from "react";
import { BookMarked, Pencil, Plus, Power } from "lucide-react";
import { useAccess } from "@/lib/access";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, FormGrid, Modal, ModalCancel, NumberInput, Select, TextInput, Textarea, paginate,
  useConfirm, type Column, type FilterValues,
} from "@/components/ui-kit";
import { SUBJECT_KINDS, errText, useList, type Subject } from "@/components/academics/shared";
import { ColorDot, ColorField, useDepartmentNames, useDepartmentOptions } from "@/components/academics/ui";

const kindLabel = (k: string) => SUBJECT_KINDS.find((x) => x.value === k)?.label ?? k;

export default function SubjectsPage() {
  const { term } = useInstitution();
  const canManage = useAccess().can("academics.manage");
  const toast = useToast();
  const confirm = useConfirm();
  const { rows, loading, reload } = useList<Subject>("/academics/subjects");
  const departments = useDepartmentNames();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [form, setForm] = useState<{ open: boolean; target: Subject | null; key: number }>({ open: false, target: null, key: 0 });
  const open = (s: Subject | null) => setForm((f) => ({ open: true, target: s, key: f.key + 1 }));

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const kind = filters.kind?.[0];
    const st = filters.status?.[0];
    return rows.filter((s) => (!q || [s.name, s.code].some((x) => (x || "").toLowerCase().includes(q)))
      && (!kind || s.kind === kind) && (!st || (st === "active" ? s.active : !s.active)));
  }, [rows, search, filters]);

  async function switchOff(s: Subject) {
    if (!await confirm({ title: `Switch off ${s.name}?`, tone: "danger", confirmLabel: "Switch off",
      message: `It is hidden from new curriculum and allocation. Marks and timetables already recorded stay.` })) return;
    try { await api.delete(`/academics/subjects/${s.uuid}`); toast.success(`${s.name} switched off`); reload(); }
    catch (e) { toast.error("Couldn't switch it off", { description: errText(e) }); }
  }
  async function switchOn(s: Subject) {
    try { await api.put(`/academics/subjects/${s.uuid}`, { active: true }); toast.success(`${s.name} is back on`); reload(); }
    catch (e) { toast.error("Couldn't switch it on", { description: errText(e) }); }
  }

  const columns: Column<Subject>[] = [
    { key: "name", header: term("subject"), sortable: true, sortValue: (s) => s.name, cell: (s) => (
      <span className="flex items-center gap-2.5"><ColorDot color={s.color} size={12} /><span className="text-ink">{s.name}</span></span>
    ) },
    { key: "code", header: "Code", sortable: true, sortValue: (s) => s.code, cell: (s) => s.code ? <span className="font-mono text-[12.5px] text-muted">{s.code}</span> : <span className="text-faint">—</span> },
    { key: "kind", header: "Kind", sortable: true, sortValue: (s) => s.kind, hideBelow: "sm", cell: (s) => <Badge>{kindLabel(s.kind)}</Badge> },
    { key: "credits", header: "Credits", align: "right", sortable: true, sortValue: (s) => Number(s.credits ?? 0), hideBelow: "md", cell: (s) => s.credits != null ? <span className="tabular">{Number(s.credits)}</span> : <span className="text-faint">—</span> },
    { key: "dept", header: "Department", hideBelow: "lg", cell: (s) => s.department_id ? <span className="text-ink/80">{departments[s.department_id] ?? "—"}</span> : <span className="text-faint">—</span> },
    { key: "status", header: "Status", cell: (s) => <Badge tone={s.active ? "good" : "neutral"} dot>{s.active ? "Active" : "Off"}</Badge> },
  ];
  const filtered = !!search || !!filters.kind?.length;

  return (
    <div>
      <PageHeader eyebrow="Academics" title={term("subjects")}
        description={`The ${term("subjects").toLowerCase()} you teach. Add them to each ${term("program").toLowerCase()} under Curriculum.`}
        actions={canManage ? <Button variant="primary" icon={Plus} onClick={() => open(null)}>Add {term("subject").toLowerCase()}</Button> : undefined} />
      <FilterBar searchPlaceholder={`Search ${term("subjects").toLowerCase()} by name or code`} onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[
          { key: "kind", label: "Kind", options: SUBJECT_KINDS.map((k) => ({ value: String(k.value), label: k.label })) },
          { key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "off", label: "Off" }] },
        ]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={paginate(list, page, size)} rowKey={(s) => s.uuid} columns={columns} loading={loading}
        onRowClick={canManage ? (s) => open(s) : undefined}
        rowActions={canManage ? (s) => [
          { label: "Edit", icon: Pencil, onSelect: () => open(s) },
          "separator",
          s.active ? { label: "Switch off", icon: Power, danger: true, onSelect: () => switchOff(s) } : { label: "Switch on", icon: Power, onSelect: () => switchOn(s) },
        ] : undefined}
        pagination={{ page, size, total: list.length, onPageChange: setPage, onSizeChange: (n) => { setSize(n); setPage(1); } }}
        emptyIcon={BookMarked}
        emptyTitle={filtered ? `No ${term("subjects").toLowerCase()} match` : `No ${term("subjects").toLowerCase()} yet`}
        emptyHint={filtered ? "Try another search or clear the filters." : `Add the ${term("subjects").toLowerCase()} you teach, or run Quick set-up on the ${term("programs").toLowerCase()} page.`}
        emptyAction={!filtered && canManage && <Button variant="primary" icon={Plus} onClick={() => open(null)}>Add {term("subject").toLowerCase()}</Button>} />
      <SubjectModal key={form.key} open={form.open} target={form.target}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={() => { setForm((f) => ({ ...f, open: false })); reload(); }} />
    </div>
  );
}

function SubjectModal({ open, target, onClose, onSaved }: { open: boolean; target: Subject | null; onClose: () => void; onSaved: () => void }) {
  const { term } = useInstitution();
  const toast = useToast();
  const initial = {
    name: target?.name ?? "", code: target?.code ?? "", kind: target?.kind ?? "theory",
    credits: target?.credits != null ? Number(target.credits) : null, department_id: target?.department_id ?? null,
    color: target?.color ?? "", description: target?.description ?? "",
  };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const departments = useDepartmentOptions(initial.department_id);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError("Give it a name"); return; }
    setSaving(true);
    try {
      const body = { ...v, name: v.name.trim(), code: v.code.trim() || null, color: v.color || null, description: v.description.trim() || null };
      if (target) await api.put(`/academics/subjects/${target.uuid}`, body);
      else await api.post("/academics/subjects", body);
      toast.success(target ? "Saved" : `${term("subject")} added`);
      onSaved();
    } catch (err) { toast.error("Couldn't save", { description: errText(err) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" dirty={dirty} busy={saving}
      title={target ? `Edit ${target.name}` : `Add ${term("subject").toLowerCase()}`}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="subject-form" loading={saving}>{target ? "Save changes" : "Add"}</Button></>}>
      <form id="subject-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Name" required error={error} className="sm:col-span-2">
            <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} placeholder="e.g. Mathematics, PHY101 Mechanics" />
          </Field>
          <Field label="Code" aside="Optional">
            <TextInput value={v.code} onValueChange={(x) => setV({ ...v, code: x.toUpperCase() })} maxLength={30} className="font-mono" placeholder="e.g. MAT" />
          </Field>
          <Field label="Kind">
            <Select value={v.kind} onChange={(x) => setV({ ...v, kind: x ?? "theory" })} options={SUBJECT_KINDS} />
          </Field>
          <Field label="Credits" aside="Optional" hint="For credit-based programmes">
            <NumberInput value={v.credits} onChange={(x) => setV({ ...v, credits: x })} min={0} max={100} step={0.5} />
          </Field>
          <Field label="Department" aside="Optional">
            <Select value={v.department_id} onChange={(x) => setV({ ...v, department_id: x })} options={departments} clearable placeholder="Pick a department" />
          </Field>
          <Field label="Colour" aside="Optional" hint="Used on timetables and calendars" className="sm:col-span-2">
            <ColorField value={v.color} onChange={(x) => setV({ ...v, color: x })} />
          </Field>
          <Field label="Description" aside="Optional" className="sm:col-span-2">
            <Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={2} />
          </Field>
        </FormGrid>
      </form>
    </Modal>
  );
}
