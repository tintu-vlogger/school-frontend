"use client";

/* Serene: warm cream paper, elegant serif type and arch-shaped photos. Calm and human. */
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import {
  AdmissionsBlock, Logo, NoticesBlock, Paragraphs, ProgramsBlock, SIGN_IN_LABEL, SignIn, Socials, aboutImage, admissionHref,
  admissionLabel, heroImage, highlightsTitle, initials, jobMeta, lifeImages, navLinks, on, showsAdmissions, useScrolled, word, year,
  type Skin, type ThemeProps,
} from "./shared";

const INK = "#2a241d", MUTED = "#6f6457", PAPER = "#f6f0e7", CARD = "#fbf7f1", LINE = "#e6dccd";
const SERIF = "font-[family-name:var(--font-serif)] font-normal";

export default function Serene({ data, signedIn }: ThemeProps) {
  const { company, site, jobs } = data;
  const a = site.accent;
  const scrolled = useScrolled();
  const links = navLinks(data);
  const [first, ...rest] = site.hero.headline.split(/(?<=[,.;:])\s+/);
  const skin: Skin = {
    tone: "light", accent: a, muted: MUTED, line: LINE,
    heading: `${SERIF} mt-4 text-[46px] leading-[1.05]`,
    card: "rounded-[24px] border p-6 border-[#e6dccd]", cardBg: CARD,
    wrap: "mx-auto max-w-6xl px-5 py-28",
    label: (c) => <Kicker>{c}</Kicker>,
  };

  return (
    <div className="min-h-screen font-[family-name:var(--font-outfit)] font-light antialiased" style={{ background: PAPER, color: INK }}>
      <header className={`sticky top-0 z-40 transition-colors ${scrolled ? "backdrop-blur-md" : ""}`} style={{ background: scrolled ? `${PAPER}e6` : "transparent" }}>
        <div className="mx-auto flex h-[70px] max-w-6xl items-center justify-between px-5">
          <a href="#top" className="flex items-center gap-3"><Logo company={company} accent={a} size={34} /><span className={`${SERIF} text-[22px]`}>{company.name}</span></a>
          <nav className="hidden items-center gap-7 text-[14.5px] md:flex" style={{ color: MUTED }}>
            {links.map((l) => <a key={l.href} href={l.href} className="transition-colors hover:text-[#2a241d]">{l.label}</a>)}
          </nav>
          {site.show_signin && <SignIn signedIn={signedIn} className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[13.5px] transition-colors hover:bg-[#2a241d] hover:text-[#f6f0e7]" style={{ borderColor: INK }} />}
        </div>
      </header>

      <section id="top" className="mx-auto max-w-6xl px-5 pb-24 pt-14 text-center">
        {site.hero.eyebrow && <p className="text-[13px] uppercase tracking-[0.28em]" style={{ color: MUTED }}>{site.hero.eyebrow}</p>}
        <h1 className={`${SERIF} mx-auto mt-6 max-w-4xl text-[52px] leading-[1.02] sm:text-[76px] lg:text-[96px]`}>
          {first}{rest.length > 0 && <><br /><em className="italic" style={{ color: a }}>{rest.join(" ")}</em></>}
        </h1>
        <p className="mx-auto mt-8 max-w-xl text-[18px] leading-relaxed" style={{ color: MUTED }}>{site.hero.subline}</p>
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          {showsAdmissions(site) && <a href={admissionHref(data)} className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15px] text-[#f6f0e7] transition-transform hover:-translate-y-0.5" style={{ background: INK }}>{admissionLabel(data)} <ArrowRight size={16} strokeWidth={1.5} /></a>}
          {on(site, "programs") ? <a href="#programs" className="inline-flex items-center rounded-full border px-7 py-3.5 text-[15px]" style={{ borderColor: LINE }}>Explore {word(data, "programs").toLowerCase()}</a>
            : on(site, "about") && <a href="#about" className="inline-flex items-center rounded-full border px-7 py-3.5 text-[15px]" style={{ borderColor: LINE }}>Our story</a>}
        </div>
        <div className="relative mx-auto mt-16 grid max-w-5xl grid-cols-3 items-end gap-4 sm:gap-6">
          {[lifeImages(site)[0], heroImage(site), lifeImages(site)[1] ?? aboutImage(site)].map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" className={`w-full rounded-t-full rounded-b-[28px] object-cover ${i === 1 ? "aspect-[3/4.2]" : "aspect-[3/3.6]"}`} />
          ))}
        </div>
      </section>

      {site.stats.length > 0 && (
        <section className="border-y" style={{ borderColor: LINE }}>
          <div className="mx-auto grid max-w-6xl grid-cols-2 px-5 text-center lg:grid-cols-4">
            {site.stats.slice(0, 4).map((s, i) => (
              <div key={i} className="py-12">
                <p className={`${SERIF} text-[54px] leading-none`}>{s.value}</p>
                <p className="mt-3 text-[13px] uppercase tracking-[0.2em]" style={{ color: MUTED }}>{s.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {on(site, "about") && (
        <section id="about" className="mx-auto grid max-w-6xl items-center gap-16 px-5 py-28 lg:grid-cols-2">
          <div>
            <Kicker>Our story</Kicker>
            <h2 className={`${SERIF} mt-4 text-[48px] leading-[1.05]`}>{site.about.title}</h2>
            <div className="mt-6 space-y-5 text-[17px] leading-[1.85]" style={{ color: MUTED }}><Paragraphs text={site.about.body} /></div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={aboutImage(site)} alt="" className="aspect-[4/5] w-full rounded-t-full rounded-b-[36px] object-cover" />
        </section>
      )}

      {on(site, "programs") && <div className="border-t" style={{ borderColor: LINE }}><ProgramsBlock data={data} skin={skin} /></div>}

      {on(site, "values") && site.values.length > 0 && (
        <section id="values" style={{ background: CARD }}>
          <div className="mx-auto max-w-6xl px-5 py-28">
            <div className="text-center"><Kicker>Why us</Kicker><h2 className={`${SERIF} mt-4 text-[48px]`}>{highlightsTitle(data)}</h2></div>
            <div className="mt-16 grid gap-x-12 gap-y-14 sm:grid-cols-2">
              {site.values.map((v, i) => (
                <div key={i} className="flex gap-6">
                  <span className={`${SERIF} text-[44px] italic leading-none`} style={{ color: a }}>{["i", "ii", "iii", "iv", "v", "vi", "vii", "viii"][i]}</span>
                  <div className="border-t pt-4" style={{ borderColor: LINE }}>
                    <h3 className={`${SERIF} text-[28px]`}>{v.title}</h3>
                    <p className="mt-2 text-[16px] leading-relaxed" style={{ color: MUTED }}>{v.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {on(site, "life") && (
        <section id="life" className="mx-auto max-w-6xl px-5 py-28">
          <div className="grid gap-14 lg:grid-cols-[1.1fr_1fr]">
            <div className="grid grid-cols-2 gap-5">
              {lifeImages(site).slice(0, 2).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className={`aspect-[3/4] w-full rounded-[28px] object-cover ${i ? "mt-14" : ""}`} />
              ))}
            </div>
            <div className="self-center">
              <Kicker>Campus life</Kicker>
              <h2 className={`${SERIF} mt-4 text-[46px] leading-[1.05]`}>{site.life.title}</h2>
              <p className="mt-5 text-[17px] leading-relaxed" style={{ color: MUTED }}>{site.life.body}</p>
              <div className="mt-8 flex flex-wrap gap-2.5">
                {site.life.perks.map((p) => <span key={p} className="rounded-full border px-4 py-2 text-[14.5px]" style={{ borderColor: LINE, background: CARD }}>{p}</span>)}
              </div>
            </div>
          </div>
        </section>
      )}

      {on(site, "leaders") && site.leaders.length > 0 && (
        <section id="leaders" style={{ background: CARD }}>
          <div className="mx-auto max-w-6xl px-5 py-28">
            <div className="text-center"><Kicker>Leadership</Kicker><h2 className={`${SERIF} mt-4 text-[48px]`}>The people behind it</h2></div>
            <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
              {site.leaders.map((l, i) => (
                <div key={i} className="text-center">
                  {l.photo_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={l.photo_url} alt={l.name} className="mx-auto aspect-[3/4] w-full rounded-t-full rounded-b-[24px] object-cover" />
                    : <div className={`${SERIF} mx-auto flex aspect-[3/4] w-full items-center justify-center rounded-t-full rounded-b-[24px] text-[52px] italic`} style={{ background: PAPER, color: a }}>{initials(l.name)}</div>}
                  <p className={`${SERIF} mt-5 text-[24px]`}>{l.name}</p>
                  <p className="text-[14px]" style={{ color: MUTED }}>{l.role}</p>
                  {l.bio && <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: MUTED }}>{l.bio}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {on(site, "notices") && <NoticesBlock data={data} skin={skin} />}

      {showsAdmissions(site) && (
        <div className="mx-auto max-w-6xl px-5 pb-24">
          <AdmissionsBlock data={data} skin={skin} className="rounded-t-[120px] rounded-b-[36px] px-8 pb-12 pt-16 text-[#f6f0e7] lg:px-14" style={{ background: `linear-gradient(160deg, ${a}, ${INK} 130%)` }} />
        </div>
      )}

      {on(site, "jobs") && (
        <section id="careers" className="mx-auto max-w-4xl px-5 py-28">
          <div className="text-center"><Kicker>Careers</Kicker><h2 className={`${SERIF} mt-4 text-[48px]`}>{jobs.length ? <>Come <em className="italic" style={{ color: a }}>teach</em> with us</> : "No vacancies right now"}</h2></div>
          <div className="mt-12 border-t" style={{ borderColor: LINE }}>
            {jobs.map((j) => (
              <Link key={j.uuid} href={`/careers/${j.slug}`} className="group flex items-center justify-between gap-6 border-b py-7" style={{ borderColor: LINE }}>
                <div><p className={`${SERIF} text-[28px] transition-colors`}>{j.title}</p><p className="mt-1 text-[14.5px]" style={{ color: MUTED }}>{jobMeta(j)}</p></div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors group-hover:bg-[#2a241d] group-hover:text-[#f6f0e7]" style={{ borderColor: LINE }}><ArrowUpRight size={18} strokeWidth={1.3} /></span>
              </Link>
            ))}
            {!jobs.length && <p className="py-10 text-center text-[16px]" style={{ color: MUTED }}>There are no staff vacancies at the moment. Please check back soon.</p>}
          </div>
          {jobs.length > 0 && <p className="mt-8 text-center"><Link href="/careers" className="text-[15px] underline decoration-[#e6dccd] underline-offset-4 hover:decoration-current">All vacancies</Link></p>}
        </section>
      )}

      {(on(site, "contact") || on(site, "offices")) && (
        <section id="contact" className="text-[#f6f0e7]" style={{ background: INK }}>
          <div className="mx-auto grid max-w-6xl gap-14 px-5 py-24 lg:grid-cols-2">
            {on(site, "contact") && (
              <div>
                <h2 className={`${SERIF} text-[52px] leading-none`}>Say <em className="italic">hello.</em></h2>
                <div className="mt-10 space-y-4 text-[17px] text-[#f6f0e7]/80">
                  {site.contact.email && <a href={`mailto:${site.contact.email}`} className="flex items-center gap-3 hover:text-white"><Mail size={18} strokeWidth={1.3} />{site.contact.email}</a>}
                  {site.contact.phone && <a href={`tel:${site.contact.phone}`} className="flex items-center gap-3 hover:text-white"><Phone size={18} strokeWidth={1.3} />{site.contact.phone}</a>}
                  {site.contact.address && <p className="flex items-start gap-3"><MapPin size={18} strokeWidth={1.3} className="mt-1 shrink-0" />{site.contact.address}</p>}
                </div>
                <Socials s={site.social} className="mt-8" />
              </div>
            )}
            {on(site, "offices") && site.offices.some((o) => o.city) && (
              <div className="grid content-start gap-8 sm:grid-cols-2">
                {site.offices.filter((o) => o.city).map((o, i) => (
                  <div key={i} className="border-t border-[#f6f0e7]/20 pt-5">
                    <p className="text-[12px] uppercase tracking-[0.22em] text-[#f6f0e7]/50">{o.head_office ? "Main campus" : "Campus"}</p>
                    <p className={`${SERIF} mt-2 text-[30px]`}>{o.city}</p>
                    {o.address && <p className="mt-2 text-[14.5px] leading-relaxed text-[#f6f0e7]/70">{o.address}</p>}
                    {o.phone && <p className="mt-1 text-[14.5px] text-[#f6f0e7]/70">{o.phone}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-[#f6f0e7]/10">
            <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 text-[13.5px] text-[#f6f0e7]/50 sm:flex-row sm:justify-between">
              <p>© {year()} {company.name}</p>
              <div className="flex gap-6">{on(site, "jobs") && <Link href="/careers" className="hover:text-white">Careers</Link>}<Link href="/login" className="hover:text-white">{SIGN_IN_LABEL}</Link></div>
            </div>
          </div>
        </section>
      )}
      {!(on(site, "contact") || on(site, "offices")) && (
        <footer className="border-t py-8 text-center text-[13.5px]" style={{ borderColor: LINE, color: MUTED }}>© {year()} {company.name} · <Link href="/login">{SIGN_IN_LABEL}</Link></footer>
      )}
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] uppercase tracking-[0.28em]" style={{ color: MUTED }}>{children}</p>;
}
