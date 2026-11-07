/*
 * Teaching and learning: shared types and helpers for staff and portal pages.
 *   const ref = await uploadLmsFile(file, portal)   // POST /lms/uploads or /lms/portal/uploads
 *   toISO("2026-11-08", "09:00")                     // local date + time -> UTC ISO
 *   splitISO(iso)                                     // UTC ISO -> { date, time } in the viewer's zone
 */
import { API_BASE } from "@/lib/api";
import { companyAddress } from "@/components/workplace/files";

export type FileRef = { uuid: string; name: string; size: number; content_type: string; url?: string | null; download_url?: string | null };

export type Allocation = {
  section_id: number; section_uuid: string; section_label: string; program_id: number; program_name: string | null;
  subject_id: number; subject_name: string; subject_code: string | null; teacher_id: number | null; teacher_name: string | null;
};

export type LmsOptions = {
  allocations: Allocation[]; can_manage: boolean; can_teach: boolean; can_settings: boolean; employee_id: number | null;
  settings: { video_provider: string; jitsi_domain: string; homework_allow_late: boolean; homework_default_due_hour: number;
    quiz_default_time_limit: number; quiz_show_answers: string; join_early_minutes: number };
};

export type Page<T> = { items: T[]; total: number; page: number; size: number };
export type SectionRef = { id: number; label: string | null };

export type Homework = {
  id: number; uuid: string; title: string; instructions: string | null; kind: string; subject_id: number; subject_name: string | null;
  program_id: number | null; section_ids: number[]; sections: SectionRef[]; attachments: FileRef[]; assigned_on: string | null;
  due_at: string; max_marks: string | null; submission_type: "online" | "offline"; allow_late: boolean; status: string;
  created_by_employee_id?: number | null; created_by_name: string | null; created_at: string; is_overdue: boolean;
  counts?: { learners: number; submitted: number; late: number; graded: number; to_grade: number; pending: number } | null;
};

export type SubmissionInfo = {
  uuid: string; status: string; content: string | null; attachments: FileRef[]; submitted_at: string | null; is_late: boolean;
  attempts: number; marks: string | null; feedback: string | null; graded_at: string | null; returned_at: string | null;
};

export type PortalHomework = Homework & { state: string; submission: SubmissionInfo | null; can_submit: boolean };

export type Material = {
  id: number; uuid: string; title: string; description: string | null; kind: "file" | "link" | "video" | "note"; url: string | null;
  youtube_id: string | null; embed_url: string | null; attachments: FileRef[]; program_id: number; program_name: string | null;
  subject_id: number; subject_name: string | null; unit_id: number | null; unit_title: string | null; topic_id: number | null;
  topic: string | null; section_ids?: number[]; sections?: SectionRef[]; published: boolean; view_count?: number;
  created_by_employee_id?: number | null; created_by_name: string | null; created_at: string;
};

export type LiveClass = {
  id: number; uuid: string; series_uuid: string | null; title: string; agenda: string | null; section_id: number; section_label: string;
  subject_id: number | null; subject_name: string | null; teacher_id: number | null; teacher_name: string | null;
  starts_at: string; ends_at: string; duration_min: number; provider: string; provider_label: string; status: string;
  phase: "upcoming" | "open" | "live" | "ended" | "cancelled"; recording_url: string | null; started_at: string | null;
  ended_at: string | null; cancel_reason: string | null; notes?: string | null; join_url?: string | null;
  meeting_code?: string | null; passcode?: string | null; room_name?: string | null; joined?: number | null;
  attended?: boolean; series_count?: number;
};

export type JoinInfo = LiveClass & { display_name: string | null; is_moderator: boolean; jitsi_domain: string | null; room_name: string | null; join_url: string | null };

export type Question = {
  id: number; uuid: string; subject_id: number; subject_name: string | null; program_id: number | null; topic_id: number | null;
  topic: string | null; kind: QuestionKind; kind_label: string; prompt: string; options: { key: string; text: string }[];
  answer?: unknown; explanation?: string | null; marks: string; negative_marks: string; difficulty: "easy" | "medium" | "hard";
  tags: string[]; active: boolean; created_at: string;
};
export type QuestionKind = "single" | "multiple" | "true_false" | "short" | "numeric" | "long";

export type Quiz = {
  id: number; uuid: string; title: string; instructions: string | null; kind: string; subject_id: number; subject_name: string | null;
  program_id: number | null; mode: "fixed" | "random"; random_rules: RandomRule[]; time_limit_min: number | null;
  attempts_allowed: number; shuffle_questions: boolean; shuffle_options: boolean; opens_at: string | null; closes_at: string | null;
  show_answers: string; pass_percent: string | null; status: string; window: string; section_ids: number[]; sections: SectionRef[];
  question_count: number; total_marks: string; created_by_name: string | null; created_at: string;
  stats?: { attempted: number; to_mark: number; average: number | null } | null;
  questions?: (Question & { quiz_marks: string | null; sort_order: number })[]; has_attempts?: boolean;
};
export type RandomRule = { count: number; difficulty?: string | null; topic?: string | null; tag?: string | null };

export type AttemptItem = {
  no: number; question_id: number; kind: QuestionKind; prompt: string; options: { key: string; text: string }[]; marks: string;
  response: unknown; score?: string | null; correct?: boolean | null; feedback?: string | null; auto?: boolean;
  answer?: unknown; explanation?: string | null;
};
export type Attempt = {
  uuid: string; attempt_no: number; status: string; started_at: string; deadline_at: string | null; submitted_at: string | null;
  score: string | null; max_score: string | null; needs_marking: boolean; items: AttemptItem[]; server_now: string;
  student_id: number; show_answers: boolean; student_name?: string | null;
  quiz?: { uuid: string; title: string; instructions?: string | null; time_limit_min?: number | null; subject_name?: string | null; show_answers?: string; window?: string };
};

export const KIND_LABELS: Record<string, string> = { homework: "Homework", assignment: "Assignment", project: "Project" };
export const PROVIDERS = [
  { value: "jitsi", label: "Built-in video room" }, { value: "zoom", label: "Zoom" }, { value: "meet", label: "Google Meet" },
  { value: "teams", label: "Microsoft Teams" }, { value: "other", label: "Other link" },
];
export const QUESTION_KINDS: { value: QuestionKind; label: string }[] = [
  { value: "single", label: "Single choice" }, { value: "multiple", label: "Multiple choice" }, { value: "true_false", label: "True / false" },
  { value: "short", label: "Short answer" }, { value: "numeric", label: "Number" }, { value: "long", label: "Long answer" },
];

function headers(): Record<string, string> {
  const h: Record<string, string> = {};
  const token = typeof window !== "undefined" ? localStorage.getItem("hrms_token") : null;
  if (token) h.Authorization = `Bearer ${token}`;
  const slug = companyAddress();
  if (slug) h["X-Company-Slug"] = slug;
  return h;
}

export async function uploadLmsFile(file: File, portal = false): Promise<FileRef> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/lms/${portal ? "portal/" : ""}uploads`, { method: "POST", headers: headers(), body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail || "Couldn't upload the file");
  }
  return res.json();
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date + "HH:MM" (viewer's timezone) to a UTC ISO string. */
export function toISO(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
}

/** A UTC ISO string to the viewer's local { date, time }. */
export function splitISO(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Unique sections / subjects / programs from allocation rows. */
export function uniqueBy<T, K>(rows: T[], key: (r: T) => K): T[] {
  const seen = new Set<K>();
  return rows.filter((r) => (seen.has(key(r)) ? false : (seen.add(key(r)), true)));
}

export function percent(n: number, of: number) {
  return of > 0 ? Math.round((n * 100) / of) : 0;
}
