"use client";

/*
 * Student attendance today: how many registers are marked, present %, absentees and leave,
 * the signed-in teacher's own registers to mark, and every section's state. Row click opens
 * the register.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarX2, ChartColumnBig, ClipboardCheck, PieChart, Settings2, UserCheck, UserX, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatLongDate, todayISO } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Button, DataTable, DateInput, FilterBar, StatCard, StatGrid, type Column, type FilterValues } from "@/components/ui-kit";
import { PctBar } from "@/components/student_attendance/lib";

type SectionRow = {
  section_id: number; label: string; class_teacher: string | null; strength: number; working: boolean; reason: string | null;
  expected: number; marked: number; complete: boolean; present_pct: number | null; absent: number; late: number; leave: number; absentees: string[];
};
type Overview = { date: string; mode: string; sections: SectionRow[]; totals: { sections: number; marked: number; partly: number; present_pct: number | null; absent: number; late: number; leave: number; strength: number } };
type MyReg = { section_id: number; label: string; slot: string; period_no: number; subject_id: number | null; slot_label: string; start: string | null; end: string | null; marked: boolean; present: number | null; total: number | null; is_substitution: boolean };

function state(r: SectionRow): { label: string; tone: "good" | "warn" | "bad" | "neutral" } {
  if (!r.working) return { label: r.reason || "Holiday", tone: "neutral" };
  if (!r.expected) return { label: "No classes", tone: "neutral" };
  if (r.complete) return { label: "Marked", tone: "good" };
  if (r.marked) return { label: `${r.marked} of ${r.expected}`, tone: "warn" };
  return { label: "Not marked", tone: "bad" };
}

export default function StudentAttendancePage() {
  const { term } = useInstitution();
  const { can } = useAccess();
  const toast = useToast();
  const router = useRouter();
  const [day, setDay] = useState(todayISO());
  const [data, setData] = useState<Overview | null>(null);
  const [mine, setMine] = useState<MyReg[]>([]);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [threshold, setThreshold] = useState(75);

  useEffect(() => {
    let live = true;
    setData(null);
    api.get<Overview>(`/student-attendance/overview?on=${day}`).then((r) => live && setData(r))
      .catch((e) => { if (live) { toast.error("Couldn't load attendance", { description: (e as Error).message }); } });
    api.get<{ registers: MyReg[] }>(`/student-attendance/my-registers?on=${day}`).then((r) => live && setMine(r.registers)).catch(() => {});
    return () => { live = false; };
  }, [day, toast]);
  useEffect(() => { api.get<{ low_attendance_threshold: number }>("/student-attendance/settings").then((s) => setThreshold(s.low_attendance_threshold)).catch(() => {}); }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const st = filters.state?.[0];
    return (data?.sections ?? []).filter((r) => (!q || r.label.toLowerCase().includes(q) || (r.class_teacher || "").toLowerCase().includes(q)) &&
      (!st || (st === "marked" ? r.complete : st === "unmarked" ? r.working && r.expected > 0 && !r.complete : !r.working)));
  }, [data, search, filters]);

  const open = (sectionId: number, extra = "") => router.push(`/dashboard/student-attendance/register?section=${sectionId}&date=${day}${extra}`);
  const t = data?.totals;
  const columns: Column<SectionRow>[] = [
    { key: "label", header: term("section"), sortable: true, sortValue: (r) => r.label, cell: (r) => (
      <div className="min-w-0"><p className="truncate text-ink">{r.label}</p><p className="truncate text-[12.5px] text-muted">{r.class_teacher ?? `No class ${term("teacher").toLowerCase()}`}</p></div>) },
    { key: "state", header: "Register", sortable: true, sortValue: (r) => (r.complete ? 2 : r.marked ? 1 : 0), cell: (r) => { const s = state(r); return <Badge tone={s.tone} dot>{s.label}</Badge>; } },
    { key: "pct", header: "Present", width: "180px", sortable: true, sortValue: (r) => r.present_pct ?? -1, cell: (r) => <PctBar value={r.present_pct} threshold={threshold} /> },
    { key: "absent", header: "Absent", align: "right", sortable: true, sortValue: (r) => r.absent, cell: (r) => <span className={`tabular ${r.absent ? "text-rose-600" : "text-faint"}`}>{r.absent}</span> },
    { key: "leave", header: "Leave", align: "right", hideBelow: "sm", cell: (r) => <span className="tabular text-muted">{r.leave || "—"}</span> },
    { key: "absentees", header: "Absentees", hideBelow: "lg", cell: (r) => <span className="line-clamp-1 text-[12.5px] text-muted">{r.absentees.join(", ") || "—"}</span> },
  ];

  return (
    <div>
      <PageHeader eyebrow="Teaching" title={`${term("student")} attendance`} description={formatLongDate(day)}
        actions={<>
          <div className="w-44"><DateInput value={day} onChange={(v) => v && setDay(v)} max={todayISO()} /></div>
          <Link href="/dashboard/student-attendance/register"><Button variant="primary" icon={ClipboardCheck}>Mark register</Button></Link>
          <Link href="/dashboard/student-attendance/reports"><Button icon={ChartColumnBig}>Reports</Button></Link>
          {can("attendance.settings") && <Link href="/dashboard/student-attendance/settings"><Button icon={Settings2}>Settings</Button></Link>}
        </>} />

      {mine.length > 0 && (
        <Paper className="mb-5">
          <PaperHeader title="Your registers" action={<span className="text-[12.5px] text-muted">{mine.filter((m) => m.marked).length} of {mine.length} marked</span>} />
          <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((m) => (
              <button key={`${m.section_id}-${m.slot}-${m.period_no}-${m.subject_id}`} type="button"
                onClick={() => open(m.section_id, `&slot=${m.slot}&period=${m.period_no}&subject=${m.subject_id ?? 0}`)}
                className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-line-strong">
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-ink">{m.label}</p>
                  <p className="truncate text-[12.5px] text-muted">{m.slot === "day" ? "Daily register" : m.slot_label}{m.start ? ` · ${m.start}` : ""}{m.is_substitution ? " · substitution" : ""}</p>
                </div>
                {m.marked ? <Badge tone="good" dot>{m.present}/{m.total}</Badge> : <Badge tone="warn" dot>Mark now</Badge>}
              </button>
            ))}
          </div>
        </Paper>
      )}

      {(can("attendance.view") || (data?.sections.length ?? 0) > 0) && (
        <>
          <StatGrid className="mb-5">
            <StatCard label="Registers marked" icon={ClipboardCheck} value={t ? `${t.marked}/${t.sections}` : "—"} hint={t?.partly ? `${t.partly} partly marked` : `${term("sections")} with classes today`} />
            <StatCard label="Present" icon={PieChart} value={t?.present_pct != null ? `${Math.round(t.present_pct * 10) / 10}%` : "—"} hint={t ? `${t.strength} ${term("students").toLowerCase()} on roll` : undefined} />
            <StatCard label="Absent" icon={UserX} value={t?.absent ?? "—"} hint={t?.late ? `${t.late} late` : undefined} />
            <StatCard label="On leave" icon={CalendarX2} value={t?.leave ?? "—"} onClick={() => router.push("/dashboard/student-attendance/leave")} hint="See leave requests" />
          </StatGrid>
          <FilterBar searchPlaceholder={`Search ${term("sections").toLowerCase()} or ${term("teachers").toLowerCase()}`} onSearchChange={setSearch}
            filters={[{ key: "state", label: "Register", options: [{ value: "marked", label: "Marked" }, { value: "unmarked", label: "Not marked" }, { value: "holiday", label: "Holiday" }] }]}
            values={filters} onChange={setFilters} />
          <DataTable rows={rows} rowKey={(r) => String(r.section_id)} columns={columns} loading={!data} onRowClick={(r) => r.working && open(r.section_id)}
            emptyIcon={Users} emptyTitle={search || filters.state?.length ? `No ${term("sections").toLowerCase()} match` : `No ${term("sections").toLowerCase()} yet`}
            emptyHint={search || filters.state?.length ? "Try another search or clear the filter." : `Add ${term("sections").toLowerCase()} in Academics first.`} />
        </>
      )}
      {data && !can("attendance.view") && data.sections.length === 0 && mine.length === 0 && (
        <Paper className="p-8 text-center text-[14px] text-muted"><UserCheck size={26} strokeWidth={1.2} className="mx-auto mb-3 text-faint" />No registers for you on this day.</Paper>
      )}
    </div>
  );
}
