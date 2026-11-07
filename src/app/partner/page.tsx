"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Copy, Share2, Wallet, Building2, IndianRupee, Clock } from "lucide-react";
import { platformApi, rupee } from "@/lib/platform-api";

const api = platformApi("/partner/login");
type Summary = { ref_code: string; share_url: string; leads: number; converted: number; balances: { pending: number; requested: number; paid: number; earned: number }; rules: { first_payment_bonus: number; percent: number; percent_months: number; min_payout: number }; prices: { standard: number; standard_whatsapp: number }; user: { upi_id: string | null } };
type CompanyRow = { id: number; name: string; city: string | null; joined_at: string | null; status: string; plan: string; first_paid_at: string | null; earned: number };
type Commission = { id: number; company: string; kind: "bonus" | "percent"; amount: number; status: string; date: string };
type Payout = { id: number; amount: number; upi_id: string; status: string; reference: string | null; requested_at: string | null; settled_at: string | null };

export default function PartnerHome() {
  const [s, setS] = useState<Summary | null>(null);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [upi, setUpi] = useState("");
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [a, b, c, d] = await Promise.all([api.get<Summary>("/me/summary"), api.get<CompanyRow[]>("/me/companies"), api.get<Commission[]>("/me/commissions"), api.get<Payout[]>("/me/payouts")]);
    setS(a); setCompanies(b); setCommissions(c); setPayouts(d); setUpi((u) => u || a.user.upi_id || "");
  }, []);
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [load]);

  async function redeem() {
    setBusy(true); setMsg("");
    try { const r = await api.post<{ amount: number }>("/me/payouts", { upi_id: upi }); setMsg(`Requested ${rupee(r.amount)}. You will be paid to ${upi} and it will show as paid here.`); await load(); }
    catch (e: unknown) { setMsg(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }
  function copy() { navigator.clipboard?.writeText(s!.share_url); setMsg("Link copied. Share it on WhatsApp or ask the company to type the code at sign-up."); }
  function share() {
    if (navigator.share) navigator.share({ title: "Next Gen HRMS", text: `HR and payroll for Indian companies. Sign up with my code ${s!.ref_code}`, url: s!.share_url }).catch(() => {});
    else copy();
  }

  if (!s) return <div className="flex h-40 items-center justify-center text-gray-400"><Loader2 className="animate-spin" /></div>;
  const canRedeem = s.balances.pending >= s.rules.min_payout && !payouts.some((p) => p.status === "requested");

  return (
    <div className="space-y-5">
      {msg && <p className="rounded-lg bg-gray-900 px-3 py-2 text-xs text-white">{msg} <button onClick={() => setMsg("")} className="ml-2 underline">dismiss</button></p>}

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <p className="text-xs text-gray-500">Your referral code</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <span className="rounded-lg bg-gray-900 px-3 py-1.5 font-mono text-lg tracking-widest text-white">{s.ref_code}</span>
          <button onClick={copy} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs text-gray-700"><Copy size={13} /> Copy link</button>
          <button onClick={share} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-white"><Share2 size={13} /> Share</button>
        </div>
        <p className="mt-2 text-xs text-gray-500">Companies enter this code when they register. You earn {rupee(s.rules.first_payment_bonus)} when a company makes its first payment and {s.rules.percent}% of every payment for its first {s.rules.percent_months} months. Plans: Standard {rupee(s.prices.standard)}/mo, with WhatsApp {rupee(s.prices.standard_whatsapp)}/mo.</p>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[{ l: "Companies signed up", v: s.leads + s.converted, i: Building2 }, { l: "Paying companies", v: s.converted, i: IndianRupee }, { l: "Earned so far", v: rupee(s.balances.earned), i: Wallet }, { l: "Ready to redeem", v: rupee(s.balances.pending), i: Clock }].map((t) => (
          <div key={t.l} className="rounded-xl border border-gray-200 bg-white p-4"><t.i size={16} className="text-gray-400" /><p className="mt-2 text-xl font-semibold text-gray-900 tabular-nums">{t.v}</p><p className="text-xs text-gray-500">{t.l}</p></div>
        ))}
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-medium text-gray-900">Redeem earnings</h2>
        <p className="mt-0.5 text-xs text-gray-500">Minimum {rupee(s.rules.min_payout)}. Paid to your UPI id, usually within a few days.{s.balances.requested > 0 ? ` ${rupee(s.balances.requested)} is being processed.` : ""}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="Your UPI id (name@bank)" className="h-10 w-64 rounded-lg border border-gray-200 px-3 text-sm" />
          <button onClick={redeem} disabled={!canRedeem || busy || !upi} className="h-10 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white disabled:opacity-40">Redeem {rupee(s.balances.pending)}</button>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-gray-700">Your companies</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white"><table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500"><tr><th className="px-4 py-2.5">Company</th><th className="px-3 py-2.5">Joined</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">First paid</th><th className="px-4 py-2.5 text-right">You earned</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {companies.map((c) => <tr key={c.id}><td className="px-4 py-2.5 font-medium text-gray-900">{c.name}{c.city ? <span className="ml-1 text-xs font-normal text-gray-400">· {c.city}</span> : null}</td><td className="px-3 py-2.5 text-xs text-gray-500">{c.joined_at}</td><td className="px-3 py-2.5 text-xs">{c.status === "active" ? <span className="text-green-700">paying · {c.plan === "standard_whatsapp" ? "with WhatsApp" : "standard"}</span> : c.status === "trial" ? <span className="text-blue-700">on trial</span> : <span className="text-gray-500">{c.status}</span>}</td><td className="px-3 py-2.5 text-xs text-gray-500">{c.first_paid_at || "—"}</td><td className="px-4 py-2.5 text-right tabular-nums">{rupee(c.earned)}</td></tr>)}
            {companies.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-xs text-gray-400">No companies yet. Share your code to get started.</td></tr>}
          </tbody></table></div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-medium text-gray-700">Earnings</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white"><table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {commissions.map((c) => <tr key={c.id}><td className="px-4 py-2 text-xs"><span className="font-medium text-gray-900">{c.company}</span><span className="text-gray-400"> · {c.kind === "bonus" ? "first payment bonus" : "share"} · {c.date}</span></td><td className="px-3 py-2 text-right text-xs"><span className="tabular-nums font-medium">{rupee(c.amount)}</span> <span className={`ml-1 ${c.status === "paid" ? "text-green-700" : c.status === "requested" ? "text-amber-700" : "text-gray-400"}`}>{c.status}</span></td></tr>)}
              {commissions.length === 0 && <tr><td className="px-4 py-6 text-center text-xs text-gray-400">Nothing earned yet.</td></tr>}
            </tbody></table></div>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-medium text-gray-700">Payouts</h2>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white"><table className="w-full text-sm">
            <tbody className="divide-y divide-gray-100">
              {payouts.map((p) => <tr key={p.id}><td className="px-4 py-2 text-xs"><span className="font-medium text-gray-900">{rupee(p.amount)}</span><span className="text-gray-400"> · {p.requested_at?.slice(0, 10)} · {p.upi_id}</span></td><td className="px-3 py-2 text-right text-xs"><span className={p.status === "paid" ? "text-green-700" : p.status === "rejected" ? "text-red-600" : "text-amber-700"}>{p.status}</span>{p.reference ? <span className="ml-1 text-gray-400">{p.reference}</span> : null}</td></tr>)}
              {payouts.length === 0 && <tr><td className="px-4 py-6 text-center text-xs text-gray-400">No payouts yet.</td></tr>}
            </tbody></table></div>
        </section>
      </div>
    </div>
  );
}
