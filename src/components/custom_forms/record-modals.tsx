"use client";

/*
 * Modals for custom service records.
 *   <SubmitModal code="id_card_request" open onClose onSaved />          new request (or save as draft)
 *   <RecordModal uuid={uuid} onClose onChanged />                        details, activity, approval, actions
 * Editing (a draft by its owner, or HR fields by the people who handle the service) opens
 * EditRecordModal from the details modal.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRightLeft, CheckCircle2, CircleDot, FilePen, MessageSquare, Paperclip, Pencil, Send, Trash2, Undo2, XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/datetime";
import { fileHref, uploadFile } from "@/components/workplace/files";
import {
  Badge, Button, Field, FileDrop, Modal, ModalCancel, Select, Skeleton, Tabs, Textarea, Timeline, useConfirm,
  useToast, type TimelineItem,
} from "@/components/ui-kit";
import { FormRenderer, ValuesView, toPayload } from "./form-renderer";
import { serviceIcon } from "./icons";
import type { FileRef, RecordDetail, ServiceDefinition, Values } from "./types";

const STROKE = 1.4;

function errText(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

/* ── New request ──────────────────────────────────────────────────── */

export function SubmitModal({ code, open, onClose, onSaved }: {
  code: string; open: boolean; onClose: () => void; onSaved: (r: RecordDetail) => void;
}) {
  const toast = useToast();
  const [svc, setSvc] = useState<ServiceDefinition | null>(null);
  const [values, setValues] = useState<Values>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<"" | "submit" | "draft">("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSvc(null); setError(""); setDirty(false);
    api.get<ServiceDefinition>(`/custom-forms/services/${code}/definition`)
      .then((d) => { setSvc(d); setValues(d.defaults ?? {}); })
      .catch((e) => setError(errText(e)));
  }, [open, code]);

  async function save(draft: boolean) {
    if (!svc) return;
    setBusy(draft ? "draft" : "submit"); setError("");
    try {
      const r = await api.post<RecordDetail>(`/custom-forms/services/${code}/records`, { values: toPayload(svc.definition, values), draft });
      toast.success(draft ? "Saved as a draft" : svc.needs_approval ? "Sent for approval" : "Submitted", { description: r.reference_no ?? undefined });
      onSaved(r);
    } catch (e) { setError(errText(e)); }
    finally { setBusy(""); }
  }

  const Icon = serviceIcon(svc?.icon);
  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={!!busy}
      leading={<span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary"><Icon size={18} strokeWidth={STROKE} /></span>}
      title={svc?.name ?? "New request"} description={svc?.description ?? undefined}
      footer={<>
        {error && <p className="mr-auto max-w-[60%] text-[13px] text-rose-600">{error}</p>}
        <ModalCancel />
        {svc?.allow_drafts && <Button onClick={() => save(true)} loading={busy === "draft"} disabled={!svc || !!busy} icon={FilePen}>Save draft</Button>}
        <Button variant="primary" onClick={() => save(false)} loading={busy === "submit"} disabled={!svc || !!busy || !svc.can_submit} icon={Send}>
          {svc?.needs_approval ? "Send for approval" : "Submit"}
        </Button>
      </>}>
      {!svc ? (error ? <p className="text-[14px] text-rose-600">{error}</p> : <div className="space-y-4"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-24" /></div>) : (
        <FormRenderer code={code} definition={svc.definition} values={values} labels={svc.labels}
          onChange={(v) => { setValues(v); setDirty(true); }} />
      )}
    </Modal>
  );
}

/* ── Edit ─────────────────────────────────────────────────────────── */

function EditRecordModal({ record, onClose, onSaved }: { record: RecordDetail; onClose: () => void; onSaved: (r: RecordDetail) => void }) {
  const toast = useToast();
  const [values, setValues] = useState<Values>(() => {
    const v: Values = { ...record.values };
    for (const [k, files] of Object.entries(record.files ?? {})) v[k] = files;
    return v;
  });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true); setError("");
    try {
      const r = await api.put<RecordDetail>(`/custom-forms/records/${record.uuid}`, { values: toPayload(record.definition, values) });
      toast.success("Saved");
      onSaved(r);
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} size="lg" dirty={dirty} busy={busy} title={`Edit ${record.reference_no ?? "draft"}`}
      description={record.status === "draft" ? "Your draft. Submit it from the details when it is ready." : "Fields you may change are open; the rest are shown for reference."}
      footer={<>{error && <p className="mr-auto max-w-[60%] text-[13px] text-rose-600">{error}</p>}<ModalCancel /><Button variant="primary" onClick={save} loading={busy}>Save changes</Button></>}>
      <FormRenderer code={record.service.code} definition={record.definition} values={values} labels={record.labels}
        files={record.files} recordUuid={record.status === "draft" ? null : record.uuid} onChange={(v) => { setValues(v); setDirty(true); }} />
    </Modal>
  );
}

/* ── Details ──────────────────────────────────────────────────────── */

export function RecordModal({ uuid, onClose, onChanged }: { uuid: string | null; onClose: () => void; onChanged?: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rec, setRec] = useState<RecordDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"details" | "activity" | "approval">("details");
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!uuid) return;
    api.get<RecordDetail>(`/custom-forms/records/${uuid}`).then(setRec).catch((e) => setError(errText(e)));
  }, [uuid]);
  useEffect(() => { setRec(null); setError(""); setTab("details"); load(); }, [load]);

  const changed = (r: RecordDetail) => { setRec(r); onChanged?.(); };

  async function act(fn: () => Promise<RecordDetail | void>, ok: string) {
    setBusy(true);
    try { const r = await fn(); if (r) changed(r); else onChanged?.(); toast.success(ok); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }

  async function withdraw() {
    if (!rec) return;
    const ok = await confirm({ title: "Withdraw this request?", message: rec.status === "pending" ? "Its approval stops and the approvers are told." : "It is closed and kept for the record.", confirmLabel: "Withdraw", tone: "danger" });
    if (ok) act(() => api.post<RecordDetail>(`/custom-forms/records/${rec.uuid}/cancel`, { reason: null }), "Withdrawn");
  }
  async function removeDraft() {
    if (!rec) return;
    if (!(await confirm({ title: "Delete this draft?", message: "It hasn't been sent, so it is removed for good.", confirmLabel: "Delete", tone: "danger" }))) return;
    setBusy(true);
    try { await api.delete(`/custom-forms/records/${rec.uuid}`); toast.success("Draft deleted"); onChanged?.(); onClose(); }
    catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }

  const Icon = serviceIcon(rec?.service.icon);
  const comments = rec?.activity.filter((a) => a.kind === "comment").length ?? 0;
  return (
    <>
      <Modal open={!!uuid} onClose={onClose} size="lg" busy={busy}
        leading={<span className="grid h-9 w-9 place-items-center rounded-lg bg-primary-soft text-primary"><Icon size={18} strokeWidth={STROKE} /></span>}
        title={rec ? (rec.title ?? rec.service.name) : "Request"}
        description={rec ? <span className="flex flex-wrap items-center gap-2">
          <span>{rec.reference_no ?? "Draft"}</span><span className="text-faint">·</span><span>{rec.requester_name}</span>
          {rec.submitted_at && <><span className="text-faint">·</span><span>{formatDateTime(rec.submitted_at)}</span></>}
        </span> : undefined}
        headerActions={rec ? <Badge tone={rec.status_tone} dot>{rec.status_label}</Badge> : undefined}
        footer={rec ? <>
          {rec.can_delete && <Button variant="ghost" icon={Trash2} onClick={removeDraft} className="mr-auto">Delete draft</Button>}
          {rec.can_cancel && !rec.can_delete && <Button variant="ghost" icon={Undo2} onClick={withdraw} className="mr-auto">Withdraw</Button>}
          {rec.can_edit && <Button icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>}
          {rec.can_change_status && <Button icon={ArrowRightLeft} onClick={() => setMoving(true)}>Change status</Button>}
          {rec.can_submit && <Button variant="primary" icon={Send} loading={busy}
            onClick={() => act(() => api.post<RecordDetail>(`/custom-forms/records/${rec.uuid}/submit`), rec.service.needs_approval ? "Sent for approval" : "Submitted")}>
            {rec.service.needs_approval ? "Send for approval" : "Submit"}</Button>}
          {!rec.can_submit && <ModalCancel>Close</ModalCancel>}
        </> : undefined}>
        {!rec ? (error ? <p className="text-[14px] text-rose-600">{error}</p> : <div className="space-y-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-24" /></div>) : (
          <>
            <Tabs value={tab} onChange={setTab} className="mb-5" items={[
              { value: "details", label: "Details" },
              { value: "activity", label: "Activity", count: comments || undefined },
              ...(rec.approval ? [{ value: "approval" as const, label: "Approval" }] : []),
            ]} />
            {tab === "details" && (
              <>
                {!rec.version_is_current && <p className="mb-4 rounded-lg bg-sunken px-3 py-2 text-[12.5px] text-muted">Filled in on an earlier version of this form (version {rec.version}); it is shown as it was sent.</p>}
                <ValuesView definition={rec.definition} values={rec.values} labels={rec.labels} files={rec.files} />
              </>
            )}
            {tab === "activity" && <ActivityPanel rec={rec} onChanged={changed} />}
            {tab === "approval" && rec.approval && <ApprovalPanel rec={rec} />}
          </>
        )}
      </Modal>
      {editing && rec && <EditRecordModal record={rec} onClose={() => setEditing(false)} onSaved={(r) => { setEditing(false); changed(r); }} />}
      {moving && rec && <StatusModal rec={rec} onClose={() => setMoving(false)} onSaved={(r) => { setMoving(false); changed(r); }} />}
    </>
  );
}

function StatusModal({ rec, onClose, onSaved }: { rec: RecordDetail; onClose: () => void; onSaved: (r: RecordDetail) => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!status) { setError("Pick a status"); return; }
    setBusy(true);
    try { onSaved(await api.post<RecordDetail>(`/custom-forms/records/${rec.uuid}/status`, { status, note: note || null })); }
    catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open onClose={onClose} size="sm" busy={busy} title="Change status" description={`Now: ${rec.status_label}. The requester is told.`}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="New status" required error={error}>
          <Select value={status} onChange={(x) => { setStatus(x); setError(""); }}
            options={rec.statuses.filter((s) => s.key !== rec.status).map((s) => ({ value: s.key, label: s.closed ? `${s.label} (final)` : s.label }))} />
        </Field>
        <Field label="Note" hint="Optional. Shown in the activity."><Textarea value={note} onValueChange={setNote} rows={3} /></Field>
      </div>
    </Modal>
  );
}

function ActivityPanel({ rec, onChanged }: { rec: RecordDetail; onChanged: (r: RecordDetail) => void }) {
  const toast = useToast();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [showFiles, setShowFiles] = useState(false);
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!body.trim() && !files.length) return;
    setBusy(true);
    try {
      const refs: FileRef[] = [];
      for (const f of files) refs.push(await uploadFile(f));
      const activity = await api.post<RecordDetail["activity"]>(`/custom-forms/records/${rec.uuid}/comments`, { body, attachment_uuids: refs.map((r) => r.uuid) });
      onChanged({ ...rec, activity });
      setBody(""); setFiles([]); setShowFiles(false);
    } catch (e) { toast.error(errText(e)); } finally { setBusy(false); }
  }
  const items: TimelineItem[] = [...rec.activity].reverse().map((a) => {
    const icon = a.kind === "comment" ? MessageSquare : a.kind === "edit" ? Pencil : a.data.to === "rejected" ? XCircle : a.kind === "status" ? CheckCircle2 : CircleDot;
    const tone: TimelineItem["tone"] = a.data.to === "rejected" ? "bad" : a.kind === "status" ? "accent" : "neutral";
    const title = a.kind === "status"
      ? <span>{a.data.to_label ? <>Status: <span className="text-ink">{a.data.to_label}</span></> : (a.body ?? "Status changed")}</span>
      : a.kind === "edit" ? (a.body ?? "Changed") : a.kind === "comment" ? <span>{a.author_name}</span> : (a.body ?? "Created");
    return {
      id: a.uuid, icon, tone, title,
      time: <span title={formatDateTime(a.created_at)}>{a.kind !== "comment" && a.author_name ? `${a.author_name} · ` : ""}{formatRelative(a.created_at)}</span>,
      description: (a.kind === "comment" || (a.kind === "status" && a.body && a.data.to_label)) ? (
        <div className="space-y-1.5">
          {a.body && <p className="whitespace-pre-wrap text-[13.5px] text-ink/90">{a.body}</p>}
          {a.attachments.map((f) => <a key={f.uuid} href={fileHref(f.url)} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[13px] text-primary hover:underline"><Paperclip size={13} strokeWidth={STROKE} />{f.name}</a>)}
        </div>
      ) : undefined,
    };
  });
  return (
    <div className="space-y-5">
      {rec.can_comment && (
        <div className="rounded-lg border border-line p-3">
          <Textarea value={body} onValueChange={setBody} rows={2} autoGrow placeholder="Write a comment…" className="border-0 px-0 shadow-none" />
          {showFiles && <FileDrop className="mt-2" value={files} onChange={setFiles} multiple maxFiles={5} maxSizeMb={10} />}
          <div className="mt-2 flex items-center justify-between">
            <button type="button" onClick={() => setShowFiles((x) => !x)} className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"><Paperclip size={14} strokeWidth={STROKE} /> Attach files</button>
            <Button size="sm" variant="primary" onClick={send} loading={busy} disabled={!body.trim() && !files.length}>Comment</Button>
          </div>
        </div>
      )}
      {items.length ? <Timeline items={items} /> : <p className="text-[13.5px] text-faint">No activity yet.</p>}
    </div>
  );
}

const STEP_WORDS: Record<string, string> = { pending: "Waiting", approved: "Approved", rejected: "Rejected", cancelled: "Withdrawn", skipped: "Skipped", reassigned: "Passed on", escalated: "Escalated" };

function ApprovalPanel({ rec }: { rec: RecordDetail }) {
  const a = rec.approval!;
  const tone = (s: string): TimelineItem["tone"] => (s === "approved" ? "good" : s === "rejected" ? "bad" : s === "pending" ? "warn" : "neutral");
  return (
    <div className="space-y-4">
      <p className="text-[13.5px] text-muted">Approval {a.reference_no ? <span className="text-ink">{a.reference_no}</span> : null} is <span className="text-ink">{(STEP_WORDS[a.status] ?? a.status).toLowerCase()}</span>.
        {a.result_note ? ` ${a.result_note}` : ""} Approvers decide from their Approvals inbox.</p>
      {a.tasks.length ? (
        <Timeline items={a.tasks.map((t, i) => ({
          id: i, tone: tone(t.status), icon: t.status === "approved" ? CheckCircle2 : t.status === "rejected" ? XCircle : CircleDot,
          title: <span>{t.step_name}: <span className="text-ink">{t.approver_name ?? "—"}</span></span>,
          time: t.decided_at ? `${STEP_WORDS[t.status] ?? t.status} · ${formatDateTime(t.decided_at)}` : (STEP_WORDS[t.status] ?? t.status),
          description: t.comment ? <p className="text-[13px] text-ink/90">{t.comment}</p> : undefined,
        }))} />
      ) : <p className="text-[13.5px] text-faint">No approval steps were needed.</p>}
    </div>
  );
}
