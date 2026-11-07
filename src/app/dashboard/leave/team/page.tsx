"use client";

/*
 * Team leave: a month calendar of who is away (leave type colour; pending shown lighter;
 * weekly offs and holidays shaded) and the requests waiting for the viewer's decision.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Inbox, Plane, UserX, X } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatMonth } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import { Avatar, Button, DataTable, FilterBar, IconButton, Skeleton, StatCard, type Column } from "@/components/ui-kit";
import { LeaveNav, useLeaveAccess } from "@/components/leave/leave-nav";
import { StatusBadge, TypeDot, dateRange, fmtDays } from "@/components/leave/leave-ui";
import { LeaveRequestModal } from "@/components/leave/request-modal";
import type { LeaveRow, Page } from "@/components/leave/types";

type Cell = { kind: string; code: string; name: string; color: string; status: string; amount: number; part?: string; request_uuid: string };
type Person = { id: number; uuid: string; name: string; department: string | null; photo: string | null; cells: Record<string, Cell>; off: Record<string, { kind: string; holiday?: string | null }> };
type Cal = { from: string; to: string; today: string; people: Person[]; holidays: { date: string; name: string; kind: string }[]; away_today: number; show_type: boolean };

const pad = (n: number) => String(n).padStart(2, "0");

export default function TeamLeavePage() {
  const toast = useToast();
  const access = useLeaveAccess();
  const [month, setMonth] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cal, setCal] = useState<Cal | null>(null);
  const [pending, setPending] = useState<Page<LeaveRow> | null>(null);
  const [openUuid, setOpenUuid] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { if (access && !month) setMonth(access.today.slice(0, 7)); }, [access, month]);

  const loadCal = useCallback(() => {
    if (!month) return;
    setCal(null);
    api.get<Cal>(`/leave/team/calendar?month=${month}${q ? `&q=${encodeURIComponent(q)}` : ""}`).then(setCal)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load the calendar"));
  }, [month, q, toast]);
  const approver = !!access && (access.can_approve || access.can_manage);
  const loadPending = useCallback(() => {
    if (!access || !approver) return;
    api.get<Page<LeaveRow>>(`/leave/requests?scope=${access.can_manage ? "all" : "team"}&status=pending,cancel_pending&size=50`)
      .then(setPending).catch(() => setPending({ items: [], total: 0, page: 1, size: 50 }));
  }, [access, approver]);
  useEffect(() => { loadCal(); }, [loadCal]);
  useEffect(() => { loadPending(); }, [loadPending]);
  const reload = () => { loadCal(); loadPending(); };

  const days = useMemo(() => {
    if (!cal) return [];
    const out: string[] = [];
    const d = new Date(`${cal.from}T12:00:00Z`);
    const end = new Date(`${cal.to}T12:00:00Z`);
    while (d <= end) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
    return out;
  }, [cal]);

  const shift = (n: number) => {
    if (!month) return;
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    setMonth(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };

  async function decide(r: LeaveRow, decision: "approve" | "reject") {
    if (!r.my_task_uuid) { setOpenUuid(r.uuid); return; }
    if (decision === "reject") { setOpenUuid(r.uuid); return; }
    setBusy(r.uuid);
    try { await api.post(`/workflow/tasks/${r.my_task_uuid}/decision`, { decision }); toast.success("Approved"); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save"); }
    finally { setBusy(null); }
  }

  const holidayMap = useMemo(() => Object.fromEntries((cal?.holidays ?? []).filter((h) => h.kind !== "optional").map((h) => [h.date, h.name])), [cal]);
  const legend = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    cal?.people.forEach((p) => Object.values(p.cells).forEach((c) => m.set(c.code, { name: c.name, color: c.color })));
    return [...m.entries()];
  }, [cal]);
  const mine = (pending?.items ?? []).filter((r) => r.my_task_uuid);

  const columns: Column<LeaveRow>[] = [
    { key: "who", header: "Employee", cell: (r) => (
      <span className="flex min-w-0 items-center gap-3"><Avatar name={r.employee.name} src={r.employee.photo} size={30} />
        <span className="min-w-0"><span className="block truncate text-ink">{r.employee.name}</span><span className="block truncate text-[12px] text-faint">{r.employee.department ?? ""}</span></span></span>) },
    { key: "type", header: "Leave", cell: (r) => <TypeDot color={r.leave_type.color} label={r.leave_type.name} /> },
    { key: "dates", header: "Dates", hideBelow: "md", cell: (r) => <span className="text-ink/85">{dateRange(r.from_date, r.to_date)}</span> },
    { key: "days", header: "Days", align: "right", cell: (r) => <span className="tabular">{fmtDays(r.days, true)}</span> },
    { key: "status", header: "", cell: (r) => r.status === "cancel_pending" ? <StatusBadge status={r.status} /> : r.my_task_uuid ? (
      <span className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
        <IconButton icon={X} label="Reject" onClick={() => decide(r, "reject")} />
        <Button size="sm" variant="primary" icon={Check} loading={busy === r.uuid} onClick={() => decide(r, "approve")}>Approve</Button>
      </span>) : <span className="text-[12.5px] text-faint">With someone else</span> },
  ];

  return (
    <div>
      <PageHeader eyebrow="Time" title="Team leave" description="Who is away this month, and the requests waiting for you." />
      <LeaveNav access={access} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Away today" value={cal ? cal.away_today : "–"} icon={UserX} hint={cal ? formatDate(cal.today) : undefined} />
        <StatCard label="Waiting for you" value={approver ? (pending ? mine.length : "–") : 0} icon={Inbox} hint={approver ? "leave and cancellations" : "you don't approve leave"} />
        <StatCard label="Holidays this month" value={cal ? Object.keys(holidayMap).length : "–"} icon={Plane}
          hint={cal ? Object.values(holidayMap).slice(0, 2).join(", ") || "none" : undefined} />
      </div>

      <section className="rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <div className="flex items-center gap-2">
            <IconButton icon={ChevronLeft} label="Previous month" onClick={() => shift(-1)} />
            <p className="min-w-[150px] text-center text-[15px] text-ink">{month ? formatMonth(`${month}-15`) : ""}</p>
            <IconButton icon={ChevronRight} label="Next month" onClick={() => shift(1)} />
            {access && month !== access.today.slice(0, 7) && <Button size="sm" variant="ghost" onClick={() => setMonth(access.today.slice(0, 7))}>Today</Button>}
          </div>
          <div className="w-full max-w-xs"><FilterBar onSearchChange={setQ} searchPlaceholder="Find a person" /></div>
        </div>
        {!cal ? <div className="p-5"><Skeleton className="h-64" /></div> : cal.people.length === 0 ? (
          <p className="px-5 py-12 text-center text-[14px] text-muted">Nobody to show.</p>
        ) : (
          <div className="hr-scroll overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-[2] min-w-[200px] border-b border-line bg-surface px-4 py-2 text-left font-normal text-faint">{cal.people.length} people</th>
                  {days.map((d) => {
                    const dt = new Date(`${d}T12:00:00Z`);
                    const wk = dt.getUTCDay() === 0 || dt.getUTCDay() === 6;
                    const today = d === cal.today;
                    return (
                      <th key={d} title={holidayMap[d] ?? undefined} className={`min-w-[30px] border-b border-line px-0 py-1.5 text-center font-normal ${holidayMap[d] ? "bg-emerald-50/60 text-emerald-700" : wk ? "bg-sunken/50 text-faint" : "text-muted"}`}>
                        <span className="block text-[10px] uppercase">{dt.toLocaleDateString("en-IN", { weekday: "narrow", timeZone: "UTC" })}</span>
                        <span className={`mx-auto mt-0.5 flex h-5 w-5 items-center justify-center rounded-full tabular ${today ? "bg-primary text-white" : ""}`}>{dt.getUTCDate()}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {cal.people.map((p) => (
                  <tr key={p.id} className="group">
                    <td className="sticky left-0 z-[1] border-b border-line bg-surface px-4 py-1.5 group-hover:bg-sunken/40">
                      <span className="flex items-center gap-2.5"><Avatar name={p.name} src={p.photo} size={24} />
                        <span className="min-w-0"><span className="block max-w-[150px] truncate text-[13px] text-ink">{p.name}</span>
                          {p.department && <span className="block max-w-[150px] truncate text-[11px] text-faint">{p.department}</span>}</span></span>
                    </td>
                    {days.map((d) => {
                      const c = p.cells[d];
                      const off = p.off[d];
                      const bg = off?.kind === "holiday" ? "bg-emerald-50/50" : off?.kind === "weekend" ? "bg-sunken/50" : "";
                      return (
                        <td key={d} className={`border-b border-l border-line/60 p-[3px] text-center ${bg}`} title={c ? `${p.name}: ${c.name}${c.status === "pending" ? " (pending)" : ""}` : off?.holiday ?? undefined}>
                          {c && (
                            <button type="button" onClick={() => setOpenUuid(c.request_uuid)}
                              className="flex h-6 w-full items-center justify-center rounded-md text-[10px] tracking-wide transition-opacity hover:opacity-80"
                              style={c.status === "pending"
                                ? { background: `repeating-linear-gradient(45deg, ${c.color}14, ${c.color}14 4px, ${c.color}29 4px, ${c.color}29 8px)`, color: c.color, boxShadow: `inset 0 0 0 1px ${c.color}40` }
                                : { background: `${c.color}${c.amount < 1 ? "55" : "d9"}`, color: "#fff" }}>
                              {c.amount < 1 ? "½" : c.code}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {legend.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-5 py-3 text-[12px] text-muted">
            {legend.map(([code, v]) => <TypeDot key={code} color={v.color} label={`${code} · ${v.name}`} />)}
            <span className="inline-flex items-center gap-2"><span className="h-2 w-4 rounded-sm border border-dashed border-line-strong" />Pending</span>
            <span className="inline-flex items-center gap-2"><span className="h-2 w-4 rounded-sm bg-emerald-100" />Holiday</span>
          </div>
        )}
      </section>

      {approver && (
        <section className="mt-8">
          <h2 className="mb-3 text-[16px] text-ink">Waiting for a decision</h2>
          <DataTable rows={pending?.items ?? []} loading={pending === null} columns={columns} rowKey={(r) => r.uuid}
            onRowClick={(r) => setOpenUuid(r.uuid)} emptyIcon={Inbox} emptyTitle="Nothing is waiting" emptyHint="New leave requests from your team appear here." />
        </section>
      )}

      <LeaveRequestModal uuid={openUuid} onClose={() => setOpenUuid(null)} onChanged={reload} />
    </div>
  );
}
