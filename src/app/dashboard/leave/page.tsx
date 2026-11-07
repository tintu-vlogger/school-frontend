"use client";

/*
 * My leave: balance cards for every leave type that applies to me, apply (modal with live
 * day count and balance preview), comp off requests, upcoming holidays, and my requests
 * with their status; a row opens the request with its timeline.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Briefcase, CalendarDays, Plane, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, todayISO } from "@/lib/datetime";
import { EmptyState, PageHeader } from "@/components/shell/page";
import {
  Button, DataTable, DateInput, Field, FilterBar, Modal, ModalCancel, RadioCards, Skeleton, Textarea, type Column, type FilterValues,
} from "@/components/ui-kit";
import { ApplyLeaveModal } from "@/components/leave/apply-modal";
import { LeaveNav, useLeaveAccess } from "@/components/leave/leave-nav";
import { BalanceCardView, StatusBadge, TypeDot, dateRange, fmtDays, unitText } from "@/components/leave/leave-ui";
import { LeaveRequestModal } from "@/components/leave/request-modal";
import type { Holiday, LeaveDetail, LeaveRow, Page, Summary } from "@/components/leave/types";
import { DateTile, LedgerModal } from "@/components/leave/misc";

const SIZE = 10;

export default function MyLeavePage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const access = useLeaveAccess();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [holidays, setHolidays] = useState<Holiday[] | null>(null);
  const [rows, setRows] = useState<Page<LeaveRow> | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<FilterValues>({});
  const [applyOpen, setApplyOpen] = useState(false);
  const [applyType, setApplyType] = useState<string | null>(null);
  const [editing, setEditing] = useState<LeaveDetail | null>(null);
  const [openUuid, setOpenUuid] = useState<string | null>(params.get("view"));
  const [compOff, setCompOff] = useState(false);
  const [history, setHistory] = useState<{ code: string; name: string; uuid: string } | null>(null);

  useEffect(() => {
    if (access && !access.employee_id) router.replace(access.can_manage ? "/dashboard/leave/admin" : "/dashboard/leave/team");
  }, [access, router]);

  const loadSummary = useCallback(() => {
    api.get<Summary>("/leave/me/summary").then(setSummary).catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't load your leave"));
    api.get<{ holidays: Holiday[] }>(`/leave/me/holidays`).then((r) => setHolidays(r.holidays)).catch(() => setHolidays([]));
  }, [toast]);
  const loadRows = useCallback(() => {
    const st = filters.status?.join(",") ?? "";
    api.get<Page<LeaveRow>>(`/leave/requests?scope=mine&page=${page}&size=${SIZE}${st ? `&status=${st}` : ""}`)
      .then(setRows).catch(() => setRows({ items: [], total: 0, page: 1, size: SIZE }));
  }, [page, filters]);

  useEffect(() => { if (access?.employee_id) loadSummary(); }, [access, loadSummary]);
  useEffect(() => { if (access?.employee_id) loadRows(); }, [access, loadRows]);
  const reload = () => { loadSummary(); loadRows(); };

  const cards = summary?.cards ?? [];
  const balanceCards = cards.filter((c) => c.show_balance);
  const otherCards = cards.filter((c) => !c.show_balance);
  const hasCompOff = !!access?.settings.comp_off && cards.some((c) => c.type.kind === "comp_off");
  const upcoming = useMemo(() => (holidays ?? []).filter((h) => h.date >= todayISO() && h.kind !== "optional").slice(0, 5), [holidays]);
  const optional = (holidays ?? []).filter((h) => h.kind === "optional" && h.date >= todayISO());

  const openApply = (code?: string) => { setEditing(null); setApplyType(code ?? null); setApplyOpen(true); };

  const columns: Column<LeaveRow>[] = [
    { key: "type", header: "Leave", cell: (r) => (
      <div className="min-w-0">
        <TypeDot color={r.leave_type.color} label={`${r.kind === "extension" ? "Extension · " : ""}${r.leave_type.name}`} />
        <p className="truncate pl-4 text-[12px] text-faint">{r.reference_no ?? ""}{r.unit !== "day" ? ` · ${unitText(r.unit, r.half, r.hours)}` : ""}</p>
      </div>) },
    { key: "dates", header: "Dates", cell: (r) => <span className="text-ink/85">{dateRange(r.from_date, r.to_date)}</span> },
    { key: "days", header: "Days", align: "right", cell: (r) => <span className="tabular">{fmtDays(r.days, true)}{r.lop_days ? <span className="text-rose-600"> ({fmtDays(r.lop_days, true)} unpaid)</span> : null}</span> },
    { key: "applied", header: "Applied", hideBelow: "md", cell: (r) => <span className="text-muted">{formatDate(r.created_at)}</span> },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
  ];

  if (access && !access.employee_id) return null;

  return (
    <div>
      <PageHeader eyebrow="Time" title="My leave"
        description={summary ? [summary.holiday_calendar && `Holidays: ${summary.holiday_calendar}`, summary.work_week && `Work week: ${summary.work_week}`].filter(Boolean).join(" · ") : "Your balances, requests and holidays."}
        actions={<>
          {hasCompOff && <Button variant="secondary" icon={Briefcase} onClick={() => setCompOff(true)}>Ask for comp off</Button>}
          <Button variant="primary" icon={Plus} onClick={() => openApply()} disabled={!summary}>Apply for leave</Button>
        </>} />
      <LeaveNav access={access} />

      {!summary ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[214px] rounded-2xl" />)}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {balanceCards.map((c) => (
            <BalanceCardView key={c.type.uuid} card={c} onApply={() => openApply(c.type.code)}
              onHistory={() => setHistory({ code: c.type.code, name: c.type.name, uuid: c.type.uuid })} />
          ))}
        </div>
      )}

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[16px] text-ink">My requests</h2>
          </div>
          <FilterBar filters={[{ key: "status", label: "Status", multiple: true, options: [
            { value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" },
            { value: "cancelled", label: "Cancelled" }, { value: "cancel_pending", label: "Cancellation pending" }] }]}
            values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
          <DataTable rows={rows?.items ?? []} loading={rows === null} columns={columns} rowKey={(r) => r.uuid}
            onRowClick={(r) => setOpenUuid(r.uuid)}
            pagination={rows ? { page, size: SIZE, total: rows.total, onPageChange: setPage } : undefined}
            emptyIcon={Plane} emptyTitle="No leave requests yet" emptyHint="When you apply for leave it shows up here with its status."
            emptyAction={<Button variant="secondary" icon={Plus} onClick={() => openApply()}>Apply for leave</Button>} />
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <p className="text-[15px] text-ink">Upcoming holidays</p>
              <button className="text-[13px] text-primary hover:underline" onClick={() => router.push("/dashboard/holidays")}>All</button>
            </div>
            {holidays === null ? <div className="p-5"><Skeleton className="h-24" /></div> : upcoming.length === 0 ? (
              <EmptyState icon={CalendarDays} title="No more holidays this year" />
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.map((h) => (
                  <li key={h.uuid ?? `${h.date}-${h.name}`} className="flex items-center gap-4 px-5 py-3">
                    <DateTile date={h.date} />
                    <div className="min-w-0">
                      <p className="truncate text-[14px] text-ink">{h.name}</p>
                      <p className="text-[12.5px] text-faint">{h.weekday} · {h.kind_label}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {optional.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-[15px] text-ink">Optional holidays</p>
              <p className="mt-1 text-[13px] text-muted">Pick up to the yearly limit from your calendar. {optional.length} left this year.</p>
              <Button variant="secondary" size="sm" className="mt-3" onClick={() => openApply("OH")}>Choose an optional holiday</Button>
            </section>
          )}
          {otherCards.length > 0 && (
            <section className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-[15px] text-ink">Special leave</p>
              <p className="mt-1 text-[13px] text-muted">Granted on request with its own limits.</p>
              <ul className="mt-3 space-y-2">
                {otherCards.map((c) => (
                  <li key={c.type.uuid} className="flex items-center justify-between gap-3 text-[13.5px]">
                    <TypeDot color={c.type.color} label={c.type.name} />
                    {c.applicable && <button className="shrink-0 text-primary hover:underline" onClick={() => openApply(c.type.code)}>Apply</button>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <ApplyLeaveModal open={applyOpen} onClose={() => setApplyOpen(false)} cards={cards} initialType={applyType} editing={editing}
        onSaved={(r) => { setApplyOpen(false); setEditing(null); reload(); if (r.uuid) setOpenUuid(r.uuid); }} />
      <LeaveRequestModal uuid={openUuid} onClose={() => setOpenUuid(null)} onChanged={reload} partialCancel={access?.settings.partial_cancel}
        onEdit={(d) => { setOpenUuid(null); setEditing(d); setApplyOpen(true); }} />
      <CompOffModal open={compOff} onClose={() => setCompOff(false)} onSaved={() => { setCompOff(false); reload(); }} />
      <LedgerModal item={history} employeeUuid={summary?.employee.uuid ?? null} onClose={() => setHistory(null)} />
    </div>
  );
}

function CompOffModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState("");
  const [unit, setUnit] = useState("day");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setDate(""); setUnit("day"); setReason(""); } }, [open]);
  async function save() {
    setSaving(true);
    try {
      await api.post("/leave/comp-offs", { worked_date: date, unit, reason: reason || null });
      toast.success("Comp off request sent", { description: "Once approved it is added to your balance." });
      onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send"); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} dirty={!!date || !!reason} title="Ask for comp off"
      description="For working on a weekly off or a holiday. It expires if not used in time."
      footer={<><ModalCancel /><Button variant="primary" loading={saving} disabled={!date} onClick={save}>Send request</Button></>}>
      <div className="space-y-5">
        <Field label="Day you worked" required><DateInput value={date} onChange={setDate} max={todayISO()} /></Field>
        <Field label="How long"><RadioCards value={unit} onChange={setUnit} columns={2}
          options={[{ value: "day", label: "Full day" }, { value: "half_day", label: "Half day" }]} /></Field>
        <Field label="What did you work on?" required><Textarea value={reason} onValueChange={setReason} rows={3} autoGrow maxLength={2000} /></Field>
      </div>
    </Modal>
  );
}
