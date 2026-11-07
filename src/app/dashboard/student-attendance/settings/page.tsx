"use client";

/*
 * Attendance settings: how attendance is taken, locking, alerts and leave rules; the
 * statuses a register can carry; and the institution's own calendar (extra holidays and
 * working days, for everyone or some classes).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Pencil, Plus, Save, Tags } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, DataTable, DateInput, Field, FormGrid, FormSection, Modal, ModalCancel, MultiSelect, NumberInput,
  RadioCards, Select, Tabs, TextInput, TimeInput, Toggle, type Column,
} from "@/components/ui-kit";
import { CodeChip, statusColor, type AttStatus } from "@/components/student_attendance/lib";

type Settings = {
  daily_sessions: number; lock_after_days: number; class_teacher_only: boolean; absence_alerts: boolean;
  absence_alert_when: "on_mark" | "after_time"; absence_alert_time: string; alert_on_late: boolean;
  low_attendance_threshold: number; low_attendance_alerts: boolean; low_alert_weekday: number; low_alert_min_units: number;
  notify_class_teacher_low: boolean; use_staff_holidays: boolean; leave_max_days: number; leave_past_days: number;
  leave_attachment_after_days: number; mode: string; sessions: number;
};
type CalDay = { uuid: string; date: string; kind: "holiday" | "working"; name: string; program_ids: number[]; active: boolean };
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function AttendanceSettingsPage() {
  const { can } = useAccess();
  const [tab, setTab] = useState<"rules" | "statuses" | "calendar">("rules");
  if (!can("attendance.settings")) {
    return <div><PageHeader title="Attendance settings" /><Paper><EmptyState title="You don't have access to this" hint="Ask an administrator for the attendance settings permission." /></Paper></div>;
  }
  return (
    <div>
      <PageHeader eyebrow={<Link href="/dashboard/student-attendance" className="hover:text-ink">Student attendance</Link>} title="Attendance settings"
        description="How attendance is taken, who is told, and which days are school days." />
      <div className="mb-5"><Tabs value={tab} onChange={setTab} items={[{ value: "rules", label: "Rules and alerts" }, { value: "statuses", label: "Statuses" }, { value: "calendar", label: "Calendar" }]} /></div>
      {tab === "rules" && <Rules />}
      {tab === "statuses" && <Statuses />}
      {tab === "calendar" && <CalendarDays_ />}
    </div>
  );
}

function Rules() {
  const toast = useToast();
  const { term } = useInstitution();
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get<Settings>("/student-attendance/settings").then(setS).catch(() => {}); }, []);
  if (!s) return <Paper className="p-6 text-muted">Loading…</Paper>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  async function save() {
    if (!s) return;
    setSaving(true);
    try {
      const { mode: _m, sessions: _s, ...body } = s;
      void _m; void _s;
      setS({ ...s, ...(await api.put<Settings>("/student-attendance/settings", body)) });
      toast.success("Settings saved");
    } catch (e) { toast.error("Couldn't save", { description: (e as Error).message }); } finally { setSaving(false); }
  }
  return (
    <Paper className="p-5 sm:p-6">
      <div className="space-y-8">
        <FormSection title="Taking attendance" description={`Mode: ${s.mode === "period" ? "every timetable period (subject teachers mark)" : "once a day"}. Change the mode in the institution profile.`}>
          {s.mode !== "period" && (
            <RadioCards columns={2} value={String(s.daily_sessions)} onChange={(v) => set("daily_sessions", Number(v))}
              options={[{ value: "1", label: "Once a day", description: "One register a day" }, { value: "2", label: "Morning and afternoon", description: "Two registers a day, each half a day" }]} />
          )}
          <FormGrid columns={2}>
            <Field label="Lock registers after" hint="Teachers can change a register for this many days. Later changes need a reason.">
              <NumberInput value={s.lock_after_days} onChange={(v) => set("lock_after_days", v ?? 0)} min={0} max={365} suffix="days" />
            </Field>
            {s.mode !== "period" && <div className="pt-6"><Toggle checked={s.class_teacher_only} onChange={(v) => set("class_teacher_only", v)} label={`Only the class ${term("teacher").toLowerCase()} marks`} description={`Off: any ${term("teacher").toLowerCase()} of the ${term("section").toLowerCase()} can mark.`} /></div>}
          </FormGrid>
          <Toggle checked={s.use_staff_holidays} onChange={(v) => set("use_staff_holidays", v)} label="Staff holidays are school holidays" description="Use the default holiday calendar from Leave settings, plus the dates on the Calendar tab." />
        </FormSection>
        <FormSection title="Absence alerts" description={`${term("guardians")} are told in the portal when their child is marked absent.`}>
          <Toggle checked={s.absence_alerts} onChange={(v) => set("absence_alerts", v)} label="Send absence alerts" />
          {s.absence_alerts && (
            <FormGrid columns={2}>
              <Field label="When"><Select value={s.absence_alert_when} onChange={(v) => v && set("absence_alert_when", v as Settings["absence_alert_when"])}
                options={[{ value: "on_mark", label: "As soon as the register is saved" }, { value: "after_time", label: "Once a day at a set time" }]} /></Field>
              {s.absence_alert_when === "after_time" && <Field label="Time"><TimeInput value={s.absence_alert_time} onChange={(v) => set("absence_alert_time", v)} /></Field>}
            </FormGrid>
          )}
          {s.absence_alerts && <Checkbox checked={s.alert_on_late} onChange={(v) => set("alert_on_late", v)} label="Also tell them when their child is late" />}
        </FormSection>
        <FormSection title="Low attendance" description="Learners below the threshold are listed in reports and their families get a weekly alert.">
          <FormGrid columns={3}>
            <Field label="Threshold"><NumberInput value={s.low_attendance_threshold} onChange={(v) => set("low_attendance_threshold", v ?? 75)} min={1} max={100} suffix="%" /></Field>
            <Field label="Weekly alert on"><Select value={s.low_alert_weekday} onChange={(v) => v && set("low_alert_weekday", v as number)} options={WEEKDAYS.map((d, i) => ({ value: i + 1, label: d }))} /></Field>
            <Field label="Only after" hint="Days or periods marked"><NumberInput value={s.low_alert_min_units} onChange={(v) => set("low_alert_min_units", v ?? 0)} min={0} max={500} /></Field>
          </FormGrid>
          <Toggle checked={s.low_attendance_alerts} onChange={(v) => set("low_attendance_alerts", v)} label={`Weekly alert to ${term("guardians").toLowerCase()}`} />
          <Toggle checked={s.notify_class_teacher_low} onChange={(v) => set("notify_class_teacher_low", v)} label={`Tell the class ${term("teacher").toLowerCase()} too`} />
        </FormSection>
        <FormSection title="Leave requests" description={`Asked for by ${term("guardians").toLowerCase()} and ${term("students").toLowerCase()} in the portal, approved by the class ${term("teacher").toLowerCase()}. Change who approves in Settings > Approval flows.`}>
          <FormGrid columns={3}>
            <Field label="Longest request"><NumberInput value={s.leave_max_days} onChange={(v) => set("leave_max_days", v ?? 15)} min={1} max={120} suffix="days" /></Field>
            <Field label="Can ask for past days"><NumberInput value={s.leave_past_days} onChange={(v) => set("leave_past_days", v ?? 0)} min={0} max={60} suffix="days back" /></Field>
            <Field label="Note needed after" hint="0 = never"><NumberInput value={s.leave_attachment_after_days} onChange={(v) => set("leave_attachment_after_days", v ?? 0)} min={0} max={60} suffix="days" /></Field>
          </FormGrid>
        </FormSection>
        <div className="flex justify-end"><Button variant="primary" icon={Save} loading={saving} onClick={save}>Save settings</Button></div>
      </div>
    </Paper>
  );
}

function Statuses() {
  const [rows, setRows] = useState<AttStatus[] | null>(null);
  const [editing, setEditing] = useState<AttStatus | "new" | null>(null);
  const load = () => api.get<{ items: AttStatus[] }>("/student-attendance/statuses?all=true").then((r) => setRows(r.items)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const cols: Column<AttStatus>[] = [
    { key: "c", header: "Code", width: "80px", cell: (r) => <CodeChip code={r.code} statuses={rows ?? []} /> },
    { key: "n", header: "Name", cell: (r) => <span className="text-ink">{r.name}</span> },
    { key: "w", header: "Counts as", cell: (r) => <span className="text-[13px] text-muted">{!r.in_total ? "Left out" : r.counts_as >= 1 ? "Present" : r.counts_as > 0 ? `${r.counts_as * 100}% present` : "Absent"}</span> },
    { key: "f", header: "Used for", hideBelow: "sm", cell: (r) => <span className="flex flex-wrap gap-1">{r.is_absent && <Badge tone="bad">Absence alert</Badge>}{r.is_late && <Badge tone="warn">Late minutes</Badge>}{r.is_leave && <Badge tone="info">Leave</Badge>}</span> },
    { key: "a", header: "Status", cell: (r) => <Badge tone={r.active ? "good" : "neutral"} dot>{r.active ? "In use" : "Off"}</Badge> },
  ];
  return (
    <div>
      <div className="mb-3 flex justify-end"><Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>New status</Button></div>
      <DataTable rows={rows ?? []} rowKey={(r) => r.uuid} columns={cols} loading={!rows} onRowClick={setEditing}
        rowActions={(r) => [{ label: "Edit", icon: Pencil, onSelect: () => setEditing(r) }]} emptyIcon={Tags} emptyTitle="No statuses" />
      <StatusForm target={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

function StatusForm({ target, onClose, onSaved }: { target: AttStatus | "new" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const editing = target && target !== "new" ? target : null;
  const [v, setV] = useState({ code: "", name: "", counts_as: 1, in_total: true, is_absent: false, is_late: false, is_leave: false, color: "#3e63dd", sort_order: 50, active: true });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (editing) setV({ code: editing.code, name: editing.name, counts_as: editing.counts_as, in_total: editing.in_total, is_absent: editing.is_absent, is_late: editing.is_late, is_leave: editing.is_leave, color: statusColor(editing), sort_order: editing.sort_order, active: editing.active });
    else setV({ code: "", name: "", counts_as: 1, in_total: true, is_absent: false, is_late: false, is_leave: false, color: "#3e63dd", sort_order: 50, active: true });
  }, [target, editing]);
  async function save() {
    setBusy(true);
    try {
      if (editing) { const { code: _c, ...rest } = v; void _c; await api.put(`/student-attendance/statuses/${editing.uuid}`, rest); }
      else { const { active: _a, ...rest } = v; void _a; await api.post("/student-attendance/statuses", rest); }
      toast.success("Status saved");
      onSaved();
    } catch (e) { toast.error("Couldn't save", { description: (e as Error).message }); } finally { setBusy(false); }
  }
  return (
    <Modal open={!!target} onClose={onClose} busy={busy} size="md" title={editing ? `Edit ${editing.name}` : "New status"}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={save} disabled={!v.code || !v.name}>Save</Button></>}>
      <div className="space-y-4">
        <FormGrid columns={2}>
          <Field label="Code" required hint="Shown in the register, e.g. SL"><TextInput value={v.code} onValueChange={(x) => setV({ ...v, code: x.toUpperCase() })} maxLength={10} disabled={!!editing} /></Field>
          <Field label="Name" required><TextInput value={v.name} onValueChange={(x) => setV({ ...v, name: x })} maxLength={60} /></Field>
          <Field label="Counts as present" hint="1 present, 0.5 half day, 0 absent"><NumberInput value={v.counts_as} onChange={(x) => setV({ ...v, counts_as: x ?? 0 })} min={0} max={1} step={0.25} /></Field>
          <Field label="Colour"><input type="color" value={v.color} onChange={(e) => setV({ ...v, color: e.target.value })} className="h-9 w-full rounded-lg border border-line bg-surface" /></Field>
        </FormGrid>
        <Checkbox checked={v.in_total} onChange={(x) => setV({ ...v, in_total: x })} label="Counts in the attendance total" description="Off: days with this mark are left out of the percentage." />
        <Checkbox checked={v.is_absent} onChange={(x) => setV({ ...v, is_absent: x })} label="Is an absence" description="Sends absence alerts to families." />
        <Checkbox checked={v.is_late} onChange={(x) => setV({ ...v, is_late: x })} label="Is late" description="Asks for late minutes." />
        <Checkbox checked={v.is_leave} onChange={(x) => setV({ ...v, is_leave: x })} label="Is a kind of leave" description="Families can pick it when asking for leave; approved leave uses it." />
        {editing && <Toggle checked={v.active} onChange={(x) => setV({ ...v, active: x })} label="In use" />}
      </div>
    </Modal>
  );
}

function CalendarDays_() {
  const { term } = useInstitution();
  const [rows, setRows] = useState<CalDay[] | null>(null);
  const [programs, setPrograms] = useState<{ id: number; name: string }[]>([]);
  const [editing, setEditing] = useState<CalDay | "new" | null>(null);
  const load = () => api.get<{ items: CalDay[] }>("/student-attendance/calendar?all=true&active=true").then((r) => setRows(r.items)).catch(() => setRows([]));
  useEffect(() => { load(); api.get<{ items: { id: number; name: string }[] }>("/academics/programs?all=true").then((r) => setPrograms(r.items)).catch(() => {}); }, []);
  const names = Object.fromEntries(programs.map((p) => [p.id, p.name]));
  const cols: Column<CalDay>[] = [
    { key: "d", header: "Date", sortable: true, sortValue: (r) => r.date, cell: (r) => formatDate(r.date, { weekday: "short" }) },
    { key: "n", header: "Name", cell: (r) => <span className="text-ink">{r.name}</span> },
    { key: "k", header: "Kind", cell: (r) => <Badge tone={r.kind === "holiday" ? "warn" : "good"}>{r.kind === "holiday" ? "Holiday" : "Working day"}</Badge> },
    { key: "p", header: "For", hideBelow: "sm", cell: (r) => <span className="text-[13px] text-muted">{r.program_ids.length ? r.program_ids.map((i) => names[i]).join(", ") : "Everyone"}</span> },
  ];
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13px] text-muted">Weekly offs come from the institution profile and staff holidays from Leave settings. Add school-only holidays (sports day, exam break) or extra working days (a Saturday make-up day) here.</p>
        <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Add day</Button>
      </div>
      <DataTable rows={rows ?? []} rowKey={(r) => r.uuid} columns={cols} loading={!rows} onRowClick={setEditing}
        emptyIcon={CalendarDays} emptyTitle="No days added" emptyHint={`Add holidays or extra working days for all ${term("programs").toLowerCase()} or some.`} />
      <CalForm target={editing} programs={programs} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

function CalForm({ target, programs, onClose, onSaved }: { target: CalDay | "new" | null; programs: { id: number; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const editing = target && target !== "new" ? target : null;
  const [v, setV] = useState({ date: "", kind: "holiday", name: "", program_ids: [] as number[] });
  const [busy, setBusy] = useState(false);
  useEffect(() => { setV(editing ? { date: editing.date, kind: editing.kind, name: editing.name, program_ids: editing.program_ids } : { date: "", kind: "holiday", name: "", program_ids: [] }); }, [target, editing]);
  async function save(remove = false) {
    setBusy(true);
    try {
      if (remove && editing) await api.delete(`/student-attendance/calendar/${editing.uuid}`);
      else if (editing) await api.put(`/student-attendance/calendar/${editing.uuid}`, v);
      else await api.post("/student-attendance/calendar", v);
      toast.success(remove ? "Removed" : "Saved");
      onSaved();
    } catch (e) { toast.error("Couldn't save", { description: (e as Error).message }); } finally { setBusy(false); }
  }
  return (
    <Modal open={!!target} onClose={onClose} busy={busy} size="md" title={editing ? "Edit day" : "Add a day"}
      footerStart={editing ? <Button variant="ghost" onClick={() => save(true)}>Remove</Button> : undefined}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} onClick={() => save()} disabled={!v.date || !v.name}>Save</Button></>}>
      <div className="space-y-4">
        <FormGrid columns={2}>
          <Field label="Date" required><DateInput value={v.date} onChange={(x) => setV({ ...v, date: x })} /></Field>
          <Field label="Name" required><TextInput value={v.name} onValueChange={(x) => setV({ ...v, name: x })} placeholder="e.g. Annual sports day" /></Field>
        </FormGrid>
        <RadioCards columns={2} value={v.kind} onChange={(x) => setV({ ...v, kind: x })}
          options={[{ value: "holiday", label: "Holiday", description: "No attendance" }, { value: "working", label: "Working day", description: "Attendance on a usual day off" }]} />
        <Field label={`Only for some ${term("programs").toLowerCase()}`} hint="Leave empty for everyone.">
          <MultiSelect value={v.program_ids} onChange={(x) => setV({ ...v, program_ids: x as number[] })} options={programs.map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
      </div>
    </Modal>
  );
}
