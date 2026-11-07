'use client'

import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/provider'
import { API_BASE } from '@/lib/api'

export default function AuthCallbackPage() {
  const { t } = useI18n()
  const [status, setStatus] = useState(t('auth.processing'))

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      const token = params.get('token')
      const code = params.get('code')
      const redirect = params.get('redirect') || '/dashboard'

      if (code) {
        // Google / Microsoft sign-in: swap the one-time code for a session
        setStatus(t('auth.redirecting'))
        fetch(`${API_BASE}/auth/sso/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((r) => { localStorage.setItem('hrms_token', r.access_token); window.location.replace('/dashboard') })
          .catch(() => window.location.replace('/login?sso_error=expired'))
      } else if (token) {
        localStorage.setItem('hrms_token', token)
        setStatus(t('auth.redirecting'))
        // Small delay to ensure localStorage is written before navigation
        setTimeout(() => {
          window.location.replace(redirect)
        }, 100)
      } else {
        setStatus(t('auth.noToken'))
        setTimeout(() => {
          window.location.replace('/login')
        }, 500)
      }
    } catch (err) {
      setStatus(t('auth.errorRedirect'))
      setTimeout(() => {
        window.location.replace('/login')
      }, 1000)
    }
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="mt-4 text-sm text-gray-400">{status}</p>
      </div>
    </div>
  )
}
