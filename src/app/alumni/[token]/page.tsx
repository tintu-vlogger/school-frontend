"use client";

/*
 * Alumni portal: a former employee opens it from the personal link sent at exit (no
 * sign-in) to download letters, payslips and tax certificates until access ends.
 * Data from GET /public/alumni/{token}.
 */
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Briefcase, Download, FileText, Mail, Receipt, ShieldCheck, Landmark } from "lucide-react";
import { API_BASE, resolveImageUrl } from "@/lib/api";
import { formatDisplayDate } from "@/components/ui-kit/date";

type Alumni = {
  company: { name: string | null; logo_url: string | null; email: string | null };
  person: { name: string; employee_code: string | null; designation: string | null; department: string | null;
    date_of_joining: string | null; last_working_day: string; rehire_eligible: boolean | null };
  access_until: string | null;
  documents: { uuid: string; title: string; kind: string; date: string; file: { url: string; download_url: string } | null }[];
  payslips: { uuid: string; period_start: string; period_end: string; net: string }[];
  tax: { uuid: string | null; fy: string; name: string; generated?: boolean }[];
  timeline: { date: string; change: string; changes: Record<string, { old: unknown; new: unknown }> }[];
  hr_contact: string | null;
};

const S = 1.4;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CHANGE: Record<string, string> = {
  joining: "Joined", promotion: "Promoted", transfer: "Transferred", redesignation: "New designation", confirmation: "Confirmed",
  exit: "Left", rehire: "Rejoined", status: "Stage change", department_change: "Moved department",
};

export default function AlumniPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<Alumni | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/public/alumni/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(r.status === 404 ? "This alumni link is not valid." : body.detail || "Something went wrong.");
        setData(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Something went wrong."));
  }, [token]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md rounded-2xl border border-line bg-surface p-8 text-center">
          <ShieldCheck size={28} strokeWidth={1.2} className="mx-auto mb-3 text-faint" />
          <p className="text-[17px] font-light text-ink">Alumni access</p>
          <p className="mt-2 text-[14px] text-muted">{error} If you need your letters or payslips, write to the HR team of your former employer.</p>
        </div>
      </main>
    );
  }
  if (!data) {
    return <main className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-primary" /></main>;
  }

  const p = data.person;
  const fileUrl = (path: string) => `${API_BASE}/public/alumni/${encodeURIComponent(token)}${path}`;
  return (
    <main className="mx-auto max-w-4xl px-5 py-10">
      <header className="mb-8 flex items-center gap-3">
        {data.company.logo_url ? <img src={resolveImageUrl(data.company.logo_url)} alt="" className="h-10 max-w-[160px] object-contain" />
          : <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><Briefcase size={18} strokeWidth={S} /></span>}
        <div>
          <p className="text-[15px] text-ink">{data.company.name}</p>
          <p className="text-[12.5px] text-muted">Alumni portal</p>
        </div>
      </header>

      <section className="mb-6 rounded-2xl border border-line bg-surface p-6">
        <p className="text-[12px] uppercase tracking-[0.08em] text-faint">Welcome back</p>
        <h1 className="mt-1 text-[26px] font-light text-ink">{p.name}</h1>
        <p className="mt-1 text-[14.5px] text-muted">
          {[p.designation, p.department].filter(Boolean).join(", ") || "Former employee"}
          {p.date_of_joining && <> · {formatDisplayDate(p.date_of_joining)} to {formatDisplayDate(p.last_working_day)}</>}
        </p>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-muted">
          {p.employee_code && <span>Employee ID {p.employee_code}</span>}
          {data.access_until && <span>Access until {formatDisplayDate(data.access_until)}</span>}
          {p.rehire_eligible && <span className="text-emerald-700">Welcome to apply again</span>}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Section title="Letters and documents" icon={FileText} empty="No documents yet.">
          {data.documents.map((d) => (
            <Row key={d.uuid} title={d.title} sub={formatDisplayDate(d.date.slice(0, 10))} href={d.file ? resolveImageUrl(d.file.download_url) : undefined} />
          ))}
        </Section>
        <Section title="Payslips" icon={Receipt} empty="No payslips available.">
          {data.payslips.map((s) => {
            const d = new Date(`${s.period_start}T00:00:00`);
            return <Row key={s.uuid} title={`${MONTHS[d.getMonth()]} ${d.getFullYear()}`} sub={s.net ? `Net ₹${Number(s.net).toLocaleString("en-IN")}` : undefined}
              href={fileUrl(`/payslips/${s.uuid}.pdf`)} />;
          })}
        </Section>
        <Section title="Tax certificates" icon={Landmark} empty="No tax certificates yet.">
          {data.tax.map((t) => <Row key={t.fy} title={`Form 16 · ${t.fy}`} sub={t.generated ? "Prepared on request" : t.name} href={fileUrl(`/tax/${t.fy}.pdf`)} />)}
        </Section>
        <Section title="Your journey with us" icon={Briefcase} empty="No history recorded.">
          {data.timeline.map((t, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-3 text-[14px]">
              <span className="text-ink">{CHANGE[t.change] ?? t.change.replace(/_/g, " ")}</span>
              <span className="text-[12.5px] text-muted">{formatDisplayDate(t.date)}</span>
            </div>
          ))}
        </Section>
      </div>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 text-[13px] text-muted">
        <span>We keep only what the law requires and what you need for these downloads.</span>
        {data.hr_contact && <a href={`mailto:${data.hr_contact}`} className="inline-flex items-center gap-1.5 text-primary hover:underline"><Mail size={14} strokeWidth={S} />{data.hr_contact}</a>}
      </footer>
    </main>
  );
}

function Section({ title, icon: Icon, empty, children }: { title: string; icon: typeof FileText; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
        <Icon size={16} strokeWidth={S} className="text-muted" />
        <p className="text-[15px] text-ink">{title}</p>
      </div>
      <div className="divide-y divide-line">{children.length ? children : <p className="px-5 py-6 text-[13.5px] text-faint">{empty}</p>}</div>
    </section>
  );
}

function Row({ title, sub, href }: { title: string; sub?: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3">
      <div className="min-w-0"><p className="truncate text-[14px] text-ink">{title}</p>{sub && <p className="text-[12.5px] text-muted">{sub}</p>}</div>
      {href && <a href={href} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink transition-colors hover:border-line-strong">
        <Download size={14} strokeWidth={S} />Download</a>}
    </div>
  );
}
