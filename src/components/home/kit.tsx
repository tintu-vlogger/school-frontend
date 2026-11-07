"use client";

/*
 * Building blocks for the Overview (home) page.
 *   const { data, loading, error, reload } = useLoad<T>(enabled ? "/path" : null);
 *   const access = useHomeAccess();            // permissions, employee record, manager flag
 *   <HomeCard title="…" icon={Plane} href="/dashboard/leave" link="All leave" className="lg:col-span-8">…</HomeCard>
 *   <Sparkline values={[3, 5, 4, 8]} />  <Ring value={0.62} />  <MiniBars items={[{ label, value }]} />
 * Every section loads on its own; a failing call only empties that card.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Skeleton } from "@/components/ui-kit";

export const STROKE = 1.4;

/* ── Data ─────────────────────────────────────────────────────────── */

export function useLoad<T>(path: string | null, ttl = 20) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: boolean }>({ data: null, loading: !!path, error: false });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path) { setState({ data: null, loading: false, error: false }); return; }
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    api.getCached<T>(path, ttl)
      .then((data) => live && setState({ data, loading: false, error: false }))
      .catch(() => live && setState({ data: null, loading: false, error: true }));
    return () => { live = false; };
  }, [path, ttl, nonce]);
  const reload = useCallback(() => { if (path) api.invalidate(path); setNonce((n) => n + 1); }, [path]);
  return { ...state, reload };
}

export type HomeAccess = {
  ready: boolean;
  perms: Set<string>;
  can: (p: string) => boolean;
  isEmployee: boolean;
  isManager: boolean;
  isHr: boolean;
  canSeeAttendance: boolean;
};

type AttAccess = { employee_id: number | null; can_manage: boolean; team_size: number };

export function useHomeAccess(): HomeAccess {
  const { user } = useAuth();
  const perms = useLoad<{ role: string; permissions: string[] }>("/roles/my-permissions", 300);
  const att = useLoad<AttAccess>("/attendance/me/access", 300);
  const set = new Set(perms.data?.permissions ?? []);
  const can = (p: string) => set.has(p);
  const isHr = can("people.employees.view") && (can("people.employees.manage") || can("time.attendance.manage") || can("payroll.view"));
  return {
    ready: !perms.loading && !att.loading,
    perms: set,
    can,
    isEmployee: !!user?.employee_uuid,
    isManager: (att.data?.team_size ?? 0) > 0,
    isHr,
    canSeeAttendance: can("time.attendance.view"),
  };
}

/* ── Surfaces ─────────────────────────────────────────────────────── */

export function HomeCard({
  title, icon: Icon, href, link, action, children, className = "", bodyClass = "", delay = 0,
}: {
  title: ReactNode; icon?: LucideIcon; href?: string; link?: string; action?: ReactNode; children: ReactNode;
  className?: string; bodyClass?: string; delay?: number;
}) {
  return (
    <section className={`home-rise flex min-w-0 flex-col rounded-2xl border border-line bg-surface ${className}`} style={{ animationDelay: `${delay}ms` }}>
      <header className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
        <h2 className="flex min-w-0 items-center gap-2 text-[14.5px] font-normal text-ink">
          {Icon && <Icon size={16} strokeWidth={STROKE} className="shrink-0 text-primary" />}
          <span className="truncate">{title}</span>
        </h2>
        {action ?? (href && link && (
          <Link href={href} className="group flex shrink-0 items-center gap-0.5 text-[12.5px] text-muted transition-colors hover:text-primary">
            {link} <ChevronRight size={13} strokeWidth={STROKE} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </header>
      <div className={`flex flex-1 flex-col ${bodyClass}`}>{children}</div>
    </section>
  );
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 px-5 py-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-3/5" /><Skeleton className="h-2.5 w-2/5" /></div>
        </div>
      ))}
    </div>
  );
}

export function Quiet({ children, icon: Icon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-8 text-center text-[13px] text-faint">
      {Icon && <Icon size={22} strokeWidth={1.2} />}
      <span>{children}</span>
    </div>
  );
}

export function Unavailable() {
  return <Quiet>Couldn&apos;t load this right now.</Quiet>;
}

/* ── Tiny charts (SVG) ────────────────────────────────────────────── */

export function Sparkline({ values, width = 96, height = 28, className = "text-primary", fill = true }: {
  values: number[]; width?: number; height?: number; className?: string; fill?: boolean;
}) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - pad - ((v - min) / span) * (height - pad * 2),
  ] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const [lx, ly] = pts[pts.length - 1];
  const id = `sg${Math.abs(values.reduce((a, v, i) => a + v * (i + 7), 0)).toFixed(0)}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={`overflow-visible ${className}`} aria-hidden>
      {fill && (
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.16" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
      )}
      {fill && <path d={area} fill={`url(#${id})`} />}
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" className="home-draw" />
      <circle cx={lx} cy={ly} r="2.2" fill="currentColor" />
    </svg>
  );
}

/** A thin progress ring; value 0..1. */
export function Ring({ value, size = 44, stroke = 3, className = "text-primary", children }: {
  value: number; size?: number; stroke?: number; className?: string; children?: ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <span className={`relative inline-flex shrink-0 items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hr-line)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: "stroke-dashoffset 600ms ease-out" }} />
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  );
}

/** Horizontal bars with labels; the longest fills the row. */
export function MiniBars({ items, max: maxIn }: { items: { label: string; value: number; hint?: string }[]; max?: number }) {
  const max = Math.max(1, maxIn ?? Math.max(...items.map((i) => i.value)));
  return (
    <ul className="space-y-2.5">
      {items.map((it, i) => (
        <li key={it.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate text-muted">{it.label}</span>
            <span className="tabular shrink-0 text-ink">{it.value}{it.hint && <span className="ml-1 text-faint">{it.hint}</span>}</span>
          </div>
          <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-sunken">
            <div className="home-grow h-full rounded-full bg-primary/80" style={{ width: `${(it.value / max) * 100}%`, animationDelay: `${i * 40}ms` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Stacked segment bar, e.g. present / remote / leave / absent. */
export function SegmentBar({ parts }: { parts: { value: number; className: string; label: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-sunken" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(", ")}>
      {parts.filter((p) => p.value > 0).map((p) => (
        <span key={p.label} className={`home-grow h-full ${p.className}`} style={{ width: `${(p.value / total) * 100}%` }} />
      ))}
    </div>
  );
}

/* Page-level motion: a short rise for cards, a line draw for sparklines. Reduced motion turns it off. */
export const HOME_STYLES = `
@keyframes home-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes home-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes home-draw { from { stroke-dashoffset: 400; } to { stroke-dashoffset: 0; } }
.home-rise { animation: home-rise 420ms cubic-bezier(.2,.7,.2,1) both; }
.home-grow { transform-origin: left; animation: home-grow 700ms cubic-bezier(.2,.7,.2,1) both; }
.home-draw { stroke-dasharray: 400; animation: home-draw 900ms ease-out both; }
@media (prefers-reduced-motion: reduce) { .home-rise, .home-grow, .home-draw { animation: none; } }
`;
