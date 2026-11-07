"use client";

/*
 * Bits shared by several leave pages: a calendar date tile and the balance history modal.
 *   <DateTile date="2026-11-08" />   <LedgerModal item={{ code, name, uuid }} employeeUuid={uuid} onClose={...} />
 */
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { DataTable, Modal, ModalCancel } from "@/components/ui-kit";
import { LEDGER_KIND, fmtDays } from "./leave-ui";

export function DateTile({ date }: { date: string }) {
  const d = new Date(`${date}T12:00:00Z`);
  return (
    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-canvas/50">
      <span className="text-[10px] uppercase tracking-wide text-faint">{d.toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}</span>
      <span className="tabular text-[16px] font-light leading-none text-ink">{d.getUTCDate()}</span>
    </span>
  );
}


type LedgerRow = { uuid: string; date: string; kind: string; days: number; note: string | null; expires_on: string | null; created_by_name: string | null };

export function LedgerModal({ item, employeeUuid, onClose }: { item: { code: string; name: string; uuid: string } | null; employeeUuid: string | null; onClose: () => void }) {
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  useEffect(() => {
    if (!item || !employeeUuid) return;
    setRows(null);
    api.get<{ items: LedgerRow[] }>(`/leave/balances/${employeeUuid}/ledger?leave_type_uuid=${item.uuid}`).then((r) => setRows(r.items)).catch(() => setRows([]));
  }, [item, employeeUuid]);
  return (
    <Modal open={!!item} onClose={onClose} size="lg" title={item ? `${item.name}: balance history` : ""} flush
      footer={<ModalCancel>Close</ModalCancel>}>
      <DataTable rows={rows ?? []} loading={rows === null} rowKey={(r) => r.uuid}
        columns={[
          { key: "date", header: "Date", cell: (r) => <span className="text-muted">{formatDate(r.date)}</span> },
          { key: "what", header: "What", cell: (r) => <div><p className="text-ink">{LEDGER_KIND[r.kind] ?? r.kind}</p>{r.note && <p className="text-[12px] text-faint">{r.note}</p>}</div> },
          { key: "days", header: "Days", align: "right", cell: (r) => <span className={`tabular ${r.days < 0 ? "text-rose-600" : "text-emerald-700"}`}>{r.days > 0 ? "+" : ""}{fmtDays(r.days, true)}</span> },
          { key: "by", header: "By", hideBelow: "md", cell: (r) => <span className="text-muted">{r.created_by_name ?? ""}{r.expires_on ? ` · expires ${formatDate(r.expires_on)}` : ""}</span> },
        ]}
        emptyIcon={History} emptyTitle="Nothing recorded yet" />
    </Modal>
  );
}
