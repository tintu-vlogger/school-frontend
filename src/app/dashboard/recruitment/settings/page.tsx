"use client";

/*
 * Hiring settings: careers page and the embeddable widget, privacy and data retention,
 * screening, pipeline stages, interviews and kits, offers, referrals and job sites.
 */
import { useEffect, useState } from "react";
import { Copy, ExternalLink, Plus, Trash2 } from "lucide-react";
import { API_BASE, api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Paper, PageHeader } from "@/components/shell/page";
import {
  Badge, Button, Field, FormGrid, IconButton, Modal, ModalCancel, NumberInput, Skeleton, Tabs, Textarea, TextInput, Toggle,
} from "@/components/ui-kit";
import { StagesEditor } from "@/components/recruitment/job-form";
import { errText, type Stage } from "@/components/recruitment/types";

type Conf = {
  careers: { enabled: boolean; headline: string; intro: string; about: string; accent: string; show_department_filter: boolean; show_location_filter: boolean };
  privacy: { notice: string; retention_days: number; talent_pool_retention_days: number; grievance_contact: string };
  screening: { scorer: string; weights: Record<string, number>; auto_reject_below: number | null; auto_shortlist_above: number | null };
  interviews: { reminder_hours: number; send_invites: boolean; default_duration_minutes: number; competencies: { key: string; label: string }[] };
  offers: { expiry_days: number; default_probation_months: number; default_notice_days: number; approval_outside_band: boolean; esign: boolean };
  referrals: { default_bonus: string; qualifying_days: number; pay_via_payroll: boolean };
  boards: Record<string, { enabled: boolean; api_key: string; api_key_set?: boolean; account_id: string; endpoint?: string }>;
  follow_up_days: number; default_stages: Stage[];
};
type Widget = { careers_url: string; iframe: string; script: string; feed_xml: string; feed_json: string };
type Kit = { uuid: string; name: string; description: string | null; competencies: { key: string; label: string }[]; questions: string[]; duration_minutes: number; active: boolean };
type Tab = "careers" | "privacy" | "pipeline" | "interviews" | "offers" | "boards";
const BOARD_LABEL: Record<string, string> = { naukri: "Naukri", indeed: "Indeed", linkedin: "LinkedIn" };

export default function HiringSettingsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("careers");
  const [c, setC] = useState<Conf | null>(null);
  const [w, setW] = useState<Widget | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get<{ settings: Conf; widget: Widget }>("/recruitment/settings").then((r) => { setC(r.settings); setW(r.widget); }).catch((e) => toast.error(errText(e))); }, [toast]);

  function up<K extends keyof Conf>(k: K, patch: Partial<Conf[K]> | Conf[K]) {
    setC((x) => x && ({ ...x, [k]: Array.isArray(patch) ? patch : typeof patch === "object" && patch !== null ? { ...(x[k] as object), ...patch } : patch }));
    setDirty(true);
  }
  async function save() {
    if (!c) return;
    setSaving(true);
    try {
      const r = await api.put<{ settings: Conf; widget: Widget }>("/recruitment/settings", c);
      setC(r.settings); setW(r.widget); setDirty(false); toast.success("Hiring settings saved");
    } catch (e) { toast.error(errText(e)); } finally { setSaving(false); }
  }
  const copy = (t: string) => { navigator.clipboard?.writeText(t); toast.success("Copied"); };

  return (
    <div>
      <PageHeader title="Hiring and careers page" description="How your careers page looks, how candidates are screened and how offers work."
        actions={<Button variant="primary" loading={saving} disabled={!dirty} onClick={save}>Save changes</Button>} />
      <Tabs value={tab} onChange={setTab} className="mb-5" items={[
        { value: "careers", label: "Careers page" }, { value: "privacy", label: "Privacy" }, { value: "pipeline", label: "Screening and stages" },
        { value: "interviews", label: "Interviews" }, { value: "offers", label: "Offers and referrals" }, { value: "boards", label: "Job sites" }]} />
      {!c ? <Skeleton className="h-96" /> : (
        <div className="max-w-4xl space-y-5">
          {tab === "careers" && <>
            <Paper className="space-y-4 p-6">
              <Toggle checked={c.careers.enabled} onChange={(v) => up("careers", { enabled: v })} label="Careers page is live" />
              <Field label="Headline"><TextInput value={c.careers.headline} onValueChange={(v) => up("careers", { headline: v })} /></Field>
              <Field label="Introduction"><Textarea value={c.careers.intro} onValueChange={(v) => up("careers", { intro: v })} rows={2} /></Field>
              <Field label="About the company" hint="Shown below the jobs"><Textarea value={c.careers.about} onValueChange={(v) => up("careers", { about: v })} rows={4} /></Field>
              <FormGrid>
                <Field label="Accent colour">
                  <div className="flex items-center gap-2">
                    <input type="color" value={c.careers.accent} onChange={(e) => up("careers", { accent: e.target.value })} className="h-9 w-12 cursor-pointer rounded border border-line bg-surface" aria-label="Accent colour" />
                    <TextInput value={c.careers.accent} onValueChange={(v) => up("careers", { accent: v })} />
                  </div>
                </Field>
              </FormGrid>
              <div className="flex flex-wrap gap-6">
                <Toggle checked={c.careers.show_department_filter} onChange={(v) => up("careers", { show_department_filter: v })} label="Department filter" />
                <Toggle checked={c.careers.show_location_filter} onChange={(v) => up("careers", { show_location_filter: v })} label="Location filter" />
              </div>
            </Paper>
            {w && (
              <Paper className="space-y-4 p-6">
                <div className="flex items-center justify-between"><p className="text-[15px] text-ink">Your careers page and widget</p>
                  <a href={w.careers_url} target="_blank" rel="noreferrer"><Button size="sm" variant="secondary" icon={ExternalLink}>Open careers page</Button></a></div>
                <Snippet label="Embed on your website (iframe)" text={w.iframe} onCopy={copy} />
                <Snippet label="Embed with a script (resizes itself)" text={w.script} onCopy={copy} />
                <FormGrid>
                  <Snippet label="XML job feed (Indeed and aggregators)" text={`${API_BASE}${w.feed_xml}`} onCopy={copy} />
                  <Snippet label="JSON job feed" text={`${API_BASE}${w.feed_json}`} onCopy={copy} />
                </FormGrid>
              </Paper>
            )}
          </>}
          {tab === "privacy" && (
            <Paper className="space-y-4 p-6">
              <Field label="Privacy notice shown to candidates" hint="Candidates agree to it before applying (Digital Personal Data Protection Act)."><Textarea value={c.privacy.notice} onValueChange={(v) => up("privacy", { notice: v })} rows={5} /></Field>
              <FormGrid>
                <Field label="Delete candidate data after" hint="Counted from their last activity. People who join are kept."><NumberInput value={c.privacy.retention_days} onChange={(v) => up("privacy", { retention_days: v ?? 180 })} min={30} max={1095} suffix="days" /></Field>
                <Field label="Talent pool kept for"><NumberInput value={c.privacy.talent_pool_retention_days} onChange={(v) => up("privacy", { talent_pool_retention_days: v ?? 365 })} min={30} max={1095} suffix="days" /></Field>
                <Field label="Contact for data requests" hint="Email shown on the careers page"><TextInput value={c.privacy.grievance_contact} onValueChange={(v) => up("privacy", { grievance_contact: v })} /></Field>
              </FormGrid>
              <PurgeNow />
            </Paper>
          )}
          {tab === "pipeline" && <>
            <Paper className="space-y-4 p-6">
              <p className="text-[15px] text-ink">Screening score</p>
              <p className="text-[13px] text-muted">Each CV is scored from 0 to 100 against the job, with an explanation. Set how much each part counts.</p>
              <FormGrid columns={3}>
                {[["skills", "Required skills"], ["experience", "Experience"], ["nice_skills", "Good-to-have skills"], ["location", "Location"]].map(([k, l]) => (
                  <Field key={k} label={l}><NumberInput value={c.screening.weights[k] ?? 0} min={0} max={100} onChange={(v) => up("screening", { weights: { ...c.screening.weights, [k]: v ?? 0 } })} /></Field>
                ))}
                <Field label="Follow-up reminder after"><NumberInput value={c.follow_up_days} onChange={(v) => { setC({ ...c, follow_up_days: v ?? 3 }); setDirty(true); }} min={1} suffix="days" /></Field>
              </FormGrid>
            </Paper>
            <Paper className="space-y-4 p-6">
              <p className="text-[15px] text-ink">Default pipeline stages</p>
              <p className="text-[13px] text-muted">New jobs start with these; each job can change its own.</p>
              <StagesEditor value={c.default_stages} onChange={(v) => { setC({ ...c, default_stages: v }); setDirty(true); }} />
            </Paper>
          </>}
          {tab === "interviews" && <>
            <Paper className="space-y-4 p-6">
              <FormGrid columns={3}>
                <Field label="Reminder before the interview"><NumberInput value={c.interviews.reminder_hours} onChange={(v) => up("interviews", { reminder_hours: v ?? 24 })} min={1} max={72} suffix="hours" /></Field>
                <Field label="Default length"><NumberInput value={c.interviews.default_duration_minutes} onChange={(v) => up("interviews", { default_duration_minutes: v ?? 45 })} min={10} step={15} suffix="min" /></Field>
              </FormGrid>
              <Toggle checked={c.interviews.send_invites} onChange={(v) => up("interviews", { send_invites: v })} label="Email calendar invites (.ics) to the candidate and panel" />
              <Field label="Standard competencies on scorecards">
                <CompetencyEditor value={c.interviews.competencies} onChange={(v) => up("interviews", { competencies: v })} />
              </Field>
            </Paper>
            <Kits />
          </>}
          {tab === "offers" && <>
            <Paper className="space-y-4 p-6">
              <p className="text-[15px] text-ink">Offers</p>
              <FormGrid columns={3}>
                <Field label="Offer open for"><NumberInput value={c.offers.expiry_days} onChange={(v) => up("offers", { expiry_days: v ?? 7 })} min={1} suffix="days" /></Field>
                <Field label="Default probation"><NumberInput value={c.offers.default_probation_months} onChange={(v) => up("offers", { default_probation_months: v ?? 6 })} min={0} max={24} suffix="months" /></Field>
                <Field label="Default notice period"><NumberInput value={c.offers.default_notice_days} onChange={(v) => up("offers", { default_notice_days: v ?? 30 })} min={0} suffix="days" /></Field>
              </FormGrid>
              <Toggle checked={c.offers.approval_outside_band} onChange={(v) => up("offers", { approval_outside_band: v })} label="Offers outside the salary band need approval" description="The flow is set in Approval flows → Offer outside salary band." />
              <Toggle checked={c.offers.esign} onChange={(v) => up("offers", { esign: v })} label="Candidates sign the offer letter electronically" />
            </Paper>
            <Paper className="space-y-4 p-6">
              <p className="text-[15px] text-ink">Referrals</p>
              <FormGrid columns={3}>
                <Field label="Default bonus"><NumberInput value={Number(c.referrals.default_bonus) || 0} onChange={(v) => up("referrals", { default_bonus: String(v ?? 0) })} min={0} suffix="₹" /></Field>
                <Field label="Paid after the joiner completes"><NumberInput value={c.referrals.qualifying_days} onChange={(v) => up("referrals", { qualifying_days: v ?? 90 })} min={0} suffix="days" /></Field>
              </FormGrid>
              <Toggle checked={c.referrals.pay_via_payroll} onChange={(v) => up("referrals", { pay_via_payroll: v })} label="Pay referral bonuses with salary" />
            </Paper>
          </>}
          {tab === "boards" && (
            <Paper className="divide-y divide-line">
              {Object.entries(c.boards).map(([k, b]) => (
                <div key={k} className="space-y-3 p-6">
                  <div className="flex items-center justify-between">
                    <p className="text-[15px] text-ink">{BOARD_LABEL[k] ?? k}</p>
                    <Toggle checked={b.enabled} onChange={(v) => up("boards", { ...c.boards, [k]: { ...b, enabled: v } })} label="Use" size="sm" />
                  </div>
                  <p className="text-[13px] text-muted">{k === "indeed" ? "Indeed reads your XML feed; no key needed." : "With partner API keys, jobs are posted directly. Without keys, use the share link."}</p>
                  {k !== "indeed" && b.enabled && (
                    <FormGrid>
                      <Field label="API key" hint={b.api_key_set ? "A key is saved. Type a new one to replace it." : undefined}>
                        <TextInput type="password" value={b.api_key} placeholder={b.api_key_set ? "••••••••" : ""} onValueChange={(v) => up("boards", { ...c.boards, [k]: { ...b, api_key: v } })} autoComplete="off" />
                      </Field>
                      <Field label="Account ID"><TextInput value={b.account_id} onValueChange={(v) => up("boards", { ...c.boards, [k]: { ...b, account_id: v } })} /></Field>
                    </FormGrid>
                  )}
                  {b.api_key_set && <Badge tone="good">Key saved</Badge>}
                </div>
              ))}
            </Paper>
          )}
        </div>
      )}
    </div>
  );
}

function Snippet({ label, text, onCopy }: { label: string; text: string; onCopy: (t: string) => void }) {
  return (
    <Field label={label}>
      <div className="flex items-start gap-2">
        <pre className="max-h-28 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-sunken/50 p-2.5 text-[12px] text-muted">{text}</pre>
        <IconButton icon={Copy} label="Copy" onClick={() => onCopy(text)} />
      </div>
    </Field>
  );
}

function CompetencyEditor({ value, onChange }: { value: { key: string; label: string }[]; onChange: (v: { key: string; label: string }[]) => void }) {
  return (
    <div className="space-y-2">
      {value.map((cp, i) => (
        <div key={i} className="flex gap-2">
          <TextInput value={cp.label} className="flex-1" aria-label="Competency"
            onValueChange={(v) => onChange(value.map((x, j) => (j === i ? { key: x.key || v.toLowerCase().replace(/[^a-z0-9]+/g, "_"), label: v } : x)))} />
          <IconButton icon={Trash2} label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...value, { key: "", label: "" }])}>Add competency</Button>
    </div>
  );
}

function PurgeNow() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center justify-between rounded-xl border border-line p-4">
      <p className="text-[13.5px] text-muted">Data past its retention date is deleted every day automatically.</p>
      <Button size="sm" variant="secondary" loading={busy} onClick={async () => {
        setBusy(true);
        try { const r = await api.post<{ purged: number }>("/recruitment/candidates/purge-due"); toast.success(`${r.purged} candidate(s) deleted`); }
        catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
      }}>Run now</Button>
    </div>
  );
}

function Kits() {
  const toast = useToast();
  const [kits, setKits] = useState<Kit[] | null>(null);
  const [edit, setEdit] = useState<Kit | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => { api.get<{ items: Kit[] }>("/recruitment/kits").then((r) => setKits(r.items)).catch(() => setKits([])); }, [nonce]);
  const blank: Kit = { uuid: "", name: "", description: "", competencies: [], questions: [], duration_minutes: 45, active: true };
  async function save() {
    if (!edit) return;
    try {
      const body = { ...edit, questions: edit.questions.filter((q) => q.trim()) };
      if (edit.uuid) await api.put(`/recruitment/kits/${edit.uuid}`, body); else await api.post("/recruitment/kits", body);
      toast.success("Kit saved"); setEdit(null); setNonce((n) => n + 1);
    } catch (e) { toast.error(errText(e)); }
  }
  return (
    <Paper className="p-6">
      <div className="mb-3 flex items-center justify-between"><p className="text-[15px] text-ink">Interview kits</p>
        <Button size="sm" variant="secondary" icon={Plus} onClick={() => setEdit(blank)}>New kit</Button></div>
      <div className="divide-y divide-line rounded-xl border border-line">
        {kits?.map((k) => (
          <button key={k.uuid} type="button" onClick={() => setEdit(k)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-sunken/50">
            <div><p className="text-[14px] text-ink">{k.name}</p><p className="text-[12.5px] text-muted">{k.competencies.map((x) => x.label).join(", ")}</p></div>
            <span className="text-[12.5px] text-faint">{k.duration_minutes} min{k.active ? "" : " · off"}</span>
          </button>
        ))}
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" title={edit?.uuid ? "Edit interview kit" : "New interview kit"}
        footer={<><ModalCancel /><Button variant="primary" onClick={save}>Save</Button></>}>
        {edit && (
          <div className="space-y-4">
            <FormGrid>
              <Field label="Name" required><TextInput value={edit.name} onValueChange={(v) => setEdit({ ...edit, name: v })} data-autofocus /></Field>
              <Field label="Length"><NumberInput value={edit.duration_minutes} onChange={(v) => setEdit({ ...edit, duration_minutes: v ?? 45 })} min={10} step={15} suffix="min" /></Field>
            </FormGrid>
            <Field label="Description"><TextInput value={edit.description ?? ""} onValueChange={(v) => setEdit({ ...edit, description: v })} /></Field>
            <Field label="Competencies rated on the scorecard"><CompetencyEditor value={edit.competencies} onChange={(v) => setEdit({ ...edit, competencies: v })} /></Field>
            <Field label="Questions" hint="One per line"><Textarea value={edit.questions.join("\n")} onValueChange={(v) => setEdit({ ...edit, questions: v.split("\n") })} rows={5} /></Field>
            <Toggle checked={edit.active} onChange={(v) => setEdit({ ...edit, active: v })} label="Available for new interviews" />
          </div>
        )}
      </Modal>
    </Paper>
  );
}
