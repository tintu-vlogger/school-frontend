"use client";

/*
 * Small building blocks for the hiring pages.
 *   const meta = useHiringMeta();                        // labels, permissions (cached)
 *   <TagInput value={skills} onChange={setSkills} />     // type and press Enter
 *   <RatingInput value={4} onChange={...} />             // 1–5
 *   <ScorePill score={72} />  <Bar value={12} max={40} />
 */
import { useEffect, useState, type KeyboardEvent } from "react";
import { Star, X } from "lucide-react";
import { api, resolveImageUrl } from "@/lib/api";
import { Badge } from "@/components/ui-kit";
import { scoreTone, type Meta } from "./types";

let metaCache: Meta | null = null;

export function useHiringMeta() {
  const [meta, setMeta] = useState<Meta | null>(metaCache);
  useEffect(() => {
    let live = true;
    api.get<Meta>("/recruitment/meta").then((m) => { metaCache = m; if (live) setMeta(m); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return meta;
}

export function TagInput({ value, onChange, placeholder = "Type and press Enter" }: {
  value: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim().replace(/,$/, "");
    if (t && !value.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...value, t]);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); }
    else if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1.5 focus-within:border-primary/50">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-md bg-sunken px-2 py-0.5 text-[12.5px] text-ink">
          {t}
          <button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="text-faint hover:text-ink">
            <X size={12} strokeWidth={1.6} />
          </button>
        </span>
      ))}
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onBlur={add}
        placeholder={value.length ? "" : placeholder} className="min-w-[120px] flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint" />
    </div>
  );
}

export function RatingInput({ value, onChange, label }: { value: number | null; onChange: (v: number) => void; label?: string }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} of 5`} onClick={() => onChange(n)}
          className="rounded p-0.5 text-faint transition-colors hover:text-amber-500">
          <Star size={18} strokeWidth={1.4} className={value !== null && n <= value ? "fill-amber-400 text-amber-500" : ""} />
        </button>
      ))}
    </div>
  );
}

export function Stars({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[12.5px] text-muted">
      <Star size={12} strokeWidth={1.4} className="fill-amber-400 text-amber-500" />{Number(value).toFixed(1)}
    </span>
  );
}

export function ScorePill({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return <span className="text-faint">—</span>;
  return <Badge tone={scoreTone(score)}>{score}</Badge>;
}

export function Bar({ value, max, tone = "bg-primary/70" }: { value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-sunken">
      <div className={`h-full rounded-full ${tone} transition-[width] duration-300`} style={{ width: `${value ? pct : 0}%` }} />
    </div>
  );
}

/** Opens a signed file link from the API in a new tab. */
export function FileLink({ file, label }: { file?: { url?: string | null; name?: string } | null; label?: string }) {
  if (!file?.url) return <span className="text-faint">—</span>;
  const href = resolveImageUrl(file.url);
  return <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">{label || file.name || "Open"}</a>;
}
