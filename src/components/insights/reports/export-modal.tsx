"use client";

/*
 * Export a report: choose Excel, PDF or CSV, optionally protect the file with a password.
 * The file downloads straight away; a password, when one was made, is shown once.
 */
import { useState } from "react";
import { Check, Copy, FileSpreadsheet, FileText, FileType2, KeyRound, ShieldAlert } from "lucide-react";
import { Button, Checkbox, Field, Modal, ModalCancel, RadioCards, useToast } from "@/components/ui-kit";
import { downloadWithAuth } from "@/components/people/types";
import { errMsg, type ExportResponse, type Option } from "./types";

const ICONS: Record<string, typeof FileText> = { xlsx: FileSpreadsheet, pdf: FileText, csv: FileType2 };

export function ExportModal({ open, onClose, title, sensitive, formats, run }: {
  open: boolean; onClose: () => void; title: string; sensitive?: boolean; formats: Option[];
  run: (format: string, protect: boolean) => Promise<ExportResponse>;
}) {
  const toast = useToast();
  const [format, setFormat] = useState("xlsx");
  const [protect, setProtect] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const isProtected = protect ?? !!sensitive;

  async function go() {
    setBusy(true);
    try {
      const res = await run(format, isProtected);
      await downloadWithAuth(`/reports/exports/${res.uuid}/download`, res.file_name);
      toast.success(`Exported ${res.rows.toLocaleString("en-IN")} rows`);
      if (res.password) setPassword(res.password);
      onClose();
      setProtect(null);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Export" description={title} size="sm" busy={busy}
        footer={<><ModalCancel /><Button variant="primary" onClick={go} loading={busy}>Download</Button></>}>
        <div className="space-y-5">
          <Field label="File type">
            <RadioCards columns={1} value={format} onChange={setFormat}
              options={formats.map((f) => ({ value: f.value, label: f.label, icon: ICONS[f.value] ?? FileText }))} />
          </Field>
          <div className="space-y-2">
            <Checkbox checked={isProtected} onChange={setProtect} label="Protect with a password"
              description="The file opens only with a password shown to you once." />
            {sensitive && !isProtected && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 text-[12.5px] text-amber-800">
                <ShieldAlert size={14} strokeWidth={1.4} className="mt-0.5 shrink-0" />
                This report has private details such as pay or ID numbers. We suggest protecting it.
              </p>
            )}
          </div>
        </div>
      </Modal>
      <PasswordModal password={password} onClose={() => setPassword(null)} />
    </>
  );
}

export function PasswordModal({ password, onClose }: { password: string | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    if (!password) return;
    try { await navigator.clipboard.writeText(password); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* ignore */ }
  }
  return (
    <Modal open={!!password} onClose={() => { setCopied(false); onClose(); }} title="File password" size="sm"
      footer={<Button variant="primary" onClick={() => { setCopied(false); onClose(); }}>Done</Button>}>
      <div className="space-y-4">
        <p className="text-[13.5px] text-muted">Use this password to open the file. It won&apos;t be shown again, so keep it somewhere safe.</p>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-sunken/60 py-2 pl-3 pr-2">
          <KeyRound size={16} strokeWidth={1.4} className="shrink-0 text-faint" />
          <code className="min-w-0 flex-1 truncate font-mono text-[15px] tracking-wide text-ink">{password}</code>
          <Button size="sm" icon={copied ? Check : Copy} onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
        </div>
      </div>
    </Modal>
  );
}
