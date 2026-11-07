"use client";

/*
 * Cost centres: FilterBar + DataTable. Row click opens the detail modal; New / Edit open
 * the form modal; cost centres are switched off, never deleted.
 */
import { useMemo, useState } from "react";
import { Coins, Eye, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Button, DataTable, Field, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, Section, Select,
  TextInput, Textarea, paginate, type Column, type FilterValues,
} from "@/components/ui-kit";
import {
  Dash, PersonInline, STATUS_FILTER, StatusBadge, errorText, matchesStatus, orNull, searchEmployees, useList, useOptions, useSwitchActive,
  type PersonRef,
} from "@/components/org/shared";

interface CostCentre {
  id: number; uuid: string; name: string; code: string | null; description: string | null;
  legal_entity_id: number | null; legal_entity_name: string | null;
  owner_employee_id: number | null; owner: PersonRef; active: boolean; employee_count: number; department_count: number;
}
type Entity = { id: number; name: string; active: boolean };

export default function CostCentresPage() {
  const switchActive = useSwitchActive();
  const { rows: all, loading, refresh } = useList<CostCentre>("/organization/cost-centres", "Couldn't load cost centres");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [formFor, setFormFor] = useState<CostCentre | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<CostCentre | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const openView = (c: CostCentre) => { setViewing(c); setViewOpen(true); };
  const openForm = (c: CostCentre | "new") => { setFormKey((k) => k + 1); setFormFor(c); setFormOpen(true); };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((c) => (!q || [c.name, c.code, c.legal_entity_name, c.owner?.name].some((x) => (x || "").toLowerCase().includes(q))) && matchesStatus(c.active, filters));
  }, [all, search, filters]);

  async function toggle(c: CostCentre) {
    const ok = await switchActive({ path: `/organization/cost-centres/${c.uuid}`, name: c.name, active: c.active,
      message: "Departments and people keep it on record, but it can't be picked for anything new." });
    if (ok) { setViewOpen(false); refresh(); }
  }

  const columns: Column<CostCentre>[] = [
    {
      key: "name", header: "Cost centre", sortable: true, sortValue: (c) => c.name,
      cell: (c) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted"><Coins size={16} strokeWidth={1.4} /></span>
          <div className="min-w-0">
            <p className="truncate text-ink">{c.name}</p>
            {c.description && <p className="truncate text-[12.5px] text-muted">{c.description}</p>}
          </div>
        </div>
      ),
    },
    { key: "code", header: "Code", sortable: true, sortValue: (c) => c.code, hideBelow: "md", cell: (c) => c.code ? <span className="font-mono text-[12.5px] text-muted">{c.code}</span> : <Dash /> },
    { key: "entity", header: "Legal entity", sortable: true, sortValue: (c) => c.legal_entity_name, hideBelow: "lg", cell: (c) => c.legal_entity_name ? <span className="text-ink/80">{c.legal_entity_name}</span> : <Dash /> },
    { key: "owner", header: "Owner", sortable: true, sortValue: (c) => c.owner?.name, hideBelow: "sm", cell: (c) => <PersonInline person={c.owner} /> },
    { key: "departments", header: "Departments", align: "right", sortable: true, sortValue: (c) => c.department_count, hideBelow: "md", cell: (c) => <span className="tabular text-muted">{c.department_count}</span> },
    { key: "employees", header: "Employees", align: "right", sortable: true, sortValue: (c) => c.employee_count, cell: (c) => <span className="tabular text-muted">{c.employee_count}</span> },
    { key: "status", header: "Status", hideBelow: "sm", cell: (c) => <StatusBadge active={c.active} /> },
  ];

  const filtered = !!search || !!filters.status?.length;
  return (
    <div>
      <PageHeader eyebrow="Settings" title="Cost centres" description="Where salary and other costs are booked, so finance can see what each part of the company spends."
        actions={<Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New cost centre</Button>} />
      <FilterBar
        searchPlaceholder="Search cost centres"
        onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[STATUS_FILTER]}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
      />
      <DataTable
        rows={paginate(rows, page, size)}
        rowKey={(c) => c.uuid}
        columns={columns}
        loading={loading}
        onRowClick={openView}
        rowActions={(c) => [
          { label: "View details", icon: Eye, onSelect: () => openView(c) },
          { label: "Edit", icon: Pencil, onSelect: () => openForm(c) },
          "separator",
          c.active ? { label: "Switch off", icon: PowerOff, danger: true, onSelect: () => toggle(c) } : { label: "Switch on", icon: Power, onSelect: () => toggle(c) },
        ]}
        pagination={{ page, size, total: rows.length, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={Coins}
        emptyTitle={filtered ? "No cost centres match" : "No cost centres yet"}
        emptyHint={filtered ? "Try another search or clear the filters." : "Add cost centres such as Engineering, Sales or Administration."}
        emptyAction={!filtered && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New cost centre</Button>}
      />

      <CostCentreDetailModal centre={viewing} open={viewOpen} onClose={() => setViewOpen(false)}
        onEdit={(c) => { setViewOpen(false); openForm(c); }} onToggle={toggle} />
      <CostCentreFormModal key={formKey} target={formFor} open={formOpen}
        onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refresh(); }} />
    </div>
  );
}

/* ── Form ──────────────────────────────────────────────────────────────── */

function CostCentreFormModal({ target, open, onClose, onSaved }: { target: CostCentre | "new"; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const editing = target !== "new" ? target : null;
  const entities = useOptions<Entity>("/organization/legal-entities", (e) => ({ value: e.id, label: e.name }), (e) => e.active || e.id === editing?.legal_entity_id);
  const initial = {
    name: editing?.name ?? "", code: editing?.code ?? "", description: editing?.description ?? "",
    entity: editing?.legal_entity_id ?? null, owner: editing?.owner_employee_id ?? null,
  };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError("Give the cost centre a name"); return; }
    setSaving(true);
    try {
      const payload = { name: v.name.trim(), code: orNull(v.code), description: orNull(v.description), legal_entity_id: v.entity, owner_employee_id: v.owner };
      if (editing) { await api.put(`/organization/cost-centres/${editing.uuid}`, payload); toast.success("Cost centre updated"); }
      else { await api.post("/organization/cost-centres", payload); toast.success("Cost centre created"); }
      onSaved();
    } catch (err: unknown) {
      toast.error("Couldn't save the cost centre", { description: errorText(err) });
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" dirty={dirty} busy={saving}
      title={editing ? `Edit ${editing.name}` : "New cost centre"}
      description={editing ? undefined : "A place where costs are booked, such as Engineering or Sales."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="cost-centre-form" loading={saving}>{editing ? "Save changes" : "Create cost centre"}</Button></>}>
      <form id="cost-centre-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Name" required error={error} className="sm:col-span-2">
            <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} placeholder="e.g. Engineering and product" />
          </Field>
          <Field label="Code" aside="Optional">
            <TextInput value={v.code} onValueChange={(x) => setV({ ...v, code: x.toUpperCase() })} maxLength={30} placeholder="e.g. CC-ENG" className="font-mono" />
          </Field>
          <Field label="Legal entity" aside="Optional">
            <Select value={v.entity} onChange={(x) => setV({ ...v, entity: x })} options={entities} clearable placeholder="Any entity" />
          </Field>
          <Field label="Owner" aside="Optional" hint="Who answers for this budget" className="sm:col-span-2">
            <Select value={v.owner} onChange={(x) => setV({ ...v, owner: x })} loadOptions={searchEmployees} clearable placeholder="Search people"
              selectedOption={editing?.owner_employee_id ? { value: editing.owner_employee_id, label: editing.owner?.name || "Current owner" } : null} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={3} placeholder="What is booked here" />
          </Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Details ───────────────────────────────────────────────────────────── */

function CostCentreDetailModal({ centre: c, open, onClose, onEdit, onToggle }: {
  centre: CostCentre | null; open: boolean; onClose: () => void; onEdit: (c: CostCentre) => void; onToggle: (c: CostCentre) => void;
}) {
  return (
    <Modal open={open && !!c} onClose={onClose} size="md"
      title={c?.name}
      description={c?.description || undefined}
      leading={c && <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><Coins size={20} strokeWidth={1.4} /></span>}
      headerActions={c && <Button size="sm" icon={Pencil} onClick={() => onEdit(c)}>Edit</Button>}
      footer={c && (c.active ? <Button icon={PowerOff} onClick={() => onToggle(c)}>Switch off</Button> : <Button icon={Power} onClick={() => onToggle(c)}>Switch on</Button>)}>
      {c && (
        <>
          <Section title="Overview">
            <KeyValue columns={2} items={[
              { label: "Code", value: c.code && <span className="font-mono text-[13px]">{c.code}</span> },
              { label: "Status", value: <StatusBadge active={c.active} /> },
              { label: "Legal entity", value: c.legal_entity_name },
              { label: "Owner", value: c.owner && <span className="flex items-center gap-2"><Avatar name={c.owner.name} src={c.owner.photo} size={24} />{c.owner.name}</span> },
            ]} />
          </Section>
          <Section title="Booked here" className="border-t border-line">
            <KeyValue columns={2} items={[
              { label: "Departments", value: <span className="tabular">{c.department_count}</span> },
              { label: "Employees", value: <span className="tabular">{c.employee_count}</span> },
            ]} />
          </Section>
        </>
      )}
    </Modal>
  );
}
