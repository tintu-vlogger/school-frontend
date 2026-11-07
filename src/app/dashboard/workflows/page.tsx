"use client";

/*
 * Approval flows: for each kind of request, the steps it goes through. Editing a flow
 * saves a new version; requests already running keep the version they started with.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, BarChart3, BellRing, ChevronRight, Clock, GitBranch, History, Pencil, Plus, Settings2, Trash2, UserCheck,
  Users, Workflow,
} from "lucide-react";
import Link from "next/link";
import { ApprovalSettingsModal } from "@/components/workflow/approval-settings";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, Field, FormGrid, IconButton, Modal, ModalCancel, NumberInput, RadioCards, Select, Skeleton, TextInput,
  Textarea, Timeline, Toggle, type SelectOption,
} from "@/components/ui-kit";

type Variable = { name: string; label: string };
type RequestType = { key: string; label: string; description: string; flows: number; variables: Variable[] };
type Escalate = { approver_type: string; approver_value?: string | number | null } | null;
type Step = {
  key?: string; name: string; approver_type: string; approver_value?: string | number | null; mode: "any" | "all";
  condition?: string | null; sla_hours?: number | null; escalate_to?: Escalate; skip_if_requester: boolean;
  timeout_action?: string | null; remind_every_hours?: number | null;
};
type Flow = {
  uuid: string; lineage_id: string; version: number; is_current: boolean; request_type: string; request_type_label: string;
  name: string; description: string | null; applies_when: string | null; priority: number; steps: Step[]; active: boolean;
  change_note: string | null; created_by_name: string | null; created_at: string; versions?: Flow[];
};
type Meta = { approver_types: SelectOption[]; modes: SelectOption[]; roles: SelectOption[]; timeout_actions?: SelectOption[] };
type EmpOption = { value: number; label: string; hint: string };

type FlowDraft = { name: string; description: string; applies_when: string; priority: number; active: boolean; change_note: string; steps: Step[] };

const NEW_STEP: Step = { name: "", approver_type: "reporting_manager", approver_value: null, mode: "any", condition: "", sla_hours: null, escalate_to: null, skip_if_requester: true, timeout_action: null, remind_every_hours: null };

async function loadEmployees(q: string): Promise<SelectOption<number>[]> {
  const rows = await api.get<EmpOption[]>(`/employees/lookup?q=${encodeURIComponent(q)}`);
  return rows.map((r) => ({ value: r.value, label: r.label, description: r.hint }));
}

export default function WorkflowsPage() {
  const toast = useToast();
  const [types, setTypes] = useState<RequestType[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [flows, setFlows] = useState<Flow[] | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [editing, setEditing] = useState<Flow | "new" | null>(null);
  const [history, setHistory] = useState<Flow | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const loadTypes = useCallback(async () => {
    try {
      const t = await api.get<RequestType[]>("/workflow/request-types");
      setTypes(t);
      setSelected((s) => s ?? t[0]?.key ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load request types");
      setTypes([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFlows = useCallback(async (key: string) => {
    setFlows(null);
    try { setFlows(await api.get<Flow[]>(`/workflow/definitions?request_type=${encodeURIComponent(key)}`)); }
    catch { setFlows([]); }
  }, []);

  useEffect(() => { loadTypes(); api.get<Meta>("/workflow/meta").then(setMeta).catch(() => {}); }, [loadTypes]);
  useEffect(() => { if (selected) loadFlows(selected); }, [selected, loadFlows]);

  const type = types?.find((t) => t.key === selected) ?? null;

  async function openHistory(f: Flow) {
    try { setHistory(await api.get<Flow>(`/workflow/definitions/${f.uuid}`)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't load versions"); }
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Settings" title="Approval flows"
        description="Who approves each kind of request, in which order, and what happens when an approval waits too long."
        actions={<>
          <Link href="/dashboard/workflows/report"><Button variant="ghost" icon={BarChart3}>History and time limits</Button></Link>
          <Button variant="secondary" icon={Settings2} onClick={() => setSettingsOpen(true)}>Approval settings</Button>
          {type && <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>New flow</Button>}
        </>} />

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Paper className="h-fit overflow-hidden">
          <p className="border-b border-line px-4 py-3 text-[12px] uppercase tracking-[0.06em] text-faint">Kinds of request</p>
          {types === null ? <div className="space-y-2 p-4"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>
            : types.length === 0 ? <p className="px-4 py-6 text-[13px] text-faint">No request types yet.</p>
            : (
              <ul className="p-1.5">
                {types.map((t) => (
                  <li key={t.key}>
                    <button onClick={() => setSelected(t.key)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${t.key === selected ? "bg-primary-soft text-primary" : "text-ink hover:bg-sunken"}`}>
                      <Workflow size={16} strokeWidth={1.4} className={t.key === selected ? "text-primary" : "text-faint"} />
                      <span className="min-w-0 flex-1 truncate text-[14px]">{t.label}</span>
                      <span className="text-[12px] text-faint">{t.flows}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </Paper>

        <div className="space-y-4">
          {type && (
            <div className="px-1">
              <p className="text-[17px] font-light text-ink">{type.label}</p>
              {type.description && <p className="mt-0.5 text-[13.5px] text-muted">{type.description}</p>}
            </div>
          )}
          {flows === null ? <Paper className="p-5"><Skeleton className="h-24" /></Paper>
            : flows.length === 0 ? (
              <Paper>
                <EmptyState icon={GitBranch} title="No approval flow yet"
                  hint="Without a flow, these requests are approved straight away."
                  action={<Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Create a flow</Button>} />
              </Paper>
            ) : flows.map((f) => (
              <FlowCard key={f.uuid} flow={f} meta={meta} onEdit={() => setEditing(f)} onHistory={() => openHistory(f)} />
            ))}
          {flows && flows.length > 1 && (
            <p className="px-1 text-[12.5px] text-faint">When several flows exist, the first one (lowest order number) whose condition matches is used.</p>
          )}
        </div>
      </div>

      {editing && type && meta && (
        <FlowModal type={type} meta={meta} flow={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); loadFlows(type.key); loadTypes(); }} />
      )}
      {settingsOpen && <ApprovalSettingsModal onClose={() => setSettingsOpen(false)} />}
      {history && (
        <Modal open onClose={() => setHistory(null)} size="md" title="Versions" description={history.name}>
          <Timeline items={(history.versions ?? []).map((v) => ({
            id: v.uuid,
            title: <span>Version {v.version} {v.is_current && <Badge tone="accent">Current</Badge>}</span>,
            description: <>{v.change_note || "Saved"}{v.created_by_name ? ` · by ${v.created_by_name}` : ""} · {v.steps.length} step{v.steps.length === 1 ? "" : "s"}</>,
            time: formatDateTime(v.created_at),
            icon: History,
            tone: v.is_current ? "accent" : "neutral",
          }))} />
        </Modal>
      )}
    </div>
  );
}

function approverText(s: { approver_type: string; approver_value?: string | number | null }, meta: Meta | null, names: Record<string, string> = {}) {
  const base = meta?.approver_types.find((a) => a.value === s.approver_type)?.label ?? s.approver_type;
  if (s.approver_type === "role") return `Everyone with the ${meta?.roles.find((r) => r.value === s.approver_value)?.label ?? s.approver_value} role`;
  if (s.approver_type === "employee") return names[String(s.approver_value)] ?? "A specific employee";
  if (s.approver_type === "field") return `Person in ${s.approver_value}`;
  return base;
}

function FlowCard({ flow, meta, onEdit, onHistory }: { flow: Flow; meta: Meta | null; onEdit: () => void; onHistory: () => void }) {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = flow.steps.flatMap((s) => [s.approver_type === "employee" ? s.approver_value : null, s.escalate_to?.approver_type === "employee" ? s.escalate_to.approver_value : null]).filter(Boolean);
    if (!ids.length) return;
    api.get<EmpOption[]>(`/employees/lookup?ids=${ids.join(",")}`)
      .then((rows) => setNames(Object.fromEntries(rows.map((r) => [String(r.value), r.label])))).catch(() => {});
  }, [flow]);
  return (
    <Paper>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15.5px] text-ink">{flow.name}</p>
            <Badge tone={flow.active ? "good" : "neutral"} dot>{flow.active ? "On" : "Off"}</Badge>
            <span className="text-[12px] text-faint">Version {flow.version} · order {flow.priority}</span>
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {flow.applies_when ? <>Used when <code className="rounded bg-sunken px-1.5 py-0.5 text-[12px]">{flow.applies_when}</code></> : "Used for every request of this kind"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" icon={History} onClick={onHistory}>Versions</Button>
          <Button variant="secondary" size="sm" icon={Pencil} onClick={onEdit}>Edit</Button>
        </div>
      </div>
      <ol className="flex flex-wrap items-stretch gap-2 px-5 py-4">
        {flow.steps.map((s, i) => (
          <li key={i} className="flex items-center gap-2">
            <div className="min-w-[180px] max-w-[260px] rounded-xl border border-line bg-canvas/50 px-3.5 py-2.5">
              <p className="text-[11.5px] uppercase tracking-[0.06em] text-faint">Step {i + 1}</p>
              <p className="mt-0.5 truncate text-[14px] text-ink">{s.name}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-muted">
                {s.mode === "all" ? <Users size={13} strokeWidth={1.4} /> : <UserCheck size={13} strokeWidth={1.4} />}
                <span className="truncate">{approverText(s, meta, names)}{s.mode === "all" ? " (all)" : ""}</span>
              </p>
              {(s.condition || s.sla_hours || s.remind_every_hours) && (
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {s.condition && <Badge tone="info">Only if…</Badge>}
                  {s.sla_hours && <Badge tone="warn"><Clock size={11} strokeWidth={1.6} className="mr-1 inline" />{s.sla_hours} h
                    {s.timeout_action === "approve" ? ", then approved" : s.timeout_action === "reject" ? ", then rejected" : ""}</Badge>}
                  {s.remind_every_hours && <Badge><BellRing size={11} strokeWidth={1.6} className="mr-1 inline" />every {s.remind_every_hours} h</Badge>}
                </p>
              )}
            </div>
            {i < flow.steps.length - 1 && <ChevronRight size={16} strokeWidth={1.4} className="text-faint" />}
          </li>
        ))}
      </ol>
    </Paper>
  );
}

function ApproverPicker({ meta, value, onChange, allowOwner = true }: {
  meta: Meta; value: { approver_type: string; approver_value?: string | number | null };
  onChange: (v: { approver_type: string; approver_value: string | number | null }) => void; allowOwner?: boolean;
}) {
  const [selectedEmp, setSelectedEmp] = useState<SelectOption<number> | null>(null);
  useEffect(() => {
    if (value.approver_type === "employee" && value.approver_value && !selectedEmp) {
      api.get<EmpOption[]>(`/employees/lookup?ids=${value.approver_value}`)
        .then((r) => r[0] && setSelectedEmp({ value: r[0].value, label: r[0].label })).catch(() => {});
    }
  }, [value, selectedEmp]);
  const types = allowOwner ? meta.approver_types : meta.approver_types.filter((t) => t.value !== "owner");
  return (
    <FormGrid>
      <Field label="Who approves">
        <Select value={value.approver_type} options={types}
          onChange={(v) => onChange({ approver_type: String(v ?? "reporting_manager"), approver_value: v === "role" ? "hr" : null })} />
      </Field>
      {value.approver_type === "role" && (
        <Field label="Role"><Select value={String(value.approver_value ?? "hr")} options={meta.roles} onChange={(v) => onChange({ ...value, approver_value: v })} /></Field>
      )}
      {value.approver_type === "employee" && (
        <Field label="Employee">
          <Select<number> value={value.approver_value ? Number(value.approver_value) : null} loadOptions={loadEmployees} selectedOption={selectedEmp}
            onChange={(v, opt) => { setSelectedEmp(opt); onChange({ ...value, approver_value: v }); }} placeholder="Search by name or ID" />
        </Field>
      )}
      {value.approver_type === "field" && (
        <Field label="Field on the request" hint="e.g. request.approver_id">
          <TextInput value={String(value.approver_value ?? "")} onValueChange={(v) => onChange({ ...value, approver_value: v })} placeholder="request.approver_id" />
        </Field>
      )}
    </FormGrid>
  );
}

function FlowModal({ type, meta, flow, onClose, onSaved }: { type: RequestType; meta: Meta; flow: Flow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const initial = useMemo((): FlowDraft => ({
    name: flow?.name ?? type.label,
    description: flow?.description ?? "",
    applies_when: flow?.applies_when ?? "",
    priority: flow?.priority ?? 100,
    active: flow?.active ?? true,
    change_note: "",
    steps: (flow?.steps ?? [{ ...NEW_STEP, name: "Manager approval" }]).map((s) => ({ ...NEW_STEP, ...s, condition: s.condition ?? "" })),
  }), [flow, type]);
  const [d, setD] = useState<FlowDraft>(initial);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);

  const setStep = (i: number, patch: Partial<Step>) => setD((x) => ({ ...x, steps: x.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const move = (i: number, by: number) => setD((x) => {
    const steps = [...x.steps];
    const [s] = steps.splice(i, 1);
    steps.splice(i + by, 0, s);
    return { ...x, steps };
  });

  async function save() {
    setSaving(true);
    const steps = d.steps.map((s, i) => ({
      ...s, name: s.name.trim() || `Step ${i + 1}`, condition: (s.condition || "").trim() || null,
      sla_hours: s.sla_hours || null,
      timeout_action: s.sla_hours ? (s.timeout_action || (s.escalate_to ? "escalate" : null)) : null,
      escalate_to: s.sla_hours && (s.timeout_action === "escalate" || (!s.timeout_action && s.escalate_to))
        ? (s.escalate_to ?? { approver_type: "skip_level_manager", approver_value: null }) : null,
      remind_every_hours: s.remind_every_hours || null,
    }));
    const body = { name: d.name, description: d.description || null, applies_when: d.applies_when.trim() || null,
      priority: d.priority, active: d.active, steps, change_note: d.change_note || null };
    try {
      if (flow) await api.put(`/workflow/definitions/${flow.uuid}`, body);
      else await api.post("/workflow/definitions", { ...body, request_type: type.key });
      toast.success(flow ? `Saved as version ${flow.version + 1}` : "Approval flow created");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the flow");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="full" dirty={dirty} busy={saving}
      title={flow ? `Edit ${flow.name}` : `New flow for ${type.label}`}
      description={flow ? `Saving creates version ${flow.version + 1}. Requests already in progress keep version ${flow.version}.` : type.description}
      footerStart={flow ? <div className="w-72"><TextInput value={d.change_note} onValueChange={(v) => setD({ ...d, change_note: v })} placeholder="What changed? (optional)" /></div> : undefined}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={save} disabled={!d.name.trim() || d.steps.length === 0}>Save flow</Button></>}>
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <FormGrid>
            <Field label="Name" required><TextInput value={d.name} onValueChange={(v) => setD({ ...d, name: v })} /></Field>
            <Field label="Order" hint="Lower numbers are checked first"><NumberInput value={d.priority} min={0} onChange={(v) => setD({ ...d, priority: Math.round(v ?? 100) })} /></Field>
          </FormGrid>
          <Field label="Use this flow when" hint="Leave empty to use it for every request of this kind.">
            <TextInput value={d.applies_when} onValueChange={(v) => setD({ ...d, applies_when: v })} className="font-mono" placeholder="e.g. request.days > 3" />
          </Field>
          <Toggle checked={d.active} onChange={(v) => setD({ ...d, active: v })} label="Flow is on" description="When off, the next matching flow is used." />

          <div className="space-y-3">
            <p className="text-[12px] uppercase tracking-[0.06em] text-faint">Steps, in order</p>
            {d.steps.map((s, i) => (
              <div key={i} className="rounded-2xl border border-line bg-surface">
                <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-[12px] text-primary">{i + 1}</span>
                  <TextInput value={s.name} onValueChange={(v) => setStep(i, { name: v })} placeholder={`Step ${i + 1} name`} className="h-8 flex-1 border-transparent bg-transparent px-1" />
                  <IconButton icon={ArrowUp} label="Move up" size="sm" disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton icon={ArrowDown} label="Move down" size="sm" disabled={i === d.steps.length - 1} onClick={() => move(i, 1)} />
                  <IconButton icon={Trash2} label="Remove step" size="sm" disabled={d.steps.length === 1}
                    onClick={() => setD((x) => ({ ...x, steps: x.steps.filter((_, j) => j !== i) }))} />
                </div>
                <div className="space-y-5 px-4 py-4">
                  <ApproverPicker meta={meta} value={s} onChange={(v) => setStep(i, v)} />
                  <Field label="When there are several approvers">
                    <RadioCards<"any" | "all"> value={s.mode} onChange={(v) => setStep(i, { mode: v })} options={[
                      { value: "any", label: "Any one of them", description: "The first decision counts" },
                      { value: "all", label: "Every one of them", description: "All must approve" },
                    ]} />
                  </Field>
                  <Field label="Only use this step when" hint="Optional. Leave empty to always use it.">
                    <TextInput value={s.condition ?? ""} onValueChange={(v) => setStep(i, { condition: v })} className="font-mono" placeholder="e.g. request.amount > 50000" />
                  </Field>
                  <FormGrid>
                    <Field label="Time limit (hours)" hint="Optional">
                      <NumberInput value={s.sla_hours ?? null} min={0} placeholder="No limit" onChange={(v) => setStep(i, { sla_hours: v ? Math.round(v) : null })} />
                    </Field>
                    <div className="flex items-end pb-1">
                      <Toggle checked={s.skip_if_requester} onChange={(v) => setStep(i, { skip_if_requester: v })} label="Skip when the approver is the one asking" />
                    </div>
                  </FormGrid>
                  {s.sla_hours ? (
                    <div className="space-y-4 rounded-xl bg-sunken/50 p-4">
                      <Field label="When the time limit passes">
                        <Select value={s.timeout_action || (s.escalate_to ? "escalate" : "remind")}
                          options={meta.timeout_actions ?? [{ value: "escalate", label: "Send it to someone else" }]}
                          onChange={(v) => setStep(i, { timeout_action: v ? String(v) : null })} />
                      </Field>
                      {(s.timeout_action || (s.escalate_to ? "escalate" : "remind")) === "escalate" && (
                        <ApproverPicker meta={meta} value={s.escalate_to ?? { approver_type: "skip_level_manager", approver_value: null }}
                          onChange={(v) => setStep(i, { escalate_to: v })} />
                      )}
                      {(s.timeout_action === "approve" || s.timeout_action === "reject") && (
                        <p className="text-[12.5px] text-muted">The request is {s.timeout_action === "approve" ? "approved" : "rejected"} by the system and the requester is told why.</p>
                      )}
                    </div>
                  ) : null}
                  <Field label="Remind the approver every (hours)" hint="Optional. Reminders repeat until a decision is made.">
                    <NumberInput value={s.remind_every_hours ?? null} min={0} placeholder="No reminders"
                      onChange={(v) => setStep(i, { remind_every_hours: v ? Math.round(v) : null })} />
                  </Field>
                </div>
              </div>
            ))}
            <Button variant="secondary" icon={Plus} onClick={() => setD((x) => ({ ...x, steps: [...x.steps, { ...NEW_STEP, name: `Step ${x.steps.length + 1}` }] }))}>
              Add step
            </Button>
          </div>
        </div>

        <aside className="h-fit space-y-4 rounded-2xl border border-line bg-canvas/60 p-4 lg:sticky lg:top-0">
          <p className="text-[13.5px] text-ink">Fields you can use in conditions</p>
          <ul className="space-y-2">
            {type.variables.map((v) => (
              <li key={v.name} className="text-[12.5px]">
                <code className="text-primary">{v.name}</code>
                <p className="text-faint">{v.label}</p>
              </li>
            ))}
          </ul>
          <p className="border-t border-line pt-3 text-[12px] text-faint">
            Example: <code>requester.role == &apos;manager&apos;</code>. Try rules on the Rules page.
          </p>
        </aside>
      </div>
    </Modal>
  );
}
