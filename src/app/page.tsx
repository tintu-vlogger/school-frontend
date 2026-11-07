"use client";

/*
 * Main website (campusly.app): what Campusly does for schools, colleges, universities, coaching and
 * training institutes, who it is for, pricing per learner and sign-up.
 * Institution addresses (<slug>.campusly.app) never reach this page; they show the institution's own site.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { Outfit } from "next/font/google";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, Baby, Banknote, BellRing, BookMarked, BookOpen, Building2, Bus, CalendarCheck2, CalendarClock, Check,
  ChevronDown, ClipboardCheck, CreditCard, FileClock, Fingerprint, GraduationCap, KeyRound, Landmark, Layers3,
  Lock, Menu, MessageCircle, MonitorPlay, Network, NotebookPen, School, ShieldCheck, Smartphone, Sparkles, Trophy,
  UserPlus, Users, BedDouble, Wrench, X,
} from "lucide-react";
import { API_BASE } from "@/lib/api";

const outfit = Outfit({ subsets: ["latin"], weight: ["200", "300", "400", "500"], variable: "--font-outfit" });

const P = "#4f46e5"; // brand indigo
const INK = "#16161d";
const MUTED = "#62626e";
const PAPER = "#f6f5f0";
const S = 1.4; // icon stroke

const NAV = [
  { href: "#who", label: "Who it's for" },
  { href: "#modules", label: "Modules" },
  { href: "#portal", label: "Parent app" },
  { href: "#security", label: "Security" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

/* ── Content ─────────────────────────────────────────────────────── */

type Kind = { key: string; label: string; icon: typeof School; title: string; body: string; words: [string, string][]; points: string[] };

const KINDS: Kind[] = [
  {
    key: "school", label: "Schools", icon: School,
    title: "From the morning bell to the report card.",
    body: "Classes and sections, class teachers, period timetables, term exams with CBSE, ICSE or state board grading, fee instalments and a parent app that keeps every family in the loop.",
    words: [["Class", "Grade 8"], ["Section", "A"], ["Term", "Term 2"], ["Parent", "Mother / Father"]],
    points: ["Daily or period-wise attendance", "Report cards with co-scholastic grades", "Transport routes with pick-up alerts", "Promotion to the next class in one step"],
  },
  {
    key: "preschool", label: "Preschools", icon: Baby,
    title: "Warm, simple and made for little ones.",
    body: "Groups instead of sections, activity areas instead of subjects, and descriptive progress notes instead of marks. Parents see photos, notes and pick-up times on their phone.",
    words: [["Class", "Nursery"], ["Group", "Sunflowers"], ["Activity area", "Motor skills"], ["Parent", "Guardian"]],
    points: ["Descriptive progress reports", "Authorised pick-up list", "Daily diary for parents", "Fee reminders on the parent app"],
  },
  {
    key: "college", label: "Colleges", icon: Landmark,
    title: "Programmes, semesters and credits, done right.",
    body: "Programmes with batches, semester terms, course credits and a 10-point GPA, period attendance with shortage alerts, internal assessments and university exam forms.",
    words: [["Programme", "B.Com"], ["Batch", "2025-28"], ["Semester", "Sem 3"], ["Course", "Accountancy"]],
    points: ["SGPA and CGPA worked out for you", "Attendance shortage warnings", "Elective choice per batch", "Hall tickets and mark sheets"],
  },
  {
    key: "university", label: "Universities", icon: GraduationCap,
    title: "Many departments, many campuses, one system.",
    body: "Departments and faculties across campuses, enrolment numbers, credit-based programmes, hostel and library at scale, with one owner view across the whole university.",
    words: [["Programme", "M.Sc Physics"], ["Batch", "2026 intake"], ["Semester", "Sem 1"], ["Faculty", "Dr. Iyer"]],
    points: ["Multi-campus with shared settings", "Credit-based grading of your choice", "Hostel allotment and mess", "Faculty workload and payroll"],
  },
  {
    key: "coaching", label: "Coaching centres", icon: Trophy,
    title: "Batches that start every month. Fees that come in on time.",
    body: "Courses with rolling batches, tutors, test series with ranks, online live classes and instalment fees with UPI links. Parents get scores the same evening.",
    words: [["Course", "JEE 2027"], ["Batch", "Evening 2"], ["Module", "Mechanics"], ["Tutor", "Arjun sir"]],
    points: ["Weekly tests with rank lists", "Live and recorded classes", "Instalments with auto reminders", "Enquiry to admission in one flow"],
  },
  {
    key: "training", label: "Training institutes", icon: Wrench,
    title: "Short courses, intakes and competency sign-offs.",
    body: "Intakes instead of academic years, units and competencies, trainers and learners, attendance for each session and certificates the moment a learner is signed off.",
    words: [["Course", "Electrician L3"], ["Intake", "March 2027"], ["Unit", "Wiring safety"], ["Learner", "Ravi K."]],
    points: ["Competent / not yet competent grading", "Certificates with QR verification", "Employer and sponsor contacts", "Online modules with quizzes"],
  },
];

const MODULES = [
  { icon: UserPlus, title: "Admissions", body: "Online application form, enquiries, documents, entrance tests and offer letters." },
  { icon: CalendarCheck2, title: "Attendance", body: "Daily or period-wise, by teacher phone or face scan, with an instant note to parents." },
  { icon: CalendarClock, title: "Timetable", body: "Clash-free timetables for classes, teachers and rooms, with substitutions." },
  { icon: ClipboardCheck, title: "Exams & report cards", body: "Marks, grades, GPA or competencies: any grading system, any report card layout." },
  { icon: MonitorPlay, title: "Learning & live classes", body: "Courses, assignments, quizzes and online classes, with recordings for later." },
  { icon: CreditCard, title: "Fees & online payments", body: "Fee plans, concessions, instalments, receipts, and UPI or card payment from the app." },
  { icon: MessageCircle, title: "Communication", body: "Notices, circulars, messages and SMS, WhatsApp or app alerts to the right people." },
  { icon: BookMarked, title: "Library", body: "Catalogue, issue and return by barcode, fines and a search for learners." },
  { icon: Bus, title: "Transport", body: "Routes, stops, vehicles and drivers, with fees per stop and pick-up notices." },
  { icon: BedDouble, title: "Hostel", body: "Rooms and beds, allotment, mess, visitors and leave requests from parents." },
  { icon: Banknote, title: "Staff HR & payroll", body: "Staff records, leave, attendance and payroll with PF, ESI, PT and TDS built in." },
  { icon: NotebookPen, title: "Reports & insights", body: "Ready reports and dashboards for the principal, office and management." },
];

const FAQ = [
  { q: "Does Campusly work for a college as well as a school?", a: "Yes. You choose your institution type when you sign up, and Campusly uses your words on every screen: Class and Section for a school, Programme, Batch and Semester for a college, Course and Batch for a coaching centre. Everything can still be renamed in settings." },
  { q: "Can we use our own grading system?", a: "Yes. Percentages with grades, CBSE-style scholastic and co-scholastic grades, GPA on a 4 or 10 point scale, descriptive notes for preschool or competency sign-offs for training. Report cards follow the grading you set." },
  { q: "How do parents and students sign in?", a: "They open your institution's own web address on any phone or computer and sign in with their email or the username you give them. On first sign-in they set their own password." },
  { q: "Is our data kept separate from other institutions?", a: "Yes. Every institution's data is separated at the database level, every change is recorded in an audit trail, and records are archived, never deleted." },
  { q: "We have more than one campus. Is that extra?", a: "No. Multi-campus is included in every paid plan. You see all campuses together, and each campus head sees only their own." },
  { q: "How is the price worked out?", a: "By the number of active learners you have, billed monthly or yearly. Staff accounts, parent accounts and every module are included. There is a free trial and no card is needed to start." },
  { q: "Can we bring our existing data?", a: "Yes. Import students, parents, staff and fee balances from spreadsheets. Our team helps you with the first import at no charge." },
];

const TIERS = [
  {
    name: "Starter", rate: 12, cap: 250, range: "Up to 250 learners",
    blurb: "For preschools, tuition centres and small schools.",
    features: ["Admissions, attendance and timetable", "Exams and report cards", "Fees with online payment", "Parent and student app", "Email support"],
  },
  {
    name: "Growth", rate: 10, cap: 1000, range: "Up to 1,000 learners", badge: "Most chosen",
    blurb: "For schools, colleges and coaching chains.",
    features: ["Everything in Starter", "Learning and live classes", "Library, transport and hostel", "Staff HR and payroll", "Priority support and onboarding help"],
  },
  {
    name: "Campus", rate: 8, cap: 3000, range: "Up to 3,000 learners",
    blurb: "For universities and multi-campus groups.",
    features: ["Everything in Growth", "Multiple campuses in one account", "Single sign-on and custom roles", "Dedicated success manager", "Data import and training on site"],
  },
];

/* ── Small building blocks ───────────────────────────────────────── */

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

function Eyebrow({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p className="inline-flex items-center gap-2 text-[12.5px] uppercase tracking-[0.22em]" style={{ color: light ? "#a5b4fc" : P }}>
      <span className="h-px w-6" style={{ background: light ? "#a5b4fc" : P }} />{children}
    </p>
  );
}

function H2({ children, light = false, className = "" }: { children: React.ReactNode; light?: boolean; className?: string }) {
  return (
    <h2 className={`font-[family-name:var(--font-outfit)] mt-4 text-[34px] font-extralight leading-[1.1] tracking-tight sm:text-[44px] ${className}`}
      style={{ color: light ? "#fff" : INK }}>{children}</h2>
  );
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/* ── Page ─────────────────────────────────────────────────────────── */

export default function Home() {
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 12);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <div className={`${outfit.variable} min-h-screen overflow-x-hidden font-light`} style={{ background: PAPER, color: INK }}>
      {/* Header */}
      <header className={`sticky top-0 z-40 transition-colors ${scrolled ? "border-b border-[#e4e3dc] bg-[#f6f5f0]/90 backdrop-blur" : "border-b border-transparent"}`}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <Logo />
            <span className="font-[family-name:var(--font-outfit)] text-[20px] font-light tracking-tight">Campusly</span>
          </Link>
          <nav className="hidden items-center gap-7 text-[14.5px] lg:flex" style={{ color: MUTED }}>
            {NAV.map((n) => <a key={n.href} href={n.href} className="transition-colors hover:text-[#16161d]">{n.label}</a>)}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            <Link href="/login" className="rounded-full px-4 py-2 text-[14.5px] hover:bg-black/[0.04]">Sign in</Link>
            <Link href="/register" className="inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-[14.5px] text-white transition-opacity hover:opacity-90" style={{ background: P }}>
              Start free trial
            </Link>
          </div>
          <button className="rounded-full p-2 lg:hidden" onClick={() => setMenu(!menu)} aria-label={menu ? "Close menu" : "Open menu"}>
            {menu ? <X size={22} strokeWidth={S} /> : <Menu size={22} strokeWidth={S} />}
          </button>
        </div>
        {menu && (
          <div className="border-t border-[#e4e3dc] bg-[#f6f5f0] px-4 pb-5 pt-2 lg:hidden">
            {NAV.map((n) => <a key={n.href} href={n.href} onClick={() => setMenu(false)} className="block py-2.5 text-[15.5px]">{n.label}</a>)}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link href="/login" className="rounded-full border border-[#d3d2ca] py-2.5 text-center text-[15px]">Sign in</Link>
              <Link href="/register" className="rounded-full py-2.5 text-center text-[15px] text-white" style={{ background: P }}>Free trial</Link>
            </div>
          </div>
        )}
      </header>

      <Hero />
      <Strip />
      <WhoItsFor />
      <Modules />
      <Portal />
      <MultiCampus />
      <Security />
      <Pricing />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="grid place-items-center rounded-[9px] text-white" style={{ width: size, height: size, background: P }}>
      <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M3 9.5 12 5l9 4.5-9 4.5-9-4.5Z" /><path d="M7 11.6V16c0 1.2 2.2 2.6 5 2.6s5-1.4 5-2.6v-4.4" /><path d="M21 9.5V14" />
      </svg>
    </span>
  );
}

/* ── Hero: a school day at a glance ───────────────────────────────── */

function Hero() {
  return (
    <section className="relative">
      {/* ruled-paper lines */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60"
        style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 39px, #e8e7e0 39px, #e8e7e0 40px)", maskImage: "linear-gradient(to bottom, black, transparent 85%)" }} />
      <div aria-hidden className="pointer-events-none absolute bottom-0 left-[max(16px,calc(50%-560px))] top-0 w-px bg-[#f1c9c9]/70 max-sm:hidden" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:grid-cols-[1.05fr_1fr] lg:pb-24">
        <div>
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#dcdaf8] bg-white px-3 py-1 text-[13px]" style={{ color: P }}>
              <Sparkles size={14} strokeWidth={S} /> One platform for the whole institution
            </span>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="font-[family-name:var(--font-outfit)] mt-6 text-[44px] font-extralight leading-[1.02] tracking-[-0.02em] sm:text-[64px]">
              Run your campus,<br />
              <span className="relative inline-block">
                not your paperwork.
                <svg aria-hidden className="absolute -bottom-2 left-0 w-full" height="10" viewBox="0 0 300 10" preserveAspectRatio="none">
                  <path d="M2 7 C 80 1, 200 1, 298 6" stroke={P} strokeWidth="2" fill="none" strokeLinecap="round" />
                </svg>
              </span>
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-7 max-w-xl text-[17.5px] leading-relaxed" style={{ color: MUTED }}>
              Campusly brings admissions, attendance, timetables, exams, online classes, fees, the parent app and staff payroll
              together for schools, colleges, universities, coaching centres and training institutes.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/register" className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 text-[15.5px] text-white transition-opacity hover:opacity-90" style={{ background: P }}>
                Start free trial <ArrowRight size={17} strokeWidth={1.6} />
              </Link>
              <a href="#who" className="inline-flex items-center gap-2 rounded-full border border-[#d3d2ca] bg-white px-6 py-3.5 text-[15.5px] hover:border-[#16161d]">
                See how it fits you
              </a>
            </div>
            <p className="mt-5 text-[13.5px]" style={{ color: MUTED }}>Free trial · No card needed · Your own web address in a minute</p>
          </Reveal>
        </div>
        <Reveal delay={0.2}><HeroBoard /></Reveal>
      </div>
    </section>
  );
}

function HeroBoard() {
  const periods = [
    { t: "08:40", s: "Mathematics", who: "Grade 8 - A", c: "#eef0ff", b: P },
    { t: "09:25", s: "Science lab", who: "Grade 8 - A", c: "#e9f7f0", b: "#16a34a" },
    { t: "10:10", s: "English", who: "Grade 8 - A", c: "#fff4e5", b: "#d97706" },
  ];
  return (
    <div className="relative mx-auto w-full max-w-[520px]">
      <div className="rounded-[26px] border border-[#e4e3dc] bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] uppercase tracking-[0.16em]" style={{ color: MUTED }}>Today · Tuesday</p>
            <p className="font-[family-name:var(--font-outfit)] mt-1 text-[22px] font-light">Good morning, Divya</p>
          </div>
          <span className="hidden rounded-full bg-[#eef0ff] px-3 py-1 text-[12.5px] sm:inline" style={{ color: P }}>Class teacher</span>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2.5">
          {[["38/40", "Present"], ["3", "Fees due"], ["12", "Homework in"]].map(([v, l]) => (
            <div key={l} className="rounded-2xl bg-[#f7f7f4] px-3 py-3">
              <p className="font-[family-name:var(--font-outfit)] text-[22px] font-extralight">{v}</p>
              <p className="text-[12px]" style={{ color: MUTED }}>{l}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-2">
          {periods.map((p) => (
            <div key={p.t} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: p.c }}>
              <span className="w-12 text-[12.5px] tabular-nums" style={{ color: MUTED }}>{p.t}</span>
              <span className="h-6 w-[3px] rounded-full" style={{ background: p.b }} />
              <span className="flex-1 text-[14.5px]">{p.s}</span>
              <span className="text-[12.5px]" style={{ color: MUTED }}>{p.who}</span>
            </div>
          ))}
        </div>
      </div>
      {/* floating parent notification */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8, duration: 0.5 }}
        className="absolute -bottom-14 -left-3 w-[250px] rounded-2xl border border-[#e4e3dc] bg-white p-3.5 sm:-left-10">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e9f7f0] text-[#16a34a]"><BellRing size={16} strokeWidth={S} /></span>
          <div>
            <p className="text-[13.5px]">Aarav reached school</p>
            <p className="text-[12px]" style={{ color: MUTED }}>Marked present at 08:32 · Parent app</p>
          </div>
        </div>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.5 }}
        className="absolute -right-2 -top-10 rounded-2xl sm:-top-6 border border-[#e4e3dc] bg-white px-4 py-3 sm:-right-8">
        <p className="text-[12px]" style={{ color: MUTED }}>Fee received</p>
        <p className="font-[family-name:var(--font-outfit)] text-[20px] font-extralight">₹18,500 <span className="text-[12px] text-[#16a34a]">UPI</span></p>
      </motion.div>
    </div>
  );
}

function Strip() {
  const items = ["CBSE", "ICSE", "State boards", "IB & Cambridge", "Autonomous colleges", "Universities", "JEE / NEET coaching", "Skill & vocational training"];
  return (
    <section className="border-y border-[#e4e3dc] bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-6 text-[14px] sm:px-6" style={{ color: MUTED }}>
        <span className="text-[12px] uppercase tracking-[0.2em]" style={{ color: INK }}>Built for</span>
        {items.map((i) => <span key={i}>{i}</span>)}
      </div>
    </section>
  );
}

/* ── Who it's for ─────────────────────────────────────────────────── */

function WhoItsFor() {
  const [active, setActive] = useState(KINDS[0].key);
  const kind = KINDS.find((k) => k.key === active) ?? KINDS[0];
  return (
    <section id="who" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal>
          <Eyebrow>Who it&rsquo;s for</Eyebrow>
          <H2>Speaks the language<br className="hidden sm:block" /> of your institution.</H2>
          <p className="mt-5 max-w-2xl text-[16.5px] leading-relaxed" style={{ color: MUTED }}>
            Pick your institution type once. Every screen, report and message then uses your own words and your own way of running things.
          </p>
        </Reveal>
        <div className="mt-10 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div role="tablist" className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
            {KINDS.map((k) => {
              const on = k.key === active;
              const Icon = k.icon;
              return (
                <button key={k.key} role="tab" aria-selected={on} onClick={() => setActive(k.key)}
                  className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2.5 text-[14.5px] transition-colors ${on ? "text-white" : "border-[#d3d2ca] bg-white hover:border-[#16161d]"}`}
                  style={on ? { background: INK, borderColor: INK } : undefined}>
                  <Icon size={16} strokeWidth={S} /> {k.label}
                </button>
              );
            })}
          </div>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={kind.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}
            className="mt-8 grid gap-6 rounded-[28px] border border-[#e4e3dc] bg-white p-6 sm:p-10 lg:grid-cols-[1.2fr_1fr]">
            <div>
              <h3 className="font-[family-name:var(--font-outfit)] text-[26px] font-light leading-tight sm:text-[30px]">{kind.title}</h3>
              <p className="mt-4 text-[16px] leading-relaxed" style={{ color: MUTED }}>{kind.body}</p>
              <ul className="mt-7 grid gap-3 sm:grid-cols-2">
                {kind.points.map((p) => (
                  <li key={p} className="flex items-start gap-2.5 text-[15px]">
                    <Check size={17} strokeWidth={1.6} className="mt-0.5 shrink-0" style={{ color: P }} /> {p}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-[#f7f7f4] p-5 sm:p-6">
              <p className="text-[12px] uppercase tracking-[0.16em]" style={{ color: MUTED }}>On every screen</p>
              <div className="mt-4 divide-y divide-[#e4e3dc]">
                {kind.words.map(([w, ex]) => (
                  <div key={w} className="flex items-center justify-between py-3">
                    <span className="font-[family-name:var(--font-outfit)] text-[19px] font-light">{w}</span>
                    <span className="rounded-full bg-white px-3 py-1 text-[13px]" style={{ color: MUTED }}>{ex}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[13px]" style={{ color: MUTED }}>Prefer other words? Rename any of them in settings.</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

/* ── Modules ──────────────────────────────────────────────────────── */

function Modules() {
  return (
    <section id="modules" className="scroll-mt-20 border-t border-[#e4e3dc] bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
          <Reveal>
            <Eyebrow>Modules</Eyebrow>
            <H2>Everything a campus runs on.<br className="hidden sm:block" /> Switch on what you need.</H2>
          </Reveal>
          <Reveal delay={0.05}>
            <p className="text-[16.5px] leading-relaxed lg:pb-2" style={{ color: MUTED }}>
              Each module works on its own and better together: attendance feeds report cards, fees show on the parent app, and the timetable knows who is on leave.
            </p>
          </Reveal>
        </div>
        <div className="mt-14 grid gap-px overflow-hidden rounded-[24px] border border-[#e4e3dc] bg-[#e4e3dc] sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m, i) => (
            <Reveal key={m.title} delay={(i % 4) * 0.04} className="group bg-white p-6 transition-colors hover:bg-[#fafaf7]">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef0ff] transition-transform group-hover:-translate-y-0.5" style={{ color: P }}>
                <m.icon size={19} strokeWidth={S} />
              </span>
              <h3 className="mt-5 text-[16.5px] font-normal">{m.title}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: MUTED }}>{m.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Parent & student portal ──────────────────────────────────────── */

function Portal() {
  const features = [
    { icon: CalendarCheck2, t: "Attendance as it happens", b: "A note the moment a child is marked present, late or absent." },
    { icon: BookOpen, t: "Homework and classes", b: "Today's timetable, homework, study material and live class links." },
    { icon: ClipboardCheck, t: "Marks and report cards", b: "Results the day they are published, with the report card to download." },
    { icon: CreditCard, t: "Pay fees in two taps", b: "Dues, receipts and payment by UPI, card or net banking." },
  ];
  return (
    <section id="portal" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <Reveal className="order-2 lg:order-1"><PhoneMock /></Reveal>
        <div className="order-1 lg:order-2">
          <Reveal>
            <Eyebrow>Parent & student app</Eyebrow>
            <H2>Families stay close<br className="hidden sm:block" /> without the phone calls.</H2>
            <p className="mt-5 text-[16.5px] leading-relaxed" style={{ color: MUTED }}>
              Parents and students sign in on your institution&rsquo;s own address with an email or the username you give them. Parents with more than one child switch between them in a tap.
            </p>
          </Reveal>
          <div className="mt-9 grid gap-5 sm:grid-cols-2">
            {features.map((f, i) => (
              <Reveal key={f.t} delay={i * 0.05}>
                <f.icon size={20} strokeWidth={S} style={{ color: P }} />
                <h3 className="mt-3 text-[15.5px] font-normal">{f.t}</h3>
                <p className="mt-1.5 text-[14.5px] leading-relaxed" style={{ color: MUTED }}>{f.b}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function PhoneMock() {
  return (
    <div className="relative mx-auto w-[290px] sm:w-[310px]">
      <div aria-hidden className="absolute -inset-10 -z-0 rounded-full bg-[#e6e4ff] blur-3xl" />
      <div className="relative rounded-[42px] border border-[#d3d2ca] bg-[#16161d] p-2.5">
        <div className="overflow-hidden rounded-[34px] bg-[#f6f5f0]">
          <div className="px-5 pb-4 pt-7">
            <p className="text-[12px]" style={{ color: MUTED }}>Hello, Meera</p>
            <div className="mt-3 flex gap-2">
              <span className="rounded-full px-3 py-1.5 text-[12.5px] text-white" style={{ background: P }}>Aarav · 8 A</span>
              <span className="rounded-full border border-[#d3d2ca] bg-white px-3 py-1.5 text-[12.5px]">Anika · 3 A</span>
            </div>
          </div>
          <div className="space-y-2.5 px-4 pb-6">
            <div className="rounded-2xl bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-[13px]" style={{ color: MUTED }}>Attendance this term</p>
                <span className="text-[12px] text-[#16a34a]">Present today</span>
              </div>
              <p className="font-[family-name:var(--font-outfit)] mt-1 text-[28px] font-extralight">96%</p>
              <div className="mt-2 h-1.5 rounded-full bg-[#eeede7]"><div className="h-full w-[96%] rounded-full" style={{ background: P }} /></div>
            </div>
            <div className="rounded-2xl bg-white p-4">
              <p className="text-[13px]" style={{ color: MUTED }}>Next class</p>
              <p className="mt-1 text-[15px]">Science · 09:25</p>
              <p className="text-[12.5px]" style={{ color: MUTED }}>Homework: Chapter 6 questions</p>
            </div>
            <div className="flex items-center justify-between rounded-2xl bg-white p-4">
              <div>
                <p className="text-[13px]" style={{ color: MUTED }}>Term 2 fees</p>
                <p className="font-[family-name:var(--font-outfit)] text-[20px] font-extralight">₹18,500</p>
              </div>
              <span className="rounded-full px-4 py-2 text-[13px] text-white" style={{ background: INK }}>Pay now</span>
            </div>
            <div className="rounded-2xl bg-white p-4">
              <p className="text-[13px]" style={{ color: MUTED }}>Mid-term results</p>
              <p className="mt-1 text-[15px]">A1 in Maths, A2 in Science</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Multi-campus ─────────────────────────────────────────────────── */

function MultiCampus() {
  const campuses = [
    { n: "Main campus · Kochi", l: 1840, s: 112 },
    { n: "City branch · Ernakulam", l: 920, s: 58 },
    { n: "Junior school · Aluva", l: 410, s: 31 },
  ];
  return (
    <section className="py-6 sm:py-10">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="grid gap-10 rounded-[32px] p-7 text-white sm:p-12 lg:grid-cols-2 lg:items-center" style={{ background: INK }}>
          <Reveal>
            <Eyebrow light>Multi-campus</Eyebrow>
            <H2 light>One group. Many campuses.<br className="hidden sm:block" /> One clear view.</H2>
            <p className="mt-5 text-[16px] leading-relaxed text-white/65">
              Share fee plans, grading and settings across branches, or let each campus set its own. Management sees totals for the group; each campus head sees only their campus.
            </p>
            <div className="mt-7 flex flex-wrap gap-2 text-[13.5px] text-white/80">
              {["Group dashboard", "Transfer learners between campuses", "Shared staff and payroll", "Campus-level roles"].map((t) => (
                <span key={t} className="rounded-full border border-white/15 px-3 py-1.5">{t}</span>
              ))}
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center gap-2 text-[13px] text-white/60"><Network size={16} strokeWidth={S} /> St. Thomas Group of Schools</div>
              <div className="mt-4 space-y-2.5">
                {campuses.map((c) => (
                  <div key={c.n} className="flex items-center gap-4 rounded-xl bg-white/[0.05] px-4 py-3">
                    <Building2 size={18} strokeWidth={S} className="text-[#a5b4fc]" />
                    <span className="flex-1 text-[14.5px]">{c.n}</span>
                    <span className="text-[13px] tabular-nums text-white/60">{c.l.toLocaleString("en-IN")} learners</span>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-[14px]">
                <span className="text-white/60">Group total</span>
                <span className="font-[family-name:var(--font-outfit)] text-[22px] font-extralight">3,170 learners · 201 staff</span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ── Security ─────────────────────────────────────────────────────── */

function Security() {
  const items = [
    { icon: Layers3, t: "Separate data for every institution", b: "Each institution's records are walled off at the database level, so no one else can ever see them." },
    { icon: FileClock, t: "A full audit trail", b: "Every change records who made it, when and what it was before. Marks and fees can always be traced." },
    { icon: KeyRound, t: "The right access for each role", b: "Principal, teacher, accountant, librarian, parent and student each see only what they need." },
    { icon: Lock, t: "Nothing is ever deleted", b: "Records are archived, never removed, and can be restored by an administrator." },
    { icon: Fingerprint, t: "Safe sign-in", b: "Strong passwords, lock-out after repeated failures and single sign-on for larger groups." },
    { icon: ShieldCheck, t: "Consent and privacy", b: "Parent consent, data export and privacy settings in line with India's data protection law." },
  ];
  return (
    <section id="security" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="max-w-2xl">
          <Eyebrow>Security & trust</Eyebrow>
          <H2>Children&rsquo;s data deserves<br className="hidden sm:block" /> the best care.</H2>
        </Reveal>
        <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <Reveal key={it.t} delay={(i % 3) * 0.05} className="border-t border-[#d3d2ca] pt-6">
              <it.icon size={21} strokeWidth={S} style={{ color: P }} />
              <h3 className="mt-4 text-[16.5px] font-normal">{it.t}</h3>
              <p className="mt-2 text-[14.5px] leading-relaxed" style={{ color: MUTED }}>{it.b}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Pricing: per learner ─────────────────────────────────────────── */

function Pricing() {
  const [yearly, setYearly] = useState(true);
  const [learners, setLearners] = useState(600);
  const [trialDays, setTrialDays] = useState(30);
  useEffect(() => {
    fetch(`${API_BASE}/platform/pricing`).then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d && typeof d.trial_days === "number" && d.trial_days > 0) setTrialDays(d.trial_days);
    }).catch(() => {});
  }, []);
  const off = yearly ? 0.2 : 0;
  // Same tiers as the platform plans (modules/platform/subscription.py): a flat monthly price
  // for up to `cap` learners, i.e. `rate` per learner at full use.
  const tier = TIERS.find((t) => learners <= t.cap) ?? TIERS[TIERS.length - 1];
  const beyond = learners > TIERS[TIERS.length - 1].cap;
  const monthly = tier.rate * tier.cap * (1 - off);

  return (
    <section id="pricing" className="scroll-mt-20 border-t border-[#e4e3dc] bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <Reveal>
            <Eyebrow>Pricing</Eyebrow>
            <H2>Pay for learners,<br className="hidden sm:block" /> not for features.</H2>
            <p className="mt-5 max-w-xl text-[16.5px] leading-relaxed" style={{ color: MUTED }}>
              One simple price per active learner each month. Staff, parents and every module in your plan are included. Start with a {trialDays}-day free trial.
            </p>
          </Reveal>
          <Reveal delay={0.05}>
            <div className="inline-flex rounded-full border border-[#e4e3dc] bg-[#f7f7f4] p-1 text-[14px]">
              {[["Monthly", false], ["Yearly · save 20%", true]].map(([l, v]) => (
                <button key={String(l)} onClick={() => setYearly(v as boolean)}
                  className={`rounded-full px-4 py-2 transition-colors ${yearly === v ? "bg-white text-[#16161d] ring-1 ring-[#e4e3dc]" : ""}`}
                  style={yearly === v ? undefined : { color: MUTED }}>{l as string}</button>
              ))}
            </div>
          </Reveal>
        </div>

        <div className="mt-12 grid gap-5 lg:grid-cols-3">
          {TIERS.map((t, i) => {
            const dark = !!t.badge;
            return (
              <Reveal key={t.name} delay={i * 0.05}>
                <div className={`relative flex h-full flex-col rounded-[26px] p-7 sm:p-8 ${dark ? "text-white" : "border border-[#e4e3dc] bg-[#fbfbf9]"}`} style={dark ? { background: P } : undefined}>
                  {t.badge && <span className="absolute right-6 top-6 rounded-full bg-white/15 px-3 py-1 text-[12px]">{t.badge}</span>}
                  <p className="font-[family-name:var(--font-outfit)] text-[22px] font-light">{t.name}</p>
                  <p className={`mt-1 text-[14px] ${dark ? "text-white/70" : ""}`} style={dark ? undefined : { color: MUTED }}>{t.blurb}</p>
                  <div className="mt-7 flex items-end gap-1.5">
                    <span className="font-[family-name:var(--font-outfit)] text-[46px] font-extralight leading-none tracking-tight">{inr(t.rate * (1 - off))}</span>
                    <span className={`pb-1 text-[14px] ${dark ? "text-white/70" : ""}`} style={dark ? undefined : { color: MUTED }}>per learner / month</span>
                  </div>
                  <p className={`mt-2 text-[13.5px] ${dark ? "text-white/70" : ""}`} style={dark ? undefined : { color: MUTED }}>
                    {t.range} · {inr(t.rate * t.cap * (1 - off))} a month
                  </p>
                  <ul className="mt-7 flex-1 space-y-3">
                    {t.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-[14.5px]">
                        <Check size={16} strokeWidth={1.6} className="mt-0.5 shrink-0" style={{ color: dark ? "#c7d2fe" : P }} /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link href="/register" className={`mt-8 inline-flex items-center justify-center gap-2 rounded-full py-3 text-[15px] transition-opacity hover:opacity-90 ${dark ? "bg-white text-[#16161d]" : "text-white"}`}
                    style={dark ? undefined : { background: INK }}>
                    Start {trialDays}-day free trial <ArrowRight size={16} strokeWidth={1.6} />
                  </Link>
                </div>
              </Reveal>
            );
          })}
        </div>

        {/* estimator */}
        <Reveal delay={0.1}>
          <div className="mt-8 grid gap-6 rounded-[26px] border border-[#e4e3dc] bg-[#f7f7f4] p-6 sm:p-8 md:grid-cols-[1.4fr_1fr] md:items-center">
            <div>
              <label htmlFor="learners" className="flex items-center justify-between text-[14.5px]">
                <span className="flex items-center gap-2"><Users size={17} strokeWidth={S} style={{ color: P }} /> How many learners do you have?</span>
                <span className="font-[family-name:var(--font-outfit)] text-[20px] font-light tabular-nums">{learners.toLocaleString("en-IN")}</span>
              </label>
              <input id="learners" type="range" min={50} max={5000} step={50} value={learners} onChange={(e) => setLearners(Number(e.target.value))}
                className="mt-4 w-full accent-[#4f46e5]" />
              <div className="mt-1 flex justify-between text-[12px]" style={{ color: MUTED }}><span>50</span><span>5,000+</span></div>
            </div>
            <div className="rounded-2xl bg-white p-5">
              <p className="text-[13px]" style={{ color: MUTED }}>Estimated on {tier.name}{yearly ? ", billed yearly" : ""}</p>
              <p className="font-[family-name:var(--font-outfit)] mt-1 text-[32px] font-extralight">{inr(monthly)}<span className="text-[15px]" style={{ color: MUTED }}> / month</span></p>
              <p className="text-[12.5px]" style={{ color: MUTED }}>{beyond ? "More than 3,000 learners? Talk to us for a group quote." : "Plus GST. Larger groups, talk to us for a quote."}</p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ── FAQ ──────────────────────────────────────────────────────────── */

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="scroll-mt-20 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.6fr]">
        <Reveal>
          <Eyebrow>FAQ</Eyebrow>
          <H2>Questions we<br className="hidden sm:block" /> hear often.</H2>
          <p className="mt-5 text-[15.5px] leading-relaxed" style={{ color: MUTED }}>
            Something else on your mind? Start the free trial and ask us from inside the app.
          </p>
        </Reveal>
        <div className="divide-y divide-[#e4e3dc] border-y border-[#e4e3dc]">
          {FAQ.map((f, i) => {
            const on = open === i;
            return (
              <div key={f.q}>
                <button className="flex w-full items-center justify-between gap-6 py-5 text-left" onClick={() => setOpen(on ? null : i)} aria-expanded={on}>
                  <span className="text-[16.5px]">{f.q}</span>
                  <ChevronDown size={19} strokeWidth={S} className={`shrink-0 transition-transform ${on ? "rotate-180" : ""}`} style={{ color: MUTED }} />
                </button>
                <AnimatePresence initial={false}>
                  {on && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                      <p className="pb-6 pr-8 text-[15px] leading-relaxed" style={{ color: MUTED }}>{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Final call to action and footer ──────────────────────────────── */

function FinalCta() {
  return (
    <section className="px-4 pb-20 sm:px-6">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] px-6 py-16 text-center text-white sm:py-20" style={{ background: P }}>
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-20"
            style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 35px, rgba(255,255,255,.5) 35px, rgba(255,255,255,.5) 36px)" }} />
          <div className="relative">
            <Smartphone size={26} strokeWidth={S} className="mx-auto text-white/80" />
            <h2 className="font-[family-name:var(--font-outfit)] mx-auto mt-5 max-w-2xl text-[34px] font-extralight leading-tight tracking-tight sm:text-[46px]">
              Your institution online, by this afternoon.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-[16px] text-white/75">
              Sign up, choose your institution type and Campusly sets up your classes, sections and subjects for you. Invite your staff when you&rsquo;re ready.
            </p>
            <div className="mt-9 flex flex-wrap justify-center gap-3">
              <Link href="/register" className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-[15.5px] text-[#16161d] hover:bg-white/90">
                Start free trial <ArrowRight size={17} strokeWidth={1.6} />
              </Link>
              <Link href="/login" className="inline-flex items-center gap-2 rounded-full border border-white/40 px-7 py-3.5 text-[15.5px] hover:bg-white/10">Sign in</Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  const cols: { h: string; l: [string, string][] }[] = [
    { h: "Product", l: [["Who it's for", "#who"], ["Modules", "#modules"], ["Parent app", "#portal"], ["Pricing", "#pricing"]] },
    { h: "Institutions", l: [["Schools", "#who"], ["Colleges & universities", "#who"], ["Coaching centres", "#who"], ["Training institutes", "#who"]] },
    { h: "Account", l: [["Sign in", "/login"], ["Start free trial", "/register"], ["Forgot password", "/forgot-password"]] },
  ];
  return (
    <footer className="border-t border-[#e4e3dc] bg-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <div className="flex items-center gap-2.5">
            <Logo size={28} />
            <span className="font-[family-name:var(--font-outfit)] text-[19px] font-light">Campusly</span>
          </div>
          <p className="mt-4 max-w-xs text-[14px] leading-relaxed" style={{ color: MUTED }}>
            The all-in-one platform for schools, colleges, universities, coaching centres and training institutes.
          </p>
        </div>
        {cols.map((c) => (
          <div key={c.h}>
            <p className="text-[12.5px] uppercase tracking-[0.18em]" style={{ color: INK }}>{c.h}</p>
            <ul className="mt-4 space-y-2.5 text-[14.5px]" style={{ color: MUTED }}>
              {c.l.map(([label, href]) => (
                <li key={label}>{href.startsWith("/") ? <Link href={href} className="hover:text-[#16161d]">{label}</Link> : <a href={href} className="hover:text-[#16161d]">{label}</a>}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-[#e4e3dc]">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-[13px] sm:flex-row sm:items-center sm:justify-between sm:px-6" style={{ color: MUTED }}>
          <span>© {new Date().getFullYear()} Campusly. Made in India for institutions everywhere.</span>
          <span>Privacy · Terms</span>
        </div>
      </div>
    </footer>
  );
}
