"use client";

/*
 * Face attendance (HR): flagged face checks to review, enrolled faces, which kiosks check
 * faces, and the settings (threshold, liveness, snapshots, locations, consent notice).
 */
import { useCallback, useEffect, useState } from "react";
import { Flag, MonitorSmartphone, ScanFace, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useUrlTab } from "@/lib/use-url-tab";
import { PageHeader } from "@/components/shell/page";
import { StatCard, StatGrid, Tabs } from "@/components/ui-kit";
import { EnrolmentsTab, KiosksTab, ReviewTab, SettingsTab, useFaceSettings } from "@/components/face_attendance/admin";

const TABS = [
  { value: "review", label: "Review" },
  { value: "enrolments", label: "Enrolled faces" },
  { value: "kiosks", label: "Kiosks" },
  { value: "settings", label: "Settings" },
] as const;
type Tab = (typeof TABS)[number]["value"];
type Summary = { enabled: boolean; enrolled: number; people: number; open_flags: number; kiosks_on: number; kiosks: number; week: Record<string, number> };

export default function FaceAttendancePage() {
  const [tab, setTab] = useState<Tab>("review");
  useUrlTab(TABS.map((t) => t.value), setTab);
  const { data: settings, load: reloadSettings } = useFaceSettings();
  const [sum, setSum] = useState<Summary | null>(null);
  const loadSum = useCallback(() => { api.get<Summary>("/face-attendance/summary").then(setSum).catch(() => {}); }, []);
  useEffect(() => { loadSum(); }, [loadSum]);
  const w = sum?.week ?? {};

  return (
    <>
      <PageHeader eyebrow="Time" title="Face attendance"
        description="Punch at the kiosk by looking at the camera. Consent first, templates encrypted, doubtful punches reviewed here." />
      <StatGrid className="mb-6">
        <StatCard label="To review" value={sum?.open_flags ?? "–"} icon={Flag} hint="Flagged face checks" onClick={() => setTab("review")} />
        <StatCard label="Enrolled" value={sum ? `${sum.enrolled} of ${sum.people}` : "–"} icon={ScanFace} hint="Active people with consent" onClick={() => setTab("enrolments")} />
        <StatCard label="Kiosks checking faces" value={sum ? `${sum.kiosks_on} of ${sum.kiosks}` : "–"} icon={MonitorSmartphone} hint={sum && !sum.enabled ? "Switched off for the company" : "Face first or required"} onClick={() => setTab("kiosks")} />
        <StatCard label="Face punches, 7 days" value={sum ? (w.face_punch ?? 0) + (w.selfie_match ?? 0) : "–"} icon={ShieldCheck}
          hint={sum ? `${w.pin_fallback ?? 0} PIN instead · ${(w.spoof ?? 0)} liveness failed` : undefined} />
      </StatGrid>
      <Tabs value={tab} onChange={setTab} items={TABS.map((t) => ({ value: t.value, label: t.label }))} className="mb-6" />
      {tab === "review" && <ReviewTab onChanged={loadSum} />}
      {tab === "enrolments" && <EnrolmentsTab settings={settings} onChanged={loadSum} />}
      {tab === "kiosks" && <KiosksTab settings={settings} />}
      {tab === "settings" && <SettingsTab settings={settings} onSaved={() => { reloadSettings(); loadSum(); }} />}
    </>
  );
}
