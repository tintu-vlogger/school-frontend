"use client";

/*
 * Services: every custom service the person may use (training, ID card, visitor pass …)
 * with one-click "New request", and "My requests" across all of them.
 * ?new=<code> opens the request form, ?view=<uuid> a request's details.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Inbox, Plus, Settings2, Shapes } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { formatDate } from "@/lib/datetime";
import { EmptyState, PageHeader } from "@/components/shell/page";
import { Badge, Button, DataTable, FilterBar, Skeleton, Tabs, type FilterValues } from "@/components/ui-kit";
import { RecordModal, SubmitModal } from "@/components/custom_forms/record-modals";
import { serviceIcon } from "@/components/custom_forms/icons";
import type { Page, RecordRow, ServiceBrief } from "@/components/custom_forms/types";

type CatalogItem = ServiceBrief & { can_submit: boolean; can_handle: boolean; my_open: number; my_drafts: number };

export default function ServicesPage() {
  return <Suspense fallback={null}><ServicesInner /></Suspense>;
}

function ServicesInner() {
  const access = useAccess();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [tab, setTab] = useState<"services" | "mine">(params.get("tab") === "mine" ? "mine" : "services");
  const [rows, setRows] = useState<Page<RecordRow> | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);

  const setParams = useCallback((next: Record<string, string | null>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) { if (v === null) sp.delete(k); else sp.set(k, v); }
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);
  const newCode = params.get("new");
  const viewId = params.get("view");

  useEffect(() => { api.get<CatalogItem[]>("/custom-forms/catalog").then(setItems).catch(() => setItems([])); }, [nonce]);
  useEffect(() => {
    if (tab !== "mine") return;
    setLoading(true);
    const sp = new URLSearchParams({ page: String(page), size: "25" });
    if (q) sp.set("q", q);
    if (filters.state?.[0]) sp.set("status", filters.state[0]);
    if (filters.service?.[0]) sp.set("service", filters.service[0]);
    api.get<Page<RecordRow>>(`/custom-forms/my-requests?${sp}`).then(setRows).catch(() => setRows({ items: [], total: 0, page: 1, size: 25 }))
      .finally(() => setLoading(false));
  }, [tab, page, q, filters, nonce]);

  const refresh = () => setNonce((n) => n + 1);
  const closeView = useCallback(() => setParams({ view: null }), [setParams]);
  const canDesign = access.can("settings.services.manage");
  const openCount = items?.reduce((n, s) => n + s.my_open, 0) ?? 0;

  return (
    <div>
      <PageHeader eyebrow="Home" title="Services" description="Ask for what you need: training, ID cards, visitor passes and more. Follow each request here."
        actions={canDesign ? <Link href="/dashboard/settings/services"><Button icon={Settings2}>Set up services</Button></Link> : undefined} />
      <Tabs value={tab} onChange={(t) => { setTab(t); setParams({ tab: t === "mine" ? "mine" : null }); }} className="mb-5" items={[
        { value: "services", label: "All services", count: items?.length },
        { value: "mine", label: "My requests", count: openCount || undefined },
      ]} />

      {tab === "services" && (
        items === null ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)}</div>
          : items.length === 0 ? (
            <EmptyState icon={Shapes} title="No services yet" hint={canDesign ? "Add ready-made services such as Training request or Visitor pass in a click." : "Your company hasn't set up any services you can use."}
              action={canDesign ? <Link href="/dashboard/settings/services"><Button variant="primary" icon={Plus}>Add services</Button></Link> : undefined} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((s) => {
                const I = serviceIcon(s.icon);
                return (
                  <div key={s.uuid} className="flex flex-col rounded-xl border border-line bg-surface p-4">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><I size={19} strokeWidth={1.4} /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] text-ink">{s.name}</p>
                        <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{s.description ?? " "}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
                      {s.needs_approval && <Badge tone="neutral">Needs approval</Badge>}
                      {s.my_open > 0 && <Badge tone="info">{s.my_open} open</Badge>}
                      {s.my_drafts > 0 && <Badge tone="neutral">{s.my_drafts} draft{s.my_drafts === 1 ? "" : "s"}</Badge>}
                      {s.can_handle && s.pending > 0 && <Badge tone="warn">{s.pending} waiting</Badge>}
                    </div>
                    <div className="mt-auto flex items-center gap-2 pt-4">
                      {s.can_submit && <Button size="sm" variant="primary" icon={Plus} onClick={() => setParams({ new: s.code })}>New request</Button>}
                      <Link href={`/dashboard/services/${s.code}`} className="ml-auto inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
                        {s.can_handle ? "All records" : "My requests"} <ArrowRight size={14} strokeWidth={1.4} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )
      )}

      {tab === "mine" && (
        <>
          <FilterBar searchPlaceholder="Search by number or title" onSearchChange={(x) => { setQ(x); setPage(1); }}
            filters={[
              { key: "state", label: "Status", options: [{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }, { value: "draft", label: "Drafts" }, { value: "pending", label: "In approval" }] },
              { key: "service", label: "Service", options: (items ?? []).map((s) => ({ value: s.code, label: s.name })) },
            ]}
            values={filters} onChange={(f) => { setFilters(f); setPage(1); }} />
          <DataTable rows={rows?.items ?? []} rowKey={(r) => r.uuid} loading={loading && !rows}
            columns={[
              { key: "title", header: "Request", cell: (r) => {
                const I = serviceIcon(r.service.icon);
                return <span className="flex items-center gap-2.5"><I size={16} strokeWidth={1.4} className="shrink-0 text-muted" />
                  <span className="min-w-0"><span className="block truncate text-ink">{r.title ?? r.service.name}</span><span className="block text-[12px] text-faint">{r.reference_no ?? "Draft"}</span></span></span>;
              } },
              { key: "service", header: "Service", cell: (r) => <span className="text-muted">{r.service.name}</span>, hideBelow: "md" },
              { key: "date", header: "Sent", cell: (r) => <span className="text-muted">{formatDate(r.submitted_at ?? r.created_at)}</span>, hideBelow: "sm" },
              { key: "status", header: "Status", cell: (r) => <Badge tone={r.status_tone} dot>{r.status_label}</Badge> },
            ]}
            onRowClick={(r) => setParams({ view: r.uuid })}
            pagination={{ page, size: 25, total: rows?.total ?? 0, onPageChange: setPage }}
            emptyIcon={Inbox} emptyTitle="No requests yet" emptyHint="Pick a service under All services to make your first request." />
        </>
      )}

      {newCode && <SubmitModal code={newCode} open onClose={() => setParams({ new: null })}
        onSaved={(r) => { setParams({ new: null, view: r.uuid }); refresh(); }} />}
      <RecordModal uuid={viewId} onClose={closeView} onChanged={refresh} />
    </div>
  );
}
