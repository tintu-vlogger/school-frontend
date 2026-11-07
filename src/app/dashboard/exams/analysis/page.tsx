"use client";

/*
 * Results analysis for an exam or a combined result: pass rate, averages, subject averages,
 * grade distribution, score spread, section comparison, toppers, and one learner's progress
 * across exams.
 */
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Award, ChartColumnBig, Percent, TrendingUp, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useInstitution } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Avatar, Badge, Select, Skeleton, StatCard, StatGrid, type SelectOption } from "@/components/ui-kit";
import { fmt, sourceOptions, useExamOptions, useSections, type Result } from "@/components/exams/shared";

type AnalysisData = {
  name: string; kind: string;
  overview: { students: number; appeared: number; passed: number; pass_percent: number | null; average: number | null; highest: number | null; lowest: number | null; average_gpa: number | null; published: number };
  sections: { section_id: number; label: string; students: number; average: number | null; pass_percent: number | null; highest: number | null }[];
  subjects: { subject_id: number; subject: string; average: number | null; highest: number | null; lowest: number | null; pass_percent: number | null; students: number }[];
  distribution: { grade: string; count: number }[];
  histogram: { range: string; count: number }[];
  toppers: Result[];
};
type Progress = { student: { name: string; section_label: string | null }; points: { exam: string; percentage: number | null; grade: string | null; rank: number | null; subjects: Record<string, number> }[] };

const ACCENT = "var(--color-primary, #4f46e5)";
const axis = { fontSize: 12, fill: "#8a8f9c" };

export default function AnalysisPage() {
  // useSearchParams needs a Suspense boundary.
  return <Suspense fallback={null}><Analysis /></Suspense>;
}

function Analysis() {
  const toast = useToast();
  const { term } = useInstitution();
  const { options } = useExamOptions();
  const sections = useSections();
  const params = useSearchParams();
  const [picked, setSource] = useState<string | null>(() => params.get("source"));
  const all = sourceOptions(options);
  const source = picked ?? all[all.length - 1]?.value ?? null;
  const [section, setSection] = useState<number | null>(null);
  const [got, setGot] = useState<{ key: string; data: AnalysisData } | null>(null);
  const reqKey = `${source}|${section}`;
  useEffect(() => {
    if (!source) return;
    let live = true;
    api.get<AnalysisData>(`/exams/analysis?source=${source}${section ? `&section_id=${section}` : ""}`).then((r) => { if (live) setGot({ key: reqKey, data: r }); })
      .catch((e) => toast.error("Couldn't load the analysis", { description: e.message }));
    return () => { live = false; };
  }, [source, section, reqKey, toast]);
  const data = got?.data ?? null;
  const loading = got?.key !== reqKey;
  const o = data?.overview;
  const gpa = o?.average_gpa !== null && o?.average_gpa !== undefined;

  return (
    <div>
      <PageHeader eyebrow="Exams" title="Results analysis" description="How each exam went: pass rates, averages, toppers and where learners need help." />
      <div className="mb-5 flex flex-wrap gap-3">
        <div className="w-full sm:w-72"><Select value={source} onChange={setSource} options={sourceOptions(options)} placeholder="Pick an exam or result" aria-label="Exam or result" /></div>
        <div className="w-full sm:w-56"><Select value={section} onChange={setSection} clearable placeholder={`Every ${term("section").toLowerCase()}`} options={sections.map((s) => ({ value: s.id, label: s.label }))} aria-label={term("section")} /></div>
      </div>
      {!source ? <Paper className="p-10 text-center text-[14px] text-muted">Pick an exam to see how it went.</Paper>
        : loading && !data ? <Skeleton className="h-80 w-full" /> : !data || !o ? null : o.appeared === 0 ? (
          <Paper className="p-10 text-center"><ChartColumnBig size={26} strokeWidth={1.2} className="mx-auto mb-3 text-faint" /><p className="text-[14.5px] text-ink">No results yet</p>
            <p className="mt-1 text-[13.5px] text-muted">The analysis fills in as marks are entered.</p></Paper>
        ) : (
          <div className={`space-y-5 ${loading ? "opacity-60" : ""}`}>
            <StatGrid>
              <StatCard label="Appeared" value={<span className="tabular">{o.appeared}</span>} icon={Users} hint={`${o.published} published`} />
              <StatCard label="Pass rate" value={<span className="tabular">{fmt(o.pass_percent, 1)}%</span>} icon={Percent} hint={`${o.passed} passed`} />
              <StatCard label={gpa ? "Average GPA" : "Average"} value={<span className="tabular">{gpa ? fmt(o.average_gpa) : `${fmt(o.average, 1)}%`}</span>} icon={TrendingUp} />
              <StatCard label="Highest" value={<span className="tabular">{fmt(o.highest, 1)}%</span>} icon={Award} hint={`Lowest ${fmt(o.lowest, 1)}%`} />
            </StatGrid>
            <div className="grid gap-5 lg:grid-cols-2">
              <Paper>
                <PaperHeader title={`${term("subject")} averages`} />
                <div className="p-4" style={{ height: Math.max(220, data.subjects.length * 34 + 40) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.subjects} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }}>
                      <CartesianGrid horizontal={false} stroke="#ececf0" />
                      <XAxis type="number" domain={[0, 100]} tick={axis} tickLine={false} axisLine={false} unit="%" />
                      <YAxis type="category" dataKey="subject" width={120} tick={axis} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} formatter={(v) => [`${fmt(Number(v), 1)}%`, "Average"]} />
                      <Bar dataKey="average" fill={ACCENT} radius={[0, 4, 4, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Paper>
              <Paper>
                <PaperHeader title="Grade distribution" />
                <div className="h-[260px] p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.distribution} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                      <CartesianGrid vertical={false} stroke="#ececf0" />
                      <XAxis dataKey="grade" tick={axis} tickLine={false} axisLine={false} interval={0}
                        {...(data.distribution.length > 8 ? { angle: -35, textAnchor: "end", height: 56 } : {})} />
                      <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} formatter={(v) => [v, term("students")]} />
                      <Bar dataKey="count" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={44} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="border-t border-line px-4 pb-4 pt-3">
                  <p className="mb-2 text-[12.5px] text-muted">Score spread (%)</p>
                  <div className="h-[110px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.histogram} margin={{ top: 0, right: 8, bottom: 0, left: -24 }}>
                        <XAxis dataKey="range" tick={{ ...axis, fontSize: 10.5 }} tickLine={false} axisLine={false} interval={0} />
                        <YAxis allowDecimals={false} tick={axis} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} formatter={(v) => [v, term("students")]} />
                        <Bar dataKey="count" fill="#a5b4fc" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </Paper>
            </div>
            <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
              <Paper className="overflow-hidden">
                <PaperHeader title={`${term("subjects")} and ${term("sections").toLowerCase()}`} />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-[13.5px]">
                    <thead className="bg-sunken/60 text-left text-[12px] text-muted"><tr><th className="px-4 py-2 font-normal">{term("subject")}</th>
                      <th className="px-3 py-2 text-right font-normal">Average</th><th className="px-3 py-2 text-right font-normal">Highest</th><th className="px-3 py-2 text-right font-normal">Pass</th></tr></thead>
                    <tbody className="divide-y divide-line">{data.subjects.map((s) => (
                      <tr key={s.subject_id}><td className="px-4 py-2">{s.subject}</td><td className="px-3 py-2 text-right tabular">{fmt(s.average, 1)}%</td>
                        <td className="px-3 py-2 text-right tabular">{fmt(s.highest, 1)}%</td>
                        <td className={`px-3 py-2 text-right tabular ${(s.pass_percent ?? 100) < 75 ? "text-rose-700" : ""}`}>{fmt(s.pass_percent, 0)}%</td></tr>))}</tbody>
                  </table>
                  {data.sections.length > 1 && (
                    <table className="w-full min-w-[420px] border-t border-line text-[13.5px]">
                      <thead className="bg-sunken/60 text-left text-[12px] text-muted"><tr><th className="px-4 py-2 font-normal">{term("section")}</th>
                        <th className="px-3 py-2 text-right font-normal">{term("students")}</th><th className="px-3 py-2 text-right font-normal">Average</th><th className="px-3 py-2 text-right font-normal">Pass</th></tr></thead>
                      <tbody className="divide-y divide-line">{data.sections.map((s) => (
                        <tr key={s.section_id}><td className="px-4 py-2">{s.label}</td><td className="px-3 py-2 text-right tabular">{s.students}</td>
                          <td className="px-3 py-2 text-right tabular">{fmt(s.average, 1)}%</td><td className="px-3 py-2 text-right tabular">{fmt(s.pass_percent, 0)}%</td></tr>))}</tbody>
                    </table>
                  )}
                </div>
              </Paper>
              <Paper>
                <PaperHeader title="Toppers" />
                <ol className="divide-y divide-line">
                  {data.toppers.map((t, i) => (
                    <li key={t.uuid} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-5 text-right tabular text-[13px] text-muted">{i + 1}</span>
                      <Avatar name={t.student_name ?? ""} src={t.photo_url ?? undefined} size={30} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-[14px] text-ink">{t.student_name}</span><span className="block truncate text-[12.5px] text-muted">{t.section_label}</span></span>
                      <span className="tabular text-[14px]">{t.gpa !== null ? fmt(t.gpa) : `${fmt(t.percentage, 1)}%`}</span>
                      {t.grade && <Badge tone="accent">{t.grade}</Badge>}
                    </li>
                  ))}
                </ol>
              </Paper>
            </div>
            <LearnerProgress />
          </div>
        )}
    </div>
  );
}

function LearnerProgress() {
  const toast = useToast();
  const { term } = useInstitution();
  const [student, setStudent] = useState<string | null>(null);
  const [got, setGot] = useState<Progress & { uuid: string } | null>(null);
  const data = student && got?.uuid === student ? got : null;
  const search = async (q: string): Promise<SelectOption[]> => {
    const r = await api.get<{ items: { uuid: string; name: string; admission_no: string; section_label: string | null }[] }>(`/students?size=20${q ? `&q=${encodeURIComponent(q)}` : ""}`);
    return r.items.map((s) => ({ value: s.uuid, label: s.name, description: [s.admission_no, s.section_label].filter(Boolean).join(" · ") }));
  };
  useEffect(() => {
    if (!student) return;
    api.get<Progress>(`/exams/analysis/progress/${student}`).then((r) => setGot({ ...r, uuid: student })).catch((e) => toast.error("Couldn't load progress", { description: e.message }));
  }, [student, toast]);
  return (
    <Paper>
      <PaperHeader title={`${term("student")} progress`} action={<div className="w-64"><Select value={student} onChange={setStudent} loadOptions={search} clearable placeholder={`Search a ${term("student").toLowerCase()}`} /></div>} />
      <div className="p-4">
        {!data ? <p className="py-8 text-center text-[13.5px] text-muted">Pick a {term("student").toLowerCase()} to see their results across exams.</p>
          : data.points.length === 0 ? <p className="py-8 text-center text-[13.5px] text-muted">No exam results yet.</p> : (
            <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.points} margin={{ top: 10, right: 16, bottom: 0, left: -16 }}>
                    <CartesianGrid vertical={false} stroke="#ececf0" />
                    <XAxis dataKey="exam" tick={axis} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={axis} tickLine={false} axisLine={false} unit="%" />
                    <Tooltip formatter={(v) => [`${fmt(Number(v), 1)}%`, "Percentage"]} />
                    <Line type="monotone" dataKey="percentage" stroke={ACCENT} strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <ul className="divide-y divide-line rounded-xl border border-line text-[13.5px]">
                {data.points.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 px-3 py-2"><span className="truncate">{p.exam}</span>
                    <span className="flex items-center gap-2 tabular">{fmt(p.percentage, 1)}%{p.grade && <Badge tone="accent">{p.grade}</Badge>}</span></li>
                ))}
              </ul>
            </div>
          )}
      </div>
    </Paper>
  );
}

