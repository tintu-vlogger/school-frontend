"use client";

/* Shift master: list and the add/edit modal (timings, breaks, grace, minimum hours,
 * flexible core hours, overtime, allowance, weekly offs). */
import { useEffect, useState } from "react";
import { Ban, CheckCircle2, Clock3, MoonStar, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, Checkbox, DataTable, Field, FormGrid, FormSection, Modal, ModalCancel, NumberInput, Select, TextInput,
  Textarea, TimeInput, Toggle,
} from "@/components/ui-kit";
import { SHIFT_COLORS, WEEKDAYS, errorText, minutesText, shiftColor } from "./shared";
import type { Shift } from "./roster-types";

type Form = {
  name: string; code: string; color: string; start_time: string; end_time: string;
  breaks: { name: string; start: string; end: string; paid: boolean }[];
  grace_in_minutes: number | null; grace_out_minutes: number | null; half_day_hours: number | null; full_day_hours: number | null;
  is_flexible: boolean; core_start: string; core_end: string; overtime_after_minutes: number | null;
  allowance_amount: number | null; allowance_min_hours: number | null; weekly_offs: number[]; is_default: boolean;
  active: boolean; description: string;
};

const blank: Form = {
  name: "", code: "", color: "indigo", start_time: "09:30", end_time: "18:30",
  breaks: [{ name: "Lunch", start: "13:30", end: "14:30", paid: false }], grace_in_minutes: 10, grace_out_minutes: 10,
  half_day_hours: 4, full_day_hours: 8, is_flexible: false, core_start: "", core_end: "", overtime_after_minutes: 30,
  allowance_amount: 0, allowance_min_hours: null, weekly_offs: [5, 6], is_default: false, active: true, description: "",
};

function toForm(s: Shift): Form {
  return {
    name: s.name, code: s.code || "", color: s.color, start_time: s.start_time, end_time: s.end_time, breaks: s.breaks || [],
    grace_in_minutes: s.grace_in_minutes, grace_out_minutes: s.grace_out_minutes, half_day_hours: s.half_day_hours,
    full_day_hours: s.full_day_hours, is_flexible: s.is_flexible, core_start: s.core_start || "", core_end: s.core_end || "",
    overtime_after_minutes: s.overtime_after_minutes, allowance_amount: Number(s.allowance_amount || 0),
    allowance_min_hours: s.allowance_min_hours, weekly_offs: s.weekly_offs || [], is_default: s.is_default, active: s.active,
    description: s.description || "",
  };
}

function ShiftModal({ shift, open, onClose, onSaved }: { shift: Shift | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<Form>(shift ? toForm(shift) : blank);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const crosses = f.end_time && f.start_time && f.end_time <= f.start_time;

  async function save() {
    setSaving(true);
    try {
      const body = {
        ...f, code: f.code || null, description: f.description || null,
        core_start: f.is_flexible ? f.core_start || null : null, core_end: f.is_flexible ? f.core_end || null : null,
      };
      if (shift) await api.put(`/shifts/${shift.uuid}`, body);
      else await api.post("/shifts/", body);
      toast.success("Shift saved");
      onSaved();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save the shift"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" busy={saving} dirty title={shift ? `Edit ${shift.name}` : "Add shift"}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!f.name.trim()} onClick={save}>Save shift</Button></>}>
      <div className="space-y-6">
        <FormGrid columns={3}>
          <Field label="Name" required className="sm:col-span-2"><TextInput value={f.name} onValueChange={(v) => set("name", v)} data-autofocus /></Field>
          <Field label="Short code" hint="Shown on the roster"><TextInput value={f.code} maxLength={12} onValueChange={(v) => set("code", v)} placeholder="G" /></Field>
          <Field label="Starts"><TimeInput value={f.start_time} onChange={(v) => set("start_time", v)} /></Field>
          <Field label="Ends" hint={crosses ? "Ends the next day (night shift)" : undefined}><TimeInput value={f.end_time} onChange={(v) => set("end_time", v)} /></Field>
          <Field label="Colour">
            <Select value={f.color} onChange={(v) => set("color", v || "indigo")}
              options={Object.keys(SHIFT_COLORS).map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1), icon: <span className={`h-3 w-3 rounded-full ${SHIFT_COLORS[c].dot}`} /> }))} />
          </Field>
        </FormGrid>

        <FormSection title="Breaks" description="Unpaid breaks are taken off worked hours; paid breaks are not.">
          <div className="space-y-2">
            {f.breaks.map((b, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <Field label={i === 0 ? "Name" : undefined} className="min-w-[140px] flex-1"><TextInput value={b.name} onValueChange={(v) => set("breaks", f.breaks.map((x, j) => (j === i ? { ...x, name: v } : x)))} /></Field>
                <Field label={i === 0 ? "From" : undefined} className="w-32"><TimeInput value={b.start} onChange={(v) => set("breaks", f.breaks.map((x, j) => (j === i ? { ...x, start: v } : x)))} /></Field>
                <Field label={i === 0 ? "To" : undefined} className="w-32"><TimeInput value={b.end} onChange={(v) => set("breaks", f.breaks.map((x, j) => (j === i ? { ...x, end: v } : x)))} /></Field>
                <div className="pb-2"><Toggle size="sm" checked={b.paid} label="Paid" onChange={(v) => set("breaks", f.breaks.map((x, j) => (j === i ? { ...x, paid: v } : x)))} /></div>
                <Button size="sm" variant="ghost" icon={Trash2} aria-label="Remove break" onClick={() => set("breaks", f.breaks.filter((_, j) => j !== i))} />
              </div>
            ))}
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => set("breaks", [...f.breaks, { name: "Break", start: "16:00", end: "16:15", paid: true }])}>Add break</Button>
          </div>
        </FormSection>

        <FormSection title="Time rules">
          <FormGrid columns={3}>
            <Field label="Grace for late arrival"><NumberInput value={f.grace_in_minutes} onChange={(v) => set("grace_in_minutes", v)} min={0} max={600} suffix="min" /></Field>
            <Field label="Grace for early leaving"><NumberInput value={f.grace_out_minutes} onChange={(v) => set("grace_out_minutes", v)} min={0} max={600} suffix="min" /></Field>
            <Field label="Overtime starts after" hint="Beyond the shift's hours"><NumberInput value={f.overtime_after_minutes} onChange={(v) => set("overtime_after_minutes", v)} min={0} max={600} suffix="min" /></Field>
            <Field label="Hours for a full day" hint="Empty: from the attendance rule"><NumberInput value={f.full_day_hours} onChange={(v) => set("full_day_hours", v)} min={0} max={24} step={0.5} suffix="h" /></Field>
            <Field label="Hours for a half day"><NumberInput value={f.half_day_hours} onChange={(v) => set("half_day_hours", v)} min={0} max={24} step={0.5} suffix="h" /></Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Flexible hours">
          <Toggle checked={f.is_flexible} onChange={(v) => set("is_flexible", v)} label="Flexible shift" description="People can come and go within the shift; only the core hours and total hours count." />
          {f.is_flexible && (
            <FormGrid>
              <Field label="Core hours from"><TimeInput value={f.core_start} onChange={(v) => set("core_start", v)} /></Field>
              <Field label="Core hours to"><TimeInput value={f.core_end} onChange={(v) => set("core_end", v)} /></Field>
            </FormGrid>
          )}
        </FormSection>

        <FormSection title="Shift allowance" description="Paid per day worked on this shift (e.g. night allowance), sent to payroll.">
          <FormGrid>
            <Field label="Amount per day"><NumberInput value={f.allowance_amount} onChange={(v) => set("allowance_amount", v)} min={0} suffix="₹" /></Field>
            <Field label="Only after working"><NumberInput value={f.allowance_min_hours} onChange={(v) => set("allowance_min_hours", v)} min={0} max={24} step={0.5} suffix="h" /></Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Weekly offs" description="Used for people on this shift who have no work arrangement of their own.">
          <div className="flex flex-wrap gap-4">
            {WEEKDAYS.map((d, i) => (
              <Checkbox key={d} label={d} checked={f.weekly_offs.includes(i)}
                onChange={(c) => set("weekly_offs", c ? [...f.weekly_offs, i].sort() : f.weekly_offs.filter((x) => x !== i))} />
            ))}
          </div>
        </FormSection>

        <div className="space-y-3">
          <Toggle checked={f.is_default} onChange={(v) => set("is_default", v)} label="Default shift" description="For anyone without a shift of their own." />
          <Toggle checked={f.active} onChange={(v) => set("active", v)} label="In use" />
          <Field label="Description"><Textarea value={f.description} onValueChange={(v) => set("description", v)} rows={2} autoGrow /></Field>
        </div>
      </div>
    </Modal>
  );
}

export function ShiftsTab() {
  const toast = useToast();
  const [rows, setRows] = useState<Shift[] | null>(null);
  const [editing, setEditing] = useState<Shift | "new" | null>(null);
  const [session, setSession] = useState(0);
  const load = () => api.get<Shift[]>("/shifts/").then(setRows).catch((e) => { setRows([]); toast.error(errorText(e)); });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(s: Shift, patch: Partial<Shift>) {
    try {
      await api.put(`/shifts/${s.uuid}`, patch);
      load();
    } catch (e) {
      toast.error(errorText(e));
    }
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" icon={Plus} onClick={() => { setSession((s) => s + 1); setEditing("new"); }}>Add shift</Button>
      </div>
      <DataTable rows={rows ?? []} loading={rows === null} rowKey={(s) => s.uuid}
        onRowClick={(s) => { setSession((x) => x + 1); setEditing(s); }}
        rowClassName={(s) => (s.active ? undefined : "[&_td]:opacity-60")}
        columns={[
          {
            key: "name", header: "Shift", cell: (s) => (
              <div className="flex items-center gap-2.5">
                <span className={`inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-1.5 text-[12px] ${shiftColor(s.color).chip}`}>{s.code}</span>
                <span className="text-ink">{s.name}</span>
                {s.is_default && <Badge tone="accent">Default</Badge>}
              </div>
            ),
          },
          {
            key: "time", header: "Timings", cell: (s) => (
              <span className="flex items-center gap-2 tabular text-muted">
                {s.start_time} to {s.end_time}
                {s.crosses_midnight && <Badge tone="info"><MoonStar size={12} strokeWidth={1.4} className="mr-1" />Crosses midnight</Badge>}
                {s.is_flexible && <Badge tone="neutral">Flexible {s.core_start}–{s.core_end}</Badge>}
              </span>
            ),
          },
          { key: "hours", header: "Work hours", hideBelow: "md", cell: (s) => <span className="text-muted">{minutesText(s.scheduled_minutes)}</span> },
          { key: "grace", header: "Grace", hideBelow: "lg", cell: (s) => <span className="text-muted">{s.grace_in_minutes} / {s.grace_out_minutes} min</span> },
          { key: "allow", header: "Allowance", hideBelow: "lg", cell: (s) => Number(s.allowance_amount) ? <span className="text-muted">₹{Number(s.allowance_amount)} a day</span> : <span className="text-faint">—</span> },
          { key: "status", header: "Status", cell: (s) => <Badge tone={s.active ? "good" : "neutral"} dot>{s.active ? "In use" : "Off"}</Badge> },
        ]}
        rowActions={(s) => [
          { label: "Edit", icon: Pencil, onSelect: () => { setSession((x) => x + 1); setEditing(s); } },
          ...(!s.is_default && s.active ? [{ label: "Make default", icon: Star, onSelect: () => toggle(s, { is_default: true }) }] : []),
          "separator" as const,
          s.active
            ? { label: "Switch off", icon: Ban, danger: true, onSelect: () => toggle(s, { active: false }) }
            : { label: "Switch on", icon: CheckCircle2, onSelect: () => toggle(s, { active: true }) },
        ]}
        emptyIcon={Clock3} emptyTitle="No shifts yet" />
      <ShiftModal key={session} open={editing !== null} shift={editing === "new" ? null : editing}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </>
  );
}
