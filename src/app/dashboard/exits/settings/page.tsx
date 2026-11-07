"use client";

/*
 * Exit settings: a flow per kind of exit (who it applies to, clearances with owners and
 * due dates, letters, interview, who may raise it, approval) and the general rules
 * (notice, settlement, alumni access, retirement, retrenchment and lay-off).
 */
import { useCallback, useEffect, useState } from "react";
import { Plus, Save, Trash2, Workflow } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, DataTable, Field, FormGrid, FormSection, IconButton, MasterSelect, Modal, ModalCancel, MultiSelect,
  NumberInput, Select, Tabs, Textarea, TextInput, Toggle, type Column,
} from "@/components/ui-kit";
import { loadEmployees, employeeOptionsFor } from "@/components/workplace/pickers";
import { errMsg, type ExitMeta } from "@/components/exits/types";

type ClearanceDef = { key?: string; label: string; department: string; owner_type: string; owner_value: string | number | null; owner_name?: string | null; due_days: number; items: string[] };
type Flow = {
  uuid: string; name: string; exit_type: string; exit_type_label: string; audience: Record<string, number[]>; priority: number;
  clearances: ClearanceDef[]; letters: string[]; exit_interview: boolean; raised_by: string[]; needs_approval: boolean; active: boolean; in_use: number;
};
type Settings = {
  probation_notice_days: number; default_notice_days: number; notice_rate_basis: string; settlement_working_days: number;
  alumni_access_days: number; alumni_documents: string[]; retirement_age: number; retirement_start_days_before: number;
  auto_complete_after_last_day: boolean; archive_on_completion: boolean; rehire_default: boolean;
  retrenchment: { days_per_year: number; reskilling_days: number; notice_days: number; permission_threshold: number; headcount: number | null };
  layoff_compensation_percent: number; exit_interview_days_before: number;
};
type Opt = { value: number; label: string };

export default function ExitSettingsPage() {
  const [tab, setTab] = useState<"flows" | "rules">("flows");
  return (
    <div>
      <PageHeader title="Exit settings" description="How each kind of exit runs, and the rules for notice, settlement and alumni access." />
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[{ value: "flows", label: "Exit flows" }, { value: "rules", label: "Rules" }]} />
      {tab === "flows" ? <Flows /> : <Rules />}
    </div>
  );
}

function Flows() {
  const toast = useToast();
  const [meta, setMeta] = useState<ExitMeta | null>(null);
  const [rows, setRows] = useState<Flow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Flow | "new" | null>(null);
  const load = useCallback(() => {
    api.get<{ items: Flow[] }>("/exits/flows").then((r) => setRows(r.items)).catch((e) => toast.error(errMsg(e))).finally(() => setLoading(false));
  }, [toast]);
  useEffect(() => { load(); api.get<ExitMeta>("/exits/meta").then(setMeta).catch(() => {}); }, [load]);

  const cols: Column<Flow>[] = [
    { key: "name", header: "Flow", cell: (f) => <div><p className="text-ink">{f.name}</p><p className="text-[12px] text-muted">{f.exit_type_label}{Object.keys(f.audience).length ? " · some people" : " · everyone"}</p></div> },
    { key: "clear", header: "Clearances", cell: (f) => f.clearances.map((c) => c.label.replace(" clearance", "")).join(", ") || "—" },
    { key: "letters", header: "Letters", hideBelow: "md", cell: (f) => f.letters.length ? f.letters.join(", ") : "—" },
    { key: "approval", header: "Approval", hideBelow: "lg", cell: (f) => f.needs_approval ? "Yes" : "No" },
    { key: "active", header: "", cell: (f) => <span className="flex gap-1.5">{!f.active && <Badge>Off</Badge>}{f.in_use > 0 && <Badge tone="info">{f.in_use} running</Badge>}</span> },
  ];
  return (
    <>
      <div className="mb-3 flex justify-end"><Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>Add flow</Button></div>
      <DataTable rows={rows} rowKey={(f) => f.uuid} columns={cols} loading={loading} onRowClick={setEditing} emptyIcon={Workflow} emptyTitle="No exit flows" />
      {editing && <FlowModal flow={editing === "new" ? null : editing} meta={meta} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

const DEPT_OPTS = [["it", "IT"], ["admin", "Admin"], ["finance", "Finance"], ["manager", "Reporting manager"], ["assets", "Assets"], ["hr", "HR"], ["other", "Other"]];
const ROLE_OPTS = [{ value: "hr", label: "HR" }, { value: "admin", label: "HR admin" }, { value: "manager", label: "Managers" }];

function FlowModal({ flow, meta, onClose, onSaved }: { flow: Flow | null; meta: ExitMeta | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState<Omit<Flow, "uuid" | "exit_type_label" | "in_use">>(() => flow ? { ...flow } : {
    name: "", exit_type: "resignation", audience: {}, priority: 100, letters: ["relieving", "experience"], exit_interview: true,
    raised_by: ["employee", "manager", "hr"], needs_approval: true, active: true,
    clearances: [{ label: "IT clearance", department: "it", owner_type: "role", owner_value: "hr", due_days: 0, items: ["Laptop returned"] }],
  });
  const [depts, setDepts] = useState<Opt[]>([]);
  const [locs, setLocs] = useState<Opt[]>([]);
  const [letterTypes, setLetterTypes] = useState<{ value: string; label: string }[]>([]);
  const [ownerOpts, setOwnerOpts] = useState<Record<number, { value: number; label: string }>>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    api.get<{ id: number; department_name: string }[]>("/departments/").then((r) => setDepts(r.map((d) => ({ value: d.id, label: d.department_name })))).catch(() => {});
    api.get<{ id: number; name: string }[]>("/organization/locations").then((r) => setLocs(r.map((l) => ({ value: l.id, label: l.name })))).catch(() => {});
    api.get<{ letter_types: { value: string; label: string }[] }>("/letters/meta").then((r) => setLetterTypes(r.letter_types)).catch(() => {});
    const ids = (flow?.clearances ?? []).filter((c) => c.owner_type === "employee").map((c) => Number(c.owner_value));
    employeeOptionsFor(ids).then((o) => setOwnerOpts(Object.fromEntries(o.map((x) => [x.value, x])))).catch(() => {});
  }, [flow]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => { setF({ ...f, [k]: v }); setDirty(true); };
  const setCl = (i: number, patch: Partial<ClearanceDef>) => set("clearances", f.clearances.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (flow) await api.put(`/exits/flows/${flow.uuid}`, f); else await api.post("/exits/flows", f);
      toast.success("Flow saved"); onSaved();
    } catch (err) { toast.error(errMsg(err)); } finally { setBusy(false); }
  }

  return (
    <Modal open onClose={onClose} size="xl" title={flow ? flow.name : "New exit flow"} dirty={dirty} busy={busy}
      footer={<><ModalCancel /><Button type="submit" form="flow-form" variant="primary" loading={busy}>Save flow</Button></>}>
      <form id="flow-form" onSubmit={save}>
        <FormSection title="Flow">
          <FormGrid columns={3}>
            <Field label="Name" required><TextInput value={f.name} onValueChange={(v) => set("name", v)} /></Field>
            <Field label="Kind of exit"><Select value={f.exit_type} onChange={(v) => v && set("exit_type", v)}
              options={Object.entries(meta?.types ?? {}).map(([value, label]) => ({ value, label }))} /></Field>
            <Field label="Priority" hint="Lower runs first when several match"><NumberInput value={f.priority} onChange={(v) => set("priority", v ?? 100)} min={1} /></Field>
            <Field label="Departments" hint="Empty means everyone"><MultiSelect<number> value={f.audience.department_ids ?? []} options={depts}
              onChange={(v) => set("audience", { ...f.audience, department_ids: v })} /></Field>
            <Field label="Locations"><MultiSelect<number> value={f.audience.location_ids ?? []} options={locs}
              onChange={(v) => set("audience", { ...f.audience, location_ids: v })} /></Field>
            <Field label="Employment types"><MasterSelect type="employment_type" multiple value={f.audience.employment_type_ids ?? []}
              onChange={(v) => set("audience", { ...f.audience, employment_type_ids: v })} /></Field>
          </FormGrid>
        </FormSection>
        <FormSection title="Clearances" description="Due dates count from the last working day (negative means before it).">
          <div className="space-y-3">
            {f.clearances.map((c, i) => (
              <div key={i} className="rounded-xl border border-line p-3">
                <div className="grid gap-3 md:grid-cols-4">
                  <Field label="Clearance"><TextInput value={c.label} onValueChange={(v) => setCl(i, { label: v })} /></Field>
                  <Field label="Department"><Select value={c.department} onChange={(v) => v && setCl(i, { department: v })}
                    options={DEPT_OPTS.map(([value, label]) => ({ value, label }))} /></Field>
                  <Field label="Cleared by"><Select value={c.owner_type} onChange={(v) => v && setCl(i, { owner_type: v, owner_value: v === "role" ? "hr" : null })}
                    options={[{ value: "role", label: "A role" }, { value: "employee", label: "A person" }, { value: "reporting_manager", label: "Reporting manager" }]} /></Field>
                  <Field label={c.owner_type === "employee" ? "Person" : c.owner_type === "role" ? "Role" : " "}>
                    {c.owner_type === "employee" ? (
                      <Select<number> value={c.owner_value ? Number(c.owner_value) : null} loadOptions={loadEmployees}
                        selectedOption={c.owner_value ? ownerOpts[Number(c.owner_value)] ?? (c.owner_name ? { value: Number(c.owner_value), label: c.owner_name } : null) : null}
                        onChange={(v, o) => { if (o) setOwnerOpts({ ...ownerOpts, [o.value]: o }); setCl(i, { owner_value: v }); }} />
                    ) : c.owner_type === "role" ? (
                      <Select value={String(c.owner_value ?? "hr")} onChange={(v) => setCl(i, { owner_value: v })} options={ROLE_OPTS} />
                    ) : <p className="pt-2 text-[13px] text-muted">The leaver’s manager</p>}
                  </Field>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[180px_1fr_auto]">
                <Field label="Due (days from last day)"><NumberInput value={c.due_days} onChange={(v) => setCl(i, { due_days: v ?? 0 })} min={-60} max={30} /></Field>
                <Field label="Checklist items" hint="One per line">
                  <Textarea rows={2} autoGrow value={c.items.join("\n")} onValueChange={(v) => setCl(i, { items: v.split("\n") })} />
                </Field>
                <div className="flex items-start pt-7"><IconButton icon={Trash2} label="Remove clearance" onClick={() => set("clearances", f.clearances.filter((_, j) => j !== i))} /></div>
                </div>
              </div>
            ))}
            <Button type="button" variant="secondary" icon={Plus} onClick={() => set("clearances", [...f.clearances, { label: "", department: "other", owner_type: "role", owner_value: "hr", due_days: 0, items: [] }])}>Add clearance</Button>
          </div>
        </FormSection>
        <FormSection title="Letters, interview and approval">
          <FormGrid columns={2}>
            <Field label="Letters issued"><MultiSelect value={f.letters} onChange={(v) => set("letters", v)} options={letterTypes} /></Field>
            <Field label="Who may raise it">
              <div className="flex flex-wrap gap-4 pt-1.5">
                {[["employee", "Employee"], ["manager", "Manager"], ["hr", "HR"]].map(([k, label]) => (
                  <Checkbox key={k} label={label} checked={f.raised_by.includes(k)}
                    onChange={(v) => set("raised_by", v ? [...f.raised_by, k] : f.raised_by.filter((x) => x !== k))} />
                ))}
              </div>
            </Field>
            <Toggle checked={f.exit_interview} onChange={(v) => set("exit_interview", v)} label="Exit interview" />
            <Toggle checked={f.needs_approval} onChange={(v) => set("needs_approval", v)} label="Needs approval" description="When raised by the employee or a manager" />
            <Toggle checked={f.active} onChange={(v) => set("active", v)} label="Flow is on" />
          </FormGrid>
        </FormSection>
      </form>
    </Modal>
  );
}

function Rules() {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get<Settings>("/exits/settings").then(setS).catch((e) => toast.error(errMsg(e))); }, [toast]);
  if (!s) return null;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const setR = (k: keyof Settings["retrenchment"], v: number | null) => setS({ ...s, retrenchment: { ...s.retrenchment, [k]: v } });
  async function save() {
    setBusy(true);
    try { setS(await api.put<Settings>("/exits/settings", s)); toast.success("Saved"); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  const docs = [["letters", "Letters"], ["payslips", "Payslips"], ["tax", "Tax certificates (Form 16)"]];
  return (
    <div className="space-y-4">
      <Paper>
        <PaperHeader title="Notice and settlement" />
        <div className="p-5"><FormGrid columns={3}>
          <Field label="Notice on probation (days)"><NumberInput value={s.probation_notice_days} onChange={(v) => set("probation_notice_days", v ?? 0)} min={0} /></Field>
          <Field label="Default notice (days)" hint="When the employee record has none"><NumberInput value={s.default_notice_days} onChange={(v) => set("default_notice_days", v ?? 0)} min={0} /></Field>
          <Field label="Daily rate based on"><Select value={s.notice_rate_basis} onChange={(v) => v && set("notice_rate_basis", v)}
            options={[{ value: "gross", label: "Monthly gross ÷ 30" }, { value: "basic", label: "Basic ÷ 30" }]} /></Field>
          <Field label="Pay the settlement within (working days)" hint="The Code on Wages allows at most 2">
            <NumberInput value={s.settlement_working_days} onChange={(v) => set("settlement_working_days", Math.min(2, v ?? 2))} min={1} max={2} /></Field>
          <Field label="Exit interview (days before the last day)"><NumberInput value={s.exit_interview_days_before} onChange={(v) => set("exit_interview_days_before", v ?? 0)} min={0} /></Field>
        </FormGrid>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Toggle checked={s.auto_complete_after_last_day} onChange={(v) => set("auto_complete_after_last_day", v)} label="Close exits after the last day" description="Disables sign-in automatically" />
            <Toggle checked={s.archive_on_completion} onChange={(v) => set("archive_on_completion", v)} label="Archive the record" description="Never deleted" />
            <Toggle checked={s.rehire_default} onChange={(v) => set("rehire_default", v)} label="Eligible for rehire by default" />
          </div>
        </div>
      </Paper>
      <Paper>
        <PaperHeader title="Alumni access" />
        <div className="p-5"><FormGrid columns={2}>
          <Field label="Access lasts (days after the last day)" hint="0 switches the alumni portal off"><NumberInput value={s.alumni_access_days} onChange={(v) => set("alumni_access_days", v ?? 0)} min={0} max={3650} /></Field>
          <Field label="Former employees can download">
            <div className="flex flex-wrap gap-4 pt-1.5">
              {docs.map(([k, label]) => <Checkbox key={k} label={label} checked={s.alumni_documents.includes(k)}
                onChange={(v) => set("alumni_documents", v ? [...s.alumni_documents, k] : s.alumni_documents.filter((x) => x !== k))} />)}
            </div>
          </Field>
        </FormGrid></div>
      </Paper>
      <Paper>
        <PaperHeader title="Retirement" />
        <div className="p-5"><FormGrid columns={2}>
          <Field label="Retirement age"><NumberInput value={s.retirement_age} onChange={(v) => set("retirement_age", v ?? 58)} min={50} max={75} /></Field>
          <Field label="Start the exit (days before)" hint="Retirement is on the last day of the month the age is reached"><NumberInput value={s.retirement_start_days_before} onChange={(v) => set("retirement_start_days_before", v ?? 90)} min={0} /></Field>
        </FormGrid></div>
      </Paper>
      <Paper>
        <PaperHeader title="Retrenchment and lay-off" />
        <div className="p-5"><FormGrid columns={3}>
          <Field label="Compensation (days per year)"><NumberInput value={s.retrenchment.days_per_year} onChange={(v) => setR("days_per_year", v ?? 15)} min={15} /></Field>
          <Field label="Re-skilling fund (days)"><NumberInput value={s.retrenchment.reskilling_days} onChange={(v) => setR("reskilling_days", v ?? 15)} min={15} /></Field>
          <Field label="Notice (days)"><NumberInput value={s.retrenchment.notice_days} onChange={(v) => setR("notice_days", v ?? 30)} min={0} /></Field>
          <Field label="Government permission from (workers)"><NumberInput value={s.retrenchment.permission_threshold} onChange={(v) => setR("permission_threshold", v ?? 300)} min={1} /></Field>
          <Field label="Headcount override" hint="Empty uses active employees"><NumberInput value={s.retrenchment.headcount} onChange={(v) => setR("headcount", v)} min={1} /></Field>
          <Field label="Lay-off pay (% of basic and DA)"><NumberInput value={s.layoff_compensation_percent} onChange={(v) => set("layoff_compensation_percent", v ?? 50)} min={0} max={100} suffix="%" /></Field>
        </FormGrid></div>
      </Paper>
      <div className="flex justify-end"><Button variant="primary" icon={Save} loading={busy} onClick={save}>Save rules</Button></div>
    </div>
  );
}
