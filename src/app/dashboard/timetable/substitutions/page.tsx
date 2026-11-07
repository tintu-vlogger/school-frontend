"use client";

/*
 * Substitutions: pick a date and an absent teacher (staff on approved leave are listed),
 * see their periods with suggested free teachers, assign with one click or cancel the
 * class. Below: the substitution register and how many each teacher has taken.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarX2, Replace, Trash2, UserCheck, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate, formatLongDate, todayISO } from "@/lib/datetime";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, DateInput, DateRangeInput, Field, FilterBar, Select, Skeleton, useConfirm,
  type Column, type DateRange, type SelectOption,
} from "@/components/ui-kit";

type Absent = { employee_id: number; name: string; reason: string | null; periods: number; covered: number };
type Suggestion = { employee_id: number; name: string; classes_today: number; at_limit: boolean; reasons: string[] };
type PeriodRow = {
  uuid: string; section_label: string; period_no: number; subject_name: string | null; room_name: string | null;
  start: string | null; end: string | null;
  substitution: { uuid: string; kind: string; teacher_id: number | null; teacher_name: string | null; note: string | null } | null;
  suggestions: Suggestion[];
};
type Sub = {
  uuid: string; date: string; period_no: number; kind: string; section_label: string; subject_name: string | null;
  absent_teacher_name: string | null; substitute_teacher_name: string | null; note: string | null; created_by: string | null;
};
type Page<T> = { items: T[]; total: number; page: number; size: number };

function shift(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function SubstitutionsPage() {
  const { term } = useInstitution();
  const toast = useToast();
  const [day, setDay] = useState(todayISO());
  const [absent, setAbsent] = useState<Absent[] | null>(null);
  const [teacherId, setTeacherId] = useState<number | null>(null);
  const [teachers, setTeachers] = useState<SelectOption<number>[]>([]);
  const [periods, setPeriods] = useState<PeriodRow[] | null>(null);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    api.get<{ id: number; name: string }[]>("/timetable/teachers").then((r) => setTeachers(r.map((t) => ({ value: t.id, label: t.name })))).catch(() => {});
  }, []);
  useEffect(() => {
    if (!day) return;
    let live = true;
    setAbsent(null);
    api.get<Absent[]>(`/timetable/substitutions/absent?on=${day}`).then((r) => {
      if (!live) return;
      setAbsent(r);
      setTeacherId((cur) => cur ?? r.find((a) => a.covered < a.periods)?.employee_id ?? r[0]?.employee_id ?? null);
    }).catch(() => live && setAbsent([]));
    return () => { live = false; };
  }, [day, tick]);
  useEffect(() => {
    if (!teacherId || !day) { setPeriods(null); return; }
    let live = true;
    setPeriods(null);
    api.get<PeriodRow[]>(`/timetable/substitutions/periods?on=${day}&teacher_id=${teacherId}`)
      .then((r) => live && setPeriods(r)).catch((e) => { if (live) { setPeriods([]); toast.error((e as Error).message); } });
    return () => { live = false; };
  }, [teacherId, day, tick, toast]);

  const teacherName = teachers.find((t) => t.value === teacherId)?.label ?? absent?.find((a) => a.employee_id === teacherId)?.name;

  return (
    <div>
      <PageHeader eyebrow="Academics" title="Substitutions"
        description={`Cover the classes of absent ${term("teachers").toLowerCase()} and keep a register of who took what.`} />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="space-y-4">
          <Paper className="space-y-4 p-5">
            <Field label="Date"><DateInput value={day} onChange={(v) => { if (v) { setDay(v); setTeacherId(null); } }} /></Field>
            <Field label={`${term("teacher")} away`}>
              <Select value={teacherId} onChange={setTeacherId} options={teachers} placeholder={`Any ${term("teacher").toLowerCase()}`} />
            </Field>
          </Paper>
          <Paper>
            <PaperHeader title="On leave that day" />
            {!absent ? <Skeleton className="m-5 h-24" /> : absent.length === 0 ? (
              <p className="px-5 py-5 text-[13px] text-muted">Nobody with classes is on approved leave. Pick a {term("teacher").toLowerCase()} above to cover someone anyway.</p>
            ) : (
              <ul className="divide-y divide-line">
                {absent.map((a) => (
                  <li key={a.employee_id}>
                    <button type="button" onClick={() => setTeacherId(a.employee_id)}
                      className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors hover:bg-sunken ${teacherId === a.employee_id ? "bg-primary/[0.05]" : ""}`}>
                      <Avatar name={a.name} size={30} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] text-ink">{a.name}</span>
                        <span className="block truncate text-[12px] text-muted">{a.reason ?? "Leave"}</span>
                      </span>
                      <Badge tone={a.covered >= a.periods ? "good" : "warn"}>{a.covered}/{a.periods}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Paper>
        </div>
        <Paper className="min-w-0">
          <PaperHeader title={teacherName ? `${teacherName} · ${formatLongDate(day)}` : formatLongDate(day)} />
          {!teacherId ? (
            <EmptyState icon={Replace} title={`Pick the ${term("teacher").toLowerCase()} who is away`} hint="Their classes for the day appear here with free colleagues to cover them." />
          ) : !periods ? <Skeleton className="m-5 h-40" /> : periods.length === 0 ? (
            <EmptyState icon={CalendarX2} title="No classes that day" hint="Nothing to cover." />
          ) : (
            <ul className="divide-y divide-line">
              {periods.map((p) => <PeriodItem key={p.uuid} p={p} day={day} onChanged={refresh} />)}
            </ul>
          )}
        </Paper>
      </div>
      <Register tick={tick} onChanged={refresh} />
    </div>
  );
}

function PeriodItem({ p, day, onChanged }: { p: PeriodRow; day: string; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { term } = useInstitution();
  const [pick, setPick] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const opts = p.suggestions.map((s) => ({ value: s.employee_id, label: s.name,
    description: [s.reasons.join(", "), `${s.classes_today} classes today`, s.at_limit ? "at the daily limit" : ""].filter(Boolean).join(" · ") }));
  async function assign(kind: "substitute" | "cancelled", who: number | null) {
    if (kind === "cancelled" && !(await confirm({ title: "Cancel this class?", message: `${p.section_label} will have no class in period ${p.period_no}.`, confirmLabel: "Cancel class", tone: "danger" }))) return;
    setBusy(true);
    try {
      await api.post("/timetable/substitutions", { entry_uuid: p.uuid, date: day, kind, substitute_teacher_id: who });
      toast.success(kind === "cancelled" ? "Class cancelled" : "Substitute assigned");
      onChanged();
    } catch (e) { toast.error("Couldn't save", { description: (e as Error).message }); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!p.substitution) return;
    try { await api.delete(`/timetable/substitutions/${p.substitution.uuid}`); toast.success("Removed"); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  }
  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[14px] text-ink">Period {p.period_no} · {p.subject_name ?? "Free period"}</p>
          <p className="text-[12.5px] text-muted">{p.section_label}{p.room_name ? ` · ${p.room_name}` : ""}{p.start ? ` · ${p.start}–${p.end}` : ""}</p>
        </div>
        {p.substitution && (
          <div className="flex items-center gap-2">
            {p.substitution.kind === "cancelled" ? <Badge tone="neutral">Class cancelled</Badge>
              : <Badge tone="good" dot>{p.substitution.teacher_name}</Badge>}
            <Button variant="ghost" size="sm" icon={Trash2} onClick={remove}>Undo</Button>
          </div>
        )}
      </div>
      {!p.substitution && (
        <div className="mt-3 space-y-2">
          {p.suggestions.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {p.suggestions.slice(0, 3).map((s) => (
                <Button key={s.employee_id} variant="secondary" size="sm" icon={UserCheck} disabled={busy} onClick={() => assign("substitute", s.employee_id)}>
                  {s.name}<span className="text-faint">· {s.classes_today}</span>
                </Button>
              ))}
            </div>
          ) : <p className="text-[12.5px] text-muted">No {term("teacher").toLowerCase()} is free in this period.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full sm:w-64">
              <Select value={pick} onChange={setPick} options={opts} placeholder="Someone else free" />
            </div>
            <Button variant="primary" size="sm" disabled={!pick || busy} onClick={() => assign("substitute", pick)}>Assign</Button>
            <Button variant="ghost" size="sm" icon={XCircle} disabled={busy} onClick={() => assign("cancelled", null)}>Cancel class</Button>
          </div>
        </div>
      )}
    </li>
  );
}

function Register({ tick, onChanged }: { tick: number; onChanged: () => void }) {
  const { term } = useInstitution();
  const toast = useToast();
  const today = todayISO();
  const [range, setRange] = useState<DateRange>({ from: shift(today, -30), to: shift(today, 7) });
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [data, setData] = useState<Page<Sub> | null>(null);
  const [counts, setCounts] = useState<{ employee_id: number; name: string; count: number }[]>([]);
  const load = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page), size: String(size) });
    if (range.from) qs.set("date_from", range.from);
    if (range.to) qs.set("date_to", range.to);
    if (q) qs.set("q", q);
    api.get<Page<Sub>>(`/timetable/substitutions?${qs}`).then(setData).catch(() => setData({ items: [], total: 0, page: 1, size }));
    if (range.from && range.to) api.get<typeof counts>(`/timetable/substitutions/counts?date_from=${range.from}&date_to=${range.to}`).then(setCounts).catch(() => {});
  }, [page, size, range, q]);
  useEffect(() => { load(); }, [load, tick]);
  const columns: Column<Sub>[] = useMemo(() => [
    { key: "date", header: "Date", cell: (r) => <span className="tabular">{formatDate(r.date)}</span> },
    { key: "period", header: "Period", align: "right", cell: (r) => <span className="tabular">{r.period_no}</span> },
    { key: "class", header: term("section"), cell: (r) => <span className="text-ink">{r.section_label}<span className="block text-[12px] text-muted">{r.subject_name}</span></span> },
    { key: "absent", header: "Away", hideBelow: "md", cell: (r) => r.absent_teacher_name ?? "—" },
    { key: "sub", header: "Covered by", cell: (r) => r.kind === "cancelled" ? <Badge>Cancelled</Badge> : <span className="text-ink">{r.substitute_teacher_name}</span> },
    { key: "by", header: "Assigned by", hideBelow: "lg", cell: (r) => <span className="text-muted">{r.created_by ?? "—"}</span> },
  ], [term]);
  async function remove(r: Sub) {
    try { await api.delete(`/timetable/substitutions/${r.uuid}`); toast.success("Removed"); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  }
  return (
    <div className="mt-8 grid gap-4 xl:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        <h2 className="mb-3 text-[17px] font-light text-ink">Substitution register</h2>
        <FilterBar searchPlaceholder={`Search by ${term("teacher").toLowerCase()}`} onSearchChange={(v) => { setQ(v); setPage(1); }}
          actions={<div className="w-64"><DateRangeInput value={range} onChange={(v) => { setRange(v); setPage(1); }} /></div>} />
        <DataTable rows={data?.items ?? []} rowKey={(r) => r.uuid} columns={columns} loading={!data}
          rowActions={(r) => [{ label: "Remove", icon: Trash2, danger: true, onSelect: () => remove(r) }]}
          pagination={{ page, size, total: data?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
          emptyIcon={Replace} emptyTitle="No substitutions in these dates" emptyHint="Assign one above when a teacher is away." />
      </div>
      <Paper className="h-fit">
        <PaperHeader title="Who covered most" />
        {counts.length === 0 ? <p className="px-5 py-5 text-[13px] text-muted">Nobody yet in these dates.</p> : (
          <ul className="divide-y divide-line">
            {counts.slice(0, 12).map((c) => (
              <li key={c.employee_id} className="flex items-center justify-between px-5 py-2.5 text-[13px]">
                <span className="truncate text-ink">{c.name}</span><span className="tabular text-muted">{c.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Paper>
    </div>
  );
}
