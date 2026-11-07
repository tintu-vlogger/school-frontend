"use client";

/*
 * Manager cards on the Overview: who is in today (present, remote, late, on leave,
 * absent) and the team's requests waiting for a decision.
 *   <TeamTodayCard everyone={isHr} />  <TeamRequestsCard />
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Inbox, UsersRound } from "lucide-react";
import { formatTime } from "@/lib/datetime";
import { resolveImageUrl } from "@/lib/api";
import { Avatar, AvatarGroup } from "@/components/ui-kit";
import { CardSkeleton, HomeCard, Quiet, SegmentBar, STROKE, Unavailable, useLoad } from "./kit";

export type TeamPerson = {
  employee_uuid: string; name: string; photo: string | null; bucket: string; status: string; status_label: string;
  is_late?: boolean; late_minutes?: number; first_in?: string | null;
};
export type TeamToday = { date: string; counts: Record<string, number>; people: TeamPerson[] };

const GROUPS = [
  { key: "present", label: "In", dot: "bg-emerald-500", bar: "bg-emerald-400" },
  { key: "remote", label: "Remote", dot: "bg-sky-500", bar: "bg-sky-400" },
  { key: "on_leave", label: "On leave", dot: "bg-violet-500", bar: "bg-violet-400" },
  { key: "absent", label: "Absent", dot: "bg-rose-500", bar: "bg-rose-400" },
  { key: "not_yet", label: "Not in yet", dot: "bg-line-strong", bar: "bg-line-strong" },
  { key: "off", label: "Off today", dot: "bg-faint/50", bar: "bg-faint/30" },
] as const;

export function TeamTodayCard({ everyone, className = "", delay = 0 }: { everyone?: boolean; className?: string; delay?: number }) {
  const { data, loading, error } = useLoad<TeamToday>("/attendance/team/today", 30);
  const [group, setGroup] = useState<string | null>(null);
  const counts = data?.counts ?? {};
  const late = (data?.people ?? []).filter((p) => p.is_late);
  const visible = useMemo(() => {
    const ppl = data?.people ?? [];
    if (group === "late") return late;
    if (group) return ppl.filter((p) => p.bucket === group);
    // default: people who are working first, then the rest
    const order = ["present", "remote", "on_leave", "absent", "not_yet", "off"];
    return [...ppl].sort((a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket));
  }, [data, group, late]);

  return (
    <HomeCard title={everyone ? "Everyone today" : "Your team today"} icon={UsersRound} className={className} delay={delay}
      href={everyone ? "/dashboard/attendance/admin" : "/dashboard/attendance/team"} link="Attendance">
      {loading && !data ? <CardSkeleton rows={3} /> : error || !data ? <Unavailable /> : !counts.total ? <Quiet icon={UsersRound}>No one reports to you yet.</Quiet> : (
        <div className="flex flex-1 flex-col px-5 pb-5 pt-2">
          <SegmentBar parts={GROUPS.map((g) => ({ value: counts[g.key] ?? 0, className: g.bar, label: g.label }))} />
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Pill active={!group} onClick={() => setGroup(null)} label="All" n={counts.total} />
            {GROUPS.filter((g) => counts[g.key]).map((g) => (
              <Pill key={g.key} active={group === g.key} onClick={() => setGroup(group === g.key ? null : g.key)} label={g.label} n={counts[g.key]} dot={g.dot} />
            ))}
            {late.length > 0 && <Pill active={group === "late"} onClick={() => setGroup(group === "late" ? null : "late")} label="Late" n={late.length} dot="bg-amber-500" />}
          </div>
          <ul className="mt-3 grid max-h-[232px] grid-cols-1 gap-x-4 overflow-y-auto hr-scroll sm:grid-cols-2">
            {visible.slice(0, 40).map((p) => {
              const g = GROUPS.find((x) => x.key === p.bucket);
              return (
                <li key={p.employee_uuid}>
                  <Link href={`/dashboard/staff/${p.employee_uuid}`} className="flex items-center gap-2.5 rounded-lg py-1.5 hover:text-primary">
                    <span className="relative">
                      <Avatar name={p.name} src={p.photo ? resolveImageUrl(p.photo) : null} size={30} />
                      <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${p.is_late ? "bg-amber-500" : g?.dot ?? "bg-line-strong"}`} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-ink">{p.name}</span>
                      <span className="block truncate text-[11.5px] text-faint">
                        {p.first_in ? `In ${formatTime(p.first_in)}` : p.status_label}{p.is_late && p.late_minutes ? ` · ${p.late_minutes} min late` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {visible.length === 0 && <p className="py-4 text-center text-[12.5px] text-faint">No one here.</p>}
        </div>
      )}
    </HomeCard>
  );
}

function Pill({ label, n, active, onClick, dot }: { label: string; n: number; active: boolean; onClick: () => void; dot?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] transition-colors ${active ? "border-primary/40 bg-primary-soft text-primary" : "border-line text-muted hover:border-line-strong"}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}{label}<span className="tabular text-faint">{n}</span>
    </button>
  );
}

type InboxItem = { uuid: string; request: { request_type: string; request_type_label: string; requester_name: string | null } };

export function TeamRequestsCard({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const { data, loading, error } = useLoad<{ items: InboxItem[]; total?: number }>("/workflow/inbox?status=pending&size=50", 10);
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; people: string[] }>();
    for (const it of data?.items ?? []) {
      const g = m.get(it.request.request_type) ?? { label: it.request.request_type_label, people: [] };
      g.people.push(it.request.requester_name || "Someone");
      m.set(it.request.request_type, g);
    }
    return [...m.entries()].sort((a, b) => b[1].people.length - a[1].people.length);
  }, [data]);
  const max = Math.max(1, ...groups.map(([, g]) => g.people.length));

  return (
    <HomeCard title="Team requests" icon={Inbox} href="/dashboard/inbox" link="Open inbox" className={className} delay={delay}>
      {loading && !data ? <CardSkeleton rows={3} /> : error ? <Unavailable /> : groups.length === 0 ? <Quiet icon={Inbox}>No requests from your team right now.</Quiet> : (
        <ul className="px-2 pb-3 pt-1">
          {groups.map(([type, g]) => {
            const names = Array.from(new Set(g.people));
            return (
              <li key={type}>
                <Link href="/dashboard/inbox" className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-sunken">
                  <span className="tabular w-7 text-[20px] font-extralight leading-none text-primary">{g.people.length}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] text-ink">{g.label}</span>
                    <span className="mt-1 block h-[3px] overflow-hidden rounded-full bg-sunken">
                      <span className="home-grow block h-full rounded-full bg-primary/70" style={{ width: `${(g.people.length / max) * 100}%` }} />
                    </span>
                  </span>
                  <AvatarGroup people={names.map((n) => ({ name: n }))} max={3} size={24} />
                  <ChevronRight size={14} strokeWidth={STROKE} className="text-faint transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </HomeCard>
  );
}
