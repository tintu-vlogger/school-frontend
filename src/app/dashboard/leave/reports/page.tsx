"use client";

/*
 * Leave reports: balances (by employee and type), leave taken by type and department,
 * loss of pay for a pay period (what payroll reads) and who is away on a day.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, BarChart3, BellRing, CalendarX2, Download, Scale, UserX, Wallet } from "lucide-react";
import { api, API_BASE } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatMonth } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import { Badge, Button, DataTable, DateInput, DateRangeInput, FilterBar, Modal, Select, StatCard, Tabs, Timeline, paginate, type BadgeTone } from "@/components/ui-kit";
import { LeaveNav, useLeaveAccess } from "@/components/leave/leave-nav";
import { StatusBadge, TypeDot, fmtDays } from "@/components/leave/leave-ui";

type Tab = "balances" | "taken" | "lop" | "absentees" | "bradford";

async function download(path: string, name: string) {
  const token = localStorage.getItem("hrms_token");
  const r = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new Error("Couldn't download");
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
}

type BfRow = { employee_id: number; employee_uuid: string; employee_code: string; employee_name: string; department: string; spells: number;
  days: number; score: number; level: number; label: string | null; spell_list: { from: string; to: string; days: number }[] };
type Bf = { as_of: string; from: string; window_weeks: number; levels: { score: number; label: string }[]; type_codes: string[]; include_absent: boolean; rows: BfRow[] };

const LEVEL_TONES: BadgeTone[] = ["neutral", "info", "warn", "bad", "bad"];

function BradfordReport({ today }: { today?: string }) {
  const toast = useToast();
  const [asOf, setAsOf] = useState("");
  const [data, setData] = useState<Bf | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<BfRow | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (today && !asOf) setAsOf(today); }, [today, asOf]);
  useEffect(() => {
    if (!asOf) return;
    setData(null);
    api.get<Bf>(`/leave/reports/bradford?as_of=${asOf}`).then(setData).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load"));
  }, [asOf, toast]);
  async function alerts() {
    setBusy(true);
    try {
      const r = await api.post<{ alerts: number }>("/leave/bradford/alerts/run");
      toast.success(r.alerts ? `${r.alerts} new ${r.alerts === 1 ? "alert" : "alerts"} sent` : "No one reached a new level");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send"); } finally { setBusy(false); }
  }
  const rows = (data?.rows ?? []).filter((r) => !q || `${r.employee_name} ${r.employee_code}`.toLowerCase().includes(q.toLowerCase()));
  const tone = (lvl: number) => LEVEL_TONES[Math.min(lvl, LEVEL_TONES.length - 1)];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-4">
          <div className="w-56"><DateInput value={asOf} onChange={setAsOf} /></div>
          {data && <p className="pb-2 text-[13px] text-muted">{formatDate(data.from)} – {formatDate(data.as_of)} · {data.window_weeks} weeks · {data.type_codes.join(", ")}{data.include_absent ? " and absent days" : ""}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={BellRing} loading={busy} onClick={alerts}>Send alerts now</Button>
          <Button variant="secondary" icon={Download} disabled={!asOf} onClick={() => download(`/leave/reports/bradford?as_of=${asOf}&format=csv`, `bradford-${asOf}.csv`).catch(() => toast.error("Couldn't download"))}>Export</Button>
        </div>
      </div>
      {data && data.levels.length > 0 && (
        <div className="flex flex-wrap gap-2 text-[12.5px] text-muted">
          {data.levels.map((l, i) => <Badge key={l.score} tone={tone(i + 1)}>{l.score}+ · {l.label}</Badge>)}
        </div>
      )}
      <FilterBar onSearchChange={(v) => { setQ(v); setPage(1); }} searchPlaceholder="Search employees" />
      <DataTable rows={paginate(rows, page, 25)} loading={data === null} rowKey={(r) => r.employee_uuid} onRowClick={setOpen}
        columns={[
          { key: "who", header: "Employee", cell: (r) => <span><span className="text-ink">{r.employee_name}</span><span className="block text-[12px] text-faint">{[r.employee_code, r.department].filter(Boolean).join(" · ")}</span></span> },
          { key: "spells", header: "Spells", align: "right", cell: (r) => <span className="tabular text-muted">{r.spells}</span> },
          { key: "days", header: "Days", align: "right", cell: (r) => <span className="tabular text-muted">{fmtDays(r.days, true)}</span> },
          { key: "score", header: "Score", align: "right", sortable: true, sortValue: (r) => r.score, cell: (r) => <span className="tabular text-ink">{r.score}</span> },
          { key: "level", header: "Level", cell: (r) => r.label ? <Badge tone={tone(r.level)} dot>{r.label}</Badge> : <span className="text-faint">—</span> },
        ]}
        pagination={{ page, size: 25, total: rows.length, onPageChange: setPage }}
        emptyIcon={Activity} emptyTitle="No unplanned absence in this window" />
      <p className="text-[12px] text-faint">Score = spells × spells × days. Days next to each other or with only weekly offs and holidays between them are one spell.</p>
      <Modal open={!!open} onClose={() => setOpen(null)} size="md" title={open?.employee_name} description={open ? `Score ${open.score} · ${open.spells} spells · ${fmtDays(open.days)}` : undefined}>
        {open && <Timeline items={open.spell_list.slice().reverse().map((sp, i) => ({
          id: String(i), title: sp.from === sp.to ? formatDate(sp.from) : `${formatDate(sp.from, { year: undefined })} – ${formatDate(sp.to)}`,
          description: fmtDays(sp.days),
        }))} />}
      </Modal>
    </div>
  );
}

export default function LeaveReportsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const access = useLeaveAccess();
  const tab = (params.get("tab") as Tab) || "balances";
  const setTab = (t: Tab) => router.replace(`/dashboard/leave/reports${t === "balances" ? "" : `?tab=${t}`}`, { scroll: false });
  return (
    <div>
      <PageHeader eyebrow="Time" title="Leave reports" description="Balances, leave taken, loss of pay for payroll and who is away." />
      <LeaveNav access={access} />
      <Tabs<Tab> value={tab} onChange={setTab} className="mb-5" items={[
        { value: "balances", label: "Balances", icon: Scale }, { value: "taken", label: "Leave taken", icon: BarChart3 },
        { value: "lop", label: "Loss of pay", icon: Wallet }, { value: "absentees", label: "Away today", icon: UserX },
        { value: "bradford", label: "Bradford score", icon: Activity },
      ]} />
      {tab === "balances" && <BalanceReport />}
      {tab === "taken" && <TakenReport />}
      {tab === "lop" && <LopReport today={access?.today} />}
      {tab === "absentees" && <Absentees today={access?.today} />}
      {tab === "bradford" && <BradfordReport today={access?.today} />}
    </div>
  );
}

type BalRow = { employee_uuid: string; employee_code: string; employee_name: string; department: string; leave_type: string; leave_type_name: string;
  year: number; opening: number; earned: number; taken: number; adjusted: number; encashed: number; lapsed: number; balance: number };

function BalanceReport() {
  const toast = useToast();
  const [rows, setRows] = useState<BalRow[] | null>(null);
  const [types, setTypes] = useState<{ code: string; name: string; color: string }[]>([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  useEffect(() => {
    api.get<{ rows: BalRow[]; types: { code: string; name: string; color: string }[] }>("/leave/reports/balances")
      .then((r) => { setRows(r.rows); setTypes(r.types); }).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load"));
  }, [toast]);
  const color = Object.fromEntries(types.map((t) => [t.code, t.color]));
  const filtered = (rows ?? []).filter((r) => (!q || `${r.employee_name} ${r.employee_code}`.toLowerCase().includes(q.toLowerCase())) && (!type.length || type.includes(r.leave_type)));
  return (
    <>
      <FilterBar onSearchChange={(v) => { setQ(v); setPage(1); }} searchPlaceholder="Search employees"
        filters={[{ key: "type", label: "Leave type", multiple: true, options: types.map((t) => ({ value: t.code, label: t.name })) }]}
        values={{ type }} onChange={(v) => { setType(v.type ?? []); setPage(1); }}
        actions={<Button variant="secondary" icon={Download} onClick={() => download("/leave/reports/balances?format=csv", "leave-balances.csv").catch(() => toast.error("Couldn't download"))}>Export</Button>} />
      <DataTable rows={paginate(filtered, page, 25)} loading={rows === null} rowKey={(r) => r.employee_uuid + r.leave_type}
        columns={[
          { key: "who", header: "Employee", sortable: true, sortValue: (r) => r.employee_name, cell: (r) => <span><span className="text-ink">{r.employee_name}</span><span className="block text-[12px] text-faint">{[r.employee_code, r.department].filter(Boolean).join(" · ")}</span></span> },
          { key: "type", header: "Leave", cell: (r) => <TypeDot color={color[r.leave_type] ?? "#999"} label={r.leave_type_name} /> },
          ...(["opening", "earned", "taken", "encashed", "lapsed"] as const).map((k) => ({ key: k, header: k[0].toUpperCase() + k.slice(1), align: "right" as const, hideBelow: "md" as const,
            cell: (r: BalRow) => <span className="tabular text-muted">{fmtDays(r[k], true)}</span> })),
          { key: "balance", header: "Balance", align: "right", sortable: true, sortValue: (r) => r.balance, cell: (r) => <span className={`tabular ${r.balance < 0 ? "text-rose-600" : "text-ink"}`}>{fmtDays(r.balance, true)}</span> },
        ]}
        pagination={{ page, size: 25, total: filtered.length, onPageChange: setPage }} emptyTitle="No balances yet" />
    </>
  );
}

type Taken = { total: number; types: { code: string; name: string; color: string }[]; by_type: { code: string; name: string; color: string; days: number; people: number }[];
  by_department: { department: string; total: number; by_type: Record<string, number> }[] };

function TakenReport() {
  const toast = useToast();
  const y = new Date().getFullYear();
  const [range, setRange] = useState({ from: `${y}-01-01`, to: `${y}-12-31` });
  const [data, setData] = useState<Taken | null>(null);
  useEffect(() => {
    if (!range.from || !range.to) return;
    setData(null);
    api.get<Taken>(`/leave/reports/taken?from=${range.from}&to=${range.to}`).then(setData).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load"));
  }, [range, toast]);
  const max = Math.max(1, ...(data?.by_type.map((t) => t.days) ?? [1]));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-72"><DateRangeInput value={range} onChange={setRange} /></div>
        <Button variant="secondary" icon={Download} onClick={() => download(`/leave/reports/taken?from=${range.from}&to=${range.to}&format=csv`, "leave-taken.csv").catch(() => toast.error("Couldn't download"))}>Export</Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-[13px] text-muted">Approved leave</p>
          <p className="tabular mt-1 text-[34px] font-extralight text-ink">{data ? fmtDays(data.total) : "–"}</p>
          <ul className="mt-5 space-y-3">
            {data?.by_type.map((t) => (
              <li key={t.code}>
                <div className="flex justify-between text-[13px]"><TypeDot color={t.color} label={t.name} /><span className="tabular text-muted">{fmtDays(t.days, true)} · {t.people} people</span></div>
                <div className="mt-1.5 h-1.5 rounded-full bg-sunken"><div className="h-full rounded-full" style={{ width: `${(t.days / max) * 100}%`, background: t.color, opacity: 0.75 }} /></div>
              </li>
            ))}
            {data && !data.by_type.length && <li className="text-[13px] text-faint">No leave taken in these dates.</li>}
          </ul>
        </section>
        <DataTable rows={data?.by_department ?? []} loading={data === null} rowKey={(r) => r.department}
          columns={[
            { key: "dept", header: "Department", cell: (r) => <span className="text-ink">{r.department}</span> },
            ...(data?.types ?? []).map((t) => ({ key: t.code, align: "right" as const, header: <span title={t.name}>{t.code}</span>,
              cell: (r: Taken["by_department"][number]) => <span className="tabular text-muted">{r.by_type[t.code] ? fmtDays(r.by_type[t.code], true) : "—"}</span> })),
            { key: "total", header: "Total", align: "right", cell: (r) => <span className="tabular text-ink">{fmtDays(r.total, true)}</span> },
          ]} emptyTitle="No leave taken in these dates" />
      </div>
    </div>
  );
}

type Lop = { from: string; to: string; total: number; pending: number; rows: { employee_uuid: string; employee_code: string; employee_name: string; department: string;
  lop_days: number; pending_days: number; dates: { date: string; days: number; leave_type: string; status: string }[] }[] };

function LopReport({ today }: { today?: string }) {
  const toast = useToast();
  const [period, setPeriod] = useState<string | null>(null);
  const [data, setData] = useState<Lop | null>(null);
  useEffect(() => { if (today && !period) setPeriod(today.slice(0, 7)); }, [today, period]);
  const load = useCallback(() => {
    if (!period) return;
    setData(null);
    api.get<Lop>(`/leave/reports/lop?period=${period}`).then(setData).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load"));
  }, [period, toast]);
  useEffect(() => { load(); }, [load]);
  const months = Array.from({ length: 13 }, (_, i) => {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1 - i);
    const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { value: v, label: formatMonth(`${v}-15`) };
  });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-60"><Select value={period} onChange={(v) => setPeriod(v)} options={months} placeholder="Pay period" /></div>
        <Button variant="secondary" icon={Download} disabled={!period} onClick={() => download(`/leave/reports/lop?period=${period}&format=csv`, `lop-${period}.csv`).catch(() => toast.error("Couldn't download"))}>Export for payroll</Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Loss-of-pay days" value={data ? fmtDays(data.total, true) : "–"} icon={Wallet} hint={data ? `${formatDate(data.from)} – ${formatDate(data.to)}` : undefined} />
        <StatCard label="People" value={data ? data.rows.filter((r) => r.lop_days > 0).length : "–"} icon={UserX} />
        <StatCard label="Still pending" value={data ? fmtDays(data.pending, true) : "–"} icon={CalendarX2} hint="decide these before payroll" />
      </div>
      <DataTable rows={data?.rows ?? []} loading={data === null} rowKey={(r) => r.employee_uuid}
        columns={[
          { key: "who", header: "Employee", cell: (r) => <span><span className="text-ink">{r.employee_name}</span><span className="block text-[12px] text-faint">{[r.employee_code, r.department].filter(Boolean).join(" · ")}</span></span> },
          { key: "dates", header: "Dates", hideBelow: "md", cell: (r) => <span className="text-[12.5px] text-muted">{r.dates.map((d) => `${formatDate(d.date, { year: undefined })}${d.days !== 1 ? ` (${d.days})` : ""}${d.status === "pending" ? "*" : ""}`).join(", ")}</span> },
          { key: "lop", header: "LOP days", align: "right", cell: (r) => <span className="tabular text-ink">{fmtDays(r.lop_days, true)}</span> },
          { key: "pending", header: "Pending", align: "right", cell: (r) => <span className="tabular text-amber-700">{r.pending_days ? fmtDays(r.pending_days, true) : "—"}</span> },
        ]} emptyIcon={Wallet} emptyTitle="No loss of pay in this period" />
      <p className="text-[12px] text-faint">* still waiting for approval. Payroll uses approved days only.</p>
    </div>
  );
}

type Away = { date: string; on_leave: number; pending: number; rows: { employee_uuid: string; employee_name: string; department: string; leave_type_name: string; color: string;
  amount: number; part: string | null; status: string; from_date: string; to_date: string }[] };

function Absentees({ today }: { today?: string }) {
  const [day, setDay] = useState("");
  const [data, setData] = useState<Away | null>(null);
  useEffect(() => { if (today && !day) setDay(today); }, [today, day]);
  useEffect(() => { if (day) { setData(null); api.get<Away>(`/leave/reports/absentees?day=${day}`).then(setData).catch(() => {}); } }, [day]);
  return (
    <div className="space-y-5">
      <div className="flex items-end gap-4">
        <div className="w-56"><DateInput value={day} onChange={setDay} /></div>
        {data && <p className="pb-2 text-[13.5px] text-muted">{data.on_leave} on leave{data.pending ? ` · ${data.pending} waiting for approval` : ""}</p>}
      </div>
      <DataTable rows={data?.rows ?? []} loading={data === null} rowKey={(r) => r.employee_uuid + r.from_date}
        columns={[
          { key: "who", header: "Employee", cell: (r) => <span><span className="text-ink">{r.employee_name}</span><span className="block text-[12px] text-faint">{r.department}</span></span> },
          { key: "type", header: "Leave", cell: (r) => <TypeDot color={r.color} label={`${r.leave_type_name}${r.amount < 1 ? ` (${r.part === "second" ? "second" : "first"} half)` : ""}`} /> },
          { key: "dates", header: "Away", hideBelow: "md", cell: (r) => <span className="text-muted">{formatDate(r.from_date, { year: undefined })} – {formatDate(r.to_date)}</span> },
          { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
        ]} emptyIcon={UserX} emptyTitle="Everyone is in" />
    </div>
  );
}
