"use client";

/*
 * Concessions & scholarships: concessions given to learners (with approval status, validity
 * and the automatic sibling discount) and reusable concession types.
 */
import { useState } from "react";
import { Ban, Plus, RefreshCw, TicketPercent, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, DataTable, DateInput, Field, FilterBar, FormGrid, Modal, ModalCancel, NumberInput, RadioCards,
  Select, Tabs, TextInput, Textarea, useConfirm, type Column, type FilterValues,
} from "@/components/ui-kit";
import { type Concession, type Page, ApprovalStatus, errMsg, money, n, searchStudents, useFeeMeta, useFetch, useHeads } from "@/components/fees/shared";

type CType = { id: number; uuid: string; name: string; reason: string; kind: "percent" | "fixed"; value: number; head_id: number | null; description: string | null; active: boolean };

export default function ConcessionsPage() {
  const [tab, setTab] = useState<"given" | "types">("given");
  return (
    <div>
      <PageHeader eyebrow="Fees" title="Concessions & scholarships" description="Discounts given to learners: sibling, merit, staff ward, need-based, sports and more." />
      <Tabs value={tab} onChange={setTab} className="mb-4" items={[{ value: "given", label: "Given to learners" }, { value: "types", label: "Concession types" }]} />
      {tab === "given" ? <Given /> : <Types />}
    </div>
  );
}

const describe = (c: { kind: string; value: number | string; head?: string | null }, cur: string) =>
  `${c.kind === "percent" ? `${n(c.value)}%` : money(c.value, cur)} off ${c.head ?? "all fees"}${c.kind === "fixed" ? " per invoice" : ""}`;

function Given() {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAccess();
  const { term } = useInstitution();
  const meta = useFeeMeta();
  const cur = meta?.currency ?? "INR";
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [k, setK] = useState(0);
  const [cancelling, setCancelling] = useState<Concession | null>(null);
  const [reason, setReason] = useState("");
  const p = new URLSearchParams({ page: String(page), size: "25" });
  if (q) p.set("q", q);
  if (filters.status?.[0]) p.set("status", filters.status[0]);
  if (filters.reason?.[0]) p.set("reason", filters.reason[0]);
  const { data, loading, reload } = useFetch<Page<Concession>>(`/fees/concessions?${p}`, (e) => toast.error(errMsg(e)));

  async function recheck() {
    if (!(await confirm({ title: "Re-check the sibling rule?", message: "Every enrolled learner is checked; open invoices are updated.", confirmLabel: "Re-check" }))) return;
    try { const r = await api.post<{ sibling_concessions: number }>("/fees/concessions/apply-sibling-rule"); toast.success(`${r.sibling_concessions} sibling discounts in place`); reload(); }
    catch (e) { toast.error(errMsg(e)); }
  }
  async function doCancel() {
    if (!cancelling || reason.trim().length < 2) { toast.error("Give a reason"); return; }
    try { await api.post(`/fees/concessions/${cancelling.uuid}/cancel`, { reason: reason.trim() }); toast.success("Concession cancelled; open invoices updated"); setCancelling(null); setReason(""); reload(); }
    catch (e) { toast.error(errMsg(e)); }
  }

  const columns: Column<Concession>[] = [
    { key: "student", header: term("student"), cell: (c) => <div><p className="text-ink">{c.student_name}</p><p className="text-[12.5px] text-muted">{c.admission_no}</p></div> },
    { key: "name", header: "Concession", cell: (c) => <div><p className="text-ink/90">{c.name}{c.auto && <Badge tone="accent" className="ml-2">Automatic</Badge>}</p><p className="text-[12.5px] text-muted">{describe(c, cur)}</p></div> },
    { key: "reason", header: "Reason", hideBelow: "md", cell: (c) => <span className="text-muted">{c.reason_label}</span> },
    { key: "valid", header: "Valid", hideBelow: "lg", cell: (c) => <span className="text-muted">{c.valid_from || c.valid_to ? `${c.valid_from ? formatDate(c.valid_from) : "…"} – ${c.valid_to ? formatDate(c.valid_to) : "…"}` : "Whole session"}</span> },
    { key: "status", header: "Status", cell: (c) => <ApprovalStatus status={c.status} /> },
  ];
  return (
    <>
      <FilterBar searchPlaceholder={`Search by ${term("student").toLowerCase()} or concession`} onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={[
          { key: "status", label: "Status", options: [{ value: "approved", label: "Approved" }, { value: "pending", label: "Waiting for approval" }, { value: "rejected", label: "Rejected" }, { value: "cancelled", label: "Cancelled" }] },
          { key: "reason", label: "Reason", options: Object.entries(meta?.reasons ?? {}).map(([value, label]) => ({ value, label })) },
        ]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={can("fees.manage") ? <>
          <Button icon={RefreshCw} onClick={recheck}>Re-check sibling rule</Button>
          <Button variant="primary" icon={Plus} onClick={() => { setK((x) => x + 1); setFormOpen(true); }}>Give concession</Button>
        </> : undefined} />
      <DataTable rows={data?.items ?? []} rowKey={(c) => c.uuid} columns={columns} loading={loading}
        rowActions={(c) => can("fees.manage") && (c.status === "approved" || c.status === "pending") ? [{ label: "Cancel", icon: Ban, danger: true, onSelect: () => setCancelling(c) }] : []}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={TicketPercent} emptyTitle="No concessions yet" emptyHint="Give a concession or scholarship to a learner. It applies to their invoices once approved." />
      {formOpen && <ConcessionForm key={k} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); reload(); }} />}
      <Modal open={!!cancelling} onClose={() => setCancelling(null)} size="sm" title="Cancel this concession?" description="Open invoices go back to the full amount. Paid invoices are not changed."
        footer={<><ModalCancel>Back</ModalCancel><Button variant="danger" onClick={doCancel}>Cancel concession</Button></>}>
        <Field label="Reason" required><Textarea value={reason} onValueChange={setReason} rows={2} /></Field>
      </Modal>
    </>
  );
}

function ConcessionForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const meta = useFeeMeta();
  const heads = useHeads();
  const { data: types } = useFetch<Page<CType>>("/fees/concession-types?all=true&active=true");
  const [student, setStudent] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [v, setV] = useState({ name: "", reason: "merit", kind: "percent" as "percent" | "fixed", value: null as number | null, head_id: null as number | null, valid_from: "", valid_to: "", notes: "" });
  const [saving, setSaving] = useState(false);
  function pickType(id: number | null) {
    setTypeId(id);
    const t = types?.items.find((x) => x.id === id);
    if (t) setV({ ...v, name: t.name, reason: t.reason, kind: t.kind, value: n(t.value), head_id: t.head_id });
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!student || !v.value) { toast.error("Pick the learner and enter the concession"); return; }
    setSaving(true);
    try {
      const c = await api.post<Concession>("/fees/concessions", { student_uuid: student, type_id: typeId, name: v.name.trim() || null, reason: v.reason, kind: v.kind, value: v.value,
        head_id: v.head_id, valid_from: v.valid_from || null, valid_to: v.valid_to || null, notes: v.notes.trim() || null });
      toast.success(c.status === "approved" ? "Concession applied" : "Concession sent for approval");
      onSaved();
    } catch (err) { toast.error("Couldn't save the concession", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} dirty={!!student} title="Give a concession"
      description={meta?.concession_approval ? "It goes for approval first, then applies to open and future invoices." : "It applies to open and future invoices straight away."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="conc-form" loading={saving}>Save</Button></>}>
      <form id="conc-form" onSubmit={submit} className="space-y-4">
        <Field label={term("student")} required><Select<string> value={student} onChange={setStudent} loadOptions={searchStudents} placeholder="Search" /></Field>
        <Field label="Concession type" aside="Optional"><Select<number> value={typeId} onChange={pickType} clearable options={(types?.items ?? []).map((t) => ({ value: t.id, label: t.name }))} placeholder="Custom" /></Field>
        <FormGrid>
          <Field label="Name"><TextInput value={v.name} onValueChange={(x) => setV({ ...v, name: x })} placeholder="e.g. Merit scholarship" /></Field>
          <Field label="Reason"><Select<string> value={v.reason} onChange={(x) => setV({ ...v, reason: x || "other" })} options={Object.entries(meta?.reasons ?? {}).map(([value, label]) => ({ value, label }))} /></Field>
        </FormGrid>
        <RadioCards<"percent" | "fixed"> value={v.kind} onChange={(x) => setV({ ...v, kind: x })} options={[
          { value: "percent", label: "Percentage", description: "Of each fee line" }, { value: "fixed", label: "Fixed amount", description: "Off each invoice" }]} />
        <FormGrid>
          <Field label={v.kind === "percent" ? "Percent" : "Amount"} required><NumberInput value={v.value} onChange={(x) => setV({ ...v, value: x })} min={0} max={v.kind === "percent" ? 100 : undefined} suffix={v.kind === "percent" ? "%" : undefined} /></Field>
          <Field label="On fee head" hint="Empty = all fees"><Select<number> value={v.head_id} onChange={(x) => setV({ ...v, head_id: x })} clearable options={heads.filter((h) => h.active).map((h) => ({ value: h.id, label: h.name }))} /></Field>
          <Field label="Valid from" aside="Optional"><DateInput value={v.valid_from} onChange={(x) => setV({ ...v, valid_from: x })} clearable /></Field>
          <Field label="Valid until" aside="Optional"><DateInput value={v.valid_to} onChange={(x) => setV({ ...v, valid_to: x })} clearable /></Field>
        </FormGrid>
        <Field label="Note" aside="Optional"><Textarea value={v.notes} onValueChange={(x) => setV({ ...v, notes: x })} rows={2} /></Field>
      </form>
    </Modal>
  );
}

function Types() {
  const toast = useToast();
  const { can } = useAccess();
  const meta = useFeeMeta();
  const cur = meta?.currency ?? "INR";
  const heads = useHeads();
  const { data, loading, reload } = useFetch<Page<CType>>("/fees/concession-types?all=true", (e) => toast.error(errMsg(e)));
  const [editing, setEditing] = useState<CType | "new" | null>(null);
  const [k, setK] = useState(0);
  const headName = (id: number | null) => heads.find((h) => h.id === id)?.name ?? null;
  const columns: Column<CType>[] = [
    { key: "name", header: "Type", cell: (t) => <p className="text-ink">{t.name}</p> },
    { key: "what", header: "Gives", cell: (t) => <span className="text-muted">{describe({ ...t, head: headName(t.head_id) }, cur)}</span> },
    { key: "reason", header: "Reason", hideBelow: "md", cell: (t) => <span className="text-muted">{meta?.reasons[t.reason] ?? t.reason}</span> },
    { key: "status", header: "Status", cell: (t) => <Badge tone={t.active ? "good" : "neutral"} dot>{t.active ? "Active" : "Off"}</Badge> },
  ];
  return (
    <>
      <FilterBar actions={can("fees.manage") ? <Button variant="primary" icon={Plus} onClick={() => { setK((x) => x + 1); setEditing("new"); }}>New type</Button> : undefined} />
      <DataTable rows={data?.items ?? []} rowKey={(t) => t.uuid} columns={columns} loading={loading} onRowClick={(t) => { if (can("fees.manage")) { setK((x) => x + 1); setEditing(t); } }}
        emptyIcon={Users} emptyTitle="No concession types" emptyHint="Save the concessions you give often, such as a merit scholarship." />
      {editing && <TypeForm key={k} target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </>
  );
}

function TypeForm({ target, onClose, onSaved }: { target: CType | "new"; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const meta = useFeeMeta();
  const heads = useHeads();
  const t = target === "new" ? null : target;
  const [v, setV] = useState({ name: t?.name ?? "", reason: t?.reason ?? "merit", kind: t?.kind ?? "percent", value: t ? n(t.value) : null as number | null, head_id: t?.head_id ?? null, active: t?.active ?? true });
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim() || !v.value) { toast.error("Enter a name and the amount"); return; }
    setSaving(true);
    try {
      const body = { name: v.name.trim(), reason: v.reason, kind: v.kind, value: v.value, head_id: v.head_id, ...(t ? { active: v.active } : {}) };
      if (t) await api.put(`/fees/concession-types/${t.uuid}`, body); else await api.post("/fees/concession-types", body);
      toast.success("Saved"); onSaved();
    } catch (err) { toast.error("Couldn't save", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} title={t ? `Edit ${t.name}` : "New concession type"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="ctype-form" loading={saving}>Save</Button></>}>
      <form id="ctype-form" onSubmit={submit}>
        <FormGrid>
          <Field label="Name" required><TextInput value={v.name} onValueChange={(x) => setV({ ...v, name: x })} /></Field>
          <Field label="Reason"><Select<string> value={v.reason} onChange={(x) => setV({ ...v, reason: x || "other" })} options={Object.entries(meta?.reasons ?? {}).map(([value, label]) => ({ value, label }))} /></Field>
          <Field label="Kind"><Select<string> value={v.kind} onChange={(x) => setV({ ...v, kind: (x as "percent" | "fixed") || "percent" })} options={[{ value: "percent", label: "Percentage" }, { value: "fixed", label: "Fixed amount per invoice" }]} /></Field>
          <Field label="Value" required><NumberInput value={v.value} onChange={(x) => setV({ ...v, value: x })} min={0} /></Field>
          <Field label="On fee head" hint="Empty = all fees" className="sm:col-span-2"><Select<number> value={v.head_id} onChange={(x) => setV({ ...v, head_id: x })} clearable options={heads.filter((h) => h.active).map((h) => ({ value: h.id, label: h.name }))} /></Field>
          {t && <div className="sm:col-span-2"><Checkbox checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="Active" /></div>}
        </FormGrid>
      </form>
    </Modal>
  );
}
