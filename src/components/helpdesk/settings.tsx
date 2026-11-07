"use client";

/*
 * Help desk settings (admins): categories with agents, response targets (SLA), saved
 * replies, the knowledge base and general rules (ratings, reopening, restrictions).
 * Every add/edit opens a centered modal.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CornerDownRight, FolderTree, MessageSquareQuote, Pencil, Plus, Timer, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatRelative } from "@/lib/datetime";
import { Paper } from "@/components/shell/page";
import {
  AvatarGroup, Badge, Button, DataTable, Field, FormGrid, FormSection, Modal, ModalCancel, NumberInput, RadioCards, Select,
  Skeleton, Tabs, TextInput, Textarea, Toggle, type SelectOption,
} from "@/components/ui-kit";
import { PRIORITY_LABEL, PRIORITY_OPTIONS, durationLabel, loadEmployees } from "@/components/workplace/pickers";
import { PriorityBadge, type Category } from "./types";
import type { Article } from "./new-case-modal";

const S = 1.4;
type Sub = "categories" | "slas" | "canned" | "articles" | "general";

function useList<T>(path: string) {
  const [state, setState] = useState<{ n: number; rows: T[] | null }>({ n: 0, rows: null });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    api.get<{ items: T[] }>(path).then((r) => { if (live) setState({ n: nonce, rows: r.items }); }).catch(() => { if (live) setState({ n: nonce, rows: [] }); });
    return () => { live = false; };
  }, [path, nonce]);
  return { rows: state.rows, loading: state.n !== nonce || state.rows === null, refresh: useCallback(() => setNonce((x) => x + 1), []) };
}

function errMsg(e: unknown) { return e instanceof Error ? e.message : undefined; }

export function HelpdeskSettings() {
  const [sub, setSub] = useState<Sub>("categories");
  return (
    <div className="space-y-5">
      <Tabs variant="pill" value={sub} onChange={setSub} items={[
        { value: "categories", label: "Categories", icon: FolderTree },
        { value: "slas", label: "Response targets", icon: Timer },
        { value: "canned", label: "Saved replies", icon: MessageSquareQuote },
        { value: "articles", label: "Knowledge base", icon: BookOpen },
        { value: "general", label: "General" },
      ]} />
      {sub === "categories" && <Categories />}
      {sub === "slas" && <Slas />}
      {sub === "canned" && <Canned />}
      {sub === "articles" && <Articles />}
      {sub === "general" && <General />}
    </div>
  );
}

/* ── Categories ────────────────────────────────────────────────────────── */

const MODES = [
  { value: "pickup", label: "Agents pick up", description: "New cases wait in a shared queue." },
  { value: "managed", label: "Owner assigns", description: "The category owner hands each case out." },
  { value: "auto", label: "Automatic", description: "Goes to the agent with the fewest open cases." },
];

function Categories() {
  const { rows, loading, refresh } = useList<Category>("/helpdesk/categories?include_inactive=true");
  const [form, setForm] = useState<{ cat: Category | null; parent: number | null; key: number } | null>(null);
  const ordered = useMemo(() => {
    const all = rows ?? [];
    return all.filter((c) => c.parent_id === null).flatMap((m) => [m, ...all.filter((s) => s.parent_id === m.id)]);
  }, [rows]);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-muted">Where cases go, who handles them and how they are assigned.</p>
        <Button variant="primary" icon={Plus} onClick={() => setForm({ cat: null, parent: null, key: Date.now() })}>New category</Button>
      </div>
      <DataTable<Category> rows={ordered} rowKey={(c) => c.uuid} loading={loading} onRowClick={(c) => setForm({ cat: c, parent: c.parent_id, key: Date.now() })}
        emptyIcon={FolderTree} emptyTitle="No categories yet"
        rowActions={(c) => [
          { label: "Edit", icon: Pencil, onSelect: () => setForm({ cat: c, parent: c.parent_id, key: Date.now() }) },
          ...(c.parent_id === null ? [{ label: "Add subcategory", icon: Plus, onSelect: () => setForm({ cat: null, parent: c.id, key: Date.now() }) }] : []),
        ]}
        columns={[
          { key: "name", header: "Category", cell: (c) => (
            <div className={`flex min-w-0 items-center gap-2 ${c.parent_id ? "pl-6" : ""}`}>
              {c.parent_id && <CornerDownRight size={14} strokeWidth={S} className="shrink-0 text-faint" />}
              <div className="min-w-0"><p className="truncate text-ink">{c.name}</p>{c.description && !c.parent_id && <p className="truncate text-[12.5px] text-muted">{c.description}</p>}</div>
            </div>) },
          { key: "agents", header: "Agents", hideBelow: "md", cell: (c) => c.agents?.length
            ? <span className="flex items-center gap-2"><AvatarGroup people={c.agents.map((a) => ({ name: a.name || "?" }))} max={4} size={24} /><span className="text-[12.5px] text-muted">{c.agents.length}</span></span>
            : <span className="text-faint">{c.parent_id ? "Same as category" : "None"}</span> },
          { key: "mode", header: "Assignment", hideBelow: "lg", cell: (c) => c.parent_id ? <span className="text-faint">—</span> : <span className="text-muted">{MODES.find((m) => m.value === c.assignment_mode)?.label}</span> },
          { key: "owner", header: "Owner", hideBelow: "lg", cell: (c) => <span className="text-muted">{c.owner_name ?? "—"}</span> },
          { key: "open", header: "Open", align: "right", cell: (c) => <span className="tabular text-muted">{c.open_cases}</span> },
          { key: "status", header: "Status", cell: (c) => <Badge tone={c.active ? "good" : "neutral"} dot>{c.active ? "Active" : "Off"}</Badge> },
        ]} />
      {form && <CategoryForm key={form.key} cat={form.cat} parentId={form.parent} mains={(rows ?? []).filter((c) => c.parent_id === null)}
        onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
    </>
  );
}

type AgentRow = { employee_id: number | null; name?: string | null; location_id: number | null };

function CategoryForm({ cat, parentId, mains, onClose, onSaved }: {
  cat: Category | null; parentId: number | null; mains: Category[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const [locations, setLocations] = useState<SelectOption<number>[]>([]);
  useEffect(() => { api.get<SelectOption<number>[]>("/helpdesk/locations").then(setLocations).catch(() => {}); }, []);
  const init = {
    name: cat?.name ?? "", description: cat?.description ?? "", parent_id: cat ? cat.parent_id : parentId,
    assignment_mode: cat?.assignment_mode ?? "pickup", owner: cat?.owner_employee_id ?? null, escalate: cat?.escalate_to_employee_id ?? null,
    priority: cat?.default_priority ?? "medium", require_sub: cat?.require_subcategory ?? false, active: cat?.active ?? true,
    agents: (cat?.agents ?? []).map((a) => ({ employee_id: a.employee_id, name: a.name, location_id: a.location_id })) as AgentRow[],
  };
  const [v, setV] = useState(init);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isSub = v.parent_id !== null;
  const close = () => { setOpen(false); setTimeout(onClose, 180); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError("Give the category a name"); return; }
    setSaving(true);
    const payload = {
      name: v.name.trim(), description: v.description.trim() || null, parent_id: v.parent_id, assignment_mode: isSub ? undefined : v.assignment_mode,
      owner_employee_id: v.owner, escalate_to_employee_id: v.escalate, default_priority: v.priority, require_subcategory: v.require_sub,
      active: v.active, agents: v.agents.filter((a) => a.employee_id).map((a) => ({ employee_id: a.employee_id, location_id: a.location_id })),
    };
    try {
      if (cat) await api.put(`/helpdesk/categories/${cat.uuid}`, payload); else await api.post("/helpdesk/categories", payload);
      toast.success(cat ? "Category saved" : "Category added");
      setOpen(false); setTimeout(onSaved, 180);
    } catch (err) { toast.error("Couldn't save the category", { description: errMsg(err) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={close} size="lg" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(init)}
      title={cat ? `Edit ${cat.name}` : isSub ? "New subcategory" : "New category"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="hd-cat" loading={saving}>{cat ? "Save" : "Add"}</Button></>}>
      <form id="hd-cat" onSubmit={save} noValidate className="space-y-6">
        <FormGrid>
          <Field label="Name" required error={error}><TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} placeholder="e.g. Payroll" /></Field>
          <Field label="Sits under" aside="Optional">
            <Select value={v.parent_id} clearable placeholder="Main category" onChange={(x) => setV({ ...v, parent_id: x })}
              options={mains.filter((m) => m.id !== cat?.id).map((m) => ({ value: m.id, label: m.name }))} />
          </Field>
          <Field label="Description" className="sm:col-span-2"><Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={2} placeholder="Shown to employees when they pick a category" /></Field>
        </FormGrid>
        {!isSub && (
          <FormSection title="Assignment">
            <RadioCards columns={3} value={v.assignment_mode} onChange={(x) => setV({ ...v, assignment_mode: x })} options={MODES} />
          </FormSection>
        )}
        <FormSection title="Agents" description={isSub ? "Leave empty to use the main category's agents." : "Set a location to send that branch's cases to its own agents."}>
          <div className="space-y-2">
            {v.agents.map((a, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <Select value={a.employee_id} loadOptions={loadEmployees} placeholder="Search people"
                  selectedOption={a.employee_id && a.name ? { value: a.employee_id, label: a.name } : null}
                  onChange={(x, opt) => setV({ ...v, agents: v.agents.map((r, j) => j === i ? { ...r, employee_id: x, name: opt?.label } : r) })} />
                <Select value={a.location_id} options={locations} clearable placeholder={locations.length ? "All locations" : "All locations"} disabled={!locations.length}
                  onChange={(x) => setV({ ...v, agents: v.agents.map((r, j) => j === i ? { ...r, location_id: x } : r) })} />
                <button type="button" aria-label="Remove agent" onClick={() => setV({ ...v, agents: v.agents.filter((_, j) => j !== i) })}
                  className="rounded-lg p-2 text-faint hover:bg-sunken hover:text-rose-600"><Trash2 size={15} strokeWidth={S} /></button>
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => setV({ ...v, agents: [...v.agents, { employee_id: null, location_id: null }] })}>Add agent</Button>
          </div>
        </FormSection>
        <FormSection title="Rules">
          <FormGrid>
            <Field label="Owner" aside="Optional" hint="Assigns cases and sees reports for this category">
              <Select value={v.owner} loadOptions={loadEmployees} clearable placeholder="Search people" onChange={(x) => setV({ ...v, owner: x })}
                selectedOption={cat?.owner_employee_id ? { value: cat.owner_employee_id, label: cat.owner_name || "Owner" } : null} />
            </Field>
            <Field label="Escalate late cases to" aside="Optional">
              <Select value={v.escalate} loadOptions={loadEmployees} clearable placeholder="The owner" onChange={(x) => setV({ ...v, escalate: x })}
                selectedOption={cat?.escalate_to_employee_id ? { value: cat.escalate_to_employee_id, label: cat.escalate_to_name || "Person" } : null} />
            </Field>
            <Field label="Default priority"><Select value={v.priority} options={PRIORITY_OPTIONS} onChange={(x) => setV({ ...v, priority: x || "medium" })} /></Field>
          </FormGrid>
          <div className="mt-4 space-y-3">
            {!isSub && <Toggle checked={v.require_sub} onChange={(x) => setV({ ...v, require_sub: x })} label="Employees must pick a subcategory" />}
            <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="Active" description="Switched-off categories take no new cases." />
          </div>
        </FormSection>
      </form>
    </Modal>
  );
}

/* ── Response targets ──────────────────────────────────────────────────── */

type SlaRow = {
  uuid: string; category_id: number | null; category_name: string | null; priority: string; response_minutes: number; resolution_minutes: number;
  escalate_to_employee_id: number | null; escalate_to_name: string | null; raise_priority: boolean; active: boolean;
};

function Slas() {
  const { rows, loading, refresh } = useList<SlaRow>("/helpdesk/slas");
  const cats = useList<Category>("/helpdesk/categories");
  const [form, setForm] = useState<{ row: SlaRow | null; key: number } | null>(null);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13.5px] text-muted">Time to first reply and to resolve, by priority. A category target wins over the company-wide one. The clock stops while a case waits on the employee.</p>
        <Button variant="primary" icon={Plus} onClick={() => setForm({ row: null, key: Date.now() })}>New target</Button>
      </div>
      <DataTable<SlaRow> rows={rows ?? []} rowKey={(r) => r.uuid} loading={loading} onRowClick={(r) => setForm({ row: r, key: Date.now() })} emptyIcon={Timer}
        emptyTitle="No targets" columns={[
          { key: "cat", header: "Applies to", cell: (r) => <span className={r.category_name ? "text-ink" : "text-muted"}>{r.category_name ?? "All categories"}</span> },
          { key: "p", header: "Priority", cell: (r) => <PriorityBadge priority={r.priority} /> },
          { key: "resp", header: "First reply", cell: (r) => <span className="tabular">{durationLabel(r.response_minutes)}</span> },
          { key: "res", header: "Resolve", cell: (r) => <span className="tabular">{durationLabel(r.resolution_minutes)}</span> },
          { key: "esc", header: "When late", hideBelow: "md", cell: (r) => <span className="text-muted">{[r.escalate_to_name ? `Tell ${r.escalate_to_name}` : "Tell the owner", r.raise_priority ? "raise priority" : null].filter(Boolean).join(", ")}</span> },
          { key: "a", header: "Status", cell: (r) => <Badge tone={r.active ? "good" : "neutral"} dot>{r.active ? "Active" : "Off"}</Badge> },
        ]} />
      {form && <SlaForm key={form.key} row={form.row} categories={(cats.rows ?? []).filter((c) => c.parent_id === null)} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
    </>
  );
}

function SlaForm({ row, categories, onClose, onSaved }: { row: SlaRow | null; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const [v, setV] = useState({
    category_id: row?.category_id ?? null, priority: row?.priority ?? "medium",
    resp: row ? row.response_minutes / 60 : 8, res: row ? row.resolution_minutes / 60 : 72,
    escalate: row?.escalate_to_employee_id ?? null, raise: row?.raise_priority ?? true, active: row?.active ?? true,
  });
  const [saving, setSaving] = useState(false);
  const close = () => { setOpen(false); setTimeout(onClose, 180); };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!v.resp || !v.res) { toast.error("Set both times"); return; }
    setSaving(true);
    const payload = { category_id: v.category_id, priority: v.priority, response_minutes: Math.round(v.resp * 60), resolution_minutes: Math.round(v.res * 60),
      escalate_to_employee_id: v.escalate, raise_priority: v.raise, active: v.active };
    try {
      if (row) await api.put(`/helpdesk/slas/${row.uuid}`, payload); else await api.post("/helpdesk/slas", payload);
      toast.success("Target saved"); setOpen(false); setTimeout(onSaved, 180);
    } catch (err) { toast.error("Couldn't save the target", { description: errMsg(err) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={close} size="md" busy={saving} title={row ? "Edit response target" : "New response target"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="hd-sla" loading={saving}>Save</Button></>}>
      <form id="hd-sla" onSubmit={save} noValidate className="space-y-5">
        <FormGrid>
          <Field label="Category"><Select value={v.category_id} clearable placeholder="All categories" onChange={(x) => setV({ ...v, category_id: x })} options={categories.map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="Priority"><Select value={v.priority} options={PRIORITY_OPTIONS} onChange={(x) => setV({ ...v, priority: x || "medium" })} /></Field>
          <Field label="First reply within"><NumberInput value={v.resp} min={0.25} step={0.5} suffix="hours" onChange={(x) => setV({ ...v, resp: x ?? 0 })} /></Field>
          <Field label="Resolve within"><NumberInput value={v.res} min={0.5} step={1} suffix="hours" onChange={(x) => setV({ ...v, res: x ?? 0 })} /></Field>
          <Field label="Escalate to" aside="Optional" className="sm:col-span-2">
            <Select value={v.escalate} loadOptions={loadEmployees} clearable placeholder="The category's escalation contact or owner" onChange={(x) => setV({ ...v, escalate: x })}
              selectedOption={row?.escalate_to_employee_id ? { value: row.escalate_to_employee_id, label: row.escalate_to_name || "Person" } : null} />
          </Field>
        </FormGrid>
        <Toggle checked={v.raise} onChange={(x) => setV({ ...v, raise: x })} label="Raise the priority when late" description={`For example ${PRIORITY_LABEL.medium.toLowerCase()} becomes ${PRIORITY_LABEL.high.toLowerCase()}.`} />
        <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="Active" />
      </form>
    </Modal>
  );
}

/* ── Saved replies ─────────────────────────────────────────────────────── */

type CannedRow = { uuid: string; title: string; body: string; category_id: number | null; category_name: string | null; active: boolean; updated_at: string };

function Canned() {
  const { rows, loading, refresh } = useList<CannedRow>("/helpdesk/canned");
  const cats = useList<Category>("/helpdesk/categories");
  const [form, setForm] = useState<{ row: CannedRow | null; key: number } | null>(null);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-muted">Ready answers agents insert into replies. Use {"{{requester.first_name}}"} and {"{{case.reference_no}}"}.</p>
        <Button variant="primary" icon={Plus} onClick={() => setForm({ row: null, key: Date.now() })}>New reply</Button>
      </div>
      <DataTable<CannedRow> rows={rows ?? []} rowKey={(r) => r.uuid} loading={loading} onRowClick={(r) => setForm({ row: r, key: Date.now() })} emptyIcon={MessageSquareQuote}
        emptyTitle="No saved replies" columns={[
          { key: "t", header: "Title", cell: (r) => <div className="min-w-0"><p className="truncate text-ink">{r.title}</p><p className="truncate text-[12.5px] text-muted">{r.body}</p></div> },
          { key: "c", header: "Category", hideBelow: "md", cell: (r) => <span className="text-muted">{r.category_name ?? "Any"}</span> },
          { key: "a", header: "Status", cell: (r) => <Badge tone={r.active ? "good" : "neutral"} dot>{r.active ? "Active" : "Off"}</Badge> },
        ]} />
      {form && <TextForm key={form.key} kind="canned" row={form.row} categories={(cats.rows ?? []).filter((c) => c.parent_id === null)}
        onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
    </>
  );
}

/* ── Knowledge base ────────────────────────────────────────────────────── */

function Articles() {
  const { rows, loading, refresh } = useList<Article>("/helpdesk/articles?all=true&limit=100");
  const cats = useList<Category>("/helpdesk/categories");
  const [form, setForm] = useState<{ uuid: string | null; key: number } | null>(null);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-muted">Answers employees see before they raise a case.</p>
        <Button variant="primary" icon={Plus} onClick={() => setForm({ uuid: null, key: Date.now() })}>New article</Button>
      </div>
      <DataTable<Article> rows={rows ?? []} rowKey={(r) => r.uuid} loading={loading} onRowClick={(r) => setForm({ uuid: r.uuid, key: Date.now() })} emptyIcon={BookOpen}
        emptyTitle="No articles yet" columns={[
          { key: "t", header: "Article", cell: (r) => <div className="min-w-0"><p className="truncate text-ink">{r.title}</p><p className="truncate text-[12.5px] text-muted">{r.body}</p></div> },
          { key: "c", header: "Category", hideBelow: "md", cell: (r) => <span className="text-muted">{r.category_name ?? "General"}</span> },
          { key: "v", header: "Views", align: "right", hideBelow: "sm", cell: (r) => <span className="tabular text-muted">{r.views}</span> },
          { key: "h", header: "Helpful", hideBelow: "lg", cell: (r) => <span className="text-muted">{r.helpful_yes + r.helpful_no ? `${Math.round((100 * r.helpful_yes) / (r.helpful_yes + r.helpful_no))}%` : "—"}</span> },
          { key: "u", header: "Updated", hideBelow: "lg", cell: (r) => <span className="text-muted">{formatRelative(r.updated_at)}</span> },
          { key: "p", header: "Status", cell: (r) => <Badge tone={r.published ? "good" : "neutral"} dot>{r.published ? "Published" : "Draft"}</Badge> },
        ]} />
      {form && <ArticleLoader key={form.key} uuid={form.uuid} categories={(cats.rows ?? []).filter((c) => c.parent_id === null)}
        onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
    </>
  );
}

function ArticleLoader({ uuid, ...rest }: { uuid: string | null; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const [row, setRow] = useState<Article | null | undefined>(uuid ? undefined : null);
  useEffect(() => { if (uuid) api.get<Article>(`/helpdesk/articles/${uuid}`).then(setRow).catch(() => setRow(null)); }, [uuid]);
  if (row === undefined) return null;
  return <TextForm kind="article" row={row} {...rest} />;
}

function TextForm({ kind, row, categories, onClose, onSaved }: {
  kind: "canned" | "article"; row: (CannedRow | Article) | null; categories: Category[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const art = kind === "article" ? (row as Article | null) : null;
  const init = { title: row?.title ?? "", body: row?.body ?? "", category_id: row?.category_id ?? null,
    on: kind === "article" ? (art?.published ?? true) : ((row as CannedRow | null)?.active ?? true), tags: (art?.tags ?? []).join(", ") };
  const [v, setV] = useState(init);
  const [saving, setSaving] = useState(false);
  const close = () => { setOpen(false); setTimeout(onClose, 180); };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!v.title.trim() || !v.body.trim()) { toast.error("Write a title and the text"); return; }
    setSaving(true);
    const base = kind === "article" ? "/helpdesk/articles" : "/helpdesk/canned";
    const payload = kind === "article"
      ? { title: v.title.trim(), body: v.body.trim(), category_id: v.category_id, published: v.on, tags: v.tags.split(",").map((t) => t.trim()).filter(Boolean) }
      : { title: v.title.trim(), body: v.body.trim(), category_id: v.category_id, active: v.on };
    try {
      if (row) await api.put(`${base}/${row.uuid}`, payload); else await api.post(base, payload);
      toast.success("Saved"); setOpen(false); setTimeout(onSaved, 180);
    } catch (err) { toast.error("Couldn't save", { description: errMsg(err) }); }
    finally { setSaving(false); }
  }
  const noun = kind === "article" ? "article" : "saved reply";
  return (
    <Modal open={open} onClose={close} size="lg" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(init)}
      title={row ? `Edit ${noun}` : `New ${noun}`}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="hd-text" loading={saving}>Save</Button></>}>
      <form id="hd-text" onSubmit={save} noValidate className="space-y-5">
        <FormGrid>
          <Field label={kind === "article" ? "Question or title" : "Title"} required className="sm:col-span-2">
            <TextInput autoFocusInModal value={v.title} onValueChange={(x) => setV({ ...v, title: x })} placeholder={kind === "article" ? "e.g. How do I download my payslip?" : "e.g. Need more details"} />
          </Field>
          <Field label="Category" aside="Optional"><Select value={v.category_id} clearable placeholder={kind === "article" ? "General" : "Any category"} onChange={(x) => setV({ ...v, category_id: x })} options={categories.map((c) => ({ value: c.id, label: c.name }))} /></Field>
          {kind === "article" && <Field label="Search words" aside="Comma separated"><TextInput value={v.tags} onValueChange={(x) => setV({ ...v, tags: x })} placeholder="payslip, salary" /></Field>}
          <Field label={kind === "article" ? "Answer" : "Text"} required className="sm:col-span-2">
            <Textarea value={v.body} onValueChange={(x) => setV({ ...v, body: x })} rows={8} autoGrow maxRows={18} />
          </Field>
        </FormGrid>
        <Toggle checked={v.on} onChange={(x) => setV({ ...v, on: x })} label={kind === "article" ? "Published" : "Active"}
          description={kind === "article" ? "Drafts are visible only to help desk admins." : undefined} />
      </form>
    </Modal>
  );
}

/* ── General ───────────────────────────────────────────────────────────── */

type Conf = {
  rating_enabled: boolean; rating_scale: number; rating_labels: Record<string, string[]>; thank_you_message: string;
  reopen_on_poor_rating: boolean; poor_rating_at_most: Record<string, number>; allow_requester_reopen: boolean;
  reopen_window_days: number; block_comments_when_closed: boolean; hide_priority_from_requester: boolean;
  require_reply_before_resolve: boolean; auto_close_after_days: number; pause_sla_while_waiting: boolean; raise_for_others: boolean;
};

function General() {
  const toast = useToast();
  const [saved, setSaved] = useState<Conf | null>(null);
  const [v, setV] = useState<Conf | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get<Conf>("/helpdesk/settings").then((r) => { setSaved(r); setV(r); }).catch(() => {}); }, []);
  if (!v || !saved) return <Paper className="p-6"><Skeleton className="h-40" /></Paper>;
  const scale = String(v.rating_scale);
  const set = (p: Partial<Conf>) => setV({ ...v, ...p });
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  async function save() {
    setSaving(true);
    try { const r = await api.put<Conf>("/helpdesk/settings", v); setSaved(r); setV(r); toast.success("Settings saved"); }
    catch (err) { toast.error("Couldn't save the settings", { description: errMsg(err) }); }
    finally { setSaving(false); }
  }
  return (
    <Paper className="divide-y divide-line">
      <div className="space-y-4 p-6">
        <p className="text-[15px] text-ink">Ratings</p>
        <Toggle checked={v.rating_enabled} onChange={(x) => set({ rating_enabled: x })} label="Ask employees to rate resolved cases" />
        {v.rating_enabled && (
          <>
            <RadioCards columns={2} value={scale} onChange={(x) => set({ rating_scale: Number(x) })} options={[
              { value: "3", label: "3-point scale", description: v.rating_labels["3"].join(" · ") },
              { value: "5", label: "5-point scale", description: v.rating_labels["5"].join(" · ") }]} />
            <Field label="Labels" hint="From the lowest to the highest rating">
              <div className={`grid gap-2 ${scale === "5" ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-3"}`}>
                {v.rating_labels[scale].map((l, i) => (
                  <TextInput key={i} value={l} aria-label={`Label ${i + 1}`} onValueChange={(x) => set({ rating_labels: { ...v.rating_labels, [scale]: v.rating_labels[scale].map((y, j) => j === i ? x : y) } })} />
                ))}
              </div>
            </Field>
            <Field label="Thank-you message"><Textarea value={v.thank_you_message} onValueChange={(x) => set({ thank_you_message: x })} rows={2} /></Field>
            <Toggle checked={v.reopen_on_poor_rating} onChange={(x) => set({ reopen_on_poor_rating: x })} label="Reopen the case after a poor rating" />
            {v.reopen_on_poor_rating && (
              <Field label="A rating is poor at or below" className="max-w-[240px]">
                <NumberInput value={v.poor_rating_at_most[scale]} min={1} max={Number(scale) - 1} onChange={(x) => set({ poor_rating_at_most: { ...v.poor_rating_at_most, [scale]: x ?? 1 } })} />
              </Field>
            )}
          </>
        )}
      </div>
      <div className="space-y-4 p-6">
        <p className="text-[15px] text-ink">Closing and reopening</p>
        <Toggle checked={v.require_reply_before_resolve} onChange={(x) => set({ require_reply_before_resolve: x })} label="Agents must reply before resolving" />
        <Field label="Close resolved cases automatically after" className="max-w-[300px]" hint="0 keeps them open until the employee closes them">
          <NumberInput value={v.auto_close_after_days} min={0} max={90} suffix="days" onChange={(x) => set({ auto_close_after_days: x ?? 0 })} />
        </Field>
        <Toggle checked={v.allow_requester_reopen} onChange={(x) => set({ allow_requester_reopen: x })} label="Employees can reopen their cases" />
        {v.allow_requester_reopen && (
          <Field label="Within" className="max-w-[240px]"><NumberInput value={v.reopen_window_days} min={1} max={90} suffix="days" onChange={(x) => set({ reopen_window_days: x ?? 7 })} /></Field>
        )}
        <Toggle checked={v.block_comments_when_closed} onChange={(x) => set({ block_comments_when_closed: x })} label="No messages on closed cases" />
      </div>
      <div className="space-y-4 p-6">
        <p className="text-[15px] text-ink">Cases</p>
        <Toggle checked={v.pause_sla_while_waiting} onChange={(x) => set({ pause_sla_while_waiting: x })} label="Stop the clock while waiting on the employee" />
        <Toggle checked={v.hide_priority_from_requester} onChange={(x) => set({ hide_priority_from_requester: x })} label="Hide priority from employees" />
        <Toggle checked={v.raise_for_others} onChange={(x) => set({ raise_for_others: x })} label="Agents can raise cases for employees" description="For calls, emails and walk-ins." />
      </div>
      <div className="flex justify-end gap-2 px-6 py-4">
        <Button disabled={!dirty || saving} onClick={() => setV(saved)}>Reset</Button>
        <Button variant="primary" loading={saving} disabled={!dirty} onClick={save}>Save settings</Button>
      </div>
    </Paper>
  );
}
