"use client";

/*
 * Offers: every offer with its status; a row opens the offer details.
 */
import { useEffect, useState } from "react";
import { FileSignature } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import { Badge, DataTable, FilterBar, formatDisplayDate, type Column, type FilterValues } from "@/components/ui-kit";
import { useHiringMeta } from "@/components/recruitment/common";
import { OfferModal } from "@/components/recruitment/offers";
import { OFFER_TONE, errText, lakhs, type Offer, type Page } from "@/components/recruitment/types";

export default function OffersPage() {
  const toast = useToast();
  const meta = useHiringMeta();
  const [data, setData] = useState<(Page<Offer> & { counts: Record<string, number> }) | null>(null);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const p = new URLSearchParams({ page: String(page), size: "25" });
    if (q) p.set("q", q);
    if (filters.status?.length) p.set("status", filters.status.join(","));
    api.get<Page<Offer> & { counts: Record<string, number> }>(`/recruitment/offers?${p}`).then(setData).catch((e) => toast.error(errText(e)));
  }, [q, filters, page, nonce, toast]);

  const columns: Column<Offer>[] = [
    { key: "c", header: "Candidate", cell: (o) => <div><p className="text-ink">{o.candidate_name}</p><p className="text-[12.5px] text-faint">{o.number}</p></div> },
    { key: "job", header: "Job", cell: (o) => <span className="text-muted">{o.job_title}</span> },
    { key: "ctc", header: "CTC", align: "right", cell: (o) => <span className="tabular">{lakhs(o.annual_ctc)}{o.outside_band && <span className="ml-1 text-amber-600" title="Outside the band">•</span>}</span> },
    { key: "join", header: "Joining", cell: (o) => <span className="text-muted">{formatDisplayDate(o.joining_date)}</span>, hideBelow: "md" },
    { key: "exp", header: "Open until", cell: (o) => o.status === "sent" && o.expires_on ? <span className={o.days_left !== null && o.days_left <= 2 ? "text-amber-700" : "text-muted"}>{formatDisplayDate(o.expires_on)}</span> : <span className="text-faint">—</span>, hideBelow: "lg" },
    { key: "s", header: "Status", cell: (o) => <Badge tone={OFFER_TONE[o.status] ?? "neutral"} dot>{o.status_label}</Badge> },
  ];
  const counts = data?.counts ?? {};
  const statuses = Object.entries(meta?.offer_statuses ?? {}).map(([value, label]) => ({ value, label: `${label}${counts[value] ? ` (${counts[value]})` : ""}` }));
  const sent = (counts.sent ?? 0) + (counts.accepted ?? 0) + (counts.declined ?? 0) + (counts.expired ?? 0);
  return (
    <div>
      <PageHeader title="Offers" description="Prepare offers from a candidate's profile. Offers outside the salary band go for approval." />
      <div className="mb-5 flex flex-wrap gap-2">
        {[["Waiting for approval", counts.pending_approval], ["Out with candidates", counts.sent], ["Accepted", counts.accepted], ["Declined", counts.declined]].map(([l, n]) => (
          <span key={String(l)} className="rounded-full border border-line px-3 py-1 text-[13px] text-muted">{l} <span className="tabular text-ink">{n ?? 0}</span></span>
        ))}
        {sent > 0 && <span className="rounded-full border border-line px-3 py-1 text-[13px] text-muted">Acceptance <span className="tabular text-ink">{Math.round(100 * (counts.accepted ?? 0) / Math.max(1, sent - (counts.sent ?? 0)))}%</span></span>}
      </div>
      <FilterBar searchPlaceholder="Search by candidate or offer number" onSearchChange={(x) => { setQ(x); setPage(1); }}
        filters={[{ key: "status", label: "Status", options: statuses, multiple: true }]} values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={data?.items ?? []} columns={columns} rowKey={(o) => o.uuid} loading={!data} onRowClick={(o) => setOpen(o.uuid)}
        emptyIcon={FileSignature} emptyTitle="No offers yet" emptyHint="Open a candidate and choose Prepare offer."
        pagination={data ? { page: data.page, size: data.size, total: data.total, onPageChange: setPage } : undefined} />
      <OfferModal uuid={open} onClose={() => setOpen(null)} onChanged={() => setNonce((n) => n + 1)} />
    </div>
  );
}
