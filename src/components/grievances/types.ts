/* Shapes returned by /grievances (see backend modules/grievances/router.py). */
import type { BadgeTone } from "@/components/ui-kit";
import type { FileRef } from "@/components/workplace/files";

export type GrievanceMe = {
  sees_posh: boolean; sees_grievances: boolean; is_manager: boolean; is_ic_member: boolean; is_grc_member: boolean;
  is_owner: boolean; can_configure: boolean;
  settings: { allow_anonymous: boolean; posh_enabled: boolean; posh_filing_months: number };
  statuses: Record<string, string>; outcomes: Record<string, string>; roles: Record<string, string>;
};

export type TimelineStep = { key: string; label: string; due_on: string | null; done_on: string | null; state: string; note: string | null };

export type GMessage = {
  uuid: string; kind: "reply" | "note" | "event"; body: string; from_complainant: boolean; author: string | null;
  attachments: FileRef[]; created_at: string;
};

export type CommitteeMember = {
  uuid: string; employee_id: number | null; name: string | null; external_name: string | null; external_email: string | null;
  external_org: string | null; role: string; role_label: string; is_external: boolean;
};
export type Committee = {
  uuid: string; kind: "grievance" | "posh_ic"; name: string; description: string | null; constituted_on: string | null;
  valid_until: string | null; active: boolean; members: CommitteeMember[];
};

export type Grievance = {
  uuid: string | null; reference_no: string | null; kind: "grievance" | "posh"; category_id: number | null; category_name: string | null;
  subject: string; anonymous: boolean; status: string; status_label: string; received_on: string; created_at: string;
  closed_at: string | null; outcome: string | null; outcome_label: string | null; complainant_name: string | null;
  assigned_to_name: string | null; late_filing: boolean | null; next_due_on: string | null; next_due_label?: string;
  overdue: boolean; can_handle: boolean; is_complainant: boolean;
  // detail
  description?: string; incident_date?: string | null; incident_location?: string | null; witnesses?: string | null;
  respondent_name?: string | null; attachments?: FileRef[]; outcome_summary?: string | null; action_taken?: string | null;
  messages?: GMessage[]; timeline?: TimelineStep[]; delay_condoned?: boolean; delay_reason?: string | null;
  interim_relief?: string | null; conciliation?: boolean; filing_deadline?: string | null; inquiry_due_on?: string | null;
  report_due_on?: string | null; action_due_on?: string | null; assigned_to_employee_id?: number | null;
  committee?: Committee | null;
};

export const STATUS_TONE: Record<string, BadgeTone> = {
  submitted: "info", under_review: "accent", inquiry: "warn", report_submitted: "accent", resolved: "good",
  closed: "neutral", rejected: "neutral", withdrawn: "neutral",
};

export const OPEN_STATUSES = ["submitted", "under_review", "inquiry", "report_submitted"];
