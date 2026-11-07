"use client";

/*
 * Reports: standard and saved reports by category, email schedules and export history.
 * ?report=<uuid> opens a report; ?standard=<key> opens a standard report by its key.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Tabs, useToast, type FilterValues } from "@/components/ui-kit";
import { PageHeader } from "@/components/shell/page";
import { api } from "@/lib/api";
import { ExportsTab } from "@/components/insights/reports/exports-tab";
import { ReportBuilder } from "@/components/insights/reports/report-builder";
import { ReportList } from "@/components/insights/reports/report-list";
import { ReportViewer } from "@/components/insights/reports/report-viewer";
import { SchedulesTab } from "@/components/insights/reports/schedules-tab";
import { errMsg, type Report, type ReportsMeta } from "@/components/insights/reports/types";

type Tab = "reports" | "schedules" | "exports";

export default function ReportsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const [meta, setMeta] = useState<ReportsMeta | null>(null);
  const [tab, setTab] = useState<Tab>(() => {
    const t = params.get("tab");
    return t === "schedules" || t === "exports" ? t : "reports";
  });
  const [reports, setReports] = useState<Report[] | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterValues>({});
  const [builder, setBuilder] = useState<{ open: boolean; uuid: string | null }>({ open: false, uuid: null });
  const [version, setVersion] = useState(0);
  const [standard, setStandard] = useState<{ key: string; uuid: string } | null>(null);

  const reportParam = params.get("report");
  const standardKey = params.get("standard");
  const viewing = reportParam ?? (standard && standard.key === standardKey ? standard.uuid : null);

  useEffect(() => {
    api.get<ReportsMeta>("/reports/meta").then(setMeta).catch((e) => toast.error(errMsg(e)));
  }, [toast]);

  const load = useCallback(() => {
    const q = new URLSearchParams();
    if (search.trim()) q.set("q", search.trim());
    if (filters.category?.[0]) q.set("category", filters.category[0]);
    if (filters.which?.[0]) q.set("which", filters.which[0]);
    const qs = q.toString();
    api.get<Report[]>(`/reports/${qs ? `?${qs}` : ""}`).then(setReports).catch((e) => { toast.error(errMsg(e)); setReports([]); });
  }, [search, filters, toast]);
  useEffect(() => { load(); }, [load]);

  // ?standard=<key>: find the standard report with that key
  useEffect(() => {
    if (!standardKey) return;
    api.get<Report[]>("/reports/?which=standard").then((rows) => {
      const r = rows.find((x) => x.key === standardKey);
      if (r) setStandard({ key: standardKey, uuid: r.uuid });
      else toast.error("That report isn't available to you.");
    }).catch((e) => toast.error(errMsg(e)));
  }, [standardKey, toast]);

  const go = (q: string) => router.replace(`/dashboard/reports${q}`, { scroll: false });
  const openReport = (uuid: string) => go(`?report=${uuid}`);
  const closeReport = () => { setStandard(null); go(tab === "reports" ? "" : `?tab=${tab}`); };
  const changeTab = (t: Tab) => { setTab(t); go(t === "reports" ? "" : `?tab=${t}`); };

  return (
    <div>
      <PageHeader eyebrow="Insights" title="Reports" description="Ready-made and your own reports. Open one to filter, chart, export or email it."
        actions={meta?.can_build && <Button variant="primary" icon={Plus} onClick={() => setBuilder({ open: true, uuid: null })}>New report</Button>} />
      <Tabs value={tab} onChange={changeTab} className="mb-5"
        items={[{ value: "reports", label: "Reports" }, { value: "schedules", label: "Schedules" }, { value: "exports", label: "Export history" }]} />

      {tab === "reports" && (
        <ReportList reports={reports} meta={meta} filters={filters} onFiltersChange={setFilters} search={search} onSearch={setSearch}
          onOpen={(r) => openReport(r.uuid)} onNew={meta?.can_build ? () => setBuilder({ open: true, uuid: null }) : undefined} />
      )}
      {tab === "schedules" && meta && <SchedulesTab meta={meta} reports={reports} onChanged={load} />}
      {tab === "exports" && meta && <ExportsTab meta={meta} />}

      {meta && (
        <>
          <ReportViewer uuid={viewing} version={version} meta={meta} onClose={closeReport} onChanged={load}
            onEdit={(uuid) => setBuilder({ open: true, uuid })}
            onCopied={(uuid) => { closeReport(); setBuilder({ open: true, uuid }); }}
            onDeleted={() => { closeReport(); load(); }} />
          <ReportBuilder open={builder.open} reportUuid={builder.uuid} meta={meta}
            onClose={() => setBuilder((b) => ({ ...b, open: false }))}
            onSaved={(r) => {
              setBuilder({ open: false, uuid: null });
              load();
              if (viewing === r.uuid) setVersion((v) => v + 1); else openReport(r.uuid);
            }} />
        </>
      )}
    </div>
  );
}
