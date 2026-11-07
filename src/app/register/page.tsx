'use client'

/*
 * Sign-up for a new institution (main site only). Asks for the owner, the institution, its
 * type and size, country and timezone, and the web address (sub-domain) with a live
 * availability check (GET /public/slug-available). The new owner then continues on the
 * institution's own address at /onboarding.
 */
import { useState, useEffect, useMemo, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Eye, EyeOff, User, Mail, Lock, School, Baby, GraduationCap, Landmark, BookOpenCheck, Presentation,
  Check, Loader2, Globe2, CalendarCheck, Wallet, MessagesSquare,
} from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast-context'
import { API_BASE, moveToCompanyHost } from '@/lib/api'

const TYPES = [
  { key: 'school', label: 'School', hint: 'K-12', icon: School },
  { key: 'preschool', label: 'Preschool', hint: 'Kindergarten', icon: Baby },
  { key: 'college', label: 'College', hint: 'Semesters', icon: GraduationCap },
  { key: 'university', label: 'University', hint: 'Many departments', icon: Landmark },
  { key: 'coaching', label: 'Coaching', hint: 'Tuition, test prep', icon: BookOpenCheck },
  { key: 'training', label: 'Training', hint: 'Courses, academies', icon: Presentation },
] as const

const LEARNERS = ['Up to 100', '101-300', '301-1000', '1001-3000', '3000+']

const COUNTRIES: { name: string; tz: string }[] = [
  { name: 'India', tz: 'Asia/Kolkata' },
  { name: 'United Arab Emirates', tz: 'Asia/Dubai' },
  { name: 'Saudi Arabia', tz: 'Asia/Riyadh' },
  { name: 'Qatar', tz: 'Asia/Qatar' },
  { name: 'Oman', tz: 'Asia/Muscat' },
  { name: 'Kuwait', tz: 'Asia/Kuwait' },
  { name: 'Bahrain', tz: 'Asia/Bahrain' },
  { name: 'Nepal', tz: 'Asia/Kathmandu' },
  { name: 'Sri Lanka', tz: 'Asia/Colombo' },
  { name: 'Bangladesh', tz: 'Asia/Dhaka' },
  { name: 'Singapore', tz: 'Asia/Singapore' },
  { name: 'Malaysia', tz: 'Asia/Kuala_Lumpur' },
  { name: 'Kenya', tz: 'Africa/Nairobi' },
  { name: 'Nigeria', tz: 'Africa/Lagos' },
  { name: 'South Africa', tz: 'Africa/Johannesburg' },
  { name: 'United Kingdom', tz: 'Europe/London' },
  { name: 'United States', tz: 'America/New_York' },
  { name: 'Canada', tz: 'America/Toronto' },
  { name: 'Australia', tz: 'Australia/Sydney' },
  { name: 'Other', tz: '' },
]

const PITCH = [
  { icon: CalendarCheck, text: 'Admissions, attendance and timetables' },
  { icon: GraduationCap, text: 'Exams and report cards in your grading system' },
  { icon: Wallet, text: 'Fees with online payments and receipts' },
  { icon: MessagesSquare, text: 'A parent and student app that people actually open' },
]

function slugify(v: string) {
  return v.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')
}

function browserTz(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata'
    return tz === 'Asia/Calcutta' ? 'Asia/Kolkata' : tz
  } catch { return 'Asia/Kolkata' }
}

type Check = { state: 'idle' | 'checking' | 'ok' | 'bad'; msg?: string; suggestion?: string }

function RegisterForm() {
  const router = useRouter()
  const auth = useAuth()
  const toast = useToast()
  const searchParams = useSearchParams()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [instName, setInstName] = useState('')
  const [instType, setInstType] = useState<string>(() => {
    const t = searchParams.get('type') || ''
    return TYPES.some((x) => x.key === t) ? t : 'school'
  })
  const [learners, setLearners] = useState('')
  const [country, setCountry] = useState('India')
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [check, setCheck] = useState<Check>({ state: 'idle' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // Start from the browser's timezone (and its country when we know it).
  useEffect(() => {
    const tz = browserTz()
    setTimezone(tz)
    const c = COUNTRIES.find((x) => x.tz === tz)
    if (c) setCountry(c.name)
  }, [])

  // Partner code: from ?ref= or typed in.
  const [refCode, setRefCode] = useState(() => (searchParams.get('ref') || '').toUpperCase())
  const [refState, setRefState] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle')
  const [refName, setRefName] = useState('')
  useEffect(() => {
    const code = refCode.replace(/[^A-Z0-9]/g, '')
    if (code.length < 6) { setRefState('idle'); return }
    setRefState('checking')
    const t = setTimeout(() => {
      fetch(`${API_BASE}/platform/referral/${code}`).then((r) => r.json())
        .then((d) => { setRefState(d.valid ? 'valid' : 'invalid'); setRefName(d.name || '') })
        .catch(() => setRefState('idle'))
    }, 350)
    return () => clearTimeout(t)
  }, [refCode])

  const effectiveSlug = slugEdited ? slug : slugify(instName)

  // Is the web address free? (debounced)
  useEffect(() => {
    if (!effectiveSlug) { setCheck({ state: 'idle' }); return }
    setCheck({ state: 'checking' })
    const t = setTimeout(() => {
      fetch(`${API_BASE}/public/slug-available?slug=${encodeURIComponent(effectiveSlug)}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((r: { available: boolean; reason?: string; suggestion?: string }) =>
          setCheck(r.available ? { state: 'ok' } : { state: 'bad', msg: r.reason, suggestion: r.suggestion }))
        .catch(() => setCheck({ state: 'idle' }))
    }, 350)
    return () => clearTimeout(t)
  }, [effectiveSlug])

  // The address shown follows the host this page is on (set after mount so server and browser agree).
  const [host, setHost] = useState({ suffix: '.campusly.app', scheme: 'https://' })
  useEffect(() => {
    const roots = (process.env.NEXT_PUBLIC_ROOT_DOMAINS ?? 'campusly.app,lvh.me,localhost').split(',').map((r) => r.trim()).filter(Boolean)
    const loc = window.location
    const root = roots.find((r) => loc.hostname === r || loc.hostname.endsWith('.' + r)) || loc.hostname
    setHost({ suffix: `.${root}${loc.port ? ':' + loc.port : ''}`, scheme: `${loc.protocol}//` })
  }, [])

  const tzOptions = useMemo(() => {
    let all: string[] = []
    try { all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [] } catch { /* old browser */ }
    const set = new Set([timezone, ...COUNTRIES.map((c) => c.tz).filter(Boolean), ...all])
    return Array.from(set)
  }, [timezone])

  function validate() {
    const e: Record<string, string> = {}
    if (!fullName.trim()) e.fullName = 'Enter your name'
    if (!email.trim()) e.email = 'Enter your email'
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'This email doesn\'t look right'
    if (!password) e.password = 'Choose a password'
    else if (password.length < 8) e.password = 'Use at least 8 characters'
    if (!instName.trim()) e.instName = 'Enter your institution\'s name'
    if (!effectiveSlug) e.slug = 'Choose a web address'
    else if (check.state === 'bad') e.slug = check.msg || 'Pick a web address that is available'
    if (refCode && refState === 'invalid') e.refCode = 'This partner code was not found. Clear it or check with your partner.'
    setFieldErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev: FormEvent) {
    ev.preventDefault()
    if (!validate()) return
    setError('')
    setSubmitting(true)
    try {
      const res = await auth.register({
        email, password, full_name: fullName, company_name: instName,
        institution_type: instType, learners: learners || undefined,
        country: country === 'Other' ? undefined : country, timezone: timezone || undefined,
        slug: effectiveSlug,
        ref_code: refCode.replace(/[^A-Z0-9]/g, '') || undefined,
      })
      toast.success('Your institution is ready')
      // Continue on the institution's own address.
      if (res.user.slug && moveToCompanyHost(res.user.slug, res.access_token, '/onboarding')) return
      router.push('/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed. Please try again.')
      setSubmitting(false)
    }
  }

  const field = (err?: string) =>
    `h-11 w-full rounded-lg border bg-white pl-9 pr-3 text-[14px] text-gray-900 placeholder:text-gray-300 outline-none transition-colors ${err ? 'border-rose-300' : 'border-gray-200 focus:border-primary/60'}`
  const plain = 'h-11 w-full rounded-lg border border-gray-200 bg-white px-3 text-[14px] text-gray-900 outline-none transition-colors focus:border-primary/60'
  const lab = 'mb-1 block text-[12.5px] font-light text-gray-500'
  const err = (k: string) => fieldErrors[k] && <p className="mt-1 text-[12px] text-rose-600">{fieldErrors[k]}</p>
  const typeLabel = TYPES.find((t) => t.key === instType)?.label.toLowerCase() ?? 'institution'

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-3 sm:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <Link href="/"><img src="/logo.svg" alt="Campusly" className="h-9" /></Link>
        <span className="text-[13px] font-light text-gray-400">
          Already with us? <Link href="/login" className="text-primary hover:text-primary-dark">Sign in</Link>
        </span>
      </div>

      <div className="flex flex-1">
        {/* Left panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-[#16161d] p-12 lg:flex lg:w-[44%]">
          <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="relative">
            <p className="text-[12px] uppercase tracking-[0.14em] text-indigo-300/80">Campusly</p>
            <h2 className="mt-3 max-w-md text-[36px] font-extralight leading-[1.15] text-white">
              {instName ? <>A calmer way to run <span className="text-indigo-300">{instName}</span></> : <>Your whole institution, on one calm screen</>}
            </h2>
            <p className="mt-4 max-w-sm text-[15px] font-light leading-relaxed text-white/55">
              Set up in an afternoon. Bring your staff, {instType === 'training' ? 'learners' : 'students and parents'} along when you are ready.
            </p>
          </div>
          <ul className="relative space-y-4">
            {PITCH.map((p) => (
              <li key={p.text} className="flex items-center gap-3.5 text-[14.5px] font-light text-white/80">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                  <p.icon size={17} strokeWidth={1.4} className="text-indigo-300" />
                </span>
                {p.text}
              </li>
            ))}
          </ul>
          <div className="relative rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[12px] text-white/40">Your web address</p>
            <p className="mt-1 truncate font-mono text-[14px] text-white/85">
              {host.scheme}<span className="text-indigo-300">{effectiveSlug || 'your-institution'}</span>{host.suffix}
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="flex flex-1 justify-center overflow-y-auto p-6 sm:p-10">
          <div className="w-full max-w-lg py-2">
            <h1 className="text-[28px] font-extralight text-gray-900">Start your free trial</h1>
            <p className="mt-1 text-[14px] font-light text-gray-400"><TrialLine /></p>

            <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-7">
              {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-[13.5px] text-rose-700">{error}</div>}

              <fieldset className="space-y-4">
                <legend className="mb-3 text-[12px] uppercase tracking-[0.1em] text-gray-400">Your institution</legend>
                <div>
                  <span className={lab}>What kind of institution is it?</span>
                  <div role="radiogroup" aria-label="Institution type" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {TYPES.map((t) => {
                      const on = t.key === instType
                      return (
                        <button key={t.key} type="button" role="radio" aria-checked={on} onClick={() => setInstType(t.key)}
                          className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${on ? 'border-primary bg-primary/[0.04]' : 'border-gray-200 hover:border-gray-300'}`}>
                          <t.icon size={18} strokeWidth={1.4} className={on ? 'text-primary' : 'text-gray-400'} />
                          <span className="min-w-0">
                            <span className={`block text-[13.5px] font-light ${on ? 'text-gray-900' : 'text-gray-700'}`}>{t.label}</span>
                            <span className="block truncate text-[11.5px] font-light text-gray-400">{t.hint}</span>
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <label htmlFor="instName" className={lab}>Name of your {typeLabel}</label>
                  <div className="relative">
                    <School className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" strokeWidth={1.5} />
                    <input id="instName" type="text" value={instName} placeholder="e.g. Green Valley Public School" className={field(fieldErrors.instName)}
                      onChange={(e) => { setInstName(e.target.value); setFieldErrors((p) => ({ ...p, instName: '', slug: '' })) }} />
                  </div>
                  {err('instName')}
                </div>

                <div>
                  <label htmlFor="slug" className={lab}>Web address</label>
                  <div className={`flex h-11 items-center overflow-hidden rounded-lg border bg-white ${check.state === 'bad' || fieldErrors.slug ? 'border-rose-300' : check.state === 'ok' ? 'border-emerald-300' : 'border-gray-200'}`}>
                    <Globe2 className="ml-3 h-4 w-4 shrink-0 text-gray-300" strokeWidth={1.5} />
                    <input id="slug" className="h-full min-w-0 flex-1 bg-transparent px-2 text-[14px] text-gray-900 outline-none placeholder:text-gray-300" value={effectiveSlug} placeholder="your-institution"
                      autoCapitalize="none" spellCheck={false}
                      onChange={(e) => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSlugEdited(true); setFieldErrors((p) => ({ ...p, slug: '' })) }} />
                    <span className="whitespace-nowrap border-l border-gray-100 bg-gray-50 px-3 py-3 text-[13px] text-gray-400">{host.suffix}</span>
                  </div>
                  <p className="mt-1.5 min-h-[18px] text-[12.5px] font-light" aria-live="polite">
                    {check.state === 'checking' && <span className="inline-flex items-center gap-1.5 text-gray-400"><Loader2 size={12} className="animate-spin" /> Checking…</span>}
                    {check.state === 'ok' && <span className="inline-flex items-center gap-1.5 text-emerald-700"><Check size={13} strokeWidth={1.8} /> Available. Staff, parents and students will sign in here.</span>}
                    {check.state === 'bad' && (
                      <span className="text-rose-600">
                        {check.msg}
                        {check.suggestion && <> Try <button type="button" onClick={() => { setSlug(check.suggestion!); setSlugEdited(true) }} className="underline">{check.suggestion}</button>.</>}
                      </span>
                    )}
                    {check.state === 'idle' && !fieldErrors.slug && <span className="text-gray-400">Fills in from the name. You can change it.</span>}
                    {check.state !== 'bad' && fieldErrors.slug && <span className="text-rose-600">{fieldErrors.slug}</span>}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="learners" className={lab}>Learners (about)</label>
                    <select id="learners" className={plain} value={learners} onChange={(e) => setLearners(e.target.value)}>
                      <option value="">Choose…</option>
                      {LEARNERS.map((l) => <option key={l}>{l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="country" className={lab}>Country</label>
                    <select id="country" className={plain} value={country}
                      onChange={(e) => { setCountry(e.target.value); const tz = COUNTRIES.find((c) => c.name === e.target.value)?.tz; if (tz) setTimezone(tz) }}>
                      {COUNTRIES.map((c) => <option key={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="timezone" className={lab}>Timezone</label>
                    <select id="timezone" className={plain} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                      {tzOptions.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                </div>
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="mb-3 text-[12px] uppercase tracking-[0.1em] text-gray-400">About you</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="fullName" className={lab}>Your name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" strokeWidth={1.5} />
                      <input id="fullName" type="text" autoComplete="name" value={fullName} placeholder="e.g. Priya Sharma" className={field(fieldErrors.fullName)}
                        onChange={(e) => { setFullName(e.target.value); setFieldErrors((p) => ({ ...p, fullName: '' })) }} />
                    </div>
                    {err('fullName')}
                  </div>
                  <div>
                    <label htmlFor="email" className={lab}>Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" strokeWidth={1.5} />
                      <input id="email" type="email" autoComplete="email" value={email} placeholder="principal@yourschool.edu" className={field(fieldErrors.email)}
                        onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: '' })) }} />
                    </div>
                    {err('email')}
                  </div>
                </div>
                <div>
                  <label htmlFor="password" className={lab}>Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" strokeWidth={1.5} />
                    <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} placeholder="8 or more characters" className={`${field(fieldErrors.password)} pr-9`}
                      onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: '' })) }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                      {showPassword ? <EyeOff className="h-4 w-4" strokeWidth={1.5} /> : <Eye className="h-4 w-4" strokeWidth={1.5} />}
                    </button>
                  </div>
                  {err('password')}
                </div>
                <details className="group" open={!!refCode}>
                  <summary className="cursor-pointer list-none text-[12.5px] font-light text-gray-400 hover:text-gray-600">
                    Have a partner code? <span className="text-primary group-open:hidden">Add it</span>
                  </summary>
                  <input id="refCode" aria-label="Partner code" type="text" value={refCode} maxLength={12} autoCapitalize="characters" placeholder="From the partner who introduced you"
                    className={`mt-2 h-11 w-full rounded-lg border bg-white px-3 font-mono text-[14px] tracking-wider text-gray-900 outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-gray-300 ${fieldErrors.refCode || refState === 'invalid' ? 'border-rose-300' : 'border-gray-200 focus:border-primary/60'}`}
                    onChange={(e) => { setRefCode(e.target.value.toUpperCase()); setFieldErrors((p) => ({ ...p, refCode: '' })) }} />
                  {refState === 'valid' && <p className="mt-1 text-[12px] text-emerald-700">Introduced by {refName}.</p>}
                  {refState === 'invalid' && !fieldErrors.refCode && <p className="mt-1 text-[12px] text-rose-600">Code not found. Leave it blank if you are not sure.</p>}
                  {err('refCode')}
                </details>
              </fieldset>

              <div>
                <button type="submit" disabled={submitting} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[14.5px] font-light text-white transition-colors hover:bg-primary-dark disabled:opacity-60">
                  {submitting && <Loader2 size={16} className="animate-spin" />}
                  {submitting ? 'Setting up your institution…' : 'Create my institution'}
                </button>
                <p className="mt-3 text-center text-[12px] font-light text-gray-400">
                  By signing up you agree to our terms. Your institution&apos;s data is kept separate from every other institution.
                </p>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

/** useSearchParams needs a Suspense boundary so the page can still be prerendered. */
export default function RegisterPage() {
  return <Suspense fallback={null}><RegisterForm /></Suspense>
}

/** "Free for N days": the trial length set in admin (Settings → Plans). */
function TrialLine() {
  const [days, setDays] = useState<number | null>(null)
  useEffect(() => {
    fetch(`${API_BASE}/platform/pricing`).then((r) => (r.ok ? r.json() : null))
      .then((p) => setDays(p?.trial?.trial_days ?? p?.trial_days ?? null)).catch(() => {})
  }, [])
  return <>{days ? `Free for ${days} days.` : 'Start free.'} No card needed. Set up in minutes.</>
}
