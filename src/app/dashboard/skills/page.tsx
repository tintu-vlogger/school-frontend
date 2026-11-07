"use client";

/*
 * Skills library: FilterBar (search, category, status) + DataTable. Row click opens the
 * detail modal with the people who have the skill (filter by minimum level); New / Edit
 * open the form modal; skills are switched off, never deleted.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Eye, Lightbulb, Pencil, Plus, Power, PowerOff, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, Field, FilterBar, FormGrid, KeyValue, MasterSelect, Modal, ModalCancel, Section, Skeleton,
  Tabs, TextInput, Textarea, paginate, type Column, type FilterOption, type FilterValues,
} from "@/components/ui-kit";
import { Dash, STATUS_FILTER, StatusBadge, errorText, matchesStatus, orNull, useList, useSwitchActive } from "@/components/org/shared";

interface Skill {
  id: number; uuid: string; name: string; category_id: number | null; category_name: string | null;
  description: string | null; active: boolean; people_count: number; verified_count: number;
}
type Holder = { uuid: string; name: string; photo: string | null; designation: string | null; level: number; level_label: string; verified: boolean; years: number | null };
type CategoryOption = { value: number; label: string; parent_id: number | null };

export default function SkillsPage() {
  const switchActive = useSwitchActive();
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [search, setSearch] = useState("");
  const category = filters.category?.[0] ?? "";
  const { rows: all, loading, refresh } = useList<Skill>(`/organization/skills${category ? `?category_id=${category}` : ""}`, "Couldn't load skills");
  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [formFor, setFormFor] = useState<Skill | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<Skill | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const openView = (s: Skill) => { setViewing(s); setViewOpen(true); };
  const openForm = (s: Skill | "new") => { setFormKey((k) => k + 1); setFormFor(s); setFormOpen(true); };

  useEffect(() => {
    let live = true;
    api.get<{ items: CategoryOption[] }>("/masters/options/skill_category?limit=200")
      .then((r) => {
        if (!live) return;
        const top = (r?.items ?? []).filter((o) => !o.parent_id).sort((a, b) => a.label.localeCompare(b.label));
        setCategories(top.map((o) => ({ value: String(o.value), label: o.label })));
      })
      .catch(() => { if (live) setCategories([]); });
    return () => { live = false; };
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((s) => (!q || s.name.toLowerCase().includes(q) || (s.category_name || "").toLowerCase().includes(q)) && matchesStatus(s.active, filters));
  }, [all, search, filters]);

  async function toggle(s: Skill) {
    const ok = await switchActive({ path: `/organization/skills/${s.uuid}`, name: s.name, active: s.active,
      message: "People keep it on their profile, but it can't be added to anyone new." });
    if (ok) { setViewOpen(false); refresh(); }
  }

  const columns: Column<Skill>[] = [
    {
      key: "name", header: "Skill", sortable: true, sortValue: (s) => s.name,
      cell: (s) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted"><Lightbulb size={16} strokeWidth={1.4} /></span>
          <div className="min-w-0">
            <p className="truncate text-ink">{s.name}</p>
            {s.description && <p className="truncate text-[12.5px] text-muted">{s.description}</p>}
          </div>
        </div>
      ),
    },
    { key: "category", header: "Category", sortable: true, sortValue: (s) => s.category_name, hideBelow: "sm", cell: (s) => s.category_name ? <Badge>{s.category_name}</Badge> : <Dash /> },
    { key: "people", header: "People", align: "right", sortable: true, sortValue: (s) => s.people_count, cell: (s) => <span className="tabular text-muted">{s.people_count}</span> },
    {
      key: "verified", header: "Verified", align: "right", sortable: true, sortValue: (s) => s.verified_count, hideBelow: "md",
      cell: (s) => s.verified_count ? <span className="inline-flex items-center gap-1.5 tabular text-muted"><BadgeCheck size={14} strokeWidth={1.4} className="text-emerald-600" />{s.verified_count}</span> : <span className="tabular text-faint">0</span>,
    },
    { key: "status", header: "Status", hideBelow: "sm", cell: (s) => <StatusBadge active={s.active} /> },
  ];

  const filtered = !!search || !!filters.status?.length || !!category;
  return (
    <div>
      <PageHeader eyebrow="People" title="Skills" description="The skills your company tracks, and who has them."
        actions={<Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New skill</Button>} />
      <FilterBar
        searchPlaceholder="Search skills"
        onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[{ key: "category", label: "Category", options: categories }, STATUS_FILTER]}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
      />
      <DataTable
        rows={paginate(rows, page, size)}
        rowKey={(s) => s.uuid}
        columns={columns}
        loading={loading}
        onRowClick={openView}
        rowActions={(s) => [
          { label: "Who has this skill", icon: Eye, onSelect: () => openView(s) },
          { label: "Edit", icon: Pencil, onSelect: () => openForm(s) },
          "separator",
          s.active ? { label: "Switch off", icon: PowerOff, danger: true, onSelect: () => toggle(s) } : { label: "Switch on", icon: Power, onSelect: () => toggle(s) },
        ]}
        pagination={{ page, size, total: rows.length, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={Lightbulb}
        emptyTitle={filtered ? "No skills match" : "No skills yet"}
        emptyHint={filtered ? "Try another search or clear the filters." : "Build a library of skills such as Python, Payroll or Negotiation."}
        emptyAction={!filtered && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New skill</Button>}
      />

      <SkillDetailModal skill={viewing} open={viewOpen} onClose={() => setViewOpen(false)}
        onEdit={(s) => { setViewOpen(false); openForm(s); }} onToggle={toggle} />
      <SkillFormModal key={formKey} target={formFor} open={formOpen}
        onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refresh(); }} />
    </div>
  );
}

/* ── Form ──────────────────────────────────────────────────────────────── */

function SkillFormModal({ target, open, onClose, onSaved }: { target: Skill | "new"; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const editing = target !== "new" ? target : null;
  const initial = { name: editing?.name ?? "", category: editing?.category_id ?? null, description: editing?.description ?? "" };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError("Give the skill a name"); return; }
    setSaving(true);
    try {
      const payload = { name: v.name.trim(), category_id: v.category, description: orNull(v.description) };
      if (editing) { await api.put(`/organization/skills/${editing.uuid}`, payload); toast.success("Skill updated"); }
      else { await api.post("/organization/skills", payload); toast.success("Skill added"); }
      onSaved();
    } catch (err: unknown) {
      toast.error("Couldn't save the skill", { description: errorText(err) });
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" dirty={dirty} busy={saving}
      title={editing ? `Edit ${editing.name}` : "New skill"}
      description={editing ? undefined : "Something people can be good at, such as Python or Negotiation."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="skill-form" loading={saving}>{editing ? "Save changes" : "Add skill"}</Button></>}>
      <form id="skill-form" onSubmit={submit} noValidate>
        <FormGrid columns={1}>
          <Field label="Name" required error={error}>
            <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} placeholder="e.g. Python" maxLength={120} />
          </Field>
          <Field label="Category" aside="Optional">
            <MasterSelect type="skill_category" value={v.category} onChange={(x) => setV({ ...v, category: x })} clearable placeholder="Pick a category" />
          </Field>
          <Field label="Description">
            <Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={3} placeholder="What this skill covers" />
          </Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Details ───────────────────────────────────────────────────────────── */

function LevelDots({ level, label }: { level: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-2" title={label}>
      <span className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= level ? "bg-primary" : "bg-line-strong"}`} />)}
      </span>
      <span className="text-[12.5px] text-muted">{label}</span>
    </span>
  );
}

const LEVELS = [
  { value: "1", label: "Any level" }, { value: "2", label: "2+" }, { value: "3", label: "3+" }, { value: "4", label: "4+" }, { value: "5", label: "5" },
];

function SkillDetailModal({ skill: s, open, onClose, onEdit, onToggle }: {
  skill: Skill | null; open: boolean; onClose: () => void; onEdit: (s: Skill) => void; onToggle: (s: Skill) => void;
}) {
  const [minLevel, setMinLevel] = useState("1");
  const [people, setPeople] = useState<{ key: string; rows: Holder[] } | null>(null);
  const key = s ? `${s.uuid}:${minLevel}` : "";
  useEffect(() => {
    if (!s) return;
    let live = true;
    api.get<Holder[]>(`/organization/skills/${s.uuid}/people?min_level=${minLevel}`)
      .then((r) => { if (live) setPeople({ key, rows: Array.isArray(r) ? r : [] }); })
      .catch(() => { if (live) setPeople({ key, rows: [] }); });
    return () => { live = false; };
  }, [s, minLevel, key]);
  const list = people?.key === key ? people.rows : null;
  const [lastSkill, setLastSkill] = useState<string | null>(null);
  if (s && s.uuid !== lastSkill) { setLastSkill(s.uuid); setMinLevel("1"); }

  return (
    <Modal open={open && !!s} onClose={onClose} size="lg"
      title={s?.name}
      description={s?.description || s?.category_name || undefined}
      leading={s && <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><Lightbulb size={20} strokeWidth={1.4} /></span>}
      headerActions={s && <Button size="sm" icon={Pencil} onClick={() => onEdit(s)}>Edit</Button>}
      footer={s && (s.active ? <Button icon={PowerOff} onClick={() => onToggle(s)}>Switch off</Button> : <Button icon={Power} onClick={() => onToggle(s)}>Switch on</Button>)}>
      {s && (
        <>
          <Section title="Overview">
            <KeyValue columns={3} items={[
              { label: "Category", value: s.category_name },
              { label: "People", value: <span className="tabular">{s.people_count} <span className="text-muted">· {s.verified_count} verified</span></span> },
              { label: "Status", value: <StatusBadge active={s.active} /> },
            ]} />
          </Section>
          <Section title="Who has this skill" description={list ? `${list.length} ${list.length === 1 ? "person" : "people"}` : undefined}
            action={<Tabs variant="pill" value={minLevel} onChange={setMinLevel} items={LEVELS} />} className="border-t border-line">
            {!list ? (
              <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-3 w-40" /></div>)}</div>
            ) : list.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-5 text-[13.5px] text-muted">
                <Users size={16} strokeWidth={1.4} className="text-faint" />
                {minLevel === "1" ? "No one has this skill yet. Add it from a person's profile." : "No one at this level or above."}
              </p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {list.map((p) => (
                  <li key={p.uuid}>
                    <Link href={`/dashboard/staff?view=${p.uuid}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-sunken/70">
                      <Avatar name={p.name} src={p.photo} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[14px] text-ink">{p.name}</span>
                          {p.verified && <Badge tone="good"><BadgeCheck size={12} strokeWidth={1.4} />Verified</Badge>}
                        </span>
                        <span className="block truncate text-[12.5px] text-muted">
                          {[p.designation, p.years !== null ? `${p.years} ${p.years === 1 ? "year" : "years"}` : null].filter(Boolean).join(" · ") || " "}
                        </span>
                      </span>
                      <LevelDots level={p.level} label={p.level_label} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </Modal>
  );
}
