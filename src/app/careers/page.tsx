"use client";

/*
 * Public careers page on the company's own address: branding, filters and open jobs.
 * ?embed=1 hides the header and footer for the website widget and reports its height.
 */
import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Briefcase, MapPin, Search } from "lucide-react";
import { Select } from "@/components/ui-kit";
import {
  CompanyMark, PublicCard, PublicMessage, publicFetch, rupees, useCompanySlug, useEmbedHeight,
} from "@/components/recruitment/public";

type PubJob = {
  uuid: string; code: string | null; title: string; slug: string; summary: string | null; department: string | null;
  location: string | null; work_mode: string; work_mode_label: string; employment_type: string | null;
  skills: string[]; min_experience: number | null; max_experience: number | null; published_at: string | null;
  salary_min?: string | null; salary_max?: string | null;
};
type Careers = {
  company: { name: string; logo_url: string | null; city: string | null };
  branding: { headline: string; intro: string; about: string; accent: string; show_department_filter: boolean; show_location_filter: boolean };
  privacy_notice: string; retention_days: number; grievance_contact: string | null;
  jobs: PubJob[]; filters: { departments: string[]; locations: string[]; work_modes: string[] };
};
const MODE: Record<string, string> = { office: "Office", remote: "Remote", hybrid: "Hybrid" };

function CareersInner() {
  const slug = useCompanySlug();
  const embed = useSearchParams().get("embed") === "1";
  useEmbedHeight(embed);
  const [data, setData] = useState<Careers | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState<string | null>(null);
  const [loc, setLoc] = useState<string | null>(null);
  const [mode, setMode] = useState<string | null>(null);

  useEffect(() => {
    if (slug === undefined) return;
    if (!slug) { setError("Open this page from your company's web address."); return; }
    publicFetch<Careers>(`/public/careers/${slug}`).then(setData).catch((e) => setError(e.message));
  }, [slug]);
  useEffect(() => { if (data) document.title = `Careers at ${data.company.name}`; }, [data]);

  const jobs = useMemo(() => (data?.jobs ?? []).filter((j) => {
    const t = q.trim().toLowerCase();
    return (!t || j.title.toLowerCase().includes(t) || j.skills.some((s) => s.toLowerCase().includes(t)))
      && (!dept || j.department === dept) && (!loc || j.location === loc) && (!mode || j.work_mode === mode);
  }), [data, q, dept, loc, mode]);

  if (error) return <PublicMessage title="Careers page not available" hint={error} />;
  if (!data) return <div className="mx-auto max-w-4xl px-4 py-16"><div className="h-40 animate-pulse rounded-2xl bg-sunken" /></div>;
  const accent = data.branding.accent || "#4f46e5";
  const suffix = embed ? "?embed=1" : "";
  return (
    <div>
      {!embed && (
        <header className="border-b border-line bg-surface">
          <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-4">
            <CompanyMark name={data.company.name} logo={data.company.logo_url} accent={accent} />
            <p className="text-[16px] text-ink">{data.company.name}</p>
          </div>
        </header>
      )}
      <main className={`mx-auto max-w-4xl px-4 ${embed ? "py-4" : "py-12"}`}>
        <h1 className="text-[32px] font-extralight leading-tight text-ink">{data.branding.headline}</h1>
        {data.branding.intro && <p className="mt-3 max-w-2xl text-[15.5px] text-muted">{data.branding.intro}</p>}
        <div className="mt-8 flex flex-wrap gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} strokeWidth={1.4} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search roles or skills" aria-label="Search roles"
              className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-[14px] outline-none focus:border-primary/50" />
          </div>
          {data.branding.show_department_filter && data.filters.departments.length > 1 && (
            <div className="w-48"><Select value={dept} onChange={setDept} clearable placeholder="All teams" aria-label="Team"
              options={data.filters.departments.map((d) => ({ value: d, label: d }))} /></div>
          )}
          {data.branding.show_location_filter && data.filters.locations.length > 1 && (
            <div className="w-44"><Select value={loc} onChange={setLoc} clearable placeholder="All locations" aria-label="Location"
              options={data.filters.locations.map((d) => ({ value: d, label: d }))} /></div>
          )}
          {data.filters.work_modes.length > 1 && (
            <div className="w-40"><Select value={mode} onChange={setMode} clearable placeholder="Any work mode" aria-label="Work mode"
              options={data.filters.work_modes.map((d) => ({ value: d, label: MODE[d] ?? d }))} /></div>
          )}
        </div>
        <p className="mt-6 text-[13px] text-faint">{jobs.length} open role{jobs.length === 1 ? "" : "s"}</p>
        <div className="mt-3 space-y-3">
          {jobs.map((j) => (
            <Link key={j.uuid} href={`/careers/${j.slug}${suffix}`} className="block">
              <PublicCard className="p-5 transition-colors hover:border-line-strong">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[17px] text-ink">{j.title}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                      {j.department && <span className="inline-flex items-center gap-1"><Briefcase size={13} strokeWidth={1.4} />{j.department}</span>}
                      {j.location && <span className="inline-flex items-center gap-1"><MapPin size={13} strokeWidth={1.4} />{j.location}</span>}
                      <span>{j.work_mode_label}</span>
                      {(j.min_experience !== null || j.max_experience !== null) && <span>{j.min_experience ?? 0}–{j.max_experience ?? "+"} years</span>}
                    </p>
                    {j.summary && <p className="mt-2 text-[14px] text-muted">{j.summary}</p>}
                  </div>
                  <span className="shrink-0 rounded-full px-3 py-1 text-[13px] text-white" style={{ background: accent }}>View role</span>
                </div>
                {(j.salary_min || j.salary_max) && <p className="mt-2 text-[13px] text-ink">{rupees(j.salary_min)} – {rupees(j.salary_max)} a year</p>}
              </PublicCard>
            </Link>
          ))}
          {!jobs.length && <PublicCard className="p-10 text-center text-[14px] text-muted">No open roles match. Check back soon.</PublicCard>}
        </div>
        {data.branding.about && !embed && (
          <section className="mt-12"><p className="text-[18px] font-light text-ink">About {data.company.name}</p>
            <p className="mt-2 whitespace-pre-line text-[14.5px] text-muted">{data.branding.about}</p></section>
        )}
      </main>
      {!embed && (
        <footer className="border-t border-line py-6 text-center text-[12.5px] text-faint">
          {data.grievance_contact ? `Questions about your data: ${data.grievance_contact}` : data.company.name}
        </footer>
      )}
    </div>
  );
}

export default function CareersPage() {
  return <Suspense><CareersInner /></Suspense>;
}
