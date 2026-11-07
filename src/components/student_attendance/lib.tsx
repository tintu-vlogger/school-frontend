"use client";

/*
 * Shared types and small pieces for the student attendance pages.
 *   <StatusPill status={s} active onClick />   <PctBar value={82.5} threshold={75} />
 *   uploadLeaveFile(file)                       // portal upload for leave notes / certificates
 *   pctText(82.456) -> "82.5%"
 */
import type { ReactNode } from "react";
import { API_BASE } from "@/lib/api";

export type AttStatus = {
  id: number; uuid: string; code: string; name: string; counts_as: number; in_total: boolean; is_absent: boolean;
  is_late: boolean; is_leave: boolean; color: string | null; sort_order: number; is_system: boolean; active: boolean;
};

export type Pct = { present: number; total: number; pct: number | null; absent: number; late: number; leave: number };

export type LeaveRow = {
  uuid: string; id: number; student_id: number; student_uuid: string | null; student_name: string | null;
  section_id: number | null; section_label: string | null; from_date: string; to_date: string; days: number;
  status_code: string; reason: string; attachments: { uuid: string; name: string; size: number; url?: string; download_url?: string }[];
  status: "pending" | "approved" | "rejected" | "cancelled"; requested_by_kind: string; requested_by_name: string | null;
  decided_by_name: string | null; decided_at: string | null; decision_note: string | null; created_at: string | null;
  waiting_for?: string[]; can_decide?: boolean;
};

export const LEAVE_TONE: Record<string, "warn" | "good" | "bad" | "neutral"> = {
  pending: "warn", approved: "good", rejected: "bad", cancelled: "neutral",
};
export const LEAVE_LABEL: Record<string, string> = {
  pending: "Waiting", approved: "Approved", rejected: "Not approved", cancelled: "Withdrawn",
};

export function pctText(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${Math.round(v * 10) / 10}%`;
}

export function pctTone(v: number | null | undefined, threshold = 75): string {
  if (v === null || v === undefined) return "text-faint";
  if (v < threshold) return "text-rose-600";
  if (v < threshold + 10) return "text-amber-600";
  return "text-emerald-700";
}

export function PctBar({ value, threshold = 75, className = "" }: { value: number | null | undefined; threshold?: number; className?: string }) {
  const v = value ?? 0;
  const color = value === null || value === undefined ? "bg-line" : v < threshold ? "bg-rose-400" : v < threshold + 10 ? "bg-amber-400" : "bg-emerald-500";
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="h-1.5 w-full min-w-[48px] overflow-hidden rounded-full bg-line/70">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} />
      </div>
      <span className={`tabular w-12 shrink-0 text-right text-[12.5px] ${pctTone(value, threshold)}`}>{pctText(value)}</span>
    </div>
  );
}

const FALLBACK: Record<string, string> = { P: "#30a46c", A: "#e5484d", L: "#f59e0b", HD: "#8e4ec6", EX: "#3e63dd", ML: "#0091ff", OD: "#12a594" };

export function statusColor(s: { code: string; color?: string | null } | undefined | null): string {
  if (!s) return "#9ca3af";
  return s.color || FALLBACK[s.code] || "#6b7280";
}

export function StatusPill({ status, active, onClick, disabled, size = "md", children }: {
  status: AttStatus; active: boolean; onClick?: () => void; disabled?: boolean; size?: "sm" | "md"; children?: ReactNode;
}) {
  const c = statusColor(status);
  const dim = size === "sm" ? "h-8 min-w-8 px-2 text-[12.5px]" : "h-9 min-w-10 px-2.5 text-[13px]";
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={status.name} aria-pressed={active}
      className={`inline-flex items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${dim}`}
      style={active ? { background: c, borderColor: c, color: "white" } : { borderColor: "var(--color-line, #e5e7eb)", color: c }}>
      {children ?? status.code}
    </button>
  );
}

export function CodeChip({ code, statuses, className = "" }: { code: string; statuses: AttStatus[]; className?: string }) {
  const s = statuses.find((x) => x.code === code);
  const c = statusColor(s ?? { code });
  return (
    <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-[11.5px] ${className}`}
      style={{ background: `${c}1f`, color: c }} title={s?.name}>{code}</span>
  );
}

function companyAddress(): string | null {
  if (typeof window === "undefined") return null;
  const host = window.location.hostname.toLowerCase();
  const roots = (process.env.NEXT_PUBLIC_ROOT_DOMAINS ?? "campusly.app,lvh.me,localhost").split(",").map((s) => s.trim());
  for (const root of roots) {
    if (host.endsWith(`.${root}`)) {
      const sub = host.slice(0, -(root.length + 1));
      if (sub && !sub.includes(".") && !["www", "api", "admin", "app"].includes(sub)) return sub;
    }
  }
  return null;
}

export async function uploadLeaveFile(file: File): Promise<{ uuid: string; name: string; size: number }> {
  const form = new FormData();
  form.append("file", file);
  const h: Record<string, string> = {};
  const token = typeof window !== "undefined" ? localStorage.getItem("hrms_token") : null;
  if (token) h.Authorization = `Bearer ${token}`;
  const slug = companyAddress();
  if (slug) h["X-Company-Slug"] = slug;
  const res = await fetch(`${API_BASE}/student-attendance/portal/uploads`, { method: "POST", headers: h, body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || "Couldn't upload the file");
  }
  return res.json();
}

/** Download a CSV (or any file) from the API with the sign-in token. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  const h: Record<string, string> = {};
  const token = localStorage.getItem("hrms_token");
  if (token) h.Authorization = `Bearer ${token}`;
  const slug = companyAddress();
  if (slug) h["X-Company-Slug"] = slug;
  const res = await fetch(`${API_BASE}${path}`, { headers: h });
  if (!res.ok) throw new Error("Couldn't download the file");
  const blob = await res.blob();
  const cd = res.headers.get("Content-Disposition") || "";
  const name = /filename="([^"]+)"/.exec(cd)?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function query(): URLSearchParams {
  return new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
}
