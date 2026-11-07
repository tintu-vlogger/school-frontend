"use client";

/*
 * Cash book: other income and expenses with categories, payee/payer and attachments, next to
 * the fee collection and refunds of the same period, for a simple view of money in and out.
 */
import { useState } from "react";
import { Ban, Landmark, Paperclip, Pencil, Plus, Settings2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { formatDate, todayISO } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateInput, DateRangeInput, Field, FileDrop, FilterBar, FormGrid, Modal, ModalCancel, NumberInput,
  RadioCards, Select, StatCard, StatGrid, TextInput, Textarea, type Column, type FilterValues,
} from "@/components/ui-kit";
import { type Money, type Page, errMsg, money, n, useFeeMeta, useFetch } from "@/components/fees/shared";

type Attachment = { uuid: string; name: string; size: number; url: string; download_url: string };
type Entry = {
  id: number; uuid: string; number: string | null; kind: "income" | "expense"; category_id: number | null; category: string | null;
  entry_date: string; amount: Money; mode: string; reference: string | null; party: string | null; description: string | null;
  attachments: Attachment[]; status: string; cancel_reason: string | null; created_by_name: string | null; created_at: string;
};
type Ledger = Page<Entry> & { totals: { fee_collection: Money; other_income: Money; expenses: Money; refunds: Money; net: Money }; from: string; to: string;
  by_category: { kind: string; category: string; amount: Money }[] };
type Cat = { id: number; uuid: string; kind: string; name: string; active: boolean };

export default function LedgerPage() {
  const toast = useToast();
  const { can } = useAccess();
  const meta = useFeeMeta();
  const cur = meta?.currency ?? "INR";
  const today = todayISO();
  const [range, setRange] = useState({ from: today.slice(0, 8) + "01", to: today });
  const [filters, setFilters] = useState<FilterValues>({});
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const p = new URLSearchParams({ page: String(page), size: "25" });
  if (range.from) p.set("from", range.from);
  if (range.to) p.set("to", range.to);
  if (filters.kind?.[0]) p.set("kind", filters.kind[0]);
  if (q) p.set("q", q);
  const { data, loading, reload } = useFetch<Ledger>(`/fees/ledger?${p}`, (e) => toast.error(errMsg(e)));
  const [editing, setEditing] = useState<Entry | "income" | "expense" | null>(null);
  const [k, setK] = useState(0);
  const [cancelling, setCancelling] = useState<Entry | null>(null);
  const [reason, setReason] = useState("");
  const [catsOpen, setCatsOpen] = useState(false);
  const open = (e: Entry | "income" | "expense") => { setK((x) => x + 1); setEditing(e); };

  async function doCancel() {
    if (!cancelling || reason.trim().length < 2) { toast.error("Give a reason"); return; }
    try { await api.post(`/fees/ledger/${cancelling.uuid}/cancel`, { reason: reason.trim() }); toast.success("Entry cancelled"); setCancelling(null); setReason(""); reload(); }
    catch (e) { toast.error(errMsg(e)); }
  }

  const columns: Column<Entry>[] = [
    { key: "date", header: "Date", cell: (e) => <div><p className="text-ink">{formatDate(e.entry_date)}</p><p className="font-mono text-[12px] text-faint">{e.number}</p></div> },
    { key: "what", header: "Details", cell: (e) => <div className="min-w-0"><p className="truncate text-ink/90">{e.party || e.description || "—"}{e.attachments.length > 0 && <Paperclip size={12} strokeWidth={1.4} className="ml-1 inline text-faint" />}</p><p className="truncate text-[12.5px] text-muted">{[e.category, e.party ? e.description : null].filter(Boolean).join(" · ")}</p></div> },
    { key: "mode", header: "Mode", hideBelow: "md", cell: (e) => <span className="text-muted">{meta?.modes[e.mode] ?? e.mode}</span> },
    { key: "amount", header: "Amount", align: "right", cell: (e) => <span className={`tabular ${e.status !== "active" ? "text-faint line-through" : e.kind === "income" ? "text-emerald-700" : "text-ink"}`}>{e.kind === "income" ? "+" : "−"}{money(e.amount, cur)}</span> },
    { key: "status", header: "", cell: (e) => e.status !== "active" ? <Badge>Cancelled</Badge> : <Badge tone={e.kind === "income" ? "good" : "neutral"}>{e.kind === "income" ? "Income" : "Expense"}</Badge> },
  ];
  const t = data?.totals;
  return (
    <div>
      <PageHeader eyebrow="Fees" title="Expenses & income" description="A simple cash book: other income and expenses beside the fees collected."
        actions={can("fees.manage") ? <>
          <Button icon={Settings2} onClick={() => setCatsOpen(true)}>Categories</Button>
          <Button icon={Plus} onClick={() => open("income")}>Income</Button>
          <Button variant="primary" icon={Plus} onClick={() => open("expense")}>Expense</Button>
        </> : undefined} />
      <StatGrid className="mb-5">
        <StatCard label="Fees collected" value={money(t?.fee_collection ?? 0, cur)} />
        <StatCard label="Other income" value={money(t?.other_income ?? 0, cur)} />
        <StatCard label="Expenses and refunds" value={money(n(t?.expenses) + n(t?.refunds), cur)} hint={t && n(t.refunds) ? `incl. ${money(t.refunds, cur)} refunds` : undefined} />
        <StatCard label="Net" value={money(t?.net ?? 0, cur)} />
      </StatGrid>
      <FilterBar searchPlaceholder="Search payee, payer or details" onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={[{ key: "kind", label: "Kind", options: [{ value: "income", label: "Income" }, { value: "expense", label: "Expenses" }] }]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={<div className="w-64"><DateRangeInput value={range} onChange={(r) => { setRange(r); setPage(1); }} /></div>} />
      <div className="grid gap-5 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <DataTable rows={data?.items ?? []} rowKey={(e) => e.uuid} columns={columns} loading={loading}
            onRowClick={(e) => { if (can("fees.manage") && e.status === "active") open(e); }}
            rowActions={(e) => can("fees.manage") && e.status === "active" ? [
              { label: "Edit", icon: Pencil, onSelect: () => open(e) },
              ...e.attachments.map((a) => ({ label: `Open ${a.name}`, icon: Paperclip, onSelect: () => window.open(a.url, "_blank", "noopener") })),
              "separator" as const, { label: "Cancel entry", icon: Ban, danger: true, onSelect: () => setCancelling(e) },
            ] : e.attachments.map((a) => ({ label: `Open ${a.name}`, icon: Paperclip, onSelect: () => window.open(a.url, "_blank", "noopener") }))}
            pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
            emptyIcon={Landmark} emptyTitle="Nothing in this period" emptyHint="Record expenses such as electricity or repairs, and income such as donations or hall rent." />
        </div>
        <Paper className="h-fit">
          <PaperHeader title="By category" />
          <ul className="divide-y divide-line text-[13.5px]">
            {(data?.by_category ?? []).length === 0 && <li className="px-5 py-6 text-center text-muted">No entries.</li>}
            {(data?.by_category ?? []).sort((a, b) => n(b.amount) - n(a.amount)).map((c) => (
              <li key={c.kind + c.category} className="flex justify-between px-5 py-2.5">
                <span className="text-ink/80">{c.category}</span><span className={`tabular ${c.kind === "income" ? "text-emerald-700" : "text-ink"}`}>{money(c.amount, cur)}</span>
              </li>
            ))}
          </ul>
        </Paper>
      </div>
      {editing && <EntryForm key={k} target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
      <Modal open={!!cancelling} onClose={() => setCancelling(null)} size="sm" title="Cancel this entry?" description="It stays on record as cancelled and leaves the totals."
        footer={<><ModalCancel>Back</ModalCancel><Button variant="danger" onClick={doCancel}>Cancel entry</Button></>}>
        <Field label="Reason" required><Textarea value={reason} onValueChange={setReason} rows={2} /></Field>
      </Modal>
      {catsOpen && <CategoriesModal onClose={() => setCatsOpen(false)} />}
    </div>
  );
}

async function upload(file: File): Promise<string> {
  const { API_BASE } = await import("@/lib/api");
  const token = localStorage.getItem("hrms_token");
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE}/documents/uploads`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  if (!res.ok) throw new Error("Upload failed");
  return (await res.json()).uuid as string;
}

function EntryForm({ target, onClose, onSaved }: { target: Entry | "income" | "expense"; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const meta = useFeeMeta();
  const e = typeof target === "string" ? null : target;
  const { data: cats } = useFetch<Page<Cat>>("/fees/ledger-categories?all=true&active=true");
  const [v, setV] = useState({
    kind: e?.kind ?? (target as "income" | "expense"), category_id: e?.category_id ?? null, entry_date: e?.entry_date ?? todayISO(), amount: e ? n(e.amount) : null as number | null,
    mode: e?.mode ?? "cash", reference: e?.reference ?? "", party: e?.party ?? "", description: e?.description ?? "",
  });
  const [kept, setKept] = useState<Attachment[]>(e?.attachments ?? []);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!v.amount) { toast.error("Enter the amount"); return; }
    setSaving(true);
    try {
      const uploaded = await Promise.all(files.map(upload));
      const body = { ...v, reference: v.reference.trim() || null, party: v.party.trim() || null, description: v.description.trim() || null,
        attachments: [...kept.map((a) => a.uuid), ...uploaded] };
      if (e) await api.put(`/fees/ledger/${e.uuid}`, body); else await api.post("/fees/ledger", body);
      toast.success("Saved"); onSaved();
    } catch (err) { toast.error("Couldn't save", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} dirty title={e ? `Edit ${e.number}` : v.kind === "income" ? "Record income" : "Record an expense"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="ledger-form" loading={saving}>Save</Button></>}>
      <form id="ledger-form" onSubmit={submit} className="space-y-4">
        <RadioCards<"income" | "expense"> value={v.kind} onChange={(x) => setV({ ...v, kind: x, category_id: null })} options={[{ value: "expense", label: "Expense" }, { value: "income", label: "Income" }]} />
        <FormGrid>
          <Field label="Amount" required><NumberInput value={v.amount} onChange={(x) => setV({ ...v, amount: x })} min={0} /></Field>
          <Field label="Date" required><DateInput value={v.entry_date} onChange={(x) => setV({ ...v, entry_date: x })} max={todayISO()} /></Field>
          <Field label="Category"><Select<number> value={v.category_id} onChange={(x) => setV({ ...v, category_id: x })} clearable options={(cats?.items ?? []).filter((c) => c.kind === v.kind).map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="Mode"><Select<string> value={v.mode} onChange={(x) => setV({ ...v, mode: x || "cash" })} options={Object.entries(meta?.modes ?? {}).map(([value, label]) => ({ value, label }))} /></Field>
          <Field label={v.kind === "income" ? "Received from" : "Paid to"}><TextInput value={v.party} onValueChange={(x) => setV({ ...v, party: x })} placeholder={v.kind === "income" ? "Payer" : "Vendor"} /></Field>
          <Field label="Reference" aside="Optional"><TextInput value={v.reference} onValueChange={(x) => setV({ ...v, reference: x })} placeholder="Bill or cheque no." /></Field>
        </FormGrid>
        <Field label="Details" aside="Optional"><Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={2} /></Field>
        {kept.length > 0 && (
          <ul className="space-y-1 text-[13px]">{kept.map((a) => (
            <li key={a.uuid} className="flex items-center justify-between rounded-lg border border-line px-3 py-1.5">
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="truncate text-primary">{a.name}</a>
              <Button size="sm" variant="ghost" icon={Trash2} aria-label="Remove" onClick={() => setKept(kept.filter((x) => x.uuid !== a.uuid))} />
            </li>))}</ul>
        )}
        <FileDrop value={files} onChange={setFiles} multiple maxSizeMb={10} accept="image/*,.pdf" title="Attach the bill or receipt" />
      </form>
    </Modal>
  );
}

function CategoriesModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { data, reload } = useFetch<Page<Cat>>("/fees/ledger-categories?all=true");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [name, setName] = useState("");
  async function add() {
    if (!name.trim()) return;
    try { await api.post("/fees/ledger-categories", { kind, name: name.trim() }); setName(""); reload(); } catch (e) { toast.error(errMsg(e)); }
  }
  async function toggle(c: Cat) {
    try { await api.put(`/fees/ledger-categories/${c.uuid}`, { active: !c.active }); reload(); } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <Modal open onClose={onClose} size="md" title="Cash book categories" footer={<ModalCancel>Done</ModalCancel>}>
      <div className="mb-4 flex items-end gap-2">
        <Field label="Kind" className="w-36"><Select<string> value={kind} onChange={(x) => setKind((x as "expense" | "income") || "expense")} options={[{ value: "expense", label: "Expense" }, { value: "income", label: "Income" }]} /></Field>
        <Field label="New category" className="flex-1"><TextInput value={name} onValueChange={setName} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} /></Field>
        <Button icon={Plus} onClick={add}>Add</Button>
      </div>
      {(["expense", "income"] as const).map((kd) => (
        <div key={kd} className="mb-4">
          <p className="mb-1.5 text-[12px] uppercase tracking-[0.08em] text-faint">{kd === "expense" ? "Expenses" : "Income"}</p>
          <div className="flex flex-wrap gap-1.5">
            {(data?.items ?? []).filter((c) => c.kind === kd).map((c) => (
              <button key={c.uuid} type="button" onClick={() => toggle(c)} title={c.active ? "Click to switch off" : "Click to switch on"}
                className={`rounded-full border px-2.5 py-1 text-[12.5px] ${c.active ? "border-line text-ink/80" : "border-dashed border-line text-faint line-through"}`}>{c.name}</button>
            ))}
          </div>
        </div>
      ))}
    </Modal>
  );
}
