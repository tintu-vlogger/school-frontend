"use client";

/*
 * Home page cards for the hostel.
 *   <StaffHomeCard />                 occupancy, tonight's roll-call, leave waiting (GET /hostel/summary)
 *   <PortalHomeCard studentId={id} /> the boarder's room and latest leave; null for day scholars
 */
import { BedDouble } from "lucide-react";
import { useAccess } from "@/lib/access";
import { formatDateTime } from "@/lib/datetime";
import { Badge } from "@/components/ui-kit";
import { CardSkeleton, HomeCard, Quiet, Unavailable, useLoad } from "@/components/home/kit";
import { LEAVE_LABEL, LEAVE_TONE, type BoarderSummary, type HostelSummary, type Leave } from "./types";

export function StaffHomeCard({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const { can } = useAccess();
  const ok = can("hostel.view");
  const { data, loading, error } = useLoad<HostelSummary>(ok ? "/hostel/summary" : null, 60);
  if (!ok) return null;
  return (
    <HomeCard title="Hostel" icon={BedDouble} href="/dashboard/hostel" link="Open" className={className} delay={delay}>
      {loading && !data ? <CardSkeleton /> : error || !data ? <Unavailable /> : !data.beds ? <Quiet icon={BedDouble}>No rooms set up yet.</Quiet> : (
        <div className="px-5 pb-5 pt-2">
          <div className="flex items-baseline gap-2">
            <span className="tabular text-[28px] font-extralight text-ink">{data.occupied}</span>
            <span className="text-[13px] text-muted">boarders · {data.free} beds free</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-primary" style={{ width: `${(data.occupied / data.beds) * 100}%` }} /></div>
          <ul className="mt-3 space-y-1.5 text-[13px]">
            <li className="flex justify-between"><span className="text-muted">Night roll-call</span>
              <span className={data.roll_call_taken ? (data.absent_tonight ? "text-rose-700" : "text-emerald-700") : "text-amber-700"}>
                {data.roll_call_taken ? (data.absent_tonight ? `${data.absent_tonight} absent` : "All present") : "Not taken"}</span></li>
            <li className="flex justify-between"><span className="text-muted">Leave waiting</span><span className="tabular text-ink">{data.pending_leave}</span></li>
            <li className="flex justify-between"><span className="text-muted">Away on leave</span><span className="tabular text-ink">{data.out_now}</span></li>
          </ul>
        </div>
      )}
    </HomeCard>
  );
}

export function PortalHomeCard({ studentId, className = "", delay = 0 }: { studentId: number; className?: string; delay?: number }) {
  const { data, loading } = useLoad<{ boarder: BoarderSummary | null; leaves: Leave[] }>(`/hostel/portal/summary?student_id=${studentId}`, 120);
  if (loading && !data) return null;
  const b = data?.boarder;
  if (!b) return null;
  const last = data?.leaves[0];
  return (
    <HomeCard title="Hostel" icon={BedDouble} href="/dashboard/my/hostel" link="Details" className={className} delay={delay}>
      <div className="px-5 pb-5 pt-2">
        <p className="text-[15px] text-ink">{b.block} · Room {b.room}</p>
        <p className="text-[13px] text-muted">Bed {b.bed}{b.warden ? ` · Warden ${b.warden.name}` : ""}</p>
        {last && (
          <div className="mt-3 flex items-center justify-between gap-2 text-[13px]">
            <span className="truncate text-ink/80">{last.kind === "leave" ? "Leave" : "Out-pass"} {formatDateTime(last.from_at)}</span>
            <Badge tone={LEAVE_TONE[last.status]} dot>{LEAVE_LABEL[last.status]}</Badge>
          </div>
        )}
      </div>
    </HomeCard>
  );
}
