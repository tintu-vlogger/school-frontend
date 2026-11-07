"use client";

/*
 * Employee directory: head-count cards, FilterBar (stage, department, location, entity,
 * type, tag incl. sub-tags, team, grade), saved views, column chooser, list or card view,
 * bulk actions (tags, manager, export) and server pagination. The profile opens in a large
 * modal; adding uses the step-by-step wizard. Modal state lives in the address:
 *   ?new=1         add employee
 *   ?view=<uuid>   profile (?edit=<uuid> from old links opens the same)
 *   ?tag=<id>      start filtered by a tag
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bookmark, Check, Columns3, Download, FileSpreadsheet, LayoutGrid, List, Mail, MapPin, Plus, Tags, Trash2, UserPlus, Users, UsersRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { useAuth } from "@/lib/auth";
import {
  Avatar, Badge, Button, DataTable, Field, FilterBar, IconButton, Menu, Modal, ModalCancel, MultiSelect, Select, Skeleton, StatCard, Tabs,
  TextInput, Toggle, type Column, type FilterValues, type MenuItem,
} from "@/components/ui-kit";
import { EmployeeWizard } from "@/components/people/employee-forms";
import { lookupEmployees, tagOptions, useOrgOptions, useTags } from "@/components/people/hooks";
import { ProfileModal } from "@/components/people/profile-modal";
import { TagChip } from "@/components/people/skills-tags";
import { STATUS, day, downloadWithAuth, type ListEmployee } from "@/components/people/types";

type View = { uuid: string; name: string; filters: FilterValues & { q?: string[] }; columns: string[]; shared: boolean; mine: boolean };
type Stats = { by_status: Record<string, number>; active: number; joiners_this_month: number; pending_documents: number };

const ALL_COLUMNS = [
  { key: "code", label: "Employee ID" }, { key: "designation", label: "Designation" }, { key: "department", label: "Department" },
  { key: "location", label: "Location" }, { key: "entity", label: "Legal entity" }, { key: "grade", label: "Grade" }, { key: "type", label: "Type" },
  { key: "manager", label: "Manager" }, { key: "joined", label: "Joined" }, { key: "tags", label: "Tags" }, { key: "phone", label: "Mobile" },
  { key: "status", label: "Stage" },
];
const DEFAULT_COLUMNS = ["designation", "department", "location", "tags", "status"];
const COLS_KEY = "hrms_people_columns_v2";
const FILTER_PARAMS: Record<string, string> = {
  status: "status", department: "department_id", location: "location_id", entity: "legal_entity_id", type: "employment_type_id",
  tag: "tag_id", team: "team_id", grade: "grade_id",
};

function readColumns() {
  try { const v = JSON.parse(localStorage.getItem(COLS_KEY) || "null"); return Array.isArray(v) ? v as string[] : DEFAULT_COLUMNS; } catch { return DEFAULT_COLUMNS; }
}

export default function EmployeeDirectory() {
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const o = useOrgOptions();
  const { tags } = useTags();
  const [types, setTypes] = useState<{ value: string; label: string }[]>([]);

  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>((): FilterValues => { const t = params.get("tag"); return t ? { tag: [t] } : {}; });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [nonce, setNonce] = useState(0);
  const [layout, setLayout] = useState<"list" | "cards">("list");
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS);
  // The chosen columns live in this browser only; read them after the first render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setColumns(readColumns()); }, []);
  const [views, setViews] = useState<View[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [saveView, setSaveView] = useState(false);
  const [bulk, setBulk] = useState<{ kind: "tags" | "manager"; rows: ListEmployee[]; clear: () => void } | null>(null);
  const [searchKey, setSearchKey] = useState(0);

  useEffect(() => {
    api.getCached<{ items: { value: number; label: string }[] }>("/masters/options/employment_type?limit=50", 120)
      .then((r) => setTypes((r?.items ?? []).map((x) => ({ value: String(x.value), label: x.label })))).catch(() => {});
  }, []);
  useEffect(() => {
    api.get<View[]>("/employees/saved-views").then((r) => setViews(Array.isArray(r) ? r : [])).catch(() => {});
  }, [nonce]);
  useEffect(() => { api.get<Stats>("/employees/stats").then(setStats).catch(() => {}); }, [nonce]);

  const viewId = params.get("view") || params.get("edit");
  const adding = params.get("new") === "1";
  const setParams = useCallback((next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) { if (v === null) sp.delete(k); else sp.set(k, v); }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);
  const openView = (uuid: string) => setParams({ view: uuid, edit: null, new: null });

  const query = useMemo(() => {
    const q = new URLSearchParams({ page: String(page), size: String(size) });
    if (search) q.set("q", search);
    for (const [k, p] of Object.entries(FILTER_PARAMS)) if (filters[k]?.length) q.set(p, filters[k].join(","));
    return q;
  }, [page, size, search, filters]);
  const key = `${query}|${nonce}`;
  const [result, setResult] = useState<{ key: string; rows: ListEmployee[]; total: number } | null>(null);
  useEffect(() => {
    let live = true;
    api.get<{ items: ListEmployee[]; total: number }>(`/employees/?${query}`)
      .then((r) => { if (live) setResult({ key, rows: r?.items ?? [], total: r?.total ?? 0 }); })
      .catch((e) => { if (live) { setResult({ key, rows: [], total: 0 }); toast.error("Couldn't load employees", { description: e instanceof Error ? e.message : undefined }); } });
    return () => { live = false; };
  }, [key, query, toast]);
  const loading = result?.key !== key;
  const rows = useMemo(() => result?.rows ?? [], [result]);
  const total = result?.total ?? 0;
  const refresh = () => setNonce((n) => n + 1);
  const applyFilters = (f: FilterValues) => { setFilters(f); setPage(1); };

  function toggleColumn(k: string) {
    const next = columns.includes(k) ? columns.filter((c) => c !== k) : ALL_COLUMNS.map((c) => c.key).filter((c) => c === k || columns.includes(c));
    setColumns(next);
    try { localStorage.setItem(COLS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  }

  function applyView(v: View) {
    const { q, ...f } = v.filters;
    applyFilters(f);
    setSearch(q?.[0] ?? "");
    setSearchKey((k) => k + 1);
    if (v.columns?.length) setColumns(v.columns);
    toast.info(`Showing “${v.name}”`);
  }

  async function exportList(format: "csv" | "xlsx", picked?: ListEmployee[]) {
    const q = new URLSearchParams(query);
    q.delete("page"); q.delete("size");
    q.set("format", format);
    if (picked) q.set("uuids", picked.map((e) => e.uuid).join(","));
    try { await downloadWithAuth(`/employees/export?${q}`, `employees.${format}`); toast.success("Download started"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't export"); }
  }

  const tagFilter = tags.filter((t) => t.active).map((t) => ({ value: String(t.id), label: `${"— ".repeat(t.depth)}${t.name}` }));
  const toFilter = (opts: { value: number; label: string }[]) => opts.map((x) => ({ value: String(x.value), label: x.label }));

  const cell: Record<string, Column<ListEmployee>> = {
    code: { key: "code", header: "ID", cell: (e) => e.employee_code ? <span className="font-mono text-[12.5px] text-muted">{e.employee_code}</span> : <span className="text-faint">—</span> },
    designation: { key: "designation", header: "Designation", hideBelow: "sm", cell: (e) => e.designation_name ?? <span className="text-faint">—</span> },
    department: { key: "department", header: "Department", hideBelow: "md", cell: (e) => <span className="text-muted">{e.department_name ?? "—"}</span> },
    location: { key: "location", header: "Location", hideBelow: "lg", cell: (e) => <span className="text-muted">{e.location_name ?? "—"}</span> },
    entity: { key: "entity", header: "Legal entity", hideBelow: "lg", cell: (e) => <span className="text-muted">{e.legal_entity_name ?? "—"}</span> },
    grade: { key: "grade", header: "Grade", hideBelow: "lg", cell: (e) => <span className="text-muted">{e.grade_name ?? "—"}</span> },
    type: { key: "type", header: "Type", hideBelow: "lg", cell: (e) => <span className="text-muted">{e.employment_type_name ?? "—"}</span> },
    manager: { key: "manager", header: "Manager", hideBelow: "lg", cell: (e) => e.reporting_manager_name ? <span className="flex items-center gap-2"><Avatar name={e.reporting_manager_name} size={22} /><span className="truncate text-muted">{e.reporting_manager_name}</span></span> : <span className="text-faint">—</span> },
    joined: { key: "joined", header: "Joined", hideBelow: "md", cell: (e) => <span className="tabular text-muted">{day(e.date_of_joining) ?? "—"}</span> },
    tags: { key: "tags", header: "Tags", hideBelow: "lg", cell: (e) => e.tags.length ? <span className="flex flex-wrap gap-1">{e.tags.slice(0, 1).map((t) => <TagChip key={t.id} tag={{ ...t, parent_name: null }} />)}{e.tags.length > 1 && <span className="self-center text-[12px] text-faint">+{e.tags.length - 1}</span>}</span> : <span className="text-faint">—</span> },
    phone: { key: "phone", header: "Mobile", hideBelow: "lg", cell: (e) => <span className="tabular text-muted">{e.phone ?? "—"}</span> },
    status: { key: "status", header: "Stage", cell: (e) => <Badge tone={STATUS[e.status]?.tone ?? "neutral"} dot>{STATUS[e.status]?.label ?? e.status}</Badge> },
  };
  const tableColumns: Column<ListEmployee>[] = [
    {
      key: "name", header: "Name",
      cell: (e) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={`${e.first_name} ${e.last_name}`} src={e.profile_image_url} size={34} />
          <div className="min-w-0">
            <p className="truncate text-ink">{e.first_name} {e.last_name}{e.preferred_name && <span className="ml-1.5 text-[12.5px] text-faint">“{e.preferred_name}”</span>}</p>
            <p className="truncate text-[12.5px] text-muted">{e.email}</p>
          </div>
        </div>
      ),
    },
    ...ALL_COLUMNS.filter((c) => columns.includes(c.key)).map((c) => cell[c.key]),
  ];

  const columnItems: MenuItem[] = ALL_COLUMNS.map((c) => ({ label: c.label, icon: columns.includes(c.key) ? Check : undefined, onSelect: () => toggleColumn(c.key) }));
  const viewItems: MenuItem[] = [
    ...views.map((v) => ({ label: v.name, icon: Bookmark, hint: v.shared ? (v.mine ? "Shared" : "From a colleague") : undefined, onSelect: () => applyView(v) })),
    ...(views.length ? ["separator" as const] : []),
    { label: "Save this view…", icon: Plus, onSelect: () => setSaveView(true) },
  ];
  const filtered = !!search || Object.values(filters).some((v) => v?.length);
  const by = stats?.by_status ?? {};
  const statFilter = (status: string) => applyFilters({ ...filters, status: [status] });

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats ? <>
          <StatCard label="People" value={stats.active} icon={Users} hint="Not counting exits" onClick={() => applyFilters({})} />
          <StatCard label="On probation" value={by.probation ?? 0} onClick={() => statFilter("probation")} />
          <StatCard label="Joining soon" value={by.pre_joining ?? 0} onClick={() => statFilter("pre_joining")} />
          <StatCard label="On notice" value={by.notice ?? 0} onClick={() => statFilter("notice")} />
          <StatCard label="Documents to check" value={stats.pending_documents} onClick={() => router.push("/dashboard/employee-documents?status=pending")} />
        </> : [0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)}
      </div>

      <FilterBar
        key={searchKey}
        search={search}
        searchPlaceholder="Search by name, email, ID or phone"
        onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[
          { key: "status", label: "Stage", multiple: true, options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })) },
          { key: "department", label: "Department", multiple: true, options: toFilter(o.departments) },
          { key: "location", label: "Location", multiple: true, options: toFilter(o.locations) },
          { key: "entity", label: "Legal entity", options: toFilter(o.entities) },
          { key: "type", label: "Type", multiple: true, options: types },
          { key: "tag", label: "Tag", multiple: true, options: tagFilter },
          { key: "team", label: "Team", options: toFilter(o.teams) },
          { key: "grade", label: "Grade", multiple: true, options: toFilter(o.grades) },
        ]}
        values={filters}
        onChange={applyFilters}
        actions={
          <div className="flex items-center gap-1.5">
            {result && <span className="mr-1 hidden text-[13px] text-faint tabular sm:inline">{total} {total === 1 ? "person" : "people"}</span>}
            <Menu items={viewItems} trigger={<Button size="sm" variant="ghost" icon={Bookmark}>Views</Button>} />
            {layout === "list" && <Menu items={columnItems} trigger={<IconButton icon={Columns3} label="Columns" size="sm" />} />}
            {isAdmin && <Menu items={[{ label: "Excel (.xlsx)", icon: FileSpreadsheet, onSelect: () => exportList("xlsx") }, { label: "CSV", icon: Download, onSelect: () => exportList("csv") }]}
              trigger={<IconButton icon={Download} label="Download the list" size="sm" />} />}
            <Tabs variant="pill" value={layout} onChange={setLayout} items={[{ value: "list", label: "", icon: List }, { value: "cards", label: "", icon: LayoutGrid }]} />
          </div>
        }
      />

      {layout === "list" ? (
        <DataTable
          rows={rows}
          rowKey={(e) => e.uuid}
          columns={tableColumns}
          loading={loading}
          onRowClick={(e) => openView(e.uuid)}
          rowClassName={(e) => (e.active ? undefined : "[&_td]:opacity-60")}
          rowActions={(e) => [
            { label: "Open profile", icon: Users, onSelect: () => openView(e.uuid) },
            { label: "Email", icon: Mail, onSelect: () => { window.location.href = `mailto:${e.email}`; } },
          ]}
          selectable={isAdmin}
          bulkActions={[
            { label: "Tags", icon: Tags, onSelect: (list, clear) => setBulk({ kind: "tags", rows: list, clear }) },
            { label: "Change manager", icon: UsersRound, onSelect: (list, clear) => setBulk({ kind: "manager", rows: list, clear }) },
            { label: "Excel", icon: FileSpreadsheet, onSelect: (list) => exportList("xlsx", list) },
            { label: "CSV", icon: Download, onSelect: (list) => exportList("csv", list) },
          ]}
          pagination={{ page, size, total, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
          emptyIcon={Users}
          emptyTitle={filtered ? "No one matches these filters" : "No employees yet"}
          emptyHint={filtered ? "Try another search or clear the filters." : "Add people one by one to get started."}
          emptyAction={!filtered && isAdmin && <Button variant="primary" icon={UserPlus} onClick={() => setParams({ new: "1" })}>Add employee</Button>}
        />
      ) : (
        <CardGrid rows={rows} loading={loading} onOpen={openView} page={page} size={size} total={total} onPage={setPage} />
      )}

      <ProfileModal uuid={viewId} onClose={() => setParams({ view: null, edit: null })} onOpenPerson={openView} onChanged={refresh} />
      <EmployeeWizard open={adding} onClose={() => setParams({ new: null })} onSaved={(uuid) => { refresh(); openView(uuid); }} />
      {saveView && <SaveViewModal views={views} filters={{ ...filters, ...(search ? { q: [search] } : {}) }} columns={columns}
        onClose={() => setSaveView(false)} onSaved={() => { setSaveView(false); refresh(); }} onRemoved={refresh} />}
      {bulk && <BulkModal kind={bulk.kind} rows={bulk.rows} tags={tagOptions(tags)} onClose={() => setBulk(null)}
        onDone={() => { bulk.clear(); setBulk(null); refresh(); }} />}
    </>
  );
}

function CardGrid({ rows, loading, onOpen, page, size, total, onPage }: { rows: ListEmployee[]; loading: boolean; onOpen: (uuid: string) => void; page: number; size: number; total: number; onPage: (p: number) => void }) {
  if (loading && !rows.length) return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-[184px] rounded-2xl" />)}</div>;
  if (!rows.length) return <p className="rounded-2xl border border-line bg-surface py-14 text-center text-[14px] text-muted">No one matches these filters.</p>;
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <>
      <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${loading ? "opacity-60" : ""}`}>
        {rows.map((e) => {
          const st = STATUS[e.status];
          return (
            <button key={e.uuid} type="button" onClick={() => onOpen(e.uuid)}
              className="group flex flex-col items-center rounded-2xl border border-line bg-surface px-5 pb-5 pt-6 text-center transition-colors hover:border-line-strong">
              <Avatar name={`${e.first_name} ${e.last_name}`} src={e.profile_image_url} size={64} />
              <p className="mt-3 truncate text-[15px] text-ink">{e.first_name} {e.last_name}</p>
              <p className="truncate text-[13px] text-muted">{e.designation_name ?? "No designation"}</p>
              <p className="mt-0.5 truncate text-[12.5px] text-faint">{e.department_name ?? ""}</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                {st && e.status !== "confirmed" && <Badge tone={st.tone} dot>{st.label}</Badge>}
                {e.location_name && <span className="inline-flex items-center gap-1 text-[12px] text-muted"><MapPin size={12} strokeWidth={1.4} />{e.location_name}</span>}
              </div>
              {e.tags.length > 0 && <div className="mt-2.5 flex flex-wrap justify-center gap-1">{e.tags.slice(0, 2).map((t) => <TagChip key={t.id} tag={{ ...t, parent_name: null }} />)}</div>}
            </button>
          );
        })}
      </div>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-end gap-2 text-[13px] text-muted">
          <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
          <span className="tabular">Page {page} of {pages}</span>
          <Button size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
        </div>
      )}
    </>
  );
}

function SaveViewModal({ views, filters, columns, onClose, onSaved, onRemoved }: {
  views: View[]; filters: FilterValues; columns: string[]; onClose: () => void; onSaved: () => void; onRemoved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!name.trim()) { setError("Give the view a name"); return; }
    setSaving(true);
    try { await api.post("/employees/saved-views", { name: name.trim(), filters, columns, shared }); toast.success("View saved"); onSaved(); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't save"); } finally { setSaving(false); }
  }
  async function remove(v: View) {
    try { await api.delete(`/employees/saved-views/${v.uuid}`); toast.success("View removed"); onRemoved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove"); }
  }
  const mine = views.filter((v) => v.mine);
  return (
    <Modal open onClose={onClose} size="md" busy={saving} title="Save this view" description="Keeps the current search, filters and columns."
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Save view</Button></>}>
      <div className="space-y-5">
        <Field label="Name" required error={error}><TextInput autoFocusInModal value={name} onValueChange={(x) => { setName(x); setError(""); }} placeholder="e.g. Bengaluru engineers" /></Field>
        <Toggle checked={shared} onChange={setShared} label="Share with everyone who can see employees" />
        {mine.length > 0 && (
          <div>
            <p className="mb-2 text-[12px] uppercase tracking-[0.06em] text-faint">Your views</p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {mine.map((v) => <li key={v.uuid} className="flex items-center justify-between px-4 py-2 text-[14px] text-ink">{v.name}<IconButton icon={Trash2} label="Remove view" size="sm" onClick={() => remove(v)} /></li>)}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function BulkModal({ kind, rows, tags, onClose, onDone }: {
  kind: "tags" | "manager"; rows: ListEmployee[]; tags: { value: number; label: string; description?: string }[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [add, setAdd] = useState<number[]>([]);
  const [remove, setRemove] = useState<number[]>([]);
  const [manager, setManager] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      if (kind === "tags") {
        const r = await api.post<{ changed: number }>("/organization/tags/assign", { entity_type: "employees", entity_uuids: rows.map((e) => e.uuid), add, remove });
        toast.success(`Tags updated for ${rows.length} ${rows.length === 1 ? "person" : "people"}`, { description: `${r.changed} changes` });
      } else {
        const r = await api.post<{ changed: number }>("/employees/bulk/manager", { employee_uuids: rows.map((e) => e.uuid), manager_id: manager, reason: reason || null });
        toast.success(`${r.changed} ${r.changed === 1 ? "person now reports" : "people now report"} to the new manager`, { description: "Recorded in each person's history." });
      }
      onDone();
    } catch (e) { toast.error("Couldn't update", { description: e instanceof Error ? e.message : undefined }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} title={kind === "tags" ? "Tags" : "Change manager"}
      description={`${rows.length} ${rows.length === 1 ? "person" : "people"} picked`}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving} disabled={kind === "tags" ? !add.length && !remove.length : false}>Apply</Button></>}>
      {kind === "tags" ? (
        <div className="space-y-5">
          <Field label="Add tags"><MultiSelect<number> value={add} onChange={setAdd} options={tags} placeholder="Pick tags" /></Field>
          <Field label="Remove tags"><MultiSelect<number> value={remove} onChange={setRemove} options={tags} placeholder="Pick tags" /></Field>
        </div>
      ) : (
        <div className="space-y-5">
          <Field label="New reporting manager" hint="Leave empty to remove the manager"><Select<number> value={manager} onChange={setManager} loadOptions={lookupEmployees()} placeholder="Search people" clearable /></Field>
          <Field label="Reason" aside="Optional"><TextInput value={reason} onValueChange={setReason} placeholder="e.g. Team restructure" /></Field>
        </div>
      )}
    </Modal>
  );
}
