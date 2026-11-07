"use client";

/*
 * Public job page with the application form: details, CV upload, the job's questions and
 * the privacy notice the candidate agrees to.
 */
import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Briefcase, CheckCircle2, MapPin } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { Checkbox, Field, FileDrop, FormGrid, NumberInput, Select, Textarea, TextInput } from "@/components/ui-kit";
import { safeHtml } from "@/components/recruitment/types";
import {
  CompanyMark, PublicCard, PublicMessage, publicFetch, rupees, useCompanySlug, useEmbedHeight,
} from "@/components/recruitment/public";

type Q = { key: string; label: string; type: string; required: boolean; options: string[] };
type JobPage = {
  company: { name: string; logo_url: string | null }; branding: { accent: string };
  job: { title: string; summary: string | null; description: string | null; department: string | null; location: string | null;
    work_mode_label: string; employment_type: string | null; skills: string[]; min_experience: number | null; max_experience: number | null;
    salary_min?: string | null; salary_max?: string | null; questions: Q[] };
  privacy_notice: string; retention_days: number;
};

function JobInner() {
  const { slug: jobSlug } = useParams<{ slug: string }>();
  const params = useSearchParams();
  const embed = params.get("embed") === "1";
  useEmbedHeight(embed);
  const company = useCompanySlug();
  const [data, setData] = useState<JobPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ first_name: "", last_name: "", email: "", phone: "", location: "", current_company: "", current_title: "", linkedin_url: "", website: "" });
  const [exp, setExp] = useState<number | null>(null);
  const [ectc, setEctc] = useState<number | null>(null);
  const [notice, setNotice] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (company === undefined) return;
    if (!company) { setError("Open this page from your company's web address."); return; }
    publicFetch<JobPage>(`/public/careers/${company}/jobs/${jobSlug}`).then(setData).catch((e) => setError(e.message));
  }, [company, jobSlug]);
  useEffect(() => { if (data) document.title = `${data.job.title} · ${data.company.name}`; }, [data]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!consent) { setFormError("Please agree to the privacy notice."); return; }
    setBusy(true);
    const form = new FormData();
    Object.entries(f).forEach(([k, v]) => form.append(k, v));
    if (exp !== null) form.append("total_experience", String(exp));
    if (ectc !== null) form.append("expected_ctc", String(ectc));
    if (notice !== null) form.append("notice_days", String(notice));
    form.append("answers", JSON.stringify(answers));
    form.append("consent", "1");
    const src = params.get("source");
    if (src) form.append("source", src);
    if (files[0]) form.append("resume", files[0]);
    try {
      const res = await fetch(`${API_BASE}/public/careers/${company}/jobs/${jobSlug}/apply`, { method: "POST", body: form });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail || "Could not send your application.");
      setDone(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not send your application.");
    } finally { setBusy(false); }
  }

  if (error) return <PublicMessage title="This role is not available" hint={error} />;
  if (!data) return <div className="mx-auto max-w-3xl px-4 py-16"><div className="h-60 animate-pulse rounded-2xl bg-sunken" /></div>;
  const j = data.job;
  const accent = data.branding.accent || "#4f46e5";
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  return (
    <div>
      {!embed && (
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
            <CompanyMark name={data.company.name} logo={data.company.logo_url} accent={accent} />
            <p className="text-[16px] text-ink">{data.company.name}</p>
          </div>
        </header>
      )}
      <main className={`mx-auto max-w-3xl px-4 ${embed ? "py-4" : "py-10"}`}>
        <Link href={`/careers${embed ? "?embed=1" : ""}`} className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"><ArrowLeft size={14} strokeWidth={1.4} />All roles</Link>
        <h1 className="mt-3 text-[30px] font-extralight leading-tight text-ink">{j.title}</h1>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-muted">
          {j.department && <span className="inline-flex items-center gap-1"><Briefcase size={14} strokeWidth={1.4} />{j.department}</span>}
          {j.location && <span className="inline-flex items-center gap-1"><MapPin size={14} strokeWidth={1.4} />{j.location}</span>}
          <span>{j.work_mode_label}</span>{j.employment_type && <span>{j.employment_type}</span>}
          {(j.min_experience !== null || j.max_experience !== null) && <span>{j.min_experience ?? 0}–{j.max_experience ?? "+"} years</span>}
          {(j.salary_min || j.salary_max) && <span className="text-ink">{rupees(j.salary_min)} – {rupees(j.salary_max)} a year</span>}
        </p>
        {done ? (
          <PublicCard className="mt-8 p-8 text-center">
            <CheckCircle2 size={32} strokeWidth={1.2} className="mx-auto text-emerald-600" />
            <p className="mt-3 text-[18px] font-light text-ink">Thank you for applying</p>
            <p className="mt-1 text-[14px] text-muted">We have emailed you a confirmation and will be in touch if your profile matches.</p>
          </PublicCard>
        ) : <>
          {j.summary && <p className="mt-6 text-[15px] text-ink">{j.summary}</p>}
          {j.description && <div className="mt-4 text-[14.5px] leading-relaxed text-muted [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3 [&_ul]:mb-3"
            dangerouslySetInnerHTML={{ __html: safeHtml(j.description) }} />}
          {!!j.skills.length && <div className="mt-4 flex flex-wrap gap-1.5">{j.skills.map((s) => <span key={s} className="rounded-full border border-line px-2.5 py-0.5 text-[12.5px] text-muted">{s}</span>)}</div>}
          <PublicCard className="mt-8 p-6">
            <p className="text-[18px] font-light text-ink">Apply for this role</p>
            <form onSubmit={submit} className="mt-5 space-y-5">
              <FormGrid>
                <Field label="First name" required><TextInput value={f.first_name} onValueChange={set("first_name")} required /></Field>
                <Field label="Last name"><TextInput value={f.last_name} onValueChange={set("last_name")} /></Field>
                <Field label="Email" required><TextInput type="email" value={f.email} onValueChange={set("email")} required /></Field>
                <Field label="Mobile number" required><TextInput type="tel" value={f.phone} onValueChange={set("phone")} required /></Field>
                <Field label="City"><TextInput value={f.location} onValueChange={set("location")} /></Field>
                <Field label="LinkedIn profile"><TextInput value={f.linkedin_url} onValueChange={set("linkedin_url")} /></Field>
                <Field label="Current company"><TextInput value={f.current_company} onValueChange={set("current_company")} /></Field>
                <Field label="Current role"><TextInput value={f.current_title} onValueChange={set("current_title")} /></Field>
                <Field label="Total experience"><NumberInput value={exp} onChange={setExp} min={0} step={0.5} suffix="years" /></Field>
                <Field label="Expected annual CTC"><NumberInput value={ectc} onChange={setEctc} min={0} suffix="₹" /></Field>
                <Field label="Notice period"><NumberInput value={notice} onChange={setNotice} min={0} suffix="days" /></Field>
              </FormGrid>
              <Field label="CV" hint="PDF or Word, up to 5 MB"><FileDrop value={files} onChange={setFiles} accept=".pdf,.doc,.docx" maxSizeMb={5} /></Field>
              {j.questions.map((q) => (
                <Field key={q.key} label={q.label} required={q.required}>
                  {q.type === "long_text" ? <Textarea value={answers[q.key] ?? ""} onValueChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))} rows={3} />
                    : q.type === "yesno" ? <Select value={answers[q.key] ?? null} onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v ?? "" }))} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
                      : q.type === "choice" ? <Select value={answers[q.key] ?? null} onChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v ?? "" }))} options={q.options.map((o) => ({ value: o, label: o }))} />
                        : <TextInput type={q.type === "number" ? "number" : "text"} value={answers[q.key] ?? ""} onValueChange={(v) => setAnswers((a) => ({ ...a, [q.key]: v }))} />}
                </Field>
              ))}
              <input tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={f.website} onChange={(e) => set("website")(e.target.value)} />
              <div className="rounded-xl border border-line bg-sunken/40 p-4">
                <p className="text-[13px] text-muted">{data.privacy_notice}</p>
                <p className="mt-1 text-[12.5px] text-faint">We keep your details for {data.retention_days} days unless you join us.</p>
                <div className="mt-3"><Checkbox checked={consent} onChange={setConsent} label="I agree to the privacy notice" /></div>
              </div>
              {formError && <p className="text-[13.5px] text-rose-700">{formError}</p>}
              <button type="submit" disabled={busy} className="inline-flex h-10 items-center rounded-lg px-5 text-[14px] text-white transition-opacity disabled:opacity-50" style={{ background: accent }}>
                {busy ? "Sending…" : "Send application"}
              </button>
            </form>
          </PublicCard>
        </>}
      </main>
    </div>
  );
}

export default function JobPublicPage() {
  return <Suspense><JobInner /></Suspense>;
}

