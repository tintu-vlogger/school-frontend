"use client";

/*
 * Succession modals.
 *
 *   <SuccessionPlanForm open plan onClose onSaved />   key position, plan manager, risk and impact of loss
 *   <SuccessionPlanDetail uuid onClose onChanged onEdit />  successors with readiness, development actions
 *   <PoolForm open pool onClose onSaved />             name, manager, description
 *   <PoolDetail uuid onClose onChanged onEdit />       members, nine-box placement, suggestions
 */
import { useEffect, useState } from "react";
import { BookOpen, Check, Flag, GraduationCap, Plus, Sparkles, Target, Trash2, UserPlus, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, DateInput, Field, FormGrid, IconButton, KeyValue, Modal, ModalCancel, MultiSelect, Select, Skeleton, TextInput, Textarea,
  formatDisplayDate, useConfirm, type SelectOption,
} from "@/components/ui-kit";
import { lookupEmployees } from "@/components/people/hooks";
import {
  BENCH_TONE, LEVEL_OPTIONS, PersonCell, READINESS_OPTIONS, READINESS_SHORT, READINESS_TONE, URGENCY_LABEL, URGENCY_TONE,
} from "./shared";
import type { Action, Candidate, Pool, Position, SuccessionPlan, Talent } from "./types";

async function loadPositions(q: string): Promise<SelectOption<string>[]> {
  const r = await api.get<{ items: Position[] }>(`/positions/positions?size=50&q=${encodeURIComponent(q)}`);
  return r.items.map((p) => ({ value: p.uuid, label: `${p.code} · ${p.title}`, description: [p.department, p.incumbents[0]?.name].filter(Boolean).join(" · ") || undefined }));
}

export function TalentChip({ talent }: { talent: Talent | undefined }) {
  if (!talent || (!talent.rating && !talent.potential)) return <span className="text-[12px] text-faint">No review yet</span>;
  const pot = ["", "Low", "Medium", "High"][talent.potential ?? 0] ?? "";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 text-[12px] text-muted">
      {talent.rating != null && <span>Rating {talent.rating}</span>}
      {pot && <span>· {pot} potential</span>}
      {talent.box_label && <Badge tone={talent.box && [6, 8, 9].includes(talent.box) ? "accent" : "neutral"}>{talent.box_label}</Badge>}
    </span>
  );
}

export function SuccessionPlanForm({ open, plan, onClose, onSaved }: { open: boolean; plan: SuccessionPlan | null; onClose: () => void; onSaved: (p: SuccessionPlan) => void }) {
  const toast = useToast();
  const [pos, setPos] = useState<string | null>(null);
  const [mgr, setMgr] = useState<number | null>(null);
  const [risk, setRisk] = useState("medium");
  const [impact, setImpact] = useState("medium");
  const [review, setReview] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setPos(plan?.position.uuid ?? null); setMgr(plan?.plan_manager_id ?? null); setRisk(plan?.risk_of_loss ?? "medium");
    setImpact(plan?.impact_of_loss ?? "medium"); setReview(plan?.review_on ?? ""); setNotes(plan?.notes ?? "");
  }, [open, plan]);
  async function save() {
    setSaving(true);
    try {
      const body = { position_uuid: pos, plan_manager_id: mgr, risk_of_loss: risk, impact_of_loss: impact, review_on: review || null, notes };
      const r = plan ? await api.put<SuccessionPlan>(`/succession/plans/${plan.uuid}`, body) : await api.post<SuccessionPlan>("/succession/plans", body);
      toast.success(plan ? "Plan saved" : "Succession plan started"); onSaved(r);
    } catch (e) { toast.error("Couldn't save", { description: (e as Error).message }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title={plan ? "Edit succession plan" : "New succession plan"} busy={saving} zIndex={60}
      description="Pick a key position and say how likely its holder is to leave and how much it would hurt."
      footer={<><ModalCancel /><Button variant="primary" disabled={!pos} loading={saving} onClick={save}>{plan ? "Save" : "Start plan"}</Button></>}>
      <div className="space-y-5">
        <Field label="Key position" required>
          <Select<string> value={pos} onChange={setPos} loadOptions={loadPositions} placeholder="Search positions" disabled={!!plan}
            selectedOption={plan ? { value: plan.position.uuid, label: `${plan.position.code} · ${plan.position.title}` } : null} />
        </Field>
        <FormGrid>
          <Field label="Risk of loss" hint="How likely the holder is to leave"><Select value={risk} onChange={(v) => setRisk(v ?? "medium")} options={LEVEL_OPTIONS} /></Field>
          <Field label="Impact of loss" hint="How much it would hurt"><Select value={impact} onChange={(v) => setImpact(v ?? "medium")} options={LEVEL_OPTIONS} /></Field>
          <Field label="Plan manager" aside="Optional"><Select<number> value={mgr} onChange={setMgr} loadOptions={lookupEmployees()} clearable placeholder="Search people"
            selectedOption={plan?.plan_manager ? { value: plan.plan_manager.id, label: plan.plan_manager.name } : null} /></Field>
          <Field label="Review again on" aside="Optional"><DateInput value={review} onChange={setReview} clearable /></Field>
        </FormGrid>
        <Field label="Notes" aside="Optional"><Textarea value={notes} onValueChange={setNotes} rows={3} /></Field>
      </div>
    </Modal>
  );
}

const ACTION_ICON: Record<string, typeof BookOpen> = { course: GraduationCap, goal: Target, mentoring: Users, project: Flag, stretch: Sparkles, other: Check };

export function SuccessionPlanDetail({ uuid, onClose, onChanged, onEdit }: { uuid: string | null; onClose: () => void; onChanged: () => void; onEdit: (p: SuccessionPlan) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [plan, setPlan] = useState<SuccessionPlan | null>(null);
  const [adding, setAdding] = useState(false);
  const [actionFor, setActionFor] = useState<Candidate | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!uuid) { setPlan(null); return; }
    api.get<SuccessionPlan>(`/succession/plans/${uuid}`).then(setPlan).catch((e) => toast.error(e.message));
  }, [uuid, nonce, toast]);
  const updated = (p: SuccessionPlan) => { setPlan(p); onChanged(); };

  async function setReadiness(c: Candidate, readiness: string) {
    try { updated(await api.put<SuccessionPlan>(`/succession/candidates/${c.uuid}`, { readiness })); toast.success(`${c.employee?.name}: ${READINESS_SHORT[readiness]}`); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function remove(c: Candidate) {
    if (!(await confirm({ title: `Remove ${c.employee?.name}?`, message: "Their open development steps for this plan are cancelled.", confirmLabel: "Remove", tone: "danger" }))) return;
    try { updated(await api.post<SuccessionPlan>(`/succession/candidates/${c.uuid}/remove`)); } catch (e) { toast.error((e as Error).message); }
  }
  async function markDone(a: Action) {
    try { await api.put(`/succession/actions/${a.uuid}`, { status: a.status === "done" ? "in_progress" : "done" }); setNonce((n) => n + 1); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function archive() {
    if (!plan || !(await confirm({ title: "Archive this plan?", message: "It leaves the bench strength report. The position stays a key position.", confirmLabel: "Archive" }))) return;
    try { await api.post(`/succession/plans/${plan.uuid}/archive`); toast.success("Plan archived"); onChanged(); onClose(); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <Modal open={!!uuid} onClose={onClose} size="xl"
      title={plan ? `Succession: ${plan.position.title}` : "Succession plan"}
      description={plan ? [plan.position.code, plan.position.department].filter(Boolean).join(" · ") : undefined}
      footerStart={plan && <Button variant="ghost" onClick={archive}>Archive plan</Button>}
      footer={plan && <><Button onClick={() => onEdit(plan)}>Edit plan</Button><Button variant="primary" icon={UserPlus} onClick={() => setAdding(true)}>Add successor</Button></>}>
      {!plan ? <Skeleton className="h-64 rounded-xl" /> : (
        <div className="space-y-7">
          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <div className="rounded-xl border border-line p-4">
              <p className="mb-3 text-[12px] uppercase tracking-[0.06em] text-faint">Holds the position now</p>
              {!plan.incumbents.length ? <p className="text-[13.5px] text-amber-700">Vacant</p> : plan.incumbents.map((i, k) => (
                <div key={i.seat_uuid} className="flex flex-wrap items-center justify-between gap-2">
                  <PersonCell person={i} hint={`Since ${formatDisplayDate(i.start_date)}`} /><TalentChip talent={plan.incumbent_talent?.[k]} />
                </div>
              ))}
            </div>
            <KeyValue className="rounded-xl border border-line p-4" items={[
              { label: "Risk of loss", value: plan.risk_label }, { label: "Impact of loss", value: plan.impact_label },
              { label: "Priority", value: <Badge tone={URGENCY_TONE[plan.urgency]} dot>{URGENCY_LABEL[plan.urgency]}</Badge> },
              { label: "Bench", value: <Badge tone={BENCH_TONE[plan.bench]}>{plan.bench_label}</Badge> },
              { label: "Plan manager", value: plan.plan_manager?.name ?? "—" }, { label: "Review on", value: plan.review_on ? formatDisplayDate(plan.review_on) : "—" },
            ]} />
          </div>
          {plan.notes && <p className="text-[13.5px] text-muted">{plan.notes}</p>}
          <div>
            <p className="mb-3 text-[15px] text-ink">Successors <span className="text-faint">· {plan.successors}</span></p>
            {!plan.candidates.length && <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13.5px] text-faint">No successors yet. Add people who could take over.</div>}
            <div className="space-y-3">
              {plan.candidates.map((c) => {
                const actions = (plan.actions ?? []).filter((a) => a.candidate_uuid === c.uuid);
                return (
                  <div key={c.uuid} className="rounded-xl border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <PersonCell person={c.employee} size={32} />
                        <div className="pl-[42px]"><TalentChip talent={c.talent} /></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select className="w-48" value={c.readiness} onChange={(v) => v && setReadiness(c, v)} options={READINESS_OPTIONS} aria-label="Readiness" />
                        <IconButton icon={Trash2} label="Remove successor" onClick={() => remove(c)} />
                      </div>
                    </div>
                    {(c.strengths || c.gaps) && (
                      <div className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2">
                        {c.strengths && <p><span className="text-faint">Strengths: </span><span className="text-muted">{c.strengths}</span></p>}
                        {c.gaps && <p><span className="text-faint">To develop: </span><span className="text-muted">{c.gaps}</span></p>}
                      </div>
                    )}
                    <div className="mt-3 border-t border-line pt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[12px] uppercase tracking-[0.06em] text-faint">Development</p>
                        <Button size="sm" variant="ghost" icon={Plus} onClick={() => setActionFor(c)}>Add step</Button>
                      </div>
                      {!actions.length ? <p className="text-[13px] text-faint">No development steps yet.</p> : (
                        <ul className="space-y-1.5">
                          {actions.map((a) => {
                            const Icon = ACTION_ICON[a.kind] ?? Check;
                            return (
                              <li key={a.uuid} className="flex items-center gap-3 text-[13.5px]">
                                <Icon size={15} strokeWidth={1.4} className="shrink-0 text-muted" />
                                <span className={`min-w-0 flex-1 truncate ${a.status === "done" ? "text-faint line-through" : "text-ink"}`}>{a.title}
                                  <span className="ml-2 text-[12px] text-faint">{a.kind_label}{a.mentor ? ` · with ${a.mentor.name}` : ""}{a.due_date ? ` · by ${formatDisplayDate(a.due_date)}` : ""}</span></span>
                                {a.progress != null && <span className="w-12 text-right text-[12px] tabular text-muted">{Math.round(a.progress)}%</span>}
                                <Button size="sm" variant="ghost" onClick={() => markDone(a)}>{a.status === "done" ? "Reopen" : "Done"}</Button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <AddSuccessorModal plan={adding ? plan : null} onClose={() => setAdding(false)} onSaved={(p) => { setAdding(false); updated(p); }} />
      <ActionModal candidate={actionFor} onClose={() => setActionFor(null)} onSaved={() => { setActionFor(null); setNonce((n) => n + 1); onChanged(); }} />
    </Modal>
  );
}

function AddSuccessorModal({ plan, onClose, onSaved }: { plan: SuccessionPlan | null; onClose: () => void; onSaved: (p: SuccessionPlan) => void }) {
  const toast = useToast();
  const [emp, setEmp] = useState<number | null>(null);
  const [readiness, setReadiness] = useState("one_two_years");
  const [strengths, setStrengths] = useState("");
  const [gaps, setGaps] = useState("");
  const [hint, setHint] = useState<{ talent: Talent; successor_for: { title: string; readiness_label: string }[]; pools: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (plan) { setEmp(null); setReadiness("one_two_years"); setStrengths(""); setGaps(""); setHint(null); } }, [plan]);
  useEffect(() => {
    if (!emp) { setHint(null); return; }
    api.get<typeof hint>(`/succession/employees/${emp}/talent`).then(setHint).catch(() => setHint(null));
  }, [emp]);
  async function save() {
    if (!plan) return;
    setSaving(true);
    try { onSaved(await api.post<SuccessionPlan>(`/succession/plans/${plan.uuid}/candidates`, { employee_id: emp, readiness, strengths, gaps })); toast.success("Successor added"); }
    catch (e) { toast.error("Couldn't add", { description: (e as Error).message }); } finally { setSaving(false); }
  }
  return (
    <Modal open={!!plan} onClose={onClose} size="md" title="Add a successor" busy={saving} zIndex={60}
      footer={<><ModalCancel /><Button variant="primary" disabled={!emp} loading={saving} onClick={save}>Add</Button></>}>
      <div className="space-y-5">
        <Field label="Employee" required><Select<number> value={emp} onChange={setEmp} loadOptions={lookupEmployees()} placeholder="Search people" /></Field>
        {hint && (
          <div className="rounded-xl bg-sunken/60 px-4 py-3 text-[13px] text-muted">
            <TalentChip talent={hint.talent} />
            {hint.successor_for.length > 0 && <p className="mt-1">Already a successor for {hint.successor_for.map((s) => `${s.title} (${s.readiness_label})`).join(", ")}.</p>}
            {hint.pools.length > 0 && <p className="mt-1">In {hint.pools.join(", ")}.</p>}
          </div>
        )}
        <Field label="Readiness"><Select value={readiness} onChange={(v) => setReadiness(v ?? "one_two_years")} options={READINESS_OPTIONS} /></Field>
        <Field label="Strengths" aside="Optional"><Textarea value={strengths} onValueChange={setStrengths} rows={2} /></Field>
        <Field label="To develop" aside="Optional"><Textarea value={gaps} onValueChange={setGaps} rows={2} /></Field>
      </div>
    </Modal>
  );
}

function ActionModal({ candidate, onClose, onSaved }: { candidate: Candidate | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState("course");
  const [title, setTitle] = useState("");
  const [course, setCourse] = useState<number | null>(null);
  const [goal, setGoal] = useState<number | null>(null);
  const [goals, setGoals] = useState<SelectOption<number>[]>([]);
  const [mentor, setMentor] = useState<number | null>(null);
  const [due, setDue] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!candidate) return;
    setKind("course"); setTitle(""); setCourse(null); setGoal(null); setMentor(null); setDue(""); setNotes("");
    api.get<SelectOption<number>[]>(`/succession/options/goals?employee_id=${candidate.employee_id}`).then(setGoals).catch(() => setGoals([]));
  }, [candidate]);
  const loadCourses = (q: string) => api.get<SelectOption<number>[]>(`/succession/options/courses?q=${encodeURIComponent(q)}`);
  async function save() {
    if (!candidate) return;
    setSaving(true);
    try {
      await api.post(`/succession/candidates/${candidate.uuid}/actions`, { kind, title, course_id: course, objective_id: goal, mentor_id: mentor, due_date: due || null, notes });
      toast.success("Development step added", { description: kind === "course" ? "They are enrolled in the course." : kind === "goal" && !goal ? "The goal was added to their goals." : undefined });
      onSaved();
    } catch (e) { toast.error("Couldn't add", { description: (e as Error).message }); } finally { setSaving(false); }
  }
  return (
    <Modal open={!!candidate} onClose={onClose} size="md" title="Add a development step" description={candidate?.employee?.name} busy={saving} zIndex={60}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={save}>Add step</Button></>}>
      <div className="space-y-5">
        <Field label="Kind"><Select value={kind} onChange={(v) => setKind(v ?? "other")} options={[
          { value: "course", label: "Course", description: "Enrol them in a course from Learning" },
          { value: "goal", label: "Goal", description: "Link or add a goal in Goals & OKRs" },
          { value: "mentoring", label: "Mentoring" }, { value: "project", label: "Project" },
          { value: "stretch", label: "Stretch assignment" }, { value: "other", label: "Other" }]} /></Field>
        {kind === "course" && <Field label="Course" required><Select<number> value={course} onChange={setCourse} loadOptions={loadCourses} placeholder="Search courses" /></Field>}
        {kind === "goal" && <Field label="Existing goal" hint="Or leave empty and give a title to add a new goal"><Select<number> value={goal} onChange={setGoal} options={goals} clearable placeholder="Pick one of their goals" /></Field>}
        {!(kind === "course" || (kind === "goal" && goal)) && <Field label="Title" required><TextInput value={title} onValueChange={setTitle} placeholder={kind === "mentoring" ? "Monthly mentoring with the CFO" : "What will they do"} /></Field>}
        <FormGrid>
          {kind === "mentoring" && <Field label="Mentor"><Select<number> value={mentor} onChange={setMentor} loadOptions={lookupEmployees()} clearable placeholder="Search people" /></Field>}
          <Field label="Due by" aside="Optional"><DateInput value={due} onChange={setDue} clearable /></Field>
        </FormGrid>
        <Field label="Notes" aside="Optional"><Textarea value={notes} onValueChange={setNotes} rows={2} /></Field>
      </div>
    </Modal>
  );
}

export function PoolForm({ open, pool, onClose, onSaved }: { open: boolean; pool: Pool | null; onClose: () => void; onSaved: (p: Pool) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [mgr, setMgr] = useState<number | null>(null);
  const [members, setMembers] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setName(pool?.name ?? ""); setDesc(pool?.description ?? ""); setMgr(pool?.manager_employee_id ?? null); setMembers([]); } }, [open, pool]);
  async function save() {
    setSaving(true);
    try {
      const body = { name, description: desc, manager_employee_id: mgr, employee_ids: members };
      const r = pool ? await api.put<Pool>(`/succession/pools/${pool.uuid}`, body) : await api.post<Pool>("/succession/pools", body);
      toast.success(pool ? "Pool saved" : "Talent pool created"); onSaved(r);
    } catch (e) { toast.error("Couldn't save", { description: (e as Error).message }); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title={pool ? "Edit talent pool" : "New talent pool"} busy={saving} zIndex={60}
      footer={<><ModalCancel /><Button variant="primary" disabled={!name.trim()} loading={saving} onClick={save}>Save</Button></>}>
      <div className="space-y-5">
        <Field label="Name" required><TextInput value={name} onValueChange={setName} placeholder="e.g. High potentials" /></Field>
        <Field label="Pool manager" aside="Optional"><Select<number> value={mgr} onChange={setMgr} loadOptions={lookupEmployees()} clearable placeholder="Search people"
          selectedOption={pool?.manager ? { value: pool.manager.id, label: pool.manager.name } : null} /></Field>
        <Field label="What it is for" aside="Optional"><Textarea value={desc} onValueChange={setDesc} rows={2} /></Field>
        {!pool && <Field label="Members" aside="Optional"><MultiSelect<number> value={members} onChange={setMembers} loadOptions={lookupEmployees()} placeholder="Add people" /></Field>}
      </div>
    </Modal>
  );
}

export function PoolDetail({ uuid, onClose, onChanged, onEdit }: { uuid: string | null; onClose: () => void; onChanged: () => void; onEdit: (p: Pool) => void }) {
  const toast = useToast();
  const [pool, setPool] = useState<Pool | null>(null);
  const [add, setAdd] = useState<number[]>([]);
  const [suggest, setSuggest] = useState<{ id: number; name: string; box_label: string | null }[] | null>(null);
  useEffect(() => {
    if (!uuid) { setPool(null); setSuggest(null); return; }
    setAdd([]); setSuggest(null);
    api.get<Pool>(`/succession/pools/${uuid}`).then(setPool).catch((e) => toast.error(e.message));
  }, [uuid, toast]);
  async function addMembers(ids: number[]) {
    if (!pool || !ids.length) return;
    try {
      const r = await api.post<{ added: number; pool: Pool }>(`/succession/pools/${pool.uuid}/members`, { employee_ids: ids });
      setPool(r.pool); setAdd([]); setSuggest((s) => s?.filter((x) => !ids.includes(x.id)) ?? null); onChanged();
      toast.success(`${r.added} added`);
    } catch (e) { toast.error((e as Error).message); }
  }
  async function removeMember(m: string) {
    if (!pool) return;
    try { setPool(await api.delete<Pool>(`/succession/pools/${pool.uuid}/members/${m}`)); onChanged(); } catch (e) { toast.error((e as Error).message); }
  }
  return (
    <Modal open={!!uuid} onClose={onClose} size="lg" title={pool?.name ?? "Talent pool"} description={pool?.description ?? undefined}
      footer={pool && <><Button onClick={() => onEdit(pool)}>Edit</Button><ModalCancel>Done</ModalCancel></>}>
      {!pool ? <Skeleton className="h-48 rounded-xl" /> : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Add people" className="min-w-0 flex-1"><MultiSelect<number> value={add} onChange={setAdd} loadOptions={lookupEmployees()} placeholder="Search people" /></Field>
            <Button variant="primary" icon={Plus} disabled={!add.length} onClick={() => addMembers(add)}>Add</Button>
            <Button icon={Sparkles} onClick={() => api.get<{ items: { id: number; name: string; box_label: string | null }[] }>(`/succession/pools/${pool.uuid}/suggestions`).then((r) => setSuggest(r.items)).catch(() => setSuggest([]))}>Suggest from nine-box</Button>
          </div>
          {suggest && (
            <div className="rounded-xl border border-line p-4">
              <p className="mb-2 text-[13px] text-muted">{suggest.length ? "High potentials from the latest reviews who are not in this pool:" : "No high potentials outside this pool."}</p>
              <div className="flex flex-wrap gap-2">
                {suggest.map((s) => (
                  <button key={s.id} type="button" onClick={() => addMembers([s.id])} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[13px] text-ink hover:border-primary/40">
                    <Plus size={12} strokeWidth={1.4} />{s.name}<span className="text-faint">· {s.box_label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <ul className="divide-y divide-line">
            {!(pool.members ?? []).length && <li className="py-8 text-center text-[13.5px] text-faint">No members yet.</li>}
            {(pool.members ?? []).map((m) => (
              <li key={m.uuid} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <PersonCell person={m.employee} hint={[m.designation, m.department].filter(Boolean).join(" · ")} />
                <div className="flex items-center gap-3"><TalentChip talent={m.talent} /><IconButton icon={Trash2} label="Remove from pool" onClick={() => removeMember(m.uuid)} /></div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

export function ReadinessChips({ counts }: { counts: Record<string, number> }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {(["ready_now", "one_two_years", "three_plus_years"] as const).map((k) => counts[k] ? <Badge key={k} tone={READINESS_TONE[k]}>{counts[k]} {k === "ready_now" ? "ready now" : `in ${READINESS_SHORT[k]}`}</Badge> : null)}
      {!Object.values(counts).some(Boolean) && <span className="text-[13px] text-faint">None yet</span>}
    </span>
  );
}
