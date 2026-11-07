"use client";

/*
 * Modals of the Shifts & roster page: assign shifts, apply a pattern, manage patterns,
 * women's night-shift consent, and the employee's own shift change / swap requests.
 */
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Ban, CheckCircle2, Plus, Send, ShieldCheck, Trash2, Wand2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, todayISO } from "@/lib/datetime";
import {
  Badge, Button, Checkbox, DataTable, DateInput, DateRangeInput, Field, FormGrid, Modal, ModalCancel, MultiSelect,
  RadioCards, Select, TextInput, Textarea, Toggle, useConfirm, type SelectOption,
} from "@/components/ui-kit";
import { WEEKDAYS, errorText, lookupEmployees, shiftColor } from "./shared";
import { mergeResults, type AssignResult, type Consent, type Pattern, type Problem, type Shift } from "./roster-types";

export function ShiftChip({ shift, off, small }: { shift?: Shift | null; off?: boolean; small?: boolean }) {
  if (off || !shift) {
    return <span className={`inline-flex items-center rounded-md border border-line bg-sunken px-1.5 ${small ? "text-[11px]" : "text-[12px]"} text-faint`}>Off</span>;
  }
  const c = shiftColor(shift.color);
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 ${small ? "text-[11px]" : "text-[12px]"} ${c.chip}`}>
      {shift.code || shift.name.slice(0, 2)}
    </span>
  );
}

export function ProblemList({ result }: { result: AssignResult | null }) {
  if (!result) return null;
  const { blocked, warnings } = result;
  if (!blocked.length && !warnings.length) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[13.5px] text-emerald-800">
        <CheckCircle2 size={16} strokeWidth={1.4} /> No rest or safety problems. {result.saved ? `${result.saved} day(s) saved.` : ""}
      </div>
    );
  }
  const row = (p: Problem, i: number) => (
    <li key={i} className="flex gap-2 text-[13px]">
      <span className="shrink-0 text-muted">{p.employee_name}</span>
      <span className="text-ink/80">{p.message}</span>
    </li>
  );
  return (
    <div className="space-y-2">
      {blocked.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2">
          <p className="mb-1 flex items-center gap-2 text-[13.5px] text-rose-800"><Ban size={15} strokeWidth={1.4} /> Not allowed ({blocked.length}): these days are skipped</p>
          <ul className="space-y-1">{blocked.slice(0, 12).map(row)}</ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2">
          <p className="mb-1 flex items-center gap-2 text-[13.5px] text-amber-800"><AlertTriangle size={15} strokeWidth={1.4} /> Warnings ({warnings.length})</p>
          <ul className="space-y-1">{warnings.slice(0, 12).map(row)}</ul>
        </div>
      )}
    </div>
  );
}

type Target = { employeeIds: number[]; names: Record<number, string>; dates: string[] } | null;

/** Assign a shift or a weekly off. With `target` (selected cells) it uses those people and
 *  days; otherwise the person picks people, teams or departments and a date range. */
export function AssignModal({
  open, onClose, onSaved, shifts, teams, departments, target, cells,
}: {
  open: boolean; onClose: () => void; onSaved: (r: AssignResult) => void; shifts: Shift[];
  teams: SelectOption<number>[]; departments: SelectOption<number>[]; target: Target;
  /** Selected cells grouped by employee (for non-rectangular selections). */
  cells?: Record<number, string[]>;
}) {
  const toast = useToast();
  const [what, setWhat] = useState<string | null>(null);
  const [emps, setEmps] = useState<number[]>([]);
  const [empOpts, setEmpOpts] = useState<SelectOption<number>[]>([]);
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const [deptIds, setDeptIds] = useState<number[]>([]);
  const [range, setRange] = useState({ from: todayISO(), to: todayISO() });
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [mode, setMode] = useState<"replace" | "skip">("replace");
  const [publish, setPublish] = useState(false);
  const [note, setNote] = useState("");
  const [check, setCheck] = useState<AssignResult | null>(null);
  const [busy, setBusy] = useState(false);

  const options: SelectOption[] = useMemo(() => [
    ...shifts.filter((s) => s.active).map((s) => ({ value: String(s.id), label: s.name, description: `${s.start_time} to ${s.end_time}${s.crosses_midnight ? " (next day)" : ""}` })),
    { value: "off", label: "Weekly off" },
  ], [shifts]);

  function bodies(): Record<string, unknown>[] {
    const base = {
      ...(what === "off" ? { status: "off" } : { status: "working", shift_id: Number(what) }),
      mode, note: note || null, publish,
    };
    if (target && cells) {
      // one request per person with that person's selected days
      return Object.entries(cells).map(([eid, dates]) => ({ ...base, employee_ids: [Number(eid)], dates }));
    }
    return [{
      ...base, employee_ids: emps, team_ids: teamIds, department_ids: deptIds, start_date: range.from,
      end_date: range.to || range.from, weekdays: weekdays.length === 7 ? null : weekdays,
    }];
  }

  const ready = !!what && (target ? true : (emps.length + teamIds.length + deptIds.length > 0 && !!range.from));

  async function run(path: "/roster/check" | "/roster/assign") {
    setBusy(true);
    try {
      const results: AssignResult[] = [];
      for (const b of bodies()) results.push(await api.post<AssignResult>(path, b));
      const r = mergeResults(results);
      setCheck(r);
      if (path === "/roster/assign") {
        if (r.blocked.length) toast.error(`${r.saved} day(s) saved, ${r.blocked.length} not allowed`, { description: r.blocked[0].message });
        else toast.success(`${r.saved} day(s) ${publish ? "published" : "saved as draft"}`, r.warnings.length ? { description: r.warnings[0].message } : undefined);
        onSaved(r);
      }
    } catch (e) {
      toast.error(errorText(e, "Couldn't save the roster"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" busy={busy} title="Assign shift"
      description={target ? `${target.employeeIds.length} ${target.employeeIds.length === 1 ? "person" : "people"}, ${target.dates.length} day(s)` : "Plan a shift for people, a team or a department."}
      footer={<>
        <ModalCancel />
        <Button variant="secondary" icon={ShieldCheck} disabled={!ready} loading={busy} onClick={() => run("/roster/check")}>Check rules</Button>
        <Button variant="primary" disabled={!ready} loading={busy} onClick={() => run("/roster/assign")}>{publish ? "Save and publish" : "Save as draft"}</Button>
      </>}>
      <div className="space-y-5">
        <Field label="Shift" required>
          <Select value={what} onChange={(v) => { setWhat(v); setCheck(null); }} options={options} placeholder="Choose a shift or weekly off" />
        </Field>
        {!target && (
          <>
            <FormGrid columns={1}>
              <Field label="People">
                <MultiSelect value={emps} onChange={(v, o) => { setEmps(v); setEmpOpts(o); setCheck(null); }} loadOptions={lookupEmployees} selectedOptions={empOpts} placeholder="Search employees" />
              </Field>
            </FormGrid>
            <FormGrid>
              <Field label="Teams"><MultiSelect value={teamIds} onChange={(v) => setTeamIds(v)} options={teams} placeholder="Any team" /></Field>
              <Field label="Departments"><MultiSelect value={deptIds} onChange={(v) => setDeptIds(v)} options={departments} placeholder="Any department" /></Field>
            </FormGrid>
            <Field label="Dates" required>
              <DateRangeInput value={range} onChange={(r) => { setRange(r); setCheck(null); }} />
            </Field>
            <Field label="On these weekdays">
              <div className="flex flex-wrap gap-3">
                {WEEKDAYS.map((d, i) => (
                  <Checkbox key={d} label={d} checked={weekdays.includes(i)}
                    onChange={(c) => setWeekdays((w) => (c ? [...w, i].sort() : w.filter((x) => x !== i)))} />
                ))}
              </div>
            </Field>
          </>
        )}
        <FormGrid>
          <Field label="Days already planned">
            <RadioCards value={mode} onChange={setMode} options={[
              { value: "replace", label: "Replace them" }, { value: "skip", label: "Keep them" },
            ]} />
          </Field>
          <Field label="Note"><TextInput value={note} onValueChange={setNote} placeholder="Optional" /></Field>
        </FormGrid>
        <Toggle checked={publish} onChange={setPublish} label="Publish now" description="Drafts are visible to employees and count for attendance only after publishing." />
        <ProblemList result={check} />
      </div>
    </Modal>
  );
}

export function ApplyPatternModal({
  open, onClose, onSaved, teams, departments, defaultRange,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; teams: SelectOption<number>[];
  departments: SelectOption<number>[]; defaultRange: { from: string; to: string };
}) {
  const toast = useToast();
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [uuid, setUuid] = useState<string | null>(null);
  const [emps, setEmps] = useState<number[]>([]);
  const [empOpts, setEmpOpts] = useState<SelectOption<number>[]>([]);
  const [teamIds, setTeamIds] = useState<number[]>([]);
  const [deptIds, setDeptIds] = useState<number[]>([]);
  const [range, setRange] = useState(defaultRange);
  const [preview, setPreview] = useState<AssignResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get<{ items: Pattern[] }>("/shifts/patterns").then((r) => setPatterns(r.items.filter((p) => p.active))).catch(() => {});
  }, [open]);

  const body = (dry: boolean) => ({ pattern_uuid: uuid, employee_ids: emps, team_ids: teamIds, department_ids: deptIds,
    start_date: range.from, end_date: range.to || range.from, mode: "replace", dry_run: dry });
  const ready = !!uuid && emps.length + teamIds.length + deptIds.length > 0 && !!range.from;

  async function go(dry: boolean) {
    setBusy(true);
    try {
      const r = await api.post<AssignResult>("/roster/apply-pattern", body(dry));
      setPreview(r);
      if (!dry) {
        toast.success(`${r.saved} day(s) planned as draft`, r.blocked.length ? { description: `${r.blocked.length} day(s) not allowed` } : undefined);
        onSaved();
      }
    } catch (e) {
      toast.error(errorText(e, "Couldn't apply the pattern"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" busy={busy} title="Apply a pattern"
      description="Fill a date range from a repeating pattern. Days are saved as a draft."
      footer={<>
        <ModalCancel />
        <Button variant="secondary" icon={ShieldCheck} disabled={!ready} loading={busy} onClick={() => go(true)}>Preview</Button>
        <Button variant="primary" icon={Wand2} disabled={!ready} loading={busy} onClick={() => go(false)}>Apply</Button>
      </>}>
      <div className="space-y-5">
        <Field label="Pattern" required>
          <Select value={uuid} onChange={(v) => { setUuid(v); setPreview(null); }}
            options={patterns.map((p) => ({ value: p.uuid, label: p.name, description: p.kind_label }))}
            placeholder={patterns.length ? "Choose a pattern" : "No patterns yet"} />
        </Field>
        <Field label="People">
          <MultiSelect value={emps} onChange={(v, o) => { setEmps(v); setEmpOpts(o); }} loadOptions={lookupEmployees} selectedOptions={empOpts} placeholder="Search employees" />
        </Field>
        <FormGrid>
          <Field label="Teams"><MultiSelect value={teamIds} onChange={(v) => setTeamIds(v)} options={teams} placeholder="Any team" /></Field>
          <Field label="Departments"><MultiSelect value={deptIds} onChange={(v) => setDeptIds(v)} options={departments} placeholder="Any department" /></Field>
        </FormGrid>
        <Field label="Dates" required hint="Custom cycles start on the first day."><DateRangeInput value={range} onChange={(r) => { setRange(r); setPreview(null); }} /></Field>
        {preview && (
          <div className="space-y-2">
            <p className="text-[13.5px] text-muted">{preview.saved ? `${preview.saved} day(s) planned.` : "Ready to plan."} {preview.skipped ? `${preview.skipped} skipped.` : ""}</p>
            <ProblemList result={preview} />
          </div>
        )}
      </div>
    </Modal>
  );
}

const KIND_OPTIONS = [
  { value: "weekly" as const, label: "Weekly", description: "A shift for each day of the week" },
  { value: "week_of_month" as const, label: "Week of the month", description: "Different weeks 1 to 5" },
  { value: "cycle" as const, label: "Custom cycle", description: "Repeats every N days" },
];

function SlotSelect({ value, onChange, shifts }: { value: number | null; onChange: (v: number | null) => void; shifts: Shift[] }) {
  return (
    <Select value={value === null ? "off" : String(value)} onChange={(v) => onChange(!v || v === "off" ? null : Number(v))}
      options={[{ value: "off", label: "Off" }, ...shifts.filter((s) => s.active).map((s) => ({ value: String(s.id), label: s.name }))]} />
  );
}

function PatternForm({ pattern, shifts, onSaved, onCancel }: { pattern: Pattern | null; shifts: Shift[]; onSaved: () => void; onCancel: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(pattern?.name ?? "");
  const [kind, setKind] = useState<Pattern["kind"]>(pattern?.kind ?? "weekly");
  const first = shifts.find((s) => s.is_default)?.id ?? shifts[0]?.id ?? null;
  const [weekly, setWeekly] = useState<Record<string, number | null>>(() =>
    pattern?.kind === "weekly" ? { ...(pattern.slots as Record<string, number | null>) } :
      Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((i) => [String(i), i < 5 ? first : null])));
  const [monthly, setMonthly] = useState<Record<string, Record<string, number | null>>>(() =>
    pattern?.kind === "week_of_month" ? JSON.parse(JSON.stringify(pattern.slots)) :
      Object.fromEntries([1, 2, 3, 4, 5].map((w) => [String(w), Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((i) => [String(i), i < 5 ? first : null]))])));
  const [cycle, setCycle] = useState<(number | null)[]>(() =>
    pattern?.kind === "cycle" ? [...(pattern.slots as (number | null)[])] : [first, first, null, null]);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const slots = kind === "weekly" ? weekly : kind === "week_of_month" ? monthly : cycle;
      const body = { name, kind, slots, active: true };
      if (pattern) await api.put(`/shifts/patterns/${pattern.uuid}`, body);
      else await api.post("/shifts/patterns", body);
      toast.success("Pattern saved");
      onSaved();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save the pattern"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <Field label="Name" required><TextInput value={name} onValueChange={setName} placeholder="e.g. Support desk week" /></Field>
      <Field label="Repeats"><RadioCards value={kind} onChange={setKind} options={KIND_OPTIONS} columns={3} /></Field>
      {kind === "weekly" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {WEEKDAYS.map((d, i) => (
            <Field key={d} label={d}><SlotSelect shifts={shifts} value={weekly[String(i)] ?? null} onChange={(v) => setWeekly((w) => ({ ...w, [String(i)]: v }))} /></Field>
          ))}
        </div>
      )}
      {kind === "week_of_month" && (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr><th className="p-1 text-left font-normal text-faint">Week</th>{WEEKDAYS.map((d) => <th key={d} className="p-1 text-left font-normal text-faint">{d}</th>)}</tr></thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((w) => (
                <tr key={w}>
                  <td className="p-1 text-muted">{w}</td>
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <td key={i} className="min-w-[110px] p-1">
                      <SlotSelect shifts={shifts} value={monthly[String(w)]?.[String(i)] ?? null}
                        onChange={(v) => setMonthly((m) => ({ ...m, [String(w)]: { ...m[String(w)], [String(i)]: v } }))} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {kind === "cycle" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cycle.map((v, i) => (
              <Field key={i} label={`Day ${i + 1}`}><SlotSelect shifts={shifts} value={v} onChange={(x) => setCycle((c) => c.map((y, j) => (j === i ? x : y)))} /></Field>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" icon={Plus} disabled={cycle.length >= 62} onClick={() => setCycle((c) => [...c, null])}>Add a day</Button>
            <Button size="sm" variant="ghost" icon={Trash2} disabled={cycle.length <= 2} onClick={() => setCycle((c) => c.slice(0, -1))}>Remove last day</Button>
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2 border-t border-line pt-4">
        <Button variant="ghost" onClick={onCancel}>Back</Button>
        <Button variant="primary" loading={saving} disabled={!name.trim()} onClick={save}>Save pattern</Button>
      </div>
    </div>
  );
}

export function PatternsModal({ open, onClose, shifts }: { open: boolean; onClose: () => void; shifts: Shift[] }) {
  const [rows, setRows] = useState<Pattern[] | null>(null);
  const [editing, setEditing] = useState<Pattern | "new" | null>(null);
  const names = useMemo(() => Object.fromEntries(shifts.map((s) => [s.id, s.name])), [shifts]);
  const load = () => api.get<{ items: Pattern[] }>("/shifts/patterns").then((r) => setRows(r.items)).catch(() => setRows([]));
  useEffect(() => { if (open) load(); }, [open]);

  function summary(p: Pattern): string {
    if (p.kind === "weekly") return WEEKDAYS.map((d, i) => `${d} ${names[(p.slots as Record<string, number | null>)[String(i)] ?? -1] ?? "off"}`).join(", ");
    if (p.kind === "cycle") return `${(p.slots as unknown[]).length}-day cycle: ` + (p.slots as (number | null)[]).map((x) => (x ? names[x] : "off")).join(", ");
    return "Different plan for weeks 1 to 5";
  }

  return (
    <Modal open={open} onClose={onClose} size="xl" title={editing ? (editing === "new" ? "New pattern" : `Edit ${editing.name}`) : "Shift patterns"}
      description={editing ? undefined : "Repeating schedules you can apply to people for a date range."}
      footer={editing ? undefined : <><ModalCancel>Close</ModalCancel><Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>New pattern</Button></>}>
      {editing ? (
        <PatternForm pattern={editing === "new" ? null : editing} shifts={shifts} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      ) : (
        <DataTable rows={rows ?? []} loading={rows === null} rowKey={(p) => p.uuid} onRowClick={(p) => setEditing(p)}
          columns={[
            { key: "name", header: "Name", cell: (p) => <span className="text-ink">{p.name}</span> },
            { key: "kind", header: "Repeats", cell: (p) => <span className="text-muted">{p.kind_label}</span> },
            { key: "plan", header: "Plan", hideBelow: "md", cell: (p) => <span className="line-clamp-2 text-[13px] text-muted">{summary(p)}</span> },
          ]}
          emptyTitle="No patterns yet" emptyHint="Make a weekly plan or a rotating cycle." />
      )}
    </Modal>
  );
}

export function ConsentModal({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Consent[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [emp, setEmp] = useState<number | null>(null);
  const [dates, setDates] = useState({ consent_date: todayISO(), valid_from: todayISO(), valid_to: "" });
  const [safety, setSafety] = useState("");
  const [saving, setSaving] = useState(false);
  const load = () => api.get<Consent[]>("/shifts/consents").then(setRows).catch(() => setRows([]));
  useEffect(() => { if (open) load(); }, [open]);

  async function save() {
    setSaving(true);
    try {
      await api.post("/shifts/consents", { employee_id: emp, ...dates, valid_to: dates.valid_to || null, safety_measures: safety || null });
      toast.success("Consent recorded");
      setAdding(false); setEmp(null); setSafety("");
      load(); onChanged();
    } catch (e) {
      toast.error(errorText(e, "Couldn't record the consent"));
    } finally {
      setSaving(false);
    }
  }

  async function withdraw(c: Consent) {
    if (!(await confirm({ title: `Withdraw ${c.employee_name}'s consent?`, message: "She can no longer be rostered on night shifts.", confirmLabel: "Withdraw", tone: "danger" }))) return;
    try {
      await api.post(`/shifts/consents/${c.uuid}/withdraw`);
      toast.success("Consent withdrawn");
      load(); onChanged();
    } catch (e) {
      toast.error(errorText(e));
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" busy={saving} title="Night-shift consent"
      description="The OSH Code lets women work between 7 pm and 6 am only with their written consent and safety arrangements. Without it, night shifts can't be rostered."
      footer={adding ? <><Button variant="ghost" onClick={() => setAdding(false)}>Back</Button><Button variant="primary" loading={saving} disabled={!emp} onClick={save}>Record consent</Button></>
        : <><ModalCancel>Close</ModalCancel><Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Record consent</Button></>}>
      {adding ? (
        <div className="space-y-5">
          <Field label="Employee" required><Select value={emp} onChange={(v) => setEmp(v)} loadOptions={lookupEmployees} placeholder="Search employees" /></Field>
          <FormGrid columns={3}>
            <Field label="Consent given on" required><DateInput value={dates.consent_date} onChange={(v) => setDates((d) => ({ ...d, consent_date: v }))} /></Field>
            <Field label="Valid from" required><DateInput value={dates.valid_from} onChange={(v) => setDates((d) => ({ ...d, valid_from: v }))} /></Field>
            <Field label="Valid until"><DateInput value={dates.valid_to} onChange={(v) => setDates((d) => ({ ...d, valid_to: v }))} clearable placeholder="No end date" /></Field>
          </FormGrid>
          <Field label="Safety arrangements" hint="Transport, escort, CCTV, help desk"><Textarea value={safety} onValueChange={setSafety} rows={3} autoGrow /></Field>
        </div>
      ) : (
        <DataTable rows={rows ?? []} loading={rows === null} rowKey={(c) => c.uuid}
          columns={[
            { key: "name", header: "Employee", cell: (c) => <span className="text-ink">{c.employee_name}</span> },
            { key: "valid", header: "Valid", cell: (c) => <span className="text-muted">{formatDate(c.valid_from)} to {c.valid_to ? formatDate(c.valid_to) : "no end"}</span> },
            { key: "safety", header: "Safety", hideBelow: "md", cell: (c) => <span className="line-clamp-1 text-[13px] text-muted">{c.safety_measures || "—"}</span> },
            { key: "status", header: "Status", cell: (c) => <Badge tone={c.withdrawn ? "neutral" : "good"} dot>{c.withdrawn ? "Withdrawn" : "Active"}</Badge> },
          ]}
          rowActions={(c) => (c.withdrawn ? [] : [{ label: "Withdraw", icon: Ban, danger: true, onSelect: () => withdraw(c) }])}
          emptyTitle="No consent recorded" emptyHint="Record consent before rostering a woman on a night shift." />
      )}
    </Modal>
  );
}

export function ShiftChangeModal({ open, onClose, shifts }: { open: boolean; onClose: () => void; shifts: Shift[] }) {
  const toast = useToast();
  const [range, setRange] = useState({ from: todayISO(), to: todayISO() });
  const [shift, setShift] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const r = await api.post<{ reference_no: string; status: string }>("/shifts/requests/change", {
        start_date: range.from, end_date: range.to || range.from, shift_id: shift, reason });
      toast.success(r.status === "approved" ? "Shift changed" : "Request sent for approval", { description: r.reference_no });
      onClose();
    } catch (e) {
      toast.error(errorText(e, "Couldn't send the request"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" busy={busy} title="Ask for a shift change" dirty={!!reason}
      footer={<><ModalCancel /><Button variant="primary" icon={Send} loading={busy} disabled={!shift || !reason.trim()} onClick={send}>Send request</Button></>}>
      <div className="space-y-5">
        <Field label="Dates" required><DateRangeInput value={range} onChange={setRange} min={todayISO()} /></Field>
        <Field label="Shift you want" required>
          <Select value={shift} onChange={(v) => setShift(v)} options={shifts.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name, description: `${s.start_time} to ${s.end_time}` }))} />
        </Field>
        <Field label="Reason" required><Textarea value={reason} onValueChange={setReason} rows={2} autoGrow /></Field>
      </div>
    </Modal>
  );
}

export function SwapModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [day, setDay] = useState(todayISO());
  const [info, setInfo] = useState<{ my_shift: string | null; options: SelectOption<number>[] } | null>(null);
  const [who, setWho] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !day) return;
    let live = true;
    setInfo(null); setWho(null);
    api.get<{ my_shift: string | null; options: { value: number; label: string; hint: string }[] }>(`/shifts/colleagues?on=${day}`)
      .then((r) => { if (live) setInfo({ my_shift: r.my_shift, options: r.options.map((o) => ({ value: o.value, label: o.label, description: o.hint })) }); })
      .catch((e) => { if (live) { setInfo({ my_shift: null, options: [] }); toast.error(errorText(e)); } });
    return () => { live = false; };
  }, [open, day, toast]);

  async function send() {
    setBusy(true);
    try {
      const r = await api.post<{ reference_no: string }>("/shifts/requests/swap", { date: day, counterpart_employee_id: who, reason: reason || null });
      toast.success("Swap request sent", { description: `${r.reference_no}. Your colleague accepts first, then your manager.` });
      onClose();
    } catch (e) {
      toast.error(errorText(e, "Couldn't send the request"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" busy={busy} title="Swap a shift"
      description="Your colleague accepts first, then your manager approves."
      footer={<><ModalCancel /><Button variant="primary" icon={Send} loading={busy} disabled={!who} onClick={send}>Send request</Button></>}>
      <div className="space-y-5">
        <Field label="Date" required><DateInput value={day} onChange={setDay} min={todayISO()} /></Field>
        <p className="text-[13.5px] text-muted">{info === null ? "Looking up shifts…" : info.my_shift ? `You are on ${info.my_shift} that day.` : "You have no shift that day."}</p>
        <Field label="Swap with" required hint="Colleagues on a different shift that day">
          <Select value={who} onChange={(v) => setWho(v)} options={info?.options ?? []} disabled={!info?.my_shift}
            emptyText="Nobody on another shift that day" />
        </Field>
        <Field label="Reason"><Textarea value={reason} onValueChange={setReason} rows={2} autoGrow /></Field>
      </div>
    </Modal>
  );
}
