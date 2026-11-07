"use client";

/*
 * Webhooks: addresses that receive signed JSON when a rule calls them, with a test call,
 * the signing secret and the delivery log with retries.  <WebhooksTab onChanged />
 */
import { useCallback, useEffect, useState } from "react";
import { Copy, Globe, KeyRound, Pencil, Plus, RotateCw, Send, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, formatRelative } from "@/lib/datetime";
import { Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, IconButton, KeyValue, Modal, ModalCancel, TextInput, Toggle, useConfirm,
  type Column, type FilterValues,
} from "@/components/ui-kit";
import { DELIVERY_LABEL, DELIVERY_TONE, type Delivery, type Page, type Webhook } from "./types";

const SIZE = 20;

export function WebhooksTab({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [hooks, setHooks] = useState<Webhook[] | null>(null);
  const [editing, setEditing] = useState<Webhook | "new" | null>(null);
  const [secret, setSecret] = useState<Webhook | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => { setNonce((n) => n + 1); onChanged(); }, [onChanged]);

  useEffect(() => { api.get<Webhook[]>("/automation/webhooks").then(setHooks).catch(() => setHooks([])); }, [nonce]);

  async function test(h: Webhook) {
    try {
      const d = await api.post<Delivery>(`/automation/webhooks/${h.uuid}/test`);
      if (d.status === "sent") toast.success(`${h.name} answered ${d.response_status}`);
      else toast.warning("The test call did not go through", { description: d.error ?? undefined });
      setNonce((n) => n + 1);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't call the webhook"); }
  }
  async function rotate(h: Webhook) {
    if (!(await confirm({ title: "Make a new secret?", message: "The receiver must use the new secret to check signatures from now on.", confirmLabel: "Make new secret" }))) return;
    try { setSecret(await api.post<Webhook>(`/automation/webhooks/${h.uuid}/secret`)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't change the secret"); }
  }
  async function remove(h: Webhook) {
    if (!(await confirm({ title: `Remove ${h.name}?`, message: "Rules that call it will log a failed action.", confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.post(`/automation/webhooks/${h.uuid}/archive`); toast.success("Webhook removed"); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove"); }
  }

  const columns: Column<Webhook>[] = [
    { key: "name", header: "Webhook", cell: (h) => <div className="min-w-0"><p className="text-ink">{h.name}</p><p className="truncate text-[12px] text-faint">{h.url}</p></div> },
    { key: "status", header: "Status", width: "110px", cell: (h) => <Badge tone={h.active ? "good" : "neutral"} dot>{h.active ? "On" : "Off"}</Badge> },
    {
      key: "calls", header: "Calls", hideBelow: "md", cell: (h) => (
        <span className="text-[13px] text-muted">{h.deliveries?.sent ?? 0} delivered
          {h.deliveries?.queued ? <span className="text-amber-700"> · {h.deliveries.queued} retrying</span> : null}
          {h.deliveries?.failed ? <span className="text-rose-600"> · {h.deliveries.failed} failed</span> : null}</span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[13.5px] text-muted">Each call is a POST with JSON, signed with the webhook&apos;s secret (header X-Hrms-Signature: sha256=…).</p>
          <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>New webhook</Button>
        </div>
        <DataTable rows={hooks ?? []} rowKey={(h) => h.uuid} columns={columns} loading={!hooks} onRowClick={(h) => setEditing(h)}
          rowActions={(h) => [
            { label: "Edit", icon: Pencil, onSelect: () => setEditing(h) },
            { label: "Send a test call", icon: Send, onSelect: () => test(h) },
            { label: "Make a new secret", icon: KeyRound, onSelect: () => rotate(h) },
            "separator" as const,
            { label: "Remove", icon: Trash2, danger: true, onSelect: () => remove(h) },
          ]}
          emptyIcon={Globe} emptyTitle="No webhooks yet"
          emptyHint="Tell another system (payroll, IT, a chat tool) when something happens here."
          emptyAction={<Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>New webhook</Button>} />
      </div>
      <Deliveries hooks={hooks ?? []} nonce={nonce} />
      <WebhookForm target={editing} onClose={() => setEditing(null)}
        onSaved={(h, created) => { setEditing(null); refresh(); if (created) setSecret(h); }} />
      <SecretModal hook={secret} onClose={() => setSecret(null)} />
    </div>
  );
}

function WebhookForm({ target, onClose, onSaved }: { target: Webhook | "new" | null; onClose: () => void; onSaved: (h: Webhook, created: boolean) => void }) {
  const toast = useToast();
  const isNew = target === "new";
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [active, setActive] = useState(true);
  const [headers, setHeaders] = useState<{ k: string; v: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!target) return;
    const h = target === "new" ? null : target;
    setName(h?.name ?? ""); setUrl(h?.url ?? ""); setActive(h?.active ?? true);
    setHeaders(Object.entries(h?.headers ?? {}).map(([k, v]) => ({ k, v })));
    setError(null);
  }, [target]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const body = { name, url, active, headers: Object.fromEntries(headers.filter((h) => h.k.trim()).map((h) => [h.k.trim(), h.v])) };
    try {
      const out = isNew ? await api.post<Webhook>("/automation/webhooks", body) : await api.put<Webhook>(`/automation/webhooks/${(target as Webhook).uuid}`, body);
      toast.success(isNew ? "Webhook added" : "Webhook saved");
      onSaved(out, isNew);
    } catch (err) { setError(err instanceof Error ? err.message : "Couldn't save"); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={!!target} onClose={onClose} size="md" busy={saving} title={isNew ? "New webhook" : "Edit webhook"}
      footerStart={error && <span className="text-[13px] text-rose-600">{error}</span>}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="webhook-form" loading={saving}>Save</Button></>}>
      <form id="webhook-form" onSubmit={save} className="space-y-5">
        <Field label="Name" required><TextInput value={name} onValueChange={setName} maxLength={100} placeholder="IT ticketing" /></Field>
        <Field label="Address" required hint="Must start with https:// (http only for local testing)."><TextInput value={url} onValueChange={setUrl} placeholder="https://example.com/hooks/hrms" /></Field>
        <Field label="Extra headers" hint="For an API key the receiver expects. Up to 10.">
          <div className="space-y-2">
            {headers.map((h, i) => (
              <div key={i} className="flex gap-2">
                <TextInput value={h.k} placeholder="X-Api-Key" onValueChange={(v) => setHeaders(headers.map((x, j) => (j === i ? { ...x, k: v } : x)))} />
                <TextInput value={h.v} placeholder="Value" onValueChange={(v) => setHeaders(headers.map((x, j) => (j === i ? { ...x, v } : x)))} />
                <IconButton icon={Trash2} label="Remove header" onClick={() => setHeaders(headers.filter((_, j) => j !== i))} />
              </div>
            ))}
            {headers.length < 10 && <Button size="sm" variant="ghost" icon={Plus} onClick={() => setHeaders([...headers, { k: "", v: "" }])}>Add header</Button>}
          </div>
        </Field>
        <Toggle checked={active} onChange={setActive} label="On" description="When off, calls are not made." />
      </form>
    </Modal>
  );
}

function SecretModal({ hook, onClose }: { hook: Webhook | null; onClose: () => void }) {
  const toast = useToast();
  return (
    <Modal open={!!hook} onClose={onClose} size="sm" title="Signing secret" description="Copy it now. It is not shown again."
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
      {hook?.secret && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-sunken/50 px-3 py-2">
            <code className="flex-1 break-all text-[12.5px] text-ink">{hook.secret}</code>
            <IconButton icon={Copy} label="Copy" onClick={() => { navigator.clipboard?.writeText(hook.secret ?? ""); toast.success("Copied"); }} />
          </div>
          <p className="text-[12.5px] text-muted">The receiver checks that X-Hrms-Signature equals sha256= followed by the HMAC-SHA256 of the raw body with this secret.</p>
        </div>
      )}
    </Modal>
  );
}

function Deliveries({ hooks, nonce }: { hooks: Webhook[]; nonce: number }) {
  const toast = useToast();
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Delivery> | null>(null);
  const [open, setOpen] = useState<Delivery | null>(null);
  const [mine, setMine] = useState(0);

  useEffect(() => {
    const p = new URLSearchParams({ page: String(page), size: String(SIZE) });
    if (filters.webhook?.[0]) p.set("webhook", filters.webhook[0]);
    if (filters.status?.length) p.set("status", filters.status.join(","));
    api.get<Page<Delivery>>(`/automation/webhook-deliveries?${p}`).then(setData).catch(() => setData({ items: [], total: 0, page: 1, size: SIZE }));
  }, [filters, page, nonce, mine]);

  async function retry(d: Delivery) {
    try {
      const out = await api.post<Delivery>(`/automation/webhook-deliveries/${d.uuid}/retry`);
      if (out.status === "sent") toast.success("Delivered"); else toast.warning("Still not delivered", { description: out.error ?? undefined });
      setOpen(null); setMine((n) => n + 1);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't retry"); }
  }

  const columns: Column<Delivery>[] = [
    { key: "when", header: "When", width: "160px", cell: (d) => <span className="text-muted" title={formatDateTime(d.created_at)}>{formatRelative(d.created_at)}</span> },
    { key: "hook", header: "Webhook", cell: (d) => <span className="text-ink">{d.webhook_name}</span> },
    { key: "event", header: "Event", hideBelow: "md", cell: (d) => <span className="font-mono text-[12px] text-muted">{d.event}</span> },
    { key: "answer", header: "Answer", hideBelow: "sm", cell: (d) => <span className="text-muted">{d.response_status ?? "—"}</span> },
    { key: "status", header: "Result", cell: (d) => <Badge tone={DELIVERY_TONE[d.status]} dot>{DELIVERY_LABEL[d.status]}{d.attempts > 1 ? ` · ${d.attempts} tries` : ""}</Badge> },
  ];
  return (
    <Paper>
      <PaperHeader title="Delivery log" />
      <div className="p-4">
        <FilterBar values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
          filters={[
            { key: "webhook", label: "Webhook", options: hooks.map((h) => ({ value: h.uuid, label: h.name })) },
            { key: "status", label: "Result", multiple: true, options: Object.entries(DELIVERY_LABEL).map(([value, label]) => ({ value, label })) },
          ]} />
        <DataTable rows={data?.items ?? []} rowKey={(d) => d.uuid} columns={columns} loading={!data} onRowClick={setOpen}
          rowActions={(d) => d.status === "sent" ? [] : [{ label: "Retry now", icon: RotateCw, onSelect: () => retry(d) }]}
          pagination={{ page, size: SIZE, total: data?.total ?? 0, onPageChange: setPage }}
          emptyIcon={Send} emptyTitle="No calls yet" emptyHint="Calls made by rules and test calls show here." />
      </div>
      <Modal open={!!open} onClose={() => setOpen(null)} size="lg" title={open?.webhook_name ?? "Call"} description={open ? formatDateTime(open.created_at) : undefined}
        footer={open && open.status !== "sent" ? <Button icon={RotateCw} onClick={() => retry(open)}>Retry now</Button> : undefined}>
        {open && (
          <div className="space-y-5">
            <KeyValue items={[
              { label: "Result", value: <Badge tone={DELIVERY_TONE[open.status]} dot>{DELIVERY_LABEL[open.status]}</Badge> },
              { label: "Tries", value: open.attempts },
              { label: "Answer", value: open.response_status ?? "—" },
              { label: open.status === "queued" ? "Next try" : "Delivered", value: open.status === "queued" ? (open.next_attempt_at ? formatDateTime(open.next_attempt_at) : "—") : (open.sent_at ? formatDateTime(open.sent_at) : "—") },
              ...(open.error ? [{ label: "Problem", value: <span className="text-rose-600">{open.error}</span>, span: 2 as const }] : []),
            ]} />
            <div>
              <p className="mb-1.5 text-[13px] text-muted">What was sent</p>
              <pre className="max-h-72 overflow-auto rounded-lg border border-line bg-sunken/50 p-3 text-[12px] text-ink/85">{JSON.stringify(open.payload, null, 2)}</pre>
            </div>
            {open.response_body && (
              <div>
                <p className="mb-1.5 text-[13px] text-muted">Answer from the receiver</p>
                <pre className="max-h-40 overflow-auto rounded-lg border border-line bg-sunken/50 p-3 text-[12px] text-ink/85">{open.response_body}</pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </Paper>
  );
}
