"use client";

/* Request policies, rest rules, clock-in, office locations and pay period settings.
 * Each form saves a new version of a setting from a chosen date. */
import { useEffect, useState } from "react";
import { Ban, CheckCircle2, MapPin, Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, DataTable, Field, FormGrid, Modal, ModalCancel, NumberInput, Select, TextInput, Textarea, TimeInput,
  Toggle,
} from "@/components/ui-kit";
import { WEEKDAYS, errorText } from "./shared";
import { Num, SettingPanel, useSetting, type Config } from "./settings-common";

// ── Work from home: categories (master list) and limits ─────────────

type MasterValue = { id: number; uuid: string; label: string; code: string | null; active: boolean; is_system: boolean };

function CategoryList({ masterKey, title, description }: { masterKey: string; title: string; description: string }) {
  const toast = useToast();
  const [rows, setRows] = useState<MasterValue[] | null>(null);
  const [editing, setEditing] = useState<MasterValue | "new" | null>(null);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const load = () => api.get<{ items: MasterValue[] }>(`/masters/types/${masterKey}/values?size=200`)
    .then((r) => setRows(r.items)).catch((e) => { setRows([]); toast.error(errorText(e)); });
  useEffect(() => { load(); }, [masterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true);
    try {
      if (editing === "new") await api.post(`/masters/types/${masterKey}/values`, { label });
      else if (editing) await api.put(`/masters/values/${editing.uuid}`, { label });
      toast.success("Saved");
      setEditing(null);
      load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  async function setActive(v: MasterValue, active: boolean) {
    try {
      await api.put(`/masters/values/${v.uuid}`, { active });
      load();
    } catch (e) {
      toast.error(errorText(e));
    }
  }

  return (
    <Paper className="mb-5">
      <PaperHeader title={title} action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => { setLabel(""); setEditing("new"); }}>Add</Button>} />
      <div className="px-5 py-4">
        <p className="mb-3 text-[13.5px] text-muted">{description}</p>
        <DataTable rows={rows ?? []} loading={rows === null} rowKey={(v) => v.uuid}
          onRowClick={(v) => { setLabel(v.label); setEditing(v); }}
          rowClassName={(v) => (v.active ? undefined : "[&_td]:opacity-60")}
          columns={[
            { key: "label", header: "Name", cell: (v) => <span className="text-ink">{v.label}</span> },
            { key: "status", header: "Status", cell: (v) => <Badge tone={v.active ? "good" : "neutral"} dot>{v.active ? "In use" : "Off"}</Badge> },
          ]}
          rowActions={(v) => [
            { label: "Rename", icon: Pencil, onSelect: () => { setLabel(v.label); setEditing(v); } },
            v.active ? { label: "Switch off", icon: Ban, danger: true, onSelect: () => setActive(v, false) }
              : { label: "Switch on", icon: CheckCircle2, onSelect: () => setActive(v, true) },
          ]}
          emptyTitle="Nothing here yet" />
      </div>
      <Modal open={editing !== null} onClose={() => setEditing(null)} size="sm" busy={saving}
        title={editing === "new" ? "Add category" : "Rename category"}
        footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!label.trim()} onClick={save}>Save</Button></>}>
        <Field label="Name" required><TextInput value={label} onValueChange={setLabel} data-autofocus /></Field>
      </Modal>
    </Paper>
  );
}

export function WfhTab() {
  const s = useSetting("wfh");
  const blocked: number[] = s.config?.blocked_weekdays ?? [];
  return (
    <>
      <CategoryList masterKey="wfh_category" title="Work from home categories" description="People pick one when they ask to work from home." />
      <SettingPanel settingKey="wfh" title="Work from home limits" state={s}
        description="Limits count full days as 1 and half days as 0.5. Use 0 for no limit.">
        <FormGrid columns={3}>
          <Num state={s} k="weekly_limit" label="Days a week" suffix="days" max={7} step={0.5} />
          <Num state={s} k="monthly_limit" label="Days a month" suffix="days" max={31} step={0.5} />
          <Num state={s} k="allow_past_days" label="Ask for past days up to" suffix="days ago" max={60} />
        </FormGrid>
        <Field label="Not allowed on">
          <div className="flex flex-wrap gap-4">
            {WEEKDAYS.map((d, i) => (
              <Checkbox key={d} label={d} checked={blocked.includes(i)}
                onChange={(c) => s.set("blocked_weekdays", c ? [...blocked, i].sort() : blocked.filter((x) => x !== i))} />
            ))}
          </div>
        </Field>
      </SettingPanel>
    </>
  );
}

export function PermissionTab() {
  const s = useSetting("permission");
  return (
    <SettingPanel settingKey="permission" title="Permission hours" state={s}
      description="Short time off in hours (for example to visit a bank), approved by the manager. Use 0 for no limit.">
      <FormGrid columns={2}>
        <Num state={s} k="monthly_count" label="Times a month" suffix="times" max={31} />
        <Num state={s} k="monthly_minutes" label="Total a month" suffix="min" max={6000} step={15} />
        <Num state={s} k="min_minutes_per_request" label="Shortest" suffix="min" max={600} step={15} />
        <Num state={s} k="max_minutes_per_request" label="Longest" suffix="min" max={600} step={15} />
      </FormGrid>
      <Toggle checked={!!s.config?.within_shift_only} onChange={(v) => s.set("within_shift_only", v)} label="Only within the shift's hours" />
    </SettingPanel>
  );
}

export function RequestsTab() {
  const reg = useSetting("regularisation");
  const od = useSetting("on_duty");
  const ot = useSetting("overtime_request");
  const ts = useSetting("timesheets");
  return (
    <>
      <SettingPanel settingKey="regularisation" title="Attendance corrections" state={reg}
        description="Employees fix a missed or wrong punch; the manager approves. Reasons come from the “Attendance correction reason” list in Masters.">
        <FormGrid columns={2}>
          <Num state={reg} k="monthly_limit" label="Corrections a month" suffix="times" max={31} />
          <Num state={reg} k="window_days" label="Must ask within" suffix="days" max={365} />
        </FormGrid>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle checked={!!reg.config?.reason_required} onChange={(v) => reg.set("reason_required", v)} label="Reason required" />
          <Toggle checked={!!reg.config?.allow_future} onChange={(v) => reg.set("allow_future", v)} label="Allow future dates" />
        </div>
      </SettingPanel>
      <CategoryList masterKey="on_duty_type" title="On-duty types" description="Client visit, field work, training and so on." />
      <SettingPanel settingKey="on_duty" title="On duty" state={od}>
        <FormGrid columns={2}>
          <Num state={od} k="monthly_limit" label="Days a month" suffix="days" hint="0 for no limit" max={31} />
          <Num state={od} k="allow_past_days" label="Ask for past days up to" suffix="days ago" max={60} />
        </FormGrid>
        <Toggle checked={!!od.config?.allow_future} onChange={(v) => od.set("allow_future", v)} label="Allow future dates" />
      </SettingPanel>
      <SettingPanel settingKey="overtime_request" title="Overtime pre-approval" state={ot}
        description="Overtime is voluntary under the OSH Code. The employee agrees to this text when asking, and the consent is kept with the request.">
        <Num state={ot} k="max_hours_per_day" label="Most a day" suffix="h" max={12} step={0.5} />
        <Field label="Consent text"><Textarea value={ot.config?.consent_text ?? ""} onValueChange={(v) => ot.set("consent_text", v)} rows={3} autoGrow /></Field>
      </SettingPanel>
      <SettingPanel settingKey="timesheets" title="Timesheets" state={ts}>
        <FormGrid columns={3}>
          <Num state={ts} k="min_weekly_hours" label="Least hours to send a week" suffix="h" max={168} />
          <Num state={ts} k="max_daily_hours" label="Most hours a day" suffix="h" max={24} />
          <Field label="Reminder day">
            <Select value={String(ts.config?.reminder_weekday ?? 4)} onChange={(v) => ts.set("reminder_weekday", Number(v ?? 4))}
              options={WEEKDAYS.map((d, i) => ({ value: String(i), label: d }))} />
          </Field>
        </FormGrid>
        <div className="grid gap-3 sm:grid-cols-3">
          <Toggle checked={!!ts.config?.allow_future} onChange={(v) => ts.set("allow_future", v)} label="Log future days" />
          <Toggle checked={!!ts.config?.require_task} onChange={(v) => ts.set("require_task", v)} label="Task required" />
          <Toggle checked={!!ts.config?.no_logs_on_leave} onChange={(v) => ts.set("no_logs_on_leave", v)} label="No time on leave days" />
        </div>
      </SettingPanel>
    </>
  );
}

// ── Rest rules ──────────────────────────────────────────────────────

const REST_RULES: { key: string; label: string; unit: string; hint: string }[] = [
  { key: "max_daily_hours", label: "Most work hours a day", unit: "h", hint: "OSH Code: 8; some states allow 9" },
  { key: "max_weekly_hours", label: "Most work hours a week", unit: "h", hint: "OSH Code: 48" },
  { key: "min_rest_hours", label: "Least rest between shifts", unit: "h", hint: "From the end of one shift to the next" },
  { key: "max_consecutive_days", label: "Most working days in a row", unit: "days", hint: "6 keeps a weekly rest day" },
  { key: "max_consecutive_nights", label: "Most night shifts in a row", unit: "nights", hint: "" },
];

export function RestRulesTab() {
  const s = useSetting("rest_rules");
  const rule = (k: string): Config => s.config?.[k] ?? {};
  const w = s.config?.women_night_window ?? { start: "19:00", end: "06:00" };
  return (
    <SettingPanel settingKey="rest_rules" title="Rest and safety rules" state={s}
      description="Checked every time a roster is planned. “Block” stops the change; “Warn” lets it through with a note.">
      <div className="divide-y divide-line rounded-xl border border-line">
        {REST_RULES.map((r) => (
          <div key={r.key} className="flex flex-wrap items-end gap-3 px-4 py-3">
            <div className="min-w-[220px] flex-1">
              <p className="text-[14px] text-ink">{r.label}</p>
              {r.hint && <p className="text-[12.5px] text-faint">{r.hint}</p>}
            </div>
            <div className="w-36">
              <NumberInput value={rule(r.key).value ?? null} onChange={(v) => s.set(r.key, { ...rule(r.key), value: v ?? 0 })} min={0} suffix={r.unit} />
            </div>
            <div className="w-36">
              <Select value={rule(r.key).action ?? "warn"} onChange={(v) => s.set(r.key, { ...rule(r.key), action: v || "warn" })}
                options={[{ value: "block", label: "Block" }, { value: "warn", label: "Warn" }, { value: "off", label: "Off" }]} />
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-3 px-4 py-3">
          <div className="min-w-[220px] flex-1">
            <p className="text-[14px] text-ink">Women on night shifts need written consent</p>
            <p className="text-[12.5px] text-faint">OSH Code, 2020: always blocks without consent. Night hours for this rule:</p>
          </div>
          <div className="w-32"><TimeInput value={w.start} onChange={(v) => s.set("women_night_window", { ...w, start: v })} /></div>
          <div className="w-32"><TimeInput value={w.end} onChange={(v) => s.set("women_night_window", { ...w, end: v })} /></div>
          <Badge tone="bad">Block</Badge>
        </div>
      </div>
    </SettingPanel>
  );
}

// ── Clock-in and office locations ───────────────────────────────────

type Fence = { uuid: string; name: string; address: string | null; latitude: number; longitude: number; radius_m: number; active: boolean };
type OrgLocation = { location_id: number; name: string; latitude: number; longitude: number; radius_m: number };

function FenceModal({ fence, open, onClose, onSaved }: { fence: Fence | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: fence?.name ?? "", address: fence?.address ?? "", latitude: fence?.latitude ?? null as number | null,
    longitude: fence?.longitude ?? null as number | null, radius_m: fence?.radius_m ?? 200 as number | null, active: fence?.active ?? true });
  const [saving, setSaving] = useState(false);

  function here() {
    if (!navigator.geolocation) return toast.error("This browser can't share its location.");
    navigator.geolocation.getCurrentPosition(
      (p) => setF((x) => ({ ...x, latitude: Number(p.coords.latitude.toFixed(6)), longitude: Number(p.coords.longitude.toFixed(6)) })),
      () => toast.error("Couldn't get your location. Allow location access and try again."),
    );
  }

  async function save() {
    setSaving(true);
    try {
      const body = { ...f, address: f.address || null };
      if (fence) await api.put(`/attendance/geofences/${fence.uuid}`, body);
      else await api.post("/attendance/geofences", body);
      toast.success("Office saved");
      onSaved();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title={fence ? `Edit ${fence.name}` : "Add office location"}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!f.name.trim() || f.latitude === null || f.longitude === null} onClick={save}>Save</Button></>}>
      <div className="space-y-5">
        <Field label="Name" required><TextInput value={f.name} onValueChange={(v) => setF((x) => ({ ...x, name: v }))} data-autofocus /></Field>
        <Field label="Address"><TextInput value={f.address} onValueChange={(v) => setF((x) => ({ ...x, address: v }))} /></Field>
        <FormGrid columns={3}>
          <Field label="Latitude" required><NumberInput value={f.latitude} onChange={(v) => setF((x) => ({ ...x, latitude: v }))} min={-90} max={90} step={0.000001} /></Field>
          <Field label="Longitude" required><NumberInput value={f.longitude} onChange={(v) => setF((x) => ({ ...x, longitude: v }))} min={-180} max={180} step={0.000001} /></Field>
          <Field label="Radius"><NumberInput value={f.radius_m} onChange={(v) => setF((x) => ({ ...x, radius_m: v }))} min={20} max={10000} step={10} suffix="m" /></Field>
        </FormGrid>
        <Button size="sm" variant="secondary" icon={MapPin} onClick={here}>Use where I am now</Button>
        <Toggle checked={f.active} onChange={(v) => setF((x) => ({ ...x, active: v }))} label="In use" />
      </div>
    </Modal>
  );
}

export function ClockInTab() {
  const toast = useToast();
  const s = useSetting("clock_in");
  const [fences, setFences] = useState<Fence[] | null>(null);
  const [locations, setLocations] = useState<OrgLocation[]>([]);
  const [editing, setEditing] = useState<Fence | "new" | null>(null);
  const [session, setSession] = useState(0);
  const [ips, setIps] = useState<string | null>(null);
  const load = () => api.get<{ items: Fence[]; locations: OrgLocation[] }>("/attendance/geofences")
    .then((r) => { setFences(r.items); setLocations(r.locations); }).catch((e) => { setFences([]); toast.error(errorText(e)); });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const ipText = ips ?? (s.config?.allowed_ips ?? []).join("\n");

  return (
    <>
      <SettingPanel settingKey="clock_in" title="Clock-in from the web and phone" state={s}
        description="Photos are personal data (DPDP Act): they are deleted after the retention period.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle checked={!!s.config?.web_enabled} onChange={(v) => s.set("web_enabled", v)} label="Allow clock-in from the web" />
          <Toggle checked={!!s.config?.geo_required} onChange={(v) => s.set("geo_required", v)} label="Only inside an office location" description="Uses the locations below" />
          <Toggle checked={!!s.config?.selfie_required} onChange={(v) => s.set("selfie_required", v)} label="Selfie required" />
        </div>
        <FormGrid>
          <Num state={s} k="selfie_retention_days" label="Keep selfies for" suffix="days" min={1} max={3650} />
          <Field label="Office networks only" hint="One IP address or range per line (e.g. 203.0.113.0/24). Empty: any network.">
            <Textarea value={ipText} rows={3} autoGrow
              onValueChange={(v) => { setIps(v); s.set("allowed_ips", v.split(/\s+/).map((x) => x.trim()).filter(Boolean)); }} />
          </Field>
        </FormGrid>
      </SettingPanel>

      <Paper className="mb-5">
        <PaperHeader title="Office locations" action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => { setSession((x) => x + 1); setEditing("new"); }}>Add location</Button>} />
        <div className="px-5 py-4">
          <DataTable rows={fences ?? []} loading={fences === null} rowKey={(f) => f.uuid}
            onRowClick={(f) => { setSession((x) => x + 1); setEditing(f); }}
            columns={[
              { key: "name", header: "Name", cell: (f) => <div><p className="text-ink">{f.name}</p>{f.address && <p className="text-[12.5px] text-muted">{f.address}</p>}</div> },
              { key: "point", header: "Map point", hideBelow: "md", cell: (f) => <span className="tabular text-muted">{f.latitude.toFixed(5)}, {f.longitude.toFixed(5)}</span> },
              { key: "radius", header: "Radius", cell: (f) => <span className="text-muted">{f.radius_m} m</span> },
              { key: "status", header: "Status", cell: (f) => <Badge tone={f.active ? "good" : "neutral"} dot>{f.active ? "In use" : "Off"}</Badge> },
            ]}
            emptyIcon={MapPin} emptyTitle="No office locations" emptyHint="Add one to limit clock-in to the office." />
          {locations.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-[13px] text-muted">Also used: branches with a map point under Regions & locations</p>
              <ul className="space-y-1 text-[13.5px]">
                {locations.map((l) => (
                  <li key={l.location_id} className="flex gap-3"><span className="text-ink">{l.name}</span><span className="text-faint">{l.radius_m} m</span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Paper>
      <FenceModal key={session} open={editing !== null} fence={editing === "new" ? null : editing}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </>
  );
}

export function PayPeriodTab() {
  const s = useSetting("pay_period");
  return (
    <SettingPanel settingKey="pay_period" title="Pay period" state={s}
      description="The attendance period payroll pays for. Lock it under Attendance admin once it is checked; later changes are carried to the next period.">
      <FormGrid>
        <Num state={s} k="start_day" label="Period starts on day" min={1} max={28} hint="1 means the calendar month" />
        <Num state={s} k="cutoff_day" label="Attendance cut-off day" min={0} max={28} hint="0 means the last day of the period" />
      </FormGrid>
    </SettingPanel>
  );
}
