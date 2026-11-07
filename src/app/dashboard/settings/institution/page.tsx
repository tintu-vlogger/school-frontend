"use client";

/*
 * Institution profile: type, board, motto and head; the words used on screen (editable per
 * key, with defaults per type); modules switched on; working days, attendance mode and the
 * default grading. Saved with PUT /academics/profile, then the whole app reloads the profile.
 */
import { useEffect, useState } from "react";
import { RotateCcw, Save } from "lucide-react";
import { useAccess } from "@/lib/access";
import { api } from "@/lib/api";
import { useInstitution, type InstitutionProfile, type InstitutionTerms } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper } from "@/components/shell/page";
import {
  Button, Field, FormGrid, NumberInput, RadioCards, Select, Skeleton, TextInput, Toggle, useConfirm,
} from "@/components/ui-kit";
import { errText } from "@/components/academics/shared";

/* Copied from backend modules/academics/service.py INSTITUTION_TYPES. */
const DEFAULTS_BY_TYPE: Record<string, InstitutionTerms> = {
  school: { program: "Class", programs: "Classes", section: "Section", sections: "Sections", term: "Term", terms: "Terms", session: "Academic year", subject: "Subject", subjects: "Subjects", student: "Student", students: "Students", teacher: "Teacher", teachers: "Teachers", guardian: "Parent", guardians: "Parents", roll: "Roll no." },
  preschool: { program: "Class", programs: "Classes", section: "Group", sections: "Groups", term: "Term", terms: "Terms", session: "Academic year", subject: "Activity area", subjects: "Activity areas", student: "Child", students: "Children", teacher: "Teacher", teachers: "Teachers", guardian: "Parent", guardians: "Parents", roll: "Roll no." },
  college: { program: "Programme", programs: "Programmes", section: "Batch", sections: "Batches", term: "Semester", terms: "Semesters", session: "Academic year", subject: "Course", subjects: "Courses", student: "Student", students: "Students", teacher: "Faculty", teachers: "Faculty", guardian: "Guardian", guardians: "Guardians", roll: "Register no." },
  university: { program: "Programme", programs: "Programmes", section: "Batch", sections: "Batches", term: "Semester", terms: "Semesters", session: "Academic year", subject: "Course", subjects: "Courses", student: "Student", students: "Students", teacher: "Faculty", teachers: "Faculty", guardian: "Guardian", guardians: "Guardians", roll: "Enrolment no." },
  coaching: { program: "Course", programs: "Courses", section: "Batch", sections: "Batches", term: "Module", terms: "Modules", session: "Session", subject: "Subject", subjects: "Subjects", student: "Student", students: "Students", teacher: "Tutor", teachers: "Tutors", guardian: "Parent", guardians: "Parents", roll: "Roll no." },
  training: { program: "Course", programs: "Courses", section: "Batch", sections: "Batches", term: "Module", terms: "Modules", session: "Intake", subject: "Unit", subjects: "Units", student: "Learner", students: "Learners", teacher: "Trainer", teachers: "Trainers", guardian: "Emergency contact", guardians: "Emergency contacts", roll: "Learner no." },
};
const GRADING_BY_TYPE: Record<string, string> = { school: "percentage_grades", preschool: "descriptive", college: "gpa_10", university: "gpa_10", coaching: "percentage", training: "competency" };

const TYPE_HINTS: Record<string, string> = {
  school: "Classes and sections, three terms a year",
  preschool: "Classes and groups, descriptive reports",
  college: "Programmes, semesters and credits",
  university: "Programmes, semesters, credits and GPA",
  coaching: "Courses and batches for exam preparation",
  training: "Short courses, batches and competencies",
};

const WORD_KEYS: { key: keyof InstitutionTerms; label: string }[] = [
  { key: "program", label: "What learners enrol in" }, { key: "programs", label: "… plural" },
  { key: "section", label: "A group within it" }, { key: "sections", label: "… plural" },
  { key: "session", label: "The academic year" }, { key: "term", label: "A part of the year" }, { key: "terms", label: "… plural" },
  { key: "subject", label: "What is taught" }, { key: "subjects", label: "… plural" },
  { key: "student", label: "A learner" }, { key: "students", label: "… plural" },
  { key: "teacher", label: "Who teaches" }, { key: "teachers", label: "… plural" },
  { key: "guardian", label: "A parent or contact" }, { key: "guardians", label: "… plural" },
  { key: "roll", label: "Number within a group" },
];

const MODULES: Record<string, { label: string; hint: string }> = {
  admissions: { label: "Admissions", hint: "Enquiries, applications, admission decisions and certificates" },
  attendance: { label: "Attendance", hint: "Daily or period attendance and leave requests from families" },
  timetable: { label: "Timetable", hint: "Periods, timetables and substitutions" },
  exams: { label: "Exams & results", hint: "Exams, marks entry, report cards and hall tickets" },
  lms: { label: "Learning", hint: "Homework, lesson plans, study materials and quizzes" },
  online_classes: { label: "Online classes", hint: "Live classes with joining links" },
  fees: { label: "Fees", hint: "Fee plans, invoices, receipts and online payment" },
  library: { label: "Library", hint: "Catalogue, issue and return, fines" },
  transport: { label: "Transport", hint: "Routes, stops, vehicles and who rides them" },
  hostel: { label: "Hostel", hint: "Rooms, allocation and hostel attendance" },
  wellbeing: { label: "Health & wellbeing", hint: "Health records, counselling and incidents" },
  comms: { label: "Communication", hint: "Notices, messages, events and parent meetings" },
  staff_payroll: { label: "Staff payroll", hint: "Salary structures, payroll runs and payslips" },
};

const DAYS = [{ n: 1, l: "Mon" }, { n: 2, l: "Tue" }, { n: 3, l: "Wed" }, { n: 4, l: "Thu" }, { n: 5, l: "Fri" }, { n: 6, l: "Sat" }, { n: 7, l: "Sun" }];
const GRADING = [
  { value: "percentage_grades", label: "Percentage with grades (A1, A2 …)" }, { value: "percentage", label: "Percentage only" },
  { value: "gpa_10", label: "GPA on 10" }, { value: "gpa_4", label: "GPA on 4" },
  { value: "descriptive", label: "Descriptive (no marks)" }, { value: "competency", label: "Competent / not yet competent" },
];

type Draft = {
  type: string; board: string; affiliation_no: string; established_year: number | null; motto: string; principal_name: string;
  terms: Partial<InstitutionTerms>; modules: Record<string, boolean>; week_days: number[];
  attendance_mode: "daily" | "period" | "session"; grading: string;
};

function toDraft(p: InstitutionProfile): Draft {
  const defs = DEFAULTS_BY_TYPE[p.type] ?? DEFAULTS_BY_TYPE.school;
  // Only words that differ from the type's defaults are kept as overrides.
  const terms: Partial<InstitutionTerms> = {};
  for (const { key } of WORD_KEYS) if (p.terms?.[key] && p.terms[key] !== defs[key]) terms[key] = p.terms[key];
  return {
    type: p.type, board: p.board || "", affiliation_no: p.affiliation_no || "", established_year: p.established_year ?? null,
    motto: p.motto || "", principal_name: p.principal_name || "", terms, modules: { ...p.modules },
    week_days: [...(p.week_days || [])], attendance_mode: p.attendance_mode, grading: p.grading,
  };
}

export default function InstitutionProfilePage() {
  const { reload } = useInstitution();
  const canEdit = useAccess().can("academics.profile.manage");
  const toast = useToast();
  const confirm = useConfirm();
  const [profile, setProfile] = useState<InstitutionProfile | null>(null);
  const [start, setStart] = useState<Draft | null>(null);
  const [v, setV] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    api.get<InstitutionProfile>("/academics/profile").then((p) => {
      if (!live) return;
      setProfile(p); const d = toDraft(p); setStart(d); setV(d);
    }).catch((e) => toast.error("Couldn't load the profile", { description: errText(e) }));
    return () => { live = false; };
  }, [toast]);

  if (!v || !profile) {
    return <div><PageHeader eyebrow="Settings" title="Institution profile" /><Skeleton className="h-96 w-full rounded-2xl" /></div>;
  }
  const defs = DEFAULTS_BY_TYPE[v.type] ?? DEFAULTS_BY_TYPE.school;
  const dirty = JSON.stringify(v) !== JSON.stringify(start);
  const set = <K extends keyof Draft>(k: K, val: Draft[K]) => setV({ ...v, [k]: val });
  const types = profile.types?.length ? profile.types : Object.keys(DEFAULTS_BY_TYPE).map((k) => ({ key: k, label: k }));
  const moduleKeys = profile.module_keys?.length ? profile.module_keys : Object.keys(MODULES);

  async function changeType(t: string) {
    if (!v) return;
    const next = { ...v, type: t };
    const hasCustom = Object.keys(v.terms).length > 0;
    if (hasCustom && await confirm({ title: "Use the words for this type?", confirmLabel: "Use defaults", cancelLabel: "Keep my words",
      message: "You have changed some words on screen. Reset them to the defaults for this type of institution?" })) next.terms = {};
    if (v.grading === (GRADING_BY_TYPE[v.type] ?? "")) next.grading = GRADING_BY_TYPE[t] ?? v.grading;
    setV(next);
  }

  async function save() {
    if (!v) return;
    setSaving(true);
    try {
      // Only the words that differ from the type's defaults are stored, so a later change of type brings its own words.
      const words = Object.fromEntries(WORD_KEYS.map(({ key }) => [key, (v.terms[key] || "").trim()]).filter(([k, w]) => w && w !== defs[k as keyof InstitutionTerms]));
      const p = await api.put<InstitutionProfile>("/academics/profile", {
        type: v.type, board: v.board.trim(), affiliation_no: v.affiliation_no.trim(), established_year: v.established_year,
        motto: v.motto.trim(), principal_name: v.principal_name.trim(), terms: words, modules: v.modules,
        week_days: [...v.week_days].sort(), attendance_mode: v.attendance_mode, grading: v.grading,
      });
      const merged = { ...profile!, ...p };
      setProfile(merged); const d = toDraft(merged); setStart(d); setV(d);
      reload();
      toast.success("Institution profile saved", { description: "Menus and labels now follow the new settings." });
    } catch (e) { toast.error("Couldn't save", { description: errText(e) }); }
    finally { setSaving(false); }
  }

  const saveBar = canEdit && (
    <>
      {dirty && <Button onClick={() => start && setV(start)} disabled={saving}>Discard</Button>}
      <Button variant="primary" icon={Save} loading={saving} disabled={!dirty} onClick={save}>Save changes</Button>
    </>
  );

  return (
    <div className="pb-16">
      <PageHeader eyebrow="Settings" title="Institution profile"
        description="What kind of institution this is, the words used on screen, and which parts of the product are switched on."
        actions={saveBar} />
      {!canEdit && <p className="mb-4 text-[13px] text-muted">You can see these settings. Only administrators can change them.</p>}

      <fieldset disabled={!canEdit} className="space-y-6">
        <Paper className="p-6">
          <h2 className="text-[16px] font-light text-ink">Institution</h2>
          <p className="mb-5 text-[13px] text-muted">The type sets sensible defaults for words, terms and grading.</p>
          <Field label="Type of institution">
            <RadioCards columns={3} value={v.type} onChange={changeType}
              options={types.map((t) => ({ value: t.key, label: t.label, description: TYPE_HINTS[t.key] }))} />
          </Field>
          <FormGrid className="mt-5">
            <Field label="Board or affiliation" aside="Optional" hint="e.g. CBSE, ICSE, State board, a university">
              <TextInput value={v.board} onValueChange={(x) => set("board", x)} maxLength={120} />
            </Field>
            <Field label="Affiliation number" aside="Optional">
              <TextInput value={v.affiliation_no} onValueChange={(x) => set("affiliation_no", x)} maxLength={60} />
            </Field>
            <Field label="Head of institution" aside="Optional" hint="Printed on certificates and report cards">
              <TextInput value={v.principal_name} onValueChange={(x) => set("principal_name", x)} maxLength={120} />
            </Field>
            <Field label="Established in" aside="Optional">
              <NumberInput value={v.established_year} onChange={(x) => set("established_year", x)} min={1800} max={new Date().getFullYear()} placeholder="e.g. 1995" />
            </Field>
            <Field label="Motto" aside="Optional" className="sm:col-span-2">
              <TextInput value={v.motto} onValueChange={(x) => set("motto", x)} maxLength={200} />
            </Field>
          </FormGrid>
        </Paper>

        <Paper className="p-6">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-light text-ink">Words used on screen</h2>
              <p className="text-[13px] text-muted">Leave a box empty to use the default shown in it.</p>
            </div>
            {canEdit && <Button size="sm" icon={RotateCcw} disabled={!Object.keys(v.terms).length} onClick={() => set("terms", {})}>Reset to defaults for this type</Button>}
          </div>
          <FormGrid columns={3}>
            {WORD_KEYS.map(({ key, label }) => (
              <Field key={key} label={label}>
                <TextInput value={v.terms[key] ?? ""} placeholder={defs[key]} maxLength={40}
                  onValueChange={(x) => { const t = { ...v.terms }; if (x) t[key] = x; else delete t[key]; set("terms", t); }} />
              </Field>
            ))}
          </FormGrid>
        </Paper>

        <Paper className="p-6">
          <h2 className="text-[16px] font-light text-ink">Modules</h2>
          <p className="mb-5 text-[13px] text-muted">Switch off what you don&apos;t use. It disappears from the menu for staff and families; nothing is deleted.</p>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {moduleKeys.map((k) => (
              <Toggle key={k} checked={v.modules[k] !== false} onChange={(x) => set("modules", { ...v.modules, [k]: x })} disabled={!canEdit}
                label={MODULES[k]?.label ?? k} description={MODULES[k]?.hint} />
            ))}
          </div>
        </Paper>

        <Paper className="p-6">
          <h2 className="text-[16px] font-light text-ink">Days and attendance</h2>
          <p className="mb-5 text-[13px] text-muted">Used for attendance, timetables and working-day counts.</p>
          <Field label="Working days">
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d) => {
                const on = v.week_days.includes(d.n);
                return (
                  <button key={d.n} type="button" aria-pressed={on} disabled={!canEdit}
                    onClick={() => set("week_days", on ? v.week_days.filter((x) => x !== d.n) : [...v.week_days, d.n])}
                    className={`h-9 min-w-[52px] rounded-lg border px-3 text-[13.5px] transition-colors ${on ? "border-primary/40 bg-primary-soft/60 text-primary" : "border-line text-muted hover:border-line-strong"}`}>
                    {d.l}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="How attendance is taken" className="mt-5">
            <RadioCards columns={3} value={v.attendance_mode} onChange={(x) => set("attendance_mode", x)} options={[
              { value: "daily", label: "Once a day", description: "The class teacher marks everyone each morning" },
              { value: "period", label: "Every period", description: "Each teacher marks their own class" },
              { value: "session", label: "Per session", description: "Morning and afternoon, or per batch session" },
            ]} />
          </Field>
          <FormGrid className="mt-5">
            <Field label="Default grading" hint="Each program can use its own scheme in Exams">
              <Select value={v.grading} onChange={(x) => set("grading", x ?? v.grading)}
                options={GRADING.some((g) => g.value === v.grading) ? GRADING : [...GRADING, { value: v.grading, label: v.grading }]} />
            </Field>
          </FormGrid>
        </Paper>
      </fieldset>

      {canEdit && dirty && (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-4 py-2.5">
            <span className="text-[13.5px] text-muted">You have unsaved changes</span>
            {saveBar}
          </div>
        </div>
      )}
    </div>
  );
}
