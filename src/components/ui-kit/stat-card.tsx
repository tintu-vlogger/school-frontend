/*
 * StatCard: one number with a label, optional icon, hint and trend.
 *   <StatCard label="Headcount" value={128} icon={Users} trend={{ value: "+4", direction: "up", good: true }} hint="vs last month" />
 * Pass onClick to make the whole card a button. Group them in a grid (or <StatGrid>).
 */
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import { cx, ICON_STROKE } from "./internal";
import type { IconType } from "./button";

export type StatTrend = { value: string; direction: "up" | "down" | "flat"; good?: boolean };

export function StatCard({ label, value, hint, icon: Icon, trend, onClick, className }: {
  label: string; value: ReactNode; hint?: ReactNode; icon?: IconType; trend?: StatTrend; onClick?: () => void; className?: string;
}) {
  const TrendIcon = trend?.direction === "up" ? ArrowUpRight : trend?.direction === "down" ? ArrowDownRight : ArrowRight;
  const trendTone = !trend || trend.direction === "flat" ? "text-muted" : trend.good ?? trend.direction === "up" ? "text-emerald-700" : "text-rose-700";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} onClick={onClick}
      className={cx("flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 text-left", onClick && "transition-colors hover:border-line-strong", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-muted">{label}</span>
        {Icon && <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sunken text-muted"><Icon size={16} strokeWidth={ICON_STROKE} /></span>}
      </div>
      <p className="tabular text-[30px] font-extralight leading-none tracking-tight text-ink">{value}</p>
      {(trend || hint) && (
        <div className="flex items-center gap-2 text-[12.5px]">
          {trend && <span className={cx("inline-flex items-center gap-0.5", trendTone)}><TrendIcon size={14} strokeWidth={ICON_STROKE} />{trend.value}</span>}
          {hint && <span className="text-faint">{hint}</span>}
        </div>
      )}
    </Tag>
  );
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>;
}
