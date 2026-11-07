"use client";

/*
 * Grievance / POSH case for the committee (and the complainant's own view): the
 * conversation with confidential notes, the legal timeline and the committee's actions.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlarmClock, CheckCircle2, CircleDot, Gavel, Handshake, Lock, MessageSquare, Search, Send, UserRoundCheck, X, XCircle,
  ClipboardCheck, FileCheck2, AlertTriangle, Clock,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, todayISO } from "@/lib/datetime";
import {
  Avatar, Badge, Button, DateInput, Field, KeyValue, Modal, ModalCancel, Select, Skeleton, Textarea, TextInput, Timeline,
  formatDisplayDate, useConfirm, type TimelineItem,
} from "@/components/ui-kit";
import { AttachmentList, AttachmentPicker } from "@/components/workplace/attachments";
import type { FileRef } from "@/components/workplace/files";
import { OPEN_STATUSES, STATUS_TONE, type Grievance, type GrievanceMe, type TimelineStep } from "./types";

type ActionKey = "acknowledge" | "condone_delay" | "start_inquiry" | "conciliation" | "complete_inquiry" | "submit_report"
  | "record_action" | "resolve" | "close" | "reject" | "assign";

const ACTIONS: Record<ActionKey, { label: string; icon: typeof CheckCircle2; title: string; hint?: string }> = {
  acknowledge: { label: "Acknowledge", icon: CheckCircle2, title: "Acknowledge receipt", hint: "Tells the complainant the committee has taken this up." },
  condone_delay: { label: "Accept delay", icon: Clock, title: "Accept the late complaint", hint: "Record why the delay in filing is accepted." },
  start_inquiry: { label: "Start inquiry", icon: Search, title: "Start the inquiry" },
  conciliation: { label: "Settle by conciliation", icon: Handshake, title: "Settle by conciliation", hint: "Only at the complainant's request. No money may be part of the settlement." },
  complete_inquiry: { label: "Inquiry completed", icon: ClipboardCheck, title: "Inquiry completed" },
  submit_report: { label: "Submit report", icon: FileCheck2, title: "Submit the report to the employer" },
  record_action: { label: "Record action taken", icon: Gavel, title: "Action on the report" },
  resolve: { label: "Resolve", icon: CheckCircle2, title: "Resolve the grievance" },
  close: { label: "Close", icon: X, title: "Close the case" },
  reject: { label: "Not taken up", icon: XCircle, title: "Don't take this up", hint: "For example, outside the committee's scope." },
  assign: { label: "Assign", icon: UserRoundCheck, title: "Assign to a committee member" },
};

function stepTone(state: string): TimelineItem["tone"] {
  return state === "done" ? "good" : state === "overdue" ? "bad" : state === "due_soon" || state === "late" ? "warn" : "neutral";
}

function availableActions(g: Grievance): ActionKey[] {
  const posh = g.kind === "posh";
  const steps = Object.fromEntries((g.timeline ?? []).map((s) => [s.key, s]));
  const inquiryDone = !!steps.inquiry?.done_on || (!posh && !!steps.resolve?.done_on);
  const out: ActionKey[] = [];
  if (!OPEN_STATUSES.includes(g.status)) return g.status === "resolved" ? ["close"] : [];
  if (posh && g.late_filing && !g.delay_condoned) out.push("condone_delay");
  if (g.status === "submitted") out.push("acknowledge");
  if (g.status === "submitted" || g.status === "under_review") out.push("start_inquiry");
  if (posh && g.status === "inquiry" && !inquiryDone) out.push("complete_inquiry");
  if (posh && g.status === "inquiry" && inquiryDone) out.push("submit_report");
  if (posh && ["submitted", "under_review", "inquiry"].includes(g.status) && !inquiryDone) out.push("conciliation");
  if (posh && g.status === "report_submitted") out.push("record_action", "close");
  if (!posh && ["under_review", "inquiry"].includes(g.status)) out.push("resolve");
  if (["submitted", "under_review"].includes(g.status)) out.push("reject");
  out.push("assign");
  return out;
}

export function GrievanceDetailModal({ uuid, open, onClose, me, onChanged }: {
  uuid: string | null; open: boolean; onClose: () => void; me: GrievanceMe; onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [g, setG] = useState<Grievance | null>(null);
  const [kind, setKind] = useState<"reply" | "note">("reply");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<FileRef[]>([]);
  const [sending, setSending] = useState(false);
  const [action, setAction] = useState<ActionKey | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const load = useCallback(async () => {
    if (!uuid) return;
    try { setG(await api.get<Grievance>(`/grievances/${uuid}`)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't open it"); closeRef.current(); }
  }, [uuid, toast]);
  useEffect(() => { setG(null); setBody(""); setFiles([]); setKind("reply"); if (open) load(); }, [uuid, open, load]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [g?.messages?.length]);

  const handler = !!g?.can_handle;
  const closed = !!g && ["closed", "withdrawn", "rejected"].includes(g.status);

  async function send() {
    if (!g?.uuid || (!body.trim() && !files.length)) return;
    setSending(true);
    try {
      setG(await api.post<Grievance>(`/grievances/${g.uuid}/messages`, { kind, body: body.trim() || "(attachment)", attachments: files.map((f) => f.uuid) }));
      setBody(""); setFiles([]);
      onChanged();
    } catch (e) { toast.error("Couldn't send", { description: e instanceof Error ? e.message : undefined }); }
    finally { setSending(false); }
  }

  async function withdraw() {
    if (!g?.uuid) return;
    const ok = await confirm({ title: "Withdraw this case?", message: "The committee will stop working on it.", confirmLabel: "Withdraw", tone: "danger" });
    if (!ok) return;
    try { setG(await api.post<Grievance>(`/grievances/${g.uuid}/withdraw`, {})); onChanged(); toast.success("Withdrawn"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't withdraw"); }
  }

  const posh = g?.kind === "posh";
  return (
    <Modal open={open && !!uuid} onClose={onClose} size="xl" flush
      title={g ? g.subject : "Loading…"}
      description={g ? `${g.reference_no ?? "No reference"} · ${posh ? "POSH complaint" : "Grievance"} · received ${formatDisplayDate(g.received_on)}` : undefined}
      leading={g && <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${posh ? "bg-rose-50 text-rose-600" : "bg-primary-soft text-primary"}`}>{posh ? <Lock size={18} strokeWidth={1.4} /> : <MessageSquare size={18} strokeWidth={1.4} />}</span>}
      headerActions={g && <Badge tone={STATUS_TONE[g.status] ?? "neutral"} dot>{me.statuses[g.status] ?? g.status_label}</Badge>}>
      {!g ? (
        <div className="space-y-3 p-6"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
      ) : (
        <div className="grid min-h-[60vh] grid-cols-1 lg:grid-cols-[1fr_320px]">
          {/* Conversation */}
          <div className="flex min-w-0 flex-col border-line lg:border-r">
            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div className="rounded-2xl border border-line bg-sunken/40 px-5 py-4">
                <div className="mb-2 flex items-center gap-2 text-[12.5px] text-muted">
                  <Avatar name={g.complainant_name || "Anonymous"} size={22} />
                  <span>{g.anonymous ? "Anonymous complainant" : g.complainant_name || "Complainant"}</span>
                  <span className="text-faint">· {formatDateTime(g.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink">{g.description}</p>
                <AttachmentList items={g.attachments} className="mt-3" />
              </div>
              {(g.messages ?? []).map((m) => {
                if (m.kind === "event") return (
                  <p key={m.uuid} className="flex items-center justify-center gap-2 text-center text-[12px] text-faint">
                    <CircleDot size={11} strokeWidth={1.4} />{m.body}<span>· {formatDateTime(m.created_at)}</span>
                  </p>
                );
                const mine = handler ? !m.from_complainant : m.from_complainant;
                const note = m.kind === "note";
                return (
                  <div key={m.uuid} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${note ? "border border-amber-200 bg-amber-50/70" : mine ? "bg-primary text-white" : "border border-line bg-surface"}`}>
                      <p className={`mb-1 flex items-center gap-1.5 text-[11.5px] ${note ? "text-amber-700" : mine ? "text-white/70" : "text-faint"}`}>
                        {note && <Lock size={11} strokeWidth={1.6} />}
                        {note ? "Committee only · " : ""}{m.from_complainant ? (g.anonymous ? "Complainant" : g.complainant_name || "Complainant") : (m.author || "Committee")} · {formatDateTime(m.created_at)}
                      </p>
                      <p className={`whitespace-pre-wrap text-[14px] leading-relaxed ${note ? "text-ink" : ""}`}>{m.body}</p>
                      <AttachmentList items={m.attachments} className="mt-2" />
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>
            {!closed && (
              <div className={`border-t px-5 py-4 ${kind === "note" ? "border-amber-200 bg-amber-50/40" : "border-line"}`}>
                {handler && (
                  <div className="mb-2 inline-flex rounded-lg border border-line bg-surface p-0.5 text-[12.5px]">
                    {(["reply", "note"] as const).map((k) => (
                      <button key={k} type="button" onClick={() => setKind(k)}
                        className={`flex items-center gap-1.5 rounded-md px-3 py-1 transition-colors ${kind === k ? (k === "note" ? "bg-amber-100 text-amber-800" : "bg-primary-soft text-primary") : "text-muted hover:text-ink"}`}>
                        {k === "note" ? <Lock size={12} strokeWidth={1.5} /> : <MessageSquare size={12} strokeWidth={1.5} />}
                        {k === "note" ? "Confidential note" : "Reply to complainant"}
                      </button>
                    ))}
                  </div>
                )}
                <Textarea rows={2} autoGrow maxRows={8} value={body} onValueChange={setBody}
                  placeholder={kind === "note" ? "Only committee members will see this" : handler ? "Write to the complainant" : "Add information for the committee"} />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <AttachmentPicker value={files} onChange={setFiles} compact />
                  <Button variant="primary" icon={Send} onClick={send} loading={sending} disabled={!body.trim() && !files.length}>
                    {kind === "note" ? "Add note" : "Send"}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Side panel */}
          <aside className="space-y-6 bg-sunken/30 px-5 py-5">
            {handler && availableActions(g).length > 0 && (
              <div>
                <p className="mb-2 text-[12px] uppercase tracking-[0.06em] text-faint">Actions</p>
                <div className="flex flex-wrap gap-2">
                  {availableActions(g).map((k) => {
                    const A = ACTIONS[k];
                    return <Button key={k} size="sm" variant={k === availableActions(g)[0] ? "primary" : "secondary"} icon={A.icon} onClick={() => setAction(k)}>{A.label}</Button>;
                  })}
                </div>
              </div>
            )}
            {handler && g.late_filing && (
              <p className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] ${g.delay_condoned ? "border-line text-muted" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                <AlertTriangle size={14} strokeWidth={1.4} className="mt-0.5 shrink-0" />
                {g.delay_condoned ? `Filed late; delay accepted: ${g.delay_reason}` : "Filed after the time limit. Accept the delay with reasons, or don't take it up."}
              </p>
            )}
            {handler && g.timeline && (
              <div>
                <p className="mb-3 text-[12px] uppercase tracking-[0.06em] text-faint">{posh ? "Legal timeline" : "Timeline"}</p>
                <Timeline items={g.timeline.map((s: TimelineStep) => ({
                  id: s.key, title: s.label, tone: stepTone(s.state),
                  icon: s.state === "done" ? CheckCircle2 : s.state === "overdue" ? AlarmClock : undefined,
                  time: s.state === "done" || s.state === "late" ? formatDisplayDate(s.done_on) : s.due_on ? `by ${formatDisplayDate(s.due_on)}` : "",
                  description: s.note || (s.state === "overdue" ? <span className="text-rose-600">Overdue</span> : s.state === "due_soon" ? <span className="text-amber-700">Due soon</span> : undefined),
                }))} />
              </div>
            )}
            <KeyValue columns={1} items={[
              ...(g.category_name ? [{ label: "Category", value: g.category_name }] : []),
              { label: "Incident", value: [g.incident_date ? formatDisplayDate(g.incident_date) : null, g.incident_location].filter(Boolean).join(" · ") || null },
              ...(posh ? [{ label: "Person complained against", value: g.respondent_name }, { label: "Witnesses", value: g.witnesses }] : []),
              ...(handler ? [{ label: "Assigned to", value: g.assigned_to_name }] : []),
              ...(g.interim_relief ? [{ label: "Interim relief", value: g.interim_relief }] : []),
              ...(g.outcome ? [{ label: "Finding", value: me.outcomes[g.outcome] ?? g.outcome_label }] : []),
              ...(g.outcome_summary ? [{ label: "Summary", value: g.outcome_summary }] : []),
              ...(g.action_taken ? [{ label: "Action taken", value: g.action_taken }] : []),
            ]} />
            {g.is_complainant && OPEN_STATUSES.includes(g.status) && (
              <Button size="sm" variant="ghost" onClick={withdraw}>Withdraw my case</Button>
            )}
          </aside>
        </div>
      )}
      <ActionModal grievance={g} action={action} me={me} onClose={() => setAction(null)}
        onDone={(next) => { setG(next); setAction(null); onChanged(); }} />
    </Modal>
  );
}

function ActionModal({ grievance: g, action, me, onClose, onDone }: {
  grievance: Grievance | null; action: ActionKey | null; me: GrievanceMe; onClose: () => void; onDone: (g: Grievance) => void;
}) {
  const toast = useToast();
  const [on, setOn] = useState(todayISO());
  const [text, setText] = useState("");
  const [text2, setText2] = useState("");
  const [outcome, setOutcome] = useState<string | null>(null);
  const [emp, setEmp] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setOn(todayISO()); setText(""); setText2(""); setOutcome(null); setEmp(g?.assigned_to_employee_id ?? null); }, [action, g?.assigned_to_employee_id]);
  if (!action || !g) return <Modal open={false} onClose={onClose} />;
  const A = ACTIONS[action];
  const dated = !["condone_delay", "close", "reject", "assign"].includes(action);
  const outcomes = Object.entries(me.outcomes).filter(([k]) => !["withdrawn", "settled"].includes(k)).map(([value, label]) => ({ value, label }));
  const members = (g.committee?.members ?? []).filter((m) => m.employee_id).map((m) => ({ value: m.employee_id as number, label: m.name || "", description: m.role_label }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { action, on: dated ? on : null };
    if (action === "condone_delay" || action === "reject") body.reason = text;
    if (action === "start_inquiry") body.interim_relief = text || null;
    if (action === "conciliation") body.summary = text || null;
    if (action === "submit_report") { body.outcome = outcome; body.summary = text; }
    if (action === "record_action") body.action_taken = text;
    if (action === "resolve") { body.outcome = outcome; body.summary = text; body.action_taken = text2; }
    if (action === "assign") body.employee_id = emp;
    setSaving(true);
    try {
      onDone(await api.post<Grievance>(`/grievances/${g!.uuid}/actions`, body));
      toast.success("Saved");
    } catch (err) { toast.error("Couldn't save", { description: err instanceof Error ? err.message : undefined }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open onClose={onClose} size="sm" busy={saving} title={A.title} description={A.hint}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="g-action" loading={saving}>{A.label}</Button></>}>
      <form id="g-action" onSubmit={submit} className="space-y-4" noValidate>
        {dated && <Field label="Date"><DateInput value={on} onChange={setOn} max={todayISO()} /></Field>}
        {(action === "submit_report" || action === "resolve") && (
          <Field label="Finding" required><Select value={outcome} onChange={(v) => setOutcome(v)} options={outcomes} placeholder="Pick the finding" /></Field>
        )}
        {action === "assign" && (
          <Field label="Committee member" required><Select value={emp} onChange={(v) => setEmp(v)} options={members} placeholder="Pick a member" /></Field>
        )}
        {action === "condone_delay" && <Field label="Why the delay is accepted" required><Textarea rows={3} value={text} onValueChange={setText} /></Field>}
        {action === "reject" && <Field label="Reason" required><Textarea rows={3} value={text} onValueChange={setText} /></Field>}
        {action === "start_inquiry" && <Field label="Interim relief" aside="Optional" hint="E.g. transfer or leave for the complainant during the inquiry"><TextInput value={text} onValueChange={setText} /></Field>}
        {action === "conciliation" && <Field label="Terms of settlement" aside="Optional"><Textarea rows={3} value={text} onValueChange={setText} /></Field>}
        {(action === "submit_report" || action === "resolve") && <Field label="Summary"><Textarea rows={4} value={text} onValueChange={setText} /></Field>}
        {action === "resolve" && <Field label="Action taken" aside="Optional"><Textarea rows={2} value={text2} onValueChange={setText2} /></Field>}
        {action === "record_action" && <Field label="Action taken by the employer" required><Textarea rows={4} value={text} onValueChange={setText} /></Field>}
        {action === "close" && <p className="text-[13.5px] text-muted">The case will be closed. The complainant can still read it.</p>}
      </form>
    </Modal>
  );
}
