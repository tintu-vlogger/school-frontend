"use client";

/* Modern: bright and friendly. Split hero with floating cards, soft rounded sections, job cards. */
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Briefcase, Check, Mail, MapPin, Phone, Sparkles } from "lucide-react";
import {
  Logo, Paragraphs, SignIn, Socials, aboutImage, heroImage, initials, jobMeta, lifeImages, navLinks, on, useScrolled, year,
  type ThemeProps,
} from "./shared";

export default function Modern({ data, signedIn }: ThemeProps) {
  const { company, site, jobs } = data;
  const a = site.accent;
  const scrolled = useScrolled();
  const links = navLinks(data);
  const soft = `${a}14`;

  return (
    <div className="min-h-screen bg-[#f6f7f9] font-[family-name:var(--font-outfit)] font-light text-[#14171f] antialiased">
      <header className={`sticky top-0 z-40 transition-[background,box-shadow] ${scrolled ? "bg-white/85 shadow-[0_1px_0_#e7e9ee] backdrop-blur-md" : ""}`}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <a href="#top" className="flex items-center gap-2.5"><Logo company={company} accent={a} size={34} /><span className="text-[16.5px]">{company.name}</span></a>
          <nav className="hidden items-center gap-1 text-[14px] text-[#5b6170] md:flex">
            {links.map((l) => <a key={l.href} href={l.href} className="rounded-full px-3.5 py-2 transition-colors hover:bg-white hover:text-[#14171f]">{l.label}</a>)}
          </nav>
          {site.show_signin && <SignIn signedIn={signedIn} className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13.5px] text-white transition-opacity hover:opacity-90" style={{ background: a }} />}
        </div>
      </header>

      <section id="top" className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 lg:grid-cols-2 lg:pt-16">
        <div>
          {site.hero.eyebrow && <span className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-[13px] text-[#5b6170] shadow-[0_1px_2px_rgba(0,0,0,0.05)]"><Sparkles size={14} strokeWidth={1.5} style={{ color: a }} />{site.hero.eyebrow}</span>}
          <h1 className="mt-6 text-[42px] font-light leading-[1.08] tracking-[-0.02em] sm:text-[56px]">{site.hero.headline}</h1>
          <p className="mt-6 max-w-lg text-[17.5px] leading-relaxed text-[#5b6170]">{site.hero.subline}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            {on(site, "jobs") && <a href="#careers" className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[15px] text-white shadow-[0_8px_24px_-8px] transition-transform hover:-translate-y-0.5" style={{ background: a, boxShadow: `0 10px 24px -10px ${a}` }}>View open roles <ArrowRight size={16} strokeWidth={1.6} /></a>}
            {on(site, "about") && <a href="#about" className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:shadow-md">About us</a>}
          </div>
        </div>
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={heroImage(site)} alt="" className="aspect-[4/3.4] w-full rounded-[28px] object-cover" />
          {site.stats[0] && (
            <div className="absolute -left-4 bottom-8 rounded-2xl bg-white px-5 py-4 shadow-[0_18px_40px_-18px_rgba(20,23,31,0.35)] sm:-left-8">
              <p className="text-[30px] font-light leading-none" style={{ color: a }}>{site.stats[0].value}</p>
              <p className="mt-1.5 text-[13px] text-[#5b6170]">{site.stats[0].label}</p>
            </div>
          )}
          {on(site, "jobs") && (
            <div className="absolute -right-3 top-8 flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-[0_18px_40px_-18px_rgba(20,23,31,0.35)] sm:-right-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: soft, color: a }}><Briefcase size={17} strokeWidth={1.5} /></span>
              <div><p className="text-[15px]">{jobs.length} open role{jobs.length === 1 ? "" : "s"}</p><p className="text-[12.5px] text-[#8a90a0]">We&apos;re hiring</p></div>
            </div>
          )}
        </div>
      </section>

      {site.stats.length > 1 && (
        <section className="mx-auto max-w-6xl px-5">
          <div className="grid grid-cols-2 gap-3 rounded-[28px] bg-white p-3 lg:grid-cols-4">
            {site.stats.slice(0, 4).map((s, i) => (
              <div key={i} className="rounded-2xl px-6 py-7" style={{ background: i === 0 ? soft : "#f8f9fb" }}>
                <p className="text-[34px] font-light leading-none tracking-tight">{s.value}</p>
                <p className="mt-2 text-[14px] text-[#5b6170]">{s.label}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {on(site, "about") && (
        <section id="about" className="mx-auto grid max-w-6xl items-center gap-14 px-5 py-24 lg:grid-cols-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={aboutImage(site)} alt="" className="aspect-[5/4] w-full rounded-[28px] object-cover" />
          <div>
            <Eyebrow a={a}>About us</Eyebrow>
            <h2 className="mt-3 text-[36px] font-light leading-tight tracking-tight">{site.about.title}</h2>
            <div className="mt-5 space-y-4 text-[16.5px] leading-relaxed text-[#5b6170]"><Paragraphs text={site.about.body} /></div>
          </div>
        </section>
      )}

      {on(site, "values") && site.values.length > 0 && (
        <section id="values" className="bg-white py-24">
          <div className="mx-auto max-w-6xl px-5">
            <div className="max-w-xl"><Eyebrow a={a}>Our values</Eyebrow><h2 className="mt-3 text-[36px] font-light tracking-tight">How we work together</h2></div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {site.values.map((v, i) => (
                <div key={i} className="rounded-3xl border border-[#eceef2] p-7 transition-[border-color,transform] hover:-translate-y-1 hover:border-transparent hover:shadow-[0_20px_40px_-24px_rgba(20,23,31,0.3)]">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-[16px]" style={{ background: soft, color: a }}>{i + 1}</span>
                  <h3 className="mt-6 text-[20px]">{v.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#5b6170]">{v.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {on(site, "life") && (
        <section id="life" className="mx-auto max-w-6xl px-5 py-24">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr]">
            <div>
              <Eyebrow a={a}>Life here</Eyebrow>
              <h2 className="mt-3 text-[36px] font-light leading-tight tracking-tight">{site.life.title}</h2>
              <p className="mt-4 text-[16.5px] leading-relaxed text-[#5b6170]">{site.life.body}</p>
              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {site.life.perks.map((p) => (
                  <li key={p} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-[15px]"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: soft, color: a }}><Check size={14} strokeWidth={2} /></span>{p}</li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {lifeImages(site).slice(0, 3).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className={`w-full rounded-3xl object-cover ${i === 0 ? "col-span-2 aspect-[16/9]" : "aspect-square"}`} />
              ))}
            </div>
          </div>
        </section>
      )}

      {on(site, "leaders") && site.leaders.length > 0 && (
        <section id="leaders" className="bg-white py-24">
          <div className="mx-auto max-w-6xl px-5">
            <Eyebrow a={a}>Leadership</Eyebrow><h2 className="mt-3 text-[36px] font-light tracking-tight">The people leading the way</h2>
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {site.leaders.map((l, i) => (
                <div key={i} className="rounded-3xl bg-[#f6f7f9] p-5">
                  {l.photo_url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={l.photo_url} alt={l.name} className="aspect-square w-full rounded-2xl object-cover" />
                    : <div className="flex aspect-square w-full items-center justify-center rounded-2xl text-[40px] font-light" style={{ background: soft, color: a }}>{initials(l.name)}</div>}
                  <p className="mt-4 text-[17px]">{l.name}</p>
                  <p className="text-[14px]" style={{ color: a }}>{l.role}</p>
                  {l.bio && <p className="mt-2 text-[14px] leading-relaxed text-[#5b6170]">{l.bio}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {on(site, "jobs") && (
        <section id="careers" className="mx-auto max-w-6xl px-5 py-24">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><Eyebrow a={a}>Careers</Eyebrow><h2 className="mt-3 text-[36px] font-light tracking-tight">{jobs.length ? "Open roles" : "No openings right now"}</h2></div>
            <Link href="/careers" className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[14px] hover:shadow-md">See all <ArrowUpRight size={15} strokeWidth={1.5} /></Link>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {jobs.map((j) => (
              <Link key={j.uuid} href={`/careers/${j.slug}`} className="group flex items-start justify-between gap-4 rounded-3xl bg-white p-6 transition-shadow hover:shadow-[0_20px_40px_-24px_rgba(20,23,31,0.35)]">
                <div className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ background: soft, color: a }}><Briefcase size={18} strokeWidth={1.4} /></span>
                  <div><p className="text-[18px]">{j.title}</p><p className="mt-1 text-[14px] text-[#5b6170]">{jobMeta(j)}</p></div>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f6f7f9] transition-colors group-hover:text-white" style={{}}><ArrowUpRight size={16} strokeWidth={1.5} /></span>
              </Link>
            ))}
            {!jobs.length && <p className="rounded-3xl bg-white p-8 text-[15.5px] text-[#5b6170] md:col-span-2">We are not hiring right now. Follow us to hear when new roles open.</p>}
          </div>
        </section>
      )}

      {(on(site, "contact") || on(site, "offices")) && (
        <section id="contact" className="mx-auto max-w-6xl px-5 pb-24">
          <div className="grid gap-4 overflow-hidden rounded-[32px] p-8 text-white lg:grid-cols-2 lg:p-12" style={{ background: `linear-gradient(135deg, ${a}, #14171f 140%)` }}>
            {on(site, "contact") && (
              <div>
                <h2 className="text-[34px] font-light leading-tight">Get in touch</h2>
                <div className="mt-8 space-y-4 text-[16px] text-white/85">
                  {site.contact.email && <a href={`mailto:${site.contact.email}`} className="flex items-center gap-3"><Mail size={18} strokeWidth={1.4} />{site.contact.email}</a>}
                  {site.contact.phone && <a href={`tel:${site.contact.phone}`} className="flex items-center gap-3"><Phone size={18} strokeWidth={1.4} />{site.contact.phone}</a>}
                  {site.contact.address && <p className="flex items-start gap-3"><MapPin size={18} strokeWidth={1.4} className="mt-0.5 shrink-0" />{site.contact.address}</p>}
                </div>
                <Socials s={site.social} className="mt-8" />
              </div>
            )}
            {on(site, "offices") && site.offices.some((o) => o.city) && (
              <div className="grid content-start gap-3 sm:grid-cols-2">
                {site.offices.filter((o) => o.city).map((o, i) => (
                  <div key={i} className="rounded-2xl bg-white/10 p-5 backdrop-blur">
                    <p className="text-[12.5px] text-white/60">{o.head_office ? "Head office" : "Office"}</p>
                    <p className="mt-1 text-[19px]">{o.city}</p>
                    {o.address && <p className="mt-2 text-[13.5px] leading-relaxed text-white/75">{o.address}</p>}
                    {o.phone && <p className="mt-1 text-[13.5px] text-white/75">{o.phone}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <footer className="border-t border-[#e7e9ee] bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 text-[13.5px] text-[#8a90a0] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5"><Logo company={company} accent={a} size={26} /><span>© {year()} {company.name}</span></div>
          <div className="flex gap-6">{on(site, "jobs") && <Link href="/careers" className="hover:text-[#14171f]">Careers</Link>}<Link href="/login" className="hover:text-[#14171f]">Employee sign in</Link></div>
        </div>
      </footer>
    </div>
  );
}

function Eyebrow({ a, children }: { a: string; children: React.ReactNode }) {
  return <p className="text-[13.5px]" style={{ color: a }}>{children}</p>;
}
