/*
 * Page building blocks for the tenant app. Flat paper: white sheets with a hairline
 * border on a warm canvas, no shadows, light type.
 */
import type { ElementType, ReactNode } from "react";

export function PageHeader({
  title, description, actions, eyebrow,
}: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[12px] uppercase tracking-[0.08em] text-faint">{eyebrow}</p>}
        <h1 className="text-[26px] font-light leading-tight text-ink [text-wrap:balance]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[14.5px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Paper({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: ElementType }) {
  return <Tag className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</Tag>;
}

export function PaperHeader({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
      <p className="text-[15px] text-ink">{title}</p>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint, action }: { icon?: ElementType; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {Icon && <Icon size={26} strokeWidth={1.2} className="mb-3 text-faint" />}
      <p className="text-[14.5px] text-ink">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-[13.5px] text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ElementType }) {
  return (
    <div className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between text-[13px] text-muted">
        <span>{label}</span>
        {Icon && <Icon size={17} strokeWidth={1.3} className="text-faint" />}
      </div>
      <p className="tabular text-[32px] font-extralight leading-none text-ink">{value}</p>
      {hint && <p className="text-[12.5px] text-faint">{hint}</p>}
    </div>
  );
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "good" | "warn" | "bad" }) {
  const tones = {
    neutral: "border-line-strong text-muted",
    accent: "border-primary/30 text-primary",
    good: "border-emerald-300 text-emerald-700",
    warn: "border-amber-300 text-amber-700",
    bad: "border-rose-300 text-rose-700",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] ${tones[tone]}`}>{children}</span>;
}

export const btn = {
  primary: "inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-[14px] text-white transition-colors hover:bg-primary-dark disabled:opacity-40",
  ghost: "inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-[14px] text-ink transition-colors hover:border-line-strong",
};
