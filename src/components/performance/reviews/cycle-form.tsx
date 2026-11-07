"use client";

/*
 * Add or edit a review cycle, as a four-step wizard in a modal:
 *   <CycleFormModal open cycle={Cycle | null} onClose onSaved={(c) => ...} />
 * 1 Basics (name, kind, template, scale, goal period, dates)  2 Who takes part (rule with a
 * live head-count)  3 Stages, deadlines, reviewer weightage and peer rules  4 Calibration
 * target distribution, acknowledgement, letters.
 */
import { useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Button, DateInput, DateRangeInput, Field, FormGrid, FormSection, Modal, ModalCancel, MultiSelect, NumberInput, RadioCards, Select,
  Stepper, TextInput, Toggle,
} from "@/components/ui-kit";
import { employeeLabels, searchEmployees, useDepartments, useDesignations, useList } from "../shared";
import type { Cycle, CycleSettings, ParticipantRule, Period, RatingScale, ReviewTemplate, Stage } from "../types";
import { KIND_LABEL, TYPE_LABEL } from "./misc";
import type { SelectOption } from "@/components/ui-kit";

type Values = {
  name: string; kind: Cycle["kind"]; template_id: number | null; rating_scale_id: number | null; goal_period_id: number | null;
  period_start: string; period_end: string; rule: ParticipantRule; stages: Stage[]; weightage: Record<string, number>;
  settings: CycleSettings;
};

const STAGE_KEYS: Stage["key"][] = ["self", "peer", "manager", "skip", "calibration"];
const STAGE_LABEL: Record<string, string> = { self: "Self review", peer: "Peer review", manager: "Manager review", skip: "Skip-level review", calibration: "Calibration" };
const STAGE_HINT: Record<string, string> = {
  self: "Everyone reviews their own period.", peer: "Colleagues give a short review.", manager: "The reporting manager reviews.",
  skip: "The manager's manager adds a view.", calibration: "HR evens out ratings across teams.",
};

function blank(): Values {
  const y = new Date().getFullYear();
  return {
    name: "", kind: "annual", template_id: null, rating_scale_id: null, goal_period_id: null,
    period_start: `${y - 1}-04-01`, period_end: `${y}-03-31`,
    rule: { department_ids: [], designation_ids: [], condition: "", include_ids: [], exclude_ids: [], joined_before: null },
    stages: STAGE_KEYS.map((k) => ({ key: k, label: STAGE_LABEL[k], enabled: k === "self" || k === "manager" || k === "calibration", deadline: null })),
    weightage: { self: 20, manager: 80, peer: 0, skip: 0 },
    settings: {
      peer: { min: 1, max: 3, nominate_by: "employee", needs_approval: true },
      calibration: { enabled: true, distribution: {}, require_ack: true, require_reason: true },
      letters: true, manager_sees_self_review: true,
    },
  };
}

function fromCycle(c: Cycle): Values {
  const b = blank();
  const stages = STAGE_KEYS.map((k) => c.stages.find((s) => s.key === k) ?? b.stages.find((s) => s.key === k)!);
  return {
    name: c.name, kind: c.kind, template_id: c.template?.id ?? null, rating_scale_id: c.rating_scale?.id ?? null,
    goal_period_id: c.goal_period_id, period_start: c.period_start, period_end: c.period_end,
    rule: { ...b.rule, ...c.participant_rule }, stages, weightage: { ...b.weightage, ...c.weightage },
    settings: { ...b.settings, ...c.settings, peer: { ...b.settings.peer, ...c.settings.peer }, calibration: { ...b.settings.calibration, ...c.settings.calibration } },
  };
}

function Sum({ total }: { total: number }) {
  const ok = Math.abs(total - 100) < 0.01;
  return <span className={`tabular text-[13px] ${ok ? "text-emerald-700" : "text-rose-600"}`}>Total {Math.round(total * 100) / 100}%{ok ? "" : " · must be 100%"}</span>;
}

export function CycleFormModal({ open, cycle, onClose, onSaved }: { open: boolean; cycle: Cycle | null; onClose: () => void; onSaved: (c: Cycle) => void }) {
  const toast = useToast();
  const [v, setV] = useState<Values>(() => (cycle ? fromCycle(cycle) : blank()));
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ count: number; people: { name: string }[] } | null>(null);
  const [labels, setLabels] = useState<SelectOption<number>[]>([]);
  const templates = useList<ReviewTemplate>(open ? "/performance/templates" : null, "Couldn't load templates").rows;
  const scales = useList<RatingScale>(open ? "/performance/rating-scales" : null, "Couldn't load scales").rows;
  const periods = useList<Period>(open ? "/performance/periods" : null, "Couldn't load periods").rows;
  const departments = useDepartments();
  const designations = useDesignations();
  const locked = !!cycle && cycle.status !== "draft";

  useEffect(() => {
    const ids = [...v.rule.include_ids, ...v.rule.exclude_ids];
    if (ids.length) employeeLabels(ids).then(setLabels).catch(() => {});
    // only on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof Values>(k: K, val: Values[K]) => { setV((p) => ({ ...p, [k]: val })); setDirty(true); };
  const setRule = (patch: Partial<ParticipantRule>) => set("rule", { ...v.rule, ...patch });
  const setSettings = (patch: Partial<CycleSettings>) => set("settings", { ...v.settings, ...patch });

  // default template when the list arrives
  useEffect(() => {
    if (!v.template_id && templates.length) setV((p) => ({ ...p, template_id: templates.find((t) => t.name === "Annual review")?.id ?? templates[0].id }));
  }, [templates, v.template_id]);

  const scale = useMemo(() => {
    const tmpl = templates.find((t) => t.id === v.template_id);
    const sid = v.rating_scale_id ?? tmpl?.rating_scale_id;
    return scales.find((s) => s.id === sid) ?? scales.find((s) => s.is_default) ?? scales[0] ?? null;
  }, [templates, scales, v.template_id, v.rating_scale_id]);

  // live head-count for the rule
  const ruleKey = JSON.stringify(v.rule);
  useEffect(() => {
    if (!open || step !== 1) return;
    const t = setTimeout(() => {
      api.post<{ count: number; people: { name: string }[] }>("/performance/cycles/preview-participants", { participant_rule: v.rule })
        .then(setPreview).catch(() => setPreview(null));
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ruleKey, step, open]);

  const enabled = (k: string) => v.stages.find((s) => s.key === k)?.enabled;
  const reviewerTypes = (["self", "manager", "peer", "skip"] as const).filter((k) => enabled(k));
  const weightTotal = reviewerTypes.reduce((s, k) => s + (v.weightage[k] || 0), 0);
  const distTotal = Object.values(v.settings.calibration.distribution).reduce((s, x) => s + (x || 0), 0);
  const distOk = distTotal === 0 || Math.abs(distTotal - 100) < 0.01;

  function stepError(i: number): string | null {
    if (i === 0) {
      if (!v.name.trim()) return "Give the cycle a name.";
      if (!v.template_id) return "Pick a template.";
      if (!v.period_start || !v.period_end) return "Pick the review period.";
    }
    if (i === 2) {
      if (!enabled("self") && !enabled("manager")) return "Turn on the self or the manager review.";
      if (Math.abs(weightTotal - 100) > 0.01) return "Reviewer weightage must add up to 100%.";
    }
    if (i === 3 && !distOk) return "The target distribution must add up to 100%.";
    return null;
  }

  function next() {
    const err = stepError(step);
    if (err) { toast.error(err); return; }
    setStep((s) => s + 1);
  }

  async function save() {
    for (let i = 0; i < 4; i++) { const e = stepError(i); if (e) { setStep(i); toast.error(e); return; } }
    setBusy(true);
    const weightage = Object.fromEntries(Object.entries(v.weightage).map(([k, w]) => [k, enabled(k) ? w : 0]));
    const body = {
      name: v.name.trim(), kind: v.kind, template_id: v.template_id, rating_scale_id: v.rating_scale_id, goal_period_id: v.goal_period_id,
      period_start: v.period_start, period_end: v.period_end, participant_rule: v.rule, stages: v.stages, weightage, settings: v.settings,
    };
    try {
      const saved = cycle ? await api.put<Cycle>(`/performance/cycles/${cycle.uuid}`, body) : await api.post<Cycle>("/performance/cycles", body);
      toast.success(cycle ? "Cycle saved" : "Cycle created", { description: cycle ? undefined : "Launch it when you're ready." });
      setDirty(false); onSaved(saved); onClose();
    } catch (e) { toast.error("Couldn't save the cycle", { description: e instanceof Error ? e.message : undefined }); }
    finally { setBusy(false); }
  }

  const steps = [{ label: "Basics" }, { label: "Who takes part" }, { label: "Stages and weights" }, { label: "Calibration" }];

  return (
    <Modal open={open} onClose={() => { setDirty(false); onClose(); }} size="xl" dirty={dirty} busy={busy}
      title={cycle ? `Edit ${cycle.name}` : "New review cycle"}
      description="Set it up once; launching creates every review form."
      footerStart={<Stepper steps={steps} current={step} onStepClick={setStep} className="hidden md:flex" />}
      footer={<>
        {step > 0 ? <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button> : <ModalCancel />}
        {step < 3 ? <Button variant="primary" onClick={next}>Next</Button>
          : <Button variant="primary" loading={busy} onClick={save}>{cycle ? "Save cycle" : "Create cycle"}</Button>}
      </>}>
      <Stepper steps={steps} current={step} onStepClick={setStep} className="mb-7 md:hidden" />
      {step === 0 && (
        <div className="space-y-6">
          <FormGrid>
            <Field label="Name" required className="sm:col-span-2"><TextInput value={v.name} onValueChange={(x) => set("name", x)} placeholder="Annual review FY26-27" autoFocusInModal /></Field>
          </FormGrid>
          <Field label="Kind of review">
            <RadioCards<Cycle["kind"]> columns={4} value={v.kind} onChange={(k) => set("kind", k)}
              options={(Object.keys(KIND_LABEL) as Cycle["kind"][]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
          </Field>
          <FormGrid>
            <Field label="Template" required hint={locked ? "Can't change after launch." : undefined}>
              <Select<number> value={v.template_id} onChange={(x) => set("template_id", x)} disabled={locked}
                options={templates.map((t) => ({ value: t.id, label: t.name, description: t.sections.map((s) => `${s.title} ${s.weight}%`).join(" · ") }))} />
            </Field>
            <Field label="Rating scale" hint="Leave empty to use the template's.">
              <Select<number> value={v.rating_scale_id} onChange={(x) => set("rating_scale_id", x)} clearable
                options={scales.map((s) => ({ value: s.id, label: s.name, description: `${s.points.length} points` }))} />
            </Field>
            <Field label="Review period" required>
              <DateRangeInput value={{ from: v.period_start, to: v.period_end }} onChange={(r) => { set("period_start", r.from); setV((p) => ({ ...p, period_end: r.to })); }} />
            </Field>
            <Field label="Goals from" hint="Goals of this period are rated in the review.">
              <Select<number> value={v.goal_period_id} onChange={(x) => set("goal_period_id", x)} clearable placeholder="Goals that overlap the review period"
                options={periods.map((p) => ({ value: p.id, label: p.name }))} />
            </Field>
          </FormGrid>
        </div>
      )}
      {step === 1 && (
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-5">
            <FormGrid>
              <Field label="Departments" hint="Empty means every department.">
                <MultiSelect<number> value={v.rule.department_ids} onChange={(x) => setRule({ department_ids: x })} options={departments} placeholder="All departments" />
              </Field>
              <Field label="Designations" hint="Empty means every designation.">
                <MultiSelect<number> value={v.rule.designation_ids} onChange={(x) => setRule({ designation_ids: x })} options={designations} placeholder="All designations" />
              </Field>
              <Field label="Joined on or before" hint="Leave out recent joiners.">
                <DateInput value={v.rule.joined_before ?? ""} onChange={(x) => setRule({ joined_before: x || null })} clearable />
              </Field>
              <Field label="Condition (optional)" hint="e.g. employee.role != 'admin'">
                <TextInput value={v.rule.condition} onValueChange={(x) => setRule({ condition: x })} placeholder="employee.custom.grade in ['M1','M2']" />
              </Field>
              <Field label="Always include">
                <MultiSelect<number> value={v.rule.include_ids} onChange={(x, o) => { setRule({ include_ids: x }); setLabels((l) => [...l, ...o]); }}
                  loadOptions={searchEmployees} selectedOptions={labels.filter((l) => v.rule.include_ids.includes(l.value))} placeholder="Search people" />
              </Field>
              <Field label="Always leave out">
                <MultiSelect<number> value={v.rule.exclude_ids} onChange={(x, o) => { setRule({ exclude_ids: x }); setLabels((l) => [...l, ...o]); }}
                  loadOptions={searchEmployees} selectedOptions={labels.filter((l) => v.rule.exclude_ids.includes(l.value))} placeholder="Search people" />
              </Field>
            </FormGrid>
          </div>
          <div className="rounded-2xl border border-line bg-sunken/40 p-5">
            <div className="flex items-center gap-2 text-muted"><Users size={16} strokeWidth={1.4} /><span className="text-[13px]">Matching now</span></div>
            <p className="mt-2 text-[34px] font-extralight leading-none text-ink tabular">{preview ? preview.count : "…"}</p>
            <p className="mt-1 text-[12.5px] text-muted">active employees</p>
            {preview && preview.people.length > 0 && (
              <ul className="mt-4 max-h-[260px] space-y-1 overflow-y-auto text-[13px] text-ink/80">
                {preview.people.slice(0, 40).map((p, i) => <li key={i} className="truncate">{p.name}</li>)}
                {preview.count > 40 && <li className="text-faint">and {preview.count - 40} more</li>}
              </ul>
            )}
            {locked && <p className="mt-4 text-[12px] text-muted">Changes here don't add people to a running cycle; use Add people on the cycle.</p>}
          </div>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-8">
          <FormSection title="Stages" description="Turn on the reviews this cycle needs and set their deadlines.">
            <div className="divide-y divide-line rounded-xl border border-line">
              {v.stages.map((s, i) => (
                <div key={s.key} className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <Toggle checked={s.enabled} disabled={locked && s.key !== "calibration"} onChange={(on) => set("stages", v.stages.map((x, j) => (j === i ? { ...x, enabled: on } : x)))} />
                  <div className="min-w-[200px] flex-1">
                    <p className="text-[14px] text-ink">{STAGE_LABEL[s.key]}</p>
                    <p className="text-[12.5px] text-muted">{STAGE_HINT[s.key]}</p>
                  </div>
                  <div className="w-[190px]">
                    <DateInput value={s.deadline ?? ""} disabled={!s.enabled} clearable placeholder="Deadline"
                      onChange={(d) => set("stages", v.stages.map((x, j) => (j === i ? { ...x, deadline: d || null } : x)))} />
                  </div>
                </div>
              ))}
            </div>
          </FormSection>
          <FormSection title="Weightage" description="How much each reviewer's score counts towards the final rating.">
            <div className="flex flex-wrap items-end gap-4">
              {reviewerTypes.map((k) => (
                <Field key={k} label={`${TYPE_LABEL[k]} review`} className="w-[150px]">
                  <NumberInput value={v.weightage[k] ?? 0} onChange={(x) => set("weightage", { ...v.weightage, [k]: x ?? 0 })} min={0} max={100} suffix="%" />
                </Field>
              ))}
              <div className="pb-2.5"><Sum total={weightTotal} /></div>
            </div>
          </FormSection>
          {enabled("peer") && (
            <FormSection title="Peer reviews">
              <FormGrid columns={3}>
                <Field label="Fewest peers"><NumberInput value={v.settings.peer.min} min={0} max={10} onChange={(x) => setSettings({ peer: { ...v.settings.peer, min: x ?? 0 } })} /></Field>
                <Field label="Most peers"><NumberInput value={v.settings.peer.max} min={1} max={10} onChange={(x) => setSettings({ peer: { ...v.settings.peer, max: x ?? 3 } })} /></Field>
                <Field label="Chosen by">
                  <Select<string> value={v.settings.peer.nominate_by} onChange={(x) => setSettings({ peer: { ...v.settings.peer, nominate_by: (x as "employee" | "manager") ?? "employee" } })}
                    options={[{ value: "employee", label: "The employee" }, { value: "manager", label: "The manager" }]} />
                </Field>
              </FormGrid>
              <Toggle className="mt-4" checked={v.settings.peer.needs_approval} onChange={(x) => setSettings({ peer: { ...v.settings.peer, needs_approval: x } })}
                label="Manager approves the chosen peers" />
            </FormSection>
          )}
          <Toggle checked={v.settings.manager_sees_self_review} onChange={(x) => setSettings({ manager_sees_self_review: x })}
            label="Managers see the self review before writing theirs" />
        </div>
      )}
      {step === 3 && (
        <div className="space-y-8">
          <FormSection title="Target distribution" description="The share of people you expect at each rating. Leave all at 0 for no target.">
            <div className="flex flex-wrap items-end gap-3">
              {(scale?.points ?? []).map((p) => (
                <Field key={p.value} label={`${p.value} · ${p.label}`} className="w-[150px]">
                  <NumberInput value={v.settings.calibration.distribution[String(p.value)] ?? 0} min={0} max={100} suffix="%"
                    onChange={(x) => setSettings({ calibration: { ...v.settings.calibration, distribution: { ...v.settings.calibration.distribution, [String(p.value)]: x ?? 0 } } })} />
                </Field>
              ))}
              {distTotal > 0 && <div className="pb-2.5"><Sum total={distTotal} /></div>}
            </div>
            {distTotal > 0 && scale && (
              <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-sunken">
                {scale.points.map((p, i) => {
                  const w = v.settings.calibration.distribution[String(p.value)] ?? 0;
                  const tones = ["bg-rose-400", "bg-amber-400", "bg-sky-400", "bg-emerald-400", "bg-primary"];
                  return <div key={p.value} className={tones[Math.min(4, Math.round((i / Math.max(scale.points.length - 1, 1)) * 4))]} style={{ width: `${w}%` }} />;
                })}
              </div>
            )}
          </FormSection>
          <FormSection title="Rules">
            <div className="space-y-4">
              <Toggle checked={v.settings.calibration.require_reason} onChange={(x) => setSettings({ calibration: { ...v.settings.calibration, require_reason: x } })}
                label="A reason is needed to change a rating" />
              <Toggle checked={v.settings.calibration.require_ack} onChange={(x) => setSettings({ calibration: { ...v.settings.calibration, require_ack: x } })}
                label="Managers acknowledge changed ratings" description="A manager who disagrees blocks publishing until it is settled." />
              <Toggle checked={v.settings.letters} onChange={(x) => setSettings({ letters: x })}
                label="Create review letters when results are published" />
            </div>
          </FormSection>
        </div>
      )}
    </Modal>
  );
}
