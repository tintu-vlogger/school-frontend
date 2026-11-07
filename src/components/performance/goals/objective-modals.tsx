"use client";

/*
 * Goal modals:
 *   <ObjectiveDetailModal uuid onClose onEdit onCheckin onOpen onChanged statuses />
 *       key results with their check-in plan (on time / late / missed / planned), alignment
 *       up and down, and the check-in history.
 *   <ObjectiveFormModal open objective periods periodId canCompany onClose onSaved />
 *       add or edit an objective with its key results (number, %, milestones, yes/no).
 *   <CheckinModal objective krUuid onClose onSaved />
 *       record progress on one key result with confidence and a note.
 */
import { useEffect, useMemo, useState } from "react";
import { Archive, ArrowUpRight, CornerDownRight, Gauge, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, todayISO } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, Checkbox, DateInput, Field, FormGrid, FormSection, IconButton, Modal, ModalCancel, NumberInput, Select,
  Skeleton, SkeletonText, TextInput, Textarea, Timeline, Toggle, useConfirm, type SelectOption,
} from "@/components/ui-kit";
import {
  GoalStatusBadge, LevelBadge, PersonInline, ProgressBar, STROKE, levelLabel, searchEmployees, statusTone, useDepartments,
} from "../shared";
import type { GoalStatus, KeyResult, Objective, Period } from "../types";
import { CheckinPlan, krValueText } from "./objective-card";

/* ── Details ──────────────────────────────────────────────────────────── */

export function ObjectiveDetailModal({ uuid, onClose, onEdit, onCheckin, onOpen, onChanged, statuses }: {
  uuid: string | null; onClose: () => void; onEdit: (o: Objective) => void; onCheckin: (o: Objective, krUuid?: string) => void;
  onOpen: (uuid: string) => void; onChanged: () => void; statuses?: GoalStatus[];
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [state, setState] = useState<{ uuid: string; o: Objective | null } | null>(null);
  useEffect(() => {
    if (!uuid) return;
    let live = true;
    api.get<Objective>(`/performance/objectives/${uuid}`)
      .then((o) => { if (live) setState({ uuid, o }); })
      .catch(() => { if (live) setState({ uuid, o: null }); });
    return () => { live = false; };
  }, [uuid]);
  const o = state && (uuid === null || state.uuid === uuid) ? state.o : null;
  const loading = !!uuid && (!state || state.uuid !== uuid);

  async function archive() {
    if (!o) return;
    const ok = await confirm({ title: `Archive “${o.title}”?`, message: "It disappears from goal lists. Objectives aligned to it are unlinked and its parent is recalculated.", confirmLabel: "Archive", tone: "danger" });
    if (!ok) return;
    try {
      await api.delete(`/performance/objectives/${o.uuid}`);
      toast.success("Objective archived");
      onChanged();
      onClose();
    } catch (e) { toast.error("Couldn't archive", { description: e instanceof Error ? e.message : undefined }); }
  }

  return (
    <Modal open={!!uuid} onClose={onClose} size="xl"
      title={o ? o.title : loading ? "Loading…" : "Objective"}
      description={o ? `${levelLabel(o.level)} objective · ${o.period.name}` : undefined}
      footerStart={o?.can_edit ? <Button variant="ghost" icon={Archive} onClick={archive}>Archive</Button> : undefined}
      footer={o ? <>
        {o.can_edit && <Button variant="secondary" icon={Pencil} onClick={() => onEdit(o)}>Edit</Button>}
        {o.can_edit && o.key_results.length > 0 && <Button variant="primary" icon={Gauge} onClick={() => onCheckin(o)}>Check in</Button>}
      </> : undefined}>
      {loading ? (
        <div className="space-y-6"><Skeleton className="h-20" /><SkeletonText lines={6} /></div>
      ) : !o ? (
        <p className="py-10 text-center text-[14px] text-muted">This objective couldn&apos;t be found.</p>
      ) : (
        <div className="space-y-8">
          <div className="grid gap-5 rounded-2xl border border-line bg-sunken/40 p-5 sm:grid-cols-[1fr_auto]">
            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2"><LevelBadge level={o.level} /><GoalStatusBadge statusKey={o.status_key} statuses={statuses} />
                {o.status_manual && <Badge>Status set by hand</Badge>}</div>
              {o.description && <p className="text-[14px] leading-relaxed text-ink/80">{o.description}</p>}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted">
                {o.owner && <PersonInline person={o.owner} size={22} />}
                {o.department && <span>{o.department.name}</span>}
                <span>Weight {o.weight}</span>
                {o.confidence !== null && <span>Confidence {o.confidence}/10</span>}
                {o.due_date && <span>Due {formatDate(o.due_date)}</span>}
              </div>
            </div>
            <div className="sm:w-56">
              <p className="tabular text-[34px] font-extralight leading-none text-ink">{Math.round(o.progress)}<span className="text-[16px] text-muted">%</span></p>
              <p className="mb-3 mt-1 text-[12px] text-muted">Should be about {Math.round(o.expected_progress)}% by today</p>
              <ProgressBar value={o.progress} expected={o.expected_progress} tone={statusTone(statuses, o.status_key)} height={8} />
            </div>
          </div>

          <section>
            <h3 className="mb-3 text-[13px] uppercase tracking-[0.08em] text-faint">Key results</h3>
            {o.key_results.length === 0 ? <p className="text-[13.5px] text-muted">No key results yet. Progress comes from aligned objectives.</p> : (
              <div className="divide-y divide-line rounded-2xl border border-line">
                {o.key_results.map((k) => <KrDetail key={k.uuid} kr={k} statuses={statuses} canCheckin={o.can_edit} onCheckin={() => onCheckin(o, k.uuid)} />)}
              </div>
            )}
          </section>

          {(o.parent || (o.children && o.children.length > 0)) && (
            <section>
              <h3 className="mb-3 text-[13px] uppercase tracking-[0.08em] text-faint">Alignment</h3>
              <div className="space-y-2">
                {o.parent && (
                  <button type="button" onClick={() => onOpen(o.parent!.uuid)} className="flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-line-strong">
                    <ArrowUpRight size={16} strokeWidth={STROKE} className="text-primary" />
                    <span className="min-w-0 flex-1"><span className="block text-[12px] text-muted">Rolls up into · {levelLabel(o.parent.level)}</span><span className="block truncate text-[14px] text-ink">{o.parent.title}</span></span>
                    <span className="tabular text-[13px] text-muted">{Math.round(o.parent.progress)}%</span>
                  </button>
                )}
                {o.children?.map((c) => (
                  <button key={c.uuid} type="button" onClick={() => onOpen(c.uuid)} className="flex w-full items-center gap-3 rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-line-strong">
                    <CornerDownRight size={16} strokeWidth={STROKE} className="text-faint" />
                    <span className="min-w-0 flex-1"><span className="block text-[12px] text-muted">{levelLabel(c.level)} · {c.owner?.name ?? "—"} · weight {c.weight}</span><span className="block truncate text-[14px] text-ink">{c.title}</span></span>
                    <span className="w-24"><ProgressBar value={c.progress} tone={statusTone(statuses, c.status_key)} height={4} /></span>
                    <span className="tabular w-10 text-right text-[13px] text-muted">{Math.round(c.progress)}%</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="mb-3 text-[13px] uppercase tracking-[0.08em] text-faint">Check-ins</h3>
            {o.checkins && o.checkins.length > 0 ? (
              <Timeline items={o.checkins.slice(0, 30).map((c) => ({
                id: c.uuid,
                title: <span>{c.key_result ?? "Objective note"}{c.value !== null && <span className="text-muted"> · {c.value.toLocaleString("en-IN")}</span>}{c.progress !== null && <span className="text-muted"> · {Math.round(c.progress)}%</span>}</span>,
                description: <span>{c.note}{c.confidence !== null && <span className="ml-1 text-faint">Confidence {c.confidence}/10.</span>} {c.author && <span className="text-faint">— {c.author}</span>}</span>,
                time: formatDate(c.date),
                tone: c.confidence !== null && c.confidence <= 4 ? "warn" : "accent",
              }))} />
            ) : <p className="text-[13.5px] text-muted">No check-ins yet.</p>}
          </section>
        </div>
      )}
    </Modal>
  );
}

function KrDetail({ kr, statuses, canCheckin, onCheckin }: { kr: KeyResult; statuses?: GoalStatus[]; canCheckin: boolean; onCheckin: () => void }) {
  return (
    <div className="space-y-3 px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[14.5px] text-ink">{kr.title}</p>
          <p className="mt-0.5 flex flex-wrap gap-x-4 text-[12.5px] text-muted">
            <span className="tabular">{krValueText(kr)}</span>
            {kr.owner && <span>{kr.owner.name}</span>}
            <span>Weight {kr.weight}</span>
            {kr.confidence !== null && <span>Confidence {kr.confidence}/10</span>}
            {kr.deviation > 0 && <span className="text-amber-700">{Math.round(kr.deviation)} points behind plan</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <GoalStatusBadge statusKey={kr.status_key} statuses={statuses} />
          <span className="tabular w-11 text-right text-[15px] text-ink">{Math.round(kr.progress)}%</span>
          {canCheckin && <IconButton icon={Gauge} label="Check in" size="sm" onClick={onCheckin} />}
        </div>
      </div>
      <ProgressBar value={kr.progress} expected={kr.expected_progress} tone={statusTone(statuses, kr.status_key)} height={5} />
      {kr.kind === "milestone" && (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {kr.milestones.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-[13px]">
              <span className={`h-2 w-2 rounded-full ${m.done ? "bg-emerald-500" : "bg-line-strong"}`} />
              <span className={m.done ? "text-ink/80" : "text-muted"}>{m.title}</span>
              {m.done_on && <span className="text-faint">· {formatDate(m.done_on)}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[12px] text-faint">{kr.checkin_frequency === "none" ? "No planned check-ins" : `Check-ins ${kr.checkin_frequency}`}</span>
        <CheckinPlan flags={kr.checkin_plan} />
      </div>
    </div>
  );
}

/* ── Add / edit ───────────────────────────────────────────────────────── */

type MsDraft = { id?: string; title: string; weight: number; done?: boolean; due_date?: string | null };
type KrDraft = {
  uuid?: string; title: string; kind: KeyResult["kind"]; unit: string; start_value: number | null; target_value: number | null;
  current_value: number | null; weight: number | null; owner_employee_id: number | null; owner_label?: string;
  checkin_frequency: KeyResult["checkin_frequency"]; milestones: MsDraft[];
};
type Draft = {
  level: Objective["level"]; period_id: number | null; title: string; description: string; owner_employee_id: number | null;
  owner_label?: string; department_id: number | null; parent_id: number | null; weight: number | null; due_date: string;
  visibility: Objective["visibility"]; key_results: KrDraft[];
};

const KIND_OPTIONS: SelectOption[] = [
  { value: "number", label: "Number" }, { value: "percent", label: "Percentage" },
  { value: "milestone", label: "Milestones" }, { value: "boolean", label: "Yes / no" },
];
const FREQ_OPTIONS: SelectOption[] = [
  { value: "weekly", label: "Weekly" }, { value: "fortnightly", label: "Fortnightly" }, { value: "monthly", label: "Monthly" }, { value: "none", label: "No plan" },
];
const ALIGN_TO: Record<string, string[]> = { company: ["company"], department: ["company"], team: ["company", "department"], individual: ["company", "department", "team"] };

const blankKr = (): KrDraft => ({ title: "", kind: "number", unit: "", start_value: 0, target_value: 100, current_value: null, weight: 1, owner_employee_id: null, checkin_frequency: "weekly", milestones: [] });

function toDraft(o: Objective | null, periodId: number | null, level: Objective["level"], me: { id: number | null; name?: string }): Draft {
  if (!o) {
    return { level, period_id: periodId, title: "", description: "", owner_employee_id: level === "individual" || level === "team" ? me.id : null,
      owner_label: me.name, department_id: null, parent_id: null, weight: 1, due_date: "", visibility: "everyone", key_results: [blankKr()] };
  }
  return {
    level: o.level, period_id: o.period.id, title: o.title, description: o.description ?? "", owner_employee_id: o.owner?.id ?? null,
    owner_label: o.owner?.name, department_id: o.department?.id ?? null, parent_id: o.parent_id, weight: o.weight, due_date: o.due_date ?? "",
    visibility: o.visibility,
    key_results: o.key_results.map((k) => ({
      uuid: k.uuid, title: k.title, kind: k.kind, unit: k.unit ?? "", start_value: k.start_value, target_value: k.target_value,
      current_value: k.current_value, weight: k.weight, owner_employee_id: k.owner?.id ?? null, owner_label: k.owner?.name,
      checkin_frequency: k.checkin_frequency, milestones: k.milestones.map((m) => ({ id: m.id, title: m.title, weight: m.weight, done: m.done, due_date: m.due_date })),
    })),
  };
}

export function ObjectiveFormModal({ open, objective, periods, periodId, defaultLevel = "individual", canCompany, me, onClose, onSaved }: {
  open: boolean; objective: Objective | null; periods: Period[]; periodId: number | null; defaultLevel?: Objective["level"];
  canCompany: boolean; me: { id: number | null; name?: string }; onClose: () => void; onSaved: (uuid: string) => void;
}) {
  const toast = useToast();
  const departments = useDepartments();
  const [draft, setDraft] = useState<Draft>(() => toDraft(objective, periodId, defaultLevel, me));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parents, setParents] = useState<Objective[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !draft.period_id) return;
    let live = true;
    api.get<Objective[]>(`/performance/objectives?period_id=${draft.period_id}`).then((r) => { if (live) setParents(r); }).catch(() => {});
    return () => { live = false; };
  }, [open, draft.period_id]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setDraft((d) => ({ ...d, [k]: v })); setDirty(true); };
  const setKr = (i: number, patch: Partial<KrDraft>) => { setDraft((d) => ({ ...d, key_results: d.key_results.map((k, j) => (j === i ? { ...k, ...patch } : k)) })); setDirty(true); };

  const parentOptions = useMemo<SelectOption<number>[]>(() => parents
    .filter((p) => ALIGN_TO[draft.level]?.includes(p.level) && p.uuid !== objective?.uuid)
    .map((p) => ({ value: p.id, label: p.title, description: `${levelLabel(p.level)}${p.owner ? ` · ${p.owner.name}` : ""}` })), [parents, draft.level, objective]);

  const levelOptions: SelectOption[] = [
    ...(canCompany ? [{ value: "company", label: "Company" }] : []),
    { value: "department", label: "Department" }, { value: "team", label: "Team" }, { value: "individual", label: "Individual" },
  ];
  const periodOptions: SelectOption<number>[] = periods.map((p) => ({ value: p.id, label: p.name, description: `${formatDate(p.start_date)} – ${formatDate(p.end_date)}` }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!draft.title.trim()) return setError("Give the objective a title.");
    if (!draft.period_id) return setError("Pick the period.");
    const body = {
      level: draft.level, period_id: draft.period_id, title: draft.title.trim(), description: draft.description || null,
      owner_employee_id: draft.owner_employee_id, department_id: draft.department_id, parent_id: draft.parent_id,
      weight: draft.weight ?? 1, due_date: draft.due_date || null, visibility: draft.visibility,
      key_results: draft.key_results.filter((k) => k.title.trim()).map((k) => ({
        uuid: k.uuid, title: k.title.trim(), kind: k.kind, unit: k.unit || null, start_value: k.start_value ?? 0,
        target_value: k.kind === "boolean" ? 1 : k.target_value, current_value: k.uuid ? undefined : k.current_value ?? undefined,
        weight: k.weight ?? 1, owner_employee_id: k.owner_employee_id, checkin_frequency: k.checkin_frequency,
        milestones: k.milestones.filter((m) => m.title.trim()),
      })),
    };
    setSaving(true);
    try {
      const r = objective
        ? await api.put<Objective>(`/performance/objectives/${objective.uuid}`, body)
        : await api.post<Objective>("/performance/objectives", body);
      toast.success(objective ? "Objective saved" : "Objective added");
      setDirty(false);
      onSaved(r.uuid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={() => { setDirty(false); onClose(); }} size="xl" dirty={dirty} busy={saving}
      title={objective ? "Edit objective" : "Add objective"}
      description="An objective is what you want to achieve; key results say how you'll know you got there."
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="objective-form" loading={saving}>{objective ? "Save changes" : "Add objective"}</Button></>}>
      <form id="objective-form" onSubmit={save} className="space-y-8">
        {error && <p className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-[13.5px] text-rose-700">{error}</p>}
        <FormSection title="Objective">
          <FormGrid columns={2}>
            <Field label="Title" required className="sm:col-span-2">
              <TextInput value={draft.title} onValueChange={(v) => set("title", v)} placeholder="e.g. Make onboarding self-serve" autoFocusInModal />
            </Field>
            <Field label="Level" required>
              <Select value={draft.level} onChange={(v) => v && set("level", v as Draft["level"])} options={levelOptions} disabled={!!objective} />
            </Field>
            <Field label="Period" required>
              <Select value={draft.period_id} onChange={(v) => set("period_id", v)} options={periodOptions} disabled={!!objective} />
            </Field>
            {draft.level === "department" ? (
              <Field label="Department" required>
                <Select value={draft.department_id} onChange={(v) => set("department_id", v)} options={departments} clearable />
              </Field>
            ) : null}
            <Field label="Owner" required={draft.level !== "company" && draft.level !== "department"}>
              <Select<number> value={draft.owner_employee_id} onChange={(v, opt) => { set("owner_employee_id", v); set("owner_label", opt?.label); }}
                loadOptions={searchEmployees} clearable
                selectedOption={draft.owner_employee_id ? { value: draft.owner_employee_id, label: draft.owner_label ?? "Selected" } : null} />
            </Field>
            {draft.level !== "company" || parentOptions.length > 0 ? (
              <Field label="Aligns to" hint="Its progress counts toward this objective" className="sm:col-span-2">
                <Select value={draft.parent_id} onChange={(v) => set("parent_id", v)} options={parentOptions} clearable placeholder="Not aligned" emptyText="No objectives to align to in this period" />
              </Field>
            ) : null}
            <Field label="Weight" hint="When it rolls up into its parent">
              <NumberInput value={draft.weight} onChange={(v) => set("weight", v)} min={0} step={0.5} />
            </Field>
            <Field label="Due date" hint="Defaults to the end of the period">
              <DateInput value={draft.due_date} onChange={(v) => set("due_date", v)} clearable />
            </Field>
            <Field label="Who can see it" className="sm:col-span-2">
              <Select value={draft.visibility} onChange={(v) => v && set("visibility", v as Draft["visibility"])}
                options={[{ value: "everyone", label: "Everyone" }, { value: "team", label: "Owner, their managers and HR" }, { value: "private", label: "Only the owner, their managers and HR" }]} />
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <Textarea value={draft.description} onValueChange={(v) => set("description", v)} rows={2} autoGrow placeholder="Why this matters" />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Key results" description="Measurable outcomes. Weights decide how much each one counts.">
          <div className="space-y-3">
            {draft.key_results.map((k, i) => (
              <KrEditor key={k.uuid ?? `n${i}`} kr={k} index={i} isNew={!k.uuid} onChange={(p) => setKr(i, p)}
                onRemove={() => { setDraft((d) => ({ ...d, key_results: d.key_results.filter((_, j) => j !== i) })); setDirty(true); }} />
            ))}
            <Button variant="secondary" icon={Plus} type="button" onClick={() => { setDraft((d) => ({ ...d, key_results: [...d.key_results, blankKr()] })); setDirty(true); }}>
              Add key result
            </Button>
          </div>
        </FormSection>
      </form>
    </Modal>
  );
}

function KrEditor({ kr, index, isNew, onChange, onRemove }: { kr: KrDraft; index: number; isNew: boolean; onChange: (p: Partial<KrDraft>) => void; onRemove: () => void }) {
  return (
    <div className="rounded-2xl border border-line bg-sunken/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[12px] uppercase tracking-[0.08em] text-faint">Key result {index + 1}</span>
        <IconButton icon={Trash2} label="Remove key result" size="sm" onClick={onRemove} />
      </div>
      <FormGrid columns={3}>
        <Field label="Title" className="sm:col-span-2">
          <TextInput value={kr.title} onValueChange={(v) => onChange({ title: v })} placeholder="e.g. Raise NPS from 42 to 55" />
        </Field>
        <Field label="Type">
          <Select value={kr.kind} onChange={(v) => v && onChange({ kind: v as KrDraft["kind"], milestones: v === "milestone" && !kr.milestones.length ? [{ title: "", weight: 1 }] : kr.milestones })} options={KIND_OPTIONS} />
        </Field>
        {(kr.kind === "number" || kr.kind === "percent") && <>
          <Field label="Start"><NumberInput value={kr.start_value} onChange={(v) => onChange({ start_value: v })} step={0.1} suffix={kr.kind === "percent" ? "%" : undefined} /></Field>
          <Field label="Target"><NumberInput value={kr.target_value} onChange={(v) => onChange({ target_value: v })} step={0.1} suffix={kr.kind === "percent" ? "%" : undefined} /></Field>
          {kr.kind === "number"
            ? <Field label="Unit"><TextInput value={kr.unit} onValueChange={(v) => onChange({ unit: v })} placeholder="₹ lakh, hires, ms" /></Field>
            : isNew ? <Field label="Current"><NumberInput value={kr.current_value} onChange={(v) => onChange({ current_value: v })} suffix="%" /></Field> : <div />}
        </>}
        <Field label="Owner">
          <Select<number> value={kr.owner_employee_id} onChange={(v, o) => onChange({ owner_employee_id: v, owner_label: o?.label })} loadOptions={searchEmployees} clearable
            placeholder="Objective owner" selectedOption={kr.owner_employee_id ? { value: kr.owner_employee_id, label: kr.owner_label ?? "Selected" } : null} />
        </Field>
        <Field label="Weight"><NumberInput value={kr.weight} onChange={(v) => onChange({ weight: v })} min={0} step={0.5} /></Field>
        <Field label="Check-ins"><Select value={kr.checkin_frequency} onChange={(v) => v && onChange({ checkin_frequency: v as KrDraft["checkin_frequency"] })} options={FREQ_OPTIONS} /></Field>
      </FormGrid>
      {kr.kind === "milestone" && (
        <div className="mt-4 space-y-2">
          <p className="text-[12.5px] text-muted">Milestones (up to 10). Weight decides how much each one is worth.</p>
          {kr.milestones.map((m, j) => (
            <div key={m.id ?? `m${j}`} className="grid grid-cols-[1fr_110px_auto] items-center gap-2">
              <TextInput value={m.title} onValueChange={(v) => onChange({ milestones: kr.milestones.map((x, y) => (y === j ? { ...x, title: v } : x)) })} placeholder={`Milestone ${j + 1}`} aria-label={`Milestone ${j + 1}`} />
              <NumberInput value={m.weight} onChange={(v) => onChange({ milestones: kr.milestones.map((x, y) => (y === j ? { ...x, weight: v ?? 1 } : x)) })} min={0.5} step={0.5} suffix="wt" />
              <IconButton icon={Trash2} label="Remove milestone" size="sm" onClick={() => onChange({ milestones: kr.milestones.filter((_, y) => y !== j) })} />
            </div>
          ))}
          {kr.milestones.length < 10 && <Button size="sm" variant="ghost" icon={Plus} type="button" onClick={() => onChange({ milestones: [...kr.milestones, { title: "", weight: 1 }] })}>Add milestone</Button>}
        </div>
      )}
    </div>
  );
}

/* ── Check in ─────────────────────────────────────────────────────────── */

export function CheckinModal({ objective, krUuid, onClose, onSaved }: { objective: Objective | null; krUuid?: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const krs = objective?.key_results ?? [];
  const [pick, setPick] = useState<string | null>(krUuid ?? krs[0]?.uuid ?? null);
  const kr = krs.find((k) => k.uuid === pick) ?? null;
  const [value, setValue] = useState<number | null>(kr?.current_value ?? null);
  const [done, setDone] = useState<string[]>(kr ? kr.milestones.filter((m) => m.done).map((m) => m.id) : []);
  const [yes, setYes] = useState<boolean>(!!kr && kr.current_value >= 1);
  const [confidence, setConfidence] = useState<number>(kr?.confidence ?? 7);
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  function choose(u: string | null) {
    setPick(u);
    const k = krs.find((x) => x.uuid === u);
    if (k) { setValue(k.current_value); setDone(k.milestones.filter((m) => m.done).map((m) => m.id)); setYes(k.current_value >= 1); if (k.confidence) setConfidence(k.confidence); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!objective || !kr) return;
    setSaving(true);
    try {
      await api.post(`/performance/objectives/${objective.uuid}/checkins`, {
        key_result_uuid: kr.uuid, value: kr.kind === "boolean" ? yes : value, milestones_done: done,
        confidence, note: note.trim() || null, checkin_date: when,
      });
      toast.success("Check-in saved");
      onSaved();
    } catch (err) {
      toast.error("Couldn't save the check-in", { description: err instanceof Error ? err.message : undefined });
    } finally { setSaving(false); }
  }

  const tone = confidence <= 3 ? "bg-rose-500" : confidence <= 6 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <Modal open={!!objective} onClose={onClose} size="md" busy={saving} title="Check in" description={objective?.title}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="checkin-form" loading={saving} disabled={!kr}>Save check-in</Button></>}>
      <form id="checkin-form" onSubmit={save} className="space-y-5">
        <Field label="Key result">
          <Select value={pick} onChange={choose} options={krs.map((k) => ({ value: k.uuid, label: k.title, description: `${krValueText(k)} · ${Math.round(k.progress)}%` }))} />
        </Field>
        {kr && (kr.kind === "number" || kr.kind === "percent") && (
          <Field label="Current value" hint={`Started at ${kr.start_value}, target ${kr.target_value}${kr.unit ? ` ${kr.unit}` : ""}`}>
            <NumberInput value={value} onChange={setValue} step={0.1} suffix={kr.kind === "percent" ? "%" : kr.unit ?? undefined} />
          </Field>
        )}
        {kr?.kind === "boolean" && <Toggle checked={yes} onChange={setYes} label="Done" description="Switch on when this is achieved" />}
        {kr?.kind === "milestone" && (
          <Field label="Milestones reached">
            <div className="space-y-2 rounded-xl border border-line p-3">
              {kr.milestones.map((m) => (
                <Checkbox key={m.id} checked={done.includes(m.id)} label={m.title}
                  onChange={(c) => setDone((d) => (c ? [...d, m.id] : d.filter((x) => x !== m.id)))} />
              ))}
            </div>
          </Field>
        )}
        <Field label="How confident are you of hitting it?" aside={<span className="tabular text-[13px] text-ink">{confidence}/10</span>}>
          <div className="flex gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button key={n} type="button" onClick={() => setConfidence(n)} aria-label={`Confidence ${n}`}
                className={`h-8 flex-1 rounded-md border text-[12px] transition-colors ${n <= confidence ? `${tone} border-transparent text-white` : "border-line bg-surface text-muted hover:border-line-strong"}`}>{n}</button>
            ))}
          </div>
        </Field>
        <FormGrid columns={2}>
          <Field label="Date"><DateInput value={when} onChange={setWhen} max={todayISO()} /></Field>
        </FormGrid>
        <Field label="Note"><Textarea value={note} onValueChange={setNote} rows={3} placeholder="What moved, what's blocking" /></Field>
        {kr && kr.checkin_plan.length > 0 && <div className="space-y-2"><p className="text-[12.5px] text-muted">Planned check-ins</p><CheckinPlan flags={kr.checkin_plan} /></div>}
      </form>
    </Modal>
  );
}

