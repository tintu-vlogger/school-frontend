"use client";

/*
 * Home page cards for the communication module.
 *   <StaffHomeCard />                    latest notices, unread messages, today's events (GET /comms/summary)
 *   <PortalHomeCard studentId={id} />    latest notices for the child, unread messages, upcoming events,
 *                                        next parent-teacher meeting (GET /comms/portal/summary)
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Handshake, Megaphone, MessagesSquare, Pin } from "lucide-react";
import { api } from "@/lib/api";
import { formatRelative, formatTime } from "@/lib/datetime";
import { Paper, PaperHeader } from "@/components/shell/page";
import { Skeleton } from "@/components/ui-kit";
import { CATEGORY_DOT, eventWhen, type CalEvent, type Notice } from "./shared";

type StaffSummary = { notices: Notice[]; unread_notices: number; unread_messages: number; today: CalEvent[]; upcoming: CalEvent[] };
type PortalSummary = { notices: Notice[]; unread_notices: number; unread_messages: number; events: CalEvent[];
  next_meeting: { start_at: string; teacher_name: string | null; mode: string } | null };

function Counter({ href, icon: Icon, label, n }: { href: string; icon: typeof Megaphone; label: string; n: number }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 transition-colors hover:border-line-strong">
      <Icon size={17} strokeWidth={1.4} className={n ? "text-primary" : "text-faint"} />
      <span className="min-w-0 flex-1 truncate text-[13px] text-muted">{label}</span>
      <span className={`tabular text-[18px] font-extralight ${n ? "text-ink" : "text-faint"}`}>{n}</span>
    </Link>
  );
}

function NoticeList({ rows, href }: { rows: Notice[]; href: string }) {
  if (!rows.length) return <p className="text-[13px] text-muted">No notices right now.</p>;
  return (
    <ul className="space-y-2.5">
      {rows.map((n) => (
        <li key={n.uuid}>
          <Link href={`${href}?view=${n.uuid}`} className="group flex items-start gap-2.5">
            <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${n.read_at ? "bg-line-strong" : "bg-primary"}`} />
            <span className="min-w-0 flex-1">
              <span className={`flex items-center gap-1 truncate text-[13.5px] group-hover:text-primary ${n.read_at ? "text-ink/80" : "text-ink"}`}>
                {n.pinned && <Pin size={12} strokeWidth={1.4} className="shrink-0 text-primary" />}{n.title}
              </span>
              <span className="block text-[12px] text-faint">{n.category_label} · {n.published_at ? formatRelative(n.published_at) : ""}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function EventList({ rows }: { rows: CalEvent[] }) {
  return (
    <ul className="space-y-2">
      {rows.map((e) => (
        <li key={e.uuid} className="flex items-start gap-2.5">
          <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${CATEGORY_DOT[e.category] ?? "bg-indigo-500"}`} />
          <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] text-ink/90">{e.title}</span><span className="block text-[12px] text-faint">{eventWhen(e)}</span></span>
        </li>
      ))}
    </ul>
  );
}

export function StaffHomeCard() {
  const [s, setS] = useState<StaffSummary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { api.get<StaffSummary>("/comms/summary").then(setS).catch(() => setFailed(true)); }, []);
  if (failed) return null;
  return (
    <Paper>
      <PaperHeader title="Notices & messages" action={<Link href="/dashboard/comms/notices" className="text-[13px] text-primary hover:underline">Open</Link>} />
      {!s ? <div className="space-y-3 p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-20 w-full" /></div> : (
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-2">
            <Counter href="/dashboard/comms/messages" icon={MessagesSquare} label="Unread messages" n={s.unread_messages} />
            <Counter href="/dashboard/comms/notices" icon={Megaphone} label="Unread notices" n={s.unread_notices} />
          </div>
          <div>
            <p className="mb-2 text-[12.5px] text-muted">Latest notices</p>
            <NoticeList rows={s.notices} href="/dashboard/comms/notices" />
          </div>
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-[12.5px] text-muted"><CalendarDays size={13} strokeWidth={1.4} />Today</p>
            {s.today.length ? <EventList rows={s.today} /> : <p className="text-[13px] text-muted">Nothing on the calendar today.{s.upcoming[0] ? ` Next: ${s.upcoming[0].title}, ${eventWhen(s.upcoming[0]).split(" · ")[0]}.` : ""}</p>}
          </div>
        </div>
      )}
    </Paper>
  );
}

export function PortalHomeCard({ studentId }: { studentId?: number | null }) {
  const [s, setS] = useState<PortalSummary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const p = studentId ? `?student_id=${studentId}` : "";
    api.get<PortalSummary>(`/comms/portal/summary${p}`).then(setS).catch(() => setFailed(true));
  }, [studentId]);
  if (failed) return null;
  return (
    <Paper>
      <PaperHeader title="School updates" action={<Link href="/dashboard/my/notices" className="text-[13px] text-primary hover:underline">All notices</Link>} />
      {!s ? <div className="space-y-3 p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-20 w-full" /></div> : (
        <div className="space-y-5 p-5">
          <div className="grid grid-cols-2 gap-2">
            <Counter href="/dashboard/my/notices" icon={Megaphone} label="New notices" n={s.unread_notices} />
            <Counter href="/dashboard/my/messages" icon={MessagesSquare} label="Unread messages" n={s.unread_messages} />
          </div>
          {s.next_meeting && (
            <Link href="/dashboard/my/meetings" className="flex items-center gap-3 rounded-xl bg-primary-soft/50 px-3 py-2.5 text-[13.5px] text-ink">
              <Handshake size={17} strokeWidth={1.4} className="text-primary" />
              <span>Meeting with {s.next_meeting.teacher_name} · {formatRelative(s.next_meeting.start_at)}, {formatTime(s.next_meeting.start_at)}</span>
            </Link>
          )}
          <div><p className="mb-2 text-[12.5px] text-muted">Latest notices</p><NoticeList rows={s.notices} href="/dashboard/my/notices" /></div>
          {s.events.length > 0 && (
            <div>
              <p className="mb-2 flex items-center justify-between text-[12.5px] text-muted"><span>Coming up</span><Link href="/dashboard/my/events" className="text-primary hover:underline">Calendar</Link></p>
              <EventList rows={s.events} />
            </div>
          )}
        </div>
      )}
    </Paper>
  );
}
