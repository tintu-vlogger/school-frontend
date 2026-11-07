"use client";

/*
 * Schedules tab: every email schedule you can see, with when it runs next and how the
 * last run went. HR can add, edit, pause, send now and delete.
 */
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Pause, Play, Plus, Send, Trash2 } from "lucide-react";
import { Badge, Button, DataTable, useConfirm, useToast, type Column, type MenuItem } from "@/components/ui-kit";
import { api } from "@/lib/api";
import { formatDateTime, formatRelative } from "@/lib/datetime";
import { ScheduleModal } from "./schedule-modal";
import { WEEKDAYS, errMsg, hourLabel, type Report, type ReportsMeta, type Schedule } from "./types";

const STATUS = {
  sent: { label: "Sent", tone: "good" },
  not_sent: { label: "Not sent", tone: "warn" },
  failed: { label: "Failed", tone: "bad" },
} as const;

export function whenText(s: Pick<Schedule, "frequency" | "frequency_label" | "weekday" | "day_of_month" | "hour">) {
  const day = s.frequency === "weekly" && s.weekday !== null ? `on ${WEEKDAYS[s.weekday]}` : s.frequency === "monthly" && s.day_of_month ? `on day ${s.day_of_month}` : "";
  return [s.frequency_label, day, `at ${hourLabel(s.hour)}`].filter(Boolean).join(" ");
}

export function SchedulesTab({ meta, reports, onChanged }: { meta: ReportsMeta; reports: Report[] | null; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [rows, setRows] = useState<Schedule[] | null>(null);
  const [editing, setEditing] = useState<{ open: boolean; schedule: Schedule | null }>({ open: false, schedule: null });
  const [allReports, setAllReports] = useState<Report[] | null>(null);

  const load = useCallback(() => {
    api.get<Schedule[]>("/reports/schedules").then(setRows).catch((e) => { toast.error(errMsg(e)); setRows([]); });
  }, [toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!meta.can_share) return;
    api.get<Report[]>("/reports/").then(setAllReports).catch(() => setAllReports(null));
  }, [meta.can_share]);

  const changed = () => { load(); onChanged(); };

  async function sendNow(s: Schedule) {
    try {
      const r = await api.post<Schedule>(`/reports/schedules/${s.uuid}/send-now`);
      if (r.last_status === "sent") toast.success(`“${s.name}” sent`);
      else toast.warning(r.last_message || "It wasn't sent");
      changed();
    } catch (e) { toast.error(errMsg(e)); }
  }
  async function toggle(s: Schedule) {
    try {
      await api.put(`/reports/schedules/${s.uuid}`, { active: !s.active });
      toast.success(s.active ? "Schedule paused" : "Schedule resumed");
      changed();
    } catch (e) { toast.error(errMsg(e)); }
  }
  async function remove(s: Schedule) {
    const ok = await confirm({
      title: `Delete “${s.name}”?`, message: "No more emails will be sent for it.", confirmLabel: "Delete", tone: "danger",
      onConfirm: async () => { try { await api.delete(`/reports/schedules/${s.uuid}`); } catch (e) { toast.error(errMsg(e)); throw e; } },
    });
    if (ok) { toast.success("Schedule deleted"); changed(); }
  }

  const columns: Column<Schedule>[] = [
    {
      key: "name", header: "Schedule", sortable: true, sortValue: (s) => s.name,
      cell: (s) => <div className="min-w-0"><p className="truncate text-ink">{s.name}</p><p className="truncate text-[12.5px] text-faint">{s.report_name}</p></div>,
    },
    { key: "when", header: "When", cell: (s) => <span className="text-muted">{whenText(s)}</span> },
    { key: "format", header: "File", hideBelow: "md", cell: (s) => <span className="text-muted">{meta.formats.find((f) => f.value === s.format)?.label ?? s.format}</span> },
    {
      key: "to", header: "Recipients", align: "right", hideBelow: "md",
      cell: (s) => {
        const n = s.recipient_employee_ids.length + s.recipient_emails.length;
        const names = [...s.recipients.map((r) => r.name), ...s.recipient_emails].join(", ");
        return <span className="tabular text-muted" title={names}>{n}</span>;
      },
    },
    {
      key: "next", header: "Next", sortable: true, sortValue: (s) => s.next_run_at ?? "",
      cell: (s) => !s.active ? <Badge>Paused</Badge> : s.next_run_at
        ? <span className="text-muted" title={formatDateTime(s.next_run_at)}>{formatRelative(s.next_run_at)}</span>
        : <span className="text-faint">—</span>,
    },
    {
      key: "last", header: "Last run", hideBelow: "lg",
      cell: (s) => s.last_status ? (
        <span className="inline-flex items-center gap-2" title={s.last_message ?? undefined}>
          <Badge tone={STATUS[s.last_status].tone} dot>{STATUS[s.last_status].label}</Badge>
          {s.last_run_at && <span className="text-[12.5px] text-faint">{formatRelative(s.last_run_at)}</span>}
        </span>
      ) : <span className="text-faint">Not yet</span>,
    },
  ];

  const actions = (s: Schedule): MenuItem[] => [
    { label: "Send now", icon: Send, onSelect: () => sendNow(s) },
    { label: s.active ? "Pause" : "Resume", icon: s.active ? Pause : Play, onSelect: () => toggle(s) },
    "separator",
    { label: "Delete", icon: Trash2, danger: true, onSelect: () => remove(s) },
  ];

  return (
    <div>
      {meta.can_share && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-[13.5px] text-muted">Reports emailed on a regular basis. Times are in the company&apos;s local time.</p>
          <Button variant="secondary" icon={Plus} onClick={() => setEditing({ open: true, schedule: null })}>New schedule</Button>
        </div>
      )}
      <DataTable rows={rows ?? []} rowKey={(s) => s.uuid} columns={columns} loading={!rows}
        onRowClick={meta.can_share ? (s) => setEditing({ open: true, schedule: s }) : undefined}
        rowActions={meta.can_share ? actions : undefined}
        emptyIcon={CalendarClock} emptyTitle="No schedules yet"
        emptyHint={meta.can_share ? "Email any report every day, week or month." : "Reports emailed to you on a regular basis show up here."}
        emptyAction={meta.can_share ? <Button variant="primary" icon={Plus} onClick={() => setEditing({ open: true, schedule: null })}>New schedule</Button> : undefined} />
      {meta.can_share && (
        <ScheduleModal open={editing.open} schedule={editing.schedule} meta={meta} reports={allReports ?? reports ?? []}
          onClose={() => setEditing((e) => ({ ...e, open: false }))} onSaved={changed} />
      )}
    </div>
  );
}
