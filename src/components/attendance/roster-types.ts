/* Types shared by the roster page and its modals (shapes from /roster/grid and /shifts). */

export type Shift = {
  uuid: string; id: number; name: string; code: string; color: string; start_time: string; end_time: string;
  crosses_midnight: boolean; is_night: boolean; breaks: { name: string; start: string; end: string; paid: boolean }[];
  grace_in_minutes: number; grace_out_minutes: number; half_day_hours: number | null; full_day_hours: number | null;
  is_flexible: boolean; core_start: string | null; core_end: string | null; overtime_after_minutes: number;
  allowance_amount: string; allowance_min_hours: number | null; weekly_offs: number[]; is_default: boolean;
  active: boolean; description: string | null; scheduled_minutes: number;
};

export type Cell = {
  day_type: "working" | "weekly_off" | "holiday"; source: string; holiday_name: string | null; shift_id: number | null;
  status: "working" | "off" | "leave" | "half_day"; published: boolean; entry: boolean; on_leave: boolean;
};

export type GridRow = {
  employee_id: number; employee_uuid: string; name: string; employee_code: string | null; department_id: number | null;
  photo: string | null; woman: boolean; night_consent: boolean; cells: Record<string, Cell>;
};

export type Grid = {
  start: string; end: string; rows: GridRow[]; shifts: Shift[]; drafts: number;
  teams: { value: number; label: string }[]; can_manage: boolean;
};

export type Problem = { rule: string; action: string; date: string; message: string; employee_id?: number; employee_name?: string };

export type AssignResult = {
  saved: number; skipped: number; blocked: Problem[]; warnings: Problem[]; employees: number; days: number;
};

export type Pattern = {
  uuid: string; id: number; name: string; kind: "weekly" | "week_of_month" | "cycle"; kind_label: string;
  slots: Record<string, number | null> | Record<string, Record<string, number | null>> | (number | null)[];
  active: boolean; description: string | null;
};

export type Consent = {
  uuid: string; employee_id: number; employee_name: string | null; consent_date: string; valid_from: string;
  valid_to: string | null; safety_measures: string | null; withdrawn: boolean; recorded_by_name: string | null;
};

export function mergeResults(list: AssignResult[]): AssignResult {
  return list.reduce<AssignResult>((a, r) => ({
    saved: a.saved + r.saved, skipped: a.skipped + r.skipped, blocked: [...a.blocked, ...r.blocked],
    warnings: [...a.warnings, ...r.warnings], employees: a.employees + r.employees, days: Math.max(a.days, r.days),
  }), { saved: 0, skipped: 0, blocked: [], warnings: [], employees: 0, days: 0 });
}
