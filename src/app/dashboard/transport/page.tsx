"use client";

/*
 * Transport: routes and stops, vehicles, drivers and attendants, riders and reports, one tab
 * each (?tab=routes|vehicles|crew|riders|reports). Add, edit and details open in modals.
 */
import { useState } from "react";
import { Bus, MapPinned, Route as RouteIcon, ShieldAlert, Users } from "lucide-react";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { useUrlTab } from "@/lib/use-url-tab";
import { PageHeader } from "@/components/shell/page";
import { StatCard, Tabs } from "@/components/ui-kit";
import { useApiData } from "@/components/transport/common";
import { CrewTab } from "@/components/transport/crew";
import { ReportsTab } from "@/components/transport/reports";
import { RidersTab } from "@/components/transport/riders";
import { RoutesTab } from "@/components/transport/routes";
import type { TransportSummary } from "@/components/transport/types";
import { VehiclesTab } from "@/components/transport/vehicles";

const TABS = ["routes", "vehicles", "crew", "riders", "reports"] as const;
type Tab = (typeof TABS)[number];

export default function TransportPage() {
  const { can } = useAccess();
  const { term } = useInstitution();
  const canManage = can("transport.manage");
  const [tab, setTabState] = useState<Tab>("routes");
  useUrlTab(TABS, setTabState);
  const setTab = (t: Tab) => {
    setTabState(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  };
  const { data: s } = useApiData<TransportSummary>("/transport/summary");

  return (
    <div>
      <PageHeader eyebrow="Campus" title="Transport" description={`Routes and stops, vehicles and crew, and which ${term("students").toLowerCase()} ride where.`} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Riders" value={s?.riders ?? "–"} icon={Users} hint={s ? `of ${s.seats} seats` : undefined} onClick={() => setTab("riders")} />
        <StatCard label="Routes" value={s?.routes ?? "–"} icon={RouteIcon} hint={s?.full_routes ? `${s.full_routes} full` : undefined} onClick={() => setTab("routes")} />
        <StatCard label="Vehicles" value={s?.vehicles ?? "–"} icon={Bus} onClick={() => setTab("vehicles")} />
        <StatCard label="Renewals due" value={s?.expiring ?? "–"} icon={ShieldAlert} hint={s?.expired ? `${s.expired} expired` : "next 30 days"} onClick={() => setTab("reports")} />
      </div>
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[
        { value: "routes", label: "Routes", icon: MapPinned }, { value: "vehicles", label: "Vehicles" },
        { value: "crew", label: "Drivers & attendants" }, { value: "riders", label: "Riders" }, { value: "reports", label: "Reports" },
      ]} />
      {tab === "routes" && <RoutesTab canManage={canManage} />}
      {tab === "vehicles" && <VehiclesTab canManage={canManage} />}
      {tab === "crew" && <CrewTab canManage={canManage} />}
      {tab === "riders" && <RidersTab canManage={canManage} />}
      {tab === "reports" && <ReportsTab canManage={canManage} />}
    </div>
  );
}
