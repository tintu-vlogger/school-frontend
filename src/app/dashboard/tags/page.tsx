"use client";

/*
 * Tags with sub-tags: FilterBar + a tree inside a Paper (sub-tags indented under their
 * parent, expand / collapse). Row click opens the detail modal; New, Add sub-tag and Edit
 * open the form modal; tags are switched off, never deleted.
 */
import { useMemo, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ChevronRight, CornerDownRight, Eye, Pencil, Plus, Power, PowerOff, Tags } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, Field, FilterBar, FormGrid, KeyValue, Menu, Modal, ModalCancel, MultiSelect, Section, Select, Skeleton,
  TextInput, Textarea, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import {
  ColorDot, ColorSwatches, STATUS_FILTER, SWATCHES, StatusBadge, errorText, matchesStatus, orNull, useList, useSwitchActive,
} from "@/components/org/shared";

interface Tag {
  id: number; uuid: string; name: string; parent_id: number | null; parent_name: string | null; color: string | null;
  description: string | null; applies_to: string[]; sort_order: number; active: boolean; usage: number;
}

const APPLIES: SelectOption[] = [
  { value: "employees", label: "Employees" }, { value: "candidates", label: "Candidates" },
  { value: "assets", label: "Assets" }, { value: "documents", label: "Documents" },
];
const appliesLabel = (k: string) => APPLIES.find((a) => a.value === k)?.label ?? k;

type Node = { tag: Tag; depth: number; last: boolean[]; children: number; match: boolean };

function byOrder(a: Tag, b: Tag) {
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name);
}

/** ids of a tag and everything under it */
function descendantsOf(all: Tag[], id: number) {
  const out = new Set<number>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of all) if (t.parent_id !== null && out.has(t.parent_id) && !out.has(t.id)) { out.add(t.id); grew = true; }
  }
  return out;
}

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

export default function TagsPage() {
  const switchActive = useSwitchActive();
  const { rows: all, loading, refresh } = useList<Tag>("/organization/tags", "Couldn't load tags");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [formFor, setFormFor] = useState<Tag | "new">("new");
  const [formParent, setFormParent] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<Tag | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const openView = (t: Tag) => { setViewing(t); setViewOpen(true); };
  const openForm = (t: Tag | "new", parent: number | null = null) => { setFormKey((k) => k + 1); setFormFor(t); setFormParent(parent); setFormOpen(true); };

  // Matching tags plus their ancestors (shown faint) so the tree keeps its shape.
  const nodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byId = new Map(all.map((t) => [t.id, t]));
    const matches = new Set(all.filter((t) => matchesStatus(t.active, filters) &&
      (!q || t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q))).map((t) => t.id));
    const visible = new Set<number>();
    for (const id of matches) {
      let cur: Tag | undefined = byId.get(id);
      while (cur && !visible.has(cur.id)) { visible.add(cur.id); cur = cur.parent_id !== null ? byId.get(cur.parent_id) : undefined; }
    }
    const kids = new Map<number | null, Tag[]>();
    for (const t of all) {
      if (!visible.has(t.id)) continue;
      const p = t.parent_id !== null && visible.has(t.parent_id) ? t.parent_id : null;
      kids.set(p, [...(kids.get(p) ?? []), t]);
    }
    const out: Node[] = [];
    const walk = (parent: number | null, depth: number, last: boolean[]) => {
      const list = (kids.get(parent) ?? []).sort(byOrder);
      list.forEach((t, i) => {
        const l = [...last, i === list.length - 1];
        const n = kids.get(t.id)?.length ?? 0;
        out.push({ tag: t, depth, last: l, children: n, match: matches.has(t.id) });
        if (n && (q || !collapsed.has(t.id))) walk(t.id, depth + 1, l);
      });
    };
    walk(null, 0, []);
    return out;
  }, [all, search, filters, collapsed]);

  const toggleOpen = (id: number) => setCollapsed((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function toggle(t: Tag) {
    const subs = all.filter((x) => x.parent_id === t.id && x.active).length;
    const ok = await switchActive({ path: `/organization/tags/${t.uuid}`, name: t.name, active: t.active,
      message: `People and records keep the tag, but it can't be added to anything new.${subs ? ` Its ${subs} sub-tag${subs === 1 ? "" : "s"} stay as they are.` : ""}` });
    if (ok) { setViewOpen(false); refresh(); }
  }

  const filtered = !!search || !!filters.status?.length;
  const tops = all.filter((t) => t.parent_id === null).length;
  return (
    <div>
      <PageHeader eyebrow="People" title="Tags" description="Labels, with optional sub-labels, you can put on people and records to group and find them."
        actions={<Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New tag</Button>} />
      <FilterBar
        searchPlaceholder="Search tags"
        onSearchChange={setSearch}
        filters={[STATUS_FILTER]}
        values={filters}
        onChange={setFilters}
      />
      <Paper className="overflow-hidden">
        <div className="hidden items-center gap-4 border-b border-line bg-sunken/40 px-5 py-2.5 text-[12px] uppercase tracking-[0.06em] text-faint md:flex">
          <span className="flex-1">Tag</span>
          <span className="w-[260px]">Used for</span>
          <span className="w-[96px] text-right">Usage</span>
          <span className="w-[112px]">Status</span>
          <span className="w-8" />
        </div>
        {loading && !all.length ? (
          <div className="divide-y divide-line">
            {[0, 1, 2, 3, 4].map((i) => <div key={i} className="flex items-center gap-3 px-5 py-4"><Skeleton className="h-2.5 w-2.5 rounded-full" /><Skeleton className="h-3 w-48" /></div>)}
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-sunken text-faint"><Tags size={20} strokeWidth={1.4} /></span>
            <p className="text-[15px] text-ink">{filtered && all.length ? "No tags match" : "No tags yet"}</p>
            <p className="mt-1 text-[13.5px] text-muted">{filtered && all.length ? "Try another search or clear the filters." : "Create tags such as Certifications or Programmes, then add sub-tags under them."}</p>
            {!(filtered && all.length) && <div className="mt-4"><Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New tag</Button></div>}
          </div>
        ) : (
          <ul role="tree" aria-label="Tags" className={loading ? "opacity-60 transition-opacity" : undefined}>
            {nodes.map((n) => (
              <TagRow key={n.tag.id} node={n} open={!!search.trim() || !collapsed.has(n.tag.id)}
                onToggleOpen={() => toggleOpen(n.tag.id)} onView={() => openView(n.tag)}
                onAddSub={() => openForm("new", n.tag.id)} onEdit={() => openForm(n.tag)} onSwitch={() => toggle(n.tag)} />
            ))}
          </ul>
        )}
      </Paper>
      {!loading && all.length > 0 && <p className="mt-3 text-[12.5px] text-faint">{tops} {tops === 1 ? "tag" : "tags"} and {all.length - tops} sub-{all.length - tops === 1 ? "tag" : "tags"}</p>}

      <TagDetailModal tag={viewing} all={all} open={viewOpen} onClose={() => setViewOpen(false)}
        onEdit={(t) => { setViewOpen(false); openForm(t); }} onAddSub={(t) => { setViewOpen(false); openForm("new", t.id); }}
        onOpenTag={openView} onToggle={toggle} />
      <TagFormModal key={formKey} target={formFor} parentId={formParent} all={all} open={formOpen}
        onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refresh(); }} />
    </div>
  );
}

/* ── Tree row ──────────────────────────────────────────────────────────── */

const INDENT = 26;

function TagRow({ node, open, onToggleOpen, onView, onAddSub, onEdit, onSwitch }: {
  node: Node; open: boolean; onToggleOpen: () => void; onView: () => void; onAddSub: () => void; onEdit: () => void; onSwitch: () => void;
}) {
  const t = node.tag;
  const key = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(); }
    if (node.children && ((e.key === "ArrowRight" && !open) || (e.key === "ArrowLeft" && open))) { e.preventDefault(); onToggleOpen(); }
  };
  return (
    <li role="treeitem" aria-expanded={node.children ? open : undefined} aria-level={node.depth + 1} tabIndex={0} onClick={onView} onKeyDown={key}
      className="group relative flex cursor-pointer items-center gap-4 border-b border-line px-5 py-3 transition-colors last:border-b-0 hover:bg-sunken/50 focus-visible:bg-sunken/60 focus-visible:outline-none">
      {/* connectors */}
      {node.last.slice(1).map((isLast, i) => {
        const level = i + 1;
        const x = 20 + (level - 1) * INDENT + 12;
        const own = level === node.depth;
        if (!own && isLast) return null;
        return <span key={i} aria-hidden className="absolute top-0 w-px bg-line-strong/70" style={{ left: x, bottom: own && isLast ? "50%" : 0 }} />;
      })}
      {node.depth > 0 && <span aria-hidden className="absolute top-1/2 h-px bg-line-strong/70" style={{ left: 20 + (node.depth - 1) * INDENT + 12, width: INDENT - 14 }} />}

      <div className="flex min-w-0 flex-1 items-center gap-2" style={{ paddingLeft: node.depth * INDENT }}>
        {node.children ? (
          <button type="button" aria-label={open ? "Collapse" : "Expand"} onClick={(e) => { e.stopPropagation(); onToggleOpen(); }}
            className="-ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-faint transition-colors hover:bg-sunken hover:text-ink">
            <ChevronRight size={15} strokeWidth={1.4} className={`transition-transform duration-150 ${open ? "rotate-90" : ""}`} />
          </button>
        ) : <span className="w-5 shrink-0" />}
        <ColorDot color={t.color} />
        <div className={`min-w-0 ${node.match ? "" : "opacity-55"}`}>
          <p className="flex items-center gap-2 truncate text-[14px] text-ink">
            <span className="truncate">{t.name}</span>
            {node.children > 0 && !open && <span className="shrink-0 text-[12px] text-faint">{node.children} sub-{node.children === 1 ? "tag" : "tags"}</span>}
          </p>
          {t.description && <p className="truncate text-[12.5px] text-muted">{t.description}</p>}
        </div>
      </div>

      <div className="hidden w-[260px] flex-wrap gap-1.5 md:flex">
        {t.applies_to?.length ? t.applies_to.map((a) => <Badge key={a}>{appliesLabel(a)}</Badge>) : <span className="text-[13px] text-faint">Anything</span>}
      </div>
      <div className="w-[96px] text-right">
        {t.usage > 0 ? (
          <Link href={`/dashboard/staff?tag=${t.id}`} onClick={(e) => e.stopPropagation()} className="tabular text-[13px] text-primary hover:underline">{people(t.usage)}</Link>
        ) : <span className="tabular text-[13px] text-faint">Unused</span>}
      </div>
      <div className="hidden w-[112px] sm:block"><StatusBadge active={t.active} /></div>
      <div className="w-8" onClick={(e) => e.stopPropagation()}>
        <Menu items={[
          { label: "View details", icon: Eye, onSelect: onView },
          { label: "Add sub-tag", icon: CornerDownRight, onSelect: onAddSub },
          { label: "Edit", icon: Pencil, onSelect: onEdit },
          "separator",
          t.active ? { label: "Switch off", icon: PowerOff, danger: true, onSelect: onSwitch } : { label: "Switch on", icon: Power, onSelect: onSwitch },
        ]} />
      </div>
    </li>
  );
}

/* ── Form ──────────────────────────────────────────────────────────────── */

function TagFormModal({ target, parentId, all, open, onClose, onSaved }: {
  target: Tag | "new"; parentId: number | null; all: Tag[]; open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const editing = target !== "new" ? target : null;
  const parentTag = all.find((t) => t.id === (editing ? editing.parent_id : parentId)) ?? null;
  const initial = {
    name: editing?.name ?? "", parent: editing ? editing.parent_id : parentId,
    color: editing?.color ?? parentTag?.color ?? SWATCHES[0], description: editing?.description ?? "",
    applies: editing?.applies_to ?? parentTag?.applies_to ?? [],
  };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  const parents = useMemo(() => {
    const blocked = editing ? descendantsOf(all, editing.id) : new Set<number>();
    const byId = new Map(all.map((t) => [t.id, t]));
    const path = (t: Tag) => { const out: string[] = []; let c: Tag | undefined = t; while (c) { out.unshift(c.name); c = c.parent_id !== null ? byId.get(c.parent_id) : undefined; } return out; };
    return all.filter((t) => !blocked.has(t.id) && (t.active || t.id === initial.parent))
      .map((t) => { const p = path(t); return { value: t.id, label: t.name, description: p.length > 1 ? `in ${p.slice(0, -1).join(" › ")}` : undefined }; })
      .sort((a, b) => (a.description ?? "").localeCompare(b.description ?? "") || a.label.localeCompare(b.label));
  }, [all, editing, initial.parent]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError("Give the tag a name"); return; }
    setSaving(true);
    try {
      const payload = { name: v.name.trim(), parent_id: v.parent, color: v.color, description: orNull(v.description), applies_to: v.applies };
      if (editing) { await api.put(`/organization/tags/${editing.uuid}`, payload); toast.success("Tag updated"); }
      else { await api.post("/organization/tags", payload); toast.success(v.parent ? "Sub-tag added" : "Tag created"); }
      onSaved();
    } catch (err: unknown) {
      toast.error("Couldn't save the tag", { description: errorText(err) });
    } finally { setSaving(false); }
  }

  const isSub = !editing && parentId !== null;
  return (
    <Modal open={open} onClose={onClose} size="md" dirty={dirty} busy={saving}
      title={editing ? `Edit ${editing.name}` : isSub ? `New sub-tag in ${parentTag?.name ?? "tag"}` : "New tag"}
      description={editing ? undefined : isSub ? "A finer label that sits under its parent." : "A label you can put on people and records."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="tag-form" loading={saving}>{editing ? "Save changes" : isSub ? "Add sub-tag" : "Create tag"}</Button></>}>
      <form id="tag-form" onSubmit={submit} noValidate>
        <FormGrid columns={1}>
          <Field label="Name" required error={error}>
            <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} placeholder={isSub ? "e.g. AWS certified" : "e.g. Certifications"} maxLength={100} />
          </Field>
          <Field label="Parent tag" aside="Optional" hint="Leave empty for a top-level tag">
            <Select value={v.parent} onChange={(x) => setV({ ...v, parent: x })} options={parents} clearable placeholder="None, top level" />
          </Field>
          <Field label="Colour">
            <ColorSwatches value={v.color} onChange={(c) => setV({ ...v, color: c })} />
          </Field>
          <Field label="Can be used for" hint="Leave empty to allow anything">
            <MultiSelect value={v.applies} onChange={(x) => setV({ ...v, applies: x })} options={APPLIES} placeholder="Anything" />
          </Field>
          <Field label="Description">
            <Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={2} placeholder="When to use this tag" />
          </Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Details ───────────────────────────────────────────────────────────── */

function TagDetailModal({ tag: t, all, open, onClose, onEdit, onAddSub, onOpenTag, onToggle }: {
  tag: Tag | null; all: Tag[]; open: boolean; onClose: () => void; onEdit: (t: Tag) => void; onAddSub: (t: Tag) => void;
  onOpenTag: (t: Tag) => void; onToggle: (t: Tag) => void;
}) {
  const subs = t ? all.filter((x) => x.parent_id === t.id).sort(byOrder) : [];
  const parent = t?.parent_id ? all.find((x) => x.id === t.parent_id) : null;
  return (
    <Modal open={open && !!t} onClose={onClose} size="md"
      title={t?.name}
      description={t ? (t.description || (t.parent_name ? `Sub-tag in ${t.parent_name}` : "Top-level tag")) : undefined}
      leading={t && (
        <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `${t.color || "#4f46e5"}1a`, color: t.color || "#4f46e5" }}>
          <Tags size={20} strokeWidth={1.4} />
        </span>
      )}
      headerActions={t && <Button size="sm" icon={Pencil} onClick={() => onEdit(t)}>Edit</Button>}
      footerStart={t && <Button variant="ghost" icon={CornerDownRight} onClick={() => onAddSub(t)}>Add sub-tag</Button>}
      footer={t && (t.active ? <Button icon={PowerOff} onClick={() => onToggle(t)}>Switch off</Button> : <Button icon={Power} onClick={() => onToggle(t)}>Switch on</Button>)}>
      {t && (
        <>
          <Section title="Overview">
            <KeyValue columns={2} items={[
              { label: "Parent", value: parent ? <button type="button" onClick={() => onOpenTag(parent)} className="flex items-center gap-2 text-primary hover:underline"><ColorDot color={parent.color} size={8} />{parent.name}</button> : "None, top level" },
              { label: "Status", value: <StatusBadge active={t.active} /> },
              { label: "Can be used for", value: t.applies_to?.length ? <span className="flex flex-wrap gap-1.5">{t.applies_to.map((a) => <Badge key={a}>{appliesLabel(a)}</Badge>)}</span> : "Anything" },
              { label: "Usage", value: t.usage ? <Link href={`/dashboard/staff?tag=${t.id}`} className="text-primary hover:underline">{people(t.usage)}</Link> : <span className="text-muted">Not used yet</span> },
            ]} />
          </Section>
          <Section title="Sub-tags" description={subs.length ? `${subs.length} under ${t.name}` : undefined} className="border-t border-line">
            {subs.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-5 text-[13.5px] text-muted">
                <CornerDownRight size={16} strokeWidth={1.4} className="text-faint" /> No sub-tags yet.
              </p>
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {subs.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => onOpenTag(s)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-sunken/70">
                      <ColorDot color={s.color} />
                      <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{s.name}</span>
                      {!s.active && <Badge>Switched off</Badge>}
                      <span className="tabular text-[12.5px] text-muted">{s.usage ? people(s.usage) : "Unused"}</span>
                    </button>
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
