"use client";

/*
 * Pre-joining portal: the new joiner opens their personal link, fills in personal, family,
 * nominee, bank, statutory, previous employment and tax details step by step, uploads
 * documents and submits for HR review. HR remarks on sent-back items show next to them.
 * Data: /public/joining/{token} (no sign-in).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, Check, CheckCircle2, ChevronLeft, ChevronRight, FileUp, Lock, Plus, Trash2 } from "lucide-react";
import { API_BASE } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import {
  Button, Checkbox, DateInput, Field, FormGrid, IconButton, RadioCards, Select, Skeleton, TextInput, formatDisplayDate,
  type SelectOption,
} from "@/components/ui-kit";

type Review = { status: string; remark?: string | null };
type Portal = {
  company: { name: string | null; logo_url: string | null };
  joiner: { first_name: string; last_name: string; designation: string | null; department: string | null };
  joining_date: string; expires_at: string | null; sections: { key: string; label: string }[];
  data: Record<string, unknown>; review: Record<string, Review>; review_status: string; submitted_at: string | null;
  completeness: { sections: number; filled: number; missing: string[]; percent: number };
  required_documents: { label: string; required: boolean }[];
  uploads: { label: string; name: string; status: string; remark?: string | null; file?: { url?: string | null } | null }[];
  locked: boolean;
};
type Options = Record<string, { value: number; label: string }[]>;
type Row = Record<string, unknown>;
type FieldDef = { key: string; label: string; type?: "text" | "date" | "select" | "number" | "email" | "check"; opt?: string; options?: SelectOption<string>[]; required?: boolean; hint?: string; full?: boolean };

const ADDRESS: FieldDef[] = [
  { key: "line1", label: "House, street", full: true }, { key: "line2", label: "Area, landmark", full: true },
  { key: "city", label: "City" }, { key: "state_id", label: "State", type: "select", opt: "state" }, { key: "pincode", label: "PIN code" },
];
const NOMINEE_KINDS: SelectOption<string>[] = [
  { value: "pf", label: "Provident fund (PF)" }, { value: "eps", label: "Pension (EPS)" }, { value: "gratuity", label: "Gratuity" },
  { value: "insurance", label: "Insurance / ESI" },
];
const FIELDS: Record<string, FieldDef[]> = {
  personal: [
    { key: "first_name", label: "First name", required: true }, { key: "middle_name", label: "Middle name" },
    { key: "last_name", label: "Last name", required: true }, { key: "preferred_name", label: "Name you go by" },
    { key: "date_of_birth", label: "Date of birth", type: "date", required: true }, { key: "gender_id", label: "Gender", type: "select", opt: "gender", required: true },
    { key: "marital_status_id", label: "Marital status", type: "select", opt: "marital_status" }, { key: "blood_group_id", label: "Blood group", type: "select", opt: "blood_group" },
    { key: "nationality_id", label: "Nationality", type: "select", opt: "nationality" }, { key: "father_name", label: "Father's name", required: true },
    { key: "spouse_name", label: "Spouse's name" }, { key: "personal_email", label: "Personal email", type: "email" },
  ],
  contact: [{ key: "phone", label: "Mobile number", required: true }, { key: "alternate_phone", label: "Alternate number" }],
  family: [
    { key: "name", label: "Name", required: true }, { key: "relation_id", label: "Relation", type: "select", opt: "relation" },
    { key: "date_of_birth", label: "Date of birth", type: "date" }, { key: "gender_id", label: "Gender", type: "select", opt: "gender" },
    { key: "occupation", label: "Occupation" }, { key: "phone", label: "Phone" }, { key: "is_dependent", label: "Depends on me", type: "check" },
  ],
  nominees: [
    { key: "kind", label: "Nomination for", type: "select", options: NOMINEE_KINDS, required: true }, { key: "name", label: "Nominee name", required: true },
    { key: "relation_id", label: "Relation", type: "select", opt: "relation" }, { key: "date_of_birth", label: "Date of birth", type: "date" },
    { key: "share_percent", label: "Share %", type: "number", required: true }, { key: "guardian_name", label: "Guardian (if a minor)" },
    { key: "address", label: "Address", full: true },
  ],
  bank: [
    { key: "account_holder", label: "Account holder", required: true }, { key: "bank_id", label: "Bank", type: "select", opt: "bank" },
    { key: "account_number", label: "Account number", required: true }, { key: "ifsc", label: "IFSC", required: true },
    { key: "branch", label: "Branch" },
    { key: "account_type", label: "Account type", type: "select", options: [{ value: "savings", label: "Savings" }, { value: "salary", label: "Salary" }, { value: "current", label: "Current" }] },
  ],
  statutory: [
    { key: "pan", label: "PAN", required: true, hint: "10 characters, e.g. ABCDE1234F" }, { key: "aadhaar", label: "Aadhaar", hint: "Stored encrypted; only the last 4 digits are shown" },
    { key: "uan", label: "UAN", hint: "If you had PF with an earlier employer" }, { key: "esi_number", label: "ESI number" },
    { key: "passport_number", label: "Passport number" }, { key: "passport_expiry", label: "Passport expiry", type: "date" },
  ],
  previous_employment: [
    { key: "company_name", label: "Employer", required: true }, { key: "designation", label: "Designation" },
    { key: "from_date", label: "From", type: "date" }, { key: "to_date", label: "To", type: "date" },
    { key: "last_ctc", label: "Last CTC (yearly)", type: "number" }, { key: "previous_pf_member_id", label: "PF member ID" },
    { key: "fy_taxable_income", label: "Taxable income this financial year", type: "number", hint: "From your last employer, for correct TDS" },
    { key: "fy_tds", label: "Tax deducted this financial year", type: "number" }, { key: "reason_for_leaving", label: "Reason for leaving", full: true },
  ],
  education: [
    { key: "level_id", label: "Level", type: "select", opt: "education_level" }, { key: "degree", label: "Degree or course", required: true },
    { key: "specialisation", label: "Specialisation" }, { key: "institution", label: "College / school" },
    { key: "end_year", label: "Year completed", type: "number" }, { key: "score", label: "Score (CGPA or %)" },
  ],
  emergency: [{ key: "name", label: "Name", required: true }, { key: "relation_id", label: "Relation", type: "select", opt: "relation" }, { key: "phone", label: "Phone", required: true }],
};
const LIST = new Set(["family", "nominees", "previous_employment", "education"]);
const INTRO: Record<string, string> = {
  personal: "As on your official documents.", contact: "Where we can reach you.", family: "Used for insurance, ESI and nominations.",
  nominees: "Who receives your PF, pension and gratuity. Shares for each kind must add up to 100%.",
  bank: "Your salary is paid into this account.", statutory: "Needed for PF, ESI and income tax.",
  previous_employment: "Income and tax from earlier this financial year keep your first month's TDS right.",
  tax: "Choose how your income tax is worked out this year.", education: "Your highest qualifications.",
  emergency: "Someone we can call in an emergency.", documents: "Clear photos or PDFs, up to 5 MB each.",
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/public/joining/${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || "Something went wrong. Please try again.");
  return body as T;
}

export default function JoinPortal() {
  const { token } = useParams<{ token: string }>();
  const toast = useToast();
  const [p, setP] = useState<Portal | null>(null);
  const [opts, setOpts] = useState<Options>({});
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    call<Portal>(token).then((x) => { setP(x); setDraft(JSON.parse(JSON.stringify(x.data || {}))); }).catch((e) => setError(e.message));
    call<Options>(`${token}/options`).then(setOpts).catch(() => {});
  }, [token]);

  const steps = p?.sections ?? [];
  const current = steps[step];
  const options = (key?: string): SelectOption<string>[] => (key ? (opts[key] ?? []).map((o) => ({ value: String(o.value), label: o.label })) : []);

  async function saveSection(): Promise<boolean> {
    if (!p || !current || current.key === "documents" || p.locked) return true;
    setSaving(true);
    try {
      let data = draft[current.key] ?? (LIST.has(current.key) ? [] : {});
      if (current.key === "contact") {
        const c = { ...(data as Row) };
        if (c.same_as_current) c.permanent_address = c.current_address;
        data = c;
      }
      const out = await call<Portal>(`${token}/sections/${current.key}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data }) });
      setP(out);
      setDraft((d) => ({ ...d, [current.key]: out.data[current.key] ?? data }));
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function go(i: number) {
    if (i === step) return;
    if (i > step && !(await saveSection())) return;
    setStep(i);
    top.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function submit() {
    if (!(await saveSection())) return;
    setSaving(true);
    try {
      setP(await call<Portal>(`${token}/submit`, { method: "POST" }));
      toast.success("Sent to HR for review");
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  }

  async function upload(label: string, file: File) {
    const form = new FormData();
    form.append("label", label);
    form.append("file", file);
    try {
      setP(await call<Portal>(`${token}/uploads`, { method: "POST", body: form }));
      toast.success(`${label} uploaded`);
    } catch (e) { toast.error((e as Error).message); }
  }

  const sentBack = useMemo(() => Object.entries(p?.review ?? {}).filter(([, r]) => r.status === "sent_back"), [p]);

  if (error) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <Lock size={28} strokeWidth={1.2} className="mb-3 text-faint" />
        <p className="text-[17px] text-ink">This link can&apos;t be opened</p>
        <p className="mt-1 text-[14px] text-muted">{error}</p>
      </div>
    );
  }
  if (!p) return <div className="mx-auto max-w-3xl space-y-4 px-4 py-10"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-96 rounded-2xl" /></div>;

  const submitted = !!p.submitted_at && p.review_status !== "sent_back";
  return (
    <div className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6" ref={top}>
      <header className="mb-6 flex items-center gap-3">
        {p.company.logo_url ? <img src={p.company.logo_url} alt="" className="h-10 w-auto max-w-[140px] object-contain" /> : (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-[16px] text-white">{(p.company.name ?? "C").slice(0, 1)}</div>
        )}
        <div>
          <p className="text-[13px] text-muted">{p.company.name}</p>
          <h1 className="text-[22px] font-light text-ink">Welcome, {p.joiner.first_name}</h1>
        </div>
      </header>

      <div className="mb-6 rounded-2xl border border-line bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[14px] text-muted">
            {[p.joiner.designation, p.joiner.department].filter(Boolean).join(" · ") || "Joining"} · from <span className="text-ink">{formatDisplayDate(p.joining_date)}</span>
          </p>
          <span className="text-[13px] text-muted">{p.completeness.percent}% done</span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${p.completeness.percent}%` }} /></div>
        {p.locked && <p className="mt-3 flex items-center gap-2 text-[13.5px] text-emerald-700"><CheckCircle2 size={16} strokeWidth={1.4} />HR has accepted your details. Thank you!</p>}
        {!p.locked && submitted && <p className="mt-3 flex items-center gap-2 text-[13.5px] text-emerald-700"><CheckCircle2 size={16} strokeWidth={1.4} />Sent to HR on {formatDisplayDate(p.submitted_at!.slice(0, 10))}. You can still make changes.</p>}
        {sentBack.length > 0 && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-[13.5px] text-rose-800">
            <p className="mb-1 flex items-center gap-2"><AlertCircle size={15} strokeWidth={1.4} />HR asked you to fix {sentBack.length} item(s):</p>
            <ul className="ml-6 list-disc">{sentBack.slice(0, 6).map(([k, r]) => <li key={k}>{k.replace("doc:", "").replace(".", " → ").replace(/_/g, " ")}: {r.remark}</li>)}</ul>
          </div>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {steps.map((s, i) => {
            const filled = s.key === "documents" ? p.uploads.length > 0 : !!p.data[s.key] && (Array.isArray(p.data[s.key]) ? (p.data[s.key] as unknown[]).length > 0 : true);
            const flagged = Object.entries(p.review).some(([k, r]) => r.status === "sent_back" && (k === s.key || k.startsWith(`${s.key}.`) || (s.key === "documents" && k.startsWith("doc:"))));
            return (
              <button key={s.key} type="button" onClick={() => go(i)}
                className={`flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13.5px] transition-colors ${i === step ? "bg-surface text-ink ring-1 ring-line" : "text-muted hover:text-ink"}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${flagged ? "border-rose-300 text-rose-600" : filled ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-line-strong text-faint"}`}>
                  {flagged ? "!" : filled ? <Check size={11} strokeWidth={2} /> : i + 1}
                </span>
                <span className="whitespace-nowrap md:whitespace-normal">{s.label}</span>
              </button>
            );
          })}
        </nav>

        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
          {current && (
            <>
              <h2 className="text-[18px] font-light text-ink">{current.label}</h2>
              <p className="mb-5 mt-1 text-[13.5px] text-muted">{INTRO[current.key]}</p>
              <fieldset disabled={p.locked} className="contents">
                {current.key === "documents" ? (
                  <Documents p={p} onUpload={upload} />
                ) : current.key === "tax" ? (
                  <Tax value={(draft.tax as Row)?.regime as string | undefined} onChange={(v) => setDraft((d) => ({ ...d, tax: { regime: v } }))} />
                ) : LIST.has(current.key) ? (
                  <ListSection section={current.key} rows={(draft[current.key] as Row[]) ?? []} review={p.review[current.key]}
                    options={options} onChange={(rows) => setDraft((d) => ({ ...d, [current.key]: rows }))} />
                ) : (
                  <FormSectionFields section={current.key} value={(draft[current.key] as Row) ?? {}} review={p.review} options={options}
                    onChange={(v) => setDraft((d) => ({ ...d, [current.key]: v }))} />
                )}
              </fieldset>
              <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
                <Button variant="ghost" icon={ChevronLeft} disabled={step === 0} onClick={() => go(step - 1)}>Back</Button>
                {step < steps.length - 1
                  ? <Button variant="primary" iconRight={ChevronRight} loading={saving} onClick={() => go(step + 1)}>Save and continue</Button>
                  : !p.locked && <Button variant="primary" icon={Check} loading={saving} onClick={submit}>{submitted ? "Send changes to HR" : "Submit to HR"}</Button>}
              </div>
            </>
          )}
        </section>
      </div>
      {p.expires_at && <p className="mt-6 text-center text-[12px] text-faint">This personal link works until {formatDisplayDate(p.expires_at.slice(0, 10))}. Please don&apos;t share it.</p>}
    </div>
  );
}

function Remark({ r }: { r?: Review }) {
  if (!r || r.status !== "sent_back" || !r.remark) return null;
  return <p className="mt-1 text-[12px] text-rose-700">HR: {r.remark}</p>;
}

function Input({ f, value, onChange, options }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; options: (k?: string) => SelectOption<string>[] }) {
  const v = value === undefined || value === null ? "" : String(value);
  if (f.type === "date") return <DateInput value={v.slice(0, 10)} onChange={(x) => onChange(x || null)} clearable />;
  if (f.type === "select") return <Select options={f.options ?? options(f.opt)} value={v || null} onChange={(x) => onChange(x && f.opt ? Number(x) : x)} clearable placeholder="Choose" />;
  if (f.type === "check") return <Checkbox checked={!!value} onChange={onChange} label={f.label} />;
  return <TextInput type={f.type === "email" ? "email" : f.type === "number" ? "number" : "text"} inputMode={f.type === "number" ? "decimal" : undefined}
    value={v} onValueChange={(x) => onChange(x)} />;
}

function FormSectionFields({ section, value, review, options, onChange }: {
  section: string; value: Row; review: Record<string, Review>; options: (k?: string) => SelectOption<string>[]; onChange: (v: Row) => void;
}) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-6">
      <FormGrid>
        {(FIELDS[section] ?? []).map((f) => (
          <Field key={f.key} label={f.type === "check" ? undefined : f.label} required={f.required} hint={f.hint} className={f.full ? "sm:col-span-2" : undefined}>
            <div><Input f={f} value={value[f.key]} onChange={(v) => set(f.key, v)} options={options} /><Remark r={review[`${section}.${f.key}`]} /></div>
          </Field>
        ))}
      </FormGrid>
      {section === "contact" && (
        <>
          <Address title="Current address" value={(value.current_address as Row) ?? {}} onChange={(v) => set("current_address", v)} options={options} remark={review["contact.current_address"]} />
          <Checkbox label="Permanent address is the same" checked={!!value.same_as_current} onChange={(v) => set("same_as_current", v)} />
          {!value.same_as_current && <Address title="Permanent address" value={(value.permanent_address as Row) ?? {}} onChange={(v) => set("permanent_address", v)} options={options} remark={review["contact.permanent_address"]} />}
        </>
      )}
    </div>
  );
}

function Address({ title, value, onChange, options, remark }: { title: string; value: Row; onChange: (v: Row) => void; options: (k?: string) => SelectOption<string>[]; remark?: Review }) {
  return (
    <div>
      <p className="mb-3 text-[14px] text-ink">{title}</p>
      <FormGrid>
        {ADDRESS.map((f) => (
          <Field key={f.key} label={f.label} className={f.full ? "sm:col-span-2" : undefined}>
            <Input f={f} value={value[f.key]} onChange={(v) => onChange({ ...value, [f.key]: v })} options={options} />
          </Field>
        ))}
      </FormGrid>
      <Remark r={remark} />
    </div>
  );
}

function ListSection({ section, rows, review, options, onChange }: {
  section: string; rows: Row[]; review?: Review; options: (k?: string) => SelectOption<string>[]; onChange: (rows: Row[]) => void;
}) {
  const fields = FIELDS[section] ?? [];
  const totals = section === "nominees" ? rows.reduce<Record<string, number>>((acc, r) => {
    const k = String(r.kind ?? ""); if (k) acc[k] = (acc[k] ?? 0) + (Number(r.share_percent) || 0); return acc;
  }, {}) : {};
  return (
    <div className="space-y-4">
      <Remark r={review} />
      {rows.map((r, i) => (
        <div key={i} className="rounded-xl border border-line p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[13px] text-muted">{section === "nominees" ? "Nominee" : section === "family" ? "Family member" : section === "education" ? "Qualification" : "Employer"} {i + 1}</p>
            <IconButton icon={Trash2} label="Remove" size="sm" onClick={() => onChange(rows.filter((_, j) => j !== i))} />
          </div>
          <FormGrid>
            {fields.map((f) => (
              <Field key={f.key} label={f.type === "check" ? undefined : f.label} required={f.required} hint={f.hint} className={f.full ? "sm:col-span-2" : undefined}>
                <Input f={f} value={r[f.key]} onChange={(v) => onChange(rows.map((x, j) => (j === i ? { ...x, [f.key]: v } : x)))} options={options} />
              </Field>
            ))}
          </FormGrid>
        </div>
      ))}
      <Button size="sm" icon={Plus} onClick={() => onChange([...rows, section === "nominees" ? { kind: "pf", share_percent: rows.length ? "" : "100" } : {}])}>
        Add {section === "nominees" ? "nominee" : section === "family" ? "family member" : section === "education" ? "qualification" : "employer"}
      </Button>
      {Object.keys(totals).length > 0 && (
        <div className="flex flex-wrap gap-3 text-[12.5px]">
          {Object.entries(totals).map(([k, t]) => (
            <span key={k} className={Math.abs(t - 100) < 0.01 ? "text-emerald-700" : "text-rose-600"}>{NOMINEE_KINDS.find((o) => o.value === k)?.label ?? k}: {t}%</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Tax({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <RadioCards value={value ?? null} onChange={onChange} options={[
      { value: "new", label: "New regime (default)", description: "Lower tax rates with few deductions. Best when you have little to claim." },
      { value: "old", label: "Old regime", description: "Higher rates, but you can claim HRA, 80C investments, home loan interest and more." },
    ]} />
  );
}

function Documents({ p, onUpload }: { p: Portal; onUpload: (label: string, f: File) => void }) {
  const labels = Array.from(new Set([...p.required_documents.map((d) => d.label), ...p.uploads.map((u) => u.label)]));
  return (
    <div className="divide-y divide-line rounded-xl border border-line">
      {labels.map((label) => {
        const req = p.required_documents.find((d) => d.label === label)?.required;
        const up = p.uploads.find((u) => u.label === label);
        return (
          <div key={label} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[14px] text-ink">{label}{req && <span className="text-rose-500"> *</span>}</p>
              {up ? <p className="truncate text-[12.5px] text-muted">{up.name} · {up.status === "accepted" ? "accepted" : up.status === "sent_back" ? "sent back" : "uploaded"}</p>
                : <p className="text-[12.5px] text-faint">{req ? "Required" : "Optional"}</p>}
              {up?.status === "sent_back" && up.remark && <p className="text-[12px] text-rose-700">HR: {up.remark}</p>}
            </div>
            {!p.locked && up?.status !== "accepted" && (
              <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-[13px] text-ink transition-colors hover:border-line-strong">
                <FileUp size={14} strokeWidth={1.4} />{up ? "Replace" : "Upload"}
                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(label, f); e.target.value = ""; }} />
              </label>
            )}
          </div>
        );
      })}
      {!labels.length && <p className="px-4 py-6 text-center text-[13.5px] text-muted">No documents are needed.</p>}
    </div>
  );
}
