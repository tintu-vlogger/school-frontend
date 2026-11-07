/*
 * Shapes for the surveys pages (/api/v1/engagement/surveys/...): the admin list, the
 * builder, results and the company eNPS trend.
 */
import type { Audience, Cover, Person } from "./types";
import type { Question } from "./survey-take";

export type SurveyStatus = "draft" | "scheduled" | "active" | "closed";

export type SurveySummary = {
  uuid: string; title: string; kind: "survey" | "pulse" | "enps"; kind_label: string; description: string | null;
  thank_you: string | null; cover: Cover; identity: "anonymous" | "optional" | "named"; identity_label: string;
  mandatory: boolean; status: string; questions_count: number; min_responses: number; recurrence: string;
  opens_at: string | null; closes_at: string | null; runs: number;
};
export type SurveyRow = SurveySummary & { responses: number; invited: number; audience_label: string };
export type MySurvey = SurveySummary & { run: number; submitted_on: string | null };

export type SurveyDetail = SurveySummary & {
  audience: Audience; audience_label: string; duration_days: number; recurrence_count: number | null;
  reminder_every_days: number | null; post_to_buzz: boolean; created_by_name: string | null; created_at: string;
  questions: Question[];
  run_list: { uuid: string; number: number; opens_at: string; closes_at: string; status: string; invited: number }[];
};

export type SurveysMeta = {
  kinds: Record<string, string>; question_types: Record<string, string>; identity: Record<string, string>;
  recurrence: string[]; max_questions: Record<string, number>; min_responses: number;
};

export type Enps = {
  score: number | null; promoters: number; passives: number; detractors: number; responses: number;
  promoters_pct?: number; passives_pct?: number; detractors_pct?: number;
};
export type ResultQuestion = Question & {
  answered: number;
  choices?: { label: string; count: number; pct: number }[];
  distribution?: { value: number; count: number }[];
  average?: number | null; favourable_pct?: number; unfavourable_pct?: number;
  enps?: Enps;
  groups?: { group: string; responses: number; average: number; enps?: number | null }[];
  texts?: { text: string; by: string | null }[];
};
export type TrendPoint = { run: number; opens_at: string; responses: number; value: number; metric: "enps" | "average" };
export type SurveyResults = {
  survey: SurveySummary; responses: number; invited: number; response_rate: number;
  run: { uuid: string; number: number; opens_at: string; closes_at: string; status: string } | null;
  runs: { uuid: string; number: number; opens_at: string; status: string; responses: number }[];
  trend: TrendPoint[]; locked: boolean; needed?: number; questions: ResultQuestion[];
};
export type Participation = {
  invited: number; submitted: number; names_shown: boolean; pending: { person: Person; reminders: number }[];
};
export type CompanyEnps = {
  latest: { survey: string; survey_uuid: string; opens_at: string; score: number; responses: number } | null;
  change: number | null;
  points: { survey: string; survey_uuid: string; opens_at: string; score: number; responses: number }[];
};

export const RECURRENCE_LABEL: Record<string, string> = {
  none: "Once", weekly: "Every week", monthly: "Every month", quarterly: "Every quarter", half_yearly: "Every six months",
};
export const STATUS_TONE = { draft: "neutral", scheduled: "info", active: "good", closed: "neutral" } as const;
export const STATUS_LABEL: Record<string, string> = { draft: "Draft", scheduled: "Scheduled", active: "Open", closed: "Closed" };
