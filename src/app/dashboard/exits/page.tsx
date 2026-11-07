"use client";

/*
 * Exits: dashboard numbers, a board (waiting, serving notice, exited) and a filtered list.
 * Starting an exit and every detail open in centered modals.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlarmClock, BarChart3, ClipboardCheck, Columns3, DoorOpen, List, LogOut, Plus, Settings2, UserMinus } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { todayISO } from "@/lib/datetime";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, FilterBar, StatCard, Tabs, formatDisplayDate, useConfirm, type Column, type FilterValues,
} from "@/components/ui-kit";
import { ExitBoard } from "@/components/exits/board";
import { ExitDetailModal } from "@/components/exits/exit-detail-modal";
import { StartExitModal } from "@/components/exits/start-exit-modal";
import { SETTLEMENT_STATE, STATUS_TONE, errMsg, type ExitMeta, type ExitRow, type Page } from "@/components/exits/types";

type Dash = { requested: number; in_progress: number; completed: number; leaving_in_30_days: number; delayed_clearances: number; settlements_due: number };
const SIZE = 25;

export default function ExitsPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [meta, setMeta] = useState<ExitMeta | null>(null);
  const [dash, setDash] = useState<Dash | null>(null);
  const [view, setView] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Page<ExitRow> | null>(null);
  const [boardRows, setBoardRows] = useState<ExitRow[]>([]);
  const [loadedKey, setLoadedKey] = useState("");
  const [nonce, setNonce] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => { api.get<ExitMeta>("/exits/meta").then(setMeta).catch(() => {}); }, []);
  useEffect(() => { api.get<Dash>("/exits/dashboard").then(setDash).catch(() => {}); }, [nonce]);
  const key = JSON.stringify([q, filters, page, view, nonce]);
  const loading = loadedKey !== key;
  useEffect(() => {
    let live = true;
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (filters.type?.length) p.set("exit_type", filters.type.join(","));
    if (view === "board") {
      p.set("size", "200");
      p.set("status", "requested,in_progress,completed");
    } else {
      p.set("page", String(page)); p.set("size", String(SIZE));
      if (filters.status?.length) p.set("status", filters.status.join(","));
    }
    api.get<Page<ExitRow>>(`/exits?${p}`)
      .then((r) => {
        if (!live) return;
        if (view === "board") {
          const cutoff = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
          setBoardRows(r.items.filter((x) => x.status !== "completed" || x.last_working_day >= cutoff));
        } else setData(r);
      })
      .catch((e) => toast.error(errMsg(e, "Couldn't load exits")))
      .finally(() => { if (live) setLoadedKey(key); });
    return () => { live = false; };
  }, [q, filters, page, view, nonce, toast, key]);

  async function dropTo(r: ExitRow, status: string) {
    if (status !== "completed") {
      toast.info(status === "in_progress" ? "Exits are accepted in the approvals inbox." : "An exit can't go back to waiting.");
      return;
    }
    if (r.status !== "in_progress") { toast.info("Only exits serving notice can be completed."); return; }
    const early = r.last_working_day > todayISO();
    const ok = await confirm({
      title: `Complete ${r.name}'s exit?`, tone: "danger", confirmLabel: early ? "Complete anyway" : "Complete exit",
      message: early ? `The last working day (${formatDisplayDate(r.last_working_day)}) has not come yet. Sign-in will be disabled now and the record archived.`
        : "Sign-in is disabled, the licence is freed and the record is archived.",
    });
    if (!ok) return;
    setBoardRows((rows) => rows.map((x) => (x.uuid === r.uuid ? { ...x, status: "completed" } : x)));
    try {
      await api.post(`/exits/${r.uuid}/complete`, { force: early });
      toast.success("Exit completed");
    } catch (e) { toast.error(errMsg(e)); }
    refresh();
  }

  const columns: Column<ExitRow>[] = [
    { key: "name", header: "Employee", sortable: true, sortValue: (r) => r.name, cell: (r) => (
      <div className="flex items-center gap-2.5"><Avatar name={r.name} size={28} />
        <div className="min-w-0"><p className="truncate text-ink">{r.name}</p><p className="truncate text-[12px] text-muted">{r.department ?? "—"}</p></div></div>
    ) },
    { key: "type", header: "Kind", cell: (r) => r.exit_type_label },
    { key: "status", header: "Status", cell: (r) => <Badge tone={STATUS_TONE[r.status] ?? "neutral"} dot>{r.status_label}</Badge> },
    { key: "lwd", header: "Last day", sortable: true, sortValue: (r) => r.last_working_day, cell: (r) => formatDisplayDate(r.last_working_day) },
    { key: "clear", header: "Clearances", hideBelow: "md", cell: (r) => r.clearances_total ? (
      <span className={r.clearances_delayed ? "text-rose-600" : ""}>{r.clearances_done}/{r.clearances_total}{r.clearances_delayed ? ` · ${r.clearances_delayed} late` : ""}</span>) : "—" },
    { key: "settle", header: "Settlement", hideBelow: "lg", cell: (r) => {
      const st = SETTLEMENT_STATE[r.settlement?.state ?? "not_started"];
      return r.status === "requested" ? "—" : <span className="text-[13px]"><Badge tone={st.tone}>{st.label}</Badge> <span className="text-muted">by {formatDisplayDate(r.settlement.due_date)}</span></span>;
    } },
  ];

  return (
    <div>
      <PageHeader title="Exits" description="Resignations and other exits, from notice to settlement and archive."
        actions={<>
          <Link href="/dashboard/exits/interviews"><Button variant="secondary" icon={BarChart3}>Exit insights</Button></Link>
          <Link href="/dashboard/exits/settings"><Button variant="ghost" icon={Settings2}>Settings</Button></Link>
          {meta?.can_manage && <Button variant="primary" icon={Plus} onClick={() => setStarting(true)}>Start an exit</Button>}
        </>} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Waiting for acceptance" value={dash?.requested ?? "—"} icon={DoorOpen} />
        <StatCard label="Serving notice" value={dash?.in_progress ?? "—"} icon={UserMinus} hint={dash ? `${dash.leaving_in_30_days} leaving in 30 days` : undefined} />
        <Link href="/dashboard/exits/clearances?delayed=1" className="block">
          <StatCard label="Delayed clearances" value={dash?.delayed_clearances ?? "—"} icon={ClipboardCheck} className={dash?.delayed_clearances ? "border-rose-200" : ""} />
        </Link>
        <StatCard label="Settlements due in 3 days" value={dash?.settlements_due ?? "—"} icon={AlarmClock} hint="Pay within 2 working days of the last day" />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterBar searchPlaceholder="Search by name, ID or exit number" onSearchChange={(v) => { setQ(v); setPage(1); }}
          filters={[
            { key: "type", label: "Kind", multiple: true, options: Object.entries(meta?.types ?? {}).map(([value, label]) => ({ value, label })) },
            ...(view === "list" ? [{ key: "status", label: "Status", multiple: true, options: Object.entries(meta?.statuses ?? {}).map(([value, label]) => ({ value, label })) }] : []),
          ]}
          values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
        <Tabs variant="pill" value={view} onChange={setView} items={[{ value: "board", label: "Board", icon: Columns3 }, { value: "list", label: "List", icon: List }]} />
      </div>

      {view === "board" ? (
        <ExitBoard rows={boardRows} loading={loading} onOpen={(r) => setViewing(r.uuid)} onDropTo={dropTo} />
      ) : (
        <DataTable rows={data?.items ?? []} rowKey={(r) => r.uuid} columns={columns} loading={loading}
          onRowClick={(r) => setViewing(r.uuid)} emptyIcon={LogOut} emptyTitle="No exits" emptyHint="Exits you start or resignations people raise show here."
          pagination={data ? { page, size: SIZE, total: data.total, onPageChange: setPage } : undefined} />
      )}

      <StartExitModal open={starting} onClose={() => setStarting(false)} meta={meta}
        onCreated={(x) => { setStarting(false); refresh(); setViewing(x.uuid); }} />
      <ExitDetailModal uuid={viewing} meta={meta} onClose={() => setViewing(null)} onChanged={refresh} />
    </div>
  );
}
