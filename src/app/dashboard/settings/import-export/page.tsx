"use client";

/*
 * Settings > Import and export: bring records in from Excel/CSV with a checked, step-by-step
 * import, export them as spreadsheets, and see the history of both.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Briefcase, Building2, CalendarDays, Clock, Download, FileDown, FileSpreadsheet, IndianRupee, Laptop, ListTree, Plane, Upload, Users,
} from "lucide-react";
import { api } from "@/lib/api";
import { EmptyState, PageHeader } from "@/components/shell/page";
import { Button, Skeleton, useToast, type IconType } from "@/components/ui-kit";
import { ImportWizard, templateDownload } from "@/components/insights/dataio/import-wizard";
import { ExportModal } from "@/components/insights/dataio/export-modal";
import { JobHistory } from "@/components/insights/dataio/history";
import type { DataEntity, EntitiesResponse } from "@/components/insights/dataio/types";

const ICONS: Record<string, IconType> = {
  employees: Users, salaries: IndianRupee, leave_balances: Plane, attendance_punches: Clock, holidays: CalendarDays,
  assets: Laptop, masters: ListTree, departments: Building2, designations: Briefcase,
};

export default function ImportExportPage() {
  const toast = useToast();
  const [data, setData] = useState<EntitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<{ entity: DataEntity; n: number } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState<{ entity: string | null; n: number } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let live = true;
    api.get<EntitiesResponse>("/data/entities")
      .then((r) => { if (live) setData(r); })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);
  const bump = useCallback(() => setRefresh((n) => n + 1), []);

  const entities = data?.entities ?? [];
  const exportable = entities.filter((e) => e.can_export);

  const startImport = (entity: DataEntity) => { setImporting((s) => ({ entity, n: (s?.n ?? 0) + 1 })); setImportOpen(true); };
  const startExport = (entity: string | null) => { setExporting((s) => ({ entity, n: (s?.n ?? 0) + 1 })); setExportOpen(true); };

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Import and export"
        description="Bring records in from Excel or CSV, or take them out as a spreadsheet. Every import is checked before anything changes."
        actions={exportable.length > 0 && <Button icon={FileDown} onClick={() => startExport(null)}>Export data</Button>}
      />

      {error && !data ? (
        <div className="rounded-2xl border border-line bg-surface"><EmptyState icon={FileSpreadsheet} title="Import and export isn't available" hint={error} /></div>
      ) : (
        <div className="space-y-10">
          <section>
            {!data ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} className="rounded-2xl border border-line bg-surface p-5"><Skeleton className="h-4 w-32" /><Skeleton className="mt-3 h-3 w-full" /><Skeleton className="mt-5 h-8 w-48" /></div>
                ))}
              </div>
            ) : entities.length === 0 ? (
              <div className="rounded-2xl border border-line bg-surface">
                <EmptyState icon={FileSpreadsheet} title="Nothing you can import or export" hint="Ask an HR admin if you need access." />
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {entities.map((e) => {
                  const Icon = ICONS[e.key] ?? FileSpreadsheet;
                  return (
                    <div key={e.key} className="flex flex-col rounded-2xl border border-line bg-surface p-5">
                      <div className="flex items-start gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted"><Icon size={17} strokeWidth={1.4} /></span>
                        <div className="min-w-0">
                          <p className="text-[15px] text-ink">{e.label}</p>
                          <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{e.description}</p>
                        </div>
                      </div>
                      <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                        {e.can_import && <Button size="sm" variant="primary" icon={Upload} onClick={() => startImport(e)}>Import</Button>}
                        {e.can_export && <Button size="sm" icon={Download} onClick={() => startExport(e.key)}>Export</Button>}
                        {e.can_import && (
                          <Button size="sm" variant="ghost" icon={FileSpreadsheet}
                            onClick={() => templateDownload(e).catch((err: Error) => toast.error("Couldn't download", { description: err.message }))}>
                            Template
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {data && entities.length > 0 && <JobHistory refresh={refresh} />}
        </div>
      )}

      {importing && data && (
        <ImportWizard key={importing.n} entity={importing.entity} limits={data} modes={data.modes}
          open={importOpen} onClose={() => { setImportOpen(false); bump(); }} onFinished={bump} />
      )}
      {exporting && (
        <ExportModal key={exporting.n} open={exportOpen} onClose={() => setExportOpen(false)}
          entities={exportable} initial={exporting.entity} onDone={bump} />
      )}
    </div>
  );
}
