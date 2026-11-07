"use client";

/* Exit insights: what leavers say in exit interviews and why people leave. */
import { useEffect, useState } from "react";
import { MessageSquareQuote } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, PaperHeader, EmptyState } from "@/components/shell/page";
import { DateRangeInput, StatCard, type DateRange } from "@/components/ui-kit";
import { Bar } from "@/components/exits/parts";
import { errMsg } from "@/components/exits/types";

type Analytics = {
  responses: number;
  areas: { key: string; label: string; average: number | null; count: number }[];
  would_rejoin: { yes: number; no: number; maybe: number };
  enps: number | null;
  reasons: { reason: string; count: number }[];
  by_type: { type: string; label: string; count: number }[];
};

export default function ExitInsightsPage() {
  const toast = useToast();
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [a, setA] = useState<Analytics | null>(null);
  useEffect(() => {
    const p = new URLSearchParams();
    if (range.from) p.set("start", range.from);
    if (range.to) p.set("end", range.to);
    api.get<Analytics>(`/exits/analytics?${p}`).then(setA).catch((e) => toast.error(errMsg(e)));
  }, [range, toast]);

  const rejoinTotal = a ? a.would_rejoin.yes + a.would_rejoin.no + a.would_rejoin.maybe : 0;
  const maxReason = Math.max(1, ...(a?.reasons ?? []).map((r) => r.count));
  const maxType = Math.max(1, ...(a?.by_type ?? []).map((r) => r.count));

  return (
    <div>
      <PageHeader title="Exit insights" description="Ratings and reasons from exit interviews."
        actions={<div className="w-[280px]"><DateRangeInput value={range} onChange={setRange} /></div>} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Interviews answered" value={a?.responses ?? "—"} icon={MessageSquareQuote} />
        <StatCard label="Would work here again" value={rejoinTotal ? `${Math.round((100 * (a?.would_rejoin.yes ?? 0)) / rejoinTotal)}%` : "—"}
          hint={a ? `${a.would_rejoin.maybe} maybe · ${a.would_rejoin.no} no` : undefined} />
        <StatCard label="Leaver eNPS" value={a?.enps ?? "—"} hint="Promoters minus detractors, -100 to 100" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Paper>
          <PaperHeader title="Average rating by area" />
          <div className="space-y-4 p-5">
            {a?.areas.map((x) => (
              <Bar key={x.key} label={x.label} value={x.average} max={5} suffix=" / 5"
                tone={x.average === null ? "primary" : x.average < 2.5 ? "bad" : x.average < 3.5 ? "warn" : "good"} />
            ))}
            {a && !a.responses && <p className="text-[13px] text-muted">No interviews answered yet.</p>}
          </div>
        </Paper>
        <Paper>
          <PaperHeader title="Why people leave" />
          <div className="space-y-4 p-5">
            {a?.reasons.length ? a.reasons.map((r) => <Bar key={r.reason} label={r.reason} value={r.count} max={maxReason} />)
              : <EmptyState title="No reasons recorded yet" />}
          </div>
        </Paper>
        <Paper>
          <PaperHeader title="Exits by kind" />
          <div className="space-y-4 p-5">
            {a?.by_type.length ? a.by_type.map((r) => <Bar key={r.type} label={r.label} value={r.count} max={maxType} />)
              : <EmptyState title="No exits yet" />}
          </div>
        </Paper>
        <Paper>
          <PaperHeader title="Would they rejoin?" />
          <div className="space-y-4 p-5">
            <Bar label="Yes" value={a?.would_rejoin.yes ?? 0} max={Math.max(1, rejoinTotal)} tone="good" />
            <Bar label="Maybe" value={a?.would_rejoin.maybe ?? 0} max={Math.max(1, rejoinTotal)} tone="warn" />
            <Bar label="No" value={a?.would_rejoin.no ?? 0} max={Math.max(1, rejoinTotal)} tone="bad" />
          </div>
        </Paper>
      </div>
    </div>
  );
}
