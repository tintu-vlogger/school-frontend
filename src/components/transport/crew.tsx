"use client";

/*
 * Transport > Drivers & attendants: list with licence expiry, add / edit in a modal with an
 * optional link to a staff record (name and phone come from it when left empty).
 */
import { useState } from "react";
import { Ban, Pencil, Phone, Plus, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, Modal, ModalCancel, Select, TextInput, Textarea,
  useConfirm, type Column, type FilterValues,
} from "@/components/ui-kit";
import { errText, PersonLine, searchStaff, useApiData, type Paged } from "./common";
import { ExpiryBadge } from "./vehicles";
import type { Crew } from "./types";

export function CrewTab({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const kind = filters.kind?.[0] ?? "";
  const { data, loading, reload } = useApiData<Paged<Crew>>(`/transport/crew?page=${page}&size=25&q=${encodeURIComponent(q)}${kind ? `&kind=${kind}` : ""}`);
  const [form, setForm] = useState<{ open: boolean; target: Crew | null; key: number }>({ open: false, target: null, key: 0 });
  const openForm = (c: Crew | null) => setForm((f) => ({ open: true, target: c, key: f.key + 1 }));

  async function switchOff(c: Crew) {
    if (!(await confirm({ title: `Switch off ${c.name}?`, message: "They will no longer be offered for routes.", confirmLabel: "Switch off", tone: "danger" }))) return;
    try { await api.delete(`/transport/crew/${c.uuid}`); toast.success("Switched off"); reload(); }
    catch (e) { toast.error("Couldn't switch off", { description: errText(e) }); }
  }

  const columns: Column<Crew>[] = [
    { key: "name", header: "Name", cell: (c) => <PersonLine name={c.name} photo={c.photo_url} detail={c.employee_name ? "Staff member" : c.badge_no ? `Badge ${c.badge_no}` : null} /> },
    { key: "kind", header: "Role", cell: (c) => <Badge tone={c.kind === "driver" ? "accent" : "info"}>{c.kind === "driver" ? "Driver" : "Attendant"}</Badge> },
    { key: "phone", header: "Phone", hideBelow: "sm", cell: (c) => c.phone ? <a href={`tel:${c.phone}`} onClick={(e) => e.stopPropagation()} className="tabular text-ink/80 hover:text-primary">{c.phone}</a> : <span className="text-faint">—</span> },
    { key: "licence", header: "Licence", hideBelow: "md", cell: (c) => c.licence_no ? <span className="font-mono text-[12.5px] text-muted">{c.licence_no}</span> : <span className="text-faint">—</span> },
    { key: "expiry", header: "Licence valid till", cell: (c) => <ExpiryBadge state={c.licence_state} date={c.licence_expiry} /> },
  ];

  return (
    <div>
      <FilterBar searchPlaceholder="Search name, phone or licence" onSearchChange={(x) => { setQ(x); setPage(1); }}
        filters={[{ key: "kind", label: "Role", options: [{ value: "driver", label: "Drivers" }, { value: "attendant", label: "Attendants" }] }]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={canManage ? <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>Add person</Button> : undefined} />
      <DataTable rows={data?.items ?? []} rowKey={(c) => c.uuid} columns={columns} loading={loading}
        onRowClick={canManage ? openForm : undefined}
        rowActions={(c) => [
          ...(c.phone ? [{ label: "Call", icon: Phone, onSelect: () => { window.location.href = `tel:${c.phone}`; } }] : []),
          ...(canManage ? [{ label: "Edit", icon: Pencil, onSelect: () => openForm(c) }, "separator" as const, { label: "Switch off", icon: Ban, danger: true, onSelect: () => switchOff(c) }] : []),
        ]}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={UserRound} emptyTitle="No drivers or attendants yet" emptyHint="Add the people who drive and look after each route."
        emptyAction={canManage && <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>Add person</Button>} />
      <CrewForm key={form.key} open={form.open} target={form.target} onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={() => { setForm((f) => ({ ...f, open: false })); reload(); }} />
    </div>
  );
}

function CrewForm({ open, target, onClose, onSaved }: { open: boolean; target: Crew | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const initial = {
    kind: target?.kind ?? "driver", employee_id: target?.employee_id ?? null as number | null, name: target?.name ?? "",
    phone: target?.phone ?? "", licence_no: target?.licence_no ?? "", licence_expiry: target?.licence_expiry ?? "",
    badge_no: target?.badge_no ?? "", notes: target?.notes ?? "",
  };
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof initial>(k: K, x: (typeof initial)[K]) => setV((p) => ({ ...p, [k]: x }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim() && !v.employee_id) { setErr("Enter a name or pick a staff member"); return; }
    setSaving(true);
    const blank = (s: string) => s.trim() || null;
    const payload = { kind: v.kind, employee_id: v.employee_id, name: blank(v.name), phone: blank(v.phone), licence_no: blank(v.licence_no),
      licence_expiry: v.licence_expiry || null, badge_no: blank(v.badge_no), notes: blank(v.notes) };
    try {
      if (target) await api.put(`/transport/crew/${target.uuid}`, payload);
      else await api.post("/transport/crew", payload);
      toast.success(target ? "Saved" : "Added");
      onSaved();
    } catch (e2) { toast.error("Couldn't save", { description: errText(e2) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(initial)}
      title={target ? `Edit ${target.name}` : "Add driver or attendant"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="crew-form" loading={saving}>{target ? "Save changes" : "Add"}</Button></>}>
      <form id="crew-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Role">
            <Select value={v.kind} onChange={(x) => set("kind", (x as "driver" | "attendant") || "driver")} options={[{ value: "driver", label: "Driver" }, { value: "attendant", label: "Attendant" }]} />
          </Field>
          <Field label="Staff record" aside="Optional" hint="Link when they are on the staff list">
            <Select value={v.employee_id} onChange={(x, opt) => { set("employee_id", x); if (opt && !v.name) set("name", opt.label); }} loadOptions={searchStaff} clearable placeholder="Search staff"
              selectedOption={target?.employee_id ? { value: target.employee_id, label: target.employee_name || target.name } : null} />
          </Field>
          <Field label="Name" error={err}><TextInput value={v.name} onValueChange={(x) => { set("name", x); setErr(""); }} /></Field>
          <Field label="Phone"><TextInput type="tel" value={v.phone} onValueChange={(x) => set("phone", x)} placeholder="+91" /></Field>
          <Field label="Licence number" aside={v.kind === "driver" ? undefined : "Optional"}><TextInput value={v.licence_no} onValueChange={(x) => set("licence_no", x.toUpperCase())} className="font-mono" /></Field>
          <Field label="Licence valid till"><DateInput value={v.licence_expiry} onChange={(x) => set("licence_expiry", x)} clearable /></Field>
          <Field label="Badge number" aside="Optional"><TextInput value={v.badge_no} onValueChange={(x) => set("badge_no", x)} /></Field>
          <div className="hidden sm:block" />
          <Field label="Notes" className="sm:col-span-2"><Textarea value={v.notes} onValueChange={(x) => set("notes", x)} rows={2} /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}
