"use client";

/*
 * Payroll overview: the current pay run, cost trend for the last twelve runs, statutory
 * liabilities of the last approved month, upcoming due dates and things that need attention.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CalendarClock, IndianRupee, Landmark, PlayCircle, Users, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { EmptyState, PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Button, Skeleton, StatCard } from "@/components/ui-kit";
import { Legend, RunStatus, StatusPill, TrendBars, errMsg, inr, inrShort, usePayrollAccess } from "@/components/payroll/common";

type Dash = {
  trend: { period: string; label: string; status: string; gross: string; net: string; employer_cost: string; employees: number }[];
  liabilities: { key: string; label: string; amount: string; period: string }[];
  upcoming: { kind: string; label: string; period: string; due_date: string; amount: string; status: string; days_left: number; state: string }[];
  alerts: { key: string; tone: string; text: string; href: string }[];
  current_run: { uuid: string; title: string; status: string; totals: Record<string, any> } | null;
  last_run: { uuid: string; title: string; totals: Record<string, any> } | null;
  headcount: number; with_salary: number;
};

export default function PayrollOverview() {
  const router = useRouter();
  const toast = useToast();
  const access = usePayrollAccess();
  const [d, setD] = useState<Dash | null>(null);

  useEffect(() => {
    if (access && !access.permissions["payroll.view"]) { router.replace("/dashboard/payroll/me"); return; }
    if (access) api.get<Dash>("/payroll/dashboard").then(setD).catch((e) => toast.error(errMsg(e)));
  }, [access, router, toast]);

  const last = d?.last_run?.totals ?? {};
  const prev = d && d.trend.length > 1 ? d.trend[d.trend.length - 2] : null;
  const lastCost = Number(last.employer_cost ?? 0);
  const change = prev && Number(prev.employer_cost) ? ((lastCost - Number(prev.employer_cost)) / Number(prev.employer_cost)) * 100 : null;

  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Payroll overview" description="This month's pay run, what payroll costs and what is due to the government."
        actions={<Button variant="primary" icon={PlayCircle} onClick={() => router.push(d?.current_run ? `/dashboard/payroll/runs/${d.current_run.uuid}` : "/dashboard/payroll/runs?new=1")}>
          {d?.current_run ? "Continue pay run" : "Run payroll"}</Button>} />
      {!d ? <div className="grid gap-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div> : (
        <div className="space-y-5">
          {d.alerts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {d.alerts.map((a) => (
                <Link key={a.key} href={a.href} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] transition-colors ${a.tone === "bad" ? "border-rose-200 bg-rose-50/60 text-rose-800 hover:border-rose-300" : a.tone === "warn" ? "border-amber-200 bg-amber-50/60 text-amber-800 hover:border-amber-300" : "border-sky-200 bg-sky-50/60 text-sky-800 hover:border-sky-300"}`}>
                  <AlertTriangle size={14} strokeWidth={1.4} />{a.text}<ArrowRight size={13} strokeWidth={1.4} />
                </Link>
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Employer cost (last month)" value={inrShort(last.employer_cost)} icon={IndianRupee}
              trend={change !== null ? { value: `${change > 0 ? "+" : ""}${change.toFixed(1)}%`, direction: change > 0.5 ? "up" : change < -0.5 ? "down" : "flat", good: change <= 0 } : undefined}
              hint={d.last_run?.title} />
            <StatCard label="Net pay" value={inrShort(last.net)} icon={Wallet} hint={`${last.employees ?? 0} people paid`} />
            <StatCard label="People with a salary" value={`${d.with_salary} / ${d.headcount}`} icon={Users}
              onClick={() => router.push("/dashboard/payroll/salaries")} hint="Active employees" />
            <StatCard label="Due to the government" value={inrShort(d.liabilities.reduce((a, l) => a + Number(l.amount), 0))} icon={Landmark}
              hint="PF, ESI, PT, LWF and TDS" onClick={() => router.push("/dashboard/statutory")} />
          </div>
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <Paper>
              <PaperHeader title="Payroll cost" action={<Legend items={[{ label: "Employer cost", className: "bg-primary/10" }, { label: "Gross", className: "bg-primary/30" }, { label: "Net", className: "bg-primary" }]} />} />
              <TrendBars data={d.trend.map((t) => ({ label: t.label, gross: Number(t.gross), net: Number(t.net), cost: Number(t.employer_cost) }))} />
            </Paper>
            <Paper>
              <PaperHeader title="Current pay run" />
              {d.current_run ? (
                <div className="space-y-4 p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[16px] text-ink">{d.current_run.title}</p>
                    <RunStatus status={d.current_run.status} />
                  </div>
                  {d.current_run.totals?.employees ? (
                    <div className="grid grid-cols-2 gap-3 text-[13.5px]">
                      <div><p className="text-muted">Gross</p><p className="tabular text-ink">{inr(d.current_run.totals.gross)}</p></div>
                      <div><p className="text-muted">Net</p><p className="tabular text-ink">{inr(d.current_run.totals.net)}</p></div>
                      <div><p className="text-muted">Employees</p><p className="tabular text-ink">{d.current_run.totals.employees}</p></div>
                      <div><p className="text-muted">TDS</p><p className="tabular text-ink">{inr(d.current_run.totals.tds)}</p></div>
                    </div>
                  ) : <p className="text-[13.5px] text-muted">Inputs are being collected.</p>}
                  <Button className="w-full justify-center" onClick={() => router.push(`/dashboard/payroll/runs/${d.current_run!.uuid}`)}>Open pay run</Button>
                </div>
              ) : <EmptyState icon={PlayCircle} title="No pay run open" hint="Open this month's period to start." />}
            </Paper>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Paper>
              <PaperHeader title="Statutory liabilities" action={d.liabilities[0] && <span className="text-[12.5px] text-faint">{d.liabilities[0].period}</span>} />
              {d.liabilities.length ? (
                <ul className="divide-y divide-line">
                  {d.liabilities.map((l) => (
                    <li key={l.key} className="flex items-center justify-between px-5 py-3 text-[14px]">
                      <span className="text-ink/85">{l.label}</span><span className="tabular text-ink">{inr(l.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState icon={Landmark} title="Nothing yet" hint="Amounts appear once a pay run is approved." />}
            </Paper>
            <Paper>
              <PaperHeader title="Coming up" action={<Link href="/dashboard/statutory?tab=calendar" className="text-[13px] text-primary">Calendar</Link>} />
              {d.upcoming.length ? (
                <ul className="divide-y divide-line">
                  {d.upcoming.map((u, i) => (
                    <li key={i} className="flex items-center gap-4 px-5 py-3">
                      <span className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg border text-center ${u.days_left < 0 ? "border-rose-200 text-rose-700" : u.days_left <= 3 ? "border-amber-200 text-amber-700" : "border-line text-muted"}`}>
                        <CalendarClock size={14} strokeWidth={1.4} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] text-ink">{u.label}</p>
                        <p className="text-[12.5px] text-faint">{u.period} · due {formatDate(u.due_date)}</p>
                      </div>
                      <div className="text-right">
                        {Number(u.amount) > 0 && <p className="tabular text-[13.5px] text-ink">{inr(u.amount)}</p>}
                        {u.status === "late" ? <StatusPill status="late" /> : <Badge tone={u.days_left <= 3 ? "warn" : "neutral"}>{u.days_left === 0 ? "Today" : `${u.days_left} days`}</Badge>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState icon={CalendarClock} title="Nothing due soon" />}
            </Paper>
          </div>
        </div>
      )}
    </div>
  );
}
