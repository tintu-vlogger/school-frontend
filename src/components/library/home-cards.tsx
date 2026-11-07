"use client";

/*
 * Home page cards for the library.
 *   <StaffHomeCard />                  books on loan, overdue, due today, fines (staff with library.view)
 *   <PortalHomeCard studentId={id} />  a learner's books and next due date (null when nothing applies)
 */
import Link from "next/link";
import { AlarmClock, Library } from "lucide-react";
import { formatDate } from "@/lib/datetime";
import { useAccess } from "@/lib/access";
import { CardSkeleton, HomeCard, Unavailable, useLoad } from "@/components/home/kit";
import { inr } from "./common";

type Summary = { titles: number; copies: number; available: number; on_loan: number; overdue: number; due_today: number; issued_today: number; returned_today: number; fines_pending: string; holds: number };
type PortalSummary = { on_loan: number; overdue: number; fines_due: string; next_due: { title: string; due_on: string } | null; ready_holds: number };

export function StaffHomeCard({ className = "", delay = 0 }: { className?: string; delay?: number }) {
  const { can } = useAccess();
  const allowed = can("library.view");
  const { data, loading, error } = useLoad<Summary>(allowed ? "/library/summary" : null, 60);
  if (!allowed) return null;
  return (
    <HomeCard title="Library" icon={Library} href="/dashboard/library" link="Open" className={className} delay={delay}>
      {loading && !data ? <CardSkeleton rows={2} /> : error || !data ? <Unavailable /> : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pb-5 pt-3">
          <Num label="On loan" value={data.on_loan} hint={`${data.issued_today} issued today`} />
          <Num label="Overdue" value={data.overdue} bad={data.overdue > 0} href="/dashboard/library?tab=fines" />
          <Num label="Due today" value={data.due_today} />
          <Num label="Fines due" value={inr(data.fines_pending)} href="/dashboard/library?tab=fines" />
        </div>
      )}
    </HomeCard>
  );
}

function Num({ label, value, hint, bad, href }: { label: string; value: React.ReactNode; hint?: string; bad?: boolean; href?: string }) {
  const body = (
    <>
      <p className={`tabular text-[22px] font-extralight leading-tight ${bad ? "text-rose-700" : "text-ink"}`}>{value}</p>
      <p className="text-[12px] text-faint">{label}{hint ? ` · ${hint}` : ""}</p>
    </>
  );
  return href ? <Link href={href} className="block rounded-lg hover:bg-sunken/50">{body}</Link> : <div>{body}</div>;
}

export function PortalHomeCard({ studentId, className = "", delay = 0 }: { studentId: number; className?: string; delay?: number }) {
  const { data } = useLoad<PortalSummary>(studentId ? `/library/portal/summary?student_id=${studentId}` : null, 60);
  if (!data || (data.on_loan === 0 && Number(data.fines_due) === 0 && data.ready_holds === 0)) return null;
  return (
    <HomeCard title="Library" icon={Library} href="/dashboard/my/library" link="My books" className={className} delay={delay}>
      <div className="space-y-2 px-5 pb-5 pt-3 text-[13.5px]">
        <p className="text-ink">{data.on_loan} {data.on_loan === 1 ? "book" : "books"} on loan</p>
        {data.next_due && <p className="text-muted">Next due: {data.next_due.title}, {formatDate(data.next_due.due_on)}</p>}
        {data.overdue > 0 && <p className="flex items-center gap-1.5 text-rose-700"><AlarmClock size={14} strokeWidth={1.4} />{data.overdue} overdue</p>}
        {data.ready_holds > 0 && <p className="text-primary">{data.ready_holds} reserved {data.ready_holds === 1 ? "book is" : "books are"} ready to collect</p>}
        {Number(data.fines_due) > 0 && <p className="text-muted">Fines due {inr(data.fines_due)}</p>}
      </div>
    </HomeCard>
  );
}
