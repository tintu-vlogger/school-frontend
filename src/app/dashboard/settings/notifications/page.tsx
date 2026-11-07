"use client";

/*
 * Notification settings for the company: default channels per kind of message, daily
 * summaries, the wording of emails, and the delivery log with retries.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, FileText, Mail, MailCheck, RotateCcw, ScrollText, Send, SlidersHorizontal } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime } from "@/lib/datetime";
import { PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, FormGrid, Modal, ModalCancel, NumberInput, Skeleton, Tabs, TextInput,
  Textarea, Toggle, type BadgeTone, type Column, type FilterValues,
} from "@/components/ui-kit";
import { ChannelGrid } from "@/components/notifications/channel-grid";
import { useUrlTab } from "@/lib/use-url-tab";

type Cat = { key: string; label: string; description: string; email: boolean; push: boolean };
type Settings = {
  email_enabled: boolean; push_enabled: boolean; email_ready: boolean;
  digest: { manager: boolean; hr: boolean; hour: number }; categories_list: Cat[];
};
type Template = {
  key: string; label: string; description: string; subject: string; body: string; custom: boolean; placeholders: string[];
  default_subject: string; default_body: string;
};
type Delivery = {
  uuid: string; channel: string; to_address: string | null; category_label: string; source: string; subject: string | null;
  status: string; attempts: number; last_error: string | null; next_attempt_at: string | null; sent_at: string | null; created_at: string;
  body?: string;
};
type Page<T> = { items: T[]; total: number; page: number; size: number };
type TabKey = "defaults" | "emails" | "log";

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  sent: { label: "Sent", tone: "good" }, logged: { label: "Written to log", tone: "info" }, queued: { label: "Will retry", tone: "warn" },
  failed: { label: "Failed", tone: "bad" }, skipped: { label: "Skipped", tone: "neutral" },
};
const SOURCE: Record<string, string> = { notification: "Notification", digest: "Daily summary", automation: "Automation", test: "Test" };
const SIZE = 25;

export default function NotificationSettingsPage() {
  const [tab, setTab] = useState<TabKey>("defaults");
  useUrlTab<TabKey>(["defaults", "emails", "log"], setTab);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Notifications"
        description="How people are told about things: in the app, by email and on the phone." />
      <Tabs<TabKey> value={tab} onChange={setTab} items={[
        { value: "defaults", label: "Channels and summaries", icon: SlidersHorizontal },
        { value: "emails", label: "Email wording", icon: FileText },
        { value: "log", label: "Delivery log", icon: ScrollText },
      ]} />
      {tab === "defaults" && <Defaults />}
      {tab === "emails" && <Emails />}
      {tab === "log" && <Log />}
    </div>
  );
}

function Defaults() {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    api.get<Settings>("/notifications/settings").then((r) => { setS(r); setInitial(JSON.stringify(r)); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load the settings"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!s) return <Paper className="p-5"><Skeleton className="h-64" /></Paper>;
  const dirty = JSON.stringify(s) !== initial;

  async function save() {
    if (!s) return;
    setSaving(true);
    try {
      const r = await api.put<Settings>("/notifications/settings", {
        email_enabled: s.email_enabled, push_enabled: s.push_enabled, digest: s.digest,
        categories: Object.fromEntries(s.categories_list.map((c) => [c.key, { email: c.email, push: c.push }])),
      });
      setS(r); setInitial(JSON.stringify(r));
      toast.success("Saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }
  async function test() {
    setTesting(true);
    try {
      const d = await api.post<Delivery>("/notifications/test-email", { to: testTo });
      if (d.status === "sent") toast.success("Test email sent");
      else if (d.status === "logged") toast.info("Email isn't set up, so the message was written to the server log");
      else toast.error(d.last_error ?? "The email could not be sent");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send"); }
    finally { setTesting(false); }
  }
  async function runDigests() {
    setRunning(true);
    try {
      const r = await api.post<{ sent: number }>("/notifications/digests/run");
      toast.success(r.sent ? `${r.sent} summar${r.sent === 1 ? "y" : "ies"} sent` : "Everyone already had today's summary");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send"); }
    finally { setRunning(false); }
  }

  return (
    <div className="space-y-6">
      {!s.email_ready && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-[13.5px] text-ink dark:border-amber-900/50 dark:bg-amber-950/20">
          <AlertTriangle size={17} strokeWidth={1.4} className="mt-0.5 text-amber-600" />
          <p>Email isn&apos;t connected yet, so emails are only written to the server log.{" "}
            <Link href="/dashboard/settings/integrations" className="text-primary hover:underline">Set up email under Integrations</Link>.</p>
        </div>
      )}
      <Paper className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Toggle checked={s.email_enabled} onChange={(v) => setS({ ...s, email_enabled: v })} label="Send emails" description="Master switch for every notification email." />
          <Toggle checked={s.push_enabled} onChange={(v) => setS({ ...s, push_enabled: v })} label="Send to the phone app" description="For people who have the mobile app." />
        </div>
      </Paper>
      <div>
        <p className="mb-2 px-1 text-[13.5px] text-ink">Defaults for everyone</p>
        <p className="mb-3 px-1 text-[12.5px] text-muted">People can change these for themselves under My notifications.</p>
        <ChannelGrid rows={s.categories_list} emailOff={!s.email_enabled} pushOff={!s.push_enabled}
          onChange={(key, patch) => setS({ ...s, categories_list: s.categories_list.map((c) => (c.key === key ? { ...c, ...patch } : c)) })} />
      </div>
      <Paper className="space-y-4 p-5">
        <p className="text-[14.5px] text-ink">Daily summary emails</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Toggle checked={s.digest.manager} onChange={(v) => setS({ ...s, digest: { ...s.digest, manager: v } })}
            label="To approvers" description="A list of the requests waiting for them, when there are any." />
          <Toggle checked={s.digest.hr} onChange={(v) => setS({ ...s, digest: { ...s.digest, hr: v } })}
            label="To HR and the owner" description="Waiting requests, joiners, probation ends, exits and expiring documents." />
        </div>
        <FormGrid>
          <Field label="Send at (hour of the day, company time)">
            <NumberInput value={s.digest.hour} min={0} max={23} onChange={(v) => setS({ ...s, digest: { ...s.digest, hour: Math.min(23, Math.max(0, Math.round(v ?? 8))) } })} />
          </Field>
          <div className="flex items-end"><Button variant="ghost" icon={MailCheck} loading={running} onClick={runDigests}>Send today&apos;s summaries now</Button></div>
        </FormGrid>
      </Paper>
      <Paper className="p-5">
        <p className="mb-3 text-[14.5px] text-ink">Send a test email</p>
        <FormGrid>
          <Field label="To"><TextInput value={testTo} onValueChange={setTestTo} placeholder="you@yourcompany.in" type="email" /></Field>
          <div className="flex items-end"><Button icon={Send} loading={testing} disabled={!testTo.includes("@")} onClick={test}>Send test</Button></div>
        </FormGrid>
      </Paper>
      <div className="flex justify-end"><Button variant="primary" loading={saving} disabled={!dirty} onClick={save}>Save changes</Button></div>
    </div>
  );
}

function Emails() {
  const toast = useToast();
  const [rows, setRows] = useState<Template[] | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const load = useCallback(() => {
    api.get<Template[]>("/notifications/templates").then(setRows).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <DataTable rows={rows ?? []} loading={rows === null} rowKey={(t) => t.key} onRowClick={setEditing}
        columns={[
          { key: "label", header: "Email", cell: (t) => <div><p className="text-ink">{t.label}</p><p className="text-[12.5px] text-faint">{t.description}</p></div> },
          { key: "subject", header: "Subject", hideBelow: "md", cell: (t) => <span className="text-muted">{t.subject}</span> },
          { key: "custom", header: "", align: "right", cell: (t) => t.custom ? <Badge tone="accent">Changed</Badge> : <Badge>Standard</Badge> },
        ]}
        rowActions={(t) => [{ label: "Edit", icon: FileText, onSelect: () => setEditing(t) }]}
        emptyIcon={Mail} emptyTitle="No emails" />
      {editing && <TemplateModal t={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function TemplateModal({ t, onClose, onSaved }: { t: Template; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [subject, setSubject] = useState(t.subject);
  const [body, setBody] = useState(t.body);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => {
      api.post<{ subject: string; body: string }>(`/notifications/templates/${t.key}/preview`, { subject, body }).then(setPreview).catch(() => {});
    }, 250);
    return () => clearTimeout(id);
  }, [subject, body, t.key]);
  async function save() {
    setSaving(true);
    try { await api.put(`/notifications/templates/${t.key}`, { subject, body }); toast.success("Email saved"); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }
  async function reset() {
    setSaving(true);
    try { await api.delete(`/notifications/templates/${t.key}`); toast.success("Back to the standard wording"); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't reset"); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="xl" busy={saving} dirty={subject !== t.subject || body !== t.body}
      title={t.label} description={t.description}
      footerStart={t.custom ? <Button variant="ghost" icon={RotateCcw} onClick={reset}>Use the standard wording</Button> : undefined}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={save} disabled={!subject.trim() || !body.trim()}>Save</Button></>}>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Field label="Subject"><TextInput value={subject} onValueChange={setSubject} /></Field>
          <Field label="Message"><Textarea value={body} onValueChange={setBody} rows={12} autoGrow className="font-mono text-[13px]" /></Field>
          <div>
            <p className="mb-1.5 text-[12.5px] text-muted">Fill-in fields (click to add)</p>
            <div className="flex flex-wrap gap-1.5">
              {t.placeholders.map((p) => (
                <button key={p} onClick={() => setBody((b) => `${b}{{${p}}}`)}
                  className="rounded-md border border-line px-2 py-0.5 font-mono text-[12px] text-primary hover:bg-primary-soft">{`{{${p}}}`}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="h-fit rounded-2xl border border-line bg-canvas/60 p-4">
          <p className="mb-2 text-[12px] uppercase tracking-[0.06em] text-faint">Preview with sample details</p>
          <p className="text-[14.5px] text-ink">{preview?.subject ?? subject}</p>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-[13.5px] text-muted">{preview?.body ?? body}</pre>
        </div>
      </div>
    </Modal>
  );
}

function Log() {
  const toast = useToast();
  const [filters, setFilters] = useState<FilterValues>({});
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Page<Delivery> | null>(null);
  const [open, setOpen] = useState<Delivery | null>(null);

  const load = useCallback(() => {
    const p = new URLSearchParams({ page: String(page), size: String(SIZE) });
    for (const k of ["status", "channel", "source"]) if (filters[k]?.[0]) p.set(k, filters[k][0]);
    if (q.trim()) p.set("q", q.trim());
    setRows(null);
    api.get<Page<Delivery>>(`/notifications/deliveries?${p}`).then(setRows)
      .catch((e) => { toast.error(e instanceof Error ? e.message : "Couldn't load"); setRows({ items: [], total: 0, page: 1, size: SIZE }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, filters, q]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [filters, q]);

  async function retry(d: Delivery) {
    try {
      const r = await api.post<Delivery>(`/notifications/deliveries/${d.uuid}/retry`);
      if (r.status === "sent" || r.status === "logged") toast.success("Delivered");
      else toast.error(r.last_error ?? "Still not delivered");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't retry"); }
  }
  async function view(d: Delivery) {
    try { setOpen(await api.get<Delivery>(`/notifications/deliveries/${d.uuid}`)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't open"); }
  }

  const cols: Column<Delivery>[] = [
    { key: "to", header: "To", cell: (d) => <div className="min-w-0"><p className="truncate text-ink">{d.subject}</p>
      <p className="truncate text-[12.5px] text-faint">{d.channel === "push" ? "Phone app" : d.to_address} · {d.category_label}</p></div> },
    { key: "source", header: "From", hideBelow: "md", cell: (d) => <span className="text-muted">{SOURCE[d.source] ?? d.source}</span> },
    { key: "status", header: "Status", cell: (d) => <div><Badge tone={STATUS[d.status]?.tone ?? "neutral"} dot>{STATUS[d.status]?.label ?? d.status}</Badge>
      {d.attempts > 1 && <p className="text-[12px] text-faint">{d.attempts} tries</p>}</div> },
    { key: "when", header: "When", hideBelow: "sm", cell: (d) => <span className="text-muted">{formatDateTime(d.sent_at ?? d.created_at)}</span> },
  ];
  return (
    <>
      <FilterBar search={q} onSearchChange={setQ} searchPlaceholder="Search by address or subject" values={filters} onChange={setFilters}
        filters={[
          { key: "status", label: "Status", options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })) },
          { key: "channel", label: "Channel", options: [{ value: "email", label: "Email" }, { value: "push", label: "Phone app" }] },
          { key: "source", label: "From", options: Object.entries(SOURCE).map(([value, label]) => ({ value, label })) },
        ]} />
      <DataTable rows={rows?.items ?? []} loading={rows === null} columns={cols} rowKey={(d) => d.uuid} onRowClick={view}
        rowActions={(d) => [
          { label: "View", icon: Mail, onSelect: () => view(d) },
          ...(d.status === "failed" || d.status === "queued" ? [{ label: "Retry now", icon: RotateCcw, onSelect: () => retry(d) }] : []),
        ]}
        pagination={rows ? { page, size: SIZE, total: rows.total, onPageChange: setPage } : undefined}
        emptyIcon={ScrollText} emptyTitle="Nothing sent yet" emptyHint="Emails and phone messages appear here with their outcome." />
      {open && (
        <Modal open onClose={() => setOpen(null)} size="lg" title={open.subject ?? "Message"}
          description={`${open.channel === "push" ? "Phone app" : open.to_address} · ${formatDateTime(open.created_at)}`}
          headerActions={<Badge tone={STATUS[open.status]?.tone ?? "neutral"} dot>{STATUS[open.status]?.label ?? open.status}</Badge>}
          footer={<>{(open.status === "failed" || open.status === "queued") && <Button icon={RotateCcw} onClick={() => { retry(open); setOpen(null); }}>Retry now</Button>}<ModalCancel>Close</ModalCancel></>}>
          <div className="space-y-4">
            {open.last_error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-[13.5px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">{open.last_error}</p>}
            {open.next_attempt_at && open.status === "queued" && <p className="text-[13px] text-muted">Next try {formatDateTime(open.next_attempt_at)}</p>}
            <pre className="whitespace-pre-wrap rounded-xl border border-line bg-canvas/60 p-4 font-sans text-[13.5px] text-ink">{open.body}</pre>
          </div>
        </Modal>
      )}
    </>
  );
}
