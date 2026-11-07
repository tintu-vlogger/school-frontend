"use client";

/*
 * Timesheet modals: line-by-line review of a submitted week, timesheet details, project
 * add/edit, project details with tasks, task add/edit, client add/edit.
 */
import { useEffect, useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime } from "@/lib/datetime";
import {
  Badge, Button, DateInput, Field, FormGrid, KeyValue, Modal, ModalCancel, MultiSelect, NumberInput, Select, TextInput,
  Textarea, Toggle,
} from "@/components/ui-kit";
import { errorText, lookupEmployees } from "./shared";
import { stateOptions, useGstStates } from "@/components/timesheets/billing";

export type Log = {
  uuid: string; date: string; project_id: number; project_name: string | null; task_id: number | null; task_name: string | null;
  hours: string; start_time: string | null; end_time: string | null; description: string | null; billable: boolean;
  status: string; review_comment: string | null;
};
export type Sheet = {
  uuid: string; employee_id: number; employee_name: string | null; week_start: string; week_end: string; status: string;
  total_hours: string; submitted_at: string | null; decided_at: string | null; comment: string | null;
};
export type SheetDetail = Sheet & { lines: Log[]; can_review: boolean };
export type Client = { uuid: string; id: number; name: string; contact_name: string | null; email: string | null; phone: string | null; gstin: string | null; address?: string | null; state_code?: string | null; active: boolean };
export type Project = {
  uuid: string; id: number; name: string; code: string | null; client_id: number | null; client_name: string | null;
  owner_employee_id: number | null; owner_name: string | null; billable: boolean; budget_hours: string | null;
  start_date: string | null; end_date: string | null; status: string; member_ids: number[]; description: string | null; logged_hours: string;
};
export type Task = { uuid: string; id: number; project_id: number; name: string; owner_employee_id: number | null; billable: boolean; budget_hours: string | null; status: string; logged_hours: string };

const SHEET_STATUS: Record<string, { label: string; tone: "good" | "bad" | "warn" | "neutral" | "info" }> = {
  draft: { label: "Not sent", tone: "neutral" }, submitted: { label: "Waiting", tone: "warn" }, approved: { label: "Approved", tone: "good" },
  partly_approved: { label: "Partly approved", tone: "info" }, rejected: { label: "Sent back", tone: "bad" },
};
export function SheetStatus({ status }: { status: string }) {
  const s = SHEET_STATUS[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}
export function LineStatus({ status }: { status: string }) {
  const s = { draft: ["Draft", "neutral"], submitted: ["Sent", "warn"], approved: ["Approved", "good"], rejected: ["Rejected", "bad"] }[status] ?? [status, "neutral"];
  return <Badge tone={s[1] as "good"}>{s[0]}</Badge>;
}
export const weekLabel = (s: Pick<Sheet, "week_start" | "week_end">) => `${formatDate(s.week_start, { year: undefined })} to ${formatDate(s.week_end)}`;

export function BudgetBar({ logged, budget }: { logged: string; budget: string | null }) {
  const l = Number(logged), b = Number(budget || 0);
  if (!b) return <span className="tabular text-muted">{l.toFixed(1)} h</span>;
  const pct = Math.min(100, (l / b) * 100);
  return (
    <div className="min-w-[120px]">
      <div className="mb-1 flex justify-between text-[12px] tabular text-muted"><span>{l.toFixed(1)} h</span><span>of {b.toFixed(0)}</span></div>
      <div className="h-1.5 rounded-full bg-sunken"><div className={`h-1.5 rounded-full ${l > b ? "bg-rose-500" : pct > 85 ? "bg-amber-500" : "bg-primary"}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function LinesTable({ lines, decisions, setDecision }: {
  lines: Log[]; decisions?: Record<string, { decision: "approve" | "reject"; comment: string }>;
  setDecision?: (uuid: string, d: { decision: "approve" | "reject"; comment: string }) => void;
}) {
  return (
    <div className="overflow-auto rounded-xl border border-line">
      <table className="w-full text-[13.5px]">
        <thead className="bg-sunken text-left text-[12.5px] text-muted">
          <tr><th className="px-3 py-2 font-normal">Day</th><th className="px-3 py-2 font-normal">Project and task</th><th className="px-3 py-2 text-right font-normal">Hours</th><th className="px-3 py-2 font-normal">{setDecision ? "Decision" : "Status"}</th></tr>
        </thead>
        <tbody className="divide-y divide-line">
          {lines.map((l) => {
            const d = decisions?.[l.uuid];
            return (
              <tr key={l.uuid} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 text-muted">{formatDate(l.date, { weekday: "short", year: undefined })}</td>
                <td className="px-3 py-2">
                  <p className="text-ink">{l.project_name}{l.task_name ? <span className="text-muted"> · {l.task_name}</span> : null}</p>
                  {l.description && <p className="text-[12.5px] text-muted">{l.description}</p>}
                  {!l.billable && <p className="text-[12px] text-faint">Not billable</p>}
                  {l.review_comment && <p className="text-[12.5px] text-rose-700">{l.review_comment}</p>}
                  {setDecision && d?.decision === "reject" && (
                    <TextInput className="mt-2" value={d.comment} onValueChange={(c) => setDecision(l.uuid, { ...d, comment: c })} placeholder="Why is it rejected?" />
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular">{Number(l.hours).toFixed(2)}</td>
                <td className="px-3 py-2">
                  {setDecision && l.status === "submitted" ? (
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setDecision(l.uuid, { decision: "approve", comment: "" })}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${d?.decision !== "reject" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-line text-faint"}`} aria-label="Approve">
                        <Check size={15} strokeWidth={1.6} />
                      </button>
                      <button type="button" onClick={() => setDecision(l.uuid, { decision: "reject", comment: d?.comment ?? "" })}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${d?.decision === "reject" ? "border-rose-300 bg-rose-50 text-rose-700" : "border-line text-faint"}`} aria-label="Reject">
                        <X size={15} strokeWidth={1.6} />
                      </button>
                    </div>
                  ) : <LineStatus status={l.status} />}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SheetModal({ uuid, onClose, onDone }: { uuid: string | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<SheetDetail | null>(null);
  const [decisions, setDecisions] = useState<Record<string, { decision: "approve" | "reject"; comment: string }>>({});
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!uuid) return;
    let live = true;
    api.get<SheetDetail>(`/timesheets/${uuid}`).then((r) => { if (live) setD(r); }).catch((e) => { toast.error(errorText(e)); onClose(); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid]);
  const reviewing = !!d?.can_review;
  const rejected = Object.values(decisions).filter((x) => x.decision === "reject").length;
  const pending = d?.lines.filter((l) => l.status === "submitted").length ?? 0;

  async function submit(all?: "approve" | "reject") {
    if (!d) return;
    const lines = d.lines.filter((l) => l.status === "submitted").map((l) => {
      const x = all ? { decision: all, comment: "" } : decisions[l.uuid] ?? { decision: "approve" as const, comment: "" };
      return { log_uuid: l.uuid, decision: x.decision, comment: x.comment || null };
    });
    setSaving(true);
    try {
      const r = await api.post<SheetDetail>(`/timesheets/${d.uuid}/review`, { lines, comment: comment || null });
      toast.success(r.status === "approved" ? "Timesheet approved" : r.status === "rejected" ? "Timesheet sent back" : "Timesheet partly approved");
      onDone();
    } catch (e) { toast.error(errorText(e, "Couldn't save the review")); } finally { setSaving(false); }
  }

  return (
    <Modal open={!!uuid} onClose={onClose} size="lg" busy={saving} dirty={reviewing && (rejected > 0 || !!comment)}
      title={d ? `${d.employee_name ?? "Timesheet"}, week of ${formatDate(d.week_start)}` : "Timesheet"}
      description={d ? `${Number(d.total_hours).toFixed(2)} hours · ${d.lines.length} entries` : undefined}
      footer={reviewing ? <>
        <ModalCancel />
        <Button variant="danger" loading={saving} disabled={!comment.trim()} onClick={() => submit("reject")}>Send all back</Button>
        <Button variant="primary" loading={saving} onClick={() => submit()}>{rejected ? `Approve ${pending - rejected}, reject ${rejected}` : "Approve all"}</Button>
      </> : <Button variant="primary" onClick={onClose}>Close</Button>}>
      {!d ? <div className="h-48 animate-pulse rounded-xl bg-sunken" /> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <SheetStatus status={d.status} />
            {d.submitted_at && <span className="text-[13px] text-muted">Sent {formatDateTime(d.submitted_at)}</span>}
          </div>
          {d.comment && <p className="rounded-lg bg-sunken px-3 py-2 text-[13.5px] text-ink">{d.comment}</p>}
          <LinesTable lines={d.lines} decisions={reviewing ? decisions : undefined}
            setDecision={reviewing ? (u, x) => setDecisions((o) => ({ ...o, [u]: x })) : undefined} />
          {reviewing && <Field label="Comment" hint="Needed to send everything back"><Textarea value={comment} onValueChange={setComment} rows={2} autoGrow /></Field>}
        </div>
      )}
    </Modal>
  );
}

export function ClientModal({ open, client, onClose, onSaved }: { open: boolean; client: Client | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ name: client?.name ?? "", contact_name: client?.contact_name ?? "", email: client?.email ?? "", phone: client?.phone ?? "", gstin: client?.gstin ?? "", address: client?.address ?? "", state_code: client?.state_code ?? null as string | null, active: client?.active ?? true });
  const states = useGstStates();
  const [saving, setSaving] = useState(false);
  const set = (x: Partial<typeof v>) => setV((o) => ({ ...o, ...x }));
  async function save() {
    setSaving(true);
    try {
      if (client) await api.put(`/timesheets/clients/${client.uuid}`, v); else await api.post("/timesheets/clients", v);
      toast.success("Client saved");
      onSaved();
    } catch (e) { toast.error(errorText(e)); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} title={client ? `Edit ${client.name}` : "Add client"}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!v.name.trim()} onClick={save}>Save</Button></>}>
      <FormGrid>
        <Field label="Name" required className="sm:col-span-2"><TextInput value={v.name} onValueChange={(x) => set({ name: x })} data-autofocus /></Field>
        <Field label="Contact person"><TextInput value={v.contact_name} onValueChange={(x) => set({ contact_name: x })} /></Field>
        <Field label="Email"><TextInput type="email" value={v.email} onValueChange={(x) => set({ email: x })} /></Field>
        <Field label="Phone"><TextInput value={v.phone} onValueChange={(x) => set({ phone: x })} /></Field>
        <Field label="GSTIN"><TextInput value={v.gstin} onValueChange={(x) => set({ gstin: x.toUpperCase() })} maxLength={15} /></Field>
        <Field label="State" hint="Place of supply for GST. Taken from the GSTIN when left empty."><Select value={v.state_code} onChange={(x) => set({ state_code: x })} clearable placeholder="From the GSTIN"
          options={stateOptions(states)} /></Field>
        <Field label="Billing address" className="sm:col-span-2"><Textarea value={v.address} onValueChange={(x) => set({ address: x })} rows={2} autoGrow /></Field>
        {client && <div className="sm:col-span-2"><Toggle checked={v.active} onChange={(x) => set({ active: x })} label="Active" /></div>}
      </FormGrid>
    </Modal>
  );
}

export function ProjectModal({ open, project, clients, onClose, onSaved }: { open: boolean; project: Project | null; clients: Client[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({
    name: project?.name ?? "", code: project?.code ?? "", client_id: project?.client_id ?? null as number | null,
    owner_employee_id: project?.owner_employee_id ?? null as number | null, billable: project?.billable ?? true,
    budget_hours: project?.budget_hours ? Number(project.budget_hours) : null as number | null,
    start_date: project?.start_date ?? "", end_date: project?.end_date ?? "", status: project?.status ?? "active",
    member_ids: project?.member_ids ?? [] as number[], description: project?.description ?? "",
  });
  const [names, setNames] = useState<{ value: number; label: string }[]>([]);
  useEffect(() => {
    const ids = [...(project?.member_ids ?? []), project?.owner_employee_id].filter(Boolean);
    if (!ids.length) return;
    api.get<{ value: number; label: string }[]>(`/employees/lookup?ids=${ids.join(",")}&active_only=false`).then(setNames).catch(() => {});
  }, [project]);
  const [saving, setSaving] = useState(false);
  const set = (x: Partial<typeof v>) => setV((o) => ({ ...o, ...x }));
  async function save() {
    setSaving(true);
    const body = { ...v, start_date: v.start_date || null, end_date: v.end_date || null };
    try {
      if (project) await api.put(`/timesheets/projects/${project.uuid}`, body); else await api.post("/timesheets/projects", body);
      toast.success("Project saved");
      onSaved();
    } catch (e) { toast.error(errorText(e)); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" busy={saving} title={project ? `Edit ${project.name}` : "Add project"}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!v.name.trim()} onClick={save}>Save</Button></>}>
      <FormGrid>
        <Field label="Name" required><TextInput value={v.name} onValueChange={(x) => set({ name: x })} data-autofocus /></Field>
        <Field label="Code"><TextInput value={v.code} onValueChange={(x) => set({ code: x })} placeholder="ACME-WEB" /></Field>
        <Field label="Client"><Select<number> value={v.client_id} onChange={(x) => set({ client_id: x })} clearable placeholder="Internal project"
          options={clients.filter((c) => c.active || c.id === v.client_id).map((c) => ({ value: c.id, label: c.name }))} /></Field>
        <Field label="Owner"><Select<number> value={v.owner_employee_id} onChange={(x) => set({ owner_employee_id: x })} clearable
          loadOptions={lookupEmployees} selectedOption={names.find((n) => n.value === v.owner_employee_id) ?? null} /></Field>
        <Field label="Budget" hint="Estimated hours"><NumberInput value={v.budget_hours} onChange={(x) => set({ budget_hours: x })} min={0} suffix="h" /></Field>
        <Field label="Status"><Select value={v.status} onChange={(x) => set({ status: String(x ?? "active") })}
          options={[{ value: "active", label: "Active" }, { value: "on_hold", label: "On hold" }, { value: "completed", label: "Completed" }]} /></Field>
        <Field label="Starts"><DateInput value={v.start_date} onChange={(x) => set({ start_date: x })} clearable /></Field>
        <Field label="Ends"><DateInput value={v.end_date} onChange={(x) => set({ end_date: x })} clearable /></Field>
        <Field label="Team" hint="Leave empty to let everyone log time" className="sm:col-span-2">
          <MultiSelect<number> value={v.member_ids} onChange={(x) => set({ member_ids: x })} loadOptions={lookupEmployees} selectedOptions={names.filter((n) => v.member_ids.includes(n.value))} />
        </Field>
        <div className="sm:col-span-2"><Toggle checked={v.billable} onChange={(x) => set({ billable: x })} label="Billable to the client" /></div>
        <Field label="Description" className="sm:col-span-2"><Textarea value={v.description} onValueChange={(x) => set({ description: x })} rows={2} autoGrow /></Field>
      </FormGrid>
    </Modal>
  );
}

function TaskModal({ project, task, onClose, onSaved }: { project: Project; task: Task | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [v, setV] = useState({ name: task?.name ?? "", billable: task?.billable ?? project.billable, budget_hours: task?.budget_hours ? Number(task.budget_hours) : null as number | null, status: task?.status ?? "open" });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      if (task) await api.put(`/timesheets/tasks/${task.uuid}`, v); else await api.post(`/timesheets/projects/${project.uuid}/tasks`, v);
      toast.success("Task saved");
      onSaved();
    } catch (e) { toast.error(errorText(e)); } finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="sm" busy={saving} zIndex={70} title={task ? "Edit task" : "Add task"}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!v.name.trim()} onClick={save}>Save</Button></>}>
      <FormGrid columns={1}>
        <Field label="Name" required><TextInput value={v.name} onValueChange={(x) => setV((o) => ({ ...o, name: x }))} data-autofocus /></Field>
        <Field label="Budget"><NumberInput value={v.budget_hours} onChange={(x) => setV((o) => ({ ...o, budget_hours: x }))} min={0} suffix="h" /></Field>
        <Toggle checked={v.billable} onChange={(x) => setV((o) => ({ ...o, billable: x }))} label="Billable" />
        <Toggle checked={v.status === "done"} onChange={(x) => setV((o) => ({ ...o, status: x ? "done" : "open" }))} label="Done (no more time logged)" />
      </FormGrid>
    </Modal>
  );
}

export function ProjectDetailModal({ uuid, canManage, onClose, onEdit }: { uuid: string | null; canManage: boolean; onClose: () => void; onEdit: (p: Project) => void }) {
  const toast = useToast();
  const [p, setP] = useState<(Project & { tasks: Task[]; members: { id: number; name: string | null }[] }) | null>(null);
  const [task, setTask] = useState<{ t: Task | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!uuid) return;
    let live = true;
    api.get<Project & { tasks: Task[]; members: { id: number; name: string | null }[] }>(`/timesheets/projects/${uuid}`)
      .then((r) => { if (live) setP(r); }).catch((e) => toast.error(errorText(e)));
    return () => { live = false; };
  }, [uuid, nonce, toast]);
  return (
    <>
      <Modal open={!!uuid} onClose={onClose} size="lg" title={p?.name ?? "Project"} description={p ? [p.code, p.client_name ?? "Internal"].filter(Boolean).join(" · ") : undefined}
        headerActions={p && canManage && <Button size="sm" icon={Pencil} onClick={() => onEdit(p)}>Edit</Button>}
        footer={<Button variant="primary" onClick={onClose}>Close</Button>}>
        {!p ? <div className="h-48 animate-pulse rounded-xl bg-sunken" /> : (
          <div className="space-y-6">
            <KeyValue items={[
              { label: "Owner", value: p.owner_name }, { label: "Billable", value: p.billable ? "Yes" : "No" },
              { label: "Hours", value: <BudgetBar logged={p.logged_hours} budget={p.budget_hours} /> },
              { label: "Dates", value: p.start_date ? `${formatDate(p.start_date)}${p.end_date ? ` to ${formatDate(p.end_date)}` : ""}` : null },
              { label: "Team", value: p.members.length ? p.members.map((m) => m.name).join(", ") : "Everyone", span: 2 },
            ]} />
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[13px] text-muted">Tasks</p>
                {canManage && <Button size="sm" icon={Plus} onClick={() => setTask({ t: null })}>Add task</Button>}
              </div>
              {p.tasks.length === 0 ? <p className="text-[13.5px] text-faint">No tasks yet. Time can be logged against the project.</p> : (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {p.tasks.map((t) => (
                    <li key={t.uuid} className="flex items-center gap-4 px-3 py-2.5 text-[13.5px]">
                      <div className="min-w-0 flex-1">
                        <p className={t.status === "done" ? "text-muted line-through" : "text-ink"}>{t.name}</p>
                        {!t.billable && <p className="text-[12px] text-faint">Not billable</p>}
                      </div>
                      <BudgetBar logged={t.logged_hours} budget={t.budget_hours} />
                      {canManage && <button type="button" className="text-muted hover:text-ink" aria-label="Edit task" onClick={() => setTask({ t })}><Pencil size={14} strokeWidth={1.4} /></button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>
      {task && p && <TaskModal project={p} task={task.t} onClose={() => setTask(null)} onSaved={() => { setTask(null); setNonce((n) => n + 1); }} />}
    </>
  );
}
