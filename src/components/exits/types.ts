/*
 * Shared types and helpers for the exit pages (board, detail, clearances, my resignation).
 */
import { api } from "@/lib/api";
import type { BadgeTone } from "@/components/ui-kit";

export type Clearance = {
  uuid: string; key: string; label: string; department: string; department_label: string | null;
  owner_employee_id: number | null; owner_name: string | null; due_date: string; status: "pending" | "cleared" | "not_applicable";
  items: { label: string; done: boolean; asset_assignment?: string }[]; remarks: string | null;
  recovery_amount: string | null; cleared_at: string | null; cleared_by: string | null; delayed: boolean; days_late: number;
  // on the clearance list
  exit_uuid?: string; employee_name?: string; last_working_day?: string; exit_type_label?: string;
};

export type Settlement = {
  status: string; due_date: string | null; handed_at: string | null; paid_on: string | null;
  payroll: { uuid: string; number: string | null; status: string; net: string | null } | null;
  working_days_left?: number; calendar_days_left?: number; state?: string;
};

export type Interview = {
  uuid: string; status: string; scheduled_on: string | null; interviewer_employee_id: number | null; interviewer_name: string | null;
  primary_reason_id: number | null; ratings: Record<string, number>; would_rejoin: string | null; would_recommend: number | null;
  answers: Record<string, string>; checklist: Record<string, boolean>; interviewer_notes: string | null; submitted_at: string | null;
  questions: { key: string; label: string }[]; rating_areas: Record<string, string>;
};

export type ExitRow = {
  uuid: string; number: string | null; employee_id: number; employee_uuid: string; name: string; employee_code: string | null;
  designation: string | null; department: string | null; manager_name: string | null; date_of_joining: string | null;
  exit_type: string; exit_type_label: string; reason_id: number | null; reason: string | null; reason_text: string | null;
  status: string; status_label: string; raised_by: string; resignation_date: string; proposed_last_day: string | null;
  last_working_day: string; days_to_last_day: number; notice_required_days: number; notice_served_days: number;
  notice_shortfall_days: number; notice_action: string; notice_action_label: string | null; notice_amount: string | null;
  notice_pay_in_lieu: string | null; clearances_done: number; clearances_total: number; clearances_delayed: number;
  settlement: Settlement; rehire_eligible: boolean | null; login_disabled_at: string | null; archived_at: string | null;
  completed_at: string | null; replacement_needed: boolean; created_at: string;
};

export type ExitDetail = ExitRow & {
  clearances: Clearance[];
  handovers: { uuid: string; kind: string; title: string; details: string | null; to_employee_id: number | null; to_name: string | null; status: string; done_at: string | null }[];
  handover_to_employee_id: number | null; handover_to_name: string | null; approvals_delegated_to_name: string | null;
  approvals_delegated_at: string | null; handover_notes: string | null;
  compensation: Record<string, string | number | boolean | null>;
  letters: { type: string; letter_uuid: string; title: string; at: string }[];
  interview: Interview | null;
  history: { at: string; by: string; kind: string; text: string }[];
  rehire_note: string | null; flow_name: string | null; alumni_until: string | null; withdraw_reason: string | null;
  alumni_link: string | null; outstanding_assets: { assignment_uuid: string; asset_tag: string; name: string; assigned_on: string }[];
  workflow?: { uuid: string; status: string } | null; can_manage?: boolean;
  leave_encashment?: { code: string; name: string; days: string | number }[];
  nominees?: { kind: string; name: string; relation: string | null; share_percent: string | number }[];
};

export type ExitMeta = {
  can_manage: boolean; statuses: Record<string, string>; types: Record<string, string>;
  type_rules: Record<string, { label: string; notice: boolean; letters: string[]; raised_by: string[] }>;
  notice_actions: Record<string, string>; clearance_departments: Record<string, string>;
  rating_areas: Record<string, string>; interview_questions: { key: string; label: string }[]; has_team: boolean;
};

export type Page<T> = { items: T[]; total: number; page: number; size: number };

export const STATUS_TONE: Record<string, BadgeTone> = {
  requested: "warn", in_progress: "info", completed: "neutral", withdrawn: "neutral", rejected: "bad", cancelled: "neutral",
};

export const SETTLEMENT_STATE: Record<string, { label: string; tone: BadgeTone }> = {
  not_started: { label: "Before the last day", tone: "neutral" },
  running: { label: "Clock running", tone: "warn" },
  due_today: { label: "Due today", tone: "bad" },
  overdue: { label: "Overdue", tone: "bad" },
  paid_on_time: { label: "Paid on time", tone: "good" },
  paid_late: { label: "Paid late", tone: "bad" },
};

export const LETTER_LABEL: Record<string, string> = {
  relieving: "Relieving letter", experience: "Experience letter", termination: "Termination letter",
};

export function money(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : String(v);
}

export function errMsg(e: unknown, fallback = "Something went wrong"): string {
  return e instanceof Error ? e.message : fallback;
}

/** Open a generated letter's PDF in a new tab (signed short-lived link from the API). */
export async function openLetter(uuid: string) {
  const win = window.open("", "_blank");
  try {
    const l = await api.get<{ file: { url: string } | null }>(`/letters/${uuid}`);
    const { resolveImageUrl } = await import("@/lib/api");
    if (l.file?.url && win) win.location.href = resolveImageUrl(l.file.url);
    else win?.close();
  } catch {
    win?.close();
  }
}

/** Id of the top-level exit reason that matches an exit type (for MasterSelect parentId). */
let reasonParents: Record<string, number> | null = null;
export async function reasonParentFor(exitType: string): Promise<number | null> {
  if (!reasonParents) {
    try {
      const r = await api.get<{ items: { value: number; code: string | null; parent_id: number | null }[] }>("/masters/options/exit_reason");
      reasonParents = {};
      for (const it of r.items) if (it.parent_id === null && it.code) reasonParents[it.code] = it.value;
    } catch {
      return null;
    }
  }
  const code = exitType === "layoff" ? "retrenchment" : exitType;
  return reasonParents[code] ?? null;
}
