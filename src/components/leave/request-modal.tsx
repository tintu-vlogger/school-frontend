"use client";

/*
 * LeaveRequestModal: one leave request with its day-by-day breakdown, approval timeline
 * and history, and the actions the viewer may take: approve or reject (when it is waiting
 * for them), change (pending), cancel all or some days, extend.
 *   <LeaveRequestModal uuid={id} onClose={...} onChanged={reload} onEdit={(detail) => ...} />
 */
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRightLeft, Ban, CalendarPlus, Check, CheckCheck, Clock, FileText, Paperclip, Pencil, Send, X, XCircle,
} from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { Avatar, Button, Checkbox, DateInput, Field, Modal, ModalCancel, Textarea, Timeline, type TimelineItem } from "@/components/ui-kit";
import { DayStrip } from "./apply-modal";
import { LeaveIcon, StatusBadge, dateRange, fmtDays, unitText } from "./leave-ui";
import type { LeaveDetail } from "./types";

type Mode = "view" | "cancel" | "extend" | "decide";

export function LeaveRequestModal({ uuid, onClose, onChanged, onEdit, partialCancel = true }: {
  uuid: string | null; onClose: () => void; onChanged: () => void; onEdit?: (d: LeaveDetail) => void; partialCancel?: boolean;
}) {
  const toast = useToast();
  const [d, setD] = useState<LeaveDetail | null>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [note, setNote] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [extendTo, setExtendTo] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!uuid) return;
    api.get<LeaveDetail>(`/leave/requests/${uuid}`).then(setD).catch((e) => { toast.error(e instanceof Error ? e.message : "Couldn't open the request"); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid]);
  useEffect(() => { setD(null); setMode("view"); setNote(""); setPicked([]); setExtendTo(""); load(); }, [load]);

  const active = (d?.breakdown ?? []).filter((it) => !it.cancelled && it.amount > 0);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try { await fn(); toast.success(done); onChanged(); setMode("view"); setNote(""); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  }

  const decide = (decision: "approve" | "reject") => {
    if (!d?.my_task_uuid) return;
    if (decision === "reject" && !note.trim()) { toast.error("Add a comment saying why it is rejected."); setMode("decide"); return; }
    run(() => api.post(`/workflow/tasks/${d.my_task_uuid}/decision`, { decision, comment: note || null }), decision === "approve" ? "Approved" : "Rejected");
  };
  const cancel = () => {
    if (!d) return;
    const dates = picked.length && picked.length < active.length ? picked : null;
    run(() => api.post(`/leave/requests/${d.uuid}/cancel`, { dates, reason: note || null }),
      d.status === "pending" ? "Request withdrawn" : "Cancellation sent");
  };
  const extend = () => {
    if (!d || !extendTo) return;
    run(() => api.post(`/leave/requests/${d.uuid}/extend`, { to_date: extendTo, reason: note || null }), "Extension sent");
  };

  async function openAttachment() {
    if (!d) return;
    const token = localStorage.getItem("hrms_token");
    const r = await fetch(`${API_BASE}/leave/requests/${d.uuid}/attachment`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!r.ok) { toast.error("Couldn't open the document"); return; }
    const url = URL.createObjectURL(await r.blob());
    window.open(url, "_blank", "noopener");
  }

  const timeline: TimelineItem[] = [];
  if (d) {
    for (const h of d.history) {
      const a = h.action.toLowerCase();
      timeline.push({
        id: `h${h.at}${h.action}`, title: h.action, description: [h.by, h.note && `“${h.note}”`].filter(Boolean).join(" · "),
        time: formatDateTime(h.at),
        icon: a.includes("approved") ? Check : a.includes("rejected") || a.includes("not approved") ? X : a.includes("cancel") || a.includes("withdrawn") ? XCircle : a.includes("exten") ? CalendarPlus : a.includes("changed") ? Pencil : Send,
        tone: a.includes("approved") && !a.includes("not") ? "good" : a.includes("reject") || a.includes("not approved") ? "bad" : a.includes("cancel") || a.includes("withdrawn") ? "neutral" : "accent",
      });
    }
    for (const ap of d.approvals) {
      for (const t of ap.tasks.filter((x) => x.status === "pending" || x.status === "reassigned")) {
        timeline.push({ id: t.uuid, title: `${ap.label === "Cancellation" ? "Cancellation: " : ""}waiting for ${t.approver_name}`, description: t.step_name,
          time: formatDateTime(t.created_at), icon: t.status === "pending" ? Clock : ArrowRightLeft, tone: "warn" });
      }
      for (const t of ap.tasks.filter((x) => x.status === "approved" || x.status === "rejected")) {
        if (d.history.some((h) => h.at === t.decided_at)) continue;
        timeline.push({ id: `${t.uuid}d`, title: `${t.step_name}: ${t.status} by ${t.decided_by_name ?? t.approver_name}`,
          description: t.comment ? `“${t.comment}”` : undefined, time: t.decided_at ? formatDateTime(t.decided_at) : undefined,
          icon: t.status === "approved" ? CheckCheck : X, tone: t.status === "approved" ? "good" : "bad" });
      }
    }
  }

  const footer = !d ? <ModalCancel>Close</ModalCancel> : mode === "cancel" ? (
    <><Button variant="ghost" onClick={() => setMode("view")}>Back</Button>
      <Button variant="danger" icon={Ban} loading={busy} onClick={cancel}>
        {d.status === "pending" ? "Withdraw request" : picked.length && picked.length < active.length ? `Cancel ${picked.length} day${picked.length === 1 ? "" : "s"}` : "Cancel leave"}</Button></>
  ) : mode === "extend" ? (
    <><Button variant="ghost" onClick={() => setMode("view")}>Back</Button>
      <Button variant="primary" icon={CalendarPlus} loading={busy} disabled={!extendTo} onClick={extend}>Ask for extension</Button></>
  ) : d.my_task_uuid ? (
    <><Button variant="secondary" icon={X} disabled={busy} onClick={() => decide("reject")}>Reject</Button>
      <Button variant="primary" icon={Check} loading={busy} onClick={() => decide("approve")}>Approve</Button></>
  ) : <ModalCancel>Close</ModalCancel>;

  return (
    <Modal open={!!uuid} onClose={onClose} size="lg" busy={busy} dirty={!!note && mode !== "view"}
      leading={d ? <LeaveIcon name={d.leave_type.icon} color={d.leave_type.color} size={36} /> : undefined}
      title={d ? `${d.kind === "extension" ? "Extension · " : ""}${d.leave_type.name}` : "Leave request"}
      description={d ? `${d.employee.name}${d.reference_no ? ` · ${d.reference_no}` : ""}` : undefined}
      headerActions={d ? <StatusBadge status={d.status} /> : undefined}
      footerStart={d && mode === "view" && !d.my_task_uuid ? (
        <div className="flex flex-wrap gap-1">
          {d.can_modify && onEdit && <Button variant="ghost" size="sm" icon={Pencil} onClick={() => onEdit(d)}>Change</Button>}
          {d.can_extend && d.status !== "pending" && <Button variant="ghost" size="sm" icon={CalendarPlus} onClick={() => setMode("extend")}>Extend</Button>}
          {d.can_cancel && <Button variant="ghost" size="sm" icon={Ban} onClick={() => { setPicked([]); setMode("cancel"); }}>{d.status === "pending" ? "Withdraw" : "Cancel"}</Button>}
        </div>
      ) : undefined}
      footer={footer}>
      {!d ? <div className="h-48 animate-pulse rounded-xl bg-sunken" /> : (
        <div className="space-y-6">
          <div className="grid gap-4 rounded-2xl border border-line bg-canvas/40 p-5 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <p className="text-[12px] text-faint">Dates</p>
              <p className="mt-0.5 text-[15px] text-ink">{dateRange(d.from_date, d.to_date)}</p>
              {d.unit !== "day" && <p className="text-[12.5px] text-muted">{unitText(d.unit, d.half, d.hours)}</p>}
            </div>
            <div>
              <p className="text-[12px] text-faint">Counted</p>
              <p className="tabular mt-0.5 text-[22px] font-extralight leading-tight text-ink">{fmtDays(d.days)}</p>
            </div>
            <div>
              <p className="text-[12px] text-faint">Unpaid</p>
              <p className={`tabular mt-0.5 text-[22px] font-extralight leading-tight ${d.lop_days ? "text-rose-600" : "text-ink"}`}>{fmtDays(d.lop_days)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Avatar name={d.employee.name} src={d.employee.photo} size={32} />
            <div className="min-w-0 text-[13px]">
              <p className="text-ink">{d.employee.name}{d.employee.department ? <span className="text-muted"> · {d.employee.department}</span> : null}</p>
              <p className="text-faint">Asked {formatDateTime(d.created_at)}{d.on_behalf ? ` · recorded by ${d.applied_by_name ?? "HR"}` : ""}</p>
            </div>
          </div>

          {d.reason && <p className="rounded-xl border border-line px-4 py-3 text-[14px] text-ink/90">“{d.reason}”</p>}

          {mode === "cancel" && d.status !== "pending" && partialCancel && active.length > 1 && (
            <div className="rounded-xl border border-line p-4">
              <p className="mb-3 text-[13px] text-muted">Pick the days to cancel, or leave all unticked to cancel the whole leave.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {active.map((it) => (
                  <Checkbox key={it.date} checked={picked.includes(it.date)} onChange={(v) => setPicked((p) => v ? [...p, it.date] : p.filter((x) => x !== it.date))}
                    label={formatDate(it.date, { weekday: "short" })} description={it.sandwich ? "between leave days" : it.amount !== 1 ? `${it.amount} day` : undefined} />
                ))}
              </div>
            </div>
          )}
          {mode === "extend" && (
            <Field label="Extend until" required hint={`Currently until ${formatDate(d.extensions.at(-1)?.to_date ?? d.to_date)}.`}>
              <DateInput value={extendTo} onChange={setExtendTo} min={d.extensions.at(-1)?.to_date ?? d.to_date} />
            </Field>
          )}
          {(mode !== "view" || d.my_task_uuid) && (
            <Field label={d.my_task_uuid ? "Comment (needed to reject)" : mode === "extend" ? "Why is it extended?" : "Reason"}>
              <Textarea value={note} onValueChange={setNote} rows={2} autoGrow maxLength={500} />
            </Field>
          )}

          <div>
            <p className="mb-2 text-[12px] uppercase tracking-[0.06em] text-faint">Day by day</p>
            <DayStrip items={d.breakdown} />
          </div>

          {d.attachment_name && (
            <button type="button" onClick={openAttachment} className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] text-ink hover:border-line-strong">
              <Paperclip size={14} strokeWidth={1.4} />{d.attachment_name}
            </button>
          )}

          {(d.extensions.length > 0 || d.parent) && (
            <div className="rounded-xl border border-line px-4 py-3 text-[13px]">
              <p className="mb-2 flex items-center gap-2 text-muted"><FileText size={14} strokeWidth={1.4} />Extensions</p>
              {d.parent && <p className="text-muted">Extends request {d.parent.reference_no ?? ""}</p>}
              {d.extensions.map((x) => (
                <p key={x.uuid} className="flex justify-between gap-3"><span className="text-ink">{dateRange(x.from_date, x.to_date)} · {fmtDays(x.days)}</span><StatusBadge status={x.status} /></p>
              ))}
            </div>
          )}

          <div>
            <p className="mb-3 text-[12px] uppercase tracking-[0.06em] text-faint">Progress</p>
            <Timeline items={timeline} />
          </div>
        </div>
      )}
    </Modal>
  );
}
