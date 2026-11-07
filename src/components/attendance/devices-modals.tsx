"use client";

/*
 * Devices page modals: device details (per connection: ADMS address and commands, push
 * addresses, office connector status and settings file, pull now), the one-time key box,
 * enrolments, sync log details and the CSV/Excel import wizard. Adding and editing a
 * device is the step-by-step DeviceWizard in device-connection.tsx; FtpFields and
 * MappingFields are shared with it.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Download, FileUp, KeyRound, RefreshCw, Pencil, RotateCcw, Info } from "lucide-react";
import { API_BASE, api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, formatRelative } from "@/lib/datetime";
import {
  Badge, Button, Checkbox, Field, FileDrop, FormGrid, KeyValue, Modal, ModalCancel, NumberInput, RadioCards,
  Select, Stepper, TextInput, Toggle, useConfirm,
} from "@/components/ui-kit";
import { errorText, lookupEmployees, postForm } from "./shared";

export type FtpConfig = {
  protocol: string; host: string; port: number; username: string; password: string; path: string;
  file_pattern: string; every_minutes: number; delete_after: boolean;
};
export type Mapping = {
  employee: string | null; timestamp: string | null; date: string | null; time: string | null; direction: string | null;
  date_format: string | null; match_by: "device_user_id" | "employee_code"; has_header: boolean;
};
export type Device = {
  uuid: string; id: number; name: string; vendor: string | null; model: string | null; serial_number: string | null;
  kind: string; kind_label: string; location_name: string | null; timezone: string | null; connection: string;
  connection_label: string; api_key_prefix: string | null; ftp_config: FtpConfig | null; column_mapping: Mapping | null;
  active: boolean; last_seen_at: string | null; last_sync_at: string | null; next_pull_at: string | null; enrolled: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  source_config?: { [k: string]: any } | null; runs_on?: string; online?: boolean | null;
  connector?: { online: boolean; seen_at: string | null; version: string | null; host: string | null; queue: number | null; last_error: string | null; last_read_at: string | null } | null;
  state?: {
    last_time: string | null; last_id: number | null; last_error: string | null; last_ok_at: string | null; device_users: number; has_sample: boolean;
    adms: { ip?: string | null; pushver?: string | null; info?: Record<string, string> | null; handshake_at?: string | null } | null;
    commands: { id: number; cmd: string; status: string; queued_at: string | null }[];
  } | null;
};
export const KIND_LABELS: Record<string, string> = {
  push: "Direct push", file: "File", ftp: "FTP", api: "Software API", database: "Database", zk: "LAN pull", adms: "ADMS push",
  webhook: "Vendor push", email: "Email", connector: "Office connector",
};
export const PULLED = ["api", "database", "zk", "email", "ftp"];
export type DeviceMeta = { vendors: string[]; kinds: Record<string, string>; connections: Record<string, string> };
export type SyncLog = {
  uuid: string; device_name: string | null; kind: string; status: string; file_name: string | null; received: number;
  inserted: number; duplicates: number; unmatched: number; errors: { row: number | null; message: string }[];
  message: string | null; created_at: string;
};

const EMPTY_MAP: Mapping = { employee: "UserID", timestamp: "DateTime", date: null, time: null, direction: null, date_format: null, match_by: "device_user_id", has_header: true };

export const pushUrl = () => `${API_BASE}/attendance/devices/push`;
export const hookUrl = (key: string) => `${API_BASE}/attendance/devices/hook/${key}`;

export function SyncStatus({ status }: { status: string }) {
  const tone = status === "ok" ? "good" : status === "partial" ? "warn" : "bad";
  const label = status === "ok" ? "Done" : status === "partial" ? "Partly done" : "Failed";
  return <Badge tone={tone} dot>{label}</Badge>;
}

function CopyBox({ text, mono = true }: { text: string; mono?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex items-start gap-2 rounded-lg border border-line bg-sunken px-3 py-2">
      <pre className={`min-w-0 flex-1 whitespace-pre-wrap break-all text-[12.5px] text-ink ${mono ? "font-mono" : ""}`}>{text}</pre>
      <button type="button" className="shrink-0 text-muted hover:text-ink" aria-label="Copy"
        onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); }}>
        {done ? <Check size={15} strokeWidth={1.4} /> : <Copy size={15} strokeWidth={1.4} />}
      </button>
    </div>
  );
}

/** Shown once after a key is made: the key, the push address and a sample request. */
export function KeyModal({ apiKey, deviceName, connection, onClose }: { apiKey: string | null; deviceName?: string; connection?: string; onClose: () => void }) {
  const sample = JSON.stringify({ punches: [{ device_user_id: "101", timestamp: "2026-11-07T09:28:00", direction: "in" }] }, null, 2);
  if (apiKey && connection === "webhook") {
    return (
      <Modal open onClose={onClose} size="md" title="Vendor push address" description={`For ${deviceName ?? "the device"}. Copy it now: the key in it is shown only once.`}
        footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <div className="space-y-4">
          <Field label="The device posts to" hint="For Hikvision: Network, Advanced, HTTP Listening. Enter this address (host, port and path)."><CopyBox text={hookUrl(apiKey)} /></Field>
          <p className="text-[13px] text-muted">Send one punch from the device, then open the device here and match its fields.</p>
        </div>
      </Modal>
    );
  }
  if (apiKey && connection && connection !== "push") {
    return (
      <Modal open onClose={onClose} size="md" title="Office connector" description={`${deviceName ?? "The device"} is read by the office connector.`}
        footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <div className="space-y-3 text-[13.5px] text-ink/90">
          <p>Next: open the device and click <span className="text-ink">Connector settings file</span>. Save it as connector.json next to connector.exe on the office PC, then run <span className="font-mono">connector.exe test</span>.</p>
          <p className="text-muted">The page shows the connector as online once it starts.</p>
        </div>
      </Modal>
    );
  }
  return (
    <Modal open={!!apiKey} onClose={onClose} size="md" title="Device key" description={deviceName ? `For ${deviceName}. Copy it now: it is shown only once.` : "Copy it now: it is shown only once."}
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      {apiKey && (
        <div className="space-y-4">
          <Field label="API key"><CopyBox text={apiKey} /></Field>
          <Field label="Send punches to" hint="POST, with the key in the X-Device-Key header"><CopyBox text={pushUrl()} /></Field>
          <Field label="Sample body" hint="Times without a zone are read in the device's timezone. Repeated punches are ignored."><CopyBox text={sample} /></Field>
        </div>
      )}
    </Modal>
  );
}

export function FtpFields({ v, set }: { v: FtpConfig; set: (x: Partial<FtpConfig>) => void }) {
  return (
    <FormGrid>
      <Field label="Protocol">
        <Select value={v.protocol} onChange={(x) => set({ protocol: String(x ?? "sftp"), port: x === "sftp" ? 22 : 21 })}
          options={[{ value: "sftp", label: "SFTP" }, { value: "ftps", label: "FTPS" }, { value: "ftp", label: "FTP" }]} />
      </Field>
      <Field label="Server" required><TextInput value={v.host} onValueChange={(x) => set({ host: x })} placeholder="sftp.example.in" /></Field>
      <Field label="Port"><NumberInput value={v.port} onChange={(x) => set({ port: x ?? 22 })} min={1} max={65535} /></Field>
      <Field label="User name"><TextInput value={v.username} onValueChange={(x) => set({ username: x })} /></Field>
      <Field label="Password" hint="Leave empty to keep the saved one"><TextInput type="password" value={v.password === "••••••" ? "" : v.password} onValueChange={(x) => set({ password: x })} autoComplete="new-password" /></Field>
      <Field label="Folder"><TextInput value={v.path} onValueChange={(x) => set({ path: x })} placeholder="/exports" /></Field>
      <Field label="File name pattern" hint="e.g. ATT_*.csv"><TextInput value={v.file_pattern} onValueChange={(x) => set({ file_pattern: x })} /></Field>
      <Field label="Check every"><NumberInput value={v.every_minutes} onChange={(x) => set({ every_minutes: x ?? 30 })} min={5} max={1440} suffix="min" /></Field>
      <div className="sm:col-span-2"><Toggle checked={v.delete_after} onChange={(x) => set({ delete_after: x })} label="Delete files after reading" /></div>
    </FormGrid>
  );
}

export function MappingFields({ v, set, headers }: { v: Mapping; set: (x: Partial<Mapping>) => void; headers?: string[] }) {
  const opts = (headers ?? []).map((h) => ({ value: h, label: h }));
  const pick = (key: keyof Mapping, label: string, hint?: string) => (
    <Field label={label} hint={hint}>
      {headers ? <Select value={(v[key] as string) || null} onChange={(x) => set({ [key]: x ? String(x) : null } as Partial<Mapping>)} options={opts} clearable placeholder="Not in the file" />
        : <TextInput value={(v[key] as string) || ""} onValueChange={(x) => set({ [key]: x || null } as Partial<Mapping>)} placeholder="Column name" />}
    </Field>
  );
  const separate = !v.timestamp && (!!v.date || !!v.time);
  return (
    <div className="space-y-4">
      <FormGrid>
        {pick("employee", "Employee or device user id", "Required")}
        <Field label="Match people by">
          <Select value={v.match_by} onChange={(x) => set({ match_by: (x as Mapping["match_by"]) || "device_user_id" })}
            options={[{ value: "device_user_id", label: "Device user id (enrolment)" }, { value: "employee_code", label: "Employee ID" }]} />
        </Field>
      </FormGrid>
      <RadioCards columns={2} value={separate ? "split" : "one"} onChange={(x) => set(x === "split" ? { timestamp: null } : { date: null, time: null })}
        options={[{ value: "one", label: "One date-and-time column" }, { value: "split", label: "Separate date and time" }]} />
      <FormGrid>
        {separate ? <>{pick("date", "Date column")}{pick("time", "Time column")}</> : pick("timestamp", "Date and time column")}
        {pick("direction", "In / out column", "Optional")}
        <Field label="Date format" hint="Optional, e.g. %d-%m-%Y %H:%M"><TextInput value={v.date_format || ""} onValueChange={(x) => set({ date_format: x || null })} placeholder="Read automatically" /></Field>
        <div className="flex items-end pb-2"><Checkbox checked={v.has_header} onChange={(x) => set({ has_header: x })} label="First row has column names" /></div>
      </FormGrid>
    </div>
  );
}

function Line({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-baseline justify-between gap-4 py-1.5 text-[13.5px]"><span className="text-muted">{label}</span><span className="min-w-0 text-right text-ink">{children}</span></div>;
}

/** Online / offline for ADMS devices and connector-read devices; Active / Off otherwise. */
export function DeviceStatus({ d }: { d: Device }) {
  if (!d.active) return <Badge tone="neutral" dot>Off</Badge>;
  if (d.online === true) return <Badge tone="good" dot>Online</Badge>;
  if (d.online === false) return <Badge tone="warn" dot>{d.last_seen_at || d.connector?.seen_at ? "Offline" : "Waiting"}</Badge>;
  if (d.state?.last_error) return <Badge tone="bad" dot>Problem</Badge>;
  return <Badge tone="good" dot>Active</Badge>;
}

export function DeviceDetailModal({ device, onClose, onEdit, onKey, onChanged }: {
  device: Device | null; onClose: () => void; onEdit: (d: Device) => void; onKey: (key: string, d: Device) => void; onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<SyncLog[] | null>(null);
  useEffect(() => {
    if (!device) return;
    let live = true;
    api.get<{ items: SyncLog[] }>(`/attendance/sync-logs?device_uuid=${device.uuid}&size=5`).then((r) => { if (live) setLogs(r.items); }).catch(() => {});
    return () => { live = false; };
  }, [device]);

  async function newKey() {
    if (!device) return;
    if (!(await confirm({ title: "Make a new key?", message: "The old key stops working at once. Update the device or middleware with the new one.", confirmLabel: "Make new key", tone: "danger" }))) return;
    setBusy(true);
    try {
      const r = await api.post<{ api_key: string }>(`/attendance/devices/${device.uuid}/key`);
      onKey(r.api_key, device);
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  }
  async function pull() {
    if (!device) return;
    setBusy(true);
    try {
      const r = await api.post<{ logs: SyncLog[] }>(`/attendance/devices/${device.uuid}/pull`);
      const ins = r.logs.reduce((a, l) => a + l.inserted, 0);
      const failed = r.logs.find((l) => l.status === "failed");
      if (failed) toast.error(failed.message || "Couldn't read the device");
      else toast.success(r.logs.length ? `${ins} new punches` : "Nothing new");
      setLogs((old) => [...r.logs, ...(old ?? [])].slice(0, 5));
      onChanged();
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  }
  async function connectorFile() {
    if (!device) return;
    if (!(await confirm({ title: "Download the connector settings file?", message: "This makes a new key for the device. A connector already set up with an older file stops sending until you replace its connector.json.", confirmLabel: "Download" }))) return;
    setBusy(true);
    try {
      const r = await api.post<{ file_name: string; content: unknown }>(`/attendance/devices/${device.uuid}/connector-file`);
      const url = URL.createObjectURL(new Blob([JSON.stringify(r.content, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = r.file_name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Saved connector.json", { description: "Put it next to connector.exe on the office PC." });
      onChanged();
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  }
  async function command(action: "reload" | "info") {
    if (!device) return;
    setBusy(true);
    try {
      const r = await api.post<{ detail: string }>(`/attendance/devices/${device.uuid}/command`, { action, days: 31 });
      toast.success(r.detail);
      onChanged();
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  }

  const d = device;
  const conn = d?.connection ?? "";
  const viaConnector = d?.runs_on === "connector";
  const adms = d?.state?.adms;
  const info = adms?.info ?? {};
  const a = (() => { try { const u = new URL(API_BASE); return { host: u.hostname, port: u.port || (u.protocol === "https:" ? "443" : "80") }; } catch { return { host: "", port: "" }; } })();
  return (
    <Modal open={!!d} onClose={onClose} size="lg" busy={busy} title={d?.name} description={d ? [d.vendor, d.model, d.kind_label].filter(Boolean).join(" · ") : undefined}
      headerActions={d && <Button size="sm" icon={Pencil} onClick={() => onEdit(d)}>Edit</Button>}
      footer={d && <>
        {(conn === "push" || conn === "webhook") && <Button icon={KeyRound} loading={busy} onClick={newKey}>New key</Button>}
        {viaConnector && <Button icon={Download} loading={busy} onClick={connectorFile}>Connector settings file</Button>}
        {PULLED.includes(conn) && !viaConnector && <Button icon={RefreshCw} loading={busy} onClick={pull}>Pull now</Button>}
        {conn === "adms" && <Button icon={RotateCcw} loading={busy} onClick={() => command("reload")}>Fetch last 31 days again</Button>}
        <Button variant="primary" onClick={onClose}>Close</Button>
      </>}>
      {d && (
        <div className="space-y-6">
          <KeyValue items={[
            { label: "Connection", value: <>{d.connection_label}{viaConnector ? " · office connector" : ""}</> },
            { label: "Status", value: <DeviceStatus d={d} /> },
            { label: "Location", value: d.location_name },
            { label: "Serial number", value: d.serial_number },
            { label: "Last seen", value: d.last_seen_at ? formatDateTime(d.last_seen_at) : null },
            { label: "Last sync", value: d.last_sync_at ? formatDateTime(d.last_sync_at) : null },
            { label: "Enrolled people", value: String(d.enrolled) },
            { label: "Device timezone", value: d.timezone || "Company's" },
            ...((conn === "push" || conn === "webhook") ? [{ label: "Key starts with", value: d.api_key_prefix ? <span className="font-mono">{d.api_key_prefix}…</span> : null }] : []),
            ...(conn === "ftp" && d.ftp_config ? [
              { label: "Folder", value: `${d.ftp_config.protocol.toUpperCase()} ${d.ftp_config.host}:${d.ftp_config.port}${d.ftp_config.path}` },
              { label: "Files", value: `${d.ftp_config.file_pattern}, every ${d.ftp_config.every_minutes} min` },
            ] : []),
            ...(PULLED.includes(conn) && !viaConnector ? [{ label: "Next check", value: d.next_pull_at ? formatDateTime(d.next_pull_at) : null }] : []),
            ...(d.state?.last_time || d.state?.last_id ? [{ label: "Read up to", value: d.state.last_time ? d.state.last_time.replace("T", " ") : `id ${d.state.last_id}` }] : []),
          ]} />

          {d.state?.last_error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-[13px] text-rose-900">
              <p className="mb-0.5">Last problem</p><p className="break-words text-[12.5px]">{d.state.last_error}</p>
            </div>
          )}

          {conn === "adms" && (
            <div className="rounded-xl border border-line px-4 py-2">
              <Line label="Server address on the device">{a.host} <span className="text-muted">port</span> {a.port}</Line>
              <Line label="Device's address">{adms?.ip || "—"}</Line>
              <Line label="Last handshake">{adms?.handshake_at ? formatRelative(adms.handshake_at) : "Not yet"}</Line>
              {info.firmware && <Line label="Firmware">{info.firmware}</Line>}
              {info.users && <Line label="Users / punches on the device">{info.users} / {info.punches ?? "—"}</Line>}
              {!!d.state?.device_users && <Line label="Users it reported">{d.state.device_users}</Line>}
              {(d.state?.commands ?? []).length > 0 && (
                <Line label="Last command">{d.state!.commands[d.state!.commands.length - 1].cmd.split(" ").slice(0, 3).join(" ")} · {d.state!.commands[d.state!.commands.length - 1].status}</Line>
              )}
              <div className="py-2"><Button size="sm" variant="ghost" icon={Info} loading={busy} onClick={() => command("info")}>Ask the device for its details</Button></div>
            </div>
          )}

          {viaConnector && (
            <div className="rounded-xl border border-line px-4 py-2">
              <Line label="Office connector">{d.connector?.online ? <Badge tone="good" dot>Online</Badge> : <Badge tone="warn" dot>{d.connector?.seen_at ? "Offline" : "Not started yet"}</Badge>}</Line>
              {d.connector?.seen_at && <Line label="Last heard from">{formatRelative(d.connector.seen_at)}</Line>}
              {d.connector?.host && <Line label="Computer">{d.connector.host}{d.connector.version ? ` · version ${d.connector.version}` : ""}</Line>}
              {d.connector?.seen_at && <Line label="Punches waiting to be sent">{d.connector.queue ?? 0}</Line>}
              {d.connector?.last_error && <Line label="Its last problem"><span className="text-rose-700">{d.connector.last_error}</span></Line>}
              {!d.connector?.seen_at && <p className="py-2 text-[13px] text-muted">Download the connector settings file below, put it next to connector.exe on an office PC and run it.</p>}
            </div>
          )}

          {conn === "push" && <Field label="Push address" hint="Send punches here with the key in the X-Device-Key header."><CopyBox text={pushUrl()} /></Field>}
          {conn === "webhook" && <Field label="Vendor push address" hint="The key was shown once when the device was added. Make a new key to see the full address again."><CopyBox text={hookUrl(`${d.api_key_prefix ?? "dev_"}…`)} /></Field>}
          <div>
            <p className="mb-2 text-[13px] text-muted">Recent syncs</p>
            {!logs ? <div className="h-16 animate-pulse rounded-xl bg-sunken" /> : logs.length === 0 ? <p className="text-[13.5px] text-faint">Nothing received yet.</p> : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {logs.map((l) => (
                  <li key={l.uuid} className="flex items-center justify-between gap-3 px-3 py-2 text-[13.5px]">
                    <span className="min-w-0 truncate text-ink">{l.message || l.file_name || "Sync"}</span>
                    <span className="flex shrink-0 items-center gap-3"><span className="text-faint">{formatRelative(l.created_at)}</span><SyncStatus status={l.status} /></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function EnrolModal({ open, devices, onClose, onSaved }: { open: boolean; devices: Device[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [device, setDevice] = useState<string>("");
  const [uid, setUid] = useState("");
  const [emp, setEmp] = useState<number | null>(null);
  const [card, setCard] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api.post("/attendance/enrolments", { device_uuid: device || null, device_user_id: uid.trim(), employee_id: emp, card_number: card || null });
      toast.success("Enrolled");
      onSaved();
    } catch (e) { toast.error(errorText(e, "Couldn't enrol")); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} dirty={!!uid || !!emp} title="Enrol an employee"
      description="Link the user id on the device to the employee."
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!uid.trim() || !emp} onClick={save}>Enrol</Button></>}>
      <FormGrid columns={1}>
        <Field label="Device"><Select value={device} onChange={(x) => setDevice(String(x ?? ""))}
          options={[{ value: "", label: "All devices" }, ...devices.map((d) => ({ value: d.uuid, label: d.name }))]} /></Field>
        <Field label="User id on the device" required><TextInput value={uid} onValueChange={setUid} placeholder="101" data-autofocus /></Field>
        <Field label="Employee" required><Select<number> value={emp} onChange={(x) => setEmp(x)} loadOptions={lookupEmployees} placeholder="Search by name or ID" /></Field>
        <Field label="Card number" hint="For RFID cards, optional"><TextInput value={card} onValueChange={setCard} /></Field>
      </FormGrid>
    </Modal>
  );
}

export function LogModal({ log, onClose }: { log: SyncLog | null; onClose: () => void }) {
  return (
    <Modal open={!!log} onClose={onClose} size="md" title={log?.file_name || log?.device_name || "Sync"} description={log ? formatDateTime(log.created_at) : undefined}
      footer={<Button variant="primary" onClick={onClose}>Close</Button>}>
      {log && (
        <div className="space-y-5">
          <div className="flex items-center gap-3"><SyncStatus status={log.status} /><span className="text-[13.5px] text-muted">{log.message}</span></div>
          <KeyValue columns={2} items={[
            { label: "Received", value: String(log.received) }, { label: "New punches", value: String(log.inserted) },
            { label: "Already there", value: String(log.duplicates) }, { label: "Not enrolled", value: String(log.unmatched) },
          ]} />
          {log.errors.length > 0 && (
            <div>
              <p className="mb-2 text-[13px] text-muted">Problems</p>
              <ul className="max-h-64 divide-y divide-line overflow-auto rounded-xl border border-line text-[13.5px]">
                {log.errors.map((e, i) => <li key={i} className="px-3 py-2">{e.row ? <span className="text-faint">Row {e.row}: </span> : null}{e.message}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

type Preview = { headers: string[]; rows: (string | number | null)[][]; total_rows: number; guess: Mapping };

export function ImportWizard({ open, devices, onClose, onDone }: { open: boolean; devices: Device[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [device, setDevice] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [map, setMap] = useState<Mapping>(EMPTY_MAP);
  const [result, setResult] = useState<SyncLog | null>(null);
  const [busy, setBusy] = useState(false);
  const fileDevices = useMemo(() => devices.filter((d) => d.connection !== "push"), [devices]);

  async function readFile() {
    if (!files[0]) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", files[0]);
      const p = await postForm<Preview>("/attendance/imports/preview", fd);
      setPreview(p);
      const saved = devices.find((d) => d.uuid === device)?.column_mapping;
      setMap({ ...EMPTY_MAP, ...p.guess, ...(saved && p.headers.includes(saved.employee || "") ? saved : {}) });
      setStep(1);
    } catch (e) { toast.error(errorText(e, "Couldn't read the file")); } finally { setBusy(false); }
  }
  async function run() {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", files[0]);
      fd.append("mapping", JSON.stringify(map));
      if (device) fd.append("device_uuid", device);
      const r = await postForm<SyncLog>("/attendance/imports", fd);
      setResult(r);
      setStep(2);
      onDone();
    } catch (e) { toast.error(errorText(e, "Import failed")); } finally { setBusy(false); }
  }
  const mapOk = !!map.employee && (!!map.timestamp || (!!map.date && !!map.time));
  const colIndex = (name: string | null) => (name && preview ? preview.headers.indexOf(name) : -1);
  const used = [map.employee, map.timestamp, map.date, map.time, map.direction].filter(Boolean) as string[];

  return (
    <Modal open={open} onClose={onClose} size="xl" busy={busy} dirty={step === 1} title="Import punches from a file"
      description="CSV or Excel exports from any attendance device."
      footer={<>
        {step === 0 && <><ModalCancel /><Button variant="primary" icon={FileUp} loading={busy} disabled={!files[0]} onClick={readFile}>Read file</Button></>}
        {step === 1 && <><Button onClick={() => setStep(0)}>Back</Button><Button variant="primary" loading={busy} disabled={!mapOk} onClick={run}>Import {preview?.total_rows ?? ""} rows</Button></>}
        {step === 2 && <Button variant="primary" onClick={onClose}>Done</Button>}
      </>}>
      <div className="space-y-6">
        <Stepper steps={[{ label: "Upload" }, { label: "Match columns" }, { label: "Result" }]} current={step} onStepClick={(i) => i < step && step < 2 && setStep(i)} />
        {step === 0 && (
          <div className="space-y-4">
            <FileDrop value={files} onChange={setFiles} accept=".csv,.xlsx,.xlsm" maxSizeMb={10} title="Drop the export file here" hint="CSV or Excel (.xlsx), up to 10 MB" />
            <Field label="Device" hint="Optional: device ids are matched against this device's enrolments">
              <Select value={device} onChange={(x) => setDevice(String(x ?? ""))}
                options={[{ value: "", label: "No particular device" }, ...fileDevices.map((d) => ({ value: d.uuid, label: d.name })), ...devices.filter((d) => d.connection === "push").map((d) => ({ value: d.uuid, label: d.name }))]} />
            </Field>
          </div>
        )}
        {step === 1 && preview && (
          <div className="space-y-5">
            <MappingFields v={map} set={(x) => setMap((o) => ({ ...o, ...x }))} headers={preview.headers} />
            <div>
              <p className="mb-2 text-[13px] text-muted">First rows of {files[0]?.name} ({preview.total_rows} rows)</p>
              <div className="overflow-auto rounded-xl border border-line">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-sunken text-left text-muted">
                    <tr>{preview.headers.map((h) => <th key={h} className={`whitespace-nowrap px-3 py-2 font-normal ${used.includes(h) ? "text-primary" : ""}`}>{h}</th>)}</tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {preview.rows.map((r, i) => (
                      <tr key={i}>{preview.headers.map((h, j) => <td key={j} className={`whitespace-nowrap px-3 py-1.5 ${[colIndex(map.employee), colIndex(map.timestamp), colIndex(map.date), colIndex(map.time)].includes(j) ? "text-ink" : "text-muted"}`}>{r[j] === null || r[j] === undefined ? "" : String(r[j])}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        {step === 2 && result && (
          <div className="space-y-4">
            <div className="flex items-center gap-3"><SyncStatus status={result.status} /><span className="text-[14px] text-ink">{result.message}</span></div>
            <KeyValue columns={2} items={[
              { label: "Rows read", value: String(result.received) }, { label: "New punches", value: String(result.inserted) },
              { label: "Already there", value: String(result.duplicates) }, { label: "Not enrolled", value: String(result.unmatched) },
            ]} />
            {result.errors.length > 0 && (
              <ul className="max-h-56 divide-y divide-line overflow-auto rounded-xl border border-line text-[13.5px]">
                {result.errors.map((e, i) => <li key={i} className="px-3 py-2">{e.row ? <span className="text-faint">Row {e.row}: </span> : null}{e.message}</li>)}
              </ul>
            )}
            <p className="text-[13px] text-muted">Attendance for these days has been worked out again.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
