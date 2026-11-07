'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Eye, EyeOff, Mail, Lock, KeyRound, CalendarCheck } from 'lucide-react'
import { useToast } from '@/lib/toast-context'
import { api } from '@/lib/api'

export default function ForgotPasswordPage() {
  const router = useRouter()
  const toast = useToast()

  const [step, setStep] = useState<1 | 2>(1)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [debugCode, setDebugCode] = useState('')

  function validateEmail() {
    const errors: Record<string, string> = {}
    if (!email.trim()) {
      errors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = 'Please enter a valid email'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  function validateReset() {
    const errors: Record<string, string> = {}
    if (!code.trim()) errors.code = 'Reset code is required'
    if (!newPassword) {
      errors.newPassword = 'New password is required'
    } else if (newPassword.length < 6) {
      errors.newPassword = 'Password must be at least 6 characters'
    }
    if (!confirmPassword) {
      errors.confirmPassword = 'Please confirm your password'
    } else if (newPassword !== confirmPassword) {
      errors.confirmPassword = 'Passwords do not match'
    }
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSendCode(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!validateEmail()) return
    setIsSubmitting(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await api.post<any>('/auth/forgot-password', { email })
      if (res?.dev_code) {
        setDebugCode(res.dev_code)
      }
      setStep(2)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResetPassword(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!validateReset()) return
    setIsSubmitting(true)
    try {
      await api.post('/auth/reset-password', {
        email,
        code,
        new_password: newPassword,
      })
      toast.success('Password reset! Please login.')
      router.push('/login')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left illustration panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-white" />
          <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-white" />
          <div className="absolute top-1/2 left-1/3 w-48 h-48 rounded-full bg-white" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
              <CalendarCheck className="w-6 h-6 text-primary" />
            </div>
            <span className="text-white text-2xl font-bold">Campusly</span>
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <h1 className="text-4xl font-bold text-white leading-tight">
            Reset your
            <br />
            password
          </h1>
          <p className="text-indigo-200 text-lg max-w-md">
            Don&apos;t worry, it happens to the best of us. We&apos;ll help you get
            back into your account in no time.
          </p>
          <div className="flex gap-8 pt-4">
            <div>
              <p className="text-3xl font-bold text-white">Staff</p>
              <p className="text-indigo-200 text-sm">Teachers and office</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-white">Parents</p>
              <p className="text-indigo-200 text-sm">And students</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-white">24/7</p>
              <p className="text-indigo-200 text-sm">Any time</p>
            </div>
          </div>
        </div>

        <div className="relative z-10">
          <p className="text-indigo-300 text-sm">
            &copy; {new Date().getFullYear()} Campusly. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-gray-50">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 justify-center">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
              <CalendarCheck className="w-6 h-6 text-white" />
            </div>
            <span className="text-gray-900 text-2xl font-bold">Campusly</span>
          </div>

          {step === 1 ? (
            <>
              <div className="text-center lg:text-left">
                <h2 className="text-3xl font-bold text-gray-900">Forgot password?</h2>
                <p className="mt-2 text-gray-500">
                  Enter the email you sign in with and we&apos;ll send you a reset code. Signed in with a username? Ask your institution&apos;s office to reset it.
                </p>
              </div>

              <form onSubmit={handleSendCode} noValidate className="space-y-5">
                {error && (
                  <div className="rounded-xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
                    {error}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700 mb-1.5"
                  >
                    Email <span className="text-error">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setFieldErrors((prev) => ({ ...prev, email: '' })); }}
                      placeholder="john@example.com"
                      className={`w-full pl-11 pr-4 py-2.5 border rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all duration-200 ${fieldErrors.email ? 'border-error focus:ring-error/20 focus:border-error' : 'border-gray-200 focus:ring-primary/20 focus:border-primary'}`}
                    />
                  </div>
                  {fieldErrors.email && <p className="mt-1 text-xs text-error">{fieldErrors.email}</p>}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Sending Code...
                    </span>
                  ) : (
                    'Send Reset Code'
                  )}
                </button>
              </form>

              <p className="text-center text-sm text-gray-500">
                Remember your password?{' '}
                <Link
                  href="/login"
                  className="font-semibold text-primary hover:text-primary-dark transition-colors"
                >
                  Back to login
                </Link>
              </p>
            </>
          ) : (
            <>
              <div className="text-center lg:text-left">
                <h2 className="text-3xl font-bold text-gray-900">Reset password</h2>
                <p className="mt-2 text-gray-500">
                  Code sent to <span className="font-medium text-gray-700">{email}</span>
                </p>
              </div>

              {debugCode && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <span className="font-medium">Development only (no mail server):</span> your reset code is <span className="font-mono font-bold">{debugCode}</span>
                </div>
              )}

              <form onSubmit={handleResetPassword} noValidate className="space-y-5">
                {error && (
                  <div className="rounded-xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
                    {error}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="code"
                    className="block text-sm font-medium text-gray-700 mb-1.5"
                  >
                    Reset Code <span className="text-error">*</span>
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={code}
                      onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setFieldErrors((prev) => ({ ...prev, code: '' })); }}
                      placeholder="Enter 6-digit code"
                      className={`w-full pl-11 pr-4 py-2.5 border rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all duration-200 text-lg tracking-[0.3em] font-mono ${fieldErrors.code ? 'border-error focus:ring-error/20 focus:border-error' : 'border-gray-200 focus:ring-primary/20 focus:border-primary'}`}
                    />
                  </div>
                  {fieldErrors.code && <p className="mt-1 text-xs text-error">{fieldErrors.code}</p>}
                </div>

                <div>
                  <label
                    htmlFor="newPassword"
                    className="block text-sm font-medium text-gray-700 mb-1.5"
                  >
                    New Password <span className="text-error">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="newPassword"
                      type={showNewPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setFieldErrors((prev) => ({ ...prev, newPassword: '' })); }}
                      placeholder="Enter new password"
                      className={`w-full pl-11 pr-11 py-2.5 border rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all duration-200 ${fieldErrors.newPassword ? 'border-error focus:ring-error/20 focus:border-error' : 'border-gray-200 focus:ring-primary/20 focus:border-primary'}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showNewPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  {fieldErrors.newPassword && <p className="mt-1 text-xs text-error">{fieldErrors.newPassword}</p>}
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-gray-700 mb-1.5"
                  >
                    Confirm Password <span className="text-error">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setFieldErrors((prev) => ({ ...prev, confirmPassword: '' })); }}
                      placeholder="Confirm new password"
                      className={`w-full pl-11 pr-11 py-2.5 border rounded-xl bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 transition-all duration-200 ${fieldErrors.confirmPassword ? 'border-error focus:ring-error/20 focus:border-error' : 'border-gray-200 focus:ring-primary/20 focus:border-primary'}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-5 h-5" />
                      ) : (
                        <Eye className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && <p className="mt-1 text-xs text-error">{fieldErrors.confirmPassword}</p>}
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/20 focus:ring-offset-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Resetting Password...
                    </span>
                  ) : (
                    'Reset Password'
                  )}
                </button>
              </form>

              <p className="text-center text-sm text-gray-500">
                <button
                  onClick={() => { setStep(1); setError(''); setFieldErrors({}); setCode(''); setNewPassword(''); setConfirmPassword(''); setDebugCode(''); }}
                  className="font-semibold text-primary hover:text-primary-dark transition-colors cursor-pointer"
                >
                  Use a different email
                </button>
                {' | '}
                <Link
                  href="/login"
                  className="font-semibold text-primary hover:text-primary-dark transition-colors"
                >
                  Back to login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
