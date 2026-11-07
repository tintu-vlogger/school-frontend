/*
 * Shapes returned by the learning API (/api/v1/learning/...).
 */

export type LessonKind = "video" | "file" | "text" | "assessment";

export type Lesson = {
  id: number; uuid: string; title: string; kind: LessonKind; duration_minutes: number; sort_order: number;
  locked: boolean; done: boolean; assessment_id: number | null; body?: string | null; url?: string | null; file_name?: string | null;
};

export type EnrolmentBrief = {
  uuid: string; status: "requested" | "enrolled" | "in_progress" | "completed" | "cancelled" | "rejected" | "expired";
  progress: number; due_date: string | null; mandatory: boolean; source: string; completed_at: string | null;
  certificate_no: string | null; score: number | null; passed: boolean | null; last_lesson_id: number | null; expires_on: string | null;
};

export type CourseStats = { learners?: number; enrolled?: number; completed?: number; in_progress?: number; requested?: number; overdue?: number; completion_pct?: number };

export type Course = {
  id: number; uuid: string; title: string; summary: string | null; description: string | null; category_id: number | null; category: string | null;
  level: "beginner" | "intermediate" | "advanced"; delivery: "online" | "classroom" | "blended"; cover: string | null; cover_image_url: string | null;
  duration_minutes: number; sequential: boolean; self_enrol: boolean; enrol_approval: boolean; mandatory: boolean;
  due_days: number | null; recert_months: number | null; assessment_id: number | null; certificate: boolean;
  status: "draft" | "published" | "archived"; tags: string[]; skill_ids: number[]; lesson_count: number; owner_name: string | null;
  enrolment: EnrolmentBrief | null; stats?: CourseStats;
  // my learning
  overdue?: boolean; days_left?: number | null;
};

export type Session = { id: string; date: string; start: string; end: string; topic: string };

export type BatchSeat = { uuid: string; employee: { id: number; uuid: string; name: string; photo?: string | null; department?: string | null } | null; status: "confirmed" | "waitlisted" | "cancelled"; attendance: Record<string, "present" | "absent"> };

export type Batch = {
  uuid: string; name: string; course_id: number; mode: "classroom" | "virtual"; venue: string | null; meeting_link: string | null;
  capacity: number; sessions: Session[]; status: "scheduled" | "completed" | "cancelled"; trainer: string | null;
  trainer_employee_id: number | null; trainer_name: string | null; confirmed: number; waitlisted: number; seats_left: number;
  my_seat: { uuid: string; status: string; position: number | null } | null; seats?: BatchSeat[];
  course?: { uuid: string; title: string };
};

export type AssessmentBrief = {
  id: number; uuid: string; title: string; description: string | null; selection: "fixed" | "random"; random_rule: { count?: number; categories?: string[]; difficulty?: string | null };
  question_ids?: number[]; time_limit_minutes: number | null; max_attempts: number | null; pass_pct: number;
  negative_marking: "none" | "fixed" | "percent"; negative_value: number; shuffle: boolean; show_answers: "after_submit" | "after_pass" | "never";
  final_score: "highest" | "latest"; status: "draft" | "published"; question_count: number;
  my_attempts?: number; in_progress?: string | null; best?: { pct: number; passed: boolean } | null; attempts_left?: number | null;
};

export type CourseDetail = Course & { lessons: Lesson[]; batches: Batch[]; assessment?: AssessmentBrief | null };

export type PathItem = { course_id: number; course_uuid: string; title: string; required: boolean; duration_minutes: number; cover: string | null; status: string | null; progress: number };
export type LearningPath = {
  uuid: string; id: number; title: string; description: string | null; kind: "plan" | "path"; sequential: boolean; due_days: number | null;
  status: string; items: PathItem[]; progress: number; completed: number; required: number;
};

export type MyLearning = {
  enrolments: Course[]; paths: LearningPath[];
  stats: { in_progress?: number; completed?: number; overdue?: number; certificates?: number; hours?: number };
};

export type QuestionKind = "single" | "multi" | "true_false" | "short";
export type QuestionOption = { id: string; text: string; correct?: boolean };
export type Question = {
  id: number; uuid: string; category: string; kind: QuestionKind; text: string; options: QuestionOption[]; marks: number;
  difficulty: "easy" | "medium" | "hard"; active: boolean; accepted_answers?: string[]; explanation?: string | null;
  result?: { id: number; answered: boolean; correct: boolean; marks: number; max: number };
};

export type AnswerValue = string | string[];

export type Attempt = {
  uuid: string; assessment: AssessmentBrief; number: number; status: "in_progress" | "submitted"; questions: Question[];
  answers: Record<string, AnswerValue>; started_at: string; deadline_at: string | null; seconds_left: number | null; submitted_at: string | null;
  score: number | null; max_score: number | null; pct: number | null; passed: boolean | null; reveal: boolean;
  summary: { correct: number; wrong: number; unanswered: number } | null;
};

export type Certificate = {
  certificate_no: string; title: string; text: string; employee: string; course: string; completed_on: string | null;
  expires_on: string | null; signatory: string; company: string; score: number | null;
};

export type CourseRequest = {
  uuid: string; title: string; reason: string | null; link: string | null; provider: string | null; estimated_cost: number | null;
  status: "pending" | "approved" | "rejected" | "cancelled" | "fulfilled"; requester: string | null; course_id: number | null;
  decision_note: string | null; created_at: string;
};

export type Rule = {
  uuid: string; name: string; course_id: number | null; path_id: number | null; target: { kind: "course" | "path"; id: number; title: string | null } | null;
  criteria: { all?: boolean; department_ids?: number[]; designation_ids?: number[]; condition?: string };
  mandatory: boolean; due_days: number | null; active: boolean; last_run_at: string | null; last_run_count: number;
};

export type EnrolmentRow = EnrolmentBrief & {
  employee: { id: number; uuid: string; name: string; photo?: string | null; department?: string | null } | null;
  course: { uuid: string; title: string }; overdue: boolean;
};

export type Summary = {
  courses: number; enrolments: number; completed: number; overdue: number; completion_pct: number; certificates: number;
  avg_score: number | null; pass_rate: number | null; pending_requests: number;
  by_department: { department: string; enrolled: number; completed: number; completion_pct: number }[];
  mandatory: { course_uuid: string; course: string; assigned: number; completed: number; overdue: number; expiring: number; completion_pct: number }[];
};

export type LearningSettings = { certificate_title: string; certificate_text: string; certificate_signatory: string; reminder_days_before_due: number };
export type LearningMe = { is_admin: boolean; is_manager: boolean; employee_id: number | null };
