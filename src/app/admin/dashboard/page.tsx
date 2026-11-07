"use client";

import { formatDate, formatDayMonth, formatLongDate } from "@/lib/datetime";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, ComposedChart, Line,
} from "recharts";
import {
  LayoutDashboard, IndianRupee, Building2, BadgeCheck, BellRing, TrendingUp, TrendingDown, MapPin, Users, ArrowUpRight, Repeat, Layers,
  Server, RefreshCw, HardDrive, Cpu, MemoryStick, Wallet,
} from "lucide-react";
import { platformApi, rupee } from "@/lib/platform-api";
import { PageHeader, Panel, Loading, Flash, Avatar, Pill, Segmented, Empty } from "@/components/admin-ui";

const api = platformApi("/admin/login");

type Infra = {
  configured: boolean; error?: string; project?: string; plan?: string;
  services?: { name: string; status: string | null; deployed_at: string | null; cpu_vcpu: number; mem_gb: number; disk_gb: number; egress_gb: number; month_cost_usd: number }[];
  volumes?: { name: string; used_gb: number; size_gb: number }[];
  cost_daily?: { date: string; usd: number }[];
  by_resource?: { resource: string; usd: number }[];
  month_cost_usd?: number; estimated_month_usd?: number; usd_inr?: number; fetched_at?: string;
  last_month_usd?: number; total_cost_usd?: number; monthly?: { month: string; usd: number }[]; since?: string; live_days?: number; avg_day_usd?: number; egress_month_gb?: number; mem_now_gb?: number;
};

type A = {
  kpis: { companies: number; new_this_month: number; new_last_month: number; paying: number; trial: number; grace: number; expired: number; disabled: number;
    revenue_total: number; revenue_this_month: number; revenue_last_month: number; mrr: number; arpc: number; conversion: number;
    pending_codes: number; pending_payouts: number };
  months: { month: string; revenue: number; payments: number; signups: number; total_companies: number }[];
  status: { status: string; count: number }[];
  plan_mix: { plan: string; count: number }[];
  revenue_by_plan: { plan: string; revenue: number }[];
  period_mix: { period: string; count: number }[];
  cities: { city: string; count: number }[];
  partners: { name: string; companies: number; paying: number; revenue: number; earned: number }[];
  expiring: { id: number; name: string; status: string; days_left: number }[];
};

const TEAL = "#5b9e8f";
const INK = "#3a4557";
const GRID = "#eef0f2";
const SHADES = [TEAL, "#8fc1b5", "#c3ddd6", "#9aa5b8", "#d6dbe3"];
const STATUS_COLORS: Record<string, string> = { active: TEAL, trial: "#7fa6d6", grace: "#e3b46b", expired: "#e08a8a" };
const STATUS_LABEL: Record<string, string> = { active: "Paying", trial: "Trial", grace: "Grace", expired: "Expired" };

const mLabel = (m: string) => formatDate(m + "-01", { day: undefined, year: undefined });
const dLabel = (d: string) => formatDayMonth(d);
const short = (n: number) => (n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n));
const pct = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 100) : now ? 100 : 0);

const axis = { stroke: "#b8bfca", fontSize: 11, fontWeight: 300, tickLine: false, axisLine: false } as const;

function Tip({ active, payload, label, money, fmt }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string; money?: string[]; fmt?: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12px] font-light">
      {label && <p className="mb-1 text-gray-400">{fmt ? fmt(label) : label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2 text-gray-700">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}
          <span className="ml-auto pl-3 font-normal text-gray-900">{money?.includes(p.name) ? rupee(p.value) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

function Delta({ now, before, suffix = "vs last month" }: { now: number; before: number; suffix?: string }) {
  const d = pct(now, before);
  const up = d >= 0;
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-light text-gray-400">
      <span className={`inline-flex items-center gap-0.5 ${up ? "text-emerald-600" : "text-rose-500"}`}>{up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(d)}%</span>{suffix}
    </span>
  );
}

function Kpi({ icon: Icon, label, value, foot, spark, color = TEAL }: { icon: React.ElementType; label: string; value: React.ReactNode; foot?: React.ReactNode; spark?: number[]; color?: string }) {
  return (
    <div className="flex flex-col rounded-[22px] border border-gray-200/80 bg-white p-[18px]">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100"><Icon size={15} strokeWidth={1.4} className="text-[#3a4557]" /></span>
        <span className="text-[12.5px] font-light text-gray-500">{label}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="text-[28px] font-light leading-none tracking-[-0.02em] text-gray-900 tabular-nums">{value}</p>
        {spark && spark.length > 1 && (
          <div className="h-9 w-20">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark.map((v, i) => ({ i, v }))} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
                <defs><linearGradient id={`sp-${label.replace(/[^a-z0-9]/gi, "")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.25} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.4} fill={`url(#sp-${label.replace(/[^a-z0-9]/gi, "")})`} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      {foot && <div className="mt-2.5">{foot}</div>}
    </div>
  );
}

/** Thin horizontal bars with a label and value. */
function Bars({ rows, money = false }: { rows: { label: string; value: number; sub?: string }[]; money?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-3.5">
      {rows.map((r, i) => (
        <div key={r.label + i}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate font-light text-gray-700">{r.label}{r.sub && <span className="ml-1.5 text-[11.5px] text-gray-400">{r.sub}</span>}</span>
            <span className="font-normal tabular-nums text-gray-900">{money ? rupee(r.value) : r.value}</span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(r.value / max) * 100}%`, background: i === 0 ? TEAL : "#a9cfc6" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Donut({ data, center, sub, compact = false }: { data: { name: string; value: number; color: string }[]; center: React.ReactNode; sub: string; compact?: boolean }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className={`relative flex-shrink-0 ${compact ? "h-[120px] w-[120px]" : "h-[150px] w-[150px]"}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={total ? data : [{ name: "none", value: 1, color: GRID }]} dataKey="value" innerRadius={compact ? 42 : 52} outerRadius={compact ? 56 : 70} paddingAngle={total ? 2 : 0} stroke="none" startAngle={90} endAngle={-270}>
              {(total ? data : [{ color: GRID }]).map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className={`${compact ? "text-[18px]" : "text-[24px]"} font-light leading-none text-gray-900`}>{center}</span>
          <span className="mt-1 text-[11px] font-light text-gray-400">{sub}</span>
        </div>
      </div>
      <ul className={`w-full ${compact ? "space-y-1.5" : "space-y-2.5"}`}>
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2.5 text-[13px] font-light text-gray-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />{d.name}
            <span className="ml-auto font-normal tabular-nums text-gray-900">{d.value}</span>
            <span className="w-10 text-right text-[11.5px] text-gray-400">{total ? Math.round((d.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AdminDashboardPage() {
  const [a, setA] = useState<A | null>(null);
  const [err, setErr] = useState("");
  const [revView, setRevView] = useState<"revenue" | "payments">("revenue");
  const [infra, setInfra] = useState<Infra | null>(null);
  const [infraBusy, setInfraBusy] = useState(false);
  const loadInfra = (refresh = false) => {
    setInfraBusy(true);
    api.get<Infra>(`/admin/infra${refresh ? "?refresh=true" : ""}`).then(setInfra).catch((e) => setInfra({ configured: true, error: e.message })).finally(() => setInfraBusy(false));
  };
  useEffect(() => {
    api.get<A>("/admin/analytics").then(setA).catch((e) => setErr(e.message));
    api.get<Infra>("/admin/infra").then(setInfra).catch((e) => setInfra({ configured: true, error: e.message }));
  }, []);

  const months = useMemo(() => (a?.months || []).map((m) => ({ ...m, label: mLabel(m.month) })), [a]);
  if (!a) return <div className="space-y-6"><PageHeader icon={LayoutDashboard} title="Dashboard" />{err ? <Flash msg={err} onClose={() => setErr("")} /> : <Loading />}</div>;

  const k = a.kpis;
  const statusData = a.status.map((s) => ({ name: STATUS_LABEL[s.status] || s.status, value: s.count, color: STATUS_COLORS[s.status] || "#ccc" }));
  const attention = k.pending_codes + k.pending_payouts + a.expiring.length;
  const today = formatLongDate(new Date());

  return (
    <div className="space-y-6">
      <PageHeader icon={LayoutDashboard} title="Dashboard" sub={<>{today} · how the platform is growing, earning and being used.</>} />

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        <Kpi icon={Repeat} label="Monthly recurring" value={rupee(k.mrr)} spark={months.map((m) => m.revenue)} foot={<span className="text-[12px] font-light text-gray-400">From periods running today</span>} />
        <Kpi icon={IndianRupee} label="Collected this month" value={rupee(k.revenue_this_month)} foot={<Delta now={k.revenue_this_month} before={k.revenue_last_month} />} />
        <Kpi icon={Building2} label="Institutions" value={k.companies} spark={months.map((m) => m.total_companies)} foot={<span className="text-[12px] font-light text-gray-400"><span className="text-emerald-600">+{k.new_this_month}</span> this month</span>} />
        <Kpi icon={BadgeCheck} label="Paying institutions" value={k.paying}
          foot={<div><div className="h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full" style={{ width: `${k.conversion}%`, background: TEAL }} /></div><p className="mt-1.5 text-[12px] font-light text-gray-400">{k.conversion}% have paid at least once</p></div>} />
        <Kpi icon={BellRing} label="Needs attention" value={attention} foot={<span className="text-[12px] font-light text-gray-400">{k.pending_codes} unpaid codes · {k.pending_payouts} payouts</span>} />
      </div>

      <CostStrip infra={infra} mrr={k.mrr} revenueMonth={k.revenue_this_month} />
      <InfraSection infra={infra} busy={infraBusy} onRefresh={() => loadInfra(true)} />

      <h2 className="pt-4 text-[17px] font-light tracking-[-0.01em] text-gray-900">Institutions and money</h2>

      {/* Revenue + status */}
      <div className="grid gap-3 xl:grid-cols-[1.75fr_1fr]">
        <Panel icon={IndianRupee} title="Revenue" sub={`${rupee(k.revenue_total)} collected in total · ${rupee(k.arpc)} per paying institution`}
          action={<Segmented size="sm" value={revView} onChange={setRevView} options={[{ value: "revenue", label: "Amount" }, { value: "payments", label: "Payments" }]} />}>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              {revView === "revenue" ? (
                <AreaChart data={months} margin={{ top: 8, right: 4, left: -12, bottom: 0 }}>
                  <defs><linearGradient id="rev" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={TEAL} stopOpacity={0.22} /><stop offset="100%" stopColor={TEAL} stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis {...axis} tickFormatter={(v) => `₹${short(v)}`} width={52} />
                  <Tooltip content={<Tip money={["Revenue"]} />} cursor={{ stroke: "#d6dbe3", strokeDasharray: "3 3" }} />
                  <Area type="monotone" dataKey="revenue" name="Revenue" stroke={TEAL} strokeWidth={1.8} fill="url(#rev)" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: TEAL }} />
                </AreaChart>
              ) : (
                <BarChart data={months} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={GRID} />
                  <XAxis dataKey="label" {...axis} />
                  <YAxis {...axis} allowDecimals={false} />
                  <Tooltip content={<Tip />} cursor={{ fill: "#f6f7f8" }} />
                  <Bar dataKey="payments" name="Payments" fill={TEAL} radius={[6, 6, 0, 0]} maxBarSize={26} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel icon={Layers} title="Institutions by status" sub={k.disabled ? `${k.disabled} disabled` : "Where every institution stands today"}>
          <Donut data={statusData} center={k.companies} sub="institutions" />
        </Panel>
      </div>

      {/* Growth */}
      <div className="grid gap-3">
        <Panel icon={TrendingUp} title="Institution growth" sub={`${k.new_this_month} new this month · ${k.new_last_month} last month`}>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={months} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" {...axis} />
                <YAxis yAxisId="l" {...axis} allowDecimals={false} />
                <YAxis yAxisId="r" orientation="right" {...axis} allowDecimals={false} width={30} />
                <Tooltip content={<Tip />} cursor={{ fill: "#f6f7f8" }} />
                <Bar yAxisId="l" dataKey="signups" name="New institutions" fill="#c3ddd6" radius={[6, 6, 0, 0]} maxBarSize={22} />
                <Line yAxisId="r" type="monotone" dataKey="total_companies" name="Total institutions" stroke={INK} strokeWidth={1.5} dot={{ r: 2.5, fill: "#fff", stroke: INK, strokeWidth: 1.2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      {/* Plans and payment choices */}
      <div className="grid gap-3">
        <Panel icon={Layers} title="Plans and payment choices" sub="What paying institutions chose">
          {a.revenue_by_plan.length === 0 && a.plan_mix.length === 0 ? <Empty icon={Layers} title="No payments yet" /> : (
            <div className="space-y-6">
              <Bars rows={a.revenue_by_plan.map((p) => ({ label: p.plan, value: p.revenue }))} money />
              {a.period_mix.length > 0 && (
                <div>
                  <p className="mb-2 text-[12px] font-light text-gray-400">Payments by choice</p>
                  <div className="flex h-2 overflow-hidden rounded-full">
                    {(() => { const t = a.period_mix.reduce((x, p) => x + p.count, 0); return a.period_mix.map((p, i) => <span key={p.period} style={{ width: `${(p.count / t) * 100}%`, background: SHADES[i % SHADES.length] }} />); })()}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {a.period_mix.map((p, i) => <span key={p.period} className="flex items-center gap-1.5 text-[11.5px] font-light text-gray-500"><span className="h-2 w-2 rounded-full" style={{ background: SHADES[i % SHADES.length] }} />{p.period} <span className="text-gray-900">{p.count}</span></span>)}
                  </div>
                </div>
              )}
              {a.plan_mix.length > 0 && (
                <div>
                  <p className="mb-2 text-[12px] font-light text-gray-400">Paying institutions by plan</p>
                  <div className="flex flex-wrap gap-2">{a.plan_mix.map((p) => <Pill key={p.plan} tone="green">{p.plan} · {p.count}</Pill>)}</div>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      {/* Lists */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel icon={MapPin} title="Cities" sub="Where institutions are">
          <Bars rows={a.cities.map((c) => ({ label: c.city, value: c.count }))} />
        </Panel>
        <Panel icon={BellRing} title="Ending soon" sub="Trials and paid periods ending in 14 days"
          action={<Link href="/admin/companies" className="inline-flex items-center gap-1 text-[12px] font-light text-gray-500 hover:text-gray-900">All institutions <ArrowUpRight size={13} /></Link>}>
          {a.expiring.length === 0 ? <Empty icon={BadgeCheck} title="Nothing ending soon" /> : (
            <ul className="-my-1 divide-y divide-gray-100">
              {a.expiring.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <Avatar name={c.name} size={32} />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-light text-gray-800">{c.name}</span>
                  <Pill tone={c.days_left <= 3 ? "red" : c.status === "trial" ? "blue" : "amber"} dot>{STATUS_LABEL[c.status]} · {c.days_left <= 0 ? "today" : `${c.days_left}d`}</Pill>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel icon={Users} title="Partners" sub="Institutions each partner brought in and the money they paid" pad={false}
        action={<Link href="/admin/executives" className="inline-flex items-center gap-1 text-[12px] font-light text-gray-500 hover:text-gray-900">Team <ArrowUpRight size={13} /></Link>}>
        {a.partners.length === 0 ? <Empty icon={Users} title="No partners yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="border-b border-gray-100"><tr className="text-left text-[11px] font-normal uppercase tracking-[0.06em] text-gray-400">
                <th className="px-5 py-3 font-normal">Partner</th><th className="px-4 py-3 text-right font-normal">Institutions</th><th className="px-4 py-3 font-normal">Paying</th><th className="px-4 py-3 text-right font-normal">Institutions paid</th><th className="px-5 py-3 text-right font-normal">Partner earned</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {a.partners.map((p, i) => (
                  <tr key={p.name + i}>
                    <td className="px-5 py-3"><span className="flex items-center gap-3"><Avatar name={p.name} size={32} /><span className="font-light text-gray-800">{p.name}</span>{i === 0 && p.revenue > 0 && <Pill tone="amber">Top</Pill>}</span></td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">{p.companies}</td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-2"><span className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full" style={{ width: `${p.companies ? (p.paying / p.companies) * 100 : 0}%`, background: TEAL }} /></span><span className="text-[12px] font-light text-gray-500">{p.paying}/{p.companies}</span></span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-900">{rupee(p.revenue)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-gray-600">{rupee(p.earned)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

    </div>
  );
}

const usd = (n: number) => `$${n < 1 ? n.toFixed(2) : n < 100 ? n.toFixed(2) : Math.round(n).toLocaleString("en-US")}`;
const SVC_STATUS: Record<string, "green" | "amber" | "red" | "gray"> = { SUCCESS: "green", BUILDING: "amber", DEPLOYING: "amber", INITIALIZING: "amber", QUEUED: "amber", FAILED: "red", CRASHED: "red", REMOVED: "gray", SLEEPING: "gray" };

/** Server cost figures shown at the top of the dashboard. */
function CostStrip({ infra, mrr, revenueMonth }: { infra: Infra | null; mrr: number; revenueMonth: number }) {
  if (!infra) return <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-[118px] animate-pulse rounded-[22px] border border-gray-200/80 bg-white" />)}</div>;
  if (!infra.configured || infra.error) return null;
  const rate = infra.usd_inr || 88;
  const month = infra.month_cost_usd || 0, est = infra.estimated_month_usd || 0, last = infra.last_month_usd || 0, total = infra.total_cost_usd || 0;
  const estInr = est * rate;
  const margin = mrr > 0 ? Math.round(((mrr - estInr) / mrr) * 100) : null;
  const daily = (infra.cost_daily || []).filter((d, i, arr) => d.usd > 0 || arr.slice(0, i).some((x) => x.usd > 0));
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
      <Kpi icon={Server} label="Server cost, all time" value={usd(total)} color={INK} spark={(infra.monthly || []).map((m) => m.usd)}
        foot={<span className="text-[12px] font-light text-gray-400">≈ {rupee(total * rate)} · {usd(infra.avg_day_usd || 0)}/day avg</span>} />
      <Kpi icon={Wallet} label="Server cost this month" value={usd(month)} color={INK} spark={daily.map((d) => d.usd)}
        foot={last ? <Delta now={month} before={last} /> : <span className="text-[12px] font-light text-gray-400">≈ {rupee(month * rate)} so far</span>} />
      <Kpi icon={TrendingUp} label="Projected this month" value={usd(est)} foot={<span className="text-[12px] font-light text-gray-400">≈ {rupee(estInr)} at ₹{rate}/$</span>} />
      <Kpi icon={Repeat} label="Last month" value={usd(last)} foot={<span className="text-[12px] font-light text-gray-400">≈ {rupee(last * rate)}</span>} />
      <Kpi icon={IndianRupee} label="Institution income vs servers" value={mrr ? `${Math.max(0, Math.round(mrr / Math.max(1, estInr)))}×` : rupee(revenueMonth)}
        foot={<span className="text-[12px] font-light text-gray-400">{mrr ? <>{rupee(mrr)} in, {rupee(estInr)} out{margin != null ? ` · ${margin}% margin` : ""}</> : "collected this month"}</span>} />
    </div>
  );
}

/** What the platform runs on (Railway) and what it costs against what companies pay. */
function InfraSection({ infra, busy, onRefresh }: { infra: Infra | null; busy: boolean; onRefresh: () => void }) {
  const head = (
    <div className="flex flex-wrap items-end justify-between gap-3 pt-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100"><Server size={16} strokeWidth={1.4} className="text-[#3a4557]" /></span>
        <div>
          <h2 className="text-[17px] font-light tracking-[-0.01em] text-gray-900">Infrastructure</h2>
          <p className="text-[12.5px] font-light text-gray-500">Railway{infra?.project ? ` · ${infra.project}` : ""}{infra?.plan ? ` · ${infra.plan} plan` : ""}{infra?.fetched_at ? ` · updated ${new Date(infra.fetched_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : ""}</p>
        </div>
      </div>
      <button onClick={onRefresh} disabled={busy} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-[12px] font-light text-gray-600 hover:bg-gray-50 disabled:opacity-50">
        <RefreshCw size={13} strokeWidth={1.5} className={busy ? "animate-spin" : ""} /> Refresh
      </button>
    </div>
  );
  if (!infra) return <div className="space-y-3">{head}<Loading /></div>;
  if (!infra.configured) return <div className="space-y-3">{head}<Panel><Empty icon={Server} title="Railway is not connected" sub="Set RAILWAY_API_TOKEN (a project token) on the backend service to see usage and cost here." /></Panel></div>;
  if (infra.error) return <div className="space-y-3">{head}<Panel><Empty icon={Server} title="Could not reach Railway" sub={infra.error} /></Panel></div>;

  const rate = infra.usd_inr || 88;
  const month = infra.month_cost_usd || 0;
  const services = infra.services || [];
  const maxCost = Math.max(0.0001, ...services.map((s) => s.month_cost_usd));
  const res = (infra.by_resource || []).filter((r) => r.usd > 0);
  const resColors = [TEAL, "#8fc1b5", "#9aa5b8", "#e3b46b"];
  const daily = (infra.cost_daily || []).filter((d, i, arr) => d.usd > 0 || arr.slice(0, i).some((x) => x.usd > 0));

  return (
    <div className="space-y-3">
      {head}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel icon={Wallet} title="Server cost by month" sub={`${usd(infra.total_cost_usd || 0)} since ${infra.since ? formatDate(infra.since, { day: undefined }) : "the start"}`}>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(infra.monthly || []).map((m) => ({ ...m, label: mLabel(m.month) }))} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="label" {...axis} />
                <YAxis {...axis} tickFormatter={(v) => `$${Number(v).toFixed(2)}`} width={48} />
                <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12px] font-light"><p className="text-gray-400">{String(label)}</p><p className="text-gray-900">{usd(Number(payload[0].value))} · ≈ {rupee(Number(payload[0].value) * rate)}</p></div>
                ) : null} cursor={{ fill: "#f6f7f8" }} />
                <Bar dataKey="usd" name="Cost" radius={[5, 5, 0, 0]} maxBarSize={22}>
                  {(infra.monthly || []).map((_, i, arr) => <Cell key={i} fill={i === arr.length - 1 ? INK : "#c9ced6"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel icon={Layers} title="Where the money goes" sub="This month, by resource">
          <Donut compact data={res.map((r, i) => ({ name: r.resource, value: Number(r.usd.toFixed(2)), color: resColors[i % resColors.length] }))} center={usd(month)} sub="this month" />
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_1.35fr]">
        <Panel icon={Wallet} title="Server cost per day" sub="Last 30 days, priced at Railway's list rates">
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                <defs><linearGradient id="infra" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={INK} stopOpacity={0.18} /><stop offset="100%" stopColor={INK} stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="date" {...axis} tickFormatter={dLabel} minTickGap={24} />
                <YAxis {...axis} tickFormatter={(v) => `$${Number(v).toFixed(2)}`} width={48} />
                <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12px] font-light"><p className="text-gray-400">{dLabel(String(label))}</p><p className="text-gray-900">{usd(Number(payload[0].value))} · ≈ {rupee(Number(payload[0].value) * rate)}</p></div>
                ) : null} cursor={{ stroke: "#d6dbe3", strokeDasharray: "3 3" }} />
                <Area type="monotone" dataKey="usd" stroke={INK} strokeWidth={1.6} fill="url(#infra)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

      <Panel icon={Server} title="Services" sub="Average use over the last 24 hours, cost for the month so far" pad={false}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="border-b border-gray-100"><tr className="text-left text-[10.5px] uppercase tracking-[0.06em] text-gray-400">
              <th className="px-5 py-2.5 font-normal">Service</th><th className="px-3 py-2.5 font-normal"><span className="inline-flex items-center gap-1"><Cpu size={11} />CPU</span></th><th className="px-3 py-2.5 font-normal"><span className="inline-flex items-center gap-1"><MemoryStick size={11} />Memory</span></th><th className="px-3 py-2.5 text-right font-normal">Egress</th><th className="px-5 py-2.5 font-normal">This month</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {services.map((s) => {
                const tone = SVC_STATUS[s.status || ""] || "gray";
                const dot = { green: "bg-emerald-500", amber: "bg-amber-400", red: "bg-rose-500", gray: "bg-gray-300" }[tone];
                return (
                  <tr key={s.name}>
                    <td className="px-5 py-2.5"><span className="flex items-center gap-2" title={(s.status || "unknown").toLowerCase()}><span className={`h-2 w-2 flex-shrink-0 rounded-full ${dot}`} /><span className="truncate font-light text-gray-800">{s.name}</span></span></td>
                    <td className="px-3 py-2.5 font-light tabular-nums text-gray-600">{s.cpu_vcpu < 0.01 ? "<0.01" : s.cpu_vcpu.toFixed(2)}</td>
                    <td className="px-3 py-2.5 font-light tabular-nums text-gray-600">{Math.round(s.mem_gb * 1024)} MB</td>
                    <td className="px-3 py-2.5 text-right font-light tabular-nums text-gray-600">{s.egress_gb < 0.01 ? "<0.01" : s.egress_gb.toFixed(2)} GB</td>
                    <td className="px-5 py-2.5">
                      <span className="flex items-center gap-2.5"><span className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100"><span className="block h-full rounded-full" style={{ width: `${(s.month_cost_usd / maxCost) * 100}%`, background: INK }} /></span><span className="tabular-nums text-gray-900">{usd(s.month_cost_usd)}</span></span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      </div>

      {(infra.volumes || []).length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(infra.volumes || []).map((v) => {
            const used = v.size_gb ? (v.used_gb / v.size_gb) * 100 : 0;
            return (
              <div key={v.name} className="rounded-[22px] border border-gray-200/80 bg-white p-[18px]">
                <div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100"><HardDrive size={15} strokeWidth={1.4} className="text-[#3a4557]" /></span><span className="truncate text-[12.5px] font-light text-gray-500">{v.name}</span></div>
                <p className="mt-3 text-[24px] font-light leading-none text-gray-900">{v.used_gb} <span className="text-[13px] text-gray-400">/ {v.size_gb} GB</span></p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full" style={{ width: `${Math.max(1, used)}%`, background: used > 80 ? "#e08a8a" : TEAL }} /></div>
                <p className="mt-1.5 text-[11.5px] font-light text-gray-400">{used < 1 ? "<1" : Math.round(used)}% used</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
