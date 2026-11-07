"use client";

/*
 * Calibration board (performance admins; managers see their own teams read-only).
 *   - Pick a review cycle (?cycle=<uuid>) and narrow by department or manager.
 *   - The distribution: how many people sit on each rating now against the target
 *     share set on the cycle, with the gap in head-count.
 *   - Everyone with their score, the manager's proposed rating and the calibrated one.
 *     A row opens the adjust dialog: pick a rating, give a reason, or reset it.
 *   - Managers acknowledge changed ratings from their Reviews to-do list; disagreements
 *     show here and block publishing until they are settled.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCheck, RotateCcw, Scale, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, Field, FilterBar, Modal, ModalCancel, Select, Skeleton, StatCard, StatGrid, Textarea, useConfirm,
  type Column, type FilterValues,
} from "@/components/ui-kit";
import { PerformanceTabs, PersonInline, RatingPill, useData, useDepartments, usePerfMe } from "@/components/performance/shared";
import type { Board, DistributionRow, ParticipantRow, ScalePoint } from "@/components/performance/types";
import { ACK_LABEL, CycleSelect, CycleStatus, pickDefaultCycle, useCycles } from "@/components/performance/reviews/misc";

export default function CalibrationPage() {
  return <Suspense fallback={null}><Calibration /></Suspense>;
}

function Calibration() {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const params = useSearchParams();
  const { me } = usePerfMe();
  const { cycles } = useCycles();
  const departments = useDepartments();
  const [department, setDepartment] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [editing, setEditing] = useState<ParticipantRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const cycleId = params.get("cycle") ?? pickDefaultCycle(cycles);
  const pickCycle = (uuid: string) => router.replace(`/dashboard/performance/calibration?cycle=${uuid}`);
  const path = cycleId ? `/performance/cycles/${cycleId}/calibration${department ? `?department_id=${department}` : ""}` : null;
  const { data: board, loading, refresh } = useData<Board>(path, "Couldn't load the calibration board");

  const cycle = board?.cycle;
  const scale = cycle?.rating_scale?.points ?? [];
  const canEdit = !!me?.is_admin && !!cycle && ["active", "calibration"].includes(cycle.status);

  const managers = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of board?.participants ?? []) if (p.manager) m.set(String(p.manager.id), p.manager.name);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, label]) => ({ value, label }));
  }, [board]);

  const rows = useMemo(() => {
    let list = board?.participants ?? [];
    if (search) { const q = search.toLowerCase(); list = list.filter((p) => p.employee?.name.toLowerCase().includes(q)); }
    const mgr = filters.manager?.[0];
    if (mgr) list = list.filter((p) => String(p.manager?.id) === mgr);
    const st = filters.state?.[0];
    if (st === "changed") list = list.filter((p) => p.calibrated_rating !== null && p.calibrated_rating !== p.proposed_rating);
    if (st === "unrated") list = list.filter((p) => p.current_rating === null);
    if (st === "ack") list = list.filter((p) => p.ack_status === "pending" || p.ack_status === "declined");
    const rating = filters.rating?.[0];
    if (rating) list = list.filter((p) => String(p.current_rating) === rating);
    return list;
  }, [board, search, filters]);

  async function act(key: string, fn: () => Promise<unknown>, ok: (r: unknown) => string) {
    setBusy(key);
    try { const r = await fn(); toast.success(ok(r)); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(null); }
  }
  const startCalibration = async () => {
    if (!cycle || !(await confirm({ title: "Start calibration?", message: "Scores are worked out again from the submitted reviews. Reviews stay open.", confirmLabel: "Start" }))) return;
    act("start", () => api.post(`/performance/cycles/${cycle.uuid}/status`, { status: "calibration" }), () => "Calibration started");
  };
  const publish = async () => {
    if (!cycle || !(await confirm({ title: "Publish results?", message: "Everyone with a rating sees it, with their letter. This can't be undone.", confirmLabel: "Publish" }))) return;
    act("publish", () => api.post(`/performance/cycles/${cycle.uuid}/publish`, {}), (r) => {
      const x = r as { published: number; skipped: number };
      return `Published ${x.published}${x.skipped ? ` · ${x.skipped} still without a rating` : ""}`;
    });
  };

  const columns: Column<ParticipantRow>[] = [
    { key: "name", header: "Employee", sortable: true, sortValue: (p) => p.employee?.name, cell: (p) => <PersonInline person={p.employee} sub={[p.employee?.designation, p.employee?.department].filter(Boolean).join(" · ")} /> },
    { key: "manager", header: "Manager", hideBelow: "lg", cell: (p) => <span className="text-muted">{p.manager?.name ?? "—"}</span> },
    { key: "score", header: "Score", align: "right", hideBelow: "md", sortable: true, sortValue: (p) => p.computed_score ?? -1, cell: (p) => p.computed_score != null ? <span className="tabular">{p.computed_score.toFixed(2)}</span> : <span className="text-faint">—</span> },
    { key: "proposed", header: "Proposed", sortable: true, sortValue: (p) => p.proposed_rating ?? -1, cell: (p) => <RatingPill value={p.proposed_rating} label={p.proposed_label} scale={scale} muted={p.calibrated_rating !== null} /> },
    {
      key: "calibrated", header: "Calibrated", sortable: true, sortValue: (p) => p.current_rating ?? -1, cell: (p) => p.calibrated_rating === null ? <span className="text-faint">—</span> : (
        <div className="min-w-0">
          <RatingPill value={p.calibrated_rating} label={p.calibrated_label} scale={scale} />
          {p.calibration_reason && <p className="mt-1 max-w-[260px] truncate text-[12px] text-muted" title={p.calibration_reason}>{p.calibration_reason}</p>}
        </div>
      ),
    },
    {
      key: "ack", header: "Manager", hideBelow: "md", cell: (p) => {
        if (p.published_at) return <Badge tone="good" dot>Published</Badge>;
        const a = p.ack_status ? ACK_LABEL[p.ack_status] : null;
        return a ? <span title={p.ack_note ?? undefined}><Badge tone={a.tone} dot>{a.label}</Badge></span> : <span className="text-faint">—</span>;
      },
    },
  ];

  return (
    <div>
      <PageHeader eyebrow="Talent" title="Calibration" description="Even out ratings across teams before results are published." />
      <PerformanceTabs me={me} />

      {cycles && !cycles.some((c) => c.status !== "draft") ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState icon={Scale} title="No running review cycles" hint="Launch a review cycle first. Its people show up here once reviews come in." />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            {cycles ? <CycleSelect cycles={cycles} value={cycleId} onChange={pickCycle} /> : <Skeleton className="h-9 w-[300px]" />}
            <Select<number> className="w-[220px]" value={department} onChange={setDepartment} options={departments} placeholder="All departments" clearable />
            {cycle && <CycleStatus status={cycle.status} />}
            <div className="ml-auto flex gap-2">
              {me?.is_admin && cycle?.status === "active" && <Button icon={Scale} loading={busy === "start"} onClick={startCalibration}>Start calibration</Button>}
              {me?.is_admin && cycle && ["active", "calibration", "published"].includes(cycle.status) && (
                <Button variant="primary" icon={Send} loading={busy === "publish"} disabled={!!board?.declined_ack} onClick={publish}>Publish results</Button>
              )}
            </div>
          </div>

          {!board ? (
            <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-56" /><Skeleton className="h-72" /></div>
          ) : (
            <>
              {board.declined_ack > 0 && (
                <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/60 px-5 py-4 text-[13.5px] text-rose-800">
                  <AlertTriangle size={18} strokeWidth={1.4} className="mt-0.5 shrink-0" />
                  <span>{board.declined_ack} {board.declined_ack === 1 ? "manager disagrees" : "managers disagree"} with a calibrated rating. Look at those again (filter by “Needs the manager”) before publishing.</span>
                </div>
              )}
              <StatGrid>
                <StatCard label="People" value={board.participants.length} />
                <StatCard label="Without a rating" value={board.unrated} hint={board.unrated ? "Reviews still to come in" : "Everyone is rated"} />
                <StatCard label="Changed in calibration" value={board.participants.filter((p) => p.calibrated_rating !== null && p.calibrated_rating !== p.proposed_rating).length} />
                <StatCard label="Waiting for managers" value={board.pending_ack} hint={board.declined_ack ? `${board.declined_ack} disagreed` : undefined} />
              </StatGrid>
              <Distribution rows={board.distribution} scale={scale} onPick={(v) => setFilters((f) => ({ ...f, rating: f.rating?.[0] === String(v) ? [] : [String(v)] }))} active={filters.rating?.[0]} />
              <div className="space-y-3">
                <FilterBar search={search} onSearchChange={setSearch} searchPlaceholder="Search people" values={filters} onChange={setFilters}
                  filters={[
                    { key: "state", label: "Show", options: [{ value: "changed", label: "Changed" }, { value: "unrated", label: "Without a rating" }, { value: "ack", label: "Needs the manager" }] },
                    { key: "manager", label: "Manager", options: managers },
                    { key: "rating", label: "Rating", options: scale.map((p) => ({ value: String(p.value), label: `${p.value} · ${p.label}` })) },
                  ]} />
                <DataTable rows={rows} loading={loading && !rows.length} rowKey={(p) => p.uuid} columns={columns}
                  defaultSort={{ key: "calibrated", dir: "desc" }}
                  onRowClick={canEdit ? (p) => { if (!p.published_at) setEditing(p); } : undefined}
                  emptyTitle="Nobody here" emptyHint="Try another filter or department." />
              </div>
            </>
          )}
        </div>
      )}
      <AdjustModal row={editing} scale={scale} requireReason={!!cycle?.settings.calibration.require_reason}
        onClose={() => setEditing(null)} onDone={refresh} />
    </div>
  );
}

/* ── Distribution ────────────────────────────────────────────────────── */

function Distribution({ rows, scale, onPick, active }: { rows: DistributionRow[]; scale: ScalePoint[]; onPick: (v: number) => void; active?: string }) {
  const hasTarget = rows.some((r) => r.target_pct > 0);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.actual_pct, r.target_pct)));
  const ordered = [...rows].sort((a, b) => b.value - a.value);
  return (
    <section className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-light text-ink">Distribution</h2>
        <div className="flex items-center gap-4 text-[12.5px] text-muted">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Now</span>
          {hasTarget && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-ink/50" /> Target</span>}
        </div>
      </div>
      <div className="space-y-2.5">
        {ordered.map((r) => {
          const on = active === String(r.value);
          const gap = r.gap ?? 0;
          return (
            <button key={r.value} type="button" onClick={() => onPick(r.value)}
              className={`grid w-full grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-4 rounded-lg px-2 py-1.5 text-left transition-colors ${on ? "bg-primary-soft/60" : "hover:bg-sunken/60"}`}>
              <RatingPill value={r.value} label={r.label} scale={scale} />
              <div className="relative h-5 rounded bg-sunken">
                <div className="h-full rounded bg-primary/80 transition-[width] duration-300" style={{ width: `${(r.actual_pct / max) * 100}%` }} />
                {hasTarget && <span className="absolute top-[-3px] h-[26px] w-0.5 rounded bg-ink/60" style={{ left: `calc(${(r.target_pct / max) * 100}% - 1px)` }} title={`Target ${r.target_pct}%`} />}
              </div>
              <div className="w-[150px] text-right text-[13px] tabular">
                <span className="text-ink">{r.count}</span> <span className="text-muted">· {r.actual_pct.toFixed(0)}%</span>
                {hasTarget && r.target_count !== null && (
                  <span className={`ml-2 ${gap > 0 ? "text-amber-700" : gap < 0 ? "text-sky-700" : "text-emerald-700"}`}>
                    {gap === 0 ? "on target" : gap > 0 ? `+${gap}` : gap}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {!hasTarget && <p className="mt-3 text-[12.5px] text-muted">No target distribution is set on this cycle. Add one in the cycle settings to see the gaps.</p>}
    </section>
  );
}

/* ── Adjust one rating ───────────────────────────────────────────────── */

function AdjustModal({ row, scale, requireReason, onClose, onDone }: {
  row: ParticipantRow | null; scale: ScalePoint[]; requireReason: boolean; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const [rating, setRating] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (row) { setRating(row.calibrated_rating ?? row.proposed_rating); setReason(row.calibration_reason ?? ""); }
  }, [row]);
  const changed = !!row && rating !== null && rating !== row.proposed_rating;

  async function save(value: number | null) {
    if (!row) return;
    setBusy(true);
    try {
      await api.put(`/performance/participants/${row.uuid}/calibration`, { rating: value, reason: value === null ? null : reason || null });
      toast.success(value === null ? "Back to the proposed rating" : "Rating calibrated");
      onDone(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={!!row} onClose={onClose} size="md" busy={busy} title="Calibrate rating"
      description={row ? `${row.employee?.name}${row.manager ? ` · reviewed by ${row.manager.name}` : ""}` : undefined}
      footerStart={row?.calibrated_rating !== null && row?.calibrated_rating !== undefined
        ? <Button variant="ghost" icon={RotateCcw} disabled={busy} onClick={() => save(null)}>Reset</Button> : undefined}
      footer={<><ModalCancel /><Button variant="primary" icon={CheckCheck} loading={busy} disabled={rating === null || (requireReason && changed && !reason.trim())} onClick={() => save(rating)}>Save</Button></>}>
      {row && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-line p-4">
              <p className="text-[12.5px] text-muted">Score from reviews</p>
              <p className="mt-1.5 text-[22px] font-extralight text-ink tabular">{row.computed_score != null ? row.computed_score.toFixed(2) : "—"}</p>
            </div>
            <div className="rounded-xl border border-line p-4">
              <p className="text-[12.5px] text-muted">Proposed</p>
              <div className="mt-2"><RatingPill value={row.proposed_rating} label={row.proposed_label} scale={scale} /></div>
            </div>
          </div>
          <Field label="Calibrated rating" required>
            <div className="grid gap-2">
              {[...scale].sort((a, b) => b.value - a.value).map((p) => (
                <button key={p.value} type="button" onClick={() => setRating(p.value)}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors ${rating === p.value ? "border-primary bg-primary-soft/50" : "border-line hover:border-line-strong"}`}>
                  <RatingPill value={p.value} label={p.label} scale={scale} />
                  {p.description && <span className="min-w-0 truncate text-[12.5px] text-muted">{p.description}</span>}
                  {p.value === row.proposed_rating && <span className="ml-auto text-[12px] text-faint">proposed</span>}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Reason" required={requireReason && changed} hint="The manager sees this when asked to acknowledge the change.">
            <Textarea value={reason} onValueChange={setReason} rows={3} autoGrow />
          </Field>
          {row.ack_status === "declined" && row.ack_note && (
            <p className="rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-[13.5px] text-rose-800">The manager disagreed: “{row.ack_note}”</p>
          )}
        </div>
      )}
    </Modal>
  );
}
