"use client";

import { formatDate } from "@/lib/datetime";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, XCircle, Wallet, Hourglass, IndianRupee } from "lucide-react";
import { PageHeader, Panel, Stat, Flash, Loading, Empty, Pill, Avatar, Modal, Field, inputCls, btn, th, td } from "@/components/admin-ui";
import { platformApi, rupee } from "@/lib/platform-api";

const api = platformApi("/admin/login");
type Payout = { id: number; executive: { id: number; name: string; email: string }; amount: number; upi_id: string; status: "requested" | "paid" | "rejected"; reference: string | null; note: string | null; requested_at: string | null; settled_at: string | null };

export default function AdminPayoutsPage() {
  const [rows, setRows] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState<{ p: Payout; status: "paid" | "rejected" } | null>(null);
  const [ref, setRef] = useState(""); const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => { setLoading(true); try { setRows(await api.get<Payout[]>("/admin/payouts")); } catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Failed"); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);

  async function confirm() {
    if (!settling) return;
    try { await api.put(`/admin/payouts/${settling.p.id}`, { status: settling.status, reference: ref || null, note: note || null }); setMsg(`Payout ${settling.status}`); setSettling(null); setRef(""); setNote(""); load(); }
    catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Failed"); }
  }

  const open = rows.filter((r) => r.status === "requested"); const past = rows.filter((r) => r.status !== "requested");
  const owed = open.reduce((a, p) => a + p.amount, 0);
  const paidOut = past.filter((p) => p.status === "paid").reduce((a, p) => a + p.amount, 0);
  const nice = (d: string | null) => (d ? formatDate(d) : "—");
  const Table = ({ list, actions }: { list: Payout[]; actions: boolean }) => list.length === 0
    ? <Empty icon={actions ? CheckCircle2 : Wallet} title={actions ? "No payout requests waiting" : "Nothing settled yet"} />
    : (
    <div className="overflow-x-auto"><table className="w-full text-[13px]">
      <thead className="border-b border-gray-100"><tr><th className={th}>Partner</th><th className={th}>Pay to (UPI)</th><th className={`${th} text-right`}>Amount</th><th className={th}>Requested</th>{!actions && <th className={th}>Settled</th>}<th className={th}></th></tr></thead>
      <tbody className="divide-y divide-gray-100">
        {list.map((p) => (
          <tr key={p.id} className="transition hover:bg-gray-50/60">
            <td className={td}><div className="flex items-center gap-3"><Avatar name={p.executive.name} size={34} /><div className="min-w-0"><p className="font-normal text-gray-900">{p.executive.name}</p><p className="truncate text-[12px] font-light text-gray-400">{p.executive.email}</p></div></div></td>
            <td className={`${td} font-mono text-[12px] text-gray-700`}>{p.upi_id}</td>
            <td className={`${td} text-right text-[15px] font-normal tabular-nums text-gray-900`}>{rupee(p.amount)}</td>
            <td className={`${td} font-light text-gray-500`}>{nice(p.requested_at)}</td>
            {!actions && <td className={td}><span className="flex flex-wrap items-center gap-1.5"><Pill tone={p.status === "paid" ? "green" : "red"} dot>{p.status === "paid" ? "Paid" : "Rejected"}</Pill><span className="text-[12px] font-light text-gray-400">{nice(p.settled_at)}{p.reference ? ` · ${p.reference}` : ""}</span></span></td>}
            <td className={`${td} whitespace-nowrap text-right`}>
              {actions && <span className="inline-flex gap-1">
                <button onClick={() => setSettling({ p, status: "paid" })} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-gray-900 px-3 text-[12px] font-normal text-white hover:bg-gray-800"><CheckCircle2 size={12} /> Mark paid</button>
                <button onClick={() => setSettling({ p, status: "rejected" })} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-[12px] font-light text-gray-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"><XCircle size={12} /> Reject</button>
              </span>}
            </td>
          </tr>
        ))}
      </tbody></table></div>
  );

  return (
    <div className="space-y-6">
      <PageHeader icon={Wallet} title="Payouts" sub="Pay the partner on UPI, then mark the request paid with the transaction reference." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={Hourglass} label="Waiting" tone="amber" value={open.length} hint="Requests to settle" />
        <Stat icon={IndianRupee} label="To pay now" value={rupee(owed)} />
        <Stat icon={CheckCircle2} label="Paid out" tone="teal" value={rupee(paidOut)} hint={`${past.filter((p) => p.status === "paid").length} payouts`} />
        <Stat icon={XCircle} label="Rejected" value={past.filter((p) => p.status === "rejected").length} />
      </div>
      <Flash msg={msg} onClose={() => setMsg("")} />
      {loading ? <Loading /> : (
        <>
          <Panel icon={Hourglass} title={`Waiting (${open.length})`} pad={false}><Table list={open} actions /></Panel>
          <Panel icon={CheckCircle2} title="Settled" pad={false}><Table list={past} actions={false} /></Panel>
        </>
      )}
      {settling && (
        <Modal title={settling.status === "paid" ? "Mark paid" : "Reject request"} tone={settling.status === "paid" ? "green" : "red"} icon={settling.status === "paid" ? CheckCircle2 : XCircle}
          sub={<>{rupee(settling.p.amount)} to {settling.p.executive.name}</>} onClose={() => setSettling(null)} width="max-w-sm"
          footer={<><button onClick={() => setSettling(null)} className={btn.ghost}>Cancel</button><button onClick={confirm} className={settling.status === "paid" ? btn.primary : btn.danger}>{settling.status === "paid" ? "Confirm paid" : "Reject"}</button></>}>
          <div className="space-y-3">
            {settling.status === "paid" && <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3"><p className="text-[11.5px] font-light text-gray-400">Pay to UPI id</p><p className="font-mono text-[14px] text-gray-900">{settling.p.upi_id}</p></div>}
            <Field label={settling.status === "paid" ? "UPI transaction reference" : "Reason (optional)"}><input value={ref} onChange={(e) => setRef(e.target.value)} className={inputCls} /></Field>
            {settling.status === "paid" && <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field>}
          </div>
        </Modal>
      )}
    </div>
  );
}
