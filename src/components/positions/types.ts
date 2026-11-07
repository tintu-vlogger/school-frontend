/*
 * Shapes returned by /positions, /succession and /internal-jobs.
 */
export type Person = { id: number; uuid: string; name: string; code?: string | null; photo?: string | null };
export type Page<T> = { items: T[]; total: number; page: number; size: number };
export type SkillReq = { skill_id: number; level: number; name?: string | null };

export type Meta = {
  enabled: boolean; marketplace_enabled: boolean; require_position_on_hire: boolean;
  can_view: boolean; can_manage: boolean; can_succession: boolean; can_marketplace: boolean; can_pick: boolean; has_employee: boolean;
  statuses: Record<string, string>; fill_labels: Record<string, string>; request_kinds: Record<string, string>;
  plan_statuses: Record<string, string>; readiness: Record<string, string>; levels: Record<string, string>;
  action_kinds: Record<string, string>; action_statuses: Record<string, string>; bench_labels: Record<string, string>;
  posting_statuses: Record<string, string>; application_statuses: Record<string, string>; kinds: Record<string, string>;
  work_modes: Record<string, string>; financial_year: string; financial_years: string[];
};

export type Incumbent = Person & { seat_uuid: string; status: string; start_date: string };

export type Position = {
  id: number; uuid: string; code: string; title: string; description: string | null;
  status: "budgeted" | "approved" | "closed"; status_label: string;
  designation_id: number | null; designation: string | null; department_id: number | null; department: string | null;
  location_id: number | null; location: string | null; grade_id: number | null; grade: string | null;
  cost_centre_id: number | null; cost_centre: string | null;
  parent_id: number | null; parent_uuid: string | null; parent: string | null;
  headcount: number; fte: number; total_fte: number; salary_min: string | null; salary_max: string | null;
  is_critical: boolean; skills: SkillReq[];
  filled: number; reserved: number; vacant: number; fill_status: string; fill_label: string;
  incumbents: Incumbent[]; children: number; closed_reason: string | null;
  history?: { uuid: string; employee: Person | null; status: string; start_date: string; end_date: string | null; source: string; ended_reason: string | null }[];
  hiring_requests?: { uuid: string; number: string | null; title: string; openings: number; status: string }[];
  manager_id?: number | null;
  // tree only
  below?: number; below_filled?: number; below_vacant?: number; root?: boolean;
};

export type Summary = {
  positions: number; approved_seats: number; budgeted: number; filled: number; reserved: number; vacant: number;
  critical: number; pending_requests: number; enabled: boolean;
};

export type HeadcountPlan = {
  uuid: string; department_id: number; department: string | null; financial_year: string; current_year: boolean;
  planned_headcount: number; approved_headcount: number | null; budget: string | null; notes: string | null;
  status: string; status_label: string; position_seats: number; filled: number; employees: number;
  decision_note: string | null; created_by_name: string | null;
};

export type PositionRequest = {
  uuid: string; number: string | null; kind: string; kind_label: string;
  position: { uuid: string; code: string; title: string } | null; title: string | null; data: Record<string, unknown>;
  department: string | null; designation: string | null; reason: string | null; status: string;
  requested_by_name: string | null; decision_note: string | null; created_at: string; decided_at: string | null;
};

export type Talent = { rating: number | null; potential: number | null; box: number | null; box_label: string | null; cycle: string } | null;

export type Candidate = {
  uuid: string; employee: Person | null; employee_id: number; readiness: string; readiness_label: string; rank: number;
  strengths: string | null; gaps: string | null; talent: Talent;
};

export type Action = {
  uuid: string; employee_id: number; candidate_uuid: string | null; kind: string; kind_label: string; title: string;
  course_id: number | null; objective_id: number | null; linked: { type: string; title: string | null; status?: string } | null;
  mentor: Person | null; due_date: string | null; status: string; status_label: string; progress: number | null; notes: string | null;
};

export type SuccessionPlan = {
  uuid: string;
  position: { uuid: string; code: string; title: string; department: string | null; designation: string | null; location: string | null; is_critical: boolean; fill_status: string; fill_label: string };
  incumbents: Incumbent[]; plan_manager: Person | null; plan_manager_id: number | null;
  risk_of_loss: string; impact_of_loss: string; risk_label: string; impact_label: string; urgency: "urgent" | "watch" | "stable";
  notes: string | null; review_on: string | null; status: string;
  counts: Record<string, number>; successors: number; bench: string; bench_label: string;
  candidates: Candidate[]; actions?: Action[]; incumbent_talent?: Talent[];
};

export type Bench = {
  key_positions: number; plans: number; uncovered: { uuid: string; code: string; title: string }[]; coverage_pct: number;
  by_strength: Record<string, number>; strength_labels: Record<string, string>;
  ready_now: number; one_two_years: number; three_plus_years: number; unique_successors: number;
  urgent: SuccessionPlan[];
  by_department: { department: string; plans: number; ready_now: number; one_two_years: number; three_plus_years: number; strong: number; urgent: number }[];
  targets: { ready_now: number; total: number };
  plans_list: Pick<SuccessionPlan, "uuid" | "position" | "counts" | "successors" | "bench" | "bench_label" | "urgency" | "risk_label" | "impact_label" | "incumbents">[];
};

export type NineBoxPerson = Person & { rating: number | null; potential: number | null; box: number | null; box_label: string | null; cycle: string;
  pools: string[]; successor_for: { title: string; code: string; readiness_label: string }[] };
export type NineBox = { boxes: { box: number; label: string | null; people: NineBoxPerson[] }[]; unplaced: NineBoxPerson[]; reviewed: number };

export type Pool = {
  uuid: string; name: string; description: string | null; active: boolean; manager: Person | null; manager_employee_id: number | null;
  members_count: number; preview: Person[];
  members?: { uuid: string; employee: Person; employee_id: number; note: string | null; added_by_name: string | null; added_at: string; talent: Talent; designation: string | null; department: string | null }[];
};

export type Posting = {
  uuid: string; number: string | null; kind: "job" | "gig"; kind_label: string; title: string; description: string | null;
  status: string; status_label: string; department_id: number | null; department: string | null;
  designation_id: number | null; designation: string | null; location_id: number | null; location: string | null;
  position: { uuid: string; code: string; title: string } | null; requisition: { number: string | null; uuid: string } | null;
  skills: SkillReq[]; openings: number; duration_weeks: number | null; hours_per_week: number | null;
  work_mode: string | null; work_mode_label: string | null; starts_on: string | null; closes_on: string | null; closing_soon: boolean;
  hiring_manager: Person | null; hiring_manager_id: number | null; needs_manager_consent: boolean; applications: number;
  published_at: string | null; created_at: string; can_manage: boolean;
  my_match: number | null; my_match_detail: { skill_id: number; name: string | null; required: number; have: number; met: boolean }[];
  my_application: { uuid: string; status: string; status_label: string } | null;
};

export type Application = {
  uuid: string; status: string; status_label: string;
  posting: { uuid: string; title: string; kind: string; kind_label: string; status: string; number: string | null } | null;
  employee: Person | null; employee_id: number; designation: string | null; department: string | null; manager: Person | null;
  note: string | null; match_score: number | null;
  match_detail: { skill_id: number; name: string | null; required: number; have: number; met: boolean }[];
  manager_note: string | null; decision_note: string | null; effective_date: string | null; created_at: string; decided_at: string | null;
  talent?: Talent;
};
