"use client";

/*
 * Portal: hostel details for a boarder (block, room, bed, warden) and their leave and
 * out-passes. Parents can ask for leave or an out-pass and cancel a request still waiting.
 */
import { useState } from "react";
import { BedDouble, CalendarClock, Phone, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, todayISO } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, DateInput, Field, FormGrid, Modal, ModalCancel, Select, Skeleton, Textarea, TextInput, TimeInput,
  formatDisplayDate, useConfirm,
} from "@/components/ui-kit";
import { ChildPicker, errText, STROKE, useApiData, useMyChildren } from "@/components/transport/common";
import { toIso } from "@/components/hostel/leave";
import { LEAVE_LABEL, LEAVE_TONE, type BoarderSummary, type Leave } from "@/components/hostel/types";

export default function MyHostelPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { portalRole } = useAccess();
  const { kids, child, setChild, loading: kidsLoading } = useMyChildren();
  const { data, loading, reload } = useApiData<{ boarder: BoarderSummary | null; leaves: Leave[] }>(child ? `/hostel/portal/summary?student_id=${child.id}` : null);
  const [form, setForm] = useState({ open: false, key: 0 });
  const b = data?.boarder;
  const isParent = portalRole === "parent";

  async function cancel(l: Leave) {
    if (!(await confirm({ title: "Cancel this request?", confirmLabel: "Cancel request", cancelLabel: "Keep it", tone: "danger" }))) return;
    try { await api.post(`/hostel/portal/leaves/${l.uuid}/cancel`); toast.success("Request cancelled"); reload(); }
    catch (e) { toast.error("Couldn't cancel", { description: errText(e) }); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Hostel" description={child ? `Room and leave for ${child.first_name || child.name}.` : undefined}
        actions={b && isParent ? <Button variant="primary" icon={Plus} onClick={() => setForm((f) => ({ open: true, key: f.key + 1 }))}>Ask for leave</Button> : undefined} />
      <ChildPicker kids={kids} value={child?.id ?? null} onChange={setChild} />
      {kidsLoading || loading ? <div className="space-y-3"><Skeleton className="h-32 w-full rounded-2xl" /><Skeleton className="h-40 w-full rounded-2xl" /></div>
        : !b ? <Paper><EmptyState icon={BedDouble} title="Not staying in the hostel" hint="Contact the school office about hostel places." /></Paper> : (
          <div className="space-y-4">
            <Paper className="p-5">
              <div className="flex items-start gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft/60 text-primary"><BedDouble size={20} strokeWidth={STROKE} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[18px] font-light text-ink">{b.block} · Room {b.room}</p>
                  <p className="text-[13.5px] text-muted">Bed {b.bed}{b.floor ? ` · Floor ${b.floor}` : ""} · since {formatDisplayDate(b.check_in)}{b.mess_plan ? ` · ${b.mess_plan} mess` : ""}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {b.warden && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                    <div className="min-w-0"><p className="text-[12px] uppercase tracking-[0.06em] text-faint">Warden</p><p className="truncate text-[14px] text-ink">{b.warden.name}</p></div>
                    {b.warden.phone && <a href={`tel:${b.warden.phone}`} className="flex items-center gap-1.5 text-[13px] text-primary"><Phone size={14} strokeWidth={STROKE} />Call</a>}
                  </div>
                )}
                {b.hostel_phone && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                    <div className="min-w-0"><p className="text-[12px] uppercase tracking-[0.06em] text-faint">Hostel office</p><p className="truncate text-[14px] text-ink">{b.hostel_phone}</p></div>
                    <a href={`tel:${b.hostel_phone}`} className="flex items-center gap-1.5 text-[13px] text-primary"><Phone size={14} strokeWidth={STROKE} />Call</a>
                  </div>
                )}
              </div>
            </Paper>
            <Paper>
              <PaperHeader title="Leave and out-passes" />
              {!data?.leaves.length ? <p className="flex items-center gap-2 px-5 py-6 text-[13.5px] text-muted"><CalendarClock size={16} strokeWidth={STROKE} className="text-faint" />No requests yet.{isParent ? " Use “Ask for leave” to request one." : ""}</p> : (
                <ul className="divide-y divide-line">
                  {data.leaves.map((l) => (
                    <li key={l.uuid} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px] text-ink">{l.kind === "leave" ? "Leave" : "Out-pass"}: {formatDateTime(l.from_at)} – {formatDateTime(l.to_at)}</p>
                        <p className="truncate text-[12.5px] text-muted">{l.reason}{l.decision_note ? ` · ${l.decision_note}` : ""}</p>
                      </div>
                      <Badge tone={LEAVE_TONE[l.status]} dot>{LEAVE_LABEL[l.status]}</Badge>
                      {isParent && ["pending", "approved"].includes(l.status) && <Button size="sm" variant="ghost" onClick={() => cancel(l)}>Cancel</Button>}
                    </li>
                  ))}
                </ul>
              )}
            </Paper>
          </div>
        )}
      {child && <AskLeave key={form.key} open={form.open} studentId={child.id} onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={() => { setForm((f) => ({ ...f, open: false })); reload(); }} />}
    </div>
  );
}

function AskLeave({ open, studentId, onClose, onSaved }: { open: boolean; studentId: number; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<"leave" | "outpass">("leave");
  const [fromDay, setFromDay] = useState(todayISO());
  const [fromTime, setFromTime] = useState("16:00");
  const [toDay, setToDay] = useState(todayISO());
  const [toTime, setToTime] = useState("18:00");
  const [reason, setReason] = useState("");
  const [escort, setEscort] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 2) { setErr("Tell the warden the reason"); return; }
    setSaving(true);
    try {
      await api.post("/hostel/portal/leaves", { student_id: studentId, kind, from_at: toIso(fromDay, fromTime), to_at: toIso(toDay, toTime),
        reason: reason.trim(), escort: escort.trim() || null });
      toast.success("Request sent", { description: "The warden will approve or reply." });
      onSaved();
    } catch (e2) { setErr(errText(e2)); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title="Ask for leave or an out-pass"
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="ask-leave" loading={saving}>Send request</Button></>}>
      <form id="ask-leave" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Type" className="sm:col-span-2">
            <Select value={kind} onChange={(x) => setKind((x as "leave" | "outpass") || "leave")} options={[{ value: "leave", label: "Leave (nights at home)" }, { value: "outpass", label: "Out-pass (back the same day)" }]} />
          </Field>
          <Field label="Leaves on"><DateInput value={fromDay} onChange={(x) => setFromDay(x || todayISO())} min={todayISO()} /></Field>
          <Field label="At"><TimeInput value={fromTime} onChange={setFromTime} /></Field>
          <Field label="Back on"><DateInput value={toDay} onChange={(x) => setToDay(x || todayISO())} min={fromDay} /></Field>
          <Field label="By"><TimeInput value={toTime} onChange={setToTime} /></Field>
          <Field label="Reason" required className="sm:col-span-2"><Textarea value={reason} onValueChange={(x) => { setReason(x); setErr(""); }} rows={2} /></Field>
          <Field label="Who will pick up" aside="Optional" className="sm:col-span-2"><TextInput value={escort} onValueChange={setEscort} placeholder="e.g. Father" /></Field>
          {err && <p className="sm:col-span-2 text-[13px] text-rose-700">{err}</p>}
        </FormGrid>
      </form>
    </Modal>
  );
}
