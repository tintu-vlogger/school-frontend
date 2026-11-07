"use client";

/*
 * Library: catalogue, circulation desk, members, overdue books and fines, holds, stock
 * checks, reports and settings, one tab each (?tab= keeps the tab in the address).
 */
import { useState } from "react";
import { AlarmClock, BookCopy, BookOpen, Hourglass, IndianRupee, Library } from "lucide-react";
import { useAccess } from "@/lib/access";
import { useUrlTab } from "@/lib/use-url-tab";
import { PageHeader } from "@/components/shell/page";
import { StatCard, Tabs } from "@/components/ui-kit";
import { CatalogueTab } from "@/components/library/catalogue";
import { DeskTab } from "@/components/library/desk";
import { MembersTab } from "@/components/library/members";
import { FinesTab } from "@/components/library/fines";
import { HoldsTab, StockTab } from "@/components/library/holds-stock";
import { ReportsTab, SettingsTab } from "@/components/library/reports-settings";
import { inr, useGet } from "@/components/library/common";

const TABS = ["catalogue", "desk", "members", "fines", "holds", "stock", "reports", "settings"] as const;
type Tab = (typeof TABS)[number];

type Summary = {
  titles: number; copies: number; available: number; on_loan: number; overdue: number; due_today: number; issued_today: number;
  returned_today: number; fines_pending: string; holds: number;
};

export default function LibraryPage() {
  const { can } = useAccess();
  const canManage = can("library.manage");
  const canCirculate = can("library.circulate", "library.manage");
  const [tab, setTabState] = useState<Tab>(canCirculate ? "desk" : "catalogue");
  useUrlTab(TABS, setTabState);
  const setTab = (t: Tab) => {
    setTabState(t);
    const u = new URL(window.location.href);
    u.searchParams.set("tab", t);
    window.history.replaceState(null, "", u.toString());
  };
  const s = useGet<Summary>(`/library/summary?t=${tab}`);
  const d = s.data;

  return (
    <div>
      <PageHeader eyebrow="Campus" title="Library" description="Catalogue, issue and return at the desk, fines, holds and stock checks." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Titles" value={d?.titles ?? "—"} icon={Library} hint={d ? `${d.copies} copies` : undefined} />
        <StatCard label="On loan" value={d?.on_loan ?? "—"} icon={BookOpen} hint={d ? `${d.issued_today} issued today` : undefined} onClick={() => setTab("desk")} />
        <StatCard label="Overdue" value={d?.overdue ?? "—"} icon={AlarmClock} hint={d ? `${d.due_today} due today` : undefined} onClick={() => setTab("fines")} />
        <StatCard label="Fines due" value={d ? inr(d.fines_pending) : "—"} icon={IndianRupee} onClick={() => setTab("fines")} />
        <StatCard label="Reservations" value={d?.holds ?? "—"} icon={Hourglass} hint={d ? `${d.available} copies on shelf` : undefined} onClick={() => setTab("holds")} className="col-span-2 lg:col-span-1" />
      </div>
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[
        { value: "catalogue", label: "Catalogue", icon: BookCopy },
        { value: "desk", label: "Circulation desk" },
        { value: "members", label: "Members" },
        { value: "fines", label: "Overdue & fines", count: d?.overdue || undefined },
        { value: "holds", label: "Holds" },
        { value: "stock", label: "Stock check" },
        { value: "reports", label: "Reports" },
        { value: "settings", label: "Settings" },
      ]} />
      {tab === "catalogue" && <CatalogueTab canManage={canManage} />}
      {tab === "desk" && <DeskTab canCirculate={canCirculate} canManage={canManage} />}
      {tab === "members" && <MembersTab canManage={canManage} />}
      {tab === "fines" && <FinesTab canCirculate={canCirculate} canManage={canManage} />}
      {tab === "holds" && <HoldsTab canCirculate={canCirculate} />}
      {tab === "stock" && <StockTab canManage={canManage} canCirculate={canCirculate} />}
      {tab === "reports" && <ReportsTab />}
      {tab === "settings" && <SettingsTab canManage={canManage} />}
    </div>
  );
}
