"use client";

/*
 * Online classes (staff): today / upcoming / past lists, schedule one-off or weekly live classes
 * with the built-in video room or a Zoom / Meet / Teams link, join, attendance from joins,
 * recording link, cancel. ?view=<uuid> opens a class directly.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Ban, CalendarClock, Eye, Pencil, Plus, Video } from "lucide-react";
import { api } from "@/lib/api";
import { formatDateTime, formatLongDate, formatTime } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, Checkbox, DataTable, DateInput, Field, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, NumberInput,
  RadioCards, Section, Select, Skeleton, Tabs, TextInput, Textarea, TimeInput, useConfirm, type Column, type FilterValues,
} from "@/components/ui-kit";
import { LinkOut, PhaseBadge, RichText, sectionOptions, subjectOptions, useLmsOptions } from "@/components/lms/shared";
import { PROVIDERS, localDate, splitISO, toISO, type LiveClass, type Page } from "@/components/lms/lib";

type Attendance = {
  roster: { student_id: number; name: string; roll_no: string | null; joined: boolean; first_joined_at: string | null; join_count: number }[];
  others: { name: string; role: string; first_joined_at: string }[]; present: number; total: number;
};

const WEEKDAYS = [["1", "Mon"], ["2", "Tue"], ["3", "Wed"], ["4", "Thu"], ["5", "Fri"], ["6", "Sat"], ["7", "Sun"]];

export default function OnlineClassesPage() {
  const toast = useToast();
  const { term } = useInstitution();
  const { options } = useLmsOptions();
  const allocs = useMemo(() => options?.allocations ?? [], [options]);
  const [when, setWhen] = useState("today");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; page: Page<LiveClass> } | null>(null);
  const [formFor, setFormFor] = useState<LiveClass | "new">("new");
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);

  const key = JSON.stringify({ when, q, filters, page, nonce });
  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ when, page: String(page), size: "25" });
    if (q) p.set("q", q);
    if (filters.section?.[0]) p.set("section_id", filters.section[0]);
    if (filters.subject?.[0]) p.set("subject_id", filters.subject[0]);
    if (filters.mine?.[0]) p.set("mine", "true");
    api.get<Page<LiveClass>>(`/lms/online-classes?${p}`).then((r) => live && setData({ key, page: r }))
      .catch((e) => { if (live) { setData({ key, page: { items: [], total: 0, page: 1, size: 25 } }); toast.error(e.message); } });
    return () => { live = false; };
  }, [key, when, q, filters, page, toast]);
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v) Promise.resolve().then(() => setViewing(v));
  }, []);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const openForm = (c: LiveClass | "new") => { setFormKey((k) => k + 1); setFormFor(c); setFormOpen(true); };
  const canTeach = !!options?.can_teach;

  const columns: Column<LiveClass>[] = [
    { key: "when", header: "When", cell: (c) => (
      <div className="w-32"><p className="text-ink">{formatTime(c.starts_at)}</p><p className="text-[12.5px] text-muted">{when === "today" ? `${c.duration_min} min` : formatLongDate(c.starts_at)}</p></div>) },
    { key: "title", header: "Class", cell: (c) => (
      <div className="min-w-0"><p className="truncate text-ink">{c.title}</p><p className="truncate text-[12.5px] text-muted">{[c.subject_name, c.section_label].filter(Boolean).join(" · ")}</p></div>) },
    { key: "teacher", header: term("teacher"), hideBelow: "lg", cell: (c) => c.teacher_name ? <span className="flex items-center gap-2"><Avatar name={c.teacher_name} size={22} /><span className="text-ink/80">{c.teacher_name}</span></span> : null },
    { key: "provider", header: "Room", hideBelow: "md", cell: (c) => <span className="text-muted">{c.provider_label}</span> },
    { key: "joined", header: "Joined", align: "right", hideBelow: "sm", cell: (c) => <span className="tabular text-muted">{c.joined ?? 0}</span> },
    { key: "phase", header: "Status", cell: (c) => <PhaseBadge phase={c.phase} /> },
    { key: "join", header: "", align: "right", cell: (c) => (c.phase === "open" || c.phase === "live" || c.phase === "upcoming") && c.status !== "cancelled" ? (
      <Link href={`/dashboard/lms/online-classes/${c.uuid}/join`} onClick={(e) => e.stopPropagation()}><Button size="sm" variant={c.phase === "upcoming" ? "secondary" : "primary"} icon={Video}>Join</Button></Link>) : null },
  ];

  return (
    <div>
      <PageHeader eyebrow="Teaching" title="Online classes" description="Live classes in the built-in video room or on Zoom, Google Meet or Teams. Joining marks attendance."
        actions={canTeach ? <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>Schedule class</Button> : undefined} />
      <Tabs value={when} onChange={(w) => { setWhen(w); setPage(1); }} className="mb-4" items={[
        { value: "today", label: "Today" }, { value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }, { value: "all", label: "All" }]} />
      <FilterBar searchPlaceholder="Search classes" onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={[
          { key: "section", label: term("section"), options: sectionOptions(allocs).map((o) => ({ value: String(o.value), label: o.label })) },
          { key: "subject", label: term("subject"), options: subjectOptions(allocs).map((o) => ({ value: String(o.value), label: o.label })) },
          { key: "mine", label: term("teacher"), options: [{ value: "1", label: "My classes" }] },
        ]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={data?.page.items ?? []} rowKey={(c) => c.uuid} columns={columns} loading={data?.key !== key}
        onRowClick={(c) => setViewing(c.uuid)}
        rowActions={(c) => [{ label: "View details", icon: Eye, onSelect: () => setViewing(c.uuid) },
          ...(canTeach && c.status !== "cancelled" ? [{ label: "Edit", icon: Pencil, onSelect: () => openForm(c) }] : [])]}
        pagination={{ page, size: 25, total: data?.page.total ?? 0, onPageChange: setPage }}
        emptyIcon={CalendarClock}
        emptyTitle={when === "today" ? "No live classes today" : when === "past" ? "No past classes" : "No classes scheduled"}
        emptyHint={canTeach ? "Schedule a live class; learners get a reminder before it starts." : undefined}
        emptyAction={canTeach && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>Schedule class</Button>} />
      <ClassForm key={formKey} target={formFor} open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => { setFormOpen(false); refresh(); }} />
      <ClassDetail uuid={viewing} canTeach={canTeach} onClose={() => { setViewing(null); refresh(); }} onEdit={(c) => { setViewing(null); openForm(c); }} />
    </div>
  );
}

function ClassForm({ target, open, onClose, onSaved }: { target: LiveClass | "new"; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const { options } = useLmsOptions();
  const allocs = options?.allocations ?? [];
  const editing = target !== "new" ? target : null;
  const start = splitISO(editing?.starts_at);
  const initial = {
    title: editing?.title ?? "", agenda: editing?.agenda ?? "", section: editing?.section_id ?? null as number | null,
    subject: editing?.subject_id ?? null as number | null, date: start.date || localDate(0), time: start.time || "10:00",
    duration: editing?.duration_min ?? 40 as number | null, provider: editing?.provider ?? options?.settings.video_provider ?? "jitsi",
    url: editing?.join_url ?? "", code: editing?.meeting_code ?? "", passcode: editing?.passcode ?? "",
    weekly: false, until: localDate(56), days: [] as string[],
  };
  const [v, setV] = useState(initial);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => { setV((s) => ({ ...s, [k]: x })); setErr(""); };
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.title.trim() || !v.section) { setErr(`Add a title and pick the ${term("section").toLowerCase()}`); return; }
    if (v.provider !== "jitsi" && !v.url.startsWith("https://")) { setErr("Paste the meeting link (starts with https://)"); return; }
    setSaving(true);
    const body: Record<string, unknown> = {
      title: v.title.trim(), agenda: v.agenda.trim() || null, section_id: v.section, subject_id: v.subject, starts_at: toISO(v.date, v.time),
      duration_min: v.duration || 40, provider: v.provider, join_url: v.provider === "jitsi" ? null : v.url.trim(),
      meeting_code: v.code.trim() || null, passcode: v.passcode.trim() || null,
    };
    if (!editing && v.weekly) Object.assign(body, { repeat: "weekly", repeat_until: v.until, weekdays: v.days.length ? v.days.map(Number) : null });
    try {
      if (editing) { await api.put(`/lms/online-classes/${editing.uuid}`, body); toast.success("Class updated"); }
      else { const r = await api.post<{ created: number }>("/lms/online-classes", body); toast.success(r.created > 1 ? `${r.created} classes scheduled` : "Class scheduled", { description: "Learners and parents have been told." }); }
      onSaved();
    } catch (x) { toast.error("Couldn't save", { description: x instanceof Error ? x.message : undefined }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving} title={editing ? "Edit class" : "Schedule a live class"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="live-form" loading={saving}>{editing ? "Save changes" : "Schedule"}</Button></>}>
      <form id="live-form" onSubmit={submit} noValidate className="space-y-5">
        <FormGrid>
          <Field label="Title" required error={err} className="sm:col-span-2"><TextInput autoFocusInModal value={v.title} onValueChange={(x) => set("title", x)} placeholder="e.g. Revision: fractions" /></Field>
          <Field label={term("section")} required><Select value={v.section} onChange={(x) => setV((s) => ({ ...s, section: x, subject: null }))} options={sectionOptions(allocs)} /></Field>
          <Field label={term("subject")}><Select value={v.subject} onChange={(x) => set("subject", x)} options={v.section ? subjectOptions(allocs, [v.section]) : []} clearable disabled={!v.section} /></Field>
          <Field label={editing ? "Date" : "First class on"}><DateInput value={v.date} onChange={(x) => set("date", x)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Starts"><TimeInput value={v.time} onChange={(x) => set("time", x)} /></Field>
            <Field label="Minutes"><NumberInput value={v.duration} onChange={(x) => set("duration", x)} min={5} max={480} step={5} /></Field>
          </div>
        </FormGrid>
        {!editing && (
          <div className="rounded-xl border border-line p-4">
            <Checkbox checked={v.weekly} onChange={(x) => set("weekly", x)} label="Repeat every week" description="One class per chosen day until the end date." />
            {v.weekly && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Until"><DateInput value={v.until} onChange={(x) => set("until", x)} min={v.date} /></Field>
                <Field label="Days" hint="Leave empty for the same weekday as the first class">
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map(([d, l]) => {
                      const on = v.days.includes(d);
                      return <button key={d} type="button" onClick={() => set("days", on ? v.days.filter((x) => x !== d) : [...v.days, d])}
                        className={`h-8 rounded-lg border px-2.5 text-[12.5px] transition-colors ${on ? "border-primary bg-primary-soft text-primary" : "border-line text-muted hover:border-line-strong"}`}>{l}</button>;
                    })}
                  </div>
                </Field>
              </div>
            )}
          </div>
        )}
        <Field label="Where"><RadioCards columns={3} value={v.provider} onChange={(x) => set("provider", x)} options={PROVIDERS.map((p) => ({ value: p.value, label: p.label,
          description: p.value === "jitsi" ? "Opens inside Campusly" : undefined }))} /></Field>
        {v.provider !== "jitsi" && (
          <FormGrid>
            <Field label="Meeting link" required className="sm:col-span-2"><TextInput value={v.url} onValueChange={(x) => set("url", x)} placeholder="https://" /></Field>
            <Field label="Meeting ID" aside="Optional"><TextInput value={v.code} onValueChange={(x) => set("code", x)} /></Field>
            <Field label="Passcode" aside="Optional"><TextInput value={v.passcode} onValueChange={(x) => set("passcode", x)} /></Field>
          </FormGrid>
        )}
        <Field label="Agenda" aside="Optional"><Textarea value={v.agenda} onValueChange={(x) => set("agenda", x)} rows={3} placeholder="What you'll cover, what to bring" /></Field>
      </form>
    </Modal>
  );
}

function ClassDetail({ uuid, canTeach, onClose, onEdit }: { uuid: string | null; canTeach: boolean; onClose: () => void; onEdit: (c: LiveClass) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const [state, setState] = useState<{ uuid: string; c: LiveClass; att: Attendance | null } | null>(null);
  const [tick, setTick] = useState(0);
  const [tabState, setTab] = useState<{ uuid: string | null; tab: string }>({ uuid: null, tab: "details" });
  const [rec, setRec] = useState<{ uuid: string | null; v: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const tab = tabState.uuid === uuid ? tabState.tab : "details";
  useEffect(() => {
    if (!uuid) return;
    let live = true;
    Promise.all([api.get<LiveClass>(`/lms/online-classes/${uuid}`), api.get<Attendance>(`/lms/online-classes/${uuid}/attendance`).catch(() => null)])
      .then(([c, att]) => live && setState({ uuid, c, att })).catch((e) => { toast.error(e.message); onClose(); });
    return () => { live = false; };
  }, [uuid, tick, toast, onClose]);
  const d = state && state.uuid === uuid ? state : null;
  const c = d?.c ?? null;
  const recording = rec && rec.uuid === uuid ? rec.v : c?.recording_url ?? "";

  async function cancel(series: boolean) {
    if (!c) return;
    if (!(await confirm({ title: series ? "Cancel all coming classes in this series?" : "Cancel this class?", message: "Learners and parents are told.", confirmLabel: "Cancel class", tone: "danger" }))) return;
    try { const r = await api.post<{ cancelled: number }>(`/lms/online-classes/${c.uuid}/cancel`, { whole_series: series }); toast.success(`${r.cancelled} cancelled`); setTick((t) => t + 1); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't cancel"); }
  }
  async function saveRecording() {
    if (!c) return;
    setSaving(true);
    try { await api.put(`/lms/online-classes/${c.uuid}`, { recording_url: recording.trim() || null }); toast.success("Recording saved"); setTick((t) => t + 1); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={!!uuid} onClose={onClose} size="lg" title={c?.title ?? "Class"}
      description={c ? `${[c.subject_name, c.section_label].filter(Boolean).join(" · ")} · ${formatDateTime(c.starts_at)}` : undefined}
      headerActions={c && canTeach && c.status === "scheduled" && <Button size="sm" icon={Pencil} onClick={() => onEdit(c)}>Edit</Button>}
      footer={c && <>
        {canTeach && c.status === "scheduled" && <Button icon={Ban} onClick={() => cancel(false)}>Cancel class</Button>}
        {canTeach && c.status === "scheduled" && c.series_uuid && (c.series_count ?? 0) > 1 && <Button onClick={() => cancel(true)}>Cancel series</Button>}
        {c.phase !== "ended" && c.phase !== "cancelled" && <Link href={`/dashboard/lms/online-classes/${c.uuid}/join`}><Button variant="primary" icon={Video}>Join</Button></Link>}
      </>}>
      {!c ? <Skeleton className="h-40 w-full" /> : (
        <>
          <Tabs value={tab} onChange={(t) => setTab({ uuid, tab: t })} className="-mt-2 mb-5" items={[{ value: "details", label: "Details" },
            { value: "attendance", label: "Attendance", count: d?.att?.present }]} />
          {tab === "details" ? (
            <>
              <Section title="Overview">
                <KeyValue columns={3} items={[
                  { label: "Status", value: <PhaseBadge phase={c.phase} /> }, { label: "Time", value: `${formatTime(c.starts_at)} – ${formatTime(c.ends_at)}` },
                  { label: term("teacher"), value: c.teacher_name }, { label: "Room", value: c.provider_label },
                  { label: "Meeting ID", value: c.meeting_code }, { label: "Passcode", value: c.passcode },
                  ...(c.join_url ? [{ label: "Link", value: <LinkOut href={c.join_url}>Open</LinkOut>, span: 3 as const }] : []),
                  ...(c.cancel_reason ? [{ label: "Why cancelled", value: c.cancel_reason, span: 3 as const }] : []),
                ]} />
              </Section>
              {c.agenda && <Section title="Agenda" className="border-t border-line"><RichText text={c.agenda} /></Section>}
              {canTeach && c.status !== "cancelled" && (
                <Section title="Recording" description="Paste the link after the class; learners are told." className="border-t border-line">
                  <div className="flex gap-2">
                    <TextInput value={recording} onValueChange={(x) => setRec({ uuid, v: x })} placeholder="https://" className="flex-1" />
                    <Button onClick={saveRecording} loading={saving}>Save</Button>
                  </div>
                </Section>
              )}
              {!canTeach && c.recording_url && <Section title="Recording" className="border-t border-line"><LinkOut href={c.recording_url}>Watch</LinkOut></Section>}
            </>
          ) : !d?.att ? <Skeleton className="h-32 w-full" /> : (
            <>
              <p className="mb-3 text-[13.5px] text-muted"><span className="tabular text-ink">{d.att.present}</span> of {d.att.total} joined</p>
              <ul className="divide-y divide-line rounded-xl border border-line">
                {d.att.roster.map((r) => (
                  <li key={r.student_id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px]">
                    <span className="flex min-w-0 items-center gap-2.5"><Avatar name={r.name} size={26} /><span className="truncate text-ink">{r.name}</span></span>
                    {r.joined ? <span className="text-muted">{formatTime(r.first_joined_at)}{r.join_count > 1 ? ` · ${r.join_count}×` : ""}</span> : <Badge tone="neutral">Didn&apos;t join</Badge>}
                  </li>
                ))}
              </ul>
              {d.att.others.length > 0 && <p className="mt-3 text-[12.5px] text-muted">Also joined: {d.att.others.map((o) => o.name).join(", ")}</p>}
            </>
          )}
        </>
      )}
    </Modal>
  );
}
