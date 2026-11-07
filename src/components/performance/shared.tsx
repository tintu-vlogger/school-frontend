"use client";

/*
 * Building blocks shared by the performance pages (goals, reviews, calibration, nine-box,
 * one-to-ones, feedback, improvement plans, pay reviews and settings):
 *   usePerfMe()            what the signed-in person can do here, and what is waiting
 *   usePerfSettings()      goal statuses, nine-box labels (cached)
 *   useList / useOptions   load a list endpoint; options for a Select
 *   searchEmployees        async loader for employee pickers
 *   PersonInline, ProgressBar, GoalStatusBadge, RatingPill, LevelBadge, PerformanceTabs
 *   money(), pct()         number formats (Indian grouping)
 */
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardCheck, Grid3x3, MessageSquareHeart, Scale, Handshake, LifeBuoy } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Avatar, Badge, Tabs, type BadgeTone, type SelectOption } from "@/components/ui-kit";
import type { GoalStatus, PerfMe, PerfSettings, Person, ScalePoint } from "./types";

export const STROKE = 1.4;

/* ── Loading ───────────────────────────────────────────────────────────── */

let meCache: PerfMe | null = null;
export function usePerfMe() {
  const [me, setMe] = useState<PerfMe | null>(meCache);
  const reload = useCallback(() => {
    api.get<PerfMe>("/performance/me").then((m) => { meCache = m; setMe(m); }).catch(() => {});
  }, []);
  useEffect(() => { reload(); }, [reload]);
  return { me, reload };
}

let settingsCache: PerfSettings | null = null;
export function usePerfSettings() {
  const [s, setS] = useState<PerfSettings | null>(settingsCache);
  useEffect(() => {
    if (settingsCache) return;
    api.get<PerfSettings>("/performance/settings").then((r) => { settingsCache = r; setS(r); }).catch(() => {});
  }, []);
  return s;
}
export function forgetPerfSettings() { settingsCache = null; }

/** Loads a list endpoint; `refresh()` reloads it. */
export function useList<T>(path: string | null, errorText = "Couldn't load the list") {
  const toast = useToast();
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ key: string; rows: T[] } | null>(null);
  const key = `${path}#${nonce}`;
  useEffect(() => {
    if (!path) return;
    let live = true;
    api.get<T[]>(path)
      .then((r) => { if (live) setResult({ key, rows: Array.isArray(r) ? r : [] }); })
      .catch((e) => { if (live) { setResult({ key, rows: [] }); toast.error(errorText, { description: e instanceof Error ? e.message : undefined }); } });
    return () => { live = false; };
  }, [path, key, toast, errorText]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { rows: result?.rows ?? [], loading: !!path && result?.key !== key, refresh };
}

/** Loads one object; `refresh()` reloads it. */
export function useData<T>(path: string | null, errorText = "Couldn't load this") {
  const toast = useToast();
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ key: string; data: T | null } | null>(null);
  const key = `${path}#${nonce}`;
  useEffect(() => {
    if (!path) return;
    let live = true;
    api.get<T>(path)
      .then((r) => { if (live) setResult({ key, data: r }); })
      .catch((e) => { if (live) { setResult({ key, data: null }); toast.error(errorText, { description: e instanceof Error ? e.message : undefined }); } });
    return () => { live = false; };
  }, [path, key, toast, errorText]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { data: result?.data ?? null, loading: !!path && result?.key !== key, refresh };
}

/** Options for a Select from a list endpoint (loaded once). */
export function useOptions<T>(path: string, map: (row: T) => SelectOption<number>) {
  const [rows, setRows] = useState<T[] | null>(null);
  useEffect(() => {
    let live = true;
    api.getCached<T[]>(path, 120).then((r) => { if (live) setRows(Array.isArray(r) ? r : []); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [path]);
  return (rows ?? []).map(map);
}

export function useDepartments() {
  return useOptions<{ id: number; department_name: string }>("/departments/", (d) => ({ value: d.id, label: d.department_name }));
}
export function useDesignations() {
  return useOptions<{ id: number; designation_name: string }>("/designations/", (d) => ({ value: d.id, label: d.designation_name }));
}

type Lookup = { value: number; label: string; hint?: string | null };
/** Async loader for employee pickers. */
export async function searchEmployees(q: string): Promise<SelectOption<number>[]> {
  const r = await api.get<Lookup[]>(`/employees/lookup?q=${encodeURIComponent(q)}&limit=20`);
  return (Array.isArray(r) ? r : []).map((e) => ({ value: e.value, label: e.label, description: e.hint || undefined }));
}
/** Labels for employee ids already chosen. */
export async function employeeLabels(ids: number[]): Promise<SelectOption<number>[]> {
  if (!ids.length) return [];
  const r = await api.get<Lookup[]>(`/employees/lookup?ids=${ids.join(",")}`);
  return (Array.isArray(r) ? r : []).map((e) => ({ value: e.value, label: e.label }));
}

/* ── Display ───────────────────────────────────────────────────────────── */

export function Dash() { return <span className="text-faint">—</span>; }

export function PersonInline({ person, size = 26, sub }: { person: Person | { name: string; photo?: string | null } | undefined; size?: number; sub?: React.ReactNode }) {
  if (!person) return <Dash />;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar name={person.name} src={person.photo} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-ink/85">{person.name}</span>
        {sub && <span className="block truncate text-[12px] text-muted">{sub}</span>}
      </span>
    </span>
  );
}

const BAR_TONE: Record<string, string> = {
  emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500", indigo: "bg-primary", slate: "bg-slate-400",
  sky: "bg-sky-500", violet: "bg-violet-500",
};

/** Thin progress bar with an optional "where it should be" tick. */
export function ProgressBar({ value, expected, tone = "indigo", className = "", height = 6 }: { value: number; expected?: number; tone?: string; className?: string; height?: number }) {
  const v = Math.max(0, Math.min(100, value || 0));
  return (
    <div className={`relative w-full overflow-hidden rounded-full bg-sunken ${className}`} style={{ height }}>
      <div className={`h-full rounded-full transition-[width] duration-300 ${BAR_TONE[tone] ?? "bg-primary"}`} style={{ width: `${v}%` }} />
      {expected !== undefined && expected > 0 && expected < 100 && (
        <span className="absolute top-0 h-full w-px bg-ink/40" style={{ left: `${expected}%` }} title={`Expected ${Math.round(expected)}%`} />
      )}
    </div>
  );
}

const STATUS_TONE: Record<string, BadgeTone> = { emerald: "good", amber: "warn", rose: "bad", indigo: "accent", slate: "neutral", sky: "info" };

export function statusOf(statuses: GoalStatus[] | undefined, key: string | null) {
  return (statuses ?? []).find((s) => s.key === key) ?? null;
}

export function GoalStatusBadge({ statusKey, statuses }: { statusKey: string | null; statuses?: GoalStatus[] }) {
  const s = statusOf(statuses, statusKey);
  if (!statusKey) return <Dash />;
  return <Badge tone={STATUS_TONE[s?.color ?? ""] ?? "neutral"} dot>{s?.label ?? statusKey.replace(/_/g, " ")}</Badge>;
}

export function statusTone(statuses: GoalStatus[] | undefined, key: string | null) {
  return statusOf(statuses, key)?.color ?? "indigo";
}

const LEVEL_LABEL: Record<string, string> = { company: "Company", department: "Department", team: "Team", individual: "Individual" };
const LEVEL_TONE: Record<string, BadgeTone> = { company: "accent", department: "info", team: "good", individual: "neutral" };
export function LevelBadge({ level }: { level: string }) {
  return <Badge tone={LEVEL_TONE[level] ?? "neutral"}>{LEVEL_LABEL[level] ?? level}</Badge>;
}
export const levelLabel = (l: string) => LEVEL_LABEL[l] ?? l;

const RATING_TONES = ["border-rose-200 bg-rose-50 text-rose-700", "border-amber-200 bg-amber-50 text-amber-700",
  "border-sky-200 bg-sky-50 text-sky-700", "border-emerald-200 bg-emerald-50 text-emerald-700", "border-primary/25 bg-primary-soft text-primary"];

/** A rating as a small pill, coloured by where it sits on the scale. */
export function RatingPill({ value, label, scale, muted }: { value: number | null | undefined; label?: string | null; scale?: ScalePoint[]; muted?: boolean }) {
  if (value === null || value === undefined) return <Dash />;
  const vals = (scale?.length ? scale.map((p) => p.value) : [1, 2, 3, 4, 5]).sort((a, b) => a - b);
  const pos = vals.length > 1 ? (value - vals[0]) / (vals[vals.length - 1] - vals[0]) : 0.5;
  const tone = muted ? "border-line-strong bg-sunken/60 text-muted" : RATING_TONES[Math.min(4, Math.max(0, Math.round(pos * 4)))];
  const text = label ?? scale?.find((p) => p.value === value)?.label;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12.5px] ${tone}`}>
      <span className="tabular">{Number.isInteger(value) ? value : value.toFixed(1)}</span>
      {text && <span className="truncate opacity-90">{text}</span>}
    </span>
  );
}

export function money(n: number | null | undefined, opts: { compact?: boolean } = {}) {
  if (n === null || n === undefined) return "—";
  if (opts.compact) {
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
  }
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}
export const pct = (n: number | null | undefined, digits = 0) => (n === null || n === undefined ? "—" : `${n.toFixed(digits)}%`);

/** Tabs across the review pages, shown according to what the person may do. */
export function PerformanceTabs({ me }: { me: PerfMe | null }) {
  const router = useRouter();
  const path = usePathname();
  const items = [
    { value: "/dashboard/performance", label: "Reviews", icon: ClipboardCheck },
    ...(me?.is_admin ? [{ value: "/dashboard/performance/calibration", label: "Calibration", icon: Scale }] : []),
    ...(me?.is_admin || me?.is_manager ? [{ value: "/dashboard/performance/nine-box", label: "Nine-box", icon: Grid3x3 }] : []),
    { value: "/dashboard/performance/one-on-ones", label: "1:1s", icon: Handshake },
    { value: "/dashboard/performance/feedback", label: "Feedback", icon: MessageSquareHeart },
    { value: "/dashboard/performance/pip", label: "Improvement plans", icon: LifeBuoy },
  ];
  const current = items.find((i) => i.value === path)?.value ?? items[0].value;
  return <Tabs value={current} onChange={(v) => router.push(v)} items={items} className="mb-6" />;
}
