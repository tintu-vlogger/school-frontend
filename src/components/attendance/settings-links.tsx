"use client";

/*
 * Settings added in the second pass of attendance and leave:
 *   LeaveLinkTab   absences to leave, late-mark penalties from leave, comp off from attendance,
 *                  and loss of pay per pay period (cap and carry-over)
 *   AutoShiftTab   pick each day's shift from the check-in time
 *   KiosksTab      shared clock-in tablets (secret link, photo) and employee PINs
 *   RegistersTab   establishment details printed on the statutory registers
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Copy, KeyRound, Link2, MonitorSmartphone, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime } from "@/lib/datetime";
import { Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, FormGrid, IconButton, Modal, ModalCancel, MultiSelect, NumberInput, RadioCards,
  Select, TextInput, Textarea, Toggle, useConfirm,
} from "@/components/ui-kit";
import { errorText } from "./shared";
import { SettingPanel, useSetting, type Config } from "./settings-common";

const S = 1.4;

type LeaveType = { uuid: string; code: string; name: string; kind: string; active: boolean };
type Shift = { id: number; name: string; start_time: string; end_time: string; active: boolean };

function useLeaveTypes() {
  const [types, setTypes] = useState<LeaveType[]>([]);
  useEffect(() => {
    api.get<LeaveType[]>("/leave/types").then((r) => setTypes(r.filter((t) => t.active && ["standard", "comp_off"].includes(t.kind))))
      .catch(() => setTypes([]));
  }, []);
  return types;
}

/** An ordered list of leave type codes: the first one with enough balance is used. */
function OrderedTypes({ value, onChange, types }: { value: string[]; onChange: (v: string[]) => void; types: LeaveType[] }) {
  const name = (c: string) => types.find((t) => t.code === c)?.name ?? c;
  const left = types.filter((t) => !value.includes(t.code));
  const move = (i: number, d: number) => {
    const next = [...value];
    const [x] = next.splice(i, 1);
    next.splice(i + d, 0, x);
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {value.length === 0 && <p className="text-[13px] text-faint">No leave types picked: it stays loss of pay.</p>}
      <ol className="space-y-1.5">
        {value.map((c, i) => (
          <li key={c} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5">
            <span className="w-5 text-[12px] text-faint tabular">{i + 1}.</span>
            <span className="flex-1 text-[13.5px] text-ink">{name(c)} <span className="text-faint">· {c}</span></span>
            <IconButton icon={ArrowUp} label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
            <IconButton icon={ArrowDown} label="Move down" size="sm" disabled={i === value.length - 1} onClick={() => move(i, 1)} />
            <IconButton icon={X} label="Remove" size="sm" onClick={() => onChange(value.filter((x) => x !== c))} />
          </li>
        ))}
      </ol>
      {left.length > 0 && (
        <div className="max-w-xs">
          <Select value={null} onChange={(v) => v && onChange([...value, String(v)])} placeholder="Add a leave type"
            options={left.map((t) => ({ value: t.code, label: t.name, description: t.code }))} />
        </div>
      )}
    </div>
  );
}

function num(v: unknown): number | null {
  return v === null || v === undefined || v === "" ? null : Number(v);
}

export function LeaveLinkTab() {
  const s = useSetting("leave_link");
  const lop = useSetting("lop_control");
  const types = useLeaveTypes();
  const c = (s.config ?? {}) as Config;
  const ab = c.absence ?? {}, lp = c.late_penalty ?? {}, co = c.comp_off ?? {};
  const setPart = (part: string, k: string, v: unknown) => s.set(part, { ...(c[part] ?? {}), [k]: v });

  return (
    <>
      <SettingPanel settingKey="leave_link" title="Attendance and leave" state={s}
        description="What attendance does to leave balances. Each step is recorded and undone on its own when the attendance is corrected.">
        <div className="space-y-6">
          <section className="space-y-4">
            <Toggle checked={!!ab.enabled} onChange={(v) => setPart("absence", "enabled", v)} label="Turn absent days into leave"
              description="An absent day (or the missing half of a half day) is covered from the leave types below, the first one with balance." />
            {ab.enabled && (
              <div className="space-y-4 border-l border-line pl-5">
                <FormGrid columns={2}>
                  <Field label="Wait before converting" hint="Gives people time to correct their attendance">
                    <NumberInput value={num(ab.after_days)} onChange={(v) => setPart("absence", "after_days", v ?? 0)} min={0} max={31} suffix="days" />
                  </Field>
                </FormGrid>
                <Field label="Absent days become">
                  <RadioCards value={ab.action ?? "leave"} onChange={(v) => setPart("absence", "action", v)} columns={2} options={[
                    { value: "leave", label: "Leave", description: "From the types below, else loss of pay" },
                    { value: "lop", label: "Loss of pay", description: "Recorded as unpaid leave" },
                  ]} />
                </Field>
                {(ab.action ?? "leave") === "leave" && (
                  <Field label="Take from, in this order">
                    <OrderedTypes value={ab.leave_type_codes ?? []} onChange={(v) => setPart("absence", "leave_type_codes", v)} types={types} />
                  </Field>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Toggle checked={!!ab.needs_approval} onChange={(v) => setPart("absence", "needs_approval", v)} label="Manager approves first" />
                  <Toggle checked={ab.half_days !== false} onChange={(v) => setPart("absence", "half_days", v)} label="Also half days" />
                </div>
              </div>
            )}
          </section>

          <section className="space-y-4 border-t border-line pt-5">
            <Toggle checked={!!lp.enabled} onChange={(v) => setPart("late_penalty", "enabled", v)} label="Take late-mark penalties from leave"
              description="Penalty days from the attendance rule (for example every 3rd late arrival) come out of leave, else stay loss of pay. Given back if the late mark is corrected." />
            {lp.enabled && (
              <div className="border-l border-line pl-5">
                <Field label="Take from, in this order">
                  <OrderedTypes value={lp.leave_type_codes ?? []} onChange={(v) => setPart("late_penalty", "leave_type_codes", v)} types={types} />
                </Field>
              </div>
            )}
          </section>

          <section className="space-y-4 border-t border-line pt-5">
            <Toggle checked={!!co.enabled} onChange={(v) => setPart("comp_off", "enabled", v)} label="Give comp off for work on days off"
              description="Credited automatically from the punches on a weekly off or holiday. Taken back if the attendance is corrected below the minimum." />
            {co.enabled && (
              <div className="space-y-4 border-l border-line pl-5">
                <FormGrid columns={2}>
                  <Field label="Full day from"><NumberInput value={num(co.full_day_hours)} onChange={(v) => setPart("comp_off", "full_day_hours", v ?? 6)} min={1} max={24} step={0.5} suffix="hours" /></Field>
                  <Field label="Half day from"><NumberInput value={num(co.half_day_hours)} onChange={(v) => setPart("comp_off", "half_day_hours", v ?? 4)} min={0.5} max={24} step={0.5} suffix="hours" /></Field>
                </FormGrid>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Toggle checked={co.on_weekly_off !== false} onChange={(v) => setPart("comp_off", "on_weekly_off", v)} label="On weekly offs" />
                  <Toggle checked={co.on_holiday !== false} onChange={(v) => setPart("comp_off", "on_holiday", v)} label="On holidays" />
                  <Toggle checked={!!co.needs_approval} onChange={(v) => setPart("comp_off", "needs_approval", v)} label="Manager approves first" />
                </div>
              </div>
            )}
          </section>
        </div>
      </SettingPanel>

      <SettingPanel settingKey="lop_control" title="Loss of pay per pay period" state={lop}
        description="A cap on loss-of-pay days in one pay period. Days over the cap move to the next period, or are waived. Locking the pay period freezes the figures.">
        <FormGrid columns={2}>
          <Field label="Most LOP days in a period" hint="Empty for no cap">
            <NumberInput value={num(lop.config?.cap_days)} onChange={(v) => lop.set("cap_days", v)} min={0} max={31} step={0.5} suffix="days" placeholder="No cap" />
          </Field>
        </FormGrid>
        <Toggle checked={lop.config?.carry_excess !== false} onChange={(v) => lop.set("carry_excess", v)} label="Carry days over the cap to the next period"
          description="When off, days over the cap are waived." />
      </SettingPanel>
    </>
  );
}

export function AutoShiftTab() {
  const s = useSetting("auto_shift");
  const [shifts, setShifts] = useState<Shift[]>([]);
  useEffect(() => { api.get<Shift[]>("/shifts/").then(setShifts).catch(() => setShifts([])); }, []);
  const ids: number[] = (s.config?.shift_ids ?? []).map(Number);
  return (
    <SettingPanel settingKey="auto_shift" title="Auto shift" state={s}
      description={<>For people whose work arrangement says <span className="text-ink">Pick shift from check-in time</span>: each working day gets the shift that starts closest to their first punch, if it is within the window. A published roster always wins. Turn it on per person under Work arrangements.</>}>
      <FormGrid columns={2}>
        <Field label="Window" hint="How far the first punch may be from a shift start, either side">
          <NumberInput value={num(s.config?.window_minutes)} onChange={(v) => s.set("window_minutes", v ?? 120)} min={15} max={360} step={15} suffix="min" />
        </Field>
        <Field label="Shifts to pick from" hint="Empty uses every active shift">
          <MultiSelect value={ids} onChange={(v) => s.set("shift_ids", v)} placeholder="All active shifts"
            options={shifts.filter((x) => x.active).map((x) => ({ value: x.id, label: x.name, description: `${x.start_time.slice(0, 5)}–${x.end_time.slice(0, 5)}` }))} />
        </Field>
      </FormGrid>
    </SettingPanel>
  );
}

// ── Kiosks ──────────────────────────────────────────────────────────

type Kiosk = { uuid: string; name: string; location_note: string | null; photo: "off" | "optional" | "required"; allowed_ips: string[]; active: boolean; has_link: boolean; last_seen_at: string | null; punches_count: number };
const PHOTO = { off: "No photo", optional: "Photo if they want", required: "Photo needed" } as const;

function CopyLine({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-line bg-sunken px-3 py-2">
      <span className="min-w-0 flex-1 break-all font-mono text-[12.5px] text-ink">{text}</span>
      <button type="button" className="shrink-0 text-muted hover:text-ink" aria-label="Copy"
        onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
        {done ? <Check size={15} strokeWidth={S} /> : <Copy size={15} strokeWidth={S} />}
      </button>
    </div>
  );
}

export function KiosksTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const [data, setData] = useState<{ items: Kiosk[]; pins: { employees: number; with_pin: number } } | null>(null);
  const [editing, setEditing] = useState<Kiosk | "new" | null>(null);
  const [link, setLink] = useState<{ name: string; token: string } | null>(null);
  const [pins, setPins] = useState(false);
  const load = () => api.get<{ items: Kiosk[]; pins: { employees: number; with_pin: number } }>("/attendance/kiosks")
    .then(setData).catch((e) => { setData({ items: [], pins: { employees: 0, with_pin: 0 } }); toast.error(errorText(e)); });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function newLink(k: Kiosk) {
    if (!(await confirm({ title: "Make a new link?", message: `The tablet using the current link for ${k.name} stops working until it opens the new one.`, confirmLabel: "New link" }))) return;
    try {
      const r = await api.post<Kiosk & { token: string }>(`/attendance/kiosks/${k.uuid}/link`);
      setLink({ name: r.name, token: r.token });
      load();
    } catch (e) { toast.error(errorText(e)); }
  }

  async function toggle(k: Kiosk) {
    try {
      await api.put(`/attendance/kiosks/${k.uuid}`, { name: k.name, location_note: k.location_note, photo: k.photo, allowed_ips: k.allowed_ips, active: !k.active });
      load();
    } catch (e) { toast.error(errorText(e)); }
  }

  return (
    <Paper className="mb-5">
      <PaperHeader title="Clock-in kiosks" action={<div className="flex gap-2">
        <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => setPins(true)}>PINs</Button>
        <Button size="sm" variant="secondary" icon={Plus} onClick={() => setEditing("new")}>Add kiosk</Button>
      </div>} />
      <div className="px-5 py-4">
        <p className="mb-3 max-w-2xl text-[13.5px] text-muted">
          A shared tablet at the entrance. People punch with their employee ID and a PIN they set in My attendance.
          It keeps punches while offline and sends them later.
          {data && <> {data.pins.with_pin} of {data.pins.employees} people have a PIN.</>}
        </p>
        <DataTable rows={data?.items ?? []} loading={!data} rowKey={(k) => k.uuid} onRowClick={(k) => setEditing(k)}
          rowClassName={(k) => (k.active ? undefined : "[&_td]:opacity-60")}
          columns={[
            { key: "name", header: "Kiosk", cell: (k) => <div><p className="text-ink">{k.name}</p>{k.location_note && <p className="text-[12px] text-faint">{k.location_note}</p>}</div> },
            { key: "photo", header: "Photo", hideBelow: "sm", cell: (k) => <span className="text-muted">{PHOTO[k.photo]}</span> },
            { key: "seen", header: "Last used", hideBelow: "md", cell: (k) => <span className="text-muted">{k.last_seen_at ? formatDateTime(k.last_seen_at) : "Never"}</span> },
            { key: "count", header: "Punches", align: "right", hideBelow: "md", cell: (k) => <span className="tabular text-muted">{k.punches_count}</span> },
            { key: "status", header: "Status", cell: (k) => <Badge tone={k.active ? "good" : "neutral"} dot>{k.active ? "On" : "Off"}</Badge> },
          ]}
          rowActions={(k) => [
            { label: "Edit", icon: Pencil, onSelect: () => setEditing(k) },
            { label: "New link", icon: Link2, onSelect: () => newLink(k) },
            { label: k.active ? "Switch off" : "Switch on", icon: MonitorSmartphone, danger: k.active, onSelect: () => toggle(k) },
          ]}
          emptyTitle="No kiosks yet" emptyHint="Add one and open its link on the tablet." />
      </div>
      {editing && <KioskModal kiosk={editing === "new" ? null : editing} onClose={() => setEditing(null)}
        onSaved={(token, name) => { setEditing(null); load(); if (token) setLink({ name, token }); }} />}
      <Modal open={!!link} onClose={() => setLink(null)} size="md" title={`Link for ${link?.name ?? ""}`}
        footer={<Button variant="primary" onClick={() => setLink(null)}>Done</Button>}>
        {link && (
          <div className="space-y-3">
            <p className="text-[13.5px] text-muted">Open this link on the tablet and add it to the home screen. It is shown only now; make a new link if it is lost.</p>
            <CopyLine text={`${typeof window !== "undefined" ? window.location.origin : ""}/clock-in/${link.token}`} />
          </div>
        )}
      </Modal>
      {pins && <PinsModal onClose={() => { setPins(false); load(); }} />}
    </Paper>
  );
}

function KioskModal({ kiosk, onClose, onSaved }: { kiosk: Kiosk | null; onClose: () => void; onSaved: (token: string | null, name: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState(kiosk?.name ?? "");
  const [note, setNote] = useState(kiosk?.location_note ?? "");
  const [photo, setPhoto] = useState<Kiosk["photo"]>(kiosk?.photo ?? "off");
  const [ips, setIps] = useState((kiosk?.allowed_ips ?? []).join("\n"));
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    const body = { name, location_note: note || null, photo, allowed_ips: ips.split(/[\n,]/).map((x) => x.trim()).filter(Boolean), active: kiosk?.active ?? true };
    try {
      if (kiosk) {
        await api.put(`/attendance/kiosks/${kiosk.uuid}`, body);
        toast.success("Saved");
        onSaved(null, name);
      } else {
        const r = await api.post<{ token: string }>("/attendance/kiosks", body);
        onSaved(r.token, name);
      }
    } catch (e) { toast.error(errorText(e, "Couldn't save")); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} title={kiosk ? "Edit kiosk" : "Add kiosk"}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={name.trim().length < 2} onClick={save}>{kiosk ? "Save" : "Add and show link"}</Button></>}>
      <div className="space-y-4">
        <Field label="Name" required><TextInput value={name} onValueChange={setName} placeholder="Reception tablet" autoFocusInModal /></Field>
        <Field label="Where it is"><TextInput value={note} onValueChange={setNote} placeholder="Ground floor, Bengaluru office" /></Field>
        <Field label="Photo when punching">
          <RadioCards value={photo} onChange={setPhoto} columns={3} options={(Object.keys(PHOTO) as Kiosk["photo"][]).map((k) => ({ value: k, label: PHOTO[k] }))} />
        </Field>
        <Field label="Office network only" hint="IP addresses or ranges, one per line. Empty allows any network.">
          <Textarea value={ips} onValueChange={setIps} rows={3} placeholder="203.0.113.0/24" />
        </Field>
      </div>
    </Modal>
  );
}

type PinRow = { employee_uuid: string; employee_code: string | null; name: string; has_pin: boolean };

function PinsModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PinRow[] | null>(null);
  const [setting, setSetting] = useState<PinRow | null>(null);
  const [pin, setPin] = useState("");
  const load = (query = q) => api.get<{ items: PinRow[] }>(`/attendance/kiosk-pins?q=${encodeURIComponent(query)}`)
    .then((r) => setRows(r.items)).catch((e) => { setRows([]); toast.error(errorText(e)); });
  useEffect(() => { load(q); }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  async function savePin() {
    if (!setting) return;
    try {
      await api.put(`/attendance/kiosk-pins/${setting.employee_uuid}`, { pin });
      toast.success(`PIN set for ${setting.name}`, { description: "Tell them the PIN; they can change it in My attendance." });
      setSetting(null);
      load();
    } catch (e) { toast.error(errorText(e)); }
  }
  async function clear(r: PinRow) {
    if (!(await confirm({ title: "Clear the PIN?", message: `${r.name} can't punch at a kiosk until a new PIN is set.`, confirmLabel: "Clear", tone: "danger" }))) return;
    try { await api.delete(`/attendance/kiosk-pins/${r.employee_uuid}`); load(); } catch (e) { toast.error(errorText(e)); }
  }

  return (
    <Modal open onClose={onClose} size="lg" title="Kiosk PINs" description="People usually set their own PIN. Set one here for someone who can't."
      footer={<Button onClick={onClose}>Close</Button>}>
      <FilterBar searchPlaceholder="Search by name or employee ID" onSearchChange={setQ} className="mb-3" />
      <DataTable rows={rows ?? []} loading={!rows} rowKey={(r) => r.employee_uuid}
        columns={[
          { key: "name", header: "Employee", cell: (r) => <div><p className="text-ink">{r.name}</p><p className="text-[12px] text-faint">{r.employee_code || "No employee ID: can't use a kiosk"}</p></div> },
          { key: "pin", header: "PIN", cell: (r) => r.has_pin ? <Badge tone="good" dot>Set</Badge> : <Badge tone="neutral">Not set</Badge> },
        ]}
        rowActions={(r) => [
          { label: r.has_pin ? "Change PIN" : "Set PIN", icon: KeyRound, onSelect: () => { setPin(""); setSetting(r); } },
          ...(r.has_pin ? [{ label: "Clear PIN", icon: Trash2, danger: true, onSelect: () => clear(r) }] : []),
        ]}
        emptyTitle="Nobody found" />
      <Modal open={!!setting} onClose={() => setSetting(null)} size="sm" title={`PIN for ${setting?.name ?? ""}`}
        footer={<><ModalCancel /><Button variant="primary" disabled={!/^\d{4,6}$/.test(pin)} onClick={savePin}>Set PIN</Button></>}>
        <Field label="PIN" hint="4 to 6 digits; not 1111 or 1234">
          <TextInput value={pin} onValueChange={(v) => setPin(v.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoFocusInModal />
        </Field>
      </Modal>
    </Modal>
  );
}

// ── Registers ───────────────────────────────────────────────────────

const FORM_KEYS = ["generic", "KA", "MH", "TN", "DL", "TS"];
const FORM_NAMES: Record<string, string> = { generic: "Generic", KA: "Karnataka", MH: "Maharashtra", TN: "Tamil Nadu", DL: "Delhi", TS: "Telangana" };

export function RegistersTab() {
  const s = useSetting("registers");
  const labels: Record<string, string> = useMemo(() => s.config?.form_labels ?? {}, [s.config]);
  const setLabel = (k: string, v: string) => s.set("form_labels", { ...labels, [k]: v });
  const text = (k: string, label: string, placeholder?: string) => (
    <Field label={label}><TextInput value={s.config?.[k] ?? ""} onValueChange={(v) => s.set(k, v)} placeholder={placeholder} /></Field>
  );
  return (
    <SettingPanel settingKey="registers" title="Statutory registers" state={s}
      description="Printed at the top of the registers of attendance and overtime (Attendance reports). States renumber their forms now and then, so the form names are yours to fill in.">
      <FormGrid columns={2}>
        {text("establishment_name", "Name of the establishment")}
        {text("registration_no", "Registration number", "Shops and establishments registration")}
        {text("employer_name", "Employer or manager")}
        {text("nature_of_business", "Nature of business")}
      </FormGrid>
      <Field label="Address"><Textarea value={s.config?.address ?? ""} onValueChange={(v) => s.set("address", v)} rows={2} /></Field>
      <Field label="Form names" hint="For example “Form T” for Karnataka. Leave empty to print only the register's title.">
        <div className="overflow-hidden rounded-xl border border-line">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-line text-muted"><th className="px-3 py-2 text-left font-normal">Format</th><th className="px-3 py-2 text-left font-normal">Attendance</th><th className="px-3 py-2 text-left font-normal">Overtime</th></tr></thead>
            <tbody>
              {FORM_KEYS.map((k) => (
                <tr key={k} className="border-b border-line last:border-0">
                  <td className="px-3 py-1.5 text-ink">{FORM_NAMES[k]}</td>
                  {["attendance", "overtime"].map((kind) => (
                    <td key={kind} className="px-2 py-1.5">
                      <TextInput value={labels[`${k}.${kind}`] ?? ""} onValueChange={(v) => setLabel(`${k}.${kind}`, v)} aria-label={`${FORM_NAMES[k]} ${kind} form`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Field>
    </SettingPanel>
  );
}
