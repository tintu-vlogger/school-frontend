"use client";

/*
 * Onboarding: dashboard numbers, a board (pre-joining → onboarding → completed) and a
 * table. Start, view and act on an onboarding in centered modals.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, Columns3, DoorOpen, FileWarning, List, Plus, Settings2, UserPlus } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Avatar, Badge, Button, DataTable, DateInput, Field, FilterBar, FormGrid, Modal, ModalCancel, Select, Skeleton, StatCard, StatGrid, Tabs,
  formatDisplayDate, useConfirm, type Column, type FilterValues, type SelectOption,
} from "@/components/ui-kit";
import { loadEmployees } from "@/components/workplace/pickers";
import { OnboardingDetail } from "@/components/onboarding/detail";
import { REVIEW_LABEL, REVIEW_TONE, STATUS_TONE, type Dashboard, type Flow, type Meta, type Onboarding, type Page } from "@/components/onboarding/types";

const COLUMNS = [
  { key: "pre_joining", label: "Pre-joining", hint: "Filling in details" },
  { key: "in_progress", label: "Onboarding", hint: "Joined, settling in" },
  { key: "completed", label: "Completed", hint: "Recently finished" },
] as const;
const VIEW_KEY = "hrms_onboarding_view";

export default function OnboardingPage() {
  const toast = useToast();
  const confirm = useConfirm();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [rows, setRows] = useState<Onboarding[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setViewState] = useState<"board" | "list">("board");
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [viewing, setViewing] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  const setView = (v: "board" | "list") => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };
  useEffect(() => { try { if (localStorage.getItem(VIEW_KEY) === "list") setViewState("list"); } catch { /* private mode */ } }, []);

  useEffect(() => { api.get<Meta>("/onboarding/meta").then(setMeta).catch(() => {}); }, []);
  useEffect(() => { api.get<Dashboard>("/onboarding/dashboard").then(setDash).catch(() => {}); }, [nonce]);
  useEffect(() => {
    let live = true;
    setLoading(true);
    const p = new URLSearchParams({ size: "200" });
    if (q) p.set("q", q);
    if (filters.status?.length) p.set("status", filters.status.join(","));
    if (filters.review?.length) p.set("review_status", filters.review[0]);
    api.get<Page<Onboarding>>(`/onboarding/onboardings?${p}`)
      .then((r) => { if (live) setRows(r.items); })
      .catch((e) => toast.error(e.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [q, filters, nonce, toast]);

  async function move(o: Onboarding, to: string) {
    if (o.status === to || (to === "in_progress" && o.status === "day_one")) return;
    try {
      if (to === "in_progress" && o.status === "pre_joining") {
        if (!await confirm({ title: `Mark ${o.name} as joined?`, message: "Day-one tasks start, the welcome email and Buzz post go out and check-ins are planned.", confirmLabel: "Mark joined" })) return;
        await api.post(`/onboarding/onboardings/${o.uuid}/day-one`, {});
        toast.success(`${o.name} has joined`);
      } else if (to === "completed" && o.status !== "pre_joining") {
        if (!await confirm({ title: `Complete ${o.name}'s onboarding?`, confirmLabel: "Complete" })) return;
        try {
          await api.post(`/onboarding/onboardings/${o.uuid}/complete`, { force: false });
        } catch (e) {
          const m = (e as Error).message;
          if (!/still open/.test(m)) throw e;
          if (!await confirm({ title: "Close with open tasks?", message: m, confirmLabel: "Close anyway" })) return;
          await api.post(`/onboarding/onboardings/${o.uuid}/complete`, { force: true });
        }
        toast.success("Onboarding completed");
      } else {
        toast.info("That move isn't possible. Open the onboarding to see what's next.");
        return;
      }
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const listed = useMemo(() => rows.filter((r) => r.status !== "cancelled" || filters.status?.includes("cancelled")), [rows, filters.status]);
  const SIZE = 25;
  const columns: Column<Onboarding>[] = [
    { key: "name", header: "Joiner", sortable: true, sortValue: (r) => r.name, cell: (r) => (
      <div className="flex items-center gap-2.5"><Avatar name={r.name} size={28} /><div className="min-w-0"><p className="truncate text-ink">{r.name}</p><p className="truncate text-[12px] text-faint">{[r.designation, r.department].filter(Boolean).join(" · ") || r.email}</p></div></div>
    ) },
    { key: "joining", header: "Joining", sortable: true, sortValue: (r) => r.joining_date, cell: (r) => (
      <span>{formatDisplayDate(r.joining_date)}{r.status === "pre_joining" && r.days_to_join >= 0 && <span className="ml-1 text-[12px] text-faint">in {r.days_to_join}d</span>}</span>
    ) },
    { key: "status", header: "Stage", cell: (r) => <Badge tone={STATUS_TONE[r.status] ?? "neutral"} dot>{r.status_label}</Badge> },
    { key: "review", header: "Details", hideBelow: "md", cell: (r) => <span className="flex items-center gap-2"><Badge tone={REVIEW_TONE[r.review_status] ?? "neutral"}>{REVIEW_LABEL[r.review_status]}</Badge><span className="text-[12px] text-faint">{r.portal_percent}%</span></span> },
    { key: "tasks", header: "Checklist", hideBelow: "md", cell: (r) => r.tasks ? <span className={r.tasks.overdue ? "text-rose-600" : ""}>{r.tasks.done}/{r.tasks.total}{r.tasks.overdue ? ` · ${r.tasks.overdue} late` : ""}</span> : "—" },
    { key: "letter", header: "Appointment letter", hideBelow: "lg", cell: (r) => r.appointment_letter ? <Badge tone="good">Issued</Badge> : <Badge tone="warn">Missing</Badge> },
    { key: "flow", header: "Flow", hideBelow: "lg", cell: (r) => <span className="text-muted">{r.flow_name ?? "—"}</span> },
  ];

  return (
    <div>
      <PageHeader title="Onboarding" description="From accepted offer to the end of the first 90 days."
        actions={<>
          <Link href="/dashboard/onboarding/settings"><Button icon={Settings2}>Flows and settings</Button></Link>
          <Button variant="primary" icon={Plus} onClick={() => setStarting(true)}>Start onboarding</Button>
        </>} />

      <StatGrid className="mb-6 xl:grid-cols-5">
        <StatCard label="Pre-joining" value={dash?.pre_joining ?? "–"} icon={UserPlus} hint={dash ? `${dash.joining_this_week} joining this week` : undefined} />
        <StatCard label="Onboarding now" value={dash?.in_progress ?? "–"} icon={DoorOpen} />
        <StatCard label="Details to review" value={dash?.to_review ?? "–"} icon={ClipboardCheck}
          onClick={() => setFilters({ review: ["submitted"] })} />
        <StatCard label="No appointment letter" value={dash?.missing_appointment_letter ?? "–"} icon={FileWarning} hint="Required by law" />
        <StatCard label="Check-ins due" value={dash?.checkins_due ?? "–"} icon={CalendarClock} hint="Next 7 days" />
      </StatGrid>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterBar className="min-w-0 flex-1" search={q} onSearchChange={setQ} searchPlaceholder="Search joiners"
          filters={[
            { key: "status", label: "Stage", multiple: true, options: [
              { value: "pre_joining", label: "Pre-joining" }, { value: "in_progress", label: "Onboarding" },
              { value: "completed", label: "Completed" }, { value: "cancelled", label: "Cancelled" }] },
            { key: "review", label: "Details", options: [
              { value: "pending", label: "Not submitted" }, { value: "submitted", label: "To review" },
              { value: "sent_back", label: "Sent back" }, { value: "accepted", label: "Accepted" }] },
          ]}
          values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
        <Tabs variant="pill" value={view} onChange={setView}
          items={[{ value: "board", label: "Board", icon: Columns3 }, { value: "list", label: "List", icon: List }]} />
      </div>

      {view === "board"
        ? <Board rows={listed} loading={loading} onOpen={(o) => setViewing(o.uuid)} onMove={move} />
        : <DataTable rows={listed.slice((page - 1) * SIZE, page * SIZE)} columns={columns} rowKey={(r) => r.uuid} loading={loading}
            onRowClick={(r) => setViewing(r.uuid)} emptyTitle="No one is onboarding" emptyHint="Accepted offers start onboarding on their own, or start one here."
            pagination={{ page, size: SIZE, total: listed.length, onPageChange: setPage }} />}

      <OnboardingDetail uuid={viewing} meta={meta} onClose={() => setViewing(null)} onChanged={refresh} />
      <StartModal open={starting} onClose={() => setStarting(false)} onStarted={(uuid) => { setStarting(false); refresh(); setViewing(uuid); }} />
    </div>
  );
}

function Board({ rows, loading, onOpen, onMove }: { rows: Onboarding[]; loading: boolean; onOpen: (o: Onboarding) => void; onMove: (o: Onboarding, to: string) => void }) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const col = (k: string) => rows.filter((r) => (k === "in_progress" ? r.status === "in_progress" || r.status === "day_one" : r.status === k))
    .sort((a, b) => (k === "completed" ? (b.completed_at ?? "").localeCompare(a.completed_at ?? "") : a.joining_date.localeCompare(b.joining_date)));
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {COLUMNS.map((c) => {
        const list = col(c.key).slice(0, c.key === "completed" ? 20 : 200);
        return (
          <div key={c.key} onDragOver={(e) => { e.preventDefault(); setOver(c.key); }} onDragLeave={() => setOver((o) => (o === c.key ? null : o))}
            onDrop={(e) => { e.preventDefault(); const o = rows.find((r) => r.uuid === drag); setDrag(null); setOver(null); if (o) onMove(o, c.key); }}
            className={`flex min-h-[360px] flex-col rounded-2xl border bg-sunken/40 p-3 transition-colors ${over === c.key && drag ? "border-primary/40 bg-primary-soft/30" : "border-line"}`}>
            <div className="mb-3 flex items-center justify-between px-1">
              <div><p className="text-[13.5px] text-ink">{c.label}</p><p className="text-[11.5px] text-faint">{c.hint}</p></div>
              <span className="tabular text-[12.5px] text-faint">{list.length}</span>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              {loading && !rows.length ? [0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />) : list.map((o) => (
                <div key={o.uuid} draggable={o.status !== "completed"}
                  onDragStart={(e) => { setDrag(o.uuid); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onClick={() => onOpen(o)}
                  className={`cursor-pointer rounded-xl border border-line bg-surface p-3 transition-all duration-150 hover:-translate-y-px hover:border-line-strong ${drag === o.uuid ? "scale-[0.98] opacity-40" : ""}`}>
                  <div className="flex items-start gap-2.5">
                    <Avatar name={o.name} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] text-ink">{o.name}</p>
                      <p className="truncate text-[12px] text-faint">{[o.designation, o.department].filter(Boolean).join(" · ") || o.flow_name}</p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted">
                    <span className="inline-flex items-center gap-1"><CalendarClock size={12} strokeWidth={1.4} />
                      {o.status === "pre_joining" ? (o.days_to_join > 0 ? `Joins in ${o.days_to_join}d` : o.days_to_join === 0 ? "Joins today" : `Joined ${formatDisplayDate(o.joining_date)}`) : formatDisplayDate(o.joining_date)}</span>
                    {o.tasks && <span className={`inline-flex items-center gap-1 ${o.tasks.overdue ? "text-rose-600" : ""}`}><CheckCircle2 size={12} strokeWidth={1.4} />{o.tasks.done}/{o.tasks.total}</span>}
                    {!o.appointment_letter && o.status !== "completed" && <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle size={12} strokeWidth={1.4} />Letter</span>}
                  </div>
                  {o.status === "pre_joining" && (
                    <div className="mt-2.5">
                      <div className="mb-1 flex justify-between text-[11.5px] text-faint"><span>{REVIEW_LABEL[o.review_status]}</span><span>{o.portal_percent}%</span></div>
                      <div className="h-1 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-primary" style={{ width: `${o.portal_percent}%` }} /></div>
                    </div>
                  )}
                </div>
              ))}
              {!loading && !list.length && <p className="px-1 py-8 text-center text-[12.5px] text-faint">{c.key === "pre_joining" ? "No one waiting to join" : "Nothing here"}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function StartModal({ open, onClose, onStarted }: { open: boolean; onClose: () => void; onStarted: (uuid: string) => void }) {
  const toast = useToast();
  const [emp, setEmp] = useState<number | null>(null);
  const [flow, setFlow] = useState<string | null>(null);
  const [joining, setJoining] = useState("");
  const [buddy, setBuddy] = useState<number | null>(null);
  const [hr, setHr] = useState<number | null>(null);
  const [flows, setFlows] = useState<SelectOption<string>[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setEmp(null); setFlow(null); setJoining(""); setBuddy(null); setHr(null);
    api.get<{ items: Flow[] }>("/onboarding/flows").then((r) => setFlows(r.items.filter((f) => f.active).map((f) => ({ value: f.uuid, label: f.name })))).catch(() => {});
  }, [open]);
  async function save() {
    if (!emp) return;
    setSaving(true);
    try {
      const out = await api.post<{ uuid: string }>("/onboarding/onboardings", {
        employee_id: emp, flow_uuid: flow, joining_date: joining || null, buddy_employee_id: buddy, hr_owner_employee_id: hr,
      });
      toast.success("Onboarding started");
      onStarted(out.uuid);
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" title="Start onboarding" busy={saving} dirty={!!emp}
      description="For someone already added as pre-joining or recently joined. Accepted offers start on their own."
      footer={<><ModalCancel /><Button variant="primary" disabled={!emp} loading={saving} onClick={save}>Start</Button></>}>
      <div className="space-y-5">
        <Field label="Person" required><Select loadOptions={loadEmployees} value={emp} onChange={setEmp} placeholder="Search people" /></Field>
        <FormGrid>
          <Field label="Flow" hint="Leave empty to pick by rule"><Select options={flows} value={flow} onChange={setFlow} clearable placeholder="By rule" /></Field>
          <Field label="Joining date" hint="Defaults to their record"><DateInput value={joining} onChange={setJoining} clearable /></Field>
          <Field label="Buddy"><Select loadOptions={loadEmployees} value={buddy} onChange={setBuddy} clearable placeholder="Optional" /></Field>
          <Field label="HR partner"><Select loadOptions={loadEmployees} value={hr} onChange={setHr} clearable placeholder="Default HR" /></Field>
        </FormGrid>
      </div>
    </Modal>
  );
}
