"use client";

/*
 * Discipline & merits: incidents (with confidential ones only for managers), merit and
 * demerit points, house totals, restricted counselling notes and incident type settings.
 */
import { useMemo, useState } from "react";
import { Archive, Award, Ban, CheckCircle2, Eye, Lock, MessageSquareHeart, Pencil, Plus, Settings2, ShieldAlert, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime, todayISO } from "@/lib/datetime";
import { useUrlTab } from "@/lib/use-url-tab";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, MultiSelect, NumberInput, RadioCards,
  Section, Select, StatCard, Tabs, TextInput, Textarea, Toggle, useConfirm, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { PointsBadge, SEVERITIES, STROKE, SeverityBadge, StudentCell, errMsg, qs, searchStudents, useGet, usePaged } from "@/components/wellbeing/common";

type Incident = {
  uuid: string; student_id: number; student_name: string; section_label: string | null; admission_no: string; photo_url: string | null;
  type_id: number | null; type_name: string | null; occurred_at: string; location: string | null; severity: string; description: string;
  action_taken: string | null; follow_up_on: string | null; follow_up_notes: string | null; status: string; parent_informed: boolean;
  confidential: boolean; reported_by: string | null; points: number;
};
type IType = { id: number; uuid: string; name: string; default_severity: string; default_points: number; active: boolean };
type Point = { uuid: string; student_id: number; student_name: string; section_label: string | null; admission_no: string; photo_url: string | null;
  house_name: string | null; points: number; reason: string; category: string | null; awarded_on: string; awarded_by: string | null };
type House = { house_id: number; name: string; color: string | null; points: number; merits: number; demerits: number };
type Note = { uuid: string; student_id: number; student_name: string; section_label: string | null; admission_no: string; photo_url: string | null;
  session_on: string; counsellor: string | null; concern: string | null; notes: string; plan: string | null; next_session_on: string | null };

const CATEGORIES = ["Academics", "Sports", "Arts", "Conduct", "Leadership", "Service", "Other"].map((c) => ({ value: c, label: c }));

export default function DisciplinePage() {
  const access = useAccess();
  const canManage = access.can("wellbeing.manage");
  const canRecord = canManage || access.can("wellbeing.record");
  const canView = access.can("wellbeing.view");
  const canCounsel = access.can("wellbeing.counselling");
  const tabs = useMemo(() => [
    ...(canView ? [{ value: "incidents", label: "Incidents", icon: ShieldAlert }, { value: "points", label: "Merit points", icon: Award },
      { value: "houses", label: "Houses", icon: Trophy }] : []),
    ...(canCounsel ? [{ value: "counselling", label: "Counselling", icon: MessageSquareHeart }] : []),
    ...(canManage ? [{ value: "settings", label: "Settings", icon: Settings2 }] : []),
  ], [canView, canCounsel, canManage]);
  const valid = tabs.map((t) => t.value);
  const [tab, setTab] = useState<string>(canView ? "incidents" : "counselling");
  useUrlTab(["incidents", "points", "houses", "counselling", "settings"] as const, (t) => setTab(t));
  const current = valid.includes(tab) ? tab : valid[0];
  const summary = useGet<{ open_incidents: number; follow_ups_due: number }>(canView ? "/wellbeing/summary" : null);

  return (
    <div>
      <PageHeader eyebrow="Wellbeing" title="Discipline & merits" description="Behaviour incidents, merit and demerit points, house standings and counselling." />
      {canView && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Open incidents" value={summary.data?.open_incidents ?? "–"} icon={ShieldAlert} />
          <StatCard label="Follow-ups due" value={summary.data?.follow_ups_due ?? "–"} icon={CheckCircle2} />
        </div>
      )}
      <Tabs className="mb-5" value={current} onChange={setTab} items={tabs} />
      {current === "incidents" && <IncidentsTab canRecord={canRecord} canManage={canManage} />}
      {current === "points" && <PointsTab canRecord={canRecord} canManage={canManage} />}
      {current === "houses" && <HousesTab />}
      {current === "counselling" && canCounsel && <CounsellingTab />}
      {current === "settings" && canManage && <TypesTab />}
    </div>
  );
}

/* ── Incidents ─────────────────────────────────────────────────────── */

function IncidentsTab({ canRecord, canManage }: { canRecord: boolean; canManage: boolean }) {
  const { term } = useInstitution();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["open"] });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const list = usePaged<Incident>(`/wellbeing/incidents${qs({ q, page, size, status: filters.status?.[0], severity: filters.severity?.[0] })}`);
  const [viewing, setViewing] = useState<Incident | null>(null);
  const [form, setForm] = useState<Incident | "new" | null>(null);
  const [formKey, setFormKey] = useState(0);
  const openForm = (x: Incident | "new") => { setFormKey((k) => k + 1); setForm(x); };

  const columns: Column<Incident>[] = [
    { key: "who", header: term("student"), cell: (r) => <StudentCell row={r} /> },
    { key: "what", header: "Incident", cell: (r) => (
      <div className="min-w-0"><p className="flex items-center gap-1.5 truncate text-ink">{r.confidential && <Lock size={13} strokeWidth={STROKE} className="text-faint" />}{r.type_name || "Incident"}</p>
        <p className="truncate text-[12.5px] text-muted">{r.description}</p></div>) },
    { key: "when", header: "When", hideBelow: "md", cell: (r) => <span className="text-muted">{formatDate(r.occurred_at)}</span> },
    { key: "sev", header: "Severity", hideBelow: "sm", cell: (r) => <SeverityBadge value={r.severity} /> },
    { key: "pts", header: "Points", align: "right", hideBelow: "sm", cell: (r) => <PointsBadge value={r.points} /> },
    { key: "status", header: "Status", cell: (r) => <Badge tone={r.status === "open" ? "warn" : "neutral"} dot>{r.status === "open" ? "Open" : "Closed"}</Badge> },
  ];
  return (
    <>
      <FilterBar searchPlaceholder="Search name or details" onSearchChange={(x) => { setQ(x); setPage(1); }}
        filters={[{ key: "status", label: "Status", options: [{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }] },
          { key: "severity", label: "Severity", options: SEVERITIES }]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={canRecord && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>Log incident</Button>} />
      <DataTable rows={list.rows} rowKey={(r) => r.uuid} columns={columns} loading={list.loading} onRowClick={setViewing}
        rowActions={(r) => [{ label: "View", icon: Eye, onSelect: () => setViewing(r) }, ...(canManage ? [{ label: "Edit", icon: Pencil, onSelect: () => openForm(r) }] : [])]}
        pagination={{ page, size, total: list.total, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={ShieldAlert} emptyTitle={filters.status?.[0] === "open" ? "No open incidents" : "No incidents"} emptyHint="Log behaviour incidents here; demerit points are added for you."
        emptyAction={canRecord && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>Log incident</Button>} />
      <Modal open={!!viewing} onClose={() => setViewing(null)} size="md" title={viewing ? `${viewing.type_name || "Incident"}: ${viewing.student_name}` : ""}
        description={viewing ? formatDateTime(viewing.occurred_at) : undefined}
        headerActions={viewing && canManage && <Button size="sm" icon={Pencil} onClick={() => { openForm(viewing); setViewing(null); }}>Edit</Button>}>
        {viewing && (
          <>
            <div className="mb-5 flex flex-wrap gap-2"><SeverityBadge value={viewing.severity} />
              <Badge tone={viewing.status === "open" ? "warn" : "neutral"} dot>{viewing.status === "open" ? "Open" : "Closed"}</Badge>
              {viewing.confidential && <Badge tone="accent">Confidential</Badge>}
              {viewing.parent_informed && <Badge tone="info">{term("guardian")} informed</Badge>}</div>
            <KeyValue items={[
              { label: "What happened", value: viewing.description, span: 2 },
              { label: "Action taken", value: viewing.action_taken, span: 2 },
              { label: "Where", value: viewing.location },
              { label: "Points", value: <PointsBadge value={viewing.points} /> },
              { label: "Follow up on", value: viewing.follow_up_on ? formatDate(viewing.follow_up_on) : null },
              { label: "Reported by", value: viewing.reported_by },
              { label: "Follow-up notes", value: viewing.follow_up_notes, span: 2 },
            ]} />
          </>
        )}
      </Modal>
      {form === "new" && <IncidentNewModal key={formKey} onClose={() => setForm(null)} onSaved={() => { setForm(null); list.refresh(); }} />}
      {form && form !== "new" && <IncidentEditModal key={formKey} incident={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); list.refresh(); }} />}
    </>
  );
}

function useTypes() {
  return usePaged<IType>("/wellbeing/incident-types?all=true&active=true");
}

function IncidentNewModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const types = useTypes();
  const [v, setV] = useState({ students: [] as number[], type: null as number | null, severity: "low", points: 0 as number | null, location: "",
    description: "", action: "", follow_up_on: "", parent_informed: false, confidential: false });
  const [err, setErr] = useState<{ students?: string; description?: string }>({});
  const [saving, setSaving] = useState(false);
  const typeOpts = types.rows.map((t) => ({ value: t.id, label: t.name, description: t.default_points ? `${t.default_points} points` : undefined }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = { students: v.students.length ? undefined : `Pick at least one ${term("student").toLowerCase()}`, description: v.description.trim().length > 1 ? undefined : "Describe what happened" };
    if (errs.students || errs.description) { setErr(errs); return; }
    setSaving(true);
    try {
      await api.post("/wellbeing/incidents", { student_ids: v.students, type_id: v.type, severity: v.severity, points: v.points ?? 0,
        location: v.location || null, description: v.description.trim(), action_taken: v.action || null, follow_up_on: v.follow_up_on || null,
        parent_informed: v.parent_informed, confidential: v.confidential });
      toast.success(v.students.length > 1 ? `Logged for ${v.students.length} ${term("students").toLowerCase()}` : "Incident logged");
      onSaved();
    } catch (e2) { toast.error("Couldn't log the incident", { description: errMsg(e2) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="lg" busy={saving} dirty={!!v.description || v.students.length > 0} title="Log incident"
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="incident-form" loading={saving}>Log incident</Button></>}>
      <form id="incident-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label={term("students")} required error={err.students} className="sm:col-span-2" hint="Everyone involved gets their own record.">
            <MultiSelect value={v.students} onChange={(x) => { setV({ ...v, students: x }); setErr({ ...err, students: undefined }); }} loadOptions={searchStudents} placeholder="Search by name" />
          </Field>
          <Field label="Type">
            <Select value={v.type} clearable options={typeOpts} placeholder="Pick a type" onChange={(x) => {
              const t = types.rows.find((y) => y.id === x);
              setV({ ...v, type: x, severity: t?.default_severity ?? v.severity, points: t ? t.default_points : v.points });
            }} />
          </Field>
          <Field label="Where" aside="Optional"><TextInput value={v.location} onValueChange={(x) => setV({ ...v, location: x })} placeholder="e.g. Playground" /></Field>
          <Field label="Severity" className="sm:col-span-2"><RadioCards columns={4} value={v.severity} onChange={(x) => setV({ ...v, severity: x })} options={SEVERITIES} /></Field>
          <Field label="Demerit points" hint="0 for none"><NumberInput value={v.points} onChange={(x) => setV({ ...v, points: x === null ? null : Math.min(0, x) })} min={-100} max={0} /></Field>
          <Field label="Follow up on" aside="Optional"><DateInput value={v.follow_up_on} onChange={(x) => setV({ ...v, follow_up_on: x })} min={todayISO()} clearable /></Field>
          <Field label="What happened" required error={err.description} className="sm:col-span-2">
            <Textarea value={v.description} onValueChange={(x) => { setV({ ...v, description: x }); setErr({ ...err, description: undefined }); }} rows={3} />
          </Field>
          <Field label="Action taken" aside="Optional" className="sm:col-span-2"><Textarea value={v.action} onValueChange={(x) => setV({ ...v, action: x })} rows={2} /></Field>
          <div className="space-y-3 sm:col-span-2">
            <Toggle checked={v.parent_informed} onChange={(x) => setV({ ...v, parent_informed: x })} label={`Tell the ${term("guardians").toLowerCase()}`} description="Sends a short note to their portal (not for confidential incidents)." />
            <Toggle checked={v.confidential} onChange={(x) => setV({ ...v, confidential: x })} label="Confidential" description="Only wellbeing managers and you will see it." />
          </div>
        </FormGrid>
      </form>
    </Modal>
  );
}

function IncidentEditModal({ incident, onClose, onSaved }: { incident: Incident; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const types = useTypes();
  const initial = { type: incident.type_id, severity: incident.severity, location: incident.location ?? "", description: incident.description,
    action: incident.action_taken ?? "", follow_up_on: incident.follow_up_on ?? "", follow_up_notes: incident.follow_up_notes ?? "",
    status: incident.status, parent_informed: incident.parent_informed, confidential: incident.confidential };
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/wellbeing/incidents/${incident.uuid}`, { type_id: v.type, severity: v.severity, location: v.location || null,
        description: v.description, action_taken: v.action || null, follow_up_on: v.follow_up_on || null, follow_up_notes: v.follow_up_notes || null,
        status: v.status, parent_informed: v.parent_informed, confidential: v.confidential });
      toast.success("Incident updated");
      onSaved();
    } catch (e2) { toast.error("Couldn't save", { description: errMsg(e2) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="lg" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(initial)} title={`Edit incident: ${incident.student_name}`}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="incident-edit" loading={saving}>Save changes</Button></>}>
      <form id="incident-edit" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Type"><Select value={v.type} clearable options={types.rows.map((t) => ({ value: t.id, label: t.name }))} onChange={(x) => setV({ ...v, type: x })} /></Field>
          <Field label="Where"><TextInput value={v.location} onValueChange={(x) => setV({ ...v, location: x })} /></Field>
          <Field label="Severity" className="sm:col-span-2"><RadioCards columns={4} value={v.severity} onChange={(x) => setV({ ...v, severity: x })} options={SEVERITIES} /></Field>
          <Field label="What happened" className="sm:col-span-2"><Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={3} /></Field>
          <Field label="Action taken" className="sm:col-span-2"><Textarea value={v.action} onValueChange={(x) => setV({ ...v, action: x })} rows={2} /></Field>
          <Field label="Follow up on"><DateInput value={v.follow_up_on} onChange={(x) => setV({ ...v, follow_up_on: x })} clearable /></Field>
          <Field label="Status"><Select value={v.status} onChange={(x) => setV({ ...v, status: x ?? "open" })} options={[{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }]} /></Field>
          <Field label="Follow-up notes" className="sm:col-span-2"><Textarea value={v.follow_up_notes} onValueChange={(x) => setV({ ...v, follow_up_notes: x })} rows={2} /></Field>
          <div className="space-y-3 sm:col-span-2">
            <Toggle checked={v.parent_informed} onChange={(x) => setV({ ...v, parent_informed: x })} label={`${term("guardians")} informed`} />
            <Toggle checked={v.confidential} onChange={(x) => setV({ ...v, confidential: x })} label="Confidential" />
          </div>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Points ────────────────────────────────────────────────────────── */

function PointsTab({ canRecord, canManage }: { canRecord: boolean; canManage: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const houses = useGet<House[]>("/wellbeing/houses");
  const list = usePaged<Point>(`/wellbeing/points${qs({ q, page, size, kind: filters.kind?.[0], house_id: filters.house?.[0] })}`);
  const [adding, setAdding] = useState(false);
  const [addKey, setAddKey] = useState(0);
  async function voidIt(p: Point) {
    if (!(await confirm({ title: "Cancel these points?", message: `${p.points > 0 ? "+" : ""}${p.points} for ${p.student_name} will no longer count.`, confirmLabel: "Cancel points", tone: "danger" }))) return;
    try { await api.post(`/wellbeing/points/${p.uuid}/void`); toast.success("Points cancelled"); list.refresh(); }
    catch (e) { toast.error("Couldn't cancel", { description: errMsg(e) }); }
  }
  const columns: Column<Point>[] = [
    { key: "who", header: term("student"), cell: (r) => <StudentCell row={r} /> },
    { key: "pts", header: "Points", align: "right", cell: (r) => <PointsBadge value={r.points} /> },
    { key: "reason", header: "Reason", cell: (r) => <div><p className="text-ink/90">{r.reason}</p>{r.category && <p className="text-[12.5px] text-muted">{r.category}</p>}</div> },
    { key: "house", header: "House", hideBelow: "md", cell: (r) => r.house_name || <span className="text-faint">—</span> },
    { key: "on", header: "Date", hideBelow: "sm", cell: (r) => <span className="text-muted">{formatDate(r.awarded_on)}</span> },
  ];
  return (
    <>
      <FilterBar searchPlaceholder="Search name or reason" onSearchChange={(x) => { setQ(x); setPage(1); }}
        filters={[{ key: "kind", label: "Kind", options: [{ value: "merit", label: "Merits" }, { value: "demerit", label: "Demerits" }] },
          { key: "house", label: "House", options: (houses.data ?? []).map((h) => ({ value: String(h.house_id), label: h.name })) }]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={canRecord && <Button variant="primary" icon={Plus} onClick={() => { setAddKey((k) => k + 1); setAdding(true); }}>Give points</Button>} />
      <DataTable rows={list.rows} rowKey={(r) => r.uuid} columns={columns} loading={list.loading}
        rowActions={canManage ? (r) => [{ label: "Cancel points", icon: Ban, danger: true, onSelect: () => voidIt(r) }] : undefined}
        pagination={{ page, size, total: list.total, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={Award} emptyTitle="No points yet" emptyHint="Reward good work with merit points; they add up for each house."
        emptyAction={canRecord && <Button variant="primary" icon={Plus} onClick={() => { setAddKey((k) => k + 1); setAdding(true); }}>Give points</Button>} />
      {adding && <PointsModal key={addKey} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); list.refresh(); houses.refresh(); }} />}
    </>
  );
}

function PointsModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [v, setV] = useState({ students: [] as number[], kind: "merit", points: 2 as number | null, reason: "", category: "Academics" as string | null, on: todayISO() });
  const [err, setErr] = useState<{ students?: string; reason?: string }>({});
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = { students: v.students.length ? undefined : `Pick at least one ${term("student").toLowerCase()}`, reason: v.reason.trim().length > 1 ? undefined : "Give a reason" };
    if (errs.students || errs.reason || !v.points) { setErr(errs); return; }
    setSaving(true);
    try {
      const pts = Math.abs(v.points) * (v.kind === "merit" ? 1 : -1);
      await api.post("/wellbeing/points", { student_ids: v.students, points: pts, reason: v.reason.trim(), category: v.category, awarded_on: v.on });
      toast.success(`${pts > 0 ? "+" : ""}${pts} points given`);
      onSaved();
    } catch (e2) { toast.error("Couldn't save", { description: errMsg(e2) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} dirty={v.students.length > 0 || !!v.reason} title="Give points"
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="points-form" loading={saving}>Save</Button></>}>
      <form id="points-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label={term("students")} required error={err.students} className="sm:col-span-2">
            <MultiSelect value={v.students} onChange={(x) => { setV({ ...v, students: x }); setErr({ ...err, students: undefined }); }} loadOptions={searchStudents} placeholder="Search by name" />
          </Field>
          <Field label="Kind" className="sm:col-span-2"><RadioCards value={v.kind} onChange={(x) => setV({ ...v, kind: x })} options={[{ value: "merit", label: "Merit", description: "Adds points" }, { value: "demerit", label: "Demerit", description: "Takes points away" }]} /></Field>
          <Field label="Points"><NumberInput value={v.points} onChange={(x) => setV({ ...v, points: x })} min={1} max={50} /></Field>
          <Field label="Date"><DateInput value={v.on} onChange={(x) => setV({ ...v, on: x })} max={todayISO()} /></Field>
          <Field label="Reason" required error={err.reason} className="sm:col-span-2"><TextInput value={v.reason} onValueChange={(x) => { setV({ ...v, reason: x }); setErr({ ...err, reason: undefined }); }} placeholder="e.g. Won the quiz" /></Field>
          <Field label="Category" className="sm:col-span-2"><Select value={v.category} onChange={(x) => setV({ ...v, category: x })} options={CATEGORIES} clearable /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Houses ────────────────────────────────────────────────────────── */

function HousesTab() {
  const { term } = useInstitution();
  const houses = useGet<House[]>("/wellbeing/houses");
  const leaders = useGet<{ student_id: number; student_name: string; section_label: string | null; admission_no: string; photo_url: string | null; points: number }[]>("/wellbeing/points/leaders");
  const rows = houses.data ?? [];
  const max = Math.max(1, ...rows.map((h) => Math.abs(h.points)));
  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <div className="rounded-2xl border border-line bg-surface p-5 lg:col-span-3">
        <h2 className="mb-4 text-[15px] text-ink">House standings</h2>
        {houses.loading ? <p className="text-[13.5px] text-muted">Loading…</p> : rows.length === 0 ? (
          <p className="text-[13.5px] text-muted">No houses set up yet. Add houses under Academics &gt; Rooms & houses.</p>
        ) : (
          <ol className="space-y-4">
            {rows.map((h, i) => (
              <li key={h.house_id}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[14px]">
                  <span className="text-ink"><span className="mr-2 tabular text-faint">{i + 1}</span>{h.name}</span>
                  <span className="tabular text-ink">{h.points} <span className="text-[12px] text-muted">(+{h.merits} / {h.demerits})</span></span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-sunken">
                  <div className="h-full rounded-full" style={{ width: `${Math.max(2, (Math.max(0, h.points) / max) * 100)}%`, background: h.color || "var(--color-primary, #4f46e5)" }} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="rounded-2xl border border-line bg-surface p-5 lg:col-span-2">
        <h2 className="mb-4 text-[15px] text-ink">Top {term("students").toLowerCase()}</h2>
        {(leaders.data ?? []).length === 0 ? <p className="text-[13.5px] text-muted">No points given yet.</p> : (
          <ul className="space-y-3">
            {(leaders.data ?? []).map((l) => (
              <li key={l.student_id} className="flex items-center justify-between gap-3">
                <StudentCell row={l} /><PointsBadge value={l.points} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── Counselling ───────────────────────────────────────────────────── */

function CounsellingTab() {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const list = usePaged<Note>(`/wellbeing/counselling${qs({ q, page, size: 25 })}`);
  const [viewing, setViewing] = useState<Note | null>(null);
  const [form, setForm] = useState<Note | "new" | null>(null);
  const [formKey, setFormKey] = useState(0);
  const openForm = (n: Note | "new") => { setFormKey((k) => k + 1); setForm(n); };
  async function archive(n: Note) {
    if (!(await confirm({ title: "Archive this note?", message: "It will be hidden from the list.", confirmLabel: "Archive", tone: "danger" }))) return;
    try { await api.delete(`/wellbeing/counselling/${n.uuid}`); toast.success("Note archived"); setViewing(null); list.refresh(); }
    catch (e) { toast.error("Couldn't archive", { description: errMsg(e) }); }
  }
  const columns: Column<Note>[] = [
    { key: "who", header: term("student"), cell: (r) => <StudentCell row={r} /> },
    { key: "concern", header: "Concern", cell: (r) => r.concern || <span className="text-faint">—</span> },
    { key: "on", header: "Session", hideBelow: "sm", cell: (r) => formatDate(r.session_on) },
    { key: "next", header: "Next session", hideBelow: "md", cell: (r) => r.next_session_on ? formatDate(r.next_session_on) : <span className="text-faint">—</span> },
  ];
  return (
    <>
      <p className="mb-4 flex items-center gap-2 text-[13px] text-muted"><Lock size={14} strokeWidth={STROKE} />Counselling notes are private. Only people with counselling access can see them, and every view is recorded.</p>
      <FilterBar searchPlaceholder="Search name or concern" onSearchChange={(x) => { setQ(x); setPage(1); }}
        actions={<Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New note</Button>} />
      <DataTable rows={list.rows} rowKey={(r) => r.uuid} columns={columns} loading={list.loading} onRowClick={setViewing}
        rowActions={(r) => [{ label: "View", icon: Eye, onSelect: () => setViewing(r) }, { label: "Edit", icon: Pencil, onSelect: () => openForm(r) },
          "separator", { label: "Archive", icon: Archive, danger: true, onSelect: () => archive(r) }]}
        pagination={{ page, size: 25, total: list.total, onPageChange: setPage }}
        emptyIcon={MessageSquareHeart} emptyTitle="No counselling notes" emptyHint="Write a note after each session."
        emptyAction={<Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New note</Button>} />
      <Modal open={!!viewing} onClose={() => setViewing(null)} size="md" title={viewing?.student_name} description={viewing ? `${formatDate(viewing.session_on)}${viewing.counsellor ? ` · ${viewing.counsellor}` : ""}` : undefined}
        headerActions={viewing && <Button size="sm" icon={Pencil} onClick={() => { openForm(viewing); setViewing(null); }}>Edit</Button>}>
        {viewing && <>
          <Section title="Notes"><p className="whitespace-pre-wrap text-[14px] text-ink">{viewing.notes}</p></Section>
          <Section title="Plan" className="border-t border-line"><KeyValue items={[{ label: "Concern", value: viewing.concern }, { label: "Next session", value: viewing.next_session_on ? formatDate(viewing.next_session_on) : null }, { label: "Plan", value: viewing.plan, span: 2 }]} /></Section>
        </>}
      </Modal>
      {form && <NoteModal key={formKey} note={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); list.refresh(); }} />}
    </>
  );
}

function NoteModal({ note, onClose, onSaved }: { note: Note | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const initial = { student: note?.student_id ?? null as number | null, session_on: note?.session_on ?? todayISO(), concern: note?.concern ?? "", notes: note?.notes ?? "", plan: note?.plan ?? "", next: note?.next_session_on ?? "" };
  const [v, setV] = useState(initial);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.student || v.notes.trim().length < 2) { setErr(!v.student ? `Pick the ${term("student").toLowerCase()}` : "Write the notes"); return; }
    setSaving(true);
    try {
      const body = { concern: v.concern || null, notes: v.notes.trim(), plan: v.plan || null, next_session_on: v.next || null };
      if (note) await api.put(`/wellbeing/counselling/${note.uuid}`, body);
      else await api.post("/wellbeing/counselling", { ...body, student_id: v.student, session_on: v.session_on });
      toast.success("Note saved");
      onSaved();
    } catch (e2) { toast.error("Couldn't save", { description: errMsg(e2) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="lg" busy={saving} dirty={JSON.stringify(v) !== JSON.stringify(initial)} title={note ? "Edit note" : "New counselling note"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="note-form" loading={saving}>Save note</Button></>}>
      <form id="note-form" onSubmit={submit} noValidate>
        <FormGrid>
          {note ? <Field label={term("student")}><p className="text-[14px]">{note.student_name}</p></Field> : (
            <Field label={term("student")} required><Select value={v.student} onChange={(x) => setV({ ...v, student: x })} loadOptions={searchStudents} placeholder="Search by name" /></Field>
          )}
          <Field label="Session date"><DateInput value={v.session_on} onChange={(x) => setV({ ...v, session_on: x })} max={todayISO()} disabled={!!note} /></Field>
          <Field label="Concern" className="sm:col-span-2"><TextInput value={v.concern} onValueChange={(x) => setV({ ...v, concern: x })} placeholder="e.g. Exam stress" /></Field>
          <Field label="Notes" required error={err} className="sm:col-span-2"><Textarea value={v.notes} onValueChange={(x) => { setV({ ...v, notes: x }); setErr(""); }} rows={6} /></Field>
          <Field label="Plan" className="sm:col-span-2"><Textarea value={v.plan} onValueChange={(x) => setV({ ...v, plan: x })} rows={2} /></Field>
          <Field label="Next session"><DateInput value={v.next} onChange={(x) => setV({ ...v, next: x })} min={todayISO()} clearable /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Settings: incident types ──────────────────────────────────────── */

function TypesTab() {
  const toast = useToast();
  const list = usePaged<IType>("/wellbeing/incident-types?all=true");
  const [form, setForm] = useState<IType | "new" | null>(null);
  const [formKey, setFormKey] = useState(0);
  const openForm = (t: IType | "new") => { setFormKey((k) => k + 1); setForm(t); };
  async function toggle(t: IType) {
    try { await api.put(`/wellbeing/incident-types/${t.uuid}`, { active: !t.active }); list.refresh(); }
    catch (e) { toast.error("Couldn't change it", { description: errMsg(e) }); }
  }
  const columns: Column<IType>[] = [
    { key: "name", header: "Incident type", cell: (t) => <span className="text-ink">{t.name}</span> },
    { key: "sev", header: "Usual severity", cell: (t) => <SeverityBadge value={t.default_severity} /> },
    { key: "pts", header: "Demerits", align: "right", cell: (t) => <PointsBadge value={t.default_points} /> },
    { key: "on", header: "Status", cell: (t) => <Badge tone={t.active ? "good" : "neutral"} dot>{t.active ? "In use" : "Off"}</Badge> },
  ];
  return (
    <>
      <FilterBar actions={<Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New type</Button>} />
      <DataTable rows={list.rows} rowKey={(t) => t.uuid} columns={columns} loading={list.loading} onRowClick={openForm}
        rowActions={(t) => [{ label: "Edit", icon: Pencil, onSelect: () => openForm(t) }, { label: t.active ? "Switch off" : "Switch on", icon: Ban, onSelect: () => toggle(t) }]}
        emptyIcon={Settings2} emptyTitle="No incident types" emptyHint="Add the kinds of incidents you record, with their usual demerit points." />
      {form && <TypeModal key={formKey} type={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); list.refresh(); }} />}
    </>
  );
}

function TypeModal({ type, onClose, onSaved }: { type: IType | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ name: type?.name ?? "", severity: type?.default_severity ?? "low", points: type?.default_points ?? 0 as number | null });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setErr("Give it a name"); return; }
    setSaving(true);
    const body = { name: v.name.trim(), default_severity: v.severity, default_points: Math.min(0, v.points ?? 0) };
    try {
      if (type) await api.put(`/wellbeing/incident-types/${type.uuid}`, body); else await api.post("/wellbeing/incident-types", body);
      toast.success("Saved");
      onSaved();
    } catch (e2) { toast.error("Couldn't save", { description: errMsg(e2) }); } finally { setSaving(false); }
  }
  const opts: SelectOption<string>[] = SEVERITIES;
  return (
    <Modal open onClose={onClose} size="sm" busy={saving} title={type ? "Edit incident type" : "New incident type"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="type-form" loading={saving}>Save</Button></>}>
      <form id="type-form" onSubmit={submit} noValidate className="space-y-5">
        <Field label="Name" required error={err}><TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setErr(""); }} /></Field>
        <Field label="Usual severity"><Select value={v.severity} onChange={(x) => setV({ ...v, severity: x ?? "low" })} options={opts} /></Field>
        <Field label="Demerit points" hint="0 or less"><NumberInput value={v.points} onChange={(x) => setV({ ...v, points: x })} min={-100} max={0} /></Field>
      </form>
    </Modal>
  );
}
