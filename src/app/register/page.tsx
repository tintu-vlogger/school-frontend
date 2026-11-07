'use client'

import { useState, useEffect, FormEvent, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, User, Mail, Lock, Building2, Users, Fingerprint, Wallet, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast-context'
import { api, API_BASE } from '@/lib/api'


const HIGHLIGHTS = [
  { icon: Users, title: 'People', text: 'Every employee record, document and change in one place.' },
  { icon: Fingerprint, title: 'Attendance and leave', text: 'From devices, web and mobile, with your own rules.' },
  { icon: Wallet, title: 'Payroll', text: 'Payslips, PF, ESI, PT, TDS and bank files every month.' },
  { icon: ShieldCheck, title: 'Compliant by default', text: 'Indian labour and tax law built in, kept up to date.' },
]

function RegisterForm() {
  const router = useRouter()
  const auth = useAuth()
  const toast = useToast()
  const searchParams = useSearchParams()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

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

  const passwordsMatch = confirmPassword.length === 0 || password === confirmPassword

  function validate() {
    const e: Record<string, string> = {}
    if (!fullName.trim()) e.fullName = 'Enter your name'
    if (!email.trim()) e.email = 'Enter your work email'
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'This email doesn\'t look right'
    if (!password) e.password = 'Choose a password'
    else if (password.length < 6) e.password = 'Use at least 6 characters'
    if (!confirmPassword) e.confirmPassword = 'Type the password again'
    else if (password !== confirmPassword) e.confirmPassword = 'The passwords don\'t match'
    if (!companyName.trim()) e.companyName = 'Enter your company name'
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
      await auth.register({
        email,
        password,
        full_name: fullName,
        company_name: companyName,
        ref_code: refCode.replace(/[^A-Z0-9]/g, '') || undefined,
      })
      toast.success('Account created')
      router.push('/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-up failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const field = (err?: string) =>
    `h-11 w-full rounded-lg border bg-white pl-9 pr-3 text-[14px] text-gray-900 placeholder:text-gray-300 outline-none transition-colors ${err ? 'border-rose-300' : 'border-gray-200 focus:border-primary/60'}`

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-6 py-3 sm:px-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <Link href="/"><img src="/logo.svg" alt="Next Gen HRMS" className="h-9" /></Link>
        <span className="hidden text-[12.5px] text-gray-400 sm:block">HR and payroll for Indian companies</span>
      </div>

      <div className="flex flex-1">
        {/* Left panel */}
        <div className="relative hidden flex-col justify-between bg-[#16161d] p-12 lg:flex lg:w-1/2">
          <div>
            <p className="text-[12px] uppercase tracking-[0.1em] text-indigo-300/80">Next Gen HRMS</p>
            <h2 className="mt-3 max-w-md text-[34px] font-extralight leading-tight text-white">
              {companyName ? <>Set up HR for <span className="text-indigo-300">{companyName}</span></> : <>Run HR and payroll in one place</>}
            </h2>
            <p className="mt-3 max-w-sm text-[15px] font-light text-white/50">From hiring to final settlement, with Indian law built in.</p>
          </div>
          <ul className="grid max-w-lg gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="bg-[#16161d] p-5">
                <h.icon size={20} strokeWidth={1.3} className="text-indigo-300" />
                <p className="mt-3 text-[14.5px] font-light text-white">{h.title}</p>
                <p className="mt-1 text-[13px] font-light text-white/45">{h.text}</p>
              </li>
            ))}
          </ul>
          <p className="text-[12px] font-light text-white/30">&copy; {new Date().getFullYear()} Next Gen HRMS</p>
        </div>

        {/* Form */}
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-6 sm:p-10">
          <div className="w-full max-w-md">
            <h1 className="text-[28px] font-extralight text-gray-900">Create your account</h1>
            <p className="mt-1 text-[14px] font-light text-gray-400"><TrialLine /></p>

            <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
              {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-[13.5px] text-rose-700">{error}</div>}

              <div>
                <label htmlFor="fullName" className="mb-1 block text-[12.5px] font-light text-gray-500">Your name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" strokeWidth={1.5} />
                  <input id="fullName" type="text" value={fullName} placeholder="e.g. Priya Sharma" className={field(fieldErrors.fullName)}
                    onChange={(e) => { setFullName(e.target.value); setFieldErrors((p) => ({ ...p, fullName: '' })) }} />
                </div>
                {fieldErrors.fullName && <p className="mt-1 text-[12px] text-rose-600">{fieldErrors.fullName}</p>}
              </div>

              <div>
                <label htmlFor="email" className="mb-1 block text-[12.5px] font-light text-gray-500">Work email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" strokeWidth={1.5} />
                  <input id="email" type="email" value={email} placeholder="priya@yourcompany.com" className={field(fieldErrors.email)}
                    onChange={(e) => { setEmail(e.target.value); setFieldErrors((p) => ({ ...p, email: '' })) }} />
                </div>
                {fieldErrors.email && <p className="mt-1 text-[12px] text-rose-600">{fieldErrors.email}</p>}
              </div>

              <div>
                <label htmlFor="companyName" className="mb-1 block text-[12.5px] font-light text-gray-500">Company name</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" strokeWidth={1.5} />
                  <input id="companyName" type="text" value={companyName} placeholder="e.g. Acme Tools Private Limited" className={field(fieldErrors.companyName)}
                    onChange={(e) => { setCompanyName(e.target.value); setFieldErrors((p) => ({ ...p, companyName: '' })) }} />
                </div>
                {fieldErrors.companyName && <p className="mt-1 text-[12px] text-rose-600">{fieldErrors.companyName}</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="password" className="mb-1 block text-[12.5px] font-light text-gray-500">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" strokeWidth={1.5} />
                    <input id="password" type={showPassword ? 'text' : 'password'} value={password} placeholder="6 or more characters" className={`${field(fieldErrors.password)} pr-9`}
                      onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: '' })) }} />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                      {showPassword ? <EyeOff className="h-4 w-4" strokeWidth={1.5} /> : <Eye className="h-4 w-4" strokeWidth={1.5} />}
                    </button>
                  </div>
                  {fieldErrors.password && <p className="mt-1 text-[12px] text-rose-600">{fieldErrors.password}</p>}
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="mb-1 block text-[12.5px] font-light text-gray-500">Confirm password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" strokeWidth={1.5} />
                    <input id="confirmPassword" type={showConfirm ? 'text' : 'password'} value={confirmPassword} placeholder="Type it again" className={`${field(!passwordsMatch ? 'x' : fieldErrors.confirmPassword)} pr-9`}
                      onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors((p) => ({ ...p, confirmPassword: '' })) }} />
                    <button type="button" onClick={() => setShowConfirm(!showConfirm)} aria-label={showConfirm ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                      {showConfirm ? <EyeOff className="h-4 w-4" strokeWidth={1.5} /> : <Eye className="h-4 w-4" strokeWidth={1.5} />}
                    </button>
                  </div>
                  {!passwordsMatch && <p className="mt-1 text-[12px] text-rose-600">The passwords don&apos;t match</p>}
                  {fieldErrors.confirmPassword && passwordsMatch && <p className="mt-1 text-[12px] text-rose-600">{fieldErrors.confirmPassword}</p>}
                </div>
              </div>

              <div>
                <label htmlFor="refCode" className="mb-1 block text-[12.5px] font-light text-gray-500">Partner code <span className="text-gray-300">(optional)</span></label>
                <input id="refCode" type="text" value={refCode} maxLength={12} autoCapitalize="characters" placeholder="From the partner who introduced you to Next Gen HRMS"
                  className={`h-11 w-full rounded-lg border bg-white px-3 font-mono text-[14px] tracking-wider text-gray-900 outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-gray-300 ${fieldErrors.refCode || refState === 'invalid' ? 'border-rose-300' : 'border-gray-200 focus:border-primary/60'}`}
                  onChange={(e) => { setRefCode(e.target.value.toUpperCase()); setFieldErrors((p) => ({ ...p, refCode: '' })) }} />
                {refState === 'valid' && <p className="mt-1 text-[12px] text-emerald-700">Introduced by {refName}.</p>}
                {refState === 'invalid' && !fieldErrors.refCode && <p className="mt-1 text-[12px] text-rose-600">Code not found. Leave it blank if you are not sure.</p>}
                {fieldErrors.refCode && <p className="mt-1 text-[12px] text-rose-600">{fieldErrors.refCode}</p>}
              </div>

              <button type="submit" disabled={submitting} className="h-11 w-full rounded-lg bg-primary text-[14.5px] font-light text-white transition-colors hover:bg-primary-dark disabled:opacity-60">
                {submitting ? 'Creating your account…' : 'Create account'}
              </button>
            </form>

            <div className="relative mt-5">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div>
              <div className="relative flex justify-center text-[12px]"><span className="bg-white px-3 font-light text-gray-400">or</span></div>
            </div>

            <button type="button"
              onClick={async () => {
                try {
                  const res = await fetch(`${API_BASE}/auth/google/url`)
                  const data = await res.json()
                  if (data.url) window.location.href = data.url
                } catch { /* ignore */ }
              }}
              className="mt-5 flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-gray-200 bg-white text-[14px] font-light text-gray-700 transition-colors hover:border-gray-300">
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Sign up with Google
            </button>

            <p className="mt-5 text-center text-[14px] font-light text-gray-400">
              Already have an account? <Link href="/login" className="text-primary hover:text-primary-dark">Sign in</Link>
            </p>
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
  return <>{days ? `Free for ${days} days.` : 'Start free.'} No credit card needed.</>
}
