"use client";

/*
 * Assets (HR / IT / admin): the register, approved requests waiting for an asset,
 * recoveries for damage or loss (read by final settlement) and a summary report.
 * Row click opens the asset details; ?view=<uuid> deep-links to it.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowUpFromLine, Boxes, IndianRupee, Laptop, PackageCheck, Pencil, Plus, ShieldCheck, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { EmptyState, Paper, PaperHeader, PageHeader } from "@/components/shell/page";
import { Avatar, Badge, Button, DataTable, FilterBar, StatCard, Tabs, type Column, type FilterValues } from "@/components/ui-kit";
import { AssetDetailModal, AssetFormModal, AssignModal, assetStatusBadge, type Asset } from "@/components/assets/asset-modals";
import { money } from "@/components/workplace/pickers";
import { ASSET_STATUS, CONDITION_OPTIONS, RECOVERY_STATUS, REQUEST_STATUS } from "@/components/workplace/asset-status";

type Page<T> = { items: T[]; total: number; page: number; size: number };
type Req = { uuid: string; employee_id: number; employee_name: string | null; category_id: number | null; category_name: string | null;
  details: string | null; needed_by: string | null; status: string; created_at: string };
type Recovery = { assignment_uuid: string; employee_name: string | null; asset_uuid: string; asset_tag: string; asset_name: string;
  amount: string; reason: string | null; status: string; returned_on: string | null; condition_in: string | null };
type Report = {
  total: number; value: string; by_status: Record<string, number>; pending_acknowledgement: number; recoveries_pending: string;
  recoveries_pending_count: number; maintenance_cost_this_year: string;
  by_category: { category: string; total: number; assigned: number; available: number; in_repair: number; lost: number; retired: number; value: string }[];
  warranty_expiring: { uuid: string; asset_tag: string; name: string; warranty_until: string }[];
  overdue_returns: { asset_tag: string; name: string; employee_name: string | null; expected_return_on: string }[];
};
type Tab = "register" | "requests" | "recoveries" | "report";

export default function AssetsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const tab = (params.get("tab") as Tab) || "register";
  const setTab = (t: Tab) => router.replace(`/dashboard/assets${t === "register" ? "" : `?tab=${t}`}`, { scroll: false });
  const [canManage, setCanManage] = useState<boolean | null>(null);

  useEffect(() => {
    api.get<{ can_manage: boolean }>("/assets/meta").then((m) => setCanManage(m.can_manage)).catch(() => setCanManage(false));
  }, []);

  if (canManage === false) {
    return (
      <div>
        <PageHeader eyebrow="People" title="Assets" />
        <Paper><EmptyState icon={Laptop} title="The asset register is for HR and IT" hint="See the assets you hold under My assets."
          action={<Button onClick={() => router.push("/dashboard/assets/mine")}>Open my assets</Button>} /></Paper>
      </div>
    );
  }
  void user; void toast;
  return (
    <div>
      <PageHeader eyebrow="People" title="Assets" description="Laptops, phones, cards and other company property: who has what, and its condition." />
      <Tabs value={tab} onChange={setTab} className="mb-5" items={[
        { value: "register", label: "Register" }, { value: "requests", label: "Requests" },
        { value: "recoveries", label: "Recoveries" }, { value: "report", label: "Summary" },
      ]} />
      {tab === "register" && <Register />}
      {tab === "requests" && <Requests />}
      {tab === "recoveries" && <Recoveries />}
      {tab === "report" && <ReportView />}
    </div>
  );
}

/* ── Register ──────────────────────────────────────────────────────── */

function Register() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [data, setData] = useState<Page<Asset> | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [form, setForm] = useState<{ target: Asset | null; key: number; open: boolean }>({ target: null, key: 0, open: false });
  const [assign, setAssign] = useState<{ asset: Asset | null; key: number }>({ asset: null, key: 0 });
  const viewing = params.get("view");
  const setViewing = (u: string | null) => router.replace(`/dashboard/assets${u ? `?view=${u}` : ""}`, { scroll: false });

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ page: String(page), size: String(size) });
    if (q.trim()) qs.set("q", q.trim());
    if (filters.status?.length) qs.set("status", filters.status.join(","));
    if (filters.condition?.[0]) qs.set("condition", filters.condition[0]);
    if (filters.warranty?.[0]) qs.set("warranty_days", filters.warranty[0]);
    try { setData(await api.get<Page<Asset>>(`/assets?${qs}`)); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't load assets"); }
    finally { setLoading(false); }
  }, [page, size, q, filters, toast]);
  useEffect(() => { load(); }, [load, nonce]);
  const refresh = () => setNonce((n) => n + 1);

  const columns: Column<Asset>[] = [
    {
      key: "asset", header: "Asset", cell: (a) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted"><Laptop size={16} strokeWidth={1.4} /></span>
          <div className="min-w-0">
            <p className="truncate text-ink">{a.name}</p>
            <p className="truncate text-[12.5px] text-faint"><span className="font-mono">{a.asset_tag}</span>{a.serial_number ? ` · ${a.serial_number}` : ""}</p>
          </div>
        </div>
      ),
    },
    { key: "cat", header: "Category", hideBelow: "md", cell: (a) => <span className="text-muted">{a.category_name ?? "—"}</span> },
    {
      key: "with", header: "With", cell: (a) => a.assigned_to ? (
        <span className="flex items-center gap-2"><Avatar name={a.assigned_to.name || "?"} size={24} />
          <span className="min-w-0"><span className="block truncate text-ink/85">{a.assigned_to.name}</span>
            {!a.assigned_to.acknowledged && <span className="block text-[12px] text-amber-700">Not confirmed yet</span>}</span></span>
      ) : <span className="text-faint">—</span>,
    },
    { key: "value", header: "Value", align: "right", hideBelow: "lg", cell: (a) => <span className="tabular text-muted">{a.purchase_value ? money(a.purchase_value) : "—"}</span> },
    { key: "warranty", header: "Warranty", hideBelow: "lg", cell: (a) => a.warranty_until ? <span className="text-muted">{formatDate(a.warranty_until)}</span> : <span className="text-faint">—</span> },
    { key: "status", header: "Status", cell: (a) => assetStatusBadge(a.status) },
  ];

  return (
    <>
      <FilterBar searchPlaceholder="Search by name, tag, serial or model" onSearchChange={(x) => { setQ(x); setPage(1); }}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[
          { key: "status", label: "Status", multiple: true, options: Object.entries(ASSET_STATUS).map(([value, s]) => ({ value, label: s.label })) },
          { key: "condition", label: "Condition", options: CONDITION_OPTIONS },
          { key: "warranty", label: "Warranty", options: [{ value: "30", label: "Ends within 30 days" }, { value: "90", label: "Ends within 90 days" }] },
        ]}
        actions={<Button variant="primary" icon={Plus} onClick={() => setForm({ target: null, key: form.key + 1, open: true })}>New asset</Button>} />
      <DataTable rows={data?.items ?? []} rowKey={(a) => a.uuid} columns={columns} loading={loading} onRowClick={(a) => setViewing(a.uuid)}
        rowActions={(a) => [
          { label: "View details", onSelect: () => setViewing(a.uuid) },
          { label: "Edit", icon: Pencil, onSelect: () => setForm({ target: a, key: form.key + 1, open: true }) },
          ...(a.status === "available" ? [{ label: "Hand over", icon: ArrowUpFromLine, onSelect: () => setAssign({ asset: a, key: assign.key + 1 }) }] : []),
        ]}
        pagination={{ page, size, total: data?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={Laptop} emptyTitle={q || Object.keys(filters).length ? "No assets match" : "No assets yet"}
        emptyHint="Add laptops, phones, ID cards and other company property to track who has them." />
      <AssetFormModal key={form.key} target={form.target} open={form.open} onClose={() => setForm({ ...form, open: false })}
        onSaved={(a) => { setForm({ ...form, open: false }); refresh(); if (!form.target) setViewing(a.uuid); }} />
      <AssetDetailModal uuid={viewing} open={!!viewing} onClose={() => setViewing(null)} onChanged={refresh}
        onEdit={(a) => setForm({ target: a, key: form.key + 1, open: true })} />
      <AssignModal key={`as${assign.key}`} asset={assign.asset} open={!!assign.asset} onClose={() => setAssign({ ...assign, asset: null })}
        onDone={() => { setAssign({ ...assign, asset: null }); refresh(); }} />
    </>
  );
}

/* ── Requests ──────────────────────────────────────────────────────── */

function Requests() {
  const toast = useToast();
  const [filters, setFilters] = useState<FilterValues>({ status: ["approved"] });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Req> | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [fulfil, setFulfil] = useState<{ req: Req; key: number } | null>(null);
  const [pickAsset, setPickAsset] = useState<Asset | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const st = filters.status?.length ? `&status=${filters.status.join(",")}` : "";
    api.get<Page<Req>>(`/assets/requests?page=${page}&size=25${st}`)
      .then((r) => { if (live) setData(r); }).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load requests"))
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [filters, page, nonce, toast]);

  async function startFulfil(r: Req) {
    try {
      const qs = new URLSearchParams({ status: "available", size: "1" });
      if (r.category_id) qs.set("category_id", String(r.category_id));
      const found = await api.get<Page<Asset>>(`/assets?${qs}`);
      if (!found.items.length) { toast.info("No available asset in this category", { description: "Add one to the register first." }); return; }
      setPickAsset(found.items[0]);
      setFulfil({ req: r, key: (fulfil?.key ?? 0) + 1 });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't find an asset"); }
  }

  const columns: Column<Req>[] = [
    { key: "who", header: "Employee", cell: (r) => <span className="flex items-center gap-2"><Avatar name={r.employee_name || "?"} size={26} /><span className="text-ink">{r.employee_name}</span></span> },
    { key: "what", header: "Needs", cell: (r) => <div className="min-w-0"><p className="text-ink">{r.category_name ?? "—"}</p><p className="truncate text-[12.5px] text-muted">{r.details}</p></div> },
    { key: "by", header: "Needed by", hideBelow: "md", cell: (r) => <span className="text-muted">{r.needed_by ? formatDate(r.needed_by) : "—"}</span> },
    { key: "asked", header: "Asked", hideBelow: "lg", cell: (r) => <span className="text-muted">{formatDate(r.created_at)}</span> },
    { key: "status", header: "Status", cell: (r) => <Badge tone={REQUEST_STATUS[r.status]?.tone}>{REQUEST_STATUS[r.status]?.label ?? r.status}</Badge> },
  ];
  return (
    <>
      <FilterBar values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[{ key: "status", label: "Status", multiple: true, options: Object.entries(REQUEST_STATUS).map(([value, s]) => ({ value, label: s.label })) }]} />
      <DataTable rows={data?.items ?? []} rowKey={(r) => r.uuid} columns={columns} loading={loading}
        rowActions={(r) => r.status === "approved" ? [{ label: "Hand over an asset", icon: PackageCheck, onSelect: () => startFulfil(r) }] : []}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={PackageCheck} emptyTitle="No requests here" emptyHint="Employees ask for assets from My assets; approved requests wait here to be handed over." />
      {fulfil && <AssignModal key={fulfil.key} asset={pickAsset} open request={fulfil.req}
        onClose={() => setFulfil(null)} onDone={() => { setFulfil(null); setNonce((n) => n + 1); }} />}
    </>
  );
}

/* ── Recoveries ────────────────────────────────────────────────────── */

function Recoveries() {
  const toast = useToast();
  const [status, setStatus] = useState<FilterValues>({ status: ["pending"] });
  const [data, setData] = useState<{ items: Recovery[]; total_pending: string } | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    api.get<{ items: Recovery[]; total_pending: string }>(`/assets/recoveries?status=${status.status?.[0] ?? ""}`)
      .then(setData).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load recoveries"));
  }, [status, nonce, toast]);
  async function act(r: Recovery, s: string) {
    try { await api.post(`/assets/assignments/${r.assignment_uuid}/recovery`, { status: s }); toast.success(s === "waived" ? "Waived" : "Marked recovered"); setNonce((n) => n + 1); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update"); }
  }
  const columns: Column<Recovery>[] = [
    { key: "who", header: "Employee", cell: (r) => <span className="text-ink">{r.employee_name}</span> },
    { key: "asset", header: "Asset", cell: (r) => <div><p className="text-ink">{r.asset_name}</p><p className="font-mono text-[12px] text-faint">{r.asset_tag}</p></div> },
    { key: "reason", header: "Reason", hideBelow: "md", cell: (r) => <span className="text-muted">{r.reason}</span> },
    { key: "on", header: "Returned", hideBelow: "lg", cell: (r) => <span className="text-muted">{r.returned_on ? formatDate(r.returned_on) : "—"}</span> },
    { key: "amount", header: "Amount", align: "right", cell: (r) => <span className="tabular text-ink">{money(r.amount)}</span> },
    { key: "status", header: "Status", cell: (r) => <Badge tone={RECOVERY_STATUS[r.status]?.tone}>{RECOVERY_STATUS[r.status]?.label}</Badge> },
  ];
  return (
    <>
      <FilterBar values={status} onChange={setStatus}
        filters={[{ key: "status", label: "Status", options: ["pending", "recovered", "waived"].map((s) => ({ value: s, label: RECOVERY_STATUS[s].label })) }]}
        actions={data && <span className="text-[13.5px] text-muted">To recover: <span className="tabular text-ink">{money(data.total_pending)}</span></span>} />
      <DataTable rows={data?.items ?? []} rowKey={(r) => r.assignment_uuid} columns={columns} loading={!data}
        rowActions={(r) => r.status === "pending" ? [{ label: "Mark recovered", onSelect: () => act(r, "recovered") }, { label: "Waive", onSelect: () => act(r, "waived") }] : []}
        emptyIcon={IndianRupee} emptyTitle="Nothing to recover" emptyHint="Amounts set when a damaged or lost asset is returned appear here and in final settlement." />
    </>
  );
}

/* ── Summary ───────────────────────────────────────────────────────── */

function ReportView() {
  const toast = useToast();
  const [r, setR] = useState<Report | null>(null);
  useEffect(() => { api.get<Report>("/assets/report").then(setR).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load the summary")); }, [toast]);
  if (!r) return <Paper><EmptyState icon={Boxes} title="Loading…" /></Paper>;
  const max = Math.max(1, ...r.by_category.map((c) => c.total));
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Assets" value={r.total} icon={Boxes} hint={`${r.by_status.assigned ?? 0} handed over`} />
        <StatCard label="Book value" value={money(r.value)} icon={IndianRupee} hint="Excluding retired" />
        <StatCard label="Waiting for confirmation" value={r.pending_acknowledgement} icon={ShieldCheck} />
        <StatCard label="To recover" value={money(r.recoveries_pending)} icon={AlertTriangle} hint={`${r.recoveries_pending_count} returns`} />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Paper>
          <PaperHeader title="By category" />
          <ul className="divide-y divide-line">
            {r.by_category.map((c) => (
              <li key={c.category} className="grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-3">
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3"><span className="text-[14px] text-ink">{c.category}</span>
                    <span className="tabular text-[12.5px] text-muted">{c.assigned} with people · {c.available} free{c.in_repair ? ` · ${c.in_repair} in repair` : ""}</span></div>
                  <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-sunken">
                    <span className="bg-primary" style={{ width: `${(c.assigned / max) * 100}%` }} />
                    <span className="bg-emerald-400" style={{ width: `${(c.available / max) * 100}%` }} />
                    <span className="bg-amber-400" style={{ width: `${((c.in_repair + c.lost) / max) * 100}%` }} />
                  </div>
                </div>
                <span className="tabular w-24 text-right text-[13px] text-muted">{money(c.value)}</span>
              </li>
            ))}
          </ul>
        </Paper>
        <div className="space-y-5">
          <Paper>
            <PaperHeader title="Warranty ends within 60 days" />
            {r.warranty_expiring.length ? <ul className="divide-y divide-line">{r.warranty_expiring.map((w) => (
              <li key={w.uuid} className="flex justify-between gap-3 px-5 py-2.5 text-[13.5px]"><span className="truncate text-ink">{w.name} <span className="font-mono text-faint">{w.asset_tag}</span></span><span className="shrink-0 text-amber-700">{formatDate(w.warranty_until)}</span></li>
            ))}</ul> : <p className="px-5 py-4 text-[13.5px] text-muted">None</p>}
          </Paper>
          <Paper>
            <PaperHeader title="Late returns" />
            {r.overdue_returns.length ? <ul className="divide-y divide-line">{r.overdue_returns.map((o) => (
              <li key={o.asset_tag} className="flex justify-between gap-3 px-5 py-2.5 text-[13.5px]"><span className="truncate text-ink">{o.name} · {o.employee_name}</span><span className="shrink-0 text-rose-600">{formatDate(o.expected_return_on)}</span></li>
            ))}</ul> : <p className="px-5 py-4 text-[13.5px] text-muted">None</p>}
          </Paper>
          <Paper className="p-5"><p className="flex items-center gap-2 text-[13.5px] text-muted"><Wrench size={15} strokeWidth={1.4} /> Maintenance this year <span className="tabular ml-auto text-ink">{money(r.maintenance_cost_this_year)}</span></p></Paper>
        </div>
      </div>
    </div>
  );
}
