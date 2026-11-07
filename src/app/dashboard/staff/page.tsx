"use client";

/*
 * Employee directory. The profile, add wizard and bulk actions open as modals over this
 * page (see staff-directory.tsx).
 */
import { Suspense } from "react";
import Link from "next/link";
import { Network, UserPlus } from "lucide-react";
import { PageHeader, btn } from "@/components/shell/page";
import { useAuth } from "@/lib/auth";
import StaffDirectory from "./staff-directory";

export default function EmployeesPage() {
  const { user } = useAuth();
  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Employees"
        description="Everyone in the company, with their job, stage and reporting line."
        actions={<>
          <Link href="/dashboard/org-chart" className={btn.ghost}><Network size={16} strokeWidth={1.4} /> Org chart</Link>
          {user?.role === "admin" && <Link href="/dashboard/staff?new=1" scroll={false} className={btn.primary}><UserPlus size={16} strokeWidth={1.4} /> Add employee</Link>}
        </>}
      />
      {/* useSearchParams needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <StaffDirectory />
      </Suspense>
    </div>
  );
}
