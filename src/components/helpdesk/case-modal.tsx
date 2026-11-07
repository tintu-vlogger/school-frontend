"use client";

/*
 * Case conversation: a chat-style thread (requester on the left, agents on the right,
 * internal notes in amber, history as small centred lines) with a composer, and a side
 * panel with status, assignee, priority, SLA targets and the requester.
 *   <CaseModal uuid={uuid} me={me} open onClose={...} onChanged={refresh} />
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  AlarmClock, ArrowUpRight, CheckCircle2, Hand, Lock, MessageSquareText, RotateCcw, Send, Star, StickyNote, Timer, Undo2,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, formatRelative } from "@/lib/datetime";
import {
  Avatar, Badge, Button, Menu, Modal, Select, Skeleton, Textarea, useConfirm, type SelectOption,
} from "@/components/ui-kit";
import { AttachmentList, AttachmentPicker } from "@/components/workplace/attachments";
import type { FileRef } from "@/components/workplace/files";
import { PRIORITY_LABEL, durationLabel } from "@/components/workplace/pickers";
import { PriorityBadge, StatusBadge, type CaseDetail, type HelpdeskMe, type Message, type SlaPart } from "./types";
import { CustomFields, customFieldErrors, hasCustomFields, useCustomFieldLayout, type CustomValues } from "@/components/custom-fields";

const S = 1.4;
const ACTION_LABEL: Record<string, string> = { open: "Mark open", in_progress: "Start", waiting: "Wait on employee", resolved: "Resolve", closed: "Close" };

type Canned = { uuid: string; title: string; body: string; category_id: number | null };

function SlaLine({ label, part }: { label: string; part: SlaPart }) {
  if (part.state === "none") return null;
  const tone = part.state === "breached" ? "text-rose-600" : part.state === "met" ? "text-emerald-700"
    : part.state === "due_soon" ? "text-amber-700" : "text-muted";
  const Icon = part.state === "breached" ? AlarmClock : part.state === "met" ? CheckCircle2 : Timer;
  const text = part.state === "met" ? "Met" : part.state === "breached" ? `Late by ${durationLabel(part.late_by_minutes)}`
    : part.state === "paused" ? "Paused while waiting" : `Due in ${durationLabel(part.minutes_left)}`;
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="text-right">
        <span className={`inline-flex items-center gap-1 text-[13px] ${tone}`}><Icon size={13} strokeWidth={S} />{text}</span>
        {part.due_at && <span className="block text-[11.5px] text-faint">{formatDateTime(part.due_at)}</span>}
      </span>
    </div>
  );
}

function Bubble({ m, mine }: { m: Message; mine: boolean }) {
  if (m.kind === "event") {
    return (
      <div className="flex justify-center py-1">
        <span className="max-w-[85%] text-center text-[12px] text-faint">{m.body} · {formatRelative(m.created_at)}</span>
      </div>
    );
  }
  const note = m.kind === "note";
  const right = !m.from_requester;
  return (
    <div className={`flex gap-2.5 ${right ? "flex-row-reverse" : ""}`}>
      <Avatar name={m.author_name || "?"} size={28} />
      <div className={`min-w-0 max-w-[78%] ${right ? "items-end text-right" : ""} flex flex-col`}>
        <div className={`mb-1 flex items-center gap-1.5 text-[12px] text-faint ${right ? "flex-row-reverse" : ""}`}>
          <span className="text-muted">{mine ? "You" : m.author_name}</span>
          <span title={formatDateTime(m.created_at)}>{formatRelative(m.created_at)}</span>
          {note && <span className="inline-flex items-center gap-1 text-amber-700"><Lock size={11} strokeWidth={S} />Only agents see this</span>}
        </div>
        <div className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-left text-[14px] leading-relaxed ${
          note ? "border border-amber-200 bg-amber-50/80 text-amber-950"
            : right ? "rounded-tr-md bg-primary-soft/70 text-ink" : "rounded-tl-md border border-line bg-surface text-ink"}`}>
          {m.body}
        </div>
        {m.attachments?.length > 0 && <AttachmentList items={m.attachments} className={`mt-1.5 ${right ? "justify-end" : ""}`} />}
      </div>
    </div>
  );
}

function Rating({ me, onRate }: { me: HelpdeskMe; onRate: (rating: number, comment: string) => Promise<void> }) {
  const scale = me.settings.rating_scale;
  const labels = me.settings.rating_labels[String(scale)] ?? [];
  const [value, setValue] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-2xl border border-primary/20 bg-primary-soft/30 p-4">
      <p className="text-[14px] text-ink">How did we do?</p>
      <p className="text-[12.5px] text-muted">Your rating goes to the help desk team.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {labels.map((l, i) => (
          <button key={l} type="button" onClick={() => setValue(i + 1)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors ${
              value === i + 1 ? "border-primary bg-primary text-white" : "border-line bg-surface text-ink hover:border-line-strong"}`}>
            {scale === 5 && <Star size={13} strokeWidth={S} className={value !== null && i < value ? "fill-current" : ""} />}
            {l}
          </button>
        ))}
      </div>
      {value !== null && (
        <div className="mt-3 space-y-2">
          <Textarea value={comment} onValueChange={setComment} rows={2} placeholder="Anything to add? (optional)" />
          <Button variant="primary" size="sm" loading={busy} onClick={async () => { setBusy(true); try { await onRate(value, comment); } finally { setBusy(false); } }}>Send rating</Button>
        </div>
      )}
    </div>
  );
}

export function CaseModal({ uuid, me, open, onClose, onChanged }: {
  uuid: string | null; me: HelpdeskMe; open: boolean; onClose: () => void; onChanged?: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [c, setC] = useState<CaseDetail | null>(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"reply" | "note">("reply");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<FileRef[]>([]);
  const [sending, setSending] = useState(false);
  const [canned, setCanned] = useState<Canned[] | null>(null);
  const [thanks, setThanks] = useState("");
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!uuid) return;
    try { setC(await api.get<CaseDetail>(`/helpdesk/cases/${uuid}`)); setError(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Couldn't open the case"); }
  }, [uuid]);

  useEffect(() => {
    if (!open || !uuid) return;
    setC(null); setBody(""); setFiles([]); setKind("reply"); setThanks(""); setReopening(false); setReason("");
    load();
  }, [open, uuid, load]);

  useEffect(() => {
    if (!open || !c?.can_handle || canned) return;
    api.get<{ items: Canned[] }>(`/helpdesk/canned`).then((r) => setCanned(r.items)).catch(() => setCanned([]));
  }, [open, c?.can_handle, canned]);

  useLayoutEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [c?.messages.length]);

  const apply = (next: CaseDetail) => { setC(next); onChanged?.(); };

  async function run<T>(fn: () => Promise<T>, ok?: string) {
    try { const r = await fn(); if (ok) toast.success(ok); return r; }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); return null; }
  }

  async function send() {
    if (!c || (!body.trim() && !files.length)) return;
    setSending(true);
    const r = await run(() => api.post<CaseDetail>(`/helpdesk/cases/${c.uuid}/messages`, { kind, body, attachments: files.map((f) => f.uuid) }));
    setSending(false);
    if (r) { apply(r); setBody(""); setFiles([]); }
  }

  async function setStatus(status: string) {
    if (!c) return;
    let note: string | undefined;
    if (status === "resolved" && body.trim() && kind === "reply") { note = body; }
    if (status === "cancelled" && !(await confirm({ title: "Withdraw this case?", message: "The help desk stops working on it.", confirmLabel: "Withdraw", tone: "danger" }))) return;
    const r = await run(() => api.post<CaseDetail>(`/helpdesk/cases/${c.uuid}/status`, { status, note }), `Marked ${me.statuses[status]?.toLowerCase() ?? status}`);
    if (r) { apply(r); if (note) setBody(""); }
  }

  const fillCanned = (t: Canned) => {
    if (!c) return;
    const text = t.body
      .replaceAll("{{requester.first_name}}", (c.requester.name || "").split(" ")[0] || "there")
      .replaceAll("{{case.reference_no}}", c.reference_no || "")
      .replaceAll("{{agent.name}}", "");
    setKind("reply");
    setBody((b) => (b.trim() ? `${b.trim()}\n\n${text}` : text));
  };

  const staff = !!c?.can_handle;
  const meId = me.employee_id;
  const agentOptions: SelectOption<number>[] = (c?.agents ?? []).map((a) => ({ value: a.employee_id, label: a.name || "Agent" }));
  if (c?.assignee_employee_id && !agentOptions.some((o) => o.value === c.assignee_employee_id)) {
    agentOptions.unshift({ value: c.assignee_employee_id, label: c.assignee_name || "Current agent" });
  }

  const composer = c && (c.can_reply ? (
    <div className="w-full space-y-2">
      {staff && (
        <div className="flex items-center gap-1">
          {(["reply", "note"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] transition-colors ${
                kind === k ? (k === "note" ? "bg-amber-100 text-amber-800" : "bg-primary-soft text-primary") : "text-muted hover:bg-sunken"}`}>
              {k === "note" ? <StickyNote size={13} strokeWidth={S} /> : <MessageSquareText size={13} strokeWidth={S} />}
              {k === "note" ? "Internal note" : "Reply"}
            </button>
          ))}
          {canned && canned.length > 0 && (
            <Menu align="start" label="Saved replies" items={canned.filter((t) => !t.category_id || t.category_id === c.category_id).map((t) => ({ label: t.title, onSelect: () => fillCanned(t) }))}
              trigger={<span className="ml-1 inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] text-muted hover:bg-sunken"><ArrowUpRight size={13} strokeWidth={S} />Saved replies</span>} />
          )}
        </div>
      )}
      <div className={`rounded-xl border bg-surface transition-colors focus-within:border-primary/40 ${kind === "note" ? "border-amber-200 bg-amber-50/40" : "border-line"}`}>
        <Textarea value={body} onValueChange={setBody} rows={2} autoGrow maxRows={8} className="!border-0 !bg-transparent !shadow-none"
          placeholder={kind === "note" ? "Note for agents only" : staff ? "Write a reply to the employee" : "Write a message"}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line/70 px-2.5 py-2">
          <AttachmentPicker value={files} onChange={setFiles} compact />
          <Button variant="primary" size="sm" icon={Send} loading={sending} disabled={!body.trim() && !files.length} onClick={send}>
            {kind === "note" ? "Add note" : "Send"}
          </Button>
        </div>
      </div>
    </div>
  ) : <p className="w-full text-center text-[13px] text-muted">This case is closed. Reopen it to continue the conversation.</p>);

  return (
    <Modal open={open && !!uuid} onClose={onClose} size="xl" flush
      title={c ? c.subject : "Case"}
      description={c ? <span className="inline-flex flex-wrap items-center gap-2"><span className="font-mono text-[12.5px]">{c.reference_no}</span><span>·</span><span>{c.category_name}{c.subcategory_name ? ` › ${c.subcategory_name}` : ""}</span><span>·</span><span>Opened {formatRelative(c.created_at)}</span></span> : undefined}
      headerActions={c && <StatusBadge status={c.status} label={c.status_label} />}
      footerStart={composer}>
      {!c ? (
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_280px]">
          {error ? <p className="text-[14px] text-rose-600">{error}</p> : <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-3/4 rounded-2xl" />)}</div>}
        </div>
      ) : (
        <div className="grid min-h-full md:grid-cols-[1fr_288px]">
          <div className="min-w-0 space-y-4 bg-sunken/30 px-5 py-5 md:px-6">
            {/* Original request */}
            <div className="flex gap-2.5">
              <Avatar name={c.requester.name || "?"} src={c.requester.profile_image_url} size={28} />
              <div className="min-w-0 max-w-[78%]">
                <div className="mb-1 flex items-center gap-1.5 text-[12px] text-faint">
                  <span className="text-muted">{c.is_requester ? "You" : c.requester.name}</span>
                  <span title={formatDateTime(c.created_at)}>{formatRelative(c.created_at)}</span>
                  {c.raised_by_name && <span>· raised by {c.raised_by_name}</span>}
                </div>
                <div className="whitespace-pre-wrap break-words rounded-2xl rounded-tl-md border border-line bg-surface px-3.5 py-2.5 text-[14px] leading-relaxed text-ink">{c.description}</div>
                {c.attachments.length > 0 && <AttachmentList items={c.attachments} className="mt-1.5" />}
              </div>
            </div>
            {c.messages.filter((m, i) => !(i === 0 && m.kind === "event" && m.body.startsWith("Case raised"))).map((m) => (
              <Bubble key={m.uuid} m={m} mine={m.author_employee_id !== null && m.author_employee_id === meId} />
            ))}
            {thanks && <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-[13.5px] text-emerald-800">{thanks}</div>}
            {c.can_rate && !thanks && (
              <Rating me={me} onRate={async (rating, comment) => {
                const r = await run(() => api.post<{ reopened: boolean; message: string; case: CaseDetail }>(`/helpdesk/cases/${c.uuid}/rate`, { rating, comment }));
                if (r) { apply(r.case); setThanks(r.reopened ? "Sorry it wasn't sorted. We have reopened the case and will look at it again." : r.message); }
              }} />
            )}
            <div ref={endRef} />
          </div>

          <aside className="border-t border-line md:border-l md:border-t-0">
            <div className="space-y-5 p-5 md:sticky md:top-0">
              <div className="space-y-2">
                {staff ? (
                  <>
                    {c.allowed_statuses.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {c.allowed_statuses.filter((s) => s !== "cancelled").map((s) => (
                          <Button key={s} size="sm" variant={s === "resolved" ? "primary" : "secondary"}
                            icon={s === "resolved" ? CheckCircle2 : s === "in_progress" && ["resolved", "closed"].includes(c.status) ? RotateCcw : undefined}
                            onClick={() => setStatus(s)}>
                            {s === "in_progress" && ["resolved", "closed"].includes(c.status) ? "Reopen" : ACTION_LABEL[s] ?? me.statuses[s]}
                          </Button>
                        ))}
                      </div>
                    )}
                    {!c.assignee_employee_id && c.status !== "cancelled" && !["resolved", "closed"].includes(c.status) && meId && (
                      <Button size="sm" icon={Hand} className="w-full justify-center" onClick={async () => { const r = await run(() => api.post<CaseDetail>(`/helpdesk/cases/${c.uuid}/pick`), "Picked up"); if (r) apply(r); }}>Pick up</Button>
                    )}
                  </>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {c.allowed_statuses.includes("cancelled") && <Button size="sm" icon={Undo2} onClick={() => setStatus("cancelled")}>Withdraw</Button>}
                    {c.allowed_statuses.includes("closed") && <Button size="sm" icon={CheckCircle2} onClick={() => setStatus("closed")}>Close case</Button>}
                    {c.can_reopen && !reopening && <Button size="sm" icon={RotateCcw} onClick={() => setReopening(true)}>Reopen</Button>}
                  </div>
                )}
                {staff && c.can_reopen && ["closed"].includes(c.status) && !c.allowed_statuses.includes("in_progress") && (
                  <Button size="sm" icon={RotateCcw} onClick={() => setReopening(true)}>Reopen</Button>
                )}
                {reopening && (
                  <div className="space-y-2 rounded-xl border border-line p-3">
                    <Textarea value={reason} onValueChange={setReason} rows={2} placeholder="Why are you reopening it?" />
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" onClick={async () => {
                        const r = await run(() => api.post<CaseDetail>(`/helpdesk/cases/${c.uuid}/reopen`, { reason }), "Case reopened");
                        if (r) { apply(r); setReopening(false); setReason(""); }
                      }}>Reopen case</Button>
                      <Button size="sm" variant="ghost" onClick={() => setReopening(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>

              <dl className="divide-y divide-line/70 border-y border-line/70">
                {staff && (
                  <div className="py-2.5">
                    <dt className="mb-1.5 text-[11.5px] uppercase tracking-[0.06em] text-faint">Assigned to</dt>
                    <dd>
                      <Select value={c.assignee_employee_id} options={agentOptions} clearable placeholder="Nobody yet"
                        disabled={!["new", "open", "in_progress", "waiting"].includes(c.status)}
                        onChange={async (v) => { const r = await run(() => api.post<CaseDetail>(`/helpdesk/cases/${c.uuid}/assign`, { employee_id: v }), v ? "Assigned" : "Unassigned"); if (r) apply(r); }} />
                    </dd>
                  </div>
                )}
                {(staff || c.priority) && (
                  <div className="py-2.5">
                    <dt className="mb-1.5 text-[11.5px] uppercase tracking-[0.06em] text-faint">Priority</dt>
                    <dd>
                      {staff ? (
                        <Select value={c.priority} options={me.priorities.map((p) => ({ value: p, label: PRIORITY_LABEL[p] ?? p }))}
                          onChange={async (v) => { if (!v) return; const r = await run(() => api.put<CaseDetail>(`/helpdesk/cases/${c.uuid}`, { priority: v }), "Priority changed"); if (r) apply(r); }} />
                      ) : <PriorityBadge priority={c.priority} />}
                    </dd>
                  </div>
                )}
                {staff && c.sla && (
                  <div className="py-2">
                    <dt className="text-[11.5px] uppercase tracking-[0.06em] text-faint">Response targets</dt>
                    <dd><SlaLine label="First reply" part={c.sla.response} /><SlaLine label="Resolution" part={c.sla.resolution} /></dd>
                  </div>
                )}
                <div className="flex flex-wrap gap-x-4 gap-y-1 py-2.5 text-[12.5px] text-muted">
                  {c.case_type_name && <span>{c.case_type_name}</span>}
                  <span>Via {me.sources[c.source]?.toLowerCase() ?? c.source}</span>
                  {c.location_name && <span>{c.location_name}</span>}
                  {c.escalation_level > 0 && <Badge tone="bad">Escalated{c.escalation_level > 1 ? ` ×${c.escalation_level}` : ""}</Badge>}
                  {c.reopened_count > 0 && <span>Reopened {c.reopened_count}×</span>}
                  {c.rating && <span className="inline-flex items-center gap-1"><Star size={12} strokeWidth={S} className="fill-current text-amber-500" />{c.rating} of {me.settings.rating_scale}</span>}
                </div>
              </dl>

              <div>
                <p className="mb-2 text-[11.5px] uppercase tracking-[0.06em] text-faint">Requester</p>
                <div className="flex items-center gap-3">
                  <Avatar name={c.requester.name || "?"} src={c.requester.profile_image_url} size={38} />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] text-ink">{c.requester.name}</p>
                    <p className="truncate text-[12.5px] text-muted">{[c.requester.employee_code, c.requester.department].filter(Boolean).join(" · ") || c.requester.email}</p>
                  </div>
                </div>
              </div>
              <CaseCustomDetails c={c} staff={staff} onSaved={apply} />
              {staff && c.allowed_statuses.includes("cancelled") && (
                <button type="button" onClick={() => setStatus("cancelled")} className="text-[12.5px] text-faint hover:text-rose-600">Cancel this case</button>
              )}
            </div>
          </aside>
        </div>
      )}
    </Modal>
  );
}

/** The case's custom fields (Settings > Custom fields > Help desk case): shown to everyone
 *  who can see the case (the requester only sees fields meant for employees); agents edit them. */
function CaseCustomDetails({ c, staff, onSaved }: { c: CaseDetail; staff: boolean; onSaved: (next: CaseDetail) => void }) {
  const toast = useToast();
  const { layout } = useCustomFieldLayout("helpdesk_case");
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<CustomValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  if (!hasCustomFields(layout)) return null;
  const audience = staff ? "hr" : "employee";

  async function save() {
    const e = customFieldErrors(layout, values);
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    try {
      const next = await api.put<CaseDetail>(`/helpdesk/cases/${c.uuid}`, { custom: values });
      toast.success("Details saved");
      setEditing(false);
      onSaved(next);
    } catch (err) {
      toast.error("Couldn't save the details", { description: err instanceof Error ? err.message : undefined });
    } finally { setSaving(false); }
  }

  return (
    <div className="[&_section]:px-0 [&_section]:py-3">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11.5px] uppercase tracking-[0.06em] text-faint">Other details</p>
        {staff && !editing && <Button size="sm" variant="ghost" onClick={() => { setValues({ ...(c.custom || {}) }); setErrors({}); setEditing(true); }}>Edit</Button>}
      </div>
      {editing ? (
        <div className="space-y-3 [&_.grid]:!grid-cols-1">
          <CustomFields entity="helpdesk_case" layout={layout} values={values} onChange={(x) => { setValues(x); setErrors({}); }} errors={errors} />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" loading={saving} onClick={save}>Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="[&_dl]:!grid-cols-1"><CustomFields entity="helpdesk_case" mode="view" layout={layout} audience={audience} values={c.custom} emptyText="Nothing filled in yet." /></div>
      )}
    </div>
  );
}
