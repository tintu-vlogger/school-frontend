/*
 * Badge: small status label.  <Badge tone="good" dot>Active</Badge>
 * Tones: neutral | accent | good | warn | bad | info. `dot` adds a leading status dot.
 * Chip: a removable tag (filters, multi-select values).  <Chip onRemove={...}>Finance</Chip>
 */
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cx } from "./internal";

export type BadgeTone = "neutral" | "accent" | "good" | "warn" | "bad" | "info";

const tones: Record<BadgeTone, { box: string; dot: string }> = {
  neutral: { box: "border-line-strong/80 bg-sunken/60 text-muted", dot: "bg-faint" },
  accent: { box: "border-primary/20 bg-primary-soft/60 text-primary", dot: "bg-primary" },
  good: { box: "border-emerald-200 bg-emerald-50/70 text-emerald-700", dot: "bg-emerald-500" },
  warn: { box: "border-amber-200 bg-amber-50/70 text-amber-700", dot: "bg-amber-500" },
  bad: { box: "border-rose-200 bg-rose-50/70 text-rose-700", dot: "bg-rose-500" },
  info: { box: "border-sky-200 bg-sky-50/70 text-sky-700", dot: "bg-sky-500" },
};

export function Badge({ children, tone = "neutral", dot, className }: { children: ReactNode; tone?: BadgeTone; dot?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-[12px] font-normal leading-none", tones[tone].box, className)}>
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", tones[tone].dot)} />}
      {children}
    </span>
  );
}

export function Chip({ children, onRemove, className }: { children: ReactNode; onRemove?: () => void; className?: string }) {
  return (
    <span className={cx("inline-flex h-6 max-w-full items-center gap-1 rounded-md border border-line bg-sunken pl-2 text-[12.5px] text-ink", onRemove ? "pr-0.5" : "pr-2", className)}>
      <span className="truncate">{children}</span>
      {onRemove && (
        <button type="button" aria-label="Remove" onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="rounded p-0.5 text-faint transition-colors hover:bg-line hover:text-ink">
          <X size={12} strokeWidth={1.6} />
        </button>
      )}
    </span>
  );
}
