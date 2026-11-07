"use client";

/*
 * Settings → Sign-in options: switch "Sign in with Google" and "Sign in with Microsoft" on or
 * off for this company and, optionally, allow only the company's own email domains. Only people
 * who already exist (the owner and active employees) can sign in; nobody is created.
 */
import { useEffect, useState } from "react";
import { Plus, ShieldCheck, X } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Button, Field, TextInput, Toggle } from "@/components/ui-kit";

type Provider = { label: string; available: boolean; enabled: boolean; switched_on: boolean };
type Out = { providers: { google: Provider; microsoft: Provider }; allowed_domains: string[]; suggested_domain: string };

const DESC: Record<string, string> = {
  google: "For companies on Google Workspace or people with a Google account.",
  microsoft: "For companies on Microsoft 365 (work or school accounts).",
};

export default function SignInOptionsPage() {
  const toast = useToast();
  const [data, setData] = useState<Out | null>(null);
  const [google, setGoogle] = useState(false);
  const [microsoft, setMicrosoft] = useState(false);
  const [domains, setDomains] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const apply = (o: Out) => { setData(o); setGoogle(o.providers.google.switched_on); setMicrosoft(o.providers.microsoft.switched_on); setDomains(o.allowed_domains); };
  useEffect(() => { api.get<Out>("/sso/settings").then(apply).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load")); }, [toast]);
  function addDomain(v: string) {
    const d = v.trim().toLowerCase().replace(/^@/, "");
    if (d && !domains.includes(d)) setDomains([...domains, d]);
    setDraft("");
  }
  async function save() {
    setSaving(true);
    try {
      const body = { google_enabled: google && !!data?.providers.google.available, microsoft_enabled: microsoft && !!data?.providers.microsoft.available,
        allowed_domains: draft.trim() ? [...domains, draft.trim()] : domains };
      apply(await api.put<Out>("/sso/settings", body));
      setDraft("");
      toast.success("Sign-in options saved");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); } finally { setSaving(false); }
  }
  const rows = data ? ([["google", google, setGoogle], ["microsoft", microsoft, setMicrosoft]] as const) : [];
  return (
    <div>
      <PageHeader eyebrow="Settings" title="Sign-in options" description="Let people sign in with their Google or Microsoft work account instead of a password." />
      {!data ? <Paper className="p-10 text-center text-muted">Loading…</Paper> : (
        <div className="space-y-5">
          <Paper>
            <PaperHeader title="Sign in with" />
            <ul className="divide-y divide-line">
              {rows.map(([key, on, setOn]) => {
                const p = data.providers[key];
                return (
                  <li key={key} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                    <div>
                      <p className="flex items-center gap-2 text-[14.5px] text-ink">{p.label}{!p.available && <Badge>Not offered yet</Badge>}{p.enabled && <Badge tone="good">On</Badge>}</p>
                      <p className="text-[13px] text-muted">{p.available ? DESC[key] : "The service hasn't set this up yet. Ask support to turn it on."}</p>
                    </div>
                    <Toggle checked={on && p.available} disabled={!p.available} onChange={setOn} label={on ? "On" : "Off"} />
                  </li>
                );
              })}
            </ul>
          </Paper>
          <Paper className="p-6">
            <p className="text-[14.5px] text-ink">Allowed email domains</p>
            <p className="mb-4 mt-1 max-w-2xl text-[13px] text-muted">Leave empty to allow any address. With domains listed, only accounts ending in one of them can sign in with Google or Microsoft (password sign-in is not affected).</p>
            <div className="mb-3 flex flex-wrap gap-2">
              {domains.map((d) => (
                <span key={d} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-sunken/60 px-3 py-1 text-[13px] text-ink">@{d}
                  <button type="button" aria-label={`Remove ${d}`} onClick={() => setDomains(domains.filter((x) => x !== d))} className="text-faint hover:text-ink"><X size={13} strokeWidth={1.6} /></button>
                </span>
              ))}
              {domains.length === 0 && <span className="text-[13px] text-faint">Any domain</span>}
            </div>
            <div className="flex max-w-md items-end gap-2">
              <Field label="Add a domain" className="flex-1"><TextInput value={draft} onValueChange={setDraft} placeholder={data.suggested_domain || "yourcompany.in"} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDomain(draft); } }} /></Field>
              <Button variant="secondary" icon={Plus} onClick={() => addDomain(draft || data.suggested_domain)}>Add</Button>
            </div>
          </Paper>
          <Paper className="flex items-start gap-3 p-5">
            <ShieldCheck size={20} strokeWidth={1.4} className="mt-0.5 shrink-0 text-accent" />
            <p className="text-[13px] text-muted">Only people already in the company can sign in: the owner and active employees whose work email matches the verified Google or Microsoft address. Nobody is added by signing in, and people who leave lose access when their record is closed.</p>
          </Paper>
          <div className="flex justify-end"><Button variant="primary" loading={saving} onClick={save}>Save</Button></div>
        </div>
      )}
    </div>
  );
}
