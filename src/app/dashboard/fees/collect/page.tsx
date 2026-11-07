"use client";

/*
 * Fee counter: find a learner, tick the instalments being paid (oldest first), take the money
 * in one or more modes, and hand over the receipt (PDF or print).
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Download, HandCoins, Plus, Printer, Search, Trash2, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { useInstitution } from "@/lib/institution";
import { formatDate, todayISO } from "@/lib/datetime";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper, PaperHeader, EmptyState } from "@/components/shell/page";
import {
  Avatar, Badge, Button, Checkbox, DateInput, Field, FormGrid, Modal, NumberInput, Select, Skeleton, TextInput, Textarea, useConfirm,
} from "@/components/ui-kit";
import {
  type Account, type Invoice, type Payment, InvoiceStatus, PaymentStatus, downloadFile, errMsg, money, n, printReceipt,
  searchStudents, useFeeMeta,
} from "@/components/fees/shared";

type ModeRow = { key: number; mode: string; amount: number | null; reference: string; bank: string; instrument_date: string };

export default function CollectPage() {
  return <Suspense fallback={null}><Collect /></Suspense>;
}

function Collect() {
  const params = useSearchParams();
  const router = useRouter();
  const { term } = useInstitution();
  const [studentUuid, setStudentUuid] = useState<string | null>(params.get("student"));
  const [picked, setPicked] = useState<{ value: string; label: string } | null>(null);

  const choose = (uuid: string | null) => {
    setStudentUuid(uuid);
    router.replace(uuid ? `/dashboard/fees/collect?student=${uuid}` : "/dashboard/fees/collect", { scroll: false });
  };

  return (
    <div>
      <PageHeader eyebrow="Fees" title="Collect fees" description={`Find a ${term("student").toLowerCase()} by name, admission number or a parent's phone number.`} />
      <Paper className="mb-5 p-4">
        <Select<string> value={studentUuid} onChange={(v, opt) => { setPicked(opt ? { value: opt.value, label: opt.label } : null); choose(v); }}
          loadOptions={searchStudents} clearable placeholder={`Search ${term("students").toLowerCase()}`} emptyText="Type a name, admission no. or phone"
          selectedOption={picked} />
      </Paper>
      {studentUuid ? <Counter key={studentUuid} uuid={studentUuid} onName={(name) => { if (!picked || picked.value !== studentUuid) setPicked({ value: studentUuid, label: name }); }} /> : (
        <Paper><EmptyState icon={Search} title={`Pick a ${term("student").toLowerCase()} to start`} hint="Their dues by instalment, advance balance and past receipts show here." /></Paper>
      )}
    </div>
  );
}

let modeKey = 1;

function Counter({ uuid, onName }: { uuid: string; onName: (name: string) => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAccess();
  const meta = useFeeMeta();
  const [acc, setAcc] = useState<Account | null>(null);
  const [nonce, setNonce] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [modes, setModes] = useState<ModeRow[]>([]);
  const [useWallet, setUseWallet] = useState(false);
  const [waive, setWaive] = useState(false);
  const [paidOn, setPaidOn] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<Payment | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => setNonce((x) => x + 1), []);
  useEffect(() => {
    let live = true;
    api.get<Account>(`/fees/students/${uuid}/account`).then((a) => {
      if (!live) return;
      setAcc(a);
      onName(a.student.name);
      setSelected(a.open.map((i) => i.uuid));
      setModes([{ key: modeKey++, mode: "cash", amount: null, reference: "", bank: "", instrument_date: "" }]);
      setUseWallet(false); setWaive(false); setNotes("");
    }).catch((e) => toast.error("Couldn't load the account", { description: errMsg(e) }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid, nonce, toast]);

  const cur = acc?.currency ?? meta?.currency ?? "INR";
  const chosen = useMemo(() => (acc?.open ?? []).filter((i) => selected.includes(i.uuid)), [acc, selected]);
  const payable = chosen.reduce((s, i) => s + n(i.balance) + (waive ? 0 : n(i.late_fee)), 0);
  const wallet = n(acc?.wallet);
  const walletUse = useWallet ? Math.min(wallet, payable) : 0;
  const suggested = Math.max(0, Math.round((payable - walletUse) * 100) / 100);
  const received = modes.reduce((s, m) => s + (m.amount ?? (modes.length === 1 ? suggested : 0)), 0);
  const extra = Math.round((received + walletUse - payable) * 100) / 100;

  // Keep the oldest-first rule: ticking an instalment ticks every older one.
  function toggle(inv: Invoice, on: boolean) {
    const list = acc?.open ?? [];
    const idx = list.findIndex((i) => i.uuid === inv.uuid);
    if (on) setSelected(list.slice(0, idx + 1).map((i) => i.uuid).concat(selected.filter((u) => !list.slice(0, idx + 1).some((i) => i.uuid === u))));
    else setSelected(list.slice(0, idx).map((i) => i.uuid).filter((u) => selected.includes(u)));
  }

  const setMode = (key: number, patch: Partial<ModeRow>) => setModes((ms) => ms.map((m) => (m.key === key ? { ...m, ...patch } : m)));

  async function submit() {
    if (!acc) return;
    if (received + walletUse <= 0) { toast.error("Enter the amount received"); return; }
    for (const m of modes) {
      if ((m.mode === "cheque" || m.mode === "dd") && !m.reference.trim()) { toast.error(`Enter the ${m.mode === "dd" ? "demand draft" : "cheque"} number`); return; }
    }
    if (extra > 0 && !meta?.allow_advance) { toast.error(`That is ${money(extra, cur)} more than the dues`); return; }
    const ok = await confirm({
      title: `Collect ${money(received, cur, { decimals: true })}?`,
      message: extra > 0 ? `${money(extra, cur)} more than the selected dues will be kept as advance.` :
        received + walletUse < payable ? "This is a part payment; the oldest dues are paid first." : "The selected dues will be marked paid.",
      confirmLabel: "Collect and issue receipt",
    });
    if (!ok) return;
    setSaving(true);
    try {
      const body = {
        student_uuid: uuid, invoice_uuids: selected.length ? selected : null, use_wallet: walletUse, waive_late_fee: waive,
        paid_on: paidOn || null, notes: notes.trim() || null,
        modes: modes.map((m) => ({ mode: m.mode, amount: m.amount ?? (modes.length === 1 ? suggested : 0), reference: m.reference.trim() || null,
          bank: m.bank.trim() || null, instrument_date: m.instrument_date || null })),
      };
      const p = await api.post<Payment>("/fees/collect", body);
      setReceipt(p);
      load();
    } catch (e) { toast.error("Couldn't record the payment", { description: errMsg(e) }); }
    finally { setSaving(false); }
  }

  if (!acc) return <div className="grid gap-5 lg:grid-cols-5"><Skeleton className="h-[360px] rounded-2xl lg:col-span-3" /><Skeleton className="h-[360px] rounded-2xl lg:col-span-2" /></div>;
  const s = acc.student;
  const modeOptions = Object.entries(meta?.modes ?? { cash: "Cash" }).filter(([k]) => k !== "online").map(([value, label]) => ({ value, label }));

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-5 lg:col-span-3">
          <Paper className="flex flex-wrap items-center gap-4 p-5">
            <Avatar name={s.name} src={s.photo_url || undefined} size={48} />
            <div className="min-w-0 flex-1">
              <p className="text-[17px] text-ink">{s.name}</p>
              <p className="text-[13px] text-muted">{[s.admission_no, s.section_label].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="text-right">
              <p className="text-[12px] text-faint">Total due</p>
              <p className="tabular text-[22px] font-light text-ink">{money(n(acc.total_due), cur)}</p>
              {n(acc.overdue) > 0 && <p className="text-[12px] text-rose-700">{money(acc.overdue, cur)} overdue</p>}
            </div>
          </Paper>

          <Paper>
            <PaperHeader title="Dues by instalment" action={wallet > 0 ? <Badge tone="accent">Advance {money(wallet, cur)}</Badge> : undefined} />
            {acc.open.length === 0 ? <EmptyState icon={CheckCircle2} title="No dues" hint="Everything billed so far is paid. Money taken now is kept as advance." /> : (
              <ul className="divide-y divide-line">
                {acc.open.map((inv) => (
                  <li key={inv.uuid} className="px-5 py-3">
                    <div className="flex items-start gap-3">
                      <Checkbox checked={selected.includes(inv.uuid)} onChange={(v) => toggle(inv, v)} aria-label={`Pay ${inv.title}`} />
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setExpanded(expanded === inv.uuid ? null : inv.uuid)}>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[14.5px] text-ink">{inv.title}</span>
                          <InvoiceStatus inv={inv} today={acc.today} />
                        </div>
                        <p className="text-[12.5px] text-faint">Due {formatDate(inv.due_date)} · {inv.number}</p>
                      </button>
                      <div className="text-right">
                        <p className="tabular text-[14.5px] text-ink">{money(n(inv.balance) + (waive ? 0 : n(inv.late_fee)), cur)}</p>
                        {n(inv.late_fee) > 0 && <p className={`text-[12px] ${waive ? "text-faint line-through" : "text-amber-700"}`}>incl. late fee {money(inv.late_fee, cur)}</p>}
                      </div>
                    </div>
                    {expanded === inv.uuid && (
                      <table className="mt-3 w-full text-[13px]">
                        <tbody>
                          {(inv.lines ?? []).map((ln) => (
                            <tr key={ln.id} className="border-t border-line/70">
                              <td className="py-1.5 pl-8 text-ink/80">{ln.description}{ln.concession_note && <span className="block text-[12px] text-emerald-700">{ln.concession_note}: −{money(ln.concession, cur)}</span>}</td>
                              <td className="py-1.5 text-right tabular text-muted">{money(ln.net, cur)}</td>
                              <td className="py-1.5 text-right tabular text-ink">{n(ln.due) > 0 ? `${money(ln.due, cur)} due` : "Paid"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Paper>

          <Paper>
            <PaperHeader title="Past receipts" />
            {acc.payments.length === 0 ? <p className="px-5 py-6 text-center text-[13.5px] text-muted">No receipts yet.</p> : (
              <ul className="divide-y divide-line">
                {acc.payments.slice(0, 10).map((p) => (
                  <li key={p.uuid} className="flex items-center gap-3 px-5 py-2.5 text-[14px]">
                    <div className="min-w-0 flex-1">
                      <p className="text-ink">{p.number} <span className="text-faint">· {formatDate(p.paid_on)} · {p.mode_label}</span></p>
                    </div>
                    <PaymentStatus status={p.status} />
                    <span className="tabular w-24 text-right text-ink">{money(p.amount, cur)}</span>
                    <Button size="sm" variant="ghost" icon={Download} aria-label="Download receipt" onClick={() => downloadFile(`/fees/payments/${p.uuid}/pdf`, "receipt.pdf").catch((e) => toast.error(errMsg(e)))} />
                  </li>
                ))}
              </ul>
            )}
          </Paper>
        </div>

        <Paper className="h-fit lg:col-span-2">
          <PaperHeader title="Payment" />
          <div className="space-y-4 p-5">
            <div className="flex items-center justify-between rounded-xl bg-sunken px-4 py-3">
              <span className="text-[13.5px] text-muted">Selected dues</span>
              <span className="tabular text-[20px] font-light text-ink">{money(payable, cur, { decimals: true })}</span>
            </div>
            {wallet > 0 && (
              <Checkbox checked={useWallet} onChange={setUseWallet} label={`Use advance balance (${money(wallet, cur)})`}
                description={useWallet ? `${money(walletUse, cur)} will be used` : undefined} />
            )}
            {chosen.some((i) => n(i.late_fee) > 0) && can("fees.manage") && (
              <Checkbox checked={waive} onChange={setWaive} label="Waive the late fee" />
            )}
            {modes.map((m, i) => (
              <div key={m.key} className="space-y-3 rounded-xl border border-line p-3">
                <div className="flex items-end gap-2">
                  <Field label={modes.length > 1 ? `Mode ${i + 1}` : "Paid by"} className="flex-1">
                    <Select<string> value={m.mode} onChange={(v) => setMode(m.key, { mode: v || "cash" })} options={modeOptions} />
                  </Field>
                  <Field label="Amount" className="w-36">
                    <NumberInput value={m.amount ?? (modes.length === 1 ? suggested : null)} onChange={(v) => setMode(m.key, { amount: v })} min={0} step={1} />
                  </Field>
                  {modes.length > 1 && <Button variant="ghost" icon={Trash2} aria-label="Remove mode" onClick={() => setModes(modes.filter((x) => x.key !== m.key))} />}
                </div>
                {(m.mode === "cheque" || m.mode === "dd") && (
                  <FormGrid columns={3}>
                    <Field label={m.mode === "dd" ? "DD number" : "Cheque number"} required><TextInput value={m.reference} onValueChange={(v) => setMode(m.key, { reference: v })} /></Field>
                    <Field label="Bank"><TextInput value={m.bank} onValueChange={(v) => setMode(m.key, { bank: v })} /></Field>
                    <Field label="Date"><DateInput value={m.instrument_date} onChange={(v) => setMode(m.key, { instrument_date: v })} /></Field>
                  </FormGrid>
                )}
                {["upi", "card", "bank_transfer"].includes(m.mode) && (
                  <Field label="Transaction reference" aside="Optional"><TextInput value={m.reference} onValueChange={(v) => setMode(m.key, { reference: v })} placeholder="UTR / approval code" /></Field>
                )}
              </div>
            ))}
            <Button size="sm" variant="ghost" icon={Plus} onClick={() => {
              const first = modes.length === 1 && modes[0].amount === null ? [{ ...modes[0], amount: suggested }] : modes;
              setModes([...first, { key: modeKey++, mode: "upi", amount: 0, reference: "", bank: "", instrument_date: "" }]);
            }}>Split across another mode</Button>
            <FormGrid>
              <Field label="Payment date"><DateInput value={paidOn} onChange={setPaidOn} max={todayISO()} /></Field>
            </FormGrid>
            <Field label="Note" aside="Optional"><Textarea value={notes} onValueChange={setNotes} rows={2} /></Field>
            <div className="space-y-1 border-t border-line pt-3 text-[13.5px]">
              <div className="flex justify-between"><span className="text-muted">Received</span><span className="tabular text-ink">{money(received, cur, { decimals: true })}</span></div>
              {walletUse > 0 && <div className="flex justify-between"><span className="text-muted">From advance</span><span className="tabular text-ink">{money(walletUse, cur, { decimals: true })}</span></div>}
              {extra > 0 && <div className="flex justify-between text-primary"><span>Kept as advance</span><span className="tabular">{money(extra, cur, { decimals: true })}</span></div>}
              {extra < 0 && <div className="flex justify-between text-amber-700"><span>Still due after this</span><span className="tabular">{money(-extra, cur, { decimals: true })}</span></div>}
            </div>
            <Button variant="primary" icon={HandCoins} className="w-full justify-center" loading={saving} onClick={submit} disabled={!can("fees.collect")}>
              Collect {money(received, cur)}
            </Button>
          </div>
        </Paper>
      </div>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} size="sm" title="Payment recorded"
        footer={<><Button icon={Printer} onClick={() => receipt && printReceipt(receipt.uuid).catch((e) => toast.error(errMsg(e)))}>Print</Button>
          <Button variant="primary" icon={Download} onClick={() => receipt && downloadFile(`/fees/payments/${receipt.uuid}/pdf`, "receipt.pdf").catch((e) => toast.error(errMsg(e)))}>Download PDF</Button></>}>
        {receipt && (
          <div className="flex flex-col items-center py-2 text-center">
            <CheckCircle2 size={36} strokeWidth={1.2} className="mb-3 text-emerald-600" />
            <p className="tabular text-[26px] font-light text-ink">{money(n(receipt.amount) + n(receipt.wallet_used), cur, { decimals: true })}</p>
            <p className="mt-1 text-[13.5px] text-muted">Receipt {receipt.number} · {receipt.student_name}</p>
            {n(receipt.late_fee) > 0 && <p className="mt-1 text-[12.5px] text-faint">Includes late fee {money(receipt.late_fee, cur)}</p>}
            {n(receipt.advance) > 0 && <p className="mt-1 flex items-center gap-1 text-[12.5px] text-primary"><Wallet size={13} strokeWidth={1.4} />{money(receipt.advance, cur)} kept as advance</p>}
          </div>
        )}
      </Modal>
    </>
  );
}
