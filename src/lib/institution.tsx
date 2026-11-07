"use client";

/*
 * The institution profile: its type (school, college, university, coaching, training …),
 * the words it uses on screen ("Class" or "Programme", "Section" or "Batch", "Teacher" or
 * "Faculty") and the modules it has switched on. Loaded once per sign-in from
 * /academics/profile.
 *
 *   const { term, modules, profile } = useInstitution();
 *   <PageHeader title={term("programs")} />          // "Classes" / "Programmes" / "Courses"
 *   if (modules.transport) { ... }
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { useAuth } from "./auth";

export type InstitutionTerms = {
  program: string; programs: string; section: string; sections: string; term: string; terms: string;
  session: string; subject: string; subjects: string; student: string; students: string; teacher: string;
  teachers: string; guardian: string; guardians: string; roll: string;
};

export type InstitutionProfile = {
  type: string;
  type_label: string;
  board: string;
  affiliation_no: string;
  established_year: number | null;
  motto: string;
  principal_name: string;
  terms: InstitutionTerms;
  modules: Record<string, boolean>;
  week_days: number[];
  attendance_mode: "daily" | "period" | "session";
  grading: string;
  types: { key: string; label: string }[];
  module_keys: string[];
  current_session: { id: number; uuid: string; name: string } | null;
  current_term: { id: number; name: string } | null;
};

export const DEFAULT_TERMS: InstitutionTerms = {
  program: "Class", programs: "Classes", section: "Section", sections: "Sections", term: "Term", terms: "Terms",
  session: "Academic year", subject: "Subject", subjects: "Subjects", student: "Student", students: "Students",
  teacher: "Teacher", teachers: "Teachers", guardian: "Parent", guardians: "Parents", roll: "Roll no.",
};

type Ctx = {
  profile: InstitutionProfile | null;
  term: (key: keyof InstitutionTerms) => string;
  modules: Record<string, boolean>;
  reload: () => void;
};

const InstitutionContext = createContext<Ctx>({
  profile: null, term: (k) => DEFAULT_TERMS[k], modules: {}, reload: () => {},
});

export function InstitutionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<InstitutionProfile | null>(null);
  const [tick, setTick] = useState(0);
  const key = user ? `${user.company_id}:${user.email}` : "";

  useEffect(() => {
    if (!key) { setProfile(null); return; }
    let live = true;
    api.get<InstitutionProfile>("/academics/profile").then((p) => { if (live) setProfile(p); }).catch(() => {});
    return () => { live = false; };
  }, [key, tick]);

  const term = useCallback((k: keyof InstitutionTerms) => profile?.terms?.[k] || DEFAULT_TERMS[k], [profile]);
  const value = useMemo<Ctx>(() => ({
    profile, term, modules: profile?.modules ?? {}, reload: () => setTick((t) => t + 1),
  }), [profile, term]);
  return <InstitutionContext.Provider value={value}>{children}</InstitutionContext.Provider>;
}

export function useInstitution() {
  return useContext(InstitutionContext);
}
