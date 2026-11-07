"use client";

/* Task details: status, checklist, comments and attachments. */
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarClock, CheckCircle2, Circle, CircleDashed, Pencil, Plus, Repeat, Send, Trash2, Workflow, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, formatRelative, todayISO } from "@/lib/datetime";
import {
  Avatar, Badge, Button, Checkbox, IconButton, KeyValue, Modal, Skeleton, TextInput, Textarea, formatDisplayDate, useConfirm,
} from "@/components/ui-kit";
import { AttachmentList, AttachmentPicker } from "@/components/workplace/attachments";
import type { FileRef } from "@/components/workplace/files";
import { PRIORITY_LABEL, PRIORITY_TONE } from "@/components/workplace/pickers";
import { isOverdue, STATUS_TONE, type Task } from "./types";

const FREQ: Record<string, string> = { daily: "day", weekly: "week", monthly: "month", yearly: "year" };

export function TaskDetailModal({ uuid, open, onClose, onEdit, onChanged }: {
  uuid: string | null; open: boolean; onClose: () => void; onEdit: (t: Task) => void; onChanged: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [t, setT] = useState<Task | null>(null);
  const [item, setItem] = useState("");
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<FileRef[]>([]);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const load = useCallback(async () => {
    if (!uuid) return;
    try { setT(await api.get<Task>(`/tasks/${uuid}`)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't open the task"); closeRef.current(); }
  }, [uuid, toast]);
  useEffect(() => { setT(null); setItem(""); setComment(""); setFiles([]); if (open) load(); }, [open, load]);

  async function run(fn: () => Promise<Task>, done?: (t: Task) => void) {
    setBusy(true);
    try { const out = await fn(); setT(out); onChanged(); done?.(out); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  }
  const setStatus = async (status: string) => {
    if (status === "cancelled" && !(await confirm({ title: "Cancel this task?", message: "It stays in the history but drops off the lists.", confirmLabel: "Cancel task", tone: "danger" }))) return;
    run(() => api.post<Task>(`/tasks/${t!.uuid}/status`, { status }), (out) => {
      if (out.next_occurrence) toast.success("Done. The next one is due " + formatDisplayDate(out.next_occurrence.due_date));
    });
  };

  const today = todayISO();
  const pct = t && t.checklist_total ? Math.round((100 * t.checklist_done) / t.checklist_total) : 0;
  return (
    <Modal open={open && !!uuid} onClose={onClose} size="lg" busy={busy}
      title={t?.title ?? "Loading…"}
      description={t ? <span className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[t.status] ?? "neutral"} dot>{t.status_label}</Badge>
        <Badge tone={PRIORITY_TONE[t.priority] ?? "neutral"}>{PRIORITY_LABEL[t.priority]}</Badge>
        {t.recurrence && <Badge tone="accent"><Repeat size={11} strokeWidth={1.6} />Every {t.recurrence.interval > 1 ? `${t.recurrence.interval} ` : ""}{FREQ[t.recurrence.freq]}{t.recurrence.interval > 1 ? "s" : ""}</Badge>}
        {t.source_module && <Badge tone="info"><Workflow size={11} strokeWidth={1.6} />From {t.source_module}</Badge>}
      </span> : undefined}
      headerActions={t?.can_edit && <Button size="sm" icon={Pencil} onClick={() => onEdit(t)}>Edit</Button>}
      footerStart={t?.can_edit && t.status !== "cancelled" && <Button variant="ghost" icon={XCircle} onClick={() => setStatus("cancelled")}>Cancel task</Button>}
      footer={t?.can_work && t.status !== "cancelled" && (
        <div className="flex gap-2">
          {t.status !== "todo" && <Button icon={Circle} onClick={() => setStatus("todo")}>To do</Button>}
          {t.status !== "in_progress" && <Button icon={CircleDashed} onClick={() => setStatus("in_progress")}>In progress</Button>}
          {t.status !== "done" && <Button variant="primary" icon={CheckCircle2} onClick={() => setStatus("done")}>Mark done</Button>}
        </div>
      )}>
      {!t ? <div className="space-y-3"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-20 w-full" /></div> : (
        <div className="space-y-7">
          <KeyValue columns={3} items={[
            { label: "Assigned to", value: t.assignee_name ? <span className="flex items-center gap-2"><Avatar name={t.assignee_name} size={22} />{t.assignee_name}</span> : null },
            { label: "Due", value: t.due_date ? <span className={isOverdue(t, today) ? "text-rose-600" : ""}>{formatDisplayDate(t.due_date)}{isOverdue(t, today) ? " · overdue" : ""}</span> : null },
            { label: "Created by", value: t.created_by_name },
            ...(t.start_date ? [{ label: "Start", value: formatDisplayDate(t.start_date) }] : []),
            ...(t.completed_at ? [{ label: "Completed", value: formatDateTime(t.completed_at) }] : []),
            ...(t.labels.length ? [{ label: "Labels", value: <span className="flex flex-wrap gap-1">{t.labels.map((l) => <Badge key={l}>{l}</Badge>)}</span> }] : []),
          ]} />
          {t.description && <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-ink/85">{t.description}</p>}
          {!!t.attachments?.length && <AttachmentList items={t.attachments} />}

          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[15px] text-ink">Checklist</p>
              {t.checklist_total > 0 && <span className="text-[12.5px] text-muted">{t.checklist_done} of {t.checklist_total}</span>}
            </div>
            {t.checklist_total > 0 && <div className="mb-3 h-1 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>}
            <ul className="divide-y divide-line rounded-xl border border-line">
              {(t.checklist ?? []).map((c) => (
                <li key={c.uuid} className="group flex items-center gap-3 px-3 py-2">
                  <Checkbox checked={c.done} disabled={!t.can_work} onChange={(x) => run(() => api.put<Task>(`/tasks/${t.uuid}/checklist/${c.uuid}`, { done: x }))}
                    label={<span className={c.done ? "text-muted line-through" : "text-ink"}>{c.title}</span>} />
                  <span className="ml-auto text-[11.5px] text-faint">{c.done && c.done_by_name ? c.done_by_name : ""}</span>
                  {t.can_work && <IconButton icon={Trash2} label="Remove" size="sm" className="opacity-0 group-hover:opacity-100" onClick={() => run(() => api.delete<Task>(`/tasks/${t.uuid}/checklist/${c.uuid}`))} />}
                </li>
              ))}
              {t.can_work && (
                <li className="flex gap-2 px-3 py-2">
                  <TextInput value={item} onValueChange={setItem} placeholder="Add a step"
                    onKeyDown={(e) => { if (e.key === "Enter" && item.trim()) { e.preventDefault(); run(() => api.post<Task>(`/tasks/${t.uuid}/checklist`, { title: item.trim() }), () => setItem("")); } }} />
                  <Button icon={Plus} disabled={!item.trim()} onClick={() => run(() => api.post<Task>(`/tasks/${t.uuid}/checklist`, { title: item.trim() }), () => setItem(""))}>Add</Button>
                </li>
              )}
            </ul>
          </section>

          <section>
            <p className="mb-3 text-[15px] text-ink">Comments</p>
            <ul className="space-y-4">
              {(t.comments ?? []).map((c) => (
                <li key={c.uuid} className="flex gap-3">
                  <Avatar name={c.author_name || "?"} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] text-muted"><span className="text-ink">{c.author_name}</span> · {formatRelative(c.created_at)}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-[14px] text-ink/90">{c.body}</p>
                    <AttachmentList items={c.attachments} className="mt-2" />
                  </div>
                </li>
              ))}
              {!t.comments?.length && <li className="text-[13px] text-faint">No comments yet.</li>}
            </ul>
            <div className="mt-4 rounded-xl border border-line p-3">
              <Textarea rows={2} autoGrow maxRows={6} value={comment} onValueChange={setComment} placeholder="Write a comment" className="border-0 px-0" />
              <div className="mt-2 flex items-center justify-between gap-2">
                <AttachmentPicker value={files} onChange={setFiles} compact />
                <Button variant="primary" icon={Send} disabled={!comment.trim() && !files.length}
                  onClick={() => run(() => api.post<Task>(`/tasks/${t.uuid}/comments`, { body: comment.trim(), attachments: files.map((f) => f.uuid) }), () => { setComment(""); setFiles([]); })}>Comment</Button>
              </div>
            </div>
          </section>
          <p className="flex items-center gap-1.5 text-[12px] text-faint"><CalendarClock size={12} strokeWidth={1.4} />Created {formatDateTime(t.created_at)} · updated {formatRelative(t.updated_at)}{t.remind_days_before ? ` · reminder ${t.remind_days_before} day${t.remind_days_before > 1 ? "s" : ""} before` : ""}</p>
        </div>
      )}
    </Modal>
  );
}
