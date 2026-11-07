/*
 * Option loaders for searchable Selects on workplace pages.
 *   <Select loadOptions={loadEmployees} ... />   // active employees: { value: id, label: name, description }
 */
import { api } from "@/lib/api";
import type { SelectOption } from "@/components/ui-kit";

export async function loadEmployees(q: string): Promise<SelectOption<number>[]> {
  const rows = await api.get<{ value: number; label: string; hint: string }[]>(`/employees/lookup?q=${encodeURIComponent(q)}`);
  return rows.map((r) => ({ value: r.value, label: r.label, description: r.hint || undefined }));
}

export async function employeeOptionsFor(ids: (number | null | undefined)[]): Promise<SelectOption<number>[]> {
  const list = ids.filter((x): x is number => typeof x === "number");
  if (!list.length) return [];
  const rows = await api.get<{ value: number; label: string; hint: string }[]>(`/employees/lookup?ids=${list.join(",")}`);
  return rows.map((r) => ({ value: r.value, label: r.label, description: r.hint || undefined }));
}

export const PRIORITY_LABEL: Record<string, string> = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };
export const PRIORITY_TONE: Record<string, "neutral" | "info" | "warn" | "bad"> = { low: "neutral", medium: "info", high: "warn", urgent: "bad" };
export const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"].map((p) => ({ value: p, label: PRIORITY_LABEL[p] }));

/** "2 h 5 m", "3 d 4 h" from minutes (negative = late). */
export function durationLabel(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "";
  const m = Math.abs(minutes);
  if (m < 60) return `${m} m`;
  if (m < 60 * 24) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} m` : ""}`;
  return `${Math.floor(m / 1440)} d${Math.floor((m % 1440) / 60) ? ` ${Math.floor((m % 1440) / 60)} h` : ""}`;
}

export function money(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : String(v);
}
