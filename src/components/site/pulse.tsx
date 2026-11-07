"use client";

/* Pulse: bold, app-like bento grid with big grotesque type and contrasting tiles. */
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import {
  AdmissionsBlock, Logo, NoticesBlock, Paragraphs, ProgramsBlock, SIGN_IN_LABEL, SignIn, Socials, aboutImage, admissionHref,
  admissionLabel, heroImage, highlightsTitle, initials, jobMeta, lifeImages, navLinks, on, showsAdmissions, word, year,
  type Skin, type ThemeProps,
} from "./shared";

const BG = "#eceef1", INK = "#0b0d12", MUTED = "#5d6270";
const GROT = "font-[family-name:var(--font-grotesque)]";

export default function Pulse({ data, signedIn }: ThemeProps) {
  const { company, site, jobs } = data;
  const a = site.accent;
  const links = navLinks(data);
  const tile = "rounded-[28px] bg-white p-7";
  const skin: Skin = {
    tone: "light", accent: a, muted: MUTED, line: BG,
    heading: `${GROT} mt-5 text-[38px] font-bold leading-[1] tracking-[-0.035em] lg:text-[48px]`,
    card: "rounded-[22px] p-6", cardBg: BG,
    wrap: `${tile} lg:p-10`,
    label: (c) => <Tag>{c}</Tag>,
  };

  return (
    <div className="min-h-screen font-[family-name:var(--font-outfit)] font-light antialiased" style={{ background: BG, color: INK }}>
      <header className="sticky top-3 z-40 mx-auto mt-3 max-w-7xl px-3">
        <div className="flex h-14 items-center justify-between rounded-full bg-white/90 pl-3 pr-2 shadow-[0_1px_2px_rgba(0,0,0,0.05)] backdrop-blur-md">
          <a href="#top" className="flex items-center gap-2.5"><Logo company={company} accent={a} size={34} /><span className={`${GROT} text-[17px] font-semibold tracking-tight`}>{company.name}</span></a>
          <nav className="hidden items-center gap-1 text-[14px] md:flex" style={{ color: MUTED }}>
            {links.map((l) => <a key={l.href} href={l.href} className="rounded-full px-3 py-1.5 hover:bg-[#eceef1] hover:text-[#0b0d12]">{l.label}</a>)}
          </nav>
          {site.show_signin && <SignIn signedIn={signedIn} className="inline-flex items-center gap-1.5 rounded-full bg-[#0b0d12] px-4 py-2 text-[13.5px] text-white hover:opacity-90" />}
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-3 px-3 pb-3 pt-3">
        {/* Hero bento */}
        <section id="top" className="grid gap-3 lg:grid-cols-12">
          <div className="flex min-h-[460px] flex-col justify-between rounded-[28px] p-8 text-white lg:col-span-7 lg:p-12" style={{ background: INK }}>
            {site.hero.eyebrow && <span className="w-fit rounded-full px-3 py-1 text-[13px]" style={{ background: a }}>{site.hero.eyebrow}</span>}
            <div>
              <h1 className={`${GROT} mt-10 text-[46px] font-bold leading-[0.95] tracking-[-0.045em] sm:text-[68px] lg:text-[82px]`}>{site.hero.headline}</h1>
              <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-white/70">{site.hero.subline}</p>
              <div className="mt-8 flex flex-wrap gap-2">
                {showsAdmissions(site) && <a href={admissionHref(data)} className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] text-[#0b0d12] hover:opacity-90">{admissionLabel(data)} <ArrowRight size={16} strokeWidth={1.8} /></a>}
                {on(site, "programs") ? <a href="#programs" className="inline-flex items-center rounded-full border border-white/25 px-6 py-3 text-[15px] hover:bg-white/10">Explore {word(data, "programs").toLowerCase()}</a>
                  : on(site, "about") && <a href="#about" className="inline-flex items-center rounded-full border border-white/25 px-6 py-3 text-[15px] hover:bg-white/10">About us</a>}
              </div>
            </div>
          </div>
          <div className="grid gap-3 lg:col-span-5 lg:grid-rows-[1.4fr_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={heroImage(site)} alt="" className="h-full min-h-[240px] w-full rounded-[28px] object-cover" />
            <div className="grid grid-cols-2 gap-3">
              {site.stats.slice(0, 2).map((s, i) => (
                <div key={i} className="flex flex-col justify-between rounded-[28px] p-6" style={{ background: i === 0 ? a : "#fff", color: i === 0 ? "#fff" : INK }}>
                  <p className={`${GROT} text-[44px] font-bold leading-none tracking-[-0.04em]`}>{s.value}</p>
                  <p className="mt-6 text-[14px] opacity-75">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {site.stats.length > 2 && (
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {site.stats.slice(2, 6).map((s, i) => (
              <div key={i} className={tile}><p className={`${GROT} text-[40px] font-bold leading-none tracking-[-0.04em]`}>{s.value}</p><p className="mt-4 text-[14px]" style={{ color: MUTED }}>{s.label}</p></div>
            ))}
          </section>
        )}

        {on(site, "about") && (
          <section id="about" className="grid gap-3 lg:grid-cols-12">
            <div className={`${tile} lg:col-span-7 lg:p-10`}>
              <Tag>About</Tag>
              <h2 className={`${GROT} mt-5 text-[38px] font-bold leading-[1] tracking-[-0.035em] lg:text-[48px]`}>{site.about.title}</h2>
              <div className="mt-6 space-y-4 text-[16.5px] leading-relaxed" style={{ color: MUTED }}><Paragraphs text={site.about.body} /></div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={aboutImage(site)} alt="" className="h-full min-h-[300px] w-full rounded-[28px] object-cover lg:col-span-5" />
          </section>
        )}

        {on(site, "programs") && <ProgramsBlock data={data} skin={skin} />}

        {on(site, "values") && site.values.length > 0 && (
          <section id="values" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <h2 className="sr-only">{highlightsTitle(data)}</h2>
            {site.values.map((v, i) => (
              <div key={i} className="flex min-h-[220px] flex-col justify-between rounded-[28px] p-7" style={{ background: i % 4 === 1 ? INK : i % 4 === 2 ? `${a}1f` : "#fff", color: i % 4 === 1 ? "#fff" : INK }}>
                <span className={`${GROT} text-[15px] font-semibold opacity-50`}>0{i + 1}</span>
                <div><h3 className={`${GROT} text-[26px] font-bold tracking-[-0.03em]`}>{v.title}</h3><p className="mt-2 text-[15px] leading-relaxed opacity-70">{v.body}</p></div>
              </div>
            ))}
          </section>
        )}

        {on(site, "life") && (
          <section id="life" className="grid gap-3 lg:grid-cols-12">
            <div className={`${tile} lg:col-span-5 lg:p-10`}>
              <Tag>Campus life</Tag>
              <h2 className={`${GROT} mt-5 text-[38px] font-bold leading-none tracking-[-0.035em]`}>{site.life.title}</h2>
              <p className="mt-4 text-[16px] leading-relaxed" style={{ color: MUTED }}>{site.life.body}</p>
              <div className="mt-7 flex flex-wrap gap-2">
                {site.life.perks.map((p, i) => <span key={p} className="rounded-full px-3.5 py-1.5 text-[14px]" style={{ background: i % 3 === 0 ? `${a}1f` : BG }}>{p}</span>)}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 lg:col-span-7">
              {lifeImages(site).slice(0, 3).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className={`h-full min-h-[180px] w-full rounded-[28px] object-cover ${i === 0 ? "row-span-2" : ""}`} />
              ))}
            </div>
          </section>
        )}

        {on(site, "leaders") && site.leaders.length > 0 && (
          <section id="leaders" className={`${tile} lg:p-10`}>
            <Tag>Leadership</Tag>
            <div className="mt-8 flex snap-x gap-3 overflow-x-auto pb-2">
              {site.leaders.map((l, i) => (
                <div key={i} className="w-[240px] shrink-0 snap-start rounded-[22px] p-3" style={{ background: BG }}>
                  {l.photo_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={l.photo_url} alt={l.name} className="aspect-square w-full rounded-[18px] object-cover" />
                    : <div className={`${GROT} flex aspect-square w-full items-center justify-center rounded-[18px] text-[54px] font-bold text-white`} style={{ background: i % 2 ? INK : a }}>{initials(l.name)}</div>}
                  <p className={`${GROT} mt-3 px-1 text-[18px] font-semibold tracking-tight`}>{l.name}</p>
                  <p className="px-1 pb-1 text-[13.5px]" style={{ color: MUTED }}>{l.role}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {on(site, "notices") && <NoticesBlock data={data} skin={{ ...skin, cardBg: BG }} />}

        {showsAdmissions(site) && (
          <AdmissionsBlock data={data} skin={skin} className="rounded-[28px] p-8 text-white lg:p-12" style={{ background: `linear-gradient(135deg, ${a}, ${INK} 150%)` }} />
        )}

        {on(site, "jobs") && (
          <section id="careers" className="rounded-[28px] p-7 text-white lg:p-10" style={{ background: INK }}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <h2 className={`${GROT} text-[44px] font-bold leading-none tracking-[-0.04em] lg:text-[60px]`}>{jobs.length ? <>Join our staff<span style={{ color: a }}>.</span></> : "No vacancies right now."}</h2>
              <Link href="/careers" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-[14px] hover:bg-white/20">All vacancies <ArrowUpRight size={15} strokeWidth={1.6} /></Link>
            </div>
            <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {jobs.map((j) => (
                <Link key={j.uuid} href={`/careers/${j.slug}`} className="group flex min-h-[150px] flex-col justify-between rounded-[22px] bg-white/[0.06] p-6 transition-colors hover:bg-white/[0.12]">
                  <div className="flex items-start justify-between gap-3"><p className={`${GROT} text-[21px] font-semibold leading-tight tracking-tight`}>{j.title}</p><ArrowUpRight size={20} strokeWidth={1.5} className="shrink-0 opacity-50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" /></div>
                  <p className="mt-6 text-[13.5px] text-white/60">{jobMeta(j)}</p>
                </Link>
              ))}
              {!jobs.length && <p className="text-[16px] text-white/60">Please check back soon.</p>}
            </div>
          </section>
        )}

        {(on(site, "contact") || on(site, "offices")) && (
          <section id="contact" className="grid gap-3 lg:grid-cols-12">
            {on(site, "contact") && (
              <div className="rounded-[28px] p-8 text-white lg:col-span-5 lg:p-10" style={{ background: a }}>
                <h2 className={`${GROT} text-[42px] font-bold leading-none tracking-[-0.04em]`}>Say hi.</h2>
                <div className="mt-8 space-y-3.5 text-[16px] text-white/90">
                  {site.contact.email && <a href={`mailto:${site.contact.email}`} className="flex items-center gap-3"><Mail size={18} strokeWidth={1.5} />{site.contact.email}</a>}
                  {site.contact.phone && <a href={`tel:${site.contact.phone}`} className="flex items-center gap-3"><Phone size={18} strokeWidth={1.5} />{site.contact.phone}</a>}
                  {site.contact.address && <p className="flex items-start gap-3"><MapPin size={18} strokeWidth={1.5} className="mt-0.5 shrink-0" />{site.contact.address}</p>}
                </div>
                <Socials s={site.social} className="mt-8" />
              </div>
            )}
            {on(site, "offices") && site.offices.some((o) => o.city) && (
              <div className="grid content-start gap-3 sm:grid-cols-2 lg:col-span-7">
                {site.offices.filter((o) => o.city).map((o, i) => (
                  <div key={i} className={tile}>
                    <p className="text-[13px]" style={{ color: MUTED }}>{o.head_office ? "Main campus" : "Campus"}</p>
                    <p className={`${GROT} mt-1 text-[26px] font-bold tracking-[-0.03em]`}>{o.city}</p>
                    {o.address && <p className="mt-2 text-[14px] leading-relaxed" style={{ color: MUTED }}>{o.address}</p>}
                    {o.phone && <p className="mt-1 text-[14px]" style={{ color: MUTED }}>{o.phone}</p>}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <footer className="flex flex-col gap-3 rounded-[28px] bg-white px-7 py-6 text-[13.5px] sm:flex-row sm:items-center sm:justify-between" style={{ color: MUTED }}>
          <p>© {year()} {company.name}</p>
          <div className="flex gap-6">{on(site, "jobs") && <Link href="/careers" className="hover:text-[#0b0d12]">Careers</Link>}<Link href="/login" className="hover:text-[#0b0d12]">{SIGN_IN_LABEL}</Link></div>
        </footer>
      </main>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="inline-block rounded-full bg-[#eceef1] px-3 py-1 text-[13px]">{children}</span>;
}
