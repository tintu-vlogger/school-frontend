/*
 * Skeleton placeholders for loading states.
 *   <Skeleton className="h-4 w-40" />   <SkeletonText lines={3} />
 */
import { cx } from "./internal";

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx("block animate-pulse rounded-md bg-[color-mix(in_srgb,var(--hr-line)_70%,transparent)]", className)} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx("space-y-2", className)}>
      {Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={cx("h-3", i === lines - 1 ? "w-3/5" : "w-full")} />)}
    </div>
  );
}
