"use client";

/*
 * Designations (job titles): FilterBar + DataTable. Row click opens the detail modal with
 * the people who hold the title; New opens a modal with one-click suggestions; Edit is a
 * small modal; deletion asks for confirmation. Built-in titles are read-only.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Eye, Pencil, Plus, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import { CustomFields, useCustomFieldDraft, type CustomValues } from "@/components/custom-fields";
import {
  Avatar, Badge, Button, DataTable, Field, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, Section, Select, Skeleton, TextInput, Textarea,
  paginate, useConfirm, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";

interface Designation {
  id: number; uuid: string; designation_name: string; employee_count: number; created_at: string; is_global?: boolean;
  code?: string | null; description?: string | null; grade_id?: number | null; grade_name?: string | null;
  custom?: CustomValues;
}
type Grade = { id: number; name: string; code: string | null; band: string | null; rank: number | null; active: boolean };

/** Active grades, most junior first, as Select options (keeps `keep` even if switched off). */
function useGradeOptions(keep?: number | null): SelectOption<number>[] {
  const [rows, setRows] = useState<Grade[] | null>(null);
  useEffect(() => {
    let live = true;
    api.get<Grade[]>("/organization/grades").then((r) => { if (live) setRows(Array.isArray(r) ? r : []); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, []);
  return (rows ?? []).filter((g) => g.active || g.id === keep)
    .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999))
    .map((g) => ({ value: g.id, label: g.name, description: [g.code, g.band].filter(Boolean).join(" · ") || undefined }));
}
type Member = { id: number; uuid: string; first_name: string; last_name: string; email?: string | null; department_name?: string | null; profile_image_url?: string | null };

// Common job titles offered as one-click suggestions.
const TEMPLATES = [
  "Software Engineer", "HR Executive", "HR Manager", "Accountant", "Sales Executive",
  "Operations Manager", "Customer Support Executive", "Office Administrator",
  "Team Lead", "Marketing Executive",
];

export default function DesignationsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ nonce: number; rows: Designation[] } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const [editing, setEditing] = useState<Designation | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [viewing, setViewing] = useState<Designation | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  useEffect(() => {
    let live = true;
    api.get<Designation[]>("/designations/")
      .then((r) => { if (live) setResult({ nonce, rows: Array.isArray(r) ? r : [] }); })
      .catch(() => { if (live) { setResult({ nonce, rows: [] }); toast.error("Couldn't load designations"); } });
    return () => { live = false; };
  }, [nonce, toast]);
  const loading = result?.nonce !== nonce;
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const all = useMemo(() => result?.rows ?? [], [result]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const t = filters.type?.[0];
    return all.filter((d) => (!q || [d.designation_name, d.code, d.grade_name].some((x) => (x || "").toLowerCase().includes(q))) && (!t || (t === "builtin" ? d.is_global : !d.is_global)));
  }, [all, search, filters]);

  const openView = (d: Designation) => { setViewing(d); setViewOpen(true); };
  const openEdit = (d: Designation) => { setEditKey((k) => k + 1); setEditing(d); setEditOpen(true); };
  const openAdd = () => { setAddKey((k) => k + 1); setAddOpen(true); };

  async function remove(list: Designation[], clear?: () => void) {
    const custom = list.filter((d) => !d.is_global);
    if (!custom.length) { toast.info("Built-in designations can't be deleted"); return; }
    const ok = await confirm({
      title: custom.length === 1 ? `Delete ${custom[0].designation_name}?` : `Delete ${custom.length} designations?`,
      message: "Employees with this designation keep their records; the designation is removed from them.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    const res = await Promise.allSettled(custom.map((d) => api.delete(`/designations/${d.uuid}`)));
    const failed = res.filter((r) => r.status === "rejected").length;
    if (failed) toast.error(`${failed} of ${custom.length} couldn't be deleted`);
    else toast.success(custom.length === 1 ? "Designation deleted" : `${custom.length} designations deleted`);
    setViewOpen(false);
    clear?.();
    refresh();
  }

  const columns: Column<Designation>[] = [
    {
      key: "name", header: "Designation", sortable: true, sortValue: (d) => d.designation_name,
      cell: (d) => (
        <span className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted"><BadgeCheck size={16} strokeWidth={1.4} /></span>
          <span className="min-w-0">
            <span className="block truncate text-ink">{d.designation_name}</span>
            {d.code && <span className="block truncate font-mono text-[12px] text-faint">{d.code}</span>}
          </span>
        </span>
      ),
    },
    { key: "grade", header: "Grade", sortable: true, sortValue: (d) => d.grade_name, hideBelow: "sm", cell: (d) => d.grade_name ? <span className="text-ink/80">{d.grade_name}</span> : <span className="text-faint">—</span> },
    { key: "type", header: "Type", sortable: true, sortValue: (d) => (d.is_global ? 0 : 1), cell: (d) => d.is_global ? <Badge tone="accent">Built-in</Badge> : <Badge>Custom</Badge> },
    { key: "employees", header: "Employees", sortable: true, sortValue: (d) => d.employee_count, align: "right", cell: (d) => <span className="tabular text-muted">{d.employee_count}</span> },
    { key: "added", header: "Added", sortable: true, sortValue: (d) => d.created_at, hideBelow: "md", cell: (d) => <span className="tabular text-muted">{d.created_at ? formatDate(d.created_at) : "—"}</span> },
  ];

  const filtered = !!search || !!filters.type?.length;
  return (
    <div>
      <PageHeader eyebrow="People" title="Designations" description="The job titles used across the company."
        actions={<Button variant="primary" icon={Plus} onClick={openAdd}>New designation</Button>} />
      <FilterBar
        searchPlaceholder="Search designations"
        onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[{ key: "type", label: "Type", options: [{ value: "builtin", label: "Built-in" }, { value: "custom", label: "Custom" }] }]}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
      />
      <DataTable
        rows={paginate(rows, page, size)}
        rowKey={(d) => d.uuid}
        columns={columns}
        loading={loading}
        onRowClick={openView}
        rowActions={(d) => [
          { label: "View people", icon: Eye, onSelect: () => openView(d) },
          ...(!d.is_global ? [
            { label: "Edit", icon: Pencil, onSelect: () => openEdit(d) },
            "separator" as const,
            { label: "Delete", icon: Trash2, danger: true, onSelect: () => remove([d]) },
          ] : []),
        ]}
        selectable
        bulkActions={[{ label: "Delete", icon: Trash2, danger: true, onSelect: (list, clear) => remove(list, clear) }]}
        pagination={{ page, size, total: rows.length, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={BadgeCheck}
        emptyTitle={filtered ? "No designations match" : "No designations yet"}
        emptyHint={filtered ? "Try another search or clear the filters." : "Add the job titles used in your company."}
        emptyAction={!filtered && <Button variant="primary" icon={Plus} onClick={openAdd}>New designation</Button>}
      />

      <AddDesignationModal key={`add${addKey}`} open={addOpen} existing={all} onClose={() => setAddOpen(false)} onAdded={refresh} />
      <EditDesignationModal key={`edit${editKey}`} designation={editing} open={editOpen} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); refresh(); }} />
      <DesignationDetailModal designation={viewing} open={viewOpen} onClose={() => setViewOpen(false)}
        onEdit={(d) => { setViewOpen(false); openEdit(d); }} onDelete={(d) => remove([d])} />
    </div>
  );
}

/* ── Add (suggestions + custom) ────────────────────────────────────────── */

function AddDesignationModal({ open, existing, onClose, onAdded }: { open: boolean; existing: Designation[]; onClose: () => void; onAdded: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [grade, setGrade] = useState<number | null>(null);
  const grades = useGradeOptions();
  const cf = useCustomFieldDraft("designation", null);
  const [busy, setBusy] = useState<string | null>(null);
  const taken = new Set(existing.map((d) => d.designation_name.toLowerCase()));
  const suggestions = TEMPLATES.filter((t) => !taken.has(t.toLowerCase()));

  async function add(title: string, closeAfter: boolean) {
    const t = title.trim();
    if (!t || busy) return;
    if (taken.has(t.toLowerCase())) { toast.info(`“${t}” already exists`); return; }
    if (!cf.check()) return;
    setBusy(t);
    try {
      await api.post("/designations/", { designation_name: t, code: closeAfter && code.trim() ? code.trim() : null, grade_id: grade, custom: cf.values });
      toast.success(`“${t}” added`);
      onAdded();
      if (closeAfter) onClose(); else setName("");
    } catch (e: unknown) {
      toast.error("Couldn't add the designation", { description: e instanceof Error ? e.message : undefined });
    } finally { setBusy(null); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" dirty={!!name.trim() || cf.dirty} busy={!!busy}
      title="New designation" description="Pick common titles with one click, or type your own."
      footer={<><ModalCancel>Done</ModalCancel><Button variant="primary" type="submit" form="designation-add" loading={busy === name.trim() && !!busy} disabled={!name.trim()}>Add</Button></>}>
      <form id="designation-add" onSubmit={(e) => { e.preventDefault(); add(name, true); }}>
        <FormGrid>
          <Field label="Job title" className="sm:col-span-2">
            <TextInput autoFocusInModal value={name} onValueChange={setName} placeholder="e.g. Payroll Specialist" />
          </Field>
          <Field label="Code" aside="Optional">
            <TextInput value={code} onValueChange={(x) => setCode(x.toUpperCase())} maxLength={20} placeholder="e.g. PAY-SPL" className="font-mono" />
          </Field>
          <Field label="Grade" aside="Optional" hint="Also used for the suggestions below">
            <Select value={grade} onChange={setGrade} options={grades} clearable placeholder="Pick a grade" />
          </Field>
        </FormGrid>
        <CustomFields entity="designation" layout={cf.layout} values={cf.values} onChange={cf.setValues} errors={cf.errors} />
      </form>
      {suggestions.length > 0 && (
        <div className="mt-6">
          <p className="mb-2.5 text-[12px] uppercase tracking-[0.06em] text-faint">Suggestions</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((t) => (
              <button key={t} type="button" disabled={!!busy} onClick={() => add(t, false)}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[13px] text-ink transition-colors hover:border-primary/40 hover:bg-primary-soft/50 disabled:opacity-50">
                <Plus size={13} strokeWidth={1.4} className="text-faint" />{t}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── Rename ────────────────────────────────────────────────────────────── */

function EditDesignationModal({ designation, open, onClose, onSaved }: { designation: Designation | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const initial = {
    name: designation?.designation_name ?? "", code: designation?.code ?? "",
    grade: designation?.grade_id ?? null, description: designation?.description ?? "",
  };
  const [v, setV] = useState(initial);
  const grades = useGradeOptions(designation?.grade_id);
  const cf = useCustomFieldDraft("designation", designation?.custom);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!designation) return;
    if (!v.name.trim()) { setError("Enter a name"); return; }
    if (!cf.check()) return;
    setSaving(true);
    try {
      await api.put(`/designations/${designation.uuid}`, {
        designation_name: v.name.trim(), code: v.code.trim() || null, grade_id: v.grade, description: v.description.trim() || null,
        custom: cf.values,
      });
      toast.success("Designation updated");
      onSaved();
    } catch (err: unknown) {
      toast.error("Couldn't save the designation", { description: err instanceof Error ? err.message : undefined });
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open && !!designation} onClose={onClose} size="md" busy={saving} dirty={!!designation && (JSON.stringify(v) !== JSON.stringify(initial) || cf.dirty)}
      title={designation ? `Edit ${designation.designation_name}` : "Edit designation"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="designation-edit" loading={saving}>Save changes</Button></>}>
      <form id="designation-edit" onSubmit={save} noValidate>
        <FormGrid>
          <Field label="Name" required error={error} className="sm:col-span-2" hint={designation?.employee_count ? `${designation.employee_count} ${designation.employee_count === 1 ? "person has" : "people have"} this title` : undefined}>
            <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} />
          </Field>
          <Field label="Code" aside="Optional">
            <TextInput value={v.code} onValueChange={(x) => setV({ ...v, code: x.toUpperCase() })} maxLength={20} className="font-mono" />
          </Field>
          <Field label="Grade" aside="Optional">
            <Select value={v.grade} onChange={(x) => setV({ ...v, grade: x })} options={grades} clearable placeholder="Pick a grade" />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={2} placeholder="What people with this title do" />
          </Field>
        </FormGrid>
        <CustomFields entity="designation" layout={cf.layout} values={cf.values} onChange={cf.setValues} errors={cf.errors} />
      </form>
    </Modal>
  );
}

/* ── Details ───────────────────────────────────────────────────────────── */

function DesignationDetailModal({ designation: d, open, onClose, onEdit, onDelete }: {
  designation: Designation | null; open: boolean; onClose: () => void; onEdit: (d: Designation) => void; onDelete: (d: Designation) => void;
}) {
  const [members, setMembers] = useState<{ id: number; rows: Member[] } | null>(null);
  useEffect(() => {
    if (!d) return;
    let live = true;
    api.get<Member[]>(`/employees/?designation_id=${d.id}`)
      .then((r) => { if (live) setMembers({ id: d.id, rows: Array.isArray(r) ? r : [] }); })
      .catch(() => { if (live) setMembers({ id: d.id, rows: [] }); });
    return () => { live = false; };
  }, [d]);
  const list = members && d && members.id === d.id ? members.rows : null;

  return (
    <Modal open={open && !!d} onClose={onClose} size="md"
      title={d?.designation_name}
      description={d ? (d.is_global ? "Built-in title, available to every company" : "Custom title") : undefined}
      headerActions={d && !d.is_global && <Button size="sm" icon={Pencil} onClick={() => onEdit(d)}>Edit</Button>}
      footer={d && !d.is_global && <Button icon={Trash2} onClick={() => onDelete(d)}>Delete</Button>}>
      <Section title="Overview">
        <KeyValue columns={2} items={[
          { label: "Grade", value: d?.grade_name },
          { label: "Code", value: d?.code && <span className="font-mono text-[13px]">{d.code}</span> },
          ...(d?.description ? [{ label: "Description", value: d.description, span: 2 as const }] : []),
        ]} />
      </Section>
      {d && <div className="border-t border-line empty:hidden"><CustomFields entity="designation" mode="view" values={d.custom} /></div>}
      <Section title="People with this title" className="border-t border-line" description={list ? `${list.length} ${list.length === 1 ? "employee" : "employees"}` : undefined}>
        {!list ? (
          <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-3 w-40" /></div>)}</div>
        ) : list.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-5 text-[13.5px] text-muted"><Users size={16} strokeWidth={1.4} className="text-faint" /> No one has this title yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {list.map((m) => {
              const name = `${m.first_name} ${m.last_name}`.trim();
              return (
                <li key={m.uuid}>
                  <Link href={`/dashboard/staff?view=${m.uuid}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-sunken/70">
                    <Avatar name={name} src={m.profile_image_url} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] text-ink">{name}</span>
                      {(m.department_name || m.email) && <span className="block truncate text-[12.5px] text-muted">{m.department_name || m.email}</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </Modal>
  );
}
