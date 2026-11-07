"use client";

/*
 * Shared pieces for the attendance, roster, devices and timesheet pages:
 *   useAttendanceAccess()   what the signed-in person may do (manage, settings, roster, team size)
 *   STATUS                  label + colour classes for each day status
 *   StatusBadge, StatusDot  status display
 *   minutesText(m)          "7 h 30 min"
 *   postForm(), downloadFile()  file upload and authenticated download
 *   monthGrid(year, month)  weeks of a month (Monday first) for calendars
 */
import { useEffect, useState } from "react";
import { API_BASE, api } from "@/lib/api";
import { Badge } from "@/components/ui-kit";

export type Access = {
  employee_id: number | null;
  can_manage: boolean;
  can_settings: boolean;
  can_roster: boolean;
  can_timesheets: boolean;
  team_size: number;
  today: string;
};

export function useAttendanceAccess(): Access | null {
  const [a, setA] = useState<Access | null>(null);
  useEffect(() => {
    let live = true;
    api.getCached<Access>("/attendance/me/access", 60).then((x) => { if (live) setA(x); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return a;
}

export type DayStatus =
  | "present" | "absent" | "half_day" | "on_leave" | "holiday" | "weekly_off" | "wfh" | "on_duty"
  | "missing_punch" | "not_yet" | "upcoming";

/** Label, badge tone, a soft cell background and a dot colour for each status. */
export const STATUS: Record<string, { label: string; tone: "good" | "bad" | "warn" | "info" | "neutral" | "accent"; cell: string; dot: string; code: string }> = {
  present: { label: "Present", tone: "good", cell: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-500", code: "P" },
  absent: { label: "Absent", tone: "bad", cell: "bg-rose-50 text-rose-800", dot: "bg-rose-500", code: "A" },
  half_day: { label: "Half day", tone: "warn", cell: "bg-amber-50 text-amber-800", dot: "bg-amber-500", code: "HD" },
  on_leave: { label: "On leave", tone: "info", cell: "bg-sky-50 text-sky-800", dot: "bg-sky-500", code: "L" },
  holiday: { label: "Holiday", tone: "accent", cell: "bg-indigo-50 text-indigo-800", dot: "bg-indigo-400", code: "H" },
  weekly_off: { label: "Weekly off", tone: "neutral", cell: "bg-stone-100 text-stone-500", dot: "bg-stone-300", code: "WO" },
  wfh: { label: "Work from home", tone: "info", cell: "bg-teal-50 text-teal-800", dot: "bg-teal-500", code: "WFH" },
  on_duty: { label: "On duty", tone: "info", cell: "bg-cyan-50 text-cyan-800", dot: "bg-cyan-500", code: "OD" },
  missing_punch: { label: "Missing punch", tone: "warn", cell: "bg-orange-50 text-orange-800", dot: "bg-orange-500", code: "MP" },
  not_yet: { label: "Not in yet", tone: "neutral", cell: "bg-surface text-faint", dot: "bg-stone-300", code: "" },
  upcoming: { label: "Upcoming", tone: "neutral", cell: "bg-surface text-faint", dot: "bg-stone-200", code: "" },
};

export function statusInfo(s: string | null | undefined) {
  return STATUS[s || "upcoming"] ?? STATUS.upcoming;
}

export function StatusBadge({ status }: { status: string }) {
  const s = statusInfo(status);
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export function StatusDot({ status, className = "" }: { status: string; className?: string }) {
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusInfo(status).dot} ${className}`} />;
}

/** Colour classes for a shift colour name (stored on the shift). */
export const SHIFT_COLORS: Record<string, { chip: string; soft: string; dot: string }> = {
  indigo: { chip: "bg-indigo-100 text-indigo-800 border-indigo-200", soft: "bg-indigo-50", dot: "bg-indigo-500" },
  sky: { chip: "bg-sky-100 text-sky-800 border-sky-200", soft: "bg-sky-50", dot: "bg-sky-500" },
  emerald: { chip: "bg-emerald-100 text-emerald-800 border-emerald-200", soft: "bg-emerald-50", dot: "bg-emerald-500" },
  amber: { chip: "bg-amber-100 text-amber-800 border-amber-200", soft: "bg-amber-50", dot: "bg-amber-500" },
  rose: { chip: "bg-rose-100 text-rose-800 border-rose-200", soft: "bg-rose-50", dot: "bg-rose-500" },
  violet: { chip: "bg-violet-100 text-violet-800 border-violet-200", soft: "bg-violet-50", dot: "bg-violet-500" },
  teal: { chip: "bg-teal-100 text-teal-800 border-teal-200", soft: "bg-teal-50", dot: "bg-teal-500" },
  slate: { chip: "bg-slate-100 text-slate-800 border-slate-200", soft: "bg-slate-50", dot: "bg-slate-500" },
  orange: { chip: "bg-orange-100 text-orange-800 border-orange-200", soft: "bg-orange-50", dot: "bg-orange-500" },
  lime: { chip: "bg-lime-100 text-lime-800 border-lime-200", soft: "bg-lime-50", dot: "bg-lime-500" },
};
export const shiftColor = (c?: string | null) => SHIFT_COLORS[c || "indigo"] ?? SHIFT_COLORS.indigo;

export function minutesText(m: number | null | undefined): string {
  const v = Math.max(0, Math.round(m || 0));
  const h = Math.floor(v / 60), mm = v % 60;
  if (h && mm) return `${h} h ${mm} min`;
  if (h) return `${h} h`;
  return `${mm} min`;
}

/** "7:30" style hours for compact cells. */
export function hoursShort(m: number | null | undefined): string {
  const v = Math.max(0, Math.round(m || 0));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** ISO dates of a month laid out in weeks (Monday first); null pads the edges. */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const out: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
  return out;
}

/** Add days to a YYYY-MM-DD date. */
export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week of a YYYY-MM-DD date. */
export function mondayOf(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
}

export function weekdayIndex(iso: string): number {
  return (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function dayNumber(iso: string): number {
  return Number(iso.slice(8, 10));
}

export const REQUEST_KINDS: Record<string, string> = {
  regularisation: "Attendance correction", on_duty: "On duty", wfh: "Work from home",
  permission: "Permission hours", overtime: "Overtime pre-approval",
};

export function RequestStatus({ status }: { status: string }) {
  const tone = status === "approved" ? "good" : status === "rejected" ? "bad" : status === "pending" ? "warn" : "neutral";
  const label = { approved: "Approved", rejected: "Rejected", pending: "Waiting", cancelled: "Withdrawn" }[status] ?? status;
  return <Badge tone={tone} dot>{label}</Badge>;
}

function headers(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("hrms_token") : null;
  const h: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (typeof window !== "undefined") {
    const host = window.location.hostname.split(".");
    if (host.length > 1 && !["www", "api", "admin", "app"].includes(host[0])) h["X-Company-Slug"] = host[0];
  }
  return h;
}

/** POST a multipart form (file uploads) with the signed-in token. */
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: headers(), body: form });
  if (!res.ok) {
    let msg = "Upload failed";
    try { msg = (await res.json()).detail || msg; } catch { /* not JSON */ }
    throw new Error(typeof msg === "string" ? msg : "Upload failed");
  }
  return res.json();
}

/** Download a file (CSV export) from an authenticated endpoint. */
export async function downloadFile(path: string, name: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { headers: headers() });
  if (!res.ok) {
    let msg = "Download failed";
    try { msg = (await res.json()).detail || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Employee picker options from /employees/lookup. */
export async function lookupEmployees(q: string) {
  const rows = await api.get<{ value: number; label: string; hint?: string; uuid: string }[]>(
    `/employees/lookup?q=${encodeURIComponent(q)}&limit=20`);
  return rows.map((r) => ({ value: r.value, label: r.label, description: r.hint }));
}

export function errorText(e: unknown, fallback = "Something went wrong"): string {
  return e instanceof Error ? e.message : fallback;
}
