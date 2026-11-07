"use client";

/*
 * Internal job marketplace modals.
 *
 *   <PostingForm open posting onClose onSaved />          job or gig (from a hiring request or a position, or on its own)
 *   <PostingDetail uuid onClose onChanged onEdit />        details and apply; for HR / hiring manager: applications and suggestions
 *   <PostingCard posting onOpen />                         a card for the browse grid
 */
import { useEffect, useState } from "react";
import { Ban, Briefcase, CalendarClock, CheckCircle2, Clock, Hammer, Lock, MapPin, Pencil, Send, Sparkles, Undo2, Unlock, Users } from "lucide-react";
import { api } from "@/lib/api";
import { todayISO } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, DateInput, Field, FormGrid, FormSection, Modal, ModalCancel, NumberInput, RadioCards, Select, Skeleton, Tabs, TextInput,
  Textarea, Toggle, formatDisplayDate, useConfirm, type SelectOption,
} from "@/components/ui-kit";
import { lookupEmployees, useOrgOptions } from "@/components/people/hooks";
import { MatchPill, PersonCell, PositionPicker, SkillList, SkillsEditor, StatusBadge } from "./shared";
import { TalentChip } from "./succession-modals";
import type { Application, Posting, SkillReq } from "./types";

const WORK_MODES = [{ value: "office", label: "Office" }, { value: "hybrid", label: "Hybrid" }, { value: "remote", label: "Remote" }];

export function PostingCard({ p, onOpen }: { p: Posting; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex flex-col rounded-2xl border border-line bg-surface p-5 text-left transition-colors hover:border-line-strong">
      <div className="mb-2 flex items-start justify-between gap-2">
        <Badge tone={p.kind === "gig" ? "info" : "accent"}>{p.kind === "gig" ? "Gig" : "Job"}</Badge>
        {p.my_application ? <StatusBadge status={p.my_application.status} label={p.my_application.status_label} /> : <MatchPill score={p.my_match} />}
      </div>
      <p className="text-[15.5px] text-ink">{p.title}</p>
      <p className="mt-0.5 text-[12.5px] text-faint">{[p.department, p.designation].filter(Boolean).join(" · ") || "Across teams"}</p>
      {p.description && <p className="mt-3 line-clamp-2 text-[13px] text-muted">{p.description}</p>}
      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-4 text-[12.5px] text-muted">
        {p.kind === "gig" && <span className="inline-flex items-center gap-1"><Clock size={13} strokeWidth={1.4} />{p.duration_weeks} weeks · {p.hours_per_week} h/week</span>}
        {p.location && <span className="inline-flex items-center gap-1"><MapPin size={13} strokeWidth={1.4} />{p.location}</span>}
        {p.work_mode_label && <span>{p.work_mode_label}</span>}
        {p.closes_on && <span className={`inline-flex items-center gap-1 ${p.closing_soon ? "text-amber-700" : ""}`}><CalendarClock size={13} strokeWidth={1.4} />Closes {formatDisplayDate(p.closes_on)}</span>}
      </div>
    </button>
  );
}

type Draft = {
  kind: "job" | "gig"; source: "none" | "requisition" | "position"; requisition_uuid: string | null; position_uuid: string | null;
  title: string; description: string; department_id: number | null; designation_id: number | null; location_id: number | null;
  skills: SkillReq[]; openings: number | null; duration_weeks: number | null; hours_per_week: number | null; work_mode: string | null;
  starts_on: string; closes_on: string; hiring_manager_id: number | null; needs_manager_consent: boolean;
};
const EMPTY: Draft = {
  kind: "job", source: "none", requisition_uuid: null, position_uuid: null, title: "", description: "", department_id: null,
  designation_id: null, location_id: null, skills: [], openings: 1, duration_weeks: null, hours_per_week: null, work_mode: null,
  starts_on: "", closes_on: "", hiring_manager_id: null, needs_manager_consent: true,
};

export function PostingForm({ open, posting, onClose, onSaved }: { open: boolean; posting: Posting | null; onClose: () => void; onSaved: (p: Posting) => void }) {
  const toast = useToast();
  const o = useOrgOptions();
  const [d, setD] = useState<Draft>(EMPTY);
  const [reqs, setReqs] = useState<SelectOption<string>[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!open) return;
    setDirty(false);
    setD(posting ? {
      ...EMPTY, kind: posting.kind, title: posting.title, description: posting.description ?? "", department_id: posting.department_id,
      designation_id: posting.designation_id, location_id: posting.location_id, skills: posting.skills, openings: posting.openings,
      duration_weeks: posting.duration_weeks, hours_per_week: posting.hours_per_week, work_mode: posting.work_mode,
      starts_on: posting.starts_on ?? "", closes_on: posting.closes_on ?? "", hiring_manager_id: posting.hiring_manager_id,
      needs_manager_consent: posting.needs_manager_consent,
    } : EMPTY);
    if (!posting) api.get<SelectOption<string>[]>("/internal-jobs/requisitions").then(setReqs).catch(() => setReqs([]));
  }, [open, posting]);
  const set = (patch: Partial<Draft>) => { setD((x) => ({ ...x, ...patch })); setDirty(true); };

  async function save(publish: boolean) {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        kind: d.kind, title: d.title, description: d.description, department_id: d.department_id, designation_id: d.designation_id,
        location_id: d.location_id, skills: d.skills.map(({ skill_id, level }) => ({ skill_id, level })), openings: d.openings,
        duration_weeks: d.duration_weeks, hours_per_week: d.hours_per_week, work_mode: d.work_mode, starts_on: d.starts_on || null,
        closes_on: d.closes_on || null, hiring_manager_id: d.hiring_manager_id, needs_manager_consent: d.needs_manager_consent,
      };
      if (!posting && d.source === "requisition") {
        body.requisition_uuid = d.requisition_uuid;
        for (const k of ["title", "department_id", "designation_id", "location_id", "hiring_manager_id"]) if (!body[k]) delete body[k];
      }
      if (!posting && d.source === "position") body.position_uuid = d.position_uuid;
      let r = posting ? await api.put<Posting>(`/internal-jobs/postings/${posting.uuid}`, body) : await api.post<Posting>("/internal-jobs/postings", body);
      if (publish && r.status !== "open") r = await api.post<Posting>(`/internal-jobs/postings/${r.uuid}/status`, { action: "publish" });
      toast.success(publish ? "Posted for employees" : "Saved"); onSaved(r);
    } catch (e) { toast.error("Couldn't save", { description: (e as Error).message }); } finally { setSaving(false); }
  }

  const fromReq = !posting && d.source === "requisition";
  return (
    <Modal open={open} onClose={onClose} size="lg" title={posting ? "Edit internal posting" : "New internal posting"} dirty={dirty} busy={saving}
      description="Employees see open postings under Internal jobs and can apply."
      footer={<><ModalCancel /><Button onClick={() => save(false)} loading={saving}>Save draft</Button><Button variant="primary" icon={Send} onClick={() => save(true)} loading={saving}>{posting?.status === "open" ? "Save" : "Post now"}</Button></>}>
      <div>
        <FormSection title="What is it">
          <RadioCards<"job" | "gig"> value={d.kind} onChange={(v) => set({ kind: v })} options={[
            { value: "job", label: "Job", description: "A move into a role. The chosen person changes job." },
            { value: "gig", label: "Gig or project", description: "Some hours a week for a few weeks, alongside their role." }]} />
          {!posting && d.kind === "job" && (
            <div className="mt-5 space-y-4">
              <Field label="Start from">
                <Select value={d.source} onChange={(v) => set({ source: (v as Draft["source"]) ?? "none" })} options={[
                  { value: "none", label: "Nothing, fill it in" }, { value: "requisition", label: "An approved hiring request" }, { value: "position", label: "A vacant position" }]} />
              </Field>
              {d.source === "requisition" && <Field label="Hiring request" hint="Title, department, location, openings and hiring manager are copied"><Select value={d.requisition_uuid} onChange={(v) => set({ requisition_uuid: v })} options={reqs} placeholder={reqs.length ? "Pick" : "No approved requests waiting"} /></Field>}
              {d.source === "position" && <Field label="Position" hint="The chosen person is moved into this seat"><PositionPicker value={d.position_uuid} onChange={(uuid, p) => set({ position_uuid: uuid, title: d.title || p?.title || "", skills: d.skills.length ? d.skills : p?.skills ?? [] })} /></Field>}
            </div>
          )}
        </FormSection>
        <FormSection title="Details">
          <FormGrid>
            <Field label="Title" required={!fromReq} className="sm:col-span-2"><TextInput value={d.title} onValueChange={(v) => set({ title: v })} placeholder={fromReq ? "From the hiring request" : d.kind === "gig" ? "e.g. Build a sales dashboard" : "e.g. Data Engineer"} /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea value={d.description} onValueChange={(v) => set({ description: v })} rows={3} placeholder="What the work is and who would enjoy it" /></Field>
            {d.source !== "position" && <>
              <Field label="Department"><Select value={d.department_id} onChange={(v) => set({ department_id: v })} options={o.departments} clearable placeholder={fromReq ? "From the request" : "Pick"} /></Field>
              <Field label="Designation"><Select value={d.designation_id} onChange={(v) => set({ designation_id: v })} options={o.designations} clearable placeholder={fromReq ? "From the request" : "Pick"} /></Field>
              <Field label="Location"><Select value={d.location_id} onChange={(v) => set({ location_id: v })} options={o.locations} clearable placeholder={fromReq ? "From the request" : "Pick"} /></Field>
            </>}
            <Field label="Work mode"><Select value={d.work_mode} onChange={(v) => set({ work_mode: v })} options={WORK_MODES} clearable placeholder="Pick" /></Field>
            <Field label="Hiring manager"><Select<number> value={d.hiring_manager_id} onChange={(v) => set({ hiring_manager_id: v })} loadOptions={lookupEmployees()} clearable placeholder="Search people"
              selectedOption={posting?.hiring_manager ? { value: posting.hiring_manager.id, label: posting.hiring_manager.name } : null} /></Field>
            <Field label="Openings"><NumberInput value={d.openings} onChange={(v) => set({ openings: v })} min={1} max={100} /></Field>
            {d.kind === "gig" && <>
              <Field label="Weeks" required><NumberInput value={d.duration_weeks} onChange={(v) => set({ duration_weeks: v })} min={1} max={104} /></Field>
              <Field label="Hours a week" required><NumberInput value={d.hours_per_week} onChange={(v) => set({ hours_per_week: v })} min={1} max={40} /></Field>
            </>}
            <Field label="Starts" aside="Optional"><DateInput value={d.starts_on} onChange={(v) => set({ starts_on: v })} clearable /></Field>
            <Field label="Applications close" aside="Optional"><DateInput value={d.closes_on} onChange={(v) => set({ closes_on: v })} clearable min={todayISO()} /></Field>
            <div className="sm:col-span-2"><Toggle checked={d.needs_manager_consent} onChange={(v) => set({ needs_manager_consent: v })} label="Ask the applicant's manager first" description="Their manager agrees in the approvals inbox before you see the application." /></div>
          </FormGrid>
        </FormSection>
        <FormSection title="Skills" description="Applicants get a match score from the skills on their profile.">
          <SkillsEditor value={d.skills} onChange={(v) => set({ skills: v })} />
        </FormSection>
      </div>
    </Modal>
  );
}

export function PostingDetail({ uuid, onClose, onChanged, onEdit }: { uuid: string | null; onClose: () => void; onChanged: () => void; onEdit: (p: Posting) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [p, setP] = useState<Posting | null>(null);
  const [tab, setTab] = useState("details");
  const [apps, setApps] = useState<Application[] | null>(null);
  const [sugg, setSugg] = useState<{ id: number; uuid: string; name: string; photo?: string | null; match_score: number }[] | null>(null);
  const [applying, setApplying] = useState(false);
  const [moving, setMoving] = useState<Application | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!uuid) { setP(null); setApps(null); setSugg(null); return; }
    api.get<Posting>(`/internal-jobs/postings/${uuid}`).then((r) => {
      setP(r);
      if (r.can_manage) {
        api.get<{ items: Application[] }>(`/internal-jobs/postings/${uuid}/applications`).then((x) => setApps(x.items)).catch(() => setApps([]));
        api.get<{ items: typeof sugg }>(`/internal-jobs/postings/${uuid}/suggestions`).then((x) => setSugg(x.items)).catch(() => setSugg([]));
      }
    }).catch((e) => toast.error(e.message));
  }, [uuid, nonce, toast]);
  useEffect(() => { if (uuid) setTab("details"); }, [uuid]);
  const reload = () => { setNonce((n) => n + 1); onChanged(); };

  async function status(action: string) {
    if (!p) return;
    if (action === "cancel" && !(await confirm({ title: "Cancel this posting?", message: "Open applications are closed and applicants are told.", confirmLabel: "Cancel posting", tone: "danger" }))) return;
    try { await api.post(`/internal-jobs/postings/${p.uuid}/status`, { action }); toast.success(action === "publish" ? "Posted" : action === "close" ? "Closed for applications" : "Cancelled"); reload(); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function decide(a: Application, action: string) {
    try { await api.post(`/internal-jobs/applications/${a.uuid}/decision`, { action }); toast.success("Updated"); reload(); }
    catch (e) { toast.error((e as Error).message); }
  }

  const manage = !!p?.can_manage;
  return (
    <Modal open={!!uuid} onClose={onClose} size={manage ? "xl" : "lg"} flush
      title={p ? <span className="flex items-center gap-2">{p.title}<Badge tone={p.kind === "gig" ? "info" : "accent"}>{p.kind_label}</Badge></span> : "Internal posting"}
      description={p ? [p.number, p.department, p.location].filter(Boolean).join(" · ") : undefined}
      footerStart={manage && p && !["filled", "cancelled"].includes(p.status) ? <Button variant="ghost" icon={Ban} onClick={() => status("cancel")}>Cancel posting</Button> : undefined}
      footer={p && <>
        {manage && p.status === "open" && <Button icon={Lock} onClick={() => status("close")}>Close applications</Button>}
        {manage && ["draft", "closed"].includes(p.status) && <Button icon={Unlock} onClick={() => status("publish")}>{p.status === "draft" ? "Post now" : "Reopen"}</Button>}
        {manage && !["filled", "cancelled"].includes(p.status) && <Button icon={Pencil} onClick={() => onEdit(p)}>Edit</Button>}
        {!manage && p.status === "open" && !p.my_application && <Button variant="primary" icon={Send} onClick={() => setApplying(true)}>Apply</Button>}
        {!manage && p.my_application && <StatusBadge status={p.my_application.status} label={p.my_application.status_label} />}
      </>}>
      {!p ? <div className="p-6"><Skeleton className="h-56 rounded-xl" /></div> : (
        <div>
          {manage && (
            <div className="border-b border-line px-6 pt-2">
              <Tabs value={tab} onChange={setTab} items={[{ value: "details", label: "Details" }, { value: "applications", label: "Applications", count: apps?.length },
                { value: "suggested", label: "Suggested people", icon: Sparkles }]} />
            </div>
          )}
          <div className="p-6">
            {tab === "details" && (
              <div className="space-y-6">
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] text-muted">
                  <StatusBadge status={p.status} label={p.status_label} />
                  {p.kind === "gig" && <span className="inline-flex items-center gap-1.5"><Clock size={14} strokeWidth={1.4} />{p.duration_weeks} weeks · {p.hours_per_week} hours a week</span>}
                  {p.work_mode_label && <span className="inline-flex items-center gap-1.5"><MapPin size={14} strokeWidth={1.4} />{[p.location, p.work_mode_label].filter(Boolean).join(" · ")}</span>}
                  <span className="inline-flex items-center gap-1.5"><Users size={14} strokeWidth={1.4} />{p.openings} opening{p.openings > 1 ? "s" : ""}</span>
                  {p.starts_on && <span>Starts {formatDisplayDate(p.starts_on)}</span>}
                  {p.closes_on && <span className={p.closing_soon ? "text-amber-700" : ""}>Applications close {formatDisplayDate(p.closes_on)}</span>}
                </div>
                {p.description && <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink">{p.description}</p>}
                <div>
                  <p className="mb-2 text-[12px] uppercase tracking-[0.06em] text-faint">Skills</p>
                  {!manage && p.my_match_detail.length > 0 ? (
                    <ul className="space-y-1.5">
                      {p.my_match_detail.map((m) => (
                        <li key={m.skill_id} className="flex items-center justify-between text-[13.5px]">
                          <span className="flex items-center gap-2">{m.met ? <CheckCircle2 size={15} strokeWidth={1.4} className="text-emerald-600" /> : <span className="h-[15px] w-[15px] rounded-full border border-line-strong" />}{m.name}</span>
                          <span className="text-[12.5px] text-muted">needs level {m.required} · you {m.have ? `have ${m.have}` : "haven't added it"}</span>
                        </li>
                      ))}
                      <li className="pt-1"><MatchPill score={p.my_match} /><span className="ml-2 text-[12px] text-faint">from the skills on your profile</span></li>
                    </ul>
                  ) : <SkillList skills={p.skills} />}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><p className="mb-1.5 text-[12px] uppercase tracking-[0.06em] text-faint">Hiring manager</p><PersonCell person={p.hiring_manager} /></div>
                  <div><p className="mb-1.5 text-[12px] uppercase tracking-[0.06em] text-faint">Linked to</p>
                    <p className="text-[13.5px] text-ink">{p.position ? `Position ${p.position.code} · ${p.position.title}` : p.requisition ? `Hiring request ${p.requisition.number}` : "—"}</p></div>
                </div>
                {!manage && p.needs_manager_consent && !p.my_application && <p className="text-[12.5px] text-faint">Your manager is asked to agree before the hiring manager sees your application.</p>}
              </div>
            )}
            {tab === "applications" && (
              <div className="space-y-3">
                {!apps ? <Skeleton className="h-32 rounded-xl" /> : !apps.length ? <p className="py-8 text-center text-[13.5px] text-faint">No applications yet.</p> : apps.map((a) => (
                  <div key={a.uuid} className="rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <PersonCell person={a.employee} hint={[a.designation, a.department].filter(Boolean).join(" · ")} />
                        <div className="pl-[38px]"><TalentChip talent={a.talent} /></div>
                      </div>
                      <div className="flex items-center gap-2"><MatchPill score={a.match_score} /><StatusBadge status={a.status} label={a.status_label} /></div>
                    </div>
                    {a.note && <p className="mt-3 text-[13.5px] text-muted">“{a.note}”</p>}
                    {a.match_detail.length > 0 && <p className="mt-2 text-[12.5px] text-faint">{a.match_detail.map((m) => `${m.name} ${m.have || 0}/${m.required}`).join(" · ")}</p>}
                    {a.manager_note && <p className="mt-1 text-[12.5px] text-faint">Manager: {a.manager_note}</p>}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {a.status === "submitted" && <Button size="sm" onClick={() => decide(a, "shortlist")}>Shortlist</Button>}
                      {["submitted", "shortlisted"].includes(a.status) && <Button size="sm" variant="primary" onClick={() => decide(a, "select")}>Select</Button>}
                      {a.status === "selected" && <Button size="sm" variant="primary" icon={p.kind === "gig" ? Hammer : Briefcase} onClick={() => setMoving(a)}>{p.kind === "gig" ? "Start the gig" : "Move to the role"}</Button>}
                      {["submitted", "shortlisted", "selected"].includes(a.status) && <Button size="sm" variant="ghost" onClick={() => decide(a, "reject")}>Not this time</Button>}
                      {a.status === "rejected" && <Button size="sm" variant="ghost" icon={Undo2} onClick={() => decide(a, "reconsider")}>Reconsider</Button>}
                      {a.status === "manager_review" && <span className="text-[12.5px] text-amber-700">Waiting for {a.manager?.name ?? "their manager"} to agree</span>}
                      {a.effective_date && <span className="text-[12.5px] text-muted">From {formatDisplayDate(a.effective_date)}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {tab === "suggested" && (
              <div>
                <p className="mb-3 text-[13px] text-muted">People whose profile skills best match this posting and who have not applied. Let them know it is open.</p>
                {!sugg ? <Skeleton className="h-32 rounded-xl" /> : !sugg.length ? <p className="py-6 text-center text-[13.5px] text-faint">No suggestions. Add skills to the posting first.</p> : (
                  <ul className="divide-y divide-line">{sugg.map((s) => <li key={s.id} className="flex items-center justify-between py-2.5"><PersonCell person={s} /><MatchPill score={s.match_score} /></li>)}</ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <ApplyModal posting={applying ? p : null} onClose={() => setApplying(false)} onDone={() => { setApplying(false); reload(); }} />
      <MoveModal app={moving} kind={p?.kind ?? "job"} onClose={() => setMoving(null)} onDone={() => { setMoving(null); reload(); }} />
    </Modal>
  );
}

function ApplyModal({ posting, onClose, onDone }: { posting: Posting | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (posting) setNote(""); }, [posting]);
  async function send() {
    if (!posting) return;
    setSaving(true);
    try {
      const r = await api.post<Application>(`/internal-jobs/postings/${posting.uuid}/apply`, { note });
      toast.success("Application sent", { description: r.status === "manager_review" ? "Your manager is asked to agree first." : "The hiring manager has been told." });
      onDone();
    } catch (e) { toast.error("Couldn't apply", { description: (e as Error).message }); } finally { setSaving(false); }
  }
  return (
    <Modal open={!!posting} onClose={onClose} size="md" title={`Apply for ${posting?.title ?? ""}`} busy={saving} zIndex={60}
      footer={<><ModalCancel /><Button variant="primary" icon={Send} loading={saving} onClick={send}>Send application</Button></>}>
      <div className="space-y-4">
        {posting && <div className="flex items-center gap-2 text-[13px] text-muted"><MatchPill score={posting.my_match} /><span>Keep the skills on your profile up to date for a fair match.</span></div>}
        <Field label="Why you" aside="Optional"><Textarea value={note} onValueChange={setNote} rows={4} placeholder="What you would bring and what you want to learn" /></Field>
      </div>
    </Modal>
  );
}

function MoveModal({ app, kind, onClose, onDone }: { app: Application | null; kind: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (app) setDate(todayISO()); }, [app]);
  async function go() {
    if (!app) return;
    setSaving(true);
    try {
      await api.post(`/internal-jobs/applications/${app.uuid}/decision`, { action: kind === "gig" ? "assign" : "move", effective_date: date });
      toast.success(kind === "gig" ? "Gig started" : "Move recorded", { description: kind === "gig" ? undefined : "Their job details change on the date given." });
      onDone();
    } catch (e) { toast.error("Couldn't complete", { description: (e as Error).message }); } finally { setSaving(false); }
  }
  return (
    <Modal open={!!app} onClose={onClose} size="sm" title={kind === "gig" ? "Start the gig" : `Move ${app?.employee?.name ?? ""}`} busy={saving} zIndex={60}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={go}>Confirm</Button></>}>
      <div className="space-y-4">
        <Field label={kind === "gig" ? "Starts on" : "Takes effect on"}><DateInput value={date} onChange={setDate} /></Field>
        {kind !== "gig" && <p className="text-[12.5px] text-muted">A job change is recorded: into the posting&apos;s position when it has one, otherwise to its department, designation, location and hiring manager. Both managers are told.</p>}
      </div>
    </Modal>
  );
}
