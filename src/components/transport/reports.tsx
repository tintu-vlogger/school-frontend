"use client";

/*
 * Transport > Reports: route loads, documents due for renewal, riders and fees per stop, and
 * the fare zones list (add / edit in a modal).
 */
import { useState } from "react";
import { AlertTriangle, Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FormGrid, Modal, ModalCancel, NumberInput, StatCard, TextInput, Textarea, Toggle,
  formatDisplayDate, type Column,
} from "@/components/ui-kit";
import { errText, money, STROKE, useApiData, type Paged } from "./common";
import { LoadBar } from "./routes";
import type { Expiring, TransportSummary, Zone } from "./types";

type StopRow = { route: string; stop: string; riders: number; fees: string };

export function ReportsTab({ canManage }: { canManage: boolean }) {
  const summary = useApiData<TransportSummary>("/transport/summary");
  const expiring = useApiData<Expiring[]>("/transport/expiring?days=60");
  const stops = useApiData<StopRow[]>("/transport/reports/stops");
  const s = summary.data;
  const totalFees = (stops.data ?? []).reduce((a, r) => a + Number(r.fees || 0), 0);

  const expCols: Column<Expiring>[] = [
    { key: "name", header: "Vehicle or person", cell: (e) => <div><p className="text-ink">{e.name}</p>{e.registration_no && e.registration_no !== e.name && <p className="font-mono text-[12px] text-muted">{e.registration_no}</p>}</div> },
    { key: "doc", header: "Document", cell: (e) => <span className="text-ink/80">{e.document}</span> },
    { key: "date", header: "Valid till", cell: (e) => <Badge tone={e.days_left < 0 ? "bad" : e.days_left <= 30 ? "warn" : "neutral"} dot>{formatDisplayDate(e.expires_on)}</Badge> },
    { key: "left", header: "", align: "right", cell: (e) => <span className="text-[12.5px] text-muted">{e.days_left < 0 ? `${-e.days_left} days ago` : `in ${e.days_left} days`}</span> },
  ];
  const stopCols: Column<StopRow>[] = [
    { key: "route", header: "Route", cell: (r) => <span className="text-ink/80">{r.route}</span> },
    { key: "stop", header: "Stop", cell: (r) => <span className="text-ink">{r.stop}</span> },
    { key: "riders", header: "Riders", align: "right", sortable: true, sortValue: (r) => r.riders, cell: (r) => <span className="tabular">{r.riders}</span> },
    { key: "fees", header: "Fees", align: "right", sortable: true, sortValue: (r) => Number(r.fees), cell: (r) => <span className="tabular text-muted">{money(r.fees)}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Riders" value={s?.riders ?? "–"} hint={s ? `${s.seats} seats` : undefined} />
        <StatCard label="Routes" value={s?.routes ?? "–"} hint={s?.full_routes ? `${s.full_routes} full` : "None full"} />
        <StatCard label="Vehicles" value={s?.vehicles ?? "–"} />
        <StatCard label="Fees from riders" value={money(totalFees) || "–"} hint="Current allocations" />
      </div>
      <Paper>
        <PaperHeader title="Route loads" />
        <ul className="divide-y divide-line">
          {(s?.loads ?? []).map((l) => (
            <li key={l.uuid} className="flex items-center gap-4 px-5 py-3"><span className="min-w-0 flex-1 truncate text-[14px] text-ink">{l.name}</span>
              <div className="w-56"><LoadBar riders={l.riders} seats={l.seats} /></div></li>
          ))}
          {s && !s.loads.length && <li className="px-5 py-6 text-[13.5px] text-muted">No routes yet.</li>}
        </ul>
      </Paper>
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-[15px] text-ink"><AlertTriangle size={16} strokeWidth={STROKE} className="text-amber-600" /> Renewals due in the next 60 days</h3>
        <DataTable rows={expiring.data ?? []} rowKey={(e) => `${e.uuid}-${e.document}`} columns={expCols} loading={expiring.loading}
          emptyTitle="Nothing due" emptyHint="Insurance, permits, fitness certificates and licences are all valid." />
      </div>
      <div>
        <h3 className="mb-3 text-[15px] text-ink">Riders and fees by stop</h3>
        <DataTable rows={stops.data ?? []} rowKey={(r) => `${r.route}-${r.stop}`} columns={stopCols} loading={stops.loading}
          emptyTitle="No riders yet" emptyHint="Allocate riders to see the numbers per stop." />
      </div>
      <ZonesSection canManage={canManage} />
    </div>
  );
}

function ZonesSection({ canManage }: { canManage: boolean }) {
  const { data, loading, reload } = useApiData<Paged<Zone>>("/transport/zones?all=true");
  const [form, setForm] = useState<{ open: boolean; target: Zone | null; key: number }>({ open: false, target: null, key: 0 });
  const openForm = (z: Zone | null) => setForm((f) => ({ open: true, target: z, key: f.key + 1 }));
  const cols: Column<Zone>[] = [
    { key: "name", header: "Zone", cell: (z) => <div><p className="text-ink">{z.name}</p>{z.description && <p className="text-[12.5px] text-muted">{z.description}</p>}</div> },
    { key: "fee", header: "Fee", align: "right", cell: (z) => <span className="tabular">{money(z.fee)}</span> },
    { key: "status", header: "Status", cell: (z) => <Badge tone={z.active ? "good" : "neutral"} dot>{z.active ? "In use" : "Off"}</Badge> },
  ];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h3 className="text-[15px] text-ink">Fare zones</h3><p className="text-[13px] text-muted">Stops take the zone fee unless they have their own.</p></div>
        {canManage && <Button size="sm" icon={Plus} onClick={() => openForm(null)}>Add zone</Button>}
      </div>
      <DataTable rows={data?.items ?? []} rowKey={(z) => z.uuid} columns={cols} loading={loading} onRowClick={canManage ? openForm : undefined}
        rowActions={(z) => canManage ? [{ label: "Edit", icon: Pencil, onSelect: () => openForm(z) }] : []}
        emptyTitle="No zones" emptyHint="Zones group stops by distance with one fee." />
      <ZoneForm key={form.key} open={form.open} target={form.target} onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={() => { setForm((f) => ({ ...f, open: false })); reload(); }} />
    </div>
  );
}

function ZoneForm({ open, target, onClose, onSaved }: { open: boolean; target: Zone | null; onClose: () => void; onSaved: () => void }) {
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
      if (target) await api.put(`/transport/zones/${target.uuid}`, payload); else await api.post("/transport/zones", payload);
      toast.success("Zone saved");
      onSaved();
    } catch (e2) { toast.error("Couldn't save the zone", { description: errText(e2) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" busy={saving} title={target ? `Edit ${target.name}` : "Add zone"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="zone-form" loading={saving} disabled={!name.trim()}>Save</Button></>}>
      <form id="zone-form" onSubmit={submit} noValidate>
        <FormGrid columns={1}>
          <Field label="Name" required><TextInput autoFocusInModal value={name} onValueChange={setName} placeholder="Zone A (up to 5 km)" /></Field>
          <Field label="Fee for the year"><NumberInput value={fee} onChange={setFee} min={0} step={500} suffix="₹" /></Field>
          <Field label="Description" aside="Optional"><Textarea value={desc} onValueChange={setDesc} rows={2} /></Field>
          {target && <Toggle checked={active} onChange={setActive} label="In use" />}
        </FormGrid>
      </form>
    </Modal>
  );
}
