/*
 * Shapes returned by the onboarding API (/onboarding/...).
 */
export type Page<T> = { items: T[]; total: number; page: number; size: number };

export type TaskRow = { uuid: string; title: string; status: string; due_date: string | null; assignee_name: string | null; labels: string[]; overdue: boolean };
export type TaskProgress = { items: TaskRow[]; total: number; done: number; overdue: number };
export type FileLink = { name?: string; url?: string | null; download_url?: string | null } | null;
export type Upload = { label: string; file_id: number; file_uuid: string; name: string; size: number; status: string; remark?: string | null; at: string; file?: FileLink };
export type FormDoc = { kind: string; label: string; file_id: number; file_uuid: string; at: string; file?: FileLink };
export type Checkin = {
  uuid: string; day: number; due_on: string; status: string; rating: number | null; went_well: string | null; concerns: string | null;
  support_needed: string | null; completed_at: string | null; completed_by: string | null; manager_employee_id: number | null; manager_name?: string | null;
};
export type ReviewEntry = { status: "accepted" | "sent_back" | "updated"; remark?: string | null; at?: string; by?: string };
export type HistoryItem = { at: string; by: string; kind: string; text: string };

export type Onboarding = {
  uuid: string; employee_id: number; employee_uuid: string; name: string; email: string; employee_code: string | null;
  designation: string | null; department: string | null; location: string | null; joining_date: string; days_to_join: number;
  status: string; status_label: string; employee_status: string; flow_name: string | null; flow_uuid: string | null;
  buddy_employee_id: number | null; buddy_name: string | null; hr_owner_employee_id: number | null; hr_owner_name: string | null;
  manager_name: string | null; portal_submitted_at: string | null; review_status: string; portal_percent: number;
  appointment_letter: boolean; forms_count: number; completed_at: string | null; created_at: string; tasks: TaskProgress | null;
};

export type OnboardingDetail = Onboarding & {
  portal_link: string | null; portal_enabled: boolean; portal_expires_at: string | null; portal_opened_at: string | null;
  portal_data: Record<string, unknown>; review: Record<string, ReviewEntry>; applied: Record<string, boolean>; review_keys: string[];
  completeness: { sections: number; filled: number; missing: string[]; percent: number };
  sections: { key: string; label: string }[]; required_documents: { label: string; required: boolean }[];
  uploads: Upload[]; forms: FormDoc[];
  account_requests: { kind: string; label: string; status: string; task_uuid?: string; ref?: string; at: string }[];
  induction: { title: string; day: number; time: string; duration_minutes: number; where?: string; host_name?: string | null; date: string }[];
  checkins: Checkin[]; history: HistoryItem[]; cancel_reason: string | null; welcome_sent_at: string | null; buzz_posted_at: string | null;
  day_one_started_at: string | null; stage_times: { label: string; days: number; longest?: boolean }[];
  appointment?: { uuid: string; status: string; reference_no: string | null; file: FileLink };
  tasks: TaskProgress;
};

export type Dashboard = {
  pre_joining: number; in_progress: number; completed: number; joining_this_week: number; to_review: number;
  missing_appointment_letter: number; checkins_due: number;
};

export type Meta = {
  can_manage: boolean; statuses: Record<string, string>; sections: Record<string, string>; owners: Record<string, string>;
  forms: Record<string, string>; account_kinds: Record<string, string>;
};

export type Audience = { department_ids?: number[]; location_ids?: number[]; employment_type_ids?: number[]; grade_ids?: number[] };

export type FlowTask = { title: string; owner: string; employee_id: number | null; employee_name?: string | null; stage: string; due_days: number; checklist: string[] };
export type Flow = {
  uuid: string; name: string; description: string | null; audience: Audience; priority: number; pre_joining_enabled: boolean;
  day_one_enabled: boolean; tasks: FlowTask[]; sections: string[]; documents: { label: string; required: boolean }[];
  induction: { title: string; day: number; time: string; duration_minutes: number; host_id?: number | null; where?: string }[];
  course_ids: number[]; statutory_forms: string[]; require_admin_closure: boolean; active: boolean; in_use: number;
};

export const STATUS_TONE: Record<string, "neutral" | "accent" | "good" | "warn" | "bad" | "info"> = {
  pre_joining: "info", day_one: "accent", in_progress: "accent", completed: "good", cancelled: "neutral",
};
export const REVIEW_TONE: Record<string, "neutral" | "accent" | "good" | "warn" | "bad" | "info"> = {
  pending: "neutral", submitted: "warn", sent_back: "bad", accepted: "good",
};
export const REVIEW_LABEL: Record<string, string> = {
  pending: "Not submitted", submitted: "To review", sent_back: "Sent back", accepted: "Accepted",
};

/** "date_of_birth" → "Date of birth", "gender_id" → "Gender". */
export function fieldLabel(key: string): string {
  const k = key.replace(/_id$/, "").replace(/_/g, " ");
  const map: Record<string, string> = {
    pan: "PAN", uan: "UAN", ifsc: "IFSC", esi_number: "ESI number", aadhaar: "Aadhaar", fy_tds: "Tax deducted this year",
    fy_taxable_income: "Taxable income this year",
  };
  return map[key] ?? k.charAt(0).toUpperCase() + k.slice(1);
}
