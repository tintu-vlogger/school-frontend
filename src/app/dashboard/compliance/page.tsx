"use client";

/*
 * Compliance: what is due (statutory payments, returns, registers), people risks and
 * law updates, filtered by legal entity and state.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, Clock, ShieldCheck, Users } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { EmptyState, PageHeader } from "@/components/shell/page";
import {
  Badge, DataTable, Select, Skeleton, StatCard, Tabs, type Column,
} from "@/components/ui-kit";
import {
  STATUS_META, dueText, formatAmount, itemWhere, type ComplianceDashboard, type ComplianceItem, type ComplianceStatus,
} from "@/components/insights/compliance/types";
import { ComplianceItemModal } from "@/components/insights/compliance/item-modal";
import { RiskCards } from "@/components/insights/compliance/risk-cards";
import { LawNotices } from "@/components/insights/compliance/notices";

type Show = "open" | "all" | ComplianceStatus;

export default function CompliancePage() {
  const [entity, setEntity] = useState<number | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [data, setData] = useState<ComplianceDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState<Show>("open");
  const [selected, setSelected] = useState<ComplianceItem | null>(null);

  useEffect(() => {
    let live = true;
    const qs = new URLSearchParams();
    if (entity !== null) qs.set("entity_id", String(entity));
    if (state) qs.set("state", state);
    const q = qs.toString();
    Promise.resolve().then(() => { if (live) setLoading(true); });
    api.get<ComplianceDashboard>(`/compliance/dashboard${q ? `?${q}` : ""}`)
      .then((r) => { if (live) { setData(r); setError(null); } })
      .catch((e: Error) => { if (live) setError(e.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [entity, state, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const items = useMemo(() => data?.items ?? [], [data]);
  const counts = useMemo(() => {
    const c = { open: 0, late: 0, pending: 0, done: 0, not_applicable: 0 };
    for (const i of items) {
      c[i.status] += 1;
      if (i.status === "late" || i.status === "pending") c.open += 1;
    }
    return c;
  }, [items]);
  const shown = useMemo(() => items.filter((i) =>
    show === "all" ? true : show === "open" ? i.status === "late" || i.status === "pending" : i.status === show), [items, show]);

  const columns: Column<ComplianceItem>[] = [
    {
      key: "what", header: "What", sortable: true, sortValue: (r) => r.label,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-[14px] text-ink">{r.label}</p>
          {r.period && <p className="text-[12.5px] text-faint">{r.period}</p>}
        </div>
      ),
    },
    {
      key: "where", header: "Entity / state", hideBelow: "lg",
      cell: (r) => <span className="text-[13.5px] text-muted">{itemWhere(r)}</span>,
    },
    {
      key: "due", header: "Due", width: "150px", sortable: true, sortValue: (r) => r.due_date,
      cell: (r) => {
        const t = dueText(r);
        return (
          <div>
            <p className="whitespace-nowrap text-[13.5px] text-ink">{formatDate(r.due_date)}</p>
            {t && <p className={`text-[12.5px] ${r.status === "late" ? "text-rose-700" : r.days_left <= 7 ? "text-amber-700" : "text-faint"}`}>{t}</p>}
            {!t && r.done_on && <p className="text-[12.5px] text-faint">Done {formatDate(r.done_on)}</p>}
          </div>
        );
      },
    },
    {
      key: "amount", header: "Amount", align: "right", hideBelow: "md", sortable: true, sortValue: (r) => Number(r.amount ?? 0),
      cell: (r) => <span className="tabular text-[13.5px] text-ink">{formatAmount(r.amount) ?? <span className="text-faint">—</span>}</span>,
    },
    {
      key: "status", header: "Status", sortable: true, sortValue: (r) => r.status,
      cell: (r) => <Badge tone={STATUS_META[r.status].tone} dot>{STATUS_META[r.status].label}</Badge>,
    },
    {
      key: "source", header: "From", hideBelow: "lg",
      cell: (r) => <span className="text-[13px] text-muted">{r.source === "payroll" ? "Payroll" : "Compliance"}</span>,
    },
  ];

  const s = data?.summary;
  const filtersOn = entity !== null || !!state;

  return (
    <div>
      <PageHeader
        title="Compliance"
        description="Statutory dues, people risks and law updates in one place. Mark things as done when they are filed or paid."
        actions={data && (
          <>
            <div className="w-56">
              <Select<number> value={entity} onChange={(v) => setEntity(v)} clearable placeholder="All legal entities"
                aria-label="Legal entity" options={data.filters.entities.map((e) => ({ value: e.value, label: e.label }))} />
            </div>
            <div className="w-48">
              <Select<string> value={state} onChange={(v) => setState(v)} clearable placeholder="All states"
                aria-label="State" options={data.filters.states.map((e) => ({ value: e.value, label: e.label }))} />
            </div>
          </>
        )}
      />

      {error && !data ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState icon={ShieldCheck} title="Compliance isn't available" hint={error} />
        </div>
      ) : (
        <div className="space-y-10">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {!s ? Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="rounded-2xl border border-line bg-surface p-5"><Skeleton className="h-4 w-24" /><Skeleton className="mt-4 h-8 w-12" /></div>
            )) : (
              <>
                <StatCard label="Late" value={<span className={s.late ? "text-rose-700" : undefined}>{s.late}</span>} icon={AlertTriangle}
                  hint={s.late ? "Past the due date" : "Nothing overdue"} onClick={() => setShow("late")} />
                <StatCard label="Due in 7 days" value={<span className={s.due_soon ? "text-amber-700" : undefined}>{s.due_soon}</span>} icon={CalendarClock}
                  hint="Coming up this week" onClick={() => setShow("open")} />
                <StatCard label="Pending" value={s.pending} icon={Clock} hint="Not yet due" onClick={() => setShow("pending")} />
                <StatCard label="Done" value={s.done} icon={CheckCircle2} hint="Filed or paid" onClick={() => setShow("done")} />
                <StatCard label="People risks" value={<span className={s.risks ? "text-rose-700" : "text-emerald-700"}>{s.risks}</span>} icon={Users}
                  hint={s.risks ? "People need attention" : "All clear"}
                  onClick={() => document.getElementById("people-risks")?.scrollIntoView({ behavior: "smooth" })} />
              </>
            )}
          </div>

          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[17px] font-light text-ink">What is due</h2>
                <p className="mt-0.5 text-[13px] text-muted">
                  Payroll dues update from pay runs; the rest you mark here.{filtersOn ? " Filtered." : ""}
                </p>
              </div>
              <Tabs<Show> variant="pill" value={show} onChange={setShow} items={[
                { value: "open", label: "Open", count: counts.open },
                { value: "late", label: "Late", count: counts.late },
                { value: "done", label: "Done", count: counts.done },
                { value: "not_applicable", label: "Not needed", count: counts.not_applicable },
                { value: "all", label: "All", count: items.length },
              ]} />
            </div>
            <DataTable
              rows={shown} rowKey={(r) => r.key} columns={columns} loading={loading}
              onRowClick={setSelected}
              rowClassName={(r) => (r.status === "done" || r.status === "not_applicable" ? "opacity-70" : undefined)}
              emptyIcon={ShieldCheck}
              emptyTitle={show === "open" ? "Nothing due" : show === "late" ? "Nothing is late" : "Nothing here"}
              emptyHint={show === "open" || show === "late" ? "You're up to date." : undefined}
            />
          </section>

          <section id="people-risks" className="scroll-mt-6">
            <div className="mb-3">
              <h2 className="text-[17px] font-light text-ink">People risks</h2>
              <p className="mt-0.5 text-[13px] text-muted">Checks across salaries, settlements and records that could lead to a penalty.</p>
            </div>
            {!data ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => <div key={i} className="rounded-2xl border border-line bg-surface p-5"><Skeleton className="h-4 w-40" /><Skeleton className="mt-4 h-8 w-10" /><Skeleton className="mt-4 h-3 w-full" /></div>)}
              </div>
            ) : data.alerts.length ? <RiskCards alerts={data.alerts} /> : (
              <div className="rounded-2xl border border-line bg-surface"><EmptyState icon={CheckCircle2} title="All clear" hint="No people risks found." /></div>
            )}
          </section>

          <section>
            <div className="mb-3">
              <h2 className="text-[17px] font-light text-ink">Law updates</h2>
              <p className="mt-0.5 text-[13px] text-muted">Changes in labour law that affect how you pay and keep records.</p>
            </div>
            {!data ? (
              <div className="space-y-3 rounded-2xl border border-line bg-surface p-5"><Skeleton className="h-4 w-1/2" /><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-4/5" /></div>
            ) : <LawNotices notices={data.notices} onChanged={reload} />}
          </section>
        </div>
      )}

      <ComplianceItemModal item={selected} onClose={() => setSelected(null)} onChanged={reload} />
    </div>
  );
}
