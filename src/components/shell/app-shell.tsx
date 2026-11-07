"use client";

/*
 * Tenant app shell.
 *   ┌────┬────────────┬──────────────────────────────────────┐
 *   │rail│ section    │ header: breadcrumb · search · actions │
 *   │    │ panel      ├──────────────────────────────────────┤
 *   │    │ (pages)    │ page (on the paper canvas)            │
 *   └────┴────────────┴──────────────────────────────────────┘
 * Rail = sections (dark ink strip). Panel = pages of the active section; it can be
 * folded away. On phones both live in a slide-in drawer.
 */

import { AvatarToggle, TalkingAvatar, useAvatarSwitch } from "@/components/talking-avatar";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown, ChevronLeft, HelpCircle, Languages, LogOut, Menu, PanelLeftClose, PanelLeftOpen,
  Plus, Smartphone, Sparkles, User, X, UserPlus, Plane, Receipt, Briefcase, Megaphone, Settings2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useI18n, LANGUAGES } from "@/i18n/provider";
import type { Locale } from "@/i18n/provider";
import { UniversalSearch } from "@/components/universal-search";
import { NotificationBell } from "@/components/engagement/notification-bell";
import { HelpPortal } from "@/components/help/help-portal";
import { topicForPath } from "@/components/help/help-index";
import { MobileLoginModal } from "@/components/mobile-login-modal";
import { ADMIN_SECTION, canOpen, findPage, visibleSections, type HrSection } from "@/lib/hr-nav";
import { AccessProvider, useAccess } from "@/lib/access";
import { InstitutionProvider } from "@/lib/institution";
import { useServiceNav } from "@/components/custom_forms/use-service-nav";
import { EmptyState, Paper, btn } from "@/components/shell/page";
import { Lock } from "lucide-react";


const STROKE = 1.4;

/** Close a popover when clicking outside it. */
function useOutside<T extends HTMLElement>(open: boolean, close: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, close]);
  return ref;
}

function initials(name?: string | null) {
  return (name || "?").split(" ").filter(Boolean).map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}

const CREATE_ACTIONS: { label: string; href: string; icon: typeof Plus; need?: string[]; self?: boolean }[] = [
  { label: "Add employee", href: "/dashboard/staff/new", icon: UserPlus, need: ["people.employees.manage"] },
  { label: "Apply for leave", href: "/dashboard/leave", icon: Plane, self: true },
  { label: "New expense claim", href: "/dashboard/payroll/me?tab=expenses", icon: Receipt, self: true },
  { label: "New job opening", href: "/dashboard/recruitment", icon: Briefcase, need: ["talent.hiring.manage"] },
  { label: "Announcement", href: "/dashboard/announcements", icon: Megaphone, need: ["engage.announcements.manage"] },
];

/** Shown instead of a page the person may not open. */
function NoAccess() {
  return (
    <Paper>
      <EmptyState icon={Lock} title="You don't have access to this page"
        hint="Your role doesn't include it. If you need it, ask your HR admin."
        action={<Link href="/dashboard" className={btn.ghost}>Go to overview</Link>} />
    </Paper>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return <InstitutionProvider><AccessProvider><Shell>{children}</Shell></AccessProvider></InstitutionProvider>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const { locale, setLocale } = useI18n();
  const access = useAccess();

  const isAdmin = access.isAdmin;
  const serviceNav = useServiceNav(!!user && access.ready && !access.portalRole);
  const sections = useMemo(() => visibleSections(access, serviceNav), [access, serviceNav]);
  const allowed = canOpen(pathname, access);
  const mainSections = sections.filter((s) => s.key !== ADMIN_SECTION.key);
  const adminSection = sections.find((s) => s.key === ADMIN_SECTION.key);
  const current = findPage(pathname, serviceNav);
  const routeSection = sections.find((s) => s.key === current?.section.key) || sections[0];

  // The panel always shows the section of the page you are on; clicking a rail icon opens that section.
  const panelSection: HrSection | undefined = routeSection;

  const [panelOpen, setPanelOpen] = useState(true);
  useEffect(() => {
    try { if (localStorage.getItem("hr_panel") === "0") setPanelOpen(false); } catch { /* ignore */ }
  }, []);
  const togglePanel = () => setPanelOpen((v) => { try { localStorage.setItem("hr_panel", v ? "0" : "1"); } catch { /* ignore */ } return !v; });

  // The phone drawer closes itself on navigation: it is open only on the path it was opened on.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawer = drawerPath === pathname;
  const setDrawer = (open: boolean) => setDrawerPath(open ? pathname : null);

  // Finish company setup first.
  const needsSetup = !!user && user.setup_complete === false;
  useEffect(() => { if (needsSetup) router.replace("/onboarding"); }, [needsSetup, router]);

  // ?embed=1 renders the page alone (used inside modals).
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    try { setEmbedded(new URLSearchParams(window.location.search).get("embed") === "1"); } catch { /* ignore */ }
  }, [pathname]);

  // Support impersonation banner.
  const [impersonating, setImpersonating] = useState(false);
  useEffect(() => {
    const admin = localStorage.getItem("hrms_admin_token");
    const cur = localStorage.getItem("hrms_token");
    if (admin && cur && admin !== cur) setImpersonating(true);
    else if (admin) localStorage.removeItem("hrms_admin_token");
  }, []);
  function switchBack() {
    const admin = localStorage.getItem("hrms_admin_token");
    if (!admin) return;
    localStorage.setItem("hrms_token", admin);
    localStorage.removeItem("hrms_admin_token");
    window.location.href = "/dashboard";
  }

  const [menu, setMenu] = useState<null | "create" | "notif" | "lang" | "profile">(null);
  const closeMenu = () => setMenu(null);
  const createRef = useOutside<HTMLDivElement>(menu === "create", closeMenu);
  const langRef = useOutside<HTMLDivElement>(menu === "lang", closeMenu);
  const profileRef = useOutside<HTMLDivElement>(menu === "profile", closeMenu);
  const [help, setHelp] = useState(false);
  const [avatarOn, setAvatarOn] = useAvatarSwitch();
  const [avatarReady, setAvatarReady] = useState(false);
  const [avatarAutoPlay, setAvatarAutoPlay] = useState(false); // switched on just now: talk once ready
  const [mobileLogin, setMobileLogin] = useState(false);



  if (loading || needsSetup || (user && !access.ready)) {
    return (
      <div className="flex h-screen items-center justify-center bg-canvas">
        <div className="h-1 w-24 overflow-hidden rounded-full bg-line"><div className="h-full w-1/3 animate-pulse rounded-full bg-primary" /></div>
      </div>
    );
  }
  const page = allowed ? children : <NoAccess />;
  if (embedded) return <div className="min-h-screen bg-canvas p-4 lg:p-6">{page}</div>;

  const sub = user?.subscription;
  const trialLeft = sub?.status === "trial" ? Math.max(0, sub.days_left ?? 0) : null;
  const roleLabel = access.isOwner ? "Owner" : ({ admin: "HR admin", hr: "HR", manager: "Manager", employee: "Employee" } as Record<string, string>)[user?.role || ""] ?? (user?.role || "");

  /* ── Rail ─────────────────────────────────────────── */
  const railButton = (s: HrSection) => {
    const active = routeSection?.key === s.key;
    const Icon = s.icon;
    return (
      <Link
        key={s.key}
        href={s.pages[0].href}
        aria-current={active ? "page" : undefined}
        title={s.label}
        className={`group flex w-full flex-col items-center gap-1 rounded-xl py-2 text-[10.5px] transition-colors
          ${active ? "bg-white/[0.09] text-white" : "text-rail-ink hover:bg-white/[0.05] hover:text-white"}`}
      >
        <Icon size={20} strokeWidth={STROKE} />
        <span className="leading-none">{s.label}</span>
      </Link>
    );
  };

  const rail = (
    <div className="flex h-full w-[76px] shrink-0 flex-col items-center bg-rail px-2 py-3">
      <Link href="/dashboard" className="mb-4 flex h-10 w-10 items-center justify-center" aria-label="Home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-small.svg" alt="Campusly" className="h-9 w-9" />
      </Link>
      <nav className="hr-scroll flex w-full flex-1 flex-col gap-1 overflow-y-auto" aria-label="Sections">
        {mainSections.map(railButton)}
      </nav>
      <div className="flex w-full flex-col gap-1 pt-2">
        {adminSection && railButton(adminSection)}
      </div>
    </div>
  );

  /* ── Section panel ────────────────────────────────── */
  const panel = panelSection && (
    <div className="flex h-full w-[232px] shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex h-14 shrink-0 items-center justify-between px-4">
        <p className="text-[15px] font-normal text-ink">{panelSection.label}</p>
        <button onClick={togglePanel} className="hidden h-8 w-8 items-center justify-center rounded-lg text-faint hover:bg-sunken hover:text-ink lg:flex" title="Hide panel" aria-label="Hide panel">
          <PanelLeftClose size={17} strokeWidth={STROKE} />
        </button>
        <button onClick={() => setDrawer(false)} className="flex h-8 w-8 items-center justify-center rounded-lg text-faint hover:bg-sunken lg:hidden" aria-label="Close menu">
          <X size={18} strokeWidth={STROKE} />
        </button>
      </div>
      <nav className="hr-scroll flex-1 overflow-y-auto px-2.5 pb-3" aria-label={panelSection.label}>
        <ul className="space-y-px">
          {panelSection.pages.map((p) => {
            const active = current?.href === p.href;
            const Icon = p.icon;
            return (
              <li key={p.href}>
                <Link
                  href={p.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-9 items-center gap-3 rounded-lg px-2.5 text-[14px] transition-colors
                    ${active ? "bg-primary-soft text-primary" : "text-muted hover:bg-sunken hover:text-ink"}`}
                >
                  <Icon size={17} strokeWidth={STROKE} className="shrink-0" />
                  <span className="truncate">{p.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {trialLeft !== null && isAdmin && (
        <Link href="/dashboard/subscription" className="mx-3 mb-2 rounded-xl border border-line bg-sunken px-3 py-2.5 hover:border-primary/40">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-ink">Free trial</span>
            <span className="tabular text-muted">{trialLeft} {trialLeft === 1 ? "day" : "days"} left</span>
          </div>
          <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (trialLeft / 30) * 100)}%` }} />
          </div>
        </Link>
      )}

      {/* Company */}
      {user?.company_name && (
        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-[13px] text-primary">
            {user.company_name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] text-ink">{user.company_name}</p>
            <p className="truncate text-[11.5px] text-faint">{roleLabel}</p>
          </div>
        </div>
      )}
    </div>
  );

  /* ── Header ───────────────────────────────────────── */
  const iconBtn = "relative flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-sunken hover:text-ink";
  const popover = "absolute right-0 top-11 z-50 rounded-xl border border-line bg-surface py-1.5 shadow-lg";

  const header = (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 lg:px-5">
      <button onClick={() => setDrawer(true)} className={`${iconBtn} lg:hidden`} aria-label="Open menu"><Menu size={19} strokeWidth={STROKE} /></button>
      {!panelOpen && (
        <button onClick={togglePanel} className={`${iconBtn} hidden lg:flex`} title="Show panel" aria-label="Show panel"><PanelLeftOpen size={17} strokeWidth={STROKE} /></button>
      )}

      {/* Breadcrumb */}
      <div className="flex min-w-0 items-center gap-2 text-[14px]">
        {current ? (
          <>
            <span className="hidden text-faint sm:inline">{current.section.label}</span>
            <span className="hidden text-line-strong sm:inline">/</span>
            <span className="truncate text-ink">{current.label}</span>
          </>
        ) : <span className="text-ink">Campusly</span>}
      </div>

      <div className="flex flex-1 justify-center"><UniversalSearch /></div>

      <div className="flex items-center gap-1">
        <Link href="/dashboard/assistant" className="hidden h-9 items-center gap-2 rounded-lg border border-line px-3 text-[13.5px] text-ink transition-colors hover:border-primary/40 hover:text-primary md:flex">
          <Sparkles size={16} strokeWidth={STROKE} className="text-primary" /> Ask
        </Link>

        <div ref={createRef} className="relative">
          <button onClick={() => setMenu(menu === "create" ? null : "create")} className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[13.5px] text-white transition-colors hover:bg-primary-dark" aria-haspopup="menu" aria-expanded={menu === "create"}>
            <Plus size={16} strokeWidth={1.8} /> <span className="hidden sm:inline">Create</span>
          </button>
          {menu === "create" && (
            <div className={`${popover} w-56`} role="menu">
              {CREATE_ACTIONS.filter((a) => (a.self ? access.hasEmployee : !a.need || access.can(...a.need))).map((a) => (
                <Link key={a.label} href={a.href} onClick={closeMenu} role="menuitem" className="flex items-center gap-3 px-3.5 py-2 text-[14px] text-ink hover:bg-sunken">
                  <a.icon size={16} strokeWidth={STROKE} className="text-muted" /> {a.label}
                </Link>
              ))}
            </div>
          )}
        </div>

        <NotificationBell className={iconBtn} />

        <button onClick={() => setHelp(true)} className={`${iconBtn} hidden sm:flex`} aria-label="Help"><HelpCircle size={18} strokeWidth={STROKE} /></button>
        <AvatarToggle on={avatarOn} busy={avatarOn && !avatarReady} onToggle={() => { setAvatarReady(false); setAvatarAutoPlay(!avatarOn); setAvatarOn(!avatarOn); }} className="hidden sm:flex" />

        <div ref={langRef} className="relative hidden sm:block">
          <button onClick={() => setMenu(menu === "lang" ? null : "lang")} className={iconBtn} aria-label="Language" title="Language"><Languages size={18} strokeWidth={STROKE} /></button>
          {menu === "lang" && (
            <div className={`${popover} w-48`}>
              {LANGUAGES.map((l) => (
                <button key={l.code} onClick={() => { setLocale(l.code as Locale); closeMenu(); }}
                  className={`flex w-full items-center justify-between px-3.5 py-2 text-[14px] hover:bg-sunken ${locale === l.code ? "text-primary" : "text-ink"}`}>
                  <span>{l.nativeLabel}</span><span className="text-[12px] text-faint">{l.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div ref={profileRef} className="relative ml-1">
          <button onClick={() => setMenu(menu === "profile" ? null : "profile")} className="flex items-center gap-1.5 rounded-lg p-1 hover:bg-sunken" aria-label="Account">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[12px] text-white">{initials(user?.full_name)}</span>
            <ChevronDown size={14} strokeWidth={STROKE} className="hidden text-faint sm:block" />
          </button>
          {menu === "profile" && (
            <div className={`${popover} w-64 py-0`}>
              <div className="border-b border-line px-4 py-3.5">
                <p className="truncate text-[14px] text-ink">{user?.full_name}</p>
                <p className="truncate text-[12.5px] text-faint">{user?.email}</p>
              </div>
              <div className="py-1.5">
                <Link href="/dashboard/profile" onClick={closeMenu} className="flex items-center gap-3 px-4 py-2 text-[14px] text-ink hover:bg-sunken"><User size={16} strokeWidth={STROKE} className="text-muted" /> My profile</Link>
                {access.can("settings.company.manage") && <Link href="/dashboard/settings" onClick={closeMenu} className="flex items-center gap-3 px-4 py-2 text-[14px] text-ink hover:bg-sunken"><Settings2 size={16} strokeWidth={STROKE} className="text-muted" /> Company settings</Link>}
                <button onClick={() => { closeMenu(); setMobileLogin(true); }} className="flex w-full items-center gap-3 px-4 py-2 text-[14px] text-ink hover:bg-sunken"><Smartphone size={16} strokeWidth={STROKE} className="text-muted" /> Log in on mobile</button>
              </div>
              <div className="border-t border-line py-1.5">
                <button onClick={() => { closeMenu(); logout(); }} className="flex w-full items-center gap-3 px-4 py-2 text-[14px] text-red-600 hover:bg-red-50"><LogOut size={16} strokeWidth={STROKE} /> Sign out</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-canvas">
      {/* Desktop navigation */}
      <aside className="hidden h-full lg:flex">
        {rail}
        {panelOpen && panel}
      </aside>

      {/* Phone/tablet drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="flex h-full">{rail}{panel}</div>
          <button className="flex-1 bg-ink/30" aria-label="Close menu" onClick={() => setDrawer(false)} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        {impersonating && (
          <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-5 py-2 text-[13px] text-amber-800">
            <span>Viewing as {user?.company_name}</span>
            <button onClick={switchBack} className="flex items-center gap-1 rounded-md border border-amber-300 px-2.5 py-1 hover:bg-white"><ChevronLeft size={14} /> Back to admin</button>
          </div>
        )}
        {sub && (sub.status === "grace" || sub.status === "expired") && isAdmin && (
          <div className={`flex items-center justify-between gap-3 border-b px-5 py-2 text-[13px] ${sub.status === "expired" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            <span>{sub.status === "grace" ? `Your trial has ended. Everything keeps working for ${sub.days_left ?? 0} more day${sub.days_left === 1 ? "" : "s"}.` : "Your trial has ended. Choose a plan to keep using every module."}</span>
            <Link href="/dashboard/subscription" className="rounded-md border border-current/20 px-2.5 py-1 hover:bg-white">View plans</Link>
          </div>
        )}
        <main className="hr-scroll flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1280px] px-4 py-6 lg:px-8 lg:py-8">{page}</div>
        </main>
      </div>

      <HelpPortal open={help} onClose={() => setHelp(false)} initial={help ? topicForPath(pathname) : undefined} />
      <MobileLoginModal open={mobileLogin} onClose={() => setMobileLogin(false)} />
      {avatarOn && <TalkingAvatar size={84} autoPlay={avatarAutoPlay} onReady={setAvatarReady} onHide={() => { setAvatarReady(false); setAvatarOn(false); }} hint={`Hi ${user?.full_name?.split(" ")[0] ?? "there"}! Tap me for a quick tour.`}
        text={`Hello ${user?.full_name?.split(" ")[0] ?? ""}, welcome to Campusly. Use the dark bar on the left to move between sections: Home, People, Time, Talent, Engage and Insights. ` +
          "Click a section to see its pages. Apply for leave, check your payslips and approve requests from your inbox. " +
          "Use Create at the top for quick actions, and Ask to get answers in plain words. Have a great day!"} />}
    </div>
  );
}
