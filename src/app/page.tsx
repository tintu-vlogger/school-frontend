"use client";

/*
 * Main website (campusly.app): what the product does, Indian compliance, pricing and sign-up.
 * Company addresses (<slug>.campusly.app) never reach this page; they show the company's own site.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Outfit } from "next/font/google";
import { motion } from "framer-motion";
import {
  ArrowRight, BadgeIndianRupee, BarChart3, BookOpen, Briefcase, CalendarCheck2, Check, ChevronDown, Clock3, FileCheck2,
  FileText, Fingerprint, Globe2, GraduationCap, HeartHandshake, Languages, LifeBuoy, Lock, Menu, MessageSquareText,
  ScrollText, ShieldCheck, Sparkles, Target, UserPlus, Users, Workflow, X,
} from "lucide-react";
import { API_BASE } from "@/lib/api";
import { TalkingAvatar } from "@/components/talking-avatar";

const outfit = Outfit({ subsets: ["latin"], weight: ["200", "300", "400", "500"], variable: "--font-outfit" });

/** The talking avatar was an experiment on the website; switch on again when it is ready. */
const SHOW_AVATAR = false;

const P = "#4f46e5"; // brand indigo
const S = 1.4; // icon stroke

const INTRO =
  "Hello, and welcome to Campusly. We help Indian companies run HR and payroll in one simple place. " +
  "Leave, attendance, payroll with P F, E S I, professional tax and T D S, hiring, onboarding, performance and exits all work together. " +
  "Every request follows your own approval flow, and every change is recorded. " +
  "Your company also gets its own website and careers page. Start your free trial today, no card needed.";

const NAV = [
  { href: "#product", label: "Product" },
  { href: "#payroll", label: "Payroll" },
  { href: "#compliance", label: "Compliance" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

const MODULES = [
  { icon: Users, title: "People", body: "Employee records, org chart, documents and custom fields." },
  { icon: CalendarCheck2, title: "Leave & holidays", body: "Any leave type, accruals, carry forward, comp off and holiday lists by location." },
  { icon: Clock3, title: "Attendance & shifts", body: "Web, mobile, kiosk and biometric clock-in, shifts, rosters and overtime." },
  { icon: BadgeIndianRupee, title: "Payroll", body: "Salary structures, arrears, loans, reimbursements, payslips and bank files." },
  { icon: Briefcase, title: "Hiring", body: "Requisitions, careers page, pipeline, interviews, offers and e-sign." },
  { icon: UserPlus, title: "Onboarding & exits", body: "Pre-joining portal, probation, clearances and full and final settlement." },
  { icon: Target, title: "Performance", body: "Goals and OKRs, reviews, calibration, nine-box, 1:1s and pay reviews." },
  { icon: GraduationCap, title: "Learning", body: "Courses, mandatory training like POSH, quizzes and certificates." },
  { icon: HeartHandshake, title: "Buzz & engagement", body: "Company feed, kudos, birthdays, announcements and surveys." },
  { icon: LifeBuoy, title: "Help desk & POSH", body: "Employee tickets, grievances and a confidential POSH process." },
  { icon: FileText, title: "Letters & documents", body: "Templates, numbered letters, e-sign and an employee document locker." },
  { icon: BarChart3, title: "Reports & assistant", body: "Ready reports, dashboards and questions answered in plain words." },
];

const LAWS = [
  "EPF, EPS & EDLI", "ESI", "Professional tax · 21 states", "Labour welfare fund · 16 states", "TDS · old & new regime",
  "Form 16 & 24Q", "Gratuity", "Bonus Act", "Minimum wages", "50% wage rule", "Maternity benefit", "DPDP Act consent",
];

const FAQ = [
  { q: "Is it only for Indian companies?", a: "Yes. Everything from payroll to leave rules is built for Indian law, Indian states and the Indian financial year." },
  { q: "Can we change rules without a developer?", a: "Yes. Leave types, salary components, approval flows, number formats, custom fields and lists are all settings. Rules that change over time keep their history with effective dates." },
  { q: "Is our data kept separate from other companies?", a: "Yes. Every company's data is separated at the database level, every change is recorded in an audit trail, and nothing is ever hard-deleted." },
  { q: "Do employees need to install anything?", a: "No. It works in any browser on phone or computer. Employees sign in from your company's own web address." },
  { q: "Do we get our own website?", a: "Yes. Your company address opens your own organisation website with your values, life at work, leadership, offices and open jobs, in one of four designs you choose." },
  { q: "How long is the free trial?", a: "The trial length is shown in the pricing section above. No card is needed to start." },
];

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] uppercase tracking-[0.2em]" style={{ color: P }}>{children}</p>;
}

export default function Home() {
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const f = () => setScrolled(window.scrollY > 16);
    f(); window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);

  return (
    <div className={`${outfit.variable} min-h-screen bg-[#fbfbfd] font-[family-name:var(--font-outfit)] font-light text-[#14171f] antialiased`}>
      {/* ── Header ─────────────────────────── */}
      <header className={`fixed inset-x-0 top-0 z-40 transition-[background,box-shadow] ${scrolled ? "bg-white/85 shadow-[0_1px_0_#ebedf2] backdrop-blur-md" : ""}`}>
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-small.svg" alt="" className="h-9 w-9" />
            <span className="text-[17px] tracking-tight">Next Gen <span className="text-[#8a90a0]">HRMS</span></span>
          </Link>
          <nav className="hidden items-center gap-1 text-[14.5px] text-[#5b6170] md:flex">
            {NAV.map((n) => <a key={n.href} href={n.href} className="rounded-full px-3.5 py-2 transition-colors hover:bg-[#f1f2f6] hover:text-[#14171f]">{n.label}</a>)}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Link href="/login" className="rounded-full px-4 py-2 text-[14.5px] text-[#14171f] hover:bg-[#f1f2f6]">Sign in</Link>
            <Link href="/register" className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[14.5px] text-white transition-opacity hover:opacity-90" style={{ background: P }}>Start free trial</Link>
          </div>
          <button type="button" onClick={() => setMenu(!menu)} className="flex h-10 w-10 items-center justify-center rounded-full md:hidden" aria-label="Menu">
            {menu ? <X size={20} strokeWidth={S} /> : <Menu size={20} strokeWidth={S} />}
          </button>
        </div>
        {menu && (
          <div className="border-t border-[#ebedf2] bg-white px-5 pb-5 pt-2 md:hidden">
            {NAV.map((n) => <a key={n.href} href={n.href} onClick={() => setMenu(false)} className="block py-3 text-[16px]">{n.label}</a>)}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link href="/login" className="rounded-full border border-[#e3e5ea] py-2.5 text-center text-[15px]">Sign in</Link>
              <Link href="/register" className="rounded-full py-2.5 text-center text-[15px] text-white" style={{ background: P }}>Free trial</Link>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ───────────────────────────── */}
      <section className="relative overflow-hidden pt-[68px]">
        <div className="pointer-events-none absolute inset-0 -z-0 bg-[radial-gradient(60%_50%_at_70%_10%,rgba(79,70,229,0.10),transparent_70%),radial-gradient(40%_40%_at_10%_30%,rgba(16,185,129,0.07),transparent_70%)]" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-14 lg:grid-cols-[1.05fr_1fr] lg:px-8 lg:pb-28 lg:pt-20">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#e3e5ea] bg-white px-3.5 py-1.5 text-[13px] text-[#5b6170]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Made for Indian companies · 100% browser based
              </span>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-7 text-[46px] font-extralight leading-[1.02] tracking-[-0.03em] sm:text-[62px] lg:text-[74px]">
                HR and payroll,<br />
                <span className="bg-clip-text text-transparent" style={{ backgroundImage: `linear-gradient(90deg, ${P}, #7c3aed 60%, #db2777)` }}>done right for India.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-7 max-w-xl text-[18px] leading-relaxed text-[#5b6170]">
                One place for people, leave, attendance, payroll, hiring, performance and more. Indian labour and tax law built in, your own rules without code, and a calm, modern design your team will actually enjoy.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href="/register" className="inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-[15.5px] text-white transition-transform hover:-translate-y-0.5" style={{ background: P, boxShadow: `0 14px 30px -12px ${P}` }}>
                  Start free trial <ArrowRight size={17} strokeWidth={1.6} />
                </Link>
                <a href="#product" className="inline-flex items-center gap-2 rounded-full border border-[#e3e5ea] bg-white px-7 py-3.5 text-[15.5px] hover:border-[#c9ccd6]">See what&apos;s inside</a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[14px] text-[#5b6170]">
                {["No card needed", "Set up in an afternoon", "Your own company web address"].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5"><Check size={15} strokeWidth={2} className="text-emerald-500" />{t}</span>
                ))}
              </div>
            </Reveal>
          </div>
          <HeroMock />
        </div>
      </section>

      {/* ── Compliance strip ───────────────── */}
      <section id="compliance" className="border-y border-[#ebedf2] bg-white">
        <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
          <p className="text-center text-[13px] uppercase tracking-[0.2em] text-[#8a90a0]">Indian law, built in and kept up to date</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {LAWS.map((l) => <span key={l} className="rounded-full border border-[#ebedf2] bg-[#fbfbfd] px-3.5 py-1.5 text-[14px] text-[#3c4150]">{l}</span>)}
          </div>
        </div>
      </section>

      {/* ── Modules ────────────────────────── */}
      <section id="product" className="mx-auto max-w-7xl px-5 py-28 lg:px-8">
        <Reveal className="max-w-2xl">
          <Eyebrow>Everything in one place</Eyebrow>
          <h2 className="mt-4 text-[40px] font-extralight leading-[1.08] tracking-tight sm:text-[50px]">From the offer letter to the farewell, every step of work.</h2>
          <p className="mt-5 text-[17px] leading-relaxed text-[#5b6170]">Twelve connected modules that share one employee record, one approval engine and one audit trail. No more spreadsheets in between.</p>
        </Reveal>
        <div className="mt-14 grid gap-px overflow-hidden rounded-[28px] border border-[#ebedf2] bg-[#ebedf2] sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m, i) => (
            <Reveal key={m.title} delay={(i % 4) * 0.04} className="bg-white">
              <div className="group h-full p-7 transition-colors hover:bg-[#fafaff]">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1f0ff] transition-transform group-hover:-translate-y-0.5" style={{ color: P }}><m.icon size={20} strokeWidth={S} /></span>
                <h3 className="mt-6 text-[18px] font-normal">{m.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-[#5b6170]">{m.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Payroll ────────────────────────── */}
      <section id="payroll" className="bg-[#0f1117] text-white">
        <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 py-28 lg:grid-cols-2 lg:px-8">
          <Reveal>
            <p className="text-[13px] uppercase tracking-[0.2em] text-[#a5b4fc]">Payroll</p>
            <h2 className="mt-4 text-[40px] font-extralight leading-[1.08] tracking-tight sm:text-[50px]">Run payroll in minutes, with the law already worked out.</h2>
            <ul className="mt-8 space-y-4 text-[16.5px] text-white/75">
              {[
                "PF, ESI, professional tax and labour welfare fund worked out by state and date",
                "TDS under both regimes with declarations, proofs and Form 16 with digital signature",
                "ECR, ESI return, 24Q and bank files ready to upload",
                "Arrears, loans, reimbursements and full and final settlement in the same run",
                "Every rate is a dated setting, so last year's runs stay exactly as they were",
              ].map((t) => <li key={t} className="flex gap-3"><Check size={18} strokeWidth={1.8} className="mt-1 shrink-0 text-[#a5b4fc]" />{t}</li>)}
            </ul>
          </Reveal>
          <Reveal delay={0.1}><Payslip /></Reveal>
        </div>
      </section>

      {/* ── Highlights ─────────────────────── */}
      <section className="mx-auto max-w-7xl space-y-28 px-5 py-28 lg:px-8">
        <Feature
          eyebrow="Approvals your way"
          title="Every request follows the flow you design."
          body="Leave, expenses, hiring, offers, salary changes and more go through approval flows you build yourself: by amount, department or anything else. Approvers can act from email, hand work to a colleague when away, and late approvals move up on their own."
          points={["Multi-level and parallel approvals", "Approve or reject straight from email", "Reminders, escalation and delegation"]}
          art={<FlowArt />}
        />
        <Feature
          flip
          eyebrow="Your own website"
          title="Your company address opens your own website."
          body="Every company gets yourname.campusly.app with an organisation website and careers page: about you, your values, life at work, leadership, offices and open jobs. Pick one of four designs and edit it in minutes. Employees sign in from the same address."
          points={["Four designs: Classic, Modern, Serene and Pulse", "Open jobs appear on their own", "Employee sign-in on every page"]}
          art={<SitesArt />}
        />
        <Feature
          eyebrow="Ask in plain words"
          title="Get answers without building a report."
          body="Ask “Who is on leave next week?” or “What did overtime cost last month?” and get the numbers, a table or a chart. Answers only include what that person is allowed to see."
          points={["Ready reports and custom dashboards", "Export to Excel and PDF", "Respects every permission"]}
          art={<AskArt />}
        />
      </section>

      {/* ── Trust ──────────────────────────── */}
      <section className="border-y border-[#ebedf2] bg-white">
        <div className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
          <Reveal className="max-w-2xl"><Eyebrow>Built to be trusted</Eyebrow><h2 className="mt-4 text-[40px] font-extralight tracking-tight">Serious about your people&apos;s data.</h2></Reveal>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Lock, t: "Separated by design", b: "Each company's data is walled off inside the database itself, not just in the app." },
              { icon: ScrollText, t: "Every change recorded", b: "Who changed what, when, and the before and after values. Nothing is ever hard-deleted." },
              { icon: ShieldCheck, t: "Roles and sensitive fields", b: "Fine-grained permissions, data scopes and hidden salary fields for those who shouldn't see them." },
              { icon: Fingerprint, t: "DPDP ready", b: "Consent, purpose and retention for candidate and employee data, with a grievance contact." },
              { icon: Globe2, t: "Right time, everywhere", b: "Times are stored once and shown in each person's own time zone." },
              { icon: Languages, t: "Your language", b: "English, Hindi, Tamil and Malayalam, with more coming." },
            ].map((x, i) => (
              <Reveal key={x.t} delay={(i % 3) * 0.05}>
                <div className="h-full rounded-3xl border border-[#ebedf2] p-7">
                  <x.icon size={22} strokeWidth={S} style={{ color: P }} />
                  <h3 className="mt-5 text-[18px] font-normal">{x.t}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-[#5b6170]">{x.b}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────── */}
      <section className="mx-auto max-w-7xl px-5 py-28 lg:px-8">
        <Reveal className="text-center"><Eyebrow>Getting started</Eyebrow><h2 className="mt-4 text-[40px] font-extralight tracking-tight">Live in three steps.</h2></Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {[
            { n: "01", t: "Create your company", b: "Pick your web address, add your legal entities, locations and departments. Indian defaults are ready for you." },
            { n: "02", t: "Bring your people", b: "Import employees from Excel, set salary structures and leave balances. We check every row before saving." },
            { n: "03", t: "Invite and go", b: "Employees sign in from your address. Approvals, payroll and the rest just work from day one." },
          ].map((s, i) => (
            <Reveal key={s.n} delay={i * 0.08}>
              <div className="relative h-full rounded-3xl bg-white p-8 shadow-[0_1px_0_#ebedf2,0_0_0_1px_#ebedf2]">
                <p className="text-[44px] font-extralight leading-none tracking-tight" style={{ color: P }}>{s.n}</p>
                <h3 className="mt-6 text-[20px] font-normal">{s.t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[#5b6170]">{s.b}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Pricing ────────────────────────── */}
      <section id="pricing" className="bg-white">
        <div className="mx-auto max-w-7xl px-5 py-28 lg:px-8">
          <Reveal className="text-center">
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="mt-4 text-[40px] font-extralight tracking-tight">Simple plans. Every feature included.</h2>
            <p className="mx-auto mt-4 max-w-xl text-[17px] text-[#5b6170]">Start free, then pick the plan that fits your team.</p>
          </Reveal>
          <LivePricing />
        </div>
      </section>

      {/* ── FAQ ────────────────────────────── */}
      <section id="faq" className="mx-auto max-w-3xl px-5 py-28">
        <Reveal className="text-center"><Eyebrow>Questions</Eyebrow><h2 className="mt-4 text-[40px] font-extralight tracking-tight">Good to know.</h2></Reveal>
        <div className="mt-12 divide-y divide-[#ebedf2] border-y border-[#ebedf2]">
          {FAQ.map((f) => <FaqItem key={f.q} {...f} />)}
        </div>
      </section>

      {/* ── CTA ────────────────────────────── */}
      <section className="px-5 pb-24 lg:px-8">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[36px] px-8 py-20 text-center text-white" style={{ background: `linear-gradient(135deg, ${P}, #312e81)` }}>
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-white/5" />
          <h2 className="relative text-[38px] font-extralight leading-tight tracking-tight sm:text-[50px]">Give your people a better place to work.</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-[17px] text-white/80">Set up your company today. Your team will be signing in by this evening.</p>
          <div className="relative mt-9 flex flex-wrap justify-center gap-3">
            <Link href="/register" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-[15.5px] text-[#14171f] hover:bg-white/90">Start free trial <ArrowRight size={17} strokeWidth={1.6} /></Link>
            <Link href="/login" className="inline-flex items-center rounded-full border border-white/30 px-7 py-3.5 text-[15.5px] hover:bg-white/10">Sign in</Link>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────── */}
      <footer className="border-t border-[#ebedf2] bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
          <div>
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-small.svg" alt="" className="h-8 w-8" />
              <span className="text-[16px]">Campusly</span>
            </div>
            <p className="mt-4 max-w-xs text-[14px] leading-relaxed text-[#5b6170]">HR and payroll for Indian companies, from the first hire to the thousandth.</p>
          </div>
          {[
            { h: "Product", l: [["People & leave", "#product"], ["Payroll", "#payroll"], ["Compliance", "#compliance"], ["Pricing", "#pricing"]] },
            { h: "Company", l: [["FAQ", "#faq"], ["Partner with us", "/partner"]] },
            { h: "Account", l: [["Sign in", "/login"], ["Start free trial", "/register"], ["Forgot password", "/forgot-password"]] },
          ].map((c) => (
            <div key={c.h}>
              <p className="text-[13px] uppercase tracking-[0.18em] text-[#8a90a0]">{c.h}</p>
              <ul className="mt-4 space-y-2.5 text-[14.5px]">
                {c.l.map(([t, h]) => <li key={t}><Link href={h} className="text-[#3c4150] hover:text-[#14171f]">{t}</Link></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t border-[#ebedf2]">
          <p className="mx-auto max-w-7xl px-5 py-6 text-[13px] text-[#8a90a0] lg:px-8">© {new Date().getFullYear()} Campusly. Made in India.</p>
        </div>
      </footer>

      {SHOW_AVATAR && <TalkingAvatar cutout size={210} text={INTRO} hint="Hi! Tap me for a quick introduction." />}
    </div>
  );
}

/* ── Hero product mock: a few live-looking cards ── */
function HeroMock() {
  const card = "rounded-[22px] border border-[#ebedf2] bg-white shadow-[0_24px_50px_-28px_rgba(20,23,31,0.35)]";
  return (
    <div className="relative mx-auto h-[500px] w-full max-w-[560px]">
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.15 }}
        className={`${card} absolute left-0 top-6 w-[78%] p-6`}>
        <div className="flex items-center justify-between">
          <p className="text-[14px] text-[#5b6170]">Good morning, Priya</p>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] text-emerald-700">Clocked in 09:12</span>
        </div>
        <p className="mt-5 text-[13px] uppercase tracking-[0.16em] text-[#8a90a0]">Leave balance</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[["Earned", "14.5"], ["Casual", "6"], ["Sick", "8"]].map(([l, v], i) => (
            <div key={l} className="rounded-2xl p-3.5" style={{ background: ["#f1f0ff", "#ecfdf5", "#fff7ed"][i] }}>
              <p className="text-[26px] font-extralight leading-none">{v}</p><p className="mt-1.5 text-[12.5px] text-[#5b6170]">{l}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-2.5">
          {[["Team stand-up", "10:00"], ["1:1 with Rahul", "15:30"]].map(([t, h]) => (
            <div key={t} className="flex items-center justify-between rounded-xl bg-[#f7f8fa] px-3.5 py-2.5 text-[13.5px]"><span>{t}</span><span className="text-[#8a90a0]">{h}</span></div>
          ))}
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.7, delay: 0.35 }}
        className={`${card} absolute right-0 top-0 w-[46%] p-4`}>
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fde68a] text-[13px]">AK</span>
          <div className="min-w-0"><p className="truncate text-[13.5px]">Arjun Kumar</p><p className="text-[12px] text-[#8a90a0]">Leave · 3 days</p></div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1.5">
          <span className="rounded-lg py-1.5 text-center text-[12.5px] text-white" style={{ background: P }}>Approve</span>
          <span className="rounded-lg border border-[#ebedf2] py-1.5 text-center text-[12.5px]">Reject</span>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.5 }}
        className={`${card} absolute bottom-6 right-2 w-[60%] p-5`}>
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-[#5b6170]">October payroll</p>
          <span className="rounded-full px-2.5 py-1 text-[12px]" style={{ background: "#f1f0ff", color: P }}>Ready to pay</span>
        </div>
        <p className="mt-3 text-[30px] font-extralight leading-none tracking-tight">₹48,62,400</p>
        <div className="mt-4 flex h-2 overflow-hidden rounded-full">
          <span className="w-[72%]" style={{ background: P }} /><span className="w-[12%] bg-[#a5b4fc]" /><span className="w-[9%] bg-[#fbbf24]" /><span className="w-[7%] bg-[#34d399]" />
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#5b6170]">
          <span>Net pay</span><span>PF</span><span>TDS</span><span>ESI & PT</span>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.7 }}
        className={`${card} absolute bottom-0 left-4 flex items-center gap-3 px-4 py-3`}>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fff1f2] text-rose-500"><HeartHandshake size={18} strokeWidth={S} /></span>
        <div><p className="text-[13.5px]">Kudos to Meera for the launch!</p><p className="text-[12px] text-[#8a90a0]">12 cheers on Buzz</p></div>
      </motion.div>
    </div>
  );
}

function Payslip() {
  const rows: [string, string][] = [["Basic", "45,000"], ["HRA", "18,000"], ["Special allowance", "22,400"], ["Leave travel", "4,600"]];
  const ded: [string, string][] = [["Provident fund", "5,400"], ["Professional tax", "200"], ["Income tax (new regime)", "6,850"]];
  return (
    <div className="rounded-[28px] bg-white p-7 text-[#14171f] shadow-[0_40px_80px_-40px_rgba(0,0,0,0.6)]">
      <div className="flex items-start justify-between">
        <div><p className="text-[13px] text-[#8a90a0]">Payslip · October</p><p className="mt-1 text-[19px]">Priya Sharma</p><p className="text-[13px] text-[#8a90a0]">Senior Designer · Bengaluru</p></div>
        <FileCheck2 size={22} strokeWidth={S} style={{ color: P }} />
      </div>
      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div><p className="text-[12px] uppercase tracking-[0.16em] text-[#8a90a0]">Earnings</p>
          {rows.map(([l, v]) => <div key={l} className="flex justify-between border-b border-[#f1f2f6] py-2 text-[14px]"><span className="text-[#5b6170]">{l}</span><span className="tabular-nums">₹{v}</span></div>)}
        </div>
        <div><p className="text-[12px] uppercase tracking-[0.16em] text-[#8a90a0]">Deductions</p>
          {ded.map(([l, v]) => <div key={l} className="flex justify-between border-b border-[#f1f2f6] py-2 text-[14px]"><span className="text-[#5b6170]">{l}</span><span className="tabular-nums">₹{v}</span></div>)}
        </div>
      </div>
      <div className="mt-6 flex items-center justify-between rounded-2xl px-5 py-4" style={{ background: "#f1f0ff" }}>
        <span className="text-[14px] text-[#5b6170]">Net pay</span><span className="text-[26px] font-extralight tabular-nums" style={{ color: P }}>₹77,550</span>
      </div>
    </div>
  );
}

function Feature({ eyebrow, title, body, points, art, flip = false }: { eyebrow: string; title: string; body: string; points: string[]; art: React.ReactNode; flip?: boolean }) {
  return (
    <div className="grid items-center gap-14 lg:grid-cols-2">
      <Reveal className={flip ? "lg:order-2" : ""}>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="mt-4 text-[36px] font-extralight leading-[1.1] tracking-tight sm:text-[44px]">{title}</h2>
        <p className="mt-5 text-[17px] leading-relaxed text-[#5b6170]">{body}</p>
        <ul className="mt-7 space-y-3">
          {points.map((p) => <li key={p} className="flex items-center gap-3 text-[15.5px]"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f1f0ff]" style={{ color: P }}><Check size={14} strokeWidth={2} /></span>{p}</li>)}
        </ul>
      </Reveal>
      <Reveal delay={0.1} className={flip ? "lg:order-1" : ""}>{art}</Reveal>
    </div>
  );
}

function FlowArt() {
  const step = (icon: React.ReactNode, t: string, s: string, tone: string) => (
    <div className="flex items-center gap-3 rounded-2xl border border-[#ebedf2] bg-white px-4 py-3.5 shadow-[0_10px_24px_-18px_rgba(20,23,31,0.4)]">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: tone }}>{icon}</span>
      <div><p className="text-[14.5px]">{t}</p><p className="text-[12.5px] text-[#8a90a0]">{s}</p></div>
    </div>
  );
  return (
    <div className="rounded-[32px] bg-[#f4f4fb] p-8">
      <div className="mx-auto max-w-sm space-y-3">
        {step(<MessageSquareText size={17} strokeWidth={S} className="text-[#4f46e5]" />, "Expense claim · ₹18,400", "Raised by Arjun", "#e0e7ff")}
        <div className="mx-auto h-5 w-px bg-[#c7c9d9]" />
        {step(<Users size={17} strokeWidth={S} className="text-amber-600" />, "Manager approves", "Approved from email · 2 min", "#fef3c7")}
        <div className="mx-auto h-5 w-px bg-[#c7c9d9]" />
        <div className="rounded-2xl border border-dashed border-[#c7c9d9] px-4 py-2 text-center text-[12.5px] text-[#5b6170]">Above ₹10,000? Finance also approves</div>
        <div className="mx-auto h-5 w-px bg-[#c7c9d9]" />
        {step(<Workflow size={17} strokeWidth={S} className="text-emerald-600" />, "Added to November payroll", "Automatically", "#d1fae5")}
      </div>
    </div>
  );
}

function SitesArt() {
  const designs = [
    { n: "Classic", bg: "#0c0d10", ink: "#fff", acc: "#4f46e5" },
    { n: "Modern", bg: "#f6f7f9", ink: "#14171f", acc: "#4f46e5" },
    { n: "Serene", bg: "#f6f0e7", ink: "#2a241d", acc: "#b45309" },
    { n: "Pulse", bg: "#eceef1", ink: "#0b0d12", acc: "#db2777" },
  ];
  return (
    <div className="grid grid-cols-2 gap-4">
      {designs.map((d, i) => (
        <div key={d.n} className="overflow-hidden rounded-[22px] border border-[#ebedf2] shadow-[0_18px_40px_-26px_rgba(20,23,31,0.45)]" style={{ background: d.bg, color: d.ink, transform: `rotate(${[-1.5, 1, 1.2, -1][i]}deg)` }}>
          <div className="flex items-center justify-between px-4 pt-3 text-[10px] opacity-70"><span>yourcompany</span><span className="rounded-full px-2 py-0.5" style={{ background: d.acc, color: "#fff" }}>Sign in</span></div>
          <div className="px-4 pb-4 pt-6">
            <p className="text-[19px] leading-[1.05]" style={{ fontFamily: d.n === "Serene" ? "Georgia, serif" : undefined, fontWeight: d.n === "Pulse" ? 700 : 200, fontStyle: d.n === "Serene" ? "italic" : "normal" }}>People who care,<br />doing work that matters.</p>
            <div className="mt-4 grid grid-cols-3 gap-1.5">
              {[0, 1, 2].map((k) => <div key={k} className={`h-10 ${d.n === "Serene" ? "rounded-t-full rounded-b-md" : "rounded-lg"}`} style={{ background: k === 1 ? d.acc : `${d.ink}1a` }} />)}
            </div>
          </div>
          <p className="border-t px-4 py-2 text-[12px]" style={{ borderColor: `${d.ink}1a` }}>{d.n}</p>
        </div>
      ))}
    </div>
  );
}

function AskArt() {
  return (
    <div className="rounded-[32px] bg-[#f4f4fb] p-6 sm:p-8">
      <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm px-4 py-3 text-[14.5px] text-white" style={{ background: P }}>Who is on leave next week in Engineering?</div>
      <div className="mt-4 max-w-[92%] rounded-2xl rounded-bl-sm bg-white p-4 shadow-[0_10px_24px_-18px_rgba(20,23,31,0.4)]">
        <p className="flex items-center gap-2 text-[14px] text-[#5b6170]"><Sparkles size={15} strokeWidth={S} style={{ color: P }} />4 people, 11 days in total</p>
        <div className="mt-3 divide-y divide-[#f1f2f6] text-[13.5px]">
          {[["Arjun Kumar", "Mon–Wed", "Earned"], ["Meera Nair", "Tue", "Sick"], ["Kabir Shah", "Wed–Fri", "Earned"], ["Neha Rao", "Thu–Fri", "Comp off"]].map(([n, d, t]) => (
            <div key={n} className="flex justify-between py-2"><span>{n}</span><span className="text-[#8a90a0]">{d} · {t}</span></div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-[#e3e5ea] bg-white px-4 py-3 text-[14px] text-[#8a90a0]"><BookOpen size={16} strokeWidth={S} />Ask anything about your people…</div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-4 py-5 text-left text-[17px]">
        {q}<ChevronDown size={18} strokeWidth={S} className={`shrink-0 text-[#8a90a0] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="-mt-1 pb-5 text-[15.5px] leading-relaxed text-[#5b6170]">{a}</p>}
    </div>
  );
}

/* ── Pricing: the plans and payment choices set in platform admin (same as the Subscription page) ── */
type PubPlan = { id: string; name: string; tagline: string; price: number; features: string[]; whatsapp: boolean; badge?: string };
type PubTrial = { id: string; name: string; tagline: string; features: string[]; trial_days: number; badge?: string };
type PubPeriod = { id: string; label: string; months: number; discount: number };
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
// same rounding as the server: real prices to the nearest ₹50, tiny ones to the rupee
const roundPrice = (raw: number) => (raw >= 500 ? Math.round(raw / 50) * 50 : Math.max(1, Math.round(raw)));

function LivePricing() {
  const [data, setData] = useState<{ trial_days: number; trial: PubTrial | null; plans: PubPlan[]; periods: PubPeriod[] } | null>(null);
  const [periodId, setPeriodId] = useState("");
  useEffect(() => {
    fetch(`${API_BASE}/platform/pricing`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d) { setData(d); setPeriodId(d.periods[0]?.id || ""); }
    }).catch(() => {});
  }, []);

  if (!data) {
    return <div className="mt-14 grid gap-6 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-[420px] animate-pulse rounded-[28px] bg-[#f4f5f8]" />)}</div>;
  }
  const period = data.periods.find((p) => p.id === periodId) || data.periods[0];
  const months = period?.months || 1;
  const off = period?.discount || 0;
  const best = [...data.periods].sort((a, b) => b.discount - a.discount)[0];
  const trial = !!data.trial && data.trial_days > 0;
  const tp = data.trial;
  const cards = data.plans.length + (trial ? 1 : 0);
  const cols = cards >= 3 ? "lg:grid-cols-3" : cards === 2 ? "lg:grid-cols-2 lg:max-w-4xl lg:mx-auto" : "lg:max-w-md lg:mx-auto";

  const Card = ({ name, tagline, badge, price, sub, features, cta }: { name: string; tagline?: string; badge?: string; price: React.ReactNode; sub?: React.ReactNode; features: string[]; cta: string }) => (
    <div className={`relative flex h-full flex-col rounded-[28px] p-8 transition-transform hover:-translate-y-1 ${badge ? "text-white" : "border border-[#ebedf2] bg-[#fbfbfd]"}`}
      style={badge ? { background: `linear-gradient(160deg, ${P}, #312e81)` } : undefined}>
      {badge && <span className="absolute right-6 top-6 rounded-full bg-white/15 px-3 py-1 text-[12px]">{badge}</span>}
      <h3 className="text-[19px] font-normal">{name}</h3>
      {tagline && <p className={`mt-1 text-[14px] ${badge ? "text-white/70" : "text-[#5b6170]"}`}>{tagline}</p>}
      <div className="mt-6">{price}</div>
      {sub && <p className={`mt-1 text-[13.5px] ${badge ? "text-white/70" : "text-[#5b6170]"}`}>{sub}</p>}
      <ul className="my-8 flex-1 space-y-3">
        {features.map((f) => <li key={f} className={`flex items-start gap-2.5 text-[14.5px] ${badge ? "text-white/85" : "text-[#3c4150]"}`}><Check size={16} strokeWidth={2} className={`mt-0.5 shrink-0 ${badge ? "text-white" : "text-emerald-500"}`} />{f}</li>)}
      </ul>
      <Link href="/register" className={`block rounded-full py-3 text-center text-[15px] transition-opacity hover:opacity-90 ${badge ? "bg-white text-[#14171f]" : "text-white"}`} style={badge ? undefined : { background: P }}>{cta}</Link>
    </div>
  );

  return (
    <>
      {data.periods.length > 1 && (
        <div className="mt-10 flex flex-col items-center gap-2">
          <div className="inline-flex rounded-full border border-[#ebedf2] bg-[#fbfbfd] p-1">
            {data.periods.map((p) => (
              <button key={p.id} type="button" onClick={() => setPeriodId(p.id)}
                className={`flex items-center gap-1.5 rounded-full px-5 py-2 text-[14px] transition-colors ${p.id === period?.id ? "bg-[#14171f] text-white" : "text-[#5b6170] hover:text-[#14171f]"}`}>
                {p.label}
                {p.discount > 0 && <span className={`rounded-full px-1.5 py-px text-[11px] ${p.id === period?.id ? "bg-white/15" : "bg-emerald-50 text-emerald-700"}`}>-{p.discount}%</span>}
              </button>
            ))}
          </div>
          {best && best.discount > 0 && <p className="text-[14px] text-[#5b6170]">Pay {best.label.toLowerCase()} and save {best.discount}%</p>}
        </div>
      )}
      <div className={`mt-10 grid gap-6 ${cols}`}>
        {trial && tp && (
          <Reveal><Card name={tp.name} tagline={tp.tagline} badge={tp.badge} features={tp.features} cta={`Start ${tp.trial_days}-day free trial`}
            price={<span className="text-[44px] font-extralight leading-none tracking-tight">{inr(0)}</span>} sub={`for ${tp.trial_days} days`} /></Reveal>
        )}
        {data.plans.map((plan, i) => {
          const total = off ? roundPrice(plan.price * months * (1 - off / 100)) : plan.price * months;
          const perMonth = Math.round(total / months);
          return (
            <Reveal key={plan.id} delay={i * 0.08}>
              <Card name={plan.name} tagline={plan.tagline} badge={plan.badge} features={plan.features}
                cta={trial ? `Start ${data.trial_days}-day free trial` : "Get started"}
                price={<span className="flex flex-wrap items-baseline gap-2"><span className="text-[44px] font-extralight leading-none tracking-tight">{inr(perMonth)}</span><span className="text-[14px] opacity-70">/ month</span>{perMonth < plan.price && <span className="text-[15px] line-through opacity-50">{inr(plan.price)}</span>}</span>}
                sub={<>{months === 1 ? "Billed every month" : `${inr(total)} billed ${months === 12 ? "once a year" : `every ${months} months`}`}{total < plan.price * months && <> · save {inr(plan.price * months - total)}</>}</>} />
            </Reveal>
          );
        })}
      </div>
      {trial && <p className="mt-8 text-center text-[14px] text-[#5b6170]">Every plan starts with a {data.trial_days}-day free trial. No card needed.</p>}
    </>
  );
}
