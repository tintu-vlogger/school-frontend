"use client";

/*
 * Job history and lifecycle on the employee profile.
 *
 *   <HistoryPanel profile={p} canEdit onChanged={reload} />   timeline + "Record a change"
 *   <JobChangeModal open profile onClose onSaved />            transfer, promotion, manager change ... (effective-dated)
 *   <StageModal open profile target="notice" onClose onSaved /> confirm, notice, exit, back to work
 *   <RehireModal open profile onClose onSaved />
 */
import { useState } from "react";
import {
  ArrowRightLeft, Ban, BriefcaseBusiness, CalendarClock, CheckCircle2, CircleDot, LogOut, Repeat, TrendingUp, UserCheck, UserPlus, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { todayISO } from "@/lib/datetime";
import {
  Badge, Button, DateInput, Field, FormGrid, MasterSelect, Modal, ModalCancel, NumberInput, Select, TextInput, Textarea, Timeline,
  useConfirm, type IconType, type TimelineItem,
} from "@/components/ui-kit";
import { PositionPicker, usePositionsSetup } from "@/components/positions/shared";
import type { Position } from "@/components/positions/types";
import { lookupEmployees, useOrgOptions } from "./hooks";
import { CHANGE_TYPES, STATUS, WORK_MODES, day, type HistoryItem, type Profile } from "./types";

const ICONS: Record<string, IconType> = {
  joining: UserPlus, transfer: ArrowRightLeft, entity_transfer: ArrowRightLeft, promotion: TrendingUp, redesignation: BriefcaseBusiness,
  department_change: Users, manager_change: Users, grade_change: TrendingUp, type_change: BriefcaseBusiness, confirmation: UserCheck,
  status: CircleDot, exit: LogOut, rehire: Repeat, update: BriefcaseBusiness, other: CircleDot,
};
const TONE: Record<string, TimelineItem["tone"]> = { joining: "good", promotion: "good", confirmation: "good", rehire: "good", exit: "bad", transfer: "accent", entity_transfer: "accent" };

export function HistoryPanel({ profile, canEdit, onChanged }: { profile: Profile; canEdit: boolean; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);

  async function cancel(h: HistoryItem) {
    if (!(await confirm({ title: "Cancel this scheduled change?", message: "It won't take effect.", confirmLabel: "Cancel change", tone: "danger" }))) return;
    try { await api.post(`/employees/${profile.uuid}/job-changes/${h.uuid}/cancel`); toast.success("Change cancelled"); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't cancel"); }
  }

  const items: TimelineItem[] = profile.history.filter((h) => h.status !== "cancelled").map((h) => ({
    id: h.uuid,
    icon: h.status === "scheduled" ? CalendarClock : ICONS[h.change_type] ?? CircleDot,
    tone: h.status === "scheduled" ? "warn" : TONE[h.change_type] ?? "neutral",
    title: <span className="flex flex-wrap items-center gap-2">{h.change_label}{h.status === "scheduled" && <Badge tone="warn">Scheduled</Badge>}</span>,
    time: day(h.effective_date),
    description: (
      <div className="space-y-1">
        {h.items.length > 0 && (
          <ul className="space-y-0.5">
            {h.items.map((it, i) => (
              <li key={i}><span className="text-faint">{it.label}:</span>{" "}
                {it.old ? <><span className="line-through decoration-line-strong">{it.old}</span> → </> : null}<span className="text-ink/80">{it.new ?? "cleared"}</span></li>
            ))}
          </ul>
        )}
        {h.reason && <p>{h.reason}</p>}
        <p className="text-[12px] text-faint">{h.created_by_name ? `By ${h.created_by_name}` : ""}
          {h.status === "scheduled" && canEdit && <button type="button" onClick={() => cancel(h)} className="ml-2 text-primary hover:underline">Cancel</button>}
        </p>
      </div>
    ),
  }));

  return (
    <section className="rounded-2xl border border-line bg-surface">
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <p className="text-[15px] text-ink">History in the company</p>
        {canEdit && profile.status !== "exited" && profile.status !== "archived" && (
          <Button size="sm" icon={ArrowRightLeft} onClick={() => { setKey((k) => k + 1); setOpen(true); }}>Record a change</Button>
        )}
      </header>
      <div className="px-5 py-5">
        {items.length ? <Timeline items={items} /> : <p className="text-[13.5px] text-muted">No changes recorded yet.</p>}
      </div>
      <JobChangeModal key={key} open={open} profile={profile} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); onChanged(); }} />
    </section>
  );
}

const JOB_FIELDS = [
  { value: "designation_id", label: "Designation" }, { value: "department_id", label: "Department" }, { value: "location_id", label: "Location" },
  { value: "legal_entity_id", label: "Legal entity" }, { value: "grade_id", label: "Grade" }, { value: "reporting_manager_id", label: "Reporting manager" },
  { value: "secondary_manager_id", label: "Secondary manager" }, { value: "employment_type_id", label: "Employment type" },
  { value: "cost_centre_id", label: "Cost centre" }, { value: "work_mode", label: "Work mode" }, { value: "notice_period_days", label: "Notice period" },
];
const SUGGESTED: Record<string, string[]> = {
  transfer: ["location_id"], promotion: ["designation_id", "grade_id"], redesignation: ["designation_id"], department_change: ["department_id"],
  manager_change: ["reporting_manager_id"], entity_transfer: ["legal_entity_id", "location_id"], grade_change: ["grade_id"],
  type_change: ["employment_type_id"], other: [],
};

export function JobChangeModal({ open, profile, onClose, onSaved }: { open: boolean; profile: Profile; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const o = useOrgOptions();
  const [type, setType] = useState("transfer");
  const [fields, setFields] = useState<string[]>(SUGGESTED.transfer);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const current = profile as unknown as Record<string, unknown>;
  const positions = usePositionsSetup();
  const [position, setPosition] = useState<Position | null>(null);
  const SEAT_KINDS = ["transfer", "promotion", "redesignation", "department_change"];

  async function save() {
    if (position) {
      // Moving into a position: the seat sets department, designation, location, grade, cost centre and manager.
      setSaving(true);
      try {
        const r = await api.post<{ status: string }>(`/positions/positions/${position.uuid}/seats`, {
          employee_id: profile.id, effective_date: date, reason: reason || null, change_type: SEAT_KINDS.includes(type) ? type : "other" });
        toast.success(r.status === "reserved" ? `Moves into ${position.title} on ${day(date)}` : `Moved into ${position.title}`, { description: "It shows in the history." });
        onSaved();
      } catch (e) { toast.error("Couldn't record the change", { description: e instanceof Error ? e.message : undefined }); } finally { setSaving(false); }
      return;
    }
    if (positions.required && SEAT_KINDS.includes(type)) { setError("Pick the vacant position they move into"); return; }
    const changes = Object.fromEntries(fields.filter((f) => values[f] !== undefined).map((f) => [f, values[f] === "" ? null : values[f]]));
    if (!Object.keys(changes).length) { setError("Pick at least one new value"); return; }
    setSaving(true);
    try {
      const r = await api.post<{ status: string }>(`/employees/${profile.uuid}/job-changes`, { change_type: type, effective_date: date, reason: reason || null, remarks: remarks || null, changes });
      toast.success(r.status === "scheduled" ? `Scheduled for ${day(date)}` : "Change applied", { description: "It shows in the history." });
      onSaved();
    } catch (e) { toast.error("Couldn't record the change", { description: e instanceof Error ? e.message : undefined }); } finally { setSaving(false); }
  }

  const input = (f: string) => {
    const val = (values[f] ?? null) as number | string | null;
    const set = (x: unknown) => { setValues((v) => ({ ...v, [f]: x })); setError(""); };
    switch (f) {
      case "designation_id": return <Select value={val as number | null} onChange={set} options={o.designations} placeholder="Pick" />;
      case "department_id": return <Select value={val as number | null} onChange={set} options={o.departments} placeholder="Pick" />;
      case "location_id": return <Select value={val as number | null} onChange={set} options={o.locations} placeholder="Pick" />;
      case "legal_entity_id": return <Select value={val as number | null} onChange={set} options={o.entities} placeholder="Pick" />;
      case "grade_id": return <Select value={val as number | null} onChange={set} options={o.grades} placeholder="Pick" />;
      case "cost_centre_id": return <Select value={val as number | null} onChange={set} options={o.costCentres} placeholder="Pick" />;
      case "employment_type_id": return <MasterSelect type="employment_type" value={val as number | null} onChange={set} />;
      case "work_mode": return <Select value={val as string | null} onChange={set} options={WORK_MODES} placeholder="Pick" />;
      case "notice_period_days": return <NumberInput value={val as number | null} onChange={set} min={0} max={365} suffix="days" />;
      default: return <Select<number> value={val as number | null} onChange={set} loadOptions={lookupEmployees(profile.id)} placeholder="Search people" clearable />;
    }
  };
  const currentLabel = (f: string) => {
    const names: Record<string, unknown> = {
      designation_id: profile.designation_name, department_id: profile.department_name, location_id: profile.location_name,
      legal_entity_id: profile.legal_entity_name, grade_id: profile.grade_name, cost_centre_id: profile.cost_centre_name,
      employment_type_id: profile.employment_type_name, reporting_manager_id: profile.reporting_manager?.name,
      secondary_manager_id: profile.secondary_manager?.name, work_mode: profile.work_mode_label,
      notice_period_days: profile.notice_period_days != null ? `${profile.notice_period_days} days` : null,
    };
    return (names[f] as string) || (current[f] ? String(current[f]) : "Not set");
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" busy={saving} title="Record a job change"
      description="Dated today or earlier, it applies now. A future date schedules it."
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>{date > todayISO() ? "Schedule change" : "Apply change"}</Button></>}>
      <FormGrid>
        <Field label="Kind of change"><Select value={type} onChange={(x) => { const t = x ?? "other"; setType(t); setFields(SUGGESTED[t] ?? []); setValues({}); }} options={CHANGE_TYPES} /></Field>
        <Field label="Takes effect on"><DateInput value={date} onChange={setDate} min={profile.date_of_joining ?? undefined} /></Field>
        {positions.enabled && (
          <Field label="Position" className="sm:col-span-2" required={positions.required && SEAT_KINDS.includes(type)}
            hint={position ? `Department, designation, location, grade and manager follow ${position.code}.` : "Pick the vacant position they move into."}>
            <PositionPicker value={position?.uuid ?? null} onChange={(_, p) => { setPosition(p); setError(""); }} />
          </Field>
        )}
        {!position && <Field label="What changes" className="sm:col-span-2" error={error}>
          <div className="flex flex-wrap gap-1.5">
            {JOB_FIELDS.map((f) => {
              const on = fields.includes(f.value);
              return <button key={f.value} type="button" onClick={() => setFields(on ? fields.filter((x) => x !== f.value) : [...fields, f.value])}
                className={`h-8 rounded-full border px-3 text-[13px] transition-colors ${on ? "border-primary/40 bg-primary-soft text-primary" : "border-line text-muted hover:border-line-strong"}`}>{f.label}</button>;
            })}
          </div>
        </Field>}
        {!position && fields.map((f) => (
          <Field key={f} label={`New ${JOB_FIELDS.find((x) => x.value === f)?.label.toLowerCase()}`} hint={`Now: ${currentLabel(f)}`}>{input(f)}</Field>
        ))}
        {position && error && <p className="text-[13px] text-rose-600 sm:col-span-2">{error}</p>}
        <Field label="Reason" className="sm:col-span-2"><TextInput value={reason} onValueChange={setReason} placeholder="e.g. Annual appraisal, new office" /></Field>
        <Field label="Remarks" aside="Optional" className="sm:col-span-2"><Textarea value={remarks} onValueChange={setRemarks} rows={2} /></Field>
      </FormGrid>
    </Modal>
  );
}

export type StageTarget = "confirmed" | "probation" | "notice" | "exited";
const STAGE_COPY: Record<StageTarget, { title: string; action: string; icon: IconType }> = {
  confirmed: { title: "Confirm employment", action: "Confirm", icon: CheckCircle2 },
  probation: { title: "Extend probation", action: "Save", icon: CalendarClock },
  notice: { title: "Record resignation", action: "Put on notice", icon: LogOut },
  exited: { title: "Record exit", action: "Record exit", icon: Ban },
};

export function StageModal({ open, profile, target, onClose, onSaved }: { open: boolean; profile: Profile; target: StageTarget; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [lastDay, setLastDay] = useState(() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + (profile.notice_period_days ?? 30));
    return d.toISOString().slice(0, 10);
  });
  const [probationEnd, setProbationEnd] = useState(profile.probation_end_date ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const copy = STAGE_COPY[target];
  const backToWork = target === "confirmed" && profile.status === "notice";

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { status: target, effective_date: date, reason: reason || null };
      if (target === "notice") { body.resignation_date = date; body.exit_date = lastDay; }
      if (target === "exited") body.exit_date = date;
      if (target === "confirmed" && !backToWork) body.confirmation_date = date;
      if (target === "probation") body.probation_end_date = probationEnd || null;
      await api.post(`/employees/${profile.uuid}/status`, body);
      toast.success(backToWork ? "Resignation withdrawn" : `${STATUS[target].label}`);
      onSaved();
    } catch (e) { toast.error("Couldn't change the stage", { description: e instanceof Error ? e.message : undefined }); } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title={backToWork ? "Withdraw resignation" : copy.title} description={profile.full_name}
      footer={<><ModalCancel /><Button variant={target === "exited" ? "danger" : "primary"} icon={copy.icon} onClick={save} loading={saving}>{backToWork ? "Withdraw" : copy.action}</Button></>}>
      <div className="space-y-5">
        <Field label={target === "notice" ? "Resigned on" : target === "exited" ? "Last working day" : "Effective from"}>
          <DateInput value={date} onChange={setDate} />
        </Field>
        {target === "notice" && <Field label="Last working day" hint={`Notice period: ${profile.notice_period_days ?? 30} days`}><DateInput value={lastDay} onChange={setLastDay} min={date} /></Field>}
        {target === "probation" && <Field label="Probation now ends on"><DateInput value={probationEnd} onChange={setProbationEnd} /></Field>}
        {target === "exited" && <p className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[13px] text-amber-800">They will no longer be able to sign in. The record, history and documents stay; you can rehire them later.</p>}
        <Field label="Reason" aside="Optional"><Textarea value={reason} onValueChange={setReason} rows={2} /></Field>
      </div>
    </Modal>
  );
}

export function RehireModal({ open, profile, onClose, onSaved }: { open: boolean; profile: Profile; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const o = useOrgOptions();
  const [v, setV] = useState({ date: todayISO(), status: "probation", probation_end: "", designation_id: profile.designation_id, location_id: profile.location_id, reason: "" });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api.post(`/employees/${profile.uuid}/rehire`, {
        date_of_joining: v.date, status: v.status, probation_end_date: v.probation_end || null, reason: v.reason || null,
        designation_id: v.designation_id, location_id: v.location_id,
      });
      toast.success(`${profile.first_name} is rehired`, { description: "Their earlier history, UAN and documents are kept." });
      onSaved();
    } catch (e) { toast.error("Couldn't rehire", { description: e instanceof Error ? e.message : undefined }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title={`Rehire ${profile.full_name}`}
      description={profile.exit_date ? `Left on ${day(profile.exit_date)}. The same record continues, with its history.` : undefined}
      footer={<><ModalCancel /><Button variant="primary" icon={Repeat} onClick={save} loading={saving}>Rehire</Button></>}>
      <FormGrid>
        <Field label="New joining date"><DateInput value={v.date} onChange={(x) => setV({ ...v, date: x })} /></Field>
        <Field label="Starts as"><Select value={v.status} onChange={(x) => setV({ ...v, status: x ?? "probation" })} options={[
          { value: "pre_joining", label: "Pre-joining" }, { value: "probation", label: "On probation" }, { value: "confirmed", label: "Confirmed" }]} /></Field>
        {v.status === "probation" && <Field label="Probation ends"><DateInput value={v.probation_end} onChange={(x) => setV({ ...v, probation_end: x })} clearable /></Field>}
        <Field label="Designation"><Select value={v.designation_id} onChange={(x) => setV({ ...v, designation_id: x })} options={o.designations} clearable /></Field>
        <Field label="Location"><Select value={v.location_id} onChange={(x) => setV({ ...v, location_id: x })} options={o.locations} clearable /></Field>
        <Field label="Reason" className="sm:col-span-2"><TextInput value={v.reason} onValueChange={(x) => setV({ ...v, reason: x })} /></Field>
      </FormGrid>
    </Modal>
  );
}
