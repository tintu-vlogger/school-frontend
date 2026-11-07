"use client";

/*
 * Devices: attendance machines of any make and how their punches reach us (ADMS cloud
 * push, our push API, vendor push, vendor software API, database read, LAN pull, FTP
 * folder, email, file upload; database and LAN pull also through the office connector),
 * employee enrolments and the sync log. Add and edit are a step-by-step modal
 * (DeviceWizard); details, key and import are modals too.
 */
import { useCallback, useEffect, useState } from "react";
import { FileUp, Plus, Router, Trash2, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, formatRelative } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import { Button, DataTable, FilterBar, Tabs, useConfirm, type Column, type FilterValues } from "@/components/ui-kit";
import {
  DeviceDetailModal, DeviceStatus, EnrolModal, ImportWizard, KIND_LABELS, KeyModal, LogModal, SyncStatus,
  type Device, type DeviceMeta, type SyncLog,
} from "@/components/attendance/devices-modals";
import { DeviceWizard, type Presets } from "@/components/attendance/device-connection";
import { errorText } from "@/components/attendance/shared";

type Tab = "devices" | "enrolments" | "logs";
type Enrolment = { uuid: string; device_id: number | null; device_name: string; device_user_id: string; card_number: string | null; employee_id: number; employee_name: string; employee_code: string | null };
type Page<T> = { items: T[]; total: number; page: number; size: number };

export default function DevicesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>("devices");
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [meta, setMeta] = useState<DeviceMeta | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = () => setNonce((n) => n + 1);

  const [form, setForm] = useState<{ open: boolean; device: Device | null; k: number }>({ open: false, device: null, k: 0 });
  const [viewing, setViewing] = useState<Device | null>(null);
  const [key, setKey] = useState<{ key: string; name: string; connection: string } | null>(null);
  const [presets, setPresets] = useState<Presets | null>(null);
  useEffect(() => {
    api.get<Presets>("/attendance/device-presets").then((p) => setPresets(p && p.api ? p : null)).catch(() => {});
  }, []);
  const [importing, setImporting] = useState(0);
  const [enrolling, setEnrolling] = useState(0);
  const [log, setLog] = useState<SyncLog | null>(null);

  useEffect(() => {
    let live = true;
    api.get<{ items: Device[] } & DeviceMeta>("/attendance/devices")
      .then((r) => { if (live) { setDevices(r.items); setMeta({ vendors: r.vendors, kinds: r.kinds, connections: r.connections }); } })
      .catch((e) => { if (live) { setDevices([]); toast.error(errorText(e, "Couldn't load devices")); } });
    return () => { live = false; };
  }, [nonce, toast]);

  // enrolments
  const [eq, setEq] = useState("");
  const [ef, setEf] = useState<FilterValues>({});
  const [ePage, setEPage] = useState(1);
  const [enrol, setEnrol] = useState<Page<Enrolment> | null>(null);
  useEffect(() => {
    if (tab !== "enrolments") return;
    let live = true;
    const q = new URLSearchParams({ page: String(ePage), size: "25" });
    if (eq) q.set("q", eq);
    if (ef.device?.[0]) q.set("device_uuid", ef.device[0]);
    api.get<Page<Enrolment>>(`/attendance/enrolments?${q}`).then((r) => { if (live) setEnrol(r); }).catch(() => { if (live) setEnrol({ items: [], total: 0, page: 1, size: 25 }); });
    return () => { live = false; };
  }, [tab, eq, ef, ePage, nonce]);

  // sync log
  const [lf, setLf] = useState<FilterValues>({});
  const [lPage, setLPage] = useState(1);
  const [logs, setLogs] = useState<Page<SyncLog> | null>(null);
  useEffect(() => {
    if (tab !== "logs") return;
    let live = true;
    const q = new URLSearchParams({ page: String(lPage), size: "25" });
    if (lf.device?.[0]) q.set("device_uuid", lf.device[0]);
    api.get<Page<SyncLog>>(`/attendance/sync-logs?${q}`).then((r) => { if (live) setLogs(r); }).catch(() => { if (live) setLogs({ items: [], total: 0, page: 1, size: 25 }); });
    return () => { live = false; };
  }, [tab, lf, lPage, nonce]);

  const removeEnrolment = useCallback(async (e: Enrolment) => {
    if (!(await confirm({ title: `Remove ${e.employee_name}'s enrolment?`, message: `Punches from user ${e.device_user_id} will no longer be matched.`, confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.delete(`/attendance/enrolments/${e.uuid}`); toast.success("Removed"); refresh(); }
    catch (err) { toast.error(errorText(err)); }
  }, [confirm, toast]);

  const deviceOptions = (devices ?? []).map((d) => ({ value: d.uuid, label: d.name }));

  const deviceCols: Column<Device>[] = [
    { key: "name", header: "Device", sortable: true, sortValue: (d) => d.name, cell: (d) => (
      <div className="min-w-0"><p className="truncate text-ink">{d.name}</p><p className="truncate text-[12.5px] text-muted">{[d.vendor, d.model].filter(Boolean).join(" ") || "Make not set"}</p></div>
    ) },
    { key: "kind", header: "Kind", hideBelow: "md", cell: (d) => <span className="text-muted">{d.kind_label}</span> },
    { key: "conn", header: "Connection", cell: (d) => (
      <div className="min-w-0"><p className="truncate text-ink/80">{d.connection_label}</p>{d.runs_on === "connector" && <p className="text-[12.5px] text-muted">Office connector</p>}</div>
    ) },
    { key: "loc", header: "Location", hideBelow: "lg", cell: (d) => d.location_name ? <span className="text-muted">{d.location_name}</span> : <span className="text-faint">—</span> },
    { key: "seen", header: "Last activity", hideBelow: "sm", cell: (d) => {
      const t = d.last_seen_at || d.last_sync_at;
      return t ? <span className="text-muted" title={formatDateTime(t)}>{formatRelative(t)}</span> : <span className="text-faint">Never</span>;
    } },
    { key: "enrolled", header: "Enrolled", align: "right", hideBelow: "md", cell: (d) => <span className="tabular text-muted">{d.enrolled}</span> },
    { key: "status", header: "Status", cell: (d) => <DeviceStatus d={d} /> },
  ];
  const enrolCols: Column<Enrolment>[] = [
    { key: "uid", header: "Device user id", cell: (e) => <span className="tabular text-ink">{e.device_user_id}</span> },
    { key: "emp", header: "Employee", cell: (e) => <div><p className="text-ink">{e.employee_name}</p>{e.employee_code && <p className="text-[12.5px] text-muted">{e.employee_code}</p>}</div> },
    { key: "dev", header: "Device", hideBelow: "sm", cell: (e) => <span className="text-muted">{e.device_name}</span> },
    { key: "card", header: "Card", hideBelow: "md", cell: (e) => e.card_number ? <span className="tabular text-muted">{e.card_number}</span> : <span className="text-faint">—</span> },
  ];
  const logCols: Column<SyncLog>[] = [
    { key: "when", header: "When", cell: (l) => <span className="text-muted" title={formatDateTime(l.created_at)}>{formatRelative(l.created_at)}</span> },
    { key: "src", header: "Source", cell: (l) => <div><p className="text-ink">{l.device_name || "File upload"}</p><p className="text-[12.5px] text-muted">{l.file_name || KIND_LABELS[l.kind] || l.kind}</p></div> },
    { key: "new", header: "New", align: "right", cell: (l) => <span className="tabular">{l.inserted}</span> },
    { key: "dup", header: "Already there", align: "right", hideBelow: "md", cell: (l) => <span className="tabular text-muted">{l.duplicates}</span> },
    { key: "un", header: "Not enrolled", align: "right", hideBelow: "md", cell: (l) => <span className={`tabular ${l.unmatched ? "text-amber-700" : "text-muted"}`}>{l.unmatched}</span> },
    { key: "status", header: "Status", cell: (l) => <SyncStatus status={l.status} /> },
  ];

  return (
    <>
      <PageHeader title="Devices" description="Attendance machines of any make, who is enrolled on them and how their punches arrive."
        actions={<>
          <Button icon={FileUp} onClick={() => setImporting((n) => n + 1)}>Import file</Button>
          <Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, device: null, k: form.k + 1 })}>Add device</Button>
        </>} />
      <Tabs value={tab} onChange={setTab} className="mb-5" items={[
        { value: "devices", label: "Devices", count: devices?.length },
        { value: "enrolments", label: "Enrolments" },
        { value: "logs", label: "Sync log" },
      ]} />

      {tab === "devices" && (
        <DataTable rows={devices ?? []} rowKey={(d) => d.uuid} columns={deviceCols} loading={!devices}
          onRowClick={(d) => setViewing(d)}
          rowActions={(d) => [{ label: "Edit", onSelect: () => setForm({ open: true, device: d, k: form.k + 1 }) }]}
          emptyIcon={Router} emptyTitle="No devices yet" emptyHint="Add a biometric, card or face device, or import a file from one."
          emptyAction={<Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, device: null, k: form.k + 1 })}>Add device</Button>} />
      )}

      {tab === "enrolments" && (
        <>
          <FilterBar searchPlaceholder="Search by employee" onSearchChange={(q) => { setEq(q); setEPage(1); }}
            filters={[{ key: "device", label: "Device", options: deviceOptions }]} values={ef} onChange={(v) => { setEf(v); setEPage(1); }}
            actions={<Button icon={UserPlus} onClick={() => setEnrolling((n) => n + 1)}>Enrol</Button>} />
          <DataTable rows={enrol?.items ?? []} rowKey={(e) => e.uuid} columns={enrolCols} loading={!enrol}
            rowActions={(e) => [{ label: "Remove", icon: Trash2, danger: true, onSelect: () => removeEnrolment(e) }]}
            pagination={enrol ? { page: ePage, size: 25, total: enrol.total, onPageChange: setEPage } : undefined}
            emptyTitle="Nobody is enrolled" emptyHint="Link each person's user id on the device to their record." />
        </>
      )}

      {tab === "logs" && (
        <>
          <FilterBar filters={[{ key: "device", label: "Device", options: deviceOptions }]} values={lf} onChange={(v) => { setLf(v); setLPage(1); }} />
          <DataTable rows={logs?.items ?? []} rowKey={(l) => l.uuid} columns={logCols} loading={!logs} onRowClick={setLog}
            pagination={logs ? { page: lPage, size: 25, total: logs.total, onPageChange: setLPage } : undefined}
            emptyTitle="No syncs yet" emptyHint="Every push, pull, upload and connector send is listed here." />
        </>
      )}

      {form.open && <DeviceWizard key={`f${form.k}`} open device={form.device} meta={meta} presets={presets}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={(d, k) => { setForm((f) => ({ ...f, open: false })); setViewing(null); refresh(); if (k) setKey({ key: k, name: d.name, connection: d.runs_on === "connector" ? "connector" : d.connection }); }} />}
      <DeviceDetailModal device={viewing} onClose={() => setViewing(null)} onChanged={refresh}
        onEdit={(d) => { setViewing(null); setForm({ open: true, device: d, k: form.k + 1 }); }}
        onKey={(k, d) => { setViewing(null); setKey({ key: k, name: d.name, connection: d.connection }); refresh(); }} />
      <KeyModal apiKey={key?.key ?? null} deviceName={key?.name} connection={key?.connection} onClose={() => setKey(null)} />
      {importing > 0 && <ImportWizard key={`i${importing}`} open devices={devices ?? []} onClose={() => setImporting(0)} onDone={refresh} />}
      {enrolling > 0 && <EnrolModal key={`e${enrolling}`} open devices={devices ?? []} onClose={() => setEnrolling(0)} onSaved={() => { setEnrolling(0); refresh(); }} />}
      <LogModal log={log} onClose={() => setLog(null)} />
    </>
  );
}
