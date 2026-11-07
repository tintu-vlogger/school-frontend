/*
 * Help desk shared types and small display helpers (status/priority badges, SLA chip).
 */
import { AlarmClock, CheckCircle2, PauseCircle, Timer } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui-kit";
import { PRIORITY_LABEL, PRIORITY_TONE, durationLabel } from "@/components/workplace/pickers";
import type { FileRef } from "@/components/workplace/files";

export type SlaPart = { due_at: string | null; state: "none" | "met" | "breached" | "paused" | "due_soon" | "running"; minutes_left: number | null; late_by_minutes: number | null };
export type Sla = { response: SlaPart; resolution: SlaPart };

export type CaseRow = {
  uuid: string; reference_no: string | null; subject: string; category_id: number; category_name: string | null;
  subcategory_id: number | null; subcategory_name: string | null; case_type_id: number | null; case_type_name: string | null;
  location_id: number | null; location_name: string | null; priority: string | null; status: string; status_label: string;
  source: string; requester_employee_id: number; requester_name: string | null; raised_by_name: string | null;
  assignee_employee_id: number | null; assignee_name: string | null; created_at: string; last_activity_at: string;
  resolved_at: string | null; closed_at: string | null; first_response_at: string | null; escalation_level: number;
  reopened_count: number; rating: number | null; rating_comment: string | null; sla: Sla | null; breached: boolean | null;
  can_handle: boolean; can_manage: boolean; is_requester: boolean; custom?: Record<string, unknown>;
};

export type Message = {
  uuid: string; kind: "reply" | "note" | "event"; body: string; author_name: string | null; author_employee_id: number | null;
  from_requester: boolean; attachments: FileRef[]; created_at: string;
};

export type CaseDetail = CaseRow & {
  description: string; attachments: FileRef[]; messages: Message[]; allowed_statuses: string[];
  can_reopen: boolean; can_rate: boolean; can_reply: boolean;
  requester: { name: string | null; email: string | null; employee_code: string | null; profile_image_url: string | null; department: string | null };
  agents?: { employee_id: number; name: string | null }[];
};

export type HelpdeskMe = {
  is_staff: boolean; is_admin: boolean; agent_of: number[]; owner_of: number[]; employee_id: number | null;
  counts: Record<string, number>;
  settings: {
    rating_enabled: boolean; rating_scale: number; rating_labels: Record<string, string[]>; thank_you_message: string;
    hide_priority_from_requester: boolean; allow_requester_reopen: boolean; reopen_window_days: number; raise_for_others: boolean;
  };
  priorities: string[]; statuses: Record<string, string>; sources: Record<string, string>;
};

export type Agent = { employee_id: number; name: string | null; location_id: number | null; location_name: string | null };
export type Category = {
  id: number; uuid: string; name: string; parent_id: number | null; description: string | null; icon: string | null;
  assignment_mode: string; owner_employee_id: number | null; owner_name: string | null;
  escalate_to_employee_id?: number | null; escalate_to_name?: string | null; require_subcategory: boolean;
  feedback_mandatory: boolean; default_priority: string; active: boolean; sort_order: number; open_cases: number;
  agents?: Agent[];
};

export type Page<T> = { items: T[]; total: number; page: number; size: number };

const STATUS_TONE: Record<string, BadgeTone> = {
  new: "accent", open: "info", in_progress: "info", waiting: "warn", resolved: "good", closed: "neutral", cancelled: "neutral",
};

export function StatusBadge({ status, label }: { status: string; label?: string | null }) {
  return <Badge tone={STATUS_TONE[status] ?? "neutral"} dot>{label || status}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string | null }) {
  if (!priority) return <span className="text-faint">—</span>;
  return <Badge tone={PRIORITY_TONE[priority] ?? "neutral"}>{PRIORITY_LABEL[priority] ?? priority}</Badge>;
}

/** The most pressing SLA target as a compact chip. */
export function SlaChip({ sla, status }: { sla: Sla | null; status: string }) {
  if (!sla) return <span className="text-faint">—</span>;
  const parts = [sla.response, sla.resolution];
  const late = parts.find((p) => p.state === "breached");
  if (late) {
    return <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] text-rose-600"><AlarmClock size={13} strokeWidth={1.4} />Late {durationLabel(late.late_by_minutes)}</span>;
  }
  if (["resolved", "closed", "cancelled"].includes(status)) {
    return <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] text-emerald-700"><CheckCircle2 size={13} strokeWidth={1.4} />Met</span>;
  }
  if (parts.some((p) => p.state === "paused")) {
    return <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] text-muted"><PauseCircle size={13} strokeWidth={1.4} />Paused</span>;
  }
  const running = parts.filter((p) => (p.state === "running" || p.state === "due_soon") && p.minutes_left !== null)
    .sort((a, b) => (a.minutes_left ?? 0) - (b.minutes_left ?? 0))[0];
  if (!running) return <span className="text-faint">—</span>;
  const soon = running.state === "due_soon";
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] ${soon ? "text-amber-700" : "text-muted"}`}><Timer size={13} strokeWidth={1.4} />In {durationLabel(running.minutes_left)}</span>;
}

export const QUEUES: { key: string; label: string; staff?: boolean }[] = [
  { key: "my_requests", label: "My requests" },
  { key: "mine", label: "Assigned to me", staff: true },
  { key: "unassigned", label: "Unassigned", staff: true },
  { key: "unmanaged", label: "Waiting to assign", staff: true },
  { key: "escalated", label: "Escalated", staff: true },
  { key: "open", label: "All open", staff: true },
];
