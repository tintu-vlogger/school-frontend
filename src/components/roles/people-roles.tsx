"use client";

/*
 * People tab: who has which roles. Change one person's roles in a modal, or add/remove
 * a role for many people at once from the bulk bar.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, MinusCircle, PlusCircle, UserCog, Users } from "lucide-react";
import { api, resolveImageUrl } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Avatar, Badge, Button, Checkbox, DataTable, Field, FilterBar, Modal, ModalCancel, Select,
  type Column, type FilterValues,
} from "@/components/ui-kit";
import { errorText, plural, type BulkResult, type PeoplePage, type Person, type Role } from "./types";

const STROKE = 1.4;

export function PeopleRoles({ roles, onRolesChanged }: { roles: Role[]; onRolesChanged: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [data, setData] = useState<PeoplePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<(string | number)[]>([]);
  const [editing, setEditing] = useState<Person | null>(null);
  const [bulk, setBulk] = useState<{ action: "add" | "remove"; ids: number[] } | null>(null);

  const roleId = filters.role?.[0] ?? "";

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), size: String(size) });
    if (q) p.set("q", q);
    if (roleId) p.set("role_id", roleId);
    try {
      setData(await api.get<PeoplePage>(`/roles/assignments/people?${p}`));
    } catch (e) {
      toast.error(errorText(e, "Couldn't load people"));
      setData({ items: [], total: 0, page: 1, size });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, size, q, roleId]);

  useEffect(() => { load(); }, [load]);

  const refresh = () => { load(); onRolesChanged(); };

  const columns: Column<Person>[] = useMemo(() => [
    {
      key: "name", header: "Person",
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={p.name} src={p.profile_image_url ? resolveImageUrl(p.profile_image_url) : null} size={32} />
          <div className="min-w-0">
            <p className="flex items-center gap-2 truncate text-[14px] text-ink">
              <span className="truncate">{p.name}</span>
              {p.is_owner && <Badge tone="warn" className="!h-[20px] !text-[11.5px]"><Crown size={11} strokeWidth={STROKE} /> Owner</Badge>}
            </p>
            <p className="truncate text-[12.5px] text-faint">{[p.employee_code, p.email].filter(Boolean).join(" · ")}</p>
            <div className="mt-1.5 sm:hidden"><RoleBadges person={p} /></div>
          </div>
        </div>
      ),
    },
    {
      key: "job", header: "Job", hideBelow: "md",
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate text-[13.5px] font-light text-ink">{p.designation || "—"}</p>
          <p className="truncate text-[12.5px] text-faint">{p.department || ""}</p>
        </div>
      ),
    },
    {
      key: "roles", header: "Roles", hideBelow: "sm",
      cell: (p) => <RoleBadges person={p} />,
    },
  ], []);

  const roleOptions = roles.map((r) => ({ value: String(r.id), label: r.display_name }));

  return (
    <>
      <FilterBar
        searchPlaceholder="Search by name, email or code"
        onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={[{ key: "role", label: "Role", options: roleOptions }]}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
      />
      <DataTable
        rows={data?.items ?? []}
        rowKey={(p) => p.id}
        columns={columns}
        loading={loading}
        onRowClick={(p) => setEditing(p)}
        rowActions={(p) => [{ label: "Change roles", icon: UserCog, onSelect: () => setEditing(p) }]}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        bulkActions={[
          { label: "Add role", icon: PlusCircle, onSelect: (rows) => setBulk({ action: "add", ids: rows.map((r) => r.id) }) },
          { label: "Remove role", icon: MinusCircle, onSelect: (rows) => setBulk({ action: "remove", ids: rows.map((r) => r.id) }) },
        ]}
        pagination={{ page, size, total: data?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={Users}
        emptyTitle={q || roleId ? "No one matches" : "No people yet"}
        emptyHint={q || roleId ? "Try another search or role." : undefined}
      />

      <ChangeRolesModal person={editing} roles={roles} onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); }} />
      <BulkRoleModal state={bulk} roles={roles} onClose={() => setBulk(null)}
        onDone={(r) => {
          setBulk(null);
          setSelected([]);
          const skipped = r.skipped.length;
          const msg = `${plural(r.changed, "person", "people")} updated`;
          if (skipped) {
            const reasons = Array.from(new Set(r.skipped.map((s) => s.reason))).slice(0, 2).join("; ");
            toast.warning(`${msg}, ${skipped} skipped`, { description: reasons });
          } else toast.success(msg);
          refresh();
        }} />
    </>
  );
}

function RoleBadges({ person }: { person: Person }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {person.roles.length === 0 && <span className="text-[13px] text-faint">No role</span>}
      {person.roles.map((r) => (
        <Badge key={r.id} tone={r.role_name === "admin" ? "accent" : r.is_system ? "neutral" : "info"}>{r.display_name}</Badge>
      ))}
    </div>
  );
}

function ChangeRolesModal({
  person, roles, onClose, onSaved,
}: { person: Person | null; roles: Role[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [ids, setIds] = useState<number[]>([]);
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!person) return;
    const start = person.roles.map((r) => r.id).sort((a, b) => a - b);
    setIds(start);
    setInitial(JSON.stringify(start));
  }, [person]);

  const adminId = roles.find((r) => r.locked)?.id;
  const sortedIds = [...ids].sort((a, b) => a - b);
  const dirty = !!person && JSON.stringify(sortedIds) !== initial;

  async function save() {
    if (!person || ids.length === 0) return;
    setSaving(true);
    try {
      await api.put(`/roles/assignments/${person.id}`, { role_ids: sortedIds });
      toast.success(`Roles updated for ${person.name}`);
      onSaved();
    } catch (e) {
      toast.error(errorText(e, "Couldn't change roles"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!person} onClose={onClose} size="md" dirty={dirty} busy={saving}
      title={person ? `Roles for ${person.name}` : "Roles"}
      description="Tick every role this person should have. They get everything the roles allow together."
      leading={person ? <Avatar name={person.name} src={person.profile_image_url ? resolveImageUrl(person.profile_image_url) : null} size={36} /> : null}
      footerStart={ids.length === 0 ? <span className="text-[13px] text-rose-600">Pick at least one role</span> : <span className="text-[13px] text-muted">{plural(ids.length, "role")}</span>}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving} disabled={ids.length === 0 || !dirty}>Save</Button></>}>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {roles.map((r) => {
          const lockedForOwner = !!person?.is_owner && r.id === adminId;
          const on = ids.includes(r.id);
          return (
            <li key={r.id} className={`px-4 py-3 transition-colors ${on ? "bg-primary-soft/30" : ""}`}>
              <Checkbox checked={on} disabled={lockedForOwner}
                onChange={(v) => setIds((cur) => (v ? [...cur, r.id] : cur.filter((x) => x !== r.id)))}
                label={<span className="flex items-center gap-2">{r.display_name}{r.is_system ? <Badge tone="accent">System</Badge> : <Badge>Custom</Badge>}</span>}
                description={lockedForOwner ? "The owner always keeps HR admin." : r.description || `${r.permission_count} of ${r.total_permissions} permissions`} />
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function BulkRoleModal({
  state, roles, onClose, onDone,
}: { state: { action: "add" | "remove"; ids: number[] } | null; roles: Role[]; onClose: () => void; onDone: (r: BulkResult) => void }) {
  const toast = useToast();
  const [roleId, setRoleId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (state) setRoleId(null); }, [state]);

  const add = state?.action === "add";
  async function run() {
    if (!state || roleId === null) return;
    setSaving(true);
    try {
      const r = await api.post<BulkResult>("/roles/assignments/bulk", { employee_ids: state.ids, role_id: roleId, action: state.action });
      onDone(r);
    } catch (e) {
      toast.error(errorText(e, "Couldn't update roles"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={!!state} onClose={onClose} size="sm" busy={saving}
      title={add ? "Add a role" : "Remove a role"}
      description={state ? `For ${plural(state.ids.length, "selected person", "selected people")}.` : undefined}
      footer={<><ModalCancel /><Button variant={add ? "primary" : "danger"} onClick={run} loading={saving} disabled={roleId === null}>{add ? "Add role" : "Remove role"}</Button></>}>
      <Field label="Role" hint={add ? "People keep their other roles." : "People who would be left with no role are skipped."}>
        <Select<number> value={roleId} onChange={(v) => setRoleId(v)} placeholder="Choose a role"
          options={roles.map((r) => ({ value: r.id, label: r.display_name, description: r.is_system ? "System role" : "Custom role" }))} />
      </Field>
    </Modal>
  );
}
