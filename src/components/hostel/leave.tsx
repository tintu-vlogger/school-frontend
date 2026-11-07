"use client";

/*
 * Hostel > Leave & out-passes: requests from parents (portal) and the warden. Open a request
 * to approve or reject it with a note, then mark the boarder out and back at the gate.
 */
import { useState } from "react";
import { CalendarClock, Check, LogIn, LogOut, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, todayISO } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, Select, Textarea,
  TextInput, TimeInput, Toggle, type Column, type FilterValues,
} from "@/components/ui-kit";
import { errText, searchStudents, useApiData, type Paged } from "@/components/transport/common";
import { LEAVE_LABEL, LEAVE_TONE, type Leave } from "./types";

export function toIso(day: string, time: string): string {
  return new Date(`${day}T${time || "00:00"}`).toISOString();
}

export function LeaveTab({ canManage }: { canManage: boolean }) {
  const { term } = useInstitution();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["open"] });
  const [page, setPage] = useState(1);
  const { data, loading, reload } = useApiData<Paged<Leave>>(`/hostel/leaves?page=${page}&size=25&q=${encodeURIComponent(q)}&status=${filters.status?.[0] ?? ""}`);
  const [view, setView] = useState<Leave | null>(null);
  const [form, setForm] = useState({ open: false, key: 0 });

  const columns: Column<Leave>[] = [
    { key: "student", header: term("student"), cell: (l) => <div><p className="text-ink">{l.student_name}</p><p className="text-[12.5px] text-muted">{l.admission_no}</p></div> },
    { key: "kind", header: "Type", hideBelow: "sm", cell: (l) => <span className="text-ink/80">{l.kind === "leave" ? "Leave" : "Out-pass"}</span> },
    { key: "when", header: "When", cell: (l) => <span className="text-[13px] text-ink/80">{formatDateTime(l.from_at)}<span className="block text-muted">to {formatDateTime(l.to_at)}</span></span> },
    { key: "by", header: "Asked by", hideBelow: "lg", cell: (l) => <span className="text-muted">{l.requested_via === "portal" ? "Parent" : l.requested_by}</span> },
    { key: "status", header: "Status", cell: (l) => <Badge tone={LEAVE_TONE[l.status]} dot>{LEAVE_LABEL[l.status]}</Badge> },
  ];

  return (
    <div>
      <FilterBar searchPlaceholder={`Search ${term("students").toLowerCase()}`} onSearchChange={(x) => { setQ(x); setPage(1); }}
        filters={[{ key: "status", label: "Status", options: [
          { value: "open", label: "Open (waiting, approved, away)" }, { value: "pending", label: "Waiting" }, { value: "out", label: "Away now" },
          { value: "returned", label: "Back" }, { value: "rejected", label: "Not approved" }, { value: "cancelled", label: "Cancelled" }] }]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={canManage ? <Button variant="primary" icon={Plus} onClick={() => setForm((f) => ({ open: true, key: f.key + 1 }))}>New leave</Button> : undefined} />
      <DataTable rows={data?.items ?? []} rowKey={(l) => l.uuid} columns={columns} loading={loading} onRowClick={setView}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={CalendarClock} emptyTitle="No leave requests" emptyHint="Parents ask from their portal; you can also add one here." />
      <LeaveDetail leave={view} canManage={canManage} onClose={() => setView(null)} onChanged={(l) => { setView(l); reload(); }} />
      <NewLeave key={form.key} open={form.open} onClose={() => setForm((f) => ({ ...f, open: false }))} onSaved={() => { setForm((f) => ({ ...f, open: false })); reload(); }} />
    </div>
  );
}

function LeaveDetail({ leave: l, canManage, onClose, onChanged }: { leave: Leave | null; canManage: boolean; onClose: () => void; onChanged: (l: Leave) => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(action: string) {
    if (!l) return;
    setBusy(true);
    try {
      const r = await api.post<Leave>(`/hostel/leaves/${l.uuid}/decide`, { action, note: note.trim() || null });
      toast.success({ approve: "Approved; parents are told", reject: "Not approved; parents are told", out: "Marked as left", back: "Marked as back", cancel: "Cancelled" }[action] || "Saved");
      setNote("");
      onChanged(r);
    } catch (e) { toast.error("Couldn't update", { description: errText(e) }); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={!!l} onClose={onClose} size="md" busy={busy} title={l ? `${l.kind === "leave" ? "Leave" : "Out-pass"}: ${l.student_name}` : ""}
      description={l ? <Badge tone={LEAVE_TONE[l.status]} dot>{LEAVE_LABEL[l.status]}</Badge> : undefined}
      footerStart={l && canManage && ["pending", "approved"].includes(l.status) ? <Button variant="ghost" icon={X} onClick={() => act("cancel")}>Cancel request</Button> : undefined}
      footer={l && canManage && (
        l.status === "pending" ? <><Button icon={X} onClick={() => act("reject")}>Don&apos;t approve</Button><Button variant="primary" icon={Check} onClick={() => act("approve")}>Approve</Button></>
          : l.status === "approved" ? <Button variant="primary" icon={LogOut} onClick={() => act("out")}>Mark as left</Button>
            : l.status === "out" ? <Button variant="primary" icon={LogIn} onClick={() => act("back")}>Mark as back</Button> : null
      )}>
      {l && (
        <div className="space-y-5">
          <KeyValue columns={2} items={[
            { label: "Leaves", value: formatDateTime(l.from_at) }, { label: "Returns", value: formatDateTime(l.to_at) },
            { label: "Reason", value: l.reason, span: 2 }, { label: "Goes with", value: l.escort },
            { label: "Asked by", value: l.requested_via === "portal" ? `${l.requested_by || "Parent"} (portal)` : l.requested_by },
            ...(l.decided_at ? [{ label: "Decided", value: `${l.decided_by || ""} · ${formatDateTime(l.decided_at)}` }, { label: "Note", value: l.decision_note }] : []),
            ...(l.out_at ? [{ label: "Left at", value: formatDateTime(l.out_at) }] : []),
            ...(l.returned_at ? [{ label: "Back at", value: formatDateTime(l.returned_at) }] : []),
          ]} />
          {canManage && l.status === "pending" && (
            <Field label="Note to parents" aside="Optional"><Textarea value={note} onValueChange={setNote} rows={2} placeholder="e.g. Please collect from the hostel office" /></Field>
          )}
        </div>
      )}
    </Modal>
  );
}

function NewLeave({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [student, setStudent] = useState<number | null>(null);
  const [kind, setKind] = useState<"leave" | "outpass">("outpass");
  const [fromDay, setFromDay] = useState(todayISO());
  const [fromTime, setFromTime] = useState("16:00");
  const [toDay, setToDay] = useState(todayISO());
  const [toTime, setToTime] = useState("19:00");
  const [reason, setReason] = useState("");
  const [escort, setEscort] = useState("");
  const [approve, setApprove] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!student) { setErr(`Pick a ${term("student").toLowerCase()}`); return; }
    setSaving(true);
    try {
      await api.post("/hostel/leaves", { student_id: student, kind, from_at: toIso(fromDay, fromTime), to_at: toIso(toDay, toTime),
        reason: reason.trim() || null, escort: escort.trim() || null, approve });
      toast.success(approve ? "Leave recorded and approved" : "Leave recorded");
      onSaved();
    } catch (e2) { setErr(errText(e2)); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title="New leave or out-pass"
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="leave-form" loading={saving}>Save</Button></>}>
      <form id="leave-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Boarder" required className="sm:col-span-2">
            <Select value={student} onChange={(x) => { setStudent(x); setErr(""); }} loadOptions={searchStudents} placeholder={`Search ${term("students").toLowerCase()}`} />
          </Field>
          <Field label="Type" className="sm:col-span-2">
            <Select value={kind} onChange={(x) => setKind((x as "leave" | "outpass") || "outpass")} options={[{ value: "outpass", label: "Out-pass (same day)" }, { value: "leave", label: "Leave (nights away)" }]} />
          </Field>
          <Field label="Leaves on"><DateInput value={fromDay} onChange={(x) => setFromDay(x || todayISO())} /></Field>
          <Field label="At"><TimeInput value={fromTime} onChange={setFromTime} /></Field>
          <Field label="Returns on"><DateInput value={toDay} onChange={(x) => setToDay(x || todayISO())} min={fromDay} /></Field>
          <Field label="By"><TimeInput value={toTime} onChange={setToTime} /></Field>
          <Field label="Reason" className="sm:col-span-2"><Textarea value={reason} onValueChange={setReason} rows={2} /></Field>
          <Field label="Goes with" aside="Optional"><TextInput value={escort} onValueChange={setEscort} placeholder="e.g. Father" /></Field>
          <div className="flex items-end"><Toggle checked={approve} onChange={setApprove} label="Approve now" /></div>
          {err && <p className="sm:col-span-2 text-[13px] text-rose-700">{err}</p>}
        </FormGrid>
      </form>
    </Modal>
  );
}
