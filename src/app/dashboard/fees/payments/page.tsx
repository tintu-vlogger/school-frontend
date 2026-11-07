"use client";

/*
 * Payments & receipts: every receipt with filters and a running total; detail modal with
 * PDF / print, cancel (with reason) and cheque bounce. A second tab handles refunds
 * (requested, approved through the approval flow, then paid out).
 */
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Ban, Download, Eye, Printer, ReceiptText, RotateCcw, Undo2, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate, formatDateTime, todayISO } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader } from "@/components/shell/page";
import {
  Badge, Button, DataTable, DateInput, DateRangeInput, Field, FilterBar, KeyValue, Modal, ModalCancel, NumberInput, RadioCards,
  Section, Select, Skeleton, Tabs, TextInput, Textarea, type Column, type FilterValues,
} from "@/components/ui-kit";
import {
  type Page, type Payment, type Refund, ApprovalStatus, PaymentStatus, downloadFile, errMsg, money, n, printReceipt,
  searchStudents, useFeeMeta, useFetch,
} from "@/components/fees/shared";

export default function PaymentsPage() {
  return <Suspense fallback={null}><Payments /></Suspense>;
}

function Payments() {
  const params = useSearchParams();
  const { can } = useAccess();
  const [tab, setTab] = useState<"receipts" | "refunds">(params.get("tab") === "refunds" ? "refunds" : "receipts");
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundKey, setRefundKey] = useState(0);
  return (
    <div>
      <PageHeader eyebrow="Fees" title="Payments & receipts" description="Every receipt from the counter and online, and refunds."
        actions={can("fees.refund") ? <Button icon={Undo2} onClick={() => { setRefundKey((k) => k + 1); setRefundOpen(true); }}>New refund</Button> : undefined} />
      <Tabs value={tab} onChange={setTab} items={[{ value: "receipts", label: "Receipts" }, { value: "refunds", label: "Refunds" }]} className="mb-4" />
      {tab === "receipts" ? <Receipts /> : <Refunds key={refundKey} />}
      <RefundModal key={`m${refundKey}`} open={refundOpen} onClose={() => setRefundOpen(false)} onDone={() => { setRefundOpen(false); setTab("refunds"); setRefundKey((k) => k + 1); }} />
    </div>
  );
}

function Receipts() {
  const toast = useToast();
  const meta = useFeeMeta();
  const cur = meta?.currency ?? "INR";
  const { term } = useInstitution();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<FilterValues>({ status: ["paid"] });
  const [range, setRange] = useState({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [viewing, setViewing] = useState<string | null>(null);
  const p = new URLSearchParams({ page: String(page), size: String(size) });
  if (q) p.set("q", q);
  if (filters.status?.[0]) p.set("status", filters.status[0]);
  if (filters.mode?.[0]) p.set("mode", filters.mode[0]);
  if (filters.source?.[0]) p.set("source", filters.source[0]);
  if (range.from) p.set("from", range.from);
  if (range.to) p.set("to", range.to);
  const { data, loading, reload } = useFetch<Page<Payment> & { sum: number }>(`/fees/payments?${p}`, (e) => toast.error(errMsg(e)));

  const columns: Column<Payment>[] = [
    { key: "number", header: "Receipt", cell: (r) => <div><p className="font-mono text-[13px] text-ink">{r.number}</p><p className="text-[12px] text-faint">{formatDate(r.paid_on)}</p></div> },
    { key: "student", header: term("student"), cell: (r) => <div className="min-w-0"><p className="truncate text-ink">{r.student_name}</p><p className="truncate text-[12.5px] text-muted">{r.admission_no}</p></div> },
    { key: "mode", header: "Mode", hideBelow: "md", cell: (r) => <span className="text-ink/80">{r.mode_label}{r.source === "online" && <Badge tone="info" className="ml-2">Online</Badge>}</span> },
    { key: "by", header: "Collected by", hideBelow: "lg", cell: (r) => <span className="text-muted">{r.collected_by_name}</span> },
    { key: "amount", header: "Amount", align: "right", cell: (r) => <span className={`tabular ${r.status !== "paid" ? "text-faint line-through" : ""}`}>{money(r.amount, cur)}</span> },
    { key: "status", header: "Status", cell: (r) => <PaymentStatus status={r.status} /> },
  ];
  const modeOpts = Object.entries(meta?.modes ?? {}).map(([value, label]) => ({ value, label }));

  return (
    <>
      <FilterBar searchPlaceholder="Search by receipt no., name or admission no." onSearchChange={(v) => { setQ(v); setPage(1); }}
        filters={[
          { key: "status", label: "Status", options: [{ value: "paid", label: "Paid" }, { value: "cancelled", label: "Cancelled" }, { value: "bounced", label: "Bounced" }] },
          { key: "mode", label: "Mode", options: [...modeOpts, { value: "split", label: "Split" }] },
          { key: "source", label: "Source", options: [{ value: "counter", label: "Counter" }, { value: "online", label: "Online" }] },
        ]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }}
        actions={<div className="w-64"><DateRangeInput value={range} onChange={(r) => { setRange(r); setPage(1); }} /></div>} />
      {data && <p className="mb-2 text-[13px] text-muted">Total received: <span className="tabular text-ink">{money(data.sum, cur)}</span></p>}
      <DataTable rows={data?.items ?? []} rowKey={(r) => r.uuid} columns={columns} loading={loading} onRowClick={(r) => setViewing(r.uuid)}
        rowActions={(r) => [
          { label: "View details", icon: Eye, onSelect: () => setViewing(r.uuid) },
          { label: "Download PDF", icon: Download, onSelect: () => downloadFile(`/fees/payments/${r.uuid}/pdf`, "receipt.pdf").catch((e) => toast.error(errMsg(e))) },
          { label: "Print", icon: Printer, onSelect: () => printReceipt(r.uuid).catch((e) => toast.error(errMsg(e))) },
        ]}
        pagination={{ page, size, total: data?.total ?? 0, onPageChange: setPage, onSizeChange: (s) => { setSize(s); setPage(1); } }}
        emptyIcon={ReceiptText} emptyTitle="No receipts" emptyHint="Collect fees at the counter or let parents pay online; receipts show here." />
      <ReceiptDetail uuid={viewing} onClose={() => setViewing(null)} onChanged={reload} currency={cur} />
    </>
  );
}

function ReceiptDetail({ uuid, onClose, onChanged, currency }: { uuid: string | null; onClose: () => void; onChanged: () => void; currency: string }) {
  const toast = useToast();
  const { can } = useAccess();
  const meta = useFeeMeta();
  const { data, reload } = useFetch<Payment>(uuid ? `/fees/payments/${uuid}` : null, (e) => toast.error(errMsg(e)));
  const p = data && data.uuid === uuid ? data : null;
  const [action, setAction] = useState<"cancel" | "bounce" | null>(null);
  const [reason, setReason] = useState("");
  const [charge, setCharge] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const isCheque = p?.modes.some((m) => m.mode === "cheque" || m.mode === "dd");

  async function submit() {
    if (!p || reason.trim().length < 2) { toast.error("Give a reason"); return; }
    setSaving(true);
    try {
      if (action === "bounce") await api.post(`/fees/payments/${p.uuid}/bounce`, { reason: reason.trim(), charge: charge ?? meta?.bounce_charge ?? 0 });
      else await api.post(`/fees/payments/${p.uuid}/cancel`, { reason: reason.trim() });
      toast.success(action === "bounce" ? "Marked as bounced; the dues are open again" : "Receipt cancelled; the dues are open again");
      setAction(null); setReason(""); reload(); onChanged();
    } catch (e) { toast.error("Couldn't update the receipt", { description: errMsg(e) }); }
    finally { setSaving(false); }
  }

  return (
    <>
      <Modal open={!!uuid} onClose={onClose} size="lg" title={p ? `Receipt ${p.number}` : "Receipt"} description={p ? `${p.student_name} · ${formatDate(p.paid_on)}` : undefined}
        footer={p && <>
          <Button icon={Printer} onClick={() => printReceipt(p.uuid).catch((e) => toast.error(errMsg(e)))}>Print</Button>
          <Button icon={Download} onClick={() => downloadFile(`/fees/payments/${p.uuid}/pdf`, "receipt.pdf").catch((e) => toast.error(errMsg(e)))}>PDF</Button>
          {p.status === "paid" && isCheque && can("fees.refund") && <Button icon={RotateCcw} onClick={() => { setAction("bounce"); setReason("Cheque returned by the bank"); setCharge(null); }}>Cheque bounced</Button>}
          {p.status === "paid" && can("fees.refund") && <Button variant="danger" icon={Ban} onClick={() => { setAction("cancel"); setReason(""); }}>Cancel receipt</Button>}
        </>}>
        {!p ? <Skeleton className="h-60 w-full" /> : (
          <div className="space-y-6">
            <div className="flex items-center gap-3"><PaymentStatus status={p.status} />{p.status !== "paid" && <span className="text-[13px] text-muted">{p.cancel_reason} · {p.cancelled_by_name} · {p.cancelled_at && formatDateTime(p.cancelled_at)}</span>}</div>
            <KeyValue columns={3} items={[
              { label: "Received", value: <span className="tabular">{money(p.amount, currency, { decimals: true })}</span> },
              { label: "Late fee included", value: n(p.late_fee) ? money(p.late_fee, currency) : "None" },
              { label: "Collected by", value: p.collected_by_name },
              ...(n(p.wallet_used) ? [{ label: "From advance", value: money(p.wallet_used, currency) }] : []),
              ...(n(p.advance) ? [{ label: "Kept as advance", value: money(p.advance, currency) }] : []),
              ...(p.notes ? [{ label: "Note", value: p.notes, span: 3 as const }] : []),
            ]} />
            <Section title="Paid by">
              <ul className="divide-y divide-line text-[13.5px]">
                {p.modes.map((m, i) => (
                  <li key={i} className="flex justify-between gap-3 py-2">
                    <span className="text-ink/90">{m.label}{m.status === "bounced" && <Badge tone="bad" className="ml-2">Bounced</Badge>}
                      <span className="block text-[12px] text-faint">{[m.reference, m.bank, m.instrument_date && formatDate(m.instrument_date)].filter(Boolean).join(" · ")}</span></span>
                    <span className="tabular">{money(m.amount, currency)}</span>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Applied to">
              <ul className="divide-y divide-line text-[13.5px]">
                {(p.allocations ?? []).map((a, i) => (
                  <li key={i} className={`flex justify-between gap-3 py-2 ${a.reversed ? "text-faint line-through" : ""}`}>
                    <span>{a.invoice_title} · {a.description}<span className="block text-[12px] text-faint">{a.invoice_number}</span></span>
                    <span className="tabular">{money(a.amount, currency)}</span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>
        )}
      </Modal>
      <Modal open={!!action} onClose={() => setAction(null)} size="sm" busy={saving}
        title={action === "bounce" ? "Cheque bounced" : "Cancel this receipt?"}
        description="The receipt stays on record. The dues it paid become open again."
        footer={<><ModalCancel>Back</ModalCancel><Button variant="danger" loading={saving} onClick={submit}>{action === "bounce" ? "Mark bounced" : "Cancel receipt"}</Button></>}>
        <div className="space-y-4">
          <Field label="Reason" required><Textarea value={reason} onValueChange={setReason} rows={2} /></Field>
          {action === "bounce" && <Field label="Bounce charge to bill" hint="Billed to the family as a separate invoice. Enter 0 for none.">
            <NumberInput value={charge ?? meta?.bounce_charge ?? 0} onChange={setCharge} min={0} />
          </Field>}
        </div>
      </Modal>
    </>
  );
}

function Refunds() {
  const toast = useToast();
  const meta = useFeeMeta();
  const cur = meta?.currency ?? "INR";
  const { can } = useAccess();
  const { term } = useInstitution();
  const [filters, setFilters] = useState<FilterValues>({});
  const [page, setPage] = useState(1);
  const [paying, setPaying] = useState<Refund | null>(null);
  const p = new URLSearchParams({ page: String(page), size: "25" });
  if (filters.status?.[0]) p.set("status", filters.status[0]);
  const { data, loading, reload } = useFetch<Page<Refund>>(`/fees/refunds?${p}`, (e) => toast.error(errMsg(e)));
  const src: Record<string, string> = { wallet: "Advance", deposit: "Deposit", payment: "Receipt" };
  const columns: Column<Refund>[] = [
    { key: "number", header: "Refund", cell: (r) => <div><p className="font-mono text-[13px] text-ink">{r.number}</p><p className="text-[12px] text-faint">{formatDate(r.created_at)}</p></div> },
    { key: "student", header: term("student"), cell: (r) => <span className="text-ink">{r.student_name}</span> },
    { key: "source", header: "From", hideBelow: "md", cell: (r) => <span className="text-muted">{src[r.source] ?? r.source}</span> },
    { key: "reason", header: "Reason", hideBelow: "lg", cell: (r) => <span className="line-clamp-1 text-muted">{r.reason}</span> },
    { key: "amount", header: "Amount", align: "right", cell: (r) => <span className="tabular">{money(r.amount, cur)}</span> },
    { key: "status", header: "Status", cell: (r) => <ApprovalStatus status={r.status} /> },
  ];
  return (
    <>
      <FilterBar filters={[{ key: "status", label: "Status", options: [{ value: "pending", label: "Waiting for approval" }, { value: "approved", label: "Approved" }, { value: "paid", label: "Paid out" }, { value: "rejected", label: "Rejected" }] }]}
        values={filters} onChange={(v) => { setFilters(v); setPage(1); }} />
      <DataTable rows={data?.items ?? []} rowKey={(r) => r.uuid} columns={columns} loading={loading}
        rowActions={(r) => r.status === "approved" && can("fees.refund") ? [{ label: "Pay out", icon: Wallet, onSelect: () => setPaying(r) }] : []}
        onRowClick={(r) => { if (r.status === "approved" && can("fees.refund")) setPaying(r); }}
        pagination={{ page, size: 25, total: data?.total ?? 0, onPageChange: setPage }}
        emptyIcon={Undo2} emptyTitle="No refunds" emptyHint="Refund advance balances or deposits from here. Each refund goes for approval first." />
      <PayRefundModal key={paying?.uuid ?? "none"} refund={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); reload(); }} currency={cur} />
    </>
  );
}

function PayRefundModal({ refund, onClose, onDone, currency }: { refund: Refund | null; onClose: () => void; onDone: () => void; currency: string }) {
  const toast = useToast();
  const meta = useFeeMeta();
  const [mode, setMode] = useState<string | null>("bank_transfer");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!refund) return;
    setSaving(true);
    try { await api.post(`/fees/refunds/${refund.uuid}/pay`, { mode, reference: reference.trim() || null, paid_on: paidOn }); toast.success("Refund paid out"); onDone(); }
    catch (e) { toast.error("Couldn't pay out", { description: errMsg(e) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={!!refund} onClose={onClose} size="sm" busy={saving} title={refund ? `Pay out ${money(refund.amount, currency)}` : ""} description={refund ? `${refund.number} · ${refund.student_name}` : undefined}
      footer={<><ModalCancel /><Button variant="primary" loading={saving} onClick={submit}>Record payout</Button></>}>
      <div className="space-y-4">
        <Field label="Paid by"><Select<string> value={mode} onChange={setMode} options={Object.entries(meta?.modes ?? {}).map(([value, label]) => ({ value, label }))} /></Field>
        <Field label="Reference" aside="Optional"><TextInput value={reference} onValueChange={setReference} placeholder="Cheque or transaction number" /></Field>
        <Field label="Date"><DateInput value={paidOn} onChange={setPaidOn} max={todayISO()} /></Field>
      </div>
    </Modal>
  );
}

function RefundModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { term } = useInstitution();
  const [student, setStudent] = useState<string | null>(null);
  const [source, setSource] = useState<"wallet" | "deposit">("wallet");
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: acc } = useFetch<{ wallet: number; deposit_refundable: number; currency: string }>(student ? `/fees/students/${student}/account` : null);
  const avail = acc ? (source === "wallet" ? n(acc.wallet) : n(acc.deposit_refundable)) : 0;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!student || !amount || reason.trim().length < 2) { toast.error("Fill in the learner, amount and reason"); return; }
    setSaving(true);
    try { await api.post("/fees/refunds", { student_uuid: student, source, amount, reason: reason.trim() }); toast.success("Refund sent for approval"); onDone(); }
    catch (err) { toast.error("Couldn't request the refund", { description: errMsg(err) }); }
    finally { setSaving(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="md" busy={saving} dirty={!!student} title="New refund" description="The refund goes through approval before it can be paid out."
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="refund-form" loading={saving}>Send for approval</Button></>}>
      <form id="refund-form" onSubmit={submit} className="space-y-4">
        <Field label={term("student")} required><Select<string> value={student} onChange={setStudent} loadOptions={searchStudents} placeholder="Search" /></Field>
        <RadioCards<"wallet" | "deposit"> value={source} onChange={setSource} options={[
          { value: "wallet", label: "Advance balance", description: acc ? money(acc.wallet, acc.currency) : "Money paid above the dues" },
          { value: "deposit", label: "Refundable deposit", description: acc ? money(acc.deposit_refundable, acc.currency) : "Caution deposit on leaving" },
        ]} />
        <Field label="Amount" required hint={acc ? `Up to ${money(avail, acc.currency)}` : undefined}><NumberInput value={amount} onChange={setAmount} min={0} max={avail || undefined} /></Field>
        <Field label="Reason" required><Textarea value={reason} onValueChange={setReason} rows={2} /></Field>
      </form>
    </Modal>
  );
}
