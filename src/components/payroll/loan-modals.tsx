"use client";

/*
 * Loan modals.
 *   <LoanRequestModal open forEmployee onClose onSaved />  type, amount, instalments with a live EMI plan
 *   <LoanDetailModal uuid open onClose onChanged />         schedule, pay out (HR), skip or prepay (with approval)
 */
import { useEffect, useState } from "react";
import { HandCoins, SkipForward, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { formatDate } from "@/lib/datetime";
import { Badge, Button, DateInput, Field, FormGrid, Modal, ModalCancel, NumberInput, Select, TextInput, Textarea, Toggle } from "@/components/ui-kit";
import { Row, StatusPill, errMsg, inr, loadPayrollEmployees, monthLabel } from "./common";

type LoanType = { uuid: string; code: string; name: string; kind: string; max_amount: string | null; max_instalments: number; interest_rate: string; description: string | null };
type Preview = { emi: string; total_interest: string; total_payable: string; schedule: { seq: number; month: string; emi: string; principal: string; interest: string; balance: string }[]; problems: string[]; interest_rate: string };
export type Loan = { uuid: string; number: string | null; employee_name: string | null; loan_type: string; kind: string; purpose: string | null; principal: string;
  interest_rate: string; instalments: number; emi: string; start_month: string; status: string; status_label: string; outstanding: string;
  disbursed_on: string | null; pending_action: Record<string, any> | null; schedule?: { uuid: string; seq: number; due_month: string; principal: string; interest: string; emi: string; status: string; note: string | null }[];
  can_manage?: boolean; perquisite_monthly?: string };

function nextMonth() { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + 1); return d.toISOString().slice(0, 10); }

export function LoanRequestModal({ open, forEmployee, onClose, onSaved }: { open: boolean; forEmployee?: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [types, setTypes] = useState<LoanType[]>([]);
  const [type, setType] = useState<string | null>(null);
  const [emp, setEmp] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [n, setN] = useState<number | null>(6);
  const [start, setStart] = useState(nextMonth());
  const [purpose, setPurpose] = useState("");
  const [override, setOverride] = useState(false);
  const [p, setP] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) api.get<LoanType[]>("/loans/types").then((t) => { setTypes(t); setType((x) => x ?? t[0]?.uuid ?? null); }).catch(() => {}); }, [open]);
  useEffect(() => {
    if (!open || !type || !amount || !n) { setP(null); return; }
    const t = setTimeout(() => api.post<Preview>("/loans/preview", { loan_type_uuid: type, amount, instalments: n, start_month: start, employee_uuid: forEmployee ? emp : undefined }).then(setP).catch(() => setP(null)), 250);
    return () => clearTimeout(t);
  }, [open, type, amount, n, start, emp, forEmployee]);
  const lt = types.find((x) => x.uuid === type);
  async function save() {
    setBusy(true);
    try { await api.post("/loans", { loan_type_uuid: type, amount, instalments: n, start_month: start, purpose, employee_uuid: forEmployee ? emp : undefined, override_eligibility: override }); toast.success("Loan request sent for approval"); onSaved(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" title={forEmployee ? "Add a loan" : "Ask for a loan or advance"} busy={busy}
      footer={<><ModalCancel /><Button variant="primary" loading={busy} disabled={!type || !amount || !n || (forEmployee && !emp) || (!!p?.problems.length && !override)} onClick={save}>Send for approval</Button></>}>
      <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
        <div className="space-y-4">
          {forEmployee && <Field label="Employee" required><Select value={emp} onChange={setEmp} loadOptions={loadPayrollEmployees} /></Field>}
          <Field label="Type" required hint={lt ? `Up to ${lt.max_amount ? inr(lt.max_amount) : "no fixed limit"} · ${lt.max_instalments} instalments · ${Number(lt.interest_rate) ? `${lt.interest_rate}% interest` : "interest-free"}` : undefined}>
            <Select value={type} onChange={setType} options={types.map((x) => ({ value: x.uuid, label: x.name }))} /></Field>
          <FormGrid>
            <Field label="Amount (₹)" required><NumberInput value={amount} onChange={setAmount} min={0} step={1000} /></Field>
            <Field label="Instalments" required><NumberInput value={n} onChange={setN} min={1} max={lt?.max_instalments ?? 60} /></Field>
          </FormGrid>
          <Field label="First instalment in"><DateInput value={start} onChange={setStart} /></Field>
          <Field label="Purpose"><Textarea value={purpose} onValueChange={setPurpose} rows={2} /></Field>
          {forEmployee && !!p?.problems.length && <Toggle checked={override} onChange={setOverride} label="Allow anyway" description="HR can go past the eligibility rules" />}
        </div>
        <div className="rounded-xl border border-line p-4">
          {!p ? <p className="py-10 text-center text-[13.5px] text-muted">Enter an amount to see the instalments.</p> : (
            <>
              {p.problems.map((x, i) => <p key={i} className="mb-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-[13px] text-amber-800">{x}</p>)}
              <div className="divide-y divide-line">
                <Row label="Monthly instalment" value={inr(p.emi)} strong />
                <Row label="Interest" value={inr(p.total_interest)} sub={`${p.interest_rate}% a year`} />
                <Row label="Total to repay" value={inr(p.total_payable)} />
              </div>
              <div className="mt-3 max-h-48 overflow-auto text-[12.5px]">
                {p.schedule.map((s) => <div key={s.seq} className="flex justify-between py-0.5 text-muted"><span>{monthLabel(s.month)}</span><span className="tabular">{inr(s.emi)}</span></div>)}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function LoanDetailModal({ uuid, open, onClose, onChanged }: { uuid: string | null; open: boolean; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [l, setL] = useState<Loan | null>(null);
  const [action, setAction] = useState<"skip" | "prepay" | "disburse" | null>(null);
  const [months, setMonths] = useState<number | null>(1);
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const load = () => uuid && api.get<Loan>(`/loans/${uuid}`).then(setL).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { if (open) { setL(null); load(); } }, [open, uuid]); // eslint-disable-line react-hooks/exhaustive-deps
  async function go() {
    if (!l || !action) return;
    try {
      const body = action === "skip" ? { months, reason } : action === "prepay" ? { amount, reason } : { reference: reason };
      await api.post(`/loans/${l.uuid}/${action}`, body);
      toast.success(action === "disburse" ? "Marked as paid out" : "Sent for approval");
      setAction(null); load(); onChanged();
    } catch (e) { toast.error(errMsg(e)); }
  }
  return (
    <Modal open={open} onClose={onClose} size="lg" title={l ? `${l.loan_type}${l.number ? ` · ${l.number}` : ""}` : "Loan"} description={l?.employee_name ?? undefined}
      headerActions={l && <StatusPill status={l.status} label={l.status_label} />}
      footer={l && (<>
        {l.status === "active" && !l.pending_action && <><Button variant="secondary" icon={SkipForward} onClick={() => setAction("skip")}>Skip instalment</Button><Button variant="secondary" icon={HandCoins} onClick={() => { setAmount(Number(l.outstanding)); setAction("prepay"); }}>Prepay</Button></>}
        {l.can_manage && l.status === "approved" && <Button variant="primary" icon={Wallet} onClick={() => setAction("disburse")}>Mark paid out</Button>}
      </>)}>
      {!l ? <p className="py-10 text-center text-muted">Loading…</p> : (
        <div className="space-y-5">
          <div className="grid gap-3 rounded-xl bg-sunken/60 p-4 sm:grid-cols-4">
            <div><p className="text-[12px] text-muted">Amount</p><p className="tabular text-[18px] font-light text-ink">{inr(l.principal)}</p></div>
            <div><p className="text-[12px] text-muted">Instalment</p><p className="tabular text-[18px] font-light text-ink">{inr(l.emi)}</p></div>
            <div><p className="text-[12px] text-muted">Balance</p><p className="tabular text-[18px] font-light text-primary">{inr(l.outstanding)}</p></div>
            <div><p className="text-[12px] text-muted">Interest</p><p className="text-[15px] text-ink">{Number(l.interest_rate) ? `${l.interest_rate}%` : "Free"}</p></div>
          </div>
          {l.pending_action && <p className="rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2 text-[13px] text-sky-800">A {l.pending_action.kind} request is waiting for approval.</p>}
          {Number(l.perquisite_monthly) > 0 && <p className="text-[12.5px] text-muted">Taxable benefit of {inr(l.perquisite_monthly)} a month is added to salary (interest below the reference rate).</p>}
          <div className="max-h-80 overflow-auto rounded-xl border border-line">
            <table className="w-full text-[13px]">
              <thead className="sticky top-0 bg-surface text-left text-[12px] text-faint"><tr><th className="px-3 py-2 font-normal">#</th><th className="px-3 py-2 font-normal">Month</th><th className="px-3 py-2 text-right font-normal">Principal</th><th className="px-3 py-2 text-right font-normal">Interest</th><th className="px-3 py-2 text-right font-normal">Instalment</th><th className="px-3 py-2 font-normal">Status</th></tr></thead>
              <tbody className="divide-y divide-line">
                {l.schedule?.map((s) => <tr key={s.uuid}><td className="px-3 py-1.5 text-faint">{s.seq || "—"}</td><td className="px-3 py-1.5 text-ink">{monthLabel(s.due_month)}</td><td className="tabular px-3 py-1.5 text-right text-muted">{inr(s.principal)}</td><td className="tabular px-3 py-1.5 text-right text-muted">{inr(s.interest)}</td><td className="tabular px-3 py-1.5 text-right text-ink">{inr(s.emi)}</td><td className="px-3 py-1.5"><StatusPill status={s.status} /></td></tr>)}
              </tbody>
            </table>
            {!l.schedule?.length && <p className="p-4 text-center text-muted">The plan is made when the loan is approved.</p>}
          </div>
          {l.disbursed_on && <p className="text-[12.5px] text-faint">Paid out on {formatDate(l.disbursed_on)}</p>}
        </div>
      )}
      <Modal open={!!action} onClose={() => setAction(null)} size="sm" zIndex={60} title={action === "skip" ? "Skip instalments" : action === "prepay" ? "Prepay" : "Mark paid out"}
        footer={<><ModalCancel /><Button variant="primary" onClick={go}>{action === "disburse" ? "Save" : "Send for approval"}</Button></>}>
        <div className="space-y-4">
          {action === "skip" && <Field label="Months to skip"><NumberInput value={months} onChange={setMonths} min={1} max={3} /></Field>}
          {action === "prepay" && <Field label="Amount" hint={`Balance ${inr(l?.outstanding)}`}><NumberInput value={amount} onChange={setAmount} /></Field>}
          <Field label={action === "disburse" ? "Bank reference" : "Reason"}><TextInput value={reason} onValueChange={setReason} /></Field>
        </div>
      </Modal>
    </Modal>
  );
}

void Badge;
