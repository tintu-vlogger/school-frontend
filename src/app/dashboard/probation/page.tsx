"use client";

/*
 * Probation: for HR a board (on probation → under review → extended / on hold → confirmed)
 * and a table with bulk actions; for managers and other reviewers, their own reviews.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BellRing, CalendarClock, CheckCircle2, ClipboardCheck, Columns3, Hourglass, List, Plus, Send, Settings2, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, EmptyState } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, Modal, ModalCancel, Select, Skeleton, StatCard, StatGrid, Tabs,
  Textarea, formatDisplayDate, useConfirm, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { loadEmployees } from "@/components/workplace/pickers";
import { ProbationDetail, ReviewFormModal, Stars } from "@/components/probation/detail";
import { OPEN, STATUS_TONE, type Dashboard, type Meta, type Policy, type Probation, type Review } from "@/components/probation/types";

type Page<T> = { items: T[]; total: number; page: number; size: number };
const COLUMNS = [
  { key: "active", label: "On probation" },
  { key: "in_review", label: "Under review" },
  { key: "extended", label: "Extended" },
  { key: "on_hold", label: "On hold" },
  { key: "confirmed", label: "Confirmed" },
];
const VIEW_KEY = "hrms_probation_view";

export default function ProbationPage() {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => { api.get<Meta>("/probation/meta").then(setMeta).catch(() => setMeta({ can_manage: false, statuses: {}, outcomes: {}, reviewer_types: {} })); }, []);
  if (!meta) return <div><PageHeader title="Probation" /><Skeleton className="h-80 rounded-2xl" /></div>;
  return meta.can_manage ? <HrView /> : <ReviewerView />;
}

function HrView() {
  const toast = useToast();
  const confirm = useConfirm();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [rows, setRows] = useState<Probation[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [view, setViewState] = useState<"board" | "list" | "mine">("board");
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [bulkCancel, setBulkCancel] = useState<{ uuids: string[]; clear: () => void } | null>(null);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const setView = (v: "board" | "list" | "mine") => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };
  useEffect(() => { try { const v = localStorage.getItem(VIEW_KEY); if (v === "list" || v === "mine") setViewState(v); } catch { /* private mode */ } }, []);

  useEffect(() => { api.get<Dashboard>("/probation/dashboard").then(setDash).catch(() => {}); }, [nonce]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const p = new URLSearchParams({ size: "200" });
    if (q) p.set("q", q);
    if (filters.status?.length) p.set("status", filters.status.join(","));
    if (filters.ending?.length) p.set("ending_within", filters.ending[0]);
    api.get<Page<Probation>>(`/probation/probations?${p}`).then((r) => live && setRows(r.items)).catch((e) => toast.error(e.message)).finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [q, filters, nonce, toast]);

  async function bulk(action: string, uuids: string[], reason?: string) {
    try {
      const r = await api.post<{ done: number; failed: { reason: string }[] }>("/probation/probations/bulk", { uuids, action, reason });
      if (r.failed.length) toast.error(`${r.done} done, ${r.failed.length} not: ${r.failed[0].reason}`);
      else toast.success(`${r.done} updated`);
      refresh();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function move(p: Probation, to: string) {
    if (p.status === to) return;
    if (to === "in_review" && ["active", "extended"].includes(p.status)) {
      if (await confirm({ title: `Start ${p.name}'s review?`, message: "Reviewers are asked for their ratings and recommendation.", confirmLabel: "Start review" })) await bulk("start_review", [p.uuid]);
    } else if (to === "confirmed" && OPEN.includes(p.status)) {
      if (await confirm({ title: `Confirm ${p.name}?`, message: `Confirmed from the day after ${formatDisplayDate(p.end_date)}, with a confirmation letter.`, confirmLabel: "Confirm" })) await bulk("confirm", [p.uuid]);
    } else {
      toast.info("Open the probation to extend, hold or end it.");
      setViewing(p.uuid);
    }
  }

  const columns: Column<Probation>[] = [
    { key: "name", header: "Employee", sortable: true, sortValue: (r) => r.name, cell: (r) => (
      <div className="flex items-center gap-2.5"><Avatar name={r.name} size={28} /><div className="min-w-0"><p className="truncate text-ink">{r.name}</p><p className="truncate text-[12px] text-faint">{[r.designation, r.department].filter(Boolean).join(" · ")}</p></div></div>) },
    { key: "end", header: "Ends", sortable: true, sortValue: (r) => r.end_date, cell: (r) => (
      <span className={r.overdue ? "text-rose-600" : ""}>{formatDisplayDate(r.end_date)}{OPEN.includes(r.status) && <span className="ml-1 text-[12px] text-faint">{r.days_left >= 0 ? `${r.days_left}d` : "overdue"}</span>}</span>) },
    { key: "status", header: "Status", cell: (r) => <Badge tone={STATUS_TONE[r.status] ?? "neutral"} dot>{r.status_label}</Badge> },
    { key: "reviews", header: "Reviews", hideBelow: "md", cell: (r) => r.reviews_total ? `${r.reviews_done}/${r.reviews_total}` : "—" },
    { key: "ext", header: "Extensions", hideBelow: "md", align: "right", cell: (r) => r.extensions },
    { key: "policy", header: "Policy", hideBelow: "lg", cell: (r) => <span className="text-muted">{r.policy_name ?? "—"}</span> },
  ];
  const SIZE = 25;
  const filtered = useMemo(() => rows, [rows]);

  return (
    <div>
      <PageHeader title="Probation" description="Reviews start before the end date; confirm, extend, hold or end employment."
        actions={<>
          <Link href="/dashboard/probation/settings"><Button icon={Settings2}>Policies</Button></Link>
          <Button variant="primary" icon={Plus} onClick={() => setStarting(true)}>Start probation</Button>
        </>} />
      <StatGrid className="mb-6 xl:grid-cols-5">
        <StatCard label="On probation" value={dash ? (dash.by_status.active ?? 0) + (dash.by_status.extended ?? 0) : "–"} icon={Hourglass} />
        <StatCard label="Under review" value={dash?.by_status.in_review ?? "–"} icon={ClipboardCheck} onClick={() => setFilters({ status: ["in_review"] })} />
        <StatCard label="Ending in 30 days" value={dash?.ending_in_30_days ?? "–"} icon={CalendarClock} onClick={() => setFilters({ ending: ["30"] })} />
        <StatCard label="Past end date" value={dash?.overdue ?? "–"} icon={AlertTriangle} hint="No decision yet" />
        <StatCard label="Confirmed" value={dash?.by_status.confirmed ?? "–"} icon={CheckCircle2} />
      </StatGrid>
      {dash && dash.pending_by_reviewer.length > 0 && (
        <p className="mb-4 text-[13px] text-muted">Waiting on: {dash.pending_by_reviewer.map((p) => `${p.name} (${p.count})`).join(", ")}</p>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterBar className="min-w-0 flex-1" search={q} onSearchChange={setQ} searchPlaceholder="Search people"
          filters={[
            { key: "status", label: "Status", multiple: true, options: Object.entries({ active: "On probation", in_review: "Under review", extended: "Extended", on_hold: "On hold", confirmed: "Confirmed", terminated: "Not confirmed", cancelled: "Cancelled" }).map(([value, label]) => ({ value, label })) },
            { key: "ending", label: "Ending within", options: [{ value: "15", label: "15 days" }, { value: "30", label: "30 days" }, { value: "60", label: "60 days" }] },
          ]} values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
        <Tabs variant="pill" value={view} onChange={setView} items={[
          { value: "board", label: "Board", icon: Columns3 }, { value: "list", label: "List", icon: List }, { value: "mine", label: "My reviews", icon: ClipboardCheck }]} />
      </div>
      {view === "mine" ? <MyReviews /> : view === "board" ? <Board rows={filtered} loading={loading} onOpen={(p) => setViewing(p.uuid)} onMove={move} /> : (
        <DataTable rows={filtered.slice((page - 1) * SIZE, page * SIZE)} columns={columns} rowKey={(r) => r.uuid} loading={loading} onRowClick={(r) => setViewing(r.uuid)}
          selectable emptyTitle="No one on probation" pagination={{ page, size: SIZE, total: filtered.length, onPageChange: setPage }}
          bulkActions={[
            { label: "Start review", icon: Send, onSelect: (rs, clear) => { bulk("start_review", rs.map((r) => r.uuid)); clear(); } },
            { label: "Confirm", icon: CheckCircle2, onSelect: async (rs, clear) => { if (await confirm({ title: `Confirm ${rs.length} people?`, confirmLabel: "Confirm" })) { bulk("confirm", rs.map((r) => r.uuid)); clear(); } } },
            { label: "Remind reviewers", icon: BellRing, onSelect: (rs, clear) => { bulk("remind", rs.map((r) => r.uuid)); clear(); } },
            { label: "Cancel", icon: XCircle, danger: true, onSelect: (rs, clear) => setBulkCancel({ uuids: rs.map((r) => r.uuid), clear }) },
          ]} />
      )}
      <ProbationDetail uuid={viewing} onClose={() => setViewing(null)} onChanged={refresh} />
      <StartModal open={starting} onClose={() => setStarting(false)} onDone={(uuid) => { setStarting(false); refresh(); setViewing(uuid); }} />
      <BulkCancel target={bulkCancel} onClose={() => setBulkCancel(null)} onConfirm={async (reason) => {
        if (!bulkCancel) return; await bulk("cancel", bulkCancel.uuids, reason); bulkCancel.clear(); setBulkCancel(null);
      }} />
    </div>
  );
}

function Board({ rows, loading, onOpen, onMove }: { rows: Probation[]; loading: boolean; onOpen: (p: Probation) => void; onMove: (p: Probation, to: string) => void }) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {COLUMNS.map((c) => {
        const list = rows.filter((r) => r.status === c.key).sort((a, b) => c.key === "confirmed" ? (b.decided_at ?? "").localeCompare(a.decided_at ?? "") : a.end_date.localeCompare(b.end_date)).slice(0, c.key === "confirmed" ? 15 : 200);
        return (
          <div key={c.key} onDragOver={(e) => { e.preventDefault(); setOver(c.key); }} onDragLeave={() => setOver((o) => (o === c.key ? null : o))}
            onDrop={(e) => { e.preventDefault(); const p = rows.find((r) => r.uuid === drag); setDrag(null); setOver(null); if (p) onMove(p, c.key); }}
            className={`flex min-h-[360px] w-[260px] shrink-0 flex-col rounded-2xl border bg-sunken/40 p-3 transition-colors lg:w-auto lg:flex-1 ${over === c.key && drag ? "border-primary/40 bg-primary-soft/30" : "border-line"}`}>
            <div className="mb-3 flex items-center justify-between px-1">
              <p className="text-[13.5px] text-ink">{c.label}</p><span className="tabular text-[12.5px] text-faint">{list.length}</span>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {loading && !rows.length ? [0, 1].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />) : list.map((p) => (
                <div key={p.uuid} draggable={OPEN.includes(p.status)} onDragStart={(e) => { setDrag(p.uuid); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDrag(null); setOver(null); }} onClick={() => onOpen(p)}
                  className={`cursor-pointer rounded-xl border border-line bg-surface p-3 transition-all duration-150 hover:-translate-y-px hover:border-line-strong ${drag === p.uuid ? "scale-[0.98] opacity-40" : ""}`}>
                  <div className="flex items-start gap-2.5">
                    <Avatar name={p.name} size={28} />
                    <div className="min-w-0"><p className="truncate text-[14px] text-ink">{p.name}</p><p className="truncate text-[12px] text-faint">{p.department ?? p.policy_name}</p></div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
                    {c.key === "confirmed"
                      ? <span>Confirmed {p.confirmation_date ? formatDisplayDate(p.confirmation_date) : ""}</span>
                      : <span className={`inline-flex items-center gap-1 ${p.overdue ? "text-rose-600" : p.days_left <= 15 ? "text-amber-700" : ""}`}><CalendarClock size={12} strokeWidth={1.4} />{p.days_left >= 0 ? `${p.days_left} days left` : `${-p.days_left} days over`}</span>}
                    {p.reviews_total > 0 && <span className="inline-flex items-center gap-1"><ClipboardCheck size={12} strokeWidth={1.4} />{p.reviews_done}/{p.reviews_total}</span>}
                    {p.extensions > 0 && <Badge tone="warn">Extended {p.extensions}×</Badge>}
                  </div>
                  {p.hold_reason && <p className="mt-1.5 line-clamp-2 text-[12px] text-amber-700">{p.hold_reason}</p>}
                </div>
              ))}
              {!loading && !list.length && <p className="px-1 py-8 text-center text-[12.5px] text-faint">Nothing here</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type MyReview = Review & { probation: Probation };

function MyReviews() {
  const toast = useToast();
  const [status, setStatus] = useState<"pending" | "submitted">("pending");
  const [rows, setRows] = useState<MyReview[] | null>(null);
  const [open, setOpen] = useState<MyReview | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    setRows(null);
    api.get<{ items: MyReview[] }>(`/probation/my-reviews?status=${status === "pending" ? "pending,waiting" : "submitted"}`).then((r) => setRows(r.items)).catch((e) => toast.error(e.message));
  }, [status, nonce, toast]);
  return (
    <div>
      <Tabs className="mb-4" value={status} onChange={setStatus} items={[{ value: "pending", label: "To review" }, { value: "submitted", label: "Done" }]} />
      {!rows ? <Skeleton className="h-40 rounded-2xl" /> : !rows.length ? (
        <Paper><EmptyState icon={ClipboardCheck} title={status === "pending" ? "No reviews waiting for you" : "No reviews yet"} hint="You're asked to review when a probation nears its end." /></Paper>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((r) => (
            <div key={r.uuid} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5"><Avatar name={r.probation.name} size={32} />
                  <div><p className="text-[14.5px] text-ink">{r.probation.name}</p><p className="text-[12px] text-faint">{[r.probation.designation, r.probation.department].filter(Boolean).join(" · ")}</p></div>
                </div>
                <Badge tone={r.kind === "feedback" ? "info" : "accent"}>{r.kind === "feedback" ? "Feedback" : `Level ${r.level}`}</Badge>
              </div>
              <p className="mt-3 text-[13px] text-muted">Joined {formatDisplayDate(r.probation.date_of_joining)} · probation ends {formatDisplayDate(r.probation.end_date)}</p>
              <div className="mt-3 flex items-center justify-between">
                {r.status === "submitted" ? <span className="flex items-center gap-2 text-[13px]"><Stars value={r.rating} />{r.recommendation_label}</span>
                  : r.status === "waiting" ? <span className="text-[13px] text-faint">Waiting for an earlier reviewer</span> : <span className="text-[13px] text-amber-700">Due</span>}
                {r.status === "pending" && <Button size="sm" variant="primary" onClick={() => setOpen(r)}>Review</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
      <ReviewFormModal review={open} name={open?.probation.name ?? ""} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); setNonce((n) => n + 1); }} />
    </div>
  );
}

function ReviewerView() {
  return (
    <div>
      <PageHeader title="Probation reviews" description="Rate the people whose probation is ending and recommend what happens next." />
      <MyReviews />
    </div>
  );
}

function StartModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (uuid: string) => void }) {
  const toast = useToast();
  const [emp, setEmp] = useState<number | null>(null);
  const [policy, setPolicy] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [policies, setPolicies] = useState<SelectOption<string>[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setEmp(null); setPolicy(null); setStart(""); setEnd("");
    api.get<{ items: Policy[] }>("/probation/policies").then((r) => setPolicies(r.items.filter((p) => p.active).map((p) => ({ value: p.uuid, label: p.name, description: `${p.duration_value} ${p.duration_unit}` })))).catch(() => {});
  }, [open]);
  async function save() {
    setSaving(true);
    try {
      const r = await api.post<{ uuid: string }>("/probation/probations", { employee_id: emp, policy_uuid: policy, start_date: start || null, end_date: end || null });
      toast.success("Probation started"); onDone(r.uuid);
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title="Start probation" busy={saving}
      description="New joiners start automatically. Use this for someone moved to probation or imported."
      footer={<><ModalCancel /><Button variant="primary" disabled={!emp} loading={saving} onClick={save}>Start</Button></>}>
      <div className="space-y-5">
        <Field label="Employee" required><Select loadOptions={loadEmployees} value={emp} onChange={setEmp} placeholder="Search people" /></Field>
        <Field label="Policy" hint="Leave empty to pick by rule"><Select options={policies} value={policy} onChange={setPolicy} clearable placeholder="By rule" /></Field>
        <FormGrid>
          <Field label="Starts" hint="Defaults to joining date"><DateInput value={start} onChange={setStart} clearable /></Field>
          <Field label="Ends" hint="Defaults from the policy"><DateInput value={end} onChange={setEnd} clearable /></Field>
        </FormGrid>
      </div>
    </Modal>
  );
}

function BulkCancel({ target, onClose, onConfirm }: { target: { uuids: string[] } | null; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open={!!target} onClose={onClose} size="sm" title={`Cancel ${target?.uuids.length ?? 0} probation(s)`}
      footer={<><ModalCancel /><Button variant="danger" disabled={!reason.trim()} onClick={() => { onConfirm(reason); setReason(""); }}>Cancel probations</Button></>}>
      <Field label="Reason" required><Textarea value={reason} onValueChange={setReason} /></Field>
    </Modal>
  );
}
