"use client";

/*
 * HR help desk. Everyone sees their own requests; agents also get their queues (assigned
 * to me, unassigned, waiting to assign, escalated, all open); admins and category owners
 * get reports and settings. Rows open the case conversation (?case=<uuid>).
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BarChart3, BookOpen, CheckCircle2, Hand, LifeBuoy, Plus, Search, Settings2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime, formatRelative } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Button, DataTable, FilterBar, Modal, Skeleton, Tabs, TextInput, type BulkAction, type Column, type FilterValues,
} from "@/components/ui-kit";
import { PRIORITY_OPTIONS } from "@/components/workplace/pickers";
import { CaseModal } from "@/components/helpdesk/case-modal";
import { ArticleModal, NewCaseModal, type Article } from "@/components/helpdesk/new-case-modal";
import { HelpdeskReports } from "@/components/helpdesk/reports";
import { HelpdeskSettings } from "@/components/helpdesk/settings";
import { PriorityBadge, QUEUES, SlaChip, StatusBadge, type CaseRow, type Category, type HelpdeskMe, type Page } from "@/components/helpdesk/types";

export default function HelpdeskPage() {
  return <Suspense fallback={null}><Helpdesk /></Suspense>;
}

function Helpdesk() {
  const params = useSearchParams();
  const toast = useToast();
  const [me, setMe] = useState<HelpdeskMe | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<{ key: string; page: Page<CaseRow> } | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);

  const loadMe = useCallback(() => {
    api.get<HelpdeskMe>("/helpdesk/me").then(setMe).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load the help desk"));
  }, [toast]);
  useEffect(() => { loadMe(); }, [loadMe, nonce]);
  useEffect(() => { api.get<{ items: Category[] }>("/helpdesk/categories").then((r) => setCategories(r.items)).catch(() => {}); }, []);

  const isManager = !!me && (me.is_admin || me.owner_of.length > 0);
  const queues = useMemo(() => !me ? [] : QUEUES.filter((x) => !x.staff || (me.is_staff && (x.key !== "unmanaged" || (me.counts.unmanaged ?? 0) > 0 || me.owner_of.length > 0 || me.is_admin))), [me]);
  const defaultTab = me?.is_staff ? "mine" : "my_requests";
  const [tabParam, setTabParam] = useState<string | null>(params.get("tab"));
  const tab = tabParam || defaultTab;
  const [caseUuid, setCaseUuid] = useState<string | null>(params.get("case"));

  const setUrl = (key: string, value: string | null) => {
    const next = new URLSearchParams(window.location.search);
    if (value) next.set(key, value); else next.delete(key);
    const s = next.toString();
    window.history.replaceState(null, "", `/dashboard/helpdesk${s ? `?${s}` : ""}`);
  };
  const setTab = (t: string) => { setPage(1); setFilters({}); setTabParam(t); setUrl("tab", t === defaultTab ? null : t); };
  const syncCase = (uuid: string | null) => {
    setCaseUuid(uuid);
    setUrl("case", uuid);
  };
  const openCase = (uuid: string) => syncCase(uuid);

  const isQueue = queues.some((x) => x.key === tab);
  const query = useMemo(() => {
    const s = new URLSearchParams({ queue: tab, page: String(page), size: String(size) });
    if (q.trim()) s.set("q", q.trim());
    if (filters.status?.length) s.set("status", filters.status.join(","));
    if (filters.priority?.[0]) s.set("priority", filters.priority[0]);
    if (filters.category?.[0]) s.set("category_id", filters.category[0]);
    if (filters.breached?.[0]) s.set("breached", "true");
    return s.toString();
  }, [tab, page, size, q, filters]);
  const key = `${query}|${nonce}`;

  useEffect(() => {
    if (!me || !isQueue) return;
    let live = true;
    api.get<Page<CaseRow>>(`/helpdesk/cases?${query}`).then((r) => { if (live) setData({ key, page: r }); })
      .catch((e) => { if (live) { setData({ key, page: { items: [], total: 0, page: 1, size } }); toast.error(e instanceof Error ? e.message : "Couldn't load cases"); } });
    return () => { live = false; };
  }, [me, isQueue, query, key, size, toast]);
  const loading = data?.key !== key;
  const rows = data?.page.items ?? [];
  const refresh = () => setNonce((n) => n + 1);

  const staffView = !!me?.is_staff && tab !== "my_requests";
  const mains = categories.filter((c) => c.parent_id === null);
  const columns: Column<CaseRow>[] = [
    {
      key: "subject", header: "Case", cell: (c) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{c.subject}</p>
          <p className="truncate text-[12.5px] text-faint"><span className="font-mono">{c.reference_no}</span> · {c.category_name}{c.subcategory_name ? ` › ${c.subcategory_name}` : ""}</p>
        </div>
      ),
    },
    ...(staffView ? [{
      key: "requester", header: "From", hideBelow: "md" as const, cell: (c: CaseRow) => (
        <span className="flex min-w-0 items-center gap-2"><Avatar name={c.requester_name || "?"} size={24} /><span className="truncate whitespace-nowrap text-ink/80">{c.requester_name}</span></span>
      ),
    }] : []),
    { key: "assignee", header: staffView ? "Agent" : "Handled by", hideBelow: "lg", cell: (c) => c.assignee_name ? <span className="whitespace-nowrap text-muted">{c.assignee_name}</span> : <span className="whitespace-nowrap text-faint">Not picked up</span> },
    ...(me?.is_staff || !me?.settings.hide_priority_from_requester ? [{ key: "priority", header: "Priority", hideBelow: "sm" as const, cell: (c: CaseRow) => <PriorityBadge priority={c.priority} /> }] : []),
    ...(staffView ? [{ key: "sla", header: "Target", hideBelow: "md" as const, cell: (c: CaseRow) => <SlaChip sla={c.sla} status={c.status} /> }] : []),
    { key: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} label={c.status_label} /> },
    ...(staffView ? [] : [{ key: "activity", header: "Updated", hideBelow: "lg" as const, align: "right" as const, cell: (c: CaseRow) => <span className="whitespace-nowrap text-muted" title={formatDateTime(c.last_activity_at)}>{formatRelative(c.last_activity_at)}</span> }]),
  ];

  async function bulk(action: "pick" | "status", list: CaseRow[], clear: () => void, status?: string) {
    try {
      const r = await api.post<{ done: number; failed: { reason: string }[] }>("/helpdesk/cases/bulk", { uuids: list.map((c) => c.uuid), action, status });
      if (r.failed.length) toast.warning(`${r.done} changed, ${r.failed.length} skipped`, { description: r.failed[0]?.reason });
      else toast.success(`${r.done} ${r.done === 1 ? "case" : "cases"} updated`);
      clear(); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update the cases"); }
  }
  const bulkActions: BulkAction<CaseRow>[] = staffView ? [
    { label: "Pick up", icon: Hand, onSelect: (l, c) => bulk("pick", l, c) },
    { label: "Mark resolved", icon: CheckCircle2, onSelect: (l, c) => bulk("status", l, c, "resolved") },
  ] : [];

  const filtered = !!q || Object.values(filters).some((v) => v?.length);
  const tabs = [
    ...queues.map((x) => ({ value: x.key, label: x.label, count: me?.counts[x.key] })),
    ...(isManager ? [{ value: "reports", label: "Reports", icon: BarChart3 }] : []),
    ...(me?.is_admin ? [{ value: "settings", label: "Settings", icon: Settings2 }] : []),
  ];

  return (
    <div>
      <PageHeader eyebrow="Engage" title="Help desk"
        description={me?.is_staff ? "Questions and requests from employees to HR, payroll, IT and admin." : "Ask HR, payroll, IT or admin, and follow the answer here."}
        actions={<>
          <Button icon={BookOpen} onClick={() => setKbOpen(true)}>Answers</Button>
          <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)} disabled={!me}>New case</Button>
        </>} />

      {!me ? (
        <div className="space-y-4"><Skeleton className="h-9 w-96" /><Skeleton className="h-72 rounded-2xl" /></div>
      ) : (
        <>
          <Tabs className="mb-5" items={tabs} value={tab} onChange={setTab} />
          {tab === "reports" && isManager ? <HelpdeskReports onOpenCase={openCase} scale={me.settings.rating_scale} statuses={me.statuses} />
            : tab === "settings" && me.is_admin ? <HelpdeskSettings />
              : (
                <>
                  <FilterBar searchPlaceholder="Search by subject, number or person" onSearchChange={(x) => { setQ(x); setPage(1); }}
                    values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
                    filters={[
                      { key: "status", label: "Status", multiple: true, options: Object.entries(me.statuses).map(([value, label]) => ({ value, label })) },
                      ...(me.is_staff || !me.settings.hide_priority_from_requester ? [{ key: "priority", label: "Priority", options: PRIORITY_OPTIONS }] : []),
                      { key: "category", label: "Category", options: mains.map((c) => ({ value: String(c.id), label: c.name })) },
                      ...(staffView ? [{ key: "breached", label: "Late", options: [{ value: "1", label: "Missed a target" }] }] : []),
                    ]} />
                  <DataTable<CaseRow>
                    rows={rows} rowKey={(c) => c.uuid} columns={columns} loading={loading} onRowClick={(c) => openCase(c.uuid)}
                    selectable={staffView} bulkActions={bulkActions}
                    rowClassName={(c) => (c.breached && !["resolved", "closed", "cancelled"].includes(c.status) ? "bg-rose-50/30" : undefined)}
                    pagination={{ page, size, total: data?.page.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
                    emptyIcon={LifeBuoy}
                    emptyTitle={filtered ? "No cases match" : tab === "my_requests" ? "You haven't raised any cases" : "Nothing here"}
                    emptyHint={filtered ? "Try another search or clear the filters." : tab === "my_requests" ? "Ask a question about pay, leave, IT or anything else." : "New cases show up here."}
                    emptyAction={!filtered && tab === "my_requests" && <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>New case</Button>} />
                </>
              )}
          <NewCaseModal open={newOpen} me={me} categories={categories} onClose={() => setNewOpen(false)}
            onCreated={(uuid) => { setNewOpen(false); refresh(); openCase(uuid); }} />
          <CaseModal uuid={caseUuid} me={me} open={!!caseUuid} onClose={() => syncCase(null)} onChanged={refresh} />
          <KnowledgeBase open={kbOpen} onClose={() => setKbOpen(false)} onAsk={() => { setKbOpen(false); setNewOpen(true); }} />
        </>
      )}
    </div>
  );
}

function KnowledgeBase({ open, onClose, onAsk }: { open: boolean; onClose: () => void; onAsk: () => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ q: string; items: Article[] } | null>(null);
  const [article, setArticle] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      api.get<{ items: Article[] }>(`/helpdesk/articles?q=${encodeURIComponent(q.trim())}&limit=30`).then((r) => setRes({ q, items: r.items })).catch(() => setRes({ q, items: [] }));
    }, 250);
    return () => clearTimeout(t);
  }, [open, q]);
  return (
    <>
      <Modal open={open} onClose={onClose} size="lg" title="Answers" description="Common questions, answered by HR."
        footer={<div className="flex w-full items-center justify-between gap-3"><span className="text-[13px] text-muted">Didn&apos;t find it?</span><Button variant="primary" icon={Plus} onClick={onAsk}>New case</Button></div>}>
        <TextInput autoFocusInModal leading={Search} value={q} onValueChange={setQ} placeholder="Search, e.g. payslip, Form 16, ID card" />
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {!res ? [0, 1, 2].map((i) => <li key={i} className="p-4"><Skeleton className="h-4 w-2/3" /></li>)
            : res.items.length === 0 ? <li className="px-4 py-8 text-center text-[13.5px] text-muted">No answers match. Raise a case instead.</li>
              : res.items.map((a) => (
                <li key={a.uuid}>
                  <button type="button" onClick={() => setArticle(a.uuid)} className="group block w-full px-4 py-3 text-left transition-colors hover:bg-sunken/60">
                    <span className="block text-[14px] text-ink group-hover:text-primary">{a.title}</span>
                    <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-muted">{a.body}</span>
                    {a.category_name && <span className="mt-1 inline-block text-[11.5px] text-faint">{a.category_name}</span>}
                  </button>
                </li>
              ))}
        </ul>
      </Modal>
      <ArticleModal uuid={article} open={!!article} onClose={() => setArticle(null)} />
    </>
  );
}
