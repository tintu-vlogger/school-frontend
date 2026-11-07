"use client";

/*
 * Timesheets: my week (project/task rows by day, saved together and sent for approval),
 * approvals (line by line in a modal), the team's timesheets, and for timesheet admins
 * projects with tasks and budgets, clients, and billing (rates, GST invoices).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { BellRing, Briefcase, ChevronLeft, ChevronRight, Plus, Save, Send, Timer, Trash2, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, todayISO } from "@/lib/datetime";
import { useUrlTab } from "@/lib/use-url-tab";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Badge, Button, DataTable, FilterBar, Select, Tabs, useConfirm, type Column, type FilterValues } from "@/components/ui-kit";
import { addDays, errorText, hoursShort, mondayOf, statusInfo, useAttendanceAccess, WEEKDAYS } from "@/components/attendance/shared";
import {
  BudgetBar, ClientModal, LineStatus, ProjectDetailModal, ProjectModal, SheetModal, SheetStatus, weekLabel,
  type Client, type Log, type Project, type Sheet,
} from "@/components/attendance/timesheet-modals";
import { Billing } from "@/components/timesheets/billing";

type Tab = "week" | "approvals" | "team" | "projects" | "clients" | "billing";
const TABS: readonly Tab[] = ["week", "approvals", "team", "projects", "clients", "billing"];

type WeekRow = { key: string; project_id: number | null; task_id: number | null; billable: boolean; description: string | null; hours: Record<string, string>; logs: Record<string, Log[]> };
type Week = {
  week_start: string; week_end: string; timesheet: Sheet | null; total: string; editable: boolean;
  rows: (WeekRow & { project_name: string; task_name: string | null })[];
  days: { date: string; status: string | null; worked_minutes: number; logged: string }[];
  projects: { id: number; name: string; client_name: string | null; billable: boolean }[];
  tasks: { id: number; project_id: number; name: string; billable: boolean }[];
};
type Page<T> = { items: T[]; total: number };

let rowSeq = 0;

function MyWeek() {
  const toast = useToast();
  const confirm = useConfirm();
  const [start, setStart] = useState(() => mondayOf(todayISO()));
  const [week, setWeek] = useState<Week | null>(null);
  const [rows, setRows] = useState<WeekRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setWeek(null);
    api.get<Week>(`/timesheets/me/week?start=${start}`).then((w) => {
      if (!live) return;
      setWeek(w);
      setRows(w.rows.map((r) => ({ key: r.key, project_id: r.project_id, task_id: r.task_id, billable: r.billable, description: r.description, hours: { ...r.hours }, logs: r.logs })));
      setDirty(false);
    }).catch((e) => toast.error(errorText(e, "Couldn't load the week")));
    return () => { live = false; };
  }, [start, nonce, toast]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const locked = (r: WeekRow, d: string) => (r.logs[d] ?? []).some((l) => l.status === "submitted" || l.status === "approved");
  const editable = !!week?.editable;
  const setRow = (key: string, x: Partial<WeekRow>) => { setRows((o) => o.map((r) => (r.key === key ? { ...r, ...x } : r))); setDirty(true); };
  const num = (s: string | undefined) => Number(s || 0) || 0;
  const dayTotal = (d: string) => rows.reduce((a, r) => a + num(r.hours[d]), 0);
  const total = rows.reduce((a, r) => a + days.reduce((b, d) => b + num(r.hours[d]), 0), 0);

  async function save(): Promise<boolean> {
    const bad = rows.find((r) => !r.project_id && days.some((d) => num(r.hours[d]) > 0));
    if (bad) { toast.error("Choose a project for every row with hours."); return false; }
    setSaving(true);
    try {
      const body = { week_start: start, rows: rows.filter((r) => r.project_id).map((r) => ({
        project_id: r.project_id, task_id: r.task_id, billable: r.billable, description: r.description,
        hours: Object.fromEntries(days.map((d) => [d, r.hours[d] || null])),
      })) };
      await api.put("/timesheets/me/week", body);
      toast.success("Week saved");
      setNonce((n) => n + 1);
      return true;
    } catch (e) { toast.error(errorText(e, "Couldn't save")); return false; } finally { setSaving(false); }
  }
  async function send() {
    if (!(await confirm({ title: "Send this week for approval?", message: `${total.toFixed(2)} hours from ${formatDate(start)} to ${formatDate(addDays(start, 6))}. Lines can't be changed while they wait.`, confirmLabel: "Send" }))) return;
    if (dirty && !(await save())) return;
    setSaving(true);
    try {
      const r = await api.post<Sheet>("/timesheets/me/submit", { week_start: start });
      toast.success(r.status === "approved" ? "Approved" : "Sent for approval");
      setNonce((n) => n + 1);
    } catch (e) { toast.error(errorText(e, "Couldn't send")); } finally { setSaving(false); }
  }

  const ts = week?.timesheet;
  const rejected = rows.flatMap((r) => Object.values(r.logs).flat()).filter((l) => l.status === "rejected");
  const projectOpts = (week?.projects ?? []).map((p) => ({ value: p.id, label: p.name, description: p.client_name ?? "Internal" }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button size="sm" icon={ChevronLeft} aria-label="Previous week" onClick={() => setStart(addDays(start, -7))} />
          <p className="min-w-[200px] text-center text-[15px] text-ink">{formatDate(start, { year: undefined })} to {formatDate(addDays(start, 6))}</p>
          <Button size="sm" icon={ChevronRight} aria-label="Next week" onClick={() => setStart(addDays(start, 7))} />
          {start !== mondayOf(todayISO()) && <Button size="sm" variant="ghost" onClick={() => setStart(mondayOf(todayISO()))}>This week</Button>}
        </div>
        <div className="flex items-center gap-2">
          {ts && <SheetStatus status={ts.status} />}
          {editable && <Button icon={Save} loading={saving} disabled={!dirty} onClick={save}>Save</Button>}
          {editable && <Button variant="primary" icon={Send} loading={saving} disabled={total <= 0} onClick={send}>Send for approval</Button>}
        </div>
      </div>
      {rejected.length > 0 && (
        <Paper className="border-rose-200 px-4 py-3 text-[13.5px]">
          <p className="text-rose-700">{rejected.length} {rejected.length === 1 ? "entry was" : "entries were"} sent back. Fix them and send the week again.</p>
          <ul className="mt-1 text-muted">{rejected.map((l) => <li key={l.uuid}>{formatDate(l.date, { year: undefined })}, {l.project_name}: {l.review_comment || "No reason given"}</li>)}</ul>
        </Paper>
      )}
      <Paper className="overflow-x-auto">
        {!week ? <div className="m-4 h-48 animate-pulse rounded-xl bg-sunken" /> : (
          <table className="w-full min-w-[920px] text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-[12.5px] text-muted">
                <th className="w-[300px] px-4 py-2.5 text-left font-normal">Project and task</th>
                {days.map((d, i) => {
                  const info = week.days.find((x) => x.date === d);
                  const off = info?.status && ["weekly_off", "holiday", "on_leave"].includes(info.status);
                  return (
                    <th key={d} className={`px-1 py-2 text-center font-normal ${off ? "bg-sunken/60" : ""}`}>
                      <p className={d === todayISO() ? "text-primary" : "text-ink"}>{WEEKDAYS[i]} {Number(d.slice(8))}</p>
                      <p className="text-[11.5px] text-faint">{off ? statusInfo(info!.status).label : info?.worked_minutes ? `${hoursShort(info.worked_minutes)} at work` : " "}</p>
                    </th>
                  );
                })}
                <th className="w-16 px-3 text-right font-normal">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const tasks = (week.tasks ?? []).filter((t) => t.project_id === r.project_id);
                const rowTotal = days.reduce((a, d) => a + num(r.hours[d]), 0);
                const anyLocked = days.some((d) => locked(r, d));
                return (
                  <tr key={r.key} className="align-top">
                    <td className="space-y-1.5 px-4 py-2">
                      <Select<number> value={r.project_id} options={projectOpts} placeholder="Project" disabled={!editable || anyLocked}
                        onChange={(x) => { const p = week.projects.find((pp) => pp.id === x); setRow(r.key, { project_id: x, task_id: null, billable: p?.billable ?? true }); }} />
                      {tasks.length > 0 && <Select<number> value={r.task_id} clearable placeholder="Task" disabled={!editable || anyLocked}
                        options={tasks.map((t) => ({ value: t.id, label: t.name }))} onChange={(x) => setRow(r.key, { task_id: x })} />}
                    </td>
                    {days.map((d) => {
                      const ls = r.logs[d] ?? [];
                      const st = ls[0]?.status;
                      return (
                        <td key={d} className="px-1 py-2 text-center">
                          <input inputMode="decimal" aria-label={`Hours on ${d}`} value={r.hours[d] && num(r.hours[d]) ? String(num(r.hours[d])) : ""}
                            disabled={!editable || locked(r, d)} placeholder="–"
                            onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); setRow(r.key, { hours: { ...r.hours, [d]: v } }); }}
                            className={`h-9 w-full max-w-[64px] rounded-lg border bg-surface text-center tabular text-[13.5px] outline-none focus:border-primary disabled:bg-sunken disabled:text-muted ${st === "rejected" ? "border-rose-300" : "border-line"}`} />
                          {st && st !== "draft" && <div className="mt-1"><LineStatus status={st} /></div>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-3.5 text-right tabular text-ink">{rowTotal ? rowTotal.toFixed(2) : "–"}</td>
                    <td className="py-2.5 pr-3">
                      {editable && !anyLocked && (
                        <button type="button" aria-label="Remove row" className="mt-1 text-faint hover:text-rose-600"
                          onClick={() => { setRows((o) => o.filter((x) => x.key !== r.key)); setDirty(true); }}>
                          <Trash2 size={15} strokeWidth={1.4} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={10}><EmptyState icon={Timer} title="No time logged this week" hint={week.projects.length ? "Add a row for each project you worked on." : "You are not on any project yet."} /></td></tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-line text-[13px]">
                <td className="px-4 py-2.5">
                  {editable && week.projects.length > 0 && (
                    <Button size="sm" variant="ghost" icon={Plus} onClick={() => { setRows((o) => [...o, { key: `new${++rowSeq}`, project_id: null, task_id: null, billable: true, description: null, hours: {}, logs: {} }]); setDirty(true); }}>Add row</Button>
                  )}
                </td>
                {days.map((d) => <td key={d} className="px-1 py-2.5 text-center tabular text-muted">{dayTotal(d) ? dayTotal(d).toFixed(2) : ""}</td>)}
                <td className="px-3 py-2.5 text-right tabular text-ink">{total.toFixed(2)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </Paper>
      {week && !editable && ts && <p className="text-[13px] text-muted">This week is {ts.status === "approved" ? "approved" : "waiting for approval"}, so it can&apos;t be changed.</p>}
    </div>
  );
}

function Approvals({ onOpen, nonce }: { onOpen: (uuid: string) => void; nonce: number }) {
  const [rows, setRows] = useState<Sheet[] | null>(null);
  useEffect(() => {
    let live = true;
    api.get<Sheet[]>("/timesheets/approvals").then((r) => { if (live) setRows(r); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [nonce]);
  const cols: Column<Sheet>[] = [
    { key: "who", header: "Employee", cell: (s) => <span className="text-ink">{s.employee_name}</span> },
    { key: "week", header: "Week", cell: (s) => <span className="text-muted">{weekLabel(s)}</span> },
    { key: "hours", header: "Hours", align: "right", cell: (s) => <span className="tabular">{Number(s.total_hours).toFixed(2)}</span> },
    { key: "status", header: "Status", cell: (s) => <SheetStatus status={s.status} /> },
  ];
  return <DataTable rows={rows ?? []} rowKey={(s) => s.uuid} columns={cols} loading={!rows} onRowClick={(s) => onOpen(s.uuid)}
    emptyIcon={Send} emptyTitle="Nothing waiting for you" emptyHint="Timesheets sent to you for approval show up here." />;
}

function Team({ onOpen, nonce }: { onOpen: (uuid: string) => void; nonce: number }) {
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<Sheet> | null>(null);
  useEffect(() => {
    let live = true;
    const q = new URLSearchParams({ page: String(page), size: "25" });
    if (filters.status?.length) q.set("status", filters.status.join(","));
    api.get<Page<Sheet>>(`/timesheets/?${q}`).then((r) => { if (live) setData(r); }).catch(() => { if (live) setData({ items: [], total: 0 }); });
    return () => { live = false; };
  }, [filters, page, nonce]);
  const cols: Column<Sheet>[] = [
    { key: "who", header: "Employee", cell: (s) => <span className="text-ink">{s.employee_name}</span> },
    { key: "week", header: "Week", cell: (s) => <span className="text-muted">{weekLabel(s)}</span> },
    { key: "hours", header: "Hours", align: "right", cell: (s) => <span className="tabular">{Number(s.total_hours).toFixed(2)}</span> },
    { key: "status", header: "Status", cell: (s) => <SheetStatus status={s.status} /> },
  ];
  return (
    <>
      <FilterBar filters={[{ key: "status", label: "Status", multiple: true, options: [
        { value: "draft", label: "Not sent" }, { value: "submitted", label: "Waiting" }, { value: "approved", label: "Approved" },
        { value: "partly_approved", label: "Partly approved" }, { value: "rejected", label: "Sent back" }] }]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={data?.items ?? []} rowKey={(s) => s.uuid} columns={cols} loading={!data} onRowClick={(s) => onOpen(s.uuid)}
        pagination={data ? { page, size: 25, total: data.total, onPageChange: setPage } : undefined}
        emptyIcon={Users} emptyTitle="No timesheets" emptyHint="Weeks your team logs time for show up here." />
    </>
  );
}

function Projects({ canManage }: { canManage: boolean }) {
  const [rows, setRows] = useState<Project[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [filters, setFilters] = useState<FilterValues>({ status: ["active"] });
  const [form, setForm] = useState<{ p: Project | null; k: number } | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    const st = filters.status?.[0];
    api.get<Project[]>(`/timesheets/projects${st ? `?status=${st}` : ""}`).then((r) => { if (live) setRows(r); }).catch(() => { if (live) setRows([]); });
    api.get<Client[]>("/timesheets/clients").then((r) => { if (live) setClients(r); }).catch(() => {});
    return () => { live = false; };
  }, [filters, nonce]);
  const cols: Column<Project>[] = [
    { key: "name", header: "Project", sortable: true, sortValue: (p) => p.name, cell: (p) => <div><p className="text-ink">{p.name}</p><p className="text-[12.5px] text-muted">{[p.code, p.client_name ?? "Internal"].filter(Boolean).join(" · ")}</p></div> },
    { key: "owner", header: "Owner", hideBelow: "md", cell: (p) => p.owner_name ? <span className="text-muted">{p.owner_name}</span> : <span className="text-faint">—</span> },
    { key: "bill", header: "Billable", hideBelow: "sm", cell: (p) => <Badge tone={p.billable ? "accent" : "neutral"}>{p.billable ? "Billable" : "Internal"}</Badge> },
    { key: "hours", header: "Hours vs budget", cell: (p) => <BudgetBar logged={p.logged_hours} budget={p.budget_hours} /> },
    { key: "status", header: "Status", hideBelow: "md", cell: (p) => <Badge tone={p.status === "active" ? "good" : "neutral"} dot>{{ active: "Active", on_hold: "On hold", completed: "Completed" }[p.status]}</Badge> },
  ];
  return (
    <>
      <FilterBar filters={[{ key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "on_hold", label: "On hold" }, { value: "completed", label: "Completed" }] }]}
        values={filters} onChange={setFilters}
        actions={canManage && <Button icon={Plus} onClick={() => setForm({ p: null, k: Date.now() })}>Add project</Button>} />
      <DataTable rows={rows ?? []} rowKey={(p) => p.uuid} columns={cols} loading={!rows} onRowClick={(p) => setViewing(p.uuid)}
        rowActions={canManage ? (p) => [{ label: "Edit", onSelect: () => setForm({ p, k: Date.now() }) }] : undefined}
        emptyIcon={Briefcase} emptyTitle="No projects" emptyHint={canManage ? "Add projects people log time against." : undefined} />
      {form && <ProjectModal key={form.k} open project={form.p} clients={clients} onClose={() => setForm(null)} onSaved={() => { setForm(null); setNonce((n) => n + 1); }} />}
      <ProjectDetailModal uuid={viewing} canManage={canManage} onClose={() => setViewing(null)} onEdit={(p) => { setViewing(null); setForm({ p, k: Date.now() }); }} />
    </>
  );
}

function Clients() {
  const [rows, setRows] = useState<Client[] | null>(null);
  const [form, setForm] = useState<{ c: Client | null; k: number } | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let live = true;
    api.get<Client[]>("/timesheets/clients").then((r) => { if (live) setRows(r); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [nonce]);
  const cols: Column<Client>[] = [
    { key: "name", header: "Client", sortable: true, sortValue: (c) => c.name, cell: (c) => <span className="text-ink">{c.name}</span> },
    { key: "contact", header: "Contact", hideBelow: "sm", cell: (c) => <div className="text-muted">{c.contact_name || "—"}{c.email && <p className="text-[12.5px]">{c.email}</p>}</div> },
    { key: "gst", header: "GSTIN", hideBelow: "md", cell: (c) => c.gstin ? <span className="tabular text-muted">{c.gstin}</span> : <span className="text-faint">—</span> },
    { key: "status", header: "Status", cell: (c) => <Badge tone={c.active ? "good" : "neutral"} dot>{c.active ? "Active" : "Inactive"}</Badge> },
  ];
  return (
    <>
      <FilterBar actions={<Button icon={Plus} onClick={() => setForm({ c: null, k: Date.now() })}>Add client</Button>} />
      <DataTable rows={rows ?? []} rowKey={(c) => c.uuid} columns={cols} loading={!rows} onRowClick={(c) => setForm({ c, k: Date.now() })}
        emptyIcon={Briefcase} emptyTitle="No clients yet" emptyHint="Clients group the projects you bill." />
      {form && <ClientModal key={form.k} open client={form.c} onClose={() => setForm(null)} onSaved={() => { setForm(null); setNonce((n) => n + 1); }} />}
    </>
  );
}

export default function TimesheetsPage() {
  const toast = useToast();
  const access = useAttendanceAccess();
  const [tabPicked, setTab] = useState<Tab>("week");
  const [sheet, setSheet] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [pendingCount, setPendingCount] = useState<number | undefined>(undefined);
  useUrlTab(TABS, setTab);
  const isOwner = access ? !access.employee_id : false;
  const admin = !!access?.can_timesheets;
  const tab: Tab = isOwner && tabPicked === "week" ? "approvals" : tabPicked;

  useEffect(() => {
    api.get<Sheet[]>("/timesheets/approvals").then((r) => setPendingCount(r.length || undefined)).catch(() => {});
  }, [nonce]);

  const remind = useCallback(async () => {
    try {
      const r = await api.post<{ sent: number }>(`/timesheets/reminders?week_start=${mondayOf(todayISO())}`);
      toast.success(r.sent ? `Reminded ${r.sent} ${r.sent === 1 ? "person" : "people"}` : "Everyone has sent this week");
    } catch (e) { toast.error(errorText(e)); }
  }, [toast]);

  const items = [
    ...(isOwner ? [] : [{ value: "week" as Tab, label: "My week" }]),
    { value: "approvals" as Tab, label: "Approvals", count: pendingCount },
    { value: "team" as Tab, label: "Team" },
    ...(admin ? [{ value: "projects" as Tab, label: "Projects" }, { value: "clients" as Tab, label: "Clients" }, { value: "billing" as Tab, label: "Billing" }] : [{ value: "projects" as Tab, label: "Projects" }]),
  ];

  return (
    <>
      <PageHeader title="Timesheets" description="Hours worked against clients, projects and tasks, sent weekly for approval."
        actions={admin && <Button icon={BellRing} onClick={remind}>Send reminders</Button>} />
      <Tabs value={tab} onChange={setTab} items={items} className="mb-5" />
      {tab === "week" && !isOwner && access && <MyWeek />}
      {tab === "approvals" && <Approvals onOpen={setSheet} nonce={nonce} />}
      {tab === "team" && <Team onOpen={setSheet} nonce={nonce} />}
      {tab === "projects" && <Projects canManage={admin} />}
      {tab === "clients" && admin && <Clients />}
      {tab === "billing" && admin && <Billing />}
      <SheetModal key={sheet ?? "none"} uuid={sheet} onClose={() => setSheet(null)} onDone={() => { setSheet(null); setNonce((n) => n + 1); }} />
    </>
  );
}
