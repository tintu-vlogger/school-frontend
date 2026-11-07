"use client";

/*
 * Goals & OKRs: my goals, my team's goals and the company alignment tree for a period.
 * Cards open the objective in a modal (?view=<uuid> keeps it in the address); add, edit
 * and check-in are modals too.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlarmClock, Building2, ChevronDown, ChevronRight, Flag, Plus, Target, TrendingUp, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/datetime";
import { EmptyState, PageHeader } from "@/components/shell/page";
import { Avatar, Button, FilterBar, Select, Skeleton, StatCard, Tabs, type FilterValues } from "@/components/ui-kit";
import {
  GoalStatusBadge, LevelBadge, ProgressBar, STROKE, statusTone, useData, useList, usePerfMe, usePerfSettings,
} from "@/components/performance/shared";
import type { GoalStatus, GoalSummary, Objective, Period } from "@/components/performance/types";

type TreeNode = Omit<Objective, "children"> & { children: TreeNode[] };
import { ObjectiveCard } from "@/components/performance/goals/objective-card";
import { CheckinModal, ObjectiveDetailModal, ObjectiveFormModal } from "@/components/performance/goals/objective-modals";

type Tab = "mine" | "team" | "company";

export default function GoalsPage() {
  return <Suspense fallback={null}><Goals /></Suspense>;
}

function Goals() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { user } = useAuth();
  const { me } = usePerfMe();
  const settings = usePerfSettings();
  const statuses = settings?.okr.statuses;
  const { rows: periods } = useList<Period>("/performance/periods", "Couldn't load periods");
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [tabChoice, setTab] = useState<Tab | null>(null);
  const [nonce, setNonce] = useState(0);
  const [form, setForm] = useState<{ open: boolean; objective: Objective | null; level: Objective["level"] }>({ open: false, objective: null, level: "individual" });
  const [formKey, setFormKey] = useState(0);
  const [checkin, setCheckin] = useState<{ o: Objective; kr?: string } | null>(null);
  const viewId = params.get("view");

  const period = periods.find((p) => p.id === periodId) ?? periods.find((p) => p.kind === "quarter" && p.current) ?? null;
  const pid = period?.id ?? null;
  const tab: Tab = tabChoice ?? (me && !me.employee_id ? "company" : "mine");
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const setView = useCallback((uuid: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (uuid) sp.set("view", uuid); else sp.delete("view");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const summary = useData<GoalSummary>(pid ? `/performance/objectives/summary?period_id=${pid}&n=${nonce}` : null).data;

  const canTeam = !!(me?.is_manager || me?.is_admin);
  const tabs = [
    ...(me?.employee_id ? [{ value: "mine" as Tab, label: "My goals", icon: Target }] : []),
    ...(canTeam ? [{ value: "team" as Tab, label: "Team goals", icon: Users }] : []),
    { value: "company" as Tab, label: "Company", icon: Building2 },
  ];

  const periodOptions = periods.map((p) => ({ value: p.id, label: p.name, description: `${formatDate(p.start_date)} – ${formatDate(p.end_date)}${p.current ? " · now" : ""}` }));

  const openAdd = (level: Objective["level"]) => { setFormKey((k) => k + 1); setForm({ open: true, objective: null, level }); };
  const openEdit = (o: Objective) => { setFormKey((k) => k + 1); setForm({ open: true, objective: o, level: o.level }); };

  return (
    <div>
      <PageHeader
        eyebrow="Talent"
        title="Goals & OKRs"
        description="Objectives and key results for the company, departments, teams and people, rolled up as they are aligned."
        actions={<>
          <div className="w-56"><Select value={pid} onChange={(v) => setPeriodId(v)} options={periodOptions} placeholder="Period" aria-label="Period" /></div>
          <Button variant="primary" icon={Plus} onClick={() => openAdd(tab === "company" && me?.is_admin ? "company" : tab === "team" ? "team" : "individual")}>Add objective</Button>
        </>}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="My progress" icon={Target} value={summary ? `${Math.round(summary.my_progress)}%` : "—"} hint={summary ? `${summary.my_count} objective${summary.my_count === 1 ? "" : "s"}` : undefined} />
        <StatCard label="Company progress" icon={TrendingUp} value={summary ? `${Math.round(summary.company_progress)}%` : "—"} hint={summary ? `${summary.company_count} company objectives` : undefined} />
        <StatCard label="Check-ins coming up" icon={AlarmClock} value={summary ? summary.checkins_due.filter((d) => d.next_checkin).length : "—"}
          hint={summary?.checkins_due.find((d) => d.next_checkin)?.next_checkin ? `next ${formatDate(summary.checkins_due.filter((d) => d.next_checkin).map((d) => d.next_checkin!).sort()[0], { year: undefined })}` : undefined} />
        <StatCard label="Missed check-ins" icon={Flag} value={summary ? summary.missed_total : "—"} hint={summary && summary.missed_total > 0 ? "on key results you own" : "all caught up"} />
      </div>

      <Tabs value={tab} onChange={(v) => setTab(v)} items={tabs} className="mb-6" />

      {pid && tab === "mine" && <ObjectiveGrid key={`m${pid}${nonce}`} path={`/performance/objectives?period_id=${pid}&scope=mine`} statuses={statuses}
        onOpen={setView} onCheckin={(o) => setCheckin({ o })} showOwner={false}
        empty={{ title: "No goals for this period yet", hint: "Add an objective and align it with your team's or the company's.", action: <Button variant="primary" icon={Plus} onClick={() => openAdd("individual")}>Add my first objective</Button> }} />}
      {pid && tab === "team" && <ObjectiveGrid key={`t${pid}${nonce}`} path={`/performance/objectives?period_id=${pid}&scope=team`} statuses={statuses}
        onOpen={setView} onCheckin={(o) => setCheckin({ o })} filterable
        empty={{ title: "Your team has no goals for this period", hint: "Add a team objective, then help each person align theirs." }} />}
      {pid && tab === "company" && <CompanyTree key={`c${pid}${nonce}`} periodId={pid} statuses={statuses} onOpen={setView} />}
      {!pid && <Skeleton className="h-64" />}

      <ObjectiveDetailModal uuid={viewId} statuses={statuses} onClose={() => setView(null)} onOpen={setView} onChanged={refresh}
        onEdit={(o) => { setView(null); openEdit(o); }} onCheckin={(o, kr) => setCheckin({ o, kr })} />
      <ObjectiveFormModal key={formKey} open={form.open} objective={form.objective} periods={periods} periodId={pid} defaultLevel={form.level}
        canCompany={!!me?.is_admin} me={{ id: user?.employee_id ?? null, name: user?.full_name }}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={(uuid) => { setForm((f) => ({ ...f, open: false })); refresh(); setView(uuid); }} />
      {checkin && <CheckinModal key={checkin.o.uuid + (checkin.kr ?? "")} objective={checkin.o} krUuid={checkin.kr}
        onClose={() => setCheckin(null)} onSaved={() => { setCheckin(null); refresh(); }} />}
    </div>
  );
}

function ObjectiveGrid({ path, statuses, onOpen, onCheckin, empty, showOwner = true, filterable }: {
  path: string; statuses?: GoalStatus[]; onOpen: (uuid: string) => void; onCheckin: (o: Objective) => void;
  empty: { title: string; hint: string; action?: React.ReactNode }; showOwner?: boolean; filterable?: boolean;
}) {
  const { rows, loading } = useList<Objective>(path, "Couldn't load goals");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const owners = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((o) => o.owner && m.set(String(o.owner.id), o.owner.name));
    return [...m].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);
  const shown = rows.filter((o) => (!q || o.title.toLowerCase().includes(q.toLowerCase()) || o.owner?.name.toLowerCase().includes(q.toLowerCase()))
    && (!filters.owner?.length || filters.owner.includes(String(o.owner?.id)))
    && (!filters.status?.length || filters.status.includes(o.status_key ?? "")));

  if (loading) return <div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}</div>;
  if (!rows.length) return <div className="rounded-2xl border border-line bg-surface"><EmptyState icon={Target} title={empty.title} hint={empty.hint} action={empty.action} /></div>;
  return (
    <>
      {filterable && (
        <FilterBar searchPlaceholder="Search goals or people" onSearchChange={setQ} values={filters} onChange={setFilters}
          filters={[{ key: "owner", label: "Person", multiple: true, options: owners },
            { key: "status", label: "Status", multiple: true, options: (statuses ?? []).map((s) => ({ value: s.key, label: s.label })) }]}
          actions={<span className="text-[13px] text-faint tabular">{shown.length} objectives</span>} />
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {shown.map((o) => <ObjectiveCard key={o.uuid} objective={o} statuses={statuses} showOwner={showOwner} onOpen={() => onOpen(o.uuid)} onCheckin={() => onCheckin(o)} />)}
      </div>
      {!shown.length && <p className="py-10 text-center text-[14px] text-muted">No goals match these filters.</p>}
    </>
  );
}

function CompanyTree({ periodId, statuses, onOpen }: { periodId: number; statuses?: GoalStatus[]; onOpen: (uuid: string) => void }) {
  const { data, loading } = useData<TreeNode[]>(`/performance/objectives/tree?period_id=${periodId}`, "Couldn't load the goal tree");
  if (loading) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>;
  const roots = data ?? [];
  if (!roots.length) return <div className="rounded-2xl border border-line bg-surface"><EmptyState icon={Building2} title="No company goals for this period" hint="Company objectives sit at the top; department, team and personal goals align beneath them." /></div>;
  const tops = roots.filter((r) => r.level === "company");
  const loose = roots.filter((r) => r.level !== "company");
  return (
    <div className="space-y-4">
      {tops.map((n) => (
        <div key={n.uuid} className="rounded-2xl border border-line bg-surface p-2">
          <TreeRow node={n} depth={0} statuses={statuses} onOpen={onOpen} defaultOpen />
        </div>
      ))}
      {loose.length > 0 && (
        <div className="rounded-2xl border border-dashed border-line-strong bg-surface p-2">
          <p className="px-3 pb-1 pt-2 text-[12px] uppercase tracking-[0.08em] text-faint">Not aligned to a company objective</p>
          {loose.map((n) => <TreeRow key={n.uuid} node={n} depth={0} statuses={statuses} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

function TreeRow({ node, depth, statuses, onOpen, defaultOpen }: { node: TreeNode; depth: number; statuses?: GoalStatus[]; onOpen: (uuid: string) => void; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen || depth < 1);
  useEffect(() => { if (defaultOpen) setOpen(true); }, [defaultOpen]);
  const has = node.children.length > 0;
  const big = depth === 0 && node.level === "company";
  return (
    <div>
      <div className={`group flex items-center gap-3 rounded-xl px-3 ${big ? "py-3.5" : "py-2.5"} transition-colors hover:bg-sunken/60`} style={{ paddingLeft: 12 + depth * 28 }}>
        <button type="button" onClick={() => setOpen((o) => !o)} disabled={!has} aria-label={open ? "Collapse" : "Expand"}
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted ${has ? "hover:bg-surface" : "opacity-0"}`}>
          {open ? <ChevronDown size={15} strokeWidth={STROKE} /> : <ChevronRight size={15} strokeWidth={STROKE} />}
        </button>
        <button type="button" onClick={() => onOpen(node.uuid)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
          <span className="min-w-0 flex-1">
            <span className="mb-0.5 flex flex-wrap items-center gap-2">
              <LevelBadge level={node.level} />
              {node.owner && <span className="flex items-center gap-1.5 text-[12.5px] text-muted"><Avatar name={node.owner.name} src={node.owner.photo} size={18} />{node.owner.name}</span>}
              {node.department && node.level === "department" && <span className="text-[12.5px] text-faint">{node.department.name}</span>}
            </span>
            <span className={`block truncate ${big ? "text-[16px]" : "text-[14px]"} text-ink`}>{node.title}</span>
          </span>
          <span className="hidden w-28 shrink-0 sm:block"><GoalStatusBadge statusKey={node.status_key} statuses={statuses} /></span>
          <span className="hidden w-40 shrink-0 md:block"><ProgressBar value={node.progress} expected={node.expected_progress} tone={statusTone(statuses, node.status_key)} /></span>
          <span className={`tabular w-12 shrink-0 text-right ${big ? "text-[18px] font-light" : "text-[13.5px]"} text-ink`}>{Math.round(node.progress)}%</span>
        </button>
      </div>
      {open && has && (
        <div className="relative">
          <span className="absolute bottom-3 top-0 w-px bg-line" style={{ left: 24 + depth * 28 }} />
          {node.children.map((c) => <TreeRow key={c.uuid} node={c} depth={depth + 1} statuses={statuses} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}
