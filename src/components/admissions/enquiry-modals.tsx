"use client";

/*
 * Enquiry modals: add / edit form, the detail view (pipeline stage, follow-up, activity log,
 * assignment, start an application) and the small stage-change dialog used by the board.
 */
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, FilePlus2, Mail, MessageSquare, Pencil, Phone, Archive, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import {
  Avatar, Button, DateInput, Field, FormGrid, FormSection, KeyValue, MasterSelect, Modal, ModalCancel, RadioCards, Section,
  Select, Tabs, TextInput, Textarea, TimeInput, useConfirm,
} from "@/components/ui-kit";
import {
  ActivityTimeline, GENDERS, RELATIONS, STAGE_LABEL, StageBadge, StatusBadge, searchStaff, splitIso, toIso, useAdmissionsMeta,
  useOfferings, type Enquiry,
} from "./shared";

type Draft = {
  child_first_name: string; child_last_name: string; child_dob: string; child_gender: string | null; current_institution: string;
  parent_name: string; parent_relation: string | null; phone: string; email: string; city: string; address: string;
  source_id: number | null; source_detail: string; session_id: number | null; program_id: number | null;
  next_follow_up: string; counsellor_id: number | null; notes: string;
};

export function EnquiryFormModal({ target, open, onClose, onSaved }: {
  target: Enquiry | "new"; open: boolean; onClose: () => void; onSaved: (e: Enquiry) => void;
}) {
  const toast = useToast();
  const { term } = useInstitution();
  const meta = useAdmissionsMeta();
  const editing = target !== "new" ? target : null;
  const initial: Draft = {
    child_first_name: editing?.child_first_name ?? "", child_last_name: editing?.child_last_name ?? "",
    child_dob: editing?.child_dob ?? "", child_gender: editing?.child_gender ?? null,
    current_institution: editing?.current_institution ?? "", parent_name: editing?.parent_name ?? "",
    parent_relation: editing?.parent_relation ?? "father", phone: editing?.phone ?? "", email: editing?.email ?? "",
    city: editing?.city ?? "", address: editing?.address ?? "", source_id: editing?.source_id ?? null,
    source_detail: editing?.source_detail ?? "", session_id: editing?.session_id ?? null, program_id: editing?.program_id ?? null,
    next_follow_up: editing?.next_follow_up ?? "", counsellor_id: editing?.counsellor_id ?? null, notes: editing?.notes ?? "",
  };
  const [v, setV] = useState<Draft>(initial);
  const session = v.session_id ?? meta?.default_session_id ?? null;
  const offerings = useOfferings(session);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const set = <K extends keyof Draft>(k: K, x: Draft[K]) => { setV((p) => ({ ...p, [k]: x })); setErrors((e) => ({ ...e, [k]: "" })); };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!v.child_first_name.trim()) errs.child_first_name = "Enter the first name";
    if (!v.phone.trim() && !v.email.trim()) errs.phone = "Add a phone number or an email";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const body = {
        ...v, session_id: session, child_dob: v.child_dob || null, next_follow_up: v.next_follow_up || null,
        email: v.email.trim() || null, phone: v.phone.trim() || null,
      };
      const saved = editing ? await api.put<Enquiry>(`/admissions/enquiries/${editing.uuid}`, body)
        : await api.post<Enquiry>("/admissions/enquiries", body);
      toast.success(editing ? "Enquiry updated" : "Enquiry added");
      onSaved(saved);
    } catch (err) {
      toast.error("Couldn't save the enquiry", { description: err instanceof Error ? err.message : undefined });
    } finally { setSaving(false); }
  }

  const programOptions = (offerings ?? []).filter((o) => o.active).map((o) => ({ value: o.program_id, label: o.program_name ?? "", description: `${o.available} of ${o.seats} seats open` }));
  if (v.program_id && editing?.program_name && !programOptions.some((p) => p.value === v.program_id)) programOptions.push({ value: v.program_id, label: editing.program_name, description: "" });

  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving}
      title={editing ? `Edit enquiry ${editing.number ?? ""}` : "New enquiry"}
      description={editing ? undefined : "A family asking about admission: who, for what and how to reach them."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="enquiry-form" loading={saving}>{editing ? "Save changes" : "Add enquiry"}</Button></>}>
      <form id="enquiry-form" onSubmit={submit} noValidate>
        <FormSection title={term("student")}>
          <FormGrid>
            <Field label="First name" required error={errors.child_first_name}>
              <TextInput autoFocusInModal value={v.child_first_name} onValueChange={(x) => set("child_first_name", x)} />
            </Field>
            <Field label="Last name"><TextInput value={v.child_last_name} onValueChange={(x) => set("child_last_name", x)} /></Field>
            <Field label="Date of birth"><DateInput value={v.child_dob} onChange={(x) => set("child_dob", x)} clearable /></Field>
            <Field label="Gender"><Select value={v.child_gender} onChange={(x) => set("child_gender", x)} options={GENDERS} clearable /></Field>
            <Field label={`${term("program")} applying for`}>
              <Select value={v.program_id} onChange={(x) => set("program_id", x)} options={programOptions} clearable
                placeholder={programOptions.length ? "Pick one" : "Open programs in Admission settings"} />
            </Field>
            <Field label={term("session")}>
              <Select value={session} onChange={(x) => set("session_id", x)} options={(meta?.sessions ?? []).map((s) => ({ value: s.id, label: s.name }))} />
            </Field>
            <Field label="Current school or playgroup" className="sm:col-span-2">
              <TextInput value={v.current_institution} onValueChange={(x) => set("current_institution", x)} />
            </Field>
          </FormGrid>
        </FormSection>
        <FormSection title={term("guardian")}>
          <FormGrid>
            <Field label="Name"><TextInput value={v.parent_name} onValueChange={(x) => set("parent_name", x)} /></Field>
            <Field label="Relation"><Select value={v.parent_relation} onChange={(x) => set("parent_relation", x)} options={RELATIONS} clearable /></Field>
            <Field label="Phone" error={errors.phone}><TextInput type="tel" value={v.phone} onValueChange={(x) => set("phone", x)} placeholder="+91 98450 12345" /></Field>
            <Field label="Email"><TextInput type="email" value={v.email} onValueChange={(x) => set("email", x)} /></Field>
            <Field label="City"><TextInput value={v.city} onValueChange={(x) => set("city", x)} /></Field>
            <Field label="Address"><TextInput value={v.address} onValueChange={(x) => set("address", x)} /></Field>
          </FormGrid>
        </FormSection>
        <FormSection title="Follow-up">
          <FormGrid>
            <Field label="Source"><MasterSelect type="enquiry_source" value={v.source_id} onChange={(x) => set("source_id", x)} clearable /></Field>
            <Field label="Source detail" aside="Optional" hint="Campaign name, who referred them …">
              <TextInput value={v.source_detail} onValueChange={(x) => set("source_detail", x)} />
            </Field>
            <Field label="Counsellor">
              <Select value={v.counsellor_id} onChange={(x) => set("counsellor_id", x)} loadOptions={searchStaff} clearable placeholder="Search staff"
                selectedOption={editing?.counsellor_id ? { value: editing.counsellor_id, label: editing.counsellor_name || "Current" } : null} />
            </Field>
            <Field label="Next follow-up"><DateInput value={v.next_follow_up} onChange={(x) => set("next_follow_up", x)} clearable /></Field>
            <Field label="Notes" className="sm:col-span-2"><Textarea value={v.notes} onValueChange={(x) => set("notes", x)} rows={3} /></Field>
          </FormGrid>
        </FormSection>
      </form>
    </Modal>
  );
}

/* ── Stage change ─────────────────────────────────────────────────────── */

export function StageModal({ enquiry, to, open, onClose, onSaved }: {
  enquiry: Enquiry | null; to: string | null; open: boolean; onClose: () => void; onSaved: (e: Enquiry) => void;
}) {
  const toast = useToast();
  const [stage, setStage] = useState(to ?? "contacted");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<string | null>(null);
  const visit0 = splitIso(enquiry?.visit_at);
  const [visitDay, setVisitDay] = useState(visit0.day);
  const [visitTime, setVisitTime] = useState(visit0.time);
  const [follow, setFollow] = useState(enquiry?.next_follow_up ?? "");
  const [saving, setSaving] = useState(false);
  const reasons = useMasterReasons();
  const choices = ["new", "contacted", "visit_scheduled", "lost"].filter((s) => s !== enquiry?.stage);

  async function save() {
    if (!enquiry) return;
    setSaving(true);
    try {
      const out = await api.post<Enquiry>(`/admissions/enquiries/${enquiry.uuid}/stage`, {
        stage, note: note || null, lost_reason: stage === "lost" ? reason : null,
        visit_at: stage === "visit_scheduled" ? toIso(visitDay, visitTime) : null, next_follow_up: follow || null,
      });
      toast.success(`Moved to ${STAGE_LABEL[stage]}`);
      onSaved(out);
    } catch (err) {
      toast.error("Couldn't move the enquiry", { description: err instanceof Error ? err.message : undefined });
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open && !!enquiry} onClose={onClose} size="md" busy={saving} title={`Move ${enquiry?.child_name ?? ""}`}
      description={enquiry ? <>Now <StageBadge stage={enquiry.stage} /></> : undefined}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving} icon={ArrowRight}>Move</Button></>}>
      <div className="space-y-5">
        {!to && (
          <Field label="Move to">
            <RadioCards value={stage} onChange={setStage} columns={2} options={choices.map((s) => ({ value: s, label: STAGE_LABEL[s] }))} />
          </Field>
        )}
        {stage === "visit_scheduled" && (
          <FormGrid>
            <Field label="Visit date" required><DateInput value={visitDay} onChange={setVisitDay} /></Field>
            <Field label="Time"><TimeInput value={visitTime} onChange={setVisitTime} /></Field>
          </FormGrid>
        )}
        {stage === "lost" && (
          <Field label="Why was it lost?" required>
            <Select value={reason} onChange={setReason} options={reasons} placeholder="Pick a reason"
              onCreate={async (t) => ({ value: t, label: t })} />
          </Field>
        )}
        {stage !== "lost" && <Field label="Next follow-up"><DateInput value={follow} onChange={setFollow} clearable /></Field>}
        <Field label="Note" aside="Optional"><Textarea value={note} onValueChange={setNote} rows={2} /></Field>
      </div>
    </Modal>
  );
}

function useMasterReasons() {
  const [opts, setOpts] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    api.get<{ items: { label: string }[] }>("/masters/options/enquiry_lost_reason")
      .then((r) => setOpts((r.items ?? []).map((i) => ({ value: i.label, label: i.label })))).catch(() => {});
  }, []);
  return opts;
}

/* ── Details ─────────────────────────────────────────────────────────── */

const ACTIVITY_KINDS = [
  { value: "call", label: "Call", icon: Phone }, { value: "email", label: "Email", icon: Mail },
  { value: "meeting", label: "Meeting", icon: UserRound }, { value: "note", label: "Note", icon: MessageSquare },
];

export function EnquiryDetailModal({ uuid, open, onClose, onChanged, onEdit, onOpenApplication }: {
  uuid: string | null; open: boolean; onClose: () => void; onChanged: () => void; onEdit: (e: Enquiry) => void;
  onOpenApplication: (uuid: string) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const canManage = useAccess().can("admissions.manage");
  const [data, setData] = useState<Enquiry | null>(null);
  const [tab, setTab] = useState<"activity" | "details">("activity");
  const [nonce, setNonce] = useState(0);
  const [stageOpen, setStageOpen] = useState(false);
  const [kind, setKind] = useState("call");
  const [body, setBody] = useState("");
  const [follow, setFollow] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!uuid || !open) return;
    let live = true;
    api.get<Enquiry>(`/admissions/enquiries/${uuid}`).then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) toast.error("Couldn't open the enquiry", { description: e.message }); });
    return () => { live = false; };
  }, [uuid, open, nonce, toast]);
  const e = data && data.uuid === uuid ? data : null;
  const reload = () => { setNonce((n) => n + 1); onChanged(); };

  async function addActivity() {
    if (!e || !body.trim()) return;
    setBusy(true);
    try {
      await api.post(`/admissions/enquiries/${e.uuid}/activities`, { kind, body, next_follow_up: follow || null });
      setBody(""); setFollow("");
      reload();
    } catch (err) {
      toast.error("Couldn't save", { description: err instanceof Error ? err.message : undefined });
    } finally { setBusy(false); }
  }

  async function startApplication() {
    if (!e) return;
    setBusy(true);
    try {
      const a = await api.post<{ uuid: string }>(`/admissions/enquiries/${e.uuid}/application`);
      toast.success("Application started");
      reload();
      onOpenApplication(a.uuid);
    } catch (err) {
      toast.error("Couldn't start an application", { description: err instanceof Error ? err.message : undefined });
    } finally { setBusy(false); }
  }

  async function archive() {
    if (!e) return;
    if (!(await confirm({ title: "Archive this enquiry?", message: "It leaves the pipeline. You can restore it from the archived list.", confirmLabel: "Archive", tone: "danger" }))) return;
    await api.delete(`/admissions/enquiries/${e.uuid}`);
    toast.success("Enquiry archived");
    onChanged();
    onClose();
  }

  async function assign(id: number | null) {
    if (!e) return;
    try { await api.post(`/admissions/enquiries/${e.uuid}/assign`, { counsellor_id: id }); toast.success("Counsellor updated"); reload(); }
    catch (err) { toast.error("Couldn't assign", { description: err instanceof Error ? err.message : undefined }); }
  }

  const closed = e?.stage === "converted";
  const overdue = useMemo(() => !!e?.next_follow_up && e.next_follow_up < new Date().toISOString().slice(0, 10), [e]);

  return (
    <>
      <Modal open={open && !!uuid} onClose={onClose} size="lg"
        title={e ? e.child_name : "Enquiry"}
        description={e ? <span className="flex flex-wrap items-center gap-2"><StageBadge stage={e.stage} /><span className="text-faint">{e.number}</span>{e.program_name && <span>· {e.program_name}</span>}</span> : undefined}
        leading={e && <Avatar name={e.child_name} size={44} />}
        headerActions={e && canManage && !e.archived && <Button size="sm" icon={Pencil} onClick={() => onEdit(e)}>Edit</Button>}
        footerStart={e && canManage && !e.archived && !closed && <Button variant="ghost" icon={Archive} onClick={archive}>Archive</Button>}
        footer={e && canManage && !e.archived && !closed && <>
          {!e.application_id && e.stage !== "lost" && <Button icon={FilePlus2} onClick={startApplication} loading={busy}>Start application</Button>}
          {e.stage !== "applied" && <Button variant="primary" icon={ArrowRight} onClick={() => setStageOpen(true)}>Change stage</Button>}
        </>}>
        {!e ? <div className="h-40 animate-pulse rounded-xl bg-sunken" /> : (
          <>
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <InfoTile label="Contact" value={<span className="block truncate">{e.parent_name || "—"}</span>} hint={[e.phone, e.email].filter(Boolean).join(" · ")} />
              <InfoTile label="Next follow-up" value={e.next_follow_up ? formatDate(e.next_follow_up) : "Not set"} hint={overdue ? "Overdue" : e.visit_at ? `Visit ${formatDateTime(e.visit_at)}` : undefined} warn={overdue} />
              <div className="rounded-xl border border-line p-3">
                <p className="text-[12px] text-faint">Counsellor</p>
                {canManage && !closed ? (
                  <Select value={e.counsellor_id} onChange={(x) => assign(x)} loadOptions={searchStaff} clearable placeholder="Assign"
                    selectedOption={e.counsellor_id ? { value: e.counsellor_id, label: e.counsellor_name || "" } : null} className="mt-1" />
                ) : <p className="mt-1 text-[14px] text-ink">{e.counsellor_name || "Not assigned"}</p>}
              </div>
            </div>
            {e.application && (
              <button type="button" onClick={() => onOpenApplication(e.application!.uuid)}
                className="mb-5 flex w-full items-center justify-between rounded-xl border border-line px-4 py-3 text-left transition-colors hover:bg-sunken/60">
                <span><span className="block text-[14px] text-ink">Application {e.application.application_no}</span>
                  <span className="text-[12.5px] text-muted">{e.application.program_name}</span></span>
                <StatusBadge status={e.application.status} />
              </button>
            )}
            <Tabs value={tab} onChange={setTab} items={[{ value: "activity", label: "Activity", count: e.activities?.length }, { value: "details", label: "Details" }]} />
            <div className="pt-5">
              {tab === "activity" ? (
                <>
                  {canManage && !closed && (
                    <div className="mb-6 rounded-xl border border-line p-3">
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {ACTIVITY_KINDS.map((k) => (
                          <button key={k.value} type="button" onClick={() => setKind(k.value)}
                            className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] transition-colors ${kind === k.value ? "border-primary/30 bg-primary-soft/60 text-primary" : "border-line text-muted hover:text-ink"}`}>
                            <k.icon size={13} strokeWidth={1.4} />{k.label}
                          </button>
                        ))}
                      </div>
                      <Textarea value={body} onValueChange={setBody} rows={2} placeholder="What was discussed?" aria-label="Activity" />
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-[12.5px] text-muted"><CalendarClock size={14} strokeWidth={1.4} /> Next follow-up
                          <DateInput value={follow} onChange={setFollow} clearable className="w-40" /></div>
                        <Button size="sm" variant="primary" onClick={addActivity} loading={busy} disabled={!body.trim()}>Save</Button>
                      </div>
                    </div>
                  )}
                  <ActivityTimeline items={e.activities} context="enquiry" />
                </>
              ) : (
                <Section title={term("student")}>
                  <KeyValue columns={3} items={[
                    { label: "Date of birth", value: e.child_dob ? formatDate(e.child_dob) : null },
                    { label: "Gender", value: e.child_gender ? GENDERS.find((g) => g.value === e.child_gender)?.label : null },
                    { label: "Current school", value: e.current_institution },
                    { label: term("session"), value: e.session_name },
                    { label: term("program"), value: e.program_name },
                    { label: "Source", value: e.source_label },
                    { label: "Source detail", value: e.source_detail },
                    { label: "Relation", value: e.parent_relation },
                    { label: "City", value: e.city },
                    { label: "Address", value: e.address, span: 3 },
                    { label: "Notes", value: e.notes, span: 3 },
                    ...(e.lost_reason ? [{ label: "Lost because", value: e.lost_reason, span: 3 as const }] : []),
                    { label: "Added", value: formatDateTime(e.created_at) },
                  ]} />
                </Section>
              )}
            </div>
          </>
        )}
      </Modal>
      <StageModal key={`${e?.uuid}-${stageOpen}`} enquiry={e} to={null} open={stageOpen} onClose={() => setStageOpen(false)}
        onSaved={() => { setStageOpen(false); reload(); }} />
    </>
  );
}

function InfoTile({ label, value, hint, warn }: { label: string; value: React.ReactNode; hint?: string; warn?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-line p-3">
      <p className="text-[12px] text-faint">{label}</p>
      <p className="mt-1 truncate text-[14px] text-ink">{value}</p>
      {hint && <p className={`mt-0.5 truncate text-[12.5px] ${warn ? "text-rose-700" : "text-muted"}`}>{hint}</p>}
    </div>
  );
}
