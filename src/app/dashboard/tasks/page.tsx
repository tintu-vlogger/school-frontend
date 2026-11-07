"use client";

/*
 * Tasks: my tasks, tasks I assigned, my team's and (for task managers) everyone's, as a
 * list or a board. Add/edit and details open in centered modals.
 */
import { useCallback, useEffect, useState } from "react";
import {
  AlarmClock, CalendarCheck, CheckCircle2, Circle, Columns3, List, ListChecks, Pencil, Plus, Repeat, UserRoundCog,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast-context";
import { todayISO } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, Field, FilterBar, Modal, ModalCancel, Select, StatCard, Tabs, formatDisplayDate,
  type Column, type FilterValues, type TabItem,
} from "@/components/ui-kit";
import { PRIORITY_LABEL, PRIORITY_OPTIONS, PRIORITY_TONE, loadEmployees } from "@/components/workplace/pickers";
import { TaskBoard } from "@/components/tasks/board";
import { TaskDetailModal } from "@/components/tasks/task-detail";
import { TaskFormModal } from "@/components/tasks/task-form";
import { STATUS_TONE, isOverdue, type Task, type TaskSummary } from "@/components/tasks/types";

type Scope = "mine" | "assigned_by_me" | "team" | "all";
type Page<T> = { items: T[]; total: number; page: number; size: number };
const SIZE = 25;
const VIEW_KEY = "hrms_tasks_view";

export default function TasksPage() {
  const toast = useToast();
  const { user } = useAuth();
  const isOwner = !!user && !user.employee_id;
  const [summary, setSummary] = useState<TaskSummary | null>(null);
  const [scope, setScope] = useState<Scope>("mine");
  const [view, setViewState] = useState<"list" | "board">("list");
  const setView = (v: "list" | "board") => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };
  useEffect(() => { try { if (localStorage.getItem(VIEW_KEY) === "board") setViewState("board"); } catch { /* private mode */ } }, []);
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Task> | null>(null);
  const [board, setBoard] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [assigning, setAssigning] = useState<{ uuids: string[]; clear: () => void } | null>(null);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => { api.get<TaskSummary>("/tasks/summary").then(setSummary).catch(() => {}); }, [nonce]);
  // The company owner has no employee record, so nothing is assigned to them: start on everyone's tasks.
  useEffect(() => { if (isOwner && summary?.is_admin) setScope((s) => (s === "mine" ? "all" : s)); }, [isOwner, summary?.is_admin]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const params = new URLSearchParams({ scope });
    if (q) params.set("q", q);
    if (filters.status?.length) params.set("status", filters.status.join(","));
    if (filters.priority?.[0]) params.set("priority", filters.priority[0]);
    if (filters.due?.[0]) params.set("due", filters.due[0]);
    if (view === "board") params.set("board", "true");
    else { params.set("page", String(page)); params.set("size", String(SIZE)); }
    api.get<Page<Task> & { items: Task[] }>(`/tasks?${params}`)
      .then((r) => { if (!live) return; if (view === "board") setBoard(r.items); else setData(r); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load tasks"))
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [scope, q, filters, page, view, nonce, toast]);

  async function quickStatus(t: Task, status: string) {
    try {
      const out = await api.post<Task>(`/tasks/${t.uuid}/status`, { status });
      if (out.next_occurrence) toast.success("Done. The next one is due " + formatDisplayDate(out.next_occurrence.due_date));
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update"); }
  }
  async function bulk(uuids: string[], body: Record<string, unknown>, clear: () => void) {
    try {
      const r = await api.post<{ done: number; failed: { reason: string }[] }>("/tasks/bulk", { uuids, ...body });
      if (r.failed.length) toast.warning(`${r.done} updated, ${r.failed.length} skipped`, { description: r.failed[0].reason });
      else toast.success(`${r.done} ${r.done === 1 ? "task" : "tasks"} updated`);
      clear(); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update"); }
  }
  async function move(t: Task, status: string, before: Task | null, after: Task | null) {
    setBoard((b) => b.map((x) => (x.uuid === t.uuid ? { ...x, status, position: before && after ? (before.position + after.position) / 2 : before ? before.position - 1 : after ? after.position + 1 : x.position } : x)));
    try {
      await api.post(`/tasks/${t.uuid}/move`, { status, before_uuid: before?.uuid ?? null, after_uuid: after?.uuid ?? null });
      if (status === "done" && t.recurrence) toast.success("Done. The next one was created.");
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't move the task"); refresh(); }
  }

  const today = todayISO();
  const tabs: TabItem<Scope>[] = [
    ...(isOwner ? [] : [{ value: "mine" as const, label: "My tasks", count: summary?.open }]),
    { value: "assigned_by_me", label: "Assigned by me" },
    ...(summary?.has_team ? [{ value: "team" as const, label: "My team", count: summary.team_open }] : []),
    ...(summary?.is_admin ? [{ value: "all" as const, label: "Everyone" }] : []),
  ];

  const columns: Column<Task>[] = [
    {
      key: "done", header: "", width: "44px", cell: (t) => t.can_work && t.status !== "cancelled" ? (
        <button type="button" aria-label={t.status === "done" ? "Mark not done" : "Mark done"} onClick={(e) => { e.stopPropagation(); quickStatus(t, t.status === "done" ? "todo" : "done"); }}
          className="flex h-6 w-6 items-center justify-center rounded-full text-faint transition-colors hover:text-emerald-600">
          {t.status === "done" ? <CheckCircle2 size={19} strokeWidth={1.4} className="text-emerald-600" /> : <Circle size={19} strokeWidth={1.3} />}
        </button>
      ) : null,
    },
    {
      key: "title", header: "Task", sortable: true, sortValue: (t) => t.title, cell: (t) => (
        <div className="min-w-0">
          <p className={`truncate ${t.status === "done" ? "text-muted line-through" : "text-ink"}`}>
            {t.title}{t.recurrence && <Repeat size={12} strokeWidth={1.4} className="ml-1.5 inline text-faint" />}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-faint">
            {t.checklist_total > 0 && <span className="inline-flex items-center gap-1"><ListChecks size={12} strokeWidth={1.4} />{t.checklist_done}/{t.checklist_total}</span>}
            {t.labels.slice(0, 3).map((l) => <span key={l} className="rounded bg-sunken px-1.5 py-px text-muted">{l}</span>)}
            {t.source_module && <span>from {t.source_module}</span>}
          </div>
        </div>
      ),
    },
    { key: "assignee", header: "Assigned to", hideBelow: "md", cell: (t) => t.assignee_name ? <span className="flex items-center gap-2"><Avatar name={t.assignee_name} size={24} /><span className="truncate text-ink/80">{t.assignee_name}</span></span> : <span className="text-faint">—</span> },
    { key: "priority", header: "Priority", hideBelow: "sm", sortable: true, sortValue: (t) => ["low", "medium", "high", "urgent"].indexOf(t.priority), cell: (t) => <Badge tone={PRIORITY_TONE[t.priority] ?? "neutral"}>{PRIORITY_LABEL[t.priority]}</Badge> },
    { key: "due", header: "Due", sortable: true, sortValue: (t) => t.due_date ?? "9999", cell: (t) => t.due_date ? <span className={isOverdue(t, today) ? "text-rose-600" : t.due_date === today ? "text-amber-700" : "text-muted"}>{isOverdue(t, today) && <AlarmClock size={13} strokeWidth={1.4} className="mr-1 inline" />}{t.due_date === today ? "Today" : formatDisplayDate(t.due_date)}</span> : <span className="text-faint">—</span> },
    { key: "status", header: "Status", hideBelow: "lg", cell: (t) => <Badge tone={STATUS_TONE[t.status] ?? "neutral"} dot>{t.status_label}</Badge> },
  ];

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const filtered = !!q || Object.values(filters).some((v) => v?.length);
  return (
    <div>
      <PageHeader eyebrow="Home" title="Tasks" description="Work assigned to you and by you, with due dates, checklists and reminders."
        actions={<Button variant="primary" icon={Plus} onClick={openNew}>New task</Button>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open" value={summary?.open ?? "—"} icon={ListChecks} />
        <StatCard label="Overdue" value={summary?.overdue ?? "—"} icon={AlarmClock} hint={summary?.overdue ? "Past the due date" : undefined}
          onClick={() => { setScope("mine"); setFilters({ due: ["overdue"] }); setPage(1); }} />
        <StatCard label="Due today" value={summary?.due_today ?? "—"} icon={CalendarCheck} onClick={() => { setScope("mine"); setFilters({ due: ["today"] }); setPage(1); }} />
        <StatCard label="Done this week" value={summary?.done_this_week ?? "—"} icon={CheckCircle2} />
      </div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Tabs items={tabs} value={scope} onChange={(s) => { setScope(s); setPage(1); }} />
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5">
          {([["list", List, "List"], ["board", Columns3, "Board"]] as const).map(([k, Icon, label]) => (
            <button key={k} type="button" onClick={() => setView(k)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] transition-colors ${view === k ? "bg-primary-soft text-primary" : "text-muted hover:text-ink"}`}>
              <Icon size={14} strokeWidth={1.4} />{label}
            </button>
          ))}
        </div>
      </div>
      <FilterBar searchPlaceholder="Search tasks" onSearchChange={(x) => { setQ(x); setPage(1); }} values={filters}
        onChange={(v) => { setFilters(v); setPage(1); }}
        filters={[
          ...(view === "list" ? [{ key: "status", label: "Status", multiple: true, options: [{ value: "todo", label: "To do" }, { value: "in_progress", label: "In progress" }, { value: "done", label: "Done" }, { value: "cancelled", label: "Cancelled" }] }] : []),
          { key: "priority", label: "Priority", options: PRIORITY_OPTIONS },
          { key: "due", label: "Due", options: [{ value: "overdue", label: "Overdue" }, { value: "today", label: "Today" }, { value: "week", label: "Next 7 days" }, { value: "none", label: "No due date" }] },
        ]} />
      {view === "list" ? (
        <DataTable rows={data?.items ?? []} rowKey={(t) => t.uuid} columns={columns} loading={loading}
          onRowClick={(t) => setViewing(t.uuid)}
          rowActions={(t) => [
            { label: "Open", icon: ListChecks, onSelect: () => setViewing(t.uuid) },
            ...(t.can_edit ? [{ label: "Edit", icon: Pencil, onSelect: () => { setEditing(t); setFormOpen(true); } }] : []),
          ]}
          selectable
          bulkActions={[
            { label: "Mark done", icon: CheckCircle2, onSelect: (rows, clear) => bulk(rows.map((r) => r.uuid), { status: "done" }, clear) },
            { label: "Assign to…", icon: UserRoundCog, onSelect: (rows, clear) => setAssigning({ uuids: rows.map((r) => r.uuid), clear }) },
          ]}
          pagination={{ page, size: SIZE, total: data?.total ?? 0, onPageChange: setPage }}
          emptyIcon={ListChecks}
          emptyTitle={filtered ? "No tasks match" : scope === "mine" ? "Nothing on your plate" : "No tasks here"}
          emptyHint={filtered ? "Try another search or clear the filters." : "Create a task and assign it to yourself or a colleague."}
          emptyAction={!filtered && <Button variant="primary" icon={Plus} onClick={openNew}>New task</Button>} />
      ) : (
        <TaskBoard tasks={board} loading={loading} onOpen={(t) => setViewing(t.uuid)} onMove={move} />
      )}

      <TaskDetailModal uuid={viewing} open={!!viewing} onClose={() => setViewing(null)} onChanged={refresh}
        onEdit={(t) => { setViewing(null); setEditing(t); setFormOpen(true); }} />
      <TaskFormModal open={formOpen} task={editing} onClose={() => setFormOpen(false)}
        onSaved={(t) => { setFormOpen(false); refresh(); if (!editing) setViewing(t.uuid); }} />
      <AssignModal target={assigning} onClose={() => setAssigning(null)}
        onAssign={(id) => { if (assigning) bulk(assigning.uuids, { assignee_employee_id: id }, assigning.clear); setAssigning(null); }} />
    </div>
  );
}

function AssignModal({ target, onClose, onAssign }: { target: { uuids: string[] } | null; onClose: () => void; onAssign: (id: number) => void }) {
  const [id, setId] = useState<number | null>(null);
  return (
    <Modal open={!!target} onClose={onClose} size="sm" title={`Assign ${target?.uuids.length ?? 0} ${target?.uuids.length === 1 ? "task" : "tasks"}`}
      footer={<><ModalCancel /><Button variant="primary" disabled={!id} onClick={() => id && onAssign(id)}>Assign</Button></>}>
      <Field label="Assign to"><Select value={id} onChange={setId} loadOptions={loadEmployees} placeholder="Search people" /></Field>
    </Modal>
  );
}
