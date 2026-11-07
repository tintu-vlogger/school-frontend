"use client";

/*
 * Company website: shared types, photos and small pieces used by all four designs
 * (classic, modern, serene, pulse). Content comes from /public/companies/{slug}/site.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, AtSign, Globe, Link2, PlayCircle, Share2 } from "lucide-react";
import { resolveImageUrl } from "@/lib/api";

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
  sections: Record<SectionKey, boolean>;
  show_signin: boolean;
};
export type SiteCompany = { name: string; slug: string; industry: string | null; city: string | null; logo_url: string };
export type SiteData = { company: SiteCompany; site: Website; jobs: SiteJob[] };
export type Theme = "classic" | "modern" | "serene" | "pulse";
export type SectionKey = "about" | "values" | "life" | "leaders" | "jobs" | "offices" | "contact";
export type ThemeProps = { data: SiteData; signedIn: boolean };

/* Stock photos (checked to load). HR can pick these or use their own. */
const U = (id: string, w = 1600) => `https://images.unsplash.com/${id}?w=${w}&q=75&auto=format&fit=crop`;
export const PHOTOS = [
  { id: "photo-1522071820081-009f0129c71c", label: "Team at work" },
  { id: "photo-1497366216548-37526070297c", label: "Bright office" },
  { id: "photo-1556761175-5973dc0f32e7", label: "Meeting" },
  { id: "photo-1521737604893-d14cc237f11d", label: "Together" },
  { id: "photo-1600880292203-757bb62b4baf", label: "Discussion" },
  { id: "photo-1552664730-d307ca884978", label: "Workshop" },
  { id: "photo-1529156069898-49953e39b3ac", label: "Friends" },
  { id: "photo-1517245386807-bb43f82c33c4", label: "Planning" },
  { id: "photo-1531482615713-2afd69097998", label: "Laptops" },
  { id: "photo-1542744173-8e7e53415bb0", label: "Presentation" },
  { id: "photo-1497215728101-856f4ea42174", label: "Workspace" },
  { id: "photo-1573164713714-d95e436ab8d6", label: "Colleague" },
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

export function navLinks(d: SiteData) {
  const s = d.site;
  return [
    on(s, "about") && { href: "#about", label: "About" },
    on(s, "values") && s.values.length > 0 && { href: "#values", label: "Values" },
    on(s, "life") && { href: "#life", label: "Life here" },
    on(s, "leaders") && s.leaders.length > 0 && { href: "#leaders", label: "Leadership" },
    on(s, "jobs") && { href: "#careers", label: "Careers" },
    on(s, "contact") && { href: "#contact", label: "Contact" },
  ].filter(Boolean) as { href: string; label: string }[];
}

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

/** Sign in for employees, or straight into the HR app when already signed in. */
export function SignIn({ signedIn, className, style }: { signedIn: boolean; className: string; style?: React.CSSProperties }) {
  return (
    <Link href={signedIn ? "/dashboard" : "/login"} className={className} style={style}>
      {signedIn ? "Open HR app" : "Employee sign in"} <ArrowUpRight size={15} strokeWidth={1.6} />
    </Link>
  );
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
