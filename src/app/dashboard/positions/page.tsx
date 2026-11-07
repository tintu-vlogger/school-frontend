"use client";

/*
 * Positions: the approved seats, who sits in them and what is vacant; headcount plans per
 * department and financial year; requests to add, change or close positions; settings.
 * Add / edit / details open in modals.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Armchair, ClipboardList, FilePlus2, Gauge, Network, Plus, Send, Settings2, Star, Undo2, UserX } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, DataTable, FilterBar, NumberInput, Field, Skeleton, StatCard, StatGrid, Tabs, Toggle, useConfirm, type Column, type FilterValues,
} from "@/components/ui-kit";
import { useOrgOptions } from "@/components/people/hooks";
import { PlanForm, PositionDetail, PositionForm } from "@/components/positions/position-modals";
import { FILL_TONE, Meter, PersonCell, StatusBadge, band, money, resetPositionsMeta, usePositionsMeta } from "@/components/positions/shared";
import type { HeadcountPlan, Meta, Page, Position, PositionRequest, Summary } from "@/components/positions/types";

type TabKey = "positions" | "plans" | "requests" | "settings";

export default function PositionsPage() {
  const meta = usePositionsMeta();
  const params = useSearchParams();
  const router = useRouter();
  const initial = (params.get("tab") as TabKey) || "positions";
  const [tab, setTabState] = useState<TabKey>(["positions", "plans", "requests", "settings"].includes(initial) ? initial : "positions");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const setTab = (t: TabKey) => { setTabState(t); router.replace(`/dashboard/positions${t === "positions" ? "" : `?tab=${t}`}`, { scroll: false }); };

  useEffect(() => { if (meta?.can_view) api.get<Summary>("/positions/summary").then(setSummary).catch(() => {}); }, [meta, nonce]);

  if (!meta) return <div><PageHeader title="Positions" /><Skeleton className="h-80 rounded-2xl" /></div>;
  if (!meta.can_view) return <div><PageHeader title="Positions" /><Paper><EmptyState icon={Armchair} title="You don't have access to positions" hint="Ask HR if you need to see the position list." /></Paper></div>;

  return (
    <div>
      <PageHeader title="Positions" description="Approved seats, who sits in them and what is vacant."
        actions={<Link href="/dashboard/positions/chart"><Button icon={Network}>Position chart</Button></Link>} />
      {!meta.enabled && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[13.5px] text-amber-800">
          <span>Positions are switched off. Set them up here, then switch them on in Settings so hires and job changes pick a vacant position.</span>
          {meta.can_manage && <Button size="sm" onClick={() => setTab("settings")}>Open settings</Button>}
        </div>
      )}
      <StatGrid className="mb-6 xl:grid-cols-5">
        <StatCard label="Open positions" value={summary?.positions ?? "–"} icon={Armchair} hint={summary ? `${summary.budgeted} budgeted` : undefined} />
        <StatCard label="Approved seats" value={summary?.approved_seats ?? "–"} icon={Gauge} />
        <StatCard label="Filled" value={summary?.filled ?? "–"} icon={ClipboardList} hint={summary?.reserved ? `${summary.reserved} starting soon` : undefined} />
        <StatCard label="Vacant seats" value={summary?.vacant ?? "–"} icon={UserX} />
        <StatCard label="Key positions" value={summary?.critical ?? "–"} icon={Star} hint={summary?.pending_requests ? `${summary.pending_requests} requests waiting` : undefined} />
      </StatGrid>
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[
        { value: "positions", label: "Positions" }, { value: "plans", label: "Headcount plans" },
        { value: "requests", label: "Requests", count: summary?.pending_requests || undefined },
        ...(meta.can_manage ? [{ value: "settings" as TabKey, label: "Settings", icon: Settings2 }] : [])]} />
      {tab === "positions" && <PositionsTab meta={meta} nonce={nonce} onChanged={refresh} />}
      {tab === "plans" && <PlansTab meta={meta} onChanged={refresh} />}
      {tab === "requests" && <RequestsTab meta={meta} nonce={nonce} onChanged={refresh} />}
      {tab === "settings" && meta.can_manage && <SettingsTab />}
    </div>
  );
}

function PositionsTab({ meta, nonce, onChanged }: { meta: Meta; nonce: number; onChanged: () => void }) {
  const toast = useToast();
  const o = useOrgOptions();
  const params = useSearchParams();
  const [rows, setRows] = useState<Position[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<string | null>(params.get("view"));
  const [editing, setEditing] = useState<{ position: Position | null; mode: "direct" | "request" } | null>(null);
  const SIZE = 25;

  useEffect(() => {
    let live = true;
    setLoading(true);
    const p = new URLSearchParams({ page: String(page), size: String(SIZE) });
    if (q) p.set("q", q);
    if (filters.status?.length) p.set("status", filters.status.join(","));
    if (filters.department?.length) p.set("department_id", filters.department[0]);
    if (filters.fill?.length) p.set("fill", filters.fill[0]);
    if (filters.critical?.length) p.set("critical", "true");
    api.get<Page<Position>>(`/positions/positions?${p}`).then((r) => { if (live) { setRows(r.items); setTotal(r.total); } })
      .catch((e) => toast.error(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [q, filters, page, nonce, toast]);

  const columns: Column<Position>[] = [
    { key: "title", header: "Position", cell: (r) => (
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-ink">{r.title}{r.is_critical && <Star size={13} strokeWidth={1.4} className="text-amber-500" aria-label="Key position" />}</p>
        <p className="truncate text-[12px] text-faint">{[r.code, r.designation !== r.title ? r.designation : null].filter(Boolean).join(" · ")}</p>
      </div>) },
    { key: "dept", header: "Department", hideBelow: "md", cell: (r) => <span className="text-muted">{r.department ?? "—"}</span> },
    { key: "people", header: "In the seat", hideBelow: "lg", cell: (r) => r.incumbents.length
      ? <PersonCell person={r.incumbents[0]} size={24} hint={r.incumbents.length > 1 ? `+${r.incumbents.length - 1} more` : undefined} />
      : <span className="text-faint">Vacant</span> },
    { key: "seats", header: "Seats", cell: (r) => (
      <div className="w-28">
        <div className="mb-1 flex justify-between text-[12.5px]"><span className="tabular text-ink">{r.filled + r.reserved}/{r.headcount}</span>
          {r.vacant > 0 && r.status !== "closed" && <span className="text-amber-700">{r.vacant} open</span>}</div>
        <Meter value={r.filled + r.reserved} max={r.headcount} tone={r.vacant ? "bg-amber-400" : "bg-emerald-500/70"} />
      </div>) },
    { key: "fill", header: "Fill", hideBelow: "sm", cell: (r) => <Badge tone={FILL_TONE[r.fill_status]}>{r.fill_label}</Badge> },
    { key: "status", header: "Status", hideBelow: "md", cell: (r) => <StatusBadge status={r.status} label={r.status_label} /> },
    { key: "band", header: "Salary band", hideBelow: "lg", cell: (r) => <span className="text-[13px] text-muted">{band(r.salary_min, r.salary_max)}</span> },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterBar className="min-w-0 flex-1" search={q} onSearchChange={(v) => { setQ(v); setPage(1); }} searchPlaceholder="Search title or code"
          filters={[
            { key: "fill", label: "Seats", options: [{ value: "vacant", label: "Fully vacant" }, { value: "has_vacancy", label: "Has a vacancy" }, { value: "filled", label: "Filled" }] },
            { key: "status", label: "Status", multiple: true, options: [{ value: "approved", label: "Approved" }, { value: "budgeted", label: "Budgeted" }, { value: "closed", label: "Closed" }] },
            { key: "department", label: "Department", options: o.departments.map((d) => ({ value: String(d.value), label: d.label })) },
            { key: "critical", label: "Key positions", options: [{ value: "yes", label: "Key positions only" }] },
          ]} values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
        {meta.can_manage
          ? <Button variant="primary" icon={Plus} onClick={() => setEditing({ position: null, mode: "direct" })}>Add position</Button>
          : <Button icon={FilePlus2} onClick={() => setEditing({ position: null, mode: "request" })}>Ask for a position</Button>}
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.uuid} loading={loading} onRowClick={(r) => setViewing(r.uuid)}
        emptyTitle="No positions yet" emptyHint="Add the approved seats of your organisation, then place people in them."
        pagination={{ page, size: SIZE, total, onPageChange: setPage }}
        rowActions={meta.can_manage ? (r) => [
          { label: "Open", onSelect: () => setViewing(r.uuid) },
          ...(r.status !== "closed" ? [{ label: "Edit", onSelect: () => setEditing({ position: r, mode: "direct" as const }) }] : []),
        ] : undefined} />
      <PositionDetail uuid={viewing} meta={meta} onClose={() => setViewing(null)} onChanged={onChanged}
        onEdit={(p) => setEditing({ position: p, mode: "direct" })} onRequestChange={(p) => setEditing({ position: p, mode: "request" })} />
      <PositionForm open={!!editing} position={editing?.position ?? null} mode={editing?.mode} onClose={() => setEditing(null)}
        onSaved={(p) => { setEditing(null); onChanged(); if (p && !viewing) setViewing(p.uuid); }} />
    </div>
  );
}

function PlansTab({ meta, onChanged }: { meta: Meta; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [fy, setFy] = useState(meta.financial_year);
  const [rows, setRows] = useState<HeadcountPlan[] | null>(null);
  const [nonce, setNonce] = useState(0);
  const [editing, setEditing] = useState<{ plan: HeadcountPlan | null } | null>(null);
  useEffect(() => {
    setRows(null);
    api.get<{ items: HeadcountPlan[] }>(`/positions/headcount-plans?financial_year=${fy}`).then((r) => setRows(r.items)).catch((e) => toast.error(e.message));
  }, [fy, nonce, toast]);
  const reload = () => { setNonce((n) => n + 1); onChanged(); };
  async function act(p: HeadcountPlan, action: "submit" | "withdraw") {
    if (action === "withdraw" && !(await confirm({ title: "Withdraw this plan?", message: "It goes back to draft. The approved number stays in force.", confirmLabel: "Withdraw" }))) return;
    try { await api.post(`/positions/headcount-plans/${p.uuid}/${action}`); toast.success(action === "submit" ? "Sent for approval" : "Withdrawn"); reload(); }
    catch (e) { toast.error((e as Error).message); }
  }
  const total = (rows ?? []).reduce((a, r) => ({ planned: a.planned + r.planned_headcount, approved: a.approved + (r.approved_headcount ?? 0), seats: a.seats + r.position_seats, people: a.people + r.employees }), { planned: 0, approved: 0, seats: 0, people: 0 });
  const columns: Column<HeadcountPlan>[] = [
    { key: "dept", header: "Department", cell: (r) => <span className="text-ink">{r.department ?? "—"}</span> },
    { key: "approved", header: "Approved", align: "right", cell: (r) => <span className="tabular">{r.approved_headcount ?? "—"}</span> },
    { key: "planned", header: "Proposed", align: "right", hideBelow: "sm", cell: (r) => <span className={`tabular ${r.approved_headcount !== null && r.planned_headcount !== r.approved_headcount ? "text-primary" : "text-muted"}`}>{r.planned_headcount}</span> },
    { key: "seats", header: "Position seats", hideBelow: "md", cell: (r) => (
      <div className="w-32"><div className="mb-1 text-[12.5px] tabular">{r.position_seats} of {r.approved_headcount ?? r.planned_headcount}</div>
        <Meter value={r.position_seats} max={r.approved_headcount ?? r.planned_headcount} tone={r.approved_headcount !== null && r.position_seats >= r.approved_headcount ? "bg-amber-400" : "bg-primary/70"} /></div>) },
    { key: "people", header: "People now", align: "right", hideBelow: "lg", cell: (r) => <span className="tabular text-muted">{r.employees}</span> },
    { key: "budget", header: "Budget", hideBelow: "lg", cell: (r) => <span className="text-muted">{money(r.budget)}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} label={r.status_label} /> },
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs variant="pill" value={fy} onChange={setFy} items={meta.financial_years.map((y) => ({ value: y, label: `FY ${y}` }))} />
        {meta.can_manage && <Button variant="primary" icon={Plus} onClick={() => setEditing({ plan: null })}>New plan</Button>}
      </div>
      {rows && rows.length > 0 && (
        <p className="mb-3 text-[13px] text-muted">Approved {total.approved} · proposed {total.planned} · {total.seats} seats in positions · {total.people} people today</p>
      )}
      <DataTable rows={rows ?? []} columns={columns} rowKey={(r) => r.uuid} loading={!rows}
        emptyTitle={`No headcount plans for ${fy}`} emptyHint="Plan how many people each department may have this year."
        onRowClick={meta.can_manage ? (r) => r.status !== "pending" && setEditing({ plan: r }) : undefined}
        rowActions={meta.can_manage ? (r) => [
          ...(r.status !== "pending" ? [{ label: "Revise", onSelect: () => setEditing({ plan: r }) }] : []),
          ...(r.status === "draft" ? [{ label: "Send for approval", icon: Send, onSelect: () => act(r, "submit") }] : []),
          ...(r.status === "pending" ? [{ label: "Withdraw", icon: Undo2, onSelect: () => act(r, "withdraw") }] : []),
        ] : undefined} />
      <PlanForm open={!!editing} plan={editing?.plan ?? null} meta={meta} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} />
    </div>
  );
}

function RequestsTab({ meta, nonce, onChanged }: { meta: Meta; nonce: number; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState("pending");
  const [rows, setRows] = useState<PositionRequest[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [local, setLocal] = useState(0);
  useEffect(() => {
    setRows(null);
    api.get<Page<PositionRequest>>(`/positions/requests?size=100${status ? `&status=${status}` : ""}`).then((r) => setRows(r.items)).catch((e) => toast.error(e.message));
  }, [status, nonce, local, toast]);
  async function cancel(r: PositionRequest) {
    if (!(await confirm({ title: "Withdraw this request?", confirmLabel: "Withdraw" }))) return;
    try { await api.post(`/positions/requests/${r.uuid}/cancel`); toast.success("Withdrawn"); setLocal((n) => n + 1); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
  }
  const columns: Column<PositionRequest>[] = [
    { key: "what", header: "Request", cell: (r) => (
      <div className="min-w-0"><p className="truncate text-ink">{r.kind_label}: {r.title ?? r.position?.title}</p>
        <p className="truncate text-[12px] text-faint">{[r.number, r.position?.code, r.department].filter(Boolean).join(" · ")}</p></div>) },
    { key: "reason", header: "Reason", hideBelow: "md", cell: (r) => <span className="line-clamp-2 text-[13px] text-muted">{r.reason}</span> },
    { key: "by", header: "Asked by", hideBelow: "sm", cell: (r) => <span className="text-muted">{r.requested_by_name ?? "—"}<br /><span className="text-[12px] text-faint">{formatDate(r.created_at)}</span></span> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} label={meta.plan_statuses[r.status] ?? r.status} /> },
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs variant="pill" value={status} onChange={setStatus} items={[{ value: "pending", label: "Waiting" }, { value: "approved", label: "Approved" }, { value: "rejected,cancelled", label: "Turned down" }, { value: "", label: "All" }]} />
        <Button icon={FilePlus2} onClick={() => setAsking(true)}>Ask for a new position</Button>
      </div>
      <DataTable rows={rows ?? []} columns={columns} rowKey={(r) => r.uuid} loading={!rows}
        emptyTitle="No requests here" emptyHint="Managers ask for new positions, seat changes or closing a position; HR and the department head approve."
        rowActions={(r) => r.status === "pending" ? [{ label: "Withdraw", icon: Undo2, onSelect: () => cancel(r) },
          { label: "Open in approvals", onSelect: () => { window.location.href = "/dashboard/inbox"; } }] : []} />
      <PositionForm open={asking} position={null} mode="request" onClose={() => setAsking(false)} onSaved={() => { setAsking(false); setLocal((n) => n + 1); onChanged(); }} />
    </div>
  );
}

type Settings = Record<string, boolean | number>;

function SettingsTab() {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get<Settings>("/positions/settings").then(setS).catch((e) => toast.error(e.message)); }, [toast]);
  if (!s) return <Skeleton className="h-64 rounded-2xl" />;
  const set = (k: string, v: boolean | number | null) => setS({ ...s, [k]: v ?? 0 });
  async function save() {
    setSaving(true);
    try { setS(await api.put<Settings>("/positions/settings", s)); resetPositionsMeta(); toast.success("Settings saved"); }
    catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  const toggle = (k: string, label: string, description: string) => (
    <Toggle checked={!!s[k]} onChange={(v) => set(k, v)} label={label} description={description} />
  );
  return (
    <Paper className="max-w-3xl p-6">
      <div className="space-y-5">
        {toggle("enabled", "Use positions", "Hires and job changes pick a vacant position; people's job details follow the position.")}
        {toggle("require_position_on_hire", "Ask for a position on every hire and job change", "Only while positions are on.")}
        {toggle("sync_job_from_position", "Update job details from the position", "Department, designation, location, grade, cost centre and manager follow the seat.")}
        {toggle("allow_overfill", "Allow more people than seats", "Normally a full position refuses new people.")}
        {toggle("enforce_headcount_plan", "Keep seats within the approved headcount plan", "New positions and seat increases above the department's approved number are refused.")}
        <div className="border-t border-line pt-5" />
        {toggle("marketplace_enabled", "Internal job marketplace", "Employees can browse and apply for internal jobs and gigs.")}
        {toggle("manager_consent_default", "Ask the current manager by default", "New postings ask the applicant's manager to agree before the hiring manager sees them.")}
        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Months in role before applying"><NumberInput value={Number(s.min_months_in_role)} onChange={(v) => set("min_months_in_role", v)} min={0} max={60} /></Field>
          <Field label="Open applications at a time"><NumberInput value={Number(s.max_open_applications)} onChange={(v) => set("max_open_applications", v)} min={1} max={20} /></Field>
          <Field label="Good match from" hint="Skills match %"><NumberInput value={Number(s.match_threshold)} onChange={(v) => set("match_threshold", v)} min={0} max={100} suffix="%" /></Field>
        </div>
        <div className="border-t border-line pt-5" />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Ready-now successors per key position"><NumberInput value={Number(s.bench_ready_now_target)} onChange={(v) => set("bench_ready_now_target", v)} min={0} max={10} /></Field>
          <Field label="Successors in all per key position"><NumberInput value={Number(s.bench_total_target)} onChange={(v) => set("bench_total_target", v)} min={0} max={20} /></Field>
        </div>
        <div className="flex justify-end"><Button variant="primary" loading={saving} onClick={save}>Save settings</Button></div>
      </div>
    </Paper>
  );
}
