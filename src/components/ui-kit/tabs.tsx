"use client";

/*
 * Tabs: a row of tab buttons with an animated indicator. You render the panel yourself.
 *   const [tab, setTab] = useState("overview");
 *   <Tabs value={tab} onChange={setTab} items={[{ value: "overview", label: "Overview" }, { value: "leave", label: "Leave", count: 3 }]} />
 *   {tab === "overview" && <Overview />}
 * variant: "line" (underline, default; for pages and modal headers) | "pill" (segmented, for compact toggles).
 * Keyboard: Left/Right/Home/End move between tabs.
 */
import { useId, useRef, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cx, ICON_STROKE } from "./internal";
import type { IconType } from "./button";

export type TabItem<T extends string = string> = { value: T; label: string; icon?: IconType; count?: number; disabled?: boolean };

export type TabsProps<T extends string = string> = {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  variant?: "line" | "pill";
  className?: string;
};

export function Tabs<T extends string = string>({ items, value, onChange, variant = "line", className }: TabsProps<T>) {
  const group = useId();
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKey(e: KeyboardEvent, i: number) {
    const enabled = items.map((t, j) => (t.disabled ? -1 : j)).filter((j) => j >= 0);
    const pos = enabled.indexOf(i);
    let next: number | undefined;
    if (e.key === "ArrowRight") next = enabled[(pos + 1) % enabled.length];
    else if (e.key === "ArrowLeft") next = enabled[(pos - 1 + enabled.length) % enabled.length];
    else if (e.key === "Home") next = enabled[0];
    else if (e.key === "End") next = enabled[enabled.length - 1];
    if (next === undefined) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(items[next].value);
  }

  const line = variant === "line";
  return (
    <div role="tablist" className={cx(line ? "flex gap-6 border-b border-line" : "inline-flex gap-0.5 rounded-lg border border-line bg-sunken p-0.5", "overflow-x-auto hr-scroll", className)}>
      {items.map((t, i) => {
        const active = t.value === value;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            ref={(el) => { refs.current[i] = el; }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              "relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap text-[14px] transition-colors disabled:opacity-40",
              line ? "h-10 px-0.5" : "h-8 rounded-md px-3 text-[13.5px]",
              active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {!line && active && (
              <motion.span layoutId={`${group}-pill`} transition={{ duration: reduce ? 0 : 0.18 }}
                className="absolute inset-0 rounded-md border border-line bg-surface shadow-[0_1px_2px_rgb(27_27_34/0.05)]" />
            )}
            <span className="relative inline-flex items-center gap-2">
              {Icon && <Icon size={15} strokeWidth={ICON_STROKE} />}
              {t.label}
              {t.count !== undefined && (
                <span className={cx("rounded-full px-1.5 text-[11.5px] leading-[18px] tabular", active ? "bg-primary-soft text-primary" : "bg-sunken text-muted")}>{t.count}</span>
              )}
            </span>
            {line && active && (
              <motion.span layoutId={`${group}-line`} transition={{ duration: reduce ? 0 : 0.18 }}
                className="absolute inset-x-0 -bottom-px h-[1.5px] rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}
