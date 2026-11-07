"use client";

/*
 * Home page cards for fees.
 *   <StaffHomeCard />                 collected today, this month, outstanding, defaulters (fees.view)
 *   <PortalHomeCard studentId={id} /> amount due, next due date and a Pay button (parents / students)
 */
import Link from "next/link";
import { CalendarClock, IndianRupee, Wallet2 } from "lucide-react";
import { formatDate } from "@/lib/datetime";
import { Paper } from "@/components/shell/page";
import { Badge, Button, Skeleton } from "@/components/ui-kit";
import { type Money, money, n, useFetch } from "./shared";

type Summary = { currency: string; collected_today: Money; collected_month: Money; outstanding: Money; overdue: Money; defaulters: number };
type PortalSummary = { currency: string; total: Money; overdue: Money; next_due_date: string | null; next_due_amount: Money; next_title: string | null; online_enabled: boolean };

export function StaffHomeCard() {
  const { data, error } = useFetch<Summary>("/fees/summary");
  if (error) return null;
  const cur = data?.currency ?? "INR";
  const tiles: [string, string, string?][] = data ? [
    ["Collected today", money(data.collected_today, cur)], ["This month", money(data.collected_month, cur)],
    ["Outstanding", money(data.outstanding, cur), n(data.overdue) ? `${money(data.overdue, cur)} overdue` : undefined],
    ["Defaulters", String(data.defaulters)],
  ] : [];
  return (
    <Paper className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <p className="flex items-center gap-2 text-[15px] text-ink"><IndianRupee size={16} strokeWidth={1.4} className="text-faint" />Fees</p>
        <Link href="/dashboard/fees" className="text-[13px] text-primary">Open</Link>
      </div>
      {!data ? <Skeleton className="h-20 w-full" /> : (
        <div className="grid grid-cols-2 gap-4">
          {tiles.map(([label, value, hint]) => (
            <div key={label}>
              <p className="text-[12.5px] text-muted">{label}</p>
              <p className="tabular mt-1 text-[22px] font-extralight leading-tight text-ink">{value}</p>
              {hint && <p className="text-[12px] text-rose-700">{hint}</p>}
            </div>
          ))}
        </div>
      )}
    </Paper>
  );
}

export function PortalHomeCard({ studentId }: { studentId: number }) {
  const { data, error } = useFetch<PortalSummary>(studentId ? `/fees/portal/summary?student_id=${studentId}` : null);
  if (error) return null;
  const cur = data?.currency ?? "INR";
  return (
    <Paper className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-[15px] text-ink"><Wallet2 size={16} strokeWidth={1.4} className="text-faint" />Fees</p>
        {data && n(data.overdue) > 0 && <Badge tone="bad" dot>Overdue</Badge>}
      </div>
      {!data ? <Skeleton className="h-16 w-full" /> : n(data.total) === 0 ? (
        <p className="text-[14px] text-muted">Nothing due. Thank you!</p>
      ) : (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="tabular text-[26px] font-extralight leading-none text-ink">{money(data.total, cur)}</p>
            {data.next_due_date && <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted"><CalendarClock size={13} strokeWidth={1.4} />
              {data.next_title}: {money(data.next_due_amount, cur)} due {formatDate(data.next_due_date)}</p>}
          </div>
          <Link href="/dashboard/my/fees"><Button variant="primary" size="sm">{data.online_enabled ? "Pay" : "View"}</Button></Link>
        </div>
      )}
    </Paper>
  );
}
