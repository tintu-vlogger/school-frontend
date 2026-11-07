"use client";

/*
 * Pay run → Pay salaries: check and make the salary bank files (split by debit account and by
 * what each bank needs), see problems with bank details, and download any file made before.
 * Used by src/app/dashboard/payroll/runs/[uuid]/page.tsx.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileText, Landmark } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDateTime } from "@/lib/datetime";
import { Badge, Button, Checkbox, Field, Modal, ModalCancel, Select, useConfirm } from "@/components/ui-kit";
import { downloadWithAuth, errMsg, inr } from "@/components/payroll/common";
import { groupLabel, useBankFormats } from "@/components/payroll/bank-settings";

type Check = {
  files: { debit_account: string; debit_masked: string; format_key: string; format_name: string; group: string; count: number; total: string; modes: Record<string, number> }[];
  problems: { level: "error" | "warn"; code: string; message: string; name: string; employee_code: string }[];
  blocking: string[]; errors: number; warnings: number;
};
type Made = {
  uuid: string; file_name: string; format_name: string; group: string; count: number; total: string; debit_account: string | null;
  sha256: string; status: string; left_out: { name: string; reason: string }[]; download_count: number; created_by: string | null;
  created_at: string; released_only: boolean;
};

const MODE_SHORT: Record<string, string> = { internal: "same bank", neft: "NEFT", rtgs: "RTGS", imps: "IMPS" };

export function BankFilesPanel({ runUuid, heldCount }: { runUuid: string; heldCount: number }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState<Made[]>([]);
  const load = useCallback(() => api.get<{ items: Made[] }>(`/payroll/bank/runs/${runUuid}/files`).then((r) => setMade(r.items)).catch(() => {}), [runUuid]);
  useEffect(() => { load(); }, [load]);
  const current = made.filter((m) => m.status === "generated");
  const dl = (m: Made) => downloadWithAuth(`/payroll/bank/files/${m.uuid}/download`, m.file_name).then(load).catch((e) => toast.error(errMsg(e)));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" icon={Landmark} onClick={() => setOpen(true)}>Make bank files</Button>
        {heldCount > 0 && <span className="text-[13px] text-amber-700">{heldCount} salary(ies) on hold are left out until released.</span>}
      </div>
      {current.length > 0 && (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {current.map((m) => <FileRow key={m.uuid} m={m} onDownload={() => dl(m)} />)}
        </ul>
      )}
      {made.length > current.length && (
        <details>
          <summary className="cursor-pointer text-[13px] text-muted hover:text-ink">Earlier files ({made.length - current.length})</summary>
          <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
            {made.filter((m) => m.status !== "generated").map((m) => <FileRow key={m.uuid} m={m} onDownload={() => dl(m)} />)}
          </ul>
        </details>
      )}
      {open && <MakeFiles runUuid={runUuid} onClose={() => setOpen(false)} onMade={() => { setOpen(false); load(); }} />}
    </div>
  );
}

function FileRow({ m, onDownload }: { m: Made; onDownload: () => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-[14px] text-ink"><FileText size={15} strokeWidth={1.4} className="text-faint" /><span className="truncate font-mono text-[13px]">{m.file_name}</span>
          {m.status !== "generated" && <Badge>Replaced</Badge>}{m.released_only && <Badge tone="info">Released holds</Badge>}</p>
        <p className="text-[12.5px] text-faint">{m.format_name} · {groupLabel(m.group)} · {m.count} payment(s) · {inr(m.total)}{m.debit_account ? ` · from ${m.debit_account}` : ""}</p>
        <p className="text-[12px] text-faint">Made by {m.created_by ?? "—"} · {formatDateTime(m.created_at)} · downloaded {m.download_count}× · <span title={m.sha256}>check {m.sha256.slice(0, 10)}</span>
          {m.left_out.length > 0 && <span className="text-amber-700"> · {m.left_out.length} left out</span>}</p>
      </div>
      <Button size="sm" variant="ghost" icon={Download} onClick={onDownload}>Download</Button>
    </li>
  );
}

function MakeFiles({ runUuid, onClose, onMade }: { runUuid: string; onClose: () => void; onMade: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { formats } = useBankFormats();
  const [format, setFormat] = useState<string | null>(null);
  const [releasedOnly, setReleasedOnly] = useState(false);
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setCheck(null);
    const q = new URLSearchParams();
    if (format) q.set("format", format);
    if (releasedOnly) q.set("released_only", "true");
    api.get<Check>(`/payroll/bank/runs/${runUuid}/check?${q}`).then((r) => { setCheck(r); setError(""); }).catch((e) => setError(errMsg(e)));
  }, [runUuid, format, releasedOnly]);
  async function make() {
    if (!check) return;
    let leave = false;
    if (check.errors > 0) {
      leave = await confirm({ title: `Leave ${check.errors} payment(s) out?`, message: "Their bank details have problems. They are left out of the file and listed with it; pay them once the details are fixed.", confirmLabel: "Leave out and make files" });
      if (!leave) return;
    }
    setBusy(true);
    try {
      const r = await api.post<{ items: Made[] }>(`/payroll/bank/runs/${runUuid}/files`, { format, released_only: releasedOnly, leave_out_problems: leave });
      toast.success(`${r.items.length} bank file(s) made`, { description: "Download them below and upload in your bank's corporate banking." });
      onMade();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  const total = check?.files.reduce((a, f) => a + Number(f.total), 0) ?? 0;
  return (
    <Modal open onClose={onClose} size="lg" busy={busy} title="Make salary bank files"
      description="Each debit account gets its bank's layout. Files are kept with the pay run."
      footer={<><ModalCancel /><Button variant="primary" loading={busy} disabled={!check || check.blocking.length > 0 || check.files.length === 0} onClick={make}>Make files</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Layout">
          <Select value={format} onChange={setFormat} clearable placeholder="Each account's own layout" options={formats.filter((f) => f.active).map((f) => ({ value: f.key, label: f.name, description: f.bank }))} />
        </Field>
        <div className="pt-7"><Checkbox checked={releasedOnly} onChange={setReleasedOnly} label="Only salaries released from hold" /></div>
      </div>
      {error && <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
      {!check && !error && <p className="mt-6 text-[13.5px] text-muted">Checking bank details…</p>}
      {check && (
        <div className="mt-5 space-y-4">
          {check.blocking.map((b) => <p key={b} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">{b}</p>)}
          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-[13.5px]">
              <thead className="bg-sunken/60 text-left text-[12.5px] text-muted">
                <tr><th className="px-3 py-2 font-normal">File</th><th className="px-3 py-2 font-normal">Payments</th><th className="px-3 py-2 text-right font-normal">Amount</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {check.files.map((f, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2"><p className="text-ink">{f.format_name}</p><p className="text-[12.5px] text-faint">{f.debit_account}{f.debit_masked ? ` ${f.debit_masked}` : ""} · {groupLabel(f.group)}</p></td>
                    <td className="px-3 py-2 text-muted">{f.count} <span className="text-faint">({Object.entries(f.modes).map(([m, n]) => `${n} ${MODE_SHORT[m] ?? m}`).join(", ")})</span></td>
                    <td className="px-3 py-2 text-right text-ink">{inr(f.total)}</td>
                  </tr>
                ))}
                {check.files.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-muted">Nobody to pay in a bank file.</td></tr>}
              </tbody>
              {check.files.length > 1 && <tfoot><tr className="border-t border-line"><td className="px-3 py-2 text-muted" colSpan={2}>Total</td><td className="px-3 py-2 text-right text-ink">{inr(total)}</td></tr></tfoot>}
            </table>
          </div>
          {check.problems.length === 0 ? (
            <p className="flex items-center gap-2 text-[13.5px] text-emerald-700"><CheckCircle2 size={16} strokeWidth={1.4} />Every IFSC and account number looks right.</p>
          ) : (
            <div>
              <p className="mb-2 flex items-center gap-2 text-[13.5px] text-ink"><AlertTriangle size={16} strokeWidth={1.4} className="text-amber-600" />
                {check.errors > 0 ? `${check.errors} must be fixed or left out` : ""}{check.errors > 0 && check.warnings > 0 ? ", " : ""}{check.warnings > 0 ? `${check.warnings} to look at` : ""}</p>
              <ul className="max-h-60 divide-y divide-line overflow-auto rounded-xl border border-line">
                {check.problems.map((p, i) => (
                  <li key={i} className="flex items-start gap-3 px-3 py-2 text-[13px]">
                    <Badge tone={p.level === "error" ? "bad" : "warn"}>{p.level === "error" ? "Fix" : "Check"}</Badge>
                    <span className="text-ink">{p.name || "Company account"}{p.employee_code ? <span className="text-faint"> · {p.employee_code}</span> : null}</span>
                    <span className="text-muted">{p.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
