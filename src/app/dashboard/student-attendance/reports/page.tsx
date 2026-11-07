"use client";

/*
 * Attendance reports: daily summary per section, the monthly register (learner x day, print
 * and CSV), percentages per learner for a term or the session, subject-wise percentages
 * (period mode), defaulters below the threshold (with an alert to guardians) and the log of
 * corrections to locked registers.
 */
import { useEffect, useMemo, useState } from "react";
import { BellRing, Download, Printer, TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate, formatDateTime, formatLongDate, formatMonth, todayISO } from "@/lib/datetime";
import { useUrlTab } from "@/lib/use-url-tab";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateInput, DateRangeInput, Field, NumberInput, Select, Skeleton, Tabs, paginate, type Column,
} from "@/components/ui-kit";
import { CodeChip, PctBar, downloadFile, pctText, pctTone, query, type AttStatus, type Pct } from "@/components/student_attendance/lib";

type Tab = "daily" | "monthly" | "percent" | "subjects" | "defaulters" | "corrections";
const TABS: Tab[] = ["daily", "monthly", "percent", "subjects", "defaulters", "corrections"];
type SectionOpt = { id: number; label: string };
type Range = { key: string; from?: string; to?: string; term_id?: number };

function useSections() {
  const [rows, setRows] = useState<SectionOpt[]>([]);
  useEffect(() => { api.get<SectionOpt[]>("/student-attendance/sections").then(setRows).catch(() => {}); }, []);
  return rows;
}

function rangeQs(r: Range): string {
  if (r.term_id) return `term_id=${r.term_id}`;
  if (r.from && r.to) return `date_from=${r.from}&date_to=${r.to}`;
  return "";
}

function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const { profile, term } = useInstitution();
  const [terms, setTerms] = useState<{ id: number; name: string; session_id: number }[]>([]);
  useEffect(() => { api.get<{ items: { id: number; name: string; session_id: number }[] }>("/academics/terms?all=true").then((r) => setTerms(r.items)).catch(() => {}); }, []);
  const today = todayISO();
  const monthStart = `${today.slice(0, 8)}01`;
  const opts = [
    { value: "session", label: `This ${term("session").toLowerCase()}` },
    { value: "month", label: "This month" },
    ...terms.filter((t) => !profile?.current_session || t.session_id === profile.current_session.id).map((t) => ({ value: `term:${t.id}`, label: t.name })),
    { value: "custom", label: "Pick dates" },
  ];
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-48"><Field label="Period"><Select value={value.key} options={opts} onChange={(v) => {
        const k = String(v ?? "session");
        if (k === "month") onChange({ key: k, from: monthStart, to: today });
        else if (k.startsWith("term:")) onChange({ key: k, term_id: Number(k.slice(5)) });
        else if (k === "custom") onChange({ key: k, from: monthStart, to: today });
        else onChange({ key: "session" });
      }} /></Field></div>
      {value.key === "custom" && <div className="w-64"><Field label="Dates"><DateRangeInput value={{ from: value.from ?? "", to: value.to ?? "" }} onChange={(r) => onChange({ key: "custom", from: r.from, to: r.to })} max={today} /></Field></div>}
    </div>
  );
}

export default function ReportsPage() {
  const { term, profile } = useInstitution();
  const { can } = useAccess();
  const [tab, setTab] = useState<Tab>("daily");
  useUrlTab(TABS, setTab);
  const sections = useSections();
  const period = profile?.attendance_mode === "period";
  const items = [
    { value: "daily" as Tab, label: "Daily summary" }, { value: "monthly" as Tab, label: "Monthly register" },
    { value: "percent" as Tab, label: "Percentages" }, ...(period ? [{ value: "subjects" as Tab, label: `By ${term("subject").toLowerCase()}` }] : []),
    { value: "defaulters" as Tab, label: "Below threshold" }, ...(can("attendance.view") ? [{ value: "corrections" as Tab, label: "Corrections" }] : []),
  ];
  return (
    <div>
      <div className="print:hidden">
        <PageHeader eyebrow="Student attendance" title="Attendance reports" description={`Registers, percentages and ${term("students").toLowerCase()} who need attention.`} />
        <div className="mb-5 overflow-x-auto"><Tabs value={tab} onChange={setTab} items={items} /></div>
      </div>
      {tab === "daily" && <Daily />}
      {tab === "monthly" && <Monthly sections={sections} />}
      {tab === "percent" && <Percentages sections={sections} />}
      {tab === "subjects" && <Subjects sections={sections} />}
      {tab === "defaulters" && <Defaulters sections={sections} />}
      {tab === "corrections" && <Corrections />}
    </div>
  );
}

function SectionPick({ sections, value, onChange }: { sections: SectionOpt[]; value: number | null; onChange: (v: number) => void }) {
  const { term } = useInstitution();
  useEffect(() => { if (!value && sections.length) onChange(Number(query().get("section")) || sections[0].id); }, [sections, value, onChange]);
  return <div className="w-60"><Field label={term("section")}><Select value={value} onChange={(v) => v && onChange(v as number)} options={sections.map((s) => ({ value: s.id, label: s.label }))} /></Field></div>;
}

/* ── Daily ── */
type DayRow = { section_id: number; label: string; class_teacher: string | null; strength: number; working: boolean; reason: string | null; expected: number; marked: number; complete: boolean; present_pct: number | null; absent: number; late: number; leave: number; absentees: string[] };
function Daily() {
  const { term } = useInstitution();
  const [day, setDay] = useState(todayISO());
  const [rows, setRows] = useState<DayRow[] | null>(null);
  const [totals, setTotals] = useState<{ present_pct: number | null; absent: number; leave: number; late: number; marked: number; sections: number } | null>(null);
  useEffect(() => {
    setRows(null);
    api.get<{ sections: DayRow[]; totals: typeof totals }>(`/student-attendance/overview?on=${day}`).then((r) => { setRows(r.sections); setTotals(r.totals); }).catch(() => setRows([]));
  }, [day]);
  const cols: Column<DayRow>[] = [
    { key: "l", header: term("section"), sortable: true, sortValue: (r) => r.label, cell: (r) => <span className="text-ink">{r.label}</span> },
    { key: "s", header: "On roll", align: "right", cell: (r) => <span className="tabular text-muted">{r.strength}</span> },
    { key: "m", header: "Register", cell: (r) => !r.working ? <Badge>{r.reason || "Holiday"}</Badge> : r.complete ? <Badge tone="good" dot>Marked</Badge> : r.marked ? <Badge tone="warn" dot>{r.marked}/{r.expected}</Badge> : <Badge tone="bad" dot>Not marked</Badge> },
    { key: "p", header: "Present", width: "170px", sortable: true, sortValue: (r) => r.present_pct ?? -1, cell: (r) => <PctBar value={r.present_pct} /> },
    { key: "a", header: "Absent", align: "right", sortable: true, sortValue: (r) => r.absent, cell: (r) => <span className="tabular">{r.absent}</span> },
    { key: "lt", header: "Late", align: "right", hideBelow: "sm", cell: (r) => <span className="tabular text-muted">{r.late}</span> },
    { key: "lv", header: "Leave", align: "right", hideBelow: "sm", cell: (r) => <span className="tabular text-muted">{r.leave}</span> },
    { key: "n", header: "Absentees", hideBelow: "md", cell: (r) => <span className="text-[12.5px] text-muted">{r.absentees.join(", ") || "—"}</span> },
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="w-44"><Field label="Date"><DateInput value={day} onChange={(v) => v && setDay(v)} max={todayISO()} /></Field></div>
        <Button icon={Printer} onClick={() => window.print()}>Print</Button>
      </div>
      <p className="mb-3 text-[14px] text-ink">{formatLongDate(day)}{totals ? ` · ${totals.marked}/${totals.sections} marked · ${pctText(totals.present_pct)} present · ${totals.absent} absent · ${totals.leave} on leave` : ""}</p>
      <DataTable rows={rows ?? []} rowKey={(r) => String(r.section_id)} columns={cols} loading={!rows} emptyTitle={`No ${term("sections").toLowerCase()}`} />
    </div>
  );
}

/* ── Monthly register ── */
type Monthly = { section: { label: string }; month: string; mode: string; working_days: number;
  days: { date: string; day: number; weekday: string; working: boolean; reason: string | null }[];
  rows: { student_id: number; name: string; roll_no: string | null; cells: Record<string, string>; present: number; total: number; pct: number | null }[]; legend: AttStatus[] };
function Monthly({ sections }: { sections: SectionOpt[] }) {
  const { term } = useInstitution();
  const toast = useToast();
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [data, setData] = useState<Monthly | null>(null);
  useEffect(() => {
    if (!sectionId) return;
    setData(null);
    api.get<Monthly>(`/student-attendance/reports/monthly?section_id=${sectionId}&month=${month}`).then(setData).catch((e) => toast.error("Couldn't load", { description: (e as Error).message }));
  }, [sectionId, month, toast]);
  const months = useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const d = new Date(`${todayISO().slice(0, 7)}-15T12:00:00Z`);
    for (let i = 0; i < 12; i++) { const v = d.toISOString().slice(0, 7); out.push({ value: v, label: formatMonth(`${v}-15`) }); d.setUTCMonth(d.getUTCMonth() - 1); }
    return out;
  }, []);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-end gap-2">
          <SectionPick sections={sections} value={sectionId} onChange={setSectionId} />
          <div className="w-44"><Field label="Month"><Select value={month} onChange={(v) => v && setMonth(v as string)} options={months} /></Field></div>
        </div>
        <div className="flex gap-2">
          <Button icon={Download} disabled={!sectionId} onClick={() => downloadFile(`/student-attendance/reports/monthly?section_id=${sectionId}&month=${month}&format=csv`, `attendance-${month}.csv`).catch((e) => toast.error((e as Error).message))}>CSV</Button>
          <Button icon={Printer} onClick={() => window.print()}>Print</Button>
        </div>
      </div>
      {!data ? <Paper className="p-5"><Skeleton className="h-64 w-full" /></Paper> : (
        <Paper className="overflow-hidden print:border-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
            <p className="text-[14.5px] text-ink">{data.section.label} · {formatMonth(`${data.month}-15`)}</p>
            <p className="text-[12.5px] text-muted">{data.working_days} working days · {data.mode === "period" ? "present / periods held" : data.legend.filter((s) => s.active).map((s) => `${s.code} ${s.name}`).join(" · ")}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="text-faint">
                  <th className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-normal">{term("student")}</th>
                  {data.days.map((d) => <th key={d.date} title={d.reason ?? undefined} className={`w-7 px-0.5 py-2 text-center font-normal ${d.working ? "" : "bg-line/40"}`}><div>{d.day}</div><div className="text-[10px]">{d.weekday.slice(0, 2)}</div></th>)}
                  <th className="px-2 py-2 text-right font-normal">Days</th><th className="px-3 py-2 text-right font-normal">%</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.student_id} className="border-t border-line">
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-surface px-3 py-1.5 text-ink"><span className="mr-2 text-faint">{r.roll_no}</span>{r.name}</td>
                    {data.days.map((d) => {
                      const v = r.cells[d.date];
                      return <td key={d.date} className={`px-0.5 py-1 text-center ${d.working ? "" : "bg-line/40"}`}>
                        {v ? (data.mode === "period" ? <span className="text-[11px] text-muted">{v}</span> : v.split("/").map((c, i) => <CodeChip key={i} code={c} statuses={data.legend} className="h-5 min-w-5 px-0.5 text-[10.5px]" />)) : null}
                      </td>;
                    })}
                    <td className="tabular px-2 py-1.5 text-right text-muted">{r.present}/{r.total}</td>
                    <td className={`tabular px-3 py-1.5 text-right ${pctTone(r.pct)}`}>{pctText(r.pct)}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && <tr><td colSpan={data.days.length + 3} className="px-4 py-10 text-center text-muted">No {term("students").toLowerCase()} in this {term("section").toLowerCase()}.</td></tr>}
              </tbody>
            </table>
          </div>
        </Paper>
      )}
    </div>
  );
}

/* ── Percentages ── */
type PctRow = Pct & { student_id: number; name: string; roll_no: string | null; below: boolean };
function Percentages({ sections }: { sections: SectionOpt[] }) {
  const { term } = useInstitution();
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [range, setRange] = useState<Range>({ key: "session" });
  const [data, setData] = useState<{ rows: PctRow[]; label: string; threshold: number; from: string; to: string } | null>(null);
  useEffect(() => {
    if (!sectionId) return;
    setData(null);
    api.get<typeof data>(`/student-attendance/reports/percentages?section_id=${sectionId}&${rangeQs(range)}`).then(setData).catch(() => {});
  }, [sectionId, range]);
  const cols: Column<PctRow>[] = [
    { key: "r", header: term("roll"), width: "70px", sortable: true, sortValue: (r) => Number(r.roll_no) || 0, cell: (r) => <span className="tabular text-muted">{r.roll_no}</span> },
    { key: "n", header: term("student"), sortable: true, sortValue: (r) => r.name, cell: (r) => <span className="text-ink">{r.name}</span> },
    { key: "p", header: "Attendance", width: "200px", sortable: true, sortValue: (r) => r.pct ?? -1, cell: (r) => <PctBar value={r.pct} threshold={data?.threshold} /> },
    { key: "d", header: "Present / held", align: "right", hideBelow: "sm", cell: (r) => <span className="tabular text-muted">{r.present}/{r.total}</span> },
    { key: "a", header: "Absent", align: "right", sortable: true, sortValue: (r) => r.absent, cell: (r) => <span className="tabular">{r.absent}</span> },
    { key: "l", header: "Late", align: "right", hideBelow: "md", cell: (r) => <span className="tabular text-muted">{r.late}</span> },
    { key: "lv", header: "Leave", align: "right", hideBelow: "md", cell: (r) => <span className="tabular text-muted">{r.leave}</span> },
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-end gap-2"><SectionPick sections={sections} value={sectionId} onChange={setSectionId} /><RangePicker value={range} onChange={setRange} /></div>
        <Button icon={Printer} onClick={() => window.print()}>Print</Button>
      </div>
      {data && <p className="mb-3 text-[13px] text-muted">{data.label}: {formatDate(data.from)} to {formatDate(data.to)} · threshold {data.threshold}%</p>}
      <DataTable rows={data?.rows ?? []} rowKey={(r) => String(r.student_id)} columns={cols} loading={!data && !!sectionId}
        rowClassName={(r) => (r.below ? "bg-rose-50/40" : "")} emptyTitle={`No ${term("students").toLowerCase()}`} />
    </div>
  );
}

/* ── By subject (period mode) ── */
function Subjects({ sections }: { sections: SectionOpt[] }) {
  const { term } = useInstitution();
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [range, setRange] = useState<Range>({ key: "session" });
  const [data, setData] = useState<{ subjects: { id: number; name: string }[]; rows: { student_id: number; name: string; roll_no: string | null; cells: Record<string, number | null> }[] } | null>(null);
  useEffect(() => {
    if (!sectionId) return;
    setData(null);
    api.get<typeof data>(`/student-attendance/reports/subjects?section_id=${sectionId}&${rangeQs(range)}`).then(setData).catch(() => {});
  }, [sectionId, range]);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2 print:hidden"><SectionPick sections={sections} value={sectionId} onChange={setSectionId} /><RangePicker value={range} onChange={setRange} /></div>
      {!data ? <Paper className="p-5"><Skeleton className="h-40 w-full" /></Paper> : data.subjects.length === 0 ? (
        <Paper className="p-10 text-center text-[14px] text-muted">No period registers yet for this {term("section").toLowerCase()}.</Paper>
      ) : (
        <Paper className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="text-faint"><th className="px-4 py-2.5 text-left font-normal">{term("student")}</th>{data.subjects.map((s) => <th key={s.id} className="px-3 py-2.5 text-right font-normal">{s.name}</th>)}</tr></thead>
            <tbody>{data.rows.map((r) => (
              <tr key={r.student_id} className="border-t border-line"><td className="px-4 py-2 text-ink"><span className="mr-2 text-faint">{r.roll_no}</span>{r.name}</td>
                {data.subjects.map((s) => <td key={s.id} className={`tabular px-3 py-2 text-right ${pctTone(r.cells[String(s.id)])}`}>{pctText(r.cells[String(s.id)])}</td>)}</tr>))}</tbody>
          </table>
        </Paper>
      )}
    </div>
  );
}

/* ── Defaulters ── */
type DefRow = Pct & { student_id: number; uuid: string; name: string; roll_no: string | null; section_id: number; section_label: string };
function Defaulters({ sections }: { sections: SectionOpt[] }) {
  const { term } = useInstitution();
  const { can } = useAccess();
  const toast = useToast();
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [range, setRange] = useState<Range>({ key: "session" });
  const [data, setData] = useState<{ rows: DefRow[]; threshold: number; label: string } | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => {
    setData(null);
    const qs = [rangeQs(range), sectionId ? `section_id=${sectionId}` : "", threshold ? `threshold=${threshold}` : ""].filter(Boolean).join("&");
    api.get<{ rows: DefRow[]; threshold: number; label: string }>(`/student-attendance/reports/defaulters?${qs}`).then((r) => { setData(r); if (threshold === null) setThreshold(r.threshold); }).catch(() => setData({ rows: [], threshold: 75, label: "" }));
  }, [sectionId, range, threshold]);
  async function notify(rows: DefRow[], clear?: () => void) {
    try {
      const r = await api.post<{ sent: number }>("/student-attendance/reports/defaulters/notify", { student_ids: rows.map((x) => x.student_id), threshold: data?.threshold });
      toast.success(r.sent ? `Alert sent to ${r.sent} famil${r.sent === 1 ? "y" : "ies"}` : "Already alerted today");
      clear?.();
    } catch (e) { toast.error("Couldn't send", { description: (e as Error).message }); }
  }
  const cols: Column<DefRow>[] = [
    { key: "n", header: term("student"), sortable: true, sortValue: (r) => r.name, cell: (r) => <div><p className="text-ink">{r.name}</p><p className="text-[12.5px] text-muted">{r.section_label} · {term("roll")} {r.roll_no}</p></div> },
    { key: "p", header: "Attendance", width: "200px", sortable: true, sortValue: (r) => r.pct ?? 0, cell: (r) => <PctBar value={r.pct} threshold={data?.threshold} /> },
    { key: "d", header: "Present / held", align: "right", hideBelow: "sm", cell: (r) => <span className="tabular text-muted">{r.present}/{r.total}</span> },
    { key: "a", header: "Absent", align: "right", cell: (r) => <span className="tabular">{r.absent}</span> },
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
        <div className="w-60"><Field label={term("section")}><Select value={sectionId} clearable placeholder={`All ${term("sections").toLowerCase()}`} onChange={(v) => setSectionId(v as number | null)} options={sections.map((s) => ({ value: s.id, label: s.label }))} /></Field></div>
        <RangePicker value={range} onChange={setRange} />
        <div className="w-32"><Field label="Below"><NumberInput value={threshold} onChange={(v) => v && setThreshold(v)} min={1} max={100} suffix="%" /></Field></div>
      </div>
      <DataTable rows={paginate(data?.rows ?? [], page, 25)} rowKey={(r) => String(r.student_id)} columns={cols} loading={!data}
        selectable={can("attendance.view")} bulkActions={can("attendance.view") ? [{ label: `Alert ${term("guardians").toLowerCase()}`, icon: BellRing, onSelect: (rows, clear) => notify(rows, clear) }] : undefined}
        pagination={{ page, size: 25, total: data?.rows.length ?? 0, onPageChange: setPage }}
        emptyIcon={TriangleAlert} emptyTitle="Nobody below the threshold" emptyHint="Good news: every learner is above the required attendance." />
    </div>
  );
}

/* ── Corrections ── */
type Corr = { uuid: string; date: string; student_name: string | null; section_label: string | null; old_code: string | null; new_code: string; reason: string; by_name: string | null; at: string | null };
function Corrections() {
  const { term } = useInstitution();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Corr[]; total: number } | null>(null);
  const [statuses, setStatuses] = useState<AttStatus[]>([]);
  useEffect(() => { api.get<{ items: AttStatus[] }>("/student-attendance/statuses?all=true").then((r) => setStatuses(r.items)).catch(() => {}); }, []);
  useEffect(() => { setData(null); api.get<{ items: Corr[]; total: number }>(`/student-attendance/corrections?page=${page}`).then(setData).catch(() => setData({ items: [], total: 0 })); }, [page]);
  const cols: Column<Corr>[] = [
    { key: "d", header: "Register date", cell: (r) => formatDate(r.date) },
    { key: "s", header: term("student"), cell: (r) => <div><p className="text-ink">{r.student_name}</p><p className="text-[12.5px] text-muted">{r.section_label}</p></div> },
    { key: "c", header: "Change", cell: (r) => <span className="inline-flex items-center gap-1">{r.old_code ? <CodeChip code={r.old_code} statuses={statuses} /> : <span className="text-faint">new</span>}<span className="text-faint">→</span><CodeChip code={r.new_code} statuses={statuses} /></span> },
    { key: "r", header: "Reason", hideBelow: "md", cell: (r) => <span className="text-[13px] text-muted">{r.reason}</span> },
    { key: "b", header: "By", hideBelow: "sm", cell: (r) => <div><p className="text-[13px]">{r.by_name}</p><p className="text-[12px] text-faint">{r.at ? formatDateTime(r.at) : ""}</p></div> },
  ];
  return <DataTable rows={data?.items ?? []} rowKey={(r) => r.uuid} columns={cols} loading={!data}
    pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
    emptyTitle="No corrections" emptyHint="Changes to locked registers are listed here with who made them and why." />;
}
