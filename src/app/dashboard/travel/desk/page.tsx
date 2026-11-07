"use client";

/*
 * Travel desk: approved trips waiting for tickets and hotels, every trip with its bookings,
 * advances to pay, and reports (spend by department, project, employee or mode; policy
 * breaches). ?tab=book|all|reports, ?view=<uuid> opens a trip.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarClock, Luggage, Plane, Ticket, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Avatar, DataTable, DateRangeInput, Field, FilterBar, Select, StatCard, Tabs, type Column, type FilterValues } from "@/components/ui-kit";
import { errMsg, inr, type Page } from "@/components/payroll/common";
import { ModeIcons, TripDetailModal, TripStatus, type Trip } from "@/components/travel/trip-modals";

type Tab = "book" | "all" | "reports";

export default function TravelDeskPage() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = (params.get("tab") as Tab) || "book";
  const [sum, setSum] = useState<{ to_book: number; pending: number; on_trip_today: number; advances_to_pay: string } | null>(null);
  const loadSum = useCallback(() => { api.get<typeof sum>("/travel/summary").then(setSum).catch(() => {}); }, []);
  useEffect(() => { loadSum(); }, [loadSum]);
  const go = (t: Tab) => router.replace(`/dashboard/travel/desk${t === "book" ? "" : `?tab=${t}`}`, { scroll: false });
  return (
    <div>
      <PageHeader eyebrow="Payroll" title="Travel desk" description="Book tickets and hotels for approved trips, pay advances and watch travel spend." />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="To book" value={sum?.to_book ?? "—"} icon={Ticket} onClick={() => go("book")} />
        <StatCard label="Waiting for approval" value={sum?.pending ?? "—"} icon={CalendarClock} />
        <StatCard label="Travelling today" value={sum?.on_trip_today ?? "—"} icon={Plane} />
        <StatCard label="Advances to pay" value={inr(sum?.advances_to_pay ?? 0)} icon={Wallet} />
      </div>
      <Tabs value={tab} onChange={(t) => go(t as Tab)} className="mb-5"
        items={[{ value: "book", label: "To book" }, { value: "all", label: "All trips" }, { value: "reports", label: "Reports" }]} />
      {tab === "reports" ? <Reports /> : <Trips key={tab} toBook={tab === "book"} onChanged={loadSum} />}
    </div>
  );
}

function Trips({ toBook, onChanged }: { toBook: boolean; onChanged: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [filters, setFilters] = useState<FilterValues>({});
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Trip> | null>(null);
  const viewing = params.get("view");
  const load = useCallback(() => {
    const qs = new URLSearchParams({ scope: "all", page: String(page), size: "25" });
    if (toBook) qs.set("needs_booking", "true");
    if (filters.status?.length) qs.set("status", filters.status.join(","));
    if (filters.type?.length) qs.set("type", filters.type[0]);
    if (filters.policy?.length) qs.set("outside_policy", filters.policy[0]);
    if (q) qs.set("q", q);
    api.get<Page<Trip>>(`/travel/trips?${qs}`).then(setData).catch((e) => toast.error(errMsg(e)));
  }, [filters, q, page, toBook, toast]);
  useEffect(() => { load(); }, [load]);
  const columns: Column<Trip>[] = [
    { key: "who", header: "Traveller", cell: (t) => <span className="flex items-center gap-2"><Avatar name={t.employee_name ?? ""} size={26} /><span className="min-w-0"><span className="block text-ink">{t.employee_name}</span><span className="block text-[12px] text-faint">{t.department_name ?? ""}</span></span></span> },
    { key: "trip", header: "Trip", cell: (t) => <div className="min-w-0"><p className="truncate text-ink">{t.purpose}</p><p className="truncate text-[12.5px] text-faint">{t.number} · {t.route}</p></div> },
    { key: "when", header: "Leaves", cell: (t) => <span className="text-muted">{formatDate(t.start_date)}</span> },
    { key: "by", header: "By", hideBelow: "lg", cell: (t) => <ModeIcons modes={t.modes} /> },
    { key: "open", header: "Open", hideBelow: "md", align: "right", cell: (t) => <span className="tabular text-muted">{["approved", "booked"].includes(t.status) ? t.open_bookings : "—"}</span> },
    { key: "amt", header: "Estimated", align: "right", hideBelow: "sm", cell: (t) => <span className="tabular text-ink">{inr(t.estimated_total)}</span> },
    { key: "flag", header: "", cell: (t) => t.outside_policy ? <span title={t.policy_flags.map((f) => f.message).join("\n")}><AlertTriangle size={15} strokeWidth={1.4} className="text-amber-600" /></span> : null },
    { key: "st", header: "Status", cell: (t) => <TripStatus status={t.status} label={t.status_label} /> },
  ];
  const base = `/dashboard/travel/desk${toBook ? "" : "?tab=all"}`;
  return (
    <>
      <FilterBar searchPlaceholder="Search by purpose or number" onSearchChange={(x) => { setQ(x); setPage(1); }} values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[
          ...(toBook ? [] : [{ key: "status", label: "Status", multiple: true, options: [{ value: "pending", label: "Waiting" }, { value: "approved", label: "Approved" }, { value: "booked", label: "Booked" }, { value: "settling", label: "Claim in progress" }, { value: "settled", label: "Settled" }, { value: "cancelled", label: "Cancelled" }, { value: "rejected", label: "Rejected" }] }]),
          { key: "type", label: "Type", options: [{ value: "domestic", label: "Domestic" }, { value: "international", label: "International" }] },
          { key: "policy", label: "Policy", options: [{ value: "true", label: "Outside policy" }, { value: "false", label: "Within policy" }] },
        ]} />
      <DataTable rows={data?.items ?? []} rowKey={(t) => t.uuid} columns={columns} loading={!data}
        onRowClick={(t) => router.replace(`${base}${toBook ? "?" : "&"}view=${t.uuid}`, { scroll: false })}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }} emptyIcon={Luggage}
        emptyTitle={toBook ? "Nothing to book" : "No trips"} emptyHint={toBook ? "Approved trips that need tickets or hotels appear here." : undefined} />
      <TripDetailModal uuid={viewing} open={!!viewing} onClose={() => router.replace(base, { scroll: false })} onChanged={() => { load(); onChanged(); }} />
    </>
  );
}

type SpendRow = { key: string; label: string; trips: number; estimated: string; company_paid: string; claimed: string; actual: string; billable: string; outside_policy: number };

function fyStart() {
  const d = new Date(); const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
}

function Reports() {
  const toast = useToast();
  const [range, setRange] = useState(fyStart());
  const [by, setBy] = useState("department");
  const [spend, setSpend] = useState<{ rows: SpendRow[]; totals: { trips: number; spend: string; billable: string; outside_policy: number } } | null>(null);
  const [br, setBr] = useState<{ by_kind: { code: string; label: string; count: number }[]; trips: (Trip & { exception_reason: string | null })[] } | null>(null);
  useEffect(() => {
    const qs = `start=${range.from}&end=${range.to}`;
    api.get<typeof spend>(`/travel/reports/spend?by=${by}&${qs}`).then(setSpend).catch((e) => toast.error(errMsg(e)));
    api.get<typeof br>(`/travel/reports/breaches?${qs}`).then(setBr).catch(() => {});
  }, [range, by, toast]);
  const max = Math.max(1, ...(spend?.rows ?? []).map((r) => Number(r.actual)));
  const cols: Column<SpendRow>[] = [
    { key: "l", header: by === "mode" ? "Mode" : by === "type" ? "Type" : by.charAt(0).toUpperCase() + by.slice(1), cell: (r) => (
      <div className="min-w-[160px]"><p className="text-ink">{r.label}</p><div className="mt-1 h-1 rounded-full bg-sunken"><div className="h-1 rounded-full bg-primary/70" style={{ width: `${(Number(r.actual) / max) * 100}%` }} /></div></div>) },
    { key: "t", header: "Trips", align: "right", cell: (r) => <span className="tabular text-muted">{r.trips}</span> },
    { key: "c", header: "Booked by company", align: "right", hideBelow: "md", cell: (r) => <span className="tabular text-muted">{inr(r.company_paid)}</span> },
    { key: "cl", header: "Claimed", align: "right", hideBelow: "md", cell: (r) => <span className="tabular text-muted">{inr(r.claimed)}</span> },
    { key: "a", header: "Spend", align: "right", cell: (r) => <span className="tabular text-ink">{inr(r.actual)}</span> },
    { key: "b", header: "Billable", align: "right", hideBelow: "lg", cell: (r) => <span className="tabular text-muted">{inr(r.billable)}</span> },
    { key: "o", header: "Outside policy", align: "right", hideBelow: "lg", cell: (r) => <span className="tabular text-muted">{r.outside_policy}</span> },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Trips leaving between" className="w-72"><DateRangeInput value={range} onChange={(r) => r.from && r.to && setRange(r)} /></Field>
        <Field label="Group by" className="w-56"><Select value={by} onChange={(x) => setBy(x ?? "department")} options={[{ value: "department", label: "Department" }, { value: "project", label: "Project" },
          { value: "employee", label: "Employee" }, { value: "mode", label: "Mode of travel" }, { value: "type", label: "Domestic or international" }]} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Trips" value={spend?.totals.trips ?? "—"} icon={Luggage} />
        <StatCard label="Travel spend" value={inr(spend?.totals.spend ?? 0)} hint="Bookings plus approved claims; estimates for open trips" icon={Wallet} />
        <StatCard label="Billable to clients" value={inr(spend?.totals.billable ?? 0)} icon={Ticket} />
        <StatCard label="Outside policy" value={spend?.totals.outside_policy ?? "—"} icon={AlertTriangle} />
      </div>
      <Paper>
        <PaperHeader title="Spend" />
        <DataTable rows={spend?.rows ?? []} rowKey={(r) => r.key} columns={cols} loading={!spend} emptyIcon={Wallet} emptyTitle="No trips in this period" />
      </Paper>
      <Paper>
        <PaperHeader title="Policy breaches" />
        <div className="flex flex-wrap gap-2 px-5 pt-4">{(br?.by_kind ?? []).map((k) => <span key={k.code} className="rounded-full border border-line px-3 py-1 text-[13px] text-ink">{k.label} <span className="text-muted">· {k.count}</span></span>)}
          {br && !br.by_kind.length && <p className="pb-4 text-[13.5px] text-muted">No trips outside the policy in this period.</p>}</div>
        {!!br?.trips.length && <ul className="mt-3 divide-y divide-line border-t border-line">{br.trips.map((t) => (
          <li key={t.uuid} className="px-5 py-3">
            <div className="flex items-center justify-between gap-3"><p className="text-[14px] text-ink">{t.employee_name} · {t.purpose}</p><span className="text-[12.5px] text-faint">{formatDate(t.start_date)}</span></div>
            <p className="text-[12.5px] text-amber-700">{t.policy_flags.map((f) => f.message).join(" · ")}</p>
            {t.exception_reason && <p className="text-[12.5px] text-muted">Reason: {t.exception_reason}</p>}
          </li>))}</ul>}
      </Paper>
    </div>
  );
}
