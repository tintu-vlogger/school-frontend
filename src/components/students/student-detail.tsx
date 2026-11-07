"use client";

/*
 * A student's details in a modal, with tabs: profile, enrolment history (and move to another
 * section), guardians (add / remove), documents (upload, verify, remove), portal sign-ins
 * (create, reset password, switch on/off) and a status change (left, transferred, suspended …).
 *   <StudentDetailModal uuid={uuid} open onClose onEdit={(s) => ...} onChanged={refresh} />
 */
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRightLeft, BadgeCheck, FileText, KeyRound, Link2, Pencil, Plus, Power, RefreshCw, Trash2, Upload, UserPlus, UserRoundX,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime, todayISO } from "@/lib/datetime";
import { CustomFields, type CustomFieldEntity } from "@/components/custom-fields";
import { fileHref, uploadFile } from "@/components/workplace/files";
import {
  Avatar, Badge, Button, Checkbox, DateInput, Field, FileDrop, FormGrid, KeyValue, Menu, Modal, ModalCancel, Section, Select,
  Skeleton, Tabs, TextInput, Textarea, formatBytes, useConfirm, type SelectOption,
} from "@/components/ui-kit";
import { errText, useSectionOptions } from "@/components/academics/shared";
import {
  NewLogins, RELATIONS, STATUS_OPTIONS, StatusBadge, genderLabel, relationLabel,
  type NewLogin, type PortalAccount, type StudentDoc, type StudentFull,
} from "./shared";

type Tab = "profile" | "enrolment" | "guardians" | "documents" | "signins";

export function StudentDetailModal({ uuid, open, onClose, onEdit, onChanged }: {
  uuid: string | null; open: boolean; onClose: () => void; onEdit: (s: StudentFull) => void; onChanged: () => void;
}) {
  const { term } = useInstitution();
  const { can } = useAccess();
  const canManage = can("students.manage");
  const canPortal = can("students.portal.manage");
  const toast = useToast();
  const [s, setS] = useState<StudentFull | null>(null);
  const [tab, setTab] = useState<Tab>("profile");
  const [nonce, setNonce] = useState(0);
  const [statusOpen, setStatusOpen] = useState(false);

  useEffect(() => {
    if (!uuid || !open) return;
    let live = true;
    api.get<StudentFull>(`/students/${uuid}`).then((r) => { if (live) setS(r); })
      .catch((e) => { if (live) toast.error("Couldn't open the record", { description: errText(e) }); });
    return () => { live = false; };
  }, [uuid, open, nonce, toast]);
  useEffect(() => { if (!open) { setTab("profile"); } }, [open]);
  const reload = useCallback(() => { setNonce((n) => n + 1); onChanged(); }, [onChanged]);
  const cur = s && s.uuid === uuid ? s : null;

  return (
    <Modal open={open && !!uuid} onClose={onClose} size="xl"
      title={cur?.name ?? "Loading"}
      description={cur ? [cur.admission_no, cur.section_label ?? `No ${term("section").toLowerCase()}`, cur.roll_no ? `${term("roll")} ${cur.roll_no}` : null].filter(Boolean).join(" · ") : undefined}
      leading={cur && <Avatar name={cur.name} src={cur.photo_url} size={48} />}
      headerActions={cur && canManage && (
        <div className="flex items-center gap-2">
          <Button size="sm" icon={Pencil} onClick={() => onEdit(cur)}>Edit</Button>
          <Menu items={[{ label: "Change status", icon: UserRoundX, onSelect: () => setStatusOpen(true) }]} />
        </div>
      )}>
      {!cur ? <div className="space-y-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-40 w-full" /></div> : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusBadge status={cur.status} />
            {cur.house_name && <Badge>{cur.house_name} house</Badge>}
            {cur.class_teacher_name && <span className="text-[13px] text-muted">{term("teacher")}: {cur.class_teacher_name}</span>}
          </div>
          <Tabs value={tab} onChange={setTab} className="mb-5" items={[
            { value: "profile", label: "Profile" }, { value: "enrolment", label: "Enrolment", count: cur.enrollments.length },
            { value: "guardians", label: term("guardians"), count: cur.guardians.length }, { value: "documents", label: "Documents" },
            ...(canPortal ? [{ value: "signins" as Tab, label: "Portal sign-ins" }] : []),
          ]} />
          {tab === "profile" && <ProfileTab s={cur} />}
          {tab === "enrolment" && <EnrolmentTab s={cur} canManage={canManage} onChanged={reload} />}
          {tab === "guardians" && <GuardiansTab s={cur} canManage={canManage} onChanged={reload} />}
          {tab === "documents" && <DocumentsTab s={cur} canManage={canManage} />}
          {tab === "signins" && <SignInsTab s={cur} onChanged={reload} />}
          <StatusModal s={cur} open={statusOpen} onClose={() => setStatusOpen(false)} onSaved={() => { setStatusOpen(false); reload(); }} />
        </>
      )}
    </Modal>
  );
}

function ProfileTab({ s }: { s: StudentFull }) {
  const { term } = useInstitution();
  return (
    <div>
      <Section title="Personal">
        <KeyValue columns={3} items={[
          { label: "Gender", value: genderLabel(s.gender) }, { label: "Date of birth", value: s.date_of_birth ? formatDate(s.date_of_birth) : null },
          { label: "Blood group", value: s.blood_group }, { label: "Email", value: s.email }, { label: "Phone", value: s.phone },
          { label: "Mother tongue", value: s.mother_tongue }, { label: "Nationality", value: s.nationality },
          { label: "Religion", value: s.religion }, { label: "Category", value: s.category },
          { label: "National ID", value: s.national_id }, { label: "Board or government ID", value: s.student_reg_id },
          { label: "Address", value: [s.address, s.city, s.state, s.pincode].filter(Boolean).join(", "), span: 3 },
        ]} />
      </Section>
      <Section title="Admission" className="border-t border-line">
        <KeyValue columns={3} items={[
          { label: "Admission no.", value: s.admission_no }, { label: "Admission date", value: s.admission_date ? formatDate(s.admission_date) : null },
          { label: `${term("program")} / ${term("section").toLowerCase()}`, value: s.section_label ?? s.program_name },
          { label: "House", value: s.house_name }, { label: "Fee category", value: s.fee_category },
          { label: "Previous institution", value: s.previous_institution },
          { label: "Hostel", value: s.is_boarder ? "Yes" : "No" }, { label: "Transport", value: s.uses_transport ? "Yes" : "No" },
          ...(s.left_on ? [{ label: "Left on", value: formatDate(s.left_on) }, { label: "Reason", value: s.leaving_reason }] : []),
        ]} />
      </Section>
      <Section title="Medical" className="border-t border-line">
        <KeyValue columns={2} items={[{ label: "Medical notes", value: s.medical_notes }, { label: "Allergies", value: s.allergies }]} />
      </Section>
      <div className="border-t border-line">
        <CustomFields entity={"student" as CustomFieldEntity} values={s.custom} mode="view" />
      </div>
    </div>
  );
}

function EnrolmentTab({ s, canManage, onChanged }: { s: StudentFull; canManage: boolean; onChanged: () => void }) {
  const { term } = useInstitution();
  const toast = useToast();
  const { options } = useSectionOptions(null);
  const [moving, setMoving] = useState(false);
  const [section, setSection] = useState<number | null>(s.section_id);
  const [roll, setRoll] = useState("");
  const [saving, setSaving] = useState(false);
  async function move() {
    if (!section) return;
    setSaving(true);
    try {
      await api.post(`/students/${s.uuid}/enroll`, { section_id: section, roll_no: roll.trim() || null });
      toast.success("Enrolment updated");
      setMoving(false);
      onChanged();
    } catch (e) { toast.error("Couldn't update the enrolment", { description: errText(e) }); } finally { setSaving(false); }
  }
  return (
    <div className="space-y-4">
      {canManage && s.status === "active" && (
        <div className="flex justify-end"><Button size="sm" icon={ArrowRightLeft} onClick={() => setMoving(true)}>{s.section_id ? `Move to another ${term("section").toLowerCase()}` : `Enrol in a ${term("section").toLowerCase()}`}</Button></div>
      )}
      {s.enrollments.length === 0 ? <p className="py-8 text-center text-[13.5px] text-muted">Not enrolled in any {term("section").toLowerCase()} yet.</p> : (
        <div className="divide-y divide-line rounded-xl border border-line">
          {s.enrollments.map((e) => (
            <div key={e.uuid} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-[13.5px]">
              <div>
                <p className="text-ink">{e.section_label ?? e.program_name}</p>
                <p className="text-muted">{e.session_name}{e.roll_no ? ` · ${term("roll")} ${e.roll_no}` : ""}{e.term_no ? ` · ${term("term")} ${e.term_no}` : ""}{e.enrolled_on ? ` · since ${formatDate(e.enrolled_on)}` : ""}</p>
              </div>
              <Badge tone={e.status === "enrolled" ? "good" : e.status === "promoted" || e.status === "completed" ? "accent" : e.status === "detained" ? "warn" : "neutral"}>
                {e.status.charAt(0).toUpperCase() + e.status.slice(1)}
              </Badge>
            </div>
          ))}
        </div>
      )}
      <Modal open={moving} onClose={() => setMoving(false)} size="sm" busy={saving} title={`Change ${term("section").toLowerCase()}`}
        description="Replaces the enrolment in the current session."
        footer={<><ModalCancel /><Button variant="primary" onClick={move} loading={saving} disabled={!section}>Save</Button></>}>
        <div className="space-y-4">
          <Field label={term("section")}><Select value={section} onChange={setSection} options={options} placeholder="Pick" /></Field>
          <Field label={term("roll")} aside="Optional" hint="Leave empty to keep or give the next number"><TextInput value={roll} onValueChange={setRoll} /></Field>
        </div>
      </Modal>
    </div>
  );
}

type GuardianHit = { id: number; name: string; phone: string | null; children: { name: string }[] };
async function searchGuardians(q: string): Promise<SelectOption<number>[]> {
  const r = await api.get<{ items: GuardianHit[] }>(`/guardians?size=20${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  return (r.items ?? []).map((g) => ({ value: g.id, label: g.name, description: [g.phone, g.children.map((c) => c.name).join(", ")].filter(Boolean).join(" · ") || undefined }));
}

function GuardiansTab({ s, canManage, onChanged }: { s: StudentFull; canManage: boolean; onChanged: () => void }) {
  const { term } = useInstitution();
  const toast = useToast();
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  async function remove(linkId: number, name: string) {
    const ok = await confirm({ title: `Remove ${name}?`, message: `They stay on record (and stay linked to any other children), but are no longer a ${term("guardian").toLowerCase()} of ${s.first_name}.`, confirmLabel: "Remove", tone: "danger" });
    if (!ok) return;
    try { await api.delete(`/students/${s.uuid}/guardians/${linkId}`); toast.success("Removed"); onChanged(); }
    catch (e) { toast.error("Couldn't remove", { description: errText(e) }); }
  }
  return (
    <div className="space-y-4">
      {canManage && <div className="flex justify-end"><Button size="sm" icon={Plus} onClick={() => setAdding(true)}>Add {term("guardian").toLowerCase()}</Button></div>}
      {s.guardians.length === 0 ? <p className="py-8 text-center text-[13.5px] text-muted">No {term("guardians").toLowerCase()} on record. Add one so notices and emergency calls reach someone.</p> : (
        <div className="grid gap-3 sm:grid-cols-2">
          {s.guardians.map((g) => (
            <div key={g.link_id} className="rounded-xl border border-line p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <Avatar name={g.name} size={36} />
                  <div>
                    <p className="text-ink">{g.name}</p>
                    <p className="text-[12.5px] text-muted">{relationLabel(g.relation)}{g.occupation ? ` · ${g.occupation}` : ""}</p>
                  </div>
                </div>
                {canManage && <Button size="sm" variant="ghost" icon={Trash2} aria-label="Remove" onClick={() => remove(g.link_id, g.name)} />}
              </div>
              <div className="mt-3 space-y-0.5 text-[13px] text-muted">
                {g.phone && <p><a className="hover:text-ink" href={`tel:${g.phone}`}>{g.phone}</a>{g.alt_phone ? ` · ${g.alt_phone}` : ""}</p>}
                {g.email && <p><a className="hover:text-ink" href={`mailto:${g.email}`}>{g.email}</a></p>}
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {g.is_primary && <Badge tone="accent">Primary</Badge>}
                {g.can_pickup && <Badge>May pick up</Badge>}
                {g.receives_notifications && <Badge>Gets notices</Badge>}
                {g.portal_account !== undefined && (g.portal_account ? <Badge tone={g.portal_account.active ? "good" : "neutral"} dot>Sign-in {g.portal_account.active ? "on" : "off"}</Badge> : <Badge tone="warn">No sign-in</Badge>)}
              </div>
            </div>
          ))}
        </div>
      )}
      {adding && <AddGuardianModal s={s} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); onChanged(); }} />}
    </div>
  );
}

function AddGuardianModal({ s, onClose, onSaved }: { s: StudentFull; onClose: () => void; onSaved: () => void }) {
  const { term } = useInstitution();
  const toast = useToast();
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [v, setV] = useState({ id: null as number | null, first_name: "", last_name: "", phone: "", email: "", occupation: "", relation: "guardian", is_primary: s.guardians.length === 0, can_pickup: true, receives_notifications: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (mode === "existing" && !v.id) { setError("Pick someone"); return; }
    if (mode === "new" && !v.first_name.trim()) { setError("Enter a first name"); return; }
    setSaving(true);
    try {
      const flags = { relation: v.relation, is_primary: v.is_primary, can_pickup: v.can_pickup, receives_notifications: v.receives_notifications };
      await api.post(`/students/${s.uuid}/guardians`, mode === "existing" ? { id: v.id, ...flags } : {
        ...flags, first_name: v.first_name.trim(), last_name: v.last_name.trim() || null, phone: v.phone.trim() || null,
        email: v.email.trim() || null, occupation: v.occupation.trim() || null,
      });
      toast.success(`${term("guardian")} added`);
      onSaved();
    } catch (e) { toast.error("Couldn't add", { description: errText(e) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} title={`Add ${term("guardian").toLowerCase()}`}
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Add</Button></>}>
      <div className="mb-4 flex gap-1">
        <Button size="sm" variant={mode === "new" ? "secondary" : "ghost"} icon={UserPlus} onClick={() => setMode("new")}>New person</Button>
        <Button size="sm" variant={mode === "existing" ? "secondary" : "ghost"} icon={Link2} onClick={() => setMode("existing")}>Already on record</Button>
      </div>
      <FormGrid>
        {mode === "existing" ? (
          <Field label="Find" error={error} hint="Search by name, phone or email" className="sm:col-span-2">
            <Select value={v.id} onChange={(x) => { setV({ ...v, id: x }); setError(""); }} loadOptions={searchGuardians} placeholder="Search" />
          </Field>
        ) : (
          <>
            <Field label="First name" required error={error}><TextInput autoFocusInModal value={v.first_name} onValueChange={(x) => { setV({ ...v, first_name: x }); setError(""); }} /></Field>
            <Field label="Last name"><TextInput value={v.last_name} onValueChange={(x) => setV({ ...v, last_name: x })} /></Field>
            <Field label="Mobile"><TextInput value={v.phone} inputMode="tel" onValueChange={(x) => setV({ ...v, phone: x })} /></Field>
            <Field label="Email"><TextInput type="email" value={v.email} onValueChange={(x) => setV({ ...v, email: x })} /></Field>
            <Field label="Occupation" aside="Optional"><TextInput value={v.occupation} onValueChange={(x) => setV({ ...v, occupation: x })} /></Field>
          </>
        )}
        <Field label="Relation"><Select value={v.relation} onChange={(x) => setV({ ...v, relation: x ?? "guardian" })} options={RELATIONS} /></Field>
      </FormGrid>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <Checkbox checked={v.is_primary} onChange={(x) => setV({ ...v, is_primary: x })} label="Primary contact" />
        <Checkbox checked={v.can_pickup} onChange={(x) => setV({ ...v, can_pickup: x })} label="May pick up" />
        <Checkbox checked={v.receives_notifications} onChange={(x) => setV({ ...v, receives_notifications: x })} label="Gets notices" />
      </div>
    </Modal>
  );
}

export function DocumentList({ docs, onVerify, onRemove }: { docs: StudentDoc[]; onVerify?: (d: StudentDoc) => void; onRemove?: (d: StudentDoc) => void }) {
  return (
    <div className="divide-y divide-line rounded-xl border border-line">
      {docs.map((d) => (
        <div key={d.uuid} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13.5px]">
          <FileText size={18} strokeWidth={1.4} className="text-faint" />
          <div className="min-w-0 flex-1">
            <a href={fileHref(d.file_url)} target="_blank" rel="noreferrer" className="truncate text-ink hover:text-primary">{d.title}</a>
            <p className="text-[12.5px] text-muted">
              {[d.doc_type, d.file_size ? formatBytes(d.file_size) : null, d.expires_on ? `expires ${formatDate(d.expires_on)}` : null, `added ${formatDate(d.created_at)}`].filter(Boolean).join(" · ")}
            </p>
          </div>
          {d.verified ? <Badge tone="good" dot>Verified</Badge> : <Badge tone="neutral">Not verified</Badge>}
          {(onVerify || onRemove) && (
            <Menu items={[
              ...(onVerify && !d.verified ? [{ label: "Mark verified", icon: BadgeCheck, onSelect: () => onVerify(d) }] : []),
              ...(onRemove ? [{ label: "Remove", icon: Trash2, danger: true, onSelect: () => onRemove(d) }] : []),
            ]} />
          )}
        </div>
      ))}
    </div>
  );
}

function DocumentsTab({ s, canManage }: { s: StudentFull; canManage: boolean }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [docs, setDocs] = useState<StudentDoc[] | null>(null);
  const [nonce, setNonce] = useState(0);
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    let live = true;
    api.get<StudentDoc[]>(`/students/${s.uuid}/documents`).then((r) => { if (live) setDocs(r); }).catch(() => { if (live) setDocs([]); });
    return () => { live = false; };
  }, [s.uuid, nonce]);
  const reload = () => setNonce((n) => n + 1);
  async function verify(d: StudentDoc) {
    try { await api.post(`/students/${s.uuid}/documents/${d.id}/verify`); toast.success("Marked verified"); reload(); }
    catch (e) { toast.error("Couldn't verify", { description: errText(e) }); }
  }
  async function remove(d: StudentDoc) {
    if (!(await confirm({ title: `Remove ${d.title}?`, confirmLabel: "Remove", tone: "danger" }))) return;
    try { await api.delete(`/students/${s.uuid}/documents/${d.id}`); toast.success("Removed"); reload(); }
    catch (e) { toast.error("Couldn't remove", { description: errText(e) }); }
  }
  return (
    <div className="space-y-4">
      {canManage && <div className="flex justify-end"><Button size="sm" icon={Upload} onClick={() => setUploading(true)}>Upload document</Button></div>}
      {docs === null ? <Skeleton className="h-24 w-full" /> : docs.length === 0
        ? <p className="py-8 text-center text-[13.5px] text-muted">No documents yet. Upload the birth certificate, transfer certificate, photo ID or report cards.</p>
        : <DocumentList docs={docs} onVerify={canManage ? verify : undefined} onRemove={canManage ? remove : undefined} />}
      {uploading && <UploadModal s={s} onClose={() => setUploading(false)} onSaved={() => { setUploading(false); reload(); }} />}
    </div>
  );
}

const DOC_TYPES: SelectOption[] = ["Birth certificate", "Transfer certificate", "Photo ID", "Address proof", "Report card", "Medical record", "Caste certificate", "Other"]
  .map((x) => ({ value: x, label: x }));

function UploadModal({ s, onClose, onSaved }: { s: StudentFull; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string | null>(null);
  const [expires, setExpires] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!files.length) { toast.error("Pick a file"); return; }
    setSaving(true);
    try {
      for (const f of files) {
        const ref = await uploadFile(f);
        await api.post(`/students/${s.uuid}/documents`, {
          title: (files.length === 1 && title.trim()) || type || f.name.replace(/\.[^.]+$/, ""), doc_type: type,
          upload_uuid: ref.uuid, expires_on: expires || null,
        });
      }
      toast.success(files.length === 1 ? "Document added" : `${files.length} documents added`);
      onSaved();
    } catch (e) { toast.error("Couldn't upload", { description: errText(e) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} dirty={files.length > 0} title="Upload document"
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Upload</Button></>}>
      <div className="space-y-4">
        <FileDrop value={files} onChange={setFiles} accept="image/*,.pdf,.doc,.docx" multiple maxSizeMb={10} maxFiles={5} />
        <FormGrid>
          <Field label="Type"><Select value={type} onChange={setType} options={DOC_TYPES} clearable placeholder="Pick a type" /></Field>
          <Field label="Expires on" aside="Optional"><DateInput value={expires} onChange={setExpires} clearable /></Field>
          {files.length <= 1 && <Field label="Title" aside="Optional" className="sm:col-span-2"><TextInput value={title} onValueChange={setTitle} placeholder="Defaults to the type or file name" /></Field>}
        </FormGrid>
      </div>
    </Modal>
  );
}

function SignInsTab({ s, onChanged }: { s: StudentFull; onChanged: () => void }) {
  const { term } = useInstitution();
  const toast = useToast();
  const confirm = useConfirm();
  const [logins, setLogins] = useState<NewLogin[] | null>(null);
  const [busy, setBusy] = useState(false);
  const rows: { who: string; role: string; acc: PortalAccount | null | undefined }[] = [
    { who: s.name, role: term("student"), acc: s.portal_account },
    ...s.guardians.map((g) => ({ who: g.name, role: relationLabel(g.relation), acc: g.portal_account })),
  ];
  async function create() {
    setBusy(true);
    try {
      const r = await api.post<{ new_logins: NewLogin[] }>(`/students/${s.uuid}/portal-accounts`);
      setLogins(r.new_logins.map((l) => ({ ...l, student: s.name, admission_no: s.admission_no })));
      onChanged();
    } catch (e) { toast.error("Couldn't create sign-ins", { description: errText(e) }); } finally { setBusy(false); }
  }
  async function reset(acc: PortalAccount, who: string) {
    if (!(await confirm({ title: `Reset ${who}'s password?`, message: "A new one-time password is created. The old one stops working at once.", confirmLabel: "Reset" }))) return;
    try {
      const r = await api.post<{ login: string; password: string }>(`/portal-accounts/${acc.uuid}/reset-password`, {});
      setLogins([{ kind: acc.kind, name: who, login: r.login, password: r.password, student: s.name }]);
    } catch (e) { toast.error("Couldn't reset", { description: errText(e) }); }
  }
  async function toggle(acc: PortalAccount) {
    try { await api.post(`/portal-accounts/${acc.uuid}/active`, { active: !acc.active }); toast.success(acc.active ? "Sign-in switched off" : "Sign-in switched on"); onChanged(); }
    catch (e) { toast.error("Couldn't change", { description: errText(e) }); }
  }
  const missing = rows.some((r) => !r.acc);
  return (
    <div className="space-y-4">
      {missing && <div className="flex justify-end"><Button size="sm" icon={KeyRound} loading={busy} onClick={create}>Create missing sign-ins</Button></div>}
      <div className="divide-y divide-line rounded-xl border border-line">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13.5px]">
            <div className="min-w-[160px] flex-1">
              <p className="text-ink">{r.who}</p>
              <p className="text-[12.5px] text-muted">{r.role}{r.acc ? ` · ${r.acc.login}` : ""}</p>
            </div>
            {r.acc ? (
              <>
                <span className="text-[12.5px] text-muted">{r.acc.last_login_at ? `Last in ${formatDateTime(r.acc.last_login_at)}` : "Never signed in"}</span>
                <Badge tone={r.acc.active ? "good" : "neutral"} dot>{r.acc.active ? "On" : "Off"}</Badge>
                <Menu items={[
                  { label: "Reset password", icon: RefreshCw, onSelect: () => reset(r.acc!, r.who) },
                  { label: r.acc.active ? "Switch off" : "Switch on", icon: Power, onSelect: () => toggle(r.acc!) },
                ]} />
              </>
            ) : <Badge tone="warn">No sign-in</Badge>}
          </div>
        ))}
      </div>
      <p className="text-[12.5px] text-faint">Sign-ins use the email on record, else the admission number ({term("student").toLowerCase()}) or mobile ({term("guardian").toLowerCase()}).</p>
      <Modal open={!!logins} onClose={() => setLogins(null)} size="lg" title="New passwords"
        footer={<Button variant="primary" onClick={() => setLogins(null)}>Done</Button>}>
        {logins && <NewLogins logins={logins} fileName={`${s.admission_no}-sign-ins.csv`} guardianWord={term("guardian")} studentWord={term("student")} />}
      </Modal>
    </div>
  );
}

function StatusModal({ s, open, onClose, onSaved }: { s: StudentFull; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<string | null>(s.status === "active" ? "left" : "active");
  const [on, setOn] = useState(todayISO());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!status) return;
    setSaving(true);
    try {
      await api.post(`/students/${s.uuid}/status`, { status, on: on || null, reason: reason.trim() || null });
      toast.success("Status changed");
      onSaved();
    } catch (e) { toast.error("Couldn't change the status", { description: errText(e) }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" busy={saving} title="Change status"
      description="Left and transferred also close the enrolment and switch off the sign-in."
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="New status"><Select value={status} onChange={setStatus} options={STATUS_OPTIONS.filter((o) => o.value !== s.status)} /></Field>
        {status !== "active" && (
          <>
            <Field label="With effect from"><DateInput value={on} onChange={setOn} /></Field>
            <Field label="Reason" aside="Optional"><Textarea rows={3} value={reason} onValueChange={setReason} /></Field>
          </>
        )}
      </div>
    </Modal>
  );
}
