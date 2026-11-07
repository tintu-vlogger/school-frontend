"use client";

/*
 * Overdue & fines: books past their due date, and fines to collect, waive (with a reason)
 * or add to the learner's fees.
 */
import { useState } from "react";
import { AlarmClock, BadgeIndianRupee, Ban, Eye, HandCoins, ReceiptText } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import {
  Badge, Button, DataTable, Field, FilterBar, Modal, ModalCancel, Tabs, Textarea, type Column, type FilterValues, type MenuItem,
} from "@/components/ui-kit";
import { FINE_KIND, FineStatus, errMsg, inr, useGet, type Fine, type Loan, type Page } from "./common";
import { MemberModal } from "./members";

export function FinesTab({ canCirculate, canManage }: { canCirculate: boolean; canManage: boolean }) {
  const [view, setView] = useState<"overdue" | "fines">("overdue");
  const [member, setMember] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <Tabs variant="pill" value={view} onChange={setView} items={[
        { value: "overdue", label: "Overdue books", icon: AlarmClock }, { value: "fines", label: "Fines", icon: BadgeIndianRupee },
      ]} />
      {view === "overdue" ? <Overdue onMember={setMember} /> : <Fines canCirculate={canCirculate} canManage={canManage} onMember={setMember} />}
      <MemberModal uuid={member} onClose={() => setMember(null)} canManage={canManage} />
    </div>
  );
}

function Overdue({ onMember }: { onMember: (uuid: string) => void }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const p = new URLSearchParams({ overdue: "true", page: String(page), size: String(size) });
  if (q) p.set("q", q);
  const list = useGet<Page<Loan>>(`/library/loans?${p}`);
  const columns: Column<Loan>[] = [
    { key: "member", header: "Member", cell: (l) => <div className="min-w-0"><p className="truncate text-ink">{l.member_name}</p><p className="truncate font-mono text-[12px] text-muted">{l.card_no}</p></div> },
    { key: "book", header: "Book", cell: (l) => <div className="min-w-0"><p className="truncate">{l.title}</p><p className="font-mono text-[12px] text-muted">{l.accession_no}</p></div> },
    { key: "due", header: "Was due", hideBelow: "sm", cell: (l) => formatDate(l.due_on) },
    { key: "late", header: "Late", align: "right", cell: (l) => <Badge tone="bad">{l.overdue_days} {l.overdue_days === 1 ? "day" : "days"}</Badge> },
    { key: "fine", header: "Fine so far", align: "right", hideBelow: "md", cell: (l) => <span className="tabular">{inr(l.fine_so_far)}</span> },
  ];
  return (
    <div>
      <FilterBar searchPlaceholder="Search member or book" onSearchChange={(v) => { setQ(v); setPage(1); }} />
      <DataTable rows={list.data?.items ?? []} rowKey={(l) => l.uuid} columns={columns} loading={list.loading}
        onRowClick={(l) => l.member_uuid && onMember(l.member_uuid)}
        rowActions={(l) => [{ label: "Open member", icon: Eye, onSelect: () => l.member_uuid && onMember(l.member_uuid) }]}
        pagination={{ page, size, total: list.data?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={AlarmClock} emptyTitle="Nothing overdue" emptyHint="Every book on loan is within its due date." />
    </div>
  );
}

type FinePage = Page<Fine> & { pending_total: string; fees_billing: boolean };

function Fines({ canCirculate, canManage, onMember }: { canCirculate: boolean; canManage: boolean; onMember: (uuid: string) => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["pending"] });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [waiving, setWaiving] = useState<Fine | null>(null);
  const p = new URLSearchParams({ page: String(page), size: String(size), status: filters.status?.[0] ?? "" });
  if (q) p.set("q", q);
  const list = useGet<FinePage>(`/library/fines?${p}`);

  async function settle(f: Fine, action: "pay" | "bill") {
    try {
      await api.post(`/library/fines/${f.uuid}/settle`, { action });
      toast.success(action === "pay" ? `${inr(f.amount)} collected` : "Added to fees");
      list.reload();
    } catch (e) { toast.error("Couldn't settle the fine", { description: errMsg(e) }); }
  }
  const actions = (f: Fine): MenuItem[] => {
    const out: MenuItem[] = [];
    if (f.member_uuid) out.push({ label: "Open member", icon: Eye, onSelect: () => onMember(f.member_uuid!) });
    if (f.status === "pending" && canCirculate) {
      out.push({ label: "Collect payment", icon: HandCoins, onSelect: () => settle(f, "pay") });
      if (list.data?.fees_billing && f.member_type === "student") out.push({ label: "Add to fees", icon: ReceiptText, onSelect: () => settle(f, "bill") });
      if (canManage) out.push("separator", { label: "Waive", icon: Ban, onSelect: () => setWaiving(f) });
    }
    return out;
  };
  const columns: Column<Fine>[] = [
    { key: "member", header: "Member", cell: (f) => <div className="min-w-0"><p className="truncate text-ink">{f.member_name}</p><p className="truncate font-mono text-[12px] text-muted">{f.card_no}</p></div> },
    { key: "what", header: "For", cell: (f) => <div className="min-w-0"><p className="truncate">{FINE_KIND[f.kind] ?? f.kind}{f.days ? ` · ${f.days} days` : ""}</p><p className="truncate text-[12.5px] text-muted">{f.title}</p></div> },
    { key: "on", header: "Date", hideBelow: "md", cell: (f) => formatDate(f.created_at) },
    { key: "amount", header: "Amount", align: "right", cell: (f) => <span className="tabular text-ink">{inr(f.amount)}</span> },
    { key: "status", header: "Status", cell: (f) => <span title={f.reason ?? undefined}><FineStatus status={f.status} /></span> },
  ];
  return (
    <div>
      <FilterBar searchPlaceholder="Search member" onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={[{ key: "status", label: "Status", options: [
          { value: "pending", label: "Due" }, { value: "paid", label: "Paid" }, { value: "waived", label: "Waived" }, { value: "billed", label: "Added to fees" }] }]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={list.data && <span className="text-[13px] text-muted">Total due <span className="tabular text-ink">{inr(list.data.pending_total)}</span></span>} />
      <DataTable rows={list.data?.items ?? []} rowKey={(f) => f.uuid} columns={columns} loading={list.loading}
        onRowClick={(f) => f.member_uuid && onMember(f.member_uuid)} rowActions={actions}
        pagination={{ page, size, total: list.data?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={BadgeIndianRupee} emptyTitle="No fines here" emptyHint="Fines appear when books come back late, lost or damaged." />
      <WaiveModal fine={waiving} onClose={() => setWaiving(null)} onDone={() => { setWaiving(null); list.reload(); }} />
    </div>
  );
}

function WaiveModal({ fine, onClose, onDone }: { fine: Fine | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fine) return;
    if (!reason.trim()) { setError("Give a reason"); return; }
    setSaving(true);
    try {
      await api.post(`/library/fines/${fine.uuid}/settle`, { action: "waive", reason: reason.trim() });
      toast.success("Fine waived");
      setReason("");
      onDone();
    } catch (err) { toast.error("Couldn't waive the fine", { description: errMsg(err) }); } finally { setSaving(false); }
  }
  return (
    <Modal open={!!fine} onClose={onClose} size="sm" busy={saving} dirty={!!reason} title="Waive fine"
      description={fine ? `${inr(fine.amount)} · ${fine.member_name}` : undefined}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="waive-form" loading={saving}>Waive</Button></>}>
      <form id="waive-form" onSubmit={submit}>
        <Field label="Reason" required error={error} hint="Kept with the fine for the record">
          <Textarea autoFocus value={reason} onValueChange={(x) => { setReason(x); setError(""); }} rows={3} placeholder="e.g. Was in hospital" />
        </Field>
      </form>
    </Modal>
  );
}
