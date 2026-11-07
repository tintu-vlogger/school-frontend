"use client";

/*
 * Transport > Riders: learners allocated to a route and stop. Allocate opens a modal (learner,
 * route, stop, start date, direction, bill the fee); allocating a learner who already rides
 * moves them (the earlier allocation ends the day before and parents are told).
 */
import { useMemo, useState } from "react";
import { Bus, CircleStop, Plus, Repeat } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { todayISO } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, Modal, ModalCancel, Select, Textarea, Toggle,
  formatDisplayDate, useConfirm, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { clock, errText, money, PersonLine, searchStudents, useApiData, type Paged } from "./common";
import { DIRECTIONS, type Rider, type Route } from "./types";

export function RidersTab({ canManage }: { canManage: boolean }) {
  const { term } = useInstitution();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ state: ["current"] });
  const [page, setPage] = useState(1);
  const routes = useApiData<Paged<Route>>("/transport/routes?size=200&active=true");
  const routeOpts = (routes.data?.items ?? []).map((r) => ({ value: r.uuid, label: r.name }));
  const params = new URLSearchParams({ page: String(page), size: "25", q, state: filters.state?.[0] ?? "" });
  if (filters.route?.[0]) params.set("route_uuid", filters.route[0]);
  const { data, loading, reload } = useApiData<Paged<Rider>>(`/transport/riders?${params}`);
  const [alloc, setAlloc] = useState<{ open: boolean; rider: Rider | null; key: number }>({ open: false, rider: null, key: 0 });
  const openAlloc = (r: Rider | null) => setAlloc((a) => ({ open: true, rider: r, key: a.key + 1 }));

  async function end(r: Rider) {
    if (!(await confirm({ title: `Stop transport for ${r.student_name}?`, message: "The allocation ends today and the seat is freed.", confirmLabel: "End allocation", tone: "danger" }))) return;
    try { await api.post(`/transport/riders/${r.uuid}/end`, { end_date: todayISO() }); toast.success("Allocation ended"); reload(); routes.reload(); }
    catch (e) { toast.error("Couldn't end it", { description: errText(e) }); }
  }

  const columns: Column<Rider>[] = [
    { key: "student", header: term("student"), cell: (r) => <PersonLine name={r.student_name} photo={r.photo_url} detail={[r.admission_no, r.section_label].filter(Boolean).join(" · ")} /> },
    { key: "route", header: "Route and stop", cell: (r) => (
      <div className="min-w-0"><p className="truncate text-ink/90">{r.route}</p>
        <p className="truncate text-[12.5px] text-muted">{r.stop}{r.pickup_time ? ` · ${clock(r.pickup_time)}` : ""}</p></div>) },
    { key: "direction", header: "Trips", hideBelow: "lg", cell: (r) => <span className="text-ink/80">{DIRECTIONS.find((d) => d.value === r.direction)?.label}</span> },
    { key: "dates", header: "From", hideBelow: "md", cell: (r) => <span className="text-muted">{formatDisplayDate(r.start_date)}{r.end_date ? ` – ${formatDisplayDate(r.end_date)}` : ""}</span> },
    { key: "fee", header: "Fee", align: "right", hideBelow: "md", cell: (r) => r.fee_amount ? <span className="tabular text-ink/80">{money(r.fee_amount)}</span> : <span className="text-faint">—</span> },
    { key: "state", header: "Status", cell: (r) => <Badge tone={r.state === "current" ? "good" : r.state === "upcoming" ? "info" : "neutral"} dot>{r.state === "current" ? "Riding" : r.state === "upcoming" ? "Starts soon" : "Ended"}</Badge> },
  ];

  return (
    <div>
      <FilterBar searchPlaceholder={`Search ${term("students").toLowerCase()}`} onSearchChange={(x) => { setQ(x); setPage(1); }}
        filters={[
          { key: "route", label: "Route", options: routeOpts },
          { key: "state", label: "Status", options: [{ value: "current", label: "Riding now" }, { value: "upcoming", label: "Starts soon" }, { value: "ended", label: "Ended" }] },
        ]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={canManage ? <Button variant="primary" icon={Plus} onClick={() => openAlloc(null)}>Allocate</Button> : undefined} />
      <DataTable rows={data?.items ?? []} rowKey={(r) => r.uuid} columns={columns} loading={loading}
        rowActions={(r) => canManage && r.state !== "ended" ? [
          { label: "Change route or stop", icon: Repeat, onSelect: () => openAlloc(r) },
          "separator", { label: "End allocation", icon: CircleStop, danger: true, onSelect: () => end(r) },
        ] : []}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={Bus} emptyTitle="No riders here" emptyHint={`Allocate ${term("students").toLowerCase()} to a route and stop.`}
        emptyAction={canManage && <Button variant="primary" icon={Plus} onClick={() => openAlloc(null)}>Allocate</Button>} />
      <AllocateModal key={alloc.key} open={alloc.open} rider={alloc.rider} routes={routes.data?.items ?? []}
        onClose={() => setAlloc((a) => ({ ...a, open: false }))}
        onSaved={() => { setAlloc((a) => ({ ...a, open: false })); reload(); routes.reload(); }} />
    </div>
  );
}

function AllocateModal({ open, rider, routes, onClose, onSaved }: { open: boolean; rider: Rider | null; routes: Route[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [studentId, setStudentId] = useState<number | null>(rider?.student_id ?? null);
  const [routeUuid, setRouteUuid] = useState<string | null>(rider?.route_uuid ?? null);
  const [stopUuid, setStopUuid] = useState<string | null>(rider?.stop_uuid ?? null);
  const [start, setStart] = useState(todayISO());
  const [direction, setDirection] = useState<string>(rider?.direction ?? "both");
  const [bill, setBill] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const detail = useApiData<Route>(routeUuid ? `/transport/routes/${routeUuid}` : null);
  const route = routes.find((r) => r.uuid === routeUuid);
  const routeOpts: SelectOption<string>[] = routes.map((r) => ({
    value: r.uuid, label: r.name, description: `${r.riders}/${r.seats ?? "—"} seats taken`, disabled: !!r.seats && r.riders >= r.seats && r.uuid !== rider?.route_uuid,
  }));
  const stopOpts: SelectOption<string>[] = useMemo(() => (detail.data?.stops ?? []).map((s) => ({
    value: s.uuid, label: `${s.sequence}. ${s.name}`, description: [s.pickup_time && `Pickup ${clock(s.pickup_time)}`, s.effective_fee && money(s.effective_fee)].filter(Boolean).join(" · "),
  })), [detail.data]);
  const fee = detail.data?.stops?.find((s) => s.uuid === stopUuid)?.effective_fee;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!studentId || !routeUuid || !stopUuid) { setErr(`Pick the ${term("student").toLowerCase()}, route and stop`); return; }
    setSaving(true);
    try {
      await api.post("/transport/riders", { student_id: studentId, route_uuid: routeUuid, stop_uuid: stopUuid, start_date: start,
        direction, bill_fee: bill, notes: notes.trim() || null });
      toast.success(rider ? "Route changed" : "Allocated", { description: "Parents get a notice." });
      onSaved();
    } catch (e2) { setErr(errText(e2)); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title={rider ? `Change route for ${rider.student_name}` : "Allocate transport"}
      description={rider ? "The current allocation ends the day before the new start date." : undefined}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="alloc-form" loading={saving}>{rider ? "Change route" : "Allocate"}</Button></>}>
      <form id="alloc-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label={term("student")} required className="sm:col-span-2">
            <Select value={studentId} onChange={(x) => { setStudentId(x); setErr(""); }} loadOptions={searchStudents} placeholder={`Search ${term("students").toLowerCase()}`}
              disabled={!!rider} selectedOption={rider ? { value: rider.student_id, label: rider.student_name } : null} />
          </Field>
          <Field label="Route" required>
            <Select value={routeUuid} onChange={(x) => { setRouteUuid(x); setStopUuid(null); setErr(""); }} options={routeOpts} placeholder="Pick a route" />
          </Field>
          <Field label="Stop" required hint={route && !detail.data?.stops?.length && !detail.loading ? "This route has no stops yet" : undefined}>
            <Select value={stopUuid} onChange={(x) => { setStopUuid(x); setErr(""); }} options={stopOpts} disabled={!routeUuid} placeholder={routeUuid ? "Pick a stop" : "Pick a route first"} />
          </Field>
          <Field label="Starts on"><DateInput value={start} onChange={(x) => setStart(x || todayISO())} /></Field>
          <Field label="Trips"><Select value={direction} onChange={(x) => setDirection(x || "both")} options={DIRECTIONS} /></Field>
          <Field label="Notes" aside="Optional" className="sm:col-span-2"><Textarea value={notes} onValueChange={setNotes} rows={2} /></Field>
          <div className="sm:col-span-2 rounded-xl border border-line bg-sunken/50 px-4 py-3">
            <Toggle checked={bill} onChange={setBill} label={`Add the transport fee to fees${fee ? ` (${money(fee)})` : ""}`}
              description="Raises a charge when the fees module is set up; otherwise the amount is only recorded." />
          </div>
          {err && <p className="sm:col-span-2 text-[13px] text-rose-700">{err}</p>}
        </FormGrid>
      </form>
    </Modal>
  );
}
