"use client";

/*
 * Shifts & attendance settings: shift master, attendance rules (versioned), work from
 * home categories and limits, permission hours, request policies, rest rules, clock-in and
 * office locations, work arrangements and the pay period. Policy changes are saved as a
 * new version from a date, so earlier days keep the rules they were worked out with.
 */
import { useState } from "react";
import { useUrlTab } from "@/lib/use-url-tab";
import { PageHeader } from "@/components/shell/page";
import { Tabs } from "@/components/ui-kit";
import { ShiftsTab } from "@/components/attendance/settings-shifts";
import { RulesTab } from "@/components/attendance/settings-rules";
import {
  ClockInTab, PayPeriodTab, PermissionTab, RequestsTab, RestRulesTab, WfhTab,
} from "@/components/attendance/settings-policies";
import { ArrangementsTab } from "@/components/attendance/settings-arrangements";
import { AutoShiftTab, KiosksTab, LeaveLinkTab, RegistersTab } from "@/components/attendance/settings-links";

const TABS = [
  { value: "shifts", label: "Shifts" },
  { value: "rules", label: "Attendance rules" },
  { value: "wfh", label: "Work from home" },
  { value: "permission", label: "Permission hours" },
  { value: "requests", label: "Requests" },
  { value: "rest", label: "Rest rules" },
  { value: "clock", label: "Clock-in" },
  { value: "arrangements", label: "Work arrangements" },
  { value: "period", label: "Pay period" },
  { value: "leave", label: "Attendance and leave" },
  { value: "auto", label: "Auto shift" },
  { value: "kiosks", label: "Kiosks" },
  { value: "registers", label: "Statutory registers" },
] as const;
type Tab = (typeof TABS)[number]["value"];

export default function AttendanceSettingsPage() {
  const [tab, setTab] = useState<Tab>("shifts");
  useUrlTab(TABS.map((t) => t.value), setTab);
  return (
    <>
      <PageHeader eyebrow="Settings" title="Shifts & attendance"
        description="Shifts, attendance rules and the limits on requests. Changes to rules start from a date you choose." />
      <Tabs value={tab} onChange={setTab} items={TABS.map((t) => ({ value: t.value, label: t.label }))} className="mb-6" />
      {tab === "shifts" && <ShiftsTab />}
      {tab === "rules" && <RulesTab />}
      {tab === "wfh" && <WfhTab />}
      {tab === "permission" && <PermissionTab />}
      {tab === "requests" && <RequestsTab />}
      {tab === "rest" && <RestRulesTab />}
      {tab === "clock" && <ClockInTab />}
      {tab === "arrangements" && <ArrangementsTab />}
      {tab === "period" && <PayPeriodTab />}
      {tab === "leave" && <LeaveLinkTab />}
      {tab === "auto" && <AutoShiftTab />}
      {tab === "kiosks" && <KiosksTab />}
      {tab === "registers" && <RegistersTab />}
    </>
  );
}
