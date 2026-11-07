"use client";

/*
 * Documents: company files, policies (read and acknowledge, or manage), my documents
 * (letters, files from HR, signing, letter requests), my locker and settings.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, FolderOpen, Lock, ScrollText, Settings2, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUrlTab } from "@/lib/use-url-tab";
import { PageHeader } from "@/components/shell/page";
import { Button, Skeleton, Tabs } from "@/components/ui-kit";
import { FilesTab } from "@/components/documents/files-tab";
import { PoliciesTab } from "@/components/documents/policies-tab";
import { MyDocumentsTab } from "@/components/documents/mydocs-tab";
import { DocumentSettingsTab } from "@/components/documents/settings-tab";

type Tab = "files" | "policies" | "mine" | "locker" | "settings";
const TABS: Tab[] = ["files", "policies", "mine", "locker", "settings"];

export default function DocumentsPage() {
  const { user } = useAuth();
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [pending, setPending] = useState<{ policies: number; signatures: number }>({ policies: 0, signatures: 0 });
  const isEmployee = !!user?.employee_id;
  const [tab, setTab] = useState<Tab>("files");
  useUrlTab(TABS, setTab);
  useEffect(() => {
    api.get<{ can_manage: boolean }>("/documents/folders?area=company").then((r) => setCanManage(r.can_manage)).catch(() => setCanManage(false));
    api.get<{ policies: number; signatures: number }>("/documents/me/pending-count").then(setPending).catch(() => {});
  }, []);
  useEffect(() => { if (canManage === false && tab === "settings") setTab("files"); }, [canManage, tab]);

  const items = [
    { value: "files" as const, label: "Company files", icon: FolderOpen },
    { value: "policies" as const, label: "Policies", icon: ScrollText, count: pending.policies || undefined },
    ...(isEmployee ? [
      { value: "mine" as const, label: "My documents", icon: UserRound, count: pending.signatures || undefined },
      { value: "locker" as const, label: "My locker", icon: Lock },
    ] : []),
    ...(canManage ? [{ value: "settings" as const, label: "Settings", icon: Settings2 }] : []),
  ];

  return (
    <div>
      <PageHeader eyebrow="Documents" title="Files and policies"
        description="Company files, policies to read and acknowledge, and your letters and personal documents."
        actions={canManage && <Link href="/dashboard/documents/letters"><Button icon={FileText}>Letters</Button></Link>} />
      <Tabs className="mb-6" items={items} value={tab} onChange={setTab} />
      {canManage === null ? <Skeleton className="h-96 w-full" /> : (
        <>
          {tab === "files" && <FilesTab canManage={canManage} />}
          {tab === "policies" && <PoliciesTab canManage={canManage} />}
          {tab === "mine" && isEmployee && <MyDocumentsTab />}
          {tab === "locker" && isEmployee && <FilesTab area="personal" canManage={false} />}
          {tab === "settings" && canManage && <DocumentSettingsTab />}
        </>
      )}
    </div>
  );
}
