"use client";

/*
 * Home page cards for transport.
 *   <StaffHomeCard />                 riders, seats, full routes and renewals due (GET /transport/summary)
 *   <PortalHomeCard studentId={id} /> the child's route, stop and times; null when they don't ride
 */
import { Bus, Clock3, MapPin } from "lucide-react";
import { useAccess } from "@/lib/access";
import { CardSkeleton, HomeCard, Quiet, Unavailable, useLoad } from "@/components/home/kit";
import { clock, STROKE } from "./common";
import type { RiderSummary, TransportSummary } from "./types";

export function StaffHomeCard({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const { can } = useAccess();
  const { data, loading, error } = useLoad<TransportSummary>(can("transport.view") ? "/transport/summary" : null, 60);
  if (!can("transport.view")) return null;
  return (
    <HomeCard title="Transport" icon={Bus} href="/dashboard/transport" link="Open" className={className} delay={delay}>
      {loading && !data ? <CardSkeleton /> : error || !data ? <Unavailable /> : !data.routes ? <Quiet icon={Bus}>No routes yet.</Quiet> : (
        <div className="px-5 pb-5 pt-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Tile label="Riders" value={data.riders} />
            <Tile label="Seats free" value={Math.max(0, data.seats - data.riders)} />
            <Tile label="Renewals" value={data.expiring} tone={data.expired ? "text-rose-700" : data.expiring ? "text-amber-700" : undefined} />
          </div>
          <ul className="mt-3 space-y-2">
            {data.loads.slice(0, 4).map((l) => {
              const r = l.seats ? Math.min(1, l.riders / l.seats) : 0;
              return (
                <li key={l.uuid} className="flex items-center gap-3 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-ink/80">{l.name}</span>
                  <span className="h-1.5 w-20 overflow-hidden rounded-full bg-sunken"><span className={`block h-full rounded-full ${r >= 1 ? "bg-rose-500" : "bg-primary"}`} style={{ width: `${r * 100}%` }} /></span>
                  <span className="w-12 text-right tabular text-muted">{l.riders}/{l.seats ?? "—"}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </HomeCard>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl bg-sunken/50 px-2 py-2.5">
      <p className={`tabular text-[20px] font-extralight ${tone ?? "text-ink"}`}>{value}</p>
      <p className="text-[11.5px] text-muted">{label}</p>
    </div>
  );
}

export function PortalHomeCard({ studentId, className = "", delay = 0 }: { studentId: number; className?: string; delay?: number }) {
  const { data, loading } = useLoad<{ rider: RiderSummary | null }>(`/transport/portal/summary?student_id=${studentId}`, 120);
  if (loading && !data) return null;
  const r = data?.rider;
  if (!r) return null;
  return (
    <HomeCard title="School bus" icon={Bus} href="/dashboard/my/transport" link="Details" className={className} delay={delay}>
      <div className="px-5 pb-5 pt-2">
        <p className="text-[15px] text-ink">{r.route}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted"><MapPin size={13} strokeWidth={STROKE} />{r.stop}</p>
        <div className="mt-3 flex gap-4 text-[13px]">
          {r.pickup_time && r.direction !== "drop" && <span className="flex items-center gap-1.5 text-ink/80"><Clock3 size={13} strokeWidth={STROKE} />Pickup {clock(r.pickup_time)}</span>}
          {r.drop_time && r.direction !== "pickup" && <span className="flex items-center gap-1.5 text-ink/80"><Clock3 size={13} strokeWidth={STROKE} />Drop {clock(r.drop_time)}</span>}
        </div>
      </div>
    </HomeCard>
  );
}
