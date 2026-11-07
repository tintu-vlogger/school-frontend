"use client";

/*
 * Application modals: the office application form (add / edit), the detail view with its
 * actions (status, test and interview, scores, fee, documents, offer, accept, enrol, offer
 * letter) and the small action dialogs.
 */
import { useEffect, useState } from "react";
import {
  BadgeCheck, CalendarClock, Check, ClipboardCheck, FileDown, FileText, GraduationCap, IndianRupee, Pencil, Plus, Send,
  Trash2, Upload, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { CustomFields, useCustomFieldDraft, type CustomFieldEntity } from "@/components/custom-fields";
import { uploadFile, fileHref } from "@/components/workplace/files";
import {
  Avatar, Badge, Button, Checkbox, DateInput, Field, FormGrid, FormSection, IconButton, KeyValue, Modal, ModalCancel,
  NumberInput, Section, Select, Tabs, TextInput, Textarea, TimeInput, Toggle,
} from "@/components/ui-kit";
import {
  ActivityTimeline, GENDERS, PdfModal, RELATIONS, STATUS_LABEL, StatusBadge, money, searchStaff, splitIso, toIso,
  useAdmissionsMeta, useOfferings, useSectionOptions, type Application, type Guardian,
} from "./shared";

const ENTITY = "admission" as CustomFieldEntity;

type Draft = {
  session_id: number | null; program_id: number | null; first_name: string; middle_name: string; last_name: string;
  gender: string | null; date_of_birth: string; blood_group: string; nationality: string; religion: string; category: string;
  mother_tongue: string; national_id: string; previous_institution: string; previous_program: string; previous_marks: string;
  address: string; city: string; state: string; pincode: string; contact_phone: string; contact_email: string; remarks: string;
  guardians: Guardian[];
};

const blankGuardian = (relation = "father", primary = false): Guardian => ({ relation, first_name: "", last_name: "", phone: "", email: "", occupation: "", is_primary: primary });

export function ApplicationFormModal({ target, open, onClose, onSaved, defaults }: {
  target: Application | "new"; open: boolean; onClose: () => void; onSaved: (a: Application) => void;
  defaults?: { session_id?: number | null; program_id?: number | null };
}) {
  const toast = useToast();
  const { term } = useInstitution();
  const meta = useAdmissionsMeta();
  const editing = target !== "new" ? target : null;
  const initial: Draft = {
    session_id: editing?.session_id ?? defaults?.session_id ?? null, program_id: editing?.program_id ?? defaults?.program_id ?? null,
    first_name: editing?.first_name ?? "", middle_name: editing?.middle_name ?? "", last_name: editing?.last_name ?? "",
    gender: editing?.gender ?? null, date_of_birth: editing?.date_of_birth ?? "", blood_group: editing?.blood_group ?? "",
    nationality: editing?.nationality ?? "Indian", religion: editing?.religion ?? "", category: editing?.category ?? "",
    mother_tongue: editing?.mother_tongue ?? "", national_id: "", previous_institution: editing?.previous_institution ?? "",
    previous_program: editing?.previous_program ?? "", previous_marks: editing?.previous_marks ?? "", address: editing?.address ?? "",
    city: editing?.city ?? "", state: editing?.state ?? "", pincode: editing?.pincode ?? "", contact_phone: editing?.contact_phone ?? "",
    contact_email: editing?.contact_email ?? "", remarks: editing?.remarks ?? "",
    guardians: editing?.guardians?.length ? editing.guardians.map((g) => ({ ...g })) : [blankGuardian("father", true), blankGuardian("mother")],
  };
  const [v, setV] = useState<Draft>(initial);
  const session = v.session_id ?? meta?.default_session_id ?? null;
  const offerings = useOfferings(session);
  const cf = useCustomFieldDraft(ENTITY, editing?.custom);
  const [err, setErr] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial) || cf.dirty;
  const set = <K extends keyof Draft>(k: K, x: Draft[K]) => { setV((p) => ({ ...p, [k]: x })); setErr((e) => ({ ...e, [k]: "" })); };
  const setG = (i: number, patch: Partial<Guardian>) => setV((p) => ({
    ...p, guardians: p.guardians.map((g, j) => (j === i ? { ...g, ...patch } : patch.is_primary ? { ...g, is_primary: false } : g)),
  }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!v.first_name.trim()) errs.first_name = "Enter the first name";
    if (!v.program_id) errs.program_id = `Pick the ${term("program").toLowerCase()}`;
    if (Object.keys(errs).length) { setErr(errs); return; }
    if (!cf.check()) return;
    setSaving(true);
    const strip = (s: string) => s.trim() || null;
    const body: Record<string, unknown> = {
      session_id: session, program_id: v.program_id, first_name: v.first_name.trim(), gender: v.gender,
      date_of_birth: v.date_of_birth || null,
      ...Object.fromEntries((["middle_name", "last_name", "blood_group", "nationality", "religion", "category", "mother_tongue",
        "previous_institution", "previous_program", "previous_marks", "address", "city", "state", "pincode", "contact_phone",
        "contact_email", "remarks"] as const).map((k) => [k, strip(v[k])])),
      guardians: v.guardians.filter((g) => g.first_name.trim()).map((g) => ({
        ...g, first_name: g.first_name.trim(), last_name: g.last_name || null, phone: g.phone || null, email: g.email || null,
        occupation: g.occupation || null,
      })),
      custom: cf.values,
    };
    if (v.national_id.trim()) body.national_id = v.national_id.trim();
    try {
      const out = editing ? await api.put<Application>(`/admissions/applications/${editing.uuid}`, body)
        : await api.post<Application>("/admissions/applications", body);
      toast.success(editing ? "Application updated" : `Application ${out.application_no} added`);
      onSaved(out);
    } catch (e2) {
      toast.error("Couldn't save the application", { description: e2 instanceof Error ? e2.message : undefined });
    } finally { setSaving(false); }
  }

  const programOptions = (offerings ?? []).map((o) => ({ value: o.program_id, label: o.program_name ?? "", description: `${o.available} of ${o.seats} seats open` }));
  if (editing && !programOptions.some((p) => p.value === editing.program_id)) programOptions.push({ value: editing.program_id, label: editing.program_name ?? "", description: "" });

  return (
    <Modal open={open} onClose={onClose} size="xl" dirty={dirty} busy={saving}
      title={editing ? `Edit application ${editing.application_no}` : "New application"}
      description={editing ? undefined : "For families applying at the office. Families can also apply online on your website."}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="application-form" loading={saving}>{editing ? "Save changes" : "Add application"}</Button></>}>
      <form id="application-form" onSubmit={submit} noValidate>
        <FormSection title="Applying for">
          <FormGrid>
            <Field label={term("session")}>
              <Select value={session} onChange={(x) => set("session_id", x)} options={(meta?.sessions ?? []).map((s) => ({ value: s.id, label: s.name }))} />
            </Field>
            <Field label={term("program")} required error={err.program_id}>
              <Select value={v.program_id} onChange={(x) => set("program_id", x)} options={programOptions}
                placeholder={programOptions.length ? "Pick one" : "Open programs in Admission settings first"} />
            </Field>
          </FormGrid>
        </FormSection>
        <FormSection title={term("student")}>
          <FormGrid columns={3}>
            <Field label="First name" required error={err.first_name}><TextInput autoFocusInModal value={v.first_name} onValueChange={(x) => set("first_name", x)} /></Field>
            <Field label="Middle name"><TextInput value={v.middle_name} onValueChange={(x) => set("middle_name", x)} /></Field>
            <Field label="Last name"><TextInput value={v.last_name} onValueChange={(x) => set("last_name", x)} /></Field>
            <Field label="Date of birth"><DateInput value={v.date_of_birth} onChange={(x) => set("date_of_birth", x)} clearable /></Field>
            <Field label="Gender"><Select value={v.gender} onChange={(x) => set("gender", x)} options={GENDERS} clearable /></Field>
            <Field label="Blood group"><TextInput value={v.blood_group} onValueChange={(x) => set("blood_group", x)} /></Field>
            <Field label="Nationality"><TextInput value={v.nationality} onValueChange={(x) => set("nationality", x)} /></Field>
            <Field label="Religion"><TextInput value={v.religion} onValueChange={(x) => set("religion", x)} /></Field>
            <Field label="Category"><TextInput value={v.category} onValueChange={(x) => set("category", x)} placeholder="General, OBC, SC …" /></Field>
            <Field label="Mother tongue"><TextInput value={v.mother_tongue} onValueChange={(x) => set("mother_tongue", x)} /></Field>
            <Field label="National ID" hint={editing?.national_id ? `On file: ${editing.national_id}` : "Aadhaar or passport"}>
              <TextInput value={v.national_id} onValueChange={(x) => set("national_id", x)} />
            </Field>
          </FormGrid>
        </FormSection>
        <FormSection title="Previous education">
          <FormGrid columns={3}>
            <Field label="School or college"><TextInput value={v.previous_institution} onValueChange={(x) => set("previous_institution", x)} /></Field>
            <Field label={`Last ${term("program").toLowerCase()} studied`}><TextInput value={v.previous_program} onValueChange={(x) => set("previous_program", x)} /></Field>
            <Field label="Marks or grade"><TextInput value={v.previous_marks} onValueChange={(x) => set("previous_marks", x)} /></Field>
          </FormGrid>
        </FormSection>
        <FormSection title={term("guardians")} description="The primary contact gets messages and the status updates.">
          <div className="space-y-4">
            {v.guardians.map((g, i) => (
              <div key={i} className="rounded-xl border border-line p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <Checkbox checked={!!g.is_primary} onChange={(x) => setG(i, { is_primary: x })} label="Primary contact" />
                  {v.guardians.length > 1 && <IconButton icon={Trash2} label="Remove" onClick={() => setV((p) => ({ ...p, guardians: p.guardians.filter((_, j) => j !== i) }))} />}
                </div>
                <FormGrid columns={3}>
                  <Field label="Relation"><Select value={g.relation} onChange={(x) => setG(i, { relation: x || "guardian" })} options={RELATIONS} /></Field>
                  <Field label="First name"><TextInput value={g.first_name} onValueChange={(x) => setG(i, { first_name: x })} /></Field>
                  <Field label="Last name"><TextInput value={g.last_name ?? ""} onValueChange={(x) => setG(i, { last_name: x })} /></Field>
                  <Field label="Phone"><TextInput type="tel" value={g.phone ?? ""} onValueChange={(x) => setG(i, { phone: x })} /></Field>
                  <Field label="Email"><TextInput type="email" value={g.email ?? ""} onValueChange={(x) => setG(i, { email: x })} /></Field>
                  <Field label="Occupation"><TextInput value={g.occupation ?? ""} onValueChange={(x) => setG(i, { occupation: x })} /></Field>
                </FormGrid>
              </div>
            ))}
            {v.guardians.length < 4 && <Button size="sm" icon={Plus} onClick={() => setV((p) => ({ ...p, guardians: [...p.guardians, blankGuardian("guardian")] }))}>Add another</Button>}
          </div>
        </FormSection>
        <FormSection title="Address and contact">
          <FormGrid columns={3}>
            <Field label="Address" className="sm:col-span-2 lg:col-span-3"><Textarea value={v.address} onValueChange={(x) => set("address", x)} rows={2} /></Field>
            <Field label="City"><TextInput value={v.city} onValueChange={(x) => set("city", x)} /></Field>
            <Field label="State"><TextInput value={v.state} onValueChange={(x) => set("state", x)} /></Field>
            <Field label="PIN code"><TextInput value={v.pincode} onValueChange={(x) => set("pincode", x)} /></Field>
            <Field label="Contact phone" hint="Used for the status check; defaults to the primary contact"><TextInput type="tel" value={v.contact_phone} onValueChange={(x) => set("contact_phone", x)} /></Field>
            <Field label="Contact email"><TextInput type="email" value={v.contact_email} onValueChange={(x) => set("contact_email", x)} /></Field>
            <Field label="Office remarks"><TextInput value={v.remarks} onValueChange={(x) => set("remarks", x)} /></Field>
          </FormGrid>
        </FormSection>
        <CustomFields entity={ENTITY} layout={cf.layout} values={cf.values} onChange={cf.setValues} errors={cf.errors} />
      </form>
    </Modal>
  );
}

/* ── Details ─────────────────────────────────────────────────────────── */

type Action = null | "status" | "schedule" | "scores" | "fee" | "offer" | "enrol" | "letter";

export function ApplicationDetailModal({ uuid, open, onClose, onChanged, onEdit }: {
  uuid: string | null; open: boolean; onClose: () => void; onChanged: () => void; onEdit: (a: Application) => void;
}) {
  const toast = useToast();
  const { term } = useInstitution();
  const { can } = useAccess();
  const canManage = can("admissions.manage");
  const canEnrol = can("admissions.enrol");
  const [data, setData] = useState<Application | null>(null);
  const [nonce, setNonce] = useState(0);
  const [tab, setTab] = useState<"overview" | "documents" | "assessment" | "activity">("overview");
  const [action, setAction] = useState<Action>(null);
  const [note, setNote] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    if (!uuid || !open) return;
    let live = true;
    api.get<Application>(`/admissions/applications/${uuid}`).then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) toast.error("Couldn't open the application", { description: e.message }); });
    return () => { live = false; };
  }, [uuid, open, nonce, toast]);
  const a = data && data.uuid === uuid ? data : null;
  const reload = (next?: Application) => { if (next) setData(next); else setNonce((n) => n + 1); onChanged(); };
  const done = (next: Application, msg: string) => { toast.success(msg); setAction(null); reload(next); };

  async function call(path: string, body: unknown, msg: string, key = path) {
    if (!a) return;
    setBusyKey(key);
    try { done(await api.post<Application>(`/admissions/applications/${a.uuid}${path}`, body), msg); }
    catch (e) { toast.error("That didn't work", { description: e instanceof Error ? e.message : undefined }); }
    finally { setBusyKey(null); }
  }

  async function upload(key: string, file: File) {
    if (!a) return;
    setBusyKey(`doc-${key}`);
    try {
      const ref = await uploadFile(file);
      reload(await api.post<Application>(`/admissions/applications/${a.uuid}/documents/${key}`, { upload_uuid: ref.uuid }));
      toast.success("Uploaded");
    } catch (e) { toast.error("Couldn't upload", { description: e instanceof Error ? e.message : undefined }); }
    finally { setBusyKey(null); }
  }

  const closed = a ? ["enrolled", "rejected", "withdrawn"].includes(a.status) : true;
  const pendingOffer = a?.offer_state === "pending";

  return (
    <>
      <Modal open={open && !!uuid} onClose={onClose} size="xl"
        title={a ? a.name : "Application"}
        description={a ? <span className="flex flex-wrap items-center gap-2"><StatusBadge status={a.status} pending={pendingOffer} /><span className="text-faint">{a.application_no}</span><span>· {a.program_name} · {a.session_name}</span>{a.channel === "online" && <Badge tone="info">Online</Badge>}</span> : undefined}
        leading={a && <Avatar name={a.name} size={44} />}
        headerActions={a && canManage && a.status !== "enrolled" && <Button size="sm" icon={Pencil} onClick={() => onEdit(a)}>Edit</Button>}
        footerStart={a && canManage && !closed && <Button variant="ghost" onClick={() => setAction("status")}>Change status</Button>}
        footer={a && <>
          {["offered", "accepted", "enrolled"].includes(a.status) && <Button icon={FileDown} onClick={() => setAction("letter")}>Offer letter</Button>}
          {canManage && a.can_offer && <Button variant="primary" icon={Send} onClick={() => setAction("offer")}>Make offer</Button>}
          {canManage && a.status === "offered" && <Button icon={Check} loading={busyKey === "/accept"} onClick={() => call("/accept", undefined, "Offer accepted")}>Mark accepted</Button>}
          {canEnrol && ["offered", "accepted"].includes(a.status) && <Button variant="primary" icon={GraduationCap} onClick={() => setAction("enrol")}>Enrol</Button>}
          {a.status === "enrolled" && a.student_uuid && <a href={`/dashboard/students?view=${a.student_uuid}`}><Button variant="primary" icon={GraduationCap}>Open {term("student").toLowerCase()}</Button></a>}
        </>}>
        {!a ? <div className="h-48 animate-pulse rounded-xl bg-sunken" /> : (
          <>
            <div className="mb-5 grid gap-3 sm:grid-cols-4">
              <Tile label="Merit" value={a.merit_rank ? `#${a.merit_rank}` : "—"} hint={a.merit_score ? `Score ${a.merit_score}` : "No scores yet"} />
              <Tile label="Application fee" value={Number(a.fee_amount) > 0 ? money(a.fee_amount) : "None"}
                hint={Number(a.fee_amount) > 0 ? (a.fee_paid ? `Paid${a.fee_paid_on ? ` ${formatDate(a.fee_paid_on)}` : ""}` : "Not paid") : undefined}
                warn={Number(a.fee_amount) > 0 && !a.fee_paid} action={canManage && !closed ? () => setAction("fee") : undefined} />
              <Tile label="Documents" value={`${(a.documents ?? []).filter((d) => d.uuid).length} of ${(a.documents ?? []).length}`}
                hint={(a.documents ?? []).some((d) => d.required && !d.uuid) ? "Required ones missing" : "Uploaded"} warn={(a.documents ?? []).some((d) => d.required && !d.uuid)} action={() => setTab("documents")} />
              <Tile label="Seats" value={a.seats?.has_offering ? `${a.seats.available} open` : "Not set"} hint={a.seats?.has_offering ? `${a.seats.taken} of ${a.seats.seats} taken` : "Open it in settings"} />
            </div>
            {a.status === "offered" && a.offer_expires_on && <Banner tone="accent">Offer valid until {formatDate(a.offer_expires_on)}.{a.offer_note ? ` ${a.offer_note}` : ""}</Banner>}
            {pendingOffer && <Banner tone="warn">The offer is waiting for approval in the approvals inbox.</Banner>}
            {a.decision_reason && ["rejected", "withdrawn"].includes(a.status) && <Banner tone="bad">{STATUS_LABEL[a.status]}: {a.decision_reason}</Banner>}
            {a.status === "enrolled" && <Banner tone="good">Enrolled in {a.section_label}{a.enrolled_at ? ` on ${formatDate(a.enrolled_at)}` : ""}.</Banner>}
            <Tabs value={tab} onChange={setTab} items={[
              { value: "overview", label: "Overview" }, { value: "documents", label: "Documents", count: (a.documents ?? []).length },
              { value: "assessment", label: "Test and interview" }, { value: "activity", label: "Activity", count: a.activities?.length },
            ]} />
            <div className="pt-5">
              {tab === "overview" && (
                <>
                  <Section title={term("student")}>
                    <KeyValue columns={3} items={[
                      { label: "Date of birth", value: a.date_of_birth ? formatDate(a.date_of_birth) : null },
                      { label: "Gender", value: GENDERS.find((g) => g.value === a.gender)?.label },
                      { label: "Blood group", value: a.blood_group }, { label: "Nationality", value: a.nationality },
                      { label: "Religion", value: a.religion }, { label: "Category", value: a.category },
                      { label: "Mother tongue", value: a.mother_tongue }, { label: "National ID", value: a.national_id },
                      { label: "Previous school", value: a.previous_institution },
                      { label: "Last studied", value: [a.previous_program, a.previous_marks].filter(Boolean).join(" · ") },
                      { label: "Address", value: [a.address, a.city, a.state, a.pincode].filter(Boolean).join(", "), span: 2 },
                      { label: "Contact", value: [a.contact_phone, a.contact_email].filter(Boolean).join(" · "), span: 2 },
                      { label: "Received", value: a.submitted_at ? formatDateTime(a.submitted_at) : null },
                      { label: "Remarks", value: a.remarks },
                    ]} />
                  </Section>
                  <Section title={term("guardians")} className="border-t border-line">
                    {(a.guardians ?? []).length === 0 ? <p className="text-[13.5px] text-muted">No details yet. Edit the application to add them.</p> : (
                      <ul className="divide-y divide-line rounded-xl border border-line">
                        {(a.guardians ?? []).map((g, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                            <Avatar name={`${g.first_name} ${g.last_name ?? ""}`} size={30} />
                            <span className="min-w-0 flex-1"><span className="block text-[14px] text-ink">{g.first_name} {g.last_name}</span>
                              <span className="block text-[12.5px] capitalize text-muted">{g.relation}{g.occupation ? ` · ${g.occupation}` : ""}</span></span>
                            <span className="text-[13px] text-muted">{[g.phone, g.email].filter(Boolean).join(" · ")}</span>
                            {g.is_primary && <Badge tone="accent">Primary</Badge>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                  <div className="border-t border-line pt-6 empty:hidden"><CustomFields entity={ENTITY} mode="view" values={a.custom} /></div>
                </>
              )}
              {tab === "documents" && (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {(a.documents ?? []).length === 0 && <li className="px-4 py-6 text-center text-[13.5px] text-muted">No documents are asked for. Set the list in Admission settings.</li>}
                  {(a.documents ?? []).map((d) => (
                    <li key={d.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <FileText size={18} strokeWidth={1.4} className="text-faint" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] text-ink">{d.label}{d.required && <span className="ml-1.5 text-[12px] text-faint">required</span>}</span>
                        {d.uuid ? <a href={fileHref(d.url)} target="_blank" rel="noreferrer" className="text-[12.5px] text-primary hover:underline">{d.name}</a>
                          : <span className="text-[12.5px] text-muted">Not uploaded</span>}
                      </span>
                      {d.uuid && (d.verified ? <Badge tone="good" dot>Verified</Badge> : <Badge tone="warn" dot>Not verified</Badge>)}
                      {canManage && d.uuid && !closed && (
                        <Button size="sm" variant="ghost" icon={d.verified ? X : BadgeCheck} loading={busyKey === `v-${d.key}`}
                          onClick={() => call(`/documents/${d.key}/verify`, { verified: !d.verified }, d.verified ? "Marked not verified" : "Verified", `v-${d.key}`)}>
                          {d.verified ? "Unverify" : "Verify"}
                        </Button>
                      )}
                      {canManage && a.status !== "enrolled" && (
                        <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-ink hover:bg-sunken/60">
                          <Upload size={14} strokeWidth={1.4} />{busyKey === `doc-${d.key}` ? "Uploading…" : d.uuid ? "Replace" : "Upload"}
                          <input type="file" className="hidden" accept=".pdf,image/*" onChange={(ev) => { const f = ev.target.files?.[0]; if (f) upload(d.key, f); ev.target.value = ""; }} />
                        </label>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {tab === "assessment" && (
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-line p-4">
                      <p className="text-[12px] uppercase tracking-[0.06em] text-faint">Entrance test</p>
                      <p className="mt-1 text-[14px] text-ink">{a.test_at ? formatDateTime(a.test_at) : "Not scheduled"}</p>
                      {a.test_venue && <p className="text-[12.5px] text-muted">{a.test_venue}</p>}
                      <p className="mt-2 text-[22px] font-extralight text-ink tabular">{a.test_score != null ? `${a.test_score} / ${a.test_max ?? "—"}` : "—"}</p>
                    </div>
                    <div className="rounded-xl border border-line p-4">
                      <p className="text-[12px] uppercase tracking-[0.06em] text-faint">Interview</p>
                      <p className="mt-1 text-[14px] text-ink">{a.interview_at ? formatDateTime(a.interview_at) : "Not scheduled"}</p>
                      {a.interviewer_name && <p className="text-[12.5px] text-muted">With {a.interviewer_name}</p>}
                      <p className="mt-2 text-[22px] font-extralight text-ink tabular">{a.interview_score != null ? `${a.interview_score} / ${a.interview_max ?? "—"}` : "—"}</p>
                    </div>
                  </div>
                  {a.interview_notes && <p className="whitespace-pre-line rounded-xl bg-sunken/60 p-4 text-[13.5px] text-ink">{a.interview_notes}</p>}
                  {canManage && !closed && (
                    <div className="flex flex-wrap gap-2">
                      <Button icon={CalendarClock} onClick={() => setAction("schedule")}>Schedule test or interview</Button>
                      <Button icon={ClipboardCheck} onClick={() => setAction("scores")}>Enter scores</Button>
                    </div>
                  )}
                </div>
              )}
              {tab === "activity" && (
                <>
                  {canManage && (
                    <div className="mb-6 flex gap-2">
                      <Textarea value={note} onValueChange={setNote} rows={1} autoGrow placeholder="Add a note" aria-label="Note" className="flex-1" />
                      <Button disabled={!note.trim()} loading={busyKey === "/notes"} onClick={async () => { await call("/notes", { body: note }, "Note added"); setNote(""); }}>Add</Button>
                    </div>
                  )}
                  <ActivityTimeline items={a.activities} />
                </>
              )}
            </div>
          </>
        )}
      </Modal>
      {a && (
        <>
          <StatusModal key={`s${nonce}${action}`} app={a} open={action === "status"} onClose={() => setAction(null)} onDone={done} />
          <ScheduleModal key={`sc${nonce}${action}`} app={a} open={action === "schedule"} onClose={() => setAction(null)} onDone={done} />
          <ScoresModal key={`sr${nonce}${action}`} app={a} open={action === "scores"} onClose={() => setAction(null)} onDone={done} />
          <FeeModal key={`f${nonce}${action}`} app={a} open={action === "fee"} onClose={() => setAction(null)} onDone={done} />
          <OfferModal key={`o${nonce}${action}`} app={a} open={action === "offer"} onClose={() => setAction(null)} onDone={done} />
          <EnrolModal key={`e${nonce}${action}`} app={a} open={action === "enrol"} onClose={() => setAction(null)} onDone={done} />
          <PdfModal path={`/admissions/applications/${a.uuid}/offer-letter.pdf`} title={`Offer letter · ${a.name}`} open={action === "letter"}
            onClose={() => setAction(null)} filename={`offer-${a.application_no}.pdf`} />
        </>
      )}
    </>
  );
}

function Tile({ label, value, hint, warn, action }: { label: string; value: React.ReactNode; hint?: string; warn?: boolean; action?: () => void }) {
  const Tag = action ? "button" : "div";
  return (
    <Tag type={action ? "button" : undefined} onClick={action} className={`min-w-0 rounded-xl border border-line p-3 text-left ${action ? "transition-colors hover:bg-sunken/60" : ""}`}>
      <p className="text-[12px] text-faint">{label}</p>
      <p className="mt-1 truncate text-[16px] font-light text-ink tabular">{value}</p>
      {hint && <p className={`mt-0.5 truncate text-[12.5px] ${warn ? "text-amber-700" : "text-muted"}`}>{hint}</p>}
    </Tag>
  );
}

function Banner({ tone, children }: { tone: "accent" | "warn" | "bad" | "good"; children: React.ReactNode }) {
  const cls = { accent: "border-primary/20 bg-primary-soft/50 text-primary", warn: "border-amber-200 bg-amber-50/70 text-amber-800",
    bad: "border-rose-200 bg-rose-50/70 text-rose-700", good: "border-emerald-200 bg-emerald-50/70 text-emerald-800" }[tone];
  return <p className={`mb-4 rounded-xl border px-4 py-2.5 text-[13.5px] ${cls}`}>{children}</p>;
}

/* ── Action dialogs ──────────────────────────────────────────────────── */

type ActionProps = { app: Application; open: boolean; onClose: () => void; onDone: (a: Application, msg: string) => void };

function useSubmit(app: Application, onDone: ActionProps["onDone"]) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  async function run(path: string, body: unknown, msg: string) {
    setSaving(true);
    try { onDone(await api.post<Application>(`/admissions/applications/${app.uuid}${path}`, body), msg); }
    catch (e) { toast.error("That didn't work", { description: e instanceof Error ? e.message : undefined }); }
    finally { setSaving(false); }
  }
  return { saving, run };
}

function StatusModal({ app, open, onClose, onDone }: ActionProps) {
  const { saving, run } = useSubmit(app, onDone);
  const [to, setTo] = useState<string | null>(null);
  const [text, setText] = useState("");
  const needsReason = to === "rejected" || to === "withdrawn";
  const options = (app.allowed ?? []).map((s) => ({ value: s, label: STATUS_LABEL[s] ?? s }));
  return (
    <Modal open={open} onClose={onClose} size="sm" busy={saving} title="Change status"
      footer={<><ModalCancel /><Button variant="primary" disabled={!to || (needsReason && !text.trim())} loading={saving}
        onClick={() => run("/status", { status: to, reason: needsReason ? text : null, note: needsReason ? null : text || null }, `Moved to ${STATUS_LABEL[to!]}`)}>Save</Button></>}>
      <div className="space-y-4">
        {options.length === 0 ? <p className="text-[13.5px] text-muted">No other status is possible from here.</p> : (
          <Field label="New status"><Select value={to} onChange={setTo} options={options} placeholder="Pick a status" /></Field>
        )}
        <Field label={needsReason ? "Reason" : "Note"} required={needsReason} aside={needsReason ? undefined : "Optional"}>
          <Textarea value={text} onValueChange={setText} rows={2} />
        </Field>
        <p className="text-[12.5px] text-faint">Offers go through Make offer; enrolment through Enrol.</p>
      </div>
    </Modal>
  );
}

function ScheduleModal({ app, open, onClose, onDone }: ActionProps) {
  const { saving, run } = useSubmit(app, onDone);
  const t0 = splitIso(app.test_at), i0 = splitIso(app.interview_at);
  const [testDay, setTestDay] = useState(t0.day); const [testTime, setTestTime] = useState(t0.time);
  const [venue, setVenue] = useState(app.test_venue ?? "");
  const [intDay, setIntDay] = useState(i0.day); const [intTime, setIntTime] = useState(i0.time);
  const [interviewer, setInterviewer] = useState<number | null>(app.interviewer_id ?? null);
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title="Schedule test and interview"
      description="The status moves to Test scheduled or Interview."
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={() => {
        const body: Record<string, unknown> = {};
        if (testDay || app.test_at) { body.test_at = toIso(testDay, testTime); body.test_venue = venue || null; }
        if (intDay || app.interview_at) { body.interview_at = toIso(intDay, intTime); body.interviewer_id = interviewer; }
        run("/schedule", body, "Schedule saved");
      }}>Save</Button></>}>
      <FormSection title="Entrance test">
        <FormGrid columns={3}>
          <Field label="Date"><DateInput value={testDay} onChange={setTestDay} clearable /></Field>
          <Field label="Time"><TimeInput value={testTime} onChange={setTestTime} /></Field>
          <Field label="Venue"><TextInput value={venue} onValueChange={setVenue} /></Field>
        </FormGrid>
      </FormSection>
      <FormSection title="Interview">
        <FormGrid columns={3}>
          <Field label="Date"><DateInput value={intDay} onChange={setIntDay} clearable /></Field>
          <Field label="Time"><TimeInput value={intTime} onChange={setIntTime} /></Field>
          <Field label="With"><Select value={interviewer} onChange={setInterviewer} loadOptions={searchStaff} clearable placeholder="Search staff"
            selectedOption={app.interviewer_id ? { value: app.interviewer_id, label: app.interviewer_name || "" } : null} /></Field>
        </FormGrid>
      </FormSection>
    </Modal>
  );
}

const num = (s: string | null | undefined) => (s === null || s === undefined || s === "" ? null : Number(s));

function ScoresModal({ app, open, onClose, onDone }: ActionProps) {
  const { saving, run } = useSubmit(app, onDone);
  const [ts, setTs] = useState<number | null>(num(app.test_score)); const [tm, setTm] = useState<number | null>(num(app.test_max) ?? 100);
  const [is, setIs] = useState<number | null>(num(app.interview_score)); const [im, setIm] = useState<number | null>(num(app.interview_max) ?? 10);
  const [notes, setNotes] = useState(app.interview_notes ?? "");
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title="Scores" description="The merit score combines the test and interview by the weights in Admission settings."
      footer={<><ModalCancel /><Button variant="primary" loading={saving}
        onClick={() => run("/scores", { test_score: ts, test_max: ts != null ? tm : null, interview_score: is, interview_max: is != null ? im : null, interview_notes: notes || null }, "Scores saved")}>Save</Button></>}>
      <FormGrid>
        <Field label="Test score"><NumberInput value={ts} onChange={setTs} min={0} step={0.5} /></Field>
        <Field label="Out of"><NumberInput value={tm} onChange={setTm} min={1} /></Field>
        <Field label="Interview score"><NumberInput value={is} onChange={setIs} min={0} step={0.5} /></Field>
        <Field label="Out of"><NumberInput value={im} onChange={setIm} min={1} /></Field>
        <Field label="Interview notes" className="sm:col-span-2"><Textarea value={notes} onValueChange={setNotes} rows={3} /></Field>
      </FormGrid>
    </Modal>
  );
}

function FeeModal({ app, open, onClose, onDone }: ActionProps) {
  const { saving, run } = useSubmit(app, onDone);
  const [paid, setPaid] = useState(true);
  const [amount, setAmount] = useState<number | null>(num(app.fee_amount));
  const [on, setOn] = useState(app.fee_paid_on ?? new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState(app.fee_reference ?? "");
  return (
    <Modal open={open} onClose={onClose} size="sm" busy={saving} title="Application fee"
      footer={<><ModalCancel /><Button variant="primary" loading={saving} icon={IndianRupee}
        onClick={() => run("/fee", { paid, amount, paid_on: paid ? on : null, reference: ref || null }, paid ? "Fee recorded" : "Fee marked unpaid")}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Amount"><NumberInput value={amount} onChange={setAmount} min={0} suffix="₹" /></Field>
        <Toggle checked={paid} onChange={setPaid} label="Paid" />
        {paid && <FormGrid>
          <Field label="Paid on"><DateInput value={on} onChange={setOn} /></Field>
          <Field label="Receipt or reference"><TextInput value={ref} onValueChange={setRef} /></Field>
        </FormGrid>}
      </div>
    </Modal>
  );
}

function OfferModal({ app, open, onClose, onDone }: ActionProps) {
  const { saving, run } = useSubmit(app, onDone);
  const [expires, setExpires] = useState("");
  const [text, setText] = useState("");
  const seats = app.seats;
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title={`Offer a seat to ${app.name}`}
      description={seats?.has_offering ? `${seats.available} of ${seats.seats} seats open in ${app.program_name}.` : "This program is not open for admission yet."}
      footer={<><ModalCancel /><Button variant="primary" icon={Send} loading={saving} disabled={!seats?.available}
        onClick={() => run("/offer", { expires_on: expires || null, note: text || null }, "Offer made")}>Make offer</Button></>}>
      <div className="space-y-4">
        <Field label="Offer valid until" hint="Empty: the number of days set in Admission settings"><DateInput value={expires} onChange={setExpires} clearable /></Field>
        <Field label="Note for the family" aside="Optional" hint="Printed on the offer letter"><Textarea value={text} onValueChange={setText} rows={3} /></Field>
        <p className="text-[12.5px] text-faint">If an approval flow is set up for admission offers, the offer goes out once it is approved.</p>
      </div>
    </Modal>
  );
}

function EnrolModal({ app, open, onClose, onDone }: ActionProps) {
  const { term } = useInstitution();
  const toast = useToast();
  const sections = useSectionOptions(app.session_id, app.program_id);
  const [section, setSection] = useState<number | null>(null);
  const [roll, setRoll] = useState("");
  const [adm, setAdm] = useState("");
  const [accounts, setAccounts] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logins, setLogins] = useState<{ kind: string; name: string; login: string; password: string }[] | null>(null);
  const [result, setResult] = useState<Application | null>(null);

  async function save() {
    setSaving(true);
    try {
      const out = await api.post<Application & { new_logins: { kind: string; name: string; login: string; password: string }[]; student: { admission_no: string } }>(
        `/admissions/applications/${app.uuid}/enrol`, { section_id: section, roll_no: roll || null, admission_no: adm || null, create_portal_accounts: accounts });
      if (out.new_logins?.length) { setLogins(out.new_logins); setResult(out); toast.success(`Enrolled as ${out.student.admission_no}`); }
      else onDone(out, `Enrolled as ${out.student.admission_no}`);
    } catch (e) { toast.error("Couldn't enrol", { description: e instanceof Error ? e.message : undefined }); }
    finally { setSaving(false); }
  }

  if (logins && result) {
    return (
      <Modal open={open} onClose={() => onDone(result, "Enrolled")} size="md" title="Sign-ins created"
        description="Share these with the family now. Passwords are shown only once; they must change them at first sign-in."
        footer={<Button variant="primary" onClick={() => onDone(result, "Enrolled")}>Done</Button>}>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {logins.map((l) => (
            <li key={l.login} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13.5px]">
              <span><span className="block text-ink">{l.name}</span><span className="text-muted capitalize">{l.kind}</span></span>
              <span className="font-mono text-[12.5px] text-ink">{l.login} · {l.password}</span>
            </li>
          ))}
        </ul>
      </Modal>
    );
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title={`Enrol ${app.name}`}
      description={`Creates the ${term("student").toLowerCase()} record with ${term("guardians").toLowerCase()} and enrols them in a ${term("section").toLowerCase()} of ${app.program_name}.`}
      footer={<><ModalCancel /><Button variant="primary" icon={GraduationCap} loading={saving} disabled={!section} onClick={save}>Enrol</Button></>}>
      <div className="space-y-4">
        <Field label={term("section")} required>
          <Select value={section} onChange={setSection} options={sections} placeholder={sections.length ? "Pick one" : `No ${term("sections").toLowerCase()} for this ${term("program").toLowerCase()} yet`} />
        </Field>
        <FormGrid>
          <Field label={term("roll")} aside="Optional" hint="Empty: next number"><TextInput value={roll} onValueChange={setRoll} /></Field>
          <Field label="Admission number" aside="Optional" hint="Empty: next from the number series"><TextInput value={adm} onValueChange={setAdm} /></Field>
        </FormGrid>
        <Toggle checked={accounts} onChange={setAccounts} label="Create sign-ins" description={`For the ${term("student").toLowerCase()} and each ${term("guardian").toLowerCase()} with an email or phone.`} />
      </div>
    </Modal>
  );
}
