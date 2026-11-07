"use client";

/*
 * Parent-teacher meetings. Planners create a meeting day for some sections (times, slot length,
 * breaks, in person or online), pick the teachers and open bookings; parents book from the
 * portal. Teachers open their schedule to record attendance, notes and action points.
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarCheck2, Check, Clock, Handshake, Lock, Plus, Trash2, Unlock, UserX, Video, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { formatTime } from "@/lib/datetime";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, DataTable, DateInput, Field, FilterBar, FormGrid, IconButton, KeyValue, Modal, ModalCancel,
  MultiSelect, NumberInput, RadioCards, Section, Skeleton, Tabs, TextInput, Textarea, TimeInput, Toggle, formatDisplayDate,
  useConfirm, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { errText, type Paged } from "@/components/comms/shared";

type Day = {
  id: number; uuid: string; title: string; date: string; start_time: string; end_time: string; slot_minutes: number; gap_minutes: number;
  breaks: { start: string; end: string; label?: string }[]; mode: "in_person" | "online" | "both"; location: string | null; meeting_link: string | null;
  section_ids: number[]; sections: string[]; instructions: string | null; notes_visible_default: boolean; status: string;
  stats: { teachers: number; slots: number; booked: number; met: number; no_show: number };
};
type Teacher = { id: number; uuid: string; employee_id: number; name: string; location: string | null; meeting_link: string | null; slots: number; booked: number };
type DayFull = Day & { teachers: Teacher[]; can_manage: boolean; my_teacher_id: number | null };
type Booking = {
  id: number; uuid: string; start_at: string; end_at: string; student_name: string; guardian_name: string | null; booked_by: string | null;
  mode: string; status: string; parent_note: string | null; notes: string | null; action_points: { text: string; done: boolean }[]; notes_visible: boolean;
};
type Slot = { id: number; uuid: string; start_at: string; end_at: string; blocked: boolean; booking: Booking | null };

const STATUS: Record<string, { label: string; tone: "neutral" | "good" | "info" | "warn" }> = {
  draft: { label: "Draft", tone: "neutral" }, open: { label: "Booking open", tone: "good" }, closed: { label: "Booking closed", tone: "info" }, completed: { label: "Completed", tone: "neutral" },
};
const MODE = { in_person: "In person", online: "Online", both: "In person or online" };

export default function PtmPage() {
  const toast = useToast();
  const canManage = useAccess().can("comms.ptm.manage");
  const [tab, setTab] = useState("upcoming");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; page: Paged<Day> } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [formFor, setFormFor] = useState<DayFull | "new" | null>(null);
  const [formKey, setFormKey] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const key = `${tab}|${q}|${JSON.stringify(filters)}|${page}|${nonce}`;
  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ page: String(page), size: "25", status: filters.status?.[0] ?? tab });
    if (q) p.set("q", q);
    api.get<Paged<Day>>(`/comms/ptm/days?${p}`).then((r) => { if (live) setData({ key, page: r }); })
      .catch((e) => { if (live) { setData({ key, page: { items: [], total: 0, page: 1, size: 25 } }); toast.error(errText(e)); } });
    return () => { live = false; };
  }, [key, tab, q, filters, page, toast]);

  const columns: Column<Day>[] = [
    { key: "title", header: "Meeting day", cell: (d) => <div className="min-w-0"><p className="truncate text-ink">{d.title}</p><p className="truncate text-[12.5px] text-muted">{d.sections.join(", ")}</p></div> },
    { key: "date", header: "Date", cell: (d) => <span className="text-[13.5px]">{formatDisplayDate(d.date)} <span className="text-muted">· {d.start_time}–{d.end_time}</span></span> },
    { key: "mode", header: "Mode", hideBelow: "md", cell: (d) => <span className="text-[13px] text-muted">{MODE[d.mode]}</span> },
    { key: "booked", header: "Booked", align: "right", hideBelow: "sm", cell: (d) => <span className="tabular text-[13px] text-muted">{d.stats.booked}/{d.stats.slots}</span> },
    { key: "status", header: "Status", cell: (d) => <Badge tone={STATUS[d.status]?.tone} dot>{STATUS[d.status]?.label ?? d.status}</Badge> },
  ];
  const openForm = (d: DayFull | "new") => { setFormKey((k) => k + 1); setFormFor(d); };
  return (
    <div>
      <PageHeader eyebrow="Communicate" title="Parent-teacher meetings" description="Plan meeting days, let parents book a slot with each teacher and keep notes of every meeting."
        actions={canManage && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New meeting day</Button>} />
      <MyMeetings onOpen={setViewing} />
      <Tabs className="mb-4" value={tab} onChange={(v) => { setTab(v); setPage(1); }} items={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }]} />
      <FilterBar searchPlaceholder="Search meeting days" onSearchChange={(v) => { setQ(v); setPage(1); }} values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[{ key: "status", label: "Status", options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })) }]} />
      <DataTable rows={data?.page.items ?? []} rowKey={(d) => d.uuid} columns={columns} loading={data?.key !== key} onRowClick={(d) => setViewing(d.uuid)}
        pagination={{ page, size: 25, total: data?.page.total ?? 0, onPageChange: setPage }} emptyIcon={Handshake}
        emptyTitle={tab === "upcoming" ? "No meeting days planned" : "No past meeting days"}
        emptyHint={canManage ? "Create a meeting day, pick the sections and teachers, then open bookings for parents." : "Meeting days you take part in appear here."}
        emptyAction={canManage && tab === "upcoming" ? <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New meeting day</Button> : undefined} />
      <DayDetail uuid={viewing} onClose={() => { setViewing(null); refresh(); }} onEdit={(d) => { setViewing(null); openForm(d); }} />
      {formFor && <DayForm key={formKey} target={formFor} onClose={() => setFormFor(null)} onSaved={(uuid) => { setFormFor(null); refresh(); setViewing(uuid); }} />}
    </div>
  );
}

function MyMeetings({ onOpen }: { onOpen: (uuid: string) => void }) {
  const [rows, setRows] = useState<{ day: Day; teacher: Teacher }[] | null>(null);
  useEffect(() => { api.get<{ day: Day; teacher: Teacher }[]>("/comms/ptm/mine").then(setRows).catch(() => setRows([])); }, []);
  if (!rows?.length) return null;
  return (
    <Paper className="mb-6">
      <PaperHeader title="Your meetings" />
      <ul className="divide-y divide-line">
        {rows.map(({ day, teacher }) => (
          <li key={day.uuid}>
            <button type="button" onClick={() => onOpen(day.uuid)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-sunken/50">
              <CalendarCheck2 size={18} strokeWidth={1.4} className="text-primary" />
              <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-ink">{day.title}</span><span className="text-[12.5px] text-muted">{formatDisplayDate(day.date)} · {day.start_time}–{day.end_time}</span></span>
              <span className="tabular text-[13px] text-muted">{teacher.booked} booked</span>
            </button>
          </li>
        ))}
      </ul>
    </Paper>
  );
}

/* ── Day details ───────────────────────────────────────────────────────── */

function DayDetail({ uuid, onClose, onEdit }: { uuid: string | null; onClose: () => void; onEdit: (d: DayFull) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [d, setD] = useState<DayFull | null>(null);
  const [teacherFor, setTeacherFor] = useState<{ uuid: string | null; t: Teacher | null }>({ uuid: null, t: null });
  const teacher = teacherFor.uuid === uuid ? teacherFor.t : null;
  const setTeacher = (t: Teacher | null) => setTeacherFor({ uuid, t });
  const [nonce, setNonce] = useState(0);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!uuid) return;
    api.get<DayFull>(`/comms/ptm/days/${uuid}`).then((r) => {
      setD(r);
      if (!r.can_manage && r.my_teacher_id) setTeacherFor({ uuid, t: r.teachers.find((t) => t.id === r.my_teacher_id) ?? null });
    }).catch((e) => { toast.error(errText(e)); onClose(); });
  }, [uuid, nonce, toast, onClose]);
  const cur = d && d.uuid === uuid ? d : null;

  async function status(s: string) {
    if (!cur) return;
    if (s === "open" && !(await confirm({ title: "Open bookings?", message: "Parents of these sections are told and can book from the portal. The day is added to the calendar.", confirmLabel: "Open bookings", tone: "primary" }))) return;
    try { await api.post(`/comms/ptm/days/${cur.uuid}/status`, { status: s }); toast.success(s === "open" ? "Bookings are open" : "Updated"); setNonce((n) => n + 1); } catch (e) { toast.error(errText(e)); }
  }
  return (
    <Modal open={!!uuid} onClose={onClose} size="xl" title={teacher ? `${teacher.name}'s schedule` : cur?.title}
      description={cur && <span className="flex flex-wrap items-center gap-2">{formatDisplayDate(cur.date)} · {cur.start_time}–{cur.end_time} · {MODE[cur.mode]}<Badge tone={STATUS[cur.status]?.tone} dot>{STATUS[cur.status]?.label}</Badge></span>}
      headerActions={teacher && cur?.can_manage ? <Button size="sm" variant="ghost" onClick={() => setTeacher(null)}>All teachers</Button> : cur?.can_manage && cur.status === "draft" ? <Button size="sm" onClick={() => onEdit(cur)}>Edit</Button> : undefined}
      footer={cur?.can_manage && !teacher ? <>
        {cur.status === "draft" && <Button variant="primary" icon={Unlock} onClick={() => status("open")}>Open bookings</Button>}
        {cur.status === "open" && <Button icon={Lock} onClick={() => status("closed")}>Close bookings</Button>}
        {cur.status === "closed" && <><Button icon={Unlock} onClick={() => status("open")}>Reopen</Button><Button variant="primary" icon={Check} onClick={() => status("completed")}>Mark completed</Button></>}
      </> : undefined}>
      {!cur ? <Skeleton className="h-64 w-full" /> : teacher ? <Schedule teacher={teacher} /> : (
        <div className="space-y-6">
          <KeyValue columns={3} items={[
            { label: "Sections", value: cur.sections.join(", "), span: 2 }, { label: "Slots", value: `${cur.slot_minutes} min${cur.gap_minutes ? ` + ${cur.gap_minutes} min gap` : ""}` },
            { label: "Booked", value: `${cur.stats.booked} of ${cur.stats.slots}` }, { label: "Met", value: String(cur.stats.met) }, { label: "No-show", value: String(cur.stats.no_show) },
            ...(cur.location ? [{ label: "Place", value: cur.location }] : []), ...(cur.meeting_link ? [{ label: "Online link", value: cur.meeting_link, span: 2 as const }] : []),
            ...(cur.breaks.length ? [{ label: "Breaks", value: cur.breaks.map((b) => `${b.start}–${b.end}`).join(", ") }] : []),
          ]} />
          <Section title="Teachers" description="Open a teacher to see their slots and bookings." action={cur.can_manage && <Button size="sm" onClick={() => setPicking(true)}>Change teachers</Button>} className="border-t border-line">
            <ul className="grid gap-2 sm:grid-cols-2">
              {cur.teachers.map((t) => (
                <li key={t.uuid}>
                  <button type="button" onClick={() => setTeacher(t)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-left hover:border-line-strong">
                    <span className="truncate text-[14px] text-ink">{t.name}</span>
                    <span className="tabular shrink-0 text-[12.5px] text-muted">{t.booked}/{t.slots} booked</span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>
          {picking && <TeachersModal day={cur} onClose={() => setPicking(false)} onSaved={() => { setPicking(false); setNonce((n) => n + 1); }} />}
        </div>
      )}
    </Modal>
  );
}

function TeachersModal({ day, onClose, onSaved }: { day: DayFull; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [ids, setIds] = useState<number[]>(day.teachers.map((t) => t.employee_id));
  const [known] = useState<SelectOption<number>[]>(day.teachers.map((t) => ({ value: t.employee_id, label: t.name })));
  const [saving, setSaving] = useState(false);
  const search = async (q: string) => {
    const r = await api.get<{ id: number; first_name: string; last_name: string }[]>(`/employees/?status=active${q ? `&search=${encodeURIComponent(q)}` : ""}`);
    return (Array.isArray(r) ? r : []).slice(0, 30).map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}`.trim() }));
  };
  async function save() {
    setSaving(true);
    try { await api.post(`/comms/ptm/days/${day.uuid}/teachers`, { employee_ids: ids }); toast.success("Teachers updated"); onSaved(); } catch (e) { toast.error(errText(e)); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" title="Teachers taking part" zIndex={60} busy={saving}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Save</Button></>}>
      <Field label="Teachers" hint="Slots are made for each teacher you add."><MultiSelect value={ids} onChange={setIds} loadOptions={search} selectedOptions={known} /></Field>
    </Modal>
  );
}

function Schedule({ teacher }: { teacher: Teacher }) {
  const toast = useToast();
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [open, setOpen] = useState<Booking | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => { api.get<{ slots: Slot[] }>(`/comms/ptm/teachers/${teacher.uuid}/schedule`).then((r) => setSlots(r.slots)).catch((e) => toast.error(errText(e))); }, [teacher.uuid, nonce, toast]);
  async function block(s: Slot) {
    try { await api.post(`/comms/ptm/slots/${s.uuid}/block`, { blocked: !s.blocked }); setNonce((n) => n + 1); } catch (e) { toast.error(errText(e)); }
  }
  if (!slots) return <Skeleton className="h-64 w-full" />;
  return (
    <>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {slots.map((s) => (
          <li key={s.uuid} className="flex items-center gap-3 px-4 py-2.5">
            <span className="tabular w-28 shrink-0 text-[13.5px] text-muted">{formatTime(s.start_at)} – {formatTime(s.end_at)}</span>
            {s.booking ? (
              <button type="button" onClick={() => setOpen(s.booking)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-ink">{s.booking.student_name}</span><span className="block truncate text-[12.5px] text-muted">{s.booking.booked_by}{s.booking.mode === "online" ? " · online" : ""}{s.booking.parent_note ? ` · “${s.booking.parent_note}”` : ""}</span></span>
                {s.booking.mode === "online" && <Video size={14} strokeWidth={1.4} className="text-faint" />}
                <Badge tone={s.booking.status === "met" ? "good" : s.booking.status === "no_show" ? "bad" : "info"}>{s.booking.status === "met" ? "Met" : s.booking.status === "no_show" ? "No-show" : "Booked"}</Badge>
              </button>
            ) : (
              <>
                <span className={`flex-1 text-[13.5px] ${s.blocked ? "text-faint line-through" : "text-faint"}`}>{s.blocked ? "Not available" : "Free"}</span>
                <IconButton icon={s.blocked ? Clock : X} label={s.blocked ? "Make available" : "Block this slot"} onClick={() => block(s)} />
              </>
            )}
          </li>
        ))}
      </ul>
      {open && <BookingModal booking={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); setNonce((n) => n + 1); }} />}
    </>
  );
}

function BookingModal({ booking: b, onClose, onSaved }: { booking: Booking; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const [v, setV] = useState({ status: b.status, notes: b.notes ?? "", points: b.action_points ?? [], visible: b.notes_visible });
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api.put(`/comms/ptm/bookings/${b.uuid}`, { status: v.status, notes: v.notes, action_points: draft.trim() ? [...v.points, { text: draft.trim(), done: false }] : v.points, notes_visible: v.visible });
      toast.success("Saved"); onSaved();
    } catch (e) { toast.error(errText(e)); } finally { setSaving(false); }
  }
  async function cancel() {
    if (!(await confirm({ title: "Cancel this booking?", message: "The parent is told and can pick another slot.", confirmLabel: "Cancel booking", tone: "danger" }))) return;
    try { await api.post(`/comms/ptm/bookings/${b.uuid}/cancel`); toast.success("Booking cancelled"); onSaved(); } catch (e) { toast.error(errText(e)); }
  }
  return (
    <Modal open onClose={onClose} size="md" zIndex={60} title={b.student_name} description={`${formatTime(b.start_at)} · ${b.booked_by ?? ""}${b.mode === "online" ? " · online" : ""}`} busy={saving}
      footerStart={<Button variant="ghost" icon={Trash2} onClick={cancel}>Cancel booking</Button>}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Save</Button></>}>
      <div className="space-y-5">
        {b.parent_note && <p className="rounded-xl bg-sunken/60 px-4 py-3 text-[13.5px] text-ink/80">“{b.parent_note}”</p>}
        <Field label="Attendance">
          <RadioCards columns={3} value={v.status} onChange={(x) => setV({ ...v, status: x })}
            options={[{ value: "booked", label: "Not yet" }, { value: "met", label: "Met", icon: Check }, { value: "no_show", label: "No-show", icon: UserX }]} />
        </Field>
        <Field label="Notes"><Textarea value={v.notes} onValueChange={(x) => setV({ ...v, notes: x })} rows={4} autoGrow placeholder="What you discussed" /></Field>
        <Field label="Action points">
          <div className="space-y-2">
            {v.points.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <Checkbox checked={p.done} onChange={(x) => setV({ ...v, points: v.points.map((q, j) => (j === i ? { ...q, done: x } : q)) })} label={p.text} />
                <IconButton icon={X} label="Remove" onClick={() => setV({ ...v, points: v.points.filter((_, j) => j !== i) })} />
              </div>
            ))}
            <div className="flex gap-2">
              <TextInput value={draft} onValueChange={setDraft} placeholder="Add an action point" className="flex-1"
                onKeyDown={(e) => { if (e.key === "Enter" && draft.trim()) { e.preventDefault(); setV({ ...v, points: [...v.points, { text: draft.trim(), done: false }] }); setDraft(""); } }} />
            </div>
          </div>
        </Field>
        <Toggle checked={v.visible} onChange={(x) => setV({ ...v, visible: x })} label={`${term("guardians")} can see the notes and action points`} />
      </div>
    </Modal>
  );
}

/* ── Day form ──────────────────────────────────────────────────────────── */

function DayForm({ target, onClose, onSaved }: { target: DayFull | "new"; onClose: () => void; onSaved: (uuid: string) => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const editing = target !== "new" ? target : null;
  const [sections, setSections] = useState<SelectOption<number>[]>([]);
  useEffect(() => { api.get<{ id: number; label: string }[]>("/academics/section-options").then((r) => setSections(r.map((s) => ({ value: s.id, label: s.label })))).catch(() => {}); }, []);
  const initial = {
    title: editing?.title ?? "", date: editing?.date ?? "", start_time: editing?.start_time ?? "09:00", end_time: editing?.end_time ?? "13:00",
    slot_minutes: editing?.slot_minutes ?? 10, gap_minutes: editing?.gap_minutes ?? 0, breaks: editing?.breaks ?? [{ start: "11:00", end: "11:15", label: "Break" }],
    mode: editing?.mode ?? "in_person", location: editing?.location ?? "", meeting_link: editing?.meeting_link ?? "", section_ids: editing?.section_ids ?? [],
    instructions: editing?.instructions ?? "", notes_visible_default: editing?.notes_visible_default ?? false,
  };
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((p) => ({ ...p, [k]: x }));
  async function save() {
    if (!v.title.trim() || !v.date || !v.section_ids.length) { toast.error(`Add a name, a date and at least one ${term("section").toLowerCase()}`); return; }
    setSaving(true);
    try {
      const payload = { ...v, slot_minutes: v.slot_minutes ?? 10, gap_minutes: v.gap_minutes ?? 0, location: v.location || null, meeting_link: v.meeting_link || null, instructions: v.instructions || null };
      const r = editing ? await api.put<DayFull>(`/comms/ptm/days/${editing.uuid}`, payload) : await api.post<DayFull>("/comms/ptm/days", payload);
      toast.success(editing ? "Meeting day updated" : "Meeting day created", { description: editing ? undefined : "Teachers of these sections were added with their slots." });
      onSaved(r.uuid);
    } catch (e) { toast.error("Couldn't save", { description: errText(e) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="lg" title={editing ? "Edit meeting day" : "New meeting day"} busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(initial)}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>{editing ? "Save changes" : "Create"}</Button></>}>
      <div className="space-y-5">
        <FormGrid>
          <Field label="Name" required className="sm:col-span-2"><TextInput autoFocusInModal value={v.title} onValueChange={(x) => set("title", x)} placeholder="e.g. Term 1 parent-teacher meeting" /></Field>
          <Field label={term("sections")} required className="sm:col-span-2"><MultiSelect value={v.section_ids} onChange={(x) => set("section_ids", x)} options={sections} placeholder={`Pick ${term("sections").toLowerCase()}`} /></Field>
          <Field label="Date" required><DateInput value={v.date} onChange={(x) => set("date", x)} /></Field>
          <FormGrid><Field label="From"><TimeInput value={v.start_time} onChange={(x) => set("start_time", x)} /></Field><Field label="To"><TimeInput value={v.end_time} onChange={(x) => set("end_time", x)} /></Field></FormGrid>
          <Field label="Each meeting"><NumberInput value={v.slot_minutes} onChange={(x) => set("slot_minutes", x ?? 10)} min={5} max={120} step={5} suffix="min" /></Field>
          <Field label="Gap between meetings"><NumberInput value={v.gap_minutes} onChange={(x) => set("gap_minutes", x ?? 0)} min={0} max={60} step={5} suffix="min" /></Field>
        </FormGrid>
        <Field label="Breaks" aside="Optional">
          <div className="space-y-2">
            {v.breaks.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <TimeInput value={b.start} onChange={(x) => set("breaks", v.breaks.map((y, j) => (j === i ? { ...y, start: x } : y)))} />
                <span className="text-muted">–</span>
                <TimeInput value={b.end} onChange={(x) => set("breaks", v.breaks.map((y, j) => (j === i ? { ...y, end: x } : y)))} />
                <IconButton icon={X} label="Remove break" onClick={() => set("breaks", v.breaks.filter((_, j) => j !== i))} />
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => set("breaks", [...v.breaks, { start: "12:00", end: "12:15", label: "Break" }])}>Add a break</Button>
          </div>
        </Field>
        <Field label="How parents meet">
          <RadioCards columns={3} value={v.mode} onChange={(x) => set("mode", x)} options={[{ value: "in_person", label: "In person" }, { value: "online", label: "Online", icon: Video }, { value: "both", label: "Parent chooses" }]} />
        </Field>
        <FormGrid>
          {v.mode !== "online" && <Field label="Place"><TextInput value={v.location} onValueChange={(x) => set("location", x)} placeholder="e.g. Classrooms, first floor" /></Field>}
          {v.mode !== "in_person" && <Field label="Online meeting link"><TextInput value={v.meeting_link} onValueChange={(x) => set("meeting_link", x)} placeholder="https://" /></Field>}
        </FormGrid>
        <Field label="Note for parents" aside="Optional"><Textarea value={v.instructions} onValueChange={(x) => set("instructions", x)} rows={2} autoGrow /></Field>
        <Toggle checked={v.notes_visible_default} onChange={(x) => set("notes_visible_default", x)} label="Parents see the teacher's notes by default" />
      </div>
    </Modal>
  );
}
