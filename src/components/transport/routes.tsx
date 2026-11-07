"use client";

/*
 * Transport > Routes: list with seat load; the detail modal shows the ordered stops (add,
 * edit, remove, move up / down), vehicle and crew, prints the route sheet and opens the trip
 * attendance sheet. Changes to vehicle, crew or stop timings can be sent to parents.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Ban, ClipboardCheck, MapPin, Pencil, Phone, Plus, Printer, Route as RouteIcon, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { todayISO } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import { downloadWithAuth } from "@/components/people/types";
import {
  Badge, Button, Checkbox, DataTable, DateInput, Field, FilterBar, FormGrid, IconButton, KeyValue, Modal, ModalCancel,
  NumberInput, Section, Select, Skeleton, Tabs, TextInput, Textarea, TimeInput, Toggle, useConfirm, type Column,
  type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { clock, errText, money, STROKE, useApiData, type Paged } from "./common";
import type { Crew, Route, Stop, Vehicle, Zone } from "./types";

export function LoadBar({ riders, seats }: { riders: number; seats: number | null }) {
  const ratio = seats ? Math.min(1, riders / seats) : 0;
  const tone = !seats ? "bg-faint" : ratio >= 1 ? "bg-rose-500" : ratio >= 0.85 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="flex min-w-[120px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"><div className={`h-full rounded-full ${tone}`} style={{ width: `${ratio * 100}%` }} /></div>
      <span className="tabular text-[12.5px] text-muted">{riders}/{seats ?? "—"}</span>
    </div>
  );
}

export function RoutesTab({ canManage }: { canManage: boolean }) {
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [page, setPage] = useState(1);
  const active = filters.status?.[0] === "inactive" ? "false" : filters.status?.[0] === "active" ? "true" : "";
  const { data, loading, reload } = useApiData<Paged<Route>>(`/transport/routes?page=${page}&size=25&q=${encodeURIComponent(q)}&active=${active}`);
  const [viewing, setViewing] = useState<string | null>(null);
  const [form, setForm] = useState<{ open: boolean; target: Route | null; key: number }>({ open: false, target: null, key: 0 });
  const openForm = (r: Route | null) => setForm((f) => ({ open: true, target: r, key: f.key + 1 }));

  const columns: Column<Route>[] = [
    { key: "name", header: "Route", cell: (r) => (
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft/60 text-[12px] text-primary">{r.code || r.name.slice(0, 2)}</span>
        <div className="min-w-0"><p className="truncate text-ink">{r.name}</p>
          <p className="truncate text-[12.5px] text-muted">{r.stop_count} stops{r.first_pickup ? ` · first pickup ${clock(r.first_pickup)}` : ""}</p></div>
      </div>) },
    { key: "vehicle", header: "Vehicle", hideBelow: "md", cell: (r) => r.vehicle ? <span className="text-ink/80">{r.vehicle}</span> : <span className="text-faint">Not set</span> },
    { key: "driver", header: "Driver", hideBelow: "lg", cell: (r) => r.driver ? <span className="text-ink/80">{r.driver}</span> : <span className="text-faint">Not set</span> },
    { key: "load", header: "Riders / seats", cell: (r) => <LoadBar riders={r.riders} seats={r.seats} /> },
  ];

  return (
    <div>
      <FilterBar searchPlaceholder="Search routes" onSearchChange={(x) => { setQ(x); setPage(1); }}
        filters={[{ key: "status", label: "Status", options: [{ value: "active", label: "Running" }, { value: "inactive", label: "Switched off" }] }]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={canManage ? <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>New route</Button> : undefined} />
      <DataTable rows={data?.items ?? []} rowKey={(r) => r.uuid} columns={columns} loading={loading} onRowClick={(r) => setViewing(r.uuid)}
        rowActions={(r) => [
          { label: "Print route sheet", icon: Printer, onSelect: () => downloadWithAuth(`/transport/routes/${r.uuid}/sheet.pdf`, "route.pdf", true) },
          ...(canManage ? [{ label: "Edit", icon: Pencil, onSelect: () => openForm(r) }] : []),
        ]}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={RouteIcon} emptyTitle="No routes yet" emptyHint="Create a route, add its stops in order, then allocate riders."
        emptyAction={canManage && <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>New route</Button>} />
      <RouteDetail uuid={viewing} onClose={() => setViewing(null)} canManage={canManage} onChanged={reload}
        onEdit={(r) => { setViewing(null); openForm(r); }} />
      <RouteForm key={form.key} open={form.open} target={form.target} onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={(r) => { setForm((f) => ({ ...f, open: false })); reload(); if (!form.target) setViewing(r.uuid); }} />
    </div>
  );
}

function useOptions() {
  const vehicles = useApiData<Paged<Vehicle>>("/transport/vehicles?size=200&active=true");
  const crew = useApiData<Paged<Crew>>("/transport/crew?size=200&active=true");
  return {
    vehicles: (vehicles.data?.items ?? []).map((v) => ({ value: v.id, label: v.name || v.registration_no, description: `${v.registration_no} · ${v.capacity} seats` })),
    drivers: (crew.data?.items ?? []).filter((c) => c.kind === "driver").map((c) => ({ value: c.id, label: c.name, description: c.phone || undefined })),
    attendants: (crew.data?.items ?? []).filter((c) => c.kind === "attendant").map((c) => ({ value: c.id, label: c.name, description: c.phone || undefined })),
  };
}

function RouteForm({ open, target, onClose, onSaved }: { open: boolean; target: Route | null; onClose: () => void; onSaved: (r: Route) => void }) {
  const toast = useToast();
  const opts = useOptions();
  const initial = {
    name: target?.name ?? "", code: target?.code ?? "", vehicle_id: target?.vehicle_id ?? null as number | null,
    driver_id: target?.driver_id ?? null as number | null, attendant_id: target?.attendant_id ?? null as number | null,
    start_point: target?.start_point ?? "", capacity: target?.capacity ?? null as number | null, notes: target?.notes ?? "",
  };
  const [v, setV] = useState(initial);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof initial>(k: K, x: (typeof initial)[K]) => setV((p) => ({ ...p, [k]: x }));
  const crewChanged = !!target && (v.vehicle_id !== initial.vehicle_id || v.driver_id !== initial.driver_id || v.attendant_id !== initial.attendant_id);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setErr("Give the route a name"); return; }
    setSaving(true);
    const payload = { name: v.name.trim(), code: v.code.trim() || null, vehicle_id: v.vehicle_id, driver_id: v.driver_id,
      attendant_id: v.attendant_id, start_point: v.start_point.trim() || null, capacity: v.capacity, notes: v.notes.trim() || null };
    try {
      const r = target ? await api.put<Route>(`/transport/routes/${target.uuid}`, { ...payload, notify_parents: crewChanged && notify })
        : await api.post<Route>("/transport/routes", payload);
      toast.success(target ? "Route updated" : "Route created", !target ? { description: "Now add its stops." } : undefined);
      onSaved(r);
    } catch (e2) { toast.error("Couldn't save the route", { description: errText(e2) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(initial)}
      title={target ? `Edit ${target.name}` : "New route"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="route-form" loading={saving}>{target ? "Save changes" : "Create route"}</Button></>}>
      <form id="route-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Name" required error={err} className="sm:col-span-2">
            <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { set("name", x); setErr(""); }} placeholder="e.g. Route 5 - Malleshwaram" />
          </Field>
          <Field label="Short code" aside="Optional"><TextInput value={v.code} onValueChange={(x) => set("code", x.toUpperCase())} maxLength={20} placeholder="R5" /></Field>
          <Field label="Starts from" aside="Optional"><TextInput value={v.start_point} onValueChange={(x) => set("start_point", x)} placeholder="School campus" /></Field>
          <Field label="Vehicle"><Select value={v.vehicle_id} onChange={(x) => set("vehicle_id", x)} options={opts.vehicles} clearable placeholder="Pick a vehicle" /></Field>
          <Field label="Seats" aside="Optional" hint="Leave empty to use the vehicle's seats">
            <NumberInput value={v.capacity} onChange={(x) => set("capacity", x)} min={1} max={300} />
          </Field>
          <Field label="Driver"><Select value={v.driver_id} onChange={(x) => set("driver_id", x)} options={opts.drivers} clearable placeholder="Pick a driver" /></Field>
          <Field label="Attendant"><Select value={v.attendant_id} onChange={(x) => set("attendant_id", x)} options={opts.attendants} clearable placeholder="Pick an attendant" /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={v.notes} onValueChange={(x) => set("notes", x)} rows={2} /></Field>
          {crewChanged && (
            <div className="sm:col-span-2 rounded-xl border border-line bg-sunken/50 px-4 py-3">
              <Toggle checked={notify} onChange={setNotify} label="Tell parents of riders" description="They get a notice with the new vehicle or crew." />
            </div>
          )}
        </FormGrid>
      </form>
    </Modal>
  );
}

function RouteDetail({ uuid, onClose, canManage, onChanged, onEdit }: {
  uuid: string | null; onClose: () => void; canManage: boolean; onChanged: () => void; onEdit: (r: Route) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: r, loading, reload } = useApiData<Route>(uuid ? `/transport/routes/${uuid}` : null);
  const [stopForm, setStopForm] = useState<{ open: boolean; target: Stop | null; key: number }>({ open: false, target: null, key: 0 });
  const [trip, setTrip] = useState(false);
  const changed = () => { reload(); onChanged(); };

  async function move(i: number, d: -1 | 1) {
    if (!r?.stops) return;
    const list = [...r.stops];
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    try { await api.post(`/transport/routes/${r.uuid}/reorder`, { stop_uuids: list.map((s) => s.uuid) }); changed(); }
    catch (e) { toast.error("Couldn't move the stop", { description: errText(e) }); }
  }
  async function removeStop(s: Stop) {
    if (!(await confirm({ title: `Remove ${s.name}?`, message: "Stops with riders can't be removed; move the riders first.", confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.delete(`/transport/stops/${s.uuid}`); toast.success("Stop removed"); changed(); }
    catch (e) { toast.error("Couldn't remove the stop", { description: errText(e) }); }
  }
  async function switchOff() {
    if (!r || !(await confirm({ title: `Switch off ${r.name}?`, message: "Only routes without riders can be switched off.", confirmLabel: "Switch off", tone: "danger" }))) return;
    try { await api.delete(`/transport/routes/${r.uuid}`); toast.success("Route switched off"); onChanged(); onClose(); }
    catch (e) { toast.error("Couldn't switch off", { description: errText(e) }); }
  }

  const show = r && r.uuid === uuid;
  return (
    <>
      <Modal open={!!uuid} onClose={onClose} size="lg" title={show ? r.name : "Route"}
        description={show ? `${r.stop_count} stops · ${r.riders} riders of ${r.seats ?? "—"} seats` : undefined}
        headerActions={show && (
          <div className="flex items-center gap-2">
            <Button size="sm" icon={Printer} onClick={() => downloadWithAuth(`/transport/routes/${r.uuid}/sheet.pdf`, "route.pdf", true).catch((e) => toast.error(errText(e)))}>Route sheet</Button>
            {canManage && <Button size="sm" icon={Pencil} onClick={() => onEdit(r)}>Edit</Button>}
          </div>
        )}
        footerStart={show && canManage && r.active ? <Button variant="ghost" icon={Ban} onClick={switchOff}>Switch off</Button> : undefined}
        footer={show && <Button icon={ClipboardCheck} onClick={() => setTrip(true)}>Trip attendance</Button>}>
        {!show || loading && !r ? <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
          <>
            <Section title="Crew">
              <KeyValue columns={3} items={[
                { label: "Vehicle", value: r.vehicle ? `${r.vehicle}${r.vehicle_reg && r.vehicle_reg !== r.vehicle ? ` (${r.vehicle_reg})` : ""}` : null },
                { label: "Driver", value: r.driver_detail ? <CrewLink c={r.driver_detail} /> : null },
                { label: "Attendant", value: r.attendant_detail ? <CrewLink c={r.attendant_detail} /> : null },
              ]} />
            </Section>
            <Section title="Stops" description="In pickup order" className="border-t border-line"
              action={canManage && <Button size="sm" icon={Plus} onClick={() => setStopForm((f) => ({ open: true, target: null, key: f.key + 1 }))}>Add stop</Button>}>
              {!r.stops?.length ? (
                <p className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-5 text-[13.5px] text-muted">
                  <MapPin size={16} strokeWidth={STROKE} className="text-faint" /> No stops yet. Add them in the order the bus reaches them.
                </p>
              ) : (
                <ol className="divide-y divide-line rounded-xl border border-line">
                  {r.stops.map((s, i) => (
                    <li key={s.uuid} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sunken text-[12px] text-muted">{s.sequence}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] text-ink">{s.name}</p>
                        <p className="truncate text-[12.5px] text-muted">
                          {[s.pickup_time && `Pickup ${clock(s.pickup_time)}`, s.drop_time && `Drop ${clock(s.drop_time)}`,
                            s.distance_km != null && `${s.distance_km} km`, s.effective_fee && money(s.effective_fee)].filter(Boolean).join(" · ") || "No times yet"}
                        </p>
                      </div>
                      <Badge tone={s.riders ? "accent" : "neutral"}>{s.riders ?? 0} riders</Badge>
                      {canManage && (
                        <div className="flex shrink-0 items-center">
                          <IconButton icon={ArrowUp} label="Move up" onClick={() => move(i, -1)} disabled={i === 0} />
                          <IconButton icon={ArrowDown} label="Move down" onClick={() => move(i, 1)} disabled={i === r.stops!.length - 1} />
                          <IconButton icon={Pencil} label="Edit stop" onClick={() => setStopForm((f) => ({ open: true, target: s, key: f.key + 1 }))} />
                          <IconButton icon={Trash2} label="Remove stop" onClick={() => removeStop(s)} />
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Section>
            {r.notes && <Section title="Notes" className="border-t border-line"><p className="whitespace-pre-line text-[14px] text-ink/80">{r.notes}</p></Section>}
          </>
        )}
      </Modal>
      {show && <StopForm key={stopForm.key} open={stopForm.open} routeUuid={r.uuid} target={stopForm.target}
        onClose={() => setStopForm((f) => ({ ...f, open: false }))} onSaved={() => { setStopForm((f) => ({ ...f, open: false })); changed(); }} />}
      {show && <TripModal open={trip} route={r} onClose={() => setTrip(false)} canManage={canManage} />}
    </>
  );
}

function CrewLink({ c }: { c: Crew }) {
  return (
    <span className="flex flex-col">
      <span>{c.name}</span>
      {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-primary"><Phone size={12} strokeWidth={STROKE} />{c.phone}</a>}
    </span>
  );
}

function StopForm({ open, routeUuid, target, onClose, onSaved }: { open: boolean; routeUuid: string; target: Stop | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const zones = useApiData<Paged<Zone>>("/transport/zones?all=true&active=true");
  const zoneOpts: SelectOption<number>[] = (zones.data?.items ?? []).map((z) => ({ value: z.id, label: z.name, description: money(z.fee) }));
  const initial = {
    name: target?.name ?? "", pickup_time: target?.pickup_time ?? "", drop_time: target?.drop_time ?? "",
    distance_km: target?.distance_km ?? null as number | null, zone_id: target?.zone_id ?? null as number | null,
    fee: target?.fee != null ? Number(target.fee) : null as number | null, landmark: target?.landmark ?? "",
  };
  const [v, setV] = useState(initial);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof initial>(k: K, x: (typeof initial)[K]) => setV((p) => ({ ...p, [k]: x }));
  const timesChanged = !!target && !!target.riders && (v.pickup_time !== initial.pickup_time || v.drop_time !== initial.drop_time);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setErr("Name the stop"); return; }
    setSaving(true);
    const payload = { name: v.name.trim(), pickup_time: v.pickup_time || null, drop_time: v.drop_time || null,
      distance_km: v.distance_km, zone_id: v.zone_id, fee: v.fee, landmark: v.landmark.trim() || null };
    try {
      if (target) await api.put(`/transport/stops/${target.uuid}`, { ...payload, notify_parents: timesChanged && notify });
      else await api.post(`/transport/routes/${routeUuid}/stops`, payload);
      toast.success(target ? "Stop updated" : "Stop added");
      onSaved();
    } catch (e2) { toast.error("Couldn't save the stop", { description: errText(e2) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} zIndex={70} dirty={JSON.stringify(v) !== JSON.stringify(initial)}
      title={target ? `Edit ${target.name}` : "Add stop"} description={target ? undefined : "It is added at the end; move it up from the list."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="stop-form" loading={saving}>{target ? "Save stop" : "Add stop"}</Button></>}>
      <form id="stop-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Stop name" required error={err} className="sm:col-span-2">
            <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { set("name", x); setErr(""); }} placeholder="e.g. Sony World Signal" />
          </Field>
          <Field label="Pickup time"><TimeInput value={v.pickup_time} onChange={(x) => set("pickup_time", x)} /></Field>
          <Field label="Drop time"><TimeInput value={v.drop_time} onChange={(x) => set("drop_time", x)} /></Field>
          <Field label="Distance from school" aside="Optional"><NumberInput value={v.distance_km} onChange={(x) => set("distance_km", x)} min={0} step={0.5} suffix="km" /></Field>
          <Field label="Landmark" aside="Optional"><TextInput value={v.landmark} onValueChange={(x) => set("landmark", x)} /></Field>
          <Field label="Fare zone" aside="Optional"><Select value={v.zone_id} onChange={(x) => set("zone_id", x)} options={zoneOpts} clearable placeholder="Pick a zone" /></Field>
          <Field label="Fee for this stop" aside="Optional" hint="Overrides the zone fee"><NumberInput value={v.fee} onChange={(x) => set("fee", x)} min={0} step={100} suffix="₹" /></Field>
          {timesChanged && (
            <div className="sm:col-span-2 rounded-xl border border-line bg-sunken/50 px-4 py-3">
              <Toggle checked={notify} onChange={setNotify} label="Tell parents of riders at this stop" description="They get the new timings." />
            </div>
          )}
        </FormGrid>
      </form>
    </Modal>
  );
}

type TripRow = { student_id: number; student_name: string; admission_no: string; stop: string; time: string | null; boarded: boolean | null };

function TripModal({ open, route, onClose, canManage }: { open: boolean; route: Route; onClose: () => void; canManage: boolean }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [day, setDay] = useState(todayISO());
  const [tripKind, setTripKind] = useState<"pickup" | "drop">("pickup");
  const { data, loading } = useApiData<{ items: TripRow[] }>(open ? `/transport/routes/${route.uuid}/trip?day=${day}&trip=${tripKind}` : null);
  const [marks, setMarks] = useState<Record<number, boolean>>({});
  const [notifyAbsent, setNotifyAbsent] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!data) return;
    setMarks(Object.fromEntries(data.items.map((x) => [x.student_id, x.boarded ?? true])));
  }, [data]);
  const boarded = useMemo(() => Object.values(marks).filter(Boolean).length, [marks]);

  async function save() {
    setSaving(true);
    try {
      await api.post(`/transport/routes/${route.uuid}/trip`, { day, trip: tripKind, marks, notify_absent: notifyAbsent });
      toast.success("Trip attendance saved");
      onClose();
    } catch (e) { toast.error("Couldn't save", { description: errText(e) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" zIndex={70} busy={saving} title={`Trip attendance: ${route.name}`}
      description={data ? `${boarded} of ${data.items.length} boarded` : undefined}
      footerStart={canManage ? <Checkbox checked={notifyAbsent} onChange={setNotifyAbsent} label="Tell parents of those not on board" /> : undefined}
      footer={canManage ? <><ModalCancel /><Button variant="primary" onClick={save} loading={saving} disabled={!data?.items.length}>Save</Button></> : undefined}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-44"><DateInput value={day} onChange={(x) => setDay(x || todayISO())} max={todayISO()} /></div>
        <Tabs variant="pill" value={tripKind} onChange={(x) => setTripKind(x)} items={[{ value: "pickup", label: "Morning pickup" }, { value: "drop", label: "Afternoon drop" }]} />
      </div>
      {loading ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        : !data?.items.length ? <p className="py-6 text-center text-[13.5px] text-muted">No {term("students").toLowerCase()} ride this trip on this day.</p> : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {data.items.map((x) => (
              <li key={x.student_id} className="flex items-center gap-3 px-4 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-ink">{x.student_name}</p>
                  <p className="truncate text-[12.5px] text-muted">{x.stop}{x.time ? ` · ${clock(x.time)}` : ""}</p>
                </div>
                <Toggle checked={!!marks[x.student_id]} disabled={!canManage} onChange={(c) => setMarks((m) => ({ ...m, [x.student_id]: c }))}
                  label={marks[x.student_id] ? "On board" : "Not on board"} size="sm" />
              </li>
            ))}
          </ul>
        )}
    </Modal>
  );
}
