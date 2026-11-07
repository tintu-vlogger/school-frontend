"use client";

/*
 * Visitors & gate pass: the visitor log at the gate (sign in / sign out) and early pickup
 * gate passes, issued only to guardians allowed to pick the learner up.
 */
import { useState } from "react";
import { Camera, CheckCircle2, DoorClosed, DoorOpen, Eye, LogOut, Plus, ShieldCheck, ShieldX, UserCheck, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime, formatTime, todayISO } from "@/lib/datetime";
import { useUrlTab } from "@/lib/use-url-tab";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, DateInput, Field, FileDrop, FilterBar, FormGrid, KeyValue, Modal, ModalCancel, NumberInput, Select,
  Skeleton, StatCard, Tabs, TextInput, Textarea, Toggle, type Column, type FilterValues,
} from "@/components/ui-kit";
import { STROKE, StudentCell, errMsg, fileToSmallDataUrl, qs, searchStaff, searchStudents, useGet, usePaged } from "@/components/wellbeing/common";

type Visitor = {
  uuid: string; pass_no: string | null; name: string; phone: string | null; company_name: string | null; purpose: string;
  person_to_meet: string | null; employee_name: string | null; student_name: string | null; id_kind: string | null; id_number: string | null;
  photo_url: string | null; vehicle_no: string | null; people_count: number; in_at: string; out_at: string | null; logged_by: string | null; notes: string | null;
};
type Pass = {
  uuid: string; pass_no: string | null; student_id: number; student_name: string; section_label: string | null; admission_no: string; photo_url: string | null;
  guardian_name: string; guardian_phone: string | null; reason: string; out_at: string; returning: boolean; returned_at: string | null;
  issued_by: string | null; status: string; notes: string | null;
};
type Pickups = { student_name: string; section_label: string | null; guardians: { guardian_id: number; name: string; relation: string; phone: string | null; photo_url: string | null; can_pickup: boolean }[] };

const TABS = ["visitors", "passes"] as const;
type Tab = (typeof TABS)[number];
const ID_KINDS = ["Aadhaar", "Driving licence", "Voter ID", "PAN card", "Passport", "Company ID", "Other"].map((x) => ({ value: x, label: x }));

export default function VisitorsPage() {
  const access = useAccess();
  const canRecord = access.can("wellbeing.manage", "wellbeing.record");
  const [tab, setTab] = useState<Tab>("visitors");
  useUrlTab(TABS, setTab);
  const summary = useGet<{ visitors_today: number; visitors_inside: number; gate_passes_today: number }>("/wellbeing/summary");
  const [signIn, setSignIn] = useState(false);
  const [issue, setIssue] = useState(false);
  const [key, setKey] = useState(0);
  const [nonce, setNonce] = useState(0);
  const done = () => { setNonce((n) => n + 1); summary.refresh(); };
  return (
    <div>
      <PageHeader eyebrow="Wellbeing" title="Visitors & gate pass" description="Who is on campus right now, and early pickups checked against the people allowed to collect."
        actions={canRecord ? <>
          <Button icon={UserCheck} onClick={() => { setKey((k) => k + 1); setIssue(true); }}>Early pickup</Button>
          <Button variant="primary" icon={Plus} onClick={() => { setKey((k) => k + 1); setSignIn(true); }}>Sign in visitor</Button>
        </> : undefined} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard label="Visitors today" value={summary.data?.visitors_today ?? "–"} icon={Users} />
        <StatCard label="On campus now" value={summary.data?.visitors_inside ?? "–"} icon={DoorOpen} />
        <StatCard label="Early pickups today" value={summary.data?.gate_passes_today ?? "–"} icon={UserCheck} />
      </div>
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[{ value: "visitors", label: "Visitor log", icon: DoorClosed }, { value: "passes", label: "Gate passes", icon: UserCheck }]} />
      {tab === "visitors" && <VisitorLog key={`v${nonce}`} canRecord={canRecord} onChanged={() => summary.refresh()} />}
      {tab === "passes" && <PassLog key={`p${nonce}`} canRecord={canRecord} />}
      {signIn && <SignInModal key={`s${key}`} onClose={() => setSignIn(false)} onSaved={() => { setSignIn(false); setTab("visitors"); done(); }} />}
      {issue && <PassModal key={`i${key}`} onClose={() => setIssue(false)} onSaved={() => { setIssue(false); setTab("passes"); done(); }} />}
    </div>
  );
}

function VisitorLog({ canRecord, onChanged }: { canRecord: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [day, setDay] = useState(todayISO());
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const inside = filters.inside?.[0] === "yes";
  const list = usePaged<Visitor>(`/wellbeing/visitors${qs({ q, page, size, day: inside ? null : day, inside })}`);
  const [viewing, setViewing] = useState<Visitor | null>(null);
  async function out(v: Visitor) {
    try { await api.post(`/wellbeing/visitors/${v.uuid}/out`); toast.success(`${v.name} signed out`); setViewing(null); list.refresh(); onChanged(); }
    catch (e) { toast.error("Couldn't sign out", { description: errMsg(e) }); }
  }
  const columns: Column<Visitor>[] = [
    { key: "name", header: "Visitor", cell: (v) => (
      <div className="flex min-w-0 items-center gap-3"><Avatar name={v.name} src={v.photo_url} size={32} />
        <div className="min-w-0"><p className="truncate text-ink">{v.name}{v.people_count > 1 && <span className="text-muted"> +{v.people_count - 1}</span>}</p>
          <p className="truncate text-[12.5px] text-muted">{[v.company_name, v.phone].filter(Boolean).join(" · ")}</p></div></div>) },
    { key: "purpose", header: "Purpose", cell: (v) => <div><p className="text-ink/90">{v.purpose}</p>{v.person_to_meet && <p className="text-[12.5px] text-muted">To meet {v.person_to_meet}</p>}</div> },
    { key: "in", header: "In", hideBelow: "sm", cell: (v) => <span className="tabular text-muted">{inside ? formatDateTime(v.in_at) : formatTime(v.in_at)}</span> },
    { key: "out", header: "Out", cell: (v) => v.out_at ? <span className="tabular text-muted">{formatTime(v.out_at)}</span> : <Badge tone="good" dot>On campus</Badge> },
    { key: "pass", header: "Pass", hideBelow: "lg", cell: (v) => <span className="font-mono text-[12.5px] text-muted">{v.pass_no || "—"}</span> },
  ];
  return (
    <>
      <FilterBar searchPlaceholder="Search name, phone or pass" onSearchChange={(x) => { setQ(x); setPage(1); }}
        filters={[{ key: "inside", label: "Show", options: [{ value: "yes", label: "On campus now" }] }]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={!inside && <div className="w-[160px]"><DateInput value={day} onChange={(x) => { setDay(x || todayISO()); setPage(1); }} max={todayISO()} /></div>} />
      <DataTable rows={list.rows} rowKey={(v) => v.uuid} columns={columns} loading={list.loading} onRowClick={setViewing}
        rowActions={(v) => [{ label: "View", icon: Eye, onSelect: () => setViewing(v) }, ...(canRecord && !v.out_at ? [{ label: "Sign out", icon: LogOut, onSelect: () => out(v) }] : [])]}
        pagination={{ page, size, total: list.total, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={DoorClosed} emptyTitle={inside ? "Nobody is on campus" : day === todayISO() ? "No visitors yet today" : `No visitors on ${formatDate(day)}`}
        emptyHint="Sign visitors in at the gate; they show here until they leave." />
      <Modal open={!!viewing} onClose={() => setViewing(null)} size="md" title={viewing?.name} description={viewing?.pass_no ? `Pass ${viewing.pass_no}` : undefined}
        leading={viewing && <Avatar name={viewing.name} src={viewing.photo_url} size={44} />}
        footer={viewing && canRecord && !viewing.out_at && <Button variant="primary" icon={LogOut} onClick={() => out(viewing)}>Sign out</Button>}>
        {viewing && (
          <>
            {viewing.photo_url && <img src={viewing.photo_url} alt="" className="mb-5 h-40 rounded-xl border border-line object-cover" />}
            <KeyValue items={[
              { label: "Purpose", value: viewing.purpose }, { label: "To meet", value: viewing.person_to_meet },
              { label: "Phone", value: viewing.phone }, { label: "From", value: viewing.company_name },
              { label: "ID", value: viewing.id_kind ? `${viewing.id_kind}${viewing.id_number ? ` · ${viewing.id_number}` : ""}` : null },
              { label: "Vehicle", value: viewing.vehicle_no }, { label: "People", value: viewing.people_count },
              { label: "Learner", value: viewing.student_name },
              { label: "In", value: formatDateTime(viewing.in_at) }, { label: "Out", value: viewing.out_at ? formatDateTime(viewing.out_at) : "Still on campus" },
              { label: "Signed in by", value: viewing.logged_by }, { label: "Notes", value: viewing.notes, span: 2 },
            ]} />
          </>
        )}
      </Modal>
    </>
  );
}

function SignInModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [v, setV] = useState({ name: "", phone: "", from: "", purpose: "", staff: null as number | null, meet: "", student: null as number | null,
    id_kind: null as string | null, id_number: "", vehicle: "", people: 1 as number | null, notes: "" });
  const [photo, setPhoto] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [err, setErr] = useState<{ name?: string; purpose?: string }>({});
  const [saving, setSaving] = useState(false);
  async function pick(list: File[]) {
    setFiles(list);
    if (!list[0]) { setPhoto(null); return; }
    try { setPhoto(await fileToSmallDataUrl(list[0])); } catch { toast.error("Couldn't read the photo"); }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = { name: v.name.trim() ? undefined : "Enter the visitor's name", purpose: v.purpose.trim() ? undefined : "Say why they are here" };
    if (errs.name || errs.purpose) { setErr(errs); return; }
    setSaving(true);
    try {
      const r = await api.post<Visitor>("/wellbeing/visitors", {
        name: v.name.trim(), phone: v.phone || null, company_name: v.from || null, purpose: v.purpose.trim(), employee_id: v.staff,
        person_to_meet: v.staff ? null : v.meet || null, student_id: v.student, id_kind: v.id_kind, id_number: v.id_number || null,
        photo_url: photo, vehicle_no: v.vehicle || null, people_count: v.people || 1, notes: v.notes || null,
      });
      toast.success(`${r.name} signed in`, { description: r.pass_no ? `Pass ${r.pass_no}` : undefined });
      onSaved();
    } catch (e2) { toast.error("Couldn't sign in the visitor", { description: errMsg(e2) }); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="lg" busy={saving} dirty={!!v.name || !!v.purpose} title="Sign in visitor"
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="visitor-form" loading={saving}>Sign in</Button></>}>
      <form id="visitor-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Name" required error={err.name}><TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setErr({ ...err, name: undefined }); }} /></Field>
          <Field label="Phone"><TextInput value={v.phone} onValueChange={(x) => setV({ ...v, phone: x })} inputMode="tel" /></Field>
          <Field label="Purpose" required error={err.purpose}><TextInput value={v.purpose} onValueChange={(x) => { setV({ ...v, purpose: x }); setErr({ ...err, purpose: undefined }); }} placeholder="e.g. Meeting, delivery" /></Field>
          <Field label="From" aside="Optional"><TextInput value={v.from} onValueChange={(x) => setV({ ...v, from: x })} placeholder="Company or organisation" /></Field>
          <Field label="Staff member to meet" aside="Optional" hint="They get a notification.">
            <Select value={v.staff} onChange={(x) => setV({ ...v, staff: x })} loadOptions={searchStaff} clearable placeholder="Search staff" />
          </Field>
          <Field label="Or someone else" aside="Optional"><TextInput value={v.meet} disabled={!!v.staff} onValueChange={(x) => setV({ ...v, meet: x })} placeholder="e.g. Accounts office" /></Field>
          <Field label={`${term("student")} visited`} aside="Optional" className="sm:col-span-2">
            <Select value={v.student} onChange={(x) => setV({ ...v, student: x })} loadOptions={searchStudents} clearable placeholder="Search by name" />
          </Field>
          <Field label="ID shown"><Select value={v.id_kind} onChange={(x) => setV({ ...v, id_kind: x })} options={ID_KINDS} clearable placeholder="Pick ID type" /></Field>
          <Field label="ID number" hint="The last 4 digits are enough."><TextInput value={v.id_number} onValueChange={(x) => setV({ ...v, id_number: x })} /></Field>
          <Field label="Vehicle number" aside="Optional"><TextInput value={v.vehicle} onValueChange={(x) => setV({ ...v, vehicle: x.toUpperCase() })} /></Field>
          <Field label="People in the group"><NumberInput value={v.people} onChange={(x) => setV({ ...v, people: x })} min={1} max={50} /></Field>
          <Field label="Photo" aside="Optional" className="sm:col-span-2">
            <div className="flex items-start gap-4">
              <FileDrop value={files} onChange={pick} accept="image/*" maxSizeMb={8} title="Take or drop a photo" hint="On a phone this opens the camera." className="flex-1" />
              {photo ? <img src={photo} alt="" className="h-24 w-24 rounded-xl border border-line object-cover" />
                : <span className="flex h-24 w-24 items-center justify-center rounded-xl border border-dashed border-line-strong text-faint"><Camera size={22} strokeWidth={STROKE} /></span>}
            </div>
          </Field>
          <Field label="Notes" aside="Optional" className="sm:col-span-2"><Textarea value={v.notes} onValueChange={(x) => setV({ ...v, notes: x })} rows={2} /></Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Gate passes ───────────────────────────────────────────────────── */

function PassLog({ canRecord }: { canRecord: boolean }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [q, setQ] = useState("");
  const [day, setDay] = useState(todayISO());
  const [page, setPage] = useState(1);
  const list = usePaged<Pass>(`/wellbeing/gate-passes${qs({ q, page, size: 25, day })}`);
  const [viewing, setViewing] = useState<Pass | null>(null);
  async function back(p: Pass) {
    try { await api.post(`/wellbeing/gate-passes/${p.uuid}/returned`); toast.success(`${p.student_name} is back`); setViewing(null); list.refresh(); }
    catch (e) { toast.error("Couldn't update", { description: errMsg(e) }); }
  }
  const columns: Column<Pass>[] = [
    { key: "who", header: term("student"), cell: (p) => <StudentCell row={p} /> },
    { key: "by", header: "Picked up by", cell: (p) => <div><p className="text-ink/90">{p.guardian_name}</p>{p.guardian_phone && <p className="text-[12.5px] text-muted">{p.guardian_phone}</p>}</div> },
    { key: "reason", header: "Reason", hideBelow: "md", cell: (p) => <span className="text-muted">{p.reason}</span> },
    { key: "out", header: "Left at", hideBelow: "sm", cell: (p) => <span className="tabular text-muted">{formatTime(p.out_at)}</span> },
    { key: "status", header: "Status", cell: (p) => p.status === "returned" ? <Badge tone="neutral" dot>Back {p.returned_at ? formatTime(p.returned_at) : ""}</Badge>
      : <Badge tone={p.returning ? "warn" : "info"} dot>{p.returning ? "Out, returning" : "Gone home"}</Badge> },
  ];
  return (
    <>
      <FilterBar searchPlaceholder="Search name or pass" onSearchChange={(x) => { setQ(x); setPage(1); }}
        actions={<div className="w-[160px]"><DateInput value={day} onChange={(x) => { setDay(x || todayISO()); setPage(1); }} max={todayISO()} /></div>} />
      <DataTable rows={list.rows} rowKey={(p) => p.uuid} columns={columns} loading={list.loading} onRowClick={setViewing}
        rowActions={(p) => [{ label: "View", icon: Eye, onSelect: () => setViewing(p) }, ...(canRecord && p.status === "issued" && p.returning ? [{ label: "Mark back", icon: CheckCircle2, onSelect: () => back(p) }] : [])]}
        pagination={{ page, size: 25, total: list.total, onPageChange: setPage }}
        emptyIcon={UserCheck} emptyTitle={day === todayISO() ? "No early pickups today" : `No early pickups on ${formatDate(day)}`}
        emptyHint={`Issue a pass when a ${term("guardian").toLowerCase()} collects a ${term("student").toLowerCase()} early; only allowed people can be picked.`} />
      <Modal open={!!viewing} onClose={() => setViewing(null)} size="md" title={viewing ? `Gate pass ${viewing.pass_no ?? ""}` : ""} description={viewing?.student_name}
        footer={viewing && canRecord && viewing.status === "issued" && viewing.returning && <Button variant="primary" icon={CheckCircle2} onClick={() => back(viewing)}>Mark back</Button>}>
        {viewing && <KeyValue items={[
          { label: term("student"), value: viewing.student_name }, { label: term("section"), value: viewing.section_label },
          { label: "Picked up by", value: viewing.guardian_name }, { label: "Phone", value: viewing.guardian_phone },
          { label: "Reason", value: viewing.reason, span: 2 }, { label: "Left at", value: formatDateTime(viewing.out_at) },
          { label: "Coming back", value: viewing.returning ? "Yes" : "No" }, { label: "Back at", value: viewing.returned_at ? formatDateTime(viewing.returned_at) : null },
          { label: "Issued by", value: viewing.issued_by }, { label: "Notes", value: viewing.notes, span: 2 },
        ]} />}
      </Modal>
    </>
  );
}

function PassModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [student, setStudent] = useState<number | null>(null);
  const [guardian, setGuardian] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [returning, setReturning] = useState(false);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState<{ guardian?: string; reason?: string }>({});
  const [saving, setSaving] = useState(false);
  const people = useGet<Pickups>(student ? `/wellbeing/pickups/${student}` : null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = { guardian: guardian ? undefined : "Pick who is collecting", reason: reason.trim().length > 1 ? undefined : "Give a reason" };
    if (errs.guardian || errs.reason) { setErr(errs); return; }
    setSaving(true);
    try {
      const p = await api.post<Pass>("/wellbeing/gate-passes", { student_id: student, guardian_id: guardian, reason: reason.trim(), returning, notes: notes || null });
      toast.success("Gate pass issued", { description: `${p.pass_no ?? ""} · the ${term("guardians").toLowerCase()} have been told.` });
      onSaved();
    } catch (e2) { toast.error("Pass refused", { description: errMsg(e2) }); } finally { setSaving(false); }
  }
  const guardians = people.data?.guardians ?? [];
  return (
    <Modal open onClose={onClose} size="md" busy={saving} dirty={!!student} title="Early pickup gate pass"
      description={`Only people marked as allowed to pick up the ${term("student").toLowerCase()} can be chosen. Check their ID.`}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="pass-form" loading={saving} disabled={!guardian}>Issue pass</Button></>}>
      <form id="pass-form" onSubmit={submit} noValidate className="space-y-5">
        <Field label={term("student")} required>
          <Select value={student} onChange={(x) => { setStudent(x); setGuardian(null); }} loadOptions={searchStudents} placeholder="Search by name or admission no." />
        </Field>
        {student && (
          <Field label="Collected by" required error={err.guardian}>
            {people.loading ? <Skeleton className="h-16 w-full" /> : guardians.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line-strong px-4 py-4 text-[13.5px] text-muted">No {term("guardians").toLowerCase()} are linked to this {term("student").toLowerCase()}. Add them on the profile first.</p>
            ) : (
              <ul className="space-y-2">
                {guardians.map((g) => {
                  const on = guardian === g.guardian_id;
                  return (
                    <li key={g.guardian_id}>
                      <button type="button" disabled={!g.can_pickup} onClick={() => { setGuardian(g.guardian_id); setErr({ ...err, guardian: undefined }); }}
                        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${!g.can_pickup ? "cursor-not-allowed border-rose-200 bg-rose-50/40" : on ? "border-primary bg-primary-soft/40" : "border-line hover:border-line-strong"}`}>
                        <Avatar name={g.name} src={g.photo_url} size={36} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] text-ink">{g.name} <span className="text-muted">· {g.relation}</span></span>
                          <span className="block text-[12.5px] text-muted">{g.phone || "No phone"}</span>
                        </span>
                        {g.can_pickup ? <span className="flex items-center gap-1 text-[12.5px] text-emerald-700"><ShieldCheck size={15} strokeWidth={STROKE} />Allowed</span>
                          : <span className="flex items-center gap-1 text-[12.5px] text-rose-700"><ShieldX size={15} strokeWidth={STROKE} />Not allowed to pick up</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Field>
        )}
        <Field label="Reason" required error={err.reason}><TextInput value={reason} onValueChange={(x) => { setReason(x); setErr({ ...err, reason: undefined }); }} placeholder="e.g. Doctor's appointment" /></Field>
        <Toggle checked={returning} onChange={setReturning} label="Coming back today" description="Mark them back when they return." />
        <Field label="Notes" aside="Optional"><Textarea value={notes} onValueChange={setNotes} rows={2} /></Field>
      </form>
    </Modal>
  );
}
