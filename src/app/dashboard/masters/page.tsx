"use client";

/*
 * Settings > Lists (masters): the company's lists behind dropdowns (blood group, bank,
 * document type ...). Left: the lists; right: the selected list's values with search,
 * server pagination, inline on/off, ordering, and add/edit modals. Nothing is deleted:
 * values and lists are switched off. Built-in lists and values keep their codes.
 * The selected list is kept in the address (?list=<key>).
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, CornerDownRight, ListTree, Lock, Pencil, Plus, Power, Search, Settings2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, FormGrid, IconButton, MasterSelect, Modal, ModalCancel, Skeleton, TextInput,
  Textarea, Toggle, type Column, type FilterValues,
} from "@/components/ui-kit";
import { clsx as cxJoin } from "clsx";

type MasterType = {
  uuid: string; key: string; name: string; description: string | null; hierarchical: boolean;
  is_system: boolean; active: boolean; sort_order: number; value_count: number;
};
type MasterValue = {
  id: number; uuid: string; code: string | null; label: string; parent_id: number | null; parent_label: string | null;
  attributes: Record<string, unknown>; is_system: boolean; active: boolean; sort_order: number; child_count: number;
};
type Page<T> = { items: T[]; total: number; page: number; size: number };

export default function MastersPage() {
  return (
    <Suspense fallback={null}>
      <Masters />
    </Suspense>
  );
}

function Masters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useAuth();
  const canManage = user?.role === "admin";
  const toast = useToast();

  const [typesNonce, setTypesNonce] = useState(0);
  const [types, setTypes] = useState<{ nonce: number; rows: MasterType[] } | null>(null);
  const [typeSearch, setTypeSearch] = useState("");
  const [typeModal, setTypeModal] = useState<{ open: boolean; target: MasterType | null; key: number }>({ open: false, target: null, key: 0 });

  useEffect(() => {
    let live = true;
    api.get<MasterType[]>("/masters/types")
      .then((r) => { if (live) setTypes({ nonce: typesNonce, rows: Array.isArray(r) ? r : [] }); })
      .catch(() => { if (live) { setTypes({ nonce: typesNonce, rows: [] }); toast.error("Couldn't load the lists"); } });
    return () => { live = false; };
  }, [typesNonce, toast]);
  const refreshTypes = useCallback(() => setTypesNonce((n) => n + 1), []);

  const all = useMemo(() => types?.rows ?? [], [types]);
  const selectedKey = params.get("list") || all[0]?.key || null;
  const selected = all.find((t) => t.key === selectedKey) ?? null;
  const select = (key: string) => router.replace(`${pathname}?list=${encodeURIComponent(key)}`, { scroll: false });

  const shownTypes = useMemo(() => {
    const q = typeSearch.trim().toLowerCase();
    return q ? all.filter((t) => t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q)) : all;
  }, [all, typeSearch]);

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Lists"
        description="The choices behind dropdowns across the app, such as blood group, bank or document type. Switch values off instead of deleting them."
        actions={canManage && <Button variant="primary" icon={Plus} onClick={() => setTypeModal((m) => ({ open: true, target: null, key: m.key + 1 }))}>New list</Button>}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* Lists */}
        <aside className="rounded-2xl border border-line bg-surface lg:sticky lg:top-6">
          <div className="border-b border-line p-3">
            <TextInput leading={Search} value={typeSearch} onValueChange={setTypeSearch} placeholder="Find a list" aria-label="Find a list" className="!h-9" />
          </div>
          <nav className="hr-scroll max-h-[calc(100dvh-260px)] overflow-y-auto p-1.5" aria-label="Lists">
            {!types && Array.from({ length: 8 }, (_, i) => <div key={i} className="px-3 py-2.5"><Skeleton className="h-3.5 w-36" /></div>)}
            {types && shownTypes.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-faint">No list matches</p>}
            {shownTypes.map((t) => {
              const on = t.key === selectedKey;
              return (
                <button key={t.key} type="button" onClick={() => select(t.key)} aria-current={on || undefined}
                  className={cxJoin("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[14px] transition-colors",
                    on ? "bg-primary-soft/70 text-ink" : "text-ink/85 hover:bg-sunken")}>
                  <span className={cxJoin("min-w-0 flex-1 truncate", !t.active && "text-faint line-through decoration-faint/60")}>{t.name}</span>
                  {t.hierarchical && <ListTree size={14} strokeWidth={1.4} className="shrink-0 text-faint" aria-label="Has sub-values" />}
                  <span className={cxJoin("shrink-0 text-[12px] tabular", on ? "text-primary" : "text-faint")}>{t.value_count}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Values */}
        <section className="min-w-0">
          {selected ? (
            <ValuesPanel key={selected.key} type={selected} canManage={canManage} onTypeChanged={refreshTypes}
              onSettings={() => setTypeModal((m) => ({ open: true, target: selected, key: m.key + 1 }))} />
          ) : types ? (
            <div className="rounded-2xl border border-line bg-surface px-6 py-16 text-center text-[14px] text-muted">Pick a list on the left.</div>
          ) : <Skeleton className="h-64 w-full rounded-2xl" />}
        </section>
      </div>

      <TypeModal key={typeModal.key} open={typeModal.open} target={typeModal.target}
        onClose={() => setTypeModal((m) => ({ ...m, open: false }))}
        onSaved={(t) => { setTypeModal((m) => ({ ...m, open: false })); refreshTypes(); if (t) select(t.key); }} />
    </div>
  );
}

/* ── Values of one list ────────────────────────────────────────────────── */

function ValuesPanel({ type, canManage, onTypeChanged, onSettings }: { type: MasterType; canManage: boolean; onTypeChanged: () => void; onSettings: () => void }) {
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [nonce, setNonce] = useState(0);
  const [moving, setMoving] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; target: MasterValue | null; parentId: number | null; key: number }>({ open: false, target: null, parentId: null, key: 0 });

  const key = JSON.stringify({ search, filters, page, size, nonce });
  const [result, setResult] = useState<{ key: string; page: Page<MasterValue> } | null>(null);
  useEffect(() => {
    const q = new URLSearchParams({ page: String(page), size: String(size) });
    if (search) q.set("q", search);
    const st = filters.status?.[0];
    if (st) q.set("active", st === "on" ? "true" : "false");
    if (filters.level?.[0] === "top") q.set("top_level", "true");
    let live = true;
    api.get<Page<MasterValue>>(`/masters/types/${encodeURIComponent(type.key)}/values?${q}`)
      .then((r) => { if (live) setResult({ key, page: r }); })
      .catch((e) => { if (live) { setResult({ key, page: { items: [], total: 0, page, size } }); toast.error("Couldn't load the values", { description: e instanceof Error ? e.message : undefined }); } });
    return () => { live = false; };
  }, [key, type.key, search, filters, page, size, toast]);
  const loading = result?.key !== key;
  const rows = result?.page.items ?? [];
  const total = result?.page.total ?? 0;
  const refresh = () => { setNonce((n) => n + 1); onTypeChanged(); };
  const filtered = !!search || Object.values(filters).some((v) => v?.length);
  const canMove = canManage && !filtered && !loading && !moving;

  async function setActive(v: MasterValue, active: boolean) {
    try {
      await api.put(`/masters/values/${v.uuid}`, { active });
      toast.success(active ? `“${v.label}” is on` : `“${v.label}” is switched off`, active ? undefined : { description: "It stays on records that already use it." });
      setNonce((n) => n + 1);
    } catch (e: unknown) { toast.error("Couldn't change it", { description: e instanceof Error ? e.message : undefined }); }
  }

  /** Move a value one place up or down in the whole list, then save the full order. */
  async function move(v: MasterValue, dir: -1 | 1) {
    setMoving(true);
    try {
      const ids: number[] = [];
      for (let p = 1; p < 50; p++) {
        const r = await api.get<Page<MasterValue>>(`/masters/types/${encodeURIComponent(type.key)}/values?page=${p}&size=200`);
        ids.push(...r.items.map((x) => x.id));
        if (ids.length >= r.total || !r.items.length) break;
      }
      const i = ids.indexOf(v.id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await api.post(`/masters/types/${encodeURIComponent(type.key)}/values/reorder`, { ids });
      setNonce((n) => n + 1);
    } catch (e: unknown) {
      toast.error("Couldn't change the order", { description: e instanceof Error ? e.message : undefined });
    } finally { setMoving(false); }
  }

  const openValue = (target: MasterValue | null, parentId: number | null = null) => setModal((m) => ({ open: true, target, parentId, key: m.key + 1 }));

  const columns: Column<MasterValue>[] = [
    ...(canManage ? [{
      key: "order", header: <span className="sr-only">Order</span>, width: "64px",
      cell: (v: MasterValue) => {
        const idx = rows.indexOf(v) + (page - 1) * size;
        return (
          <span className="flex items-center gap-0.5" data-no-row-click>
            <IconButton size="sm" icon={ArrowUp} label="Move up" disabled={!canMove || idx === 0} onClick={() => move(v, -1)} />
            <IconButton size="sm" icon={ArrowDown} label="Move down" disabled={!canMove || idx >= total - 1} onClick={() => move(v, 1)} />
          </span>
        );
      },
    } satisfies Column<MasterValue>] : []),
    {
      key: "label", header: "Value",
      cell: (v) => (
        <div className="flex min-w-0 items-center gap-2">
          {v.parent_id && <CornerDownRight size={14} strokeWidth={1.4} className="shrink-0 text-faint" />}
          <span className={cxJoin("truncate", v.active ? "text-ink" : "text-faint")}>{v.label}</span>
          {v.is_system && <Lock size={12} strokeWidth={1.4} className="shrink-0 text-faint" aria-label="Built-in" />}
          {v.child_count > 0 && <span className="shrink-0 text-[12px] text-faint">· {v.child_count} under it</span>}
        </div>
      ),
    },
    { key: "code", header: "Code", hideBelow: "lg", cell: (v) => v.code ? <span className="block max-w-[150px] truncate font-mono text-[12px] text-muted" title={v.code}>{v.code}</span> : <span className="text-faint">—</span> },
    ...(type.hierarchical ? [
      { key: "parent", header: "Under", hideBelow: "sm", cell: (v: MasterValue) => v.parent_label ? <span className="text-muted">{v.parent_label}</span> : <span className="text-faint">Top level</span> } satisfies Column<MasterValue>,
    ] : []),
    {
      key: "active", header: "On", width: "72px",
      cell: (v) => <Toggle size="sm" checked={v.active} disabled={!canManage} onChange={(x) => setActive(v, x)} aria-label={v.active ? `Switch off ${v.label}` : `Switch on ${v.label}`} />,
    },
  ];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[20px] font-light text-ink">{type.name}</h2>
            {type.is_system && <Badge>Built-in</Badge>}
            {type.hierarchical && <Badge tone="info">Sub-values</Badge>}
            {!type.active && <Badge tone="warn" dot>Off</Badge>}
          </div>
          {type.description && <p className="mt-1 max-w-2xl text-[13.5px] text-muted">{type.description}</p>}
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button icon={Settings2} onClick={onSettings}>List settings</Button>
            <Button variant="primary" icon={Plus} onClick={() => openValue(null)}>Add value</Button>
          </div>
        )}
      </div>

      <FilterBar
        searchPlaceholder={`Search ${type.name.toLowerCase()}`}
        onSearchChange={(q) => { setSearch(q); setPage(1); }}
        filters={[
          { key: "status", label: "Status", options: [{ value: "on", label: "On" }, { value: "off", label: "Switched off" }] },
          ...(type.hierarchical ? [{ key: "level", label: "Level", options: [{ value: "top", label: "Top level only" }] }] : []),
        ]}
        values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        actions={canManage && filtered && <span className="text-[12.5px] text-faint">Clear the search and filters to change the order</span>}
      />
      <DataTable
        rows={rows}
        rowKey={(v) => v.uuid}
        columns={columns}
        loading={loading || moving}
        onRowClick={canManage ? (v) => openValue(v) : undefined}
        rowClassName={(v) => (v.active ? undefined : "bg-sunken/40")}
        rowActions={canManage ? (v) => [
          { label: "Edit", icon: Pencil, onSelect: () => openValue(v) },
          ...(type.hierarchical && !v.parent_id ? [{ label: "Add a sub-value", icon: CornerDownRight, onSelect: () => openValue(null, v.id) }] : []),
          "separator" as const,
          v.active
            ? { label: "Switch off", icon: Power, danger: true, onSelect: () => setActive(v, false) }
            : { label: "Switch on", icon: Power, onSelect: () => setActive(v, true) },
        ] : undefined}
        pagination={{ page, size, total, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={ListTree}
        emptyTitle={filtered ? "No values match" : "This list is empty"}
        emptyHint={filtered ? "Try another search or clear the filters." : "Add the choices people should see in forms."}
        emptyAction={!filtered && canManage && <Button variant="primary" icon={Plus} onClick={() => openValue(null)}>Add value</Button>}
      />

      <ValueModal key={modal.key} open={modal.open} type={type} target={modal.target} parentId={modal.parentId}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        onSaved={() => { setModal((m) => ({ ...m, open: false })); refresh(); }} />
    </>
  );
}

/* ── Value modal ───────────────────────────────────────────────────────── */

function ValueModal({ open, type, target, parentId, onClose, onSaved }: {
  open: boolean; type: MasterType; target: MasterValue | null; parentId: number | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const initial = {
    label: target?.label ?? "",
    code: target?.code ?? "",
    parent: target ? target.parent_id : parentId,
    active: target?.active ?? true,
    attrs: Object.entries(target?.attributes ?? {}).map(([k, v]) => ({ k, v: typeof v === "string" ? v : JSON.stringify(v) })),
  };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.label.trim()) { setError("Enter a name"); return; }
    const attributes = Object.fromEntries(v.attrs.filter((a) => a.k.trim()).map((a) => [a.k.trim(), a.v]));
    setSaving(true);
    try {
      if (target) {
        await api.put(`/masters/values/${target.uuid}`, {
          label: v.label.trim(), ...(target.is_system ? {} : { code: v.code.trim() || null }),
          ...(type.hierarchical ? { parent_id: v.parent } : {}), active: v.active, attributes,
        });
        toast.success("Value saved");
      } else {
        await api.post(`/masters/types/${encodeURIComponent(type.key)}/values`, {
          label: v.label.trim(), code: v.code.trim() || null, parent_id: type.hierarchical ? v.parent : null, attributes,
        });
        toast.success(`“${v.label.trim()}” added`);
      }
      onSaved();
    } catch (err: unknown) {
      toast.error("Couldn't save the value", { description: err instanceof Error ? err.message : undefined });
    } finally { setSaving(false); }
  }

  const setAttr = (i: number, patch: Partial<{ k: string; v: string }>) => setV({ ...v, attrs: v.attrs.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  return (
    <Modal open={open} onClose={onClose} size="md" dirty={dirty} busy={saving}
      title={target ? `Edit “${target.label}”` : parentId ? "Add a sub-value" : `Add to ${type.name}`}
      description={target?.is_system ? "Built-in value: you can rename it or switch it off; its code stays the same." : undefined}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="master-value-form" loading={saving}>{target ? "Save" : "Add value"}</Button></>}>
      <form id="master-value-form" onSubmit={submit} noValidate className="space-y-5">
        <FormGrid>
          <Field label="Name" required error={error} className="sm:col-span-2">
            <TextInput autoFocusInModal value={v.label} onValueChange={(x) => { setV({ ...v, label: x }); setError(""); }} placeholder="As people should see it" />
          </Field>
          <Field label="Code" aside={target?.is_system ? "Fixed" : "Optional"} hint={target?.is_system ? undefined : "Used by imports and integrations. Left blank, one is made from the name."}>
            <TextInput value={v.code} onValueChange={(x) => setV({ ...v, code: x })} disabled={!!target?.is_system} className="font-mono" placeholder="e.g. a_positive" />
          </Field>
          {type.hierarchical && (
            <Field label="Under" hint="Leave empty for a top-level value.">
              <MasterSelect type={type.key} value={v.parent} onChange={(x) => setV({ ...v, parent: x })} allowCreate={false} clearable placeholder="Top level" />
            </Field>
          )}
          {target && (
            <div className="sm:col-span-2">
              <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="On" description="Switched-off values stay on existing records but can't be picked any more." />
            </div>
          )}
        </FormGrid>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] text-muted">Extra details <span className="text-faint">(optional)</span></p>
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => setV({ ...v, attrs: [...v.attrs, { k: "", v: "" }] })}>Add detail</Button>
          </div>
          {v.attrs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line-strong px-4 py-3 text-[13px] text-faint">For example an IFSC prefix for a bank, or a short code for a state.</p>
          ) : (
            <div className="space-y-2">
              {v.attrs.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <TextInput value={a.k} onValueChange={(x) => setAttr(i, { k: x })} placeholder="Name" aria-label="Detail name" className="!w-40 shrink-0" />
                  <TextInput value={a.v} onValueChange={(x) => setAttr(i, { v: x })} placeholder="Value" aria-label="Detail value" className="min-w-0 flex-1" />
                  <IconButton icon={Trash2} label="Remove detail" onClick={() => setV({ ...v, attrs: v.attrs.filter((_, j) => j !== i) })} className="mt-1" />
                </div>
              ))}
            </div>
          )}
        </div>
      </form>
    </Modal>
  );
}

/* ── List (type) modal ─────────────────────────────────────────────────── */

function TypeModal({ open, target, onClose, onSaved }: { open: boolean; target: MasterType | null; onClose: () => void; onSaved: (t: MasterType | null) => void }) {
  const toast = useToast();
  const initial = { name: target?.name ?? "", description: target?.description ?? "", hierarchical: target?.hierarchical ?? false, active: target?.active ?? true };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError("Give the list a name"); return; }
    setSaving(true);
    try {
      if (target) {
        const t = await api.put<MasterType>(`/masters/types/${encodeURIComponent(target.key)}`, {
          name: v.name.trim(), description: v.description.trim() || null, hierarchical: v.hierarchical, ...(target.is_system ? {} : { active: v.active }),
        });
        toast.success("List saved");
        onSaved(t);
      } else {
        const t = await api.post<MasterType>("/masters/types", { name: v.name.trim(), description: v.description.trim() || null, hierarchical: v.hierarchical });
        toast.success(`“${t.name}” created`, { description: "Now add its values." });
        onSaved(t);
      }
    } catch (err: unknown) {
      toast.error("Couldn't save the list", { description: err instanceof Error ? err.message : undefined });
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" dirty={dirty} busy={saving}
      title={target ? "List settings" : "New list"}
      description={target ? undefined : "A list of choices you can use in forms and custom fields."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="master-type-form" loading={saving}>{target ? "Save" : "Create list"}</Button></>}>
      <form id="master-type-form" onSubmit={submit} noValidate className="space-y-5">
        <Field label="Name" required error={error}>
          <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} placeholder="e.g. Shirt size" />
        </Field>
        <Field label="Description" aside="Optional">
          <Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={2} placeholder="What the list is for" />
        </Field>
        <Toggle checked={v.hierarchical} onChange={(x) => setV({ ...v, hierarchical: x })} label="Sub-values"
          description="Values can sit under another value, like districts under a state." />
        {target && (
          <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} disabled={target.is_system} label="On"
            description={target.is_system ? "Built-in lists can't be switched off. Switch off individual values instead." : "A switched-off list is hidden from forms."} />
        )}
        {target && (
          <p className="rounded-xl bg-sunken px-4 py-3 text-[12.5px] text-muted">
            Key <span className="ml-1 font-mono text-ink">{target.key}</span>
            <span className="text-faint"> · used by forms and custom fields to point at this list</span>
          </p>
        )}
      </form>
    </Modal>
  );
}
