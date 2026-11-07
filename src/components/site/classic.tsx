"use client";

/* Classic: dark, cinematic and editorial. Big thin type, full-bleed photo, numbered chapters. */
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import {
  AdmissionsBlock, Logo, NoticesBlock, Paragraphs, ProgramsBlock, SIGN_IN_LABEL, SignIn, Socials, aboutImage, admissionHref,
  admissionLabel, heroImage, highlightsTitle, initials, jobMeta, lifeImages, navLinks, on, showsAdmissions, useScrolled, word, year,
  type Skin, type ThemeProps,
} from "./shared";

export default function Classic({ data, signedIn }: ThemeProps) {
  const { company, site, jobs } = data;
  const a = site.accent;
  const scrolled = useScrolled();
  const links = navLinks(data);
  let n = 0;
  const num = () => String(++n).padStart(2, "0");
  const skin = (label: string): Skin => ({
    tone: "dark", accent: a, muted: "rgba(255,255,255,0.6)", line: "rgba(255,255,255,0.1)",
    heading: "mt-6 text-[40px] font-extralight leading-[1.08] tracking-tight lg:text-[52px]",
    card: "rounded-sm border border-white/10 p-6", cardBg: "#111318",
    wrap: "mx-auto max-w-7xl px-5 py-28 lg:px-10",
    label: (c) => <Chapter n={label} a={a}>{c}</Chapter>,
  });

  return (
    <div className="min-h-screen bg-[#0c0d10] font-[family-name:var(--font-outfit)] font-light text-white antialiased">
      <header className={`fixed inset-x-0 top-0 z-40 transition-colors ${scrolled ? "bg-[#0c0d10]/85 backdrop-blur-md" : ""}`}>
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 lg:px-10">
          <a href="#top" className="flex items-center gap-3"><Logo company={company} accent={a} dark /><span className="text-[17px] tracking-tight">{company.name}</span></a>
          <nav className="hidden items-center gap-8 text-[14px] text-white/70 md:flex">
            {links.map((l) => <a key={l.href} href={l.href} className="transition-colors hover:text-white">{l.label}</a>)}
          </nav>
          {site.show_signin && <SignIn signedIn={signedIn} className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-4 py-2 text-[13.5px] transition-colors hover:bg-white hover:text-black" />}
        </div>
      </header>

      {/* Hero */}
      <section id="top" className="relative flex min-h-[100svh] items-end overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={heroImage(site)} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0d10] via-[#0c0d10]/40 to-[#0c0d10]/30" />
        <div className="relative mx-auto w-full max-w-7xl px-5 pb-20 lg:px-10 lg:pb-28">
          {site.hero.eyebrow && <p className="mb-6 flex items-center gap-3 text-[13px] uppercase tracking-[0.25em] text-white/70"><span className="h-px w-10" style={{ background: a }} />{site.hero.eyebrow}</p>}
          <h1 className="max-w-5xl text-[44px] font-extralight leading-[1.02] tracking-[-0.02em] sm:text-[68px] lg:text-[92px]">{site.hero.headline}</h1>
          <div className="mt-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <p className="max-w-xl text-[17px] leading-relaxed text-white/75">{site.hero.subline}</p>
            <div className="flex flex-wrap gap-3">
              {showsAdmissions(site) && <a href={admissionHref(data)} className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] text-white transition-transform hover:-translate-y-0.5" style={{ background: a }}>{admissionLabel(data)} <ArrowRight size={16} strokeWidth={1.6} /></a>}
              {on(site, "programs") ? <a href="#programs" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-[15px] hover:bg-white/10">Explore {word(data, "programs").toLowerCase()}</a>
                : on(site, "about") && <a href="#about" className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-[15px] hover:bg-white/10">Our story</a>}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      {site.stats.length > 0 && (
        <section className="border-y border-white/10">
          <div className="mx-auto grid max-w-7xl grid-cols-2 px-5 lg:grid-cols-4 lg:px-10">
            {site.stats.slice(0, 4).map((s, i) => (
              <div key={i} className={`py-10 ${i ? "lg:border-l lg:border-white/10 lg:pl-10" : ""}`}>
                <p className="text-[44px] font-extralight leading-none tracking-tight">{s.value}</p>
                <p className="mt-3 text-[13px] uppercase tracking-[0.18em] text-white/50">{s.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {on(site, "about") && (
        <section id="about" className="mx-auto grid max-w-7xl gap-14 px-5 py-28 lg:grid-cols-12 lg:px-10">
          <div className="lg:col-span-5">
            <Chapter n={num()} a={a}>About</Chapter>
            <h2 className="mt-6 text-[40px] font-extralight leading-[1.08] tracking-tight lg:text-[52px]">{site.about.title}</h2>
          </div>
          <div className="space-y-6 text-[17px] leading-[1.8] text-white/70 lg:col-span-7">
            <Paragraphs text={site.about.body} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={aboutImage(site)} alt="" className="mt-10 aspect-[16/9] w-full rounded-sm object-cover grayscale-[30%]" />
          </div>
        </section>
      )}

      {on(site, "programs") && <div className="border-t border-white/10"><ProgramsBlock data={data} skin={skin(num())} /></div>}

      {on(site, "values") && site.values.length > 0 && (
        <section id="values" className="border-t border-white/10">
          <div className="mx-auto max-w-7xl px-5 py-28 lg:px-10">
            <Chapter n={num()} a={a}>{highlightsTitle(data)}</Chapter>
            <div className="mt-14 grid gap-px overflow-hidden rounded-sm bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
              {site.values.map((v, i) => (
                <div key={i} className="bg-[#0c0d10] p-8 transition-colors hover:bg-[#121419]">
                  <p className="text-[13px] tabular-nums text-white/40">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-10 text-[24px] font-light">{v.title}</h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-white/60">{v.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {on(site, "life") && (
        <section id="life" className="border-t border-white/10">
          <div className="mx-auto max-w-7xl px-5 py-28 lg:px-10">
            <div className="grid gap-10 lg:grid-cols-2">
              <div>
                <Chapter n={num()} a={a}>Campus life</Chapter>
                <h2 className="mt-6 text-[40px] font-extralight leading-tight lg:text-[52px]">{site.life.title}</h2>
                <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-white/65">{site.life.body}</p>
              </div>
              <ul className="grid content-end gap-x-8 sm:grid-cols-2">
                {site.life.perks.map((p) => (
                  <li key={p} className="flex items-center gap-3 border-b border-white/10 py-4 text-[16px] text-white/80"><span className="h-1.5 w-1.5 rounded-full" style={{ background: a }} />{p}</li>
                ))}
              </ul>
            </div>
            <div className="mt-16 grid gap-4 sm:grid-cols-3">
              {lifeImages(site).slice(0, 3).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className={`w-full rounded-sm object-cover ${i === 1 ? "aspect-[3/4] sm:mt-12" : "aspect-[3/4]"}`} />
              ))}
            </div>
          </div>
        </section>
      )}

      {on(site, "leaders") && site.leaders.length > 0 && (
        <section id="leaders" className="border-t border-white/10">
          <div className="mx-auto max-w-7xl px-5 py-28 lg:px-10">
            <Chapter n={num()} a={a}>Leadership</Chapter>
            <div className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              {site.leaders.map((l, i) => (
                <div key={i}>
                  {l.photo_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={l.photo_url} alt={l.name} className="aspect-[4/5] w-full rounded-sm object-cover grayscale" />
                    : <div className="flex aspect-[4/5] w-full items-center justify-center rounded-sm bg-white/[0.04] text-[48px] font-extralight text-white/40">{initials(l.name)}</div>}
                  <p className="mt-5 text-[19px]">{l.name}</p>
                  <p className="text-[14px] text-white/50">{l.role}</p>
                  {l.bio && <p className="mt-3 text-[14.5px] leading-relaxed text-white/60">{l.bio}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {on(site, "notices") && <div className="border-t border-white/10"><NoticesBlock data={data} skin={skin(num())} /></div>}

      {showsAdmissions(site) && (
        <div className="mx-auto max-w-7xl px-5 pb-6 lg:px-10">
          <AdmissionsBlock data={data} skin={skin("")} className="rounded-sm p-8 text-white lg:p-14" style={{ background: `linear-gradient(120deg, ${a}, #1b1d24 120%)` }} />
        </div>
      )}

      {on(site, "jobs") && (
        <section id="careers" className="border-t border-white/10">
          <div className="mx-auto max-w-7xl px-5 py-28 lg:px-10">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <Chapter n={num()} a={a}>Careers</Chapter>
                <h2 className="mt-6 text-[40px] font-extralight lg:text-[52px]">{jobs.length ? "Teach and work with us" : "No vacancies right now"}</h2>
              </div>
              <Link href="/careers" className="inline-flex items-center gap-2 text-[15px] text-white/70 hover:text-white">All vacancies <ArrowUpRight size={16} strokeWidth={1.5} /></Link>
            </div>
            <div className="mt-12 divide-y divide-white/10 border-y border-white/10">
              {jobs.map((j) => (
                <Link key={j.uuid} href={`/careers/${j.slug}`} className="group flex items-center justify-between gap-6 py-7 transition-colors hover:bg-white/[0.02]">
                  <div>
                    <p className="text-[22px] font-light transition-colors group-hover:text-white" style={{}}>{j.title}</p>
                    <p className="mt-1 text-[14px] text-white/50">{jobMeta(j)}</p>
                  </div>
                  <ArrowUpRight size={22} strokeWidth={1.2} className="shrink-0 text-white/40 transition-transform group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-white" />
                </Link>
              ))}
              {!jobs.length && <p className="py-8 text-[16px] text-white/50">There are no staff vacancies at the moment. Check back soon.</p>}
            </div>
          </div>
        </section>
      )}

      {(on(site, "offices") || on(site, "contact")) && (
        <section id="contact" className="border-t border-white/10">
          <div className="mx-auto grid max-w-7xl gap-14 px-5 py-28 lg:grid-cols-2 lg:px-10">
            {on(site, "contact") && (
              <div>
                <Chapter n={num()} a={a}>Contact</Chapter>
                <h2 className="mt-6 text-[40px] font-extralight lg:text-[52px]">Visit or write to us.</h2>
                <div className="mt-10 space-y-4 text-[17px] text-white/75">
                  {site.contact.email && <a href={`mailto:${site.contact.email}`} className="flex items-center gap-3 hover:text-white"><Mail size={18} strokeWidth={1.3} />{site.contact.email}</a>}
                  {site.contact.phone && <a href={`tel:${site.contact.phone}`} className="flex items-center gap-3 hover:text-white"><Phone size={18} strokeWidth={1.3} />{site.contact.phone}</a>}
                  {site.contact.address && <p className="flex items-start gap-3"><MapPin size={18} strokeWidth={1.3} className="mt-1 shrink-0" />{site.contact.address}</p>}
                </div>
                <Socials s={site.social} className="mt-8 text-white" />
              </div>
            )}
            {on(site, "offices") && site.offices.some((o) => o.city) && (
              <div className="grid content-start gap-px bg-white/10 sm:grid-cols-2">
                {site.offices.filter((o) => o.city).map((o, i) => (
                  <div key={i} className="bg-[#0c0d10] p-6">
                    <p className="text-[12px] uppercase tracking-[0.2em] text-white/40">{o.head_office ? "Main campus" : "Campus"}</p>
                    <p className="mt-3 text-[22px] font-light">{o.city}</p>
                    {o.address && <p className="mt-2 text-[14px] leading-relaxed text-white/55">{o.address}</p>}
                    {o.phone && <p className="mt-2 text-[14px] text-white/55">{o.phone}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-10 text-[13.5px] text-white/45 sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <p>© {year()} {company.name}</p>
          <div className="flex gap-6">
            {on(site, "jobs") && <Link href="/careers" className="hover:text-white">Careers</Link>}
            <Link href="/login" className="hover:text-white">{SIGN_IN_LABEL}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Chapter({ n, a, children }: { n: string; a: string; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-3 text-[13px] uppercase tracking-[0.22em] text-white/50">
      <span className="tabular-nums" style={{ color: a }}>{n}</span><span className="h-px w-8 bg-white/20" />{children}
    </p>
  );
}
