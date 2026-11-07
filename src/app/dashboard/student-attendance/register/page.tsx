"use client";

/*
 * Mark a register: pick the section, date and (in period mode or with two sessions) the slot.
 * Everyone starts unmarked; "All present" fills the rest, then tap the exceptions. Late asks
 * for minutes; any learner can carry a remark. Approved leave arrives pre-filled. Locked
 * registers open read-only, or ask for a reason when the person may correct them.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarOff, CheckCheck, ChevronLeft, ChevronRight, Lock, MessageSquare, Save, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { formatDateTime, formatLongDate, todayISO } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DateInput, Field, IconButton, Menu, Modal, ModalCancel, NumberInput, Select, Skeleton, Tabs,
  TextInput, Textarea,
} from "@/components/ui-kit";
import { addDays, CodeChip, query, StatusPill, type AttStatus } from "@/components/student_attendance/lib";

type Slot = { slot: string; period_no: number; subject_id: number | null; label: string; subject_name?: string | null;
  start?: string | null; end?: string | null; teacher_name?: string | null; marked?: boolean };
type Row = {
  student_id: number; uuid: string; name: string; roll_no: string | null; photo_url: string | null; admission_no: string;
  code: string | null; late_minutes: number | null; remarks: string | null; source: string | null;
  leave: { uuid: string; reason: string; status_code: string } | null; pending_leave: { uuid: string; reason: string } | null;
};
type Register = {
  section: { id: number; label: string }; date: string; today: string; mode: string;
  day: { working: boolean; reason: string | null }; slots: Slot[]; slot: Slot | null;
  register: { marked_by: string | null; marked_at: string | null; updated_by: string | null; updated_at: string | null; total: number; present: number; absent: number } | null;
  students: Row[]; statuses: AttStatus[]; locked: boolean; future: boolean; can_mark: boolean; can_correct: boolean;
  can_edit: boolean; needs_reason: boolean; lock_after_days: number;
};
type Mark = { code: string | null; late_minutes: number | null; remarks: string | null; source: string | null };

const slotKey = (s: { slot: string; period_no: number; subject_id: number | null }) => `${s.slot}:${s.period_no}:${s.subject_id ?? 0}`;

export default function RegisterPage() {
  const { term } = useInstitution();
  const toast = useToast();
  const [sections, setSections] = useState<{ id: number; label: string }[] | null>(null);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [day, setDay] = useState<string>(todayISO());
  const [slot, setSlot] = useState<string>("");
  const [data, setData] = useState<Register | null>(null);
  const [loading, setLoading] = useState(false);
  const [marks, setMarks] = useState<Record<number, Mark>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [askReason, setAskReason] = useState(false);
  const [remarkFor, setRemarkFor] = useState<Row | null>(null);

  useEffect(() => {
    const q = query();
    if (q.get("date")) setDay(q.get("date")!);
    if (q.get("slot")) setSlot(`${q.get("slot")}:${q.get("period") ?? 0}:${q.get("subject") ?? 0}`);
    api.get<{ id: number; label: string; class_teacher_id: number | null }[]>("/student-attendance/sections").then((r) => {
      setSections(r);
      const want = Number(q.get("section"));
      setSectionId(r.find((s) => s.id === want)?.id ?? r[0]?.id ?? null);
    }).catch(() => setSections([]));
  }, []);

  const load = useCallback(async (sid: number, d: string, sk: string) => {
    setLoading(true);
    try {
      const [s, p, subj] = sk ? sk.split(":") : ["", "0", "0"];
      const qs = new URLSearchParams({ section_id: String(sid), on: d });
      if (s) { qs.set("slot", s); qs.set("period_no", p); if (subj !== "0") qs.set("subject_id", subj); }
      const r = await api.get<Register>(`/student-attendance/register?${qs}`);
      setData(r);
      setMarks(Object.fromEntries(r.students.map((x) => [x.student_id, { code: x.code, late_minutes: x.late_minutes, remarks: x.remarks, source: x.source }])));
      setDirty(false);
      if (r.slot && slotKey(r.slot) !== sk) setSlot(slotKey(r.slot));
    } catch (e) {
      toast.error("Couldn't open the register", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { if (sectionId) load(sectionId, day, slot); }, [sectionId, day, slot, load]);

  const statuses = data?.statuses ?? [];
  const quick = useMemo(() => {
    const order = ["P", "A", "L", "HD"];
    const q = order.map((c) => statuses.find((s) => s.code === c)).filter(Boolean) as AttStatus[];
    return q.length ? q : statuses.slice(0, 4);
  }, [statuses]);
  const others = statuses.filter((s) => !quick.includes(s));
  const present = statuses.find((s) => s.code === "P") ?? statuses.find((s) => s.counts_as >= 1 && !s.is_late && !s.is_leave);
  const editable = !!data?.can_edit;

  const set = (sid: number, patch: Partial<Mark>) => {
    setMarks((m) => ({ ...m, [sid]: { ...(m[sid] ?? { code: null, late_minutes: null, remarks: null, source: null }), ...patch } }));
    setDirty(true);
  };
  const allPresent = () => {
    if (!present || !data) return;
    setMarks((m) => {
      const out = { ...m };
      for (const r of data.students) {
        const cur = out[r.student_id];
        if (!cur?.code) out[r.student_id] = { ...(cur ?? { late_minutes: null, remarks: null, source: null }), code: present.code, source: "manual" };
      }
      return out;
    });
    setDirty(true);
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    let unmarked = 0;
    for (const r of data?.students ?? []) {
      const code = marks[r.student_id]?.code;
      if (!code) unmarked += 1; else c[code] = (c[code] ?? 0) + 1;
    }
    return { c, unmarked };
  }, [data, marks]);

  async function save(reason?: string) {
    if (!data || !sectionId || !data.slot) return;
    if (counts.unmarked) { toast.error(`${counts.unmarked} not marked yet`, { description: "Use All present, then change the exceptions." }); return; }
    if (data.needs_reason && !reason) { setAskReason(true); return; }
    setSaving(true);
    try {
      const r = await api.post<Register>("/student-attendance/register", {
        section_id: sectionId, date: day, slot: data.slot.slot, period_no: data.slot.period_no, subject_id: data.slot.subject_id,
        reason, marks: data.students.map((s) => ({ student_id: s.student_id, ...marks[s.student_id] })),
      });
      setData(r);
      setDirty(false);
      setAskReason(false);
      const absent = r.students.filter((s) => statuses.find((x) => x.code === s.code)?.is_absent).length;
      toast.success("Attendance saved", { description: `${r.register?.present ?? 0} present, ${absent} absent` });
    } catch (e) {
      toast.error("Couldn't save", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const sectionOptions = (sections ?? []).map((s) => ({ value: s.id, label: s.label }));
  return (
    <div className="pb-24">
      <PageHeader eyebrow={<Link href="/dashboard/student-attendance" className="hover:text-ink">Student attendance</Link>}
        title="Mark register" description={`Tap All present, then change the ${term("students").toLowerCase()} who are not.`} />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:w-64">
          <Field label={term("section")}>
            <Select value={sectionId} onChange={(v) => { if (v) { setSectionId(v as number); setSlot(""); } }} options={sectionOptions}
              placeholder={`Pick a ${term("section").toLowerCase()}`} />
          </Field>
        </div>
        <div className="flex items-end gap-1">
          <IconButton icon={ChevronLeft} label="Previous day" onClick={() => { setDay(addDays(day, -1)); setSlot(""); }} />
          <div className="w-44"><Field label="Date"><DateInput value={day} onChange={(v) => { if (v) { setDay(v); setSlot(""); } }} max={todayISO()} /></Field></div>
          <IconButton icon={ChevronRight} label="Next day" onClick={() => { setDay(addDays(day, 1)); setSlot(""); }} disabled={day >= todayISO()} />
        </div>
      </div>

      {sections && sections.length === 0 ? (
        <Paper><EmptyState icon={UserCheck} title={`No ${term("sections").toLowerCase()} to mark`}
          hint={`You can mark registers for ${term("sections").toLowerCase()} you are class ${term("teacher").toLowerCase()} of, or periods you teach.`} /></Paper>
      ) : !data || (loading && !data) ? (
        <Paper className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</Paper>
      ) : (
        <>
          {data.slots.length > 1 && (
            <div className="mb-3 overflow-x-auto">
              <Tabs variant="pill" value={slot || (data.slot ? slotKey(data.slot) : "")} onChange={(v) => setSlot(v)}
                items={data.slots.map((s) => ({ value: slotKey(s), label: `${s.label}${s.marked ? " ✓" : ""}` }))} />
            </div>
          )}

          <Paper className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-[13px]">
            <span className="text-ink">{data.section.label}</span>
            <span className="text-muted">{formatLongDate(data.date)}</span>
            {data.slot?.start && <span className="text-muted">{data.slot.start}–{data.slot.end}</span>}
            {data.slot?.teacher_name && <span className="text-muted">{data.slot.teacher_name}</span>}
            {!data.day.working && <Badge tone="neutral">{data.day.reason || "Holiday"}</Badge>}
            {data.locked && data.register && <Badge tone="warn"><Lock size={12} strokeWidth={1.4} className="mr-1 inline" />Locked</Badge>}
            {data.register && <span className="text-faint">Marked by {data.register.marked_by} · {formatDateTime(data.register.marked_at)}{data.register.updated_by && data.register.updated_by !== data.register.marked_by ? ` · changed by ${data.register.updated_by}` : ""}</span>}
            {!data.register && data.day.working && data.slot && <Badge tone="warn" dot>Not marked</Badge>}
          </Paper>

          {!data.day.working ? (
            <Paper><EmptyState icon={CalendarOff} title={`${data.day.reason || "Holiday"}: no attendance`} hint="Pick another date." /></Paper>
          ) : !data.slot ? (
            <Paper><EmptyState icon={CalendarOff} title="No classes to mark on this day"
              hint={data.mode === "period" ? "This section has no periods in the timetable on this day." : "Pick another date."} /></Paper>
          ) : data.students.length === 0 ? (
            <Paper><EmptyState icon={UserCheck} title={`No ${term("students").toLowerCase()} in this register`} hint={`Enrol ${term("students").toLowerCase()} in the ${term("section").toLowerCase()} first.`} /></Paper>
          ) : (
            <>
              {!editable && (
                <p className="mb-3 rounded-lg border border-line bg-surface px-4 py-2.5 text-[13px] text-muted">
                  {data.future ? "You can't mark a future date." : data.locked ? `This register is locked (${data.lock_after_days} days after the date). Ask the office to correct it.` : "You can view this register but not change it."}
                </p>
              )}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {editable && <Button icon={CheckCheck} onClick={allPresent} disabled={!counts.unmarked}>All present</Button>}
                <div className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
                  {statuses.filter((s) => counts.c[s.code]).map((s) => (
                    <span key={s.code} className="inline-flex items-center gap-1"><CodeChip code={s.code} statuses={statuses} />{counts.c[s.code]}</span>
                  ))}
                  {counts.unmarked > 0 && <span className="ml-1">{counts.unmarked} to mark</span>}
                </div>
              </div>
              <Paper className="divide-y divide-line">
                {data.students.map((r) => {
                  const m = marks[r.student_id] ?? { code: null, late_minutes: null, remarks: null, source: null };
                  const st = statuses.find((s) => s.code === m.code);
                  const other = others.find((s) => s.code === m.code);
                  return (
                    <div key={r.student_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <span className="tabular w-6 shrink-0 text-right text-[12.5px] text-faint">{r.roll_no}</span>
                        <Avatar name={r.name} src={r.photo_url ?? undefined} size={32} />
                        <div className="min-w-0">
                          <p className="truncate text-[14px] text-ink">{r.name}</p>
                          <p className="truncate text-[12px] text-muted">
                            {r.leave ? <span className="text-primary">On approved leave · {r.leave.reason}</span>
                              : r.pending_leave ? <span className="text-amber-700">Leave asked · {r.pending_leave.reason}</span>
                                : m.remarks || r.admission_no}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pl-9 sm:pl-0">
                        {quick.map((s) => (
                          <StatusPill key={s.code} status={s} active={m.code === s.code} disabled={!editable}
                            onClick={() => set(r.student_id, { code: s.code, source: "manual", late_minutes: s.is_late ? (m.late_minutes ?? 10) : null })} />
                        ))}
                        {others.length > 0 && (
                          other ? (
                            <Menu align="end" items={others.map((s) => ({ label: s.name, onSelect: () => set(r.student_id, { code: s.code, source: "manual" }) }))}
                              trigger={<StatusPill status={other} active disabled={!editable} />} />
                          ) : editable ? (
                            <Menu align="end" items={others.map((s) => ({ label: `${s.name} (${s.code})`, onSelect: () => set(r.student_id, { code: s.code, source: "manual", late_minutes: null }) }))}
                              trigger={<button type="button" className="h-9 rounded-lg border border-line px-2.5 text-[13px] text-muted hover:border-line-strong">More</button>} />
                          ) : null
                        )}
                        {st?.is_late && (
                          <div className="w-24"><NumberInput value={m.late_minutes} onChange={(v) => set(r.student_id, { late_minutes: v })} min={0} max={600} suffix="min" disabled={!editable} /></div>
                        )}
                        <IconButton icon={MessageSquare} label="Remark" onClick={() => setRemarkFor(r)} disabled={!editable && !m.remarks}
                          className={m.remarks ? "text-primary" : ""} />
                      </div>
                    </div>
                  );
                })}
              </Paper>
            </>
          )}
        </>
      )}

      {editable && data?.slot && data.students.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:inset-x-auto sm:left-1/2 sm:w-[420px] sm:-translate-x-1/2 sm:bottom-6 sm:rounded-2xl sm:border">
          <div className="flex items-center justify-between gap-4">
            <span className="text-[13px] text-muted">{dirty ? "Unsaved changes" : data.register ? "Saved" : "Not saved yet"}</span>
            <Button variant="primary" icon={Save} loading={saving} onClick={() => save()} disabled={!dirty && !!data.register}>
              {data.register ? "Save changes" : "Save attendance"}
            </Button>
          </div>
        </div>
      )}

      <ReasonModal open={askReason} onClose={() => setAskReason(false)} busy={saving} onSubmit={(r) => save(r)} />
      <RemarkModal row={remarkFor} value={remarkFor ? marks[remarkFor.student_id]?.remarks ?? "" : ""} editable={editable}
        onClose={() => setRemarkFor(null)} onSave={(v) => { if (remarkFor) set(remarkFor.student_id, { remarks: v || null }); setRemarkFor(null); }} />
    </div>
  );
}

function ReasonModal({ open, onClose, onSubmit, busy }: { open: boolean; onClose: () => void; onSubmit: (reason: string) => void; busy: boolean }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open={open} onClose={onClose} busy={busy} size="sm" title="Correct a locked register"
      description="The change is logged with your name and this reason."
      footer={<><ModalCancel /><Button variant="primary" loading={busy} disabled={!reason.trim()} onClick={() => onSubmit(reason.trim())}>Save correction</Button></>}>
      <Field label="Reason" required>
        <Textarea value={reason} onValueChange={setReason} rows={3} placeholder="e.g. Marked absent by mistake; was in the library" data-autofocus />
      </Field>
    </Modal>
  );
}

function RemarkModal({ row, value, editable, onClose, onSave }: { row: Row | null; value: string; editable: boolean; onClose: () => void; onSave: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value, row]);
  return (
    <Modal open={!!row} onClose={onClose} size="sm" title={row ? `Remark for ${row.name}` : "Remark"}
      footer={editable ? <><ModalCancel /><Button variant="primary" onClick={() => onSave(text.trim())}>Done</Button></> : <ModalCancel />}>
      <Field label="Remark" hint="Shown to the office and in reports.">
        <TextInput value={text} onValueChange={setText} maxLength={300} disabled={!editable} placeholder="e.g. Came with a parent" data-autofocus />
      </Field>
    </Modal>
  );
}
