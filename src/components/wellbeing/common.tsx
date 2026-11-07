"use client";

/*
 * Shared bits for the wellbeing pages (health, discipline, visitors):
 *   const page = usePaged<Row>(path)     // server list {items, total} with refresh
 *   searchStudents(q)                    // Select loadOptions for learners
 *   searchStaff(q)                       // Select loadOptions for staff
 *   <StudentCell row={r} />              // avatar + name + section
 *   errMsg(err)                          // plain message from an API error
 */
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Avatar, Badge, type BadgeTone, type SelectOption } from "@/components/ui-kit";

export const STROKE = 1.4;

export type Paged<T> = { items: T[]; total: number; page: number; size: number };

export function usePaged<T>(path: string | null) {
  const [state, setState] = useState<{ path: string | null; nonce: number; data: Paged<T> | null; error: boolean } | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api.get<Paged<T>>(path)
      .then((data) => { if (live) setState({ path, nonce, data, error: false }); })
      .catch(() => { if (live) setState({ path, nonce, data: { items: [], total: 0, page: 1, size: 25 }, error: true }); });
    return () => { live = false; };
  }, [path, nonce]);
  const loading = !state || state.path !== path || state.nonce !== nonce;
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  return { data: state?.data ?? null, rows: state?.data?.items ?? [], total: state?.data?.total ?? 0, loading, error: !!state?.error, refresh };
}

export function useGet<T>(path: string | null) {
  const [state, setState] = useState<{ path: string; nonce: number; data: T | null } | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api.get<T>(path).then((data) => { if (live) setState({ path, nonce, data }); })
      .catch(() => { if (live) setState({ path, nonce, data: null }); });
    return () => { live = false; };
  }, [path, nonce]);
  const loading = !!path && (!state || state.path !== path || state.nonce !== nonce);
  return { data: state && state.path === path ? state.data : null, loading, refresh: useCallback(() => setNonce((n) => n + 1), []) };
}

export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "" && v !== false) p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function errMsg(err: unknown) {
  return err instanceof Error ? err.message : undefined;
}

type StudentRow = { id: number; name: string; admission_no: string; section_label: string | null; photo_url?: string | null };

export async function searchStudents(q: string): Promise<SelectOption<number>[]> {
  const r = await api.get<Paged<StudentRow>>(`/students${qs({ q, size: 20 })}`);
  return (r.items ?? []).map((s) => ({ value: s.id, label: s.name, description: [s.section_label, s.admission_no].filter(Boolean).join(" · ") }));
}

type StaffRow = { id: number; first_name: string; last_name: string; email?: string | null; designation_name?: string | null };

export async function searchStaff(q: string): Promise<SelectOption<number>[]> {
  const r = await api.get<StaffRow[]>(`/employees/?status=active${q ? `&search=${encodeURIComponent(q)}` : ""}`);
  return (Array.isArray(r) ? r : []).slice(0, 30).map((e) => ({ value: e.id, label: `${e.first_name} ${e.last_name}`.trim(), description: e.designation_name || e.email || undefined }));
}

export function StudentCell({ row }: { row: { student_name: string; section_label?: string | null; admission_no?: string | null; photo_url?: string | null } }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar name={row.student_name} src={row.photo_url} size={32} />
      <div className="min-w-0">
        <p className="truncate text-ink">{row.student_name}</p>
        <p className="truncate text-[12.5px] text-muted">{[row.section_label, row.admission_no].filter(Boolean).join(" · ")}</p>
      </div>
    </div>
  );
}

export const SEVERITY_TONE: Record<string, BadgeTone> = { low: "neutral", medium: "warn", high: "bad", critical: "bad" };
export const SEVERITIES = [
  { value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "critical", label: "Critical" },
];

export function SeverityBadge({ value }: { value: string }) {
  return <Badge tone={SEVERITY_TONE[value] ?? "neutral"} dot>{value.charAt(0).toUpperCase() + value.slice(1)}</Badge>;
}

export function PointsBadge({ value }: { value: number }) {
  if (!value) return <span className="text-faint">0</span>;
  return <span className={`tabular ${value > 0 ? "text-emerald-700" : "text-rose-700"}`}>{value > 0 ? `+${value}` : value}</span>;
}

/** Shrink a picked image to a small JPEG data URL (for visitor photos). */
export function fileToSmallDataUrl(file: File, max = 360): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read the image")); };
    img.src = url;
  });
}

/* ── Portal: which child ─────────────────────────────────────────────── */

export type MyChild = { id: number; name: string; section_label: string | null; photo_url: string | null };

/** Parents pick a child (remembered for the session); students see themselves. */
export function useMyChild() {
  const [children, setChildren] = useState<MyChild[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    api.get<MyChild[]>("/students/mine").then((r) => {
      if (!live) return;
      const rows = Array.isArray(r) ? r : [];
      setChildren(rows);
      let saved: number | null = null;
      try { saved = Number(sessionStorage.getItem("portal_child")) || null; } catch { /* storage blocked */ }
      setPicked(rows.find((c) => c.id === saved)?.id ?? rows[0]?.id ?? null);
    }).catch(() => { if (live) setChildren([]); });
    return () => { live = false; };
  }, []);
  const pick = (id: number) => { setPicked(id); try { sessionStorage.setItem("portal_child", String(id)); } catch { /* ignore */ } };
  return { children, studentId: picked, current: children?.find((c) => c.id === picked) ?? null, pick, ready: children !== null };
}
