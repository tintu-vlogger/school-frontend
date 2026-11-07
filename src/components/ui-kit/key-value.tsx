/*
 * KeyValue: a grid of label / value pairs for detail views.
 *   <KeyValue columns={2} items={[{ label: "Email", value: emp.email }, { label: "Address", value: addr, span: 2 }]} />
 * Empty values show a faint "Not set".
 */
import type { ReactNode } from "react";
import { cx } from "./internal";

export type KeyValueItem = { label: ReactNode; value: ReactNode; span?: 1 | 2 | 3 };

export function KeyValue({ items, columns = 2, className }: { items: KeyValueItem[]; columns?: 1 | 2 | 3; className?: string }) {
  const cols = columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
  return (
    <dl className={cx("grid gap-x-8 gap-y-5", cols, className)}>
      {items.map((it, i) => (
        <div key={i} className={cx("min-w-0", it.span === 2 && "sm:col-span-2", it.span === 3 && "sm:col-span-2 lg:col-span-3")}>
          <dt className="text-[12px] uppercase tracking-[0.06em] text-faint">{it.label}</dt>
          <dd className="mt-1 break-words text-[14px] text-ink">
            {it.value === null || it.value === undefined || it.value === "" ? <span className="text-faint">Not set</span> : it.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A titled group inside a detail view. */
export function Section({ title, description, action, children, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("py-6 first:pt-0 last:pb-0", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-normal text-ink">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
