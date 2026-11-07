"use client";

/*
 * One person's attendance for one day: status, shift, hours, punches (with selfie and
 * source), notes, requests and adjustments. People who manage attendance can set the
 * status by hand, add a punch and set a punch aside.
 */
import { useCallback, useEffect, useState } from "react";
import { Camera, Eraser, EyeOff, Eye, Plus, SquarePen } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime, formatTime } from "@/lib/datetime";
import {
  Badge, Button, DateInput, Field, FormGrid, KeyValue, Modal, ModalCancel, Select, Skeleton, Textarea, TimeInput, useConfirm,
} from "@/components/ui-kit";
import { RequestStatus, STATUS, StatusBadge, errorText, minutesText } from "./shared";

export type Punch = {
  uuid: string; punched_at: string; direction: string | null; source: string; distance_m: number | null;
  fence_name: string | null; has_selfie: boolean; ignored: boolean; note: string | null;
};
export type DayDetail = {
  uuid: string; employee_id: number; employee_name: string; employee_uuid: string; date: string; status: string;
  status_label: string; day_type: string; shift_name: string | null; shift_start: string | null; shift_end: string | null;
  first_in: string | null; last_out: string | null; worked_minutes: number; break_minutes: number; late_minutes: number;
  early_minutes: number; overtime_minutes: number; unapproved_overtime_minutes: number; night_minutes: number;
  permission_minutes: number; is_late: boolean; is_early_exit: boolean; is_night_shift: boolean; shift_allowance: boolean;
  payable_days: string; lop_days: string; penalty_lop_days: string; holiday_name: string | null; notes: string[];
  override_status: string | null; override_note: string | null; locked: boolean;
  punches: Punch[];
  requests: { uuid: string; kind_label: string; status: string; date: string; end_date: string | null; reason: string | null }[];
  rule: { name: string; version: number } | null;
  adjustments: { payable_days_delta: string; lop_days_delta: string; overtime_minutes_delta: number; apply_from: string; new_status: string | null }[];
};

const SOURCES: Record<string, string> = {
  web: "Web", mobile: "Phone", device: "Device", file: "File import", ftp: "FTP file", api: "Device software", database: "Device database", regularisation: "Correction", admin: "Added by HR",
};

export function DayDetailModal({ uuid, canManage, onClose, onChanged }: {
  uuid: string | null; canManage?: boolean; onClose: () => void; onChanged?: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [loaded, setLoaded] = useState<DayDetail | null>(null);
  const d = loaded && loaded.uuid === uuid ? loaded : null;
  const [mode, setMode] = useState<null | "override" | "punch">(null);
  const [selfie, setSelfie] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!uuid) return;
    api.get<DayDetail>(`/attendance/records/${uuid}`).then(setLoaded).catch((e) => { toast.error(errorText(e, "Couldn't load the day")); onClose(); });
  }, [uuid, toast, onClose]);
  useEffect(() => { load(); }, [load]);

  async function toggleIgnore(p: Punch) {
    if (!p.ignored && !(await confirm({ title: "Set this punch aside?", message: "It will not count for the day. You can restore it later.", confirmLabel: "Set aside" }))) return;
    try {
      await api.post(`/attendance/punches/${p.uuid}/ignore`, { ignored: !p.ignored, note: p.ignored ? null : "Set aside by HR" });
      toast.success(p.ignored ? "Punch restored" : "Punch set aside");
      load(); onChanged?.();
    } catch (e) { toast.error(errorText(e)); }
  }

  async function showSelfie(p: Punch) {
    try { setSelfie((await api.get<{ selfie: string }>(`/attendance/punches/${p.uuid}/selfie`)).selfie); }
    catch (e) { toast.error(errorText(e, "No photo")); }
  }

  async function clearOverride() {
    if (!d) return;
    try {
      await api.post(`/attendance/records/${d.uuid}/override`, { status: null, note: null });
      toast.success("Status worked out again from punches"); load(); onChanged?.();
    } catch (e) { toast.error(errorText(e)); }
  }

  return (
    <>
      <Modal open={!!uuid} onClose={onClose} size="lg"
        title={d ? d.employee_name : "Attendance"}
        description={d ? `${formatDate(d.date, { weekday: "long" })}${d.shift_name ? ` · ${d.shift_name} shift` : ""}` : undefined}
        headerActions={d && <StatusBadge status={d.status} />}
        footerStart={d && canManage && !d.locked && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={SquarePen} onClick={() => setMode("override")}>Set status</Button>
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => setMode("punch")}>Add punch</Button>
            {d.override_status && <Button size="sm" variant="ghost" icon={Eraser} onClick={clearOverride}>Clear hand-set status</Button>}
          </div>
        )}
        footer={<ModalCancel>Close</ModalCancel>}>
        {!d ? <Skeleton className="h-64" /> : (
          <div className="space-y-6">
            {d.locked && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13.5px] text-amber-800">This day is in a locked pay period. Changes go to the next period as adjustments.</p>}
            <KeyValue columns={3} items={[
              { label: "First in", value: d.first_in ? formatTime(d.first_in) : null },
              { label: "Last out", value: d.last_out ? formatTime(d.last_out) : null },
              { label: "Worked", value: minutesText(d.worked_minutes) },
              { label: "Shift", value: d.shift_start ? `${formatTime(d.shift_start)} – ${formatTime(d.shift_end)}` : null },
              { label: "Late", value: d.is_late ? minutesText(d.late_minutes) : "No" },
              { label: "Left early", value: d.is_early_exit ? minutesText(d.early_minutes) : "No" },
              { label: "Overtime", value: d.overtime_minutes ? minutesText(d.overtime_minutes) : "None" },
              { label: "Night hours", value: d.night_minutes ? minutesText(d.night_minutes) : "None" },
              { label: "Payable / LOP", value: `${Number(d.payable_days)} / ${Number(d.lop_days) + Number(d.penalty_lop_days)}` },
            ]} />
            {(d.notes.length > 0 || d.override_note) && (
              <div className="flex flex-wrap gap-1.5">
                {d.notes.map((n) => <Badge key={n} tone="neutral">{n}</Badge>)}
                {d.override_note && <Badge tone="accent">HR note: {d.override_note}</Badge>}
              </div>
            )}
            <section>
              <p className="mb-2 text-[13px] text-muted">Punches</p>
              {d.punches.length === 0 ? <p className="text-[13.5px] text-faint">No punches.</p> : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {d.punches.map((p) => (
                    <li key={p.uuid} className={`flex items-center gap-3 px-4 py-2.5 text-[14px] ${p.ignored ? "opacity-50" : ""}`}>
                      <span className="tabular w-20 text-ink">{formatTime(p.punched_at)}</span>
                      <span className="w-12 text-muted">{p.direction === "in" ? "In" : p.direction === "out" ? "Out" : "—"}</span>
                      <span className="flex-1 truncate text-muted">
                        {SOURCES[p.source] ?? p.source}
                        {p.fence_name ? ` · ${p.fence_name}` : ""}{p.distance_m != null ? ` · ${p.distance_m} m away` : ""}
                        {p.note ? ` · ${p.note}` : ""}{p.ignored ? " · set aside" : ""}
                      </span>
                      {p.has_selfie && <Button size="sm" variant="ghost" icon={Camera} onClick={() => showSelfie(p)}>Photo</Button>}
                      {canManage && !d.locked && (
                        <Button size="sm" variant="ghost" icon={p.ignored ? Eye : EyeOff} onClick={() => toggleIgnore(p)}>
                          {p.ignored ? "Restore" : "Set aside"}
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            {d.requests.length > 0 && (
              <section>
                <p className="mb-2 text-[13px] text-muted">Requests</p>
                <ul className="space-y-2">
                  {d.requests.map((r) => (
                    <li key={r.uuid} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5 text-[14px]">
                      <span className="text-ink">{r.kind_label}<span className="text-muted">{r.reason ? ` · ${r.reason}` : ""}</span></span>
                      <RequestStatus status={r.status} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {d.adjustments.length > 0 && (
              <section>
                <p className="mb-2 text-[13px] text-muted">Adjustments for a later pay period</p>
                <ul className="space-y-1 text-[14px] text-ink/80">
                  {d.adjustments.map((a, i) => (
                    <li key={i}>From {formatDate(a.apply_from)}: payable {Number(a.payable_days_delta) > 0 ? "+" : ""}{Number(a.payable_days_delta)}, LOP {Number(a.lop_days_delta) > 0 ? "+" : ""}{Number(a.lop_days_delta)}{a.overtime_minutes_delta ? `, overtime ${minutesText(a.overtime_minutes_delta)}` : ""}</li>
                  ))}
                </ul>
              </section>
            )}
            {d.rule && <p className="text-[12.5px] text-faint">Worked out with “{d.rule.name}” (version {d.rule.version}).</p>}
          </div>
        )}
      </Modal>
      {d && mode === "override" && <OverrideModal day={d} onClose={() => setMode(null)} onSaved={() => { setMode(null); load(); onChanged?.(); }} />}
      {d && mode === "punch" && <AddPunchModal day={d} onClose={() => setMode(null)} onSaved={() => { setMode(null); load(); onChanged?.(); }} />}
      <Modal open={!!selfie} onClose={() => setSelfie(null)} size="sm" title="Clock-in photo" footer={<ModalCancel>Close</ModalCancel>}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {selfie && <img src={selfie} alt="Clock-in selfie" className="w-full rounded-xl" />}
      </Modal>
    </>
  );
}

function OverrideModal({ day, onClose, onSaved }: { day: DayDetail; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<string | null>(day.override_status || day.status);
  const [note, setNote] = useState(day.override_note || "");
  const [saving, setSaving] = useState(false);
  const options = Object.entries(STATUS).filter(([k]) => !["not_yet", "upcoming"].includes(k)).map(([value, s]) => ({ value, label: s.label }));
  async function save() {
    setSaving(true);
    try {
      await api.post(`/attendance/records/${day.uuid}/override`, { status, note });
      toast.success("Status set"); onSaved();
    } catch (e) { toast.error(errorText(e)); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="sm" busy={saving} title="Set status by hand" description="It stays until you clear it, whatever the punches say."
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!status || note.trim().length < 2} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Status"><Select value={status} onChange={(v) => setStatus(v)} options={options} /></Field>
        <Field label="Why" required><Textarea value={note} onValueChange={setNote} rows={2} placeholder="e.g. Device was down; manager confirmed" /></Field>
      </div>
    </Modal>
  );
}

function AddPunchModal({ day, onClose, onSaved }: { day: DayDetail; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(day.date);
  const [time, setTime] = useState("09:30");
  const [direction, setDirection] = useState<string | null>("in");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      // the time is the viewer's local time on that date
      const at = new Date(`${date}T${time}:00`);
      await api.post(`/attendance/records/${day.uuid}/punches`, { punched_at: at.toISOString(), direction, note });
      toast.success("Punch added"); onSaved();
    } catch (e) { toast.error(errorText(e)); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="sm" busy={saving} title="Add a punch"
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={note.trim().length < 2} onClick={save}>Add</Button></>}>
      <div className="space-y-4">
        <FormGrid>
          <Field label="Date"><DateInput value={date} onChange={setDate} /></Field>
          <Field label="Time"><TimeInput value={time} onChange={setTime} /></Field>
        </FormGrid>
        <Field label="Kind"><Select value={direction} onChange={(v) => setDirection(v)} options={[{ value: "in", label: "Check-in" }, { value: "out", label: "Check-out" }]} /></Field>
        <Field label="Why" required><Textarea value={note} onValueChange={setNote} rows={2} placeholder="e.g. Signed the register at the gate" /></Field>
        <p className="text-[12.5px] text-faint">Added {formatDateTime(new Date())} by you; recorded in the audit log.</p>
      </div>
    </Modal>
  );
}
