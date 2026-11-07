"use client";

/*
 * Add / edit a device as a short step-by-step modal:
 *   1 Device       name, make, serial number, location, clock timezone
 *   2 Connection   how punches arrive (ADMS push, our push API, vendor push, vendor API,
 *                  database read, LAN pull, FTP folder, email, file upload) and, for database
 *                  and LAN pull, whether our server or the office connector reads it
 *   3 Settings     the connection's own settings, with presets (eSSL, Matrix COSEC, Realtime,
 *                  ZKBioTime, Suprema, Hikvision ...) and a test where it helps
 *   4 Fields       test the connection and match its fields: sample rows, then how they read
 *                  as punches (vendor API, database, vendor push); or the file columns
 * Steps that a connection doesn't need are left out.
 */
import { useMemo, useState } from "react";
import {
  CloudUpload, Database, FileUp, FolderSync, Globe, Mail, Network, Plus, Send, Server, Trash2, Webhook, Monitor, PlayCircle,
} from "lucide-react";
import { API_BASE, api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, Field, FormGrid, FormSection, IconButton, Modal, ModalCancel, NumberInput, RadioCards, Select, Stepper,
  TextInput, Textarea, Toggle, type SelectOption,
} from "@/components/ui-kit";
import { errorText } from "./shared";
import { FtpFields, MappingFields, type Device, type DeviceMeta, type FtpConfig, type Mapping } from "./devices-modals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Cfg = { [k: string]: any };
export type Preset = { label: string; vendor: string | null; hint: string; config?: Cfg; mapping?: Cfg };
export type Presets = {
  api: Record<string, Preset>; webhook: Record<string, Preset>; database: Record<string, Preset>;
  engines: Record<string, { label: string; port: number | null; installed: boolean; package: string; connector_only?: boolean }>;
  zk_installed: boolean;
};
export type TestResult = {
  ok: boolean; notes: string[]; tables?: string[] | null;
  sample: null | { columns: string[]; rows: Cfg[]; total: number; guess: Cfg;
    punches: { device_user_id: string; time: string | null; raw_time?: string | null; direction: string | null; terminal?: string | null }[] };
  preview?: { headers: string[]; rows: (string | number | null)[][]; total_rows: number; guess: Mapping } | null;
};

export const CONNECTION_INFO: Record<string, { icon: typeof Send; desc: string }> = {
  adms: { icon: CloudUpload, desc: "ZKTeco, eSSL and similar machines send punches to us over the internet. Nothing to install." },
  push: { icon: Send, desc: "Your middleware posts punches to our address in our format, with the device key." },
  webhook: { icon: Webhook, desc: "The device posts its own format (Hikvision, any JSON). You match the fields once." },
  api: { icon: Globe, desc: "We call the attendance software's web API on a schedule (eTimeTrackLite, COSEC, BioTime...)." },
  database: { icon: Database, desc: "We read punches from the attendance software's database (SQL Server, MySQL, Oracle...)." },
  zk: { icon: Network, desc: "We read a ZKTeco-protocol machine directly over the network (port 4370)." },
  ftp: { icon: FolderSync, desc: "We pick up export files from an FTP or SFTP folder." },
  email: { icon: Mail, desc: "We read CSV or Excel punch reports sent to a mailbox." },
  file: { icon: FileUp, desc: "Someone uploads the export file by hand." },
};
const CONNECTOR_CAPABLE = ["database", "zk"];
const SOURCE_CONNS = ["api", "database", "zk", "email", "webhook", "adms"];
const MAPPED = ["api", "database", "webhook"];
const FILE_MAPPED = ["ftp", "email", "file"];

const EMPTY_FTP: FtpConfig = { protocol: "sftp", host: "", port: 22, username: "", password: "", path: "/", file_pattern: "*.csv", every_minutes: 30, delete_after: false };
const EMPTY_MAP: Mapping = { employee: "UserID", timestamp: "DateTime", date: null, time: null, direction: null, date_format: null, match_by: "device_user_id", has_header: true };
const DEFAULTS: Record<string, Cfg> = {
  api: { preset: "custom", method: "GET", url: "", params: [], headers: [], body: "", content_type: "application/json", auth_type: "none", paging: "none", lookback_days: 3, overlap_minutes: 30, date_window_days: 31, every_minutes: 15, page_size: 500, verify_tls: true },
  database: { preset: "custom", engine: "mssql", port: 1433, mode: "table", incremental: "time", lookback_days: 7, batch: 5000, every_minutes: 15 },
  zk: { ip: "", port: 4370, protocol: "tcp", timeout: 15, use_status: false, lookback_days: 30, every_minutes: 15 },
  email: { host: "", port: 993, ssl: true, username: "", folder: "INBOX", file_pattern: "*.csv", lookback_days: 7, every_minutes: 60 },
  webhook: { preset: "custom" },
  adms: { use_status: false, allowed_ips: "" },
};
const MASK = "••••••";

/** The ADMS server address a device should be given (our API host and port). */
export function admsAddress() {
  try {
    const u = new URL(API_BASE);
    const https = u.protocol === "https:";
    return { host: u.hostname, port: u.port || (https ? "443" : "80"), https, origin: u.origin };
  } catch {
    return { host: "", port: "", https: false, origin: "" };
  }
}

function presetOptions(p: Record<string, Preset> | undefined): SelectOption[] {
  return Object.entries(p ?? {}).map(([k, x]) => ({ value: k, label: x.label, description: x.vendor ?? undefined }));
}

function Pairs({ value, onChange, namePlaceholder, valuePlaceholder }: {
  value: { name: string; value: string }[]; onChange: (v: { name: string; value: string }[]) => void; namePlaceholder: string; valuePlaceholder: string;
}) {
  const rows = value ?? [];
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <TextInput className="w-40 shrink-0" value={r.name} placeholder={namePlaceholder} onValueChange={(x) => onChange(rows.map((o, j) => (j === i ? { ...o, name: x } : o)))} />
          <TextInput className="min-w-0 flex-1 font-mono text-[12.5px]" value={r.value} placeholder={valuePlaceholder} onValueChange={(x) => onChange(rows.map((o, j) => (j === i ? { ...o, value: x } : o)))} />
          <IconButton icon={Trash2} label="Remove" onClick={() => onChange(rows.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button size="sm" icon={Plus} onClick={() => onChange([...rows, { name: "", value: "" }])}>Add</Button>
    </div>
  );
}

function Secret({ value, onChange, placeholder }: { value: string | undefined; onChange: (x: string) => void; placeholder?: string }) {
  const saved = value === MASK;
  return <TextInput type="password" autoComplete="new-password" value={saved ? "" : value ?? ""} onValueChange={onChange}
    placeholder={saved ? "Saved. Type to change" : placeholder} />;
}

// ── Settings per connection ─────────────────────────────────────────

function AdmsSettings({ c, set, serial }: { c: Cfg; set: (x: Cfg) => void; serial: string }) {
  const a = admsAddress();
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-line bg-sunken px-4 py-3 text-[13.5px] leading-6 text-ink/90">
        <p className="mb-1 text-ink">On the device: Menu, Comm. (or Network), Cloud Server Setting / ADMS</p>
        <ul className="list-disc pl-5 text-muted">
          <li>Server address: <span className="font-mono text-ink">{a.host || "your API address"}</span></li>
          <li>Server port: <span className="font-mono text-ink">{a.port}</span>{a.https ? " (HTTPS on)" : ""}</li>
          <li>Enable domain name: on if the address is a name, not numbers. Proxy: off.</li>
          <li>Serial number here must match the device: <span className="font-mono text-ink">{serial || "not entered yet"}</span></li>
        </ul>
        <p className="mt-1 text-[12.5px] text-faint">Many older machines can&apos;t use HTTPS. If yours can&apos;t, ask us for the plain HTTP device address.</p>
      </div>
      <FormGrid>
        <div className="sm:col-span-2"><Toggle checked={!!c.use_status} onChange={(x) => set({ use_status: x })} label="Trust the in / out key pressed on the device"
          description="Off: the first punch of the day is in, the next out, and so on. Turn on only if staff press In and Out keys." /></div>
        <Field label="Only accept from these IP addresses" hint="Optional, comma separated: your office's internet address">
          <TextInput value={c.allowed_ips || ""} onValueChange={(x) => set({ allowed_ips: x })} placeholder="49.204.10.20" />
        </Field>
      </FormGrid>
    </div>
  );
}

function ApiSettings({ c, set, presets, applyPreset }: { c: Cfg; set: (x: Cfg) => void; presets: Presets | null; applyPreset: (k: string) => void }) {
  const p = presets?.api?.[c.preset || "custom"];
  const auth = c.auth_type || "none";
  return (
    <div className="space-y-6">
      <FormSection title="Software">
        <Field label="Preset" hint={p?.hint}>
          <Select value={c.preset || "custom"} onChange={(x) => applyPreset(String(x ?? "custom"))} options={presetOptions(presets?.api)} />
        </Field>
      </FormSection>
      <FormSection title="Request" description="Use {from} and {to} for the date range, e.g. {from:%d/%m/%Y}. {page}, {offset}, {size}, {serial} also work.">
        <FormGrid>
          <Field label="Method"><Select value={c.method || "GET"} onChange={(x) => set({ method: x || "GET" })} options={[{ value: "GET", label: "GET" }, { value: "POST", label: "POST" }]} /></Field>
          <Field label="Check every"><NumberInput value={c.every_minutes ?? 15} onChange={(x) => set({ every_minutes: x ?? 15 })} min={5} max={1440} suffix="min" /></Field>
          <div className="sm:col-span-2"><Field label="Address" required><TextInput value={c.url || ""} onValueChange={(x) => set({ url: x })} placeholder="https://attendance.example.in/api/punches" className="font-mono text-[12.5px]" /></Field></div>
        </FormGrid>
        <div className="mt-4 space-y-4">
          <Field label="Query parameters"><Pairs value={c.params} onChange={(x) => set({ params: x })} namePlaceholder="from" valuePlaceholder="{from:%Y-%m-%d %H:%M:%S}" /></Field>
          <Field label="Headers"><Pairs value={c.headers} onChange={(x) => set({ headers: x })} namePlaceholder="Accept" valuePlaceholder="application/json" /></Field>
          {c.method === "POST" && <>
            <Field label="Content type"><TextInput value={c.content_type || ""} onValueChange={(x) => set({ content_type: x })} placeholder="application/json" /></Field>
            <Field label="Body"><Textarea rows={6} className="font-mono text-[12px]" value={c.body || ""} onValueChange={(x) => set({ body: x })} /></Field>
          </>}
        </div>
      </FormSection>
      <FormSection title="Sign-in">
        <FormGrid>
          <Field label="How we sign in">
            <Select value={auth} onChange={(x) => set({ auth_type: x || "none" })} options={[
              { value: "none", label: "No sign-in" }, { value: "api_key", label: "API key" }, { value: "basic", label: "User name and password (Basic)" },
              { value: "bearer", label: "Bearer token" }, { value: "oauth2", label: "OAuth2 client credentials" },
              { value: "login", label: "Sign in first, then use the token" }, { value: "body", label: "User name and password in the body" }]} />
          </Field>
          {auth === "api_key" && <>
            <Field label="Header or parameter name"><TextInput value={c.auth_header || "X-API-Key"} onValueChange={(x) => set({ auth_header: x })} /></Field>
            <Field label="API key"><Secret value={c.api_key} onChange={(x) => set({ api_key: x })} /></Field>
            <Field label="Send the key as"><Select value={c.api_key_in || "header"} onChange={(x) => set({ api_key_in: x })} options={[{ value: "header", label: "Header" }, { value: "query", label: "Query parameter" }]} /></Field>
          </>}
          {(auth === "basic" || auth === "login" || auth === "body") && <>
            <Field label="User name"><TextInput value={c.username || ""} onValueChange={(x) => set({ username: x })} autoComplete="off" /></Field>
            <Field label="Password"><Secret value={c.password} onChange={(x) => set({ password: x })} /></Field>
          </>}
          {auth === "bearer" && <Field label="Token"><Secret value={c.token} onChange={(x) => set({ token: x })} /></Field>}
          {auth === "oauth2" && <>
            <Field label="Token address" required><TextInput value={c.token_url || ""} onValueChange={(x) => set({ token_url: x })} placeholder="https://login.example.com/oauth/token" /></Field>
            <Field label="Client id"><TextInput value={c.client_id || ""} onValueChange={(x) => set({ client_id: x })} /></Field>
            <Field label="Client secret"><Secret value={c.client_secret} onChange={(x) => set({ client_secret: x })} /></Field>
            <Field label="Scope" hint="Optional"><TextInput value={c.scope || ""} onValueChange={(x) => set({ scope: x })} /></Field>
          </>}
          {auth === "login" && <>
            <Field label="Sign-in address" required><TextInput value={c.login_url || ""} onValueChange={(x) => set({ login_url: x })} /></Field>
            <Field label="Token is in" hint="json:token or header:bs-session-id"><TextInput value={c.token_from || ""} onValueChange={(x) => set({ token_from: x })} /></Field>
            <div className="sm:col-span-2"><Field label="Sign-in body" hint="JSON; {username} and {password} are filled in"><Textarea rows={2} className="font-mono text-[12px]" value={c.login_body || ""} onValueChange={(x) => set({ login_body: x })} /></Field></div>
            <Field label="Send the token in header"><TextInput value={c.token_header || "Authorization"} onValueChange={(x) => set({ token_header: x })} /></Field>
            <Field label="Before the token" hint='e.g. "Bearer " or "JWT "'><TextInput value={c.token_prefix ?? "Bearer "} onValueChange={(x) => set({ token_prefix: x })} /></Field>
          </>}
        </FormGrid>
      </FormSection>
      <FormSection title="Pages and dates">
        <FormGrid>
          <Field label="Results come in pages">
            <Select value={c.paging || "none"} onChange={(x) => set({ paging: x || "none" })} options={[
              { value: "none", label: "No, all at once" }, { value: "page", label: "Page numbers" }, { value: "offset", label: "Offset and limit" },
              { value: "next", label: "A link or token to the next page" }]} />
          </Field>
          {c.paging && c.paging !== "none" && <Field label="Page size"><NumberInput value={c.page_size ?? 500} onChange={(x) => set({ page_size: x ?? 500 })} min={1} max={5000} /></Field>}
          {c.paging === "page" && <Field label="Page parameter"><TextInput value={c.page_param || "page"} onValueChange={(x) => set({ page_param: x })} /></Field>}
          {c.paging === "offset" && <Field label="Offset parameter"><TextInput value={c.offset_param || "offset"} onValueChange={(x) => set({ offset_param: x })} /></Field>}
          {(c.paging === "page" || c.paging === "offset") && <Field label="Page size parameter" hint="Optional"><TextInput value={c.size_param || ""} onValueChange={(x) => set({ size_param: x })} placeholder="limit" /></Field>}
          {c.paging === "next" && <Field label="Next page is in" hint="Field in the answer"><TextInput value={c.next_path || "next"} onValueChange={(x) => set({ next_path: x })} /></Field>}
          <Field label="First time, read the last"><NumberInput value={c.lookback_days ?? 3} onChange={(x) => set({ lookback_days: x ?? 3 })} min={0} max={90} suffix="days" /></Field>
          <Field label="Read again before the last punch" hint="Catches punches that arrive late"><NumberInput value={c.overlap_minutes ?? 30} onChange={(x) => set({ overlap_minutes: x ?? 0 })} min={0} max={1440} suffix="min" /></Field>
          <Field label="Longest range in one request"><NumberInput value={c.date_window_days ?? 31} onChange={(x) => set({ date_window_days: x ?? 31 })} min={1} max={92} suffix="days" /></Field>
          <div className="flex items-end pb-2"><Toggle checked={c.verify_tls !== false} onChange={(x) => set({ verify_tls: x })} label="Check the HTTPS certificate" /></div>
        </FormGrid>
      </FormSection>
    </div>
  );
}

function RunsOn({ value, onChange, conn }: { value: string; onChange: (x: string) => void; conn: string }) {
  return (
    <Field label="Who reads it">
      <RadioCards columns={2} value={value} onChange={onChange} options={[
        { value: "connector", label: "Office connector", icon: Monitor, description: conn === "zk" ? "A small program on an office PC reads the machine. Usual choice." : "A small program on an office PC reads the database. Usual choice." },
        { value: "server", label: "Our server", icon: Server, description: "Only if the server or machine is reachable from the internet." },
      ]} />
    </Field>
  );
}

function DbSettings({ c, set, presets, applyPreset, runsOn, setRunsOn }: {
  c: Cfg; set: (x: Cfg) => void; presets: Presets | null; applyPreset: (k: string) => void; runsOn: string; setRunsOn: (x: string) => void;
}) {
  const p = presets?.database?.[c.preset || "custom"];
  const engines = presets?.engines ?? {};
  const eng = engines[c.engine];
  const fileBased = c.engine === "access" || c.engine === "sqlite";
  return (
    <div className="space-y-6">
      <FormSection title="Software">
        <Field label="Preset" hint={p?.hint}>
          <Select value={c.preset || "custom"} onChange={(x) => applyPreset(String(x ?? "custom"))} options={presetOptions(presets?.database)} />
        </Field>
        <div className="mt-4">{c.engine === "access"
          ? <p className="text-[13px] text-muted">MS Access files are always read by the office connector.</p>
          : <RunsOn value={runsOn} onChange={setRunsOn} conn="database" />}</div>
      </FormSection>
      <FormSection title="Database">
        <FormGrid>
          <Field label="Kind of database">
            <Select value={c.engine || "mssql"} onChange={(x) => { const k = String(x ?? "mssql"); set({ engine: k, port: engines[k]?.port ?? null }); if (k === "access") setRunsOn("connector"); }}
              options={Object.entries(engines).map(([k, e]) => ({ value: k, label: e.label }))} />
          </Field>
          {fileBased ? (
            <Field label="Database file" required><TextInput value={c.file_path || ""} onValueChange={(x) => set({ file_path: x })} placeholder="C:\ZKTime5.0\att2000.mdb" className="font-mono text-[12.5px]" /></Field>
          ) : <>
            <Field label="Server" required><TextInput value={c.host || ""} onValueChange={(x) => set({ host: x })} placeholder={runsOn === "connector" ? "localhost or 192.168.1.10" : "db.example.in"} /></Field>
            <Field label="Port"><NumberInput value={c.port ?? null} onChange={(x) => set({ port: x })} min={1} max={65535} /></Field>
            <Field label={c.engine === "oracle" ? "Service name" : "Database name"}><TextInput value={c.database || ""} onValueChange={(x) => set({ database: x })} /></Field>
            <Field label="User name" hint="A user that can only read"><TextInput value={c.username || ""} onValueChange={(x) => set({ username: x })} autoComplete="off" /></Field>
          </>}
          <Field label="Password"><Secret value={c.password} onChange={(x) => set({ password: x })} /></Field>
          {!fileBased && <Field label="Extra options" hint="Optional, e.g. tds_version=7.0"><TextInput value={c.options || ""} onValueChange={(x) => set({ options: x })} className="font-mono text-[12.5px]" /></Field>}
          {c.engine === "access" && <Field label="ODBC driver" hint="Optional"><TextInput value={c.odbc_driver || ""} onValueChange={(x) => set({ odbc_driver: x })} placeholder="Microsoft Access Driver (*.mdb, *.accdb)" /></Field>}
        </FormGrid>
        {eng && !eng.installed && runsOn === "server" && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            The driver for {eng.label} ({eng.package}) isn&apos;t installed on our server yet. Use the office connector, or ask us to add it.
          </p>
        )}
      </FormSection>
      <FormSection title="What to read">
        <RadioCards columns={2} value={c.mode || "table"} onChange={(x) => set({ mode: x })} options={[
          { value: "table", label: "A table or view", description: "Pick the columns in the next step." },
          { value: "query", label: "My own query", description: "One SELECT with :since for new rows." },
        ]} />
        <div className="mt-4">
          {c.mode === "query" ? (
            <Field label="Query" hint=":since is the last punch time read (or the last id). Only SELECT is allowed.">
              <Textarea rows={6} className="font-mono text-[12px]" value={c.query || ""} onValueChange={(x) => set({ query: x })}
                placeholder={"SELECT UserId, LogDate, Direction\nFROM DeviceLogs\nWHERE LogDate >= :since\nORDER BY LogDate"} />
            </Field>
          ) : (
            <Field label="Table or view" required hint="{M} and {YYYY} read monthly tables, e.g. DeviceLogs_{M}_{YYYY}">
              <TextInput value={c.table || ""} onValueChange={(x) => set({ table: x })} placeholder="dbo.AttendanceLogs" className="font-mono text-[12.5px]" />
            </Field>
          )}
        </div>
        <FormGrid className="mt-4">
          <Field label="Find new rows by">
            <Select value={c.incremental || "time"} onChange={(x) => set({ incremental: x || "time" })} options={[
              { value: "time", label: "Punch time", description: "Rows at or after the last punch read" },
              { value: "id", label: "Increasing id", description: "Rows with a higher id than the last one" }]} />
          </Field>
          <Field label="First time, read the last"><NumberInput value={c.lookback_days ?? 7} onChange={(x) => set({ lookback_days: x ?? 7 })} min={0} max={365} suffix="days" /></Field>
          <Field label="Check every"><NumberInput value={c.every_minutes ?? 15} onChange={(x) => set({ every_minutes: x ?? 15 })} min={5} max={1440} suffix="min" /></Field>
          <Field label="Rows per read"><NumberInput value={c.batch ?? 5000} onChange={(x) => set({ batch: x ?? 5000 })} min={100} max={5000} /></Field>
        </FormGrid>
      </FormSection>
    </div>
  );
}

function ZkSettings({ c, set, runsOn, setRunsOn, installed }: { c: Cfg; set: (x: Cfg) => void; runsOn: string; setRunsOn: (x: string) => void; installed: boolean }) {
  return (
    <div className="space-y-6">
      <RunsOn value={runsOn} onChange={setRunsOn} conn="zk" />
      <FormGrid>
        <Field label="Machine IP address" required><TextInput value={c.ip || ""} onValueChange={(x) => set({ ip: x })} placeholder="192.168.1.201" /></Field>
        <Field label="Port"><NumberInput value={c.port ?? 4370} onChange={(x) => set({ port: x ?? 4370 })} min={1} max={65535} /></Field>
        <Field label="Communication key" hint="Menu, Comm., Connection. Empty if not set"><Secret value={c.password} onChange={(x) => set({ password: x })} placeholder="0" /></Field>
        <Field label="Protocol"><Select value={c.protocol || "tcp"} onChange={(x) => set({ protocol: x || "tcp" })} options={[{ value: "tcp", label: "TCP (most machines)" }, { value: "udp", label: "UDP (older machines)" }]} /></Field>
        <Field label="Check every"><NumberInput value={c.every_minutes ?? 15} onChange={(x) => set({ every_minutes: x ?? 15 })} min={5} max={1440} suffix="min" /></Field>
        <Field label="First time, read the last"><NumberInput value={c.lookback_days ?? 30} onChange={(x) => set({ lookback_days: x ?? 30 })} min={0} max={3650} suffix="days" /></Field>
        <div className="sm:col-span-2"><Toggle checked={!!c.use_status} onChange={(x) => set({ use_status: x })} label="Trust the in / out key pressed on the machine"
          description="Off: the first punch of the day is in, the next out, and so on." /></div>
      </FormGrid>
      {runsOn === "server" && !installed && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">Reading machines directly needs the pyzk package on our server. Use the office connector, or ask us to add it.</p>}
    </div>
  );
}

function EmailSettings({ c, set }: { c: Cfg; set: (x: Cfg) => void }) {
  return (
    <FormGrid>
      <Field label="Mail server (IMAP)" required><TextInput value={c.host || ""} onValueChange={(x) => set({ host: x })} placeholder="imap.gmail.com" /></Field>
      <Field label="Port"><NumberInput value={c.port ?? 993} onChange={(x) => set({ port: x ?? 993 })} min={1} max={65535} /></Field>
      <Field label="Mailbox user name" required><TextInput value={c.username || ""} onValueChange={(x) => set({ username: x })} autoComplete="off" placeholder="attendance@yourcompany.in" /></Field>
      <Field label="Password" hint="For Gmail or Outlook, an app password"><Secret value={c.password} onChange={(x) => set({ password: x })} /></Field>
      <Field label="Folder"><TextInput value={c.folder || "INBOX"} onValueChange={(x) => set({ folder: x })} /></Field>
      <Field label="Attachment name" hint="e.g. *.csv or Attendance*.xlsx"><TextInput value={c.file_pattern || ""} onValueChange={(x) => set({ file_pattern: x })} /></Field>
      <Field label="Only from" hint="Optional sender address"><TextInput value={c.from_filter || ""} onValueChange={(x) => set({ from_filter: x })} /></Field>
      <Field label="Subject contains" hint="Optional"><TextInput value={c.subject_filter || ""} onValueChange={(x) => set({ subject_filter: x })} /></Field>
      <Field label="Look back"><NumberInput value={c.lookback_days ?? 7} onChange={(x) => set({ lookback_days: x ?? 7 })} min={1} max={60} suffix="days" /></Field>
      <Field label="Check every"><NumberInput value={c.every_minutes ?? 60} onChange={(x) => set({ every_minutes: x ?? 60 })} min={5} max={1440} suffix="min" /></Field>
      <div className="sm:col-span-2"><Toggle checked={c.ssl !== false} onChange={(x) => set({ ssl: x })} label="Secure connection (SSL)" /></div>
    </FormGrid>
  );
}

// ── Test results and field matching ─────────────────────────────────

function Notes({ r }: { r: TestResult }) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-[13px] ${r.ok ? "border-emerald-200 bg-emerald-50/60 text-emerald-900" : "border-rose-200 bg-rose-50/60 text-rose-900"}`}>
      <p className="mb-1">{r.ok ? "It worked" : "Didn't work"}</p>
      <ul className="space-y-0.5 text-[12.5px] opacity-90">{r.notes.map((n, i) => <li key={i} className="break-words">{n}</li>)}</ul>
    </div>
  );
}

export function SampleTable({ columns, rows, highlight = [] }: { columns: string[]; rows: Cfg[]; highlight?: (string | null | undefined)[] }) {
  if (!columns.length) return null;
  return (
    <div className="max-h-64 overflow-auto rounded-xl border border-line">
      <table className="w-full text-[12.5px]">
        <thead className="sticky top-0 bg-sunken text-left text-muted">
          <tr>{columns.map((h) => <th key={h} className={`whitespace-nowrap px-3 py-2 font-normal ${highlight.includes(h) ? "text-primary" : ""}`}>{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>{columns.map((h) => <td key={h} className={`whitespace-nowrap px-3 py-1.5 ${highlight.includes(h) ? "text-ink" : "text-muted"}`}>{r[h] === null || r[h] === undefined ? "" : String(r[h])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PunchPreview({ r }: { r: TestResult }) {
  const p = r.sample?.punches ?? [];
  if (!p.length) return null;
  return (
    <div>
      <p className="mb-2 text-[13px] text-muted">Read as punches (first {p.length})</p>
      <ul className="divide-y divide-line rounded-xl border border-line text-[13px]">
        {p.map((x, i) => (
          <li key={i} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <span className="tabular text-ink">{x.device_user_id || <span className="text-faint">no user id</span>}</span>
            <span className="flex items-center gap-3">
              {x.terminal && <span className="text-faint">{x.terminal}</span>}
              {x.time ? <span className="tabular text-muted">{x.time}</span> : <span className="text-rose-700">Can&apos;t read “{x.raw_time}”</span>}
              {x.direction ? <Badge tone={x.direction === "in" ? "good" : "info"}>{x.direction === "in" ? "In" : "Out"}</Badge> : <span className="w-8 text-faint">—</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FieldMapping({ m, set, columns, conn }: { m: Cfg; set: (x: Cfg) => void; columns: string[]; conn: string }) {
  const opts = columns.map((c) => ({ value: c, label: c }));
  const pick = (key: string, label: string, hint?: string, required?: boolean) => (
    <Field label={label} hint={hint} required={required}>
      <Select value={m[key] || null} clearable placeholder={columns.length ? "Choose a field" : "Type the field name"} options={opts}
        onChange={(x) => set({ [key]: x ? String(x) : null })} onCreate={async (t) => ({ value: t, label: t })} />
    </Field>
  );
  const split = !m.timestamp && (!!m.date || !!m.time);
  return (
    <div className="space-y-5">
      {conn !== "database" && (
        <FormGrid>
          <Field label="The answer is">
            <Select value={m.format || "json"} onChange={(x) => set({ format: x || "json" })} options={[{ value: "json", label: "JSON" }, { value: "xml", label: "XML" }, { value: "text", label: "Text lines" }]} />
          </Field>
          <Field label="Records are in" hint={m.format === "xml" ? "Element name, e.g. Log" : "Dot path, e.g. data.logs. Empty: found for you"}>
            <TextInput value={m.records_path || ""} onValueChange={(x) => set({ records_path: x })} className="font-mono text-[12.5px]" />
          </Field>
          {m.format !== "json" || m.text_field ? <>
            <Field label="Lines of text are in" hint="Optional: a field holding delimited lines"><TextInput value={m.text_field || ""} onValueChange={(x) => set({ text_field: x })} /></Field>
            <Field label="Separator"><Select value={m.text_delimiter || ","} onChange={(x) => set({ text_delimiter: x })} options={[{ value: ",", label: "Comma" }, { value: "\\t", label: "Tab" }, { value: ";", label: "Semicolon" }, { value: "|", label: "Pipe" }, { value: "space", label: "Spaces" }]} /></Field>
          </> : null}
        </FormGrid>
      )}
      <FormGrid>
        {pick("employee", "Employee code or device user id", undefined, true)}
        <Field label="Match people by">
          <Select value={m.match_by || "device_user_id"} onChange={(x) => set({ match_by: x || "device_user_id" })}
            options={[{ value: "device_user_id", label: "Device user id (enrolment)" }, { value: "employee_code", label: "Employee ID" }]} />
        </Field>
      </FormGrid>
      <RadioCards columns={2} value={split ? "split" : "one"} onChange={(x) => set(x === "split" ? { timestamp: null } : { date: null, time: null })}
        options={[{ value: "one", label: "One date-and-time field" }, { value: "split", label: "Separate date and time" }]} />
      <FormGrid>
        {split ? <>{pick("date", "Date field")}{pick("time", "Time field")}</> : pick("timestamp", "Punch time field", undefined, true)}
        <Field label="Time format" hint="Empty reads common formats; or %d/%m/%Y %H:%M:%S, iso, epoch, epoch_ms">
          <TextInput value={m.timestamp_format || ""} onValueChange={(x) => set({ timestamp_format: x || null })} placeholder="Read automatically" className="font-mono text-[12.5px]" />
        </Field>
        <Field label="Times are in timezone" hint="Empty: the device's"><TextInput value={m.timezone || ""} onValueChange={(x) => set({ timezone: x || null })} placeholder="Asia/Kolkata" /></Field>
        {pick("direction", "In / out field", "Optional")}
        {m.direction && <>
          <Field label="Values meaning in" hint="Comma separated"><TextInput value={m.in_values || ""} onValueChange={(x) => set({ in_values: x })} placeholder="0, in, I" /></Field>
          <Field label="Values meaning out"><TextInput value={m.out_values || ""} onValueChange={(x) => set({ out_values: x })} placeholder="1, out, O" /></Field>
        </>}
        {pick("device", "Reader or door field", "Optional: matched to a device's serial number or name")}
        {conn === "database" && pick("id", "Increasing id field", "Needed when new rows are found by id")}
      </FormGrid>
    </div>
  );
}

// ── The wizard ──────────────────────────────────────────────────────

export function DeviceWizard({ open, device, meta, presets, onClose, onSaved }: {
  open: boolean; device: Device | null; meta: DeviceMeta | null; presets: Presets | null; onClose: () => void; onSaved: (d: Device, key: string | null) => void;
}) {
  const toast = useToast();
  const [v, setV] = useState(() => ({
    name: device?.name ?? "", vendor: device?.vendor ?? "", model: device?.model ?? "", serial_number: device?.serial_number ?? "",
    kind: device?.kind ?? "biometric", location_name: device?.location_name ?? "", timezone: device?.timezone ?? "", active: device?.active ?? true,
  }));
  const [conn, setConn] = useState(device?.connection ?? "adms");
  const [runsOn, setRunsOn] = useState(device?.runs_on ?? "connector");
  const [src, setSrc] = useState<Cfg>(() => {
    const saved = device?.source_config ?? null;
    const { mapping: _m, ...rest } = saved ?? {};
    void _m;
    return saved ? rest : { ...(DEFAULTS[device?.connection ?? "adms"] ?? {}) };
  });
  const [fmap, setFmap] = useState<Cfg>(() => device?.source_config?.mapping ?? { format: "json", match_by: "device_user_id" });
  const [ftp, setFtp] = useState<FtpConfig>({ ...EMPTY_FTP, ...(device?.ftp_config ?? {}) });
  const [fileMap, setFileMap] = useState<Mapping>({ ...EMPTY_MAP, ...(device?.column_mapping ?? {}) });
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [sampleBody, setSampleBody] = useState("");

  const touch = () => setDirty(true);
  const set = (x: Partial<typeof v>) => { setV((o) => ({ ...o, ...x })); touch(); };
  const setS = (x: Cfg) => { setSrc((o) => ({ ...o, ...x })); touch(); setResult(null); };
  const setM = (x: Cfg) => { setFmap((o) => ({ ...o, ...x })); touch(); };

  function chooseConnection(c: string) {
    setConn(c);
    touch();
    setResult(null);
    if (c === device?.connection && device?.source_config) {
      const { mapping, ...rest } = device.source_config;
      setSrc(rest);
      setFmap(mapping ?? { format: "json", match_by: "device_user_id" });
    } else {
      setSrc({ ...(DEFAULTS[c] ?? {}) });
      setFmap({ format: "json", match_by: "device_user_id" });
    }
  }

  function applyPreset(kind: "api" | "database" | "webhook", key: string) {
    const p = presets?.[kind]?.[key];
    if (!p) return;
    setSrc((o) => ({ ...DEFAULTS[kind], ...(kind === "database" ? { host: o.host, username: o.username, password: o.password } : {}),
      ...(kind === "api" ? { username: o.username, password: o.password } : {}), ...(p.config ?? {}), preset: key }));
    setFmap({ match_by: "device_user_id", ...(p.mapping ?? {}) });
    if (p.config?.runs_on) setRunsOn(p.config.runs_on);
    if (p.vendor && !v.vendor) set({ vendor: p.vendor });
    setResult(null);
    touch();
  }

  const steps = useMemo(() => {
    const s = ["Device", "Connection"];
    if (["adms", "api", "database", "zk", "email", "ftp"].includes(conn)) s.push("Settings");
    if (MAPPED.includes(conn)) s.push("Fields and test");
    if (FILE_MAPPED.includes(conn)) s.push("File columns");
    return s;
  }, [conn]);
  const label = steps[step];
  const last = step === steps.length - 1;

  async function runTest() {
    setTesting(true);
    try {
      const config: Cfg = { ...src, mapping: fmap, timezone_hint: v.timezone || undefined, serial_hint: v.serial_number || undefined };
      if (conn === "webhook" && sampleBody.trim()) config.sample_body = sampleBody;
      const r = await api.post<TestResult>("/attendance/devices/test", { connection: conn, config, device_uuid: device?.uuid });
      setResult(r);
      if (r.ok && r.sample && MAPPED.includes(conn) && !fmap.employee) {
        const g = r.sample.guess ?? {};
        setFmap((o) => ({ ...o, ...Object.fromEntries(Object.entries(g).filter(([, x]) => x)) }));
      }
      if (r.ok && conn === "email" && r.preview) setFileMap((o) => ({ ...o, ...r.preview!.guess }));
    } catch (e) { toast.error(errorText(e, "Test failed")); } finally { setTesting(false); }
  }

  function validStep(): string | null {
    if (label === "Settings") {
      if (conn === "adms" && !v.serial_number.trim()) return "Enter the serial number on the Device step: it is how we recognise the machine.";
      if (conn === "api" && !String(src.url || "").startsWith("http")) return "Enter the full address, starting with http:// or https://.";
      if (conn === "database" && src.mode === "query" && !String(src.query || "").trim()) return "Write the query.";
      if (conn === "database" && src.mode !== "query" && !String(src.table || "").trim()) return "Enter the table or view.";
      if (conn === "zk" && !String(src.ip || "").trim()) return "Enter the machine's IP address.";
      if (conn === "email" && !String(src.host || "").trim()) return "Enter the mail server.";
      if (conn === "ftp" && !ftp.host.trim()) return "Enter the FTP server address.";
    }
    if (label === "Fields and test") {
      if (!fmap.employee) return "Choose the field with the employee code or user id.";
      if (!fmap.timestamp && !(fmap.date && fmap.time)) return "Choose the punch time field.";
    }
    return null;
  }

  function next() {
    const problem = validStep();
    if (problem) { toast.error(problem); return; }
    setStep((s) => Math.min(s + 1, steps.length - 1));
  }

  async function save() {
    const problem = !v.name.trim() ? "Give the device a name (step 1)." : validStep();
    if (problem) { toast.error(problem); return; }
    setSaving(true);
    try {
      const body: Cfg = { ...v, timezone: v.timezone || null, connection: conn, runs_on: CONNECTOR_CAPABLE.includes(conn) ? runsOn : "server" };
      if (SOURCE_CONNS.includes(conn)) body.source_config = MAPPED.includes(conn) ? { ...src, mapping: fmap } : src;
      if (conn === "ftp") body.ftp_config = ftp;
      if (FILE_MAPPED.includes(conn)) body.column_mapping = fileMap;
      const r = device
        ? await api.put<Device & { api_key: string | null }>(`/attendance/devices/${device.uuid}`, body)
        : await api.post<Device & { api_key: string | null }>("/attendance/devices", body);
      toast.success(device ? "Device saved" : "Device added");
      onSaved(r, r.api_key);
    } catch (e) { toast.error(errorText(e, "Couldn't save the device")); } finally { setSaving(false); }
  }

  const testable = ["api", "database", "webhook", "zk", "email"].includes(conn) && !(runsOn === "connector" && CONNECTOR_CAPABLE.includes(conn));
  const cols = result?.sample?.columns ?? [];
  const connOptions = Object.entries(meta?.connections ?? {}).map(([k, l]) => ({ value: k, label: l, description: CONNECTION_INFO[k]?.desc, icon: CONNECTION_INFO[k]?.icon }));

  return (
    <Modal open={open} onClose={onClose} size="xl" busy={saving} dirty={dirty} title={device ? `Edit ${device.name}` : "Add device"}
      description="Any make works. Choose how its punches reach us; presets fill in the usual settings."
      footerStart={<span className="text-[12.5px] text-faint">Step {step + 1} of {steps.length}</span>}
      footer={<>
        {step === 0 ? <ModalCancel /> : <Button onClick={() => setStep((s) => s - 1)}>Back</Button>}
        {last ? <Button variant="primary" loading={saving} onClick={save}>{device ? "Save" : "Add device"}</Button>
          : <Button variant="primary" onClick={next}>Next</Button>}
      </>}>
      <div className="space-y-6">
        <Stepper steps={steps.map((s) => ({ label: s }))} current={step} onStepClick={(i) => i < step && setStep(i)} />

        {label === "Device" && (
          <FormGrid>
            <Field label="Name" required><TextInput value={v.name} onValueChange={(x) => set({ name: x })} placeholder="Reception biometric" data-autofocus /></Field>
            <Field label="Make"><Select value={v.vendor || null} onChange={(x) => set({ vendor: x ? String(x) : "" })} clearable options={(meta?.vendors ?? []).map((x) => ({ value: x, label: x }))} placeholder="Choose" /></Field>
            <Field label="Model"><TextInput value={v.model} onValueChange={(x) => set({ model: x })} /></Field>
            <Field label="Serial number" hint={conn === "adms" ? "Required for ADMS: Menu, System info" : undefined}><TextInput value={v.serial_number} onValueChange={(x) => set({ serial_number: x })} /></Field>
            <Field label="Kind"><Select value={v.kind} onChange={(x) => set({ kind: String(x ?? "biometric") })} options={Object.entries(meta?.kinds ?? { biometric: "Fingerprint" }).map(([k, l]) => ({ value: k, label: l }))} /></Field>
            <Field label="Location"><TextInput value={v.location_name} onValueChange={(x) => set({ location_name: x })} placeholder="Head office, ground floor" /></Field>
            <Field label="Device clock timezone" hint="Leave empty for the company's"><TextInput value={v.timezone} onValueChange={(x) => set({ timezone: x })} placeholder="Asia/Kolkata" /></Field>
            {device && <div className="flex items-end pb-2"><Toggle checked={v.active} onChange={(x) => set({ active: x })} label="Active" /></div>}
          </FormGrid>
        )}

        {label === "Connection" && (
          <RadioCards columns={3} value={conn} onChange={chooseConnection} options={connOptions} />
        )}

        {label === "Settings" && (
          <div className="space-y-6">
            {conn === "adms" && <AdmsSettings c={src} set={setS} serial={v.serial_number} />}
            {conn === "api" && <ApiSettings c={src} set={setS} presets={presets} applyPreset={(k) => applyPreset("api", k)} />}
            {conn === "database" && <DbSettings c={src} set={setS} presets={presets} applyPreset={(k) => applyPreset("database", k)} runsOn={runsOn} setRunsOn={(x) => { setRunsOn(x); touch(); }} />}
            {conn === "zk" && <ZkSettings c={src} set={setS} runsOn={runsOn} setRunsOn={(x) => { setRunsOn(x); touch(); }} installed={!!presets?.zk_installed} />}
            {conn === "email" && <EmailSettings c={src} set={setS} />}
            {conn === "ftp" && <FtpFields v={ftp} set={(x) => { setFtp((o) => ({ ...o, ...x })); touch(); }} />}
            {(conn === "zk" || conn === "email") && (
              <div className="space-y-3">
                {testable ? <Button icon={PlayCircle} loading={testing} onClick={runTest}>Test connection</Button>
                  : <p className="text-[13px] text-muted">The office connector tests this: run <span className="font-mono">connector.exe test</span> on the office PC.</p>}
                {result && <Notes r={result} />}
                {result && conn === "zk" && <PunchPreview r={result} />}
              </div>
            )}
          </div>
        )}

        {label === "Fields and test" && (
          <div className="space-y-6">
            {conn === "webhook" && <>
              <Field label="Preset" hint={presets?.webhook?.[src.preset || "custom"]?.hint}>
                <Select value={src.preset || "custom"} onChange={(x) => applyPreset("webhook", String(x ?? "custom"))} options={presetOptions(presets?.webhook)} />
              </Field>
              <Field label="A sample of what the device sends" hint={device ? "Empty: the last post we received" : "Paste one post here to match its fields; you can also save first and match later"}>
                <Textarea rows={5} className="font-mono text-[12px]" value={sampleBody} onValueChange={setSampleBody} placeholder='{"dateTime": "2026-11-07T09:10:00+05:30", "AccessControllerEvent": {"employeeNoString": "88"}}' />
              </Field>
            </>}
            <div className="flex flex-wrap items-center gap-3">
              {testable ? <Button icon={PlayCircle} loading={testing} onClick={runTest}>{conn === "webhook" ? "Read the sample" : "Test and show sample rows"}</Button>
                : <p className="text-[13px] text-muted">The office connector reads this database, so we can&apos;t test it from here. Type the column names, save, and run <span className="font-mono">connector.exe test</span> on the office PC.</p>}
              {result?.sample?.guess && Object.values(result.sample.guess).some(Boolean) && (
                <Button size="sm" variant="ghost" onClick={() => setM(Object.fromEntries(Object.entries(result.sample!.guess).filter(([, x]) => x)))}>Use suggested fields</Button>
              )}
            </div>
            {result && <Notes r={result} />}
            {result?.tables && result.tables.length > 0 && (
              <Field label="Tables and views found" hint="Choose one to read">
                <Select value={null} onChange={(x) => { if (x) setS({ table: String(x), mode: "table" }); }} options={result.tables.map((t) => ({ value: t, label: t }))} placeholder="Choose a table" />
              </Field>
            )}
            {result?.sample && cols.length > 0 && (
              <div>
                <p className="mb-2 text-[13px] text-muted">First rows ({result.sample.total} found)</p>
                <SampleTable columns={cols} rows={result.sample.rows} highlight={[fmap.employee, fmap.timestamp, fmap.date, fmap.time, fmap.direction, fmap.device]} />
              </div>
            )}
            <FormSection title="Match the fields" description="Which field holds the person, the time and, if there is one, in or out.">
              <FieldMapping m={fmap} set={setM} columns={cols} conn={conn} />
            </FormSection>
            {testable && result && <div className="flex justify-end"><Button size="sm" icon={PlayCircle} loading={testing} onClick={runTest}>Test again with these fields</Button></div>}
            {result && <PunchPreview r={result} />}
          </div>
        )}

        {label === "File columns" && (
          <FormSection title="File columns" description="The column names in the export file.">
            <MappingFields v={fileMap} set={(x) => { setFileMap((o) => ({ ...o, ...x })); touch(); }} headers={conn === "email" && result?.preview ? result.preview.headers : undefined} />
          </FormSection>
        )}
      </div>
    </Modal>
  );
}
