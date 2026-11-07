/* Shapes returned by /tasks (see backend modules/tasks/router.py). */
import type { BadgeTone } from "@/components/ui-kit";
import type { FileRef } from "@/components/workplace/files";

export type Recurrence = { freq: string; interval: number; until?: string | null } | null;

export type Task = {
  uuid: string; title: string; description: string | null; assignee_employee_id: number | null; assignee_name: string | null;
  created_by_employee_id: number | null; created_by_name: string | null; priority: string; status: string; status_label: string;
  start_date: string | null; due_date: string | null; completed_at: string | null; position: number; labels: string[];
  recurrence: Recurrence; remind_days_before: number; source_module: string | null; source_ref: string | null;
  checklist_total: number; checklist_done: number; comment_count: number | null; attachment_count: number;
  created_at: string; updated_at: string; can_edit: boolean; can_work: boolean;
  checklist?: { uuid: string; title: string; done: boolean; done_at: string | null; done_by_name: string | null }[];
  attachments?: FileRef[];
  comments?: { uuid: string; body: string; author_name: string | null; author_employee_id: number | null; created_at: string; attachments: FileRef[] }[];
  next_occurrence?: { uuid: string; due_date: string } | null;
};

export type TaskSummary = {
  open: number; overdue: number; due_today: number; done_this_week: number; team_open: number; is_admin: boolean; has_team: boolean;
  priorities: string[]; statuses: Record<string, string>; frequencies: Record<string, string>;
};

export const STATUS_TONE: Record<string, BadgeTone> = { todo: "neutral", in_progress: "info", done: "good", cancelled: "neutral" };
export const COLUMNS = [
  { key: "todo", label: "To do" }, { key: "in_progress", label: "In progress" }, { key: "done", label: "Done" },
] as const;

export function isOverdue(t: Pick<Task, "due_date" | "status">, today: string) {
  return !!t.due_date && t.due_date < today && (t.status === "todo" || t.status === "in_progress");
}
