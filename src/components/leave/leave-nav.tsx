"use client";

/*
 * Tabs across the leave pages (My leave, Team, Admin, Reports), shown according to what
 * the signed-in person may do. Also exports useLeaveAccess() for the pages.
 */
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, CalendarDays, Plane, ShieldCheck, Users } from "lucide-react";
import { api } from "@/lib/api";
import { Tabs } from "@/components/ui-kit";
import type { LeaveAccess } from "./types";

let cached: LeaveAccess | null = null;

export function useLeaveAccess() {
  const [acc, setAcc] = useState<LeaveAccess | null>(cached);
  useEffect(() => {
    api.get<LeaveAccess>("/leave/access").then((a) => { cached = a; setAcc(a); }).catch(() => {});
  }, []);
  return acc;
}

export function LeaveNav({ access }: { access: LeaveAccess | null }) {
  const router = useRouter();
  const path = usePathname();
  const items = [
    ...(access?.employee_id ? [{ value: "/dashboard/leave", label: "My leave", icon: Plane }] : []),
    { value: "/dashboard/leave/team", label: "Team calendar", icon: Users },
    { value: "/dashboard/holidays", label: "Holidays", icon: CalendarDays },
    ...(access?.can_manage ? [{ value: "/dashboard/leave/admin", label: "Leave admin", icon: ShieldCheck }] : []),
    ...(access?.can_manage || access?.can_approve ? [{ value: "/dashboard/leave/reports", label: "Reports", icon: BarChart3 }] : []),
  ];
  const current = items.find((i) => i.value === path)?.value ?? items[0]?.value ?? "/dashboard/leave";
  if (!access) return <div className="mb-6 h-10" />;
  return <Tabs value={current} onChange={(v) => router.push(v)} items={items} className="mb-6" />;
}
