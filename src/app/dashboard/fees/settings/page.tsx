"use client";

/*
 * Fee settings: collection rules, sibling discount, automatic reminders, late fee rules and
 * the online payment provider (keys stored encrypted; only the last four characters show).
 */
import { useState } from "react";
import { Clock, CreditCard, Pencil, Plus, Save } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, DataTable, Field, FormGrid, Modal, ModalCancel, MultiSelect, NumberInput, RadioCards, Skeleton,
  TextInput, Textarea, Toggle, type Column,
} from "@/components/ui-kit";
import { type Page, errMsg, money, n, useFeeMeta, useFetch, useHeads } from "@/components/fees/shared";

type Settings = {
  currency: string; concession_approval: boolean; allow_advance: boolean; allow_partial_online: boolean; online_payments: boolean;
  sibling_discount: { enabled: boolean; percent: number; head_codes: string[] };
  reminders: { enabled: boolean; days_before: number[]; days_after: number[]; email: boolean };
  bounce_charge: number; receipt_note: string;
};
type FieldSpec = { key: string; label: string; secret: boolean; required: boolean; help: string };
type Gateway = { provider: string; enabled: boolean; test_mode: boolean; live: boolean; updated_by_name: string | null;
  providers: { key: string; label: string; description: string; fields: FieldSpec[]; config: Record<string, string | boolean>; secret_hints: Record<string, string>; ready: boolean }[] };
type LateRule = { id: number; uuid: string; name: string; kind: "fixed" | "per_day"; amount: number; grace_days: number; max_amount: number | null; structure_id: number | null; active: boolean };

export default function FeeSettingsPage() {
  const { can } = useAccess();
  const { data } = useFetch<Settings>("/fees/settings");
  return (
    <div>
      <PageHeader eyebrow="Fees" title="Fee settings" description="How fees are collected, discounted, reminded and paid online." />
      <div className="space-y-5">
        {data ? <GeneralSettings key={JSON.stringify(data)} initial={data} readOnly={!can("fees.settings")} /> : <Skeleton className="h-40 rounded-2xl" />}
        <LateRules />
        {can("fees.settings") && <GatewaySettings />}
      </div>
    </div>
  );
}

const parseDays = (s: string) => s.split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((x) => !Number.isNaN(x));

function GeneralSettings({ initial, readOnly }: { initial: Settings; readOnly: boolean }) {
  const toast = useToast();
  const heads = useHeads();
  const [v, setV] = useState(initial);
  const [before, setBefore] = useState(initial.reminders.days_before.join(", "));
  const [after, setAfter] = useState(initial.reminders.days_after.join(", "));
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api.put("/fees/settings", { ...v, reminders: { ...v.reminders, days_before: parseDays(before), days_after: parseDays(after) } });
      toast.success("Fee settings saved");
    } catch (e) { toast.error("Couldn't save", { description: errMsg(e) }); } finally { setSaving(false); }
  }
  return (
    <>
      <Paper>
        <PaperHeader title="Collection" />
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <Toggle checked={v.allow_advance} onChange={(x) => setV({ ...v, allow_advance: x })} disabled={readOnly} label="Keep extra money as advance" description="Money paid above the dues goes to the learner's advance balance instead of being refused." />
          <Toggle checked={v.concession_approval} onChange={(x) => setV({ ...v, concession_approval: x })} disabled={readOnly} label="Concessions need approval" description="New concessions go through the approval flow before they apply." />
          <Toggle checked={v.online_payments} onChange={(x) => setV({ ...v, online_payments: x })} disabled={readOnly} label="Parents can pay online" description="Shows the Pay button in the parent portal." />
          <Toggle checked={v.allow_partial_online} onChange={(x) => setV({ ...v, allow_partial_online: x })} disabled={readOnly} label="Pay some instalments online" description="Parents pick instalments, oldest first, instead of paying everything." />
          <Field label="Cheque bounce charge" hint={`Default charge billed when a cheque bounces (${money(v.bounce_charge, v.currency)}).`}>
            <NumberInput value={v.bounce_charge} onChange={(x) => setV({ ...v, bounce_charge: x ?? 0 })} min={0} disabled={readOnly} />
          </Field>
          <Field label="Note on receipts"><Textarea value={v.receipt_note} onValueChange={(x) => setV({ ...v, receipt_note: x })} rows={2} disabled={readOnly} /></Field>
        </div>
      </Paper>
      <Paper>
        <PaperHeader title="Sibling discount" />
        <div className="grid gap-5 p-5 md:grid-cols-3">
          <Toggle checked={v.sibling_discount.enabled} onChange={(x) => setV({ ...v, sibling_discount: { ...v.sibling_discount, enabled: x } })} disabled={readOnly}
            label="Give younger siblings a discount" description="Learners sharing a parent: the eldest pays in full, younger ones get the discount automatically." />
          <Field label="Discount"><NumberInput value={v.sibling_discount.percent} onChange={(x) => setV({ ...v, sibling_discount: { ...v.sibling_discount, percent: x ?? 0 } })} min={0} max={100} suffix="%" disabled={readOnly} /></Field>
          <Field label="On fee heads" hint="Empty = all fees">
            <MultiSelect<string> value={v.sibling_discount.head_codes} onChange={(x) => setV({ ...v, sibling_discount: { ...v.sibling_discount, head_codes: x } })} disabled={readOnly}
              options={heads.filter((h) => h.active).map((h) => ({ value: h.code, label: h.name }))} />
          </Field>
        </div>
      </Paper>
      <Paper>
        <PaperHeader title="Automatic reminders" />
        <div className="grid gap-5 p-5 md:grid-cols-2">
          <Toggle checked={v.reminders.enabled} onChange={(x) => setV({ ...v, reminders: { ...v.reminders, enabled: x } })} disabled={readOnly} label="Send reminders automatically" description="Each morning, families with dues falling on these days are reminded once." />
          <Toggle checked={v.reminders.email} onChange={(x) => setV({ ...v, reminders: { ...v.reminders, email: x } })} disabled={readOnly} label="Also send by email" description="Portal notifications always go; email goes where a parent has an address." />
          <Field label="Days before the due date" hint="Comma separated, e.g. 7, 3"><TextInput value={before} onValueChange={setBefore} disabled={readOnly} /></Field>
          <Field label="Days after the due date" hint="Comma separated, e.g. 1, 7, 15"><TextInput value={after} onValueChange={setAfter} disabled={readOnly} /></Field>
        </div>
      </Paper>
      {!readOnly && <div className="flex justify-end"><Button variant="primary" icon={Save} loading={saving} onClick={save}>Save settings</Button></div>}
    </>
  );
}

function LateRules() {
  const toast = useToast();
  const { can } = useAccess();
  const meta = useFeeMeta();
  const cur = meta?.currency ?? "INR";
  const { data, loading, reload } = useFetch<Page<LateRule>>("/fees/late-rules?all=true", (e) => toast.error(errMsg(e)));
  const [editing, setEditing] = useState<LateRule | "new" | null>(null);
  const [k, setK] = useState(0);
  const columns: Column<LateRule>[] = [
    { key: "name", header: "Rule", cell: (r) => <span className="text-ink">{r.name}</span> },
    { key: "what", header: "Charge", cell: (r) => <span className="text-muted">{r.kind === "fixed" ? `${money(r.amount, cur)} once` : `${money(r.amount, cur)} a day`} after {r.grace_days} grace days{r.max_amount ? `, up to ${money(r.max_amount, cur)}` : ""}</span> },
    { key: "status", header: "Status", cell: (r) => <Badge tone={r.active ? "good" : "neutral"} dot>{r.active ? "On" : "Off"}</Badge> },
  ];
  return (
    <Paper>
      <PaperHeader title="Late fee" action={can("fees.settings") ? <Button size="sm" icon={Plus} onClick={() => { setK((x) => x + 1); setEditing("new"); }}>New rule</Button> : undefined} />
      <div className="p-3">
        <p className="mb-2 px-2 text-[13px] text-muted">Added to an overdue instalment when the money is collected. The first active rule applies.</p>
        <DataTable rows={data?.items ?? []} rowKey={(r) => r.uuid} columns={columns} loading={loading}
          onRowClick={(r) => { if (can("fees.settings")) { setK((x) => x + 1); setEditing(r); } }}
          rowActions={(r) => can("fees.settings") ? [{ label: "Edit", icon: Pencil, onSelect: () => { setK((x) => x + 1); setEditing(r); } }] : []}
          emptyIcon={Clock} emptyTitle="No late fee" emptyHint="Add a rule to charge late fees on overdue instalments." />
      </div>
      {editing && <LateRuleForm key={k} target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />}
    </Paper>
  );
}

function LateRuleForm({ target, onClose, onSaved }: { target: LateRule | "new"; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const r = target === "new" ? null : target;
  const [v, setV] = useState({ name: r?.name ?? "Late fee", kind: r?.kind ?? "per_day", amount: r ? n(r.amount) : 10 as number | null, grace_days: r?.grace_days ?? 7,
    max_amount: r?.max_amount != null ? n(r.max_amount) : null as number | null, active: r?.active ?? true });
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.amount) { toast.error("Enter the amount"); return; }
    setSaving(true);
    try {
      const body = { name: v.name.trim() || "Late fee", kind: v.kind, amount: v.amount, grace_days: v.grace_days, max_amount: v.max_amount, ...(r ? { active: v.active } : {}) };
      if (r) await api.put(`/fees/late-rules/${r.uuid}`, body); else await api.post("/fees/late-rules", body);
      toast.success("Late fee rule saved"); onSaved();
    } catch (err) { toast.error("Couldn't save", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} title={r ? "Edit late fee rule" : "New late fee rule"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="late-form" loading={saving}>Save</Button></>}>
      <form id="late-form" onSubmit={submit} className="space-y-4">
        <Field label="Name"><TextInput value={v.name} onValueChange={(x) => setV({ ...v, name: x })} /></Field>
        <RadioCards<"per_day" | "fixed"> value={v.kind} onChange={(x) => setV({ ...v, kind: x })} options={[
          { value: "per_day", label: "Per day", description: "For each day after the grace period" }, { value: "fixed", label: "Fixed", description: "Once, after the grace period" }]} />
        <FormGrid columns={3}>
          <Field label="Amount" required><NumberInput value={v.amount} onChange={(x) => setV({ ...v, amount: x })} min={0} /></Field>
          <Field label="Grace days"><NumberInput value={v.grace_days} onChange={(x) => setV({ ...v, grace_days: x ?? 0 })} min={0} max={365} /></Field>
          <Field label="Cap" aside="Optional"><NumberInput value={v.max_amount} onChange={(x) => setV({ ...v, max_amount: x })} min={0} /></Field>
        </FormGrid>
        {r && <Checkbox checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="Rule is on" />}
      </form>
    </Modal>
  );
}

function GatewaySettings() {
  const { data, reload } = useFetch<Gateway>("/fees/gateway");
  if (!data) return <Skeleton className="h-40 rounded-2xl" />;
  return <GatewayForm key={JSON.stringify([data.provider, data.test_mode, data.providers.map((p) => p.secret_hints)])} g={data} onSaved={reload} />;
}

function GatewayForm({ g, onSaved }: { g: Gateway; onSaved: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [provider, setProvider] = useState(g.provider);
  const [testMode, setTestMode] = useState(g.test_mode);
  const [enabled, setEnabled] = useState(g.enabled);
  const [values, setValues] = useState<Record<string, string>>({});
  const [sandbox, setSandbox] = useState(Boolean(g.providers.find((p) => p.key === g.provider)?.config?.sandbox));
  const [saving, setSaving] = useState(false);
  const spec = g.providers.find((p) => p.key === provider);
  const slug = (user as { slug?: string } | null)?.slug ?? "<your-address>";
  const webhook = `${API_BASE}/public/fees/webhook/${provider}/${slug}`;

  async function save() {
    setSaving(true);
    try {
      const config: Record<string, string | boolean> = {};
      for (const f of spec?.fields ?? []) {
        const val = values[f.key];
        if (val !== undefined) config[f.key] = val;
        else if (!f.secret && spec?.config?.[f.key] !== undefined) config[f.key] = spec.config[f.key] as string;
      }
      if (provider === "cashfree" || provider === "payu") config.sandbox = sandbox;
      await api.put("/fees/gateway", { provider, test_mode: provider === "test" ? true : testMode, enabled, config });
      toast.success("Online payment settings saved"); setValues({}); onSaved();
    } catch (e) { toast.error("Couldn't save", { description: errMsg(e) }); } finally { setSaving(false); }
  }

  return (
    <Paper>
      <PaperHeader title="Online payments" action={<Badge tone={g.live ? "good" : "warn"} dot>{g.live ? "Live payments" : "Test mode"}</Badge>} />
      <div className="space-y-5 p-5">
        <RadioCards<string> value={provider} onChange={setProvider} columns={3}
          options={g.providers.map((p) => ({ value: p.key, label: p.label, description: p.description + (p.ready && p.key !== "test" ? " Keys saved." : ""), icon: CreditCard }))} />
        {provider !== "test" && spec && (
          <>
            <FormGrid>
              {spec.fields.map((f) => (
                <Field key={f.key} label={f.label} required={f.required} hint={f.secret ? (spec.secret_hints[f.key] ? `Saved (${spec.secret_hints[f.key]}). Leave empty to keep it.` : f.help || "Stored encrypted.") : f.help}>
                  <TextInput type={f.secret ? "password" : "text"} autoComplete="off" value={values[f.key] ?? (f.secret ? "" : String(spec.config[f.key] ?? ""))}
                    onValueChange={(x) => setValues({ ...values, [f.key]: x })} placeholder={f.secret && spec.secret_hints[f.key] ? "••••••••" : undefined} />
                </Field>
              ))}
            </FormGrid>
            {(provider === "cashfree" || provider === "payu") && <Checkbox checked={sandbox} onChange={setSandbox} label="Use the provider's sandbox (test) environment" />}
            <Toggle checked={testMode} onChange={setTestMode} label="Test mode" description="Simulate payments without charging anyone. Switch off to take real payments with the keys above." />
            <Field label="Webhook address" hint="Add this address in the provider's dashboard so payments are confirmed even if the parent closes the page.">
              <TextInput value={webhook} readOnly onFocus={(e) => e.currentTarget.select()} className="font-mono text-[12.5px]" />
            </Field>
          </>
        )}
        {provider === "test" && <p className="text-[13.5px] text-muted">Parents see a test checkout and the payment is marked as received straight away. Use it to try the flow before adding real keys.</p>}
        <Toggle checked={enabled} onChange={setEnabled} label="Online payment is on" />
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] text-faint">{g.updated_by_name ? `Last changed by ${g.updated_by_name}` : ""}</span>
          <Button variant="primary" icon={Save} loading={saving} onClick={save}>Save online payments</Button>
        </div>
      </div>
    </Paper>
  );
}

