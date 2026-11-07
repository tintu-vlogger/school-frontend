"use client";

/*
 * Hiring reports: funnel, sources, time to hire, offer acceptance and how long jobs stay open.
 */
import { useEffect, useState } from "react";
import { Clock, FileSignature, Users, Briefcase } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Paper, PaperHeader, PageHeader } from "@/components/shell/page";
import { DateRangeInput, Field, Select, StatCard, type SelectOption } from "@/components/ui-kit";
import { Bar } from "@/components/recruitment/common";
import { errText, type Job, type Page } from "@/components/recruitment/types";

type Report = {
  funnel: { kind: string; label: string; count: number; rate: number }[];
  sources: { source: string; label: string; applicants: number; interviewed: number; offered: number; hired: number; conversion: number; interview_rate: number }[];
  time_to_hire: { hires: number; average_days: number | null; fastest_days: number | null; slowest_days: number | null };
  offers: { sent: number; accepted: number; declined: number; expired: number; pending: number; acceptance_rate: number | null; decline_reasons: { reason: string; count: number }[] };
  jobs_open: { uuid: string; title: string; status: string; days_open: number }[];
  totals: { applications: number; candidates: number; open_jobs: number };
};

export default function HiringReportsPage() {
  const toast = useToast();
  const [r, setR] = useState<Report | null>(null);
  const [job, setJob] = useState<string | null>(null);
  const [jobs, setJobs] = useState<SelectOption<string>[]>([]);
  const [period, setPeriod] = useState<{ from: string; to: string }>({ from: "", to: "" });
  useEffect(() => { api.get<Page<Job>>("/recruitment/jobs?size=200").then((x) => setJobs(x.items.map((j) => ({ value: j.uuid, label: j.title })))).catch(() => {}); }, []);
  useEffect(() => {
    const p = new URLSearchParams();
    if (job) p.set("job_uuid", job);
    if (period.from) p.set("start", period.from);
    if (period.to) p.set("end", period.to);
    api.get<Report>(`/recruitment/reports?${p}`).then(setR).catch((e) => toast.error(errText(e)));
  }, [job, period, toast]);

  const maxF = Math.max(1, ...(r?.funnel.map((f) => f.count) ?? [1]));
  const maxDays = Math.max(1, ...(r?.jobs_open.map((j) => j.days_open) ?? [1]));
  return (
    <div>
      <PageHeader title="Hiring reports" description="Where candidates come from, how far they get and how fast you hire."
        actions={<>
          <div className="w-60"><Select value={job} onChange={setJob} options={jobs} clearable placeholder="All jobs" aria-label="Job" /></div>
          <div className="w-72"><DateRangeInput value={period} onChange={(v) => setPeriod({ from: v.from ?? "", to: v.to ?? "" })} /></div>
        </>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Applications" value={r?.totals.applications ?? "—"} icon={Users} hint={r ? `${r.totals.candidates} people` : undefined} />
        <StatCard label="Average time to hire" value={r?.time_to_hire.average_days != null ? `${r.time_to_hire.average_days} d` : "—"} icon={Clock}
          hint={r?.time_to_hire.hires ? `${r.time_to_hire.hires} hire(s), ${r.time_to_hire.fastest_days}–${r.time_to_hire.slowest_days} days` : "No hires yet"} />
        <StatCard label="Offer acceptance" value={r?.offers.acceptance_rate != null ? `${r.offers.acceptance_rate}%` : "—"} icon={FileSignature}
          hint={r ? `${r.offers.accepted} accepted, ${r.offers.declined} declined, ${r.offers.pending} open` : undefined} />
        <StatCard label="Open jobs" value={r?.totals.open_jobs ?? "—"} icon={Briefcase} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Paper>
          <PaperHeader title="Funnel" />
          <div className="space-y-4 p-5">
            {r?.funnel.map((f) => (
              <div key={f.kind}>
                <div className="mb-1 flex justify-between text-[13.5px]"><span className="text-ink">{f.label}</span><span className="tabular text-muted">{f.count} · {f.rate}%</span></div>
                <Bar value={f.count} max={maxF} />
              </div>
            ))}
          </div>
        </Paper>
        <Paper>
          <PaperHeader title="Sources" />
          <div className="overflow-x-auto p-2">
            <table className="w-full text-[13.5px]">
              <thead><tr className="text-left text-[12px] text-faint">{["Source", "Applied", "Interviewed", "Offered", "Hired", "Conversion"].map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {r?.sources.map((s) => (
                  <tr key={s.source}><td className="px-3 py-2 text-ink">{s.label}</td><td className="px-3 py-2 tabular">{s.applicants}</td>
                    <td className="px-3 py-2 tabular">{s.interviewed}</td><td className="px-3 py-2 tabular">{s.offered}</td><td className="px-3 py-2 tabular">{s.hired}</td>
                    <td className="px-3 py-2"><div className="flex items-center gap-2"><span className="w-10 tabular text-muted">{s.conversion}%</span><div className="w-20"><Bar value={s.conversion} max={100} tone="bg-emerald-500/70" /></div></div></td></tr>
                ))}
                {r && !r.sources.length && <tr><td colSpan={6} className="px-3 py-6 text-center text-faint">No applications in this period.</td></tr>}
              </tbody>
            </table>
          </div>
        </Paper>
        <Paper>
          <PaperHeader title="Days each job has been open" />
          <div className="space-y-3 p-5">
            {r?.jobs_open.map((j) => (
              <div key={j.uuid}><div className="mb-1 flex justify-between text-[13.5px]"><span className="text-ink">{j.title}</span><span className="tabular text-muted">{j.days_open} days</span></div>
                <Bar value={j.days_open} max={maxDays} tone={j.days_open > 45 ? "bg-amber-400" : "bg-primary/70"} /></div>
            ))}
            {r && !r.jobs_open.length && <p className="text-faint">No published jobs.</p>}
          </div>
        </Paper>
        <Paper>
          <PaperHeader title="Offers" />
          <div className="space-y-4 p-5">
            {r && ([["Accepted", r.offers.accepted, "bg-emerald-500/70"], ["Declined", r.offers.declined, "bg-rose-400"], ["Expired", r.offers.expired, "bg-faint"], ["Waiting", r.offers.pending, "bg-primary/70"]] as const).map(([l, v, tone]) => (
              <div key={l}><div className="mb-1 flex justify-between text-[13.5px]"><span className="text-ink">{l}</span><span className="tabular text-muted">{v}</span></div><Bar value={v} max={Math.max(1, r.offers.sent)} tone={tone} /></div>
            ))}
            {!!r?.offers.decline_reasons.length && (
              <Field label="Why offers were declined">
                <ul className="space-y-1 text-[13.5px]">{r.offers.decline_reasons.map((d) => <li key={d.reason} className="flex justify-between"><span>{d.reason}</span><span className="tabular text-muted">{d.count}</span></li>)}</ul>
              </Field>
            )}
          </div>
        </Paper>
      </div>
    </div>
  );
}
