"use client";

import { formatDate } from "@/lib/datetime";
import { useCallback, useEffect, useState } from "react";
import { Search, Loader2, CheckCircle2, Building2, Clock, Ticket, AlertTriangle, X, ScanSearch } from "lucide-react";
import { PageHeader, inputCls } from "@/components/admin-ui";
import { platformApi } from "@/lib/platform-api";

const api = platformApi("/admin/login");
const rupee = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const nice = (s: string | null) => (s ? formatDate(s) : "–");

type CodeView = {
  code: string; status: "pending" | "paid";
  company: { id: number; name: string; slug: string; phone: string | null; email: string | null; city: string | null } | null;
  plan: string; plan_name?: string; months: number; period: string;
  discount_percent: number; coupon_code: string | null; coupon_percent: number;
  amount: number; created_at: string | null; paid_at: string | null;
  current_paid_until: string | null; period_start: string; period_end: string; period_label: string;
  already_covered: boolean; referred_by: string | null;
  subscription: { status: string } | null;
};

const planName = (p: string, name?: string) => name || (p === "standard_whatsapp" ? "Standard + WhatsApp" : "Standard");

/** Type the code from the UPI payment note (seen in PhonePe) to see exactly which company
 *  paid, how much and for which period, then confirm it in one click. */
export default function FindPaymentPage() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [found, setFound] = useState<CodeView | null>(null);
  const [list, setList] = useState<CodeView[]>([]);
  const [tab, setTab] = useState<"pending" | "paid">("pending");
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [utr, setUtr] = useState("");
  const [amount, setAmount] = useState<number | "">("");
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState("");

  const loadList = useCallback(() => { api.get<CodeView[]>(`/admin/payment-codes?status=${tab}`).then(setList).catch(() => setList([])); }, [tab]);
  useEffect(() => { loadList(); }, [loadList]);

  async function find(code?: string) {
    const c = (code ?? q).trim();
    if (!c) return;
    setBusy(true); setErr(""); setDone(""); setFound(null);
    try {
      const r = await api.get<CodeView>(`/admin/payment-codes/${encodeURIComponent(c)}`);
      setFound(r); setQ(r.code); setAmount(Math.round(r.amount)); setUtr("");
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Not found"); }
    finally { setBusy(false); }
  }

  async function confirm() {
    if (!found) return;
    setConfirming(true); setErr("");
    try {
      const r = await api.post<{ paid_until: string; commission: { executive: string; amount: number } | null; payment: CodeView }>(
        `/admin/payment-codes/${found.code}/confirm`,
        { paid_at: paidAt, utr: utr.trim() || null, amount: amount && amount !== Math.round(found.amount) ? amount : null },
      );
      setFound(r.payment);
      setDone(`Confirmed. ${r.payment.company?.name} is paid until ${nice(r.paid_until)}${r.commission ? `. ${r.commission.executive} earns ${rupee(r.commission.amount)}` : ""}.`);
      loadList();
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setConfirming(false); }
  }

  const inp = inputCls;

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader icon={ScanSearch} title="Find payment" sub="Type the code from the payment note in PhonePe. It tells you which company paid, how much and for which period." />

      {/* Search */}
      <form onSubmit={(e) => { e.preventDefault(); find(); }} className="flex gap-2">
        <div className="relative flex-1">
          <Search size={18} strokeWidth={1.5} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value.toUpperCase()); setErr(""); }} placeholder="e.g. CEF5TZ5J"
            className="h-14 w-full rounded-[22px] border border-gray-200/80 bg-white pl-12 pr-4 font-mono text-lg uppercase tracking-[0.15em] outline-none placeholder:font-sans placeholder:text-sm placeholder:normal-case placeholder:tracking-normal focus:border-[#5b9e8f] focus:ring-4 focus:ring-[#5b9e8f]/10" />
        </div>
        <button type="submit" disabled={!q.trim() || busy} className="h-14 rounded-full bg-gray-900 px-7 text-sm text-white disabled:opacity-40">
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Find"}
        </button>
      </form>

      {err && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-700"><AlertTriangle size={15} strokeWidth={1.5} />{err}</div>}
      {done && <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50/60 px-4 py-3 text-sm text-green-800"><CheckCircle2 size={15} strokeWidth={1.5} />{done}</div>}

      {/* Result */}
      {found && (
        <div className="overflow-hidden rounded-[22px] border border-gray-200/80 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-6 py-5">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200"><Building2 size={18} strokeWidth={1.5} className="text-[#3a4557]" /></span>
              <div>
                <div className="text-lg font-light text-gray-900">{found.company?.name ?? "Unknown company"}</div>
                <div className="text-xs text-gray-500">{[found.company?.slug, found.company?.city, found.company?.phone].filter(Boolean).join(" · ")}</div>
              </div>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-xs ${found.status === "paid" ? "border-green-200 text-green-700" : "border-amber-200 text-amber-700"}`}>
              {found.status === "paid" ? `Confirmed ${nice(found.paid_at)}` : "Waiting for payment"}
            </span>
          </div>

          {/* The sentence */}
          <div className="px-6 py-5">
            <p className="text-[17px] font-light leading-relaxed text-gray-800">
              <span className="text-gray-900">{found.company?.name}</span> is paying <span className="text-gray-900">{rupee(found.amount)}</span> for{" "}
              <span className="text-gray-900">{found.period_label}</span> <span className="text-gray-500">({found.period}, {planName(found.plan, found.plan_name)})</span>.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              {[
                { l: "Plan", v: planName(found.plan, found.plan_name) },
                { l: "Period", v: `${nice(found.period_start)} – ${nice(found.period_end)}` },
                { l: "Discount", v: [found.discount_percent ? `${found.discount_percent}% yearly` : "", found.coupon_code ? `${found.coupon_code} −${found.coupon_percent}%` : ""].filter(Boolean).join(" + ") || "None" },
                { l: "Paid until now", v: found.current_paid_until ? nice(found.current_paid_until) : found.subscription?.status === "trial" ? "On free trial" : "Not paid yet" },
              ].map((x) => (
                <div key={x.l} className="rounded-xl bg-gray-50 px-3.5 py-2.5">
                  <div className="text-[11px] text-gray-500">{x.l}</div>
                  <div className="mt-0.5 text-sm text-gray-900">{x.v}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Clock size={12} strokeWidth={1.5} />Code made {nice(found.created_at)}</span>
              {found.coupon_code && <span className="flex items-center gap-1"><Ticket size={12} strokeWidth={1.5} />Coupon {found.coupon_code}</span>}
              {found.referred_by && <span>Brought in by {found.referred_by}</span>}
            </div>
          </div>

          {/* Confirm */}
          {found.status === "pending" && (
            <div className="border-t border-gray-100 bg-gray-50/60 px-6 py-5">
              {found.already_covered && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle size={13} strokeWidth={1.5} />This company is already paid past this period. Confirm only if you really received this money.
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <label className="block text-xs text-gray-600">Received on<input type="date" value={paidAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPaidAt(e.target.value)} className={`mt-1 ${inp}`} /></label>
                <label className="block text-xs text-gray-600">Amount received (₹)<input type="number" value={amount} onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : "")} className={`mt-1 ${inp}`} /></label>
                <label className="block text-xs text-gray-600">UTR (optional)<input value={utr} onChange={(e) => setUtr(e.target.value)} placeholder="12-digit reference" className={`mt-1 ${inp}`} /></label>
                <button onClick={confirm} disabled={confirming} className="h-10 rounded-lg bg-gray-900 px-5 text-sm text-white disabled:opacity-40">
                  {confirming ? "Confirming…" : "Confirm payment"}
                </button>
              </div>
              {amount !== "" && Math.round(found.amount) !== amount && <p className="mt-2 text-xs text-amber-700">Expected {rupee(found.amount)}. The amount you enter is what gets recorded.</p>}
            </div>
          )}
          <button onClick={() => { setFound(null); setQ(""); setDone(""); }} className="flex w-full items-center justify-center gap-1 border-t border-gray-100 py-2.5 text-xs text-gray-500 hover:text-gray-800"><X size={12} />Clear</button>
        </div>
      )}

      {/* Lists */}
      <div className="rounded-[22px] border border-gray-200/80 bg-white">
        <div className="flex items-center gap-4 border-b border-gray-100 px-5">
          {(["pending", "paid"] as const).map((k) => (
            <button key={k} onClick={() => setTab(k)} className={`-mb-px border-b-2 py-3 text-sm ${tab === k ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500"}`}>
              {k === "pending" ? "Waiting for payment" : "Recently confirmed"}
            </button>
          ))}
        </div>
        {list.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">{tab === "pending" ? "No company is waiting to pay." : "Nothing confirmed yet."}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {list.map((r) => (
              <button key={r.code} onClick={() => find(r.code)} className="flex w-full items-center gap-4 px-5 py-3 text-left hover:bg-gray-50">
                <span className="w-24 font-mono text-sm tracking-wider text-gray-900">{r.code}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-gray-900">{r.company?.name}</span>
                  <span className="block truncate text-xs text-gray-500">{planName(r.plan, r.plan_name)} · {r.period_label}{r.coupon_code ? ` · ${r.coupon_code}` : ""}</span>
                </span>
                <span className="text-sm text-gray-900">{rupee(r.amount)}</span>
                <span className="hidden w-24 text-right text-xs text-gray-400 sm:block">{nice(tab === "paid" ? r.paid_at : r.created_at)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
