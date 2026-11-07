"use client";

/*
 * Raise a grievance or POSH complaint, show the tracking code once, and follow up with
 * the code (works for anonymous grievances: no names are shown).
 */
import { useState } from "react";
import { Check, Copy, EyeOff, KeyRound, Lock, Send, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, todayISO } from "@/lib/datetime";
import {
  Badge, Button, DateInput, Field, FormGrid, MasterSelect, Modal, ModalCancel, RadioCards, Select, TextInput, Textarea,
  Toggle, formatDisplayDate,
} from "@/components/ui-kit";
import { AttachmentPicker } from "@/components/workplace/attachments";
import { loadEmployees } from "@/components/workplace/pickers";
import type { FileRef } from "@/components/workplace/files";
import { STATUS_TONE, type Grievance, type GrievanceMe } from "./types";

type Submitted = { reference_no: string | null; tracking_code: string; anonymous: boolean; late_filing: boolean };

export function RaiseGrievanceModal({ open, onClose, me, onDone }: {
  open: boolean; onClose: () => void; me: GrievanceMe; onDone: (s: Submitted) => void;
}) {
  const toast = useToast();
  const blank = {
    kind: "grievance" as "grievance" | "posh", category: null as number | null, subject: "", description: "",
    anonymous: false, incident_date: "", incident_location: "", respondent: null as number | null, respondent_name: "",
    witnesses: "",
  };
  const [v, setV] = useState(blank);
  const [files, setFiles] = useState<FileRef[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const posh = v.kind === "posh";
  const dirty = JSON.stringify(v) !== JSON.stringify(blank) || files.length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!v.subject.trim()) errs.subject = "Write a short subject";
    if (!v.description.trim()) errs.description = "Describe what happened";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      const out = await api.post<Submitted>("/grievances", {
        kind: v.kind, category_id: v.category, subject: v.subject.trim(), description: v.description.trim(),
        anonymous: !posh && v.anonymous, incident_date: v.incident_date || null,
        incident_location: v.incident_location.trim() || null,
        respondent_employee_id: posh ? v.respondent : null, respondent_name: posh ? v.respondent_name.trim() || null : null,
        witnesses: posh ? v.witnesses.trim() || null : null, attachments: files.map((f) => f.uuid),
      });
      setV(blank);
      setFiles([]);
      onDone(out);
    } catch (err) {
      toast.error("Couldn't send it", { description: err instanceof Error ? err.message : undefined });
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving} title="Raise a concern"
      description="Handled in confidence by the committee. You'll get a tracking code to follow up."
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="grievance-form" icon={Send} loading={saving}>Send</Button></>}>
      <form id="grievance-form" onSubmit={submit} noValidate className="space-y-5">
        {me.settings.posh_enabled && (
          <RadioCards columns={2} value={v.kind} onChange={(k) => setV({ ...v, kind: k as "grievance" | "posh", anonymous: false })}
            options={[
              { value: "grievance", label: "Grievance", description: "Pay, working conditions, people, safety or policies", icon: ShieldAlert },
              { value: "posh", label: "POSH complaint", description: "Sexual harassment at the workplace. Seen only by the Internal Committee", icon: Lock },
            ]} />
        )}
        {posh && (
          <p className="rounded-xl border border-primary/15 bg-primary-soft/40 px-4 py-3 text-[13px] text-ink/80">
            Only the Internal Committee can see this complaint. Please raise it within {me.settings.posh_filing_months} months of
            the incident; the committee can accept a later complaint if there was a good reason for the delay.
          </p>
        )}
        <FormGrid>
          <Field label="Subject" required error={errors.subject} className="sm:col-span-2">
            <TextInput autoFocusInModal value={v.subject} maxLength={250} onValueChange={(x) => setV({ ...v, subject: x })} placeholder="In a few words" />
          </Field>
          {!posh && (
            <Field label="Category" aside="Optional">
              <MasterSelect type="grievance_category" value={v.category} onChange={(x) => setV({ ...v, category: x })} clearable allowCreate={false} />
            </Field>
          )}
          <Field label="When did it happen?" aside="Optional">
            <DateInput value={v.incident_date} onChange={(x) => setV({ ...v, incident_date: x })} max={todayISO()} clearable />
          </Field>
          <Field label="Where" aside="Optional" className={posh ? "" : "sm:col-span-2"}>
            <TextInput value={v.incident_location} onValueChange={(x) => setV({ ...v, incident_location: x })} placeholder="Office, site, online…" />
          </Field>
          <Field label="What happened" required error={errors.description} className="sm:col-span-2">
            <Textarea rows={6} autoGrow maxRows={14} value={v.description} onValueChange={(x) => setV({ ...v, description: x })}
              placeholder="Describe the events, dates and anything that helps the committee understand." />
          </Field>
          {posh && (
            <>
              <Field label="Person complained against" aside="Optional">
                <Select value={v.respondent} onChange={(x, o) => setV({ ...v, respondent: x, respondent_name: o?.label ?? v.respondent_name })}
                  loadOptions={loadEmployees} clearable placeholder="Search colleagues" />
              </Field>
              <Field label="Or their name" aside="If not an employee">
                <TextInput value={v.respondent_name} onValueChange={(x) => setV({ ...v, respondent_name: x })} placeholder="Name and organisation" />
              </Field>
              <Field label="Witnesses" aside="Optional" className="sm:col-span-2">
                <TextInput value={v.witnesses} onValueChange={(x) => setV({ ...v, witnesses: x })} placeholder="Names of anyone who saw or heard it" />
              </Field>
            </>
          )}
        </FormGrid>
        <Field label="Attachments" aside="Optional">
          <AttachmentPicker value={files} onChange={setFiles} />
        </Field>
        {!posh && me.settings.allow_anonymous && (
          <div className="rounded-xl border border-line px-4 py-3">
            <Toggle checked={v.anonymous} onChange={(x) => setV({ ...v, anonymous: x })} label="Send anonymously"
              description="Nothing links this grievance to you: not your name, not the audit log. Keep the tracking code; it is the only way to follow up." />
          </div>
        )}
      </form>
    </Modal>
  );
}

export function TrackingCodeModal({ result, onClose }: { result: Submitted | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const code = result?.tracking_code ?? "";
  return (
    <Modal open={!!result} onClose={onClose} size="md" title="Received" closeOnBackdrop={false}
      description={result?.reference_no ? `Reference ${result.reference_no}` : undefined}
      footer={<Button variant="primary" onClick={onClose}>I have saved the code</Button>}>
      {result && (
        <div className="space-y-5">
          <p className="text-[14px] text-ink/80">
            {result.anonymous
              ? "Your grievance was sent anonymously. Use this code to read replies and add information."
              : "The committee will be in touch. You can also follow up with this code."}
          </p>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary-soft/40 px-5 py-4">
            <span className="font-mono text-[24px] tracking-[0.18em] text-ink">{code}</span>
            <Button size="sm" icon={copied ? Check : Copy} onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); }}>
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="flex items-start gap-2 text-[13px] text-amber-700">
            <KeyRound size={15} strokeWidth={1.4} className="mt-0.5 shrink-0" />
            This code is shown only once and can't be recovered. Write it down or save it somewhere safe.
          </p>
          {result.late_filing && (
            <p className="text-[13px] text-muted">This complaint came after the usual time limit. The committee may still accept it; explain the delay when they ask.</p>
          )}
        </div>
      )}
    </Modal>
  );
}

export function TrackModal({ open, onClose, statuses }: { open: boolean; onClose: () => void; statuses: Record<string, string> }) {
  const toast = useToast();
  const [code, setCode] = useState("");
  const [g, setG] = useState<Grievance | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  async function look(e?: React.FormEvent) {
    e?.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try { setG(await api.post<Grievance>("/grievances/track", { code: code.trim() })); }
    catch (err) { setG(null); toast.error(err instanceof Error ? err.message : "Not found"); }
    finally { setBusy(false); }
  }
  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      setG(await api.post<Grievance>("/grievances/track/messages", { code: code.trim(), body: reply.trim() }));
      setReply("");
      toast.success("Message sent");
    } catch (err) { toast.error("Couldn't send", { description: err instanceof Error ? err.message : undefined }); }
    finally { setBusy(false); }
  }
  const close = () => { setG(null); setCode(""); setReply(""); onClose(); };

  return (
    <Modal open={open} onClose={close} size="lg" title="Follow up with a code" busy={busy}
      description="Enter the tracking code you got when you raised the concern. No names are shown here.">
      <form onSubmit={look} className="flex gap-2">
        <TextInput autoFocusInModal value={code} onValueChange={(x) => setCode(x.toUpperCase())} placeholder="XXXX-XXXX-XXXX"
          leading={KeyRound} className="font-mono tracking-[0.12em]" />
        <Button type="submit" variant="primary" loading={busy && !g}>Open</Button>
      </form>
      {g && (
        <div className="mt-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
            <div className="min-w-0">
              <p className="text-[12px] uppercase tracking-[0.06em] text-faint">{g.reference_no ?? "Grievance"} · received {formatDisplayDate(g.received_on)}</p>
              <p className="mt-1 text-[16px] text-ink">{g.subject}</p>
            </div>
            <Badge tone={STATUS_TONE[g.status] ?? "neutral"} dot>{statuses[g.status] ?? g.status_label}</Badge>
          </div>
          {g.outcome_summary && <p className="rounded-xl bg-sunken/60 px-4 py-3 text-[13.5px] text-ink/80">{g.outcome_summary}</p>}
          <ul className="space-y-3">
            {(g.messages ?? []).map((m) =>
              m.kind === "event" ? (
                <li key={m.uuid} className="text-center text-[12px] text-faint">{m.body} · {formatDateTime(m.created_at)}</li>
              ) : (
                <li key={m.uuid} className={`flex ${m.from_complainant ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-[14px] ${m.from_complainant ? "bg-primary text-white" : "border border-line bg-surface text-ink"}`}>
                    <p className={`mb-0.5 text-[11.5px] ${m.from_complainant ? "text-white/70" : "text-faint"}`}>{m.from_complainant ? "You" : "Committee"} · {formatDateTime(m.created_at)}</p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                </li>
              ))}
          </ul>
          {["closed", "withdrawn", "rejected"].includes(g.status) ? (
            <p className="flex items-center gap-2 text-[13px] text-muted"><EyeOff size={14} strokeWidth={1.4} /> This case is closed.</p>
          ) : (
            <div className="flex items-end gap-2">
              <Textarea rows={2} autoGrow maxRows={6} value={reply} onValueChange={setReply} placeholder="Add information or reply to the committee" />
              <Button variant="primary" icon={Send} onClick={send} loading={busy} disabled={!reply.trim()}>Send</Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
