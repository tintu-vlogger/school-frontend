"use client";

/*
 * Self-service cards on the Overview: leave balances (with Apply leave), the latest
 * payslip, upcoming holidays and "Needs your attention" (approvals, tasks, policies,
 * letters to sign, surveys, learning and reviews).
 *   <LeaveCard />  <PayslipCard />  <HolidaysCard />  <AttentionCard isEmployee />
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpenCheck, Check, ChevronRight, ClipboardCheck, ClipboardList, Download, FileSignature, FileText, Inbox,
  ListChecks, Megaphone, PartyPopper, Plane, Plus, Sparkles, Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate, formatRelative, todayISO } from "@/lib/datetime";
import { Avatar, Button, Skeleton } from "@/components/ui-kit";
import { ApplyLeaveModal } from "@/components/leave/apply-modal";
import type { BalanceCard, Summary } from "@/components/leave/types";
import { downloadWithAuth } from "@/components/people/types";
import { inr, monthLabel } from "@/components/payroll/common";
import { CardSkeleton, HomeCard, Quiet, Ring, STROKE, Unavailable, useLoad } from "./kit";

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/* ── Leave ────────────────────────────────────────────────────────── */

export function LeaveCard({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const { data, loading, error, reload } = useLoad<Summary>("/leave/me/summary", 30);
  const [applying, setApplying] = useState<string | null | false>(false);
  const cards = useMemo(() => (data?.cards ?? []).filter((c) => c.applicable && c.show_balance && c.type.active), [data]);

  return (
    <HomeCard title="Leave balance" icon={Plane} className={className} delay={delay}
      action={
        <div className="flex items-center gap-3">
          <Link href="/dashboard/leave" className="hidden text-[12.5px] text-muted hover:text-primary sm:inline">History</Link>
          <Button size="sm" variant="primary" icon={Plus} disabled={!data} onClick={() => setApplying(null)}>Apply leave</Button>
        </div>
      }>
      {loading && !data ? (
        <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[76px] rounded-xl" />)}</div>
      ) : error || !data ? <Unavailable /> : cards.length === 0 ? <Quiet icon={Plane}>No leave types apply to you yet.</Quiet> : (
        <div className="grid grid-cols-2 gap-2.5 px-5 pb-5 pt-3 sm:grid-cols-3 xl:grid-cols-4">
          {cards.slice(0, 8).map((c) => <BalanceTile key={c.type.uuid} card={c} onApply={() => setApplying(c.type.uuid)} />)}
        </div>
      )}
      {data && (
        <ApplyLeaveModal open={applying !== false} onClose={() => setApplying(false)} cards={data.cards} initialType={applying || null}
          onSaved={() => { setApplying(false); reload(); }} />
      )}
    </HomeCard>
  );
}

function BalanceTile({ card, onApply }: { card: BalanceCard; onApply: () => void }) {
  const total = card.opening + card.carried_in + card.accrued + card.granted + (card.to_come ?? 0);
  const ratio = total > 0 ? card.available / total : 0;
  return (
    <button type="button" onClick={onApply} title={`Apply for ${card.type.name.toLowerCase()}`}
      className="group flex items-center gap-3 rounded-xl border border-line px-3 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft/40">
      <span style={{ color: card.type.color }}>
        <Ring value={ratio} size={38} stroke={2.5} className="">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: card.type.color }} />
        </Ring>
      </span>
      <span className="min-w-0">
        <span className="tabular block text-[20px] font-light leading-none text-ink">{fmtNum(card.available)}<span className="ml-1 text-[11.5px] text-faint">{card.type.unit === "hour" ? "h" : card.available === 1 ? "day" : "days"}</span></span>
        <span className="mt-1 block truncate text-[12px] text-muted group-hover:text-primary">{card.type.name}</span>
      </span>
    </button>
  );
}

/* ── Payslip ──────────────────────────────────────────────────────── */

type Payslip = { uuid: string; net: string; gross: string; deductions: string; period_start: string; pay_date?: string | null; payment_status?: string; run_title?: string };

export function PayslipCard({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const toast = useToast();
  const { data, loading, error } = useLoad<{ items: Payslip[] }>("/payroll/me/payslips", 60);
  const [hidden, setHidden] = useState(true);
  const p = data?.items?.[0];
  const gross = Number(p?.gross ?? 0), ded = Number(p?.deductions ?? 0);

  return (
    <HomeCard title="Latest payslip" icon={Wallet} href="/dashboard/payroll/me" link="My pay" className={className} delay={delay}>
      {loading && !data ? <div className="space-y-3 px-5 py-5"><Skeleton className="h-3 w-24" /><Skeleton className="h-9 w-40" /><Skeleton className="h-2 w-full" /></div>
        : error ? <Unavailable /> : !p ? <Quiet icon={Wallet}>Your payslips appear here after the first pay run.</Quiet> : (
          <div className="flex flex-1 flex-col px-5 pb-5 pt-2">
            <p className="text-[12.5px] text-faint">{monthLabel(p.period_start)} · net pay</p>
            <button type="button" onClick={() => setHidden((h) => !h)} title={hidden ? "Show amount" : "Hide amount"}
              className="tabular mt-1 text-left text-[34px] font-extralight leading-none tracking-tight text-ink">
              {hidden ? <span className="text-faint">₹ • • • • •</span> : inr(p.net)}
            </button>
            <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-sunken">
              <span className="home-grow h-full bg-primary" style={{ width: `${gross ? ((gross - ded) / gross) * 100 : 0}%` }} />
              <span className="home-grow h-full bg-amber-300" style={{ width: `${gross ? (ded / gross) * 100 : 0}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-[12px] text-muted">
              <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-primary" /> Take home</span>
              <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-amber-300" /> Deductions {hidden ? "" : inr(p.deductions)}</span>
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 pt-4">
              <span className="text-[12px] text-faint">{p.pay_date ? `Paid ${formatDate(p.pay_date)}` : ""}</span>
              <Button size="sm" variant="secondary" icon={Download}
                onClick={() => downloadWithAuth(`/payroll/payslips/${p.uuid}/pdf`, "payslip.pdf").catch((e) => toast.error(e instanceof Error ? e.message : "Couldn't download"))}>
                Download
              </Button>
            </div>
          </div>
        )}
    </HomeCard>
  );
}

/* ── Holidays ─────────────────────────────────────────────────────── */

type Holidays = { calendar: { name: string } | null; holidays: { uuid: string; name: string; date: string; kind: string; weekday: string }[] };

export function HolidaysCard({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const { data, loading, error } = useLoad<Holidays>("/leave/me/holidays", 300);
  const today = todayISO();
  const next = (data?.holidays ?? []).filter((h) => h.date >= today).slice(0, 4);
  const daysTo = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

  return (
    <HomeCard title="Upcoming holidays" icon={PartyPopper} href="/dashboard/holidays" link="Calendar" className={className} delay={delay}>
      {loading && !data ? <CardSkeleton rows={3} /> : error ? <Unavailable /> : next.length === 0 ? <Quiet icon={PartyPopper}>No more holidays this year.</Quiet> : (
        <ul className="px-3 pb-3 pt-1">
          {next.map((h) => {
            const d = daysTo(h.date);
            const dd = h.date.slice(8, 10);
            return (
              <li key={h.uuid} className="flex items-center gap-3 rounded-xl px-2 py-2">
                <span className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border ${h.kind === "optional" ? "border-dashed border-line-strong" : "border-primary/25 bg-primary-soft/50"}`}>
                  <span className="text-[9.5px] uppercase tracking-[0.1em] text-faint">{formatDate(h.date, { month: "short", day: undefined, year: undefined })}</span>
                  <span className="tabular -mt-0.5 text-[16px] font-light leading-none text-ink">{Number(dd)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-ink">{h.name}</span>
                  <span className="block text-[12px] text-faint">{h.weekday}{h.kind === "optional" ? " · Optional" : ""}</span>
                </span>
                <span className="shrink-0 text-[12px] text-muted">{d === 0 ? "Today" : d === 1 ? "Tomorrow" : `in ${d} days`}</span>
              </li>
            );
          })}
        </ul>
      )}
    </HomeCard>
  );
}

/* ── Needs your attention ─────────────────────────────────────────── */

type InboxItem = {
  uuid: string; due_at: string | null; escalated: boolean; created_at: string;
  request: { uuid: string; title: string; request_type: string; request_type_label: string; requester_name: string | null };
};
type TaskSummary = { open: number; overdue: number; due_today: number };
type Engage = { pending_surveys: { uuid: string; title: string; mandatory: boolean }[]; pending_acks: number };
type Learning = { enrolments: { uuid: string; title: string; overdue: boolean; days_left: number | null; enrolment?: { status: string; due_date: string | null } | null }[] };
type Perf = { pending_reviews: number; overdue_reviews: number; feedback_requests: number; pending_acks: number; goals?: { checkins_due: { next_checkin: string }[] } };
type Signatures = { items: { uuid: string; status: string; title: string }[] };

export function AttentionCard({ isEmployee, className = "", delay = 0 }: { isEmployee: boolean; className?: string; delay?: number }) {
  const toast = useToast();
  const count = useLoad<{ count: number }>("/workflow/inbox/count", 10);
  const inbox = useLoad<{ items: InboxItem[] }>("/workflow/inbox?status=pending&size=3", 10);
  const tasks = useLoad<TaskSummary>("/tasks/summary", 30);
  const docs = useLoad<{ policies: number; signatures: number }>(isEmployee ? "/documents/me/pending-count" : null, 30);
  const letters = useLoad<Signatures>(isEmployee ? "/letters/me/signatures" : null, 30);
  const engage = useLoad<Engage>("/engagement/home", 30);
  const learning = useLoad<Learning>(isEmployee ? "/learning/my" : null, 60);
  const perf = useLoad<Perf>("/performance/me", 60);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  async function approve(item: InboxItem) {
    setDeciding(item.uuid);
    try {
      await api.post(`/workflow/tasks/${item.uuid}/decision`, { decision: "approve" });
      setDone((s) => new Set(s).add(item.uuid));
      toast.success("Approved", { description: item.request.title });
      setTimeout(() => { count.reload(); inbox.reload(); }, 600);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't approve");
    } finally {
      setDeciding(null);
    }
  }

  const today = todayISO();
  const learningDue = (learning.data?.enrolments ?? []).filter((e) => e.enrolment && !["completed", "cancelled"].includes(e.enrolment.status)
    && (e.overdue || (e.days_left != null && e.days_left <= 14)));
  const toSign = (letters.data?.items ?? []).filter((s) => s.status === "pending");
  const checkins = (perf.data?.goals?.checkins_due ?? []).filter((c) => c.next_checkin <= today).length;

  type Row = { key: string; icon: typeof Inbox; label: string; sub?: string; href: string; tone?: "bad" | "warn"; n: number };
  const rows: Row[] = [];
  const t = tasks.data;
  if (t && (t.overdue || t.due_today || t.open)) rows.push({ key: "tasks", icon: ListChecks, n: t.overdue + t.due_today || t.open,
    label: t.overdue ? `${t.overdue} task${t.overdue === 1 ? "" : "s"} overdue` : t.due_today ? `${t.due_today} task${t.due_today === 1 ? "" : "s"} due today` : `${t.open} open task${t.open === 1 ? "" : "s"}`,
    sub: t.overdue && t.due_today ? `${t.due_today} more due today` : undefined, href: "/dashboard/tasks", tone: t.overdue ? "bad" : t.due_today ? "warn" : undefined });
  if (docs.data?.policies) rows.push({ key: "pol", icon: FileText, n: docs.data.policies, label: `${docs.data.policies} polic${docs.data.policies === 1 ? "y" : "ies"} to acknowledge`, href: "/dashboard/documents?tab=policies", tone: "warn" });
  const sigN = toSign.length || docs.data?.signatures || 0;
  if (sigN) rows.push({ key: "sign", icon: FileSignature, n: sigN, label: `${sigN} letter${sigN === 1 ? "" : "s"} to sign`, sub: toSign[0]?.title, href: "/dashboard/documents?tab=mine", tone: "warn" });
  if (engage.data?.pending_acks) rows.push({ key: "ack", icon: Megaphone, n: engage.data.pending_acks, label: `${engage.data.pending_acks} announcement${engage.data.pending_acks === 1 ? "" : "s"} to acknowledge`, href: "/dashboard/announcements?tab=pending" });
  const surveys = engage.data?.pending_surveys ?? [];
  if (surveys.length) rows.push({ key: "surv", icon: ClipboardList, n: surveys.length, label: surveys.length === 1 ? `Answer “${surveys[0].title}”` : `${surveys.length} surveys to answer`,
    sub: surveys.some((s) => s.mandatory) ? "Required" : undefined, href: surveys.length === 1 ? `/dashboard/surveys?take=${surveys[0].uuid}` : "/dashboard/surveys" });
  if (learningDue.length) rows.push({ key: "learn", icon: BookOpenCheck, n: learningDue.length,
    label: learningDue.length === 1 ? `Finish “${learningDue[0].title}”` : `${learningDue.length} courses due`,
    sub: learningDue[0].overdue ? "Overdue" : learningDue[0].enrolment?.due_date ? `Due ${formatDate(learningDue[0].enrolment.due_date)}` : undefined,
    href: "/dashboard/learning/my", tone: learningDue.some((l) => l.overdue) ? "bad" : undefined });
  const p = perf.data;
  if (p && (p.pending_reviews || p.feedback_requests || p.pending_acks)) {
    const n = p.pending_reviews + p.feedback_requests + p.pending_acks;
    rows.push({ key: "perf", icon: ClipboardCheck, n, label: p.pending_reviews ? `${p.pending_reviews} review${p.pending_reviews === 1 ? "" : "s"} to complete` : `${n} feedback request${n === 1 ? "" : "s"}`,
      sub: p.overdue_reviews ? `${p.overdue_reviews} overdue` : undefined, href: "/dashboard/performance", tone: p.overdue_reviews ? "bad" : undefined });
  }
  if (checkins) rows.push({ key: "okr", icon: Sparkles, n: checkins, label: `${checkins} goal check-in${checkins === 1 ? "" : "s"} due`, href: "/dashboard/goals" });

  const approvals = (inbox.data?.items ?? []).filter((i) => !done.has(i.uuid));
  const waiting = count.data?.count ?? 0;
  const loading = count.loading && inbox.loading && tasks.loading;
  const allClear = !loading && waiting === 0 && rows.length === 0;

  return (
    <HomeCard title="Needs your attention" icon={Inbox} href="/dashboard/inbox" link={waiting ? `All approvals` : "Approvals"} className={className} delay={delay}>
      {loading ? <CardSkeleton rows={4} /> : allClear ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Check size={20} strokeWidth={1.5} /></span>
          <p className="text-[14px] text-ink">You&apos;re all caught up</p>
          <p className="text-[12.5px] text-faint">Nothing is waiting for you right now.</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col pb-3">
          {waiting > 0 && (
            <div className="mx-5 mt-2 rounded-xl border border-line">
              <Link href="/dashboard/inbox" className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                <span className="flex items-baseline gap-2">
                  <span className="tabular text-[24px] font-extralight leading-none text-primary">{waiting}</span>
                  <span className="text-[13px] text-muted">approval{waiting === 1 ? "" : "s"} waiting for you</span>
                </span>
                <ChevronRight size={15} strokeWidth={STROKE} className="text-faint" />
              </Link>
              <ul className="divide-y divide-line">
                {inbox.loading && !inbox.data ? <li className="px-4 py-3"><Skeleton className="h-3 w-3/4" /></li> : approvals.map((it) => (
                  <li key={it.uuid} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar name={it.request.requester_name || "?"} size={28} />
                    <Link href="/dashboard/inbox" className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink hover:text-primary">{it.request.title}</span>
                      <span className="block truncate text-[11.5px] text-faint">{it.request.request_type_label} · {formatRelative(it.created_at)}{it.escalated ? " · escalated" : ""}</span>
                    </Link>
                    <Button size="sm" variant="secondary" icon={Check} loading={deciding === it.uuid} onClick={() => approve(it)}>Approve</Button>
                  </li>
                ))}
                {!inbox.loading && approvals.length === 0 && <li className="px-4 py-3 text-[12.5px] text-faint">Open the inbox to see them.</li>}
              </ul>
            </div>
          )}
          {rows.length > 0 && (
            <ul className="mt-1 px-2">
              {rows.map((r) => (
                <li key={r.key}>
                  <Link href={r.href} className="group flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-sunken">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${r.tone === "bad" ? "bg-rose-50 text-rose-600" : r.tone === "warn" ? "bg-amber-50 text-amber-600" : "bg-primary-soft text-primary"}`}>
                      <r.icon size={15} strokeWidth={STROKE} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-ink">{r.label}</span>
                      {r.sub && <span className="block truncate text-[12px] text-faint">{r.sub}</span>}
                    </span>
                    <ChevronRight size={14} strokeWidth={STROKE} className="text-faint transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </HomeCard>
  );
}
