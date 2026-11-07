"use client";

/*
 * Reference form for a referee (personal link): a few questions about the candidate.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { PublicCard, PublicMessage, postJson, publicFetch } from "@/components/recruitment/public";

type Ref = {
  company_name: string | null; referee_name: string; candidate_name: string; job_title: string; status: string; expired: boolean;
  questions: { key: string; label: string; type: string }[];
};

export default function ReferencePage() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<Ref | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState<"received" | "declined" | null>(null);

  useEffect(() => { publicFetch<Ref>(`/public/references/${token}`).then(setD).catch((e) => setError(e.message)); }, [token]);

  async function send(e: FormEvent | null, decline = false) {
    e?.preventDefault();
    setBusy(true); setMsg(null);
    try { const r = await postJson<{ status: string }>(`/public/references/${token}`, { answers, decline }); setDone(r.status as "received" | "declined"); }
    catch (err) { setMsg(err instanceof Error ? err.message : "Could not send."); } finally { setBusy(false); }
  }

  if (error) return <PublicMessage title="This link is not valid" hint={error} />;
  if (!d) return <div className="mx-auto max-w-2xl px-4 py-16"><div className="h-60 animate-pulse rounded-2xl bg-sunken" /></div>;
  if (done || d.status !== "sent" || d.expired) {
    return <PublicMessage title={done === "received" || d.status === "received" ? "Thank you for your reference" : done === "declined" || d.status === "declined" ? "Thanks for letting us know" : "This form is closed"}
      hint={done || d.status === "received" ? "Your answers have been shared with the hiring team in confidence." : undefined} />;
  }
  const field = "w-full rounded-lg border border-line bg-surface p-3 text-[14px] outline-none focus:border-primary/50";
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <p className="text-[13px] text-faint">{d.company_name}</p>
      <h1 className="mt-1 text-[26px] font-extralight text-ink">Reference for {d.candidate_name}</h1>
      <p className="mt-2 text-[14.5px] text-muted">Dear {d.referee_name}, {d.candidate_name} has applied for {d.job_title} and named you as a referee. It takes about five minutes. Your answers are kept confidential.</p>
      <PublicCard className="mt-6 p-6">
        <form onSubmit={(e) => send(e)} className="space-y-5">
          {d.questions.map((q) => (
            <label key={q.key} className="block">
              <span className="mb-1.5 block text-[14px] text-ink">{q.label}</span>
              {q.type === "rating" ? (
                <div className="flex gap-2">{[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setAnswers((a) => ({ ...a, [q.key]: String(n) }))}
                    className={`h-10 w-10 rounded-lg border text-[14px] ${answers[q.key] === String(n) ? "border-primary bg-primary text-white" : "border-line text-muted"}`}>{n}</button>))}</div>
              ) : q.type === "yesno" ? (
                <div className="flex gap-2">{["Yes", "No", "Not sure"].map((v) => (
                  <button key={v} type="button" onClick={() => setAnswers((a) => ({ ...a, [q.key]: v }))}
                    className={`rounded-lg border px-4 py-2 text-[14px] ${answers[q.key] === v ? "border-primary bg-primary-soft/50 text-primary" : "border-line text-muted"}`}>{v}</button>))}</div>
              ) : <textarea rows={3} className={field} value={answers[q.key] ?? ""} onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))} />}
            </label>
          ))}
          {msg && <p className="text-[13.5px] text-rose-700">{msg}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-[14px] text-white disabled:opacity-40">{busy ? "Sending…" : "Send reference"}</button>
            <button type="button" disabled={busy} onClick={() => send(null, true)} className="h-10 px-3 text-[14px] text-muted hover:text-ink">I can&apos;t give a reference</button>
          </div>
        </form>
      </PublicCard>
      <p className="mt-4 flex items-center gap-1.5 text-[12.5px] text-faint"><CheckCircle2 size={13} strokeWidth={1.4} />Sent securely to the hiring team only.</p>
    </main>
  );
}
