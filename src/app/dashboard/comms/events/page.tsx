"use client";

/*
 * Events calendar (staff): month / week / agenda views of events, holidays, exams, PTMs, sports
 * days and trips. People who manage events add and change them; everyone can subscribe with
 * their private calendar link.
 */
import { useCallback, useEffect, useState } from "react";
import { Link2, Plus } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Button, DateInput, Field, FilterBar, FormGrid, Modal, ModalCancel, Section, Select, TextInput, Textarea, TimeInput, Toggle,
  useConfirm, type FilterValues,
} from "@/components/ui-kit";
import { CalendarToolbar, CalendarView, useCalendar } from "@/components/comms/calendar";
import { EventDetail } from "@/components/comms/event-detail";
import { AudienceBuilder, AudiencePreview, errText, normAudience, type Audience, type CalEvent } from "@/components/comms/shared";

type Meta = { event_categories: { value: string; label: string }[]; staff_roles: string[] };

export default function EventsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const canManage = useAccess().can("comms.events.manage");
  const cal = useCalendar();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [filters, setFilters] = useState<FilterValues>({});
  const [q, setQ] = useState("");
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; items: CalEvent[] } | null>(null);
  const [viewing, setViewing] = useState<CalEvent | null>(null);
  const [form, setForm] = useState<{ target: CalEvent | "new"; date?: string } | null>(null);
  const [formKey, setFormKey] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => { api.get<Meta>("/comms/meta").then(setMeta).catch(() => {}); }, []);
  const key = `${cal.range.start}|${cal.range.end}|${JSON.stringify(filters)}|${q}|${nonce}`;
  useEffect(() => {
    let live = true;
    const p = new URLSearchParams({ start: cal.range.start, end: cal.range.end });
    if (filters.category?.length) p.set("category", filters.category.join(","));
    if (q) p.set("q", q);
    api.get<{ items: CalEvent[] }>(`/comms/events?${p}`).then((r) => { if (live) setData({ key, items: r.items }); })
      .catch((e) => { if (live) { setData({ key, items: [] }); toast.error("Couldn't load the calendar", { description: errText(e) }); } });
    return () => { live = false; };
  }, [key, cal.range, filters, q, toast]);

  const openForm = (target: CalEvent | "new", date?: string) => { setFormKey((k) => k + 1); setForm({ target, date }); };
  async function copyFeed() {
    try {
      const r = await api.get<{ path: string }>("/comms/events/feed-link");
      const url = new URL(r.path, API_BASE).toString();
      await navigator.clipboard.writeText(url);
      toast.success("Calendar link copied", { description: "Add it in Google Calendar (From URL) or Apple Calendar (New subscription)." });
    } catch (e) { toast.error(errText(e)); }
  }
  async function cancel(e: CalEvent) {
    try { const r = await api.post<CalEvent>(`/comms/events/${e.uuid}/cancel`); setViewing(r); refresh(); toast.success(r.status === "cancelled" ? "Event cancelled" : "Event restored"); } catch (err) { toast.error(errText(err)); }
  }
  async function remove(e: CalEvent) {
    if (!(await confirm({ title: `Remove “${e.title}”?`, message: "It disappears from everyone's calendar.", confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.delete(`/comms/events/${e.uuid}`); setViewing(null); refresh(); toast.success("Event removed"); } catch (err) { toast.error(errText(err)); }
  }

  return (
    <div>
      <PageHeader eyebrow="Communicate" title="Events calendar" description="Holidays, exams, meetings and events for the whole institution."
        actions={<>
          <Button icon={Link2} onClick={copyFeed}>Subscribe</Button>
          {canManage && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New event</Button>}
        </>} />
      <FilterBar searchPlaceholder="Search events" onSearchChange={setQ} values={filters} onChange={setFilters}
        filters={[{ key: "category", label: "Type", multiple: true, options: meta?.event_categories ?? [] }]} />
      <CalendarToolbar cal={cal} />
      <CalendarView cal={cal} events={data?.items ?? []} loading={data?.key !== key} onEvent={setViewing}
        onDay={canManage ? (iso) => openForm("new", iso) : undefined} />
      <EventDetail event={viewing} open={!!viewing} onClose={() => setViewing(null)} rsvpBase="/comms/events" canManage={canManage}
        onEdit={(e) => { setViewing(null); openForm(e); }} onCancel={cancel} onRemove={remove} onChanged={refresh} />
      {meta && form && (
        <EventForm key={formKey} target={form.target} date={form.date} meta={meta} open onClose={() => setForm(null)}
          onSaved={() => { setForm(null); refresh(); }} />
      )}
    </div>
  );
}

function localTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function EventForm({ target, date, meta, open, onClose, onSaved }: { target: CalEvent | "new"; date?: string; meta: Meta; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const editing = target !== "new" ? target : null;
  const initial = {
    title: editing?.title ?? "", description: editing?.description ?? "", category: editing?.category ?? "event",
    all_day: editing?.all_day ?? true, start_date: editing?.start_date ?? date ?? new Date().toISOString().slice(0, 10),
    end_date: editing?.end_date ?? "", start_time: localTime(editing?.start_at ?? null) || "10:00", end_time: localTime(editing?.end_at ?? null) || "11:00",
    location: editing?.location ?? "", audience: editing ? normAudience(editing.audience) : normAudience({ everyone: true }) as Audience,
    rsvp_required: editing?.rsvp_required ?? false, rsvp_deadline: editing?.rsvp_deadline ?? "", notify: false,
  };
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((p) => ({ ...p, [k]: x }));
  async function save() {
    if (!v.title.trim()) { setErr("Give the event a name"); return; }
    setSaving(true);
    try {
      const payload = {
        title: v.title.trim(), description: v.description || null, category: v.category, all_day: v.all_day, start_date: v.start_date,
        end_date: v.end_date || v.start_date, start_time: v.all_day ? null : v.start_time, end_time: v.all_day ? null : v.end_time,
        location: v.location || null, audience: v.audience, rsvp_required: v.rsvp_required, rsvp_deadline: v.rsvp_deadline || null,
        ...(editing ? {} : { notify: v.notify }),
      };
      if (editing) await api.put(`/comms/events/${editing.uuid}`, payload); else await api.post("/comms/events", payload);
      toast.success(editing ? "Event updated" : "Event added");
      onSaved();
    } catch (e) { toast.error("Couldn't save the event", { description: errText(e) }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" title={editing ? "Edit event" : "New event"} busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(initial)}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>{editing ? "Save changes" : "Add event"}</Button></>}>
      <div className="space-y-5">
        <FormGrid>
          <Field label="Name" required error={err} className="sm:col-span-2"><TextInput autoFocusInModal value={v.title} onValueChange={(x) => { set("title", x); setErr(""); }} maxLength={200} placeholder="e.g. Annual sports day" /></Field>
          <Field label="Type"><Select value={v.category} onChange={(x) => x && set("category", x)} options={meta.event_categories.filter((c) => c.value !== "ptm" || editing?.category === "ptm")} /></Field>
          <Field label="Place" aside="Optional"><TextInput value={v.location} onValueChange={(x) => set("location", x)} placeholder="e.g. Main hall" /></Field>
          <div className="sm:col-span-2"><Toggle checked={v.all_day} onChange={(x) => set("all_day", x)} label="All day" /></div>
          <Field label={v.all_day ? "From" : "Date"}><DateInput value={v.start_date} onChange={(x) => set("start_date", x)} /></Field>
          {v.all_day
            ? <Field label="To" aside="Optional"><DateInput value={v.end_date} onChange={(x) => set("end_date", x)} min={v.start_date} clearable /></Field>
            : <FormGrid><Field label="Starts"><TimeInput value={v.start_time} onChange={(x) => set("start_time", x)} /></Field><Field label="Ends"><TimeInput value={v.end_time} onChange={(x) => set("end_time", x)} /></Field></FormGrid>}
          <Field label="Details" aside="Optional" className="sm:col-span-2"><Textarea value={v.description} onValueChange={(x) => set("description", x)} rows={3} autoGrow /></Field>
        </FormGrid>
        <Section title="Who it's for" className="border-t border-line">
          <AudienceBuilder value={v.audience} onChange={(a) => set("audience", a)} staffRoles={meta.staff_roles} />
          <div className="mt-3"><AudiencePreview audience={v.audience} /></div>
        </Section>
        <Section title="Replies" className="border-t border-line">
          <div className="space-y-3">
            <Toggle checked={v.rsvp_required} onChange={(x) => set("rsvp_required", x)} label="Ask people to reply (RSVP)" />
            {v.rsvp_required && <Field label="Reply by" aside="Optional"><DateInput value={v.rsvp_deadline} onChange={(x) => set("rsvp_deadline", x)} clearable /></Field>}
            {!editing && <Toggle checked={v.notify} onChange={(x) => set("notify", x)} label="Tell everyone in the app now" />}
          </div>
        </Section>
      </div>
    </Modal>
  );
}
