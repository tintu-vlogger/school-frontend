/* Shapes returned by /api/v1/hostel (see backend/modules/hostel/router.py). */

export interface Block {
  id: number; uuid: string; name: string; code: string | null; gender: "boys" | "girls" | "mixed";
  warden_id: number | null; warden_name: string | null; warden_phone: string | null; assistant_ids: number[];
  assistants: { id: number; name: string }[]; floors: number | null; phone: string | null; address: string | null;
  notes: string | null; active: boolean; rooms: number; beds: number; occupied: number; free: number;
}

export interface Bed {
  id: number; uuid: string; label: string;
  occupant: { allocation_uuid: string; student_id: number; name: string; admission_no: string; check_in: string } | null;
}

export interface Room {
  id: number; uuid: string; block_id: number; block_name: string; floor: string | null; room_no: string;
  room_type: "single" | "double" | "triple" | "dorm"; beds: number; fee: string | null; amenities: string[];
  status: "open" | "maintenance"; notes: string | null; active: boolean; occupied: number; bed_list: Bed[];
}

export interface MessPlan { id: number; uuid: string; name: string; fee: string; description: string | null; active: boolean }

export interface Allocation {
  id: number; uuid: string; student_id: number; student_uuid: string; student_name: string; admission_no: string;
  gender: string | null; photo_url: string | null; section_label: string | null; block: string; block_id: number;
  room: string; floor: string | null; bed: string; bed_uuid: string; mess_plan: string | null; mess_plan_id: number | null;
  check_in: string; check_out: string | null; status: "active" | "checked_out"; fee_amount: string | null;
  fee_ref: string | null; notes: string | null;
}

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled" | "out" | "returned";

export interface Leave {
  id: number; uuid: string; student_id: number; student_name: string; admission_no: string; kind: "leave" | "outpass";
  from_at: string; to_at: string; reason: string | null; escort: string | null; requested_by: string | null;
  requested_via: "portal" | "staff"; status: LeaveStatus; decided_by?: string | null; decided_at: string | null;
  decision_note: string | null; out_at: string | null; returned_at: string | null; created_at: string;
}

export interface HostelVisitor {
  id: number; uuid: string; name: string; relation: string | null; phone: string | null; id_proof: string | null;
  purpose: string | null; in_at: string; out_at: string | null; logged_by: string | null; student_id: number | null;
  student_name: string | null; block_id: number | null; block: string | null;
}

export interface HostelSummary {
  beds: number; occupied: number; free: number; blocks: number; pending_leave: number; out_now: number;
  roll_call_taken: boolean; absent_tonight: number; visitors_inside: number;
}

export interface BoarderSummary {
  block: string; gender: string; room: string; floor: string | null; bed: string; room_type: string; check_in: string;
  mess_plan: string | null; warden: { name: string; phone: string | null } | null; hostel_phone: string | null;
}

export const LEAVE_TONE: Record<LeaveStatus, "warn" | "good" | "bad" | "neutral" | "info" | "accent"> = {
  pending: "warn", approved: "good", rejected: "bad", cancelled: "neutral", out: "info", returned: "neutral",
};
export const LEAVE_LABEL: Record<LeaveStatus, string> = {
  pending: "Waiting", approved: "Approved", rejected: "Not approved", cancelled: "Cancelled", out: "Away now", returned: "Back",
};
export const GENDER_LABEL = { boys: "Boys", girls: "Girls", mixed: "Mixed" } as const;
export const ROOM_TYPES = [
  { value: "single", label: "Single" }, { value: "double", label: "Double" }, { value: "triple", label: "Triple" }, { value: "dorm", label: "Dormitory" },
];
