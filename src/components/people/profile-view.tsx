"use client";

/*
 * The employee profile: a header card (photo, name, key facts, quick actions) and tabs
 * (Overview, Job, Personal, Family & nominees, Documents, Bank & statutory, Education &
 * experience, Skills & tags, History, Assets). Used in the large profile modal on the
 * directory, on /dashboard/staff/{uuid}, and for "My profile" (self = true).
 *
 *   <ProfileView uuid={uuid} onOpenPerson={(uuid) => ...} onChanged={refreshList} />
 *   <ProfileView self />
 */
import { useRef, useState, type ReactNode } from "react";
import {
  Archive, ArrowRightLeft, BadgeCheck, Ban, Building2, Cake, Camera, CheckCircle2, ChevronDown, Clock, Copy, Eye, FileWarning, Laptop,
  LogIn, LogOut, Mail, MapPin, Pencil, Phone, Repeat, Send, ShieldCheck, UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Avatar, Badge, Button, Field, FormGrid, KeyValue, MasterSelect, Menu, Modal, ModalCancel, Skeleton, SkeletonText, Tabs, TextInput,
  useConfirm, type MenuItem,
} from "@/components/ui-kit";
import { CustomFields, hasCustomFields, useCustomFieldLayout } from "@/components/custom-fields";
import { DetailList, NomineeTotals } from "./detail-sections";
import { DocumentsPanel } from "./documents";
import { EmployeeEditModal, type EditTab } from "./employee-forms";
import { HistoryPanel, JobChangeModal, RehireModal, StageModal, type StageTarget } from "./history";
import { useProfile } from "./hooks";
import { SensitiveChangeModal } from "./self-service";
import { SkillsPanel, TagChip, TagsPanel } from "./skills-tags";
import { STATUS, addressText, day, postForm, years, type Person, type Profile } from "./types";
import { ProfileKudos } from "@/components/engagement/kudos-ui";

const TABS = [
  { value: "overview", label: "Overview" }, { value: "job", label: "Job" }, { value: "personal", label: "Personal" },
  { value: "family", label: "Family & nominees" }, { value: "documents", label: "Documents" }, { value: "bank", label: "Bank & statutory" },
  { value: "background", label: "Education & experience" }, { value: "skills", label: "Skills & tags" }, { value: "history", label: "History" },
  { value: "assets", label: "Assets" },
] as const;
type Tab = (typeof TABS)[number]["value"];

function Card({ title, action, children, className = "" }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface ${className}`}>
      <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5"><p className="text-[15px] text-ink">{title}</p>{action}</header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function PersonLink({ p, onOpen, label }: { p: Person | null; onOpen?: (uuid: string) => void; label?: string }) {
  if (!p) return <span className="text-faint">Not set</span>;
  const inner = <><Avatar name={p.name} src={p.photo} size={34} /><span className="min-w-0 text-left"><span className="block truncate text-[14px] text-ink">{p.name}</span><span className="block truncate text-[12.5px] text-muted">{label ?? p.designation ?? p.code}</span></span></>;
  return onOpen
    ? <button type="button" onClick={() => onOpen(p.uuid)} className="-mx-2 flex w-[calc(100%+16px)] items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-sunken/70">{inner}</button>
    : <div className="flex items-center gap-3">{inner}</div>;
}

function Fact({ icon: Icon, children }: { icon: typeof Mail; children: ReactNode }) {
  return <span className="inline-flex min-w-0 items-center gap-1.5 text-[13.5px] text-muted"><Icon size={14} strokeWidth={1.4} className="shrink-0 text-faint" /><span className="truncate">{children}</span></span>;
}

export function ProfileView({ uuid = null, self = false, onOpenPerson, onChanged, compact = false }: {
  uuid?: string | null; self?: boolean; onOpenPerson?: (uuid: string) => void; onChanged?: () => void; compact?: boolean;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const { profile: p, error, reload } = useProfile(uuid, { self });
  const [tab, setTab] = useState<Tab>("overview");
  const [edit, setEdit] = useState<{ open: boolean; tab: EditTab }>({ open: false, tab: "personal" });
  const [stage, setStage] = useState<{ open: boolean; target: StageTarget; key: number }>({ open: false, target: "confirmed", key: 0 });
  const [rehire, setRehire] = useState({ open: false, key: 0 });
  const [change, setChange] = useState({ open: false, key: 0 });
  const [mine, setMine] = useState({ open: false, key: 0 });
  const [request, setRequest] = useState({ open: false, key: 0 });
  const [aadhaar, setAadhaar] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { layout } = useCustomFieldLayout("employee");

  const changed = () => { reload(); onChanged?.(); };

  if (error && !p) return <p className="py-16 text-center text-[14px] text-muted">{error.includes("not found") ? "This employee couldn't be found." : error}</p>;
  if (!p) return (
    <div className="space-y-6">
      <div className="flex items-center gap-5 rounded-2xl border border-line p-6"><Skeleton className="h-20 w-20 rounded-full" /><div className="flex-1 space-y-3"><Skeleton className="h-6 w-56" /><Skeleton className="h-4 w-80" /></div></div>
      <SkeletonText lines={6} />
    </div>
  );

  const perms = p.permissions;
  const canEdit = perms.can_edit;
  const isSelf = perms.is_self || self;
  const st = STATUS[p.status] ?? { label: p.status_label, tone: "neutral" as const };
  const live = !["exited", "archived"].includes(p.status);
  const pendingDocs = p.documents.filter((d) => !d.archived_at && d.verification_status !== "verified").length;
  const expiring = p.documents.filter((d) => !d.archived_at && (d.expiry_state === "expiring" || d.expiry_state === "expired"));
  const name = p.full_name;

  async function uploadPhoto(file: File) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      await postForm(isSelf && !canEdit ? "/me/profile/photo" : `/employees/${p!.uuid}/photo`, fd);
      toast.success("Photo updated");
      changed();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Upload failed"); }
  }

  async function revealAadhaar() {
    try { const r = await api.get<{ aadhaar: string }>(`/employees/${p!.uuid}/aadhaar`); setAadhaar(r.aadhaar); setTimeout(() => setAadhaar(null), 30_000); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't show the number"); }
  }

  async function archive() {
    if (!(await confirm({ title: `Archive ${name}?`, message: "The record is kept with its history and documents, but hidden from lists. You can still rehire them.", confirmLabel: "Archive", tone: "danger" }))) return;
    try { await api.post(`/employees/${p!.uuid}/archive`, {}); toast.success("Archived"); changed(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't archive"); }
  }

  async function viewAs() {
    try {
      const adminToken = localStorage.getItem("hrms_token");
      if (adminToken && !localStorage.getItem("hrms_admin_token")) localStorage.setItem("hrms_admin_token", adminToken);
      const r = await api.post<{ access_token: string }>(`/auth/impersonate-employee/${p!.id}`);
      localStorage.setItem("hrms_token", r.access_token);
      window.location.href = "/dashboard";
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't switch"); }
  }

  const openStage = (target: StageTarget) => setStage({ open: true, target, key: Date.now() });
  const stageItems: MenuItem[] = [
    ...(p.status === "pre_joining" ? [{ label: "Mark as joined (probation)", icon: CheckCircle2, onSelect: () => openStage("probation") }, { label: "Mark as joined (confirmed)", icon: CheckCircle2, onSelect: () => openStage("confirmed") }] : []),
    ...(p.status === "probation" ? [{ label: "Confirm employment", icon: CheckCircle2, onSelect: () => openStage("confirmed") }, { label: "Extend probation", icon: Clock, onSelect: () => openStage("probation") }] : []),
    ...(["probation", "confirmed"].includes(p.status) ? [{ label: "Record resignation", icon: LogOut, onSelect: () => openStage("notice") }] : []),
    ...(p.status === "notice" ? [{ label: "Withdraw resignation", icon: Repeat, onSelect: () => openStage("confirmed") }] : []),
    ...(["probation", "confirmed", "notice"].includes(p.status) ? ["separator" as const, { label: "Record exit", icon: Ban, danger: true, onSelect: () => openStage("exited") }] : []),
    ...(["exited", "archived"].includes(p.status) ? [{ label: "Rehire", icon: Repeat, onSelect: () => setRehire({ open: true, key: Date.now() }) }] : []),
    ...(["exited", "pre_joining"].includes(p.status) ? ["separator" as const, { label: "Archive record", icon: Archive, danger: true, onSelect: archive }] : []),
  ];

  const header = (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="h-20 bg-[linear-gradient(120deg,rgb(99_102_241/0.10),rgb(99_102_241/0.02)_60%,transparent)]" />
      <div className="flex flex-wrap items-end gap-5 px-6 pb-5">
        <div className="relative -mt-12 shrink-0">
          <div className="rounded-full border-4 border-surface bg-surface"><Avatar name={name} src={p.profile_image_url} size={96} /></div>
          {(canEdit || isSelf) && (
            <>
              <button type="button" onClick={() => fileRef.current?.click()} title="Change photo"
                className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-ink"><Camera size={15} strokeWidth={1.4} /></button>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.target.value = ""; }} />
            </>
          )}
        </div>
        <div className="min-w-0 flex-1 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[24px] font-light leading-tight text-ink">{name}</h2>
            {p.preferred_name && <span className="text-[14px] text-muted">“{p.preferred_name}”</span>}
            <Badge tone={st.tone} dot>{st.label}</Badge>
            {p.employee_status_name && <Badge>{p.employee_status_name}</Badge>}
            {p.rehire_count > 0 && <Badge tone="info">Rehired</Badge>}
          </div>
          <p className="mt-1 text-[14.5px] text-ink/80">{[p.designation_name, p.department_name].filter(Boolean).join(" · ") || "No designation yet"}</p>
          <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
            {p.employee_code && <Fact icon={UserRound}><span className="font-mono">{p.employee_code}</span></Fact>}
            {p.location_name && <Fact icon={MapPin}>{p.location_name}</Fact>}
            {p.legal_entity_name && <Fact icon={Building2}>{p.legal_entity_name}</Fact>}
            {p.date_of_joining && <Fact icon={Clock}>Joined {day(p.date_of_joining)}{p.tenure_years != null && p.date_of_joining <= new Date().toISOString().slice(0, 10) ? ` · ${years(p.tenure_years)}` : ""}</Fact>}
            <Fact icon={Mail}><a href={`mailto:${p.email}`} className="hover:text-primary">{p.email}</a></Fact>
            {p.phone && <Fact icon={Phone}><a href={`tel:${p.phone}`} className="hover:text-primary">{p.phone}</a></Fact>}
          </div>
          {p.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{p.tags.map((t) => <TagChip key={t.id} tag={t} />)}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && <Button icon={Pencil} onClick={() => setEdit({ open: true, tab: "personal" })}>Edit</Button>}
          {canEdit && live && <Button icon={ArrowRightLeft} onClick={() => setChange({ open: true, key: Date.now() })}>Record a change</Button>}
          {canEdit && stageItems.length > 0 && <Menu items={stageItems} align="end" trigger={<Button variant="primary" iconRight={ChevronDown}>Stage</Button>} />}
          {isSelf && !canEdit && <Button icon={Pencil} onClick={() => setMine({ open: true, key: Date.now() })}>Edit my details</Button>}
          {isSelf && !canEdit && <Button variant="primary" icon={Send} onClick={() => setRequest({ open: true, key: Date.now() })}>Request a change</Button>}
          {canEdit && !isSelf && (
            <Menu items={[
              { label: "Copy email", icon: Copy, onSelect: () => { navigator.clipboard?.writeText(p.email); toast.success("Email copied"); } },
              ...(p.active ? [{ label: "View as this employee", icon: LogIn, onSelect: viewAs }] : []),
            ]} />
          )}
        </div>
      </div>
      {p.status === "notice" && p.exit_date && (
        <div className="flex items-center gap-2 border-t border-rose-100 bg-rose-50/60 px-6 py-2.5 text-[13px] text-rose-700"><LogOut size={14} strokeWidth={1.4} /> Resigned{p.resignation_date ? ` on ${day(p.resignation_date)}` : ""}. Last working day {day(p.exit_date)}.</div>
      )}
      {p.status === "probation" && p.probation_end_date && (
        <div className="flex items-center gap-2 border-t border-amber-100 bg-amber-50/60 px-6 py-2.5 text-[13px] text-amber-800"><Clock size={14} strokeWidth={1.4} /> Probation ends {day(p.probation_end_date)}.</div>
      )}
      {["exited", "archived"].includes(p.status) && (
        <div className="flex items-center gap-2 border-t border-line bg-sunken/60 px-6 py-2.5 text-[13px] text-muted"><Archive size={14} strokeWidth={1.4} /> {p.status === "archived" ? "Archived" : "Left"}{p.exit_date ? ` on ${day(p.exit_date)}` : ""}. The record is kept with its history.</div>
      )}
    </div>
  );

  const overview = (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
          {[
            { label: "In the company", value: p.date_of_joining && p.date_of_joining <= new Date().toISOString().slice(0, 10) ? years(p.tenure_years) : "Joining soon" },
            { label: "Total experience", value: years(p.total_experience_years) ?? "—" },
            { label: "Reports", value: String(p.reportees.length) },
            { label: "Documents", value: `${p.documents.filter((d) => !d.archived_at).length}${pendingDocs ? ` · ${pendingDocs} to check` : ""}` },
          ].map((x) => <div key={x.label} className="bg-surface px-5 py-4"><p className="text-[12px] uppercase tracking-[0.06em] text-faint">{x.label}</p><p className="mt-1.5 text-[18px] font-light text-ink">{x.value}</p></div>)}
        </div>
        <Card title="About">
          <KeyValue columns={3} items={[
            { label: "Work email", value: p.email }, { label: "Mobile", value: p.phone }, { label: "Work phone", value: p.work_phone ? `${p.work_phone}${p.extension ? ` · ext ${p.extension}` : ""}` : null },
            { label: "Date of birth", value: p.date_of_birth ? `${day(p.date_of_birth)}${p.age ? ` (${p.age})` : ""}` : null },
            { label: "Employment type", value: p.employment_type_name }, { label: "Work mode", value: p.work_mode_label },
            { label: "Grade", value: p.grade_name }, { label: "Cost centre", value: p.cost_centre_name }, { label: "Blood group", value: p.blood_group_name },
          ]} />
        </Card>
        {(expiring.length > 0 || pendingDocs > 0) && (
          <Card title="Needs attention">
            <ul className="space-y-2 text-[13.5px]">
              {expiring.map((d) => <li key={d.uuid} className="flex items-center gap-2 text-amber-800"><FileWarning size={15} strokeWidth={1.4} /> {d.document_type_name} {d.expiry_state === "expired" ? "has expired" : `expires in ${d.days_to_expiry} days`} ({day(d.expiry_date)})</li>)}
              {pendingDocs > 0 && <li className="flex items-center gap-2 text-muted"><BadgeCheck size={15} strokeWidth={1.4} /> {pendingDocs} {pendingDocs === 1 ? "document is" : "documents are"} waiting for verification. <button type="button" className="text-primary hover:underline" onClick={() => setTab("documents")}>Open documents</button></li>}
            </ul>
          </Card>
        )}
        <Card title="Recent changes" action={<button type="button" onClick={() => setTab("history")} className="text-[13px] text-primary hover:underline">Full history</button>}>
          {p.history.filter((h) => h.status !== "cancelled").slice(0, 4).map((h) => (
            <div key={h.uuid} className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 text-[13.5px] first:pt-0 last:border-0 last:pb-0">
              <span className="text-ink">{h.change_label}{h.status === "scheduled" && <Badge tone="warn" className="ml-2">Scheduled</Badge>}<span className="ml-2 text-muted">{h.items.slice(0, 2).map((i) => `${i.label}: ${i.new ?? "cleared"}`).join(" · ")}</span></span>
              <span className="shrink-0 text-[12px] text-faint tabular">{day(h.effective_date)}</span>
            </div>
          ))}
          {p.history.length === 0 && <p className="text-[13.5px] text-muted">No changes yet.</p>}
        </Card>
        <ProfileKudos employeeUuid={p.uuid} name={p.full_name} />
      </div>
      <div className="space-y-5">
        <Card title="Reporting">
          <div className="space-y-3">
            <div><p className="mb-1.5 text-[12px] uppercase tracking-[0.06em] text-faint">Manager</p><PersonLink p={p.reporting_manager} onOpen={onOpenPerson} /></div>
            {p.secondary_manager && <div><p className="mb-1.5 text-[12px] uppercase tracking-[0.06em] text-faint">Secondary manager</p><PersonLink p={p.secondary_manager} onOpen={onOpenPerson} /></div>}
            <div>
              <p className="mb-1.5 text-[12px] uppercase tracking-[0.06em] text-faint">Direct reports · {p.reportees.length}</p>
              {p.reportees.length ? <div className="space-y-0.5">{p.reportees.slice(0, 6).map((r) => <PersonLink key={r.uuid} p={r} onOpen={onOpenPerson} />)}{p.reportees.length > 6 && <p className="pt-1 text-[12.5px] text-muted">and {p.reportees.length - 6} more</p>}</div> : <p className="text-[13.5px] text-muted">No one reports to them.</p>}
            </div>
          </div>
        </Card>
        <Card title="Teams">
          {p.teams.length ? <ul className="space-y-2">{p.teams.map((t) => <li key={t.id} className="flex items-center gap-2 text-[14px] text-ink"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: t.color || "#6366f1" }} />{t.name}{t.is_lead && <Badge tone="accent">Lead</Badge>}</li>)}</ul> : <p className="text-[13.5px] text-muted">Not in a team.</p>}
        </Card>
        {p.date_of_birth && <Card title="Celebrations"><div className="space-y-2 text-[13.5px] text-muted"><Fact icon={Cake}>Birthday {day(p.date_of_birth)?.replace(/\s\d{4}$/, "")}</Fact>{p.date_of_joining && <div><Fact icon={ShieldCheck}>Work anniversary {day(p.date_of_joining)?.replace(/\s\d{4}$/, "")}</Fact></div>}</div></Card>}
      </div>
    </div>
  );

  const editBtn = (t: EditTab) => canEdit ? <button type="button" onClick={() => setEdit({ open: true, tab: t })} className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline"><Pencil size={13} strokeWidth={1.4} /> Edit</button>
    : isSelf ? <button type="button" onClick={() => setRequest({ open: true, key: Date.now() })} className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline"><Send size={13} strokeWidth={1.4} /> Request a change</button> : undefined;

  const job = (
    <div className="space-y-5">
      <Card title="Position" action={editBtn("job")}>
        <KeyValue columns={3} items={[
          { label: "Designation", value: p.designation_name }, { label: "Department", value: p.department_name }, { label: "Grade", value: p.grade_name },
          { label: "Legal entity", value: p.legal_entity_name }, { label: "Location", value: p.location_name ? `${p.location_name}${p.location_city ? `, ${p.location_city}` : ""}` : null },
          { label: "Cost centre", value: p.cost_centre_name }, { label: "Employment type", value: p.employment_type_name }, { label: "Work mode", value: p.work_mode_label },
          { label: "Timezone", value: p.timezone ? p.timezone.replace(/_/g, " ") : "Same as company" },
        ]} />
      </Card>
      <Card title="Dates" action={editBtn("job")}>
        <KeyValue columns={3} items={[
          { label: "Stage", value: <Badge tone={st.tone} dot>{st.label}</Badge> }, { label: "Date of joining", value: day(p.date_of_joining) },
          { label: "Probation ends", value: day(p.probation_end_date) }, { label: "Confirmed on", value: day(p.confirmation_date) },
          { label: "Notice period", value: p.notice_period_days != null ? `${p.notice_period_days} days` : null },
          { label: "Resigned on", value: day(p.resignation_date) }, { label: "Last working day", value: day(p.exit_date) },
          { label: "Access", value: { admin: "HR admin", hr: "HR", manager: "Manager", employee: "Employee" }[p.role] ?? p.role },
        ]} />
      </Card>
      <Card title="Reporting line" action={editBtn("job")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><p className="mb-1.5 text-[12px] uppercase tracking-[0.06em] text-faint">Reporting manager</p><PersonLink p={p.reporting_manager} onOpen={onOpenPerson} /></div>
          <div><p className="mb-1.5 text-[12px] uppercase tracking-[0.06em] text-faint">Secondary manager</p><PersonLink p={p.secondary_manager} onOpen={onOpenPerson} /></div>
        </div>
      </Card>
      {hasCustomFields(layout) && <Card title="More details" action={editBtn("job")}><CustomFields entity="employee" mode="view" layout={layout} values={p.custom} /></Card>}
    </div>
  );

  const personal = (
    <div className="space-y-5">
      <Card title="Personal details" action={editBtn("personal")}>
        <KeyValue columns={3} items={[
          { label: "Full name", value: [p.greeting, p.first_name, p.middle_name, p.last_name].filter(Boolean).join(" ") }, { label: "Preferred name", value: p.preferred_name },
          { label: "Gender", value: p.gender_name }, { label: "Date of birth", value: day(p.date_of_birth) }, { label: "Marital status", value: p.marital_status_name },
          { label: "Marriage date", value: day(p.marriage_date) }, { label: "Blood group", value: p.blood_group_name }, { label: "Nationality", value: p.nationality_name },
          { label: "Father's name", value: p.father_name }, { label: "Spouse's name", value: p.spouse_name },
        ]} />
      </Card>
      <Card title="Contact" action={canEdit ? editBtn("contact") : isSelf ? <button type="button" onClick={() => setMine({ open: true, key: Date.now() })} className="inline-flex items-center gap-1 text-[13px] text-primary hover:underline"><Pencil size={13} strokeWidth={1.4} /> Edit</button> : undefined}>
        <KeyValue columns={3} items={[
          { label: "Work email", value: p.email }, { label: "Personal email", value: p.personal_email }, { label: "Mobile", value: p.phone },
          { label: "Alternate phone", value: p.alternate_phone }, { label: "Work phone", value: p.work_phone }, { label: "Extension", value: p.extension },
          { label: "Current address", value: addressText(p.current_address), span: 3 }, { label: "Permanent address", value: addressText(p.permanent_address), span: 3 },
        ]} />
      </Card>
      <DetailList kind="emergency-contacts" employeeUuid={p.uuid} rows={p.emergency_contacts} canEdit={canEdit || isSelf} onChanged={changed} />
    </div>
  );

  const family = (
    <div className="space-y-5">
      <DetailList kind="family" employeeUuid={p.uuid} rows={p.family} canEdit={canEdit || isSelf} onChanged={changed} />
      <DetailList kind="nominees" employeeUuid={p.uuid} rows={p.nominees} canEdit={canEdit} onChanged={changed} familyRows={p.family}
        footnote={<NomineeTotals totals={p.nominee_totals} />} />
    </div>
  );

  const bank = (
    <div className="space-y-5">
      <Card title="Government IDs" action={editBtn("ids")}>
        <KeyValue columns={3} items={[
          { label: "PAN", value: p.pan && <span className="font-mono">{p.pan}</span> },
          { label: "Aadhaar", value: p.has_aadhaar ? <span className="flex items-center gap-2 font-mono">{aadhaar ?? p.aadhaar_masked}{perms.sensitive && !aadhaar && <button type="button" onClick={revealAadhaar} title="Show the full number (logged)" className="text-muted hover:text-ink"><Eye size={14} strokeWidth={1.4} /></button>}</span> : null },
          { label: "UAN", value: p.uan && <span className="font-mono">{p.uan}</span> }, { label: "ESI number", value: p.esi_number && <span className="font-mono">{p.esi_number}</span> },
          { label: "Passport", value: p.passport_number ? <span><span className="font-mono">{p.passport_number}</span>{p.passport_expiry && <span className="text-muted"> · till {day(p.passport_expiry)}</span>}</span> : null },
          { label: "Driving licence", value: p.driving_licence ? <span><span className="font-mono">{p.driving_licence}</span>{p.driving_licence_expiry && <span className="text-muted"> · till {day(p.driving_licence_expiry)}</span>}</span> : null },
        ]} />
        {!perms.sensitive && !isSelf && <p className="mt-4 text-[12.5px] text-faint">Some numbers are hidden. Ask an HR admin for access.</p>}
      </Card>
      <DetailList kind="bank-accounts" employeeUuid={p.uuid} rows={p.bank_accounts} canEdit={canEdit} canVerify={canEdit && perms.sensitive} onChanged={changed}
        footnote={isSelf && !canEdit ? <span>To change your bank account, <button type="button" onClick={() => setRequest({ open: true, key: Date.now() })} className="text-primary hover:underline">send a change request</button>. HR checks it first.</span> : undefined} />
    </div>
  );

  const background = (
    <div className="space-y-5">
      <DetailList kind="education" employeeUuid={p.uuid} rows={p.education} canEdit={canEdit || isSelf} onChanged={changed} />
      <DetailList kind="experience" employeeUuid={p.uuid} rows={p.experience} canEdit={canEdit || isSelf} onChanged={changed}
        footnote={`Relevant experience before joining: ${years(p.previous_experience_years) ?? "none"}. Income and tax from an earlier employer this year are used for TDS.`} />
    </div>
  );

  const assets = (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-14 text-center">
      <Laptop size={26} strokeWidth={1.2} className="mb-3 text-faint" />
      <p className="text-[14.5px] text-ink">Assets will show here</p>
      <p className="mt-1 max-w-sm text-[13.5px] text-muted">Laptops, phones and ID cards given to {p.first_name} appear once the assets register is set up.</p>
    </div>
  );

  const body: Record<Tab, ReactNode> = {
    overview, job, personal, family,
    documents: <DocumentsPanel employeeUuid={p.uuid} docs={p.documents} canEdit={canEdit} canVerify={perms.can_verify} canUpload={isSelf} onChanged={changed} />,
    bank, background,
    skills: <div className="space-y-5"><SkillsPanel employeeUuid={p.uuid} skills={p.skills} canAdd={canEdit || isSelf} canVerify={canEdit} onChanged={changed} /><TagsPanel profile={p} canEdit={canEdit} onChanged={changed} /></div>,
    history: <HistoryPanel profile={p} canEdit={canEdit} onChanged={changed} />,
    assets,
  };

  return (
    <div className={compact ? "" : ""}>
      {header}
      <Tabs value={tab} onChange={setTab} items={TABS.map((t) => ({ ...t, count: t.value === "documents" && pendingDocs && canEdit ? pendingDocs : undefined }))} className="mb-5 mt-4" />
      {body[tab]}

      <EmployeeEditModal open={edit.open} profile={p} initialTab={edit.tab} onClose={() => setEdit((e) => ({ ...e, open: false }))} onSaved={changed} />
      <StageModal key={`s${stage.key}`} open={stage.open} profile={p} target={stage.target} onClose={() => setStage((s) => ({ ...s, open: false }))} onSaved={() => { setStage((s) => ({ ...s, open: false })); changed(); }} />
      <RehireModal key={`r${rehire.key}`} open={rehire.open} profile={p} onClose={() => setRehire((s) => ({ ...s, open: false }))} onSaved={() => { setRehire((s) => ({ ...s, open: false })); changed(); }} />
      <JobChangeModal key={`c${change.key}`} open={change.open} profile={p} onClose={() => setChange((s) => ({ ...s, open: false }))} onSaved={() => { setChange((s) => ({ ...s, open: false })); changed(); }} />
      {isSelf && <MyDetailsModal key={`m${mine.key}`} open={mine.open} profile={p} onClose={() => setMine((s) => ({ ...s, open: false }))} onSaved={() => { setMine((s) => ({ ...s, open: false })); changed(); }} />}
      {isSelf && <SensitiveChangeModal key={`q${request.key}`} open={request.open} profile={p} onClose={() => setRequest((s) => ({ ...s, open: false }))} onSent={() => { setRequest((s) => ({ ...s, open: false })); changed(); }} />}
    </div>
  );
}

/** Details an employee changes directly (no approval): preferred name, personal email, alternate phone, blood group, addresses. */
function MyDetailsModal({ open, profile, onClose, onSaved }: { open: boolean; profile: Profile; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const a = (x: Profile["current_address"]) => ({ line1: x.line1 ?? "", line2: x.line2 ?? "", city: x.city ?? "", state_id: x.state_id ?? null, pincode: x.pincode ?? "" });
  const initial = { preferred_name: profile.preferred_name ?? "", personal_email: profile.personal_email ?? "", alternate_phone: profile.alternate_phone ?? "",
    blood_group_id: profile.blood_group_id, current_address: a(profile.current_address), permanent_address: a(profile.permanent_address) };
  const [v, setV] = useState(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  async function save() {
    setSaving(true);
    try {
      const clean = (x: typeof v.current_address) => ({ line1: x.line1 || null, line2: x.line2 || null, city: x.city || null, state_id: x.state_id, pincode: x.pincode || null });
      await api.put("/me/profile/personal", { preferred_name: v.preferred_name || null, personal_email: v.personal_email || null, alternate_phone: v.alternate_phone || null,
        blood_group_id: v.blood_group_id, current_address: clean(v.current_address), permanent_address: clean(v.permanent_address) });
      toast.success("Your details are saved");
      onSaved();
    } catch (e) { toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined }); } finally { setSaving(false); }
  }
  const addr = (k: "current_address" | "permanent_address", label: string) => (
    <div className="sm:col-span-2">
      <p className="mb-3 text-[13px] text-muted">{label}</p>
      <FormGrid columns={3}>
        <Field label="House, building" className="sm:col-span-2"><TextInput value={v[k].line1} onValueChange={(x) => setV({ ...v, [k]: { ...v[k], line1: x } })} /></Field>
        <Field label="Area, street"><TextInput value={v[k].line2} onValueChange={(x) => setV({ ...v, [k]: { ...v[k], line2: x } })} /></Field>
        <Field label="City"><TextInput value={v[k].city} onValueChange={(x) => setV({ ...v, [k]: { ...v[k], city: x } })} /></Field>
        <Field label="State"><MasterSelect type="state" value={v[k].state_id} onChange={(x) => setV({ ...v, [k]: { ...v[k], state_id: x } })} clearable /></Field>
        <Field label="PIN code"><TextInput value={v[k].pincode} onValueChange={(x) => setV({ ...v, [k]: { ...v[k], pincode: x.replace(/\D/g, "").slice(0, 6) } })} inputMode="numeric" /></Field>
      </FormGrid>
    </div>
  );
  return (
    <Modal open={open} onClose={onClose} size="xl" dirty={dirty} busy={saving} title="Edit my details"
      description="These change straight away and are recorded. Name, date of birth, IDs and bank details need a change request."
      footer={<><ModalCancel /><Button variant="primary" onClick={save} loading={saving} disabled={!dirty}>Save</Button></>}>
      <FormGrid>
        <Field label="Preferred name"><TextInput value={v.preferred_name} onValueChange={(x) => setV({ ...v, preferred_name: x })} /></Field>
        <Field label="Personal email"><TextInput type="email" value={v.personal_email} onValueChange={(x) => setV({ ...v, personal_email: x })} /></Field>
        <Field label="Alternate phone"><TextInput type="tel" value={v.alternate_phone} onValueChange={(x) => setV({ ...v, alternate_phone: x })} /></Field>
        <Field label="Blood group"><MasterSelect type="blood_group" value={v.blood_group_id} onChange={(x) => setV({ ...v, blood_group_id: x })} clearable /></Field>
        {addr("current_address", "Current address")}
        {addr("permanent_address", "Permanent address")}
      </FormGrid>
    </Modal>
  );
}

