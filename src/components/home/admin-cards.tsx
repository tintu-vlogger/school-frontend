"use client";

/*
 * HR and admin cards on the Overview. Each one is shown only when the person holds the
 * permission its endpoint needs, so nobody triggers a refused call.
 *   <KpiStrip access={access} />   headcount, joiners, leavers, attrition, present today, on leave
 *   <PayrollStatusCard />  <HiringCard />  <LifecycleCard access={access} />  <ComplianceCard />  <DepartmentsCard />
 */
import Link from "next/link";
import {
  AlertTriangle, Briefcase, Building2, CalendarClock, ChevronRight, DoorOpen, Hourglass, Landmark, LogOut, ShieldCheck, Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { Badge, Skeleton } from "@/components/ui-kit";
import { RunStatus, inrShort } from "@/components/payroll/common";
import { CardSkeleton, HomeCard, MiniBars, Quiet, Sparkline, STROKE, Unavailable, useLoad, type HomeAccess } from "./kit";
import type { TeamToday } from "./team-cards";

/* ── KPI strip ────────────────────────────────────────────────────── */

type Stats = { by_status: Record<string, number>; active: number; joiners_this_month: number };
type MoveRow = { month: string; sum__closing: number; sum__joiners: number; sum__leavers: number; sum__attrition_percent: number };

const MOVEMENT_WIDGET = {
  widget: {
    type: "table", title: "Headcount movement", source: "headcount_movement",
    config: {
      params: { from: "@days:-330", to: "@today" }, group_by: ["month"],
      measures: [
        { agg: "sum", field: "closing", label: "Closing" }, { agg: "sum", field: "joiners", label: "Joiners" },
        { agg: "sum", field: "leavers", label: "Leavers" }, { agg: "sum", field: "attrition_percent", label: "Attrition" },
      ],
    },
  },
};

let movementCache: { at: number; rows: MoveRow[] } | null = null;

function useMovement(enabled: boolean) {
  const [rows, setRows] = useState<MoveRow[] | null>(movementCache?.rows ?? null);
  useEffect(() => {
    if (!enabled) return;
    if (movementCache && Date.now() - movementCache.at < 120_000) { setRows(movementCache.rows); return; }
    let live = true;
    api.post<{ rows: MoveRow[] }>("/dashboards/widget-preview", MOVEMENT_WIDGET)
      .then((r) => { movementCache = { at: Date.now(), rows: r.rows ?? [] }; if (live) setRows(movementCache.rows); })
      .catch(() => live && setRows([]));
    return () => { live = false; };
  }, [enabled]);
  return rows;
}

export function KpiStrip({ access, delay = 0 }: { access: HomeAccess; delay?: number }) {
  const canMove = access.can("people.employees.manage") || access.can("insights.reports.all_data");
  const stats = useLoad<Stats>(access.can("people.employees.view") ? "/employees/stats" : null, 60);
  const today = useLoad<TeamToday>(access.can("time.attendance.view") ? "/attendance/team/today" : null, 30);
  const move = useMovement(canMove);

  const rows = move ?? [];
  const last = rows[rows.length - 1];
  const leavers12 = rows.reduce((a, r) => a + (r.sum__leavers || 0), 0);
  const avgHead = rows.length ? rows.reduce((a, r) => a + (r.sum__closing || 0), 0) / rows.length : 0;
  const attrition = avgHead ? (leavers12 * 100) / avgHead : 0;
  const c = today.data?.counts ?? {};
  const expected = (c.total ?? 0) - (c.off ?? 0);
  const presentPct = expected > 0 ? Math.round((((c.present ?? 0) + (c.remote ?? 0)) * 100) / expected) : null;

  const tiles = [
    { label: "Headcount", value: stats.data?.active, loading: stats.loading, spark: rows.map((r) => r.sum__closing), href: "/dashboard/staff",
      hint: stats.data?.by_status?.probation ? `${stats.data.by_status.probation} on probation` : undefined },
    { label: "Joined this month", value: stats.data?.joiners_this_month, loading: stats.loading, spark: rows.map((r) => r.sum__joiners), href: "/dashboard/staff",
      hint: stats.data?.by_status?.pre_joining ? `${stats.data.by_status.pre_joining} about to join` : undefined },
    { label: "Left this month", value: canMove ? last?.sum__leavers ?? (move ? 0 : undefined) : undefined, loading: canMove && !move, spark: rows.map((r) => r.sum__leavers), href: "/dashboard/exits",
      hint: stats.data?.by_status?.notice ? `${stats.data.by_status.notice} serving notice` : undefined, hide: !canMove },
    { label: "Attrition, 12 months", value: canMove && move ? `${attrition.toFixed(1)}%` : undefined, loading: canMove && !move, spark: rows.map((r) => r.sum__attrition_percent), href: "/dashboard/reports",
      hint: move ? `${leavers12} left in the year` : undefined, hide: !canMove },
    { label: "Present today", value: presentPct === null ? (today.data ? "—" : undefined) : `${presentPct}%`, loading: today.loading, href: "/dashboard/attendance/admin",
      ring: presentPct ?? 0, hint: today.data ? (expected ? `${(c.present ?? 0) + (c.remote ?? 0)} of ${expected} expected` : "No one is due in today") : undefined, hide: !access.can("time.attendance.view") },
    { label: "On leave today", value: today.data ? c.on_leave ?? 0 : undefined, loading: today.loading, href: "/dashboard/leave/team",
      hint: today.data && c.absent ? `${c.absent} absent` : undefined, hide: !access.can("time.attendance.view") },
  ].filter((t) => !t.hide);

  if (!tiles.length) return null;
  return (
    <div className="home-rise grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 xl:grid-cols-6 [&>*]:bg-surface" style={{ gap: 1, animationDelay: `${delay}ms` }}>
      {tiles.map((t) => (
        <Link key={t.label} href={t.href} className="group flex min-w-0 flex-col justify-between gap-3 px-4 py-4 transition-colors hover:bg-sunken/60">
          <span className="truncate text-[12px] text-muted">{t.label}</span>
          <span className="flex items-end justify-between gap-2">
            {t.loading && t.value === undefined ? <Skeleton className="h-8 w-14" /> : (
              <span className="tabular text-[30px] font-extralight leading-none tracking-tight text-ink">{t.value ?? "—"}</span>
            )}
            {"ring" in t && t.ring !== undefined ? <PercentArc value={t.ring} /> : t.spark && t.spark.length > 1 ? <Sparkline values={t.spark} width={64} height={24} /> : null}
          </span>
          <span className="truncate text-[11.5px] text-faint">{t.hint ?? " "}</span>
        </Link>
      ))}
    </div>
  );
}

function PercentArc({ value }: { value: number }) {
  // a 180° gauge
  const r = 20, c = Math.PI * r, v = Math.max(0, Math.min(100, value)) / 100;
  return (
    <svg width="48" height="26" viewBox="0 0 48 26" className="text-primary" aria-hidden>
      <path d="M4 24 A20 20 0 0 1 44 24" fill="none" stroke="var(--hr-line)" strokeWidth="3" strokeLinecap="round" />
      <path d="M4 24 A20 20 0 0 1 44 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: "stroke-dashoffset 700ms ease-out" }} />
    </svg>
  );
}

/* ── Payroll status ───────────────────────────────────────────────── */

type PayDash = {
  trend: { label: string; net: string; status: string }[];
  upcoming: { uuid?: string; label: string; due_date: string; amount: string | null; status: string; days_left: number }[];
  current_run: { uuid: string; title: string; status: string; totals?: { net?: string; employees?: number } } | null;
  alerts: { key: string; tone: string; text: string; href?: string }[];
};
const STAGES = [
  { key: "inputs", label: "Inputs", match: ["draft", "inputs", "checked"] },
  { key: "calc", label: "Calculate", match: ["calculating"] },
  { key: "review", label: "Review", match: ["review", "pending_approval"] },
  { key: "approved", label: "Approve", match: ["approved", "locked"] },
  { key: "paid", label: "Paid", match: ["paid"] },
];

export function PayrollStatusCard({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const { data, loading, error } = useLoad<PayDash>("/payroll/dashboard", 60);
  const run = data?.current_run;
  const idx = run ? STAGES.findIndex((s) => s.match.includes(run.status)) : -1;
  const next = (data?.upcoming ?? []).filter((u) => u.status !== "paid" && u.status !== "filed").sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const trend = (data?.trend ?? []).map((t) => Number(t.net));

  return (
    <HomeCard title="Payroll" icon={Wallet} href={run ? `/dashboard/payroll/runs/${run.uuid}` : "/dashboard/payroll/runs"} link={run ? "Open run" : "Pay runs"} className={className} delay={delay}>
      {loading && !data ? <CardSkeleton rows={3} /> : error || !data ? <Unavailable /> : (
        <div className="flex flex-1 flex-col px-5 pb-5 pt-2">
          {run ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[13.5px] text-ink">{run.title}</p>
                <RunStatus status={run.status} />
              </div>
              <ol className="mt-4 flex items-center">
                {STAGES.map((s, i) => (
                  <li key={s.key} className="flex flex-1 items-center last:flex-none">
                    <span title={s.label} className={`relative flex h-2.5 w-2.5 shrink-0 rounded-full ${i < idx ? "bg-primary" : i === idx ? "bg-primary ring-4 ring-primary/15" : "border border-line-strong bg-surface"}`} />
                    {i < STAGES.length - 1 && <span className={`mx-1 h-px flex-1 ${i < idx ? "bg-primary" : "bg-line"}`} />}
                  </li>
                ))}
              </ol>
              <div className="mt-1.5 flex justify-between text-[10.5px] uppercase tracking-[0.08em] text-faint">
                {STAGES.map((s, i) => <span key={s.key} className={i === idx ? "text-primary" : ""}>{s.label}</span>)}
              </div>
              <div className="mt-4 flex items-end justify-between">
                <span>
                  <span className="tabular block text-[24px] font-extralight leading-none text-ink">{inrShort(run.totals?.net)}</span>
                  <span className="text-[12px] text-faint">net pay · {run.totals?.employees ?? 0} people</span>
                </span>
                {trend.length > 1 && <Sparkline values={trend} width={80} height={28} />}
              </div>
            </>
          ) : <p className="text-[13px] text-muted">No pay run in progress.</p>}
          {next && <div className="mt-auto pt-4" />}
          {next && (
            <Link href="/dashboard/statutory" className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 transition-colors hover:border-primary/40">
              <Landmark size={16} strokeWidth={STROKE} className={next.days_left <= 0 ? "text-rose-500" : next.days_left <= 7 ? "text-amber-500" : "text-faint"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-ink">{next.label}</span>
                <span className="block text-[11.5px] text-faint">{next.days_left < 0 ? `${-next.days_left} days late` : next.days_left === 0 ? "Due today" : `Due ${formatDate(next.due_date)} · in ${next.days_left} days`}</span>
              </span>
              {next.amount && <span className="tabular shrink-0 text-[12.5px] text-muted">{inrShort(next.amount)}</span>}
            </Link>
          )}
          {data.alerts?.[0] && (
            <Link href={data.alerts[0].href || "/dashboard/payroll"} className="mt-2 flex items-center gap-2 text-[12px] text-amber-700 hover:underline">
              <AlertTriangle size={13} strokeWidth={STROKE} /> <span className="truncate">{data.alerts[0].text}</span>
            </Link>
          )}
        </div>
      )}
    </HomeCard>
  );
}

/* ── Hiring ───────────────────────────────────────────────────────── */

type Hiring = { open_jobs: number; active_candidates: number; interviews_this_week: number; offers_out: number; offers_pending_approval: number; requisitions_pending: number };

export function HiringCard({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const { data, loading, error } = useLoad<Hiring>("/recruitment/summary", 60);
  const steps = data ? [
    { label: "Open jobs", value: data.open_jobs, href: "/dashboard/recruitment" },
    { label: "Candidates", value: data.active_candidates, href: "/dashboard/recruitment/candidates" },
    { label: "Interviews this week", value: data.interviews_this_week, href: "/dashboard/recruitment/interviews" },
    { label: "Offers out", value: data.offers_out, href: "/dashboard/recruitment/offers" },
  ] : [];
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <HomeCard title="Hiring" icon={Briefcase} href="/dashboard/recruitment" link="Pipeline" className={className} delay={delay}>
      {loading && !data ? <CardSkeleton rows={3} /> : error || !data ? <Unavailable /> : (
        <div className="flex flex-1 flex-col px-5 pb-5 pt-3">
          <div className="space-y-1.5">
            {steps.map((s, i) => (
              <Link key={s.label} href={s.href} className="group relative flex h-9 items-center justify-between overflow-hidden rounded-lg px-3">
                <span className="home-grow absolute inset-y-0 left-0 rounded-lg bg-primary-soft transition-colors group-hover:bg-primary/15"
                  style={{ width: `${Math.max(14, (s.value / max) * 100)}%`, animationDelay: `${i * 60}ms` }} />
                <span className="relative text-[13px] text-muted group-hover:text-ink">{s.label}</span>
                <span className="tabular relative text-[15px] font-light text-ink">{s.value}</span>
              </Link>
            ))}
          </div>
          {(data.offers_pending_approval > 0 || data.requisitions_pending > 0) && (
            <p className="mt-auto pt-3 text-[12px] text-amber-700">
              {[data.offers_pending_approval && `${data.offers_pending_approval} offer${data.offers_pending_approval === 1 ? "" : "s"}`,
                data.requisitions_pending && `${data.requisitions_pending} hiring request${data.requisitions_pending === 1 ? "" : "s"}`].filter(Boolean).join(" and ")} waiting for approval
            </p>
          )}
        </div>
      )}
    </HomeCard>
  );
}

/* ── Onboarding, probation, exits ─────────────────────────────────── */

type Onb = { pre_joining: number; in_progress: number; joining_this_week: number; to_review: number };
type Prob = { by_status: Record<string, number>; ending_in_30_days: number; overdue: number };
type Exits = { requested: number; in_progress: number; leaving_in_30_days: number; settlements_due: number; delayed_clearances: number };

export function LifecycleCard({ access, className = "", delay = 0 }: { access: HomeAccess; className?: string; delay?: number }) {
  const onb = useLoad<Onb>(access.can("talent.onboarding.manage") ? "/onboarding/dashboard" : null, 60);
  const prob = useLoad<Prob>(access.can("talent.probation.manage") ? "/probation/dashboard" : null, 60);
  const ex = useLoad<Exits>(access.can("talent.exits.manage") ? "/exits/dashboard" : null, 60);
  const blocks = [
    access.can("talent.onboarding.manage") && {
      key: "onb", icon: DoorOpen, label: "Onboarding", href: "/dashboard/onboarding", s: onb,
      value: onb.data ? onb.data.pre_joining + onb.data.in_progress : undefined,
      sub: onb.data ? (onb.data.joining_this_week ? `${onb.data.joining_this_week} joining this week` : `${onb.data.to_review} to review`) : "",
      warn: !!onb.data?.to_review,
    },
    access.can("talent.probation.manage") && {
      key: "prob", icon: Hourglass, label: "Probation", href: "/dashboard/probation", s: prob,
      value: prob.data ? (prob.data.by_status.active ?? 0) + (prob.data.by_status.in_review ?? 0) + (prob.data.by_status.extended ?? 0) : undefined,
      sub: prob.data ? (prob.data.overdue ? `${prob.data.overdue} overdue` : `${prob.data.ending_in_30_days} ending in 30 days`) : "",
      warn: !!prob.data?.overdue,
    },
    access.can("talent.exits.manage") && {
      key: "ex", icon: LogOut, label: "Exits", href: "/dashboard/exits", s: ex,
      value: ex.data ? ex.data.requested + ex.data.in_progress : undefined,
      sub: ex.data ? (ex.data.settlements_due ? `${ex.data.settlements_due} settlements due` : `${ex.data.leaving_in_30_days} leaving in 30 days`) : "",
      warn: !!(ex.data?.settlements_due || ex.data?.delayed_clearances),
    },
  ].filter(Boolean) as { key: string; icon: typeof DoorOpen; label: string; href: string; s: { loading: boolean; error: boolean }; value?: number; sub: string; warn: boolean }[];

  return (
    <HomeCard title="People in motion" icon={CalendarClock} className={className} delay={delay}>
      <ul className="flex flex-1 flex-col px-2 pb-3 pt-1">
        {blocks.map((b) => (
          <li key={b.key}>
            <Link href={b.href} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-sunken">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary"><b.icon size={16} strokeWidth={STROKE} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] text-ink">{b.label}</span>
                <span className={`block truncate text-[12px] ${b.warn ? "text-amber-700" : "text-faint"}`}>{b.s.error ? "Couldn't load" : b.sub || " "}</span>
              </span>
              {b.s.loading && b.value === undefined ? <Skeleton className="h-6 w-8" /> : <span className="tabular text-[24px] font-extralight leading-none text-ink">{b.value ?? "—"}</span>}
              <ChevronRight size={14} strokeWidth={STROKE} className="text-faint" />
            </Link>
          </li>
        ))}
      </ul>
    </HomeCard>
  );
}

/* ── Compliance ───────────────────────────────────────────────────── */

type Compliance = {
  summary: { late: number; due_soon: number; pending: number; done: number; risks: number };
  items: { key: string; label: string; due_date: string; status: string; days_left: number }[];
};

export function ComplianceCard({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const { data, loading, error } = useLoad<Compliance>("/compliance/dashboard", 120);
  const soon = (data?.items ?? []).filter((i) => i.status !== "done" && i.days_left >= 0 && i.days_left <= 30)
    .sort((a, b) => a.days_left - b.days_left).slice(0, 5);
  const s = data?.summary;
  return (
    <HomeCard title="Compliance due soon" icon={ShieldCheck} href="/dashboard/compliance" link="Calendar" className={className} delay={delay}>
      {loading && !data ? <CardSkeleton rows={4} /> : error || !data ? <Unavailable /> : (
        <div className="flex flex-1 flex-col pb-3">
          {s && (
            <div className="mx-5 mt-2 flex flex-wrap gap-2">
              {s.late > 0 && <Badge tone="bad" dot>{s.late} late</Badge>}
              {s.due_soon > 0 && <Badge tone="warn" dot>{s.due_soon} due this week</Badge>}
              <Badge tone="neutral">{s.pending} upcoming</Badge>
              {s.risks > 0 && <Badge tone="info">{s.risks} checks</Badge>}
            </div>
          )}
          {soon.length === 0 ? <Quiet icon={ShieldCheck}>Nothing due in the next 30 days.</Quiet> : (
            <ul className="mt-2 px-2">
              {soon.map((i) => (
                <li key={i.key} className="flex items-center gap-3 rounded-xl px-3 py-2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${i.days_left === 0 ? "bg-rose-500" : i.days_left <= 7 ? "bg-amber-500" : "bg-line-strong"}`} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{i.label}</span>
                  <span className={`shrink-0 text-[12px] ${i.days_left === 0 ? "text-rose-600" : "text-muted"}`}>{i.days_left === 0 ? "Today" : formatDate(i.due_date, { year: undefined })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </HomeCard>
  );
}

/* ── Headcount by department ──────────────────────────────────────── */

type Department = { uuid: string; department_name: string; active: boolean; employee_count: number; parent_id: number | null };

export function DepartmentsCard({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const { data, loading, error } = useLoad<Department[]>("/departments/", 120);
  const depts = (data ?? []).filter((d) => d.active && d.employee_count > 0).sort((a, b) => b.employee_count - a.employee_count);
  const top = depts.slice(0, 6);
  const rest = depts.slice(6).reduce((a, d) => a + d.employee_count, 0);
  const items = [...top.map((d) => ({ label: d.department_name, value: d.employee_count })), ...(rest ? [{ label: "Other teams", value: rest }] : [])];
  return (
    <HomeCard title="Headcount by department" icon={Building2} href="/dashboard/departments" link="Departments" className={className} delay={delay}>
      {loading && !data ? <CardSkeleton rows={4} /> : error ? <Unavailable /> : items.length === 0 ? <Quiet icon={Building2}>No departments yet.</Quiet> : (
        <div className="px-5 pb-5 pt-3"><MiniBars items={items} /></div>
      )}
    </HomeCard>
  );
}
