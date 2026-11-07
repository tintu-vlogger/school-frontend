"use client";

/*
 * Health & infirmary: learners' health records (with allergies and conditions flagged),
 * infirmary visits, and periodic check-up camps. Every add / edit / detail opens a modal.
 */
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Eye, HeartPulse, Pencil, Phone, Plus, Stethoscope, Syringe, Thermometer, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime, todayISO } from "@/lib/datetime";
import { useUrlTab } from "@/lib/use-url-tab";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, FormSection, KeyValue, Modal, ModalCancel, NumberInput, Section,
  Select, Skeleton, StatCard, Tabs, TextInput, Textarea, Toggle, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { STROKE, StudentCell, errMsg, qs, searchStudents, useGet, usePaged } from "@/components/wellbeing/common";

type HealthRow = {
  student_id: number; student_name: string; admission_no: string; section_label: string | null; photo_url: string | null;
  blood_group: string | null; allergies: string | null; medical_notes: string | null; height_cm: number | null; weight_kg: number | null;
  bmi: number | null; bmi_band: string | null; measured_on: string | null; chronic_conditions: string | null;
};
type Imm = { vaccine: string; dose: string | null; date: string | null; notes: string | null };
type Checkup = {
  uuid: string; checked_on: string; camp: string | null; height_cm: number | null; weight_kg: number | null; bmi: number | null;
  vision_left: string | null; vision_right: string | null; dental: string | null; blood_pressure: string | null; pulse: number | null;
  findings: string | null; recommendations: string | null; examined_by: string | null; student_name?: string; section_label?: string | null;
  admission_no?: string; photo_url?: string | null;
};
type Visit = {
  uuid: string; visit_at: string; complaint: string; temperature: number | null; treatment: string | null; medicine_given: string | null;
  sent_home: boolean; parent_informed: boolean; follow_up: string | null; attended_by: string | null;
  student_id?: number; student_name?: string; section_label?: string | null; admission_no?: string; photo_url?: string | null; allergies?: string | null;
};
type HealthDetail = HealthRow & {
  vision_left: string | null; vision_right: string | null; dental: string | null; hearing: string | null; doctor_name: string | null;
  doctor_phone: string | null; insurance: string | null; notes: string | null; immunisations: Imm[]; checkups: Checkup[]; visits: Visit[];
  contacts: { name: string; relation: string; phone: string | null }[];
};
type Camp = { id: number; uuid: string; name: string; kind: string; held_on: string; doctor: string | null; agency: string | null; notes: string | null; active: boolean; checked: number };

const TABS = ["records", "infirmary", "camps"] as const;
type Tab = (typeof TABS)[number];

export default function HealthPage() {
  const { term } = useInstitution();
  const access = useAccess();
  const canManage = access.can("wellbeing.manage");
  const canRecord = canManage || access.can("wellbeing.record");
  const [tab, setTab] = useState<Tab>("records");
  useUrlTab(TABS, setTab);
  const summary = useGet<{ infirmary_today: number; sent_home_today: number }>("/wellbeing/summary");
  const [visitOpen, setVisitOpen] = useState(false);
  const [visitKey, setVisitKey] = useState(0);
  const [nonce, setNonce] = useState(0);

  return (
    <div>
      <PageHeader eyebrow="Wellbeing" title="Health & infirmary"
        description={`Health records of every ${term("student").toLowerCase()}, infirmary visits and check-up camps.`}
        actions={canRecord ? <Button variant="primary" icon={Plus} onClick={() => { setVisitKey((k) => k + 1); setVisitOpen(true); }}>Log infirmary visit</Button> : undefined} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Infirmary visits today" value={summary.data?.infirmary_today ?? "–"} icon={Stethoscope} />
        <StatCard label="Sent home today" value={summary.data?.sent_home_today ?? "–"} icon={Thermometer} />
      </div>
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[
        { value: "records", label: "Health records", icon: HeartPulse },
        { value: "infirmary", label: "Infirmary", icon: Stethoscope },
        { value: "camps", label: "Check-up camps", icon: Activity },
      ]} />
      {tab === "records" && <RecordsTab canManage={canManage} />}
      {tab === "infirmary" && <InfirmaryTab key={nonce} canRecord={canRecord} onNew={() => { setVisitKey((k) => k + 1); setVisitOpen(true); }} />}
      {tab === "camps" && <CampsTab canManage={canManage} />}
      <VisitFormModal key={visitKey} open={visitOpen} visit={null} onClose={() => setVisitOpen(false)}
        onSaved={() => { setVisitOpen(false); setNonce((n) => n + 1); summary.refresh(); if (tab !== "infirmary") setTab("infirmary"); }} />
    </div>
  );
}

/* ── Health records ────────────────────────────────────────────────── */

function RecordsTab({ canManage }: { canManage: boolean }) {
  const { term } = useInstitution();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const sections = useGet<{ id: number; label: string }[]>("/academics/section-options");
  const path = `/wellbeing/health${qs({ q, page, size, section_id: filters.section?.[0], flag: filters.flag?.[0] })}`;
  const list = usePaged<HealthRow>(path);
  const [viewing, setViewing] = useState<number | null>(null);
  const [editing, setEditing] = useState<HealthDetail | null>(null);
  const [editKey, setEditKey] = useState(0);
  const [detailNonce, setDetailNonce] = useState(0);

  const columns: Column<HealthRow>[] = [
    { key: "name", header: term("student"), cell: (r) => <StudentCell row={r} /> },
    { key: "hw", header: "Height / weight", hideBelow: "md", cell: (r) => r.height_cm ? <span className="tabular text-ink/80">{r.height_cm} cm · {r.weight_kg} kg</span> : <span className="text-faint">Not measured</span> },
    { key: "bmi", header: "BMI", hideBelow: "sm", cell: (r) => r.bmi ? <span className="tabular">{r.bmi} <span className="text-[12px] text-muted">{r.bmi_band}</span></span> : <span className="text-faint">—</span> },
    { key: "blood", header: "Blood group", hideBelow: "lg", cell: (r) => r.blood_group || <span className="text-faint">—</span> },
    { key: "flags", header: "Alerts", cell: (r) => (
      <div className="flex flex-wrap gap-1.5">
        {r.allergies && <Badge tone="bad" dot>Allergy</Badge>}
        {(r.chronic_conditions || r.medical_notes) && <Badge tone="warn" dot>Condition</Badge>}
        {!r.allergies && !r.chronic_conditions && !r.medical_notes && <span className="text-faint">—</span>}
      </div>) },
  ];
  const sectionOpts = (sections.data ?? []).map((s) => ({ value: String(s.id), label: s.label }));
  const filtered = !!q || Object.values(filters).some((v) => v?.length);
  return (
    <>
      <FilterBar searchPlaceholder={`Search ${term("students").toLowerCase()}`} onSearchChange={(x) => { setQ(x); setPage(1); }}
        filters={[
          { key: "section", label: term("section"), options: sectionOpts },
          { key: "flag", label: "Show", options: [{ value: "allergies", label: "With allergies" }, { value: "conditions", label: "With conditions" }, { value: "missing", label: "Not measured" }] },
        ]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={list.rows} rowKey={(r) => r.student_id} columns={columns} loading={list.loading} onRowClick={(r) => setViewing(r.student_id)}
        rowActions={(r) => [{ label: "View record", icon: Eye, onSelect: () => setViewing(r.student_id) }]}
        pagination={{ page, size, total: list.total, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={HeartPulse} emptyTitle={filtered ? "No one matches" : `No ${term("students").toLowerCase()} yet`}
        emptyHint={filtered ? "Try another search or clear the filters." : `Health records appear here once ${term("students").toLowerCase()} are added.`} />
      <HealthDetailModal key={`${viewing}-${detailNonce}`} studentId={viewing} onClose={() => setViewing(null)} canManage={canManage}
        onEdit={(d) => { setEditKey((k) => k + 1); setEditing(d); }} />
      {editing && <HealthFormModal key={editKey} detail={editing} open onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); setDetailNonce((n) => n + 1); list.refresh(); }} />}
    </>
  );
}

function HealthDetailModal({ studentId, onClose, canManage, onEdit }: { studentId: number | null; onClose: () => void; canManage: boolean; onEdit: (d: HealthDetail) => void }) {
  const { term } = useInstitution();
  const { data: d, loading } = useGet<HealthDetail>(studentId ? `/wellbeing/health/${studentId}` : null);
  return (
    <Modal open={studentId !== null} onClose={onClose} size="lg" title={d?.student_name ?? "Health record"}
      description={d ? [d.section_label, d.admission_no].filter(Boolean).join(" · ") : undefined}
      headerActions={d && canManage && <Button size="sm" icon={Pencil} onClick={() => onEdit(d)}>Edit</Button>}>
      {loading || !d ? <div className="space-y-3"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-4 w-2/3" /><Skeleton className="h-24 w-full" /></div> : (
        <>
          {(d.allergies || d.medical_notes) && (
            <div className="mb-6 flex gap-3 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-[13.5px] text-rose-800">
              <AlertTriangle size={18} strokeWidth={STROKE} className="mt-0.5 shrink-0" />
              <div>
                {d.allergies && <p><span className="text-rose-900">Allergies:</span> {d.allergies}</p>}
                {d.medical_notes && <p><span className="text-rose-900">Medical notes:</span> {d.medical_notes}</p>}
                <p className="mt-1 text-[12px] text-rose-700/80">From the {term("student").toLowerCase()}&apos;s profile.</p>
              </div>
            </div>
          )}
          <Section title="Measurements" description={d.measured_on ? `Last measured ${formatDate(d.measured_on)}` : "Not measured yet"}>
            <KeyValue columns={3} items={[
              { label: "Height", value: d.height_cm ? `${d.height_cm} cm` : null },
              { label: "Weight", value: d.weight_kg ? `${d.weight_kg} kg` : null },
              { label: "BMI", value: d.bmi ? <span>{d.bmi} <span className="text-muted">({d.bmi_band})</span></span> : null },
              { label: "Vision (L / R)", value: d.vision_left || d.vision_right ? `${d.vision_left || "—"} / ${d.vision_right || "—"}` : null },
              { label: "Dental", value: d.dental },
              { label: "Hearing", value: d.hearing },
              { label: "Blood group", value: d.blood_group },
              { label: "Conditions", value: d.chronic_conditions, span: 2 },
            ]} />
          </Section>
          <Section title="Immunisations" className="border-t border-line">
            {d.immunisations.length === 0 ? <p className="text-[13.5px] text-muted">None recorded.</p> : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {d.immunisations.map((i, k) => (
                  <li key={k} className="flex items-center gap-3 px-4 py-2.5 text-[13.5px]">
                    <Syringe size={15} strokeWidth={STROKE} className="text-faint" />
                    <span className="flex-1 text-ink">{i.vaccine}{i.dose ? <span className="text-muted"> · dose {i.dose}</span> : null}</span>
                    <span className="text-muted">{i.date ? formatDate(i.date) : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Doctor and contacts" className="border-t border-line">
            <KeyValue columns={3} items={[
              { label: "Family doctor", value: d.doctor_name },
              { label: "Doctor's phone", value: d.doctor_phone },
              { label: "Insurance", value: d.insurance },
              ...d.contacts.map((c) => ({ label: c.relation, value: <span className="flex items-center gap-1.5">{c.name}{c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-primary"><Phone size={13} strokeWidth={STROKE} />{c.phone}</a>}</span> })),
            ]} />
            {d.notes && <p className="mt-4 text-[13.5px] text-muted">{d.notes}</p>}
          </Section>
          <Section title="Check-ups" className="border-t border-line">
            {d.checkups.length === 0 ? <p className="text-[13.5px] text-muted">No check-ups yet.</p> : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {d.checkups.map((c) => (
                  <li key={c.uuid} className="px-4 py-2.5 text-[13.5px]">
                    <div className="flex justify-between gap-3"><span className="text-ink">{c.camp || "Check-up"}</span><span className="text-muted">{formatDate(c.checked_on)}</span></div>
                    <p className="text-muted">{[c.height_cm && `${c.height_cm} cm`, c.weight_kg && `${c.weight_kg} kg`, c.bmi && `BMI ${c.bmi}`, c.vision_left && `vision ${c.vision_left}/${c.vision_right}`, c.dental].filter(Boolean).join(" · ")}</p>
                    {c.recommendations && <p className="text-amber-700">{c.recommendations}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Infirmary visits" className="border-t border-line">
            {d.visits.length === 0 ? <p className="text-[13.5px] text-muted">No visits.</p> : (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {d.visits.map((v) => (
                  <li key={v.uuid} className="px-4 py-2.5 text-[13.5px]">
                    <div className="flex justify-between gap-3"><span className="text-ink">{v.complaint}</span><span className="text-muted">{formatDateTime(v.visit_at)}</span></div>
                    <p className="text-muted">{[v.treatment, v.medicine_given].filter(Boolean).join(" · ")}{v.sent_home ? " · sent home" : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </Modal>
  );
}

function HealthFormModal({ detail, open, onClose, onSaved }: { detail: HealthDetail; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const initial = {
    height_cm: detail.height_cm, weight_kg: detail.weight_kg, measured_on: detail.measured_on ?? "",
    vision_left: detail.vision_left ?? "", vision_right: detail.vision_right ?? "", dental: detail.dental ?? "", hearing: detail.hearing ?? "",
    chronic_conditions: detail.chronic_conditions ?? "", doctor_name: detail.doctor_name ?? "", doctor_phone: detail.doctor_phone ?? "",
    insurance: detail.insurance ?? "", notes: detail.notes ?? "", immunisations: detail.immunisations.map((i) => ({ ...i, dose: i.dose ?? "", date: i.date ?? "", notes: i.notes ?? "" })),
  };
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const set = <K extends keyof typeof v>(k: K, x: (typeof v)[K]) => setV((p) => ({ ...p, [k]: x }));
  const s = (x: string) => x.trim() || null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/wellbeing/health/${detail.student_id}`, {
        height_cm: v.height_cm, weight_kg: v.weight_kg, measured_on: v.measured_on || null, vision_left: s(v.vision_left),
        vision_right: s(v.vision_right), dental: s(v.dental), hearing: s(v.hearing), chronic_conditions: s(v.chronic_conditions),
        doctor_name: s(v.doctor_name), doctor_phone: s(v.doctor_phone), insurance: s(v.insurance), notes: s(v.notes),
        immunisations: v.immunisations.filter((i) => i.vaccine.trim()).map((i) => ({ vaccine: i.vaccine.trim(), dose: s(i.dose), date: i.date || null, notes: s(i.notes) })),
      });
      toast.success("Health record saved");
      onSaved();
    } catch (err) { toast.error("Couldn't save the record", { description: errMsg(err) }); } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving} title={`Health record: ${detail.student_name}`}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="health-form" loading={saving}>Save record</Button></>}>
      <form id="health-form" onSubmit={submit} noValidate>
        <FormSection title="Measurements">
          <FormGrid columns={3}>
            <Field label="Height"><NumberInput value={v.height_cm} onChange={(x) => set("height_cm", x)} min={30} max={250} step={0.5} suffix="cm" /></Field>
            <Field label="Weight"><NumberInput value={v.weight_kg} onChange={(x) => set("weight_kg", x)} min={2} max={300} step={0.5} suffix="kg" /></Field>
            <Field label="Measured on"><DateInput value={v.measured_on} onChange={(x) => set("measured_on", x)} max={todayISO()} clearable /></Field>
            <Field label="Vision, left eye"><TextInput value={v.vision_left} onValueChange={(x) => set("vision_left", x)} placeholder="6/6" /></Field>
            <Field label="Vision, right eye"><TextInput value={v.vision_right} onValueChange={(x) => set("vision_right", x)} placeholder="6/6" /></Field>
            <Field label="Hearing"><TextInput value={v.hearing} onValueChange={(x) => set("hearing", x)} placeholder="Normal" /></Field>
            <Field label="Dental" className="sm:col-span-3"><TextInput value={v.dental} onValueChange={(x) => set("dental", x)} placeholder="Healthy" /></Field>
            <Field label="Long-term conditions" className="sm:col-span-3" hint="Allergies and medical notes live on the profile.">
              <Textarea value={v.chronic_conditions} onValueChange={(x) => set("chronic_conditions", x)} rows={2} placeholder="e.g. Asthma, uses an inhaler" />
            </Field>
          </FormGrid>
        </FormSection>
        <FormSection title="Immunisations">
          <div className="space-y-2">
            {v.immunisations.map((i, k) => (
              <div key={k} className="grid grid-cols-[1fr_80px_150px_auto] items-center gap-2">
                <TextInput aria-label="Vaccine" value={i.vaccine} placeholder="Vaccine" onValueChange={(x) => set("immunisations", v.immunisations.map((y, j) => j === k ? { ...y, vaccine: x } : y))} />
                <TextInput aria-label="Dose" value={i.dose ?? ""} placeholder="Dose" onValueChange={(x) => set("immunisations", v.immunisations.map((y, j) => j === k ? { ...y, dose: x } : y))} />
                <DateInput value={i.date ?? ""} onChange={(x) => set("immunisations", v.immunisations.map((y, j) => j === k ? { ...y, date: x } : y))} clearable />
                <Button type="button" variant="ghost" size="sm" icon={Trash2} aria-label="Remove" onClick={() => set("immunisations", v.immunisations.filter((_, j) => j !== k))} />
              </div>
            ))}
            <Button type="button" size="sm" icon={Plus} onClick={() => set("immunisations", [...v.immunisations, { vaccine: "", dose: "", date: "", notes: "" }])}>Add vaccine</Button>
          </div>
        </FormSection>
        <FormSection title="Doctor">
          <FormGrid columns={3}>
            <Field label="Family doctor"><TextInput value={v.doctor_name} onValueChange={(x) => set("doctor_name", x)} /></Field>
            <Field label="Doctor's phone"><TextInput value={v.doctor_phone} onValueChange={(x) => set("doctor_phone", x)} /></Field>
            <Field label="Insurance"><TextInput value={v.insurance} onValueChange={(x) => set("insurance", x)} /></Field>
            <Field label="Notes" className="sm:col-span-3"><Textarea value={v.notes} onValueChange={(x) => set("notes", x)} rows={2} /></Field>
          </FormGrid>
        </FormSection>
      </form>
    </Modal>
  );
}

/* ── Infirmary ─────────────────────────────────────────────────────── */

function InfirmaryTab({ canRecord, onNew }: { canRecord: boolean; onNew: () => void }) {
  const { term } = useInstitution();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ when: ["today"] });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const path = `/wellbeing/infirmary${qs({ q, page, size, day: filters.when?.[0] === "today" ? todayISO() : null, sent_home: filters.home?.[0] === "yes" ? true : null })}`;
  const list = usePaged<Visit>(path);
  const [viewing, setViewing] = useState<Visit | null>(null);
  const [editing, setEditing] = useState<Visit | null>(null);
  const [editKey, setEditKey] = useState(0);

  const columns: Column<Visit>[] = [
    { key: "who", header: term("student"), cell: (r) => <StudentCell row={{ ...r, student_name: r.student_name ?? "" }} /> },
    { key: "complaint", header: "Complaint", cell: (r) => <span className="text-ink/90">{r.complaint}</span> },
    { key: "when", header: "When", hideBelow: "sm", cell: (r) => <span className="text-muted">{formatDateTime(r.visit_at)}</span> },
    { key: "care", header: "Treatment", hideBelow: "lg", cell: (r) => <span className="text-muted">{[r.treatment, r.medicine_given].filter(Boolean).join(" · ") || "—"}</span> },
    { key: "status", header: "Outcome", cell: (r) => (
      <div className="flex flex-wrap gap-1.5">
        {r.sent_home ? <Badge tone="warn" dot>Sent home</Badge> : <Badge tone="good" dot>Back to class</Badge>}
        {r.parent_informed && <Badge tone="info">{term("guardian")} told</Badge>}
      </div>) },
  ];
  return (
    <>
      <FilterBar searchPlaceholder="Search name or complaint" onSearchChange={(x) => { setQ(x); setPage(1); }}
        filters={[
          { key: "when", label: "When", options: [{ value: "today", label: "Today" }] },
          { key: "home", label: "Outcome", options: [{ value: "yes", label: "Sent home" }] },
        ]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={list.rows} rowKey={(r) => r.uuid} columns={columns} loading={list.loading} onRowClick={setViewing}
        rowActions={(r) => [{ label: "View", icon: Eye, onSelect: () => setViewing(r) },
          ...(canRecord ? [{ label: "Edit", icon: Pencil, onSelect: () => { setEditKey((k) => k + 1); setEditing(r); } }] : [])]}
        pagination={{ page, size, total: list.total, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={Stethoscope} emptyTitle={filters.when?.length ? "No visits today" : "No infirmary visits yet"}
        emptyHint="When someone comes to the infirmary, log the visit here."
        emptyAction={canRecord && <Button variant="primary" icon={Plus} onClick={onNew}>Log visit</Button>} />
      <Modal open={!!viewing} onClose={() => setViewing(null)} size="md" title={viewing?.complaint} description={viewing ? `${viewing.student_name} · ${formatDateTime(viewing.visit_at)}` : undefined}
        headerActions={viewing && canRecord && <Button size="sm" icon={Pencil} onClick={() => { setEditKey((k) => k + 1); setEditing(viewing); setViewing(null); }}>Edit</Button>}>
        {viewing && (
          <>
            {viewing.allergies && <p className="mb-5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-2.5 text-[13.5px] text-rose-800"><AlertTriangle size={16} strokeWidth={STROKE} />Allergies: {viewing.allergies}</p>}
            <KeyValue items={[
              { label: "Temperature", value: viewing.temperature ? `${viewing.temperature} °C` : null },
              { label: "Attended by", value: viewing.attended_by },
              { label: "Treatment", value: viewing.treatment, span: 2 },
              { label: "Medicine given", value: viewing.medicine_given },
              { label: "Outcome", value: viewing.sent_home ? "Sent home" : "Back to class" },
              { label: `${term("guardian")} informed`, value: viewing.parent_informed ? "Yes" : "No" },
              { label: "Follow-up", value: viewing.follow_up, span: 2 },
            ]} />
          </>
        )}
      </Modal>
      {editing && <VisitFormModal key={editKey} open visit={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.refresh(); }} />}
    </>
  );
}

function VisitFormModal({ open, visit, onClose, onSaved }: { open: boolean; visit: Visit | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const initial = {
    student: visit?.student_id ?? null as number | null, complaint: visit?.complaint ?? "", temperature: visit?.temperature ?? null,
    treatment: visit?.treatment ?? "", medicine: visit?.medicine_given ?? "", sent_home: visit?.sent_home ?? false,
    parent_informed: visit?.parent_informed ?? false, follow_up: visit?.follow_up ?? "",
  };
  const [v, setV] = useState(initial);
  const [error, setError] = useState<{ student?: string; complaint?: string }>({});
  const [saving, setSaving] = useState(false);
  const health = useGet<HealthDetail>(!visit && v.student ? `/wellbeing/health/${v.student}` : null);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = { student: !v.student ? `Pick the ${term("student").toLowerCase()}` : undefined, complaint: !v.complaint.trim() ? "Say what the problem is" : undefined };
    if (errs.student || errs.complaint) { setError(errs); return; }
    setSaving(true);
    const body = { complaint: v.complaint.trim(), temperature: v.temperature, treatment: v.treatment.trim() || null, medicine_given: v.medicine.trim() || null,
      sent_home: v.sent_home, parent_informed: v.parent_informed || v.sent_home, follow_up: v.follow_up.trim() || null };
    try {
      if (visit) await api.put(`/wellbeing/infirmary/${visit.uuid}`, body);
      else await api.post("/wellbeing/infirmary", { ...body, student_id: v.student });
      toast.success(visit ? "Visit updated" : "Visit logged", { description: body.parent_informed && !visit?.parent_informed ? `The ${term("guardians").toLowerCase()} have been told.` : undefined });
      onSaved();
    } catch (err) { toast.error("Couldn't save the visit", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  const allergies = visit?.allergies ?? health.data?.allergies;
  return (
    <Modal open={open} onClose={onClose} size="md" dirty={dirty} busy={saving} title={visit ? "Edit infirmary visit" : "Log infirmary visit"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="visit-form" loading={saving}>{visit ? "Save changes" : "Log visit"}</Button></>}>
      <form id="visit-form" onSubmit={submit} noValidate>
        <FormGrid>
          {visit ? (
            <Field label={term("student")} className="sm:col-span-2"><p className="text-[14px] text-ink">{visit.student_name}</p></Field>
          ) : (
            <Field label={term("student")} required error={error.student} className="sm:col-span-2">
              <Select value={v.student} onChange={(x) => { setV({ ...v, student: x }); setError({ ...error, student: undefined }); }} loadOptions={searchStudents} placeholder="Search by name or admission no." />
            </Field>
          )}
          {allergies && (
            <p className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-2.5 text-[13.5px] text-rose-800 sm:col-span-2">
              <AlertTriangle size={16} strokeWidth={STROKE} /> Allergies: {allergies}
            </p>
          )}
          <Field label="Complaint" required error={error.complaint} className="sm:col-span-2">
            <TextInput value={v.complaint} onValueChange={(x) => { setV({ ...v, complaint: x }); setError({ ...error, complaint: undefined }); }} placeholder="e.g. Headache, fever" />
          </Field>
          <Field label="Temperature" aside="Optional"><NumberInput value={v.temperature} onChange={(x) => setV({ ...v, temperature: x })} min={30} max={45} step={0.1} suffix="°C" /></Field>
          <Field label="Medicine given" aside="Optional"><TextInput value={v.medicine} onValueChange={(x) => setV({ ...v, medicine: x })} placeholder="e.g. Paracetamol 250 mg" /></Field>
          <Field label="Treatment" className="sm:col-span-2"><Textarea value={v.treatment} onValueChange={(x) => setV({ ...v, treatment: x })} rows={2} /></Field>
          <div className="space-y-3 sm:col-span-2">
            <Toggle checked={v.sent_home} onChange={(x) => setV({ ...v, sent_home: x })} label="Sent home" description={`The ${term("guardians").toLowerCase()} are told to collect.`} />
            <Toggle checked={v.parent_informed || v.sent_home} disabled={v.sent_home} onChange={(x) => setV({ ...v, parent_informed: x })} label={`Tell the ${term("guardians").toLowerCase()}`} description="Sends a note to their portal." />
          </div>
          <Field label="Follow-up" aside="Optional" className="sm:col-span-2"><Textarea value={v.follow_up} onValueChange={(x) => setV({ ...v, follow_up: x })} rows={2} /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Check-up camps ────────────────────────────────────────────────── */

const CAMP_KINDS = [{ value: "general", label: "General" }, { value: "dental", label: "Dental" }, { value: "eye", label: "Eye" }, { value: "other", label: "Other" }];

function CampsTab({ canManage }: { canManage: boolean }) {
  const toast = useToast();
  const list = usePaged<Camp>("/wellbeing/camps?all=true");
  const camps = useMemo(() => [...list.rows].sort((a, b) => b.held_on.localeCompare(a.held_on)), [list.rows]);
  const [form, setForm] = useState<Camp | "new" | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [viewing, setViewing] = useState<Camp | null>(null);
  const columns: Column<Camp>[] = [
    { key: "name", header: "Camp", cell: (c) => <div><p className="text-ink">{c.name}</p><p className="text-[12.5px] text-muted">{[c.doctor, c.agency].filter(Boolean).join(" · ")}</p></div> },
    { key: "kind", header: "Kind", hideBelow: "sm", cell: (c) => <Badge>{CAMP_KINDS.find((k) => k.value === c.kind)?.label ?? c.kind}</Badge> },
    { key: "date", header: "Held on", cell: (c) => formatDate(c.held_on) },
    { key: "checked", header: "Checked", align: "right", cell: (c) => <span className="tabular text-muted">{c.checked}</span> },
  ];
  async function remove(c: Camp) {
    try { await api.delete(`/wellbeing/camps/${c.uuid}`); toast.success("Camp switched off"); list.refresh(); }
    catch (err) { toast.error("Couldn't remove the camp", { description: errMsg(err) }); }
  }
  return (
    <>
      <FilterBar actions={canManage && <Button variant="primary" icon={Plus} onClick={() => { setFormKey((k) => k + 1); setForm("new"); }}>New camp</Button>} />
      <DataTable rows={camps.filter((c) => c.active)} rowKey={(c) => c.uuid} columns={columns} loading={list.loading} onRowClick={setViewing}
        rowActions={(c) => [{ label: "Open", icon: Eye, onSelect: () => setViewing(c) },
          ...(canManage ? [{ label: "Edit", icon: Pencil, onSelect: () => { setFormKey((k) => k + 1); setForm(c); } }, "separator" as const,
            { label: "Remove", icon: Trash2, danger: true, onSelect: () => remove(c) }] : [])]}
        emptyIcon={Activity} emptyTitle="No check-up camps yet" emptyHint="Plan a health, dental or eye check-up and record each learner's results."
        emptyAction={canManage && <Button variant="primary" icon={Plus} onClick={() => { setFormKey((k) => k + 1); setForm("new"); }}>New camp</Button>} />
      {form && <CampFormModal key={formKey} camp={form === "new" ? null : form} onClose={() => setForm(null)} onSaved={() => { setForm(null); list.refresh(); }} />}
      {viewing && <CampDetailModal camp={viewing} canManage={canManage} onClose={() => { setViewing(null); list.refresh(); }} />}
    </>
  );
}

function CampFormModal({ camp, onClose, onSaved }: { camp: Camp | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const initial = { name: camp?.name ?? "", kind: camp?.kind ?? "general", held_on: camp?.held_on ?? todayISO(), doctor: camp?.doctor ?? "", agency: camp?.agency ?? "", notes: camp?.notes ?? "" };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError("Give the camp a name"); return; }
    setSaving(true);
    const body = { ...v, name: v.name.trim(), doctor: v.doctor || null, agency: v.agency || null, notes: v.notes || null };
    try {
      if (camp) await api.put(`/wellbeing/camps/${camp.uuid}`, body); else await api.post("/wellbeing/camps", body);
      toast.success(camp ? "Camp updated" : "Camp added");
      onSaved();
    } catch (err) { toast.error("Couldn't save the camp", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" dirty={JSON.stringify(v) !== JSON.stringify(initial)} busy={saving} title={camp ? "Edit camp" : "New check-up camp"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="camp-form" loading={saving}>{camp ? "Save changes" : "Add camp"}</Button></>}>
      <form id="camp-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Name" required error={error} className="sm:col-span-2"><TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} placeholder="e.g. Annual health check-up" /></Field>
          <Field label="Kind"><Select value={v.kind} onChange={(x) => setV({ ...v, kind: x ?? "general" })} options={CAMP_KINDS} /></Field>
          <Field label="Held on"><DateInput value={v.held_on} onChange={(x) => setV({ ...v, held_on: x })} /></Field>
          <Field label="Doctor"><TextInput value={v.doctor} onValueChange={(x) => setV({ ...v, doctor: x })} /></Field>
          <Field label="Clinic or agency"><TextInput value={v.agency} onValueChange={(x) => setV({ ...v, agency: x })} /></Field>
          <Field label="Notes" className="sm:col-span-2"><Textarea value={v.notes} onValueChange={(x) => setV({ ...v, notes: x })} rows={2} /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

function CampDetailModal({ camp, canManage, onClose }: { camp: Camp; canManage: boolean; onClose: () => void }) {
  const { term } = useInstitution();
  const [page, setPage] = useState(1);
  const list = usePaged<Checkup>(`/wellbeing/checkups${qs({ camp_uuid: camp.uuid, page, size: 25 })}`);
  const [adding, setAdding] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const columns: Column<Checkup>[] = [
    { key: "who", header: term("student"), cell: (c) => <StudentCell row={{ ...c, student_name: c.student_name ?? "" }} /> },
    { key: "hw", header: "Height / weight", hideBelow: "sm", cell: (c) => c.height_cm ? `${c.height_cm} cm · ${c.weight_kg ?? "—"} kg` : "—" },
    { key: "bmi", header: "BMI", cell: (c) => c.bmi ?? "—" },
    { key: "rec", header: "Advice", hideBelow: "md", cell: (c) => <span className="text-muted">{c.recommendations || c.findings || "—"}</span> },
  ];
  return (
    <Modal open onClose={onClose} size="xl" title={camp.name} description={`${formatDate(camp.held_on)}${camp.doctor ? ` · ${camp.doctor}` : ""}`}
      headerActions={canManage && <Button size="sm" variant="primary" icon={Plus} onClick={() => { setAddKey((k) => k + 1); setAdding(true); }}>Add result</Button>}>
      <DataTable rows={list.rows} rowKey={(c) => c.uuid} columns={columns} loading={list.loading}
        pagination={{ page, size: 25, total: list.total, onPageChange: setPage }}
        emptyIcon={Activity} emptyTitle="No results yet" emptyHint={`Add each ${term("student").toLowerCase()}'s measurements as they are checked.`} />
      {adding && <CheckupFormModal key={addKey} camp={camp} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); list.refresh(); }} />}
    </Modal>
  );
}

function CheckupFormModal({ camp, onClose, onSaved }: { camp: Camp; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [v, setV] = useState({ student: null as number | null, height: null as number | null, weight: null as number | null, vl: "", vr: "", dental: "", bp: "", pulse: null as number | null, findings: "", rec: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [studentOpt, setStudentOpt] = useState<SelectOption<number> | null>(null);
  useEffect(() => { if (!v.student) setStudentOpt(null); }, [v.student]);
  async function submit(e: React.FormEvent, again = false) {
    e.preventDefault();
    if (!v.student) { setError(`Pick the ${term("student").toLowerCase()}`); return; }
    setSaving(true);
    try {
      await api.post("/wellbeing/checkups", {
        student_id: v.student, camp_uuid: camp.uuid, height_cm: v.height, weight_kg: v.weight, vision_left: v.vl || null, vision_right: v.vr || null,
        dental: v.dental || null, blood_pressure: v.bp || null, pulse: v.pulse, findings: v.findings || null, recommendations: v.rec || null, examined_by: camp.doctor,
      });
      toast.success(`Saved for ${studentOpt?.label ?? term("student").toLowerCase()}`);
      if (again) setV({ student: null, height: null, weight: null, vl: "", vr: "", dental: "", bp: "", pulse: null, findings: "", rec: "" });
      else onSaved();
    } catch (err) { toast.error("Couldn't save the result", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="lg" busy={saving} title="Add check-up result" description={camp.name} zIndex={70}
      footer={<><ModalCancel /><Button type="button" loading={saving} onClick={(e) => submit(e as unknown as React.FormEvent, true)}>Save and add another</Button>
        <Button variant="primary" type="submit" form="checkup-form" loading={saving}>Save</Button></>}>
      <form id="checkup-form" onSubmit={submit} noValidate>
        <FormGrid columns={3}>
          <Field label={term("student")} required error={error} className="sm:col-span-3">
            <Select value={v.student} onChange={(x, o) => { setV({ ...v, student: x }); setStudentOpt(o); setError(""); }} loadOptions={searchStudents} placeholder="Search by name" />
          </Field>
          <Field label="Height"><NumberInput value={v.height} onChange={(x) => setV({ ...v, height: x })} suffix="cm" step={0.5} /></Field>
          <Field label="Weight"><NumberInput value={v.weight} onChange={(x) => setV({ ...v, weight: x })} suffix="kg" step={0.5} /></Field>
          <Field label="Pulse"><NumberInput value={v.pulse} onChange={(x) => setV({ ...v, pulse: x })} suffix="/min" /></Field>
          <Field label="Vision left"><TextInput value={v.vl} onValueChange={(x) => setV({ ...v, vl: x })} placeholder="6/6" /></Field>
          <Field label="Vision right"><TextInput value={v.vr} onValueChange={(x) => setV({ ...v, vr: x })} placeholder="6/6" /></Field>
          <Field label="Blood pressure"><TextInput value={v.bp} onValueChange={(x) => setV({ ...v, bp: x })} placeholder="110/70" /></Field>
          <Field label="Dental" className="sm:col-span-3"><TextInput value={v.dental} onValueChange={(x) => setV({ ...v, dental: x })} /></Field>
          <Field label="Findings" className="sm:col-span-3"><Textarea value={v.findings} onValueChange={(x) => setV({ ...v, findings: x })} rows={2} /></Field>
          <Field label="Advice" className="sm:col-span-3"><Textarea value={v.rec} onValueChange={(x) => setV({ ...v, rec: x })} rows={2} placeholder="e.g. Eye test recommended" /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}
