"use client";

/*
 * Small pieces shared by the learning pages: who I am here (useLearningMe), list loading,
 * the Learning tab bar, status badges, progress bars and duration text.
 */
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpenCheck, Library, LayoutGrid } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/lib/toast-context";
import { Badge, Tabs, type BadgeTone, type SelectOption } from "@/components/ui-kit";
import type { EnrolmentBrief, LearningMe } from "./types";

export const STROKE = 1.4;

let meCache: LearningMe | null = null;
export function useLearningMe() {
  const [me, setMe] = useState<LearningMe | null>(meCache);
  useEffect(() => {
    api.get<LearningMe>("/learning/me").then((m) => { meCache = m; setMe(m); }).catch(() => {});
  }, []);
  return me;
}

export function useLoad<T>(path: string | null, errorText = "Couldn't load this") {
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

type MasterItem = { value: number; label: string };
export function useCategories() {
  const [opts, setOpts] = useState<SelectOption<number>[]>([]);
  useEffect(() => {
    api.getCached<{ items: MasterItem[] }>("/masters/options/course_category", 120)
      .then((r) => setOpts((r?.items ?? []).map((i) => ({ value: i.value, label: i.label })))).catch(() => {});
  }, []);
  return opts;
}

export function useSimpleOptions(path: string, labelKey: string) {
  const [opts, setOpts] = useState<SelectOption<number>[]>([]);
  useEffect(() => {
    api.getCached<Record<string, unknown>[]>(path, 120)
      .then((r) => setOpts((Array.isArray(r) ? r : []).map((x) => ({ value: Number(x.id), label: String(x[labelKey]) })))).catch(() => {});
  }, [path, labelKey]);
  return opts;
}

type Lookup = { value: number; label: string; hint?: string | null };
export async function searchEmployees(q: string): Promise<SelectOption<number>[]> {
  const r = await api.get<Lookup[]>(`/employees/lookup?q=${encodeURIComponent(q)}&limit=20`);
  return (Array.isArray(r) ? r : []).map((e) => ({ value: e.value, label: e.label, description: e.hint || undefined }));
}

export function LearningTabs({ me }: { me: LearningMe | null }) {
  const router = useRouter();
  const path = usePathname();
  const items = [
    { value: "/dashboard/learning", label: "Catalogue", icon: LayoutGrid },
    ...(me?.employee_id ? [{ value: "/dashboard/learning/my", label: "My learning", icon: BookOpenCheck }] : []),
    ...(me?.is_admin ? [{ value: "/dashboard/learning/admin", label: "Learning admin", icon: Library }] : []),
  ];
  const current = items.find((i) => i.value === path)?.value ?? items[0].value;
  return <Tabs value={current} onChange={(v) => router.push(v)} items={items} className="mb-6" />;
}

export function minutes(n: number | null | undefined) {
  if (!n) return "Self-paced";
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60), m = n % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const STATUS: Record<string, [string, BadgeTone]> = {
  requested: ["Awaiting approval", "warn"], enrolled: ["Not started", "neutral"], in_progress: ["In progress", "info"],
  completed: ["Completed", "good"], cancelled: ["Cancelled", "neutral"], rejected: ["Not approved", "bad"], expired: ["Expired", "warn"],
};
export function EnrolmentBadge({ enrolment, overdue }: { enrolment: EnrolmentBrief | null; overdue?: boolean }) {
  if (!enrolment) return null;
  if (overdue) return <Badge tone="bad" dot>Overdue</Badge>;
  const [label, tone] = STATUS[enrolment.status] ?? [enrolment.status, "neutral"];
  return <Badge tone={tone} dot>{label}</Badge>;
}

const LEVEL: Record<string, string> = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
const DELIVERY: Record<string, string> = { online: "Online", classroom: "Classroom", blended: "Blended" };
export const levelLabel = (l: string) => LEVEL[l] ?? l;
export const deliveryLabel = (d: string) => DELIVERY[d] ?? d;

export function Bar({ value, tone = "bg-primary", className = "", height = 5 }: { value: number; tone?: string; className?: string; height?: number }) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-sunken ${className}`} style={{ height }}>
      <div className={`h-full rounded-full transition-[width] duration-300 ${tone}`} style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
    </div>
  );
}

export function money(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export const errText =(e: unknown) => (e instanceof Error ? e.message : undefined);

/** A file as a data URL (for lesson files). */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Couldn't read the file"));
    r.readAsDataURL(file);
  });
}
