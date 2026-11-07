"use client";

/*
 * Hostel > Visitors: who came to see which boarder, with time in and out (log in a modal,
 * one click to mark them out). Hostel > Settings: mess plans with their fee.
 */
import { useState } from "react";
import { LogOut, Pencil, Plus, UsersRound, Utensils } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, formatTime, todayISO } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, Modal, ModalCancel, NumberInput, Select, TextInput,
  Textarea, Toggle, type Column, type FilterValues,
} from "@/components/ui-kit";
import { errText, money, searchStudents, useApiData, type Paged } from "@/components/transport/common";
import type { HostelVisitor, MessPlan } from "./types";

export function VisitorsTab({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [q, setQ] = useState("");
  const [day, setDay] = useState(todayISO());
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const inside = filters.where?.[0] === "inside";
  const { data, loading, reload } = useApiData<Paged<HostelVisitor>>(
    `/hostel/visitors?page=${page}&size=25&q=${encodeURIComponent(q)}${inside ? "&inside=true" : day ? `&day=${day}` : ""}`);
  const [form, setForm] = useState({ open: false, key: 0 });

  async function out(v: HostelVisitor) {
    try { await api.post(`/hostel/visitors/${v.uuid}/out`); toast.success(`${v.name} signed out`); reload(); }
    catch (e) { toast.error("Couldn't sign out", { description: errText(e) }); }
  }

  const columns: Column<HostelVisitor>[] = [
    { key: "name", header: "Visitor", cell: (v) => <div><p className="text-ink">{v.name}</p><p className="text-[12.5px] text-muted">{[v.relation, v.phone].filter(Boolean).join(" · ")}</p></div> },
    { key: "student", header: "Visiting", cell: (v) => v.student_name ? <span className="text-ink/80">{v.student_name}</span> : <span className="text-faint">—</span> },
    { key: "purpose", header: "Purpose", hideBelow: "md", cell: (v) => <span className="text-muted">{v.purpose || "—"}</span> },
    { key: "in", header: "In", cell: (v) => <span className="tabular text-ink/80">{formatDateTime(v.in_at)}</span> },
    { key: "out", header: "Out", cell: (v) => v.out_at ? <span className="tabular text-muted">{formatTime(v.out_at)}</span> : <Badge tone="info" dot>Inside</Badge> },
  ];

  return (
    <div>
      <FilterBar searchPlaceholder="Search visitors" onSearchChange={(x) => { setQ(x); setPage(1); }}
        filters={[{ key: "where", label: "Show", options: [{ value: "inside", label: "Inside now" }] }]} values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={<div className="flex items-center gap-2">
          {!inside && <div className="w-40"><DateInput value={day} onChange={(x) => { setDay(x); setPage(1); }} clearable max={todayISO()} /></div>}
          {canManage && <Button variant="primary" icon={Plus} onClick={() => setForm((f) => ({ open: true, key: f.key + 1 }))}>Log visitor</Button>}
        </div>} />
      <DataTable rows={data?.items ?? []} rowKey={(v) => v.uuid} columns={columns} loading={loading}
        rowActions={(v) => canManage && !v.out_at ? [{ label: "Sign out", icon: LogOut, onSelect: () => out(v) }] : []}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={UsersRound} emptyTitle="No visitors" emptyHint={`Log parents and relatives who visit ${term("students").toLowerCase()} in the hostel.`} />
      <VisitorForm key={form.key} open={form.open} onClose={() => setForm((f) => ({ ...f, open: false }))} onSaved={() => { setForm((f) => ({ ...f, open: false })); reload(); }} />
    </div>
  );
}

function VisitorForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ student_id: null as number | null, name: "", relation: "", phone: "", id_proof: "", purpose: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((p) => ({ ...p, [k]: x }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setErr("Enter the visitor's name"); return; }
    setSaving(true);
    const blank = (s: string) => s.trim() || null;
    try {
      await api.post("/hostel/visitors", { student_id: v.student_id, name: v.name.trim(), relation: blank(v.relation), phone: blank(v.phone),
        id_proof: blank(v.id_proof), purpose: blank(v.purpose) });
      toast.success("Visitor logged");
      onSaved();
    } catch (e2) { setErr(errText(e2)); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title="Log a visitor"
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="hvisitor-form" loading={saving}>Log visitor</Button></>}>
      <form id="hvisitor-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Visiting boarder" className="sm:col-span-2"><Select value={v.student_id} onChange={(x) => set("student_id", x)} loadOptions={searchStudents} clearable placeholder="Search boarders" /></Field>
          <Field label="Visitor name" required error={err}><TextInput autoFocusInModal value={v.name} onValueChange={(x) => { set("name", x); setErr(""); }} /></Field>
          <Field label="Relation"><TextInput value={v.relation} onValueChange={(x) => set("relation", x)} placeholder="Mother, uncle …" /></Field>
          <Field label="Phone"><TextInput type="tel" value={v.phone} onValueChange={(x) => set("phone", x)} /></Field>
          <Field label="ID proof"><TextInput value={v.id_proof} onValueChange={(x) => set("id_proof", x)} placeholder="Aadhaar, licence …" /></Field>
          <Field label="Purpose" className="sm:col-span-2"><TextInput value={v.purpose} onValueChange={(x) => set("purpose", x)} placeholder="Weekend visit" /></Field>
          {err && err !== "Enter the visitor's name" && <p className="sm:col-span-2 text-[13px] text-rose-700">{err}</p>}
        </FormGrid>
      </form>
    </Modal>
  );
}

export function HostelSettingsTab({ canManage }: { canManage: boolean }) {
  const { data, loading, reload } = useApiData<Paged<MessPlan>>("/hostel/mess-plans?all=true");
  const [form, setForm] = useState<{ open: boolean; target: MessPlan | null; key: number }>({ open: false, target: null, key: 0 });
  const openForm = (m: MessPlan | null) => setForm((f) => ({ open: true, target: m, key: f.key + 1 }));
  const cols: Column<MessPlan>[] = [
    { key: "name", header: "Mess plan", cell: (m) => <div><p className="text-ink">{m.name}</p>{m.description && <p className="text-[12.5px] text-muted">{m.description}</p>}</div> },
    { key: "fee", header: "Fee per year", align: "right", cell: (m) => <span className="tabular">{money(m.fee)}</span> },
    { key: "status", header: "Status", cell: (m) => <Badge tone={m.active ? "good" : "neutral"} dot>{m.active ? "Offered" : "Off"}</Badge> },
  ];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h3 className="text-[15px] text-ink">Mess plans</h3><p className="text-[13px] text-muted">Optional meal plans boarders can pick; the fee is added to the hostel fee.</p></div>
        {canManage && <Button size="sm" icon={Plus} onClick={() => openForm(null)}>Add plan</Button>}
      </div>
      <DataTable rows={data?.items ?? []} rowKey={(m) => m.uuid} columns={cols} loading={loading} onRowClick={canManage ? openForm : undefined}
        rowActions={(m) => canManage ? [{ label: "Edit", icon: Pencil, onSelect: () => openForm(m) }] : []}
        emptyIcon={Utensils} emptyTitle="No mess plans" emptyHint="Add plans such as Vegetarian or Non-vegetarian if the hostel runs a mess." />
      <MessForm key={form.key} open={form.open} target={form.target} onClose={() => setForm((f) => ({ ...f, open: false }))} onSaved={() => { setForm((f) => ({ ...f, open: false })); reload(); }} />
    </div>
  );
}

function MessForm({ open, target, onClose, onSaved }: { open: boolean; target: MessPlan | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(target?.name ?? "");
  const [fee, setFee] = useState<number | null>(target ? Number(target.fee) : null);
  const [desc, setDesc] = useState(target?.description ?? "");
  const [active, setActive] = useState(target?.active ?? true);
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const payload = { name: name.trim(), fee: fee ?? 0, description: desc.trim() || null, active };
    try {
      if (target) await api.put(`/hostel/mess-plans/${target.uuid}`, payload); else await api.post("/hostel/mess-plans", payload);
      toast.success("Mess plan saved");
      onSaved();
    } catch (e2) { toast.error("Couldn't save", { description: errText(e2) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" busy={saving} title={target ? `Edit ${target.name}` : "Add mess plan"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="mess-form" loading={saving} disabled={!name.trim()}>Save</Button></>}>
      <form id="mess-form" onSubmit={submit} noValidate>
        <FormGrid columns={1}>
          <Field label="Name" required><TextInput autoFocusInModal value={name} onValueChange={setName} placeholder="Vegetarian" /></Field>
          <Field label="Fee per year"><NumberInput value={fee} onChange={setFee} min={0} step={1000} suffix="₹" /></Field>
          <Field label="Description" aside="Optional"><Textarea value={desc} onValueChange={setDesc} rows={2} /></Field>
          {target && <Toggle checked={active} onChange={setActive} label="Offered" />}
        </FormGrid>
      </form>
    </Modal>
  );
}
