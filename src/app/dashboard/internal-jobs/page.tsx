"use client";

/*
 * Internal jobs: everyone browses open jobs and gigs inside the company (with their own
 * skills match) and applies; HR and hiring managers post, follow applications and move the
 * chosen person. Details and forms open in modals.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Briefcase, ClipboardList, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Badge, Button, DataTable, FilterBar, Skeleton, Tabs, formatDisplayDate, type Column, type FilterValues } from "@/components/ui-kit";
import { PostingCard, PostingDetail, PostingForm } from "@/components/positions/marketplace-modals";
import { PersonCell, StatusBadge, usePositionsMeta } from "@/components/positions/shared";
import type { Page, Posting } from "@/components/positions/types";

export default function InternalJobsPage() {
  const meta = usePositionsMeta();
  const params = useSearchParams();
  const router = useRouter();
  const [manages, setManages] = useState(false);
  const [tab, setTabState] = useState<"browse" | "manage">(params.get("tab") === "manage" ? "manage" : "browse");
  const [viewing, setViewing] = useState<string | null>(params.get("view"));
  const [editing, setEditing] = useState<{ posting: Posting | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const setTab = (t: "browse" | "manage") => { setTabState(t); router.replace(`/dashboard/internal-jobs${t === "manage" ? "?tab=manage" : ""}`, { scroll: false }); };

  useEffect(() => {
    if (!meta) return;
    if (meta.can_marketplace) { setManages(true); return; }
    api.get<Page<Posting>>("/internal-jobs/postings?scope=manage&size=1").then((r) => setManages(r.total > 0)).catch(() => {});
  }, [meta]);

  if (!meta) return <div><PageHeader title="Internal jobs" /><Skeleton className="h-80 rounded-2xl" /></div>;
  return (
    <div>
      <PageHeader title="Internal jobs" description="Roles and short projects open to people already in the company."
        actions={<>
          {meta.has_employee && <Link href="/dashboard/internal-jobs/my"><Button icon={ClipboardList}>My applications</Button></Link>}
          {meta.can_marketplace && <Button variant="primary" icon={Plus} onClick={() => setEditing({ posting: null })}>Post a job or gig</Button>}
        </>} />
      {!meta.marketplace_enabled && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[13.5px] text-amber-800">The internal job marketplace is switched off. HR can switch it on in Positions settings.</p>}
      {manages && <Tabs className="mb-5" value={tab} onChange={setTab} items={[{ value: "browse", label: "Open now" }, { value: "manage", label: meta.can_marketplace ? "All postings" : "My postings" }]} />}
      {tab === "browse" || !manages ? <Browse nonce={nonce} onOpen={setViewing} /> : <Manage nonce={nonce} onOpen={setViewing} />}
      <PostingDetail uuid={viewing} onClose={() => setViewing(null)} onChanged={refresh} onEdit={(p) => setEditing({ posting: p })} />
      <PostingForm open={!!editing} posting={editing?.posting ?? null} onClose={() => setEditing(null)}
        onSaved={(p) => { setEditing(null); refresh(); setViewing(null); setTimeout(() => setViewing(p.uuid), 0); }} />
    </div>
  );
}

function Browse({ nonce, onOpen }: { nonce: number; onOpen: (uuid: string) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Posting[] | null>(null);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  useEffect(() => {
    const p = new URLSearchParams({ size: "100" });
    if (q) p.set("q", q);
    if (filters.kind?.length) p.set("kind", filters.kind[0]);
    api.get<Page<Posting>>(`/internal-jobs/postings?${p}`).then((r) => setRows(r.items)).catch((e) => toast.error(e.message));
  }, [q, filters, nonce, toast]);
  const sorted = [...(rows ?? [])].sort((a, b) => (filters.sort?.[0] === "match" ? (b.my_match ?? -1) - (a.my_match ?? -1) : 0));
  return (
    <div>
      <FilterBar className="mb-5" search={q} onSearchChange={setQ} searchPlaceholder="Search jobs and gigs"
        filters={[
          { key: "kind", label: "Kind", options: [{ value: "job", label: "Jobs" }, { value: "gig", label: "Gigs and projects" }] },
          { key: "sort", label: "Sort", options: [{ value: "match", label: "Best match for me" }] },
        ]} values={filters} onChange={setFilters} />
      {!rows ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-2xl" />)}</div>
        : !sorted.length ? <Paper><EmptyState icon={Search} title="Nothing open right now" hint="New internal jobs and gigs show up here. Keep your skills up to date to see how well you match." /></Paper>
          : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{sorted.map((p) => <PostingCard key={p.uuid} p={p} onOpen={() => onOpen(p.uuid)} />)}</div>}
    </div>
  );
}

function Manage({ nonce, onOpen }: { nonce: number; onOpen: (uuid: string) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Posting[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  useEffect(() => {
    const p = new URLSearchParams({ scope: "manage", page: String(page), size: "25" });
    if (q) p.set("q", q);
    if (filters.kind?.length) p.set("kind", filters.kind[0]);
    if (filters.status?.length) p.set("status", filters.status.join(","));
    api.get<Page<Posting>>(`/internal-jobs/postings?${p}`).then((r) => { setRows(r.items); setTotal(r.total); }).catch((e) => toast.error(e.message));
  }, [q, filters, page, nonce, toast]);
  const columns: Column<Posting>[] = [
    { key: "title", header: "Posting", cell: (r) => (
      <div className="min-w-0"><p className="truncate text-ink">{r.title}</p><p className="truncate text-[12px] text-faint">{[r.number, r.department, r.position?.code].filter(Boolean).join(" · ")}</p></div>) },
    { key: "kind", header: "Kind", cell: (r) => <Badge tone={r.kind === "gig" ? "info" : "accent"}>{r.kind === "gig" ? `Gig · ${r.duration_weeks}w` : "Job"}</Badge> },
    { key: "hm", header: "Hiring manager", hideBelow: "md", cell: (r) => <PersonCell person={r.hiring_manager} size={24} /> },
    { key: "apps", header: "Applications", align: "right", cell: (r) => <span className="tabular">{r.applications}</span> },
    { key: "closes", header: "Closes", hideBelow: "lg", cell: (r) => <span className={r.closing_soon ? "text-amber-700" : "text-muted"}>{r.closes_on ? formatDisplayDate(r.closes_on) : "—"}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} label={r.status_label} /> },
  ];
  return (
    <div>
      <FilterBar className="mb-4" search={q} onSearchChange={setQ} searchPlaceholder="Search postings"
        filters={[
          { key: "kind", label: "Kind", options: [{ value: "job", label: "Jobs" }, { value: "gig", label: "Gigs" }] },
          { key: "status", label: "Status", multiple: true, options: [{ value: "draft", label: "Draft" }, { value: "open", label: "Open" }, { value: "closed", label: "Closed" }, { value: "filled", label: "Filled" }, { value: "cancelled", label: "Cancelled" }] },
        ]} values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={rows ?? []} columns={columns} rowKey={(r) => r.uuid} loading={!rows} onRowClick={(r) => onOpen(r.uuid)}
        emptyTitle="No postings yet" emptyHint="Post a job from an approved hiring request or a vacant position, or a short gig." emptyIcon={Briefcase}
        pagination={{ page, size: 25, total, onPageChange: setPage }} />
    </div>
  );
}
