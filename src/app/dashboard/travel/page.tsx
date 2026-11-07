"use client";

/*
 * My trips (self-service): plan a trip, follow its approval and bookings, download tickets,
 * and settle it after travelling (the trip becomes an expense claim set off against the
 * advance). ?view=<uuid> opens a trip, ?new=1 the planner. Also shows the travel band
 * (modes, classes, hotel limits and daily allowance) that applies to the person.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Luggage, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Button, DataTable, FilterBar, Tabs, type Column, type FilterValues } from "@/components/ui-kit";
import { errMsg, inr, type Page } from "@/components/payroll/common";
import { ModeIcons, TripDetailModal, TripFormModal, TripStatus, type Trip, useTravelOptions } from "@/components/travel/trip-modals";

type Band = { name: string; modes: Record<string, string[]>; hotel: Record<string, number>; per_diem: Record<string, number>; lead_days: Record<string, number> };

export default function MyTripsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const tab = params.get("tab") === "policy" ? "policy" : "trips";
  const [filters, setFilters] = useState<FilterValues>({});
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Trip> | null>(null);
  const [form, setForm] = useState<{ open: boolean; target: Trip | null; key: number }>({ open: params.get("new") === "1", target: null, key: 0 });
  const viewing = params.get("view");
  const load = useCallback(() => {
    const qs = new URLSearchParams({ scope: "mine", page: String(page), size: "25" });
    if (filters.status?.length) qs.set("status", filters.status.join(","));
    if (q) qs.set("q", q);
    api.get<Page<Trip>>(`/travel/trips?${qs}`).then(setData).catch((e) => toast.error(errMsg(e)));
  }, [filters, q, page, toast]);
  useEffect(() => { load(); }, [load]);
  const columns: Column<Trip>[] = [
    { key: "trip", header: "Trip", cell: (t) => <div className="min-w-0"><p className="truncate text-ink">{t.purpose}</p><p className="truncate text-[12.5px] text-faint">{t.route || "—"}</p></div> },
    { key: "when", header: "Dates", cell: (t) => <span className="text-muted">{formatDate(t.start_date)} – {formatDate(t.end_date)}</span> },
    { key: "by", header: "By", hideBelow: "md", cell: (t) => <ModeIcons modes={t.modes} /> },
    { key: "amt", header: "Estimated", align: "right", hideBelow: "sm", cell: (t) => <span className="tabular text-ink">{inr(t.estimated_total)}</span> },
    { key: "st", header: "Status", cell: (t) => <TripStatus status={t.status} label={t.status_label} /> },
  ];
  const go = (qs: string) => router.replace(`/dashboard/travel${qs}`, { scroll: false });
  return (
    <div>
      <PageHeader eyebrow="Home" title="My trips" description="Plan work travel, get it approved and booked, then settle it as a claim."
        actions={<Button variant="primary" icon={Plus} onClick={() => setForm({ open: true, target: null, key: form.key + 1 })}>Plan a trip</Button>} />
      <Tabs value={tab} onChange={(t) => go(t === "trips" ? "" : `?tab=${t}`)} className="mb-5"
        items={[{ value: "trips", label: "Trips" }, { value: "policy", label: "My travel policy" }]} />
      {tab === "trips" ? (<>
        <FilterBar searchPlaceholder="Search trips" onSearchChange={(x) => { setQ(x); setPage(1); }} values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
          filters={[{ key: "status", label: "Status", multiple: true, options: [{ value: "draft", label: "Draft" }, { value: "pending", label: "Waiting" }, { value: "approved", label: "Approved" },
            { value: "booked", label: "Booked" }, { value: "settling", label: "Claim in progress" }, { value: "settled", label: "Settled" }, { value: "rejected", label: "Rejected" }] }]} />
        <DataTable rows={data?.items ?? []} rowKey={(t) => t.uuid} columns={columns} loading={!data} onRowClick={(t) => go(`?view=${t.uuid}`)}
          pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }} emptyIcon={Luggage} emptyTitle="No trips yet"
          emptyHint="Plan your next work trip; the travel desk books it once it is approved." />
      </>) : <MyPolicy />}
      <TripFormModal key={form.key} open={form.open} target={form.target} onClose={() => setForm({ ...form, open: false })}
        onSaved={(t) => { setForm({ ...form, open: false }); load(); go(`?view=${t.uuid}`); }} />
      <TripDetailModal uuid={viewing} open={!!viewing} onClose={() => go("")} onChanged={load}
        onEdit={(t) => { go(""); setForm({ open: true, target: t, key: form.key + 1 }); }} />
    </div>
  );
}

function MyPolicy() {
  const modes = useTravelOptions();
  const [p, setP] = useState<{ grade: string | null; band: Band; advance_max_percent: number } | null>(null);
  useEffect(() => { api.get<typeof p>("/travel/policy/for-me").then(setP).catch(() => {}); }, []);
  if (!p) return <p className="py-10 text-center text-muted">Loading…</p>;
  const tiers = ["X", "Y", "Z", "international"];
  const tierLabel = (t: string) => (t === "international" ? "International" : `Tier ${t}`);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Paper>
        <PaperHeader title={`How you can travel · ${p.band.name}`} />
        <ul className="divide-y divide-line">
          {modes.map((m) => {
            const allowed = p.band.modes?.[m.value];
            return (
              <li key={m.value} className="flex items-center justify-between px-5 py-3 text-[14px]">
                <span className="text-ink">{m.label}</span>
                <span className="text-right text-muted">{allowed ? (allowed.length ? allowed.map((c) => m.classes.find((x) => x.value === c)?.label ?? c).join(", ") : "Any class") : "Not allowed"}</span>
              </li>);
          })}
        </ul>
      </Paper>
      <Paper>
        <PaperHeader title="Hotel and daily allowance" />
        <table className="w-full text-[14px]">
          <thead><tr className="text-left text-[12.5px] text-muted"><th className="px-5 py-2 font-normal">City</th><th className="px-5 py-2 text-right font-normal">Hotel a night</th><th className="px-5 py-2 text-right font-normal">Daily allowance</th></tr></thead>
          <tbody className="divide-y divide-line">{tiers.map((t) => (
            <tr key={t}><td className="px-5 py-2.5 text-ink">{tierLabel(t)}</td><td className="tabular px-5 py-2.5 text-right text-ink">{inr(p.band.hotel?.[t])}</td><td className="tabular px-5 py-2.5 text-right text-ink">{inr(p.band.per_diem?.[t])}</td></tr>))}</tbody>
        </table>
        <p className="border-t border-line px-5 py-3 text-[13px] text-muted">Ask at least {p.band.lead_days?.domestic ?? 0} days ahead for trips in India and {p.band.lead_days?.international ?? 0} days for trips abroad. Advances up to {p.advance_max_percent}% of the estimated cost.</p>
      </Paper>
    </div>
  );
}
