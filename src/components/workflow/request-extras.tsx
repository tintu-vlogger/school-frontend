"use client";

/*
 * Parts of the request view in the approvals inbox:
 *   <RequestComments uuid comments onAdded />   comments and files on a request
 *   <NudgeButton uuid nextAt onDone />          the requester reminds the approvers (with a cooldown)
 *   <RevokeBox uuid mode pending onDone />      cancel an approved request
 *   <PassOnModal taskUuids onClose onDone />    forward several approvals at once
 */
import { useState } from "react";
import { ArrowRightLeft, BellRing, Paperclip, Send, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, formatRelative } from "@/lib/datetime";
import { fileHref, uploadFile, type FileRef } from "@/components/workplace/files";
import {
  Avatar, Button, Field, FileDrop, Modal, ModalCancel, Select, Textarea, type SelectOption,
} from "@/components/ui-kit";

export type RequestComment = {
  uuid: string; author_name: string | null; body: string | null; attachments: FileRef[]; mine: boolean; created_at: string;
};

async function loadEmployees(q: string): Promise<SelectOption<number>[]> {
  const rows = await api.get<{ value: number; label: string; hint: string }[]>(`/employees/lookup?q=${encodeURIComponent(q)}`);
  return rows.map((r) => ({ value: r.value, label: r.label, description: r.hint }));
}

export function RequestComments({ uuid, comments, onAdded }: { uuid: string; comments: RequestComment[]; onAdded: () => void }) {
  const toast = useToast();
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [saving, setSaving] = useState(false);

  async function send() {
    if (!body.trim() && files.length === 0) return;
    setSaving(true);
    try {
      const refs = await Promise.all(files.map((f) => uploadFile(f)));
      await api.post(`/workflow/requests/${uuid}/comments`, { body: body.trim() || null, attachment_uuids: refs.map((r) => r.uuid) });
      setBody(""); setFiles([]); setAttaching(false);
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add the comment");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="mb-3 text-[12px] uppercase tracking-[0.06em] text-faint">Comments and files</p>
      {comments.length === 0 ? (
        <p className="mb-3 text-[13px] text-faint">No comments yet.</p>
      ) : (
        <ul className="mb-4 space-y-3">
          {comments.map((c) => (
            <li key={c.uuid} className="flex gap-3">
              <Avatar name={c.author_name ?? "?"} size={28} />
              <div className="min-w-0 flex-1 rounded-xl bg-sunken/60 px-3 py-2">
                <p className="text-[12.5px] text-muted">
                  <span className="text-ink">{c.author_name ?? "Someone"}</span>
                  <span className="text-faint" title={formatDateTime(c.created_at)}> · {formatRelative(c.created_at)}</span>
                </p>
                {c.body && <p className="mt-0.5 whitespace-pre-wrap text-[14px] text-ink">{c.body}</p>}
                {c.attachments.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {c.attachments.map((f) => (
                      <a key={f.uuid} href={fileHref(f.url)} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-[12.5px] text-primary hover:bg-primary-soft">
                        <Paperclip size={13} strokeWidth={1.4} />{f.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-2">
        <Textarea value={body} onValueChange={setBody} rows={2} autoGrow placeholder="Write a comment for the requester and approvers" />
        {attaching && <FileDrop value={files} onChange={setFiles} multiple maxFiles={5} maxSizeMb={10}
          onReject={(r) => toast.error(r[0] ?? "That file can't be added")} />}
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" icon={Paperclip} onClick={() => setAttaching((x) => !x)}>
            {attaching ? "Hide files" : "Attach files"}
          </Button>
          <Button size="sm" icon={Send} loading={saving} disabled={!body.trim() && files.length === 0} onClick={send}>Add</Button>
        </div>
      </div>
    </div>
  );
}

export function NudgeButton({ uuid, nextAt, onDone }: { uuid: string; nextAt: string | null; onDone: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const waiting = !!nextAt && new Date(nextAt).getTime() > Date.now();
  async function nudge() {
    setBusy(true);
    try {
      const r = await api.post<{ reminded: number }>(`/workflow/requests/${uuid}/nudge`);
      toast.success(`Reminder sent to ${r.reminded} approver${r.reminded === 1 ? "" : "s"}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the reminder");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button variant="ghost" icon={BellRing} loading={busy} disabled={waiting} onClick={nudge}
      title={waiting && nextAt ? `You can remind them again ${formatRelative(nextAt)}` : undefined}>
      {waiting && nextAt ? `Reminded · again ${formatRelative(nextAt)}` : "Remind approvers"}
    </Button>
  );
}

export function RevokeBox({ uuid, mode, onDone }: { uuid: string; mode: string; onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const r = await api.post<{ status: string; pending?: boolean }>(`/workflow/requests/${uuid}/revoke`, { reason });
      toast.success(r.pending ? "Cancellation sent for approval" : "Request cancelled");
      setOpen(false);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't cancel");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-xl border border-line px-4 py-3">
      {!open ? (
        <button className="text-[13.5px] text-muted hover:text-primary" onClick={() => setOpen(true)}>
          <Undo2 size={14} strokeWidth={1.4} className="mr-1.5 inline" />Cancel this approved request
          {mode === "approval" ? " (needs approval)" : ""}
        </button>
      ) : (
        <div className="space-y-3">
          <Field label="Why should it be cancelled?" required
            hint={mode === "approval" ? "Your manager approves the cancellation first." : "It is cancelled at once."}>
            <Textarea value={reason} onValueChange={setReason} rows={2} autoGrow data-autofocus />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Keep it</Button>
            <Button variant="danger" size="sm" icon={Undo2} loading={busy} disabled={!reason.trim()} onClick={go}>
              {mode === "approval" ? "Ask to cancel" : "Cancel request"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PassOnModal({ taskUuids, onClose, onDone }: { taskUuids: string[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [to, setTo] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!to) return;
    setBusy(true);
    try {
      const r = await api.post<{ moved: number; skipped: { detail: string }[] }>("/workflow/tasks/bulk-reassign",
        { to_employee_id: to, task_uuids: taskUuids, comment: comment || null });
      if (r.skipped.length === 0) toast.success(`${r.moved} approval${r.moved === 1 ? "" : "s"} passed on`);
      else toast.warning(`${r.moved} passed on, ${r.skipped.length} not`, { description: r.skipped[0]?.detail });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't pass them on");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} size="sm" busy={busy} dirty={!!to || !!comment}
      title={`Pass on ${taskUuids.length} approval${taskUuids.length === 1 ? "" : "s"}`}
      description="The person you choose decides instead of you."
      footer={<><ModalCancel /><Button variant="primary" icon={ArrowRightLeft} loading={busy} disabled={!to} onClick={go}>Pass on</Button></>}>
      <div className="space-y-4">
        <Field label="Pass to" required><Select<number> value={to} onChange={(v) => setTo(v)} loadOptions={loadEmployees} placeholder="Search by name" /></Field>
        <Field label="Note (optional)"><Textarea value={comment} onValueChange={setComment} rows={2} autoGrow placeholder="e.g. I'm on leave this week" /></Field>
      </div>
    </Modal>
  );
}
