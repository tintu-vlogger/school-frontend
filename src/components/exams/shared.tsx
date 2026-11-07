"use client";

/*
 * Shared pieces for the exams pages: types, the options hook (terms, programs, exams, schemes …),
 * status badges, PDF download, and the portal child picker.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAccess } from "@/lib/access";
import { Badge, Select, Skeleton, type BadgeTone, type SelectOption } from "@/components/ui-kit";

export type Band = { id?: number; label: string; min_percent: number; grade_point: number | null; description: string | null; is_pass: boolean; color?: string | null };
export type Scheme = {
  id: number; uuid: string; name: string; code: string; kind: string; scale_max: number | null; pass_percent: number;
  decimals: number; percent_formula: string | null; description: string | null; version: number; is_system: boolean;
  active: boolean; is_default: boolean; bands: Band[]; programs?: string[];
};
export type Component = { key: string; label: string; max_marks: number; pass_marks?: number | null };
export type Paper = {
  id: number; uuid: string; exam_id: number; program_id: number; program_name: string | null; subject_id: number;
  subject_name: string | null; subject_code: string | null; paper_date: string | null; start_time: string | null;
  end_time: string | null; room_id: number | null; room_name: string | null; invigilator_id: number | null;
  invigilator_name: string | null; max_marks: number; pass_marks: number | null; components: Component[];
  entry_mode: "marks" | "grade"; counts_in_total: boolean; credits: number | null; grading_scheme_id: number | null; sort_order: number;
};
export type Exam = {
  id: number; uuid: string; name: string; code: string | null; session_id: number; session_name: string | null;
  term_id: number | null; term_name: string | null; exam_type_id: number | null; exam_type_name: string | null;
  category: string | null; program_ids: number[]; program_names: string[]; start_date: string | null; end_date: string | null;
  marks_due_on: string | null; grading_scheme_id: number | null; status: "draft" | "scheduled" | "published";
  phase: string; ranking: boolean; instructions: string | null; published_at: string | null; archived: boolean;
  paper_count: number; papers?: Paper[]; clashes?: { date: string; program: string; subjects: string[] }[];
  seating?: Seat[];
};
export type Seat = {
  uuid?: string; room_id: number; room_name?: string | null; section_id: number; section_label?: string;
  roll_from: string | null; roll_to: string | null; seats: number | null; invigilator_id: number | null; invigilator_name?: string | null;
};
export type SubjectRow = {
  subject_id: number; subject: string; code: string | null; max: number | null; obtained: number | null; percent: number | null;
  grade: string | null; grade_point: number | null; credits: number | null; passed: boolean | null; counts: boolean;
  excluded: boolean; missing: boolean; absent: boolean; grace: number | null; mark_code?: string | null;
  parts?: Record<string, number | null>; pass_percent?: number | null;
};
export type Result = {
  id: number; uuid: string; source: string; student_id: number; section_id: number | null; program_id: number | null;
  total_obtained: number | null; total_max: number | null; percentage: number | null; grade: string | null;
  grade_point: number | null; gpa: number | null; cgpa: number | null; credits_attempted: number | null;
  credits_earned: number | null; rank: number | null; program_rank: number | null; status: string; passed: boolean | null;
  failed_subjects: number; grace_applied: number | null; attendance_percent: number | null; published: boolean;
  published_at: string | null; computed_at: string | null; subjects?: SubjectRow[]; student_name?: string;
  admission_no?: string; student_uuid?: string; section_label?: string; name?: string; photo_url?: string | null;
};
export type Rule = {
  id: number; uuid: string; name: string; session_id: number; term_id: number | null; term_name: string | null;
  program_ids: number[]; grading_scheme_id: number | null; method: "weighted" | "formula"; formula: string | null;
  groups: { key: string; label: string; exam_ids: number[]; combine: string; best_of: number | null; weight: number; exam_names?: string[] }[];
  pass_all_subjects: boolean; subject_pass_percent: number | null; min_aggregate_percent: number | null;
  max_failed_subjects: number | null; min_attendance_percent: number | null; grace_per_subject: number | null;
  grace_max_subjects: number | null; grace_total: number | null; ranking: boolean; cumulative: boolean;
  out_of: number | null; active: boolean; results: number; published: number;
};
export type Options = {
  session: { id: number; name: string } | null;
  sessions: { id: number; name: string; is_current: boolean }[];
  terms: { id: number; name: string; start_date: string; end_date: string }[];
  programs: { id: number; name: string; grading_scheme_id: number | null }[];
  subjects: { id: number; name: string; code: string | null }[];
  rooms: { id: number; name: string; capacity: number | null }[];
  exam_types: { id: number; name: string; category: string; default_max_marks: number | null }[];
  schemes: { id: number; name: string; code: string; kind: string; is_default: boolean }[];
  exams: { id: number; uuid: string; name: string; term_id: number | null; status: string; start_date: string | null }[];
  rules: { id: number; uuid: string; name: string; term_id: number | null }[];
  codes: { code: string; label: string }[];
  default_scheme_code: string;
};
export type SectionOption = { id: number; uuid: string; label: string; program_id: number };

export function useExamOptions() {
  const [data, setData] = useState<Options | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    api.get<Options>("/exams/options").then((r) => { if (live) setData(r); }).catch(() => { if (live) setData(null); });
    return () => { live = false; };
  }, [tick]);
  return { options: data, reload: useCallback(() => setTick((t) => t + 1), []) };
}

export function useSections() {
  const [rows, setRows] = useState<SectionOption[]>([]);
  useEffect(() => {
    let live = true;
    api.get<SectionOption[]>("/academics/section-options").then((r) => { if (live) setRows(Array.isArray(r) ? r : []); }).catch(() => {});
    return () => { live = false; };
  }, []);
  return rows;
}

/** Results come from an exam or a result rule: "exam:<uuid>" / "rule:<uuid>". */
export function sourceOptions(o: Options | null): SelectOption[] {
  if (!o) return [];
  return [
    ...o.exams.map((e) => ({ value: `exam:${e.uuid}`, label: e.name, description: e.status === "published" ? "Exam · published" : "Exam" })),
    ...o.rules.map((r) => ({ value: `rule:${r.uuid}`, label: r.name, description: "Combined result" })),
  ];
}

const PHASES: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" }, upcoming: { label: "Upcoming", tone: "info" },
  ongoing: { label: "In progress", tone: "accent" }, marks_entry: { label: "Marks entry", tone: "warn" },
  published: { label: "Results out", tone: "good" }, archived: { label: "Archived", tone: "neutral" },
};
export function PhaseBadge({ phase }: { phase: string }) {
  const p = PHASES[phase] ?? { label: phase, tone: "neutral" as BadgeTone };
  return <Badge tone={p.tone} dot>{p.label}</Badge>;
}

const SHEET: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" }, submitted: { label: "Submitted", tone: "info" }, locked: { label: "Locked", tone: "good" },
};
export function SheetBadge({ status }: { status: string }) {
  const s = SHEET[status] ?? { label: status, tone: "neutral" as BadgeTone };
  return <Badge tone={s.tone} dot>{s.label}</Badge>;
}

export const RESULT_LABEL: Record<string, string> = {
  pass: "Pass", fail: "Needs improvement", compartment: "Supplementary", not_eligible: "Not eligible", incomplete: "Incomplete",
};
export function ResultBadge({ status }: { status: string }) {
  const tone: BadgeTone = status === "pass" ? "good" : status === "incomplete" ? "neutral" : status === "compartment" ? "warn" : "bad";
  return <Badge tone={tone}>{RESULT_LABEL[status] ?? status}</Badge>;
}

export const fmt = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("en-IN", { maximumFractionDigits: digits });

/** Open or save a protected PDF / CSV with the signed-in token. */
export async function downloadFile(path: string, name: string, open = true) {
  const { downloadWithAuth } = await import("@/components/people/types");
  return downloadWithAuth(path, name, open);
}

export const CATEGORY_OPTIONS: SelectOption[] = [
  { value: "unit_test", label: "Unit test" }, { value: "mid_term", label: "Mid-term" }, { value: "final", label: "Final exam" },
  { value: "internal", label: "Internal assessment" }, { value: "practical", label: "Practical" }, { value: "project", label: "Project" },
  { value: "viva", label: "Viva" }, { value: "continuous", label: "Continuous assessment" }, { value: "other", label: "Other" },
];

/* ── Portal: which child ──────────────────────────────────────────────── */

export type Child = { id: number; uuid: string; name: string; section_label: string | null; program_name: string | null; photo_url?: string | null };

export function useChild() {
  const { portalRole } = useAccess();
  const [children, setChildren] = useState<Child[] | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    api.get<Child[]>("/students/mine").then((r) => {
      if (!live) return;
      const rows = Array.isArray(r) ? r : [];
      setChildren(rows);
      let saved: number | null = null;
      try { saved = Number(sessionStorage.getItem("portal_child")) || null; } catch { /* storage blocked */ }
      setPicked(rows.find((c) => c.id === saved)?.id ?? rows[0]?.id ?? null);
    }).catch(() => { if (live) setChildren([]); });
    return () => { live = false; };
  }, []);
  const pick = (id: number) => { setPicked(id); try { sessionStorage.setItem("portal_child", String(id)); } catch { /* ignore */ } };
  const current = useMemo(() => children?.find((c) => c.id === picked) ?? null, [children, picked]);
  return { children, studentId: picked, current, pick, isParent: portalRole === "parent", ready: children !== null };
}

export function ChildSwitcher({ child }: { child: ReturnType<typeof useChild> }) {
  if (!child.ready) return <Skeleton className="h-9 w-48" />;
  if (!child.isParent || (child.children?.length ?? 0) < 2) {
    return child.current ? <p className="text-[13px] text-muted">{child.current.name}{child.current.section_label ? ` · ${child.current.section_label}` : ""}</p> : null;
  }
  return (
    <div className="w-full sm:w-64">
      <Select value={child.studentId} onChange={(v) => v && child.pick(v)} aria-label="Child"
        options={(child.children ?? []).map((c) => ({ value: c.id, label: c.name, description: c.section_label ?? undefined }))} />
    </div>
  );
}
