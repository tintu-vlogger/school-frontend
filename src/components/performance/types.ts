/*
 * Shapes returned by the performance API (/api/v1/performance/...).
 */

export type Person = {
  id: number; uuid: string; name: string; photo?: string | null;
  designation?: string | null; department?: string | null; department_id?: number | null;
} | null;

export type PerfMe = {
  employee_id: number | null; is_admin: boolean; can_increments: boolean; is_manager: boolean; team_size: number;
  pending_reviews: number; overdue_reviews: number; feedback_requests: number; pending_acks: number; peer_approvals: number;
  goals: GoalSummary;
};

export type GoalStatus = { key: string; label: string; color: string; auto_min: number | null };

export type PerfSettings = {
  okr: { cycle_start_month: number; period_kind: string; statuses: GoalStatus[]; auto_status: boolean; grace_days: number; levels: string[]; max_objectives_per_person: number };
  nine_box: { labels: Record<string, string> };
  reviews: { reminder_min_hours: number; reminder_max_per_day: number; escalate_after_days: number; hide_self_review_from_manager: boolean; allow_response: boolean };
  feedback: { allow_anonymous: boolean; default_visibility: string };
  letters: { review_template: string; increment_template: string };
};

export type Period = { id: number; uuid: string; name: string; kind: "quarter" | "half" | "year" | "custom"; start_date: string; end_date: string; status: string; current: boolean };

export type Milestone = { id: string; title: string; due_date: string | null; weight: number; done: boolean; done_on: string | null };

export type CheckinFlag = { planned: string; state: "on_time" | "late" | "missed" | "upcoming"; checked_in: string | null };

export type KeyResult = {
  id: number; uuid: string; title: string; kind: "number" | "percent" | "milestone" | "boolean"; unit: string | null;
  start_value: number; target_value: number; current_value: number; milestones: Milestone[]; weight: number;
  owner: Person; start_date: string; due_date: string; checkin_frequency: "weekly" | "fortnightly" | "monthly" | "none";
  progress: number; confidence: number | null; status_key: string | null; expected_progress: number; deviation: number;
  checkin_plan: CheckinFlag[]; missed_checkins: number; late_checkins: number; next_checkin: string | null;
};

export type Objective = {
  id: number; uuid: string; title: string; description: string | null; level: "company" | "department" | "team" | "individual";
  period: { id: number; name: string; start_date: string; end_date: string };
  owner: Person; department: { id: number; name: string } | null; parent_id: number | null; weight: number;
  progress: number; status_key: string | null; status_manual: boolean; confidence: number | null; due_date: string | null;
  visibility: "everyone" | "team" | "private"; expected_progress: number; key_results: KeyResult[]; children_count: number;
  missed_checkins: number; can_edit: boolean; archived: boolean; created_at: string | null;
  // detail only
  parent?: { id: number; uuid: string; title: string; level: string; progress: number } | null;
  children?: { id: number; uuid: string; title: string; level: string; progress: number; weight: number; status_key: string | null; owner: Person }[];
  checkins?: { id: number; uuid: string; key_result_id: number | null; key_result: string | null; date: string; value: number | null; progress: number | null; confidence: number | null; status_key: string | null; note: string | null; author: string | null; created_at: string | null }[];
};

export type TreeNode = Objective & { children: TreeNode[] };

export type GoalSummary = {
  period_id: number | null; my_count: number; my_progress: number; company_progress: number; company_count: number;
  checkins_due: { objective: string; objective_uuid: string; key_result: string; next_checkin: string | null; missed: number }[];
  missed_total: number;
};

export type ScalePoint = { value: number; label: string; description?: string; color?: string | null };
export type RatingScale = { id: number; uuid: string; name: string; description: string | null; points: ScalePoint[]; is_default: boolean; active: boolean };

export type Tags = { department_ids?: number[]; designation_ids?: number[]; location_ids?: number[] };
export type Kra = { id: number; uuid: string; title: string; description: string | null; measure: string | null; weight: number; tags: Tags; active: boolean };
export type Competency = {
  id: number; uuid: string; name: string; category: string | null; description: string | null; rating_scale_id: number | null;
  weight: number; behaviours: { value: number; text: string }[]; skill_ids: number[]; tags: Tags; active: boolean;
};

export type TemplateQuestion = { id: string; text: string; type: "rating" | "text"; required: boolean };
export type TemplateSection = { key: string; kind: "goals" | "kras" | "competencies" | "questions"; title: string; description?: string; weight: number; questions: TemplateQuestion[] };
export type ReviewTemplate = { id: number; uuid: string; name: string; description: string | null; rating_scale_id: number | null; sections: TemplateSection[]; active: boolean };

export type Stage = { key: "self" | "peer" | "manager" | "skip" | "calibration"; label: string; enabled: boolean; deadline: string | null };
export type CycleSettings = {
  peer: { min: number; max: number; nominate_by: "employee" | "manager"; needs_approval: boolean };
  calibration: { enabled: boolean; distribution: Record<string, number>; require_ack: boolean; require_reason: boolean };
  letters: boolean; manager_sees_self_review: boolean;
};
export type ParticipantRule = { department_ids: number[]; designation_ids: number[]; condition: string; include_ids: number[]; exclude_ids: number[]; joined_before: string | null };
export type CycleStats = {
  participants: number; published: number; forms_total: number; forms_submitted: number; completion: number; overdue: number;
  by_type: Record<string, { total: number; submitted: number; overdue: number }>;
};
export type Cycle = {
  id: number; uuid: string; name: string; kind: "annual" | "half_yearly" | "quarterly" | "probation";
  status: "draft" | "active" | "calibration" | "published" | "closed";
  template: ReviewTemplate | null; rating_scale: { id: number; name: string; points: ScalePoint[] } | null;
  goal_period_id: number | null; goal_period: string | null; period_start: string; period_end: string;
  participant_rule: ParticipantRule; stages: Stage[]; weightage: Record<string, number>; settings: CycleSettings;
  launched_at: string | null; published_at: string | null; stats?: CycleStats;
};

export type FormSummary = {
  uuid: string; reviewer_type: "self" | "manager" | "peer" | "skip"; status: "nominated" | "pending" | "draft" | "submitted" | "declined";
  reviewer: { name: string } & Partial<NonNullable<Person>>; employee: Person; participant_uuid: string;
  cycle: { uuid: string; name: string; status: string }; due_date: string | null; overdue: boolean; submitted_at: string | null; score: number | null;
  nominated_by?: string | null;
};

export type FormItem = {
  ref: string; title: string; weight: number; detail?: string | null; progress?: number; suggested?: number | null;
  behaviours?: { value: number; text: string }[]; category?: string | null; type?: "rating" | "text"; required?: boolean;
};
export type FormSection = TemplateSection & { items: FormItem[] };
export type Answers = { items: Record<string, { rating?: number | null; comment?: string }>; summary?: string };
export type FormDetail = FormSummary & {
  sections: FormSection[]; answers: Answers; scale: { name: string; points: ScalePoint[] } | null;
  others: { reviewer_type: string; reviewer: string; answers: Answers; score: number | null }[];
  editable: boolean; weightage: Record<string, number>; can_nominate_peers: boolean;
  peers: { uuid: string; name: string; status: string }[];
};

export type ParticipantRow = {
  uuid: string; employee: Person; manager: Person; department_id: number | null; status: string; scores: Record<string, number>;
  computed_score: number | null; proposed_rating: number | null; proposed_label: string | null;
  calibrated_rating: number | null; calibrated_label: string | null; calibration_reason: string | null; calibrated_by: string | null;
  current_rating: number | null; current_label: string | null; final_rating: number | null; final_label: string | null;
  ack_status: "pending" | "accepted" | "declined" | null; ack_note: string | null; potential: 1 | 2 | 3 | null;
  box: number | null; box_label: string | null; published_at: string | null; has_letter: boolean;
  response: "agree" | "disagree" | null; response_note: string | null;
  forms: { uuid: string; reviewer_type: string; status: string; reviewer: string; due_date: string | null; overdue: boolean; score: number | null; reminders: number; escalated: boolean }[];
  cycle?: { uuid: string; name: string; status?: string };
};

export type DistributionRow = { value: number; label: string | null; count: number; actual_pct: number; target_pct: number; target_count: number | null; gap: number | null };
export type Board = { cycle: Cycle; participants: ParticipantRow[]; distribution: DistributionRow[]; unrated: number; pending_ack: number; declined_ack: number };
export type NineBox = { cycle: Cycle; boxes: { box: number; label: string | null; people: ParticipantRow[] }[]; unplaced: ParticipantRow[] };

export type MyResult = {
  uuid: string; cycle: { uuid: string; name: string; status: string; period_start: string; period_end: string };
  published: boolean; final_rating: number | null; final_label: string | null; scale: ScalePoint[]; manager_summary: string | null;
  has_letter: boolean; response: string | null; response_note: string | null; published_at: string | null;
  forms: { reviewer_type: string; status: string }[];
};

export type Letter = { letter_no: string | null; body: string; employee: string; cycle: string; generated_at?: string | null; released_at?: string | null };

export type AgendaItem = { id: string; text: string; by?: string; done: boolean; owner?: string | null };
export type Meeting = {
  uuid: string; title: string; manager: Partial<NonNullable<Person>> & { name: string }; employee: Person; scheduled_at: string;
  duration_minutes: number; recurrence: "none" | "weekly" | "fortnightly" | "monthly"; status: "scheduled" | "done" | "cancelled";
  agenda: AgendaItem[]; shared_notes: string | null; action_items: AgendaItem[]; is_participant: boolean;
  role: "manager" | "employee" | "admin"; private_note?: string;
};

export type FeedbackItem = {
  uuid: string; giver: Partial<NonNullable<Person>> & { name: string }; receiver: Person; requested_by: Person;
  status: "requested" | "given" | "declined"; prompt: string | null; message: string | null; kind: "feedback" | "praise" | "suggestion";
  visibility: "private" | "manager"; competency_id: number | null; given_at: string | null; created_at: string; mine_to_answer: boolean;
};

export type PipGoal = { id: string; title: string; measure: string; due_date: string | null; status: "open" | "met" | "not_met" };
export type PipItem = {
  uuid: string; employee: Person; manager: Person; reason: string; start_date: string; end_date: string;
  status: "draft" | "active" | "extended" | "closed"; goals: PipGoal[]; support: string | null;
  outcome: "successful" | "extended" | "unsuccessful" | null; outcome_note: string | null; days_left: number; time_pct: number;
  goals_met: number; acknowledged_at: string | null;
  checkins: { uuid: string; date: string; rating: "on_track" | "some_progress" | "off_track" | null; note: string; author: string | null }[];
  can_manage: boolean; is_mine: boolean;
};

export type Band = { label: string | null; min: number | null; max: number | null };
export type Guidelines = { bands: Band[]; rows: { rating: number; pcts: number[] }[] };
export type BudgetRow = {
  department_id: number | null; department: string; budget_pct: number | null; budget: number; current_payroll: number;
  proposed: number; approved: number; remaining: number; used_pct: number | null;
};
export type IncrementCycle = {
  uuid: string; id: number; name: string; status: "draft" | "open" | "released" | "closed";
  review_cycle: { id: number; uuid: string; name: string } | null; effective_date: string; guidelines: Guidelines;
  pay_ranges: Record<string, { min: number; mid: number; max: number }>; letter_template: string | null; released_at: string | null;
  budgets?: BudgetRow[]; counts?: Record<string, number>; total_people?: number;
};
export type Proposal = {
  uuid: string; employee: Person; manager_employee_id: number | null; department_id: number | null; rating: number | null;
  rating_label: string | null; current_ctc: number; compa_ratio: number | null; guideline_pct: number | null; proposed_pct: number;
  increment_amount: number; new_ctc: number; deviation: number | null; promote: boolean; current_designation: string | null;
  current_designation_id: number | null; new_designation_id: number | null; new_designation: string | null; justification: string | null;
  status: "draft" | "submitted" | "approved" | "rejected" | "released"; letter_no: string | null; has_letter: boolean; released_at: string | null;
};
export type IncrementGrid = {
  cycle: IncrementCycle; proposals: Proposal[]; budgets: BudgetRow[]; can_admin: boolean;
  totals: { current: number; increase: number; promotions: number };
};
