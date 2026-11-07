"use client";

/*
 * Home page cards for wellbeing.
 *   <StaffHomeCard />                 infirmary today, open incidents, visitors on campus, house leader
 *   <PortalHomeCard studentId={id} /> a child's points and latest infirmary visit (null when empty)
 */
import Link from "next/link";
import { DoorOpen, HeartPulse, ShieldAlert, Stethoscope, Trophy } from "lucide-react";
import { formatDateTime } from "@/lib/datetime";
import { CardSkeleton, HomeCard, Unavailable, useLoad } from "@/components/home/kit";
import { PointsBadge, STROKE } from "./common";

type StaffSummary = {
  infirmary_today: number; sent_home_today: number; open_incidents: number; follow_ups_due: number; visitors_today: number;
  visitors_inside: number; gate_passes_today: number; houses: { house_id: number; name: string; color: string | null; points: number }[];
};

export function StaffHomeCard({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const { data, loading, error } = useLoad<StaffSummary>("/wellbeing/summary", 60);
  const top = data?.houses?.[0];
  return (
    <HomeCard title="Wellbeing today" icon={HeartPulse} href="/dashboard/wellbeing/health" link="Open" className={className} delay={delay}>
      {loading && !data ? <CardSkeleton /> : error || !data ? <Unavailable /> : (
        <div className="grid grid-cols-2 gap-2.5 px-5 pb-5 pt-3">
          <Stat href="/dashboard/wellbeing/health?tab=infirmary" icon={Stethoscope} label="Infirmary visits" value={data.infirmary_today}
            hint={data.sent_home_today ? `${data.sent_home_today} sent home` : undefined} />
          <Stat href="/dashboard/wellbeing/discipline" icon={ShieldAlert} label="Open incidents" value={data.open_incidents}
            hint={data.follow_ups_due ? `${data.follow_ups_due} follow-ups due` : undefined} />
          <Stat href="/dashboard/wellbeing/visitors" icon={DoorOpen} label="Visitors on campus" value={data.visitors_inside} hint={`${data.visitors_today} today`} />
          <Stat href="/dashboard/wellbeing/discipline?tab=houses" icon={Trophy} label="Leading house" value={top ? top.name : "—"} hint={top ? `${top.points} points` : undefined} />
        </div>
      )}
    </HomeCard>
  );
}

function Stat({ href, icon: Icon, label, value, hint }: { href: string; icon: typeof Trophy; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Link href={href} className="rounded-xl border border-line px-3.5 py-3 transition-colors hover:border-line-strong">
      <p className="flex items-center gap-1.5 text-[12.5px] text-muted"><Icon size={14} strokeWidth={STROKE} />{label}</p>
      <p className="mt-1.5 truncate text-[20px] font-extralight tabular text-ink">{value}</p>
      {hint && <p className="text-[12px] text-faint">{hint}</p>}
    </Link>
  );
}

type PortalSummary = {
  visits: { uuid: string; visit_at: string; complaint: string; sent_home: boolean }[];
  points_total: number; merits: number; house: { name: string; points: number } | null;
};

export function PortalHomeCard({ studentId, className = "", delay = 0 }: { studentId: number; className?: string; delay?: number }) {
  const { data } = useLoad<PortalSummary>(studentId ? `/wellbeing/portal/summary?student_id=${studentId}` : null, 60);
  if (!data || (data.visits.length === 0 && data.points_total === 0 && data.merits === 0)) return null;
  const last = data.visits[0];
  return (
    <HomeCard title="Health & merits" icon={HeartPulse} href="/dashboard/my/wellbeing" link="Details" className={className} delay={delay}>
      <div className="space-y-3 px-5 pb-5 pt-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[28px] font-extralight"><PointsBadge value={data.points_total} /></span>
          <span className="text-[13px] text-muted">points{data.house ? ` · ${data.house.name} (${data.house.points})` : ""}</span>
        </div>
        {last && (
          <p className="flex items-start gap-2 text-[13px] text-muted">
            <Stethoscope size={15} strokeWidth={STROKE} className="mt-0.5 shrink-0 text-faint" />
            <span>Infirmary: {last.complaint}{last.sent_home ? " (sent home)" : ""} · {formatDateTime(last.visit_at)}</span>
          </p>
        )}
      </div>
    </HomeCard>
  );
}
