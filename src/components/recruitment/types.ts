/*
 * Hiring types and small helpers shared by the recruitment pages.
 *   money(1200000) -> "₹12,00,000"   lakhs(1200000) -> "12 L"
 */
import type { BadgeTone } from "@/components/ui-kit";

export type Page<T> = { items: T[]; total: number; page: number; size: number };
export type Stage = { key: string; label: string; kind: string };
export type Question = { key: string; label: string; type: string; required: boolean; options: string[] };
export type TeamMember = { employee_id: number; role: string; name?: string | null };

export type Meta = {
  is_admin: boolean; can_offers: boolean; employee_id: number | null;
  sources: Record<string, string>; stage_kinds: Record<string, string>; work_modes: Record<string, string>;
  job_statuses: Record<string, string>; requisition_statuses: Record<string, string>; offer_statuses: Record<string, string>;
  recommendations: Record<string, string>; bgv_statuses: Record<string, string>; modes: Record<string, string>;
  referral_statuses: Record<string, string>; boards: Record<string, string>; scorers: string[];
  default_stages: Stage[]; competencies: { key: string; label: string }[];
};

export type JobCounts = { total: number; active: number; hired: number; rejected: number; by_stage: Record<string, number> };
export type Job = {
  uuid: string; code: string | null; title: string; slug: string; summary: string | null; description: string | null;
  department: string | null; department_id: number | null; designation_id?: number | null; designation?: string | null;
  location_id: number | null; location: string | null; location_text: string | null; work_mode: string; work_mode_label?: string;
  employment_type_id: number | null; employment_type: string | null; skills: string[]; nice_skills: string[];
  min_experience: number | null; max_experience: number | null; openings: number; published_at: string | null;
  closes_on: string | null; questions: Question[]; salary_min?: string | null; salary_max?: string | null; show_salary?: boolean;
  referral_bonus?: string | null; hiring_manager_id?: number | null; hiring_manager?: string | null; team?: TeamMember[];
  stages?: Stage[]; screening?: { auto_reject_below?: number | null; auto_shortlist_above?: number | null };
  postings?: Record<string, { status: string; at: string; message?: string; share?: string; ref?: string }>;
  status?: string; status_label?: string; published?: boolean; requisition_uuid?: string | null;
  requisition_number?: string | null; created_at?: string; counts?: JobCounts;
  share?: Record<string, string>;
};

export type Card = {
  uuid: string; candidate_uuid: string; candidate_name: string; current_title: string | null; current_company: string | null;
  total_experience: number | null; location: string | null; stage: string; position: number; status: string;
  score: number | null; source: string | null; source_label: string | null; tags: string[]; applied_at: string;
  stage_entered_at: string; recommendation: string | null; average_rating: number | null;
  next_interview: { starts_at: string; round_name: string } | null; offer_status: string | null; rejection_reason: string | null;
};

export type AppBrief = {
  uuid: string; job_uuid: string; job_title: string; stage: string; stage_label: string | null; status: string;
  score: number | null; applied_at?: string; rejection_reason?: string | null; stages?: Stage[];
};

export type Candidate = {
  uuid: string; id: number; first_name: string; last_name: string; name: string; email: string | null; phone: string | null;
  location: string | null; current_company: string | null; current_title: string | null; total_experience: number | null;
  current_ctc: string | null; expected_ctc: string | null; notice_days: number | null; skills: string[]; education: string | null;
  linkedin_url: string | null; source: string; source_label: string | null; source_detail: string | null; tags: string[];
  talent_pool: boolean; status: string; follow_up_on: string | null; follow_up_note: string | null;
  owner_employee_id: number | null; referred_by_employee_id: number | null; has_resume: boolean; consent_at: string | null;
  purge_after: string | null; created_at: string; owner_name?: string | null; referred_by_name?: string | null;
  notes?: string | null; consent_text?: string | null; resume?: { name: string; url: string } | null;
  resume_text?: string | null; duplicates?: { uuid: string; name: string; email: string | null; phone: string | null }[];
  applications?: AppBrief[]; referrals?: Referral[]; custom?: Record<string, unknown>;
};

export type ScorePart = { key: string; label: string; points: number; max: number; detail: string };
export type Scorecard = {
  uuid: string; interviewer_employee_id: number | null; interviewer_name: string | null; ratings: Record<string, number>;
  overall: number | null; recommendation: string | null; recommendation_label: string | null; strengths: string | null;
  concerns: string | null; notes: string | null; submitted_at: string | null;
};
export type Interview = {
  uuid: string; round_name: string; mode: string; mode_label: string; starts_at: string; ends_at: string;
  location: string | null; meeting_link: string | null; notes: string | null; status: string;
  panel: { employee_id: number; name: string | null }[]; application_uuid: string; candidate_uuid: string;
  candidate_name: string; job_uuid: string; job_title: string; scorecards_done: number; scorecards_total: number;
  my_scorecard?: Scorecard | null; kit?: { name: string; competencies: { key: string; label: string; description?: string }[]; questions: string[] };
  kit_uuid?: string | null; scorecards?: Scorecard[]; candidate?: Candidate; can_manage?: boolean;
};
export type Reference = {
  uuid: string; referee_name: string; referee_email: string | null; referee_phone: string | null; relationship: string | null;
  referee_company: string | null; status: string; sent_at: string | null; responded_at: string | null;
  responses: Record<string, string | number>; questions: { key: string; label: string; type: string }[];
};
export type BreakupLine = { code: string; label: string; kind: string; monthly: string; annual: string };
export type Offer = {
  uuid: string; number: string | null; status: string; status_label: string; candidate_uuid: string; candidate_name: string;
  candidate_email: string | null; application_uuid: string; job_uuid: string; job_title: string;
  designation_id: number | null; designation: string | null; department_id: number | null; department: string | null;
  location_id: number | null; location: string | null; employment_type_id: number | null; employment_type: string | null;
  reporting_manager_id: number | null; reporting_manager: string | null; joining_date: string; annual_ctc: string;
  joining_bonus: string | null; structure_id: number | null; breakup: BreakupLine[]; monthly_gross: string | null;
  band_min: string | null; band_max: string | null; outside_band: boolean; probation_months: number | null;
  notice_days: number | null; notes: string | null; expires_on: string | null; days_left: number | null;
  sent_at: string | null; viewed_at: string | null; responded_at: string | null; decline_reason: string | null;
  accepted_name: string | null; employee_id: number | null; created_at: string;
  history?: { at: string; by: string; text: string }[]; esign?: { required: boolean; status: string | null; signed?: boolean };
  letter?: { uuid: string; status: string; file: { url: string; name: string } | null }; portal_link?: string;
  workflow_uuid?: string | null; workflow_status?: string | null;
};
export type HistoryItem = { at: string; by: string; kind: string; text: string };
export type Application = AppBrief & {
  candidate: Candidate; answers: Record<string, string>; questions: Question[]; source: string | null;
  score_detail: { score?: number; scorer?: string; parts?: ScorePart[]; explanation?: string };
  evaluation: { count?: number; average?: number | null; competencies?: Record<string, number>; recommendations?: Record<string, number>; recommendation?: string | null; summary?: string };
  evaluation_override: { recommendation?: string; note?: string; by?: string; at?: string };
  bgv_status: string; bgv_status_label: string; bgv_vendor: string | null; bgv_notes: string | null; bgv_consent_at: string | null;
  history: HistoryItem[]; interviews: Interview[]; references: Reference[]; offers: Offer[]; can_manage: boolean; can_offer: boolean;
};
export type Referral = {
  uuid: string; referrer_employee_id: number; referrer_name: string | null; candidate_name: string; candidate_uuid: string | null;
  job_title: string | null; stage: string | null; bonus_amount: string | null; bonus_status: string; bonus_status_label: string;
  eligible_on: string | null; paid_on: string | null; payment_ref: string | null; note: string | null; created_at: string;
};
export type Requisition = {
  uuid: string; id: number; number: string | null; title: string; openings: number; kind: string;
  department_id: number | null; department: string | null; designation_id: number | null; designation: string | null;
  location_id: number | null; location: string | null; employment_type_id: number | null; employment_type: string | null;
  replacement_for_id: number | null; replacement_for: string | null; hiring_manager_id: number | null; hiring_manager: string | null;
  budget_min: string | null; budget_max: string | null; min_experience: number | null; max_experience: number | null;
  needed_by: string | null; justification: string | null; requested_by_name: string | null; requested_by_employee_id: number | null;
  status: string; status_label: string; decision_note: string | null; decided_at: string | null; created_at: string;
  jobs: { uuid: string; title: string; status: string }[]; workflow_uuid?: string | null;
};

export function money(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : String(v);
}
export function lakhs(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (n >= 10000000) return `${(n / 10000000).toFixed(n % 10000000 ? 1 : 0)} Cr`;
  return `${(n / 100000).toFixed(n % 100000 ? 1 : 0)} L`;
}
export function range(a: string | number | null | undefined, b: string | number | null | undefined, fmt = lakhs, unit = ""): string {
  if ((a === null || a === undefined || a === "") && (b === null || b === undefined || b === "")) return "—";
  return `${a !== null && a !== undefined && a !== "" ? fmt(a) : "—"} – ${b !== null && b !== undefined && b !== "" ? fmt(b) : "—"}${unit}`;
}
export const expRange = (a: number | null | undefined, b: number | null | undefined) =>
  a == null && b == null ? "Any experience" : `${a ?? 0}–${b ?? "+"} yrs`;

export const JOB_TONE: Record<string, BadgeTone> = { draft: "neutral", open: "good", on_hold: "warn", closed: "neutral", filled: "accent" };
export const REQ_TONE: Record<string, BadgeTone> = { draft: "neutral", pending: "warn", approved: "good", rejected: "bad", cancelled: "neutral", filled: "accent" };
export const OFFER_TONE: Record<string, BadgeTone> = {
  draft: "neutral", pending_approval: "warn", approved: "info", rejected: "bad", sent: "accent", accepted: "good",
  declined: "bad", expired: "neutral", withdrawn: "neutral",
};
export const APP_TONE: Record<string, BadgeTone> = { active: "info", rejected: "bad", withdrawn: "neutral", hired: "good" };
export const APP_LABEL: Record<string, string> = { active: "In the running", rejected: "Not moving ahead", withdrawn: "Withdrawn", hired: "Hired" };
export const REC_TONE: Record<string, BadgeTone> = { hire: "good", consider: "info", hold: "warn", reject: "bad", strong_yes: "good", yes: "good", no: "bad", strong_no: "bad" };
export const REC_LABEL: Record<string, string> = { hire: "Recommend hiring", consider: "Worth considering", hold: "Needs more input", reject: "Not recommended" };
export const BGV_TONE: Record<string, BadgeTone> = { not_started: "neutral", consent_pending: "warn", in_progress: "info", clear: "good", discrepancy: "warn", failed: "bad" };
export const REF_BONUS_TONE: Record<string, BadgeTone> = { in_process: "neutral", not_eligible: "neutral", pending: "info", eligible: "warn", approved: "accent", paid: "good", cancelled: "neutral" };

export function scoreTone(s: number | null | undefined): BadgeTone {
  if (s === null || s === undefined) return "neutral";
  return s >= 75 ? "good" : s >= 50 ? "info" : "warn";
}

export function errText(e: unknown) {
  return e instanceof Error ? e.message : "Something went wrong";
}

/** Job descriptions are simple HTML typed by HR: drop scripts, frames and inline handlers. */
export function safeHtml(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|iframe|object|embed|link|meta)[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "$1=\"#\"");
}
