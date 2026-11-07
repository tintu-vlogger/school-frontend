"use client";

/*
 * Transport > Vehicles: list with the next document expiry, add / edit in a modal
 * (registration, seats, insurance / permit / fitness / pollution dates, GPS device id).
 */
import { useState } from "react";
import { Ban, Bus, Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, FormSection, KeyValue, Modal, ModalCancel, NumberInput,
  Section, Select, TextInput, Textarea, formatDisplayDate, useConfirm, type Column, type FilterValues,
} from "@/components/ui-kit";
import { errText, useApiData, type Paged } from "./common";
import { VEHICLE_KINDS, type ExpiryState, type Vehicle } from "./types";

export function ExpiryBadge({ state, date }: { state?: ExpiryState; date?: string | null }) {
  if (!date) return <span className="text-faint">—</span>;
  const tone = state === "expired" ? "bad" : state === "soon" ? "warn" : "neutral";
  return <Badge tone={tone} dot={state !== "ok"}>{state === "expired" ? "Expired " : state === "soon" ? "Due " : ""}{formatDisplayDate(date)}</Badge>;
}

function stateOf(d: string | null): ExpiryState {
  if (!d) return null;
  const days = (new Date(d).getTime() - Date.now()) / 86400000;
  return days < -1 ? "expired" : days <= 30 ? "soon" : "ok";
}

export function VehiclesTab({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [page, setPage] = useState(1);
  const active = filters.status?.[0] === "inactive" ? "false" : filters.status?.[0] === "active" ? "true" : "";
  const { data, loading, reload } = useApiData<Paged<Vehicle>>(`/transport/vehicles?page=${page}&size=25&q=${encodeURIComponent(q)}${active ? `&active=${active}` : "&active="}`);
  const [form, setForm] = useState<{ open: boolean; target: Vehicle | null; key: number }>({ open: false, target: null, key: 0 });
  const [view, setView] = useState<Vehicle | null>(null);
  const openForm = (v: Vehicle | null) => setForm((f) => ({ open: true, target: v, key: f.key + 1 }));

  async function switchOff(v: Vehicle) {
    if (!(await confirm({ title: `Switch off ${v.name || v.registration_no}?`, message: "It stays in the records but can't be put on a route.", confirmLabel: "Switch off", tone: "danger" }))) return;
    try { await api.delete(`/transport/vehicles/${v.uuid}`); toast.success("Vehicle switched off"); setView(null); reload(); }
    catch (e) { toast.error("Couldn't switch it off", { description: errText(e) }); }
  }

  const columns: Column<Vehicle>[] = [
    { key: "name", header: "Vehicle", cell: (v) => (
      <div className="min-w-0"><p className="truncate text-ink">{v.name || v.registration_no}</p>
        <p className="truncate font-mono text-[12px] text-muted">{v.registration_no}</p></div>) },
    { key: "kind", header: "Type", hideBelow: "md", cell: (v) => <span className="capitalize text-ink/80">{v.kind}</span> },
    { key: "seats", header: "Seats", align: "right", cell: (v) => <span className="tabular text-muted">{v.capacity}</span> },
    { key: "routes", header: "Routes", hideBelow: "md", cell: (v) => v.routes?.length ? <span className="text-ink/80">{v.routes.join(", ")}</span> : <span className="text-faint">—</span> },
    { key: "expiry", header: "Next renewal", cell: (v) => <ExpiryBadge state={v.expiry_state} date={v.next_expiry} /> },
    { key: "status", header: "Status", hideBelow: "sm", cell: (v) => <Badge tone={v.active ? "good" : "neutral"} dot>{v.active ? "In use" : "Off"}</Badge> },
  ];

  return (
    <div>
      <FilterBar searchPlaceholder="Search registration or name" onSearchChange={(x) => { setQ(x); setPage(1); }}
        filters={[{ key: "status", label: "Status", options: [{ value: "active", label: "In use" }, { value: "inactive", label: "Switched off" }] }]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={canManage ? <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>Add vehicle</Button> : undefined} />
      <DataTable rows={data?.items ?? []} rowKey={(v) => v.uuid} columns={columns} loading={loading} onRowClick={setView}
        rowActions={(v) => canManage ? [{ label: "Edit", icon: Pencil, onSelect: () => openForm(v) }, ...(v.active ? ["separator" as const, { label: "Switch off", icon: Ban, danger: true, onSelect: () => switchOff(v) }] : [])] : []}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={Bus} emptyTitle="No vehicles yet" emptyHint="Add the buses and vans that carry learners."
        emptyAction={canManage && <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>Add vehicle</Button>} />

      <Modal open={!!view} onClose={() => setView(null)} size="md" title={view?.name || view?.registration_no}
        description={view ? `${view.registration_no} · ${view.capacity} seats` : undefined}
        headerActions={view && canManage && <Button size="sm" icon={Pencil} onClick={() => { const v = view; setView(null); openForm(v); }}>Edit</Button>}>
        {view && (
          <>
            <Section title="Vehicle">
              <KeyValue columns={2} items={[
                { label: "Type", value: <span className="capitalize">{view.kind}</span> }, { label: "Make and model", value: view.make_model },
                { label: "Fuel", value: view.fuel }, { label: "Ownership", value: view.ownership === "own" ? "Own" : `Contract${view.contractor ? ` (${view.contractor})` : ""}` },
                { label: "GPS device", value: view.gps_device_id }, { label: "Routes", value: view.routes?.join(", ") },
              ]} />
            </Section>
            <Section title="Documents" className="border-t border-line">
              <KeyValue columns={2} items={[
                { label: "Insurance", value: view.insurance_expiry && <ExpiryBadge state={stateOf(view.insurance_expiry)} date={view.insurance_expiry} /> },
                { label: "Permit", value: view.permit_expiry && <ExpiryBadge state={stateOf(view.permit_expiry)} date={view.permit_expiry} /> },
                { label: "Fitness certificate", value: view.fitness_expiry && <ExpiryBadge state={stateOf(view.fitness_expiry)} date={view.fitness_expiry} /> },
                { label: "Pollution certificate", value: view.pollution_expiry && <ExpiryBadge state={stateOf(view.pollution_expiry)} date={view.pollution_expiry} /> },
              ]} />
            </Section>
            {view.notes && <Section title="Notes" className="border-t border-line"><p className="whitespace-pre-line text-[14px] text-ink/80">{view.notes}</p></Section>}
          </>
        )}
      </Modal>
      <VehicleForm key={form.key} open={form.open} target={form.target} onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={() => { setForm((f) => ({ ...f, open: false })); reload(); }} />
    </div>
  );
}

function VehicleForm({ open, target, onClose, onSaved }: { open: boolean; target: Vehicle | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const initial = {
    registration_no: target?.registration_no ?? "", name: target?.name ?? "", kind: target?.kind ?? "bus",
    make_model: target?.make_model ?? "", capacity: target?.capacity ?? 40, fuel: target?.fuel ?? "",
    ownership: target?.ownership ?? "own", contractor: target?.contractor ?? "",
    insurance_expiry: target?.insurance_expiry ?? "", permit_expiry: target?.permit_expiry ?? "",
    fitness_expiry: target?.fitness_expiry ?? "", pollution_expiry: target?.pollution_expiry ?? "",
    gps_device_id: target?.gps_device_id ?? "", notes: target?.notes ?? "",
  };
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof initial>(k: K, x: (typeof initial)[K]) => setV((p) => ({ ...p, [k]: x }));
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (v.registration_no.trim().length < 2) { setErr("Enter the registration number"); return; }
    setSaving(true);
    const blank = (s: string) => s.trim() || null;
    const payload = {
      registration_no: v.registration_no.trim(), name: blank(v.name), kind: v.kind, make_model: blank(v.make_model),
      capacity: v.capacity || 1, fuel: blank(v.fuel), ownership: v.ownership, contractor: blank(v.contractor),
      insurance_expiry: v.insurance_expiry || null, permit_expiry: v.permit_expiry || null, fitness_expiry: v.fitness_expiry || null,
      pollution_expiry: v.pollution_expiry || null, gps_device_id: blank(v.gps_device_id), notes: blank(v.notes),
    };
    try {
      if (target) await api.put(`/transport/vehicles/${target.uuid}`, payload);
      else await api.post("/transport/vehicles", payload);
      toast.success(target ? "Vehicle updated" : "Vehicle added");
      onSaved();
    } catch (e2) { toast.error("Couldn't save the vehicle", { description: errText(e2) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving} title={target ? `Edit ${target.name || target.registration_no}` : "Add vehicle"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="vehicle-form" loading={saving}>{target ? "Save changes" : "Add vehicle"}</Button></>}>
      <form id="vehicle-form" onSubmit={submit} noValidate>
        <FormSection title="Vehicle">
          <FormGrid>
            <Field label="Registration number" required error={err}>
              <TextInput autoFocusInModal value={v.registration_no} onValueChange={(x) => { set("registration_no", x.toUpperCase()); setErr(""); }} placeholder="KA-01-AB-1234" className="font-mono" />
            </Field>
            <Field label="Name" aside="Optional"><TextInput value={v.name} onValueChange={(x) => set("name", x)} placeholder="e.g. Bus 4" /></Field>
            <Field label="Type"><Select value={v.kind} onChange={(x) => set("kind", x || "bus")} options={VEHICLE_KINDS} /></Field>
            <Field label="Seats"><NumberInput value={v.capacity} onChange={(x) => set("capacity", x ?? 1)} min={1} max={200} /></Field>
            <Field label="Make and model" aside="Optional"><TextInput value={v.make_model} onValueChange={(x) => set("make_model", x)} /></Field>
            <Field label="Fuel" aside="Optional">
              <Select value={v.fuel || null} onChange={(x) => set("fuel", x || "")} clearable options={["Diesel", "Petrol", "CNG", "Electric"].map((f) => ({ value: f, label: f }))} />
            </Field>
            <Field label="Ownership">
              <Select value={v.ownership} onChange={(x) => set("ownership", (x as "own" | "contract") || "own")} options={[{ value: "own", label: "Own vehicle" }, { value: "contract", label: "On contract" }]} />
            </Field>
            {v.ownership === "contract" && <Field label="Contractor"><TextInput value={v.contractor} onValueChange={(x) => set("contractor", x)} /></Field>}
          </FormGrid>
        </FormSection>
        <FormSection title="Renewals" description="You get a reminder 30 days before each date.">
          <FormGrid>
            <Field label="Insurance valid till"><DateInput value={v.insurance_expiry} onChange={(x) => set("insurance_expiry", x)} clearable /></Field>
            <Field label="Permit valid till"><DateInput value={v.permit_expiry} onChange={(x) => set("permit_expiry", x)} clearable /></Field>
            <Field label="Fitness certificate till"><DateInput value={v.fitness_expiry} onChange={(x) => set("fitness_expiry", x)} clearable /></Field>
            <Field label="Pollution certificate till"><DateInput value={v.pollution_expiry} onChange={(x) => set("pollution_expiry", x)} clearable /></Field>
          </FormGrid>
        </FormSection>
        <FormSection title="Other">
          <FormGrid>
            <Field label="GPS device ID" aside="Optional" hint="For live tracking later"><TextInput value={v.gps_device_id} onValueChange={(x) => set("gps_device_id", x)} /></Field>
            <div className="hidden sm:block" />
            <Field label="Notes" className="sm:col-span-2"><Textarea value={v.notes} onValueChange={(x) => set("notes", x)} rows={2} /></Field>
          </FormGrid>
        </FormSection>
      </form>
    </Modal>
  );
}
