"use client";

/*
 * Fees (portal): a child's dues by instalment, pay online (selected instalments, oldest first),
 * payment history and receipts. Works on a phone.
 */
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, CreditCard, Download, FlaskConical, ReceiptText, Wallet2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { EmptyState, PageHeader, Paper, PaperHeader } from "@/components/shell/page";
import { Badge, Button, Checkbox, Modal, ModalCancel, Skeleton } from "@/components/ui-kit";
import { type Account, type Invoice, InvoiceStatus, downloadFile, errMsg, money, n, useFetch } from "@/components/fees/shared";
import { ChildPicker, openCheckout, useMyChildren, type OrderResult } from "@/components/fees/portal";

type PortalAccount = Account & { online_enabled: boolean; provider: string | null; test_mode: boolean; allow_partial_online: boolean };
type OrderStatus = { order: string; status: string; amount: number; currency: string; receipt: { uuid: string; number: string } | null; error: string | null };

export default function MyFeesPage() {
  return <Suspense fallback={null}><MyFees /></Suspense>;
}

function MyFees() {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { kids, studentId, setStudentId, isParent } = useMyChildren();
  const { data, loading, reload } = useFetch<PortalAccount>(studentId ? `/fees/portal/account?student_id=${studentId}` : null, (e) => toast.error(errMsg(e)));
  const acc = data && data.student.id === studentId ? data : null;
  const [picked, setPicked] = useState<string[] | null>(null);
  const [paying, setPaying] = useState(false);
  const [testOrder, setTestOrder] = useState<OrderResult | null>(null);
  const [done, setDone] = useState<OrderStatus | null>(null);
  const [returned, setReturned] = useState(false);

  // Back from a provider's page (?order=<uuid>): confirm the payment once.
  const returnOrder = params.get("order");
  if (returnOrder && !returned) {
    setReturned(true);
    api.post<OrderStatus>(`/fees/portal/orders/${returnOrder}/verify`, {})
      .then((r) => { setDone(r); reload(); })
      .catch((e) => toast.error(params.get("cancelled") ? "Payment cancelled" : "We couldn't confirm the payment yet", { description: errMsg(e) }))
      .finally(() => router.replace("/dashboard/my/fees", { scroll: false }));
  }

  const cur = acc?.currency ?? "INR";
  const open = acc?.open ?? [];
  const selected = picked ?? open.map((i) => i.uuid);
  const chosen = open.filter((i) => selected.includes(i.uuid));
  const amount = chosen.reduce((s, i) => s + n(i.payable ?? i.balance), 0);

  function toggle(inv: Invoice, on: boolean) {
    const idx = open.findIndex((i) => i.uuid === inv.uuid);
    setPicked(on ? open.slice(0, Math.max(idx + 1, chosen.length)).map((i) => i.uuid) : open.slice(0, idx).map((i) => i.uuid));
  }

  async function pay() {
    if (!acc || !chosen.length) return;
    setPaying(true);
    try {
      const o = await api.post<OrderResult>("/fees/portal/orders", { student_id: acc.student.id, invoice_uuids: chosen.map((i) => i.uuid),
        return_url: `${window.location.origin}/dashboard/my/fees` });
      if (o.provider === "test") { setTestOrder(o); return; }
      const res = await openCheckout(o);
      if (res === "verified") {
        const st = await api.get<OrderStatus>(`/fees/portal/orders/${o.order}`);
        setDone(st); setPicked(null); reload();
      }
    } catch (e) { toast.error("Payment didn't go through", { description: errMsg(e) }); }
    finally { setPaying(false); }
  }

  async function testPay(succeed: boolean) {
    if (!testOrder) return;
    try {
      const r = await api.post<OrderStatus>(`/fees/portal/orders/${testOrder.order}/test-pay`, { succeed });
      setTestOrder(null);
      if (r.status === "paid") { setDone(r); setPicked(null); reload(); } else toast.info("Payment cancelled");
    } catch (e) { toast.error(errMsg(e)); }
  }

  const receipt = (uuid: string) => downloadFile(`/fees/portal/receipts/${uuid}/pdf`, "receipt.pdf").catch((e) => toast.error(errMsg(e)));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Fees" description={isParent ? "Fees due for your child, online payment and receipts." : "Your fees, payments and receipts."}
        actions={<ChildPicker kids={kids} value={studentId} onChange={(id) => { setStudentId(id); setPicked(null); }} />} />
      {kids && kids.length === 0 && <Paper><EmptyState icon={Wallet2} title="No fee account found" hint="Ask the school office to link your sign-in to your child." /></Paper>}
      {(loading && !acc) && kids?.length !== 0 ? <div className="space-y-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-48 rounded-2xl" /></div> : acc && (
        <div className="space-y-5">
          <Paper className="p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[13px] text-muted">{acc.student.name}{acc.student.section_label ? ` · ${acc.student.section_label}` : ""}</p>
                <p className="tabular mt-1 text-[32px] font-extralight leading-none text-ink">{money(n(acc.total_due), cur)}</p>
                <p className="mt-2 text-[13px] text-muted">
                  {n(acc.total_due) === 0 ? "Nothing due. Thank you!" : n(acc.overdue) > 0 ? <span className="text-rose-700">{money(acc.overdue, cur)} is overdue</span> : open[0] ? `Next due on ${formatDate(open[0].due_date)}` : ""}
                  {n(acc.late_fee) > 0 && <span className="text-amber-700"> · includes late fee {money(acc.late_fee, cur)}</span>}
                </p>
              </div>
              {n(acc.wallet) > 0 && <Badge tone="accent">Advance {money(acc.wallet, cur)}</Badge>}
            </div>
          </Paper>

          {open.length > 0 && (
            <Paper>
              <PaperHeader title="Dues" action={acc.test_mode && acc.online_enabled ? <Badge tone="warn">Test payments</Badge> : undefined} />
              <ul className="divide-y divide-line">
                {open.map((inv) => (
                  <li key={inv.uuid} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                    {acc.online_enabled && acc.allow_partial_online && <Checkbox checked={selected.includes(inv.uuid)} onChange={(v) => toggle(inv, v)} aria-label={`Pay ${inv.title}`} />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2"><span className="text-[14.5px] text-ink">{inv.title}</span><InvoiceStatus inv={inv} today={acc.today} /></div>
                      <p className="text-[12.5px] text-faint">Due {formatDate(inv.due_date)}</p>
                      <ul className="mt-1.5 space-y-0.5 text-[12.5px] text-muted">
                        {(inv.lines ?? []).filter((l) => n(l.due) > 0).map((l) => <li key={l.id} className="flex justify-between gap-2"><span>{l.description}{l.concession_note ? ` (${l.concession_note})` : ""}</span><span className="tabular">{money(l.due, cur)}</span></li>)}
                        {n(inv.late_fee) > 0 && <li className="flex justify-between gap-2 text-amber-700"><span>Late fee</span><span className="tabular">{money(inv.late_fee, cur)}</span></li>}
                      </ul>
                    </div>
                    <p className="tabular text-[15px] text-ink">{money(inv.payable ?? inv.balance, cur)}</p>
                  </li>
                ))}
              </ul>
              {acc.online_enabled ? (
                <div className="flex flex-col gap-2 border-t border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                  <span className="text-[13px] text-muted">{chosen.length} of {open.length} instalments selected</span>
                  <Button variant="primary" icon={CreditCard} loading={paying} disabled={!chosen.length} onClick={pay} className="w-full justify-center sm:w-auto">Pay {money(amount, cur)}</Button>
                </div>
              ) : <p className="border-t border-line p-4 text-[13px] text-muted sm:px-5">Please pay at the school fee counter.</p>}
            </Paper>
          )}

          <Paper>
            <PaperHeader title="Payments" />
            {acc.payments.length === 0 ? <EmptyState icon={ReceiptText} title="No payments yet" hint="Receipts for every payment show here." /> : (
              <ul className="divide-y divide-line">
                {acc.payments.map((p) => (
                  <li key={p.uuid} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] text-ink">{money(p.amount, cur)} <span className="text-faint">· {p.mode_label}</span></p>
                      <p className="text-[12.5px] text-faint">{formatDate(p.paid_on)} · {p.number}</p>
                    </div>
                    <Button size="sm" icon={Download} onClick={() => receipt(p.uuid)}>Receipt</Button>
                  </li>
                ))}
              </ul>
            )}
          </Paper>

          {acc.paid.length > 0 && (
            <Paper>
              <PaperHeader title="Paid instalments" />
              <ul className="divide-y divide-line">
                {acc.paid.map((i) => (
                  <li key={i.uuid} className="flex items-center justify-between px-4 py-3 text-[14px] sm:px-5">
                    <span className="text-ink/85">{i.title} <span className="text-[12.5px] text-faint">· due {formatDate(i.due_date)}</span></span>
                    <span className="tabular text-muted">{money(i.total, cur)}</span>
                  </li>
                ))}
              </ul>
            </Paper>
          )}
        </div>
      )}

      <Modal open={!!testOrder} onClose={() => setTestOrder(null)} size="sm" title="Test payment" leading={<FlaskConical size={18} strokeWidth={1.4} className="text-amber-600" />}
        description="The school is trying out online payments. No money will be taken."
        footer={<><ModalCancel>Close</ModalCancel><Button onClick={() => testPay(false)}>Fail payment</Button><Button variant="primary" onClick={() => testPay(true)}>Pay {testOrder ? money(testOrder.amount, testOrder.currency) : ""}</Button></>}>
        {testOrder && <div className="rounded-xl bg-sunken p-4 text-[13.5px]"><p className="text-ink">{testOrder.institution}</p><p className="mt-1 text-muted">{testOrder.description}</p></div>}
      </Modal>

      <Modal open={!!done} onClose={() => setDone(null)} size="sm" title="Payment received"
        footer={done?.receipt ? <Button variant="primary" icon={Download} onClick={() => receipt(done.receipt!.uuid)}>Download receipt</Button> : <ModalCancel>Close</ModalCancel>}>
        {done && <div className="flex flex-col items-center py-2 text-center">
          <CheckCircle2 size={36} strokeWidth={1.2} className="mb-3 text-emerald-600" />
          <p className="tabular text-[26px] font-light text-ink">{money(done.amount, done.currency)}</p>
          {done.receipt && <p className="mt-1 text-[13.5px] text-muted">Receipt {done.receipt.number}</p>}
        </div>}
      </Modal>
    </div>
  );
}
