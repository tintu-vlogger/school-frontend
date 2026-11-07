"use client";

/*
 * Classes & sections (the words follow the institution profile): every program with its
 * sections in the chosen session, strength against capacity, class teacher and room.
 * Add / edit programs and sections in modals; an empty institution starts with Quick set-up.
 */
import { useMemo, useState } from "react";
import { ArrowRight, DoorOpen, Pencil, Plus, Power, School, Sparkles, UserRound, Users } from "lucide-react";
import { useAccess } from "@/lib/access";
import { api } from "@/lib/api";
import { useInstitution, type InstitutionTerms } from "@/lib/institution";
import { useToast } from "@/lib/toast-context";
import { PageHeader, Paper } from "@/components/shell/page";
import {
  Badge, Button, Field, FormGrid, Menu, Modal, ModalCancel, NumberInput, RadioCards, Select, Skeleton, StatCard, StatGrid,
  TextInput, Textarea, useConfirm, type SelectOption,
} from "@/components/ui-kit";
import {
  errText, searchStaff, useList, useSessions, type Program, type Room, type SectionRow,
} from "@/components/academics/shared";
import { StrengthBar, useDepartmentOptions } from "@/components/academics/ui";

export default function ClassesPage() {
  const { term } = useInstitution();
  const canManage = useAccess().can("academics.manage");
  const toast = useToast();
  const confirm = useConfirm();
  const { sessions, current, loading: sessLoading } = useSessions();
  const [sessionId, setSessionId] = useState<number | null>(null);
  const sid = sessionId ?? current?.id ?? null;
  const programs = useList<Program>("/academics/programs");
  const sections = useList<SectionRow>(sid ? `/academics/sections?session_id=${sid}` : null);

  const [progForm, setProgForm] = useState<{ open: boolean; target: Program | null; key: number }>({ open: false, target: null, key: 0 });
  const [secForm, setSecForm] = useState<{ open: boolean; target: SectionRow | null; program: Program | null; key: number }>({ open: false, target: null, program: null, key: 0 });
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickKey, setQuickKey] = useState(0);

  const active = programs.rows.filter((p) => p.active).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const liveSections = sections.rows.filter((s) => s.active);
  const byProgram = useMemo(() => {
    const m: Record<number, SectionRow[]> = {};
    for (const s of liveSections) (m[s.program_id] ||= []).push(s);
    for (const k of Object.keys(m)) m[Number(k)].sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [liveSections]);
  const names = Object.fromEntries(programs.rows.map((p) => [p.id, p.name]));
  const totalStrength = liveSections.reduce((n, s) => n + s.strength, 0);
  const totalCapacity = liveSections.reduce((n, s) => n + (s.capacity || 0), 0);

  const openProgram = (p: Program | null) => setProgForm((f) => ({ open: true, target: p, key: f.key + 1 }));
  const openSection = (s: SectionRow | null, p: Program | null) => setSecForm((f) => ({ open: true, target: s, program: p, key: f.key + 1 }));
  const openQuick = () => { setQuickKey((k) => k + 1); setQuickOpen(true); };

  async function switchOffProgram(p: Program) {
    const ok = await confirm({
      title: `Switch off ${p.name}?`, tone: "danger", confirmLabel: "Switch off",
      message: `It is hidden from lists and new admissions. ${term("students")} and past records stay as they are.`,
    });
    if (!ok) return;
    try { await api.delete(`/academics/programs/${p.uuid}`); toast.success(`${p.name} switched off`); programs.reload(); }
    catch (e) { toast.error("Couldn't switch it off", { description: errText(e) }); }
  }
  async function switchOffSection(s: SectionRow) {
    const ok = await confirm({
      title: `Switch off ${s.label}?`, tone: "danger", confirmLabel: "Switch off",
      message: s.strength ? `${s.strength} ${term("students").toLowerCase()} are still enrolled here. Move them first if they should stay in a ${term("section").toLowerCase()}.` : "It is hidden from lists and pickers.",
    });
    if (!ok) return;
    try { await api.delete(`/academics/sections/${s.uuid}`); toast.success(`${s.label} switched off`); sections.reload(); programs.reload(); }
    catch (e) { toast.error("Couldn't switch it off", { description: errText(e) }); }
  }

  const loading = programs.loading || sessLoading;
  const empty = !loading && active.length === 0;
  const sessionOptions: SelectOption<number>[] = sessions.map((s) => ({ value: s.id, label: s.name, description: s.is_current ? "Current" : undefined }));

  return (
    <div>
      <PageHeader eyebrow="Academics" title={`${term("programs")} & ${term("sections").toLowerCase()}`}
        description={`Every ${term("program").toLowerCase()} with its ${term("sections").toLowerCase()} for the ${term("session").toLowerCase()}, who leads each one and how full it is.`}
        actions={<>
          <div className="w-44"><Select value={sid} onChange={(v) => setSessionId(v)} options={sessionOptions} placeholder={term("session")} /></div>
          {canManage && !empty && <Button icon={Sparkles} onClick={openQuick}>Quick set-up</Button>}
          {canManage && <Button variant="primary" icon={Plus} onClick={() => openProgram(null)}>Add {term("program").toLowerCase()}</Button>}
        </>} />

      {!empty && (
        <StatGrid className="mb-6">
          <StatCard label={term("programs")} value={loading ? "–" : active.length} icon={School} />
          <StatCard label={term("sections")} value={sections.loading ? "–" : liveSections.length} icon={Users} />
          <StatCard label={`${term("students")} enrolled`} value={sections.loading ? "–" : totalStrength} icon={UserRound} />
          <StatCard label="Seats free" value={sections.loading ? "–" : totalCapacity ? Math.max(0, totalCapacity - totalStrength) : "–"}
            hint={totalCapacity ? `${Math.round((totalStrength / totalCapacity) * 100)}% full` : "Set capacities to track this"} icon={DoorOpen} />
        </StatGrid>
      )}

      {loading ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}</div>
      ) : empty ? (
        <Paper className="px-6 py-14 text-center">
          <Sparkles size={28} strokeWidth={1.2} className="mx-auto mb-3 text-primary" />
          <p className="text-[17px] font-light text-ink">Set up your {term("programs").toLowerCase()} in one step</p>
          <p className="mx-auto mt-1.5 max-w-md text-[14px] text-muted">
            Quick set-up creates the {term("session").toLowerCase()} and its {term("terms").toLowerCase()}, your {term("programs").toLowerCase()}, {term("sections").toLowerCase()} and {term("subjects").toLowerCase()}. You can change everything afterwards.
          </p>
          {canManage ? (
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="primary" icon={Sparkles} onClick={openQuick}>Start quick set-up</Button>
              <Button icon={Plus} onClick={() => openProgram(null)}>Add one by one</Button>
            </div>
          ) : <p className="mt-4 text-[13px] text-faint">Ask an administrator to set up the academic structure.</p>}
        </Paper>
      ) : (
        <div className="space-y-4">
          {active.map((p) => {
            const secs = byProgram[p.id] || [];
            const strength = secs.reduce((n, s) => n + s.strength, 0);
            return (
              <Paper key={p.uuid}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[15.5px] text-ink">{p.name}</p>
                      {p.code && <span className="font-mono text-[12px] text-faint">{p.code}</span>}
                      {p.level && <Badge>{p.level}</Badge>}
                      {p.duration_terms ? <Badge tone="info">{p.duration_terms} {term("terms").toLowerCase()}</Badge> : null}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted">
                      <span>{secs.length} {(secs.length === 1 ? term("section") : term("sections")).toLowerCase()} · {strength} {term("students").toLowerCase()}</span>
                      {p.next_program_id && names[p.next_program_id] && (
                        <span className="inline-flex items-center gap-1 text-faint"><ArrowRight size={12} strokeWidth={1.4} />promotes to {names[p.next_program_id]}</span>
                      )}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-1">
                      <Button size="sm" icon={Plus} onClick={() => openSection(null, p)}>Add {term("section").toLowerCase()}</Button>
                      <Menu items={[
                        { label: `Edit ${term("program").toLowerCase()}`, icon: Pencil, onSelect: () => openProgram(p) },
                        "separator",
                        { label: "Switch off", icon: Power, danger: true, onSelect: () => switchOffProgram(p) },
                      ]} />
                    </div>
                  )}
                </div>
                {secs.length === 0 ? (
                  <p className="px-5 py-5 text-[13.5px] text-muted">
                    No {term("sections").toLowerCase()} in this {term("session").toLowerCase()} yet.{canManage && " Add one to start enrolling."}
                  </p>
                ) : (
                  <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {secs.map((s) => (
                      <div key={s.uuid} className="group rounded-xl border border-line p-3.5 transition-colors hover:border-line-strong">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[14.5px] text-ink">{s.name}</p>
                            <p className="truncate text-[12.5px] text-muted">{s.class_teacher_name || <span className="text-faint">No {term("teacher").toLowerCase()} yet</span>}</p>
                          </div>
                          {canManage && (
                            <Menu items={[
                              { label: "Edit", icon: Pencil, onSelect: () => openSection(s, p) },
                              "separator",
                              { label: "Switch off", icon: Power, danger: true, onSelect: () => switchOffSection(s) },
                            ]} />
                          )}
                        </div>
                        <div className="mt-3"><StrengthBar strength={s.strength} capacity={s.capacity} /></div>
                        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[12px] text-muted">
                          {s.room_name && <Badge>{s.room_name}</Badge>}
                          {s.medium && <Badge tone="info">{s.medium}</Badge>}
                          {s.shift && <Badge tone="accent">{s.shift}</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Paper>
            );
          })}
        </div>
      )}

      <ProgramModal key={`p${progForm.key}`} open={progForm.open} target={progForm.target} programs={programs.rows}
        onClose={() => setProgForm((f) => ({ ...f, open: false }))}
        onSaved={() => { setProgForm((f) => ({ ...f, open: false })); programs.reload(); }} />
      <SectionModal key={`s${secForm.key}`} open={secForm.open} target={secForm.target} program={secForm.program} sessionId={sid}
        onClose={() => setSecForm((f) => ({ ...f, open: false }))}
        onSaved={() => { setSecForm((f) => ({ ...f, open: false })); sections.reload(); programs.reload(); }} />
      <QuickSetupModal key={`q${quickKey}`} open={quickOpen} onClose={() => setQuickOpen(false)}
        onDone={() => { setQuickOpen(false); programs.reload(); sections.reload(); }} />
    </div>
  );
}

/* ── Program form ──────────────────────────────────────────────────── */

function ProgramModal({ open, target, programs, onClose, onSaved }: {
  open: boolean; target: Program | null; programs: Program[]; onClose: () => void; onSaved: () => void;
}) {
  const { term } = useInstitution();
  const toast = useToast();
  const initial = {
    name: target?.name ?? "", code: target?.code ?? "", level: target?.level ?? "", department_id: target?.department_id ?? null,
    duration_terms: target?.duration_terms ?? null, next_program_id: target?.next_program_id ?? null,
    sort_order: target?.sort_order ?? (programs.length ? Math.max(...programs.map((p) => p.sort_order)) + 1 : 1),
    description: target?.description ?? "",
  };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const departments = useDepartmentOptions(initial.department_id);
  const nextOptions = programs.filter((p) => p.active && p.id !== target?.id).sort((a, b) => a.sort_order - b.sort_order)
    .map((p) => ({ value: p.id, label: p.name }));
  const levels = Array.from(new Set(programs.map((p) => p.level).filter(Boolean))) as string[];
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError(`Give the ${term("program").toLowerCase()} a name`); return; }
    setSaving(true);
    try {
      const body = { ...v, name: v.name.trim(), code: v.code.trim() || null, level: v.level.trim() || null, description: v.description.trim() || null };
      if (target) await api.put(`/academics/programs/${target.uuid}`, body);
      else await api.post("/academics/programs", body);
      toast.success(target ? "Saved" : `${term("program")} added`);
      onSaved();
    } catch (err) { toast.error("Couldn't save", { description: errText(err) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" dirty={dirty} busy={saving}
      title={target ? `Edit ${target.name}` : `Add ${term("program").toLowerCase()}`}
      description={target ? undefined : `What ${term("students").toLowerCase()} enrol in, such as a grade, a degree programme or a course.`}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="program-form" loading={saving}>{target ? "Save changes" : "Add"}</Button></>}>
      <form id="program-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Name" required error={error} className="sm:col-span-2">
            <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} placeholder="e.g. Grade 5, B.Sc Physics, JEE 2027" />
          </Field>
          <Field label="Short code" aside="Optional">
            <TextInput value={v.code} onValueChange={(x) => setV({ ...v, code: x.toUpperCase() })} maxLength={30} className="font-mono" placeholder="e.g. G5" />
          </Field>
          <Field label="Level" aside="Optional" hint={levels.length ? `In use: ${levels.slice(0, 4).join(", ")}` : "Groups them, e.g. Primary, Undergraduate"}>
            <TextInput value={v.level} onValueChange={(x) => setV({ ...v, level: x })} maxLength={60} placeholder="e.g. Primary" />
          </Field>
          <Field label={`Promotes to`} aside="Optional" hint={`The ${term("program").toLowerCase()} ${term("students").toLowerCase()} move to at year end`}>
            <Select value={v.next_program_id} onChange={(x) => setV({ ...v, next_program_id: x })} options={nextOptions} clearable placeholder="None (final year)" />
          </Field>
          <Field label={`Length in ${term("terms").toLowerCase()}`} aside="Optional" hint={`For programmes that run several ${term("terms").toLowerCase()}; leave empty for one-year ${term("programs").toLowerCase()}`}>
            <NumberInput value={v.duration_terms} onChange={(x) => setV({ ...v, duration_terms: x })} min={1} max={40} placeholder="e.g. 8" />
          </Field>
          <Field label="Department" aside="Optional">
            <Select value={v.department_id} onChange={(x) => setV({ ...v, department_id: x })} options={departments} clearable placeholder="Pick a department" />
          </Field>
          <Field label="Order in lists">
            <NumberInput value={v.sort_order} onChange={(x) => setV({ ...v, sort_order: x ?? 1 })} min={1} max={999} />
          </Field>
          <Field label="Description" aside="Optional" className="sm:col-span-2">
            <Textarea value={v.description} onValueChange={(x) => setV({ ...v, description: x })} rows={2} />
          </Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Section form ──────────────────────────────────────────────────── */

const MEDIUMS = ["English", "Hindi", "Malayalam", "Tamil", "Kannada", "Telugu", "Marathi", "Bengali", "Gujarati", "Urdu"];

function SectionModal({ open, target, program, sessionId, onClose, onSaved }: {
  open: boolean; target: SectionRow | null; program: Program | null; sessionId: number | null; onClose: () => void; onSaved: () => void;
}) {
  const { term } = useInstitution();
  const toast = useToast();
  const rooms = useList<Room>(open ? "/academics/rooms" : null);
  const initial = {
    name: target?.name ?? "", capacity: (target ? target.capacity : 40) as number | null, class_teacher_id: target?.class_teacher_id ?? null,
    room_id: target?.room_id ?? null, medium: target?.medium ?? "", shift: target?.shift ?? "",
  };
  const [v, setV] = useState(initial);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const roomOptions = rooms.rows.filter((r) => r.active || r.id === initial.room_id)
    .map((r) => ({ value: r.id, label: r.name, description: [r.building, r.capacity ? `${r.capacity} seats` : null].filter(Boolean).join(" · ") || undefined }));
  const mediumOptions: SelectOption[] = Array.from(new Set([...MEDIUMS, ...(initial.medium ? [initial.medium] : [])])).map((m) => ({ value: m, label: m }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!v.name.trim()) { setError(`Give the ${term("section").toLowerCase()} a name`); return; }
    setSaving(true);
    try {
      const body = { ...v, name: v.name.trim(), medium: v.medium || null, shift: v.shift.trim() || null };
      if (target) await api.put(`/academics/sections/${target.uuid}`, body);
      else await api.post("/academics/sections", { ...body, program_id: program?.id, session_id: sessionId });
      toast.success(target ? "Saved" : `${term("section")} added`);
      onSaved();
    } catch (err) { toast.error("Couldn't save", { description: errText(err) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" dirty={dirty} busy={saving}
      title={target ? `Edit ${target.label}` : `Add ${term("section").toLowerCase()}${program ? ` to ${program.name}` : ""}`}
      footer={<><ModalCancel /><Button variant="primary" type="submit" form="section-form" loading={saving}>{target ? "Save changes" : "Add"}</Button></>}>
      <form id="section-form" onSubmit={submit} noValidate>
        <FormGrid>
          <Field label="Name" required error={error}>
            <TextInput autoFocusInModal value={v.name} onValueChange={(x) => { setV({ ...v, name: x }); setError(""); }} placeholder="e.g. A, Batch 2" maxLength={60} />
          </Field>
          <Field label="Capacity" aside="Optional" hint="Admissions stop when it is full">
            <NumberInput value={v.capacity} onChange={(x) => setV({ ...v, capacity: x })} min={1} max={5000} suffix="seats" />
          </Field>
          <Field label={`Class ${term("teacher").toLowerCase()}`} aside="Optional" className="sm:col-span-2">
            <Select value={v.class_teacher_id} onChange={(x) => setV({ ...v, class_teacher_id: x })} loadOptions={searchStaff} clearable
              placeholder="Search staff" selectedOption={target?.class_teacher_id ? { value: target.class_teacher_id, label: target.class_teacher_name || "Current" } : null} />
          </Field>
          <Field label="Room" aside="Optional">
            <Select value={v.room_id} onChange={(x) => setV({ ...v, room_id: x })} options={roomOptions} clearable placeholder="Pick a room"
              emptyText="No rooms yet. Add them under Rooms & houses." />
          </Field>
          <Field label="Medium" aside="Optional" hint="Language of instruction">
            <Select value={v.medium || null} onChange={(x) => setV({ ...v, medium: x ?? "" })} options={mediumOptions} clearable placeholder="Pick a medium"
              onCreate={async (t) => ({ value: t, label: t })} />
          </Field>
          <Field label="Shift" aside="Optional" className="sm:col-span-2">
            <TextInput value={v.shift} onValueChange={(x) => setV({ ...v, shift: x })} placeholder="e.g. Morning" maxLength={40} />
          </Field>
        </FormGrid>
      </form>
    </Modal>
  );
}

/* ── Quick set-up ──────────────────────────────────────────────────── */

const PRESETS: Record<string, { programs: string[]; sections: string[]; subjects: string[]; month: number }> = {
  school: {
    programs: ["Nursery", "LKG", "UKG", ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)], sections: ["A", "B"], month: 4,
    subjects: ["English", "Hindi", "Mathematics", "Science", "Social Science", "Computer Science", "Physical Education", "Art & Craft", "Music"],
  },
  preschool: {
    programs: ["Playgroup", "Nursery", "LKG", "UKG"], sections: ["Group A"], month: 6,
    subjects: ["English", "Numbers", "Environment", "Art", "Music", "Physical play"],
  },
  college: {
    programs: ["B.Com", "B.Sc Computer Science", "BBA"], sections: ["Batch 1"], month: 7,
    subjects: ["Accountancy", "Business Economics", "Programming in C", "Data Structures", "Principles of Management", "English Communication"],
  },
  university: {
    programs: ["B.Tech CSE", "MBA", "M.Sc Physics"], sections: ["Batch 1"], month: 7,
    subjects: ["Engineering Mathematics", "Programming Fundamentals", "Managerial Economics", "Organisational Behaviour", "Quantum Mechanics", "Classical Mechanics"],
  },
  coaching: {
    programs: ["JEE 2027", "NEET 2027", "Foundation Class 10"], sections: ["Batch 1", "Batch 2"], month: 4,
    subjects: ["Physics", "Chemistry", "Mathematics", "Biology"],
  },
  training: {
    programs: ["Full Stack Development", "Data Analytics", "Digital Marketing"], sections: ["Batch 1"], month: 1,
    subjects: ["Fundamentals", "Hands-on project", "Soft skills", "Assessment"],
  },
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const FALLBACK_TYPES = [
  { key: "school", label: "School (K-12)" }, { key: "preschool", label: "Preschool / Kindergarten" }, { key: "college", label: "College" },
  { key: "university", label: "University" }, { key: "coaching", label: "Coaching / Tuition centre" }, { key: "training", label: "Training institute / Academy" },
];
const TYPE_WORDS: Record<string, Pick<InstitutionTerms, "programs" | "sections" | "subjects">> = {
  school: { programs: "Classes", sections: "Sections", subjects: "Subjects" },
  preschool: { programs: "Classes", sections: "Groups", subjects: "Activity areas" },
  college: { programs: "Programmes", sections: "Batches", subjects: "Courses" },
  university: { programs: "Programmes", sections: "Batches", subjects: "Courses" },
  coaching: { programs: "Courses", sections: "Batches", subjects: "Subjects" },
  training: { programs: "Courses", sections: "Batches", subjects: "Units" },
};

function QuickSetupModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { profile, reload } = useInstitution();
  const toast = useToast();
  const startType = profile?.type && PRESETS[profile.type] ? profile.type : "school";
  const fill = (t: string) => ({ type: t, month: PRESETS[t].month, programs: PRESETS[t].programs.join("\n"), sections: PRESETS[t].sections.join("\n"), subjects: PRESETS[t].subjects.join("\n") });
  const [v, setV] = useState(() => fill(startType));
  const [saving, setSaving] = useState(false);
  const words = TYPE_WORDS[v.type] ?? TYPE_WORDS.school;
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const types = profile?.types?.length ? profile.types : FALLBACK_TYPES;

  async function run() {
    if (!lines(v.programs).length) { toast.error(`Add at least one entry under ${words.programs.toLowerCase()}`); return; }
    setSaving(true);
    try {
      const r = await api.post<{ programs: number; subjects: number }>("/academics/quick-setup", {
        institution_type: v.type, start_month: v.month, programs: lines(v.programs), sections: lines(v.sections), subjects: lines(v.subjects),
      });
      toast.success("Your academic structure is ready", { description: `${r.programs} ${words.programs.toLowerCase()} and ${r.subjects} ${words.subjects.toLowerCase()} set up.` });
      reload();
      onDone();
    } catch (e) { toast.error("Quick set-up didn't finish", { description: errText(e) }); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" busy={saving} title="Quick set-up"
      description="Creates the current year with its terms, then everything listed below. Anything that already exists is skipped, so it is safe to run again."
      footer={<><ModalCancel /><Button variant="primary" icon={Sparkles} loading={saving} onClick={run}>Set it up</Button></>}>
      <div className="space-y-5">
        <Field label="Type of institution" hint="Sets the words used on screen and suggests the lists below">
          <RadioCards columns={3} value={v.type} onChange={(t) => setV(fill(t))}
            options={types.map((t) => ({ value: t.key, label: t.label }))} />
        </Field>
        <FormGrid>
          <Field label="Year starts in">
            <Select value={v.month} onChange={(m) => setV({ ...v, month: m ?? 4 })} options={MONTHS.map((m, i) => ({ value: i + 1, label: m }))} />
          </Field>
        </FormGrid>
        <FormGrid columns={3}>
          <Field label={words.programs} hint="One per line, in order">
            <Textarea value={v.programs} onValueChange={(x) => setV({ ...v, programs: x })} rows={10} />
          </Field>
          <Field label={`${words.sections} in each`} hint="One per line">
            <Textarea value={v.sections} onValueChange={(x) => setV({ ...v, sections: x })} rows={10} />
          </Field>
          <Field label={words.subjects} hint="One per line">
            <Textarea value={v.subjects} onValueChange={(x) => setV({ ...v, subjects: x })} rows={10} />
          </Field>
        </FormGrid>
        <p className="text-[12.5px] text-muted">
          {lines(v.programs).length} {words.programs.toLowerCase()} × {lines(v.sections).length || 0} {words.sections.toLowerCase()} = {lines(v.programs).length * lines(v.sections).length} {words.sections.toLowerCase()} in all, each with room for 40.
        </p>
      </div>
    </Modal>
  );
}
