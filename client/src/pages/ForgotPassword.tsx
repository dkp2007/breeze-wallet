import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { AuthShell, SetupNotice } from '../components/AuthShell'
import { ErrorNote } from '../components/ui'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`
      })
      if (resetError) {
        throw new Error(resetError.message)
      }
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset email')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter your email and we will send you a link to pick a new one."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700">
            Back to sign in
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <SetupNotice />
        {sent ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <Mail className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              <div>
                <p className="font-semibold text-emerald-800">Check your email</p>
                <p className="mt-0.5 text-sm text-emerald-700">
                  If an account exists for {email.trim().toLowerCase()}, a link to choose a new password is on its way.
                </p>
              </div>
            </div>
            <p className="text-sm text-slate-500">Didn't get it? Check your spam folder, wait a minute, and try again.</p>
            <button type="button" className="btn-ghost w-full" onClick={() => setSent(false)}>
              Try a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="label">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                className="input"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <ErrorNote message={error} />
            <button type="submit" disabled={busy} className="btn-primary w-full py-3">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send reset link
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  )
}
