"use client";

/*
 * Overview (home). A role-aware bento of cards, each loading on its own:
 * - everyone: greeting, Ask box, Today (clock in/out), Needs your attention, leave balance,
 *   latest payslip, upcoming holidays, quick actions and the engagement strip;
 * - managers: who is in today and the team's requests;
 * - HR and admins: KPI strip, payroll status, hiring, onboarding/probation/exits,
 *   compliance due soon and headcount by department.
 * Admin calls are made only when /roles/my-permissions grants them, so nobody sees a refusal.
 * Parents and students get the portal home instead (child switcher and module cards); staff
 * see the institution KPIs and the school modules' cards above the HR cards.
 */
import type React from "react";
import { Skeleton } from "@/components/ui-kit";
import { useAccess } from "@/lib/access";
import { PortalHome, SchoolStaffHome } from "@/components/home/school-home";
import { TimezoneSuggestion } from "@/components/account/timezone";
import { EngagementOverview } from "@/components/engagement/home-overview";
import { HOME_STYLES, useHomeAccess } from "@/components/home/kit";
import { AskBox, HomeGreeting, QuickActions } from "@/components/home/extras";
import { TodayCard } from "@/components/home/today-card";
import { AttentionCard, HolidaysCard, LeaveCard, PayslipCard } from "@/components/home/self-cards";
import { TeamRequestsCard, TeamTodayCard } from "@/components/home/team-cards";
import {
  ComplianceCard, DepartmentsCard, HiringCard, KpiStrip, LifecycleCard, PayrollStatusCard,
} from "@/components/home/admin-cards";

const SPAN: Record<number, string> = { 1: "lg:col-span-12", 2: "lg:col-span-6", 3: "lg:col-span-4" };

export default function OverviewPage() {
  const { portalRole } = useAccess();
  return portalRole ? <PortalHome /> : <StaffOverview />;
}

function StaffOverview() {
  const access = useHomeAccess();
  const { can, isEmployee, isManager, isHr, ready } = access;
  const seesEveryone = can("time.attendance.manage");
  const showTeam = ready && (isManager || seesEveryone);

  type Slot = { key: string; render: (className: string, delay: number) => React.ReactNode };
  const adminRow: Slot[] = !ready ? [] : [
    can("payroll.view") && { key: "pay", render: (c: string, d: number) => <PayrollStatusCard className={c} delay={d} /> },
    can("talent.hiring.manage") && { key: "hire", render: (c: string, d: number) => <HiringCard className={c} delay={d} /> },
    (can("talent.onboarding.manage") || can("talent.probation.manage") || can("talent.exits.manage"))
      && { key: "life", render: (c: string, d: number) => <LifecycleCard access={access} className={c} delay={d} /> },
  ].filter(Boolean) as Slot[];
  const showCompliance = ready && (can("insights.compliance.view") || can("payroll.view"));
  const showDepts = ready && isHr;

  return (
    <div className="space-y-4 pb-6">
      <style>{HOME_STYLES}</style>
      <HomeGreeting />
      <TimezoneSuggestion showProfileLink />
      <AskBox isHr={isHr} />

      <SchoolStaffHome />

      {!ready ? <Skeleton className="h-[104px] w-full rounded-2xl" /> : isHr && <KpiStrip access={access} delay={60} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
        {isEmployee && (
          <div className="flex min-w-0 flex-col gap-4 md:col-span-1 lg:col-span-5">
            <TodayCard delay={80} />
            <HolidaysCard className="flex-1" delay={140} />
          </div>
        )}
        <AttentionCard isEmployee={isEmployee} className={isEmployee ? "md:col-span-1 lg:col-span-7" : "md:col-span-2 lg:col-span-7"} delay={120} />
        {!isEmployee && (showTeam
          ? <TeamTodayCard everyone={seesEveryone} className="md:col-span-2 lg:col-span-5" delay={160} />
          : !ready && <Skeleton className="h-72 rounded-2xl md:col-span-2 lg:col-span-5" />)}

        {isEmployee && <LeaveCard className="md:col-span-2 lg:col-span-8" delay={160} />}
        {isEmployee && <PayslipCard className="md:col-span-2 lg:col-span-4" delay={200} />}

        {isEmployee && showTeam && (
          <>
            <TeamTodayCard everyone={seesEveryone && !isManager} className={isManager ? "md:col-span-2 lg:col-span-7" : "md:col-span-2 lg:col-span-12"} delay={220} />
            {isManager && <TeamRequestsCard className="md:col-span-2 lg:col-span-5" delay={240} />}
          </>
        )}

        {adminRow.map((slot, i) => {
          const n = adminRow.length;
          const md = n === 1 || (n === 3 && i === 2) ? "md:col-span-2" : "md:col-span-1";
          return <div key={slot.key} className="contents">{slot.render(`${md} ${SPAN[n]}`, 240 + i * 40)}</div>;
        })}

        {showCompliance && <ComplianceCard className={`md:col-span-2 ${showDepts ? "lg:col-span-7" : "lg:col-span-12"}`} delay={320} />}
        {showDepts && <DepartmentsCard className={`md:col-span-2 ${showCompliance ? "lg:col-span-5" : "lg:col-span-12"}`} delay={360} />}

        {!isEmployee && <HolidaysCard className="md:col-span-1 lg:col-span-4" delay={380} />}
        {ready ? <QuickActions access={access} wide={isEmployee} className={isEmployee ? "md:col-span-2 lg:col-span-12" : "md:col-span-1 lg:col-span-8"} delay={400} />
          : <Skeleton className="h-56 rounded-2xl md:col-span-2 lg:col-span-12" />}
      </div>

      <div className="home-rise pt-2" style={{ animationDelay: "420ms" }}>
        <EngagementOverview />
      </div>
    </div>
  );
}
