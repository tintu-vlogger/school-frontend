"use client";

/*
 * Approvals inbox: everything waiting for the signed-in person's decision, what they
 * decided before, their own requests, and delegation while they are away.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRightLeft, Check, CheckCheck, Clock, FileEdit, Inbox, Plus, Send, UserRoundCheck, X, XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatDateTime, formatRelative } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateRangeInput, Field, FilterBar, FormGrid, Modal, ModalCancel, Select, Tabs, TextInput,
  Textarea, Timeline, type BadgeTone, type Column, type SelectOption,
} from "@/components/ui-kit";
import { ProfileChangeModal } from "./profile-change";
import { NudgeButton, PassOnModal, RequestComments, RevokeBox, type RequestComment } from "@/components/workflow/request-extras";

type Brief = {
  uuid: string; reference_no: string | null; title: string; request_type: string; request_type_label: string;
  requester_name: string | null; status: string; created_at: string; completed_at: string | null; summary: string[];
};
type Task = {
  uuid: string; step_name: string; status: string; approver_name: string; comment: string | null; decided_by_name: string | null;
  decided_at: string | null; due_at: string | null; escalated: boolean; delegated: boolean; created_at: string; request: Brief;
};
type DetailTask = Omit<Task, "request"> & { mine: boolean; approver_kind: string };
type Detail = Brief & {
  payload: Record<string, unknown>; result_note: string | null; current_step: number; flow_name: string | null;
  flow_version: number | null; steps: { name: string }[]; tasks: DetailTask[]; can_withdraw: boolean;
  can_nudge: boolean; next_nudge_at: string | null; can_revoke: boolean; revoke_mode: string;
  revoke_pending: { uuid: string; reference_no: string | null } | null; revoked_at: string | null; revoke_reason: string | null;
  comments: RequestComment[];
};
type Page<T> = { items: T[]; total: number; page: number; size: number };
type Delegation = {
  uuid: string; from_name: string; to_name: string; start_date: string; end_date: string; request_type_label: string; note: string | null; active: boolean;
};
type TabKey = "waiting" | "done" | "mine" | "delegation";

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Waiting", tone: "warn" }, approved: { label: "Approved", tone: "good" }, rejected: { label: "Rejected", tone: "bad" },
  cancelled: { label: "Withdrawn", tone: "neutral" }, skipped: { label: "Not needed", tone: "neutral" },
  reassigned: { label: "Passed on", tone: "info" }, escalated: { label: "Escalated", tone: "info" },
  revoked: { label: "Cancelled after approval", tone: "neutral" },
};
const statusBadge = (s: string) => <Badge tone={STATUS[s]?.tone ?? "neutral"} dot>{STATUS[s]?.label ?? s}</Badge>;
const SIZE = 25;

async function loadEmployees(q: string): Promise<SelectOption<number>[]> {
  const rows = await api.get<{ value: number; label: string; hint: string }[]>(`/employees/lookup?q=${encodeURIComponent(q)}`);
  return rows.map((r) => ({ value: r.value, label: r.label, description: r.hint }));
}

export default function InboxPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const tab = (params.get("tab") as TabKey) || "waiting";
  const setTab = (t: TabKey) => router.replace(`/dashboard/inbox${t === "waiting" ? "" : `?tab=${t}`}`, { scroll: false });

  const [count, setCount] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [tasks, setTasks] = useState<Page<Task> | null>(null);
  const [requests, setRequests] = useState<Page<Brief> | null>(null);
  const [delegations, setDelegations] = useState<Delegation[] | null>(null);
  const [selected, setSelected] = useState<(string | number)[]>([]);
  const [openRequest, setOpenRequest] = useState<string | null>(params.get("request"));
  const [passOn, setPassOn] = useState<string[] | null>(null);
  const [bulk, setBulk] = useState<{ decision: "approve" | "reject"; uuids: string[] } | null>(null);
  const [asking, setAsking] = useState(false);
  const [delegating, setDelegating] = useState(false);

  const refreshCount = useCallback(() => {
    api.get<{ count: number }>("/workflow/inbox/count").then((r) => setCount(r.count)).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const query = `page=${page}&size=${SIZE}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`;
    try {
      if (tab === "waiting" || tab === "done") {
        setTasks(null);
        setTasks(await api.get<Page<Task>>(`/workflow/inbox?status=${tab === "waiting" ? "pending" : "done"}&${query}`));
      } else if (tab === "mine") {
        setRequests(null);
        setRequests(await api.get<Page<Brief>>(`/workflow/requests?scope=mine&${query}`));
      } else {
        setDelegations(null);
        setDelegations(await api.get<Delegation[]>("/workflow/delegations"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load approvals");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, page, q]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { refreshCount(); }, [refreshCount]);
  // Links from notifications and emails: ?task=<uuid> or ?request=<uuid>
  useEffect(() => {
    const task = params.get("task");
    if (!task) return;
    api.get<Page<Task>>(`/workflow/inbox?status=pending&task=${encodeURIComponent(task)}`)
      .then((r) => { if (r.items[0]) setOpenRequest(r.items[0].request.uuid); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { setPage(1); setSelected([]); }, [tab, q]);

  const afterChange = () => { setSelected([]); load(); refreshCount(); };

  const due = (t: Task) => {
    if (!t.due_at) return <span className="text-faint">—</span>;
    const late = new Date(t.due_at).getTime() < Date.now();
    return <span className={late ? "text-rose-600" : "text-muted"} title={formatDateTime(t.due_at)}>{late ? "Late · " : ""}{formatRelative(t.due_at)}</span>;
  };

  const requestCell = (r: Brief) => (
    <div className="min-w-0">
      <p className="truncate text-ink">{r.title}</p>
      <p className="truncate text-[12.5px] text-faint">{r.reference_no ?? ""}{r.summary?.[0] ? ` · ${r.summary[0]}` : ""}</p>
    </div>
  );

  const waitingCols: Column<Task>[] = [
    { key: "request", header: "Request", cell: (t) => requestCell(t.request) },
    { key: "who", header: "Asked by", hideBelow: "md", cell: (t) => <span className="text-muted">{t.request.requester_name}</span> },
    { key: "step", header: "Step", hideBelow: "lg", cell: (t) => <span className="text-muted">{t.step_name}{t.delegated ? " · for someone else" : ""}</span> },
    { key: "since", header: "Waiting since", hideBelow: "sm", cell: (t) => <span className="text-muted" title={formatDateTime(t.created_at)}>{formatRelative(t.created_at)}</span> },
    { key: "due", header: "Time limit", hideBelow: "md", cell: due },
  ];
  const doneCols: Column<Task>[] = [
    { key: "request", header: "Request", cell: (t) => requestCell(t.request) },
    { key: "who", header: "Asked by", hideBelow: "md", cell: (t) => <span className="text-muted">{t.request.requester_name}</span> },
    { key: "decision", header: "Your decision", cell: (t) => statusBadge(t.status) },
    { key: "when", header: "Decided", hideBelow: "sm", cell: (t) => <span className="text-muted">{t.decided_at ? formatDateTime(t.decided_at) : "—"}</span> },
    { key: "now", header: "Request now", hideBelow: "lg", cell: (t) => statusBadge(t.request.status) },
  ];
  const mineCols: Column<Brief>[] = [
    { key: "request", header: "Request", cell: requestCell },
    { key: "kind", header: "Kind", hideBelow: "md", cell: (r) => <span className="text-muted">{r.request_type_label}</span> },
    { key: "sent", header: "Sent", hideBelow: "sm", cell: (r) => <span className="text-muted">{formatDate(r.created_at)}</span> },
    { key: "status", header: "Status", cell: (r) => statusBadge(r.status) },
  ];

  const pagination = (total: number) => ({ page, size: SIZE, total, onPageChange: setPage });
  const isEmployee = !!user?.employee_id;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Home" title="Approvals"
        description="Requests waiting for your decision, the ones you decided, and your own requests."
        actions={
          <>
            {isEmployee && <Button variant="secondary" icon={FileEdit} onClick={() => setAsking(true)}>Request a change of details</Button>}
            {tab === "delegation" && <Button variant="primary" icon={Plus} onClick={() => setDelegating(true)}>Hand over approvals</Button>}
          </>
        } />

      <Tabs<TabKey> value={tab} onChange={setTab} items={[
        { value: "waiting", label: "Waiting for me", icon: Inbox, count: count ?? undefined },
        { value: "done", label: "Decided", icon: CheckCheck },
        { value: "mine", label: "My requests", icon: Send },
        { value: "delegation", label: "Delegation", icon: UserRoundCheck },
      ]} />

      {tab !== "delegation" && <FilterBar search={q} onSearchChange={setQ} searchPlaceholder="Search by request, reference or person" />}

      {tab === "waiting" && (
        <DataTable rows={tasks?.items ?? []} loading={tasks === null} columns={waitingCols} rowKey={(t) => t.uuid}
          onRowClick={(t) => setOpenRequest(t.request.uuid)}
          selectable selected={selected} onSelectedChange={setSelected}
          bulkActions={[
            { label: "Approve", icon: Check, onSelect: (rows) => setBulk({ decision: "approve", uuids: rows.map((r) => r.uuid) }) },
            { label: "Reject", icon: X, danger: true, onSelect: (rows) => setBulk({ decision: "reject", uuids: rows.map((r) => r.uuid) }) },
            { label: "Pass on", icon: ArrowRightLeft, onSelect: (rows) => setPassOn(rows.map((r) => r.uuid)) },
          ]}
          rowActions={(t) => [
            { label: "Approve", icon: Check, onSelect: () => setBulk({ decision: "approve", uuids: [t.uuid] }) },
            { label: "Reject", icon: X, danger: true, onSelect: () => setBulk({ decision: "reject", uuids: [t.uuid] }) },
            { label: "Pass on", icon: ArrowRightLeft, onSelect: () => setPassOn([t.uuid]) },
            "separator",
            { label: "Open", onSelect: () => setOpenRequest(t.request.uuid) },
          ]}
          pagination={tasks ? pagination(tasks.total) : undefined}
          emptyIcon={CheckCheck} emptyTitle="Nothing is waiting for you" emptyHint="New requests that need your decision will appear here." />
      )}
      {tab === "done" && (
        <DataTable rows={tasks?.items ?? []} loading={tasks === null} columns={doneCols} rowKey={(t) => t.uuid}
          onRowClick={(t) => setOpenRequest(t.request.uuid)} pagination={tasks ? pagination(tasks.total) : undefined}
          emptyIcon={Inbox} emptyTitle="You haven't decided any requests yet" />
      )}
      {tab === "mine" && (
        <DataTable rows={requests?.items ?? []} loading={requests === null} columns={mineCols} rowKey={(r) => r.uuid}
          onRowClick={(r) => setOpenRequest(r.uuid)} pagination={requests ? pagination(requests.total) : undefined}
          emptyIcon={Send} emptyTitle="You haven't sent any requests"
          emptyAction={isEmployee ? <Button variant="secondary" icon={FileEdit} onClick={() => setAsking(true)}>Request a change of details</Button> : undefined} />
      )}
      {tab === "delegation" && (
        <DataTable rows={delegations ?? []} loading={delegations === null} rowKey={(d) => d.uuid}
          columns={[
            { key: "from", header: "Approvals of", cell: (d) => d.from_name },
            { key: "to", header: "Handed to", cell: (d) => d.to_name },
            { key: "dates", header: "Dates", cell: (d) => <span className="text-muted">{formatDate(d.start_date)} – {formatDate(d.end_date)}</span> },
            { key: "kind", header: "Requests", hideBelow: "md", cell: (d) => <span className="text-muted">{d.request_type_label}</span> },
            { key: "status", header: "", align: "right", cell: (d) => d.active ? <Badge tone="good" dot>On</Badge> : <Badge>Stopped</Badge> },
          ]}
          rowActions={(d) => d.active ? [{ label: "Stop", icon: XCircle, danger: true, onSelect: async () => {
            try { await api.post(`/workflow/delegations/${d.uuid}/stop`); toast.success("Delegation stopped"); load(); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't stop it"); }
          } }] : []}
          emptyIcon={UserRoundCheck} emptyTitle="No delegation set up"
          emptyHint="Going on leave? Hand your approvals to a colleague for those dates." />
      )}

      {openRequest && (
        <RequestModal uuid={openRequest} onClose={() => setOpenRequest(null)} onChanged={afterChange} />
      )}
      {bulk && (
        <DecisionModal decision={bulk.decision} uuids={bulk.uuids} onClose={() => setBulk(null)}
          onDone={() => { setBulk(null); afterChange(); }} />
      )}
      {passOn && <PassOnModal taskUuids={passOn} onClose={() => setPassOn(null)} onDone={() => { setPassOn(null); afterChange(); }} />}
      {asking && <ProfileChangeModal onClose={() => setAsking(false)} onSent={() => { setAsking(false); setTab("mine"); load(); }} />}
      {delegating && <DelegationModal onClose={() => setDelegating(false)} onSaved={() => { setDelegating(false); load(); }} />}
    </div>
  );
}

function DecisionModal({ decision, uuids, onClose, onDone }: { decision: "approve" | "reject"; uuids: string[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const approve = decision === "approve";
  async function go() {
    setSaving(true);
    try {
      const r = await api.post<{ done: number; failed: number; results: { ok: boolean; detail?: string }[] }>(
        "/workflow/tasks/bulk-decision", { task_uuids: uuids, decision, comment: comment || null });
      if (r.failed === 0) toast.success(`${r.done} request${r.done === 1 ? "" : "s"} ${approve ? "approved" : "rejected"}`);
      else toast.warning(`${r.done} done, ${r.failed} not done`, { description: r.results.find((x) => !x.ok)?.detail });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the decision");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal open onClose={onClose} size="sm" busy={saving} dirty={!!comment}
      title={`${approve ? "Approve" : "Reject"} ${uuids.length > 1 ? `${uuids.length} requests` : "request"}`}
      footer={<><ModalCancel /><Button variant={approve ? "primary" : "danger"} icon={approve ? Check : X} loading={saving}
        disabled={!approve && !comment.trim()} onClick={go}>{approve ? "Approve" : "Reject"}</Button></>}>
      <Field label={approve ? "Comment (optional)" : "Why is it rejected?"} required={!approve}>
        <Textarea value={comment} onValueChange={setComment} rows={3} autoGrow data-autofocus
          placeholder={approve ? "Anything the requester should know" : "The requester will see this"} />
      </Field>
    </Modal>
  );
}

function RequestModal({ uuid, onClose, onChanged }: { uuid: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<Detail | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [passTo, setPassTo] = useState<number | null>(null);
  const [passing, setPassing] = useState(false);

  const load = useCallback(() => {
    api.get<Detail>(`/workflow/requests/${uuid}`).then(setD).catch((e) => { toast.error(e instanceof Error ? e.message : "Couldn't open the request"); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid]);
  useEffect(() => { load(); }, [load]);

  const myTask = d?.tasks.find((t) => t.mine);
  const mineToWithdraw = !!d?.can_withdraw;

  async function decide(decision: "approve" | "reject") {
    if (!myTask) return;
    if (decision === "reject" && !comment.trim()) { toast.error("Add a comment saying why the request is rejected."); return; }
    setBusy(true);
    try {
      await api.post(`/workflow/tasks/${myTask.uuid}/decision`, { decision, comment: comment || null });
      toast.success(decision === "approve" ? "Approved" : "Rejected");
      onChanged();
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save the decision"); }
    finally { setBusy(false); }
  }
  async function withdraw() {
    setBusy(true);
    try { await api.post(`/workflow/requests/${uuid}/cancel`, { reason: comment || null }); toast.success("Request withdrawn"); onChanged(); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't withdraw"); }
    finally { setBusy(false); }
  }
  async function passOn() {
    if (!myTask || !passTo) return;
    setBusy(true);
    try { await api.post(`/workflow/tasks/${myTask.uuid}/reassign`, { to_employee_id: passTo, comment: comment || null }); toast.success("Passed on"); onChanged(); onClose(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't pass it on"); }
    finally { setBusy(false); }
  }

  const tone = (s: string) => (s === "approved" ? "good" : s === "rejected" ? "bad" : s === "pending" ? "warn" : "neutral") as "good" | "bad" | "warn" | "neutral";

  return (
    <Modal open onClose={onClose} size="lg" busy={busy} dirty={!!comment}
      title={d?.title ?? "Request"} description={d ? `${d.reference_no ?? ""} · ${d.request_type_label}` : undefined}
      headerActions={d ? statusBadge(d.status) : undefined}
      footerStart={d?.status === "pending" && mineToWithdraw && !myTask ? (
        <div className="flex gap-1">
          <Button variant="ghost" onClick={withdraw} loading={busy}>Withdraw request</Button>
          {d.can_nudge && <NudgeButton uuid={uuid} nextAt={d.next_nudge_at} onDone={load} />}
        </div>
      ) : undefined}
      footer={myTask ? (
        <>
          <Button variant="secondary" icon={X} onClick={() => decide("reject")} disabled={busy}>Reject</Button>
          <Button variant="primary" icon={Check} onClick={() => decide("approve")} loading={busy}>Approve</Button>
        </>
      ) : <ModalCancel>Close</ModalCancel>}>
      {!d ? <div className="h-40 animate-pulse rounded-xl bg-sunken" /> : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Info label="Asked by" value={d.requester_name ?? "—"} />
            <Info label="Sent" value={formatDateTime(d.created_at)} />
            <Info label="Approval flow" value={d.flow_name ? `${d.flow_name} (v${d.flow_version})` : "None needed"} />
          </div>

          {d.summary.length > 0 && (
            <div className="rounded-xl border border-line bg-canvas/50 px-4 py-3">
              <p className="mb-2 text-[12px] uppercase tracking-[0.06em] text-faint">What is asked</p>
              <ul className="space-y-1.5 text-[14px] text-ink">{d.summary.map((s) => <li key={s}>{s}</li>)}</ul>
            </div>
          )}

          <div>
            <p className="mb-3 text-[12px] uppercase tracking-[0.06em] text-faint">Progress</p>
            <Timeline items={[
              { id: "sent", title: "Request sent", description: d.requester_name ?? undefined, time: formatDateTime(d.created_at), icon: Send, tone: "accent" },
              ...d.tasks.map((t) => ({
                id: t.uuid,
                title: <span className="inline-flex flex-wrap items-center gap-2">{t.step_name} · {t.approver_name} {statusBadge(t.status)}</span>,
                description: [t.comment && `“${t.comment}”`, t.decided_by_name && t.status !== "pending" ? `by ${t.decided_by_name}` : null,
                  t.status === "pending" && t.due_at ? `time limit ${formatRelative(t.due_at)}` : null, t.delegated ? "handed over by delegation" : null]
                  .filter(Boolean).join(" · ") || undefined,
                time: t.decided_at ? formatDateTime(t.decided_at) : formatRelative(t.created_at),
                icon: t.status === "pending" ? Clock : t.status === "approved" ? Check : t.status === "rejected" ? X : ArrowRightLeft,
                tone: tone(t.status),
              })),
              ...(d.status !== "pending" ? [{ id: "end", title: `Request ${d.status === "revoked" ? "approved" : STATUS[d.status]?.label.toLowerCase() ?? d.status}`,
                description: d.result_note ?? undefined,
                time: d.completed_at ? formatDateTime(d.completed_at) : undefined, icon: d.status === "approved" || d.status === "revoked" ? CheckCheck : XCircle,
                tone: tone(d.status === "revoked" ? "approved" : d.status) }] : []),
              ...(d.revoked_at ? [{ id: "revoked", title: "Cancelled after approval", description: d.revoke_reason ?? undefined,
                time: formatDateTime(d.revoked_at), icon: XCircle, tone: "neutral" as const }] : []),
            ]} />
          </div>

          {d.revoke_pending && (
            <p className="rounded-xl bg-sunken/60 px-4 py-3 text-[13.5px] text-muted">
              A cancellation of this request is waiting for approval{d.revoke_pending.reference_no ? ` (${d.revoke_pending.reference_no})` : ""}.
            </p>
          )}
          {d.can_revoke && <RevokeBox uuid={uuid} mode={d.revoke_mode} onDone={() => { load(); onChanged(); }} />}

          <RequestComments uuid={uuid} comments={d.comments ?? []} onAdded={load} />

          {(myTask || (d.status === "pending" && mineToWithdraw)) && (
            <Field label={myTask ? "Comment" : "Reason for withdrawing (optional)"} hint={myTask ? "Needed when rejecting." : undefined}>
              <Textarea value={comment} onValueChange={setComment} rows={2} autoGrow />
            </Field>
          )}
          {myTask && (
            <div className="rounded-xl border border-line px-4 py-3">
              {!passing ? (
                <button className="text-[13.5px] text-muted hover:text-primary" onClick={() => setPassing(true)}>
                  <ArrowRightLeft size={14} strokeWidth={1.4} className="mr-1.5 inline" />Pass this approval to someone else
                </button>
              ) : (
                <FormGrid>
                  <Field label="Pass to"><Select<number> value={passTo} onChange={(v) => setPassTo(v)} loadOptions={loadEmployees} placeholder="Search by name" /></Field>
                  <div className="flex items-end"><Button variant="secondary" icon={ArrowRightLeft} disabled={!passTo} onClick={passOn}>Pass on</Button></div>
                </FormGrid>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[12px] text-faint">{label}</p>
      <p className="mt-0.5 text-[14px] text-ink">{value}</p>
    </div>
  );
}

function DelegationModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [to, setTo] = useState<number | null>(null);
  const [from, setFrom] = useState<number | null>(user?.employee_id ?? null);
  const [range, setRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [kind, setKind] = useState<string | null>(null);
  const [kinds, setKinds] = useState<SelectOption[]>([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get<{ key: string; label: string }[]>("/workflow/request-types")
      .then((r) => setKinds(r.map((x) => ({ value: x.key, label: x.label })))).catch(() => {});
  }, []);
  async function save() {
    if (!to || !range.from || !range.to) { toast.error("Pick who approves for you and the dates."); return; }
    setSaving(true);
    try {
      await api.post("/workflow/delegations", { to_employee_id: to, from_employee_id: from, start_date: range.from, end_date: range.to,
        request_type: kind, note: note || null });
      toast.success("Approvals handed over");
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setSaving(false); }
  }
  return (
    <Modal open onClose={onClose} size="md" busy={saving} dirty={!!to || !!note}
      title="Hand over approvals" description="New approvals go to this person for the dates you choose."
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={save}>Save</Button></>}>
      <div className="space-y-5">
        {(user?.is_owner || !user?.employee_id) && (
          <Field label="Approvals of" hint="As the company owner you can set this up for anyone.">
            <Select<number> value={from} onChange={(v) => setFrom(v)} loadOptions={loadEmployees} placeholder="Search by name" />
          </Field>
        )}
        <Field label="Hand to" required><Select<number> value={to} onChange={(v) => setTo(v)} loadOptions={loadEmployees} placeholder="Search by name" /></Field>
        <Field label="Dates" required>
          <DateRangeInput value={range} onChange={setRange} />
        </Field>
        <Field label="Requests"><Select value={kind} onChange={(v) => setKind(v)} options={kinds} clearable placeholder="All requests" /></Field>
        <Field label="Note (optional)"><TextInput value={note} onValueChange={setNote} placeholder="e.g. On leave" /></Field>
      </div>
    </Modal>
  );
}
