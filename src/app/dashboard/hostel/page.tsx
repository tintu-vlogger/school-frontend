"use client";

/*
 * Hostel: rooms and beds, boarders, night roll-call, leave and out-passes, visitors and
 * settings, one tab each (?tab=rooms|boarders|rollcall|leave|visitors|settings).
 */
import { useState } from "react";
import { BedDouble, CalendarClock, Moon, UsersRound } from "lucide-react";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { useUrlTab } from "@/lib/use-url-tab";
import { PageHeader } from "@/components/shell/page";
import { StatCard, Tabs } from "@/components/ui-kit";
import { useApiData } from "@/components/transport/common";
import { AllocateModal, BoardersTab, type AllocTarget } from "@/components/hostel/boarders";
import { LeaveTab } from "@/components/hostel/leave";
import { RollCallTab } from "@/components/hostel/rollcall";
import { RoomsTab } from "@/components/hostel/rooms";
import type { HostelSummary } from "@/components/hostel/types";
import { HostelSettingsTab, VisitorsTab } from "@/components/hostel/visitors";

const TABS = ["rooms", "boarders", "rollcall", "leave", "visitors", "settings"] as const;
type Tab = (typeof TABS)[number];

export default function HostelPage() {
  const { can } = useAccess();
  const { term } = useInstitution();
  const canManage = can("hostel.manage");
  const [tab, setTabState] = useState<Tab>("rooms");
  useUrlTab(TABS, setTabState);
  const setTab = (t: Tab) => {
    setTabState(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  };
  const summary = useApiData<HostelSummary>("/hostel/summary");
  const s = summary.data;
  const [alloc, setAlloc] = useState<{ open: boolean; target: AllocTarget; key: number }>({ open: false, target: {}, key: 0 });
  const [nonce, setNonce] = useState(0);
  const openAlloc = (target: AllocTarget) => setAlloc((a) => ({ open: true, target, key: a.key + 1 }));

  return (
    <div>
      <PageHeader eyebrow="Campus" title="Hostel" description={`Rooms and beds, boarders, roll-call and leave for ${term("students").toLowerCase()} who stay on campus.`} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Boarders" value={s?.occupied ?? "–"} icon={BedDouble} hint={s ? `${s.free} beds free of ${s.beds}` : undefined} onClick={() => setTab("boarders")} />
        <StatCard label="Tonight's roll-call" value={s ? (s.roll_call_taken ? `${s.absent_tonight} absent` : "Not taken") : "–"} icon={Moon} onClick={() => setTab("rollcall")} />
        <StatCard label="Leave waiting" value={s?.pending_leave ?? "–"} icon={CalendarClock} hint={s?.out_now ? `${s.out_now} away now` : undefined} onClick={() => setTab("leave")} />
        <StatCard label="Visitors inside" value={s?.visitors_inside ?? "–"} icon={UsersRound} onClick={() => setTab("visitors")} />
      </div>
      <Tabs className="mb-5" value={tab} onChange={setTab} items={[
        { value: "rooms", label: "Rooms" }, { value: "boarders", label: "Boarders" }, { value: "rollcall", label: "Roll-call" },
        { value: "leave", label: "Leave & out-passes", count: s?.pending_leave || undefined }, { value: "visitors", label: "Visitors" },
        { value: "settings", label: "Settings" },
      ]} />
      <div key={nonce}>
        {tab === "rooms" && <RoomsTab canManage={canManage} onAllocate={(uuid, label) => openAlloc({ bed: { uuid, label } })} />}
        {tab === "boarders" && <BoardersTab canManage={canManage} onAllocate={openAlloc} />}
        {tab === "rollcall" && <RollCallTab canManage={canManage} />}
        {tab === "leave" && <LeaveTab canManage={canManage} />}
        {tab === "visitors" && <VisitorsTab canManage={canManage} />}
        {tab === "settings" && <HostelSettingsTab canManage={canManage} />}
      </div>
      <AllocateModal key={alloc.key} open={alloc.open} target={alloc.target} onClose={() => setAlloc((a) => ({ ...a, open: false }))}
        onSaved={() => { setAlloc((a) => ({ ...a, open: false })); setNonce((n) => n + 1); summary.reload(); }} />
    </div>
  );
}
