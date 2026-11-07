"use client";

/* Export modal: pick what and how, download, and show the file password once if protected. */
import { useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, FileText, KeyRound, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { downloadWithAuth } from "@/components/people/types";
import { Button, Field, Modal, ModalCancel, RadioCards, Select, Toggle, useToast } from "@/components/ui-kit";
import { CopyValue } from "@/components/insights/integrations/copy";
import type { DataEntity, DataJob } from "./types";

type Result = DataJob & { export_uuid: string; password: string | null; file_name: string };

/** Mount with a fresh `key` per opening. */
export function ExportModal({ open, onClose, entities, initial, onDone }: {
  open: boolean; onClose: () => void; entities: DataEntity[]; initial: string | null; onDone: () => void;
}) {
  const toast = useToast();
  const [entity, setEntity] = useState<string | null>(initial ?? entities[0]?.key ?? null);
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const [protect, setProtect] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const download = (r: Result) =>
    downloadWithAuth(`/reports/exports/${r.export_uuid}/download`, r.file_name || `${r.entity}.${format}`)
      .catch((e: Error) => toast.error("Couldn't download", { description: e.message }));

  async function submit() {
    if (!entity) return;
    setBusy(true);
    try {
      const r = await api.post<Result>("/data/exports", { entity, format, protect });
      setResult(r);
      onDone();
      await download(r);
    } catch (e) {
      toast.error("Couldn't export", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const label = entities.find((e) => e.key === entity)?.label ?? "";

  return (
    <Modal open={open} onClose={onClose} size="md" busy={busy}
      title={result ? "Your export is ready" : "Export data"}
      description={result ? `${result.total.toLocaleString("en-IN")} ${label.toLowerCase()} rows` : "Download your records as a spreadsheet."}
      footer={result
        ? <><Button icon={Download} onClick={() => download(result)}>Download again</Button><Button variant="primary" onClick={onClose}>Done</Button></>
        : <><ModalCancel /><Button variant="primary" icon={Download} loading={busy} disabled={!entity} onClick={submit}>Export</Button></>}>
      {result ? (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <CheckCircle2 size={20} strokeWidth={1.4} className="text-emerald-600" />
            <p className="text-[14px] text-ink">{result.file_name} is downloading.</p>
          </div>
          {result.password && (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
              <p className="flex items-center gap-2 text-[14px] text-ink"><KeyRound size={16} strokeWidth={1.4} className="text-amber-700" /> File password</p>
              <CopyValue value={result.password} large />
              <p className="flex gap-2 text-[12.5px] text-amber-800">
                <ShieldAlert size={14} strokeWidth={1.4} className="mt-0.5 shrink-0" />
                Copy it now. It won&apos;t be shown again, and the file can&apos;t be opened without it.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          <Field label="What to export" required>
            <Select<string> value={entity} onChange={(v) => setEntity(v)}
              options={entities.map((e) => ({ value: e.key, label: e.label, description: e.description }))} />
          </Field>
          <Field label="Format">
            <RadioCards<"xlsx" | "csv"> value={format} onChange={setFormat} columns={2} options={[
              { value: "xlsx", label: "Excel", description: "Opens in Excel or Google Sheets", icon: FileSpreadsheet },
              { value: "csv", label: "CSV", description: "Plain text, for other systems", icon: FileText },
            ]} />
          </Field>
          <Toggle checked={protect} onChange={setProtect} label="Protect with a password"
            description="We create a password and show it to you once. Use it for files with personal or salary details." />
        </div>
      )}
    </Modal>
  );
}
