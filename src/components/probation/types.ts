/*
 * Shapes returned by the probation API (/probation/...).
 */
import type { Audience } from "@/components/onboarding/types";

export type Reviewer = { level: number; type: string; value: string | number | null; label?: string; name?: string | null };

export type Policy = {
  uuid: string; name: string; description: string | null; audience: Audience; priority: number; duration_value: number;
  duration_unit: "days" | "months"; review_before_days: number; allow_extension: boolean; extension_value: number;
  extension_unit: "days" | "months"; max_extensions: number; max_total_months: number | null; reviewers: Reviewer[];
  feedback_from: Reviewer[]; auto_confirm: boolean; confirmation_letter: boolean; active: boolean; in_use: number;
};

export type Review = {
  uuid: string; round: number; level: number; kind: "review" | "feedback"; reviewer_employee_id: number | null; reviewer_name: string | null;
  status: string; rating: number | null; recommendation: string | null; recommendation_label: string | null;
  strengths: string | null; improvements: string | null; comments: string | null; submitted_at: string | null;
};

export type Probation = {
  uuid: string; employee_id: number; employee_uuid: string; name: string; employee_code: string | null; designation: string | null;
  department: string | null; manager_id: number | null; date_of_joining: string | null; start_date: string; original_end_date: string;
  end_date: string; days_left: number; review_starts_on: string; status: string; status_label: string; extensions: number;
  max_extensions: number | null; policy_name: string | null; outcome: string | null; outcome_label: string | null;
  outcome_reason: string | null; hold_reason: string | null; confirmation_date: string | null; decided_at: string | null;
  decided_by: string | null; reviews_done: number; reviews_total: number; overdue: boolean;
};

export type ProbationDetail = Probation & {
  reviews: Review[]; history: { at: string; by: string; kind: string; text: string }[];
  extension: { allowed: boolean; reason: string | null; new_end: string | null; left: number | null };
  policy: Policy | null; letter?: { uuid: string; status: string; file: { url?: string | null } | null };
};

export type Meta = { can_manage: boolean; statuses: Record<string, string>; outcomes: Record<string, string>; reviewer_types: Record<string, string> };
export type Dashboard = {
  by_status: Record<string, number>; ending_in_30_days: number; overdue: number;
  pending_by_reviewer: { employee_id: number; name: string | null; count: number }[];
};

export const STATUS_TONE: Record<string, "neutral" | "accent" | "good" | "warn" | "bad" | "info"> = {
  active: "info", in_review: "accent", extended: "warn", on_hold: "warn", confirmed: "good", terminated: "bad", cancelled: "neutral",
};
export const OPEN = ["active", "in_review", "extended", "on_hold"];
