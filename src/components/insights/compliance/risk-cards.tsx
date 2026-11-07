"use client";

/*
 * People risks: one card per alert with a big count and what to do. Zero-count alerts
 * read as calm and positive ("All clear"). "See people" lists who is affected.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, ShieldAlert, Users } from "lucide-react";
import { Badge, Button, Modal, type BadgeTone } from "@/components/ui-kit";
import type { RiskAlert } from "./types";

const SEVERITY: Record<RiskAlert["severity"], { label: string; tone: BadgeTone; count: string; bar: string }> = {
  high: { label: "High", tone: "bad", count: "text-rose-700", bar: "bg-rose-400" },
  medium: { label: "Medium", tone: "warn", count: "text-amber-700", bar: "bg-amber-400" },
  low: { label: "Low", tone: "info", count: "text-sky-700", bar: "bg-sky-400" },
};

export function RiskCards({ alerts }: { alerts: RiskAlert[] }) {
  const [open, setOpen] = useState<RiskAlert | null>(null);
  const sorted = [...alerts].sort((a, b) => (b.count > 0 ? 1 : 0) - (a.count > 0 ? 1 : 0));
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((a) => {
          const clear = a.count === 0;
          const s = SEVERITY[a.severity] ?? SEVERITY.low;
          return (
            <div key={a.key} className="relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface p-5">
              <span className={`absolute inset-y-0 left-0 w-[3px] ${clear ? "bg-emerald-300" : s.bar}`} aria-hidden />
              <div className="flex items-start justify-between gap-3">
                <p className="text-[14.5px] text-ink">{a.title}</p>
                {clear
                  ? <Badge tone="good" dot>All clear</Badge>
                  : <Badge tone={s.tone} dot>{s.label}</Badge>}
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                {clear ? (
                  <span className="inline-flex items-center gap-2 text-[15px] text-emerald-700">
                    <CheckCircle2 size={20} strokeWidth={1.4} /> Nobody affected
                  </span>
                ) : (
                  <>
                    <span className={`tabular text-[34px] font-extralight leading-none ${s.count}`}>{a.count}</span>
                    <span className="text-[13px] text-muted">{a.count === 1 ? "person" : "people"}</span>
                  </>
                )}
              </div>
              <p className={`mt-3 flex-1 text-[13px] leading-relaxed ${clear ? "text-faint" : "text-muted"}`}>{a.guidance}</p>
              {!clear && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {a.people.length > 0 && <Button size="sm" icon={Users} onClick={() => setOpen(a)}>See people</Button>}
                  {a.link && (
                    <Link href={a.link} className="inline-flex h-8 items-center gap-1 px-2 text-[13px] text-primary hover:text-primary-dark">
                      Open <ArrowUpRight size={14} strokeWidth={1.4} />
                    </Link>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} size="md" title={open?.title}
        description={open ? `${open.count} ${open.count === 1 ? "person" : "people"}` : undefined}
        leading={<span className="flex h-9 w-9 items-center justify-center rounded-lg bg-sunken text-muted"><ShieldAlert size={17} strokeWidth={1.4} /></span>}
        footerStart={open?.link ? (
          <Link href={open.link} className="inline-flex items-center gap-1.5 text-[13.5px] text-primary hover:text-primary-dark">
            Open <ArrowUpRight size={14} strokeWidth={1.4} />
          </Link>
        ) : undefined}
        footer={<Button onClick={() => setOpen(null)}>Close</Button>}>
        {open && (
          <ul className="-my-2 divide-y divide-line">
            {open.people.map((p, i) => (
              <li key={`${p.uuid}-${i}`}>
                <Link href={`/dashboard/staff/${p.uuid}`} className="-mx-2 flex items-center justify-between gap-4 rounded-lg px-2 py-3 hover:bg-sunken/60">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] text-ink">{p.name}</span>
                    {p.code && <span className="block text-[12.5px] text-faint">{p.code}</span>}
                  </span>
                  <span className="shrink-0 text-right text-[13px] text-muted">{p.detail}</span>
                </Link>
              </li>
            ))}
            {open.people.length < open.count && (
              <li className="py-3 text-[13px] text-faint">Showing {open.people.length} of {open.count}.</li>
            )}
          </ul>
        )}
      </Modal>
    </>
  );
}
