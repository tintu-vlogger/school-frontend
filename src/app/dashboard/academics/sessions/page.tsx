"use client";

/*
 * Sessions & terms: academic years (or intakes) and the terms / semesters / modules inside
 * them. One session is current; it is what every other screen shows by default.
 */
import { useState } from "react";
import { CalendarRange, CheckCircle2, Eye, Pencil, Plus, Power } from "lucide-react";
import { useAccess } from "@/lib/access";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateInput, Field, FormGrid, Menu, Modal, ModalCancel, NumberInput, Select, TextInput, useConfirm,
  type Column,
} from "@/components/ui-kit";
import { errText, useList, type AcademicSession, type Term } from "@/components/academics/shared";

const TERM_KINDS = [
  { value: "term", label: "Term" }, { value: "semester", label: "Semester" }, { value: "trimester", label: "Trimester" },
  { value: "quarter", label: "Quarter" }, { value: "module", label: "Module" },
];
const STATUS = [{ value: "planned", label: "Planned" }, { value: "active", label: "Running" }, { value: "closed", label: "Closed" }];
const fmt = (d: string) => formatDate(`${d}T12:00:00Z`, { day: "numeric", month: "short", year: "numeric" });

export default function SessionsPage() {
  const { term, reload: reloadProfile } = useInstitution();
  const canManage = useAccess().can("academics.manage");
  const toast = useToast();
  const confirm = useConfirm();
  const { rows, loading, reload } = useList<AcademicSession>("/academics/sessions");
  const list = rows.filter((s) => s.active).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const [form, setForm] = useState<{ open: boolean; target: AcademicSession | null; key: number }>({ open: false, target: null, key: 0 });
  const [viewId, setViewId] = useState<number | null>(null);
  const [viewOpen, setViewOpen] = useState(false);
  const viewing = rows.find((s) => s.id === viewId) ?? null;
  const open = (s: AcademicSession | null) => setForm((f) => ({ open: true, target: s, key: f.key + 1 }));

  async function makeCurrent(s: AcademicSession) {
    if (!await confirm({ title: `Make ${s.name} the current ${term("session").toLowerCase()}?`, confirmLabel: "Make current",
      message: `Every screen (attendance, timetable, fees, ${term("students").toLowerCase()}) will show ${s.name} by default.` })) return;
    try { await api.post(`/academics/sessions/${s.uuid}/make-current`); toast.success(`${s.name} is now current`); reload(); reloadProfile(); }
    catch (e) { toast.error("Couldn't change it", { description: errText(e) }); }
  }
  async function switchOff(s: AcademicSession) {
    if (s.is_current) { toast.info(`Make another ${term("session").toLowerCase()} current first`); return; }
    if (!await confirm({ title: `Switch off ${s.name}?`, tone: "danger", confirmLabel: "Switch off", message: "It is hidden from pickers. Records in it are kept." })) return;
    try { await api.delete(`/academics/sessions/${s.uuid}`); toast.success(`${s.name} switched off`); reload(); }
    catch (e) { toast.error("Couldn't switch it off", { description: errText(e) }); }
  }

  const columns: Column<AcademicSession>[] = [
    { key: "name", header: term("session"), sortable: true, sortValue: (s) => s.start_date, cell: (s) => (
      <span className="flex items-center gap-2"><span className="text-ink">{s.name}</span>{s.is_current && <Badge tone="accent" dot>Current</Badge>}</span>
    ) },
    { key: "dates", header: "Dates", hideBelow: "sm", cell: (s) => <span className="text-muted">{fmt(s.start_date)} – {fmt(s.end_date)}</span> },
    { key: "terms", header: term("terms"), align: "right", cell: (s) => <span className="tabular">{s.terms.length}</span> },
    { key: "status", header: "Status", cell: (s) => <Badge tone={s.status === "active" ? "good" : s.status === "planned" ? "info" : "neutral"} dot>{STATUS.find((x) => x.value === s.status)?.label}</Badge> },
  ];

  return (
    <div>
      <PageHeader eyebrow="Academics" title={`${term("session")}s & ${term("terms").toLowerCase()}`}
        description={`Each ${term("session").toLowerCase()} and the ${term("terms").toLowerCase()} inside it. The current one is what every screen opens on.`}
        actions={canManage ? <Button variant="primary" icon={Plus} onClick={() => open(null)}>Add {term("session").toLowerCase()}</Button> : undefined} />
      <DataTable rows={list} rowKey={(s) => s.uuid} columns={columns} loading={loading}
        onRowClick={(s) => { setViewId(s.id); setViewOpen(true); }}
        rowActions={(s) => [
          { label: `View ${term("terms").toLowerCase()}`, icon: Eye, onSelect: () => { setViewId(s.id); setViewOpen(true); } },
          ...(canManage ? [
            { label: "Edit", icon: Pencil, onSelect: () => open(s) },
            ...(!s.is_current ? [{ label: "Make current", icon: CheckCircle2, onSelect: () => makeCurrent(s) }, "separator" as const,
              { label: "Switch off", icon: Power, danger: true, onSelect: () => switchOff(s) }] : []),
          ] : []),
        ]}
        emptyIcon={CalendarRange} emptyTitle={`No ${term("session").toLowerCase()}s yet`}
        emptyHint={`Add the current ${term("session").toLowerCase()}, for example 2026-27, with its start and end dates.`}
        emptyAction={canManage && <Button variant="primary" icon={Plus} onClick={() => open(null)}>Add {term("session").toLowerCase()}</Button>} />

      <SessionModal key={form.key} open={form.open} target={form.target} onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={() => { setForm((f) => ({ ...f, open: false })); reload(); reloadProfile(); }} />
      <SessionDetail session={viewing} open={viewOpen && !!viewing} canManage={canManage} onClose={() => setViewOpen(false)}
        onChanged={reload} onEdit={(s) => { setViewOpen(false); open(s); }} onMakeCurrent={makeCurrent} />
    </div>
  );
}

function SessionModal({ open, target, onClose, onSaved }: { open: boolean; target: AcademicSession | null; onClose: () => void; onSaved: () => void }) {
  const { term } = useInstitution();
  const toast = useToast();
  const y = new Date().getFullYear();
  const initial = {
    name: target?.name ?? `${y}-${String(y + 1).slice(-2)}`, start_date: target?.start_date ?? `${y}-04-01`, end_date: target?.end_date ?? `${y + 1}-03-31`,
    status: target?.status ?? "active", is_current: false,
  };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError("Give it a name"); return; }
    if (!v.start_date || !v.end_date || v.end_date <= v.start_date) { setError("The end date must be after the start date"); return; }
    setSaving(true);
    try {
      if (target) await api.put(`/academics/sessions/${target.uuid}`, { name: v.name.trim(), start_date: v.start_date, end_date: v.end_date, status: v.status });
      else await api.post("/academics/sessions", { ...v, name: v.name.trim() });
      toast.success(target ? "Saved" : `${term("session")} added`);
      onSaved();
    } catch (err) { toast.error("Couldn't save", { description: errText(err) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" dirty={dirty} busy={saving}
      title={target ? `Edit ${target.name}` : `Add ${term("session").toLowerCase()}`}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="session-form" loading={saving}>{target ? "Save changes" : "Add"}</Button></>}>
      <form id="session-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Name" required error={error} className="sm:col-span-2">
            <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} placeholder="e.g. 2026-27, Fall 2026" maxLength={60} />
          </Field>
          <Field label="Starts"><DateInput value={v.start_date} onChange={(x) => setV({ ...v, start_date: x })} /></Field>
          <Field label="Ends"><DateInput value={v.end_date} onChange={(x) => setV({ ...v, end_date: x })} min={v.start_date} /></Field>
          <Field label="Status"><Select value={v.status} onChange={(x) => setV({ ...v, status: (x ?? "active") as typeof v.status })} options={STATUS} /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

function SessionDetail({ session: s, open, canManage, onClose, onChanged, onEdit, onMakeCurrent }: {
  session: AcademicSession | null; open: boolean; canManage: boolean; onClose: () => void; onChanged: () => void;
  onEdit: (s: AcademicSession) => void; onMakeCurrent: (s: AcademicSession) => void;
}) {
  const { term } = useInstitution();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<{ open: boolean; target: Term | null; key: number }>({ open: false, target: null, key: 0 });
  const terms = (s?.terms ?? []).filter((t) => t.active).sort((a, b) => a.sort_order - b.sort_order);
  async function switchOff(t: Term) {
    if (!await confirm({ title: `Switch off ${t.name}?`, tone: "danger", confirmLabel: "Switch off", message: "It is hidden from pickers. Records in it are kept." })) return;
    try { await api.delete(`/academics/terms/${t.uuid}`); toast.success(`${t.name} switched off`); onChanged(); }
    catch (e) { toast.error("Couldn't switch it off", { description: errText(e) }); }
  }
  return (
    <>
      <Modal open={open} onClose={onClose} size="lg" title={s?.name}
        description={s ? `${fmt(s.start_date)} – ${fmt(s.end_date)}` : undefined}
        headerActions={s && canManage && <>
          {!s.is_current && <Button size="sm" icon={CheckCircle2} onClick={() => onMakeCurrent(s)}>Make current</Button>}
          <Button size="sm" icon={Pencil} onClick={() => onEdit(s)}>Edit</Button>
        </>}>
        {s && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[15px] text-ink">{term("terms")}</p>
              {canManage && <Button size="sm" icon={Plus} onClick={() => setForm((f) => ({ open: true, target: null, key: f.key + 1 }))}>Add {term("term").toLowerCase()}</Button>}
            </div>
            {terms.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13.5px] text-muted">
                No {term("terms").toLowerCase()} yet. Split the {term("session").toLowerCase()} into {term("terms").toLowerCase()} for exams and reports.
              </p>
            ) : (
              <div className="divide-y divide-line rounded-xl border border-line">
                {terms.map((t) => (
                  <div key={t.uuid} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-[14px] text-ink">{t.name}<Badge>{TERM_KINDS.find((k) => k.value === t.kind)?.label ?? t.kind}</Badge></p>
                      <p className="text-[12.5px] text-muted">{fmt(t.start_date)} – {fmt(t.end_date)}</p>
                    </div>
                    {canManage && <Menu items={[
                      { label: "Edit", icon: Pencil, onSelect: () => setForm((f) => ({ open: true, target: t, key: f.key + 1 })) },
                      "separator",
                      { label: "Switch off", icon: Power, danger: true, onSelect: () => switchOff(t) },
                    ]} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>
      {s && <TermModal key={form.key} open={form.open} target={form.target} session={s} count={terms.length}
        onClose={() => setForm((f) => ({ ...f, open: false }))} onSaved={() => { setForm((f) => ({ ...f, open: false })); onChanged(); }} />}
    </>
  );
}

function TermModal({ open, target, session, count, onClose, onSaved }: {
  open: boolean; target: Term | null; session: AcademicSession; count: number; onClose: () => void; onSaved: () => void;
}) {
  const { term, profile } = useInstitution();
  const toast = useToast();
  const kind = target?.kind ?? (["semester", "module"].includes(term("term").toLowerCase()) ? term("term").toLowerCase() : profile?.type === "college" || profile?.type === "university" ? "semester" : "term");
  const label = TERM_KINDS.find((k) => k.value === kind)?.label ?? "Term";
  const initial = {
    name: target?.name ?? `${label} ${count + 1}`, kind, start_date: target?.start_date ?? session.start_date,
    end_date: target?.end_date ?? session.end_date, sort_order: target?.sort_order ?? count + 1,
  };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError("Give it a name"); return; }
    if (v.end_date < v.start_date) { setError("The end date must be on or after the start date"); return; }
    setSaving(true);
    try {
      const body = { ...v, name: v.name.trim() };
      if (target) await api.put(`/academics/terms/${target.uuid}`, body);
      else await api.post("/academics/terms", { ...body, session_id: session.id });
      toast.success(target ? "Saved" : `${term("term")} added`);
      onSaved();
    } catch (err) { toast.error("Couldn't save", { description: errText(err) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" dirty={dirty} busy={saving} zIndex={80}
      title={target ? `Edit ${target.name}` : `Add ${term("term").toLowerCase()} to ${session.name}`}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="term-form" loading={saving}>{target ? "Save changes" : "Add"}</Button></>}>
      <form id="term-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Name" required error={error}>
            <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} maxLength={60} />
          </Field>
          <Field label="Kind"><Select value={v.kind} onChange={(x) => setV({ ...v, kind: x ?? "term" })} options={TERM_KINDS} /></Field>
          <Field label="Starts"><DateInput value={v.start_date} onChange={(x) => setV({ ...v, start_date: x })} min={session.start_date} max={session.end_date} /></Field>
          <Field label="Ends"><DateInput value={v.end_date} onChange={(x) => setV({ ...v, end_date: x })} min={v.start_date} max={session.end_date} /></Field>
          <Field label="Order"><NumberInput value={v.sort_order} onChange={(x) => setV({ ...v, sort_order: x ?? 1 })} min={1} max={20} /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}
