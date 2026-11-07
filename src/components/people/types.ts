/*
 * Shared types, labels and small helpers for the people module (directory, profile,
 * org chart, documents). The full profile comes from GET /employees/{uuid}/profile
 * (or /me/profile/full for the signed-in employee).
 */
import { formatDate } from "@/lib/datetime";
import type { BadgeTone } from "@/components/ui-kit";

export type Person = { id: number; uuid: string; name: string; photo?: string | null; designation?: string | null; code?: string | null; status?: string };
export type TagRef = { id: number; uuid: string; name: string; color?: string | null; parent_id?: number | null; parent_name?: string | null };
export type Address = { line1?: string; line2?: string; city?: string; district?: string; state_id?: number | null; pincode?: string; country_id?: number | null; state_name?: string; country_name?: string };

export type DocumentRow = {
  uuid: string; document_type_id: number | null; document_type_name: string | null; category_name: string | null; title: string | null;
  document_number: string | null; issue_date: string | null; expiry_date: string | null; issued_by: string | null;
  verification_status: "pending" | "verified" | "rejected"; verification_label: string; verified_by_name: string | null; verified_at: string | null;
  remarks: string | null; remind_days_before: number; visible_to_employee: boolean; archived_at: string | null;
  expiry_state: "expired" | "expiring" | "valid" | null; days_to_expiry: number | null;
  file: { uuid: string; filename: string; content_type: string; size: number } | null; created_at: string;
  employee?: { uuid: string; name: string; code: string | null; photo: string | null };
};

export type HistoryItem = {
  uuid: string; change_type: string; change_label: string; effective_date: string; status: "applied" | "scheduled" | "cancelled";
  reason: string | null; remarks: string | null; items: { field: string; label: string; old: string | null; new: string | null }[];
  created_by_name: string | null; created_at: string;
};

export type SkillRow = { uuid: string; skill_id: number; skill_name: string; category_name: string | null; level: number; level_label: string; years: number | null; verified: boolean; verified_by_name: string | null; notes: string | null };

export type Row = Record<string, unknown> & { uuid: string; id: number };

export type Profile = {
  id: number; uuid: string; employee_code: string | null; greeting: string | null; first_name: string; middle_name: string | null; last_name: string;
  preferred_name: string | null; full_name: string; email: string; phone: string | null; role: string; active: boolean;
  status: string; status_label: string; profile_image_url: string | null; timezone: string | null; custom: Record<string, unknown>;
  config?: { timing?: Record<string, { working?: boolean; slots?: { start: string; end: string }[] }> } | null;
  gender_id: number | null; gender_name: string | null; date_of_birth: string | null; age: number | null;
  marital_status_id: number | null; marital_status_name: string | null; marriage_date: string | null;
  blood_group_id: number | null; blood_group_name: string | null; nationality_id: number | null; nationality_name: string | null;
  father_name: string | null; spouse_name: string | null;
  personal_email: string | null; alternate_phone: string | null; work_phone: string | null; extension: string | null;
  current_address: Address; permanent_address: Address;
  pan: string | null; aadhaar_masked: string | null; has_aadhaar: boolean; uan: string | null; esi_number: string | null;
  passport_number: string | null; passport_expiry: string | null; driving_licence: string | null; driving_licence_expiry: string | null;
  legal_entity_id: number | null; legal_entity_name: string | null; location_id: number | null; location_name: string | null; location_city: string | null;
  department_id: number | null; department_name: string | null; designation_id: number | null; designation_name: string | null;
  grade_id: number | null; grade_name: string | null; cost_centre_id: number | null; cost_centre_name: string | null;
  employment_type_id: number | null; employment_type_name: string | null; employee_status_id: number | null; employee_status_name: string | null;
  date_of_joining: string | null; probation_end_date: string | null; confirmation_date: string | null; notice_period_days: number | null;
  resignation_date: string | null; exit_date: string | null; work_mode: string | null; work_mode_label: string | null;
  rehire_count: number; archived_at: string | null;
  reporting_manager_id: number | null; reporting_manager: Person | null; secondary_manager_id: number | null; secondary_manager: Person | null;
  reportees: Person[]; tenure_years: number | null; previous_experience_years: number; total_experience_years: number;
  teams: { id: number; uuid: string; name: string; color: string | null; is_lead: boolean }[];
  tags: TagRef[]; skills: SkillRow[]; documents: DocumentRow[]; history: HistoryItem[];
  emergency_contacts: Row[]; family: Row[]; nominees: Row[]; bank_accounts: Row[]; education: Row[]; experience: Row[];
  nominee_totals: Record<string, number>; qualification: string | null;
  created_at: string; updated_at: string;
  permissions: { can_edit: boolean; can_verify: boolean; sensitive: boolean; is_self: boolean };
};

export type ListEmployee = {
  id: number; uuid: string; employee_code: string | null; greeting: string | null; first_name: string; last_name: string; preferred_name: string | null;
  email: string; phone: string | null; role: string; active: boolean; status: string; status_label: string | null;
  designation_name: string | null; department_name: string | null; location_name: string | null; legal_entity_name: string | null;
  grade_name: string | null; employment_type_name: string | null; date_of_joining: string | null; reporting_manager_name: string | null;
  reporting_manager_uuid: string | null; work_mode: string | null; tags: TagRef[]; profile_image_url: string | null;
};

export const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  pre_joining: { label: "Pre-joining", tone: "info" },
  probation: { label: "On probation", tone: "warn" },
  confirmed: { label: "Confirmed", tone: "good" },
  notice: { label: "On notice", tone: "bad" },
  exited: { label: "Exited", tone: "neutral" },
  archived: { label: "Archived", tone: "neutral" },
};

export const WORK_MODES = [
  { value: "office", label: "Office" }, { value: "hybrid", label: "Hybrid" }, { value: "remote", label: "Remote" }, { value: "field", label: "Field" },
];

export const CHANGE_TYPES = [
  { value: "transfer", label: "Transfer", description: "Another location" },
  { value: "promotion", label: "Promotion", description: "Higher designation or grade" },
  { value: "redesignation", label: "Designation change" },
  { value: "department_change", label: "Department change" },
  { value: "manager_change", label: "Manager change" },
  { value: "entity_transfer", label: "Company transfer", description: "Another legal entity in the group" },
  { value: "grade_change", label: "Grade change" },
  { value: "type_change", label: "Employment type change" },
  { value: "other", label: "Other change" },
];

export const NOMINEE_KINDS = [
  { value: "pf", label: "Provident Fund" }, { value: "eps", label: "Pension (EPS)" }, { value: "gratuity", label: "Gratuity" },
  { value: "insurance", label: "Insurance" }, { value: "other", label: "Other" },
];

export const ROLE_OPTIONS = [
  { value: "employee", label: "Employee", description: "Their own profile, leave and attendance" },
  { value: "manager", label: "Manager", description: "Also approves for their team" },
  { value: "hr", label: "HR", description: "Manages people records" },
  { value: "admin", label: "HR admin", description: "Full access, including settings" },
];

/** A calendar date (YYYY-MM-DD) for display. Dates have no time, so they are shown as stored. */
export function day(value: string | null | undefined) {
  return value ? formatDate(value, {}, "UTC") : null;
}

export function years(n: number | null | undefined) {
  if (n == null) return null;
  if (n < 1) {
    const m = Math.round(n * 12);
    return `${m} ${m === 1 ? "month" : "months"}`;
  }
  return `${n.toFixed(1).replace(/\.0$/, "")} ${n === 1 ? "year" : "years"}`;
}

export function money(n: unknown) {
  if (n === null || n === undefined || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) ? `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : null;
}

export function addressText(a?: Address | null) {
  if (!a) return null;
  const parts = [a.line1, a.line2, a.city, a.district, [a.state_name, a.pincode].filter(Boolean).join(" "), a.country_name && a.country_name !== "India" ? a.country_name : null];
  const s = parts.filter(Boolean).join(", ");
  return s || null;
}

export function displayName(e: { first_name: string; last_name: string; preferred_name?: string | null }) {
  return `${e.first_name} ${e.last_name}`.trim();
}

/** Download a protected file (documents, exports) with the signed-in token. */
export async function downloadWithAuth(path: string, fallbackName: string, open = false) {
  const { API_BASE } = await import("@/lib/api");
  const token = typeof window !== "undefined" ? localStorage.getItem("hrms_token") : null;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) {
    let msg = "Couldn't download the file";
    try { msg = (await res.json()).detail || msg; } catch { /* not JSON */ }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  if (open) window.open(url, "_blank", "noopener");
  else {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** POST a multipart form (file uploads) with the signed-in token. */
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  const { API_BASE } = await import("@/lib/api");
  const token = localStorage.getItem("hrms_token");
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: form });
  if (!res.ok) {
    let msg = "Upload failed";
    try { msg = (await res.json()).detail || msg; } catch { /* not JSON */ }
    throw new Error(typeof msg === "string" ? msg : "Upload failed");
  }
  return res.json();
}
