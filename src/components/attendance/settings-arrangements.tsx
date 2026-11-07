"use client";

/* Work arrangements: each person's usual week (working days, alternate Saturdays, default
 * shift) and whether they punch at all. Changes start from a date; history is kept. */
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, todayISO } from "@/lib/datetime";
import {
  Badge, Button, Checkbox, DataTable, DateInput, Field, FilterBar, FormGrid, Modal, ModalCancel, Select, TextInput, Toggle,
} from "@/components/ui-kit";
import { WEEKDAYS, errorText } from "./shared";

type Arrangement = {
  uuid: string; effective_from: string; shift_id: number | null; shift_name: string | null; working_days: number[];
  alternate_days: Record<string, number[]>; punch_required: boolean; auto_shift?: boolean; attendance_rule_id: number | null; note: string | null;
};
type Row = { employee_id: number; employee_uuid: string; name: string; employee_code: string | null; arrangement: Arrangement | null };
type ShiftOpt = { id: number; name: string; start_time: string; end_time: string; active: boolean };
type RuleOpt = { id: number; name: string };

function daysText(a: Arrangement | null): string {
  if (!a) return "Mon–Fri (company default)";
  const parts = a.working_days.map((d) => {
    const weeks = a.alternate_days?.[String(d)];
    return weeks?.length ? `${WEEKDAYS[d]} (wk ${weeks.join(", ")})` : WEEKDAYS[d];
  });
  return parts.join(", ") || "No working days";
}

export function ArrangementsTab() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [nonce, setNonce] = useState(0);
  const [shifts, setShifts] = useState<ShiftOpt[]>([]);
  const [rules, setRules] = useState<RuleOpt[]>([]);

  useEffect(() => {
    api.get<ShiftOpt[]>("/shifts/").then(setShifts).catch(() => {});
    api.get<RuleOpt[]>("/attendance/rules").then(setRules).catch(() => {});
  }, []);
  useEffect(() => {
    let live = true;
    api.get<Row[]>(`/shifts/arrangements${q ? `?q=${encodeURIComponent(q)}` : ""}`)
      .then((r) => { if (live) setRows(r); })
      .catch((e) => { if (live) { setRows([]); toast.error(errorText(e)); } });
    return () => { live = false; };
  }, [q, nonce, toast]);

  return (
    <>
      <p className="mb-4 max-w-2xl text-[13.5px] text-muted">
        Each person&apos;s usual week. The roster overrides it for single days. People who don&apos;t punch are
        marked present by default on their working days.
      </p>
      <FilterBar searchPlaceholder="Search by name or code" onSearchChange={setQ}
        actions={rows && <span className="tabular text-[13px] text-faint">{rows.length} people</span>} />
      <DataTable rows={rows ?? []} loading={rows === null} rowKey={(r) => r.employee_uuid} onRowClick={setEditing}
        columns={[
          { key: "name", header: "Employee", cell: (r) => <div><p className="text-ink">{r.name}</p><p className="text-[12.5px] text-faint">{r.employee_code ?? ""}</p></div> },
          { key: "shift", header: "Shift", cell: (r) => <span className="text-muted">{r.arrangement?.shift_name ?? "Default shift"}</span> },
          { key: "days", header: "Working days", hideBelow: "md", cell: (r) => <span className="text-muted">{daysText(r.arrangement)}</span> },
          { key: "punch", header: "Punching", cell: (r) => r.arrangement && !r.arrangement.punch_required
            ? <Badge tone="info">Present by default</Badge> : <Badge tone="neutral">Punches</Badge> },
          { key: "from", header: "Since", hideBelow: "lg", cell: (r) => <span className="tabular text-faint">{r.arrangement ? formatDate(r.arrangement.effective_from) : "—"}</span> },
        ]}
        rowActions={(r) => [{ label: "Change", icon: Pencil, onSelect: () => setEditing(r) }]}
        emptyIcon={CalendarClock} emptyTitle="Nobody found" />
      {editing && (
        <ArrangementModal row={editing} shifts={shifts} rules={rules} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setNonce((n) => n + 1); }} />
      )}
    </>
  );
}

function ArrangementModal({ row, shifts, rules, onClose, onSaved }: {
  row: Row; shifts: ShiftOpt[]; rules: RuleOpt[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const a = row.arrangement;
  const [from, setFrom] = useState(todayISO());
  const [shiftId, setShiftId] = useState<number | null>(a?.shift_id ?? null);
  const [days, setDays] = useState<number[]>(a?.working_days ?? [0, 1, 2, 3, 4]);
  const [alt, setAlt] = useState<Record<string, number[]>>(a?.alternate_days ?? {});
  const [punch, setPunch] = useState(a?.punch_required ?? true);
  const [autoShift, setAutoShift] = useState(a?.auto_shift ?? false);
  const [ruleId, setRuleId] = useState<number | null>(a?.attendance_rule_id ?? null);
  const [note, setNote] = useState(a?.note ?? "");
  const [history, setHistory] = useState<Arrangement[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ history: Arrangement[] }>(`/shifts/arrangements/${row.employee_uuid}`).then((r) => setHistory(r.history)).catch(() => {});
  }, [row.employee_uuid]);

  const shiftOptions = useMemo(() => shifts.filter((s) => s.active || s.id === shiftId)
    .map((s) => ({ value: s.id, label: s.name, description: `${s.start_time}–${s.end_time}` })), [shifts, shiftId]);
  const saturdayWorked = days.includes(5);
  const satWeeks = alt["5"] ?? [];

  async function save() {
    setSaving(true);
    try {
      await api.put(`/shifts/arrangements/${row.employee_uuid}`, {
        effective_from: from, shift_id: shiftId, working_days: days, punch_required: punch, auto_shift: autoShift,
        alternate_days: saturdayWorked && satWeeks.length ? { "5": satWeeks } : {},
        attendance_rule_id: ruleId, note: note || null,
      });
      toast.success("Saved", { description: `Applies from ${formatDate(from)}` });
      onSaved();
    } catch (e) {
      toast.error(errorText(e, "Couldn't save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="lg" busy={saving} title={`Work arrangement · ${row.name}`}
      description="Changes apply from the date you choose; earlier days keep the old arrangement."
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!from || !days.length} onClick={save}>Save</Button></>}>
      <div className="space-y-5">
        <FormGrid>
          <Field label="Applies from" required><DateInput value={from} onChange={setFrom} /></Field>
          <Field label="Default shift" hint="Empty uses the company's default shift">
            <Select value={shiftId} onChange={(v) => setShiftId(v)} options={shiftOptions} clearable placeholder="Default shift" />
          </Field>
        </FormGrid>
        <Field label="Working days">
          <div className="flex flex-wrap gap-4">
            {WEEKDAYS.map((d, i) => (
              <Checkbox key={d} label={d} checked={days.includes(i)}
                onChange={(c) => setDays((x) => (c ? [...x, i].sort() : x.filter((y) => y !== i)))} />
            ))}
          </div>
        </Field>
        {saturdayWorked && (
          <Field label="Saturdays worked" hint="Leave all unticked when every Saturday is worked">
            <div className="flex flex-wrap gap-4">
              {[1, 2, 3, 4, 5].map((w) => (
                <Checkbox key={w} label={`${["1st", "2nd", "3rd", "4th", "5th"][w - 1]}`} checked={satWeeks.includes(w)}
                  onChange={(c) => setAlt((x) => ({ ...x, "5": c ? [...satWeeks, w].sort() : satWeeks.filter((y) => y !== w) }))} />
              ))}
            </div>
          </Field>
        )}
        <Toggle checked={!punch} onChange={(v) => setPunch(!v)} label="Present by default"
          description="For people who don't punch (senior or field staff): working days are marked present automatically." />
        <Toggle checked={autoShift} onChange={setAutoShift} label="Pick shift from check-in time"
          description="Each day gets the shift that starts closest to their first punch (see Auto shift). A published roster still wins." />
        <FormGrid>
          <Field label="Attendance rule" hint="Empty picks the rule that applies to their group">
            <Select value={ruleId} onChange={(v) => setRuleId(v)} clearable placeholder="Automatic"
              options={rules.map((r) => ({ value: r.id, label: r.name }))} />
          </Field>
          <Field label="Note"><TextInput value={note} onValueChange={setNote} /></Field>
        </FormGrid>
        {history.length > 0 && (
          <div>
            <p className="mb-2 text-[12px] uppercase tracking-[0.08em] text-faint">History</p>
            <ul className="space-y-1.5 text-[13px] text-muted">
              {history.map((h) => (
                <li key={h.uuid} className="flex justify-between gap-3">
                  <span>From {formatDate(h.effective_from)}: {h.shift_name ?? "Default shift"}, {daysText(h)}</span>
                  {!h.punch_required && <Badge tone="info">Present by default</Badge>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
