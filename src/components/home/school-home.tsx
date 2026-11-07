"use client";

/*
 * School home page sections.
 *   <PortalHome />        parents and students: greeting, child switcher (GET /students/mine)
 *                         and each module's PortalHomeCard({ studentId })
 *   <SchoolStaffHome />   staff: institution KPI strip, a set-up reminder for administrators
 *                         and each module's StaffHomeCard, filtered by the modules switched on
 *                         and the person's permissions. The HR cards follow below it.
 * Module cards come from src/components/<module>/home-cards.tsx through module-cards.tsx.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, GraduationCap, Layers, Sparkles, UserPlus, Users } from "lucide-react";
import { Avatar, Skeleton } from "@/components/ui-kit";
import { useAccess } from "@/lib/access";
import { useAuth } from "@/lib/auth";
import { useInstitution } from "@/lib/institution";
import { resolveImageUrl } from "@/lib/api";
import { HomeGreeting } from "./extras";
import { HOME_STYLES, STROKE, useLoad } from "./kit";
import { HOME_MODULES, ModuleCard } from "./module-cards";

/* ── Parents and students ─────────────────────────────────────────── */

type Child = {
  id: number; uuid: string; name: string; first_name: string; photo_url: string | null;
  section_label: string | null; program_name: string | null; roll_no: string | null; admission_no: string;
};

const CHILD_KEY = "campusly_child";

export function PortalHome() {
  const { user } = useAuth();
  const { modules, term } = useInstitution();
  const { data: kids, loading } = useLoad<Child[]>("/students/mine", 120);
  const [picked, setPicked] = useState<number | null>(null);

  useEffect(() => {
    if (!kids?.length) return;
    let saved: number | null = null;
    try { saved = Number(localStorage.getItem(CHILD_KEY)) || null; } catch { /* storage blocked */ }
    setPicked((p) => (p && kids.some((k) => k.id === p) ? p : saved && kids.some((k) => k.id === saved) ? saved : kids[0].id));
  }, [kids]);

  const pick = (id: number) => {
    setPicked(id);
    try { localStorage.setItem(CHILD_KEY, String(id)); } catch { /* storage blocked */ }
  };

  const child = kids?.find((k) => k.id === picked) ?? null;
  const isParent = user?.role === "parent";
  const cards = HOME_MODULES.filter((m) => !m.module || modules[m.module] !== false);

  return (
    <div className="space-y-5 pb-8">
      <style>{HOME_STYLES}</style>
      <HomeGreeting />

      {loading && !kids ? (
        <Skeleton className="h-16 w-full rounded-2xl" />
      ) : !kids?.length ? (
        <div className="home-rise rounded-2xl border border-line bg-surface px-6 py-10 text-center">
          <GraduationCap size={28} strokeWidth={STROKE} className="mx-auto text-faint" />
          <p className="mt-3 text-[15px] text-ink">
            {isParent ? `No ${term("students").toLowerCase()} are linked to your account yet` : "Your record is not linked yet"}
          </p>
          <p className="mt-1 text-[13.5px] text-muted">Please contact the institution&apos;s office; they can link it in a minute.</p>
        </div>
      ) : (
        <>
          {isParent && kids.length > 1 && (
            <div role="tablist" aria-label={`Choose a ${term("student").toLowerCase()}`} className="home-rise -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" style={{ animationDelay: "40ms" }}>
              {kids.map((k) => {
                const on = k.id === picked;
                return (
                  <button key={k.id} role="tab" aria-selected={on} onClick={() => pick(k.id)}
                    className={`flex shrink-0 items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-4 text-left transition-colors ${on ? "border-primary/50 bg-primary-soft" : "border-line bg-surface hover:border-line-strong"}`}>
                    <Avatar name={k.name} src={k.photo_url ? resolveImageUrl(k.photo_url) : undefined} size={32} />
                    <span className="min-w-0">
                      <span className={`block text-[14px] leading-tight ${on ? "text-ink" : "text-muted"}`}>{k.first_name || k.name}</span>
                      {k.section_label && <span className="block text-[11.5px] leading-tight text-faint">{k.section_label}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {child && (
            <div key={child.id} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {cards.map((m) => (
                <ModuleCard key={`${m.dir}:${child.id}`} dir={m.dir} kind="portal" studentId={child.id} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ── Staff ─────────────────────────────────────────────────────────── */

type StudentStats = { active: number; new_this_month: number; guardians: number };
type Overview = { session: string | null; programs: number; sections: number; subjects: number };
type EmpStats = { active: number };

function InstitutionKpis({ delay = 0 }: { delay?: number }) {
  const { can, ready } = useAccess();
  const { term, profile } = useInstitution();
  const students = useLoad<StudentStats>(ready && can("students.view") ? "/students/stats" : null, 60);
  const overview = useLoad<Overview>(ready && can("academics.view", "academics.manage") ? "/academics/overview" : null, 120);
  const staff = useLoad<EmpStats>(ready && can("people.employees.view") ? "/employees/stats" : null, 120);

  const tiles = [
    can("students.view") && { label: `${term("students")} enrolled`, value: students.data?.active, loading: students.loading, href: "/dashboard/students", icon: GraduationCap,
      hint: students.data?.new_this_month ? `${students.data.new_this_month} joined this month` : undefined },
    can("students.view") && { label: term("guardians"), value: students.data?.guardians, loading: students.loading, href: "/dashboard/students", icon: Users },
    can("people.employees.view") && { label: "Staff", value: staff.data?.active, loading: staff.loading, href: "/dashboard/staff", icon: UserPlus },
    can("academics.view", "academics.manage") && { label: term("programs"), value: overview.data?.programs, loading: overview.loading, href: "/dashboard/academics", icon: Layers,
      hint: overview.data ? `${overview.data.sections} ${term("sections").toLowerCase()}` : undefined },
    can("academics.view", "academics.manage") && { label: term("subjects"), value: overview.data?.subjects, loading: overview.loading, href: "/dashboard/academics", icon: BookOpen,
      hint: overview.data?.session || profile?.current_session?.name || undefined },
  ].filter(Boolean) as { label: string; value?: number; loading: boolean; href: string; icon: typeof Users; hint?: string }[];

  if (!ready) return <Skeleton className="h-[104px] w-full rounded-2xl" />;
  if (!tiles.length) return null;
  return (
    <div className="home-rise grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 xl:grid-cols-5 [&>*]:bg-surface" style={{ gap: 1, animationDelay: `${delay}ms` }}>
      {tiles.map((t) => (
        <Link key={t.label} href={t.href} className="group flex min-w-0 flex-col justify-between gap-3 px-4 py-4 transition-colors hover:bg-sunken/60">
          <span className="flex items-center justify-between gap-2">
            <span className="truncate text-[12px] text-muted">{t.label}</span>
            <t.icon size={15} strokeWidth={STROKE} className="shrink-0 text-faint group-hover:text-primary" />
          </span>
          <span>
            {t.loading && t.value === undefined ? <Skeleton className="h-8 w-14" /> : (
              <span className="tabular block text-[30px] font-extralight leading-none tracking-tight text-ink">{t.value ?? "—"}</span>
            )}
            <span className="mt-1.5 block min-h-[16px] truncate text-[12px] text-faint">{t.hint ?? ""}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

/** Administrators who skipped part of the set-up get a gentle way back to it. */
function SetupReminder() {
  const { user } = useAuth();
  const admin = user?.role === "admin";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const co = useLoad<any>(admin ? "/company/profile" : null, 300);
  const ob = co.data?.config?.onboarding as { completed?: string[]; finished?: boolean } | undefined;
  if (!admin || !co.data) return null;
  const done = (ob?.completed ?? []).filter((k) => k !== "done").length;
  if (ob?.finished && done >= 4) return null;
  if (!ob && co.data?.config?.institution?.modules) return null; // set up before onboarding existed
  return (
    <Link href="/onboarding" className="home-rise group flex items-center gap-4 rounded-2xl border border-primary/25 bg-primary-soft/50 px-5 py-4 transition-colors hover:border-primary/50">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-primary ring-1 ring-primary/20">
        <Sparkles size={18} strokeWidth={STROKE} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] text-ink">Finish setting up your institution</span>
        <span className="block text-[13px] text-muted">{done} of 4 steps done: details, academic set-up, modules and staff.</span>
      </span>
      <ArrowRight size={17} strokeWidth={1.5} className="shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function SchoolStaffHome() {
  const { modules } = useInstitution();
  const { ready, isAdmin, permissions } = useAccess();

  const visible = useMemo(() => {
    if (!ready) return [];
    const perms = Array.from(permissions);
    return HOME_MODULES.filter((m) =>
      (!m.module || modules[m.module] !== false) &&
      (isAdmin || perms.some((p) => p.startsWith(`${m.perm}.`) && !p.startsWith(`${m.perm}.portal`))));
  }, [ready, modules, isAdmin, permissions]);

  return (
    <div className="space-y-4">
      <SetupReminder />
      <InstitutionKpis delay={50} />
      {visible.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((m) => <ModuleCard key={m.dir} dir={m.dir} kind="staff" />)}
        </div>
      )}
    </div>
  );
}
