"use client";

/*
 * Portal: leave requests for a child. Ask for leave (dates, kind, reason, a note or
 * certificate), see each request's status and the class teacher's note, and withdraw a
 * request that is still waiting.
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarX2, Paperclip, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { formatDate, formatDateTime, todayISO } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, DateRangeInput, Field, FileDrop, Modal, ModalCancel, RadioCards, Select, Skeleton, Textarea, useConfirm,
} from "@/components/ui-kit";
import { MyChildSwitcher, useMyChild } from "@/components/student_attendance/child";
import { addDays, LEAVE_LABEL, LEAVE_TONE, uploadLeaveFile, type AttStatus, type LeaveRow } from "@/components/student_attendance/lib";

type Data = { items: LeaveRow[]; leave_kinds: AttStatus[]; rules: { leave_max_days: number; leave_past_days: number; leave_attachment_after_days: number } };

function span(r: { from_date: string; to_date: string }) {
  return r.from_date === r.to_date ? formatDate(r.from_date, { weekday: "short" }) : `${formatDate(r.from_date, { year: undefined })} – ${formatDate(r.to_date)}`;
}

export default function MyLeavePage() {
  const { term } = useInstitution();
  const toast = useToast();
  const confirm = useConfirm();
  const child = useMyChild();
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!child.studentId) return;
    let live = true;
    setData(null);
    api.get<Data>(`/student-attendance/portal/leave?student_id=${child.studentId}`).then((r) => live && setData(r)).catch(() => live && setData({ items: [], leave_kinds: [], rules: { leave_max_days: 15, leave_past_days: 7, leave_attachment_after_days: 3 } }));
    return () => { live = false; };
  }, [child.studentId, nonce]);

  async function withdraw(r: LeaveRow) {
    if (!(await confirm({ title: "Withdraw this request?", message: "The class teacher will no longer see it.", confirmLabel: "Withdraw", tone: "danger" }))) return;
    try { await api.post(`/student-attendance/portal/leave/${r.uuid}/withdraw`); toast.success("Request withdrawn"); refresh(); }
    catch (e) { toast.error("Couldn't withdraw", { description: (e as Error).message }); }
  }

  return (
    <div>
      <PageHeader title="Leave requests" description={`Tell the class ${term("teacher").toLowerCase()} in advance when your child will be away.`}
        actions={<><MyChildSwitcher child={child} />{child.studentId && <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Ask for leave</Button>}</>} />
      {child.ready && !child.studentId ? (
        <Paper><EmptyState icon={CalendarX2} title={`No ${term("student").toLowerCase()} linked to this sign-in`} hint="Ask the school office to link your child." /></Paper>
      ) : !data ? (
        <Paper className="space-y-3 p-5"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></Paper>
      ) : data.items.length === 0 ? (
        <Paper><EmptyState icon={CalendarX2} title="No leave requests yet" hint="Ask for leave for a family event, illness or travel. The class teacher approves it."
          action={<Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>Ask for leave</Button>} /></Paper>
      ) : (
        <div className="space-y-3">
          {data.items.map((r) => (
            <Paper key={r.uuid} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] text-ink">{span(r)} <span className="text-[13px] text-muted">· {r.days} school day{r.days === 1 ? "" : "s"}</span></p>
                  <p className="mt-0.5 text-[13.5px] text-muted">{data.leave_kinds.find((k) => k.code === r.status_code)?.name ?? "Leave"} · {r.reason}</p>
                  {r.attachments.length > 0 && <p className="mt-1 flex flex-wrap gap-3 text-[12.5px] text-muted">{r.attachments.map((a) => <span key={a.uuid} className="inline-flex items-center gap-1"><Paperclip size={12} strokeWidth={1.4} />{a.name}</span>)}</p>}
                </div>
                <Badge tone={LEAVE_TONE[r.status]} dot>{LEAVE_LABEL[r.status]}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[12.5px] text-faint">
                <span>Asked by {r.requested_by_name}{r.created_at ? ` · ${formatDateTime(r.created_at)}` : ""}
                  {r.decided_by_name && r.status !== "pending" ? ` · ${LEAVE_LABEL[r.status].toLowerCase()} by ${r.decided_by_name}` : ""}</span>
                {r.status === "pending" && <Button size="sm" variant="ghost" onClick={() => withdraw(r)}>Withdraw</Button>}
              </div>
              {r.decision_note && r.status === "rejected" && <p className="mt-2 rounded-lg bg-rose-50/60 px-3 py-2 text-[13px] text-rose-700">{r.decision_note}</p>}
            </Paper>
          ))}
        </div>
      )}
      {data && child.studentId && (
        <ApplyModal open={open} onClose={() => setOpen(false)} studentId={child.studentId} childName={child.current?.first_name ?? ""}
          kinds={data.leave_kinds} rules={data.rules} onSaved={() => { setOpen(false); refresh(); }} />
      )}
    </div>
  );
}

function ApplyModal({ open, onClose, studentId, childName, kinds, rules, onSaved }: {
  open: boolean; onClose: () => void; studentId: number; childName: string; kinds: AttStatus[]; rules: Data["rules"]; onSaved: () => void;
}) {
  const toast = useToast();
  const [range, setRange] = useState({ from: todayISO(), to: todayISO() });
  const [kind, setKind] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setRange({ from: todayISO(), to: todayISO() }); setReason(""); setFiles([]); setKind(kinds[0]?.code ?? null); } }, [open, kinds]);
  async function save() {
    if (!range.from || !reason.trim()) { toast.error("Pick the dates and add a reason"); return; }
    setBusy(true);
    try {
      const uploaded = [];
      for (const f of files) uploaded.push((await uploadLeaveFile(f)).uuid);
      await api.post("/student-attendance/portal/leave", { student_id: studentId, from_date: range.from, to_date: range.to || range.from, reason: reason.trim(), status_code: kind, attachments: uploaded });
      toast.success("Leave request sent", { description: "The class teacher will look at it." });
      onSaved();
    } catch (e) { toast.error("Couldn't send", { description: (e as Error).message }); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} busy={busy} size="md" title={`Ask for leave${childName ? ` for ${childName}` : ""}`}
      dirty={!!reason || files.length > 0} footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={save}>Send request</Button></>}>
      <div className="space-y-4">
        <Field label="Dates" required hint={`Up to ${rules.leave_max_days} days. Holidays are not counted.`}>
          <DateRangeInput value={range} onChange={setRange} min={addDays(todayISO(), -rules.leave_past_days)} />
        </Field>
        {kinds.length > 1 && (kinds.length <= 4
          ? <Field label="Kind of leave"><RadioCards columns={2} value={kind} onChange={setKind} options={kinds.map((k) => ({ value: k.code, label: k.name }))} /></Field>
          : <Field label="Kind of leave"><Select value={kind} onChange={(v) => setKind(v as string | null)} options={kinds.map((k) => ({ value: k.code, label: k.name }))} /></Field>)}
        <Field label="Reason" required><Textarea value={reason} onValueChange={setReason} rows={3} placeholder="e.g. Family wedding in Mysuru" /></Field>
        <Field label="Note or medical certificate" hint={rules.leave_attachment_after_days ? `Needed for leave longer than ${rules.leave_attachment_after_days} days.` : "Optional."}>
          <FileDrop value={files} onChange={setFiles} accept="image/*,.pdf" multiple maxFiles={3} maxSizeMb={10} />
        </Field>
      </div>
    </Modal>
  );
}
