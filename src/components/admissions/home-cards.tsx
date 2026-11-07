"use client";

/*
 * Home page cards for admissions.
 *   <StaffHomeCard />                 open enquiries, applications this month, conversion
 *   <PortalHomeCard studentId={…} />  nothing for parents and students (returns null)
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FilePlus2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { Skeleton } from "@/components/ui-kit";

type Summary = { open_enquiries: number; follow_ups_due: number; applications_this_month: number; conversion_rate: number };

export function StaffHomeCard() {
  const { can } = useAccess();
  const allowed = can("admissions.view");
  const [s, setS] = useState<Summary | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!allowed) return;
    let live = true;
    api.get<Summary>("/admissions/summary").then((r) => { if (live) setS(r); }).catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [allowed]);
  if (!allowed || failed) return null;
  return (
    <div className="rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <p className="flex items-center gap-2 text-[15px] text-ink"><FilePlus2 size={16} strokeWidth={1.4} className="text-faint" />Admissions</p>
        <Link href="/dashboard/admissions" className="inline-flex items-center gap-1 text-[13px] text-primary">Open <ArrowRight size={14} strokeWidth={1.4} /></Link>
      </div>
      <div className="grid grid-cols-3 divide-x divide-line">
        {[
          { label: "Open enquiries", value: s?.open_enquiries, hint: s ? (s.follow_ups_due ? `${s.follow_ups_due} follow-ups due` : "No follow-ups due") : "", href: "/dashboard/admissions/enquiries" },
          { label: "Applications this month", value: s?.applications_this_month, hint: "", href: "/dashboard/admissions/applications" },
          { label: "Conversion", value: s ? `${s.conversion_rate}%` : undefined, hint: "enquiries to admissions", href: "/dashboard/admissions" },
        ].map((x) => (
          <Link key={x.label} href={x.href} className="flex flex-col gap-1.5 p-4 transition-colors hover:bg-sunken/50">
            <span className="text-[12.5px] text-muted">{x.label}</span>
            {s ? <span className="tabular text-[26px] font-extralight leading-none text-ink">{x.value}</span> : <Skeleton className="h-6 w-12" />}
            {x.hint && <span className={`text-[12px] ${x.label === "Open enquiries" && s?.follow_ups_due ? "text-amber-700" : "text-faint"}`}>{x.hint}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function PortalHomeCard(_props: { studentId?: number | null }) {
  return null;
}
