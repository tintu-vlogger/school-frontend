"use client";

/*
 * Holidays. Everyone: this year's holidays from their own calendar, and picking optional
 * holidays up to the yearly limit. HR: holiday calendars per location or state (who each
 * applies to, optional holiday limit), and the holidays in each, with add / edit / remove
 * and CSV import. Changing a holiday re-works leave already applied on that date.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Copy, FileUp, MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, todayISO } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateRangeInput, Field, FormGrid, Modal, ModalCancel, MultiSelect, NumberInput, RadioCards, Select, Skeleton, Tabs,
  Textarea, TextInput, Toggle, useConfirm, type BadgeTone, type SelectOption,
} from "@/components/ui-kit";
import { ApplyLeaveModal } from "@/components/leave/apply-modal";
import { ApplicabilityEditor, applicabilityText } from "@/components/leave/applicability";
import { LeaveNav, useLeaveAccess } from "@/components/leave/leave-nav";
import { DateTile } from "@/components/leave/misc";
import type { Applicability, Holiday, HolidayCalendar, Summary } from "@/components/leave/types";

const KIND_TONE: Record<string, BadgeTone> = { national: "accent", festival: "good", optional: "info", substitute: "neutral" };
const KIND_LABEL: Record<string, string> = { national: "National", festival: "Festival", optional: "Optional", substitute: "Substitute day off" };

export default function HolidaysPage() {
  const router = useRouter();
  const params = useSearchParams();
  const access = useLeaveAccess();
  const tab = params.get("tab") === "calendars" ? "calendars" : "mine";
  const setTab = (t: string) => router.replace(`/dashboard/holidays${t === "mine" ? "" : "?tab=calendars"}`, { scroll: false });
  const thisYear = Number((access?.today ?? todayISO()).slice(0, 4));
  const [year, setYear] = useState<number>(thisYear);
  const years = [thisYear - 1, thisYear, thisYear + 1].map((y) => ({ value: String(y), label: String(y) }));
  return (
    <div>
      <PageHeader eyebrow="Time" title="Holidays" description="Holidays by location and state, and optional holidays you can choose."
        actions={<div className="w-32"><Select value={String(year)} onChange={(v) => setYear(Number(v ?? thisYear))} options={years} /></div>} />
      <LeaveNav access={access} />
      {access?.can_configure && (
        <Tabs value={tab} onChange={setTab} className="mb-5" items={[{ value: "mine", label: access.employee_id ? "My holidays" : "Default calendar", icon: Star }, { value: "calendars", label: "Holiday calendars", icon: CalendarDays }]} />
      )}
      {tab === "calendars" && access?.can_configure ? <Calendars year={year} /> : <MyHolidays year={year} isEmployee={!!access?.employee_id} />}
    </div>
  );
}

/* ── My holidays ──────────────────────────────────────────────────── */

function MyHolidays({ year, isEmployee }: { year: number; isEmployee: boolean }) {
  const [data, setData] = useState<{ calendar: { name: string } | null; optional_limit: number; optional_taken: number; holidays: Holiday[] } | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [applying, setApplying] = useState(false);
  const load = useCallback(() => {
    setData(null);
    api.get<typeof data>(`/leave/me/holidays?year=${year}`).then(setData).catch(() => setData({ calendar: null, optional_limit: 0, optional_taken: 0, holidays: [] }));
  }, [year]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (isEmployee) api.get<Summary>("/leave/me/summary").then(setSummary).catch(() => {}); }, [isEmployee]);
  const byMonth = useMemo(() => {
    const m = new Map<string, Holiday[]>();
    (data?.holidays ?? []).forEach((h) => { const k = h.date.slice(0, 7); m.set(k, [...(m.get(k) ?? []), h]); });
    return [...m.entries()];
  }, [data]);
  const today = todayISO();
  const fixed = (data?.holidays ?? []).filter((h) => h.kind !== "optional").length;
  const left = Math.max(0, (data?.optional_limit ?? 0) - (data?.optional_taken ?? 0));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="space-y-6">
        {!data ? <Skeleton className="h-80 rounded-2xl" /> : byMonth.length === 0 ? (
          <p className="rounded-2xl border border-line bg-surface px-6 py-12 text-center text-muted">No holidays for {year}.</p>
        ) : byMonth.map(([month, list]) => (
          <div key={month} className="rounded-2xl border border-line bg-surface">
            <p className="border-b border-line px-5 py-3 text-[14px] text-ink">{new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</p>
            <ul className="divide-y divide-line">
              {list.map((h) => (
                <li key={h.uuid ?? `${h.date}-${h.name}`} className={`flex items-center gap-4 px-5 py-3 ${h.date < today ? "opacity-55" : ""}`}>
                  <DateTile date={h.date} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-ink">{h.name}</p>
                    <p className="text-[12.5px] text-faint">{h.weekday}{h.description ? ` · ${h.description}` : ""}</p>
                  </div>
                  {h.taken ? <Badge tone={h.taken === "approved" ? "good" : "warn"} dot>{h.taken === "approved" ? "Taken" : "Requested"}</Badge>
                    : <Badge tone={KIND_TONE[h.kind]}>{KIND_LABEL[h.kind]}</Badge>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
      <aside className="space-y-4">
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-[13px] text-muted">{data?.calendar?.name ?? "Holiday calendar"}</p>
          <p className="tabular mt-2 text-[34px] font-extralight leading-none text-ink">{fixed}</p>
          <p className="mt-1 text-[12.5px] text-muted">holidays in {year}</p>
        </div>
        {isEmployee && (data?.optional_limit ?? 0) > 0 && (
          <div className="rounded-2xl border border-line bg-surface p-5">
            <p className="text-[15px] text-ink">Optional holidays</p>
            <p className="mt-1 text-[13px] text-muted">You can take {data?.optional_limit} a year. {left} left.</p>
            <div className="mt-3 h-1.5 rounded-full bg-sunken"><div className="h-full rounded-full bg-sky-500/70" style={{ width: `${((data?.optional_taken ?? 0) / Math.max(1, data?.optional_limit ?? 1)) * 100}%` }} /></div>
            <Button variant="secondary" size="sm" className="mt-4" disabled={!left || !summary} onClick={() => setApplying(true)}>Choose an optional holiday</Button>
          </div>
        )}
      </aside>
      {summary && <ApplyLeaveModal open={applying} onClose={() => setApplying(false)} cards={summary.cards} initialType="OH"
        onSaved={() => { setApplying(false); load(); }} />}
    </div>
  );
}

/* ── Calendars (HR) ───────────────────────────────────────────────── */

function Calendars({ year }: { year: number }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [cals, setCals] = useState<HolidayCalendar[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [holidays, setHolidays] = useState<Holiday[] | null>(null);
  const [editingCal, setEditingCal] = useState<HolidayCalendar | "new" | null>(null);
  const [editingHol, setEditingHol] = useState<Holiday | "new" | null>(null);
  const [importing, setImporting] = useState(false);

  const loadCals = useCallback(() => {
    api.get<HolidayCalendar[]>(`/leave/holiday-calendars?year=${year}`).then((r) => { setCals(r); setSelected((s) => s ?? r.find((c) => c.is_default)?.uuid ?? r[0]?.uuid ?? null); }).catch(() => setCals([]));
  }, [year]);
  const loadHols = useCallback(() => {
    if (!selected) return;
    setHolidays(null);
    api.get<Holiday[]>(`/leave/holidays?calendar_uuid=${selected}&year=${year}`).then(setHolidays).catch(() => setHolidays([]));
  }, [selected, year]);
  useEffect(() => { loadCals(); }, [loadCals]);
  useEffect(() => { loadHols(); }, [loadHols]);
  const cal = cals?.find((c) => c.uuid === selected);

  async function remove(h: Holiday) {
    if (!(await confirm({ title: `Remove ${h.name}?`, message: "Leave already applied on this day is worked out again.", confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.delete(`/leave/holidays/${h.uuid}`); toast.success("Holiday removed"); loadHols(); loadCals(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't remove"); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="space-y-2">
        {!cals ? <Skeleton className="h-64 rounded-2xl" /> : cals.map((c) => (
          <button key={c.uuid} type="button" onClick={() => setSelected(c.uuid)}
            className={`w-full rounded-xl border px-4 py-3 text-left transition-colors ${c.uuid === selected ? "border-primary/40 bg-primary-soft/40" : "border-line bg-surface hover:border-line-strong"}`}>
            <span className="flex items-center justify-between gap-2"><span className="truncate text-[14px] text-ink">{c.name}</span>
              {c.is_default ? <Badge tone="accent">Default</Badge> : !c.active ? <Badge>Off</Badge> : null}</span>
            <span className="mt-0.5 block text-[12px] text-faint">{c.counts.national + c.counts.festival} holidays · {c.counts.optional} optional</span>
            <span className="mt-0.5 block truncate text-[12px] text-faint">
              {c.locations.length ? <><MapPin size={11} strokeWidth={1.4} className="mr-1 inline" />{c.locations.map((l) => l.name).join(", ")}</> : c.is_default ? "Everyone else" : applicabilityText(c.applicability)}
            </span>
          </button>
        ))}
        <Button variant="secondary" icon={Plus} className="w-full" onClick={() => setEditingCal("new")}>New calendar</Button>
      </aside>

      <section>
        {cal && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[17px] text-ink">{cal.name}</p>
              <p className="text-[13px] text-muted">{cal.description ?? ""} Optional holidays allowed: {cal.optional_limit} a year.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" icon={Pencil} onClick={() => setEditingCal(cal)}>Edit calendar</Button>
              <Button variant="ghost" icon={FileUp} onClick={() => setImporting(true)}>Import</Button>
              <Button variant="primary" icon={Plus} onClick={() => setEditingHol("new")}>Add holiday</Button>
            </div>
          </div>
        )}
        <DataTable rows={holidays ?? []} loading={holidays === null} rowKey={(h) => h.uuid ?? `${h.date}-${h.name}`} onRowClick={(h) => setEditingHol(h)}
          columns={[
            { key: "date", header: "Date", sortable: true, sortValue: (h) => h.date, cell: (h) => <span className="text-ink/85">{formatDate(h.date)} <span className="text-faint">· {h.weekday.slice(0, 3)}</span></span> },
            { key: "name", header: "Holiday", cell: (h) => <span className="text-ink">{h.name}</span> },
            { key: "kind", header: "Kind", cell: (h) => <Badge tone={KIND_TONE[h.kind]}>{KIND_LABEL[h.kind]}</Badge> },
          ]}
          rowActions={(h) => [{ label: "Edit", icon: Pencil, onSelect: () => setEditingHol(h) }, "separator", { label: "Remove", icon: Trash2, danger: true, onSelect: () => remove(h) }]}
          emptyIcon={CalendarDays} emptyTitle={`No holidays in ${year}`} emptyAction={<Button variant="secondary" icon={Plus} onClick={() => setEditingHol("new")}>Add holiday</Button>} />
      </section>

      <CalendarModal cal={editingCal} all={cals ?? []} onClose={() => setEditingCal(null)} onSaved={(c) => { setEditingCal(null); setSelected(c.uuid); loadCals(); }} />
      <HolidayModal holiday={editingHol} cals={cals ?? []} defaultCal={selected} onClose={() => setEditingHol(null)} onSaved={() => { setEditingHol(null); loadHols(); loadCals(); }} />
      <ImportModal open={importing} cal={cal ?? null} onClose={() => setImporting(false)} onDone={() => { setImporting(false); loadHols(); loadCals(); }} />
    </div>
  );
}

function CalendarModal({ cal, all, onClose, onSaved }: { cal: HolidayCalendar | "new" | null; all: HolidayCalendar[]; onClose: () => void; onSaved: (c: HolidayCalendar) => void }) {
  const toast = useToast();
  const isNew = cal === "new";
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [limit, setLimit] = useState<number | null>(2);
  const [isDefault, setIsDefault] = useState(false);
  const [active, setActive] = useState(true);
  const [app, setApp] = useState<Applicability>({ mode: "pickers" });
  const [locations, setLocations] = useState<number[]>([]);
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const [locOpts, setLocOpts] = useState<SelectOption<number>[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!cal) return;
    api.get<SelectOption<number>[]>("/leave/options/locations").then(setLocOpts).catch(() => {});
    if (cal === "new") { setName(""); setDesc(""); setLimit(2); setIsDefault(false); setActive(true); setApp({ mode: "pickers" }); setLocations([]); setCopyFrom(all.find((c) => c.is_default)?.uuid ?? null); }
    else { setName(cal.name); setDesc(cal.description ?? ""); setLimit(cal.optional_limit); setIsDefault(cal.is_default); setActive(cal.active); setApp(cal.applicability ?? {}); setLocations(cal.locations.map((l) => l.id)); setCopyFrom(null); }
  }, [cal, all]);
  async function save() {
    setSaving(true);
    try {
      const body = { name, description: desc, optional_limit: limit, is_default: isDefault || undefined, active, applicability: app, location_ids: locations, copy_from_uuid: isNew ? copyFrom : undefined };
      const r = isNew ? await api.post<HolidayCalendar>("/leave/holiday-calendars", body) : await api.put<HolidayCalendar>(`/leave/holiday-calendars/${(cal as HolidayCalendar).uuid}`, body);
      toast.success("Calendar saved");
      onSaved(r);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!cal} onClose={onClose} size="xl" busy={saving} title={isNew ? "New holiday calendar" : "Edit holiday calendar"}
      description="A calendar applies to the locations chosen here, or to the people its rules cover. Everyone else uses the default calendar."
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!name.trim()} onClick={save}>Save</Button></>}>
      <div className="space-y-6">
        <FormGrid>
          <Field label="Name" required><TextInput value={name} onValueChange={setName} placeholder="e.g. Karnataka offices" data-autofocus /></Field>
          <Field label="Optional holidays a year"><NumberInput value={limit} onChange={setLimit} min={0} max={30} /></Field>
        </FormGrid>
        <Field label="Description"><Textarea value={desc} onValueChange={setDesc} rows={2} autoGrow /></Field>
        {isNew && <Field label="Start with the holidays of"><Select value={copyFrom} onChange={setCopyFrom} clearable placeholder="An empty calendar" options={all.map((c) => ({ value: c.uuid, label: c.name }))} /></Field>}
        <Field label="Locations" hint="People at these locations use this calendar.">
          <MultiSelect value={locations} onChange={setLocations} options={locOpts} placeholder={locOpts.length ? "None" : "No locations set up yet"} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle checked={isDefault} onChange={setIsDefault} label="Default calendar" description="For everyone not covered by another calendar" disabled={!isNew && (cal as HolidayCalendar)?.is_default} />
          <Toggle checked={active} onChange={setActive} label="In use" />
        </div>
        {!isDefault && <div><p className="mb-3 text-[14px] text-ink">Or by rules</p><ApplicabilityEditor value={app} onChange={setApp} compact /></div>}
      </div>
    </Modal>
  );
}

function HolidayModal({ holiday, cals, defaultCal, onClose, onSaved }: { holiday: Holiday | "new" | null; cals: HolidayCalendar[]; defaultCal: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = holiday === "new";
  const [name, setName] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [kind, setKind] = useState("festival");
  const [desc, setDesc] = useState("");
  const [calIds, setCalIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!holiday) return;
    if (holiday === "new") { setName(""); setRange({ from: "", to: "" }); setKind("festival"); setDesc(""); setCalIds(defaultCal ? [defaultCal] : []); }
    else { setName(holiday.name); setRange({ from: holiday.date, to: holiday.date }); setKind(holiday.kind); setDesc(holiday.description ?? ""); }
  }, [holiday, defaultCal]);
  async function save() {
    setSaving(true);
    try {
      if (isNew) {
        const r = await api.post<{ added: number }>("/leave/holidays", { name, date: range.from, end_date: range.to || range.from, kind, description: desc, calendar_uuids: calIds });
        toast.success(`${r.added} holiday${r.added === 1 ? "" : "s"} added`);
      } else {
        await api.put(`/leave/holidays/${(holiday as Holiday).uuid}`, { name, date: range.from, kind, description: desc });
        toast.success("Holiday saved");
      }
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!holiday} onClose={onClose} size="md" busy={saving} title={isNew ? "Add holiday" : "Edit holiday"}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!name.trim() || !range.from || (isNew && !calIds.length)} onClick={save}>Save</Button></>}>
      <div className="space-y-5">
        <Field label="Name" required><TextInput value={name} onValueChange={setName} placeholder="e.g. Diwali" data-autofocus /></Field>
        <Field label={isNew ? "Date (or dates)" : "Date"} required><DateRangeInput value={range} onChange={(v) => setRange(isNew ? v : { from: v.from, to: v.from })} /></Field>
        <Field label="Kind">
          <RadioCards value={kind} onChange={setKind} columns={3} options={[
            { value: "national", label: "National", description: "Compulsory" }, { value: "festival", label: "Festival", description: "Company or state" },
            { value: "optional", label: "Optional", description: "Employees choose" }]} />
        </Field>
        {isNew && <Field label="Calendars" required><MultiSelect value={calIds} onChange={setCalIds} options={cals.map((c) => ({ value: c.uuid, label: c.name }))} /></Field>}
        <Field label="Note"><TextInput value={desc} onValueChange={setDesc} placeholder="Optional" /></Field>
        <p className="text-[12.5px] text-faint">Leave already applied on this date is worked out again, and balances corrected.</p>
      </div>
    </Modal>
  );
}

function ImportModal({ open, cal, onClose, onDone }: { open: boolean; cal: HolidayCalendar | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setText(""); }, [open]);
  async function go() {
    if (!cal) return;
    setBusy(true);
    try {
      const r = await api.post<{ added: number; errors: { row: number; detail: string }[] }>(`/leave/holiday-calendars/${cal.uuid}/import`, { csv: text });
      toast.success(`${r.added} holidays added`, { description: r.errors.length ? `${r.errors.length} rows skipped` : undefined });
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't import"); }
    finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={busy} title={`Import holidays${cal ? ` into ${cal.name}` : ""}`}
      footer={<><ModalCancel /><Button variant="primary" icon={Copy} loading={busy} disabled={!text.trim()} onClick={go}>Import</Button></>}>
      <Field label="Rows" hint="Columns: name, date (YYYY-MM-DD or DD-MM-YYYY), kind (national, festival or optional).">
        <Textarea value={text} onValueChange={setText} rows={10} className="font-mono text-[12.5px]" placeholder={"name,date,kind\nPongal,2027-01-15,festival"} />
      </Field>
    </Modal>
  );
}
