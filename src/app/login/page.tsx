'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Mail, Lock, Users, Fingerprint, Wallet, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast-context'
import { API_BASE } from '@/lib/api'

const ROOT_DOMAINS = (
  process.env.NEXT_PUBLIC_ROOT_DOMAINS ?? "campusly.app,lvh.me,localhost"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const RESERVED_SUBDOMAINS = new Set(["www", "api", "admin", "app"]);

function companySlug(): string | null {
  if (typeof window === "undefined") return null;
  const hostname = window.location.hostname.toLowerCase();
  for (const root of ROOT_DOMAINS) {
    if (hostname.endsWith(`.${root}`)) {
      const sub = hostname.slice(0, -(root.length + 1));
      if (sub && !RESERVED_SUBDOMAINS.has(sub) && !sub.includes(".")) return sub;
    }
  }
  return null;
}

const SSO_ERRORS: Record<string, string> = {
  no_account: "We couldn't find an account with that email. Ask your HR team to add you, or sign in with your password.",
  not_enabled: "Your company hasn't switched on this sign-in option. Sign in with your password.",
  domain_not_allowed: "Your company only allows sign-in with its own email domain. Use your work account.",
  email_not_verified: "That account's email address isn't verified. Use another account or your password.",
  many_companies: "This email is used at more than one company. Sign in from your company's own address.",
  company_disabled: "This company account has been disabled. Contact support.",
  guest_account: "Guest accounts can't sign in. Use your own organisation's Microsoft account.",
  not_configured: "This sign-in option isn't available yet.",
  expired: "The sign-in took too long or was started elsewhere. Please try again.",
  cancelled: "Sign-in was cancelled.",
}

function isOnSubdomain(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname.toLowerCase();
  for (const root of ROOT_DOMAINS) {
    if (hostname === root) return false;
    if (hostname.endsWith(`.${root}`)) {
      const sub = hostname.slice(0, -(root.length + 1));
      if (!sub || RESERVED_SUBDOMAINS.has(sub) || sub.includes(".")) return false;
      return true;
    }
  }
  return false;
}

export default function LoginPage() {
  const router = useRouter()
  const auth = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [onSubdomain, setOnSubdomain] = useState(false)
  const toast = useToast()

  const [sso, setSso] = useState<{ google: boolean; microsoft: boolean }>({ google: false, microsoft: false })

  useEffect(() => {
    setOnSubdomain(isOnSubdomain())
    const params = new URLSearchParams(window.location.search)
    const code = params.get('sso_error')
    if (code) {
      const names = params.get('companies')
      setError((SSO_ERRORS[code] ?? 'Sign-in did not work. Please try again.') + (code === 'many_companies' && names ? ` (${names})` : ''))
    }
    const slug = companySlug()
    fetch(`${API_BASE}/auth/sso/options`, { headers: slug ? { 'X-Company-Slug': slug } : {} })
      .then((r) => (r.ok ? r.json() : null)).then((r) => { if (r) setSso(r) }).catch(() => {})
  }, [])

  function startSso(provider: 'google' | 'microsoft') {
    const slug = companySlug()
    const q = new URLSearchParams()
    if (slug) q.set('slug', slug)
    if (email.includes('@')) q.set('hint', email.trim())
    window.location.href = `${API_BASE}/auth/sso/${provider}/start?${q}`
  }

  function validate() {
    const errors: Record<string, string> = {}
    if (!email.trim()) errors.email = 'Email is required'
    if (!password) errors.password = 'Password is required'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setIsSubmitting(true)
    try {
      await auth.login(email, password)
      router.push('/dashboard')
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (/does not exist|has been disabled|company's address|company's url/i.test(message)) {
        setError(message)
      } else if (message.toLowerCase().includes('network') || message.toLowerCase().includes('fetch')) {
        setError('Unable to connect to server. Please check your connection and try again.')
      } else {
        setError('Invalid email or password. Please try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Common top bar */}
      <div className="bg-white px-8 py-3 flex items-center justify-between border-b border-gray-100">
        <Link href="/"><img src="/logo.svg" alt="Campusly" className="h-10" /></Link>
        <span className="text-xs text-gray-400 hidden sm:block">HR and payroll for Indian companies</span>
      </div>

      <div className="flex flex-1">
      {/* Left panel */}
      <div className="hidden flex-col justify-between bg-[#16161d] p-12 lg:flex lg:w-1/2">
        <div>
          <p className="text-[12px] uppercase tracking-[0.1em] text-indigo-300/80">Campusly</p>
          <h2 className="mt-3 max-w-md text-[34px] font-extralight leading-tight text-white">Welcome back</h2>
          <p className="mt-3 max-w-sm text-[15px] font-light text-white/50">Sign in to manage your people, attendance, leave and payroll.</p>
        </div>
        <ul className="grid max-w-lg gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2">
          {[
            { icon: Users, title: "People", text: "Records, documents and history" },
            { icon: Fingerprint, title: "Time", text: "Attendance, shifts and leave" },
            { icon: Wallet, title: "Payroll", text: "Payslips, PF, ESI, PT and TDS" },
            { icon: ShieldCheck, title: "Compliance", text: "Indian law built in" },
          ].map((h) => (
            <li key={h.title} className="bg-[#16161d] p-5">
              <h.icon size={20} strokeWidth={1.3} className="text-indigo-300" />
              <p className="mt-3 text-[14.5px] font-light text-white">{h.title}</p>
              <p className="mt-1 text-[13px] font-light text-white/45">{h.text}</p>
            </li>
          ))}
        </ul>
        <p className="text-[12px] font-light text-white/30">&copy; {new Date().getFullYear()} Campusly</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-white overflow-y-auto">
        <div className="w-full max-w-md">
          <div className="mb-6">
            <h2 className="text-[28px] font-extralight text-gray-900">Sign in</h2>
            <p className="mt-1 text-sm text-gray-400">
              Access your Campusly dashboard
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {error && (
              <div className="rounded-lg border border-error/20 bg-error/5 px-4 py-2.5 text-sm text-error">
                {error}
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-gray-500 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                <input
                  id="email" type="email" value={email}
                  onChange={(e) => { setEmail(e.target.value); setFieldErrors((prev) => ({ ...prev, email: '' })); }}
                  placeholder="you@yourcompany.com"
                  className={`w-full pl-9 pr-3 py-2.5 border rounded-lg bg-gray-50 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:bg-white transition-all ${fieldErrors.email ? 'border-error focus:ring-error/20' : 'border-gray-200 focus:ring-primary/20 focus:border-primary'}`}
                />
              </div>
              {fieldErrors.email && <p className="mt-0.5 text-[11px] text-error">{fieldErrors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-gray-500 mb-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
                <input
                  id="password" type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(e) => { setPassword(e.target.value); setFieldErrors((prev) => ({ ...prev, password: '' })); }}
                  placeholder="Enter your password"
                  className={`w-full pl-9 pr-9 py-2.5 border rounded-lg bg-gray-50 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:bg-white transition-all ${fieldErrors.password ? 'border-error focus:ring-error/20' : 'border-gray-200 focus:ring-primary/20 focus:border-primary'}`}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {fieldErrors.password && <p className="mt-0.5 text-[11px] text-error">{fieldErrors.password}</p>}
            </div>

            {/* Remember me & Forgot */}
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox" checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary/20 cursor-pointer accent-primary"
                />
                <span className="text-xs text-gray-500">Remember me</span>
              </label>
              <Link href="/forgot-password" className="text-xs font-medium text-primary hover:text-primary-dark transition-colors">
                Forgot password?
              </Link>
            </div>

            {/* Submit */}
            <button
              type="submit" disabled={isSubmitting}
              className="w-full py-3 px-4 bg-primary text-white font-light rounded-lg hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing In...
                </span>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {(sso.google || sso.microsoft) && (<>
          {/* Divider */}
          <div className="relative mt-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-100" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-white text-gray-400">or continue with</span>
            </div>
          </div>

          <div className="mt-5 space-y-2.5">
            {sso.google && (
              <button type="button" onClick={() => startSso('google')}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-200 rounded-xl bg-white text-gray-700 font-light hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200 cursor-pointer">
                <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Sign in with Google
              </button>
            )}
            {sso.microsoft && (
              <button type="button" onClick={() => startSso('microsoft')}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 border border-gray-200 rounded-xl bg-white text-gray-700 font-light hover:bg-gray-50 hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all duration-200 cursor-pointer">
                <svg className="w-5 h-5" viewBox="0 0 21 21" aria-hidden="true">
                  <rect x="1" y="1" width="9" height="9" fill="#F25022" /><rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00A4EF" /><rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                </svg>
                Sign in with Microsoft
              </button>
            )}
          </div>
          </>)}

          {/* Sign up link: main site only (employees can't create a company from a company address) */}
          {!onSubdomain && (
            <p className="text-center text-sm text-gray-400 mt-5">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-primary hover:text-primary-dark transition-colors">
                Sign up
              </Link>
            </p>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}
