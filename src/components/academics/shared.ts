/*
 * Shared types and data helpers for the academics and students screens.
 *   const sessions = useSessions();                     // every academic session, current first
 *   const rows = await fetchAll<Program>("/academics/programs");
 *   <Select loadOptions={searchStaff} ... />           // staff picker (class teacher, subject teacher)
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SelectOption } from "@/components/ui-kit";

export type Term = {
  id: number; uuid: string; session_id: number; name: string; kind: string; start_date: string; end_date: string;
  sort_order: number; active: boolean;
};
export type AcademicSession = {
  id: number; uuid: string; name: string; start_date: string; end_date: string; is_current: boolean;
  status: "planned" | "active" | "closed"; active: boolean; terms: Term[];
};
export type Program = {
  id: number; uuid: string; name: string; code: string | null; level: string | null; department_id: number | null;
  duration_terms: number | null; next_program_id: number | null; sort_order: number; description: string | null;
  config: Record<string, unknown>; active: boolean; section_count: number;
};
export type SectionRow = {
  id: number; uuid: string; program_id: number; session_id: number; name: string; capacity: number | null;
  class_teacher_id: number | null; room_id: number | null; medium: string | null; shift: string | null; active: boolean;
  label: string; program_name: string | null; session_name: string | null; class_teacher_name: string | null;
  room_name: string | null; strength: number;
};
export type Subject = {
  id: number; uuid: string; name: string; code: string | null; kind: string; credits: string | number | null;
  department_id: number | null; color: string | null; description: string | null; active: boolean;
};
export type CurriculumRow = {
  id: number; uuid: string; program_id: number; subject_id: number; term_no: number | null; is_elective: boolean;
  elective_group: string | null; credits: string | number | null; weekly_periods: number | null; sort_order: number;
  subject_name: string | null; subject_code: string | null; effective_credits: string | number | null;
};
export type Allocation = {
  id: number; uuid: string; section_id: number; subject_id: number; teacher_id: number | null; assistant_ids: number[];
  weekly_periods: number | null; subject_name: string | null; section_label: string; teacher_name: string | null;
};
export type Room = {
  id: number; uuid: string; name: string; code: string | null; building: string | null; floor: string | null;
  capacity: number | null; kind: string; active: boolean;
};
export type House = { id: number; uuid: string; name: string; color: string | null; motto: string | null; active: boolean };
export type SectionOption = { id: number; uuid: string; label: string; program_id: number };

export const SUBJECT_KINDS: SelectOption[] = [
  { value: "theory", label: "Theory" }, { value: "practical", label: "Practical" },
  { value: "theory_practical", label: "Theory and practical" }, { value: "language", label: "Language" },
  { value: "activity", label: "Activity" }, { value: "project", label: "Project" }, { value: "elective", label: "Elective" },
];
export const ROOM_KINDS: SelectOption[] = [
  { value: "classroom", label: "Classroom" }, { value: "lab", label: "Lab" }, { value: "hall", label: "Hall" },
  { value: "library", label: "Library" }, { value: "sports", label: "Sports" }, { value: "online", label: "Online" },
  { value: "other", label: "Other" },
];

export function errText(e: unknown): string | undefined {
  return e instanceof Error ? e.message : undefined;
}

/** Every row of a crud list (`?all=true`, up to 2000). */
export async function fetchAll<T>(path: string): Promise<T[]> {
  const sep = path.includes("?") ? "&" : "?";
  const r = await api.get<{ items: T[] }>(`${path}${sep}all=true`);
  return Array.isArray(r?.items) ? r.items : [];
}

/** Load a list and reload it on demand: const { rows, loading, reload } = useList<T>(path). Pass null to wait. */
export function useList<T>(path: string | null) {
  const [state, setState] = useState<{ path: string | null; nonce: number; rows: T[] } | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    fetchAll<T>(path).then((rows) => { if (live) setState({ path, nonce, rows }); })
      .catch(() => { if (live) setState({ path, nonce, rows: [] }); });
    return () => { live = false; };
  }, [path, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const fresh = state && state.path === path;
  return { rows: fresh ? state.rows : [], loading: !!path && (!fresh || state.nonce !== nonce), reload };
}

/** All active sessions, newest first, with the current one marked. */
export function useSessions() {
  const { rows, loading, reload } = useList<AcademicSession>("/academics/sessions");
  const sessions = rows.filter((s) => s.active).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const current = sessions.find((s) => s.is_current) ?? sessions[0] ?? null;
  return { sessions, current, loading, reload };
}

/** Sections of a session as picker options ({value: id, label: "Grade 5 - A"}). */
export function useSectionOptions(sessionId: number | null | undefined) {
  const [rows, setRows] = useState<{ key: string; rows: SectionOption[] } | null>(null);
  const key = String(sessionId ?? "current");
  useEffect(() => {
    let live = true;
    api.get<SectionOption[]>(`/academics/section-options${sessionId ? `?session_id=${sessionId}` : ""}`)
      .then((r) => { if (live) setRows({ key, rows: Array.isArray(r) ? r : [] }); })
      .catch(() => { if (live) setRows({ key, rows: [] }); });
    return () => { live = false; };
  }, [sessionId, key]);
  const list = rows?.key === key ? rows.rows : [];
  return { sections: list, loading: rows?.key !== key, options: list.map((s) => ({ value: s.id, label: s.label })) };
}

type StaffOption = { value: number; uuid: string; label: string; hint?: string; photo?: string | null };

/** Staff picker: searches active staff by name, code or email. */
export async function searchStaff(q: string): Promise<SelectOption<number>[]> {
  const r = await api.get<StaffOption[]>(`/employees/lookup?limit=30${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  return (Array.isArray(r) ? r : []).map((e) => ({ value: e.value, label: e.label, description: e.hint || undefined }));
}

/** Labels for staff ids (for assistant chips and similar). */
export async function staffLabels(ids: number[]): Promise<SelectOption<number>[]> {
  if (!ids.length) return [];
  const r = await api.get<StaffOption[]>(`/employees/lookup?ids=${ids.join(",")}&active_only=false&limit=50`);
  return (Array.isArray(r) ? r : []).map((e) => ({ value: e.value, label: e.label }));
}

/** Download text as a file (CSV and similar). */
export function downloadText(name: string, text: string, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["﻿" + text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvLine(cells: (string | number | null | undefined)[]): string {
  return cells.map((c) => {
    const s = c == null ? "" : String(c);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",");
}
