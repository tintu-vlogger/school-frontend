"use client";

/*
 * Settings → Work week: which weekdays are working days, half days or weekly offs (with
 * "2nd and 4th Saturday off" style rules), and who each pattern applies to. Leave, attendance
 * and payroll all count working days from these.
 */
import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import { Badge, Button, Checkbox, Field, FormGrid, Modal, ModalCancel, Select, Skeleton, TextInput, Textarea, Toggle } from "@/components/ui-kit";
import { ApplicabilityEditor, applicabilityText } from "@/components/leave/applicability";
import type { Applicability, WorkWeek, WorkWeekDay } from "@/components/leave/types";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type Preset = { key: string; name: string; days: WorkWeekDay[] };

export default function WorkWeekPage() {
  const toast = useToast();
  const [rows, setRows] = useState<WorkWeek[] | null>(null);
  const [editing, setEditing] = useState<WorkWeek | "new" | null>(null);
  const load = useCallback(() => { api.get<WorkWeek[]>("/leave/work-weeks").then(setRows).catch(() => { setRows([]); toast.error("Couldn't load"); }); }, [toast]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <PageHeader eyebrow="Settings" title="Work week" description="Working days and weekly offs. Leave, attendance and payroll count working days from these."
        actions={<Button variant="primary" icon={Plus} onClick={() => setEditing("new")}>New work week</Button>} />
      {!rows ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-48 rounded-2xl" /><Skeleton className="h-48 rounded-2xl" /></div> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((w) => (
            <button key={w.uuid} type="button" onClick={() => setEditing(w)} className="group rounded-2xl border border-line bg-surface p-5 text-left transition-colors hover:border-line-strong">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] text-ink">{w.name}</p>
                  <p className="mt-0.5 text-[12.5px] text-faint">{w.is_default ? "Default · everyone else" : applicabilityText(w.applicability)}</p>
                </div>
                <span className="flex items-center gap-2">{w.is_default && <Badge tone="accent">Default</Badge>}{!w.active && <Badge>Off</Badge>}
                  <Pencil size={15} strokeWidth={1.4} className="text-faint opacity-0 transition-opacity group-hover:opacity-100" /></span>
              </div>
              <WeekStrip days={w.days} />
              <p className="mt-3 text-[12.5px] text-muted">About {w.working_days_per_week} working days a week</p>
            </button>
          ))}
        </div>
      )}
      <PatternModal week={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
    </div>
  );
}

function WeekStrip({ days }: { days: WorkWeekDay[] }) {
  return (
    <div className="mt-4 grid grid-cols-7 gap-1.5">
      {days.map((d, i) => {
        const partial = d.mode === "working" && (d.off_weeks?.length ?? 0) > 0;
        const tone = d.mode === "off" ? "bg-sunken text-faint" : d.mode === "half" ? "bg-amber-50 text-amber-700 border-amber-200" : partial ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-primary-soft/60 text-primary border-primary/20";
        return (
          <span key={i} title={d.mode === "off" ? "Weekly off" : d.mode === "half" ? "Half day" : partial ? `Off on week ${d.off_weeks!.join(", ")}` : "Working"}
            className={`flex flex-col items-center rounded-lg border border-transparent py-2 text-[11px] ${tone}`}>
            {DAYS[i].slice(0, 2)}
            <span className="mt-0.5 text-[10px] opacity-75">{d.mode === "off" ? "off" : d.mode === "half" ? "½" : partial ? d.off_weeks!.map((n) => `${n}`).join("") + " off" : "work"}</span>
          </span>
        );
      })}
    </div>
  );
}

function PatternModal({ week, onClose, onSaved }: { week: WorkWeek | "new" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const isNew = week === "new";
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [days, setDays] = useState<WorkWeekDay[]>([]);
  const [app, setApp] = useState<Applicability>({ mode: "pickers" });
  const [isDefault, setIsDefault] = useState(false);
  const [active, setActive] = useState(true);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!week) return;
    api.get<{ presets: Preset[] }>("/leave/options").then((r) => setPresets(r.presets)).catch(() => {});
    setDirty(false);
    if (week === "new") { setName(""); setDesc(""); setDays(DAYS.map((_, i): WorkWeekDay => ({ mode: i < 5 ? "working" : "off", off_weeks: [] }))); setApp({ mode: "pickers" }); setIsDefault(false); setActive(true); }
    else { setName(week.name); setDesc(week.description ?? ""); setDays(week.days); setApp(week.applicability ?? { mode: "pickers" }); setIsDefault(week.is_default); setActive(week.active); }
  }, [week]);
  const setDay = (i: number, patch: Partial<WorkWeekDay>) => { setDays((d) => d.map((x, j) => j === i ? { ...x, ...patch } : x)); setDirty(true); };
  async function save() {
    setSaving(true);
    try {
      const body = { name, description: desc, days, applicability: app, is_default: isDefault || undefined, active };
      if (isNew) await api.post("/leave/work-weeks", body); else await api.put(`/leave/work-weeks/${(week as WorkWeek).uuid}`, body);
      toast.success("Work week saved");
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!week} onClose={onClose} size="xl" busy={saving} dirty={dirty} title={isNew ? "New work week" : "Edit work week"}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!name.trim()} onClick={save}>Save</Button></>}>
      <div className="space-y-6">
        <FormGrid>
          <Field label="Name" required><TextInput value={name} onValueChange={(v) => { setName(v); setDirty(true); }} placeholder="e.g. Factory: Monday to Saturday" /></Field>
          <Field label="Start from"><Select value={null} onChange={(k) => { const p = presets.find((x) => x.key === k); if (p) { setDays(p.days.map((d) => ({ ...d, off_weeks: d.off_weeks ?? [] }))); if (!name) setName(p.name); setDirty(true); } }}
            options={presets.map((p) => ({ value: p.key, label: p.name }))} placeholder="A common pattern" /></Field>
        </FormGrid>
        <div className="overflow-hidden rounded-xl border border-line">
          {days.map((d, i) => (
            <div key={i} className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-4 border-b border-line px-4 py-3 last:border-b-0 sm:grid-cols-[110px_260px_minmax(0,1fr)]">
              <span className="text-[14px] text-ink">{DAYS[i]}</span>
              <div className="inline-flex gap-0.5 rounded-lg border border-line bg-sunken p-0.5">
                {(["working", "half", "off"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setDay(i, { mode: m, off_weeks: m === "off" ? [] : d.off_weeks })}
                    className={`flex-1 rounded-md px-3 py-1.5 text-[12.5px] transition-colors ${d.mode === m ? "bg-surface text-ink shadow-[0_0_0_1px_var(--color-line)]" : "text-muted hover:text-ink"}`}>
                    {m === "working" ? "Working" : m === "half" ? "Half day" : "Off"}
                  </button>
                ))}
              </div>
              {d.mode !== "off" && (
                <div className="col-span-2 flex flex-wrap items-center gap-3 sm:col-span-1">
                  <span className="text-[12.5px] text-faint">Off in week</span>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Checkbox key={n} checked={(d.off_weeks ?? []).includes(n)} label={`${n}${["st", "nd", "rd", "th", "th"][n - 1]}`}
                      onChange={(c) => setDay(i, { off_weeks: c ? [...(d.off_weeks ?? []), n].sort() : (d.off_weeks ?? []).filter((x) => x !== n) })} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <Field label="Description"><Textarea value={desc} onValueChange={(v) => { setDesc(v); setDirty(true); }} rows={2} autoGrow /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle checked={isDefault} onChange={(v) => { setIsDefault(v); setDirty(true); }} label="Default work week" description="For everyone not covered by another one" disabled={!isNew && (week as WorkWeek)?.is_default} />
          <Toggle checked={active} onChange={(v) => { setActive(v); setDirty(true); }} label="In use" />
        </div>
        {!isDefault && (
          <div>
            <p className="mb-1 text-[14px] text-ink">Who works this week</p>
            <p className="mb-3 text-[12.5px] text-muted">For example the factory location, or a department that works Saturdays.</p>
            <ApplicabilityEditor value={app} onChange={(v) => { setApp(v); setDirty(true); }} compact />
          </div>
        )}
      </div>
    </Modal>
  );
}


