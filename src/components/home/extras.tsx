"use client";

/*
 * Overview header pieces: the greeting with today's date and a live clock, the Ask box
 * that hands a question to the assistant, and quick actions picked for the person's role.
 *   <HomeGreeting />  <AskBox isHr />  <QuickActions access={access} />
 */
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, BarChart3, Briefcase, CalendarPlus, FileText, Gift, Heart, HelpCircle, Megaphone, PlayCircle, Receipt,
  Sparkles, UserPlus, Wallet, Zap,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { currentHour, formatLongDate, formatTime } from "@/lib/datetime";
import { HomeCard, STROKE, type HomeAccess } from "./kit";

function greeting(h: number) {
  return h < 5 ? "Hello" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export function HomeGreeting() {
  const { user } = useAuth();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const first = user?.full_name?.split(" ")[0];
  return (
    <div className="home-rise flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[12px] uppercase tracking-[0.12em] text-faint">{now ? formatLongDate(now) : " "}</p>
        <h1 className="mt-1 text-[28px] font-extralight leading-tight tracking-tight text-ink sm:text-[32px]">
          {now ? greeting(currentHour()) : "Hello"}{first ? <>, <span className="text-primary">{first}</span></> : ""}
        </h1>
        {user?.company_name && <p className="mt-1 text-[14px] text-muted">{user.company_name}</p>}
      </div>
      {now && <p className="tabular hidden text-[13px] text-faint sm:block">{formatTime(now)}</p>}
    </div>
  );
}

export function AskBox({ isHr }: { isHr: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const prompts = isHr
    ? ["Who joined this month?", "Headcount by department", "Draft an offer letter"]
    : ["How many leaves do I have?", "When is the next holiday?", "Explain my payslip"];
  const ask = (text: string) => { const t = text.trim(); if (t) router.push(`/dashboard/assistant?q=${encodeURIComponent(t)}`); };
  return (
    <div className="home-rise rounded-2xl border border-line bg-surface p-1.5 transition-colors focus-within:border-primary/40" style={{ animationDelay: "40ms" }}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); ask(q); }} className="flex items-center gap-3 pl-3">
        <Sparkles size={18} strokeWidth={1.3} className="shrink-0 text-primary" />
        <input id="overview-ask" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ask the assistant"
          placeholder={isHr ? "Ask anything about your people, or tell me what to do…" : "Ask anything about your leave, pay or policies…"}
          className="h-10 min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-faint" />
        <button type="submit" disabled={!q.trim()} aria-label="Ask"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-opacity hover:bg-primary-dark disabled:opacity-25">
          <ArrowRight size={17} strokeWidth={1.5} />
        </button>
      </form>
      <div className="flex gap-1.5 overflow-x-auto px-1.5 pb-1 pt-1.5 hr-scroll">
        {prompts.map((p) => (
          <button key={p} type="button" onClick={() => ask(p)}
            className="shrink-0 rounded-full border border-line px-3 py-1 text-[12px] text-muted transition-colors hover:border-primary/40 hover:text-primary">{p}</button>
        ))}
      </div>
    </div>
  );
}

type Action = { label: string; href: string; icon: typeof Zap };

export function QuickActions({ access, wide, className = "", delay = 0 }: { access: HomeAccess; wide?: boolean; className?: string; delay?: number }) {
  const a: Action[] = [];
  if (access.isEmployee) {
    a.push({ label: "Apply leave", href: "/dashboard/leave", icon: CalendarPlus });
    a.push({ label: "My payslips", href: "/dashboard/payroll/me", icon: Wallet });
    a.push({ label: "Claim expense", href: "/dashboard/expenses", icon: Receipt });
  }
  if (access.can("people.employees.manage")) a.push({ label: "Add employee", href: "/dashboard/staff?new=1", icon: UserPlus });
  if (access.can("payroll.run")) a.push({ label: "Run payroll", href: "/dashboard/payroll/runs", icon: PlayCircle });
  if (access.can("engage.announcements.manage")) a.push({ label: "Announce", href: "/dashboard/announcements", icon: Megaphone });
  if (access.can("talent.hiring.manage")) a.push({ label: "Post a job", href: "/dashboard/recruitment", icon: Briefcase });
  if (access.can("insights.reports.view")) a.push({ label: "Reports", href: "/dashboard/reports", icon: BarChart3 });
  a.push({ label: "Give kudos", href: "/dashboard/kudos", icon: Heart });
  a.push({ label: "Get help", href: "/dashboard/helpdesk", icon: HelpCircle });
  if (access.isEmployee) {
    a.push({ label: "Documents", href: "/dashboard/documents", icon: FileText });
    a.push({ label: "Refer a friend", href: "/dashboard/recruitment/referrals", icon: Gift });
  }
  const shown = a.slice(0, 8);
  return (
    <HomeCard title="Quick actions" icon={Zap} className={className} delay={delay}>
      <div className={`grid flex-1 grid-cols-2 gap-2 px-5 pb-5 pt-3 sm:grid-cols-4 ${wide ? "lg:grid-cols-8" : ""}`}>
        {shown.map((x) => (
          <Link key={x.label} href={x.href}
            className="group flex flex-col items-start gap-2.5 rounded-xl border border-line px-3 py-3 transition-all duration-200 hover:-translate-y-px hover:border-primary/40 hover:bg-primary-soft/40">
            <x.icon size={17} strokeWidth={STROKE} className="text-muted transition-colors group-hover:text-primary" />
            <span className="text-[13px] text-ink">{x.label}</span>
          </Link>
        ))}
      </div>
    </HomeCard>
  );
}
