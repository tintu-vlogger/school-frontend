"use client";

/*
 * Platform admin → Sign-in apps: the Google and Microsoft OAuth apps every company's
 * "Sign in with Google / Microsoft" buttons use. Secrets are stored encrypted and never shown.
 */
import { useEffect, useState } from "react";
import { Copy, KeyRound } from "lucide-react";
import { formatDateTime } from "@/lib/datetime";
import { platformApi } from "@/lib/platform-api";
import { Field, Flash, Loading, PageHeader, Panel, Pill, Switch, btn, inputCls } from "@/components/admin-ui";

const api = platformApi("/admin/login");
type P = { label: string; enabled: boolean; client_id: string; has_secret: boolean; tenant: string | null; ready: boolean; from_env: boolean; redirect_uri: string; updated_at: string | null; updated_by: string | null };
type Out = { google: P; microsoft: P };

const HELP: Record<string, string> = {
  google: "Google Cloud console → APIs & Services → Credentials → OAuth client ID (Web application). Add the redirect address below as an authorised redirect URI. Scopes: openid, email, profile.",
  microsoft: "Microsoft Entra admin centre → App registrations → New registration. Choose “Accounts in any organizational directory” (multi-tenant), add the redirect address below as a Web redirect URI, then create a client secret under Certificates & secrets. API permission: Microsoft Graph User.Read (delegated).",
};

export default function SignInAppsPage() {
  const [data, setData] = useState<Out | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => { api.get<Out>("/admin/sso").then(setData).catch((e) => setMsg(e.message)); }, []);
  return (
    <div className="space-y-6">
      <PageHeader icon={KeyRound} title="Sign-in apps" sub="Google and Microsoft sign-in for every institution. Each institution switches them on in its own settings." />
      <Flash msg={msg} onClose={() => setMsg("")} />
      {!data ? <Loading /> : (["google", "microsoft"] as const).map((p) => (
        <ProviderPanel key={p} id={p} p={data[p]} onSaved={(o, m) => { if (o) setData(o); setMsg(m); }} />
      ))}
    </div>
  );
}

function ProviderPanel({ id, p, onSaved }: { id: "google" | "microsoft"; p: P; onSaved: (o: Out | null, msg: string) => void }) {
  const [f, setF] = useState({ enabled: p.enabled, client_id: p.client_id, client_secret: "", tenant: p.tenant ?? "organizations" });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      const r = await api.put<Out>(`/admin/sso/${id}`, { ...f, tenant: id === "microsoft" ? f.tenant : null });
      setF((o) => ({ ...o, client_secret: "" }));
      onSaved(r, `${p.label} sign-in saved.`);
    } catch (e: unknown) { onSaved(null, e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }
  return (
    <Panel title={`${p.label} sign-in`} sub={p.updated_at ? `Changed ${formatDateTime(p.updated_at)}${p.updated_by ? ` by ${p.updated_by}` : ""}` : undefined}
      action={p.ready ? <Pill tone="green" dot>On</Pill> : <Pill>Off</Pill>}>
      <p className="mb-4 max-w-3xl text-[13px] font-light text-gray-500">{HELP[id]}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Redirect address (register this with the provider)">
          <div className="flex gap-2"><input readOnly value={p.redirect_uri} className={`${inputCls} font-mono text-[12.5px]`} />
            <button type="button" className={btn.ghost} onClick={() => navigator.clipboard?.writeText(p.redirect_uri)} title="Copy"><Copy size={15} strokeWidth={1.4} /></button></div>
        </Field>
        <Field label={id === "google" ? "Client ID" : "Application (client) ID"}>
          <input value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value.trim() })} className={`${inputCls} font-mono`} />
        </Field>
        <Field label="Client secret" hint={p.has_secret ? "Saved. Leave empty to keep it." : undefined}>
          <input type="password" autoComplete="new-password" value={f.client_secret} placeholder={p.has_secret ? "••••••••  (saved)" : ""} onChange={(e) => setF({ ...f, client_secret: e.target.value })} className={inputCls} />
        </Field>
        {id === "microsoft" && (
          <Field label="Who can sign in" hint="organizations = any work or school account; common = also personal accounts; or one directory id">
            <input value={f.tenant} onChange={(e) => setF({ ...f, tenant: e.target.value.trim() })} className={`${inputCls} font-mono`} />
          </Field>
        )}
      </div>
      {p.from_env && <p className="mt-3 text-[12.5px] font-light text-gray-500">Using the Google app from the server settings. Saving here replaces it.</p>}
      <div className="mt-5 flex items-center justify-between gap-4">
        <Switch on={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} label="Offer this sign-in" />
        <button type="button" className={btn.primary} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
      </div>
    </Panel>
  );
}
