/*
 * Timeline: a vertical list of events (history, approvals, audit trail).
 *   <Timeline items={[{ id: 1, title: "Joined", time: "12 Mar 2024", description: "...", tone: "good", icon: UserPlus }]} />
 * Tones colour the dot: neutral | accent | good | warn | bad.
 */
import type { ReactNode } from "react";
import { cx, ICON_STROKE } from "./internal";
import type { IconType } from "./button";

export type TimelineItem = {
  id: string | number;
  title: ReactNode;
  description?: ReactNode;
  time?: ReactNode;
  icon?: IconType;
  tone?: "neutral" | "accent" | "good" | "warn" | "bad";
};

const dot = {
  neutral: "border-line-strong bg-surface text-muted",
  accent: "border-primary/30 bg-primary-soft text-primary",
  good: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  bad: "border-rose-200 bg-rose-50 text-rose-700",
};

export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cx("relative", className)}>
      {items.map((it, i) => {
        const Icon = it.icon;
        return (
          <li key={it.id} className="relative flex gap-4 pb-6 last:pb-0">
            {i < items.length - 1 && <span aria-hidden className="absolute left-[13px] top-8 bottom-1 w-px bg-line" />}
            <span className={cx("relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full border", dot[it.tone ?? "neutral"])}>
              {Icon ? <Icon size={13} strokeWidth={ICON_STROKE} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            </span>
            <div className="min-w-0 flex-1 pt-[3px]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-[14px] text-ink">{it.title}</p>
                {it.time && <span className="text-[12px] text-faint tabular">{it.time}</span>}
              </div>
              {it.description && <div className="mt-0.5 text-[13px] leading-5 text-muted">{it.description}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
