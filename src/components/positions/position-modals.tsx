"use client";

/*
 * Position modals.
 *
 *   <PositionForm open position={p|null} mode="direct"|"request" onClose onSaved />  add / edit (or ask for it through approval)
 *   <PositionDetail uuid meta onClose onChanged onEdit />                           details, people, history, hiring
 *   <AssignModal position onClose onDone />                                         put someone in a seat
 *   <HiringRequestModal position onClose onDone />                                  raise a hiring request for vacant seats
 *   <PlanForm open plan meta onClose onSaved />                                     headcount plan for a department and year
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Ban, Briefcase, CalendarClock, GitPullRequestArrow, Pencil, RotateCcw, Send, UserMinus, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { todayISO } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, DateInput, Field, FormGrid, FormSection, KeyValue, Modal, ModalCancel, NumberInput, Section, Select, Skeleton, Tabs,
  TextInput, Textarea, Toggle, formatDisplayDate, useConfirm, type SelectOption,
} from "@/components/ui-kit";
import { useOrgOptions, lookupEmployees } from "@/components/people/hooks";
import { FILL_TONE, PersonCell, SkillList, SkillsEditor, StatusBadge, band, money } from "./shared";
import type { HeadcountPlan, Meta, Position, SkillReq } from "./types";

async function loadParents(q: string, exclude?: string): Promise<SelectOption<number>[]> {
  const r = await api.get<{ items: Position[] }>(`/positions/positions?size=50&q=${encodeURIComponent(q)}`);
  return r.items.filter((p) => p.uuid !== exclude).map((p) => ({ value: p.id, label: `${p.code} · ${p.title}`, description: p.department ?? undefined }));
}

type Draft = {
  code: string; title: string; description: string; designation_id: number | null; department_id: number | null;
  location_id: number | null; grade_id: number | null; cost_centre_id: number | null; parent_id: number | null;
  status: string; headcount: number | null; fte: number | null; salary_min: number | null; salary_max: number | null;
  is_critical: boolean; skills: SkillReq[];
};

const EMPTY: Draft = {
  code: "", title: "", description: "", designation_id: null, department_id: null, location_id: null, grade_id: null,
  cost_centre_id: null, parent_id: null, status: "approved", headcount: 1, fte: 1, salary_min: null, salary_max: null,
  is_critical: false, skills: [],
};

function fromPosition(p: Position): Draft {
  return {
    code: p.code, title: p.title, description: p.description ?? "", designation_id: p.designation_id, department_id: p.department_id,
    location_id: p.location_id, grade_id: p.grade_id, cost_centre_id: p.cost_centre_id, parent_id: p.parent_id,
    status: p.status === "closed" ? "approved" : p.status, headcount: p.headcount, fte: p.fte,
    salary_min: p.salary_min ? Number(p.salary_min) : null, salary_max: p.salary_max ? Number(p.salary_max) : null,
    is_critical: p.is_critical, skills: p.skills,
  };
}

export function PositionForm({ open, position, mode = "direct", onClose, onSaved }: {
  open: boolean; position: Position | null; mode?: "direct" | "request"; onClose: () => void; onSaved: (p?: Position) => void;
}) {
  const toast = useToast();
  const o = useOrgOptions();
  const [d, setD] = useState<Draft>(EMPTY);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!open) return;
    setD(position ? fromPosition(position) : EMPTY); setReason(""); setDirty(false);
  }, [open, position]);
  const set = (patch: Partial<Draft>) => { setD((x) => ({ ...x, ...patch })); setDirty(true); };

  async function save() {
    if (!d.title.trim()) { toast.error("Give the position a title"); return; }
    const body: Record<string, unknown> = {
      title: d.title, description: d.description || null, designation_id: d.designation_id, department_id: d.department_id,
      location_id: d.location_id, grade_id: d.grade_id, cost_centre_id: d.cost_centre_id, parent_id: d.parent_id,
      status: d.status, headcount: d.headcount ?? 1, fte: d.fte ?? 1, salary_min: d.salary_min, salary_max: d.salary_max,
      is_critical: d.is_critical, skills: d.skills.map(({ skill_id, level }) => ({ skill_id, level })),
    };
    setSaving(true);
    try {
      if (mode === "request") {
        if (!reason.trim()) { toast.error("Say why this is needed"); setSaving(false); return; }
        delete body.status;
        const r = await api.post<{ status: string }>("/positions/requests", {
          kind: position ? "change" : "new", position_uuid: position?.uuid, reason, data: body,
        });
        toast.success(r.status === "approved" ? "Approved and applied" : "Request sent for approval");
        onSaved();
      } else {
        if (d.code.trim()) body.code = d.code.trim();
        const r = position ? await api.put<Position>(`/positions/positions/${position.uuid}`, body) : await api.post<Position>("/positions/positions", body);
        toast.success(position ? "Position saved" : `Position ${r.code} added`);
        onSaved(r);
      }
    } catch (e) { toast.error("Couldn't save", { description: (e as Error).message }); } finally { setSaving(false); }
  }

  const title = mode === "request" ? (position ? `Ask to change ${position.code}` : "Ask for a new position") : position ? `Edit ${position.code}` : "Add position";
  return (
    <Modal open={open} onClose={onClose} size="lg" title={title} dirty={dirty} busy={saving}
      description={mode === "request" ? "The request goes to the department head and HR for approval." : "A position is an approved seat. People are placed in it from its page."}
      footer={<><ModalCancel /><Button variant="primary" icon={mode === "request" ? Send : undefined} loading={saving} onClick={save}>{mode === "request" ? "Send request" : "Save"}</Button></>}>
      <div>
        <FormSection title="Role">
          <FormGrid>
            <Field label="Title" required><TextInput value={d.title} onValueChange={(v) => set({ title: v })} placeholder="e.g. Senior Software Engineer" /></Field>
            {mode === "direct" && <Field label="Code" hint={position ? undefined : "Leave empty to number it automatically"}><TextInput value={d.code} onValueChange={(v) => set({ code: v.toUpperCase() })} placeholder="POS-0001" /></Field>}
            <Field label="Designation"><Select value={d.designation_id} onChange={(v) => set({ designation_id: v })} options={o.designations} clearable placeholder="Pick" /></Field>
            <Field label="Department"><Select value={d.department_id} onChange={(v) => set({ department_id: v })} options={o.departments} clearable placeholder="Pick" /></Field>
            <Field label="Location"><Select value={d.location_id} onChange={(v) => set({ location_id: v })} options={o.locations} clearable placeholder="Pick" /></Field>
            <Field label="Reports to position" hint="The person in it becomes the manager">
              <Select<number> value={d.parent_id} onChange={(v) => set({ parent_id: v })} loadOptions={(q) => loadParents(q, position?.uuid)} clearable placeholder="Search positions"
                selectedOption={d.parent_id && position?.parent ? { value: d.parent_id, label: position.parent } : null} />
            </Field>
            <Field label="Description" className="sm:col-span-2" aside="Optional"><Textarea value={d.description} onValueChange={(v) => set({ description: v })} rows={2} /></Field>
          </FormGrid>
        </FormSection>
        <FormSection title="Seats and pay">
          <FormGrid>
            {mode === "direct" && <Field label="Status"><Select value={d.status} onChange={(v) => set({ status: v ?? "approved" })} options={[
              { value: "approved", label: "Approved", description: "Can be filled now" }, { value: "budgeted", label: "Budgeted", description: "Planned, not yet open for hiring" }]} /></Field>}
            <Field label="Seats" hint="How many people can sit in it"><NumberInput value={d.headcount} onChange={(v) => set({ headcount: v })} min={1} max={1000} /></Field>
            <Field label="FTE per seat" hint="1 is full time, 0.5 half time"><NumberInput value={d.fte} onChange={(v) => set({ fte: v })} min={0.1} max={1} step={0.1} /></Field>
            <Field label="Grade"><Select value={d.grade_id} onChange={(v) => set({ grade_id: v })} options={o.grades} clearable placeholder="Pick" /></Field>
            <Field label="Cost centre"><Select value={d.cost_centre_id} onChange={(v) => set({ cost_centre_id: v })} options={o.costCentres} clearable placeholder="Pick" /></Field>
            <Field label="Salary band from" hint="Yearly CTC; defaults from the grade"><NumberInput value={d.salary_min} onChange={(v) => set({ salary_min: v })} min={0} suffix="₹" /></Field>
            <Field label="Salary band to"><NumberInput value={d.salary_max} onChange={(v) => set({ salary_max: v })} min={0} suffix="₹" /></Field>
            <div className="sm:col-span-2"><Toggle checked={d.is_critical} onChange={(v) => set({ is_critical: v })} label="Key position" description="Shown in succession planning; it should have ready successors." /></div>
          </FormGrid>
        </FormSection>
        <FormSection title="Skills" description="Used to match people in the internal job marketplace.">
          <SkillsEditor value={d.skills} onChange={(v) => set({ skills: v })} />
        </FormSection>
        {mode === "request" && <Field label="Why is this needed?" required className="pt-6"><Textarea value={reason} onValueChange={(v) => { setReason(v); setDirty(true); }} rows={3} /></Field>}
      </div>
    </Modal>
  );
}

export function PositionDetail({ uuid, meta, onClose, onChanged, onEdit, onRequestChange }: {
  uuid: string | null; meta: Meta | null; onClose: () => void; onChanged: () => void;
  onEdit: (p: Position) => void; onRequestChange: (p: Position) => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [p, setP] = useState<Position | null>(null);
  const [tab, setTab] = useState("overview");
  const [assigning, setAssigning] = useState(false);
  const [hiring, setHiring] = useState(false);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!uuid) { setP(null); return; }
    let live = true;
    api.get<Position>(`/positions/positions/${uuid}`).then((r) => live && setP(r)).catch((e) => toast.error(e.message));
    return () => { live = false; };
  }, [uuid, nonce, toast]);
  useEffect(() => { if (uuid) setTab("overview"); }, [uuid]);
  const reload = () => { setNonce((n) => n + 1); onChanged(); };
  const manage = !!meta?.can_manage;

  async function close() {
    if (!p) return;
    if (!(await confirm({ title: `Close ${p.code}?`, message: "A closed position can't be filled. You can reopen it later.", confirmLabel: "Close position", tone: "danger" }))) return;
    try { await api.post(`/positions/positions/${p.uuid}/close`, { reason: "Closed by HR" }); toast.success("Position closed"); reload(); }
    catch (e) { toast.error("Couldn't close", { description: (e as Error).message }); }
  }
  async function reopen() {
    if (!p) return;
    try { await api.post(`/positions/positions/${p.uuid}/reopen`); toast.success("Position reopened"); reload(); }
    catch (e) { toast.error("Couldn't reopen", { description: (e as Error).message }); }
  }
  async function release(seatUuid: string, name: string) {
    if (!(await confirm({ title: `Take ${name} out of this position?`, message: "The seat becomes vacant from today. Their job details stay as they are.", confirmLabel: "Free the seat" }))) return;
    try { await api.post(`/positions/seats/${seatUuid}/release`, { reason: "Released by HR" }); toast.success("Seat freed"); reload(); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Modal open={!!uuid} onClose={onClose} size="lg" flush
      title={p ? <span className="flex items-center gap-2">{p.title}{p.is_critical && <Badge tone="accent">Key position</Badge>}</span> : "Position"}
      description={p ? [p.code, p.department, p.location].filter(Boolean).join(" · ") : undefined}
      footerStart={p && manage ? (p.status === "closed"
        ? <Button icon={RotateCcw} onClick={reopen}>Reopen</Button>
        : <Button variant="ghost" icon={Ban} onClick={close}>Close position</Button>) : undefined}
      footer={p && <>
        {p.status !== "closed" && !manage && meta?.can_view && <Button icon={GitPullRequestArrow} onClick={() => onRequestChange(p)}>Ask for a change</Button>}
        {p.status !== "closed" && manage && <Button icon={Pencil} onClick={() => onEdit(p)}>Edit</Button>}
        {p.status === "approved" && manage && p.vacant > 0 && <Button icon={Briefcase} onClick={() => setHiring(true)}>Raise hiring request</Button>}
        {p.status === "approved" && manage && p.vacant > 0 && <Button variant="primary" icon={UserPlus} onClick={() => setAssigning(true)}>Put someone in</Button>}
      </>}>
      {!p ? <div className="p-6"><Skeleton className="h-48 rounded-xl" /></div> : (
        <div>
          <div className="border-b border-line px-6 pt-2">
            <Tabs value={tab} onChange={setTab} items={[
              { value: "overview", label: "Overview" }, { value: "people", label: "People", count: p.filled + p.reserved },
              { value: "history", label: "History" }, { value: "hiring", label: "Hiring", count: p.hiring_requests?.length || undefined }]} />
          </div>
          <div className="p-6">
            {tab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-3">
                  {[["Seats", p.headcount], ["Filled", p.filled + (p.reserved ? ` + ${p.reserved} starting` : "")], ["Vacant", p.vacant]].map(([l, v]) => (
                    <div key={String(l)} className="rounded-xl border border-line px-4 py-3"><p className="text-[12px] text-faint">{l}</p><p className="mt-0.5 text-[20px] font-light tabular text-ink">{v}</p></div>
                  ))}
                </div>
                <KeyValue items={[
                  { label: "Status", value: <StatusBadge status={p.status} label={p.status_label} /> },
                  { label: "Fill", value: <Badge tone={FILL_TONE[p.fill_status]}>{p.fill_label}</Badge> },
                  { label: "Designation", value: p.designation ?? "—" }, { label: "Department", value: p.department ?? "—" },
                  { label: "Location", value: p.location ?? "—" }, { label: "Reports to", value: p.parent ?? "Top of the chart" },
                  { label: "Grade", value: p.grade ?? "—" }, { label: "Cost centre", value: p.cost_centre ?? "—" },
                  { label: "Salary band (yearly CTC)", value: band(p.salary_min, p.salary_max) },
                  { label: "FTE", value: `${p.fte} per seat · ${p.total_fte} in all` },
                  ...(p.description ? [{ label: "Description", value: p.description, span: 2 as const }] : []),
                  ...(p.closed_reason ? [{ label: "Closed because", value: p.closed_reason, span: 2 as const }] : []),
                ]} />
                <Section title="Skills"><SkillList skills={p.skills} /></Section>
              </div>
            )}
            {tab === "people" && (
              <div className="space-y-2">
                {!p.incumbents.length && <p className="py-8 text-center text-[13.5px] text-faint">No one sits in this position yet.</p>}
                {p.incumbents.map((i) => (
                  <div key={i.seat_uuid} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                    <PersonCell person={i} hint={i.status === "reserved" ? `Starts ${formatDisplayDate(i.start_date)}` : `Since ${formatDisplayDate(i.start_date)}`} />
                    <div className="flex items-center gap-2">
                      <Link href={`/dashboard/staff?view=${i.uuid}`} className="text-[13px] text-primary hover:underline">Profile</Link>
                      {manage && <Button size="sm" variant="ghost" icon={UserMinus} onClick={() => release(i.seat_uuid, i.name)}>Free seat</Button>}
                    </div>
                  </div>
                ))}
                {p.vacant > 0 && p.status !== "closed" && <p className="pt-2 text-[13px] text-amber-700">{p.vacant} seat{p.vacant > 1 ? "s" : ""} vacant.</p>}
              </div>
            )}
            {tab === "history" && (
              <ul className="divide-y divide-line">
                {!(p.history ?? []).length && <li className="py-8 text-center text-[13.5px] text-faint">No one has sat in this position yet.</li>}
                {(p.history ?? []).map((h) => (
                  <li key={h.uuid} className="flex items-center justify-between gap-3 py-3">
                    <PersonCell person={h.employee} hint={h.ended_reason ?? undefined} />
                    <span className="text-right text-[12.5px] text-muted">{formatDisplayDate(h.start_date)} – {h.end_date ? formatDisplayDate(h.end_date) : "now"}<br />
                      <span className="text-faint">{h.status === "ended" ? "Ended" : h.status === "reserved" ? "Starting" : "Current"}</span></span>
                  </li>
                ))}
              </ul>
            )}
            {tab === "hiring" && (
              <div className="space-y-2">
                {!(p.hiring_requests ?? []).length && <p className="py-8 text-center text-[13.5px] text-faint">No hiring requests for this position.</p>}
                {(p.hiring_requests ?? []).map((h) => (
                  <Link key={h.uuid} href="/dashboard/recruitment/requisitions" className="flex items-center justify-between rounded-xl border border-line px-4 py-3 hover:border-line-strong">
                    <span><span className="text-ink">{h.title}</span><span className="ml-2 text-[12.5px] text-faint">{h.number} · {h.openings} opening(s)</span></span>
                    <Badge tone={h.status === "approved" ? "good" : h.status === "pending" ? "warn" : "neutral"}>{h.status}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <AssignModal position={assigning ? p : null} onClose={() => setAssigning(false)} onDone={() => { setAssigning(false); reload(); }} />
      <HiringRequestModal position={hiring ? p : null} onClose={() => setHiring(false)} onDone={() => { setHiring(false); reload(); }} />
    </Modal>
  );
}

export function AssignModal({ position, onClose, onDone }: { position: Position | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [emp, setEmp] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [kind, setKind] = useState("transfer");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (position) { setEmp(null); setDate(todayISO()); setReason(""); setKind("transfer"); } }, [position]);
  async function save() {
    if (!position) return;
    setSaving(true);
    try {
      const r = await api.post<{ status: string; job_change: boolean }>(`/positions/positions/${position.uuid}/seats`,
        { employee_id: emp, effective_date: date, reason: reason || null, change_type: kind });
      toast.success(r.status === "reserved" ? `Seat reserved from ${formatDisplayDate(date)}` : "Placed in the position",
        { description: r.job_change ? "Their job details were updated to match the position." : undefined });
      onDone();
    } catch (e) { toast.error("Couldn't place them", { description: (e as Error).message }); } finally { setSaving(false); }
  }
  return (
    <Modal open={!!position} onClose={onClose} size="md" title="Put someone in this position" busy={saving} zIndex={60}
      description={position ? `${position.code} · ${position.title} · ${position.vacant} vacant` : undefined}
      footer={<><ModalCancel /><Button variant="primary" disabled={!emp} loading={saving} onClick={save}>Place</Button></>}>
      <div className="space-y-5">
        <Field label="Employee" required><Select<number> loadOptions={lookupEmployees()} value={emp} onChange={setEmp} placeholder="Search people" /></Field>
        <FormGrid>
          <Field label="From" hint="A future date reserves the seat"><DateInput value={date} onChange={setDate} /></Field>
          <Field label="Recorded as"><Select value={kind} onChange={(v) => setKind(v ?? "transfer")} options={[
            { value: "transfer", label: "Transfer" }, { value: "promotion", label: "Promotion" }, { value: "redesignation", label: "Designation change" },
            { value: "department_change", label: "Department change" }, { value: "other", label: "Other change" }]} /></Field>
        </FormGrid>
        <Field label="Reason" aside="Optional"><TextInput value={reason} onValueChange={setReason} placeholder="e.g. Internal move" /></Field>
        <p className="flex items-start gap-2 text-[12.5px] text-muted"><CalendarClock size={14} strokeWidth={1.4} className="mt-0.5 shrink-0" />Their department, designation, location, grade, cost centre and manager are updated to match the position, and their old seat ends the day before.</p>
      </div>
    </Modal>
  );
}

export function HiringRequestModal({ position, onClose, onDone }: { position: Position | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [openings, setOpenings] = useState<number | null>(1);
  const [neededBy, setNeededBy] = useState("");
  const [why, setWhy] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (position) { setOpenings(Math.min(1, position.vacant) || 1); setNeededBy(""); setWhy(""); } }, [position]);
  async function save() {
    if (!position) return;
    setSaving(true);
    try {
      const r = await api.post<{ number: string; status: string }>(`/positions/positions/${position.uuid}/hiring-request`,
        { openings, needed_by: neededBy || null, justification: why || null });
      toast.success(`Hiring request ${r.number ?? ""} raised`, { description: r.status === "approved" ? "Approved. Open a job from it in Hiring." : "Sent for approval." });
      onDone();
    } catch (e) { toast.error("Couldn't raise it", { description: (e as Error).message }); } finally { setSaving(false); }
  }
  return (
    <Modal open={!!position} onClose={onClose} size="md" title="Raise a hiring request" busy={saving} zIndex={60}
      description={position ? `Title, department, location and salary band are copied from ${position.code}.` : undefined}
      footer={<><ModalCancel /><Button variant="primary" icon={Send} loading={saving} onClick={save}>Send for approval</Button></>}>
      <div className="space-y-5">
        <FormGrid>
          <Field label="Openings" hint={position ? `${position.vacant} vacant` : undefined}><NumberInput value={openings} onChange={setOpenings} min={1} max={position?.vacant ?? 1} /></Field>
          <Field label="Needed by" aside="Optional"><DateInput value={neededBy} onChange={setNeededBy} clearable /></Field>
        </FormGrid>
        <Field label="Why" aside="Optional"><Textarea value={why} onValueChange={setWhy} rows={3} placeholder="Vacant seat in the approved position" /></Field>
      </div>
    </Modal>
  );
}

export function PlanForm({ open, plan, meta, onClose, onSaved }: { open: boolean; plan: HeadcountPlan | null; meta: Meta | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const o = useOrgOptions();
  const [dept, setDept] = useState<number | null>(null);
  const [fy, setFy] = useState<string | null>(null);
  const [planned, setPlanned] = useState<number | null>(null);
  const [budget, setBudget] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setDept(plan?.department_id ?? null); setFy(plan?.financial_year ?? meta?.financial_year ?? null);
    setPlanned(plan?.planned_headcount ?? null); setBudget(plan?.budget ? Number(plan.budget) : null); setNotes(plan?.notes ?? "");
  }, [open, plan, meta]);
  async function save(submit: boolean) {
    setSaving(true);
    try {
      const body = { department_id: dept, financial_year: fy, planned_headcount: planned, budget, notes, submit };
      const r = plan ? await api.put<HeadcountPlan>(`/positions/headcount-plans/${plan.uuid}`, body) : await api.post<HeadcountPlan>("/positions/headcount-plans", body);
      toast.success(submit ? (r.status === "approved" ? "Plan approved" : "Sent for approval") : "Saved as draft");
      onSaved();
    } catch (e) { toast.error("Couldn't save the plan", { description: (e as Error).message }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title={plan ? `Revise ${plan.department ?? "plan"} ${plan.financial_year}` : "New headcount plan"} busy={saving}
      description="The approved number caps the seats in the department's open positions for the year (April to March)."
      footer={<><ModalCancel /><Button onClick={() => save(false)} loading={saving}>Save draft</Button><Button variant="primary" icon={Send} onClick={() => save(true)} loading={saving}>Send for approval</Button></>}>
      <div className="space-y-5">
        <FormGrid>
          <Field label="Department" required><Select value={dept} onChange={setDept} options={o.departments} placeholder="Pick" disabled={!!plan} /></Field>
          <Field label="Financial year" required><Select value={fy} onChange={setFy} options={(meta?.financial_years ?? []).map((y) => ({ value: y, label: y }))} disabled={!!plan} /></Field>
          <Field label="Planned headcount" required hint={plan?.approved_headcount != null ? `Approved now: ${plan.approved_headcount}` : undefined}><NumberInput value={planned} onChange={setPlanned} min={0} /></Field>
          <Field label="Yearly CTC budget" aside="Optional" hint={budget ? money(budget) : undefined}><NumberInput value={budget} onChange={setBudget} min={0} suffix="₹" /></Field>
        </FormGrid>
        <Field label="Notes" aside="Optional"><Textarea value={notes} onValueChange={setNotes} rows={3} placeholder="Why the team needs this many people" /></Field>
      </div>
    </Modal>
  );
}
