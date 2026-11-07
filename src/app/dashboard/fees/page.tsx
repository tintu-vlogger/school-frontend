"use client";

/*
 * Fees overview: collected today / month / session, outstanding and defaulters, the 30-day
 * collection trend, billed vs collected by month, dues by class and recent receipts.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BellRing, CalendarDays, HandCoins, IndianRupee, Receipt, TrendingUp, Wallet } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate, formatDayMonth, formatMonth } from "@/lib/datetime";
import { PageHeader, Paper, PaperHeader, EmptyState } from "@/components/shell/page";
import { Button, Skeleton, StatCard, StatGrid } from "@/components/ui-kit";
import { money, moneyShort, n, type Money } from "@/components/fees/shared";

type Overview = {
  currency: string; today: string; session_name: string | null;
  collected_today: Money; collected_month: Money; collected_session: Money; billed_session: Money;
  outstanding: Money; overdue: Money; defaulters: number;
  trend: { date: string; amount: Money }[];
  monthly: { month: string; collected: Money; billed: Money }[];
  by_program: { program_id: number; program: string; due: Money; overdue: Money; students: number }[];
  by_mode: { mode: string; label: string; amount: Money }[];
  recent: { uuid: string; number: string; student: string; amount: Money; mode: string; paid_on: string; created_at: string }[];
};

export default function FeesOverviewPage() {
  const { can } = useAccess();
  const { term } = useInstitution();
  const [data, setData] = useState<Overview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api.get<Overview>("/fees/overview").then((d) => { if (live) setData(d); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  const cur = data?.currency ?? "INR";
  const rate = data && n(data.billed_session) > 0 ? Math.round((n(data.collected_session) / n(data.billed_session)) * 100) : null;
  const trend = (data?.trend ?? []).map((t) => ({ label: formatDayMonth(t.date), amount: n(t.amount) }));
  const monthly = (data?.monthly ?? []).map((m) => ({ label: formatMonth(m.month).split(" ")[0].slice(0, 3), billed: n(m.billed), collected: n(m.collected) }));
  const maxDue = Math.max(1, ...(data?.by_program ?? []).map((p) => n(p.due)));

  return (
    <div>
      <PageHeader eyebrow="Fees" title="Fees overview"
        description={data?.session_name ? `Collections and dues for ${data.session_name}.` : "Collections and dues at a glance."}
        actions={<>
          {can("fees.view") && <Link href="/dashboard/fees/dues"><Button icon={BellRing}>Dues & reminders</Button></Link>}
          {can("fees.collect") && <Link href="/dashboard/fees/collect"><Button variant="primary" icon={HandCoins}>Collect fees</Button></Link>}
        </>} />

      {failed && <Paper><EmptyState icon={IndianRupee} title="Couldn't load the fee overview" hint="Check your connection and try again." /></Paper>}

      <StatGrid>
        {data ? <>
          <StatCard label="Collected today" value={money(data.collected_today, cur)} icon={Wallet} hint={formatDate(data.today)} />
          <StatCard label="This month" value={money(data.collected_month, cur)} icon={CalendarDays} />
          <StatCard label="This session" value={money(data.collected_session, cur)} icon={TrendingUp}
            hint={rate !== null ? `${rate}% of ${money(data.billed_session, cur)} billed` : undefined} />
          <StatCard label="Outstanding" value={money(data.outstanding, cur)} icon={AlertTriangle}
            hint={`${money(data.overdue, cur)} overdue · ${data.defaulters} defaulters`} />
        </> : Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[124px] rounded-2xl" />)}
      </StatGrid>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Paper className="lg:col-span-2">
          <PaperHeader title="Collection, last 30 days" />
          <div className="h-[260px] px-2 py-4">
            {data ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 16, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="fee-trend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#78716c" }} tickLine={false} axisLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 11, fill: "#78716c" }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => moneyShort(v, cur)} />
                  <Tooltip formatter={(v) => [money(Number(v), cur), "Collected"]} contentStyle={{ borderRadius: 10, border: "1px solid #e7e5e4", fontSize: 12 }} />
                  <Area type="monotone" dataKey="amount" stroke="#4f46e5" strokeWidth={2} fill="url(#fee-trend)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <Skeleton className="h-full w-full" />}
          </div>
        </Paper>

        <Paper>
          <PaperHeader title="This month by mode" />
          <ul className="divide-y divide-line">
            {(data?.by_mode ?? []).length === 0 && <li className="px-5 py-8 text-center text-[13.5px] text-muted">No collections this month yet.</li>}
            {(data?.by_mode ?? []).sort((a, b) => n(b.amount) - n(a.amount)).map((m) => (
              <li key={m.mode} className="flex items-center justify-between px-5 py-3 text-[14px]">
                <span className="text-ink/80">{m.label}</span><span className="tabular text-ink">{money(m.amount, cur)}</span>
              </li>
            ))}
          </ul>
        </Paper>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Paper>
          <PaperHeader title={`Top dues by ${term("program").toLowerCase()}`} action={<Link href="/dashboard/fees/dues" className="text-[13px] text-primary">See all dues</Link>} />
          <ul className="divide-y divide-line">
            {data && data.by_program.length === 0 && <li className="px-5 py-8 text-center text-[13.5px] text-muted">Nothing outstanding. Well done.</li>}
            {(data?.by_program ?? []).map((p) => (
              <li key={p.program_id ?? p.program} className="px-5 py-3">
                <div className="flex items-center justify-between text-[14px]">
                  <span className="text-ink">{p.program}</span>
                  <span className="tabular text-ink">{money(p.due, cur)}</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${(n(p.due) / maxDue) * 100}%` }} />
                </div>
                <p className="mt-1 text-[12px] text-faint">{p.students} {term("students").toLowerCase()} · {money(p.overdue, cur)} overdue</p>
              </li>
            ))}
          </ul>
        </Paper>

        <Paper>
          <PaperHeader title="Billed and collected by month" />
          <div className="h-[280px] px-2 py-4">
            {data ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 8, right: 16, bottom: 0, left: 4 }} barGap={2}>
                  <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#78716c" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#78716c" }} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => moneyShort(v, cur)} />
                  <Tooltip formatter={(v, name) => [money(Number(v), cur), name === "billed" ? "Falling due" : "Collected"]} contentStyle={{ borderRadius: 10, border: "1px solid #e7e5e4", fontSize: 12 }} />
                  <Bar dataKey="billed" fill="#c7d2fe" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="collected" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <Skeleton className="h-full w-full" />}
          </div>
        </Paper>
      </div>

      <Paper className="mt-5">
        <PaperHeader title="Recent receipts" action={<Link href="/dashboard/fees/payments" className="text-[13px] text-primary">All receipts</Link>} />
        {data && data.recent.length === 0 ? <EmptyState icon={Receipt} title="No receipts yet" hint="Fees collected at the counter or online show up here." /> : (
          <ul className="divide-y divide-line">
            {(data?.recent ?? []).map((r) => (
              <li key={r.uuid} className="flex items-center justify-between gap-3 px-5 py-3 text-[14px]">
                <div className="min-w-0">
                  <p className="truncate text-ink">{r.student}</p>
                  <p className="text-[12.5px] text-faint">{r.number} · {formatDate(r.paid_on)}</p>
                </div>
                <span className="tabular text-ink">{money(r.amount, cur)}</span>
              </li>
            ))}
          </ul>
        )}
      </Paper>
    </div>
  );
}
