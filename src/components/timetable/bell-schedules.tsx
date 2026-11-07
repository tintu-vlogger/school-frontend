"use client";

/*
 * Bell schedules: the periods and breaks of a day, for some weekdays and optionally only for
 * some programs. List + add/edit modal (manage only).
 *   <BellSchedules canManage={can("timetable.manage")} onChanged={reload} />
 */
import { useCallback, useEffect, useState } from "react";
import { BellRing, Pencil, Plus, Trash2, Ban } from "lucide-react";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { EmptyState, Paper } from "@/components/shell/page";
import {
  Badge, Button, Checkbox, Field, FormGrid, IconButton, Modal, ModalCancel, MultiSelect, Select, Skeleton, TextInput,
  TimeInput, Toggle, useConfirm,
} from "@/components/ui-kit";
import { WEEKDAY_NAMES, type TtPeriod } from "./week-grid";

export type Schedule = {
  uuid: string; id: number; name: string; weekdays: number[]; program_ids: number[]; programs: string[];
  is_default: boolean; active: boolean; periods: TtPeriod[]; teaching_periods: number; starts: string | null; ends: string | null;
};

type Row = { key: number; name: string; kind: string; start: string; end: string };

const KINDS = [{ value: "class", label: "Class" }, { value: "break", label: "Break" }, { value: "assembly", label: "Assembly" }];

export function BellSchedules({ canManage, onChanged }: { canManage: boolean; onChanged?: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Schedule[] | null>(null);
  const [editing, setEditing] = useState<Schedule | "new" | null>(null);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  const load = useCallback(() => {
    api.get<Schedule[]>("/timetable/bell-schedules").then(setRows).catch(() => { setRows([]); toast.error("Couldn't load bell schedules"); });
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const openForm = (s: Schedule | "new") => { setEditing(s); setKey((k) => k + 1); setOpen(true); };
  const switchOff = async (s: Schedule) => {
    if (!(await confirm({ title: `Switch off ${s.name}?`, message: "Timetable entries stay; days that used it fall back to the default schedule.", confirmLabel: "Switch off", tone: "danger" }))) return;
    try { await api.delete(`/timetable/bell-schedules/${s.uuid}`); toast.success("Switched off"); load(); onChanged?.(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-[13.5px] text-muted">The periods and breaks of the day. A schedule made for some classes wins over the general one on its days.</p>
        {canManage && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New bell schedule</Button>}
      </div>
      {!rows ? <Skeleton className="h-40 w-full" /> : rows.length === 0 ? (
        <Paper><EmptyState icon={BellRing} title="No bell schedules yet" hint="Add the periods of a normal day to start building timetables."
          action={canManage && <Button variant="primary" icon={Plus} onClick={() => openForm("new")}>New bell schedule</Button>} /></Paper>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((s) => (
            <Paper key={s.uuid} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] text-ink">{s.name}{s.is_default && <Badge tone="accent">Default</Badge>}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {s.weekdays.map((d) => WEEKDAY_NAMES[d].slice(0, 3)).join(", ")} · {s.teaching_periods} periods · {s.starts}–{s.ends}
                  </p>
                  {s.programs.length > 0 && <p className="mt-0.5 truncate text-[12.5px] text-faint">Only {s.programs.join(", ")}</p>}
                </div>
                {canManage && (
                  <div className="flex shrink-0 gap-1">
                    <IconButton icon={Pencil} label="Edit" size="sm" onClick={() => openForm(s)} />
                    <IconButton icon={Ban} label="Switch off" size="sm" onClick={() => switchOff(s)} />
                  </div>
                )}
              </div>
              <ol className="mt-4 space-y-1">
                {s.periods.map((p) => (
                  <li key={p.uuid} className={`flex items-center justify-between rounded-md px-2 py-1 text-[12.5px] ${p.kind === "class" ? "text-ink" : "bg-sunken/70 text-faint"}`}>
                    <span>{p.name}</span><span className="tabular text-muted">{p.start}–{p.end}</span>
                  </li>
                ))}
              </ol>
            </Paper>
          ))}
        </div>
      )}
      <ScheduleForm key={key} target={editing} open={open} onClose={() => setOpen(false)}
        onSaved={() => { setOpen(false); load(); onChanged?.(); }} />
    </div>
  );
}

function ScheduleForm({ target, open, onClose, onSaved }: { target: Schedule | "new" | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { term, profile } = useInstitution();
  const editing = target && target !== "new" ? target : null;
  const workDays = profile?.week_days ?? [1, 2, 3, 4, 5, 6];
  const [name, setName] = useState(editing?.name ?? "");
  const [weekdays, setWeekdays] = useState<number[]>(editing?.weekdays ?? workDays.filter((d) => d <= 5));
  const [programs, setPrograms] = useState<number[]>(editing?.program_ids ?? []);
  const [isDefault, setIsDefault] = useState(editing?.is_default ?? false);
  const [rows, setRows] = useState<Row[]>(() => (editing?.periods ?? [
    { name: "Period 1", kind: "class", start: "08:30", end: "09:15" }, { name: "Period 2", kind: "class", start: "09:15", end: "10:00" },
    { name: "Break", kind: "break", start: "10:00", end: "10:15" }, { name: "Period 3", kind: "class", start: "10:15", end: "11:00" },
  ] as TtPeriod[]).map((p, i) => ({ key: i, name: p.name, kind: p.kind, start: p.start, end: p.end })));
  const [programOpts, setProgramOpts] = useState<{ value: number; label: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!open) return;
    api.get<{ items: { id: number; name: string }[] }>("/academics/programs?all=true")
      .then((r) => setProgramOpts((r.items ?? []).map((p) => ({ value: p.id, label: p.name })))).catch(() => {});
  }, [open]);

  const set = (i: number, patch: Partial<Row>) => { setDirty(true); setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r))); };
  const addRow = () => {
    setDirty(true);
    setRows((rs) => {
      const last = rs[rs.length - 1];
      const start = last?.end ?? "08:30";
      const [h, m] = start.split(":").map(Number);
      const endMin = h * 60 + m + 40;
      const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
      const n = rs.filter((r) => r.kind === "class").length + 1;
      return [...rs, { key: Date.now(), name: `Period ${n}`, kind: "class", start, end }];
    });
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error("Give the bell schedule a name"); return; }
    setSaving(true);
    const body = { name: name.trim(), weekdays, program_ids: programs, is_default: isDefault,
      periods: rows.map((r) => ({ name: r.name, kind: r.kind, start: r.start, end: r.end })) };
    try {
      if (editing) await api.put(`/timetable/bell-schedules/${editing.uuid}`, body);
      else await api.post("/timetable/bell-schedules", body);
      toast.success("Bell schedule saved");
      onSaved();
    } catch (err) { toast.error("Couldn't save", { description: (err as Error).message }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" dirty={dirty} busy={saving} title={editing ? `Edit ${editing.name}` : "New bell schedule"}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="bell-form" loading={saving}>Save</Button></>}>
      <form id="bell-form" onSubmit={save} className="space-y-5">
        <FormGrid columns={2}>
          <Field label="Name" required><TextInput value={name} onValueChange={(v) => { setName(v); setDirty(true); }} placeholder="Regular day" data-autofocus /></Field>
          <Field label={`Only for these ${term("programs").toLowerCase()}`} hint="Leave empty for everyone">
            <MultiSelect value={programs} onChange={(v) => { setPrograms(v); setDirty(true); }} options={programOpts} placeholder="Everyone" />
          </Field>
        </FormGrid>
        <Field label="Days">
          <div className="flex flex-wrap gap-3">
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <Checkbox key={d} label={WEEKDAY_NAMES[d].slice(0, 3)} checked={weekdays.includes(d)}
                onChange={(on) => { setDirty(true); setWeekdays((w) => (on ? [...w, d].sort() : w.filter((x) => x !== d))); }} />
            ))}
          </div>
        </Field>
        <Toggle checked={isDefault} onChange={(v) => { setIsDefault(v); setDirty(true); }} label="Default schedule" description="Used on its days when no other schedule matches." />
        <div>
          <p className="mb-2 text-[13px] text-muted">Periods and breaks</p>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-line p-2 sm:grid-cols-[1.4fr_1fr_110px_110px_auto] sm:items-center sm:border-0 sm:p-0">
                <TextInput aria-label="Name" value={r.name} onValueChange={(v) => set(i, { name: v })} className="col-span-2 sm:col-span-1" />
                <Select aria-label="Kind" value={r.kind} onChange={(v) => v && set(i, { kind: v })} options={KINDS} />
                <TimeInput aria-label="Starts" value={r.start} onChange={(v) => set(i, { start: v })} />
                <TimeInput aria-label="Ends" value={r.end} onChange={(v) => set(i, { end: v })} />
                <IconButton icon={Trash2} label="Remove row" size="sm" onClick={() => { setDirty(true); setRows((rs) => rs.filter((_, j) => j !== i)); }} />
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" icon={Plus} className="mt-2" onClick={addRow}>Add a row</Button>
        </div>
      </form>
    </Modal>
  );
}
