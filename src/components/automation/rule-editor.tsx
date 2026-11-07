"use client";

/*
 * Rule editor: what the rule watches, when it runs, an optional condition and the actions,
 * with a test panel that runs the draft against a real record without doing anything.
 *   <RuleEditor open rule={rule | null} meta={meta} onClose onSaved />
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, Bell, CheckCircle2, FlaskConical, Globe, ListChecks, Mail, PenLine, Plus, Stamp, Trash2, XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Badge, Button, Field, FormGrid, FormSection, IconButton, Modal, ModalCancel, MultiSelect, NumberInput, Select,
  TextInput, Textarea, Toggle, type SelectOption,
} from "@/components/ui-kit";
import { loadEmployees } from "@/components/workplace/pickers";
import {
  draftFrom, emptyDraft, newAction, type Action, type Meta, type Preview, type Rule, type RuleDraft,
} from "./types";

const ACTION_ICON = { notify: Bell, email: Mail, task: ListChecks, update_field: PenLine, workflow: Stamp, webhook: Globe };

export function RuleEditor({ open, rule, meta, onClose, onSaved }: {
  open: boolean; rule: Rule | null; meta: Meta | null; onClose: () => void; onSaved: (r: Rule) => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<RuleDraft>(emptyDraft());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(rule ? draftFrom(rule) : emptyDraft());
    setDirty(false);
    setError(null);
  }, [open, rule]);

  const set = (patch: Partial<RuleDraft>) => { setDraft((d) => ({ ...d, ...patch })); setDirty(true); };
  const entity = meta?.entities.find((e) => e.key === draft.entity) ?? null;
  const triggerOptions = (meta?.triggers ?? []).filter((t) => entity?.triggers.includes(t.value));

  function changeEntity(key: string | null) {
    if (!key || !meta) return;
    const e = meta.entities.find((x) => x.key === key);
    const trigger = e?.triggers.includes(draft.trigger) ? draft.trigger : e?.triggers[0] ?? "created";
    set({ entity: key, trigger, fields: [], date_field: null, request_type: null });
  }

  function setAction(i: number, a: Action) {
    set({ actions: draft.actions.map((x, j) => (j === i ? a : x)) });
  }
  function moveAction(i: number, d: -1 | 1) {
    const next = [...draft.actions];
    const [a] = next.splice(i, 1);
    next.splice(i + d, 0, a);
    set({ actions: next });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body = { ...draft, offset_days: draft.offset_days || 0 };
      const out = rule ? await api.put<Rule>(`/automation/rules/${rule.uuid}`, body) : await api.post<Rule>("/automation/rules", body);
      toast.success(rule ? "Rule saved" : "Rule added");
      setDirty(false);
      onSaved(out);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the rule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" dirty={dirty} busy={saving}
      title={rule ? "Edit rule" : "New rule"} description="When something happens to a record, do one or more things automatically."
      footerStart={error && <span className="text-[13px] text-rose-600">{error}</span>}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="rule-form" loading={saving}>Save rule</Button></>}>
      {!meta ? <p className="text-muted">Loading…</p> : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <form id="rule-form" onSubmit={save} className="min-w-0">
            <FormSection title="Rule">
              <FormGrid>
                <Field label="Name" required><TextInput value={draft.name} onValueChange={(v) => set({ name: v })} maxLength={150} placeholder="Remind the manager before probation ends" /></Field>
                <Field label="Status"><Toggle checked={draft.active} onChange={(v) => set({ active: v })} label={draft.active ? "On" : "Off"} /></Field>
              </FormGrid>
              <Field label="Description" className="mt-5"><Textarea value={draft.description} onValueChange={(v) => set({ description: v })} rows={2} maxLength={1000} /></Field>
            </FormSection>

            <FormSection title="When" description="The kind of record the rule watches and what makes it run.">
              <FormGrid>
                <Field label="Record type" required>
                  <Select value={draft.entity} onChange={changeEntity} options={meta.entities.map((e) => ({ value: e.key, label: e.label }))} />
                </Field>
                <Field label="Runs when" required>
                  <Select value={draft.trigger} onChange={(v) => v && set({ trigger: v })} options={triggerOptions} />
                </Field>
                {draft.trigger === "field_changed" && (
                  <Field label="Fields to watch" required hint="The rule runs when any of these change." className="sm:col-span-2">
                    <MultiSelect value={draft.fields} onChange={(v) => set({ fields: v })} options={entity?.fields ?? []} placeholder="Pick fields" />
                  </Field>
                )}
                {(draft.trigger === "approved" || draft.trigger === "rejected") && (
                  <Field label="Kind of request" hint="Leave empty for every kind." className="sm:col-span-2">
                    <Select value={draft.request_type} onChange={(v) => set({ request_type: v })} options={meta.request_types} clearable placeholder="Any request" />
                  </Field>
                )}
                {draft.trigger === "date" && (
                  <>
                    <Field label="Date" required>
                      <Select value={draft.date_field} onChange={(v) => set({ date_field: v })} options={entity?.date_fields ?? []} placeholder="Pick a date" />
                    </Field>
                    <Field label="When" hint="0 days runs on the date itself.">
                      <div className="flex gap-2">
                        <NumberInput value={Math.abs(draft.offset_days)} min={0} max={365}
                          onChange={(n) => set({ offset_days: (draft.offset_days < 0 ? -1 : 1) * (n ?? 0) })} suffix="days" className="w-36" />
                        <Select value={draft.offset_days < 0 ? "before" : "after"} className="flex-1"
                          onChange={(v) => set({ offset_days: (v === "before" ? -1 : 1) * Math.abs(draft.offset_days) })}
                          options={[{ value: "before", label: "before" }, { value: "after", label: "after" }]} />
                      </div>
                    </Field>
                    <Field label="Every year" className="sm:col-span-2">
                      <Toggle checked={draft.repeat_yearly} onChange={(v) => set({ repeat_yearly: v })}
                        label="Repeat every year" description="For birthdays and work anniversaries." />
                    </Field>
                  </>
                )}
              </FormGrid>
            </FormSection>

            <FormSection title="Only if" description="Optional. The rule acts only when this is true.">
              <Field label="Condition" hint="For example: employee.status == 'probation' and record.work_mode == 'remote'">
                <Textarea value={draft.condition} onValueChange={(v) => set({ condition: v })} rows={2} className="font-mono text-[13px]" placeholder="Leave empty to always act" />
              </Field>
              {entity && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {entity.condition_fields.slice(0, 14).map((f) => (
                    <button key={f.name} type="button" title={f.label}
                      onClick={() => set({ condition: `${draft.condition}${draft.condition && !draft.condition.endsWith(" ") ? " " : ""}${f.name}` })}
                      className="rounded-md border border-line bg-sunken/50 px-1.5 py-0.5 font-mono text-[11.5px] text-muted hover:border-line-strong hover:text-ink">
                      {f.name}
                    </button>
                  ))}
                </div>
              )}
            </FormSection>

            <FormSection title="Then" description="Texts can use values from the record, like {{employee.name}} or {{record.title}}.">
              <div className="space-y-3">
                {draft.actions.map((a, i) => (
                  <ActionCard key={i} index={i} action={a} meta={meta} count={draft.actions.length}
                    onChange={(x) => setAction(i, x)} onRemove={() => set({ actions: draft.actions.filter((_, j) => j !== i) })}
                    onMove={(d) => moveAction(i, d)} />
                ))}
              </div>
              {draft.actions.length < 10 && (
                <div className="mt-3 w-64">
                  <Select value={null} placeholder="Add an action…" options={meta.action_types}
                    onChange={(v) => v && set({ actions: [...draft.actions, newAction(v as Action["type"])] })} />
                </div>
              )}
            </FormSection>
          </form>
          <TestPanel draft={draft} entityLabel={entity?.label ?? ""} />
        </div>
      )}
    </Modal>
  );
}

/* ── One action ───────────────────────────────────────────────────────── */

function ActionCard({ index, action: a, meta, count, onChange, onRemove, onMove }: {
  index: number; action: Action; meta: Meta; count: number; onChange: (a: Action) => void; onRemove: () => void; onMove: (d: -1 | 1) => void;
}) {
  const Icon = ACTION_ICON[a.type] ?? Bell;
  const label = meta.action_types.find((t) => t.value === a.type)?.label ?? a.type;
  const up = (patch: Partial<Action>) => onChange({ ...a, ...patch });
  const fieldKind = meta.update_fields.find((f) => f.value === a.field)?.kind;
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon size={15} strokeWidth={1.4} /></span>
        <p className="flex-1 text-[14px] text-ink">{index + 1}. {label}</p>
        <IconButton icon={ArrowUp} label="Move up" size="sm" disabled={index === 0} onClick={() => onMove(-1)} />
        <IconButton icon={ArrowDown} label="Move down" size="sm" disabled={index === count - 1} onClick={() => onMove(1)} />
        <IconButton icon={Trash2} label="Remove action" size="sm" onClick={onRemove} />
      </div>
      {a.type === "notify" && (
        <div className="space-y-4">
          <Recipients value={a.to ?? []} meta={meta} onChange={(to) => up({ to })} />
          <Field label="Title" required><TextInput value={a.title ?? ""} onValueChange={(v) => up({ title: v })} placeholder="Probation of {{employee.name}} ends soon" /></Field>
          <Field label="Message"><Textarea value={a.body ?? ""} onValueChange={(v) => up({ body: v })} rows={2} /></Field>
          <Field label="Link" hint="Optional page in the app, e.g. /dashboard/probation"><TextInput value={a.link ?? ""} onValueChange={(v) => up({ link: v })} /></Field>
        </div>
      )}
      {a.type === "email" && (
        <div className="space-y-4">
          <Recipients value={a.to ?? []} meta={meta} onChange={(to) => up({ to })} />
          <Field label="Other addresses" hint="Separate with commas.">
            <TextInput value={(a.addresses ?? []).join(", ")} placeholder="payroll@yourcompany.in"
              onValueChange={(v) => up({ addresses: v.split(",").map((x) => x.trim()).filter(Boolean) })} />
          </Field>
          <Field label="Subject" required><TextInput value={a.subject ?? ""} onValueChange={(v) => up({ subject: v })} /></Field>
          <Field label="Email text"><Textarea value={a.body ?? ""} onValueChange={(v) => up({ body: v })} rows={4} /></Field>
        </div>
      )}
      {a.type === "task" && (
        <FormGrid>
          <Field label="Task" required className="sm:col-span-2"><TextInput value={a.title ?? ""} onValueChange={(v) => up({ title: v })} placeholder="Prepare the confirmation letter for {{employee.name}}" /></Field>
          <Field label="Assign to">
            <Select value={a.assignee ?? "manager"} onChange={(v) => up({ assignee: v ?? "manager" })}
              options={[{ value: "employee", label: "The person" }, { value: "manager", label: "Their reporting manager" },
                ...meta.roles.map((r) => ({ value: `role:${r.value}`, label: `First person with the ${r.label} role` }))]} />
          </Field>
          <Field label="Due in"><NumberInput value={a.due_in_days ?? null} min={0} max={365} suffix="days" onChange={(n) => up({ due_in_days: n })} /></Field>
          <Field label="Priority"><Select value={a.priority ?? "medium"} onChange={(v) => up({ priority: v ?? "medium" })} options={meta.priorities} /></Field>
          <Field label="Details" className="sm:col-span-2"><Textarea value={a.description ?? ""} onValueChange={(v) => up({ description: v })} rows={2} /></Field>
        </FormGrid>
      )}
      {a.type === "update_field" && (
        <FormGrid>
          <Field label="Field of the person">
            <Select value={a.field ?? null} onChange={(v) => up({ field: v ?? undefined, value: null })} options={meta.update_fields} />
          </Field>
          <Field label="New value" hint="Or a formula, e.g. add_days(employee.date_of_joining, 180)">
            {a.formula !== null && a.formula !== undefined ? (
              <TextInput value={a.formula} onValueChange={(v) => up({ formula: v })} className="font-mono" />
            ) : fieldKind === "choice" ? (
              <Select value={(a.value as string) ?? null} onChange={(v) => up({ value: v })} options={meta.work_modes} />
            ) : fieldKind === "int" ? (
              <NumberInput value={a.value === null || a.value === undefined || a.value === "" ? null : Number(a.value)} min={0} max={365} onChange={(n) => up({ value: n })} />
            ) : (
              <TextInput value={a.value === null || a.value === undefined ? "" : String(a.value)} onValueChange={(v) => up({ value: v })}
                placeholder={fieldKind === "date" ? "2026-12-31" : fieldKind === "timezone" ? "Asia/Kolkata" : ""} />
            )}
          </Field>
          <div className="sm:col-span-2">
            <Toggle size="sm" checked={a.formula !== null && a.formula !== undefined} label="Work out the value with a formula"
              onChange={(v) => up({ formula: v ? "" : null, value: null })} />
          </div>
        </FormGrid>
      )}
      {a.type === "workflow" && (
        <div className="space-y-4">
          <Field label="Request title" hint="Goes through the flow set for “Approval started by a rule”.">
            <TextInput value={a.title ?? ""} onValueChange={(v) => up({ title: v })} placeholder="Review {{employee.name}}" />
          </Field>
          <Field label="Note for the approver"><Textarea value={a.note ?? ""} onValueChange={(v) => up({ note: v })} rows={2} /></Field>
        </div>
      )}
      {a.type === "webhook" && (
        <Field label="Webhook" hint={meta.webhooks.length ? "Add more on the Webhooks tab." : "Add a webhook on the Webhooks tab first."}>
          <Select value={a.webhook_uuid || null} onChange={(v) => up({ webhook_uuid: v ?? "" })} options={meta.webhooks} placeholder="Pick a webhook" />
        </Field>
      )}
    </div>
  );
}

function Recipients({ value, meta, onChange }: { value: string[]; meta: Meta; onChange: (v: string[]) => void }) {
  const groups = value.filter((v) => !v.startsWith("person:"));
  const people = value.filter((v) => v.startsWith("person:")).map((v) => Number(v.slice(7)));
  const groupOptions: SelectOption[] = useMemo(() => [
    ...meta.audiences,
    ...meta.roles.map((r) => ({ value: `role:${r.value}`, label: `Everyone with the ${r.label} role` })),
  ], [meta]);
  return (
    <FormGrid>
      <Field label="Send to">
        <MultiSelect value={groups} options={groupOptions} placeholder="Pick who"
          onChange={(v) => onChange([...v, ...people.map((p) => `person:${p}`)])} />
      </Field>
      <Field label="Also these people">
        <MultiSelect<number> value={people} loadOptions={loadEmployees} placeholder="Search people"
          onChange={(v) => onChange([...groups, ...v.map((p) => `person:${p}`)])} />
      </Field>
    </FormGrid>
  );
}

/* ── Test panel ───────────────────────────────────────────────────────── */

function TestPanel({ draft, entityLabel }: { draft: RuleDraft; entityLabel: string }) {
  const [record, setRecord] = useState<string | null>(null);
  const [recordOption, setRecordOption] = useState<SelectOption | null>(null);
  const [result, setResult] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => { setRecord(null); setRecordOption(null); setResult(null); }, [draft.entity]);

  async function loadRecords(q: string): Promise<SelectOption[]> {
    return api.get<SelectOption[]>(`/automation/records?entity=${encodeURIComponent(draft.entity)}&q=${encodeURIComponent(q)}`);
  }
  async function run() {
    setRunning(true);
    setError(null);
    try {
      setResult(await api.post<Preview>("/automation/preview", { ...draft, name: draft.name || "Draft rule", record_uuid: record }));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Couldn't test the rule");
    } finally {
      setRunning(false);
    }
  }

  return (
    <aside className="self-start rounded-xl border border-line bg-sunken/40 p-4 lg:sticky lg:top-0">
      <p className="flex items-center gap-2 text-[14px] text-ink"><FlaskConical size={16} strokeWidth={1.4} className="text-primary" />Test this rule</p>
      <p className="mt-1 text-[12.5px] text-muted">See what would happen for one record. Nothing is sent or changed.</p>
      <Field label={entityLabel || "Record"} className="mt-4" hint="Empty uses the newest one.">
        <Select value={record} selectedOption={recordOption} loadOptions={loadRecords} clearable placeholder="Pick a record"
          onChange={(v, o) => { setRecord(v); setRecordOption(o); }} />
      </Field>
      <Button className="mt-3 w-full" icon={FlaskConical} loading={running} onClick={run}>Run test</Button>
      {error && <p className="mt-3 text-[13px] text-rose-600">{error}</p>}
      {result && (
        <div className="mt-4 space-y-3">
          <p className="text-[12.5px] text-muted">For <span className="text-ink">{result.record_label}</span></p>
          {result.error ? <Badge tone="bad">{result.error}</Badge>
            : result.matched ? <Badge tone="good" dot>Condition met</Badge> : <Badge tone="neutral" dot>Condition not met: nothing would happen</Badge>}
          {result.results.length > 0 && (
            <ul className="space-y-2">
              {result.results.map((r, i) => (
                <li key={i} className="flex gap-2 text-[13px] text-ink/85">
                  {r.ok ? <CheckCircle2 size={15} strokeWidth={1.4} className="mt-0.5 shrink-0 text-emerald-600" /> : <XCircle size={15} strokeWidth={1.4} className="mt-0.5 shrink-0 text-rose-600" />}
                  <span>{r.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!result && !error && <p className="mt-4 flex items-center gap-1.5 text-[12px] text-faint"><Plus size={12} strokeWidth={1.4} />Save is not needed to test.</p>}
    </aside>
  );
}
