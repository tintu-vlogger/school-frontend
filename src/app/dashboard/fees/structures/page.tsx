"use client";

/*
 * Fee set-up: structures (amounts per head for a session and class, with the instalment plan),
 * fee heads (type, tax, ledger account) and fee categories (new admission, RTE, staff ward …).
 */
import { useMemo, useState } from "react";
import { Ban, Copy, Eye, Layers, Pencil, Plus, Sparkles, Tags, Trash2, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";

import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, DataTable, DateInput, Field, FilterBar, FormGrid, FormSection, Modal, ModalCancel, MultiSelect,
  NumberInput, Select, Tabs, TextInput, Textarea, useConfirm, type Column,
} from "@/components/ui-kit";
import {
  type Head, type Page, errMsg, money, n, useFeeMeta, useFetch, useHeads, useProgramOptions, useSessions,
} from "@/components/fees/shared";

type Structure = {
  id: number; uuid: string; name: string; session_id: number; session_name: string | null; program_id: number | null;
  program_name: string | null; category_id: number | null; category_name: string | null; plan: string; notes: string | null;
  active: boolean; instalment_count: number; total: number; total_with_optional: number; invoices?: number;
  instalments?: { id: number; seq: number; name: string; due_date: string }[];
  items?: { id: number; head_id: number; head: string; head_code: string; amount: number; billing: string; instalment_no: number | null; optional: boolean }[];
};
type Category = { id: number; uuid: string; name: string; code: string | null; description: string | null; active: boolean };

export default function StructuresPage() {
  const [tab, setTab] = useState<"structures" | "heads" | "categories">("structures");
  return (
    <div>
      <PageHeader eyebrow="Fees" title="Fee structures" description="What each class pays, when it falls due, and the fee heads and categories behind it." />
      <Tabs value={tab} onChange={setTab} className="mb-4" items={[
        { value: "structures", label: "Structures" }, { value: "heads", label: "Fee heads" }, { value: "categories", label: "Fee categories" }]} />
      {tab === "structures" && <Structures />}
      {tab === "heads" && <Heads />}
      {tab === "categories" && <Categories />}
    </div>
  );
}

/* ── Structures ─────────────────────────────────────────────────────── */

function Structures() {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAccess();
  const { term } = useInstitution();
  const meta = useFeeMeta();
  const cur = meta?.currency ?? "INR";
  const sessions = useSessions();
  const [session, setSession] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const sessionId = session ?? sessions.find((s) => s.is_current)?.id ?? null;
  const p = new URLSearchParams({ page: String(page), size: "50" });
  if (sessionId) p.set("session_id", String(sessionId));
  if (q) p.set("q", q);
  const { data, loading, reload } = useFetch<Page<Structure>>(`/fees/structures?${p}`, (e) => toast.error(errMsg(e)));
  const [editing, setEditing] = useState<Structure | "new" | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [copying, setCopying] = useState<Structure | null>(null);
  const open = (s: Structure | "new") => { setFormKey((k) => k + 1); setEditing(s); };

  async function switchOff(s: Structure) {
    if (!(await confirm({ title: `Switch off ${s.name}?`, message: "Invoices already made stay. No new invoices are made from it.", confirmLabel: "Switch off", tone: "danger" }))) return;
    try { await api.delete(`/fees/structures/${s.uuid}`); toast.success("Structure switched off"); reload(); } catch (e) { toast.error(errMsg(e)); }
  }

  const columns: Column<Structure>[] = [
    { key: "name", header: "Structure", cell: (s) => <div><p className="text-ink">{s.name}</p><p className="text-[12.5px] text-muted">{s.session_name}{s.category_name ? ` · ${s.category_name}` : ""}</p></div> },
    { key: "program", header: term("program"), hideBelow: "sm", cell: (s) => <span className="text-ink/80">{s.program_name ?? `All ${term("programs").toLowerCase()}`}</span> },
    { key: "plan", header: "Plan", hideBelow: "md", cell: (s) => <span className="text-muted">{meta?.plans[s.plan] ?? s.plan} · {s.instalment_count}</span> },
    { key: "total", header: "Yearly total", align: "right", cell: (s) => <div className="text-right"><p className="tabular text-ink">{money(s.total, cur)}</p>{s.total_with_optional !== s.total && <p className="text-[12px] text-faint">{money(s.total_with_optional, cur)} with optional</p>}</div> },
    { key: "status", header: "Status", cell: (s) => <Badge tone={s.active ? "good" : "neutral"} dot>{s.active ? "Active" : "Off"}</Badge> },
  ];
  return (
    <>
      <FilterBar searchPlaceholder="Search structures" onSearchChange={(v) => { setQ(v); setPage(1); }}
        actions={<>
          <div className="w-44"><Select<number> value={sessionId} onChange={(v) => { setSession(v); setPage(1); }} options={sessions.map((s) => ({ value: s.id, label: s.name }))} placeholder={term("session")} /></div>
          {can("fees.manage") && <Button variant="primary" icon={Plus} onClick={() => open("new")}>New structure</Button>}
        </>} />
      <DataTable rows={data?.items ?? []} rowKey={(s) => s.uuid} columns={columns} loading={loading} onRowClick={(s) => can("fees.manage") && open(s)}
        rowActions={(s) => can("fees.manage") ? [
          { label: "Edit", icon: Pencil, onSelect: () => open(s) },
          { label: `Copy to other ${term("programs").toLowerCase()}`, icon: Copy, onSelect: () => setCopying(s) },
          ...(s.active ? ["separator" as const, { label: "Switch off", icon: Ban, danger: true, onSelect: () => switchOff(s) }] : []),
        ] : [{ label: "View", icon: Eye, onSelect: () => open(s) }]}
        pagination={{ page, size: 50, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={Layers} emptyTitle="No fee structures yet"
        emptyHint={`Add what each ${term("program").toLowerCase()} pays this ${term("session").toLowerCase()}, then generate invoices.`}
        emptyAction={can("fees.manage") ? <Button variant="primary" icon={Plus} onClick={() => open("new")}>New structure</Button> : undefined} />
      {editing && <StructureForm key={formKey} target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      <CopyModal key={copying?.uuid ?? "none"} source={copying} onClose={() => setCopying(null)} onDone={() => { setCopying(null); reload(); }} />
    </>
  );
}

type InstDraft = { key: number; name: string; due_date: string };
type ItemDraft = { key: number; head_id: number | null; amount: number | null; billing: "per_instalment" | "once"; instalment_no: number; optional: boolean };
let dk = 1;

function StructureForm({ target, onClose, onSaved }: { target: Structure | "new"; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const meta = useFeeMeta();
  const cur = meta?.currency ?? "INR";
  const sessions = useSessions();
  const programs = useProgramOptions();
  const heads = useHeads();
  const { data: cats } = useFetch<Page<Category>>("/fees/categories?all=true");
  const editingUuid = target === "new" ? null : target.uuid;
  const { data: full } = useFetch<Structure>(editingUuid ? `/fees/structures/${editingUuid}` : null);
  const [v, setV] = useState<{ name: string; session_id: number | null; program_id: number | null; category_id: number | null; plan: string; notes: string } | null>(
    target === "new" ? { name: "", session_id: null, program_id: null, category_id: null, plan: "quarterly", notes: "" } : null);
  const [insts, setInsts] = useState<InstDraft[]>([]);
  const [items, setItems] = useState<ItemDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(target === "new");

  // Fill the form once the full structure arrives (edit), without an effect.
  if (!loaded && full && full.uuid === editingUuid) {
    setLoaded(true);
    setV({ name: full.name, session_id: full.session_id, program_id: full.program_id, category_id: full.category_id, plan: full.plan, notes: full.notes ?? "" });
    setInsts((full.instalments ?? []).map((i) => ({ key: dk++, name: i.name, due_date: i.due_date })));
    setItems((full.items ?? []).map((it) => ({ key: dk++, head_id: it.head_id, amount: n(it.amount), billing: it.billing as ItemDraft["billing"], instalment_no: it.instalment_no ?? 1, optional: it.optional })));
  }
  const sessionId = v?.session_id ?? sessions.find((s) => s.is_current)?.id ?? null;
  const headById = useMemo(() => new Map(heads.map((h) => [h.id, h])), [heads]);
  const total = items.reduce((s, it) => s + (it.optional ? 0 : (it.amount ?? 0) * (it.billing === "per_instalment" ? insts.length : 1)), 0);
  const perInst = insts.map((_, i) => items.reduce((s, it) => s + (it.optional ? 0 : it.billing === "per_instalment" || it.instalment_no === i + 1 ? it.amount ?? 0 : 0), 0));

  async function suggest() {
    if (!v) return;
    try {
      const rows = await api.get<{ name: string; due_date: string }[]>(`/fees/structures/plan?plan=${v.plan}${sessionId ? `&session_id=${sessionId}` : ""}`);
      setInsts(rows.map((r) => ({ key: dk++, name: r.name, due_date: r.due_date })));
    } catch (e) { toast.error(errMsg(e)); }
  }

  function addHead(h: Head) {
    setItems([...items, { key: dk++, head_id: h.id, amount: null, billing: h.kind === "one_time" || h.kind === "deposit" ? "once" : "per_instalment", instalment_no: 1, optional: h.kind === "optional" }]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v) return;
    if (!v.name.trim()) { toast.error("Give the structure a name"); return; }
    if (!sessionId) { toast.error(`Pick the ${term("session").toLowerCase()}`); return; }
    if (!insts.length || insts.some((i) => !i.name.trim() || !i.due_date)) { toast.error("Each instalment needs a name and a due date"); return; }
    if (!items.length || items.some((i) => !i.head_id || i.amount === null)) { toast.error("Each fee head needs an amount"); return; }
    setSaving(true);
    try {
      const body = { name: v.name.trim(), session_id: sessionId, program_id: v.program_id, category_id: v.category_id, plan: v.plan, notes: v.notes.trim() || null,
        instalments: insts.map((i) => ({ name: i.name.trim(), due_date: i.due_date })),
        items: items.map((i) => ({ head_id: i.head_id, amount: i.amount, billing: i.billing, instalment_no: i.billing === "once" ? i.instalment_no : null, optional: i.optional })) };
      if (editingUuid) await api.put(`/fees/structures/${editingUuid}`, body); else await api.post("/fees/structures", body);
      toast.success(editingUuid ? "Structure saved" : "Structure created");
      onSaved();
    } catch (err) { toast.error("Couldn't save the structure", { description: errMsg(err) }); }
    finally { setSaving(false); }
  }

  const unused = heads.filter((h) => h.active && !items.some((i) => i.head_id === h.id) && !["LATE", "BOUNCE"].includes(h.code));
  return (
    <Modal open onClose={onClose} size="xl" busy={saving} dirty title={editingUuid ? `Edit ${target !== "new" ? target.name : ""}` : "New fee structure"}
      description="Amounts are per instalment for recurring heads, or once in a chosen instalment."
      footer={<><span className="mr-auto text-[13.5px] text-muted">Yearly total <span className="tabular text-ink">{money(total, cur)}</span></span><ModalCancel /><Button variant="primary" type="submit" form="structure-form" loading={saving}>Save structure</Button></>}>
      {!v ? <p className="py-10 text-center text-[13.5px] text-muted">Loading…</p> : (
        <form id="structure-form" onSubmit={submit} className="space-y-6">
          <FormGrid columns={3}>
            <Field label="Name" required className="sm:col-span-3"><TextInput value={v.name} onValueChange={(x) => setV({ ...v, name: x })} placeholder="e.g. Grade 5 fees 2026-27" /></Field>
            <Field label={term("session")} required><Select<number> value={sessionId} onChange={(x) => setV({ ...v, session_id: x })} options={sessions.map((s) => ({ value: s.id, label: s.name }))} /></Field>
            <Field label={term("program")} hint={`Empty = every ${term("program").toLowerCase()}`}><Select<number> value={v.program_id} onChange={(x) => setV({ ...v, program_id: x })} options={programs} clearable /></Field>
            <Field label="Fee category" hint="Empty = everyone else"><Select<number> value={v.category_id} onChange={(x) => setV({ ...v, category_id: x })} options={(cats?.items ?? []).filter((c) => c.active).map((c) => ({ value: c.id, label: c.name }))} clearable /></Field>
          </FormGrid>

          <FormSection title="Instalments" description="When the fees fall due.">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Plan" className="w-48"><Select<string> value={v.plan} onChange={(x) => setV({ ...v, plan: x || "quarterly" })} options={Object.entries(meta?.plans ?? {}).map(([value, label]) => ({ value, label }))} /></Field>
              <Button icon={Wand2} onClick={suggest}>Suggest due dates</Button>
              <Button variant="ghost" icon={Plus} onClick={() => setInsts([...insts, { key: dk++, name: `Instalment ${insts.length + 1}`, due_date: "" }])}>Add instalment</Button>
            </div>
            <div className="mt-3 space-y-2">
              {insts.length === 0 && <p className="text-[13px] text-muted">Pick a plan and suggest due dates, or add instalments yourself.</p>}
              {insts.map((i, idx) => (
                <div key={i.key} className="flex items-center gap-2">
                  <span className="w-6 text-right text-[12.5px] text-faint">{idx + 1}</span>
                  <TextInput value={i.name} onValueChange={(x) => setInsts(insts.map((y) => y.key === i.key ? { ...y, name: x } : y))} className="flex-1" aria-label="Instalment name" />
                  <div className="w-44"><DateInput value={i.due_date} onChange={(x) => setInsts(insts.map((y) => y.key === i.key ? { ...y, due_date: x } : y))} /></div>
                  <span className="hidden w-28 text-right tabular text-[13px] text-muted sm:block">{money(perInst[idx], cur)}</span>
                  <Button variant="ghost" icon={Trash2} aria-label="Remove instalment" onClick={() => setInsts(insts.filter((y) => y.key !== i.key))} />
                </div>
              ))}
            </div>
          </FormSection>

          <FormSection title="Fee heads" description="Optional heads are billed only to learners who opt in (transport, hostel …).">
            <div className="space-y-2">
              {items.map((it) => {
                const h = it.head_id ? headById.get(it.head_id) : undefined;
                return (
                  <div key={it.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-line p-2.5">
                    <div className="min-w-[160px] flex-1"><p className="text-[14px] text-ink">{h?.name ?? "Head"}</p><p className="text-[12px] text-faint">{meta?.head_kinds[h?.kind ?? ""] ?? ""}{h?.tax_rate ? ` · GST ${n(h.tax_rate)}%` : ""}</p></div>
                    <div className="w-36"><NumberInput value={it.amount} onChange={(x) => setItems(items.map((y) => y.key === it.key ? { ...y, amount: x } : y))} min={0} /></div>
                    <div className="w-44"><Select<string> value={it.billing} onChange={(x) => setItems(items.map((y) => y.key === it.key ? { ...y, billing: (x || "per_instalment") as ItemDraft["billing"] } : y))}
                      options={[{ value: "per_instalment", label: "Every instalment" }, { value: "once", label: "Once" }]} /></div>
                    {it.billing === "once" && <div className="w-40"><Select<number> value={it.instalment_no} onChange={(x) => setItems(items.map((y) => y.key === it.key ? { ...y, instalment_no: x || 1 } : y))}
                      options={insts.map((ins, i) => ({ value: i + 1, label: `In ${ins.name || `instalment ${i + 1}`}` }))} /></div>}
                    <Checkbox checked={it.optional} onChange={(x) => setItems(items.map((y) => y.key === it.key ? { ...y, optional: x } : y))} label="Optional" />
                    <Button variant="ghost" icon={Trash2} aria-label="Remove head" onClick={() => setItems(items.filter((y) => y.key !== it.key))} />
                  </div>
                );
              })}
            </div>
            {unused.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {unused.map((h) => <button key={h.id} type="button" onClick={() => addHead(h)} className="rounded-full border border-line px-2.5 py-1 text-[12.5px] text-muted transition-colors hover:border-primary/40 hover:text-primary">+ {h.name}</button>)}
              </div>
            )}
          </FormSection>
          <Field label="Notes" aside="Optional"><Textarea value={v.notes} onValueChange={(x) => setV({ ...v, notes: x })} rows={2} /></Field>
        </form>
      )}
    </Modal>
  );
}

function CopyModal({ source, onClose, onDone }: { source: Structure | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const programs = useProgramOptions();
  const sessions = useSessions();
  const [ids, setIds] = useState<number[]>([]);
  const [session, setSession] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!source || !ids.length) { toast.error(`Pick at least one ${term("program").toLowerCase()}`); return; }
    setSaving(true);
    try { const r = await api.post<{ created: number }>(`/fees/structures/${source.uuid}/copy`, { program_ids: ids, session_id: session }); toast.success(`${r.created} structures created`); onDone(); }
    catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  }
  return (
    <Modal open={!!source} onClose={onClose} size="md" busy={saving} title={`Copy ${source?.name ?? ""}`} description="Same heads, amounts and instalments. Adjust amounts afterwards if needed."
      footer={<><ModalCancel /><Button variant="primary" icon={Copy} loading={saving} onClick={submit}>Copy</Button></>}>
      <div className="space-y-4">
        <Field label={term("programs")} required><MultiSelect<number> value={ids} onChange={setIds} options={programs.filter((p) => p.value !== source?.program_id)} /></Field>
        <Field label={term("session")} hint="Leave empty for the same one; due dates move with a new session."><Select<number> value={session} onChange={setSession} options={sessions.map((s) => ({ value: s.id, label: s.name }))} clearable /></Field>
      </div>
    </Modal>
  );
}

/* ── Heads ──────────────────────────────────────────────────────────── */

function Heads() {
  const toast = useToast();
  const { can } = useAccess();
  const meta = useFeeMeta();
  const [q, setQ] = useState("");
  const { data, loading, reload } = useFetch<Page<Head>>(`/fees/heads?all=true${q ? `&q=${encodeURIComponent(q)}` : ""}`, (e) => toast.error(errMsg(e)));
  const [editing, setEditing] = useState<Head | "new" | null>(null);
  const [k, setK] = useState(0);
  const columns: Column<Head>[] = [
    { key: "name", header: "Head", cell: (h) => <div><p className="text-ink">{h.name}</p><p className="font-mono text-[12px] text-faint">{h.code}</p></div> },
    { key: "kind", header: "Type", cell: (h) => <span className="text-ink/80">{meta?.head_kinds[h.kind] ?? h.kind}</span> },
    { key: "tax", header: "GST", hideBelow: "sm", cell: (h) => <span className="text-muted">{h.tax_rate ? `${n(h.tax_rate)}%` : "—"}</span> },
    { key: "ledger", header: "Ledger account", hideBelow: "md", cell: (h) => <span className="text-muted">{h.ledger_account ?? "—"}</span> },
    { key: "status", header: "Status", cell: (h) => <Badge tone={h.active ? "good" : "neutral"} dot>{h.active ? "Active" : "Off"}</Badge> },
  ];
  return (
    <>
      <FilterBar searchPlaceholder="Search heads" onSearchChange={setQ}
        actions={can("fees.manage") ? <Button variant="primary" icon={Plus} onClick={() => { setK((x) => x + 1); setEditing("new"); }}>New head</Button> : undefined} />
      <DataTable rows={data?.items ?? []} rowKey={(h) => h.uuid} columns={columns} loading={loading}
        onRowClick={(h) => { if (can("fees.manage")) { setK((x) => x + 1); setEditing(h); } }}
        emptyIcon={Tags} emptyTitle="No fee heads" emptyHint="Heads are what you charge for: tuition, transport, exam fee …" />
      {editing && <HeadForm key={k} target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function HeadForm({ target, onClose, onSaved }: { target: Head | "new"; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const meta = useFeeMeta();
  const h = target === "new" ? null : target;
  const [v, setV] = useState({ name: h?.name ?? "", code: h?.code ?? "", kind: h?.kind ?? "recurring", tax_rate: h?.tax_rate != null ? n(h.tax_rate) : null as number | null,
    tax_code: h?.tax_code ?? "", ledger_account: h?.ledger_account ?? "", active: h?.active ?? true });
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim() || !v.code.trim()) { toast.error("Enter a name and a short code"); return; }
    setSaving(true);
    try {
      const body = { name: v.name.trim(), code: v.code.trim().toUpperCase(), kind: v.kind, tax_rate: v.tax_rate, tax_code: v.tax_code.trim() || null,
        ledger_account: v.ledger_account.trim() || null, ...(h ? { active: v.active } : {}) };
      if (h) await api.put(`/fees/heads/${h.uuid}`, body); else await api.post("/fees/heads", body);
      toast.success("Fee head saved"); onSaved();
    } catch (err) { toast.error("Couldn't save", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} title={h ? `Edit ${h.name}` : "New fee head"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="head-form" loading={saving}>Save</Button></>}>
      <form id="head-form" onSubmit={submit}>
        <FormGrid>
          <Field label="Name" required><TextInput value={v.name} onValueChange={(x) => setV({ ...v, name: x })} placeholder="e.g. Smart class fee" /></Field>
          <Field label="Code" required hint={h?.is_system ? "Built-in heads keep their code" : undefined}><TextInput value={v.code} disabled={h?.is_system} onValueChange={(x) => setV({ ...v, code: x.toUpperCase() })} className="font-mono" /></Field>
          <Field label="Type" className="sm:col-span-2"><Select<string> value={v.kind} onChange={(x) => setV({ ...v, kind: x || "recurring" })} options={Object.entries(meta?.head_kinds ?? {}).map(([value, label]) => ({ value, label }))} /></Field>
          <Field label="GST rate" aside="Optional" hint="Most tuition is exempt; leave empty for no tax."><NumberInput value={v.tax_rate} onChange={(x) => setV({ ...v, tax_rate: x })} min={0} max={100} suffix="%" /></Field>
          <Field label="HSN / SAC" aside="Optional"><TextInput value={v.tax_code} onValueChange={(x) => setV({ ...v, tax_code: x })} /></Field>
          <Field label="Ledger account" className="sm:col-span-2" hint="Where this income goes in your accounts."><TextInput value={v.ledger_account} onValueChange={(x) => setV({ ...v, ledger_account: x })} /></Field>
          {h && <div className="sm:col-span-2"><Checkbox checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="Active" /></div>}
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Categories ─────────────────────────────────────────────────────── */

function Categories() {
  const toast = useToast();
  const { can } = useAccess();
  const { term } = useInstitution();
  const { data, loading, reload } = useFetch<Page<Category>>("/fees/categories?all=true", (e) => toast.error(errMsg(e)));
  const [editing, setEditing] = useState<Category | "new" | null>(null);
  const [k, setK] = useState(0);
  const columns: Column<Category>[] = [
    { key: "name", header: "Category", cell: (c) => <div><p className="text-ink">{c.name}</p>{c.description && <p className="text-[12.5px] text-muted">{c.description}</p>}</div> },
    { key: "code", header: "Code", cell: (c) => <span className="font-mono text-[12.5px] text-muted">{c.code ?? "—"}</span> },
    { key: "status", header: "Status", cell: (c) => <Badge tone={c.active ? "good" : "neutral"} dot>{c.active ? "Active" : "Off"}</Badge> },
  ];
  return (
    <>
      <p className="mb-3 max-w-2xl text-[13.5px] text-muted">A {term("student").toLowerCase()}&apos;s fee category (on their profile) picks a structure made for that category; everyone else uses the general structure of their {term("program").toLowerCase()}.</p>
      <FilterBar actions={can("fees.manage") ? <Button variant="primary" icon={Plus} onClick={() => { setK((x) => x + 1); setEditing("new"); }}>New category</Button> : undefined} />
      <DataTable rows={data?.items ?? []} rowKey={(c) => c.uuid} columns={columns} loading={loading} onRowClick={(c) => { if (can("fees.manage")) { setK((x) => x + 1); setEditing(c); } }}
        emptyIcon={Sparkles} emptyTitle="No categories" emptyHint="For example New admission, RTE, Staff ward or NRI." />
      {editing && <CategoryForm key={k} target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function CategoryForm({ target, onClose, onSaved }: { target: Category | "new"; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const c = target === "new" ? null : target;
  const [v, setV] = useState({ name: c?.name ?? "", code: c?.code ?? "", description: c?.description ?? "", active: c?.active ?? true });
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { toast.error("Enter a name"); return; }
    setSaving(true);
    try {
      const body = { name: v.name.trim(), code: v.code.trim() || null, description: v.description.trim() || null, ...(c ? { active: v.active } : {}) };
      if (c) await api.put(`/fees/categories/${c.uuid}`, body); else await api.post("/fees/categories", body);
      toast.success("Category saved"); onSaved();
    } catch (err) { toast.error("Couldn't save", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="sm" busy={saving} title={c ? `Edit ${c.name}` : "New fee category"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="cat-form" loading={saving}>Save</Button></>}>
      <form id="cat-form" onSubmit={submit} className="space-y-4">
        <Field label="Name" required><TextInput value={v.name} onValueChange={(x) => setV({ ...v, name: x })} /></Field>
        <Field label="Code" aside="Optional"><TextInput value={v.code} onValueChange={(x) => setV({ ...v, code: x.toUpperCase() })} className="font-mono" /></Field>
        <Field label="Description" aside="Optional"><Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={2} /></Field>
        {c && <Checkbox checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="Active" />}
      </form>
    </Modal>
  );
}

