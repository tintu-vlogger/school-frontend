"use client";

/*
 * Learning admin: classroom and online trainer-led batches. Add / Edit (sessions,
 * capacity, trainer); the roster modal shows confirmed and waitlisted seats, lets HR add
 * people, mark attendance per session and complete the batch.
 */
import { useEffect, useState } from "react";
import { CalendarDays, CheckCheck, MapPin, Pencil, Plus, Trash2, UserPlus, Users, Video } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, todayISO } from "@/lib/datetime";
import {
  Avatar, Badge, Button, Checkbox, DataTable, DateInput, Field, FormGrid, IconButton, Modal, ModalCancel, NumberInput, RadioCards, Select,
  Skeleton, Tabs, TextInput, TimeInput, useConfirm, type Column, type SelectOption,
} from "@/components/ui-kit";
import { errText, searchEmployees, useLoad, STROKE } from "../shared";
import type { Batch, Course, Session } from "../types";

export function BatchesTab() {
  const { data, loading, refresh } = useLoad<Batch[]>("/learning/batches", "Couldn't load batches");
  const [editing, setEditing] = useState<string | null | "new">(null);
  const [roster, setRoster] = useState<string | null>(null);

  const columns: Column<Batch>[] = [
    { key: "name", header: "Batch", cell: (b) => <div className="min-w-0"><p className="truncate text-ink">{b.name}</p><p className="truncate text-[12.5px] text-muted">{b.course?.title}</p></div> },
    { key: "when", header: "Sessions", hideBelow: "md", cell: (b) => b.sessions.length ? <span className="text-ink/80">{formatDate(b.sessions[0].date)}{b.sessions.length > 1 ? ` + ${b.sessions.length - 1} more` : ""}</span> : <span className="text-faint">—</span> },
    { key: "where", header: "Where", hideBelow: "lg", cell: (b) => <span className="inline-flex items-center gap-1.5 text-muted">{b.mode === "virtual" ? <Video size={14} strokeWidth={STROKE} /> : <MapPin size={14} strokeWidth={STROKE} />}{b.mode === "virtual" ? "Online" : b.venue || "Classroom"}</span> },
    { key: "trainer", header: "Trainer", hideBelow: "lg", cell: (b) => b.trainer ?? <span className="text-faint">—</span> },
    { key: "seats", header: "Seats", cell: (b) => <span className="tabular text-ink/80">{b.confirmed}/{b.capacity}{b.waitlisted ? <span className="text-amber-700"> · {b.waitlisted} waiting</span> : null}</span> },
    { key: "status", header: "Status", cell: (b) => <Badge tone={b.status === "completed" ? "good" : b.status === "cancelled" ? "neutral" : "info"} dot>{b.status === "scheduled" ? "Scheduled" : b.status === "completed" ? "Completed" : "Cancelled"}</Badge> },
  ];

  return (
    <>
      <div className="mb-4 flex justify-end"><Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Add batch</Button></div>
      <DataTable rows={data ?? []} rowKey={(b) => b.uuid} columns={columns} loading={loading} onRowClick={(b) => setRoster(b.uuid)}
        rowActions={(b) => [{ label: "Roster and attendance", icon: Users, onSelect: () => setRoster(b.uuid) }, { label: "Edit", icon: Pencil, onSelect: () => setEditing(b.uuid) }]}
        emptyIcon={CalendarDays} emptyTitle="No batches yet" emptyHint="Batches are for classroom and trainer-led courses."
        emptyAction={<Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Add batch</Button>} />
      <BatchFormModal open={editing !== null} uuid={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={refresh} />
      <RosterModal uuid={roster} onClose={() => setRoster(null)} onChanged={refresh} onEdit={(u) => { setRoster(null); setEditing(u); }} />
    </>
  );
}

type Draft = { course_id: number | null; name: string; mode: "classroom" | "virtual"; venue: string; meeting_link: string; capacity: number | null; trainer_employee_id: number | null; trainer_name: string; sessions: Session[] };
let sid = 0;
const newSession = (): Session => ({ id: `new${++sid}`, date: todayISO(), start: "10:00", end: "13:00", topic: "" });

function BatchFormModal({ open, uuid, onClose, onSaved }: { open: boolean; uuid: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState<Draft | null>(null);
  const [courses, setCourses] = useState<SelectOption<number>[]>([]);
  const [trainerOpt, setTrainerOpt] = useState<SelectOption<number> | null>(null);
  const [external, setExternal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDirty(false);
    api.get<Course[]>("/learning/courses?status=published").then((r) => setCourses((r ?? []).map((c) => ({ value: c.id, label: c.title })))).catch(() => {});
    if (!uuid) { setV({ course_id: null, name: "", mode: "classroom", venue: "", meeting_link: "", capacity: 20, trainer_employee_id: null, trainer_name: "", sessions: [newSession()] }); setExternal(false); setTrainerOpt(null); return; }
    setV(null);
    api.get<Batch>(`/learning/batches/${uuid}`).then((b) => {
      setV({ course_id: b.course_id, name: b.name, mode: b.mode, venue: b.venue ?? "", meeting_link: b.meeting_link ?? "", capacity: b.capacity, trainer_employee_id: b.trainer_employee_id, trainer_name: b.trainer_name ?? "", sessions: b.sessions });
      setExternal(!b.trainer_employee_id && !!b.trainer_name);
      setTrainerOpt(b.trainer_employee_id ? { value: b.trainer_employee_id, label: b.trainer ?? "Trainer" } : null);
    }).catch((e) => toast.error("Couldn't load the batch", { description: errText(e) }));
  }, [open, uuid, toast]);

  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => { setV((c) => (c ? { ...c, [k]: val } : c)); setDirty(true); };
  const setSession = (i: number, patch: Partial<Session>) => set("sessions", v!.sessions.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  async function save() {
    if (!v) return;
    setSaving(true);
    try {
      const body = { ...v, trainer_employee_id: external ? null : v.trainer_employee_id, trainer_name: external ? v.trainer_name : null, capacity: v.capacity ?? 0,
        sessions: v.sessions.map((s) => ({ ...s, id: s.id.startsWith("new") ? undefined : s.id })) };
      if (uuid) await api.put(`/learning/batches/${uuid}`, body); else await api.post("/learning/batches", body);
      toast.success(uuid ? "Batch saved" : "Batch added"); setDirty(false); onSaved(); onClose();
    } catch (e) { toast.error("Couldn't save the batch", { description: errText(e) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={uuid ? "Edit batch" : "Add batch"} dirty={dirty} busy={saving}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!v?.name.trim() || !v?.course_id} onClick={save}>{uuid ? "Save changes" : "Add batch"}</Button></>}>
      {!v ? <Skeleton className="h-64" /> : (
        <div className="space-y-5">
          <FormGrid>
            <Field label="Course" required><Select value={v.course_id} onChange={(x) => set("course_id", x)} options={courses} disabled={!!uuid} placeholder="Pick a course" /></Field>
            <Field label="Batch name" required><TextInput value={v.name} onValueChange={(x) => set("name", x)} placeholder="e.g. Bengaluru · March" /></Field>
          </FormGrid>
          <RadioCards columns={2} value={v.mode} onChange={(x) => set("mode", x as Draft["mode"])} options={[{ value: "classroom", label: "Classroom", icon: MapPin }, { value: "virtual", label: "Online", icon: Video }]} />
          <FormGrid>
            {v.mode === "classroom"
              ? <Field label="Venue"><TextInput value={v.venue} onValueChange={(x) => set("venue", x)} placeholder="Training room, floor" /></Field>
              : <Field label="Meeting link"><TextInput value={v.meeting_link} onValueChange={(x) => set("meeting_link", x)} placeholder="https://" /></Field>}
            <Field label="Seats" required><NumberInput value={v.capacity} onChange={(x) => set("capacity", x)} min={1} max={1000} /></Field>
          </FormGrid>
          <div className="space-y-3">
            <Checkbox checked={external} onChange={(x) => { setExternal(x); setDirty(true); }} label="External trainer" />
            {external
              ? <Field label="Trainer name"><TextInput value={v.trainer_name} onValueChange={(x) => set("trainer_name", x)} /></Field>
              : <Field label="Trainer"><Select value={v.trainer_employee_id} onChange={(x, o) => { set("trainer_employee_id", x); setTrainerOpt(o); }} loadOptions={searchEmployees} selectedOption={trainerOpt} clearable placeholder="Search employees" /></Field>}
          </div>
          <div>
            <p className="mb-2 text-[14px] text-ink">Sessions</p>
            <div className="space-y-2">
              {v.sessions.map((s, i) => (
                <div key={s.id} className="grid items-center gap-2 sm:grid-cols-[150px_100px_100px_1fr_auto]">
                  <DateInput value={s.date} onChange={(x) => setSession(i, { date: x })} />
                  <TimeInput value={s.start} onChange={(x) => setSession(i, { start: x })} />
                  <TimeInput value={s.end} onChange={(x) => setSession(i, { end: x })} />
                  <TextInput value={s.topic} onValueChange={(x) => setSession(i, { topic: x })} placeholder="Topic" />
                  <IconButton icon={Trash2} label="Remove session" size="sm" disabled={v.sessions.length === 1} onClick={() => set("sessions", v.sessions.filter((_, j) => j !== i))} />
                </div>
              ))}
            </div>
            <Button className="mt-2" size="sm" variant="secondary" icon={Plus} onClick={() => set("sessions", [...v.sessions, newSession()])}>Add session</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function RosterModal({ uuid, onClose, onChanged, onEdit }: { uuid: string | null; onClose: () => void; onChanged: () => void; onEdit: (u: string) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [b, setB] = useState<Batch | null>(null);
  const [session, setSession] = useState<string>("");
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = (u = uuid) => { if (u) api.get<Batch>(`/learning/batches/${u}`).then((r) => { setB(r); setSession((cur) => cur && r.sessions.some((s) => s.id === cur) ? cur : r.sessions[0]?.id ?? ""); }).catch(() => {}); };
  useEffect(() => { setB(null); load(); }, [uuid]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!b || !session) return;
    setPresent(new Set((b.seats ?? []).filter((s) => s.attendance?.[session] === "present").map((s) => s.uuid)));
  }, [b, session]);

  async function act(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try { await fn(); toast.success(ok); load(); onChanged(); } catch (e) { toast.error("Couldn't do that", { description: errText(e) }); } finally { setBusy(false); }
  }

  const confirmed = (b?.seats ?? []).filter((s) => s.status === "confirmed");
  const waiting = (b?.seats ?? []).filter((s) => s.status === "waitlisted");

  return (
    <Modal open={!!uuid} onClose={onClose} size="lg" title={b?.name ?? "Batch"} description={b ? [b.course?.title, `${b.confirmed}/${b.capacity} seats`, b.waitlisted ? `${b.waitlisted} waiting` : null].filter(Boolean).join(" · ") : undefined}
      headerActions={b && <Button size="sm" variant="secondary" icon={Pencil} onClick={() => onEdit(b.uuid)}>Edit</Button>}
      footer={b && b.status === "scheduled" ? <>
        <ModalCancel>Close</ModalCancel>
        <Button variant="secondary" icon={CheckCheck} loading={busy} onClick={async () => {
          if (await confirm({ title: "Complete this batch?", message: "People who attended every session complete the course and get their certificate.", confirmLabel: "Complete" }))
            act(async () => { const r = await api.post<{ completed: number }>(`/learning/batches/${b.uuid}/complete`, { min_attendance_pct: 100 }); toast.info(`${r.completed} completed`); }, "Batch completed");
        }}>Complete batch</Button>
      </> : <ModalCancel>Close</ModalCancel>}>
      {!b ? <Skeleton className="h-64" /> : (
        <div className="space-y-6">
          {b.status === "scheduled" && (
            <div className="flex items-end gap-2">
              <Field label="Add a person" className="flex-1"><Select value={adding} onChange={(x) => setAdding(x)} loadOptions={searchEmployees} placeholder="Search employees" clearable /></Field>
              <Button variant="secondary" icon={UserPlus} disabled={!adding} loading={busy} onClick={() => act(() => api.post(`/learning/batches/${b.uuid}/seats`, { employee_id: adding }).then(() => setAdding(null)), "Added")}>Add</Button>
            </div>
          )}
          {!!b.sessions.length && (
            <div>
              <p className="mb-2 text-[14px] text-ink">Attendance</p>
              <Tabs variant="pill" value={session} onChange={setSession} items={b.sessions.map((s, i) => ({ value: s.id, label: `${i + 1} · ${formatDate(s.date)}` }))} />
              <div className="mt-3 divide-y divide-line rounded-xl border border-line">
                {confirmed.length ? confirmed.map((s) => (
                  <div key={s.uuid} className="flex items-center gap-3 px-4 py-2.5">
                    <Checkbox checked={present.has(s.uuid)} onChange={(x) => setPresent((cur) => { const n = new Set(cur); if (x) n.add(s.uuid); else n.delete(s.uuid); return n; })} aria-label={`Present: ${s.employee?.name}`} />
                    <Avatar name={s.employee?.name ?? "?"} src={s.employee?.photo} size={28} />
                    <span className="min-w-0 flex-1 truncate text-[14px] text-ink/85">{s.employee?.name}<span className="text-muted">{s.employee?.department ? ` · ${s.employee.department}` : ""}</span></span>
                    {s.attendance?.[session] && <Badge tone={s.attendance[session] === "present" ? "good" : "bad"}>{s.attendance[session] === "present" ? "Present" : "Absent"}</Badge>}
                    {b.status === "scheduled" && <IconButton icon={Trash2} size="sm" label="Remove" onClick={() => act(() => api.delete(`/learning/batches/${b.uuid}/seats/${s.uuid}`), "Seat cancelled")} />}
                  </div>
                )) : <p className="px-4 py-6 text-center text-[13.5px] text-muted">No confirmed seats yet.</p>}
              </div>
              {!!confirmed.length && b.status === "scheduled" && (
                <Button className="mt-3" size="sm" variant="primary" loading={busy}
                  onClick={() => act(() => api.put(`/learning/batches/${b.uuid}/attendance`, { session_id: session, present: [...present] }), "Attendance saved")}>Save attendance</Button>
              )}
            </div>
          )}
          {!!waiting.length && (
            <div>
              <p className="mb-2 text-[14px] text-ink">Waitlist</p>
              <ol className="divide-y divide-line rounded-xl border border-line">
                {waiting.map((s, i) => (
                  <li key={s.uuid} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-5 text-[12.5px] tabular text-faint">{i + 1}</span>
                    <Avatar name={s.employee?.name ?? "?"} src={s.employee?.photo} size={26} />
                    <span className="flex-1 truncate text-[14px] text-ink/85">{s.employee?.name}</span>
                    <IconButton icon={Trash2} size="sm" label="Remove" onClick={() => act(() => api.delete(`/learning/batches/${b.uuid}/seats/${s.uuid}`), "Removed from waitlist")} />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
