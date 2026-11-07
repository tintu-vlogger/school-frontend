"use client";

/*
 * Settings → Leave types. A list of leave types with their rules in short; Add / Edit open
 * a large step-by-step editor (basics, who gets it, how it is earned, year end, rules,
 * review). Saving new rules creates a new version from a start date; earlier periods keep
 * the rules they had. Version history and the company-wide leave settings open in modals.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Ban, Check, History, Pencil, Plus, RotateCcw, Settings2, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime, todayISO } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, FormSection, IconButton, Modal, ModalCancel, MultiSelect,
  NumberInput, RadioCards, Select, Stepper, Textarea, TextInput, Timeline, Toggle, useConfirm, type Column,
} from "@/components/ui-kit";
import { ApplicabilityEditor, applicabilityText } from "@/components/leave/applicability";
import { ICONS, LeaveIcon, fmtDays } from "@/components/leave/leave-ui";
import type { Applicability } from "@/components/leave/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rules = Record<string, any>;
type Version = { uuid: string; version: number; effective_from: string; effective_to: string | null; change_note: string | null; created_by_name: string | null; created_at: string; summary: string[] };
type LeaveType = {
  uuid: string; code: string; name: string; color: string; icon: string; kind: string; description: string | null; active: boolean; is_system: boolean;
  sort_order: number; paid: string; mode: string; statutory: boolean; rules: Rules; summary: string[]; current_version: number | null;
  effective_from: string | null; versions: Version[];
};

const COLORS = ["#4f46e5", "#0ea5e9", "#e11d48", "#db2777", "#0d9488", "#16a34a", "#f59e0b", "#8b5cf6", "#64748b", "#78716c", "#ea580c", "#0891b2"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const STEPS = [
  { label: "Basics" }, { label: "Who gets it" }, { label: "Earning" }, { label: "Year end" }, { label: "Rules" }, { label: "Save" },
];
const MODE_LABEL: Record<string, string> = { fixed: "Fixed yearly", accrual: "Earned over the year", days_worked: "From days worked", grant: "Granted on request", none: "No balance" };

function setPath(obj: Rules, path: string, value: unknown): Rules {
  const keys = path.split(".");
  const out: Rules = { ...obj };
  let cur: Rules = out;
  keys.slice(0, -1).forEach((k) => { cur[k] = { ...(cur[k] ?? {}) }; cur = cur[k]; });
  cur[keys[keys.length - 1]] = value;
  return out;
}

export default function LeaveTypesPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<LeaveType[] | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<LeaveType | "new" | null>(null);
  const [historyOf, setHistoryOf] = useState<LeaveType | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(() => {
    api.get<LeaveType[]>("/leave/types").then(setRows).catch((e) => { toast.error(e instanceof Error ? e.message : "Couldn't load"); setRows([]); });
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => (rows ?? []).filter((t) => !q || `${t.name} ${t.code}`.toLowerCase().includes(q.toLowerCase())), [rows, q]);

  async function toggle(t: LeaveType) {
    if (t.active && !(await confirm({ title: `Switch off ${t.name}?`, message: "Nobody can apply for it any more. Balances and history are kept.", confirmLabel: "Switch off", tone: "danger" }))) return;
    try { await api.post(`/leave/types/${t.uuid}/active`, { active: !t.active }); toast.success(t.active ? "Switched off" : "Switched on"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
  }
  async function restore() {
    try { await api.post("/leave/defaults"); toast.success("Standard leave types checked"); load(); } catch { toast.error("Couldn't restore"); }
  }

  const columns: Column<LeaveType>[] = [
    { key: "name", header: "Leave type", sortable: true, sortValue: (t) => t.sort_order, cell: (t) => (
      <span className="flex min-w-0 items-center gap-3"><LeaveIcon name={t.icon} color={t.color} size={34} />
        <span className="min-w-0"><span className="block truncate text-ink">{t.name}</span>
          <span className="block truncate text-[12px] text-faint">{t.code}{t.statutory ? " · statutory" : ""}{t.paid !== "paid" ? " · unpaid" : ""}</span></span></span>) },
    { key: "earn", header: "Earning", hideBelow: "md", cell: (t) => <span className="text-[13px] text-muted">{t.summary?.[0] ?? MODE_LABEL[t.mode]}</span> },
    { key: "who", header: "Who", hideBelow: "lg", cell: (t) => <span className="text-[13px] text-muted">{applicabilityText(t.rules.applicability)}</span> },
    { key: "ver", header: "Version", hideBelow: "md", cell: (t) => <span className="text-[13px] text-muted">v{t.current_version} · from {t.effective_from && t.effective_from > "2001" ? formatDate(t.effective_from) : "the start"}</span> },
    { key: "status", header: "Status", cell: (t) => <Badge tone={t.active ? "good" : "neutral"} dot>{t.active ? "On" : "Off"}</Badge> },
  ];

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Leave types" description="Every kind of leave and its rules. Changes take effect from a date you choose; earlier periods keep their old rules."
        actions={<>
          <Button variant="secondary" icon={Settings2} onClick={() => setSettingsOpen(true)}>Leave settings</Button>
          <Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>New leave type</Button>
        </>} />
      <FilterBar onSearchChange={setQ} searchPlaceholder="Search leave types"
        actions={<Button variant="ghost" icon={RotateCcw} onClick={restore}>Add missing standard types</Button>} />
      <DataTable rows={shown} loading={rows === null} columns={columns} rowKey={(t) => t.uuid} onRowClick={(t) => setEditing(t)}
        rowActions={(t) => [
          { label: "Edit", icon: Pencil, onSelect: () => setEditing(t) },
          { label: "Version history", icon: History, onSelect: () => setHistoryOf(t) },
          "separator",
          { label: t.active ? "Switch off" : "Switch on", icon: t.active ? Ban : Check, danger: t.active, onSelect: () => toggle(t) },
        ]}
        emptyTitle="No leave types" emptyAction={<Button variant="secondary" onClick={restore}>Add the standard Indian leave types</Button>} />
      <TypeEditor type={editing} types={rows ?? []} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }}
        onHistory={(t) => setHistoryOf(t)} />
      <VersionHistory type={historyOf} onClose={() => setHistoryOf(null)} />
      <LeaveSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

/* ── Editor ───────────────────────────────────────────────────────── */

const BLANK: Rules = {
  paid: "paid", pay_percent: 100, statutory: false, legal_kind: "none", unit: "day", allow_half_day: true, allow_quarter_day: false, allow_hourly: false, hours_per_day: 8,
  applicability: { mode: "all" },
  entitlement: { mode: "fixed", yearly_quota: 12, frequency: "monthly", credit_at: "start",
    days_worked: { per_days: 20, credit: 1, min_days_in_year: 180, count_paid_leave: true, count_holidays: true },
    proration: { on_joining: true, on_exit: true, basis: "months", joining_cutoff_day: 15, rounding: "half", round_mode: "nearest" },
    probation: { credit: "full", reduced_quota: 0, waiting_days: 0 }, experience_levels: [], max_balance: null },
  year_end: { year_start_month: 1, reset: true, carry_forward: { enabled: false, max_days: 0, percent: 100, expire_after_months: null, max_accumulation: null },
    encashment: { enabled: false, max_days: 0, percent: 100, min_balance_after: 0, on_exit: false } },
  restrictions: { min_days: null, max_days: null, max_consecutive: null, notice_days: 0, notice_above_days: 0, backdated_days: 30, future_days: 365,
    count_weekends: false, count_holidays: false, sandwich: { weekends: false, holidays: false, min_days: 0, adjacent: false }, clubbing_blocked: [],
    document_after_days: null, negative: { mode: "none", limit: 0 }, max_requests: { count: null, period: "year" }, min_gap_days: null,
    only_optional_holidays: false, hidden_from_employee: false },
  grant: { options: [], max_requests: null, period: "tenure", min_gap_days: null },
};

function TypeEditor({ type, types, onClose, onSaved, onHistory }: { type: LeaveType | "new" | null; types: LeaveType[]; onClose: () => void; onSaved: () => void; onHistory: (t: LeaveType) => void }) {
  const toast = useToast();
  const isNew = type === "new";
  const existing = type && type !== "new" ? type : null;
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState("plane");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState("standard");
  const [rules, setRules] = useState<Rules>(BLANK);
  const [effective, setEffective] = useState(todayISO());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!type) return;
    setStep(0); setDirty(false); setNote(""); setEffective(todayISO());
    if (type === "new") { setName(""); setCode(""); setColor(COLORS[0]); setIcon("plane"); setDescription(""); setKind("standard"); setRules(BLANK); }
    else { setName(type.name); setCode(type.code); setColor(type.color); setIcon(type.icon); setDescription(type.description ?? ""); setKind(type.kind); setRules(type.rules); }
  }, [type]);

  const r = rules;
  const up = (path: string, value: unknown) => { setRules((x) => setPath(x, path, value)); setDirty(true); };
  const e = r.entitlement ?? {};
  const y = r.year_end ?? {};
  const s = r.restrictions ?? {};
  const g = r.grant ?? { options: [] };
  const otherCodes = types.filter((t) => t.uuid !== existing?.uuid).map((t) => ({ value: t.code, label: `${t.name} (${t.code})` }));
  const rulesChanged = !existing || JSON.stringify(existing.rules) !== JSON.stringify(rules);

  async function save() {
    if (!name.trim() || !code.trim()) { toast.error("Give the leave type a name and a code."); setStep(0); return; }
    setSaving(true);
    try {
      const body = { name, code, color, icon, description, kind, rules: rulesChanged ? rules : undefined, effective_from: isNew ? "2000-01-01" : effective, change_note: note || null };
      if (isNew) await api.post("/leave/types", body); else await api.put(`/leave/types/${existing!.uuid}`, body);
      toast.success(isNew ? "Leave type added" : rulesChanged ? "Saved as a new version" : "Saved");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't save"); }
    finally { setSaving(false); }
  }

  const num = (path: string, value: number | null, props: { min?: number; max?: number; step?: number; suffix?: string } = {}) => (
    <NumberInput value={value ?? null} onChange={(n) => up(path, n)} min={props.min ?? 0} max={props.max ?? 1000} step={props.step ?? 1} suffix={props.suffix} />
  );

  return (
    <Modal open={!!type} onClose={onClose} size="full" busy={saving} dirty={dirty}
      leading={<LeaveIcon name={icon} color={color} size={36} />}
      title={isNew ? "New leave type" : `${existing?.name}`} description={existing ? `${existing.code} · version ${existing.current_version}` : "Set it up step by step; you can change anything later."}
      headerActions={existing ? <Button variant="ghost" size="sm" icon={History} onClick={() => onHistory(existing)}>History</Button> : undefined}
      footerStart={<span className="text-[13px] text-faint">Step {step + 1} of {STEPS.length}</span>}
      footer={<>
        {step > 0 ? <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button> : <ModalCancel />}
        {step < STEPS.length - 1 ? <Button variant="primary" onClick={() => setStep(step + 1)}>Next</Button>
          : <Button variant="primary" icon={Check} loading={saving} onClick={save}>{isNew ? "Add leave type" : "Save"}</Button>}
      </>}>
      <div className="mx-auto max-w-4xl">
        <Stepper steps={STEPS} current={step} onStepClick={setStep} className="mb-8" />

        {step === 0 && (
          <div className="space-y-8">
            <FormSection title="Name and look">
              <FormGrid>
                <Field label="Name" required><TextInput value={name} onValueChange={(v) => { setName(v); setDirty(true); }} placeholder="e.g. Earned leave" data-autofocus /></Field>
                <Field label="Code" required hint="Short code shown on calendars, e.g. EL"><TextInput value={code} onValueChange={(v) => { setCode(v.toUpperCase()); setDirty(true); }} maxLength={20} /></Field>
              </FormGrid>
              <Field label="Colour">
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => <button key={c} type="button" aria-label={c} onClick={() => { setColor(c); setDirty(true); }}
                    className={`h-8 w-8 rounded-full transition-transform ${color === c ? "scale-110 ring-2 ring-offset-2" : "hover:scale-105"}`} style={{ background: c, ["--tw-ring-color" as string]: c }} />)}
                </div>
              </Field>
              <Field label="Icon">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(ICONS).map(([k, I]) => (
                    <button key={k} type="button" aria-label={k} onClick={() => { setIcon(k); setDirty(true); }}
                      className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${icon === k ? "border-transparent" : "border-line text-muted hover:border-line-strong"}`}
                      style={icon === k ? { background: `${color}18`, color, boxShadow: `inset 0 0 0 1px ${color}55` } : undefined}>
                      <I size={18} strokeWidth={1.4} />
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Description" hint="Shown to employees when they apply."><Textarea value={description} onValueChange={(v) => { setDescription(v); setDirty(true); }} rows={2} autoGrow /></Field>
            </FormSection>
            <FormSection title="Kind and pay">
              <FormGrid columns={3}>
                <Field label="Kind">
                  <Select value={kind} onChange={(v) => { setKind(v ?? "standard"); setDirty(true); }} disabled={!!existing?.is_system}
                    options={[{ value: "standard", label: "Standard leave" }, { value: "comp_off", label: "Compensatory off" }, { value: "lop", label: "Loss of pay" }, { value: "optional_holiday", label: "Optional holiday" }]} />
                </Field>
                <Field label="Pay">
                  <Select value={r.paid} onChange={(v) => up("paid", v)} options={[{ value: "paid", label: "Paid" }, { value: "unpaid", label: "Unpaid" }, { value: "lop", label: "Loss of pay" }]} />
                </Field>
                <Field label="Legal basis" hint="The legal minimum is enforced.">
                  <Select value={r.legal_kind} onChange={(v) => up("legal_kind", v)} options={[{ value: "none", label: "Company policy" }, { value: "annual", label: "Annual leave (OSH Code)" },
                    { value: "maternity", label: "Maternity (Social Security Code)" }, { value: "sick", label: "Sick leave" }, { value: "casual", label: "Casual leave" }, { value: "paternity", label: "Paternity" }]} />
                </Field>
              </FormGrid>
              {r.paid === "paid" && (
                <FormGrid columns={3}>
                  <Field label="Pay kept on this leave" hint="e.g. 50 for half-pay sick leave; the rest goes to payroll as loss of pay.">
                    <NumberInput value={r.pay_percent ?? 100} onChange={(v) => up("pay_percent", v ?? 100)} min={0} max={100} step={5} suffix="%" />
                  </Field>
                </FormGrid>
              )}
              <Toggle checked={!!r.statutory} onChange={(v) => up("statutory", v)} label="Statutory leave" description="Marked as required by law in reports and registers." />
            </FormSection>
            <FormSection title="How it can be taken">
              <div className="grid gap-3 sm:grid-cols-3">
                <Toggle checked={!!r.allow_half_day} onChange={(v) => up("allow_half_day", v)} label="Half days" />
                <Toggle checked={!!r.allow_quarter_day} onChange={(v) => up("allow_quarter_day", v)} label="Quarter days" />
                <Toggle checked={!!r.allow_hourly} onChange={(v) => up("allow_hourly", v)} label="By the hour" />
              </div>
              <FormGrid columns={3}><Field label="Hours in a working day">{num("hours_per_day", r.hours_per_day, { min: 1, max: 24, step: 0.5, suffix: "h" })}</Field></FormGrid>
            </FormSection>
          </div>
        )}

        {step === 1 && (
          <FormSection title="Who gets this leave" description="People outside these groups don't see it and get no balance.">
            <ApplicabilityEditor value={r.applicability as Applicability} onChange={(v) => up("applicability", v)} />
          </FormSection>
        )}

        {step === 2 && (
          <div className="space-y-8">
            <FormSection title="How it is earned">
              <RadioCards value={e.mode} onChange={(v) => up("entitlement.mode", v)} columns={3} options={[
                { value: "fixed", label: "Fixed yearly", description: "The whole year's leave at the start of the year" },
                { value: "accrual", label: "Earned over the year", description: "A share every month, quarter or half year" },
                { value: "days_worked", label: "From days worked", description: "e.g. 1 day for every 20 days worked (OSH Code)" },
                { value: "grant", label: "Granted on request", description: "Maternity, marriage, bereavement" },
                { value: "none", label: "No balance", description: "Comp off, loss of pay" },
              ]} />
            </FormSection>
            {(e.mode === "fixed" || e.mode === "accrual") && (
              <FormSection title="Amount">
                <FormGrid columns={3}>
                  <Field label="Days a year">{num("entitlement.yearly_quota", e.yearly_quota, { max: 400, step: 0.5, suffix: "days" })}</Field>
                  {e.mode === "accrual" && <>
                    <Field label="Credited"><Select value={e.frequency} onChange={(v) => up("entitlement.frequency", v)}
                      options={[{ value: "monthly", label: "Every month" }, { value: "quarterly", label: "Every quarter" }, { value: "half_yearly", label: "Every half year" }, { value: "yearly", label: "Once a year" }]} /></Field>
                    <Field label="When"><Select value={e.credit_at} onChange={(v) => up("entitlement.credit_at", v)}
                      options={[{ value: "start", label: "At the start of each period" }, { value: "end", label: "At the end of each period" }]} /></Field>
                  </>}
                  <Field label="Most balance" hint="Credits stop at this balance">{num("entitlement.max_balance", e.max_balance, { suffix: "days" })}</Field>
                </FormGrid>
                <div>
                  <p className="mb-2 text-[13px] text-muted">More days with longer service</p>
                  <div className="space-y-2">
                    {(e.experience_levels ?? []).map((lv: { after_years: number; yearly_quota: number }, i: number) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-[13px] text-muted">After</span>
                        <div className="w-28"><NumberInput value={lv.after_years} onChange={(n) => up("entitlement.experience_levels", e.experience_levels.map((x: Rules, j: number) => j === i ? { ...x, after_years: n ?? 0 } : x))} suffix="years" /></div>
                        <span className="text-[13px] text-muted">years:</span>
                        <div className="w-28"><NumberInput value={lv.yearly_quota} onChange={(n) => up("entitlement.experience_levels", e.experience_levels.map((x: Rules, j: number) => j === i ? { ...x, yearly_quota: n ?? 0 } : x))} suffix="days" /></div>
                        <IconButton icon={Trash2} label="Remove" onClick={() => up("entitlement.experience_levels", e.experience_levels.filter((_: unknown, j: number) => j !== i))} />
                      </div>
                    ))}
                    <Button variant="ghost" size="sm" icon={Plus} onClick={() => up("entitlement.experience_levels", [...(e.experience_levels ?? []), { after_years: 5, yearly_quota: (e.yearly_quota ?? 12) + 3 }])}>Add a level</Button>
                  </div>
                </div>
              </FormSection>
            )}
            {e.mode === "days_worked" && (
              <FormSection title="Days worked" description="Under the OSH Code, annual leave is at least 1 day for every 20 days worked, after 180 days of work in the year.">
                <FormGrid columns={3}>
                  <Field label="Leave earned">{num("entitlement.days_worked.credit", e.days_worked?.credit, { min: 0.25, max: 30, step: 0.25, suffix: "days" })}</Field>
                  <Field label="For every">{num("entitlement.days_worked.per_days", e.days_worked?.per_days, { min: 1, max: 365, suffix: "days worked" })}</Field>
                  <Field label="Starts after">{num("entitlement.days_worked.min_days_in_year", e.days_worked?.min_days_in_year, { max: 366, suffix: "days of work" })}</Field>
                </FormGrid>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Toggle checked={!!e.days_worked?.count_paid_leave} onChange={(v) => up("entitlement.days_worked.count_paid_leave", v)} label="Paid leave counts as worked" />
                  <Toggle checked={!!e.days_worked?.count_holidays} onChange={(v) => up("entitlement.days_worked.count_holidays", v)} label="Holidays count as worked" />
                </div>
              </FormSection>
            )}
            {(e.mode === "fixed" || e.mode === "accrual") && (
              <>
                <FormSection title="Joiners and leavers" description="How much someone gets in the year they join or leave.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Toggle checked={!!e.proration?.on_joining} onChange={(v) => up("entitlement.proration.on_joining", v)} label="Reduce in the joining year" />
                    <Toggle checked={!!e.proration?.on_exit} onChange={(v) => up("entitlement.proration.on_exit", v)} label="Reduce in the leaving year" />
                  </div>
                  <FormGrid columns={3}>
                    <Field label="Worked out by"><Select value={e.proration?.basis} onChange={(v) => up("entitlement.proration.basis", v)} options={[{ value: "months", label: "Months" }, { value: "days", label: "Days" }]} /></Field>
                    <Field label="Joining month counts if joined by" hint="0 = share of the month">{num("entitlement.proration.joining_cutoff_day", e.proration?.joining_cutoff_day, { max: 31, suffix: "th" })}</Field>
                    <Field label="Round to"><Select value={`${e.proration?.rounding}:${e.proration?.round_mode}`} onChange={(v) => { const [a, b] = (v ?? "half:nearest").split(":"); up("entitlement.proration", { ...e.proration, rounding: a, round_mode: b }); }}
                      options={[{ value: "half:nearest", label: "Nearest half day" }, { value: "half:down", label: "Half day, down" }, { value: "half:up", label: "Half day, up" },
                        { value: "quarter:nearest", label: "Nearest quarter day" }, { value: "whole:nearest", label: "Nearest whole day" }, { value: "whole:down", label: "Whole day, down" }, { value: "none:nearest", label: "Don't round" }]} /></Field>
                  </FormGrid>
                </FormSection>
                <FormSection title="Probation">
                  <FormGrid columns={3}>
                    <Field label="During probation"><Select value={e.probation?.credit} onChange={(v) => up("entitlement.probation.credit", v)}
                      options={[{ value: "full", label: "Full credit" }, { value: "reduced", label: "Reduced credit" }, { value: "none", label: "No credit" }]} /></Field>
                    {e.probation?.credit === "reduced" && <Field label="Days a year on probation">{num("entitlement.probation.reduced_quota", e.probation?.reduced_quota, { suffix: "days" })}</Field>}
                    <Field label="Waiting period" hint="No credit for this long after joining">{num("entitlement.probation.waiting_days", e.probation?.waiting_days, { max: 3650, suffix: "days" })}</Field>
                  </FormGrid>
                </FormSection>
              </>
            )}
            {e.mode === "grant" && (
              <FormSection title="What can be granted" description="Each kind has its own number of days. The employee picks one when applying.">
                <div className="space-y-2">
                  {(g.options ?? []).map((o: { key: string; label: string; days: number }, i: number) => (
                    <div key={i} className="grid grid-cols-[minmax(0,1fr)_140px_40px] items-center gap-3">
                      <TextInput value={o.label} onValueChange={(v) => up("grant.options", g.options.map((x: Rules, j: number) => j === i ? { ...x, label: v, key: x.key || v.toLowerCase().replace(/[^a-z0-9]+/g, "_") } : x))} placeholder="e.g. Birth (first two children)" />
                      <NumberInput value={o.days} onChange={(n) => up("grant.options", g.options.map((x: Rules, j: number) => j === i ? { ...x, days: n ?? 0 } : x))} suffix="days" />
                      <IconButton icon={Trash2} label="Remove" onClick={() => up("grant.options", g.options.filter((_: unknown, j: number) => j !== i))} />
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" icon={Plus} onClick={() => up("grant.options", [...(g.options ?? []), { key: "", label: "", days: 5 }])}>Add a kind</Button>
                </div>
                <FormGrid columns={3}>
                  <Field label="Most grants">{num("grant.max_requests", g.max_requests, { min: 1, max: 100, suffix: "times" })}</Field>
                  <Field label="Counted over"><Select value={g.period} onChange={(v) => up("grant.period", v)} options={[{ value: "tenure", label: "Whole service" }, { value: "year", label: "Each leave year" }]} /></Field>
                  <Field label="Gap between grants">{num("grant.min_gap_days", g.min_gap_days, { max: 3650, suffix: "days" })}</Field>
                </FormGrid>
              </FormSection>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-8">
            <FormSection title="Leave year">
              <FormGrid columns={3}>
                <Field label="Year starts in"><Select value={String(y.year_start_month ?? 1)} onChange={(v) => up("year_end.year_start_month", Number(v ?? 1))}
                  options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m, description: i === 0 ? "Calendar year" : i === 3 ? "Financial year" : undefined }))} /></Field>
              </FormGrid>
              <Toggle checked={y.reset !== false} onChange={(v) => up("year_end.reset", v)} label="Balance resets each year" description="Off for comp off: credits stay until they expire." />
            </FormSection>
            <FormSection title="Carry forward">
              <Toggle checked={!!y.carry_forward?.enabled} onChange={(v) => up("year_end.carry_forward.enabled", v)} label="Carry unused leave to the next year" />
              {y.carry_forward?.enabled && (
                <FormGrid columns={2}>
                  <Field label="Up to">{num("year_end.carry_forward.max_days", y.carry_forward.max_days, { suffix: "days" })}</Field>
                  <Field label="Share of unused">{num("year_end.carry_forward.percent", y.carry_forward.percent, { max: 100, suffix: "%" })}</Field>
                  <Field label="Expires after" hint="Empty = never">{num("year_end.carry_forward.expire_after_months", y.carry_forward.expire_after_months, { min: 1, max: 60, suffix: "months" })}</Field>
                  <Field label="Most carried in total">{num("year_end.carry_forward.max_accumulation", y.carry_forward.max_accumulation, { suffix: "days" })}</Field>
                </FormGrid>
              )}
            </FormSection>
            <FormSection title="Encashment" description="Encashed days are paid through payroll.">
              <Toggle checked={!!y.encashment?.enabled} onChange={(v) => up("year_end.encashment.enabled", v)} label="Encash unused leave at year end" />
              {y.encashment?.enabled && (
                <FormGrid columns={3}>
                  <Field label="Up to">{num("year_end.encashment.max_days", y.encashment.max_days, { suffix: "days" })}</Field>
                  <Field label="Share of what is left">{num("year_end.encashment.percent", y.encashment.percent, { max: 100, suffix: "%" })}</Field>
                  <Field label="Keep at least">{num("year_end.encashment.min_balance_after", y.encashment.min_balance_after, { suffix: "days" })}</Field>
                </FormGrid>
              )}
              <Toggle checked={!!y.encashment?.on_exit} onChange={(v) => up("year_end.encashment.on_exit", v)} label="Encash the balance when someone leaves" />
              <p className="text-[12.5px] text-faint">Anything not carried forward or encashed lapses.</p>
            </FormSection>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-8">
            <FormSection title="Size of a request">
              <FormGrid columns={3}>
                <Field label="Least days">{num("restrictions.min_days", s.min_days, { step: 0.5, suffix: "days" })}</Field>
                <Field label="Most days">{num("restrictions.max_days", s.max_days, { step: 0.5, suffix: "days" })}</Field>
                <Field label="Most days in a row" hint="Calendar days">{num("restrictions.max_consecutive", s.max_consecutive, { suffix: "days" })}</Field>
              </FormGrid>
            </FormSection>
            <FormSection title="When it can be applied">
              <FormGrid columns={2}>
                <Field label="Notice">{num("restrictions.notice_days", s.notice_days, { max: 3650, suffix: "days" })}</Field>
                <Field label="Notice when longer than">{num("restrictions.notice_above_days", s.notice_above_days, { max: 3650, suffix: "days" })}</Field>
                <Field label="Past dates up to" hint="Empty = any">{num("restrictions.backdated_days", s.backdated_days, { max: 3650, suffix: "days" })}</Field>
                <Field label="Future dates up to">{num("restrictions.future_days", s.future_days, { max: 3650, suffix: "days" })}</Field>
              </FormGrid>
              <FormGrid columns={3}>
                <Field label="Most requests">{num("restrictions.max_requests.count", s.max_requests?.count, { min: 1, max: 1000 })}</Field>
                <Field label="Per"><Select value={s.max_requests?.period} onChange={(v) => up("restrictions.max_requests.period", v)}
                  options={[{ value: "month", label: "Month" }, { value: "quarter", label: "Quarter" }, { value: "year", label: "Leave year" }, { value: "tenure", label: "Whole service" }]} /></Field>
                <Field label="Gap between requests">{num("restrictions.min_gap_days", s.min_gap_days, { max: 3650, suffix: "days" })}</Field>
              </FormGrid>
            </FormSection>
            <FormSection title="Weekends and holidays">
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle checked={!!s.count_weekends} onChange={(v) => up("restrictions.count_weekends", v)} label="Count weekly offs" description="Calendar days, e.g. maternity leave" />
                <Toggle checked={!!s.count_holidays} onChange={(v) => up("restrictions.count_holidays", v)} label="Count holidays" />
                <Toggle checked={!!s.sandwich?.weekends} onChange={(v) => up("restrictions.sandwich.weekends", v)} label="Sandwich: weekly offs between leave days count" />
                <Toggle checked={!!s.sandwich?.holidays} onChange={(v) => up("restrictions.sandwich.holidays", v)} label="Sandwich: holidays between leave days count" />
                <Toggle checked={!!s.sandwich?.adjacent} onChange={(v) => up("restrictions.sandwich.adjacent", v)} label="Also weekly offs and holidays next to other leave" />
              </div>
              {(s.sandwich?.weekends || s.sandwich?.holidays) && (
                <FormGrid columns={3}><Field label="Sandwich applies from">{num("restrictions.sandwich.min_days", s.sandwich?.min_days, { max: 365, suffix: "leave days" })}</Field></FormGrid>
              )}
            </FormSection>
            <FormSection title="Balance">
              <FormGrid columns={3}>
                <Field label="When the balance runs out"><Select value={s.negative?.mode} onChange={(v) => up("restrictions.negative.mode", v)} options={[
                  { value: "none", label: "Don't allow" }, { value: "limit", label: "Allow a negative balance" },
                  { value: "year_end", label: "Allow up to what is still to be earned" }, { value: "lop", label: "Mark the extra as loss of pay" }]} /></Field>
                {s.negative?.mode === "limit" && <Field label="Down to minus">{num("restrictions.negative.limit", s.negative?.limit, { max: 365, step: 0.5, suffix: "days" })}</Field>}
              </FormGrid>
            </FormSection>
            <FormSection title="Other rules">
              <FormGrid columns={2}>
                <Field label="Document needed when longer than" hint="Empty = never; 0 = always">{num("restrictions.document_after_days", s.document_after_days, { suffix: "days" })}</Field>
                <Field label="Can't be taken next to"><MultiSelect value={s.clubbing_blocked ?? []} onChange={(v) => up("restrictions.clubbing_blocked", v)} options={otherCodes} placeholder="No limits" /></Field>
              </FormGrid>
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle checked={!!s.only_optional_holidays} onChange={(v) => up("restrictions.only_optional_holidays", v)} label="Only on optional holidays" />
                <Toggle checked={!!s.hidden_from_employee} onChange={(v) => up("restrictions.hidden_from_employee", v)} label="Only HR can record it" />
              </div>
            </FormSection>
          </div>
        )}

        {step === 5 && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              {existing && rulesChanged ? (
                <FormSection title="When do the new rules start?" description="Leave before this date keeps using the current rules (version history keeps both).">
                  <FormGrid>
                    <Field label="New rules from" required><DateInput value={effective} onChange={setEffective} min={existing.effective_from ?? undefined} /></Field>
                    <Field label="What changed"><TextInput value={note} onValueChange={setNote} maxLength={300} placeholder="e.g. Casual leave raised to 12 days" /></Field>
                  </FormGrid>
                </FormSection>
              ) : existing ? (
                <p className="rounded-xl border border-line px-4 py-3 text-[13.5px] text-muted">The rules have not changed; only the name, look or description will be saved.</p>
              ) : null}
              <FormSection title="Summary">
                <ul className="space-y-2 text-[14px] text-ink">
                  <li>{MODE_LABEL[e.mode]}{r.paid !== "paid" ? " · unpaid" : ""}{r.statutory ? " · statutory" : ""}</li>
                  <li className="text-muted">Who: {applicabilityText(r.applicability)}</li>
                  {e.mode === "fixed" || e.mode === "accrual" ? <li className="text-muted">{fmtDays(e.yearly_quota)} a year</li> : null}
                  {e.mode === "days_worked" ? <li className="text-muted">{e.days_worked?.credit} day for every {e.days_worked?.per_days} days worked, after {e.days_worked?.min_days_in_year} days</li> : null}
                  {y.carry_forward?.enabled ? <li className="text-muted">Carry forward up to {fmtDays(y.carry_forward.max_days)}</li> : null}
                  {y.encashment?.enabled ? <li className="text-muted">Encash up to {fmtDays(y.encashment.max_days)}</li> : null}
                  {s.negative?.mode !== "none" ? <li className="text-muted">When the balance runs out: {s.negative?.mode === "lop" ? "loss of pay" : "negative balance allowed"}</li> : null}
                </ul>
              </FormSection>
            </div>
            <div className="rounded-2xl border border-line p-5">
              <div className="flex items-center gap-3"><LeaveIcon name={icon} color={color} /><div><p className="text-ink">{name || "New leave"}</p><p className="text-[12px] text-faint">{code}</p></div></div>
              {description && <p className="mt-3 text-[13px] text-muted">{description}</p>}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ── Version history ──────────────────────────────────────────────── */

function VersionHistory({ type, onClose }: { type: LeaveType | null; onClose: () => void }) {
  return (
    <Modal open={!!type} onClose={onClose} size="lg" title={type ? `${type.name}: versions` : ""} description="Each version applies from its start date until the next one starts."
      footer={<ModalCancel>Close</ModalCancel>}>
      {type && (
        <Timeline items={type.versions.map((v, i) => ({
          id: v.uuid, tone: i === 0 ? "accent" : "neutral", icon: History,
          title: <span>Version {v.version} · {v.effective_from > "2001" ? `from ${formatDate(v.effective_from)}` : "from the start"}{v.effective_to ? ` to ${formatDate(v.effective_to)}` : ""}{i === 0 ? " (current)" : ""}</span>,
          description: <span className="block space-y-1">{v.change_note && <span className="block text-ink/80">{v.change_note}</span>}
            {v.summary.slice(0, 4).map((x) => <span key={x} className="block">{x}</span>)}</span>,
          time: `${v.created_by_name ?? ""} · ${formatDateTime(v.created_at)}`,
        }))} />
      )}
    </Modal>
  );
}

/* ── Company leave settings ───────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Settings = Record<string, any>;

/** Whole numbers typed as "30, 7"; the text is kept while typing. */
function NumberList({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  return <TextInput value={text} onValueChange={(t) => { setText(t); onChange(t.split(",").map((x) => parseInt(x.trim(), 10)).filter((x) => x > 0)); }} />;
}

function LeaveSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [codes, setCodes] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => { if (open) { setDirty(false); api.get<Settings>("/leave/settings").then(setS).catch(() => {}); } }, [open]);
  useEffect(() => {
    if (open) api.get<{ code: string; name: string }[]>("/leave/types").then((r) => setCodes(r.map((t) => ({ value: t.code, label: t.name })))).catch(() => {});
  }, [open]);
  const up = (path: string, v: unknown) => { setS((x) => x && setPath(x, path, v)); setDirty(true); };
  async function save() {
    setSaving(true);
    try { await api.put("/leave/settings", s); toast.success("Leave settings saved"); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" busy={saving} dirty={dirty} title="Leave settings" description="Company-wide choices that apply to every leave type."
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={save}>Save</Button></>}>
      {!s ? <div className="h-40 animate-pulse rounded-xl bg-sunken" /> : (
        <div className="space-y-8">
          <FormSection title="Leave calendar">
            <Field label="Employees can see leave of">
              <RadioCards value={s.calendar_visibility} onChange={(v) => up("calendar_visibility", v)} columns={3} options={[
                { value: "team", label: "Their team", description: "Same manager" }, { value: "department", label: "Their department" }, { value: "all", label: "Everyone" }]} />
            </Field>
            <Toggle checked={!!s.show_type_on_calendar} onChange={(v) => up("show_type_on_calendar", v)} label="Show the leave type" description="Off: colleagues only see that someone is on leave." />
          </FormSection>
          <FormSection title="Cancelling and changing">
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle checked={!!s.cancellation.allow_employee} onChange={(v) => up("cancellation.allow_employee", v)} label="Employees can cancel approved leave" />
              <Toggle checked={!!s.cancellation.needs_approval} onChange={(v) => up("cancellation.needs_approval", v)} label="Cancelling approved leave needs approval" />
              <Toggle checked={!!s.cancellation.partial} onChange={(v) => up("cancellation.partial", v)} label="Some days can be cancelled" />
              <Toggle checked={!!s.cancellation.reason_required} onChange={(v) => up("cancellation.reason_required", v)} label="A reason is needed to cancel" />
              <Toggle checked={!!s.modify_pending} onChange={(v) => up("modify_pending", v)} label="Pending requests can be changed" />
              <Toggle checked={!!s.extension.enabled} onChange={(v) => up("extension.enabled", v)} label="Leave can be extended" />
            </div>
            <FormGrid>
              <Field label="Past leave can be cancelled"><Select value={s.cancellation.window} onChange={(v) => up("cancellation.window", v)} options={[
                { value: "upcoming", label: "Not at all (only upcoming)" }, { value: "current_month", label: "Within the current month" },
                { value: "current_year", label: "Within the current year" }, { value: "any", label: "Any time" }]} /></Field>
            </FormGrid>
          </FormSection>
          <FormSection title="Compensatory off">
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle checked={!!s.comp_off.enabled} onChange={(v) => up("comp_off.enabled", v)} label="Comp off is on" />
              <Toggle checked={!!s.comp_off.on_weekly_off} onChange={(v) => up("comp_off.on_weekly_off", v)} label="For work on weekly offs" />
              <Toggle checked={!!s.comp_off.on_holiday} onChange={(v) => up("comp_off.on_holiday", v)} label="For work on holidays" />
              <Toggle checked={!!s.comp_off.half_day} onChange={(v) => up("comp_off.half_day", v)} label="Half days allowed" />
              <Toggle checked={!!s.comp_off.reason_required} onChange={(v) => up("comp_off.reason_required", v)} label="Reason needed" />
            </div>
            <FormGrid>
              <Field label="Expires after" hint="Empty = at the end of the year"><NumberInput value={s.comp_off.expiry_days} onChange={(n) => up("comp_off.expiry_days", n)} min={1} max={730} suffix="days" /></Field>
              <Field label="Ask within"><NumberInput value={s.comp_off.backdated_days} onChange={(n) => up("comp_off.backdated_days", n)} min={0} max={365} suffix="days of working" /></Field>
            </FormGrid>
          </FormSection>
          {s.bradford && <FormSection title="Bradford score" description="Score = spells × spells × days of unplanned absence. Many short absences score higher than one long one.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle checked={!!s.bradford.enabled} onChange={(v) => up("bradford.enabled", v)} label="Work out Bradford scores" />
              <Toggle checked={!!s.bradford.include_absent} onChange={(v) => up("bradford.include_absent", v)} label="Count absent days from attendance" />
              <Toggle checked={!!s.bradford.alert} onChange={(v) => up("bradford.alert", v)} label="Alert HR when someone reaches a level" />
              <Toggle checked={!!s.bradford.alert_manager} onChange={(v) => up("bradford.alert_manager", v)} label="Alert their manager too" />
            </div>
            <FormGrid>
              <Field label="Look back over"><NumberInput value={s.bradford.window_weeks} onChange={(n) => up("bradford.window_weeks", n)} min={4} max={156} suffix="weeks" /></Field>
              <Field label="Leave types counted"><MultiSelect<string> value={s.bradford.type_codes ?? []} onChange={(v) => up("bradford.type_codes", v)} options={codes} /></Field>
            </FormGrid>
            <div className="space-y-2">
              <p className="text-[13px] text-muted">Levels</p>
              {(s.bradford.levels ?? []).map((lv: { score: number; label: string }, i: number) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-36"><NumberInput value={lv.score} min={1} suffix="+" onChange={(n) => up("bradford.levels", s.bradford.levels.map((x: object, j: number) => (j === i ? { ...x, score: n ?? 0 } : x)))} /></div>
                  <TextInput className="flex-1" value={lv.label} onValueChange={(t) => up("bradford.levels", s.bradford.levels.map((x: object, j: number) => (j === i ? { ...x, label: t } : x)))} aria-label="Level name" />
                  <IconButton icon={Trash2} label="Remove level" onClick={() => up("bradford.levels", s.bradford.levels.filter((_: unknown, j: number) => j !== i))} />
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => up("bradford.levels", [...(s.bradford.levels ?? []), { score: 100, label: "New level" }])}>Add level</Button>
            </div>
          </FormSection>}
          {s.expiry_reminders && <FormSection title="Reminders before leave lapses" description="Emails people before comp off or carried leave expires.">
            <Toggle checked={!!s.expiry_reminders.enabled} onChange={(v) => up("expiry_reminders.enabled", v)} label="Send reminders" />
            <FormGrid>
              <Field label="Days before" hint="Separate with commas, e.g. 30, 7">
                <NumberList value={s.expiry_reminders.days_before ?? []} onChange={(v) => up("expiry_reminders.days_before", v)} />
              </Field>
            </FormGrid>
          </FormSection>}
          {s.substitute_holiday && <FormSection title="Substitute day off" description="When a holiday falls on someone's weekly off, they get another day off instead.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Toggle checked={!!s.substitute_holiday.enabled} onChange={(v) => up("substitute_holiday.enabled", v)} label="Give a substitute day off" />
              <Toggle checked={!!s.substitute_holiday.national_only} onChange={(v) => up("substitute_holiday.national_only", v)} label="Only for national holidays" />
            </div>
            <Field label="The day off is">
              <RadioCards value={s.substitute_holiday.when} onChange={(v) => up("substitute_holiday.when", v)} columns={2} options={[
                { value: "next_working_day", label: "The next working day" }, { value: "previous_working_day", label: "The working day before" }]} />
            </Field>
          </FormSection>}
          <p className="text-[12.5px] text-faint">Approval steps for leave, cancellations and comp off are set in Settings → Approval flows.</p>
        </div>
      )}
    </Modal>
  );
}


