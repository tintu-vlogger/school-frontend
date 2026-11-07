"use client";

/*
 * Travel modals.
 *   <TripFormModal open target onClose onSaved />      plan or edit a trip: journeys, hotel stays, project,
 *                                                      advance; live estimate and policy check
 *   <TripDetailModal uuid open onClose onChanged />    a trip for the traveller, the manager and the travel desk:
 *                                                      approval, bookings and tickets, advance, settlement
 *   <BookingModal ... />                               travel desk: record a ticket or hotel booking
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, BedDouble, Bus, Car, CheckCircle2, Download, Pencil, Plane, Plus, Receipt, Send, Trash2, TrainFront, Wallet, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime } from "@/lib/datetime";
import {
  Badge, Button, DateInput, Field, FileDrop, FormGrid, IconButton, Modal, ModalCancel, NumberInput, Select, TextInput, Textarea, Toggle,
  RadioCards, useConfirm,
} from "@/components/ui-kit";
import { StatusPill, downloadWithAuth, errMsg, inr } from "@/components/payroll/common";
import { ClaimDetailModal, ClaimFormModal, type Claim } from "@/components/payroll/expense-modals";

export type ModeOption = { value: string; label: string; classes: { value: string; label: string }[] };
export type Booking = { booking_status: string; paid_by: string; vendor: string | null; booking_ref: string | null; booked_cost: string | null;
  file_name: string | null; has_file: boolean; booked_by_name: string | null; booked_on: string | null };
export type Leg = Booking & { uuid: string; mode: string; travel_class: string | null; from_place: string; to_place: string; depart_date: string;
  preferred_time: string | null; distance_km: string | null; estimated_cost: string; notes: string | null; flags: string[] };
export type Stay = Booking & { uuid: string; city: string; tier: string | null; check_in: string; check_out: string; nights: number;
  nightly_cost: string; notes: string | null; flags: string[] };
export type Flag = { code: string; where: string; message: string };
export type Trip = {
  uuid: string; number: string | null; employee_name: string | null; purpose: string; travel_type: string; start_date: string; end_date: string;
  status: string; status_label: string; route: string; modes: string[]; project_uuid: string | null; project_name: string | null;
  client_name: string | null; billable: boolean; department_name: string | null; estimated_total: string; advance_amount: string;
  per_diem_days: number; per_diem_rate: string; outside_policy: boolean; policy_flags: Flag[]; open_bookings: number; company_paid: string;
  submitted_at: string | null; created_at: string;
  accommodation_needed?: boolean; notes?: string | null; exception_reason?: string | null; decided_note?: string | null; grade_code?: string | null;
  legs?: Leg[]; stays?: Stay[];
  claim?: { uuid: string; number: string | null; status: string; total: string; approved_total: string; advance_adjusted: string } | null;
  advance?: { uuid: string; status: string; amount: string; settled_amount: string; recovered_amount: string; balance: string; paid_on: string | null; payment_ref: string | null } | null;
  actual_cost?: string | null;
  approval?: { status: string; steps: { uuid: string; name: string; status: string; approver: string | null; comment: string | null; mine: boolean }[] };
  is_desk?: boolean; mine?: boolean;
};

export const TRIP_STATUS_TONE: Record<string, "neutral" | "warn" | "good" | "bad" | "info" | "accent"> = {
  draft: "neutral", pending: "warn", approved: "info", booked: "accent", settling: "warn", settled: "good", rejected: "bad", cancelled: "neutral",
};
export function TripStatus({ status, label }: { status: string; label: string }) {
  return <Badge tone={TRIP_STATUS_TONE[status] ?? "neutral"} dot>{label}</Badge>;
}

export const MODE_ICON: Record<string, typeof Plane> = { flight: Plane, train: TrainFront, bus: Bus, cab: Car, own_vehicle: Car };
export function ModeIcons({ modes }: { modes: string[] }) {
  return <span className="inline-flex items-center gap-1 text-muted">{modes.map((m) => { const I = MODE_ICON[m] ?? Plane; return <I key={m} size={14} strokeWidth={1.4} />; })}</span>;
}

export function useTravelOptions() {
  const [modes, setModes] = useState<ModeOption[]>([]);
  useEffect(() => { api.get<{ modes: ModeOption[] }>("/travel/options").then((o) => setModes(o.modes)).catch(() => {}); }, []);
  return modes;
}

function readFile(f: File): Promise<string> {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
}

/* ── Plan / edit ──────────────────────────────────────────────────────── */

type LegIn = { mode: string; travel_class: string | null; from_place: string; to_place: string; depart_date: string; estimated_cost: number | null;
  distance_km: number | null; preferred_time: string; notes: string };
type StayIn = { city: string; check_in: string; check_out: string; nightly_cost: number | null; notes: string };
type Preview = { estimate: { legs: string; stays: string; per_diem_days: number; per_diem_rate: string; per_diem: string; total: string };
  flags: Flag[]; outside_policy: boolean; grade: string | null; band: { name: string }; stay_tiers: string[] };

const blankLeg = (date: string, from = "", to = ""): LegIn => ({ mode: "flight", travel_class: "economy", from_place: from, to_place: to, depart_date: date,
  estimated_cost: null, distance_km: null, preferred_time: "", notes: "" });

export function TripFormModal({ open, target, onClose, onSaved }: { open: boolean; target: Trip | null; onClose: () => void; onSaved: (t: Trip) => void }) {
  const toast = useToast();
  const modes = useTravelOptions();
  const start0 = addDays(new Date().toISOString().slice(0, 10), 14);
  const [v, setV] = useState({ purpose: "", travel_type: "domestic", start_date: start0, end_date: addDays(start0, 2), project_uuid: null as string | null,
    project_label: null as string | null, billable: false, accommodation_needed: true, advance_amount: null as number | null, notes: "", exception_reason: "" });
  const [legs, setLegs] = useState<LegIn[]>([blankLeg(start0)]);
  const [stays, setStays] = useState<StayIn[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (target) {
      setV({ purpose: target.purpose, travel_type: target.travel_type, start_date: target.start_date, end_date: target.end_date,
        project_uuid: target.project_uuid, project_label: target.project_name, billable: target.billable, accommodation_needed: target.accommodation_needed ?? true,
        advance_amount: Number(target.advance_amount) || null, notes: target.notes ?? "", exception_reason: target.exception_reason ?? "" });
      setLegs((target.legs ?? []).map((l) => ({ mode: l.mode, travel_class: l.travel_class, from_place: l.from_place, to_place: l.to_place, depart_date: l.depart_date,
        estimated_cost: Number(l.estimated_cost) || null, distance_km: l.distance_km ? Number(l.distance_km) : null, preferred_time: l.preferred_time ?? "", notes: l.notes ?? "" })));
      setStays((target.stays ?? []).map((s) => ({ city: s.city, check_in: s.check_in, check_out: s.check_out, nightly_cost: Number(s.nightly_cost) || null, notes: s.notes ?? "" })));
    }
  }, [open, target]);

  const body = useMemo(() => ({
    purpose: v.purpose || "Trip", travel_type: v.travel_type, start_date: v.start_date, end_date: v.end_date, project_uuid: v.project_uuid,
    billable: v.billable, accommodation_needed: v.accommodation_needed, advance_amount: v.advance_amount ?? 0, notes: v.notes || null,
    exception_reason: v.exception_reason || null,
    legs: legs.map((l) => ({ ...l, estimated_cost: l.estimated_cost ?? 0, preferred_time: l.preferred_time || null, notes: l.notes || null })),
    stays: v.accommodation_needed ? stays.map((s) => ({ ...s, nightly_cost: s.nightly_cost ?? 0, notes: s.notes || null })) : [],
  }), [v, legs, stays]);

  useEffect(() => {
    if (!open) return;
    const ok = body.start_date && body.end_date && body.legs.every((l) => l.from_place && l.to_place && l.depart_date) && body.stays.every((s) => s.city);
    if (!ok) return;
    const t = setTimeout(() => { api.post<Preview>("/travel/trips/preview", body).then(setPreview).catch(() => setPreview(null)); }, 400);
    return () => clearTimeout(t);
  }, [open, body]);

  const setLeg = (i: number, p: Partial<LegIn>) => setLegs((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const setStay = (i: number, p: Partial<StayIn>) => setStays((ss) => ss.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((o) => ({ ...o, [k]: x }));

  async function save(submit: boolean) {
    if (!v.purpose.trim()) { toast.error("Say what the trip is for"); return; }
    setBusy(true);
    try {
      const payload = { ...body, purpose: v.purpose, submit };
      const t = target ? await api.put<Trip>(`/travel/trips/${target.uuid}`, payload) : await api.post<Trip>("/travel/trips", payload);
      toast.success(submit ? "Trip sent for approval" : "Draft saved");
      onSaved(t);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }

  const outside = !!preview?.outside_policy;
  return (
    <Modal open={open} onClose={onClose} size="xl" title={target ? "Edit trip" : "Plan a trip"} busy={busy} dirty
      description={preview ? `Your travel band: ${preview.band?.name ?? "—"}${preview.grade ? ` (grade ${preview.grade})` : ""}` : undefined}
      footerStart={preview && <span className="tabular text-[14px] text-ink">Estimated {inr(preview.estimate.total)}</span>}
      footer={<><ModalCancel /><Button variant="secondary" loading={busy} onClick={() => save(false)}>Save draft</Button>
        <Button variant="primary" icon={Send} loading={busy} disabled={outside && !v.exception_reason.trim()} onClick={() => save(true)}>Send for approval</Button></>}>
      <div className="space-y-6">
        <FormGrid columns={2}>
          <Field label="What is the trip for?" required><TextInput value={v.purpose} onValueChange={(x) => set("purpose", x)} placeholder="e.g. Client workshop in Pune" /></Field>
          <Field label="Trip type">
            <RadioCards value={v.travel_type} onChange={(x) => set("travel_type", x)} columns={2}
              options={[{ value: "domestic", label: "Domestic" }, { value: "international", label: "International" }]} />
          </Field>
          <Field label="Leaving on" required><DateInput value={v.start_date} onChange={(x) => { set("start_date", x); if (x > v.end_date) set("end_date", x); }} /></Field>
          <Field label="Back on" required><DateInput value={v.end_date} min={v.start_date} onChange={(x) => set("end_date", x)} /></Field>
          <Field label="Project" hint="Charge the trip to a project from timesheets">
            <Select value={v.project_uuid} clearable onChange={(x, o) => { set("project_uuid", x); set("project_label", o?.label ?? null); if (!x) set("billable", false); }}
              selectedOption={v.project_uuid && v.project_label ? { value: v.project_uuid, label: v.project_label } : undefined}
              loadOptions={async (q) => (await api.get<{ value: string; label: string }[]>(`/travel/projects?q=${encodeURIComponent(q)}`))} placeholder="No project" />
          </Field>
          <div className="flex items-end pb-2"><Toggle checked={v.billable} disabled={!v.project_uuid} onChange={(x) => set("billable", x)} label="Billable to the client" /></div>
        </FormGrid>

        <div>
          <div className="mb-2 flex items-center justify-between"><p className="text-[14px] text-ink">Journeys</p>
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => { const last = legs[legs.length - 1]; setLegs([...legs, blankLeg(v.end_date, last?.to_place ?? "", legs[0]?.from_place ?? "")]); }}>Add journey</Button></div>
          <div className="space-y-3">
            {legs.map((l, i) => {
              const m = modes.find((x) => x.value === l.mode);
              const flags = preview?.flags.filter((f) => f.where === `Journey ${i + 1}`) ?? [];
              return (
                <div key={i} className={`rounded-xl border p-4 ${flags.length ? "border-amber-300" : "border-line"}`}>
                  <div className="mb-3 flex items-center justify-between"><p className="text-[13px] text-muted">Journey {i + 1}</p>
                    {legs.length > 1 && <IconButton icon={Trash2} label="Remove journey" size="sm" onClick={() => setLegs(legs.filter((_, j) => j !== i))} />}</div>
                  <FormGrid columns={3}>
                    <Field label="By"><Select value={l.mode} onChange={(x) => { const mm = modes.find((y) => y.value === x); setLeg(i, { mode: x ?? "flight", travel_class: mm?.classes[0]?.value ?? null }); }}
                      options={modes.map((x) => ({ value: x.value, label: x.label }))} /></Field>
                    <Field label={l.mode === "own_vehicle" ? "Vehicle" : "Class"}><Select value={l.travel_class} onChange={(x) => setLeg(i, { travel_class: x })} options={m?.classes ?? []} /></Field>
                    <Field label="Date" required><DateInput value={l.depart_date} onChange={(x) => setLeg(i, { depart_date: x })} /></Field>
                    <Field label="From" required><TextInput value={l.from_place} onValueChange={(x) => setLeg(i, { from_place: x })} placeholder="City" /></Field>
                    <Field label="To" required><TextInput value={l.to_place} onValueChange={(x) => setLeg(i, { to_place: x })} placeholder="City" /></Field>
                    {l.mode === "own_vehicle"
                      ? <Field label="Distance (km)"><NumberInput value={l.distance_km} onChange={(x) => setLeg(i, { distance_km: x })} min={0} /></Field>
                      : <Field label="Estimated fare (₹)"><NumberInput value={l.estimated_cost} onChange={(x) => setLeg(i, { estimated_cost: x })} min={0} /></Field>}
                    <Field label="Preferred time"><TextInput value={l.preferred_time} onValueChange={(x) => setLeg(i, { preferred_time: x })} placeholder="e.g. Morning" /></Field>
                    {l.mode === "own_vehicle" && <Field label="Estimated cost (₹)"><NumberInput value={l.estimated_cost} onChange={(x) => setLeg(i, { estimated_cost: x })} min={0} /></Field>}
                  </FormGrid>
                  {flags.map((f, k) => <p key={k} className="mt-2 flex items-center gap-1.5 text-[12.5px] text-amber-700"><AlertTriangle size={13} strokeWidth={1.4} />{f.message}</p>)}
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Toggle checked={v.accommodation_needed} onChange={(x) => set("accommodation_needed", x)} label="I need a hotel" />
            {v.accommodation_needed && <Button size="sm" variant="ghost" icon={Plus} onClick={() => setStays([...stays, { city: legs[0]?.to_place ?? "", check_in: v.start_date, check_out: v.end_date, nightly_cost: null, notes: "" }])}>Add stay</Button>}
          </div>
          {v.accommodation_needed && (
            <div className="space-y-3">
              {stays.map((s, i) => {
                const flags = preview?.flags.filter((f) => f.where === `Stay ${i + 1}`) ?? [];
                const tier = preview?.stay_tiers?.[i];
                return (
                  <div key={i} className={`rounded-xl border p-4 ${flags.length ? "border-amber-300" : "border-line"}`}>
                    <div className="mb-3 flex items-center justify-between"><p className="text-[13px] text-muted">Stay {i + 1}{tier ? ` · ${tier === "international" ? "International" : `Tier ${tier} city`}` : ""}</p>
                      <IconButton icon={Trash2} label="Remove stay" size="sm" onClick={() => setStays(stays.filter((_, j) => j !== i))} /></div>
                    <FormGrid columns={2}>
                      <Field label="City" required><TextInput value={s.city} onValueChange={(x) => setStay(i, { city: x })} /></Field>
                      <Field label="Hotel budget a night (₹)"><NumberInput value={s.nightly_cost} onChange={(x) => setStay(i, { nightly_cost: x })} min={0} /></Field>
                      <Field label="Check-in"><DateInput value={s.check_in} onChange={(x) => setStay(i, { check_in: x })} /></Field>
                      <Field label="Check-out"><DateInput value={s.check_out} min={s.check_in} onChange={(x) => setStay(i, { check_out: x })} /></Field>
                    </FormGrid>
                    {flags.map((f, k) => <p key={k} className="mt-2 flex items-center gap-1.5 text-[12.5px] text-amber-700"><AlertTriangle size={13} strokeWidth={1.4} />{f.message}</p>)}
                  </div>
                );
              })}
              {!stays.length && <p className="text-[13px] text-muted">Add where you will stay so the travel desk can book it.</p>}
            </div>
          )}
        </div>

        <FormGrid columns={2}>
          <Field label="Travel advance (₹)" hint="Paid before you leave and set off against your claim"><NumberInput value={v.advance_amount} onChange={(x) => set("advance_amount", x)} min={0} /></Field>
          <Field label="Notes for the travel desk"><TextInput value={v.notes} onValueChange={(x) => set("notes", x)} placeholder="Seat, meal or hotel preferences" /></Field>
        </FormGrid>

        {preview && (
          <div className="grid gap-3 rounded-xl bg-sunken/60 p-4 sm:grid-cols-4">
            <div><p className="text-[12px] text-muted">Travel</p><p className="tabular text-[16px] font-light text-ink">{inr(preview.estimate.legs)}</p></div>
            <div><p className="text-[12px] text-muted">Hotels</p><p className="tabular text-[16px] font-light text-ink">{inr(preview.estimate.stays)}</p></div>
            <div><p className="text-[12px] text-muted">Daily allowance</p><p className="tabular text-[16px] font-light text-ink">{inr(preview.estimate.per_diem)}</p>
              <p className="text-[11.5px] text-faint">{preview.estimate.per_diem_days} days × {inr(preview.estimate.per_diem_rate)}</p></div>
            <div><p className="text-[12px] text-muted">Estimated total</p><p className="tabular text-[16px] font-light text-ink">{inr(preview.estimate.total)}</p></div>
          </div>
        )}
        {outside && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="mb-1 flex items-center gap-2 text-[14px] text-amber-900"><AlertTriangle size={15} strokeWidth={1.4} />Outside the travel policy</p>
            <ul className="mb-3 list-disc pl-5 text-[13px] text-amber-800">{preview!.flags.map((f, i) => <li key={i}>{f.where}: {f.message}</li>)}</ul>
            <Field label="Why is this needed?" required hint="Your approvers see this with the request"><Textarea value={v.exception_reason} onValueChange={(x) => set("exception_reason", x)} rows={2} /></Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ── Details ─────────────────────────────────────────────────────────── */

export function TripDetailModal({ uuid, open, onClose, onChanged, onEdit }: { uuid: string | null; open: boolean; onClose: () => void; onChanged: () => void; onEdit?: (t: Trip) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [t, setT] = useState<Trip | null>(null);
  const modes = useTravelOptions();
  const classLabel = (m: string, c: string) => modes.find((x) => x.value === m)?.classes.find((x) => x.value === c)?.label ?? c.replace(/_/g, " ");
  const [booking, setBooking] = useState<{ kind: "leg" | "stay"; item: Leg | Stay } | null>(null);
  const [money, setMoney] = useState<"pay" | "return" | null>(null);
  const [claimView, setClaimView] = useState<string | null>(null);
  const [claimEdit, setClaimEdit] = useState<{ open: boolean; target: Claim | null; key: number }>({ open: false, target: null, key: 0 });
  const load = () => uuid && api.get<Trip>(`/travel/trips/${uuid}`).then(setT).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { if (open) { setT(null); load(); } }, [open, uuid]); // eslint-disable-line react-hooks/exhaustive-deps
  async function post(path: string, body?: unknown, ok?: string) {
    try { const r = await api.post<Trip>(path, body); if (ok) toast.success(ok); if (r && (r as Trip).uuid === t?.uuid) setT((old) => ({ ...(old as Trip), ...(r as Trip) })); load(); onChanged(); return true; }
    catch (e) { toast.error(errMsg(e)); return false; }
  }
  const mine = t?.approval?.steps.find((s) => s.mine);
  const today = new Date().toISOString().slice(0, 10);
  const canSettle = t?.mine && ["approved", "booked"].includes(t.status) && t.start_date <= today;
  const desk = !!t?.is_desk;
  return (
    <Modal open={open} onClose={onClose} size="xl" title={t?.purpose ?? "Trip"}
      description={t ? [t.employee_name, t.number, `${formatDate(t.start_date)} – ${formatDate(t.end_date)}`].filter(Boolean).join(" · ") : undefined}
      headerActions={t && <TripStatus status={t.status} label={t.status_label} />}
      footerStart={t && desk && ["approved", "booked"].includes(t.status) && (
        <Button variant="ghost" onClick={async () => { if (await confirm({ title: "Cancel this trip?", message: "Bookings are marked cancelled and an unpaid advance is withdrawn.", confirmLabel: "Cancel trip", tone: "danger" })) post(`/travel/trips/${t.uuid}/desk-cancel`, {}, "Trip cancelled"); }}>Cancel trip</Button>)}
      footer={t && (<>
        {t.mine && ["draft", "rejected"].includes(t.status) && onEdit && <Button variant="secondary" icon={Pencil} onClick={() => onEdit(t)}>Edit</Button>}
        {t.mine && t.status === "draft" && <Button variant="primary" icon={Send} onClick={() => post(`/travel/trips/${t.uuid}/submit`, undefined, "Sent for approval")}>Send for approval</Button>}
        {t.mine && ["draft", "pending", "approved"].includes(t.status) && <Button variant="ghost" onClick={async () => { if (await confirm({ title: "Cancel this trip?", confirmLabel: "Cancel trip", tone: "danger" })) post(`/travel/trips/${t.uuid}/cancel`, undefined, "Trip cancelled"); }}>Cancel trip</Button>}
        {mine && <><Button variant="secondary" onClick={() => post(`/workflow/tasks/${mine.uuid}/decision`, { decision: "reject" }, "Rejected")}>Reject</Button>
          <Button variant="primary" icon={CheckCircle2} onClick={() => post(`/workflow/tasks/${mine.uuid}/decision`, { decision: "approve" }, "Approved")}>Approve</Button></>}
        {desk && t.status === "approved" && <Button variant="secondary" onClick={() => post(`/travel/trips/${t.uuid}/mark-booked`, undefined, "Marked booked")}>Mark all booked</Button>}
        {desk && t.advance?.status === "approved" && <Button variant="secondary" icon={Wallet} onClick={() => setMoney("pay")}>Pay advance</Button>}
        {desk && t.advance?.status === "paid" && ["settled", "settling", "cancelled"].includes(t.status) && Number(t.advance.balance) > 0 && <Button variant="secondary" icon={Wallet} onClick={() => setMoney("return")}>Record advance returned</Button>}
        {canSettle && <Button variant="primary" icon={Receipt} onClick={async () => { if (await post(`/travel/trips/${t.uuid}/settle`, undefined, "Claim created from your trip")) { /* claim opens below */ } }}>Settle trip</Button>}
      </>)}>
      {!t ? <p className="py-10 text-center text-muted">Loading…</p> : (
        <div className="space-y-5">
          <div className="grid gap-3 rounded-xl bg-sunken/60 p-4 sm:grid-cols-4">
            <div><p className="text-[12px] text-muted">Estimated</p><p className="tabular text-[18px] font-light text-ink">{inr(t.estimated_total)}</p></div>
            <div><p className="text-[12px] text-muted">Booked by company</p><p className="tabular text-[18px] font-light text-ink">{inr(t.company_paid)}</p></div>
            <div><p className="text-[12px] text-muted">Daily allowance</p><p className="tabular text-[18px] font-light text-ink">{inr(Number(t.per_diem_rate) * t.per_diem_days)}</p><p className="text-[11.5px] text-faint">{t.per_diem_days} days × {inr(t.per_diem_rate)}</p></div>
            <div><p className="text-[12px] text-muted">{t.actual_cost ? "Actual cost" : "Trip"}</p><p className="tabular text-[18px] font-light text-ink">{t.actual_cost ? inr(t.actual_cost) : (t.travel_type === "international" ? "International" : "Domestic")}</p></div>
          </div>
          {(t.project_name || t.notes) && <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13.5px] text-muted">
            {t.project_name && <span>Project: <span className="text-ink">{t.project_name}</span>{t.billable ? " · billable" : ""}</span>}
            {t.notes && <span>Notes: <span className="text-ink">{t.notes}</span></span>}</div>}
          {t.policy_flags.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[13px] text-amber-800">
              <p className="mb-1 flex items-center gap-1.5 text-amber-900"><AlertTriangle size={14} strokeWidth={1.4} />Outside the travel policy</p>
              {t.policy_flags.map((f, i) => <p key={i}>{f.where}: {f.message}</p>)}
              {t.exception_reason && <p className="mt-1 text-amber-900">Reason: {t.exception_reason}</p>}
            </div>)}

          <div>
            <p className="mb-2 text-[13.5px] text-muted">Journeys</p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {t.legs?.map((l) => { const I = MODE_ICON[l.mode] ?? Plane; return (
                <li key={l.uuid} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <I size={17} strokeWidth={1.4} className="text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] text-ink">{l.from_place} → {l.to_place}</p>
                    <p className="text-[12.5px] text-faint">{formatDate(l.depart_date)}{l.travel_class ? ` · ${classLabel(l.mode, l.travel_class)}` : ""}{l.preferred_time ? ` · ${l.preferred_time}` : ""} · est. {inr(l.estimated_cost)}</p>
                    {l.booking_status === "booked" && <p className="text-[12.5px] text-emerald-700">Booked{l.vendor ? ` · ${l.vendor}` : ""}{l.booking_ref ? ` · ${l.booking_ref}` : ""} · {inr(l.booked_cost)} · {l.paid_by === "company" ? "paid by company" : "paid by traveller"}</p>}
                    {l.booking_status === "cancelled" && <p className="text-[12.5px] text-muted">Booking cancelled</p>}
                    {l.flags.length > 0 && <p className="text-[12px] text-amber-700">{l.flags.join(" · ")}</p>}
                  </div>
                  {l.has_file && <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadWithAuth(`/travel/trips/${t.uuid}/bookings/leg/${l.uuid}/file`, l.file_name ?? "ticket", true)}>Ticket</Button>}
                  {desk && ["approved", "booked"].includes(t.status) && <Button size="sm" variant="secondary" onClick={() => setBooking({ kind: "leg", item: l })}>{l.booking_status === "open" ? "Book" : "Change"}</Button>}
                </li>); })}
            </ul>
          </div>
          {!!t.stays?.length && (
            <div>
              <p className="mb-2 text-[13.5px] text-muted">Hotel stays</p>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {t.stays.map((s) => (
                  <li key={s.uuid} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <BedDouble size={17} strokeWidth={1.4} className="text-muted" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] text-ink">{s.city} <span className="text-faint">· {s.tier === "international" ? "International" : `Tier ${s.tier}`}</span></p>
                      <p className="text-[12.5px] text-faint">{formatDate(s.check_in)} – {formatDate(s.check_out)} · {s.nights} night{s.nights === 1 ? "" : "s"} · budget {inr(s.nightly_cost)} a night</p>
                      {s.booking_status === "booked" && <p className="text-[12.5px] text-emerald-700">Booked{s.vendor ? ` · ${s.vendor}` : ""}{s.booking_ref ? ` · ${s.booking_ref}` : ""} · {inr(s.booked_cost)} · {s.paid_by === "company" ? "paid by company" : "paid by traveller"}</p>}
                      {s.flags.length > 0 && <p className="text-[12px] text-amber-700">{s.flags.join(" · ")}</p>}
                    </div>
                    {s.has_file && <Button size="sm" variant="ghost" icon={Download} onClick={() => downloadWithAuth(`/travel/trips/${t.uuid}/bookings/stay/${s.uuid}/file`, s.file_name ?? "voucher", true)}>Voucher</Button>}
                    {desk && ["approved", "booked"].includes(t.status) && <Button size="sm" variant="secondary" onClick={() => setBooking({ kind: "stay", item: s })}>{s.booking_status === "open" ? "Book" : "Change"}</Button>}
                  </li>))}
              </ul>
            </div>)}

          {(t.advance || t.claim) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {t.advance && (
                <div className="rounded-xl border border-line p-4">
                  <div className="mb-1 flex items-center justify-between"><p className="text-[13.5px] text-muted">Advance</p><StatusPill status={t.advance.status} /></div>
                  <p className="tabular text-[18px] font-light text-ink">{inr(t.advance.amount)}</p>
                  <p className="text-[12.5px] text-faint">{t.advance.paid_on ? `Paid ${formatDate(t.advance.paid_on)}${t.advance.payment_ref ? ` · ${t.advance.payment_ref}` : ""}` : "Not paid yet"}
                    {Number(t.advance.settled_amount) > 0 ? ` · ${inr(t.advance.settled_amount)} set off` : ""}{Number(t.advance.recovered_amount) > 0 ? ` · ${inr(t.advance.recovered_amount)} returned` : ""}</p>
                  {t.advance.status === "paid" && Number(t.advance.balance) > 0 && t.status === "settled" && <p className="mt-1 text-[12.5px] text-amber-700">{inr(t.advance.balance)} to give back (or recovered in the final settlement)</p>}
                </div>)}
              {t.claim && (
                <button type="button" onClick={() => setClaimView(t.claim!.uuid)} className="rounded-xl border border-line p-4 text-left hover:border-line-strong">
                  <div className="mb-1 flex items-center justify-between"><p className="text-[13.5px] text-muted">Settlement claim</p><StatusPill status={t.claim.status} /></div>
                  <p className="tabular text-[18px] font-light text-ink">{inr(t.claim.total)}</p>
                  <p className="text-[12.5px] text-faint">{t.claim.number ?? "Draft"}{Number(t.claim.advance_adjusted) > 0 ? ` · ${inr(t.claim.advance_adjusted)} set off against the advance` : ""} · open</p>
                </button>)}
            </div>)}
          {t.status === "settling" && t.mine && t.claim?.status === "draft" && (
            <div className="rounded-lg border border-line bg-sunken/50 px-3 py-2 text-[13px] text-muted">Your claim is ready as a draft with your journeys, hotel nights and daily allowance. Open it, attach the bills and send it.</div>)}

          {t.approval && (
            <div className="rounded-xl border border-line p-4">
              <p className="mb-2 text-[13.5px] text-muted">Approval</p>
              {t.approval.steps.map((s) => <div key={s.uuid} className="flex items-center justify-between py-1 text-[13.5px]"><span className="text-ink">{s.name}<span className="text-faint"> · {s.approver}</span>{s.comment ? <span className="text-muted"> · {s.comment}</span> : null}</span><StatusPill status={s.status} /></div>)}
            </div>)}
          {t.decided_note && <p className="text-[13px] text-muted">Note: {t.decided_note}</p>}
          {t.submitted_at && <p className="text-[12px] text-faint">Sent {formatDateTime(t.submitted_at)}</p>}
        </div>
      )}
      {t && booking && <BookingModal trip={t} kind={booking.kind} item={booking.item} onClose={() => setBooking(null)} onSaved={(x) => { setBooking(null); setT((o) => ({ ...(o as Trip), ...x })); onChanged(); }} />}
      {t && money && <AdvanceMoneyModal trip={t} kind={money} onClose={() => setMoney(null)} onSaved={(x) => { setMoney(null); setT((o) => ({ ...(o as Trip), ...x })); onChanged(); }} />}
      <ClaimDetailModal uuid={claimView} open={!!claimView} onClose={() => setClaimView(null)} onChanged={() => { load(); onChanged(); }}
        onEdit={(c) => { setClaimView(null); setClaimEdit({ open: true, target: c, key: claimEdit.key + 1 }); }} />
      <ClaimFormModal key={claimEdit.key} open={claimEdit.open} target={claimEdit.target} onClose={() => setClaimEdit({ ...claimEdit, open: false })}
        onSaved={() => { setClaimEdit({ ...claimEdit, open: false }); load(); onChanged(); }} />
    </Modal>
  );
}

/* ── Travel desk: booking ─────────────────────────────────────────────── */

export function BookingModal({ trip, kind, item, onClose, onSaved }: { trip: Trip; kind: "leg" | "stay"; item: Leg | Stay; onClose: () => void; onSaved: (t: Trip) => void }) {
  const toast = useToast();
  const [v, setV] = useState({ booking_status: item.booking_status === "open" ? "booked" : item.booking_status, paid_by: item.paid_by || "company",
    vendor: item.vendor ?? "", booking_ref: item.booking_ref ?? "", booked_cost: item.booked_cost ? Number(item.booked_cost) : null as number | null, remove_file: false });
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const title = kind === "leg" ? `${(item as Leg).from_place} → ${(item as Leg).to_place}` : `Hotel in ${(item as Stay).city}`;
  async function save() {
    setBusy(true);
    try {
      const f = files[0];
      const r = await api.post<Trip>(`/travel/trips/${trip.uuid}/bookings/${kind}/${item.uuid}`, {
        ...v, vendor: v.vendor || null, booking_ref: v.booking_ref || null, file_data: f ? await readFile(f) : null, file_name: f?.name ?? null });
      toast.success("Booking saved"); onSaved(r);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" title={title} description={kind === "leg" ? "Record the ticket" : "Record the hotel booking"} busy={busy} zIndex={60} dirty
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Status"><RadioCards value={v.booking_status} onChange={(x) => setV({ ...v, booking_status: x })} columns={3}
          options={[{ value: "booked", label: "Booked" }, { value: "open", label: "Not booked yet" }, { value: "cancelled", label: "Cancelled" }]} /></Field>
        <FormGrid columns={2}>
          <Field label={kind === "leg" ? "Airline, train or operator" : "Hotel"}><TextInput value={v.vendor} onValueChange={(x) => setV({ ...v, vendor: x })} placeholder={kind === "leg" ? "e.g. IndiGo 6E 512" : "e.g. Hotel Deccan"} /></Field>
          <Field label={kind === "leg" ? "PNR or booking number" : "Confirmation number"}><TextInput value={v.booking_ref} onValueChange={(x) => setV({ ...v, booking_ref: x })} /></Field>
          <Field label="Cost (₹)" required={v.booking_status === "booked"}><NumberInput value={v.booked_cost} onChange={(x) => setV({ ...v, booked_cost: x })} min={0} /></Field>
          <Field label="Paid by"><Select value={v.paid_by} onChange={(x) => setV({ ...v, paid_by: x ?? "company" })}
            options={[{ value: "company", label: "Company (not claimed)" }, { value: "employee", label: "Traveller (claimed later)" }]} /></Field>
        </FormGrid>
        <Field label={kind === "leg" ? "Ticket" : "Voucher"} hint="PDF or photo, up to 2 MB">
          <FileDrop value={files} onChange={setFiles} accept="application/pdf,image/*" maxSizeMb={2} />
        </Field>
        {item.has_file && !files.length && (
          <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[13px]">
            <span className="text-ink">{item.file_name ?? "Attached"}</span>
            <Button size="sm" variant="ghost" icon={X} onClick={() => setV({ ...v, remove_file: !v.remove_file })}>{v.remove_file ? "Keep it" : "Remove"}</Button>
          </div>)}
      </div>
    </Modal>
  );
}

function AdvanceMoneyModal({ trip, kind, onClose, onSaved }: { trip: Trip; kind: "pay" | "return"; onClose: () => void; onSaved: (t: Trip) => void }) {
  const toast = useToast();
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const r = await api.post<Trip>(`/travel/trips/${trip.uuid}/${kind === "pay" ? "pay-advance" : "return-advance"}`, { reference: ref || null });
      toast.success(kind === "pay" ? "Advance paid" : "Advance closed"); onSaved(r);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} size="sm" zIndex={60} busy={busy} title={kind === "pay" ? "Pay the advance" : "Advance given back"}
      description={kind === "pay" ? `${inr(trip.advance?.amount)} to ${trip.employee_name ?? "the traveller"}` : `${inr(trip.advance?.balance)} left after the claim`}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={save}>Save</Button></>}>
      <Field label={kind === "pay" ? "Bank reference (UTR)" : "How it was returned"}><TextInput value={ref} onValueChange={setRef} placeholder={kind === "pay" ? "e.g. UTR number" : "e.g. Bank transfer on 10 Nov"} /></Field>
    </Modal>
  );
}
