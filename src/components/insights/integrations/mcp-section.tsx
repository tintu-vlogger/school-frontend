"use client";

/*
 * MCP: let outside assistants (desktop chat apps, IDEs, agents) use Next Gen HRMS data with a
 * personal access token. Tokens see only what their owner may see. Admins can list everyone's.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, Cable, KeyRound, Plus, Wrench } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { formatDate, formatDateTime, formatRelative } from "@/lib/datetime";
import {
  Badge, Button, DataTable, Field, Modal, ModalCancel, MultiSelect, NumberInput, Tabs, TextInput, Toggle, useConfirm, useToast,
  type BadgeTone, type Column,
} from "@/components/ui-kit";
import { CopyBlock, CopyValue } from "./copy";
import type { AccessToken, McpTool, TokensResponse } from "./types";

const STATE: Record<AccessToken["state"], { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "good" },
  revoked: { label: "Revoked", tone: "neutral" },
  expired: { label: "Expired", tone: "warn" },
};

export function McpSection({ isAdmin, mcpPath = "/api/v1/mcp", ssePath = "/api/v1/mcp/sse" }: {
  isAdmin: boolean; mcpPath?: string; ssePath?: string;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [everyone, setEveryone] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; res: TokensResponse } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newKey, setNewKey] = useState(0);
  const [tab, setTab] = useState<"tokens" | "connect" | "tools">("tokens");
  const key = `${everyone}:${nonce}`;

  useEffect(() => {
    let live = true;
    api.get<TokensResponse>(`/integrations/tokens/mine${everyone ? "?everyone=true" : ""}`)
      .then((r) => { if (live) { setData({ key, res: r }); setFailed(null); } })
      .catch((e: Error) => { if (live) setFailed(e.message); });
    return () => { live = false; };
  }, [everyone, key]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const origin = API_BASE.replace(/\/api\/v1\/?$/, "");
  const url = `${origin}${mcpPath}`;
  const sseUrl = `${origin}${ssePath}`;
  const tools = data?.res.tools ?? [];
  const canConnect = data?.res.can_connect ?? false;

  async function revoke(t: AccessToken) {
    await confirm({
      title: `Revoke “${t.name}”?`,
      message: "Anything using this token stops working straight away. This can't be undone.",
      confirmLabel: "Revoke", tone: "danger",
      onConfirm: async () => {
        try {
          await api.delete(`/integrations/tokens/${t.uuid}`);
          toast.success("Token revoked");
          reload();
        } catch (e) {
          toast.error("Couldn't revoke", { description: (e as Error).message });
          throw e;
        }
      },
    });
  }

  const columns: Column<AccessToken>[] = [
    {
      key: "name", header: "Name", sortable: true, sortValue: (r) => r.name,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[14px] text-ink">{r.name}</p>
          <p className="font-mono text-[12px] text-faint">{r.prefix}…</p>
        </div>
      ),
    },
    ...(everyone ? [{ key: "owner", header: "Owner", cell: (r: AccessToken) => <span className="text-[13px] text-muted">{r.owner_name || "—"}</span> }] : []),
    {
      key: "tools", header: "Tools", hideBelow: "md",
      cell: (r) => r.scopes.includes("*")
        ? <span className="text-[13px] text-muted">All tools</span>
        : <span className="text-[13px] text-muted" title={r.scopes.join(", ")}>{r.scopes.length} {r.scopes.length === 1 ? "tool" : "tools"}</span>,
    },
    {
      key: "state", header: "State",
      cell: (r) => (
        <div>
          <Badge tone={STATE[r.state].tone} dot>{STATE[r.state].label}</Badge>
          {r.state === "active" && r.expires_at && <p className="mt-1 text-[12px] text-faint">Until {formatDate(r.expires_at)}</p>}
        </div>
      ),
    },
    { key: "created", header: "Created", hideBelow: "lg", sortable: true, sortValue: (r) => r.created_at, cell: (r) => <span className="text-[13px] text-muted">{formatDate(r.created_at)}</span> },
    {
      key: "used", header: "Last used", hideBelow: "md", sortable: true, sortValue: (r) => r.last_used_at ?? "",
      cell: (r) => r.last_used_at
        ? <span className="text-[13px] text-muted" title={formatDateTime(r.last_used_at)}>{formatRelative(r.last_used_at)}</span>
        : <span className="text-[13px] text-faint">Never</span>,
    },
    { key: "uses", header: "Uses", align: "right", hideBelow: "lg", cell: (r) => <span className="tabular text-[13px] text-muted">{r.use_count.toLocaleString("en-IN")}</span> },
  ];

  const json = JSON.stringify({ mcpServers: { "next-gen-hrms": { type: "http", url, headers: { Authorization: "Bearer ngh_pat_…" } } } }, null, 2);
  const remote = `npx mcp-remote ${url} --header "Authorization: Bearer ngh_pat_…"`;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft/60 text-primary"><Cable size={17} strokeWidth={1.4} /></span>
          <div>
            <h2 className="text-[17px] font-light text-ink">MCP — connect outside AI assistants</h2>
            <p className="mt-0.5 max-w-2xl text-[13px] text-muted">
              Let assistants you already use answer questions from your HR data. Each person connects with their own token and sees only what they may see here.
            </p>
          </div>
        </div>
        {canConnect && <Button variant="primary" icon={Plus} onClick={() => { setNewKey((k) => k + 1); setNewOpen(true); }}>New token</Button>}
      </div>

      <div className="rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 pt-2">
          <Tabs value={tab} onChange={setTab} items={[
            { value: "tokens", label: "Access tokens", icon: KeyRound },
            { value: "connect", label: "How to connect", icon: Cable },
            { value: "tools", label: "Tools", icon: Wrench, count: tools.length || undefined },
          ]} />
          {isAdmin && tab === "tokens" && (
            <Toggle size="sm" checked={everyone} onChange={setEveryone} label="Everyone's tokens" />
          )}
        </div>

        <div className="p-5">
          {tab === "tokens" && (
            failed && !data ? <p className="text-[13.5px] text-muted">{failed}</p> : (
              <>
                {data && !canConnect && (
                  <p className="mb-4 flex gap-2 rounded-lg border border-line bg-sunken/60 px-3 py-2.5 text-[13px] text-muted">
                    <AlertTriangle size={15} strokeWidth={1.4} className="mt-0.5 shrink-0 text-amber-600" />
                    You can&apos;t create tokens yet. Ask an HR admin to give you access to connect assistants.
                  </p>
                )}
                <DataTable rows={data?.res.tokens ?? []} rowKey={(r) => r.uuid} columns={columns} loading={!data || data.key !== key}
                  rowClassName={(r) => (r.state !== "active" ? "opacity-60" : undefined)}
                  rowActions={(r) => r.state === "active" ? [{ label: "Revoke", icon: Ban, danger: true, onSelect: () => { void revoke(r); } }] : []}
                  emptyIcon={KeyRound} emptyTitle={everyone ? "No tokens yet" : "You have no tokens"}
                  emptyHint={canConnect ? "Create one to connect an assistant." : undefined} />
              </>
            )
          )}

          {tab === "connect" && (
            <div className="space-y-5">
              <ol className="space-y-1.5 text-[13.5px] text-muted">
                <li>1. Create a token with <span className="text-ink">New token</span> and copy it.</li>
                <li>2. Add the server below to your assistant, with the token in the Authorization header.</li>
                <li>3. Ask a question, such as “who is on leave today?”.</li>
              </ol>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Server URL" hint="Streamable HTTP">
                  <CopyValue value={url} />
                </Field>
                <Field label="Header">
                  <CopyValue value="Authorization: Bearer <your token>" />
                </Field>
              </div>
              <CopyBlock label="Config for assistants that take a JSON server list" value={json} />
              <CopyBlock label="For assistants that only run local commands" value={remote} />
              <p className="text-[12.5px] text-faint">Older clients that need Server-Sent Events can use {sseUrl}.</p>
            </div>
          )}

          {tab === "tools" && <ToolList tools={tools} />}
        </div>
      </div>

      <NewTokenModal key={newKey} open={newOpen} onClose={() => setNewOpen(false)} tools={tools} onCreated={reload} />
    </section>
  );
}

function ToolList({ tools }: { tools: McpTool[] }) {
  if (!tools.length) return <p className="text-[13.5px] text-faint">No tools available.</p>;
  return (
    <ul className="grid gap-x-8 gap-y-4 md:grid-cols-2">
      {tools.map((t) => (
        <li key={t.name}>
          <p className="font-mono text-[13px] text-ink">{t.name}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{t.description}</p>
        </li>
      ))}
    </ul>
  );
}

function NewTokenModal({ open, onClose, tools, onCreated }: { open: boolean; onClose: () => void; tools: McpTool[]; onCreated: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [all, setAll] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [days, setDays] = useState<number | null>(90);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<(AccessToken & { token: string }) | null>(null);
  const [error, setError] = useState<Record<string, string>>({});
  const options = useMemo(() => tools.map((t) => ({ value: t.name, label: t.name, description: t.description })), [tools]);

  async function submit() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Give the token a name";
    if (!all && picked.length === 0) e.tools = "Choose at least one tool";
    setError(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const r = await api.post<AccessToken & { token: string }>("/integrations/tokens", {
        name: name.trim(), scopes: all ? ["*"] : picked, expires_in_days: days && days > 0 ? days : null,
      });
      setCreated(r);
      onCreated();
    } catch (err) {
      toast.error("Couldn't create the token", { description: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" busy={busy}
      title={created ? "Copy your token" : "New access token"}
      description={created ? created.name : "For one assistant or device. You can revoke it at any time."}
      dirty={!created && !!name.trim()}
      footer={created
        ? <Button variant="primary" onClick={onClose}>I&apos;ve copied it</Button>
        : <><ModalCancel /><Button variant="primary" loading={busy} onClick={submit}>Create token</Button></>}>
      {created ? (
        <div className="space-y-4">
          <CopyValue value={created.token} large />
          <p className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5 text-[13px] text-amber-800">
            <AlertTriangle size={15} strokeWidth={1.4} className="mt-0.5 shrink-0" />
            This is the only time the token is shown. Keep it like a password: anyone with it can read what you can see.
          </p>
          <p className="text-[12.5px] text-muted">
            {created.scopes.includes("*") ? "All tools" : `${created.scopes.length} tools`}
            {created.expires_at ? ` · until ${formatDate(created.expires_at)}` : " · does not expire"}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <Field label="Name" required error={error.name} hint="Where you'll use it, e.g. “Laptop chat app”">
            <TextInput value={name} onValueChange={(v) => { setName(v); setError((x) => ({ ...x, name: "" })); }} autoFocusInModal maxLength={80} />
          </Field>
          <div className="space-y-3">
            <Toggle checked={all} onChange={setAll} label="All tools" description="Includes tools added later." />
            {!all && (
              <Field label="Tools" required error={error.tools}>
                <MultiSelect<string> value={picked} onChange={(v) => { setPicked(v); setError((x) => ({ ...x, tools: "" })); }} options={options} placeholder="Choose tools" />
              </Field>
            )}
          </div>
          <Field label="Expires after" hint="Leave empty for a token that doesn't expire.">
            <div className="max-w-[200px]"><NumberInput value={days} onChange={setDays} min={1} max={3650} suffix="days" placeholder="Never" /></div>
          </Field>
        </div>
      )}
    </Modal>
  );
}
