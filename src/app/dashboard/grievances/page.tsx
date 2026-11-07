"use client";

/*
 * Grievances and POSH. Everyone: raise a concern (named or anonymous), follow up with a
 * tracking code, see their own cases and who sits on the committees. Committee members:
 * the grievance and POSH queues, case detail with timeline and actions, the annual POSH
 * report and (HR) committee set-up and time limits.
 */
import { useCallback, useEffect, useState } from "react";
import { AlarmClock, CheckCircle2, FileBarChart, Inbox, KeyRound, Lock, Plus, Settings2, ShieldAlert, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, FilterBar, Skeleton, StatCard, Tabs, formatDisplayDate, type Column, type FilterValues, type TabItem,
} from "@/components/ui-kit";
import { GrievanceDetailModal } from "@/components/grievances/detail";
import { RaiseGrievanceModal, TrackingCodeModal, TrackModal } from "@/components/grievances/raise";
import { PoshReport } from "@/components/grievances/report";
import { CommitteeCards, GrievanceSettings } from "@/components/grievances/settings";
import { STATUS_TONE, type Committee, type Grievance, type GrievanceMe } from "@/components/grievances/types";

type Page<T> = { items: T[]; total: number; page: number; size: number };
type Stats = Record<string, { open: number; total: number; overdue: number; closed_this_year: number }>;
type TabKey = "mine" | "grievance" | "posh" | "report" | "settings";

export default function GrievancesPage() {
  const toast = useToast();
  const [me, setMe] = useState<GrievanceMe | null>(null);
  const [tab, setTab] = useState<TabKey>("mine");
  const [committees, setCommittees] = useState<Committee[]>([]);
  const [raising, setRaising] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [submitted, setSubmitted] = useState<{ reference_no: string | null; tracking_code: string; anonymous: boolean; late_filing: boolean } | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    api.get<GrievanceMe>("/grievances/me").then((m) => {
      setMe(m);
      if (m.sees_grievances) setTab((t) => (t === "mine" ? "grievance" : t));
      else if (m.sees_posh) setTab((t) => (t === "mine" ? "posh" : t));
      else if (m.is_owner) setTab(m.can_configure ? "settings" : "report");
    }).catch(() => toast.error("Couldn't load grievances"));
  }, [toast]);
  const loadCommittees = useCallback(() => {
    api.get<{ items: Committee[] }>("/grievances/committees").then((r) => setCommittees(r.items)).catch(() => {});
  }, []);
  useEffect(() => { loadCommittees(); }, [loadCommittees]);

  if (!me) return (
    <div><PageHeader eyebrow="Engage" title="Grievances" /><Skeleton className="h-64 w-full rounded-2xl" /></div>
  );

  const tabs: TabItem<TabKey>[] = [
    ...(me.sees_grievances ? [{ value: "grievance" as const, label: "Grievances", icon: Inbox }] : []),
    ...(me.sees_posh ? [{ value: "posh" as const, label: "POSH", icon: Lock }] : []),
    ...(me.is_owner ? [] : [{ value: "mine" as const, label: "My cases", icon: UserRound }]),
    ...(me.sees_posh || me.is_owner ? [{ value: "report" as const, label: "POSH report", icon: FileBarChart }] : []),
    ...(me.can_configure ? [{ value: "settings" as const, label: "Committees and settings", icon: Settings2 }] : []),
  ];

  return (
    <div>
      <PageHeader eyebrow="Engage" title="Grievances"
        description="Raise a concern safely. Grievances go to the grievance committee; POSH complaints only to the Internal Committee."
        actions={<>
          <Button icon={KeyRound} onClick={() => setTracking(true)}>Track with a code</Button>
          {!me.is_owner && <Button variant="primary" icon={Plus} onClick={() => setRaising(true)}>Raise a concern</Button>}
        </>} />
      {tabs.length > 1 && <Tabs items={tabs} value={tab} onChange={setTab} className="mb-5" />}

      {(tab === "grievance" || tab === "posh") && <HandlerQueue key={tab} kind={tab} me={me} nonce={nonce} onChanged={refresh} />}
      {tab === "mine" && (
        <div className="space-y-6">
          <MyCases me={me} nonce={nonce} onChanged={refresh} onRaise={() => setRaising(true)} />
          <div>
            <p className="mb-3 text-[15px] text-ink">Who handles complaints</p>
            <CommitteeCards committees={committees} roles={me.roles} />
          </div>
        </div>
      )}
      {tab === "report" && <PoshReport canAddProgramme={me.is_ic_member || me.is_manager} />}
      {tab === "settings" && <GrievanceSettings me={me} committees={committees} onCommitteesChanged={loadCommittees} />}

      <RaiseGrievanceModal open={raising} onClose={() => setRaising(false)} me={me}
        onDone={(s) => { setRaising(false); setSubmitted(s); refresh(); }} />
      <TrackingCodeModal result={submitted} onClose={() => setSubmitted(null)} />
      <TrackModal open={tracking} onClose={() => setTracking(false)} statuses={me.statuses} />
    </div>
  );
}

function statusBadge(g: Grievance, me: GrievanceMe) {
  return <Badge tone={STATUS_TONE[g.status] ?? "neutral"} dot>{me.statuses[g.status] ?? g.status_label}</Badge>;
}

function HandlerQueue({ kind, me, nonce, onChanged }: { kind: "grievance" | "posh"; me: GrievanceMe; nonce: number; onChanged: () => void }) {
  const toast = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["open"] });
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Grievance> | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<string | null>(null);

  useEffect(() => { api.get<Stats>("/grievances/stats").then(setStats).catch(() => {}); }, [nonce]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const st = filters.status?.[0];
    const status = st === "open" ? "submitted,under_review,inquiry,report_submitted" : st === "done" ? "resolved,closed,rejected,withdrawn" : "";
    api.get<Page<Grievance>>(`/grievances?scope=${kind}&page=${page}&size=25${q ? `&q=${encodeURIComponent(q)}` : ""}${status ? `&status=${status}` : ""}`)
      .then((r) => { if (live) setData(r); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load"))
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [kind, page, q, filters, nonce, toast]);

  const s = stats?.[kind];
  const columns: Column<Grievance>[] = [
    {
      key: "subject", header: kind === "posh" ? "Complaint" : "Grievance", cell: (g) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{g.subject}</p>
          <p className="truncate text-[12.5px] text-faint">{g.reference_no ?? "—"} · received {formatDisplayDate(g.received_on)}{g.late_filing ? " · filed late" : ""}</p>
        </div>
      ),
    },
    { key: "category", header: "Category", hideBelow: "md", cell: (g) => g.category_name ? <span className="text-muted">{g.category_name}</span> : <span className="text-faint">—</span> },
    { key: "who", header: "Raised by", hideBelow: "sm", cell: (g) => g.anonymous ? <Badge>Anonymous</Badge> : <span className="text-ink/80">{g.complainant_name ?? "—"}</span> },
    { key: "assignee", header: "With", hideBelow: "lg", cell: (g) => <span className="text-muted">{g.assigned_to_name ?? "Committee"}</span> },
    { key: "status", header: "Status", cell: (g) => statusBadge(g, me) },
    {
      key: "due", header: "Next deadline", hideBelow: "md", cell: (g) => g.next_due_on
        ? <span className={g.overdue ? "text-rose-600" : "text-muted"} title={g.next_due_label}>{g.overdue && <AlarmClock size={13} strokeWidth={1.4} className="mr-1 inline" />}{formatDisplayDate(g.next_due_on)}</span>
        : <span className="text-faint">—</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open" value={s?.open ?? "—"} icon={kind === "posh" ? Lock : ShieldAlert} />
        <StatCard label="Past a deadline" value={s?.overdue ?? "—"} icon={AlarmClock} hint={s?.overdue ? "Needs attention" : undefined} />
        <StatCard label="Closed this year" value={s?.closed_this_year ?? "—"} icon={CheckCircle2} />
        <StatCard label="All time" value={s?.total ?? "—"} icon={Inbox} />
      </div>
      {kind === "posh" && (
        <p className="flex items-center gap-2 text-[13px] text-muted"><Lock size={14} strokeWidth={1.4} /> Confidential. Only Internal Committee members can see these complaints.</p>
      )}
      <div>
        <FilterBar searchPlaceholder="Search by subject or reference" onSearchChange={(x) => { setQ(x); setPage(1); }}
          filters={[{ key: "status", label: "Status", options: [{ value: "open", label: "Open" }, { value: "done", label: "Closed" }] }]}
          values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
        <DataTable rows={data?.items ?? []} rowKey={(g) => g.uuid ?? g.reference_no ?? g.subject} columns={columns} loading={loading}
          onRowClick={(g) => g.uuid && setViewing(g.uuid)}
          rowClassName={(g) => (g.overdue ? "bg-rose-50/30" : undefined)}
          pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
          emptyIcon={kind === "posh" ? Lock : Inbox}
          emptyTitle={kind === "posh" ? "No POSH complaints" : "No grievances"}
          emptyHint="New cases appear here as soon as they are raised." />
      </div>
      <GrievanceDetailModal uuid={viewing} open={!!viewing} onClose={() => setViewing(null)} me={me} onChanged={onChanged} />
    </div>
  );
}

function MyCases({ me, nonce, onChanged, onRaise }: { me: GrievanceMe; nonce: number; onChanged: () => void; onRaise: () => void }) {
  const [data, setData] = useState<Page<Grievance> | null>(null);
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<string | null>(null);
  useEffect(() => {
    api.get<Page<Grievance>>(`/grievances?scope=mine&page=${page}&size=25`).then(setData).catch(() => setData({ items: [], total: 0, page: 1, size: 25 }));
  }, [page, nonce]);
  const columns: Column<Grievance>[] = [
    { key: "subject", header: "Subject", cell: (g) => <div className="min-w-0"><p className="truncate text-ink">{g.subject}</p><p className="text-[12.5px] text-faint">{g.reference_no ?? "—"}</p></div> },
    { key: "kind", header: "Kind", hideBelow: "sm", cell: (g) => g.kind === "posh" ? <Badge tone="bad">POSH</Badge> : <Badge>Grievance</Badge> },
    { key: "received", header: "Raised on", hideBelow: "md", cell: (g) => <span className="text-muted">{formatDisplayDate(g.received_on)}</span> },
    { key: "status", header: "Status", cell: (g) => statusBadge(g, me) },
  ];
  return (
    <div>
      <DataTable rows={data?.items ?? []} rowKey={(g) => g.uuid ?? g.subject} columns={columns} loading={!data}
        onRowClick={(g) => g.uuid && setViewing(g.uuid)}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={ShieldAlert} emptyTitle="You haven't raised anything"
        emptyHint="Anonymous grievances don't show here. Follow them up with your tracking code."
        emptyAction={<Button variant="primary" icon={Plus} onClick={onRaise}>Raise a concern</Button>} />
      <GrievanceDetailModal uuid={viewing} open={!!viewing} onClose={() => setViewing(null)} me={me} onChanged={onChanged} />
    </div>
  );
}
