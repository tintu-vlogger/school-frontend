import type { ElementType } from "react";
import { PageHeader, Paper, Chip } from "@/components/shell/page";

/** Page for a module that is planned but not built yet. */
export function ModulePlaceholder({
  section, icon: Icon, title, intro, features,
}: { section?: string; icon: ElementType; title: string; intro: string; features: string[] }) {
  return (
    <div>
      <PageHeader eyebrow={section} title={<span className="flex items-center gap-3">{title} <Chip tone="warn">Planned</Chip></span>} description={intro} />
      <Paper className="overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon size={18} strokeWidth={1.4} /></span>
          <p className="text-[15px] text-ink">What this page will do</p>
        </div>
        <ul className="grid gap-px bg-line sm:grid-cols-2">
          {features.map((f) => (
            <li key={f} className="flex gap-3 bg-surface px-5 py-4 text-[14px] text-muted">
              <span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-primary" />
              {f}
            </li>
          ))}
          {features.length % 2 === 1 && <li className="hidden bg-surface sm:block" />}
        </ul>
      </Paper>
    </div>
  );
}
