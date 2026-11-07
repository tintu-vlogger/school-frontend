"use client";

/*
 * Institution website: shared types, photos and the pieces used by all four designs
 * (classic, modern, serene, pulse). Content comes from /public/companies/{slug}/site:
 * the saved website, the programmes offered (live from the academic set-up) and the
 * words the institution uses ("Classes" or "Programmes" or "Courses").
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, AtSign, BookOpen, CalendarDays, Globe, Link2, Megaphone, PlayCircle, Share2 } from "lucide-react";
import { resolveImageUrl } from "@/lib/api";
import { formatDate } from "@/lib/datetime";

export type SiteJob = {
  uuid: string; title: string; slug: string; department: string | null; location: string | null;
  work_mode: string; work_mode_label?: string; employment_type: string | null;
  min_experience: number | null; max_experience: number | null;
};
export type Website = {
  published: boolean; theme: Theme; accent: string;
  hero: { eyebrow: string; headline: string; subline: string; image_url: string | null };
  about: { title: string; body: string; image_url: string | null };
  stats: { value: string; label: string }[];
  values: { title: string; body: string }[];
  life: { title: string; body: string; perks: string[]; images: string[] };
  leaders: { name: string; role: string; bio: string; photo_url: string | null }[];
  offices: { city: string; address: string; phone: string; head_office: boolean }[];
  contact: { email: string; phone: string; address: string };
  social: { linkedin: string; instagram: string; x: string; facebook: string; youtube: string };
  programs: { title: string; body: string };
  notices: SiteNotice[];
  admissions: { title: string; body: string; open: boolean; button_label: string };
  sections: Record<SectionKey, boolean>;
  show_signin: boolean;
};
export type SiteNotice = { title: string; date: string; body: string; kind: "notice" | "event" };
export type SiteProgram = {
  name: string; code: string | null; level: string | null; description: string;
  duration_terms: number | null; sections: number;
};
export type SiteInstitution = {
  type: string; type_label: string; motto: string; board: string; established_year: number | null;
  terms: Partial<Record<"program" | "programs" | "section" | "sections" | "student" | "students" | "teacher" | "teachers" | "guardian" | "guardians" | "session", string>>;
  admissions_online: boolean;
};
export type SiteCompany = { name: string; slug: string; industry: string | null; city: string | null; logo_url: string };
export type SiteData = {
  company: SiteCompany; site: Website; jobs: SiteJob[];
  /** Older API versions leave these out. */
  programs?: SiteProgram[]; institution?: SiteInstitution;
};
export type Theme = "classic" | "modern" | "serene" | "pulse";
export type SectionKey = "about" | "programs" | "values" | "life" | "leaders" | "notices" | "admissions" | "jobs" | "offices" | "contact";
export type ThemeProps = { data: SiteData; signedIn: boolean };

/* Stock photos (checked to load). The office can pick these or use their own. */
const U = (id: string, w = 1600) => `https://images.unsplash.com/${id}?w=${w}&q=75&auto=format&fit=crop`;
export const PHOTOS = [
  { id: "photo-1503676260728-1c00da094a0b", label: "Classroom" },
  { id: "photo-1580582932707-520aed937b7b", label: "School building" },
  { id: "photo-1509062522246-3755977927d7", label: "Young learners" },
  { id: "photo-1523050854058-8df90110c9f1", label: "Graduation" },
  { id: "photo-1427504494785-3a9ca7044f45", label: "Students together" },
  { id: "photo-1524178232363-1fb2b075b655", label: "Lecture hall" },
  { id: "photo-1497633762265-9d179a990aa6", label: "Books" },
  { id: "photo-1546410531-bb4caa6b424d", label: "Science" },
  { id: "photo-1588072432836-e10032774350", label: "Teacher" },
  { id: "photo-1541339907198-e08756dedf3f", label: "Campus" },
  { id: "photo-1521587760476-6c12a4b040da", label: "Library" },
  { id: "photo-1571260899304-425eee4c7efc", label: "Learning together" },
].map((p) => ({ ...p, url: U(p.id), thumb: U(p.id, 400) }));

const DEFAULT_HERO: Record<Theme, number> = { classic: 0, modern: 4, serene: 6, pulse: 8 };
export function heroImage(site: Website) {
  return site.hero.image_url ? resolveImageUrl(site.hero.image_url) : PHOTOS[DEFAULT_HERO[site.theme] ?? 0].url;
}
export function aboutImage(site: Website) {
  return site.about.image_url ? resolveImageUrl(site.about.image_url) : PHOTOS[site.theme === "serene" ? 11 : 1].url;
}
export function lifeImages(site: Website) {
  const own = site.life.images.map((i) => resolveImageUrl(i));
  return own.length ? own : [PHOTOS[3].url, PHOTOS[5].url, PHOTOS[9].url];
}

export const on = (s: Website, k: SectionKey) => s.sections?.[k] !== false;

/** The institution's own word, e.g. word(d, "programs") -> "Classes" / "Programmes" / "Courses". */
export function word(d: SiteData, key: keyof SiteInstitution["terms"], fallback?: string) {
  const defaults: Record<string, string> = {
    program: "Class", programs: "Classes", section: "Section", sections: "Sections", student: "Student",
    students: "Students", teacher: "Teacher", teachers: "Teachers", guardian: "Parent", guardians: "Parents",
    session: "Academic year",
  };
  return d.institution?.terms?.[key] || fallback || defaults[key];
}

/** Where "Apply" goes: the online application when admissions are on, else the contact section. */
export function admissionHref(d: SiteData) {
  return d.institution?.admissions_online !== false && d.site.admissions?.open !== false ? "/apply" : "#contact";
}
export function admissionLabel(d: SiteData) {
  if (admissionHref(d) === "#contact") return "Enquire now";
  return d.site.admissions?.button_label || "Apply online";
}
export const showsAdmissions = (s: Website) => on(s, "admissions") && !!s.admissions;

export function navLinks(d: SiteData) {
  const s = d.site;
  return [
    on(s, "about") && { href: "#about", label: "About" },
    on(s, "programs") && { href: "#programs", label: word(d, "programs") },
    on(s, "life") && { href: "#life", label: "Campus" },
    on(s, "notices") && { href: "#notices", label: "Notices" },
    showsAdmissions(s) && { href: "#admissions", label: "Admissions" },
    on(s, "contact") && { href: "#contact", label: "Contact" },
  ].filter(Boolean) as { href: string; label: string }[];
}

export function ordinalLabel(i: number) { return String(i + 1).padStart(2, "0"); }

export function experience(j: SiteJob) {
  if (j.min_experience == null && j.max_experience == null) return null;
  if (j.max_experience == null) return `${j.min_experience}+ yrs`;
  return `${j.min_experience ?? 0}–${j.max_experience} yrs`;
}
export function jobMeta(j: SiteJob) {
  return [j.department, j.location, j.work_mode_label || j.work_mode, experience(j)].filter(Boolean).join(" · ");
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
}

export const SIGN_IN_LABEL = "Staff, parent & student sign in";

/** Sign in for staff, parents and students, or straight into the app when already signed in. */
export function SignIn({ signedIn, className, style }: { signedIn: boolean; className: string; style?: React.CSSProperties }) {
  return (
    <Link href={signedIn ? "/dashboard" : "/login"} className={className} style={style} title={signedIn ? undefined : SIGN_IN_LABEL}>
      {signedIn ? "Open dashboard" : <><span className="hidden lg:inline">{SIGN_IN_LABEL}</span><span className="lg:hidden">Sign in</span></>}
      <ArrowUpRight size={15} strokeWidth={1.6} />
    </Link>
  );
}

/* ── School sections shared by the four designs ─────────────────────────────
 * Each design passes a Skin so the same content takes on its look. */
export type Skin = {
  /** "dark" for designs on a dark background (Classic). */
  tone: "dark" | "light";
  accent: string;
  /** Classes for section headings (h2). */
  heading: string;
  /** Muted text colour. */
  muted: string;
  /** Hairline colour. */
  line: string;
  /** Classes and background for cards. */
  card: string;
  cardBg: string;
  /** Small label above a heading. */
  label: (children: React.ReactNode) => React.ReactNode;
  /** Outer wrapper of a section (padding and width). */
  wrap: string;
};

function groupByLevel(programs: SiteProgram[]) {
  const groups: { level: string; items: SiteProgram[] }[] = [];
  for (const p of programs) {
    const level = p.level || "";
    const g = groups.find((x) => x.level === level);
    if (g) g.items.push(p); else groups.push({ level, items: [p] });
  }
  return groups;
}

function durationLabel(d: SiteData, n: number) {
  const t = d.institution?.type;
  const unit = t === "college" || t === "university" ? "semester" : t === "coaching" || t === "training" ? "module" : "term";
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

export function ProgramsBlock({ data, skin }: { data: SiteData; skin: Skin }) {
  const s = data.site;
  const programs = data.programs ?? [];
  const groups = groupByLevel(programs);
  const sec = word(data, "section").toLowerCase(), secs = word(data, "sections").toLowerCase();
  return (
    <section id="programs" className={skin.wrap}>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          {skin.label(word(data, "programs"))}
          <h2 className={skin.heading}>{s.programs?.title || `${word(data, "programs")} we offer`}</h2>
          {s.programs?.body && <p className="mt-4 text-[16.5px] leading-relaxed" style={{ color: skin.muted }}>{s.programs.body}</p>}
        </div>
        {showsAdmissions(s) && (
          <a href={admissionHref(data)} className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14.5px] text-white transition-transform hover:-translate-y-0.5" style={{ background: skin.accent }}>
            {admissionLabel(data)} <ArrowRight size={15} strokeWidth={1.6} />
          </a>
        )}
      </div>
      {programs.length === 0 ? (
        <p className={`mt-10 ${skin.card} text-[15.5px]`} style={{ background: skin.cardBg, color: skin.muted }}>
          Our {word(data, "programs").toLowerCase()} will be listed here soon. Please get in touch to know more.
        </p>
      ) : (
        <div className="mt-10 space-y-8">
          {groups.map((g) => (
            <div key={g.level || "all"}>
              {g.level && groups.length > 1 && <p className="mb-3 text-[13px] uppercase tracking-[0.18em]" style={{ color: skin.muted }}>{g.level}</p>}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {g.items.map((p) => (
                  <div key={p.name} className={`${skin.card} flex min-h-[112px] flex-col justify-between`} style={{ background: skin.cardBg }}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-[18px] leading-snug">{p.name}</p>
                      <BookOpen size={17} strokeWidth={1.4} className="mt-1 shrink-0" style={{ color: skin.accent }} />
                    </div>
                    {p.description && <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed" style={{ color: skin.muted }}>{p.description}</p>}
                    <p className="mt-4 text-[13px]" style={{ color: skin.muted }}>
                      {[p.code, p.sections > 0 ? `${p.sections} ${p.sections === 1 ? sec : secs}` : null,
                        p.duration_terms ? durationLabel(data, p.duration_terms) : null].filter(Boolean).join(" · ") || "\u00a0"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function NoticesBlock({ data, skin }: { data: SiteData; skin: Skin }) {
  const notices = (data.site.notices ?? []).filter((n) => n.title);
  return (
    <section id="notices" className={skin.wrap}>
      {skin.label("Notices & events")}
      <h2 className={skin.heading}>What&apos;s happening</h2>
      {notices.length === 0 ? (
        <div className={`mt-10 ${skin.card} flex items-center gap-4`} style={{ background: skin.cardBg }}>
          <Megaphone size={22} strokeWidth={1.3} style={{ color: skin.accent }} className="shrink-0" />
          <p className="text-[15.5px]" style={{ color: skin.muted }}>No notices right now. News, circulars and upcoming events will appear here.</p>
        </div>
      ) : (
        <div className="mt-10 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {notices.map((n, i) => {
            const Icon = n.kind === "event" ? CalendarDays : Megaphone;
            return (
              <article key={i} className={`${skin.card} flex flex-col`} style={{ background: skin.cardBg }}>
                <div className="flex items-center gap-2 text-[12.5px] uppercase tracking-[0.14em]" style={{ color: skin.muted }}>
                  <Icon size={15} strokeWidth={1.4} style={{ color: skin.accent }} />
                  <span>{n.kind === "event" ? "Event" : "Notice"}</span>
                  {n.date && <><span aria-hidden>·</span><span className="normal-case tracking-normal">{/^\d{4}-\d{2}-\d{2}$/.test(n.date) ? formatDate(n.date) : n.date}</span></>}
                </div>
                <h3 className="mt-3 text-[19px] leading-snug">{n.title}</h3>
                {n.body && <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: skin.muted }}>{n.body}</p>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function AdmissionsBlock({ data, skin, className = "", style }: { data: SiteData; skin: Skin; className?: string; style?: React.CSSProperties }) {
  const a = data.site.admissions;
  const href = admissionHref(data);
  const phone = data.site.contact.phone;
  return (
    <section id="admissions" className={className} style={style}>
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div>
          <p className="text-[13px] uppercase tracking-[0.22em] opacity-70">Admissions{data.institution?.terms?.session ? ` · ${data.institution.terms.session}` : ""}</p>
          <h2 className={skin.heading}>{a.title || "Admissions are open"}</h2>
          {a.body && <p className="mt-5 max-w-2xl text-[16.5px] leading-relaxed opacity-80">{a.body}</p>}
        </div>
        <div className="flex flex-wrap gap-3 lg:justify-end">
          <a href={href} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] text-[#14171f] transition-transform hover:-translate-y-0.5">
            {admissionLabel(data)} <ArrowRight size={16} strokeWidth={1.6} />
          </a>
          {phone && <a href={`tel:${phone}`} className="inline-flex items-center rounded-full border border-white/40 px-6 py-3 text-[15px] hover:bg-white/10">Call {phone}</a>}
        </div>
      </div>
    </section>
  );
}

/** Small "why choose us" / campus wording that follows the institution type. */
export function highlightsTitle(d: SiteData) {
  const t = d.institution?.type;
  return t === "college" || t === "university" || t === "coaching" || t === "training" ? "Why students choose us" : "Why families choose us";
}

export function Logo({ company, accent, dark = false, size = 36 }: { company: SiteCompany; accent: string; dark?: boolean; size?: number }) {
  if (company.logo_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={resolveImageUrl(company.logo_url)} alt={company.name} style={{ height: size }} className="max-w-[160px] object-contain" />;
  }
  return (
    <span className="flex items-center justify-center rounded-xl text-[15px]"
      style={{ height: size, width: size, background: dark ? "#fff" : accent, color: dark ? "#111" : "#fff" }}>
      {initials(company.name)}
    </span>
  );
}

export function Socials({ s, className = "" }: { s: Website["social"]; className?: string }) {
  const items = [
    { href: s.linkedin, label: "LinkedIn", Icon: Link2 },
    { href: s.instagram, label: "Instagram", Icon: AtSign },
    { href: s.x, label: "X", Icon: Share2 },
    { href: s.facebook, label: "Facebook", Icon: Globe },
    { href: s.youtube, label: "YouTube", Icon: PlayCircle },
  ].filter((i) => i.href);
  if (!items.length) return null;
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map(({ href, label, Icon }) => (
        <a key={label} href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-current/20 px-3 py-1.5 text-[13px] opacity-80 transition-opacity hover:opacity-100">
          <Icon size={14} strokeWidth={1.5} /> {label}
        </a>
      ))}
    </div>
  );
}

export function useScrolled(px = 24) {
  const [s, setS] = useState(false);
  useEffect(() => {
    const f = () => setS(window.scrollY > px);
    f(); window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, [px]);
  return s;
}

export function Paragraphs({ text, className = "" }: { text: string; className?: string }) {
  return <>{text.split(/\n{2,}/).filter(Boolean).map((p, i) => <p key={i} className={className}>{p}</p>)}</>;
}

export const year = () => new Date().getFullYear();
