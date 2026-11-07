/*
 * Small building blocks shared by the academics pages.
 *   <ColorField value={hex} onChange={setHex} />          // swatches plus a hex input
 *   const departments = useDepartmentOptions(keepId);     // Select options from /departments/
 *   <StrengthBar strength={32} capacity={40} />           // strength vs capacity
 */
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { TextInput, type SelectOption } from "@/components/ui-kit";

export const SWATCHES = ["#e5484d", "#f76b15", "#f5a623", "#30a46c", "#12a594", "#0090ff", "#3e63dd", "#8e4ec6", "#d6409f", "#8d8d86"];

export function ColorField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {SWATCHES.map((c) => (
        <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => onChange(c)}
          className={`h-7 w-7 rounded-full border transition ${value.toLowerCase() === c ? "border-ink ring-2 ring-primary/30" : "border-line"}`}
          style={{ background: c }} />
      ))}
      <TextInput value={value} onValueChange={(x) => onChange(x.trim())} placeholder="#3e63dd" maxLength={20}
        className="w-28 font-mono" aria-label="Colour code" />
    </div>
  );
}

export function ColorDot({ color, size = 10 }: { color: string | null | undefined; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full border border-line" style={{ width: size, height: size, background: color || "transparent" }} />;
}

type Dept = { id: number; department_name: string; active: boolean };

export function useDepartmentOptions(keep?: number | null): SelectOption<number>[] {
  const [rows, setRows] = useState<Dept[]>([]);
  useEffect(() => {
    let live = true;
    api.get<Dept[]>("/departments/").then((r) => { if (live) setRows(Array.isArray(r) ? r : []); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return rows.filter((d) => d.active || d.id === keep).map((d) => ({ value: d.id, label: d.department_name }));
}

export function useDepartmentNames(): Record<number, string> {
  const opts = useDepartmentOptions();
  return Object.fromEntries(opts.map((o) => [o.value, o.label]));
}

export function StrengthBar({ strength, capacity }: { strength: number; capacity: number | null }) {
  const pct = capacity ? Math.min(100, Math.round((strength / capacity) * 100)) : 0;
  const tone = !capacity ? "bg-faint/40" : pct >= 100 ? "bg-rose-500" : pct >= 90 ? "bg-amber-500" : "bg-primary";
  return (
    <div className="min-w-[110px]">
      <div className="flex items-baseline justify-between text-[12.5px]">
        <span className="tabular text-ink">{strength}</span>
        <span className="tabular text-faint">{capacity ? `of ${capacity}` : "no limit"}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
        <div className={`h-full rounded-full ${tone}`} style={{ width: capacity ? `${pct}%` : "100%" }} />
      </div>
    </div>
  );
}
