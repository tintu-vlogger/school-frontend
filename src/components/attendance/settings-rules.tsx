"use client";

/* Attendance rules (versioned): grace, late-mark penalties, minimum hours, rounding,
 * missing punches, overtime and the night window. A change starts a new version from a
 * date; older days keep the version that applied then. */
import { useEffect, useMemo, useState } from "react";
import { History, Plus, Scale } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, todayISO } from "@/lib/datetime";
import {
  Badge, Button, DataTable, DateInput, Field, FormGrid, FormSection, Modal, ModalCancel, MultiSelect, NumberInput,
  RadioCards, Select, TextInput, Textarea, TimeInput, Toggle, type SelectOption,
} from "@/components/ui-kit";
import { errorText, lookupEmployees } from "./shared";
import type { Config } from "./settings-common";

type Rule = {
  uuid: string; id: number; version: number; name: string; description: string | null; effective_from: string;
  effective_to: string | null; is_current: boolean; is_default: boolean; priority: number;
  applies_to: { employee_ids?: number[]; department_ids?: number[] }; config: Config; active: boolean;
  change_note: string | null; created_by_name: string | null;
};

const DEDUCT: SelectOption[] = [{ value: "0.25", label: "Quarter day" }, { value: "0.5", label: "Half day" }, { value: "1", label: "Full day" }];

function Penalty({ label, value, onChange }: { label: string; value: Config; onChange: (v: Config) => void }) {
  return (
    <div className="space-y-3 rounded-xl border border-line px-4 py-3">
      <Toggle checked={!!value.enabled} onChange={(x) => onChange({ ...value, enabled: x })} label={label} />
      {value.enabled && (
        <FormGrid columns={3}>
          <Field label="Every"><NumberInput value={value.count} onChange={(x) => onChange({ ...value, count: x ?? 1 })} min={1} max={31} suffix="times" /></Field>
          <Field label="Deduct">
            <Select value={String(value.deduct_days)} onChange={(x) => onChange({ ...value, deduct_days: Number(x || 0.5) })} options={DEDUCT} />
          </Field>
          <div className="flex items-end pb-2">
            <Toggle size="sm" checked={value.every_multiple !== false} onChange={(x) => onChange({ ...value, every_multiple: x })}
              label="Repeat" description="Again at every multiple (6th, 9th …)" />
          </div>
        </FormGrid>
      )}
    </div>
  );
}

function RuleModal({ rule, defaults, open, onClose, onSaved, departments }: {
  rule: Rule | null; defaults: Config; open: boolean; onClose: () => void; onSaved: () => void; departments: SelectOption<number>[];
}) {
  const toast = useToast();
  const [name, setName] = useState(rule?.name ?? "");
  const [description, setDescription] = useState(rule?.description ?? "");
  const [from, setFrom] = useState(rule ? todayISO() > rule.effective_from ? todayISO() : rule.effective_from : todayISO());
  const [priority, setPriority] = useState<number | null>(rule?.priority ?? 100);
  const [isDefault, setIsDefault] = useState(rule?.is_default ?? false);
  const [empIds, setEmpIds] = useState<number[]>(rule?.applies_to?.employee_ids ?? []);
  const [empOpts, setEmpOpts] = useState<SelectOption<number>[]>([]);
  const [deptIds, setDeptIds] = useState<number[]>(rule?.applies_to?.department_ids ?? []);
  const [c, setC] = useState<Config>(JSON.parse(JSON.stringify(rule?.config ?? defaults)));
  const [note, setNote] = useState("");
  const [versions, setVersions] = useState<Rule[]>([]);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: unknown) => setC((x) => ({ ...x, [k]: v }));
  const setOt = (k: string, v: unknown) => setC((x) => ({ ...x, overtime: { ...x.overtime, [k]: v } }));

  useEffect(() => {
    if (!rule) return;
    api.get<Rule & { versions: Rule[] }>(`/attendance/rules/${rule.uuid}`).then((r) => setVersions(r.versions)).catch(() => {});
    if (rule.applies_to?.employee_ids?.length) {
      api.get<{ value: number; label: string }[]>(`/employees/lookup?ids=${rule.applies_to.employee_ids.join(",")}&active_only=false`)
        .then((r) => setEmpOpts(r.map((x) => ({ value: x.value, label: x.label })))).catch(() => {});
    }
  }, [rule]);

  async function save() {
    setSaving(true);
    try {
      const body = { name, description: description || null, effective_from: from, priority, is_default: isDefault,
        applies_to: { employee_ids: empIds, department_ids: deptIds }, config: c, change_note: note || null };
      if (rule) await api.put(`/attendance/rules/${rule.uuid}`, body);
      else await api.post("/attendance/rules", body);
      toast.success(rule && from !== rule.effective_from ? `Saved as a new version from ${formatDate(from)}` : "Rule saved");
      onSaved();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save the rule"));
    } finally {
      setSaving(false);
    }
  }

  const num = (k: string, label: string, suffix?: string, hint?: string, step = 1) => (
    <Field label={label} hint={hint}>
      <NumberInput value={c[k] ?? null} onChange={(v) => set(k, v)} min={0} step={step} suffix={suffix} placeholder="Off" />
    </Field>
  );

  return (
    <Modal open={open} onClose={onClose} size="xl" busy={saving} dirty title={rule ? `Edit ${rule.name}` : "New attendance rule"}
      description={rule ? `Version ${rule.version}, in force from ${formatDate(rule.effective_from)}` : undefined}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!name.trim()} onClick={save}>Save rule</Button></>}>
      <div className="space-y-7">
        <FormGrid columns={3}>
          <Field label="Name" required className="sm:col-span-2"><TextInput value={name} onValueChange={setName} /></Field>
          <Field label="Applies from" required hint={rule ? "A later date keeps the old version for earlier days" : undefined}>
            <DateInput value={from} onChange={setFrom} min={rule?.effective_from} />
          </Field>
        </FormGrid>
        <Field label="Description"><Textarea value={description} onValueChange={setDescription} rows={2} autoGrow /></Field>

        <FormSection title="Who it applies to" description="Leave both empty for everyone. When several rules match, the lower priority number wins.">
          <FormGrid columns={3}>
            <Field label="People"><MultiSelect value={empIds} onChange={(v, o) => { setEmpIds(v); setEmpOpts(o); }} loadOptions={lookupEmployees} selectedOptions={empOpts} placeholder="Anyone" /></Field>
            <Field label="Departments"><MultiSelect value={deptIds} onChange={(v) => setDeptIds(v)} options={departments} placeholder="Any" /></Field>
            <Field label="Priority"><NumberInput value={priority} onChange={setPriority} min={1} max={10000} /></Field>
          </FormGrid>
          <Toggle checked={isDefault} onChange={setIsDefault} label="Default rule" description="Used for anyone no other rule matches." />
        </FormSection>

        <FormSection title="Hours">
          <Field label="Worked hours are">
            <RadioCards value={c.hours_calc} onChange={(v) => set("hours_calc", v)} options={[
              { value: "first_last", label: "First in to last out", description: "Unpaid shift breaks are taken off" },
              { value: "pairs", label: "Sum of every in and out", description: "Time between an out and the next in is not counted" },
            ]} />
          </Field>
          <FormGrid columns={3}>
            {num("full_day_hours", "Full day needs", "h", "When the shift doesn't set its own", 0.5)}
            {num("half_day_hours", "Half day needs", "h", undefined, 0.5)}
            {num("missing_punch_payable", "Pay for a day with one punch", "day", "Until it is corrected", 0.5)}
          </FormGrid>
          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle checked={!!c.auto_absent} onChange={(v) => set("auto_absent", v)} label="Mark absent when nobody punches" />
            <Toggle checked={!!c.count_permission_hours} onChange={(v) => set("count_permission_hours", v)} label="Approved permission hours count as worked" />
          </div>
        </FormSection>

        <FormSection title="Late arrival and early leaving" description="Leave grace empty to use each shift's own grace.">
          <FormGrid columns={2}>
            {num("late_grace_minutes", "Grace for late arrival", "min")}
            {num("early_grace_minutes", "Grace for early leaving", "min")}
            {num("half_day_if_late_by_minutes", "Half day if late by more than", "min")}
            {num("half_day_if_early_by_minutes", "Half day if leaving earlier than", "min", "minutes before the shift ends")}
          </FormGrid>
          <Penalty label="Penalty for late marks in a month" value={c.late_penalty || {}} onChange={(v) => set("late_penalty", v)} />
          <Penalty label="Penalty for leaving early in a month" value={c.early_penalty || {}} onChange={(v) => set("early_penalty", v)} />
        </FormSection>

        <FormSection title="Rounding" description="Round the first check-in up and the last check-out down to the nearest step.">
          <FormGrid>
            <Field label="Check-in to the next"><NumberInput value={c.rounding?.in_minutes ?? 0} onChange={(v) => set("rounding", { ...c.rounding, in_minutes: v ?? 0 })} min={0} max={60} suffix="min" /></Field>
            <Field label="Check-out to the previous"><NumberInput value={c.rounding?.out_minutes ?? 0} onChange={(v) => set("rounding", { ...c.rounding, out_minutes: v ?? 0 })} min={0} max={60} suffix="min" /></Field>
          </FormGrid>
        </FormSection>

        <FormSection title="Overtime" description="Code on Wages: overtime is paid at least twice the ordinary rate. OSH Code: overtime needs the worker's consent and has a quarterly limit.">
          <Toggle checked={!!c.overtime?.enabled} onChange={(v) => setOt("enabled", v)} label="Count overtime" />
          {c.overtime?.enabled && (
            <>
              <FormGrid columns={3}>
                <Field label="Only when more than"><NumberInput value={c.overtime.min_minutes} onChange={(v) => setOt("min_minutes", v ?? 0)} min={0} suffix="min" /></Field>
                <Field label="Rate" hint="At least 2× (Code on Wages)"><NumberInput value={c.overtime.rate_multiplier} onChange={(v) => setOt("rate_multiplier", v ?? 2)} min={2} step={0.25} suffix="× wage" /></Field>
                <Field label="Daily limit"><NumberInput value={c.overtime.daily_cap_minutes} onChange={(v) => setOt("daily_cap_minutes", v)} min={0} suffix="min" /></Field>
                <Field label="Quarterly limit" hint="OSH Code; default 125 h"><NumberInput value={c.overtime.quarterly_cap_hours} onChange={(v) => setOt("quarterly_cap_hours", v)} min={0} suffix="h" /></Field>
                <Field label="Alert at"><NumberInput value={c.overtime.alert_at_percent} onChange={(v) => setOt("alert_at_percent", v)} min={1} max={100} suffix="% of limit" /></Field>
              </FormGrid>
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle checked={!!c.overtime.requires_preapproval} onChange={(v) => setOt("requires_preapproval", v)} label="Needs pre-approval" description="Only approved overtime is paid; the rest is shown as unapproved" />
                <Toggle checked={c.overtime.off_day_all_overtime !== false} onChange={(v) => setOt("off_day_all_overtime", v)} label="All work on holidays and weekly offs is overtime" />
                <Toggle checked={!!c.overtime.count_early_arrival} onChange={(v) => setOt("count_early_arrival", v)} label="Count arriving before the shift" />
              </div>
            </>
          )}
        </FormSection>

        <FormSection title="Night work" description="Hours in this window drive night allowance and the night-shift reports.">
          <FormGrid>
            <Field label="From"><TimeInput value={c.night_window?.start ?? "22:00"} onChange={(v) => set("night_window", { ...c.night_window, start: v })} /></Field>
            <Field label="To"><TimeInput value={c.night_window?.end ?? "06:00"} onChange={(v) => set("night_window", { ...c.night_window, end: v })} /></Field>
          </FormGrid>
        </FormSection>

        <Field label="What changed"><TextInput value={note} onValueChange={setNote} placeholder="Optional note for the history" /></Field>

        {versions.length > 1 && (
          <FormSection title="History">
            <ul className="space-y-1.5 text-[13px]">
              {versions.map((v) => (
                <li key={v.uuid} className="flex flex-wrap gap-x-3 text-muted">
                  <History size={14} strokeWidth={1.4} className="mt-0.5 text-faint" />
                  <span className="text-ink">Version {v.version}</span>
                  <span>{formatDate(v.effective_from)} to {v.effective_to ? formatDate(v.effective_to) : "now"}</span>
                  {v.change_note && <span>· {v.change_note}</span>}
                  <span className="text-faint">· {v.created_by_name || "System"}</span>
                </li>
              ))}
            </ul>
          </FormSection>
        )}
      </div>
    </Modal>
  );
}

export function RulesTab() {
  const toast = useToast();
  const [rows, setRows] = useState<Rule[] | null>(null);
  const [defaults, setDefaults] = useState<Config | null>(null);
  const [departments, setDepartments] = useState<SelectOption<number>[]>([]);
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [session, setSession] = useState(0);
  const load = () => api.get<Rule[]>("/attendance/rules").then(setRows).catch((e) => { setRows([]); toast.error(errorText(e)); });
  useEffect(() => {
    load();
    api.get<Config>("/attendance/rules/defaults").then(setDefaults).catch(() => {});
    api.getCached<{ id: number; department_name: string }[]>("/departments/", 120)
      .then((r) => setDepartments((Array.isArray(r) ? r : []).map((d) => ({ value: d.id, label: d.department_name })))).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const deptNames = useMemo(() => Object.fromEntries(departments.map((d) => [d.value, d.label])), [departments]);

  const open = (r: Rule | "new") => { setSession((s) => s + 1); setEditing(r); };
  const who = (r: Rule) => {
    const parts = [];
    if (r.applies_to?.employee_ids?.length) parts.push(`${r.applies_to.employee_ids.length} people`);
    if (r.applies_to?.department_ids?.length) parts.push(r.applies_to.department_ids.map((d) => deptNames[d] || "Department").join(", "));
    return parts.length ? parts.join(" · ") : "Everyone";
  };

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button variant="primary" icon={Plus} disabled={!defaults} onClick={() => open("new")}>New rule</Button>
      </div>
      <DataTable rows={rows ?? []} loading={rows === null} rowKey={(r) => r.uuid} onRowClick={open}
        columns={[
          { key: "name", header: "Rule", cell: (r) => <div className="flex items-center gap-2"><span className="text-ink">{r.name}</span>{r.is_default && <Badge tone="accent">Default</Badge>}</div> },
          { key: "who", header: "Applies to", cell: (r) => <span className="text-muted">{who(r)}</span> },
          {
            key: "summary", header: "Summary", hideBelow: "md", cell: (r) => (
              <span className="text-[13px] text-muted">
                Full day {r.config.full_day_hours} h · half {r.config.half_day_hours} h
                {r.config.late_penalty?.enabled ? ` · ${r.config.late_penalty.count} lates = ${r.config.late_penalty.deduct_days} day` : ""}
                {r.config.overtime?.enabled ? ` · OT ${r.config.overtime.rate_multiplier}×` : ""}
              </span>
            ),
          },
          { key: "version", header: "Version", hideBelow: "lg", cell: (r) => <span className="text-muted">v{r.version} from {formatDate(r.effective_from)}</span> },
          { key: "status", header: "Status", cell: (r) => <Badge tone={r.active ? "good" : "neutral"} dot>{r.active ? "In use" : "Off"}</Badge> },
        ]}
        emptyIcon={Scale} emptyTitle="No rules yet" />
      {editing !== null && defaults && (
        <RuleModal key={session} open rule={editing === "new" ? null : editing} defaults={defaults} departments={departments}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </>
  );
}
