"use client";

/*
 * Objective card for the goals page, and the small pieces shared with the detail modal:
 *   <ObjectiveCard objective statuses onOpen onCheckin />   title, level, owner, progress with
 *        the "should be here by now" tick, status and its key results
 *   <KrLine kr statuses />                                   one key result with its progress
 *   <CheckinPlan flags />                                    planned check-in dates as chips
 *   krValueText(kr)                                          "41.6 of 48 ₹ cr", "2 of 3 milestones"
 */
import { AlertTriangle, CalendarClock, ChevronRight, Flag, Gauge } from "lucide-react";
import { formatDate, formatDayMonth } from "@/lib/datetime";
import { Avatar } from "@/components/ui-kit";
import { GoalStatusBadge, LevelBadge, ProgressBar, STROKE, statusTone } from "../shared";
import type { CheckinFlag, GoalStatus, KeyResult, Objective } from "../types";

const fmt = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-IN") : n.toLocaleString("en-IN", { maximumFractionDigits: 2 }));

export function krValueText(kr: KeyResult) {
  if (kr.kind === "boolean") return kr.current_value >= 1 ? "Done" : "Not yet";
  if (kr.kind === "milestone") return `${kr.milestones.filter((m) => m.done).length} of ${kr.milestones.length} milestones`;
  const unit = kr.kind === "percent" ? "%" : kr.unit ? ` ${kr.unit}` : "";
  return `${fmt(kr.current_value)}${unit} of ${fmt(kr.target_value)}${unit}`;
}

export function KrLine({ kr, statuses, compact }: { kr: KeyResult; statuses?: GoalStatus[]; compact?: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5">
      <div className="min-w-0">
        <p className="truncate text-[13.5px] text-ink/85">{kr.title}</p>
        {!compact && (
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12px] text-muted">
            <span className="tabular">{krValueText(kr)}</span>
            {kr.owner && <span className="truncate">{kr.owner.name}</span>}
            {kr.missed_checkins > 0 && (
              <span className="inline-flex items-center gap-1 text-rose-600"><AlertTriangle size={12} strokeWidth={STROKE} />{kr.missed_checkins} missed</span>
            )}
          </p>
        )}
      </div>
      <span className="tabular text-[13px] text-ink/80">{Math.round(kr.progress)}%</span>
      <div className="col-span-2"><ProgressBar value={kr.progress} expected={kr.expected_progress} tone={statusTone(statuses, kr.status_key)} height={4} /></div>
    </div>
  );
}

const FLAG_STYLE: Record<CheckinFlag["state"], string> = {
  on_time: "border-emerald-200 bg-emerald-50 text-emerald-700",
  late: "border-amber-200 bg-amber-50 text-amber-700",
  missed: "border-rose-200 bg-rose-50 text-rose-700",
  upcoming: "border-line bg-surface text-muted",
};
const FLAG_LABEL: Record<CheckinFlag["state"], string> = { on_time: "On time", late: "Late", missed: "Missed", upcoming: "Planned" };

export function CheckinPlan({ flags }: { flags: CheckinFlag[] }) {
  if (!flags.length) return <p className="text-[12.5px] text-faint">No check-ins planned.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {flags.map((f) => (
        <span key={f.planned} title={`${FLAG_LABEL[f.state]}${f.checked_in ? ` · checked in ${formatDate(f.checked_in)}` : ""}`}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] tabular ${FLAG_STYLE[f.state]}`}>
          {formatDayMonth(f.planned)}
        </span>
      ))}
    </div>
  );
}

export function ObjectiveCard({ objective: o, statuses, onOpen, onCheckin, showOwner = true }: {
  objective: Objective; statuses?: GoalStatus[]; onOpen: () => void; onCheckin?: () => void; showOwner?: boolean;
}) {
  const next = o.key_results.map((k) => k.next_checkin).filter(Boolean).sort()[0] as string | undefined;
  return (
    <article className="group flex flex-col rounded-2xl border border-line bg-surface transition-colors hover:border-line-strong">
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col gap-4 p-5 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <LevelBadge level={o.level} />
              <GoalStatusBadge statusKey={o.status_key} statuses={statuses} />
            </div>
            <h3 className="text-[16px] font-normal leading-snug text-ink [text-wrap:balance]">{o.title}</h3>
          </div>
          <div className="shrink-0 text-right">
            <p className="tabular text-[26px] font-extralight leading-none text-ink">{Math.round(o.progress)}<span className="text-[15px] text-muted">%</span></p>
            <p className="mt-1 text-[11.5px] text-faint">expected {Math.round(o.expected_progress)}%</p>
          </div>
        </div>
        <ProgressBar value={o.progress} expected={o.expected_progress} tone={statusTone(statuses, o.status_key)} />
        {o.key_results.length > 0 && (
          <div className="space-y-3 border-t border-line pt-4">
            {o.key_results.slice(0, 4).map((k) => <KrLine key={k.uuid} kr={k} statuses={statuses} />)}
            {o.key_results.length > 4 && <p className="text-[12px] text-faint">+{o.key_results.length - 4} more key results</p>}
          </div>
        )}
      </button>
      <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-[12.5px] text-muted">
        <span className="flex min-w-0 items-center gap-3">
          {showOwner && o.owner && (
            <span className="flex min-w-0 items-center gap-1.5"><Avatar name={o.owner.name} src={o.owner.photo} size={20} /><span className="truncate">{o.owner.name}</span></span>
          )}
          {o.department && o.level === "department" && !showOwner && <span className="truncate">{o.department.name}</span>}
          {o.children_count > 0 && <span className="inline-flex items-center gap-1"><Flag size={12} strokeWidth={STROKE} />{o.children_count} aligned</span>}
          {o.missed_checkins > 0 && <span className="inline-flex items-center gap-1 text-rose-600"><AlertTriangle size={12} strokeWidth={STROKE} />{o.missed_checkins} missed</span>}
          {next && <span className="hidden items-center gap-1 sm:inline-flex"><CalendarClock size={12} strokeWidth={STROKE} />Next {formatDayMonth(next)}</span>}
        </span>
        {onCheckin && o.can_edit && o.key_results.length > 0 ? (
          <button type="button" onClick={onCheckin} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-primary transition-colors hover:bg-primary-soft">
            <Gauge size={14} strokeWidth={STROKE} /> Check in
          </button>
        ) : (
          <ChevronRight size={15} strokeWidth={STROKE} className="text-faint group-hover:text-muted" />
        )}
      </footer>
    </article>
  );
}
