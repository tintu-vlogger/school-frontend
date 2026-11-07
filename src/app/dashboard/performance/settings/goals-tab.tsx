"use client";

/*
 * Settings › Goals: the goal status list (3–10, with colour and the automatic threshold),
 * OKR year start month, grace days and automatic status; and the goal periods.
 */
import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, CalendarRange, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { Paper, PaperHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateInput, Field, FormGrid, IconButton, Modal, ModalCancel, NumberInput, Select, TextInput, Toggle, type Column,
} from "@/components/ui-kit";
import { forgetPerfSettings, useList } from "@/components/performance/shared";
import type { GoalStatus, Period, PerfSettings } from "@/components/performance/types";

export const COLORS = ["emerald", "amber", "rose", "indigo", "sky", "violet", "slate"];
export const SWATCH: Record<string, string> = {
  emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500", indigo: "bg-primary", sky: "bg-sky-500", violet: "bg-violet-500", slate: "bg-slate-400",
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1.5">
      {COLORS.map((c) => (
        <button key={c} type="button" aria-label={c} onClick={() => onChange(c)}
          className={`h-5 w-5 rounded-full ${SWATCH[c]} ring-offset-2 transition ${value === c ? "ring-2 ring-ink/40" : "opacity-60 hover:opacity-100"}`} />
      ))}
    </div>
  );
}

export function GoalsTab({ settings, onSaved }: { settings: PerfSettings; onSaved: (s: PerfSettings) => void }) {
  const toast = useToast();
  const [okr, setOkr] = useState(settings.okr);
  const [saving, setSaving] = useState(false);
  useEffect(() => setOkr(settings.okr), [settings]);
  const setStatus = (i: number, p: Partial<GoalStatus>) => setOkr((o) => ({ ...o, statuses: o.statuses.map((s, j) => (j === i ? { ...s, ...p } : s)) }));
  const move = (i: number, d: number) => setOkr((o) => {
    const s = [...o.statuses]; const j = i + d;
    if (j < 0 || j >= s.length) return o;
    [s[i], s[j]] = [s[j], s[i]];
    return { ...o, statuses: s };
  });

  async function save() {
    setSaving(true);
    try {
      const r = await api.put<PerfSettings>("/performance/settings", { okr });
      forgetPerfSettings();
      onSaved(r);
      toast.success("Goal settings saved");
    } catch (e) { toast.error("Couldn't save", { description: e instanceof Error ? e.message : undefined }); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6">
      <Paper>
        <PaperHeader title="How goals work" action={<Button variant="primary" size="sm" loading={saving} onClick={save}>Save</Button>} />
        <div className="space-y-6 p-5">
          <FormGrid columns={3}>
            <Field label="Goal year starts in" hint="April matches the Indian financial year">
              <Select value={okr.cycle_start_month} onChange={(v) => v && setOkr({ ...okr, cycle_start_month: v })} options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))} />
            </Field>
            <Field label="Grace days for check-ins" hint="A check-in this many days after the planned date is still on time">
              <NumberInput value={okr.grace_days} onChange={(v) => setOkr({ ...okr, grace_days: v ?? 0 })} min={0} max={14} suffix="days" />
            </Field>
            <Field label="Most objectives per person">
              <NumberInput value={okr.max_objectives_per_person} onChange={(v) => setOkr({ ...okr, max_objectives_per_person: v ?? 8 })} min={1} max={30} />
            </Field>
          </FormGrid>
          <Toggle checked={okr.auto_status} onChange={(v) => setOkr({ ...okr, auto_status: v })} label="Set statuses automatically"
            description="Compares progress with where it should be by today. Statuses set by hand are kept." />
          <div>
            <div className="mb-2 flex items-end justify-between">
              <div>
                <p className="text-[14px] text-ink">Statuses</p>
                <p className="text-[12.5px] text-muted">3 to 10. “From %” is progress as a share of where it should be by today; leave empty for statuses set only by hand.</p>
              </div>
              <Button size="sm" variant="secondary" icon={Plus} disabled={okr.statuses.length >= 10}
                onClick={() => setOkr({ ...okr, statuses: [...okr.statuses, { key: `status_${okr.statuses.length + 1}`, label: "New status", color: "sky", auto_min: null }] })}>Add status</Button>
            </div>
            <div className="divide-y divide-line rounded-xl border border-line">
              {okr.statuses.map((s, i) => (
                <div key={i} className="grid items-center gap-3 px-4 py-3 lg:grid-cols-[1.3fr_0.8fr_auto_180px_auto]">
                  <TextInput value={s.label} onValueChange={(v) => setStatus(i, { label: v })} aria-label="Status name" />
                  <TextInput value={s.key} onValueChange={(v) => setStatus(i, { key: v.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} aria-label="Short key" className="font-mono text-[12.5px]" />
                  <Swatches value={s.color} onChange={(c) => setStatus(i, { color: c })} />
                  <NumberInput value={s.auto_min} onChange={(v) => setStatus(i, { auto_min: v })} min={0} max={200} suffix="%" placeholder="By hand" />
                  <div className="flex gap-1">
                    <IconButton icon={ArrowUp} label="Move up" size="sm" onClick={() => move(i, -1)} />
                    <IconButton icon={ArrowDown} label="Move down" size="sm" onClick={() => move(i, 1)} />
                    <IconButton icon={Trash2} label="Remove" size="sm" disabled={okr.statuses.length <= 3}
                      onClick={() => setOkr({ ...okr, statuses: okr.statuses.filter((_, j) => j !== i) })} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Paper>
      <PeriodsCard />
    </div>
  );
}

function PeriodsCard() {
  const toast = useToast();
  const { rows, loading, refresh } = useList<Period>("/performance/periods", "Couldn't load periods");
  const [edit, setEdit] = useState<Period | "new" | null>(null);
  const [v, setV] = useState({ name: "", kind: "quarter", start_date: "", end_date: "", status: "open" });
  const [saving, setSaving] = useState(false);
  function open(p: Period | "new") {
    setEdit(p);
    setV(p === "new" ? { name: "", kind: "quarter", start_date: "", end_date: "", status: "open" } : { name: p.name, kind: p.kind, start_date: p.start_date, end_date: p.end_date, status: p.status });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (edit === "new") await api.post("/performance/periods", v);
      else if (edit) await api.put(`/performance/periods/${edit.uuid}`, v);
      toast.success("Period saved");
      setEdit(null);
      refresh();
    } catch (err) { toast.error("Couldn't save", { description: err instanceof Error ? err.message : undefined }); }
    finally { setSaving(false); }
  }
  const KIND: Record<string, string> = { quarter: "Quarter", half: "Half year", year: "Year", custom: "Custom" };
  const columns: Column<Period>[] = [
    { key: "name", header: "Period", cell: (p) => <span className="text-ink">{p.name}</span>, sortable: true, sortValue: (p) => p.start_date },
    { key: "kind", header: "Kind", cell: (p) => <span className="text-muted">{KIND[p.kind]}</span> },
    { key: "dates", header: "Dates", cell: (p) => <span className="tabular text-muted">{formatDate(p.start_date)} – {formatDate(p.end_date)}</span> },
    { key: "status", header: "Status", cell: (p) => p.current ? <Badge tone="accent" dot>Current</Badge> : <Badge tone={p.status === "open" ? "good" : "neutral"}>{p.status === "open" ? "Open" : "Closed"}</Badge> },
  ];
  return (
    <Paper>
      <PaperHeader title="Goal periods" action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => open("new")}>Add period</Button>} />
      <div className="p-3">
        <p className="mb-3 px-2 text-[12.5px] text-muted">Quarters, halves and the year are created automatically for this and next year. Close a period to stop new goals in it.</p>
        <DataTable rows={rows} rowKey={(p) => p.uuid} columns={columns} loading={loading} onRowClick={open} defaultSort={{ key: "name", dir: "asc" }}
          rowActions={(p) => [{ label: "Edit", icon: Pencil, onSelect: () => open(p) }]} emptyIcon={CalendarRange} emptyTitle="No periods yet" />
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} size="md" busy={saving} title={edit === "new" ? "Add period" : "Edit period"}
        footer={<><ModalCancel /><Button variant="primary" type="submit" form="period-form" loading={saving}>Save</Button></>}>
        <form id="period-form" onSubmit={save}>
          <FormGrid columns={2}>
            <Field label="Name" required className="sm:col-span-2"><TextInput value={v.name} onValueChange={(x) => setV({ ...v, name: x })} placeholder="e.g. Q3 FY26-27" /></Field>
            <Field label="Kind"><Select value={v.kind} onChange={(x) => x && setV({ ...v, kind: x })} options={Object.entries(KIND).map(([value, label]) => ({ value, label }))} /></Field>
            <Field label="Status"><Select value={v.status} onChange={(x) => x && setV({ ...v, status: x })} options={[{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }]} /></Field>
            <Field label="Starts" required><DateInput value={v.start_date} onChange={(x) => setV({ ...v, start_date: x })} /></Field>
            <Field label="Ends" required><DateInput value={v.end_date} onChange={(x) => setV({ ...v, end_date: x })} min={v.start_date} /></Field>
          </FormGrid>
        </form>
      </Modal>
    </Paper>
  );
}
