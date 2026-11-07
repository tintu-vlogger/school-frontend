"use client";

/*
 * Shared pieces for positions, succession and the internal job marketplace.
 *
 *   const meta = usePositionsMeta();          // /positions/meta (cached per page load)
 *   <PersonCell person={p} hint="Designer" />
 *   <SkillsEditor value={skills} onChange={setSkills} />   // skill + level 1..5 rows
 *   <SkillList skills={p.skills} />
 *   <MatchPill score={72} />
 *   <PositionPicker value={uuid} onChange={(uuid, position) => ...} />  // vacant approved positions
 *   const { enabled, required } = usePositionsSetup();                 // for hire / job-change forms
 */
import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar, Badge, IconButton, Select, type BadgeTone, type SelectOption } from "@/components/ui-kit";
import type { Meta, Person, Position, SkillReq } from "./types";

let metaCache: Promise<Meta> | null = null;

export function usePositionsMeta(): Meta | null {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    let live = true;
    if (!metaCache) metaCache = api.get<Meta>("/positions/meta");
    metaCache.then((m) => live && setMeta(m)).catch(() => { metaCache = null; });
    return () => { live = false; };
  }, []);
  return meta;
}

export function resetPositionsMeta() { metaCache = null; }

export const FILL_TONE: Record<string, BadgeTone> = { vacant: "warn", partly_filled: "info", filled: "good", closed: "neutral" };
export const STATUS_TONE: Record<string, BadgeTone> = {
  budgeted: "info", approved: "good", closed: "neutral", draft: "neutral", pending: "warn", rejected: "bad", cancelled: "neutral",
  open: "good", filled: "accent", manager_review: "warn", submitted: "info", shortlisted: "accent", selected: "good",
  moved: "good", assigned: "good", manager_declined: "bad", withdrawn: "neutral",
};
export const READINESS_TONE: Record<string, BadgeTone> = { ready_now: "good", one_two_years: "info", three_plus_years: "neutral" };
export const READINESS_SHORT: Record<string, string> = { ready_now: "Ready now", one_two_years: "1-2 years", three_plus_years: "3+ years" };
export const BENCH_TONE: Record<string, BadgeTone> = { strong: "good", moderate: "info", weak: "warn", none: "bad" };
export const URGENCY_TONE: Record<string, BadgeTone> = { urgent: "bad", watch: "warn", stable: "neutral" };
export const URGENCY_LABEL: Record<string, string> = { urgent: "Urgent", watch: "Watch", stable: "Stable" };
export const LEVEL_OPTIONS = [{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }];
export const READINESS_OPTIONS = [
  { value: "ready_now", label: "Ready now" }, { value: "one_two_years", label: "Ready in 1-2 years" }, { value: "three_plus_years", label: "Ready in 3+ years" },
];

export const options = (rec: Record<string, string> | undefined): SelectOption<string>[] =>
  Object.entries(rec ?? {}).map(([value, label]) => ({ value, label }));

export function money(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (n >= 100000) return `₹${(n / 100000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} L`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export function band(min: string | null, max: string | null): string {
  if (!min && !max) return "—";
  return `${money(min)} – ${money(max)}`;
}

export function PersonCell({ person, hint, size = 28 }: { person: Person | null | undefined; hint?: string | null; size?: number }) {
  if (!person) return <span className="text-faint">—</span>;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={person.name} src={person.photo ?? undefined} size={size} />
      <div className="min-w-0">
        <p className="truncate text-ink">{person.name}</p>
        {hint && <p className="truncate text-[12px] text-faint">{hint}</p>}
      </div>
    </div>
  );
}

export function MatchPill({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) return <span className="text-faint">—</span>;
  const tone = score >= 75 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : score >= 50 ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-sunken text-muted border-line";
  return <span className={`inline-flex h-[22px] items-center rounded-full border px-2 text-[12px] tabular ${tone}`}>{Math.round(score)}% match</span>;
}

export function Meter({ value, max, tone = "bg-primary/70" }: { value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken"><div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} /></div>;
}

export function Dots({ level }: { level: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`Level ${level} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= level ? "bg-primary/70" : "bg-line-strong"}`} />)}
    </span>
  );
}

export function SkillList({ skills, empty = "No skills listed" }: { skills: SkillReq[]; empty?: string }) {
  if (!skills.length) return <span className="text-[13px] text-faint">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {skills.map((s) => (
        <span key={s.skill_id} className="inline-flex h-7 items-center gap-2 rounded-full border border-line px-2.5 text-[12.5px] text-ink">
          {s.name ?? `Skill ${s.skill_id}`}<Dots level={s.level} />
        </span>
      ))}
    </div>
  );
}

type SkillRow = { id: number; name: string; active?: boolean };
let skillsCache: Promise<SkillRow[]> | null = null;

export function useSkillOptions(): SelectOption<number>[] {
  const [rows, setRows] = useState<SkillRow[]>([]);
  useEffect(() => {
    let live = true;
    if (!skillsCache) skillsCache = api.get<SkillRow[]>("/organization/skills");
    skillsCache.then((r) => live && setRows(Array.isArray(r) ? r : [])).catch(() => { skillsCache = null; });
    return () => { live = false; };
  }, []);
  return rows.filter((r) => r.active !== false).map((r) => ({ value: r.id, label: r.name }));
}

const LEVELS: SelectOption<number>[] = [1, 2, 3, 4, 5].map((n) => ({
  value: n, label: `Level ${n}`, description: ["Beginner", "Basic", "Working", "Strong", "Expert"][n - 1],
}));

/** Rows of skill + level (1 to 5). */
export function SkillsEditor({ value, onChange }: { value: SkillReq[]; onChange: (v: SkillReq[]) => void }) {
  const opts = useSkillOptions();
  const [adding, setAdding] = useState<number | null>(null);
  const used = new Set(value.map((s) => s.skill_id));
  const name = (id: number) => opts.find((o) => o.value === id)?.label ?? `Skill ${id}`;
  return (
    <div className="space-y-2">
      {value.map((s, i) => (
        <div key={s.skill_id} className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate rounded-lg border border-line px-3 py-2 text-[13.5px] text-ink">{s.name ?? name(s.skill_id)}</span>
          <Select<number> className="w-40" value={s.level} options={LEVELS} onChange={(l) => onChange(value.map((x, j) => (j === i ? { ...x, level: l ?? 3 } : x)))} aria-label="Level" />
          <IconButton icon={X} label="Remove skill" onClick={() => onChange(value.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Select<number> className="flex-1" value={adding} placeholder="Add a skill" options={opts.filter((o) => !used.has(o.value))}
          onChange={(id) => { if (id) { onChange([...value, { skill_id: id, level: 3, name: name(id) }]); setAdding(null); } }} />
        <span className="inline-flex h-9 w-9 items-center justify-center text-faint"><Plus size={15} strokeWidth={1.4} /></span>
      </div>
    </div>
  );
}

/** Pick a vacant approved position (for hires and job changes). onChange gets the uuid and the full position. */
export function PositionPicker({ value, onChange, placeholder = "Search vacant positions" }: {
  value: string | null; onChange: (uuid: string | null, position: Position | null) => void; placeholder?: string;
}) {
  const [known, setKnown] = useState<Record<string, Position>>({});
  const load = async (q: string): Promise<SelectOption<string>[]> => {
    const r = await api.get<{ items: Position[] }>(`/positions/vacant?q=${encodeURIComponent(q)}${value ? `&include=${value}` : ""}`);
    setKnown((k) => ({ ...k, ...Object.fromEntries(r.items.map((p) => [p.uuid, p])) }));
    return r.items.map((p) => ({ value: p.uuid, label: `${p.code} · ${p.title}`,
      description: [p.department, p.location, `${p.vacant} vacant`].filter(Boolean).join(" · ") }));
  };
  return (
    <Select<string> value={value} loadOptions={load} placeholder={placeholder} clearable
      selectedOption={value && known[value] ? { value, label: `${known[value].code} · ${known[value].title}` } : null}
      onChange={(uuid) => onChange(uuid, uuid ? known[uuid] ?? null : null)} />
  );
}

/** Whether positions are switched on (and required) for hire and job-change forms outside this module. */
export function usePositionsSetup(): { enabled: boolean; required: boolean } {
  const [v, setV] = useState({ enabled: false, required: false });
  useEffect(() => {
    let live = true;
    api.getCached<{ enabled: boolean; can_pick: boolean; require_position_on_hire: boolean }>("/positions/meta", 30)
      .then((m) => live && setV({ enabled: !!m.enabled && !!m.can_pick, required: !!m.enabled && !!m.can_pick && !!m.require_position_on_hire }))
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return v;
}

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"} dot>{label}</Badge>;
}
