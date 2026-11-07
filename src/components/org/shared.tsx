"use client";

/*
 * Small building blocks shared by the organisation setup pages (legal entities, locations,
 * teams, tags, skills, grades, cost centres): list loading, status badge and filter,
 * switch on / off with confirmation, employee search, colour swatches and money format.
 */
import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Avatar, Badge, useConfirm, type FilterDef, type FilterValues, type SelectOption } from "@/components/ui-kit";

/* ── Loading ───────────────────────────────────────────────────────────── */

/** Loads a list endpoint; `refresh()` reloads it. `loading` is true until the latest load lands. */
export function useList<T>(path: string | null, errorText: string) {
  const toast = useToast();
  const [nonce, setNonce] = useState(0);
  const [result, setResult] = useState<{ key: string; rows: T[] } | null>(null);
  const key = `${path}#${nonce}`;
  useEffect(() => {
    if (!path) return;
    let live = true;
    api.get<T[]>(path)
      .then((r) => { if (live) setResult({ key, rows: Array.isArray(r) ? r : [] }); })
      .catch(() => { if (live) { setResult({ key, rows: [] }); toast.error(errorText); } });
    return () => { live = false; };
  }, [path, key, toast, errorText]);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { rows: result?.rows ?? [], loading: result?.key !== key, refresh };
}

/** Options for a Select from a list endpoint (loaded once). */
export function useOptions<T>(path: string, map: (row: T) => SelectOption<number>, filter?: (row: T) => boolean) {
  const [rows, setRows] = useState<T[] | null>(null);
  useEffect(() => {
    let live = true;
    api.get<T[]>(path).then((r) => { if (live) setRows(Array.isArray(r) ? r : []); }).catch(() => { if (live) setRows([]); });
    return () => { live = false; };
  }, [path]);
  return (rows ?? []).filter((r) => !filter || filter(r)).map(map);
}

/* ── Employees ─────────────────────────────────────────────────────────── */

type Lookup = { value: number; label: string; hint?: string | null; uuid?: string; photo?: string | null };

/** Async loader for employee pickers. */
export async function searchEmployees(q: string): Promise<SelectOption<number>[]> {
  const r = await api.get<Lookup[]>(`/employees/lookup?q=${encodeURIComponent(q)}&limit=20`);
  return (Array.isArray(r) ? r : []).map((e) => ({ value: e.value, label: e.label, description: e.hint || undefined }));
}

export type PersonRef = { id?: number; uuid?: string; name: string; photo?: string | null } | null | undefined;

/** Avatar + name, or a faint dash. */
export function PersonInline({ person, size = 24 }: { person: PersonRef; size?: number }) {
  if (!person) return <Dash />;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <Avatar name={person.name} src={person.photo} size={size} />
      <span className="truncate text-ink/80">{person.name}</span>
    </span>
  );
}

export function Dash() {
  return <span className="text-faint">—</span>;
}

/* ── Status ────────────────────────────────────────────────────────────── */

export const STATUS_FILTER: FilterDef = {
  key: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Switched off" }],
};

export function matchesStatus(active: boolean, filters: FilterValues) {
  const st = filters.status?.[0];
  return !st || (st === "active" ? active : !active);
}

export function StatusBadge({ active }: { active: boolean }) {
  return <Badge tone={active ? "good" : "neutral"} dot>{active ? "Active" : "Switched off"}</Badge>;
}

/**
 * Switch a record on or off via PUT { active }. Switching off asks first.
 * Resolves true when the change was saved.
 */
export function useSwitchActive() {
  const toast = useToast();
  const confirm = useConfirm();
  return useCallback(async (o: { path: string; name: string; active: boolean; message?: string }) => {
    const turnOff = o.active;
    if (turnOff) {
      const ok = await confirm({
        title: `Switch off ${o.name}?`,
        message: o.message ?? "It stays on record but is hidden from lists and new choices. You can switch it back on at any time.",
        confirmLabel: "Switch off",
        tone: "danger",
      });
      if (!ok) return false;
    }
    try {
      await api.put(o.path, { active: !turnOff });
      toast.success(turnOff ? `${o.name} switched off` : `${o.name} switched on`);
      return true;
    } catch (e: unknown) {
      toast.error(turnOff ? `Couldn't switch off ${o.name}` : `Couldn't switch on ${o.name}`, { description: e instanceof Error ? e.message : undefined });
      return false;
    }
  }, [confirm, toast]);
}

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : undefined;
}

/* ── Colours ───────────────────────────────────────────────────────────── */

export const SWATCHES = ["#4f46e5", "#0891b2", "#059669", "#65a30d", "#d97706", "#dc2626", "#db2777", "#7c3aed"];

export function ColorDot({ color, size = 10 }: { color?: string | null; size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: color || "var(--color-faint, #a1a1aa)" }} />;
}

export function ColorSwatches({ value, onChange }: { value: string | null; onChange: (c: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Colour" className="flex flex-wrap items-center gap-2 py-1">
      {SWATCHES.map((c) => {
        const on = value?.toLowerCase() === c;
        return (
          <button key={c} type="button" role="radio" aria-checked={on} aria-label={c} onClick={() => onChange(c)}
            className={`flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-shadow ${on ? "ring-1 ring-ink/50" : "hover:ring-1 hover:ring-line-strong"}`}
            style={{ background: c }}>
            {on && <Check size={14} strokeWidth={1.8} className="text-white" />}
          </button>
        );
      })}
    </div>
  );
}

/* ── Money ─────────────────────────────────────────────────────────────── */

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function formatMoney(n: number | string | null | undefined) {
  if (n === null || n === undefined || n === "") return "";
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? `₹${inr.format(v)}` : "";
}

export function toNumber(n: number | string | null | undefined): number | null {
  if (n === null || n === undefined || n === "") return null;
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? v : null;
}

/** Trimmed string or null, for payloads. */
export const orNull = (s: string | null | undefined) => (s && s.trim() ? s.trim() : null);
