"use client";

/*
 * Departments: FilterBar + DataTable. Row click opens the detail modal (head, members);
 * New / Edit open the form modal; deactivation asks for confirmation.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Ban, Building2, Eye, Pencil, Plus, Users } from "lucide-react";
import { useAccess } from "@/lib/access";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import { CustomFields, useCustomFieldDraft, type CustomValues } from "@/components/custom-fields";
import {
  Avatar, Badge, Button, DataTable, Field, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, Section, Select, Skeleton,
  TextInput, Textarea, paginate, useConfirm, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";

interface Department {
  id: number; uuid: string; department_name: string; department_code: string | null;
  description: string | null; head_employee_id: number | null; head_employee_name: string | null;
  is_global?: boolean; active: boolean; employee_count: number; created_at?: string;
  parent_id?: number | null; parent_name?: string | null; cost_centre_id?: number | null; cost_centre_name?: string | null;
  location_id?: number | null; location_name?: string | null; child_count?: number;
  custom?: CustomValues;
}
type Named = { id: number; name: string; active: boolean };

type Member = { id: number; uuid?: string; first_name: string; last_name: string; email?: string | null; designation_name?: string | null };

const searchEmployees = async (q: string): Promise<SelectOption<number>[]> => {
  const r = await api.get<Member[]>(`/employees/?status=active${q ? `&search=${encodeURIComponent(q)}` : ""}`);
  return (Array.isArray(r) ? r : []).slice(0, 30).map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}`.trim(), description: e.designation_name || e.email || undefined }));
};

export default function DepartmentsPage() {
  const toast = useToast();
  // People without "Add and edit departments" see the list read-only.
  const canManage = useAccess().can("people.departments.manage");
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ nonce: number; rows: Department[] } | null>(null);
  // The target stays set while a modal animates out; the *Open flags drive visibility.
  const [formFor, setFormFor] = useState<Department | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<Department | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const openView = (d: Department) => { setViewing(d); setViewOpen(true); };

  useEffect(() => {
    let live = true;
    api.get<Department[]>("/departments/")
      .then((r) => { if (live) setResult({ nonce, rows: Array.isArray(r) ? r : [] }); })
      .catch(() => { if (live) { setResult({ nonce, rows: [] }); toast.error("Couldn't load departments"); } });
    return () => { live = false; };
  }, [nonce, toast]);
  const loading = result?.nonce !== nonce;
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const st = filters.status?.[0];
    return (result?.rows ?? []).filter((d) =>
      (!q || [d.department_name, d.department_code, d.parent_name, d.location_name].some((x) => (x || "").toLowerCase().includes(q))) &&
      (!st || (st === "active" ? d.active : !d.active)));
  }, [result, search, filters]);

  const openForm = (d: Department | "new") => { setFormKey((k) => k + 1); setFormFor(d); setFormOpen(true); };

  async function deactivate(list: Department[], clear?: () => void) {
    const editable = list.filter((d) => !d.is_global && d.active);
    if (!editable.length) { toast.info("Built-in or inactive departments can't be deactivated"); return; }
    const ok = await confirm({
      title: editable.length === 1 ? `Deactivate ${editable[0].department_name}?` : `Deactivate ${editable.length} departments?`,
      message: "Employees stay as they are, but the department is hidden from lists and new assignments.",
      confirmLabel: "Deactivate",
      tone: "danger",
    });
    if (!ok) return;
    const res = await Promise.allSettled(editable.map((d) => api.delete(`/departments/${d.uuid}`)));
    const failed = res.filter((r) => r.status === "rejected").length;
    if (failed) toast.error(`${failed} of ${editable.length} couldn't be deactivated`);
    else toast.success(editable.length === 1 ? "Department deactivated" : `${editable.length} departments deactivated`);
    setViewOpen(false);
    clear?.();
    refresh();
  }

  const columns: Column<Department>[] = [
    {
      key: "name", header: "Department", sortable: true, sortValue: (d) => d.department_name,
      cell: (d) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={d.department_name} size={34} square />
          <div className="min-w-0">
            <p className="truncate text-ink">{d.department_name}</p>
            {d.parent_name ? <p className="truncate text-[12.5px] text-muted">in {d.parent_name}</p>
              : d.description && <p className="truncate text-[12.5px] text-muted">{d.description}</p>}
          </div>
        </div>
      ),
    },
    { key: "code", header: "Code", sortable: true, sortValue: (d) => d.department_code, hideBelow: "md", cell: (d) => d.department_code ? <span className="font-mono text-[12.5px] text-muted">{d.department_code}</span> : <span className="text-faint">—</span> },
    { key: "head", header: "Head", sortable: true, sortValue: (d) => d.head_employee_name, hideBelow: "sm", cell: (d) => d.head_employee_name ? <span className="flex items-center gap-2"><Avatar name={d.head_employee_name} size={24} /><span className="text-ink/80">{d.head_employee_name}</span></span> : <span className="text-faint">—</span> },
    { key: "location", header: "Location", sortable: true, sortValue: (d) => d.location_name, hideBelow: "md", cell: (d) => d.location_name ? <span className="text-ink/80">{d.location_name}</span> : <span className="text-faint">—</span> },
    { key: "employees", header: "Employees", sortable: true, sortValue: (d) => d.employee_count, align: "right", cell: (d) => <span className="tabular text-muted">{d.employee_count}</span> },
    { key: "status", header: "Status", cell: (d) => d.is_global ? <Badge tone="accent">Built-in</Badge> : <Badge tone={d.active ? "good" : "neutral"} dot>{d.active ? "Active" : "Inactive"}</Badge> },
  ];

  const filtered = !!search || !!filters.status?.length;
  return (
    <div>
      <PageHeader eyebrow="People" title="Departments" description="How the company is organised, who heads each department and how many people are in it."
        actions={canManage ? <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New department</Button> : undefined} />
      <FilterBar
        searchPlaceholder="Search departments"
        onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[{ key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] }]}
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
          { label: "View details", icon: Eye, onSelect: () => openView(d) },
          ...(!d.is_global && canManage ? [
            { label: "Edit", icon: Pencil, onSelect: () => openForm(d) },
            ...(d.active ? ["separator" as const, { label: "Deactivate", icon: Ban, danger: true, onSelect: () => deactivate([d]) }] : []),
          ] : []),
        ]}
        selectable={canManage}
        bulkActions={canManage ? [{ label: "Deactivate", icon: Ban, danger: true, onSelect: (list, clear) => deactivate(list, clear) }] : undefined}
        pagination={{ page, size, total: rows.length, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={Building2}
        emptyTitle={filtered ? "No departments match" : "No departments yet"}
        emptyHint={filtered ? "Try another search or clear the filters." : "Group employees into departments such as Finance, Sales or Operations."}
        emptyAction={!filtered && canManage && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New department</Button>}
      />

      <DepartmentDetailModal
        department={viewing}
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        onEdit={(d) => { setViewOpen(false); openForm(d); }}
        onDeactivate={(d) => deactivate([d])}
        canManage={canManage}
      />
      <DepartmentFormModal
        key={formKey}
        target={formFor}
        all={result?.rows ?? []}
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={() => { setFormOpen(false); refresh(); }}
      />
    </div>
  );
}

/* ── Form ──────────────────────────────────────────────────────────────── */

/** Active rows of a {id, name, active} list as Select options (keeps the current pick even if switched off). */
function useNamedOptions(path: string, keep: number | null): SelectOption<number>[] {
  const [rows, setRows] = useState<Named[] | null>(null);
  useEffect(() => {
    let live = true;
    api.get<Named[]>(path).then((r) => { if (live) setRows(Array.isArray(r) ? r : []); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [path]);
  return (rows ?? []).filter((r) => r.active || r.id === keep).map((r) => ({ value: r.id, label: r.name }));
}

function DepartmentFormModal({ target, all, open, onClose, onSaved }: { target: Department | "new"; all: Department[]; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const editing = target !== "new" ? target : null;
  const initial = {
    name: editing?.department_name ?? "",
    code: editing?.department_code ?? "",
    description: editing?.description ?? "",
    head: editing?.head_employee_id ?? null,
    parent: editing?.parent_id ?? null,
    costCentre: editing?.cost_centre_id ?? null,
    location: editing?.location_id ?? null,
  };
  const costCentres = useNamedOptions("/organization/cost-centres", initial.costCentre);
  const locations = useNamedOptions("/organization/locations", initial.location);
  // Any other department, but not this one or anything under it (that would make a loop).
  const parents = useMemo(() => {
    const blocked = new Set<number>(editing ? [editing.id] : []);
    for (let grew = true; grew;) {
      grew = false;
      for (const d of all) if (d.parent_id && blocked.has(d.parent_id) && !blocked.has(d.id)) { blocked.add(d.id); grew = true; }
    }
    return all.filter((d) => !blocked.has(d.id) && (d.active || d.id === initial.parent))
      .map((d) => ({ value: d.id, label: d.department_name, description: d.parent_name ? `in ${d.parent_name}` : undefined }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [all, editing, initial.parent]);
  const [v, setV] = useState(initial);
  const cf = useCustomFieldDraft("department", editing?.custom);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial) || cf.dirty;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError("Give the department a name"); return; }
    if (!cf.check()) return;
    setSaving(true);
    try {
      const payload = {
        department_name: v.name.trim(), department_code: v.code.trim() || null, description: v.description.trim() || null, head_employee_id: v.head,
        parent_id: v.parent, cost_centre_id: v.costCentre, location_id: v.location, custom: cf.values,
      };
      if (editing) { await api.put(`/departments/${editing.uuid}`, payload); toast.success("Department updated"); }
      else { await api.post("/departments/", payload); toast.success("Department created"); }
      onSaved();
    } catch (err: unknown) {
      toast.error("Couldn't save the department", { description: err instanceof Error ? err.message : undefined });
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" dirty={dirty} busy={saving}
      title={editing ? `Edit ${editing.department_name}` : "New department"}
      description={editing ? undefined : "A group of people with a head, such as Finance or Sales."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="department-form" loading={saving}>{editing ? "Save changes" : "Create department"}</Button></>}>
      <form id="department-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Name" required error={error} className="sm:col-span-2">
            <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} placeholder="e.g. Finance" />
          </Field>
          <Field label="Short code" aside="Optional">
            <TextInput value={v.code} onValueChange={(x) => setV({ ...v, code: x.toUpperCase() })} maxLength={20} placeholder="e.g. FIN" className="font-mono" />
          </Field>
          <Field label="Department head" aside="Optional">
            <Select value={v.head} onChange={(x) => setV({ ...v, head: x })} loadOptions={searchEmployees} clearable placeholder="Search people"
              selectedOption={editing?.head_employee_id ? { value: editing.head_employee_id, label: editing.head_employee_name || "Current head" } : null} />
          </Field>
          <Field label="Part of" aside="Optional" hint="Leave empty for a top-level department">
            <Select value={v.parent} onChange={(x) => setV({ ...v, parent: x })} options={parents} clearable placeholder="None, top level" />
          </Field>
          <Field label="Location" aside="Optional">
            <Select value={v.location} onChange={(x) => setV({ ...v, location: x })} options={locations} clearable placeholder="Pick a location" />
          </Field>
          <Field label="Cost centre" aside="Optional" hint="Where this department's costs are booked">
            <Select value={v.costCentre} onChange={(x) => setV({ ...v, costCentre: x })} options={costCentres} clearable placeholder="Pick a cost centre" />
          </Field>
          <div className="hidden sm:block" />
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={3} placeholder="What this department does" />
          </Field>
        </FormGrid>
        <CustomFields entity="department" layout={cf.layout} values={cf.values} onChange={cf.setValues} errors={cf.errors} />
      </form>
    </Modal>
  );
}

/* ── Details ───────────────────────────────────────────────────────────── */

function DepartmentDetailModal({ department: d, open, onClose, onEdit, onDeactivate, canManage }: {
  department: Department | null; open: boolean; onClose: () => void; onEdit: (d: Department) => void; onDeactivate: (d: Department) => void;
  canManage: boolean;
}) {
  const [members, setMembers] = useState<{ uuid: string; rows: Member[] } | null>(null);
  useEffect(() => {
    if (!d) return;
    let live = true;
    api.get<Member[]>(`/departments/${d.uuid}/employees`)
      .then((r) => { if (live) setMembers({ uuid: d.uuid, rows: Array.isArray(r) ? r : [] }); })
      .catch(() => { if (live) setMembers({ uuid: d.uuid, rows: [] }); });
    return () => { live = false; };
  }, [d]);
  const list = members && d && members.uuid === d.uuid ? members.rows : null;

  return (
    <Modal open={open && !!d} onClose={onClose} size="lg"
      title={d?.department_name}
      description={d?.description || undefined}
      leading={d && <Avatar name={d.department_name} size={44} square />}
      headerActions={d && !d.is_global && canManage && <Button size="sm" icon={Pencil} onClick={() => onEdit(d)}>Edit</Button>}
      footer={d && !d.is_global && d.active && canManage && <Button icon={Ban} onClick={() => onDeactivate(d)}>Deactivate</Button>}>
      {d && (
        <>
          <Section title="Overview">
            <KeyValue columns={3} items={[
              { label: "Code", value: d.department_code },
              { label: "Head", value: d.head_employee_name },
              { label: "Status", value: d.is_global ? <Badge tone="accent">Built-in</Badge> : <Badge tone={d.active ? "good" : "neutral"} dot>{d.active ? "Active" : "Inactive"}</Badge> },
              { label: "Part of", value: d.parent_name },
              { label: "Location", value: d.location_name },
              { label: "Cost centre", value: d.cost_centre_name },
              ...(d.child_count ? [{ label: "Sub-departments", value: <span className="tabular">{d.child_count}</span> }] : []),
            ]} />
          </Section>
          <div className="border-t border-line empty:hidden"><CustomFields entity="department" mode="view" values={d.custom} /></div>
          <Section title="People" description={list ? `${list.length} active ${list.length === 1 ? "employee" : "employees"}` : undefined} className="border-t border-line">
            {!list ? (
              <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-3 w-40" /></div>)}</div>
            ) : list.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-5 text-[13.5px] text-muted"><Users size={16} strokeWidth={1.4} className="text-faint" /> No one is in this department yet. Assign people from their profile.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {list.map((m) => {
                  const name = `${m.first_name} ${m.last_name}`.trim();
                  const inner = <><Avatar name={name} size={30} /><span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-ink">{name}</span>{(m.designation_name || m.email) && <span className="block truncate text-[12.5px] text-muted">{m.designation_name || m.email}</span>}</span></>;
                  return (
                    <li key={m.id}>
                      {m.uuid ? <Link href={`/dashboard/staff?view=${m.uuid}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-sunken/70">{inner}</Link>
                        : <div className="flex items-center gap-3 px-4 py-2.5">{inner}</div>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </>
      )}
    </Modal>
  );
}
