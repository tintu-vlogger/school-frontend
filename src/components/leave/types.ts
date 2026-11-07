/*
 * Shapes returned by the leave API (/api/v1/leave/...).
 */
export type Page<T> = { items: T[]; total: number; page: number; size: number };

export type LeaveAccess = {
  employee_id: number | null; is_owner: boolean; can_manage: boolean; can_approve: boolean; can_configure: boolean; today: string;
  settings: { comp_off: boolean; extension: boolean; partial_cancel: boolean; cancel_reason_required: boolean; extension_reason_required: boolean };
};

export type GrantOption = { key: string; label: string; days: number };

export type TypeBrief = {
  uuid: string; id: number; code: string; name: string; color: string; icon: string; kind: string; description: string | null;
  active: boolean; paid: "paid" | "unpaid" | "lop"; mode: string; unit: string; allow_half_day: boolean; allow_quarter_day: boolean;
  allow_hourly: boolean; hours_per_day: number; grant_options: GrantOption[]; only_optional_holidays: boolean;
  document_after_days: number | null; yearly_quota: number | null; statutory: boolean;
};

export type BalanceCard = {
  type: TypeBrief; applicable: boolean; summary: string[]; year: number; year_text: string; opening: number; carried_in: number;
  accrued: number; granted: number; availed: number; adjusted: number; encashed: number; lapsed: number; carried_out: number;
  balance: number; booked: number; available: number; show_balance: boolean; to_come?: number;
  expiring_soon?: { days: number; expires_on: string }[];
};

export type Summary = {
  employee: { uuid: string; name: string; date_of_joining: string | null }; today: string; cards: BalanceCard[];
  holiday_calendar: string | null; work_week: string | null;
};

export type EmpBrief = { id: number; uuid: string; name: string; employee_code: string | null; photo: string | null; department: string | null };

export type LeaveRow = {
  uuid: string; reference_no: string | null; kind: "leave" | "extension"; employee: EmpBrief;
  leave_type: { uuid: string; code: string; name: string; color: string; icon: string };
  from_date: string; to_date: string; unit: string; half: string | null; hours: number | null;
  days: number; paid_days: number; lop_days: number; status: string; status_label: string; reason: string | null;
  on_behalf: boolean; created_at: string; my_task_uuid: string | null; can_modify: boolean; can_cancel: boolean; can_extend: boolean;
  has_attachment: boolean;
};

export type DayItem = {
  date: string; kind: string; amount: number; lop: number; holiday?: string; optional?: string[]; sandwich?: boolean;
  adjacent?: boolean; cancelled?: boolean; part?: string;
};

export type ApprovalTask = {
  uuid: string; step_name: string; approver_name: string; status: string; comment: string | null; decided_at: string | null;
  decided_by_name: string | null; created_at: string; mine: boolean;
};

export type LeaveDetail = LeaveRow & {
  breakdown: DayItem[]; history: { at: string; by: string; action: string; note?: string }[]; attachment_name: string | null;
  grant_option: string | null; cancel_dates: string[] | null; applied_by_name: string | null;
  approvals: { label: string; instance_uuid: string; status: string; reference_no: string | null; flow: string | null; created_at: string;
    completed_at: string | null; result_note: string | null; tasks: ApprovalTask[] }[];
  parent: { uuid: string; reference_no: string | null } | null;
  extensions: { uuid: string; reference_no: string | null; from_date: string; to_date: string; days: number; status: string }[];
};

export type Preview = {
  ok: boolean; errors: string[]; warnings: string[]; days: number; paid_days?: number; lop_days?: number; sandwich_days?: number;
  document_needed?: boolean; items: DayItem[]; on_behalf?: boolean;
  balance?: { years: { year: number; year_text: string; balance: number; booked: number; available: number; requested: number; after: number }[] };
  team_on_leave?: { name: string; from_date: string; to_date: string; status: string }[];
};

export type Holiday = {
  uuid: string | null; name: string; date: string; kind: "national" | "festival" | "optional" | "substitute"; kind_label: string; description: string | null;
  weekday: string; calendar?: { uuid: string; name: string }; taken?: string | null;
};

export type HolidayCalendar = {
  uuid: string; id: number; name: string; description: string | null; applicability: Applicability; is_default: boolean;
  priority: number; optional_limit: number; active: boolean; counts: { national: number; festival: number; optional: number };
  locations: { id: number; name: string }[];
};

export type Applicability = {
  mode?: "all" | "pickers" | "rule"; genders?: number[]; marital_statuses?: number[]; employment_types?: number[]; locations?: number[];
  states?: number[]; departments?: number[]; designations?: number[]; grades?: number[]; tags?: number[]; employees?: number[];
  exclude_employees?: number[]; min_tenure_days?: number; probation?: "any" | "only" | "exclude"; rule?: string;
};

export type WorkWeekDay = { mode: "working" | "off" | "half"; off_weeks?: number[] };
export type WorkWeek = {
  uuid: string; name: string; description: string | null; days: WorkWeekDay[]; applicability: Applicability; is_default: boolean;
  priority: number; active: boolean; working_days_per_week: number;
};
