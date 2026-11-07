"use client";

/*
 * Portal: a learner's school transport. Route, stop and times, every stop on the route with
 * theirs marked, the vehicle and how to reach the driver and attendant.
 */
import { Bus, Clock3, MapPin, Phone, UserRound } from "lucide-react";
import { PageHeader, Paper, PaperHeader, EmptyState } from "@/components/shell/page";
import { Avatar, Skeleton, formatDisplayDate } from "@/components/ui-kit";
import { ChildPicker, clock, STROKE, useApiData, useMyChildren } from "@/components/transport/common";
import type { Contact, RiderSummary } from "@/components/transport/types";

type PortalTransport = { rider: RiderSummary | null; stops?: { name: string; pickup_time: string | null; drop_time: string | null; mine: boolean }[] };

export default function MyTransportPage() {
  const { kids, child, setChild, loading: kidsLoading } = useMyChildren();
  const { data, loading } = useApiData<PortalTransport>(child ? `/transport/portal/summary?student_id=${child.id}` : null);
  const r = data?.rider;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Transport" description={child ? `School bus details for ${child.first_name || child.name}.` : "School bus details."} />
      <ChildPicker kids={kids} value={child?.id ?? null} onChange={setChild} />
      {kidsLoading || loading ? (
        <div className="space-y-3"><Skeleton className="h-32 w-full rounded-2xl" /><Skeleton className="h-48 w-full rounded-2xl" /></div>
      ) : !r ? (
        <Paper><EmptyState icon={Bus} title="No school transport" hint="Contact the school office to sign up for the bus." /></Paper>
      ) : (
        <div className="space-y-4">
          <Paper className="p-5">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft/60 text-primary"><Bus size={20} strokeWidth={STROKE} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[18px] font-light text-ink">{r.route}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[13.5px] text-muted"><MapPin size={14} strokeWidth={STROKE} />{r.stop}{r.landmark ? ` · ${r.landmark}` : ""}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {r.direction !== "drop" && <TimeTile label="Pickup" time={r.pickup_time} />}
              {r.direction !== "pickup" && <TimeTile label="Drop" time={r.drop_time} />}
            </div>
            <p className="mt-4 text-[12.5px] text-faint">
              Since {formatDisplayDate(r.start_date)}{r.end_date ? ` · until ${formatDisplayDate(r.end_date)}` : ""}
              {r.vehicle ? ` · ${r.vehicle.name || ""} ${r.vehicle.registration_no}` : ""}
            </p>
          </Paper>
          <div className="grid gap-4 sm:grid-cols-2">
            <ContactCard role="Driver" c={r.driver} />
            <ContactCard role="Attendant" c={r.attendant} />
          </div>
          {!!data?.stops?.length && (
            <Paper>
              <PaperHeader title="Stops on this route" />
              <ol className="px-5 py-3">
                {data.stops.map((s, i) => (
                  <li key={i} className="relative flex gap-3 pb-3 last:pb-0">
                    <div className="flex flex-col items-center">
                      <span className={`mt-1 h-2.5 w-2.5 rounded-full ${s.mine ? "bg-primary ring-4 ring-primary-soft" : "bg-line-strong"}`} />
                      {i < data.stops!.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
                    </div>
                    <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                      <span className={`truncate text-[14px] ${s.mine ? "text-primary" : "text-ink/80"}`}>{s.name}{s.mine ? " · your stop" : ""}</span>
                      <span className="shrink-0 tabular text-[12.5px] text-muted">{clock(s.pickup_time)}{s.drop_time ? ` / ${clock(s.drop_time)}` : ""}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </Paper>
          )}
        </div>
      )}
    </div>
  );
}

function TimeTile({ label, time }: { label: string; time: string | null }) {
  return (
    <div className="rounded-xl border border-line bg-sunken/40 px-4 py-3">
      <p className="flex items-center gap-1.5 text-[12px] uppercase tracking-[0.06em] text-faint"><Clock3 size={12} strokeWidth={STROKE} />{label}</p>
      <p className="mt-1 text-[22px] font-extralight text-ink">{time ? clock(time) : "—"}</p>
    </div>
  );
}

function ContactCard({ role, c }: { role: string; c: Contact | null }) {
  return (
    <Paper className="flex items-center gap-3 p-4">
      {c ? <Avatar name={c.name} src={c.photo_url} size={40} /> : <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sunken text-faint"><UserRound size={18} strokeWidth={STROKE} /></span>}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] uppercase tracking-[0.06em] text-faint">{role}</p>
        <p className="truncate text-[14.5px] text-ink">{c?.name || "Not assigned"}</p>
      </div>
      {c?.phone && (
        <a href={`tel:${c.phone}`} className="flex h-9 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-ink hover:border-line-strong">
          <Phone size={14} strokeWidth={STROKE} /> Call
        </a>
      )}
    </Paper>
  );
}
