"use client";

/*
 * Grades / bands: FilterBar + DataTable sorted by rank. Row click opens the detail modal;
 * New / Edit open the form modal; grades are switched off, never deleted.
 */
import { useMemo, useState } from "react";
import { Eye, Layers3, Pencil, Plus, Power, PowerOff } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Button, DataTable, Field, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, NumberInput, Section,
  TextInput, Textarea, paginate, type Column, type FilterValues,
} from "@/components/ui-kit";
import {
  Dash, STATUS_FILTER, StatusBadge, errorText, formatMoney, matchesStatus, orNull, toNumber, useList, useSwitchActive,
} from "@/components/org/shared";

interface Grade {
  id: number; uuid: string; name: string; code: string | null; band: string | null; rank: number | null;
  min_ctc: number | string | null; max_ctc: number | string | null; description: string | null;
  active: boolean; employee_count: number; designation_count: number;
}

function ctcRange(g: Grade) {
  const lo = formatMoney(g.min_ctc), hi = formatMoney(g.max_ctc);
  if (lo && hi) return `${lo} – ${hi}`;
  if (lo) return `From ${lo}`;
  if (hi) return `Up to ${hi}`;
  return "";
}

export default function GradesPage() {
  const switchActive = useSwitchActive();
  const { rows: all, loading, refresh } = useList<Grade>("/organization/grades", "Couldn't load grades");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [formFor, setFormFor] = useState<Grade | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<Grade | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const openView = (g: Grade) => { setViewing(g); setViewOpen(true); };
  const openForm = (g: Grade | "new") => { setFormKey((k) => k + 1); setFormFor(g); setFormOpen(true); };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all
      .filter((g) => (!q || [g.name, g.code, g.band].some((x) => (x || "").toLowerCase().includes(q))) && matchesStatus(g.active, filters))
      .sort((a, b) => (a.rank ?? 9999) - (b.rank ?? 9999) || a.name.localeCompare(b.name));
  }, [all, search, filters]);

  async function toggle(g: Grade) {
    const ok = await switchActive({ path: `/organization/grades/${g.uuid}`, name: g.name, active: g.active,
      message: "People and designations keep this grade, but it can't be picked for anyone new." });
    if (ok) { setViewOpen(false); refresh(); }
  }

  const columns: Column<Grade>[] = [
    { key: "rank", header: "Rank", width: "72px", sortable: true, sortValue: (g) => g.rank, cell: (g) => <span className="tabular text-muted">{g.rank ?? "—"}</span> },
    { key: "code", header: "Code", sortable: true, sortValue: (g) => g.code, hideBelow: "sm", cell: (g) => g.code ? <span className="font-mono text-[12.5px] text-muted">{g.code}</span> : <Dash /> },
    {
      key: "name", header: "Grade", sortable: true, sortValue: (g) => g.name,
      cell: (g) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{g.name}</p>
          {g.band && <p className="truncate text-[12.5px] text-muted md:hidden">{g.band}</p>}
        </div>
      ),
    },
    { key: "band", header: "Band", sortable: true, sortValue: (g) => g.band, hideBelow: "md", cell: (g) => g.band ? <span className="text-ink/80">{g.band}</span> : <Dash /> },
    { key: "ctc", header: "CTC range", sortable: true, sortValue: (g) => toNumber(g.min_ctc), hideBelow: "lg", cell: (g) => ctcRange(g) ? <span className="tabular text-ink/80">{ctcRange(g)}</span> : <Dash /> },
    { key: "designations", header: "Designations", align: "right", sortable: true, sortValue: (g) => g.designation_count, hideBelow: "md", cell: (g) => <span className="tabular text-muted">{g.designation_count}</span> },
    { key: "employees", header: "Employees", align: "right", sortable: true, sortValue: (g) => g.employee_count, cell: (g) => <span className="tabular text-muted">{g.employee_count}</span> },
    { key: "status", header: "Status", hideBelow: "sm", cell: (g) => <StatusBadge active={g.active} /> },
  ];

  const filtered = !!search || !!filters.status?.length;
  return (
    <div>
      <PageHeader eyebrow="Settings" title="Grades" description="Levels of seniority, from the most junior up, with an optional pay range for each."
        actions={<Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New grade</Button>} />
      <FilterBar
        searchPlaceholder="Search grades"
        onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[STATUS_FILTER]}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
      />
      <DataTable
        rows={paginate(rows, page, size)}
        rowKey={(g) => g.uuid}
        columns={columns}
        loading={loading}
        onRowClick={openView}
        rowActions={(g) => [
          { label: "View details", icon: Eye, onSelect: () => openView(g) },
          { label: "Edit", icon: Pencil, onSelect: () => openForm(g) },
          "separator",
          g.active ? { label: "Switch off", icon: PowerOff, danger: true, onSelect: () => toggle(g) } : { label: "Switch on", icon: Power, onSelect: () => toggle(g) },
        ]}
        pagination={{ page, size, total: rows.length, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={Layers3}
        emptyTitle={filtered ? "No grades match" : "No grades yet"}
        emptyHint={filtered ? "Try another search or clear the filters." : "Add grades such as Associate, Manager and Director."}
        emptyAction={!filtered && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New grade</Button>}
      />

      <GradeDetailModal grade={viewing} open={viewOpen} onClose={() => setViewOpen(false)}
        onEdit={(g) => { setViewOpen(false); openForm(g); }} onToggle={toggle} />
      <GradeFormModal key={formKey} target={formFor} open={formOpen} nextRank={(all.reduce((m, g) => Math.max(m, g.rank ?? 0), 0) || 0) + 1}
        onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refresh(); }} />
    </div>
  );
}

/* ── Form ──────────────────────────────────────────────────────────────── */

function GradeFormModal({ target, open, nextRank, onClose, onSaved }: { target: Grade | "new"; open: boolean; nextRank: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const editing = target !== "new" ? target : null;
  const initial = {
    name: editing?.name ?? "", code: editing?.code ?? "", band: editing?.band ?? "",
    rank: editing ? editing.rank : nextRank,
    min: toNumber(editing?.min_ctc), max: toNumber(editing?.max_ctc), description: editing?.description ?? "",
  };
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<{ name?: string; max?: string }>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!v.name.trim()) errs.name = "Give the grade a name";
    if (v.min !== null && v.max !== null && v.max < v.min) errs.max = "Should be more than the minimum";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const payload = { name: v.name.trim(), code: orNull(v.code), band: orNull(v.band), rank: v.rank, min_ctc: v.min, max_ctc: v.max, description: orNull(v.description) };
      if (editing) { await api.put(`/organization/grades/${editing.uuid}`, payload); toast.success("Grade updated"); }
      else { await api.post("/organization/grades", payload); toast.success("Grade created"); }
      onSaved();
    } catch (err: unknown) {
      toast.error("Couldn't save the grade", { description: errorText(err) });
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" dirty={dirty} busy={saving}
      title={editing ? `Edit ${editing.name}` : "New grade"}
      description={editing ? undefined : "A level of seniority, such as Associate or Manager."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="grade-form" loading={saving}>{editing ? "Save changes" : "Create grade"}</Button></>}>
      <form id="grade-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Name" required error={errors.name} className="sm:col-span-2">
            <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setErrors({ ...errors, name: undefined }); }} placeholder="e.g. Senior associate" />
          </Field>
          <Field label="Code" aside="Optional">
            <TextInput value={v.code} onValueChange={(x) => setV({ ...v, code: x.toUpperCase() })} maxLength={20} placeholder="e.g. G2" className="font-mono" />
          </Field>
          <Field label="Band" aside="Optional">
            <TextInput value={v.band} onValueChange={(x) => setV({ ...v, band: x })} maxLength={60} placeholder="e.g. Band A" />
          </Field>
          <Field label="Rank" hint="1 is the most junior">
            <NumberInput value={v.rank} onChange={(x) => setV({ ...v, rank: x })} min={0} max={1000} />
          </Field>
          <div className="hidden sm:block" />
          <Field label="Minimum CTC" aside="Per year">
            <NumberInput value={v.min} onChange={(x) => { setV({ ...v, min: x }); setErrors({ ...errors, max: undefined }); }} min={0} step={10000} suffix="₹" placeholder="0" />
          </Field>
          <Field label="Maximum CTC" aside="Per year" error={errors.max}>
            <NumberInput value={v.max} onChange={(x) => { setV({ ...v, max: x }); setErrors({ ...errors, max: undefined }); }} min={0} step={10000} suffix="₹" placeholder="0" />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={3} placeholder="Who sits at this grade" />
          </Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Details ───────────────────────────────────────────────────────────── */

function GradeDetailModal({ grade: g, open, onClose, onEdit, onToggle }: {
  grade: Grade | null; open: boolean; onClose: () => void; onEdit: (g: Grade) => void; onToggle: (g: Grade) => void;
}) {
  return (
    <Modal open={open && !!g} onClose={onClose} size="md"
      title={g?.name}
      description={g ? [g.band, g.rank !== null ? `Rank ${g.rank}` : null].filter(Boolean).join(" · ") || undefined : undefined}
      leading={g && <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><Layers3 size={20} strokeWidth={1.4} /></span>}
      headerActions={g && <Button size="sm" icon={Pencil} onClick={() => onEdit(g)}>Edit</Button>}
      footer={g && (g.active ? <Button icon={PowerOff} onClick={() => onToggle(g)}>Switch off</Button> : <Button icon={Power} onClick={() => onToggle(g)}>Switch on</Button>)}>
      {g && (
        <>
          <Section title="Overview">
            <KeyValue columns={2} items={[
              { label: "Code", value: g.code && <span className="font-mono text-[13px]">{g.code}</span> },
              { label: "Status", value: <StatusBadge active={g.active} /> },
              { label: "Band", value: g.band },
              { label: "Rank", value: g.rank },
              { label: "CTC range", value: ctcRange(g) || null, span: 2 },
              { label: "Description", value: g.description, span: 2 },
            ]} />
          </Section>
          <Section title="Used by" className="border-t border-line">
            <KeyValue columns={2} items={[
              { label: "Designations", value: <span className="tabular">{g.designation_count}</span> },
              { label: "Employees", value: <span className="tabular">{g.employee_count}</span> },
            ]} />
          </Section>
        </>
      )}
    </Modal>
  );
}
