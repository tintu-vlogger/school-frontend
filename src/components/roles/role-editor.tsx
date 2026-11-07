"use client";

/*
 * Add / edit / view a role in one large modal: name and description, the permission
 * matrix (grouped by module, with search, group select-all and a data scope per
 * scopable permission) and the sensitive-field access levels.
 * The locked HR admin role (and anyone passing readOnly) opens in view mode.
 */
import { useEffect, useMemo, useState } from "react";
import { Lock, Search, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, Checkbox, Field, FormGrid, Modal, ModalCancel, Select, TextInput, Textarea,
} from "@/components/ui-kit";
import {
  errorText, type Catalog, type FieldLevel, type Permission, type PermissionGroup, type Role,
} from "./types";

type Draft = {
  display_name: string;
  description: string;
  permissions: string[];
  scopes: Record<string, string>;
  field_access: Record<string, FieldLevel>;
};

const STROKE = 1.4;
/* Heights of the sticky bars inside the modal body (search row + column labels). */
const TOOLBAR_H = 52;
const COLHEAD_H = 32;

function draftFrom(role: Role | null, catalog: Catalog): Draft {
  const field_access: Record<string, FieldLevel> = {};
  for (const f of catalog.fields) field_access[f.key] = role?.field_access?.[f.key] ?? "hidden";
  return {
    display_name: role?.display_name ?? "",
    description: role?.description ?? "",
    permissions: role ? [...role.permissions] : [],
    scopes: role ? { ...role.scopes } : {},
    field_access,
  };
}

/** Only ticked, scopable permissions keep a scope, and "everyone" is the default (no entry). */
function cleanScopes(d: Draft, scopable: Set<string>) {
  const out: Record<string, string> = {};
  const on = new Set(d.permissions);
  for (const [k, v] of Object.entries(d.scopes)) if (on.has(k) && scopable.has(k) && v && v !== "everyone") out[k] = v;
  return out;
}

export function RoleEditor({
  open, role, catalog, readOnly, onClose, onSaved,
}: {
  open: boolean;
  /** null = new role */
  role: Role | null;
  catalog: Catalog;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: (role: Role) => void;
}) {
  const toast = useToast();
  const viewOnly = !!readOnly || !!role?.locked;
  const [draft, setDraft] = useState<Draft>(() => draftFrom(role, catalog));
  const [initial, setInitial] = useState<string>("");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    const d = draftFrom(role, catalog);
    setDraft(d);
    setInitial(JSON.stringify(d));
    setQuery("");
    setNameError(undefined);
  }, [open, role, catalog]);

  const scopable = useMemo(
    () => new Set(catalog.groups.flatMap((g) => g.permissions.filter((p) => p.scopable).map((p) => p.key))),
    [catalog],
  );
  const selected = useMemo(() => new Set(draft.permissions), [draft.permissions]);
  const dirty = !viewOnly && open && initial !== "" && JSON.stringify(draft) !== initial;

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    if (!q) return catalog.groups;
    return catalog.groups
      .map((g) => ({ ...g, permissions: g.permissions.filter((p) => p.label.toLowerCase().includes(q) || p.key.toLowerCase().includes(q)) }))
      .filter((g) => g.permissions.length > 0);
  }, [catalog.groups, q]);

  const scopeOptions = useMemo(() => catalog.scopes.map((s) => ({ value: s.key, label: s.label })), [catalog.scopes]);

  function setPerms(keys: string[], on: boolean) {
    setDraft((d) => {
      const s = new Set(d.permissions);
      for (const k of keys) { if (on) s.add(k); else s.delete(k); }
      return { ...d, permissions: Array.from(s) };
    });
  }

  function setScope(key: string, scope: string) {
    setDraft((d) => {
      const scopes = { ...d.scopes };
      if (scope === "everyone") delete scopes[key]; else scopes[key] = scope;
      return { ...d, scopes };
    });
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (viewOnly) return;
    const name = draft.display_name.trim();
    if (!name) { setNameError("Give the role a name"); return; }
    setSaving(true);
    const body = {
      display_name: name,
      description: draft.description.trim(),
      permissions: draft.permissions,
      scopes: cleanScopes(draft, scopable),
      field_access: draft.field_access,
    };
    try {
      const saved = role
        ? await api.put<Role>(`/roles/${role.id}`, body)
        : await api.post<Role>("/roles/", body);
      toast.success(role ? "Role saved" : `${saved.display_name} created`);
      setInitial(JSON.stringify(draft));
      onSaved(saved);
    } catch (err) {
      toast.error(errorText(err, "Couldn't save the role"));
    } finally {
      setSaving(false);
    }
  }

  const title = !role ? "New role" : viewOnly ? role.display_name : `Edit ${role.display_name}`;
  const description = role?.locked
    ? "HR admin always has every permission. It can't be changed."
    : viewOnly ? "View only." : "Choose what people with this role can see and do.";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={title}
      description={description}
      leading={
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary">
          {role?.locked ? <Lock size={16} strokeWidth={STROKE} /> : <ShieldCheck size={17} strokeWidth={STROKE} />}
        </span>
      }
      dirty={dirty}
      busy={saving}
      footerStart={
        <span className="text-[13px] text-muted tabular">
          <span className="text-ink">{draft.permissions.length}</span> of {catalog.total} permissions
        </span>
      }
      footer={viewOnly ? (
        <Button variant="secondary" onClick={onClose}>Close</Button>
      ) : (
        <>
          <ModalCancel />
          <Button variant="primary" type="submit" form="role-form" loading={saving}>{role ? "Save" : "Create role"}</Button>
        </>
      )}
    >
      <form id="role-form" onSubmit={save} noValidate>
        <FormGrid>
          <Field label="Name" required error={nameError}>
            <TextInput value={draft.display_name} disabled={viewOnly} placeholder="e.g. Payroll officer" maxLength={80}
              autoFocusInModal={!viewOnly && !role}
              onValueChange={(v) => { setDraft((d) => ({ ...d, display_name: v })); if (v.trim()) setNameError(undefined); }} />
          </Field>
          <Field label="Description">
            <Textarea rows={1} autoGrow maxRows={4} value={draft.description} disabled={viewOnly} placeholder="What this role is for"
              onValueChange={(v) => setDraft((d) => ({ ...d, description: v }))} />
          </Field>
        </FormGrid>

        <div className="mt-6">
          {/* Sticky toolbar + column labels: stay at the top of the modal body while the matrix scrolls. */}
          <div className="sticky z-[4] -mx-6 bg-surface px-6" style={{ top: -20 }}>
            <div className="flex items-center gap-3" style={{ height: TOOLBAR_H }}>
              <p className="hidden shrink-0 text-[15px] text-ink sm:block">Permissions</p>
              <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 transition-colors focus-within:border-primary/60 focus-within:ring-[3px] focus-within:ring-primary/10 hover:border-line-strong sm:ml-auto sm:max-w-72">
                <Search size={15} strokeWidth={STROKE} className="shrink-0 text-faint" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search permissions" aria-label="Search permissions"
                  onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); if (e.key === "Escape" && query) { e.stopPropagation(); setQuery(""); } }}
                  className="kit-bare min-w-0 flex-1 bg-transparent text-[14px] font-light text-ink placeholder:text-faint focus:outline-none [&::-webkit-search-cancel-button]:hidden" />
                {query && (
                  <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="shrink-0 rounded p-0.5 text-faint hover:text-ink">
                    <X size={14} strokeWidth={STROKE} />
                  </button>
                )}
              </div>
              <Badge tone="accent" className="shrink-0 tabular">{draft.permissions.length} / {catalog.total}</Badge>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-t-xl border border-b-0 border-line bg-sunken/60 px-4 text-[11.5px] uppercase tracking-[0.06em] text-faint sm:grid-cols-[minmax(0,1fr)_236px]"
              style={{ height: COLHEAD_H }}>
              <span>Permission</span>
              <span className="hidden sm:block">Who it covers</span>
            </div>
          </div>

          <div className="overflow-clip rounded-b-xl border border-line">
            {groups.length === 0 && (
              <p className="px-4 py-10 text-center text-[13.5px] text-muted">No permissions match &ldquo;{query}&rdquo;.</p>
            )}
            {groups.map((g) => (
              <GroupSection key={g.key} group={g} selected={selected} scopes={draft.scopes} scopeOptions={scopeOptions}
                disabled={viewOnly} onToggle={setPerms} onScope={setScope} stickyTop={TOOLBAR_H + COLHEAD_H - 20} />
            ))}
          </div>
        </div>

        <SensitiveFields catalog={catalog} value={draft.field_access} disabled={viewOnly}
          onChange={(k, v) => setDraft((d) => ({ ...d, field_access: { ...d.field_access, [k]: v } }))} />
      </form>
    </Modal>
  );
}

function GroupSection({
  group, selected, scopes, scopeOptions, disabled, onToggle, onScope, stickyTop,
}: {
  group: PermissionGroup;
  selected: Set<string>;
  scopes: Record<string, string>;
  scopeOptions: { value: string; label: string }[];
  disabled: boolean;
  onToggle: (keys: string[], on: boolean) => void;
  onScope: (key: string, scope: string) => void;
  stickyTop: number;
}) {
  const keys = group.permissions.map((p) => p.key);
  const count = keys.filter((k) => selected.has(k)).length;
  const all = count === keys.length && count > 0;
  const some = count > 0 && !all;
  return (
    <section className="border-b border-line last:border-b-0">
      <div className="sticky z-[3] flex items-center gap-3 border-b border-line bg-sunken px-4 py-2.5"
        style={{ top: stickyTop }}>
        <Checkbox aria-label={`Select all in ${group.label}`} checked={all} indeterminate={some} disabled={disabled}
          onChange={() => onToggle(keys, !all)} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] text-ink">{group.label}</p>
          <p className="truncate text-[12.5px] text-muted">{group.hint}</p>
        </div>
        <span className="shrink-0 text-[12.5px] text-faint tabular">{count} of {keys.length}</span>
      </div>
      <ul>
        {group.permissions.map((p) => (
          <PermissionRow key={p.key} perm={p} on={selected.has(p.key)} scope={scopes[p.key] ?? "everyone"} scopeOptions={scopeOptions}
            disabled={disabled} onToggle={(v) => onToggle([p.key], v)} onScope={(s) => onScope(p.key, s)} />
        ))}
      </ul>
    </section>
  );
}

function PermissionRow({
  perm, on, scope, scopeOptions, disabled, onToggle, onScope,
}: {
  perm: Permission;
  on: boolean;
  scope: string;
  scopeOptions: { value: string; label: string }[];
  disabled: boolean;
  onToggle: (on: boolean) => void;
  onScope: (scope: string) => void;
}) {
  return (
    <li className="grid grid-cols-1 items-center gap-x-4 gap-y-2 border-b border-line/70 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-sunken/40 sm:grid-cols-[minmax(0,1fr)_236px]">
      <Checkbox checked={on} disabled={disabled} onChange={onToggle}
        label={<span className="font-light">{perm.label}</span>}
        description={<span className="font-mono text-[11.5px] text-faint">{perm.key}</span>} />
      <div className="pl-[30px] sm:pl-0">
        {perm.scopable ? (
          <Select<string> value={on ? scope : null} options={scopeOptions} disabled={disabled || !on}
            placeholder="Everyone" aria-label={`Who “${perm.label}” covers`}
            onChange={(v) => onScope(v ?? "everyone")} className="!h-8 text-[13px]" />
        ) : (
          <span className="hidden text-[12.5px] text-faint sm:inline">Company-wide</span>
        )}
      </div>
    </li>
  );
}

const LEVEL_TONE: Record<FieldLevel, string> = {
  hidden: "text-ink",
  masked: "text-amber-700",
  full: "text-primary",
};

function SensitiveFields({
  catalog, value, disabled, onChange,
}: {
  catalog: Catalog;
  value: Record<string, FieldLevel>;
  disabled: boolean;
  onChange: (key: string, level: FieldLevel) => void;
}) {
  return (
    <div className="mt-6 rounded-xl border border-line">
      <div className="border-b border-line px-4 py-3">
        <p className="text-[15px] text-ink">Sensitive fields</p>
        <p className="text-[13px] text-muted">Hidden, shown partly (masked, e.g. XXXX1234) or shown in full.</p>
      </div>
      <ul>
        {catalog.fields.map((f) => (
          <li key={f.key} className="flex flex-col gap-2 border-b border-line/70 px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[14px] font-light text-ink">{f.label}</p>
              <p className="text-[12.5px] text-faint">{f.hint}</p>
            </div>
            <Segmented label={f.label} options={catalog.field_levels as { key: FieldLevel; label: string }[]}
              value={value[f.key] ?? "hidden"} disabled={disabled} onChange={(v) => onChange(f.key, v)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Segmented({
  label, options, value, disabled, onChange,
}: {
  label: string;
  options: { key: FieldLevel; label: string }[];
  value: FieldLevel;
  disabled: boolean;
  onChange: (v: FieldLevel) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 self-start rounded-lg border border-line bg-sunken/60 p-0.5 sm:self-auto">
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button key={o.key} type="button" role="radio" aria-checked={active} disabled={disabled && !active}
            onClick={() => !disabled && onChange(o.key)}
            className={[
              "h-7 min-w-[68px] rounded-md px-3 text-[13px] transition-colors",
              active ? `border border-line bg-surface ${LEVEL_TONE[o.key]}` : "border border-transparent text-muted hover:text-ink",
              disabled ? "cursor-default" : "",
              disabled && !active ? "opacity-50" : "",
            ].join(" ")}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
