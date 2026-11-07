"use client";

/*
 * The candidate's offer page (personal link): the offer, the letter, signing it with a
 * one-time code, then accepting; or declining with a reason.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, FileText, PenLine, XCircle } from "lucide-react";
import { resolveImageUrl } from "@/lib/api";
import { formatDisplayDate } from "@/components/ui-kit";
import {
  CompanyMark, PublicCard, PublicMessage, postJson, publicFetch, rupees,
} from "@/components/recruitment/public";

type Line = { code: string; label: string; kind: string; monthly: string; annual: string };
type OfferPage = {
  company: { name: string; logo_url: string | null };
  offer: { number: string | null; status: string; status_label: string; candidate_name: string; job_title: string; designation: string | null;
    department: string | null; location: string | null; employment_type: string | null; reporting_manager: string | null; joining_date: string;
    annual_ctc: string; joining_bonus: string | null; breakup: Line[]; monthly_gross: string | null; probation_months: number | null;
    notice_days: number | null; expires_on: string | null; days_left: number | null; decline_reason: string | null; accepted_name: string | null };
  letter: { url: string; name: string } | null;
  esign: { required: boolean; signed: boolean; status: string | null; token: string | null };
  decline_reasons: string[];
};

const inputCls = "h-10 w-full rounded-lg border border-line bg-surface px-3 text-[14px] outline-none focus:border-primary/50";

export default function OfferPublicPage() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<OfferPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"view" | "sign" | "decline">("view");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(() => {
    publicFetch<OfferPage>(`/public/offers/${token}`).then((x) => { setD(x); setName((n) => n || x.offer.candidate_name); }).catch((e) => setError(e.message));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setMsg(null);
    try { await fn(); } catch (e) { setMsg(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(false); }
  }
  const sendCode = () => run(async () => {
    const r = await postJson<{ sent_to: string; dev_code?: string }>(`/public/esign/${d!.esign.token}/otp`, {});
    setSentTo(r.sent_to); setDevCode(r.dev_code ?? null);
  });
  const signAndAccept = () => run(async () => {
    if (!name.trim()) throw new Error("Type your full name.");
    if (d!.esign.required && !d!.esign.signed) {
      await postJson(`/public/esign/${d!.esign.token}/sign`, { code, typed_name: name });
    }
    await postJson(`/public/offers/${token}/accept`, { typed_name: name });
    setStep("view"); load();
  });
  const decline = () => run(async () => { await postJson(`/public/offers/${token}/decline`, { reason }); setStep("view"); load(); });

  if (error) return <PublicMessage title="This offer link is not valid" hint={error} />;
  if (!d) return <div className="mx-auto max-w-3xl px-4 py-16"><div className="h-60 animate-pulse rounded-2xl bg-sunken" /></div>;
  const o = d.offer;
  const open = o.status === "sent";
  return (
    <div>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <CompanyMark name={d.company.name} logo={d.company.logo_url} /><p className="text-[16px] text-ink">{d.company.name}</p>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-[13px] text-faint">{o.number}</p>
        <h1 className="mt-1 text-[28px] font-extralight text-ink">Dear {o.candidate_name.split(" ")[0]}, here is your offer</h1>
        <p className="mt-2 text-[15px] text-muted">{o.designation ?? o.job_title}{o.department ? ` · ${o.department}` : ""}{o.location ? ` · ${o.location}` : ""}</p>

        {o.status === "accepted" && <Banner tone="good" icon={CheckCircle2} text={`Accepted${o.accepted_name ? ` by ${o.accepted_name}` : ""}. Welcome aboard! You will soon get a link to fill in your joining details.`} />}
        {o.status === "declined" && <Banner tone="bad" icon={XCircle} text="You declined this offer. Thank you for letting us know." />}
        {(o.status === "expired" || o.status === "withdrawn") && <Banner tone="bad" icon={XCircle} text={o.status === "expired" ? "This offer has expired. Please contact us." : "This offer is no longer available."} />}

        <PublicCard className="mt-6 p-6">
          <div className="grid gap-5 sm:grid-cols-3">
            <Fact label="Annual CTC" value={rupees(o.annual_ctc)} big />
            <Fact label="Joining date" value={formatDisplayDate(o.joining_date)} />
            {open && o.expires_on && <Fact label="Please reply by" value={`${formatDisplayDate(o.expires_on)}${o.days_left !== null ? ` (${o.days_left} days)` : ""}`} />}
            {o.joining_bonus && <Fact label="Joining bonus" value={rupees(o.joining_bonus)} />}
            <Fact label="Reporting to" value={o.reporting_manager ?? "—"} />
            <Fact label="Probation" value={o.probation_months ? `${o.probation_months} months` : "—"} />
            <Fact label="Notice period" value={o.notice_days ? `${o.notice_days} days` : "—"} />
            {o.employment_type && <Fact label="Employment type" value={o.employment_type} />}
          </div>
          {!!o.breakup.length && (
            <table className="mt-6 w-full text-[13.5px]">
              <thead><tr className="text-left text-[12px] text-faint"><th className="py-1.5 font-normal">Component</th><th className="py-1.5 text-right font-normal">Monthly</th><th className="py-1.5 text-right font-normal">Yearly</th></tr></thead>
              <tbody className="divide-y divide-line">
                {o.breakup.map((l) => <tr key={l.code}><td className="py-1.5 text-ink">{l.label}</td><td className="py-1.5 text-right tabular">{rupees(l.monthly)}</td><td className="py-1.5 text-right tabular text-muted">{rupees(l.annual)}</td></tr>)}
              </tbody>
            </table>
          )}
          {d.letter && (
            <a href={resolveImageUrl(d.letter.url)} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-[14px] text-primary hover:underline">
              <FileText size={16} strokeWidth={1.4} />Read the offer letter (PDF)
            </a>
          )}
        </PublicCard>

        {open && step === "view" && (
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={() => setStep("sign")} className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-6 text-[15px] text-white hover:bg-primary-dark">
              <PenLine size={16} strokeWidth={1.4} />{d.esign.required && !d.esign.signed ? "Sign and accept" : "Accept the offer"}
            </button>
            <button type="button" onClick={() => setStep("decline")} className="inline-flex h-11 items-center rounded-lg border border-line bg-surface px-6 text-[15px] text-ink hover:border-line-strong">Decline</button>
          </div>
        )}
        {open && step === "sign" && (
          <PublicCard className="mt-6 space-y-4 p-6">
            <p className="text-[17px] font-light text-ink">{d.esign.required && !d.esign.signed ? "Sign the offer letter" : "Accept the offer"}</p>
            <label className="block"><span className="mb-1 block text-[13px] text-muted">Your full name (as your signature)</span>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></label>
            {name && <p className="text-[26px] text-ink" style={{ fontFamily: "cursive" }}>{name}</p>}
            {d.esign.required && !d.esign.signed && (
              <div className="space-y-2">
                <p className="text-[13px] text-muted">We email you a one-time code to confirm it is you.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" disabled={busy} onClick={sendCode} className="inline-flex h-10 items-center rounded-lg border border-line bg-surface px-4 text-[14px] hover:border-line-strong">{sentTo ? "Send again" : "Email me a code"}</button>
                  {sentTo && <span className="text-[13px] text-muted">Sent to {sentTo}{devCode ? ` (test code ${devCode})` : ""}</span>}
                </div>
                {sentTo && <label className="block max-w-[200px]"><span className="mb-1 block text-[13px] text-muted">Code</span>
                  <input className={inputCls} inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} /></label>}
              </div>
            )}
            <p className="text-[12.5px] text-faint">By accepting, you agree to the terms in the offer letter.</p>
            {msg && <p className="text-[13.5px] text-rose-700">{msg}</p>}
            <div className="flex gap-3">
              <button type="button" disabled={busy || (d.esign.required && !d.esign.signed && !code)} onClick={signAndAccept}
                className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-[14px] text-white disabled:opacity-40">{busy ? "Please wait…" : "Accept the offer"}</button>
              <button type="button" onClick={() => setStep("view")} className="h-10 px-3 text-[14px] text-muted">Back</button>
            </div>
          </PublicCard>
        )}
        {open && step === "decline" && (
          <PublicCard className="mt-6 space-y-4 p-6">
            <p className="text-[17px] font-light text-ink">Decline the offer</p>
            <div className="flex flex-wrap gap-2">
              {d.decline_reasons.map((r) => (
                <button key={r} type="button" onClick={() => setReason(r)} className={`rounded-full border px-3 py-1 text-[13px] ${reason === r ? "border-primary bg-primary-soft/50 text-primary" : "border-line text-muted"}`}>{r}</button>
              ))}
            </div>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Tell us briefly why"
              className="w-full rounded-lg border border-line bg-surface p-3 text-[14px] outline-none focus:border-primary/50" />
            {msg && <p className="text-[13.5px] text-rose-700">{msg}</p>}
            <div className="flex gap-3">
              <button type="button" disabled={busy || !reason.trim()} onClick={decline} className="inline-flex h-10 items-center rounded-lg bg-rose-600 px-5 text-[14px] text-white disabled:opacity-40">Decline</button>
              <button type="button" onClick={() => setStep("view")} className="h-10 px-3 text-[14px] text-muted">Back</button>
            </div>
          </PublicCard>
        )}
      </main>
    </div>
  );
}

function Fact({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return <div><p className="text-[12.5px] text-muted">{label}</p><p className={big ? "tabular text-[24px] font-extralight text-ink" : "text-[15px] text-ink"}>{value}</p></div>;
}

function Banner({ tone, icon: Icon, text }: { tone: "good" | "bad"; icon: typeof CheckCircle2; text: string }) {
  return (
    <div className={`mt-6 flex items-start gap-2 rounded-xl border px-4 py-3 text-[14px] ${tone === "good" ? "border-emerald-200 bg-emerald-50/70 text-emerald-800" : "border-rose-200 bg-rose-50/70 text-rose-800"}`}>
      <Icon size={17} strokeWidth={1.4} className="mt-0.5 shrink-0" />{text}
    </div>
  );
}
