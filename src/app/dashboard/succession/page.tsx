"use client";

/*
 * Succession: plans for key positions (successors with readiness, risk and impact of
 * loss, development steps), bench strength, the nine-box from performance reviews and
 * talent pools. Details and forms open in modals.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Layers, Plus, ShieldCheck, Star, Users, UsersRound } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Avatar, AvatarGroup, Badge, Button, DataTable, FilterBar, Skeleton, StatCard, StatGrid, Tabs, type Column, type FilterValues } from "@/components/ui-kit";
import { useOrgOptions } from "@/components/people/hooks";
import { BENCH_TONE, Meter, PersonCell, URGENCY_LABEL, URGENCY_TONE, usePositionsMeta } from "@/components/positions/shared";
import { PoolDetail, PoolForm, ReadinessChips, SuccessionPlanDetail, SuccessionPlanForm } from "@/components/positions/succession-modals";
import type { Bench, NineBox, Pool, SuccessionPlan } from "@/components/positions/types";

type TabKey = "plans" | "bench" | "ninebox" | "pools";

export default function SuccessionPage() {
  const meta = usePositionsMeta();
  const params = useSearchParams();
  const router = useRouter();
  const t0 = params.get("tab") as TabKey;
  const [tab, setTabState] = useState<TabKey>(["plans", "bench", "ninebox", "pools"].includes(t0) ? t0 : "plans");
  const setTab = (t: TabKey) => { setTabState(t); router.replace(`/dashboard/succession${t === "plans" ? "" : `?tab=${t}`}`, { scroll: false }); };
  if (!meta) return <div><PageHeader title="Succession" /><Skeleton className="h-80 rounded-2xl" /></div>;
  if (!meta.can_succession) return <div><PageHeader title="Succession" /><Paper><EmptyState icon={ShieldCheck} title="Succession plans are private to HR" hint="Ask HR if you need access." /></Paper></div>;
  return (
    <div>
      <PageHeader title="Succession" description="Who could step into key positions, how ready they are and what they need to get there." />
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[
        { value: "plans", label: "Plans" }, { value: "bench", label: "Bench strength" }, { value: "ninebox", label: "Nine-box" }, { value: "pools", label: "Talent pools" }]} />
      {tab === "plans" && <PlansTab />}
      {tab === "bench" && <BenchTab />}
      {tab === "ninebox" && <NineBoxTab />}
      {tab === "pools" && <PoolsTab />}
    </div>
  );
}

function PlansTab() {
  const toast = useToast();
  const params = useSearchParams();
  const [rows, setRows] = useState<SuccessionPlan[] | null>(null);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [viewing, setViewing] = useState<string | null>(params.get("view"));
  const [editing, setEditing] = useState<{ plan: SuccessionPlan | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (filters.bench?.length) p.set("bench", filters.bench.join(","));
    if (filters.urgency?.length) p.set("urgency", filters.urgency.join(","));
    api.get<{ items: SuccessionPlan[] }>(`/succession/plans?${p}`).then((r) => setRows(r.items)).catch((e) => toast.error(e.message));
  }, [q, filters, nonce, toast]);
  const columns: Column<SuccessionPlan>[] = [
    { key: "pos", header: "Key position", cell: (r) => (
      <div className="min-w-0"><p className="truncate text-ink">{r.position.title}</p><p className="truncate text-[12px] text-faint">{[r.position.code, r.position.department].filter(Boolean).join(" · ")}</p></div>) },
    { key: "holder", header: "Held by", hideBelow: "md", cell: (r) => r.incumbents.length ? <PersonCell person={r.incumbents[0]} size={24} /> : <span className="text-amber-700">Vacant</span> },
    { key: "succ", header: "Successors", cell: (r) => (
      <div className="space-y-1"><AvatarGroup people={r.candidates.map((c) => ({ name: c.employee?.name ?? "?", src: c.employee?.photo }))} max={4} size={24} />
        <ReadinessChips counts={r.counts} /></div>) },
    { key: "bench", header: "Bench", cell: (r) => <Badge tone={BENCH_TONE[r.bench]}>{r.bench_label}</Badge> },
    { key: "risk", header: "Risk · impact", hideBelow: "lg", cell: (r) => <span className="text-[13px] text-muted">{r.risk_label} · {r.impact_label}</span> },
    { key: "urgency", header: "Priority", hideBelow: "sm", cell: (r) => <Badge tone={URGENCY_TONE[r.urgency]} dot>{URGENCY_LABEL[r.urgency]}</Badge> },
  ];
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterBar className="min-w-0 flex-1" search={q} onSearchChange={setQ} searchPlaceholder="Search positions"
          filters={[
            { key: "bench", label: "Bench", multiple: true, options: [{ value: "strong", label: "Strong" }, { value: "moderate", label: "Moderate" }, { value: "weak", label: "Weak" }, { value: "none", label: "No successors" }] },
            { key: "urgency", label: "Priority", multiple: true, options: [{ value: "urgent", label: "Urgent" }, { value: "watch", label: "Watch" }, { value: "stable", label: "Stable" }] },
          ]} values={filters} onChange={setFilters} />
        <Button variant="primary" icon={Plus} onClick={() => setEditing({ plan: null })}>New plan</Button>
      </div>
      <DataTable rows={rows ?? []} columns={columns} rowKey={(r) => r.uuid} loading={!rows} onRowClick={(r) => setViewing(r.uuid)}
        emptyTitle="No succession plans yet" emptyHint="Start with the positions the company can least afford to leave empty." />
      <SuccessionPlanDetail uuid={viewing} onClose={() => setViewing(null)} onChanged={refresh} onEdit={(p) => setEditing({ plan: p })} />
      <SuccessionPlanForm open={!!editing} plan={editing?.plan ?? null} onClose={() => setEditing(null)}
        onSaved={(p) => { setEditing(null); refresh(); setViewing(null); setTimeout(() => setViewing(p.uuid), 0); }} />
    </div>
  );
}

function BenchTab() {
  const toast = useToast();
  const [b, setB] = useState<Bench | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  useEffect(() => { api.get<Bench>("/succession/bench").then(setB).catch((e) => toast.error(e.message)); }, [toast]);
  if (!b) return <Skeleton className="h-80 rounded-2xl" />;
  const order = ["strong", "moderate", "weak", "none"];
  const tones: Record<string, string> = { strong: "bg-emerald-500/70", moderate: "bg-sky-500/70", weak: "bg-amber-400", none: "bg-rose-400" };
  return (
    <div className="space-y-6">
      <StatGrid>
        <StatCard label="Key positions" value={b.key_positions} icon={Star} hint={`${b.plans} with a plan`} />
        <StatCard label="Covered by a ready-now successor" value={`${b.coverage_pct}%`} icon={ShieldCheck} />
        <StatCard label="Successors" value={b.unique_successors} icon={Users} hint={`${b.ready_now} ready now · ${b.one_two_years} in 1-2 years · ${b.three_plus_years} in 3+`} />
        <StatCard label="Urgent gaps" value={b.urgent.length} icon={AlertTriangle} hint="High risk or impact without a strong bench" />
      </StatGrid>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <Paper className="p-5">
          <p className="mb-4 text-[15px] text-ink">Bench strength</p>
          <div className="mb-4 flex h-3 overflow-hidden rounded-full bg-sunken">
            {order.map((k) => b.plans ? <div key={k} className={tones[k]} style={{ width: `${(100 * (b.by_strength[k] ?? 0)) / b.plans}%` }} /> : null)}
          </div>
          <ul className="space-y-2">
            {order.map((k) => (
              <li key={k} className="flex items-center justify-between text-[13.5px]">
                <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${tones[k]}`} />{b.strength_labels[k]}</span>
                <span className="tabular text-muted">{b.by_strength[k] ?? 0}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12.5px] text-faint">Strong means at least {b.targets.ready_now} ready-now and {b.targets.total} successors in all (change in Positions settings).</p>
          {b.uncovered.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-2 text-[13px] text-amber-700">Key positions without a plan</p>
              <ul className="space-y-1 text-[13.5px] text-ink">{b.uncovered.map((u) => <li key={u.uuid}>{u.title} <span className="text-faint">· {u.code}</span></li>)}</ul>
            </div>
          )}
        </Paper>
        <Paper className="p-5">
          <p className="mb-4 text-[15px] text-ink">By department</p>
          {!b.by_department.length ? <p className="text-[13.5px] text-faint">No plans yet.</p> : (
            <table className="w-full text-[13.5px]">
              <thead><tr className="text-left text-[12px] text-faint"><th className="pb-2 font-normal">Department</th><th className="pb-2 text-right font-normal">Plans</th><th className="pb-2 text-right font-normal">Ready now</th><th className="pb-2 text-right font-normal">1-2 yrs</th><th className="pb-2 text-right font-normal">3+ yrs</th><th className="pb-2 pl-4 font-normal">Strong</th></tr></thead>
              <tbody className="divide-y divide-line">
                {b.by_department.map((d) => (
                  <tr key={d.department}>
                    <td className="py-2 text-ink">{d.department}</td><td className="py-2 text-right tabular">{d.plans}</td>
                    <td className="py-2 text-right tabular">{d.ready_now}</td><td className="py-2 text-right tabular">{d.one_two_years}</td><td className="py-2 text-right tabular">{d.three_plus_years}</td>
                    <td className="py-2 pl-4"><div className="w-24"><Meter value={d.strong} max={d.plans} tone="bg-emerald-500/70" /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Paper>
      </div>
      <Paper>
        <div className="border-b border-line px-5 py-3.5 text-[15px] text-ink">Every key position</div>
        <ul className="divide-y divide-line">
          {b.plans_list.map((p) => (
            <li key={p.uuid}>
              <button type="button" onClick={() => setViewing(p.uuid)} className="flex w-full flex-wrap items-center gap-4 px-5 py-3 text-left hover:bg-sunken/40">
                <span className="min-w-[200px] flex-1"><span className="text-ink">{p.position.title}</span><span className="ml-2 text-[12px] text-faint">{p.incumbents[0]?.name ?? "Vacant"}</span></span>
                <ReadinessChips counts={p.counts} />
                <Badge tone={BENCH_TONE[p.bench]}>{p.bench_label}</Badge>
                <Badge tone={URGENCY_TONE[p.urgency]} dot>{URGENCY_LABEL[p.urgency]}</Badge>
              </button>
            </li>
          ))}
        </ul>
      </Paper>
      <SuccessionPlanDetail uuid={viewing} onClose={() => setViewing(null)} onChanged={() => api.get<Bench>("/succession/bench").then(setB).catch(() => {})} onEdit={() => {}} />
    </div>
  );
}

function NineBoxTab() {
  const toast = useToast();
  const o = useOrgOptions();
  const [dept, setDept] = useState<FilterValues>({});
  const [nb, setNb] = useState<NineBox | null>(null);
  useEffect(() => {
    setNb(null);
    api.get<NineBox>(`/succession/nine-box${dept.department?.length ? `?department_id=${dept.department[0]}` : ""}`).then(setNb).catch((e) => toast.error(e.message));
  }, [dept, toast]);
  // Rows: potential high → low; columns: performance low → high. Box = (potential - 1) * 3 + performance.
  const rows = [3, 2, 1];
  const tint = (box: number) => [6, 8, 9].includes(box) ? "bg-emerald-50/60" : [1, 2, 4].includes(box) ? "bg-rose-50/50" : "bg-surface";
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterBar filters={[{ key: "department", label: "Department", options: o.departments.map((d) => ({ value: String(d.value), label: d.label })) }]} values={dept} onChange={setDept} />
        {nb && <span className="text-[13px] text-muted">{nb.reviewed} people with a review · rating and potential from the latest review cycle</span>}
      </div>
      {!nb ? <Skeleton className="h-[480px] rounded-2xl" /> : (
        <div className="flex gap-3">
          <div className="flex w-6 items-center justify-center"><span className="-rotate-90 whitespace-nowrap text-[12px] uppercase tracking-[0.08em] text-faint">Potential →</span></div>
          <div className="flex-1">
            <div className="grid grid-cols-3 gap-2">
              {rows.map((pot) => [1, 2, 3].map((perf) => {
                const box = (pot - 1) * 3 + perf;
                const cell = nb.boxes.find((b) => b.box === box);
                return (
                  <div key={box} className={`min-h-[140px] rounded-xl border border-line p-3 ${tint(box)}`}>
                    <div className="mb-2 flex items-center justify-between"><p className="text-[13px] text-ink">{cell?.label}</p><span className="text-[12px] tabular text-faint">{cell?.people.length ?? 0}</span></div>
                    <div className="flex flex-wrap gap-1.5">
                      {(cell?.people ?? []).slice(0, 12).map((p) => (
                        <span key={p.id} title={[p.rating != null ? `Rating ${p.rating}` : "", ...p.pools, ...p.successor_for.map((s) => `Successor: ${s.title} (${s.readiness_label})`)].filter(Boolean).join("\n")}
                          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface py-0.5 pl-0.5 pr-2 text-[12.5px] text-ink">
                          <Avatar name={p.name} src={p.photo} size={20} />{p.name.split(" ")[0]}
                          {p.successor_for.length > 0 && <Layers size={11} strokeWidth={1.4} className="text-primary" />}
                        </span>
                      ))}
                      {(cell?.people.length ?? 0) > 12 && <span className="text-[12px] text-faint">+{(cell?.people.length ?? 0) - 12}</span>}
                    </div>
                  </div>
                );
              }))}
            </div>
            <div className="mt-2 grid grid-cols-3 text-center text-[12px] uppercase tracking-[0.08em] text-faint"><span>Low</span><span>Performance →</span><span>High</span></div>
            {nb.unplaced.length > 0 && <p className="mt-4 text-[13px] text-muted">{nb.unplaced.length} reviewed without a potential or rating yet: {nb.unplaced.slice(0, 8).map((p) => p.name).join(", ")}{nb.unplaced.length > 8 ? "…" : ""}. Set potential on the performance nine-box page.</p>}
            <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-faint"><Layers size={12} strokeWidth={1.4} className="text-primary" />Already a successor for a key position.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PoolsTab() {
  const toast = useToast();
  const [rows, setRows] = useState<Pool[] | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ pool: Pool | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => { api.get<{ items: Pool[] }>("/succession/pools").then((r) => setRows(r.items)).catch((e) => toast.error(e.message)); }, [nonce, toast]);
  return (
    <div>
      <div className="mb-4 flex justify-end"><Button variant="primary" icon={Plus} onClick={() => setEditing({ pool: null })}>New pool</Button></div>
      {!rows ? <Skeleton className="h-48 rounded-2xl" /> : !rows.length ? (
        <Paper><EmptyState icon={UsersRound} title="No talent pools yet" hint="Group high potentials or future leaders to develop them together." /></Paper>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => (
            <button key={p.uuid} type="button" onClick={() => setViewing(p.uuid)} className="rounded-2xl border border-line bg-surface p-5 text-left transition-colors hover:border-line-strong">
              <div className="flex items-start justify-between gap-2"><p className="text-[15px] text-ink">{p.name}</p>{!p.active && <Badge>Inactive</Badge>}</div>
              {p.description && <p className="mt-1 line-clamp-2 text-[13px] text-muted">{p.description}</p>}
              <div className="mt-4 flex items-center justify-between">
                <AvatarGroup people={p.preview.map((m) => ({ name: m.name, src: m.photo }))} max={5} size={26} />
                <span className="text-[12.5px] text-faint">{p.members_count} member{p.members_count === 1 ? "" : "s"}{p.manager ? ` · ${p.manager.name}` : ""}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      <PoolDetail uuid={viewing} onClose={() => setViewing(null)} onChanged={() => setNonce((n) => n + 1)} onEdit={(p) => setEditing({ pool: p })} />
      <PoolForm open={!!editing} pool={editing?.pool ?? null} onClose={() => setEditing(null)}
        onSaved={(p) => { setEditing(null); setNonce((n) => n + 1); if (!viewing) setViewing(p.uuid); }} />
    </div>
  );
}

