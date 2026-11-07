"use client";

/*
 * Small helpers shared by the transport and hostel screens.
 *   const { data, loading, reload } = useApiData<T>("/transport/summary");
 *   searchStudents(q)  -> Select options for learners (id, name, admission no.)
 *   searchStaff(q)     -> Select options for staff (employee id)
 *   const { kids, child, setChild } = useMyChildren();   <ChildPicker ... />   portal child switcher
 *   errText(err)       -> message from an API error
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Avatar, Tabs, type SelectOption } from "@/components/ui-kit";

export const STROKE = 1.4;

export function errText(err: unknown, fallback = "Something went wrong"): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function useApiData<T>(path: string | null) {
  const [state, setState] = useState<{ key: string; data: T | null; error: boolean } | null>(null);
  const [nonce, setNonce] = useState(0);
  const key = `${path}#${nonce}`;
  useEffect(() => {
    if (!path) return;
    let live = true;
    api.get<T>(path)
      .then((data) => { if (live) setState({ key, data, error: false }); })
      .catch(() => { if (live) setState({ key, data: null, error: true }); });
    return () => { live = false; };
  }, [path, key]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const fresh = state?.key === key;
  return { data: path ? state?.data ?? null : null, loading: !!path && !fresh, error: fresh && !!state?.error, reload };
}

export type Paged<T> = { items: T[]; total: number; page: number; size: number };

type StudentRow = { id: number; name: string; admission_no: string; section_label: string | null };
export async function searchStudents(q: string): Promise<SelectOption<number>[]> {
  const r = await api.get<Paged<StudentRow>>(`/students?size=30${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  return (r.items || []).map((s) => ({ value: s.id, label: s.name, description: [s.admission_no, s.section_label].filter(Boolean).join(" · ") }));
}

type Emp = { id: number; first_name: string; last_name: string; email?: string | null; designation_name?: string | null };
export async function searchStaff(q: string): Promise<SelectOption<number>[]> {
  const r = await api.get<Emp[]>(`/employees/?status=active${q ? `&search=${encodeURIComponent(q)}` : ""}`);
  return (Array.isArray(r) ? r : []).slice(0, 30).map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}`.trim(), description: e.designation_name || e.email || undefined }));
}

export type Child = { id: number; uuid: string; name: string; first_name: string; photo_url: string | null; section_label: string | null };

export function useMyChildren() {
  const { data, loading } = useApiData<Child[]>("/students/mine");
  const [picked, setPicked] = useState<number | null>(null);
  const kids = data ?? [];
  const child = kids.find((k) => k.id === picked) ?? kids[0] ?? null;
  return { kids, child, setChild: setPicked, loading };
}

export function ChildPicker({ kids, value, onChange }: { kids: Child[]; value: number | null; onChange: (id: number) => void }) {
  if (kids.length < 2) return null;
  return (
    <div className="mb-5 overflow-x-auto">
      <Tabs variant="pill" value={String(value ?? "")} onChange={(v) => onChange(Number(v))}
        items={kids.map((k) => ({ value: String(k.id), label: k.first_name || k.name }))} />
    </div>
  );
}

export function PersonLine({ name, detail, photo }: { name: string; detail?: string | null; photo?: string | null }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={name} src={photo || undefined} size={30} />
      <div className="min-w-0">
        <p className="truncate text-ink">{name}</p>
        {detail && <p className="truncate text-[12.5px] text-muted">{detail}</p>}
      </div>
    </div>
  );
}

/** "HH:MM" (24h) to "7:30 am". */
export function clock(t: string | null | undefined): string {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ap}`;
}

export function money(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(v));
}
