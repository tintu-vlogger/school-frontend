"use client";

/*
 * Teams: working groups that can cut across departments. FilterBar + DataTable; row click
 * opens the detail modal with the members; New / Edit open the form modal (lead, members,
 * colour); teams are switched off, never deleted.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Crown, Eye, Pencil, Plus, Power, PowerOff, Users, UsersRound } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, AvatarGroup, Badge, Button, DataTable, Field, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, MultiSelect, Section, Select,
  Skeleton, TextInput, Textarea, paginate, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import {
  ColorDot, ColorSwatches, Dash, PersonInline, STATUS_FILTER, SWATCHES, StatusBadge, errorText, matchesStatus, orNull, searchEmployees,
  useList, useOptions, useSwitchActive, type PersonRef,
} from "@/components/org/shared";

type Person = { id: number; uuid: string; name: string; photo: string | null };
interface Team {
  id: number; uuid: string; name: string; code: string | null; description: string | null;
  lead_employee_id: number | null; lead: PersonRef; department_id: number | null; department_name: string | null;
  color: string | null; active: boolean; member_count: number; member_ids: number[]; preview: Person[];
}
type Member = { id: number; uuid: string; name: string; photo: string | null; designation: string | null; department: string | null; is_lead: boolean; active: boolean };
type TeamFull = Team & { members: Member[] };
type Dept = { id: number; department_name: string; active?: boolean };

function useTeamMembers(team: Team | null) {
  const [state, setState] = useState<{ uuid: string; rows: Member[] } | null>(null);
  useEffect(() => {
    if (!team) return;
    let live = true;
    api.get<TeamFull>(`/organization/teams/${team.uuid}`)
      .then((r) => { if (live) setState({ uuid: team.uuid, rows: Array.isArray(r?.members) ? r.members : [] }); })
      .catch(() => { if (live) setState({ uuid: team.uuid, rows: [] }); });
    return () => { live = false; };
  }, [team]);
  return state && team && state.uuid === team.uuid ? state.rows : null;
}

export default function TeamsPage() {
  const switchActive = useSwitchActive();
  const { rows: all, loading, refresh } = useList<Team>("/organization/teams", "Couldn't load teams");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [formFor, setFormFor] = useState<Team | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<Team | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const openView = (t: Team) => { setViewing(t); setViewOpen(true); };
  const openForm = (t: Team | "new") => { setFormKey((k) => k + 1); setFormFor(t); setFormOpen(true); };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((t) => (!q || [t.name, t.code, t.lead?.name, t.department_name].some((x) => (x || "").toLowerCase().includes(q))) && matchesStatus(t.active, filters));
  }, [all, search, filters]);

  async function toggle(t: Team) {
    const ok = await switchActive({ path: `/organization/teams/${t.uuid}`, name: t.name, active: t.active,
      message: "Members stay on record, but the team is hidden from lists, approvals and rosters." });
    if (ok) { setViewOpen(false); refresh(); }
  }

  const columns: Column<Team>[] = [
    {
      key: "name", header: "Team", sortable: true, sortValue: (t) => t.name,
      cell: (t) => (
        <div className="flex min-w-0 items-center gap-3">
          <ColorDot color={t.color} />
          <div className="min-w-0">
            <p className="truncate text-ink">{t.name}{t.code && <span className="ml-2 font-mono text-[12px] text-faint">{t.code}</span>}</p>
            {t.description && <p className="truncate text-[12.5px] text-muted">{t.description}</p>}
          </div>
        </div>
      ),
    },
    { key: "lead", header: "Lead", sortable: true, sortValue: (t) => t.lead?.name, hideBelow: "sm", cell: (t) => <PersonInline person={t.lead} /> },
    { key: "department", header: "Department", sortable: true, sortValue: (t) => t.department_name, hideBelow: "lg", cell: (t) => t.department_name ? <span className="text-ink/80">{t.department_name}</span> : <span className="text-faint">Cross-team</span> },
    {
      key: "members", header: "Members", sortable: true, sortValue: (t) => t.member_count, hideBelow: "md",
      cell: (t) => t.member_count ? (
        <span className="flex items-center gap-2.5">
          <AvatarGroup people={(t.preview ?? []).map((p) => ({ name: p.name, src: p.photo }))} max={4} size={26} />
          <span className="tabular text-[13px] text-muted">{t.member_count}</span>
        </span>
      ) : <Dash />,
    },
    { key: "status", header: "Status", hideBelow: "sm", cell: (t) => <StatusBadge active={t.active} /> },
  ];

  const filtered = !!search || !!filters.status?.length;
  return (
    <div>
      <PageHeader eyebrow="People" title="Teams" description="Working groups that can cut across departments, each with a lead."
        actions={<Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New team</Button>} />
      <FilterBar
        searchPlaceholder="Search teams"
        onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[STATUS_FILTER]}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
      />
      <DataTable
        rows={paginate(rows, page, size)}
        rowKey={(t) => t.uuid}
        columns={columns}
        loading={loading}
        onRowClick={openView}
        rowActions={(t) => [
          { label: "View members", icon: Eye, onSelect: () => openView(t) },
          { label: "Edit", icon: Pencil, onSelect: () => openForm(t) },
          "separator",
          t.active ? { label: "Switch off", icon: PowerOff, danger: true, onSelect: () => toggle(t) } : { label: "Switch on", icon: Power, onSelect: () => toggle(t) },
        ]}
        pagination={{ page, size, total: rows.length, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={UsersRound}
        emptyTitle={filtered ? "No teams match" : "No teams yet"}
        emptyHint={filtered ? "Try another search or clear the filters." : "Create a team for a project, a pod or any group that works together."}
        emptyAction={!filtered && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New team</Button>}
      />

      <TeamDetailModal team={viewing} open={viewOpen} onClose={() => setViewOpen(false)}
        onEdit={(t) => { setViewOpen(false); openForm(t); }} onToggle={toggle} />
      <TeamFormModal key={formKey} target={formFor} open={formOpen}
        onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refresh(); }} />
    </div>
  );
}

/* ── Form ──────────────────────────────────────────────────────────────── */

function TeamFormModal({ target, open, onClose, onSaved }: { target: Team | "new"; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const editing = target !== "new" ? target : null;
  const departments = useOptions<Dept>("/departments/", (d) => ({ value: d.id, label: d.department_name }), (d) => d.active !== false || d.id === editing?.department_id);
  const members = useTeamMembers(editing);
  const initial = {
    name: editing?.name ?? "", code: editing?.code ?? "", description: editing?.description ?? "",
    lead: editing?.lead_employee_id ?? null, department: editing?.department_id ?? null,
    color: editing?.color ?? SWATCHES[0], members: editing?.member_ids ?? [],
  };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  // Labels for members already in the team (from the team's member list, else the preview).
  const known: SelectOption<number>[] = useMemo(() => {
    const src = members ?? (editing?.preview ?? []).map((p) => ({ ...p, designation: null }));
    return src.map((m) => ({ value: m.id, label: m.name, description: m.designation || undefined }));
  }, [members, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError("Give the team a name"); return; }
    setSaving(true);
    try {
      const ids = v.lead && !v.members.includes(v.lead) ? [v.lead, ...v.members] : v.members;
      const payload = {
        name: v.name.trim(), code: orNull(v.code), description: orNull(v.description), lead_employee_id: v.lead,
        department_id: v.department, color: v.color, member_ids: ids,
      };
      if (editing) { await api.put(`/organization/teams/${editing.uuid}`, payload); toast.success("Team updated"); }
      else { await api.post("/organization/teams", payload); toast.success("Team created"); }
      onSaved();
    } catch (err: unknown) {
      toast.error("Couldn't save the team", { description: errorText(err) });
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving}
      title={editing ? `Edit ${editing.name}` : "New team"}
      description={editing ? undefined : "A group of people who work together, with one lead."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="team-form" loading={saving}>{editing ? "Save changes" : "Create team"}</Button></>}>
      <form id="team-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Name" required error={error}>
            <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} placeholder="e.g. Payroll Revamp" maxLength={150} />
          </Field>
          <Field label="Short code" aside="Optional">
            <TextInput value={v.code} onValueChange={(x) => setV({ ...v, code: x.toUpperCase() })} maxLength={20} placeholder="e.g. PRV" className="font-mono" />
          </Field>
          <Field label="Team lead" aside="Optional">
            <Select value={v.lead} onChange={(x) => setV({ ...v, lead: x })} loadOptions={searchEmployees} clearable placeholder="Search people"
              selectedOption={editing?.lead_employee_id ? { value: editing.lead_employee_id, label: editing.lead?.name || "Current lead" } : null} />
          </Field>
          <Field label="Department" aside="Optional" hint="Leave empty for a cross-team group">
            <Select value={v.department} onChange={(x) => setV({ ...v, department: x })} options={departments} clearable placeholder="Any department" />
          </Field>
          <Field label="Colour" className="sm:col-span-2">
            <ColorSwatches value={v.color} onChange={(c) => setV({ ...v, color: c })} />
          </Field>
          <Field label="Members" className="sm:col-span-2" hint={v.lead && !v.members.includes(v.lead) ? "The lead is added as a member too." : undefined}>
            <MultiSelect value={v.members} onChange={(ids) => setV({ ...v, members: ids })} loadOptions={searchEmployees}
              selectedOptions={known} placeholder={editing && !members ? "Loading members…" : "Search people to add"} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={3} placeholder="What this team works on" />
          </Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Details ───────────────────────────────────────────────────────────── */

function TeamDetailModal({ team: t, open, onClose, onEdit, onToggle }: {
  team: Team | null; open: boolean; onClose: () => void; onEdit: (t: Team) => void; onToggle: (t: Team) => void;
}) {
  const list = useTeamMembers(t);
  const sorted = useMemo(() => (list ? [...list].sort((a, b) => Number(b.is_lead) - Number(a.is_lead) || a.name.localeCompare(b.name)) : null), [list]);

  return (
    <Modal open={open && !!t} onClose={onClose} size="lg"
      title={t?.name}
      description={t?.description || undefined}
      leading={t && (
        <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `${t.color || "#4f46e5"}1a`, color: t.color || "#4f46e5" }}>
          <UsersRound size={20} strokeWidth={1.4} />
        </span>
      )}
      headerActions={t && <Button size="sm" icon={Pencil} onClick={() => onEdit(t)}>Edit</Button>}
      footer={t && (t.active ? <Button icon={PowerOff} onClick={() => onToggle(t)}>Switch off</Button> : <Button icon={Power} onClick={() => onToggle(t)}>Switch on</Button>)}>
      {t && (
        <>
          <Section title="Overview">
            <KeyValue columns={3} items={[
              { label: "Lead", value: t.lead && <PersonInline person={t.lead} /> },
              { label: "Department", value: t.department_name || "Cross-team" },
              { label: "Status", value: <StatusBadge active={t.active} /> },
              { label: "Code", value: t.code && <span className="font-mono text-[13px]">{t.code}</span> },
              { label: "Members", value: <span className="tabular">{t.member_count}</span> },
            ]} />
          </Section>
          <Section title="Members" description={sorted ? `${sorted.length} ${sorted.length === 1 ? "person" : "people"}` : undefined} className="border-t border-line">
            {!sorted ? (
              <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><Skeleton className="h-8 w-8 rounded-full" /><Skeleton className="h-3 w-40" /></div>)}</div>
            ) : sorted.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-5 text-[13.5px] text-muted"><Users size={16} strokeWidth={1.4} className="text-faint" /> No one is in this team yet. Edit the team to add people.</p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {sorted.map((m) => (
                  <li key={m.id}>
                    <Link href={`/dashboard/staff?view=${m.uuid}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-sunken/70">
                      <Avatar name={m.name} src={m.photo} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-ink">{m.name}</span>
                        {(m.designation || m.department) && <span className="block truncate text-[12.5px] text-muted">{[m.designation, m.department].filter(Boolean).join(" · ")}</span>}
                      </span>
                      {m.is_lead && <Badge tone="accent"><Crown size={12} strokeWidth={1.4} />Lead</Badge>}
                      {!m.active && <Badge>Left</Badge>}
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
