"use client";

import { formatDate } from "@/lib/datetime";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, Ticket, X, CheckCircle2, MessageCircle, QrCode, Phone, Copy, Check, Smartphone, Clock, ShieldCheck, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/shell/page";

type Plan = { id: string; name: string; tagline: string; price: number; features: string[]; whatsapp: boolean; badge?: string };
type Period = { id: string; label: string; months: number; discount: number; coupons: boolean };
type Deal = { plan: { id: string; name: string; price: number; features: string[]; whatsapp: boolean }; period: { id: string; label: string; months: number; discount: number }; coupon: { code: string; percent: number } | null; amount: number; period_start?: string; period_end?: string };
type Sub = { plan: string; plan_name?: string; plan_details?: Deal | null; paid: boolean; whatsapp: boolean; status: "active" | "trial" | "grace" | "expired"; trial_ends_at: string | null; paid_until: string | null; days_left: number | null; plans: Plan[]; periods: Period[]; has_coupons?: boolean; trial_days?: number; pay_to: { upi_id: string; name: string; support_phone: string; note: string } };

const rupee = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const niceDate = (s: string | null | undefined) => (s ? formatDate(s) || s : "");
// Same rounding as the server: real prices to the nearest ₹50, tiny ones (₹1 test plan) to the rupee
const roundPrice = (raw: number) => (raw >= 500 ? Math.round(raw / 50) * 50 : Math.max(1, Math.round(raw)));

/** Plan, status and how to pay. Plans and payment choices come from the platform admin.
 *  Payment is a UPI transfer confirmed by the platform team. */
export default function SubscriptionPage() {
  const [s, setS] = useState<Sub | null>(null);
  const [plan, setPlan] = useState<string>("");
  const [periodId, setPeriodId] = useState<string>("");
  const [copied, setCopied] = useState<string | null>(null);
  // Coupon code for an extra % off (only on payment choices that allow coupons)
  const [coupon, setCoupon] = useState<{ code: string; percent: number } | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [codeErr, setCodeErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [showCode, setShowCode] = useState(false);
  async function applyCode() {
    const code = codeInput.trim();
    if (!code || !s) return;
    setChecking(true); setCodeErr("");
    try {
      const c = await api.get<{ code: string; percent: number }>(`/settings/subscription/coupon?code=${encodeURIComponent(code)}`);
      setCoupon(c); setCodeInput("");
      const cur = s.periods.find((p) => p.id === periodId);
      if (!cur?.coupons) { const ok = s.periods.find((p) => p.coupons); if (ok) setPeriodId(ok.id); }
    } catch (e: unknown) {
      setCodeErr(e instanceof Error ? e.message : "This coupon code isn't valid");
    } finally { setChecking(false); }
  }
  useEffect(() => {
    api.get<Sub>("/settings/subscription").then((d) => {
      setS(d);
      setPlan(d.plans.some((p) => p.id === d.plan) ? d.plan : d.plans[0]?.id || "");
      setPeriodId(d.periods[0]?.id || "");
    }).catch(() => {});
  }, []);
  // Payment code for the UPI note: the server records the deal (plan, period, coupon, amount) against it
  const [payCode, setPayCode] = useState<{ code: string; amount: number; key: string; period_start: string; period_end: string } | null>(null);
  const curPeriod = s?.periods.find((p) => p.id === periodId);
  const couponKey = coupon && curPeriod?.coupons ? coupon.code : "";
  useEffect(() => {
    if (!s || !plan || !periodId) return;
    const key = `${plan}|${periodId}|${couponKey}`;
    let alive = true;
    const tm = setTimeout(() => {
      api.post<{ code: string; amount: number; period_start: string; period_end: string }>("/settings/subscription/payment-code", { plan, period: periodId, coupon: couponKey || null })
        .then((r) => { if (alive) setPayCode({ ...r, key }); })
        .catch(() => { if (alive) setPayCode(null); });
    }, 250);
    return () => { alive = false; clearTimeout(tm); };
  }, [s, plan, periodId, couponKey]);
  if (!s) return <div className="flex h-40 items-center justify-center text-faint"><Loader2 className="animate-spin" strokeWidth={1.5} /></div>;
  if (!s.plans.length || !s.periods.length) return <div className="rounded-2xl border border-line bg-surface p-8 text-center text-[13px] font-light text-muted">Plans are being updated. Please check back soon.</div>;

  const PLANS = s.plans.map((p) => ({ ...p, tag: p.tagline }));
  const months = curPeriod?.months ?? 1;
  const periodBy = (m: number) => s.periods.find((p) => p.months === m);
  const setMonths = (m: number) => { const p = periodBy(m); if (p) setPeriodId(p.id); };
  const priceOf = (id: string) => s.plans.find((p) => p.id === id)?.price ?? 0;
  const offFor = (m: number) => periodBy(m)?.discount ?? 0;
  const couponFor = (m: number) => (coupon && periodBy(m)?.coupons ? coupon.percent : 0);
  const totalFor = (p: string, m: number) => {
    const base = priceOf(p) * m;
    if (!offFor(m) && !couponFor(m)) return base;
    return roundPrice(base * (1 - offFor(m) / 100) * (1 - couponFor(m) / 100));
  };
  const price = totalFor(plan, months);
  const beforeCoupon = offFor(months) ? roundPrice(priceOf(plan) * months * (1 - offFor(months) / 100)) : priceOf(plan) * months;
  const couponSaving = Math.max(0, beforeCoupon - price);
  const full = priceOf(plan) * months;
  const PERIODS = s.periods.map((p) => ({ m: p.months, label: p.label }));
  const bestPeriod = [...s.periods].sort((a, b) => b.discount - a.discount)[0];
  const bestOff = bestPeriod?.discount ?? 0;
  const couponPeriods = s.periods.filter((p) => p.coupons);
  const couponWhere = couponPeriods.map((p) => p.label.toLowerCase()).join(" or ");
  const ready = !!payCode && payCode.key === `${plan}|${periodId}|${couponKey}`;
  const payAmount = ready ? Math.round(payCode!.amount) : price;
  const upiUrl = s.pay_to.upi_id && ready
    ? `upi://pay?pa=${s.pay_to.upi_id.trim()}&pn=${encodeURIComponent(s.pay_to.name || "Next Gen HRMS")}&mc=0000&mode=02&purpose=00&am=${payAmount}.00&cu=INR&tn=${payCode!.code}`
    : "";
  const copiedNote = copied === "note";
  const currentName = s.plan_name || s.plans.find((p) => p.id === s.plan)?.name || "Current";
  const deal = s.status === "active" ? s.plan_details : null;
  const planWhatsapp = s.plans.find((p) => p.id === plan)?.whatsapp;

  const tone = s.status === "active" ? { pill: "border-emerald-200 text-emerald-700", dot: "bg-emerald-500", ring: "#4f46e5", label: "Active" }
    : s.status === "trial" ? { pill: "border-sky-200 text-sky-700", dot: "bg-sky-400", ring: "#38bdf8", label: "Free trial" }
    : s.status === "grace" ? { pill: "border-amber-200 text-amber-700", dot: "bg-amber-400", ring: "#f59e0b", label: "Payment due" }
    : { pill: "border-rose-200 text-rose-700", dot: "bg-rose-500", ring: "#f43f5e", label: "Expired" };
  const headline = s.status === "active" ? `Paid until ${niceDate(s.paid_until)}`
    : s.status === "trial" ? `Your free trial ends${s.trial_ends_at ? " on " + niceDate(s.trial_ends_at) : " soon"}`
    : s.status === "grace" ? "Your trial has ended"
    : "Your subscription has ended";
  const subline = s.status === "active" ? "Everything is switched on. Renew any time to extend."
    : s.status === "trial" ? "Everything is unlocked during the trial. Pay any time to keep it running."
    : s.status === "grace" ? `Everything keeps working for ${s.days_left} more day${s.days_left === 1 ? "" : "s"}. Pay to keep it running.`
    : "Some features are paused until the payment is confirmed. Your data is safe.";
  const ringTotal = s.status === "trial" ? (s.trial_days || 30) : s.status === "grace" ? 7 : 30;
  const left = Math.max(0, s.days_left ?? 0);
  const pct = Math.min(1, left / ringTotal);
  const R = 34, C = 2 * Math.PI * R;

  const payNote = ready ? payCode!.code : "…";
  const periodLabel = ready ? `${niceDate(payCode!.period_start)} – ${niceDate(payCode!.period_end)}` : "";
  const copyText = (key: string, text: string) => { navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(null), 1800); }); };

  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader eyebrow="Settings" title="Subscription" description="Your plan, how long it runs, and how to pay." />

      {/* Status */}
      <div className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 sm:flex-row sm:items-center">
        <div className="relative h-[84px] w-[84px] flex-shrink-0">
          <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
            <circle cx="42" cy="42" r={R} fill="none" stroke="#f1f2f4" strokeWidth="6" />
            <circle cx="42" cy="42" r={R} fill="none" stroke={tone.ring} strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - pct)} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className="text-[22px] font-light text-ink">{s.days_left ?? "–"}</span>
            <span className="mt-0.5 text-[10px] font-light text-muted">days left</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-normal ${tone.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />{tone.label}</span>
            <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-normal text-muted">{currentName} plan</span>
          </div>
          <div className="mt-2 text-[18px] font-light tracking-[-0.01em] text-ink">{headline}</div>
          <p className="text-[13px] font-light text-muted">{subline}</p>
          {deal && (
            <p className="mt-2 inline-flex flex-wrap items-center gap-x-2 rounded-full bg-sunken px-3 py-1 text-[12px] font-light text-muted">
              <span className="text-ink">{deal.plan.name}</span>· {rupee(deal.plan.price)}/month · {deal.period.label}
              {deal.coupon && <span>· coupon {deal.coupon.code}</span>}
              {deal.period_end && <span>· runs until {niceDate(deal.period_end)}</span>}
            </p>
          )}
        </div>
        <a href="#pay" className="inline-flex h-10 flex-shrink-0 items-center justify-center rounded-full bg-ink px-5 text-[13px] font-normal text-white hover:bg-ink/90">
          {s.status === "active" ? "Renew" : "Pay now"}
        </a>
      </div>

      {/* Billing period: drives every price on the page */}
      <div className="flex flex-col items-center gap-2 pt-1">
        <div className="flex flex-wrap justify-center gap-1 rounded-full border border-line bg-surface p-1">
          {PERIODS.map(({ m, label }) => {
            const on = months === m;
            const off = offFor(m);
            return (
              <button key={m} type="button" onClick={() => setMonths(m)}
                className={`relative flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-normal transition-colors ${on ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
                {label}
                {off > 0 && <span className={`rounded-full px-1.5 py-px text-[10.5px] font-normal ${on ? "bg-surface/15 text-white" : "bg-emerald-50 text-emerald-700"}`}>−{off}%</span>}
              </button>
            );
          })}
        </div>
        <p className="text-[12px] font-light text-muted">
          {bestOff > 0 ? <>Pay {bestPeriod.label.toLowerCase()} and save <span className="text-emerald-700">{bestOff}%</span>, that&apos;s {rupee(priceOf(plan) * bestPeriod.months - roundPrice(priceOf(plan) * bestPeriod.months * (1 - bestOff / 100)))} on {PLANS.find(p => p.id === plan)!.name}.</> : "Pick how often you want to pay."}
        </p>
            {/* Coupon */}
            <div className="flex w-full justify-center">
              {coupon ? (
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <span className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/60 px-3 py-1.5 text-[12.5px] font-normal text-emerald-800">
                    <Ticket size={14} strokeWidth={1.5} /> {coupon.code} · {coupon.percent}% off
                  </span>
                  <span className="text-[12.5px] font-light text-muted">
                    {couponFor(months) ? `You save ${rupee(couponSaving)} more with this code.` : `Coupons work on ${couponWhere} payment only.`}
                  </span>
                  {!couponFor(months) && couponPeriods[0] && (
                    <button type="button" onClick={() => setPeriodId(couponPeriods[0].id)} className="text-[12.5px] font-normal text-ink underline underline-offset-2">Switch to {couponPeriods[0].label.toLowerCase()}</button>
                  )}
                  <button type="button" onClick={() => setCoupon(null)} className="flex items-center gap-1 text-[12px] font-light text-muted hover:text-ink"><X size={13} strokeWidth={1.5} />Remove</button>
                </div>
              ) : showCode ? (
                <div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <div className="relative w-64">
                      <Ticket size={15} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                      <input autoFocus value={codeInput} onChange={(e) => { setCodeInput(e.target.value.toUpperCase()); setCodeErr(""); }}
                        onKeyDown={(e) => { if (e.key === "Enter") applyCode(); if (e.key === "Escape") setShowCode(false); }}
                        placeholder="Coupon code" className={`w-full rounded-full border py-2 pl-9 pr-3 text-[13px] font-light uppercase tracking-wide outline-none placeholder:normal-case placeholder:tracking-normal focus:border-line-strong ${codeErr ? "border-rose-300" : "border-line"}`} />
                    </div>
                    <button type="button" onClick={applyCode} disabled={!codeInput.trim() || checking}
                      className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[12.5px] font-normal text-white hover:bg-ink/90 disabled:opacity-40">{checking ? "Checking…" : "Apply"}</button>
                    <button type="button" onClick={() => { setShowCode(false); setCodeErr(""); }} className="text-[12.5px] font-light text-muted hover:text-ink">Cancel</button>
                  </div>
                  {codeErr && <p className="mt-1.5 text-center text-[12px] font-light text-rose-600">{codeErr}</p>}
                </div>
              ) : (
                <button type="button" onClick={() => setShowCode(true)} className="flex items-center gap-2 rounded-full border border-dashed border-line-strong bg-surface px-4 py-1.5 text-[12.5px] font-normal text-ink hover:border-line-strong hover:text-ink">
                  <Ticket size={15} strokeWidth={1.5} className="text-muted" /> Have a coupon code?{!curPeriod?.coupons && couponWhere && <span className="font-light text-faint"> · {couponWhere} plans</span>}
                </button>
              )}
            </div>
      </div>

      {/* Plans */}
      <div className={`grid gap-3 md:grid-cols-2 ${PLANS.length >= 3 ? "xl:grid-cols-3" : ""}`}>
        {PLANS.map((p) => {
          const on = plan === p.id;
          const current = s.plan === p.id;
          return (
            <button key={p.id} type="button" onClick={() => setPlan(p.id)}
              className={`flex flex-col rounded-2xl border bg-surface p-6 text-left transition ${on ? "border-ink ring-4 ring-primary-soft" : "border-line hover:border-line-strong"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    {p.whatsapp ? <MessageCircle size={16} strokeWidth={1.5} className="text-muted" /> : <Sparkles size={16} strokeWidth={1.5} className="text-muted" />}
                    <span className="text-[15px] font-normal text-ink">{p.name}</span>
                    {current && <span className="rounded-full border border-emerald-200 px-2 py-0.5 text-[10.5px] font-normal text-emerald-700">Current</span>}
                    {p.badge && <span className="rounded-full bg-primary px-2 py-0.5 text-[10.5px] font-normal text-white">{p.badge}</span>}
                  </div>
                  <p className="mt-0.5 text-[12.5px] font-light text-muted">{p.tag}</p>
                </div>
                <span className={`mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border ${on ? "border-ink bg-ink" : "border-line-strong"}`}>{on && <Check size={12} strokeWidth={2} className="text-white" />}</span>
              </div>
              {(() => {
                const total = totalFor(p.id, months);
                const perMonth = Math.round(total / months);
                const save = priceOf(p.id) * months - total;
                return (
                  <>
                    <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-[32px] font-light tracking-[-0.02em] text-ink">{rupee(perMonth)}</span>
                      <span className="text-[13px] font-light text-muted">/ month</span>
                      {perMonth < priceOf(p.id) && <span className="text-[14px] font-light text-faint line-through">{rupee(priceOf(p.id))}</span>}
                      {total < priceOf(p.id) * months && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-normal text-emerald-700">Save {Math.round((1 - total / (priceOf(p.id) * months)) * 100)}%{couponFor(months) ? " with coupon" : ""}</span>}
                    </div>
                    <p className="mt-1 text-[12.5px] font-light text-muted">
                      {months === 1 ? "Billed every month" : <>{rupee(total)} billed {months === 12 ? "once a year" : `every ${months} months`}{save > 0 && <span className="text-emerald-700"> · you save {rupee(save)}</span>}</>}
                    </p>
                  </>
                );
              })()}
              <ul className="mt-4 space-y-2 border-t border-line pt-4">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13px] font-light text-ink">
                    <CheckCircle2 size={15} strokeWidth={1.5} className="mt-0.5 flex-shrink-0 text-primary" />{f}
                  </li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* Pay */}
      <div id="pay" className="scroll-mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
          <div>
            <h2 className="text-[15px] font-normal text-ink">Pay with UPI</h2>
            <p className="text-[12.5px] font-light text-muted">{PLANS.find(p => p.id === plan)!.name} · {periodLabel || curPeriod?.label}{offFor(months) ? ` · ${curPeriod?.label} discount ${offFor(months)}%` : ""}{couponFor(months) ? ` · coupon ${coupon!.code} −${couponFor(months)}%` : ""}</p>
          </div>
          <a href="#top-billing" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-[12.5px] font-light text-muted underline decoration-line-strong underline-offset-2 hover:text-ink">Change plan or period</a>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-[220px_minmax(0,1fr)]">
          {/* QR */}
          <div className="flex flex-col items-center">
            <div className="rounded-2xl border border-line p-3">
              {upiUrl ? <QRCodeSVG value={upiUrl} size={180} fgColor="#1f2937" /> : <div className="flex h-[180px] w-[180px] items-center justify-center rounded-xl bg-sunken text-faint">{s.pay_to.upi_id ? <Loader2 size={24} strokeWidth={1.5} className="animate-spin" /> : <QrCode size={32} strokeWidth={1.5} />}</div>}
            </div>
            <div className="mt-3 text-center">
              {full > price && <div className="text-[12.5px] font-light text-faint line-through">{rupee(full)}</div>}
              <div className="text-[26px] font-light tracking-[-0.02em] text-ink">{rupee(payAmount)}</div>
              <div className="text-[11.5px] font-light text-muted">to pay</div>
            </div>
            {s.pay_to.upi_id ? (
              <button type="button" onClick={() => copyText("upi", s.pay_to.upi_id)} className="mt-2 flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12px] font-light text-ink hover:border-line-strong">
                {s.pay_to.upi_id}{copied === "upi" ? <Check size={12} strokeWidth={2} className="text-emerald-600" /> : <Copy size={12} strokeWidth={1.5} className="text-faint" />}
              </button>
            ) : <p className="mt-2 text-[11.5px] font-light text-faint">UPI details will appear here</p>}
            {upiUrl && <a href={upiUrl} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-full bg-ink px-4 text-[12.5px] font-normal text-white md:hidden"><Smartphone size={13} strokeWidth={1.5} />Open UPI app</a>}
          </div>

          {/* Steps */}
          <div>
            <ol className="relative space-y-5">
              <span className="absolute bottom-3 left-[15px] top-3 w-px bg-line" />
              {[
                { icon: QrCode, title: "Scan and pay", text: `Use Google Pay, PhonePe, Paytm or any UPI app. The amount (${rupee(payAmount)}) and your payment code are already filled in. Just pay.` },
                { icon: Clock, title: "We confirm it", text: `We match your payment code and switch on your plan, usually within one working day. Nothing to send.` },
                { icon: ShieldCheck, title: "You're all set", text: `This page shows the new paid-until date${planWhatsapp ? " and WhatsApp features switch on" : ""}.` },
              ].map((st, i) => {
                const Icon = st.icon;
                return (
                  <li key={i} className="relative flex gap-4">
                    <span className="z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-line bg-surface"><Icon size={14} strokeWidth={1.5} className="text-muted" /></span>
                    <div className="pt-1">
                      <div className="text-[13.5px] font-normal text-ink">{st.title}</div>
                      <p className="mt-0.5 text-[12.5px] font-light leading-relaxed text-muted">{st.text}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-line px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] font-light text-muted">Your payment code</div>
                <div className="font-mono text-[16px] tracking-[0.12em] text-ink">{payNote}</div>
                <div className="text-[11px] font-light text-faint">Already in the QR. If you pay by typing the UPI ID, add this as the note.</div>
                {periodLabel && <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-0.5 text-[11.5px] font-normal text-ink"><Clock size={11} strokeWidth={1.5} />Pays for {periodLabel}</div>}
              </div>
              <div className="text-right">
                <div className="text-[11.5px] font-light text-muted">Amount</div>
                <div className="text-[14px] font-normal text-ink">{rupee(payAmount)}</div>
              </div>
              <button type="button" disabled={!ready} onClick={() => copyText("note", payNote)}
                className="flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[12px] font-normal text-ink hover:border-line-strong disabled:opacity-40">
                {copiedNote ? <Check size={12} strokeWidth={2} className="text-emerald-600" /> : <Copy size={12} strokeWidth={1.5} />}{copiedNote ? "Copied" : "Copy code"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-sunken px-4 py-3 text-[12px] font-light text-muted">
              <span className="flex items-center gap-1.5"><Clock size={13} strokeWidth={1.5} className="text-muted" />Confirmed within 1 working day</span>
              <span className="flex items-center gap-1.5"><ShieldCheck size={13} strokeWidth={1.5} className="text-muted" />No card details needed</span>
              {s.pay_to.support_phone && <a href={`tel:${s.pay_to.support_phone}`} className="flex items-center gap-1.5 hover:text-ink"><Phone size={13} strokeWidth={1.5} className="text-muted" />{s.pay_to.support_phone}</a>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
