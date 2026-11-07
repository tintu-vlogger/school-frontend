"use client";

/*
 * Public online admission form on the institution's own address (<slug>.campusly.app/apply).
 * No sign-in. Families pick a program, fill in the child's and their own details, upload the
 * documents asked for and get an application number. "Check status" needs that number and
 * the phone or email used on the form. When nothing is open, a short enquiry form is shown.
 */
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileSearch, FileText, Send, Upload, X } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/datetime";
import { CompanyMark, PublicCard, PublicMessage, postJson, publicFetch, useCompanySlug } from "@/components/recruitment/public";
import { Button, Checkbox, DateInput, Field, FormGrid, NumberInput, Select, Tabs, TextInput, Textarea, Toggle } from "@/components/ui-kit";

type Terms = { program: string; programs: string; student: string; guardian: string; guardians: string; session: string };
type Program = { session_id: number; session_name: string; program_id: number; program_name: string; application_fee: string; fee_required: boolean;
  closes_on: string | null; min_age_years: string | null; max_age_years: string | null; age_as_on: string | null; test_required: boolean; interview_required: boolean };
type CField = { key: string; label: string; type: string; required: boolean; help_text: string | null; placeholder: string | null; options: { value: string | number; label: string }[] };
type Form = {
  institution: { name: string; logo_url: string | null; city: string | null; type: string }; terms: Terms; open: boolean; title: string;
  intro: string; privacy_notice: string; documents: { key: string; label: string; required: boolean }[]; programs: Program[]; custom_fields: CField[];
};
type Guardian = { relation: string; first_name: string; last_name: string; phone: string; email: string; occupation: string };
type Status = { application_no: string; applicant: string; program: string; session: string; status: string; status_label: string;
  submitted_at: string | null; test_at: string | null; test_venue: string | null; interview_at: string | null; offer_expires_on: string | null;
  fee_amount: string | null; fee_paid: boolean; documents_pending: string[] };

const RELATIONS = [{ value: "father", label: "Father" }, { value: "mother", label: "Mother" }, { value: "guardian", label: "Guardian" }];
const GENDERS = [{ value: "male", label: "Male" }, { value: "female", label: "Female" }, { value: "other", label: "Other" }];
const blankG = (relation: string): Guardian => ({ relation, first_name: "", last_name: "", phone: "", email: "", occupation: "" });

export default function ApplyPage() {
  const slug = useCompanySlug();
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"apply" | "status">("apply");
  useEffect(() => {
    if (slug === undefined) return;
    if (!slug) { queueMicrotask(() => setError("Open this page from your institution's web address.")); return; }
    publicFetch<Form>(`/public/admissions/${slug}/form`).then((f) => {
      setForm(f);
      if (new URLSearchParams(window.location.search).get("status")) setTab("status");
    }).catch((e) => setError(e.message));
  }, [slug]);
  useEffect(() => { if (form) document.title = `${form.title} · ${form.institution.name}`; }, [form]);

  if (error) return <PublicMessage title="Online admissions are not available" hint={error} />;
  if (!form || !slug) return <div className="mx-auto max-w-3xl px-4 py-16"><div className="h-40 animate-pulse rounded-2xl bg-sunken" /></div>;
  return (
    <div>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          <CompanyMark name={form.institution.name} logo={form.institution.logo_url} />
          <div><p className="text-[16px] text-ink">{form.institution.name}</p>{form.institution.city && <p className="text-[12.5px] text-muted">{form.institution.city}</p>}</div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-[30px] font-extralight leading-tight text-ink">{form.title}</h1>
        {form.intro && <p className="mt-2 max-w-2xl whitespace-pre-line text-[15px] text-muted">{form.intro}</p>}
        <Tabs value={tab} onChange={setTab} className="mt-6" items={[{ value: "apply", label: form.open ? "Apply" : "Ask us", icon: Send }, { value: "status", label: "Check status", icon: FileSearch }]} />
        <div className="mt-6">
          {tab === "apply" ? (form.open ? <ApplicationForm form={form} slug={slug} onCheck={() => setTab("status")} /> : <EnquiryForm form={form} slug={slug} />)
            : <StatusCheck slug={slug} />}
        </div>
      </main>
      <footer className="border-t border-line py-6 text-center text-[12.5px] text-faint">{form.institution.name}</footer>
    </div>
  );
}

function ApplicationForm({ form, slug, onCheck }: { form: Form; slug: string; onCheck: () => void }) {
  const t = form.terms;
  const [pick, setPick] = useState<string | null>(form.programs.length === 1 ? `${form.programs[0].session_id}:${form.programs[0].program_id}` : null);
  const prog = form.programs.find((p) => `${p.session_id}:${p.program_id}` === pick) ?? null;
  const [c, setC] = useState({ first_name: "", middle_name: "", last_name: "", gender: null as string | null, date_of_birth: "", blood_group: "", nationality: "Indian",
    religion: "", category: "", mother_tongue: "", previous_institution: "", previous_program: "", previous_marks: "", address: "", city: "", state: "", pincode: "",
    contact_phone: "", contact_email: "" });
  const [gs, setGs] = useState<Guardian[]>([blankG("father"), blankG("mother")]);
  const [custom, setCustom] = useState<Record<string, unknown>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [consent, setConsent] = useState(false);
  const [honey, setHoney] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ application_no: string; program: string; session: string; fee_amount: string | null } | null>(null);
  const set = (k: keyof typeof c, v: string | null) => setC((p) => ({ ...p, [k]: v ?? "" }));
  const setG = (i: number, k: keyof Guardian, v: string) => setGs((p) => p.map((g, j) => (j === i ? { ...g, [k]: v } : g)));
  const ageHint = useMemo(() => {
    if (!prog || (!prog.min_age_years && !prog.max_age_years)) return undefined;
    return `Age ${prog.min_age_years ?? "–"} to ${prog.max_age_years ?? "–"} years${prog.age_as_on ? ` on ${formatDate(prog.age_as_on)}` : ""}`;
  }, [prog]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!prog) return setErr(`Pick the ${t.program.toLowerCase()} you are applying for.`);
    if (!c.first_name.trim() || !c.date_of_birth) return setErr(`Enter the ${t.student.toLowerCase()}'s name and date of birth.`);
    const guardians = gs.filter((g) => g.first_name.trim()).map((g, i) => ({ ...g, last_name: g.last_name || null, phone: g.phone || null, email: g.email || null, occupation: g.occupation || null, is_primary: i === 0 }));
    if (!guardians.length) return setErr(`Add at least one ${t.guardian.toLowerCase()}.`);
    const phone = c.contact_phone.trim() || guardians.find((g) => g.phone)?.phone || "";
    if (!phone) return setErr("Add a phone number so we can reach you.");
    const missingDoc = form.documents.find((d) => d.required && !files[d.key]);
    if (missingDoc) return setErr(`Upload: ${missingDoc.label}.`);
    const missingField = form.custom_fields.find((f) => f.required && (custom[f.key] === undefined || custom[f.key] === ""));
    if (missingField) return setErr(`Fill in: ${missingField.label}.`);
    if (!consent) return setErr("Please agree to the privacy notice.");
    const body = new FormData();
    const strip = (s: string) => s.trim() || null;
    body.append("data", JSON.stringify({
      session_id: prog.session_id, program_id: prog.program_id, ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, typeof v === "string" ? strip(v) : v])),
      first_name: c.first_name.trim(), contact_phone: phone, contact_email: strip(c.contact_email) || guardians.find((g) => g.email)?.email || null,
      guardians, custom, consent, website: honey,
    }));
    for (const [k, f] of Object.entries(files)) if (f) body.append(`doc_${k}`, f);
    setSending(true);
    try {
      const res = await fetch(`${API_BASE}/public/admissions/${slug}/apply`, { method: "POST", body });
      const out = await res.json().catch(() => null);
      if (!res.ok) throw new Error(out?.detail || "The application could not be sent. Please try again.");
      setDone(out);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Something went wrong."); }
    finally { setSending(false); }
  }

  if (done) {
    return (
      <PublicCard className="p-8 text-center">
        <CheckCircle2 size={36} strokeWidth={1.2} className="mx-auto text-emerald-600" />
        <p className="mt-3 text-[20px] font-light text-ink">Application received</p>
        <p className="mt-1 text-[14px] text-muted">{done.program} · {done.session}</p>
        <p className="mt-6 text-[13px] text-muted">Your application number</p>
        <p className="mt-1 font-mono text-[26px] tracking-wide text-ink">{done.application_no}</p>
        <p className="mx-auto mt-4 max-w-md text-[13.5px] text-muted">Keep this number. You can check the status here with it and your phone number or email.
          {done.fee_amount ? ` An application fee of ₹${Number(done.fee_amount).toLocaleString("en-IN")} is payable at the office.` : ""}</p>
        <Button className="mt-6" onClick={onCheck} icon={FileSearch}>Check status</Button>
      </PublicCard>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <PublicCard className="p-5 sm:p-6">
        <p className="mb-4 text-[16px] text-ink">Applying for</p>
        <Field label={t.program} required>
          <Select value={pick} onChange={setPick} placeholder={`Pick a ${t.program.toLowerCase()}`}
            options={form.programs.map((p) => ({ value: `${p.session_id}:${p.program_id}`, label: `${p.program_name} · ${p.session_name}`,
              description: [Number(p.application_fee) > 0 ? `Fee ₹${Number(p.application_fee).toLocaleString("en-IN")}` : null, p.closes_on ? `Apply by ${formatDate(p.closes_on)}` : null].filter(Boolean).join(" · ") || undefined }))} />
        </Field>
        {prog && (prog.test_required || prog.interview_required) && <p className="mt-3 text-[13px] text-muted">Includes {[prog.test_required && "an entrance test", prog.interview_required && "an interview"].filter(Boolean).join(" and ")}. We will tell you the date.</p>}
      </PublicCard>

      <PublicCard className="p-5 sm:p-6">
        <p className="mb-4 text-[16px] text-ink">{t.student}</p>
        <FormGrid columns={3}>
          <Field label="First name" required><TextInput value={c.first_name} onValueChange={(v) => set("first_name", v)} autoComplete="off" /></Field>
          <Field label="Middle name"><TextInput value={c.middle_name} onValueChange={(v) => set("middle_name", v)} /></Field>
          <Field label="Last name"><TextInput value={c.last_name} onValueChange={(v) => set("last_name", v)} /></Field>
          <Field label="Date of birth" required hint={ageHint}><DateInput value={c.date_of_birth} onChange={(v) => set("date_of_birth", v)} /></Field>
          <Field label="Gender"><Select value={c.gender} onChange={(v) => setC((p) => ({ ...p, gender: v }))} options={GENDERS} clearable /></Field>
          <Field label="Blood group"><TextInput value={c.blood_group} onValueChange={(v) => set("blood_group", v)} /></Field>
          <Field label="Nationality"><TextInput value={c.nationality} onValueChange={(v) => set("nationality", v)} /></Field>
          <Field label="Religion"><TextInput value={c.religion} onValueChange={(v) => set("religion", v)} /></Field>
          <Field label="Mother tongue"><TextInput value={c.mother_tongue} onValueChange={(v) => set("mother_tongue", v)} /></Field>
          <Field label="Current or last school"><TextInput value={c.previous_institution} onValueChange={(v) => set("previous_institution", v)} /></Field>
          <Field label={`Last ${t.program.toLowerCase()} studied`}><TextInput value={c.previous_program} onValueChange={(v) => set("previous_program", v)} /></Field>
          <Field label="Marks or grade"><TextInput value={c.previous_marks} onValueChange={(v) => set("previous_marks", v)} /></Field>
        </FormGrid>
      </PublicCard>

      <PublicCard className="p-5 sm:p-6">
        <p className="mb-4 text-[16px] text-ink">{t.guardians}</p>
        <div className="space-y-5">
          {gs.map((g, i) => (
            <div key={i} className={i ? "border-t border-line pt-5" : ""}>
              <FormGrid columns={3}>
                <Field label="Relation"><Select value={g.relation} onChange={(v) => setG(i, "relation", v ?? "guardian")} options={RELATIONS} /></Field>
                <Field label="First name" required={i === 0}><TextInput value={g.first_name} onValueChange={(v) => setG(i, "first_name", v)} /></Field>
                <Field label="Last name"><TextInput value={g.last_name} onValueChange={(v) => setG(i, "last_name", v)} /></Field>
                <Field label="Phone" required={i === 0}><TextInput type="tel" value={g.phone} onValueChange={(v) => setG(i, "phone", v)} /></Field>
                <Field label="Email"><TextInput type="email" value={g.email} onValueChange={(v) => setG(i, "email", v)} /></Field>
                <Field label="Occupation"><TextInput value={g.occupation} onValueChange={(v) => setG(i, "occupation", v)} /></Field>
              </FormGrid>
            </div>
          ))}
        </div>
        <div className="mt-5 border-t border-line pt-5">
          <FormGrid columns={3}>
            <Field label="Address" className="sm:col-span-2 lg:col-span-3"><Textarea value={c.address} onValueChange={(v) => set("address", v)} rows={2} /></Field>
            <Field label="City"><TextInput value={c.city} onValueChange={(v) => set("city", v)} /></Field>
            <Field label="State"><TextInput value={c.state} onValueChange={(v) => set("state", v)} /></Field>
            <Field label="PIN code"><TextInput value={c.pincode} onValueChange={(v) => set("pincode", v)} inputMode="numeric" /></Field>
          </FormGrid>
        </div>
      </PublicCard>

      {form.custom_fields.length > 0 && (
        <PublicCard className="p-5 sm:p-6">
          <p className="mb-4 text-[16px] text-ink">More about you</p>
          <FormGrid>
            {form.custom_fields.map((f) => (
              <Field key={f.key} label={f.label} required={f.required} hint={f.help_text ?? undefined} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
                {f.type === "textarea" ? <Textarea value={String(custom[f.key] ?? "")} onValueChange={(v) => setCustom((p) => ({ ...p, [f.key]: v }))} rows={3} />
                  : f.type === "number" ? <NumberInput value={custom[f.key] as number | null ?? null} onChange={(v) => setCustom((p) => ({ ...p, [f.key]: v }))} />
                  : f.type === "date" ? <DateInput value={String(custom[f.key] ?? "")} onChange={(v) => setCustom((p) => ({ ...p, [f.key]: v }))} clearable />
                  : f.type === "boolean" ? <Toggle checked={!!custom[f.key]} onChange={(v) => setCustom((p) => ({ ...p, [f.key]: v }))} />
                  : f.type === "single_choice" ? <Select value={(custom[f.key] as string | number | undefined) ?? null} onChange={(v) => setCustom((p) => ({ ...p, [f.key]: v }))} options={f.options} clearable />
                  : <TextInput value={String(custom[f.key] ?? "")} placeholder={f.placeholder ?? undefined} onValueChange={(v) => setCustom((p) => ({ ...p, [f.key]: v }))} />}
              </Field>
            ))}
          </FormGrid>
        </PublicCard>
      )}

      {form.documents.length > 0 && (
        <PublicCard className="p-5 sm:p-6">
          <p className="text-[16px] text-ink">Documents</p>
          <p className="mb-4 mt-0.5 text-[13px] text-muted">PDF or a clear photo, up to 5 MB each.</p>
          <ul className="divide-y divide-line rounded-xl border border-line">
            {form.documents.map((d) => (
              <li key={d.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <FileText size={18} strokeWidth={1.4} className="text-faint" />
                <span className="min-w-0 flex-1 text-[14px] text-ink">{d.label}{d.required && <span className="ml-1 text-rose-600">*</span>}
                  {files[d.key] && <span className="block truncate text-[12.5px] text-muted">{files[d.key]!.name}</span>}</span>
                {files[d.key] ? <button type="button" onClick={() => setFiles((p) => ({ ...p, [d.key]: null }))} className="rounded p-1 text-faint hover:text-ink" aria-label="Remove"><X size={16} strokeWidth={1.4} /></button>
                  : <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-line px-3 text-[13.5px] text-ink hover:bg-sunken/60">
                    <Upload size={14} strokeWidth={1.4} />Choose file
                    <input type="file" className="hidden" accept=".pdf,image/*" onChange={(e) => { const f = e.target.files?.[0] ?? null; if (f && f.size > 5 * 1024 * 1024) { setErr(`${d.label}: the file should be smaller than 5 MB.`); return; } setFiles((p) => ({ ...p, [d.key]: f })); }} />
                  </label>}
              </li>
            ))}
          </ul>
        </PublicCard>
      )}

      <PublicCard className="p-5 sm:p-6">
        <FormGrid>
          <Field label="Phone for updates" hint="Defaults to the first phone above"><TextInput type="tel" value={c.contact_phone} onValueChange={(v) => set("contact_phone", v)} /></Field>
          <Field label="Email for updates"><TextInput type="email" value={c.contact_email} onValueChange={(v) => set("contact_email", v)} /></Field>
        </FormGrid>
        <input type="text" tabIndex={-1} autoComplete="off" value={honey} onChange={(e) => setHoney(e.target.value)} className="hidden" aria-hidden="true" name="website" />
        <div className="mt-5"><Checkbox checked={consent} onChange={setConsent} label="I agree" description={form.privacy_notice} /></div>
        {err && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-2.5 text-[13.5px] text-rose-700" role="alert">{err}</p>}
        <Button type="submit" variant="primary" icon={Send} loading={sending} className="mt-5 w-full sm:w-auto">Send application</Button>
      </PublicCard>
    </form>
  );
}

function StatusCheck({ slug }: { slug: string }) {
  const [no, setNo] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [s, setS] = useState<Status | null>(null);
  async function check(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setS(null);
    if (!no.trim() || !contact.trim()) { setErr("Enter the application number and your phone or email."); return; }
    setBusy(true);
    try { setS(await postJson<Status>(`/public/admissions/${slug}/status`, { application_no: no.trim(), contact: contact.trim() })); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "Not found"); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-6">
      <PublicCard className="p-5 sm:p-6">
        <form onSubmit={check} noValidate>
          <FormGrid>
            <Field label="Application number"><TextInput value={no} onValueChange={setNo} placeholder="APP20260001" className="font-mono" /></Field>
            <Field label="Phone or email used on the form"><TextInput value={contact} onValueChange={setContact} /></Field>
          </FormGrid>
          {err && <p className="mt-4 text-[13.5px] text-rose-700" role="alert">{err}</p>}
          <Button type="submit" variant="primary" icon={FileSearch} loading={busy} className="mt-5">Check status</Button>
        </form>
      </PublicCard>
      {s && (
        <PublicCard className="p-5 sm:p-6">
          <p className="text-[13px] text-muted">{s.application_no} · {s.program} · {s.session}</p>
          <p className="mt-1 text-[22px] font-light text-ink">{s.status_label}</p>
          <dl className="mt-4 grid gap-4 text-[14px] sm:grid-cols-2">
            <div><dt className="text-[12px] text-faint">Applicant</dt><dd className="text-ink">{s.applicant}</dd></div>
            {s.submitted_at && <div><dt className="text-[12px] text-faint">Received</dt><dd className="text-ink">{formatDate(s.submitted_at)}</dd></div>}
            {s.test_at && <div><dt className="text-[12px] text-faint">Entrance test</dt><dd className="text-ink">{formatDateTime(s.test_at)}{s.test_venue ? `, ${s.test_venue}` : ""}</dd></div>}
            {s.interview_at && <div><dt className="text-[12px] text-faint">Interview</dt><dd className="text-ink">{formatDateTime(s.interview_at)}</dd></div>}
            {s.offer_expires_on && <div><dt className="text-[12px] text-faint">Please confirm by</dt><dd className="text-ink">{formatDate(s.offer_expires_on)}</dd></div>}
            {s.fee_amount && <div><dt className="text-[12px] text-faint">Application fee</dt><dd className="text-ink">₹{Number(s.fee_amount).toLocaleString("en-IN")} · {s.fee_paid ? "paid" : "not paid yet"}</dd></div>}
          </dl>
          {s.documents_pending.length > 0 && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-[13.5px] text-amber-800">Still needed: {s.documents_pending.join(", ")}. Please bring them to the office.</p>}
        </PublicCard>
      )}
    </div>
  );
}

function EnquiryForm({ form, slug }: { form: Form; slug: string }) {
  const [v, setV] = useState({ child_first_name: "", child_last_name: "", parent_name: "", phone: "", email: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!v.child_first_name.trim() || !v.parent_name.trim() || !v.phone.trim()) { setErr("Fill in the names and a phone number."); return; }
    setBusy(true); setErr(null);
    try { await postJson(`/public/admissions/${slug}/enquiry`, { ...v, email: v.email || null, child_last_name: v.child_last_name || null, message: v.message || null }); setSent(true); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "Something went wrong."); }
    finally { setBusy(false); }
  }
  if (sent) return <PublicCard className="p-8 text-center"><CheckCircle2 size={32} strokeWidth={1.2} className="mx-auto text-emerald-600" /><p className="mt-3 text-[18px] font-light text-ink">Thank you</p><p className="mt-1 text-[14px] text-muted">Our admissions team will call you soon.</p></PublicCard>;
  return (
    <PublicCard className="p-5 sm:p-6">
      <p className="text-[16px] text-ink">Applications are not open right now</p>
      <p className="mb-5 mt-1 text-[13.5px] text-muted">Leave your details and we will get in touch when admissions open at {form.institution.name}.</p>
      <form onSubmit={send} noValidate>
        <FormGrid>
          <Field label={`${form.terms.student}'s first name`} required><TextInput value={v.child_first_name} onValueChange={(x) => setV({ ...v, child_first_name: x })} /></Field>
          <Field label="Last name"><TextInput value={v.child_last_name} onValueChange={(x) => setV({ ...v, child_last_name: x })} /></Field>
          <Field label="Your name" required><TextInput value={v.parent_name} onValueChange={(x) => setV({ ...v, parent_name: x })} /></Field>
          <Field label="Phone" required><TextInput type="tel" value={v.phone} onValueChange={(x) => setV({ ...v, phone: x })} /></Field>
          <Field label="Email"><TextInput type="email" value={v.email} onValueChange={(x) => setV({ ...v, email: x })} /></Field>
          <Field label="Message" className="sm:col-span-2"><Textarea value={v.message} onValueChange={(x) => setV({ ...v, message: x })} rows={3} /></Field>
        </FormGrid>
        {err && <p className="mt-4 text-[13.5px] text-rose-700" role="alert">{err}</p>}
        <Button type="submit" variant="primary" icon={Send} loading={busy} className="mt-5">Send</Button>
      </form>
    </PublicCard>
  );
}
