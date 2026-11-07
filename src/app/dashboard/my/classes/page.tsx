"use client";

/* Online classes (portal): upcoming live classes with Join, and past classes with recordings. */
import { useEffect, useState } from "react";
import Link from "next/link";
import { PlayCircle, Video } from "lucide-react";
import { api } from "@/lib/api";
import { formatLongDate, formatTime, formatRelative } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper } from "@/components/shell/page";
import { Badge, Button, Skeleton, Tabs } from "@/components/ui-kit";
import { ChildSwitcher, PhaseBadge, useChild } from "@/components/lms/shared";
import type { LiveClass } from "@/components/lms/lib";

export default function MyClassesPage() {
  const toast = useToast();
  const child = useChild();
  const [when, setWhen] = useState("upcoming");
  const [data, setData] = useState<{ key: string; items: LiveClass[]; canJoin: boolean } | null>(null);
  const sid = child.studentId;
  const key = `${sid}:${when}`;
  useEffect(() => {
    if (!sid) return;
    let live = true;
    const load = () => api.get<{ items: LiveClass[]; can_join: boolean }>(`/lms/portal/online-classes?student_id=${sid}&when=${when}`)
      .then((r) => live && setData({ key, items: r.items, canJoin: r.can_join }))
      .catch((e) => { toast.error(e.message); if (live) setData({ key, items: [], canJoin: false }); });
    load();
    const t = window.setInterval(load, 60_000); // keep "Join" in step with the clock
    return () => { live = false; window.clearInterval(t); };
  }, [key, sid, when, toast]);
  const d = data?.key === key ? data : null;
  const q = child.isParent && sid ? `?student_id=${sid}` : "";

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Online classes" description="Live classes with your teachers. Join opens a few minutes before the start." actions={<ChildSwitcher child={child} />} />
      <Tabs variant="pill" className="mb-4" value={when} onChange={setWhen} items={[{ value: "upcoming", label: "Upcoming" }, { value: "past", label: "Past" }]} />
      {!d ? <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div> : d.items.length === 0 ? (
        <Paper><EmptyState icon={Video} title={when === "upcoming" ? "No live classes coming up" : "No past classes"} hint={when === "upcoming" ? "When a teacher schedules a class, it appears here and you get a reminder." : undefined} /></Paper>
      ) : (
        <ul className="space-y-3">
          {d.items.map((c) => {
            const joinable = (c.phase === "open" || c.phase === "live") && d.canJoin;
            return (
              <li key={c.uuid} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] uppercase tracking-[0.06em] text-faint">{formatLongDate(c.starts_at)} · {formatTime(c.starts_at)}–{formatTime(c.ends_at)}</p>
                    <p className="mt-1 text-[15px] text-ink">{c.title}</p>
                    <p className="mt-0.5 text-[13px] text-muted">{[c.subject_name, c.teacher_name, c.provider_label].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {when === "past" ? (c.attended ? <Badge tone="good">Attended</Badge> : c.status !== "cancelled" ? <Badge>Missed</Badge> : null) : <PhaseBadge phase={c.phase} />}
                  </div>
                </div>
                {c.agenda && <p className="mt-2 line-clamp-2 text-[13px] text-ink/75">{c.agenda}</p>}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {when === "upcoming" && c.status !== "cancelled" && (joinable
                    ? <Link href={`/dashboard/my/classes/${c.uuid}/join${q}`}><Button variant="primary" icon={Video}>Join now</Button></Link>
                    : <span className="text-[13px] text-muted">{d.canJoin ? `Starts ${formatRelative(c.starts_at)}` : "Your child joins from their own sign-in."}</span>)}
                  {c.recording_url && <a href={c.recording_url} target="_blank" rel="noreferrer"><Button icon={PlayCircle}>Watch recording</Button></a>}
                  {c.cancel_reason && <span className="text-[13px] text-muted">Cancelled: {c.cancel_reason}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
