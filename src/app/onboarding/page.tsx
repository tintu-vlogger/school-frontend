'use client';

/*
 * Institution set-up, shown after sign-up (and reachable later until it is finished).
 * Steps, each skippable, progress kept in companies.config.onboarding:
 *   1. Institution details: name, logo, phone, address, board / affiliation, motto, head
 *      (PUT /company/profile, POST /company/profile/logo, PUT /academics/profile)
 *   2. Academic set-up: session start month, classes / programmes, sections / batches and
 *      subjects, prefilled by institution type (POST /academics/quick-setup)
 *   3. Modules to switch on (PUT /academics/profile { modules })
 *   4. Invite staff (POST /employees/ + PUT /roles/assignments/{id})
 *   5. Done, on to the dashboard.
 * A company without a name or web address (older sign-ups) must fill those in step 1.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, BookOpen, LayoutGrid, UserPlus, PartyPopper, Check, ChevronLeft, ChevronRight, LogOut, Upload, X,
  Plus, Trash2, Copy, CalendarCheck, Clock, ClipboardList, GraduationCap, MonitorPlay, Video, Wallet, Library,
  Bus, BedDouble, HeartPulse, MessagesSquare, BadgeIndianRupee,
} from 'lucide-react';
import { api, API_BASE, moveToCompanyHost, resolveImageUrl } from '@/lib/api';
import { useToast } from '@/lib/toast-context';
import { Button, Field, FormGrid, TextInput, Textarea, Toggle, Select } from '@/components/ui-kit';

/* ── Presets per institution type ──────────────────────────────────── */

type Preset = { month: number; programs: string[]; sections: string[]; subjects: string[] };

const PRESETS: Record<string, Preset> = {
  school: {
    month: 4,
    programs: ['Nursery', 'LKG', 'UKG', ...Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`)],
    sections: ['A', 'B'],
    subjects: ['English', 'Hindi', 'Mathematics', 'Science', 'Social Science', 'Computer Science', 'Physical Education', 'Art & Craft', 'Music'],
  },
  preschool: {
    month: 4,
    programs: ['Playgroup', 'Nursery', 'LKG', 'UKG'],
    sections: ['Sunflower', 'Tulip'],
    subjects: ['Language and literacy', 'Numbers', 'Our world', 'Art and craft', 'Music and movement', 'Outdoor play'],
  },
  college: {
    month: 6,
    programs: ['B.Com', 'BBA', 'B.Sc Computer Science', 'BA English'],
    sections: ['Batch A'],
    subjects: ['Financial Accounting', 'Business Communication', 'Programming in C', 'Environmental Studies', 'English'],
  },
  university: {
    month: 7,
    programs: ['B.Tech Computer Science', 'B.Tech Mechanical', 'MBA', 'M.Sc Physics', 'BA Economics'],
    sections: ['Batch A', 'Batch B'],
    subjects: ['Engineering Mathematics', 'Data Structures', 'Thermodynamics', 'Managerial Economics', 'Quantum Mechanics'],
  },
  coaching: {
    month: 4,
    programs: ['JEE Main', 'NEET', 'Foundation (Class 9-10)'],
    sections: ['Morning batch', 'Evening batch'],
    subjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology'],
  },
  training: {
    month: 1,
    programs: ['Full-stack web development', 'Digital marketing', 'Spoken English'],
    sections: ['Weekday batch', 'Weekend batch'],
    subjects: ['Foundations', 'Hands-on project', 'Assessment'],
  },
};

const WORDS: Record<string, { program: string; programs: string; sections: string; subjects: string; teachers: string }> = {
  school: { program: 'class', programs: 'Classes', sections: 'Sections', subjects: 'Subjects', teachers: 'teachers' },
  preschool: { program: 'class', programs: 'Classes', sections: 'Groups', subjects: 'Activity areas', teachers: 'teachers' },
  college: { program: 'programme', programs: 'Programmes', sections: 'Batches', subjects: 'Courses', teachers: 'faculty' },
  university: { program: 'programme', programs: 'Programmes', sections: 'Batches', subjects: 'Courses', teachers: 'faculty' },
  coaching: { program: 'course', programs: 'Courses', sections: 'Batches', subjects: 'Subjects', teachers: 'tutors' },
  training: { program: 'course', programs: 'Courses', sections: 'Batches', subjects: 'Units', teachers: 'trainers' },
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const MODULES: { key: string; label: string; text: string; icon: typeof Clock }[] = [
  { key: 'admissions', label: 'Admissions', text: 'Enquiries, online applications and enrolment', icon: ClipboardList },
  { key: 'attendance', label: 'Attendance', text: 'Daily or period-wise, with alerts to parents', icon: CalendarCheck },
  { key: 'timetable', label: 'Timetable', text: 'Periods, rooms and substitutions', icon: Clock },
  { key: 'exams', label: 'Exams and report cards', text: 'Marks, grades, GPA and printable report cards', icon: GraduationCap },
  { key: 'lms', label: 'Learning', text: 'Homework, assignments, notes and quizzes', icon: MonitorPlay },
  { key: 'online_classes', label: 'Live online classes', text: 'Scheduled video classes with attendance', icon: Video },
  { key: 'fees', label: 'Fees', text: 'Fee plans, online payments, receipts and dues', icon: Wallet },
  { key: 'comms', label: 'Messages and notices', text: 'Notices, circulars and the parent app', icon: MessagesSquare },
  { key: 'library', label: 'Library', text: 'Catalogue, issues, returns and fines', icon: Library },
  { key: 'transport', label: 'Transport', text: 'Routes, stops, vehicles and fees', icon: Bus },
  { key: 'hostel', label: 'Hostel', text: 'Rooms, allotments and visitors', icon: BedDouble },
  { key: 'wellbeing', label: 'Health and wellbeing', text: 'Health records, incidents and counselling', icon: HeartPulse },
  { key: 'staff_payroll', label: 'Staff payroll', text: 'Salaries, payslips and statutory deductions', icon: BadgeIndianRupee },
];

const DEFAULT_OFF: Record<string, string[]> = {
  school: ['hostel'], preschool: ['hostel', 'online_classes', 'library', 'exams'], college: [], university: [],
  coaching: ['hostel', 'transport', 'library', 'wellbeing'], training: ['hostel', 'transport', 'library', 'wellbeing'],
};

const STEPS = [
  { key: 'details', label: 'Institution details', icon: Building2 },
  { key: 'academics', label: 'Academic set-up', icon: BookOpen },
  { key: 'modules', label: 'Modules', icon: LayoutGrid },
  { key: 'staff', label: 'Invite staff', icon: UserPlus },
  { key: 'done', label: 'All set', icon: PartyPopper },
] as const;

type Progress = { step?: number; completed?: string[]; finished?: boolean };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Profile = any;
type Role = { id: number; role_name: string; display_name: string; is_system: boolean };
type Invite = { first: string; last: string; email: string; role: string };
type Invited = { name: string; email: string; password: string; role: string };

function companySlugFromHost(): string | null {
  if (typeof window === 'undefined') return null;
  const roots = (process.env.NEXT_PUBLIC_ROOT_DOMAINS ?? 'campusly.app,lvh.me,localhost').split(',').map((r) => r.trim());
  const h = window.location.hostname.toLowerCase();
  for (const r of roots) {
    if (h.endsWith(`.${r}`)) {
      const sub = h.slice(0, -(r.length + 1));
      if (sub && !['www', 'api', 'admin', 'app'].includes(sub) && !sub.includes('.')) return sub;
    }
  }
  return null;
}

function tempPassword() {
  const a = 'abcdefghjkmnpqrstuvwxyz', A = 'ABCDEFGHJKMNPQRSTUVWXYZ', d = '23456789';
  const pick = (s: string, n: number) => Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]).join('');
  return `${pick(A, 1)}${pick(a, 5)}${pick(d, 3)}#`;
}

/* ── Small list editor (chips) ─────────────────────────────────────── */

function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.split(',').map((x) => x.trim()).filter(Boolean).filter((x) => !items.includes(x));
    if (parts.length) onChange([...items, ...parts]);
    setDraft('');
  };
  return (
    <div className="rounded-lg border border-line bg-surface p-2 focus-within:border-primary/50">
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span key={it} className="inline-flex items-center gap-1 rounded-md bg-sunken px-2 py-1 text-[13px] text-ink">
            {it}
            <button type="button" aria-label={`Remove ${it}`} onClick={() => onChange(items.filter((x) => x !== it))} className="text-faint hover:text-ink">
              <X size={12} strokeWidth={1.6} />
            </button>
          </span>
        ))}
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={items.length ? 'Add more…' : placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); } else if (e.key === 'Backspace' && !draft && items.length) onChange(items.slice(0, -1)); }}
          onBlur={add} className="h-7 min-w-[140px] flex-1 bg-transparent px-1 text-[13.5px] text-ink outline-none placeholder:text-faint" />
      </div>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────────── */

export default function OnboardingPage() {
  const router = useRouter();
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<{ email: string; full_name: string } | null>(null);

  // Step 1
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [needsSlug, setNeedsSlug] = useState(false);
  const [logo, setLogo] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [board, setBoard] = useState('');
  const [affiliation, setAffiliation] = useState('');
  const [motto, setMotto] = useState('');
  const [head, setHead] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // Step 2
  const [type, setType] = useState('school');
  const [types, setTypes] = useState<{ key: string; label: string }[]>([]);
  const [month, setMonth] = useState(4);
  const [programs, setPrograms] = useState<string[]>(PRESETS.school.programs);
  const [sections, setSections] = useState<string[]>(PRESETS.school.sections);
  const [subjects, setSubjects] = useState<string[]>(PRESETS.school.subjects);
  const [hasStructure, setHasStructure] = useState(false);

  // Step 3
  const [modules, setModules] = useState<Record<string, boolean>>({});

  // Step 4
  const [roles, setRoles] = useState<Role[]>([]);
  const [invites, setInvites] = useState<Invite[]>([{ first: '', last: '', email: '', role: 'teacher' }]);
  const [invited, setInvited] = useState<Invited[]>([]);

  const words = WORDS[type] ?? WORDS.school;

  const applyPreset = useCallback((t: string) => {
    const p = PRESETS[t] ?? PRESETS.school;
    setMonth(p.month); setPrograms(p.programs); setSections(p.sections); setSubjects(p.subjects);
  }, []);

  useEffect(() => {
    api.get<{ email: string; full_name: string }>('/auth/me').then(setMe).catch(() => {});
    Promise.all([
      api.get<Profile>('/company/profile').catch(() => null),
      api.get<Profile>('/academics/profile').catch(() => null),
      api.get<{ programs: number }>('/academics/overview').catch(() => null),
    ]).then(([co, prof, overview]) => {
      if (co) {
        const cfg = co.config || {};
        setName(co.company_name || ''); setSlug(co.slug || ''); setNeedsSlug(!co.slug);
        setLogo(co.logo_url || ''); setPhone(co.phone || ''); setAddress(co.address || '');
        setCity(co.city || ''); setState(co.state || ''); setPincode(co.pincode || '');
        const prog: Progress = cfg.onboarding || {};
        setCompleted(prog.completed || []);
        if (typeof prog.step === 'number' && !prog.finished) setStep(Math.min(prog.step, STEPS.length - 1));
      }
      if (prof) {
        const t = prof.type || 'school';
        setType(t); setTypes(prof.types || []); applyPreset(t);
        setBoard(prof.board || ''); setAffiliation(prof.affiliation_no || ''); setMotto(prof.motto || ''); setHead(prof.principal_name || '');
        const off = DEFAULT_OFF[t] ?? [];
        const saved = prof.modules || {};
        const hasSaved = co?.config?.institution?.modules;
        setModules(Object.fromEntries(MODULES.map((m) => [m.key, hasSaved ? saved[m.key] !== false : !off.includes(m.key)])));
      }
      if (overview && overview.programs > 0) setHasStructure(true);
      setLoaded(true);
    });
    api.get<Role[]>('/roles/').then((r) => setRoles(r.filter((x) => x.is_system && !['parent', 'student', 'admin'].includes(x.role_name)))).catch(() => {});
  }, [applyPreset]);

  const saveProgress = useCallback(async (nextStep: number, done: string[], finished = false) => {
    try { await api.put('/company/profile', { config: { onboarding: { step: nextStep, completed: done, finished } } }); } catch { /* progress is a convenience */ }
  }, []);

  async function uploadLogo(file: File) {
    if (!file.type.startsWith('image/')) { toast.error('Choose an image file.'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('Use an image under 2 MB.'); return; }
    const fd = new FormData();
    fd.append('file', file);
    const headers: Record<string, string> = {};
    const tok = localStorage.getItem('hrms_token');
    if (tok) headers.Authorization = `Bearer ${tok}`;
    const s = companySlugFromHost();
    if (s) headers['X-Company-Slug'] = s;
    const r = await fetch(`${API_BASE}/company/profile/logo`, { method: 'POST', body: fd, headers });
    if (!r.ok) { const b = await r.json().catch(() => ({})); toast.error(b.detail || 'Could not upload the logo.'); return; }
    const b = await r.json();
    setLogo(b.logo_url || '');
  }

  // Each step's save; returns false to stay on the step.
  async function saveStep(i: number): Promise<boolean> {
    const key = STEPS[i].key;
    if (key === 'details') {
      if (!name.trim()) { setError('Enter your institution’s name.'); return false; }
      if (needsSlug) {
        if (!slug.trim()) { setError('Choose a web address.'); return false; }
        await api.post('/company/onboarding', { name: name.trim(), slug: slug.trim() });
      }
      await api.put('/company/profile', { company_name: name.trim(), phone: phone || null, address: address || null, city: city || null, state: state || null, pincode: pincode || null });
      await api.put('/academics/profile', { board, affiliation_no: affiliation, motto, principal_name: head });
    } else if (key === 'academics') {
      await api.post('/academics/quick-setup', { institution_type: type, start_month: month, programs, sections, subjects });
      setHasStructure(true);
    } else if (key === 'modules') {
      await api.put('/academics/profile', { modules });
    } else if (key === 'staff') {
      const rows = invites.filter((r) => r.first.trim() || r.email.trim());
      for (const r of rows) {
        if (!r.first.trim() || !/\S+@\S+\.\S+/.test(r.email)) { setError('Each person needs a first name and a valid email.'); return false; }
      }
      const added: Invited[] = [];
      const left: Invite[] = [];
      for (const r of rows) {
        const password = tempPassword();
        try {
          const emp = await api.post<{ id: number }>('/employees/', { first_name: r.first.trim(), last_name: r.last.trim() || '-', email: r.email.trim(), password, role: 'employee' });
          const role = roles.find((x) => x.role_name === r.role);
          if (role && r.role !== 'employee') await api.put(`/roles/assignments/${emp.id}`, { role_ids: [role.id] }).catch(() => {});
          added.push({ name: `${r.first} ${r.last}`.trim(), email: r.email.trim(), password, role: role?.display_name || 'Staff' });
        } catch (e) {
          left.push(r);
          setError(`${r.email}: ${e instanceof Error ? e.message : 'could not add'}`);
        }
      }
      setInvited((p) => [...p, ...added]);
      if (left.length) { setInvites(left); return false; }
      setInvites([{ first: '', last: '', email: '', role: 'teacher' }]);
      if (added.length) { toast.success(`${added.length} added`); return false; } // stay to show their first passwords
    }
    return true;
  }

  async function next(skip = false) {
    setError(null);
    setSaving(true);
    try {
      let done = completed;
      if (!skip) {
        const ok = await saveStep(step);
        if (!ok) { setSaving(false); return; }
        done = Array.from(new Set([...completed, STEPS[step].key]));
        setCompleted(done);
      }
      const n = Math.min(step + 1, STEPS.length - 1);
      setStep(n);
      await saveProgress(n, done, n === STEPS.length - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.');
    }
    setSaving(false);
  }

  async function finish() {
    setSaving(true);
    await saveProgress(STEPS.length - 1, completed, true);
    const tok = localStorage.getItem('hrms_token');
    if (slug && tok && moveToCompanyHost(slug, tok, '/dashboard')) return;
    router.push('/dashboard');
  }

  const goTo = (i: number) => { setError(null); setStep(i); saveProgress(i, completed); };
  const signOut = () => { localStorage.removeItem('hrms_token'); router.push('/login'); };

  const roleOptions = useMemo(() => {
    const list = roles.length ? roles.map((r) => ({ value: r.role_name, label: r.display_name })) : [
      { value: 'teacher', label: 'Teacher / Faculty' }, { value: 'principal', label: 'Principal / Head' },
      { value: 'accountant', label: 'Accountant' }, { value: 'hr', label: 'Office / HR' }, { value: 'employee', label: 'Staff' },
    ];
    return list;
  }, [roles]);

  const current = STEPS[step];
  const isDone = current.key === 'done';

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between border-b border-line bg-surface px-5 py-3 sm:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="Campusly" className="h-8" />
        <div className="flex items-center gap-3">
          {me && <p className="hidden text-right text-[13px] text-muted sm:block">{me.full_name || me.email}</p>}
          <button onClick={() => router.push('/dashboard')} className="text-[13px] text-muted hover:text-ink">Finish later</button>
          <button onClick={signOut} className="flex h-8 w-8 items-center justify-center rounded-lg text-faint hover:bg-sunken hover:text-ink" title="Sign out" aria-label="Sign out">
            <LogOut size={16} strokeWidth={1.4} />
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:py-12 lg:grid-cols-[230px_1fr]">
        {/* Step rail */}
        <nav aria-label="Set-up steps" className="lg:sticky lg:top-8 lg:self-start">
          <p className="text-[12px] uppercase tracking-[0.1em] text-faint">Set up {name || 'your institution'}</p>
          <ol className="mt-4 flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible">
            {STEPS.map((s, i) => {
              const done = completed.includes(s.key);
              const on = i === step;
              return (
                <li key={s.key} className="shrink-0">
                  <button type="button" onClick={() => goTo(i)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors ${on ? 'bg-surface text-ink ring-1 ring-line' : 'text-muted hover:text-ink'}`}>
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${done ? 'bg-primary text-white' : on ? 'bg-primary-soft text-primary' : 'bg-sunken text-faint'}`}>
                      {done ? <Check size={13} strokeWidth={2} /> : i + 1}
                    </span>
                    <span className="whitespace-nowrap">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="mt-5 hidden h-[3px] overflow-hidden rounded-full bg-line lg:block">
            <div className="h-full bg-primary transition-all" style={{ width: `${(completed.filter((k) => k !== 'done').length / (STEPS.length - 1)) * 100}%` }} />
          </div>
        </nav>

        <main className="min-w-0">
          {!loaded ? (
            <div className="h-96 animate-pulse rounded-2xl border border-line bg-surface" />
          ) : (
            <div className="rounded-2xl border border-line bg-surface">
              <div className="border-b border-line px-6 py-5">
                <div className="flex items-center gap-2 text-primary">
                  <current.icon size={18} strokeWidth={1.4} />
                  <span className="text-[12px] uppercase tracking-[0.08em]">Step {step + 1} of {STEPS.length}</span>
                </div>
                <h1 className="mt-1.5 text-[24px] font-extralight text-ink">
                  {current.key === 'details' && 'Tell us about your institution'}
                  {current.key === 'academics' && `${words.programs}, ${words.sections.toLowerCase()} and ${words.subjects.toLowerCase()}`}
                  {current.key === 'modules' && 'Choose what you want to use'}
                  {current.key === 'staff' && 'Bring your staff in'}
                  {current.key === 'done' && 'You are ready to go'}
                </h1>
                <p className="mt-1 text-[14px] text-muted">
                  {current.key === 'details' && 'Shown on report cards, receipts, your website and the parent app.'}
                  {current.key === 'academics' && `We filled in a typical set-up for your kind of institution. Edit anything; you can change it all later.`}
                  {current.key === 'modules' && 'Switch off what you do not need; the menu stays tidy. You can switch modules on any time.'}
                  {current.key === 'staff' && `Add a few ${words.teachers} and office staff now, or later from Staff.`}
                  {current.key === 'done' && 'Here is what to do next.'}
                </p>
              </div>

              <div className="space-y-5 px-6 py-6">
                {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[13px] text-rose-700">{error}</p>}

                {current.key === 'details' && (
                  <>
                    <div className="flex items-center gap-4">
                      <button type="button" onClick={() => fileRef.current?.click()}
                        className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-line-strong bg-sunken hover:border-primary/60">
                        {logo
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={resolveImageUrl(logo)} alt="Logo" className="h-full w-full object-contain p-1.5" />
                          : <Upload size={20} strokeWidth={1.4} className="text-faint group-hover:text-primary" />}
                      </button>
                      <div>
                        <p className="text-[14px] text-ink">Logo or crest</p>
                        <p className="text-[12.5px] text-muted">PNG or JPG, under 2 MB. Square works best.</p>
                        <button type="button" onClick={() => fileRef.current?.click()} className="mt-1 text-[13px] text-primary hover:text-primary-dark">{logo ? 'Change' : 'Upload'}</button>
                      </div>
                      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ''; }} />
                    </div>
                    <FormGrid>
                      <Field label="Institution name" required className="sm:col-span-2">
                        <TextInput value={name} onValueChange={setName} placeholder="e.g. Green Valley Public School" />
                      </Field>
                      {needsSlug && (
                        <Field label="Web address" required hint="Letters, numbers and hyphens" className="sm:col-span-2">
                          <TextInput value={slug} onValueChange={(v) => setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="green-valley" />
                        </Field>
                      )}
                      <Field label="Motto" hint="Optional, shown on your website" className="sm:col-span-2">
                        <TextInput value={motto} onValueChange={setMotto} placeholder="e.g. Learn, lead, serve" />
                      </Field>
                      <Field label="Board or affiliation">
                        <TextInput value={board} onValueChange={setBoard} placeholder="e.g. CBSE, ICSE, State board, University" />
                      </Field>
                      <Field label="Affiliation number">
                        <TextInput value={affiliation} onValueChange={setAffiliation} />
                      </Field>
                      <Field label="Head of institution" hint="Principal, director or head">
                        <TextInput value={head} onValueChange={setHead} />
                      </Field>
                      <Field label="Phone">
                        <TextInput type="tel" value={phone} onValueChange={setPhone} />
                      </Field>
                      <Field label="Address" className="sm:col-span-2">
                        <Textarea value={address} onValueChange={setAddress} rows={2} placeholder="Building, street, area" />
                      </Field>
                      <Field label="City">
                        <TextInput value={city} onValueChange={setCity} />
                      </Field>
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="State">
                          <TextInput value={state} onValueChange={setState} />
                        </Field>
                        <Field label="PIN / ZIP">
                          <TextInput value={pincode} onValueChange={(v) => setPincode(v.slice(0, 10))} />
                        </Field>
                      </div>
                    </FormGrid>
                  </>
                )}

                {current.key === 'academics' && (
                  <>
                    {hasStructure && (
                      <p className="rounded-lg border border-line bg-sunken px-3.5 py-2.5 text-[13px] text-muted">
                        Your institution already has some {words.programs.toLowerCase()}. Saving again only adds what is missing.
                      </p>
                    )}
                    <FormGrid>
                      <Field label="Type of institution">
                        <Select value={type} onChange={(v) => { const t = v || 'school'; setType(t); applyPreset(t); }}
                          options={(types.length ? types : Object.keys(PRESETS).map((k) => ({ key: k, label: k }))).map((t) => ({ value: t.key, label: t.label }))} />
                      </Field>
                      <Field label="Academic year starts in">
                        <Select value={String(month)} onChange={(v) => setMonth(Number(v) || 4)} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
                      </Field>
                    </FormGrid>
                    <Field label={words.programs} hint={`Type a ${words.program} and press Enter. Separate several with commas.`}>
                      <ListEditor items={programs} onChange={setPrograms} placeholder={`Add a ${words.program}`} />
                    </Field>
                    <Field label={`${words.sections} in each ${words.program}`} hint="You can change the number per one later.">
                      <ListEditor items={sections} onChange={setSections} placeholder="e.g. A, B" />
                    </Field>
                    <Field label={words.subjects}>
                      <ListEditor items={subjects} onChange={setSubjects} placeholder="Add one" />
                    </Field>
                    <p className="text-[12.5px] text-faint">
                      This creates {programs.length} {words.programs.toLowerCase()} with {programs.length * sections.length} {words.sections.toLowerCase()} for the current academic year, and {subjects.length} {words.subjects.toLowerCase()}.
                    </p>
                  </>
                )}

                {current.key === 'modules' && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {MODULES.map((m) => (
                      <label key={m.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors ${modules[m.key] ? 'border-primary/40 bg-primary-soft/40' : 'border-line hover:border-line-strong'}`}>
                        <m.icon size={18} strokeWidth={1.4} className={`mt-0.5 shrink-0 ${modules[m.key] ? 'text-primary' : 'text-faint'}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] text-ink">{m.label}</span>
                          <span className="block text-[12.5px] text-muted">{m.text}</span>
                        </span>
                        <Toggle size="sm" checked={!!modules[m.key]} aria-label={m.label} onChange={(v) => setModules((p) => ({ ...p, [m.key]: v }))} />
                      </label>
                    ))}
                  </div>
                )}

                {current.key === 'staff' && (
                  <>
                    <div className="space-y-2.5">
                      {invites.map((r, i) => (
                        <div key={i} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_1fr_1.4fr_1fr_auto] sm:items-center sm:border-0 sm:p-0">
                          <TextInput aria-label="First name" placeholder="First name" value={r.first} onValueChange={(v) => setInvites((p) => p.map((x, j) => (j === i ? { ...x, first: v } : x)))} />
                          <TextInput aria-label="Last name" placeholder="Last name" value={r.last} onValueChange={(v) => setInvites((p) => p.map((x, j) => (j === i ? { ...x, last: v } : x)))} />
                          <TextInput aria-label="Email" type="email" placeholder="Email" value={r.email} onValueChange={(v) => setInvites((p) => p.map((x, j) => (j === i ? { ...x, email: v } : x)))} />
                          <Select aria-label="Role" value={r.role} onChange={(v) => setInvites((p) => p.map((x, j) => (j === i ? { ...x, role: v || 'employee' } : x)))} options={roleOptions} />
                          <button type="button" aria-label="Remove row" onClick={() => setInvites((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : [{ first: '', last: '', email: '', role: 'teacher' }]))}
                            className="flex h-9 w-9 items-center justify-center justify-self-end rounded-lg text-faint hover:bg-sunken hover:text-ink">
                            <Trash2 size={15} strokeWidth={1.4} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Button variant="ghost" size="sm" icon={Plus} onClick={() => setInvites((p) => [...p, { first: '', last: '', email: '', role: 'teacher' }])}>Add another</Button>
                    {invited.length > 0 && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                        <p className="text-[13.5px] text-ink">Added. Share these first passwords; people can also use “Forgot your password?” on the sign-in page.</p>
                        <ul className="mt-3 divide-y divide-emerald-100">
                          {invited.map((p) => (
                            <li key={p.email} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                              <span className="min-w-0"><span className="text-ink">{p.name}</span> <span className="text-muted">· {p.role} · {p.email}</span></span>
                              <button type="button" onClick={() => { navigator.clipboard?.writeText(`${p.email} / ${p.password}`); toast.success('Copied'); }}
                                className="inline-flex items-center gap-1.5 rounded-md bg-surface px-2 py-1 font-mono text-[12.5px] text-ink ring-1 ring-line hover:ring-line-strong">
                                {p.password} <Copy size={12} strokeWidth={1.5} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}

                {current.key === 'done' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {[
                      { title: `Add ${words.teachers === 'faculty' ? 'students' : 'students'}`, text: 'One by one or from a spreadsheet; parents get their sign-in.', href: '/dashboard/students' },
                      { title: `Assign ${words.teachers}`, text: `Class ${words.teachers === 'teachers' ? 'teachers' : 'leads'} and who teaches what.`, href: '/dashboard/academics' },
                      { title: 'Set up fees', text: 'Fee plans, due dates and online payments.', href: '/dashboard/fees' },
                      { title: 'Your website', text: 'A ready-made site with admissions open.', href: '/dashboard/settings/website' },
                    ].map((c) => (
                      <a key={c.title} href={c.href} className="group rounded-xl border border-line p-4 transition-colors hover:border-primary/40">
                        <p className="flex items-center justify-between text-[14.5px] text-ink">{c.title} <ChevronRight size={15} strokeWidth={1.5} className="text-faint group-hover:text-primary" /></p>
                        <p className="mt-1 text-[12.5px] text-muted">{c.text}</p>
                      </a>
                    ))}
                    {STEPS.slice(0, -1).some((s) => !completed.includes(s.key)) && (
                      <p className="text-[12.5px] text-faint sm:col-span-2">
                        Skipped a step? Pick it on the left any time, or come back to this page later.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
                {step > 0 ? (
                  <Button variant="secondary" icon={ChevronLeft} onClick={() => goTo(step - 1)} disabled={saving}>Back</Button>
                ) : <span />}
                <div className="flex items-center gap-2">
                  {!isDone && current.key !== 'details' && <Button variant="ghost" onClick={() => next(true)} disabled={saving}>Skip for now</Button>}
                  {isDone
                    ? <Button onClick={finish} loading={saving} iconRight={ChevronRight}>Go to dashboard</Button>
                    : <Button onClick={() => next(false)} loading={saving} iconRight={ChevronRight}>
                        {current.key === 'staff' && invites.some((r) => r.first.trim() || r.email.trim()) ? 'Add staff' : 'Save and continue'}
                      </Button>}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
