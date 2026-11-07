"use client";

/*
 * Reviews. Tabs:
 *   To do       reviews I have to write (self, as manager or skip-level, as a peer), peer
 *               reviewers waiting for my approval and calibrated ratings to acknowledge.
 *   My results  published results with the rating on the scale, the manager's summary,
 *               the review letter and my response.
 *   My team     (managers) my reportees in running cycles, with each form's state and
 *               a potential picker for the nine-box.
 *   Cycles      (admins) every cycle as a card; Add / Edit in a wizard modal; a card opens
 *               the cycle dashboard.
 * Every review opens in the full-screen review form modal.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Award, CalendarClock, CheckCircle2, ClipboardCheck, ClipboardList, FileText, MessageSquareReply, Plus, Scale, UserCheck, Users, X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { useUrlTab } from "@/lib/use-url-tab";
import { formatDate } from "@/lib/datetime";
import { EmptyState, PageHeader } from "@/components/shell/page";
import { Avatar, Badge, Button, DataTable, Select, Skeleton, Tabs, type Column } from "@/components/ui-kit";
import { PerformanceTabs, PersonInline, ProgressBar, RatingPill, usePerfMe } from "@/components/performance/shared";
import type { Cycle, FormSummary, MyResult, ParticipantRow } from "@/components/performance/types";
import {
  AckModal, CycleStatus, FormStatus, KIND_LABEL, LetterModal, RespondModal, TYPE_LABEL,
} from "@/components/performance/reviews/misc";
import { ReviewFormModal } from "@/components/performance/reviews/review-form";
import { CycleFormModal } from "@/components/performance/reviews/cycle-form";
import { CycleDashboardModal } from "@/components/performance/reviews/cycle-dashboard";

type Tab = "todo" | "results" | "team" | "cycles";
type Mine = { self: FormSummary[]; team: FormSummary[]; peer: FormSummary[] };

export default function ReviewsPage() {
  const { me, reload: reloadMe } = usePerfMe();
  const [tab, setTab] = useState<Tab>("todo");
  useUrlTab<Tab>(["todo", "results", "team", "cycles"], setTab);
  const [formId, setFormId] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => { setNonce((n) => n + 1); reloadMe(); }, [reloadMe]);

  useEffect(() => {
    if (me && !me.employee_id && me.is_admin && tab === "todo") setTab("cycles");
    // admins without an employee record land on cycles once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.employee_id]);

  const items = [
    { value: "todo" as Tab, label: "To do", icon: ClipboardList, count: me ? me.pending_reviews + me.pending_acks + me.peer_approvals : undefined },
    ...(me?.employee_id ? [{ value: "results" as Tab, label: "My results", icon: Award }] : []),
    ...(me?.is_manager ? [{ value: "team" as Tab, label: "My team", icon: Users }] : []),
    ...(me?.is_admin ? [{ value: "cycles" as Tab, label: "Cycles", icon: ClipboardCheck }] : []),
  ];

  return (
    <div>
      <PageHeader eyebrow="Talent" title="Reviews" description="Self, manager and peer reviews, calibration and results." />
      <PerformanceTabs me={me} />
      <Tabs variant="pill" value={tab} onChange={setTab} items={items.map((i) => ({ ...i, count: i.count || undefined }))} className="mb-6" />
      {tab === "todo" && <TodoTab key={nonce} onOpen={setFormId} onChanged={refresh} />}
      {tab === "results" && <ResultsTab key={nonce} />}
      {tab === "team" && <TeamTab key={nonce} onOpen={setFormId} />}
      {tab === "cycles" && <CyclesTab />}
      <ReviewFormModal formId={formId} onClose={() => setFormId(null)} onChanged={refresh} />
    </div>
  );
}

/* ── To do ───────────────────────────────────────────────────────────── */

function FormCard({ f, onOpen, mine }: { f: FormSummary; onOpen: () => void; mine?: boolean }) {
  const done = f.status === "submitted";
  return (
    <button type="button" onClick={onOpen}
      className="group flex w-full items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4 text-left transition-colors hover:border-primary/30">
      {mine ? (
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary"><UserCheck size={18} strokeWidth={1.4} /></span>
      ) : <Avatar name={f.employee?.name ?? ""} src={f.employee?.photo} size={40} />}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] text-ink">{mine ? "Your self review" : f.employee?.name}</p>
        <p className="truncate text-[12.5px] text-muted">{f.cycle.name}{!mine && f.employee?.designation ? ` · ${f.employee.designation}` : ""}</p>
      </div>
      <div className="hidden text-right sm:block">
        {f.due_date && <p className={`text-[12.5px] ${f.overdue ? "text-rose-600" : "text-muted"}`}><CalendarClock size={12} strokeWidth={1.4} className="mr-1 inline" />{done ? "Submitted" : `Due ${formatDate(f.due_date)}`}</p>}
      </div>
      <FormStatus status={f.status} overdue={f.overdue} />
      <span className="hidden text-[13px] text-primary opacity-0 transition-opacity group-hover:opacity-100 md:inline">{done ? "View" : f.status === "draft" ? "Continue" : "Start"}</span>
    </button>
  );
}

function Group({ title, hint, children, count }: { title: string; hint?: string; children: React.ReactNode; count?: number }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-[16px] font-light text-ink">{title}</h2>
        {count !== undefined && <span className="text-[13px] text-faint tabular">{count}</span>}
        {hint && <span className="text-[13px] text-muted">· {hint}</span>}
      </div>
      {children}
    </section>
  );
}

function TodoTab({ onOpen, onChanged }: { onOpen: (uuid: string) => void; onChanged: () => void }) {
  const toast = useToast();
  const [mine, setMine] = useState<Mine | null>(null);
  const [peerApprovals, setPeerApprovals] = useState<FormSummary[]>([]);
  const [acks, setAcks] = useState<ParticipantRow[]>([]);
  const [ack, setAck] = useState<ParticipantRow | null>(null);
  const [showDone, setShowDone] = useState(false);

  const load = useCallback(() => {
    api.get<Mine>("/performance/reviews/mine").then(setMine).catch(() => setMine({ self: [], team: [], peer: [] }));
    api.get<FormSummary[]>("/performance/reviews/peer-approvals").then(setPeerApprovals).catch(() => setPeerApprovals([]));
    api.get<ParticipantRow[]>("/performance/reviews/acknowledgements").then(setAcks).catch(() => setAcks([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function decide(f: FormSummary, approve: boolean) {
    try {
      await api.post(`/performance/forms/${f.uuid}/peer-decision`, { approve });
      toast.success(approve ? `${f.reviewer.name} will review ${f.employee?.name}` : "Peer reviewer declined");
      load(); onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
  }

  if (!mine) return <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>;
  const open = (l: FormSummary[]) => l.filter((f) => f.status !== "submitted" || showDone);
  const all = [...mine.self, ...mine.team, ...mine.peer];
  const pending = all.filter((f) => f.status !== "submitted");
  const nothing = !pending.length && !peerApprovals.length && !acks.length;

  return (
    <div className="space-y-8">
      {nothing && (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState icon={CheckCircle2} title="You're all caught up" hint="Reviews you need to write will show up here when a cycle starts." />
        </div>
      )}
      {acks.length > 0 && (
        <Group title="Ratings changed in calibration" hint="Please acknowledge" count={acks.length}>
          <div className="grid gap-3 md:grid-cols-2">
            {acks.map((r) => (
              <div key={r.uuid} className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50/40 px-5 py-4">
                <Avatar name={r.employee?.name ?? ""} src={r.employee?.photo} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] text-ink">{r.employee?.name}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
                    <RatingPill value={r.proposed_rating} muted /> → <RatingPill value={r.calibrated_rating} label={r.calibrated_label} />
                  </p>
                </div>
                <Button size="sm" variant="primary" onClick={() => setAck(r)}>Review</Button>
              </div>
            ))}
          </div>
        </Group>
      )}
      {peerApprovals.length > 0 && (
        <Group title="Peer reviewers to approve" count={peerApprovals.length}>
          <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {peerApprovals.map((f) => (
              <div key={f.uuid} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <PersonInline person={f.reviewer as never} sub={`to review ${f.employee?.name}`} />
                <span className="flex-1 text-[12.5px] text-muted">{f.cycle.name}</span>
                <Button size="sm" variant="ghost" icon={X} onClick={() => decide(f, false)}>Decline</Button>
                <Button size="sm" variant="secondary" icon={CheckCircle2} onClick={() => decide(f, true)}>Approve</Button>
              </div>
            ))}
          </div>
        </Group>
      )}
      {open(mine.self).length > 0 && <Group title="Your self review">{open(mine.self).map((f) => <FormCard key={f.uuid} f={f} mine onOpen={() => onOpen(f.uuid)} />)}</Group>}
      {open(mine.team).length > 0 && (
        <Group title="Your team" hint="As manager or skip-level" count={mine.team.filter((f) => f.status !== "submitted").length}>
          <div className="grid gap-3 lg:grid-cols-2">{open(mine.team).map((f) => <FormCard key={f.uuid} f={f} onOpen={() => onOpen(f.uuid)} />)}</div>
        </Group>
      )}
      {open(mine.peer).length > 0 && (
        <Group title="Peer reviews" hint="Colleagues asked for your view" count={mine.peer.filter((f) => f.status !== "submitted").length}>
          <div className="grid gap-3 lg:grid-cols-2">{open(mine.peer).map((f) => <FormCard key={f.uuid} f={f} onOpen={() => onOpen(f.uuid)} />)}</div>
        </Group>
      )}
      {all.some((f) => f.status === "submitted") && (
        <button type="button" onClick={() => setShowDone((s) => !s)} className="text-[13px] text-primary hover:underline">
          {showDone ? "Hide submitted reviews" : `Show submitted reviews (${all.filter((f) => f.status === "submitted").length})`}
        </button>
      )}
      <AckModal row={ack} onClose={() => setAck(null)} onDone={() => { load(); onChanged(); }} />
    </div>
  );
}

/* ── My results ──────────────────────────────────────────────────────── */

function ScaleTrack({ scale, value }: { scale: MyResult["scale"]; value: number | null }) {
  return (
    <div className="flex gap-1.5">
      {scale.map((p) => {
        const on = value === p.value;
        return (
          <div key={p.value} className="min-w-0 flex-1">
            <div className={`h-2 rounded-full ${on ? "bg-primary" : value !== null && p.value < value ? "bg-primary/25" : "bg-sunken"}`} />
            <p className={`mt-1.5 truncate text-[11.5px] ${on ? "text-primary" : "text-faint"}`}>{p.value} · {p.label}</p>
          </div>
        );
      })}
    </div>
  );
}

function ResultsTab() {
  const [rows, setRows] = useState<MyResult[] | null>(null);
  const [letter, setLetter] = useState<string | null>(null);
  const [respond, setRespond] = useState<string | null>(null);
  const load = useCallback(() => { api.get<MyResult[]>("/performance/reviews/results").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  if (!rows) return <div className="space-y-3"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;
  if (!rows.length) return <div className="rounded-2xl border border-line bg-surface"><EmptyState icon={Award} title="No reviews yet" hint="Your results appear here once a review cycle is published." /></div>;
  return (
    <div className="space-y-4">
      {rows.map((r) => (
        <article key={r.uuid} className="rounded-2xl border border-line bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[17px] font-light text-ink">{r.cycle.name}</h3>
              <p className="text-[13px] text-muted">{formatDate(r.cycle.period_start)} to {formatDate(r.cycle.period_end)}{r.published_at && ` · published ${formatDate(r.published_at)}`}</p>
            </div>
            {r.published ? <Badge tone="good" dot>Published</Badge> : <Badge tone="info" dot>In progress</Badge>}
          </div>
          {r.published ? (
            <div className="mt-5 grid gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
              <div className="rounded-xl bg-primary-soft/40 p-5">
                <p className="text-[12.5px] text-muted">Final rating</p>
                <p className="mt-1 text-[40px] font-extralight leading-none text-primary tabular">{r.final_rating}</p>
                <p className="mt-1 text-[14px] text-ink">{r.final_label}</p>
              </div>
              <div className="space-y-4">
                <ScaleTrack scale={r.scale} value={r.final_rating} />
                {r.manager_summary && <blockquote className="border-l-2 border-primary/30 pl-4 text-[14px] italic text-ink/80">“{r.manager_summary}”<span className="mt-1 block text-[12.5px] not-italic text-muted">Your manager</span></blockquote>}
                <div className="flex flex-wrap items-center gap-2">
                  {r.has_letter && <Button size="sm" variant="secondary" icon={FileText} onClick={() => setLetter(r.uuid)}>Review letter</Button>}
                  {r.response ? (
                    <Badge tone={r.response === "agree" ? "good" : "warn"}>{r.response === "agree" ? "You agreed" : "You disagreed"}</Badge>
                  ) : <Button size="sm" variant="ghost" icon={MessageSquareReply} onClick={() => setRespond(r.uuid)}>Respond</Button>}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              {r.forms.map((f, i) => <span key={i} className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">{TYPE_LABEL[f.reviewer_type]} <FormStatus status={f.status} /></span>)}
            </div>
          )}
        </article>
      ))}
      <LetterModal path={letter ? `/performance/participants/${letter}/letter` : null} title="Performance review letter" onClose={() => setLetter(null)} />
      <RespondModal uuid={respond} onClose={() => setRespond(null)} onDone={load} />
    </div>
  );
}

/* ── My team ─────────────────────────────────────────────────────────── */

const POTENTIAL = [{ value: 3, label: "High potential" }, { value: 2, label: "Medium potential" }, { value: 1, label: "Low potential" }];

function TeamTab({ onOpen }: { onOpen: (uuid: string) => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<ParticipantRow[] | null>(null);
  const load = useCallback(() => { api.get<ParticipantRow[]>("/performance/reviews/team").then(setRows).catch(() => setRows([])); }, []);
  useEffect(() => { load(); }, [load]);
  async function setPotential(r: ParticipantRow, potential: number | null) {
    try { await api.put(`/performance/participants/${r.uuid}/potential`, { potential }); toast.success("Potential saved"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
  }
  const columns: Column<ParticipantRow>[] = [
    { key: "name", header: "Person", cell: (r) => <PersonInline person={r.employee} sub={r.cycle?.name} />, sortable: true, sortValue: (r) => r.employee?.name },
    {
      key: "forms", header: "Reviews", cell: (r) => (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {r.forms.map((f) => <span key={f.uuid} className="inline-flex items-center gap-1 text-[12.5px] text-muted">{TYPE_LABEL[f.reviewer_type]} <FormStatus status={f.status} overdue={f.overdue} /></span>)}
        </div>
      ),
    },
    { key: "rating", header: "Rating", cell: (r) => <RatingPill value={r.final_rating ?? r.current_rating} label={r.final_label ?? r.current_label} /> },
    {
      key: "potential", header: "Potential", hideBelow: "md", cell: (r) => (
        <div onClick={(e) => e.stopPropagation()} className="w-[170px]">
          <Select<number> value={r.potential} onChange={(v) => setPotential(r, v)} options={POTENTIAL} placeholder="Set potential" clearable />
        </div>
      ),
    },
  ];
  return (
    <DataTable rows={rows ?? []} loading={!rows} rowKey={(r) => r.uuid} columns={columns}
      onRowClick={(r) => { const f = r.forms.find((x) => x.reviewer_type === "manager") ?? r.forms[0]; if (f) onOpen(f.uuid); }}
      emptyIcon={Users} emptyTitle="No team reviews right now" emptyHint="Your reportees appear here while a cycle is running." />
  );
}

/* ── Cycles (admins) ─────────────────────────────────────────────────── */

function CycleCard({ c, onOpen }: { c: Cycle; onOpen: () => void }) {
  const st = c.stats;
  const by = st?.by_type ?? {};
  const stages = c.stages.filter((s) => s.enabled && s.key !== "calibration");
  return (
    <button type="button" onClick={onOpen} className="flex flex-col rounded-2xl border border-line bg-surface p-5 text-left transition-colors hover:border-primary/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[16px] font-light text-ink">{c.name}</p>
          <p className="text-[12.5px] text-muted">{KIND_LABEL[c.kind]} · {formatDate(c.period_start)} – {formatDate(c.period_end)}</p>
        </div>
        <CycleStatus status={c.status} />
      </div>
      <div className="mt-5 flex items-end gap-6">
        <div>
          <p className="text-[30px] font-extralight leading-none text-ink tabular">{st?.participants ?? 0}</p>
          <p className="mt-1 text-[12px] text-muted">people</p>
        </div>
        <div className="flex-1">
          <div className="flex justify-between text-[12px] text-muted"><span>Completion</span><span className="tabular">{Math.round(st?.completion ?? 0)}%</span></div>
          <ProgressBar value={st?.completion ?? 0} className="mt-1.5" />
        </div>
      </div>
      {c.status !== "draft" && (
        <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-2.5 border-t border-line pt-4 sm:grid-cols-4">
          {stages.map((s) => {
            const b = by[s.key] ?? { total: 0, submitted: 0, overdue: 0 };
            return (
              <div key={s.key}>
                <p className="truncate text-[11.5px] text-muted">{s.label}</p>
                <p className="text-[13px] text-ink tabular">{b.submitted}/{b.total}{b.overdue ? <span className="ml-1 text-rose-600">· {b.overdue} late</span> : null}</p>
              </div>
            );
          })}
        </div>
      )}
    </button>
  );
}

function CyclesTab() {
  const [cycles, setCycles] = useState<Cycle[] | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Cycle | null>(null);
  const [session, setSession] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(() => { api.get<Cycle[]>("/performance/cycles").then(setCycles).catch(() => setCycles([])); }, []);
  useEffect(() => { load(); }, [load]);
  const groups = useMemo(() => ({
    running: (cycles ?? []).filter((c) => ["draft", "active", "calibration"].includes(c.status)),
    done: (cycles ?? []).filter((c) => ["published", "closed"].includes(c.status)),
  }), [cycles]);
  const openForm = (c: Cycle | null) => { setEditing(c); setSession((s) => s + 1); setFormOpen(true); };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13.5px] text-muted">Run a cycle from launch to published results.</p>
        <div className="flex gap-2">
          <a href="/dashboard/performance/calibration" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-[14px] text-ink hover:border-line-strong"><Scale size={16} strokeWidth={1.4} /> Calibration</a>
          <Button variant="primary" icon={Plus} onClick={() => openForm(null)}>New cycle</Button>
        </div>
      </div>
      {!cycles ? <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-48" /><Skeleton className="h-48" /></div> : !cycles.length ? (
        <div className="rounded-2xl border border-line bg-surface">
          <EmptyState icon={ClipboardCheck} title="No review cycles yet" hint="Create one for the year, half year or quarter." action={<Button variant="primary" icon={Plus} onClick={() => openForm(null)}>New cycle</Button>} />
        </div>
      ) : (
        <>
          {groups.running.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[16px] font-light text-ink">Running</h2>
              <div className="grid gap-4 lg:grid-cols-2">{groups.running.map((c) => <CycleCard key={c.uuid} c={c} onOpen={() => setOpenId(c.uuid)} />)}</div>
            </section>
          )}
          {groups.done.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-[16px] font-light text-ink">Finished</h2>
              <div className="grid gap-4 lg:grid-cols-2">{groups.done.map((c) => <CycleCard key={c.uuid} c={c} onOpen={() => setOpenId(c.uuid)} />)}</div>
            </section>
          )}
        </>
      )}
      <CycleFormModal key={session} open={formOpen} cycle={editing} onClose={() => setFormOpen(false)} onSaved={(c) => { load(); if (!editing) setOpenId(c.uuid); }} />
      <CycleDashboardModal cycleId={openId} onClose={() => setOpenId(null)} onChanged={load}
        onEdit={(c) => { setOpenId(null); openForm(c); }} />
    </div>
  );
}
